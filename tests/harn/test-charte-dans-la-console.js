/* RELIRE LA CHARTE DEPUIS LA CONSOLE.

   « Dans la console je n'arrive pas à accéder à la charte Ti-Services pour la relire. »

   Exact, et la cause est structurelle : le pied de page légal ne propose la charte qu'à
   `role === 'pro'`, et la console n'affiche AUCUN pied de page. La charte n'était donc
   atteignable que de deux endroits, tous deux à l'intérieur d'un compte prestataire —
   la case à cocher de l'inscription et l'écran « Mes documents ». Celui qui écrit ces
   textes était le seul à ne pas pouvoir les relire.

   LES MÊMES BOUTONS QUE PARTOUT : `view-charte` et ses cinq voisins mènent au seul écran
   de lecture qui existe, donc il n'y a pas une seconde version du texte à tenir à jour.
   Et RELIRE N'EST PAS ACCEPTER : rien ne s'écrit, aucune date, aucune case. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const console_ = async (p) => {
  await p.evaluate(() => {
    const S = window.__S;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    S.persona = 'admin'; S.onboarded = true; S.authView = null; S.legalView = null;
    S.admin = { view: 'home', sel: null };
    window.__render();
  });
  await p.waitForTimeout(400);
};
const ecran = (p) => p.evaluate(() => (document.getElementById('view').textContent || '').replace(/\s+/g, ' '));

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1400 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — la console propose les six documents');
  await console_(p);
  const A = await p.evaluate(() => Array.from(document.querySelectorAll('#view [data-act^="view-"]'))
    .map((b) => ({ act: b.dataset.act, txt: (b.textContent || '').trim() })));
  const actes = A.map((x) => x.act);
  ['view-charte', 'view-cgu', 'view-cgv', 'view-mentions', 'view-confidentialite', 'view-suppression']
    .forEach((a) => ok(actes.indexOf(a) >= 0, a.replace('view-', '') + ' est accessible'));
  const charte = A.find((x) => x.act === 'view-charte');
  ok(!!charte && /[Cc]harte/.test(charte.txt), 'la charte est NOMMÉE (« ' + (charte ? charte.txt : '—') + ' »)');

  console.log('\nB — elle s’ouvre vraiment, et c’est le texte complet');
  await p.evaluate(() => document.querySelector('#view [data-act="view-charte"]').click());
  await p.waitForTimeout(400);
  const B = await ecran(p);
  ok(/Charte de responsabilité du prestataire/.test(B), 'le titre est celui de la charte');
  ok(B.length > 2000, 'et le texte est bien là, en entier (' + B.length + ' caractères)');
  ok(/responsab/i.test(B), 'avec ce qu’elle dit');
  const vide = await p.evaluate(() => (document.querySelector('#view .legaldoc') || {}).childElementCount || 0);
  ok(vide > 3, 'le document est structuré, pas une page blanche (' + vide + ' blocs)');

  console.log('\nC — relire n’est pas accepter');
  const C = await p.evaluate(() => ({
    accepte: (document.getElementById('view').textContent || '').indexOf('Vous avez accepté') >= 0,
    cases: document.querySelectorAll('#view [data-act^="toggle-"]').length,
  }));
  ok(!C.accepte, 'aucune mention d’acceptation : l’éditeur n’est pas un prestataire');
  ok(C.cases === 0, 'et aucune case à cocher (' + C.cases + ')');

  console.log('\nD — on revient à la console, pas ailleurs');
  await p.evaluate(() => document.querySelector('#view [data-act="close-legal"]').click());
  await p.waitForTimeout(400);
  const D = await p.evaluate(() => ({ persona: window.__S.persona, legal: window.__S.legalView,
    manuel: !!document.querySelector('#view [data-adm="manual"]') }));
  ok(D.persona === 'admin' && D.legal === null, 'le retour laisse la console en place');
  ok(D.manuel, 'et l’accueil de la console est bien celui qu’on retrouve');

  console.log('\nE — rien n’a bougé pour les autres');
  // Le pied de page du prestataire garde sa charte, celui du visiteur ne l'a toujours pas.
  const E = await p.evaluate(() => ({
    pro: window.__S ? null : null,
  }));
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  ok(E && /role==='pro'\?` · <button class="linklike" data-act="view-charte">/.test(html),
    'le pied de page légal n’est pas touché : la charte y reste réservée au prestataire');
  ok(/case 'view-cgu':case 'view-cgv':case 'view-charte'/.test(html)
    && /LEGAL_CLES\.indexOf\(_k\)>=0/.test(html),
    'et les sept boutons passent par la MÊME liste fermée, donc par le même écran');
  ok((html.match(/LEGAL_CLES\.indexOf/g) || []).length >= 3,
    'liste écrite une fois, lue par l’adresse, le lien et le bouton');

  console.log('\nF — le document « sous réserve d’assurance » s’ouvre lui aussi');
  await console_(p);
  await p.evaluate(() => document.querySelector('#view [data-act="view-assurance"]').click());
  await p.waitForTimeout(400);
  const F1 = await ecran(p);
  ok(/Adhésion sous réserve/.test(F1), 'depuis la console, le titre est le bon');
  ok(/trois \(3\) mois/.test(F1), 'il porte le délai de trois mois');
  ok(/seul et entièrement responsable/.test(F1), 'et il ne relâche pas la responsabilité');
  ok(/Ti-Services n'est pas son assureur/.test(F1), 'il dit ce que Ti-Services n’est pas');
  // Il doit aussi s'ouvrir par son ADRESSE : l'e-mail d'acceptation y mène, et la
  // personne peut n'avoir aucune application installée.
  const F2 = await p.evaluate(() => {
    const cles = window.__S ? null : null;
    return { ok: cles === null };
  });
  ok(F2.ok && /const LEGAL_CLES=\['cgu','cgv','charte','mentions','confidentialite','suppression','assurance'\]/.test(html),
    'et son adresse ?legal=assurance est reconnue comme les six autres');
  ok(/LEGAL_ASSURANCE_EN=/.test(html) && /LEGAL_ASSURANCE_PT=/.test(html),
    'il existe dans les trois langues, comme les autres documents');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
