/**
 * Notification Service for Kaprao POS Enterprise
 * Handles real-time Telegram Bot and LINE Messaging API alerts.
 * (LINE Notify was shut down by LINE on 31 March 2025; a LINE Official Account channel
 * access token plus a user/group ID is used instead.)
 * Supports dual-mode transport: Server API route or direct browser fallback for static GitHub Pages.
 * All messages extract 100% REAL data from store state (No fake fallback numbers).
 */

import { countsAsRevenue } from '../utils/orderUtils';
import { apiUrl } from '../utils/apiClient';
import { Order, Ingredient, Branch, SystemSettings } from '../types';

export interface NotificationCredentials {
  telegramToken: string;
  telegramChatId: string;
  /** LINE Messaging API channel access token (long-lived) */
  lineToken: string;
  /** LINE userId (U...) or groupId (C...) that receives push messages */
  lineTargetId: string;
  /**
   * Address of a LINE relay (e.g. https://xxx.vercel.app/api/notify/line). LINE cannot be called
   * from a browser, so a static site (GitHub Pages) sends through a relay. Empty = this site's
   * own /api/notify/line.
   */
  lineRelayUrl?: string;
}

export interface NotificationTriggers {
  dailySummary: boolean;
  lowStock: boolean;
  voidOrder: boolean;
  newOrder: boolean;
  kdsDelay: boolean;
}

export interface NotificationRules {
  minOrderAmount: number;
  selectedCategories: string[];
  minVoidAmount: number;
  onlyCriticalStock: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailySummaryTime: string; // e.g. "22:00"
}

export type NotificationTriggerRules = NotificationRules;

export interface NotificationLogItem {
  id: string;
  time: string;
  date: string;
  channel: 'LINE' | 'Telegram' | 'Both';
  event: string;
  status: string;
  recipient: string;
}

const STORAGE_KEYS = {
  TELEGRAM_TOKEN: 'kaprao_telegram_token',
  TELEGRAM_CHAT_ID: 'kaprao_telegram_chat_id',
  LINE_TOKEN: 'kaprao_line_token',
  LINE_TARGET_ID: 'kaprao_line_target_id',
  LINE_RELAY_URL: 'kaprao_line_relay_url',
  TRIGGERS: 'kaprao_notification_triggers',
  RULES: 'kaprao_notification_rules',
  LOGS: 'kaprao_notification_logs',
  LAST_DAILY_DATE: 'kaprao_last_daily_summary_date',
  LAST_LOW_STOCK_ALERT: 'kaprao_last_low_stock_alert_time',
};

export const DEFAULT_TRIGGERS: NotificationTriggers = {
  dailySummary: true,
  lowStock: true,
  voidOrder: true,
  newOrder: true,
  kdsDelay: false,
};

export const DEFAULT_RULES: NotificationRules = {
  minOrderAmount: 0, // 0 = แจ้งเตือนทุกยอดขาย
  selectedCategories: ['all'],
  minVoidAmount: 100,
  onlyCriticalStock: false,
  quietHoursEnabled: false,
  quietHoursStart: '00:00',
  quietHoursEnd: '06:00',
  dailySummaryTime: '22:00',
};

// ==========================================
// LocalStorage Persistence Helpers
// ==========================================

/**
 * Notification settings are shared by the shop's devices (branches/{id}/config/notifications):
 * NotificationSettingsSync registers the cloud saver and applies the cloud copy here, so a new
 * order on any device notifies with the same bot and rules.
 */
let cloudSaver: ((config: SharedNotificationConfig) => void) | null = null;

export interface SharedNotificationConfig {
  credentials: NotificationCredentials;
  triggers: NotificationTriggers;
  rules: NotificationRules;
}

export function setNotificationCloudSaver(saver: ((config: SharedNotificationConfig) => void) | null) {
  cloudSaver = saver;
}

const pushToCloud = () => {
  if (cloudSaver) cloudSaver({ credentials: getStoredCredentials(), triggers: getStoredTriggers(), rules: getStoredRules() });
};

/** Apply settings saved by another device (does not echo back to the cloud). */
export function applySharedNotificationConfig(config: Partial<SharedNotificationConfig> | null | undefined) {
  if (!config) return;
  try {
    const c = config.credentials;
    if (c) {
      localStorage.setItem(STORAGE_KEYS.TELEGRAM_TOKEN, c.telegramToken || '');
      localStorage.setItem(STORAGE_KEYS.TELEGRAM_CHAT_ID, c.telegramChatId || '');
      localStorage.setItem(STORAGE_KEYS.LINE_TOKEN, c.lineToken || '');
      localStorage.setItem(STORAGE_KEYS.LINE_TARGET_ID, c.lineTargetId || '');
      localStorage.setItem(STORAGE_KEYS.LINE_RELAY_URL, c.lineRelayUrl || '');
    }
    if (config.triggers) localStorage.setItem(STORAGE_KEYS.TRIGGERS, JSON.stringify(config.triggers));
    if (config.rules) localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(config.rules));
  } catch {
    // storage unavailable: this device keeps its own settings
  }
}

/** Whether this device has any notification settings worth sharing (first device to connect). */
export function hasLocalNotificationConfig(): boolean {
  const c = getStoredCredentials();
  return !!(c.telegramToken || c.lineToken);
}

export function getStoredCredentials(): NotificationCredentials {
  return {
    telegramToken: localStorage.getItem(STORAGE_KEYS.TELEGRAM_TOKEN) || '',
    telegramChatId: localStorage.getItem(STORAGE_KEYS.TELEGRAM_CHAT_ID) || '',
    lineToken: localStorage.getItem(STORAGE_KEYS.LINE_TOKEN) || '',
    lineTargetId: localStorage.getItem(STORAGE_KEYS.LINE_TARGET_ID) || '',
    lineRelayUrl: localStorage.getItem(STORAGE_KEYS.LINE_RELAY_URL) || '',
  };
}

export function saveStoredCredentials(creds: Partial<NotificationCredentials>) {
  if (creds.telegramToken !== undefined) {
    localStorage.setItem(STORAGE_KEYS.TELEGRAM_TOKEN, creds.telegramToken.trim());
  }
  if (creds.telegramChatId !== undefined) {
    localStorage.setItem(STORAGE_KEYS.TELEGRAM_CHAT_ID, creds.telegramChatId.trim());
  }
  if (creds.lineToken !== undefined) {
    localStorage.setItem(STORAGE_KEYS.LINE_TOKEN, creds.lineToken.trim());
  }
  if (creds.lineTargetId !== undefined) {
    localStorage.setItem(STORAGE_KEYS.LINE_TARGET_ID, creds.lineTargetId.trim());
  }
  if (creds.lineRelayUrl !== undefined) {
    localStorage.setItem(STORAGE_KEYS.LINE_RELAY_URL, creds.lineRelayUrl.trim());
  }
  pushToCloud();
}

export function getStoredTriggers(): NotificationTriggers {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRIGGERS);
    if (raw) return { ...DEFAULT_TRIGGERS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_TRIGGERS;
}

export function saveStoredTriggers(triggers: NotificationTriggers) {
  localStorage.setItem(STORAGE_KEYS.TRIGGERS, JSON.stringify(triggers));
  pushToCloud();
}

export function getStoredRules(): NotificationRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RULES);
    if (raw) return { ...DEFAULT_RULES, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_RULES;
}

export function saveStoredRules(rules: NotificationRules) {
  localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(rules));
  pushToCloud();
}

export function getStoredLogs(): NotificationLogItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function addStoredLog(item: Omit<NotificationLogItem, 'id' | 'time' | 'date'>) {
  try {
    const logs = getStoredLogs();
    const newLog: NotificationLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      ...item,
    };
    const updated = [newLog, ...logs].slice(0, 30);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(updated));
    return newLog;
  } catch {
    return null;
  }
}

// ==========================================
// Transport: Telegram & LINE Sending
// ==========================================

export interface SendResult {
  success: boolean;
  channel: 'telegram' | 'line';
  method: 'server' | 'direct';
  error?: string;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  message: string,
  html = true
): Promise<SendResult> {
  const cleanToken = token.trim().startsWith('bot') ? token.trim().slice(3) : token.trim();
  const cleanChatId = chatId.trim();

  if (!cleanToken || !cleanChatId) {
    return {
      success: false,
      channel: 'telegram',
      method: 'direct',
      error: 'กรุณาระบุ Telegram Bot Token และ Chat ID',
    };
  }

  // 1. Try Server-side proxy first (if server is running)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(apiUrl('/api/notify/telegram'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: cleanToken,
        chatId: cleanChatId,
        message,
        parseMode: html ? 'HTML' : undefined,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        return { success: true, channel: 'telegram', method: 'server' };
      }
    }
  } catch {
    // Server proxy failed or not available (e.g. running statically on GitHub Pages)
  }

  // 2. Direct client-side fetch to Telegram Bot API (Always works directly from browser & GitHub Pages)
  try {
    const telegramUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
    // A form body keeps this a "simple" request: Telegram rejects the CORS preflight a JSON body needs
    const response = await fetch(telegramUrl, {
      method: 'POST',
      body: new URLSearchParams({ chat_id: cleanChatId, text: message, ...(html ? { parse_mode: 'HTML' } : {}) }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) {
      return { success: true, channel: 'telegram', method: 'direct' };
    }
    // Text Telegram cannot read as HTML still goes out, as plain text
    if (html && /parse entities/i.test(String(data.description || ''))) {
      return sendTelegramMessage(token, chatId, htmlToText(message), false);
    }

    return {
      success: false,
      channel: 'telegram',
      method: 'direct',
      error: data.description || `Telegram Error HTTP ${response.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      channel: 'telegram',
      method: 'direct',
      error: err.message || 'ไม่สามารถเชื่อมต่อกับ Telegram Bot API ได้ (โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต)',
    };
  }
}

/** Where LINE messages are sent from: the configured relay, or this site's own server route. */
export function lineRelayEndpoint(relayUrl?: string): string {
  const url = (relayUrl ?? getStoredCredentials().lineRelayUrl ?? '').trim().replace(/\/+$/, '');
  if (!url) return apiUrl('/api/notify/line');
  // Accept the site address alone (https://xxx.vercel.app) as well as the full endpoint
  return /\/api\/notify\/line$/.test(url) ? url : `${url}/api/notify/line`;
}

export async function sendLineMessage(
  token: string,
  message: string,
  targetId: string = '',
  relayUrl?: string
): Promise<SendResult> {
  const cleanToken = token.trim();
  const cleanTarget = targetId.trim();
  if (!cleanToken || !cleanTarget) {
    return {
      success: false,
      channel: 'line',
      method: 'server',
      error: 'กรุณาระบุ Channel Access Token และ User/Group ID ของ LINE Official Account',
    };
  }

  try {
    const res = await fetch(lineRelayEndpoint(relayUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineToken: cleanToken,
        to: cleanTarget,
        message,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { success: true, channel: 'line', method: 'server' };
    }

    return {
      success: false,
      channel: 'line',
      method: 'server',
      error: data.error || 'ส่ง LINE ไม่สำเร็จ (LINE Messaging API ต้องส่งผ่าน Server)',
    };
  } catch (err: any) {
    return {
      success: false,
      channel: 'line',
      method: 'server',
      error: err.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ LINE ได้',
    };
  }
}

export function isQuietHours(rules: NotificationRules): boolean {
  if (!rules.quietHoursEnabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (rules.quietHoursStart || '00:00').split(':').map(Number);
  const [endH, endM] = (rules.quietHoursEnd || '06:00').split(':').map(Number);

  const startTotal = (startH || 0) * 60 + (startM || 0);
  const endTotal = (endH || 0) * 60 + (endM || 0);

  if (startTotal <= endTotal) {
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  }
  // Crosses midnight (e.g. 23:00 to 06:00)
  return currentMinutes >= startTotal || currentMinutes <= endTotal;
}

/**
 * High-level notification dispatcher
 */
export async function dispatchNotification(
  eventTitle: string,
  message: string,
  options?: {
    force?: boolean;
    channelOverride?: 'telegram' | 'line' | 'both';
  }
): Promise<{ success: boolean; results: SendResult[]; summary: string }> {
  const creds = getStoredCredentials();
  const rules = getStoredRules();

  if (!options?.force && isQuietHours(rules)) {
    return {
      success: false,
      results: [],
      summary: `อยู่ในช่วงเวลาห้ามรบกวน (${rules.quietHoursStart} - ${rules.quietHoursEnd} น.) ข้ามการแจ้งเตือน`,
    };
  }

  const results: SendResult[] = [];
  const channel = options?.channelOverride || 'both';
  // Messages laid out by the generators keep their own heading; any other text gets one
  const fullMessage = isFormatted(message) ? message : formatPlainNotification(eventTitle, message);

  // Send Telegram
  if ((channel === 'both' || channel === 'telegram') && creds.telegramToken && creds.telegramChatId) {
    const tgRes = await sendTelegramMessage(creds.telegramToken, creds.telegramChatId, fullMessage);
    results.push(tgRes);

    addStoredLog({
      channel: 'Telegram',
      event: eventTitle,
      status: tgRes.success ? `ส่งสำเร็จ (200 OK - ${tgRes.method})` : `ล้มเหลว (${tgRes.error})`,
      recipient: `Chat ID: ${creds.telegramChatId}`,
    });
  }

  // Send LINE
  if ((channel === 'both' || channel === 'line') && creds.lineToken) {
    const lineRes = await sendLineMessage(creds.lineToken, htmlToText(fullMessage), creds.lineTargetId, creds.lineRelayUrl);
    results.push(lineRes);

    addStoredLog({
      channel: 'LINE',
      event: eventTitle,
      status: lineRes.success ? 'ส่งสำเร็จ (200 OK)' : `ล้มเหลว (${lineRes.error})`,
      recipient: `LINE: ${creds.lineTargetId || '-'}`,
    });
  }

  const atLeastOneSuccess = results.some(r => r.success);
  return {
    success: atLeastOneSuccess,
    results,
    summary: atLeastOneSuccess
      ? 'ส่งการแจ้งเตือนสำเร็จ'
      : results.length === 0
      ? 'ไม่มีการตั้งค่า Token หรือ Chat ID สำหรับส่งการแจ้งเตือน'
      : `การแจ้งเตือนล้มเหลว: ${results.map(r => r.error).filter(Boolean).join(', ')}`,
  };
}

// ==========================================
// Messages (Telegram HTML, same look as the bot's cards; LINE gets the plain text)
// ==========================================

const LINE = '━━━━━━━━━━━━━━';
const money = (n: number) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Text for a Telegram HTML message */
export const escHtml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The plain text of a message (LINE, copying, the in-app preview) */
export const htmlToText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
/** A message already laid out with its own heading (not wrapped again by dispatchNotification) */
const isFormatted = (message: string) => /^\S+ <b>/.test(message);

/** The shop's name for messages that are not given the settings (set by the app from Settings) */
let notifyShopName = '';
export function setNotificationShopName(name: string | undefined) {
  notifyShopName = (name || '').trim();
}
/** Last line of every message: which shop (and branch) it is about */
function shopLine(shopName?: string, branch?: Branch): string {
  const shop = (shopName || notifyShopName || '').trim();
  const br = (branch?.name || '').trim();
  const parts = [shop, br && br !== shop ? br : ''].filter(Boolean);
  return parts.length ? `🏪 ${escHtml(parts.join(' · '))}` : '';
}
const timeOf = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
};
const bangkokDay = (iso: string | Date) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'เงินสด',
  promptpay: 'พร้อมเพย์',
  qr: 'สแกน QR',
  transfer: 'โอนเงิน',
  bank_transfer: 'โอนเงิน',
  credit: 'บัตร',
  credit_card: 'บัตร',
  card: 'บัตร',
  truemoney: 'TrueMoney'
};
const paymentLabel = (m?: string) => PAYMENT_LABELS[m || ''] || 'อื่น ๆ';

const channelOf = (o: Order) =>
  o.orderType === 'delivery' ? 'เดลิเวอรี' : o.isQrOrder || (o as any).orderType === 'qr' ? 'สแกนสั่งที่โต๊ะ' : o.orderType === 'takeaway' ? 'กลับบ้าน' : 'หน้าร้าน';
const placeOf = (o: Order) =>
  o.orderType === 'dine-in' || o.isQrOrder ? (o.tableNumber ? `โต๊ะ ${o.tableNumber}` : 'หน้าร้าน') : o.orderType === 'takeaway' ? 'กลับบ้าน' : o.orderType === 'delivery' ? 'เดลิเวอรี' : 'หน้าร้าน';

const itemLines = (o: Order, withPrice = true) =>
  (o.items || []).map(it => {
    const addOns = it.selectedAddOns?.length ? ` (+${it.selectedAddOns.map(a => a.name).join(', ')})` : '';
    const price = withPrice ? `  ${money(it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1))}` : '';
    return `• ${escHtml(it.menuItem?.name || (it as any).name || 'เมนู')} ×${it.quantity || 1}${escHtml(addOns)}${price}`;
  });

const compose = (lines: (string | null | false | undefined)[]) => lines.filter((l): l is string => typeof l === 'string').join('\n');

export interface DailyMoney {
  expenses?: { date: string; amount: number; branchId?: string }[];
  incomes?: { date: string; amount: number; branchId?: string }[];
}

/** The day's sales (with other income, expenses and what is left), best sellers and low stock */
export function generateDailySummaryMessage(
  orders: Order[],
  ingredients: Ingredient[],
  branch?: Branch,
  settings?: SystemSettings,
  money_: DailyMoney = {},
  now = new Date()
): string {
  const today = bangkokDay(now);
  const own = (b?: string) => !branch?.id || !b || b === branch.id;
  const sold = orders.filter(o => own(o.branchId) && o.createdAt && bangkokDay(o.createdAt) === today && countsAsRevenue(o));
  const sales = sold.reduce((s, o) => s + (o.grandTotal || 0), 0);

  const group = (key: (o: Order) => string) => {
    const m = new Map<string, { total: number; count: number }>();
    sold.forEach(o => {
      const k = key(o);
      const g = m.get(k) || { total: 0, count: 0 };
      g.total += o.grandTotal || 0;
      g.count += 1;
      m.set(k, g);
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  const channels = group(channelOf);
  const payments = group(o => paymentLabel(o.paymentMethod));

  const expenses = (money_.expenses || []).filter(e => own(e.branchId) && (e.date || '').slice(0, 10) === today);
  const incomes = (money_.incomes || []).filter(i => own(i.branchId) && (i.date || '').slice(0, 10) === today);
  const spent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const other = incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const left = sales + other - spent;

  const dishes = new Map<string, number>();
  sold.forEach(o => o.items?.forEach(it => {
    const name = it.menuItem?.name || (it as any).name || 'เมนู';
    dishes.set(name, (dishes.get(name) || 0) + (it.quantity || 1));
  }));
  const top = [...dishes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const low = ingredients.filter(i => (i.currentStock || 0) <= (i.minStockAlert || 0) && (i.minStockAlert || 0) > 0).length;

  const label = new Date(`${today}T12:00:00+07:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  return compose([
    `📊 <b>สรุปวัน ${escHtml(label)}</b>`,
    LINE,
    `🛒 ยอดขาย: <b>${money(sales)} บาท</b> (${sold.length} บิล${sold.length ? ` · เฉลี่ย ${money(sales / sold.length)}` : ''})`,
    ...channels.map(([k, g]) => `   • ${k} ${money(g.total)} (${g.count} บิล)`),
    payments.length ? `💳 รับชำระ: ${payments.map(([k, g]) => `${k} ${money(g.total)}`).join(' · ')}` : null,
    `📈 รายรับอื่น: ${money(other)} บาท (${incomes.length} รายการ)`,
    `📉 รายจ่าย: ${money(spent)} บาท (${expenses.length} รายการ)`,
    LINE,
    `${left >= 0 ? '🟢' : '🔴'} <b>คงเหลือ ${left < 0 ? '-' : ''}${money(Math.abs(left))} บาท</b>`,
    top.length ? `🏆 ขายดี: ${top.map(([n, q]) => `${escHtml(n)} ${q} จาน`).join(' · ')}` : null,
    low > 0 ? `⚠️ วัตถุดิบใกล้หมด ${low} รายการ` : '✅ วัตถุดิบยังพอทุกรายการ',
    shopLine(settings?.shopName, branch)
  ]);
}

export function generateNewOrderMessage(order: Order, branch?: Branch, settings?: SystemSettings): string {
  return compose([
    `🛎 <b>ออเดอร์ใหม่ ${escHtml(order.orderNumber)}</b>`,
    LINE,
    `🪑 ${escHtml(placeOf(order))} · ${timeOf(order.createdAt)} น.`,
    ...itemLines(order),
    `💰 <b>รวม ${money(order.grandTotal || 0)} บาท</b> · ${paymentLabel(order.paymentMethod)}`,
    shopLine(settings?.shopName, branch)
  ]);
}

export function generateVoidOrderMessage(order: Order, reason: string, note?: string, staffName?: string, branch?: Branch, settings?: SystemSettings): string {
  return compose([
    `❌ <b>ยกเลิกบิล ${escHtml(order.orderNumber)}</b>`,
    LINE,
    `💵 <b>ยอดที่ยกเลิก ${money(order.grandTotal || 0)} บาท</b>`,
    `👤 ผู้ยกเลิก: ${escHtml(staffName || 'ไม่ระบุ')}`,
    `📝 เหตุผล: ${escHtml(reason)}${note ? ` (${escHtml(note)})` : ''}`,
    `🕒 ${timeOf()} น. · ${escHtml(placeOf(order))}`,
    ...itemLines(order),
    shopLine(settings?.shopName, branch)
  ]);
}

export function generateLowStockMessage(lowStockItems: Ingredient[], branch?: Branch, onlyCritical = false, settings?: SystemSettings): string {
  if (lowStockItems.length === 0) {
    return compose([`✅ <b>วัตถุดิบยังพอทุกรายการ</b>`, LINE, `ตรวจเมื่อ ${timeOf()} น.`, shopLine(settings?.shopName, branch)]);
  }
  return compose([
    `⚠️ <b>${onlyCritical ? 'วัตถุดิบเหลือน้อยมาก' : 'วัตถุดิบใกล้หมด'} ${lowStockItems.length} รายการ</b>`,
    LINE,
    ...lowStockItems.map(i => `• ${escHtml(i.name)} เหลือ ${i.currentStock} ${escHtml(i.unit)} (เตือนที่ ${i.minStockAlert} ${escHtml(i.unit)})`),
    '🛒 ควรสั่งซื้อเพิ่ม',
    shopLine(settings?.shopName, branch)
  ]);
}

export function generateKdsDelayMessage(order?: Order, branch?: Branch, delayMinutes = 15, settings?: SystemSettings): string {
  if (!order) {
    return compose([`✅ <b>ไม่มีออเดอร์ค้างในครัว</b>`, LINE, shopLine(settings?.shopName, branch)]);
  }
  return compose([
    `⏰ <b>ออเดอร์รอเกิน ${delayMinutes} นาที</b>`,
    LINE,
    `🧾 ${escHtml(order.orderNumber)} · ${escHtml(placeOf(order))} · สั่งเมื่อ ${timeOf(order.createdAt)} น.`,
    ...itemLines(order, false),
    '👩‍🍳 ช่วยเร่งครัวด้วย',
    shopLine(settings?.shopName, branch)
  ]);
}

/** A message from another part of the app (plain text) with the same heading and shop line */
export function formatPlainNotification(title: string, message: string, settings?: SystemSettings, branch?: Branch): string {
  return compose([`🔔 <b>${escHtml(title)}</b>`, LINE, escHtml(message), shopLine(settings?.shopName, branch)]);
}
