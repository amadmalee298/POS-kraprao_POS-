import type { PendingReceipt } from '../types';
import { useKeyedList } from './useKeyedList';

const receivedAt = (p: PendingReceipt) => p.receivedAt;

/**
 * Receipt photos from Telegram, shared by every device of the branch (images stay in Telegram).
 * Saved one bill at a time, so the bot server and the devices never overwrite each other's bills.
 */
export const useTelegramInbox = () => useKeyedList<PendingReceipt>('telegram_inbox', 'POS_TELEGRAM_INBOX', receivedAt);
