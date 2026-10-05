import type { Expense, ExpenseCategory, IncomeCategory, Order, OtherIncome } from '../types';
import { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS } from '../utils/accounting';
import { cleanBotToken } from './telegramInbox';

/**
 * The shop's Telegram bot as a bookkeeping assistant (like the LINE bookkeeping bots): a slip or
 * bill photo is read and recorded straight away, the bot answers with a card of what was saved and
 * buttons to view the document, add photos, edit or delete it. Typing "จ่าย ค่าผัก 135 บาท" records
 * an entry without a photo, and the menu keyboard gives summaries and the Drive folder.
 * Everything here is plain logic; the poller (TelegramInboxPoller) does the Bot API calls.
 */

export const BOT_MODE_KEY = 'POS_TG_BOT_MODE';
export const BOT_STATE_KEY = 'POS_TG_BOT_STATE';
export const DRIVE_FOLDER_KEY = 'POS_DRIVE_FOLDER_URL';

/** auto: record at once (edit afterwards in the chat) · approve: wait for a manager in the POS */
export type BotMode = 'auto' | 'approve';

export const readBotMode = (): BotMode => {
  try {
    return localStorage.getItem(BOT_MODE_KEY) === 'approve' ? 'approve' : 'auto';
  } catch {
    return 'auto';
  }
};

export function writeBotMode(mode: BotMode) {
  try {
    localStorage.setItem(BOT_MODE_KEY, mode);
  } catch {
    // storage unavailable
  }
}

// ---------- Typed entries: "จ่าย วันที่ 5/10/26 ค่าผัก 135 บาท ร้านค้า ตลาดสด" ----------

export interface TypedEntry {
  kind: 'expense' | 'income';
  date: string; // YYYY-MM-DD
  title: string;
  amount: number;
  vendor: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** d/m, d/m/yy or d/m/yyyy, in Buddhist or Christian years (5/10/69, 5/10/26, 5/10/2569) */
export function parseThaiDate(d: number, m: number, y: number | undefined, today: string): string | null {
  let year = Number(today.slice(0, 4));
  if (y !== undefined) {
    if (y >= 2400) year = y - 543;
    else if (y >= 1900) year = y;
    else if (y >= 50) year = 2500 + y - 543; // 69 → 2569
    else year = 2000 + y; // 26 → 2026
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(year, m - 1, d);
  if (date.getMonth() !== m - 1) return null;
  return ymdLocal(date);
}

const EXPENSE_WORD = /^\s*(?:จ่าย(?:เงิน)?|รายจ่าย|ซื้อ|-)\s*/;
const INCOME_WORD = /^\s*(?:รับ(?:เงิน)?|รายรับ|\+)\s*/;

/** A message that starts like an entry (so other chat in the group is left alone) */
export const looksLikeEntry = (text: string) => EXPENSE_WORD.test(text) || INCOME_WORD.test(text);

/**
 * Reads a typed entry. The words can come in any order:
 * "จ่าย ค่าแก๊ส 350", "จ่าย วันที่ 5/10/26 ค่า ผักบุ้ง 135 บาท ร้านค้า ป้าแดง", "รับ 1,500 ค่าจัดเลี้ยง".
 * Returns a reason (in Thai) when the amount is missing.
 */
export function parseEntryText(raw: string, today: string): TypedEntry | { error: string } {
  let text = raw.replace(/\s+/g, ' ').trim();
  let kind: TypedEntry['kind'];
  if (INCOME_WORD.test(text) && !/^\s*รับประทาน/.test(text)) {
    kind = 'income';
    text = text.replace(INCOME_WORD, '');
  } else if (EXPENSE_WORD.test(text)) {
    kind = 'expense';
    text = text.replace(EXPENSE_WORD, '');
  } else {
    return { error: 'ขึ้นต้นด้วย “จ่าย” หรือ “รับ”' };
  }

  let date = today;
  // Not inside a number like 1,500.50
  // (no lookbehind: older iPads cannot parse it)
  for (const dm of text.matchAll(/(^|[^\d,.])((?:วันที่\s*)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?)(?![\d,.])/g)) {
    const parsed = parseThaiDate(Number(dm[3]), Number(dm[4]), dm[5] ? Number(dm[5]) : undefined, today);
    if (parsed) {
      date = parsed;
      text = text.replace(dm[2], ' ');
      break;
    }
  }
  text = text.replace(/วันที่\s*(?:\.{2,}|…)?/g, ' ');

  let vendor = '';
  const vm = text.match(/(?:ร้านค้า|ร้าน|ผู้ขาย|ผู้จ่าย|จากร้าน)\s*[:：]?\s*(.*)$/);
  if (vm) {
    vendor = vm[1].replace(/\.{2,}|…/g, '').trim();
    text = text.slice(0, vm.index);
  }

  // The amount: a number with บาท/฿ after it, else the last number
  const withBaht = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|฿|thb)/gi)];
  const plain = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)];
  const hit = withBaht.length ? withBaht[withBaht.length - 1] : plain[plain.length - 1];
  const amount = hit ? Number(hit[1].replace(/,/g, '')) : 0;
  if (!(amount > 0)) return { error: 'ไม่พบยอดเงิน เช่น “จ่าย ค่าผัก 135 บาท”' };
  text = `${text.slice(0, hit!.index)} ${text.slice(hit!.index! + hit![0].length)}`;

  const title = text
    .replace(/บาท|฿|\.{2,}|…/g, ' ')
    .replace(/(^|\s)ค่า\s+/g, '$1ค่า')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return { kind, date, title: title || (kind === 'expense' ? 'รายจ่าย' : 'รายรับ'), amount: Math.round(amount * 100) / 100, vendor: vendor.slice(0, 60) };
}

const CATEGORY_WORDS: [ExpenseCategory, RegExp][] = [
  ['utilities', /แก๊ส|แก็ส|ไฟฟ้า|ค่าไฟ|ค่าน้ำประปา|ประปา|ค่าน้ำ(?!แข็ง|ปลา|มัน|ตาล)|อินเทอร์เน็ต|เน็ต|โทรศัพท์/],
  ['rent', /ค่าเช่า|เช่าที่|เช่าร้าน/],
  ['salary', /เงินเดือน|ค่าแรง|ค่าจ้าง|โอที|ประกันสังคม/],
  ['marketing', /โฆษณา|ยิงแอด|แอด|ป้าย|ใบปลิว|โปรโมท/],
  ['equipment', /ตู้เย็น|เตา|หม้อ|กระทะ|เครื่อง|โต๊ะ|เก้าอี้|พัดลม/],
  ['supplies', /ถุง|กล่อง|ช้อน|ส้อม|หลอด|แก้ว|ทิชชู่|กระดาษ|น้ำยา|สบู่|ถุงมือ|ฟอยล์|ตะเกียบ/],
  ['raw_material', /ผัก|หมู|ไก่|เนื้อ|กุ้ง|ปลา|หมึก|ข้าว|ไข่|น้ำมัน|น้ำปลา|ซอส|กะเพรา|พริก|กระเทียม|หอม|น้ำตาล|เครื่องปรุง|วัตถุดิบ|ตลาด|แม็คโคร|makro|น้ำแข็ง|ผลไม้|นม/i]
];

/** A category from the words of the entry (other when nothing fits) */
export function guessCategory(text: string): ExpenseCategory {
  return CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] || 'other';
}

/** Text ready to copy, like the LINE bot's "รับ / จ่าย" templates */
export function entryTemplates(today: string): string {
  const [y, m, d] = today.split('-');
  const short = `${Number(d)}/${Number(m)}/${String(Number(y) + 543).slice(2)}`;
  return [
    '✍️ <b>พิมพ์จดรายการ</b> (แตะข้อความเพื่อคัดลอก แล้วแก้ไขส่ง)',
    '',
    `💸 <code>จ่าย วันที่ ${short} ค่า... ... บาท ร้านค้า ...</code>`,
    `💰 <code>รับ วันที่ ${short} ค่า... ... บาท จาก ...</code>`,
    '',
    'แบบสั้นก็ได้ เช่น',
    '<code>จ่าย ค่าแก๊ส 350</code>',
    '<code>จ่าย ผักบุ้ง 135 บาท ร้านค้า ป้าแดง</code>',
    '<code>รับ ขายน้ำมันเก่า 200</code>',
    '',
    'ไม่ใส่วันที่ = วันนี้ · ระบบเลือกหมวดหมู่ให้ แก้ได้ทีหลังด้วยปุ่ม ✏️ แก้ไข'
  ].join('\n');
}

// ---------- Cards and keyboards ----------

const esc = (s: string | number | undefined | null) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const money = (n: number) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

/** Where an entry came from, shown as the card's document type */
export type EntrySource = 'slip' | 'typed' | 'photo';

/** The vendor kept on an expense: the payee of the substitute receipt, or "ร้าน: …" in the note */
export const expenseVendor = (e: Pick<Expense, 'substituteReceipt' | 'note'>) =>
  e.substituteReceipt?.payee || e.note?.match(/(?:^|· )ร้าน: ([^·]+)/)?.[1]?.trim() || '';

export function expenseCard(e: Expense, opts: { heading?: string; recordedBy?: string; shopName?: string } = {}): string {
  const sr = e.substituteReceipt;
  const vendor = expenseVendor(e);
  const doc = e.includeVat ? 'ใบกำกับภาษี' : sr ? `ใบรับรองแทนใบเสร็จ ${sr.docNo}` : e.receiptImage ? 'ใบเสร็จ / สลิป' : 'ไม่มีเอกสาร';
  const proofs = [e.receiptImage ? 'สลิป/บิล 1' : '', e.purchaseImages?.length ? `รูปสินค้า ${e.purchaseImages.length}` : ''].filter(Boolean).join(' · ') || '—';
  const note = (e.note || '')
    .split(' · ')
    .filter(p => p && !/^ร้าน: |^จาก Telegram/.test(p))
    .join(' · ');
  return [
    opts.heading ?? '✅ <b>บันทึกเรียบร้อย</b>',
    '━━━━━━━━━━━━━━',
    `📉 <b>รายจ่าย  -${money(e.amount)} บาท</b>`,
    `📝 ${esc(e.title)}`,
    '',
    `📅 วันที่: ${esc(thaiDate(e.date))}`,
    '💳 สถานะการจ่าย: ✅ จ่ายแล้ว',
    `🗂 หมวดหมู่: ${esc(EXPENSE_CATEGORY_LABELS[e.category] || e.category)}`,
    vendor ? `🏪 ผู้ขาย/ร้านค้า: ${esc(vendor)}` : null,
    `📄 เอกสาร: ${esc(doc)}`,
    e.includeVat ? `🧾 VAT: ${money(e.vatAmount)} บาท` : null,
    sr?.spender || opts.recordedBy ? `👤 ผู้เบิกจ่าย: ${esc(sr?.spender || opts.recordedBy)}` : null,
    sr ? `✍️ ลายเซ็น: ผู้เบิก ${sr.spenderSignature ? '✅' : '⏳'} · ผู้อนุมัติ ${sr.approverSignature ? '✅' : '⏳'}` : null,
    note ? `🗒 โน้ต: ${esc(note.slice(0, 160))}` : null,
    `📎 หลักฐาน: ${esc(proofs)}`,
    e.driveFiles?.length ? `☁️ <a href="${esc(e.driveFiles[0].url)}">เปิดใน Google Drive</a>` : null,
    opts.shopName ? `🏢 ธุรกิจ: ${esc(opts.shopName)}` : null
  ]
    .filter(line => line !== null)
    .join('\n');
}

export function incomeCard(i: OtherIncome, opts: { heading?: string; shopName?: string } = {}): string {
  return [
    opts.heading ?? '✅ <b>บันทึกเรียบร้อย</b>',
    '━━━━━━━━━━━━━━',
    `📈 <b>รายรับ  +${money(i.amount)} บาท</b>`,
    `📝 ${esc(i.title)}`,
    '',
    `📅 วันที่: ${esc(thaiDate(i.date))}`,
    '💳 สถานะ: ✅ ได้รับแล้ว',
    `🗂 หมวดหมู่: ${esc(INCOME_CATEGORY_LABELS[i.category] || i.category)}`,
    i.payerName ? `👤 ผู้จ่าย: ${esc(i.payerName)}` : null,
    `📎 หลักฐาน: ${i.slipImage ? 'สลิป 1' : '—'}`,
    opts.shopName ? `🏢 ธุรกิจ: ${esc(opts.shopName)}` : null
  ]
    .filter(line => line !== null)
    .join('\n');
}

type Button = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = { inline_keyboard: Button[][] };

/** Buttons under a saved entry. Callback data: "<action>:<record id>[:value]" (64 bytes at most) */
export function entryKeyboard(e: Pick<Expense, 'id' | 'driveFiles'> | Pick<OtherIncome, 'id'>, kind: 'expense' | 'income'): InlineKeyboard {
  if (kind === 'income') {
    return { inline_keyboard: [[{ text: '✏️ แก้ไข', callback_data: `edit:${e.id}` }, { text: '🗑 ลบ', callback_data: `del:${e.id}` }]] };
  }
  const drive = (e as Expense).driveFiles?.[0]?.url;
  return {
    inline_keyboard: [
      [
        { text: '📄 ดูใบแทนใบเสร็จ', callback_data: `doc:${e.id}` },
        { text: '➕ เพิ่มรูป', callback_data: `photo:${e.id}` }
      ],
      [{ text: '✏️ แก้ไข', callback_data: `edit:${e.id}` }, drive ? { text: '☁️ Drive', url: drive } : { text: '🗑 ลบ', callback_data: `del:${e.id}` }]
    ]
  };
}

export type EditField = 'amount' | 'title' | 'date' | 'vendor' | 'note';
export const EDIT_FIELD_LABELS: Record<EditField, string> = {
  amount: 'ยอดเงิน',
  title: 'รายการ',
  date: 'วันที่',
  vendor: 'ผู้ขาย/ร้านค้า',
  note: 'โน้ต'
};

export function editKeyboard(id: string, kind: 'expense' | 'income'): InlineKeyboard {
  const ask = (f: EditField) => ({ text: `✏️ ${EDIT_FIELD_LABELS[f]}`, callback_data: `ask:${id}:${f}` });
  return {
    inline_keyboard: [
      [{ text: '🗂 หมวดหมู่', callback_data: `cat:${id}` }, ask('amount')],
      [ask('title'), ask('date')],
      kind === 'expense' ? [ask('vendor'), ask('note')] : [ask('note')],
      [
        { text: '🗑 ลบรายการ', callback_data: `del:${id}` },
        { text: '↩️ กลับ', callback_data: `back:${id}` }
      ]
    ]
  };
}

export function categoryKeyboard(id: string, kind: 'expense' | 'income'): InlineKeyboard {
  const labels: Record<string, string> = kind === 'expense' ? EXPENSE_CATEGORY_LABELS : INCOME_CATEGORY_LABELS;
  const buttons = Object.entries(labels).map(([key, label]) => ({ text: label, callback_data: `setcat:${id}:${key}` }));
  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: '↩️ กลับ', callback_data: `edit:${id}` }]);
  return { inline_keyboard: rows };
}

export const deleteKeyboard = (id: string): InlineKeyboard => ({
  inline_keyboard: [[{ text: '🗑 ยืนยันลบ', callback_data: `delok:${id}` }, { text: '↩️ ไม่ลบ', callback_data: `back:${id}` }]]
});

export const isExpenseCategory = (c: string): c is ExpenseCategory => c in EXPENSE_CATEGORY_LABELS;
export const isIncomeCategory = (c: string): c is IncomeCategory => c in INCOME_CATEGORY_LABELS;

/** "<action>:<id>[:<value>]" */
export function parseCallback(data: string): { action: string; id: string; value: string } {
  const [action = '', id = '', ...rest] = (data || '').split(':');
  return { action, id, value: rest.join(':') };
}

/** Applies a typed value to a field; returns the change or a reason it was not understood */
export function editValue(field: EditField, text: string, today: string): { amount?: number; title?: string; date?: string; vendor?: string; note?: string } | { error: string } {
  const t = text.trim();
  if (!t) return { error: 'ข้อความว่าง' };
  if (field === 'amount') {
    const n = Number(t.replace(/[,฿\s]|บาท/g, ''));
    return n > 0 ? { amount: Math.round(n * 100) / 100 } : { error: 'ใส่ตัวเลขยอดเงิน เช่น 135 หรือ 1,250.50' };
  }
  if (field === 'date') {
    const m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    const date = m ? parseThaiDate(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined, today) : /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    return date ? { date } : { error: 'ใส่วันที่แบบ วัน/เดือน/ปี เช่น 5/10/69' };
  }
  return { [field]: t.slice(0, field === 'note' ? 300 : 80) };
}

// ---------- Menu, help and summary ----------

export const MENU_BUTTONS = {
  send: '📸 ส่งบิล',
  type: '✍️ พิมพ์จด',
  today: '📊 สรุปวันนี้',
  month: '📅 สรุปเดือนนี้',
  latest: '🧾 รายการล่าสุด',
  drive: '📁 Google Drive',
  help: '❓ ช่วยเหลือ'
} as const;

/** The keyboard under the chat's text box (like a LINE rich menu) */
export const mainMenuKeyboard = () => ({
  keyboard: [
    [{ text: MENU_BUTTONS.send }, { text: MENU_BUTTONS.type }],
    [{ text: MENU_BUTTONS.today }, { text: MENU_BUTTONS.month }],
    [{ text: MENU_BUTTONS.latest }, { text: MENU_BUTTONS.drive }],
    [{ text: MENU_BUTTONS.help }]
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'ส่งรูปสลิป หรือพิมพ์ จ่าย ค่า... 100'
});

export const BOT_COMMANDS = [
  { command: 'menu', description: 'เปิดเมนู' },
  { command: 'jot', description: 'พิมพ์จดรายรับ-รายจ่าย' },
  { command: 'today', description: 'สรุปวันนี้' },
  { command: 'month', description: 'สรุปเดือนนี้' },
  { command: 'latest', description: 'รายการล่าสุด' },
  { command: 'drive', description: 'ลิงก์ Google Drive' },
  { command: 'help', description: 'วิธีใช้' }
];

export type MenuAction = 'menu' | 'send' | 'type' | 'today' | 'month' | 'latest' | 'drive' | 'help';

/** A menu button, /command or the words people type for them */
export function menuAction(text: string): MenuAction | null {
  const t = text.trim().replace(/@\w+$/, '');
  const cmd = t.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  if (cmd) {
    const map: Record<string, MenuAction> = { start: 'menu', menu: 'menu', jot: 'type', today: 'today', month: 'month', latest: 'latest', drive: 'drive', help: 'help', summary: 'today' };
    return map[cmd] || null;
  }
  const entry = (Object.entries(MENU_BUTTONS) as [MenuAction, string][]).find(([, label]) => label === t);
  if (entry) return entry[0];
  if (/^(เมนู|menu)$/i.test(t)) return 'menu';
  if (/ขอ\s*(link|ลิงก์|ลิ้ง)?\s*(google\s*)?drive/i.test(t)) return 'drive';
  if (/^(ดู)?สรุป(วันนี้)?$/.test(t)) return 'today';
  if (/^(ดู)?สรุปเดือน(นี้)?$/.test(t)) return 'month';
  if (/^(ช่วยเหลือ|วิธีใช้|help)$/i.test(t)) return 'help';
  return null;
}

export const SEND_HELP = [
  '📸 <b>ส่งบิล รายรับ-รายจ่าย</b>',
  'ส่งรูปสลิปโอนเงิน ใบเสร็จ หรือบิลเงินสด (ถ่ายรูป / แนบจากอัลบั้ม) เข้ามาในแชทนี้ได้เลย',
  'ระบบอ่านยอดด้วย AI แล้วบันทึกให้ทันที พร้อมสร้างใบรับรองแทนใบเสร็จเมื่อไม่มีใบกำกับภาษี',
  '',
  '• เงินที่ร้านได้รับ: พิมพ์ “รายรับ” ใต้รูป',
  '• พิมพ์ชื่อรายการใต้รูปได้ เช่น “ค่าผักตลาดเช้า”',
  '• ส่งหลายรูปได้ ระบบบันทึกแยกทีละรายการ'
].join('\n');

export function helpText(mode: BotMode): string {
  return [
    '🤖 <b>วิธีใช้บอทบันทึกบัญชีของร้าน</b>',
    '',
    `📸 ส่งรูปสลิป/บิล → ${mode === 'auto' ? 'บันทึกทันที' : 'ส่งให้ผู้จัดการอนุมัติในระบบ POS'}`,
    '✍️ พิมพ์ “จ่าย ค่าผัก 135 บาท” หรือ “รับ 500 ค่าจัดเลี้ยง” → บันทึกโดยไม่ต้องมีรูป',
    '✏️ ใต้รายการที่บันทึก กดปุ่มเพื่อ ดูใบแทนใบเสร็จ (PDF), เพิ่มรูปสินค้า, แก้ไขหมวดหมู่/ยอด/วันที่ หรือลบ',
    '📊 “สรุปวันนี้” / “สรุปเดือนนี้” → ยอดขาย รายรับ รายจ่าย',
    '📁 “ขอ link google drive” → โฟลเดอร์เอกสารของร้าน',
    '',
    'พิมพ์ /menu เพื่อเปิดปุ่มเมนูด้านล่าง'
  ].join('\n');
}

const inMonth = (date: string, ym: string) => date.slice(0, 7) === ym;
const localDay = (iso: string) => ymdLocal(new Date(iso));

/** Totals for a day ("YYYY-MM-DD") or month ("YYYY-MM"): POS sales, other income and expenses */
export function summaryText(
  period: string,
  data: { orders: Pick<Order, 'createdAt' | 'status' | 'grandTotal' | 'paymentStatus' | 'branchId'>[]; expenses: Expense[]; incomes: OtherIncome[]; branchId?: string }
): string {
  const isDay = period.length === 10;
  const match = (date: string) => (isDay ? date.slice(0, 10) === period : inMonth(date, period));
  const sameBranch = (b?: string) => !data.branchId || !b || b === data.branchId;
  const orders = data.orders.filter(o => sameBranch(o.branchId) && o.status !== 'cancelled' && o.paymentStatus !== 'unpaid' && match(localDay(o.createdAt)));
  const sales = orders.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0);
  const expenses = data.expenses.filter(e => sameBranch(e.branchId) && match(e.date));
  const incomes = data.incomes.filter(i => sameBranch(i.branchId) && match(i.date));
  const spent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const other = incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const byCategory = new Map<ExpenseCategory, number>();
  expenses.forEach(e => byCategory.set(e.category, (byCategory.get(e.category) || 0) + (Number(e.amount) || 0)));
  const net = sales + other - spent;
  const label = isDay
    ? new Date(`${period}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(`${period}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  return [
    `📊 <b>สรุป${isDay ? 'วัน' : 'เดือน'} ${esc(label)}</b>`,
    '━━━━━━━━━━━━━━',
    `🛒 ยอดขายหน้าร้าน: ${money(sales)} บาท (${orders.length} บิล)`,
    `📈 รายรับอื่น: ${money(other)} บาท (${incomes.length} รายการ)`,
    `📉 รายจ่าย: ${money(spent)} บาท (${expenses.length} รายการ)`,
    ...[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `   • ${esc(EXPENSE_CATEGORY_LABELS[c] || c)} ${money(v)}`),
    '━━━━━━━━━━━━━━',
    `${net >= 0 ? '🟢' : '🔴'} <b>คงเหลือ ${net >= 0 ? '' : '-'}${money(Math.abs(net))} บาท</b>`
  ].join('\n');
}

/** The newest recorded entries, each with a /e_ link back to its card */
export function latestText(expenses: Expense[], incomes: OtherIncome[], limit = 8): string {
  const rows = [
    ...expenses.map(e => ({ id: e.id, date: e.date, sign: '-', title: e.title, amount: e.amount, at: e.id })),
    ...incomes.map(i => ({ id: i.id, date: i.date, sign: '+', title: i.title, amount: i.amount, at: i.createdAt || i.id }))
  ]
    .sort((a, b) => (a.date === b.date ? String(b.at).localeCompare(String(a.at)) : b.date.localeCompare(a.date)))
    .slice(0, limit);
  if (!rows.length) return '🧾 ยังไม่มีรายการ';
  return [
    '🧾 <b>รายการล่าสุด</b> (แตะลิงก์เพื่อเปิด / แก้ไข)',
    ...rows.map(r => `${r.sign === '-' ? '📉' : '📈'} ${esc(thaiDate(r.date))} ${esc(r.title.slice(0, 30))} ${r.sign}${money(r.amount)}\n    /e_${r.id.replace(/-/g, '_')}`)
  ].join('\n');
}

/** "/e_exp_1728…" back to the record id */
export const recordIdFromCommand = (text: string) => text.trim().match(/^\/e_((?:exp|inc)_[\w]+?)(?:@\w+)?$/)?.[1]?.replace(/_/g, '-') || null;

// ---------- Conversation state: "send the photo now", "type the new amount" ----------

export interface BotWaiting {
  chatId: string;
  /** The person who pressed the button (others in the group are not taken as the answer) */
  userId?: string;
  action: 'photo' | 'edit' | 'amount';
  recordId: string;
  field?: EditField;
  /** The card to refresh after the change */
  cardMessageId?: number;
  until: number; // ms
}

const sameAsker = (w: Pick<BotWaiting, 'chatId' | 'userId'>, chatId: string, userId?: string) => w.chatId === chatId && (!w.userId || !userId || w.userId === userId);

export function readWaiting(chatId: string, userId?: string, now = Date.now()): BotWaiting | null {
  try {
    const all: BotWaiting[] = JSON.parse(localStorage.getItem(BOT_STATE_KEY) || '[]');
    return all.find(w => sameAsker(w, chatId, userId) && w.until > now) || null;
  } catch {
    return null;
  }
}

export function writeWaiting(chatId: string, userId: string | undefined, w: Omit<BotWaiting, 'chatId' | 'userId' | 'until'> | null, now = Date.now()) {
  try {
    const all: BotWaiting[] = JSON.parse(localStorage.getItem(BOT_STATE_KEY) || '[]');
    const rest = all.filter(x => !sameAsker(x, chatId, userId) && x.until > now);
    localStorage.setItem(BOT_STATE_KEY, JSON.stringify(w ? [...rest, { ...w, chatId, userId: userId || undefined, until: now + 10 * 60_000 }] : rest));
  } catch {
    // storage unavailable
  }
}

/** Sends a file (the PDF of an expense's documents) with a multipart form, which needs no CORS preflight */
export async function sendTelegramDocument(token: string, chatId: string, file: Blob, fileName: string, extra: Record<string, string | number> = {}) {
  const form = new FormData();
  form.set('chat_id', chatId);
  Object.entries(extra).forEach(([k, v]) => form.set(k, String(v)));
  form.set('document', file, fileName);
  const res = await fetch(`https://api.telegram.org/bot${cleanBotToken(token)}/sendDocument`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `ส่งไฟล์ไม่สำเร็จ (${res.status})`);
  return data.result;
}

/** The text and image file in a Telegram message */
export function messageParts(update: any): { chatId: string; messageId: number; text: string; senderName: string; senderId: string } | null {
  const msg = update?.message || update?.channel_post;
  if (!msg) return null;
  const from = msg.from || {};
  return {
    chatId: String(msg.chat?.id ?? ''),
    messageId: msg.message_id,
    text: msg.text || '',
    senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || msg.chat?.title || '',
    senderId: String(from.id ?? '')
  };
}
