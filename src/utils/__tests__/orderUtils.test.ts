import { describe, expect, it } from 'vitest';
import { applyStockDeductions, computeSaleStockDeductions, generateOrderId, generateOrderNumber } from '../orderUtils';
import type { CartItem, Ingredient, Order } from '../../types';

const ing = (id: string, unit: string, stock: number): Ingredient =>
  ({ id, name: id, unit, currentStock: stock, minStockAlert: 0, unitCost: 1, category: 'x' } as unknown as Ingredient);

describe('order ids and numbers', () => {
  it('never repeats ids generated in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateOrderId(1700000000000)));
    expect(ids.size).toBe(1000);
  });

  it('numbers bills per branch per day', () => {
    const today = new Date('2026-09-26T10:00:00');
    const orders = [
      { branchId: 'b1', createdAt: new Date('2026-09-26T09:00:00').toISOString() },
      { branchId: 'b1', createdAt: new Date('2026-09-25T09:00:00').toISOString() },
      { branchId: 'b2', createdAt: new Date('2026-09-26T09:00:00').toISOString() }
    ] as Order[];
    expect(generateOrderNumber(orders, 'b1', today)).toMatch(/^#KAP-002-[A-Z2-9]{2}$/);
  });
});

describe('stock deduction', () => {
  const ingredients = [ing('pork', 'kg', 5), ing('egg', 'pcs', 30)];
  const cart = [
    {
      quantity: 2,
      menuItem: { recipe: [{ ingredientId: 'pork', amountNeeded: 150, recipeUnit: 'g' }] },
      selectedAddOns: [{ name: 'ไข่ดาว', ingredientId: 'egg', ingredientAmount: 1 }]
    }
  ] as unknown as CartItem[];

  it('converts recipe units and multiplies by quantity', () => {
    const deltas = computeSaleStockDeductions(cart, ingredients);
    expect(deltas.get('pork')).toBeCloseTo(0.3);
    expect(deltas.get('egg')).toBe(2);
  });

  it('applies deltas without going negative', () => {
    const updated = applyStockDeductions(ingredients, new Map([['pork', 0.3], ['egg', 100]]));
    expect(updated.find(i => i.id === 'pork')!.currentStock).toBeCloseTo(4.7);
    expect(updated.find(i => i.id === 'egg')!.currentStock).toBe(0);
  });
});

describe('mergeCloudOrders', () => {
  const base = { branchId: 'b1', items: [], grandTotal: 50, orderType: 'takeaway', paymentMethod: 'cash' } as unknown as Order;
  const mk = (id: string, status: string, updatedAt: string, extra: Partial<Order> = {}) =>
    ({ ...base, id, status, createdAt: '2026-09-26T10:00:00Z', updatedAt, ...extra }) as Order;

  it('matches ord- prefixed and plain ids as one order and takes the newer copy', async () => {
    const { mergeCloudOrders } = await import('../orderUtils');
    const r = mergeCloudOrders([mk('ord-1', 'pending', '2026-09-26T10:00:00Z')], [mk('1', 'cooking', '2026-09-26T10:05:00Z')]);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].status).toBe('cooking');
    expect(r.orders[0].id).toBe('ord-1');
  });

  it('never reverts a local served order with an older cloud copy, and asks to push it back', async () => {
    const { mergeCloudOrders } = await import('../orderUtils');
    const local = mk('ord-2', 'served', '2026-09-26T10:10:00Z');
    const r = mergeCloudOrders([local], [mk('ord-2', 'cooking', '2026-09-26T10:05:00Z')]);
    expect(r.orders[0].status).toBe('served');
    expect(r.pushBack).toEqual([local]);
    expect(r.changed).toBe(false);
  });

  it('keeps two different orders that share a bill number', async () => {
    const { mergeCloudOrders } = await import('../orderUtils');
    const r = mergeCloudOrders(
      [mk('ord-a', 'pending', '2026-09-26T10:00:00Z', { orderNumber: '#KAP-001' })],
      [mk('ord-b', 'pending', '2026-09-26T10:01:00Z', { orderNumber: '#KAP-001' })]
    );
    expect(r.orders).toHaveLength(2);
  });

  it('drops orders deleted in the cloud', async () => {
    const { mergeCloudOrders } = await import('../orderUtils');
    const r = mergeCloudOrders([mk('ord-3', 'pending', '2026-09-26T10:00:00Z')], [], ['ord-3']);
    expect(r.orders).toHaveLength(0);
    expect(r.changed).toBe(true);
  });
});
