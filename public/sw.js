/**
 * Service worker for installability only.
 *
 * Deliberately does NOT cache. A precaching worker would keep serving an old
 * bundle after each deploy, and stale chunks have already cost this project
 * real time — a new screen simply not appearing until a hard refresh. Chrome
 * requires a fetch handler before it will offer "Install", so this provides one
 * that does nothing but pass the request through to the network.
 *
 * Offline support could be added later, but it needs a version-aware cache and
 * an update prompt, not a blanket cache-first rule.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  // Pass-through. Present so the app qualifies as installable; the browser's own
  // HTTP cache still applies, which is what we want.
  event.respondWith(fetch(event.request));
});
