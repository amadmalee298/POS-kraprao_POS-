/**
 * Vercel serverless function: POST /api/payment/notify?b=<branch>&k=<key>  { text }
 * A "money in" notification from the shop's bank app, forwarded by MacroDroid on an Android phone at
 * the shop (see src/server/payNotify.ts). The link is made in the app (Payment settings → แจ้งเงินเข้า
 * Merchant Pro); only its key's SHA-256 is kept (branches/<b>/config/payin).
 */
import { recordPayIn } from '../../src/server/payNotify.js';
import { callerOf, shopForKey } from '../../src/server/shopAccess.js';

const one = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '');

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const q = req.query || {};
  const shop = await shopForKey(one(q.b), one(q.k), 'payin', callerOf(req)).catch((e: any) => ({ status: 500, error: e?.message || 'failed' }));
  if ('error' in shop) return res.status(shop.status).json({ ok: false, error: shop.error });
  // MacroDroid sends JSON {text, app}; a GET with ?text= is a test from the browser (never counts as payment)
  const body = typeof req.body === 'string' ? req.body : req.body || {};
  const text = typeof body === 'string' ? body : String(body.text || body.message || body.notification || one(q.text) || '');
  const app = typeof body === 'string' ? '' : String(body.app || body.app_name || body.package || '');
  try {
    const result = await recordPayIn(shop.db, one(q.b), text, new Date(), { app, test: req.method === 'GET' });
    const { status, ...rest } = result;
    return res.status(status).json(rest);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'failed' });
  }
}
