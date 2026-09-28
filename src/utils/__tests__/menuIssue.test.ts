import { describe, expect, it } from 'vitest';
import type { Ingredient, MenuItem } from '../../types';
import { menuIssueDeductions } from '../menuIssue';

const ing = (id: string, unit: string): Ingredient => ({ id, name: id, unit, currentStock: 10, minStockAlert: 0, unitCost: 1, category: 'meat' });
const ingredients = [ing('rice', 'kg'), ing('pork', 'kg'), ing('chicken', 'kg'), ing('box', 'pcs')];
const kaprao = {
  id: 'm1',
  name: 'กะเพรา',
  recipe: [
    { ingredientId: 'rice', amountNeeded: 150, recipeUnit: 'g' },
    { ingredientId: 'pork', amountNeeded: 100, recipeUnit: 'g' }
  ],
  availableProteins: [{ name: 'ไก่', extraPrice: 0, recipe: [{ ingredientId: 'chicken', amountNeeded: 100, recipeUnit: 'g' }], replacesIngredientIds: ['pork'] }]
} as unknown as MenuItem;

describe('menuIssueDeductions', () => {
  it('takes the whole menu recipe per box, plus a container per box', () => {
    const d = menuIssueDeductions([{ menuItemId: 'm1', boxes: 3 }], [kaprao], ingredients, 'box');
    expect(d.get('rice')).toBeCloseTo(0.45);
    expect(d.get('pork')).toBeCloseTo(0.3);
    expect(d.get('box')).toBe(3);
  });

  it('follows the protein choice like a sale', () => {
    const d = menuIssueDeductions([{ menuItemId: 'm1', protein: 'ไก่', boxes: 2 }], [kaprao], ingredients);
    expect(d.get('chicken')).toBeCloseTo(0.2);
    expect(d.has('pork')).toBe(false);
    expect(d.get('rice')).toBeCloseTo(0.3);
  });

  it('adds rows of several menus together and skips unknown menus', () => {
    const d = menuIssueDeductions([{ menuItemId: 'm1', boxes: 1 }, { menuItemId: 'gone', boxes: 5 }, { menuItemId: 'm1', boxes: 1 }], [kaprao], ingredients, 'box');
    expect(d.get('rice')).toBeCloseTo(0.3);
    expect(d.get('box')).toBe(2);
  });
});
