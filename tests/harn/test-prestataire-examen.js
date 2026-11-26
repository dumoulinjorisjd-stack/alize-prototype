/* LE PRESTATAIRE D'EXAMEN NE TOUCHE À AUCUN VRAI CLIENT (relevé le 26/11/2026, audit
   App Store). Le compte prestataire de démonstration voyait les vraies demandes du
   moment : l'examinateur pouvait en accepter une, et un vrai client recevait un faux
   prestataire. Désormais :
     · il ne voit qu'une demande d'exemple, jamais une vraie ;
     · l'accepter n'écrit rien (ni transaction, ni écriture Firestore) ;
     · la conversation s'ouvre, avec « Signaler » et « Bloquer » ;
     · un vrai prestataire voit toujours les vraies demandes. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2200 }, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  const pro = (email) => p.evaluate((email) => {
    window.__ecritures = 0;
    const compte = () => { window.__ecritures++; return Promise.resolve(); };
    window.__setFB({ auth: { currentUser: { uid: 'u0', email } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), setDoc: compte, updateDoc: compte, addDoc: compte, runTransaction: () => { window.__ecritures++; return Promise.resolve(); },
        getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => { window.__ecritures++; return new Promise(() => {}); } }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro'; S.proStatus = 'valide';
    S.proName = 'Laure'; S.proLegal = 'Laure G.'; S.proCats = ['menage']; S.account = { name: 'Laure', email, uid: 'u0', role: 'pro' };
    S.proNav = 'home'; S.mission = null; S.proReqView = null; S.proMissions = []; S._examenAccepte = false; S.chat = false;
    window.__examenForce = true;
  }, email);
  const vraie = [{ id: 'R-VRAIE', status: 'pending', service: 'menage', serviceName: 'Ménage', clientUid: 'c-reel', clientName: 'Cliente réelle', dateISO: '2026-12-01', when: 'Lundi', slot: '10:00', zone: 'Lorient', unit: 'h', duration: 2, rate: 30, total: 60 }];

  console.log('A — il ne voit qu’une demande d’exemple');
  await pro('demo.prestataire@ti-services.fr');
  let v = await p.evaluate((brut) => window.__demandesVisibles(brut).map((r) => r.id), vraie);
  ok(v.length === 1 && v[0] === 'examen-1', 'demande d’exemple seule, la vraie demande n’apparaît pas (' + v.join(',') + ')');
  await pro('demo.artisan@ti-services.fr');
  v = await p.evaluate((brut) => window.__demandesVisibles(brut).map((r) => r.id), vraie);
  ok(v.join() === 'examen-1', 'même chose avec l’autre adresse de démonstration');

  console.log('B — l’accepter n’écrit rien, et la conversation s’ouvre');
  const r = await p.evaluate(async (brut) => {
    const S = window.__S; S.openRequests = window.__demandesVisibles(brut); S.proReqView = 'examen-1'; window.__render();
    const bt = document.querySelector('[data-act="accept-req:examen-1"]'); if (!bt) return { bouton: false };
    bt.click(); await new Promise((z) => setTimeout(z, 50));
    const m = S.mission; S.chat = true; window.__render();
    const racine = document.querySelector('.phone') || document.body;
    return { bouton: true, statut: m && m.status, reqId: m && m.reqId, examen: !!(m && m._demoExamen), ecritures: window.__ecritures, restantes: (S.openRequests || []).length,
      signaler: !!racine.querySelector('[data-act="report-open"]'), bloquer: !!racine.querySelector('[data-act="block-ask"]'), messages: ((m && m.chat) || []).length };
  }, vraie);
  ok(r.bouton, 'la fiche de la demande d’exemple porte « Accepter »');
  ok(r.statut === 'accepted' && r.examen && !r.reqId, 'mission acceptée, marquée « examen », sans identifiant de demande');
  ok(r.ecritures === 0, 'aucune écriture : ni transaction, ni Firestore, ni serveur (' + r.ecritures + ')');
  ok(r.restantes === 0, 'la demande d’exemple quitte la liste');
  ok(r.messages > 0 && r.signaler && r.bloquer, 'la conversation s’ouvre, avec « Signaler » et « Bloquer »');

  console.log('C — un vrai prestataire voit les vraies demandes');
  await pro('laure.vraie@exemple.fr');
  v = await p.evaluate((brut) => window.__demandesVisibles(brut).map((x) => x.id), vraie);
  ok(v.join() === 'R-VRAIE', 'vrai compte : la vraie demande, pas d’exemple');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
