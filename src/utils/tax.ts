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

/**
 * Calculates net subtotal, VAT amount, and grand total based on system settings.
 */
export function calculateOrderTotals(
  rawSubtotal: number,
  discountAmount: number,
  settings: Partial<SystemSettings>
): TaxCalculationResult {
  const netSubtotal = Math.max(0, rawSubtotal - discountAmount);
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

  return {
    rawSubtotal,
    discountAmount,
    netSubtotal,
    vatRate,
    vatType,
    enableVat,
    vatAmount,
    grandTotal
  };
}
