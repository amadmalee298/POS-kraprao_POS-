import type { CartItem, Ingredient, MenuItem } from '../types';
import { computeSaleStockDeductions } from './orderUtils';

/** Boxes of a menu taken out of stock without a sale (staff meals, giveaways, thrown away) */
export interface MenuIssueRow {
  menuItemId: string;
  protein?: string;
  boxes: number;
}

/**
 * What the boxes take out of stock: each menu's recipe exactly as a sale of it would deduct
 * (protein choice and unit conversions included), plus one container per box when one is chosen.
 * Returns ingredientId -> amount in the ingredient's stock unit.
 */
export function menuIssueDeductions(rows: MenuIssueRow[], menuItems: MenuItem[], ingredients: Ingredient[], containerId?: string): Map<string, number> {
  const menuById = new Map(menuItems.map(m => [m.id, m]));
  const items: CartItem[] = [];
  let boxes = 0;
  rows.forEach((r, idx) => {
    const menuItem = menuById.get(r.menuItemId);
    if (!menuItem || !(r.boxes > 0)) return;
    boxes += r.boxes;
    const protein = menuItem.availableProteins?.find(p => p.name === r.protein);
    items.push({
      cartItemId: `issue-${idx}`,
      menuItem,
      quantity: r.boxes,
      proteinChoice: protein ? { name: protein.name, extraPrice: protein.extraPrice } : undefined,
      selectedAddOns: [],
      unitPrice: 0,
      totalPrice: 0
    });
  });
  const deltas = computeSaleStockDeductions(items, ingredients);
  if (containerId && boxes > 0 && ingredients.some(i => i.id === containerId)) {
    deltas.set(containerId, (deltas.get(containerId) || 0) + boxes);
  }
  return deltas;
}
