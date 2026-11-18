/**
 * A server function reached with a link the owner makes in the app (Claude's MCP connector, the
 * Merchant Pro forwarder): the shop's data as the shop account (the sealed sign-in its owner's
 * device keeps), and the link's key checked against the SHA-256 kept in branches/<b>/config/<doc>.
 */
import { Firestore, idTokenFor } from './firestoreRest.js';
import { openShopSignIn } from './scheduledJobs.js';
import { SHOP_FIREBASE_PROJECT } from './staffAuth.js';

// The shop's public web settings (the same as in the app; the API key only works from the shop's site)
export const SHOP_PROJECT = {
  projectId: process.env.FIREBASE_PROJECT_ID || SHOP_FIREBASE_PROJECT.projectId,
  apiKey: process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAu7KL49K6c3k3i5aCZNDmwgTLZg6jajec',
  databaseId: process.env.FIREBASE_DATABASE_ID || SHOP_FIREBASE_PROJECT.databaseId || undefined,
  referer: process.env.SHOP_SITE_ORIGIN || 'https://amadmalee298.github.io'
};

/** SHA-256 of a key in hex (only this is kept in the shop's settings) */
export async function keyHash(key: string): Promise<string> {
  const c: any = (globalThis as any).crypto;
  const subtle: SubtleCrypto = c?.subtle || (await import('node:crypto')).webcrypto.subtle;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

// Kept while the function stays warm (each opening costs a sign-in and a read)
const dbs = new Map<string, { db: Firestore; at: number }>();
const hashes = new Map<string, { hash: string; at: number }>();

async function shopDb(branchId: string): Promise<Firestore | string> {
  const cached = dbs.get(branchId);
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.db;
  const serverKey = (process.env.SCHEDULE_KEY || process.env.ANTHROPIC_API_KEY || '').trim();
  if (!serverKey) return 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า (SCHEDULE_KEY)';
  const signIn = await openShopSignIn(SHOP_PROJECT, branchId, serverKey);
  if (!signIn) return 'ยังไม่ได้เชื่อมบัญชีร้านกับเซิร์ฟเวอร์: เปิดแอปบนเครื่องเจ้าของร้านที่เชื่อมบัญชีร้านไว้ แล้วลองใหม่';
  const db = new Firestore(signIn.projectId, () => idTokenFor(signIn.apiKey, signIn.refreshToken, signIn.referer), signIn.databaseId);
  dbs.set(branchId, { db, at: Date.now() });
  return db;
}

// Wrong keys: each costs a settings read, so a caller (and a branch overall) that keeps failing waits a minute
const FAIL_WINDOW = 60_000;
const MAX_FAILS_PER_CALLER = 8;
const MAX_FAILS_PER_BRANCH = 40;
const fails = new Map<string, number[]>();

function recentFails(id: string, now: number): number[] {
  const list = (fails.get(id) || []).filter(t => now - t < FAIL_WINDOW);
  if (list.length) fails.set(id, list);
  else fails.delete(id);
  return list;
}

function noteFail(ids: string[], now: number) {
  if (fails.size > 2000) fails.clear();
  for (const id of ids) fails.set(id, [...recentFails(id, now), now]);
}

/** Only for tests */
export function resetShopAccessForTests() {
  dbs.clear();
  hashes.clear();
  fails.clear();
}

/** The caller's address from Vercel's headers (for the wrong-key limit) */
export function callerOf(req: any): string {
  const h = req?.headers || {};
  const fwd = String(Array.isArray(h['x-forwarded-for']) ? h['x-forwarded-for'][0] : h['x-forwarded-for'] || '');
  return (fwd.split(',')[0] || String(h['x-real-ip'] || '')).trim() || 'unknown';
}

/** The keys the app makes: 24 random bytes in base64url (32 characters) */
const KEY_FORMAT = /^[A-Za-z0-9_-]{24,128}$/;
// A key that matched is trusted this long before the settings are read again (a revoked link stops within it)
const HASH_TTL = 30_000;

/** The shop's data when the link's key is the one made in the app; otherwise why not (Thai) */
export async function shopForKey(
  branchId: string,
  key: string,
  configDoc: string,
  caller = 'unknown',
  now: () => number = Date.now
): Promise<{ db: Firestore } | { status: number; error: string }> {
  if (!/^[\w-]{3,80}$/.test(branchId) || !KEY_FORMAT.test(key)) return { status: 401, error: 'ลิงก์ไม่ถูกต้อง: คัดลอกลิงก์ใหม่จากแอป' };
  const callerId = `${branchId}|${caller}`;
  const branchIdKey = `${branchId}|*`;
  if (recentFails(callerId, now()).length >= MAX_FAILS_PER_CALLER || recentFails(branchIdKey, now()).length >= MAX_FAILS_PER_BRANCH) {
    return { status: 429, error: 'ลองผิดหลายครั้งเกินไป: รอ 1 นาทีแล้วลองใหม่' };
  }
  const want = await keyHash(key);
  const cacheKey = `${branchId}/${configDoc}`;
  const known = hashes.get(cacheKey);
  if (known && known.hash === want && now() - known.at < HASH_TTL) {
    const db = await shopDb(branchId);
    return typeof db === 'string' ? { status: 503, error: db } : { db };
  }
  const db = await shopDb(branchId);
  if (typeof db === 'string') return { status: 503, error: db };
  const cfg: any = await db.get(`branches/${branchId}/config/${configDoc}`);
  const hash = String(cfg?.keyHash || '');
  if (!hash || hash !== want) {
    hashes.delete(cacheKey);
    noteFail([callerId, branchIdKey], now());
    return { status: 401, error: 'ลิงก์นี้ถูกยกเลิกแล้ว: สร้างลิงก์ใหม่ในแอป' };
  }
  hashes.set(cacheKey, { hash, at: now() });
  return { db };
}
