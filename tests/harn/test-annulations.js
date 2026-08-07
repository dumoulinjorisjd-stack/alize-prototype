/* ANNULATIONS ET EXPIRATIONS : ce qui doit bouger bouge, et la bonne personne le sait.
   Avant : un statut « cancelled » ou « expired » ne déclenchait RIEN côté serveur
   (artisan jamais prévenu, empreinte jamais libérée, indemnité « appliquée » purement
   décorative), et l'annulation gratuite d'une mission acceptée tentait une SUPPRESSION
   que les règles refusent — l'utilisateur voyait « Annulation non enregistrée ». */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');

console.log('A — côté serveur : settleCancellation couvre les trois chemins');
ok(/exports\.settleCancellation = onDocumentUpdated/.test(fn), 'le déclencheur existe');
ok(/before\.status !== 'cancelled' && after\.status === 'cancelled'/.test(fn), 'transition vers cancelled traitée');
ok(/before\.status !== 'expired' && after\.status === 'expired'/.test(fn), 'transition vers expired traitée');
ok(/releaseMollieHold\(db, reqId, after, 'annulée'\)/.test(fn), 'annulation gratuite : empreinte libérée');
ok(/releaseMollieHold\(db, reqId, after, 'expirée'\)/.test(fn), 'expiration : empreinte libérée');
ok(/'\/payments\/' \+ encodeURIComponent\(payId\) \+ '\/captures'/.test(fn), 'indemnité appliquée : capture partielle réelle chez Mollie');
ok(/ledger'\)\.doc\(reqId \+ '-annulation'\)/.test(fn), 'indemnité inscrite au registre comptable');
ok(/cancelFeeSettled: true/.test(fn), 'règlement idempotent (cancelFeeSettled)');
ok(/mollieRouteNet\(payId, orgId, net, 'Ti-Services · indemnité annulation/.test(fn), 'net de l’indemnité versé à l’artisan');
// La suppression du document, elle, garde son circuit historique.
ok(/exports\.releaseHoldOnDelete = onDocumentDeleted/.test(fn), 'la suppression libère toujours l’empreinte');

console.log('B — côté client : l’annulation gratuite d’une mission acceptée passe par « cancelled »');
ok(/le statut « cancelled » : le serveur libère l'empreinte/.test(src.replace(/’/g, '\'')) || /cancelled.*le serveur libère/.test(src),
  'le chemin gratuit assigné écrit cancelled au lieu de supprimer');
ok(/feeDecision:'none'/.test(src), 'l’annulation gratuite porte feeDecision « none »');
ok(/m\.feeDecision!=='none'\)return proCancelDecision\(m\)/.test(src),
  'l’artisan ne voit PAS l’écran d’indemnité pour une annulation gratuite');
ok(/if\(m\.lateCancel\|\|m\.feeDecision==='pending'\)/.test(src),
  'la notification locale distingue tardive et gratuite');

console.log('C — règles : les champs de règlement sont au serveur seul');
ok(/'cancelFeeSettled','cancelFeeCommission','cancelFeeCommissionPct','cancelFeeNet'/.test(rules),
  'cancelFeeSettled et consorts sont dans serverKeys');
ok(/mollieCanWork', false\) == resource\.data\.get\('mollieCanWork/.test(rules),
  'l’artisan ne peut plus s’écrire mollieCanWork lui-même');
ok(/mollieOrgId', ''\) == resource\.data\.get\('mollieOrgId/.test(rules),
  'ni se lier une organisation Mollie à la main');

console.log('D — litige et rappels');
ok(/Durée contestée — /.test(fn), 'litige : l’artisan contesté est prévenu');
ok(/Contestation bien reçue/.test(fn), 'litige : le client a un accusé de réception');
ok(/arrive comme prévu\.', '\/\?open=wallet&r=/.test(fn), 'rappel 1 h : le client est prévenu aussi');
ok(/dateISO:\(function\(\)\{try\{const d=new Date\(\);if\(order\.when==='Demain'\)/.test(src),
  'les commandes conciergerie portent une dateISO (rappels possibles)');

process.exitCode = f ? 1 : 0;
console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
