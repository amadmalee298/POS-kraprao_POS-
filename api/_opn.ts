/**
 * Opn Payments (Omise) PromptPay: one QR per bill with the exact amount, confirmed by Opn when the
 * customer pays. Shared by the Vercel function (api/payment/promptpay.ts) and server.ts.
 *
 * The secret key stays on the server (env OMISE_SECRET_KEY); the browser only sees charge ids,
 * the QR image and the status.
 */
const OPN_API = 'https://api.omise.co';

/** PromptPay minimum at Opn (THB) */
export const OPN_MIN_AMOUNT = 20;

export interface OpnResult {
  status: number;
  body: Record<string, unknown>;
}

const authHeader = (key: string) => `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

async function opn(key: string, path: string, init: { method?: string; form?: Record<string, string> } = {}) {
  const res = await fetch(`${OPN_API}${path}`, {
    method: init.method || 'GET',
    headers: {
      Authorization: authHeader(key),
      ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const opnError = (data: any, fallback: string): OpnResult => ({
  status: 502,
  body: { error: data?.message || fallback, code: data?.code }
});

/** Charge fields the till needs */
const chargeView = (c: any) => ({
  id: c.id,
  status: c.status as string, // pending | successful | failed | expired | reversed
  paid: c.status === 'successful',
  amount: Number(c.amount) / 100,
  livemode: !!c.livemode,
  expiresAt: c.expires_at || null,
  failure: c.failure_message || null
});

/** Downloads the QR (SVG) with the key, so the page does not need Opn credentials. */
async function qrDataUri(key: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader(key) } });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/svg+xml';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function handleOpnPromptPay(
  method: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  secretKey: string | undefined
): Promise<OpnResult> {
  const key = (secretKey || '').trim();
  if (!key) {
    return { status: 503, body: { error: 'ยังไม่ได้ตั้งค่า OMISE_SECRET_KEY บนเซิร์ฟเวอร์ (Vercel → Settings → Environment Variables)' } };
  }
  const livemode = !key.startsWith('skey_test_');

  if (method === 'GET' && query.check) {
    const { ok, data } = await opn(key, '/account');
    if (!ok) return opnError(data, 'เชื่อมต่อ Opn ไม่สำเร็จ ตรวจสอบ Secret Key');
    return { status: 200, body: { ok: true, livemode, email: data.email || '', currency: data.currency || 'thb' } };
  }

  if (method === 'GET') {
    const id = String(query.id || '');
    if (!/^chrg_[a-z0-9_]+$/i.test(id)) return { status: 400, body: { error: 'charge id ไม่ถูกต้อง' } };
    const { ok, data } = await opn(key, `/charges/${id}`);
    if (!ok) return opnError(data, 'อ่านสถานะการชำระไม่สำเร็จ');
    return { status: 200, body: chargeView(data) };
  }

  if (method === 'POST' && body?.action === 'mark_paid') {
    // Opn allows this only with test keys: lets the shop try the whole flow without real money
    const id = String(body.id || '');
    if (livemode) return { status: 403, body: { error: 'ใช้ได้เฉพาะคีย์ทดสอบ (skey_test_)' } };
    if (!/^chrg_test_[a-z0-9_]+$/i.test(id)) return { status: 400, body: { error: 'charge id ไม่ถูกต้อง' } };
    const { ok, data } = await opn(key, `/charges/${id}/mark_as_paid`, { method: 'POST' });
    if (!ok) return opnError(data, 'จำลองการจ่ายไม่สำเร็จ');
    return { status: 200, body: chargeView(data) };
  }

  if (method === 'POST') {
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount < OPN_MIN_AMOUNT || amount > 150000) {
      return { status: 400, body: { error: `ยอดชำระผ่าน Payment Gateway ต้องอยู่ระหว่าง ${OPN_MIN_AMOUNT} – 150,000 บาท` } };
    }
    const reference = String(body?.reference || '').slice(0, 100);
    const { ok, data } = await opn(key, '/charges', {
      method: 'POST',
      form: {
        amount: String(Math.round(amount * 100)),
        currency: 'THB',
        'source[type]': 'promptpay',
        ...(reference ? { description: reference, 'metadata[reference]': reference } : {})
      }
    });
    if (!ok) return opnError(data, 'สร้าง QR ไม่สำเร็จ');
    const qrUrl = data?.source?.scannable_code?.image?.download_uri;
    const qr = qrUrl ? await qrDataUri(key, qrUrl) : null;
    if (!qr) return { status: 502, body: { error: 'Opn ไม่ได้ส่งรูป QR กลับมา' } };
    return { status: 200, body: { ...chargeView(data), qr } };
  }

  return { status: 405, body: { error: 'Method not allowed' } };
}
