import type { Expense, Order } from '../types';
import type { WhtCertificate } from './staffDocs';
import { claimableInputVat, round2 } from './accounting';
import { countsAsRevenue, orderVatBreakdown } from './orderUtils';

/**
 * The monthly VAT report (ภ.พ.30), in three groups:
 *  1. ภาษีขาย: VAT on the month's sales (and the withholding tax customers deducted from the shop)
 *  2. ภาษีซื้อ: input VAT on purchases with a full tax invoice (and the withholding tax the shop
 *     deducted from suppliers, remitted with ภ.ง.ด.3/53)
 *  3. ภ.พ.36: VAT the shop pays itself on services from abroad (online ads, apps…). It is remitted
 *     separately by the 7th of the next month and, once paid, claimed as input VAT in that month's
 *     ภ.พ.30: so a month's ภ.พ.30 deducts the ภ.พ.36 of the month before.
 * ภ.พ.30 = output VAT − input VAT − last month's ภ.พ.36; a negative result is overpaid (carried to
 * the next month or refunded).
 */

export interface VatLine {
  id: string;
  date: string; // YYYY-MM-DD
  doc: string;
  party: string;
  base: number;
  vat: number;
}

export interface VatReport {
  month: string; // YYYY-MM
  rate: number;
  sales: { base: number; vat: number; count: number; whtDeducted: number; days: VatLine[] };
  purchases: { base: number; vat: number; count: number; whtToRemit: number; lines: VatLine[] };
  pp36: { base: number; vat: number; count: number; lines: VatLine[] };
  /** ภ.พ.36 paid for last month's foreign services, claimed this month */
  pp36PrevMonth: number;
  /** What ภ.พ.30 comes to: positive = to pay, negative = overpaid */
  payable: number;
}

/** WHT certificate forms for tax the shop withheld from suppliers (not staff salaries) */
const SUPPLIER_WHT_FORMS = new Set(['pnd3', 'pnd53', 'pnd2', 'pnd3a', 'pnd2a']);

export const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const bangkokDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const ownBranch = (branchId: string | 'all', b?: string) => branchId === 'all' || !b || b === branchId;

/** VAT the shop owes itself on a foreign service (the amount paid is the price before VAT) */
export const pp36Vat = (e: Pick<Expense, 'amount'>, rate: number) => round2((e.amount || 0) * (rate / 100));

const pp36Lines = (expenses: Expense[], month: string, branchId: string | 'all', rate: number): VatLine[] =>
  expenses
    .filter(e => e.vat36 && ownBranch(branchId, e.branchId) && (e.date || '').startsWith(month))
    .map(e => ({ id: e.id, date: e.date.slice(0, 10), doc: e.refNumber || '', party: e.substituteReceipt?.payee || e.title, base: round2(e.amount || 0), vat: pp36Vat(e, rate) }));

export function buildVatReport(
  data: { orders: Order[]; expenses: Expense[]; certificates?: WhtCertificate[] },
  month: string,
  branchId: string | 'all',
  rate = 7
): VatReport {
  // 1. Sales, one line a day (bills of a day share one summary in the sales tax report)
  const byDay = new Map<string, VatLine>();
  let whtDeducted = 0;
  let count = 0;
  data.orders.forEach(o => {
    if (!ownBranch(branchId, o.branchId) || !countsAsRevenue(o) || !o.createdAt) return;
    const day = bangkokDay(o.createdAt);
    if (!day.startsWith(month)) return;
    const { base, vat } = orderVatBreakdown(o);
    const line = byDay.get(day) || { id: day, date: day, doc: '', party: '', base: 0, vat: 0 };
    line.base += base;
    line.vat += vat;
    line.party = String(Number(line.party || 0) + 1); // bills that day
    byDay.set(day, line);
    whtDeducted += o.withholdingTax || 0;
    count++;
  });
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(l => ({ ...l, base: round2(l.base), vat: round2(l.vat), party: `${l.party} บิล` }));

  // 2. Purchases with a full tax invoice
  const lines: VatLine[] = data.expenses
    .filter(e => ownBranch(branchId, e.branchId) && (e.date || '').startsWith(month) && !e.vat36 && claimableInputVat(e, true) > 0)
    .map(e => {
      const vat = claimableInputVat(e, true);
      return {
        id: e.id,
        date: e.date.slice(0, 10),
        doc: e.refNumber || '',
        party: e.substituteReceipt?.payee || e.title,
        base: round2(typeof e.netAmount === 'number' && e.netAmount > 0 ? e.netAmount : (e.amount || 0) - vat),
        vat: round2(vat)
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const whtToRemit = (data.certificates || [])
    .filter(c => SUPPLIER_WHT_FORMS.has(c.form) && (c.issueDate || '').startsWith(month))
    .reduce((s, c) => s + c.lines.reduce((t, l) => t + (Number(l.tax) || 0), 0), 0);

  // 3. ภ.พ.36 this month, and last month's (claimed now)
  const pp36 = pp36Lines(data.expenses, month, branchId, rate);
  const pp36PrevMonth = round2(pp36Lines(data.expenses, prevMonthOf(month), branchId, rate).reduce((s, l) => s + l.vat, 0));

  const sum = (ls: VatLine[], k: 'base' | 'vat') => round2(ls.reduce((s, l) => s + l[k], 0));
  const outputVat = sum(days, 'vat');
  const inputVat = sum(lines, 'vat');
  return {
    month,
    rate,
    sales: { base: sum(days, 'base'), vat: outputVat, count, whtDeducted: round2(whtDeducted), days },
    purchases: { base: sum(lines, 'base'), vat: inputVat, count: lines.length, whtToRemit: round2(whtToRemit), lines },
    pp36: { base: sum(pp36, 'base'), vat: sum(pp36, 'vat'), count: pp36.length, lines: pp36 },
    pp36PrevMonth,
    payable: round2(outputVat - inputVat - pp36PrevMonth)
  };
}

/** The filing deadlines of a month's report (paper / online) */
export function vatDeadlines(month: string): { pp30: string; pp30Online: string; pp36: string; pp36Online: string } {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { pp30: `${next}-15`, pp30Online: `${next}-23`, pp36: `${next}-07`, pp36Online: `${next}-15` };
}
