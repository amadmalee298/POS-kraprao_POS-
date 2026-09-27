/**
 * Vercel serverless function: POST /api/notify/line
 *
 * The LINE Messaging API does not accept calls from browsers (no CORS), and the app is deployed
 * as static files on Vercel where server.ts does not run. This function relays one push message,
 * mirroring the /api/notify/line route in server.ts.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { lineToken, to, message } = (typeof req.body === 'string' ? safeJson(req.body) : req.body) || {};
  if (typeof lineToken !== 'string' || !lineToken.trim() || typeof to !== 'string' || !to.trim() || typeof message !== 'string' || !message) {
    return res.status(400).json({ error: 'กรุณาระบุ Channel Access Token, User/Group ID และข้อความ' });
  }
  if (!/^[UCR][0-9a-f]{32}$/i.test(to.trim())) {
    return res.status(400).json({ error: 'User/Group ID ไม่ถูกต้อง (ต้องขึ้นต้นด้วย U, C หรือ R ตามด้วยตัวอักษร 32 ตัว)' });
  }
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken.trim()}` },
      // LINE text messages are limited to 5,000 characters
      body: JSON.stringify({ to: to.trim(), messages: [{ type: 'text', text: message.slice(0, 5000) }] })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return res.status(400).json({ error: data.message || 'เกิดข้อผิดพลาดจาก LINE Messaging API (โปรดตรวจสอบ Token และ ID ผู้รับ)' });
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'ติดต่อ LINE ไม่ได้' });
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
