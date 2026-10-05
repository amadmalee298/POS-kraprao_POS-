import { afterEach, describe, expect, it, vi } from 'vitest';
import { appsScriptCode, isScriptUrl, pingScript, pushSheetsToScript } from '../sheetsScript';

/** Run the generated Apps Script against a fake spreadsheet */
function runScript(secret: string, body: unknown, drive?: { folders: Record<string, string[]>; files: { path: string; name: string; mime: string; data: string; trashed?: boolean }[] }) {
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
      return { getId: () => 'id1', getUrl: () => `https://drive/${path}/${blob.name}` };
    },
    getUrl: () => `https://drive/${path}`
  });
  const env = {
    DriveApp: { getRootFolder: () => folder('') },
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
    expect(runScript('abc', { secret: 'abc', ping: true }).reply).toEqual({ ok: true, name: 'ร้าน', url: 'https://docs.google.com/x', version: 2 });
  });

  it('saves a file into the month folder and replaces an earlier copy', () => {
    const drive = { folders: {} as Record<string, string[]>, files: [] as any[] };
    const body = { secret: 'abc', file: { folder: 'รายจ่าย/2569-10', name: 'a.pdf', mimeType: 'application/pdf', base64: btoa('PDF') } };
    const first = runScript('abc', body, drive).reply;
    expect(first).toMatchObject({ ok: true, version: 2, fileUrl: 'https://drive//ครัวกะเพรา POS เอกสาร/รายจ่าย/2569-10/a.pdf' });
    runScript('abc', body, drive);
    expect(drive.folders['']).toEqual(['ครัวกะเพรา POS เอกสาร']);
    expect(drive.files.filter(f => !f.trashed)).toHaveLength(1);
    expect(drive.files[1]).toMatchObject({ name: 'a.pdf', mime: 'application/pdf', data: 'PDF' });
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
