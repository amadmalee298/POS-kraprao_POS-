import type { Expense, OtherIncome, Order, PendingReceipt } from '../types';
import type { VerifiedReceiptData } from '../utils/receiptOcr';
import { nextSubstituteNo } from '../utils/expenseDocNo.js';
import {
  bangkokToday,
  BotMode,
  BotWaiting,
  categoryKeyboard,
  deleteKeyboard,
  EDIT_FIELD_LABELS,
  EditField,
  editKeyboard,
  editValue,
  entryKeyboard,
  entryTemplates,
  expenseCard,
  expenseVendor,
  guessCategory,
  helpText,
  incomeCard,
  isExpenseCategory,
  isIncomeCategory,
  latestText,
  looksLikeEntry,
  mainMenuKeyboard,
  menuAction,
  messageParts,
  parseCallback,
  parseEntryText,
  recordIdFromCommand,
  SEND_HELP,
  summaryText,
  TypedEntry
} from './telegramBot.js';
import { baht, captionTitle, IncomingPhoto, isIncomeCaption, pendingId, photoFromUpdate, toPendingData } from './telegramInbox.js';

/**
 * The conversation of the shop's Telegram bot, the same wherever it runs: on Vercel (a webhook,
 * answers around the clock, data in Firestore) or in the app on a shop device (polling). The
 * place it runs supplies where records are kept (BotStore) and how to reach Telegram, read
 * photos and show documents (BotContext).
 * .js imports: also runs on Vercel as plain Node ESM.
 */

export interface BotStore {
  getExpense(id: string): Promise<Expense | null>;
  getIncome(id: string): Promise<OtherIncome | null>;
  /** Creates or replaces the whole record */
  saveExpense(e: Expense): Promise<void>;
  saveIncome(i: OtherIncome): Promise<void>;
  updateExpense(id: string, patch: Partial<Expense>): Promise<void>;
  updateIncome(id: string, patch: Partial<OtherIncome>): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  deleteIncome(id: string): Promise<void>;
  /** Records of this branch dated on or after the day (YYYY-MM-DD) */
  expensesFrom(date: string): Promise<Expense[]>;
  incomesFrom(date: string): Promise<OtherIncome[]>;
  ordersFrom(isoUtc: string): Promise<Pick<Order, 'createdAt' | 'status' | 'grandTotal' | 'paymentStatus' | 'branchId'>[]>;
  /** The bot's list of what came in (shared with the approval screen) */
  inboxItem(id: string): Promise<PendingReceipt | null>;
  inboxByRecord(recordId: string): Promise<PendingReceipt | null>;
  putInbox(item: PendingReceipt): Promise<void>;
  patchInbox(id: string, change: Partial<PendingReceipt>): Promise<void>;
  getWaiting(chatId: string, userId?: string): Promise<BotWaiting | null>;
  setWaiting(chatId: string, userId: string | undefined, w: Omit<BotWaiting, 'chatId' | 'userId' | 'until'> | null): Promise<void>;
  driveFolderUrl(): Promise<string>;
}

export interface BotContext {
  token: string;
  chatId: string;
  branchId: string;
  mode: BotMode;
  shop: { name: string; taxId?: string; address?: string; phone?: string };
  vatRate: number;
  /** Bot API call (throws on an error answer) */
  tg<T = any>(method: string, params: Record<string, unknown>): Promise<T>;
  /** The photo as data URLs: a large one for the AI and a smaller one kept with the entry ('' when too big to keep) */
  readPhoto(p: Pick<IncomingPhoto, 'fileId' | 'storeFileId' | 'fileSize'>): Promise<{ scan: string; store: string }>;
  scan(image: string, today: string): Promise<VerifiedReceiptData>;
  /** A page showing the expense's ใบรับรองแทนใบเสร็จ (button opens it) */
  docUrl?(e: Expense): string | undefined;
  /** Sends the documents as a PDF into the chat (used when there is no docUrl) */
  sendDoc?(e: Expense, replyTo?: number): Promise<void>;
  /** Saves the expense's documents into Google Drive and returns the files (when switched on here) */
  saveToDrive?(e: Expense): Promise<Expense['driveFiles'] | undefined>;
  newId?(prefix: 'exp' | 'inc'): string;
}

export const MAX_PURCHASE_PHOTOS = 3;
const FINISH_WORDS = /^(เสร็จ|เสร็จแล้ว|เรียบร้อย|ok|done|จบ|ครบ|ครบแล้ว)$/i;
const AUTO_BY = 'บันทึกอัตโนมัติ (Telegram)';

/** Expense categories whose goods go into stock (see utils/stockTypes) */
const STOCK_CATEGORIES = new Set(['raw_material', 'supplies', 'equipment']);
export const STOCK_NOTE = '📦 รอรับเข้าสต็อก: ผู้จัดการกดรับในระบบ POS (การเงิน → บิลจาก Telegram)';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const vatInside = (gross: number, rate: number) => round2((gross * rate) / (100 + rate));
const defaultId = (prefix: 'exp' | 'inc') => (prefix === 'exp' ? `exp-${Date.now()}` : `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

type Entry = TypedEntry & { category?: Expense['category']; includeVat?: boolean; vatAmount?: number; refNumber?: string; note?: string };
type Saved = { kind: 'expense'; rec: Expense } | { kind: 'income'; rec: OtherIncome };

/** Handles one Telegram update from the shop's chat */
export async function handleBotUpdate(ctx: BotContext, store: BotStore, update: any): Promise<void> {
  const { chatId } = ctx;
  const fromId = update.callback_query?.from?.id ?? (update.message || update.channel_post)?.from?.id;
  const userId = fromId === undefined ? undefined : String(fromId);
  const today = bangkokToday();
  const newId = ctx.newId || defaultId;

  const send = (params: Record<string, unknown>) => ctx.tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true, ...params });
  const sendQuiet = (params: Record<string, unknown>) => send(params).catch(() => null);
  const editCard = (messageId: number, text: string, reply_markup?: unknown) =>
    ctx.tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup }).catch(() => {});

  const madeByBot = async (id: string) => !!(await store.inboxByRecord(id));
  const keyboardFor = (rec: Expense | OtherIncome, kind: 'expense' | 'income') =>
    entryKeyboard(rec, kind, kind === 'expense' ? ctx.docUrl?.(rec as Expense) : undefined);
  const cardText = (kind: 'expense' | 'income', rec: Expense | OtherIncome, heading?: string) =>
    kind === 'expense' ? expenseCard(rec as Expense, { heading, shopName: ctx.shop.name }) : incomeCard(rec as OtherIncome, { heading, shopName: ctx.shop.name });
  /** The card, with a line while the goods still wait to be received into stock */
  const fullCard = async (kind: 'expense' | 'income', rec: Expense | OtherIncome, heading?: string) =>
    cardText(kind, rec, heading) + (kind === 'expense' && (await store.inboxByRecord(rec.id))?.stockPending ? `\n${STOCK_NOTE}` : '');

  const cardOf = async (id: string, heading?: string): Promise<{ text: string; keyboard?: unknown } | null> => {
    const e = id.startsWith('exp-') ? await store.getExpense(id) : null;
    if (e) {
      const mine = await madeByBot(id);
      const docUrl = ctx.docUrl?.(e);
      const keyboard = mine
        ? keyboardFor(e, 'expense')
        : { inline_keyboard: [[docUrl ? { text: '📄 ดูเอกสาร', url: docUrl } : { text: '📄 ดูเอกสาร', callback_data: `doc:${id}` }]] };
      return { text: await fullCard('expense', e, heading), keyboard };
    }
    const i = id.startsWith('inc-') ? await store.getIncome(id) : null;
    if (i) return { text: await fullCard('income', i, heading), keyboard: (await madeByBot(id)) ? keyboardFor(i, 'income') : undefined };
    return null;
  };

  /** Drive (where this place can save to it), then the link on the card */
  const toDrive = async (e: Expense, cardMessageId?: number) => {
    if (!ctx.saveToDrive) return;
    try {
      const files = await ctx.saveToDrive(e);
      if (!files?.length) return;
      await store.updateExpense(e.id, { driveFiles: files });
      if (cardMessageId) {
        const saved = { ...e, driveFiles: files };
        await editCard(cardMessageId, await fullCard('expense', saved), keyboardFor(saved, 'expense'));
      }
    } catch (err: any) {
      await sendQuiet({ text: `⚠️ บันทึกลง Google Drive ไม่สำเร็จ: ${err?.message || ''}` });
    }
  };

  const record = async (entry: Entry, sender: string, image?: string, imageName?: string): Promise<Saved> => {
    if (entry.kind === 'income') {
      const rec: OtherIncome = {
        id: newId('inc'),
        branchId: ctx.branchId,
        date: entry.date,
        category: 'other',
        title: entry.title,
        amount: round2(entry.amount),
        paymentMethod: image ? 'bank_transfer' : 'other',
        refNumber: entry.refNumber || '',
        payerName: entry.vendor || undefined,
        note: [entry.note, `จาก Telegram: ${sender}`].filter(Boolean).join(' · '),
        slipImage: image || undefined,
        slipImageName: image ? imageName : undefined,
        createdAt: new Date().toISOString()
      };
      await store.saveIncome(rec);
      return { kind: 'income', rec };
    }
    const includeVat = !!entry.includeVat;
    const vatAmount = includeVat ? round2(entry.vatAmount || 0) : 0;
    const category = entry.category && entry.category !== 'other' ? entry.category : guessCategory(`${entry.title} ${entry.vendor}`);
    // No tax invoice: the shop's own ใบรับรองแทนใบเสร็จ (signed later in the POS)
    const monthStart = `${entry.date.slice(0, 7)}-01`;
    const docNo = includeVat ? '' : nextSubstituteNo(await store.expensesFrom(monthStart), entry.date);
    const rec: Expense = {
      id: newId('exp'),
      branchId: ctx.branchId,
      date: entry.date,
      category,
      title: entry.title,
      amount: round2(entry.amount),
      includeVat,
      vatAmount,
      netAmount: round2(entry.amount - vatAmount),
      refNumber: entry.refNumber || '',
      note: [includeVat && entry.vendor ? `ร้าน: ${entry.vendor}` : '', entry.note, `จาก Telegram: ${sender}`].filter(Boolean).join(' · '),
      receiptImage: image || undefined,
      receiptImageName: image ? imageName : undefined,
      substituteReceipt: includeVat ? undefined : { docNo, spender: sender, payee: entry.vendor || undefined }
    };
    await store.saveExpense(rec);
    return { kind: 'expense', rec };
  };

  /** Sends (or turns the "reading…" message into) the card, and remembers where it is */
  const showCard = async (saved: Saved, inboxId: string, replyTo?: number, editId?: number, warning?: string) => {
    const heading = warning ? `✅ <b>บันทึกเรียบร้อย</b>\n⚠️ ${warning}` : undefined;
    // Goods bought: received into stock by a manager in the POS (matching items to ingredients)
    const forStock = saved.kind === 'expense' && STOCK_CATEGORIES.has(saved.rec.category);
    if (forStock) {
      const e = saved.rec as Expense;
      const item = await store.inboxItem(inboxId);
      await store.patchInbox(inboxId, {
        stockPending: true,
        data: {
          lineItems: item?.data?.lineItems,
          title: e.title,
          vendorName: expenseVendor(e),
          date: e.date,
          category: e.category,
          amount: e.amount,
          includeVat: e.includeVat,
          vatAmount: e.vatAmount,
          netAmount: e.netAmount,
          refNumber: e.refNumber || '',
          note: item?.data?.note || '',
          warnings: [],
          verified: true,
          confidenceScore: item?.data?.confidenceScore ?? 1
        }
      });
    }
    const text = await fullCard(saved.kind, saved.rec, heading);
    const keyboard = keyboardFor(saved.rec, saved.kind);
    let cardId = editId;
    if (editId) await editCard(editId, text, keyboard);
    else cardId = (await sendQuiet({ text, reply_markup: keyboard, reply_to_message_id: replyTo, allow_sending_without_reply: true }))?.message_id;
    if (cardId) await store.patchInbox(inboxId, { cardMessageId: cardId });
    if (saved.kind === 'expense') await toDrive(saved.rec, cardId);
  };

  /** Adds a photo of the goods to an expense the bot is waiting on */
  const addPurchasePhoto = async (waiting: BotWaiting, photo: IncomingPhoto) => {
    if (waiting.group && waiting.group !== photo.mediaGroupId) {
      // Done earlier: this is a new bill
      await store.setWaiting(chatId, userId, null);
      return false;
    }
    const e = await store.getExpense(waiting.recordId);
    if (!e) {
      await store.setWaiting(chatId, userId, null);
      return false;
    }
    const finishing = FINISH_WORDS.test(photo.caption.trim());
    const count = e.purchaseImages?.length || 0;
    if (count >= MAX_PURCHASE_PHOTOS) {
      await store.setWaiting(chatId, userId, null);
      await sendQuiet({ text: `แนบรูปครบ ${MAX_PURCHASE_PHOTOS} รูปแล้ว`, reply_to_message_id: photo.messageId });
      return true;
    }
    try {
      const { store: dataUrl } = await ctx.readPhoto(photo);
      if (!dataUrl) throw new Error('รูปใหญ่เกินไป (ส่งเป็นรูปภาพ ไม่ใช่ไฟล์)');
      const next: Expense = { ...e, purchaseImages: [...(e.purchaseImages || []), { name: `telegram-${photo.messageId}.jpg`, dataUrl }] };
      await store.updateExpense(e.id, { purchaseImages: next.purchaseImages });
      const total = count + 1;
      const full = total >= MAX_PURCHASE_PHOTOS;
      // "เสร็จ" said with this photo or earlier in the same album
      const done = full || finishing || !!waiting.group;
      // An album's caption comes with its first photo: the rest of that album still belongs here
      const group = full ? undefined : waiting.group || (finishing ? photo.mediaGroupId : undefined);
      if (done && !group) await store.setWaiting(chatId, userId, null);
      else await store.setWaiting(chatId, userId, { action: 'photo', recordId: e.id, cardMessageId: waiting.cardMessageId, group });
      await sendQuiet({
        text: `✅ เพิ่มรูปแล้ว (${total}/${MAX_PURCHASE_PHOTOS})${done ? '' : ' ส่งเพิ่มได้อีก หรือพิมพ์ “เสร็จ”'}`,
        reply_to_message_id: photo.messageId,
        ...(done ? { reply_markup: mainMenuKeyboard() } : {})
      });
      if (waiting.cardMessageId) await editCard(waiting.cardMessageId, await fullCard('expense', next), keyboardFor(next, 'expense'));
      if (next.driveFiles?.length) await toDrive(next, waiting.cardMessageId);
    } catch (err: any) {
      await sendQuiet({ text: `⚠️ เพิ่มรูปไม่สำเร็จ: ${err?.message || ''}\nลองส่งรูปนี้อีกครั้ง`, reply_to_message_id: photo.messageId });
    }
    return true;
  };

  // ---------- Buttons under a card ----------
  if (update.callback_query) {
    const q = update.callback_query;
    const answer = (text?: string) => ctx.tg('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    const cardMessage = q.message?.message_id as number | undefined;
    const { action, id, value } = parseCallback(q.data || '');
    const isExpense = id.startsWith('exp-');
    const kind = isExpense ? 'expense' : 'income';
    const rec = isExpense ? await store.getExpense(id) : await store.getIncome(id);
    if (!rec) return void (await answer('ไม่พบรายการนี้แล้ว (อาจถูกลบ)'));
    if (action !== 'doc' && !(await madeByBot(id))) return void (await answer('แก้ไขรายการนี้ได้ในระบบ POS'));

    if (action === 'doc') {
      const e = rec as Expense;
      const url = ctx.docUrl?.(e);
      if (url) {
        await answer();
        await sendQuiet({ text: '📄 เปิดเอกสาร (พิมพ์หรือบันทึกเป็น PDF ได้)', reply_markup: { inline_keyboard: [[{ text: '📄 เปิดใบแทนใบเสร็จ', url }]] } });
        return;
      }
      if (!ctx.sendDoc) return void (await answer('รายการนี้ไม่มีเอกสาร'));
      await answer('กำลังสร้าง PDF...');
      try {
        await ctx.sendDoc(e, cardMessage);
      } catch (err: any) {
        await sendQuiet({ text: `⚠️ สร้าง PDF ไม่สำเร็จ: ${err?.message || ''}` });
      }
      return;
    }
    if (action === 'photo') {
      const count = (rec as Expense).purchaseImages?.length || 0;
      if (count >= MAX_PURCHASE_PHOTOS) return void (await answer(`แนบรูปครบ ${MAX_PURCHASE_PHOTOS} รูปแล้ว`));
      await store.setWaiting(chatId, userId, { action: 'photo', recordId: id, cardMessageId: cardMessage });
      await answer();
      await sendQuiet({
        text: `📷 ส่งรูปสินค้า / หลักฐานการซื้อมาได้เลย (อีก ${MAX_PURCHASE_PHOTOS - count} รูป ส่งพร้อมกันหลายรูปได้)\nพิมพ์ “เสร็จ” เมื่อส่งครบ`,
        reply_to_message_id: cardMessage,
        allow_sending_without_reply: true
      });
      return;
    }
    if (action === 'edit' || action === 'cat' || action === 'del') {
      await answer();
      const markup = action === 'edit' ? editKeyboard(id, kind) : action === 'cat' ? categoryKeyboard(id, kind) : deleteKeyboard(id);
      await ctx.tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cardMessage, reply_markup: markup }).catch(() => {});
      return;
    }
    if (action === 'back') {
      await store.setWaiting(chatId, userId, null);
      await answer();
      const card = await cardOf(id);
      if (card && cardMessage) await editCard(cardMessage, card.text, card.keyboard);
      return;
    }
    if (action === 'setcat') {
      if (isExpense && isExpenseCategory(value)) {
        await store.updateExpense(id, { category: value });
        const item = await store.inboxByRecord(id);
        if (item && !item.stockAdded?.length && item.status === 'approved') {
          await store.patchInbox(item.id, { stockPending: STOCK_CATEGORIES.has(value), ...(item.data ? { data: { ...item.data, category: value } } : {}) });
        }
      }
      else if (!isExpense && isIncomeCategory(value)) await store.updateIncome(id, { category: value });
      else return void (await answer());
      await answer('เปลี่ยนหมวดหมู่แล้ว');
      const changed = { ...rec, category: value } as Expense | OtherIncome;
      if (cardMessage) await editCard(cardMessage, await fullCard(kind, changed, '✏️ <b>แก้ไขแล้ว</b>'), keyboardFor(changed, kind));
      return;
    }
    if (action === 'ask') {
      const field = value as EditField;
      if (!(field in EDIT_FIELD_LABELS)) return void (await answer());
      await store.setWaiting(chatId, userId, { action: 'edit', recordId: id, field, cardMessageId: cardMessage });
      await answer();
      const hint = field === 'amount' ? 'เช่น 135 หรือ 1,250.50' : field === 'date' ? 'เช่น 5/10/69' : '';
      await sendQuiet({ text: `✏️ พิมพ์${EDIT_FIELD_LABELS[field]}ใหม่ ${hint}`.trim(), reply_markup: { force_reply: true, input_field_placeholder: EDIT_FIELD_LABELS[field] } });
      return;
    }
    if (action === 'delok') {
      const gone = `${isExpense ? '📉' : '📈'} ${rec.title} ${baht(rec.amount)}`.replace(/[&<>]/g, '');
      if (isExpense) await store.deleteExpense(id);
      else await store.deleteIncome(id);
      const item = await store.inboxByRecord(id);
      if (item) await store.patchInbox(item.id, { status: 'rejected', decidedAt: new Date().toISOString(), decidedBy: `ลบจาก Telegram (${q.from?.first_name || ''})` });
      await answer('ลบแล้ว');
      if (cardMessage) await editCard(cardMessage, `🗑 <b>ลบรายการแล้ว</b>\n${gone}`);
      return;
    }
    await answer();
    return;
  }

  // ---------- Photos ----------
  const photo = photoFromUpdate(update);
  if (photo) {
    const waiting = await store.getWaiting(chatId, userId);
    if (waiting?.action === 'photo' && (await addPurchasePhoto(waiting, photo))) return;

    const id = pendingId(photo);
    if (await store.inboxItem(id)) return; // already handled (Telegram sent it again)
    const item: PendingReceipt = {
      id,
      source: 'telegram',
      chatId,
      messageId: photo.messageId,
      fileId: photo.fileId,
      storeFileId: photo.storeFileId,
      senderName: photo.senderName,
      caption: photo.caption,
      receivedAt: photo.date,
      kind: isIncomeCaption(photo.caption) ? 'income' : 'expense',
      status: 'reading'
    };
    await store.putInbox(item);
    const progress = await sendQuiet({ text: '⏳ กำลังอ่านบิล...', reply_to_message_id: photo.messageId, allow_sending_without_reply: true });
    const progressId = progress?.message_id as number | undefined;
    try {
      const images = await ctx.readPhoto(photo);
      const data = toPendingData(await ctx.scan(images.scan, today), item.receivedAt.slice(0, 10));
      const fromCaption = captionTitle(photo.caption || '');
      if (fromCaption) data.title = fromCaption;
      if (ctx.mode === 'approve') {
        await store.patchInbox(id, { status: 'pending', data, error: undefined });
        const text = `📥 <b>รับบิลแล้ว รออนุมัติในระบบ POS</b>\n${(data.vendorName || data.title).replace(/[&<>]/g, '')}\nยอด ${baht(data.amount)} · วันที่ ${data.date}${data.warnings.length ? '\n⚠️ ตัวเลขบางส่วนไม่ตรงกัน โปรดตรวจก่อนอนุมัติ' : ''}`;
        if (progressId) await editCard(progressId, text);
        else await sendQuiet({ text, reply_to_message_id: photo.messageId });
        return;
      }
      if (!(data.amount > 0)) throw new Error('ไม่พบยอดเงินในรูป');
      // A transfer slip names the bank transfer, not what was paid for: the payee says more
      const title = /^(โอนเงิน|โอน|สลิป|ชำระเงิน|จ่ายเงิน|transfer|payment)/i.test(data.title) && data.vendorName && !fromCaption ? `จ่าย ${data.vendorName}` : data.title;
      const saved = await record(
        { kind: item.kind, date: data.date, title, amount: data.amount, vendor: data.vendorName, category: data.category, includeVat: data.includeVat, vatAmount: data.vatAmount, refNumber: data.refNumber, note: data.note },
        photo.senderName,
        images.store,
        `telegram-${photo.messageId}.jpg`
      );
      await store.patchInbox(id, { status: 'approved', data, recordId: saved.rec.id, decidedBy: AUTO_BY, decidedAt: new Date().toISOString(), error: undefined });
      await showCard(saved, id, photo.messageId, progressId, data.warnings.length ? 'ตัวเลขบางส่วนไม่ตรงกัน โปรดตรวจยอด (กด ✏️ แก้ไขได้)' : undefined);
    } catch (e: any) {
      await store.patchInbox(id, { status: 'failed', error: e?.message || 'อ่านบิลไม่สำเร็จ' });
      // The amount can be typed as the answer, and the photo is kept with the entry
      await store.setWaiting(chatId, userId, { action: 'amount', recordId: id });
      const text = `⚠️ อ่านบิลนี้ไม่สำเร็จ: ${String(e?.message || '').replace(/[&<>]/g, '')}\n✍️ พิมพ์ยอดเงินและชื่อรายการตอบกลับได้เลย เช่น <code>135 ค่าผัก</code>\n(หรือกรอกเองในระบบ POS หน้า “บิลจาก Telegram”)`;
      if (progressId) await editCard(progressId, text);
      else await sendQuiet({ text, reply_to_message_id: photo.messageId });
    }
    return;
  }

  // ---------- Text ----------
  const msg = messageParts(update);
  if (!msg || !msg.text) return;
  const text = msg.text.trim();
  const waiting = await store.getWaiting(chatId, userId);

  if (waiting?.action === 'photo' && FINISH_WORDS.test(text)) {
    await store.setWaiting(chatId, userId, null);
    await send({ text: '👍 เรียบร้อย', reply_markup: mainMenuKeyboard() });
    return;
  }

  const action = menuAction(text);
  if (action) {
    await store.setWaiting(chatId, userId, null);
    if (action === 'menu') await send({ text: `สวัสดีครับ 👋 บอทบัญชีของร้าน ${ctx.shop.name || ''}\nเลือกเมนูด้านล่าง หรือส่งรูปสลิป/บิลเข้ามาได้เลย`.replace(/[&<>]/g, ''), reply_markup: mainMenuKeyboard() });
    else if (action === 'send') await send({ text: SEND_HELP });
    else if (action === 'type') await send({ text: entryTemplates(today) });
    else if (action === 'help') await send({ text: helpText(ctx.mode), reply_markup: mainMenuKeyboard() });
    else if (action === 'today' || action === 'month') {
      const from = action === 'today' ? today : `${today.slice(0, 7)}-01`;
      // Orders are stamped in UTC: from the shop's midnight (UTC+7)
      const fromUtc = new Date(Date.parse(`${from}T00:00:00Z`) - 7 * 3600_000).toISOString();
      const [orders, expenses, incomes] = await Promise.all([store.ordersFrom(fromUtc), store.expensesFrom(from), store.incomesFrom(from)]);
      await send({ text: summaryText(action === 'today' ? today : today.slice(0, 7), { orders, expenses, incomes, branchId: ctx.branchId }) });
    } else if (action === 'latest') {
      const from = new Date(Date.parse(`${today}T00:00:00Z`) - 31 * 86_400_000).toISOString().slice(0, 10);
      const [expenses, incomes] = await Promise.all([store.expensesFrom(from), store.incomesFrom(from)]);
      await send({ text: latestText(expenses, incomes) });
    } else if (action === 'drive') {
      const folder = await store.driveFolderUrl();
      await send({
        text: folder
          ? '📁 <b>Google Drive ของร้าน</b>\nเอกสารรายจ่ายเก็บในโฟลเดอร์ “ครัวกะเพรา POS เอกสาร/รายจ่าย/ปี-เดือน”'
          : '📁 ยังไม่มีเอกสารใน Google Drive\nเปิดได้ที่ ตั้งค่า → Google Sheets (Apps Script) → “บันทึกเอกสารลง Google Drive” แล้วเปิดแอปไว้สักครู่ ระบบจะเก็บเอกสารให้',
        reply_markup: folder ? { inline_keyboard: [[{ text: '📂 เปิดโฟลเดอร์เดือนล่าสุด', url: folder }]] } : undefined
      });
    }
    return;
  }

  const openId = recordIdFromCommand(text);
  if (openId) {
    const card = await cardOf(openId, '🧾 <b>รายการ</b>');
    await send(card ? { text: card.text, reply_markup: card.keyboard } : { text: 'ไม่พบรายการนี้แล้ว' });
    return;
  }

  // The answer to "type the new amount"
  if (waiting?.action === 'edit' && waiting.field) {
    const change = editValue(waiting.field, text, today);
    if ('error' in change) {
      await send({ text: `⚠️ ${change.error}`, reply_markup: { force_reply: true } });
      return;
    }
    await store.setWaiting(chatId, userId, null);
    const e = waiting.recordId.startsWith('exp-') ? await store.getExpense(waiting.recordId) : null;
    const i = !e && waiting.recordId.startsWith('inc-') ? await store.getIncome(waiting.recordId) : null;
    if (e) {
      const next: Expense = { ...e };
      if (change.amount !== undefined) {
        next.amount = change.amount;
        next.vatAmount = e.includeVat ? vatInside(change.amount, ctx.vatRate) : 0;
        next.netAmount = round2(change.amount - next.vatAmount);
      }
      if (change.title) next.title = change.title;
      if (change.date) next.date = change.date;
      if (change.note !== undefined) {
        const keep = (e.note || '').split(' · ').filter(p => /^ร้าน: |^จาก Telegram/.test(p));
        next.note = [change.note, ...keep].join(' · ');
      }
      if (change.vendor !== undefined) {
        if (e.substituteReceipt) next.substituteReceipt = { ...e.substituteReceipt, payee: change.vendor };
        else next.note = [`ร้าน: ${change.vendor}`, ...(e.note || '').split(' · ').filter(p => p && !/^ร้าน: /.test(p))].join(' · ');
      }
      await store.updateExpense(e.id, { amount: next.amount, vatAmount: next.vatAmount, netAmount: next.netAmount, title: next.title, date: next.date, note: next.note, substituteReceipt: next.substituteReceipt });
      if (waiting.cardMessageId) await editCard(waiting.cardMessageId, await fullCard('expense', next, '✏️ <b>แก้ไขแล้ว</b>'), keyboardFor(next, 'expense'));
      await send({ text: `✅ แก้ไข${EDIT_FIELD_LABELS[waiting.field]}แล้ว (${(expenseVendor(next) || next.title).replace(/[&<>]/g, '')} ${baht(next.amount)})`, reply_markup: mainMenuKeyboard() });
      if (next.driveFiles?.length) await toDrive(next, waiting.cardMessageId);
    } else if (i) {
      const patch: Partial<OtherIncome> = {
        ...(change.amount !== undefined ? { amount: change.amount } : {}),
        ...(change.title ? { title: change.title } : {}),
        ...(change.date ? { date: change.date } : {}),
        ...(change.note !== undefined ? { note: change.note } : {}),
        ...(change.vendor !== undefined ? { payerName: change.vendor } : {})
      };
      await store.updateIncome(i.id, patch);
      const next = { ...i, ...patch };
      if (waiting.cardMessageId) await editCard(waiting.cardMessageId, await fullCard('income', next, '✏️ <b>แก้ไขแล้ว</b>'), keyboardFor(next, 'income'));
      await send({ text: `✅ แก้ไข${EDIT_FIELD_LABELS[waiting.field]}แล้ว`, reply_markup: mainMenuKeyboard() });
    } else {
      await send({ text: 'ไม่พบรายการนี้แล้ว' });
    }
    return;
  }

  // The amount of a photo the AI could not read
  if (waiting?.action === 'amount' && !looksLikeEntry(text)) {
    const item = await store.inboxItem(waiting.recordId);
    if (item && item.status !== 'approved') {
      const parsed = parseEntryText(`${item.kind === 'income' ? 'รับ' : 'จ่าย'} ${text}`, item.receivedAt.slice(0, 10));
      if ('error' in parsed) {
        await send({ text: `⚠️ ${parsed.error}`, reply_to_message_id: msg.messageId });
        return;
      }
      await store.setWaiting(chatId, userId, null);
      let image = '';
      try {
        image = (await ctx.readPhoto({ fileId: item.fileId, storeFileId: item.storeFileId || item.fileId, fileSize: 0 })).store;
      } catch {
        image = '';
      }
      if (parsed.title === 'รายจ่าย' || parsed.title === 'รายรับ') parsed.title = captionTitle(item.caption) || parsed.title;
      const saved = await record(parsed, item.senderName || msg.senderName, image || undefined, `telegram-${item.messageId}.jpg`);
      await store.patchInbox(item.id, { status: 'approved', recordId: saved.rec.id, decidedBy: AUTO_BY, decidedAt: new Date().toISOString(), error: undefined });
      await showCard(saved, item.id, msg.messageId);
      return;
    }
    await store.setWaiting(chatId, userId, null);
  }

  // "จ่าย ค่าผัก 135 บาท" / "รับ 500 ค่าจัดเลี้ยง"
  if (!looksLikeEntry(text)) return;
  const parsed = parseEntryText(text, today);
  if ('error' in parsed) {
    // Words like "จ่ายแล้ว" in a conversation: only answer when it looked like an entry with a number
    if (/\d/.test(text) || /\.\.\./.test(text)) await send({ text: `⚠️ ${parsed.error}\n\n${entryTemplates(today)}`, reply_to_message_id: msg.messageId });
    return;
  }
  const id = `tg-${chatId}-${msg.messageId}`;
  if (await store.inboxItem(id)) return;
  const base: PendingReceipt = {
    id,
    source: 'telegram',
    chatId,
    messageId: msg.messageId,
    fileId: '',
    senderName: msg.senderName,
    caption: text,
    receivedAt: new Date().toISOString(),
    kind: parsed.kind,
    status: 'pending'
  };
  if (ctx.mode === 'approve') {
    await store.putInbox({
      ...base,
      data: {
        title: parsed.title,
        vendorName: parsed.vendor,
        date: parsed.date,
        category: guessCategory(`${parsed.title} ${parsed.vendor}`),
        amount: parsed.amount,
        includeVat: false,
        vatAmount: 0,
        netAmount: parsed.amount,
        refNumber: '',
        note: '',
        warnings: [],
        verified: true,
        confidenceScore: 1
      }
    });
    await send({ text: `📥 รับรายการแล้ว รออนุมัติในระบบ POS\n${parsed.title.replace(/[&<>]/g, '')} ${baht(parsed.amount)} · ${parsed.date}`, reply_to_message_id: msg.messageId });
    return;
  }
  await store.putInbox(base);
  const saved = await record(parsed, msg.senderName);
  await store.patchInbox(id, { status: 'approved', recordId: saved.rec.id, decidedBy: AUTO_BY, decidedAt: new Date().toISOString() });
  await showCard(saved, id, msg.messageId);
}
