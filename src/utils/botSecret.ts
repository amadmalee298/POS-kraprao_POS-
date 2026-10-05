/*
 * The shop account's refresh token rides in the bot's webhook address, encrypted with the
 * webhook's secret token. Telegram sends that secret only in a header of each delivery and never
 * shows it (getWebhookInfo returns the address, not the secret), so someone who sees the address
 * cannot use it. AES-GCM with a key from SHA-256(secret); works in browsers and Node 18+.
 * No imports: also used by the Telegram bot on Vercel (plain Node ESM).
 */

async function subtle(): Promise<SubtleCrypto> {
  const c = (globalThis as any).crypto;
  if (c?.subtle) return c.subtle;
  // Older Node without the global
  const nodeCrypto: any = await import('node:crypto');
  return nodeCrypto.webcrypto.subtle;
}

const randomBytes = async (n: number) => {
  const c = (globalThis as any).crypto;
  const out = new Uint8Array(n);
  if (c?.getRandomValues) return c.getRandomValues(out);
  const nodeCrypto: any = await import('node:crypto');
  return new Uint8Array(nodeCrypto.randomBytes(n));
};

const b64url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function keyFrom(secret: string): Promise<CryptoKey> {
  const s = await subtle();
  const hash = await s.digest('SHA-256', new TextEncoder().encode(secret));
  return s.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** A webhook secret: 48 characters Telegram accepts (A-Z a-z 0-9 _ -) */
export async function newWebhookSecret(): Promise<string> {
  return b64url(await randomBytes(36));
}

export async function sealWithSecret(text: string, secret: string): Promise<string> {
  const iv = await randomBytes(12);
  const ct = new Uint8Array(await (await subtle()).encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

/** null when the secret does not match (not from Telegram, or an old address) */
export async function openWithSecret(sealed: string, secret: string): Promise<string | null> {
  try {
    const bytes = unb64url(sealed);
    const plain = await (await subtle()).decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await keyFrom(secret), bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
