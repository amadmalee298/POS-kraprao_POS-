import { describe, it, expect } from 'vitest';
import {
  auditRecipes,
  calcRecipeItemCostAndDeduction,
  cartItemUnitCost,
  convertAmount,
  recipeForProtein,
  withRecipeCosts,
  withRecipeUnits
} from '../recipeUtils';
import { computeSaleStockDeductions } from '../orderUtils';
import type { CartItem, Ingredient, MenuItem } from '../../types';

const ing = (id: string, unit: string, unitCost: number, extra: Partial<Ingredient> = {}): Ingredient =>
  ({ id, name: id, unit, unitCost, currentStock: 10000, minStockAlert: 0, category: 'meat', ...extra }) as Ingredient;

const ingredients = [
  ing('minced', 'g', 0.18),
  ing('crispy', 'g', 0.38),
  ing('rice', 'kg', 40),
  ing('fishsauce', 'ml', 150, { packageSize: 700 }),
  ing('oil', 'ลิตร', 50)
];

const kaprao: MenuItem = {
  id: 'm1',
  name: 'กะเพราหมูสับ',
  nameEn: '',
  category: 'kaprao',
  price: 50,
  costPrice: 0,
  description: '',
  image: '',
  recipe: [
    { ingredientId: 'minced', amountNeeded: 150, recipeUnit: 'g' },
    { ingredientId: 'rice', amountNeeded: 180, recipeUnit: 'g' }
  ],
  availableProteins: [
    { name: 'หมูสับ', extraPrice: 0 },
    { name: 'หมูกรอบ', extraPrice: 20, recipe: [{ ingredientId: 'crispy', amountNeeded: 140, recipeUnit: 'g' }], replacesIngredientIds: ['minced'] }
  ]
};

const line = (protein: string, qty = 1): CartItem =>
  ({ cartItemId: 'c', menuItem: kaprao, quantity: qty, proteinChoice: { name: protein, extraPrice: 0 }, selectedAddOns: [], unitPrice: 50, totalPrice: 50 * qty }) as CartItem;

describe('units', () => {
  it('converts Thai unit names too', () => {
    expect(convertAmount(0.15, 'กิโลกรัม', 'g')).toBeCloseTo(150);
    expect(convertAmount(500, 'มล.', 'ลิตร')).toBeCloseTo(0.5);
    expect(convertAmount(1, 'g', 'ml')).toBeNull();
  });

  it('deducts in the ingredient stock unit', () => {
    expect(calcRecipeItemCostAndDeduction(ingredients[4], 20, 'ml').stockDeduction).toBeCloseTo(0.02);
    expect(calcRecipeItemCostAndDeduction(ingredients[2], 180, 'g').lineCost).toBeCloseTo(7.2);
  });

  it('reads a bottle price typed as a per-ml price without jumping above 500 ml', () => {
    const fish = ingredients[3]; // ฿150 per 700 ml bottle
    expect(calcRecipeItemCostAndDeduction(fish, 10, 'ml').lineCost).toBeCloseTo((150 / 700) * 10);
    expect(calcRecipeItemCostAndDeduction(fish, 600, 'ml').lineCost).toBeCloseTo((150 / 700) * 600);
  });

  it('stamps the ingredient unit on recipe lines that have none', () => {
    expect(withRecipeUnits([{ ingredientId: 'rice', amountNeeded: 0.18 }], ingredients)[0].recipeUnit).toBe('kg');
  });
});

describe('protein choice', () => {
  it('uses the chosen protein instead of the one it replaces', () => {
    const d = computeSaleStockDeductions([line('หมูกรอบ', 2)], ingredients);
    expect(d.get('crispy')).toBeCloseTo(280);
    expect(d.has('minced')).toBe(false);
    expect(d.get('rice')).toBeCloseTo(0.36);
  });

  it('keeps the base recipe for the default protein', () => {
    const d = computeSaleStockDeductions([line('หมูสับ')], ingredients);
    expect(d.get('minced')).toBeCloseTo(150);
    expect(d.has('crispy')).toBe(false);
    expect(recipeForProtein(kaprao, 'ไม่มี')).toEqual(kaprao.recipe);
  });

  it('costs the dish with the chosen protein', () => {
    const costed = withRecipeCosts(kaprao, ingredients);
    expect(costed.costPrice).toBeCloseTo(150 * 0.18 + 7.2);
    expect(costed.availableProteins![1].costDelta).toBeCloseTo(140 * 0.38 - 150 * 0.18);
    const sold = { ...line('หมูกรอบ'), menuItem: costed };
    expect(cartItemUnitCost(sold)).toBeCloseTo(140 * 0.38 + 7.2);
  });
});

describe('recipe audit', () => {
  it('flags menus without recipe, deleted ingredients, package prices and unlinked proteins', () => {
    const noRecipe = { ...kaprao, id: 'm2', name: 'ใหม่', recipe: [], availableProteins: undefined };
    const broken = { ...kaprao, id: 'm3', name: 'เสีย', recipe: [{ ingredientId: 'gone', amountNeeded: 1 }], availableProteins: [{ name: 'หมู', extraPrice: 0 }, { name: 'ไก่', extraPrice: 0 }] };
    const kinds = auditRecipes([kaprao, noRecipe, broken], [], ingredients).map(i => i.kind).sort();
    expect(kinds).toEqual(['missing-ingredient', 'no-recipe', 'package-price', 'protein-no-recipe']);
  });
});

describe('merging duplicate ingredients', () => {
  it('suggests same-thing ingredients with compatible units', async () => {
    const { suggestDuplicateIngredients } = await import('../recipeUtils');
    const list = [ing('a', 'ml', 0.2, { name: 'น้ำปลาแท้' }), ing('b', 'l', 60, { name: 'ทิพรส น้ำปลาแท้ 1.5 ล.' }), ing('c', 'pcs', 4, { name: 'ไข่ไก่' })];
    const pairs = suggestDuplicateIngredients(list);
    expect(pairs.map(([keep, dup]) => [keep.id, dup.id])).toEqual([['a', 'b']]);
  });

  it('moves recipe lines to the kept ingredient and adds into an existing line', async () => {
    const { repointRecipe } = await import('../recipeUtils');
    const from = ing('b', 'l', 60);
    const to = ing('a', 'ml', 0.2);
    expect(repointRecipe([{ ingredientId: 'b', amountNeeded: 0.02 }], from, to)).toEqual([{ ingredientId: 'a', amountNeeded: 0.02, recipeUnit: 'l' }]);
    expect(
      repointRecipe([{ ingredientId: 'a', amountNeeded: 10, recipeUnit: 'ml' }, { ingredientId: 'b', amountNeeded: 0.02, recipeUnit: 'l' }], from, to)
    ).toEqual([{ ingredientId: 'a', amountNeeded: 30, recipeUnit: 'ml' }]);
  });
});
