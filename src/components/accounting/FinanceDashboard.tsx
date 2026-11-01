import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GlLine } from '../../utils/ledger';
import { DashboardItem, financeDashboard } from '../../utils/financeDashboard';

/**
 * แดชบอร์ดการเงิน: this month at a glance (money left, income, expenses, profit, margin, profit to
 * date), the money in each account, the largest income and expense items against last month, and
 * twelve months of income, expenses and profit. Figures come from the ledger (same as the statements).
 */

// Validated for the dark surface (blue/orange, yellow/violet: colour-blind safe)
const C = { income: '#3987e5', expense: '#d95926', profit: '#c98500', cumulative: '#9085e9' };
const money = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k` : String(Math.round(v)));
const tooltipStyle = { backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 12, fontSize: 12, color: '#e2e8f0' };

const Tile: React.FC<{ label: string; value: string; dot: string; note?: string }> = ({ label, value, dot, note }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 min-w-0">
    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} aria-hidden />
      <span className="truncate">{label}</span>
    </div>
    <div className="mt-1 text-lg font-bold text-slate-100 tabular-nums truncate">{value}</div>
    {note && <div className="text-[10px] text-slate-500">{note}</div>}
  </div>
);

const Change: React.FC<{ v: number; goodWhenUp: boolean }> = ({ v, goodWhenUp }) => {
  if (Math.abs(v) < 0.005) return <span className="text-slate-500">–</span>;
  const up = v > 0;
  const good = up === goodWhenUp;
  return (
    <span className={good ? 'text-emerald-300' : 'text-rose-300'}>
      {up ? '▲' : '▼'} {money(Math.abs(v))}
    </span>
  );
};

const TopTable: React.FC<{ title: string; items: DashboardItem[]; goodWhenUp: boolean; head: string }> = ({ title, items, goodWhenUp, head }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden min-w-0">
    <div className={`px-3 py-2 text-sm font-bold text-center ${head}`}>{title}</div>
    {items.length ? (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="px-3 py-1.5 font-normal">รายการ</th>
              <th className="px-2 py-1.5 font-normal">หมวด</th>
              <th className="px-2 py-1.5 font-normal text-right">จำนวนเงิน</th>
              <th className="px-3 py-1.5 font-normal text-right whitespace-nowrap">เทียบเดือนก่อน</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.name} className="border-t border-slate-800/70">
                <td className="px-3 py-1.5 text-slate-200">{it.name}</td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{it.group}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-100">{money(it.amount)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                  <Change v={it.change} goodWhenUp={goodWhenUp} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="px-3 py-4 text-xs text-slate-500">ยังไม่มีรายการในเดือนนี้</p>
    )}
  </div>
);

export const FinanceDashboard: React.FC<{ lines: GlLine[]; today: string; month: string; onMonth: (m: string) => void }> = ({ lines, today, month, onMonth }) => {
  const d = useMemo(() => financeDashboard(lines, month, today), [lines, month, today]);
  const [table, setTable] = useState(false);
  const pct = (n: number | null) => (n === null ? '–' : `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}%`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1">
          <span className="block text-slate-400">เดือน</span>
          <input type="month" value={month} max={today.slice(0, 7)} onChange={e => e.target.value && onMonth(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
        </label>
        <span className="text-slate-500 pb-2">ข้อมูลถึง {new Date(`${d.asOf}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
        <Tile label="ยอดเงินคงเหลือ" value={money(d.cashBalance)} dot="#94a3b8" note="เงินสด + ธนาคาร" />
        <Tile label="รายรับเดือนนี้" value={money(d.income)} dot={C.income} />
        <Tile label="รายจ่ายเดือนนี้" value={money(d.expense)} dot={C.expense} />
        <Tile label="กำไรสุทธิเดือนนี้" value={money(d.profit)} dot={C.profit} />
        <Tile label="อัตรากำไรสุทธิ" value={pct(d.margin)} dot="#94a3b8" />
        <Tile label="กำไรสะสม" value={money(d.cumulativeProfit)} dot={C.cumulative} note="ตั้งแต่เริ่มบัญชี" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden min-w-0">
          <div className="px-3 py-2 text-sm font-bold text-center bg-sky-500/15 text-sky-200">ยอดเงินคงเหลือแต่ละบัญชี</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="px-3 py-1.5 font-normal">บัญชี</th>
                <th className="px-2 py-1.5 font-normal text-right">ยอดคงเหลือ</th>
                <th className="px-3 py-1.5 font-normal">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {d.accounts.map(a => (
                <tr key={a.code} className="border-t border-slate-800/70">
                  <td className="px-3 py-1.5 text-slate-200">{a.name}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${a.amount < 0 ? 'text-rose-300' : 'text-slate-100'}`}>{money(a.amount)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden min-w-[40px]">
                        <div className="h-full rounded-full" style={{ width: `${a.share}%`, background: C.income }} />
                      </div>
                      <span className="text-slate-400 tabular-nums w-11 text-right">{a.share.toLocaleString('th-TH', { maximumFractionDigits: 1 })}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.accounts.some(a => a.amount < 0) && <p className="px-3 py-2 text-[10px] text-amber-300">ยอดติดลบ: มีรายจ่ายจากบัญชีนี้มากกว่าเงินที่บันทึกเข้า (ตั้งยอดยกมาในสมุดรายวันได้)</p>}
        </div>
        <TopTable title="Top 20 รายรับ" items={d.topIncome} goodWhenUp head="bg-emerald-500/15 text-emerald-200" />
        <TopTable title="Top 20 รายจ่าย" items={d.topExpense} goodWhenUp={false} head="bg-rose-500/15 text-rose-200" />
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => setTable(t => !t)} className="h-8 px-3 rounded-xl border border-slate-700 text-xs text-slate-300">
          {table ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'}
        </button>
      </div>
      {table ? (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                {['เดือน', 'รายรับ', 'รายจ่าย', 'กำไร', 'กำไรสะสม'].map((h, i) => (
                  <th key={h} className={`px-3 py-1.5 font-normal ${i ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.months.map(m => (
                <tr key={m.month} className="border-t border-slate-800/70 tabular-nums">
                  <td className="px-3 py-1.5 text-slate-200">{m.label}</td>
                  <td className="px-3 py-1.5 text-right text-slate-100">{money(m.income)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-100">{money(m.expense)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-100">{money(m.profit)}</td>
                  <td className="px-3 py-1.5 text-right text-slate-100">{money(m.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 min-w-0">
            <div className="text-sm font-bold text-slate-200 mb-2">รายรับ – รายจ่าย รายเดือน</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.months} barGap={2} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={44} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={short} width={44} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b80' }} formatter={(v: any, n: any) => [`฿${money(Number(v))}`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: any) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
                  <Bar dataKey="income" name="รายรับ" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  <Bar dataKey="expense" name="รายจ่าย" fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 min-w-0">
            <div className="text-sm font-bold text-slate-200 mb-2">กำไร และกำไรสะสม</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={d.months} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={44} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={short} width={44} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b80' }} formatter={(v: any, n: any) => [`฿${money(Number(v))}`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: any) => <span style={{ color: '#cbd5e1' }}>{v}</span>} />
                  <Bar dataKey="profit" name="กำไร" fill={C.profit} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  <Line dataKey="cumulative" name="กำไรสะสม" stroke={C.cumulative} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#0f172a' }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
