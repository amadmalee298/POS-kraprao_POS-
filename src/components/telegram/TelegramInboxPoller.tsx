import { useEffect, useRef, useState } from 'react';
import type { PendingReceipt } from '../../types';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { getStoredCredentials } from '../../services/notificationService';
import { scanReceiptImage, vercelBase } from '../../services/receiptScan';
import { driveEnabled, hasExpenseDocs, saveExpenseToDrive } from '../../services/expenseDrive';
import { isFirebaseAvailable, subscribeToBranchDoc } from '../../services/firebaseService';
import { BotContext, BotStore, handleBotUpdate } from '../../services/botEngine';
import {
  baht,
  captionTitle,
  downloadTelegramFile,
  INBOX_OFFSET_KEY,
  INBOX_STATUS_EVENT,
  inboxEnabledHere,
  keepAwakeHere,
  photoFromUpdate,
  telegramCall,
  toPendingData,
  writeInboxStatus
} from '../../services/telegramInbox';
import { BOT_COMMANDS, BOT_CONFIG_DOC, DRIVE_FOLDER_KEY, messageParts, readBotMode, readWaiting, sendTelegramDocument, writeWaiting } from '../../services/telegramBot';
import { vatRateOf } from '../../utils/accounting';
import { compressBase64Image } from '../../utils/imageCompressor';
import { htmlToPdfBlob } from '../../utils/htmlToPdf';
import { sellerInfo } from '../../utils/seller';
import { documentHtml } from '../../utils/staffDocs';
import { expenseDocName, expenseDocPages } from '../../utils/substituteReceipt';

/** Telegram holds the request open until something arrives, so replies feel instant */
const LONG_POLL_S = 25;
const RETRY_MS = 20_000;

/** "Load failed" (Safari), "Failed to fetch" (Chrome), "NetworkError…" (Firefox) */
const isNetworkError = (e: any) => e instanceof TypeError || /load failed|failed to fetch|network/i.test(e?.message || '');
const KEEP_ITEMS = 300;

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
  const [enabledHere, setEnabled] = useState(inboxEnabledHere);
  const [keepAwake, setKeepAwake] = useState(keepAwakeHere);
  // The bot runs on Vercel for this branch: no device polls (Telegram would refuse anyway)
  const [onServer, setOnServer] = useState(false);
  const branchId = pos.currentBranch?.id;
  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    return subscribeToBranchDoc(branchId, BOT_CONFIG_DOC, data => setOnServer(!!data?.webhook));
  }, [branchId]);
  const enabled = enabledHere && !onServer;

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

    const patchItem = (id: string, change: Partial<PendingReceipt>) => {
      itemsRef.current = itemsRef.current.map(p => (p.id === id ? { ...p, ...change } : p));
      setItems(prev => prev.map(p => (p.id === id ? { ...p, ...change } : p)));
    };
    const serverUrl = () => posRef.current.settings.merchantSettings?.serverUrl;

    // Records kept by the app (and from there synced to the cloud); read from the latest render,
    // with this tick's own changes applied straight away
    const store: BotStore = {
      getExpense: async id => posRef.current.expenses.find(e => e.id === id) || null,
      getIncome: async id => posRef.current.incomes.find(i => i.id === id) || null,
      saveExpense: async e => {
        const exists = posRef.current.expenses.some(x => x.id === e.id);
        if (exists) posRef.current.updateExpense(e.id, e);
        else posRef.current.addExpense(e);
        posRef.current = { ...posRef.current, expenses: [e, ...posRef.current.expenses.filter(x => x.id !== e.id)] };
      },
      saveIncome: async i => {
        const exists = posRef.current.incomes.some(x => x.id === i.id);
        if (exists) posRef.current.updateIncome(i.id, i);
        else posRef.current.addIncome(i);
        posRef.current = { ...posRef.current, incomes: [i, ...posRef.current.incomes.filter(x => x.id !== i.id)] };
      },
      updateExpense: async (id, change) => {
        posRef.current.updateExpense(id, change);
        posRef.current = { ...posRef.current, expenses: posRef.current.expenses.map(e => (e.id === id ? { ...e, ...change } : e)) };
      },
      updateIncome: async (id, change) => {
        posRef.current.updateIncome(id, change);
        posRef.current = { ...posRef.current, incomes: posRef.current.incomes.map(i => (i.id === id ? { ...i, ...change } : i)) };
      },
      deleteExpense: async id => {
        posRef.current.deleteExpense(id);
        posRef.current = { ...posRef.current, expenses: posRef.current.expenses.filter(e => e.id !== id) };
      },
      deleteIncome: async id => {
        posRef.current.deleteIncome(id);
        posRef.current = { ...posRef.current, incomes: posRef.current.incomes.filter(i => i.id !== id) };
      },
      expensesFrom: async date => posRef.current.expenses.filter(e => sameBranch(e.branchId) && e.date >= date),
      incomesFrom: async date => posRef.current.incomes.filter(i => sameBranch(i.branchId) && i.date >= date),
      ordersFrom: async iso => posRef.current.orders.filter(o => sameBranch(o.branchId) && o.createdAt >= iso),
      inboxItem: async id => itemsRef.current.find(p => p.id === id) || null,
      inboxByRecord: async recordId => itemsRef.current.find(p => p.recordId === recordId) || null,
      putInbox: async item => {
        itemsRef.current = [item, ...itemsRef.current.filter(p => p.id !== item.id)];
        setItems(prev => [item, ...prev.filter(p => p.id !== item.id)].slice(0, KEEP_ITEMS));
      },
      patchInbox: async (id, change) => patchItem(id, change),
      getWaiting: async (chatId, userId) => readWaiting(chatId, userId),
      setWaiting: async (chatId, userId, w) => writeWaiting(chatId, userId, w),
      driveFolderUrl: async () => {
        try {
          return localStorage.getItem(DRIVE_FOLDER_KEY) || '';
        } catch {
          return '';
        }
      }
    };
    const sameBranch = (b?: string) => !b || !posRef.current.currentBranch?.id || b === posRef.current.currentBranch.id;

    const contextFor = (token: string, chatId: string): BotContext => {
      const { settings, currentBranch } = posRef.current;
      const shop = sellerInfo(settings, currentBranch);
      return {
        token,
        chatId,
        branchId: currentBranch?.id || '',
        mode: readBotMode(),
        shop,
        vatRate: vatRateOf(settings),
        tg: (method, params) => telegramCall(token, method, params),
        readPhoto: async p => {
          const original = await downloadTelegramFile(token, p.fileId, vercelBase(serverUrl()));
          const scan = await compressBase64Image(original, 1600, 0.85);
          const keep = await compressBase64Image(original, 1000, 0.7).catch(() => scan);
          return { scan, store: keep };
        },
        scan: image => scanReceiptImage(image, 'image/jpeg', serverUrl()),
        sendDoc: async (e, replyTo) => {
          const pages = expenseDocPages(e, shop);
          if (!pages.length) throw new Error('รายการนี้ไม่มีเอกสาร');
          const pdf = await htmlToPdfBlob(documentHtml(e.title, pages));
          await sendTelegramDocument(token, chatId, pdf, expenseDocName(e, 'pdf'), {
            caption: e.substituteReceipt ? `📄 ใบรับรองแทนใบเสร็จ ${e.substituteReceipt.docNo} · ${baht(e.amount)}` : `📄 หลักฐานรายจ่าย ${e.title} · ${baht(e.amount)}`,
            ...(replyTo ? { reply_to_message_id: replyTo } : {})
          });
        },
        saveToDrive: async e => {
          const current = posRef.current.settings;
          if (!driveEnabled(current) || !hasExpenseDocs(e)) return undefined;
          return saveExpenseToDrive(e, shop, current);
        }
      };
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
              await handleBotUpdate(contextFor(telegramToken, chatId), store, update);
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
