import { SystemSettings } from '../types';

export interface TaxCalculationResult {
  rawSubtotal: number;
  discountAmount: number;
  netSubtotal: number;
  vatRate: number;
  vatType: 'inclusive' | 'exclusive' | 'none';
  enableVat: boolean;
  vatAmount: number;
  grandTotal: number;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Calculates net subtotal, VAT amount, and grand total based on system settings.
 */
export function calculateOrderTotals(
  rawSubtotal: number,
  discountAmount: number,
  settings: Partial<SystemSettings>
): TaxCalculationResult {
  const netSubtotal = Math.max(0, rawSubtotal - Math.max(0, discountAmount || 0));
  const vatRate = typeof settings.vatRate === 'number' ? settings.vatRate : 7;
  const enableVat = settings.enableVat !== false; // default true
  const vatType = settings.vatType || 'inclusive';

  let vatAmount = 0;
  let grandTotal = netSubtotal;

  if (enableVat && vatRate > 0 && vatType !== 'none') {
    if (vatType === 'exclusive') {
      // Exclusive VAT: VAT is added on top of subtotal
      vatAmount = (netSubtotal * vatRate) / 100;
      grandTotal = netSubtotal + vatAmount;
    } else {
      // Inclusive VAT: VAT is extracted from subtotal
      vatAmount = (netSubtotal * vatRate) / (100 + vatRate);
      grandTotal = netSubtotal;
    }
  } else {
    vatAmount = 0;
    grandTotal = netSubtotal;
  }

  // Store money in satang precision so receipts, reports and exports add up exactly
  return {
    rawSubtotal,
    discountAmount,
    netSubtotal: round2(netSubtotal),
    vatRate,
    vatType,
    enableVat,
    vatAmount: round2(vatAmount),
    grandTotal: round2(grandTotal)
  };
}

/** Thai 13-digit taxpayer / national ID with its check digit (dashes and spaces are ignored). */
export function isValidThaiTaxId(raw: string): boolean {
  const id = (raw || '').replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(id)) return false;
  const sum = id
    .slice(0, 12)
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}
