/**
 * Merging a list edited on several devices, record by record: each record carries the time it
 * was last changed (kept beside the list, not inside the records), so two devices clocking in
 * different people at the same time both keep their change. Deleted ids are remembered so a
 * device that still has the record does not bring it back.
 */

export interface MergeState<T> {
  items: T[];
  stamps: Record<string, string>; // id -> ISO time of the last change
  deleted: Record<string, string>; // id -> ISO time it was deleted
}

const DELETED_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export function mergeLists<T extends { id: string }>(a: MergeState<T>, b: MergeState<T>): MergeState<T> {
  const stamps: Record<string, string> = {};
  const deleted: Record<string, string> = {};
  const now = Date.now();
  for (const src of [a.deleted, b.deleted]) {
    for (const [id, at] of Object.entries(src || {})) {
      if (now - new Date(at).getTime() > DELETED_KEEP_MS) continue;
      if (!deleted[id] || at > deleted[id]) deleted[id] = at;
    }
  }
  const byId = new Map<string, T>();
  const pick = (list: T[], st: Record<string, string>) => {
    list.forEach(item => {
      if (!item || !item.id) return;
      const at = st?.[item.id] || '';
      const cur = byId.get(item.id);
      if (!cur || at > (stamps[item.id] || '')) {
        byId.set(item.id, item);
        stamps[item.id] = at;
      }
    });
  };
  pick(a.items, a.stamps);
  pick(b.items, b.stamps);
  // A record changed after it was deleted (restored) stays; otherwise the deletion wins
  const items = [...byId.values()].filter(item => !(deleted[item.id] && deleted[item.id] >= (stamps[item.id] || '')));
  items.forEach(item => {
    if (deleted[item.id]) delete deleted[item.id];
  });
  Object.keys(stamps).forEach(id => {
    if (!items.some(i => i.id === id)) delete stamps[id];
  });
  return { items, stamps, deleted };
}

/** Stamps for what changed between two versions of the list on this device */
export function stampChanges<T extends { id: string }>(
  prev: T[],
  next: T[],
  state: { stamps: Record<string, string>; deleted: Record<string, string> },
  now = new Date().toISOString()
) {
  const before = new Map(prev.map(i => [i.id, JSON.stringify(i)]));
  const stamps = { ...state.stamps };
  const deleted = { ...state.deleted };
  const nextIds = new Set<string>();
  next.forEach(i => {
    nextIds.add(i.id);
    if (before.get(i.id) !== JSON.stringify(i)) {
      stamps[i.id] = now;
      delete deleted[i.id];
    }
  });
  prev.forEach(i => {
    if (!nextIds.has(i.id)) {
      deleted[i.id] = now;
      delete stamps[i.id];
    }
  });
  return { stamps, deleted };
}
