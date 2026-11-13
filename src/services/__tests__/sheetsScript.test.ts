import { afterEach, describe, expect, it, vi } from 'vitest';
import { appsScriptCode, driveFileId, isScriptUrl, pingScript, pushSheetsToScript } from '../sheetsScript';

/** Run the generated Apps Script against a fake spreadsheet */
function runScript(secret: string, body: unknown, drive?: { folders: Record<string, string[]>; files: { path: string; name: string; mime: string; data: string; trashed?: boolean }[]; sharing?: any }) {
  const sheets: Record<string, { values: unknown[][]; frozen: number }> = {};
  const made: Record<string, unknown> = {};
  const makeSheet = (name: string) => {
    sheets[name] = { values: [], frozen: 0 };
    return {
      clearContents: () => (sheets[name].values = []),
      getRange: () => ({ setValues: (v: unknown[][]) => (sheets[name].values = v) }),
      setFrozenRows: (n: number) => (sheets[name].frozen = n)
    };
  };
  const ss = {
    getName: () => 'ร้าน',
    getUrl: () => 'https://docs.google.com/x',
    getSheetByName: (n: string) => made[n] || null,
    insertSheet: (n: string) => (made[n] = makeSheet(n))
  };
  // A fake Drive: folders by path, files with their content
  const d = drive || { folders: {}, files: [] };
  const folder = (path: string): any => ({
    getFoldersByName: (n: string) => {
      const exists = (d.folders[path] || []).includes(n);
      return { hasNext: () => exists, next: () => folder(`${path}/${n}`) };
    },
    createFolder: (n: string) => {
      (d.folders[path] = d.folders[path] || []).push(n);
      return folder(`${path}/${n}`);
    },
    getFilesByName: (n: string) => {
      const list = d.files.filter(f => f.path === path && f.name === n && !f.trashed);
      let i = 0;
      return { hasNext: () => i < list.length, next: () => ({ setTrashed: () => (list[i++].trashed = true) }) };
    },
    createFile: (blob: { name: string; mime: string; data: string }) => {
      d.files.push({ path, ...blob });
      const file = { getId: () => 'id1', getUrl: () => `https://drive/${path}/${blob.name}`, setSharing: (access: string) => void (file.sharing = access), sharing: '' };
      d.sharing = file;
      return file;
    },
    getUrl: () => `https://drive/${path}`
  });
  const env = {
    DriveApp: { getRootFolder: () => folder(''), getFileById: (id: string) => ((d as any).byId ? (d as any).byId[id] ?? (() => { throw new Error('not found'); })() : d.sharing), Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' } },
    Utilities: {
      base64Decode: (b: string) => atob(b),
      newBlob: (data: string, mime: string, name: string) => ({ data, mime, name, getName: () => name })
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    ContentService: { createTextOutput: (t: string) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } }
  };
  const doPost = new Function(...Object.keys(env), `${appsScriptCode(secret)}\nreturn doPost;`)(...Object.values(env));
  return { reply: JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } })), sheets };
}

describe('Apps Script code', () => {
  it('refuses a wrong secret', () => {
    expect(runScript('abc', { secret: 'x', ping: true }).reply).toMatchObject({ ok: false });
  });

  it('answers a ping with the spreadsheet', () => {
    expect(runScript('abc', { secret: 'abc', ping: true }).reply).toEqual({ ok: true, name: 'ร้าน', url: 'https://docs.google.com/x', version: 5 });
  });

  it('saves a file into the month folder and replaces an earlier copy', () => {
    const drive = { folders: {} as Record<string, string[]>, files: [] as any[] };
    const body = { secret: 'abc', file: { folder: 'รายจ่าย/2569-10', name: 'a.pdf', mimeType: 'application/pdf', base64: btoa('PDF') } };
    const first = runScript('abc', body, drive).reply;
    expect(first).toMatchObject({ ok: true, version: 5, shared: false, fileUrl: 'https://drive//ครัวกะเพรา POS เอกสาร/รายจ่าย/2569-10/a.pdf' });
    runScript('abc', body, drive);
    expect(drive.folders['']).toEqual(['ครัวกะเพรา POS เอกสาร']);
    expect(drive.files.filter(f => !f.trashed)).toHaveLength(1);
    expect(drive.files[1]).toMatchObject({ name: 'a.pdf', mime: 'application/pdf', data: 'PDF' });
  });

  it('opens bill pictures to anyone with the link (saved now, or saved earlier)', () => {
    const drive: any = { folders: {}, files: [] };
    const pic = runScript('abc', { secret: 'abc', file: { folder: 'รายจ่าย/2569-10', name: 'a_สลิปโอน.jpg', mimeType: 'image/jpeg', base64: btoa('JPG'), share: true } }, drive).reply;
    expect(pic).toMatchObject({ ok: true, fileId: 'id1', shared: true });
    expect(drive.sharing.sharing).toBe('link');
    drive.sharing.sharing = '';
    expect(runScript('abc', { secret: 'abc', share: { fileId: 'id1' } }, drive).reply).toMatchObject({ ok: true, shared: true });
    expect(drive.sharing.sharing).toBe('link');
  });

  it('moves the documents of a cancelled bill to the bin, only ones under the POS folder', () => {
    const named = (name: string, up: any[] = []) => ({ getName: () => name, getParents: () => iter(up) });
    const iter = (xs: any[]) => {
      let i = 0;
      return { hasNext: () => i < xs.length, next: () => xs[i++] };
    };
    const root = named('ครัวกะเพรา POS เอกสาร', [named('My Drive')]);
    const files: Record<string, any> = {
      mine: { trashed: false, getParents: () => iter([named('2569-11', [named('รายจ่าย', [root])])]), setTrashed: (v: boolean) => (files.mine.trashed = v) },
      other: { trashed: false, getParents: () => iter([named('Personal', [named('My Drive')])]), setTrashed: (v: boolean) => (files.other.trashed = v) }
    };
    const drive: any = { folders: {}, files: [] };
    const { reply } = runScript('abc', { secret: 'abc', trash: { fileIds: ['mine', 'other', 'gone'] } }, Object.assign(drive, { byId: files }));
    expect(reply).toMatchObject({ ok: true, version: 5, trashed: 1 });
    expect(files.mine.trashed).toBe(true);
    expect(files.other.trashed).toBe(false);
  });

  it('finds a Drive file id in what the app keeps', () => {
    expect(driveFileId({ fileId: 'abc' })).toBe('abc');
    expect(driveFileId({ url: 'https://drive.google.com/file/d/1AbCdEfGhIjK_lm/view?usp=drivesdk' })).toBe('1AbCdEfGhIjK_lm');
    expect(driveFileId({ url: 'https://drive.google.com/open?id=1AbCdEfGhIjK_lm' })).toBe('1AbCdEfGhIjK_lm');
    expect(driveFileId({ url: '' })).toBe('');
  });

  it('writes each sheet padded, keeping formulas and leading zeros as text', () => {
    const { reply, sheets } = runScript('abc', {
      secret: 'abc',
      sheets: [{ title: 'ยอดขาย', values: [['a', 'b', 'c'], ['=HACK()', '0812', 5], ['x']] }]
    });
    expect(reply).toMatchObject({ ok: true, rows: 2 });
    expect(sheets['ยอดขาย'].values).toEqual([['a', 'b', 'c'], ["'=HACK()", "'0812", 5], ['x', '', '']]);
    expect(sheets['ยอดขาย'].frozen).toBe(1);
  });
});

describe('posting to the script', () => {
  afterEach(() => vi.unstubAllGlobals());
  const url = 'https://script.google.com/macros/s/AKfy_abc-123/exec';

  it('knows a web app URL', () => {
    expect(isScriptUrl(url)).toBe(true);
    expect(isScriptUrl('https://script.google.com/macros/s/abc/dev')).toBe(false);
  });

  it('sends a simple text/plain request and reads the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => JSON.stringify({ ok: true, name: 'ร้าน' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(pingScript(url, 's')).resolves.toMatchObject({ ok: true, name: 'ร้าน' });
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toMatch(/^text\/plain/);
  });

  it('explains a sign-in page (web app not open to anyone)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => '<html>Sign in</html>' }));
    await expect(pushSheetsToScript(url, 's', [])).rejects.toThrow(/ทุกคน/);
  });
});

describe('the Dashboard sheet', () => {
  it('lays out the figures, the tables and two charts', () => {
    const written: { at: string; value: unknown }[] = [];
    const charts: string[] = [];
    // A Sheets object where every call can be chained; what is written is noted
    const chain = (at: string): any =>
      new Proxy(function () {}, {
        get: (_t, k) => {
          if (k === 'setValue') return (v: unknown) => (written.push({ at, value: v }), chain(at));
          if (k === 'setValues') return (v: unknown) => (written.push({ at, value: v }), chain(at));
          if (k === 'getCharts') return () => [];
          if (k === 'insertChart') return (c: any) => charts.push(c.title);
          if (k === 'getRange') return (...a: number[]) => chain(a.join(','));
          if (k === 'newChart') {
            const opts: any = {};
            const b: any = new Proxy({}, { get: (_x, m) => (m === 'build' ? () => ({ title: opts.title }) : m === 'setOption' ? (n: string, v: unknown) => ((opts[n] = v), b) : () => b) });
            return () => b;
          }
          return () => chain(at);
        }
      });
    const sheet = chain('');
    const ss = { getSheetByName: () => null, insertSheet: () => sheet, getName: () => 'ร้าน', getUrl: () => 'u' };
    const env = {
      DriveApp: {},
      Utilities: {},
      Charts: { ChartType: { COLUMN: 'column', COMBO: 'combo' } },
      SpreadsheetApp: { getActiveSpreadsheet: () => ss },
      LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
      ContentService: { createTextOutput: (t: string) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } }
    };
    const doPost = new Function(...Object.keys(env), `${appsScriptCode('abc')}\nreturn doPost;`)(...Object.values(env));
    const dashboard = {
      label: 'ตุลาคม 2569',
      asOf: '2026-10-31',
      cashBalance: 2000,
      income: 2000,
      expense: 700,
      profit: 1300,
      margin: 65,
      cumulativeProfit: 2000,
      accounts: [{ code: '1010', name: 'ธนาคาร', amount: 2000, share: 100 }],
      topIncome: [{ name: 'รายได้จากการขาย', group: 'รายได้', amount: 2000, change: 1000 }],
      topExpense: [{ name: '=ค่าไฟ', group: 'ค่าใช้จ่าย', amount: 500, change: 200 }],
      months: [{ month: '2026-10', label: 'ต.ค. 69', income: 2000, expense: 700, profit: 1300, cumulative: 2000 }]
    };
    const reply = JSON.parse(doPost({ postData: { contents: JSON.stringify({ secret: 'abc', sheets: [], dashboard }) } }));
    expect(reply).toMatchObject({ ok: true });
    expect(written.find(w => w.at === '4,9,1,2')?.value).toBe(0.65); // the margin tile, as a percent
    expect(written.find(w => w.at === '8,10,1,4')?.value).toEqual([["'=ค่าไฟ", 'ค่าใช้จ่าย', 500, 200]]); // never a formula
    expect(charts).toEqual(['รายรับ – รายจ่าย รายเดือน', 'กำไร และกำไรสะสม']);
  });
});

describe('Drive not allowed for the script', () => {
  it('is told as the steps to allow it', async () => {
    const { isScriptAuthError, appsScriptCode } = await import('../sheetsScript');
    expect(isScriptAuthError('Exception: คุณไม่ได้รับอนุญาตให้เรียกใช้ DriveApp.getRootFolder สิทธิ์ที่จำเป็นคือ (https://www.googleapis.com/auth/drive)')).toBe(true);
    expect(isScriptAuthError('Exception: You do not have permission to call DriveApp.getRootFolder.')).toBe(true);
    expect(isScriptAuthError('รหัสลับไม่ตรงกับในแอป')).toBe(false);
    expect(appsScriptCode('x')).toContain('function authorize()');
  });
});

