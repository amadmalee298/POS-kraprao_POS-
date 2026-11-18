import type { AddOnOption, Ingredient, MenuItem, PrepRecipe } from '../types';
import { unitsCompatible } from './recipeUtils';

/**
 * Tidying the ingredient list: names entered several ways (บิลที่ AI อ่าน สะกดต่างกัน), sample or
 * unused items with no stock, and alert levels that do not fit the unit. They made the low-stock
 * alerts and the stock pages long and noisy.
 */

const norm = (s: string) => (s || '').toLowerCase().replace(/[\s().,\-_/'"*+]/g, '');

/** Edit distance (characters), stopped early above `max` */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Probably the same thing: one name inside the other, or a few letters apart (typos) */
export function similarNames(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na.length < 3 || nb.length < 3) return false;
  if (na === nb) return true;
  const shorter = Math.min(na.length, nb.length);
  if (shorter >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  // About one letter in eight may differ (ยัวร์ไซค์ / ยัวร์ไซซ์ / ยัวร์ไซด์)
  const allowed = Math.max(1, Math.floor(Math.max(na.length, nb.length) / 8));
  return shorter >= 6 && distance(na, nb, allowed) <= allowed;
}

/** Ids every recipe, topping and prep recipe uses */
export function usedIngredientIds(menuItems: MenuItem[], addOns: AddOnOption[], prepRecipes: PrepRecipe[] = []): Set<string> {
  const used = new Set<string>();
  for (const m of menuItems) {
    (m.recipe || []).forEach(r => used.add(r.ingredientId));
    (m.availableProteins || []).forEach(p => {
      (p.recipe || []).forEach(r => used.add(r.ingredientId));
      (p.replacesIngredientIds || []).forEach(id => used.add(id));
    });
  }
  for (const a of addOns) {
    if (a.ingredientId) used.add(a.ingredientId);
    (a.recipe || []).forEach(r => used.add(r.ingredientId));
  }
  for (const p of prepRecipes) {
    used.add(p.outputIngredientId);
    p.inputs.forEach(i => used.add(i.ingredientId));
  }
  return used;
}

/**
 * Groups of ingredients that are probably the same, each with the one to keep first: the one
 * recipes use, else the one with more stock, else the shortest name
 */
export function duplicateGroups(ingredients: Ingredient[], used: Set<string> = new Set()): Ingredient[][] {
  const parent = ingredients.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ingredients.length; i++) {
    for (let j = i + 1; j < ingredients.length; j++) {
      const a = ingredients[i];
      const b = ingredients[j];
      if (unitsCompatible(a.unit, b.unit) && similarNames(a.name, b.name)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Ingredient[]>();
  ingredients.forEach((ing, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) || []), ing]);
  });
  const rank = (i: Ingredient) => [used.has(i.id) ? 0 : 1, -(i.currentStock || 0), norm(i.name).length] as const;
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g =>
      [...g].sort((x, y) => {
        const a = rank(x);
        const b = rank(y);
        return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
      })
    );
}

/** No stock and used by no recipe, topping or prep recipe: safe to remove */
export function unusedIngredients(ingredients: Ingredient[], used: Set<string>): Ingredient[] {
  return ingredients.filter(i => !used.has(i.id) && !((i.currentStock || 0) > 0));
}

/** Alert levels that do not fit the unit (5 g of washing powder, 5 ml for a measuring jug) */
export function oddAlertLevels(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter(i => {
    const alert = Number(i.minStockAlert) || 0;
    if (alert <= 0) return false;
    const unit = (i.unit || '').toLowerCase();
    if (unit === 'g' || unit === 'ml') return alert < 50;
    if (unit === 'kg' || unit === 'l') return alert > 100;
    return false;
  });
}
