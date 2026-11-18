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

/** The shop's data when the link's key is the one made in the app; otherwise why not (Thai) */
export async function shopForKey(branchId: string, key: string, configDoc: string): Promise<{ db: Firestore } | { status: number; error: string }> {
  if (!/^[\w-]{3,80}$/.test(branchId) || key.length < 24) return { status: 401, error: 'ลิงก์ไม่ถูกต้อง: คัดลอกลิงก์ใหม่จากแอป' };
  const db = await shopDb(branchId);
  if (typeof db === 'string') return { status: 503, error: db };
  const want = await keyHash(key);
  const cacheKey = `${branchId}/${configDoc}`;
  let known = hashes.get(cacheKey);
  // A new key made in the app since: read the settings again
  if (!known || known.hash !== want || Date.now() - known.at > 5 * 60_000) {
    const cfg: any = await db.get(`branches/${branchId}/config/${configDoc}`);
    known = { hash: String(cfg?.keyHash || ''), at: Date.now() };
    hashes.set(cacheKey, known);
  }
  if (!known.hash || known.hash !== want) return { status: 401, error: 'ลิงก์นี้ถูกยกเลิกแล้ว: สร้างลิงก์ใหม่ในแอป' };
  return { db };
}
