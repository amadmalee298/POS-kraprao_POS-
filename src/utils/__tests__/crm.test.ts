import { describe, it, expect, vi } from 'vitest';
vi.mock('../../hooks/useSharedList', () => ({ useSharedList: () => [[], () => undefined] }));
import { checkCoupon, nextMemberId, pointsForAmount } from '../../crm/crm';
import { isValidThaiTaxId } from '../tax';
import { nextDocNumber } from '../docNumber';

const coupons = [
  { id: '1', code: 'KAPRAO50', type: 'fixed' as const, value: 50, minSpend: 300, expiryDate: '2026-09-30', isActive: true },
  { id: '2', code: 'VIP10', type: 'percent' as const, value: 10, minSpend: 0, expiryDate: '2026-09-01', isActive: true },
  { id: '3', code: 'OFF', type: 'fixed' as const, value: 20, minSpend: 0, expiryDate: '', isActive: false }
];
const now = new Date('2026-09-27T12:00:00');

describe('coupons', () => {
  it('applies a valid coupon', () => {
    expect(checkCoupon(coupons, 'kaprao50', 350, now)).toMatchObject({ ok: true, discount: 50 });
  });
  it('refuses unknown, disabled, expired and under-minimum coupons', () => {
    expect(checkCoupon(coupons, 'NOPE', 350, now).ok).toBe(false);
    expect(checkCoupon(coupons, 'OFF', 350, now).ok).toBe(false);
    expect(checkCoupon(coupons, 'VIP10', 350, now).ok).toBe(false);
    expect(checkCoupon(coupons, 'KAPRAO50', 200, now).ok).toBe(false);
  });
  it('is valid through its last day', () => {
    expect(checkCoupon(coupons, 'KAPRAO50', 300, new Date('2026-09-30T23:00:00')).ok).toBe(true);
  });
});

describe('members and numbering', () => {
  it('earns whole points only when the shop set a rate', () => {
    expect(pointsForAmount(259, 25)).toBe(10);
    expect(pointsForAmount(259, 0)).toBe(0);
  });
  it('never reuses a member number', () => {
    expect(nextMemberId([{ id: 'M-0003' }, { id: 'M-009' }] as never)).toBe('M-0010');
  });
  it('continues document numbers after the highest one', () => {
    expect(nextDocNumber('PO-2569-', ['PO-2569-0002', 'PO-2569-0010', 'PO-2568-0099', 'x'])).toBe('PO-2569-0011');
    expect(nextDocNumber('INV202609-', [])).toBe('INV202609-0001');
  });
});

describe('tax id', () => {
  it('checks the 13-digit check digit', () => {
    expect(isValidThaiTaxId('0105536087532')).toBe(true);
    expect(isValidThaiTaxId('0-1055-36087-53-2')).toBe(true);
    expect(isValidThaiTaxId('0105536087531')).toBe(false);
    expect(isValidThaiTaxId('0000000000000')).toBe(false); // the old placeholder is rejected
    expect(isValidThaiTaxId('12345')).toBe(false);
  });
});
