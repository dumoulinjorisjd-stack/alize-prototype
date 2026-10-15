/* TROIS SIGNALEMENTS DE L'ÉDITEUR, LE 15/10/2026.

   1. « C'EST ÉCRIT COMPTE SUPPRIMÉ ALORS QU'IL N'EST PAS SUPPRIMÉ. » Régression de la
      v865, et elle était inévitable : jusque-là `supportArchive` ne contenait QUE des
      comptes partis, donc la console pouvait écrire « parti » sans rien vérifier. Depuis
      que chaque message y est copié À L'ÉCRITURE, l'archive contient aussi toutes les
      conversations vivantes — chacune paraissait deux fois, dont une sous une étiquette
      fausse.

   2. « LA PASTILLE 1 EN ROUGE, JE NE SAIS PAS À QUOI ELLE CORRESPOND. » Un nombre seul,
      dans une pastille de la couleur de la marque, est partout ailleurs un compteur de
      choses à faire. Celui-ci ne comptait que ce que la ligne d'en dessous écrivait déjà
      en toutes lettres.

   3. « CÔTÉ PRESTATAIRE, IMPOSSIBLE D'OUVRIR LA CONVERSATION SI J'ENVOIE UN MESSAGE EN
      TANT QUE CLIENT APRÈS LA PRESTATION. » Le message n'était pas perdu, il était
      INATTEIGNABLE : la mission payée quitte la liste du prestataire et la carte de
      l'agenda ne porte aucune porte vers la conversation. Le client, lui, garde
      « Écrire à X ». Il écrit, personne ne lit jamais. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__cmd && window.__cmd.archives && window.__cmd.proGardee);

  console.log('A — une archive ne dit pas que quelqu’un est parti');
  const noy = await p.evaluate(() => {
    const A = window.__cmd.archives;
    const arch = [{ uid: 'vivant', nom: 'Silva Carolina' }, { uid: 'parti', nom: 'Laure Mouchot' }];
    return {
      lu: A(arch, { vivant: 1 }, true).map(function (x) { return x.uid; }),
      pasLu: A(arch, { vivant: 1 }, false).length,
      aucunVivant: A(arch, {}, true).length,
      rien: A(null, null, true).length,
    };
  });
  ok(noy.lu.join(',') === 'parti',
    'un compte qui existe encore n’est pas annoncé « supprimé » : sa conversation VIVANTE est déjà dans la liste');
  ok(noy.aucunVivant === 2, 'et un compte réellement parti reste montré');
  /* MÊME DISCIPLINE QUE « RIEN, NULLE PART » : on n'affirme pas avant d'avoir lu. */
  ok(noy.pasLu === 0,
    'tant que les comptes ne sont pas lus, on ne déclare personne supprimé');
  ok(noy.rien === 0, 'et une liste absente ne lève pas');

  const ecran = (archives, lu) => p.evaluate(({ archives, lu }) => {
    const S = window.__S;
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: function () { return Promise.resolve(); },
        setDoc: function () { return Promise.resolve(); },
        getDoc: function () { return Promise.resolve({ exists: function () { return false; }, data: function () { return {}; } }); } },
      fn: { httpsCallable: function () { return function () { return new Promise(function () {}); }; } }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'admin'; S.admin = { view: 'msg' };
    S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.support = false; S.supportSide = null; S.adminSupervise = false;
    S.generalSupport = false; S.genUser = null; S.mission = null;
    S.adminThreads = []; S.adminClisLoaded = lu;
    S.adminUidsVivants = { u1: 1 };
    S.adminGeneral = [{ uid: 'u1', name: 'Silva Carolina', role: 'artisan', clos: 0, ts: 5000,
      support: [{ from: 'client', text: 'Bonjour Silva', at: 5000 }], supReadUser: 0, supReadAdmin: 0 }];
    S.adminGeneralArchive = archives;
    window.__render();
    const v = document.getElementById('view');
    return { txt: (v.textContent || '').replace(/\s+/g, ' '),
      cartesArch: v.querySelectorAll('[data-adm^="gensuparch:"]').length };
  }, { archives, lu });

  const ARCH_VIVANT = [{ uid: 'u1', nom: 'Silva Carolina', email: 'x@y.fr', role: 'artisan',
    support: [{ from: 'client', text: 'Bonjour Silva', at: 5000 }], archiveLe: 1 }];
  const double = await ecran(ARCH_VIVANT, true);
  ok(double.cartesArch === 0 && !/Compte supprimé/.test(double.txt),
    'à l’écran, la conversation d’un compte VIVANT ne paraît plus une seconde fois en « Compte supprimé »');
  ok(/Silva Carolina/.test(double.txt),
    'mais elle reste là, une fois, sous sa forme vivante');

  const ARCH_PARTI = [{ uid: 'zz', nom: 'Laure Mouchot', email: 'l@y.fr', role: 'artisan',
    support: [{ from: 'client', text: 'Merci', at: 9 }], archiveLe: 1 }];
  const parti = await ecran(ARCH_PARTI, true);
  ok(parti.cartesArch === 1 && /Compte supprimé/.test(parti.txt),
    'et un compte réellement parti garde sa conversation, marquée comme telle');

  console.log('B — un nombre seul n’est pas un message');
  const hist = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.persona = 'client'; S.clientNav = 'wallet'; S.mission = null; S.draft = null;
    S.admin = null; S.histCat = null; S.support = false; S.chat = false; S.pastChat = null;
    S.account = { name: 'Joris', email: 'j@x.fr', uid: 'cli1', role: 'client' };
    S.adminPrices = { menage: 35 };
    S.missions = [];
    S.history = [{ _id: 'h1', reqId: 'r1', svc: 'menage', svcName: 'Ménage', status: 'paid',
      duration: 1, unit: 'h', rate: 28, when: 'Demain', slot: '21:00', zone: 'Gustavia',
      provider: { nm: 'Laureguyon', ini: 'L' }, providerUid: 'p1', chat: [] }];
    window.__render();
    const v = document.getElementById('view');
    const tuile = v.querySelector('[data-act^="histcat:"]');
    return { tuile: tuile ? (tuile.textContent || '').replace(/\s+/g, ' ') : '(absente)',
      pastilles: tuile ? tuile.querySelectorAll('.chip').length : -1 };
  });
  ok(/1 prestation/.test(hist.tuile), 'la tuile dit combien de prestations, en toutes lettres');
  /* LE NOMBRE SEUL EST PARTI. Il ne comptait rien d'autre que la ligne d'en dessous, et il
     portait la couleur que l'application réserve à ce qui appelle un geste. */
  ok(hist.pastilles === 0,
    'et plus aucune pastille chiffrée à côté du titre (' + hist.pastilles + ')');

  console.log('C — un message reçu après la prestation arrive quelque part');
  const pro = await p.evaluate(() => {
    const G = window.__cmd.proGardee;
    return {
      enCours: G('accepted', null, 0), aValider: G('done_pro', null, 0),
      annulPend: G('cancelled', 'pending', 0),
      payeeMuette: G('paid', null, 0),
      payeeAvecMsg: G('paid', null, 2),
      noteeAvecMsg: G('rated', null, 1),
      annulLue: G('cancelled', 'applied', 0),
      annulAvecMsg: G('cancelled', 'applied', 3),
    };
  });
  ok(pro.enCours === 'en-cours' && pro.aValider === 'en-cours' && pro.annulPend === 'en-cours',
    'les missions vivantes restent où elles étaient');
  ok(pro.payeeMuette === null && pro.annulLue === null,
    'une prestation terminée et SANS message ne revient pas : la liste ne se remplit pas toute seule');
  ok(pro.payeeAvecMsg === 'message' && pro.noteeAvecMsg === 'message' && pro.annulAvecMsg === 'message',
    'mais dès qu’un message n’est pas lu, elle reparaît — et elle repartira dès qu’il le sera');

  const proEcran = (nonLus) => p.evaluate((nonLus) => {
    const S = window.__S;
    S.persona = 'pro'; S.proNav = 'missions'; S.mission = null; S.chat = false; S.pastChat = null;
    S.proStatus = 'approved'; S.proName = 'Laureguyon'; S.proMissions = [{
      _id: 'm1', reqId: 'r1', svc: 'menage', svcName: 'Ménage', status: 'paid',
      duration: 1, unit: 'h', rate: 28, when: 'Demain', slot: '21:00', zone: 'Gustavia',
      clientName: 'Joris', readProAt: 0,
      chat: nonLus ? [{ from: 'client', text: 'Vous avez oublié le chiffon', at: 9000 }] : [] }];
    window.__render();
    const v = document.getElementById('view');
    return { txt: (v.textContent || '').replace(/\s+/g, ' '),
      cartes: v.querySelectorAll('[data-act^="promiss:"]').length };
  }, nonLus);

  const muet = await proEcran(false);
  ok(muet.cartes === 0 && !/Message reçu après/.test(muet.txt),
    'une prestation payée sans message ne s’affiche pas chez le prestataire');
  const parle = await proEcran(true);
  ok(parle.cartes === 1 && /Message reçu après la prestation/.test(parle.txt),
    'avec un message non lu, elle revient — sous un intitulé qui DIT pourquoi, pas sous « Missions en cours » qui serait faux');
  ok(/Terminée/.test(parle.txt),
    'et sa pastille dit « Terminée » : le statut est nommé, pas laissé brut');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
