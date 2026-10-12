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
  const p = await b.newPage({ viewport: { width: 420, height: 2000 } });
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
      chercher: v.querySelectorAll('[data-act="admin-restore-find"]').length,
      champQ: v.querySelectorAll('[data-arst="q"]').length,
      recup: !!(v.querySelector('[data-act="admin-restore-run"]')
        && !v.querySelector('[data-act="admin-restore-run"]').disabled) };
  }, { hits, choisi });

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

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
