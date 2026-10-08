/**
 * The shop's large local data (orders, expenses, income, menu, stock and the app state) in the
 * browser's database (IndexedDB) instead of localStorage, which holds only about 5 MB and then
 * silently stops saving. Same synchronous API as localStorage: values are read into memory once
 * before the app starts (hydrateBigStore) and written through in the background.
 *
 * Without IndexedDB (or before hydration) everything falls back to localStorage. A value found in
 * localStorage wins over the database copy: it is either not moved yet or was written by a
 * fallback session, so it is the newer one.
 */

export const BIG_KEYS = [
  'kaprao_pos_enterprise_v1',
  'POS_ORDERS_DATA',
  'POS_EXPENSES_DATA',
  'POS_INCOMES_DATA',
  'POS_MENU_ITEMS_DATA',
  'POS_INGREDIENTS_DATA'
] as const;

const DB_NAME = 'kaprao-pos-local';
const STORE = 'kv';
const isBig = (key: string) => (BIG_KEYS as readonly string[]).includes(key);

const cache = new Map<string, string>();
let db: IDBDatabase | null = null;
const pending = new Map<string, string | null>(); // key → value to write (null: delete)
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const req = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
}

function flush(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!db || pending.size === 0) return Promise.resolve();
  const batch = [...pending.entries()];
  pending.clear();
  return new Promise(resolve => {
    try {
      const tx = db!.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const [k, v] of batch) {
        if (v === null) store.delete(k);
        else store.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.warn('[bigStore] Failed to save local data:', tx.error);
        resolve();
      };
    } catch (err) {
      console.warn('[bigStore] Failed to save local data:', err);
      resolve();
    }
  });
}

/** Wait until every change is in the database (e.g. before reloading the page) */
export const flushBigStore = () => flush();

/** Every large value held (for a backup file) */
export function bigStoreEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of BIG_KEYS) {
    const v = bigStore.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

const schedule = () => {
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 50);
};

/** Read the large data into memory and move it out of localStorage (call once before the app starts) */
export async function hydrateBigStore(timeoutMs = 4000): Promise<void> {
  if (db || typeof indexedDB === 'undefined') return;
  try {
    const opened = await Promise.race([openDb(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))]);
    const tx = opened.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const values = await Promise.all(BIG_KEYS.map(k => req(store.get(k) as IDBRequest<string | undefined>)));
    const moved: string[] = [];
    BIG_KEYS.forEach((k, i) => {
      let local: string | null = null;
      try {
        local = localStorage.getItem(k);
      } catch {
        // private mode
      }
      if (local !== null) {
        cache.set(k, local);
        pending.set(k, local);
        moved.push(k);
      } else if (typeof values[i] === 'string') {
        cache.set(k, values[i] as string);
      }
    });
    db = opened;
    if (moved.length) {
      // Free localStorage only once the database holds the data
      const batch = [...pending.entries()];
      pending.clear();
      const wtx = opened.transaction(STORE, 'readwrite');
      for (const [k, v] of batch) wtx.objectStore(STORE).put(v, k);
      await new Promise<void>((resolve, reject) => {
        wtx.oncomplete = () => resolve();
        wtx.onerror = () => reject(wtx.error);
      });
      moved.forEach(k => {
        try {
          localStorage.removeItem(k);
        } catch {
          // ignore
        }
      });
    }
    window.addEventListener('pagehide', () => void flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  } catch (err) {
    console.warn('[bigStore] IndexedDB unavailable, keeping data in localStorage:', err);
    db = null;
    cache.clear();
    pending.clear();
  }
}

export const bigStore = {
  getItem(key: string): string | null {
    if (!db || !isBig(key)) return localStorage.getItem(key);
    return cache.has(key) ? cache.get(key)! : null;
  },
  setItem(key: string, value: string): void {
    if (!db || !isBig(key)) {
      localStorage.setItem(key, value);
      return;
    }
    cache.set(key, value);
    pending.set(key, value);
    schedule();
  },
  removeItem(key: string): void {
    if (!db || !isBig(key)) {
      localStorage.removeItem(key);
      return;
    }
    cache.delete(key);
    pending.set(key, null);
    schedule();
  }
};

/** Forget all large local data (with localStorage.clear(), e.g. the error screen's reset) */
export async function clearBigStore(): Promise<void> {
  cache.clear();
  pending.clear();
  try {
    const d = db || (typeof indexedDB !== 'undefined' ? await openDb() : null);
    if (!d) return;
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await new Promise<void>(resolve => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // nothing stored
  }
}
