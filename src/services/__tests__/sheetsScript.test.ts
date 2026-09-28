import { afterEach, describe, expect, it, vi } from 'vitest';
import { appsScriptCode, isScriptUrl, pingScript, pushSheetsToScript } from '../sheetsScript';

/** Run the generated Apps Script against a fake spreadsheet */
function runScript(secret: string, body: unknown) {
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
  const env = {
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
    expect(runScript('abc', { secret: 'abc', ping: true }).reply).toEqual({ ok: true, name: 'ร้าน', url: 'https://docs.google.com/x' });
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
