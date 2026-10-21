/**
 * When the app keeps closing during start-up (Safari: "a problem repeatedly occurred"), the usual
 * cause is the cloud database's copy on this device: Firestore reads its cached records (from
 * before bill pictures left them, megabytes each) into memory for the first screen. After three
 * starts in a row that did not last 20 seconds, that copy is removed before the app loads; the
 * cloud sends the records again (now without pictures). The shop's own data on this device and
 * the records not yet sent (kept in their own queues) are not touched.
 */
const KEY = 'POS_BOOT_GUARD';
const HEALTHY_AFTER_MS = 20_000;
const CRASHES_BEFORE_RESET = 2;

function deleteDb(name: string): Promise<void> {
  return new Promise(resolve => {
    try {
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
      setTimeout(resolve, 3000);
    } catch {
      resolve();
    }
  });
}

async function clearCloudCache(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  let names: string[] = [];
  try {
    names = ((await indexedDB.databases?.()) || []).map(d => d.name || '').filter(n => n.startsWith('firestore/'));
  } catch {
    names = [];
  }
  await Promise.all(names.map(deleteDb));
  return names.length;
}

export async function bootGuard(): Promise<void> {
  let failed = 0;
  try {
    failed = Number(JSON.parse(localStorage.getItem(KEY) || '{}').failed) || 0;
  } catch {
    failed = 0;
  }
  // Counted as failed until it has run long enough; reset once it has
  try {
    localStorage.setItem(KEY, JSON.stringify({ failed: failed + 1 }));
  } catch {
    // storage unavailable
  }
  setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ failed: 0 }));
    } catch {
      // storage unavailable
    }
  }, HEALTHY_AFTER_MS);
  if (failed >= CRASHES_BEFORE_RESET) {
    const n = await clearCloudCache();
    console.warn(`[bootGuard] The app closed during start-up ${failed} times: cleared the cloud cache (${n} database(s))`);
    try {
      localStorage.setItem(KEY, JSON.stringify({ failed: 0, resetAt: new Date().toISOString() }));
    } catch {
      // storage unavailable
    }
  }
}
