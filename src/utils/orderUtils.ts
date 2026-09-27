import { CartItem, Ingredient, Order, SpiceLevel, SystemSettings, MenuItem } from '../types';
import { calcRecipeItemCostAndDeduction } from './recipeUtils';
import { calculateOrderTotals, TaxCalculationResult } from './tax';

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

export interface CartDiscount {
  amount: number;
  type: 'fixed' | 'percent';
}

/**
 * Totals for a cart: the one place that applies the bill discount and VAT.
 * Used by the POS screen, the payment dialogs and createOrder so they always agree.
 */
export function computeCartTotals(
  cart: CartItem[],
  discount: CartDiscount,
  settings: Partial<SystemSettings>
): TaxCalculationResult & { itemCount: number } {
  const rawSubtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountInput = Number.isFinite(discount.amount) ? Math.max(0, discount.amount) : 0;
  const discountAmount =
    discount.type === 'fixed'
      ? Math.min(discountInput, rawSubtotal)
      : roundMoney((rawSubtotal * Math.min(discountInput, 100)) / 100);
  return {
    ...calculateOrderTotals(rawSubtotal, discountAmount, settings),
    itemCount: cart.reduce((sum, item) => sum + item.quantity, 0)
  };
}

/** Spice level used when a dish is added with one tap (no options dialog). */
export function defaultSpiceLevel(item: MenuItem): SpiceLevel | undefined {
  const levels = item.availableSpiceLevels || [];
  return levels.includes('เผ็ดปานกลาง') ? 'เผ็ดปานกลาง' : levels[0];
}

/** Cash amounts a customer is likely to hand over for this total (e.g. 145 -> 150, 200, 500, 1000). */
export function suggestCashAmounts(total: number, max = 3): number[] {
  const out: number[] = [];
  for (const note of [20, 50, 100, 500, 1000]) {
    const v = Math.ceil(total / note) * note;
    if (v > total && !out.includes(v)) out.push(v);
  }
  return out.slice(0, max);
}

const orderTime = (o: Order): number => {
  const t = new Date(o.updatedAt || o.createdAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Merge orders from the cloud into the local list. The single rule set for both the live
 * listener and a manual "pull from cloud":
 * - identity is the normalized order id ("ord-123" and "123" are the same order)
 * - the newer copy wins, except that a local served/cancelled order is never reverted by an
 *   older cloud copy; those are returned in `pushBack` so the caller re-sends them to the cloud
 * - `removedIds` (deleted in the cloud) are dropped locally
 */
export function mergeCloudOrders(
  local: Order[],
  cloud: Order[],
  removedIds: string[] = []
): { orders: Order[]; changed: boolean; newOrUpdated: number; pushBack: Order[] } {
  let changed = false;
  let newOrUpdated = 0;
  const pushBack: Order[] = [];

  const removed = new Set(removedIds.map(normalizeOrderId));
  const byKey = new Map<string, Order>();
  for (const o of local) {
    if (!o || !o.id) continue;
    if (removed.has(normalizeOrderId(o.id))) {
      changed = true;
      continue;
    }
    const key = normalizeOrderId(o.id);
    const existing = byKey.get(key);
    // Two local copies of one order: keep the served one, else the newer one
    if (!existing || (o.status === 'served' && existing.status !== 'served') || orderTime(o) > orderTime(existing)) {
      if (existing) changed = true;
      byKey.set(key, o);
    } else {
      changed = true;
    }
  }

  for (const co of cloud) {
    if (!co || !co.id) continue;
    const key = normalizeOrderId(co.id);
    if (removed.has(key)) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, co);
      changed = true;
      newOrUpdated++;
      continue;
    }
    const localTime = orderTime(existing);
    const cloudTime = orderTime(co);
    const localIsFinal = existing.status === 'served' || existing.status === 'cancelled';
    if (localIsFinal && co.status !== existing.status && localTime >= cloudTime) {
      pushBack.push(existing);
      continue;
    }
    if (cloudTime > localTime) {
      byKey.set(key, { ...existing, ...co, id: existing.id, isSynced: true });
      changed = true;
      newOrUpdated++;
    } else if (!existing.isSynced && co.isSynced) {
      byKey.set(key, { ...existing, isSynced: true });
      changed = true;
      newOrUpdated++;
    }
  }

  const orders = Array.from(byKey.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { orders, changed, newOrUpdated, pushBack };
}

/** VAT and pre-VAT amount of a saved order, as recorded at the time of sale. */
export function orderVatBreakdown(order: Pick<Order, 'grandTotal' | 'vatAmount'>): { vat: number; base: number } {
  const vat = roundMoney(Math.max(0, order.vatAmount || 0));
  return { vat, base: roundMoney((order.grandTotal || 0) - vat) };
}
