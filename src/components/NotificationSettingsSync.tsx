import { useEffect } from 'react';
import { usePOS } from '../context/POSContext';
import { isFirebaseAvailable, saveBranchDoc, subscribeToBranchDoc } from '../services/firebaseService';
import {
  applySharedNotificationConfig,
  getStoredCredentials,
  getStoredRules,
  getStoredTriggers,
  hasLocalNotificationConfig,
  setNotificationCloudSaver,
  SharedNotificationConfig
} from '../services/notificationService';

/**
 * Keeps LINE / Telegram settings the same on every device of the branch. Without it only the
 * device where the bot was set up would send notifications (for example about orders taken on
 * another tablet).
 */
export const NotificationSettingsSync: React.FC = () => {
  const { currentBranch } = usePOS();
  const branchId = currentBranch?.id;

  useEffect(() => {
    if (!branchId || !isFirebaseAvailable()) return;
    setNotificationCloudSaver((config: SharedNotificationConfig) => {
      saveBranchDoc(branchId, 'notifications', { ...config, savedAt: new Date().toISOString() });
    });
    const unsub = subscribeToBranchDoc(branchId, 'notifications', data => {
      if (data) {
        applySharedNotificationConfig(data as Partial<SharedNotificationConfig>);
      } else if (hasLocalNotificationConfig()) {
        // First device with settings shares them
        saveBranchDoc(branchId, 'notifications', {
          credentials: getStoredCredentials(),
          triggers: getStoredTriggers(),
          rules: getStoredRules(),
          savedAt: new Date().toISOString()
        });
      }
    });
    return () => {
      unsub();
      setNotificationCloudSaver(null);
    };
  }, [branchId]);

  return null;
};
