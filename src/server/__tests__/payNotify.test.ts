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
    const r = await recordPayIn(db, 'main', 'Merchant Pro\n รับเงิน 60.00 บาท', new Date('2026-11-18T10:00:00Z'), { app: 'Merchant Pro' });
    expect(r).toEqual({ ok: true, status: 200, amount: 60, verified: true });
    expect(Object.values(byId).some((n: any) => n.amount === 60 && n.text === 'Merchant Pro รับเงิน 60.00 บาท')).toBe(true);
    expect(removed).toEqual(['o0']);
    expect((await recordPayIn(db, 'main', 'รับเงิน ไม่มีตัวเลข')).ok).toBe(false);
  });

  it('counts only the bank app, never a test, and keeps a repeat once', async () => {
    const byId: Record<string, any> = {};
    const db: any = {
      setFields: async (_p: string, entries: { path: string[]; value: unknown }[]) => entries.forEach(e => (e.value === undefined ? delete byId[e.path[1]] : (byId[e.path[1]] = e.value))),
      get: async () => ({ byId })
    };
    const t = new Date('2026-11-25T03:00:00Z');
    expect(await recordPayIn(db, 'main', 'รับเงิน 60 บาท', t, { app: 'LINE' })).toMatchObject({ ok: false, status: 403 });
    expect(await recordPayIn(db, 'main', 'โปรโมชั่น ลด 50 บาท', t, { app: 'Merchant Pro' })).toMatchObject({ ok: false, status: 400 });
    expect(await recordPayIn(db, 'main', 'รับเงิน 60 บาท', t, { app: 'Merchant Pro', test: true })).toMatchObject({ ok: true, verified: false });
    expect(await recordPayIn(db, 'main', 'รับเงิน 75 บาท', t, {})).toMatchObject({ ok: true, verified: false });
    expect(await recordPayIn(db, 'main', 'เงินเข้า 80 บาท', t, { app: 'Bualuang mBanking' })).toMatchObject({ ok: true, verified: true });
    expect(await recordPayIn(db, 'main', 'เงินเข้า 80 บาท', new Date(t.getTime() + 60_000), { app: 'Bualuang mBanking' })).toMatchObject({ duplicate: true });
    expect(Object.values(byId).filter((n: any) => n.amount === 80)).toHaveLength(1);
  });
});
