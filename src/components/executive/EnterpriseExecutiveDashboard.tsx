import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Target,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Calendar,
  Building2,
  Send,
  Download,
  FileText,
  RefreshCw,
  X,
  BarChart3,
  Activity,
  Wallet,
  Landmark,
  Utensils,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Flame,
  Tag,
  Gift,
  Trash2,
  Users,
  PieChart as PieChartIcon,
  CloudDownload,
  Printer,
  Receipt,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  History
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { MenuItem, Order } from '../../types';
import { getLocalDateStr } from '../../utils/dateUtils';
import { exportToPDF } from '../../utils/exportDocument';
import { printReceiptViaWindow } from '../../utils/printReceipt';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO } from '../../assets/logo';

interface EnterpriseExecutiveDashboardProps {
  onNavigateToTab?: (tab: string) => void;
}

export const EnterpriseExecutiveDashboard: React.FC<EnterpriseExecutiveDashboardProps> = ({ onNavigateToTab }) => {
  const {
    orders,
    expenses,
    ingredients,
    branches,
    menuItems,
    currentBranch,
    settings,
    currentUser,
    updateMenuItem,
    sendDailySummaryNotification,
    pullCloudOrders,
    pullCloudAllData
  } = usePOS();

  // Date Presets & Filter States (Using local Thailand timezone)
  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);
  const [datePreset, setDatePreset] = useState<'today' | '7days' | '30days' | 'this_month' | 'this_year' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return getLocalDateStr(d);
  });
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

  // Sales Overview Granularity (Daily, Weekly, Monthly, Yearly)
  const [salesOverviewPeriod, setSalesOverviewPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [activeMetrics, setActiveMetrics] = useState<{ sales: boolean; profit: boolean; cost: boolean; orders: boolean }>({
    sales: true,
    profit: true,
    cost: true,
    orders: false
  });

  const [actionNotification, setActionNotification] = useState<string | null>(null);
  const [discountModalItem, setDiscountModalItem] = useState<MenuItem | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(10);

  // Enterprise Feature States
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState<boolean>(false);
  const [telegramSending, setTelegramSending] = useState<boolean>(false);
  const [telegramSentSuccess, setTelegramSentSuccess] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isPullingCloud, setIsPullingCloud] = useState<boolean>(false);
  const [liveLastUpdated, setLiveLastUpdated] = useState<string>(new Date().toLocaleTimeString('th-TH'));

  // Section 14: Historical Orders & Receipts Log States
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'served' | 'cancelled'>('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | 'cash' | 'promptpay' | 'credit' | 'transfer'>('all');
  const [orderPage, setOrderPage] = useState<number>(1);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const orderPageSize = 15;

  // Refresh with Cloud Sync
  const handleRefresh = async () => {
    setLiveLastUpdated(new Date().toLocaleTimeString('th-TH'));
    if (pullCloudAllData || pullCloudOrders) {
      setIsPullingCloud(true);
      try {
        if (pullCloudAllData) {
          const res = await pullCloudAllData();
          if (res.success) {
            setActionNotification(`ซิงค์ข้อมูลจาก Cloud สำเร็จ (ยอดขาย: ${res.ordersCount}, วัตถุดิบ: ${res.ingredientsCount}, เมนู: ${res.menuItemsCount})`);
          } else {
            setActionNotification('ข้อมูลเป็นปัจจุบันแล้ว');
          }
        } else {
          const res = await pullCloudOrders();
          if (res.count > 0) {
            setActionNotification(`ดึงข้อมูลยอดขายจาก Cloud สำเร็จ (+${res.count} รายการ)`);
          } else {
            setActionNotification('ข้อมูลยอดขายเป็นปัจจุบันแล้ว');
          }
        }
      } catch (e) {
        console.warn('Pull cloud orders error:', e);
      } finally {
        setIsPullingCloud(false);
        setTimeout(() => setActionNotification(null), 3500);
      }
    }
  };

  // Export Order History to CSV
  const handleExportOrdersCSV = () => {
    if (filteredOrderHistory.length === 0) return;
    const headers = ['วันที่', 'เวลา', 'เลขที่บิล', 'สาขา', 'โต๊ะ/ประเภท', 'รายการอาหาร', 'ช่องทางชำระ', 'สถานะ', 'ยอดรวมสุทธิ'];
    const rows = filteredOrderHistory.map(o => {
      const d = o.createdAt ? new Date(o.createdAt) : new Date();
      const dateStr = d.toLocaleDateString('th-TH');
      const timeStr = d.toLocaleTimeString('th-TH');
      const branchName = branches.find(b => b.id === o.branchId)?.name || currentBranch.name;
      const tableStr = o.tableNumber ? `โต๊ะ ${o.tableNumber}` : 'สั่งกลับบ้าน';
      const itemsStr = (o.items || []).map(i => `${i.menuItem?.name || ''} x${i.quantity}`).join('; ');
      const payStr = o.paymentMethod === 'cash' ? 'เงินสด' : o.paymentMethod === 'promptpay' ? 'QR Code' : o.paymentMethod;
      const statusStr = o.status === 'served' ? 'สำเร็จ' : 'ยกเลิก';
      const total = o.grandTotal || 0;
      return [dateStr, timeStr, o.orderNumber || '', branchName, tableStr, `"${itemsStr.replace(/"/g, '""')}"`, payStr, statusStr, total];
    });
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Order_History_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Order Receipt
  const handlePrintOrder = async (order: Order) => {
    try {
      const branchObj = branches.find(b => b.id === order.branchId) || currentBranch;
      await printReceiptViaWindow(order, branchObj, settings, {
        cashierName: currentUser?.name || 'Cashier / Executive',
        documentTitle: 'ใบเสร็จรับเงิน (พิมพ์ซ้ำ)'
      });
      setActionNotification(`สั่งพิมพ์ใบเสร็จ #${order.orderNumber || order.id} เรียบร้อย`);
    } catch (err) {
      console.warn('Print order failed:', err);
      setActionNotification('เกิดข้อผิดพลาดในการพิมพ์ใบเสร็จ');
    } finally {
      setTimeout(() => setActionNotification(null), 3000);
    }
  };

  // Date Preset Switcher
  const handlePresetChange = (preset: 'today' | '7days' | '30days' | 'this_month' | 'this_year' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    let s = new Date();
    let e = new Date();

    if (preset === 'today') {
      s = now;
      e = now;
    } else if (preset === '7days') {
      s = new Date(now);
      s.setDate(s.getDate() - 6);
      e = now;
    } else if (preset === '30days') {
      s = new Date(now);
      s.setDate(s.getDate() - 29);
      e = now;
    } else if (preset === 'this_month') {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
      e = now;
    } else if (preset === 'this_year') {
      s = new Date(now.getFullYear(), 0, 1);
      e = now;
    } else {
      return;
    }

    setStartDate(getLocalDateStr(s));
    setEndDate(getLocalDateStr(e));
  };

  // -------------------------------------------------------------
  // Dynamic Real Orders & Expenses Filtering (Local Timezone Aware)
  // -------------------------------------------------------------
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
      if (startDate && oDate && oDate < startDate) return false;
      if (endDate && oDate && oDate > endDate) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, startDate, endDate, selectedBranchId]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const eDate = e.date ? getLocalDateStr(e.date) : '';
      if (startDate && eDate && eDate < startDate) return false;
      if (endDate && eDate && eDate > endDate) return false;
      if (selectedBranchId !== 'all' && e.branchId && e.branchId !== selectedBranchId) return false;
      return true;
    });
  }, [expenses, startDate, endDate, selectedBranchId]);

  const todayOrders = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
      if (oDate !== todayStr) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, selectedBranchId, todayStr]);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateStr(d);
  }, []);

  const yesterdayOrders = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
      if (oDate !== yesterdayStr) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, selectedBranchId, yesterdayStr]);

  const todayExpensesList = useMemo(() => {
    return expenses.filter(e => {
      const eDate = e.date ? getLocalDateStr(e.date) : '';
      if (eDate !== todayStr) return false;
      if (selectedBranchId !== 'all' && e.branchId && e.branchId !== selectedBranchId) return false;
      return true;
    });
  }, [expenses, selectedBranchId, todayStr]);

  // -------------------------------------------------------------
  // Real Financial Calculations
  // -------------------------------------------------------------
  const calculateOrdersFoodCost = (orderList: typeof orders) => {
    return orderList.reduce((sum, o) => {
      const orderCost = (o.items || []).reduce((iSum, item) => {
        const mi = menuItems.find(m => m.id === item.menuItem.id) || item.menuItem;
        const unitCost = mi?.costPrice !== undefined && mi.costPrice > 0 ? mi.costPrice : (item.totalPrice * 0.35 / Math.max(1, item.quantity));
        return iSum + (unitCost * item.quantity);
      }, 0);
      return sum + orderCost;
    }, 0);
  };

  // Section 1 Core KPIs (Today Real Data)
  const todaySales = useMemo(() => {
    return todayOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  }, [todayOrders]);

  const yesterdaySales = useMemo(() => {
    return yesterdayOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  }, [yesterdayOrders]);

  const salesGrowthTodayPct = useMemo(() => {
    if (yesterdaySales === 0 && todaySales > 0) return 100;
    if (yesterdaySales === 0) return 0;
    return Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100);
  }, [todaySales, yesterdaySales]);

  const todayFoodCost = useMemo(() => {
    return calculateOrdersFoodCost(todayOrders);
  }, [todayOrders, menuItems]);

  const todayExpensesTotal = useMemo(() => {
    return todayExpensesList.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [todayExpensesList]);

  const todayProfit = useMemo(() => {
    return todaySales - todayFoodCost - todayExpensesTotal;
  }, [todaySales, todayFoodCost, todayExpensesTotal]);

  const todayFoodCostPct = useMemo(() => {
    if (todaySales === 0) return 0;
    return Math.round((todayFoodCost / todaySales) * 1000) / 10;
  }, [todaySales, todayFoodCost]);

  const todayBillCount = todayOrders.length;
  const todayAvgBill = todayBillCount > 0 ? Math.round((todaySales / todayBillCount) * 100) / 100 : 0;
  const todayBreakEvenPct = useMemo(() => {
    const dailyTarget = 5000;
    if (todaySales === 0) return 0;
    return Math.min(100, Math.round((todaySales / dailyTarget) * 100));
  }, [todaySales]);

  // Selected Filter Period Real Financials
  const periodTotalSales = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  }, [filteredOrders]);

  const periodFoodCost = useMemo(() => {
    return calculateOrdersFoodCost(filteredOrders);
  }, [filteredOrders, menuItems]);

  const periodExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  const periodGrossProfit = periodTotalSales - periodFoodCost;
  const periodNetProfit = periodGrossProfit - periodExpenses;

  const periodFoodCostPct = useMemo(() => {
    if (periodTotalSales === 0) return 0;
    return Math.round((periodFoodCost / periodTotalSales) * 1000) / 10;
  }, [periodTotalSales, periodFoodCost]);

  const periodBillCount = filteredOrders.length;
  const periodAvgBill = periodBillCount > 0 ? Math.round((periodTotalSales / periodBillCount) * 100) / 100 : 0;

  // Period label & previous period comparison
  const periodLabel = useMemo(() => {
    switch (datePreset) {
      case 'today': return 'วันนี้';
      case '7days': return '7 วันล่าสุด';
      case '30days': return '30 วันล่าสุด';
      case 'this_month': return 'เดือนนี้';
      case 'this_year': return 'ปีนี้';
      case 'custom':
        return startDate === endDate ? (startDate || 'วันนี้') : `${startDate} ถึง ${endDate}`;
      default: return 'ช่วงที่เลือก';
    }
  }, [datePreset, startDate, endDate]);

  const prevPeriodLabel = useMemo(() => {
    switch (datePreset) {
      case 'today': return 'เมื่อวาน';
      case '7days': return '7 วันก่อนหน้า';
      case '30days': return '30 วันก่อนหน้า';
      case 'this_month': return 'เดือนที่แล้ว';
      case 'this_year': return 'ปีที่แล้ว';
      default: return 'ช่วงก่อนหน้า';
    }
  }, [datePreset]);

  // Previous Period Calculation for Comparison Growth %
  const prevPeriodOrders = useMemo(() => {
    if (!startDate || !endDate) return [];
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    const diffDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const prevEnd = new Date(sDate);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays + 1);

    const pStartStr = getLocalDateStr(prevStart);
    const pEndStr = getLocalDateStr(prevEnd);

    return orders.filter(o => {
      const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
      if (pStartStr && oDate && oDate < pStartStr) return false;
      if (pEndStr && oDate && oDate > pEndStr) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, startDate, endDate, selectedBranchId]);

  const prevPeriodSales = useMemo(() => {
    return prevPeriodOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
  }, [prevPeriodOrders]);

  const periodGrowthPct = useMemo(() => {
    if (datePreset === 'today') return salesGrowthTodayPct;
    if (prevPeriodSales === 0 && periodTotalSales > 0) return 100;
    if (prevPeriodSales === 0) return 0;
    return Math.round(((periodTotalSales - prevPeriodSales) / prevPeriodSales) * 100);
  }, [datePreset, salesGrowthTodayPct, periodTotalSales, prevPeriodSales]);

  const periodBreakEvenPct = useMemo(() => {
    let days = 1;
    if (datePreset === 'today') days = 1;
    else if (datePreset === '7days') days = 7;
    else if (datePreset === '30days') days = 30;
    else if (datePreset === 'this_month') {
      const now = new Date();
      days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    } else if (datePreset === 'this_year') {
      days = 365;
    } else if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      days = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }
    const target = 5000 * days;
    if (periodTotalSales === 0) return 0;
    return Math.min(100, Math.round((periodTotalSales / target) * 100));
  }, [datePreset, startDate, endDate, periodTotalSales]);

  // Section 14 Filtered Orders
  const filteredOrderHistory = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
      if (startDate && oDate && oDate < startDate) return false;
      if (endDate && oDate && oDate > endDate) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
      if (orderPaymentFilter !== 'all' && o.paymentMethod !== orderPaymentFilter) return false;
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase().trim();
        const matchNum = (o.orderNumber || '').toLowerCase().includes(q);
        const matchCustomer = (o.customerTaxInfo?.companyName || '').toLowerCase().includes(q);
        const matchTable = (o.tableNumber || '').toLowerCase().includes(q);
        const matchItems = o.items?.some(i => (i.menuItem?.name || '').toLowerCase().includes(q));
        if (!matchNum && !matchCustomer && !matchTable && !matchItems) return false;
      }
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders, startDate, endDate, selectedBranchId, orderStatusFilter, orderPaymentFilter, orderSearchQuery]);

  const totalOrderHistoryPages = Math.max(1, Math.ceil(filteredOrderHistory.length / orderPageSize));
  const paginatedOrders = useMemo(() => {
    const startIndex = (orderPage - 1) * orderPageSize;
    return filteredOrderHistory.slice(startIndex, startIndex + orderPageSize);
  }, [filteredOrderHistory, orderPage, orderPageSize]);

  // -------------------------------------------------------------
  // 2. Sales Overview Chart Data (Real Aggregation)
  // -------------------------------------------------------------
  const salesOverviewChartData = useMemo(() => {
    if (salesOverviewPeriod === 'daily') {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = getLocalDateStr(d);
        const dayName = d.toLocaleDateString('th-TH', { weekday: 'short' });
        const dayOrders = orders.filter(o => {
          const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
          if (oDate !== dStr) return false;
          if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
          return o.status !== 'cancelled';
        });
        const sales = dayOrders.reduce((s, o) => s + (o.grandTotal || 0), 0);
        const cost = calculateOrdersFoodCost(dayOrders);
        const profit = sales - cost;
        days.push({
          name: `${dayName} (${d.getDate()}/${d.getMonth() + 1})`,
          sales,
          profit,
          cost,
          orders: dayOrders.length
        });
      }
      return days;
    } else if (salesOverviewPeriod === 'weekly') {
      const weeks = [];
      for (let w = 3; w >= 0; w--) {
        const endW = new Date();
        endW.setDate(endW.getDate() - (w * 7));
        const startW = new Date(endW);
        startW.setDate(startW.getDate() - 6);
        const sStr = getLocalDateStr(startW);
        const eStr = getLocalDateStr(endW);

        const wOrders = orders.filter(o => {
          const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
          if (oDate < sStr || oDate > eStr) return false;
          if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
          return o.status !== 'cancelled';
        });
        const sales = wOrders.reduce((s, o) => s + (o.grandTotal || 0), 0);
        const cost = calculateOrdersFoodCost(wOrders);
        const profit = sales - cost;
        weeks.push({
          name: `สัปดาห์ ${4 - w} (${startW.getDate()}/${startW.getMonth() + 1} - ${endW.getDate()}/${endW.getMonth() + 1})`,
          sales,
          profit,
          cost,
          orders: wOrders.length
        });
      }
      return weeks;
    } else if (salesOverviewPeriod === 'monthly') {
      const currentYear = new Date().getFullYear();
      const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      return monthNames.map((name, mIdx) => {
        const mStr = String(mIdx + 1).padStart(2, '0');
        const prefix = `${currentYear}-${mStr}`;
        const mOrders = orders.filter(o => {
          const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
          if (!oDate.startsWith(prefix)) return false;
          if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
          return o.status !== 'cancelled';
        });
        const sales = mOrders.reduce((s, o) => s + (o.grandTotal || 0), 0);
        const cost = calculateOrdersFoodCost(mOrders);
        const profit = sales - cost;
        return {
          name,
          sales,
          profit,
          cost,
          orders: mOrders.length
        };
      });
    } else {
      const currentYear = new Date().getFullYear();
      const years = [currentYear - 2, currentYear - 1, currentYear];
      return years.map(yr => {
        const yrStr = String(yr);
        const yrOrders = orders.filter(o => {
          const oDate = o.createdAt ? getLocalDateStr(o.createdAt) : '';
          if (!oDate.startsWith(yrStr)) return false;
          if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
          return o.status !== 'cancelled';
        });
        const sales = yrOrders.reduce((s, o) => s + (o.grandTotal || 0), 0);
        const cost = calculateOrdersFoodCost(yrOrders);
        const profit = sales - cost;
        return {
          name: `ปี ${yr + 543}`,
          sales,
          profit,
          cost,
          orders: yrOrders.length
        };
      });
    }
  }, [salesOverviewPeriod, orders, selectedBranchId, menuItems]);

  // -------------------------------------------------------------
  // 3 & 4. Best Sellers & Top Profit Dishes Data (Real Aggregation)
  // -------------------------------------------------------------
  const menuSalesAggregation = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      category: string;
      qty: number;
      revenue: number;
      cost: number;
      profit: number;
      foodCostPct: number;
      marginPct: number;
      image?: string;
    }>();

    filteredOrders.forEach(o => {
      (o.items || []).forEach(item => {
        const mItem = menuItems.find(m => m.id === item.menuItem.id) || item.menuItem;
        const name = item.menuItem.name || mItem.name || 'เมนูทั่วไป';
        const category = mItem.category || 'อาหาร';
        const key = item.menuItem.id || name;
        const unitCost = mItem.costPrice !== undefined && mItem.costPrice > 0 ? mItem.costPrice : (item.totalPrice * 0.35 / Math.max(1, item.quantity));
        const totalItemRev = item.totalPrice || (item.unitPrice * item.quantity);
        const totalItemCost = unitCost * item.quantity;

        const current = map.get(key) || {
          id: key,
          name,
          category,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          foodCostPct: 0,
          marginPct: 0,
          image: mItem.image
        };

        current.qty += item.quantity;
        current.revenue += totalItemRev;
        current.cost += totalItemCost;
        current.profit = current.revenue - current.cost;
        current.foodCostPct = current.revenue > 0 ? Math.round((current.cost / current.revenue) * 100) : 0;
        current.marginPct = current.revenue > 0 ? Math.round((current.profit / current.revenue) * 100) : 0;

        map.set(key, current);
      });
    });

    return Array.from(map.values());
  }, [filteredOrders, menuItems]);

  const topBestSellers = useMemo(() => {
    return [...menuSalesAggregation]
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 10)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1
      }));
  }, [menuSalesAggregation]);

  const topProfitDishes = useMemo(() => {
    return [...menuSalesAggregation]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)
      .map((item, idx) => ({
        ...item,
        rank: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`
      }));
  }, [menuSalesAggregation]);

  // -------------------------------------------------------------
  // 5. Slow Moving Dishes (Real: Menu items with low sales)
  // -------------------------------------------------------------
  const slowMovingItems = useMemo(() => {
    const soldMap = new Map<string, number>();
    filteredOrders.forEach(o => {
      (o.items || []).forEach(i => {
        const key = i.menuItem.id || i.menuItem.name;
        soldMap.set(key, (soldMap.get(key) || 0) + i.quantity);
      });
    });

    return menuItems
      .map(m => {
        const qty = soldMap.get(m.id) || soldMap.get(m.name) || 0;
        return {
          menuItem: m,
          id: m.id,
          name: m.name,
          price: m.price,
          category: m.category,
          image: m.image,
          qty
        };
      })
      .filter(m => m.qty < 5)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 8);
  }, [menuItems, filteredOrders]);

  // Slow Moving Item Action Handlers
  const handlePromoteItem = (item: any) => {
    setActionNotification(`🚀 ติดป้ายโปรโมทเมนู "${item.name}" สำเร็จ!`);
    setTimeout(() => setActionNotification(null), 4000);
  };

  const handleApplyDiscount = () => {
    if (!discountModalItem) return;
    const newPrice = Math.max(10, discountModalItem.price - discountAmount);
    updateMenuItem({
      ...discountModalItem,
      price: newPrice
    });
    setActionNotification(`🏷️ ปรับลดราคาเมนู "${discountModalItem.name}" เป็น ฿${newPrice} สำเร็จ!`);
    setDiscountModalItem(null);
    setTimeout(() => setActionNotification(null), 4000);
  };

  // -------------------------------------------------------------
  // 6. Food Cost Breakdown Data (Real from Inventory / Expenses)
  // -------------------------------------------------------------
  const foodCostPieData = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    let totalStockValue = 0;

    ingredients.forEach(ing => {
      const val = (ing.currentStock || 0) * (ing.unitCost || 0);
      const cat = ing.category || 'วัตถุดิบทั่วไป';
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + val);
      totalStockValue += val;
    });

    if (totalStockValue === 0) {
      return [
        { name: 'ไม่มีข้อมูลสต็อก', value: 100, amount: 0, color: '#64748b' }
      ];
    }

    const colors = ['#f59e0b', '#06b6d4', '#10b981', '#eab308', '#a855f7', '#f43f5e', '#ec4899'];
    return Array.from(categoryTotals.entries()).map(([name, amount], idx) => {
      const percent = Math.round((amount / totalStockValue) * 100);
      return {
        name,
        value: percent,
        amount: Math.round(amount),
        color: colors[idx % colors.length]
      };
    });
  }, [ingredients]);

  // -------------------------------------------------------------
  // 7. Expense Analysis Data (Real from filteredExpenses)
  // -------------------------------------------------------------
  const expenseCategories = useMemo(() => {
    const catMap = new Map<string, number>();
    let totalExp = 0;

    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'ค่าใช้จ่ายทั่วไป';
      catMap.set(cat, (catMap.get(cat) || 0) + (exp.amount || 0));
      totalExp += exp.amount || 0;
    });

    if (totalExp === 0) {
      return [];
    }

    const colors = [
      { color: 'bg-indigo-500', barColor: '#6366f1' },
      { color: 'bg-amber-500', barColor: '#f59e0b' },
      { color: 'bg-yellow-500', barColor: '#eab308' },
      { color: 'bg-orange-500', barColor: '#f97316' },
      { color: 'bg-cyan-500', barColor: '#06b6d4' },
      { color: 'bg-emerald-500', barColor: '#10b981' },
      { color: 'bg-purple-500', barColor: '#a855f7' }
    ];

    return Array.from(catMap.entries()).map(([name, amount], idx) => {
      const percent = Math.round((amount / totalExp) * 1000) / 10;
      return {
        name,
        amount,
        percent,
        color: colors[idx % colors.length].color,
        barColor: colors[idx % colors.length].barColor
      };
    });
  }, [filteredExpenses]);

  // -------------------------------------------------------------
  // 9. Payment Methods & Cash Flow (Real Data)
  // -------------------------------------------------------------
  const paymentMethodBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    let totalPaid = 0;

    filteredOrders.forEach(o => {
      const pm = o.paymentMethod || 'cash';
      map.set(pm, (map.get(pm) || 0) + (o.grandTotal || 0));
      totalPaid += o.grandTotal || 0;
    });

    const labels: Record<string, { label: string; color: string }> = {
      promptpay: { label: 'PromptPay / QR', color: 'bg-cyan-500' },
      cash: { label: 'เงินสด (Cash)', color: 'bg-emerald-500' },
      transfer: { label: 'โอนเงินธนาคาร', color: 'bg-amber-500' },
      credit: { label: 'บัตรเครดิต', color: 'bg-purple-500' }
    };

    if (totalPaid === 0) {
      return [];
    }

    return Array.from(map.entries()).map(([key, amount]) => {
      const conf = labels[key] || { label: key, color: 'bg-slate-500' };
      const pct = Math.round((amount / totalPaid) * 1000) / 10;
      return {
        label: conf.label,
        amount: `฿${amount.toLocaleString(undefined, { minimumFractionDigits: 0 })}`,
        percent: `${pct}%`,
        color: conf.color
      };
    });
  }, [filteredOrders]);

  // -------------------------------------------------------------
  // 10. Customer Order Types (Real Data)
  // -------------------------------------------------------------
  const orderTypeBreakdown = useMemo(() => {
    const total = filteredOrders.length;
    if (total === 0) return [];

    let dineInCount = 0;
    let takeawayCount = 0;
    let deliveryCount = 0;

    let dineInSales = 0;
    let takeawaySales = 0;
    let deliverySales = 0;

    filteredOrders.forEach(o => {
      const type = o.orderType || (o.tableNumber ? 'dine-in' : 'takeaway');
      if (type === 'dine-in') {
        dineInCount++;
        dineInSales += o.grandTotal || 0;
      } else if (type === 'delivery') {
        deliveryCount++;
        deliverySales += o.grandTotal || 0;
      } else {
        takeawayCount++;
        takeawaySales += o.grandTotal || 0;
      }
    });

    return [
      {
        type: 'ทานที่ร้าน (Dine-in)',
        count: dineInCount,
        percent: Math.round((dineInCount / total) * 100),
        avgSpend: dineInCount > 0 ? `฿${Math.round(dineInSales / dineInCount)}/บิล` : '฿0/บิล',
        color: 'bg-emerald-500'
      },
      {
        type: 'สั่งกลับบ้าน (Takeaway)',
        count: takeawayCount,
        percent: Math.round((takeawayCount / total) * 100),
        avgSpend: takeawayCount > 0 ? `฿${Math.round(takeawaySales / takeawayCount)}/บิล` : '฿0/บิล',
        color: 'bg-amber-500'
      },
      {
        type: 'เดลิเวอรี (Delivery)',
        count: deliveryCount,
        percent: Math.round((deliveryCount / total) * 100),
        avgSpend: deliveryCount > 0 ? `฿${Math.round(deliverySales / deliveryCount)}/บิล` : '฿0/บิล',
        color: 'bg-purple-500'
      }
    ];
  }, [filteredOrders]);

  // -------------------------------------------------------------
  // 11. Peak Hours Heatmap (Real from Order Timestamps)
  // -------------------------------------------------------------
  const peakHoursData = useMemo(() => {
    const hourCounts: Record<number, number> = {};
    for (let h = 8; h <= 22; h++) {
      hourCounts[h] = 0;
    }

    filteredOrders.forEach(o => {
      if (o.createdAt) {
        const h = new Date(o.createdAt).getHours();
        if (h >= 8 && h <= 22) {
          hourCounts[h] = (hourCounts[h] || 0) + 1;
        }
      }
    });

    const maxCount = Math.max(1, ...Object.values(hourCounts));

    return Object.entries(hourCounts).map(([hStr, count]) => {
      const h = Number(hStr);
      const ratio = count / maxCount;
      let heat = '🔥';
      let level = 1;
      let isPeak = false;

      if (ratio > 0.75 && count > 0) {
        heat = '🔥🔥🔥🔥 Peak';
        level = 5;
        isPeak = true;
      } else if (ratio > 0.5) {
        heat = '🔥🔥🔥 High';
        level = 4;
        isPeak = true;
      } else if (ratio > 0.25) {
        heat = '🔥🔥 Med';
        level = 3;
      } else if (count > 0) {
        heat = '🔥 Low';
        level = 2;
      } else {
        heat = '💤 ว่าง';
        level = 1;
      }

      return {
        hour: `${String(h).padStart(2, '0')}:00`,
        orders: count,
        heat,
        level,
        isPeak
      };
    });
  }, [filteredOrders]);

  // -------------------------------------------------------------
  // 12. Real Dynamic AI Insights
  // -------------------------------------------------------------
  const lowStockIngredients = useMemo(() => {
    return ingredients.filter(i => (i.currentStock || 0) <= (i.minStockAlert || 0));
  }, [ingredients]);

  const realAiInsights = useMemo(() => {
    const insights: string[] = [];

    // 1. Sales Growth Insight
    if (yesterdaySales > 0) {
      if (todaySales >= yesterdaySales) {
        insights.push(`ยอดขายวันนี้เพิ่มขึ้น +${salesGrowthTodayPct}% เมื่อเทียบกับเมื่อวาน (฿${todaySales.toLocaleString()} vs ฿${yesterdaySales.toLocaleString()})`);
      } else {
        insights.push(`ยอดขายวันนี้ชะลอตัวลง ${Math.abs(salesGrowthTodayPct)}% เทียบกับเมื่อวาน`);
      }
    } else if (todaySales > 0) {
      insights.push(`ยอดขายวันนี้ทำได้ ฿${todaySales.toLocaleString()} จากคำสั่งซื้อทั้งหมด ${todayBillCount} บิล`);
    } else {
      insights.push(`ยังไม่มีรายการขายในระบบสำหรับวันนี้ สามารถเริ่มบันทึกออเดอร์หน้าร้านได้ทันที`);
    }

    // 2. Food Cost Insight
    if (todayFoodCostPct > 0) {
      if (todayFoodCostPct <= 35) {
        insights.push(`สัดส่วน Food Cost วันนี้อยู่ที่ ${todayFoodCostPct}% (อยู่ในเกณฑ์มาตรฐานดีเยี่ยม < 35%)`);
      } else {
        insights.push(`Food Cost วันนี้ค่อนข้างสูง (${todayFoodCostPct}%) ควรตรวจสอบการสูญเสียวัตถุดิบหรือปรับสัดส่วนเมนู`);
      }
    }

    // 3. Best Seller Insight
    if (topBestSellers.length > 0) {
      const top1 = topBestSellers[0];
      insights.push(`เมนูยอดนิยมอันดับ 1 ในช่วงเวลานี้คือ "${top1.name}" มียอดขาย ${top1.qty} จาน (รายได้รวม ฿${top1.revenue.toLocaleString()})`);
    }

    // 4. Low Stock Alerts
    if (lowStockIngredients.length > 0) {
      const names = lowStockIngredients.slice(0, 3).map(i => `${i.name} (เหลือ ${i.currentStock} ${i.unit})`).join(', ');
      insights.push(`⚠️ วัตถุดิบใกล้หมดสต็อก ${lowStockIngredients.length} รายการ: ${names} ควรเปิดใบสั่งซื้อเติมสต็อก`);
    } else {
      insights.push(`ระดับสต็อกวัตถุดิบทั้งหมดอยู่ในเกณฑ์ปลอดภัย ไม่พบวัตถุดิบขาดแคลน`);
    }

    // 5. Actionable Advice
    if (slowMovingItems.length > 0) {
      insights.push(`มีเมนูขายช้า ${slowMovingItems.length} รายการ แนะนำจัดโปรโมชั่นลดราคา หรือจัดเซตคู่กับเมนูยอดนิยมเพื่อเพิ่มยอดขาย`);
    }

    return insights;
  }, [todaySales, yesterdaySales, salesGrowthTodayPct, todayBillCount, todayFoodCostPct, topBestSellers, lowStockIngredients, slowMovingItems]);

  // -------------------------------------------------------------
  // 13. Dynamic Business Health Score Calculation
  // -------------------------------------------------------------
  const businessHealthScore = useMemo(() => {
    let score = 70; // Baseline

    // Check Profit Margin
    if (periodTotalSales > 0) {
      const margin = (periodNetProfit / periodTotalSales) * 100;
      if (margin >= 25) score += 15;
      else if (margin >= 15) score += 10;
      else if (margin > 0) score += 5;
      else score -= 10;
    }

    // Check Food Cost
    if (todayFoodCostPct > 0) {
      if (todayFoodCostPct <= 32) score += 10;
      else if (todayFoodCostPct <= 38) score += 5;
      else score -= 10;
    }

    // Check Stock Health
    if (lowStockIngredients.length === 0) score += 5;
    else score -= Math.min(10, lowStockIngredients.length * 2);

    return Math.max(0, Math.min(100, score));
  }, [periodTotalSales, periodNetProfit, todayFoodCostPct, lowStockIngredients]);

  // -------------------------------------------------------------
  // EXPORT & TELEGRAM HANDLERS
  // -------------------------------------------------------------
  const [telegramStatusMessage, setTelegramStatusMessage] = useState<string | null>(null);

  const handleTriggerTelegramDigest = async () => {
    setTelegramSending(true);
    setTelegramStatusMessage(null);
    try {
      const res = await sendDailySummaryNotification('both');
      if (res.success) {
        setTelegramSentSuccess(true);
        setTelegramStatusMessage('ส่งรายงานสรุปยอดขายจริงไปยัง Telegram & LINE เรียบร้อยแล้ว!');
        setTimeout(() => setTelegramSentSuccess(false), 5000);
      } else {
        setTelegramStatusMessage(`❌ ${res.summary}`);
      }
    } catch (err: any) {
      setTelegramStatusMessage(`❌ เกิดข้อผิดพลาด: ${err.message || 'ส่งรายงานไม่สำเร็จ'}`);
    } finally {
      setTelegramSending(false);
    }
  };

  const handleExportPDFReport = async () => {
    setIsExporting(true);
    await exportToPDF('enterprise-dashboard-content', `Executive-Analytics-${startDate}-to-${endDate}`, 'a4');
    setIsExporting(false);
  };

  const handleExportCSVReport = () => {
    const BOM = '\uFEFF';
    let csv = BOM + `=== รายงานวิเคราะห์ผลประกอบการเชิงลึก (Advanced Executive Analytics) ===\n`;
    csv += `วันที่ออกรายงาน: ${new Date().toLocaleString('th-TH')}\n`;
    csv += `ช่วงเวลา: ${startDate} ถึง ${endDate}\n`;
    csv += `สาขาที่เลือก: ${selectedBranchId === 'all' ? 'ทุกสาขา' : currentBranch.name}\n\n`;

    csv += `=== ดัชนีวัดผลสำคัญ (Key KPIs) ===\n`;
    csv += `ยอดขายวันนี้,${todaySales},บาท\n`;
    csv += `กำไรสุทธิวันนี้,${todayProfit},บาท\n`;
    csv += `Food Cost %,${todayFoodCostPct},%\n`;
    csv += `จำนวนบิลวันนี้,${todayBillCount},บิล\n`;
    csv += `ยอดขายเฉลี่ยต่อบิล,${todayAvgBill},บาท\n`;
    csv += `Business Health Score,${businessHealthScore},/100\n\n`;

    csv += `=== งบกำไรขาดทุนตามช่วงเวลา (P&L Statement) ===\n`;
    csv += `ยอดขายรวม (Gross Sales),${periodTotalSales},บาท\n`;
    csv += `ต้นทุนวัตถุดิบ (COGS),${periodFoodCost},บาท\n`;
    csv += `กำไรขั้นต้น (Gross Profit),${periodGrossProfit},บาท\n`;
    csv += `ค่าใช้จ่ายดำเนินงาน (OPEX),${periodExpenses},บาท\n`;
    csv += `กำไรสุทธิ (Net Profit),${periodNetProfit},บาท\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Executive_Analytics_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="enterprise-dashboard-content" className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200 text-slate-100">
      
      {/* Dynamic Action Toast Banner */}
      {actionNotification && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-950 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 animate-in slide-in-from-top duration-300">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-xs font-bold">{actionNotification}</p>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER TOOLBAR: Title, Live Status & Export Buttons */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <BarChart3 className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-100 flex items-center space-x-2">
                <span>วิเคราะห์ผลประกอบการ (Advanced Analytics)</span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
                  EXECUTIVE DASHBOARD
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                รายงานยอดขาย กำไร ต้นทุนวัตถุดิบ P&L และคำแนะนำ AI ประจำร้าน (ประมวลผลจากข้อมูลจริง 100%)
              </p>
            </div>
          </div>
        </div>

        {/* Quick Export & Channel Trigger Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-2xl flex items-center space-x-2 text-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300 font-medium">เรียลไทม์ ({liveLastUpdated})</span>
            <button 
              onClick={handleRefresh} 
              disabled={isPullingCloud}
              className={`p-1 hover:text-amber-400 transition ${isPullingCloud ? 'animate-spin text-amber-400' : ''}`} 
              title="ดึงยอดขายจาก Cloud / รีเฟรชข้อมูล"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isPullingCloud}
            className="px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            title="ดึงข้อมูลคำสั่งซื้อทั้งหมดจาก Firebase Cloud"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${isPullingCloud ? 'animate-bounce' : ''}`} />
            <span>{isPullingCloud ? 'กำลังดึงยอด...' : 'ดึงยอดจาก Cloud'}</span>
          </button>

          <button
            onClick={() => setIsTelegramModalOpen(true)}
            className="px-3.5 py-2 bg-sky-950/80 hover:bg-sky-900 border border-sky-600/40 text-sky-300 font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow-sm active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>ส่งเข้า Telegram / LINE</span>
          </button>

          <button
            onClick={handleExportPDFReport}
            disabled={isExporting}
            className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/40 text-rose-300 font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>

          <button
            onClick={handleExportCSVReport}
            className="px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/40 text-emerald-300 font-bold text-xs rounded-2xl transition flex items-center space-x-1.5 shadow-sm active:scale-95"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FILTER BAR: Date Presets, Custom Pickers & Branch Selector */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center space-x-1">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>ตัวกรองข้อมูล:</span>
          </span>
          {[
            { id: 'today', label: 'วันนี้' },
            { id: '7days', label: '7 วัน' },
            { id: '30days', label: '30 วัน' },
            { id: 'this_month', label: 'เดือนนี้' },
            { id: 'this_year', label: 'ปีนี้' },
            { id: 'custom', label: 'กำหนดเอง' }
          ].map(p => (
            <button
              key={p.id}
              onClick={() => handlePresetChange(p.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                datePreset === p.id
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {datePreset === 'custom' && (
            <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none"
              />
              <span className="text-slate-500">ถึง</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">สาขา:</span>
            <select
              value={selectedBranchId}
              onChange={e => setSelectedBranchId(e.target.value)}
              className="bg-transparent font-bold text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-100">ทุกสาขา (All Branches)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: EXECUTIVE DASHBOARD (TOP KPI CARDS ROW) */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300 flex items-center space-x-2">
          <Activity className="w-4 h-4 text-amber-400" />
          <span>1. Executive Dashboard (ภาพรวมธุรกิจ)</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: ยอดขาย */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-amber-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>{datePreset === 'today' ? 'ยอดขายวันนี้' : `ยอดขาย (${periodLabel})`}</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              ฿{periodTotalSales.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1 font-mono">
              {periodGrowthPct >= 0 ? (
                <>
                  <ArrowUpRight className="w-3 h-3" />
                  <span>▲ +{periodGrowthPct}% vs {prevPeriodLabel}</span>
                </>
              ) : (
                <span className="text-rose-400 flex items-center space-x-1">
                  <ArrowDownRight className="w-3 h-3" />
                  <span>▼ {periodGrowthPct}% vs {prevPeriodLabel}</span>
                </span>
              )}
            </div>
          </div>

          {/* Card 2: กำไรสุทธิ */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-emerald-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>{datePreset === 'today' ? 'กำไรสุทธิวันนี้' : `กำไรสุทธิ (${periodLabel})`}</span>
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className={`text-xl font-black font-mono ${periodNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ฿{periodNetProfit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 font-bold flex items-center space-x-1 font-mono">
              <span>{periodTotalSales > 0 ? `${Math.round((periodNetProfit / periodTotalSales) * 100)}% Net Margin` : 'ไม่มีรายการ'}</span>
            </div>
          </div>

          {/* Card 3: Food Cost */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-orange-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>{datePreset === 'today' ? 'Food Cost วันนี้' : `Food Cost (${periodLabel})`}</span>
              <Utensils className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="text-xl font-black text-orange-400 font-mono">
              {periodFoodCostPct}%
            </div>
            <div className="text-[10px] font-bold flex items-center space-x-1">
              {periodFoodCostPct <= 35 ? (
                <span className="text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>✓ อยู่ในเกณฑ์ (&lt;=35%)</span>
                </span>
              ) : (
                <span className="text-rose-400 flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>เกินเกณฑ์เป้าหมาย</span>
                </span>
              )}
            </div>
          </div>

          {/* Card 4: จำนวนบิล */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-sky-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>{datePreset === 'today' ? 'จำนวนบิลวันนี้' : `จำนวนบิล (${periodLabel})`}</span>
              <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-black text-sky-400 font-mono">
              {periodBillCount}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {datePreset === 'today' ? 'บิลสั่งซื้อประจำวัน' : `บิลสั่งซื้อที่สำเร็จ`}
            </div>
          </div>

          {/* Card 5: Average Bill */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-purple-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>{datePreset === 'today' ? 'Average Bill วันนี้' : `Average Bill (${periodLabel})`}</span>
              <Tag className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-black text-purple-400 font-mono">
              ฿{periodAvgBill.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              ยอดใช้จ่ายเฉลี่ย/บิล
            </div>
          </div>

          {/* Card 6: Break-even */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-amber-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>{datePreset === 'today' ? 'Break-even วันนี้' : `เป้าหมายยอดขาย (${periodLabel})`}</span>
              <Target className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              {periodBreakEvenPct}%
            </div>
            <div className="text-[10px] text-amber-400 font-mono">
              {periodBreakEvenPct >= 100 ? '✓ ถึงจุดคุ้มทุนแล้ว' : `เป้าหมาย ${periodBreakEvenPct}%`}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: SALES OVERVIEW (INTERACTIVE MULTI-PERIOD CHART) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span>2. Sales Overview (กราฟวิเคราะห์ยอดขายจากข้อมูลจริง)</span>
            </h3>
            <p className="text-xs text-slate-400">เปรียบเทียบยอดขาย กำไร ต้นทุน และจำนวนบิลตามช่วงเวลาที่เกิดขึ้นจริง</p>
          </div>

          {/* Period Tabs: รายวัน / รายสัปดาห์ / รายเดือน / รายปี */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            {[
              { id: 'daily', label: 'ยอดขาย 7 วัน' },
              { id: 'weekly', label: '4 สัปดาห์' },
              { id: 'monthly', label: 'รายเดือน' },
              { id: 'yearly', label: 'รายปี' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSalesOverviewPeriod(tab.id as any)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                  salesOverviewPeriod === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Metric Toggles */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-400 font-semibold">แสดงผล:</span>
          {[
            { key: 'sales', label: 'ยอดขาย (Revenue)', color: 'border-amber-500 text-amber-400 bg-amber-950/40' },
            { key: 'profit', label: 'กำไร (Profit)', color: 'border-emerald-500 text-emerald-400 bg-emerald-950/40' },
            { key: 'cost', label: 'ต้นทุน (Cost)', color: 'border-rose-500 text-rose-400 bg-rose-950/40' },
            { key: 'orders', label: 'จำนวนบิล (Orders)', color: 'border-sky-500 text-sky-400 bg-sky-950/40' }
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setActiveMetrics(prev => ({ ...prev, [m.key]: !prev[m.key as keyof typeof prev] }))}
              className={`px-3 py-1 rounded-xl font-bold border transition flex items-center space-x-1.5 ${
                activeMetrics[m.key as keyof typeof activeMetrics] ? m.color : 'border-slate-800 text-slate-500 bg-slate-950'
              }`}
            >
              <span>{activeMetrics[m.key as keyof typeof activeMetrics] ? '✓' : '○'}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Recharts Area / Bar Chart */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesOverviewChartData}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v) => `฿${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                formatter={(val: any) => [`฿${Number(val).toLocaleString()}`, '']}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              {activeMetrics.sales && <Area type="monotone" dataKey="sales" name="ยอดขาย" stroke="#f59e0b" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />}
              {activeMetrics.profit && <Area type="monotone" dataKey="profit" name="กำไร" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />}
              {activeMetrics.cost && <Area type="monotone" dataKey="cost" name="ต้นทุน" stroke="#f43f5e" fillOpacity={1} fill="url(#colorCost)" strokeWidth={2} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: TOP BEST SELLERS (เมนูขายดีที่สุด) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>3. Top Best Sellers (อันดับเมนูขายดีที่สุดจริง)</span>
            </h3>
            <p className="text-xs text-slate-400">สรุปยอดขาย จำนวนจาน กำไรสุทธิ และ Food Cost แยกตามรายการเมนูที่บันทึกขายจริง</p>
          </div>

          {/* Summary */}
          {topBestSellers.length > 0 && (
            <div className="flex items-center space-x-3 text-xs bg-slate-950 p-2 rounded-2xl border border-slate-800">
              <div>
                <span className="text-slate-400">ยอดรวม Top {topBestSellers.length}:</span>
                <strong className="text-amber-400 font-mono ml-1">
                  ฿{topBestSellers.reduce((s, i) => s + i.revenue, 0).toLocaleString()}
                </strong>
              </div>
              <div className="h-4 w-[1px] bg-slate-800" />
              <div>
                <span className="text-slate-400">จำนวนขายรวม:</span>
                <strong className="text-emerald-400 font-mono ml-1">
                  {topBestSellers.reduce((s, i) => s + i.qty, 0)} จาน
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Detailed Table for Best Sellers */}
        <div className="overflow-x-auto">
          {topBestSellers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
              ยังไม่มีรายการสั่งซื้อในช่วงเวลาที่เลือก สามารถเริ่มรับออเดอร์หน้าร้านได้ทันที
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3 text-center">อันดับ</th>
                  <th className="p-3">เมนูอาหาร</th>
                  <th className="p-3 text-center">จำนวนขาย</th>
                  <th className="p-3 text-right">ยอดขาย</th>
                  <th className="p-3 text-right">กำไรสุทธิ</th>
                  <th className="p-3 text-center">Food Cost</th>
                  <th className="p-3 text-center">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {topBestSellers.map(item => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 text-center font-bold">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs ${
                        item.rank === 1 ? 'bg-amber-500 text-slate-950 font-black' :
                        item.rank === 2 ? 'bg-slate-300 text-slate-950 font-black' :
                        item.rank === 3 ? 'bg-amber-700 text-white font-black' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {item.rank}
                      </span>
                    </td>
                    <td className="p-3 font-sans font-bold text-slate-200">
                      <div>
                        <div>{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{item.category}</div>
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold text-slate-100">{item.qty} จาน</td>
                    <td className="p-3 text-right font-black text-amber-400">฿{item.revenue.toLocaleString()}</td>
                    <td className="p-3 text-right font-black text-emerald-400">฿{item.profit.toLocaleString()}</td>
                    <td className="p-3 text-center font-bold text-orange-400">{item.foodCostPct}%</td>
                    <td className="p-3 text-center font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[11px]">
                        {item.marginPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4 & 5: TOP PROFIT DISHES & SLOW MOVING MENU */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 4. Top Profit Dishes */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>4. เมนูทำกำไรสูงสุด (Top Profit Dishes)</span>
            </h3>
            <p className="text-xs text-slate-400">เน้นสร้างผลกำไรสุทธิสูงสุดแก่ร้าน (คำนวณจากยอดขายจริง)</p>
          </div>

          <div className="space-y-2.5">
            {topProfitDishes.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
                ยังไม่มีข้อมูลการขายสำหรับวิเคราะห์กำไร
              </div>
            ) : (
              topProfitDishes.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg font-bold w-6 text-center">{item.rank}</span>
                    <div>
                      <h4 className="font-bold text-xs text-slate-100">{item.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">ยอดขายรวม ฿{item.revenue.toLocaleString()} ({item.qty} จาน)</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black text-emerald-400 font-mono">
                      กำไร ฿{item.profit.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-emerald-500 font-bold font-mono">
                      Margin {item.marginPct}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 5. Slow Moving Dishes */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>5. เมนูขายช้า (Slow Moving Menu)</span>
            </h3>
            <p className="text-xs text-slate-400">เมนูที่มียอดขายน้อยกว่า 5 จาน พร้อมปุ่มแอ็กชันปรับปรุงเข้าเมนูจริง</p>
          </div>

          <div className="space-y-3">
            {slowMovingItems.length === 0 ? (
              <div className="p-6 text-center text-emerald-400 text-xs bg-slate-950 rounded-2xl border border-slate-800 font-bold">
                🎉 ยอดเยี่ยม! เมนูทุกรายการมียอดขายคล่องตัว
              </div>
            ) : (
              slowMovingItems.map((item) => (
                <div key={item.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <div>
                      <h4 className="font-bold text-xs text-slate-200">{item.name}</h4>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                        <span>ราคา ฿{item.price}</span>
                        <span>•</span>
                        <span className="text-rose-400 font-bold">ขายได้ {item.qty} จาน</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: โปรโมท / ลดราคา */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      onClick={() => handlePromoteItem(item)}
                      className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-600/40 text-amber-300 rounded-xl text-[10px] font-bold transition flex items-center space-x-1"
                      title="ติดป้ายโปรโมท"
                    >
                      <Gift className="w-3 h-3" />
                      <span>โปรโมท</span>
                    </button>

                    <button
                      onClick={() => {
                        setDiscountModalItem(item.menuItem);
                        setDiscountAmount(10);
                      }}
                      className="px-2.5 py-1 bg-sky-950 hover:bg-sky-900 border border-sky-600/40 text-sky-300 rounded-xl text-[10px] font-bold transition flex items-center space-x-1"
                      title="ลดราคาเมนู"
                    >
                      <Tag className="w-3 h-3" />
                      <span>ลดราคา</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 6: FOOD COST DASHBOARD */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <PieChartIcon className="w-4 h-4 text-orange-400" />
              <span>6. Food Cost & Stock Dashboard (สัดส่วนมูลค่าสต็อกวัตถุดิบจริง)</span>
            </h3>
            <p className="text-xs text-slate-400">สัดส่วนมูลค่าวัตถุดิบที่มีอยู่ในคลังแยกตามประเภท</p>
          </div>

          <div className="bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Food Cost วันนี้: </span>
            <strong className="text-orange-400 font-bold text-sm">{todayFoodCostPct}%</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Donut Chart */}
          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={foodCostPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {foodCostPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(val: any) => [`${val}%`, 'สัดส่วน']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown List */}
          <div className="space-y-3">
            {foodCostPieData.map(fc => (
              <div key={fc.name} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span className="font-semibold flex items-center space-x-2">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: fc.color }} />
                    <span>{fc.name}</span>
                  </span>
                  <span className="font-mono font-bold text-amber-400">{fc.value}% (฿{fc.amount.toLocaleString()})</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, fc.value)}%`, backgroundColor: fc.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 7: EXPENSE ANALYSIS (วิเคราะห์ค่าใช้จ่าย) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>7. วิเคราะห์ค่าใช้จ่ายจริง (Expense Analysis)</span>
          </h3>
          <p className="text-xs text-slate-400">แบ่งสัดส่วนค่าใช้จ่ายดำเนินงานทั้งหมดจากบันทึกรายจ่ายจริง</p>
        </div>

        {expenseCategories.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
            ยังไม่มีการบันทึกค่าใช้จ่ายในช่วงเวลาที่เลือก สามารถเพิ่มได้ที่แท็บบันทึกค่าใช้จ่าย
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {expenseCategories.map(exp => (
                <div key={exp.name} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span className="font-semibold">{exp.name}</span>
                    <span className="font-mono font-bold text-slate-100">฿{exp.amount.toLocaleString()} ({exp.percent}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                    <div className={`h-full ${exp.color} transition-all duration-500`} style={{ width: `${Math.min(100, exp.percent)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-center">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>รวมค่าใช้จ่ายจริงทั้งหมด:</span>
                <strong className="text-rose-400 font-mono text-base font-black">
                  ฿{periodExpenses.toLocaleString()}
                </strong>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                💡 ติดตามและตรวจสอบรายการค่าใช้จ่ายเพื่อควบคุมต้นทุนดำเนินงานให้อยู่ในงบประมาณที่กำหนด
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 8 & 9: PROFIT & LOSS (P&L) & CASH FLOW */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 8. กำไรขาดทุน (P&L Statement) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>8. กำไรขาดทุนจริง (P&L Statement)</span>
            </h3>
            <p className="text-xs text-slate-400">สรุปงบกำไรขาดทุนจริงตามช่วงเวลาที่เลือก</p>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
              <span className="text-slate-300 font-bold">ยอดขายรวม (Gross Revenue)</span>
              <span className="text-amber-400 font-black text-sm">฿{periodTotalSales.toLocaleString()}</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center text-rose-400">
              <span>(-) ต้นทุนวัตถุดิบอาหาร (COGS)</span>
              <span>-฿{periodFoodCost.toLocaleString()}</span>
            </div>

            <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-800/50 flex justify-between items-center font-bold text-amber-300">
              <span>(=) กำไรขั้นต้น (Gross Profit)</span>
              <span className="text-sm">฿{periodGrossProfit.toLocaleString()}</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center text-rose-400">
              <span>(-) ค่าใช้จ่ายดำเนินงาน (OPEX)</span>
              <span>-฿{periodExpenses.toLocaleString()}</span>
            </div>

            <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-500/40 flex justify-between items-center font-black text-emerald-400 text-sm">
              <span>(=) กำไรสุทธิ (Net Profit)</span>
              <span className="text-base">฿{periodNetProfit.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 9. Cash Flow (กระแสเงินสด) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Landmark className="w-4 h-4 text-cyan-400" />
              <span>9. Cash Flow (กระแสเงินสดจริง)</span>
            </h3>
            <p className="text-xs text-slate-400">เงินเข้า เงินออก และสัดส่วนช่องทางชำระเงินจริง</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">เงินเข้า (Inflow)</span>
              <p className="font-bold text-emerald-400 text-sm">฿{periodTotalSales.toLocaleString()}</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">เงินออก (Outflow)</span>
              <p className="font-bold text-rose-400 text-sm">฿{periodExpenses.toLocaleString()}</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">กระแสเงินสดสุทธิ</span>
              <p className={`font-bold text-sm ${periodNetProfit >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                ฿{periodNetProfit.toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">จำนวนบิลที่ชำระ</span>
              <p className="font-bold text-amber-400 text-sm">{filteredOrders.length} บิล</p>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
            <span className="text-slate-400 font-semibold block">สัดส่วนช่องทางชำระเงินจริง:</span>
            {paymentMethodBreakdown.length === 0 ? (
              <p className="text-slate-500 text-[11px]">ยังไม่มีข้อมูลการชำระเงิน</p>
            ) : (
              paymentMethodBreakdown.map(pm => (
                <div key={pm.label} className="flex justify-between items-center text-[11px] font-mono text-slate-300">
                  <span className="flex items-center space-x-1.5">
                    <span className={`w-2 h-2 rounded-full ${pm.color}`} />
                    <span>{pm.label}</span>
                  </span>
                  <span className="font-bold">{pm.amount} ({pm.percent})</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 10 & 11: CUSTOMER ANALYTICS & PEAK HOURS HEATMAP */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 10. Customer Analytics */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span>10. ประเภทคำสั่งซื้อ (Order Types Analytics)</span>
            </h3>
            <p className="text-xs text-slate-400">สัดส่วนการสั่งซื้อ ทานที่ร้าน สั่งกลับบ้าน และเดลิเวอรี</p>
          </div>

          <div className="space-y-3 text-xs">
            {orderTypeBreakdown.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
                ยังไม่มีข้อมูลคำสั่งซื้อ
              </div>
            ) : (
              orderTypeBreakdown.map(c => (
                <div key={c.type} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5">
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-200">{c.type} ({c.count} บิล)</span>
                    <span className="text-emerald-400 font-mono">ยอดเฉลี่ย {c.avgSpend}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div className={`h-full ${c.color}`} style={{ width: `${c.percent}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 11. Peak Hours Heatmap */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>11. วิเคราะห์เวลาขายดีจริง (Peak Hours Heatmap)</span>
            </h3>
            <p className="text-xs text-slate-400">ช่วงเวลาที่มีออเดอร์หนาแน่น คำนวณจากเวลาสั่งซื้อจริง</p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-xs">
            {peakHoursData.map(ph => (
              <div
                key={ph.hour}
                className={`p-2.5 rounded-2xl border transition flex flex-col items-center justify-between space-y-1 ${
                  ph.isPeak
                    ? 'bg-orange-950/80 border-orange-500/60 text-orange-300 font-bold shadow-lg scale-105'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <span className="font-mono text-[11px] font-bold">{ph.hour}</span>
                <span className="text-xs">{ph.heat}</span>
                <span className="font-mono text-[10px] text-slate-300">{ph.orders} บิล</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 12: AI INSIGHT (กล่องคำแนะนำอัจฉริยะ) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-emerald-950/90 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-3">
        <div className="flex items-center space-x-2.5">
          <span className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-400">
            <Sparkles className="w-6 h-6 animate-pulse stroke-[2.5]" />
          </span>
          <div>
            <h3 className="text-base font-black text-emerald-300">12. AI Insight (การวิเคราะห์คำแนะนำอัจฉริยะ)</h3>
            <p className="text-xs text-emerald-200/80">ประมวลผลจากข้อมูลการขายและสต็อกจริงในระบบ</p>
          </div>
        </div>

        <ul className="space-y-2 text-xs text-emerald-100 font-medium list-disc list-inside leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-emerald-500/20">
          {realAiInsights.map((insight, idx) => (
            <li key={idx}>
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 13: BUSINESS HEALTH SCORE */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-950 border-2 border-emerald-500/60 flex flex-col items-center justify-center font-mono text-emerald-400">
              <span className="text-xl font-black">{businessHealthScore}</span>
              <span className="text-[9px] font-bold text-emerald-300">/100</span>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-slate-100">13. KPI สุขภาพธุรกิจ (Business Health Score)</h3>
                <span className="text-amber-400 text-xs">
                  {businessHealthScore >= 90 ? '★★★★★' : businessHealthScore >= 70 ? '★★★★☆' : '★★★☆☆'}
                </span>
              </div>
              <p className="text-xs text-slate-400">ประเมินความสมบูรณ์ทางการเงินจากอัตรากำไร ต้นทุน และสถานะสต็อกจริง</p>
            </div>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <span>
              {businessHealthScore >= 90
                ? `🟢 ${businessHealthScore} / 100 = ดีเยี่ยม (Excellent)`
                : businessHealthScore >= 70
                ? `🟡 ${businessHealthScore} / 100 = ปกติ (Good)`
                : `🔴 ${businessHealthScore} / 100 = ควรปรับปรุง`}
            </span>
          </div>
        </div>

        {/* Color Scale Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-2xl border border-emerald-500/30 flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <div className="font-bold text-emerald-400">🟢 90 – 100 = ดีมาก</div>
              <p className="text-[10px] text-slate-400">สุขภาพการเงินยอดเยี่ยม อัตรากำไรสุทธิสูงและสต็อกสมบูรณ์</p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-amber-500/30 flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
            <div>
              <div className="font-bold text-amber-400">🟡 70 – 89 = ปกติ</div>
              <p className="text-[10px] text-slate-400">ดำเนินกิจการได้ตามเกณฑ์มาตรฐาน</p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-rose-500/30 flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
            <div>
              <div className="font-bold text-rose-400">🔴 ต่ำกว่า 70 = ควรปรับปรุง</div>
              <p className="text-[10px] text-slate-400">ควรควบคุมต้นทุนค่าใช้จ่ายและตรวจสอบวัตถุดิบใกล้หมด</p>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 14: HISTORICAL ORDERS & RECEIPTS LOG */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-slate-100">14. ประวัติรายการบิลและออเดอร์ย้อนหลัง (Historical Orders & Receipts Log)</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  {periodLabel}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                สืบค้นประวัติการขาย ใบเสร็จย้อนหลัง เมนูที่สั่ง และสั่งพิมพ์ใบเสร็จซ้ำได้ทันที
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
              พบ <span className="text-amber-400 font-bold">{filteredOrderHistory.length}</span> รายการ
              {filteredOrderHistory.length > 0 && (
                <span className="ml-2 pl-2 border-l border-slate-700 text-emerald-400 font-bold">
                  รวม ฿{filteredOrderHistory.reduce((s, o) => s + (o.grandTotal || 0), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('order_history')}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95"
                title="เปิดหน้าประวัติออเดอร์และใบเสร็จฉบับเต็ม"
              >
                <History className="w-3.5 h-3.5" />
                <span>เปิดหน้าประวัติเต็ม</span>
              </button>
            )}

            <button
              onClick={handleExportOrdersCSV}
              disabled={filteredOrderHistory.length === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ส่งออก CSV</span>
            </button>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={orderSearchQuery}
              onChange={e => {
                setOrderSearchQuery(e.target.value);
                setOrderPage(1);
              }}
              placeholder="ค้นหาเลขที่บิล (#KAP-...), ลูกค้า, โต๊ะ หรือชื่อเมนู..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {orderSearchQuery && (
              <button
                onClick={() => setOrderSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="md:col-span-4 flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-400 px-2 font-medium">สถานะ:</span>
            <button
              onClick={() => { setOrderStatusFilter('all'); setOrderPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                orderStatusFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => { setOrderStatusFilter('served'); setOrderPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                orderStatusFilter === 'served'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🟢 สำเร็จ
            </button>
            <button
              onClick={() => { setOrderStatusFilter('cancelled'); setOrderPage(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                orderStatusFilter === 'cancelled'
                  ? 'bg-rose-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🔴 ยกเลิก
            </button>
          </div>

          {/* Payment Method Filter */}
          <div className="md:col-span-3 flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[11px] text-slate-400 px-2 font-medium">ชำระ:</span>
            <select
              value={orderPaymentFilter}
              onChange={e => {
                setOrderPaymentFilter(e.target.value as any);
                setOrderPage(1);
              }}
              className="w-full bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer py-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">ทุกช่องทางชำระ</option>
              <option value="cash" className="bg-slate-900 text-slate-200">💵 เงินสด</option>
              <option value="promptpay" className="bg-slate-900 text-slate-200">📱 พร้อมเพย์ QR</option>
              <option value="credit" className="bg-slate-900 text-slate-200">💳 บัตรเครดิต</option>
              <option value="transfer" className="bg-slate-900 text-slate-200">🏦 โอนเงิน</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3">วันที่ - เวลา</th>
                <th className="py-3 px-3">เลขที่บิล</th>
                <th className="py-3 px-3">สาขา</th>
                <th className="py-3 px-3">โต๊ะ/ประเภท</th>
                <th className="py-3 px-3">รายการอาหาร</th>
                <th className="py-3 px-3">ช่องทางชำระ</th>
                <th className="py-3 px-3">สถานะ</th>
                <th className="py-3 px-3 text-right">ยอดสุทธิ</th>
                <th className="py-3 px-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                    <Receipt className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                    <p className="font-semibold text-slate-400">ไม่พบบันทึกประวัติบิลในช่วงเวลานี้</p>
                    <p className="text-xs text-slate-500 mt-1">
                      ลองเปลี่ยนช่วงวันที่ที่ตัวกรองด้านบน หรือกดปุ่ม "ดึงข้อมูลยอดขายจาก Cloud" เพื่อรีเฟรชข้อมูล
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map(order => {
                  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
                  const branchObj = branches.find(b => b.id === order.branchId) || currentBranch;
                  const isCancelled = order.status === 'cancelled';

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-slate-800/40 transition group ${
                        isCancelled ? 'opacity-60 bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Date & Time */}
                      <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                        <div className="font-sans font-bold text-slate-200">
                          {orderDate.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {orderDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                        </div>
                      </td>

                      {/* Order Number */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          #{order.orderNumber || order.id.slice(-6)}
                        </span>
                      </td>

                      {/* Branch */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-sans text-slate-300 text-[11px]">
                        {branchObj?.name || 'สาขาหลัก'}
                      </td>

                      {/* Table / Order Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                        {order.tableNumber ? (
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 text-[11px] font-bold border border-sky-500/20">
                            โต๊ะ {order.tableNumber}
                          </span>
                        ) : order.orderType === 'takeaway' ? (
                          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[11px] font-bold border border-purple-500/20">
                            สั่งกลับบ้าน
                          </span>
                        ) : order.orderType === 'delivery' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px] font-bold border border-emerald-500/20">
                            เดลิเวอรี
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">ทั่วไป</span>
                        )}
                      </td>

                      {/* Items */}
                      <td className="py-2.5 px-3 max-w-xs font-sans">
                        <div className="truncate text-slate-300 text-[11px]" title={order.items?.map(i => `${i.menuItem?.name || 'รายการ'} x${i.quantity}`).join(', ')}>
                          {order.items?.map(i => `${i.menuItem?.name || 'รายการ'} x${i.quantity}`).join(', ') || '-'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {order.items?.reduce((sum, i) => sum + i.quantity, 0) || 0} ชิ้น
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                        {order.paymentMethod === 'cash' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px] font-bold border border-emerald-500/20">
                            💵 เงินสด
                          </span>
                        ) : order.paymentMethod === 'promptpay' ? (
                          <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 text-[11px] font-bold border border-sky-500/20">
                            📱 พร้อมเพย์ QR
                          </span>
                        ) : order.paymentMethod === 'credit' ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-[11px] font-bold border border-indigo-500/20">
                            💳 บัตรเครดิต
                          </span>
                        ) : order.paymentMethod === 'transfer' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[11px] font-bold border border-amber-500/20">
                            🏦 โอนเงิน
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">
                            {order.paymentMethod || 'ไม่ระบุ'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                            ยกเลิก
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                            สำเร็จ
                          </span>
                        )}
                      </td>

                      {/* Grand Total */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className={`font-black text-sm ${isCancelled ? 'line-through text-slate-500' : 'text-emerald-400 font-mono'}`}>
                          ฿{(order.grandTotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5 font-sans">
                          <button
                            onClick={() => setSelectedOrderForDetail(order)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="ดูรายละเอียดบิล"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handlePrintOrder(order)}
                            className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition"
                            title="พิมพ์ใบเสร็จซ้ำ (Reprint)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredOrderHistory.length > orderPageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-400">
            <div>
              แสดง <strong className="text-slate-200">{(orderPage - 1) * orderPageSize + 1}</strong> ถึง{' '}
              <strong className="text-slate-200">{Math.min(orderPage * orderPageSize, filteredOrderHistory.length)}</strong> จาก{' '}
              <strong className="text-slate-200">{filteredOrderHistory.length}</strong> รายการ
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setOrderPage(p => Math.max(1, p - 1))}
                disabled={orderPage === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 font-mono text-slate-200 text-xs">
                {orderPage} / {totalOrderHistoryPages}
              </div>

              <button
                onClick={() => setOrderPage(p => Math.min(totalOrderHistoryPages, p + 1))}
                disabled={orderPage === totalOrderHistoryPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* ORDER DETAIL & RECEIPT MODAL */}
      {/* ------------------------------------------------------------- */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  รายละเอียดใบเสร็จ #{selectedOrderForDetail.orderNumber || selectedOrderForDetail.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thermal Receipt Style Box */}
            <div className="bg-white text-slate-900 p-5 rounded-2xl shadow-inner font-mono text-xs space-y-3">
              <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
                <div className="flex justify-center mb-2">
                  <img
                    src={settings?.shopLogoUrl || SHOP_LOGO_URL}
                    alt="Store Logo"
                    className="w-12 h-12 object-contain rounded-xl"
                    onError={(e) => {
                      if (e.currentTarget.src !== FALLBACK_SVG_LOGO) {
                        e.currentTarget.src = FALLBACK_SVG_LOGO;
                      }
                    }}
                  />
                </div>
                <p className="font-extrabold text-sm">{settings?.shopName || 'กะเพราซิ่ง (Kaprow Zing)'}</p>
                <p className="text-[11px] text-slate-600">
                  {branches.find(b => b.id === selectedOrderForDetail.branchId)?.name || currentBranch.name}
                </p>
                {branches.find(b => b.id === selectedOrderForDetail.branchId)?.address && (
                  <p className="text-[10px] text-slate-500">
                    {branches.find(b => b.id === selectedOrderForDetail.branchId)?.address}
                  </p>
                )}
                <p className="text-[10px] text-slate-500">
                  {selectedOrderForDetail.createdAt ? new Date(selectedOrderForDetail.createdAt).toLocaleString('th-TH') : '-'}
                </p>
                <p className="text-[10px] font-bold text-slate-700">
                  เลขที่บิล: #{selectedOrderForDetail.orderNumber || selectedOrderForDetail.id}
                </p>
                {selectedOrderForDetail.tableNumber && (
                  <p className="text-[11px] font-bold text-slate-800">
                    โต๊ะ: {selectedOrderForDetail.tableNumber}
                  </p>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3">
                {selectedOrderForDetail.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-[11px]">
                    <div className="flex-1 pr-2">
                      <span>{item.menuItem?.name || 'รายการ'}</span>
                      {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                        <div className="text-[9px] text-slate-500">
                          +{item.selectedAddOns.map(a => a.name).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="text-slate-600 whitespace-nowrap px-2">x{item.quantity}</div>
                    <div className="font-bold whitespace-nowrap">
                      ฿{(item.totalPrice || (item.menuItem?.price || 0) * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>ยอดรวม (Subtotal)</span>
                  <span>฿{(selectedOrderForDetail.subtotal || selectedOrderForDetail.grandTotal || 0).toFixed(2)}</span>
                </div>
                {Boolean(selectedOrderForDetail.discountAmount) && (
                  <div className="flex justify-between text-rose-600">
                    <span>ส่วนลด (Discount)</span>
                    <span>-฿{(selectedOrderForDetail.discountAmount || 0).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-900 font-extrabold text-sm pt-1 border-t border-slate-200">
                  <span>ยอดสุทธิ (Grand Total)</span>
                  <span>฿{(selectedOrderForDetail.grandTotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 text-[10px] pt-1">
                  <span>ช่องทางชำระเงิน</span>
                  <span className="font-bold">
                    {selectedOrderForDetail.paymentMethod === 'cash'
                      ? 'เงินสด'
                      : selectedOrderForDetail.paymentMethod === 'promptpay'
                      ? 'พร้อมเพย์ QR'
                      : selectedOrderForDetail.paymentMethod === 'credit'
                      ? 'บัตรเครดิต'
                      : selectedOrderForDetail.paymentMethod === 'transfer'
                      ? 'โอนเงิน'
                      : selectedOrderForDetail.paymentMethod || 'เงินสด'}
                  </span>
                </div>
                {Boolean(selectedOrderForDetail.tenderedAmount) && (
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>รับเงินมา / เงินทอน</span>
                    <span>
                      ฿{(selectedOrderForDetail.tenderedAmount || 0).toFixed(2)} / ฿{(selectedOrderForDetail.changeAmount || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div className="text-center text-[9px] text-slate-400 pt-2 border-t border-dashed border-slate-300">
                ขอบคุณที่ใช้บริการ / Thank you!
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => handlePrintOrder(selectedOrderForDetail)}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center justify-center space-x-2 active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบเสร็จ (Reprint)</span>
              </button>
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* DISCOUNT MODAL FOR SLOW MOVING ITEMS */}
      {/* ------------------------------------------------------------- */}
      {discountModalItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                <Tag className="w-4 h-4 text-sky-400" />
                <span>ปรับลดราคาเมนู "{discountModalItem.name}"</span>
              </h3>
              <button onClick={() => setDiscountModalItem(null)} className="text-slate-400 hover:text-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">ราคาเดิม: <strong className="text-amber-400 font-mono">฿{discountModalItem.price}</strong></p>
              <div>
                <label className="block text-slate-400 mb-1">จำนวนเงินที่ต้องการปรับลด (฿):</label>
                <input
                  type="number"
                  value={discountAmount}
                  onChange={e => setDiscountAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-amber-400 font-bold focus:outline-none focus:border-sky-500"
                />
              </div>
              <p className="text-emerald-400 font-mono">ราคาใหม่หลังปรับลด: <strong>฿{Math.max(10, discountModalItem.price - discountAmount)}</strong></p>
            </div>

            <button
              onClick={handleApplyDiscount}
              className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition"
            >
              ยืนยันการลดราคา (อัปเดตเมนูจริง)
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TELEGRAM / LINE DIGEST DISPATCH MODAL */}
      {/* ------------------------------------------------------------- */}
      {isTelegramModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-sky-500/30 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Send className="w-5 h-5 text-sky-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  ส่งรายงานสรุปเข้า Telegram / LINE OA
                </h3>
              </div>
              <button
                onClick={() => setIsTelegramModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs font-mono text-slate-300 leading-relaxed">
              <p className="text-amber-400 font-bold">📊 [Executive Analytics Digest - {currentBranch.name}]</p>
              <p>📅 วันที่: {todayStr}</p>
              <p>💰 ยอดขายวันนี้: ฿{todaySales.toLocaleString()}</p>
              <p>💵 กำไรสุทธิ: ฿{todayProfit.toLocaleString()}</p>
              <p>📦 Food Cost: {todayFoodCostPct}%</p>
              <p>🧾 จำนวนบิล: {todayBillCount} บิล (เฉลี่ย ฿{todayAvgBill}/บิล)</p>
              <p>⭐ Business Health Score: {businessHealthScore}/100</p>
            </div>

            {telegramStatusMessage && !telegramSentSuccess && (
              <div className="p-3 bg-red-950/80 border border-red-500/50 text-red-300 rounded-2xl text-xs text-center font-medium leading-relaxed">
                {telegramStatusMessage}
              </div>
            )}

            {telegramSentSuccess ? (
              <div className="p-3 bg-emerald-950 border border-emerald-500/50 text-emerald-300 rounded-2xl text-xs text-center font-bold flex items-center justify-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>ส่งรายงานสรุปไปยัง Telegram & LINE เรียบร้อยแล้ว!</span>
              </div>
            ) : (
              <button
                onClick={handleTriggerTelegramDigest}
                disabled={telegramSending}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-2xl text-xs transition flex items-center justify-center space-x-2 active:scale-95"
              >
                {telegramSending ? (
                  <span>กำลังส่งรายงานผ่าน Webhook...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>กดส่งรายงานให้ผู้บริหารทันที</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
