/* Ti-Services — service worker (coquille hors-ligne) */
const CACHE = 'ti-services-v248';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './zouti-logo.svg',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './badge-96.png',
  './icon-180-beta.png',
  './icon-192-beta.png',
  './icon-512-beta.png',
  './icon-maskable-512-beta.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Notifications push (FCM Web Push) : affiche l'alerte même app fermée.
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { try { p = { data: { body: e.data && e.data.text() } }; } catch (__) {} }
  const src = p.data || p.notification || p || {};
  const title = src.title || 'Ti-Services';
  const body = src.body || '';
  const url = src.url || (p.data && p.data.url) || './';
  e.waitUntil(self.registration.showNotification(title, {
    // icon = grande vignette couleur (le poulpe corail) ; badge = silhouette
    // MONOCHROME transparente pour la barre d'état Android (sinon un carré blanc).
    body, icon: './icon-192.png', badge: './badge-96.png',
    data: { url }, tag: src.tag || 'ti-services', renotify: true
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if ('focus' in c) { try { c.navigate(url); } catch (_) {} return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Ne pas intercepter le cross-origin (Firebase, gstatic, googleapis…) : réseau direct.
  if (new URL(req.url).origin !== self.location.origin) return;
  // navigations : réseau d'abord, repli sur la coquille en cache (hors-ligne)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // reste : cache d'abord, puis réseau
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
