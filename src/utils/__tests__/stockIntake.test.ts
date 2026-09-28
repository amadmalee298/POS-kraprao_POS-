import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../../types';
import { buildIntakeRows, matchIngredient, parseItemsFromText, quantityInName } from '../stockIntake';

const ing = (id: string, name: string, unit: string, unitCost = 0): Ingredient =>
  ({ id, name, unit, unitCost, currentStock: 0, minStockAlert: 0, category: 'meat' }) as Ingredient;

const shop = [ing('shrimp', 'กุ้งสด', 'kg', 300), ing('squid', 'ปลาหมึก', 'kg', 200), ing('pork', 'หมูสับ', 'g', 0.15), ing('oil', 'น้ำมันพืช', 'ขวด', 50)];

describe('stock from a bill', () => {
  it('reads items typed in the caption', () => {
    expect(parseItemsFromText('รายจ่าย กุ้ง 3กก ปลาหมึก 2กก')).toEqual([
      { name: 'กุ้ง', quantity: 3, unit: 'kg' },
      { name: 'ปลาหมึก', quantity: 2, unit: 'kg' }
    ]);
    expect(parseItemsFromText('ซื้อหมูสับ 1.5 กิโล, น้ำมันพืช 2 ขวด')).toEqual([
      { name: 'หมูสับ', quantity: 1.5, unit: 'kg' },
      { name: 'น้ำมันพืช', quantity: 2, unit: 'ขวด' }
    ]);
  });

  it('finds quantities written inside a line name', () => {
    expect(quantityInName('หมูสับ CP 5 กก.')).toMatchObject({ quantity: 5, unit: 'kg', name: 'หมูสับ CP' });
  });

  it('matches shop ingredients loosely', () => {
    expect(matchIngredient('กุ้ง', shop)?.id).toBe('shrimp');
    expect(matchIngredient('ปลาหมึกสด', shop)?.id).toBe('squid');
    expect(matchIngredient('ผักชี', shop)).toBeNull();
  });

  it('converts units and shares the bill by value', () => {
    const rows = buildIntakeRows(parseItemsFromText('กุ้ง 3กก ปลาหมึก 2กก'), shop, 1060);
    expect(rows.map(r => [r.ingredientId, r.quantity, r.selected])).toEqual([
      ['shrimp', 3, true],
      ['squid', 2, true]
    ]);
    // 3×300 : 2×200 = 900 : 400
    expect(rows[0].cost).toBeCloseTo(733.85, 1);
    expect(rows[0].cost + rows[1].cost).toBeCloseTo(1060, 1);

    const pork = buildIntakeRows([{ name: 'หมูสับ', quantity: 2, unit: 'kg' }], shop, 300);
    expect(pork[0]).toMatchObject({ ingredientId: 'pork', quantity: 2000, cost: 300, unitMismatch: false });
  });

  it('keeps line amounts from the bill and flags units that do not convert', () => {
    const rows = buildIntakeRows([{ name: 'น้ำมันพืช 5 ลิตร', amount: 250 }, { name: 'ผักชี', quantity: 1, amount: 20 }], shop, 270);
    expect(rows[0]).toMatchObject({ ingredientId: 'oil', cost: 250, unitMismatch: true });
    expect(rows[1]).toMatchObject({ ingredientId: '', selected: false, cost: 0 });
  });
});

describe('Thai spelling variants', () => {
  it('matches กุ้ง typed with the tone mark before the vowel', () => {
    const typedOtherOrder = 'กุ้ง';
    expect(matchIngredient(typedOtherOrder, shop)?.id).toBe('shrimp');
    expect(matchIngredient('กุง', [ing('s2', 'กุ้งแม่น้ำแกะเปลือก', 'g')])?.id).toBe('s2');
  });
});

describe('frozen label', () => {
  it('ignores แช่แข็ง when matching', () => {
    expect(matchIngredient('กุ้งแช่แข็ง', [ing('x', 'กุ้ง', 'kg')])?.id).toBe('x');
  });
});

describe('new ingredients on a bill', () => {
  it('shares the cost equally when an item has no known cost yet', async () => {
    const { allocateCosts } = await import('../stockIntake');
    const rows = allocateCosts(
      [
        { key: 'a', label: 'กุ้ง', ingredientId: 'shrimp', quantity: 3, cost: 0, unitMismatch: false, selected: true },
        { key: 'b', label: 'หอยแมลงภู่', ingredientId: '', newIngredient: { name: 'หอยแมลงภู่', unit: 'kg', category: 'seafood' }, quantity: 2, cost: 0, unitMismatch: false, selected: true }
      ],
      shop,
      1000
    );
    expect(rows.map(r => r.cost)).toEqual([500, 500]);
  });
});
