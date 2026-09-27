import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOpnPromptPay } from '../../../api/_opn';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('Opn PromptPay handler', () => {
  it('refuses without a secret key', async () => {
    const r = await handleOpnPromptPay('POST', {}, { amount: 100 }, '');
    expect(r.status).toBe(503);
  });

  it('rejects amounts below the gateway minimum', async () => {
    const r = await handleOpnPromptPay('POST', {}, { amount: 15 }, 'skey_test_x');
    expect(r.status).toBe(400);
  });

  it('creates a charge in satang and returns the QR as a data URI', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/charges')) {
        expect(init?.method).toBe('POST');
        const form = new URLSearchParams(String(init?.body));
        expect(form.get('amount')).toBe('12550');
        expect(form.get('source[type]')).toBe('promptpay');
        return json({
          id: 'chrg_test_abc',
          status: 'pending',
          amount: 12550,
          livemode: false,
          source: { scannable_code: { image: { download_uri: 'https://api.omise.co/qr.svg' } } }
        });
      }
      return new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await handleOpnPromptPay('POST', {}, { amount: 125.5, reference: 'สาขา 1' }, 'skey_test_x');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'chrg_test_abc', paid: false, amount: 125.5, livemode: false });
    expect(String(r.body.qr)).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('reports a paid charge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ id: 'chrg_test_abc', status: 'successful', amount: 5000, livemode: false })));
    const r = await handleOpnPromptPay('GET', { id: 'chrg_test_abc' }, undefined, 'skey_test_x');
    expect(r.body).toMatchObject({ paid: true, amount: 50 });
  });

  it('only simulates payments with test keys', async () => {
    const r = await handleOpnPromptPay('POST', {}, { action: 'mark_paid', id: 'chrg_test_abc' }, 'skey_live_x');
    expect(r.status).toBe(403);
  });

  it('rejects malformed charge ids', async () => {
    const r = await handleOpnPromptPay('GET', { id: '../account' }, undefined, 'skey_test_x');
    expect(r.status).toBe(400);
  });
});
