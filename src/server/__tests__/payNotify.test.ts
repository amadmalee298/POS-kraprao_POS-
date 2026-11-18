import { describe, expect, it } from 'vitest';
import { recordPayIn } from '../payNotify';

describe('a money-in notice from the bank app', () => {
  it('is kept with its amount, the oldest dropped past 60', async () => {
    const byId: Record<string, any> = {};
    for (let i = 0; i < 60; i++) byId[`o${i}`] = { id: `o${i}`, amount: 1, at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() };
    const removed: string[] = [];
    const db: any = {
      setFields: async (_p: string, entries: { path: string[]; value: unknown }[]) =>
        entries.forEach(e => (e.value === undefined ? (removed.push(e.path[1]), delete byId[e.path[1]]) : (byId[e.path[1]] = e.value))),
      get: async () => ({ byId })
    };
    const r = await recordPayIn(db, 'main', 'Merchant Pro\n รับเงิน 60.00 บาท', new Date('2026-11-18T10:00:00Z'));
    expect(r).toEqual({ ok: true, amount: 60 });
    expect(Object.values(byId).some((n: any) => n.amount === 60 && n.text === 'Merchant Pro รับเงิน 60.00 บาท')).toBe(true);
    expect(removed).toEqual(['o0']);
    expect((await recordPayIn(db, 'main', 'ไม่มีตัวเลข')).ok).toBe(false);
  });
});
