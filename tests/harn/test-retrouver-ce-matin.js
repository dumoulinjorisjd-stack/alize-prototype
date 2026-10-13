/* « IL ÉTAIT LÀ CE MATIN, ÇA NE PEUT PAS FAIRE PLUS DE 90 JOURS. »
   — l'éditeur, le 12/10/2026, après que j'eus accusé la purge du journal des départs.

   IL AVAIT RAISON, ET LE VRAI DÉFAUT EST AILLEURS. Les trois portes d'effacement du
   serveur inscrivent le départ AVANT de toucher à une fiche. Mais deux chemins passaient
   à côté :

   • LE NAVIGATEUR POUVAIT EFFACER LUI-MÊME. Le règlement autorisait un compte à supprimer
     sa propre fiche `users` et sa fiche `artisans`. L'application ne le fait plus depuis
     la v862 — mais un appareil qui exécute une version installée plus ancienne le fait
     encore, et le service worker peut en servir une pendant des semaines. La personne
     disparaît alors sans ligne, sans conversation archivée, sans rien. Une garde posée
     dans le navigateur se contourne ; une frontière, non.

   • L'INSCRIPTION DU DÉPART AVALAIT SON ÉCHEC. `journaliserDepart` était enveloppée d'un
     `catch` muet : une écriture refusée laissait la purge continuer, et l'on effaçait
     quelqu'un qu'on venait de ne pas inscrire.

   ET ON PEUT ALLER VOIR CE MATIN. Firestore garde l'état de la base sept jours. L'outil
   de récupération existait, mais il exigeait une ADRESSE E-MAIL, cherchée par égalité
   stricte — alors que lorsqu'on cherche quelqu'un, on se souvient d'un NOM. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const P = require(path.join(RACINE, 'functions', 'recherche-passe.js'));
const Q = require(path.join(RACINE, 'functions', 'quand-disparu.js'));
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — un navigateur n’efface plus un compte');
/* On lit la règle de CHAQUE collection de profil : c'est la frontière, et elle doit tenir
   pour les trois (un prestataire a DEUX fiches). */
const bloc = (nom) => {
  const i = RULES.indexOf('match /' + nom + '/{');
  const j = RULES.indexOf('match /', i + 10);
  return RULES.slice(i, j > 0 ? j : RULES.length);
};
['users', 'artisans', 'concierges'].forEach((c) => {
  const b = bloc(c);
  const d = (b.match(/allow delete:[^;]*;/) || [''])[0];
  ok(/allow delete: if isAdmin\(\);/.test(d),
    'un compte ne peut plus supprimer sa fiche `' + c + '` lui-même (' + d.trim() + ')');
});
ok(/exports\.selfDeleteAccount/.test(SRV),
  'et le droit à l’effacement reste entier : il passe par le serveur, qui inscrit le départ');

console.log('B — on n’efface jamais quelqu’un qu’on n’a pas réussi à inscrire');
const PURGE = SRV.slice(SRV.indexOf('async function purgerCompte'), SRV.indexOf('async function purgerCompte') + 1800);
ok(/const inscrit0 = await journaliserDepart\(/.test(PURGE),
  'la purge LIT le résultat de l’inscription au journal');
ok(/if \(!inscrit0\) \{[\s\S]{0,260}?throw new HttpsError/.test(PURGE),
  'et elle s’arrête si l’inscription a échoué : un compte qui reste se resupprime, un compte effacé sans trace, non');
const JD = SRV.slice(SRV.indexOf('async function journaliserDepart'), SRV.indexOf('async function purgerCompte'));
ok(/return true;/.test(JD) && /return false;/.test(JD),
  'l’inscription DIT si elle a réussi, au lieu d’avaler son erreur');
ok(/console\.error\('journaliserDepart/.test(JD),
  'et son échec se voit dans les journaux — un `warn` se perd dans le bruit');

console.log('C — chercher dans la base de ce matin, par son NOM');
ok(/exports\.adminFindAtTime = onCall/.test(SRV), 'une fonction lit la base à une heure donnée');
const FIND = SRV.slice(SRV.indexOf('exports.adminFindAtTime'), SRV.indexOf('exports.adminRestoreAccount'));
ok(/ADMIN_EMAIL\.toLowerCase\(\)/.test(FIND), 'réservée à l’administrateur');
ok(!/\.set\(|\.delete\(|\.update\(/.test(FIND),
  'et elle ne touche à RIEN : on regarde avant de réécrire');
ok(/7 \* 86400000/.test(FIND), 'bornée à la fenêtre de sept jours que Firestore garde');
ok(/request\.data && request\.data\.uid/.test(SRV.slice(SRV.indexOf('exports.adminRestoreAccount'))),
  'et la récupération accepte l’identifiant trouvé, au lieu d’exiger une adresse qu’on n’a pas');

console.log('D — le noyau de la recherche dans le passé');
const parc = [
  { uid: 'a1', name: 'Sunnyregards', email: 'hello@sunny.fr', role: 'artisan' },
  { uid: 'a2', name: 'Soleil Services', company: 'SUNNY REGARDS SARL', email: 'z@z.fr' },
  { uid: 'c1', name: 'Camille Durand', email: 'camille@exemple.fr' },
];
const ids = (q) => P.filtrerCandidats(parc, q).candidats.map(function (c) { return c.uid; }).sort().join(',');
ok(ids('sunnyregards') === 'a1', 'le nom exact tombe, et lui seul');
/* MES DEUX PREMIÈRES ATTENTES ÉTAIENT FAUSSES, ET LE NOYAU FAIT MIEUX. J'avais écrit
   « un seul résultat » : chaque mot étant cherché comme un morceau, « sunny » et
   « regards » tombent AUSSI dans « Sunnyregards » écrit d'un seul tenant. C'est
   exactement ce qu'on veut : celui qui cherche ne sait pas si le nom s'écrit en un mot ou
   en deux, et c'est bien la question qu'il vient poser. */
ok(ids('SUNNY regards') === 'a1,a2',
  'en deux mots ou en un seul, les deux sortent : on ne sait pas comment le nom est écrit');
ok(ids('regards sunny') === 'a1,a2',
  'et l’ORDRE des mots ne compte pas : on ne se souvient pas d’un nom dans le bon sens');
ok(ids('camille') === 'c1', 'un autre nom ne ramène que le sien');
/* ON RATISSE LARGE : l'enseigne, la raison sociale, l'adresse e-mail. Celui qui cherche
   ne sait pas dans quel champ c'est rangé. */
ok(P.filtrerCandidats(parc, 'hello@sunny.fr').total === 1, 'un bout d’adresse e-mail suffit');
ok(P.filtrerCandidats(parc, 'zzz').total === 0 && P.filtrerCandidats(parc, '').total === 0,
  'un nom inconnu, ou vide, ne rend rien');
const gros = []; for (let i = 0; i < 40; i++) gros.push({ uid: 'u' + i, name: 'Sunny ' + i });
const c = P.filtrerCandidats(gros, 'sunny', 25);
ok(c.candidats.length === 25 && c.total === 40 && c.tronque === true,
  'une liste coupée le DIT : sinon on conclurait « il n’y est pas » sans avoir tout regardé');
const r = P.reunirParUid([{ uid: 'a1', name: 'Jean Dupont', email: 'j@d.fr', role: 'client' }],
  [{ uid: 'a1', name: 'Sunnyregards', status: 'attente', cats: ['menage'] }]);
ok(r.length === 1 && r[0].nom === 'Sunnyregards' && r[0].role === 'artisan' && r[0].statut === 'attente',
  'les deux fiches d’une même personne n’en font qu’une, et c’est le NOM COMMERCIAL qui la désigne');
ok(r[0].email === 'j@d.fr', 'en gardant l’adresse, qui ne vit que sur la fiche utilisateur');

(async () => {
  console.log('E — l’écran : chercher, reconnaître, puis récupérer');
  const b = await chromium.launch(o);
  /* AU FUSEAU DE SAINT-BARTHÉLEMY (UTC−4), ET C'EST UNE NÉCESSITÉ, PAS UN DÉTAIL. Le
     conteneur tourne en UTC : l'heure locale y égale l'heure UTC, donc une épreuve qui
     vérifie « le champ reçoit l'heure LOCALE » ne peut RIEN distinguer — mesuré, elle
     passait au vert avec `toISOString()` remis à la place. Sous le fuseau réel, les deux
     diffèrent de quatre heures et la mesure veut dire quelque chose. */
  const p = await b.newPage({ viewport: { width: 420, height: 2000 }, timezoneId: 'America/Guadeloupe' });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const ecran = (hits, choisi) => p.evaluate(({ hits, choisi }) => {
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
    S.persona = 'admin'; S.admin = { view: 'home' }; S._fold = { 'a-restore': 1 };
    S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminReqsLus = true;
    S.adminArtisans = []; S.adminClients = []; S.adminDrafts = []; S.adminConcierges = [];
    S.adminReqs = []; S.adminGeneral = []; S.adminGeneralArchive = []; S.adminThreads = [];
    S.adminDeparts = []; S.admRech = '';
    S._arst = { at: '2026-10-12T08:00', q: 'sunnyregards', uid: choisi || '' };
    S._arstHits = hits; S._arstBusy = false; S._arstOut = null;
    window.__render();
    const v = document.getElementById('view');
    return { txt: (v.textContent || '').replace(/\s+/g, ' '),
      cartes: v.querySelectorAll('[data-act^="admin-restore-uid:"]').length,
      // Le texte des SEULES cartes de candidats : l'écran entier contient « Prestataires »
      // dans un intertitre sans rapport, et une assertion qui lirait toute la page serait
      // sauvée par lui — elle l'a été, et n'a rien rougi à la preuve.
      cartesTxt: Array.prototype.slice.call(v.querySelectorAll('[data-act^="admin-restore-uid:"]'))
        .map(function (x) { return (x.textContent || '').replace(/\s+/g, ' '); }),
      chercher: v.querySelectorAll('[data-act="admin-restore-find"]').length,
      champQ: v.querySelectorAll('[data-arst="q"]').length,
      lire: v.querySelectorAll('[data-act^="admin-conv-at:"]').length,
      recup: !!(v.querySelector('[data-act="admin-restore-run"]')
        && !v.querySelector('[data-act="admin-restore-run"]').disabled) };
  }, { hits, choisi });

  /* LIRE N'EST PAS RESSUSCITER. « Si c'est elle qui a volontairement supprimé son compte,
     elle va avoir de nouveau un compte actif ? » — l'accès n'est pas recréé, mais la
     FICHE redevient vivante : la console la montre comme un compte actif, et un
     prestataire validé restauré retourne dans le vivier, où le serveur lui ENVOIE un
     e-mail à chaque demande de son métier. Ce qu'on vient chercher étant une preuve et
     non un compte, la lecture seule est la bonne porte. */
  const lecture = (conv) => p.evaluate((conv) => {
    window.__S._arstConv = conv; window.__render();
    const v = document.getElementById('view');
    /* LE TEXTE DU SEUL PANNEAU, pas de l'écran entier. La console porte ailleurs une carte
       qui dit « Lecture seule » à propos des CGU : une assertion qui lirait toute la page
       serait sauvée par elle — elle l'a été, et n'a rien rougi à la preuve. */
    const fer = v.querySelector('[data-act="admin-conv-close"]');
    const pan = fer ? fer.closest('.card') : null;
    return { txt: pan ? (pan.textContent || '').replace(/\s+/g, ' ') : '',
      bulles: pan ? pan.querySelectorAll('.bub').length : 0,
      fermer: v.querySelectorAll('[data-act="admin-conv-close"]').length };
  }, conv);

  const vide = await ecran(null, '');
  ok(vide.champQ === 1 && vide.chercher === 1,
    'la carte offre de chercher par le NOM, à une date');
  ok(vide.recup === false,
    'et « Récupérer » reste éteint tant qu’aucun compte n’est désigné : on ne réécrit pas des fiches au hasard');

  const HITS = { readTime: '2026-10-12T08:00:00.000Z', total: 2, tronque: false,
    lus: { users: 143, artisans: 37 },
    candidats: [{ uid: 'a1', nom: 'Sunnyregards', email: 'hello@sunny.fr', role: 'artisan', statut: 'attente', metiers: ['menage'] },
      { uid: 'c9', nom: 'Sunny Durand', email: 'c@d.fr', role: 'client', statut: '', metiers: [] }] };
  const trouve = await ecran(HITS, '');
  ok(trouve.cartes === 2 && /Sunnyregards/.test(trouve.txt),
    'les candidats de ce matin s’affichent, et on les reconnaît');
  ok(/143 comptes et 37 fiches prestataire/.test(trouve.txt),
    'avec ce qui a été LU : « rien trouvé » sur zéro compte lu ne voudrait rien dire');
  ok(trouve.recup === false, 'mais il faut encore en choisir un');

  const choisi = await ecran(HITS, 'a1');
  ok(choisi.recup === true && /Récupérer le compte choisi/.test(choisi.txt),
    'une fois le compte reconnu, la récupération s’allume et le DIT');
  /* ON NE CACHE PAS CE QU'ON S'APPRÊTE À RESTAURER. La pastille remplaçait le RÔLE par le
     mot « Choisi » : au moment précis où l'on va écrire dans la base, l'écran cessait de
     dire si c'est un prestataire — qui redevient visible des clients — ou un client. */
  ok(/Prestataire/.test(choisi.cartesTxt[0] || '') && /Client/.test(choisi.cartesTxt[1] || ''),
    'et le RÔLE de chaque candidat reste lisible, celui qu’on vient de choisir compris ('
    + (choisi.cartesTxt[0] || '—') + ')');

  console.log('F — lire la conversation sans rien ressusciter');
  ok(trouve.lire === 2, 'chaque candidat porte un bouton pour LIRE sa conversation à cette date');
  const vue = await lecture({ uid: 'a1', nom: 'Sunnyregards', role: 'artisan', quand: '11/10/2026 20:20',
    nTotal: 2, tronque: false,
    support: [{ from: 'client', text: 'Bonjour, une question sur Mollie', at: 1 },
      { from: 'admin', text: 'Je vous réponds tout de suite', at: 2 }] });
  ok(vue.bulles === 2 && /question sur Mollie/.test(vue.txt),
    'les messages de cette date s’affichent');
  /* LA PROMESSE DOIT ÊTRE ÉCRITE : sans elle, on ne saurait pas que regarder ne réécrit
     rien, et l'on hésiterait à cliquer — ou l'on croirait avoir restauré quelque chose. */
  ok(/Lecture seule/.test(vue.txt) && /rien n’est écrit/.test(vue.txt),
    'et l’écran PROMET que rien n’est écrit et qu’aucun compte n’est rétabli');
  ok(/11\/10\/2026 20:20/.test(vue.txt),
    'en nommant l’instant lu : une pièce sans date ne prouve rien');
  ok(vue.fermer === 1, 'et elle se referme');
  const muet = await lecture({ uid: 'a1', nom: 'Sunnyregards', quand: '11/10/2026 20:20', support: [], nTotal: 0 });
  ok(/Aucun message/.test(muet.txt) && muet.bulles === 0,
    'un compte sans message à cette date le DIT, au lieu d’un cadre vide');

  /* ET LE SERVEUR N'ÉCRIT RIEN : c'est toute la différence avec la récupération. */
  const LIRE = SRV.slice(SRV.indexOf('exports.adminSupportAtTime'), SRV.indexOf('exports.adminRestoreAccount'));
  ok(LIRE.length > 100, 'la lecture a sa fonction serveur');
  ok(!/\.set\(|\.delete\(|\.update\(|sendUserEmail|sendMail/.test(LIRE),
    'qui n’écrit RIEN et n’envoie RIEN : aucune donnée ne revient en base, aucun e-mail ne part');
  ok(/ADMIN_EMAIL\.toLowerCase\(\)/.test(LIRE) && /7 \* 86400000/.test(LIRE),
    'réservée à l’administrateur, et bornée à la fenêtre de sept jours');

  console.log('G — trouver L’HEURE, plutôt que de la faire chercher');
  /* « À 11 h 54 : aucun message. » La lecture marchait, c'est l'HEURE qui manquait — et
     tâtonner coûte une lecture par essai pour une minute qui peut être n'importe où dans
     sept jours. */
  const grille = Q.grilleSondes(0, 600000, 7);
  ok(grille.length === 7 && grille[0] === 0 && grille[6] === 600000,
    'les sondes couvrent la fenêtre, bornes comprises');
  const S1 = [{ at: 0, n: 4 }, { at: 100, n: 4 }, { at: 200, n: 0 }, { at: 300, n: 0 }];
  const c1 = Q.encadrer(S1);
  ok(c1 && c1.avant.at === 100 && c1.apres.at === 200,
    'le passage est ENCADRÉ : le dernier instant avec des messages, le premier sans');
  ok(Q.prochaineBissection(c1.avant, c1.apres, 10) === 150,
    'et la dichotomie resserre, au lieu de balayer minute par minute');
  ok(Q.prochaineBissection({ at: 100 }, { at: 105 }, 10) === null,
    'elle s’arrête quand on est assez précis : une lecture de plus n’apprendrait rien');
  const v1 = Q.verdict(S1, c1);
  ok(v1.etat === 'disparu' && v1.vuLe.at === 100 && v1.combien === 4,
    'le verdict dit QUAND on les a vus pour la dernière fois, et COMBIEN');
  /* LES TROIS AUTRES ISSUES N'APPELLENT PAS LE MÊME GESTE, et les confondre enverrait
     chercher au mauvais endroit. */
  const S2 = [{ at: 0, n: 0 }, { at: 100, n: 0 }];
  ok(Q.encadrer(S2) === null && Q.verdict(S2, null).etat === 'jamais',
    'aucun message nulle part se dit à part : la conversation est ailleurs, ou plus ancienne que la fenêtre');
  const S3 = [{ at: 0, n: 2 }, { at: 100, n: 3 }];
  ok(Q.encadrer(S3) === null && Q.verdict(S3, null).etat === 'toujours-la',
    'et « ils sont encore là » aussi : rien n’a disparu, c’est ailleurs qu’il faut chercher');
  ok(Q.verdict([], null).etat === 'rien-lu', 'aucune lecture ne se confond pas avec aucun message');
  ok(Q.LECTURES_MAX > 0 && Q.LECTURES_MAX <= 64,
    'le nombre de lectures est PLAFONNÉ : une boucle sans borne sur un service distant expire au milieu, sans rien rendre');
  const SRVQ = SRV.slice(SRV.indexOf('exports.adminQuandDisparu'), SRV.indexOf('exports.adminRestoreAccount'));
  ok(SRVQ.length > 100 && !/\.set\(|\.delete\(|\.update\(/.test(SRVQ),
    'et elle n’écrit RIEN, comme la lecture');
  ok(/lectures >= QUAND\.LECTURES_MAX/.test(SRVQ), 'le plafond est APPLIQUÉ, pas seulement déclaré');

  /* LE CHAMP DE DATE ATTEND UNE HEURE LOCALE. `toISOString` y mettrait l'heure UTC :
     à Saint-Barthélemy le champ afficherait quatre heures de plus, et la lecture
     suivante tomberait à côté de ce qu'on vient de mesurer. */
  const fuseau = await p.evaluate(() => {
    const t = new Date(2026, 9, 12, 9, 14, 0).getTime();   // construit DANS la page
    return { champ: window.__cmd.champHeure(t), utc: new Date(t).toISOString().slice(0, 16) };
  });
  ok(fuseau.champ === '2026-10-12T09:14' && fuseau.utc === '2026-10-12T13:14',
    'l’instant trouvé remplit le champ en heure LOCALE, pas en UTC — quatre heures d’écart à Saint-Barthélemy ('
    + fuseau.champ + ' vs ' + fuseau.utc + ')');

  /* LES INSTANTS SE CONSTRUISENT DANS LA PAGE, pas dans Node. Le harnais tourne en UTC et
     la page au fuseau de Saint-Barthélemy : un horodatage fabriqué d'un côté et rendu de
     l'autre se décale de quatre heures, et l'épreuve mesurerait ce décalage au lieu de ce
     qu'elle vise. On passe des composantes, la page en fait des instants. */
  const verdictEcran = (q) => p.evaluate((q) => {
    const h = function (c) { return c ? new Date(c[0], c[1], c[2], c[3], c[4]).getTime() : 0; };
    if (q.vuLeC) q.vuLe = { at: h(q.vuLeC), n: q.combien };
    if (q.videLeC) q.videLe = { at: h(q.videLeC), n: 0 };
    window.__S._arstQuand = q; window.__S._arstConv = null; window.__render();
    const v = document.getElementById('view');
    const b = v.querySelector('[data-act="admin-quand-lire"]');
    const pan = b ? b.previousElementSibling : null;
    return { txt: (v.textContent || '').replace(/\s+/g, ' '), lire: !!b,
      banniere: pan ? (pan.textContent || '').replace(/\s+/g, ' ') : '' };
  }, q);

  const dispa = await verdictEcran({ uid: 'a1', etat: 'disparu', combien: 3,
    vuLeC: [2026, 9, 12, 9, 14], videLeC: [2026, 9, 12, 9, 29], sondes: [] });
  ok(dispa.lire === true && /12\/10\/2026 09:14/.test(dispa.banniere),
    'l’écran NOMME l’instant où les messages étaient encore là');
  ok(/plus aucun le 12\/10\/2026 09:29/.test(dispa.banniere),
    'et celui où il n’y en avait plus : la disparition est ENTRE les deux, pas « à » l’un d’eux');

  const jamais = await verdictEcran({ uid: 'a1', etat: 'jamais', sondes: [{ at: 1, n: 0 }, { at: 2, n: 0 }] });
  ok(/une <b>prestation<\/b>|prestation/.test(jamais.txt) && !/Lire à cet instant/.test(jamais.txt),
    'rien nulle part envoie chercher ailleurs, sans proposer de lire du vide');
  const encore = await verdictEcran({ uid: 'a1', etat: 'toujours-la', dernier: { at: 1, n: 5 }, sondes: [] });
  ok(/n’ont pas disparu/.test(encore.txt),
    'et « ils sont encore là » le dit, au lieu de laisser croire à une perte');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
