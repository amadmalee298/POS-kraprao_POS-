/**
 * How a cloud document's records and this device's list come together (see hooks/useCloudMirror).
 * Kept apart from the hook so it can be tested on its own.
 */
type WithId = { id: string };

export function mergeMirror<T extends WithId>(a: {
  /** This device's list */
  prev: T[];
  /** The records in the cloud document */
  cloud: T[];
  /** Which document */
  key: string;
  /** The first copy of this document this device sees */
  first: boolean;
  /** The cloud's copy of each record before this one arrived */
  before: Map<string, string>;
  /** Removed here, not yet removed in the cloud */
  removed: Set<string>;
  docOf: (item: T) => string;
  toCloud: (item: T) => T;
  prefer?: (mine: T, cloud: T) => T;
}): T[] {
  const { prev, cloud, key, first, before, removed, docOf, toCloud, prefer } = a;
  const json = (x: T) => JSON.stringify(toCloud(x));
  const cloudById = new Map(cloud.map(c => [c.id, c]));
  const out: T[] = [];
  const used = new Set<string>();
  for (const mine of prev) {
    const c = cloudById.get(mine.id);
    if (c) {
      used.add(mine.id);
      if (first) out.push(prefer ? prefer(mine, c) : c);
      // Changed here and not sent yet, while the cloud's copy did not change: this device's
      else if (before.get(mine.id) === JSON.stringify(c) && json(mine) !== JSON.stringify(c)) out.push(mine);
      else out.push(c);
      continue;
    }
    if (docOf(mine) !== key) {
      out.push(mine); // another document's
    } else if (first || !before.has(mine.id)) {
      out.push(mine); // only on this device so far, or added here and not sent yet: uploaded
    }
    // else: the cloud had it and no longer does (removed on another device)
  }
  // New from the cloud (not the ones removed here)
  const added = cloud.filter(c => !used.has(c.id) && !removed.has(c.id));
  return [...added, ...out];
}
