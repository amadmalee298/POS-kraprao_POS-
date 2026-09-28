import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, PackageMinus, Plus, Trash2, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { useSharedList } from '../../hooks/useSharedList';
import type { Ingredient, IssueUnit, WasteReason } from '../../types';
import { convertAmount, effectiveUnitCost } from '../../utils/recipeUtils';
import { matchIngredient } from '../../utils/stockIntake';
import { localDay } from '../../utils/stockHistory';

/**
 * Taking stock out by hand: whole portions such as "ข้าวสวย 1 กล่อง" (issued for use or thrown
 * away), and waste of any ingredients with a reason, each valued at the ingredient's cost.
 */

const WASTE_REASONS: { id: WasteReason; label: string }[] = [
  { id: 'spoiled', label: 'เน่าเสีย / บูด' },
  { id: 'expired', label: 'หมดอายุ' },
  { id: 'damaged', label: 'ชำรุด / ทำหก ทำหล่น' },
  { id: 'overcooked', label: 'ปรุงเสีย / ลูกค้าคืน' },
  { id: 'trimming', label: 'ตัดแต่ง / เศษ' },
  { id: 'other', label: 'อื่นๆ (เหลือทิ้งปลายวัน)' }
];
const reasonLabel = (r: string) => WASTE_REASONS.find(x => x.id === r)?.label || r;

const fmt = (n: number, d = 3) => (Number.isFinite(n) ? n.toLocaleString('th-TH', { maximumFractionDigits: d }) : '0');
const baht = (n: number) => `฿${(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface UnitDraft {
  id?: string;
  name: string;
  unitLabel: string;
  inputs: { ingredientId: string; quantity: string }[];
}

interface WasteLine {
  key: string;
  ingredientId: string;
  quantity: string;
}

const blankLine = (): WasteLine => ({ key: newId('w'), ingredientId: '', quantity: '' });

/** Starting point for "ข้าวสวย 1 กล่อง": about 100 g of raw rice per box, plus the box itself */
function riceBoxDraft(ingredients: Ingredient[]): UnitDraft {
  const raw = ingredients.filter(i => !/ปรุงสุก|สำเร็จ/.test(i.name));
  const rice = ['ข้าวสาร', 'ข้าวหอมมะลิ', 'ข้าวสวย', 'ข้าว'].map(n => matchIngredient(n, raw)).find(Boolean);
  const box = raw.find(i => /กล่อง/.test(i.name) && (i.category === 'packaging' || /ข้าว|อาหาร|ใส่/.test(i.name)));
  const inputs: UnitDraft['inputs'] = [];
  if (rice) inputs.push({ ingredientId: rice.id, quantity: String(convertAmount(0.1, 'kg', rice.unit) ?? 0.1) });
  if (box) inputs.push({ ingredientId: box.id, quantity: '1' });
  return { name: 'ข้าวสวย', unitLabel: 'กล่อง', inputs: inputs.length ? inputs : [{ ingredientId: '', quantity: '' }] };
}

export const StockIssuePanel: React.FC = () => {
  const { ingredients, issueStock, wasteLogs } = usePOS();
  const [units, setUnits] = useSharedList<IssueUnit>('issue_units', 'POS_ISSUE_UNITS');
  const [draft, setDraft] = useState<UnitDraft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<WasteLine[]>([blankLine()]);
  const [reason, setReason] = useState<WasteReason>('spoiled');
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');

  const byId = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
  const sorted = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, 'th')), [ingredients]);

  // ---- Portions (ข้าวกล่อง) ----
  const saveDraft = () => {
    if (!draft) return;
    const inputs = draft.inputs.map(i => ({ ingredientId: i.ingredientId, quantity: Number(i.quantity) })).filter(i => i.ingredientId && i.quantity > 0);
    if (!draft.name.trim()) return setDraftError('ใส่ชื่อ เช่น ข้าวสวย');
    if (!draft.unitLabel.trim()) return setDraftError('ใส่หน่วย เช่น กล่อง');
    if (!inputs.length) return setDraftError('เพิ่มวัตถุดิบที่ตัดต่อ 1 หน่วยอย่างน้อย 1 รายการ');
    const unit: IssueUnit = { id: draft.id || newId('iu'), name: draft.name.trim(), unitLabel: draft.unitLabel.trim(), inputs };
    setUnits(prev => (draft.id ? prev.map(u => (u.id === draft.id ? unit : u)) : [...prev, unit]));
    setDraft(null);
  };

  const setDraftLine = (idx: number, patch: Partial<UnitDraft['inputs'][number]>) =>
    setDraft(d => (d ? { ...d, inputs: d.inputs.map((l, i) => (i === idx ? { ...l, ...patch } : l)) } : d));

  /** How many whole units the stock still covers */
  const unitsLeft = (u: IssueUnit) =>
    u.inputs.reduce((min, i) => {
      const ing = byId.get(i.ingredientId);
      return ing && i.quantity > 0 ? Math.min(min, Math.floor((ing.currentStock || 0) / i.quantity)) : min;
    }, Infinity);

  const unitCost = (u: IssueUnit) => u.inputs.reduce((s, i) => s + i.quantity * effectiveUnitCost(byId.get(i.ingredientId) || {}), 0);

  const issueUnits = (u: IssueUnit, asWaste: boolean) => {
    const n = Number(counts[u.id]);
    if (!(n > 0)) return;
    const left = unitsLeft(u);
    if (n > left && !window.confirm(`สต็อกพอประมาณ ${left} ${u.unitLabel} ต้องการตัด ${n} ${u.unitLabel} ต่อหรือไม่? (สต็อกไม่ติดลบ)`)) return;
    const label = `${u.name} ${fmt(n)} ${u.unitLabel}`;
    const { cost } = issueStock(
      u.inputs.map(i => ({ ingredientId: i.ingredientId, quantity: i.quantity * n })),
      asWaste ? { waste: 'other', note: `ทิ้ง ${label}` } : { note: `เบิกใช้ ${label}` }
    );
    setCounts(c => ({ ...c, [u.id]: '' }));
    setDone(`${asWaste ? 'ตัดของเสีย' : 'เบิกใช้'} ${label} แล้ว · มูลค่า ${baht(cost)}`);
  };

  // ---- Waste of any ingredients ----
  const wasteRows = lines.map(l => {
    const ing = byId.get(l.ingredientId);
    const qty = Number(l.quantity) || 0;
    return { ...l, ing, qty, value: ing ? qty * effectiveUnitCost(ing) : 0, over: !!ing && qty > (ing.currentStock || 0) };
  });
  const validRows = wasteRows.filter(r => r.ing && r.qty > 0);
  const wasteTotal = validRows.reduce((s, r) => s + r.value, 0);

  const submitWaste = () => {
    if (!validRows.length) return;
    if (validRows.some(r => r.over) && !window.confirm('บางรายการตัดมากกว่าที่มีในสต็อก ระบบจะตัดได้ไม่เกินที่มี ต้องการทำต่อหรือไม่?')) return;
    const text = [reasonLabel(reason), note.trim()].filter(Boolean).join(' · ');
    const { cost } = issueStock(validRows.map(r => ({ ingredientId: r.ingredientId, quantity: r.qty })), { waste: reason, note: text });
    setLines([blankLine()]);
    setNote('');
    setDone(`ตัดจ่ายของเสีย ${validRows.length} รายการ · มูลค่า ${baht(cost)}`);
  };

  // ---- This month's waste ----
  const month = localDay(new Date().toISOString()).slice(0, 7);
  const monthWaste = useMemo(() => wasteLogs.filter(w => (w.loggedDate || '').startsWith(month)), [wasteLogs, month]);
  const monthTotal = monthWaste.reduce((s, w) => s + (w.totalCostLoss || 0), 0);
  const topWaste = useMemo(() => {
    const m = new Map<string, { name: string; value: number }>();
    monthWaste.forEach(w => {
      const row = m.get(w.ingredientId) || { name: w.ingredientName, value: 0 };
      row.value += w.totalCostLoss || 0;
      m.set(w.ingredientId, row);
    });
    return Array.from(m.values()).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [monthWaste]);

  const input = 'h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100';

  return (
    <div className="space-y-4">
      {done && (
        <div role="status" className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-200 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{done}</span>
          <button type="button" onClick={() => setDone('')} aria-label="ปิด"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Portions */}
      <section className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-100">ตัดจ่ายเป็นกล่อง / หน่วย</h3>
            <p className="text-xs text-slate-400">เช่น ข้าวสวย 1 กล่อง = ข้าวสาร 100 g + กล่องข้าว 1 ใบ ใส่จำนวนกล่องแล้วกดเบิกใช้ หรือทิ้ง (ของเสีย)</p>
          </div>
          <div className="flex gap-2">
            {!units.some(u => u.name === 'ข้าวสวย') && (
              <button type="button" onClick={() => { setDraftError(''); setDraft(riceBoxDraft(ingredients)); }} className="h-10 px-3 rounded-xl border border-slate-700 text-slate-300 text-xs">
                + ข้าวสวย (กล่อง)
              </button>
            )}
            <button type="button" onClick={() => { setDraftError(''); setDraft({ name: '', unitLabel: 'กล่อง', inputs: [{ ingredientId: '', quantity: '' }] }); }} className="h-10 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold flex items-center gap-1">
              <Plus className="w-4 h-4" /> เพิ่มหน่วยตัดจ่าย
            </button>
          </div>
        </div>

        {units.length === 0 ? (
          <p className="text-xs text-slate-500">ยังไม่มีหน่วยตัดจ่าย กด “+ ข้าวสวย (กล่อง)” เพื่อเริ่ม</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {units.map(u => {
              const left = unitsLeft(u);
              return (
                <div key={u.id} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-100">{u.name} / {u.unitLabel}</div>
                      <div className="text-[11px] text-slate-400">
                        ต้นทุน {baht(unitCost(u))}/{u.unitLabel} · สต็อกพอ ≈ {Number.isFinite(left) ? fmt(left, 0) : '-'} {u.unitLabel}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" aria-label="แก้ไข" onClick={() => { setDraftError(''); setDraft({ id: u.id, name: u.name, unitLabel: u.unitLabel, inputs: u.inputs.map(i => ({ ingredientId: i.ingredientId, quantity: String(i.quantity) })) }); }} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center text-slate-300"><Edit3 className="w-4 h-4" /></button>
                      <button type="button" aria-label="ลบ" onClick={() => window.confirm(`ลบหน่วย ${u.name}?`) && setUnits(prev => prev.filter(x => x.id !== u.id))} className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center text-rose-300"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <ul className="text-xs text-slate-400">
                    {u.inputs.map(i => {
                      const ing = byId.get(i.ingredientId);
                      return <li key={i.ingredientId}>{ing ? `${ing.name} ${fmt(i.quantity)} ${ing.unit}` : 'วัตถุดิบถูกลบไปแล้ว'} / {u.unitLabel}</li>;
                    })}
                  </ul>
                  <div className="flex gap-2 mt-auto">
                    <input aria-label={`จำนวน${u.unitLabel} ${u.name}`} type="number" inputMode="numeric" min="0" step="any" value={counts[u.id] || ''} onChange={e => setCounts(c => ({ ...c, [u.id]: e.target.value }))} placeholder={u.unitLabel} className={`${input} w-28`} />
                    <button type="button" disabled={!(Number(counts[u.id]) > 0)} onClick={() => issueUnits(u, false)} className="flex-1 h-11 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-40">เบิกใช้</button>
                    <button type="button" disabled={!(Number(counts[u.id]) > 0)} onClick={() => issueUnits(u, true)} className="flex-1 h-11 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold disabled:opacity-40">ทิ้ง (ของเสีย)</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Waste write-off */}
      <section className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-start gap-2">
          <PackageMinus className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-100">ตัดจ่ายของเสีย</h3>
            <p className="text-xs text-slate-400">ตัดหลายรายการพร้อมกัน ระบบตัดสต็อก บันทึกมูลค่าความเสียหายตามต้นทุน และเข้ารายงานของเสีย</p>
          </div>
        </div>
        <div className="space-y-2">
          {wasteRows.map((r, idx) => (
            <div key={r.key} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              <select aria-label={`ของเสียรายการที่ ${idx + 1}`} value={r.ingredientId} onChange={e => setLines(ls => ls.map(l => (l.key === r.key ? { ...l, ingredientId: e.target.value } : l)))} className={`${input} flex-1 min-w-[10rem]`}>
                <option value="">เลือกวัตถุดิบ</option>
                {sorted.map(i => (
                  <option key={i.id} value={i.id}>{i.name} (มี {fmt(i.currentStock || 0)} {i.unit})</option>
                ))}
              </select>
              <input aria-label={`จำนวนรายการที่ ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={r.quantity} onChange={e => setLines(ls => ls.map(l => (l.key === r.key ? { ...l, quantity: e.target.value } : l)))} placeholder="จำนวน" className={`${input} w-24`} />
              <span className="w-10 text-xs text-slate-400">{r.ing?.unit || ''}</span>
              <span className={`w-24 text-right text-xs ${r.over ? 'text-amber-300' : 'text-slate-300'}`}>{r.ing && r.qty > 0 ? baht(r.value) : ''}</span>
              <button type="button" aria-label="ลบบรรทัด" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== r.key) : [blankLine()]))} className="w-11 h-11 rounded-xl border border-slate-700 flex items-center justify-center text-rose-300"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLines(ls => [...ls, blankLine()])} className="h-10 px-3 rounded-xl border border-slate-700 text-xs text-slate-300 flex items-center gap-1"><Plus className="w-4 h-4" /> เพิ่มรายการ</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <select aria-label="สาเหตุ" value={reason} onChange={e => setReason(e.target.value as WasteReason)} className={input}>
            {WASTE_REASONS.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <input aria-label="หมายเหตุของเสีย" value={note} onChange={e => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" className={input} />
        </div>
        {validRows.some(r => r.over) && (
          <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-200 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> บางรายการตัดมากกว่าที่มีในสต็อก
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-300">มูลค่ารวม <span className="font-bold text-rose-300">{baht(wasteTotal)}</span></div>
          <button type="button" disabled={!validRows.length} onClick={submitWaste} className="h-12 px-5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold disabled:opacity-40">ยืนยันตัดจ่ายของเสีย</button>
        </div>
      </section>

      {/* This month */}
      <section className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h4 className="font-bold text-sm text-slate-100">ของเสียเดือนนี้</h4>
          <span className="text-sm text-rose-300 font-bold">{baht(monthTotal)} · {monthWaste.length} รายการ</span>
        </div>
        {topWaste.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {topWaste.map(t => (
              <span key={t.name} className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-200">{t.name} {baht(t.value)}</span>
            ))}
          </div>
        )}
        {monthWaste.length === 0 ? (
          <p className="text-xs text-slate-500">เดือนนี้ยังไม่มีของเสีย</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead className="text-slate-500 text-left">
                <tr><th className="py-1 pr-2">วันที่</th><th className="py-1 pr-2">รายการ</th><th className="py-1 pr-2 text-right">จำนวน</th><th className="py-1 pr-2 text-right">มูลค่า</th><th className="py-1 pr-2">สาเหตุ</th><th className="py-1">ผู้บันทึก</th></tr>
              </thead>
              <tbody>
                {monthWaste.slice(0, 50).map(w => (
                  <tr key={w.id} className="border-t border-slate-800">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{w.loggedDate}</td>
                    <td className="py-1.5 pr-2">{w.ingredientName}{w.notes ? <span className="block text-[10px] text-slate-500">{w.notes}</span> : null}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmt(w.quantity)} {w.unit}</td>
                    <td className="py-1.5 pr-2 text-right">{baht(w.totalCostLoss)}</td>
                    <td className="py-1.5 pr-2">{reasonLabel(w.reason)}</td>
                    <td className="py-1.5">{w.reportedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {draft && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" onClick={() => setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="หน่วยตัดจ่าย" onClick={e => e.stopPropagation()} className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-lg my-auto text-slate-100 text-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold">{draft.id ? 'แก้ไขหน่วยตัดจ่าย' : 'หน่วยตัดจ่ายใหม่'}</h3>
              <button type="button" onClick={() => setDraft(null)} aria-label="ปิด" className="w-9 h-9 rounded-lg border border-slate-700 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <input aria-label="ชื่อ" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="ชื่อ เช่น ข้าวสวย" className={`${input} col-span-2`} />
                <input aria-label="หน่วย" value={draft.unitLabel} onChange={e => setDraft({ ...draft, unitLabel: e.target.value })} placeholder="กล่อง" className={input} />
              </div>
              <div className="text-xs text-slate-400">ตัดจากสต็อกต่อ 1 {draft.unitLabel || 'หน่วย'}</div>
              {draft.inputs.map((l, idx) => (
                <div key={idx} className="flex gap-2">
                  <select aria-label={`วัตถุดิบที่ ${idx + 1}`} value={l.ingredientId} onChange={e => setDraftLine(idx, { ingredientId: e.target.value })} className={`${input} flex-1 min-w-0 px-2`}>
                    <option value="">เลือกวัตถุดิบ</option>
                    {sorted.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  <input aria-label={`จำนวนวัตถุดิบที่ ${idx + 1}`} type="number" inputMode="decimal" min="0" step="any" value={l.quantity} onChange={e => setDraftLine(idx, { quantity: e.target.value })} placeholder="จำนวน" className={`${input} w-24 px-2`} />
                  <span className="w-10 self-center text-xs text-slate-400">{byId.get(l.ingredientId)?.unit || ''}</span>
                  <button type="button" aria-label="ลบบรรทัด" onClick={() => setDraft({ ...draft, inputs: draft.inputs.filter((_, i) => i !== idx) })} className="w-11 h-11 rounded-xl border border-slate-700 flex items-center justify-center text-rose-300"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setDraft({ ...draft, inputs: [...draft.inputs, { ingredientId: '', quantity: '' }] })} className="h-10 px-3 rounded-xl border border-slate-700 text-xs flex items-center gap-1"><Plus className="w-4 h-4" /> เพิ่มวัตถุดิบ</button>
              {draftError && <div role="alert" className="text-xs text-rose-300">{draftError}</div>}
            </div>
            <div className="p-4 border-t border-slate-800 flex gap-2">
              <button type="button" onClick={() => setDraft(null)} className="flex-1 h-12 rounded-xl border border-slate-700 font-bold">ยกเลิก</button>
              <button type="button" onClick={saveDraft} className="flex-[2] h-12 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
