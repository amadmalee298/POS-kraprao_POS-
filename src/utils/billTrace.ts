import type { CashShift, Expense, Ingredient, Order, StockLot } from '../types';
import { claimableInputVat, round2 } from './accounting';
import { ACCOUNT_BY_CODE, buildGlLines, GlLine, thaiDay } from './ledger';
import { computeSaleStockDeductions, orderVatBreakdown } from './orderUtils';

/*
 * "บิลนี้ไปไหนต่อ": what one sale or one expense did in the shop's records: the stock it moved,
 * the double-entry lines it posted and what it adds to the month's ภ.พ.30. Everything is worked
 * out from that one record (the books are not built for the whole history), so it is cheap to show.
 */

export interface TraceStock {
  ingredientId: string;
  name: string;
  unit: string;
  /** Amount moved: negative = used by the sale, positive = received */
  amount: number;
  /** Stock now (after every later sale too) */
  now?: number;
}

export interface TraceEntry {
  account: string;
  name: string;
  debit: number;
  credit: number;
}

export interface BillTrace {
  kind: 'order' | 'expense';
  /** Journal number: the bill's own number, so it never shifts when an older bill is added later */
  journalNo: string;
  date: string;
  stock: TraceStock[];
  entries: TraceEntry[];
  balanced: boolean;
  /** ภ.พ.30 box and amount: output VAT (box 5) for a sale, input VAT (box 7) for a purchase */
  vat: { box: 5 | 7; amount: number; month: string } | null;
  /** Sale: price before VAT less the ingredients' cost */
  grossProfit?: number;
  grossMargin?: number;
}

/** "JE-KAP-015-X7" from "#KAP-015-X7" */
export const journalNumber = (ref: string) => `JE-${String(ref || '').replace(/^#/, '').trim() || 'NA'}`;

function toEntries(lines: GlLine[]): { entries: TraceEntry[]; balanced: boolean } {
  const byAccount = new Map<string, TraceEntry>();
  for (const l of lines) {
    const e = byAccount.get(l.account) || { account: l.account, name: ACCOUNT_BY_CODE.get(l.account)?.name || l.account, debit: 0, credit: 0 };
    e.debit = round2(e.debit + l.debit);
    e.credit = round2(e.credit + l.credit);
    byAccount.set(l.account, e);
  }
  // Debits first, as a journal is written
  const entries = [...byAccount.values()].sort((a, b) => Number(b.debit > 0) - Number(a.debit > 0));
  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { entries, balanced: Math.abs(dr - cr) < 0.01 };
}

const emptyData = { branchId: 'all', orders: [], expenses: [], incomes: [], stockLots: [], wasteLogs: [], stockLogs: [], journals: [] };

export function orderTrace(order: Order, ctx: { ingredients: Ingredient[]; cashShifts?: CashShift[]; vatRegistered: boolean; vatRate?: number }): BillTrace {
  const byId = new Map(ctx.ingredients.map(i => [i.id, i]));
  const stock: TraceStock[] = [...computeSaleStockDeductions(order.items || [], ctx.ingredients).entries()].map(([id, amount]) => {
    const ing = byId.get(id);
    return { ingredientId: id, name: ing?.name || id, unit: ing?.unit || '', amount: -round2(amount * 1000) / 1000, now: ing?.currentStock };
  });
  const lines = buildGlLines({ ...emptyData, orders: [order], cashShifts: ctx.cashShifts || [], ingredients: ctx.ingredients, vatRegistered: ctx.vatRegistered, vatRate: ctx.vatRate });
  const { entries, balanced } = toEntries(lines);
  const revenue = round2(lines.filter(l => l.account === '4000').reduce((s, l) => s + l.credit, 0));
  const cogs = round2(lines.filter(l => l.account === '5000').reduce((s, l) => s + l.debit, 0));
  const { vat } = orderVatBreakdown(order);
  const date = order.createdAt ? thaiDay(order.createdAt) : '';
  return {
    kind: 'order',
    journalNo: journalNumber(order.orderNumber || order.id),
    date,
    stock,
    entries,
    balanced,
    vat: ctx.vatRegistered && vat > 0 ? { box: 5, amount: round2(vat), month: date.slice(0, 7) } : null,
    grossProfit: round2(revenue - cogs),
    grossMargin: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 100) : undefined
  };
}

/** The stock lots an expense received: linked by id, or (older records) by its note, day and title */
export function expenseLots(expense: Expense, lots: StockLot[]): StockLot[] {
  const day = (expense.date || '').slice(0, 10);
  const note = `เพิ่มจากบันทึกค่าใช้จ่าย: ${String(expense.title || '').trim()}`;
  return lots.filter(l => l.expenseId === expense.id || (!l.expenseId && (l.receivedDate || '').slice(0, 10) === day && (l.notes || '').startsWith(note)));
}

export function expenseTrace(expense: Expense, ctx: { ingredients: Ingredient[]; stockLots: StockLot[]; vatRegistered: boolean; vatRate?: number }): BillTrace {
  const byId = new Map(ctx.ingredients.map(i => [i.id, i]));
  const stock: TraceStock[] = expenseLots(expense, ctx.stockLots).map(l => {
    const ing = byId.get(l.ingredientId);
    return { ingredientId: l.ingredientId, name: ing?.name || l.ingredientId, unit: ing?.unit || '', amount: l.quantity, now: ing?.currentStock };
  });
  const lines = buildGlLines({ ...emptyData, expenses: [expense], cashShifts: [], ingredients: ctx.ingredients, vatRegistered: ctx.vatRegistered, vatRate: ctx.vatRate });
  const { entries, balanced } = toEntries(lines);
  const vat = claimableInputVat(expense, ctx.vatRegistered);
  const date = (expense.date || '').slice(0, 10);
  return {
    kind: 'expense',
    journalNo: journalNumber(expense.refNumber || expense.substituteReceipt?.docNo || `EXP-${expense.id.slice(-6)}`),
    date,
    stock,
    entries,
    balanced,
    vat: vat > 0 ? { box: 7, amount: round2(vat), month: date.slice(0, 7) } : null
  };
}
