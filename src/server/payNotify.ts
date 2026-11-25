/**
 * A "money in" notification from the shop's bank app (Merchant Pro on an Android phone at the shop,
 * forwarded by MacroDroid): kept in branches/<b>/config/payins (byId), where the till's payment
 * screen matches it to the bill waiting for a QR payment.
 */
import type { Firestore } from './firestoreRest.js';
import { looksLikeMoneyIn, parsePayInAmount, payInSource } from '../utils/payIn.js';

export const PAYINS_DOC = 'payins';
/** Notices kept (older ones dropped when a new one comes) */
const KEEP = 60;

export type PayInResult = { ok: boolean; status: number; amount?: number; verified?: boolean; duplicate?: boolean; error?: string };

/**
 * Kept only when it says money came in and names an amount. A notice from another app is refused;
 * one that does not say its app (an old MacroDroid body) or a browser test is kept but not
 * verified, so the till never takes it as payment. The same notice twice within 10 minutes (the
 * phone firing twice, or a replay) is kept once.
 */
export async function recordPayIn(
  db: Firestore,
  branchId: string,
  text: string,
  now = new Date(),
  meta: { app?: string; test?: boolean } = {}
): Promise<PayInResult> {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const source = payInSource(meta.app);
  if (source === 'other') return { ok: false, status: 403, error: `ไม่ใช่แจ้งเตือนจากแอปธนาคาร (${String(meta.app).slice(0, 40)})` };
  if (!looksLikeMoneyIn(clean)) return { ok: false, status: 400, error: 'ไม่ใช่ข้อความเงินเข้า' };
  const amount = parsePayInAmount(clean);
  if (amount === null) return { ok: false, status: 400, error: 'ไม่พบจำนวนเงินในข้อความแจ้งเตือน' };
  const path = `branches/${branchId}/config/${PAYINS_DOC}`;
  const doc: any = await db.get(path);
  const all = Object.values((doc?.byId || {}) as Record<string, { id: string; at: string; text?: string }>);
  if (all.some(n => n.text === clean && Math.abs(Date.parse(n.at) - now.getTime()) < 10 * 60_000)) return { ok: true, status: 200, amount, duplicate: true };
  const verified = source === 'bank' && !meta.test;
  const id = `p${now.getTime()}${Math.random().toString(36).slice(2, 6)}`;
  const notice = { id, amount, at: now.toISOString(), text: clean, verified, ...(meta.app ? { app: String(meta.app).slice(0, 60) } : {}), ...(meta.test ? { test: true } : {}) };
  // The oldest go once there are more than KEEP
  const old = all.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(KEEP - 1);
  await db.setFields(path, [{ path: ['byId', id], value: notice }, ...old.map(o => ({ path: ['byId', o.id], value: undefined }))]);
  return { ok: true, status: 200, amount, verified };
}
