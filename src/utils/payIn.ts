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
  /** The bill it was matched to */
  claimedBy?: string;
}

/**
 * The amount in a notification, e.g. "รับเงิน 1,250.00 บาท", "ได้รับเงิน ฿60", "Received THB 60.00".
 * Prefers a number next to บาท/฿/THB; null when there is none
 */
export function parsePayInAmount(text: string): number | null {
  const t = String(text || '').replace(/ /g, ' ');
  const num = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  const patterns = [
    new RegExp(`(?:฿|THB|thb)\\s*${num}`),
    new RegExp(`${num}\\s*(?:บาท|฿|THB|thb|Baht|baht)`),
    new RegExp(`(?:รับเงิน|เงินเข้า|ได้รับ|received|amount|จำนวน)[^\\d]{0,20}${num}`, 'i')
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const value = Number(m[1].replace(/,/g, ''));
      if (value > 0 && value < 10_000_000) return Math.round(value * 100) / 100;
    }
  }
  return null;
}

/**
 * The notice for a bill: the same amount, received after the bill started waiting (a minute of
 * leeway for the phones' clocks), not given to another bill; the earliest one
 */
export function matchPayIn(notices: PayIn[], amount: number, since: number, taken: Set<string> = new Set()): PayIn | null {
  const cents = Math.round(amount * 100);
  return (
    [...notices]
      .filter(n => !n.claimedBy && !taken.has(n.id) && Math.round(n.amount * 100) === cents && Date.parse(n.at) >= since - 60_000)
      .sort((a, b) => a.at.localeCompare(b.at))[0] || null
  );
}
