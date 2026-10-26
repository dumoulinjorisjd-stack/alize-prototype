/* « JE PEUX BIEN AVOIR LES FACTURES DE COMMISSION, MAIS POUR LES FACTURES DE
   PRESTATION QUAND JE CLIQUE DESSUS JE NE VISUALISE RIEN. »

   Le clic marchait, le découpage marchait, la facture était retrouvée. Ce qui
   manquait était `round2` : l'arrondi au centime était écrit CINQ FOIS en local, et
   `adminRembBloc` — le bloc « Rembourser le client », ajouté après — l'appelait sans
   l'avoir dans sa portée. Le document LEVAIT, et comme un écran se fabrique d'une
   seule traite, rien ne paraissait : on restait sur la liste, sans un mot.

   CE QUI SE MESURE ICI EST LA PROPRIÉTÉ, pas la présence d'une fonction : on clique
   pour de vrai, et le document doit paraître avec son numéro et son montant. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1300 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const scene = (mode) => p.evaluate((mode) => {
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'a@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.demoMode = false; S.persona = 'admin'; S.mission = null;
    S.account = { name: 'Admin', email: 'a@x.c', uid: 'adm', role: 'admin' };
    const AUJ = new Date().toISOString().slice(0, 10);
    const ent = function (invNo, base) { return { reqId: 'r-' + invNo, providerUid: 'pro1',
      providerName: 'Laureguyon', service: 'colis', serviceName: 'Colis & courrier',
      clientName: 'Joris', dateISO: AUJ, grossTotal: base, base: base, commissionPct: 15,
      commissionAmount: base * 0.15, netAmount: base * 0.85, invNo: invNo,
      mollieEncaisse: true, unit: 'f', hours: 0, rate: base }; };
    S.adminLedger = [ent('2026-A-0003', 7), ent('2026-0002', 7)];
    S.adminArtisans = [{ id: 'pro1', uid: 'pro1', name: 'Laureguyon', siret: '123', type: 'entreprise', history: [] }];
    S.admin = { view: 'fact', sel: null, fact: { art: 'pro1', mode: mode } };
    let leve = ''; try { window.__render(); } catch (e) { leve = e.message || String(e); }
    const v = document.getElementById('view');
    return { leve: leve,
      cartes: Array.from(v.querySelectorAll('[data-adm^="fact-doc"]')).map(function (e) { return e.getAttribute('data-adm'); }),
      doc: !!v.querySelector('#invoiceDoc'),
      txt: (v.textContent || '').replace(/\s+/g, ' ') };
  }, mode);

  const lire = () => p.evaluate(() => {
    const v = document.getElementById('view');
    return { fact: JSON.parse(JSON.stringify(window.__S.admin.fact || {})),
      doc: !!v.querySelector('#invoiceDoc'),
      txt: (v.textContent || '').replace(/\s+/g, ' ') };
  });

  console.log('A — la liste des factures de prestation');
  const A = await scene('mandat');
  ok(!A.leve, 'elle se dessine sans lever' + (A.leve ? ' (' + A.leve + ')' : ''));
  // ASSERTION ARRIÈRE : sans rangée cliquable, tout ce qui suit mesurerait le vide.
  ok(A.cartes.length === 2, 'elle porte bien les deux factures à ouvrir (' + A.cartes.length + ')');

  console.log('B — un clic ouvre LE DOCUMENT, c’est tout l’objet');
  await p.click('[data-adm="' + A.cartes[0] + '"]');
  await p.waitForTimeout(250);
  const B = await lire();
  ok(B.fact.mode === 'doc' && B.fact.inv === '2026-A-0003',
    'le clic est bien reçu et nomme la facture (' + JSON.stringify(B.fact) + ')');
  ok(B.doc, 'le document de facture est à l’écran');
  ok(/N° 2026-A-0003/.test(B.txt), 'il porte son numéro');
  ok(/7,00/.test(B.txt) && /Laureguyon/.test(B.txt), 'son montant et le prestataire');
  ok(/Rembourser le client|Intégralement remboursée/.test(B.txt),
    'et le bloc qui levait — « Rembourser le client » — est rendu');

  console.log('C — la facture de commission s’ouvre par la même porte');
  const C = await scene('comm');
  ok(!C.leve, 'elle se dessine sans lever' + (C.leve ? ' (' + C.leve + ')' : ''));
  ok(C.doc && /FACTURE DE COMMISSION/.test(C.txt), 'et son document paraît');

  console.log('D — un montant absent vaut zéro, il ne prend pas la page avec lui');
  const D = await p.evaluate(() => {
    const out = {};
    try { out.indefini = window.__round2 ? window.__round2(undefined) : 'ABSENT'; } catch (e) { out.indefini = 'LÈVE'; }
    try { out.nombre = window.__round2 ? window.__round2(7.0049) : 'ABSENT'; } catch (e) { out.nombre = 'LÈVE'; }
    return out;
  });
  if (D.indefini === 'ABSENT') console.log('  · (round2 non exposé au harnais, mesuré par le rendu ci-dessus)');
  else {
    ok(D.indefini === 0, 'une valeur absente rend 0 (' + D.indefini + ')');
    ok(D.nombre === 7, 'et les vraies sommes s’arrondissent comme avant (' + D.nombre + ')');
  }

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
