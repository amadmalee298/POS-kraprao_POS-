/** Opening a given part of the settings page from elsewhere (e.g. the side menu) */
export type SettingsTab = 'general' | 'scheduling' | 'timeclock' | 'shifts' | 'sync' | 'pins' | 'security_logs' | 'backup';

const EVENT = 'open-settings-tab';
let pending: SettingsTab | null = null;

export function requestSettingsTab(tab: SettingsTab) {
  pending = tab;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: tab }));
}

/** The tab asked for before the settings page opened (read once) */
export function takePendingSettingsTab(): SettingsTab | null {
  const t = pending;
  pending = null;
  return t;
}

export function onSettingsTabRequest(cb: (tab: SettingsTab) => void): () => void {
  const handler = (e: Event) => {
    pending = null;
    cb((e as CustomEvent).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
