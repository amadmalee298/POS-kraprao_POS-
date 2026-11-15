/**
 * When the phone runs out of memory, iPhone Safari closes the page and opens it again; when that
 * keeps happening it shows "a problem repeatedly occurred". The app used to open again on the same
 * page with the same loading, so it closed again.
 *
 * Each run notes whether the page is on screen. If the last run ended while on screen (it did not
 * go to the background or close first), it was closed by the phone: this run then opens on the
 * sales screen instead of the last page and loads the cloud lists in smaller pieces (lightStart).
 * After a minute on screen the run counts as healthy.
 */
const KEY = 'POS_RUN_STATE';
const HEALTHY_AFTER_MS = 60_000;
const HEARTBEAT_MS = 20_000;
// A run last seen on screen longer ago than this ended some other way (e.g. the phone slept)
const CRASH_WINDOW_MS = 3 * 60_000;

type RunState = { visible: boolean; at: number; crashes: number; page?: string; detail?: string; action?: string; build?: string };

export function readRunState(raw: string | null): RunState | null {
  try {
    const s = JSON.parse(raw || 'null');
    if (!s || typeof s.at !== 'number') return null;
    const text = (k: string) => (typeof s[k] === 'string' && s[k] ? { [k]: s[k] as string } : {});
    return { visible: !!s.visible, at: s.at, crashes: Number(s.crashes) || 0, ...text('page'), ...text('detail'), ...text('action'), ...text('build') };
  } catch {
    return null;
  }
}

/** How many runs in a row the phone closed, counting the last one (0: it ended normally) */
export function crashesBefore(prev: RunState | null, now: number): number {
  if (!prev || !prev.visible || now - prev.at > CRASH_WINDOW_MS) return 0;
  return prev.crashes + 1;
}

let crashes = 0;
/** The page the run closed by the phone was on ('' when unknown) */
let crashedOn = '';
/** The page this run is on (kept with each note, so a crash says where it happened) */
let page = '';
let markNow: (() => void) | null = null;
/** Where on the page (e.g. its tab) and the last thing done there, kept with each note */
let detail = '';
let action = '';
let crashedRun: RunState | null = null;
export const crashPage = () => crashedOn;
/** The closed run's tab, last action and app build (to find what used the memory) */
export const crashInfo = () => crashedRun;
/** The part of the page now shown (e.g. a tab) */
export function setRunDetail(name: string): void {
  if (detail === name) return;
  detail = name;
  action = '';
  markNow?.();
}
/** Something done that may take memory (opening a picture, approving a bill…) */
export function noteRunAction(name: string): void {
  action = `${name} ${new Date().toTimeString().slice(0, 5)}`;
  markNow?.();
}
/** The app's build (the name of its main script) */
const build = () => {
  try {
    const src = (document.querySelector('script[type="module"][src*="index-"]') as HTMLScriptElement | null)?.src || '';
    return (src.match(/index-([\w-]+)\.js/) || [])[1] || '';
  } catch {
    return '';
  }
};
/** The page now shown (called when it changes) */
export function setRunPage(name: string): void {
  if (page !== name) detail = action = '';
  page = name;
  markNow?.();
}
/** Runs in a row closed by the phone just before this one */
export const startupCrashes = () => crashes;
/** Open on the sales screen and load the cloud lists in smaller pieces (the last run was closed) */
export const lightStart = () => crashes > 0;

function save(state: RunState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable
  }
}

export async function bootGuard(): Promise<void> {
  try {
    const prev = readRunState(localStorage.getItem(KEY));
    crashes = crashesBefore(prev, Date.now());
    crashedOn = crashes ? prev?.page || '' : '';
    crashedRun = crashes ? prev : null;
  } catch {
    crashes = 0;
  }
  try {
    localStorage.removeItem('POS_BOOT_GUARD'); // the earlier version's counter
  } catch {
    // storage unavailable
  }
  if (crashes) console.warn(`[bootGuard] The page was closed by the phone ${crashes} time(s) in a row: light start`);

  // Counted as closed by the phone until it has been on screen for a minute
  let stored = crashes;
  const b = build();
  const extra = () => ({ ...(page ? { page } : {}), ...(detail ? { detail } : {}), ...(action ? { action } : {}), ...(b ? { build: b } : {}) });
  const mark = () => save({ visible: document.visibilityState !== 'hidden', at: Date.now(), crashes: stored, ...extra() });
  markNow = mark;
  mark();
  setTimeout(() => {
    stored = 0;
    mark();
  }, HEALTHY_AFTER_MS);
  setInterval(() => {
    if (document.visibilityState !== 'hidden') mark();
  }, HEARTBEAT_MS);
  // Going to the background or closing the tab is a normal end
  document.addEventListener('visibilitychange', mark);
  window.addEventListener('pagehide', () => save({ visible: false, at: Date.now(), crashes: stored, ...extra() }));
}
