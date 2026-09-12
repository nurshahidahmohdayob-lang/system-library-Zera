import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the installability worker. It caches nothing (see public/sw.js), so
// it cannot serve a stale bundle after a deploy; it exists so browsers offer
// "Install". Failure is not worth surfacing — the app works either way.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration skipped:', err);
    });
  });
}
