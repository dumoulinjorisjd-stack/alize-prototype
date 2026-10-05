/* « JE REVIENS À LA MÊME PAGE SANS POUVOIR FINALISER LE DOSSIER. »

   Mot pour mot, d'un loueur de catamaran, le 05/10/2026 à 08:18 — après avoir corrigé
   son prix, donc APRÈS la cause qu'on lui avait trouvée. Il touchait « Enregistrer et
   continuer → » et se retrouvait sur l'écran qu'il venait de quitter, sans un mot.

   LE MÉCANISME TIENT À UNE SECONDE BOUCLE. `nextDraftStep` cherchait une étape à faire
   DEVANT ; n'en trouvant pas, elle repartait du début — et retombait sur l'étape
   COURANTE, quand c'est elle qui n'est pas finie. L'étape devenait la suite d'elle-même.

   ET L'ÉCRAN NE DISAIT RIEN. Le récapitulatif nomme les manques depuis toujours ; l'écran
   de l'étape, lui, se taisait — et c'est celui-là qu'on a sous les yeux quand on bute. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

// Son dossier : tout fait, sauf « Métiers & tarifs » (un métier du catalogue coché,
// grille sans réponse). C'est le seul état qui produisait la boucle.
const BLOQUE = { name: 'Nautylus Cata Loc', phone: '0690112233', siret: '12345678901234',
  address: 'Gustavia', birth: '1980-01-01', cats: ['autre', 'demenagement'],
  otherService: 'Location de catamaran avec skipper', otherPrice: '950', otherUnit: 'forfait',
  mandat: true, cgu: true, charte: true, insuranceDoc: true, authed: true, googleAuth: true };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1400 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__assur && window.__assur.suite, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — une étape n’est jamais la suite d’elle-même');
  const A = await p.evaluate((d) => {
    window.__S.proForm = Object.assign({}, d);
    const e = window.__assur.etapes(window.__S.proForm).map((x) => ({ id: x.id, fait: x.done }));
    return { etapes: e, depuisSvc: window.__assur.suite('svc'),
      // les trois autres étapes, pour vérifier qu'on n'a pas cassé l'enchaînement
      depuisId: window.__assur.suite('id'), depuisIns: window.__assur.suite('ins'),
      depuisAcc: window.__assur.suite('acc') };
  }, BLOQUE);
  ok(A.etapes.filter((x) => !x.fait).map((x) => x.id).join(',') === 'svc',
    'son dossier n’a bien qu’une étape en souffrance (' + JSON.stringify(A.etapes.filter((x) => !x.fait).map((x) => x.id)) + ')');
  ok(A.depuisSvc !== 'svc', 'et « continuer » ne renvoie plus sur elle (' + JSON.stringify(A.depuisSvc) + ')');
  ok(A.depuisSvc === null, 'il mène au récapitulatif, le seul écran qui nomme ce qui manque');
  ok(A.depuisId === 'svc' && A.depuisIns === 'svc' && A.depuisAcc === 'svc',
    'depuis les autres étapes, il mène toujours à celle qui reste (' + [A.depuisId, A.depuisIns, A.depuisAcc].join(', ') + ')');

  console.log('\nB — l’enchaînement normal n’a pas bougé');
  const B = await p.evaluate(() => {
    window.__S.proForm = { cats: [] };   // dossier vide : on avance pas à pas
    const v = {};
    ['id', 'ins', 'svc', 'acc'].forEach(function (e) { v[e] = window.__assur.suite(e); });
    return v;
  });
  ok(B.id === 'ins' && B.ins === 'svc' && B.svc === 'acc',
    'sur un dossier vide, chaque étape mène à la suivante (' + JSON.stringify(B) + ')');
  ok(B.acc === 'id', 'et la dernière revient à la première, qui reste à faire');

  console.log('\nC — ce qui manque est dit SUR l’étape, pas ailleurs');
  const C = await p.evaluate((d) => {
    const f2 = Object.assign({}, d);
    return { svc: window.__assur.manqueEtape('svc', f2),
      id: window.__assur.manqueEtape('id', f2),
      acc: window.__assur.manqueEtape('acc', f2) };
  }, BLOQUE);
  ok(C.svc.length === 1 && /grille/.test(C.svc[0]),
    'sur son étape, la raison est nommée (« ' + C.svc.join(' · ') + ' »)');
  ok(C.id.length === 0 && C.acc.length === 0, 'et les étapes faites ne reprochent rien');

  console.log('\nD — la liste et le verdict ne peuvent pas se contredire');
  // Le garde-fou : pour chaque état fabriqué, « rien ne manque » doit valoir
  // exactement « l'étape est faite ». Sans lui, les deux dériveraient en silence.
  const D = await p.evaluate((d) => {
    const bases = [
      {}, { cats: [] }, { cats: ['autre'] },
      { cats: ['autre'], otherService: 'X' }, { cats: ['autre'], otherService: 'X', otherPrice: '50' },
      { cats: ['menage'] }, { cats: ['menage'], acceptsGrille: true },
      { cats: ['menage'], desiredNet: { menage: 20 } },
      { cats: ['baby'], acceptsGrille: true }, { cats: ['baby'], acceptsGrille: true, diplomas: ['CAP'] },
      { cats: ['autre', 'menage'], otherService: 'X', otherPrice: '50', acceptsGrille: true },
      { name: 'Ab', phone: '0690112233', siret: '12345678901234', address: 'Gustavia', birth: '1980-01-01' },
      { name: 'A' }, { mandat: true }, { mandat: true, cgu: true }, { mandat: true, cgu: true, charte: true },
      { insuranceDoc: true }, { insuranceNone: true }, Object.assign({}, d),
    ];
    const ecarts = [];
    bases.forEach(function (b, i) {
      ['id', 'ins', 'svc', 'acc'].forEach(function (e) {
        const rien = window.__assur.manqueEtape(e, b).length === 0;
        const faite = !!window.__assur.faites(b)[e];
        if (rien !== faite) ecarts.push({ cas: i, etape: e, rienNeManque: rien, faite: faite });
      });
    });
    return { n: bases.length * 4, ecarts: ecarts };
  }, BLOQUE);
  ok(D.ecarts.length === 0,
    'sur ' + D.n + ' vérifications, aucune divergence (' + JSON.stringify(D.ecarts).slice(0, 160) + ')');

  console.log('\nE — dans l’écran réel : il clique, et il AVANCE');
  await p.evaluate((d) => {
    try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
    const S = window.__S;
    S.persona = 'pro'; S.onboarded = true; S.authView = null; S.guest = false;
    S.account = { name: 'Nautylus', email: 'n@e.fr', uid: 'u7', role: 'artisan' };
    S.proStatus = 'draft'; S.proStep = 'svc'; S.proForm = Object.assign({}, d);
    window.__render();
  }, BLOQUE);
  await p.waitForTimeout(400);
  const E1 = await p.evaluate(() => {
    const t = document.getElementById('stepMissing');
    return { vu: !!t && t.style.display !== 'none', txt: t ? t.textContent : '',
      bouton: (document.querySelector('#view [data-act="draft-save"]') || {}).textContent || '' };
  });
  ok(E1.vu && /grille/.test(E1.txt), 'avant même de cliquer, l’écran dit pourquoi (« ' + E1.txt.slice(0, 80) + '… »)');
  ok(!/continuer/i.test(E1.bouton), 'et le bouton ne promet plus de « continuer » (« ' + E1.bouton.trim() + ' »)');
  await p.evaluate(() => { document.querySelector('#view [data-act="draft-save"]').click(); });
  await p.waitForTimeout(450);
  const E2 = await p.evaluate(() => ({ etape: window.__S.proStep,
    recap: /étapes complétées/.test(document.getElementById('view').textContent || ''),
    dit: /Il reste à fournir/.test(document.getElementById('view').textContent || '') }));
  ok(E2.etape === null, 'le clic l’emmène AILLEURS (étape : ' + JSON.stringify(E2.etape) + ')');
  ok(E2.recap && E2.dit, 'au récapitulatif, qui liste ce qui manque');

  console.log('\nF — et le manque s’efface dès qu’il est comblé');
  await p.evaluate(() => { window.__S.proStep = 'svc'; window.__render(); });
  await p.waitForTimeout(350);
  const F1 = await p.evaluate(() => {
    const b = document.querySelector('#view [data-act="toggle-grille"]');
    if (b) b.click();
    return !!b;
  });
  await p.waitForTimeout(350);
  const F2 = await p.evaluate(() => {
    const t = document.getElementById('stepMissing');
    return { vu: !!t && t.style.display !== 'none', suite: window.__assur.suite('svc') };
  });
  ok(F1, 'la case de la grille est bien sur cette étape');
  ok(!F2.vu, 'une fois cochée, le reproche disparaît');
  ok(F2.suite === null, 'et il ne reste plus rien devant lui');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
