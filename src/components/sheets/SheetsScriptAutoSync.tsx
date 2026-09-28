import { useEffect, useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { useSheetsScriptPush } from '../../hooks/useSheetsScript';
import { readAutoMinutes, readLastPush } from '../../services/sheetsScript';

const CHECK_MS = 60 * 1000;
// After a failed send, wait before trying again (the next check would otherwise retry every minute)
const RETRY_MS = 10 * 60 * 1000;

/** Sends the sheets on the interval the shop chose, while the app is open and online */
export const SheetsScriptAutoSync: React.FC = () => {
  const { settings, isOffline, forceOfflineMode } = usePOS();
  const push = useSheetsScriptPush();
  const cfg = settings.sheetsScript;
  const [auto, setAuto] = useState(readAutoMinutes);
  useEffect(() => {
    const on = (e: Event) => setAuto(Number((e as CustomEvent).detail) || 0);
    window.addEventListener('sheets-script-auto', on);
    return () => window.removeEventListener('sheets-script-auto', on);
  }, []);
  const minutes = cfg?.url && cfg.secret ? auto : 0;
  const offline = isOffline || forceOfflineMode;

  useEffect(() => {
    if (!minutes || offline) return;
    let running = false;
    const tick = async () => {
      if (running || document.visibilityState === 'hidden') return;
      const last = readLastPush();
      const since = last ? Date.now() - new Date(last.at).getTime() : Infinity;
      if (since < (last && !last.ok ? Math.min(RETRY_MS, minutes * 60000) : minutes * 60000)) return;
      running = true;
      try {
        await push();
      } catch (e) {
        console.warn('[Sheets Apps Script] automatic send failed:', e);
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, CHECK_MS);
    return () => clearInterval(id);
  }, [minutes, offline, push]);

  return null;
};
