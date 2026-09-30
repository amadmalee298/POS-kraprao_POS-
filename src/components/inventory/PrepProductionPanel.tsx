import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChefHat, Edit3, Plus, Trash2, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import type { Ingredient, PrepBatch, PrepRecipe } from '../../types';
import { planPrep, yieldPercent } from '../../utils/prep';
import { matchIngredient } from '../../utils/stockIntake';
import { convertForIngredient, effectiveUnitCost } from '../../utils/recipeUtils';

/**
 * Kitchen prep: draw raw ingredients from stock, cook them, and receive the prepped item (e.g.
 * ซอสกะเพรา, เนื้อบดปรุงสุก) into stock at the cost of what went in.
 */

interface Template {
  name: string;
  unit: string;
  category: string;
  outputQty: number;
  /** Amounts are in kg for solids and l for liquids, converted to each ingredient's own unit */
  inputs: { names: string[]; quantity: number; unit: 'kg' | 'l' }[];
}

// Starting points only: lines are matched to the shop's ingredients and can be changed before saving
const TEMPLATES: Template[] = [
  {
    name: 'ซอสกะเพรา',
    unit: 'l',
    category: 'sauce',
    outputQty: 1,
    inputs: [
      { names: ['ซอสหอยนางรม'], quantity: 0.3, unit: 'l' },
      { names: ['ซีอิ๊วขาว', 'ซีอิ๊ว'], quantity: 0.2, unit: 'l' },
      { names: ['ซีอิ๊วดำ'], quantity: 0.05, unit: 'l' },
      { names: ['น้ำปลา'], quantity: 0.1, unit: 'l' },
      { names: ['น้ำตาลทราย', 'น้ำตาล'], quantity: 0.15, unit: 'kg' }
    ]
  },
  {
    name: 'น้ำปลาพริก',
    unit: 'l',
    category: 'sauce',
    outputQty: 1,
    inputs: [
      { names: ['น้ำปลา'], quantity: 0.8, unit: 'l' },
      { names: ['พริกขี้หนู', 'พริก'], quantity: 0.1, unit: 'kg' },
      { names: ['กระเทียม'], quantity: 0.05, unit: 'kg' },
      { names: ['มะนาว'], quantity: 0.1, unit: 'l' }
    ]
  },
  {
    name: 'เนื้อบดปรุงสุก',
    unit: 'kg',
    category: 'meat',
    outputQty: 0.8,
    inputs: [
      { names: ['เนื้อบด', 'เนื้อวัวบด', 'เนื้อสับ'], quantity: 1, unit: 'kg' },
      { names: ['กระเทียม'], quantity: 0.03, unit: 'kg' },
      { names: ['น้ำมันพืช', 'น้ำมัน'], quantity: 0.03, unit: 'l' }
    ]
  },
  {
    name: 'ไก่บดปรุงสุก',
    unit: 'kg',
    category: 'meat',
    outputQty: 0.8,
    inputs: [
      { names: ['ไก่บด', 'ไก่สับ'], quantity: 1, unit: 'kg' },
      { names: ['กระเทียม'], quantity: 0.03, unit: 'kg' },
      { names: ['น้ำมันพืช', 'น้ำมัน'], quantity: 0.03, unit: 'l' }
    ]
  }
];

const fmt = (n: number, d = 3) => (Number.isFinite(n) ? n.toLocaleString('th-TH', { maximumFractionDigits: d }) : '0');
const baht = (n: number) => `฿${(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface Draft {
  id?: string;
  outputIngredientId: string; // '' = create a new stock item
  newName: string;
  newUnit: string;
  newCategory: string;
  outputQty: string;
  inputs: { ingredientId: string; quantity: string }[];
  note: string;
}

const emptyDraft = (): Draft => ({
  outputIngredientId: '',
  newName: '',
  newUnit: 'kg',
  newCategory: 'sauce',
  outputQty: '1',
  inputs: [{ ingredientId: '', quantity: '' }],
  note: ''
});

export const PrepProductionPanel: React.FC = () => {
  const { ingredients, ingredientCategories, ingredientUnits, addIngredient, producePrep, currentUser } = usePOS();
  const [recipes, setRecipes] = useSharedList<PrepRecipe>('prep_recipes', 'POS_PREP_RECIPES');
  const [batchLog, setBatchLog] = useSharedList<PrepBatch>('prep_batches', 'POS_PREP_BATCHES');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [running, setRunning] = useState<PrepRecipe | null>(null);
  const [done, setDone] = useState('');

  const byId = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
  const sortedIngredients = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, 'th')), [ingredients]);

  const openTemplate = (t: Template) => {
    const squash = (x: string) => x.replace(/\s/g, '');
    const existing = ingredients.find(i => squash(i.name).includes(squash(t.name)));
    // Raw ingredients only: not the item being made or anything already cooked
    const raw = ingredients.filter(i => i.id !== existing?.id && !/ปรุงสุก|สำเร็จ/.test(i.name));
    const inputs = t.inputs
      .map(line => {
        const ing = line.names.map(n => matchIngredient(n, raw)).find(Boolean) as Ingredient | undefined;
        const qty = ing ? convertForIngredient(line.quantity, line.unit, ing.unit, ing) : null;
        // A unit that cannot be converted (e.g. ขวด) keeps the number for the shop to check
        return { ingredientId: ing?.id || '', quantity: String(Math.round((qty ?? line.quantity) * 1000) / 1000) };
      })
      .filter(l => l.ingredientId);
    setDraftError('');
    setDraft({
      outputIngredientId: existing?.id || '',
      newName: t.name,
      newUnit: t.unit,
      newCategory: t.category,
      outputQty: String(t.outputQty),
      inputs: inputs.length ? inputs : [{ ingredientId: '', quantity: '' }],
      note: inputs.length < t.inputs.length ? 'บางวัตถุดิบในสูตรตัวอย่างยังไม่มีในสต็อก เพิ่มเองได้' : ''
    });
  };

  const openEdit = (r: PrepRecipe) => {
    setDraftError('');
    setDraft({
      id: r.id,
      outputIngredientId: r.outputIngredientId,
      newName: '',
      newUnit: 'kg',
      newCategory: 'sauce',
      outputQty: String(r.outputQty),
      inputs: r.inputs.map(i => ({ ingredientId: i.ingredientId, quantity: String(i.quantity) })),
      note: r.note || ''
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    const outputQty = Number(draft.outputQty);
    const inputs = draft.inputs
      .map(i => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) }))
      .filter(i => i.ingredientId && i.quantity > 0);
    if (!draft.outputIngredientId && !draft.newName.trim()) return setDraftError('ใส่ชื่อสินค้าที่ผลิตได้');
    if (!(outputQty > 0)) return setDraftError('ใส่จำนวนที่ได้ต่อ 1 รอบ');
    if (!inputs.length) return setDraftError('เพิ่มวัตถุดิบที่ใช้อย่างน้อย 1 รายการ');
    let outputId = draft.outputIngredientId;
    if (inputs.some(i => i.ingredientId === outputId)) return setDraftError('วัตถุดิบที่ใช้ต้องไม่ใช่ตัวเดียวกับสินค้าที่ได้');
    if (!outputId) {
      const created = addIngredient({
        name: draft.newName.trim(),
        unit: draft.newUnit,
        category: draft.newCategory,
        currentStock: 0,
        minStockAlert: 0,
        unitCost: 0,
        stockType: 'inventory'
      });
      outputId = created.id;
    }
    const recipe: PrepRecipe = {
      id: draft.id || newId('prep'),
      outputIngredientId: outputId,
      outputQty,
      inputs,
      note: draft.note.trim() || undefined
    };
    setRecipes(prev => (draft.id ? prev.map(r => (r.id === draft.id ? recipe : r)) : [...prev, recipe]));
    setDraft(null);
  };

  const removeRecipe = (r: PrepRecipe) => {
    if (!window.confirm(`ลบสูตร ${byId.get(r.outputIngredientId)?.name || ''}? (สต็อกและประวัติไม่ถูกลบ)`)) return;
    setRecipes(prev => prev.filter(x => x.id !== r.id));
  };

  const setInput = (idx: number, patch: Partial<Draft['inputs'][number]>) =>
    setDraft(d => (d ? { ...d, inputs: d.inputs.map((l, i) => (i === idx ? { ...l, ...patch } : l)) } : d));

  const recentBatches = useMemo(() => [...batchLog].sort((a, b) => b.producedAt.localeCompare(a.producedAt)).slice(0, 30), [batchLog]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-start gap-3">
          <ChefHat className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-slate-100">ผลิต / เตรียมวัตถุดิบ</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              เบิกวัตถุดิบดิบออกจากสต็อกไปปรุง แล้วรับของที่ปรุงเสร็จ (เช่น ซอสกะเพรา เนื้อบดปรุงสุก) เข้าสต็อก ต้นทุนของที่ผลิตได้ = มูลค่าวัตถุดิบที่เบิก ÷ จำนวนที่ได้จริง
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => { setDraftError(''); setDraft(emptyDraft()); }} className="h-10 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold flex items-center gap-1">
            <Plus className="w-4 h-4" /> สร้างสูตรใหม่
          </button>
          {TEMPLATES.map(t => (
            <button key={t.name} type="button" onClick={() => openTemplate(t)} className="h-10 px-3 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800">
              + {t.name}
            </button>
          ))}
        </div>
      </div>

      {done && (
        <div role="status" className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{done}</span>
          <button type="button" onClick={() => setDone('')} aria-label="ปิด"><X className="w-4 h-4" /></button>
        </div>
      )}

      {recipes.length === 0 ? (
        <div className="p-6 rounded-2xl border border-dashed border-slate-700 text-center text-sm text-slate-400">
          ยังไม่มีสูตรผลิต กด “สร้างสูตรใหม่” หรือเลือกสูตรตัวอย่างด้านบน
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map(r => {
            const out = byId.get(r.outputIngredientId);
            const plan = planPrep(r, 1, ingredients);
            return (
              <div key={r.id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-100">{out?.name || 'สินค้าถูกลบไปแล้ว'}</div>
                    <div className="text-[11px] text-slate-400">
                      1 รอบได้ {fmt(r.outputQty)} {out?.unit} · ต้นทุน ≈ {baht(plan.unitCost)}/{out?.unit}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => openEdit(r)} aria-label="แก้ไขสูตร" className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300"><Edit3 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => removeRecipe(r)} aria-label="ลบสูตร" className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center text-rose-300"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <ul className="text-xs text-slate-300 space-y-0.5">
                  {plan.lines.map(l => (
                    <li key={l.ingredientId} className="flex justify-between gap-2">
                      <span>{l.name}</span>
                      <span className={l.short > 0 ? 'text-amber-300' : 'text-slate-400'}>{fmt(l.quantity)} {l.unit}</span>
                    </li>
                  ))}
                  {plan.missingIngredients.length > 0 && <li className="text-rose-300">มีวัตถุดิบ {plan.missingIngredients.length} รายการที่ถูกลบไปแล้ว</li>}
                </ul>
                <div className="text-[11px] text-slate-400">คงเหลือตอนนี้: {fmt(out?.currentStock || 0)} {out?.unit}</div>
                <button type="button" disabled={!out} onClick={() => setRunning(r)} className="mt-auto h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm disabled:opacity-40">
                  เบิกวัตถุดิบ & ผลิต
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <h4 className="font-bold text-sm text-slate-100 mb-2">ประวัติการผลิตล่าสุด</h4>
        {recentBatches.length === 0 ? (
          <p className="text-xs text-slate-500">ยังไม่มีการผลิต</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="text-slate-500 text-left">
                <tr>
                  <th className="py-1 pr-2">วันที่</th>
                  <th className="py-1 pr-2">สินค้า</th>
                  <th className="py-1 pr-2 text-right">ได้จริง</th>
                  <th className="py-1 pr-2 text-right">Yield</th>
                  <th className="py-1 pr-2 text-right">ต้นทุน</th>
                  <th className="py-1 pr-2 text-right">ต่อหน่วย</th>
                  <th className="py-1">ผู้ผลิต</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map(b => (
                  <tr key={b.id} className="border-t border-slate-800">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(b.producedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="py-1.5 pr-2">{b.outputName}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmt(b.outputQty)} {b.outputUnit}</td>
                    <td className={`py-1.5 pr-2 text-right ${yieldPercent(b.outputQty, b.expectedQty) < 90 ? 'text-amber-300' : ''}`}>{yieldPercent(b.outputQty, b.expectedQty)}%</td>
                    <td className="py-1.5 pr-2 text-right">{baht(b.cost)}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{baht(b.unitCost)}/{b.outputUnit}</td>
                    <td className="py-1.5">{b.producedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" onClick={() => setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="สูตรผลิต" onClick={e => e.stopPropagation()} className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg my-auto text-slate-100 text-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold">{draft.id ? 'แก้ไขสูตรผลิต' : 'สูตรผลิตใหม่'}</h3>
              <button type="button" onClick={() => setDraft(null)} aria-label="ปิด" className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label htmlFor="prep-out" className="block text-xs text-slate-400 mb-1">สินค้าที่ผลิตได้ (รับเข้าสต็อก)</label>
                <select id="prep-out" value={draft.outputIngredientId} onChange={e => setDraft({ ...draft, outputIngredientId: e.target.value })} className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700">
                  <option value="">+ สร้างรายการใหม่ในสต็อก</option>
                  {sortedIngredients.map(i => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
              </div>
              {!draft.outputIngredientId && (
                <div className="grid grid-cols-3 gap-2">
                  <input aria-label="ชื่อสินค้าใหม่" value={draft.newName} onChange={e => setDraft({ ...draft, newName: e.target.value })} placeholder="เช่น ซอสกะเพรา" className="col-span-3 h-11 px-3 rounded-xl bg-slate-900 border border-slate-700" />
                  <select aria-label="หน่วย" value={draft.newUnit} onChange={e => setDraft({ ...draft, newUnit: e.target.value })} className="h-11 px-2 rounded-xl bg-slate-900 border border-slate-700">
                    {Array.from(new Set(['kg', 'g', 'l', 'ml', 'pcs', ...ingredientUnits.map(u => u.symbol)])).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <select aria-label="หมวดหมู่" value={draft.newCategory} onChange={e => setDraft({ ...draft, newCategory: e.target.value })} className="col-span-2 h-11 px-2 rounded-xl bg-slate-900 border border-slate-700">
                    {ingredientCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="prep-qty" className="block text-xs text-slate-400 mb-1">
                  ได้ต่อ 1 รอบ ({draft.outputIngredientId ? byId.get(draft.outputIngredientId)?.unit : draft.newUnit})
                </label>
                <input id="prep-qty" type="number" inputMode="decimal" min="0" step="any" value={draft.outputQty} onChange={e => setDraft({ ...draft, outputQty: e.target.value })} className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700" />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">วัตถุดิบที่เบิกต่อ 1 รอบ</div>
                <div className="space-y-2">
                  {draft.inputs.map((l, idx) => (
                    <div key={idx} className="flex gap-2">
                      <select aria-label={`วัตถุดิบที่ ${idx + 1}`} value={l.ingredientId} onChange={e => setInput(idx, { ingredientId: e.target.value })} className="flex-1 min-w-0 h-11 px-2 rounded-xl bg-slate-900 border border-slate-700">
                        <option value="">เลือกวัตถุดิบ</option>
                        {sortedIngredients.filter(i => i.id !== draft.outputIngredientId).map(i => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      <input aria-label={`จำนวนวัตถุดิบที่ ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.quantity} onChange={e => setInput(idx, { quantity: e.target.value })} placeholder="จำนวน" className="w-24 h-11 px-2 rounded-xl bg-slate-900 border border-slate-700" />
                      <span className="w-10 self-center text-xs text-slate-400">{byId.get(l.ingredientId)?.unit || ''}</span>
                      <button type="button" aria-label="ลบบรรทัด" onClick={() => setDraft({ ...draft, inputs: draft.inputs.filter((_, i) => i !== idx) })} className="w-11 h-11 rounded-xl border border-slate-700 flex items-center justify-center text-rose-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setDraft({ ...draft, inputs: [...draft.inputs, { ingredientId: '', quantity: '' }] })} className="mt-2 h-10 px-3 rounded-xl border border-slate-700 text-xs flex items-center gap-1"><Plus className="w-4 h-4" /> เพิ่มวัตถุดิบ</button>
              </div>
              <input aria-label="หมายเหตุ" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="หมายเหตุ (ไม่บังคับ)" className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700" />
              {draftError && <div role="alert" className="text-xs text-rose-300">{draftError}</div>}
            </div>
            <div className="p-4 border-t border-slate-800 flex gap-2">
              <button type="button" onClick={() => setDraft(null)} className="flex-1 h-12 rounded-xl border border-slate-700 font-bold">ยกเลิก</button>
              <button type="button" onClick={saveDraft} className="flex-[2] h-12 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold">บันทึกสูตร</button>
            </div>
          </div>
        </div>
      )}

      {running && (
        <ProduceModal
          recipe={running}
          ingredients={ingredients}
          onClose={() => setRunning(null)}
          onProduce={(batches, outputQty, note) => {
            const out = byId.get(running.outputIngredientId);
            if (!out) return;
            const plan = planPrep(running, batches, ingredients);
            const result = producePrep({
              outputIngredientId: out.id,
              outputQty,
              inputs: plan.lines.map(l => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
              note
            });
            const record: PrepBatch = {
              id: newId('prepb'),
              recipeId: running.id,
              outputIngredientId: out.id,
              outputName: out.name,
              outputUnit: out.unit,
              batches,
              expectedQty: plan.expectedQty,
              outputQty,
              inputs: plan.lines.map(l => ({ ingredientId: l.ingredientId, name: l.name, unit: l.unit, quantity: l.quantity, cost: l.cost })),
              cost: result.cost,
              unitCost: Math.round(result.unitCost * 10000) / 10000,
              producedAt: new Date().toISOString(),
              producedBy: currentUser?.name || 'พนักงาน',
              note: note || undefined
            };
            setBatchLog(prev => [record, ...prev].slice(0, 500));
            setDone(`รับ ${out.name} เข้าสต็อก ${fmt(outputQty)} ${out.unit} · ต้นทุน ${baht(result.cost)} (${baht(result.unitCost)}/${out.unit}) · ต้นทุนเฉลี่ยในสต็อก ${baht(result.averageCost)}/${out.unit}`);
            setRunning(null);
          }}
        />
      )}
    </div>
  );
};

const ProduceModal: React.FC<{
  recipe: PrepRecipe;
  ingredients: Ingredient[];
  onClose: () => void;
  onProduce: (batches: number, outputQty: number, note: string) => void;
}> = ({ recipe, ingredients, onClose, onProduce }) => {
  const out = ingredients.find(i => i.id === recipe.outputIngredientId);
  const [batches, setBatches] = useState('1');
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');
  const n = Number(batches) || 0;
  const plan = planPrep(recipe, n, ingredients);
  const outputQty = actual.trim() === '' ? plan.expectedQty : Number(actual);
  const unitCost = outputQty > 0 ? plan.cost / outputQty : 0;
  const canProduce = n > 0 && outputQty > 0 && plan.lines.length > 0;

  const submit = () => {
    if (!canProduce) return;
    if (plan.hasShortage && !window.confirm('วัตถุดิบบางรายการในสต็อกไม่พอ ระบบจะตัดได้ไม่เกินที่มี (สต็อกไม่ติดลบ) ต้องการผลิตต่อหรือไม่?')) return;
    onProduce(n, outputQty, note.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`ผลิต ${out?.name || ''}`} onClick={e => e.stopPropagation()} className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg my-auto text-slate-100 text-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold">ผลิต {out?.name}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="prep-batches" className="block text-xs text-slate-400 mb-1">จำนวนรอบ</label>
              <input id="prep-batches" type="number" inputMode="decimal" min="0" step="any" value={batches} onChange={e => setBatches(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700" />
            </div>
            <div>
              <label htmlFor="prep-actual" className="block text-xs text-slate-400 mb-1">ได้จริง ({out?.unit})</label>
              <input id="prep-actual" type="number" inputMode="decimal" min="0" step="any" value={actual} onChange={e => setActual(e.target.value)} placeholder={fmt(plan.expectedQty)} className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-3 py-2 bg-slate-900 text-xs text-slate-400">เบิกออกจากสต็อก</div>
            <ul className="divide-y divide-slate-800">
              {plan.lines.map(l => (
                <li key={l.ingredientId} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span>{l.name}</span>
                  <span className="text-right">
                    <span className="font-bold">{fmt(l.quantity)} {l.unit}</span>
                    <span className={`block text-[11px] ${l.short > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
                      {l.short > 0 ? `ขาด ${fmt(l.short)} (มี ${fmt(l.inStock)})` : `มี ${fmt(l.inStock)}`} · {baht(l.cost)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {plan.hasShortage && (
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> วัตถุดิบบางรายการไม่พอ ตรวจนับหรือรับเข้าสต็อกก่อน
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">ต้นทุนรวม</div>
              <div className="font-bold">{baht(plan.cost)}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">ต่อ {out?.unit}</div>
              <div className="font-bold">{baht(unitCost)}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-slate-400">Yield</div>
              <div className={`font-bold ${yieldPercent(outputQty, plan.expectedQty) < 90 ? 'text-amber-300' : ''}`}>{yieldPercent(outputQty, plan.expectedQty)}%</div>
            </div>
          </div>
          {out && <p className="text-[11px] text-slate-500">ต้นทุนเดิมในสต็อก {baht(effectiveUnitCost(out))}/{out.unit} · คงเหลือ {fmt(out.currentStock || 0)} {out.unit} (ระบบคิดต้นทุนเฉลี่ยถ่วงน้ำหนักให้)</p>}
          <input aria-label="หมายเหตุการผลิต" value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700" />
        </div>
        <div className="p-4 border-t border-slate-800 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-12 rounded-xl border border-slate-700 font-bold">ยกเลิก</button>
          <button type="button" onClick={submit} disabled={!canProduce} className="flex-[2] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold disabled:opacity-40">
            ยืนยัน เบิก & รับเข้าสต็อก
          </button>
        </div>
      </div>
    </div>
  );
};
