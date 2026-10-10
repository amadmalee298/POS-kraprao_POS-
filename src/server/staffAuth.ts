/**
 * Is this request from one of the shop's own devices? Server functions that spend the shop's
 * money (e.g. the AI receipt reader with the shop's ANTHROPIC_API_KEY) need the caller's Firebase
 * ID token. The token is checked by reading `access/staff` with it: the security rules allow that
 * only for the shop account (an e-mail in the staff list), so Firestore itself verifies the token,
 * that it belongs to this project and that the account is staff. Customers (anonymous sign-in)
 * and anyone else are refused.
 */

/** The shop's Firebase project (same as firebase-applet-config.json); FIREBASE_PROJECT_ID overrides it */
export const SHOP_FIREBASE_PROJECT = { projectId: 'krua-kaprao-pos', databaseId: '' };

const verified = new Map<string, number>(); // token -> valid until (ms)
const MAX_CACHE = 500;

/** When a Firebase ID token expires (its `exp` claim), or 0 if it cannot be read */
export function tokenExpiry(idToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return Number(payload.exp) * 1000 || 0;
  } catch {
    return 0;
  }
}

export const bearerToken = (header: unknown): string => {
  const m = /^Bearer\s+(.+)$/i.exec(String(Array.isArray(header) ? header[0] : header || '').trim());
  return m ? m[1].trim() : '';
};

export async function isShopStaff(
  idToken: string,
  opts: { projectId?: string; databaseId?: string; fetchImpl?: typeof fetch; now?: number } = {}
): Promise<boolean> {
  if (!idToken || idToken.split('.').length !== 3) return false;
  const now = opts.now ?? Date.now();
  const exp = tokenExpiry(idToken);
  if (!exp || exp <= now) return false;
  const cached = verified.get(idToken);
  if (cached && cached > now) return true;

  const projectId = opts.projectId || process.env.FIREBASE_PROJECT_ID || SHOP_FIREBASE_PROJECT.projectId;
  const databaseId = opts.databaseId ?? (process.env.FIREBASE_DATABASE_ID || SHOP_FIREBASE_PROJECT.databaseId);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId || '(default)')}/documents/access/staff?mask.fieldPaths=__name__`;
  const res = await (opts.fetchImpl || fetch)(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) return false;
  if (verified.size >= MAX_CACHE) verified.clear();
  // Re-checked at most every 10 minutes, so removing someone from the staff list takes effect soon
  verified.set(idToken, Math.min(exp, now + 10 * 60_000));
  return true;
}
