/**
 * Firestore over its REST API, signed in as the shop account: lets the Telegram bot on Vercel
 * read and write the shop's records under the same security rules as a staff device, with no
 * extra packages or service-account keys. The account is reached with its refresh token
 * (exchanged for a 1-hour ID token, kept between calls while the function stays warm).
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };

export function toFsValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.filter(x => x !== undefined).map(toFsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields(v as Record<string, unknown>) } };
  return { nullValue: null };
}

export function toFsFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const fields: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) fields[k] = toFsValue(v);
  return fields;
}

export function fromFsValue(v: any): Json {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('stringValue' in v) return String(v.stringValue);
  if ('timestampValue' in v) return String(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
  return null;
}

export function fromFsFields(fields: Record<string, any>): { [k: string]: Json } {
  const out: { [k: string]: Json } = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = fromFsValue(v);
  return out;
}

const tokenCache = new Map<string, { idToken: string; until: number }>();

/** An ID token for the account behind the refresh token (Firebase Auth's token endpoint) */
export async function idTokenFor(apiKey: string, refreshToken: string, referer?: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.until > Date.now()) return cached.idToken;
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    // A Firebase web key may be limited to the shop's site: say where the call is made for
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(referer ? { Referer: referer } : {}) },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString()
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    const code = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(
      /TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN/.test(code)
        ? `บัญชีร้านหมดอายุ/เปลี่ยนรหัสผ่าน (${code}) — เปิดตั้งค่าบอทในแอปแล้วกดเชื่อมต่อใหม่`
        : `เข้าสู่ระบบบัญชีร้านไม่สำเร็จ (${code})`
    );
  }
  tokenCache.set(refreshToken, { idToken: data.id_token, until: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 120_000 });
  return data.id_token;
}

export class Firestore {
  private base: string;
  constructor(
    projectId: string,
    private idToken: () => Promise<string>,
    databaseId = '(default)'
  ) {
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId || '(default)'}/documents`;
  }

  private async call(url: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this.idToken()}`, ...(init.headers || {}) } });
    if (res.status === 404) return null;
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(res.status === 403 ? `ไม่มีสิทธิ์เข้าถึงข้อมูลร้าน (${msg})` : `Firestore: ${msg}`);
    }
    return data;
  }

  async get(path: string): Promise<{ [k: string]: Json } | null> {
    const doc = await this.call(`${this.base}/${path}`);
    return doc ? fromFsFields(doc.fields || {}) : null;
  }

  /** Writes the whole document, or only the given fields when `fields` is listed */
  async set(path: string, data: Record<string, unknown>, fields?: string[]): Promise<void> {
    const mask = fields ? fields.map(f => `updateMask.fieldPaths=${encodeURIComponent(fieldPath(f))}`).join('&') : '';
    const body = fields ? toFsFields(Object.fromEntries(fields.map(f => [f, data[f] === undefined ? null : data[f]]))) : toFsFields(data);
    await this.call(`${this.base}/${path}${mask ? `?${mask}` : ''}`, { method: 'PATCH', body: JSON.stringify({ fields: body }) });
  }

  /**
   * Writes only the listed (possibly nested) fields, e.g. ['byId', id]; a field whose value is
   * undefined is removed. The other fields of the document stay as they are.
   */
  async setFields(path: string, entries: { path: string[]; value: unknown }[]): Promise<void> {
    const data: Record<string, unknown> = {};
    for (const e of entries) {
      if (e.value === undefined) continue;
      let at = data;
      e.path.slice(0, -1).forEach(seg => {
        if (!at[seg] || typeof at[seg] !== 'object') at[seg] = {};
        at = at[seg] as Record<string, unknown>;
      });
      at[e.path[e.path.length - 1]] = e.value;
    }
    const mask = entries.map(e => `updateMask.fieldPaths=${encodeURIComponent(e.path.map(fieldPath).join('.'))}`).join('&');
    await this.call(`${this.base}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: toFsFields(data) }) });
  }

  async delete(path: string): Promise<void> {
    await this.call(`${this.base}/${path}`, { method: 'DELETE' });
  }

  /** Documents of a top-level collection whose field is at least the value */
  async whereAtLeast(collection: string, field: string, value: string, limit = 1000, select?: string[]): Promise<{ [k: string]: Json }[]> {
    const rows = await this.call(`${this.base}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          // Only the fields needed (orders carry their items)
          ...(select ? { select: { fields: select.map(f => ({ fieldPath: fieldPath(f) })) } } : {}),
          where: { fieldFilter: { field: { fieldPath: field }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: value } } },
          limit
        }
      })
    });
    return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => fromFsFields(r.document.fields || {}));
  }
}

/** Field names with characters outside [A-Za-z0-9_] go in backticks */
const fieldPath = (f: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(f) ? f : `\`${f.replace(/`/g, '\\`')}\``);
