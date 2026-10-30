import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePOS } from '../context/POSContext';

const CHECK_EVERY_MS = 10 * 60_000;
/** Back from the background after this long: reloaded right away when nothing is in progress */
const AWAY_RELOAD_MS = 20 * 60_000;

/** The app's main script, e.g. assets/index-b_Yxw8ca.js (changes with every new version) */
const entryOf = (html: string) => html.match(/assets\/index-[\w-]+\.js/)?.[0] || '';
/**
 * Load the new version: once per version per visit, at an address the browser has not cached (the
 * site lets a page be reused for 10 minutes; reloading into the cached old page again and again
 * could loop). After that one try, the bar is shown instead.
 */
const RELOADED_KEY = 'POS_UPDATE_RELOADED';
export function loadNewVersion(latest: string): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === latest) return false;
    sessionStorage.setItem(RELOADED_KEY, latest);
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

const runningEntry = () => {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  return s ? entryOf(s.getAttribute('src') || '') : '';
};

/**
 * A phone keeps the app open in the background for days (iPhone home-screen apps especially), so
 * fixes published since never reached it. The app checks for a newer version when it comes back to
 * the screen and every 10 minutes: on the sign-in screen, or back after a while with no order in
 * progress, it reloads by itself; otherwise a bar offers the update.
 */
export const UpdateWatcher = () => {
  const { isLocked, cart } = usePOS();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const running = runningEntry();
    if (!running) return; // development server
    let hiddenAt = 0;
    const check = async (cameBack: boolean) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL || './'}index.html?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const latest = entryOf(await res.text());
        if (!latest || latest === running) return;
        const away = cameBack && hiddenAt && Date.now() - hiddenAt > AWAY_RELOAD_MS;
        latestRef.current = latest;
        if (!((isLockedRef.current || (away && cartEmptyRef.current)) && loadNewVersion(latest))) setReady(true);
      } catch {
        // offline: checked again later
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else void check(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(() => void check(false), CHECK_EVERY_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, []);

  isLockedRef.current = isLocked;
  cartEmptyRef.current = !cart?.length;
  // On the sign-in screen an update waiting is taken at once
  useEffect(() => {
    if (ready && isLocked && latestRef.current) loadNewVersion(latestRef.current);
  }, [ready, isLocked]);

  if (!ready) return null;
  return (
    <div className="bg-emerald-950 border-b border-emerald-800 text-emerald-100 px-4 py-2 text-xs flex items-center justify-between gap-3">
      <span>มีแอปเวอร์ชันใหม่ (แก้ไขล่าสุด) กดอัปเดตได้เลย ข้อมูลอยู่บนคลาวด์ ไม่หาย</span>
      <button type="button" onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.set('v', String(Date.now()));
          window.location.replace(url.toString());
        }} className="shrink-0 h-8 px-3 rounded-lg bg-emerald-700 font-bold flex items-center gap-1">
        <RefreshCw className="w-3.5 h-3.5" /> อัปเดต
      </button>
    </div>
  );
};

const isLockedRef = { current: false };
const latestRef = { current: '' };
const cartEmptyRef = { current: true };
