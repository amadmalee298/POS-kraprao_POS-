import { useEffect, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { driveEnabled, drivePictureFields, hasExpenseDocs, releaseCloudPictures, saveExpenseToDrive, shareSavedPictures, unsharedPictures } from '../../services/expenseDrive';
import { hasImage } from '../../utils/imageRef';
import type { Expense } from '../../types';
import { claimDailyJob, mergeBranchDoc } from '../../services/firebaseService';
import { getStoredCredentials } from '../../services/notificationService';
import { BOT_STATE_DOC, DRIVE_FOLDER_KEY, entryKeyboard, expenseCard } from '../../services/telegramBot';
import { telegramCall } from '../../services/telegramInbox';
import { STOCK_NOTE } from '../../services/botEngine';
import { docLinkUrl } from '../../utils/docLink';
import { sellerInfo } from '../../utils/seller';

/**
 * Every expense with documents goes into Google Drive (ใบรับรองแทนใบเสร็จ PDF, transfer slip and
 * proof-of-purchase pictures), then its pictures leave the shop's cloud database: Drive keeps them.
 * Entries of the Telegram bot get the Drive link on their card in the chat. One at a time, a little
 * apart; a device claims each expense first so two devices do not save it twice. Mounted once.
 */
export const ExpenseDriveAutoSync = () => {
  const { expenses, settings, currentBranch, updateExpense } = usePOS();
  const [inbox] = useTelegramInbox();
  const latest = useRef({ expenses, settings, currentBranch, inbox });
  latest.current = { expenses, settings, currentBranch, inbox };
  const tried = useRef(new Set<string>());
  const busy = useRef(false);

  const on = driveEnabled(settings);
  // Saved to Drive before its pictures were shared by link, or shared but still kept in the cloud
  const needsPictureMove = (e: Expense) =>
    !!e.driveFiles?.length && (unsharedPictures(e).length > 0 || Object.keys(drivePictureFields(e, e.driveFiles)).length > 0) && (hasImage(e.receiptImage) || !!e.purchaseImages?.length);
  const pending = on
    ? expenses.find(
        e => !tried.current.has(e.id) && (!e.branchId || e.branchId === currentBranch?.id) && ((!e.driveFiles?.length && hasExpenseDocs(e)) || needsPictureMove(e))
      )
    : undefined;

  useEffect(() => {
    if (!pending || busy.current || !navigator.onLine) return;
    busy.current = true;
    const timer = setTimeout(
      async () => {
        const { expenses: now, settings: s, currentBranch: branch, inbox: items } = latest.current;
        const e = now.find(x => x.id === pending.id);
        tried.current.add(pending.id);
        try {
          if (!e || !driveEnabled(s)) return;
          if (e.driveFiles?.length) {
            // Already in Drive: share its pictures by link and show them from there
            const shared = await shareSavedPictures(e, s);
            const pictures = drivePictureFields(e, shared);
            if (Object.keys(pictures).length) {
              updateExpense(e.id, { driveFiles: shared, ...pictures });
              await releaseCloudPictures(e);
            }
            return;
          }
          // Another device has it today (a failed save is tried again the next day)
          const today = new Date().toLocaleDateString('sv-SE');
          if (branch?.id && !(await claimDailyJob(branch.id, `drive_${e.id}`, today))) return;
          const shop = sellerInfo(s, branch);
          const files = await saveExpenseToDrive(e, shop, s);
          if (!files.length) return;
          // The pictures are shown from Drive from now on (when the script shares them by link)
          updateExpense(e.id, { driveFiles: files, ...drivePictureFields(e, files) });
          await releaseCloudPictures(e);
          let folder = '';
          try {
            folder = localStorage.getItem(DRIVE_FOLDER_KEY) || '';
          } catch {
            // storage unavailable
          }
          if (folder && branch?.id) void mergeBranchDoc(branch.id, BOT_STATE_DOC, { driveFolderUrl: folder });
          // The Drive link on the bot's card
          const item = items.find(p => p.recordId === e.id);
          const token = getStoredCredentials().telegramToken;
          if (item?.cardMessageId && token) {
            const saved = { ...e, driveFiles: files };
            const docUrl = saved.substituteReceipt ? docLinkUrl(`${window.location.origin}${window.location.pathname}`, { shop, expense: saved }) : undefined;
            await telegramCall(token, 'editMessageText', {
              chat_id: item.chatId,
              message_id: item.cardMessageId,
              text: expenseCard(saved, { shopName: shop.name }) + (item.stockPending && !item.stockAdded?.length ? `\n${STOCK_NOTE}` : ''),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: entryKeyboard(saved, 'expense', docUrl)
            }).catch(() => {});
          }
        } catch (err) {
          console.warn('[Drive] saving a bot entry failed', err);
        } finally {
          busy.current = false;
        }
      },
      3000 + Math.random() * 5000
    );
    return () => {
      clearTimeout(timer);
      busy.current = false;
    };
  }, [pending?.id, updateExpense]);

  return null;
};
