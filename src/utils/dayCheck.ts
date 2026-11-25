import type { AddOnOption, CashShift, Expense, Ingredient, MenuItem, Order, PendingReceipt } from '../types';
import { round2 } from './accounting';
import { buildGlLines, thaiDay } from './ledger';
import { computeSaleStockDeductions } from './orderUtils';
import { countsAsRevenue } from './revenue';
import { auditRecipes } from './recipeUtils';
import { isLowStock } from './stockTypes';
import type { PayIn } from './payIn';

/*
 * The finance home: what the system did today by itself (sales, stock, books), the few things only
 * a person can decide, and the day's close (checks, then a summary for the owner's Telegram).
 * Only today's records are worked through, so it stays light on a phone.
 */

export interface DayInput {
  day: string; // YYYY-MM-DD (Thai time)
  branchId: string;
  orders: Order[];
  expenses: Expense[];
  ingredients: Ingredient[];
  menuItems: MenuItem[];
  addOns: AddOnOption[];
  cashShifts: CashShift[];
  inbox: PendingReceipt[];
  vatRegistered: boolean;
  vatRate?: number;
}

export interface DayOverview {
  sales: { count: number; total: number; cash: number; transfer: number };
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  /** Operating expenses posted today (purchases of stock are not expenses until used) */
  expenses: number;
  expensesPaid: number;
  profit: number;
  stockUsed: number;
  lowStock: Ingredient[];
  entries: number;
  balanced: boolean;
}

export type TodoKind = 'telegram' | 'evidence' | 'signature' | 'recipe' | 'drawer' | 'payin';

export interface DayTodo {
  kind: TodoKind;
  level: 'warn' | 'bad';
  title: string;
  detail: string;
  count: number;
}

const ownBranch = (branchId: string, b?: string) => !b || branchId === 'all' || b === branchId;
const QR_METHODS = new Set(['promptpay', 'transfer']);

export function todaysOrders(d: Pick<DayInput, 'day' | 'branchId' | 'orders'>): Order[] {
  return d.orders.filter(o => ownBranch(d.branchId, o.branchId) && o.createdAt && countsAsRevenue(o) && thaiDay(o.createdAt) === d.day);
}

export function dayOverview(d: DayInput): DayOverview {
  const orders = todaysOrders(d);
  const expenses = d.expenses.filter(e => ownBranch(d.branchId, e.branchId) && (e.date || '').slice(0, 10) === d.day);
  const lines = buildGlLines({
    branchId: d.branchId,
    orders,
    expenses,
    incomes: [],
    stockLots: [],
    wasteLogs: [],
    stockLogs: [],
    cashShifts: d.cashShifts,
    journals: [],
    ingredients: d.ingredients,
    vatRegistered: d.vatRegistered,
    vatRate: d.vatRate
  });
  const sum = (pred: (a: string) => boolean, side: 'debit' | 'credit') => round2(lines.filter(l => pred(l.account)).reduce((s, l) => s + l[side], 0));
  const revenue = sum(a => a === '4000', 'credit');
  const cogs = sum(a => a === '5000', 'debit');
  const opex = sum(a => a.startsWith('6') || (a.startsWith('5') && a !== '5000'), 'debit');
  const used = new Set<string>();
  orders.forEach(o => computeSaleStockDeductions(o.items || [], d.ingredients).forEach((_v, id) => used.add(id)));
  const total = round2(orders.reduce((s, o) => s + (o.grandTotal || 0), 0));
  const cash = round2(orders.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + (o.grandTotal || 0), 0));
  return {
    sales: { count: orders.length, total, cash, transfer: round2(total - cash) },
    revenue,
    cogs,
    grossProfit: round2(revenue - cogs),
    grossMargin: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 100) : null,
    expenses: opex,
    expensesPaid: round2(expenses.reduce((s, e) => s + (e.amount || 0), 0)),
    profit: round2(revenue - cogs - opex),
    stockUsed: used.size,
    lowStock: d.ingredients.filter(i => isLowStock(i)),
    entries: new Set(lines.map(l => `${l.source}:${l.sourceId}`)).size,
    balanced: Math.abs(lines.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.01
  };
}

const daysBefore = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** What only a person can settle; everything else the system has done. Empty = the books are in order */
export function dayTodos(d: DayInput): DayTodo[] {
  const todos: DayTodo[] = [];
  const pending = d.inbox.filter(r => r.status === 'pending' || r.status === 'failed');
  if (pending.length) {
    todos.push({
      kind: 'telegram',
      level: 'warn',
      title: 'บิลจาก Telegram รออนุมัติ',
      detail: pending.slice(0, 3).map(r => (r.data?.amount ? `฿${r.data.amount.toLocaleString('th-TH')}` : r.status === 'failed' ? 'อ่านไม่ได้' : 'รออ่าน')).join(', '),
      count: pending.length
    });
  }
  // The last week's expenses with nothing to show for them
  const week = daysBefore(d.day, 6);
  const recent = d.expenses.filter(e => ownBranch(d.branchId, e.branchId) && (e.date || '').slice(0, 10) >= week && (e.date || '').slice(0, 10) <= d.day);
  const noEvidence = recent.filter(e => !e.receiptImage && !(e.purchaseImages && e.purchaseImages.length) && !e.refNumber && (e.amount || 0) > 0);
  if (noEvidence.length) {
    todos.push({ kind: 'evidence', level: 'warn', title: 'ค่าใช้จ่ายไม่มีหลักฐาน (7 วัน)', detail: noEvidence.slice(0, 3).map(e => `"${e.title}" ฿${(e.amount || 0).toLocaleString('th-TH')}`).join(', '), count: noEvidence.length });
  }
  const unsigned = recent.filter(e => e.substituteReceipt && !e.substituteReceipt.spenderSignature);
  if (unsigned.length) {
    todos.push({ kind: 'signature', level: 'warn', title: 'ใบรับรองแทนใบเสร็จยังไม่เซ็น', detail: unsigned.slice(0, 3).map(e => e.substituteReceipt?.docNo || e.title).join(', '), count: unsigned.length });
  }
  const noRecipe = auditRecipes(d.menuItems, d.addOns, d.ingredients).filter(i => i.kind === 'no-recipe' || i.kind === 'missing-ingredient');
  if (noRecipe.length) {
    todos.push({ kind: 'recipe', level: 'bad', title: 'เมนูขายแล้วไม่ตัดสต็อก (สูตรไม่ครบ)', detail: noRecipe.slice(0, 3).map(i => i.message.split(':')[0]).join(', '), count: noRecipe.length });
  }
  const leftOpen = d.cashShifts.filter(s => ownBranch(d.branchId, s.branchId) && s.status === 'open' && s.openedAt && thaiDay(s.openedAt) < d.day);
  if (leftOpen.length) {
    todos.push({ kind: 'drawer', level: 'bad', title: 'ลิ้นชักวันก่อนยังไม่ปิด', detail: leftOpen.map(s => `${s.shiftNumber} (${thaiDay(s.openedAt)})`).join(', '), count: leftOpen.length });
  }
  return todos;
}

export interface CloseCheck {
  label: string;
  ok: boolean | null;
  detail: string;
}

/** The checks shown before the day is closed (payIns: the bank's "money in" notices, when the shop forwards them) */
export function closeDayChecks(d: DayInput, o: DayOverview, payIns: PayIn[] | null): CloseCheck[] {
  const checks: CloseCheck[] = [];
  const shifts = d.cashShifts.filter(s => ownBranch(d.branchId, s.branchId) && s.openedAt && thaiDay(s.openedAt) === d.day);
  const open = shifts.find(s => s.status === 'open');
  const closed = shifts.filter(s => s.status === 'closed');
  if (open) checks.push({ label: 'เงินสดในลิ้นชัก', ok: false, detail: 'ลิ้นชักยังเปิดอยู่: ปิดกะและนับเงินก่อน' });
  else if (closed.length) {
    const diff = round2(closed.reduce((s, x) => s + (x.cashDifference || 0), 0));
    const counted = round2(closed.reduce((s, x) => s + (x.actualCashBalance || 0), 0));
    checks.push({ label: 'เงินสดในลิ้นชัก', ok: Math.abs(diff) < 1, detail: Math.abs(diff) < 1 ? `฿${counted.toLocaleString('th-TH')} ตรง` : `${diff > 0 ? 'เกิน' : 'ขาด'} ฿${Math.abs(diff).toLocaleString('th-TH')}` });
  } else checks.push({ label: 'เงินสดในลิ้นชัก', ok: null, detail: o.sales.cash > 0 ? `ไม่ได้เปิดกะ · ขายเงินสด ฿${o.sales.cash.toLocaleString('th-TH')}` : 'ไม่ได้ใช้ลิ้นชัก' });

  const qr = todaysOrders(d).filter(x => QR_METHODS.has(x.paymentMethod));
  if (payIns) {
    const numbers = new Set(qr.map(x => x.orderNumber));
    const matched = payIns.filter(n => n.claimedBy && numbers.has(n.claimedBy)).length;
    const loose = payIns.filter(n => n.verified && thaiDay(n.at) === d.day && (!n.claimedBy || n.claimedBy.startsWith('hold:'))).length;
    const ok = matched === qr.length && loose === 0;
    checks.push({
      label: 'ยอดโอน/QR เทียบเงินเข้า',
      ok: qr.length === 0 && loose === 0 ? true : ok,
      detail: `${matched}/${qr.length} บิลมีเงินเข้า${loose ? ` · เงินเข้า ${loose} รายการยังไม่ผูกบิล` : ''}`
    });
  } else {
    checks.push({ label: 'ยอดโอน/QR เทียบเงินเข้า', ok: null, detail: qr.length ? `${qr.length} บิล (ยังไม่ได้ตั้งแจ้งเงินเข้า Merchant Pro)` : 'ไม่มีบิลโอนวันนี้' });
  }
  checks.push({ label: 'บัญชีสมดุล (เดบิต = เครดิต)', ok: o.balanced, detail: `${o.entries} รายการ` });
  checks.push({ label: 'วัตถุดิบใกล้หมด', ok: o.lowStock.length ? null : true, detail: o.lowStock.length ? o.lowStock.slice(0, 4).map(i => i.name).join(', ') : 'ไม่มี' });
  const todayExp = d.expenses.filter(e => ownBranch(d.branchId, e.branchId) && (e.date || '').slice(0, 10) === d.day);
  const bare = todayExp.filter(e => !e.receiptImage && !(e.purchaseImages && e.purchaseImages.length) && !e.refNumber);
  checks.push({ label: 'ค่าใช้จ่ายมีหลักฐานครบ', ok: bare.length === 0, detail: bare.length ? `${bare.length} ใบไม่มีรูป` : `${todayExp.length} ใบ` });
  return checks;
}

const baht = (n: number) => `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const thaiDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The day's close for the owner's Telegram (HTML) */
export function closeDayMessage(day: string, o: DayOverview, checks: CloseCheck[], todos: DayTodo[], by: string, shop?: string): string {
  const failed = checks.filter(c => c.ok === false);
  const lines = [
    `✅ <b>ปิดวัน ${thaiDate(day)}</b>${shop ? ` · ${shop}` : ''}`,
    `ขาย ${baht(o.sales.total)} (${o.sales.count} บิล) · เงินสด ${baht(o.sales.cash)} · โอน/QR ${baht(o.sales.transfer)}`,
    `กำไรขั้นต้น ${baht(o.grossProfit)}${o.grossMargin !== null ? ` (${o.grossMargin}%)` : ''} · ค่าใช้จ่าย ${baht(o.expenses)} · กำไรประมาณ ${baht(o.profit)}`,
    ...checks.filter(c => c.ok === true).map(c => `✓ ${c.label}: ${c.detail}`),
    ...failed.map(c => `⚠️ ${c.label}: ${c.detail}`),
    ...todos.map(t => `📌 ${t.title} (${t.count})`)
  ];
  if (o.lowStock.length) lines.push(`🛒 ควรซื้อ: ${o.lowStock.slice(0, 6).map(i => i.name).join(', ')}`);
  lines.push(`ปิดโดย ${by}`);
  return lines.join('\n');
}
