import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import type { Expense, Order } from '../../types';
import { isVatRegistered } from '../../utils/accounting';
import { expenseTrace, orderTrace } from '../../utils/billTrace';

const money = (n: number) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 3 });
const monthName = (ym: string) => (ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' }) : '');

const Step: React.FC<{ icon: string; tone: string; title: string; right?: React.ReactNode; last?: boolean; children?: React.ReactNode }> = ({ icon, tone, title, right, last, children }) => (
  <div className="relative pl-9">
    {!last && <span className="absolute left-[13px] top-8 bottom-[-10px] w-0.5 bg-slate-700" />}
    <span className={`absolute left-0 top-2 w-7 h-7 rounded-full ${tone} flex items-center justify-center text-sm`}>{icon}</span>
    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 mb-2.5">
      <div className="flex items-center justify-between gap-2 text-sm font-bold text-slate-100">
        <span>{title}</span>
        {right && <span className="text-[10px] font-normal text-emerald-300 text-right">{right}</span>}
      </div>
      {children && <div className="mt-1.5 text-[11px] text-slate-400 space-y-0.5">{children}</div>}
    </div>
  </div>
);

/**
 * บิลนี้ไปไหนต่อ: one sale or expense and what it did: the stock it moved, the journal it posted
 * (numbered after the bill) and what it adds to the month's ภ.พ.30.
 */
export const BillTraceModal: React.FC<{ order?: Order; expense?: Expense; onClose: () => void }> = ({ order, expense, onClose }) => {
  const { ingredients, cashShifts, stockLots, settings } = usePOS();
  const vatRegistered = isVatRegistered(settings);
  const vatRate = Number(settings.vatRate) || 7;
  const t = useMemo(
    () =>
      order
        ? orderTrace(order, { ingredients, cashShifts: cashShifts || [], vatRegistered, vatRate })
        : expense
          ? expenseTrace(expense, { ingredients, stockLots: stockLots || [], vatRegistered, vatRate })
          : null,
    [order, expense, ingredients, cashShifts, stockLots, vatRegistered, vatRate]
  );
  if (!t) return null;
  const isSale = t.kind === 'order';
  const amount = order ? order.grandTotal : expense?.amount || 0;
  const title = order ? `#${String(order.orderNumber || order.id).replace(/^#/, '')}` : expense?.title || 'ค่าใช้จ่าย';
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-label="บิลนี้ไปไหนต่อ">
      <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500">บิลนี้ไปไหนต่อ</div>
            <div className="font-black text-slate-100 truncate">{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="p-1.5 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/60 rounded-xl px-3 py-2">
          <span>
            {order ? (order.items || []).map(i => `${i.menuItem?.name || ''} ×${i.quantity}`).join(' · ') : expense?.substituteReceipt?.payee || expense?.title}
            <span className="block text-[10px] text-slate-500">{t.date}</span>
          </span>
          <b className="text-base text-slate-100 shrink-0">฿{money(amount)}</b>
        </div>

        <Step icon={isSale ? '🧾' : '🛒'} tone={isSale ? 'bg-rose-800' : 'bg-rose-800'} title={isSale ? 'ขาย' : 'ค่าใช้จ่าย'} right="✓ บันทึกแล้ว">
          <div>{isSale ? `ใบเสร็จ ${title}` : `${expense?.substituteReceipt?.docNo ? `ใบรับรอง ${expense.substituteReceipt.docNo}` : expense?.refNumber ? `เลขที่ ${expense.refNumber}` : 'ไม่มีเลขที่เอกสาร'}`}</div>
        </Step>

        <Step icon="📦" tone="bg-emerald-800" title={isSale ? 'ตัดสต็อกตามสูตร' : 'รับเข้าสต็อก'} right={t.stock.length ? `✓ ${t.stock.length} รายการ` : undefined}>
          {t.stock.length === 0 && <div>{isSale ? 'เมนูในบิลนี้ไม่มีสูตร จึงไม่ได้ตัดสต็อก' : 'ไม่ได้รับของเข้าสต็อก'}</div>}
          {t.stock.map(s => (
            <div key={s.ingredientId} className="flex justify-between gap-2">
              <span className="text-slate-300">{s.name}</span>
              <span className="font-mono">
                <span className={s.amount < 0 ? 'text-rose-300' : 'text-emerald-300'}>
                  {s.amount > 0 ? '+' : ''}
                  {qty(s.amount)} {s.unit}
                </span>
                {typeof s.now === 'number' && <span className="text-slate-500"> · คงเหลือตอนนี้ {qty(s.now)}</span>}
              </span>
            </div>
          ))}
        </Step>

        <Step icon="📒" tone="bg-blue-800" title="ลงบัญชีให้เอง" right={`${t.journalNo} ${t.balanced ? '✓ สมดุล' : '⚠️ ไม่สมดุล'}`}>
          <div className="font-mono text-[11px] bg-slate-950 rounded-lg p-2 space-y-0.5">
            {t.entries.map(e => (
              <div key={e.account} className={`flex justify-between gap-2 ${e.debit > 0 ? '' : 'pl-4'}`}>
                <span>
                  <span className={e.debit > 0 ? 'text-sky-300' : 'text-rose-300'}>{e.debit > 0 ? 'Dr' : 'Cr'}</span> {e.account} {e.name}
                </span>
                <span className="text-slate-200">{money(e.debit || e.credit)}</span>
              </div>
            ))}
            {t.entries.length === 0 && <div>ไม่มีรายการบัญชี (บิลนี้ไม่นับเป็นรายได้/ค่าใช้จ่าย)</div>}
          </div>
        </Step>

        <Step icon="🏛" tone="bg-amber-800" title={`ภาษี ภ.พ.30 ${monthName(t.vat?.month || t.date.slice(0, 7))}`} last>
          {t.vat ? (
            <div>
              ช่อง {t.vat.box} {t.vat.box === 5 ? 'ภาษีขาย' : 'ภาษีซื้อ'} <b className="text-amber-300">+฿{money(t.vat.amount)}</b>
            </div>
          ) : (
            <div>{vatRegistered ? (isSale ? 'บิลนี้ไม่มี VAT' : 'ไม่มีใบกำกับภาษีเต็มรูป จึงไม่ได้นับเป็นภาษีซื้อ') : 'ร้านยังไม่ได้จด VAT'}</div>
          )}
          {isSale && typeof t.grossProfit === 'number' && (
            <div>
              กำไรขั้นต้นบิลนี้ ฿{money(t.grossProfit)}
              {typeof t.grossMargin === 'number' && ` (${t.grossMargin}%)`}
            </div>
          )}
        </Step>
      </div>
    </div>
  );
};
