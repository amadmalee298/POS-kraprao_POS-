import { describe, expect, it } from 'vitest';
import { healWebhook } from '../scheduledJobs';
import { openWithSecret } from '../../utils/botSecret';

/** The Firestore client, faked: only what healWebhook uses */
const fakeDb = (config: any) => {
  const writes: any[] = [];
  return { writes, db: { get: async () => config, set: async (_p: string, data: any) => writes.push(data) } as any };
};

const signIn = { branchId: 'main', projectId: 'p', apiKey: 'k', referer: 'https://shop.github.io', refreshToken: 'r-test' };

const telegram = (info: any) => {
  const calls: { method: string; body: any }[] = [];
  const doFetch = (async (url: string, init: any) => {
    const method = url.split('/').pop()!;
    calls.push({ method, body: JSON.parse(init.body) });
    const result = method === 'getWebhookInfo' ? info : true;
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, doFetch };
};

describe('the bot webhook, checked by the scheduled run', () => {
  it('is left alone while Telegram delivers', async () => {
    const { db } = fakeDb({ webhook: true, token: 't' });
    const { calls, doFetch } = telegram({ url: 'https://x.vercel.app/api/telegram/webhook?b=main', pending_update_count: 0 });
    expect(await healWebhook(db, signIn, 'https://x.vercel.app', doFetch)).toBe('bot webhook ok');
    expect(calls.map(c => c.method)).toEqual(['getWebhookInfo']);
  });

  it('is set again when it is gone, with a sign-in only Telegram’s deliveries open', async () => {
    const { db, writes } = fakeDb({ webhook: true, token: 't' });
    const { calls, doFetch } = telegram({ url: '', pending_update_count: 0 });
    expect(await healWebhook(db, signIn, 'https://x.vercel.app', doFetch)).toBe('bot webhook set again (was gone)');
    const set = calls.find(c => c.method === 'setWebhook')!.body;
    const url = new URL(set.url);
    expect(url.origin + url.pathname).toBe('https://x.vercel.app/api/telegram/webhook');
    expect(url.searchParams.get('b')).toBe('main');
    expect(url.searchParams.get('o')).toBe('https://shop.github.io');
    expect(await openWithSecret(url.searchParams.get('s')!, set.secret_token)).toBe('r-test');
    expect(set.max_connections).toBe(1);
    expect(writes[0].webhookHealedAt).toBeTruthy();
  });

  it('does nothing for a shop whose bot runs on a device', async () => {
    const { db } = fakeDb({ webhook: false, token: 't' });
    const { calls, doFetch } = telegram({ url: '' });
    expect(await healWebhook(db, signIn, 'https://x.vercel.app', doFetch)).toBe('');
    expect(calls).toEqual([]);
  });

  it('is not set to an address other than a server', async () => {
    const { db } = fakeDb({ webhook: true, token: 't' });
    const { calls, doFetch } = telegram({ url: '' });
    expect(await healWebhook(db, signIn, undefined, doFetch)).toBe('bot webhook missing (no server address)');
    expect(calls.map(c => c.method)).toEqual(['getWebhookInfo']);
  });
});
