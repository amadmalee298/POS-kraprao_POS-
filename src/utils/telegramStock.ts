import type { PendingReceipt } from '../types';

/** Bills whose goods went into stock on this device (a small list of ids) */
export const STOCK_DONE_KEY = 'POS_TG_STOCK_DONE';

export function readStockDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STOCK_DONE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Recorded, and its goods still to be received into stock */
export const stockOnly = (p: PendingReceipt) => p.status === 'approved' && !!p.stockPending && !p.stockAdded?.length;

/** Waiting for a manager: to check and approve, or to receive into stock (not received here already) */
export const needsAttention = (p: PendingReceipt, done: string[]) =>
  p.status === 'pending' || p.status === 'failed' || p.status === 'reading' || (stockOnly(p) && !done.includes(p.id));
