import { describe, expect, it } from 'vitest';
import type { Expense, Order, OtherIncome } from '../../types';
import { buildBalanceSheet, buildCashFlow, buildProfitAndLoss, expenseCost, withLiveStatus } from '../accounting';

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: 'o1',
    orderNumber: 'A1',
    branchId: 'b1',
    status: 'completed',
    paymentStatus: 'paid',
    orderType: 'dine-in',
    createdAt: '2026-09-10T12:00:00',
    grandTotal: 107,
    vatAmount: 7,
    items: [{ menuItem: { id: 'm1', name: 'กะเพรา', price: 107, costPrice: 40 }, quantity: 1, totalPrice: 107 } as any],
    ...over
  }) as Order;

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  branchId: 'b1',
  date: '2026-09-11',
  category: 'utilities',
  title: 'ค่าไฟ',
  amount: 107,
  includeVat: true,
  vatAmount: 7,
  netAmount: 100,
  ...over
});

const income = (over: Partial<OtherIncome> = {}): OtherIncome => ({
  id: 'i1',
  branchId: 'b1',
  date: '2026-09-12',
  category: 'interest',
  title: 'ดอกเบี้ย',
  amount: 50,
  ...over
});

const september = { branchId: 'b1', inPeriod: (d: string) => d.startsWith('2026-09') };

describe('profit and loss', () => {
  it('keeps VAT out of sales and out of claimable expenses', () => {
    const pl = buildProfitAndLoss({ orders: [order()], expenses: [expense()], incomes: [] }, september, true);
    expect(pl.salesRevenue).toBe(100);
    expect(pl.cogs).toBe(40);
    expect(pl.grossProfit).toBe(60);
    expect(pl.expenses.utilities).toBe(100);
    expect(pl.profitBeforeTax).toBe(-40);
    expect(pl.vatPayable).toBe(0);
  });

  it('charges the whole bill when the shop is not VAT-registered', () => {
    expect(expenseCost(expense(), false)).toBe(107);
    const pl = buildProfitAndLoss({ orders: [], expenses: [expense()], incomes: [] }, september, false);
    expect(pl.inputVat).toBe(0);
  });

  it('shows other income below operating profit, not in gross profit', () => {
    const pl = buildProfitAndLoss({ orders: [order()], expenses: [], incomes: [income()] }, september, true);
    expect(pl.grossProfit).toBe(60);
    expect(pl.operatingProfit).toBe(60);
    expect(pl.otherIncome).toBe(50);
    expect(pl.profitBeforeTax).toBe(110);
  });

  it('counts catering as sales and ingredient purchases as stock, not expense', () => {
    const pl = buildProfitAndLoss(
      { orders: [], expenses: [expense({ category: 'raw_material', amount: 500, includeVat: false, vatAmount: 0, netAmount: 500 })], incomes: [income({ category: 'catering', amount: 300 })] },
      september,
      true
    );
    expect(pl.cateringSales).toBe(300);
    expect(pl.salesRevenue).toBe(300);
    expect(pl.sga).toBe(0);
    expect(pl.expenses.raw_material).toBe(500);
  });

  it('flags cost estimated from the menu price', () => {
    const noCost = order({ items: [{ menuItem: { id: 'm2', name: 'ผัด', price: 100 }, quantity: 2, totalPrice: 200 } as any] });
    const pl = buildProfitAndLoss({ orders: [noCost], expenses: [], incomes: [] }, september, true);
    expect(pl.cogs).toBe(80);
    expect(pl.estimatedCogs).toBe(80);
  });

  it('leaves out unpaid, cancelled, other-branch and other-month records', () => {
    const pl = buildProfitAndLoss(
      {
        orders: [
          order({ status: 'cancelled' }),
          order({ paymentStatus: 'unpaid' } as any),
          order({ branchId: 'b2' }),
          order({ createdAt: '2026-08-31T23:00:00' })
        ],
        expenses: [expense({ date: '2026-10-01' })],
        incomes: [income({ branchId: 'b2' })]
      },
      september,
      true
    );
    expect(pl.totalIncome).toBe(0);
    expect(pl.sga).toBe(0);
  });
});

describe('balance sheet', () => {
  it('balances when assets equal liabilities plus equity', () => {
    const bs = buildBalanceSheet({ cash: 1000, receivables: 0, inventory: 500, equipment: 0, payables: 300, vatPayable: 200, ownerCapital: 800, retainedEarnings: 200 });
    expect(bs.totalAssets).toBe(1500);
    expect(bs.totalLiabilities).toBe(500);
    expect(bs.balanced).toBe(true);
    expect(bs.currentRatio).toBe(3);
  });

  it('reports the difference instead of claiming balance', () => {
    const bs = buildBalanceSheet({ cash: 1000, receivables: 0, inventory: 0, equipment: 0, payables: 0, vatPayable: 0, ownerCapital: 0, retainedEarnings: 400 });
    expect(bs.balanced).toBe(false);
    expect(bs.unreconciled).toBe(600);
    expect(bs.currentRatio).toBeNull();
  });
});

describe('cash flow', () => {
  it('uses cash paid, including ingredient purchases and VAT', () => {
    const cf = buildCashFlow(
      {
        orders: [order()],
        expenses: [expense(), expense({ id: 'e2', category: 'raw_material', amount: 30, includeVat: false, vatAmount: 0, netAmount: 30 })],
        incomes: [income()],
        receivables: [{ branchId: 'b1', payments: [{ date: '2026-09-15', amount: 20 }, { date: '2026-08-01', amount: 999 }] }],
        payables: [],
        entries: [
          { branchId: 'b1', date: '2026-09-02', activityType: 'investing', flowType: 'outflow', amount: 100 },
          { branchId: 'b1', date: '2026-09-03', activityType: 'financing', flowType: 'inflow', amount: 1000 }
        ]
      },
      september
    );
    expect(cf.operating).toBe(107 + 50 + 20 - 107 - 30);
    expect(cf.investing).toBe(-100);
    expect(cf.financing).toBe(1000);
    expect(cf.netChange).toBe(40 - 100 + 1000);
    expect(cf.freeCashFlow).toBe(-60);
  });
});

describe('receivable status', () => {
  const base = { remainingAmount: 100, paidAmount: 0, dueDate: '2026-09-20', status: 'unpaid' as const };
  it('turns overdue after the due date and paid when settled', () => {
    expect(withLiveStatus(base, '2026-09-19').status).toBe('unpaid');
    expect(withLiveStatus(base, '2026-09-21').status).toBe('overdue');
    expect(withLiveStatus({ ...base, paidAmount: 40, remainingAmount: 60 }, '2026-09-19').status).toBe('partial');
    expect(withLiveStatus({ ...base, paidAmount: 100, remainingAmount: 0 }, '2026-09-21').status).toBe('paid');
  });
});
