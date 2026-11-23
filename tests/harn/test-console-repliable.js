/* « IL FAUT POUVOIR REPLIER CES CARTES » et « QUAND JE CLIQUE SUR "COMMISSION CE MOIS"
   IL NE SE PASSE RIEN » (l'éditeur, 23/11/2026). La carte d'une commande se replie en
   touchant son en-tête et garde son résumé ; la tuile de la commission ouvre Factures. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = { headless: true };
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 393, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);

  console.log('A — la carte d’une commande se replie et se déplie');
  const r = await p.evaluate(async () => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' }; S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminClients = []; S.adminArtsLoaded = true; S.adminClisLoaded = true;
    const art = (id, name) => ({ id, uid: id, real: true, name, status: 'valide', cats: ['menage'], phone: '0690 11 22 33', skipAt: {}, vueAt: {} });
    S.adminArtisans = [art('u1', 'Lydie Antoine'), art('u2', 'Karla Barbosa')];
    S.adminReqs = [{ id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 120000, svc: 'menage', svcName: 'Ménage', when: 'Demain', slot: '09:00',
      zone: 'Toiny', total: 112, unit: 'h', duration: 4, client: 'Cécile', provider: '', providerUid: '', directed: false, boostEur: 0,
      diff: { motif: 'envoyee', cibles: 2, push: 1, mail: 1, at: Date.now() - 120000 }, prevenus: ['u1', 'u2'], invites: [], canaux: { u1: 'push', u2: 'mail' } }];
    S.adminReqsLus = true; S.admin = { view: 'home' }; S._fold = { 'a-bookings': true };
    window.__render();
    const carte = () => document.querySelector('.cmd-carte');
    const etat = () => { const c = carte(); return c ? { pliee: c.classList.contains('pliee'), lignes: c.querySelectorAll('.cmd-rep').length,
      court: (c.querySelector('.cmd-reponses-court') || {}).textContent || '', clore: !!c.querySelector('[data-adm^="cmd-clore"], [data-adm^="clore"]') || /Clore/.test(c.textContent),
      montant: /112,00/.test(c.textContent), qui: /Cécile/.test(c.textContent), haut: Math.round(c.getBoundingClientRect().height),
      deborde: Math.max(...[...c.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - c.getBoundingClientRect().right)) } : null; };
    const avant = etat();
    const tete = () => document.querySelector('.cmd-carte .cmd-tete');
    if (!tete()) return { avant, pliee: null, apres: null };
    tete().click(); await new Promise((r) => setTimeout(r, 40));
    const pliee = etat();
    if (tete()) tete().click(); await new Promise((r) => setTimeout(r, 40));
    const apres = etat();
    return { avant, pliee, apres };
  });
  ok(!!r.pliee && r.avant && !r.avant.pliee && r.avant.lignes === 2, 'dépliée par défaut : rien ne disparaît sans geste');
  ok(r.pliee && r.pliee.pliee && r.pliee.lignes === 0 && !r.pliee.clore, 'un toucher sur l’en-tête la replie : la liste et les boutons disparaissent');
  ok(r.pliee && r.pliee.qui && r.pliee.montant && /Réponses\s:\s2 sans réponse dont 1 par e-mail seulement/.test(r.pliee.court),
    'repliée, elle garde qui, combien et le résumé des réponses (« ' + (r.pliee && r.pliee.court) + ' »)');
  ok(r.pliee && r.avant && r.pliee.haut < r.avant.haut / 2, 'elle prend moins de la moitié de la hauteur (' + (r.pliee && r.pliee.haut) + ' contre ' + (r.avant && r.avant.haut) + ' px)');
  ok(r.pliee && r.pliee.deborde <= 0, 'à 393 px, rien ne sort du cadre (' + (r.pliee && Math.round(r.pliee.deborde)) + ' px)');
  ok(r.apres && !r.apres.pliee && r.apres.lignes === 2, 'un second toucher la déplie');

  console.log('B — « Commission ce mois » ouvre Factures');
  const c = await p.evaluate(async () => {
    const S = window.__S; S.admin = { view: 'home' }; window.__render();
    const t = [...document.querySelectorAll('[data-adm="fact"]')].find((e) => /Commission ce mois/.test(e.textContent));
    if (!t) return { bouton: false };
    const tag = t.tagName;
    t.click(); await new Promise((r) => setTimeout(r, 40));
    return { bouton: true, tag, vue: S.admin.view };
  });
  ok(c.bouton && c.tag === 'BUTTON', 'la tuile est un bouton');
  ok(c.vue === 'fact', 'un toucher ouvre l’onglet Factures (' + c.vue + ')');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 140) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
