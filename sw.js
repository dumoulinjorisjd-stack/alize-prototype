/* Ti-Services — service worker (coquille hors-ligne) */
const CACHE = 'ti-services-v779';
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
  // PAS de skipWaiting automatique : une nouvelle version reste « en attente »
  // jusqu'à ce que l'utilisateur l'accepte (bouton « mettre à jour »). Objectif :
  // ne JAMAIS recharger l'app en plein milieu d'une saisie (inscription, commande…),
  // ce qui faisait perdre le formulaire et renvoyait à l'écran de démarrage.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

// La page peut demander l'activation immédiate de la nouvelle version (au clic
// sur « mettre à jour »). Alors seulement on prend la main → rechargement contrôlé.
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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

/* Une adresse servie qui est une PAGE à part entière (texte légal, page de métier,
   sommaire), et non la coquille de l'application. Seule `/index.html` à la racine est
   l'application : `/services/index.html` est bien un sommaire lisible. */
function estUnePage(p) {
  const chemin = (p || '').replace(/\/+$/, '');
  if (!/\.html$/i.test(chemin)) return false;
  return chemin.replace(/^\/+/, '') !== 'index.html';
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Ne pas intercepter le cross-origin (Firebase, gstatic, googleapis…) : réseau direct.
  if (new URL(req.url).origin !== self.location.origin) return;
  // VIDÉOS : le navigateur les demande par TRANCHES (en-tête Range). Servir une réponse
  // complète depuis le cache casse la lecture sur iPhone, et une réponse partielle (206)
  // ne se met pas en cache. On ne s'en mêle donc pas : réseau direct.
  if (req.headers.has('range') || /\.mp4($|\?)/i.test(req.url)) return;
  // Navigations : COQUILLE EN CACHE D'ABORD (affichage quasi instantané), et on
  // rafraîchit la copie en arrière-plan. C'est cohérent avec la mise à jour sur
  // consentement : la nouvelle version s'installe en attente et n'est appliquée
  // qu'au clic sur « mettre à jour ». Avant, chaque lancement retéléchargeait
  // l'application entière — plusieurs secondes en 4G.
  // UNE PAGE N'EST PAS L'APPLICATION. La règle ci-dessous rend la coquille pour TOUTE
  // navigation — elle aurait donc servi l'app à quelqu'un qui ouvre /legal/cgu.html ou
  // /services/menage.html dans un nouvel onglet, ou qui le suit sans JavaScript. Les
  // moteurs, eux, n'exécutent aucun service worker et n'auraient rien vu du problème :
  // il ne se serait manifesté que chez les visiteurs déjà venus une fois, c'est-à-dire
  // chez ceux qui reviennent.
  // ON NE TIENT PAS DE LISTE DE DOSSIERS : `/legal/` y était nommé, et les quarante-quatre
  // pages de métier ajoutées ensuite seraient passées à travers sans que rien ne le dise.
  // C'est la FORME de l'adresse qui tranche — un fichier `.html` publié est une page, et
  // la seule exception est la coquille elle-même, à la racine. Une page écrite demain
  // suivra la règle sans qu'on y pense.
  if (req.mode === 'navigate' && !estUnePage(new URL(req.url).pathname)) {
    e.respondWith(
      caches.match('./index.html').then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
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
