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

describe('stock type from the name', () => {
  it('tells equipment and supplies apart from ingredients and packaging', async () => {
    const { guessStockType, misfiledStock } = await import('../stockTypes');
    expect(guessStockType('ถังฉนวนสแตนเลส 304 หนาพิเศษ หุ้มฉนวน')).toBe('equipment');
    expect(guessStockType('กระทะเหล็ก 14 นิ้ว')).toBe('equipment');
    expect(guessStockType('ถุงมือยาง')).toBe('supplies');
    expect(guessStockType('น้ำยาล้างจาน')).toBe('supplies');
    // Ingredients and packaging sold with the food stay where they are
    expect(guessStockType('อองุ่น น้ำมันถั่วเหลือง 1 ล. x 3')).toBeNull();
    expect(guessStockType('ARO ถุงหูหิ้ว TAPE 6X14"')).toBeNull();
    expect(guessStockType('เติมทิพ ผงปรุงรสอาหาร รสไก่ 400 ก.')).toBeNull();
    const ings: any[] = [
      { id: 'a', name: 'ถังฉนวนสแตนเลส', stockType: 'inventory' },
      { id: 'b', name: 'กระทะ', stockType: 'equipment' },
      { id: 'c', name: 'มีดเก่า', stockType: 'inventory', stockTypeConfirmed: true },
      { id: 'd', name: 'ไก่บด' }
    ];
    expect(misfiledStock(ings).map(x => [x.ing.id, x.to])).toEqual([['a', 'equipment']]);
  });
});
