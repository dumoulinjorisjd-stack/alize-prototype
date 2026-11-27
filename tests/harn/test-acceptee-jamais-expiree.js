/* UNE COMMANDE ACCEPTÉE N'EXPIRE JAMAIS PAR LE TÉLÉPHONE DU CLIENT (27/11/2026).
   Un ménage accepté puis FAIT, mais sans « Démarrer » ni « Terminer » touchés, a été passé
   en « expirée » par l'app de la cliente douze heures après le créneau : l'empreinte a
   été libérée, la prestataire n'a pas été payée. Le serveur n'expire que les demandes
   sans preneur ; le téléphone doit suivre la même règle.
   A. acceptée, créneau passé de deux jours : elle reste, rien n'est écrit ;
   B. démarrée (working), idem ;
   C. contrôle : une demande SANS preneur, créneau passé, est bien retirée et marquée expirée. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 900 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__passe && window.__setFB);
  const essai = (statut) => p.evaluate((statut) => {
    window.__ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'cli1', email: 'c@x.c' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), updateDoc: (r, d) => { window.__ecrits.push({ r: r.path, d }); return Promise.resolve(); },
        setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client';
    S.account = { name: 'Cécile', email: 'c@x.c', uid: 'cli1', role: 'client' };
    const d = new Date(Date.now() - 2 * 86400000); const iso = d.toISOString().slice(0, 10);
    const m = Object.assign(window.__newMission({ id: 'menage', nm: 'Ménage', rate: 28 }), { reqId: 'r1', _id: 'm1', status: statut, dateISO: iso, slot: '15:00', slotFlex: 0, duration: 4, zone: 'Toiny',
      provider: statut === 'pending' ? null : { nm: 'Karla', uid: 'p1' } });
    S.missions = [m];
    const perimee = window.__passe.perimee(m);
    window.__passe.purge();
    return { perimee, reste: (S.missions || []).length, ecrits: window.__ecrits.map((x) => x.r + ':' + (x.d && x.d.status)) };
  }, statut);
  console.log('A — acceptée, créneau passé de deux jours');
  const a = await essai('accepted');
  ok(a.reste === 1, 'la commande reste dans la liste du client');
  ok(!a.ecrits.length, 'rien n’est écrit au serveur (' + (a.ecrits.join(', ') || 'aucune écriture') + ')');
  console.log('B — démarrée');
  const w = await essai('working');
  ok(w.reste === 1 && !w.ecrits.length, 'elle reste, rien n’est écrit');
  console.log('C — contrôle : sans preneur');
  const c = await essai('pending');
  ok(c.perimee, 'la demande sans preneur est bien jugée périmée (sinon ce contrôle ne prouve rien)');
  ok(c.reste === 0 && c.ecrits.indexOf('requests/r1:expired') >= 0, 'elle est retirée et marquée expirée (' + c.ecrits.join(', ') + ')');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
