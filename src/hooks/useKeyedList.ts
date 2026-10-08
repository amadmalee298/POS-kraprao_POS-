import { useCallback, useEffect, useRef, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { isFirebaseAvailable, saveKeyedRecords, subscribeToBranchDoc } from '../services/firebaseService';
import { hasLegacyItems, keepLocalPictures, keepOrder, keyedChanges, keyedItems, newestFirst } from '../utils/keyedDoc';

// Several screens can use the same list at once: every hook instance on this device hears about
// a change made by another one right away.
const localListeners = new Map<string, Set<(items: unknown[]) => void>>();
const announce = (key: string, items: unknown[], except?: (items: unknown[]) => void) =>
  localListeners.get(key)?.forEach(fn => fn !== except && fn(items));

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full: the in-memory list and the cloud copy still hold it
  }
};

/** A record too big for the shared cloud document (1 MB) leaves its embedded pictures on this device */
const RECORD_LIMIT = 100_000;
function forCloud<T>(item: T): T {
  const json = JSON.stringify(item);
  if (json.length <= RECORD_LIMIT) return item;
  return JSON.parse(json, (_k, v) => (typeof v === 'string' && v.startsWith('data:') && v.length > 2000 ? '' : v));
}

/**
 * Like useSharedList, but every record is saved on its own (branches/{branch}/config/{cloudKey},
 * field byId.<id>), so devices (and the Telegram bot server) adding or changing different records
 * at the same time keep all of them. Records changed on this device while offline are remembered
 * and sent once it is back online. With `timeOf` the list is kept newest first by it; without, in
 * this device's order. `clean` runs on every list loaded (e.g. to drop old built-in samples).
 */
export function useKeyedList<T extends { id: string }>(
  cloudKey: string,
  localKey: string,
  timeOf?: (item: T) => string | undefined,
  clean: (items: T[]) => T[] = items => items
): [T[], (update: T[] | ((prev: T[]) => T[])) => void] {
  const { currentBranch } = usePOS();
  const branchId = currentBranch?.id;
  const [items, setItems] = useState<T[]>(() => {
    const local = readJson<unknown>(localKey, []);
    return clean(Array.isArray(local) ? (local as T[]).filter(i => i && typeof i.id === 'string') : []);
  });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const timeRef = useRef(timeOf);
  timeRef.current = timeOf;
  const cleanRef = useRef(clean);
  cleanRef.current = clean;

  // Ids changed here that the cloud has not confirmed yet
  const pendingKey = `${localKey}__pending`;
  const readPending = () => new Set(readJson<string[]>(pendingKey, []));
  const writePending = (ids: Set<string>) => writeJson(pendingKey, [...ids]);

  const apply = (next: T[], except?: (items: unknown[]) => void) => {
    itemsRef.current = next;
    setItems(next);
    writeJson(localKey, next);
    announce(localKey, next, except);
  };

  const listenerRef = useRef<((items: unknown[]) => void) | undefined>(undefined);
  const onLocalChange = useRef<(items: unknown[]) => void>(() => undefined);
  onLocalChange.current = (next: unknown[]) => {
    itemsRef.current = next as T[];
    setItems(next as T[]);
  };
  useEffect(() => {
    const fn = (next: unknown[]) => onLocalChange.current(next);
    const set = localListeners.get(localKey) || new Set();
    set.add(fn);
    localListeners.set(localKey, set);
    listenerRef.current = fn;
    return () => {
      set.delete(fn);
    };
  }, [localKey]);

  /** Send the records changed here; ids stay pending until the cloud accepts them */
  const flush = async (ids: Set<string>, extraPut: T[] = [], dropLegacy = false) => {
    if (!branchId || !isFirebaseAvailable()) return;
    const byId = new Map(itemsRef.current.map(i => [i.id, i]));
    const raw = [...extraPut.filter(i => !ids.has(i.id)), ...[...ids].map(id => byId.get(id)).filter((i): i is T => !!i)];
    const put = raw.map(forCloud);
    const removed = [...ids].filter(id => !byId.has(id));
    const ok = await saveKeyedRecords(branchId, cloudKey, put, removed, dropLegacy);
    if (!ok) return;
    const still = readPending();
    // A record changed again while this save was on its way stays pending
    const sent = new Map(raw.map(p => [p.id, JSON.stringify(p)]));
    const now = new Map(itemsRef.current.map(i => [i.id, JSON.stringify(i)]));
    for (const id of ids) if (now.get(id) === sent.get(id)) still.delete(id);
    writePending(still);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    const unsub = subscribeToBranchDoc(branchId, cloudKey, data => {
      const pending = readPending();
      const local = new Map(itemsRef.current.map(i => [i.id, i]));
      if (!data) {
        // Nothing in the cloud yet: this device's list becomes the shared one
        if (itemsRef.current.length > 0) flushRef.current(new Set(itemsRef.current.map(i => i.id)));
        return;
      }
      const merged = new Map(keyedItems<T>(data).map(i => [i.id, keepLocalPictures(i, local.get(i.id))]));
      for (const id of pending) {
        const mine = local.get(id);
        if (mine) merged.set(id, mine);
        else merged.delete(id);
      }
      const time = timeRef.current;
      const next = cleanRef.current(time ? newestFirst([...merged.values()], time) : keepOrder(itemsRef.current, merged));
      apply(next, listenerRef.current);
      if (hasLegacyItems(data)) {
        // Move the old whole-list copy into per-record fields
        const inById = new Set(Object.keys((data as { byId?: object }).byId || {}));
        flushRef.current(pending, next.filter(i => !inById.has(i.id)), true);
      } else if (pending.size > 0) {
        flushRef.current(pending);
      }
    });
    const onOnline = () => {
      const pending = readPending();
      if (pending.size > 0) flushRef.current(pending);
    };
    window.addEventListener('online', onOnline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, cloudKey]);

  const update = useCallback(
    (u: T[] | ((prev: T[]) => T[])) => {
      const prev = itemsRef.current;
      const next = typeof u === 'function' ? (u as (prev: T[]) => T[])(prev) : u;
      const { put, removed } = keyedChanges(prev, next);
      apply(next, listenerRef.current);
      if (put.length === 0 && removed.length === 0) return;
      const pending = readPending();
      for (const p of put) pending.add(p.id);
      for (const id of removed) pending.add(id);
      writePending(pending);
      flushRef.current(new Set([...put.map(p => p.id), ...removed]));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchId, cloudKey, localKey]
  );

  return [items, update];
}
