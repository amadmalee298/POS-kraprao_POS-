import { describe, expect, it } from 'vitest';
import type { Expense, Order } from '../../types';
import { buildVatReport, prevMonthOf, vatDeadlines } from '../vatReport';
import { pp30Figures } from '../govFilings';

const order = (id: string, createdAt: string, grandTotal: number, vatAmount: number, over: Partial<Order> = {}): Order =>
  ({ id, orderNumber: id, branchId: 'b1', items: [], subtotal: grandTotal, discountAmount: 0, vatAmount, grandTotal, paymentMethod: 'cash', status: 'served', createdAt, updatedAt: '', orderType: 'dine-in', ...over }) as Order;
const expense = (id: string, date: string, amount: number, over: Partial<Expense> = {}): Expense => ({
  id,
  branchId: 'b1',
  date,
  category: 'raw_material',
  title: id,
  amount,
  includeVat: false,
  vatAmount: 0,
  netAmount: amount,
  ...over
});

describe('VAT report (ภ.พ.30)', () => {
  const data = {
    orders: [
      order('o1', '2026-09-03T05:00:00.000Z', 535, 35, { withholdingTax: 15 }),
      order('o2', '2026-09-03T08:00:00.000Z', 107, 7),
      order('o3', '2026-09-20T05:00:00.000Z', 214, 14),
      order('o4', '2026-09-21T05:00:00.000Z', 107, 7, { status: 'cancelled' }),
      order('o5', '2026-08-31T18:00:00.000Z', 107, 7) // 1 Sep in Thailand
    ],
    expenses: [
      expense('e1', '2026-09-05', 321, { includeVat: true, vatAmount: 21, netAmount: 300 }),
      expense('e2', '2026-09-06', 500), // no tax invoice
      expense('ads-aug', '2026-08-15', 1000, { vat36: true, category: 'marketing' }),
      expense('ads-sep', '2026-09-15', 2000, { vat36: true, category: 'marketing' })
    ],
    certificates: [
      { id: 'c1', form: 'pnd3', issueDate: '2026-09-10', lines: [{ row: 5, date: '', amount: 1000, tax: 30 }] },
      { id: 'c2', form: 'pnd1a', issueDate: '2026-09-10', lines: [{ row: 1, date: '', amount: 9000, tax: 100 }] }
    ] as any
  };
  const r = buildVatReport(data, '2026-09', 'b1', 7);

  it('sums output VAT by day, with the tax customers withheld', () => {
    expect(r.sales.vat).toBe(63);
    expect(r.sales.base).toBe(900);
    expect(r.sales.count).toBe(4);
    expect(r.sales.days.map(d => [d.date, d.vat, d.party])).toEqual([
      ['2026-09-01', 7, '1 บิล'],
      ['2026-09-03', 42, '2 บิล'],
      ['2026-09-20', 14, '1 บิล']
    ]);
    expect(r.sales.whtDeducted).toBe(15);
  });

  it('counts input VAT only with a tax invoice, and the supplier tax withheld to remit', () => {
    expect(r.purchases.vat).toBe(21);
    expect(r.purchases.base).toBe(300);
    expect(r.purchases.count).toBe(1);
    expect(r.purchases.whtToRemit).toBe(30);
  });

  it('keeps ภ.พ.36 apart and claims last month\'s in this ภ.พ.30', () => {
    expect(r.pp36.vat).toBe(140);
    expect(r.pp36PrevMonth).toBe(70);
    expect(r.payable).toBe(63 - 21 - 70);
    expect(pp30Figures(data.orders, data.expenses, '2026-09', 'b1')).toMatchObject({ pp36Credit: 70, inputVat: 21 });
  });

  it('knows the months and deadlines', () => {
    expect(prevMonthOf('2026-01')).toBe('2025-12');
    expect(vatDeadlines('2026-12')).toEqual({ pp30: '2027-01-15', pp30Online: '2027-01-23', pp36: '2027-01-07', pp36Online: '2027-01-15' });
  });
});
