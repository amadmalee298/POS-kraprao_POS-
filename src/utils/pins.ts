import type { SystemSettings, User } from '../types';

// ---------- Hashed PINs ----------

/**
 * PINs are kept as `h1$<salt>$<sha256(salt:pin)>` so the staff list on a device or in the cloud
 * does not reveal them. Older records hold the plain PIN; they still match and are hashed by the
 * app as soon as it loads them. (Synchronous on purpose: PINs are checked as they are typed, and
 * crypto.subtle is missing outside https.)
 */
const PREFIX = 'h1$';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/** SHA-256 of a text (UTF-8), as hex */
export function sha256HexSync(text: string): string {
  const msg = new TextEncoder().encode(text);
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((len * 8) / 0x100000000));
  view.setUint32(total - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
}

const randomSalt = () => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

export const isHashedPin = (stored: string | undefined): boolean => !!stored && stored.startsWith(PREFIX);

export const hashPinWithSalt = (pin: string, salt: string) => `${PREFIX}${salt}$${sha256HexSync(`${salt}:${pin}`)}`;

/** A stored form of a PIN (already hashed values are kept) */
export const hashPin = (pin: string): string => (isHashedPin(pin) ? pin : hashPinWithSalt(pin, randomSalt()));

export const DEFAULT_PIN = '1234';
/** The factory PIN for staff without one (a fixed salt keeps it stable between updates) */
export const DEFAULT_PIN_HASH = hashPinWithSalt(DEFAULT_PIN, 'default');

/** The typed PIN is the stored one (hashed or, in older records, plain) */
export function pinMatches(stored: string | undefined, entered: string): boolean {
  const p = (entered || '').trim();
  if (!stored || !p) return false;
  if (!isHashedPin(stored)) return stored === p;
  const [, salt] = stored.slice(PREFIX.length - 1).split('$');
  return hashPinWithSalt(p, salt) === stored;
}

/** Factory/demo PINs and repeated digits (0000, 1111, …) are the first things anyone tries */
export const isWeakPin = (pin: string | undefined): boolean => !pin || pin === DEFAULT_PIN || /^(\d)\1{3}$/.test(pin);

// ---------- Wrong PIN lockout (kept across reloads) ----------

const LOCK_KEY = 'POS_PIN_LOCK';
export const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_BASE_MS = 30_000;
const LOCKOUT_MAX_MS = 15 * 60_000;

const readLock = (): { fails: number; until: number } => {
  try {
    const v = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}');
    return { fails: Number(v.fails) || 0, until: Number(v.until) || 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
};

/** Milliseconds until PINs may be tried again on this device (0: not locked) */
export const pinLockRemaining = (now = Date.now()): number => Math.max(0, readLock().until - now);

/**
 * Note a PIN attempt. Every fifth wrong PIN in a row locks PIN entry on this device, for longer
 * each round (30 s, 1 min, 2 min … up to 15 min); a right PIN clears the count.
 * Returns the lock time started by this attempt (0 when none).
 */
export function notePinAttempt(ok: boolean, now = Date.now()): number {
  const lock = readLock();
  const next = ok ? { fails: 0, until: 0 } : { fails: lock.fails + 1, until: lock.until };
  let locked = 0;
  if (!ok && next.fails % MAX_PIN_ATTEMPTS === 0) {
    const round = next.fails / MAX_PIN_ATTEMPTS;
    locked = Math.min(LOCKOUT_MAX_MS, LOCKOUT_BASE_MS * 2 ** (round - 1));
    next.until = now + locked;
  }
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(next));
  } catch {
    // private mode: no lock across reloads
  }
  return locked;
}

/** The lock message, or '' when PINs may be tried */
export function pinLockMessage(now = Date.now()): string {
  const ms = pinLockRemaining(now);
  return ms > 0 ? `ใส่ PIN ผิดหลายครั้ง กรุณารอ ${Math.ceil(ms / 1000)} วินาที` : '';
}

// ---------- Manager approval ----------

/**
 * Who a manager PIN belongs to: an owner/manager account with that PIN, or the shop-wide admin /
 * manager PIN when the owner has set one in Settings. There are no built-in fallback PINs
 * (older versions accepted 1234 / 5555 when nothing was set).
 */
export function findManagerByPin(pin: string, users: User[], settings: Partial<SystemSettings>): { name: string; role: string } | null {
  const p = (pin || '').trim();
  if (!p) return null;
  const user = users.find(u => (u.role === 'admin' || u.role === 'manager') && pinMatches(u.pin, p));
  if (user) return { name: user.name, role: user.role };
  if (pinMatches(settings.adminPin, p)) return { name: 'เจ้าของร้าน', role: 'admin' };
  if (pinMatches(settings.managerPin, p)) return { name: 'ผู้จัดการ', role: 'manager' };
  return null;
}
