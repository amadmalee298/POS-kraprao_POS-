import React, { useMemo, useState } from 'react';
import { ChevronDown, GitMerge, Sparkles, Trash2 } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useKeyedList } from '../../hooks/useKeyedList';
import type { PrepRecipe } from '../../types';
import { duplicateGroups, oddAlertLevels, unusedIngredients, usedIngredientIds } from '../../utils/ingredientCleanup';

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : '0');

/**
 * จัดระเบียบวัตถุดิบ: names entered several ways merged into one (stock added together, recipes
 * moved over), unused items without stock removed, and alert levels that do not fit the unit fixed.
 */
export const IngredientCleanupPanel: React.FC = () => {
  const { ingredients, menuItems, addOns, mergeIngredients, deleteIngredients, updateIngredient, currentUser } = usePOS();
  const [recipes] = useKeyedList<PrepRecipe>('prep_recipes', 'POS_PREP_RECIPES', undefined);
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const canEdit = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const used = useMemo(() => usedIngredientIds(menuItems, addOns, recipes), [menuItems, addOns, recipes]);
  const groups = useMemo(() => duplicateGroups(ingredients, used), [ingredients, used]);
  const unused = useMemo(() => unusedIngredients(ingredients, used), [ingredients, used]);
  const odd = useMemo(() => oddAlertLevels(ingredients), [ingredients]);
  const total = groups.length + unused.length + odd.length;
  if (!canEdit) return null;

  const mergeGroup = (groupKey: string, members: typeof ingredients) => {
    const keepId = keep[groupKey] || members[0].id;
    const target = members.find(m => m.id === keepId)!;
    // One at a time (each merge works from the list as it is after the one before)
    const next = members.find(m => m.id !== keepId);
    if (!next) return;
    if (!window.confirm(`รวม "${next.name}" เข้ากับ "${target.name}"?\nสต็อกบวกรวมกัน สูตรเมนูที่ใช้ "${next.name}" เปลี่ยนไปใช้ "${target.name}" แล้วลบ "${next.name}"`)) return;
    const res = mergeIngredients(target.id, next.id);
    setMessage(res.ok ? { ok: true, text: `รวม "${next.name}" เข้ากับ "${target.name}" แล้ว${members.length > 2 ? ' (กดรวมต่อสำหรับรายการที่เหลือ)' : ''}` } : { ok: false, text: res.error || 'รวมไม่สำเร็จ' });
  };

  const removePicked = () => {
    const ids = unused.filter(i => picked.has(i.id)).map(i => i.id);
    if (!ids.length) return;
    if (!window.confirm(`ลบวัตถุดิบ ${ids.length} รายการ? (ไม่มีสต็อกและไม่มีสูตรเมนูใช้)`)) return;
    deleteIngredients(ids);
    setPicked(new Set());
    setMessage({ ok: true, text: `ลบวัตถุดิบที่ไม่ใช้แล้ว ${ids.length} รายการ` });
  };

  const saveAlert = (id: string) => {
    const ing = ingredients.find(i => i.id === id);
    const value = Number(alerts[id]);
    if (!ing || !Number.isFinite(value) || value < 0) return;
    updateIngredient({ ...ing, minStockAlert: value });
    setMessage({ ok: true, text: `ตั้งจุดเตือน "${ing.name}" เป็น ${fmt(value)} ${ing.unit} แล้ว` });
  };

  return (
    <section className="bg-slate-900 border border-amber-700/40 rounded-2xl text-xs text-slate-200" aria-label="จัดระเบียบวัตถุดิบ">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full p-3.5 flex items-center gap-2 text-left min-h-[48px]">
        <Sparkles className={`w-5 h-5 ${total ? 'text-amber-400' : 'text-emerald-400'}`} />
        <span className="flex-1 font-bold text-sm">
          {total ? `จัดระเบียบวัตถุดิบ: ชื่อซ้ำ ${groups.length} กลุ่ม · ไม่ได้ใช้ ${unused.length} · จุดเตือนแปลก ${odd.length}` : 'รายการวัตถุดิบเรียบร้อย'}
        </span>
        <ChevronDown className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-4">
          {message && <div className={`p-2 rounded-lg border ${message.ok ? 'border-emerald-700/50 text-emerald-200' : 'border-rose-700/50 text-rose-200'}`}>{message.text}</div>}

          {groups.length > 0 && (
            <div className="space-y-2">
              <div className="font-bold text-amber-200">1. ชื่อที่น่าจะเป็นของเดียวกัน (เลือกชื่อที่จะเก็บ แล้วกดรวม)</div>
              {groups.map(g => {
                const key = g.map(i => i.id).sort().join('|');
                const keepId = keep[key] || g[0].id;
                return (
                  <div key={key} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    {g.map(i => (
                      <label key={i.id} className="flex items-center gap-2 min-h-[32px]">
                        <input type="radio" name={key} checked={keepId === i.id} onChange={() => setKeep(prev => ({ ...prev, [key]: i.id }))} />
                        <span className="flex-1">{i.name}</span>
                        <span className="font-mono text-slate-400">
                          {fmt(i.currentStock || 0)} {i.unit}
                        </span>
                        {used.has(i.id) && <span className="px-1.5 rounded bg-sky-900/60 text-sky-200 text-[10px]">ใช้ในสูตร</span>}
                      </label>
                    ))}
                    <button type="button" onClick={() => mergeGroup(key, g)} className="h-10 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold flex items-center gap-1.5">
                      <GitMerge className="w-4 h-4" /> รวมเข้ากับรายการที่เลือก
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {unused.length > 0 && (
            <div className="space-y-2">
              <div className="font-bold text-amber-200">2. ไม่มีสต็อก และไม่มีสูตรเมนูใช้ (เช่น ข้อมูลตัวอย่างเก่า)</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPicked(new Set(unused.map(i => i.id)))} className="h-9 px-3 rounded-lg border border-slate-700">เลือกทั้งหมด</button>
                <button type="button" onClick={() => setPicked(new Set())} className="h-9 px-3 rounded-lg border border-slate-700">ไม่เลือก</button>
                <button type="button" disabled={!picked.size} onClick={removePicked} className="h-9 px-3 rounded-lg bg-rose-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-40">
                  <Trash2 className="w-4 h-4" /> ลบที่เลือก ({picked.size})
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {unused.map(i => (
                  <label key={i.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 min-h-[40px]">
                    <input
                      type="checkbox"
                      checked={picked.has(i.id)}
                      onChange={e =>
                        setPicked(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(i.id);
                          else next.delete(i.id);
                          return next;
                        })
                      }
                    />
                    <span className="flex-1">{i.name}</span>
                    <span className="text-slate-500">{i.unit}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {odd.length > 0 && (
            <div className="space-y-2">
              <div className="font-bold text-amber-200">3. จุดเตือนไม่เข้ากับหน่วย (เช่น เตือนที่ 5 กรัม) แก้ตัวเลข หรือใส่ 0 = ไม่ต้องเตือน</div>
              {odd.map(i => (
                <div key={i.id} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="flex-1 min-w-[140px]">{i.name}</span>
                  <span className="text-slate-400">
                    เตือนที่ {fmt(i.minStockAlert)} {i.unit} →
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={alerts[i.id] ?? ''}
                    placeholder="จุดเตือนใหม่"
                    onChange={e => setAlerts(prev => ({ ...prev, [i.id]: e.target.value }))}
                    className="w-28 h-9 px-2 rounded-lg bg-slate-900 border border-slate-700"
                  />
                  <button type="button" disabled={alerts[i.id] === undefined || alerts[i.id] === ''} onClick={() => saveAlert(i.id)} className="h-9 px-3 rounded-lg bg-slate-700 font-bold disabled:opacity-40">
                    บันทึก
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
