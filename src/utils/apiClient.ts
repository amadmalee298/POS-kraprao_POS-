/**
 * Base URL of the Express backend (server.ts).
 * - Served by server.ts itself (dev / Cloud Run): same origin, leave VITE_API_BASE_URL unset.
 * - Static hosting (GitHub Pages): there is no backend on that origin, so set
 *   VITE_API_BASE_URL at build time to the deployed server (and list the Pages origin in the
 *   server's ALLOWED_ORIGINS), or leave it unset and the app falls back to browser-only features.
 */
const RAW_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

const isStaticHostOrigin = (): boolean =>
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:');

/** True when a backend is reachable (same origin, or configured via VITE_API_BASE_URL). */
export const hasBackend = (): boolean => Boolean(RAW_BASE) || !isStaticHostOrigin();

export const apiUrl = (path: string): string => `${RAW_BASE}${path.startsWith('/') ? path : `/${path}`}`;
