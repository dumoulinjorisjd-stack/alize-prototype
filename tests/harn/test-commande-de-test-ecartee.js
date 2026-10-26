/* « Oui, fais pareil pour les commandes de test. »

   La v887 les a NOMMÉES — le rapprochement Mollie dit « jamais encaissé » sur une
   commande que l'application affiche « réglée » — et elles restaient dans la liste et
   dans les compteurs. C'est le même geste que pour un versement bloqué, et le MÊME
   appelable : `ledgerExclude`, réversible, qui garde qui l'a fait, quand et pourquoi.

   ON NE L'OFFRE QUE SUR UN FAIT VENU DE MOLLIE, jamais sur un jugement. Une commande
   ENCAISSÉE ne doit pas pouvoir quitter les comptes d'un clic — ce serait cacher du
   chiffre d'affaires réel. Et « on ne sait pas » n'est pas « ça n'a pas été payé » : il
   faut d'abord rapprocher, ce qui est le bouton d'à côté.

   DEUX RAISONS D'ÉCARTER, DEUX COMPTES. Un COMPTE de test est un compte entier à
   nettoyer ; une COMMANDE écartée est une décision qu'on a prise et qu'on peut défaire.
   Les fondre ferait mentir la phrase qui dit « de comptes de test ». */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* ── LES NOYAUX, MONTÉS DANS UN BAC VIDE ────────────────────────────────────────────── */
const i0 = APP.indexOf('  const CMD_ECARTABLES=');
const i1 = APP.indexOf('  function encaissementTotaux');
const ctx = vm.createContext({});
new vm.Script(APP.slice(i0, i1) + '\nthis.X={commandeEcartable:commandeEcartable,commandeEncaissement:commandeEncaissement,CMD_ECARTABLES:CMD_ECARTABLES};').runInContext(ctx);
const { commandeEcartable, commandeEncaissement, CMD_ECARTABLES } = ctx.X;
ok(i0 > 0 && i1 > i0, 'les noyaux se relèvent (sinon rien n\'est mesuré)');

const jamais = {enc: {auRegistre: true, encaisse: false}};
const paye   = {enc: {auRegistre: true, encaisse: true}};
const inconnu= {enc: {auRegistre: false}};

console.log('\n── SEULE UNE COMMANDE JAMAIS ENCAISSÉE S\'ÉCARTE ───────────────────────');
ok(commandeEncaissement(jamais.enc) === 'jamais', 'la scène porte bien une commande jamais encaissée');
ok(commandeEcartable(jamais) === true, 'elle peut être écartée');

console.log('\n── LA MOITIÉ QUI COMPTE : CE QUI A ÉTÉ PAYÉ RESTE ──────────────────────');
/* Écarter une commande réellement encaissée serait cacher du chiffre d'affaires, d'un
   clic, et personne ne le verrait. */
ok(commandeEcartable(paye) === false, 'une commande ENCAISSÉE ne s\'écarte pas');
ok(commandeEcartable(inconnu) === false, 'ni une commande qu\'on n\'a pas encore rapprochée');
ok(commandeEcartable(Object.assign({exclue: true}, jamais)) === false, 'ni une commande déjà écartée');
ok(commandeEcartable(null) === false && commandeEcartable({}) === false, 'ni rien du tout');
/* LA LISTE EST FERMÉE : elle ne doit pas s'ouvrir par distraction à « inconnu ». */
ok(CMD_ECARTABLES.length === 1 && CMD_ECARTABLES[0] === 'jamais', 'la liste des états écartables tient en un seul');

console.log('\n── LE DRAPEAU ENTRE DANS LA PROJECTION, ET RIEN D\'AUTRE ────────────────');
const ip = APP.indexOf('function reqPourConsole');
const proj = APP.slice(ip, APP.indexOf('\n  }', ip));
ok(/exclue:!!r0\.comptaExclue,/.test(proj), 'la ligne porte le drapeau');
/* LA LISTE RESTE FERMÉE : un booléen, jamais une donnée nominative. */
ok(!/adresse|address|phone|tel:|email/i.test(proj), 'ni adresse, ni téléphone, ni courriel');

console.log('\n── DEUX RAISONS, DEUX COMPTES, DEUX PHRASES ────────────────────────────');
ok(/const reqsVrais=\(S\.adminReqs\|\|\[\]\)\.filter\(function\(r\)\{return !uidsTest\[r\.uid\]&&!r\.exclue;\}\);/.test(APP),
  'la porte unique de l\'écran écarte les deux');
ok(/const reqsExclues=\(S\.adminReqs\|\|\[\]\)\.filter\(function\(r\)\{return uidsTest\[r\.uid\];\}\)\.length;/.test(APP),
  'le compte des COMPTES de test ne porte que ceux-là');
ok(/const reqsEssai=\(S\.adminReqs\|\|\[\]\)\.filter\(function\(r\)\{return !uidsTest\[r\.uid\]&&r\.exclue;\}\)\.length;/.test(APP),
  'et les commandes écartées à la main ont leur propre compte');
/* SANS CELA, LA PHRASE EXISTANTE MENTIRAIT : elle dit « de comptes de test ». */
ok(/de comptes de test/.test(APP), 'la phrase d\'origine est toujours là');
ok(/écartées':'écartée'\} à la main \(tests\)/.test(APP), 'et la seconde dit l\'autre raison');
ok(/Retrouver une facture/.test(APP.slice(APP.indexOf('à la main (tests)'), APP.indexOf('à la main (tests)') + 260)),
  'en nommant où les revoir — un retrait sans porte de retour serait une suppression');

console.log('\n── LE BOUTON, SUR LE RENDU PARTAGÉ DES LIGNES ──────────────────────────');
/* `cmdLigne` est le rendu des DEUX cartes — « Réservations en cours » et « Toutes les
   commandes ». Poser le bouton ailleurs le laisserait absent de l'une des deux. */
ok(/\$\{cmdDiffusion\(r\)\}\$\{cmdRelance\(r\)\}\$\{cmdEssai\(r\)\}/.test(APP), 'il suit la relance dans cmdLigne');
const iC = APP.indexOf('const cmdEssai=function(r)');
const bl = APP.slice(iC, iC + 600);
ok(/if\(!commandeEcartable\(r\)\)return '';/.test(bl), 'et il lit le noyau, sans refaire la règle');
ok(/S\._cmdEssai===r\.id/.test(bl), 'il s\'arme');
ok(/Un second appui l’écartera des comptes \(réversible\)/.test(APP), 'le premier appui dit que c\'est réversible');

console.log('\n── MÊME APPELABLE QUE PARTOUT AILLEURS ─────────────────────────────────');
const iG = APP.indexOf("act==='cmd-essai'");
const g = APP.slice(iG, iG + 1200);
ok(/httpsCallable\(FB\.functions,'ledgerExclude'\)/.test(g), 'il appelle le geste d\'exclusion qui existe déjà');
ok(/motif:'commande de test, jamais encaissée'/.test(g), 'avec un motif, qui restera au journal');
ok(/isAdminAccount\(\)/.test(g), 'et l\'écran le réserve à l\'administrateur');
/* TROIS APPELANTS, UN SEUL APPELABLE : la carte des factures, celle des versements, et
   celle des commandes. Un second chemin d'exclusion finirait par ne plus écrire les
   mêmes drapeaux. */
ok((APP.match(/httpsCallable\(FB\.functions,'ledgerExclude'\)/g) || []).length === 3,
  'trois appelants, un seul appelable');
ok(!/chargerAdminReqs|chargerAdminCommandes/.test(g),
  'aucun rechargement inventé : la console écoute `requests` en instantané');

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
