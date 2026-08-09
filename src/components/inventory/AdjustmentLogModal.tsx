import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  Plus,
  Trash2,
  X,
  Clock,
  User,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  Tag,
  ClipboardList
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { StockAdjustmentReason, StockAdjustmentLog } from '../../types';

interface AdjustmentLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIngredientId?: string;
}

const REASON_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  restock: { label: 'เติมสต๊อกเพิ่ม (Restock)', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  waste: { label: 'ของเสีย/ทิ้ง (Waste)', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  spoilage: { label: 'เน่าเสีย/หมดอายุ (Spoilage)', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  damaged: { label: 'ชำรุด/แตกหัก (Damaged)', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  expired: { label: 'หมดอายุ (Expired)', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  audit_correction: { label: 'ปรับตามผลตรวจนับ (Audit Correction)', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
  manual_adjustment: { label: 'ปรับยอดระบุเอง (Manual Adjustment)', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  cooking_prep: { label: 'เตรียมเบิกปรุงอาหาร (Cooking Prep)', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  other: { label: 'อื่นๆ (Other)', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' }
};

export const AdjustmentLogModal: React.FC<AdjustmentLogModalProps> = ({
  isOpen,
  onClose,
  selectedIngredientId
}) => {
  const {
    ingredients,
    stockAdjustmentLogs,
    recordStockAdjustment,
    deleteStockAdjustmentLog,
    clearStockAdjustmentLogs,
    currentUser
  } = usePOS();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [ingFilter, setIngFilter] = useState<string>(selectedIngredientId || 'all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7days'>('all');

  // New Adjustment Form State
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [targetIngId, setTargetIngId] = useState<string>(selectedIngredientId || ingredients[0]?.id || '');
  const [adjustMode, setAdjustMode] = useState<'set' | 'add' | 'subtract'>('add');
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [reason, setReason] = useState<StockAdjustmentReason>('restock');
  const [notes, setNotes] = useState('');
  const [userName, setUserName] = useState(currentUser?.name || 'ผู้จัดการ สมชาย');
  const [formError, setFormError] = useState('');

  // Selected Ingredient for Form
  const currentTargetIng = useMemo(() => {
    return ingredients.find(i => i.id === targetIngId) || ingredients[0];
  }, [ingredients, targetIngId]);

  // Calculated Preview New Stock
  const previewNewStock = useMemo(() => {
    if (!currentTargetIng) return 0;
    const amount = parseFloat(adjustAmount) || 0;
    if (adjustMode === 'set') return Math.max(0, amount);
    if (adjustMode === 'add') return Math.max(0, currentTargetIng.currentStock + amount);
    if (adjustMode === 'subtract') return Math.max(0, currentTargetIng.currentStock - amount);
    return currentTargetIng.currentStock;
  }, [currentTargetIng, adjustMode, adjustAmount]);

  // Change Quantity (+ / -)
  const previewChangeQty = useMemo(() => {
    if (!currentTargetIng) return 0;
    return parseFloat((previewNewStock - currentTargetIng.currentStock).toFixed(3));
  }, [currentTargetIng, previewNewStock]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

    return stockAdjustmentLogs.filter(log => {
      // Ingredient filter
      if (ingFilter !== 'all' && log.ingredientId !== ingFilter) return false;

      // Reason filter
      if (reasonFilter !== 'all' && log.reason !== reasonFilter) return false;

      // Time filter
      const logTime = new Date(log.timestamp).getTime();
      if (timeFilter === 'today' && logTime < startOfToday) return false;
      if (timeFilter === '7days' && logTime < sevenDaysAgo) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ingMatch = log.ingredientName.toLowerCase().includes(q);
        const notesMatch = (log.notes || '').toLowerCase().includes(q);
        const userMatch = log.userName.toLowerCase().includes(q);
        const reasonMatch = (REASON_LABELS[log.reason]?.label || log.reason).toLowerCase().includes(q);
        if (!ingMatch && !notesMatch && !userMatch && !reasonMatch) return false;
      }

      return true;
    });
  }, [stockAdjustmentLogs, ingFilter, reasonFilter, timeFilter, searchQuery]);

  // Statistics Summary
  const stats = useMemo(() => {
    let totalAdded = 0;
    let totalDeducted = 0;
    filteredLogs.forEach(l => {
      if (l.changeQty > 0) totalAdded += l.changeQty;
      else if (l.changeQty < 0) totalDeducted += Math.abs(l.changeQty);
    });
    return {
      count: filteredLogs.length,
      totalAdded: parseFloat(totalAdded.toFixed(2)),
      totalDeducted: parseFloat(totalDeducted.toFixed(2))
    };
  }, [filteredLogs]);

  // Handle Form Submission
  const handleSubmitAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTargetIng) {
      setFormError('กรุณาเลือกวัตถุดิบ');
      return;
    }
    const val = parseFloat(adjustAmount);
    if (isNaN(val) || val < 0) {
      setFormError('กรุณาระบุจำนวนตัวเลขที่ถูกต้อง');
      return;
    }

    recordStockAdjustment(
      currentTargetIng.id,
      previewNewStock,
      reason,
      notes.trim(),
      userName.trim() || currentUser?.name || 'ผู้จัดการ',
      currentUser?.role || 'manager'
    );

    // Reset Form
    setAdjustAmount('');
    setNotes('');
    setFormError('');
    setIsAddFormOpen(false);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = [
      'ID รายการ',
      'วัน-เวลา (ISO)',
      'วัน-เวลา (ไทย)',
      'วัตถุดิบ',
      'ยอดก่อนปรับ',
      'ยอดหลังปรับ',
      'จำนวนที่เปลี่ยนแปลง (+/-)',
      'หน่วย',
      'สาเหตุการปรับ',
      'หมายเหตุ',
      'ผู้ทำรายการ'
    ];

    const rows = filteredLogs.map(log => {
      const dateStr = new Date(log.timestamp).toLocaleString('th-TH');
      const reasonLabel = REASON_LABELS[log.reason]?.label || log.reason;
      return [
        `"${log.id}"`,
        `"${log.timestamp}"`,
        `"${dateStr}"`,
        `"${log.ingredientName.replace(/"/g, '""')}"`,
        log.previousStock,
        log.newStock,
        log.changeQty > 0 ? `+${log.changeQty}` : log.changeQty,
        `"${log.unit}"`,
        `"${reasonLabel.replace(/"/g, '""')}"`,
        `"${(log.notes || '').replace(/"/g, '""')}"`,
        `"${log.userName.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `stock_adjustment_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  ประวัติการปรับยอดสต็อกวัตถุดิบ (Stock Adjustment Log)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {stockAdjustmentLogs.length} รายการ
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                บันทึกเหตุการณ์ปรับเพิ่ม/ลดสต็อกแบบละเอียด พร้อมระบุสาเหตุ (เสีย, เติมสต๊อก, ชำรุด) และผู้ทำรายการ
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>บันทึกการปรับสต็อกใหม่</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl transition flex items-center space-x-1"
              title="ส่งออก CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Record New Adjustment Form */}
        {isAddFormOpen && (
          <form
            onSubmit={handleSubmitAdjustment}
            className="p-4 bg-slate-950/90 border-b border-amber-500/30 space-y-3 shrink-0 animate-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
                <ClipboardList className="w-4 h-4" />
                <span>+ แบบฟอร์มบันทึกการปรับเปลี่ยนยอดสต็อก (Record Stock Adjustment)</span>
              </span>
              <button
                type="button"
                onClick={() => setIsAddFormOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-xs"
              >
                ปิดแบบฟอร์ม
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Select Ingredient */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">วัตถุดิบ *</label>
                <select
                  value={targetIngId}
                  onChange={e => setTargetIngId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-bold"
                >
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (คงเหลือ: {i.currentStock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Mode & Amount */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">รูปแบบ & จำนวน *</label>
                <div className="flex items-center space-x-1.5">
                  <select
                    value={adjustMode}
                    onChange={e => setAdjustMode(e.target.value as any)}
                    className="px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="add">+ เติมเพิ่ม</option>
                    <option value="subtract">- ปรับลดลง</option>
                    <option value="set">= ตั้งยอดใหม่</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    placeholder="ระบุจำนวน"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                    required
                  />
                  <span className="text-slate-400 font-mono text-xs">{currentTargetIng?.unit}</span>
                </div>
              </div>

              {/* Reason Selection */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">สาเหตุการปรับ *</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value as StockAdjustmentReason)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
                >
                  <option value="restock">เติมสต๊อกเพิ่ม (Restock)</option>
                  <option value="waste">ของเสีย/ทิ้ง (Waste)</option>
                  <option value="spoilage">เน่าเสีย/หมดอายุ (Spoilage)</option>
                  <option value="damaged">ชำรุด/แตกหัก (Damaged)</option>
                  <option value="expired">หมดอายุ (Expired)</option>
                  <option value="audit_correction">ปรับตามผลตรวจนับ (Audit Correction)</option>
                  <option value="manual_adjustment">ปรับยอดระบุเอง (Manual Adjustment)</option>
                  <option value="cooking_prep">เตรียมเบิกปรุงอาหาร (Cooking Prep)</option>
                  <option value="other">อื่นๆ (Other)</option>
                </select>
              </div>

              {/* Notes & Submitter */}
              <div>
                <label className="block text-slate-400 mb-1 font-medium">ผู้ทำรายการ / หมายเหตุ</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="ระบุหมายเหตุ เช่น เลขที่ใบเสร็จ..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Preview Summary & Submit */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
              <div className="flex items-center space-x-3 font-mono text-slate-300">
                <span>เดิม: <strong className="text-white">{currentTargetIng?.currentStock} {currentTargetIng?.unit}</strong></span>
                <span>➔</span>
                <span>ใหม่: <strong className="text-amber-400">{previewNewStock} {currentTargetIng?.unit}</strong></span>
                <span className={`px-2 py-0.5 rounded font-bold ${
                  previewChangeQty > 0 ? 'bg-emerald-500/20 text-emerald-400' : previewChangeQty < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  ({previewChangeQty > 0 ? `+${previewChangeQty}` : previewChangeQty} {currentTargetIng?.unit})
                </span>
              </div>

              {formError && <span className="text-rose-400 font-bold">{formError}</span>}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow transition flex items-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>บันทึกการปรับเปลี่ยน</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Filter Controls Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-3 shrink-0">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ค้นหาวัตถุดิบ, หมายเหตุ, หรือชื่อผู้ปรับรายการ..."
                className="w-full pl-10 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Ingredient Filter Dropdown */}
            <div className="flex items-center space-x-2">
              <Package className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={ingFilter}
                onChange={e => setIngFilter(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
              >
                <option value="all">วัตถุดิบทั้งหมด (All Items)</option>
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </select>
            </div>

            {/* Reason Filter Dropdown */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={reasonFilter}
                onChange={e => setReasonFilter(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-amber-500 font-medium"
              >
                <option value="all">สาเหตุทั้งหมด (All Reasons)</option>
                {Object.entries(REASON_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Time Filter Buttons */}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                onClick={() => setTimeFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  timeFilter === 'all' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setTimeFilter('today')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  timeFilter === 'today' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                วันนี้
              </button>
              <button
                onClick={() => setTimeFilter('7days')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  timeFilter === '7days' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                7 วัน
              </button>
            </div>
          </div>
        </div>

        {/* Content Table Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center space-y-3 bg-slate-950/50 rounded-2xl border border-slate-800/80 my-4">
              <div className="p-3.5 bg-slate-800 text-slate-500 rounded-2xl w-fit mx-auto border border-slate-700">
                <History className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-300 text-sm">ไม่พบประวัติการปรับสต็อก</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                ไม่พบประวัติย้อนหลังที่ตรงกับตัวกรองปัจจุบัน ลองเปลี่ยนคำค้นหา หรือกด "บันทึกการปรับสต็อกใหม่" ด้านบน
              </p>
            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">วัน-เวลา (Timestamp)</th>
                    <th className="px-4 py-3 font-semibold">วัตถุดิบ</th>
                    <th className="px-4 py-3 font-semibold text-center">การเปลี่ยนแปลง (+/-)</th>
                    <th className="px-4 py-3 font-semibold text-center">ยอดคงเหลือ (ก่อน ➔ หลัง)</th>
                    <th className="px-4 py-3 font-semibold">สาเหตุที่ปรับ</th>
                    <th className="px-4 py-3 font-semibold">ผู้ทำรายการ / หมายเหตุ</th>
                    <th className="px-4 py-3 font-semibold text-right">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredLogs.map(log => {
                    const rStyle = REASON_LABELS[log.reason] || {
                      label: log.reason,
                      color: 'text-slate-300',
                      bg: 'bg-slate-800 border-slate-700'
                    };
                    const isPositive = log.changeQty > 0;

                    return (
                      <tr key={log.id} className="hover:bg-slate-900/60 transition group">
                        {/* Timestamp */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5 font-mono text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <div>
                              <span className="block text-slate-200 font-semibold">
                                {new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              <span className="block text-[10px] text-slate-500">
                                {new Date(log.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Ingredient Name */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
                              <Package className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-bold text-white text-xs">{log.ingredientName}</span>
                          </div>
                        </td>

                        {/* Quantity Change Badge */}
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span>{isPositive ? `+${log.changeQty}` : log.changeQty} {log.unit}</span>
                          </span>
                        </td>

                        {/* Prev ➔ New Stock */}
                        <td className="px-4 py-3 whitespace-nowrap text-center font-mono text-[11px]">
                          <span className="text-slate-400">{log.previousStock}</span>
                          <span className="text-slate-600 mx-1.5">➔</span>
                          <span className="text-amber-400 font-bold">{log.newStock}</span>
                          <span className="text-slate-500 ml-1">{log.unit}</span>
                        </td>

                        {/* Reason */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${rStyle.bg} ${rStyle.color}`}>
                            {rStyle.label}
                          </span>
                        </td>

                        {/* User & Notes */}
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-1 text-slate-300 font-medium">
                              <User className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{log.userName}</span>
                            </div>
                            {log.notes && (
                              <p className="text-[11px] text-slate-400 italic line-clamp-1">{log.notes}</p>
                            )}
                          </div>
                        </td>

                        {/* Delete Log */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <button
                            onClick={() => deleteStockAdjustmentLog(log.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition opacity-60 group-hover:opacity-100"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 font-mono shrink-0">
          <div className="flex items-center space-x-4">
            <span>แสดงทั้งหมด: <strong className="text-white">{filteredLogs.length}</strong> รายการ</span>
            <span className="text-emerald-400">เพิ่มรวม: +{stats.totalAdded}</span>
            <span className="text-rose-400">ลดรวม: -{stats.totalDeducted}</span>
          </div>

          <div className="flex items-center space-x-2">
            {stockAdjustmentLogs.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติการปรับสต็อกทั้งหมด?')) {
                    clearStockAdjustmentLogs();
                  }
                }}
                className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 rounded-xl text-xs font-bold transition flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ล้างประวัติทั้งหมด</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
