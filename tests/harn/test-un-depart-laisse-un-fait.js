/* « LE PRESTATAIRE S'APPELAIT SUNNYREGARDS MAIS IL APPARAÎT ABSOLUMENT NULLE PART. »
   — l'éditeur, le 12/10/2026.

   LE JOURNAL DES DÉPARTS S'EFFAÇAIT TOUT SEUL AU BOUT DE QUATRE-VINGT-DIX JOURS. La
   raison écrite à côté était bonne — « garder au-delà reviendrait à conserver
   indéfiniment les coordonnées de gens qui ont demandé leur effacement » — mais elle
   confondait la COORDONNÉE (ce qu'un effacement vise) et le FAIT (quelqu'un a été
   référencé ici, de telle date à telle date, et il est parti de lui-même).

   ET L'APPLICATION SE CONTREDISAIT : l'archive des conversations, elle, n'expire pas.
   On gardait ce qu'une personne avait DIT en oubliant qu'elle avait EXISTÉ.

   CE QUE CETTE ÉPREUVE TIENT :
   • la purge RÉDUIT, elle ne supprime plus ;
   • l'adresse part, le fait reste, et le NOM suit la qualité (professionnel ou non) ;
   • la ligne réduite n'a plus d'échéance DU TOUT — champ absent, pas mis à zéro, sinon
     la purge repasserait dessus chaque nuit sans jamais avancer ;
   • l'écriture est SANS fusion, seule façon de faire partir un champ ;
   • une coordonnée effacée se DIT, au lieu d'un tiret qui passerait pour une panne ;
   • et la durée annoncée à l'écran est celle qu'applique le serveur. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const J = require(path.join(RACINE, 'functions', 'journal-departs.js'));
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — le noyau : l’adresse part, le fait reste');
const brut = { uid: 'p9', role: 'artisan', nom: 'sunnyregards', email: 'contact@exemple.fr',
  statut: 'attente', avaitCandidature: true, metiers: ['menage'], inscritLe: 1000,
  supprimeLe: 2000, origine: 'desinscription', supportArchive: 4, expireLe: 50 };
const r = J.reduireDepart(brut, 9000);
ok(r.nom === 'sunnyregards' && r.uid === 'p9' && r.role === 'artisan',
  'un PROFESSIONNEL garde son nom : c’est le registre d’une activité, pas une coordonnée');
ok(r.email === '', 'son adresse part — c’est elle, et elle seule, qu’un effacement vise');
ok(r.supprimeLe === 2000 && r.inscritLe === 1000 && r.origine === 'desinscription',
  'et le FAIT reste entier : quand il est arrivé, quand il est parti, et qu’il est parti de lui-même');
ok(r.supportArchive === 4,
  'avec le report de sa conversation archivée, sinon la ligne réduite ne dirait plus qu’il y a une pièce à ressortir');
/* LE PIÈGE QUI AURAIT FAIT TOURNER LA PURGE POUR TOUJOURS. */
ok(!('expireLe' in r),
  'la ligne réduite n’a plus d’échéance DU TOUT : à zéro, la requête `expireLe <= maintenant` la rendrait chaque nuit');
ok(r.reduitLe === 9000, 'et la date de réduction est REÇUE : le noyau ne lit pas l’heure');

const cli = J.reduireDepart({ uid: 'c1', role: 'client', nom: 'Camille Durand',
  email: 'camille@exemple.fr', supprimeLe: 3000, origine: 'desinscription' }, 9000);
ok(cli.nom === '' && cli.email === '',
  'un PARTICULIER perd son nom avec son adresse : il n’a été référencé nulle part');
ok(cli.supprimeLe === 3000 && cli.role === 'client',
  'mais le fait qu’un compte a existé et qu’il est parti reste, lui aussi');
ok(J.departPro({ role: 'client', avaitCandidature: true }) === true,
  'et une candidature montée sans être envoyée compte comme professionnelle — se tromper dans ce sens est le seul cas irrattrapable');
ok(J.dejaReduite(r) === true && J.dejaReduite(brut) === false, 'une ligne déjà réduite se reconnaît');

console.log('B — le serveur : on ne supprime plus');
const PURGE = SRV.slice(SRV.indexOf("collection('comptesSupprimes').where('expireLe'"), SRV.indexOf("COMPTEURS DU JOUR"));
ok(PURGE.length > 50 && !/ref\.delete\(\)/.test(PURGE),
  'la tâche de nuit n’efface plus la ligne échue');
ok(/DEP\.reduireDepart\(d\.data\(\) \|\| \{\}, now\)/.test(PURGE), 'elle la RÉDUIT, par le noyau');
/* Une écriture FUSIONNÉE laisserait `expireLe` et l'adresse en place : la réduction
   n'enlèverait rien, et la ligne reviendrait à chaque passage. On mesure la LIGNE DE
   CODE, commentaires retirés — un premier jet cherchait le mot « merge » dans toute la
   tranche et le trouvait dans le commentaire qui explique précisément pourquoi on ne
   fusionne pas : l'épreuve rougissait sur du code juste. */
const ECRIT = PURGE.split('\n').map(function (l) { return l.replace(/\/\/.*$/, ''); })
  .filter(function (l) { return /\.set\(/.test(l); });
ok(ECRIT.length === 1 && /d\.ref\.set\(DEP\.reduireDepart\(/.test(ECRIT[0]) && !/merge/.test(ECRIT[0]),
  'et l’écriture est SANS fusion — seule façon de faire PARTIR un champ'
  + (ECRIT.length === 1 ? '' : ' (' + ECRIT.length + ' écriture(s))'));
/* La contradiction qui prouvait que l'effacement était un oubli et non un équilibre. */
const ARCHB = SRV.slice(SRV.indexOf('async function archiverSupportGeneral'), SRV.indexOf('exports.archiverMessagesSupport'));
ok(!/expireLe/.test(ARCHB),
  'et l’archive des conversations n’expire toujours pas : garder ce qu’on a DIT en oubliant qu’on a EXISTÉ n’avait aucun sens');

console.log('C — l’écran, et la durée annoncée');
const srvJ = /const JOURNAL_JOURS = (\d+);/.exec(SRV);
const cliJ = /const JOURNAL_JOURS_CLI=(\d+);/.exec(APP);
ok(!!srvJ && !!cliJ && srvJ[1] === cliJ[1],
  'la durée annoncée à l’écran est celle qu’applique le serveur (' + (srvJ && srvJ[1]) + ' / ' + (cliJ && cliJ[1]) + ')');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__cmd);

  const ecran = (reduit) => p.evaluate((reduit) => {
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
    S.persona = 'admin'; S.admin = { view: 'home' }; S._fold = { 'a-departs': 1 };
    S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminReqsLus = true;
    S.adminArtisans = []; S.adminClients = []; S.adminDrafts = []; S.adminConcierges = [];
    S.adminReqs = []; S.adminGeneral = []; S.adminGeneralArchive = []; S.adminThreads = [];
    S.adminDeparts = [{ uid: 'p9', nom: 'sunnyregards', email: reduit ? '' : 'contact@exemple.fr',
      role: 'artisan', statut: 'attente', avaitCandidature: true, metiers: ['menage'],
      inscritLe: 1, supprimeLe: 2, origine: 'desinscription',
      reduitLe: reduit ? 9000 : 0, supportArchive: 0 }];
    S.admRech = '';
    window.__render();
    const v = document.getElementById('view');
    return { txt: (v.textContent || '').replace(/\s+/g, ' ') };
  }, reduit);

  const vif = await ecran(false);
  ok(/sunnyregards/.test(vif.txt) && /contact@exemple\.fr/.test(vif.txt),
    'une ligne récente montre tout');

  const red = await ecran(true);
  ok(/sunnyregards/.test(red.txt),
    'une ligne RÉDUITE garde son nom à l’écran — c’est la réponse à « il apparaît nulle part »');
  /* UNE COORDONNÉE EFFACÉE N'EST PAS UNE DONNÉE MANQUANTE : le tiret se lisait comme une
     panne du journal. */
  ok(/Coordonnées effacées après 90 jours/.test(red.txt),
    'et l’écran DIT pourquoi l’adresse manque, au lieu d’un tiret qui passerait pour un défaut');
  ok(/Parti le/.test(red.txt) && /désinscri/i.test(red.txt),
    'le fait reste lisible : quand, et qu’il est parti de lui-même');

  /* ET LA RECHERCHE LA TROUVE : c'est par elle qu'on vient poser la question. */
  const trouve = await p.evaluate(() => {
    const R = window.__cmd.cherche('sunnyregards', { artisans: [], clients: [], drafts: [],
      concierges: [], demandes: [], generaux: [], archives: [],
      departs: [{ uid: 'p9', nom: 'sunnyregards', email: '', role: 'artisan' }] });
    return R && R.total;
  });
  ok(trouve === 1, 'et « Retrouver quelqu’un » la trouve par son nom, sans adresse (' + trouve + ')');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
