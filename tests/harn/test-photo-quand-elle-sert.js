/* « IL Y A CERTAINS MÉTIERS OÙ AU MOMENT DE LA COMMANDE ON DEMANDE UNE PHOTO ET D'AUTRES
   NON : DEMANDE-LA POUR LES PRESTATIONS OÙ CELA EST PERTINENT. »

   Mesuré : elle était demandée PARTOUT, et ce qui variait n'était pas le métier mais
   l'ÉCRAN. À l'acte le bloc est posé en clair, à l'heure il dort sous « ＋ Options,
   photo, précision ». Elle sautait donc aux yeux sur un massage — où l'on n'a rien à
   photographier — et se cachait sur une plomberie, où la photo de la fuite est la chose
   la plus utile de la commande.

   LE MÉTIER DÉCLARE, et deux valeurs seulement : `etat` (ce qu'il y a à faire) et
   `envie` (le résultat souhaité). L'épreuve mesure l'ÉCRAN RENDU, pas la table : une
   déclaration que le rendu ne lirait pas ne changerait rien pour personne. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg && window.__svc && window.__setFB);

  // Le repli « ＋ Options, photo, précision » est OUVERT : sans cela on mesurerait le
  // repli et non la règle, et tous les métiers à l'heure paraîtraient sans photo.
  const ecran = (svc, deplie) => p.evaluate(({ svc, deplie }) => {
    window.__setFB({ auth: { currentUser: { uid: 'u' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve() },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.persona = 'client'; S.clientNav = 'home';
    S.guest = false; S.demoMode = false; S.admin = null; S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.mission = null; S.payStep = false; S.addresses = []; S._proDir = {};
    S.cfgMore = !!deplie;
    S.draft = window.__newMission(window.__svc.trouve(svc));
    S._cfgVu = null; window.__cfg.render();
    const v = document.getElementById('view');
    return { photo: v.querySelectorAll('[data-photoinput]').length > 0,
      txt: v.textContent || '' };
  }, { svc, deplie });

  console.log('\nA — là où l’on a quelque chose à MONTRER');
  for (const svc of ['plomberie', 'electricite', 'jardin', 'demenagement', 'piscine', 'clim', 'deck', 'menage']) {
    const r = await ecran(svc, true);
    ok(r.photo && /préparer sa venue/.test(r.txt),
      svc + ' : la photo est proposée, et l’écran dit à quoi elle sert');
  }

  console.log('\nB — là où c’est le RÉSULTAT qu’on montre');
  for (const svc of ['coiffure', 'manucure', 'maquillage']) {
    const r = await ecran(svc, true);
    ok(r.photo && /résultat que vous aimeriez/.test(r.txt),
      svc + ' : on demande l’envie, pas l’état — ce n’est pas la même photo');
  }

  console.log('\nC — là où le client n’a rien à photographier');
  for (const svc of ['massage', 'baby', 'yoga', 'pilates', 'coach', 'natation', 'epilation', 'epilationdef']) {
    const r = await ecran(svc, true);
    ok(!r.photo, svc + ' : aucune photo demandée');
  }

  /* D — LE REPLI NE PROMET QUE CE QU'IL CONTIENT. Il n'existe que sur l'écran à
     l'HEURE : les métiers à l'acte posent leurs champs en clair. On mesure donc sur deux
     métiers qui ont ce repli — le baby-sitting, où l'on n'a rien à photographier, et le
     ménage, où l'on a le lieu. */
  console.log('\nD — le repli ne promet que ce qu’il contient');
  const replie = await ecran('baby', false);
  ok(/＋ Options, précision/.test(replie.txt) && !/＋ Options, photo/.test(replie.txt),
    'sans photo, le bouton ne la nomme plus');
  const avecPhoto = await ecran('menage', false);
  ok(/＋ Options, photo, précision/.test(avecPhoto.txt),
    'et il la nomme quand elle est là');

  /* E — UN MÉTIER CRÉÉ DEPUIS LA CONSOLE. L'absence de la clé n'est pas une réponse pour
     ceux d'AVANT cette mesure : la photo y était hier, la retirer en silence d'un métier
     qu'on n'a pas pu interroger serait une perte. Dès qu'on touche l'interrupteur, la
     clé est écrite des deux côtés et l'absence cesse de décider. */
  console.log('\nE — les métiers créés depuis la console');
  const custom = await p.evaluate(() => {
    const S = window.__S;
    S.customServices = [{ id: 'peinture', nm: 'Peinture', rate: 50, custom: true, cat: '', lieu: 'domicile' },
      { id: 'admin2', nm: 'Administratif', rate: 40, custom: true, cat: '', lieu: 'domicile', photo: '' },
      { id: 'tatouage', nm: 'Tatouage', rate: 90, custom: true, cat: '', lieu: 'domicile', photo: 'etat' }];
    const lu = (id) => { S.cfgMore = true; S.draft = window.__newMission(window.__svc.trouve(id));
      S._cfgVu = null; window.__cfg.render();
      return document.getElementById('view').querySelectorAll('[data-photoinput]').length > 0; };
    return { avant: lu('peinture'), eteint: lu('admin2'), allume: lu('tatouage') };
  });
  ok(custom.avant, 'un métier créé avant la mesure garde sa photo : on ne retire rien en silence');
  ok(!custom.eteint, 'un métier dont l’interrupteur est éteint ne la demande plus');
  ok(custom.allume, 'et allumé, il la demande');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
