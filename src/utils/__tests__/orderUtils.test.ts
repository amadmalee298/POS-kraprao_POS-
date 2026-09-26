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
