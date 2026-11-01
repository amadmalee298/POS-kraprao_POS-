import type { Order } from '../types';

/**
 * The one rule for sales money received, kept on its own so the server (plain Node ESM) can use it
 * too: not cancelled, not waiting for approval, and paid.
 */
export const isUnpaid = (o: Pick<Order, 'paymentStatus'>): boolean => o.paymentStatus === 'unpaid';

export const countsAsRevenue = (o: Pick<Order, 'status' | 'paymentStatus'>): boolean =>
  o.status !== 'cancelled' && o.status !== 'pending-qr' && !isUnpaid(o);
