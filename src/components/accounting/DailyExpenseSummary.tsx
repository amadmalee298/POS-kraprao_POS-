import React, { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import type { Expense, ExpenseCategory } from '../../types';
import { money } from '../../utils/accounting';
import { dailyExpenseSummary } from '../../utils/dailyExpenses';

/**
 * สรุปค่าใช้จ่ายรายวัน: every day of the month with an expense, the money paid out that day by
 * category (ingredients and equipment included: what was actually paid), and the month's total.
 * A day opens its full detail.
 */
export const DailyExpenseSummary: React.FC<{
  expenses: Expense[];
  month: string;
  labels: Record<ExpenseCategory, string>;
  onOpenDay: (date: string) => void;
}> = ({ expenses, month, labels, onOpenDay }) => {
  const s = useMemo(() => dailyExpenseSummary(expenses), [expenses]);
  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-rose-400" /> สรุปค่าใช้จ่ายรายวัน ({month})
        </h3>
        <span className="font-mono font-bold text-rose-300 text-sm">฿{money(s.total)}</span>
      </div>
      <p className="text-[11px] text-slate-500">เงินที่จ่ายออกจริงแต่ละวัน รวมซื้อวัตถุดิบและอุปกรณ์ · กดวันเพื่อดูรายละเอียด</p>
      {s.days.length === 0 ? (
        <div className="p-3 rounded-xl bg-slate-950 text-center text-xs text-slate-500">ยังไม่มีค่าใช้จ่ายในเดือนนี้</div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left py-2 pr-2 font-semibold">วันที่</th>
                {s.categories.map(c => (
                  <th key={c} className="text-right py-2 px-2 font-semibold whitespace-nowrap">{labels[c] || c}</th>
                ))}
                <th className="text-right py-2 pl-2 font-semibold">รวม</th>
              </tr>
            </thead>
            <tbody>
              {s.days.map(d => (
                <tr key={d.date} className="border-b border-slate-800/60">
                  <td className="py-2 pr-2">
                    <button type="button" onClick={() => onOpenDay(d.date)} className="text-left text-sky-300 underline-offset-2 hover:underline min-h-[36px]">
                      {dayLabel(d.date)}
                      <span className="block text-[10px] text-slate-500">{d.count} รายการ</span>
                    </button>
                  </td>
                  {s.categories.map(c => (
                    <td key={c} className="text-right py-2 px-2 font-mono text-slate-300">{d.byCategory[c] ? money(d.byCategory[c]) : '-'}</td>
                  ))}
                  <td className="text-right py-2 pl-2 font-mono font-bold text-rose-300">{money(d.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="py-2 pr-2 text-slate-200">รวมทั้งเดือน</td>
                {s.categories.map(c => (
                  <td key={c} className="text-right py-2 px-2 font-mono text-slate-200">{money(s.byCategory[c] || 0)}</td>
                ))}
                <td className="text-right py-2 pl-2 font-mono text-rose-300">{money(s.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
