import { describe, expect, it } from 'vitest';
import type { Ingredient, PrepRecipe } from '../../types';
import { averageCostAfterPrep, planPrep, yieldPercent } from '../prep';

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
