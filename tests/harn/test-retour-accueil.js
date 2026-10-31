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

  console.log('A — le parcours de la vidéo : accueil → prestations → barrière → retour');
  ok(/Je cherche un service/.test(await texte()), 'l’accueil s’affiche');
  /* LA PORTE A CHANGÉ, CE QUI SE MESURE NON. « Je cherche un service » ouvrait le
     FORMULAIRE ; il ouvre les prestations, et la création de compte se demande ensuite
     par « Créer un compte ». La boucle que ce fichier existe pour refuser — formulaire
     → barrière → formulaire — est donc mesurée sur le nouveau chemin.

     ET « L'ACCUEIL » N'EST PLUS LE MÊME ENDROIT, parce que la personne n'est plus au
     même endroit : elle naviguait dans les prestations. La ramener à l'écran de
     bienvenue lui ferait perdre ce qu'elle regardait — et, avec une commande
     configurée, la commande elle-même. Le retour de la barrière la rend donc aux
     prestations, et la section D mesure que sa commande y est encore. */
  await p.locator('button[data-act="enter-guest"]:visible').first().click();
  await p.waitForTimeout(400);
  const ouvert = await p.evaluate(() => document.querySelectorAll('[data-svc]').length);
  ok(ouvert >= 5, 'la porte ouvre les prestations sans compte (' + ouvert + ' métiers)');
  await p.locator('button[data-act="guest-signup"]:visible').first().click();
  await p.waitForTimeout(400);
  // Navigateur ordinaire, pas d'application installée : la barrière doit apparaître.
  await p.evaluate(() => { document.body.classList.remove('standalone'); window.__render(); });
  await p.waitForTimeout(300);
  ok(/Votre compte se crée dans l’application|Votre compte se crée dans l'application/.test(await texte()),
    'hors application, l’inscription affiche la barrière d’installation');
  await p.locator('button[data-act="gate-back"]:visible').first().click();
  await p.waitForTimeout(500);
  const apres = await texte();
  const svcApres = await p.evaluate(() => document.querySelectorAll('[data-svc]').length);
  ok(svcApres >= 5, '« Retour » ramène aux PRESTATIONS, là où elle était (' + svcApres + ' métiers)');
  ok(!/Vos informations/.test(apres), 'et pas au formulaire d’inscription (la boucle d’avant)');

  console.log('B — et on peut redemander un compte normalement');
  await p.locator('button[data-act="guest-signup"]:visible').first().click();
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.body.classList.remove('standalone'); window.__render(); });
  await p.waitForTimeout(300);
  ok(/Votre compte se crée/.test(await texte()), 'la barrière se représente si on retente hors application');

  console.log('C — la FLÈCHE RETOUR du navigateur ne piège pas non plus dans le formulaire');
  // Même parcours, mais on presse le retour du navigateur (popstate → goBack) au lieu
  // du bouton de la page. L'ancien code effaçait authView en laissant onbStep=1 :
  // le routeur repeignait le formulaire « Vos informations ».
  await p.evaluate(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
  await p.waitForTimeout(500);
  const apresFleche = await texte();
  ok(!/Vos informations/.test(apresFleche), 'le retour navigateur ne ramène pas au formulaire');
  ok(await p.evaluate(() => document.querySelectorAll('[data-svc]').length) >= 5
     || /Je cherche un service/.test(apresFleche),
    'il ramène à un écran d’où l’on repart — prestations ou écran de bienvenue');

  console.log('D — LA COMMANDE CONFIGURÉE SURVIT À LA BARRIÈRE');
  /* C'est la raison d'être du mode invité : on configure, puis on crée son compte. Si
     l'aller-retour par la barrière effaçait la commande, le mode invité ne servirait à
     rien — et `gate-back` remet précisément une poignée d'états à zéro.

     L'ÉTAT DE DÉPART EST CELUI QUE `proceedToPay` PRODUIT pour un invité : authView
     signup, onbStep 1, _resumeOrder vrai, le brouillon en place. On ne rejoue pas le
     configurateur ici — il exige un point GPS et c'est une autre mesure
     (`test-lien-d-une-prestataire.js`, section A, rejoue la vraie naissance de
     session) : ce qui se mesure ICI est ce que la barrière et son retour font à la
     commande. */
  const d = await p.evaluate(async () => {
    const S = window.__S;
    S.guest = true; S.onboarded = false; S.clientNav = 'home';
    const m = window.__newMission(window.__svc.trouve('menage'));
    m.hours = 3; S.draft = m;
    S.authView = 'signup'; S.onbStep = 1; S._resumeOrder = true;
    document.body.classList.remove('standalone'); window.__render();
    await new Promise((r) => setTimeout(r, 400));
    const barriere = /Votre compte se cr\u00e9e/.test(document.body.innerText);
    const gb = [...document.querySelectorAll('[data-act="gate-back"]')]
      .find((e) => e.getBoundingClientRect().width > 0);
    if (!gb) return {manque: 'gate-back', barriere: barriere};
    gb.click();
    await new Promise((r) => setTimeout(r, 500));
    // `draft.svc` est l'IDENTIFIANT du métier — c'est ainsi que `proDirFor` l'indexe.
    return {barriere: barriere, svc: S.draft && S.draft.svc,
      heures: S.draft && S.draft.hours, invite: !!S.guest,
      form: /Vos informations/.test(document.body.innerText)};
  });
  ok(!d.manque, 'la barrière et son retour sont atteignables (' + (d.manque || 'ok') + ')');
  ok(d.barriere === true, 'la barrière s’affiche bien sur ce parcours');
  ok(d.svc === 'menage' && d.heures === 3,
    'la commande est intacte au retour (' + d.svc + ', ' + d.heures + ' h)');
  ok(d.invite === true && d.form === false,
    'et l’on est rendu à la navigation invité, pas au formulaire');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');

  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
