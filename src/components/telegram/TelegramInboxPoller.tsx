import { useEffect, useRef, useState } from 'react';
import type { PendingReceipt } from '../../types';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { getStoredCredentials } from '../../services/notificationService';
import { scanReceiptImage } from '../../services/receiptScan';
import {
  baht,
  downloadTelegramFile,
  INBOX_OFFSET_KEY,
  INBOX_STATUS_EVENT,
  inboxEnabledHere,
  isIncomeCaption,
  pendingId,
  photoFromUpdate,
  telegramCall,
  toPendingData,
  writeInboxStatus
} from '../../services/telegramInbox';
import { compressBase64Image } from '../../utils/imageCompressor';

const POLL_MS = 20_000;
const KEEP_ITEMS = 300;

/** Reads one Telegram photo with AI; used by the poller and by "read again" on the approval screen. */
export async function readTelegramReceipt(token: string, item: Pick<PendingReceipt, 'fileId' | 'receivedAt'>, serverUrl?: string) {
  const original = await downloadTelegramFile(token, item.fileId);
  const image = await compressBase64Image(original, 1600, 0.85);
  const result = await scanReceiptImage(image, 'image/jpeg', serverUrl);
  return toPendingData(result, item.receivedAt.slice(0, 10));
}

/**
 * Checks the shop's Telegram bot for receipt photos while this device has the inbox switched on
 * (one device per shop is enough). Mounted once in the app.
 */
export const TelegramInboxPoller = () => {
  const { settings } = usePOS();
  const [items, setItems] = useTelegramInbox();
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const serverUrlRef = useRef(settings.merchantSettings?.serverUrl);
  serverUrlRef.current = settings.merchantSettings?.serverUrl;
  const [enabled, setEnabled] = useState(inboxEnabledHere);

  useEffect(() => {
    const onChange = () => setEnabled(inboxEnabledHere());
    window.addEventListener(INBOX_STATUS_EVENT, onChange);
    return () => window.removeEventListener(INBOX_STATUS_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    let stopped = false;

    const patch = (id: string, change: Partial<PendingReceipt>) =>
      setItems(prev => prev.map(p => (p.id === id ? { ...p, ...change } : p)));

    const tick = async () => {
      if (busy || stopped || document.hidden) return;
      const { telegramToken, telegramChatId } = getStoredCredentials();
      if (!telegramToken || !telegramChatId) {
        writeInboxStatus({ lastCheck: new Date().toISOString(), error: 'ใส่ Telegram Bot Token และ Chat ID ก่อน' });
        return;
      }
      busy = true;
      try {
        const offset = Number(localStorage.getItem(INBOX_OFFSET_KEY)) || 0;
        const updates = await telegramCall<any[]>(telegramToken, 'getUpdates', {
          offset,
          timeout: 0,
          allowed_updates: ['message', 'channel_post']
        });
        for (const update of updates) {
          if (stopped) break;
          const photo = photoFromUpdate(update);
          if (photo) {
            if (photo.chatId !== telegramChatId.trim()) {
              writeInboxStatus({ ignoredChatId: photo.chatId, ignoredChatName: photo.senderName });
            } else if (!itemsRef.current.some(p => p.id === pendingId(photo))) {
              const item: PendingReceipt = {
                id: pendingId(photo),
                source: 'telegram',
                chatId: photo.chatId,
                messageId: photo.messageId,
                fileId: photo.fileId,
                senderName: photo.senderName,
                caption: photo.caption,
                receivedAt: photo.date,
                kind: isIncomeCaption(photo.caption) ? 'income' : 'expense',
                status: 'reading'
              };
              itemsRef.current = [item, ...itemsRef.current];
              setItems(prev => [item, ...prev.filter(p => p.id !== item.id)].slice(0, KEEP_ITEMS));
              try {
                const data = await readTelegramReceipt(telegramToken, item, serverUrlRef.current);
                patch(item.id, { status: 'pending', data, error: undefined });
                await telegramCall(telegramToken, 'sendMessage', {
                  chat_id: photo.chatId,
                  reply_to_message_id: photo.messageId,
                  text: `📥 รับบิลแล้ว รออนุมัติในระบบ POS\n${data.vendorName || data.title}\nยอด ${baht(data.amount)} · วันที่ ${data.date}${data.warnings.length ? '\n⚠️ ตัวเลขบางส่วนไม่ตรงกัน โปรดตรวจก่อนอนุมัติ' : ''}`
                }).catch(() => {});
              } catch (e: any) {
                patch(item.id, { status: 'failed', error: e?.message || 'อ่านบิลไม่สำเร็จ' });
                await telegramCall(telegramToken, 'sendMessage', {
                  chat_id: photo.chatId,
                  reply_to_message_id: photo.messageId,
                  text: `⚠️ อ่านบิลนี้ไม่สำเร็จ: ${e?.message || ''}\nบิลอยู่ในรายการรออนุมัติ กรอกยอดเองได้ในระบบ POS`
                }).catch(() => {});
              }
            }
          }
          // Confirm this update so Telegram does not send it again
          localStorage.setItem(INBOX_OFFSET_KEY, String(update.update_id + 1));
        }
        writeInboxStatus({ lastCheck: new Date().toISOString(), error: '' });
      } catch (e: any) {
        writeInboxStatus({ lastCheck: new Date().toISOString(), error: e?.message || 'เชื่อมต่อ Telegram ไม่สำเร็จ' });
      } finally {
        busy = false;
      }
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, setItems]);

  return null;
};
