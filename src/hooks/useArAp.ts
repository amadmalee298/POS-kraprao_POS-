import type { AccountsPayableItem, AccountsReceivableItem } from '../types';
import { useSharedList } from './useSharedList';

// Receivables and payables: shared by every device of the branch (older versions stored them per
// device, and some first installs carried sample records)
const dropSampleAr = (list: AccountsReceivableItem[]) =>
  list.some((p: any) => p.id === 'ar-001' && String(p.customerName || '').includes('กรุงเทพโซลูชันส์')) ? [] : list;
const dropSampleAp = (list: AccountsPayableItem[]) =>
  list.some((p: any) => p.id === 'ap-001' && String(p.supplierName || '').includes('ซีพี เอฟเอส')) ? [] : list;

export const useReceivables = () => useSharedList<AccountsReceivableItem>('accounts_receivable', 'POS_AR_LIST', dropSampleAr);
export const usePayables = () => useSharedList<AccountsPayableItem>('accounts_payable', 'POS_AP_LIST', dropSampleAp);
