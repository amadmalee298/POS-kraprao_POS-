/**
 * The shop's data is no longer kept on this device: everything is read from the cloud on each
 * visit and held only in memory (see utils/bigStore, services/imageStore and hooks/useLocalRetire).
 * Only the sign-in and small per-device choices stay on the device.
 */
const KEY = 'POS_LOCAL_RETIRED';

export function isLocalRetired(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markLocalRetired(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // asked again next visit
  }
}

/** Removes a browser database (resolves when gone, refused or after 3 seconds) */
export function deleteLocalDb(name: string): Promise<void> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve();
      const r = indexedDB.deleteDatabase(name);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
      setTimeout(resolve, 3000);
    } catch {
      resolve();
    }
  });
}
