import { useEffect, useRef } from 'react';
import { isFirebaseAvailable, saveBranchDoc, subscribeToBranchDoc } from '../services/firebaseService';
import { mergeLists, stampChanges } from '../utils/mergeList';

type Meta = { stamps: Record<string, string>; deleted: Record<string, string> };

const SAVE_DELAY_MS = 1500;

/**
 * Keeps a list that lives in the POS state (staff, work shifts) the same on every device of the
 * branch: each change is stamped per record and merged with the cloud copy, so clock-ins made on
 * different devices at the same time are all kept (branches/{branch}/config/{key}).
 */
export function useCloudMergedList<T extends { id: string }>(opts: {
  key: string;
  branchId?: string;
  items: T[];
  setItems: (items: T[]) => void;
  enabled: boolean; // local data loaded
  offline: boolean;
  /** Records sent to the cloud (e.g. only recent shifts, to keep the document small) */
  cloudFilter?: (item: T) => boolean;
}) {
  const { key, branchId, items, setItems, enabled, offline, cloudFilter } = opts;
  const metaKey = `POS_CLOUD_MERGE_${key}`;
  const metaRef = useRef<Meta | null>(null);
  if (!metaRef.current) {
    try {
      metaRef.current = JSON.parse(localStorage.getItem(metaKey) || 'null') || { stamps: {}, deleted: {} };
    } catch {
      metaRef.current = { stamps: {}, deleted: {} };
    }
  }
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const prevRef = useRef<T[] | null>(null);
  const fromCloudRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef(cloudFilter);
  filterRef.current = cloudFilter;

  const saveMeta = () => {
    try {
      localStorage.setItem(metaKey, JSON.stringify(metaRef.current));
    } catch {
      // storage full: stamps are rebuilt on the next change
    }
  };

  const scheduleSave = () => {
    if (!branchId || offline) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!isFirebaseAvailable()) return;
      const f = filterRef.current;
      const list = f ? itemsRef.current.filter(f) : itemsRef.current;
      const ids = new Set(list.map(i => i.id));
      const stamps = Object.fromEntries(Object.entries(metaRef.current!.stamps).filter(([id]) => ids.has(id)));
      saveBranchDoc(branchId, key, { items: list, stamps, deleted: metaRef.current!.deleted, savedAt: new Date().toISOString() });
    }, SAVE_DELAY_MS);
  };

  // Changes made on this device
  useEffect(() => {
    if (!enabled) return;
    if (prevRef.current === null || fromCloudRef.current) {
      fromCloudRef.current = false;
      prevRef.current = items;
      return;
    }
    if (prevRef.current === items) return;
    metaRef.current = stampChanges(prevRef.current, items, metaRef.current!);
    prevRef.current = items;
    saveMeta();
    scheduleSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled]);

  // Changes from the other devices
  useEffect(() => {
    if (!enabled || !branchId || offline || !isFirebaseAvailable()) return;
    const unsub = subscribeToBranchDoc(branchId, key, data => {
      const cloud = {
        items: Array.isArray(data?.items) ? (data!.items as T[]) : [],
        stamps: (data?.stamps as Record<string, string>) || {},
        deleted: (data?.deleted as Record<string, string>) || {}
      };
      const merged = mergeLists({ items: itemsRef.current, ...metaRef.current! }, cloud);
      metaRef.current = { stamps: merged.stamps, deleted: merged.deleted };
      saveMeta();
      if (JSON.stringify(merged.items) !== JSON.stringify(itemsRef.current)) {
        fromCloudRef.current = true;
        setItems(merged.items);
      }
      // This device has something the cloud does not: send it
      const cloudIds = new Set(cloud.items.map(i => i.id));
      const f = filterRef.current;
      const ahead = merged.items.some(i => (!f || f(i)) && (!cloudIds.has(i.id) || (merged.stamps[i.id] || '') > (cloud.stamps[i.id] || '')));
      if (!data || ahead || Object.keys(merged.deleted).some(id => !cloud.deleted[id])) scheduleSave();
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, branchId, offline, key]);
}
