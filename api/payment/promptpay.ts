/**
 * Vercel serverless function: /api/payment/promptpay (Opn Payments PromptPay).
 *   GET  ?check=1        test the key
 *   POST {amount, reference}  create a charge, returns the QR
 *   GET  ?id=chrg_...    charge status
 *   POST {action: 'mark_paid', id}  test keys only
 * Needs env OMISE_SECRET_KEY. Callable from the GitHub Pages site (CORS), like api/notify/line.ts.
 */
import { handleOpnPromptPay } from '../_opn.js'; // .js: the package is ESM and Vercel runs it as plain Node

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.github\.io|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/i;

export default async function handler(req: any, res: any) {
  const origin = String(req.headers?.origin || '');
  const extra = String(process.env.PAYMENT_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (ALLOWED_ORIGIN.test(origin) || extra.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const result = await handleOpnPromptPay(req.method, req.query || {}, body, process.env.OMISE_SECRET_KEY);
  return res.status(result.status).json(result.body);
}
