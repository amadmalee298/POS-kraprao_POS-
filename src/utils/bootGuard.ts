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

type RunState = { visible: boolean; at: number; crashes: number; page?: string };

export function readRunState(raw: string | null): RunState | null {
  try {
    const s = JSON.parse(raw || 'null');
    return s && typeof s.at === 'number' ? { visible: !!s.visible, at: s.at, crashes: Number(s.crashes) || 0, ...(typeof s.page === 'string' && s.page ? { page: s.page } : {}) } : null;
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
export const crashPage = () => crashedOn;
/** The page now shown (called when it changes) */
export function setRunPage(name: string): void {
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
  const mark = () => save({ visible: document.visibilityState !== 'hidden', at: Date.now(), crashes: stored, ...(page ? { page } : {}) });
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
  window.addEventListener('pagehide', () => save({ visible: false, at: Date.now(), crashes: stored, ...(page ? { page } : {}) }));
}
