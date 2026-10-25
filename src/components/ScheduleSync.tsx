import { useEffect } from 'react';
import { usePOS } from '../context/POSContext';
import { firebaseWebConfig, isFirebaseAvailable, mergeBranchDoc, savePublicSchedule, shopAccountRefreshToken } from '../services/firebaseService';
import { shopLabel } from '../services/notificationService';
import { vercelBase } from '../services/receiptScan';
import { isLowStock } from '../utils/stockTypes';

const SEALED_KEY = 'POS_SCHEDULE_SEALED';
const DAY = 86_400_000;

/**
 * Lets the shop's server send the daily summary and filing reminders on time, even when every
 * device is closed (see src/server/scheduledJobs): on the owner's or a manager's device signed in
 * with the shop account, the server seals that sign-in once a day, and the low-stock count and
 * the shop name for the messages are kept in branches/<branch>/config/schedule. Mounted once.
 */
export const ScheduleSync = () => {
  const { settings, currentBranch, currentUser, ingredients, isStorageLoaded, isOffline, forceOfflineMode } = usePOS();
  const branchId = currentBranch?.id || '';
  const allowed = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const online = !isOffline && !forceOfflineMode;
  const base = vercelBase(settings.merchantSettings?.serverUrl);

  // The sealed sign-in, again each day (and when the account or branch changes)
  useEffect(() => {
    if (!allowed || !online || !branchId || !base) return;
    const timer = setTimeout(async () => {
      const refreshToken = shopAccountRefreshToken();
      if (!refreshToken || !isFirebaseAvailable()) return;
      const tag = `${branchId}:${refreshToken.slice(-12)}`;
      try {
        const last = JSON.parse(localStorage.getItem(SEALED_KEY) || 'null');
        if (last?.tag === tag && Date.now() - last.at < DAY) return;
      } catch {
        // sealed again
      }
      try {
        const fb = firebaseWebConfig();
        const res = await fetch(`${base}/api/telegram/webhook?seal=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId, projectId: fb.projectId, apiKey: fb.apiKey, databaseId: fb.databaseId || undefined, refreshToken })
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok || !data.sealed) return; // an older server, or no key on it yet
        if (await savePublicSchedule(branchId, data.sealed)) localStorage.setItem(SEALED_KEY, JSON.stringify({ tag, at: Date.now() }));
      } catch {
        // tried again next time
      }
    }, 30_000);
    return () => clearTimeout(timer);
  }, [allowed, online, branchId, base]);

  // What the server's messages need from this device
  const lowStock = ingredients.filter(isLowStock).length;
  const label = shopLabel(settings.shopName, currentBranch);
  useEffect(() => {
    if (!allowed || !online || !branchId || !isStorageLoaded) return;
    const key = `POS_SCHEDULE_INFO_${branchId}`;
    const value = JSON.stringify({ lowStock, shopLine: label });
    try {
      if (localStorage.getItem(key) === value) return;
    } catch {
      // written again
    }
    const timer = setTimeout(async () => {
      if (await mergeBranchDoc(branchId, 'schedule', { lowStock, shopLine: label })) {
        try {
          localStorage.setItem(key, value);
        } catch {
          // written again next time
        }
      }
    }, 10_000);
    return () => clearTimeout(timer);
  }, [allowed, online, branchId, isStorageLoaded, lowStock, label]);

  return null;
};
