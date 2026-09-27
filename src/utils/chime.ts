/**
 * One shared AudioContext for alert sounds. Browsers keep audio muted until the person has
 * touched the page, so the context is resumed on the first tap or key press, and screens can
 * ask whether sound is currently possible (a kitchen tablet left idle would otherwise stay silent).
 */
let ctx: AudioContext | null = null;
const listeners = new Set<(ready: boolean) => void>();

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    ctx.addEventListener('statechange', () => listeners.forEach(fn => fn(isSoundReady())));
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isSoundReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Resume audio; call from a tap or key press. */
export function unlockSound(): void {
  const c = getContext();
  if (c && c.state !== 'running') c.resume().catch(() => undefined);
}

/** Subscribe to "sound can play" changes. Returns an unsubscribe function. */
export function onSoundReadyChange(fn: (ready: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  const unlockOnce = () => {
    unlockSound();
    if (isSoundReady()) {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    }
  };
  window.addEventListener('pointerdown', unlockOnce);
  window.addEventListener('keydown', unlockOnce);
}

/** Two-note chime (D5 → A5). Silent if the browser has not allowed audio yet. */
export function playChime(): void {
  const c = getContext();
  if (!c) return;
  if (c.state !== 'running') c.resume().catch(() => undefined);
  try {
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, t);
    osc.frequency.setValueAtTime(880, t + 0.15);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  } catch (err) {
    console.log('Audio chime error:', err);
  }
}
