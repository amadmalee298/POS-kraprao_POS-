import type { Expense, OtherIncome, PendingReceipt } from '../types';
import type { BotWaiting } from '../services/telegramBot';
import { BotContext, BotStore, handleBotUpdate } from '../services/botEngine.js';
import { BOT_CONFIG_DOC, BOT_STATE_DOC, BotMode, INBOX_DOC } from '../services/telegramBot.js';
import { openWithSecret } from '../utils/botSecret.js';
import { docLinkUrl } from '../utils/docLink.js';
import { runReceiptOcr } from '../utils/receiptOcr.js';
import { createClaudeJsonCaller } from '../utils/claudeClient.js';
import { Firestore, idTokenFor } from './firestoreRest.js';
import { hasLegacyItems, keyedItems, newestFirst } from '../utils/keyedDoc.js';

/**
 * The shop's Telegram bot on Vercel: Telegram delivers each message to /api/telegram/webhook, so
 * the bot answers around the clock without any device of the shop being open. Records go
 * straight into the shop's Firestore (the app shows them as they arrive).
 * .js imports: runs on Vercel as plain Node ESM.
 */

const KEEP_ITEMS = 300;
const receivedAt = (p: PendingReceipt) => p.receivedAt;
const KEEP_SEEN = 60;
/** Firestore documents hold at most 1 MB; pictures that would not fit stay in the Telegram chat */
const DOC_LIMIT = 900_000;
const KEEP_PHOTO_BYTES = 450_000;

/** What the app writes when it switches the bot to Vercel (branches/{b}/config/telegram_bot) */
export interface BotConfig {
  webhook: boolean;
  token: string;
  chatId: string;
  mode: BotMode;
  shop: { name: string; taxId?: string; address?: string; phone?: string };
  vatRate: number;
  /** The app's address, for document links (…/#doc=…) */
  appUrl: string;
}

export interface WebhookRequest {
  branchId: string;
  projectId: string;
  apiKey: string;
  databaseId?: string;
  /** The shop account's refresh token, sealed with the webhook secret */
  sealed: string;
  /** X-Telegram-Bot-Api-Secret-Token */
  secret: string;
  /** The app's site (a Firebase web key may be limited to it) */
  referer?: string;
  update: any;
}

const tgCall = async (token: string, method: string, params: Record<string, unknown>) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(data.description || `Telegram HTTP ${res.status}`);
  return data.result;
};

async function downloadFile(token: string, fileId: string, maxBytes: number): Promise<string> {
  const info = await tgCall(token, 'getFile', { file_id: fileId });
  if (info.file_size && info.file_size > maxBytes) return '';
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`);
  if (!res.ok) throw new Error(`ดาวน์โหลดรูปจาก Telegram ไม่สำเร็จ (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) return '';
  const path = String(info.file_path || '').toLowerCase();
  const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => Number(v) || 0;

/** A Firestore expense document as the app's record (as the app reads it) */
export function expenseFromDoc(d: any): Expense {
  return {
    id: str(d.id),
    branchId: str(d.branchId),
    date: str(d.date),
    category: (d.category || 'other') as Expense['category'],
    title: str(d.title),
    amount: num(d.amount),
    includeVat: !!d.includeVat,
    vatAmount: num(d.vatAmount),
    netAmount: num(d.netAmount) || num(d.amount),
    refNumber: str(d.refNumber),
    note: str(d.note),
    receiptImage: d.receiptImage || undefined,
    receiptImageName: d.receiptImageName || undefined,
    substituteReceipt: d.substituteReceipt || undefined,
    paidFrom: d.paidFrom || undefined,
    driveFiles: Array.isArray(d.driveFiles) ? d.driveFiles : undefined,
    purchaseImages: Array.isArray(d.purchaseImages) && d.purchaseImages.length ? d.purchaseImages : undefined
  };
}

export function incomeFromDoc(d: any): OtherIncome {
  return {
    id: str(d.id),
    branchId: str(d.branchId),
    date: str(d.date),
    category: (d.category || 'other') as OtherIncome['category'],
    title: str(d.title),
    amount: num(d.amount),
    paymentMethod: d.paymentMethod || 'other',
    payerName: str(d.payerName),
    refNumber: str(d.refNumber),
    note: str(d.note),
    slipImage: d.slipImage || undefined,
    slipImageName: d.slipImageName || undefined,
    createdAt: d.createdAt || d.syncedAt || undefined
  };
}

/** The expense as the app stores it in the cloud (pictures dropped when the document would be too big) */
export function expenseDoc(e: Expense): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    id: e.id,
    branchId: e.branchId,
    category: e.category,
    title: e.title,
    amount: Number(e.amount) || 0,
    includeVat: !!e.includeVat,
    vatAmount: Number(e.vatAmount) || 0,
    netAmount: Number(e.netAmount) || 0,
    refNumber: e.refNumber || '',
    note: e.note || '',
    date: e.date,
    receiptImage: e.receiptImage || null,
    receiptImageName: e.receiptImageName || null,
    substituteReceipt: e.substituteReceipt || null,
    paidFrom: e.paidFrom || null,
    driveFiles: e.driveFiles || null,
    purchaseImages: e.purchaseImages?.length ? e.purchaseImages : null,
    syncedAt: new Date().toISOString(),
    updatedAt: new Date()
  };
  if (JSON.stringify(doc).length > DOC_LIMIT) doc.purchaseImages = null;
  if (JSON.stringify(doc).length > DOC_LIMIT) doc.receiptImage = null;
  return doc;
}

export function incomeDoc(i: OtherIncome): Record<string, unknown> {
  return {
    id: i.id,
    branchId: i.branchId,
    category: i.category,
    title: i.title,
    amount: Number(i.amount) || 0,
    date: i.date,
    paymentMethod: i.paymentMethod || 'other',
    payerName: i.payerName || '',
    refNumber: i.refNumber || '',
    note: i.note || '',
    slipImage: i.slipImage && i.slipImage.length < 250_000 ? i.slipImage : null,
    slipImageName: i.slipImageName || null,
    createdAt: i.createdAt || new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    updatedAt: new Date()
  };
}

/** The bot's records in Firestore, for one branch */
export function firestoreStore(db: Firestore, branchId: string, state: { waiting: Record<string, BotWaiting>; driveFolderUrl?: string }): BotStore {
  const cfg = (key: string) => `branches/${branchId}/config/${key}`;
  const sameBranch = (b: unknown) => !b || b === branchId;
  const waitKey = (chatId: string, userId?: string) => `${chatId}:${userId || ''}`;

  // The inbox keeps one field per bill (byId.<id>, like the app's useKeyedList), so the server and
  // the shop's devices never overwrite each other's bills. Read fresh before each change.
  const loadInbox = async () => {
    const d: any = await db.get(cfg(INBOX_DOC));
    return { items: newestFirst(keyedItems<PendingReceipt>(d), receivedAt), legacy: hasLegacyItems(d), inById: new Set(Object.keys(d?.byId || {})) };
  };
  const saveInboxItem = async (item: PendingReceipt) => {
    const { items, legacy, inById } = await loadInbox();
    const all = newestFirst([item, ...items.filter(p => p.id !== item.id)], receivedAt);
    const entries: { path: string[]; value: unknown }[] = [{ path: ['byId', item.id], value: JSON.parse(JSON.stringify(item)) }];
    // Move bills still in the old whole-list array into their own fields
    if (legacy) {
      for (const p of all) if (p.id !== item.id && !inById.has(p.id)) entries.push({ path: ['byId', p.id], value: JSON.parse(JSON.stringify(p)) });
      entries.push({ path: ['items'], value: undefined });
    }
    for (const old of all.slice(KEEP_ITEMS)) if (old.id !== item.id) entries.push({ path: ['byId', old.id], value: undefined });
    entries.push({ path: ['savedAt'], value: new Date().toISOString() }, { path: ['updatedAt'], value: new Date() });
    await db.setFields(cfg(INBOX_DOC), entries);
  };

  const patchDoc = async (path: string, patch: Record<string, unknown>) => {
    const data: Record<string, unknown> = { ...patch, syncedAt: new Date().toISOString(), updatedAt: new Date() };
    if (JSON.stringify(data).length > DOC_LIMIT && Array.isArray(data.purchaseImages)) data.purchaseImages = (data.purchaseImages as unknown[]).slice(0, 1);
    await db.set(path, data, Object.keys(data));
  };

  return {
    getExpense: async id => {
      const d = await db.get(`expenses/${id}`);
      return d ? expenseFromDoc(d) : null;
    },
    getIncome: async id => {
      const d = await db.get(`incomes/${id}`);
      return d ? incomeFromDoc(d) : null;
    },
    saveExpense: e => db.set(`expenses/${e.id}`, expenseDoc(e)),
    saveIncome: i => db.set(`incomes/${i.id}`, incomeDoc(i)),
    updateExpense: (id, patch) => patchDoc(`expenses/${id}`, patch as Record<string, unknown>),
    updateIncome: (id, patch) => patchDoc(`incomes/${id}`, patch as Record<string, unknown>),
    deleteExpense: id => db.delete(`expenses/${id}`),
    deleteIncome: id => db.delete(`incomes/${id}`),
    expensesFrom: async date => (await db.whereAtLeast('expenses', 'date', date, 2000, ['id', 'branchId', 'date', 'category', 'title', 'amount', 'includeVat', 'vatAmount', 'netAmount', 'note', 'substituteReceipt']))
      .filter(d => sameBranch(d.branchId))
      .map(expenseFromDoc),
    incomesFrom: async date => (await db.whereAtLeast('incomes', 'date', date, 2000, ['id', 'branchId', 'date', 'category', 'title', 'amount', 'createdAt', 'syncedAt']))
      .filter(d => sameBranch(d.branchId))
      .map(incomeFromDoc),
    ordersFrom: async iso => (await db.whereAtLeast('orders', 'createdAt', iso, 10000, ['branchId', 'createdAt', 'status', 'grandTotal', 'paymentStatus']))
      .filter(d => sameBranch(d.branchId))
      .map(d => ({ branchId: str(d.branchId), createdAt: str(d.createdAt), status: d.status as any, grandTotal: num(d.grandTotal), paymentStatus: (d.paymentStatus || undefined) as any })),
    inboxItem: async id => (await loadInbox()).items.find(p => p.id === id) || null,
    inboxByRecord: async recordId => (await loadInbox()).items.find(p => p.recordId === recordId) || null,
    putInbox: item => saveInboxItem(item),
    patchInbox: async (id, change) => {
      const item = (await loadInbox()).items.find(p => p.id === id);
      if (item) await saveInboxItem({ ...item, ...change });
    },
    getWaiting: async (chatId, userId) => {
      const w = state.waiting[waitKey(chatId, userId)];
      return w && w.until > Date.now() ? w : null;
    },
    setWaiting: async (chatId, userId, w) => {
      const key = waitKey(chatId, userId);
      const now = Date.now();
      const next: Record<string, BotWaiting> = {};
      for (const [k, v] of Object.entries(state.waiting)) if (k !== key && v.until > now) next[k] = v;
      if (w) next[key] = { ...w, chatId, userId, until: now + 10 * 60_000 } as BotWaiting;
      state.waiting = next;
      await db.set(cfg(BOT_STATE_DOC), { waiting: JSON.parse(JSON.stringify(next)) }, ['waiting']);
    },
    driveFolderUrl: async () => state.driveFolderUrl || ''
  };
}

export interface WebhookDeps {
  anthropicKey?: string;
  /** Read a receipt picture (replaced in tests) */
  scan?: BotContext['scan'];
}

/** Handles one delivery from Telegram. Returns the HTTP status to answer with. */
export async function handleWebhook(req: WebhookRequest, deps: WebhookDeps = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!req.secret || !req.sealed || !req.branchId || !req.projectId || !req.apiKey) return { status: 401, body: { error: 'missing' } };
  const refreshToken = await openWithSecret(req.sealed, req.secret);
  // Not from Telegram (or from an address replaced since): refused
  if (!refreshToken) return { status: 401, body: { error: 'secret' } };

  const db = new Firestore(req.projectId, () => idTokenFor(req.apiKey, refreshToken, req.referer), req.databaseId);
  const config = (await db.get(`branches/${req.branchId}/config/${BOT_CONFIG_DOC}`)) as unknown as BotConfig | null;
  if (!config?.webhook || !config.token || !config.chatId) return { status: 200, body: { ignored: 'not set up' } };

  const statePath = `branches/${req.branchId}/config/${BOT_STATE_DOC}`;
  const stateDoc: any = (await db.get(statePath)) || {};
  const seen: number[] = Array.isArray(stateDoc.seen) ? stateDoc.seen : [];
  const updateId = Number(req.update?.update_id);
  // Telegram sends a delivery again when the answer was late: handle each one once
  if (seen.includes(updateId)) return { status: 200, body: { duplicate: true } };
  await db.set(statePath, { seen: [...seen, updateId].slice(-KEEP_SEEN), lastUpdateAt: new Date().toISOString() }, ['seen', 'lastUpdateAt']);

  const update = req.update;
  const chatId = String(update?.callback_query?.message?.chat?.id ?? (update?.message || update?.channel_post)?.chat?.id ?? '');
  if (!chatId) return { status: 200, body: { ignored: 'no chat' } };
  if (chatId !== String(config.chatId).trim()) {
    // Only the shop's chat; the other one is shown in the app so the owner can find its ID
    const from = (update.message || update.channel_post)?.from || {};
    await db.set(statePath, { ignoredChatId: chatId, ignoredChatName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || '' }, ['ignoredChatId', 'ignoredChatName']);
    return { status: 200, body: { ignored: 'other chat' } };
  }

  const token = config.token;
  const state = { waiting: (stateDoc.waiting || {}) as Record<string, BotWaiting>, driveFolderUrl: str(stateDoc.driveFolderUrl) };
  const store = firestoreStore(db, req.branchId, state);
  const scan: BotContext['scan'] =
    deps.scan ||
    (async (image, today) => {
      const key = (deps.anthropicKey || '').trim();
      if (!key) throw new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บน Vercel');
      const [head, data] = image.split(';base64,');
      const ai = createClaudeJsonCaller({ apiKey: key });
      return runReceiptOcr(({ prompt, system, schema, image: img }) => ai({ prompt, system, schema, image: img, effort: 'high' }), { data, mimeType: head.replace(/^data:/, '') || 'image/jpeg' }, { todayIso: today });
    });

  const ctx: BotContext = {
    token,
    chatId,
    branchId: req.branchId,
    mode: config.mode === 'approve' ? 'approve' : 'auto',
    shop: config.shop || { name: '' },
    vatRate: Number(config.vatRate) || 7,
    tg: (method, params) => tgCall(token, method, params),
    readPhoto: async p => {
      const scanImage = await downloadFile(token, p.fileId, 8_000_000);
      if (!scanImage) throw new Error('ไฟล์รูปใหญ่เกิน 8 MB');
      const keep = p.storeFileId && p.storeFileId !== p.fileId ? await downloadFile(token, p.storeFileId, KEEP_PHOTO_BYTES) : scanImage.length * 0.75 <= KEEP_PHOTO_BYTES ? scanImage : '';
      return { scan: scanImage, store: keep };
    },
    scan,
    docUrl: e =>
      e.substituteReceipt && config.appUrl
        ? docLinkUrl(config.appUrl, { shop: config.shop || { name: '' }, expense: { date: e.date, title: e.title, amount: e.amount, note: e.note, substituteReceipt: e.substituteReceipt } })
        : undefined
  };

  try {
    await handleBotUpdate(ctx, store, update);
    await db.set(statePath, { lastError: '' }, ['lastError']).catch(() => {});
  } catch (e: any) {
    const message = e?.message || String(e);
    await db.set(statePath, { lastError: `${new Date().toISOString()} ${message}` }, ['lastError']).catch(() => {});
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: `⚠️ ระบบบอทขัดข้อง: ${message}` }).catch(() => {});
  }
  return { status: 200, body: { ok: true } };
}

/** The setup check from the app: can the server sign in and read the bot's settings? */
export async function checkWebhookSetup(input: { branchId: string; projectId: string; apiKey: string; refreshToken: string; databaseId?: string; referer?: string }, anthropicKey?: string) {
  const db = new Firestore(input.projectId, () => idTokenFor(input.apiKey, input.refreshToken, input.referer), input.databaseId);
  const config = await db.get(`branches/${input.branchId}/config/${BOT_CONFIG_DOC}`);
  return { ok: true, config: !!config, ai: !!(anthropicKey || '').trim() };
}
