/* « Ce n'est pas assez précis. »

   Sur la capture du 05/10/2026 : 16 comptes bloqués, dont ONZE au premier mur, « n'a
   jamais touché au catalogue ». Ce chiffre mélangeait trois populations qui n'appellent
   pas le même geste.

   1) CELUI QUI S'EST INSCRIT AVANT QUE LA MESURE EXISTE. Les jalons sont en ligne depuis
      le 01/10/2026 ; un compte d'avant n'en porte aucun, QUOI QU'IL AIT FAIT. Le ranger
      au premier mur, c'est AFFIRMER qu'il n'a jamais ouvert le catalogue — on n'en sait
      rien, et c'était le mur le plus garni. Un compte d'avant qui porte au moins un jalon
      est repassé DEPUIS : lui se mesure comme les autres.
   2) CELUI QUI N'EST JAMAIS REPASSÉ. Il n'est pas retenu par un écran, il est parti.
   3) CELUI QUI EST REVENU ET N'A TOUJOURS RIEN OUVERT. Le seul des trois qui dise
      quelque chose sur le produit.

   Et un nombre ne se relance pas : chaque mur se déplie en NOMS. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const JOUR = 864e5;

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__parcours && window.__murs, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  const DEPUIS = await p.evaluate(() => window.__murs.depuis());
  ok(DEPUIS > Date.UTC(2026, 8, 30) && DEPUIS < Date.UTC(2026, 9, 3), 'la date des jalons est celle de leur mise en ligne : ' + new Date(DEPUIS).toISOString().slice(0, 10));

  console.log('A — un compte d’AVANT la mesure n’est plus accusé d’être resté à la porte');
  const A = await p.evaluate((d) => {
    const MAINT = d + 10 * 864e5;
    const cl = [
      { uid: 'vieux1', name: 'Avant un', email: 'a1@x.fr', createdAt: d - 5 * 864e5, jalons: {}, push: 0, addresses: [], card: 'Aucune carte' },
      { uid: 'vieux2', name: 'Avant deux', email: 'a2@x.fr', createdAt: d - 20 * 864e5, jalons: {}, push: 1, addresses: [], card: 'Aucune carte' },
      // Inscrit avant, MAIS repassé depuis : il porte un jalon, donc il se mesure.
      { uid: 'vieuxActif', name: 'Avant revenu', email: 'a3@x.fr', createdAt: d - 9 * 864e5, jalons: { revenu: d + 864e5 }, push: 1, addresses: [], card: 'Aucune carte' },
      { uid: 'neuf', name: 'Après', email: 'n@x.fr', createdAt: d + 2 * 864e5, jalons: {}, push: 1, addresses: [], card: 'Aucune carte' },
    ];
    const P = window.__parcours(cl, {}, MAINT);
    const mur = (c) => (P.murs.filter((m) => m.cle === c)[0] || {});
    return { total: P.total, avant: P.avant, quiAvant: P.quiAvant.map((c) => c.uid), cat: mur('catalogue').n, quiCat: (mur('catalogue').qui || []).map((c) => c.uid), bloques: P.bloques };
  }, DEPUIS);
  ok(A.avant === 2 && A.quiAvant.join(',') === 'vieux1,vieux2', 'les deux comptes d’avant, muets depuis, sont mis à part : ' + A.quiAvant.join(', '));
  ok(A.cat === 2 && A.quiCat.indexOf('neuf') >= 0 && A.quiCat.indexOf('vieuxActif') >= 0, 'le premier mur ne garde que ceux dont le silence prouve quelque chose : ' + A.quiCat.join(', '));
  ok(A.bloques === 2, 'et les comptes non mesurables ne gonflent plus le nombre de bloqués : ' + A.bloques);

  console.log('B — chaque mur dit ce qu’il sait de SES occupants');
  const B = await p.evaluate((d) => {
    const MAINT = d + 30 * 864e5;
    const n = (u, j, extra) => Object.assign({ uid: u, name: u, email: u + '@x.fr', createdAt: d + 864e5, jalons: j, push: 1, addresses: [{}], card: 'Visa ••42' }, extra || {});
    const cl = [
      n('parti1', {}), n('parti2', {}),
      n('revenu1', { revenu: 1 }),
      n('vuCat', { catalogue: 1, revenu: 1 }),
      n('vieilParti', {}, { createdAt: d + 864e5 }),      // inscrit il y a 29 jours
      n('indispo1', { indispo: 1 }),
    ];
    const P = window.__parcours(cl, {}, MAINT);
    const mur = (c) => P.murs.filter((m) => m.cle === c)[0];
    return { cat: mur('catalogue').faits, config: mur('config').faits, sousCat: window.__murs.sous(mur('catalogue').faits), sousVide: window.__murs.sous({ n: 0 }) };
  }, DEPUIS);
  ok(B.cat.n === 5 && B.config.n === 1, 'les occupants sont répartis sur deux murs : ' + B.cat.n + ' et ' + B.config.n);
  ok(B.cat.jamais === 4 && B.cat.revenus === 1, 'le premier mur distingue ceux qui sont partis de ceux qui reviennent : ' + B.cat.jamais + ' / ' + B.cat.revenus);
  ok(B.cat.jamais + B.cat.revenus === B.cat.n, 'et les deux font le compte, toujours');
  ok(B.cat.indispo === 1, 'le métier pas encore ouvert est compté là où il se produit');
  ok(B.config.revenus === 1 && B.config.jamais === 0, 'le second mur a ses propres chiffres, pas ceux du voisin');
  ok(/jamais repassés/.test(B.sousCat) && /revenu un autre jour/.test(B.sousCat), 'la sous-ligne du mur le dit en toutes lettres : ' + B.sousCat.replace(/<[^>]+>/g, ''));
  ok(B.sousVide === '', 'un mur vide ne dit rien');

  console.log('C — le nombre se déplie en NOMS, du plus ancien au plus récent');
  const C = await p.evaluate((d) => {
    const qui = [
      { uid: 'b', name: 'Bernadette', email: 'b@x.fr', createdAt: d + 5 * 864e5, push: 0, addresses: [], card: 'Aucune carte', jalons: {} },
      { uid: 'a', name: 'Alphonse', email: 'a@x.fr', createdAt: d + 1 * 864e5, push: 1, addresses: [{}], card: 'Visa ••42', jalons: { revenu: 1 } },
    ];
    const h = window.__murs.qui(qui, d + 10 * 864e5);
    return { h: h, posA: h.indexOf('Alphonse'), posB: h.indexOf('Bernadette') };
  }, DEPUIS);
  ok(C.posA >= 0 && C.posB >= 0 && C.posA < C.posB, 'le plus ancien inscrit vient en tête : c’est celui qu’on risque de perdre');
  ok(/mailto:a@x\.fr/.test(C.h) && /mailto:b@x\.fr/.test(C.h), 'chaque nom porte son adresse, cliquable : une relance se fait compte par compte');
  ok(/inscrit il y a 9 jours/.test(C.h) && /inscrit il y a 5 jours/.test(C.h), 'et depuis combien de temps il attend');
  // « Je ne comprends pas bien ta logique : sans carte, injoignable, revenu… » — les
  // étiquettes sont devenues des PHRASES, dans l'ordre où l'on décide.
  ok(/Jamais revenu, et ne reçoit pas les notifications\./.test(C.h),
    'ce qu’on lit se comprend tout seul : ' + (C.h.match(/Jamais revenu[^<]*/) || [''])[0]);
  ok(/Ni adresse ni carte enregistrée\./.test(C.h), 'et ce qui lui manque pour commander se dit en français');
  ok(!/injoignable/.test(C.h), '« injoignable » a disparu : son adresse e-mail est juste au-dessus, cliquable');
  ok(!/>revenu</.test(C.h) && !/· revenu/.test(C.h), 'et « revenu » seul aussi : on le lisait comme un revenu d’argent');

  console.log('D — ce qui ne devait pas changer n’a pas changé');
  const D = await p.evaluate((d) => {
    const MAINT = d + 30 * 864e5;
    const cl = [
      { uid: 'cmd', name: 'A commandé', email: 'c@x.fr', createdAt: d + 864e5, jalons: { catalogue: 1, config: 1, paiement: 1 }, push: 1, addresses: [{}], card: 'Visa ••42' },
      { uid: 'ko', name: 'Carte refusée', email: 'k@x.fr', createdAt: d + 864e5, jalons: { catalogue: 1, config: 1, paiement: 1 }, push: 1, addresses: [{}], card: 'Visa ••42' },
      { uid: 'vieuxCmd', name: 'Avant, mais a commandé', email: 'v@x.fr', createdAt: d - 864e5, jalons: {}, push: 1, addresses: [{}], card: 'Visa ••42' },
      { uid: 'test', name: 'Test', email: 't@x.fr', test: true, createdAt: d + 864e5, jalons: {}, push: 1, addresses: [], card: 'Aucune carte' },
    ];
    const req = { cmd: [{ status: 'done' }], ko: [{ status: 'payment_failed' }], vieuxCmd: [{ status: 'done' }] };
    const P = window.__parcours(cl, req, MAINT);
    return { total: P.total, exclus: P.exclus, abouti: P.abouti, cmdMur: P.murs.filter((m) => m.cle === 'commande')[0].n, sansJalon: P.sansJalon, avant: P.avant };
  }, DEPUIS);
  ok(D.exclus === 1 && D.total === 3, 'un compte de test reste écarté, et dit comme tel');
  ok(D.abouti === 2, 'celui qui a commandé est toujours abouti');
  ok(D.cmdMur === 1, 'celui dont la carte a échoué reste arrêté au paiement');
  ok(D.sansJalon === 1, 'un compte d’avant QUI A COMMANDÉ est classé par sa demande, pas mis à part : sa preuve est plus forte');
  ok(D.avant === 0, 'et il ne tombe donc pas dans « on ne sait pas » : ' + D.avant);

  console.log('E — la carte de la console, rendue, et le mur qui se déplie');
  const E = await p.evaluate((d) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null };
    S.adminArtisans = []; S.adminArtsLoaded = true;
    S.adminReqs = []; S.adminReqsLus = true; S.adminDrafts = []; S.adminClisLoaded = true;
    S.adminClients = [
      { uid: 'u1', name: 'Jeanne Ledée', email: 'jeanne@x.fr', createdAt: d + 864e5, jalons: {}, push: 0, addresses: [], card: 'Aucune carte enregistrée' },
      { uid: 'u2', name: 'Paul Magras', email: 'paul@x.fr', createdAt: d + 2 * 864e5, jalons: { revenu: 1 }, push: 1, addresses: [], card: 'Aucune carte enregistrée' },
      { uid: 'u3', name: 'Marie Questel', email: 'marie@x.fr', createdAt: d - 4 * 864e5, jalons: {}, push: 0, addresses: [], card: 'Aucune carte enregistrée' },
    ];
    S._fold = { 'a-parcours': true }; S.admMurOpen = {};
    window.__render();
    const carte = () => [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="a-parcours"]'));
    const avant = carte() ? carte().innerText.replace(/\s+/g, ' ') : '';
    const btn = carte() && carte().querySelector('[data-adm="mur:catalogue"]');
    if (btn) btn.click();
    const apres = carte() ? carte().innerText.replace(/\s+/g, ' ') : '';
    return { avant: avant, apres: apres, bouton: !!btn };
  }, DEPUIS);
  ok(/jamais touché au catalogue/.test(E.avant), 'la carte s’affiche toujours');
  ok(/on ne sait pas où il s.est arrêté/i.test(E.avant), 'et elle dit à part le compte d’avant la mesure : « ' + ((E.avant.match(/On ne sait pas[^0-9]{0,60}/) || [''])[0]) + ' »');
  ok(/1er octobre/.test(E.avant), 'en nommant la date où la mesure a commencé');
  ok(E.bouton && !/Jeanne Ledée/.test(E.avant), 'le mur est replié au départ : on voit un nombre');
  ok(/Jeanne Ledée/.test(E.apres) && /Paul Magras/.test(E.apres), 'un clic le déplie en noms');
  ok(!/Marie Questel/.test(E.apres), 'et le compte d’avant la mesure n’est pas dans ce mur');

    console.log('F — les quatre cas, écrits en français');
  // `DEPUIS` vit côté Node, l'évaluation côté navigateur : on le PASSE, sinon la fonction
  // le cherche dans la page et ne le trouve pas.
  const P = await p.evaluate((DEPUIS) => {
    const c = (o) => window.__murs.phrases(Object.assign({ jalons: {}, push: 0, addresses: [], card: 'Aucune carte' }, o));
    return {
      perdu: c({}),
      revenuSansPush: c({ jalons: { revenu: 1 } }),
      revenuAvecPush: c({ jalons: { revenu: 1 }, push: 1, addresses: [{}], card: 'Visa ••42' }),
      jamaisAvecPush: c({ push: 1, addresses: [{}], card: 'Visa ••42' }),
      sansAdresse: c({ push: 1, card: 'Visa ••42' }),
      sansCarte: c({ push: 1, addresses: [{}] }),
      // OÙ IL S'EST ARRÊTÉ : les quatre profondeurs, plus le cas d'avant la mesure.
      catalogue: c({ jalons: { catalogue: 1 } }),
      config: c({ jalons: { catalogue: 1, config: 1 } }),
      paiement: c({ jalons: { catalogue: 1, config: 1, paiement: 1 } }),
      indispo: c({ jalons: { catalogue: 1, indispo: 1 } }),
      avant: c({ createdAt: DEPUIS - 864e5 }),
      apres: c({ createdAt: DEPUIS + 864e5 }),
    };
  }, DEPUIS);
  ok(P.perdu.join(' ') === 'N’a pas ouvert le catalogue. Jamais revenu, et ne reçoit pas les notifications. Ni adresse ni carte enregistrée.',
    'le cas le plus froid : « ' + P.perdu.join(' ') + ' »');
  ok(P.revenuAvecPush.join(' ') === 'N’a pas ouvert le catalogue. Revenu une autre fois.',
    'et le plus chaud ne dit QUE ce qu’il y a à dire : « ' + P.revenuAvecPush.join(' ') + ' »');
  ok(/mais ne reçoit pas les notifications/.test(P.revenuSansPush[1]),
    'revenu mais sans notification : les deux faits tiennent dans une phrase, pas dans deux étiquettes');
  ok(P.jamaisAvecPush.length === 2 && /Jamais revenu depuis son inscription\./.test(P.jamaisAvecPush[1]),
    'rien ne manque, rien ne s’ajoute : on n’écrit pas « adresse enregistrée » pour meubler');
  ok(P.sansAdresse.join(' ').indexOf('Pas d’adresse enregistrée.') >= 0
    && P.sansAdresse.join(' ').indexOf('carte') < 0, 'un seul manque se dit au singulier');
  ok(P.sansCarte.join(' ').indexOf('Pas de carte enregistrée.') >= 0, 'et l’autre aussi');
  ok(P.perdu.every(function (x) { return /\.$/.test(x); }), 'ce sont des phrases : elles finissent par un point');

  /* G — « Je ne sais toujours pas s'ils ont essayé de commander ou s'ils ont au moins
     navigué dans les services. » Les jalons répondaient déjà ; ils ne servaient qu'à
     ranger la personne sous un mur, et ce mur est un titre qui a défilé hors de l'écran
     quand on lit la quatrième fiche. La ligne porte maintenant le plus LOIN atteint, en
     PREMIER — c'est la question qu'on vient y poser. */
  console.log('G — chaque ligne dit où cette personne s’est arrêtée');
  ok(P.catalogue[0] === 'A parcouru les services, sans rien configurer.',
    'a navigué sans rien configurer : « ' + P.catalogue[0] + ' »');
  ok(P.config[0] === 'A configuré une prestation, sans aller jusqu’au paiement.',
    'a essayé de commander : « ' + P.config[0] + ' »');
  ok(P.paiement[0] === 'Est allé jusqu’à l’écran de paiement.',
    'est allé jusqu’au paiement : « ' + P.paiement[0] + ' »');
  ok(P.apres[0] === 'N’a pas ouvert le catalogue.',
    'et sans aucun jalon APRÈS la mesure, le silence se lit : « ' + P.apres[0] + ' »');
  /* ET L'ABSENCE DE JALON NE PROUVE RIEN AVANT LA MESURE : affirmer « n'a pas ouvert le
     catalogue » sur un compte né avant le 01/10/2026 serait une invention — c'est la
     distinction que la carte « On ne sait pas où ils se sont arrêtés » tient déjà. */
  ok(/on ne sait pas où il s’est arrêté/.test(P.avant[0]),
    'avant la mesure, on ne sait pas, et on le DIT : « ' + P.avant[0].replace(/&nbsp;/g, ' ') + ' »');
  ok(P.indispo.join(' ').indexOf('A demandé un métier qu’on n’ouvre pas encore.') >= 0,
    'et ce qu’on vous demande sans le vendre encore se dit aussi');

    ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
