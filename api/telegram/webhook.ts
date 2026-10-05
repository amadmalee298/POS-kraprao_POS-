/**
 * Vercel serverless function: the shop's Telegram bot (see src/server/telegramWebhook).
 * - POST from Telegram (header X-Telegram-Bot-Api-Secret-Token): one update, handled at once
 * - POST ?check=1 from the app: can this server sign in to the shop's data? (before switching over)
 * - GET: is the function deployed, is ANTHROPIC_API_KEY set?
 */
// .js: the package is ESM and Vercel runs it as plain Node
import { checkWebhookSetup, handleWebhook } from '../../src/server/telegramWebhook.js';

// Reading a receipt with AI can take a while (both forms Vercel reads)
export const maxDuration = 60;
export const config = { maxDuration: 60 };

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.github\.io|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/i;

const one = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '');

export default async function handler(req: any, res: any) {
  const origin = String(req.headers?.origin || '');
  if (ALLOWED_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (req.method === 'GET') return res.status(200).json({ ok: true, bot: 2, ai: !!anthropicKey.trim() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const q = req.query || {};

  if (one(q.check) === '1') {
    try {
      const result = await checkWebhookSetup(
        {
          branchId: String(body.branchId || ''),
          projectId: String(body.projectId || ''),
          apiKey: String(body.apiKey || ''),
          refreshToken: String(body.refreshToken || ''),
          databaseId: body.databaseId ? String(body.databaseId) : undefined,
          referer: origin || undefined
        },
        anthropicKey
      );
      return res.status(200).json(result);
    } catch (e: any) {
      return res.status(200).json({ ok: false, error: e?.message || 'ตรวจสอบไม่สำเร็จ', ai: !!anthropicKey.trim() });
    }
  }

  try {
    const result = await handleWebhook(
      {
        branchId: one(q.b),
        projectId: one(q.p),
        apiKey: one(q.k),
        databaseId: one(q.d) || undefined,
        sealed: one(q.s),
        referer: one(q.o) || undefined,
        secret: String(req.headers?.['x-telegram-bot-api-secret-token'] || ''),
        update: body
      },
      { anthropicKey }
    );
    return res.status(result.status).json(result.body);
  } catch (e: any) {
    // Signing in to the shop's data failed: answered as an error, so Telegram keeps the message and
    // tries again later, and its getWebhookInfo shows the reason (the app's bot settings show it)
    console.error('[telegram webhook]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
