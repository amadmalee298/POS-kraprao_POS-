/**
 * Google Sheets through an Apps Script that lives in the shop's own spreadsheet. The script runs
 * as the shop's Google account, so the devices never sign in to Google and nothing expires; the
 * POS only posts the rows to the script's web app URL together with a shared secret.
 */

export type SheetRows = { title: string; values: (string | number)[][] };

export interface ScriptReply {
  ok: boolean;
  error?: string;
  name?: string; // spreadsheet name
  url?: string; // spreadsheet URL
  rows?: number;
  /** Script version: 2 and up can save files to Google Drive */
  version?: number;
  fileUrl?: string;
  fileId?: string;
  folderUrl?: string;
}

/** The script version this app expects (bump when the pasted code changes) */
export const SCRIPT_VERSION = 2;
/** Top folder in the shop's Google Drive for documents saved from the POS */
export const DRIVE_ROOT_FOLDER = 'ครัวกะเพรา POS เอกสาร';

/** A web app URL of a deployed Apps Script */
export const isScriptUrl = (url: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test((url || '').trim());

export const newScriptSecret = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
};

/** The script the shop pastes into Extensions → Apps Script of its spreadsheet */
export const appsScriptCode = (secret: string) => `// ครัวกะเพรา POS → Google Sheets + Google Drive (วางแทนโค้ดทั้งหมดในไฟล์ Code.gs)
// เวอร์ชัน ${SCRIPT_VERSION}
const SECRET = '${secret}';
const VERSION = ${SCRIPT_VERSION};
const ROOT_FOLDER = '${DRIVE_ROOT_FOLDER}';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) return reply({ ok: false, error: 'รหัสลับไม่ตรงกับในแอป' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (data.ping) return reply({ ok: true, name: ss.getName(), url: ss.getUrl(), version: VERSION });
    if (data.file) return saveFile(data.file);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    let rows = 0;
    try {
      (data.sheets || []).forEach(function (s) {
        const sheet = ss.getSheetByName(s.title) || ss.insertSheet(s.title);
        sheet.clearContents();
        if (!s.values || !s.values.length) return;
        const width = Math.max.apply(null, s.values.map(function (r) { return r.length; }));
        const values = s.values.map(function (r) {
          const row = r.map(safe);
          while (row.length < width) row.push('');
          return row;
        });
        sheet.getRange(1, 1, values.length, width).setValues(values);
        sheet.setFrozenRows(1);
        rows += values.length - 1;
      });
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true, name: ss.getName(), url: ss.getUrl(), rows: rows });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

// A document from the POS (e.g. an expense receipt) into Drive: ROOT_FOLDER/<folder>/<name>
function saveFile(f) {
  let folder = folderByName(DriveApp.getRootFolder(), ROOT_FOLDER);
  String(f.folder || '').split('/').filter(String).forEach(function (part) { folder = folderByName(folder, part); });
  const blob = Utilities.newBlob(Utilities.base64Decode(f.base64), f.mimeType || 'application/octet-stream', f.name || 'file');
  // The same name again replaces the earlier copy
  const old = folder.getFilesByName(blob.getName());
  while (old.hasNext()) old.next().setTrashed(true);
  const file = folder.createFile(blob);
  return reply({ ok: true, version: VERSION, fileId: file.getId(), fileUrl: file.getUrl(), folderUrl: folder.getUrl() });
}

function folderByName(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

// Text is kept as text: never run as a formula, and codes like 0812 keep their leading zero
function safe(v) {
  if (typeof v === 'string' && (/^[=+\\-@]/.test(v) || /^0\\d/.test(v))) return "'" + v;
  return v;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;

async function post(url: string, body: unknown): Promise<ScriptReply> {
  if (!isScriptUrl(url)) throw new Error('ลิงก์ไม่ถูกต้อง ต้องเป็นลิงก์ Web app ที่ลงท้ายด้วย /exec');
  let res: Response;
  try {
    // text/plain keeps this a simple request (Apps Script does not answer CORS preflight)
    res = await fetch(url.trim(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('ติดต่อ Apps Script ไม่ได้ ตรวจสอบอินเทอร์เน็ต และว่าตอนเผยแพร่เลือก “ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน”');
  }
  const text = await res.text();
  let reply: ScriptReply;
  try {
    reply = JSON.parse(text);
  } catch {
    // A Google sign-in page instead of the script's answer: the web app is not open to "Anyone"
    throw new Error('Apps Script ไม่ตอบกลับเป็นข้อมูล: ตอนเผยแพร่ต้องเลือก “เรียกใช้ในฐานะ: ฉัน” และ “ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน” แล้วใช้ลิงก์ /exec ใหม่');
  }
  if (!reply.ok) throw new Error(reply.error || 'Apps Script แจ้งว่าไม่สำเร็จ');
  return reply;
}

export const pingScript = (url: string, secret: string) => post(url, { secret, ping: true });

export interface DriveFileInput {
  folder: string; // e.g. "รายจ่าย/2569-10"
  name: string;
  mimeType: string;
  base64: string; // file content, no data: prefix
}

/** Save a file into the shop's Google Drive through the script (version 2 and up) */
export const saveFileToDrive = (url: string, secret: string, file: DriveFileInput) => post(url, { secret, file });

export const pushSheetsToScript = (url: string, secret: string, sheets: SheetRows[]) => post(url, { secret, sheets });

// When this device last sent (kept per device: each device may run the automatic send)
const LAST_KEY = 'POS_SHEETS_SCRIPT_LAST';
export interface LastPush {
  at: string;
  ok: boolean;
  message: string;
  url?: string;
}
export const readLastPush = (): LastPush | null => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
  } catch {
    return null;
  }
};
export const writeLastPush = (p: LastPush) => {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(p));
  } catch {
    // shown for this visit only
  }
  window.dispatchEvent(new CustomEvent('sheets-script-pushed', { detail: p }));
};

/*
 * Automatic sending is chosen per device (e.g. only the cashier's tablet), so a device that has
 * not loaded every order yet does not replace the sheet with less.
 */
const AUTO_KEY = 'POS_SHEETS_SCRIPT_AUTO';
export const readAutoMinutes = (): number => {
  try {
    return Number(localStorage.getItem(AUTO_KEY)) || 0;
  } catch {
    return 0;
  }
};
export const writeAutoMinutes = (m: number) => {
  try {
    localStorage.setItem(AUTO_KEY, String(m));
  } catch {
    // this visit only
  }
  window.dispatchEvent(new CustomEvent('sheets-script-auto', { detail: m }));
};
