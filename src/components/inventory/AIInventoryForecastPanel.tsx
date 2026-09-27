import React, { useState, useEffect } from 'react';
import { forecastInventory } from '../../utils/stockHistory';
import { usePOS } from '../../context/POSContext';
import {
  Sparkles,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  PackageCheck,
  Zap,
  RefreshCw,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Truck,
  ShoppingCart,
  FileSpreadsheet,
  ChevronRight,
  Filter,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  X,
  Printer,
  ShieldAlert,
  Flame
} from 'lucide-react';
import { exportToPDF, exportToPNG } from '../../utils/exportDocument';

export interface InventoryForecastItem {
  ingredientId: string;
  ingredientName: string;
  currentStock: number;
  unit: string;
  minStockAlert: number;
  dailyConsumptionRate: number;
  daysUntilStockout: number;
  riskLevel: 'CRITICAL' | 'WARNING' | 'OPTIMAL';
  isHighDemand: boolean;
  suggestedReorderQty: number;
  estimatedReorderCost: number;
  forecastNote: string;
  supplierAdvice?: string;
}

export const AIInventoryForecastPanel: React.FC = () => {
  const { ingredients, orders, menuItems, addOns } = usePOS();

  const [forecastDays, setForecastDays] = useState<number>(7);
  const [filterRisk, setFilterRisk] = useState<'all' | 'CRITICAL' | 'WARNING' | 'OPTIMAL' | 'HIGH_DEMAND'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sourceEngine, setSourceEngine] = useState<string>('');

  const [forecastItems, setForecastItems] = useState<InventoryForecastItem[]>([]);
  const [summaryText, setSummaryText] = useState<string>('');

  // PO Draft Modal State
  const [isPODraftOpen, setIsPODraftOpen] = useState<boolean>(false);
  const [selectedForPO, setSelectedForPO] = useState<Record<string, boolean>>({});
  const [customOrderQtys, setCustomOrderQtys] = useState<Record<string, number>>({});
  const [poSupplierName, setPoSupplierName] = useState<string>('ซัพพลายเออร์รวมวัตถุดิบสดประจำร้าน');
  const [isPOSuccess, setIsPOSuccess] = useState<boolean>(false);

  // Forecast from the shop's own sales (same deduction rules as the till). No AI guesswork for
  // numbers: stock and usage are exact figures, so they are calculated, not predicted.
  const fetchAIForecast = (days: number) => {
    const rows = forecastInventory(ingredients, orders, menuItems, addOns, days);
    const generated: InventoryForecastItem[] = rows.map(r => ({
      ingredientId: r.ingredientId,
      ingredientName: r.ingredientName,
      currentStock: r.currentStock,
      unit: r.unit,
      minStockAlert: r.minStockAlert,
      dailyConsumptionRate: Number(r.dailyUsage.toFixed(2)),
      daysUntilStockout: r.daysLeft ?? 99,
      riskLevel: r.riskLevel,
      isHighDemand: r.daysLeft !== null && r.daysLeft <= 7,
      suggestedReorderQty: r.suggestedOrderQty,
      estimatedReorderCost: r.estimatedCost,
      forecastNote:
        r.daysLeft === null
          ? r.riskLevel === 'CRITICAL'
            ? `ต่ำกว่าจุดเตือน (${r.minStockAlert} ${r.unit}) · ยังไม่มียอดใช้จากการขายใน ${r.daysOfData || 14} วันล่าสุด`
            : `ยังไม่มียอดใช้จากการขายใน 14 วันล่าสุด`
          : `ใช้เฉลี่ย ${Number(r.dailyUsage.toFixed(2))} ${r.unit}/วัน (จาก ${r.daysOfData} วันที่มีการขาย) · พอใช้อีก ${r.daysLeft} วัน`,
      supplierAdvice: r.suggestedOrderQty > 0 ? `สั่ง ${r.suggestedOrderQty} ${r.unit} ให้พอ ${days} วัน + จุดเตือน` : undefined
    }));
    setForecastItems(generated);
    setSourceEngine('sales-data');
    const daysOfData = rows[0]?.daysOfData || 0;
    setSummaryText(
      daysOfData
        ? `คำนวณจากยอดขายจริง ${daysOfData} วันล่าสุด เพื่อให้พอใช้ ${days} วัน`
        : 'ยังไม่มีออเดอร์ใน 14 วันล่าสุด จึงยังคำนวณอัตราการใช้ไม่ได้ (แสดงเฉพาะรายการที่ต่ำกว่าจุดเตือน)'
    );
  };

  useEffect(() => {
    fetchAIForecast(forecastDays);
  }, [forecastDays, ingredients, orders, menuItems, addOns]);

  // Handle PO draft creation
  const handleOpenPODraft = () => {
    const selectedMap: Record<string, boolean> = {};
    const qtyMap: Record<string, number> = {};

    forecastItems.forEach(item => {
      if (item.riskLevel === 'CRITICAL' || item.riskLevel === 'WARNING') {
        selectedMap[item.ingredientId] = true;
        qtyMap[item.ingredientId] = item.suggestedReorderQty || 0;
      }
    });

    setSelectedForPO(selectedMap);
    setCustomOrderQtys(qtyMap);
    setIsPODraftOpen(true);
  };

  /**
   * The purchase order is a list to send to the supplier. Nothing enters the stock here: goods are
   * added with "รับของ" in the stock table when they actually arrive (with the real amount and price).
   */
  const poText = () => {
    const lines = Object.keys(selectedForPO)
      .filter(k => selectedForPO[k])
      .map(k => {
        const item = forecastItems.find(f => f.ingredientId === k);
        const q = customOrderQtys[k] !== undefined ? customOrderQtys[k] : item?.suggestedReorderQty || 0;
        return item && q > 0 ? `- ${item.ingredientName} ${q} ${item.unit}` : null;
      })
      .filter(Boolean);
    return [`ใบสั่งซื้อ ${new Date().toLocaleDateString('th-TH')}${poSupplierName ? ` ถึง ${poSupplierName}` : ''}`, ...lines].join('\n');
  };

  const handleConfirmPORestock = async () => {
    try {
      await navigator.clipboard.writeText(poText());
    } catch {
      window.prompt('คัดลอกรายการสั่งซื้อ', poText());
    }
    setIsPOSuccess(true);
    setTimeout(() => {
      setIsPOSuccess(false);
      setIsPODraftOpen(false);
    }, 2500);
  };

  // Metrics calculation
  const criticalItems = forecastItems.filter(i => i.riskLevel === 'CRITICAL');
  const warningItems = forecastItems.filter(i => i.riskLevel === 'WARNING');
  const highDemandItems = forecastItems.filter(i => i.isHighDemand);
  const totalEstBudget = forecastItems
    .filter(i => i.riskLevel === 'CRITICAL' || i.riskLevel === 'WARNING')
    .reduce((sum, i) => sum + (i.estimatedReorderCost || 0), 0);

  // Filtered List
  const filteredList = forecastItems.filter(item => {
    const matchesSearch = item.ingredientName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterRisk === 'CRITICAL') return item.riskLevel === 'CRITICAL';
    if (filterRisk === 'WARNING') return item.riskLevel === 'WARNING';
    if (filterRisk === 'OPTIMAL') return item.riskLevel === 'OPTIMAL';
    if (filterRisk === 'HIGH_DEMAND') return item.isHighDemand;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950/40 to-slate-900 p-6 rounded-3xl border border-rose-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-rose-500/20 border border-rose-500/40 rounded-full text-rose-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 fill-rose-400" />
              <span>AI Inventory Demand & Low-Stock Early Warning Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
              พยากรณ์วัตถุดิบขาดแคลน & เตือนวัตถุดิบขายดีล่วงหน้า
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              คำนวณจากยอดขายจริง 14 วันล่าสุดร่วมกับสูตรอาหาร: ใช้วันละเท่าไหร่ พอใช้อีกกี่วัน และควรสั่งเท่าไหร่
              {summaryText && <span className="block mt-1 text-slate-300">{summaryText}</span>}
            </p>
          </div>

          {/* Action & Time Horizon Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 flex items-center space-x-1 text-xs">
              <span className="text-slate-400 font-bold px-2">กรอบเวลาคาดการณ์:</span>
              {[
                { days: 3, label: '3 วัน' },
                { days: 7, label: '7 วัน' },
                { days: 14, label: '14 วัน' },
                { days: 30, label: '30 วัน' }
              ].map(opt => (
                <button
                  key={opt.days}
                  onClick={() => setForecastDays(opt.days)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    forecastDays === opt.days
                      ? 'bg-rose-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => fetchAIForecast(forecastDays)}
              disabled={isLoading}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-2xl font-bold text-xs transition flex items-center space-x-2 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-rose-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>ประมวลผลใหม่</span>
            </button>
          </div>
        </div>

        {/* METRICS SUMMARY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          
          <div className="bg-slate-950/80 backdrop-blur border border-rose-500/30 p-3.5 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">เสี่ยงหมดวิกฤต (&lt; 2 วัน)</span>
              <div className="text-lg font-black text-rose-400 font-mono">
                {criticalItems.length} <span className="text-xs font-normal text-slate-400">รายการ</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 backdrop-blur border border-amber-500/30 p-3.5 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">ควรเติมคลัง (&lt; 4 วัน)</span>
              <div className="text-lg font-black text-amber-400 font-mono">
                {warningItems.length} <span className="text-xs font-normal text-slate-400">รายการ</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 backdrop-blur border border-orange-500/30 p-3.5 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/30">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">วัตถุดิบขายดี High-Demand</span>
              <div className="text-lg font-black text-orange-400 font-mono">
                {highDemandItems.length} <span className="text-xs font-normal text-slate-400">รายการ</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/80 backdrop-blur border border-emerald-500/30 p-3.5 rounded-2xl flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block font-medium">งบสั่งซื้อเติมคลังรวม</span>
              <div className="text-lg font-black text-emerald-400 font-mono">
                ฿{totalEstBudget.toLocaleString()}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* FILTER & QUICK PO ACTION BAR */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Search & Risk Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="ค้นหาชื่อวัตถุดิบ..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {[
              { key: 'all', label: 'ทั้งหมด' },
              { key: 'CRITICAL', label: '🚨 วิกฤต (<2 วัน)' },
              { key: 'WARNING', label: '⚡ ควรเติม' },
              { key: 'HIGH_DEMAND', label: '🔥 ขายดี' },
              { key: 'OPTIMAL', label: '✅ ปลอดภัย' }
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterRisk(f.key as any)}
                className={`px-3 py-1.5 rounded-lg font-bold transition text-[11px] ${
                  filterRisk === f.key
                    ? 'bg-slate-800 text-rose-400 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* PO Quick Action Button */}
        {(criticalItems.length > 0 || warningItems.length > 0) && (
          <button
            onClick={handleOpenPODraft}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-950/60 flex items-center justify-center space-x-2 transition active:scale-95 shrink-0"
          >
            <Truck className="w-4 h-4 text-white" />
            <span>สร้างใบสั่งซื้อ (PO Draft) อัตโนมัติ ({criticalItems.length + warningItems.length} รายการ)</span>
          </button>
        )}
      </div>

      {/* FORECAST CARDS GRID */}
      {isLoading ? (
        <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-3xl space-y-4">
          <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-300">
            ระบบ AI กำลังวิเคราะห์อัตราการใช้วัตถุดิบจริงและคำนวณวันหมดคลังล่วงหน้า...
          </p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/50 border border-slate-800 rounded-3xl space-y-2">
          <PackageCheck className="w-8 h-8 text-slate-600 mx-auto" />
          <h4 className="font-bold text-slate-300 text-sm">ไม่พบวัตถุดิบตามเงื่อนไขที่กรอง</h4>
          <p className="text-xs text-slate-500">ลองเปลี่ยนตัวกรองหรือค้นหาชื่อวัตถุดิบอื่น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map(item => {
            const isCritical = item.riskLevel === 'CRITICAL';
            const isWarning = item.riskLevel === 'WARNING';
            const ingObj = ingredients.find(i => i.id === item.ingredientId);

            return (
              <div
                key={item.ingredientId}
                className={`bg-slate-900 border rounded-3xl p-5 space-y-4 relative flex flex-col justify-between shadow-lg transition hover:border-slate-700 ${
                  isCritical
                    ? 'border-rose-500/50 bg-rose-950/10'
                    : isWarning
                    ? 'border-amber-500/40 bg-amber-950/10'
                    : 'border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500">ID: {item.ingredientId}</span>
                    <div className="flex items-center space-x-1.5">
                      {item.isHighDemand && (
                        <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-[10px] font-bold flex items-center space-x-1">
                          <Flame className="w-3 h-3 fill-orange-400" />
                          <span>วัตถุดิบขายดี</span>
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        isCritical
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : isWarning
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}>
                        {isCritical ? '🚨 วิกฤต' : isWarning ? '⚡ เตือนต่ำ' : '✅ ปกติ'}
                      </span>
                    </div>
                  </div>

                  {/* Ingredient Name & Stock Info */}
                  <div>
                    <h4 className="font-extrabold text-slate-100 text-sm">{item.ingredientName}</h4>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-xl font-black font-mono text-slate-100">
                        {item.currentStock}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">{item.unit}</span>
                      <span className="text-[11px] text-slate-500">
                        (ขั้นต่ำ: {item.minStockAlert} {item.unit})
                      </span>
                    </div>
                  </div>

                  {/* Days until stockout progress bar */}
                  <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">ประมาณการใช้งานได้อีก:</span>
                      <span className={`font-mono font-black ${
                        isCritical ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {item.daysUntilStockout >= 90 ? '90+ วัน' : `${item.daysUntilStockout} วัน`}
                      </span>
                    </div>

                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(5, (item.daysUntilStockout / 10) * 100))}%`
                        }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                      <span>อัตราใช้เฉลี่ย: <strong className="text-slate-300 font-mono">{item.dailyConsumptionRate} {item.unit}/วัน</strong></span>
                      <span>ทุน: <strong className="text-slate-300 font-mono">฿{ingObj?.unitCost || 0}/{item.unit}</strong></span>
                    </div>
                  </div>

                  {/* AI Note */}
                  <p className="text-[11px] text-slate-300 leading-snug bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
                    {item.forecastNote}
                  </p>
                </div>

                {/* Suggested Reorder Footer */}
                <div className="pt-3 border-t border-slate-800/80 space-y-2 mt-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">แนะนำสั่งซื้อเพิ่ม ({forecastDays} วัน):</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{item.suggestedReorderQty} {item.unit} (≈ ฿{item.estimatedReorderCost.toLocaleString()})
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedForPO(prev => ({ ...prev, [item.ingredientId]: true }));
                      setCustomOrderQtys(prev => ({ ...prev, [item.ingredientId]: item.suggestedReorderQty }));
                      setIsPODraftOpen(true);
                    }}
                    disabled={!item.suggestedReorderQty}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition active:scale-95 disabled:opacity-40"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                    <span>{item.suggestedReorderQty ? `ใส่ใบสั่งซื้อ ${item.suggestedReorderQty} ${item.unit}` : 'ยังไม่ต้องสั่ง'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: AUTOMATIC PURCHASE ORDER (PO DRAFT) DRAWER */}
      {isPODraftOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-5 text-slate-100 relative max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setIsPODraftOpen(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center space-x-3 border-b border-slate-800 pb-4">
              <div className="p-3 bg-gradient-to-tr from-rose-500 to-orange-500 rounded-2xl text-white shadow-lg">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-100 text-base">
                  สร้างใบสั่งซื้อวัตถุดิบ (PO Draft - AI Restock)
                </h3>
                <p className="text-xs text-slate-400">
                  ร่างรายการสั่งซื้อสำหรับวัตถุดิบที่มีความเสี่ยงขาดสต๊อกล่วงหน้า {forecastDays} วัน
                </p>
              </div>
            </div>

            {/* Supplier Name Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">ชื่อซัพพลายเออร์ / ผู้จัดจำหน่าย:</label>
              <input
                type="text"
                value={poSupplierName}
                onChange={e => setPoSupplierName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Selected Items Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950/50">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3 w-10 text-center">เลือก</th>
                    <th className="p-3">วัตถุดิบ</th>
                    <th className="p-3">สต๊อกปัจจุบัน</th>
                    <th className="p-3">จำนวนที่สั่งเพิ่ม</th>
                    <th className="p-3">ราคา/หน่วย</th>
                    <th className="p-3 text-right">ราคารวม (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {forecastItems.map(item => {
                    const ingObj = ingredients.find(i => i.id === item.ingredientId);
                    const isChecked = !!selectedForPO[item.ingredientId];
                    const qty = customOrderQtys[item.ingredientId] !== undefined ? customOrderQtys[item.ingredientId] : (item.suggestedReorderQty || 0);
                    const unitPrice = ingObj?.unitCost || 0;
                    const itemTotal = qty * unitPrice;

                    return (
                      <tr key={item.ingredientId} className={`hover:bg-slate-800/40 transition ${isChecked ? 'bg-rose-500/5' : 'opacity-60'}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setSelectedForPO(prev => ({ ...prev, [item.ingredientId]: !prev[item.ingredientId] }))}
                            className="w-4 h-4 rounded accent-rose-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-sans">
                          <div className="font-bold text-slate-100">{item.ingredientName}</div>
                          <span className={`text-[10px] ${item.riskLevel === 'CRITICAL' ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
                            {item.riskLevel === 'CRITICAL' ? '🚨 หมดใน ' + item.daysUntilStockout + ' วัน' : 'สต๊อกคงเหลือ ' + item.currentStock + ' ' + item.unit}
                          </span>
                        </td>
                        <td className="p-3 text-slate-400">
                          {item.currentStock} {item.unit}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              min="1"
                              disabled={!isChecked}
                              value={qty}
                              onChange={e => setCustomOrderQtys(prev => ({ ...prev, [item.ingredientId]: parseFloat(e.target.value) || 0 }))}
                              className="w-20 bg-slate-900 border border-rose-500/40 text-emerald-400 font-bold rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-400 disabled:opacity-50"
                            />
                            <span className="text-[11px] text-slate-400 font-sans">{item.unit}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-300">
                          ฿{unitPrice}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-400">
                          ฿{itemTotal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Budget Summary */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex justify-between items-center text-xs">
              <span className="text-slate-400">ประมาณการยอดเงินรวม PO นี้:</span>
              <span className="text-lg font-black text-emerald-400 font-mono">
                ฿{Object.keys(selectedForPO)
                  .filter(k => selectedForPO[k])
                  .reduce((sum, k) => {
                    const item = forecastItems.find(f => f.ingredientId === k);
                    const ing = ingredients.find(i => i.id === k);
                    const q = customOrderQtys[k] !== undefined ? customOrderQtys[k] : (item?.suggestedReorderQty || 0);
                    return sum + q * (ing?.unitCost || 0);
                  }, 0)
                  .toLocaleString()}
              </span>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsPODraftOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                ยกเลิก
              </button>

              <button
                onClick={handleConfirmPORestock}
                disabled={isPOSuccess}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center space-x-2 shadow-lg transition active:scale-95 disabled:opacity-50"
              >
                {isPOSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-slate-950" />
                    <span>คัดลอกแล้ว ส่งให้ร้านค้าได้เลย · ของมาแล้วกด "รับของ" ในตารางคลัง</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>คัดลอกรายการสั่งซื้อ (ยังไม่เพิ่มสต็อก)</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
