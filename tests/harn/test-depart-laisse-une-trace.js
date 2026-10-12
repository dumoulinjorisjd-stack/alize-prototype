/* « JE VEUX JUSTE CONTINUER DE VOIR QUE CE PRESTATAIRE A EXISTÉ UN JOUR, ET VOIR QU'IL A
   LUI-MÊME DÉCIDÉ DE PARTIR ; LA MESSAGERIE ET LES MESSAGES DOIVENT RESTER, C'EST UNE
   PREUVE EN CAS DE LITIGE. » — l'éditeur, le 12/10/2026.

   LE JOURNAL DES DÉPARTS EXISTAIT, ET IL MENTAIT SUR LES DÉSINSCRIPTIONS. L'application
   effaçait `users/{uid}`, `artisans/{uid}` et `concierges/{uid}` AVANT de supprimer le
   compte d'authentification. Le déclencheur serveur qui écrit le journal se réveillait
   alors devant des fiches disparues : il ne gardait que l'adresse e-mail, et sa ligne
   `role: a.name ? 'artisan' : 'client'` répondait toujours CLIENT. Un prestataire parti
   de lui-même était donc inscrit comme un client sans métier, sans état de dossier et
   sans candidature, dans une carte rangée sous « Clients ». Introuvable.

   ON JOURNALISE PUIS ON EFFACE, et c'est le serveur qui fait les deux. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  console.log('A — le serveur journalise, puis efface');
  const SELF = SRV.slice(SRV.indexOf('exports.selfDeleteAccount'), SRV.indexOf('exports.adminPurgeAccount'));
  ok(SELF.length > 100, 'une fonction serveur porte la désinscription');
  ok(/request\.auth && request\.auth\.uid/.test(SELF) && /unauthenticated/.test(SELF),
    'elle agit sur le compte APPELANT, et refuse sans session : personne ne supprime le compte d’un autre');
  ok(/ADMIN_EMAIL\.toLowerCase\(\)/.test(SELF) && /failed-precondition/.test(SELF),
    'et le compte administrateur ne se supprime pas depuis l’application : on ne se coupe pas la branche');
  ok(/purgerCompte\(getFirestore\(\), uid, 'profil', null, 'desinscription'\)/.test(SELF),
    'elle appelle la purge en mode PROFIL : une désinscription n’est pas une instruction d’effacer la comptabilité');

  const PURGE = SRV.slice(SRV.indexOf('async function purgerCompte'), SRV.indexOf('exports.adminPurgeAccount'));
  const iJournal = PURGE.indexOf('journaliserDepart');
  const iEfface = PURGE.indexOf("effacerDocs(['users', 'artisans', 'concierges']");
  ok(iJournal >= 0 && iEfface > iJournal,
    'ET L’ORDRE EST LE BON : le journal est écrit AVANT l’effacement des fiches, sinon il n’a plus rien à lire');
  ok(/origine \|\| \(authUser \? 'auth'/.test(PURGE),
    'l’origine du départ se DONNE : « desinscription » n’est pas « auth », qui couvre aussi une suppression faite dans Firebase');

  console.log('B — ce qu’un départ NE touche PAS');
  const bloc = PURGE.slice(PURGE.indexOf("// 3) COMMANDES"), PURGE.indexOf('// 4)'));
  ok(/if \(mode === 'total'\)/.test(bloc),
    'les demandes, le registre et l’agenda ne partent qu’en mode « total »');
  ok(!/collection\('requests'\)/.test(PURGE.slice(0, PURGE.indexOf("if (mode === 'total')"))),
    'AVANT cette garde, rien ne touche aux demandes : les messages vivent dessus, ils restent');
  /* LES MESSAGES SONT UN CHAMP DE LA DEMANDE : si les demandes survivent, ils survivent.
     On le vérifie là où c'est écrit, plutôt que de le supposer. */
  ok(/messages:FB\.f\.arrayUnion\(msg\)|\{messages:FB\.f\.arrayUnion/.test(APP)
     || /\[field\]:FB\.f\.arrayUnion\(msg\)/.test(APP),
    'un message s’écrit bien sur le document de la demande');
  ok(/where\('clientUid', '==', uid\)|where\(champ, '==', uid\)/.test(bloc),
    'et quand on efface tout, on passe par les deux rôles : rien ne reste orphelin');

  console.log('C — l’application n’efface plus rien elle-même');
  const DEL = APP.slice(APP.indexOf('async function deleteAccountReal'), APP.indexOf('function fbLogout'));
  ok(/httpsCallable\(FB\.functions,'selfDeleteAccount'\)/.test(DEL),
    'elle demande au serveur');
  ok(!/deleteDoc/.test(DEL),
    'et ne supprime plus aucun document : c’était la cause du journal vide (' + (DEL.match(/deleteDoc/g) || []).length + ' appel)');
  ok(!/u\.delete\(\)/.test(DEL) && !/requires-recent-login/.test(DEL),
    'ni le compte d’authentification, donc plus de « reconnectez-vous d’abord » : le serveur n’a pas besoin d’une connexion récente');
  ok(/toast\('⚠︎ Suppression impossible/.test(DEL),
    'et un échec le DIT au lieu de retomber sur l’ancien chemin : effacer sans journaliser est le défaut qu’on corrige');

  console.log('D — la console dit qu’il est parti de lui-même');
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 2000 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const carte = (departs) => p.evaluate(({ departs }) => {
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
    S.persona = 'admin'; S.admin = { view: 'home' };
    S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminArtisans = []; S.adminClients = [];
    S.adminReqsLus = true; S.adminReqs = [];
    S._fold = { 'a-departs': true };
    S.adminDeparts = departs;
    window.__render();
    const c = Array.prototype.slice.call(document.querySelectorAll('.foldc'))
      .find(function (x) { return /Comptes supprimés/.test(x.textContent || ''); });
    return { txt: c ? (c.textContent || '').replace(/\s+/g, ' ') : '(carte absente)' };
  }, { departs });

  const J = 86400000;
  const parti = await carte([{ uid: 'proX', nom: 'Un prestataire', email: 'p@x.c', role: 'artisan',
    statut: 'valide', avaitCandidature: true, metiers: ['menage', 'jardin'],
    inscritLe: Date.now() - 200 * J, supprimeLe: Date.now() - 3 * J, origine: 'desinscription' }]);
  ok(/Comptes supprimés/.test(parti.txt), 'la carte existe');
  ok(/Un prestataire/.test(parti.txt) && /Prestataire/.test(parti.txt),
    'IL A EXISTÉ, et il est nommé comme ce qu’il était : un prestataire, pas un client');
  ok(/Ménage/.test(parti.txt) || /menage/.test(parti.txt), 'avec ses métiers');
  ok(/s’est désinscrit lui-même/.test(parti.txt),
    'ET QU’IL A DÉCIDÉ DE PARTIR : « parti le 9 octobre » ne disait pas s’il avait claqué la porte ou si on l’avait retiré');
  ok(/les conversations restent/.test(parti.txt),
    'la carte dit aussi ce qui est GARDÉ : prestations, registre et conversations, preuve en cas de litige');

  const retire = await carte([{ uid: 'c1', nom: 'Quelqu’un', email: 'q@x.c', role: 'client',
    statut: '', avaitCandidature: false, metiers: [],
    inscritLe: Date.now() - 10 * J, supprimeLe: Date.now() - J, origine: 'console-profil' }]);
  ok(/Retiré depuis votre console/.test(retire.txt) && !/désinscrit lui-même/.test(retire.txt),
    'et un retrait fait par vous ne se lit pas comme un départ volontaire : ce n’est pas le même fait');

  const inconnue = await carte([{ uid: 'c2', nom: 'X', email: 'x@x.c', role: 'client', statut: '',
    avaitCandidature: false, metiers: [], inscritLe: 0, supprimeLe: Date.now(), origine: 'martien' }]);
  ok(!/désinscrit|Retiré depuis|console Firebase/.test(inconnue.txt),
    'une origine inconnue ne devient pas une phrase : la liste est fermée');

  /* ── E. LA CONVERSATION DE SUPPORT GÉNÉRAL SURVIT AU COMPTE ───────────────────
     Elle ne vit pas où vivent les autres : un échange lié à une prestation est un champ
     de la DEMANDE, qu'une purge « profil » ne touche pas ; une question générale est un
     champ de la FICHE UTILISATEUR, et la fiche part dans les DEUX modes. Le fil
     s'effaçait donc avec le compte, y compris sur une simple désinscription. Or c'est
     exactement celui qu'on ressort des mois après. */
  console.log('E — la conversation d’un compte parti est gardée comme pièce');
  const ARCH = SRV.slice(SRV.indexOf('async function archiverSupportGeneral'), SRV.indexOf('async function journaliserDepart'));
  ok(ARCH.length > 100, 'le serveur archive le support général');
  ok(/collection\('supportArchive'\)\.doc\(uid\)/.test(ARCH),
    'dans une collection à part, pas dans le journal des départs qui se purge à 90 jours');
  ok(!/expireLe/.test(ARCH),
    'et SANS date d’expiration : une pièce de litige n’a pas la durée de vie d’un journal');
  ok(/slice\(-ARCHIVE_MSG_MAX\)/.test(ARCH) && /slice\(0, ARCHIVE_TXT_MAX\)/.test(ARCH),
    'bornée, parce qu’un document Firestore plafonne à un mébioctet');
  ok(/tronque: brut\.length > gardes\.length/.test(ARCH),
    'et la coupe se VOIT : on garde le nombre réel, sinon un fil amputé passerait pour complet');
  const JD = SRV.slice(SRV.indexOf('async function journaliserDepart'), SRV.indexOf('async function purgerCompte'));
  ok(JD.indexOf('archiverSupportGeneral') >= 0 && JD.indexOf('archiverSupportGeneral') < JD.indexOf("collection('comptesSupprimes')"),
    'l’archivage a lieu PENDANT la lecture des fiches, le seul instant où la conversation est encore lisible');
  ok(/match \/supportArchive\/\{uid\} \{[\s\S]{0,200}?allow read: if isAdmin\(\);[\s\S]{0,80}?allow write: if false;/.test(
    fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8')),
    'la règle la réserve à l’administrateur en lecture, et l’interdit en écriture : personne ne l’écrit depuis un navigateur');

  const archive = await p.evaluate(() => {
    const S = window.__S;
    S.adminGeneralArchive = [{ uid: 'proX', nom: 'Une prestataire', email: 'a@x.c', role: 'artisan',
      support: [{ from: 'user', text: 'Mollie ne prend pas en charge Saint-Barthélemy', at: 1 },
        { from: 'admin', text: 'Mollie prend bien en charge Saint-Barthélemy', at: 2 }],
      nTotal: 2, tronque: false, archiveLe: Date.now(), parti: true }];
    S.adminGeneral = []; S.adminThreads = []; S.admin = { view: 'msg' }; S.genUser = null;
    S.generalSupport = false; S.persona = 'admin';
    window.__render();
    const v = document.getElementById('view');
    const liste = (v.textContent || '').replace(/\s+/g, ' ');
    const b = v.querySelector('[data-adm^="gensuparch:"]');
    if (b) b.click();
    const w = document.getElementById('view');
    return { liste: liste, bouton: !!b,
      ouvert: (w.textContent || '').replace(/\s+/g, ' '),
      repondre: w.querySelectorAll('#gsupInput').length };
  });
  ok(/Support général/.test(archive.liste) && /Une prestataire/.test(archive.liste) && /Compte supprimé/.test(archive.liste),
    'elle paraît dans la messagerie, au même endroit qu’on la cherche, et marquée');
  ok(archive.bouton && /Mollie ne prend pas en charge/.test(archive.ouvert) && /prend bien en charge/.test(archive.ouvert),
    'elle s’ouvre, et les DEUX côtés de l’échange sont là');
  ok(archive.repondre === 0,
    'mais sans barre de réponse : écrire à un compte supprimé n’arrive nulle part, et le proposer serait mentir');
  ok(/Ce compte a été supprimé/.test(archive.ouvert), 'et l’écran le dit');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
