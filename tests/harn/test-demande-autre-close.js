/* UNE DEMANDE « AUTRE » DOIT POUVOIR SE CLORE.

   « J'ai validé et créé son métier, sa prestation, mais je ne peux pas enlever tous ces
   messages. » Sur la fiche d'un loueur de catamaran, le 05/10/2026.

   LE BANDEAU ET LE BOUTON VIVENT SUR `cats.includes('autre') && other`, et UNE SEULE chose
   les retirait : le bouton « Ajouter au catalogue ». Or ce bouton créait un métier portant
   la PHRASE ENTIÈRE du prestataire — « Location de catamaran avec skipper sur st
   Barthelemy et les Caraïbes, à la demie journée, journée, weekend et semaine. » — ce que
   personne ne veut dans une grille de métiers. L'éditeur a donc fait le travail ailleurs,
   en nommant proprement, et la fiche a continué de réclamer un geste déjà fait.

   DEUX MANQUES : le nom du métier doit se CHOISIR, et la demande doit pouvoir se CLORE à
   la main. On ne devine pas qu'elle est traitée — effacer une demande sur un pari est
   pire que la laisser. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const PHRASE = 'Location de catamaran avec skipper sur st Barthelemy et les Caraïbes, à la demie journée, journée, weekend et semaine.';
const ART = (x) => Object.assign({ id: 'a1', uid: 'a1', real: false, name: 'Vincent Beaudouin',
  status: 'valide', siret: '12345678901234', insured: true, insuranceStatus: 'valide',
  cats: ['autre'], other: PHRASE, otherPrice: 950, otherUnit: 'forfait', otherPriceNote: '',
  rates: { autre: 950 }, jobs: 0, tierForce: '', founder: false }, x);

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__statut && window.__statut.autre, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — le nom proposé est un nom de métier, pas une offre commerciale');
  const A = await p.evaluate((ph) => ({
    sien: window.__statut.nom(ph),
    court: window.__statut.nom('Vitrier'),
    virgule: window.__statut.nom('Peinture, intérieur et extérieur, devis gratuit'),
    long: window.__statut.nom('Un service dont le nom compte beaucoup trop de mots pour tenir'),
    vide: window.__statut.nom(''),
  }), PHRASE);
  ok(A.sien === 'Location de catamaran avec skipper',
    'sa phrase donne « ' + A.sien +' »');
  ok(A.sien.length < 40 && !/Caraïbes|weekend/.test(A.sien), 'et plus rien de son offre');
  ok(A.court === 'Vitrier', 'un nom déjà court ne bouge pas');
  ok(A.virgule === 'Peinture', 'la ponctuation forte coupe');
  ok(A.long.split(' ').length <= 6, 'six mots au plus (' + A.long + ')');
  ok(A.vide === '', 'et rien ne donne rien');

  console.log('\nB — la fiche offre les DEUX sorties');
  const B = await p.evaluate((base) => {
    window.__S._autreNom = null;
    const vue = window.__statut.autre(base);
    return { vue: vue, champ: /id="autreNom"/.test(vue), valeur: (/id="autreNom"[^>]*value="([^"]*)"/.exec(vue) || [])[1],
      creer: /data-adm="addcat:a1"/.test(vue), clore: /data-adm="autre-clos:a1"/.test(vue) };
  }, ART({}));
  ok(B.champ, 'le nom du métier se saisit');
  ok(B.valeur === 'Location de catamaran avec skipper', 'pré-rempli de la proposition courte (' + B.valeur + ')');
  ok(B.creer, 'le bouton de création est là');
  ok(B.clore, 'et « Retirer cette demande » aussi — la porte qui manquait');
  ok(/paraîtra dans la grille des métiers/.test(B.vue), 'la carte dit où ce nom ira');
  ok(/traitée autrement, ou refusée/.test(B.vue), 'et à quoi sert le retrait');

  console.log('\nC — rien ne s’affiche quand il n’y a plus de demande');
  const C = await p.evaluate((base) => [
    window.__statut.autre(Object.assign({}, base, { cats: ['menage'] })),
    window.__statut.autre(Object.assign({}, base, { other: '' })),
  ], ART({}));
  ok(C[0] === '' && C[1] === '', 'ni métier « autre », ni phrase : la carte disparaît');

  console.log('\nD — créer le métier clôt la demande, dans l’écran réel');
  await p.evaluate((base) => {
    const S = window.__S;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    S.persona = 'admin'; S.onboarded = true; S.authView = null; S._autreNom = null;
    S.customServices = []; S.adminArtisans = [Object.assign({}, base)];
    S.admin = { view: 'art', sel: 'a1' };
    window.__render();
  }, ART({}));
  await p.waitForTimeout(400);
  const D0 = await p.evaluate(() => ({ bandeau: /Service « Autre » proposé/.test(document.getElementById('view').textContent || ''),
    champ: !!document.querySelector('#view #autreNom') }));
  ok(D0.bandeau && D0.champ, 'la demande est bien affichée au départ');
  // L'éditeur nomme le métier lui-même, comme il l'a fait en vrai.
  await p.evaluate(() => {
    const el = document.querySelector('#view #autreNom');
    el.value = 'Location Catamaran';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#view [data-adm="addcat:a1"]').click();
  });
  await p.waitForTimeout(450);
  const D = await p.evaluate(() => {
    const a = window.__S.adminArtisans[0];
    return { nomsCatalogue: (window.__S.customServices || []).map((x) => x.nm),
      cats: a.cats, other: a.other, prix: a.otherPrice,
      bandeau: /Service « Autre » proposé/.test(document.getElementById('view').textContent || ''),
      carte: !!document.querySelector('#view #autreNom') };
  });
  ok(D.nomsCatalogue.length === 1 && D.nomsCatalogue[0] === 'Location Catamaran',
    'le métier porte LE NOM CHOISI, pas sa phrase (' + JSON.stringify(D.nomsCatalogue) + ')');
  ok(D.cats.indexOf('autre') < 0 && D.cats.length === 1, 'il quitte « Autre » pour son vrai métier (' + JSON.stringify(D.cats) + ')');
  ok(D.other === '' && D.prix === 0, 'la phrase et le prix quittent sa fiche');
  ok(!D.bandeau && !D.carte, 'et les deux messages ont disparu');

  console.log('\nE — et si elle a été traitée autrement, on la retire');
  await p.evaluate((base) => {
    window.__S._autreNom = null; window.__S.customServices = [];
    window.__S.adminArtisans = [Object.assign({}, base, { cats: ['autre', 'c_loccata'] })];
    window.__S.admin = { view: 'art', sel: 'a1' };
    window.__render();
  }, ART({}));
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('#view [data-adm="autre-clos:a1"]').click());
  await p.waitForTimeout(450);
  const E = await p.evaluate(() => {
    const a = window.__S.adminArtisans[0];
    return { cats: a.cats, other: a.other,
      bandeau: /Service « Autre » proposé/.test(document.getElementById('view').textContent || ''),
      vue: window.__S.admin.view };
  });
  ok(E.cats.indexOf('autre') < 0 && E.cats.indexOf('c_loccata') >= 0,
    'la demande part, son vrai métier reste (' + JSON.stringify(E.cats) + ')');
  ok(E.other === '' && !E.bandeau, 'et le bandeau avec');
  ok(E.vue === 'art', 'sans quitter sa fiche');

  console.log('\nF — ce qui est tapé survit à un redessin');
  // La console écoute Firestore en direct : un instantané au mauvais moment effacerait
  // le nom en train d'être saisi.
  await p.evaluate((base) => {
    window.__S._autreNom = null; window.__S.customServices = [];
    window.__S.adminArtisans = [Object.assign({}, base)];
    window.__S.admin = { view: 'art', sel: 'a1' };
    window.__render();
  }, ART({}));
  await p.waitForTimeout(350);
  const F = await p.evaluate(() => {
    const el = document.querySelector('#view #autreNom');
    el.value = 'Sortie en mer'; el.dispatchEvent(new Event('input', { bubbles: true }));
    window.__render();                       // l'instantané arrive
    return (document.querySelector('#view #autreNom') || {}).value;
  });
  ok(F === 'Sortie en mer', 'le nom saisi est toujours là après le redessin (' + F + ')');

  console.log('\nG — la fiche d’un prestataire SEUL sur son métier ne plante plus');
  // Trouvé ici, et sans rapport avec la demande « Autre » : « 2 métiers » (un pluriel)
  // était déclaré DANS `adminHome`, et `adminFiche` s'en servait. Toute fiche d'un
  // prestataire VALIDÉ, non reconnu comme compte de test et SEUL à proposer l'un de ses
  // métiers levait une ReferenceError qui emportait l'écran entier de la console —
  // c'est-à-dire la fiche du premier prestataire d'un métier neuf, celui qu'on vient de
  // valider.
  const avant = errs.length;
  await p.evaluate((base) => {
    const S = window.__S;
    S.customServices = [{ id: 'c_loccata', nm: 'Location Catamaran', rate: 950 }];
    S.adminArtisans = [Object.assign({}, base, { cats: ['c_loccata'], other: '', status: 'valide', test: false })];
    S.admin = { view: 'art', sel: 'a1' };
    // Un rendu qui LÈVE rapporte au lieu de faire tomber l'épreuve : c'est précisément le
    // défaut mesuré ici, il ne doit pas emporter les assertions qui le constatent.
    try { window.__render(); window.__renduOk = true; } catch (e) { window.__renduOk = String(e && e.message); }
  }, ART({}));
  await p.waitForTimeout(400);
  const G = await p.evaluate(() => {
    const t = document.getElementById('view').textContent || '';
    return { rendu: /Compte de test/.test(t), pluriel: /1 métier\b/.test(t) || /métiers? repasseraient/.test(t) };
  });
  const Gok = await p.evaluate(() => window.__renduOk);
  ok(Gok === true, 'le rendu de sa fiche ne lève pas (' + Gok + ')');
  ok(G.rendu, 'sa fiche se rend entièrement');
  ok(errs.length === avant, 'sans la moindre erreur (' + errs.slice(avant).join(' | ') + ')');
  const G2 = await p.evaluate(() => window.__statut ? (typeof window.__S === 'object') : false);
  ok(G2, 'et la console reste debout');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
