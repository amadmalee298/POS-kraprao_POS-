import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, GitMerge } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { auditRecipes, RecipeIssue, suggestDuplicateIngredients, unitsCompatible } from '../../utils/recipeUtils';

/**
 * Recipe health check: dishes that would not deduct stock or would show a wrong cost, plus a tool
 * to merge ingredients that were entered twice.
 */
export const RecipeAuditPanel: React.FC<{ onEditMenu?: (menuItemId: string, kind: RecipeIssue['kind']) => void }> = ({ onEditMenu }) => {
  const { menuItems, addOns, ingredients, mergeIngredients } = usePOS();
  const [open, setOpen] = useState(false);
  const [keepId, setKeepId] = useState('');
  const [dupId, setDupId] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const issues = useMemo(() => auditRecipes(menuItems, addOns, ingredients), [menuItems, addOns, ingredients]);
  const duplicates = useMemo(() => suggestDuplicateIngredients(ingredients), [ingredients]);
  const byId = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);

  const keep = byId.get(keepId);
  const dup = byId.get(dupId);
  const canMerge = !!keep && !!dup && keep.id !== dup.id && unitsCompatible(dup.unit, keep.unit);

  const merge = () => {
    if (!keep || !dup) return;
    if (!confirm(`รวม "${dup.name}" เข้ากับ "${keep.name}"?\nสูตรทุกเมนูจะเปลี่ยนไปใช้ "${keep.name}" สต็อกจะถูกบวกรวม และ "${dup.name}" จะถูกลบ`)) return;
    const res = mergeIngredients(keep.id, dup.id);
    setMessage(res.ok ? { ok: true, text: `รวม "${dup.name}" เข้ากับ "${keep.name}" แล้ว` } : { ok: false, text: res.error || 'รวมไม่สำเร็จ' });
    if (res.ok) setDupId('');
  };

  const total = issues.length + duplicates.length;

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-200" aria-label="ตรวจสูตรอาหาร">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full p-3.5 flex items-center gap-2 text-left">
        {total === 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
        <span className="flex-1 font-bold text-sm">
          {total === 0 ? 'สูตรอาหารครบถ้วน ตัดสต็อกได้ทุกเมนู' : `ตรวจสูตร: พบ ${issues.length} จุดที่ควรแก้${duplicates.length ? ` · วัตถุดิบอาจซ้ำ ${duplicates.length} คู่` : ''}`}
        </span>
        <ChevronDown className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 space-y-3">
          {issues.length > 0 && (
            <ul className="space-y-1.5">
              {issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span className="flex-1">{issue.message}</span>
                  {issue.menuItemId && onEditMenu && (
                    <button type="button" onClick={() => onEditMenu(issue.menuItemId!, issue.kind)} className="text-amber-300 font-bold shrink-0">
                      แก้
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-bold flex items-center gap-1.5">
              <GitMerge className="w-4 h-4 text-cyan-400" /> รวมวัตถุดิบที่ซ้ำกัน
            </div>
            <p className="text-[11px] text-slate-400">
              สูตรที่ใช้ตัวซ้ำจะเปลี่ยนไปใช้ตัวที่เก็บไว้ สต็อกบวกรวมกัน แล้วลบตัวซ้ำ (หน่วยต้องแปลงกันได้ เช่น กก./กรัม, ลิตร/มล.)
            </p>
            {duplicates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {duplicates.map(([k, d]) => (
                  <button
                    key={`${k.id}-${d.id}`}
                    type="button"
                    onClick={() => {
                      setKeepId(k.id);
                      setDupId(d.id);
                      setMessage(null);
                    }}
                    className="px-2 py-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200"
                  >
                    {d.name} → {k.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                ตัวซ้ำ (จะถูกลบ)
                <select value={dupId} onChange={e => setDupId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2">
                  <option value="">เลือก...</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                เก็บตัวนี้ไว้
                <select value={keepId} onChange={e => setKeepId(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2">
                  <option value="">เลือก...</option>
                  {ingredients.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {keep && dup && !unitsCompatible(dup.unit, keep.unit) && (
              <p className="text-rose-300">หน่วย {dup.unit} กับ {keep.unit} รวมกันไม่ได้</p>
            )}
            <button
              type="button"
              disabled={!canMerge}
              onClick={merge}
              className="h-10 px-4 rounded-xl bg-cyan-500 text-slate-950 font-bold disabled:opacity-40"
            >
              รวมวัตถุดิบ
            </button>
            {message && <p className={message.ok ? 'text-emerald-300' : 'text-rose-300'}>{message.text}</p>}
          </div>
        </div>
      )}
    </section>
  );
};
