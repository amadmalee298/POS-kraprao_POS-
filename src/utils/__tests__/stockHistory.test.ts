import { describe, it, expect } from 'vitest';
import { buildStockMovements, forecastInventory, salesUsageByDay, withRunningBalance } from '../stockHistory';
import type { Ingredient, MenuItem, Order, StockAdjustmentLog } from '../../types';

const pork: Ingredient = { id: 'pork', name: 'หมูสับ', unit: 'g', unitCost: 0.2, currentStock: 3000, minStockAlert: 500, category: 'meat' } as Ingredient;
const rice: Ingredient = { id: 'rice', name: 'ข้าว', unit: 'kg', unitCost: 40, currentStock: 10, minStockAlert: 0, category: 'dry' } as Ingredient;
const menu: MenuItem = {
  id: 'm1', name: 'กะเพรา', nameEn: '', category: 'k', price: 50, costPrice: 0, description: '', image: '',
  recipe: [{ ingredientId: 'pork', amountNeeded: 150, recipeUnit: 'g' }, { ingredientId: 'rice', amountNeeded: 180, recipeUnit: 'g' }]
};
const order = (id: string, createdAt: string, qty = 1, status: Order['status'] = 'served'): Order =>
  ({ id, createdAt, status, items: [{ cartItemId: 'c', menuItem: { id: 'm1', name: 'กะเพรา' }, quantity: qty, selectedAddOns: [] }] }) as unknown as Order;

describe('sales usage', () => {
  it('adds up what each day of sales used, from the current recipes, skipping cancelled and unapproved orders', () => {
    const rows = salesUsageByDay(
      [order('a', '2026-09-20T10:00:00', 2), order('b', '2026-09-20T12:00:00'), order('c', '2026-09-20T13:00:00', 1, 'cancelled'), order('d', '2026-09-21T09:00:00', 1, 'pending-qr')],
      [pork, rice],
      [menu],
      []
    );
        // 10:00 and 12:00 are different hours
    const pork10 = rows.find(r => r.ingredientId === 'pork' && r.time.includes('T10'))!;
    expect(pork10).toMatchObject({ day: '2026-09-20', orderCount: 1 });
    expect(pork10.amount).toBeCloseTo(300);
    const porkTotal = rows.filter(r => r.ingredientId === 'pork').reduce((a, r) => a + r.amount, 0);
    expect(porkTotal).toBeCloseTo(450);
    expect(rows.filter(r => r.ingredientId === 'rice').reduce((a, r) => a + r.amount, 0)).toBeCloseTo(0.54);
    expect(rows).toHaveLength(4);
  });
});

describe('stock movements', () => {
  it('merges history and sales, newest first, with balances worked back from today', () => {
    const logs = [
      { id: 'l1', ingredientId: 'pork', ingredientName: 'หมูสับ', previousStock: 0, newStock: 3450, changeQty: 3450, unit: 'g', reason: 'restock', userName: 'A', timestamp: '2026-09-20T08:00:00.000Z' }
    ] as StockAdjustmentLog[];
    const sales = salesUsageByDay([order('a', '2026-09-20T10:00:00.000Z', 3)], [pork, rice], [menu], []);
    const moves = buildStockMovements(logs, sales, [pork, rice]).filter(m => m.ingredientId === 'pork');
    expect(moves.map(m => [m.type, m.change])).toEqual([['OUT', -450], ['IN', 3450]]);
    expect(withRunningBalance(moves, 3000).map(m => m.balance)).toEqual([3000, 3450]);
  });
});

describe('forecast', () => {
  it('uses real daily use and invents nothing for unused ingredients', () => {
    const now = new Date('2026-09-22T12:00:00');
    const orders = [order('a', '2026-09-20T12:00:00', 10), order('b', '2026-09-21T12:00:00', 10)];
    const rows = forecastInventory([pork, rice, { ...rice, id: 'egg', name: 'ไข่', unit: 'pcs', currentStock: 5 } as Ingredient], orders, [menu], [], 3, now);
    const p = rows.find(r => r.ingredientId === 'pork')!;
    expect(p.daysOfData).toBe(2);
    expect(p.dailyUsage).toBeCloseTo(1500);
    expect(p.daysLeft).toBeCloseTo(2);
    expect(p.riskLevel).toBe('CRITICAL');
    expect(p.suggestedOrderQty).toBeCloseTo(1500 * 3 + 500 - 3000);
    const egg = rows.find(r => r.ingredientId === 'egg')!;
    expect(egg.dailyUsage).toBe(0);
    expect(egg.daysLeft).toBeNull();
    expect(egg.suggestedOrderQty).toBe(0);
  });
});
