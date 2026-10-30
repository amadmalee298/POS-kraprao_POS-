/**
 * Where bill pictures live (see utils/imageRef): this browser's database for fast, offline reading,
 * and the cloud (branches/<branch>/config/img_<id>) so other devices and the Telegram bot can show
 * them. Records carry only "img:…" references, so lists of expenses stay small in memory.
 */
import { useEffect, useState } from 'react';
import {
  contentTag,
  imageDocKey,
  imageMime,
  isDataUrl,
  driveImageUrl,
  driveRefId,
  isDriveRef,
  isImageRef,
  makeImageRef,
  mapRecordImages,
  mapRecordImagesAsync,
  OFFLOAD_MIN_LENGTH,
  parseImageRef
} from '../utils/imageRef';

import { deleteLocalDb, isLocalRetired } from '../utils/localRetire';

// Loaded when first needed (keeps the cloud connection out of code that only formats documents)
const cloud = () => import('./firebaseService');

const DB_NAME = 'kaprao-pos-images';
const STORE = 'img';
const QUEUE_KEY = 'POS_IMAGE_UPLOADS';
const RECENT_MAX = 12;

// Pictures being written to the database (kept until the write is done)
const pending = new Map<string, string>();
// The last pictures shown, so scrolling back does not read them again
const recent = new Map<string, string>();
// Pictures already saved on this device in this visit (the cloud sends the same records again and again)
const known = new Set<string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
/** Nothing kept on this device: pictures come from the cloud, the last few stay in memory */
let memoryOnly = isLocalRetired();
if (memoryOnly) void deleteLocalDb(DB_NAME);
let memQueue: QueueItem[] = [];
// Pictures this visit has put in the cloud (no copy kept here when nothing is kept on the device)
const uploaded = new Set<string>();

/** Stop keeping pictures on this device (they are in the cloud): its copy is removed */
export async function retireImageStore(): Promise<void> {
  memoryOnly = true;
  memQueue = readQueue();
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
  const db = dbPromise ? await dbPromise : null;
  dbPromise = Promise.resolve(null);
  try {
    db?.close();
  } catch {
    // closed already
  }
  await deleteLocalDb(DB_NAME);
}

/** Pictures not sent to the cloud yet */
export const pendingImageUploads = () => readQueue().length;

function openDb(): Promise<IDBDatabase | null> {
  if (memoryOnly) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function localGet(id: string): Promise<string | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      q.onsuccess = () => resolve(typeof q.result === 'string' ? q.result : undefined);
      q.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function localPut(id: string, data: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

const remember = (id: string, data: string) => {
  recent.delete(id);
  recent.set(id, data);
  while (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value as string);
};

// ---------- Upload queue (survives reloads: the picture itself is in the database) ----------

type QueueItem = { b: string; id: string; tries: number };
const readQueue = (): QueueItem[] => {
  if (memoryOnly) return memQueue;
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
};
const writeQueue = (q: QueueItem[]) => {
  if (memoryOnly) {
    memQueue = q.slice(-500);
    return;
  }
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500)));
  } catch {
    // storage full: the pictures stay on this device and are offered again next time
  }
};
let uploading = false;

/** Send the pictures not in the cloud yet (one at a time; called again when back online) */
export async function flushImageUploads(): Promise<void> {
  if (uploading || typeof navigator !== 'undefined' && !navigator.onLine) return;
  uploading = true;
  try {
    for (;;) {
      const queue = readQueue();
      const item = queue[0];
      if (!item) break;
      const data = pending.get(item.id) || (await localGet(item.id));
      let done = !data; // nothing to send
      if (data) {
        // A picture too big for one cloud document stays on this device only
        done = data.length > 950_000 || (await (await cloud()).saveBranchDoc(item.b, imageDocKey(item.id), { data }));
      }
      const now = readQueue();
      if (done || item.tries >= 5) {
        writeQueue(now.filter(q => q.id !== item.id));
        // Kept only in memory: once in the cloud it is read from there (the last few stay at hand)
        if (memoryOnly && done && data) {
          pending.delete(item.id);
          uploaded.add(item.id);
          remember(item.id, data);
        }
      } else {
        writeQueue([...now.filter(q => q.id !== item.id), { ...item, tries: item.tries + 1 }]);
        break; // offline or refused: try again later
      }
    }
  } finally {
    uploading = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushImageUploads());
  setInterval(() => void flushImageUploads(), 60_000);
}

// ---------- Storing and reading ----------

/**
 * Keep a picture outside the record: saved on this device and sent to the cloud in the background.
 * Returns the reference to put in the record.
 */
export function storeImage(branchId: string, id: string, dataUrl: string, upload = true): string {
  if (!known.has(id)) {
    known.add(id);
    pending.set(id, dataUrl);
    void localPut(id, dataUrl).then(ok => {
      // Not saved (no database here): the picture stays in memory so it can still be shown
      if (ok) pending.delete(id);
    });
  }
  // Nothing kept on this device: a picture that came inside a cloud record goes to the cloud on its
  // own right away and then leaves memory (kept, it stayed in memory for the whole visit; every
  // opening added more until the phone closed the app)
  if (upload || (memoryOnly && !uploaded.has(id))) {
    writeQueue([...readQueue().filter(q => q.id !== id), { b: branchId || 'main', id, tries: 0 }]);
    setTimeout(() => void flushImageUploads(), 500);
  }
  return makeImageRef(branchId, id, imageMime(dataUrl));
}

/** The picture itself (data: URL) for a picture or a reference; undefined when it cannot be found */
export async function resolveImage(src: string | undefined | null): Promise<string | undefined> {
  if (!src) return undefined;
  // In Drive: this device's copy when it has one, else the picture's Drive address
  if (isDriveRef(src)) return (await localGet(driveCopyKey(src))) || driveImageUrl(src);
  if (!isImageRef(src)) return src;
  const ref = parseImageRef(src);
  if (!ref) return undefined;
  const hit = pending.get(ref.id) || recent.get(ref.id);
  if (hit) return hit;
  let data = await localGet(ref.id);
  if (!data) {
    const doc = await (await cloud()).loadBranchDoc(ref.branchId, imageDocKey(ref.id));
    data = typeof doc?.data === 'string' ? doc.data : undefined;
    if (data) void localPut(ref.id, data);
  }
  if (data) remember(ref.id, data);
  return data;
}

type Pictured = Parameters<typeof mapRecordImages>[0];

/**
 * The record with its pictures moved out (references instead of data: URLs). `upload: false` for
 * records that came from the cloud whose pictures are already there.
 */
export function offloadRecordImages<T extends Pictured>(rec: T, branchId: string, upload = true): T {
  return mapRecordImages(rec, (src, slot) =>
    isDataUrl(src) && src.length >= OFFLOAD_MIN_LENGTH ? storeImage(branchId, `${rec.id}-${slot}-${contentTag(src)}`, src, upload) : src
  );
}

/** The record with every picture read back (for printing, the accountant's pack, Google Drive…) */
export async function resolveRecordImages<T extends Pictured>(rec: T): Promise<T> {
  return mapRecordImagesAsync(rec, async src => (isImageRef(src) ? (await resolveImage(src)) || '' : src));
}

/** React: the picture to show for a picture or reference (undefined while it loads, null when not found) */
export function useImage(src: string | undefined | null): string | undefined | null {
  const [data, setData] = useState<string | undefined | null>(() => (src && isDriveRef(src) ? driveImageUrl(src) : src && !isImageRef(src) ? src : undefined));
  useEffect(() => {
    let alive = true;
    if (!src) {
      setData(undefined);
      return;
    }
    if (isDriveRef(src)) {
      setData(driveImageUrl(src)); // loaded by the phone itself
      return;
    }
    if (!isImageRef(src)) {
      setData(src);
      return;
    }
    setData(undefined);
    // null: not on this device nor in the cloud (e.g. moved to Google Drive)
    void resolveImage(src).then(d => alive && setData(d ?? null));
    return () => {
      alive = false;
    };
  }, [src]);
  return data;
}

/** Send one picture to the cloud now; true when it is there */
export async function uploadImageNow(ref: string): Promise<boolean> {
  const p = parseImageRef(ref);
  if (!p) return false;
  if (uploaded.has(p.id)) return true;
  const data = pending.get(p.id) || (await localGet(p.id));
  if (!data) return false;
  if (data.length > 950_000) return false;
  const ok = await (await cloud()).saveBranchDoc(p.branchId, imageDocKey(p.id), { data });
  if (ok) {
    writeQueue(readQueue().filter(q => q.id !== p.id));
    if (memoryOnly) {
      uploaded.add(p.id);
      pending.delete(p.id);
      remember(p.id, data);
    }
  }
  return ok;
}

/** References in a record (to upload them before the record itself is rewritten in the cloud) */
export function recordImageRefs(rec: Pictured): string[] {
  const refs: string[] = [];
  mapRecordImages(rec, src => (isImageRef(src) && refs.push(src), src));
  return refs;
}

/** Remove a picture's cloud copy (it is kept in Google Drive); this device keeps its own copy */
export async function deleteCloudImage(ref: string): Promise<boolean> {
  const p = parseImageRef(ref);
  if (!p) return false;
  // Kept here first, so this device can still show it
  if (!(await localGet(p.id))) {
    const doc = await (await cloud()).loadBranchDoc(p.branchId, imageDocKey(p.id));
    if (typeof doc?.data === 'string') await localPut(p.id, doc.data);
  }
  writeQueue(readQueue().filter(q => q.id !== p.id));
  return (await cloud()).deleteBranchDoc(p.branchId, imageDocKey(p.id));
}

const driveCopyKey = (ref: string) => `gd_${driveRefId(ref)}`;
/** Keep this device's copy of a picture now in Drive (printing and PDFs use it when it is here) */
export async function keepDriveCopy(ref: string, dataUrl: string): Promise<void> {
  if (isDriveRef(ref) && dataUrl.startsWith('data:')) await localPut(driveCopyKey(ref), dataUrl);
}
