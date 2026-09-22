/* CE QU'ON N'A JAMAIS DEMANDÉ N'EST PAS UNE TRACE PERDUE.

   Relevé le 22/09/2026 sur la fiche d'une cliente inscrite le jour même : « Conditions,
   non enregistrées ». La console venait d'apprendre à le dire ; restait à savoir
   POURQUOI. La réponse n'était pas celle qu'on croyait : l'acceptation n'avait pas été
   perdue, elle n'avait JAMAIS été demandée.

   « Continuer avec Google » crée un compte en un geste, et le bouton est posé AU-DESSUS
   du formulaire — c'est le formulaire qui porte la case à cocher. Quiconque passe par là
   obtient donc un compte sans avoir vu une ligne des conditions, et sans que rien ne
   l'enregistre. Trois écrans le proposent : inscription client, inscription prestataire,
   connexion (qui crée aussi un compte quand il n'en existe pas).

   LA MENTION VIT DANS LA FABRIQUE DU BOUTON, pas à côté de chaque emploi : c'est la
   seule façon qu'elle accompagne les trois — et le quatrième qu'on écrira. Le bouton de
   la page de connexion était d'ailleurs recopié à la main et n'en aurait rien su ; il
   passe par la fabrique.

   L'épreuve mesure le RENDU, pas la source : elle demande au navigateur si la phrase est
   là, si elle est bien SOUS le bouton (au-dessus, elle parlerait du formulaire), et si
   elle mène aux trois documents. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const o = { headless: true };
  if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', serviceWorkers: 'block' });
  // L'écran d'inscription n'est servi qu'à qui a l'application : sans cela on mesure la
  // porte d'installation, et l'épreuve passerait au vert sans avoir rien vu.
  await ctx.addInitScript(() => { try { localStorage.setItem('ti_installee', '1'); } catch (e) {} });
  const p = await ctx.newPage();
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S, null, { timeout: 20000 });

  console.log('\nA — la mention accompagne le bouton, sur les écrans qui créent un compte');
  const ecrans = [
    ['inscription client', () => { const S = window.__S; S.onboarded = false; S.persona = 'client'; S.showPitch = false;
      S.guest = false; S.authView = 'signup'; S.onbStep = 1;
      S.clientForm = { name: '', email: '', zone: 'Gustavia', password: '', password2: '', photo: '', terms: false };
      window.__render(); }],
    ['connexion', () => { const S = window.__S; S.onboarded = false; S.persona = 'client'; S.showPitch = false;
      S.guest = false; S.authView = 'login'; S.onbStep = 0; window.__render(); }],
  ];
  for (const [nom, poser] of ecrans) {
    await p.evaluate(poser); await p.waitForTimeout(350);
    const vu = await p.evaluate(() => {
      const g = document.querySelector('[data-act^="google-"]');
      const men = Array.from(document.querySelectorAll('p.mini'))
        .find((x) => /En continuant avec Google/.test(x.innerText));
      return { bouton: !!g, mention: !!men,
        sous: !!(g && men && men.getBoundingClientRect().top >= g.getBoundingClientRect().bottom - 2),
        liens: men ? Array.from(men.querySelectorAll('[data-legal]')).map((a) => a.getAttribute('data-legal')).sort() : [],
        deborde: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    ok(vu.bouton && vu.mention, nom + ' : le bouton Google porte la mention des conditions');
    // AU-DESSUS, elle parlerait du formulaire ; c'est le geste qu'elle doit qualifier.
    ok(vu.sous, nom + ' : et la mention est SOUS le bouton, donc avant le geste');
    ok(JSON.stringify(vu.liens) === JSON.stringify(['cgu', 'cgv', 'confidentialite']),
      nom + ' : elle mène aux trois documents (' + vu.liens.join(', ') + ')');
    ok(vu.deborde <= 1, nom + ' : rien ne déborde à 390 px');
  }

  console.log('\nB — un bouton Google recopié à la main n’aurait pas la mention');
  // On compte les boutons Google ÉCRITS dans la source hors de la fabrique : il ne doit
  // plus y en avoir. C'est la garde qui empêche le défaut de revenir par un copier-coller.
  const horsFabrique = (src.match(/<button[^>]*data-act="google-[a-z]+"/g) || []).length;
  ok(horsFabrique === 0, 'aucun bouton Google écrit à la main dans la source ('
    + horsFabrique + ') — ils passent tous par la fabrique');
  /* ET DANS LA COQUILLE NATIVE, LE BLOC ENTIER DISPARAÎT. La règle masquait les boutons
     en les ÉNUMÉRANT ; la mention, ajoutée à côté, serait restée seule — une phrase qui
     parle d'un bouton absent, dans l'application de l'App Store. On ne lit pas la règle
     dans la feuille : on DEMANDE au navigateur ce qu'il applique, des deux côtés. */
  const poser = (n) => { const S = window.__S; document.body.classList.toggle('native-shell', n);
    S.onboarded = false; S.persona = 'client'; S.showPitch = false; S.guest = false;
    S.authView = 'signup'; S.onbStep = 1;
    S.clientForm = { name: '', email: '', zone: 'Gustavia', password: '', password2: '', photo: '', terms: false };
    window.__render(); };
  const dis = {};
  for (const nat of [false, true]) {
    await p.evaluate(poser, nat); await p.waitForTimeout(250);
    await p.evaluate(poser, nat); await p.waitForTimeout(120);
    dis[nat ? 'natif' : 'web'] = await p.evaluate(() => {
      const bloc = document.querySelector('.g-bloc');
      return bloc ? getComputedStyle(bloc).display : 'absent';
    });
  }
  ok(dis.web !== 'none' && dis.web !== 'absent',
    'dans un navigateur, le bloc Google s’affiche (' + dis.web + ')');
  ok(dis.natif === 'none',
    'et dans la coquille native il disparaît ENTIER, mention comprise (' + dis.natif + ')');
  ok(/function googleBtnHtml\([\s\S]{0,2600}En continuant avec Google/.test(src),
    'et la mention est écrite DANS la fabrique, donc partout à la fois');

  console.log('\nC — ce qui est enregistré, et ce qui ne s’invente pas');
  ok(/parGoogle[\s\S]{0,400}fiche\.acceptedTerms=true; fiche\.termsVersion=TERMS_VERSION; fiche\.termsVia='google'/.test(src),
    'un compte créé par Google note son acceptation, sa version et sa date');
  // ET SEULEMENT LUI : une fiche reconstruite pour une autre raison n'a rien vu, on ne
  // lui fabrique pas un consentement.
  ok(/if\(parGoogle\)\{ fiche\.acceptedTerms=true/.test(src),
    'et une fiche reconstruite pour une AUTRE raison n’en reçoit aucun');
  ok(/profilRepareVia:parGoogle\?'google':''/.test(src),
    'la fiche garde par quoi elle est arrivée, pour que la console n’ait pas à deviner');
  ok(/cc\.profilRepareVia==='google'\?'Compte créé par/.test(src),
    'et la console nomme la bonne cause des trois');

  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
