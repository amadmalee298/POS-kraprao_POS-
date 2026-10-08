/**
 * A shared list stored as one record per field (byId.<id>) of a cloud document, so two devices
 * (or a device and the Telegram bot server) changing different records never overwrite each
 * other. Older documents kept the whole list in an `items` array; those records still count until
 * the first per-record save moves them into `byId`.
 */
export interface KeyedDoc<T> {
  items?: T[];
  byId?: Record<string, T>;
}

type WithId = { id: string };

/** Every record of a keyed document (a record in `byId` wins over its old `items` copy) */
export function keyedItems<T extends WithId>(doc: unknown): T[] {
  const d = (doc || {}) as KeyedDoc<T>;
  const byId = d.byId && typeof d.byId === 'object' ? d.byId : {};
  const out = new Map<string, T>();
  if (Array.isArray(d.items)) for (const it of d.items) if (it && typeof it.id === 'string') out.set(it.id, it);
  for (const [id, it] of Object.entries(byId)) if (it && typeof it === 'object') out.set(id, { ...it, id });
  return [...out.values()];
}

/** The document still holds records in the old whole-list array */
export const hasLegacyItems = (doc: unknown): boolean =>
  Array.isArray((doc as KeyedDoc<unknown> | null)?.items) && ((doc as KeyedDoc<unknown>).items as unknown[]).length > 0;

/** The records added or changed, and the ids removed, between two versions of a list */
export function keyedChanges<T extends WithId>(prev: T[], next: T[]): { put: T[]; removed: string[] } {
  const before = new Map(prev.map(p => [p.id, JSON.stringify(p)]));
  const nextIds = new Set(next.map(n => n.id));
  return {
    put: next.filter(n => before.get(n.id) !== JSON.stringify(n)),
    removed: prev.filter(p => !nextIds.has(p.id)).map(p => p.id)
  };
}

/** Newest first by the given time, then by id so every device shows the same order */
export function newestFirst<T extends WithId>(items: T[], timeOf: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => {
    const ta = timeOf(a) || '';
    const tb = timeOf(b) || '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Pictures the cloud copy left out (too big for it) stay as they are on this device */
export function keepLocalPictures<T>(cloud: T, mine: T | undefined): T {
  if (!mine || typeof cloud !== 'object' || !cloud) return cloud;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(mine as Record<string, unknown>)) {
    if (typeof v === 'string' && v.startsWith('data:') && (cloud as Record<string, unknown>)[k] === '') {
      out = out || { ...(cloud as Record<string, unknown>) };
      out[k] = v;
    }
  }
  return (out as T) || cloud;
}

/**
 * The order of a list without times: this device's order, records new to it first
 * (lists are kept newest first)
 */
export function keepOrder<T extends { id: string }>(current: T[], merged: Map<string, T>): T[] {
  const seen = new Set(current.map(i => i.id));
  const added = [...merged.values()].filter(i => !seen.has(i.id));
  return [...added, ...current.filter(i => merged.has(i.id)).map(i => merged.get(i.id)!)];
}
