/* « Fais les vraies arrhes détenues. »

   CE QUI MANQUAIT. La part réglée dans la console existait, mais ce n'était qu'un DROIT :
   rien n'était encaissé tant que le client n'annulait pas tard ET que le prestataire ne
   cliquait pas « appliquer ». Entre les deux, Ti-Services ne détenait rien — seulement
   une empreinte, qui EXPIRE. Sur une sortie réservée trois semaines à l'avance, elle
   était morte le jour venu.

   CE QU'ON FAIT. À l'ACCEPTATION — pas à la commande : tant que personne n'a pris la
   mission, on ne prend l'argent de personne — la part est prélevée pour de bon, sur le
   mandat déjà en place. Le solde se capture à la validation, arrhes déduites : le client
   paie son prix, une fois, en deux fois. Une annulation sans frais REND l'argent, pas
   seulement l'empreinte.

   Cette épreuve lit le SERVEUR : le moteur de paiement n'est pas joignable depuis le
   harnais, donc on vérifie le câblage et les garde-fous, pas un aller-retour Mollie. */
const fs = require('fs'), path = require('path');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const bloc = (nom) => { const i = srv.indexOf(nom); return i < 0 ? '' : srv.slice(i, i + 4000); };

console.log('A — on prélève à l’ACCEPTATION, et une seule fois');
ok(/exports\.prelevementArrhes = onDocumentUpdated/.test(srv), 'un déclencheur dédié, séparé des autres : un échec de prélèvement ne casse pas les notifications');
const P = bloc('exports.prelevementArrhes');
ok(/before\.status !== 'accepted' && after\.status === 'accepted'/.test(P),
  'il ne part qu’au passage à « acceptée » : tant que personne n’a pris la mission, on ne prend l’argent de personne');
ok(/if \(after\.arrhesPaymentId \|\| after\.arrhesStatut\) return;/.test(P), 'une demande déjà traitée est laissée tranquille');
ok(/await _reserverArrhes\(db, reqId\)/.test(P) && /tx\.get\(ref\)[\s\S]{0,120}throw new Error\('deja'\)/.test(srv),
  'et la place est RÉSERVÉE dans une transaction AVANT l’appel à Mollie : deux exécutions qui se croisent ne prélèvent pas deux fois');
ok(P.indexOf('_reserverArrhes') < P.indexOf('mollieChargeComplement'), 'la réservation vient bien avant l’appel, pas après');

console.log('B — le montant, et ce qu’on refuse de faire');
ok(/const assiette = round2\(Number\(after\.molliePaymentAmount\) \|\| 0\);/.test(P),
  'l’assiette est le montant que le SERVEUR a autorisé, jamais une valeur venue du navigateur');
ok(/if \(!\(pct > 0\)\) return;/.test(P), 'une part à zéro ne prélève rien');
ok(/ARRHES_MIN/.test(P) && /const ARRHES_MIN = 1;/.test(srv), 'et un montant dérisoire non plus : un prélèvement d’un euro coûte plus qu’il ne garde');
ok(/mollieChargeComplement\(db, reqId, after\.clientUid,\s*\n?\s*montant/.test(P),
  'le prélèvement passe par le mandat déjà en place, sans rien redemander au client');

console.log('C — un refus ne bloque pas la mission, et se dit');
ok(/arrhesStatut: 'echec'/.test(P), 'l’échec est inscrit sur la demande');
ok(/Arrhes NON prélevées/.test(P), 'l’administrateur est prévenu, avec la cause');
ok(/La réservation reste valable/.test(P), 'et la réservation acceptée n’est pas annulée pour autant');
ok(/Arrhes prélevées/.test(P) && /pushMulticast/.test(P),
  'le client est prévenu de ce qui a été prélevé : un débit incompris devient une contestation');

console.log('D — au règlement, on ne fait pas payer deux fois');
const S = bloc('    // 3) CAPTURE de l\'empreinte');
ok(/const arrhesPayees = \(String\(after\.arrhesStatut \|\| ''\) === 'preleve'\)/.test(S),
  'seules les arrhes RÉELLEMENT prélevées comptent, pas celles qui ont échoué');
ok(/const solde = round2\(Math\.max\(0, gross - arrhesPayees\)\);/.test(S), 'la capture porte sur le SOLDE, arrhes déduites');
ok(/capte = round2\(toCapture \+ arrhesPayees\);/.test(S),
  'mais l’assiette de la commission reste le TOTAL : le prestataire est dû sur la prestation entière');
ok(/if \(!\(toCapture > 0\)\) \{[\s\S]{0,260}mollieCaptured: true, mollieCaptureAmount: 0/.test(S),
  'et si les arrhes couvraient déjà tout, on n’appelle pas Mollie avec « 0,00 € » : un règlement qui va bien n’échoue pas');

console.log('E — une annulation SANS FRAIS rend l’argent');
ok(/async function rendreArrhes\(db, reqId, r, motif\)/.test(srv), 'rendre les arrhes est une fonction à part entière');
const R = bloc('async function rendreArrhes');
ok(/String\(r\.arrhesStatut \|\| ''\) !== 'preleve'\) return false;/.test(R), 'on ne rend que ce qui a été pris');
ok(/arrhesStatut: ok \? 'rendu' : 'rendu-echec'/.test(R), 'et on ne le rend qu’une fois');
ok(/Arrhes NON rendues/.test(R), 'un remboursement refusé ne reste pas silencieux : c’est l’argent du client');
['annulation sans frais', 'demande expirée', 'indemnité levée'].forEach(function (cas) {
  ok(srv.indexOf("rendreArrhes(db, reqId, after, '" + cas + "')") > 0, 'les arrhes sont rendues : ' + cas);
});
ok(/releaseMollieHold\(db, reqId, after, 'annulée'\);\s*\n\s*await rendreArrhes/.test(srv),
  'libérer l’empreinte ne suffisait plus : on rend AUSSI ce qui a été encaissé');

console.log('F — une annulation TARDIVE : les arrhes SONT l’indemnité');
const C = bloc('  const pctArrhes = await arrhesPctServeur');
ok(/const arrhesPrises = \(String\(after\.arrhesStatut \|\| ''\) === 'preleve'\)/.test(C), 'on regarde d’abord ce qui est déjà encaissé');
ok(/const payId = arrhesPrises > 0 \? String\(after\.arrhesPaymentId \|\| ''\)/.test(C),
  'le partage se fait alors depuis CE paiement-là, pas depuis l’empreinte');
ok(/if \(arrhesPrises > 0\) \{[\s\S]{0,200}fee = arrhesPrises;/.test(C),
  'et l’on ne capture RIEN de plus : reprendre le même pourcentage sur l’empreinte ferait payer deux fois la même annulation');

console.log('G — les règles interdisent au client de se déclarer « arrhes prélevées »');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
['arrhesPaymentId', 'arrhesAmount', 'arrhesPct', 'arrhesStatut', 'arrhesAt'].forEach(function (k) {
  ok(new RegExp("'" + k + "'").test(rules), k + ' est réservé au serveur');
});
ok(/function serverKeys\(\)[\s\S]{0,1400}arrhesStatut/.test(rules),
  'et ils sont dans serverKeys, la liste que le client ne peut pas écrire : sans ce verrou, on se déclarerait payé et le règlement déduirait du solde une somme jamais versée');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
process.exit(f ? 1 : 0);
