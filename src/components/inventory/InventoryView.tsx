import React, { useState } from 'react';
import {
  PackageCheck,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  Truck,
  X,
  History,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Filter,
  Calendar,
  Sparkles,
  QrCode,
  CheckSquare,
  Square,
  Edit3,
  Sliders,
  Trash2,
  Download,
  Printer
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { Ingredient, StockLot } from '../../types';
import { AIInventoryForecastPanel } from './AIInventoryForecastPanel';
import { AIWasteAnalysisPanel } from './AIWasteAnalysisPanel';
import { SmartAuditPanel } from './SmartAuditPanel';
import { AdjustmentLogModal } from './AdjustmentLogModal';
import { InventoryReportModal } from './InventoryReportModal';

export const InventoryView: React.FC = () => {
  const {
    ingredients,
    stockLots,
    addIngredient,
    deleteIngredients,
    bulkUpdateIngredients,
    updateIngredientStock,
    updateIngredientPriceAndRecalculate,
    addStockLot,
    recordStockAdjustment,
    stockAdjustmentLogs,
    currentUser
  } = usePOS();

  // Tab State
  const [activeTab, setActiveTab] = useState<'smart_audit' | 'forecast' | 'waste' | 'current' | 'usage' | 'stockcard'>('smart_audit');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [selectedIngredientFilter, setSelectedIngredientFilter] = useState<string>('all');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'IN' | 'OUT' | 'ADJUST'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');

  // Modal States
  const [isAddIngOpen, setIsAddIngOpen] = useState(false);
  const [isAddLotOpen, setIsAddLotOpen] = useState(false);
  const [isAdjustmentLogOpen, setIsAdjustmentLogOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedIngForLog, setSelectedIngForLog] = useState<string | undefined>();

  // Bulk Selection & Operations State
  const [selectedIngIds, setSelectedIngIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  // Bulk Edit Form Fields
  const [bulkCategory, setBulkCategory] = useState<string>('no_change');
  const [bulkMinStockAlert, setBulkMinStockAlert] = useState<string>('');
  const [bulkUnitCost, setBulkUnitCost] = useState<string>('');
  const [bulkStockAdjustMode, setBulkStockAdjustMode] = useState<'no_change' | 'set' | 'add' | 'subtract'>('no_change');
  const [bulkStockValue, setBulkStockValue] = useState<string>('');
  const [bulkUnit, setBulkUnit] = useState<string>('no_change');

  // Manual Stock Editing State
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [savedIngId, setSavedIngId] = useState<string | null>(null);

  const handleSaveStock = (ingredientId: string) => {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (!ing) return;
    const rawVal = stockInputs[ingredientId];
    const parsedVal = rawVal !== undefined ? parseFloat(rawVal) : ing.currentStock;
    if (!isNaN(parsedVal) && parsedVal >= 0) {
      if (parsedVal !== ing.currentStock) {
        const diff = parsedVal - ing.currentStock;
        recordStockAdjustment(
          ingredientId,
          parsedVal,
          diff > 0 ? 'restock' : 'manual_adjustment',
          'ปรับยอดสต็อกผ่านตารางคลังคงเหลือ',
          currentUser?.name || 'ผู้จัดการ',
          currentUser?.role || 'manager'
        );
      } else {
        updateIngredientStock(ingredientId, parsedVal);
      }
      setSavedIngId(ingredientId);
      setTimeout(() => setSavedIngId(null), 2000);
    }
  };

  // New Ingredient Form
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState<'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'pack'>('kg');
  const [ingStock, setIngStock] = useState<number>(10);
  const [ingMinAlert, setIngMinAlert] = useState<number>(5);
  const [ingUnitCost, setIngUnitCost] = useState<number>(150);
  const [ingCat, setIngCat] = useState<'meat' | 'vegetable' | 'sauce' | 'egg' | 'dry_good' | 'beverage'>('meat');

  // New Lot Form
  const [lotIngId, setLotIngId] = useState<string>(ingredients[0]?.id || '');
  const [lotNumber, setLotNumber] = useState(`LOT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`);
  const [lotQty, setLotQty] = useState<number>(10);
  const [lotCost, setLotCost] = useState<number>(150);
  const [lotSupplier, setLotSupplier] = useState('');
  const [lotExpiry, setLotExpiry] = useState(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().split('T')[0]
  );
  const [lotNotes, setLotNotes] = useState('');

  // Filtering for Tab 1
  const lowStockCount = ingredients.filter(i => i.currentStock <= i.minStockAlert).length;

  const filteredIngredients = ingredients.filter(ing => {
    const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'all' || ing.category === categoryFilter;
    const matchesLow = !onlyLowStock || ing.currentStock <= ing.minStockAlert;
    return matchesSearch && matchesCat && matchesLow;
  });

  // Bulk Selection Helper Logic
  const isAllSelected =
    filteredIngredients.length > 0 &&
    filteredIngredients.every(ing => selectedIngIds.includes(ing.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIngIds([]);
    } else {
      setSelectedIngIds(filteredIngredients.map(i => i.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIngIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleConfirmBulkDelete = () => {
    deleteIngredients(selectedIngIds);
    setSelectedIngIds([]);
    setIsBulkDeleteConfirmOpen(false);
  };

  const handleApplyBulkEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIngIds.length === 0) return;

    const updates: Partial<Omit<Ingredient, 'id'>> = {};

    if (bulkCategory !== 'no_change') {
      updates.category = bulkCategory as any;
    }
    if (bulkUnit !== 'no_change') {
      updates.unit = bulkUnit as any;
    }
    if (bulkMinStockAlert.trim() !== '') {
      const parsed = parseFloat(bulkMinStockAlert);
      if (!isNaN(parsed) && parsed >= 0) {
        updates.minStockAlert = parsed;
      }
    }
    if (bulkUnitCost.trim() !== '') {
      const parsed = parseFloat(bulkUnitCost);
      if (!isNaN(parsed) && parsed >= 0) {
        updates.unitCost = parsed;
      }
    }

    if (Object.keys(updates).length > 0) {
      bulkUpdateIngredients(selectedIngIds, updates);
    }

    if (bulkStockAdjustMode !== 'no_change' && bulkStockValue.trim() !== '') {
      const val = parseFloat(bulkStockValue);
      if (!isNaN(val)) {
        selectedIngIds.forEach(id => {
          const ing = ingredients.find(i => i.id === id);
          if (ing) {
            let newStock = ing.currentStock;
            if (bulkStockAdjustMode === 'set') {
              newStock = Math.max(0, val);
            } else if (bulkStockAdjustMode === 'add') {
              newStock = Math.max(0, ing.currentStock + val);
            } else if (bulkStockAdjustMode === 'subtract') {
              newStock = Math.max(0, ing.currentStock - val);
            }
            updateIngredientStock(id, newStock);
          }
        });
      }
    }

    setIsBulkEditModalOpen(false);
    setBulkCategory('no_change');
    setBulkMinStockAlert('');
    setBulkUnitCost('');
    setBulkStockAdjustMode('no_change');
    setBulkStockValue('');
    setBulkUnit('no_change');
  };

  // Mock Movement Log Data for Tab 2
  const movementLogs = [
    {
      id: 'log-1',
      date: '3 ก.ค. 2569 04:30:00',
      ingredientName: 'เนื้อวัวบด พรีเมียม (A5)',
      ingredientId: 'i1',
      unit: 'kg',
      type: 'IN' as const,
      amount: 30.0,
      note: 'รับของจาก PO-2026-001',
      refNo: 'PO-2026-001',
      operator: 'ผู้จัดการ สมหญิง'
    },
    {
      id: 'log-2',
      date: '6 ก.ค. 2569 06:00:00',
      ingredientName: 'ใบกะเพราแดงป่า (ฉุนพิเศษ)',
      ingredientId: 'i5',
      unit: 'kg',
      type: 'IN' as const,
      amount: 15.0,
      note: 'รับของจาก PO-2026-002',
      refNo: 'PO-2026-002',
      operator: 'ผู้จัดการ สมหญิง'
    },
    {
      id: 'log-3',
      date: '7 ก.ค. 2569 11:15:00',
      ingredientName: 'หมูกรอบ สูตรเฉพาะ',
      ingredientId: 'i2',
      unit: 'kg',
      type: 'OUT' as const,
      amount: 1.2,
      note: 'ตัดสต๊อกอัตโนมัติ ออเดอร์ #ORD-089',
      refNo: '#ORD-089',
      operator: 'ระบบ POS'
    },
    {
      id: 'log-4',
      date: '8 ก.ค. 2569 14:00:00',
      ingredientName: 'หมูสับอนามัย',
      ingredientId: 'i3',
      unit: 'kg',
      type: 'ADJUST' as const,
      amount: 0.5,
      note: 'วัตถุดิบหมดอายุ/สูญเสีย ปรับยอดโดย แอดมิน',
      refNo: 'ADJ-2026-04',
      operator: 'แอดมิน'
    },
    {
      id: 'log-5',
      date: '10 ก.ค. 2569 18:30:00',
      ingredientName: 'กุ้งแช่บ๊วยไซส์ใหญ่',
      ingredientId: 'i4',
      unit: 'kg',
      type: 'OUT' as const,
      amount: 0.5,
      note: 'ตัดสต๊อกอัตโนมัติ ออเดอร์ #ORD-095',
      refNo: '#ORD-095',
      operator: 'ระบบ POS'
    }
  ];

  const filteredLogs = movementLogs.filter(log => {
    const matchesIng = selectedIngredientFilter === 'all' || log.ingredientId === selectedIngredientFilter;
    const matchesType = txTypeFilter === 'all' || log.type === txTypeFilter;
    const matchesSearch =
      log.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.note.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.refNo.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesIng && matchesType && matchesSearch;
  });

  // Calculate totals for Tab 2
  const totalIn = movementLogs.filter(l => l.type === 'IN').reduce((acc, l) => acc + l.amount, 0);
  const totalOut = movementLogs.filter(l => l.type === 'OUT').reduce((acc, l) => acc + l.amount, 0);
  const totalAdjust = movementLogs.filter(l => l.type === 'ADJUST').reduce((acc, l) => acc + l.amount, 0);

  // Mock Stock Card Records for Tab 3
  const stockCardRecords = [
    {
      id: 'sc-1',
      dateTime: '3/7/2569 04:30:00',
      ingredientName: 'เนื้อวัวบด พรีเมียม (A5)',
      type: 'IN' as const,
      cardAmount: '+ 30 kg',
      netBalance: '35.4 kg',
      operatorNote: 'รับของจาก PO-2026-001 โดย: ผู้จัดการ สมหญิง'
    },
    {
      id: 'sc-2',
      dateTime: '6/7/2569 06:00:00',
      ingredientName: 'ใบกะเพราแดงป่า (ฉุนพิเศษ)',
      type: 'IN' as const,
      cardAmount: '+ 15 kg',
      netBalance: '18.2 kg',
      operatorNote: 'รับของจาก PO-2026-002 โดย: ผู้จัดการ สมหญิง'
    },
    {
      id: 'sc-3',
      dateTime: '7/7/2569 11:15:00',
      ingredientName: 'หมูกรอบ สูตรเฉพาะ',
      type: 'OUT' as const,
      cardAmount: '- 2.5 kg',
      netBalance: '12.5 kg',
      operatorNote: 'ตัดสต๊อกอัตโนมัติ ออเดอร์ #ORD-089 โดย: POS System'
    },
    {
      id: 'sc-4',
      dateTime: '8/7/2569 14:00:00',
      ingredientName: 'หมูสับอนามัย',
      type: 'ADJUST' as const,
      cardAmount: '- 0.5 kg',
      netBalance: '14.5 kg',
      operatorNote: 'วัตถุดิบหมดอายุ/สูญเสีย ปรับยอดโดย: แอดมิน'
    },
    {
      id: 'sc-5',
      dateTime: '10/7/2569 18:30:00',
      ingredientName: 'กุ้งแช่บ๊วยไซส์ใหญ่',
      type: 'OUT' as const,
      cardAmount: '- 1.2 kg',
      netBalance: '8.8 kg',
      operatorNote: 'ตัดสต๊อกอัตโนมัติ ออเดอร์ #ORD-095 โดย: POS System'
    }
  ];

  const handleCreateIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName.trim()) return;
    addIngredient({
      name: ingName.trim(),
      unit: ingUnit,
      currentStock: ingStock,
      minStockAlert: ingMinAlert,
      unitCost: ingUnitCost,
      category: ingCat
    });
    setIsAddIngOpen(false);
    setIngName('');
  };

  const handleCreateLot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotIngId || !lotNumber) return;
    addStockLot({
      ingredientId: lotIngId,
      lotNumber,
      quantity: lotQty,
      unitCost: lotCost,
      receivedDate: new Date().toISOString().split('T')[0],
      expiryDate: lotExpiry,
      supplier: lotSupplier.trim() || 'ไม่ระบุซัพพลายเออร์',
      notes: lotNotes.trim()
    });
    setIsAddLotOpen(false);
  };

  const handleDownloadCSV = () => {
    if (ingredients.length === 0) return;

    const headers = [
      'ID วัตถุดิบ',
      'ชื่อวัตถุดิบ',
      'หมวดหมู่',
      'คงเหลือปัจจุบัน',
      'หน่วยนับ',
      'จุดเตือนขั้นต่ำ',
      'ต้นทุนต่อหน่วย (บาท)',
      'มูลค่ารวมคงเหลือ (บาท)',
      'สถานะสต๊อก'
    ];

    const categoryNames: Record<string, string> = {
      meat: 'เนื้อสัตว์',
      vegetable: 'ผักสด',
      sauce: 'ซอส/เครื่องปรุง',
      egg: 'ไข่',
      dry_good: 'ของแห้ง',
      beverage: 'เครื่องดื่ม/ไซรัป'
    };

    const targetList = filteredIngredients.length > 0 ? filteredIngredients : ingredients;

    const rows = targetList.map(ing => {
      const isLow = ing.currentStock <= ing.minStockAlert;
      const catTh = categoryNames[ing.category] || ing.category;
      const totalVal = ing.currentStock * ing.unitCost;

      return [
        `"${ing.id}"`,
        `"${ing.name.replace(/"/g, '""')}"`,
        `"${catTh}"`,
        ing.currentStock,
        `"${ing.unit}"`,
        ing.minStockAlert,
        ing.unitCost.toFixed(2),
        totalVal.toFixed(2),
        `"${isLow ? 'ใกล้หมดสต๊อก' : 'ปกติ'}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 pb-12">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-orange-500 to-amber-600 rounded-2xl shadow-lg text-white">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg sm:text-xl text-slate-100 flex items-center gap-2">
              <span>คลังวัตถุดิบ (Inventory & Stocks)</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              ระบบเบิกรับ ปรับยอด สัญญาณวัตถุดิบขาดแคลน และบันทึกประวัติ Stock Card หมุนเวียน
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="px-3.5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95 whitespace-nowrap"
            title="พิมพ์รายงานสรุปสต็อกคงเหลือปัจจุบัน (PDF / Print Report)"
          >
            <Printer className="w-4 h-4 text-sky-100" />
            <span>พิมพ์รายงานสต็อก</span>
          </button>

          <button
            onClick={handleDownloadCSV}
            className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95 whitespace-nowrap"
            title="ดาวน์โหลดไฟล์ CSV ข้อมูลวัตถุดิบคงเหลือสำหรับการตรวจสอบบัญชีและสำรองข้อมูล"
          >
            <Download className="w-4 h-4 text-emerald-200" />
            <span>ดาวน์โหลด CSV</span>
          </button>

          <button
            onClick={() => setIsAddIngOpen(true)}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/60 transition flex items-center space-x-2 active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มรหัสวัตถุดิบใหม่</span>
          </button>

          <button
            onClick={() => {
              setSelectedIngForLog(undefined);
              setIsAdjustmentLogOpen(true);
            }}
            className="px-3.5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95 whitespace-nowrap"
            title="ดูและบันทึกประวัติการปรับยอดสต็อกวัตถุดิบ"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span>ประวัติปรับสต็อก ({stockAdjustmentLogs.length})</span>
          </button>

          <button
            onClick={() => setIsAddLotOpen(true)}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5 active:scale-95 whitespace-nowrap"
          >
            <Truck className="w-4 h-4 text-emerald-400" />
            <span>รับเข้า Lot ใหม่</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="p-3 sm:p-6 space-y-5 max-w-7xl mx-auto w-full">
        {/* Navigation Tabs */}
        <div className="flex items-center overflow-x-auto no-scrollbar gap-2 p-1.5 bg-slate-900 border border-slate-800/80 rounded-2xl">
          <button
            onClick={() => setActiveTab('smart_audit')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'smart_audit'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-950/60 ring-1 ring-indigo-400/50'
                : 'text-indigo-400 hover:text-indigo-200 hover:bg-indigo-500/10 border border-indigo-500/30'
            }`}
          >
            <QrCode className="w-4 h-4 text-amber-300" />
            <span>🔍 Smart Audit (สแกนตรวจนับคลัง)</span>
          </button>

          <button
            onClick={() => setActiveTab('forecast')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'forecast'
                ? 'bg-gradient-to-r from-rose-600 to-orange-600 text-white shadow-lg shadow-rose-950/50 ring-1 ring-rose-400/50'
                : 'text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 border border-rose-500/30'
            }`}
          >
            <Sparkles className="w-4 h-4 text-rose-300 animate-pulse" />
            <span>✨ AI พยากรณ์ความต้องการ & เตือนวัตถุดิบขาด</span>
            {lowStockCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-black animate-pulse">
                {lowStockCount} เตือนด่วน
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('waste')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'waste'
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg shadow-rose-950/50 ring-1 ring-rose-400/50'
                : 'text-amber-400 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/30'
            }`}
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>🗑️ AI วิเคราะห์ขยะ & ลดการสูญเสีย</span>
          </button>

          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'current'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>วัตถุดิบคงเหลือปัจจุบัน</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-950/60 text-slate-300 border border-slate-700">
              {ingredients.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('usage')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'usage'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>ประวัติรับ-เบิกรายวัตถุดิบ (Item Usage Log)</span>
          </button>

          <button
            onClick={() => setActiveTab('stockcard')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'stockcard'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-950/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>สมุดประวัติรวมทั้งหมด (Stock Card)</span>
          </button>
        </div>

        {/* TAB -1: SMART AUDIT CAMERA BARCODE SCANNER */}
        {activeTab === 'smart_audit' && (
          <SmartAuditPanel />
        )}

        {/* TAB 0: AI DEMAND FORECAST & LOW-STOCK EARLY WARNING */}
        {activeTab === 'forecast' && (
          <AIInventoryForecastPanel />
        )}

        {/* TAB 0.5: AI WASTE ANALYSIS & SPOILAGE REDUCTION */}
        {activeTab === 'waste' && (
          <AIWasteAnalysisPanel />
        )}

        {/* TAB 1: วัตถุดิบคงเหลือปัจจุบัน */}
        {activeTab === 'current' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-bold">
                <div className="flex items-center space-x-1.5 text-orange-400 mr-1">
                  <Filter className="w-4 h-4" />
                  <span>คัดกรองวัตถุดิบ: {filteredIngredients.length} รายการ</span>
                </div>

                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">📦 ทุกหมวดหมู่</option>
                  <option value="meat">🥩 เนื้อสัตว์ (meat)</option>
                  <option value="vegetable">🥦 ผักสด (vegetable)</option>
                  <option value="sauce">🍾 ซอส/เครื่องปรุง (sauce)</option>
                  <option value="egg">🥚 ไข่ (egg)</option>
                  <option value="dry_good">🌾 ของแห้ง (dry_good)</option>
                  <option value="beverage">🥤 เครื่องดื่ม/ไซรัป (beverage)</option>
                </select>

                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-slate-300 hover:text-amber-300 font-bold text-xs rounded-xl transition flex items-center space-x-1.5"
                >
                  {isAllSelected ? (
                    <>
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                      <span>ยกเลิกเลือกทั้งหมด</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 text-slate-500" />
                      <span>เลือกทั้งหมด ({filteredIngredients.length})</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadCSV}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-emerald-400 hover:text-emerald-300 font-bold text-xs rounded-xl transition flex items-center space-x-1.5 active:scale-95 whitespace-nowrap"
                  title="ส่งออกรายการวัตถุดิบเป็น CSV"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ส่งออก CSV ({filteredIngredients.length})</span>
                </button>

                <button
                  onClick={() => setOnlyLowStock(!onlyLowStock)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 border whitespace-nowrap ${
                    onlyLowStock
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-lg shadow-rose-950/30'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <AlertTriangle className={`w-3.5 h-3.5 ${onlyLowStock ? 'text-rose-400 animate-bounce' : ''}`} />
                  <span>แสดงเฉพาะวัตถุดิบใกล้หมดสต๊อก ({lowStockCount})</span>
                </button>

                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="ค้นหาวัตถุดิบ..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Action Bar - Active when items are selected */}
            {selectedIngIds.length > 0 && (
              <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-2 border-amber-500/60 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl animate-fadeIn">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xs">
                    {selectedIngIds.length}
                  </div>
                  <div>
                    <span className="font-extrabold text-amber-200 text-xs block">
                      เลือกวัตถุดิบแล้ว {selectedIngIds.length} รายการ (จาก {filteredIngredients.length} รายการ)
                    </span>
                    <span className="text-[10px] text-amber-400/80 font-mono">
                      ใช้เครื่องมือด้านขวาเพื่อจัดการ แก้ไข หรือลบหลายรายการพร้อมกัน
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsBulkEditModalOpen(true)}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>แก้ไขแบบกลุ่ม (Bulk Edit)</span>
                  </button>

                  <button
                    onClick={() => setIsBulkDeleteConfirmOpen(true)}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>ลบวัตถุดิบที่เลือก ({selectedIngIds.length})</span>
                  </button>

                  <button
                    onClick={() => setSelectedIngIds([])}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                  >
                    ยกเลิกการเลือก
                  </button>
                </div>
              </div>
            )}

            {/* Current Stock Table with Horizontal Scroll Safety */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 min-w-[750px]">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-3 w-10 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={handleToggleSelectAll}
                          className="p-1 text-slate-400 hover:text-amber-400 transition"
                          title={isAllSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
                        >
                          {isAllSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      </th>
                      <th className="py-3.5 px-4 whitespace-nowrap">รายการวัตถุดิบ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">รหัสล็อต / หมดอายุ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">ราคาทุนเฉลี่ย</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">เกณฑ์ขั้นต่ำ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap text-center">จัดการปรับยอด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredIngredients.map((ing, idx) => {
                      const isSelected = selectedIngIds.includes(ing.id);
                      const isLow = ing.currentStock <= ing.minStockAlert;
                      const lot = stockLots.find(l => l.ingredientId === ing.id) || {
                        lotNumber: `LOT-${ing.category.toUpperCase()}-0${idx + 1}`,
                        expiryDate: '2026-08-15'
                      };

                      return (
                        <tr
                          key={ing.id}
                          className={`transition ${
                            isSelected ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Checkbox Column */}
                          <td className="py-3.5 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectRow(ing.id)}
                              className="p-1 text-slate-400 hover:text-amber-400 transition"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600" />
                              )}
                            </button>
                          </td>
                          {/* รายการวัตถุดิบ */}
                          <td className="py-3.5 px-4 font-bold text-slate-100 whitespace-nowrap">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 font-mono text-xs">
                                {ing.name.charAt(0)}
                              </div>
                              <div>
                                <div className="text-slate-100 font-semibold">{ing.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">ID: {ing.id}</div>
                              </div>
                            </div>
                          </td>

                          {/* รหัสล็อต / หมดอายุ */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-mono text-amber-400 font-bold text-xs">{lot.lotNumber}</div>
                            <div className="text-[10px] text-slate-400 font-mono">EXP: {lot.expiryDate}</div>
                          </td>

                          {/* ราคาทุนเฉลี่ย */}
                          <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                            {ing.unitCost.toLocaleString('th-TH')} ฿ / {ing.unit}
                          </td>

                          {/* เกณฑ์ขั้นต่ำ / คงเหลือ */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className={`font-mono font-bold ${isLow ? 'text-rose-400' : 'text-slate-200'}`}>
                                {ing.currentStock.toLocaleString()} {ing.unit}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                (ขั้นต่ำ {ing.minStockAlert} {ing.unit})
                              </span>
                            </div>
                            {isLow && (
                              <span className="mt-1 inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>วัตถุดิบใกล้หมด</span>
                              </span>
                            )}
                          </td>

                          {/* Manual Quantity Edit & Quick Adjust Controls */}
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <div className="inline-flex items-center space-x-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                              {/* Direct Numeric Input */}
                              <div className="relative flex items-center">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="จำนวน"
                                  value={stockInputs[ing.id] !== undefined ? stockInputs[ing.id] : ing.currentStock}
                                  onChange={e =>
                                    setStockInputs(prev => ({
                                      ...prev,
                                      [ing.id]: e.target.value
                                    }))
                                  }
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      handleSaveStock(ing.id);
                                    }
                                  }}
                                  className="w-24 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono font-bold text-center text-slate-100 focus:outline-none focus:border-orange-500"
                                />
                                <span className="ml-1 text-[11px] text-slate-400 font-semibold">{ing.unit}</span>
                              </div>

                              {/* Stepper Buttons */}
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  title="ลด 1"
                                  onClick={() => {
                                    const curr = parseFloat(
                                      stockInputs[ing.id] !== undefined ? stockInputs[ing.id] : ing.currentStock.toString()
                                    ) || 0;
                                    const next = Math.max(0, curr - 1);
                                    setStockInputs(prev => ({ ...prev, [ing.id]: next.toString() }));
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-rose-400 font-bold rounded-lg text-xs transition active:scale-95"
                                >
                                  -1
                                </button>
                                <button
                                  type="button"
                                  title="เพิ่ม 10"
                                  onClick={() => {
                                    const curr = parseFloat(
                                      stockInputs[ing.id] !== undefined ? stockInputs[ing.id] : ing.currentStock.toString()
                                    ) || 0;
                                    const next = curr + 10;
                                    setStockInputs(prev => ({ ...prev, [ing.id]: next.toString() }));
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 font-bold rounded-lg text-xs transition active:scale-95"
                                >
                                  +10
                                </button>
                              </div>

                              {/* Save Button */}
                              <button
                                type="button"
                                onClick={() => handleSaveStock(ing.id)}
                                className={`px-3 py-1 font-bold rounded-lg text-xs transition flex items-center space-x-1 active:scale-95 whitespace-nowrap ${
                                  savedIngId === ing.id
                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-950/40'
                                }`}
                              >
                                {savedIngId === ing.id ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>บันทึกแล้ว</span>
                                  </>
                                ) : (
                                  <span>บันทึก</span>
                                )}
                              </button>

                              {/* Single Delete Button */}
                              <button
                                type="button"
                                title="ดูประวัติ/ปรับยอดสต็อกวัตถุดิบนี้"
                                onClick={() => {
                                  setSelectedIngForLog(ing.id);
                                  setIsAdjustmentLogOpen(true);
                                }}
                                className="p-1.5 bg-slate-900 hover:bg-amber-600/30 border border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-400 font-bold rounded-lg text-xs transition active:scale-95"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                title="ลบวัตถุดิบรายการนี้"
                                onClick={() => {
                                  setSelectedIngIds([ing.id]);
                                  setIsBulkDeleteConfirmOpen(true);
                                }}
                                className="p-1.5 bg-slate-900 hover:bg-rose-600/30 border border-slate-700 hover:border-rose-500 text-slate-400 hover:text-rose-400 font-bold rounded-lg text-xs transition active:scale-95"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ประวัติรับ-เบิกรายวัตถุดิบ (Item Usage Log) */}
        {activeTab === 'usage' && (
          <div className="space-y-5">
            {/* Header Banner */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-slate-800 rounded-xl text-orange-400 border border-slate-700">
                  <History className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-slate-100">
                    ประวัติการใช้งานและรับ-เบิกวัตถุดิบ (Item Movement Log)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ติดตามประวัติการตัดสต๊อกอัตโนมัติจากหน้า POS, การรับสินค้าเข้าคลัง และการปรับยอดคงเหล้อย้อนหลัง
                  </p>
                </div>
              </div>

              {/* Ingredient Dropdown */}
              <div className="w-full md:w-auto">
                <select
                  value={selectedIngredientFilter}
                  onChange={e => setSelectedIngredientFilter(e.target.value)}
                  className="w-full md:w-64 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-orange-500"
                >
                  <option value="all">📦 วัตถุดิบทั้งหมดในระบบ (All Ingredients)</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} (ID: {ing.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 4 Stat Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <div className="text-slate-400 text-[11px] font-semibold">จำนวนประวัติตัวย้อนหลัง</div>
                <div className="text-xl font-black text-slate-100">{filteredLogs.length} รายการ</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <div className="text-slate-400 text-[11px] font-semibold flex items-center space-x-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ยอดรับเข้าสะสม (IN)</span>
                </div>
                <div className="text-xl font-black text-emerald-400">+{totalIn.toFixed(1)} หน่วย</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <div className="text-slate-400 text-[11px] font-semibold flex items-center space-x-1">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>ยอดเบิก / ตัดขายสะสม (OUT)</span>
                </div>
                <div className="text-xl font-black text-rose-400">-{totalOut.toFixed(1)} หน่วย</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-1">
                <div className="text-slate-400 text-[11px] font-semibold flex items-center space-x-1">
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                  <span>ยอดปรับปรุงบัญชี (ADJUST)</span>
                </div>
                <div className="text-xl font-black text-sky-400">-{totalAdjust.toFixed(1)} หน่วย</div>
              </div>
            </div>

            {/* Filter controls */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setTxTypeFilter('all')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                      txTypeFilter === 'all' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    onClick={() => setTxTypeFilter('IN')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                      txTypeFilter === 'IN' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    รับเข้า (IN)
                  </button>
                  <button
                    onClick={() => setTxTypeFilter('OUT')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                      txTypeFilter === 'OUT' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    เบิก/ขาย (OUT)
                  </button>
                  <button
                    onClick={() => setTxTypeFilter('ADJUST')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                      txTypeFilter === 'ADJUST' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ปรับปรุง (ADJUST)
                  </button>
                </div>
              </div>

              <div className="relative flex-1 lg:max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="ค้นหาตามชื่อวัตถุดิบ, หมายเหตุการทำรายการ, เลขออเดอร์..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Item Movement Log Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 min-w-[750px]">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4 whitespace-nowrap">วันเวลาที่ทำรายการ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">รายการวัตถุดิบ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">ประเภทธุรกรรม</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">จำนวน</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">หมายเหตุ / อ้างอิง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">{log.date}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-100 whitespace-nowrap">
                          {log.ingredientName}
                          <span className="ml-1.5 text-[10px] text-slate-500 font-mono">ID: {log.ingredientId}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {log.type === 'IN' && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] inline-flex items-center space-x-1">
                              <span>รับเข้าคลัง (IN)</span>
                            </span>
                          )}
                          {log.type === 'OUT' && (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[10px] inline-flex items-center space-x-1">
                              <span>ตัดขาย POS (OUT)</span>
                            </span>
                          )}
                          {log.type === 'ADJUST' && (
                            <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold text-[10px] inline-flex items-center space-x-1">
                              <span>ปรับปรุงบัญชี (ADJUST)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-extrabold whitespace-nowrap">
                          <span
                            className={
                              log.type === 'IN'
                                ? 'text-emerald-400'
                                : log.type === 'OUT'
                                ? 'text-rose-400'
                                : 'text-sky-400'
                            }
                          >
                            {log.type === 'IN' ? '+' : '-'}
                            {log.amount} {log.unit}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                          <span>{log.note}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: สมุดประวัติรวมทั้งหมด (Stock Card) */}
        {activeTab === 'stockcard' && (
          <div className="space-y-4">
            {/* Header Info */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="w-5 h-5 text-orange-400" />
                <span className="text-xs sm:text-sm font-bold text-slate-200">
                  บันทึกสมุด Stock Card ตรวจสอบย้อนหลัง: อ้างอิงรหัสพนักงานผู้ดำเนินการทุกเคส
                </span>
              </div>
              <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-bold whitespace-nowrap">
                {stockCardRecords.length} บันทึก
              </span>
            </div>

            {/* Stock Card Table with Horizontal Scroll Safety */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300 min-w-[800px]">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3.5 px-4 whitespace-nowrap">วันเวลาบันทึก</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">วัตถุดิบ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">ประเภทรายการ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">จำนวนการ์ด</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">ยอดคงเหลือสุทธิ</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">ผู้ทำรายการ / หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {stockCardRecords.map(sc => (
                      <tr key={sc.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">{sc.dateTime}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-100 whitespace-nowrap">
                          {sc.ingredientName}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {sc.type === 'IN' && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              รับเข้า (IN)
                            </span>
                          )}
                          {sc.type === 'OUT' && (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                              เบิก/ขาย (OUT)
                            </span>
                          )}
                          {sc.type === 'ADJUST' && (
                            <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                              ปรับปรุง (ADJUST)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                          <span
                            className={
                              sc.type === 'IN'
                                ? 'text-emerald-400'
                                : sc.type === 'OUT'
                                ? 'text-rose-400'
                                : 'text-sky-400'
                            }
                          >
                            {sc.cardAmount}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-extrabold text-slate-100 whitespace-nowrap">
                          {sc.netBalance}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">{sc.operatorNote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD NEW INGREDIENT */}
      {isAddIngOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">เพิ่มรายการวัตถุดิบใหม่</h3>
              <button onClick={() => setIsAddIngOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIngredient} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">ชื่อวัตถุดิบ *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น หมูสันคอสไลส์, กระเทียมเจียว..."
                  value={ingName}
                  onChange={e => setIngName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">หน่วยนับ</label>
                  <select
                    value={ingUnit}
                    onChange={e => setIngUnit(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="kg">กิโลกรัม (kg)</option>
                    <option value="g">กรัม (g)</option>
                    <option value="ml">มิลลิลิตร (ml)</option>
                    <option value="pcs">ฟอง/ชิ้น (pcs)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">หมวดหมู่</label>
                  <select
                    value={ingCat}
                    onChange={e => setIngCat(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="meat">เนื้อสัตว์</option>
                    <option value="vegetable">ผักสด</option>
                    <option value="sauce">ซอส</option>
                    <option value="egg">ไข่สด</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">จำนวนตั้งต้น</label>
                  <input
                    type="number"
                    value={ingStock}
                    onChange={e => setIngStock(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">เกณฑ์เตือนขั้นต่ำ</label>
                  <input
                    type="number"
                    value={ingMinAlert}
                    onChange={e => setIngMinAlert(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition shadow-lg shadow-orange-950/50"
              >
                บันทึกวัตถุดิบ
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW STOCK LOT */}
      {isAddLotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">รับเข้า Lot วัตถุดิบใหม่</h3>
              <button onClick={() => setIsAddLotOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLot} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">เลือกวัตถุดิบ *</label>
                <select
                  value={lotIngId}
                  onChange={e => setLotIngId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                >
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (คงเหลือปัจจุบัน: {i.currentStock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">เลข Lot *</label>
                  <input
                    type="text"
                    required
                    value={lotNumber}
                    onChange={e => setLotNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">จำนวนที่รับเข้า *</label>
                  <input
                    type="number"
                    required
                    value={lotQty}
                    onChange={e => setLotQty(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">วันหมดอายุ (Expiry Date) *</label>
                  <input
                    type="date"
                    required
                    value={lotExpiry}
                    onChange={e => setLotExpiry(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">ผู้จัดจำหน่าย (Supplier)</label>
                  <input
                    type="text"
                    placeholder="เช่น CP Food, เบทาโกร"
                    value={lotSupplier}
                    onChange={e => setLotSupplier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition shadow-lg shadow-orange-950/50"
              >
                ยืนยันการรับเข้า Lot
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: BULK EDIT INGREDIENTS */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">แก้ไขวัตถุดิบแบบกลุ่ม</h3>
                  <p className="text-[11px] text-amber-400 font-mono">
                    กำลังปรับเปลี่ยนวัตถุดิบ {selectedIngIds.length} รายการที่เลือก
                  </p>
                </div>
              </div>
              <button onClick={() => setIsBulkEditModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyBulkEdit} className="space-y-4 text-xs">
              {/* Selected items summary */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                <span className="font-bold text-slate-200 block mb-1">รายการวัตถุดิบที่เลือก ({selectedIngIds.length}):</span>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1">
                  {ingredients
                    .filter(i => selectedIngIds.includes(i.id))
                    .map(i => (
                      <span key={i.id} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-200 font-semibold">
                        {i.name}
                      </span>
                    ))}
                </div>
              </div>

              {/* 1. Category */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">หมวดหมู่วัตถุดิบ (Category)</label>
                <select
                  value={bulkCategory}
                  onChange={e => setBulkCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="no_change">-- ไม่เปลี่ยนแปลง --</option>
                  <option value="meat">เนื้อสัตว์ (meat)</option>
                  <option value="vegetable">ผักและสมุนไพร (vegetable)</option>
                  <option value="sauce">ซอสและเครื่องปรุง (sauce)</option>
                  <option value="egg">ไข่และนม (egg)</option>
                  <option value="dry_good">ของแห้งและเครื่องเทศ (dry_good)</option>
                  <option value="beverage">เครื่องดื่มและไซรัป (beverage)</option>
                </select>
              </div>

              {/* 2. Min Alert Threshold & Unit Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">เกณฑ์เตือนขั้นต่ำใหม่</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="เว้นว่างหากไม่เปลี่ยน"
                    value={bulkMinStockAlert}
                    onChange={e => setBulkMinStockAlert(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">ราคาทุนต่อหน่วย (บาท)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="เว้นว่างหากไม่เปลี่ยน"
                    value={bulkUnitCost}
                    onChange={e => setBulkUnitCost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* 3. Unit Change */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">เปลี่ยนหน่วยนับ (Unit)</label>
                <select
                  value={bulkUnit}
                  onChange={e => setBulkUnit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="no_change">-- ไม่เปลี่ยนแปลง --</option>
                  <option value="kg">กิโลกรัม (kg)</option>
                  <option value="g">กรัม (g)</option>
                  <option value="ml">มิลลิลิตร (ml)</option>
                  <option value="l">ลิตร (l)</option>
                  <option value="pcs">ชิ้น/ฟอง (pcs)</option>
                  <option value="pack">แพ็ค/กล่อง (pack)</option>
                </select>
              </div>

              {/* 4. Bulk Stock Adjustment */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <label className="block text-amber-300 font-bold">ปรับยอดสต็อกปัจจุบันแบบกลุ่ม</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'no_change', label: 'ไม่เปลี่ยน' },
                    { id: 'set', label: 'ตั้งค่าเป็น' },
                    { id: 'add', label: 'บวกเพิ่ม (+)' },
                    { id: 'subtract', label: 'หักออก (-)' }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setBulkStockAdjustMode(mode.id as any)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-[11px] border transition ${
                        bulkStockAdjustMode === mode.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {bulkStockAdjustMode !== 'no_change' && (
                  <div className="pt-2">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="ระบุจำนวนสต็อกที่จะปรับ..."
                      value={bulkStockValue}
                      onChange={e => setBulkStockValue(e.target.value)}
                      className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-3 py-2 text-slate-100 font-mono font-bold focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBulkEditModalOpen(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl transition shadow-lg shadow-amber-950/50"
                >
                  ยืนยันแก้ไขแบบกลุ่ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: BULK DELETE CONFIRMATION */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">ยืนยันลบวัตถุดิบแบบกลุ่ม</h3>
                <p className="text-xs text-rose-400">การดำเนินการนี้จะไม่สามารถย้อนกลับได้</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-slate-300 font-semibold">
                  คุณกำลังจะลบวัตถุดิบจำนวน <span className="text-rose-400 font-extrabold">{selectedIngIds.length} รายการ</span>:
                </p>
                <span className="text-emerald-400 font-mono font-bold text-[11px]">
                  มูลค่ารวม: {ingredients
                    .filter(i => selectedIngIds.includes(i.id))
                    .reduce((sum, i) => sum + (i.currentStock * i.unitCost), 0)
                    .toLocaleString('th-TH')} ฿
                </span>
              </div>
              <ul className="max-h-36 overflow-y-auto space-y-1.5 pl-1 pr-1 text-slate-400 font-mono text-[11px]">
                {ingredients
                  .filter(i => selectedIngIds.includes(i.id))
                  .map(i => (
                    <li key={i.id} className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                      <div className="flex items-center space-x-1.5 overflow-hidden">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0"></span>
                        <span className="text-slate-200 font-sans font-semibold truncate">{i.name}</span>
                        <span className="text-slate-500 flex-shrink-0">(ID: {i.id})</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-amber-400 font-bold block">{i.currentStock} {i.unit}</span>
                        <span className="text-[10px] text-slate-400">{(i.currentStock * i.unitCost).toLocaleString('th-TH')} ฿</span>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-rose-950/50 flex items-center justify-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>ยืนยันลบ {selectedIngIds.length} รายการ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ADJUSTMENT LOG MODAL */}
      <AdjustmentLogModal
        isOpen={isAdjustmentLogOpen}
        onClose={() => setIsAdjustmentLogOpen(false)}
        selectedIngredientId={selectedIngForLog}
      />

      {/* MODAL 6: INVENTORY REPORT PRINT MODAL */}
      <InventoryReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />
    </div>
  );
};
