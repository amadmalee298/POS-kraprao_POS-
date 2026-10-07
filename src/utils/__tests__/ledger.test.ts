import { describe, expect, it } from 'vitest';
import type { CashShift, Expense, Order, OtherIncome } from '../../types';
import {
  accountLedger,
  balanceSheet,
  buildGlLines,
  cashFlow,
  checkJournal,
  JournalEntry,
  LedgerData,
  nextJournalNumber,
  profitAndLoss,
  reversalOf,
  trialBalance
} from '../ledger';

const order = (over: Partial<Order>): Order =>
  ({
    id: 'o1',
    orderNumber: 'ORD-1',
    branchId: 'b1',
    orderType: 'dine-in',
    items: [{ cartItemId: 'c', quantity: 2, unitPrice: 60, totalPrice: 120, menuItem: { id: 'm', name: 'กะเพรา', price: 60, costPrice: 25 } }],
    subtotal: 107,
    discountAmount: 0,
    vatAmount: 7,
    grandTotal: 107,
    paymentMethod: 'cash',
    tenderedAmount: 107,
    changeAmount: 0,
    status: 'served',
    createdAt: '2026-10-05T05:00:00.000Z',
    updatedAt: '',
    ...over
  }) as Order;

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e1',
  branchId: 'b1',
  date: '2026-10-05',
  category: 'utilities',
  title: 'ค่าไฟ',
  amount: 500,
  includeVat: false,
  vatAmount: 0,
  netAmount: 500,
  ...over
});

const shift: CashShift = {
  id: 's1',
  shiftNumber: 'SHIFT-1',
  branchId: 'b1',
  openedBy: 'a',
  openedAt: '2026-10-05T01:00:00.000Z',
  startingFloat: 500,
  status: 'closed',
  closedAt: '2026-10-05T12:00:00.000Z',
  actualCashBalance: 600,
  expectedCashBalance: 607,
  cashDifference: -7,
  cashMovements: []
};

const data = (over: Partial<LedgerData> = {}): LedgerData => ({
  branchId: 'b1',
  orders: [order({}), order({ id: 'o2', orderNumber: 'ORD-2', paymentMethod: 'promptpay', grandTotal: 214, vatAmount: 14 }), order({ id: 'o3', status: 'cancelled' })],
  expenses: [
    expense({}),
    expense({ id: 'e2', category: 'raw_material', title: 'หมู', amount: 1070, includeVat: true, vatAmount: 70, netAmount: 1000, paidFrom: 'cash' }),
    expense({ id: 'e3', category: 'equipment', title: 'ตู้เย็น', amount: 12000, date: '2026-08-10', netAmount: 12000 }),
    expense({ id: 'e4', branchId: 'b2', amount: 9999 })
  ],
  incomes: [{ id: 'i1', branchId: 'b1', date: '2026-10-05', category: 'recycling', title: 'น้ำมันเก่า', amount: 200, paymentMethod: 'cash' } as OtherIncome],
  stockLots: [{ id: 'l1', ingredientId: 'ing', lotNumber: 'LOT-1', quantity: 2, unitCost: 100, receivedDate: '2026-10-04', expiryDate: '', supplier: 'ตลาด' }, { id: 'l2', ingredientId: 'ing', lotNumber: 'EXP-1', quantity: 5, unitCost: 100, receivedDate: '2026-10-05', expiryDate: '', supplier: '' }],
  wasteLogs: [{ id: 'w1', ingredientId: 'ing', ingredientName: 'หมู', quantity: 1, unit: 'kg', unitCost: 100, totalCostLoss: 100, reason: 'spoiled', loggedDate: '2026-10-05' }],
  stockLogs: [{ id: 'a1', ingredientId: 'ing', ingredientName: 'หมู', previousStock: 5, newStock: 4.5, changeQty: -0.5, unit: 'kg', reason: 'audit_correction', userName: 'a', timestamp: '2026-10-05T10:00:00.000Z' }],
  cashShifts: [shift],
  journals: [
    {
      id: 'j1',
      number: 'JV-0001',
      date: '2026-08-01',
      memo: 'ยอดยกมา',
      isOpening: true,
      lines: [
        { account: '1010', debit: 50000, credit: 0 },
        { account: '1001', debit: 2000, credit: 0 },
        { account: '3000', debit: 0, credit: 52000 }
      ],
      createdAt: ''
    }
  ],
  ingredients: [{ id: 'ing', name: 'หมู', unit: 'kg', unitCost: 100, currentStock: 4.5 } as any],
  vatRegistered: true,
  usefulLifeYears: 1,
  today: '2026-10-31',
  ...over
});

describe('general ledger', () => {
  const lines = buildGlLines(data());

  it('posts every record in balance', () => {
    const bySource = new Map<string, number>();
    lines.forEach(l => bySource.set(`${l.source}:${l.sourceId}`, (bySource.get(`${l.source}:${l.sourceId}`) || 0) + l.debit - l.credit));
    for (const [key, net] of bySource) expect(Math.abs(net), key).toBeLessThan(0.005);
  });

  it('posts a cash sale into the drawer and a QR sale into the bank, with VAT and cost of sales', () => {
    const o1 = lines.filter(l => l.sourceId === 'o1');
    expect(o1.filter(l => l.source === 'order').map(l => [l.account, l.debit, l.credit])).toEqual([
      ['1000', 107, 0],
      ['4000', 0, 100],
      ['2200', 0, 7]
    ]);
    expect(o1.filter(l => l.source === 'cogs').map(l => [l.account, l.debit, l.credit])).toEqual([
      ['5000', 50, 0],
      ['1200', 0, 50]
    ]);
    expect(lines.find(l => l.sourceId === 'o2' && l.debit > 0 && l.source === 'order')?.account).toBe('1010');
    expect(lines.some(l => l.sourceId === 'o3')).toBe(false); // cancelled
    expect(lines.some(l => l.sourceId === 'e4')).toBe(false); // another branch
  });

  it('puts ingredient purchases into stock with input VAT, paid as the expense says', () => {
    expect(lines.filter(l => l.sourceId === 'e2').map(l => [l.account, l.debit, l.credit])).toEqual([
      ['1200', 1000, 0],
      ['1300', 70, 0],
      ['1001', 0, 1070]
    ]);
    // Stock received for an expense is not counted twice; other goods received are paid from the bank
    expect(lines.some(l => l.sourceId === 'l2')).toBe(false);
    expect(lines.filter(l => l.sourceId === 'l1').map(l => l.account)).toEqual(['1200', '1010']);
  });

  it('depreciates equipment each month end up to today', () => {
    const dep = lines.filter(l => l.source === 'depreciation' && l.account === '6100');
    expect(dep.map(l => [l.date, l.debit])).toEqual([
      ['2026-08-31', 1000],
      ['2026-09-30', 1000],
      ['2026-10-31', 1000]
    ]);
  });

  it('closes the drawer: counted cash to the safe, the shortage as cash short', () => {
    const close = lines.filter(l => l.source === 'cash_close');
    expect(close.find(l => l.account === '5900')?.debit).toBe(7);
    // drawer: float 500 + cash sale 107 − counted 600 − short 7 = 0
    const drawer = lines.filter(l => l.account === '1000').reduce((s, l) => s + l.debit - l.credit, 0);
    expect(Math.round(drawer * 100) / 100).toBe(0);
  });

  it('makes a profit and loss statement', () => {
    const p = profitAndLoss(lines, '2026-10-01', '2026-10-31');
    expect(p.revenue).toBe(500); // 100 + 200 + 200 other income
    expect(p.cogs).toBe(100);
    expect(p.otherCostLines.map(l => [l.code, l.amount])).toEqual([
      ['5300', 50],
      ['5310', 100],
      ['5900', 7]
    ]);
    expect(p.expenseCategories).toEqual([{ category: 'ค่าน้ำ ค่าไฟ ค่าแก๊ส', amount: 500 }]);
    expect(p.otherExpenseLines).toEqual([{ code: '6100', name: 'ค่าเสื่อมราคา', type: 'EXPENSE', amount: 1000 }]);
    expect(p.netProfit).toBe(500 - 100 - 157 - 1500);
  });

  it('balances the balance sheet and the trial balance', () => {
    const b = balanceSheet(lines, '2026-10-31');
    expect(b.difference).toBe(0);
    expect(b.totalAssets).toBe(b.totalLiabilities + b.totalEquity);
    expect(b.assets.find(l => l.code === '1510')?.amount).toBe(-3000);
    const tb = trialBalance(lines, '2026-10-31');
    expect(tb.reduce((s, r) => s + r.debit, 0)).toBeCloseTo(tb.reduce((s, r) => s + r.credit, 0), 2);
  });

  it('reconciles the cash flow with the cash accounts', () => {
    const c = cashFlow(lines, '2026-10-01', '2026-10-31');
    expect(c.openingCash).toBe(40000); // 52000 opening − 12000 equipment in August
    expect(c.items.customers).toBe(321);
    expect(c.items.suppliers).toBe(-1270);
    expect(c.items.expenses).toBe(-500);
    expect(c.items.other_operating).toBe(193); // 200 income − 7 short
    expect(Math.round((c.openingCash + c.operating + c.investing + c.financing) * 100) / 100).toBe(c.closingCash);
    const aug = cashFlow(lines, '2026-08-01', '2026-08-31');
    expect(aug.openingCash).toBe(52000); // opening balances posted in the period
    expect(aug.investing).toBe(-12000);
  });

  it('shows an account with its running balance', () => {
    const l = accountLedger(lines, '1010', '2026-10-01', '2026-10-31');
    expect(l.opening).toBe(38000);
    expect(l.rows.at(-1)!.balance).toBe(38000 + 214 - 200 - 500);
  });
});

describe('journals', () => {
  it('only posts balanced entries on real accounts', () => {
    expect(checkJournal([{ account: '1500', debit: 100, credit: 0 }, { account: '3000', debit: 0, credit: 100 }]).ok).toBe(true);
    expect(checkJournal([{ account: '1500', debit: 100, credit: 0 }, { account: '3000', debit: 0, credit: 90 }]).error).toMatch(/เท่ากัน/);
    expect(checkJournal([{ account: '1190', debit: 100, credit: 0 }, { account: '3000', debit: 0, credit: 100 }]).error).toMatch(/ระบบ/);
    expect(checkJournal([{ account: '1500', debit: 100, credit: 0 }]).ok).toBe(false);
  });

  it('reverses an entry with a new one', () => {
    const j: JournalEntry = { id: 'j1', number: 'JV-0007', date: '2026-10-01', memo: 'ซื้อเตา', lines: [{ account: '1500', debit: 100, credit: 0 }, { account: '1010', debit: 0, credit: 100 }], createdAt: '' };
    const r = reversalOf(j, [j], '2026-10-02');
    expect(r.number).toBe('JV-0008');
    expect(r.reverses).toBe('j1');
    expect(r.lines).toEqual([{ account: '1500', debit: 0, credit: 100, note: undefined }, { account: '1010', debit: 100, credit: 0, note: undefined }]);
    expect(nextJournalNumber([])).toBe('JV-0001');
  });
});
