/* « On part sur cette solution. » — l'éditeur, le 23/10/2026.

   CE QUI A ÉTÉ MESURÉ AVANT DE DÉCIDER. La fenêtre d'une empreinte bancaire dépend de la
   CARTE du client : sept jours sur une Visa, trente sur une Mastercard. L'horizon de
   réservation de Ti-Services va de trente jours à un an. Sur une réservation à quinze
   jours, l'empreinte est donc morte le jour de la prestation — et le client ne choisit
   pas son réseau. Le mandat, lui, n'a pas de durée propre : il vit jusqu'à l'expiration
   de la carte, que l'application lit déjà (`cardExpiryDate`).

   CE QUE CETTE ÉPREUVE GARDE. Le noyau qui décide d'où vient l'argent d'un règlement, et
   où la commission est retenue. Elle le monte dans un bac à sable VIDE — ni horloge, ni
   réseau, ni base — puis mesure ses décisions, et surtout l'INVARIANT que l'ancien calcul
   violait : un net routé ne dépasse jamais le paiement qui le porte.

   Le moteur de paiement n'est pas joignable depuis le harnais : ce qui s'éprouve ici est
   la DÉCISION et le CÂBLAGE, pas un aller-retour Mollie. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

/* ── LE NOYAU, DANS UN BAC À SABLE VIDE ─────────────────────────────────────────────── */
const i0 = srv.indexOf('const REGLEMENT_MOTIFS');
const i1 = srv.indexOf("// Vérifie l'onboarding RÉEL", i0);
ok(i0 > 0 && i1 > i0, 'le noyau se trouve dans le serveur, à sa place');
const source = srv.slice(i0, i1);
// Assertion arrière : un relevé vide satisferait toutes les gardes de pureté ci-dessous.
ok(source.length > 1500 && /function reglementDecider/.test(source), 'et le relevé porte bien le noyau (sinon les gardes de pureté ne mesurent rien)');

console.log('A — le noyau ne touche rien du monde extérieur');
for (const mot of ['Date', 'Math.random', 'fetch', 'require', 'process', 'db.', 'getFirestore', 'mollieApi', 'console.', 'await']) {
  ok(source.indexOf(mot) < 0, 'il n\'emploie pas ' + mot);
}
const bac = {round2: (x) => Math.round((Number(x) || 0) * 100) / 100};
vm.createContext(bac);
// Le bac n'a QUE round2 : si le noyau lisait l'heure ou le réseau, il lèverait ici.
new vm.Script(source + '\nthis.decider = reglementDecider; this.motifs = REGLEMENT_MOTIFS;').runInContext(bac);
const D = bac.decider;
ok(typeof D === 'function', 'il s\'exécute dans un bac sans horloge, sans réseau et sans base');

console.log('B — l\'invariant : un net routé ne dépasse JAMAIS le paiement qui le porte');
/* C'EST LE DÉFAUT QUI ÉTAIT EN LIGNE. `mollieRouteNet` pose une route SUR UN PAIEMENT ;
   or l'ancien net se calculait sur `capte = capture + arrhes`, et les arrhes vivent sur un
   AUTRE paiement. Mission à 100 € avec 50 % d'arrhes et 20 % de commission : capture de
   50 €, et l'on demandait à Mollie de router 80 € sur un paiement de 50 €. On reproduit
   ici l'ancien calcul pour mesurer l'écart, au lieu de l'affirmer. */
const cas = {gross: 100, arrhes: 50, empreinte: {montant: 100, statut: 'authorized'}, commissionTotale: 20};
const ancienNet = (100 /* capte = toCapture + arrhesPayees */) - 20;         // = 80
const r = D(cas);
ok(ancienNet > r.surEmpreinte, 'l\'ancien calcul demandait 80 € de route sur un paiement de ' + r.surEmpreinte + ' € — refusé par Mollie, versement en régularisation manuelle');
ok(r.netEmpreinte <= r.surEmpreinte, 'le net de l\'empreinte (' + r.netEmpreinte + ') tient dans la capture (' + r.surEmpreinte + ')');
ok(r.netArrhes <= 50, 'le net des arrhes (' + r.netArrhes + ') tient dans le paiement des arrhes');
ok(round(r.netArrhes + r.netEmpreinte + r.netHorsSession) === 80,
  'et la somme des nets retombe sur brut − commission : le prestataire touche la même chose quel que soit le découpage');
function round(x) { return Math.round(x * 100) / 100; }

console.log('C — l\'empreinte morte : le cas qui se perdait en silence');
const mort = D({gross: 120, arrhes: 0, empreinte: {montant: 120, statut: 'expired'}, commissionTotale: 24});
ok(mort.aCapturer === 0, 'une empreinte expirée ne se capture pas');
ok(mort.horsSession === 120, 'la totalité repart hors session, sur le mandat — et non ZÉRO comme avant');
ok(mort.empreinteMorte === true, 'et le fait est NOMMÉ, pour que l\'exploitant l\'apprenne au lieu de le découvrir');
ok(mort.motif === 'hors-session' && bac.motifs.indexOf(mort.motif) >= 0, 'le motif vient d\'une liste fermée');
ok(mort.commissionHorsSession === 24 && mort.netHorsSession === 96,
  'la commission est retenue là où l\'argent ARRIVE : sur le prélèvement hors session');
for (const st of ['canceled', 'failed', 'open', 'pending', '', 'quelque-chose-de-neuf']) {
  ok(D({gross: 60, empreinte: {montant: 60, statut: st}, commissionTotale: 12}).aCapturer === 0,
    'un statut « ' + (st || 'absent') + ' » ne porte rien non plus : on ne devine pas qu\'une empreinte morte pourrait payer');
}

console.log('D — ce qui ne doit PAS changer : le cas ordinaire d\'aujourd\'hui');
/* SANS CETTE MOITIÉ, un correctif qui ferait tout passer hors session passerait au vert.
   Empreinte vivante, pas d'arrhes : le règlement doit être EXACTEMENT celui d'hier. */
const vivant = D({gross: 120, arrhes: 0, empreinte: {montant: 120, statut: 'authorized'}, commissionTotale: 24});
ok(vivant.aCapturer === 120 && vivant.horsSession === 0, 'on capture tout sur l\'empreinte, rien hors session');
ok(vivant.netEmpreinte === 96 && vivant.commissionEmpreinte === 24, 'et le net versé est celui d\'hier, au centime');
ok(vivant.motif === 'empreinte', 'le motif le dit');
const dejaPaye = D({gross: 120, empreinte: {montant: 120, statut: 'paid'}, commissionTotale: 24});
ok(dejaPaye.aCapturer === 0 && dejaPaye.surEmpreinte === 120 && dejaPaye.motif === 'deja-regle',
  'une empreinte déjà capturée ne se recapture pas, et son net reste routable');

console.log('E — le plafond consenti par le client tient');
/* L'empreinte était aussi un PLAFOND : jamais plus que la somme annoncée à la commande.
   Le supplément au-delà existe (heures en plus, pourboire) et passe hors session. */
const dep = D({gross: 150, arrhes: 0, empreinte: {montant: 100, statut: 'authorized'}, commissionTotale: 30});
ok(dep.aCapturer === 100, 'on ne capture jamais plus que la somme autorisée');
ok(dep.horsSession === 50, 'le dépassement part hors session');
ok(dep.motif === 'empreinte-partielle', 'et le découpage est nommé');
ok(round(dep.netEmpreinte + dep.netHorsSession) === 120, 'le prestataire touche toujours brut − commission');
ok(dep.netEmpreinte <= dep.aCapturer && dep.netHorsSession <= dep.horsSession, 'chaque jambe tient dans son paiement');

console.log('F — les refus, et ce qu\'on ne perd pas');
const couvert = D({gross: 80, arrhes: 80, empreinte: {montant: 80, statut: 'authorized'}, commissionTotale: 16});
ok(couvert.du === 0 && couvert.aCapturer === 0 && couvert.horsSession === 0 && couvert.motif === 'rien-a-prendre',
  'des arrhes qui couvraient déjà tout n\'appellent aucun prélèvement : on n\'appelle pas Mollie avec 0,00 €');
ok(couvert.netArrhes === 64, 'et le net reste versable depuis le paiement des arrhes');
const grosseCom = D({gross: 10, arrhes: 0, empreinte: {montant: 10, statut: 'expired'}, commissionTotale: 40});
ok(grosseCom.commissionNonRetenue === 30 && grosseCom.netHorsSession === 0,
  'une commission plus grosse que l\'encaissement ne se retient pas dans le vide : le reste est RENDU, pour être dit');
ok(D({gross: 0, empreinte: {montant: 0, statut: 'authorized'}, commissionTotale: 0}).motif === 'rien-a-prendre',
  'une mission à zéro euro ne déclenche rien');
const sansEmpreinte = D({gross: 90, arrhes: 0, empreinte: {}, commissionTotale: 18});
ok(sansEmpreinte.horsSession === 90 && sansEmpreinte.empreinteMorte === false,
  'une demande SANS empreinte (créée hors carte) part hors session, et ce n\'est pas une empreinte morte');

console.log('G — déterminisme : deux exécutions, le même découpage');
const a1 = JSON.stringify(D(cas)), a2 = JSON.stringify(D(cas));
ok(a1 === a2, 'le registre et le versement racontent donc la même histoire');

console.log('H — le câblage : la décision est LUE, et rien ne la contourne');
const SET = (() => { const i = srv.indexOf('exports.settleCommission'); return srv.slice(i, srv.indexOf('exports.notifyReopenedRequest', i)); })();
ok(/reglementDecider\(\{/.test(SET), 'le règlement appelle le noyau');
ok(/const R = reglementDecider/.test(SET) && /R\.aCapturer/.test(SET) && /R\.horsSession/.test(SET) && /R\.netEmpreinte/.test(SET),
  'et il LIT sa décision : une décision calculée puis jetée ne garde rien');
ok(SET.indexOf("mollieApi('/payments/'") < SET.indexOf('const R = reglementDecider'),
  'l’état de l’empreinte est lu AVANT de décider — c’est l’inversion qui faisait valoir ZÉRO au solde, donc perdre le règlement en silence');
/* ON ÉPINGLE LA CONDITION, PAS LA PRÉSENCE DE LA CHAÎNE. Une garde qui cherche
   « reglementAjourne » reste VERTE quand on remplace `if (!statutLu)` par `if (false)` :
   le texte est là, la branche est morte. C'est la contre-épreuve qui l'a dit. */
ok(/if \(!statutLu\) \{/.test(SET) && /reglementAjourne: 'empreinte-illisible'/.test(SET)
  && /return;/.test(SET.slice(SET.indexOf("reglementAjourne: 'empreinte-illisible'"))),
  'un état ILLISIBLE n’est pas une empreinte expirée : on s’arrête, on le dit, et l’on ne prélève pas une seconde fois');
ok(/complementCommission: R\.commissionHorsSession/.test(SET)
  && SET.indexOf('complementCommission: R.commissionHorsSession') < SET.indexOf('await mollieChargeComplement('),
  // On vise l'APPEL et non le nom : le nom paraît d'abord dans le commentaire qui
  // explique la section, et une garde qui lit sa propre prose ne garde rien.
  'la commission du prélèvement hors session s’écrit AVANT l’appel : le webhook de Mollie peut répondre dans la seconde et la lit');
ok(/empreinteMorte/.test(SET) && /Empreinte expirée au règlement/.test(SET),
  'une empreinte morte au règlement part en courriel : c’est le cas qui ne laissait AUCUNE trace');
ok(/const jambes = \[/.test(SET) && /champ: 'molliePayout'/.test(SET) && /champ: 'arrhesPayout'/.test(SET),
  'le versement se fait jambe par jambe, chacune sur SON paiement');
ok(!/capte - commission/.test(srv), 'et l’ancien net, calculé sur capture + arrhes, a bien disparu');

console.log('I — le plafond d’un prélèvement hors session est EXIGÉ');
const MCC = srv.slice(srv.indexOf('async function mollieChargeComplement'), srv.indexOf('function commissionDuComplement'));
// Mêmes dents : la CONDITION, sinon `if (false)` désarme le refus sans rien faire rougir.
ok(/if \(!\(isFinite\(max\) && max > 0\)\) \{/.test(MCC) && /out\.reason = 'plafond-absent'/.test(MCC),
  'sans plafond, elle refuse — un appelant qui l’oublie ne prélève rien');
ok(/if \(amount > max \+ 0\.009\) \{/.test(MCC) && /out\.reason = 'plafond'/.test(MCC),
  'et au-delà du plafond, elle refuse aussi');
ok(MCC.indexOf("out.reason = 'plafond-absent'") < MCC.indexOf("mollieApi('/payments'"),
  'le refus vient AVANT le moindre appel à Mollie : rien ne part pour être annulé ensuite');
const appels = (srv.match(/await mollieChargeComplement\(db,/g) || []).length;   // la déclaration n'est pas un appelant
ok(appels === 2, 'deux appelants, pas plus (' + appels + ' mesuré)');
ok(/montantsDemande\(r\)\.gross\);/.test(srv), 'le relanceur borne par le total RECALCULÉ, pas par le montant qu’il relance');
ok(/\/\/ noyau, le plafond de la facture\.|le plafond de la facture/.test(srv) || /\n            gross\);/.test(srv),
  'le règlement borne par le total validé par le client');

console.log('J — plus rien n’est prélevé avant la prestation');
ok(!/exports\.prelevementArrhes/.test(srv), 'le prélèvement à l’acceptation n’existe plus');
ok(!/_reserverArrhes/.test(srv), 'et son verrou de double prélèvement non plus');
ok(/ON NE PRÉLÈVE PLUS RIEN AVANT LA PRESTATION/.test(srv), 'la décision et sa raison restent écrites à la place qu’elles occupaient');
ok(/async function rendreArrhes/.test(srv),
  'mais RENDRE les arrhes survit : des missions en portent, prises avant ce jour, et une annulation sans frais doit les rendre');
ok(/async function arrhesPctServeur/.test(srv) && /ARRHES_PCT_DEFAUT = 50/.test(srv),
  'et le pourcentage garde son seul sens réel — le taux de l’INDEMNITÉ d’annulation, celui que l’écran du client annonce déjà');

console.log('K — les règles : ce que seul le serveur écrit, et ce que le prestataire ne touche pas');
const reg = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const bUsers = reg.slice(reg.indexOf('match /requests/{reqId}'));
ok(bUsers.length > 500, 'le bloc des demandes a bien été trouvé (sinon les mesures suivantes ne mesurent rien)');
for (const k of ['arrhesPayout', 'reglementAjourne', 'empreinteMorteAu', 'commissionNonRetenue']) {
  ok(new RegExp("'" + k + "'").test(bUsers), 'le champ ' + k + ' n’est écrit que par le serveur');
}
ok(/'acts','options'/.test(bUsers), 'les prix détaillés sont des TERMES du contrat : figés dès l’acceptation');
ok(/hasAny\(\['tip'\]\)/.test(bUsers), 'et le prestataire ne se donne pas de pourboire');

console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Règlement sur mandat : tout est vert');
