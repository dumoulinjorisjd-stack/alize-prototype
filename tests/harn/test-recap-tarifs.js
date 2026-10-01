/* LE RÉCAPITULATIF DES TARIFS, ET POURQUOI IL EST FABRIQUÉ DANS L'APPLICATION.

   « Une présentation simple en PDF de nos tarifs en cours, pour visualiser d'un coup
   d'œil les tarifs que nous appliquons et les corriger si nécessaire » — puis, décisif :
   « il faut qu'il soit actualisé avec ce qui a été modifié manuellement ».

   Un PDF fabriqué à côté de l'application serait figé le jour où il est écrit et, pire,
   ignorerait la console : la grille VIVANTE est `S.adminPrices` (settings/prices), le
   catalogue à l'acte `S.adminCatalog`, les options `S.adminOptions`. La feuille lit donc
   les mêmes fonctions que la commande du client. Si la feuille et la commande annonçaient
   deux prix, la feuille ne servirait à rien — c'est ce qu'on mesure d'abord. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 900, height: 1200 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__tarifs, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  const console_ = (maj) => p.evaluate((maj) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'a@e.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null }; S.adminArtisans = []; S.adminClients = [];
    S.adminPricesLus = true;
    S.adminPrices = Object.assign(window.__tarifs.defauts(), (maj && maj.prix) || {});
    S.customServices = (maj && maj.customs) || [];
    S.adminOptions = (maj && maj.options) || {};
    if (maj && maj.catalogue) S.adminCatalog = maj.catalogue;
    window.__render();
    return window.__tarifs.feuille();
  }, maj);

  console.log('A — la feuille lit la grille VIVANTE, pas les valeurs du code');
  const base = await console_(null);
  ok(/Ménage/.test(base) && /35,00 €\/h/.test(base), 'au départ, le ménage sort au tarif d’origine (35 €/h)');
  const mod = await console_({ prix: { menage: 28 } });
  ok(/28,00 €\/h/.test(mod) && !/Ménage<\/div>[\s\S]{0,200}?35,00 €\/h/.test(mod),
    'le prix corrigé à la main dans la console sort à 28 €/h — c’est la demande même');

  console.log('\nB — chaque métier dit COMMENT il se facture, et ne montre que le prix qui sort');
  ok(/Coiffure[\s\S]{0,160}?À l’acte/.test(mod), 'un métier vendu à l’acte le dit');
  ok(/Coiffure[\s\S]{0,200}?dès \d+,\d\d €/.test(mod) && !/Coiffure[\s\S]{0,160}?45,00 €\/h/.test(mod),
    'et n’imprime PAS de tarif horaire : le client coche des prestations, personne ne paie ce €/h');
  ok(/Colis &amp; courrier[\s\S]{0,160}?Forfait retrait/.test(mod), 'le colis est un forfait, pas une heure');
  ok(/Garde d’animaux[\s\S]{0,200}?\/jour/.test(mod), 'la garde d’animaux montre AUSSI son tarif à la journée');
  ok(/Coupe homme/.test(mod) && /Coloration \+ brushing/.test(mod),
    'et les prestations à l’acte sont listées une par une, avec leur prix');

  console.log('\nC — ce qui a été changé à la main est marqué : c’est la moitié de la demande');
  ok(/Ménage <span class="mq mq-m">modifié<\/span>/.test(mod), 'un tarif corrigé porte « modifié »');
  ok(!/Baby-sitting <span class="mq/.test(mod), 'un tarif jamais touché ne porte aucune marque');
  const avecCustom = await console_({ customs: [{ id: 'c_peinture', nm: 'Peinture', rate: 45, custom: true, ico: 'peinture', cat: 'depannage' }], prix: { c_peinture: 45 } });
  ok(/Peinture <span class="mq mq-c">créé en console<\/span>/.test(avecCustom),
    'et un métier créé en console est marqué comme tel — il n’a pas de valeur d’origine, il n’est pas « modifié »');
  ok(/1 tarif[\s\S]{0,40}?diffère de la valeur d’origine/.test(await console_({ prix: { menage: 28 } })),
    'l’en-tête compte combien de tarifs s’écartent du code');

  console.log('\nD — options, catégories, et l’ordre de l’accueil');
  const avecOpt = await console_({ options: { menage: [{ id: 'o1', nm: 'Repassage', price: 12, unit: 'h' }, { id: 'o2', nm: 'Vitres', price: 25, unit: 'u' }] } });
  ok(/Repassage<\/td><td class="p">12,00 €\/h</.test(avecOpt), 'une option à l’heure sort avec son « /h »');
  ok(/Vitres<\/td><td class="p">25,00 €</.test(avecOpt), 'une option à l’unité sort sans');
  ok(avecCustom.indexOf('>Dépannage &amp; entretien<') > 0 &&
     avecCustom.indexOf('>Dépannage &amp; entretien<') < avecCustom.indexOf('Peinture'),
    'le métier rangé en console apparaît DANS sa catégorie, pas en tête de feuille');
  ok(base.indexOf('Ménage') < base.indexOf('>Beauté<'), 'et la feuille suit l’ordre de l’accueil');

  console.log('\nE — la feuille tient debout toute seule');
  ok(/^<!doctype html>/.test(base) && /<style>/.test(base),
    'elle porte sa propre feuille de style : elle ne dépend ni du thème sombre ni d’une classe de l’app');
  const hostile = await console_({ customs: [{ id: 'c_x', nm: '<img src=x onerror=alert(1)>', rate: 40, custom: true, ico: '' }], prix: { c_x: 40 } });
  ok(hostile.indexOf('<img src=x') < 0 && hostile.indexOf('&lt;img src=x') > 0,
    'un nom de métier hostile PARAÎT, inerte : rien ne s’ouvre dans la fenêtre d’impression');

  console.log('\nF — le bouton, et ce qu’il refuse');
  ok(/data-act="tarifs-pdf"/.test(html), 'le bouton vit dans la carte des tarifs de la console');
  ok(/case 'tarifs-pdf':\{\n\s*if\(!isAdminAccount\(\)\)/.test(html), 'réservé à l’administrateur');
  ok(/if\(!S\.adminPricesLus\)\{toast\('Grille en cours de lecture/.test(html),
    'et il refuse d’imprimer une grille qu’on n’a pas encore lue — elle porterait les valeurs d’usine');

  console.log('\nG — elle s’imprime : pagination mesurée sur une vraie page A4');
  const pages = await p.evaluate(async (doc) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:absolute;left:-9999px;width:794px;height:1123px';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(doc); f.contentDocument.close();
    await new Promise((r) => setTimeout(r, 300));
    const d = f.contentDocument;
    const h = d.body.scrollHeight;
    // Aucun titre de métier ne doit rester seul en bas d'une page : on mesure qu'il reste
    // de la place pour au moins deux lignes sous chaque en-tête.
    const PAGE = 1123 - 2 * 45;
    let orphelins = 0;
    d.querySelectorAll('.svc-h').forEach((x) => {
      const y = x.getBoundingClientRect().top + f.contentWindow.scrollY;
      if (PAGE - (y % PAGE) < 34) orphelins++;
    });
    const n = d.querySelectorAll('.svc').length;
    f.remove();
    return { h, orphelins, n };
  }, base);
  ok(pages.n >= 20, 'tous les métiers du catalogue sont sur la feuille (' + pages.n + ')');
  ok(pages.orphelins === 0, 'aucun titre de métier ne reste orphelin en bas de page (' + pages.orphelins + ')');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
