/* « Dans les versements prestataire bloqué, il y a des paiements qui ont échoué pour des
   raisons de test, je ne peux pas les supprimer. »

   MESURÉ LE 26/10/2026 : `payoutRetry` ne consultait NI `exclu` NI `comptaExclue`. Une
   commande d'essai DÉJÀ écartée du registre restait donc dans « Versements prestataires
   bloqués », indéfiniment, à côté de vrais versements dus — et la carte n'offrait que
   deux issues : « Réessayer » (qui échoue, c'est un essai) et « Je l'ai versé à la main »
   (qui NOTERAIT un virement qui n'a jamais eu lieu). Il n'y avait pas de troisième porte.

   ON N'A PAS INVENTÉ UN SECOND DRAPEAU. `ledgerExclude` est le geste d'exclusion
   comptable, réservé à l'administrateur, réversible, et qui garde qui l'a fait, quand et
   pourquoi : c'est lui qu'on consulte, et c'est lui que le bouton appelle.

   ON N'EFFACE JAMAIS : « le registre est immuable, et une ligne supprimée est une piste
   d'audit perdue » — la règle est écrite au-dessus de `ledgerExclude` depuis toujours. Ce
   qu'on demandait n'était pas de supprimer, c'était de pouvoir sortir une ligne d'essai
   d'une liste de travail. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const SRV = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* ── LE NOYAU, MONTÉ DANS UN BAC VIDE ────────────────────────────────────────────────── */
const i0 = SRV.indexOf('function versementEcarte');
const ctx = vm.createContext({});
new vm.Script(SRV.slice(i0, SRV.indexOf('\n}', i0) + 2) + '\nthis.X = {versementEcarte: versementEcarte};').runInContext(ctx);
const { versementEcarte } = ctx.X;

console.log('\n── CE QUI EST ÉCARTÉ DES COMPTES N\'A PLUS DE NET À VERSER ──────────────');
ok(versementEcarte({comptaExclue: true}, null) === true, 'le drapeau de la DEMANDE écarte');
ok(versementEcarte(null, {exclu: true}) === true, 'le drapeau du REGISTRE écarte aussi');
/* DEUX SOURCES, PARCE QUE L'EXCLUSION S'ÉCRIT EN DEUX TEMPS : `ledgerExclude` pose
   `exclu` sur le registre, puis `comptaExclue` sur la demande — et les demandes trouvées
   par `molliePayout == 'unrouted'` n'ont pas toutes une écriture au registre. */
ok(versementEcarte({comptaExclue: true}, {exclu: false}) === true, 'une seule des deux suffit (la demande)');
ok(versementEcarte({comptaExclue: false}, {exclu: true}) === true, 'une seule des deux suffit (le registre)');

console.log('\n── LA MOITIÉ QUI COMPTE : CE QUI EST DÛ RESTE DÛ ───────────────────────');
/* Écarter de l'argent réellement dû est la faute la plus chère ici, puisqu'elle est
   SILENCIEUSE : le prestataire n'est pas payé et plus personne ne le voit. */
ok(versementEcarte({}, {}) === false, 'un versement ordinaire n\'est pas écarté');
ok(versementEcarte(null, null) === false, 'ni un versement sans écriture ni demande lisible');
ok(versementEcarte({comptaExclue: 1}, null) === false, 'un 1 n\'est pas une décision d\'administrateur');
ok(versementEcarte({comptaExclue: 'oui'}, null) === false, 'ni une chaîne');
ok(versementEcarte(null, {exclu: {}}) === false, 'ni un objet');
ok(versementEcarte({comptaExclue: false}, {exclu: false}) === false, 'une exclusion RETIRÉE rend la ligne à la liste');

console.log('\n── LE FILTRE EST POSÉ AUX DEUX ENDROITS QUI VOIENT UNE LIGNE ───────────');
const ip = SRV.indexOf('exports.payoutRetry');
const corps = SRV.slice(ip, SRV.indexOf('\nexports.', ip + 20));
ok(/if \(versementEcarte\(null, x\)\) \{ ecartees\+\+; continue; \}/.test(corps),
  'dans la boucle du registre, avant le compte du net');
ok(/if \(versementEcarte\(r, reg\)\) \{ if \(!cible\) ecartees\+\+; continue; \}/.test(corps),
  'et dans la liste finale, qui voit aussi les demandes sans écriture');
/* ASSERTION ARRIÈRE : une boucle qui ne tournerait plus satisferait les deux. */
ok(/where\('molliePayout', '==', 'unrouted'\)/.test(corps) && /db\.collection\('ledger'\)\.get\(\)/.test(corps),
  'arrière : les deux sources sont bien lues');
/* LE FILTRE PASSE AVANT LE NET : compter d'abord puis écarter laisserait un total qui ne
   correspond à aucune ligne affichée. */
ok(corps.indexOf('versementEcarte(null, x)') < corps.indexOf("round2(Number(x.netAmount)"),
  'écarter précède le calcul du net dû');

console.log('\n── CE QU\'ON ÉCARTE SE COMPTE ET SE DIT ─────────────────────────────────');
/* Une liste qui rétrécit sans un mot se lit comme une liste qui a perdu quelque chose. */
ok(/let ecartees = 0;/.test(corps), 'le serveur les compte');
ok(/return \{bloques: bloques, verses: verses, ecartees: ecartees\};/.test(corps), 'et le rend');
/* ET LE COMPTEUR EST EN PORTÉE AU RETOUR — ON LE DEMANDE À V8, ON NE COMPTE PLUS LES
   ACCOLADES. Une première version comparait deux PROFONDEURS et rendait « 2 = 2 » :
   la déclaration à (fonction + try), le retour à (fonction + objet littéral du
   `return {`). Deux fois deux, pour deux raisons différentes — la comparaison ne
   mesurait RIEN, et sa contre-épreuve passait parce qu'elle déplaçait la déclaration
   d'un cran de plus. Le défaut est parti EN PRODUCTION : `let ecartees = 0;` vivait
   dans le `try`, le `return` est après le `catch`, et l'écran de l'administrateur
   affichait « incident technique de notre côté » au lieu de ses versements bloqués.

   LE PROCÉDÉ EST EXACT PARCE QUE C'EST L'ANALYSEUR QUI RÉPOND : on insère une
   REDÉCLARATION `let` juste avant le retour. V8 refuse à l'ANALYSE (« already been
   declared ») si la variable est dans la même portée — donc l'erreur PROUVE qu'elle y
   est, et un source qui passe prouve le contraire. Aucune heuristique. */
(function () {
  const i = corps.indexOf('return {bloques:');
  ok(i > 0, 'arrière : le retour final se relève');
  const src = '(async function(){' + corps.slice(corps.indexOf('{') + 1, i)
    + 'let ecartees;' + corps.slice(i) + '})';
  let enPortee = false;
  try { new vm.Script(src); } catch (e) { enPortee = /already been declared/.test(e.message); }
  ok(enPortee, 'le compteur est en portée au retour (V8 refuse de le redéclarer)');
})();
ok(/ecartees:Number\(d\.ecartees\)\|\|0/.test(APP), 'la console le garde');
ok(/prestation\$\{vers\.ecartees>1\?'s':''\} écartée/.test(APP), 'et l\'écrit sous la liste');
const iEc = APP.indexOf('vers.ecartees?`<div');
ok(/Retrouver une facture/.test(APP.slice(iEc, iEc + 500)) && iEc > 0,
  'en nommant où les revoir — un retrait sans porte de retour serait une suppression');

console.log('\n── LE GESTE, LÀ OÙ L\'ON LIT LE PROBLÈME ────────────────────────────────');
ok(/data-adm="vers-essai:/.test(APP), 'la carte des versements porte le bouton');
ok(/C\\u2019\\u00e9tait un essai, \\u00e9carter/.test(APP), 'il dit ce qu\'il fait');
/* ELLE NOMMAIT L'ÉCRITURE, PAS LA PROPRIÉTÉ : `S._versEssaiArm=id;render();` au
   caractère près. Le jour où une troisième sortie est apparue à côté (v893), armer
   l'une a dû DÉSARMER l'autre — deux confirmations en attente ne se lisent pas — et
   l'épreuve a rougi sur un code juste. Ce qui compte est qu'un premier appui arme au
   lieu d'agir, pas l'ordre des instructions. */
ok(/S\._versEssaiArm!==id\)\{[\s\S]{0,160}?S\._versEssaiArm=id;[\s\S]{0,160}?render\(\);/.test(APP),
  'il s\'arme : un premier appui pose l\'attente et redessine, il n\'écarte rien');
ok(/Un second appui l\u2019écartera des comptes \(réversible\)/.test(APP), 'et le premier appui dit que c\'est réversible');
/* MÊME APPELABLE QUE LA CARTE DES FACTURES : un second chemin d'exclusion finirait par
   ne plus écrire les mêmes drapeaux. */
const iE = APP.indexOf("act==='vers-essai'");
const gest = APP.slice(iE, iE + 1400);
ok(/httpsCallable\(FB\.functions,'ledgerExclude'\)/.test(gest), 'il appelle le geste d\'exclusion qui existe déjà');
ok(/exclu:true,motif:'essai, versement jamais dû'/.test(gest), 'avec un motif, qui restera au journal');
ok(/isAdminAccount\(\)/.test(gest), 'et l\'écran le réserve à l\'administrateur');
/* LA PROPRIÉTÉ EST « UNE PORTE, PLUSIEURS APPELANTS », PAS UN NOMBRE. Cette assertion
   fixait le compte du jour (deux) et a rougi dès qu'une troisième carte a emprunté la
   même porte — exactement la faute qu'elle était censée empêcher ailleurs. Ce qui doit
   rester vrai : plusieurs écrans l'appellent, et AUCUN second chemin d'exclusion
   n'existe à côté. */
const appels = (APP.match(/httpsCallable\(FB\.functions,'ledgerExclude'\)/g) || []).length;
ok(appels >= 2, 'plusieurs écrans passent par la même porte (' + appels + ' appelants)');
ok(!/httpsCallable\(FB\.functions,'(ledgerExclure|excludeLedger|ledgerEcarter|reqExclude)'\)/.test(APP),
  'et aucun second appelable d\'exclusion n\'a été écrit à côté');
ok(!/collection\('ledger'\)[\s\S]{0,80}delete\(\)/.test(SRV), 'et rien ne SUPPRIME une écriture');

console.log('\n── UNE DEMANDE SANS ÉCRITURE PEUT ÊTRE ÉCARTÉE ─────────────────────────');
/* La carte part aussi de `molliePayout == 'unrouted'` sur la DEMANDE : une commande
   d'essai qui a échoué avant d'entrer au registre n'y a pas de ligne, et le refus
   « Aucune écriture pour cette prestation » laissait la seule chose qu'on puisse en faire
   hors de portée. */
const iL = SRV.indexOf('exports.ledgerExclude');
const led = SRV.slice(iL, SRV.indexOf('\nexports.', iL + 20));
ok(/const dejaLed = \(await ref\.get\(\)\)\.exists;/.test(led), 'la présence de l\'écriture est un FAIT, pas une condition d\'entrée');
ok(/if \(!dejaLed && !dejaReq\) throw new HttpsError\('not-found'/.test(led),
  'mais quelque chose doit exister : on n\'écrit pas un drapeau sur un identifiant inventé');
ok(/if \(dejaLed\) await ref\.set\(\{/.test(led), 'le registre n\'est touché que s\'il a une ligne');
/* ET L'ÉCHEC DU DRAPEAU DE LA DEMANDE NE S'AVALE PLUS : c'est lui que lit la carte des
   versements, donc son échec laisserait la ligne à l'écran sans que personne sache
   pourquoi. */
ok(/surDemande = true;/.test(led) && /if \(!dejaLed && !surDemande\) throw new HttpsError\('internal'/.test(led),
  'et si RIEN n\'a pu être écrit, on le dit au lieu de rendre « ok »');
ok(/return \{ok: true, exclu: exclu, registre: dejaLed, demande: surDemande\};/.test(led),
  'le retour dit ce qui a été écrit');

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
