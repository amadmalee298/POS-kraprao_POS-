import { describe, expect, it, vi } from 'vitest';
import { bearerToken, isShopStaff, SHOP_FIREBASE_PROJECT } from '../staffAuth';
import firebaseConfig from '../../../firebase-applet-config.json';

const token = (exp: number) =>
  ['x', Buffer.from(JSON.stringify({ exp: Math.floor(exp / 1000) })).toString('base64url'), 'sig'].join('.');

describe('isShopStaff', () => {
  const now = Date.UTC(2026, 9, 10);

  it('uses the same Firebase project as the app', () => {
    expect(SHOP_FIREBASE_PROJECT.projectId).toBe(firebaseConfig.projectId);
  });

  it('accepts a token that may read the staff list, asking Firestore of this project', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const t = token(now + 3600_000);
    expect(await isShopStaff(t, { fetchImpl: fetchImpl as any, now, projectId: 'p1', databaseId: '' })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/projects/p1/databases/(default)/documents/access/staff');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${t}`);
  });

  it('refuses customers and strangers (Firestore says no), and expired or missing tokens', async () => {
    const denied = vi.fn(async () => new Response('{}', { status: 403 }));
    expect(await isShopStaff(token(now + 3600_000) + 'x', { fetchImpl: denied as any, now })).toBe(false);
    const never = vi.fn();
    expect(await isShopStaff(token(now - 1000), { fetchImpl: never as any, now })).toBe(false);
    expect(await isShopStaff('', { fetchImpl: never as any, now })).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });

  it('reads the bearer token from the header', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken(undefined)).toBe('');
  });
});
