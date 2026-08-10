import React, { useState, useEffect } from 'react';
import { calcRecipeItemCostAndDeduction } from '../../utils/recipeUtils';
import { usePOS } from '../../context/POSContext';
import {
  Sparkles,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Edit2,
  Save,
  Check,
  RefreshCw,
  Utensils,
  Layers,
  HelpCircle,
  SlidersHorizontal,
  ChevronRight,
  Zap,
  TrendingUp,
  X
} from 'lucide-react';

export const BulkIngredientCostEditorPanel: React.FC = () => {
  const { ingredients, menuItems, updateIngredientPriceAndRecalculate } = usePOS();

  // 1. Ingredient Selection State
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>(
    ingredients[0]?.id || ''
  );

  const selectedIng = ingredients.find(i => i.id === selectedIngredientId) || ingredients[0];

  // 2. New Price & Target Margin Config
  const [newUnitCost, setNewUnitCost] = useState<number>(selectedIng?.unitCost || 0);
  const [targetFoodCostPercent, setTargetFoodCostPercent] = useState<number>(30); // Target Food Cost % (default 30%)
  const [roundingOption, setRoundingOption] = useState<'nearest_5' | 'none' | 'ceil_10'>('nearest_5');

  // Sync newUnitCost whenever selected ingredient changes
  useEffect(() => {
    if (selectedIng) {
      setNewUnitCost(selectedIng.unitCost);
    }
  }, [selectedIngredientId]);

  // 3. Affected Menu Items
  const affectedMenuItems = menuItems.filter(m =>
    m.recipe && m.recipe.some(r => r.ingredientId === selectedIngredientId)
  );

  // 4. Selection & Custom Override Prices
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [lastSummary, setLastSummary] = useState<{
    ingredientName: string;
    oldUnitCost: number;
    newUnitCost: number;
    unit: string;
    updatedCount: number;
  } | null>(null);

  // Initialize all affected items as selected whenever affectedMenuItems change, ingredient, new price, target % or rounding changes
  useEffect(() => {
    const initialSelected: Record<string, boolean> = {};
    const initialCustomPrices: Record<string, number> = {};

    affectedMenuItems.forEach(m => {
      // Retain checkbox state if already set, else default to true
      initialSelected[m.id] = selectedItemIds[m.id] !== undefined ? selectedItemIds[m.id] : true;

      // Calculate new total cost for this menu item
      const newCost = m.recipe ? m.recipe.reduce((sum, r) => {
        const ing = ingredients.find(i => i.id === r.ingredientId);
        const cost = r.ingredientId === selectedIngredientId
          ? newUnitCost
          : (ing?.unitCost || 0);
        const lineCost = calcRecipeItemCostAndDeduction(
          ing ? { ...ing, unitCost: cost } : { unit: 'pcs', unitCost: cost },
          r.amountNeeded,
          r.recipeUnit
        ).lineCost;
        return sum + lineCost;
      }, 0) : 0;

      // Calculate suggested retail price based on target food cost %
      let suggested = targetFoodCostPercent > 0 ? newCost / (targetFoodCostPercent / 100) : m.price;
      if (roundingOption === 'nearest_5') {
        suggested = Math.ceil(suggested / 5) * 5;
      } else if (roundingOption === 'ceil_10') {
        suggested = Math.ceil(suggested / 10) * 10;
      } else {
        suggested = Math.round(suggested);
      }

      // Default custom price to max of current price and suggested price
      initialCustomPrices[m.id] = Math.max(m.price, Math.max(1, suggested));
    });

    setSelectedItemIds(initialSelected);
    setCustomPrices(initialCustomPrices);
  }, [selectedIngredientId, newUnitCost, targetFoodCostPercent, roundingOption, menuItems.length]);

  // Quick percentage adjustment buttons e.g. +10%, +20%, +30%, -10%
  const handleApplyPercentage = (pct: number) => {
    if (!selectedIng) return;
    const updated = Number((selectedIng.unitCost * (1 + pct / 100)).toFixed(4));
    setNewUnitCost(Math.max(0.001, updated));
  };

  // Toggle all select
  const selectedCount = affectedMenuItems.filter(m => selectedItemIds[m.id]).length;
  const allChecked = affectedMenuItems.length > 0 && selectedCount === affectedMenuItems.length;

  const handleToggleSelectAll = () => {
    const nextState = !allChecked;
    const updated: Record<string, boolean> = {};
    affectedMenuItems.forEach(m => {
      updated[m.id] = nextState;
    });
    setSelectedItemIds(updated);
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCustomPriceChange = (id: string, price: number) => {
    setCustomPrices(prev => ({ ...prev, [id]: Math.max(0, price) }));
  };

  // Submit bulk update
  const handleApplyBulkUpdate = () => {
    if (!selectedIng) return;

    // Filter prices for selected items
    const pricesToUpdate: Record<string, number> = {};
    let count = 0;

    affectedMenuItems.forEach(m => {
      if (selectedItemIds[m.id]) {
        pricesToUpdate[m.id] = customPrices[m.id] !== undefined ? customPrices[m.id] : m.price;
        count++;
      }
    });

    updateIngredientPriceAndRecalculate(selectedIng.id, newUnitCost, pricesToUpdate);

    setLastSummary({
      ingredientName: selectedIng.name,
      oldUnitCost: selectedIng.unitCost,
      newUnitCost: newUnitCost,
      unit: selectedIng.unit,
      updatedCount: count
    });

    setShowSuccessModal(true);
  };

  const unitCostDiff = selectedIng ? newUnitCost - selectedIng.unitCost : 0;
  const unitCostDiffPercent = selectedIng && selectedIng.unitCost > 0
    ? ((unitCostDiff / selectedIng.unitCost) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* TOOL BANNER HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 p-6 rounded-3xl border border-amber-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-xs font-bold">
              <Zap className="w-3.5 h-3.5 fill-amber-400" />
              <span>Bulk Ingredient Cost & Retail Price Recalculator</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
              ปรับราคาทุนวัตถุดิบหลัก & คำนวณราคาขายเมนูล่าสุดยกแผง
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              เมื่อราคาตลาดของวัตถุดิบหลัก (เช่น หมูกรอบ, เนื้อหมู, ไข่ไก่, ซอส, พริกสด) มีการปรับขึ้นหรือลง 
              ระบบจะค้นหาทุกเมนูที่ใช้วัตถุดิบนี้ คำนวณ <span className="text-rose-400 font-bold">Food Cost ใหม่</span> และเสนอ <span className="text-emerald-400 font-bold">ราคาขายใหม่ (Suggested Retail Price)</span> ตามเป้าหมาย Gross Margin % ให้คุณอัปเดตทั้งร้านในคลิกเดียว
            </p>
          </div>

          {/* Quick Metrics Header Card */}
          {selectedIng && (
            <div className="bg-slate-950/80 backdrop-blur border border-slate-800 p-4 rounded-2xl flex items-center space-x-4 min-w-[260px] shrink-0">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                <Calculator className="w-6 h-6" />
              </div>
              <div className="space-y-0.5 text-xs">
                <span className="text-slate-400 font-medium block">เมนูที่ได้รับผลกระทบ:</span>
                <div className="text-lg font-black text-amber-400 font-mono">
                  {affectedMenuItems.length} <span className="text-xs text-slate-300 font-sans font-normal">รายการ</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  วัตถุดิบ: <strong className="text-slate-200">{selectedIng.name}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STEP 1: SELECT INGREDIENT & NEW MARKET COST */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Ingredient & Price Config Panel */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
          <div className="flex items-center space-x-2.5 border-b border-slate-800 pb-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">1. เลือกวัตถุดิบ & ใส่ราคาตลาดใหม่</h3>
              <p className="text-[11px] text-slate-400">กำหนดราคาทุนใหม่ต่อหน่วย</p>
            </div>
          </div>

          {/* Select Ingredient Dropdown */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">เลือกวัตถุดิบหลัก:</label>
            <select
              value={selectedIngredientId}
              onChange={e => setSelectedIngredientId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 transition"
            >
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>
                  {ing.name} (ราคาปัจจุบัน: ฿{ing.unitCost}/{ing.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Current vs New Cost Input */}
          {selectedIng && (
            <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">ราคาทุนเดิมในระบบ:</span>
                <span className="font-mono font-bold text-slate-300">฿{selectedIng.unitCost} / {selectedIng.unit}</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-amber-400 block">ราคาทุนใหม่ต่อหน่วย (บาท):</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={newUnitCost}
                    onChange={e => setNewUnitCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-amber-500/50 text-amber-300 text-base font-extrabold font-mono rounded-xl px-4 py-2.5 focus:outline-none focus:border-amber-400 pr-16"
                  />
                  <span className="absolute right-3 top-3 text-xs text-slate-400 font-bold">
                    ฿/{selectedIng.unit}
                  </span>
                </div>
              </div>

              {/* Price Diff Indicator */}
              <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">การเปลี่ยนแปลงราคา:</span>
                <span className={`font-mono font-bold flex items-center space-x-1 ${
                  unitCostDiff > 0 ? 'text-rose-400' : unitCostDiff < 0 ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {unitCostDiff > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : unitCostDiff < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}
                  <span>{unitCostDiff > 0 ? `+฿${unitCostDiff.toFixed(2)}` : `฿${unitCostDiff.toFixed(2)}`} ({unitCostDiffPercent}%)</span>
                </span>
              </div>

              {/* Quick Percentage Presets */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[11px] text-slate-400 font-semibold block">ปรับราคาด่วนตามเปอร์เซ็นต์ (%):</span>
                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                  <button
                    onClick={() => handleApplyPercentage(10)}
                    className="py-1.5 bg-slate-900 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-lg border border-slate-800 transition"
                  >
                    +10%
                  </button>
                  <button
                    onClick={() => handleApplyPercentage(20)}
                    className="py-1.5 bg-slate-900 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-lg border border-slate-800 transition"
                  >
                    +20%
                  </button>
                  <button
                    onClick={() => handleApplyPercentage(30)}
                    className="py-1.5 bg-slate-900 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 rounded-lg border border-slate-800 transition"
                  >
                    +30%
                  </button>
                  <button
                    onClick={() => handleApplyPercentage(-10)}
                    className="py-1.5 bg-slate-900 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-300 rounded-lg border border-slate-800 transition"
                  >
                    -10%
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Target Food Cost % & Rounding Rules */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <h4 className="font-bold text-slate-200 text-xs">เป้าหมายกำไร & สูตรคำนวณราคาขาย</h4>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-slate-400 font-medium">เป้าหมาย Food Cost %:</label>
                <span className="font-mono font-bold text-amber-400">{targetFoodCostPercent}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="50"
                step="1"
                value={targetFoodCostPercent}
                onChange={e => setTargetFoodCostPercent(parseInt(e.target.value) || 30)}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>15% (Margin สูง)</span>
                <span>30% (มาตรฐานร้านอาหาร)</span>
                <span>50%</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold text-slate-300 block">รูปแบบการปัดเศษราคาขาย:</label>
              <select
                value={roundingOption}
                onChange={e => setRoundingOption(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
              >
                <option value="nearest_5">ปัดขึ้นลงทีละ 5 บาท (เช่น ฿85, ฿90)</option>
                <option value="ceil_10">ปัดขึ้นเต็ม 10 บาท (เช่น ฿82 -&gt; ฿90)</option>
                <option value="none">ปัดเศษจำนวนเต็มปกติ (เช่น ฿82)</option>
              </select>
            </div>
          </div>
        </div>

        {/* STEP 2: AFFECTED MENU ITEMS TABLE & BULK ACTION */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
          
          <div className="space-y-4">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                  <Utensils className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">2. เมนูอาหารที่ใช้วัตถุดิบนี้ ({affectedMenuItems.length} รายการ)</h3>
                  <p className="text-[11px] text-slate-400">ตรวจสอบเปรียบเทียบต้นทุนใหม่และปรับราคาขาย</p>
                </div>
              </div>

              {affectedMenuItems.length > 0 && (
                <button
                  onClick={handleToggleSelectAll}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 text-xs font-bold transition flex items-center space-x-1.5 self-start sm:self-auto"
                >
                  <Check className={`w-3.5 h-3.5 ${allChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span>{allChecked ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}</span>
                </button>
              )}
            </div>

            {/* Affected Items List */}
            {affectedMenuItems.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <div className="p-3 bg-slate-900 rounded-full w-12 h-12 mx-auto flex items-center justify-center text-slate-500">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-300 text-sm">ไม่พบเมนูอาหารที่ใช้วัตถุดิบนี้</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    วัตถุดิบ <strong className="text-slate-300">"{selectedIng?.name}"</strong> ยังไม่ได้ถูกผูกในสูตร (BOM Recipe) ของเมนูใดในระบบ
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-200">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-3 w-10 text-center">เลือก</th>
                      <th className="p-3">เมนูอาหาร</th>
                      <th className="p-3 text-center">ปริมาณที่ใช้</th>
                      <th className="p-3">ต้นทุนเดิม</th>
                      <th className="p-3">ต้นทุนใหม่ (Food Cost)</th>
                      <th className="p-3">ราคาขายปัจจุบัน</th>
                      <th className="p-3">ราคาแนะนำใหม่</th>
                      <th className="p-3">ราคาขายใหม่ที่จะตั้ง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {affectedMenuItems.map(m => {
                      const recipeUsage = m.recipe?.find(r => r.ingredientId === selectedIngredientId);
                      const usageAmount = recipeUsage ? recipeUsage.amountNeeded : 0;

                      // Old food cost
                      const oldCost = m.costPrice || 0;
                      
                      // Calculate new food cost
                      const newCost = m.recipe ? m.recipe.reduce((sum, r) => {
                        const cost = r.ingredientId === selectedIngredientId
                          ? newUnitCost
                          : (ingredients.find(i => i.id === r.ingredientId)?.unitCost || 0);
                        return sum + r.amountNeeded * cost;
                      }, 0) : 0;

                      const costIncrease = newCost - oldCost;

                      // Suggested price based on target food cost %
                      let suggestedPrice = targetFoodCostPercent > 0 ? newCost / (targetFoodCostPercent / 100) : m.price;
                      if (roundingOption === 'nearest_5') {
                        suggestedPrice = Math.ceil(suggestedPrice / 5) * 5;
                      } else if (roundingOption === 'ceil_10') {
                        suggestedPrice = Math.ceil(suggestedPrice / 10) * 10;
                      } else {
                        suggestedPrice = Math.round(suggestedPrice);
                      }
                      suggestedPrice = Math.max(m.price, Math.max(1, suggestedPrice));

                      const currentPriceToSave = customPrices[m.id] !== undefined ? customPrices[m.id] : suggestedPrice;
                      const newMargin = currentPriceToSave - newCost;
                      const newFoodCostPercent = currentPriceToSave > 0 ? ((newCost / currentPriceToSave) * 100).toFixed(1) : '0';

                      const isSelected = !!selectedItemIds[m.id];

                      return (
                        <tr key={m.id} className={`hover:bg-slate-800/40 transition ${isSelected ? 'bg-amber-500/5' : 'opacity-75'}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectItem(m.id)}
                              className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-3">
                              <img src={m.image} alt={m.name} className="w-10 h-10 rounded-lg object-cover border border-slate-800 shrink-0" />
                              <div>
                                <h5 className="font-bold text-slate-100 text-xs">{m.name}</h5>
                                <span className="text-[10px] text-slate-400">ID: {m.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-amber-300">
                            {usageAmount} {selectedIng?.unit}
                          </td>
                          <td className="p-3 font-mono text-slate-400">
                            ฿{oldCost.toFixed(2)}
                          </td>
                          <td className="p-3 font-mono">
                            <div className="font-bold text-rose-400">฿{newCost.toFixed(2)}</div>
                            {costIncrease !== 0 && (
                              <div className={`text-[10px] ${costIncrease > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {costIncrease > 0 ? `+฿${costIncrease.toFixed(2)}` : `฿${costIncrease.toFixed(2)}`}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-300">
                            ฿{m.price}
                          </td>
                          <td className="p-3 font-mono">
                            <span className="font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                              ฿{suggestedPrice}
                            </span>
                          </td>
                          <td className="p-3 font-mono">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-slate-400 font-bold">฿</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                disabled={!isSelected}
                                value={currentPriceToSave}
                                onChange={e => handleCustomPriceChange(m.id, parseFloat(e.target.value) || 0)}
                                className="w-20 bg-slate-950 border border-amber-500/40 text-emerald-400 font-black rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-400 disabled:opacity-50"
                              />
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              FC: <span className="font-bold text-amber-300">{newFoodCostPercent}%</span> | กำไร: <span className="font-bold text-emerald-400">฿{newMargin.toFixed(0)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* BULK ACTION FOOTER BUTTON */}
          {affectedMenuItems.length > 0 && (
            <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                พร้อมอัปเดต <strong className="text-amber-400 font-bold">{selectedCount}</strong> จาก <strong className="text-slate-200">{affectedMenuItems.length}</strong> เมนูที่เลือก
              </div>

              <button
                onClick={handleApplyBulkUpdate}
                disabled={selectedCount === 0}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500 hover:from-orange-600 hover:to-emerald-600 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center space-x-2 shadow-lg shadow-amber-950/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>ยืนยันปรับราคาทุนวัตถุดิบ & อัปเดตราคาขาย ({selectedCount} เมนู)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL / TOAST: SUCCESS TICKET CONFIRMATION */}
      {showSuccessModal && lastSummary && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-slate-100 relative">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 text-emerald-400">
              <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-100 text-base">ปรับราคายกแผงสำเร็จแล้ว!</h3>
                <p className="text-xs text-emerald-400">อัปเดตข้อมูลต้นทุนและราคาขายลงระบบ POS เรียบร้อย</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>วัตถุดิบที่ปรับราคา:</span>
                <span className="font-bold text-amber-300">{lastSummary.ingredientName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>ราคาทุนเดิม:</span>
                <span className="line-through text-slate-500">฿{lastSummary.oldUnitCost}/{lastSummary.unit}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>ราคาทุนใหม่:</span>
                <span className="font-bold text-rose-400">฿{lastSummary.newUnitCost}/{lastSummary.unit}</span>
              </div>
              <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-2">
                <span>เมนูที่ถูกอัปเดตราคาขาย:</span>
                <span className="font-bold text-emerald-400">{lastSummary.updatedCount} เมนู</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 bg-slate-950/50 p-3 rounded-xl border border-slate-800">
              ✨ ข้อมูลสูตรอาหารและราคาขายใหม่ถูกบันทึกลงความจำเครื่อง (LocalStorage) เรียบร้อย สามารถใช้งานในหน้า POS และสั่งอาหารผ่าน QR Code ได้ทันที
            </p>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black text-xs rounded-xl shadow-lg transition"
            >
              ตกลงและปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
