import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../../types';
import { stockTypeOf, stockValueByType } from '../stockTypes';

const ing = (over: Partial<Ingredient>): Ingredient =>
  ({ id: 'x', name: 'x', unit: 'kg', currentStock: 1, minStockAlert: 0, unitCost: 10, category: 'meat', ...over }) as Ingredient;

describe('stock types', () => {
  it('follows the category unless set', () => {
    expect(stockTypeOf(ing({ category: 'meat' }))).toBe('inventory');
    expect(stockTypeOf(ing({ category: 'packaging' }))).toBe('inventory');
    expect(stockTypeOf(ing({ category: 'supplies' }))).toBe('supplies');
    expect(stockTypeOf(ing({ category: 'equipment' }))).toBe('equipment');
    expect(stockTypeOf(ing({ category: 'supplies', stockType: 'equipment' }))).toBe('equipment');
  });

  it('values each kind separately', () => {
    const v = stockValueByType([ing({ currentStock: 2 }), ing({ category: 'supplies', currentStock: 3 }), ing({ category: 'equipment' })]);
    expect(v.inventory).toEqual({ value: 20, items: 1 });
    expect(v.supplies).toEqual({ value: 30, items: 1 });
    expect(v.equipment).toEqual({ value: 10, items: 1 });
  });
});
