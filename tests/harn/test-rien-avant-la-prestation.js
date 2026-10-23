/* « Le client est débité que la prestation finie. C'est une promesse commerciale. On ne
   peut pas déroger à cette règle. » — l'éditeur, le 23/10/2026.

   CETTE ÉPREUVE REMPLACE « LES VRAIES ARRHES DÉTENUES », QUI MESURAIT L'INVERSE. Le
   mécanisme prélevait pour de bon une part du total à l'ACCEPTATION. Mesuré sur la
   configuration de production : sept services sur neuf, dont quatre à 50 % par simple
   REPLI du code — `jardin` et `massage` n'ayant qu'un délai d'annulation de réglé, jamais
   de pourcentage. Sur une journée de catamaran, 30 % font plusieurs centaines d'euros
   pris des semaines avant la sortie.

   ET L'ÉCRAN DU CLIENT ANNONÇAIT DÉJÀ L'INVERSE : « Annulation gratuite jusqu'à 8 heures
   avant. Passé ce délai, 745 € restent dus au prestataire. » C'est une INDEMNITÉ due si
   l'on annule tard, pas un acompte encaissé à l'acceptation. Un client qui annulait trois
   jours avant avait donc été débité de la moitié, et il fallait le rembourser — vrai
   remboursement Mollie, 0,25 € pièce, frais du paiement initial perdus, et deux lignes
   sur son relevé après une annulation annoncée gratuite.

   CE QUI RESTE, ET QU'ON GARDE ICI : rendre les arrhes des missions qui en portent encore,
   et l'indemnité d'annulation tardive, dont le pourcentage est le seul sens réel de ce
   réglage. */
const fs = require('fs'), path = require('path');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const bloc = (nom) => { const i = srv.indexOf(nom); return i < 0 ? '' : srv.slice(i, i + 4000); };

console.log('A — plus rien n’est prélevé avant la prestation');
ok(!/exports\.prelevementArrhes/.test(srv), 'le déclencheur qui débitait à l’acceptation n’existe plus');
ok(!/_reserverArrhes/.test(srv), 'ni son verrou de double prélèvement, devenu sans objet');
ok(/ON NE PRÉLÈVE PLUS RIEN AVANT LA PRESTATION/.test(srv), 'la décision et sa raison restent écrites à la place qu’elles occupaient');
/* LA MOITIÉ QUI COMPTE : sans elle, retirer AUSSI le taux passerait au vert, et l'on aurait
   supprimé l'indemnité d'annulation — une fonction commerciale — en croyant tenir une
   promesse. */
ok(/const ARRHES_PCT_DEFAUT = 50;/.test(srv) && /async function arrhesPctServeur/.test(srv),
  'mais le POURCENTAGE reste : il ne débite plus rien, c’est le taux de l’INDEMNITÉ d’annulation');
ok(/Annulation gratuite jusqu/.test(html) && /restent dus/.test(html),
  'et l’écran du client continue de l’annoncer avant la commande, dans les mêmes mots');

console.log('B — le règlement ne fait toujours pas payer deux fois');
ok(/const arrhesPayees = \(String\(after\.arrhesStatut \|\| ''\) === 'preleve'\)/.test(srv),
  'seules les arrhes RÉELLEMENT prélevées comptent, pas celles qui ont échoué');
ok(/const du = round2\(Math\.max\(0, gross - arrhes\)\);/.test(srv),
  'ce qui reste à encaisser les déduit — une mission qui en porte ne les repaie pas');
ok(/netArrhes: round2\(arrhes - comArrhes\)/.test(srv),
  'et leur net se route sur LEUR paiement : c’est le défaut corrigé, la route porte sur UN paiement');

console.log('C — une annulation SANS FRAIS rend l’argent déjà pris');
ok(/async function rendreArrhes\(db, reqId, r, motif\)/.test(srv), 'rendre les arrhes est une fonction à part entière');
const R = bloc('async function rendreArrhes');
ok(/String\(r\.arrhesStatut \|\| ''\) !== 'preleve'\) return false;/.test(R), 'on ne rend que ce qui a été pris');
ok(/arrhesStatut: ok \? 'rendu' : 'rendu-echec'/.test(R), 'et on ne le rend qu’une fois');
ok(/Arrhes NON rendues/.test(R), 'un remboursement refusé ne reste pas silencieux : c’est l’argent du client');
['annulation sans frais', 'demande expirée', 'indemnité levée'].forEach(function (cas) {
  ok(srv.indexOf("rendreArrhes(db, reqId, after, '" + cas + "')") > 0, 'les arrhes sont rendues : ' + cas);
});
ok(/releaseMollieHold\(db, reqId, after, 'annulée'\);\s*\n\s*await rendreArrhes/.test(srv),
  'libérer l’empreinte ne suffit pas : on rend AUSSI ce qui avait été encaissé');

console.log('D — une annulation TARDIVE : les arrhes déjà prises SONT l’indemnité');
const C = bloc('  const pctArrhes = await arrhesPctServeur');
ok(/const arrhesPrises = \(String\(after\.arrhesStatut \|\| ''\) === 'preleve'\)/.test(C), 'on regarde d’abord ce qui est déjà encaissé');
ok(/const payId = arrhesPrises > 0 \? String\(after\.arrhesPaymentId \|\| ''\)/.test(C),
  'le partage se fait alors depuis CE paiement-là, pas depuis l’empreinte');
ok(/if \(arrhesPrises > 0\) \{[\s\S]{0,200}fee = arrhesPrises;/.test(C),
  'et l’on ne capture RIEN de plus : reprendre le même pourcentage sur l’empreinte ferait payer deux fois la même annulation');
/* CE QUI RESTE À FAIRE, ET QUI EST DIT PLUTÔT QUE TU. Sur une mission SANS arrhes — donc
   toutes les suivantes — l'indemnité se capture sur l'empreinte. Au-delà de sept jours
   (Visa) elle est morte, et le serveur renonce en le disant. La prélever sur le MANDAT
   demande une branche de webhook et sa propre épreuve : c'est le lot suivant. */
ok(/Indemnité d\\'annulation à régulariser/.test(srv),   // l'apostrophe est échappée dans la source
  'une empreinte non capturable fait renoncer le serveur EN LE DISANT (le repli sur le mandat reste à faire)');

console.log('E — les règles interdisent au client de se déclarer « arrhes prélevées »');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
['arrhesPaymentId', 'arrhesAmount', 'arrhesPct', 'arrhesStatut', 'arrhesAt'].forEach(function (k) {
  ok(new RegExp("'" + k + "'").test(rules), k + ' est réservé au serveur');
});
const SK = rules.slice(rules.indexOf('function serverKeys()'), rules.indexOf('function contractKeys()'));
ok(SK.length > 200 && /arrhesStatut/.test(SK),
  'et ils sont dans serverKeys, la liste que le client ne peut pas écrire : sans ce verrou, on se déclarerait payé et le règlement déduirait du solde une somme jamais versée');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
process.exit(f ? 1 : 0);
