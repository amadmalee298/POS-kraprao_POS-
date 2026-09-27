import type { Branch, SystemSettings } from '../types';

/** The shop's own details as printed on receipts, tax invoices and quotations (never sample data). */
export function sellerInfo(settings: Partial<SystemSettings>, branch?: Partial<Branch> | null) {
  return {
    name: settings.shopName || branch?.name || '',
    branchName: branch?.name || '',
    address: branch?.address || settings.shopAddress || '',
    taxId: branch?.taxId || settings.shopTaxId || settings.taxId || '',
    phone: branch?.phone || settings.shopPhone || ''
  };
}
