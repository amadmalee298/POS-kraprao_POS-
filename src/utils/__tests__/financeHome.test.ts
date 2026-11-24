import { describe, expect, it } from 'vitest';
import { expenseLots, expenseTrace, journalNumber, orderTrace } from '../billTrace';
import { closeDayChecks, closeDayMessage, dayOverview, dayTodos, type DayInput } from '../dayCheck';
import { buildVatReport, pp30Boxes } from '../vatReport';

const ing = (id: string, name: string, unit: string, unitCost: number, currentStock: number, minStockAlert = 0): any => ({ id, name, unit, unitCost, currentStock, minStockAlert, category: 'meat' });
const ingredients = [ing('chk', 'ไก่สับ', 'kg', 120, 2.76, 1), ing('leaf', 'ใบกะเพรา', 'kg', 80, 0.3, 0.5)];
const menu: any = { id: 'm1', name: 'กะเพราไก่', price: 60, costPrice: 25, recipe: [{ ingredientId: 'chk', amountNeeded: 0.12, recipeUnit: 'kg' }, { ingredientId: 'leaf', amountNeeded: 0.02, recipeUnit: 'kg' }] };
const order = (over: any = {}): any => ({
  id: 'o1', orderNumber: '#KAP-015-X7', branchId: 'b', status: 'served', paymentStatus: 'paid', paymentMethod: 'promptpay',
  createdAt: '2026-11-24T05:41:00Z', grandTotal: 128.4, vatAmount: 8.4, subtotal: 120, discountAmount: 0,
  items: [{ id: 'i', cartItemId: 'c', menuItem: menu, quantity: 2, selectedAddOns: [], unitPrice: 60, totalPrice: 120 }], ...over
});

describe('bill trace', () => {
  it('shows the stock a sale used, its balanced journal and its output VAT', () => {
    const t = orderTrace(order(), { ingredients, vatRegistered: true });
    expect(t.journalNo).toBe('JE-KAP-015-X7');
    expect(t.stock.find(s => s.ingredientId === 'chk')?.amount).toBeCloseTo(-0.24);
    expect(t.balanced).toBe(true);
    expect(t.entries.map(e => e.account)).toEqual(expect.arrayContaining(['1010', '4000', '2200', '5000', '1200']));
    expect(t.vat).toEqual({ box: 5, amount: 8.4, month: '2026-11' });
    expect(t.grossProfit).toBe(70);
    expect(t.grossMargin).toBe(58);
    expect(orderTrace(order(), { ingredients, vatRegistered: false }).vat).toBeNull();
  });

  it('finds the stock an expense received and its input VAT', () => {
    const e: any = { id: 'e1', title: 'ซื้อไก่ CP', date: '2026-11-24', category: 'raw_material', amount: 107, includeVat: true, vatAmount: 7, netAmount: 100, refNumber: 'INV-9' };
    const lots: any[] = [
      { id: 'l1', ingredientId: 'chk', quantity: 1, expenseId: 'e1', receivedDate: '2026-11-24', notes: '' },
      { id: 'l2', ingredientId: 'leaf', quantity: 0.5, receivedDate: '2026-11-24', notes: 'เพิ่มจากบันทึกค่าใช้จ่าย: ซื้อไก่ CP' },
      { id: 'l3', ingredientId: 'leaf', quantity: 9, receivedDate: '2026-11-23', notes: 'เพิ่มจากบันทึกค่าใช้จ่าย: ซื้อไก่ CP' }
    ];
    expect(expenseLots(e, lots).map(l => l.id)).toEqual(['l1', 'l2']);
    const t = expenseTrace(e, { ingredients, stockLots: lots, vatRegistered: true });
    expect(t.journalNo).toBe('JE-INV-9');
    expect(t.balanced).toBe(true);
    expect(t.vat?.box).toBe(7);
    expect(t.vat?.amount).toBe(7);
    expect(journalNumber('')).toBe('JE-NA');
  });
});

const day = '2026-11-24';
const base = (over: Partial<DayInput> = {}): DayInput => ({
  day, branchId: 'b', orders: [order(), order({ id: 'o2', orderNumber: '#KAP-016-AA', paymentMethod: 'cash', createdAt: '2026-11-24T06:00:00Z' }), order({ id: 'old', createdAt: '2026-11-20T06:00:00Z' })],
  expenses: [{ id: 'e1', branchId: 'b', title: 'ค่าแก๊ส', date: day, category: 'utilities', amount: 300 } as any],
  ingredients, menuItems: [menu, { id: 'm2', name: 'ไข่ดาว', price: 10 } as any], addOns: [], cashShifts: [], inbox: [], vatRegistered: false, ...over
});

describe('finance home and the day close', () => {
  it('sums only today', () => {
    const o = dayOverview(base());
    expect(o.sales.count).toBe(2);
    expect(o.sales.total).toBe(256.8);
    expect(o.sales.cash).toBe(128.4);
    expect(o.stockUsed).toBe(2);
    expect(o.lowStock.map(i => i.id)).toEqual(['leaf']);
    expect(o.expenses).toBe(300);
    expect(o.balanced).toBe(true);
  });

  it('lists only what needs a person', () => {
    const todos = dayTodos(base({ inbox: [{ id: 'r', status: 'pending', data: { amount: 540 } } as any], cashShifts: [{ id: 's', shiftNumber: 'SHIFT-1', branchId: 'b', status: 'open', openedAt: '2026-11-23T02:00:00Z' } as any] }));
    expect(todos.map(t => t.kind).sort()).toEqual(['drawer', 'evidence', 'recipe', 'telegram']);
    expect(dayTodos({ ...base(), expenses: [], menuItems: [menu] })).toEqual([]);
  });

  it('checks transfers against the bank notices and writes the summary', () => {
    const b = base();
    const o = dayOverview(b);
    const payIns: any[] = [{ id: 'p1', amount: 128.4, at: '2026-11-24T05:41:30Z', text: '', claimedBy: '#KAP-015-X7' }];
    const checks = closeDayChecks(b, o, payIns);
    expect(checks.find(c => c.label.startsWith('ยอดโอน'))).toMatchObject({ ok: true, detail: '1/1 บิลมีเงินเข้า' });
    const loose = closeDayChecks(b, o, [...payIns, { id: 'p2', amount: 50, at: '2026-11-24T07:00:00Z', text: '' }]);
    expect(loose.find(c => c.label.startsWith('ยอดโอน'))?.ok).toBe(false);
    expect(closeDayChecks(b, o, null).find(c => c.label.startsWith('ยอดโอน'))?.ok).toBeNull();
    const msg = closeDayMessage(day, o, checks, dayTodos(b), 'อาห์มัด', 'ครัวกะเพรา');
    expect(msg).toContain('ปิดวัน');
    expect(msg).toContain('2 บิล');
    expect(msg).toContain('ควรซื้อ: ใบกะเพรา');
  });

  it('puts the month into the boxes of ภ.พ.30', () => {
    const r = buildVatReport({ orders: [order()], expenses: [{ id: 'x', date: '2026-11-03', category: 'raw_material', amount: 107, includeVat: true, vatAmount: 7, netAmount: 100 } as any] }, '2026-11', 'all');
    const boxes = pp30Boxes(r);
    expect(boxes.map(b => b.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(boxes[4].amount).toBe(8.4);
    expect(boxes[6].amount).toBe(7);
    expect(boxes[7].amount).toBe(1.4);
    expect(boxes[8].amount).toBe(0);
  });
});
