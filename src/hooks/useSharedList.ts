import { useCallback, useEffect, useRef, useState } from 'react';
import { usePOS } from '../context/POSContext';
import { isFirebaseAvailable, saveBranchDoc, subscribeToBranchDoc } from '../services/firebaseService';

/** Keep a cloud copy small: Firestore documents are limited to 1 MB, so embedded images stay local. */
const CLOUD_LIMIT = 900_000;
function forCloud<T>(items: T[]): T[] {
  const json = JSON.stringify(items);
  if (json.length <= CLOUD_LIMIT) return items;
  return JSON.parse(json, (_k, v) => (typeof v === 'string' && v.startsWith('data:') && v.length > 2000 ? '' : v));
}

// Several screens can use the same list at once (e.g. the CRM page and the till): every hook
// instance on this device hears about a change made by another one right away.
const localListeners = new Map<string, Set<(items: unknown[]) => void>>();
const announce = (key: string, items: unknown[], except?: (items: unknown[]) => void) =>
  localListeners.get(key)?.forEach(fn => fn !== except && fn(items));

const readLocal = <T,>(key: string): T[] | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
};

/**
 * A list the shop edits by hand, shared by every device of the branch: kept in this device's
 * storage (works offline) and in one cloud document branches/{branch}/config/{cloudKey}.
 * The latest save wins, which suits lists edited by one person at a time.
 *
 * `clean` runs on data loaded from this device (e.g. to drop old built-in sample records).
 */
export function useSharedList<T>(
  cloudKey: string,
  localKey: string,
  clean: (items: T[]) => T[] = items => items
): [T[], (update: T[] | ((prev: T[]) => T[])) => void] {
  const { currentBranch } = usePOS();
  const branchId = currentBranch?.id;
  const [items, setItems] = useState<T[]>(() => clean(readLocal<T>(localKey) || []));
  // When this device last saved the list (kept across reloads so offline edits are not lost)
  const stampKey = `${localKey}__savedAt`;
  const lastWriteRef = useRef<string>('');
  if (!lastWriteRef.current) {
    try {
      lastWriteRef.current = localStorage.getItem(stampKey) || '';
    } catch {
      // private mode: no stamp
    }
  }
  const markSaved = (iso: string) => {
    lastWriteRef.current = iso;
    try {
      localStorage.setItem(stampKey, iso);
    } catch {
      // ignore
    }
  };
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const persistLocal = (next: T[]) => {
    try {
      localStorage.setItem(localKey, JSON.stringify(next));
    } catch {
      // storage full: the in-memory list and the cloud copy still hold it
    }
  };

  // Same list changed by another screen on this device
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
  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    return subscribeToBranchDoc(branchId, cloudKey, data => {
      const cloudItems = data && Array.isArray(data.items) ? (data.items as T[]) : null;
      const savedAt = typeof data?.savedAt === 'string' ? data.savedAt : '';
      if (!cloudItems) {
        // Nothing in the cloud yet: this device's list becomes the shared one
        if (itemsRef.current.length > 0) {
          const now = new Date().toISOString();
          markSaved(now);
          saveBranchDoc(branchId, cloudKey, { items: forCloud(itemsRef.current), savedAt: now });
        }
        return;
      }
      if (lastWriteRef.current && savedAt < lastWriteRef.current) {
        // This device saved later (e.g. while offline): its list is the newer one
        saveBranchDoc(branchId, cloudKey, { items: forCloud(itemsRef.current), savedAt: lastWriteRef.current });
        return;
      }
      const next = clean(cloudItems);
      itemsRef.current = next;
      setItems(next);
      persistLocal(next);
      announce(localKey, next, listenerRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, cloudKey]);

  const update = useCallback(
    (u: T[] | ((prev: T[]) => T[])) => {
      const next = typeof u === 'function' ? (u as (prev: T[]) => T[])(itemsRef.current) : u;
      itemsRef.current = next;
      setItems(next);
      persistLocal(next);
      announce(localKey, next, listenerRef.current);
      const now = new Date().toISOString();
      markSaved(now);
      if (branchId && isFirebaseAvailable()) {
        saveBranchDoc(branchId, cloudKey, { items: forCloud(next), savedAt: now });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchId, cloudKey, localKey]
  );

  return [items, update];
}

export { nextDocNumber } from '../utils/docNumber';
