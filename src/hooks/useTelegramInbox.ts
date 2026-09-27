import type { PendingReceipt } from '../types';
import { useSharedList } from './useSharedList';

/** Receipt photos from Telegram, shared by every device of the branch (images stay in Telegram) */
export const useTelegramInbox = () => useSharedList<PendingReceipt>('telegram_inbox', 'POS_TELEGRAM_INBOX');
