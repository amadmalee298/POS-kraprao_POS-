import { describe, expect, it } from 'vitest';
import type { Ingredient, PrepRecipe } from '../../types';
import { averageCostAfterPrep, planPrep, prepEstimatedCosts, yieldPercent } from '../prep';
import { convertForIngredient, effectiveUnitCost, getAvailableRecipeUnits, packageSizeFromName } from '../recipeUtils';

const ing = (id: string, name: string, unit: string, currentStock: number, unitCost: number): Ingredient =>
  ({ id, name, unit, currentStock, unitCost, minStockAlert: 0, category: 'meat' }) as Ingredient;

const shop = [
  ing('beef', 'เนื้อวัวบด', 'g', 5000, 0.3),
  ing('oil', 'น้ำมันพืช', 'ml', 2000, 0.05),
  ing('cooked', 'เนื้อบดปรุงสุก', 'g', 0, 0)
];

const recipe: PrepRecipe = {
  id: 'r1',
  outputIngredientId: 'cooked',
  outputQty: 800,
  inputs: [
    { ingredientId: 'beef', quantity: 1000 },
    { ingredientId: 'oil', quantity: 40 }
  ]
};

describe('kitchen prep', () => {
  it('scales inputs by batches and prices the output from what went in', () => {
    const plan = planPrep(recipe, 2, shop);
    expect(plan.lines.map(l => [l.ingredientId, l.quantity, l.cost])).toEqual([
      ['beef', 2000, 600],
      ['oil', 80, 4]
    ]);
    expect(plan.expectedQty).toBe(1600);
    expect(plan.cost).toBe(604);
    expect(plan.unitCost).toBe(0.3775);
    expect(plan.hasShortage).toBe(false);
  });

  it('shows what is missing', () => {
    const plan = planPrep(recipe, 6, shop);
    expect(plan.hasShortage).toBe(true);
    expect(plan.lines[0].short).toBe(1000);
  });

  it('flags recipe lines whose ingredient was deleted', () => {
    const plan = planPrep({ ...recipe, inputs: [...recipe.inputs, { ingredientId: 'gone', quantity: 1 }] }, 1, shop);
    expect(plan.missingIngredients).toEqual(['gone']);
  });

  it('averages the cost with what is already in stock', () => {
    expect(averageCostAfterPrep({ currentStock: 0, unitCost: 0, unit: 'g' }, 800, 302)).toBe(0.3775);
    expect(averageCostAfterPrep({ currentStock: 200, unitCost: 0.5, unit: 'g' }, 800, 302)).toBe(0.402);
  });

  it('reports the yield against the recipe', () => {
    expect(yieldPercent(760, 800)).toBe(95);
  });
});

describe('prep units and costs', () => {
  const sauce = { ...ing('fish', 'ทิพรส น้ำปลาแท้ ขวดเพ็ท 1.5 ล.', 'ขวด', 4, 59), countUnit: 'ml' } as Ingredient;

  it('converts an input written in another unit into the stock unit', () => {
    const r: PrepRecipe = { id: 'r', outputIngredientId: 'cooked', outputQty: 1000, inputs: [{ ingredientId: 'beef', quantity: 1, unit: 'kg' }] };
    const [line] = planPrep(r, 1, shop).lines;
    expect(line).toMatchObject({ quantity: 1000, recipeQty: 1, recipeUnit: 'kg', cost: 300 });
  });

  it('flags a large count of bottles or bags as a probable unit mistake', () => {
    const r: PrepRecipe = { id: 'r', outputIngredientId: 'cooked', outputQty: 1, inputs: [{ ingredientId: 'fish', quantity: 1500 }] };
    expect(planPrep(r, 1, [sauce, ...shop]).lines[0].unitDoubt).toBe(true);
    expect(planPrep({ ...r, inputs: [{ ingredientId: 'fish', quantity: 1 }] }, 1, [sauce, ...shop]).lines[0].unitDoubt).toBe(false);
  });

  it('prices made items not in stock from their recipe, and leaves stocked ones alone', () => {
    expect(prepEstimatedCosts([recipe], shop).get('cooked')).toBe(0.3775);
    const stocked = shop.map(i => (i.id === 'cooked' ? { ...i, currentStock: 500 } : i));
    expect(prepEstimatedCosts([recipe], stocked).has('cooked')).toBe(false);
  });

  it('reads a bag price typed as a per-gram price as the price of the bag in the name', () => {
    expect(packageSizeFromName('ตราฉัตร ข้าวหอมผสม 70%:30% 5 กก.', 'g')).toBe(5000);
    expect(packageSizeFromName('น้ำปลา ขวดเพ็ท 1.5 ล.', 'ml')).toBe(1500);
    expect(packageSizeFromName('ข้าวหอม', 'g')).toBe(0);
    expect(effectiveUnitCost(ing('rice', 'ตราฉัตร ข้าวหอมผสม 5 กก.', 'g', 0, 137))).toBeCloseTo(0.0274);
    expect(effectiveUnitCost(ing('rice', 'ข้าวสาร', 'g', 0, 137))).toBeCloseTo(0.137);
    expect(effectiveUnitCost(ing('rice', 'ข้าวสาร', 'g', 0, 0.03))).toBe(0.03);
  });
});

describe('bottles and bags sized in their name', () => {
  const fish = ing('fish', 'ทิพรส น้ำปลาแท้ ขวดเพ็ท 1.5 ล.', 'ขวด', 4, 59);

  it('lets a recipe use ml of a sauce counted in bottles', () => {
    expect(getAvailableRecipeUnits(fish.unit, fish).map(u => u.val)).toEqual(['ขวด', 'ml', 'l']);
    expect(convertForIngredient(750, 'ml', 'ขวด', fish)).toBe(0.5);
    expect(convertForIngredient(2, 'ขวด', 'l', fish)).toBe(3);
    expect(convertForIngredient(1, 'g', 'ขวด', fish)).toBeNull();
  });

  it('prices 1,500 ml of it as one bottle', () => {
    const r: PrepRecipe = { id: 'r', outputIngredientId: 'cooked', outputQty: 1, inputs: [{ ingredientId: 'fish', quantity: 1500, unit: 'ml' }] };
    const [line] = planPrep(r, 1, [fish, ...shop]).lines;
    expect(line).toMatchObject({ quantity: 1, cost: 59, unitDoubt: false });
  });
});
