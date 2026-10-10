/**
 * Vercel serverless function: POST /api/telegram/file { token, fileId } → { dataUrl }
 * Backup for the receipt inbox when a browser cannot download a photo from Telegram directly.
 * The bot token comes from the shop's own page and is used only for this request.
 */
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.github\.io|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/i;
const MAX_BYTES = 10 * 1024 * 1024;

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

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const token = String(body.token || '').trim().replace(/^bot/, '');
  const fileId = String(body.fileId || '');
  if (!/^\d+:[\w-]+$/.test(token) || !fileId) return res.status(400).json({ error: 'token/fileId ไม่ถูกต้อง' });

  try {
    const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then(r => r.json());
    if (!info.ok) return res.status(400).json({ error: info.description || 'getFile ไม่สำเร็จ' });
    const file = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!file.ok) return res.status(502).json({ error: `Telegram HTTP ${file.status}` });
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'รูปใหญ่เกินไป' });
    const type = (file.headers.get('content-type') || '').startsWith('image/') ? file.headers.get('content-type') : 'image/jpeg';
    return res.status(200).json({ dataUrl: `data:${type};base64,${buf.toString('base64')}` });
  } catch (e: any) {
    return res.status(502).json({ error: e?.message || 'ดาวน์โหลดรูปไม่สำเร็จ' });
  }
}

// A malformed body is answered as a bad request, not a crash
function safeJson(text: string) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}
