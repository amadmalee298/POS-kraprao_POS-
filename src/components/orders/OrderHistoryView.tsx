import React, { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  Building2,
  Download,
  Printer,
  Eye,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  ShoppingBag,
  Receipt,
  Users,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  CreditCard,
  Banknote,
  Landmark,
  QrCode,
  History,
  CloudCheck,
  Phone,
  FileText
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Order, PaymentMethod } from '../../types';
import { printReceiptViaWindow } from '../../utils/printReceipt';
import { isFirebaseAvailable } from '../../services/firebaseService';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO } from '../../assets/logo';

export const OrderHistoryView: React.FC = () => {
  const {
    orders,
    branches,
    currentBranch,
    settings,
    currentUser,
    pullCloudOrders,
    syncOfflineQueue
  } = usePOS();

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom'>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'cancelled'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>('all');
  const [onlyWithCustomerInfo, setOnlyWithCustomerInfo] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Detail Modal
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Filtered Orders Logic
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Branch filter
    if (selectedBranchId !== 'all') {
      result = result.filter(o => o.branchId === selectedBranchId);
    }

    // Status filter
    if (statusFilter === 'completed') {
      result = result.filter(o => o.status === 'served');
    } else if (statusFilter === 'in_progress') {
      result = result.filter(o => o.status === 'pending' || o.status === 'cooking' || o.status === 'ready' || o.status === 'pending-qr');
    } else if (statusFilter === 'cancelled') {
      result = result.filter(o => o.status === 'cancelled');
    }

    // Payment Method filter
    if (paymentFilter !== 'all') {
      result = result.filter(o => o.paymentMethod === paymentFilter);
    }

    // Customer Info Filter
    if (onlyWithCustomerInfo) {
      result = result.filter(o => o.customerTaxInfo && (o.customerTaxInfo.companyName || o.customerTaxInfo.phone));
    }

    // Date filter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const sevenDaysAgo = startOfToday - 6 * 86400000;
    const thirtyDaysAgo = startOfToday - 29 * 86400000;

    if (dateFilter === 'today') {
      result = result.filter(o => new Date(o.createdAt).getTime() >= startOfToday);
    } else if (dateFilter === 'yesterday') {
      result = result.filter(o => {
        const t = new Date(o.createdAt).getTime();
        return t >= startOfYesterday && t < startOfToday;
      });
    } else if (dateFilter === '7days') {
      result = result.filter(o => new Date(o.createdAt).getTime() >= sevenDaysAgo);
    } else if (dateFilter === '30days') {
      result = result.filter(o => new Date(o.createdAt).getTime() >= thirtyDaysAgo);
    } else if (dateFilter === 'custom' && (customStartDate || customEndDate)) {
      result = result.filter(o => {
        const orderDate = new Date(o.createdAt).toISOString().split('T')[0];
        if (customStartDate && customEndDate) {
          return orderDate >= customStartDate && orderDate <= customEndDate;
        } else if (customStartDate) {
          return orderDate >= customStartDate;
        } else if (customEndDate) {
          return orderDate <= customEndDate;
        }
        return true;
      });
    }

    // Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(o => {
        const matchOrderNo = o.orderNumber?.toLowerCase().includes(q) || o.id?.toLowerCase().includes(q);
        const matchTable = o.tableNumber?.toLowerCase().includes(q);
        const matchCustomer = o.customerTaxInfo?.companyName?.toLowerCase().includes(q) ||
                              o.customerTaxInfo?.phone?.toLowerCase().includes(q) ||
                              o.customerTaxInfo?.taxId?.toLowerCase().includes(q);
        const matchItems = o.items?.some(it => it.menuItem?.name?.toLowerCase().includes(q));
        const matchAmount = o.grandTotal?.toString().includes(q);
        return matchOrderNo || matchTable || matchCustomer || matchItems || matchAmount;
      });
    }

    // Sort by createdAt descending
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [
    orders,
    selectedBranchId,
    statusFilter,
    paymentFilter,
    onlyWithCustomerInfo,
    dateFilter,
    customStartDate,
    customEndDate,
    searchQuery
  ]);

  // Statistics
  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(o => o.status === 'served');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.grandTotal || 0), 0);
    const avgTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
    const customerInvoicesCount = filteredOrders.filter(o => o.customerTaxInfo?.companyName).length;

    return {
      totalOrders,
      completedOrdersCount: completedOrders.length,
      totalRevenue,
      avgTicket,
      customerInvoicesCount
    };
  }, [filteredOrders]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Sync / Retrieve from Firestore
  const handleSyncFirestore = async () => {
    if (!isFirebaseAvailable()) {
      setSyncStatusMsg('ระบบคลาวด์ Firebase ยังไม่ได้เชื่อมต่อ');
      setTimeout(() => setSyncStatusMsg(null), 3000);
      return;
    }

    setIsSyncingFirestore(true);
    setSyncStatusMsg('กำลังซิงค์และบันทึกประวัติออเดอร์ลง Cloud Firestore...');

    try {
      // 1. Sync any pending offline queue
      await syncOfflineQueue();

      // 2. Pull fresh central orders from Cloud Firestore
      const pullRes = await pullCloudOrders();
      if (pullRes.success) {
        setSyncStatusMsg(`ซิงค์สำเร็จ! ดึงประวัติออเดอร์จาก Cloud Firestore แล้ว (${pullRes.count} รายการใหม่/อัปเดต)`);
      } else {
        setSyncStatusMsg('ซิงค์และเชื่อมต่อข้อมูลกับ Cloud Firestore เรียบร้อย');
      }
    } catch (err) {
      console.error('Failed to sync orders with Firestore:', err);
      setSyncStatusMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ Firestore');
    } finally {
      setIsSyncingFirestore(false);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'เลขที่บิล',
      'วันที่เวลาสร้าง',
      'เวลาเสร็จสิ้น',
      'สาขา',
      'โต๊ะ',
      'สถานะ',
      'ช่องทางชำระ',
      'ชื่อลูกค้า/บริษัท',
      'เลขผู้เสียภาษี',
      'เบอร์โทรลูกค้า',
      'รายการอาหาร',
      'ยอดรวมก่อนหัก (฿)',
      'ส่วนลด (฿)',
      'ภาษีมูลค่าเพิ่ม (฿)',
      'ยอดสุทธิ (฿)'
    ];

    const rows = filteredOrders.map(o => {
      const branchName = branches.find(b => b.id === o.branchId)?.name || o.branchId;
      const itemsStr = o.items
        ?.map(i => `${i.menuItem?.name || 'อาหาร'} x${i.quantity}${i.proteinChoice ? ` (${i.proteinChoice.name})` : ''}`)
        .join(' | ') || '';

      return [
        `"${o.orderNumber || o.id}"`,
        `"${new Date(o.createdAt).toLocaleString('th-TH')}"`,
        `"${o.completedAt ? new Date(o.completedAt).toLocaleString('th-TH') : '-'}"`,
        `"${branchName}"`,
        `"${o.tableNumber || '-'}"`,
        `"${o.status}"`,
        `"${o.paymentMethod}"`,
        `"${o.customerTaxInfo?.companyName || '-'}"`,
        `"${o.customerTaxInfo?.taxId || '-'}"`,
        `"${o.customerTaxInfo?.phone || '-'}"`,
        `"${itemsStr}"`,
        o.subtotal || o.grandTotal,
        o.discountAmount || 0,
        o.vatAmount || 0,
        o.grandTotal
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `order_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPaymentBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'cash':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Banknote className="w-3 h-3" />
            <span>เงินสด</span>
          </span>
        );
      case 'promptpay':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <QrCode className="w-3 h-3" />
            <span>พร้อมเพย์ QR</span>
          </span>
        );
      case 'credit':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <CreditCard className="w-3 h-3" />
            <span>บัตรเครดิต</span>
          </span>
        );
      case 'transfer':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Landmark className="w-3 h-3" />
            <span>โอนเงิน</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <span>{method}</span>
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'served':
      case 'completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-600/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>เสร็จสิ้น</span>
          </span>
        );
      case 'pending':
      case 'cooking':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950/60 text-amber-400 border border-amber-600/30">
            <Clock className="w-3 h-3" />
            <span>กำลังทำ</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-950/60 text-rose-400 border border-rose-600/30">
            <AlertTriangle className="w-3 h-3" />
            <span>ยกเลิก</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto text-slate-100 font-sans animate-in fade-in duration-200">
      
      {/* 1. Header Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 flex items-center justify-center shadow-lg shadow-orange-950/50 border border-orange-400/30 shrink-0">
            <History className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-100">
                ประวัติออเดอร์และบันทึกใบเสร็จ (Order History & Archive)
              </h2>
              <span className="bg-emerald-600 text-white font-black text-[10px] tracking-wider px-2 py-0.5 rounded-md uppercase flex items-center space-x-1">
                <CloudCheck className="w-3 h-3" />
                <span>FIRESTORE ARCHIVE</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              เก็บบันทึกประวัติการขายถาวรบน Cloud Firestore พร้อมข้อมูลลูกค้า เวลา และพิมพ์ใบเสร็จย้อนหลัง
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleSyncFirestore}
            disabled={isSyncingFirestore}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            title="ซิงค์และดึงประวัติออเดอร์จาก Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFirestore ? 'animate-spin' : ''}`} />
            <span>{isSyncingFirestore ? 'กำลังซิงค์...' : 'ซิงค์กับ Firestore'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm active:scale-95"
            title="ส่งออกรายการออเดอร์ตามตัวกรองเป็นไฟล์ Excel/CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ส่งออก CSV</span>
          </button>
        </div>
      </div>

      {/* Sync Status Toast Notice */}
      {syncStatusMsg && (
        <div className="p-3 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center space-x-2 animate-in fade-in duration-200">
          <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Sales */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">ยอดขายรวมตามตัวกรอง</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
            ฿{stats.totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400">
            จากบิลที่เสร็จสิ้น {stats.completedOrdersCount} บิล
          </p>
        </div>

        {/* Total Orders */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">จำนวนออเดอร์ทั้งหมด</span>
            <ShoppingBag className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-400 font-mono">
            {stats.totalOrders}
          </p>
          <p className="text-[11px] text-slate-400">
            รวมทุกสถานะตามตัวกรอง
          </p>
        </div>

        {/* Average Ticket */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">ยอดเฉลี่ยต่อบิล</span>
            <Receipt className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
            ฿{stats.avgTicket.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] text-slate-400">
            ยอดซื้อเฉลี่ยต่อออเดอร์
          </p>
        </div>

        {/* Customer Invoices */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">บิลที่มีข้อมูลลูกค้า</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-purple-400 font-mono">
            {stats.customerInvoicesCount}
          </p>
          <p className="text-[11px] text-slate-400">
            มีชื่อบริษัท / เลขผู้เสียภาษี
          </p>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        
        {/* Search Input and Branch Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหาเลขที่บิล (#KAP-...), โต๊ะ, ชื่อลูกค้า, เบอร์โทร, เลขผู้เสียภาษี, หรือชื่อเมนู..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Branch Select */}
          <div className="relative">
            <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <select
              value={selectedBranchId}
              onChange={e => {
                setSelectedBranchId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500 transition cursor-pointer"
            >
              <option value="all">ทุกสาขา (All Branches)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Filters & Status Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          
          {/* Date Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80 text-xs">
            <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>ช่วงเวลา:</span>
            </span>

            {[
              { id: 'today', label: 'วันนี้' },
              { id: 'yesterday', label: 'เมื่อวาน' },
              { id: '7days', label: '7 วันล่าสุด' },
              { id: '30days', label: '30 วันล่าสุด' },
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'custom', label: 'กำหนดเอง' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setDateFilter(tab.id as any);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-xl font-bold transition text-xs cursor-pointer ${
                  dateFilter === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Customer info toggle */}
          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <input
              type="checkbox"
              checked={onlyWithCustomerInfo}
              onChange={e => {
                setOnlyWithCustomerInfo(e.target.checked);
                setCurrentPage(1);
              }}
              className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500"
            />
            <span>เฉพาะบิลที่มีข้อมูลลูกค้า</span>
          </label>
        </div>

        {/* Custom Date Range Selectors */}
        {dateFilter === 'custom' && (
          <div className="flex items-center space-x-3 p-3 bg-slate-950 rounded-2xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium">ตั้งแต่วันที่:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => {
                setCustomStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-amber-500"
            />
            <span className="text-slate-400 font-medium">ถึงวันที่:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => {
                setCustomEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>
        )}

        {/* Secondary Filter Pills: Status & Payment Method */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-slate-800/80">
          
          {/* Status Pills */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 text-[11px] font-bold">สถานะ:</span>
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'completed', label: 'เสร็จสิ้น' },
              { id: 'in_progress', label: 'กำลังทำ' },
              { id: 'cancelled', label: 'ยกเลิก' }
            ].map(s => (
              <button
                key={s.id}
                onClick={() => {
                  setStatusFilter(s.id as any);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition text-[11px] cursor-pointer ${
                  statusFilter === s.id
                    ? 'bg-slate-200 text-slate-950 font-bold'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Payment Method Pills */}
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400 text-[11px] font-bold">วิธีชำระ:</span>
            {[
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'cash', label: 'เงินสด' },
              { id: 'promptpay', label: 'พร้อมเพย์' },
              { id: 'credit', label: 'บัตรเครดิต' },
              { id: 'transfer', label: 'โอนเงิน' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setPaymentFilter(p.id as any);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition text-[11px] cursor-pointer ${
                  paymentFilter === p.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Orders Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">วันที่ & เวลา</th>
                <th className="py-3 px-4">เลขที่บิล / โต๊ะ</th>
                <th className="py-3 px-4">สาขา</th>
                <th className="py-3 px-4">ข้อมูลลูกค้า / ผู้เสียภาษี</th>
                <th className="py-3 px-4">รายการอาหาร</th>
                <th className="py-3 px-4 text-right">ยอดสุทธิ</th>
                <th className="py-3 px-4">การชำระ</th>
                <th className="py-3 px-4">สถานะ</th>
                <th className="py-3 px-4 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <History className="w-10 h-10 mx-auto text-slate-700 mb-2 opacity-50" />
                    <p className="font-semibold text-sm text-slate-400">ไม่พบประวัติออเดอร์ตามเงื่อนไขที่เลือก</p>
                    <p className="text-xs text-slate-500 mt-0.5">ลองปรับตัวกรองช่วงเวลา หรือคำค้นหาใหม่อีกครั้ง</p>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map(ord => {
                  const branchName = branches.find(b => b.id === ord.branchId)?.name || currentBranch.name;
                  const customerName = ord.customerTaxInfo?.companyName;
                  const customerPhone = ord.customerTaxInfo?.phone;

                  return (
                    <tr key={ord.id} className="hover:bg-slate-800/40 transition">
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-200">
                          {new Date(ord.createdAt).toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit'
                          })}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(ord.createdAt).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {ord.completedAt && (
                            <span className="text-emerald-400" title={`เสร็จเมื่อ ${new Date(ord.completedAt).toLocaleTimeString('th-TH')}`}>
                              • สำเร็จ
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Order Number & Table */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-amber-400">
                          #{ord.orderNumber || ord.id.slice(-6).toUpperCase()}
                        </div>
                        {ord.tableNumber ? (
                          <span className="inline-block px-1.5 py-0.2 bg-slate-800 text-amber-300 border border-slate-700 rounded text-[10px] font-medium mt-0.5">
                            โต๊ะ {ord.tableNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">กลับบ้าน / Delivery</span>
                        )}
                      </td>

                      {/* Branch */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-slate-300 font-medium">{branchName}</span>
                      </td>

                      {/* Customer Details */}
                      <td className="py-3 px-4 max-w-[180px]">
                        {customerName ? (
                          <div>
                            <div className="font-bold text-slate-200 truncate" title={customerName}>
                              {customerName}
                            </div>
                            {customerPhone && (
                              <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                                <Phone className="w-3 h-3 text-slate-500" />
                                <span>{customerPhone}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">ลูกค้าทั่วไป</span>
                        )}
                      </td>

                      {/* Food Items */}
                      <td className="py-3 px-4 max-w-[220px]">
                        <div className="text-slate-300 truncate font-medium" title={ord.items.map(i => `${i.menuItem?.name} x${i.quantity}`).join(', ')}>
                          {ord.items.map(i => `${i.menuItem?.name || 'รายการ'} x${i.quantity}`).join(', ')}
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {ord.items.reduce((s, i) => s + (i.quantity || 1), 0)} ชิ้น
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono font-black text-amber-400 text-sm">
                          ฿{(ord.grandTotal || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                        {ord.discountAmount && ord.discountAmount > 0 ? (
                          <div className="text-[10px] text-rose-400 font-mono">
                            -฿{ord.discountAmount.toFixed(2)}
                          </div>
                        ) : null}
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getPaymentBadge(ord.paymentMethod)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(ord.status)}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setSelectedOrderForDetail(ord)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg transition active:scale-95"
                            title="ดูรายละเอียดใบเสร็จ"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              await printReceiptViaWindow(ord, currentBranch, settings, {
                                cashierName: currentUser.name.split(' ')[0]
                              });
                            }}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition active:scale-95"
                            title="พิมพ์ใบเสร็จซ้ำ"
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

        {/* Pagination Footer */}
        {filteredOrders.length > 0 && (
          <div className="flex items-center justify-between p-4 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400">
            <div>
              แสดง {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredOrders.length)} จาก {filteredOrders.length} ออเดอร์
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
              >
                <option value={10}>10 บิล/หน้า</option>
                <option value={15}>15 บิล/หน้า</option>
                <option value={25}>25 บิล/หน้า</option>
                <option value={50}>50 บิล/หน้า</option>
              </select>

              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-bold text-slate-200">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Order Detail & Thermal Receipt Modal */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            {/* Modal Topbar */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">
                  รายละเอียดออเดอร์ #{selectedOrderForDetail.orderNumber || selectedOrderForDetail.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Thermal Paper Style Box */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="bg-white text-slate-900 p-5 rounded-2xl shadow-inner font-mono text-xs space-y-3">
                
                {/* Store Branding Header with Logo from file 4 */}
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
                  <p className="font-extrabold text-sm">{settings?.shopName || 'ครัวกะเพรา POS ENTERPRISE'}</p>
                  <p className="text-[11px] text-slate-600">
                    {branches.find(b => b.id === selectedOrderForDetail.branchId)?.name || currentBranch.name}
                  </p>
                  {branches.find(b => b.id === selectedOrderForDetail.branchId)?.address && (
                    <p className="text-[10px] text-slate-500">
                      {branches.find(b => b.id === selectedOrderForDetail.branchId)?.address}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-500">
                    เวลาสั่ง: {new Date(selectedOrderForDetail.createdAt).toLocaleString('th-TH')}
                  </p>
                  {selectedOrderForDetail.completedAt && (
                    <p className="text-[10px] text-emerald-600 font-semibold">
                      เวลาเสร็จ: {new Date(selectedOrderForDetail.completedAt).toLocaleString('th-TH')}
                    </p>
                  )}
                  <p className="text-[10px] font-bold text-slate-700">
                    เลขที่บิล: #{selectedOrderForDetail.orderNumber || selectedOrderForDetail.id}
                  </p>
                  {selectedOrderForDetail.tableNumber && (
                    <p className="text-[11px] font-bold text-slate-800">
                      โต๊ะ: {selectedOrderForDetail.tableNumber}
                    </p>
                  )}
                </div>

                {/* Customer Information if available */}
                {selectedOrderForDetail.customerTaxInfo && selectedOrderForDetail.customerTaxInfo.companyName && (
                  <div className="border-b border-dashed border-slate-300 pb-2.5 text-[10px] space-y-0.5 bg-slate-50 p-2 rounded-lg">
                    <div className="font-bold text-slate-900 flex items-center space-x-1">
                      <Users className="w-3 h-3 text-slate-600" />
                      <span>ข้อมูลลูกค้า/ใบกำกับภาษี:</span>
                    </div>
                    <div className="font-semibold text-slate-800">
                      {selectedOrderForDetail.customerTaxInfo.companyName}
                    </div>
                    {selectedOrderForDetail.customerTaxInfo.taxId && (
                      <div className="text-slate-600">
                        เลขผู้เสียภาษี: {selectedOrderForDetail.customerTaxInfo.taxId}
                      </div>
                    )}
                    {selectedOrderForDetail.customerTaxInfo.phone && (
                      <div className="text-slate-600">
                        เบอร์โทร: {selectedOrderForDetail.customerTaxInfo.phone}
                      </div>
                    )}
                    {selectedOrderForDetail.customerTaxInfo.address && (
                      <div className="text-slate-600">
                        ที่อยู่: {selectedOrderForDetail.customerTaxInfo.address}
                      </div>
                    )}
                  </div>
                )}

                {/* Items List (WITHOUT spice level) */}
                <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3">
                  {selectedOrderForDetail.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start text-[11px]">
                      <div className="flex-1 pr-2">
                        <span className="font-semibold">{item.menuItem?.name || 'รายการ'}</span>
                        {item.proteinChoice && (
                          <span className="text-slate-600 text-[10px] ml-1">({item.proteinChoice.name})</span>
                        )}
                        {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                          <div className="text-[9px] text-slate-500">
                            +{item.selectedAddOns.map(a => a.name).join(', ')}
                          </div>
                        )}
                        {item.specialNotes && (
                          <div className="text-[9px] text-slate-400 italic">
                            หมายเหตุ: {item.specialNotes}
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
                    <span>ยอดรวมสินค้า</span>
                    <span>฿{(selectedOrderForDetail.subtotal || selectedOrderForDetail.grandTotal).toFixed(2)}</span>
                  </div>
                  {selectedOrderForDetail.discountAmount && selectedOrderForDetail.discountAmount > 0 ? (
                    <div className="flex justify-between text-rose-600">
                      <span>ส่วนลด</span>
                      <span>-฿{selectedOrderForDetail.discountAmount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  {selectedOrderForDetail.vatAmount && selectedOrderForDetail.vatAmount > 0 ? (
                    <div className="flex justify-between text-slate-600">
                      <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span>
                      <span>฿{selectedOrderForDetail.vatAmount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between font-extrabold text-sm border-t border-dashed border-slate-300 pt-1.5">
                    <span>ยอดสุทธิ</span>
                    <span>฿{selectedOrderForDetail.grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Breakdown */}
                <div className="border-t border-dashed border-slate-300 pt-2 text-[10px] space-y-0.5 text-slate-600">
                  <div className="flex justify-between">
                    <span>ช่องทางชำระเงิน:</span>
                    <span className="font-bold text-slate-800 uppercase">{selectedOrderForDetail.paymentMethod}</span>
                  </div>
                  {selectedOrderForDetail.tenderedAmount !== undefined && (
                    <div className="flex justify-between">
                      <span>รับเงินมา:</span>
                      <span>฿{selectedOrderForDetail.tenderedAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrderForDetail.changeAmount !== undefined && selectedOrderForDetail.changeAmount > 0 && (
                    <div className="flex justify-between">
                      <span>เงินทอน:</span>
                      <span>฿{selectedOrderForDetail.changeAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Footer Note */}
                <div className="text-center pt-2 text-[10px] text-slate-500">
                  <p>ขอบคุณที่ใช้บริการ</p>
                  <p className="text-[8px] text-slate-400 mt-0.5">ระบบบันทึกประวัติออเดอร์อัตโนมัติ Cloud Firestore</p>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end space-x-2">
              <button
                onClick={() => setSelectedOrderForDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
              >
                ปิดหน้าต่าง
              </button>
              <button
                onClick={async () => {
                  await printReceiptViaWindow(selectedOrderForDetail, currentBranch, settings, {
                    cashierName: currentUser.name.split(' ')[0]
                  });
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-black rounded-xl transition flex items-center space-x-1.5 shadow-md active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบเสร็จ (Print Receipt)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
