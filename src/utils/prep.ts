import type { Ingredient, PrepRecipe } from '../types';
import { canonicalUnit, convertForIngredient, effectiveUnitCost } from './recipeUtils';

/**
 * Kitchen prep (production): raw ingredients are drawn from stock and cooked into a stocked item.
 * The value moves from the inputs to the output (inventory to inventory), so the output's cost per
 * unit is what went in divided by what came out; a cooking loss makes each unit dearer.
 */

export interface PrepPlanLine {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number; // needed for this run, in the ingredient's stock unit
  /** As written in the recipe (e.g. 1,500 ml of a bottled sauce) */
  recipeQty: number;
  recipeUnit: string;
  /** A counted unit (bottle, bag…) with a large number: probably meant ml or g */
  unitDoubt: boolean;
  inStock: number;
  short: number; // how much is missing (0 = enough)
  cost: number;
}

export interface PrepPlan {
  lines: PrepPlanLine[];
  expectedQty: number;
  cost: number;
  /** Cost per unit of output at the expected yield */
  unitCost: number;
  hasShortage: boolean;
  missingIngredients: string[]; // recipe lines whose ingredient no longer exists
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const MEASURED = ['kg', 'g', 'l', 'ml'];

export function planPrep(recipe: PrepRecipe, batches: number, ingredients: Ingredient[]): PrepPlan {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const n = batches > 0 ? batches : 0;
  const missingIngredients: string[] = [];
  const lines: PrepPlanLine[] = [];
  recipe.inputs.forEach(inp => {
    const ing = byId.get(inp.ingredientId);
    if (!ing) {
      missingIngredients.push(inp.ingredientId);
      return;
    }
    const recipeUnit = inp.unit || ing.unit;
    const recipeQty = round(inp.quantity * n);
    const quantity = round(convertForIngredient(recipeQty, recipeUnit, ing.unit, ing) ?? recipeQty);
    const inStock = ing.currentStock || 0;
    lines.push({
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      quantity,
      recipeQty,
      recipeUnit,
      unitDoubt: !MEASURED.includes(canonicalUnit(ing.unit)) && canonicalUnit(recipeUnit) === canonicalUnit(ing.unit) && inp.quantity >= 50,
      inStock,
      short: round(Math.max(0, quantity - inStock)),
      cost: round(quantity * effectiveUnitCost(ing), 2)
    });
  });
  const expectedQty = round(recipe.outputQty * n);
  const cost = round(lines.reduce((s, l) => s + l.cost, 0), 2);
  return {
    lines,
    expectedQty,
    cost,
    unitCost: expectedQty > 0 ? round(cost / expectedQty) : 0,
    hasShortage: lines.some(l => l.short > 0),
    missingIngredients
  };
}

/**
 * The output's cost per unit after adding a batch: weighted average of what was in stock and what
 * was just made (what is left of an older batch keeps its cost).
 */
export function averageCostAfterPrep(output: Pick<Ingredient, 'currentStock' | 'unitCost' | 'unit' | 'packageSize'>, addedQty: number, addedCost: number): number {
  const oldQty = Math.max(0, output.currentStock || 0);
  const oldCost = effectiveUnitCost(output);
  const total = oldQty + addedQty;
  if (total <= 0) return oldCost;
  return round((oldQty * oldCost + addedCost) / total);
}

/** Yield of a run compared with the recipe (100 = as expected) */
export const yieldPercent = (actual: number, expected: number) => (expected > 0 ? Math.round((actual / expected) * 1000) / 10 : 0);

/**
 * Cost per unit to use for items made in the kitchen that are not in stock: what one batch of
 * their recipe costs now. Dishes using them (e.g. ข้าวหอม, ไก่บดปรุงสุก) then show a real cost
 * before the first run; once made, the run's actual cost takes over (averageCostAfterPrep).
 * Only outputs with nothing in stock and a complete recipe are returned.
 */
export function prepEstimatedCosts(recipes: PrepRecipe[], ingredients: Ingredient[]): Map<string, number> {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const out = new Map<string, number>();
  recipes.forEach(r => {
    const item = byId.get(r.outputIngredientId);
    if (!item || (item.currentStock || 0) > 0) return;
    const plan = planPrep(r, 1, ingredients);
    // A recipe that looks mistyped (1,500 ขวด) would give dishes a wild cost: left until fixed
    if (plan.missingIngredients.length || plan.lines.some(l => l.unitDoubt) || !(plan.unitCost > 0)) return;
    out.set(item.id, plan.unitCost);
  });
  return out;
}
