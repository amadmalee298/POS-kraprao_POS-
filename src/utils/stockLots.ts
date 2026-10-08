import type { StockLot } from '../types';

/** The most recent delivery of each ingredient (by received date, then by when it was added) */
export function latestLotByIngredient(lots: StockLot[]): Map<string, StockLot> {
  const out = new Map<string, StockLot>();
  for (const lot of lots) {
    const cur = out.get(lot.ingredientId);
    if (!cur || (lot.receivedDate || '') > (cur.receivedDate || '')) out.set(lot.ingredientId, lot);
  }
  return out;
}

export type ExpiryState = 'expired' | 'soon' | null;

/** A lot past its expiry date, or expiring within `soonDays` days (dates as YYYY-MM-DD) */
export function expiryState(expiryDate: string | undefined, today: string, soonDays = 3): ExpiryState {
  const exp = (expiryDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return null;
  if (exp < today) return 'expired';
  const days = (Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= soonDays ? 'soon' : null;
}
