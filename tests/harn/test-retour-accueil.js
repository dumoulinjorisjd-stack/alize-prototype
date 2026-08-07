/* LE « RETOUR À L'ACCUEIL » QUI NE RAMENAIT PAS À L'ACCUEIL.
   Depuis l'accueil, « Je cherche un service » pose onbStep=1 (le formulaire). Hors
   application, le routeur affiche alors la barrière « Votre compte se crée dans
   l'application ». Son bouton « ← Retour à l'accueil » remettait authView à zéro… mais
   pas onbStep : le routeur repeignait le FORMULAIRE, qui ramenait à la barrière — le
   visiteur tournait en boucle sans jamais revoir l'accueil (vu en vidéo, sur le vrai
   site, par un vrai visiteur). Ce test déroule exactement ce parcours. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 1280, height: 800}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1200);
  const texte = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

  console.log('A — le parcours de la vidéo : accueil → inscription → barrière → retour');
  ok(/Je cherche un service/.test(await texte()), 'l’accueil s’affiche');
  await p.locator('button[data-act="onb-start"]:visible').first().click();
  await p.waitForTimeout(400);
  // Navigateur ordinaire, pas d'application installée : la barrière doit apparaître.
  await p.evaluate(() => { document.body.classList.remove('standalone'); window.__render(); });
  await p.waitForTimeout(300);
  ok(/Votre compte se crée dans l’application|Votre compte se crée dans l'application/.test(await texte()),
    'hors application, l’inscription affiche la barrière d’installation');
  await p.locator('button[data-act="gate-back"]:visible').first().click();
  await p.waitForTimeout(500);
  const apres = await texte();
  ok(/Je cherche un service/.test(apres), '« Retour à l’accueil » ramène à l’ACCUEIL');
  ok(!/Vos informations/.test(apres), 'et pas au formulaire d’inscription (la boucle d’avant)');

  console.log('B — et on peut repartir de l’accueil normalement');
  await p.locator('button[data-act="onb-start"]:visible').first().click();
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.body.classList.remove('standalone'); window.__render(); });
  await p.waitForTimeout(300);
  ok(/Votre compte se crée/.test(await texte()), 'la barrière se représente si on retente hors application');

  console.log('C — la FLÈCHE RETOUR du navigateur ramène aussi à l’accueil (pas au formulaire)');
  // Même parcours, mais on presse le retour du navigateur (popstate → goBack) au lieu
  // du bouton de la page. L'ancien code effaçait authView en laissant onbStep=1 :
  // le routeur repeignait le formulaire « Vos informations ».
  await p.evaluate(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
  await p.waitForTimeout(500);
  const apresFleche = await texte();
  ok(/Je cherche un service/.test(apresFleche), 'le retour navigateur ramène à l’ACCUEIL');
  ok(!/Vos informations/.test(apresFleche), 'et pas au formulaire d’inscription');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');

  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
