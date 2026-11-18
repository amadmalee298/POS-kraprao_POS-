/**
 * Vercel serverless function: the shop's MCP server for Claude (see src/server/mcp.ts).
 * Added in Claude as a custom connector with the link the app shows (Settings → เชื่อม Claude):
 *   https://<this site>/api/mcp?b=<branch>&k=<connector key>
 * The key is the shop's own (only its SHA-256 is kept, in branches/<b>/config/mcp); making a new
 * one in the app stops the old link. The server reaches the shop's data as the shop account through
 * the sealed sign-in the owner's device keeps for the scheduled notifications.
 */
// .js: the package is ESM and Vercel runs it as plain Node
import { handleMcp } from '../src/server/mcp.js';
import { shopForKey } from '../src/server/shopAccess.js';

export const maxDuration = 30;
export const config = { maxDuration: 30 };

const one = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '');

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  // No server-to-client stream: Streamable HTTP clients then use plain POST answers
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST, OPTIONS').json({ error: 'Method not allowed' });

  const q = req.query || {};
  const branchId = one(q.b);
  const fail = (status: number, message: string) => res.status(status).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message } });
  try {
    const shop = await shopForKey(branchId, one(q.k), 'mcp');
    if ('error' in shop) return fail(shop.status, `${shop.error} (ตั้งค่า → เชื่อม Claude)`);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
    const answer = await handleMcp({ db: shop.db, branchId }, body);
    if (answer === null) return res.status(202).end();
    return res.status(200).json(answer);
  } catch (e: any) {
    console.error('[mcp]', e);
    return fail(500, e?.message || 'failed');
  }
}
