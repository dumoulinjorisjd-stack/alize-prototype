/* PASSER EN CLIENT UNE CANDIDATURE JAMAIS ENVOYÉE (l'éditeur, 27/11/2026). Le défaut de
   l'inscription Google a créé des « candidatures » qui étaient des clients.
   A. la console : « Passer en client » en deux touchers, n'écrit que le rôle et sa trace ;
   B. l'app du compte, à la prochaine ouverture : espace CLIENT ;
   C. contrôle : la même fiche restée « artisan » rouvre bien le dossier prestataire. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o); const errs = [];
  const page = async () => { const p = await (await b.newContext({ viewport: { width: 393, height: 1400 }, serviceWorkers: 'block' })).newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
    await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__session && window.__setFB); return p; };

  console.log('A — la console');
  const p = await page();
  const a = await p.evaluate(async () => {
    window.__ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: (_, c, id) => ({ path: c + '/' + id }), updateDoc: (r, d) => { window.__ecrits.push({ r: r.path, d }); return Promise.resolve(); }, setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' };
    S.adminArtsLoaded = true; S.adminArtisans = []; S.adminDrafts = [{ uid: 'em1', name: 'emilie duhard', email: 'emilie@gmail.com', createdAt: Date.now() - 3600000, jalonsPro: null }];
    S.admin = { view: 'home' }; S._fold = {}; document.querySelectorAll('[data-fold]').forEach(function () {});
    window.__render();
    // déplie tout ce qui contient la candidature
    for (let i = 0; i < 4 && !document.querySelector('[data-adm="draft2client:em1"]'); i++) {
      document.querySelectorAll('.fold-head[aria-expanded="false"]').forEach((h) => { if (/Jamais|candidature|dossier/i.test(h.textContent)) h.click(); });
      await new Promise((r) => setTimeout(r, 30)); }
    const bt = () => document.querySelector('[data-adm="draft2client:em1"]');
    const avant = bt() ? bt().textContent.trim() : null;
    if (bt()) bt().click(); await new Promise((r) => setTimeout(r, 30));
    const arme = bt() ? bt().textContent.trim() : null; const ecritsArme = window.__ecrits.length;
    if (bt()) bt().click(); await new Promise((r) => setTimeout(r, 60));
    return { avant, arme, ecritsArme, ecrits: window.__ecrits, reste: (S.adminDrafts || []).length };
  });
  ok(a.avant === 'Passer en client', 'le bouton est sur la candidature (« ' + a.avant + ' »)');
  ok(/Confirmer/.test(a.arme || '') && a.ecritsArme === 0, 'premier toucher : il arme, rien n’est écrit');
  const e = a.ecrits[0] || {};
  ok(a.ecrits.length === 1 && e.r === 'users/em1' && e.d.role === 'client' && Object.keys(e.d).sort().join(',') === 'role,roleChange', 'second toucher : seule la fiche users/em1 change, rôle « client » + trace (' + JSON.stringify(e.d || {}) + ')');
  ok(a.reste === 0, 'elle quitte la liste des candidatures');

  const ouverture = async (role) => { const q = await page(); return q.evaluate(async (role) => {
    const cu = { uid: 'em1', email: 'emilie@gmail.com', displayName: 'emilie duhard', providerData: [{ providerId: 'google.com' }] };
    window.__setFB({ auth: { currentUser: cu }, a: {},
      f: { getDoc: (r) => Promise.resolve(/^users\//.test(r.path) ? { exists: () => true, data: () => ({ name: 'emilie duhard', email: 'emilie@gmail.com', role }) } : { exists: () => false, data: () => null }),
        doc: (_, c, id) => ({ path: c + '/' + id }), setDoc: () => Promise.resolve(), updateDoc: () => Promise.resolve(), onSnapshot: () => function () {},
        collection: () => ({}), query: () => ({}), where: () => ({}), serverTimestamp: () => 0, arrayUnion: () => ({}), arrayRemove: () => ({}) },
      db: {}, fn: { httpsCallable: () => () => Promise.resolve({ data: {} }) }, functions: {} });
    try { localStorage.removeItem('tiSignupIntent'); } catch (_) {}
    const S = window.__S; S.lang = 'fr'; S.onboarded = false; S.persona = 'client'; S.account = null;
    await window.__session(cu); return S.persona; }, role); };
  console.log('B — la prochaine ouverture de son app');
  const pb = await ouverture('client');
  ok(pb === 'client', 'espace client (' + pb + ')');
  console.log('C — contrôle : fiche restée « artisan »');
  const pc = await ouverture('artisan');
  ok(pc === 'pro', 'le dossier prestataire se rouvre (' + pc + ')');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
