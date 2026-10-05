import { useEffect, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useTelegramInbox } from '../../hooks/useTelegramInbox';
import { driveEnabled, hasExpenseDocs, saveExpenseToDrive } from '../../services/expenseDrive';
import { mergeBranchDoc } from '../../services/firebaseService';
import { getStoredCredentials } from '../../services/notificationService';
import { BOT_STATE_DOC, DRIVE_FOLDER_KEY, entryKeyboard, expenseCard } from '../../services/telegramBot';
import { telegramCall } from '../../services/telegramInbox';
import { docLinkUrl } from '../../utils/docLink';
import { sellerInfo } from '../../utils/seller';

/**
 * Entries the Telegram bot recorded on the server go into Google Drive from the app: the server
 * cannot draw the PDF, so any open device of the shop (with Drive switched on) saves them, then
 * puts the Drive link on the bot's card in the chat. One at a time, a little after they arrive
 * (another device may already be on it). Mounted once in the app.
 */
export const ExpenseDriveAutoSync = () => {
  const { expenses, settings, currentBranch, updateExpense } = usePOS();
  const [inbox] = useTelegramInbox();
  const latest = useRef({ expenses, settings, currentBranch, inbox });
  latest.current = { expenses, settings, currentBranch, inbox };
  const tried = useRef(new Set<string>());
  const busy = useRef(false);

  const on = driveEnabled(settings);
  const pending = on
    ? expenses.find(e => !tried.current.has(e.id) && !e.driveFiles?.length && hasExpenseDocs(e) && inbox.some(p => p.recordId === e.id && p.status === 'approved'))
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
          if (!e || e.driveFiles?.length || !driveEnabled(s)) return;
          const shop = sellerInfo(s, branch);
          const files = await saveExpenseToDrive(e, shop, s);
          if (!files.length) return;
          updateExpense(e.id, { driveFiles: files });
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
              text: expenseCard(saved, { shopName: shop.name }),
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
      4000 + Math.random() * 8000
    );
    return () => {
      clearTimeout(timer);
      busy.current = false;
    };
  }, [pending?.id, updateExpense]);

  return null;
};
