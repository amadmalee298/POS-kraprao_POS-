import type { Expense, ExpenseCategory } from '../types';
import { round2 } from './accounting';

export interface DailyExpenseDay {
  date: string;
  count: number;
  total: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
}

/** The order the categories are shown in (only those used appear) */
const ORDER: ExpenseCategory[] = ['raw_material', 'supplies', 'salary', 'rent', 'utilities', 'equipment', 'marketing', 'other'];

/** Money paid out each day (the amount paid, VAT included) by category, newest day first */
export function dailyExpenseSummary(expenses: Expense[]): {
  days: DailyExpenseDay[];
  categories: ExpenseCategory[];
  byCategory: Partial<Record<ExpenseCategory, number>>;
  total: number;
} {
  const byDay = new Map<string, DailyExpenseDay>();
  const byCategory: Partial<Record<ExpenseCategory, number>> = {};
  let total = 0;
  for (const e of expenses) {
    const date = (e.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Number(e.amount) || 0;
    const cat = (ORDER.includes(e.category) ? e.category : 'other') as ExpenseCategory;
    const day = byDay.get(date) || { date, count: 0, total: 0, byCategory: {} };
    day.count++;
    day.total += amount;
    day.byCategory[cat] = (day.byCategory[cat] || 0) + amount;
    byDay.set(date, day);
    byCategory[cat] = (byCategory[cat] || 0) + amount;
    total += amount;
  }
  const days = [...byDay.values()]
    .map(d => ({ ...d, total: round2(d.total), byCategory: Object.fromEntries(Object.entries(d.byCategory).map(([k, v]) => [k, round2(v || 0)])) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    days,
    categories: ORDER.filter(c => byCategory[c]),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, round2(v || 0)])),
    total: round2(total)
  };
}
