import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Ingredient, ProteinOption, RecipeIngredient } from '../../types';
import { canonicalUnit, convertAmount, getAvailableRecipeUnits } from '../../utils/recipeUtils';

interface Props {
  value: ProteinOption[];
  onChange: (next: ProteinOption[]) => void;
  ingredients: Ingredient[];
  /** The dish's base recipe: a protein can replace some of its lines */
  baseRecipe: RecipeIngredient[];
}

const inputCls = 'bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500';

/**
 * Protein choices of a dish and what each does to the stock: e.g. "หมูกรอบ +20 ฿ →
 * หมูกรอบ 140 g instead of หมูสับ". The first choice is the one the base recipe is written for.
 */
export const ProteinOptionsEditor: React.FC<Props> = ({ value, onChange, ingredients, baseRecipe }) => {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const update = (idx: number, patch: Partial<ProteinOption>) => onChange(value.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const setLine = (idx: number, lineIdx: number, patch: Partial<RecipeIngredient>) => {
    const recipe = (value[idx].recipe || []).map((r, i) => (i === lineIdx ? { ...r, ...patch } : r));
    update(idx, { recipe });
  };

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-[11px] text-slate-500">ไม่มีตัวเลือกเนื้อสัตว์ (เมนูนี้มีแบบเดียว)</p>}
      {value.map((opt, idx) => (
        <div key={idx} className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <input
              aria-label="ชื่อตัวเลือก"
              placeholder="เช่น หมูกรอบ"
              value={opt.name}
              onChange={e => update(idx, { name: e.target.value })}
              className={`${inputCls} flex-1 min-w-0`}
            />
            <span className="text-slate-400 shrink-0">+฿</span>
            <input
              aria-label="ราคาเพิ่ม"
              type="number"
              min={0}
              value={opt.extraPrice}
              onChange={e => update(idx, { extraPrice: Math.max(0, Number(e.target.value) || 0) })}
              className={`${inputCls} w-16`}
            />
            <button
              type="button"
              aria-label={`ลบตัวเลือก ${opt.name}`}
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
              className="p-1.5 text-slate-400 hover:text-rose-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {idx === 0 ? (
            <p className="text-[10px] text-slate-500">ตัวเลือกแรก = ใช้สูตรหลักของเมนู</p>
          ) : (
            <>
              {baseRecipe.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">ใช้แทน:</span>
                  {baseRecipe.map(r => {
                    const on = opt.replacesIngredientIds?.includes(r.ingredientId);
                    return (
                      <button
                        key={r.ingredientId}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          update(idx, {
                            replacesIngredientIds: on
                              ? (opt.replacesIngredientIds || []).filter(id => id !== r.ingredientId)
                              : [...(opt.replacesIngredientIds || []), r.ingredientId]
                          })
                        }
                        className={`px-2 py-1 rounded-lg border text-[11px] ${
                          on ? 'bg-rose-500/20 border-rose-500/50 text-rose-200 line-through' : 'border-slate-700 text-slate-300'
                        }`}
                      >
                        {byId.get(r.ingredientId)?.name || r.ingredientId}
                      </button>
                    );
                  })}
                </div>
              )}
              {(opt.recipe || []).map((line, lineIdx) => {
                const ing = byId.get(line.ingredientId);
                const units = getAvailableRecipeUnits(ing?.unit || 'pcs');
                const unit = line.recipeUnit ? canonicalUnit(line.recipeUnit) : canonicalUnit(ing?.unit) || units[0]?.val;
                return (
                  <div key={lineIdx} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-emerald-400 shrink-0">ใช้</span>
                    <select
                      aria-label="วัตถุดิบ"
                      value={line.ingredientId}
                      onChange={e => {
                        const next = byId.get(e.target.value);
                        setLine(idx, lineIdx, { ingredientId: e.target.value, recipeUnit: canonicalUnit(next?.unit) || 'pcs' });
                      }}
                      className={`${inputCls} flex-1 min-w-0`}
                    >
                      {ingredients.map(i => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="ปริมาณ"
                      type="number"
                      step="any"
                      min={0}
                      value={line.amountNeeded}
                      onChange={e => setLine(idx, lineIdx, { amountNeeded: Math.max(0, Number(e.target.value) || 0) })}
                      className={`${inputCls} w-20`}
                    />
                    <select
                      aria-label="หน่วย"
                      value={unit}
                      onChange={e =>
                        setLine(idx, lineIdx, {
                          amountNeeded: Number((convertAmount(line.amountNeeded, unit, e.target.value) ?? line.amountNeeded).toFixed(4)),
                          recipeUnit: e.target.value
                        })
                      }
                      className={`${inputCls} w-16`}
                    >
                      {units.map(u => (
                        <option key={u.val} value={u.val}>
                          {u.val}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="ลบวัตถุดิบ"
                      onClick={() => update(idx, { recipe: (opt.recipe || []).filter((_, i) => i !== lineIdx) })}
                      className="p-1 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                disabled={ingredients.length === 0}
                onClick={() => {
                  const first = ingredients[0];
                  const unit = canonicalUnit(first.unit);
                  const amount = unit === 'kg' || unit === 'g' ? 100 : unit === 'l' || unit === 'ml' ? 10 : 1;
                  update(idx, {
                    recipe: [...(opt.recipe || []), { ingredientId: first.id, amountNeeded: amount, recipeUnit: unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit || 'pcs' }]
                  });
                }}
                className="text-[11px] text-emerald-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่มวัตถุดิบของตัวเลือกนี้
              </button>
            </>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { name: '', extraPrice: 0 }])}
        className="w-full py-2 rounded-xl border border-dashed border-slate-700 text-slate-300 flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" /> เพิ่มตัวเลือกเนื้อสัตว์
      </button>
    </div>
  );
};
