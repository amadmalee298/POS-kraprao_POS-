/**
 * Vercel serverless function: the shop's MCP server for Claude (see src/server/mcp.ts).
 * Added in Claude as a custom connector with the link the app shows (Settings → เชื่อม Claude):
 *   https://<this site>/api/mcp?b=<branch>&k=<connector key>
 * The key is the shop's own (only its SHA-256 is kept, in branches/<b>/config/mcp); making a new
 * one in the app stops the old link. The server reaches the shop's data as the shop account through
 * the sealed sign-in the owner's device keeps for the scheduled notifications.
 */
// .js: the package is ESM and Vercel runs it as plain Node
import { handleMcp, keyHash } from '../src/server/mcp.js';
import { Firestore, idTokenFor } from '../src/server/firestoreRest.js';
import { openShopSignIn, type ShopSignIn } from '../src/server/scheduledJobs.js';
import { SHOP_FIREBASE_PROJECT } from '../src/server/staffAuth.js';

export const maxDuration = 30;
export const config = { maxDuration: 30 };

// The shop's public web settings (the same as in the app; the API key only works from the shop's site)
const PROJECT = {
  projectId: process.env.FIREBASE_PROJECT_ID || SHOP_FIREBASE_PROJECT.projectId,
  apiKey: process.env.FIREBASE_WEB_API_KEY || 'AIzaSyAu7KL49K6c3k3i5aCZNDmwgTLZg6jajec',
  databaseId: process.env.FIREBASE_DATABASE_ID || SHOP_FIREBASE_PROJECT.databaseId || undefined,
  referer: process.env.SHOP_SITE_ORIGIN || 'https://amadmalee298.github.io'
};

const one = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '');

// Kept while the function stays warm (each opening costs a sign-in and a read)
const shops = new Map<string, { signIn: ShopSignIn; db: Firestore; hash: string; at: number }>();

async function shopFor(branchId: string): Promise<{ db: Firestore; hash: string } | { error: string }> {
  const cached = shops.get(branchId);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached;
  const serverKey = (process.env.SCHEDULE_KEY || process.env.ANTHROPIC_API_KEY || '').trim();
  if (!serverKey) return { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า (SCHEDULE_KEY)' };
  const signIn = cached?.signIn || (await openShopSignIn(PROJECT, branchId, serverKey));
  if (!signIn) return { error: 'ยังไม่ได้เชื่อมบัญชีร้านกับเซิร์ฟเวอร์: เปิดแอปบนเครื่องเจ้าของร้านที่เชื่อมบัญชีร้านไว้ แล้วลองใหม่' };
  const db = new Firestore(signIn.projectId, () => idTokenFor(signIn.apiKey, signIn.refreshToken, signIn.referer), signIn.databaseId);
  const cfg: any = await db.get(`branches/${branchId}/config/mcp`);
  const entry = { signIn, db, hash: String(cfg?.keyHash || ''), at: Date.now() };
  shops.set(branchId, entry);
  return entry;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  // No server-to-client stream: Streamable HTTP clients then use plain POST answers
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST, OPTIONS').json({ error: 'Method not allowed' });

  const q = req.query || {};
  const branchId = one(q.b);
  const key = one(q.k);
  const fail = (status: number, message: string) => res.status(status).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message } });
  if (!/^[\w-]{3,80}$/.test(branchId) || key.length < 24) return fail(401, 'ลิงก์ไม่ถูกต้อง: คัดลอกลิงก์ใหม่จากแอป (ตั้งค่า → เชื่อม Claude)');

  try {
    const shop = await shopFor(branchId);
    if ('error' in shop) return fail(503, shop.error);
    if (!shop.hash || shop.hash !== (await keyHash(key))) {
      // A new key made in the app since: read the settings again once
      shops.delete(branchId);
      const again = await shopFor(branchId);
      if ('error' in again) return fail(503, again.error);
      if (!again.hash || again.hash !== (await keyHash(key))) return fail(401, 'ลิงก์นี้ถูกยกเลิกแล้ว: สร้างลิงก์ใหม่ในแอป (ตั้งค่า → เชื่อม Claude)');
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
    const answer = await handleMcp({ db: (shops.get(branchId) as any).db, branchId }, body);
    if (answer === null) return res.status(202).end();
    return res.status(200).json(answer);
  } catch (e: any) {
    console.error('[mcp]', e);
    return fail(500, e?.message || 'failed');
  }
}
