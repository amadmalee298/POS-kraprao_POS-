import { useEffect, useRef, useState } from 'react';
import type { Expense, OtherIncome, PendingReceipt } from '../../types';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { getStoredCredentials } from '../../services/notificationService';
import { scanReceiptImage, vercelBase } from '../../services/receiptScan';
import { driveEnabled, hasExpenseDocs, saveExpenseToDrive } from '../../services/expenseDrive';
import {
  baht,
  captionTitle,
  downloadTelegramFile,
  INBOX_OFFSET_KEY,
  INBOX_STATUS_EVENT,
  inboxEnabledHere,
  keepAwakeHere,
  isIncomeCaption,
  pendingId,
  photoFromUpdate,
  telegramCall,
  toPendingData,
  writeInboxStatus
} from '../../services/telegramInbox';
import {
  BOT_COMMANDS,
  categoryKeyboard,
  deleteKeyboard,
  DRIVE_FOLDER_KEY,
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
  readBotMode,
  readWaiting,
  recordIdFromCommand,
  SEND_HELP,
  sendTelegramDocument,
  summaryText,
  TypedEntry,
  writeWaiting,
  ymdLocal
} from '../../services/telegramBot';
import { round2, vatInside, vatRateOf } from '../../utils/accounting';
import { compressBase64Image } from '../../utils/imageCompressor';
import { htmlToPdfBlob } from '../../utils/htmlToPdf';
import { sellerInfo } from '../../utils/seller';
import { documentHtml } from '../../utils/staffDocs';
import { expenseDocName, expenseDocPages, nextSubstituteNo } from '../../utils/substituteReceipt';

/** Telegram holds the request open until something arrives, so replies feel instant */
const LONG_POLL_S = 25;
const RETRY_MS = 20_000;

/** "Load failed" (Safari), "Failed to fetch" (Chrome), "NetworkError…" (Firefox) */
const isNetworkError = (e: any) => e instanceof TypeError || /load failed|failed to fetch|network/i.test(e?.message || '');
const KEEP_ITEMS = 300;
const MAX_PURCHASE_PHOTOS = 3;

/** Reads one Telegram photo with AI, keeping a copy of the picture to store with the entry */
export async function readTelegramReceiptWithImage(token: string, item: Pick<PendingReceipt, 'fileId' | 'receivedAt' | 'caption'>, serverUrl?: string) {
  const original = await downloadTelegramFile(token, item.fileId, vercelBase(serverUrl));
  const image = await compressBase64Image(original, 1600, 0.85);
  const result = await scanReceiptImage(image, 'image/jpeg', serverUrl);
  const data = toPendingData(result, item.receivedAt.slice(0, 10));
  // A transfer slip names the bank, not what was bought: the sender's caption says it better
  const fromCaption = captionTitle(item.caption || '');
  // Kept smaller with the entry (it goes to the cloud with it)
  const stored = await compressBase64Image(original, 1000, 0.7).catch(() => image);
  return { data: fromCaption ? { ...data, title: fromCaption } : data, image: stored };
}

/** Reads one Telegram photo with AI; used by "read again" on the approval screen. */
export async function readTelegramReceipt(token: string, item: Pick<PendingReceipt, 'fileId' | 'receivedAt' | 'caption'>, serverUrl?: string) {
  return (await readTelegramReceiptWithImage(token, item, serverUrl)).data;
}

/**
 * The shop's Telegram bot, run from the one device that has it switched on (the app polls the bot;
 * no server needed). Receives slips and bills, typed entries, menu buttons and the buttons under
 * saved entries. Mounted once in the app.
 */
export const TelegramInboxPoller = () => {
  const pos = usePOS();
  const posRef = useRef(pos);
  posRef.current = pos;
  const [items, setItems] = useTelegramInbox();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [enabled, setEnabled] = useState(inboxEnabledHere);
  const [keepAwake, setKeepAwake] = useState(keepAwakeHere);

  // The screen kept on (Wake Lock: iOS 16.4+, Android Chrome); released when the app is hidden and asked again on return
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!enabled || !keepAwake || !nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let off = false;
    const take = () => {
      if (document.hidden || off) return;
      nav.wakeLock!.request('screen').then(l => {
        if (off) void l.release();
        else lock = l;
      }).catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      off = true;
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => {});
    };
  }, [enabled, keepAwake]);

  useEffect(() => {
    const onChange = () => {
      setEnabled(inboxEnabledHere());
      setKeepAwake(keepAwakeHere());
    };
    window.addEventListener(INBOX_STATUS_EVENT, onChange);
    return () => window.removeEventListener(INBOX_STATUS_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let commandsSet = false;

    const patch = (id: string, change: Partial<PendingReceipt>) => {
      itemsRef.current = itemsRef.current.map(p => (p.id === id ? { ...p, ...change } : p));
      setItems(prev => prev.map(p => (p.id === id ? { ...p, ...change } : p)));
    };
    const addItem = (item: PendingReceipt) => {
      itemsRef.current = [item, ...itemsRef.current.filter(p => p.id !== item.id)];
      setItems(prev => [item, ...prev.filter(p => p.id !== item.id)].slice(0, KEEP_ITEMS));
    };

    // Records are read from the latest render (the bot may change one twice within a tick)
    const findExpense = (id: string) => posRef.current.expenses.find(e => e.id === id);
    const findIncome = (id: string) => posRef.current.incomes.find(i => i.id === id);
    const shop = () => sellerInfo(posRef.current.settings, posRef.current.currentBranch);
    const today = () => ymdLocal(new Date());
    /** Entries the bot made: only these can be edited or deleted from the chat */
    const madeByBot = (id: string) => itemsRef.current.some(p => p.recordId === id);

    const run = async (token: string, chatId: string, update: any) => {
      const fromId = update.callback_query?.from?.id ?? (update.message || update.channel_post)?.from?.id;
      const userId = fromId === undefined ? undefined : String(fromId);
      const send = (params: Record<string, unknown>) => telegramCall(token, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', disable_web_page_preview: true, ...params });
      const editCard = (messageId: number, text: string, reply_markup?: unknown) =>
        telegramCall(token, 'editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup }).catch(() => {});

      const cardOf = (id: string, heading?: string): { text: string; keyboard?: unknown } | null => {
        const e = findExpense(id);
        if (e) {
          const keyboard = madeByBot(id)
            ? entryKeyboard(e, 'expense')
            : { inline_keyboard: [[{ text: '📄 ดูเอกสาร', callback_data: `doc:${id}` }]] };
          return { text: expenseCard(e, { heading, shopName: shop().name }), keyboard };
        }
        const i = findIncome(id);
        if (i) return { text: incomeCard(i, { heading, shopName: shop().name }), keyboard: madeByBot(id) ? entryKeyboard(i, 'income') : undefined };
        return null;
      };

      /** Saves an expense's documents into Drive (when switched on), then puts the link on its card */
      const toDrive = async (e: Expense, cardMessageId?: number) => {
        const { settings, updateExpense } = posRef.current;
        if (!driveEnabled(settings) || !hasExpenseDocs(e)) return;
        try {
          const files = await saveExpenseToDrive(e, shop(), settings);
          if (!files.length) return;
          updateExpense(e.id, { driveFiles: files });
          if (cardMessageId) {
            const saved = { ...e, driveFiles: files };
            await editCard(cardMessageId, expenseCard(saved, { shopName: shop().name }), entryKeyboard(saved, 'expense'));
          }
        } catch (err: any) {
          await send({ text: `⚠️ บันทึกลง Google Drive ไม่สำเร็จ: ${err?.message || ''}` }).catch(() => {});
        }
      };

      /** Records an entry and returns its card text and buttons */
      const record = (
        entry: TypedEntry & { category?: Expense['category']; includeVat?: boolean; vatAmount?: number; refNumber?: string; note?: string },
        sender: string,
        image?: string,
        imageName?: string
      ): { kind: 'expense'; rec: Expense } | { kind: 'income'; rec: OtherIncome } => {
        const { addExpense, addIncome, currentBranch, expenses } = posRef.current;
        if (entry.kind === 'income') {
          const rec = addIncome({
            branchId: currentBranch.id,
            date: entry.date,
            category: 'other',
            title: entry.title,
            amount: round2(entry.amount),
            paymentMethod: image ? 'bank_transfer' : 'other',
            refNumber: entry.refNumber || '',
            payerName: entry.vendor || undefined,
            note: [entry.note, `จาก Telegram: ${sender}`].filter(Boolean).join(' · '),
            slipImage: image,
            slipImageName: image ? imageName : undefined
          });
          return { kind: 'income', rec };
        }
        const includeVat = !!entry.includeVat;
        const vatAmount = includeVat ? round2(entry.vatAmount || 0) : 0;
        const category = entry.category && entry.category !== 'other' ? entry.category : guessCategory(`${entry.title} ${entry.vendor}`);
        const rec = addExpense({
          branchId: currentBranch.id,
          date: entry.date,
          category,
          title: entry.title,
          amount: round2(entry.amount),
          includeVat,
          vatAmount,
          netAmount: round2(entry.amount - vatAmount),
          refNumber: entry.refNumber || '',
          note: [includeVat && entry.vendor ? `ร้าน: ${entry.vendor}` : '', entry.note, `จาก Telegram: ${sender}`].filter(Boolean).join(' · '),
          receiptImage: image,
          receiptImageName: image ? imageName : undefined,
          // No tax invoice: the shop's own ใบรับรองแทนใบเสร็จ, signed later in the POS
          substituteReceipt: includeVat ? undefined : { docNo: nextSubstituteNo(expenses, entry.date), spender: sender, payee: entry.vendor || undefined }
        });
        // So a second entry in the same tick gets the next document number
        posRef.current = { ...posRef.current, expenses: [rec, ...posRef.current.expenses] };
        return { kind: 'expense', rec };
      };

      const remember = (recordId: string, kind: 'expense' | 'income', source: Partial<PendingReceipt>) => {
        addItem({
          id: source.id || `tg-${chatId}-${source.messageId}`,
          source: 'telegram',
          chatId,
          messageId: source.messageId || 0,
          fileId: source.fileId || '',
          senderName: source.senderName || '',
          caption: source.caption || '',
          receivedAt: source.receivedAt || new Date().toISOString(),
          kind,
          status: 'approved',
          decidedBy: 'บันทึกอัตโนมัติ (Telegram)',
          decidedAt: new Date().toISOString(),
          recordId,
          data: source.data
        });
      };

      const showCard = async (kind: 'expense' | 'income', rec: Expense | OtherIncome, replyTo?: number, editId?: number, warning?: string) => {
        const heading = warning ? `✅ <b>บันทึกเรียบร้อย</b>\n⚠️ ${warning}` : undefined;
        const text = kind === 'expense' ? expenseCard(rec as Expense, { heading, shopName: shop().name }) : incomeCard(rec as OtherIncome, { heading, shopName: shop().name });
        const keyboard = entryKeyboard(rec, kind);
        if (editId) {
          await editCard(editId, text, keyboard);
          return editId;
        }
        const sent = await send({ text, reply_markup: keyboard, reply_to_message_id: replyTo }).catch(() => null);
        return sent?.message_id as number | undefined;
      };

      // ---------- Buttons under a card ----------
      if (update.callback_query) {
        const q = update.callback_query;
        const answer = (text?: string) => telegramCall(token, 'answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
        const cardMessage = q.message?.message_id as number | undefined;
        const { action, id, value } = parseCallback(q.data || '');
        const isExpense = id.startsWith('exp-');
        const kind = isExpense ? 'expense' : 'income';
        const exists = isExpense ? findExpense(id) : findIncome(id);
        if (!exists) {
          await answer('ไม่พบรายการนี้แล้ว (อาจถูกลบ)');
          return;
        }
        if (action !== 'doc' && !madeByBot(id)) {
          await answer('แก้ไขรายการนี้ได้ในระบบ POS');
          return;
        }
        const pos2 = posRef.current;
        if (action === 'doc') {
          const e = findExpense(id);
          const pages = e ? expenseDocPages(e, shop()) : [];
          if (!e || !pages.length) {
            await answer('รายการนี้ไม่มีเอกสาร');
            return;
          }
          await answer('กำลังสร้าง PDF...');
          try {
            const pdf = await htmlToPdfBlob(documentHtml(e.title, pages));
            await sendTelegramDocument(token, chatId, pdf, expenseDocName(e, 'pdf'), {
              caption: e.substituteReceipt ? `📄 ใบรับรองแทนใบเสร็จ ${e.substituteReceipt.docNo} · ${baht(e.amount)}` : `📄 หลักฐานรายจ่าย ${e.title} · ${baht(e.amount)}`,
              ...(cardMessage ? { reply_to_message_id: cardMessage } : {})
            });
          } catch (err: any) {
            await send({ text: `⚠️ สร้าง PDF ไม่สำเร็จ: ${err?.message || ''}` });
          }
          return;
        }
        if (action === 'photo') {
          const count = findExpense(id)?.purchaseImages?.length || 0;
          if (count >= MAX_PURCHASE_PHOTOS) {
            await answer(`แนบรูปครบ ${MAX_PURCHASE_PHOTOS} รูปแล้ว`);
            return;
          }
          writeWaiting(chatId, userId, { action: 'photo', recordId: id, cardMessageId: cardMessage });
          await answer();
          await send({ text: `📷 ส่งรูปสินค้า / หลักฐานการซื้อมาได้เลย (อีก ${MAX_PURCHASE_PHOTOS - count} รูป)\nพิมพ์ “เสร็จ” เมื่อส่งครบ` , reply_to_message_id: cardMessage });
          return;
        }
        if (action === 'edit') {
          await answer();
          await telegramCall(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cardMessage, reply_markup: editKeyboard(id, kind) }).catch(() => {});
          return;
        }
        if (action === 'back') {
          writeWaiting(chatId, userId, null);
          await answer();
          const card = cardOf(id);
          if (card && cardMessage) await editCard(cardMessage, card.text, card.keyboard);
          return;
        }
        if (action === 'cat') {
          await answer();
          await telegramCall(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cardMessage, reply_markup: categoryKeyboard(id, kind) }).catch(() => {});
          return;
        }
        if (action === 'setcat') {
          if (isExpense && isExpenseCategory(value)) pos2.updateExpense(id, { category: value });
          else if (!isExpense && isIncomeCategory(value)) pos2.updateIncome(id, { category: value });
          else return void answer();
          await answer('เปลี่ยนหมวดหมู่แล้ว');
          // The context updates on the next render: show the change straight away
          const card = isExpense
            ? { text: expenseCard({ ...findExpense(id)!, category: value as Expense['category'] }, { heading: '✏️ <b>แก้ไขแล้ว</b>', shopName: shop().name }), keyboard: entryKeyboard(findExpense(id)!, 'expense') }
            : { text: incomeCard({ ...findIncome(id)!, category: value as OtherIncome['category'] }, { heading: '✏️ <b>แก้ไขแล้ว</b>', shopName: shop().name }), keyboard: entryKeyboard(findIncome(id)!, 'income') };
          if (cardMessage) await editCard(cardMessage, card.text, card.keyboard);
          return;
        }
        if (action === 'ask') {
          const field = value as EditField;
          if (!(field in EDIT_FIELD_LABELS)) return void answer();
          writeWaiting(chatId, userId, { action: 'edit', recordId: id, field, cardMessageId: cardMessage });
          await answer();
          const hint = field === 'amount' ? 'เช่น 135 หรือ 1,250.50' : field === 'date' ? 'เช่น 5/10/69' : '';
          await send({ text: `✏️ พิมพ์${EDIT_FIELD_LABELS[field]}ใหม่ ${hint}`.trim(), reply_markup: { force_reply: true, input_field_placeholder: EDIT_FIELD_LABELS[field] } });
          return;
        }
        if (action === 'del') {
          await answer();
          await telegramCall(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: cardMessage, reply_markup: deleteKeyboard(id) }).catch(() => {});
          return;
        }
        if (action === 'delok') {
          const gone = `${isExpense ? '📉' : '📈'} ${(isExpense ? findExpense(id)?.title : findIncome(id)?.title) || ''} ${baht(exists.amount)}`;
          if (isExpense) pos2.deleteExpense(id);
          else pos2.deleteIncome(id);
          const item = itemsRef.current.find(p => p.recordId === id);
          if (item) patch(item.id, { status: 'rejected', decidedAt: new Date().toISOString(), decidedBy: `ลบจาก Telegram (${q.from?.first_name || ''})`.trim() });
          await answer('ลบแล้ว');
          if (cardMessage) await editCard(cardMessage, `🗑 <b>ลบรายการแล้ว</b>\n${gone.replace(/[&<>]/g, '')}`);
          return;
        }
        await answer();
        return;
      }

      // ---------- Photos ----------
      const photo = photoFromUpdate(update);
      if (photo) {
        const waiting = readWaiting(chatId, userId);
        if (waiting?.action === 'photo') {
          const e = findExpense(waiting.recordId);
          if (!e) {
            writeWaiting(chatId, userId, null);
          } else {
            const count = e.purchaseImages?.length || 0;
            try {
              const original = await downloadTelegramFile(token, photo.fileId, vercelBase(posRef.current.settings.merchantSettings?.serverUrl));
              const dataUrl = await compressBase64Image(original, 1000, 0.7);
              const next: Expense = { ...e, purchaseImages: [...(e.purchaseImages || []), { name: `telegram-${photo.messageId}.jpg`, dataUrl }] };
              posRef.current.updateExpense(e.id, { purchaseImages: next.purchaseImages });
              posRef.current = { ...posRef.current, expenses: posRef.current.expenses.map(x => (x.id === e.id ? next : x)) };
              const left = MAX_PURCHASE_PHOTOS - count - 1;
              if (left <= 0) writeWaiting(chatId, userId, null);
              else writeWaiting(chatId, userId, { ...waiting });
              await send({ text: `✅ เพิ่มรูปแล้ว (${count + 1}/${MAX_PURCHASE_PHOTOS})${left > 0 ? ' ส่งเพิ่มได้อีก หรือพิมพ์ “เสร็จ”' : ''}`, reply_to_message_id: photo.messageId });
              if (waiting.cardMessageId) await editCard(waiting.cardMessageId, expenseCard(next, { shopName: shop().name }), entryKeyboard(next, 'expense'));
              void toDrive(next, waiting.cardMessageId);
            } catch (err: any) {
              await send({ text: `⚠️ เพิ่มรูปไม่สำเร็จ: ${err?.message || ''}`, reply_to_message_id: photo.messageId });
            }
            return;
          }
        }

        if (itemsRef.current.some(p => p.id === pendingId(photo))) return;
        const mode = readBotMode();
        const item: PendingReceipt = {
          id: pendingId(photo),
          source: 'telegram',
          chatId,
          messageId: photo.messageId,
          fileId: photo.fileId,
          senderName: photo.senderName,
          caption: photo.caption,
          receivedAt: photo.date,
          kind: isIncomeCaption(photo.caption) ? 'income' : 'expense',
          status: 'reading'
        };
        addItem(item);
        const progress = await send({ text: '⏳ กำลังอ่านบิล...', reply_to_message_id: photo.messageId }).catch(() => null);
        const progressId = progress?.message_id as number | undefined;
        try {
          const { data, image } = await readTelegramReceiptWithImage(token, item, posRef.current.settings.merchantSettings?.serverUrl);
          if (mode === 'approve') {
            patch(item.id, { status: 'pending', data, error: undefined });
            const text = `📥 <b>รับบิลแล้ว รออนุมัติในระบบ POS</b>\n${data.vendorName || data.title}\nยอด ${baht(data.amount)} · วันที่ ${data.date}${data.warnings.length ? '\n⚠️ ตัวเลขบางส่วนไม่ตรงกัน โปรดตรวจก่อนอนุมัติ' : ''}`;
            if (progressId) await editCard(progressId, text);
            else await send({ text, reply_to_message_id: photo.messageId });
            return;
          }
          if (!(data.amount > 0)) throw new Error('ไม่พบยอดเงินในรูป');
          // A transfer slip names the bank transfer, not what was paid for: the payee says more
          const title = /^(โอนเงิน|โอน|สลิป|ชำระเงิน|จ่ายเงิน|transfer|payment)/i.test(data.title) && data.vendorName && !captionTitle(photo.caption) ? `จ่าย ${data.vendorName}` : data.title;
          const saved = record(
            { kind: item.kind, date: data.date, title, amount: data.amount, vendor: data.vendorName, category: data.category, includeVat: data.includeVat, vatAmount: data.vatAmount, refNumber: data.refNumber, note: data.note },
            photo.senderName,
            image,
            `telegram-${photo.messageId}.jpg`
          );
          patch(item.id, { status: 'approved', data, recordId: saved.rec.id, decidedBy: 'บันทึกอัตโนมัติ (Telegram)', decidedAt: new Date().toISOString(), error: undefined });
          const warning = data.warnings.length ? 'ตัวเลขบางส่วนไม่ตรงกัน โปรดตรวจยอด (กด ✏️ แก้ไขได้)' : undefined;
          const cardId = await showCard(saved.kind, saved.rec, photo.messageId, progressId, warning);
          if (saved.kind === 'expense') void toDrive(saved.rec, cardId);
        } catch (e: any) {
          patch(item.id, { status: 'failed', error: e?.message || 'อ่านบิลไม่สำเร็จ' });
          // The amount can be typed as the answer, and the photo is kept with the entry
          writeWaiting(chatId, userId, { action: 'amount', recordId: item.id });
          const text = `⚠️ อ่านบิลนี้ไม่สำเร็จ: ${e?.message || ''}\n✍️ พิมพ์ยอดเงินและชื่อรายการตอบกลับได้เลย เช่น <code>135 ค่าผัก</code>\n(หรือกรอกเองในระบบ POS หน้า “บิลจาก Telegram”)`;
          if (progressId) await editCard(progressId, text);
          else await send({ text, reply_to_message_id: photo.messageId }).catch(() => {});
        }
        return;
      }

      // ---------- Text ----------
      const msg = messageParts(update);
      if (!msg || !msg.text) return;
      const text = msg.text.trim();
      const waiting = readWaiting(chatId, userId);

      if (waiting?.action === 'photo' && /^(เสร็จ|เรียบร้อย|ok|done|จบ)$/i.test(text)) {
        writeWaiting(chatId, userId, null);
        await send({ text: '👍 เรียบร้อย', reply_markup: mainMenuKeyboard() });
        return;
      }

      const action = menuAction(text);
      if (action) {
        writeWaiting(chatId, userId, null);
        const { orders, expenses, incomes, currentBranch } = posRef.current;
        if (action === 'menu') await send({ text: `สวัสดีครับ 👋 บอทบัญชีของร้าน ${shop().name || ''}\nเลือกเมนูด้านล่าง หรือส่งรูปสลิป/บิลเข้ามาได้เลย`, reply_markup: mainMenuKeyboard() });
        else if (action === 'send') await send({ text: SEND_HELP });
        else if (action === 'type') await send({ text: entryTemplates(today()) });
        else if (action === 'help') await send({ text: helpText(readBotMode()), reply_markup: mainMenuKeyboard() });
        else if (action === 'today' || action === 'month')
          await send({ text: summaryText(action === 'today' ? today() : today().slice(0, 7), { orders, expenses, incomes, branchId: currentBranch?.id }) });
        else if (action === 'latest') await send({ text: latestText(expenses.filter(e => !currentBranch?.id || e.branchId === currentBranch.id), incomes.filter(i => !currentBranch?.id || i.branchId === currentBranch.id)) });
        else if (action === 'drive') {
          let folder = '';
          try {
            folder = localStorage.getItem(DRIVE_FOLDER_KEY) || '';
          } catch {
            // storage unavailable
          }
          const on = driveEnabled(posRef.current.settings);
          await send({
            text: folder
              ? `📁 <b>Google Drive ของร้าน</b>\nเอกสารรายจ่ายเก็บในโฟลเดอร์ “ครัวกะเพรา POS เอกสาร/รายจ่าย/ปี-เดือน”`
              : on
                ? '📁 ยังไม่มีเอกสารใน Google Drive ส่งบิลเข้ามาก่อน แล้วขอลิงก์อีกครั้ง'
                : '📁 ยังไม่ได้เปิดการเก็บเอกสารลง Google Drive\nเปิดได้ที่ ตั้งค่า → Google Sheets (Apps Script) → “บันทึกเอกสารลง Google Drive”',
            reply_markup: folder ? { inline_keyboard: [[{ text: '📂 เปิดโฟลเดอร์เดือนล่าสุด', url: folder }]] } : undefined
          });
        }
        return;
      }

      const openId = recordIdFromCommand(text);
      if (openId) {
        const card = cardOf(openId, '🧾 <b>รายการ</b>');
        await send(card ? { text: card.text, reply_markup: card.keyboard } : { text: 'ไม่พบรายการนี้แล้ว' });
        return;
      }

      // The answer to "type the new amount" (or to a photo the AI could not read)
      if (waiting?.action === 'edit' && waiting.field) {
        const change = editValue(waiting.field, text, today());
        if ('error' in change) {
          await send({ text: `⚠️ ${change.error}`, reply_markup: { force_reply: true } });
          return;
        }
        writeWaiting(chatId, userId, null);
        const e = findExpense(waiting.recordId);
        const i = findIncome(waiting.recordId);
        const { settings, updateExpense, updateIncome } = posRef.current;
        if (e) {
          const next: Expense = { ...e };
          if (change.amount !== undefined) {
            next.amount = change.amount;
            next.vatAmount = e.includeVat ? vatInside(change.amount, vatRateOf(settings)) : 0;
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
          updateExpense(e.id, { amount: next.amount, vatAmount: next.vatAmount, netAmount: next.netAmount, title: next.title, date: next.date, note: next.note, substituteReceipt: next.substituteReceipt });
          posRef.current = { ...posRef.current, expenses: posRef.current.expenses.map(x => (x.id === e.id ? next : x)) };
          if (waiting.cardMessageId) await editCard(waiting.cardMessageId, expenseCard(next, { heading: '✏️ <b>แก้ไขแล้ว</b>', shopName: shop().name }), entryKeyboard(next, 'expense'));
          await send({ text: `✅ แก้ไข${EDIT_FIELD_LABELS[waiting.field]}แล้ว (${expenseVendor(next) || next.title} ${baht(next.amount)})`, reply_markup: mainMenuKeyboard() });
          if (next.driveFiles?.length) void toDrive(next, waiting.cardMessageId);
        } else if (i) {
          const next: OtherIncome = {
            ...i,
            ...(change.amount !== undefined ? { amount: change.amount } : {}),
            ...(change.title ? { title: change.title } : {}),
            ...(change.date ? { date: change.date } : {}),
            ...(change.note !== undefined ? { note: change.note } : {}),
            ...(change.vendor !== undefined ? { payerName: change.vendor } : {})
          };
          updateIncome(i.id, next);
          if (waiting.cardMessageId) await editCard(waiting.cardMessageId, incomeCard(next, { heading: '✏️ <b>แก้ไขแล้ว</b>', shopName: shop().name }), entryKeyboard(next, 'income'));
          await send({ text: `✅ แก้ไข${EDIT_FIELD_LABELS[waiting.field]}แล้ว`, reply_markup: mainMenuKeyboard() });
        } else {
          await send({ text: 'ไม่พบรายการนี้แล้ว' });
        }
        return;
      }

      if (waiting?.action === 'amount' && !looksLikeEntry(text)) {
        const item = itemsRef.current.find(p => p.id === waiting.recordId);
        if (item && item.status !== 'approved') {
          const parsed = parseEntryText(`${item.kind === 'income' ? 'รับ' : 'จ่าย'} ${text}`, item.receivedAt.slice(0, 10));
          if ('error' in parsed) {
            await send({ text: `⚠️ ${parsed.error}`, reply_to_message_id: msg.messageId });
            return;
          }
          writeWaiting(chatId, userId, null);
          let image: string | undefined;
          try {
            image = await compressBase64Image(await downloadTelegramFile(token, item.fileId, vercelBase(posRef.current.settings.merchantSettings?.serverUrl)), 1000, 0.7);
          } catch {
            image = undefined;
          }
          if (parsed.title === 'รายจ่าย' || parsed.title === 'รายรับ') parsed.title = captionTitle(item.caption) || parsed.title;
          const saved = record(parsed, item.senderName || msg.senderName, image, `telegram-${item.messageId}.jpg`);
          patch(item.id, { status: 'approved', recordId: saved.rec.id, decidedBy: 'บันทึกอัตโนมัติ (Telegram)', decidedAt: new Date().toISOString(), error: undefined });
          const cardId = await showCard(saved.kind, saved.rec, msg.messageId);
          if (saved.kind === 'expense') void toDrive(saved.rec, cardId);
          return;
        }
        writeWaiting(chatId, userId, null);
      }

      // "จ่าย ค่าผัก 135 บาท" / "รับ 500 ค่าจัดเลี้ยง"
      if (looksLikeEntry(text)) {
        const parsed = parseEntryText(text, today());
        if ('error' in parsed) {
          // Words like "จ่ายแล้ว" in a conversation: only answer when it looked like an entry with a number
          if (/\d/.test(text) || /\.\.\./.test(text)) await send({ text: `⚠️ ${parsed.error}\n\n${entryTemplates(today())}`, reply_to_message_id: msg.messageId });
          return;
        }
        const id = `tg-${chatId}-${msg.messageId}`;
        if (itemsRef.current.some(p => p.id === id)) return;
        if (readBotMode() === 'approve') {
          addItem({
            id,
            source: 'telegram',
            chatId,
            messageId: msg.messageId,
            fileId: '',
            senderName: msg.senderName,
            caption: text,
            receivedAt: new Date().toISOString(),
            kind: parsed.kind,
            status: 'pending',
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
          await send({ text: `📥 รับรายการแล้ว รออนุมัติในระบบ POS\n${parsed.title} ${baht(parsed.amount)} · ${parsed.date}`, reply_to_message_id: msg.messageId });
          return;
        }
        const saved = record(parsed, msg.senderName);
        remember(saved.rec.id, saved.kind, { id, messageId: msg.messageId, senderName: msg.senderName, caption: text });
        const cardId = await showCard(saved.kind, saved.rec, msg.messageId);
        if (saved.kind === 'expense') void toDrive(saved.rec, cardId);
      }
    };

    // The long poll in progress: dropped when the app goes to the background (iOS freezes the page
    // and kills the connection, which would otherwise show as "Load failed")
    let request: AbortController | null = null;
    let wake: (() => void) | null = null;
    /** Waits, but ends at once when the app comes back to the screen */
    const sleep = (ms: number) =>
      new Promise<void>(resolve => {
        const t = setTimeout(done, ms);
        function done() {
          clearTimeout(t);
          wake = null;
          resolve();
        }
        wake = done;
      });
    let failures = 0;
    let hiddenSince = 0;

    /** One round: waits up to LONG_POLL_S for something to arrive (answers buttons at once) */
    const tick = async (): Promise<boolean> => {
      const { telegramToken, telegramChatId } = getStoredCredentials();
      if (!telegramToken || !telegramChatId) {
        writeInboxStatus({ lastCheck: new Date().toISOString(), error: 'ใส่ Telegram Bot Token และ Chat ID ก่อน', paused: false });
        return false;
      }
      const startedAt = Date.now();
      try {
        if (!commandsSet) {
          commandsSet = true;
          // The "/" menu in Telegram
          telegramCall(telegramToken, 'setMyCommands', { commands: BOT_COMMANDS }).catch(() => {});
        }
        const offset = Number(localStorage.getItem(INBOX_OFFSET_KEY)) || 0;
        request = new AbortController();
        const updates = await telegramCall<any[]>(
          telegramToken,
          'getUpdates',
          { offset, timeout: LONG_POLL_S, allowed_updates: ['message', 'channel_post', 'callback_query'] },
          request.signal
        );
        request = null;
        failures = 0;
        writeInboxStatus({ lastCheck: new Date().toISOString(), error: '', paused: false });
        for (const update of updates) {
          if (stopped) break;
          const chatId = String(update.callback_query?.message?.chat?.id ?? (update.message || update.channel_post)?.chat?.id ?? '');
          if (chatId && chatId !== telegramChatId.trim()) {
            // Only the shop's own chat is listened to; the other chat is shown so the owner can find its ID
            if (photoFromUpdate(update) || (update.message?.text || '').startsWith('/')) {
              writeInboxStatus({ ignoredChatId: chatId, ignoredChatName: messageParts(update)?.senderName });
            }
          } else if (chatId) {
            try {
              await run(telegramToken, chatId, update);
            } catch (e) {
              console.warn('[Telegram bot] update failed', e);
            }
          }
          // Confirm this update so Telegram does not send it again
          localStorage.setItem(INBOX_OFFSET_KEY, String(update.update_id + 1));
        }
        return true;
      } catch (e: any) {
        request = null;
        if (stopped) return false;
        // Cut off by going to the background (or by us when hidden): not a fault, try again when shown
        if (e?.name === 'AbortError' || document.hidden || hiddenSince >= startedAt) return true;
        failures++;
        // A dropped connection (phone network, waking up) usually works on the next try: only a
        // repeated failure is shown
        if (failures >= 3 || !isNetworkError(e)) {
          writeInboxStatus({ lastCheck: new Date().toISOString(), error: e?.message || 'เชื่อมต่อ Telegram ไม่สำเร็จ', paused: false });
        }
        return false;
      }
    };

    const loop = async () => {
      while (!stopped) {
        // A hidden tab is left alone (iOS freezes it anyway); it starts again as soon as it is shown
        if (document.hidden) {
          await sleep(30_000);
          continue;
        }
        const ok = await tick();
        if (!ok && !stopped) await sleep(failures > 0 && failures < 3 ? 2000 * failures : RETRY_MS);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        writeInboxStatus({ paused: true });
        request?.abort();
      } else {
        failures = 0;
        writeInboxStatus({ paused: false });
        wake?.();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    // iOS may skip visibilitychange when switching apps; these fire on return as well
    window.addEventListener('pageshow', onVisibility);
    window.addEventListener('focus', onVisibility);
    void loop();
    return () => {
      stopped = true;
      request?.abort();
      wake?.();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [enabled, setItems]);

  return null;
};
