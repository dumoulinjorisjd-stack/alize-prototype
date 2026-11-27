/* « CHARGEMENT DES PRESTATAIRES… » NE TOURNE PLUS SANS FIN (app iPhone, 27/11/2026).
   L'échec de `listProviders` écrivait une liste vide sans redessiner : l'écran de commande
   restait sur « Chargement… » pour toujours.
   A. le serveur refuse : l'écran le dit, avec « Réessayer » ;
   B. « Réessayer » relance l'appel, et la liste arrive ;
   C. contrôle : un appel qui réussit affiche les prestataires, sans message d'erreur ;
   D. un visiteur sans session ne voit pas un « Chargement… » qui n'aboutirait jamais. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 1400 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__setFB);
  const ouvre = (mode, connecte) => p.evaluate(async ({ mode, connecte }) => {
    window.__appels = 0; window.__mode = mode;
    window.__setFB({ auth: { currentUser: connecte ? { uid: 'c1', email: 'c@x.c' } : null }, db: {},
      f: { doc: () => ({}), updateDoc: () => Promise.resolve(), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_, nom) => (d) => { if (nom !== 'listProviders') return new Promise(() => {}); window.__appels++;
        return window.__mode === 'refus' ? Promise.reject({ code: 'functions/unauthenticated' })
          : Promise.resolve({ data: { providers: [{ uid: 'p1', name: 'Maëlle Masseuse', alea: true, siteMode: 'domicile' }] } }); } }, functions: {} });
    document.body.classList.add('standalone'); try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = !connecte; S.demoMode = false; S.persona = 'client';
    S.account = connecte ? { name: 'Cécile', email: 'c@x.c', uid: 'c1' } : null; S._proDir = {};
    S.draft = window.__newMission({ id: 'massage', nm: 'Massage', rate: 110 }); window.__render();
    await new Promise((r) => setTimeout(r, 150));
    const v = document.getElementById('view'); return { txt: v.textContent.replace(/\s+/g, ' '), appels: window.__appels, retry: !!v.querySelector('[data-act="prodir-retry"]') };
  }, { mode, connecte });
  console.log('A — le serveur refuse');
  const a = await ouvre('refus', true);
  ok(a.appels === 1, 'l’annuaire est bien demandé (' + a.appels + ')');
  ok(!/Chargement des prestataires/.test(a.txt), 'plus de « Chargement… » une fois l’échec connu');
  ok(/Liste des prestataires indisponible pour le moment/.test(a.txt) && a.retry, 'l’écran le dit, avec « Réessayer »');
  console.log('B — Réessayer');
  const bb = await p.evaluate(async () => { window.__mode = 'ok'; document.querySelector('[data-act="prodir-retry"]').click(); await new Promise((r) => setTimeout(r, 150));
    const v = document.getElementById('view'); return { txt: v.textContent.replace(/\s+/g, ' '), appels: window.__appels }; });
  ok(bb.appels === 2 && /Maëlle Masseuse/.test(bb.txt) && !/indisponible/.test(bb.txt), 'l’appel repart et la prestataire paraît');
  console.log('C — contrôle : tout va bien');
  const c = await ouvre('ok', true);
  ok(/Maëlle Masseuse/.test(c.txt) && !/indisponible|Chargement des prestataires/.test(c.txt), 'la liste s’affiche, sans message');
  console.log('D — visiteur sans session');
  const d = await ouvre('ok', false);
  ok(d.appels === 0 && !/Chargement des prestataires/.test(d.txt), 'aucun appel, et aucun « Chargement… » qui n’aboutirait jamais');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
