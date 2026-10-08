import type { AccountsPayableItem, AccountsReceivableItem, CashShift, Expense, ExpenseCategory, Ingredient, Order, OtherIncome, StockAdjustmentLog, StockLot, WasteLog } from '../types';
import { claimableInputVat, DEFAULT_USEFUL_LIFE_YEARS, EXPENSE_CATEGORY_LABELS, expenseCost, round2, SALES_INCOME_CATEGORIES } from './accounting';
import { countsAsRevenue, orderVatBreakdown } from './orderUtils';
import { cartItemUnitCost, effectiveUnitCost } from './recipeUtils';
import { stockTypeOf } from './stockTypes';

/**
 * A double-entry general ledger derived from the shop's records, with the owner's journals for
 * what operations cannot know (opening balances, equipment bought before, loans, capital,
 * drawings). Every record produces balanced lines, so the books always agree with operations and
 * cover history. Statements: profit and loss, balance sheet, cash flow (direct method), trial
 * balance and each account's ledger.
 *
 * Mapping assumptions:
 *  - a sale paid in cash goes into the drawer (1000) while a cash shift is open, otherwise into
 *    cash outside the drawer (1001); QR, transfer and card into the bank (1010)
 *  - an expense says how it was paid: drawer (1000), cash outside the drawer (1001) or bank (1010)
 *  - ingredient purchases go into stock (1200) and leave it as cost of sales when dishes are sold
 *  - equipment is an asset (1500), depreciated straight-line each month (6100 / 1510)
 *  - goods received without an expense (stock lots) are paid as recorded on the delivery (bank
 *    when it does not say): ingredients and packaging go into stock, supplies are an expense and
 *    equipment an asset (depreciated); counts, waste and issues move the books only for stock
 *  - invoices to customers are sales on credit (1100) until paid; bills from suppliers are owed
 *    (2000) until paid, for goods (1200) or for expenses (6000)
 *  - stock counted up is opening stock (3100); counted down is shrinkage (5300)
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type CashFlowClass = 'OPERATING' | 'INVESTING' | 'FINANCING';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  isCash?: boolean;
  /** How a cash movement against this account counts in the cash-flow statement */
  cashFlow?: CashFlowClass;
  /** Kept by the system (journals cannot use it) */
  system?: boolean;
}

export const ACCOUNTS: Account[] = [
  { code: '1000', name: 'เงินสดในลิ้นชัก', type: 'ASSET', isCash: true },
  { code: '1001', name: 'เงินสดนอกลิ้นชัก / เงินสดย่อย', type: 'ASSET', isCash: true },
  { code: '1010', name: 'เงินฝากธนาคาร / พร้อมเพย์', type: 'ASSET', isCash: true },
  { code: '1100', name: 'ลูกหนี้การค้า', type: 'ASSET' },
  { code: '1190', name: 'เงินรอตัดบัญชี', type: 'ASSET', system: true },
  { code: '1200', name: 'สินค้าคงเหลือ', type: 'ASSET' },
  { code: '1300', name: 'ภาษีซื้อ', type: 'ASSET' },
  { code: '1400', name: 'เงินมัดจำและลูกหนี้อื่น', type: 'ASSET' },
  { code: '1500', name: 'อุปกรณ์และสินทรัพย์ถาวร', type: 'ASSET', cashFlow: 'INVESTING' },
  { code: '1510', name: 'ค่าเสื่อมราคาสะสม', type: 'ASSET', cashFlow: 'INVESTING' },
  { code: '2000', name: 'เจ้าหนี้การค้า', type: 'LIABILITY' },
  { code: '2100', name: 'เงินกู้ยืม', type: 'LIABILITY', cashFlow: 'FINANCING' },
  { code: '2200', name: 'ภาษีขาย', type: 'LIABILITY' },
  { code: '2300', name: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', type: 'LIABILITY' },
  { code: '2400', name: 'ค่าใช้จ่ายค้างจ่าย', type: 'LIABILITY' },
  { code: '3000', name: 'ทุน', type: 'EQUITY', cashFlow: 'FINANCING' },
  { code: '3100', name: 'ปรับปรุงสินค้ายกมา', type: 'EQUITY', cashFlow: 'FINANCING' },
  { code: '3200', name: 'ถอนใช้ส่วนตัว / เงินปันผล', type: 'EQUITY', cashFlow: 'FINANCING' },
  { code: '3300', name: 'กำไรสะสมยกมา', type: 'EQUITY', cashFlow: 'FINANCING' },
  { code: '4000', name: 'รายได้จากการขาย', type: 'REVENUE' },
  { code: '4010', name: 'รับคืนสินค้า / คืนเงิน', type: 'REVENUE' },
  { code: '4900', name: 'รายได้อื่น / เงินสดเกิน', type: 'REVENUE' },
  { code: '5000', name: 'ต้นทุนขาย', type: 'EXPENSE' },
  { code: '5300', name: 'สินค้าขาด / ปรับปรุงสต็อก', type: 'EXPENSE' },
  { code: '5310', name: 'ของเสีย', type: 'EXPENSE' },
  { code: '5320', name: 'ผลต่างการผลิต', type: 'EXPENSE' },
  { code: '5900', name: 'เงินสดขาด', type: 'EXPENSE' },
  { code: '6000', name: 'ค่าใช้จ่ายในการดำเนินงาน', type: 'EXPENSE' },
  { code: '6100', name: 'ค่าเสื่อมราคา', type: 'EXPENSE' },
  { code: '6900', name: 'ค่าใช้จ่ายอื่น', type: 'EXPENSE' }
];
export const ACCOUNT_BY_CODE = new Map(ACCOUNTS.map(a => [a.code, a]));
export const CASH_ACCOUNTS = ACCOUNTS.filter(a => a.isCash).map(a => a.code);

/** Where an expense was paid from */
export type PaidFrom = 'bank' | 'cash' | 'drawer';
export const PAID_FROM_LABELS: Record<PaidFrom, string> = {
  bank: 'โอน / พร้อมเพย์ / บัตร (บัญชีธนาคาร)',
  cash: 'เงินสดนอกลิ้นชัก (เงินสดย่อย)',
  drawer: 'เงินสดจากลิ้นชัก'
};
const payAccount = (p: PaidFrom | undefined) => (p === 'drawer' ? '1000' : p === 'cash' ? '1001' : '1010');

export type CashFlowItem = 'customers' | 'suppliers' | 'expenses' | 'other_operating' | 'investing' | 'financing' | 'opening';

export type SourceType =
  | 'order'
  | 'cogs'
  | 'expense'
  | 'income'
  | 'purchase'
  | 'waste'
  | 'adjustment'
  | 'cash'
  | 'cash_close'
  | 'depreciation'
  | 'receivable'
  | 'payable'
  | 'journal';
export const SOURCE_LABELS: Record<SourceType, string> = {
  order: 'ขาย',
  cogs: 'ต้นทุนขาย (ตัดสต็อก)',
  expense: 'ค่าใช้จ่าย',
  income: 'รายได้อื่น',
  purchase: 'รับของเข้าสต็อก',
  waste: 'ของเสีย',
  adjustment: 'ปรับยอดสต็อก',
  cash: 'ลิ้นชักเงินสด',
  cash_close: 'ปิดลิ้นชัก (นับเงิน)',
  depreciation: 'ค่าเสื่อมราคา',
  receivable: 'ลูกหนี้ (ขายเชื่อ / รับชำระ)',
  payable: 'เจ้าหนี้ (ซื้อเชื่อ / จ่ายชำระ)',
  journal: 'สมุดรายวัน'
};

export interface GlLine {
  date: string; // YYYY-MM-DD (Thai time)
  source: SourceType;
  sourceId: string;
  reference: string;
  memo?: string;
  account: string;
  debit: number;
  credit: number;
  /** For lines on cash accounts: how the movement counts in the cash-flow statement */
  cf?: CashFlowItem;
  /** Expense category (operating expenses by category) */
  detail?: string;
}

/** A journal the owner posts. Never edited or deleted: a mistake is reversed by a new journal. */
export interface JournalEntry {
  id: string;
  number: string; // JV-0001
  date: string;
  memo: string;
  isOpening?: boolean;
  /** The journal this one reverses */
  reverses?: string;
  lines: { account: string; debit: number; credit: number; note?: string }[];
  createdBy?: string;
  createdAt: string;
  branchId?: string;
}

export interface LedgerData {
  branchId: string;
  orders: Order[];
  expenses: Expense[];
  incomes: OtherIncome[];
  stockLots: StockLot[];
  wasteLogs: WasteLog[];
  stockLogs: StockAdjustmentLog[];
  cashShifts: CashShift[];
  journals: JournalEntry[];
  /** Invoices to customers and bills from suppliers (accounts receivable / payable) */
  receivables?: AccountsReceivableItem[];
  payables?: AccountsPayableItem[];
  ingredients: Ingredient[];
  vatRegistered: boolean;
  /** VAT rate in percent (default 7) */
  vatRate?: number;
  usefulLifeYears?: number;
  /** Depreciation is charged up to this day (default today) */
  today?: string;
  /** The books start here (ISO time): records made before are left out, so the statements start at zero */
  startAt?: string;
}

/** The shop's day (UTC+7) of a moment */
export const thaiDay = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '' : new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
};

/** Stock lots made by receiving an expense's goods (the expense already holds the purchase) */
const EXPENSE_LOT = /^(EXP|OCR|TG)-/;

/** When a record was made: its own time, the time in its id (exp-1728…), or the start of its day (Thai time) */
export function recordTime(r: { id?: string; createdAt?: string; timestamp?: string }, date?: string): string {
  const own = r.createdAt || r.timestamp;
  if (own && !Number.isNaN(Date.parse(own))) return new Date(own).toISOString();
  const ms = Number((r.id || '').match(/(\d{13})/)?.[1]);
  if (ms > 1_500_000_000_000) return new Date(ms).toISOString();
  return date ? new Date(Date.parse(`${date.slice(0, 10)}T00:00:00+07:00`)).toISOString() : '';
}
/** Supplier bill groups that are goods for stock (the others are expenses) */
const PAYABLE_GOODS = new Set(['วัตถุดิบสด', 'เนื้อสัตว์สด', 'เครื่องดื่ม/สุรา']);
/** Money received or paid for an invoice or bill: cash outside the drawer, or the bank */
const paymentAccount = (method: string) => (method === 'cash' ? '1001' : '1010');

/** A cash shift of the branch was open at that moment (the cash went into the drawer) */
export function drawerOpenAt(shifts: CashShift[], branchId: string | undefined, iso: string): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return shifts.some(s => {
    if (branchId && s.branchId && s.branchId !== branchId) return false;
    const from = Date.parse(s.openedAt);
    const to = s.closedAt ? Date.parse(s.closedAt) : Infinity;
    return !Number.isNaN(from) && t >= from && (s.status === 'open' || t <= to);
  });
}

/** Stock log reasons that are counts or corrections (the others are covered elsewhere) */
const COUNT_REASONS = new Set(['audit_correction', 'manual_adjustment', 'other']);

export function buildGlLines(d: LedgerData): GlLine[] {
  const lines: GlLine[] = [];
  const own = (b?: string) => !b || d.branchId === 'all' || b === d.branchId;
  const push = (base: Omit<GlLine, 'account' | 'debit' | 'credit' | 'cf' | 'detail'>, legs: [string, number, number, CashFlowItem?, string?][]) => {
    for (const [account, debit, credit, cf, detail] of legs) {
      const dr = round2(debit);
      const cr = round2(credit);
      if (dr === 0 && cr === 0) continue;
      lines.push({ ...base, account, debit: dr, credit: cr, ...(cf && ACCOUNT_BY_CODE.get(account)?.isCash ? { cf } : {}), ...(detail ? { detail } : {}) });
    }
  };
  const ingCost = new Map(d.ingredients.map(i => [i.id, effectiveUnitCost(i)]));
  const typeOfIng = new Map(d.ingredients.map(i => [i.id, stockTypeOf(i)]));
  /** Equipment bought, depreciated below */
  const assets: { id: string; date: string; cost: number; title: string }[] = [];
  /** Made after the books started */
  const counts = (time: string) => !d.startAt || !time || time >= d.startAt;

  // Sales: revenue and output VAT; the money into the drawer (cash) or the bank
  for (const o of d.orders) {
    if (!own(o.branchId) || !countsAsRevenue(o) || !counts(o.createdAt)) continue;
    const date = thaiDay(o.createdAt);
    const { base, vat } = orderVatBreakdown(o);
    const into = o.paymentMethod !== 'cash' ? '1010' : drawerOpenAt(d.cashShifts, o.branchId, o.createdAt) ? '1000' : '1001';
    push({ date, source: 'order', sourceId: o.id, reference: o.orderNumber || o.id }, [
      [into, base + vat, 0, 'customers'],
      ['4000', 0, base],
      ['2200', 0, vat]
    ]);
    const cost = (o.items || []).reduce((s, it) => s + cartItemUnitCost(it) * (it.quantity || 0), 0);
    push({ date, source: 'cogs', sourceId: o.id, reference: o.orderNumber || o.id }, [
      ['5000', cost, 0],
      ['1200', 0, cost]
    ]);
  }

  // Expenses: stock, equipment or operating expense, input VAT; paid from drawer, cash or bank
  for (const e of d.expenses) {
    if (!own(e.branchId) || !e.date || !counts(recordTime(e, e.date))) continue;
    const net = expenseCost(e, d.vatRegistered);
    const vat = claimableInputVat(e, d.vatRegistered);
    const gross = net + vat;
    const target = e.category === 'raw_material' ? '1200' : e.category === 'equipment' ? '1500' : '6000';
    const cf: CashFlowItem = e.category === 'raw_material' ? 'suppliers' : e.category === 'equipment' ? 'investing' : 'expenses';
    const label = EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category;
    push({ date: e.date.slice(0, 10), source: 'expense', sourceId: e.id, reference: label, memo: e.title }, [
      [target, net, 0, undefined, target === '6000' ? label : undefined],
      ['1300', vat, 0],
      [payAccount(e.paidFrom), 0, gross, cf]
    ]);    // A service from abroad: the VAT the shop pays itself (ภ.พ.36) is input VAT it claims back
    if (e.vat36 && d.vatRegistered) {
      const vat36 = round2((e.amount || 0) * ((d.vatRate ?? 7) / 100));
      push({ date: e.date.slice(0, 10), source: 'expense', sourceId: `${e.id}-pp36`, reference: 'ภ.พ.36', memo: e.title }, [
        ['1300', vat36, 0],
        [payAccount(e.paidFrom), 0, vat36, 'expenses']
      ]);
    }
  }

  // Other income: sales-type income (catering, platform refunds) is revenue from sales
  for (const i of d.incomes) {
    if (!own(i.branchId) || !i.date || !counts(recordTime(i, i.date))) continue;
    const into = i.paymentMethod === 'cash' ? '1001' : '1010';
    const sales = SALES_INCOME_CATEGORIES.includes(i.category);
    push({ date: i.date.slice(0, 10), source: 'income', sourceId: i.id, reference: i.title }, [
      [into, i.amount, 0, sales ? 'customers' : 'other_operating'],
      [sales ? '4000' : '4900', 0, i.amount]
    ]);
  }

  // Goods received without an expense (quick receive, lots): paid as the delivery says. Stock
  // goes into inventory; supplies are expensed when bought; equipment is an asset, depreciated
  const kindOf = (ingredientId: string) => typeOfIng.get(ingredientId) || 'inventory';
  for (const lot of d.stockLots) {
    if (EXPENSE_LOT.test(lot.lotNumber || '') || !(lot.quantity > 0) || !(lot.unitCost > 0) || !counts(recordTime(lot, lot.receivedDate))) continue;
    if (d.ingredients.length && !ingCost.has(lot.ingredientId)) continue; // another branch's ingredient
    const value = lot.quantity * lot.unitCost;
    const kind = kindOf(lot.ingredientId);
    const date = (lot.receivedDate || '').slice(0, 10);
    const [target, cf, detail]: [string, CashFlowItem, string | undefined] =
      kind === 'equipment' ? ['1500', 'investing', undefined] : kind === 'supplies' ? ['6000', 'expenses', EXPENSE_CATEGORY_LABELS.supplies || 'วัสดุสิ้นเปลือง'] : ['1200', 'suppliers', undefined];
    push({ date, source: 'purchase', sourceId: lot.id, reference: lot.lotNumber, memo: lot.supplier }, [
      [target, value, 0, undefined, detail],
      [payAccount(lot.paidFrom), 0, value, cf]
    ]);
    if (kind === 'equipment') assets.push({ id: lot.id, date, cost: value, title: d.ingredients.find(i => i.id === lot.ingredientId)?.name || lot.lotNumber });
  }

  // Invoices to customers: a sale on credit, then the payments received
  for (const r of d.receivables || []) {
    if (!own(r.branchId) || !r.issueDate || !counts(recordTime(r, r.issueDate))) continue;
    const base = { source: 'receivable' as const, reference: r.invoiceNumber, memo: r.customerName };
    push({ ...base, date: r.issueDate.slice(0, 10), sourceId: r.id }, [
      ['1100', r.originalAmount, 0],
      ['4000', 0, r.originalAmount]
    ]);
    for (const p of r.payments || []) {
      if (!p.date || !counts(recordTime(p, p.date))) continue;
      push({ ...base, date: p.date.slice(0, 10), sourceId: p.id }, [
        [paymentAccount(p.paymentMethod), p.amount, 0, 'customers'],
        ['1100', 0, p.amount]
      ]);
    }
  }

  // Bills from suppliers: owed when received, then the payments made
  for (const b of d.payables || []) {
    if (!own(b.branchId) || !b.issueDate || !counts(recordTime(b, b.issueDate))) continue;
    const goods = !b.category || PAYABLE_GOODS.has(b.category);
    const base = { source: 'payable' as const, reference: b.billNumber, memo: b.supplierName };
    push({ ...base, date: b.issueDate.slice(0, 10), sourceId: b.id }, [
      [goods ? '1200' : '6000', b.originalAmount, 0, undefined, goods ? undefined : b.category],
      ['2000', 0, b.originalAmount]
    ]);
    for (const p of b.payments || []) {
      if (!p.date || !counts(recordTime(p, p.date))) continue;
      push({ ...base, date: p.date.slice(0, 10), sourceId: p.id }, [
        ['2000', p.amount, 0],
        [paymentAccount(p.paymentMethod), 0, p.amount, goods ? 'suppliers' : 'expenses']
      ]);
    }
  }

  // Waste at its cost (stock only: supplies were expensed when bought, equipment is an asset)
  for (const w of d.wasteLogs) {
    if (!counts(recordTime(w, w.loggedDate)) || kindOf(w.ingredientId) !== 'inventory') continue;
    const value = w.totalCostLoss || w.quantity * (w.unitCost || 0);
    push({ date: (w.loggedDate || '').slice(0, 10), source: 'waste', sourceId: w.id, reference: w.ingredientName, memo: w.notes }, [
      ['5310', value, 0],
      ['1200', 0, value]
    ]);
  }

  // Stock counts and corrections at the ingredient's cost; stock issued for use is cost of sales
  for (const l of d.stockLogs) {
    const reason = String(l.reason);
    if (!counts(l.timestamp)) continue;
    if (!COUNT_REASONS.has(reason) && reason !== 'issue') continue;
    if (kindOf(l.ingredientId) !== 'inventory') continue; // counting supplies or equipment moves no money
    const value = Math.abs(l.changeQty || 0) * (ingCost.get(l.ingredientId) || 0);
    if (!value) continue;
    const base = { date: thaiDay(l.timestamp), source: 'adjustment' as const, sourceId: l.id, reference: l.ingredientName, memo: l.notes };
    if (reason === 'issue') push(base, [['5000', value, 0], ['1200', 0, value]]);
    else if (l.changeQty > 0) push(base, [['1200', value, 0], ['3100', 0, value]]);
    else push(base, [['5300', value, 0], ['1200', 0, value]]);
  }

  // Cash drawer: the float and cash in/out come from the safe; at closing, counted cash goes
  // back to the safe and the difference is cash over (4900) or short (5900)
  for (const s of d.cashShifts) {
    if (!own(s.branchId)) continue;
    if (counts(s.openedAt))
      push({ date: thaiDay(s.openedAt), source: 'cash', sourceId: s.id, reference: s.shiftNumber, memo: 'เงินทอนตั้งต้น' }, [
      ['1000', s.startingFloat || 0, 0],
      ['1001', 0, s.startingFloat || 0]
    ]);
    for (const m of s.cashMovements || []) {
      if (!counts(m.time)) continue;
      const amt = m.amount || 0;
      push({ date: thaiDay(m.time), source: 'cash', sourceId: m.id, reference: s.shiftNumber, memo: m.reason }, m.type === 'cash_in' ? [['1000', amt, 0], ['1001', 0, amt]] : [['1001', amt, 0], ['1000', 0, amt]]);
    }
    if (s.status === 'closed' && typeof s.actualCashBalance === 'number' && s.closedAt && counts(s.closedAt) && counts(s.openedAt)) {
      const counted = s.actualCashBalance;
      const diff = s.cashDifference || 0;
      push({ date: thaiDay(s.closedAt), source: 'cash_close', sourceId: s.id, reference: s.shiftNumber, memo: s.closingNotes }, [
        ['1001', counted, 0],
        ['1000', 0, counted],
        ['1000', Math.max(diff, 0), Math.max(-diff, 0), 'other_operating'],
        [diff >= 0 ? '4900' : '5900', Math.max(-diff, 0), Math.max(diff, 0)]
      ]);
    }
  }

  // Equipment: straight-line depreciation, charged at the end of each month
  const years = d.usefulLifeYears && d.usefulLifeYears > 0 ? d.usefulLifeYears : DEFAULT_USEFUL_LIFE_YEARS;
  const today = d.today || thaiDay(new Date().toISOString());
  for (const e of d.expenses) {
    if (e.category !== 'equipment' || !own(e.branchId) || !/^\d{4}-\d{2}/.test(e.date || '') || !counts(recordTime(e, e.date))) continue;
    assets.push({ id: e.id, date: e.date, cost: expenseCost(e, d.vatRegistered), title: e.title });
  }
  for (const e of assets) {
    const cost = e.cost;
    if (!(cost > 0) || !/^\d{4}-\d{2}/.test(e.date)) continue;
    const months = Math.round(years * 12);
    const perMonth = cost / months;
    let [y, m] = e.date.slice(0, 7).split('-').map(Number);
    let charged = 0;
    for (let i = 0; i < months; i++) {
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of the month
      if (end > today) break;
      const amount = i === months - 1 ? cost - charged : round2(perMonth);
      charged = round2(charged + amount);
      push({ date: end, source: 'depreciation', sourceId: `${e.id}-${i}`, reference: e.title }, [
        ['6100', amount, 0],
        ['1510', 0, amount]
      ]);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  // The owner's journals; a cash line is classified by the other accounts of its entry
  for (const j of d.journals) {
    if (!own(j.branchId) || !counts(recordTime(j, j.date))) continue;
    const others = j.lines.filter(l => !ACCOUNT_BY_CODE.get(l.account)?.isCash);
    const rank = Math.max(0, ...others.map(l => ({ FINANCING: 3, INVESTING: 2, OPERATING: 1 })[ACCOUNT_BY_CODE.get(l.account)?.cashFlow || 'OPERATING']));
    const cf: CashFlowItem | undefined = j.isOpening ? 'opening' : rank === 3 ? 'financing' : rank === 2 ? 'investing' : rank === 1 ? 'other_operating' : undefined;
    push(
      { date: j.date, source: 'journal', sourceId: j.id, reference: j.number, memo: j.memo },
      j.lines.map(l => [l.account, l.debit, l.credit, cf, undefined] as [string, number, number, CashFlowItem?, string?])
    );
  }

  return lines.filter(l => l.date);
}

// ---------- Statements ----------

const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
/** Debit minus credit of an account's lines */
const drBalance = (lines: GlLine[], code: string) => sum(lines.filter(l => l.account === code).map(l => l.debit - l.credit));
const inRange = (from: string, to: string) => (l: GlLine) => l.date >= from && l.date <= to;

export interface StatementLine {
  code: string;
  name: string;
  type: AccountType;
  amount: number;
}

export interface GlProfitAndLoss {
  revenueLines: StatementLine[];
  revenue: number;
  cogs: number;
  grossProfit: number;
  otherCostLines: StatementLine[];
  otherCosts: number;
  expenseCategories: { category: string; amount: number }[];
  otherExpenseLines: StatementLine[];
  operatingExpenses: number;
  netProfit: number;
}

export function profitAndLoss(all: GlLine[], from: string, to: string): GlProfitAndLoss {
  const lines = all.filter(inRange(from, to));
  const line = (code: string, sign: 1 | -1): StatementLine => {
    const a = ACCOUNT_BY_CODE.get(code)!;
    return { code, name: a.name, type: a.type, amount: round2(sign * drBalance(lines, code)) };
  };
  const revenueLines = ACCOUNTS.filter(a => a.type === 'REVENUE').map(a => line(a.code, -1)).filter(l => l.amount !== 0);
  const revenue = sum(revenueLines.map(l => l.amount));
  const cogs = round2(drBalance(lines, '5000'));
  const otherCostLines = ['5300', '5310', '5320', '5900'].map(c => line(c, 1)).filter(l => l.amount !== 0);
  const otherCosts = sum(otherCostLines.map(l => l.amount));
  const byCategory = new Map<string, number>();
  lines.filter(l => l.account === '6000').forEach(l => byCategory.set(l.detail || 'อื่น ๆ', (byCategory.get(l.detail || 'อื่น ๆ') || 0) + l.debit - l.credit));
  const expenseCategories = [...byCategory.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).filter(c => c.amount !== 0).sort((a, b) => b.amount - a.amount);
  const otherExpenseLines = ['6100', '6900'].map(c => line(c, 1)).filter(l => l.amount !== 0);
  const operatingExpenses = round2(sum(expenseCategories.map(c => c.amount)) + sum(otherExpenseLines.map(l => l.amount)));
  return {
    revenueLines,
    revenue,
    cogs,
    grossProfit: round2(revenue - cogs),
    otherCostLines,
    otherCosts,
    expenseCategories,
    otherExpenseLines,
    operatingExpenses,
    netProfit: round2(revenue - cogs - otherCosts - operatingExpenses)
  };
}

export interface GlBalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  equityAccounts: number;
  earningsToDate: number;
  totalEquity: number;
  /** Assets − (liabilities + equity): zero when the books balance */
  difference: number;
  clearing: number;
}

/** Balances as of a day; earnings to date (all revenue − expenses) sit in equity so the sheet balances */
export function balanceSheet(all: GlLine[], asOf: string): GlBalanceSheet {
  const lines = all.filter(l => l.date <= asOf);
  const of = (type: AccountType) =>
    ACCOUNTS.filter(a => a.type === type)
      .map(a => ({ code: a.code, name: a.name, type, amount: round2((type === 'ASSET' ? 1 : -1) * drBalance(lines, a.code)) }))
      .filter(l => l.amount !== 0);
  const assets = of('ASSET');
  const liabilities = of('LIABILITY');
  const equity = of('EQUITY');
  const totalAssets = sum(assets.map(l => l.amount));
  const totalLiabilities = sum(liabilities.map(l => l.amount));
  const equityAccounts = sum(equity.map(l => l.amount));
  const earningsToDate = round2(-sum(ACCOUNTS.filter(a => a.type === 'REVENUE' || a.type === 'EXPENSE').map(a => drBalance(lines, a.code))));
  const totalEquity = round2(equityAccounts + earningsToDate);
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    equityAccounts,
    earningsToDate,
    totalEquity,
    difference: round2(totalAssets - totalLiabilities - totalEquity),
    clearing: drBalance(lines, '1190')
  };
}

export interface GlCashFlow {
  openingCash: number;
  closingCash: number;
  items: Record<Exclude<CashFlowItem, 'opening'>, number>;
  operating: number;
  investing: number;
  financing: number;
  closingByAccount: { code: string; name: string; balance: number }[];
}

/** Direct method over the cash accounts. Opening balances posted in the period count as opening cash. */
export function cashFlow(all: GlLine[], from: string, to: string): GlCashFlow {
  const cash = all.filter(l => CASH_ACCOUNTS.includes(l.account));
  const before = cash.filter(l => l.date < from);
  const period = cash.filter(inRange(from, to));
  const net = (ls: GlLine[]) => sum(ls.map(l => l.debit - l.credit));
  const items = { customers: 0, suppliers: 0, expenses: 0, other_operating: 0, investing: 0, financing: 0 };
  let openingInPeriod = 0;
  for (const l of period) {
    if (!l.cf) continue; // between cash accounts
    if (l.cf === 'opening') openingInPeriod += l.debit - l.credit;
    else items[l.cf] += l.debit - l.credit;
  }
  (Object.keys(items) as (keyof typeof items)[]).forEach(k => (items[k] = round2(items[k])));
  const operating = round2(items.customers + items.suppliers + items.expenses + items.other_operating);
  return {
    openingCash: round2(net(before) + openingInPeriod),
    closingCash: round2(net(before) + net(period)),
    items,
    operating,
    investing: items.investing,
    financing: items.financing,
    closingByAccount: CASH_ACCOUNTS.map(code => ({ code, name: ACCOUNT_BY_CODE.get(code)!.name, balance: round2(net(cash.filter(l => l.account === code && l.date <= to))) }))
  };
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export function trialBalance(all: GlLine[], asOf: string): TrialBalanceRow[] {
  const lines = all.filter(l => l.date <= asOf);
  return ACCOUNTS.map(a => {
    const own = lines.filter(l => l.account === a.code);
    const debit = sum(own.map(l => l.debit));
    const credit = sum(own.map(l => l.credit));
    return { code: a.code, name: a.name, type: a.type, debit, credit, balance: round2(debit - credit) };
  });
}

export interface LedgerRow extends GlLine {
  balance: number;
}

/** One account's lines in a period with the running balance (debit − credit), and the balance brought forward */
export function accountLedger(all: GlLine[], code: string, from: string, to: string): { opening: number; rows: LedgerRow[] } {
  const own = all.filter(l => l.account === code);
  const opening = sum(own.filter(l => l.date < from).map(l => l.debit - l.credit));
  let running = opening;
  const rows = own
    .filter(inRange(from, to))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => {
      running = round2(running + l.debit - l.credit);
      return { ...l, balance: running };
    });
  return { opening, rows };
}

// ---------- Journals ----------

export interface JournalCheck {
  ok: boolean;
  debit: number;
  credit: number;
  error?: string;
}

/** A journal can be posted: at least two lines, each a debit or a credit, totals equal, no system account */
export function checkJournal(lines: JournalEntry['lines']): JournalCheck {
  const filled = lines.filter(l => l.account && (l.debit > 0 || l.credit > 0));
  const debit = sum(filled.map(l => l.debit || 0));
  const credit = sum(filled.map(l => l.credit || 0));
  if (filled.length < 2) return { ok: false, debit, credit, error: 'ต้องมีอย่างน้อย 2 บรรทัด' };
  if (filled.some(l => l.debit > 0 && l.credit > 0)) return { ok: false, debit, credit, error: 'แต่ละบรรทัดใส่ได้ช่องเดียว (เดบิตหรือเครดิต)' };
  if (filled.some(l => l.debit < 0 || l.credit < 0)) return { ok: false, debit, credit, error: 'ยอดติดลบไม่ได้' };
  if (filled.some(l => ACCOUNT_BY_CODE.get(l.account)?.system || !ACCOUNT_BY_CODE.has(l.account))) return { ok: false, debit, credit, error: 'บัญชีนี้ระบบดูแลเอง' };
  if (debit !== credit) return { ok: false, debit, credit, error: 'เดบิตและเครดิตต้องเท่ากัน' };
  return { ok: true, debit, credit };
}

export const nextJournalNumber = (journals: Pick<JournalEntry, 'number'>[]) =>
  `JV-${String(journals.reduce((m, j) => Math.max(m, Number(j.number.replace(/\D/g, '')) || 0), 0) + 1).padStart(4, '0')}`;

/** The reversing journal of an entry (debits and credits swapped) */
export function reversalOf(j: JournalEntry, journals: JournalEntry[], date: string, by?: string): JournalEntry {
  return {
    id: `jv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    number: nextJournalNumber(journals),
    date,
    memo: `กลับรายการ ${j.number}: ${j.memo}`.slice(0, 300),
    reverses: j.id,
    lines: j.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit, note: l.note })),
    createdBy: by,
    createdAt: new Date().toISOString(),
    branchId: j.branchId
  };
}

/** Stock value now, at each ingredient's cost (to start the books with an opening stock journal) */
export const stockValue = (ingredients: Ingredient[]) => round2(ingredients.reduce((s, i) => s + Math.max(0, i.currentStock || 0) * effectiveUnitCost(i), 0));
