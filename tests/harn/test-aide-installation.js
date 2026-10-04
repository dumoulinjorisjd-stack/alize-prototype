/* « JE N'ARRIVE PAS À INSTALLER L'APPLICATION ».

   L'entonnoir mesure QUE les gens s'arrêtent à l'installation ; il ne dit pas POURQUOI,
   et personne n'écrira pour le raconter. La feuille d'installation ouvre donc une porte
   de sortie : la personne laisse son numéro, un e-mail nous arrive, on la rappelle.

   ELLE VIT DANS LA FEUILLE, ET DANS ELLE SEULE. `showInstallGuide` est la porte unique du
   guide : la page d'accueil, le bandeau des navigateurs intégrés et la relance d'après
   inscription l'empruntent tous les trois. Un bloc posé là est donc partout, et il n'y a
   pas de second endroit à penser le jour où une quatrième surface l'ouvrira.

   ON NE PROMET RIEN QU'ON N'AIT FAIT : tant que le serveur n'a pas répondu, on ne dit pas
   « c'est noté » ; si l'envoi échoue on le DIT, et le numéro reste à l'écran, prêt à
   repartir. Un « merci » affiché sur un envoi perdu, c'est quelqu'un qui attend un appel
   qui ne viendra jamais. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fns = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

// Une fausse base qui NOTE les appels et décide de leur sort.
// `showInstallGuide` mesure aussi l'entonnoir par le même canal : on ne retient que
// les alertes, sinon l'épreuve compterait l'ouverture de la feuille comme un envoi.
const ALERTES = () => window.__appels.filter((x) => x.nom === 'signalerInstallation');
const POSE_FB = (issue) => `(() => {
  window.__appels = [];
  window.__setFB({ db: {}, auth: { currentUser: null }, functions: {},
    fn: { httpsCallable: (fns, nom) => (d) => { window.__appels.push({ nom: nom, d: d });
      return ${issue === 'ko' ? 'Promise.reject(new Error("boom"))' : 'Promise.resolve({ data: { ok: true } })'}; } } });
})()`;

const ouvrir = async (p, issue) => {
  await p.evaluate((js) => { document.querySelectorAll('.ig-back').forEach((x) => x.remove()); eval(js); }, POSE_FB(issue));
  await p.evaluate(() => window.__inst.guide({}));
  await p.waitForTimeout(250);
};

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1000 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__inst && window.__inst.guide, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — la porte est là, discrète, et elle ne s’ouvre qu’au clic');
  await ouvrir(p, 'ok');
  const A = await p.evaluate(() => {
    const s = document.querySelector('.ig-back');
    const lien = s && s.querySelector('#igAide'), form = s && s.querySelector('#igAideForm');
    return { feuille: !!s, lien: lien ? lien.textContent.trim() : '', cache: form ? form.hidden : null,
      // Le bouton d'installation, lui, reste la proposition principale.
      place: lien && s.querySelector('.ig-sheet') ? (lien.getBoundingClientRect().top > s.querySelector('.ig-sheet').getBoundingClientRect().top + 100) : false };
  });
  ok(A.feuille, 'la feuille d’installation s’ouvre');
  ok(A.lien === 'Je n\'arrive pas à installer l\'application', 'le lien porte les mots demandés (« ' + A.lien + ' »)');
  ok(A.cache === true, 'le formulaire est replié tant qu’on ne le demande pas');
  ok(A.place === true, 'et il vit EN BAS du guide, sous les étapes');
  await p.click('#igAide'); await p.waitForTimeout(150);
  const A2 = await p.evaluate(() => {
    const s = document.querySelector('.ig-back');
    return { ouvert: !s.querySelector('#igAideForm').hidden, lien: s.querySelector('#igAide').hidden,
      tel: !!s.querySelector('#igAideTel'), cta: !!s.querySelector('#igAideGo') };
  });
  ok(A2.ouvert && A2.lien, 'le clic déplie le formulaire et retire le lien');
  ok(A2.tel && A2.cta, 'avec un champ de numéro et un bouton');

  console.log('\nB — sans numéro, on n’envoie rien et on le dit');
  await p.fill('#igAideTel', '');
  await p.click('#igAideGo'); await p.waitForTimeout(150);
  const B = await p.evaluate(() => ({ msg: document.querySelector('#igAideMsg').textContent,
    ko: document.querySelector('#igAideMsg').className, n: window.__appels.filter((x) => x.nom === 'signalerInstallation').length }));
  ok(B.n === 0, 'aucun appel n’est parti (' + B.n + ')');
  ok(/numéro/i.test(B.msg) && /ko/.test(B.ko), 'et la raison est dite (« ' + B.msg + ' »)');
  await p.fill('#igAideTel', '06 90'); // quatre chiffres : pas un numéro
  await p.click('#igAideGo'); await p.waitForTimeout(150);
  const B2 = await p.evaluate(() => window.__appels.filter((x) => x.nom === 'signalerInstallation').length);
  ok(B2 === 0, 'quatre chiffres ne font pas un numéro non plus (' + B2 + ')');

  console.log('\nC — avec un numéro, l’alerte part avec de quoi rappeler');
  await p.fill('#igAideTel', '0690 11 22 33');
  await p.click('#igAideGo'); await p.waitForTimeout(400);
  const C = await p.evaluate(() => ({ appels: window.__appels.filter((x) => x.nom === 'signalerInstallation'),
    txt: document.querySelector('#igAideForm').textContent.replace(/\s+/g, ' ') }));
  ok(C.appels.length === 1 && C.appels[0].nom === 'signalerInstallation',
    'un appel, et un seul, vers la bonne fonction (' + JSON.stringify(C.appels.map((x) => x.nom)) + ')');
  const d = C.appels.length ? C.appels[0].d : {};
  ok(d.phone === '0690 11 22 33', 'le numéro part tel qu’il a été tapé (' + d.phone + ')');
  ok(/^[a-f0-9-]{16,64}$/i.test(String(d.did || '')),
    'avec l’identifiant d’appareil, celui de l’entonnoir (' + d.did + ')');
  ok(/ordinateur|iPhone|iPad|Android/.test(String(d.platform || '')),
    'et de quoi savoir sur quel appareil ça bloque (« ' + d.platform + ' »)');
  ok(['client', 'pro', 'concierge'].indexOf(d.role) >= 0, 'le côté est une valeur fermée (' + d.role + ')');
  ok(/C.est noté/.test(C.txt) && /0690 11 22 33/.test(C.txt),
    'et l’écran confirme en REDISANT le numéro qu’on rappellera (« ' + C.txt.slice(0, 90) + ' »)');
  ok(!/igAideGo/.test(C.txt), 'le formulaire ne propose plus d’envoyer deux fois');

  console.log('\nD — un envoi qui échoue ne dit JAMAIS « c’est noté »');
  await ouvrir(p, 'ko');
  await p.click('#igAide'); await p.waitForTimeout(120);
  await p.fill('#igAideTel', '0690 44 55 66');
  await p.click('#igAideGo'); await p.waitForTimeout(400);
  const D = await p.evaluate(() => ({ msg: document.querySelector('#igAideMsg').textContent,
    ko: document.querySelector('#igAideMsg').className, tel: document.querySelector('#igAideTel').value,
    off: document.querySelector('#igAideGo').disabled, n: window.__appels.filter((x) => x.nom === 'signalerInstallation').length }));
  ok(D.n === 1, 'l’appel a bien été tenté (' + D.n + ')');
  ok(!/noté/.test(D.msg) && /ko/.test(D.ko), 'rien n’est promis (« ' + D.msg + ' »)');
  ok(/contact@ti-services\.fr/.test(D.msg), 'et l’autre chemin est donné');
  ok(D.tel === '0690 44 55 66' && D.off === false, 'le numéro reste à l’écran, prêt à repartir');

  console.log('\nE — hors ligne, on le dit plutôt que de faire semblant');
  await p.evaluate(() => { document.querySelectorAll('.ig-back').forEach((x) => x.remove()); window.__setFB(null); });
  await p.evaluate(() => window.__inst.guide({}));
  await p.waitForTimeout(250);
  await p.click('#igAide'); await p.waitForTimeout(120);
  await p.fill('#igAideTel', '0690 77 88 99');
  await p.click('#igAideGo'); await p.waitForTimeout(250);
  const E = await p.evaluate(() => ({ msg: document.querySelector('#igAideMsg').textContent,
    ko: /ko/.test(document.querySelector('#igAideMsg').className) }));
  ok(/connexion/i.test(E.msg) && E.ko, 'sans Firebase, le message est franc (« ' + E.msg + ' »)');

  console.log('\nF — le numéro déjà connu est proposé');
  await p.evaluate(() => {
    document.querySelectorAll('.ig-back').forEach((x) => x.remove());
    window.__S.proForm = { phone: '0690 12 34 56' };
  });
  await p.evaluate(() => window.__inst.guide({}));
  await p.waitForTimeout(250);
  const F = await p.evaluate(() => document.querySelector('#igAideTel').value);
  ok(F === '0690 12 34 56', 'il n’est pas à retaper (' + F + ')');
  await p.evaluate(() => { window.__S.proForm = {}; window.__S.proPhone = ''; });

  console.log('\nG — la feuille, elle, n’a rien perdu');
  await p.evaluate(() => { document.querySelectorAll('.ig-back').forEach((x) => x.remove()); });
  await p.evaluate(() => window.__inst.guide({ headTitle: 'Ne manquez aucune notification', banner: 'Un rappel.' }));
  await p.waitForTimeout(250);
  const G = await p.evaluate(() => {
    const s = document.querySelector('.ig-back');
    return { titre: !!s.querySelector('.ig-head b'), cartes: s.querySelectorAll('.ig-card').length,
      banniere: !!s.querySelector('.ig-warn'), croix: !!s.querySelector('.ig-x'), aide: !!s.querySelector('#igAide') };
  });
  ok(G.titre && G.cartes >= 2 && G.banniere, 'titre, étapes et bandeau sont toujours là (' + G.cartes + ' cartes)');
  ok(G.aide, 'et la porte de sortie accompagne cette ouverture aussi');
  await p.click('.ig-x'); await p.waitForTimeout(400);
  const G2 = await p.evaluate(() => document.querySelectorAll('.ig-back').length);
  ok(G2 === 0, 'la feuille se referme comme avant');

  console.log('\nH — côté serveur : appelable sans compte, mais borné');
  ok(/exports\.signalerInstallation = onCall\(\{secrets: \[SMTP_PASS\]\}/.test(fns),
    'la fonction existe et sait envoyer un courriel');
  ok(!/signalerInstallation[\s\S]{0,700}unauthenticated/.test(fns),
    'elle n’exige pas de compte : le guide s’affiche AVANT l’inscription');
  ok(/signalerInstallation[\s\S]{0,900}\/\^\[a-f0-9-\]\{16,64\}\$\/i\.test\(did\)/.test(fns),
    'l’identifiant d’appareil est au format de l’entonnoir');
  ok(/signalerInstallation[\s\S]{0,1200}chiffres\.length < 6/.test(fns),
    'un numéro qui n’en est pas un est refusé');
  ok(/collection\('installAlerts'\)\.doc\(did \+ '_' \+ jour\)\.create\(/.test(fns),
    'UNE alerte par appareil et par jour, réservée par un create()');
  ok(/signalerInstallation[\s\S]{0,2000}return \{ok: true, deja: true\}/.test(fns),
    'et la deuxième du jour ne renvoie rien, sans gronder personne');
  const iA = fns.indexOf("collection('installAlerts')"), iM = fns.indexOf('install alert mail');
  ok(iA > 0 && iM > iA, 'l’alerte est ÉCRITE avant d’être envoyée : un SMTP en panne ne perd pas le numéro');
  ok(/role === 'pro' \? 'pro'/.test(fns), 'le côté reçu est ramené à une liste fermée');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
