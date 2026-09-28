import { describe, expect, it } from 'vitest';
import type { AddOnOption, Ingredient, IssueUnit, MenuItem } from '../../types';
import { issueUnitLines } from '../issueUnits';

const ing = (id: string, unit: string): Ingredient => ({ id, name: id, unit, currentStock: 10, minStockAlert: 0, unitCost: 1, category: 'dry_good' });
const ingredients = [ing('rice', 'kg'), ing('box', 'pcs'), ing('egg', 'pcs')];
const menu = { id: 'm1', name: 'ข้าวสวย', recipe: [{ ingredientId: 'rice', amountNeeded: 150, recipeUnit: 'g' }] } as unknown as MenuItem;
const addOn: AddOnOption = { id: 'a1', name: 'เพิ่มข้าว', price: 10, recipe: [{ ingredientId: 'rice', amountNeeded: 100, recipeUnit: 'g' }] };

describe('issueUnitLines', () => {
  it('follows a menu recipe in stock units and adds extras', () => {
    const unit: IssueUnit = { id: 'u', name: 'ข้าวสวย', unitLabel: 'กล่อง', source: { kind: 'menu', id: 'm1' }, inputs: [{ ingredientId: 'box', quantity: 1 }] };
    const lines = issueUnitLines(unit, ingredients, [menu], []);
    expect(lines.find(l => l.ingredientId === 'rice')?.quantity).toBeCloseTo(0.15);
    expect(lines.find(l => l.ingredientId === 'box')).toMatchObject({ quantity: 1, fromRecipe: false });
  });

  it('follows an add-on recipe, and uses the new recipe when it changes', () => {
    const unit: IssueUnit = { id: 'u', name: 'ข้าว', unitLabel: 'กล่อง', source: { kind: 'addon', id: 'a1' }, inputs: [] };
    expect(issueUnitLines(unit, ingredients, [], [addOn])[0].quantity).toBeCloseTo(0.1);
    const changed = { ...addOn, recipe: [{ ingredientId: 'rice', amountNeeded: 120, recipeUnit: 'g' }] };
    expect(issueUnitLines(unit, ingredients, [], [changed])[0].quantity).toBeCloseTo(0.12);
  });

  it('falls back to the extra items when the recipe is gone', () => {
    const unit: IssueUnit = { id: 'u', name: 'x', unitLabel: 'กล่อง', source: { kind: 'menu', id: 'gone' }, inputs: [{ ingredientId: 'egg', quantity: 2 }] };
    expect(issueUnitLines(unit, ingredients, [], [])).toEqual([{ ingredientId: 'egg', quantity: 2, fromRecipe: false }]);
  });
});
