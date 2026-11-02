import { ACCOUNT_BY_CODE, CASH_ACCOUNTS, GlLine } from './ledger';
import { round2 } from './accounting';

/**
 * The finance dashboard (แดชบอร์ดการเงิน): this month's income, expenses and profit, the money in
 * each cash account, the largest income and expense items against last month, and twelve months
 * of income, expenses and profit. Everything comes from the ledger, so it agrees with the
 * statements. Used by the app's page and by the Dashboard sheet sent to Google Sheets.
 */

export interface DashboardItem {
  name: string;
  group: string;
  amount: number;
  /** This month − last month */
  change: number;
}

export interface DashboardMonth {
  month: string; // YYYY-MM
  label: string;
  income: number;
  expense: number;
  profit: number;
  /** Profit from `since` to the end of this month */
  cumulative: number;
}

export interface FinanceDashboardData {
  month: string;
  label: string;
  /** Last day counted (the month's end, or today in the current month) */
  asOf: string;
  cashBalance: number;
  accounts: { code: string; name: string; amount: number; share: number }[];
  income: number;
  expense: number;
  profit: number;
  /** Net profit ÷ income (null without income) */
  margin: number | null;
  cumulativeProfit: number;
  /** The first day profit to date counts from */
  since: string;
  topIncome: DashboardItem[];
  topExpense: DashboardItem[];
  months: DashboardMonth[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
export const thaiMonthLabel = (ym: string, short = false) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('th-TH', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' });

/** Income and expense items of a period: by account, operating expenses by category */
function items(lines: GlLine[], from: string, to: string): { income: Map<string, { group: string; amount: number }>; expense: Map<string, { group: string; amount: number }> } {
  const income = new Map<string, { group: string; amount: number }>();
  const expense = new Map<string, { group: string; amount: number }>();
  for (const l of lines) {
    if (l.date < from || l.date > to) continue;
    const a = ACCOUNT_BY_CODE.get(l.account);
    if (!a) continue;
    if (a.type === 'REVENUE') {
      const key = a.name;
      const cur = income.get(key) || { group: 'รายได้', amount: 0 };
      cur.amount += l.credit - l.debit;
      income.set(key, cur);
    } else if (a.type === 'EXPENSE') {
      const key = l.account === '6000' && l.detail ? l.detail : a.name;
      const group = l.account === '6000' ? 'ค่าใช้จ่ายดำเนินงาน' : l.account.startsWith('5') ? 'ต้นทุน' : 'ค่าใช้จ่ายอื่น';
      const cur = expense.get(key) || { group, amount: 0 };
      cur.amount += l.debit - l.credit;
      expense.set(key, cur);
    }
  }
  return { income, expense };
}

const top = (now: Map<string, { group: string; amount: number }>, before: Map<string, { group: string; amount: number }>, n: number): DashboardItem[] =>
  [...now.entries()]
    .map(([name, v]) => ({ name, group: v.group, amount: round2(v.amount), change: round2(v.amount - (before.get(name)?.amount || 0)) }))
    .filter(x => Math.abs(x.amount) >= 0.005)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);

/**
 * The first day the dashboard counts from: the start of the books when set, otherwise its first
 * month shown. The app's page and the Google Sheets dashboard both load history from here, so
 * every device shows the same figures.
 */
export const dashboardSince = (booksStartDay: string | undefined, month: string, months = 12) => {
  const first = `${addMonths(month, -(months - 1))}-01`;
  return booksStartDay && booksStartDay < first ? booksStartDay : first;
};

export function financeDashboard(lines: GlLine[], month: string, today: string, opts: { months?: number; top?: number; since?: string } = {}): FinanceDashboardData {
  const from = `${month}-01`;
  const end = monthEnd(month);
  const asOf = today < end && today >= from ? today : end;
  const count = opts.months || 12;
  const first = addMonths(month, -(count - 1));
  const since = opts.since || `${first}-01`;
  // One pass: each month's income and expenses, profit up to each month, and the cash accounts
  const byMonth = new Map<string, { income: number; expense: number }>();
  let profitBefore = 0; // before the first month shown
  const cash = new Map<string, number>(CASH_ACCOUNTS.map(c => [c, 0]));
  for (const l of lines) {
    if (l.date > asOf) continue;
    if (cash.has(l.account)) cash.set(l.account, (cash.get(l.account) || 0) + l.debit - l.credit);
    const type = ACCOUNT_BY_CODE.get(l.account)?.type;
    if (type !== 'REVENUE' && type !== 'EXPENSE') continue;
    const ym = l.date.slice(0, 7);
    if (ym < first) {
      if (l.date >= since) profitBefore += l.credit - l.debit;
      continue;
    }
    const m = byMonth.get(ym) || { income: 0, expense: 0 };
    if (type === 'REVENUE') m.income += l.credit - l.debit;
    else m.expense += l.debit - l.credit;
    byMonth.set(ym, m);
  }
  const months: DashboardMonth[] = [];
  let running = profitBefore;
  for (let i = count - 1; i >= 0; i--) {
    const ym = addMonths(month, -i);
    const m = byMonth.get(ym) || { income: 0, expense: 0 };
    running += m.income - m.expense;
    months.push({ month: ym, label: thaiMonthLabel(ym, true), income: round2(m.income), expense: round2(m.expense), profit: round2(m.income - m.expense), cumulative: round2(running) });
  }
  const now = months[months.length - 1];
  const accounts = CASH_ACCOUNTS.map(code => ({ code, name: ACCOUNT_BY_CODE.get(code)!.name, amount: round2(cash.get(code) || 0) }));
  const cashBalance = round2(accounts.reduce((s, a) => s + a.amount, 0));
  const positive = accounts.reduce((s, a) => s + Math.max(0, a.amount), 0);
  const prev = addMonths(month, -1);
  const nowItems = items(lines, from, asOf);
  // Against the same days of last month (1st to the same day; the whole month once this one is over)
  const prevEnd = monthEnd(prev);
  const sameDay = `${prev}-${asOf.slice(8, 10)}`;
  const beforeItems = items(lines, `${prev}-01`, asOf === end || sameDay > prevEnd ? prevEnd : sameDay);
  return {
    month,
    label: thaiMonthLabel(month),
    asOf,
    cashBalance,
    accounts: accounts.map(a => ({ ...a, share: positive > 0 ? round2((Math.max(0, a.amount) / positive) * 100) : 0 })),
    income: now.income,
    expense: now.expense,
    profit: now.profit,
    margin: now.income > 0 ? round2((now.profit / now.income) * 100) : null,
    cumulativeProfit: now.cumulative,
    since,
    topIncome: top(nowItems.income, beforeItems.income, opts.top || 20),
    topExpense: top(nowItems.expense, beforeItems.expense, opts.top || 20),
    months
  };
}
