import type { AccountsPayableItem, AccountsReceivableItem } from '../types';
import { useKeyedList } from './useKeyedList';

// Receivables and payables: shared by every device of the branch (older versions stored them per
// device, and some first installs carried sample records)
const dropSampleAr = (list: AccountsReceivableItem[]) =>
  list.some((p: any) => p.id === 'ar-001' && String(p.customerName || '').includes('กรุงเทพโซลูชันส์')) ? [] : list;
const dropSampleAp = (list: AccountsPayableItem[]) =>
  list.some((p: any) => p.id === 'ap-001' && String(p.supplierName || '').includes('ซีพี เอฟเอส')) ? [] : list;

export const useReceivables = () => useKeyedList<AccountsReceivableItem>('accounts_receivable', 'POS_AR_LIST', undefined, dropSampleAr);
export const usePayables = () => useKeyedList<AccountsPayableItem>('accounts_payable', 'POS_AP_LIST', undefined, dropSampleAp);
