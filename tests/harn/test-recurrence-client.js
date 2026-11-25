/* SES RÉCURRENTES, DANS RÉSERVATIONS (l'éditeur, 25/11/2026) : pause, reprise,
   suppression, et « proposer à quelqu'un d'autre » pour un passage décliné. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2600 }, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-25T14:00:00Z') });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  const ouvrir = (lang) => p.evaluate((lang) => {
    window.__ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'c1', email: 'l@e.fr' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), updateDoc: (ref, patch) => { window.__ecrits.push({ ref: ref.path, patch }); return Promise.resolve(); }, setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = lang || 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.mission = null; S.draft = null;
    S.account = { name: 'Laure', email: 'l@e.fr', uid: 'c1', role: 'client' };
    S.series = { S1: { id: 'S1', recurrence: { rythme: 'semaine', jours: [3, 6], debut: '2026-11-25' }, serieEtat: 'active', svc: 'menage', svcName: 'Ménage', providerName: 'Karla Barbosa', slot: '08:00', status: 'paid' } };
    const mk = (id, dateISO, status) => Object.assign(window.__newMission(window.__svc.trouve('menage')), { _id: 'm' + id, reqId: id, serieId: 'S1', status, dateISO, when: '', slot: '08:00', providerUid: status === 'declined' ? null : 'u0' });
    S.missions = [mk('S1-2026-12-02', '2026-12-02', 'accepted'), mk('S1-2026-12-05', '2026-12-05', 'declined')];
    S.clientNav = 'wallet'; window.__render();
  }, lang);
  const lire = () => p.evaluate(() => { const v = document.getElementById('view'); return { t: v.textContent.replace(/\s+/g, ' '), e: window.__ecrits.slice(), serie: (window.__S.series || {}).S1 ? window.__S.series.S1.serieEtat : null }; });
  const clic = (sel) => p.evaluate((sel) => { const x = document.querySelector(sel); if (x) x.click(); return !!x; }, sel);

  console.log('A — la carte de la série');
  await ouvrir(); let r = await lire();
  ok(/Récurrentes · 1/.test(r.t) && /Ménage\s?Chaque semaine/.test(r.t) && /Me · Sa · 08:00 · Karla Barbosa/.test(r.t), 'le rythme, les jours, l’heure et la prestataire');
  ok(/Prochain passage : mer\. 2 déc\./.test(r.t), 'le prochain passage');
  ok(/Karla ne peut pas venir le sam\. 5 déc\./.test(r.t) && /Proposer à quelqu’un d’autre/.test(r.t), 'le passage décliné se signale, avec « Proposer à quelqu’un d’autre »');

  console.log('B — pause, reprise');
  await clic('[data-act="serie-pause:S1"]'); r = await lire();
  ok(r.e.some((x) => x.ref === 'requests/S1' && x.patch.serieEtat === 'pause') && /En pause/.test(r.t) && /Reprendre/.test(r.t), 'pause : écrite sur la commande d’origine, la carte le dit et propose de reprendre');
  await clic('[data-act="serie-reprendre:S1"]'); r = await lire();
  ok(r.e.some((x) => x.ref === 'requests/S1' && x.patch.serieEtat === 'active') && /Mettre en pause/.test(r.t), 'reprise');

  console.log('C — supprimer, en deux touchers');
  const avant = r.e.length;
  await clic('[data-act="serie-suppr:S1"]'); r = await lire();
  ok(r.e.length === avant && /Confirmer la suppression/.test(r.t), 'premier toucher : il demande confirmation, rien n’est écrit');
  await clic('[data-act="serie-suppr:S1"]'); r = await lire();
  ok(r.e.some((x) => x.ref === 'requests/S1' && x.patch.serieEtat === 'supprimee') && !/Récurrentes/.test(r.t), 'second toucher : supprimée, la carte disparaît');

  console.log('D — proposer le passage décliné à quelqu’un d’autre');
  await ouvrir(); await clic('[data-act="serie-proposer:S1-2026-12-05"]'); r = await lire();
  const w = r.e.find((x) => x.ref === 'requests/S1-2026-12-05') || {};
  ok(w.patch && w.patch.status === 'pending' && w.patch.directed === false, 'le passage s’ouvre à tous, les suivants restent à Karla');

  console.log('E — en anglais, et ce que lit l’écran');
  await ouvrir('en'); r = await lire();
  ok(!/Récurrentes|Chaque semaine|Prochain passage|ne peut pas venir|Proposer à quelqu|Mettre en pause|Supprimer/.test(r.t), 'EN : plus rien de français dans la carte');
  ok(/if\(r\.recurrence&&r\.recurrence\.rythme&&\(r\.serieEtat==='active'\|\|r\.serieEtat==='pause'\)\)series\[docu\.id\]=/.test(app) && /S\.series=series;/.test(app),
    'les séries se relisent à chaque instantané, même quand la commande d’origine est réglée');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
