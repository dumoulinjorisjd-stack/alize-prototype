/* « JE VOIS QUE LA MISSION EST ACCEPTÉE, MAIS JE NE PEUX PAS SAVOIR OÙ ELLE EN EST
   RÉELLEMENT » (l'éditeur, 24/11/2026), puis « oui 30 min et 24 h, on replie ».
   La carte d'une mission prise montre ses étapes et leur heure, ce qui vient ensuite,
   une alerte seulement quand il faut agir, et replie sa diffusion. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const regles = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');

console.log('A — le serveur horodate le démarrage, et personne d’autre');
const nc = fn.slice(fn.indexOf('exports.notifyClientStatus'), fn.indexOf('const clientUid = after.clientUid;', fn.indexOf('exports.notifyClientStatus')));
ok(/if \(aStatus === 'working'\) \{\s*try \{ await event\.data\.after\.ref\.update\(\{workingAt: FieldValue\.serverTimestamp\(\)\}\)/.test(nc), 'au passage à « working », le serveur écrit workingAt');
ok(/'doneProAt','workingAt'/.test(regles.slice(regles.indexOf('function serverKeys'), regles.indexOf('function serverKeys') + 6000)), 'doneProAt et workingAt sont réservés au serveur (serverKeys)');

(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2600 }, locale: 'fr-FR', timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  // Maintenant : mercredi 25 novembre 2026, 09:00 à Saint-Barth.
  const NOW = new Date('2026-11-25T13:00:00Z').getTime();
  await p.clock.install({ time: NOW });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  const H = 3600000;
  const carte = (req, ouvrir, diff) => p.evaluate(({ req, ouvrir, diff }) => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' }; S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminClients = []; S.adminArtsLoaded = true; S.adminClisLoaded = true;
    S.adminArtisans = [{ id: 'u1', uid: 'u1', real: true, name: 'Lydie Antoine', status: 'valide', cats: ['menage'], skipAt: {}, vueAt: {} },
      { id: 'u2', uid: 'u2', real: true, name: 'Karla Barbosa', status: 'valide', cats: ['menage'], skipAt: {}, vueAt: {} }];
    S.adminReqs = [Object.assign({ id: 'r1', uid: 'c1', at: Date.now() - 18 * 3600000, svc: 'menage', svcName: 'Ménage', when: '', slot: '08:00', acceptedSlot: '',
      zone: 'Cul-de-Sac · Toiny', total: 112, unit: 'h', duration: 4, client: 'Cécile', provider: 'Karla Barbosa', providerUid: 'u2', directed: false, boostEur: 0,
      diff: { motif: 'envoyee', cibles: 2, push: 1, mail: 1, at: Date.now() - 18 * 3600000 }, prevenus: ['u1', 'u2'], invites: [], canaux: { u1: 'push', u2: 'mail' },
      etapesAt: {}, complementStatus: '' }, req)];
    S.adminReqsLus = true; S.admin = { view: 'home' }; S._admCmdStat = { paid: true }; S._admCmdMet = { 'paid|menage': true };
    S._fold = Object.assign({ 'a-bookings': true, 'a-cmd-toutes': true }, ouvrir ? { 'cmd-ouvre-r1': true } : {}, diff ? { 'cmd-diff-r1': true } : {});
    window.__render();
    const c = document.querySelector('.cmd-carte'); if (!c) return null;
    const rr = c.getBoundingClientRect();
    return { txt: c.textContent.replace(/\s+/g, ' '), alerte: (c.querySelector('.banner.coral') || {}).textContent || '', bord: c.style.borderLeft || '',
      lignesRep: c.querySelectorAll('.cmd-rep').length, bouton: !!c.querySelector('[data-fold="cmd-diff-r1"]'),
      deborde: Math.max(...[...c.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - rr.right)) };
  }, { req, ouvrir, diff });

  console.log('B — acceptée, pour demain : où elle en est, ce qui vient');
  let r = await carte({ status: 'accepted', dateISO: '2026-11-26', etapesAt: { accepted: NOW - 18 * H } }, true);
  ok(/Acceptée/.test(r.txt) && /Démarrée/.test(r.txt) && /Terminée/.test(r.txt) && /Validée et réglée/.test(r.txt), 'les quatre étapes, une par ligne');
  ok(/Acceptée\s?mar\. 24 nov\. 15:00/.test(r.txt), 'avec l’heure de l’acceptation (mar. 24 nov. 15:00)');
  ok(/Démarrage prévu jeu\. 26 nov\. 08:00/.test(r.txt), 'et ce qui vient : « Démarrage prévu jeu. 26 nov. 08:00 »');
  ok(!r.alerte && !/coral/.test(r.bord), 'aucune alerte : rien à faire');
  ok(r.lignesRep === 0 && r.bouton, 'la diffusion est repliée derrière « Diffusion › »');
  r = await carte({ status: 'accepted', dateISO: '2026-11-26', etapesAt: { accepted: NOW - 18 * H } }, true, true);
  ok(r.lignesRep === 2, 'un toucher sur « Diffusion » la rouvre (' + r.lignesRep + ' lignes)');
  ok(r.deborde <= 0, 'à 393 px, rien ne déborde (' + Math.round(r.deborde) + ' px)');

  console.log('C — 30 min de retard au démarrage');
  r = await carte({ status: 'accepted', dateISO: '2026-11-25', slot: '08:40', etapesAt: { accepted: NOW - 18 * H } }, true);
  ok(!r.alerte, '20 min après l’heure : pas encore d’alerte');
  r = await carte({ status: 'accepted', dateISO: '2026-11-25', slot: '08:00', etapesAt: { accepted: NOW - 18 * H } }, false);
  ok(/Pas démarrée, 1 h après l’heure prévue/.test(r.alerte) && /coral/.test(r.bord), 'une heure après : l’alerte, même carte repliée (« ' + r.alerte.trim() + ' »)');
  r = await carte({ status: 'accepted', dateISO: '2026-11-25', slot: '', slotFlex: 'day', etapesAt: {} }, true);
  ok(!r.alerte && /Prévue/.test(r.txt), 'sans heure convenue, on ne devine pas de retard');

  console.log('D — démarrée, puis terminée et pas validée');
  r = await carte({ status: 'working', dateISO: '2026-11-25', etapesAt: { accepted: NOW - 18 * H, working: NOW - 55 * 60000 } }, true);
  ok(/Démarrée\s?aujourd’hui 08:05/.test(r.txt) && /En cours/.test(r.txt) && !r.alerte, 'démarrée à 08:05, en cours');
  r = await carte({ status: 'done_pro', dateISO: '2026-11-24', etapesAt: { accepted: NOW - 40 * H, working: NOW - 30 * H, done_pro: NOW - 23 * H } }, true);
  ok(!r.alerte && /En attente de la validation du client/.test(r.txt), 'terminée depuis 23 h : on attend, sans alerte');
  r = await carte({ status: 'done_pro', dateISO: '2026-11-24', etapesAt: { accepted: NOW - 40 * H, working: NOW - 30 * H, done_pro: NOW - 25 * H } }, false);
  ok(/Terminée depuis 25 h, pas validée par le client/.test(r.alerte), 'depuis 25 h : l’alerte (« ' + r.alerte.trim() + ' »)');
  r = await carte({ status: 'done_pro', dateISO: '2026-11-20', etapesAt: {} }, true);
  ok(!r.alerte, 'sans heure de fin connue (ancienne mission), on ne devine rien');

  console.log('E — paiement en échec, et la carte d’une demande qui cherche encore');
  r = await carte({ status: 'paid', dateISO: '2026-11-24', complementStatus: 'echec', etapesAt: { paid: NOW - 2 * H } }, false);
  ok(/Paiement du supplément en échec/.test(r.alerte), 'le supplément en échec se signale');
  r = await carte({ status: 'pending', provider: '', providerUid: '', dateISO: '2026-11-26' }, true);
  ok(!/Démarrage prévu|Validée et réglée/.test(r.txt) && r.lignesRep === 2 && !r.bouton, 'une demande qui cherche garde sa diffusion sous les yeux, sans étapes');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
