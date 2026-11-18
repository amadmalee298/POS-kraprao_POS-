import type { ExpenseItem } from '../types';

/*
 * The lines of an expense (what was bought). No imports besides types: also used by the server.
 */

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Lines kept tidy: a name and an amount each, at most 30, numbers rounded */
export function cleanExpenseItems(items: unknown): ExpenseItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((i: any) => {
      const quantity = Number(i?.quantity);
      const unitPrice = Number(i?.unitPrice);
      let amount = Number(i?.amount);
      if (!(amount > 0) && quantity > 0 && unitPrice > 0) amount = quantity * unitPrice;
      return {
        name: String(i?.name || '').trim().slice(0, 100),
        ...(quantity > 0 ? { quantity: r2(quantity) } : {}),
        ...(i?.unit ? { unit: String(i.unit).trim().slice(0, 20) } : {}),
        ...(unitPrice > 0 ? { unitPrice: r2(unitPrice) } : {}),
        amount: r2(amount > 0 ? amount : 0)
      };
    })
    .filter(i => i.name && i.amount > 0)
    .slice(0, 30);
}

/** The lines' total */
export const itemsTotal = (items: ExpenseItem[] | undefined) => r2((items || []).reduce((s, i) => s + (Number(i.amount) || 0), 0));
