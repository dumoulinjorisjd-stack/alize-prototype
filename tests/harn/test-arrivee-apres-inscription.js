/* OÙ L'ON ARRIVE QUAND ON VIENT DE CRÉER SON COMPTE.

   « Quand un client s'inscrit, il a rentré son mail et son mot de passe, la première
   page qui s'ouvre est son profil. Ça serait mieux qu'il tombe sur l'accueil, plus
   sexy. » Exact, et ce n'était même pas un choix : l'écran d'arrivée était celui qu'on
   avait sous les yeux en ouvrant le formulaire. Le chemin ordinaire passe par l'onglet
   Profil (c'est là que vit « Créer mon compte » quand on visite sans compte), donc la
   première impression était une page de réglages vides — alors que ce qu'on vient
   chercher, c'est le catalogue.

   CE QUI NE DOIT PAS CASSER : la commande en attente. Un invité qui configure une
   prestation puis touche « Commander » est envoyé s'inscrire, commande conservée ; au
   retour il doit tomber sur le PAIEMENT, pas sur l'accueil. Les deux sont mesurés — une
   correction qui enverrait tout le monde à l'accueil perdrait une commande. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 428, height: 1000 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(900);

  // Le formulaire s'ouvre depuis l'onglet PROFIL — le chemin de l'invité qui se décide.
  const inscrire = (avecCommande) => p.evaluate((avecCommande) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    window.__setFB(null);               // parcours hors Firebase : la même porte, sans réseau
    // La barrière d'installation garde l'inscription : on la lève comme le fait le lien
    // « Vous l'avez déjà installée ? Continuer ici » — ce n'est pas elle qu'on mesure ici.
    try{ localStorage.setItem('ti_installee','1'); }catch(_){}
    S.lang = 'fr'; S.demoMode = false; S.persona = 'client'; S.guest = true; S.onboarded = false;
    S.mission = null; S.detail = null; S.support = false; S.advantages = false;
    S.clientNav = 'profile';            // ← l'onglet d'où part « Créer mon compte »
    S.draft = avecCommande ? { svc: 'menage', svcName: 'Ménage', rate: 35, duration: 2, unit: 'h',
      zone: 'Gustavia', when: 'Demain', slot: '14:00' } : null;
    S._resumeOrder = !!avecCommande;
    S.payStep = false; S.payEdit = false;
    S.authView = 'signup'; S.onbStep = 1;
    S.clientForm = { name: 'Nina Berthier', email: 'nina@exemple.fr', zone: 'Gustavia',
      password: 'motdepasse', password2: 'motdepasse', photo: '', terms: true };
    window.__render();
    document.querySelector('[data-act="finish-onboard"]').click();
    return null;
  }, avecCommande);

  const ecran = () => p.evaluate(() => {
    const S = window.__S;
    const on = document.querySelector('.navbar button.on');
    return { nav: S.clientNav, onglet: on ? on.innerText.trim() : '',
      paiement: !!(S.draft && S.payStep), compte: !!S.onboarded,
      txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400) };
  });

  console.log('A — une inscription ordinaire ouvre l’accueil');
  await inscrire(false); await p.waitForTimeout(400);
  const a = await ecran();
  ok(a.compte === true, 'le compte est bien créé');
  ok(a.nav === 'home', 'l’onglet actif est l’Accueil (' + a.nav + ')');
  ok(a.onglet === 'Accueil', 'et la barre du bas l’allume (« ' + a.onglet + ' »)');
  ok(!/Mon profil|Mes adresses|Moyen de paiement/.test(a.txt),
    'ce n’est plus la page de réglages vides qu’on voit en premier');

  console.log('\nB — mais une commande en attente passe devant');
  await inscrire(true); await p.waitForTimeout(400);
  const c = await ecran();
  ok(c.compte === true, 'le compte est créé, là aussi');
  ok(c.paiement === true, 'l’invité qui avait configuré une prestation tombe sur le PAIEMENT');
  ok(/Ménage/.test(c.txt), 'et c’est bien SA commande qui l’attend, pas une autre');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
