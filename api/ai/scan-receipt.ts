/**
 * Vercel serverless function: POST /api/ai/scan-receipt (Claude reads a receipt photo).
 * Mirrors the route in server.ts so the GitHub Pages site can read receipts with the server's
 * ANTHROPIC_API_KEY instead of keeping a key in the browser. Body: { image, mimeType, todayIso }.
 */
// .js: the package is ESM and Vercel runs it as plain Node
import { runReceiptOcr } from '../../src/utils/receiptOcr.js';
import { createClaudeJsonCaller, ClaudeCallError } from '../../src/utils/claudeClient.js';

const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.github\.io|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/i;

export default async function handler(req: any, res: any) {
  const origin = String(req.headers?.origin || '');
  if (ALLOWED_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'MISSING_API_KEY', message: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บน Vercel' });
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  let image = String(body.image || '');
  let mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
  if (!image) return res.status(400).json({ error: 'กรุณาแนบรูปใบเสร็จ' });
  if (image.includes(';base64,')) {
    const [head, data] = image.split(';base64,');
    mimeType = head.replace(/^data:/, '') || mimeType;
    image = data;
  }
  try {
    const ai = createClaudeJsonCaller({ apiKey: key });
    const receiptData = await runReceiptOcr(
      ({ prompt, system, schema, image: img }) => ai({ prompt, system, schema, image: img, effort: 'high' }),
      { data: image, mimeType },
      { todayIso: typeof body.todayIso === 'string' ? body.todayIso : undefined }
    );
    return res.status(200).json({ receiptData });
  } catch (err: any) {
    const status = err instanceof ClaudeCallError && !err.retryable ? 400 : 502;
    return res.status(status).json({ error: err?.message || 'AI อ่านใบเสร็จไม่สำเร็จ' });
  }
}
