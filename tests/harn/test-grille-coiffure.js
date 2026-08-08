/* LA GRILLE COIFFURE DÉTAILLÉE — ET SA LISIBILITÉ.
   ~50 prestations relevées sur un salon de référence (+5 %) remplacent une grille de
   7 lignes génériques. À plat, c'est un mur : illisible pour l'artisan qui l'accepte à
   l'inscription comme pour le client qui compose sa commande. Ce test vérifie les prix
   ET le repli par familles aux trois endroits où la grille se montre. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

// Relevé du salon de référence → prix attendu = arrondi(relevé × 1,05).
const RELEVE = [
  ['cf_h_coupe', 39], ['cf_h_cb', 49], ['cf_h_barbe', 25], ['cf_h_coul', 40], ['cf_h_deco', 60],
  ['cf_fb_c', 55], ['cf_fb_m', 65], ['cf_fb_l', 75],
  ['cf_fcb_tc', 49], ['cf_fcb_c', 69], ['cf_fcb_m', 79], ['cf_fcb_l', 89],
  ['cf_fco_sn', 66], ['cf_fco_bc', 111], ['cf_fco_bm', 121], ['cf_fco_bl', 131],
  ['cf_fco_cbc', 125], ['cf_fco_cbm', 130], ['cf_fco_cbl', 140],
  ['cf_fm_bc', 160], ['cf_fm_bm', 170], ['cf_fm_bl', 190],
  ['cf_fm_cbc', 170], ['cf_fm_cbm', 180], ['cf_fm_cbl', 200], ['cf_fm_flash', 60],
  ['cf_fp_bc', 110], ['cf_fp_bm', 130], ['cf_fp_bl', 150],
  ['cf_fp_cbc', 135], ['cf_fp_cbm', 155], ['cf_fp_cbl', 175],
  ['cf_fl_bc', 150], ['cf_fl_bm', 250], ['cf_fl_bl', 350],
  ['cf_fl_cbc', 165], ['cf_fl_cbm', 265], ['cf_fl_cbl', 365],
  ['cf_e_g10', 30], ['cf_e_g15', 32], ['cf_e_f', 35],
];

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 420, height: 900}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  // On simule l'APPLICATION INSTALLÉE : sinon la barrière « Votre compte se crée dans
  // l'application » masque tout l'écran d'inscription prestataire.
  await p.addInitScript(() => {
    const vrai = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
      ? {matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}}
      : vrai(q));
  });
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.body.classList.add('standalone'); });

  console.log('A — les prix : relevé + 5 %, à l’euro');
  const grille = await p.evaluate(() => window.__cat.list('coiffure').map((a) => ({id: a.id, nm: a.nm, price: a.price, grp: a.grp || ''})));
  const parId = {}; grille.forEach((a) => { parId[a.id] = a; });
  let faux = [];
  RELEVE.forEach(([id, brut]) => {
    const attendu = Math.round(brut * 1.05);
    const a = parId[id];
    if (!a) faux.push(id + ' absente');
    else if (a.price !== attendu) faux.push(id + ' = ' + a.price + ' au lieu de ' + attendu);
  });
  ok(faux.length === 0, RELEVE.length + ' prestations au bon prix (' + faux.slice(0, 4).join(' · ') + ')');
  ok(parId['cf_h_barbe'] && parId['cf_h_barbe'].price === 26, 'Barbe : 25 € relevés → 26 €');
  ok(parId['cf_fl_cbl'] && parId['cf_fl_cbl'].price === 383, 'Lissage + coupe + brushing longs : 365 € → 383 €');
  ok(parId['cf_fco_cbm'] && parId['cf_fco_cbm'].price === 137, 'demi-euro arrondi au supérieur (130 → 136,5 → 137 €)');

  console.log('B — l’historique n’est pas cassé');
  ['cf_cpf', 'cf_cph', 'cf_cpe', 'cf_br', 'cf_coul', 'cf_bal', 'cf_chig'].forEach((id) => {
    ok(!!parId[id], 'l’ancienne prestation ' + id + ' existe toujours (commandes déjà passées)');
  });
  const ids = grille.map((a) => a.id);
  ok(new Set(ids).size === ids.length, 'aucun identifiant en double');
  ok(grille.every((a) => a.nm && Number(a.price) > 0), 'toutes les lignes ont un nom et un prix');

  console.log('C — les familles');
  const familles = await p.evaluate(() => window.__cat.groups('coiffure').map((G) => G.g + ':' + G.acts.length));
  ok(familles.length === 10, '10 familles (' + familles.join(' | ') + ')');
  ok(familles[0].indexOf('Homme') === 0, 'la première est « Homme »');
  ok(/^Autres prestations/.test(familles[familles.length - 1]), 'le fourre-tout « Autres prestations » passe en dernier');
  ok((await p.evaluate(() => window.__cat.groups('clim').length)) === 1,
    'un métier à une seule prestation n’a qu’un groupe (pas d’en-tête inutile)');

  console.log('D — CLIENT : la commande s’affiche par familles repliées');
  await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'client'; S.onboarded = true; S.guest = false;
    S.draft = window.__newMission({id: 'coiffure', nm: 'Coiffure'});
    window.__render();
  });
  await p.waitForTimeout(400);
  const nCartes = await p.evaluate(() => document.querySelectorAll('.actgrp').length);
  ok(nCartes === 10, 'les 10 familles sont des cartes repliées (' + nCartes + ')');
  const visibles = await p.evaluate(() => document.querySelectorAll('.actlist .actrow').length);
  ok(visibles === 0, 'aucune prestation dépliée d’entrée — pas de mur de 48 lignes');
  const entete = await p.evaluate(() => {
    const h = document.querySelector('.actgrp-h'); return h ? h.innerText.replace(/\s+/g, ' ').trim() : '';
  });
  ok(/Homme/.test(entete) && /5 prestations/.test(entete) && /dès 26/.test(entete),
    'chaque en-tête annonce la famille, le nombre et le prix d’appel (« ' + entete + ' »)');

  console.log('E — on déplie, on choisit, la famille se marque');
  await p.evaluate(() => { document.querySelector('.actgrp-h').click(); });
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => document.querySelectorAll('.actgrp')[0].querySelectorAll('.actrow').length)) === 5,
    'la famille ouverte montre ses 5 prestations');
  ok((await p.evaluate(() => document.querySelectorAll('.actrow').length)) === 5,
    'et les autres familles restent fermées');
  await p.evaluate(() => { document.querySelector('.actrow .actmain').click(); });
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => !!document.querySelector('.actgrp-n'))), 'la famille porte une pastille du nombre choisi');
  ok((await p.evaluate(() => (window.__S.draft.acts || []).length)) === 1, 'la prestation est bien retenue');
  await p.evaluate(() => { document.querySelector('.actgrp-h').click(); });
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => document.querySelectorAll('.actrow').length)) === 0, 'on peut la replier');
  ok((await p.evaluate(() => !!document.querySelector('.actgrp-n'))),
    'refermée, elle garde la pastille : le choix reste visible sans tout rouvrir');

  console.log('F — ARTISAN : la grille d’inscription est repliée elle aussi');
  await p.evaluate(() => {
    const S = window.__S;
    // Étape « Mes services » du dossier prestataire : c'est là qu'on lui montre la
    // grille et qu'on lui demande de l'accepter.
    S.draft = null; S.persona = 'pro'; S.proStatus = 'draft'; S.onboarded = false;
    S.authView = null; S.onbStep = 0; S.signupKind = 'artisan'; S.proStep = 'svc';
    S.proForm.cats = ['coiffure']; S.proForm.acceptsGrille = true;
    window.__render();
  });
  await p.waitForTimeout(400);
  const txtGrille = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  // innerText applique text-transform : l'intertitre ressort en capitales.
  ok(/grille tarifaire ti-services/i.test(txtGrille), 'la grille tarifaire est à l’écran');
  ok(/Femme · coloration/.test(txtGrille), 'les familles y figurent');
  ok(/€ net/.test(txtGrille), 'chaque famille annonce sa fourchette de net');
  ok(!/Coloration \+ coupe \+ brushing/.test(txtGrille),
    'le détail reste replié tant qu’on ne l’ouvre pas (48 lignes de net = illisible)');
  await p.evaluate(() => {
    const h = Array.from(document.querySelectorAll('.actgrp-h')).find((x) => /coloration/i.test(x.innerText));
    if (h) h.click();
  });
  await p.waitForTimeout(350);
  ok(/Coloration \+ coupe \+ brushing/.test(await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))),
    'ouverte, la famille montre chaque prestation avec le net de l’artisan');

  console.log('G — la fusion : une grille déjà retouchée par l’admin reçoit les nouveautés');
  const fusion = await p.evaluate(() => {
    const S = window.__S;
    // Ce que produirait une console admin d'AVANT : les 7 lignes génériques, une reprise.
    S.adminCatalog = {coiffure: [{id: 'cf_cpf', nm: 'Coupe femme + brushing', price: 80}]};
    S.catalogSeed = 0;
    const apres = window.__cat.list('coiffure');
    return {n: apres.length, prixAdmin: (apres.find((a) => a.id === 'cf_cpf') || {}).price,
      aLesNeuves: apres.some((a) => a.id === 'cf_fl_cbl')};
  });
  ok(fusion.prixAdmin === 80, 'le prix retouché par l’admin est respecté');
  ok(fusion.aLesNeuves, 'et les nouvelles prestations apparaissent quand même');
  const fige = await p.evaluate(() => {
    window.__S.catalogSeed = 2; // l'admin a enregistré depuis : sa grille fait foi
    return window.__cat.list('coiffure').length;
  });
  ok(fige === 1, 'une fois la grille enregistrée à jour, plus aucun ajout automatique');
  await p.evaluate(() => { window.__S.adminCatalog = null; window.__S.catalogSeed = 0; });

  console.log('H — CONSOLE ADMIN : régler les prix à l’euro près');
  // Vu en production : « pour la coiffure les boutons plus et moins ne marchent pas du
  // tout ». La console gardait une copie ANTÉRIEURE de la grille (7 lignes) ; les 41
  // nouvelles prestations s'affichaient (fusion) mais étaient introuvables à l'édition,
  // donc le clic ne faisait rien du tout. On rejoue exactement cet état.
  await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'admin'; S.admin = {view: 'home', sel: null}; S.proStep = null; S.draft = null;
    S.adminCatalog = {coiffure: [
      {id: 'cf_cpf', nm: 'Coupe femme + brushing', price: 70}, {id: 'cf_cph', nm: 'Coupe homme', price: 45},
      {id: 'cf_cpe', nm: 'Coupe enfant', price: 30}, {id: 'cf_br', nm: 'Brushing', price: 45},
      {id: 'cf_coul', nm: 'Couleur / racines', price: 85}, {id: 'cf_bal', nm: 'Balayage / mèches', price: 150},
      {id: 'cf_chig', nm: 'Chignon', price: 110}]};
    S.catalogSeed = 0;
    window.__render();
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('[data-fold="a-prices"]').click(); });
  await p.waitForTimeout(350);
  await p.evaluate(() => { document.querySelector('[data-adm="priceopen:coiffure"]').click(); });
  await p.waitForTimeout(450);
  const prix = (id) => p.evaluate((i) => {
    const a = window.__cat.list('coiffure').find((x) => x.id === i); return a ? a.price : null;
  }, id);
  ok((await p.evaluate(() => document.querySelectorAll('[data-actprice]').length)) === 96,
    'les 48 prestations ont leurs deux boutons');
  const avant = await prix('cf_fco_cbl');
  await p.evaluate(() => { document.querySelector('[data-actprice="coiffure:cf_fco_cbl:up"]').click(); });
  await p.waitForTimeout(350);
  ok((await prix('cf_fco_cbl')) === avant + 1,
    '« + » sur une prestation récente monte d’UN euro (avant : le clic ne faisait rien)');
  // Chaque clic redessine : il faut re-viser le bouton, l'ancien nœud est détaché.
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => { document.querySelector('[data-actprice="coiffure:cf_fco_cbl:down"]').click(); });
    await p.waitForTimeout(250);
  }
  ok((await prix('cf_fco_cbl')) === avant - 1, '« − » descend d’un euro à chaque clic');
  ok((await prix('cf_cpf')) === 70, 'les prix déjà réglés par l’admin ne sont pas écrasés');

  console.log('I — et on peut taper le prix directement');
  ok((await p.evaluate(() => document.querySelectorAll('[data-actpricev]').length)) === 48,
    'chaque prestation a un champ de saisie');
  await p.evaluate(() => {
    const i = document.querySelector('[data-actpricev="coiffure:cf_fco_cbl"]');
    i.value = '153'; i.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await p.waitForTimeout(300);
  ok((await prix('cf_fco_cbl')) === 153, 'le prix tapé au clavier est pris tel quel (153 €)');
  await p.evaluate(() => {
    const i = document.querySelector('[data-actpricev="coiffure:cf_fco_cbl"]');
    i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true}));
    i.focus(); i.blur(); // focusout : c'est lui qui recadre et enregistre
  });
  await p.waitForTimeout(350);
  ok((await prix('cf_fco_cbl')) === 1,
    'un champ laissé vide retombe à 1 € en sortant (jamais 0 : la commission serait faussée)');
  await p.evaluate(() => { window.__S.adminCatalog = null; window.__S.catalogSeed = 0; });

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');
  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
