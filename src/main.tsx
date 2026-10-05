import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { readTableFromUrl } from './components/customer/tableLink.ts';
import './index.css';

// A table QR code (?table=5&b=<branch>) opens the customer ordering page: no login, no staff
// screens, and the staff app (with all its shop data) is never loaded on the customer's phone.
const tableLink = readTableFromUrl(window.location.search);
// A document link from the Telegram bot (#doc=…) opens just that document (no login)
const docCode = window.location.hash.startsWith('#doc=') ? window.location.hash.slice(5) : '';
const App = lazy(() => import('./App.tsx'));
const DocLinkPage = lazy(() => import('./components/docs/DocLinkPage.tsx').then(m => ({ default: m.DocLinkPage })));
const CustomerOrderPage = lazy(() => import('./components/customer/CustomerOrderPage.tsx'));

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
