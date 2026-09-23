/* LA GRILLE NE S'ÉCRASE PAS AVEC LES VALEURS D'USINE.

   « Elle demande 35 € pour le ménage, dans l'application nous sommes à 28 €, je n'ai rien
   changé entre son inscription et maintenant — ou alors la mise à jour remet des anciens
   tarifs en écrasant ceux de la console ? » (23/09/2026). La question était la bonne.

   `S.adminPrices` part des valeurs écrites dans le CODE (`ADMIN_PRICES`, qui recopie
   `SERVICES[].rate` : ménage 35) et n'est remplacé par la grille RÉELLE qu'au retour de
   `settings/prices`. Or `savePrices` écrit `S.adminPrices` EN ENTIER. Toucher une flèche
   pendant ces quelques centaines de millisecondes réécrivait donc TOUTE la grille avec
   les valeurs d'usine — le ménage repassait de 28 à 35 sans que personne n'ait rien
   demandé, et sans trace.

   C'est aussi ce qui faisait « redisparaître » le tarif de la fiche : 35 tant que la
   grille n'était pas lue, 28 une fois lue, avec un faux « grille à son inscription »
   entre les deux. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const o = { headless: true };
  if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, locale: 'fr-FR', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S, null, { timeout: 20000 });
  await p.waitForTimeout(700);

  console.log('\nA — tant que la grille n’est pas lue, rien ne part en écriture');
  /* ON OBSERVE CE QUI PARTIRAIT VRAIMENT. `FB` est une variable du module, pas
     `window.FB` : le harnais expose `__setFB` pour la remplacer, sans quoi on
     remplacerait un objet que la fonction ne regarde jamais — et l'épreuve croirait
     qu'aucune écriture n'a lieu alors qu'elle a lieu. */
  await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'admin'; S.onboarded = true; S.admin = S.admin || {}; S.admin.view = 'home';
    S.adminArtisans = []; S.adminClients = []; S.adminPricesLus = false;
    S.adminPrices = { menage: 35, jardin: 40, baby: 28 };
    window.__ecrites = [];
    window.__setFB({
      f: { doc: () => ({}), serverTimestamp: () => 0,
        setDoc: (ref, data) => { window.__ecrites.push(data); return Promise.resolve(); } },
      auth: { currentUser: { uid: 'admin' } },
    });
    const bt = document.createElement('button');
    bt.setAttribute('data-price', 'menage:up'); bt.id = 'fleche'; document.body.appendChild(bt);
  });
  await p.click('#fleche'); await p.waitForTimeout(250);
  const pendant = await p.evaluate(() => ({ ecrites: (window.__ecrites || []).length,
    menage: (window.__S.adminPrices || {}).menage }));
  ok(pendant.ecrites === 0,
    'une flèche touchée avant la lecture n’écrit RIEN (' + pendant.ecrites + ' écriture)');
  ok(pendant.menage === 35,
    'et ne modifie même pas le chiffre à l’écran, qui serait un prix que la sauvegarde refuse');

  console.log('\nB — une fois la grille lue, la console écrit normalement');
  await p.evaluate(() => { window.__S.adminPricesLus = true; window.__ecrites = []; });
  await p.click('#fleche'); await p.waitForTimeout(250);
  const apres = await p.evaluate(() => ({ ecrites: (window.__ecrites || []).length,
    menage: (window.__S.adminPrices || {}).menage,
    envoye: ((window.__ecrites || [])[0] || {}).prices }));
  ok(apres.ecrites === 1 && apres.menage === 36,
    'la grille lue, la flèche monte le prix et l’enregistre (' + apres.menage + ' €)');
  ok(apres.envoye && apres.envoye.menage === 36,
    'et c’est bien la grille de la console qui part, pas les valeurs d’usine');

  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
