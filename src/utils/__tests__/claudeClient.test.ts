import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClaudeJsonCaller, CREDIT_EMPTY_MESSAGE } from '../claudeClient';

describe('Claude errors the shop can act on', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says in Thai that the API credit has run out (not the raw error)', async () => {
    const body = { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 400, headers: { 'content-type': 'application/json' } })));
    const ai = createClaudeJsonCaller({ apiKey: 'sk-test' });
    await expect(ai({ system: 's', prompt: 'p', schema: { type: 'object', properties: {} } })).rejects.toMatchObject({ message: CREDIT_EMPTY_MESSAGE, retryable: false });
  });
});
