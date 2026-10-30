/**
 * Notifications at a set time (the daily summary, filing reminders) sent by the server, so they go
 * out on time even when no device of the shop has the app open. Before, a device open at that time
 * sent them; with every device closed they went out the next time someone opened the app.
 *
 * - The owner's device asks the server to seal what it needs to sign in as the shop (sealSchedule)
 *   and keeps that in public_menu/sched-<branch> (readable by any signed-in device, so the server
 *   finds it without credentials of its own; sealed with a key only the server has).
 * - A scheduled GitHub Actions run calls the server every 15 minutes (runScheduledJobs): for each
 *   shop, whatever is due and not yet sent today goes out. A device that sent it first (it claims
 *   the same job document) is not repeated.
 */
import { openWithSecret, sealWithSecret } from '../utils/botSecret.js';
import { summaryText } from '../services/telegramBot.js';
import { Firestore, idTokenFor } from './firestoreRest.js';
import { expenseFromDoc, incomeFromDoc, migrateSomePictures } from './telegramWebhook.js';

/** Where the sealed sign-in of each shop is kept */
export const SCHEDULE_COLLECTION = 'public_menu';
export const scheduleDocId = (branchId: string) => `sched-${branchId}`;
/** What the owner's device keeps up to date for the server (filings due, low stock count) */
export const SCHEDULE_CONFIG_DOC = 'schedule';
/** Filing reminders go out from this time (Bangkok) */
export const FILING_REMIND_TIME = '09:00';

export interface ShopSignIn {
  branchId: string;
  projectId: string;
  apiKey: string;
  databaseId?: string;
  referer?: string;
  refreshToken: string;
}

export interface ScheduledFiling {
  key: string;
  /** e.g. "ภ.พ.30 ภาษีมูลค่าเพิ่ม (กันยายน 2569)" */
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
}

const keyOf = (serverKey: string) => `sched:${serverKey}`;

export async function sealSchedule(signIn: ShopSignIn, serverKey: string): Promise<string> {
  return sealWithSecret(JSON.stringify(signIn), keyOf(serverKey));
}

export async function openSchedule(sealed: string, serverKey: string): Promise<ShopSignIn | null> {
  const text = await openWithSecret(sealed, keyOf(serverKey));
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    return s?.branchId && s.projectId && s.apiKey && s.refreshToken ? s : null;
  } catch {
    return null;
  }
}

/** Bangkok day (YYYY-MM-DD) and time (HH:MM) */
export function bangkokNow(now: Date): { day: string; time: string } {
  const iso = new Date(now.getTime() + 7 * 3600_000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The day whose summary is due: today once its time has come, or yesterday (catching up) when its
 * summary was missed. null when the last one sent covers it.
 */
export function summaryDue(now: { day: string; time: string }, at: string, lastSentDay: string): { day: string; catchUp: boolean } | null {
  const catchUp = now.time < (at || '22:00');
  const day = catchUp ? addDays(now.day, -1) : now.day;
  return (lastSentDay || '') >= day ? null : { day, catchUp };
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Filings due within 3 days or up to 30 days late, with how long is left */
export function filingsToRemind(filings: ScheduledFiling[], today: string): string[] {
  return filings
    .map(f => ({ f, days: daysBetween(today, f.dueDate) }))
    .filter(x => x.days <= 3 && x.days >= -30)
    .map(({ f, days }) => {
      const [y, m, d] = f.dueDate.split('-').map(Number);
      const label = days < 0 ? `เลยกำหนด ${-days} วัน` : days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${days} วัน`;
      return `• ${f.title} ยื่นภายใน ${d}/${m}/${y + 543} — ${label}`;
    });
}

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const htmlToText = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

type Fetch = typeof fetch;

/** Telegram (HTML, plain text when Telegram cannot read it) and LINE, as set up in the app */
async function deliver(creds: any, html: string, doFetch: Fetch): Promise<string[]> {
  const sent: string[] = [];
  const token = String(creds?.telegramToken || '').trim().replace(/^bot/, '');
  const chatId = String(creds?.telegramChatId || '').trim();
  if (token && chatId) {
    const send = async (text: string, parse: boolean) => {
      const res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, ...(parse ? { parse_mode: 'HTML' } : {}) })
      });
      return (await res.json().catch(() => ({}))) as any;
    };
    let r = await send(html, true);
    if (!r.ok && /parse entities/i.test(String(r.description || ''))) r = await send(htmlToText(html), false);
    if (r.ok) sent.push('telegram');
  }
  const lineToken = String(creds?.lineToken || '').trim();
  const lineTo = String(creds?.lineTargetId || '').trim();
  if (lineToken && lineTo) {
    const res = await doFetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
      body: JSON.stringify({ to: lineTo, messages: [{ type: 'text', text: htmlToText(html).slice(0, 4900) }] })
    });
    if (res.ok) sent.push('line');
  }
  return sent;
}

/** Claims today's run of a job (the same document the app's devices claim): false if done */
async function claim(db: Firestore, branchId: string, job: string, day: string): Promise<boolean> {
  const path = `branches/${branchId}/status/job_${job}`;
  const doc = await db.get(path);
  if (doc && String(doc.day || '') >= day) return false;
  await db.set(path, { day, claimedAt: new Date().toISOString(), by: 'server' });
  return true;
}

const lastDay = async (db: Firestore, branchId: string, job: string) => String((await db.get(`branches/${branchId}/status/job_${job}`))?.day || '');

/** One shop: what is due now goes out */
export async function runShop(signIn: ShopSignIn, now: Date, doFetch: Fetch = fetch): Promise<string[]> {
  const db = new Firestore(signIn.projectId, () => idTokenFor(signIn.apiKey, signIn.refreshToken, signIn.referer), signIn.databaseId);
  const b = signIn.branchId;
  const [notify, schedule] = await Promise.all([db.get(`branches/${b}/config/notifications`), db.get(`branches/${b}/config/${SCHEDULE_CONFIG_DOC}`)]);
  const creds: any = notify?.credentials || {};
  const triggers: any = notify?.triggers || {};
  const rules: any = notify?.rules || {};
  // The shop and branch name the app puts under its messages
  const shop = String((schedule as any)?.shopLine || '');
  const footer = shop ? `\n🏪 ${esc(shop)}` : '';
  const at = bangkokNow(now);
  const done: string[] = [];

  if (triggers.dailySummary) {
    const due = summaryDue(at, String(rules.dailySummaryTime || '22:00'), await lastDay(db, b, 'daily_summary'));
    if (due && (await claim(db, b, 'daily_summary', due.day))) {
      // Orders are stamped in UTC: from the shop's midnight (UTC+7)
      const fromUtc = new Date(Date.parse(`${due.day}T00:00:00Z`) - 7 * 3600_000).toISOString();
      const sameBranch = (v: unknown) => !v || v === b;
      const [orders, expenses, incomes] = await Promise.all([
        db.whereAtLeast('orders', 'createdAt', fromUtc, 10000, ['branchId', 'createdAt', 'status', 'grandTotal', 'paymentStatus']),
        db.whereAtLeast('expenses', 'date', due.day, 2000, ['id', 'branchId', 'date', 'category', 'title', 'amount']),
        db.whereAtLeast('incomes', 'date', due.day, 2000, ['id', 'branchId', 'date', 'category', 'title', 'amount'])
      ]);
      const low = Number((schedule as any)?.lowStock) || 0;
      const text =
        summaryText(due.day, {
          orders: orders.filter(o => sameBranch(o.branchId)) as any,
          expenses: expenses.filter(e => sameBranch(e.branchId)).map(expenseFromDoc),
          incomes: incomes.filter(i => sameBranch(i.branchId)).map(incomeFromDoc),
          branchId: b
        }) +
        `\n${low > 0 ? `⚠️ วัตถุดิบใกล้หมด ${low} รายการ` : '✅ วัตถุดิบยังพอทุกรายการ'}` +
        footer;
      await deliver(creds, text, doFetch);
      done.push(`summary ${due.day}`);
    }
  }

  const filings = Array.isArray((schedule as any)?.filings) ? ((schedule as any).filings as ScheduledFiling[]) : [];
  if ((schedule as any)?.remind !== false && filings.length && at.time >= FILING_REMIND_TIME && (await lastDay(db, b, 'filings')) < at.day) {
    const lines = filingsToRemind(filings, at.day);
    if (lines.length && (await claim(db, b, 'filings', at.day))) {
      await deliver(creds, `🔔 <b>เตือนยื่นเอกสารราชการ</b>\n━━━━━━━━━━━━━━\n📄 เอกสารที่ต้องยื่น\n${lines.map(esc).join('\n')}\n\nดูตัวเลขและไฟล์ได้ที่ เอกสาร → ยื่นเอกสารราชการ${footer}`, doFetch);
      done.push(`filings ${at.day}`);
    }
  }
  // Pictures still inside cloud records (every device downloads them and keeps them in memory;
  // phones that keep nothing were closed for lack of memory): moved out a little on every run, a
  // fresh pass each day
  try {
    const picPath = `branches/${b}/status/pictures`;
    const pic: any = (await db.get(picPath)) || {};
    const cursor = pic.day === at.day ? ((pic.cursor || {}) as Record<string, string>) : {};
    if (cursor.expenses !== 'done' || cursor.incomes !== 'done') {
      const next = await migrateSomePictures(db, b, cursor, Date.now() + 15_000);
      await db.set(picPath, { day: at.day, cursor: next });
      done.push(`pictures ${next.expenses || '-'}/${next.incomes || '-'}`);
    }
  } catch {
    // tried again on the next run
  }
  return done;
}

/** An anonymous sign-in (enough to read public_menu), reused between runs when given */
async function anonToken(apiKey: string, referer: string | undefined, refresh: string, doFetch: Fetch): Promise<{ idToken: string; refresh: string }> {
  if (refresh) {
    try {
      return { idToken: await idTokenFor(apiKey, refresh, referer), refresh };
    } catch {
      // expired or removed: a new one
    }
  }
  const res = await doFetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(referer ? { Referer: referer } : {}) },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.idToken) throw new Error(`anonymous sign-in failed (${data?.error?.message || res.status})`);
  return { idToken: data.idToken, refresh: data.refreshToken };
}

/** Every shop that turned this on: the jobs due now */
export async function runScheduledJobs(
  input: { projectId: string; apiKey: string; databaseId?: string; referer?: string; anon?: string },
  serverKey: string,
  now = new Date(),
  doFetch: Fetch = fetch
): Promise<{ anon: string; shops: { branchId: string; done?: string[]; error?: string }[] }> {
  const anon = await anonToken(input.apiKey, input.referer, input.anon || '', doFetch);
  const base = `https://firestore.googleapis.com/v1/projects/${input.projectId}/databases/${input.databaseId || '(default)'}/documents`;
  const res = await doFetch(`${base}/${SCHEDULE_COLLECTION}?pageSize=300&mask.fieldPaths=sched`, { headers: { Authorization: `Bearer ${anon.idToken}` } });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`list failed (${data?.error?.message || res.status})`);
  const shops: { branchId: string; done?: string[]; error?: string }[] = [];
  for (const d of data.documents || []) {
    const id = String(d.name || '').split('/').pop() || '';
    const sealed = d.fields?.sched?.stringValue;
    if (!id.startsWith('sched-') || !sealed) continue;
    const signIn = await openSchedule(sealed, serverKey);
    if (!signIn) {
      shops.push({ branchId: id.slice(6), error: 'cannot open (server key changed: the app seals it again)' });
      continue;
    }
    try {
      shops.push({ branchId: signIn.branchId, done: await runShop(signIn, now, doFetch) });
    } catch (e: any) {
      shops.push({ branchId: signIn.branchId, error: e?.message || String(e) });
    }
  }
  return { anon: anon.refresh, shops };
}
