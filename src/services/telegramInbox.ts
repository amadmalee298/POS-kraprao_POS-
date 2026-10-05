import type { ExpenseCategory, PendingReceipt } from '../types';
import type { VerifiedReceiptData } from '../utils/receiptOcr';

/**
 * Receipt photos sent to the shop's Telegram bot. The Bot API allows calls from the browser, so
 * one device of the shop (switched on in the notification page) polls the bot, reads each photo
 * with AI and puts it in a list for a manager to approve. Only photos from the shop's own chat
 * (the Chat ID set for notifications) are accepted.
 */

const API = 'https://api.telegram.org';
export const INBOX_ENABLED_KEY = 'POS_TG_INBOX_ENABLED';
export const INBOX_OFFSET_KEY = 'POS_TG_INBOX_OFFSET';
export const INBOX_STATUS_KEY = 'POS_TG_INBOX_STATUS';
export const INBOX_STATUS_EVENT = 'pos-telegram-inbox-status';

export const cleanBotToken = (token: string) => (token.trim().startsWith('bot') ? token.trim().slice(3) : token.trim());

/** Bot API parameters as form fields (objects and arrays JSON-encoded, as the Bot API expects) */
export function telegramForm(params: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
  return form;
}

export async function telegramCall<T = any>(token: string, method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  // Sent as a form (a "simple" request): Telegram answers the browser's CORS preflight for JSON
  // with an error status, so JSON requests from a web page are blocked
  const res = await fetch(`${API}/bot${cleanBotToken(token)}/${method}`, { method: 'POST', body: telegramForm(params), signal });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    if (data.error_code === 409) {
      throw new Error(
        /webhook/i.test(data.description || '')
          ? 'บอทนี้ตั้ง webhook ไว้ที่อื่น จึงรับรูปแบบนี้ไม่ได้ (ต้องลบ webhook ก่อน)'
          : 'มีอีกเครื่องเปิดรับบิลจาก Telegram อยู่ (เปิดได้ทีละเครื่อง)'
      );
    }
    if (data.error_code === 401) throw new Error('Telegram Bot Token ไม่ถูกต้อง');
    throw new Error(data.description || `Telegram ตอบกลับผิดพลาด (${res.status})`);
  }
  return data.result as T;
}

export interface IncomingPhoto {
  updateId: number;
  chatId: string;
  messageId: number;
  fileId: string;
  senderName: string;
  caption: string;
  date: string; // ISO
}

/** The photo (largest size) or image file in a Telegram update, if any */
export function photoFromUpdate(update: any): IncomingPhoto | null {
  const msg = update?.message || update?.channel_post;
  if (!msg) return null;
  let fileId = '';
  if (Array.isArray(msg.photo) && msg.photo.length) {
    fileId = [...msg.photo].sort((a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height))[0].file_id;
  } else if (msg.document && /^image\//.test(msg.document.mime_type || '')) {
    fileId = msg.document.file_id;
  }
  if (!fileId) return null;
  const from = msg.from || {};
  return {
    updateId: update.update_id,
    chatId: String(msg.chat?.id ?? ''),
    messageId: msg.message_id,
    fileId,
    senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || msg.chat?.title || '',
    caption: msg.caption || '',
    date: new Date((msg.date || Date.now() / 1000) * 1000).toISOString()
  };
}

/** Caption words that mark the photo as money received rather than spent */
export const isIncomeCaption = (caption: string) => /#?(รายรับ|รับเงิน|income)/i.test(caption);

export const pendingId = (p: Pick<IncomingPhoto, 'chatId' | 'messageId'>) => `tg-${p.chatId}-${p.messageId}`;

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Downloads a Telegram file as a data URL: straight from Telegram (tried twice), then through the
 * shop's Vercel site (api/telegram/file) when one is set up. The error names each attempt's cause.
 */
export async function downloadTelegramFile(token: string, fileId: string, relayBase = ''): Promise<string> {
  const problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await telegramCall<{ file_path: string }>(token, 'getFile', { file_id: fileId });
      const res = await fetch(`${API}/file/bot${cleanBotToken(token)}/${file.file_path}`, { cache: 'no-store' });
      if (res.ok) return await blobToDataUrl(await res.blob());
      problems.push(`HTTP ${res.status}`);
    } catch (e: any) {
      problems.push(e?.message || 'เชื่อมต่อไม่ได้');
    }
    if (attempt === 0) await wait(1500);
  }
  if (relayBase) {
    try {
      const res = await fetch(`${relayBase}/api/telegram/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanBotToken(token), fileId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dataUrl) return data.dataUrl;
      problems.push(`Vercel: ${data.error || `HTTP ${res.status}`}`);
    } catch (e: any) {
      problems.push(`Vercel: ${e?.message || 'เชื่อมต่อไม่ได้'}`);
    }
  }
  throw new Error(`ดาวน์โหลดรูปจาก Telegram ไม่สำเร็จ (${[...new Set(problems)].join(', ')})`);
}

/** The caption without the income/expense keyword, used as the entry's name */
export const captionTitle = (caption: string) =>
  caption
    .replace(/#?(รายรับ|รายจ่าย|รับเงิน|จ่ายเงิน|income|expense)\s*:?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['rent', 'salary', 'utilities', 'raw_material', 'supplies', 'equipment', 'marketing', 'other'];

/** What the AI read, in the shape the approval screen edits */
export function toPendingData(r: VerifiedReceiptData, fallbackDate: string): NonNullable<PendingReceipt['data']> {
  const category = (EXPENSE_CATEGORIES as string[]).includes(r.category) ? (r.category as ExpenseCategory) : 'other';
  return {
    title: r.title || (r.vendorName ? `ซื้อจาก ${r.vendorName}` : 'บิลจาก Telegram'),
    vendorName: r.vendorName || '',
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : fallbackDate,
    category,
    amount: Number(r.amount) || 0,
    includeVat: !!r.includeVat,
    vatAmount: Number(r.vatAmount) || 0,
    netAmount: Number(r.netAmount) || Number(r.amount) || 0,
    refNumber: r.refNumber || '',
    note: [r.note, ...(r.lineItems || []).slice(0, 12).map(li => `${li.name} ${li.amount}`)].filter(Boolean).join(' · ').slice(0, 500),
    warnings: r.warnings || [],
    verified: !!r.verified,
    confidenceScore: Number(r.confidenceScore) || 0,
    lineItems: (r.lineItems || []).slice(0, 30).map(li => ({ name: li.name, quantity: li.quantity, amount: Number(li.amount) || 0 }))
  };
}

export interface InboxStatus {
  lastCheck?: string;
  error?: string;
  /** The app is in the background, so the bot waits (messages are kept by Telegram until it is back) */
  paused?: boolean;
  /** A chat that sent photos but is not the shop's chat (shown so the owner can find its ID) */
  ignoredChatId?: string;
  ignoredChatName?: string;
}

export function readInboxStatus(): InboxStatus {
  try {
    return JSON.parse(localStorage.getItem(INBOX_STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function writeInboxStatus(patch: InboxStatus) {
  try {
    localStorage.setItem(INBOX_STATUS_KEY, JSON.stringify({ ...readInboxStatus(), ...patch }));
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event(INBOX_STATUS_EVENT));
}

export const inboxEnabledHere = (): boolean => {
  try {
    return localStorage.getItem(INBOX_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
};

export function setInboxEnabledHere(on: boolean) {
  try {
    localStorage.setItem(INBOX_ENABLED_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event(INBOX_STATUS_EVENT));
}

export const baht = (n: number) => `฿${(Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const KEEP_AWAKE_KEY = 'POS_TG_KEEP_AWAKE';

/** Keep this device's screen on while the bot runs (a sleeping iPad stops the bot) */
export const keepAwakeHere = (): boolean => {
  try {
    return localStorage.getItem(KEEP_AWAKE_KEY) === '1';
  } catch {
    return false;
  }
};

export function setKeepAwakeHere(on: boolean) {
  try {
    localStorage.setItem(KEEP_AWAKE_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event(INBOX_STATUS_EVENT));
}
