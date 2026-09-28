import type { AddOnOption, CartItem, Ingredient, IssueUnit, MenuItem } from '../types';
import { computeSaleStockDeductions } from './orderUtils';

export interface IssueLine {
  ingredientId: string;
  quantity: number; // in the ingredient's stock unit, per 1 unit issued
  fromRecipe: boolean;
}

/** The menu item or add-on whose recipe a unit follows, if it still exists */
export function issueUnitSource(unit: IssueUnit, menuItems: MenuItem[], addOns: AddOnOption[]) {
  if (!unit.source) return null;
  if (unit.source.kind === 'menu') {
    const m = menuItems.find(x => x.id === unit.source!.id);
    return m ? { name: m.name, menuItem: m, addOn: undefined } : null;
  }
  const a = addOns.find(x => x.id === unit.source!.id);
  return a ? { name: a.name, menuItem: undefined, addOn: a } : null;
}

/**
 * What 1 unit (e.g. ข้าวสวย 1 กล่อง) takes out of stock: the linked recipe exactly as a sale of it
 * would deduct (same unit conversions), plus any extra items such as the box itself.
 */
export function issueUnitLines(unit: IssueUnit, ingredients: Ingredient[], menuItems: MenuItem[], addOns: AddOnOption[]): IssueLine[] {
  const lines: IssueLine[] = [];
  const src = issueUnitSource(unit, menuItems, addOns);
  if (src) {
    const item: CartItem = {
      cartItemId: 'issue',
      menuItem: src.menuItem || ({ id: 'issue', name: src.name, recipe: [] } as unknown as MenuItem),
      quantity: 1,
      selectedAddOns: src.addOn ? [src.addOn] : [],
      unitPrice: 0,
      totalPrice: 0
    };
    computeSaleStockDeductions([item], ingredients).forEach((quantity, ingredientId) => lines.push({ ingredientId, quantity, fromRecipe: true }));
  }
  const known = new Set(ingredients.map(i => i.id));
  unit.inputs.forEach(i => {
    if (!known.has(i.ingredientId) || !(i.quantity > 0)) return;
    const same = lines.find(l => l.ingredientId === i.ingredientId && !l.fromRecipe);
    if (same) same.quantity += i.quantity;
    else lines.push({ ingredientId: i.ingredientId, quantity: i.quantity, fromRecipe: false });
  });
  return lines;
}
