import { afterEach, describe, expect, it, vi } from 'vitest';
import { botIsGroupAdmin, isGroupChat, serverWebhookInfo } from '../telegramServer';

const answers: Record<string, unknown> = {
  getWebhookInfo: { url: 'https://shop.vercel.app/api/telegram/webhook?x', pending_update_count: 0 },
  getMe: { id: 42, username: 'kaprao_bot', can_read_all_group_messages: false },
  getChatMember: { status: 'member' }
};

afterEach(() => vi.unstubAllGlobals());

describe('bot diagnostics', () => {
  it('tells when the bot cannot read ordinary messages in the shop group', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const method = url.split('/').pop()!;
      return new Response(JSON.stringify({ ok: true, result: answers[method] }));
    }));
    expect(await serverWebhookInfo('1:abc')).toMatchObject({ url: 'https://shop.vercel.app/api/telegram/webhook?x', readsGroupMessages: false, username: 'kaprao_bot' });
    expect(await botIsGroupAdmin('1:abc', '-100123')).toBe(false);
    expect(isGroupChat('-100123')).toBe(true);
    expect(isGroupChat('123456')).toBe(false);
  });
});
