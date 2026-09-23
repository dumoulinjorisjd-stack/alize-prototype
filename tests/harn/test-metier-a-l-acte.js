/* UN MÉTIER CRÉÉ DEPUIS LA CONSOLE PEUT N'AVOIR AUCUN TARIF HORAIRE.

   « Quand j'ajoute un métier je suis obligé de laisser un tarif horaire, mais dans ce cas
   je n'en veux pas » (23/09/2026, sur le métier « Couture »). La couture, la retouche,
   la coiffure se vendent à la PRESTATION, pas à l'heure.

   LA MACHINE EXISTAIT DÉJÀ : c'est la grille à l'acte des métiers du catalogue, du prix
   affiché (« dès X € ») au total ferme de la commande. Il n'y manquait que la porte pour
   un métier de la console. Et un défaut la rendait dangereuse : `[]` est VRAI en
   JavaScript, donc un métier dont on retirait la dernière prestation restait « à l'acte »
   avec zéro prestation — « dès 0 € » devant un choix vide.

   ON RÉSERVE LA BASCULE AUX MÉTIERS DE LA CONSOLE : la nature d'un métier livré avec
   l'application (le ménage est horaire) n'est pas une préférence, et la basculer d'un
   bouton toucherait les prestataires qui l'exercent déjà. */
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
  // La scène du harnais est masquée : les rectangles y valent zéro et Playwright refuse
  // de cliquer ce qu'il juge invisible. On la rend visible pour mesurer ce qui est rendu.
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });

  console.log('\nB — la console ouvre la porte, et seulement pour ses propres métiers');
  const poser = (custom) => {
    const S = window.__S;
    S.persona = 'admin'; S.onboarded = true; S.admin = S.admin || {}; S.admin.view = 'home';
    S.adminArtisans = []; S.adminClients = []; S.adminPricesLus = true;
    S.customServices = custom ? [{ id: 'c_couture', nm: 'Couture', rate: 40, custom: true, ico: '' }] : [];
    S.adminCatalog = {}; S.adminOptions = {};
    S._fold = S._fold || {}; S._fold['a-prices'] = true;   // le volet qui porte les métiers
    S.admPriceOpen = { [custom ? 'c_couture' : 'menage']: true };
    window.__render();
  };
  await p.evaluate(poser, true); await p.waitForTimeout(350);
  let vu = await p.evaluate(() => ({
    bascule: !!document.querySelector('[data-adm="acteon:c_couture"]'),
    horaire: /Tarif horaire/.test(document.body.innerText) }));
  ok(vu.bascule && vu.horaire, 'un métier de la console affiche son tarif horaire ET la bascule « passer à l’acte »');

  await p.evaluate(poser, false); await p.waitForTimeout(350);
  vu = await p.evaluate(() => ({ bascule: !!document.querySelector('[data-adm^="acteon:"]') }));
  ok(!vu.bascule, 'un métier livré avec l’application ne l’affiche pas — sa nature n’est pas une préférence');

  console.log('\nC — la bascule fait disparaître le tarif horaire');
  await p.evaluate(poser, true); await p.waitForTimeout(300);
  await p.evaluate(() => { const bt = document.querySelector('[data-adm="acteon:c_couture"]'); if (bt) bt.click(); });
  await p.waitForTimeout(450);
  const apres = await p.evaluate(() => ({
    actes: ((window.__S.adminCatalog || {}).c_couture || []).length,
    horaire: /Tarif horaire/.test(document.body.innerText),
    grille: /Grille à l’acte|Grille à l'acte/.test(document.body.innerText) }));
  ok(apres.actes === 1, 'une première prestation est créée, à nommer et à chiffrer (' + apres.actes + ')');
  ok(!apres.horaire && apres.grille, 'et la carte passe à la grille : plus aucun tarif horaire à l’écran');

  console.log('\nD — retirer la dernière prestation ramène au tarif horaire');
  await p.evaluate(() => { window.__S.adminCatalog.c_couture = []; window.__render(); });
  await p.waitForTimeout(350);
  const retour = await p.evaluate(() => ({
    horaire: /Tarif horaire/.test(document.body.innerText),
    bascule: !!document.querySelector('[data-adm="acteon:c_couture"]') }));
  ok(retour.horaire && retour.bascule,
    'le métier redevient horaire tout seul — le retour n’a pas besoin d’un second bouton');

  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
