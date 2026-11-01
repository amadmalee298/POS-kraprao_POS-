import { describe, expect, it } from 'vitest';
import { balanceSheet, GlLine, profitAndLoss } from '../ledger';
import { financeDashboard } from '../financeDashboard';

const line = (date: string, account: string, debit: number, credit: number, detail?: string): GlLine => ({ date, source: 'journal' as any, sourceId: date + account, reference: '', account, debit, credit, detail });
// Each entry balanced: a sale into the bank, an expense paid in cash
const sale = (date: string, amount: number) => [line(date, '1010', amount, 0), line(date, '4000', 0, amount)];
const spend = (date: string, amount: number, category: string) => [line(date, '6000', amount, 0, category), line(date, '1001', 0, amount)];

describe('finance dashboard', () => {
  const lines = [
    ...sale('2026-09-10', 1000),
    ...spend('2026-09-12', 300, 'ค่าไฟ'),
    ...sale('2026-10-03', 2000),
    ...spend('2026-10-05', 500, 'ค่าไฟ'),
    ...spend('2026-10-06', 200, 'ค่าแก๊ส'),
    ...sale('2026-11-20', 999) // after the month
  ];
  const d = financeDashboard(lines, '2026-10', '2026-11-01', { months: 3 });

  it('agrees with the statements for the month', () => {
    const p = profitAndLoss(lines, '2026-10-01', '2026-10-31');
    expect(d.income).toBe(p.revenue);
    expect(d.profit).toBe(p.netProfit);
    expect(d.expense).toBe(700);
    expect(d.margin).toBe(65);
    expect(d.cumulativeProfit).toBe(balanceSheet(lines, '2026-10-31').earningsToDate);
    expect(d.cumulativeProfit).toBe(2000);
  });

  it('shows each cash account and its share', () => {
    expect(d.cashBalance).toBe(2000);
    expect(d.accounts.find(a => a.code === '1010')).toMatchObject({ amount: 3000, share: 100 });
    expect(d.accounts.find(a => a.code === '1001')).toMatchObject({ amount: -1000, share: 0 });
  });

  it('lists the largest items against last month, and the months for the charts', () => {
    expect(d.topExpense).toEqual([
      { name: 'ค่าไฟ', group: 'ค่าใช้จ่ายดำเนินงาน', amount: 500, change: 200 },
      { name: 'ค่าแก๊ส', group: 'ค่าใช้จ่ายดำเนินงาน', amount: 200, change: 200 }
    ]);
    expect(d.topIncome[0]).toMatchObject({ amount: 2000, change: 1000 });
    expect(d.months.map(m => [m.month, m.income, m.expense, m.profit, m.cumulative])).toEqual([
      ['2026-08', 0, 0, 0, 0],
      ['2026-09', 1000, 300, 700, 700],
      ['2026-10', 2000, 700, 1300, 2000]
    ]);
  });
});
