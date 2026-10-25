import { useEffect, useRef } from 'react';
import { isFirebaseAvailable, mergeBranchDoc, saveKeyedRecords, subscribeToBranchDoc } from '../services/firebaseService';
import { mergeMirror } from '../utils/cloudMirror';
import { keyedItems } from '../utils/keyedDoc';

type WithId = { id: string };

export interface CloudMirrorOptions<T extends WithId> {
  branchId?: string;
  /** Online, signed in and the local data loaded */
  enabled: boolean;
  items: T[];
  setItems: (update: (prev: T[]) => T[]) => void;
  /** The cloud document a record lives in (branches/<branch>/config/<key>) */
  docOf: (item: T) => string;
  /** The documents followed live (e.g. the last 13 months of a list split by month) */
  docs: string[];
  /** The record as stored in the cloud (e.g. a plain PIN hashed) */
  toCloud?: (item: T) => T;
  /** First time this device meets a record the cloud also has: which one is kept (default the cloud's) */
  prefer?: (mine: T, cloud: T) => T;
  /** The order of the merged list (default: new records first, then this device's order) */
  order?: (items: T[]) => T[];
  /** The list's order is shared too (lists kept in one document, e.g. menu categories) */
  ordered?: boolean;
  /**
   * This device keeps nothing of its own (it starts from the built-in examples each visit): the
   * cloud's copy replaces the list, and nothing of the device's is uploaded on a first meeting
   */
  trustCloud?: boolean;
  /** With trustCloud: the list to start with when the cloud has none yet (a new shop) */
  seedIfMissing?: () => T[];
  /** Every followed document has arrived once */
  onReady?: () => void;
}

const ARCHIVED_KEY = 'POS_CLOUD_ARCHIVED';

/** Each mirror: true while something is not in the cloud yet (or its cloud copy has not arrived) */
const unsettled = new Map<object, boolean>();
/** Every list of this device is in the cloud */
export const mirrorsSettled = () => [...unsettled.values()].every(v => !v);
const readArchived = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(ARCHIVED_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

/**
 * Keeps a list of the app's state the same in the cloud and on every device, one field per record
 * (byId.<id>) so devices changing different records keep all of them. Records changed here are
 * sent (again until the cloud has them); records changed elsewhere arrive live. The first time a
 * device meets a document, the records only it has are uploaded, so nothing kept on one device is
 * lost. Records in documents not followed live (older months) are uploaded once.
 */
export function useCloudMirror<T extends WithId>(o: CloudMirrorOptions<T>): void {
  const opts = useRef(o);
  opts.current = o;
  const cloudForm = (item: T) => (opts.current.toCloud ? opts.current.toCloud(item) : item);

  /** The cloud's copy of each record (as last seen or sent) */
  const cloudJson = useRef(new Map<string, string>());
  /** The document each record was seen in */
  const docOfId = useRef(new Map<string, string>());
  /** Documents whose first copy has arrived */
  const seen = useRef(new Set<string>());
  /** Ids removed here that the cloud still has */
  const removedHere = useRef(new Set<string>());
  const lastIds = useRef<Set<string>>(new Set());
  /** The shared order (ordered lists) */
  const cloudOrder = useRef<string[]>([]);
  const sending = useRef(false);
  const token = useRef({});
  useEffect(() => {
    const t = token.current;
    unsettled.set(t, true);
    return () => {
      unsettled.delete(t);
    };
  }, []);
  const docsKey = o.docs.join('|');

  const send = async () => {
    const { branchId, enabled, items, docOf, docs } = opts.current;
    if (!branchId || !enabled || !isFirebaseAvailable() || sending.current) return;
    const live = new Set(docs);
    const archived = readArchived();
    const groups = new Map<string, { put: T[]; removed: string[] }>();
    const group = (key: string) => {
      if (!groups.has(key)) groups.set(key, { put: [], removed: [] });
      return groups.get(key)!;
    };
    for (const item of items) {
      const key = docOf(item);
      const form = cloudForm(item);
      if (live.has(key)) {
        if (seen.current.has(key) && cloudJson.current.get(item.id) !== JSON.stringify(form)) group(key).put.push(form);
      } else if (!archived.has(`${branchId}/${key}`)) {
        group(key).put.push(form);
      }
    }
    for (const id of removedHere.current) {
      const key = docOfId.current.get(id);
      if (key && seen.current.has(key)) group(key).removed.push(id);
    }
    const orderIds = opts.current.ordered ? items.map(i => i.id) : null;
    const orderChanged = !!orderIds && docs.length === 1 && seen.current.has(docs[0]) && orderIds.join('\n') !== cloudOrder.current.join('\n');
    if (!groups.size && !orderChanged) {
      unsettled.set(token.current, !docs.every(d => seen.current.has(d)));
      return;
    }
    unsettled.set(token.current, true);
    sending.current = true;
    let anyOk = false;
    try {
      for (const [key, g] of groups) {
        const ok = await saveKeyedRecords(branchId, key, g.put, g.removed);
        if (!ok) continue;
        anyOk = true;
        g.put.forEach(p => {
          cloudJson.current.set(p.id, JSON.stringify(p));
          docOfId.current.set(p.id, key);
        });
        g.removed.forEach(id => {
          cloudJson.current.delete(id);
          removedHere.current.delete(id);
        });
        if (!live.has(key)) {
          archived.add(`${branchId}/${key}`);
          try {
            localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...archived]));
          } catch {
            // uploaded again next time (the same records)
          }
        }
      }
      if (orderChanged && orderIds && (await mergeBranchDoc(branchId, docs[0], { order: orderIds }))) {
        cloudOrder.current = orderIds;
        anyOk = true;
      }
    } finally {
      sending.current = false;
    }
    // Checked again: settled once nothing is left to send (a refused save waits for the next try)
    if (anyOk) setTimeout(() => void sendRef.current(), 1000);
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  // Records removed here (the cloud still has them), then everything changed is sent
  useEffect(() => {
    const ids = new Set(o.items.map(i => i.id));
    for (const id of lastIds.current) if (!ids.has(id) && cloudJson.current.has(id)) removedHere.current.add(id);
    for (const id of ids) removedHere.current.delete(id);
    lastIds.current = ids;
    if (!o.enabled) return;
    const t = setTimeout(() => void sendRef.current(), 1500);
    return () => clearTimeout(t);
  }, [o.items, o.enabled]);

  // Not sent (offline, refused): tried again
  useEffect(() => {
    if (!o.enabled) return;
    const t = setInterval(() => void sendRef.current(), 30_000);
    const online = () => void sendRef.current();
    window.addEventListener('online', online);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', online);
    };
  }, [o.enabled]);

  useEffect(() => {
    const { branchId, enabled } = opts.current;
    if (!branchId || !enabled || !isFirebaseAvailable()) return;
    seen.current = new Set();
    const unsubs = opts.current.docs.map(key =>
      subscribeToBranchDoc(branchId, key, (data, fromCache) => {
        // "Not there" from this device's memory (offline) is not the cloud saying so: a new shop's
        // starting list, or an empty list, must not follow from it
        if (!data && fromCache) return;
        const { docOf, prefer, order } = opts.current;
        const first = !seen.current.has(key);
        const cloud = keyedItems<T>(data);
        const before = new Map(cloudJson.current);
        const removed = new Set(removedHere.current);
        // The cloud's copy from now on
        const cloudIds = new Set(cloud.map(c => c.id));
        for (const [id, k] of docOfId.current) if (k === key && !cloudIds.has(id)) cloudJson.current.delete(id);
        cloud.forEach(c => {
          cloudJson.current.set(c.id, JSON.stringify(c));
          docOfId.current.set(c.id, key);
        });
        const shared = opts.current.ordered && Array.isArray((data as any)?.order) ? ((data as any).order as string[]) : null;
        // Another device's order wins; on a first meeting only for a device with nothing of its own
        // (otherwise this device's order is sent)
        const changedOrder = !!shared && shared.join('\n') !== cloudOrder.current.join('\n');
        if (shared) cloudOrder.current = shared;
        const { trustCloud, seedIfMissing } = opts.current;
        opts.current.setItems(prev => {
          if (first && trustCloud) {
            const others = prev.filter(i => docOf(i) !== key);
            // None in the cloud yet: what this device starts with becomes the shared list
            if (!data) return seedIfMissing && prev.length === others.length ? [...seedIfMissing(), ...others] : prev;
            const at = new Map((shared || []).map((id, i) => [id, i]));
            const fromCloud = shared ? [...cloud].sort((x, y) => (at.get(x.id) ?? 1e9) - (at.get(y.id) ?? 1e9)) : cloud;
            return order ? order([...fromCloud, ...others]) : [...fromCloud, ...others];
          }
          const merged = mergeMirror({ prev, cloud, key, first, before, removed, docOf, toCloud: cloudForm, prefer });
          let next = order ? order(merged) : merged;
          if (shared && changedOrder && (!first || prev.length === 0)) {
            const at = new Map(shared.map((id, i) => [id, i]));
            next = [...next].sort((x, y) => (at.get(x.id) ?? -1) - (at.get(y.id) ?? -1));
          }
          return next.length === prev.length && next.every((x, i) => x === prev[i]) ? prev : next;
        });
        seen.current.add(key);
        if (first && opts.current.docs.every(d => seen.current.has(d))) opts.current.onReady?.();
        setTimeout(() => void sendRef.current(), 500);
      })
    );
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.branchId, o.enabled, docsKey]);
}
