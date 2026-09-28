import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PackageMinus, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import type { WasteReason } from '../../types';
import { effectiveUnitCost } from '../../utils/recipeUtils';
import { localDay } from '../../utils/stockHistory';
import { menuIssueDeductions } from '../../utils/menuIssue';

/**
 * Taking stock out by hand: boxes of a menu (its whole recipe, as a sale would deduct it) issued
 * for use or thrown away, and waste of any ingredients with a reason, each valued at cost.
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

// Why boxes of food leave the kitchen without a sale
const MENU_PURPOSES = [
  { id: 'staff', label: 'อาหารพนักงาน', waste: undefined },
  { id: 'free', label: 'แจก / รับรอง / ชิม', waste: undefined },
  { id: 'leftover', label: 'ทำเกิน เหลือทิ้ง', waste: 'other' as WasteReason },
  { id: 'spoiled', label: 'เสีย / ลูกค้าคืน', waste: 'overcooked' as WasteReason }
];

const fmt = (n: number, d = 3) => (Number.isFinite(n) ? n.toLocaleString('th-TH', { maximumFractionDigits: d }) : '0');
const baht = (n: number) => `฿${(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface WasteLine {
  key: string;
  ingredientId: string;
  quantity: string;
}
const blankLine = (): WasteLine => ({ key: newId('w'), ingredientId: '', quantity: '' });

interface MenuLine {
  key: string;
  menuItemId: string;
  protein: string;
  boxes: string;
}
const blankMenuLine = (): MenuLine => ({ key: newId('m'), menuItemId: '', protein: '', boxes: '1' });

const CONTAINER_KEY = 'POS_MENU_ISSUE_CONTAINER';
const readContainer = () => {
  try {
    return localStorage.getItem(CONTAINER_KEY) || '';
  } catch {
    return '';
  }
};

export const StockIssuePanel: React.FC = () => {
  const { ingredients, issueStock, wasteLogs, menuItems } = usePOS();
  const [lines, setLines] = useState<WasteLine[]>([blankLine()]);
  const [reason, setReason] = useState<WasteReason>('spoiled');
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  const [menuLines, setMenuLines] = useState<MenuLine[]>([blankMenuLine()]);
  const [purpose, setPurpose] = useState(MENU_PURPOSES[0].id);
  const [containerId, setContainerIdState] = useState(readContainer);
  const [menuNote, setMenuNote] = useState('');

  const byId = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);
  const sorted = useMemo(() => [...ingredients].sort((a, b) => a.name.localeCompare(b.name, 'th')), [ingredients]);
  const menus = useMemo(() => menuItems.filter(m => m.recipe?.length).sort((a, b) => a.name.localeCompare(b.name, 'th')), [menuItems]);
  const menuById = useMemo(() => new Map(menuItems.map(m => [m.id, m])), [menuItems]);

  const setContainerId = (id: string) => {
    setContainerIdState(id);
    try {
      localStorage.setItem(CONTAINER_KEY, id);
    } catch {
      // remembered for this visit only
    }
  };

  // ---- Boxes of a menu ----
  const menuRows = menuLines.map(l => ({ menuItemId: l.menuItemId, protein: l.protein || undefined, boxes: Number(l.boxes) || 0 }));
  const validMenuRows = menuRows.filter(r => menuById.has(r.menuItemId) && r.boxes > 0);
  const totalBoxes = validMenuRows.reduce((s, r) => s + r.boxes, 0);
  const menuUsage = useMemo(
    () =>
      Array.from(menuIssueDeductions(validMenuRows, menuItems, ingredients, containerId || undefined), ([ingredientId, qty]) => {
        const ing = byId.get(ingredientId)!;
        return { ing, qty, value: qty * effectiveUnitCost(ing), short: Math.max(0, qty - (ing.currentStock || 0)) };
      }).filter(r => r.ing),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(validMenuRows), menuItems, ingredients, containerId, byId]
  );
  const menuCost = menuUsage.reduce((s, r) => s + r.value, 0);

  const setMenuLine = (key: string, patch: Partial<MenuLine>) => setMenuLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const submitMenus = () => {
    if (!menuUsage.length) return;
    if (menuUsage.some(r => r.short > 0) && !window.confirm('วัตถุดิบบางรายการในสต็อกไม่พอ ระบบจะตัดได้ไม่เกินที่มี ต้องการทำต่อหรือไม่?')) return;
    const p = MENU_PURPOSES.find(x => x.id === purpose)!;
    const what = validMenuRows
      .map(r => `${menuById.get(r.menuItemId)!.name}${r.protein ? ` (${r.protein})` : ''} ${fmt(r.boxes)} กล่อง`)
      .join(', ');
    const text = [p.label, what, menuNote.trim()].filter(Boolean).join(' · ');
    const { cost } = issueStock(
      menuUsage.map(r => ({ ingredientId: r.ing.id, quantity: r.qty })),
      p.waste ? { waste: p.waste, note: text } : { note: text }
    );
    setMenuLines([blankMenuLine()]);
    setMenuNote('');
    setDone(`ตัดจ่าย${p.waste ? 'ของเสีย' : 'เบิกใช้'} ${fmt(totalBoxes)} กล่อง (${what}) · ต้นทุน ${baht(cost)}`);
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

      {/* Boxes of a menu */}
      <section className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-start gap-2">
          <UtensilsCrossed className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-slate-100">ตัดจ่ายตามเมนู (กล่อง)</h3>
            <p className="text-xs text-slate-400">เลือกเมนูและจำนวนกล่อง ระบบตัดวัตถุดิบทั้งหมดตามสูตรของเมนู (ข้าว เนื้อ ซอส ไข่ ฯลฯ) เหมือนขาย 1 กล่อง แต่ไม่นับเป็นยอดขาย</p>
          </div>
        </div>
        <div className="space-y-2">
          {menuLines.map((l, idx) => {
            const m = menuById.get(l.menuItemId);
            return (
              <div key={l.key} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select aria-label={`เมนูที่ ${idx + 1}`} value={l.menuItemId} onChange={e => setMenuLine(l.key, { menuItemId: e.target.value, protein: '' })} className={`${input} flex-1 min-w-[12rem]`}>
                  <option value="">เลือกเมนู</option>
                  {menus.map(mi => (
                    <option key={mi.id} value={mi.id}>{mi.name}</option>
                  ))}
                </select>
                {m?.availableProteins?.length ? (
                  <select aria-label={`เนื้อสัตว์เมนูที่ ${idx + 1}`} value={l.protein} onChange={e => setMenuLine(l.key, { protein: e.target.value })} className={`${input} w-36`}>
                    <option value="">ตามสูตรหลัก</option>
                    {m.availableProteins.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                ) : null}
                <input aria-label={`จำนวนกล่องเมนูที่ ${idx + 1}`} type="number" inputMode="numeric" min="0" step="1" value={l.boxes} onChange={e => setMenuLine(l.key, { boxes: e.target.value })} className={`${input} w-20`} />
                <span className="text-xs text-slate-400">กล่อง</span>
                <button type="button" aria-label="ลบบรรทัด" onClick={() => setMenuLines(ls => (ls.length > 1 ? ls.filter(x => x.key !== l.key) : [blankMenuLine()]))} className="w-11 h-11 rounded-xl border border-slate-700 flex items-center justify-center text-rose-300"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => setMenuLines(ls => [...ls, blankMenuLine()])} className="h-10 px-3 rounded-xl border border-slate-700 text-xs text-slate-300 flex items-center gap-1"><Plus className="w-4 h-4" /> เพิ่มเมนู</button>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <select aria-label="วัตถุประสงค์" value={purpose} onChange={e => setPurpose(e.target.value)} className={input}>
            {MENU_PURPOSES.map(p => (
              <option key={p.id} value={p.id}>{p.label}{p.waste ? ' (ของเสีย)' : ''}</option>
            ))}
          </select>
          <select aria-label="กล่องบรรจุ" value={containerId} onChange={e => setContainerId(e.target.value)} className={input}>
            <option value="">ไม่ตัดกล่องบรรจุ</option>
            {sorted.map(i => (
              <option key={i.id} value={i.id}>ตัดกล่อง: {i.name}</option>
            ))}
          </select>
          <input aria-label="หมายเหตุตัดจ่ายเมนู" value={menuNote} onChange={e => setMenuNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" className={input} />
        </div>
        {menuUsage.length > 0 && (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-3 py-2 bg-slate-900 text-xs text-slate-400">วัตถุดิบที่จะตัด ({fmt(totalBoxes)} กล่อง)</div>
            <ul className="divide-y divide-slate-800">
              {menuUsage.map(r => (
                <li key={r.ing.id} className="px-3 py-1.5 flex justify-between gap-2 text-xs text-slate-300">
                  <span>{r.ing.name}</span>
                  <span className={r.short > 0 ? 'text-amber-300' : ''}>
                    {fmt(r.qty)} {r.ing.unit} · {baht(r.value)}{r.short > 0 ? ` (ขาด ${fmt(r.short)})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-slate-300">ต้นทุนรวม <span className="font-bold text-orange-300">{baht(menuCost)}</span>{totalBoxes > 0 ? <span className="text-xs text-slate-500"> · {baht(menuCost / totalBoxes)}/กล่อง</span> : null}</div>
          <button type="button" disabled={!menuUsage.length} onClick={submitMenus} className="h-12 px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold disabled:opacity-40">ยืนยันตัดจ่าย</button>
        </div>
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

    </div>
  );
};
