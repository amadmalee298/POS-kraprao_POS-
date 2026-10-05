import type { Expense, ExpenseCategory, IncomeCategory, Order, OtherIncome, SystemSettings } from '../types';
import { countsAsRevenue, orderVatBreakdown } from './orderUtils';
// Kept in their own file so the Vercel bot can use them; re-exported for the app
export { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS } from './categoryLabels';
import { cartItemUnitCost } from './recipeUtils';

/**
 * The shop's books, derived from what the POS records. The profit and loss follows the layout of
 * Thai financial reporting standards for non-publicly accountable entities (TFRS for NPAEs):
 * revenue from sales, cost of sales, gross profit, selling and administrative expenses, other
 * income, profit before income tax. Amounts exclude VAT when the shop is VAT-registered: output
 * VAT is owed to the Revenue Department and input VAT is claimed back, so neither is income or cost.
 */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** VAT registration: the till adds or extracts VAT only when the shop is registered. */
export const isVatRegistered = (settings: Partial<SystemSettings>): boolean =>
  settings.enableVat !== false && settings.vatType !== 'none' && (settings.vatRate ?? 7) > 0;

export const vatRateOf = (settings: Partial<SystemSettings>): number =>
  typeof settings.vatRate === 'number' ? settings.vatRate : 7;

/** VAT inside a VAT-inclusive amount */
export const vatInside = (grossAmount: number, rate: number): number => round2((grossAmount * rate) / (100 + rate));

/**
 * What an expense costs the shop. A VAT-registered shop claims input VAT back, so its cost is the
 * amount before VAT; a shop that is not registered cannot, so the VAT is part of the cost.
 */
export function expenseCost(e: Pick<Expense, 'amount' | 'includeVat' | 'vatAmount' | 'netAmount'>, vatRegistered: boolean): number {
  if (!vatRegistered || !e.includeVat) return e.amount || 0;
  return typeof e.netAmount === 'number' ? e.netAmount : (e.amount || 0) - (e.vatAmount || 0);
}

/** Input VAT that can be claimed on an expense */
export const claimableInputVat = (e: Pick<Expense, 'includeVat' | 'vatAmount'>, vatRegistered: boolean): number =>
  vatRegistered && e.includeVat ? e.vatAmount || 0 : 0;

/** Recorded incomes that are part of selling food (revenue from sales) rather than other income */
export const SALES_INCOME_CATEGORIES: IncomeCategory[] = ['catering', 'delivery_subsidy'];

/**
 * Selling and administrative expense lines, in statement order. Not here: ingredient purchases
 * (stock, charged as cost of sales) and equipment purchases (assets, charged as depreciation).
 */
export const SGA_CATEGORIES: ExpenseCategory[] = ['salary', 'rent', 'utilities', 'supplies', 'marketing', 'other'];

export const DEFAULT_USEFUL_LIFE_YEARS = 5;

export interface DepreciationOptions {
  /** Straight-line useful life of equipment, years (default 5) */
  usefulLifeYears?: number;
  /** Depreciation is charged up to this day (YYYY-MM-DD, default today) */
  today?: string;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface EquipmentItem {
  expense: Expense;
  cost: number;
  start: Date;
  lifeDays: number;
}

function equipmentItems(expenses: Expense[], ownBranch: (id?: string) => boolean, vatRegistered: boolean, opts: DepreciationOptions): EquipmentItem[] {
  const years = opts.usefulLifeYears && opts.usefulLifeYears > 0 ? opts.usefulLifeYears : DEFAULT_USEFUL_LIFE_YEARS;
  return expenses
    .filter(e => e.category === 'equipment' && ownBranch(e.branchId) && /^\d{4}-\d{2}-\d{2}/.test(e.date || ''))
    .map(e => {
      const [y, m, d] = e.date.slice(0, 10).split('-').map(Number);
      return { expense: e, cost: expenseCost(e, vatRegistered), start: new Date(y, m - 1, d), lifeDays: Math.round(years * 365) };
    });
}

/**
 * Straight-line depreciation of equipment bought, per day from the purchase date (IAS 16),
 * for the days that pass `inPeriod`, up to today.
 */
function depreciationFor(items: EquipmentItem[], inPeriod: (date: string) => boolean, today: string): number {
  let total = 0;
  for (const it of items) {
    if (it.cost <= 0) continue;
    const perDay = it.cost / it.lifeDays;
    const day = new Date(it.start);
    for (let i = 0; i < it.lifeDays; i++) {
      const key = ymd(day);
      if (key > today) break;
      // Local noon: the same calendar day for every date parser in the app
      if (inPeriod(`${key}T12:00:00`)) total += perDay;
      day.setDate(day.getDate() + 1);
    }
  }
  return total;
}

/** Equipment at cost, depreciation to date and book value (for the balance sheet) */
export function equipmentBookValue(
  expenses: Expense[],
  branchId: string,
  vatRegistered: boolean,
  opts: DepreciationOptions = {}
): { cost: number; accumulated: number; net: number; count: number } {
  const own = (id?: string) => branchId === 'all' || !id || id === branchId;
  const items = equipmentItems(expenses, own, vatRegistered, opts);
  const cost = items.reduce((s, i) => s + i.cost, 0);
  const accumulated = Math.min(cost, depreciationFor(items, () => true, opts.today || ymd(new Date())));
  return { cost: round2(cost), accumulated: round2(accumulated), net: round2(cost - accumulated), count: items.length };
}

export interface ProfitAndLoss {
  // Revenue from sales and services
  storeSales: number; // dine-in and takeaway, before VAT
  deliverySales: number; // delivery orders and delivery platform income
  cateringSales: number;
  salesRevenue: number;
  // Cost of sales
  cogs: number;
  /** Part of COGS estimated from the menu price because the dish has no cost price yet */
  estimatedCogs: number;
  grossProfit: number;
  // Selling and administrative expenses, before VAT when it can be claimed
  expenses: Record<ExpenseCategory, number>;
  /** Depreciation of equipment for the period (part of selling and admin expenses) */
  depreciation: number;
  sga: number; // excludes ingredient and equipment purchases; includes depreciation
  operatingProfit: number;
  otherIncome: number;
  profitBeforeTax: number;
  totalIncome: number; // sales + other income
  // VAT for the period (ภ.พ.30)
  outputVat: number;
  inputVat: number;
  vatPayable: number;
  orderCount: number;
}

export interface BookFilter {
  /** 'all' for every branch */
  branchId: string;
  /** Keeps records whose date (YYYY-MM-DD or ISO) passes; omit for all time */
  inPeriod?: (date: string) => boolean;
}

const emptyExpenses = (): Record<ExpenseCategory, number> => ({
  rent: 0,
  salary: 0,
  utilities: 0,
  raw_material: 0,
  supplies: 0,
  equipment: 0,
  marketing: 0,
  other: 0
});

/** Local calendar month (YYYY-MM) of a date or ISO time */
export function monthOf(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(0, 7);
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildProfitAndLoss(
  data: { orders: Order[]; expenses: Expense[]; incomes: OtherIncome[] },
  filter: BookFilter,
  vatRegistered: boolean,
  depreciationOptions: DepreciationOptions = {}
): ProfitAndLoss {
  const inPeriod = filter.inPeriod || (() => true);
  const all = filter.branchId === 'all';
  const ownBranch = (id?: string) => all || !id || id === filter.branchId;

  let storeSales = 0;
  let deliverySales = 0;
  let cateringSales = 0;
  let cogs = 0;
  let estimatedCogs = 0;
  let outputVat = 0;
  let orderCount = 0;

  for (const o of data.orders) {
    if ((!all && o.branchId !== filter.branchId) || !countsAsRevenue(o) || !inPeriod(o.createdAt)) continue;
    orderCount++;
    const { base, vat } = orderVatBreakdown(o);
    outputVat += vat;
    if (o.orderType === 'delivery') deliverySales += base;
    else storeSales += base;
    for (const item of o.items || []) {
      const lineCost = cartItemUnitCost(item) * (item.quantity || 0);
      cogs += lineCost;
      if (!(item.menuItem?.costPrice && item.menuItem.costPrice > 0)) estimatedCogs += lineCost;
    }
  }

  let otherIncome = 0;
  for (const inc of data.incomes) {
    if (!ownBranch(inc.branchId) || !inPeriod(inc.date)) continue;
    const amount = inc.amount || 0;
    if (inc.category === 'catering') cateringSales += amount;
    else if (inc.category === 'delivery_subsidy') deliverySales += amount;
    else otherIncome += amount;
  }

  const expenses = emptyExpenses();
  let inputVat = 0;
  for (const e of data.expenses) {
    if (!ownBranch(e.branchId) || !inPeriod(e.date)) continue;
    const key: ExpenseCategory = e.category in expenses ? e.category : 'other';
    expenses[key] += expenseCost(e, vatRegistered);
    inputVat += claimableInputVat(e, vatRegistered);
  }

  const salesRevenue = storeSales + deliverySales + cateringSales;
  const grossProfit = salesRevenue - cogs;
  const depreciation = depreciationFor(
    equipmentItems(data.expenses, ownBranch, vatRegistered, depreciationOptions),
    inPeriod,
    depreciationOptions.today || ymd(new Date())
  );
  const sga = SGA_CATEGORIES.reduce((sum, c) => sum + expenses[c], 0) + depreciation;
  const operatingProfit = grossProfit - sga;
  const profitBeforeTax = operatingProfit + otherIncome;
  (Object.keys(expenses) as ExpenseCategory[]).forEach(k => (expenses[k] = round2(expenses[k])));

  return {
    storeSales: round2(storeSales),
    deliverySales: round2(deliverySales),
    cateringSales: round2(cateringSales),
    salesRevenue: round2(salesRevenue),
    cogs: round2(cogs),
    estimatedCogs: round2(estimatedCogs),
    grossProfit: round2(grossProfit),
    expenses,
    depreciation: round2(depreciation),
    sga: round2(sga),
    operatingProfit: round2(operatingProfit),
    otherIncome: round2(otherIncome),
    profitBeforeTax: round2(profitBeforeTax),
    totalIncome: round2(salesRevenue + otherIncome),
    outputVat: round2(outputVat),
    inputVat: round2(inputVat),
    vatPayable: round2(outputVat - inputVat),
    orderCount
  };
}

export const pct = (part: number, whole: number): number => (whole ? round2((part / whole) * 100) : 0);

export interface BalanceSheetInput {
  cash: number;
  receivables: number;
  inventory: number;
  equipment: number;
  payables: number;
  vatPayable: number;
  ownerCapital: number;
  retainedEarnings: number;
}

export interface BalanceSheet extends BalanceSheetInput {
  currentAssets: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  /** Assets − (liabilities + equity): items the POS has no record of (e.g. opening stock, owner drawings) */
  unreconciled: number;
  balanced: boolean;
  currentRatio: number | null;
  debtToEquity: number | null;
  workingCapital: number;
}

export function buildBalanceSheet(i: BalanceSheetInput): BalanceSheet {
  const currentAssets = i.cash + i.receivables + i.inventory;
  const totalAssets = currentAssets + i.equipment;
  const totalLiabilities = i.payables + Math.max(0, i.vatPayable);
  const totalEquity = i.ownerCapital + i.retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const unreconciled = round2(totalAssets - totalLiabilitiesAndEquity);
  return {
    ...i,
    currentAssets: round2(currentAssets),
    totalAssets: round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    totalEquity: round2(totalEquity),
    totalLiabilitiesAndEquity: round2(totalLiabilitiesAndEquity),
    unreconciled,
    balanced: Math.abs(unreconciled) < 1,
    currentRatio: totalLiabilities > 0 ? round2(currentAssets / totalLiabilities) : null,
    debtToEquity: totalEquity > 0 ? round2(totalLiabilities / totalEquity) : null,
    workingCapital: round2(currentAssets - totalLiabilities)
  };
}

/** Baht with two decimals, e.g. 1,234.50 */
export const money = (n: number): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface CashFlowStatement {
  // Operating activities (direct method)
  receiptsFromSales: number; // bills paid, VAT included
  receiptsOther: number; // recorded other incomes
  receiptsFromReceivables: number;
  paidExpenses: number; // recorded expenses including ingredient purchases, VAT included
  paidPayables: number;
  /** Equipment bought through expenses (investing) */
  equipmentPaid: number;
  operating: number;
  investing: number;
  financing: number;
  netChange: number;
  freeCashFlow: number;
}

interface CashFlowData {
  orders: Order[];
  expenses: Expense[];
  incomes: OtherIncome[];
  receivables: { branchId?: string; payments?: { date: string; amount: number }[] }[];
  payables: { branchId?: string; payments?: { date: string; amount: number }[] }[];
  entries: { branchId?: string; date: string; activityType: 'investing' | 'financing'; flowType: 'inflow' | 'outflow'; amount: number }[];
}

/** Cash in and out of the period by activity (direct method, TFRS for NPAEs chapter on cash flows). */
export function buildCashFlow(data: CashFlowData, filter: BookFilter): CashFlowStatement {
  const inPeriod = filter.inPeriod || (() => true);
  const own = (id?: string) => !id || id === filter.branchId;
  const sum = <T,>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);

  const receiptsFromSales = sum(
    data.orders.filter(o => o.branchId === filter.branchId && countsAsRevenue(o) && inPeriod(o.createdAt)),
    o => o.grandTotal || 0
  );
  const receiptsOther = sum(data.incomes.filter(i => own(i.branchId) && inPeriod(i.date)), i => i.amount || 0);
  const periodExpenses = data.expenses.filter(e => own(e.branchId) && inPeriod(e.date));
  // Equipment bought is an investment, not an operating payment
  const paidExpenses = sum(periodExpenses.filter(e => e.category !== 'equipment'), e => e.amount || 0);
  const equipmentPaid = sum(periodExpenses.filter(e => e.category === 'equipment'), e => e.amount || 0);
  const paymentsIn = (list: CashFlowData['receivables']) =>
    sum(list.filter(x => own(x.branchId)), x => sum((x.payments || []).filter(p => inPeriod(p.date)), p => p.amount || 0));
  const receiptsFromReceivables = paymentsIn(data.receivables);
  const paidPayables = paymentsIn(data.payables);
  const entries = data.entries.filter(e => own(e.branchId) && inPeriod(e.date));
  const net = (type: 'investing' | 'financing') =>
    sum(entries.filter(e => e.activityType === type), e => (e.flowType === 'inflow' ? e.amount : -e.amount));
  const investingOut = sum(entries.filter(e => e.activityType === 'investing' && e.flowType === 'outflow'), e => e.amount) + equipmentPaid;

  const operating = receiptsFromSales + receiptsOther + receiptsFromReceivables - paidExpenses - paidPayables;
  const investing = net('investing') - equipmentPaid;
  const financing = net('financing');
  return {
    receiptsFromSales: round2(receiptsFromSales),
    receiptsOther: round2(receiptsOther),
    receiptsFromReceivables: round2(receiptsFromReceivables),
    paidExpenses: round2(paidExpenses),
    paidPayables: round2(paidPayables),
    equipmentPaid: round2(equipmentPaid),
    operating: round2(operating),
    investing: round2(investing),
    financing: round2(financing),
    netChange: round2(operating + investing + financing),
    freeCashFlow: round2(operating - investingOut)
  };
}

type DebtStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';

/** Status of a receivable or payable from its balance and due date (YYYY-MM-DD) */
export function withLiveStatus<T extends { remainingAmount: number; paidAmount: number; dueDate: string; status: DebtStatus }>(item: T, today: string): T {
  const status: DebtStatus =
    item.remainingAmount <= 0.004 ? 'paid' : item.dueDate && item.dueDate < today ? 'overdue' : item.paidAmount > 0 ? 'partial' : 'unpaid';
  return status === item.status ? item : { ...item, status };
}

/** Downloads rows as a CSV file that Excel opens with Thai text intact. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = '\uFEFF' + [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
