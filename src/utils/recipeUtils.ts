import type { AddOnOption, CartItem, Ingredient, MenuItem, ProteinOption, RecipeIngredient } from '../types';

/** Canonical unit name for the Thai/English spellings used in the shop's data. */
export function canonicalUnit(unit: string | undefined): string {
  const u = (unit || '').toLowerCase().trim().replace(/\.$/, '');
  if (['kg', 'กิโลกรัม', 'กก', 'กิโล'].includes(u)) return 'kg';
  if (['g', 'gram', 'กรัม', 'ก'].includes(u)) return 'g';
  if (['l', 'liter', 'litre', 'ลิตร', 'ล'].includes(u)) return 'l';
  if (['ml', 'มิลลิลิตร', 'มล'].includes(u)) return 'ml';
  return u;
}

const FACTORS: Record<string, number> = { 'kg>g': 1000, 'g>kg': 0.001, 'l>ml': 1000, 'ml>l': 0.001 };

/** Convert an amount between units. Returns null when the units cannot be converted (e.g. g → ml). */
export function convertAmount(amount: number, from: string | undefined, to: string | undefined): number | null {
  const f = canonicalUnit(from);
  const t = canonicalUnit(to);
  if (f === t || !f || !t) return amount;
  const factor = FACTORS[`${f}>${t}`];
  return factor === undefined ? null : amount * factor;
}

/**
 * Cost of one stock unit. Older data has bottle/litre prices typed into ingredients counted in ml
 * (e.g. fish sauce "150 ฿ per ml"); nobody pays ฿10 or more per millilitre, so such a price is read
 * as the price of one package (packageSize ml) or, without a package size, of one litre.
 */
export function effectiveUnitCost(ing: Partial<Ingredient>): number {
  const unitCost = ing.unitCost || 0;
  if (canonicalUnit(ing.unit) === 'ml' && unitCost >= 10) {
    return ing.packageSize && ing.packageSize > 0 ? unitCost / ing.packageSize : unitCost / 1000;
  }
  return unitCost;
}

/** True when an ingredient's price looks like a package price typed in as a per-ml price. */
export function hasSuspiciousUnitCost(ing: Partial<Ingredient>): boolean {
  return canonicalUnit(ing.unit) === 'ml' && (ing.unitCost || 0) >= 10;
}

export function calcRecipeItemCostAndDeduction(
  ingredient: Partial<Ingredient> | undefined | null,
  amountNeeded: number,
  recipeUnit?: string
): { lineCost: number; stockDeduction: number; displayUnit: string } {
  if (!ingredient) return { lineCost: 0, stockDeduction: 0, displayUnit: '' };
  const stockUnit = canonicalUnit(ingredient.unit);
  const unit = recipeUnit ? canonicalUnit(recipeUnit) : stockUnit;
  // Units that cannot be converted (a recipe in g for an ingredient counted in pieces) are taken as-is
  const stockDeduction = convertAmount(amountNeeded, unit, stockUnit) ?? amountNeeded;
  return {
    lineCost: stockDeduction * effectiveUnitCost(ingredient),
    stockDeduction,
    displayUnit: unit || 'pcs'
  };
}

/** Total ingredient cost of a list of recipe lines. */
export function recipeCost(recipe: RecipeIngredient[] | undefined, ingredients: Ingredient[]): number {
  if (!recipe || recipe.length === 0) return 0;
  const byId = new Map(ingredients.map(i => [i.id, i]));
  return recipe.reduce((sum, r) => sum + calcRecipeItemCostAndDeduction(byId.get(r.ingredientId), r.amountNeeded, r.recipeUnit).lineCost, 0);
}

/** Recipe lines always carry their unit, so later changes to an ingredient's unit cannot change their meaning. */
export function withRecipeUnits(recipe: RecipeIngredient[], ingredients: Ingredient[]): RecipeIngredient[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  return recipe.map(r => (r.recipeUnit ? r : { ...r, recipeUnit: byId.get(r.ingredientId)?.unit || 'pcs' }));
}

/** The protein option a cart line was ordered with, as defined on the menu item. */
export function findProteinOption(menuItem: Pick<MenuItem, 'availableProteins'>, name: string | undefined): ProteinOption | undefined {
  if (!name) return undefined;
  return menuItem.availableProteins?.find(p => p.name === name);
}

/**
 * Recipe of a menu item as made with the chosen protein: the protein's own ingredients replace the
 * base recipe lines it names (e.g. crispy pork 140 g instead of minced pork 150 g).
 */
export function recipeForProtein(menuItem: Pick<MenuItem, 'recipe' | 'availableProteins'>, proteinName?: string): RecipeIngredient[] {
  const base = menuItem.recipe || [];
  const opt = findProteinOption(menuItem, proteinName);
  if (!opt) return base;
  const replaced = new Set(opt.replacesIngredientIds || []);
  return [...base.filter(r => !replaced.has(r.ingredientId)), ...(opt.recipe || [])];
}

/** Ingredient lines one unit of a cart line uses: menu (with its protein) plus toppings. */
export function cartItemRecipeLines(cartItem: Pick<CartItem, 'menuItem' | 'proteinChoice' | 'selectedAddOns'>): RecipeIngredient[] {
  const lines = [...recipeForProtein(cartItem.menuItem || { recipe: [] }, cartItem.proteinChoice?.name)];
  (cartItem.selectedAddOns || []).forEach((addon: AddOnOption) => {
    if (addon.recipe && addon.recipe.length > 0) lines.push(...addon.recipe);
    else if (addon.ingredientId && addon.ingredientAmount) lines.push({ ingredientId: addon.ingredientId, amountNeeded: addon.ingredientAmount });
  });
  return lines;
}

/**
 * The menu item with its stored costs brought up to date: costPrice from the base recipe and, for
 * each protein option, how much more (or less) the dish costs with it.
 */
export function withRecipeCosts<T extends MenuItem>(item: T, ingredients: Ingredient[]): T {
  const baseCost = recipeCost(item.recipe, ingredients);
  return {
    ...item,
    // Without a recipe (e.g. bought-in drinks) the cost typed in by hand is kept
    costPrice: item.recipe?.length ? roundCost(baseCost) : item.costPrice || 0,
    ...(item.availableProteins
      ? {
          availableProteins: item.availableProteins.map(p =>
            p.recipe?.length || p.replacesIngredientIds?.length
              ? { ...p, costDelta: roundCost(recipeCost(recipeForProtein(item, p.name), ingredients) - baseCost) }
              : { ...p, costDelta: undefined }
          )
        }
      : {})
  };
}

const roundCost = (n: number) => Math.round(n * 10000) / 10000;

/** Cost of goods for one unit of a sold cart line (menu cost at the time of sale plus the protein difference). */
export function cartItemUnitCost(cartItem: Pick<CartItem, 'menuItem' | 'proteinChoice' | 'totalPrice' | 'quantity'>, fallbackRatio = 0.4): number {
  const m = cartItem.menuItem;
  const base = m?.costPrice && m.costPrice > 0 ? m.costPrice : (m?.price || 0) * fallbackRatio;
  return base + (findProteinOption(m || {}, cartItem.proteinChoice?.name)?.costDelta || 0);
}

export interface RecipeIssue {
  kind: 'no-recipe' | 'missing-ingredient' | 'package-price' | 'protein-no-recipe';
  menuItemId?: string;
  addOnId?: string;
  ingredientId?: string;
  message: string;
}

/** Problems that make stock deduction or costing silently wrong. */
export function auditRecipes(menuItems: MenuItem[], addOns: AddOnOption[], ingredients: Ingredient[]): RecipeIssue[] {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const issues: RecipeIssue[] = [];
  const checkLines = (lines: RecipeIngredient[] | undefined, owner: string, ref: Partial<RecipeIssue>) => {
    const missing = (lines || []).filter(r => !byId.has(r.ingredientId));
    if (missing.length > 0) {
      issues.push({
        ...ref,
        kind: 'missing-ingredient',
        ingredientId: missing[0].ingredientId,
        message: `${owner}: สูตรใช้วัตถุดิบที่ถูกลบไปแล้ว ${missing.length} รายการ ส่วนนี้จึงไม่ถูกตัดสต็อก`
      });
    }
  };
  menuItems.forEach(m => {
    if (!m.recipe || m.recipe.length === 0) {
      issues.push({ kind: 'no-recipe', menuItemId: m.id, message: `${m.name}: ยังไม่มีสูตร ขายแล้วไม่ตัดสต็อกและต้นทุนเป็น 0` });
    }
    checkLines(m.recipe, m.name, { menuItemId: m.id });
    (m.availableProteins || []).forEach((p, idx) => {
      checkLines(p.recipe, `${m.name} (${p.name})`, { menuItemId: m.id });
      // The first option is the one the base recipe is written for
      if (idx > 0 && !p.recipe?.length && !p.replacesIngredientIds?.length) {
        issues.push({ kind: 'protein-no-recipe', menuItemId: m.id, message: `${m.name}: ตัวเลือก "${p.name}" ยังไม่ได้ผูกวัตถุดิบ จะตัดสต็อกตามสูตรหลัก` });
      }
    });
  });
  addOns.forEach(a => {
    const lines = a.recipe?.length ? a.recipe : a.ingredientId ? [{ ingredientId: a.ingredientId, amountNeeded: a.ingredientAmount || 0 }] : [];
    checkLines(lines, `ท็อปปิ้ง ${a.name}`, { addOnId: a.id });
  });
  ingredients.filter(hasSuspiciousUnitCost).forEach(i => {
    issues.push({
      kind: 'package-price',
      ingredientId: i.id,
      message: `${i.name}: ราคาทุน ${i.unitCost} บาท/ml น่าจะเป็นราคาต่อขวด ${i.packageSize ? `(คิดเป็นขวดละ ${i.packageSize} ml)` : '(ตอนนี้คิดเป็นราคาต่อลิตร)'} ควรแก้ราคาทุนต่อ ml หรือใส่ขนาดบรรจุ`
    });
  });
  return issues;
}

/** Enough stock for one more of this dish? (Informational: stock counts are often not kept exactly.) */
export function isShortOfStock(menuItem: MenuItem, ingredients: Ingredient[], proteinName?: string): boolean {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const lines = recipeForProtein(menuItem, proteinName ?? menuItem.availableProteins?.[0]?.name);
  if (lines.length === 0) return false;
  return lines.some(r => {
    const ing = byId.get(r.ingredientId);
    if (!ing) return false;
    return ing.currentStock < calcRecipeItemCostAndDeduction(ing, r.amountNeeded, r.recipeUnit).stockDeduction;
  });
}

/** Units a recipe line may use for an ingredient; the ingredient's own (canonical) unit comes first. */
export function getAvailableRecipeUnits(ingUnit: string): { val: string; label: string }[] {
  const norm = canonicalUnit(ingUnit);
  const label: Record<string, string> = { kg: 'กิโลกรัม (kg)', g: 'กรัม (g)', l: 'ลิตร (L)', ml: 'มิลลิลิตร (ml)' };
  if (norm === 'kg') return [{ val: 'kg', label: label.kg }, { val: 'g', label: label.g }];
  if (norm === 'g') return [{ val: 'g', label: label.g }, { val: 'kg', label: label.kg }];
  if (norm === 'l') return [{ val: 'l', label: label.l }, { val: 'ml', label: label.ml }];
  if (norm === 'ml') return [{ val: 'ml', label: label.ml }, { val: 'l', label: label.l }];
  return [{ val: norm || 'pcs', label: ingUnit || 'pcs' }];
}

/** Stock units can be merged when one converts into the other (kg ↔ g, l ↔ ml, or the same unit). */
export function unitsCompatible(a: string | undefined, b: string | undefined): boolean {
  return convertAmount(1, a, b) !== null;
}

/**
 * Ingredients that are probably the same thing entered twice (same name, or one name contained in
 * the other), with units that can be merged. Returned as [keep, duplicate] pairs.
 */
export function suggestDuplicateIngredients(ingredients: Ingredient[]): [Ingredient, Ingredient][] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s().,-]/g, '');
  const pairs: [Ingredient, Ingredient][] = [];
  for (let i = 0; i < ingredients.length; i++) {
    for (let j = i + 1; j < ingredients.length; j++) {
      const a = ingredients[i];
      const b = ingredients[j];
      const na = norm(a.name);
      const nb = norm(b.name);
      if (na.length < 3 || nb.length < 3) continue;
      if ((na === nb || na.includes(nb) || nb.includes(na)) && unitsCompatible(a.unit, b.unit)) {
        // Keep the one with the shorter (more generic) name
        pairs.push(na.length <= nb.length ? [a, b] : [b, a]);
      }
    }
  }
  return pairs;
}

/** Point every recipe line that uses `from` at `to`, adding into an existing `to` line when there is one. */
export function repointRecipe(
  recipe: RecipeIngredient[] | undefined,
  from: Ingredient,
  to: Ingredient
): RecipeIngredient[] | undefined {
  if (!recipe || !recipe.some(r => r.ingredientId === from.id)) return recipe;
  const moved = (r: RecipeIngredient): RecipeIngredient => ({ ingredientId: to.id, amountNeeded: r.amountNeeded, recipeUnit: r.recipeUnit || from.unit });
  const targetLine = recipe.find(r => r.ingredientId === to.id);
  if (!targetLine) return recipe.map(r => (r.ingredientId === from.id ? moved(r) : r));

  let extra = 0;
  const separate: RecipeIngredient[] = [];
  recipe
    .filter(r => r.ingredientId === from.id)
    .forEach(r => {
      const add = convertAmount(r.amountNeeded, r.recipeUnit || from.unit, targetLine.recipeUnit || to.unit);
      if (add === null) separate.push(moved(r));
      else extra += add;
    });
  return [
    ...recipe
      .filter(r => r.ingredientId !== from.id)
      .map(r => (r === targetLine ? { ...r, amountNeeded: Number((r.amountNeeded + extra).toFixed(4)) } : r)),
    ...separate
  ];
}
