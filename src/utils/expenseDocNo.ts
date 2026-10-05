import type { Expense } from '../types';

// No imports besides types: also used by the Telegram bot on Vercel (plain Node ESM).

/** Next number for the month: 2569/10-001 */
export function nextSubstituteNo(expenses: Pick<Expense, 'date' | 'substituteReceipt'>[], date: string): string {
  const prefix = `${Number(date.slice(0, 4)) + 543}/${date.slice(5, 7)}-`;
  const max = expenses.reduce((m, e) => {
    const no = e.substituteReceipt?.docNo || '';
    return no.startsWith(prefix) ? Math.max(m, Number(no.slice(prefix.length)) || 0) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
