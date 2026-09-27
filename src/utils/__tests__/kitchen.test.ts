import { describe, it, expect } from 'vitest';
import { kitchenStartTime, servedToday, sortKitchenQueue } from '../kitchen';
import { isStubOrderDoc, mergeCloudOrders } from '../orderUtils';
import type { Order } from '../../types';

const order = (over: Partial<Order>): Order =>
  ({
    id: 'ord-1',
    orderNumber: '#1',
    branchId: 'b1',
    orderType: 'dine-in',
    items: [],
    subtotal: 0,
    discountAmount: 0,
    discountType: 'fixed',
    vatAmount: 0,
    grandTotal: 0,
    paymentMethod: 'cash',
    tenderedAmount: 0,
    changeAmount: 0,
    status: 'pending',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...over
  }) as Order;

describe('kitchen queue', () => {
  it('starts a QR order when it was accepted, not when the customer ordered', () => {
    const o = order({ createdAt: '2026-01-01T10:00:00.000Z', acceptedAt: '2026-01-01T10:20:00.000Z' });
    expect(kitchenStartTime(o)).toBe(new Date('2026-01-01T10:20:00.000Z').getTime());
  });

  it('puts the order waiting longest first', () => {
    const q = sortKitchenQueue([
      order({ id: 'new', createdAt: '2026-01-01T10:05:00.000Z' }),
      order({ id: 'old', createdAt: '2026-01-01T10:00:00.000Z' }),
      order({ id: 'qr', createdAt: '2026-01-01T09:00:00.000Z', acceptedAt: '2026-01-01T10:10:00.000Z' })
    ]);
    expect(q.map(o => o.id)).toEqual(['old', 'new', 'qr']);
  });

  it('lists only today\'s served orders, latest first', () => {
    const now = new Date('2026-01-02T12:00:00');
    const list = servedToday(
      [
        order({ id: 'yesterday', status: 'served', completedAt: new Date('2026-01-01T12:00:00').toISOString() }),
        order({ id: 'a', status: 'served', completedAt: new Date('2026-01-02T09:00:00').toISOString() }),
        order({ id: 'b', status: 'served', completedAt: new Date('2026-01-02T11:00:00').toISOString() }),
        order({ id: 'open', status: 'cooking' })
      ],
      now
    );
    expect(list.map(o => o.id)).toEqual(['b', 'a']);
  });
});

describe('stub order documents', () => {
  it('recognises the status-only copies older versions wrote', () => {
    expect(isStubOrderDoc('1786-abc', { status: 'ready', isSynced: true, updatedAtIso: 'x' })).toBe(true);
    expect(isStubOrderDoc('ord-1786-abc', { status: 'ready' })).toBe(false);
    expect(isStubOrderDoc('1786-abc', { status: 'ready', items: [], branchId: 'b1', orderNumber: '#1' })).toBe(false);
  });

  it('a real cloud order never loses its items in the merge', () => {
    const local = [order({ id: 'ord-1', items: [{} as never], grandTotal: 50, status: 'cooking' })];
    const cloud = [order({ id: 'ord-1', items: [{} as never], grandTotal: 50, status: 'ready', updatedAt: '2026-01-01T10:05:00.000Z' })];
    const merged = mergeCloudOrders(local, cloud).orders[0];
    expect(merged.status).toBe('ready');
    expect(merged.items).toHaveLength(1);
    expect(merged.grandTotal).toBe(50);
  });
});
