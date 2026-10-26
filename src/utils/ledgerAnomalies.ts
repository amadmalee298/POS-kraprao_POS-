import { ACCOUNT_BY_CODE, GlLine, SOURCE_LABELS } from './ledger';

/** Accounts where one wrong record shows as an unusual loss or income */
export const CHECKED_ACCOUNTS = ['5300', '5310', '5900', '5000', '4900'];

export interface AnomalyEntry {
  sourceId: string;
  source: string;
  date: string;
  reference: string;
  memo?: string;
  /** What it does to the profit: losses negative, income positive */
  amount: number;
  /** Much bigger than the others of its account */
  unusual: boolean;
}

export interface AnomalyGroup {
  account: string;
  name: string;
  total: number;
  entries: AnomalyEntry[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The records behind each checked account in the period, biggest first. A record counts as unusual
 * when it is at least 5,000 baht and at least 5 times the account's typical record (or it alone is
 * most of a large total).
 */
export function ledgerAnomalies(lines: GlLine[], from: string, to: string, limit = 8): AnomalyGroup[] {
  const groups: AnomalyGroup[] = [];
  for (const code of CHECKED_ACCOUNTS) {
    const revenue = ACCOUNT_BY_CODE.get(code)?.type === 'REVENUE';
    const bySource = new Map<string, AnomalyEntry>();
    for (const l of lines) {
      if (l.account !== code || l.date < from || l.date > to) continue;
      const effect = revenue ? l.credit - l.debit : l.debit - l.credit;
      const e = bySource.get(l.sourceId) || {
        sourceId: l.sourceId,
        source: SOURCE_LABELS[l.source] || l.source,
        date: l.date,
        reference: l.reference,
        memo: l.memo,
        amount: 0,
        unusual: false
      };
      e.amount += revenue ? effect : -effect;
      bySource.set(l.sourceId, e);
    }
    const entries = [...bySource.values()].filter(e => Math.abs(e.amount) >= 0.01);
    if (!entries.length) continue;
    const sizes = entries.map(e => Math.abs(e.amount));
    const typical = median(sizes);
    const total = entries.reduce((s, e) => s + e.amount, 0);
    for (const e of entries) {
      const size = Math.abs(e.amount);
      e.unusual = size >= 5000 && (size >= typical * 5 || (entries.length > 1 && size >= Math.abs(total) * 0.5 && size >= 20000));
    }
    entries.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    groups.push({ account: code, name: ACCOUNT_BY_CODE.get(code)?.name || code, total: Math.round(total * 100) / 100, entries: entries.slice(0, limit) });
  }
  return groups;
}
