import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  Cloud,
  ArrowLeftRight,
  Utensils,
  Package,
  RefreshCw,
  Search,
  Filter,
  Check,
  ChevronRight,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import {
  SyncConflictReport,
  MenuConflictItem,
  IngredientConflictItem,
  ConflictResolutionChoice,
  MenuItem,
  Ingredient
} from '../types';

interface SyncConflictResolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SyncConflictReport | null;
  onApplyResolution: (resolutions: {
    menuChoices: Record<string, ConflictResolutionChoice>;
    ingredientChoices: Record<string, ConflictResolutionChoice>;
  }) => Promise<any>;
  isApplying: boolean;
  onRefreshScan?: () => void;
  isScanning?: boolean;
}

export const SyncConflictResolverModal: React.FC<SyncConflictResolverModalProps> = ({
  isOpen,
  onClose,
  report,
  onApplyResolution,
  isApplying,
  onRefreshScan,
  isScanning = false
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'menus' | 'ingredients' | 'mismatches'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Local state for user choices (keyed by item ID)
  const [menuChoices, setMenuChoices] = useState<Record<string, ConflictResolutionChoice>>({});
  const [ingredientChoices, setIngredientChoices] = useState<Record<string, ConflictResolutionChoice>>({});

  // Initialize/sync choices with incoming report
  React.useEffect(() => {
    if (!report) return;

    const initialMenuChoices: Record<string, ConflictResolutionChoice> = {};
    report.menuConflicts.forEach(m => {
      initialMenuChoices[m.id] = m.choice || 'local';
    });
    setMenuChoices(initialMenuChoices);

    const initialIngChoices: Record<string, ConflictResolutionChoice> = {};
    report.ingredientConflicts.forEach(i => {
      initialIngChoices[i.id] = i.choice || 'local';
    });
    setIngredientChoices(initialIngChoices);
  }, [report]);

  if (!isOpen) return null;

  const setItemChoice = (type: 'menu' | 'ingredient', id: string, choice: ConflictResolutionChoice) => {
    if (type === 'menu') {
      setMenuChoices(prev => ({ ...prev, [id]: choice }));
    } else {
      setIngredientChoices(prev => ({ ...prev, [id]: choice }));
    }
  };

  const handleBulkChoice = (choice: ConflictResolutionChoice) => {
    if (!report) return;
    const newMenuChoices: Record<string, ConflictResolutionChoice> = {};
    report.menuConflicts.forEach(m => {
      newMenuChoices[m.id] = choice;
    });
    setMenuChoices(newMenuChoices);

    const newIngChoices: Record<string, ConflictResolutionChoice> = {};
    report.ingredientConflicts.forEach(i => {
      newIngChoices[i.id] = choice;
    });
    setIngredientChoices(newIngChoices);
  };

  // Smart resolution: Keep whichever is newer / custom logic
  const handleSmartResolution = () => {
    if (!report) return;
    const newMenuChoices: Record<string, ConflictResolutionChoice> = {};
    report.menuConflicts.forEach(m => {
      if (m.type === 'cloud_only') {
        newMenuChoices[m.id] = 'cloud'; // import from cloud
      } else {
        newMenuChoices[m.id] = 'local'; // keep local edit
      }
    });
    setMenuChoices(newMenuChoices);

    const newIngChoices: Record<string, ConflictResolutionChoice> = {};
    report.ingredientConflicts.forEach(i => {
      if (i.type === 'cloud_only') {
        newIngChoices[i.id] = 'cloud';
      } else {
        newIngChoices[i.id] = 'local';
      }
    });
    setIngredientChoices(newIngChoices);
  };

  // Filtered conflicts
  const filteredMenus = useMemo(() => {
    if (!report) return [];
    return report.menuConflicts.filter(m => {
      if (activeTab === 'ingredients') return false;
      if (activeTab === 'mismatches' && m.type !== 'mismatch') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.title.toLowerCase().includes(q) ||
          m.localItem?.nameEn?.toLowerCase().includes(q) ||
          m.cloudItem?.nameEn?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [report, activeTab, searchQuery]);

  const filteredIngredients = useMemo(() => {
    if (!report) return [];
    return report.ingredientConflicts.filter(i => {
      if (activeTab === 'menus') return false;
      if (activeTab === 'mismatches' && i.type !== 'mismatch') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          i.title.toLowerCase().includes(q) ||
          i.localIngredient?.unit.toLowerCase().includes(q) ||
          i.cloudIngredient?.unit.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [report, activeTab, searchQuery]);

  // Statistics
  const totalItems = (report?.menuConflicts.length || 0) + (report?.ingredientConflicts.length || 0);
  const localCount =
    Object.values(menuChoices).filter(c => c === 'local').length +
    Object.values(ingredientChoices).filter(c => c === 'local').length;
  const cloudCount =
    Object.values(menuChoices).filter(c => c === 'cloud').length +
    Object.values(ingredientChoices).filter(c => c === 'cloud').length;
  const skipCount =
    Object.values(menuChoices).filter(c => c === 'skip').length +
    Object.values(ingredientChoices).filter(c => c === 'skip').length;

  const handleApply = async () => {
    await onApplyResolution({
      menuChoices,
      ingredientChoices
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-750 text-slate-100 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto border-amber-500/20">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  เครื่องมือตรวจสอบและเลือกแหล่งข้อมูลที่ถูกต้อง (Conflict Resolver)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {totalItems} รายการขัดแย้ง
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                เปรียบเทียบความแตกต่างระหว่างข้อมูลในเครื่องสาขานี้ (Local) กับข้อมูลบนคลาวด์กลาง (Firestore Cloud)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onRefreshScan && (
              <button
                onClick={onRefreshScan}
                disabled={isScanning}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                title="สแกนเปรียบเทียบข้อมูลใหม่"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-amber-400' : ''}`} />
                <span>{isScanning ? 'กำลังสแกน...' : 'สแกนเปรียบเทียบใหม่'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isApplying}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Bulk Actions Toolbar */}
        <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tabs */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                activeTab === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ทั้งหมด ({totalItems})
            </button>
            <button
              onClick={() => setActiveTab('menus')}
              className={`px-3 py-1 rounded-lg font-medium transition flex items-center space-x-1.5 ${
                activeTab === 'menus'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>เมนูอาหาร ({report?.menuConflicts.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('ingredients')}
              className={`px-3 py-1 rounded-lg font-medium transition flex items-center space-x-1.5 ${
                activeTab === 'ingredients'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>วัตถุดิบคลัง ({report?.ingredientConflicts.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('mismatches')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                activeTab === 'mismatches'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              เฉพาะค่าไม่ตรงกัน
            </button>
          </div>

          {/* Quick Resolution Buttons */}
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-medium">เลือกด่วนทั้งระบบ:</span>
            <button
              onClick={() => handleBulkChoice('local')}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 transition font-semibold flex items-center space-x-1"
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>ใช้ข้อมูลเครื่องทั้งหมด</span>
            </button>
            <button
              onClick={() => handleBulkChoice('cloud')}
              className="px-2.5 py-1 rounded-lg bg-sky-950/60 border border-sky-500/40 text-sky-300 hover:bg-sky-900/60 transition font-semibold flex items-center space-x-1"
            >
              <Cloud className="w-3.5 h-3.5 text-sky-400" />
              <span>ใช้ข้อมูล Cloud ทั้งหมด</span>
            </button>
            <button
              onClick={handleSmartResolution}
              className="px-2.5 py-1 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-300 hover:bg-purple-900/60 transition font-semibold flex items-center space-x-1"
              title="เก็บเมนู/สต็อกที่แก้ในเครื่องไว้ และนำเข้าเฉพาะสิ่งที่ยังไม่มีจากคลาวด์"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>ผสานอัตโนมัติ (Smart)</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-2 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="ค้นหาชื่อเมนู หรือ วัตถุดิบที่มีความขัดแย้ง..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>คลิกที่ฝั่ง <b>เครื่องนี้</b> หรือ <b>คลาวด์</b> ในแต่ละแถว เพื่อกำหนดแหล่งข้อมูลหลัก</span>
          </div>
        </div>

        {/* Conflict List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[58vh]">
          {totalItems === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white">ข้อมูลตรงกันสมบูรณ์แบบ (No Conflicts)</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                ระบบตรวจสอบแล้วพบว่ารายการอาหารและสต็อกวัตถุดิบทั้งหมดในเครื่องนี้ตรงกับฐานข้อมูลกลางบน Firebase แล้ว
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          ) : filteredMenus.length === 0 && filteredIngredients.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              ไม่พบรายการขัดแย้งตามตัวกรองที่เลือก
            </div>
          ) : (
            <>
              {/* Menu Item Conflicts */}
              {filteredMenus.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                    <Utensils className="w-4 h-4" />
                    <span>ความขัดแย้งในหมวดเมนูอาหาร ({filteredMenus.length} รายการ)</span>
                  </div>

                  {filteredMenus.map(item => {
                    const currentChoice = menuChoices[item.id] || 'local';
                    return (
                      <ConflictCard
                        key={`menu-${item.id}`}
                        id={item.id}
                        typeBadge="เมนูอาหาร"
                        conflictType={item.type}
                        title={item.title}
                        diffs={item.diffs}
                        currentChoice={currentChoice}
                        onSelectChoice={choice => setItemChoice('menu', item.id, choice)}
                        localContent={
                          item.localItem ? (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ราคาขาย:</span>
                                <span className="font-bold text-emerald-400 font-mono">
                                  ฿{item.localItem.price.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ต้นทุน:</span>
                                <span className="font-mono text-slate-300">
                                  ฿{(item.localItem.costPrice || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">หมวดหมู่:</span>
                                <span className="text-slate-300">{item.localItem.category}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ท็อปปิ้ง:</span>
                                <span className="text-slate-300">
                                  {item.localItem.allowAddOns !== false ? 'เปิด' : 'ปิด'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">สูตรตัดสต็อก:</span>
                                <span className="text-slate-300">
                                  {(item.localItem.recipe || []).length} วัตถุดิบ
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500 italic text-xs py-4 text-center">
                              ไม่มีเมนูนี้ในเครื่อง (เป็นเมนูใหม่บน Cloud)
                            </div>
                          )
                        }
                        cloudContent={
                          item.cloudItem ? (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ราคาขาย:</span>
                                <span className="font-bold text-sky-400 font-mono">
                                  ฿{item.cloudItem.price.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ต้นทุน:</span>
                                <span className="font-mono text-slate-300">
                                  ฿{(item.cloudItem.costPrice || 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">หมวดหมู่:</span>
                                <span className="text-slate-300">{item.cloudItem.category}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ท็อปปิ้ง:</span>
                                <span className="text-slate-300">
                                  {item.cloudItem.allowAddOns !== false ? 'เปิด' : 'ปิด'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">สูตรตัดสต็อก:</span>
                                <span className="text-slate-300">
                                  {(item.cloudItem.recipe || []).length} วัตถุดิบ
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500 italic text-xs py-4 text-center">
                              ไม่มีเมนูนี้บน Cloud (ถูกสร้างใหม่ในเครื่องสาขา)
                            </div>
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}

              {/* Ingredient Conflicts */}
              {filteredIngredients.length > 0 && (
                <div className="space-y-3 pt-4">
                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                    <Package className="w-4 h-4" />
                    <span>ความขัดแย้งในหมวดคลังวัตถุดิบ ({filteredIngredients.length} รายการ)</span>
                  </div>

                  {filteredIngredients.map(item => {
                    const currentChoice = ingredientChoices[item.id] || 'local';
                    return (
                      <ConflictCard
                        key={`ing-${item.id}`}
                        id={item.id}
                        typeBadge="วัตถุดิบคลัง"
                        conflictType={item.type}
                        title={item.title}
                        diffs={item.diffs}
                        currentChoice={currentChoice}
                        onSelectChoice={choice => setItemChoice('ingredient', item.id, choice)}
                        localContent={
                          item.localIngredient ? (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">สต็อกคงเหลือ:</span>
                                <span className="font-bold text-emerald-400 font-mono">
                                  {item.localIngredient.currentStock.toLocaleString()} {item.localIngredient.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ต้นทุนต่อหน่วย:</span>
                                <span className="font-mono text-slate-300">
                                  ฿{item.localIngredient.unitCost.toLocaleString()}/{item.localIngredient.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">เตือนสต็อกต่ำ:</span>
                                <span className="text-slate-300">
                                  {item.localIngredient.minStockAlert} {item.localIngredient.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">หมวดหมู่วัตถุดิบ:</span>
                                <span className="text-slate-300">{item.localIngredient.category}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500 italic text-xs py-4 text-center">
                              ไม่มีในเครื่อง (เป็นวัตถุดิบใหม่บน Cloud)
                            </div>
                          )
                        }
                        cloudContent={
                          item.cloudIngredient ? (
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">สต็อกคงเหลือ:</span>
                                <span className="font-bold text-sky-400 font-mono">
                                  {item.cloudIngredient.currentStock.toLocaleString()} {item.cloudIngredient.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">ต้นทุนต่อหน่วย:</span>
                                <span className="font-mono text-slate-300">
                                  ฿{item.cloudIngredient.unitCost.toLocaleString()}/{item.cloudIngredient.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">เตือนสต็อกต่ำ:</span>
                                <span className="text-slate-300">
                                  {item.cloudIngredient.minStockAlert} {item.cloudIngredient.unit}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">หมวดหมู่วัตถุดิบ:</span>
                                <span className="text-slate-300">{item.cloudIngredient.category}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500 italic text-xs py-4 text-center">
                              ไม่มีบน Cloud (ถูกสร้างใหม่ในเครื่องสาขา)
                            </div>
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Summary and Action Buttons */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-1.5 text-emerald-300 font-semibold bg-emerald-950/50 px-2.5 py-1 rounded-lg border border-emerald-500/30">
              <HardDrive className="w-3.5 h-3.5" />
              <span>ใช้เครื่องนี้: {localCount}</span>
            </div>
            <div className="flex items-center space-x-1.5 text-sky-300 font-semibold bg-sky-950/50 px-2.5 py-1 rounded-lg border border-sky-500/30">
              <Cloud className="w-3.5 h-3.5" />
              <span>ใช้ Cloud: {cloudCount}</span>
            </div>
            {skipCount > 0 && (
              <div className="flex items-center space-x-1.5 text-slate-400 font-semibold bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
                <span>ข้าม: {skipCount}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying || totalItems === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังผสานและซิงค์ข้อมูล...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>ยืนยันและซิงค์ตามที่เลือก ({totalItems} รายการ)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ConflictCardProps {
  id: string;
  typeBadge: string;
  conflictType: 'mismatch' | 'local_only' | 'cloud_only';
  title: string;
  diffs: {
    fieldName: string;
    fieldLabel: string;
    localValue: any;
    cloudValue: any;
    formattedLocal: string;
    formattedCloud: string;
  }[];
  currentChoice: ConflictResolutionChoice;
  onSelectChoice: (choice: ConflictResolutionChoice) => void;
  localContent: React.ReactNode;
  cloudContent: React.ReactNode;
}

const ConflictCard: React.FC<ConflictCardProps> = ({
  id,
  typeBadge,
  conflictType,
  title,
  diffs,
  currentChoice,
  onSelectChoice,
  localContent,
  cloudContent
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition">
      {/* Card Header */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {typeBadge}
          </span>
          <h4 className="font-bold text-sm text-white">{title}</h4>
          <span className="text-[10px] font-mono text-slate-500">ID: {id}</span>
        </div>

        {/* Conflict Type Chip */}
        <div className="flex items-center space-x-2">
          {conflictType === 'mismatch' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3" />
              <span>ค่าต่างกัน ({diffs.length} จุด)</span>
            </span>
          )}
          {conflictType === 'local_only' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
              <HardDrive className="w-3 h-3" />
              <span>มีเฉพาะในเครื่องสาขา</span>
            </span>
          )}
          {conflictType === 'cloud_only' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30 flex items-center space-x-1">
              <Cloud className="w-3 h-3" />
              <span>มีเฉพาะบน Cloud</span>
            </span>
          )}
        </div>
      </div>

      {/* Field Differences Highlighter Chips */}
      {diffs.length > 0 && conflictType === 'mismatch' && (
        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/60 flex flex-wrap gap-2 text-[11px]">
          <span className="text-slate-400 font-medium self-center">จุดที่แตกต่าง:</span>
          {diffs.map((d, idx) => (
            <div
              key={idx}
              className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center space-x-1"
            >
              <span className="font-semibold text-amber-300">{d.fieldLabel}:</span>
              <span className="text-emerald-400 font-mono">{d.formattedLocal}</span>
              <ArrowLeftRight className="w-3 h-3 text-slate-500" />
              <span className="text-sky-400 font-mono">{d.formattedCloud}</span>
            </div>
          ))}
        </div>
      )}

      {/* Side-by-Side Comparison Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
        {/* Left Side: Local State */}
        <div
          onClick={() => onSelectChoice('local')}
          className={`p-4 cursor-pointer transition relative flex flex-col justify-between ${
            currentChoice === 'local'
              ? 'bg-emerald-950/25 ring-1 ring-inset ring-emerald-500/50'
              : 'hover:bg-slate-800/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400">
                <HardDrive className="w-4 h-4" />
                <span>ข้อมูลในเครื่องสาขานี้ (Local)</span>
              </div>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  currentChoice === 'local'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'border border-slate-600 text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </span>
            </div>
            {localContent}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              {conflictType === 'local_only' ? 'ดันขึ้น Cloud กลาง' : 'ใช้ค่าเครื่องนี้อัปเดตทับ Cloud'}
            </span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onSelectChoice('local');
              }}
              className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                currentChoice === 'local'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {currentChoice === 'local' ? '✓ เลือกเครื่องนี้' : 'เลือกเครื่องนี้'}
            </button>
          </div>
        </div>

        {/* Right Side: Cloud State */}
        <div
          onClick={() => onSelectChoice('cloud')}
          className={`p-4 cursor-pointer transition relative flex flex-col justify-between ${
            currentChoice === 'cloud'
              ? 'bg-sky-950/25 ring-1 ring-inset ring-sky-500/50'
              : 'hover:bg-slate-800/40'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-sky-400">
                <Cloud className="w-4 h-4" />
                <span>ข้อมูลบน Cloud กลาง (Firestore)</span>
              </div>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition ${
                  currentChoice === 'cloud'
                    ? 'bg-sky-500 text-slate-950'
                    : 'border border-slate-600 text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </span>
            </div>
            {cloudContent}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              {conflictType === 'cloud_only' ? 'ดาวน์โหลดลงเครื่อง' : 'ดึงค่าจาก Cloud มาทับเครื่องนี้'}
            </span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onSelectChoice('cloud');
              }}
              className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                currentChoice === 'cloud'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {currentChoice === 'cloud' ? '✓ เลือกคลาวด์' : 'เลือกคลาวด์'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
