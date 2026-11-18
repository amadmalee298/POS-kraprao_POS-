import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExpenseItem } from '../../types';
import { itemsTotal } from '../../utils/expenseItems';

/** A line being typed (numbers kept as text until saved) */
export interface ItemDraft {
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  amount: string;
}

export const emptyItem = (): ItemDraft => ({ name: '', quantity: '', unit: '', unitPrice: '', amount: '' });

/** The drafts as expense lines (empty lines left out; amount = quantity × price when not typed) */
export function draftsToItems(drafts: ItemDraft[]): ExpenseItem[] {
  return drafts
    .map(d => {
      const quantity = Number(d.quantity) || 0;
      const unitPrice = Number(d.unitPrice) || 0;
      const amount = Number(d.amount) || (quantity > 0 && unitPrice > 0 ? Math.round(quantity * unitPrice * 100) / 100 : 0);
      return { name: d.name.trim(), ...(quantity ? { quantity } : {}), ...(d.unit.trim() ? { unit: d.unit.trim() } : {}), ...(unitPrice ? { unitPrice } : {}), amount };
    })
    .filter(i => i.name && i.amount > 0);
}

/**
 * รายละเอียดสินค้า: what was bought, line by line (shown on the ใบรับรองแทนใบเสร็จ). Optional; the
 * total can be taken as the expense's amount.
 */
export const ExpenseItemsEditor: React.FC<{ drafts: ItemDraft[]; onChange: (d: ItemDraft[]) => void; onUseTotal?: (total: number) => void; amount: number }> = ({
  drafts,
  onChange,
  onUseTotal,
  amount
}) => {
  const items = draftsToItems(drafts);
  const total = itemsTotal(items);
  const set = (i: number, change: Partial<ItemDraft>) => onChange(drafts.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const input = 'h-10 px-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs min-w-0';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-slate-400">รายละเอียดสินค้า (ไม่บังคับ · แสดงในใบรับรองแทนใบเสร็จ)</label>
        <button type="button" onClick={() => onChange([...drafts, emptyItem()])} className="h-8 px-2 rounded-lg border border-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> เพิ่มรายการ
        </button>
      </div>
      {drafts.map((d, i) => {
        const auto = !d.amount && Number(d.quantity) > 0 && Number(d.unitPrice) > 0 ? (Number(d.quantity) * Number(d.unitPrice)).toFixed(2) : '';
        return (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-1.5 p-2 rounded-xl bg-slate-900 border border-slate-800">
            <input value={d.name} onChange={e => set(i, { name: e.target.value })} placeholder="ชื่อสินค้า เช่น กุ้งสด" className={input} />
            <button type="button" aria-label="ลบรายการ" onClick={() => onChange(drafts.filter((_, j) => j !== i))} className="h-10 w-10 rounded-lg border border-slate-800 text-rose-300 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="col-span-2 grid grid-cols-4 gap-1.5">
              <input value={d.quantity} onChange={e => set(i, { quantity: e.target.value })} inputMode="decimal" placeholder="จำนวน" className={input} />
              <input value={d.unit} onChange={e => set(i, { unit: e.target.value })} placeholder="หน่วย" className={input} />
              <input value={d.unitPrice} onChange={e => set(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder="ราคา/หน่วย" className={input} />
              <input value={d.amount} onChange={e => set(i, { amount: e.target.value })} inputMode="decimal" placeholder={auto || 'เป็นเงิน'} className={input} />
            </div>
          </div>
        );
      })}
      {items.length > 0 && (
        <div className="flex items-center justify-between text-[11px]">
          <span className={Math.abs(total - amount) < 0.01 ? 'text-emerald-300' : 'text-amber-300'}>
            รวมรายการ ฿{total.toFixed(2)}
            {Math.abs(total - amount) >= 0.01 ? ` (ยอดจ่าย ฿${amount.toFixed(2)} · ส่วนต่างแสดงเป็น "อื่น ๆ")` : ' ตรงกับยอดจ่าย'}
          </span>
          {onUseTotal && Math.abs(total - amount) >= 0.01 && (
            <button type="button" onClick={() => onUseTotal(total)} className="h-8 px-2 rounded-lg bg-slate-800 text-slate-100 font-bold">
              ใช้ยอดรวมนี้
            </button>
          )}
        </div>
      )}
    </div>
  );
};
