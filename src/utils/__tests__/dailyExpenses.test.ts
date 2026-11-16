import { describe, expect, it } from 'vitest';
import { dailyExpenseSummary } from '../dailyExpenses';

const e = (date: string, category: any, amount: number) => ({ id: `${date}-${amount}`, date, category, amount, title: 'x' }) as any;

describe('daily expense summary', () => {
  it('adds up each day by category, newest first, with the month total', () => {
    const s = dailyExpenseSummary([e('2026-11-15', 'raw_material', 509), e('2026-11-15', 'supplies', 1207), e('2026-11-15', 'raw_material', 350), e('2026-11-16', 'salary', 400.5), e('2026-11-16', 'rent', 3000)]);
    expect(s.days.map(d => d.date)).toEqual(['2026-11-16', '2026-11-15']);
    expect(s.days[1]).toMatchObject({ count: 3, total: 2066, byCategory: { raw_material: 859, supplies: 1207 } });
    expect(s.categories).toEqual(['raw_material', 'supplies', 'salary', 'rent']);
    expect(s.total).toBe(5466.5);
  });
});
