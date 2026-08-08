import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
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
