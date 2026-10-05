import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { Expense } from '../types';

/*
 * A ใบรับรองแทนใบเสร็จรับเงิน carried inside a link (…/#doc=<data>), so the Telegram bot can
 * offer it as a page anyone in the chat can open and print, with no login and no server storage.
 * Only the text goes in the link (signatures and photos stay in the app).
 * No relative imports: also used by the Telegram bot on Vercel (plain Node ESM).
 */

export interface DocLinkData {
  shop: { name: string; taxId?: string; address?: string; phone?: string };
  expense: Pick<Expense, 'date' | 'title' | 'amount' | 'note'> & { substituteReceipt?: Pick<NonNullable<Expense['substituteReceipt']>, 'docNo' | 'spender' | 'payee' | 'approver' | 'approvedAt'> };
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function encodeDocLink(data: DocLinkData): string {
  const sr = data.expense.substituteReceipt;
  const compact = {
    v: 1,
    s: [data.shop.name, data.shop.taxId || '', data.shop.address || '', data.shop.phone || ''],
    e: [data.expense.date, data.expense.title, data.expense.amount, data.expense.note || ''],
    r: sr ? [sr.docNo, sr.spender, sr.payee || '', sr.approver || '', sr.approvedAt || ''] : null
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(compact)), { level: 9 }));
}

export function decodeDocLink(code: string): DocLinkData | null {
  try {
    const c = JSON.parse(strFromU8(inflateSync(fromBase64Url(code))));
    if (c?.v !== 1 || !Array.isArray(c.s) || !Array.isArray(c.e)) return null;
    const [name, taxId, address, phone] = c.s.map(String);
    const [date, title, amount, note] = c.e;
    const r = Array.isArray(c.r) ? c.r.map(String) : null;
    return {
      shop: { name, taxId, address, phone },
      expense: {
        date: String(date),
        title: String(title),
        amount: Number(amount) || 0,
        note: String(note || ''),
        substituteReceipt: r ? { docNo: r[0], spender: r[1], payee: r[2] || undefined, approver: r[3] || undefined, approvedAt: r[4] || undefined } : undefined
      }
    };
  } catch {
    return null;
  }
}

/** The page of the app that shows it: <app address>#doc=<data> */
export const docLinkUrl = (appUrl: string, data: DocLinkData) => `${appUrl.replace(/#.*$/, '')}#doc=${encodeDocLink(data)}`;
