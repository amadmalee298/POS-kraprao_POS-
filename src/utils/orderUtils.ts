import { CartItem, Ingredient, Order } from '../types';
import { calcRecipeItemCostAndDeduction } from './recipeUtils';

const randomSuffix = (length: number): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easy to read aloud
  let out = '';
  const bytes = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

/**
 * Globally unique order id. Several devices can create orders in the same millisecond,
 * so a timestamp alone is not enough.
 */
export function generateOrderId(now: number = Date.now()): string {
  return `ord-${now}-${randomSuffix(6).toLowerCase()}`;
}

/**
 * Human-friendly bill number: a per-branch daily running number plus a short random tag,
 * e.g. "#KAP-015-X7". The tag keeps numbers from two offline devices distinguishable.
 * Order identity is always the order id, never this number.
 */
export function generateOrderNumber(existingOrders: Order[], branchId: string, now: Date = new Date()): string {
  const dayKey = now.toDateString();
  const todaysCount = existingOrders.filter(
    o => o && o.branchId === branchId && o.createdAt && new Date(o.createdAt).toDateString() === dayKey
  ).length;
  return `#KAP-${String(todaysCount + 1).padStart(3, '0')}-${randomSuffix(2)}`;
}

/**
 * Amount of each ingredient (in the ingredient's stock unit) consumed by the given cart lines,
 * including add-ons. Returns ingredientId -> amount to subtract.
 */
export function computeSaleStockDeductions(items: CartItem[], ingredients: Ingredient[]): Map<string, number> {
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const deltas = new Map<string, number>();
  const add = (ingredientId: string | undefined, amount: number, recipeUnit?: string, qty = 1) => {
    if (!ingredientId || !amount) return;
    const ing = byId.get(ingredientId);
    if (!ing) return;
    const needed = calcRecipeItemCostAndDeduction(ing, amount, recipeUnit).stockDeduction * qty;
    if (!Number.isFinite(needed) || needed === 0) return;
    deltas.set(ingredientId, (deltas.get(ingredientId) || 0) + needed);
  };

  items.forEach(cartItem => {
    const qty = cartItem.quantity || 0;
    (cartItem.menuItem?.recipe || []).forEach(rec => add(rec.ingredientId, rec.amountNeeded, rec.recipeUnit, qty));
    (cartItem.selectedAddOns || []).forEach(addon => {
      if (addon.recipe && addon.recipe.length > 0) {
        addon.recipe.forEach(rec => add(rec.ingredientId, rec.amountNeeded, rec.recipeUnit, qty));
      } else if (addon.ingredientId && addon.ingredientAmount) {
        add(addon.ingredientId, addon.ingredientAmount, undefined, qty);
      }
    });
  });

  return deltas;
}

/** Apply stock deltas (ingredientId -> amount to subtract) to a local ingredient list. */
export function applyStockDeductions(ingredients: Ingredient[], deltas: Map<string, number>): Ingredient[] {
  if (deltas.size === 0) return ingredients;
  return ingredients.map(ing => {
    const amount = deltas.get(ing.id);
    if (!amount) return ing;
    return { ...ing, currentStock: Math.max(0, ing.currentStock - amount) };
  });
}

/** Stable identity used to match a local order with its cloud copy (doc ids carry an "ord-" prefix). */
export const normalizeOrderId = (id: string): string => (id || '').replace(/^ord-/, '');

/** Round a money amount to satang (2 decimals). */
export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
