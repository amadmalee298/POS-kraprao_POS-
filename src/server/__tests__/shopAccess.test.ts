import { beforeEach, describe, expect, it, vi } from 'vitest';

const reads: string[] = [];
let stored = '';
vi.mock('../scheduledJobs.js', () => ({ openShopSignIn: async () => ({ projectId: 'p', apiKey: 'k', refreshToken: 'r', referer: 'x' }) }));
vi.mock('../firestoreRest.js', () => ({
  idTokenFor: async () => 't',
  Firestore: class {
    async get(path: string) {
      reads.push(path);
      return { keyHash: stored };
    }
  }
}));

import { keyHash, resetShopAccessForTests, shopForKey } from '../shopAccess';

const KEY = 'A'.repeat(32);

describe('link keys', () => {
  beforeEach(async () => {
    process.env.SCHEDULE_KEY = 'x';
    resetShopAccessForTests();
    reads.length = 0;
    stored = await keyHash(KEY);
  });

  it('refuses a malformed key without reading anything', async () => {
    expect(await shopForKey('branch-1', 'short', 'mcp')).toMatchObject({ status: 401 });
    expect(await shopForKey('branch-1', 'A'.repeat(31) + '!', 'mcp')).toMatchObject({ status: 401 });
    expect(reads).toHaveLength(0);
  });

  it('stops a revoked link once the short cache is over', async () => {
    let t = 1_000_000;
    const now = () => t;
    expect('db' in (await shopForKey('branch-1', KEY, 'mcp', 'ip', now))).toBe(true);
    stored = '';
    t += 10_000;
    expect('db' in (await shopForKey('branch-1', KEY, 'mcp', 'ip', now))).toBe(true); // cached
    t += 30_000;
    expect(await shopForKey('branch-1', KEY, 'mcp', 'ip', now)).toMatchObject({ status: 401 });
  });

  it('makes a caller that keeps sending wrong keys wait', async () => {
    let t = 5_000_000;
    const now = () => t;
    for (let i = 0; i < 8; i++) expect(await shopForKey('branch-1', 'B'.repeat(32), 'mcp', 'bad', now)).toMatchObject({ status: 401 });
    const before = reads.length;
    expect(await shopForKey('branch-1', 'B'.repeat(32), 'mcp', 'bad', now)).toMatchObject({ status: 429 });
    expect(reads.length).toBe(before);
    expect('db' in (await shopForKey('branch-1', KEY, 'mcp', 'good', now))).toBe(true); // others still get in
    t += 61_000;
    expect(await shopForKey('branch-1', 'B'.repeat(32), 'mcp', 'bad', now)).toMatchObject({ status: 401 });
  });
});
