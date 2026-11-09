/**
 * Pages are loaded the first time they are opened. On a phone the request can fail for a moment
 * (a weak 5G signal, the app reopened after the phone closed it): the import is tried again (some
 * browsers keep the failed load, so this alone may not help). React keeps a failed page load for
 * good, so when it still fails the app is reloaded once, which loads the page afresh (and picks up
 * a newer version whose files replaced the old ones).
 */
const RELOAD_KEY = 'POS_CHUNK_RELOADED';

/** A page's code could not be loaded (not a fault in the page itself) */
export const isChunkLoadError = (err: unknown): boolean =>
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|Loading chunk \S+ failed|Loading CSS chunk/i.test(
    String((err as { message?: string } | null)?.message || err || '')
  );

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The import, tried again after 1 s and 3 s when it fails to load */
export async function importWithRetry<T>(load: () => Promise<T>, delays = [1000, 3000]): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await load();
    } catch (err) {
      last = err;
      if (!isChunkLoadError(err) || i === delays.length) break;
      await wait(delays[i]);
    }
  }
  throw last;
}

/** Reload the app at an address the browser has not cached (false: reloaded for this a moment ago) */
export function reloadForChunks(): boolean {
  try {
    // Not again within 5 minutes (a reload that did not help would otherwise loop)
    if (Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) || 0) < 5 * 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

/** A reload the person asked for (the button), whatever happened before */
export function reloadApp(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}
