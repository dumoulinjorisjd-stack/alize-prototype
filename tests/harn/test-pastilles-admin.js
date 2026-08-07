/* LES PASTILLES « DU NOUVEAU » QUI MENTAIENT.
   Vu en production (capture d'écran de l'admin) : la carte « Réservations en cours »
   affichait la pastille rouge alors qu'elle était VIDE (« Aucune réservation en
   cours », compteur 0) — et rien ne pouvait l'éteindre puisqu'il n'y avait rien à
   consulter. Cause : « nouveau » voulait dire « jamais ouvert depuis la pose du
   marqueur », donc TOUT l'existant (vieilles conversations réglées, comptes validés
   de longue date) s'allumait à jamais. La bonne sémantique : une pastille signale
   quelque chose qui DEMANDE une action, et s'éteint quand on l'a regardé. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 420, height: 900}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.body.classList.add('standalone'); });

  // La logique pure, via le pont du harnais (window.__adm).
  const evalNew = (fn, arg) => p.evaluate(([fn, arg]) => window.__adm[fn](arg), [fn, arg]);

  console.log('A — le scénario de la capture : du VIEUX ne s’allume pas');
  await p.evaluate(() => localStorage.removeItem('tiAdmSeen'));
  ok(!(await evalNew('thNew', {reqId: 'r-old-1', status: 'paid'})),
    'une conversation d’une mission RÉGLÉE jamais « consultée » n’est PAS nouvelle');
  ok(!(await evalNew('thNew', {reqId: 'r-old-2', status: 'rated'})),
    'idem pour une mission terminée/notée');
  ok(!(await evalNew('thNew', {reqId: 'r-old-3', status: 'cancelled'})),
    'idem pour une mission annulée');
  ok(!(await evalNew('artNew', {id: 'a-old', status: 'valide', pendingCats: [], insuranceStatus: 'ok'})),
    'un artisan validé de longue date, sans rien à traiter : pas de pastille');
  ok(!(await evalNew('cliNew', {id: 'c-old', status: 'valide'})),
    'un client validé de longue date : pas de pastille');

  console.log('B — ce qui demande une action s’allume bien');
  ok(await evalNew('thNew', {reqId: 'r-live', status: 'pending'}),
    'une demande en recherche d’artisan est nouvelle');
  ok(await evalNew('thNew', {reqId: 'r-live2', status: 'working'}),
    'une mission en cours jamais consultée est nouvelle');
  ok(await evalNew('artNew', {id: 'a-new', status: 'attente', pendingCats: [], insuranceStatus: 'ok'}),
    'un artisan en attente de validation est nouveau');
  ok(await evalNew('artNew', {id: 'a-cat', status: 'valide', pendingCats: ['plomberie'], insuranceStatus: 'ok'}),
    'un métier demandé rallume la pastille de l’artisan');
  ok(await evalNew('cliNew', {id: 'c-new', status: 'attente'}),
    'un client en attente de validation est nouveau');

  console.log('C — et s’éteint une fois consulté (sans revenir)');
  await p.evaluate(() => {
    window.__adm.seen('req:r-live', '1');
    const a = {id: 'a-new', status: 'attente', pendingCats: [], insuranceStatus: 'ok'};
    window.__adm.seen('art:a-new', window.__adm.artSig(a));
    window.__adm.seen('cli:c-new', window.__adm.cliSig({id: 'c-new', status: 'attente'}));
  });
  ok(!(await evalNew('thNew', {reqId: 'r-live', status: 'pending'})), 'demande consultée : éteinte');
  ok(!(await evalNew('artNew', {id: 'a-new', status: 'attente', pendingCats: [], insuranceStatus: 'ok'})), 'artisan consulté : éteint');
  ok(!(await evalNew('cliNew', {id: 'c-new', status: 'attente'})), 'client consulté : éteint');
  ok(await evalNew('artNew', {id: 'a-new', status: 'attente', pendingCats: ['peinture'], insuranceStatus: 'ok'}),
    'mais un NOUVEL événement (métier demandé) rallume la pastille');

  console.log('D — la carte « Réservations en cours » vide n’a PLUS de pastille (rendu réel)');
  await p.evaluate(() => {
    localStorage.removeItem('tiAdmSeen');
    const S = window.__S;
    S.persona = 'admin'; S.admin = {view: 'home', sel: null};
    S.demoMode = false; S.mission = null;
    S.adminBookings = []; // en réel, rien « en cours »
    // …mais de vieilles conversations réglées traînent dans la messagerie (la capture).
    S.adminThreads = [
      {reqId: 'old-A', status: 'paid', svcName: 'Ménage', chat: [], support: {client: [], pro: []}, ts: 1},
      {reqId: 'old-B', status: 'rated', svcName: 'Jardin', chat: [], support: {client: [], pro: []}, ts: 2}
    ];
    S.adminArtisans = []; S.adminClients = [];
    window.__render();
  });
  await p.waitForTimeout(300);
  const dotsSurBookings = await p.evaluate(() =>
    document.querySelectorAll('[data-fold="a-bookings"] .admdot').length);
  ok(dotsSurBookings === 0, 'aucune pastille sur l’en-tête de la carte vide');
  const badge = await p.evaluate(() => window.__adm.count());
  ok(badge === 0, 'le compteur de la barre de navigation retombe à 0 (avant : 2 fantômes)');

  console.log('E — avec une vraie demande active, la carte se marque puis s’éteint');
  await p.evaluate(() => {
    const S = window.__S;
    S.adminThreads.push({reqId: 'live-1', status: 'pending', svcName: 'Plomberie', chat: [], support: {client: [], pro: []}, ts: 3});
    window.__render();
  });
  await p.waitForTimeout(250);
  ok((await p.evaluate(() => document.querySelectorAll('[data-fold="a-bookings"] .admdot').length)) === 1,
    'la carte porte la pastille pour la demande active');
  await p.evaluate(() => { window.__adm.seen('req:live-1', '1'); window.__render(); });
  await p.waitForTimeout(250);
  ok((await p.evaluate(() => document.querySelectorAll('[data-fold="a-bookings"] .admdot').length)) === 0,
    'consultée (supervision ouverte), la pastille de la carte s’éteint');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');

  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
