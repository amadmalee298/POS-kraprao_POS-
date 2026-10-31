import { afterEach, describe, expect, it, vi } from 'vitest';
import { Firestore } from '../firestoreRest';

describe('Firestore.setIfUnchanged', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes when nobody got there first, and says so when someone did', async () => {
    const urls: string[] = [];
    let taken = false;
    vi.stubGlobal('fetch', (async (url: string) => {
      urls.push(url);
      if (taken) return { ok: false, status: 409, json: async () => ({ error: { status: 'ALREADY_EXISTS' } }) };
      taken = true;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any);
    const db = new Firestore('p', async () => 'token');
    expect(await db.setIfUnchanged('branches/b/status/job_x', { day: '2026-10-31' }, null)).toBe(true);
    expect(await db.setIfUnchanged('branches/b/status/job_x', { day: '2026-10-31' }, null)).toBe(false);
    expect(urls[0]).toContain('currentDocument.exists=false');
    await db.setIfUnchanged('branches/b/status/job_x', { day: '2026-11-01' }, '2026-10-31T15:00:00.123456Z');
    expect(urls[2]).toContain('currentDocument.updateTime=2026-10-31T15%3A00%3A00.123456Z');
  });
});
