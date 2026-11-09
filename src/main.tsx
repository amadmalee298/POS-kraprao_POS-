import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { readTableFromUrl } from './components/customer/tableLink.ts';
import { importWithRetry, reloadForChunks } from './utils/chunkLoad.ts';
import './index.css';

// A table QR code (?table=5&b=<branch>) opens the customer ordering page: no login, no staff
// screens, and the staff app (with all its shop data) is never loaded on the customer's phone.
const tableLink = readTableFromUrl(window.location.search);
// A document link from the Telegram bot (#doc=…) opens just that document (no login)
const docCode = window.location.hash.startsWith('#doc=') ? window.location.hash.slice(5) : '';
// The staff app's local data is read from the browser's database before the app starts
// (after the phone closed the app, it opens lighter: see utils/bootGuard)
// Code that fails to load for a moment (weak signal) is tried again (see utils/chunkLoad)
const App = lazy(() =>
  importWithRetry(() => import('./utils/bootGuard.ts'))
    .then(m => m.bootGuard())
    .then(() => importWithRetry(() => import('./utils/bigStore.ts')))
    .then(m => m.hydrateBigStore())
    .then(() => importWithRetry(() => import('./App.tsx')))
);
const DocLinkPage = lazy(() => importWithRetry(() => import('./components/docs/DocLinkPage.tsx')).then(m => ({ default: m.DocLinkPage })));
const CustomerOrderPage = lazy(() => importWithRetry(() => import('./components/customer/CustomerOrderPage.tsx')));

// A file preloaded for a page could not be loaded (e.g. replaced by a newer version): reload once
window.addEventListener('vite:preloadError', event => {
  if (reloadForChunks()) event.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#0d0704' }} />}>
        {docCode ? <DocLinkPage code={docCode} /> : tableLink ? <CustomerOrderPage table={tableLink.table} branchId={tableLink.branchId} /> : <App />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);

// Register Service Worker for offline POS caching safely
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || './';
    const swPath = baseUrl.endsWith('/') ? `${baseUrl}sw.js` : `${baseUrl}/sw.js`;
    
    navigator.serviceWorker
      .register(swPath)
      .then((reg) => {
        console.log('[POS PWA] ServiceWorker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[POS PWA] ServiceWorker registration skipped/failed:', err);
      });
  });
}
