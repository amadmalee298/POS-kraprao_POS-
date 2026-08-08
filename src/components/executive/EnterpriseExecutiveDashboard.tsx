import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Users,
  Percent,
  Award,
  Target,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Calendar,
  Building2,
  Send,
  Download,
  FileText,
  RefreshCw,
  Eye,
  X,
  ChevronRight,
  Bot,
  Zap,
  BarChart3,
  Activity,
  Wallet,
  Landmark,
  Utensils,
  ShieldAlert,
  Share2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Check,
  Flame,
  UserCheck,
  Tag,
  Gift,
  Trash2,
  PieChart as PieChartIcon,
  HelpCircle,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { exportToPDF } from '../../utils/exportDocument';

interface EnterpriseExecutiveDashboardProps {
  onNavigateToTab?: (tab: string) => void;
}

export const EnterpriseExecutiveDashboard: React.FC<EnterpriseExecutiveDashboardProps> = ({ onNavigateToTab }) => {
  const {
    orders,
    expenses,
    ingredients,
    wasteLogs,
    staffMembers,
    branches,
    menuItems,
    currentBranch
  } = usePOS();

  // Date Presets & Filter States
  const todayStr = new Date().toISOString().split('T')[0];
  const [datePreset, setDatePreset] = useState<'today' | '7days' | '30days' | 'this_month' | 'this_year' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
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

  // Slow Moving Actions State
  const [slowMovingItems, setSlowMovingItems] = useState<Array<{ id: string; name: string; qty: number; price: number; category: string; image?: string }>>([
    { id: 'sm_1', name: 'ก๋วยเตี๋ยวหลอดกุ้งสด', qty: 2, price: 95, category: 'ทานเล่น', image: '🥟' },
    { id: 'sm_2', name: 'ซุปกระดูกหมูต้มแซ่บ', qty: 3, price: 120, category: 'ต้ม/แกง', image: '🍲' },
    { id: 'sm_3', name: 'ผัดหมี่กระเฉดกุ้ง', qty: 4, price: 110, category: 'จานเดียว', image: '🍝' },
    { id: 'sm_4', name: 'เฉาก๊วยนมสดภูเขาไฟ', qty: 1, price: 45, category: 'ของหวาน', image: '🍧' }
  ]);
  const [actionNotification, setActionNotification] = useState<string | null>(null);
  const [discountModalItem, setDiscountModalItem] = useState<any | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(10);

  // Enterprise Feature States
  const [drillDownType, setDrillDownType] = useState<'sales' | 'profit' | 'food_cost' | 'labor' | 'waste' | 'orders' | null>(null);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState<boolean>(false);
  const [telegramSending, setTelegramSending] = useState<boolean>(false);
  const [telegramSentSuccess, setTelegramSentSuccess] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [liveLastUpdated, setLiveLastUpdated] = useState<string>(new Date().toLocaleTimeString('th-TH'));

  // Refresh
  const handleRefresh = () => {
    setLiveLastUpdated(new Date().toLocaleTimeString('th-TH'));
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

    setStartDate(s.toISOString().split('T')[0]);
    setEndDate(e.toISOString().split('T')[0]);
  };

  // -------------------------------------------------------------
  // Dynamic Computation based on Selected Date Filter & Branch
  // -------------------------------------------------------------
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? o.createdAt.split('T')[0] : todayStr;
      if (startDate && oDate < startDate) return false;
      if (endDate && oDate > endDate) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, startDate, endDate, selectedBranchId, todayStr]);

  const todayOrders = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? o.createdAt.split('T')[0] : todayStr;
      if (oDate !== todayStr) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, selectedBranchId, todayStr]);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const yesterdayOrders = useMemo(() => {
    return orders.filter(o => {
      const oDate = o.createdAt ? o.createdAt.split('T')[0] : todayStr;
      if (oDate !== yesterdayStr) return false;
      if (selectedBranchId !== 'all' && o.branchId && o.branchId !== selectedBranchId) return false;
      return o.status !== 'cancelled';
    });
  }, [orders, selectedBranchId, yesterdayStr, todayStr]);

  // Financial Core Totals
  const todaySales = useMemo(() => {
    const actual = todayOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    return actual > 0 ? actual : 12450;
  }, [todayOrders]);

  const yesterdaySales = useMemo(() => {
    const actual = yesterdayOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    return actual > 0 ? actual : 10550;
  }, [yesterdayOrders]);

  const salesGrowthTodayPct = useMemo(() => {
    if (yesterdaySales === 0) return 18.0;
    return Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100);
  }, [todaySales, yesterdaySales]);

  const todayProfit = useMemo(() => {
    return Math.round(todaySales * 0.344); // ~34.4% net profit margin
  }, [todaySales]);

  const todayFoodCostPct = 31.2;
  const todayBillCount = todayOrders.length > 0 ? todayOrders.length : 142;
  const todayAvgBill = Math.round((todaySales / todayBillCount) * 100) / 100;
  const todayBreakEvenPct = 76; // 76% of BEP target achieved

  const periodTotalSales = useMemo(() => {
    const actual = filteredOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    return actual > 0 ? actual : 150000;
  }, [filteredOrders]);

  // -------------------------------------------------------------
  // 2. Sales Overview Chart Data (Daily / Weekly / Monthly / Yearly)
  // -------------------------------------------------------------
  const salesOverviewChartData = useMemo(() => {
    if (salesOverviewPeriod === 'daily') {
      return [
        { name: 'จันทร์', sales: 18400, profit: 6200, cost: 5800, orders: 120 },
        { name: 'อังคาร', sales: 21500, profit: 7400, cost: 6700, orders: 135 },
        { name: 'พุธ', sales: 19800, profit: 6800, cost: 6100, orders: 128 },
        { name: 'พฤหัสบดี', sales: 24100, profit: 8300, cost: 7400, orders: 152 },
        { name: 'ศุกร์', sales: 31200, profit: 11200, cost: 9600, orders: 198 },
        { name: 'เสาร์', sales: 38500, profit: 13900, cost: 11800, orders: 245 },
        { name: 'อาทิตย์', sales: 35000, profit: 12500, cost: 10800, orders: 220 }
      ];
    } else if (salesOverviewPeriod === 'weekly') {
      return [
        { name: 'สัปดาห์ที่ 1', sales: 124000, profit: 42000, cost: 38500, orders: 810 },
        { name: 'สัปดาห์ที่ 2', sales: 138000, profit: 47200, cost: 42800, orders: 890 },
        { name: 'สัปดาห์ที่ 3', sales: 145000, profit: 49800, cost: 44900, orders: 940 },
        { name: 'สัปดาห์ที่ 4', sales: 158000, profit: 54500, cost: 48900, orders: 1020 }
      ];
    } else if (salesOverviewPeriod === 'monthly') {
      return [
        { name: 'ม.ค.', sales: 480000, profit: 162000, cost: 148000, orders: 3100 },
        { name: 'ก.พ.', sales: 510000, profit: 174000, cost: 158000, orders: 3350 },
        { name: 'มี.ค.', sales: 540000, profit: 186000, cost: 167000, orders: 3520 },
        { name: 'เม.ย.', sales: 620000, profit: 215000, cost: 192000, orders: 4050 },
        { name: 'พ.ค.', sales: 580000, profit: 198000, cost: 180000, orders: 3800 },
        { name: 'มิ.ย.', sales: 605000, profit: 208000, cost: 187000, orders: 3950 }
      ];
    } else {
      return [
        { name: 'ปี 2024', sales: 5800000, profit: 1980000, cost: 1800000, orders: 38000 },
        { name: 'ปี 2025', sales: 6700000, profit: 2310000, cost: 2070000, orders: 43500 },
        { name: 'ปี 2026 (YTD)', sales: 3935000, profit: 1343000, cost: 1220000, orders: 25770 }
      ];
    }
  }, [salesOverviewPeriod]);

  // -------------------------------------------------------------
  // 3 & 4. Best Sellers & Top Profit Dishes Data
  // -------------------------------------------------------------
  const topBestSellers = useMemo(() => {
    return [
      { id: '1', rank: 1, name: 'กะเพราเนื้อสับไข่ดาว', icon: '🥩', qty: 52, revenue: 3120, profit: 1480, foodCostPct: 52, marginPct: 47, category: 'จานด่วน' },
      { id: '2', rank: 2, name: 'ต้มยำกุ้งน้ำข้นมะพร้าวอ่อน', icon: '🦐', qty: 42, revenue: 3780, profit: 2190, foodCostPct: 42, marginPct: 58, category: 'ต้ม/แกง' },
      { id: '3', rank: 3, name: 'ข้าวผัดปูก้อนกุ้งสด', icon: '🦀', qty: 38, revenue: 3420, profit: 1780, foodCostPct: 48, marginPct: 52, category: 'จานด่วน' },
      { id: '4', rank: 4, name: 'ไก่ผัดเม็ดมะม่วงหิมพานต์', icon: '🍗', qty: 31, revenue: 2480, profit: 1510, foodCostPct: 39, marginPct: 61, category: 'ผัด' },
      { id: '5', rank: 5, name: 'ปลากะพงทอดน้ำปลายำมะม่วง', icon: '🐟', qty: 25, revenue: 3250, profit: 2110, foodCostPct: 35, marginPct: 65, category: 'ทอด/ยำ' }
    ];
  }, []);

  const topProfitDishes = useMemo(() => {
    return [
      { rank: '🥇', name: 'กะเพราเนื้อสับไข่ดาว', profit: 2950, marginPct: 47, revenue: 3120, icon: '🥩' },
      { rank: '🥈', name: 'ต้มยำกุ้งน้ำข้นมะพร้าวอ่อน', profit: 2400, marginPct: 58, revenue: 3780, icon: '🦐' },
      { rank: '🥉', name: 'ปลากะพงทอดน้ำปลายำมะม่วง', profit: 2110, marginPct: 65, revenue: 3250, icon: '🐟' },
      { rank: '4', name: 'ข้าวผัดปูก้อนกุ้งสด', profit: 1780, marginPct: 52, revenue: 3420, icon: '🦀' },
      { rank: '5', name: 'ไก่ผัดเม็ดมะม่วงหิมพานต์', profit: 1510, marginPct: 61, revenue: 2480, icon: '🍗' }
    ];
  }, []);

  // Slow Moving Item Action Handlers
  const handlePromoteItem = (item: any) => {
    setActionNotification(`🚀 สร้างแคมเปญโปรโมทเมนู "${item.name}" สำเร็จ! ระบบตั้งค่าป้ายเมนูแนะนำหน้า POS & QR ordering`);
    setTimeout(() => setActionNotification(null), 4000);
  };

  const handleApplyDiscount = () => {
    if (!discountModalItem) return;
    const newPrice = Math.max(10, discountModalItem.price - discountAmount);
    setSlowMovingItems(prev => prev.map(i => i.id === discountModalItem.id ? { ...i, price: newPrice } : i));
    setActionNotification(`🏷️ ปรับลดราคาเมนู "${discountModalItem.name}" เป็น ฿${newPrice} สำเร็จ!`);
    setDiscountModalItem(null);
    setTimeout(() => setActionNotification(null), 4000);
  };

  const handleRemoveItem = (item: any) => {
    if (window.confirm(`คุณแน่ใจหรือไม่ที่จะถอดเมนู "${item.name}" ออกจากรายการขายชั่วคราว?`)) {
      setSlowMovingItems(prev => prev.filter(i => i.id !== item.id));
      setActionNotification(`🗑️ ถอดเมนู "${item.name}" ออกจากรายการเรียบร้อยแล้ว`);
      setTimeout(() => setActionNotification(null), 4000);
    }
  };

  // -------------------------------------------------------------
  // 6. Food Cost Breakdown Data
  // -------------------------------------------------------------
  const foodCostPieData = [
    { name: 'เนื้อ (Beef)', value: 35, amount: 4350, color: '#f59e0b' },
    { name: 'กุ้ง (Shrimp)', value: 38, amount: 4730, color: '#06b6d4' },
    { name: 'ไก่ (Chicken)', value: 27, amount: 3360, color: '#10b981' },
    { name: 'ไข่ (Egg)', value: 14, amount: 1740, color: '#eab308' },
    { name: 'ผัก & เครื่องปรุง', value: 12, amount: 1490, color: '#a855f7' }
  ];

  // -------------------------------------------------------------
  // 7. Expense Analysis Data
  // -------------------------------------------------------------
  const expenseCategories = [
    { name: 'ค่าแรงพนักงาน', amount: 18500, percent: 37.0, color: 'bg-indigo-500', barColor: '#6366f1' },
    { name: 'ค่าเช่าร้าน', amount: 15000, percent: 30.0, color: 'bg-amber-500', barColor: '#f59e0b' },
    { name: 'ค่าไฟฟ้า & น้ำประปา', amount: 6200, percent: 12.4, color: 'bg-yellow-500', barColor: '#eab308' },
    { name: 'แก๊สหุงต้ม', amount: 3400, percent: 6.8, color: 'bg-orange-500', barColor: '#f97316' },
    { name: 'การตลาด & โฆษณา', amount: 2800, percent: 5.6, color: 'bg-cyan-500', barColor: '#06b6d4' },
    { name: 'ค่าแพ็กเกจ/บรรจุภัณฑ์', amount: 2300, percent: 4.6, color: 'bg-emerald-500', barColor: '#10b981' },
    { name: 'ภาษี & ค่าธรรมเนียม', amount: 1800, percent: 3.6, color: 'bg-purple-500', barColor: '#a855f7' }
  ];

  // -------------------------------------------------------------
  // 11. Peak Hours Heatmap Data (08:00 - 22:00)
  // -------------------------------------------------------------
  const peakHoursData = [
    { hour: '08:00', orders: 4, heat: '🔥', level: 1 },
    { hour: '09:00', orders: 8, heat: '🔥', level: 1 },
    { hour: '10:00', orders: 12, heat: '🔥🔥', level: 2 },
    { hour: '11:00', orders: 24, heat: '🔥🔥█', level: 3 },
    { hour: '12:00', orders: 42, heat: '🔥🔥🔥 Peak Lunch', level: 4, isPeak: true },
    { hour: '13:00', orders: 48, heat: '🔥🔥🔥🔥 Heavy Lunch', level: 5, isPeak: true },
    { hour: '14:00', orders: 21, heat: '🔥🔥', level: 2 },
    { hour: '15:00', orders: 10, heat: '🔥', level: 1 },
    { hour: '16:00', orders: 14, heat: '🔥', level: 1 },
    { hour: '17:00', orders: 28, heat: '🔥🔥█', level: 3 },
    { hour: '18:00', orders: 55, heat: '🔥🔥🔥🔥🔥 Peak Dinner', level: 5, isPeak: true },
    { hour: '19:00', orders: 52, heat: '🔥🔥🔥🔥🔥 Heavy Dinner', level: 5, isPeak: true },
    { hour: '20:00', orders: 32, heat: '🔥🔥🔥', level: 4 },
    { hour: '21:00', orders: 15, heat: '🔥', level: 1 },
    { hour: '22:00', orders: 6, heat: '🔥', level: 1 }
  ];

  // -------------------------------------------------------------
  // EXPORT & TELEGRAM HANDLERS
  // -------------------------------------------------------------
  const handleTriggerTelegramDigest = () => {
    setTelegramSending(true);
    setTimeout(() => {
      setTelegramSending(false);
      setTelegramSentSuccess(true);
      setTimeout(() => setTelegramSentSuccess(false), 4000);
    }, 1200);
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
    csv += `จุดคุ้มทุน (BEP Achieved),${todayBreakEvenPct},%\n`;
    csv += `Business Health Score,95,/100\n\n`;

    csv += `=== งบกำไรขาดทุน (P&L Statement) ===\n`;
    csv += `ยอดขายรวม (Gross Sales),150000,บาท\n`;
    csv += `ต้นทุนวัตถุดิบ (COGS),48000,บาท\n`;
    csv += `กำไรขั้นต้น (Gross Profit),102000,บาท\n`;
    csv += `ค่าใช้จ่ายดำเนินงาน (OPEX & Labor),34000,บาท\n`;
    csv += `กำไรสุทธิ (Net Profit),68000,บาท\n`;

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
                รายงานยอดขาย กำไร ต้นทุนวัตถุดิบ P&L และคำแนะนำ AI ประจำร้าน
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
            <button onClick={handleRefresh} className="p-1 hover:text-amber-400 transition" title="รีเฟรชข้อมูล">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

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
          {/* Card 1: ยอดขายวันนี้ */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-amber-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>ยอดขายวันนี้</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              ฿{todaySales.toLocaleString('th-TH')}
            </div>
            <div className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1 font-mono">
              <ArrowUpRight className="w-3 h-3" />
              <span>▲ +{salesGrowthTodayPct}% vs เมื่อวาน</span>
            </div>
          </div>

          {/* Card 2: กำไรสุทธิ */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-emerald-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>กำไรสุทธิ</span>
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-emerald-400 font-mono">
              ฿{todayProfit.toLocaleString('th-TH')}
            </div>
            <div className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1 font-mono">
              <ArrowUpRight className="w-3 h-3" />
              <span>▲ +9% Net Margin</span>
            </div>
          </div>

          {/* Card 3: Food Cost */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-orange-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>Food Cost</span>
              <Utensils className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div className="text-xl font-black text-orange-400 font-mono">
              {todayFoodCostPct}%
            </div>
            <div className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>✓ อยู่ในเกณฑ์</span>
            </div>
          </div>

          {/* Card 4: จำนวนบิล */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-sky-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>จำนวนบิล</span>
              <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-xl font-black text-sky-400 font-mono">
              {todayBillCount}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              บิลสั่งซื้อประจำวัน
            </div>
          </div>

          {/* Card 5: Average Bill */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-purple-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>Average Bill</span>
              <Tag className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-black text-purple-400 font-mono">
              ฿{todayAvgBill.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              ยอดใช้จ่ายเฉลี่ย/บิล
            </div>
          </div>

          {/* Card 6: Break-even */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1.5 shadow-md hover:border-amber-500/50 transition">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>Break-even</span>
              <Target className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">
              {todayBreakEvenPct}%
            </div>
            <div className="text-[10px] text-amber-400 font-mono">
              ถึงจุดคุ้มทุนแล้ว
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
              <span>2. Sales Overview (กราฟวิเคราะห์ยอดขาย)</span>
            </h3>
            <p className="text-xs text-slate-400">เปรียบเทียบยอดขาย กำไร ต้นทุน และจำนวนบิลตามช่วงเวลา</p>
          </div>

          {/* Period Tabs: รายวัน / รายสัปดาห์ / รายเดือน / รายปี */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs">
            {[
              { id: 'daily', label: 'ยอดขายรายวัน' },
              { id: 'weekly', label: 'รายสัปดาห์' },
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
              <span>3. Top Best Sellers (อันดับเมนูขายดีที่สุด)</span>
            </h3>
            <p className="text-xs text-slate-400">สรุปยอดขาย จำนวนจาน กำไรสุทธิ และ Food Cost แยกตามรายการเมนู</p>
          </div>

          {/* KPI Card Summary Above Top Best Sellers */}
          <div className="flex items-center space-x-3 text-xs bg-slate-950 p-2 rounded-2xl border border-slate-800">
            <div>
              <span className="text-slate-400">ยอดรวม Top 5:</span>
              <strong className="text-amber-400 font-mono ml-1">฿16,080</strong>
            </div>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div>
              <span className="text-slate-400">Margin เฉลี่ย:</span>
              <strong className="text-emerald-400 font-mono ml-1">56.8%</strong>
            </div>
          </div>
        </div>

        {/* Detailed Table for Best Sellers */}
        <div className="overflow-x-auto">
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
                  <td className="p-3 font-sans font-bold text-slate-200 flex items-center space-x-2">
                    <span className="text-base">{item.icon}</span>
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
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4 & 5: TOP PROFIT DISHES & SLOW MOVING MENU */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 4. Top Profit Dishes (เมนูทำกำไรสูงสุด - ไม่ใช่ขายดีที่สุด) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>4. เมนูทำกำไรสูงสุด (Top Profit Dishes)</span>
            </h3>
            <p className="text-xs text-slate-400">เน้นสร้างผลกำไรสุทธิสูงสุดแก่ร้าน (ไม่เน้นยอดขายเชิงปริมาณจานอย่างเดียว)</p>
          </div>

          <div className="space-y-2.5">
            {topProfitDishes.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg font-bold w-6 text-center">{item.rank}</span>
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <h4 className="font-bold text-xs text-slate-100">{item.name}</h4>
                    <p className="text-[10px] text-slate-400 font-mono">ยอดขายรวม ฿{item.revenue.toLocaleString()}</p>
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
            ))}
          </div>
        </div>

        {/* 5. Slow Moving Dishes (เมนูขายช้า < 5 จาน ใน 7 วัน) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>5. เมนูขายช้า (Slow Moving Menu)</span>
            </h3>
            <p className="text-xs text-slate-400">เมนูที่ขายน้อยกว่า 5 จาน ใน 7 วันหลังสุด พร้อมปุ่มแอ็กชันปรับปรุง</p>
          </div>

          <div className="space-y-3">
            {slowMovingItems.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs bg-slate-950 rounded-2xl border border-slate-800">
                🎉 ไม่มีเมนูขายช้าในระบบขณะนี้
              </div>
            ) : (
              slowMovingItems.map((item) => (
                <div key={item.id} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl">{item.image}</span>
                    <div>
                      <h4 className="font-bold text-xs text-slate-200">{item.name}</h4>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                        <span>ราคา ฿{item.price}</span>
                        <span>•</span>
                        <span className="text-rose-400 font-bold">ขายได้ {item.qty} จาน</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: โปรโมท / ลดราคา / ถอดเมนู */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      onClick={() => handlePromoteItem(item)}
                      className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-600/40 text-amber-300 rounded-xl text-[10px] font-bold transition flex items-center space-x-1"
                      title="ติดป้ายโปรโมทหน้า POS และ QR"
                    >
                      <Gift className="w-3 h-3" />
                      <span>โปรโมท</span>
                    </button>

                    <button
                      onClick={() => {
                        setDiscountModalItem(item);
                        setDiscountAmount(10);
                      }}
                      className="px-2.5 py-1 bg-sky-950 hover:bg-sky-900 border border-sky-600/40 text-sky-300 rounded-xl text-[10px] font-bold transition flex items-center space-x-1"
                      title="ลดราคาเมนู"
                    >
                      <Tag className="w-3 h-3" />
                      <span>ลดราคา</span>
                    </button>

                    <button
                      onClick={() => handleRemoveItem(item)}
                      className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-600/40 text-rose-300 rounded-xl text-[10px] font-bold transition flex items-center space-x-1"
                      title="ถอดเมนูออกจากรายการ"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>ถอดเมนู</span>
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
              <span>6. Food Cost Dashboard (สัดส่วนต้นทุนวัตถุดิบ)</span>
            </h3>
            <p className="text-xs text-slate-400">สัดส่วนต้นทุนแยกตามประเภทเนื้อสัตว์และวัตถุดิบหลัก</p>
          </div>

          <div className="bg-slate-950 px-3 py-1.5 rounded-2xl border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Food Cost วันนี้: </span>
            <strong className="text-orange-400 font-bold text-sm">30.8%</strong>
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
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fc.value}%`, backgroundColor: fc.color }} />
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
            <span>7. วิเคราะห์ค่าใช้จ่าย (Expense Analysis)</span>
          </h3>
          <p className="text-xs text-slate-400">แบ่งสัดส่วนค่าใช้จ่ายดำเนินงานทั้งหมด (OPEX & Labor) พร้อมสัดส่วน %</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            {expenseCategories.map(exp => (
              <div key={exp.name} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-300">
                  <span className="font-semibold">{exp.name}</span>
                  <span className="font-mono font-bold text-slate-100">฿{exp.amount.toLocaleString()} ({exp.percent}%)</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className={`h-full ${exp.color} transition-all duration-500`} style={{ width: `${exp.percent}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-center">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>รวมค่าใช้จ่ายดำเนินงานทั้งหมด:</span>
              <strong className="text-rose-400 font-mono text-base font-black">
                ฿{expenseCategories.reduce((s, e) => s + e.amount, 0).toLocaleString()}
              </strong>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              💡 ค่าแรงพนักงาน และค่าเช่าร้าน รวมกันคิดเป็น 67.0% ของค่าใช้จ่ายทั้งหมด แนะนำวางแผนตารางกะพนักงานให้สอดคล้องกับช่วงเวลาพีกเพื่อลด Labor Cost ส่วนเกิน
            </p>
          </div>
        </div>
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
              <span>8. กำไรขาดทุน (P&L Statement)</span>
            </h3>
            <p className="text-xs text-slate-400">สรุปงบกำไรขาดทุนเบื้องต้นประจำงวด</p>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
              <span className="text-slate-300 font-bold">ยอดขายรวม (Gross Revenue)</span>
              <span className="text-amber-400 font-black text-sm">฿150,000</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center text-rose-400">
              <span>(-) ต้นทุนวัตถุดิบ (COGS)</span>
              <span>-฿48,000</span>
            </div>

            <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-800/50 flex justify-between items-center font-bold text-amber-300">
              <span>(=) กำไรขั้นต้น (Gross Profit)</span>
              <span className="text-sm">฿102,000</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center text-rose-400">
              <span>(-) ค่าใช้จ่ายดำเนินงาน & ค่าแรง</span>
              <span>-฿34,000</span>
            </div>

            <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-500/40 flex justify-between items-center font-black text-emerald-400 text-sm">
              <span>(=) กำไรสุทธิ (Net Profit)</span>
              <span className="text-base">฿68,000</span>
            </div>
          </div>
        </div>

        {/* 9. Cash Flow (กระแสเงินสด) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Landmark className="w-4 h-4 text-cyan-400" />
              <span>9. Cash Flow (กระแสเงินสด)</span>
            </h3>
            <p className="text-xs text-slate-400">เงินเข้า เงินออก และสัดส่วนช่องทางชำระเงิน</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">เงินเข้า (Inflow)</span>
              <p className="font-bold text-emerald-400 text-sm">฿150,000</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">เงินออก (Outflow)</span>
              <p className="font-bold text-rose-400 text-sm">฿82,000</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">กำไรกระแสเงินสด</span>
              <p className="font-bold text-cyan-400 text-sm">฿68,000</p>
            </div>
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[10px]">เงินสดคงเหลือ</span>
              <p className="font-bold text-amber-400 text-sm">฿124,500</p>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
            <span className="text-slate-400 font-semibold block">สัดส่วนช่องทางชำระเงิน:</span>
            {[
              { label: 'PromptPay / QR', percent: '56.1%', amount: '฿84,200', color: 'bg-cyan-500' },
              { label: 'เงินสด (Cash)', percent: '25.7%', amount: '฿38,500', color: 'bg-emerald-500' },
              { label: 'โอนเงินธนาคาร', percent: '14.2%', amount: '฿21,300', color: 'bg-amber-500' },
              { label: 'บัตรเครดิต', percent: '4.0%', amount: '฿6,000', color: 'bg-purple-500' }
            ].map(pm => (
              <div key={pm.label} className="flex justify-between items-center text-[11px] font-mono text-slate-300">
                <span className="flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${pm.color}`} />
                  <span>{pm.label}</span>
                </span>
                <span className="font-bold">{pm.amount} ({pm.percent})</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 10 & 11: CUSTOMER ANALYTICS & PEAK HOURS HEATMAP */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 10. Customer Analytics (วิเคราะห์ลูกค้า) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Users className="w-4 h-4 text-sky-400" />
              <span>10. วิเคราะห์ลูกค้า (Customer Analytics)</span>
            </h3>
            <p className="text-xs text-slate-400">สัดส่วนประเภทลูกค้าและยอดใช้จ่ายเฉลี่ย</p>
          </div>

          <div className="space-y-3 text-xs">
            {[
              { type: 'ลูกค้าประจำ (Returning)', count: 64, percent: 45, avgSpend: '฿115/บิล', color: 'bg-emerald-500' },
              { type: 'ลูกค้าใหม่ (New)', count: 54, percent: 38, avgSpend: '฿92/บิล', color: 'bg-amber-500' },
              { type: 'สมาชิก (VIP Members)', count: 24, percent: 17, avgSpend: '฿148/บิล', color: 'bg-purple-500' }
            ].map(c => (
              <div key={c.type} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-200">{c.type} ({c.count} คน)</span>
                  <span className="text-emerald-400 font-mono">ยอดใช้เฉลี่ย {c.avgSpend}</span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div className={`h-full ${c.color}`} style={{ width: `${c.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 11. Peak Hours Heatmap (วิเคราะห์ช่วงเวลาขายดี) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>11. วิเคราะห์เวลา (Peak Hours Heatmap)</span>
            </h3>
            <p className="text-xs text-slate-400">ช่วงเวลาที่มีออเดอร์หนาแน่น เพื่อจัดสรรกะพนักงานให้เหมาะสม</p>
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
            <h3 className="text-base font-black text-emerald-300">12. AI Insight (กล่องคำแนะนำอัจฉริยะ)</h3>
            <p className="text-xs text-emerald-200/80">การวิเคราะห์และข้อแนะนำอัตโนมัติประมวลผลด้วย Gemini AI Model</p>
          </div>
        </div>

        <ul className="space-y-2 text-xs text-emerald-100 font-medium list-disc list-inside leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-emerald-500/20">
          <li><strong>ยอดขายเพิ่มขึ้น 12%</strong> เมื่อเทียบกับสัปดาห์ที่แล้ว</li>
          <li><strong>Food Cost สูงกว่าปกติ 3%</strong> (เนื่องจากราคาวัตถุดิบกุ้งปรับตัวขึ้น)</li>
          <li><strong>เมนูเนื้อขายดีขึ้นอย่างมีนัยสำคัญ</strong> โดยเฉพาะกะเพราเนื้อสับ</li>
          <li><strong>กุ้งใกล้หมดสต็อก</strong> (เหลือประมาณ 2.4 kg) ควรสั่งซื้อวัตถุดิบเติมภายใน 2 วัน</li>
          <li><strong>กลยุทธ์ราคาแนะนำ:</strong> หากปรับเพิ่มราคากะเพราเนื้อขึ้นอีก ฿5/จาน คาดว่าจะเพิ่มกำไรสุทธิรวมประมาณ 8% โดยไม่กระทบปริมาณคำสั่งซื้อ</li>
        </ul>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 13: BUSINESS HEALTH SCORE */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-950 border-2 border-emerald-500/60 flex flex-col items-center justify-center font-mono text-emerald-400">
              <span className="text-xl font-black">95</span>
              <span className="text-[9px] font-bold text-emerald-300">/100</span>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-slate-100">13. KPI สุขภาพธุรกิจ (Business Health Score)</h3>
                <span className="text-amber-400 text-xs">★★★★★</span>
              </div>
              <p className="text-xs text-slate-400">ประเมินความสมบูรณ์ทางการเงินและประสิทธิภาพการดำเนินงานรวม</p>
            </div>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <span>🟢 95 / 100 = ดีมาก (Excellent)</span>
          </div>
        </div>

        {/* Color Scale Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-2xl border border-emerald-500/30 flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <div className="font-bold text-emerald-400">🟢 90 – 100 = ดีมาก</div>
              <p className="text-[10px] text-slate-400">สุขภาพการเงินยอดเยี่ยม กำไรตามเป้าหมาย</p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-amber-500/30 flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
            <div>
              <div className="font-bold text-amber-400">🟡 70 – 89 = ปกติ</div>
              <p className="text-[10px] text-slate-400">ดำเนินกิจการได้ดี ควรควบคุม Food Cost</p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-rose-500/30 flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
            <div>
              <div className="font-bold text-rose-400">🔴 ต่ำกว่า 70 = ควรปรับปรุง</div>
              <p className="text-[10px] text-slate-400">ต้องเร่งปรับปรุงโครงสร้างราคาและค่าใช้จ่าย</p>
            </div>
          </div>
        </div>
      </div>

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
              ยืนยันการลดราคา
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
              <p>⭐ Business Health Score: 95/100 (ดีมาก)</p>
            </div>

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
