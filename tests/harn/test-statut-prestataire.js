/* CHANGER LE STATUT D'UN PRESTATAIRE, DANS LES DEUX SENS.

   « Dans la console je dois pouvoir changer moi-même les statuts des prestataires. »
   Et ce n'était vrai que pour DEUX états sur trois : une candidature en attente se
   validait ou se refusait, une refusée se réexaminait — un prestataire VALIDÉ n'avait
   AUCUN bouton. Le suspendre, le temps d'une attestation périmée ou d'un incident,
   demandait d'aller dans la base.

   LES TROIS GESTES AVAIENT DÉJÀ DIVERGÉ : `reexam-art` ne recalculait pas les services
   ouverts aux clients. Sans conséquence tant qu'il ne servait qu'à ramener un REFUSÉ en
   attente ; grave dès qu'on rétrograde un VALIDÉ, qui était peut-être le dernier à
   proposer son métier — le métier serait resté « disponible » sans personne derrière. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fns = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

const ART = (x) => Object.assign({ id: 'a1', uid: 'a1', real: false, name: 'Nautylus Cata Loc',
  status: 'valide', siret: '12345678901234', insured: true, insuranceStatus: 'valide',
  cats: ['menage'], rates: { menage: 30 }, rate: 30, phone: '0690112233', email: 'n@e.fr',
  zone: 'Gustavia', rating: 0, jobs: 0 }, x);

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__statut, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — les six transitions, dans les deux sens');
  const A = await p.evaluate((base) => {
    const out = {};
    [['valide', 'attente'], ['valide', 'refuse'], ['attente', 'valide'], ['attente', 'refuse'],
     ['refuse', 'attente'], ['refuse', 'valide']].forEach(function (t) {
      const a = Object.assign({}, base, { status: t[0] });
      window.__statut.changer(a, t[1]);
      out[t[0] + '→' + t[1]] = a.status;
    });
    return out;
  }, ART({}));
  Object.keys(A).forEach(function (k) {
    ok(A[k] === k.split('→')[1], k + ' : ' + A[k]);
  });

  console.log('\nB — ce qui est refusé, et pourquoi');
  const B = await p.evaluate((base) => {
    const sansSiret = Object.assign({}, base, { status: 'attente', siret: '' });
    window.__statut.changer(sansSiret, 'valide');
    const sansAss = Object.assign({}, base, { status: 'attente', insured: false, insuranceStatus: 'none' });
    window.__statut.changer(sansAss, 'valide');
    const declare = Object.assign({}, base, { status: 'attente', insured: false, insuranceStatus: 'aucune' });
    window.__statut.changer(declare, 'valide');
    const meme = Object.assign({}, base, { status: 'valide' });
    window.__statut.changer(meme, 'valide');
    const faux = Object.assign({}, base, { status: 'valide' });
    window.__statut.changer(faux, 'supprime');
    return { sansSiret: sansSiret.status, sansAss: sansAss.status, declare: declare.status,
      meme: meme.status, faux: faux.status };
  }, ART({}));
  ok(B.sansSiret === 'attente', 'sans SIRET, on ne valide pas');
  ok(B.sansAss === 'attente', 'sans attestation vérifiée non plus');
  ok(B.declare === 'valide', 'mais une assurance DÉCLARÉE absente laisse valider, comme avant');
  ok(B.meme === 'valide', 'remettre le statut courant ne fait rien');
  ok(B.faux === 'valide', 'et un état inventé n’entre pas (' + B.faux + ')');

  console.log('\nC — rétrograder recalcule les métiers ouverts aux clients');
  // C'est le défaut qu'ouvrait la nouvelle liberté : `reexam-art` ne le faisait pas.
  const C = await p.evaluate((base) => {
    window.__S.adminArtisans = [Object.assign({}, base, { id: 'seul', uid: 'seul', status: 'valide', cats: ['massage'] })];
    const avant = window.__dispo().indexOf('massage') >= 0;
    window.__statut.changer(window.__S.adminArtisans[0], 'attente');
    const apres = window.__dispo().indexOf('massage') >= 0;
    return { avant: avant, apres: apres };
  }, ART({}));
  ok(C.avant === true, 'son métier était ouvert tant qu’il était validé');
  ok(C.apres === false, 'il se referme dès qu’il ne l’est plus (il était le dernier)');

  console.log('\nD — la carte dit l’état, et ce qu’il entraîne');
  const D = await p.evaluate((base) => ({
    valide: window.__statut.carte(Object.assign({}, base, { status: 'valide' })),
    attente: window.__statut.carte(Object.assign({}, base, { status: 'attente' })),
    refuse: window.__statut.carte(Object.assign({}, base, { status: 'refuse' })),
    bloque: window.__statut.carte(Object.assign({}, base, { status: 'attente', siret: '' })),
    accueilli: window.__statut.carte(Object.assign({}, base, { status: 'attente', approvedNotifiedAt: 1790000000000 })),
  }), ART({}));
  ok(/Statut du prestataire/.test(D.valide), 'la carte existe');
  ok((D.valide.match(/data-adm="statut-art:/g) || []).length === 3, 'les trois états sont offerts');
  ok(/statut-art:a1:valide"[^>]*class|class="seg on"[^>]*data-adm="statut-art:a1:valide"/.test(D.valide)
    || /data-adm="statut-art:a1:valide"/.test(D.valide) && /seg on/.test(D.valide), 'l’état courant est marqué');
  ok(/Visible par les clients/.test(D.valide) && /aucune demande/.test(D.attente) && /historique/.test(D.refuse),
    'chaque état dit ce qu’il signifie pour les clients');
  ok(/missions déjà acceptées se terminent normalement/.test(D.valide),
    'et la conséquence d’une rétrogradation est écrite AVANT le clic');
  ok(/SIRET manquant/.test(D.bloque) && /disabled/.test(D.bloque),
    'un dossier incomplet grise « Validé » et dit pourquoi');
  ok(!/disabled/.test(D.valide), 'un dossier complet ne grise rien');
  ok(/ne le renverra pas/.test(D.accueilli), 'et la carte prévient que l’e-mail de bienvenue ne repartira pas');

  console.log('\nE — une seule porte pour les quatre entrées');
  ok(/else if\(act==='valid-art'\)\{changerStatutArtisan/.test(html)
    && /else if\(act==='rej-art'\)\{changerStatutArtisan/.test(html)
    && /else if\(act==='reexam-art'\)\{changerStatutArtisan/.test(html)
    && /else if\(act==='statut-art'\)\{/.test(html),
    'les quatre gestes passent par la même fonction');
  // On compte les APPELS, pas la déclaration de la fonction.
  const appelsW = (html.match(/adminWriteStatus\(/g) || []).length - (html.match(/function adminWriteStatus\(/g) || []).length;
  ok(appelsW === 1, 'et le statut ne s’écrit plus qu’à un seul endroit (' + appelsW + ' appel)');
  ok(!/S\.admin\.view='home';toast\('Candidature refusée/.test(html),
    'refuser depuis la fiche n’éjecte plus vers l’accueil de la console');

  console.log('\nF — on ne souhaite pas la bienvenue deux fois');
  ok(/const dejaAccueilli = !!after\.approvedNotifiedAt;/.test(fns),
    'le serveur sait si l’accueil a déjà été fait');
  ok(/if \(tokens\.length && !dejaAccueilli\)/.test(fns), 'la notification ne repart pas');
  ok(/if \(email && !dejaAccueilli\)/.test(fns), 'l’e-mail non plus');
  ok(/approvedNotifiedAt: Date\.now\(\)/.test(fns), 'et la date est posée');
  const iMail = fns.indexOf("approvedArtisanHtml(name === 'Bonjour'"), iFlag = fns.indexOf('approvedNotifiedAt: Date.now()');
  ok(iMail > 0 && iFlag > iMail, 'après l’envoi : on ne marque pas accueilli quelqu’un qui n’a rien reçu');
  ok(/approvedNotifiedAt:Number\(a\.approvedNotifiedAt\)\|\|0/.test(html), 'et la console le relit');

  console.log('\nG — dans la fiche réelle');
  await p.evaluate((base) => {
    const S = window.__S;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    S.persona = 'admin'; S.onboarded = true; S.authView = null;
    S.adminArtisans = [Object.assign({}, base, { status: 'valide' })];
    S.admin = { view: 'art', sel: 'a1' };
    window.__render();
  }, ART({}));
  await p.waitForTimeout(400);
  const G1 = await p.evaluate(() => Array.from(document.querySelectorAll('#view [data-adm^="statut-art:"]'))
    .map((b) => ({ adm: b.dataset.adm, on: /\bon\b/.test(b.className), off: b.disabled })));
  ok(G1.length === 3, 'les trois boutons sont dans la fiche (' + G1.length + ')');
  ok(G1.filter((x) => x.on).length === 1 && /valide$/.test((G1.find((x) => x.on) || {}).adm || ''),
    'et c’est « Validé » qui est allumé');
  await p.evaluate(() => document.querySelector('#view [data-adm="statut-art:a1:attente"]').click());
  await p.waitForTimeout(400);
  const G2 = await p.evaluate(() => ({ statut: window.__S.adminArtisans[0].status,
    vue: window.__S.admin.view,
    allume: (Array.from(document.querySelectorAll('#view [data-adm^="statut-art:"]')).find((b) => /\bon\b/.test(b.className)) || {}).dataset }));
  ok(G2.statut === 'attente', 'le clic suspend le prestataire');
  ok(G2.vue === 'art', 'sans quitter sa fiche');
  ok(G2.allume && /attente$/.test(G2.allume.adm), 'et la carte montre aussitôt le nouvel état');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
