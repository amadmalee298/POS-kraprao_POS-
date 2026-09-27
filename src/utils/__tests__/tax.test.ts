import { describe, expect, it } from 'vitest';
import { calculateOrderTotals } from '../tax';

describe('calculateOrderTotals', () => {
  it('extracts inclusive VAT (7/107) and keeps the total unchanged', () => {
    const r = calculateOrderTotals(107, 0, { enableVat: true, vatType: 'inclusive', vatRate: 7 });
    expect(r.grandTotal).toBe(107);
    expect(r.vatAmount).toBe(7);
  });

  it('adds exclusive VAT on top of the discounted subtotal', () => {
    const r = calculateOrderTotals(200, 100, { enableVat: true, vatType: 'exclusive', vatRate: 7 });
    expect(r.netSubtotal).toBe(100);
    expect(r.vatAmount).toBe(7);
    expect(r.grandTotal).toBe(107);
  });

  it('rounds money to satang', () => {
    const r = calculateOrderTotals(99.99, 0, { enableVat: true, vatType: 'inclusive', vatRate: 7 });
    expect(r.vatAmount).toBe(6.54);
    expect(Number.isInteger(r.vatAmount * 100)).toBe(true);
  });

  it('ignores negative discounts and never goes below zero', () => {
    expect(calculateOrderTotals(100, -50, { enableVat: false }).grandTotal).toBe(100);
    expect(calculateOrderTotals(100, 500, { enableVat: false }).grandTotal).toBe(0);
  });
});
