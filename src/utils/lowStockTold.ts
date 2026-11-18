/**
 * Which low-stock alerts are due, per branch and day: an ingredient is announced when it first runs
 * low, and again only after it was restocked above its alert level and ran low again.
 */
export type LowStockTold = Record<string, { day: string; ids: string[] }>;

/** Ids to announce now, and ids told earlier today that are no longer low (restocked: may alert again) */
export function lowStockPlan(store: LowStockTold, branchId: string, day: string, lowIds: string[]): { due: string[]; restocked: string[] } {
  const entry = store[branchId];
  const told = new Set(entry && entry.day === day ? entry.ids : []);
  const low = new Set(lowIds);
  return { due: lowIds.filter(id => !told.has(id)), restocked: [...told].filter(id => !low.has(id)) };
}

/** The store with ids added and removed for the branch (other days dropped) */
export function updateTold(store: LowStockTold, branchId: string, day: string, add: string[], remove: string[] = []): LowStockTold {
  const entry = store[branchId];
  const ids = new Set(entry && entry.day === day ? entry.ids : []);
  add.forEach(id => ids.add(id));
  remove.forEach(id => ids.delete(id));
  const next: LowStockTold = {};
  for (const [b, e] of Object.entries(store)) if (b !== branchId && e?.day === day) next[b] = e;
  next[branchId] = { day, ids: [...ids] };
  return next;
}
