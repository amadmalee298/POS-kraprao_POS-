/**
 * Money received notices: the text of a bank app's "money in" notification (Bangkok Bank Merchant
 * Pro on an Android phone at the shop, forwarded by MacroDroid to /api/payment/notify), matched to
 * the bill waiting for a QR payment. No imports: also used by the server (plain Node ESM).
 */

export interface PayIn {
  id: string;
  amount: number;
  /** When the server received it (ISO) */
  at: string;
  /** The notification's text, shortened */
  text: string;
  /** The bill it was given to, or `hold:<till>` while a till's payment screen shows it */
  claimedBy?: string;
  /** When a till took the hold (ISO) */
  reservedAt?: string;
}

// Other amounts a notification can carry (the balance, a fee): a number right after these is not the payment
const NOT_PAYMENT = /(คงเหลือ|ยอดเงินในบัญชี|ค่าธรรมเนียม|\bbalance|\bavail|\bfees?\b|\bcharges?\b)/i;

/**
 * The amount in a notification, e.g. "รับเงิน 1,250.00 บาท", "ได้รับเงิน ฿60", "Received THB 60.00".
 * Prefers the number after a "money in" word, then one next to บาท/฿/THB, skipping a balance or fee;
 * null when there is none
 */
export function parsePayInAmount(text: string): number | null {
  const t = String(text || '').replace(/\u00a0/g, ' ');
  const num = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  const patterns = [
    new RegExp(`(?:รับเงิน|เงินเข้า|ได้รับ|received|amount|จำนวน)([^\\d]{0,20})${num}`, 'gi'),
    new RegExp(`(?:฿|THB|thb)()\\s*${num}`, 'g'),
    new RegExp(`()${num}\\s*(?:บาท|฿|THB|thb|Baht|baht)`, 'g')
  ];
  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const start = (m.index ?? 0) + m[0].search(/\d/);
      const before = t.slice(Math.max(0, start - 15), start);
      if (NOT_PAYMENT.test(m[1]) || NOT_PAYMENT.test(before)) continue;
      const value = Number(m[2].replace(/,/g, ''));
      if (value > 0 && value < 10_000_000) return Math.round(value * 100) / 100;
    }
  }
  return null;
}

/** A till holds a notice while its bill is on screen; the hold lapses if the till never finishes */
export const PAYIN_HOLD_MS = 10 * 60_000;
export const holdName = (token: string) => `hold:${token}`;

/** Is this notice given to another bill (or held by another till that is still on it)? */
export function payInTaken(n: PayIn & { reservedAt?: string }, now: number, mine?: string): boolean {
  if (!n.claimedBy) return false;
  if (!n.claimedBy.startsWith('hold:')) return true;
  if (mine && n.claimedBy === holdName(mine)) return false;
  const at = Date.parse(n.reservedAt || '');
  return Number.isFinite(at) && now - at < PAYIN_HOLD_MS;
}

/**
 * The notice for a bill: the same amount, received after the bill started waiting (15 seconds of
 * leeway for the phones' clocks), not given to another bill nor held by another till; the earliest one
 */
export function matchPayIn(
  notices: PayIn[],
  amount: number,
  since: number,
  taken: Set<string> = new Set(),
  opts: { now?: number; mine?: string } = {}
): PayIn | null {
  const cents = Math.round(amount * 100);
  const now = opts.now ?? Date.now();
  return (
    [...notices]
      .filter(n => !payInTaken(n, now, opts.mine) && !taken.has(n.id) && Math.round(n.amount * 100) === cents && Date.parse(n.at) >= since - 15_000)
      .sort((a, b) => a.at.localeCompare(b.at))[0] || null
  );
}
