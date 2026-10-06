import type { Branch, SystemSettings } from '../types';

/**
 * The shop's own details as printed on receipts, tax invoices and quotations (never sample data).
 * The name is the one set as "ชื่อร้าน / ข้อความส่วนหัวใบเสร็จ", so receipts, documents and the
 * Telegram bot all show the same name.
 */
export function sellerInfo(settings: Partial<SystemSettings>, branch?: Partial<Branch> | null) {
  return {
    name: settings.receiptHeader?.trim() || settings.shopName || branch?.name || '',
    branchName: branch?.name || '',
    address: branch?.address || settings.shopAddress || '',
    taxId: branch?.taxId || settings.shopTaxId || settings.taxId || '',
    phone: branch?.phone || settings.shopPhone || ''
  };
}
