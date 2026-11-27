/* REPRENDRE UNE COMMANDE EXPIRÉE À TORT (l'éditeur, 27/11/2026). Un ménage accepté puis
   fait a été passé en « expirée » par l'appli de la cliente (défaut corrigé en v950).
   A. le noyau (functions/reprise-commande.js) : reprend une expirée sans auteur avec un
      prestataire, à la fin RÉELLE du rendez-vous ; refuse tout le reste, motif à l'appui ;
   B. le délai de validation automatique part de la reprise, pas du jour du ménage ;
   C. le miroir de la console reconnaît les mêmes commandes, sur la même table ;
   D. la console : le repère corail, le geste en deux touchers, l'appel au serveur ; et la
      commande reste visible quel que soit son âge ;
   E. contrôle : une expirée « faute de preneur » garde sa ligne grise, sans geste. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const RP = require(path.join(RACINE, 'functions', 'reprise-commande.js'));
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const MAINT = Date.parse('2026-11-27T12:00:00-04:00');
const base = { status: 'expired', clientUid: 'c1', providerUid: 'karla', providerName: 'Karla Barbosa', clientName: 'Cécile', service: 'menage', dateISO: '2026-11-25', slot: '15:00', slotFlex: 0, duration: 4, unit: 'h' };
const CAS = [
  ['la commande de Cécile', base, true],
  ['expirée par le serveur', Object.assign({}, base, { expiredBy: 'auto' }), false],
  ['close depuis la console', Object.assign({}, base, { expiredBy: 'admin' }), false],
  ['sans prestataire', Object.assign({}, base, { providerUid: '' }), false],
  ['déjà encaissée', Object.assign({}, base, { mollieCaptured: true }), false],
  ['pas expirée', Object.assign({}, base, { status: 'accepted' }), false],
];
console.log('A — le noyau');
CAS.forEach(([nom, r, attendu]) => { const v = RP.repriseDecider(r, MAINT); ok(v.ok === attendu, nom + ' : ' + (v.ok ? 'reprise' : 'refus — ' + v.motif)); });
const v0 = RP.repriseDecider(base, MAINT);
ok(v0.finMs === Date.parse('2026-11-25T19:00:00-04:00'), 'fin de prestation = 25 nov., 15 h + 4 h, heure de Saint-Barth');
ok(!RP.repriseDecider(Object.assign({}, base, { dateISO: '2026-11-28' }), MAINT).ok, 'un rendez-vous pas encore passé : refus');
ok(!RP.repriseDecider(Object.assign({}, base, { dateISO: '' }), MAINT).ok, 'une date illisible : refus, rien n’est deviné');
console.log('B — le délai de validation');
const ms = (v) => Number(v) || 0;
ok(RP.debutValidationMs({ doneProAt: 100, validationDepuis: 900 }, ms) === 900, 'une commande reprise : le délai part de la reprise');
ok(RP.debutValidationMs({ doneProAt: 100 }, ms) === 100, 'une commande ordinaire : il part de la fin de prestation, comme avant');
const src = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
ok(/const depuis = REPRISE\.debutValidationMs\(r, ms\);/.test(src), 'autoValidate lit ce noyau');
ok(/exports\.adminReprendreCommande[\s\S]{0,700}email_verified !== true/.test(src), 'la porte serveur est réservée à l’administrateur vérifié');

(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 1400 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__aTort && window.__cmd);
  console.log('C — le miroir de la console');
  const miroir = await p.evaluate((cas) => cas.map((c) => window.__aTort(c[1])), CAS);
  ok(JSON.stringify(miroir) === JSON.stringify(CAS.map((c) => RP.expireeATort(c[1]))), 'même verdict sur chaque cas (' + miroir.join(', ') + ')');
  const proj = await p.evaluate((r) => window.__cmd.projette('rC', Object.assign({ expiredAt: Date.now() - 40 * 3600000 }, r)), base);
  ok(proj && proj.aTort === true, 'la fiche console porte le repère');

  console.log('D — la console');
  const ecran = (recs, clics) => p.evaluate(async ({ recs, clics }) => {
    window.__appels = [];
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {}, f: { doc: () => ({}), updateDoc: () => Promise.resolve(), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_, nom) => (d) => { window.__appels.push(nom + ':' + JSON.stringify(d)); return Promise.resolve({ data: { ok: true } }); } }, functions: {} });
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' };
    S.adminReqs = recs.map((r) => window.__cmd.projette(r.id, r)); S.adminReqsLus = true; S.admin = { view: 'home' }; S._fold = { 'a-bookings': true, 'a-cmd-arretees': true, 'cmd-ouvre-rA': true };
    window.__render();
    for (let i = 0; i < clics; i++) { const bt = document.querySelector('[data-adm^="reprise:"]'); if (bt) bt.click(); await new Promise((r) => setTimeout(r, 50)); }
    const v = document.getElementById('view'); const bt = v.querySelector('[data-adm^="reprise:"]');
    return { txt: v.textContent.replace(/\s+/g, ' '), bouton: bt ? bt.textContent.replace(/\s+/g, ' ').trim() : null, appels: window.__appels.slice() };
  }, { recs, clics });
  const vieille = Object.assign({ id: 'rC', expiredAt: Date.now() - 40 * 86400000 }, base);
  const d0 = await ecran([vieille], 0);
  ok(/Expirée par l’appli du client alors qu’acceptée par Karla Barbosa/.test(d0.txt), 'le repère corail nomme la prestataire');
  ok(d0.bouton === 'Reprendre : prestation faite', 'le geste est proposé (« ' + d0.bouton + ' »), même vieille de 40 jours');
  const d1 = await ecran([vieille], 1);
  ok(/Confirmer/.test(d1.bouton || '') && /validation automatique dans 48 h/.test(d1.txt) && !d1.appels.length, 'premier toucher : il arme et explique, rien n’est appelé');
  const d2 = await ecran([vieille], 2);
  ok(d2.appels.length === 1 && /^adminReprendreCommande:\{"reqId":"rC"\}$/.test(d2.appels[0]), 'second toucher : le serveur est appelé pour CETTE commande (' + d2.appels.join(' ') + ')');

  console.log('E — contrôle : faute de preneur');
  const auto = Object.assign({ id: 'rA', expiredAt: Date.now() - 3600000 }, base, { expiredBy: 'auto', providerUid: '', providerName: '' });
  const e = await ecran([auto], 0);
  ok(/Expirée faute de preneur/.test(e.txt) && e.bouton === null, 'ligne grise ordinaire, aucun geste de reprise');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
