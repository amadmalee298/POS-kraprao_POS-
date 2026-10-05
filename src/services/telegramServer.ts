import { firebaseWebConfig, loadBranchDoc, mergeBranchDoc, saveBranchDoc, shopAccountRefreshToken } from './firebaseService';
import { BOT_COMMANDS, BOT_CONFIG_DOC, BotMode } from './telegramBot';
import { setInboxEnabledHere, telegramCall } from './telegramInbox';
import { newWebhookSecret, sealWithSecret } from '../utils/botSecret';

/**
 * Moving the shop's Telegram bot onto the shop's Vercel site (api/telegram/webhook), so it
 * answers around the clock. Done from a device signed in with the shop account: the server then
 * works with the shop's data as that account (see utils/botSecret for how its key is kept).
 */

export interface ServerCheck {
  deployed: boolean;
  ai: boolean;
  error?: string;
}

/** Is the bot function on the Vercel site (and does it have the AI key)? */
export async function checkBotServer(base: string): Promise<ServerCheck> {
  if (!base) return { deployed: false, ai: false, error: 'ยังไม่ได้ใส่ลิงก์ Vercel' };
  try {
    const res = await fetch(`${base}/api/telegram/webhook`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.bot !== 2) return { deployed: false, ai: false, error: `เว็บ Vercel ยังเป็นเวอร์ชันเก่า (HTTP ${res.status}) — กด Redeploy ใน Vercel` };
    return { deployed: true, ai: !!data.ai };
  } catch (e: any) {
    return { deployed: false, ai: false, error: `เชื่อมต่อ Vercel ไม่ได้: ${e?.message || ''}` };
  }
}

export interface BotSetup {
  base: string;
  branchId: string;
  token: string;
  chatId: string;
  mode: BotMode;
  shop: { name: string; taxId?: string; address?: string; phone?: string };
  vatRate: number;
}

const appUrl = () => `${window.location.origin}${window.location.pathname}`;

export async function activateServerBot(s: BotSetup): Promise<void> {
  const refreshToken = shopAccountRefreshToken();
  if (!refreshToken) throw new Error('เครื่องนี้ยังไม่ได้เชื่อมบัญชีร้าน (กด “เชื่อมบัญชีร้าน” ด้านบนก่อน)');
  if (!s.token || !s.chatId) throw new Error('ใส่ Telegram Bot Token และ Chat ID ก่อน');
  const fb = firebaseWebConfig();

  // 1. The server can sign in as the shop account and reach the data
  const res = await fetch(`${s.base}/api/telegram/webhook?check=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branchId: s.branchId, projectId: fb.projectId, apiKey: fb.apiKey, databaseId: fb.databaseId, refreshToken })
  });
  const check = await res.json().catch(() => ({}));
  if (!check.ok) throw new Error(`เซิร์ฟเวอร์เข้าถึงข้อมูลร้านไม่ได้: ${check.error || `HTTP ${res.status}`}`);

  // 2. The bot's settings, read by the server on every message
  const saved = await saveBranchDoc(s.branchId, BOT_CONFIG_DOC, {
    webhook: true,
    token: s.token.trim().replace(/^bot/, ''),
    chatId: s.chatId.trim(),
    mode: s.mode,
    shop: s.shop,
    vatRate: s.vatRate,
    appUrl: appUrl(),
    activatedAt: new Date().toISOString()
  });
  if (!saved) throw new Error('บันทึกการตั้งค่าบอทขึ้น cloud ไม่สำเร็จ (ตรวจอินเทอร์เน็ต)');

  // 3. Telegram delivers to the server from now on (one at a time, so entries keep their order)
  const secret = await newWebhookSecret();
  const params = new URLSearchParams({ b: s.branchId, p: fb.projectId, k: fb.apiKey, o: window.location.origin, s: await sealWithSecret(refreshToken, secret) });
  if (fb.databaseId) params.set('d', fb.databaseId);
  await telegramCall(s.token, 'setWebhook', {
    url: `${s.base}/api/telegram/webhook?${params}`,
    secret_token: secret,
    allowed_updates: ['message', 'channel_post', 'callback_query'],
    max_connections: 1
  });
  await telegramCall(s.token, 'setMyCommands', { commands: BOT_COMMANDS }).catch(() => {});
  // No device polls any more (Telegram refuses polling while a webhook is set)
  setInboxEnabledHere(false);
}

/** Back to a device of the shop polling the bot */
export async function deactivateServerBot(branchId: string, token: string): Promise<void> {
  if (token) await telegramCall(token, 'deleteWebhook', {});
  await mergeBranchDoc(branchId, BOT_CONFIG_DOC, { webhook: false });
}

/** Settings the server reads, changed in the app (bot mode, shop details) */
export async function updateServerBotConfig(branchId: string, change: Record<string, unknown>): Promise<void> {
  const current = await loadBranchDoc(branchId, BOT_CONFIG_DOC);
  if (current?.webhook) await mergeBranchDoc(branchId, BOT_CONFIG_DOC, change);
}

export interface WebhookInfo {
  url: string;
  pending: number;
  lastError?: string;
  lastErrorAt?: string;
}

export async function serverWebhookInfo(token: string): Promise<WebhookInfo> {
  const info = await telegramCall<any>(token, 'getWebhookInfo', {});
  return {
    url: info.url || '',
    pending: info.pending_update_count || 0,
    lastError: info.last_error_message || undefined,
    lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : undefined
  };
}
