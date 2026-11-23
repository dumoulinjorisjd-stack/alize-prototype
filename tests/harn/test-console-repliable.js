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
    // D'office (l'éditeur, 23/11/2026 : « il faut que ce soit replié automatiquement »).
    const pliee = etat();
    const tete = () => document.querySelector('.cmd-carte .cmd-tete');
    if (!tete()) return { pliee, ouverte: null, apres: null };
    tete().click(); await new Promise((r) => setTimeout(r, 40));
    const ouverte = etat();
    if (tete()) tete().click(); await new Promise((r) => setTimeout(r, 40));
    const apres = etat();
    return { pliee, ouverte, apres };
  });
  ok(r.pliee && r.pliee.pliee && r.pliee.lignes === 0 && !r.pliee.clore, 'repliée d’office : ni la liste ni les boutons');
  ok(r.ouverte && !r.ouverte.pliee && r.ouverte.lignes === 2, 'un toucher sur l’en-tête la déplie : tout y est');
  ok(r.pliee && r.pliee.qui && r.pliee.montant && /Réponses\s:\s2 sans réponse dont 1 par e-mail seulement/.test(r.pliee.court),
    'repliée, elle garde qui, combien et le résumé des réponses (« ' + (r.pliee && r.pliee.court) + ' »)');
  ok(r.pliee && r.ouverte && r.pliee.haut < r.ouverte.haut / 2, 'repliée, elle prend moins de la moitié de la hauteur (' + (r.pliee && r.pliee.haut) + ' contre ' + (r.ouverte && r.ouverte.haut) + ' px)');
  ok(r.pliee && r.pliee.deborde <= 0, 'à 393 px, rien ne sort du cadre (' + (r.pliee && Math.round(r.pliee.deborde)) + ' px)');
  ok(r.apres && r.apres.pliee && r.apres.lignes === 0, 'un second toucher la replie');

  console.log('A ter — repliée, une carte garde son ALERTE (personne prévenu)');
  const al = await p.evaluate(() => {
    const S = window.__S;
    S.adminReqs = [Object.assign({}, S.adminReqs[0], { id: 'r9', diff: { motif: 'aucun-disponible', cibles: 0, push: 0, mail: 0, at: Date.now() }, prevenus: [], canaux: {} })];
    S._fold = { 'a-bookings': true }; window.__render();
    const c = document.querySelector('.cmd-carte'); return { pliee: !!(c && c.classList.contains('pliee')), txt: c ? c.textContent.replace(/\s+/g, ' ') : '' };
  });
  ok(al.pliee && /Personne prévenu/.test(al.txt), 'repliée, elle dit encore que personne n’a été prévenu (« ' + al.txt.slice(0, 120) + ' »)');
  const ok2 = await p.evaluate(() => { const S = window.__S;
    S.adminReqs = [Object.assign({}, S.adminReqs[0], { id: 'r8', diff: { motif: 'envoyee', cibles: 2, push: 1, mail: 1, at: Date.now() } })];
    window.__render(); const c = document.querySelector('.cmd-carte'); return c ? c.textContent : ''; });
  ok(!/prestataires prévenus/.test(ok2), 'mais la ligne de succès (« 2 prestataires prévenus ») attend qu’on la déplie');

  console.log('A bis — « Arrêtées récemment » est une carte, repliée d’office');
  const a = await p.evaluate(async () => {
    const S = window.__S; const now = Date.now();
    S.adminReqs = S.adminReqs.concat([
      { id: 'x1', status: 'cancelled', uid: 'c2', at: now - 7200000, fin: now - 3600000, svc: 'menage', svcName: 'Ménage', when: 'Demain', zone: 'Gustavia', total: 56, client: 'Dinane', provider: '', providerUid: '' },
      { id: 'x2', status: 'expired', uid: 'c3', at: now - 9000000, fin: now - 5000000, svc: 'menage', svcName: 'Ménage', when: 'Hier', zone: 'Toiny', total: 112, client: 'Cécile', provider: '', providerUid: '' }]);
    S._fold = { 'a-bookings': true }; window.__render();
    const tete = document.querySelector('[data-fold="a-cmd-arretees"]');
    const carte = tete ? tete.closest('.foldc') : null;
    const ferme = { existe: !!carte, txt: carte ? carte.textContent.replace(/\s+/g, ' ') : '', lignes: carte ? carte.querySelectorAll('.cmd-carte').length : -1,
      dansLaCarteVive: !!document.querySelector('.cmd-carte .cmd-tete') };
    if (tete) { tete.click(); await new Promise((r) => setTimeout(r, 40)); }
    const c2 = document.querySelector('[data-fold="a-cmd-arretees"]');
    const ouvert = c2 ? c2.closest('.foldc').querySelectorAll('.cmd-carte').length : -1;
    return { ferme, ouvert };
  });
  ok(a.ferme.existe && a.ferme.lignes === 0 && /Arrêtées récemment/.test(a.ferme.txt) && /2 commandes annulées ou expirées/.test(a.ferme.txt),
    'repliée, elle dit combien et quoi (« ' + a.ferme.txt.slice(0, 80) + ' »)');
  ok(a.ouvert === 2, 'dépliée, elle montre ses deux commandes, chacune repliée à son tour (' + a.ouvert + ')');

  console.log('A quater — l’heure convenue d’une demande « à tout moment de la journée »');
  const hc = await p.evaluate(() => {
    if (!(window.__cmd && window.__cmd.projette)) return { expose: false };
    const S = window.__S; const base = { clientUid: 'c1', service: 'menage', serviceName: 'Ménage', when: 'mer. 25 nov.', slot: '', zone: 'Toiny', total: 112, clientName: 'Cécile' };
    const acc = window.__cmd.projette('h1', Object.assign({}, base, { status: 'accepted', slotFlex: 'day', acceptedSlot: '10:30', providerName: 'Karla Barbosa', providerUid: 'u2' }));
    const att = window.__cmd.projette('h2', Object.assign({}, base, { status: 'pending', slotFlex: 'day' }));
    const sale = window.__cmd.projette('h3', Object.assign({}, base, { status: 'accepted', slotFlex: '<b>x</b>', acceptedSlot: '<img src=x>' }));
    S.adminReqs = [acc, att]; S._fold = { 'a-bookings': true }; window.__render();
    const t = [...document.querySelectorAll('.cmd-carte')].map((c) => c.textContent.replace(/\s+/g, ' '));
    return { expose: true, acc: t.find((x) => /Karla/.test(x)) || '', att: t.find((x) => !/Karla/.test(x)) || '', sale: [sale.acceptedSlot, sale.slotFlex] };
  });
  ok(hc.expose && /mer\. 25 nov\. · 10:30/.test(hc.acc), 'acceptée : la console montre l’heure choisie par le prestataire (« ' + (hc.acc || '').slice(0, 70) + ' »)');
  ok(hc.expose && /à tout moment de la journée/.test(hc.att), 'en recherche : elle dit « à tout moment de la journée »');
  ok(hc.expose && hc.sale[0] === '' && hc.sale[1] === 0, 'une valeur qui n’est pas une heure ou une souplesse connue ne passe pas');

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
