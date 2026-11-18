/**
 * A "money in" notification from the shop's bank app (Merchant Pro on an Android phone at the shop,
 * forwarded by MacroDroid): kept in branches/<b>/config/payins (byId), where the till's payment
 * screen matches it to the bill waiting for a QR payment.
 */
import type { Firestore } from './firestoreRest.js';
import { parsePayInAmount } from '../utils/payIn.js';

export const PAYINS_DOC = 'payins';
/** Notices kept (older ones dropped when a new one comes) */
const KEEP = 60;

export async function recordPayIn(db: Firestore, branchId: string, text: string, now = new Date()): Promise<{ ok: boolean; amount?: number; error?: string }> {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const amount = parsePayInAmount(clean);
  if (amount === null) return { ok: false, error: 'ไม่พบจำนวนเงินในข้อความแจ้งเตือน' };
  const id = `p${now.getTime()}${Math.random().toString(36).slice(2, 6)}`;
  const path = `branches/${branchId}/config/${PAYINS_DOC}`;
  await db.setFields(path, [{ path: ['byId', id], value: { id, amount, at: now.toISOString(), text: clean } }]);
  // The oldest go once there are more than KEEP
  const doc: any = await db.get(path);
  const all = Object.values((doc?.byId || {}) as Record<string, { id: string; at: string }>).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const old = all.slice(KEEP);
  if (old.length) await db.setFields(path, old.map(o => ({ path: ['byId', o.id], value: undefined })));
  return { ok: true, amount };
}
