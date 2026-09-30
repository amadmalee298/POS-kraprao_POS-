import { describe, expect, it } from 'vitest';
import { auditRecipes, calcRecipeItemCostAndDeduction, convertForIngredient, getAvailableRecipeUnits } from '../recipeUtils';

describe('piece counts (bought by weight, used by the piece)', () => {
  const shrimpKg = { id: 's', name: 'กุ้ง', unit: 'kg', currentStock: 1, minStockAlert: 0, unitCost: 400, category: 'meat', countUnit: 'ตัว', countPerBase: 40 };
  const shrimpG = { ...shrimpKg, unit: 'g', unitCost: 0.4 };
  const eggs = { id: 'e', name: 'ไข่', unit: 'ฟอง', currentStock: 30, minStockAlert: 0, unitCost: 4, category: 'egg', countUnit: 'ฟอง', countPerBase: 16 };

  it('deducts pieces as weight from a kg stock', () => {
    const r = calcRecipeItemCostAndDeduction(shrimpKg, 3, 'ตัว');
    expect(r.stockDeduction).toBeCloseTo(0.075);
    expect(r.lineCost).toBeCloseTo(30);
  });

  it('deducts pieces as grams from a g stock', () => {
    expect(calcRecipeItemCostAndDeduction(shrimpG, 3, 'ตัว').stockDeduction).toBeCloseTo(75);
  });

  it('converts weight into a piece-counted stock (receiving by the kilo)', () => {
    expect(convertForIngredient(1, 'กิโลกรัม', 'ฟอง', eggs)).toBeCloseTo(16);
    expect(convertForIngredient(500, 'g', 'ฟอง', eggs)).toBeCloseTo(8);
  });

  it('still converts plain weights and leaves unknown units unconverted', () => {
    expect(convertForIngredient(500, 'g', 'kg', shrimpKg)).toBeCloseTo(0.5);
    expect(convertForIngredient(1, 'ขวด', 'kg', shrimpKg)).toBeNull();
  });

  it('offers the piece unit in recipes', () => {
    expect(getAvailableRecipeUnits('kg', shrimpKg).map(u => u.val)).toEqual(['kg', 'g', 'ตัว']);
    expect(getAvailableRecipeUnits('kg').map(u => u.val)).toEqual(['kg', 'g']);
  });

  it('reports recipes in a unit the stock cannot convert', () => {
    const noCount = { ...shrimpKg, countUnit: undefined, countPerBase: undefined };
    const menu = [{ id: 'm', name: 'กะเพรากุ้ง', price: 80, category: 'x', recipe: [{ ingredientId: 's', amountNeeded: 3, recipeUnit: 'ตัว' }] }] as any;
    expect(auditRecipes(menu, [], [noCount] as any).some(i => i.kind === 'unit-mismatch')).toBe(true);
    expect(auditRecipes(menu, [], [shrimpKg] as any).some(i => i.kind === 'unit-mismatch')).toBe(false);
  });
});

describe('bottle content (1 ขวด = 1500 ml)', () => {
  const fishSauce = { id: 'f', name: 'น้ำปลา', unit: 'bottle', currentStock: 2, minStockAlert: 0, unitCost: 59, category: 'sauce', countUnit: 'bottle', countPerBase: 1 / 1.5, countBase: 'l' as const };

  it('takes part of a bottle for a recipe in ml', () => {
    const r = calcRecipeItemCostAndDeduction(fishSauce, 15, 'ml');
    expect(r.stockDeduction).toBeCloseTo(0.01);
    expect(r.lineCost).toBeCloseTo(0.59);
  });

  it('treats the unit id and its Thai name as the same unit', () => {
    expect(calcRecipeItemCostAndDeduction(fishSauce, 1, 'ขวด').stockDeduction).toBe(1);
    expect(getAvailableRecipeUnits('bottle', fishSauce).map(u => u.val)).toEqual(['ขวด', 'ml', 'l']);
  });
});
