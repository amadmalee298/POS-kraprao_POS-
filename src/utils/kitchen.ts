import type { Order, OrderStatus } from '../types';

export const KITCHEN_ACTIVE: OrderStatus[] = ['pending', 'cooking', 'ready'];

/** When the kitchen got the order: a customer's QR order starts when staff accepted it. */
export function kitchenStartTime(order: Pick<Order, 'createdAt' | 'acceptedAt'>): number {
  const t = new Date(order.acceptedAt || order.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** First come, first served: the order waiting longest is first. */
export function sortKitchenQueue<T extends Pick<Order, 'createdAt' | 'acceptedAt'>>(orders: T[]): T[] {
  return [...orders].sort((a, b) => kitchenStartTime(a) - kitchenStartTime(b));
}

/** Served orders of today (by completion time), most recent first. */
export function servedToday<T extends Pick<Order, 'status' | 'completedAt' | 'updatedAt' | 'createdAt'>>(
  orders: T[],
  now: Date = new Date()
): T[] {
  const doneAt = (o: T) => new Date(o.completedAt || o.updatedAt || o.createdAt);
  return orders
    .filter(o => o.status === 'served' && doneAt(o).toDateString() === now.toDateString())
    .sort((a, b) => doneAt(b).getTime() - doneAt(a).getTime());
}

/** Which orders' source this kitchen screen shows; chosen per device. */
export type KitchenSourceFilter = 'all' | 'qr_only';
const SOURCE_KEY = 'kds_source_filter';

export function readKitchenSourceFilter(fallback: KitchenSourceFilter): KitchenSourceFilter {
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    return v === 'all' || v === 'qr_only' ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveKitchenSourceFilter(value: KitchenSourceFilter): void {
  try {
    localStorage.setItem(SOURCE_KEY, value);
  } catch {
    // ignore: the choice just is not remembered
  }
}
