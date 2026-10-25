import { afterEach, describe, expect, it, vi } from 'vitest';
import { bangkokNow, filingsToRemind, openSchedule, runShop, sealSchedule, summaryDue } from '../scheduledJobs';

describe('scheduled notifications', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the time in Bangkok', () => {
    expect(bangkokNow(new Date('2026-10-25T15:05:00Z'))).toEqual({ day: '2026-10-25', time: '22:05' });
    expect(bangkokNow(new Date('2026-10-25T17:30:00Z'))).toEqual({ day: '2026-10-26', time: '00:30' });
  });

  it('sends the summary once its time has come, and catches up a missed day', () => {
    expect(summaryDue({ day: '2026-10-25', time: '21:59' }, '22:00', '2026-10-24')).toBeNull();
    expect(summaryDue({ day: '2026-10-25', time: '22:00' }, '22:00', '2026-10-24')).toEqual({ day: '2026-10-25', catchUp: false });
    expect(summaryDue({ day: '2026-10-25', time: '23:30' }, '22:00', '2026-10-25')).toBeNull();
    // Nobody sent yesterday's: sent in the morning
    expect(summaryDue({ day: '2026-10-25', time: '08:00' }, '22:00', '2026-10-23')).toEqual({ day: '2026-10-24', catchUp: true });
  });

  it('reminds of filings due within 3 days or late', () => {
    const filings = [
      { key: 'a', title: 'ภ.พ.30 (กันยายน 2569)', dueDate: '2026-10-23' },
      { key: 'b', title: 'ภ.ง.ด.1 (ตุลาคม 2569)', dueDate: '2026-11-15' },
      { key: 'c', title: 'ภ.ง.ด.3 (ตุลาคม 2569)', dueDate: '2026-10-28' }
    ];
    expect(filingsToRemind(filings, '2026-10-25')).toEqual([
      '• ภ.พ.30 (กันยายน 2569) ยื่นภายใน 23/10/2569 — เลยกำหนด 2 วัน',
      '• ภ.ง.ด.3 (ตุลาคม 2569) ยื่นภายใน 28/10/2569 — อีก 3 วัน'
    ]);
  });

  it('only the server key opens a sealed sign-in', async () => {
    const signIn = { branchId: 'main', projectId: 'p', apiKey: 'k', refreshToken: 'r' };
    const sealed = await sealSchedule(signIn, 'server-key');
    expect(sealed).not.toContain('"r"');
    expect(await openSchedule(sealed, 'server-key')).toEqual(signIn);
    expect(await openSchedule(sealed, 'other-key')).toBeNull();
  });

  it('sends the day summary and claims it so it is not sent again', async () => {
    const docs: Record<string, any> = {
      'branches/main/config/notifications': { credentials: { telegramToken: 'T', telegramChatId: '-100' }, triggers: { dailySummary: true }, rules: { dailySummaryTime: '22:00' } },
      'branches/main/config/schedule': { lowStock: 2, shopLine: 'ครัวกะเพรา · ตลาด' },
      'branches/main/status/job_daily_summary': { day: '2026-10-24' }
    };
    const sent: string[] = [];
    const fsValue = (v: any): any =>
      typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])) } } : { nullValue: null };
    const fromFs = (f: any): any => Object.fromEntries(Object.entries(f || {}).map(([k, v]: any) => [k, v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.mapValue ? fromFs(v.mapValue.fields) : v.booleanValue ?? null)]));
    const fakeFetch = (async (url: string, init: any = {}) => {
      const json = (body: any, status = 200) => ({ ok: status < 300, status, json: async () => body }) as any;
      if (url.startsWith('https://securetoken')) return json({ id_token: 'id', expires_in: '3600' });
      if (url.startsWith('https://api.telegram.org')) {
        sent.push(JSON.parse(init.body).text);
        return json({ ok: true });
      }
      if (url.endsWith(':runQuery')) {
        const q = JSON.parse(init.body).structuredQuery;
        const coll = q.from[0].collectionId;
        const rows =
          coll === 'orders'
            ? [{ branchId: 'main', createdAt: '2026-10-25T05:00:00.000Z', status: 'served', grandTotal: 150 }]
            : coll === 'expenses'
              ? [{ id: 'e1', branchId: 'main', date: '2026-10-25', category: 'utilities', title: 'ค่าไฟ', amount: 50 }]
              : [];
        return json(rows.map(r => ({ document: { name: `x/${coll}/1`, fields: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fsValue(v)])) } })));
      }
      const path = decodeURIComponent(url.split('/documents/')[1] || '').split('?')[0];
      if (init.method === 'PATCH') {
        docs[path] = fromFs(JSON.parse(init.body).fields);
        return json({});
      }
      return docs[path] ? json({ fields: fsValue(docs[path]).mapValue.fields }) : json({}, 404);
    }) as unknown as typeof fetch;

    // The Firestore client calls fetch itself
    vi.stubGlobal('fetch', fakeFetch);
    const signIn = { branchId: 'main', projectId: 'p', apiKey: 'k', refreshToken: 'r-test' };
    expect(await runShop(signIn, new Date('2026-10-25T15:05:00Z'), fakeFetch)).toEqual(['summary 2026-10-25']);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('150.00');
    expect(sent[0]).toContain('รายจ่าย: 50.00');
    expect(sent[0]).toContain('วัตถุดิบใกล้หมด 2 รายการ');
    expect(sent[0]).toContain('🏪 ครัวกะเพรา · ตลาด');
    expect(docs['branches/main/status/job_daily_summary'].day).toBe('2026-10-25');
    // The next run (or a device) does not send it again
    expect(await runShop(signIn, new Date('2026-10-25T15:20:00Z'), fakeFetch)).toEqual([]);
    expect(sent).toHaveLength(1);
  });
});
