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
  /** The file can be opened by anyone with its link (version 3: bill pictures shown in the app) */
  shared?: boolean;
  /** Files moved to the bin (version 4: documents of a cancelled bill) */
  trashed?: number;
}

/** The script version this app expects (bump when the pasted code changes) */
export const SCRIPT_VERSION = 5;
/** Removing a cancelled bill's documents from Drive works from this version (5 adds the Dashboard sheet) */
export const DRIVE_TRASH_VERSION = 4;
/** Saving documents to Drive works from this version; 3 also shows bill pictures from Drive */
export const DRIVE_MIN_VERSION = 2;
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
    if (data.share) return shareFile(data.share);
    if (data.trash) return trashFiles(data.trash);

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    let rows = 0;
    try {
      if (data.dashboard) writeDashboard(ss, data.dashboard);
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
  // Bill pictures: anyone with the link may view them, so the POS shows them from Drive
  const shared = f.share ? share(file) : false;
  return reply({ ok: true, version: VERSION, fileId: file.getId(), fileUrl: file.getUrl(), folderUrl: folder.getUrl(), shared: shared });
}

// A picture saved earlier, opened to anyone with the link
function shareFile(s) {
  const file = DriveApp.getFileById(String(s.fileId || ''));
  return reply({ ok: true, version: VERSION, fileId: file.getId(), fileUrl: file.getUrl(), shared: share(file) });
}

// Documents of a cancelled bill to the bin: only files kept under ROOT_FOLDER
function trashFiles(t) {
  let trashed = 0;
  (t.fileIds || []).forEach(function (id) {
    try {
      const file = DriveApp.getFileById(String(id));
      if (!underRoot(file)) return;
      file.setTrashed(true);
      trashed++;
    } catch (err) {
      // removed already, or not this account's
    }
  });
  return reply({ ok: true, version: VERSION, trashed: trashed });
}

function underRoot(file) {
  const queue = [];
  const parents = file.getParents();
  while (parents.hasNext()) queue.push(parents.next());
  for (let depth = 0; queue.length && depth < 200; depth++) {
    const folder = queue.shift();
    if (folder.getName() === ROOT_FOLDER) return true;
    const up = folder.getParents();
    while (up.hasNext()) queue.push(up.next());
  }
  return false;
}

function share(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return true;
  } catch (err) {
    return false; // e.g. a Google Workspace that does not allow sharing by link
  }
}

// The Dashboard sheet (version 5): this month's figures, accounts, Top 20 lists and two charts
function writeDashboard(ss, d) {
  const sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard', 0);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();
  const money = '#,##0.00';
  sh.getRange(1, 1).setValue('แดชบอร์ดการเงิน · ' + d.label + ' (ข้อมูลถึง ' + d.asOf + ')').setFontWeight('bold').setFontSize(14);
  // Tiles: label above, value below, two columns each
  const tiles = [
    ['ยอดเงินคงเหลือ', d.cashBalance, '#e8eaf6', money],
    ['รายรับเดือนนี้', d.income, '#e3f2fd', money],
    ['รายจ่ายเดือนนี้', d.expense, '#fbe9e7', money],
    ['กำไรสุทธิเดือนนี้', d.profit, '#fff8e1', money],
    ['อัตรากำไรสุทธิ', d.margin === null ? '' : d.margin / 100, '#e0f2f1', '0.00%'],
    ['กำไรสะสม', d.cumulativeProfit, '#ede7f6', money]
  ];
  tiles.forEach(function (t, i) {
    const col = 1 + i * 2;
    sh.getRange(3, col, 1, 2).merge().setValue(t[0]).setBackground(t[2]).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(4, col, 1, 2).merge().setValue(t[1]).setBackground(t[2]).setNumberFormat(t[3]).setFontSize(14).setHorizontalAlignment('center');
  });
  // Tables from row 6: accounts (A–C), Top 20 income (E–H), Top 20 expenses (J–M)
  const table = function (row, col, title, color, head, rows, formats) {
    sh.getRange(row, col, 1, head.length).merge().setValue(title).setBackground(color).setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(row + 1, col, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#f5f5f5');
    if (rows.length) {
      sh.getRange(row + 2, col, rows.length, head.length).setValues(rows.map(function (r) { return r.map(safe); }));
      formats.forEach(function (f, i) { if (f) sh.getRange(row + 2, col + i, rows.length, 1).setNumberFormat(f); });
    }
  };
  table(6, 1, 'ยอดเงินคงเหลือแต่ละบัญชี', '#bbdefb', ['บัญชี', 'ยอดคงเหลือ', 'สัดส่วน'], d.accounts.map(function (a) { return [a.name, a.amount, a.share / 100]; }), ['', money, '0.0%']);
  const up = '[Color10]"▲ "#,##0.00;[Red]"▼ "#,##0.00;"–"';
  const upBad = '[Red]"▲ "#,##0.00;[Color10]"▼ "#,##0.00;"–"';
  const items = function (xs) { return xs.map(function (x) { return [x.name, x.group, x.amount, x.change]; }); };
  table(6, 5, 'Top 20 รายรับ', '#c8e6c9', ['รายการ', 'หมวดหมู่', 'จำนวนเงิน', 'เปลี่ยนแปลงจากเดือนก่อน'], items(d.topIncome), ['', '', money, up]);
  table(6, 10, 'Top 20 รายจ่าย', '#ffcdd2', ['รายการ', 'หมวดหมู่', 'จำนวนเงิน', 'เปลี่ยนแปลงจากเดือนก่อน'], items(d.topExpense), ['', '', money, upBad]);
  // Months (the charts read this table) below the charts
  const mRow = 50;
  table(mRow, 1, 'รายเดือน', '#eeeeee', ['เดือน', 'รายรับ', 'รายจ่าย', 'กำไร', 'กำไรสะสม'], d.months.map(function (m) { return [m.label, m.income, m.expense, m.profit, m.cumulative]; }), ['', money, money, money, money]);
  const n = d.months.length;
  const labels = sh.getRange(mRow + 1, 1, n + 1, 1);
  sh.insertChart(
    sh.newChart().setChartType(Charts.ChartType.COLUMN)
      .addRange(labels).addRange(sh.getRange(mRow + 1, 2, n + 1, 2))
      .setNumHeaders(1)
      .setOption('title', 'รายรับ – รายจ่าย รายเดือน').setOption('colors', ['#2a78d6', '#eb6834']).setOption('legend', { position: 'top' })
      .setPosition(29, 1, 0, 0).setOption('width', 620).setOption('height', 320).build()
  );
  sh.insertChart(
    sh.newChart().setChartType(Charts.ChartType.COMBO)
      .addRange(labels).addRange(sh.getRange(mRow + 1, 4, n + 1, 2))
      .setNumHeaders(1)
      .setOption('title', 'กำไร และกำไรสะสม').setOption('seriesType', 'bars').setOption('series', { 1: { type: 'line', pointSize: 6 } })
      .setOption('colors', ['#eda100', '#6250d6']).setOption('legend', { position: 'top' })
      .setPosition(29, 8, 0, 0).setOption('width', 620).setOption('height', 320).build()
  );
  sh.setColumnWidths(1, 14, 105);
  return d.topIncome.length + d.topExpense.length;
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
  /** Open to anyone with the link (bill pictures shown in the app) */
  share?: boolean;
}

/** Save a file into the shop's Google Drive through the script (version 2 and up) */
export const saveFileToDrive = (url: string, secret: string, file: DriveFileInput) => post(url, { secret, file });

/** Open a file saved earlier to anyone with its link (version 3 and up) */
export const shareDriveFile = (url: string, secret: string, fileId: string) => post(url, { secret, share: { fileId } });

export { driveFileId } from '../utils/imageRef';

/** Move files saved earlier to the bin (version 4 and up). null: the script is older and cannot */
export async function trashDriveFiles(url: string, secret: string, fileIds: string[]): Promise<number | null> {
  const r = await post(url, { secret, trash: { fileIds } });
  return (r.version || 0) >= DRIVE_TRASH_VERSION && typeof r.trashed === 'number' ? r.trashed : null;
}

/** The sheets, and the Dashboard sheet the script lays out (version 5; older scripts leave it out) */
export const pushSheetsToScript = (url: string, secret: string, sheets: SheetRows[], dashboard?: unknown) => post(url, { secret, sheets, ...(dashboard ? { dashboard } : {}) });

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
