/* UNE MISSION PAYÉE PAR LE SECOND PAIEMENT ENTRE AUX COMPTES.
   Relevé le 20/11/2026 : mission de massage, 104,50 € net, versement fait à la main —
   absente de « Factures par artisan », de la commission et du CA. L'empreinte avait
   expiré, tout était passé par le second paiement (le mandat), et la comptabilité ne
   lisait que le premier. */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
const ENC = require(path.join(RACINE, 'functions', 'encaissement.js'));
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const pay = (status, amount, extra) => Object.assign({status: status, amount: {value: amount}}, extra || {});

console.log('A — le noyau');
let e = ENC.encaissement(pay('expired', '125.00'), pay('paid', '118.00'));
ok(e.encaisse && e.par === 'second' && e.montantPaye === 118,
  'empreinte expirée, prestation entière par le second paiement : ENCAISSÉE, 118 € (' + JSON.stringify(e) + ')');
e = ENC.encaissement(pay('paid', '80.00', {amountCaptured: {value: '66.00'}}), null);
ok(e.encaisse && e.par === 'principal' && e.montantPaye === 66, 'empreinte capturée en partie : son capturé, 66 €');
e = ENC.encaissement(pay('paid', '66.00', {amountCaptured: {value: '66.00'}, settlementAmount: {value: '64.70'}}), pay('paid', '10.00'));
ok(e.encaisse && e.par === 'les-deux' && e.montantPaye === 76 && e.frais === null,
  'deux paiements payés : 76 €, et pas de frais tant que le second n’a pas son règlement');
e = ENC.encaissement(pay('paid', '66.00', {amountCaptured: {value: '66.00'}, settlementAmount: {value: '64.70'}}), pay('paid', '10.00', {settlementAmount: {value: '9.70'}}));
ok(e.frais === 1.6 && e.reglement === 74.4, 'les deux règlements connus : frais 1,60 €, reversé 74,40 €');
e = ENC.encaissement(pay('authorized', '125.00'), null);
ok(!e.encaisse && e.montantPaye === 0, 'une empreinte seulement autorisée n’a débité personne : 0 €, pas son autorisation');
ok(!ENC.encaissement(null, null).encaisse && !ENC.encaissement(pay('expired', '1'), pay('failed', '1')).encaisse,
  'rien de payé : hors comptes, comme avant');

console.log('B — branché là où l’argent entre aux comptes');
const rf = fn.slice(fn.indexOf('async function recordMollieFee('), fn.indexOf('async function recordMollieFee(') + 3500);
ok(/const ENC = require\('\.\/encaissement'\)/.test(fn), 'le serveur charge le noyau');
ok(/complementPaymentId/.test(rf) && /ENC\.encaissement\(d, d2\)/.test(rf),
  'le relevé lit le second paiement et décide par le noyau (relevé quotidien, bouton « Rapprocher avec Mollie », règlement)');
ok(/mollieEncaisse: E\.encaisse/.test(rf) && !/mollieEncaisse: \(statut === 'paid'\)/.test(rf),
  'l’entrée aux comptes vient du noyau, plus du seul premier paiement');
ok((rf.match(/if \(!p2?\.ok \|\| !p2?\.data\) return false;/g) || []).length === 2,
  'Mollie muet sur l’un des deux : on n’écrit rien, on ne devine pas');
const wh = fn.slice(fn.indexOf("complementPayout: verse ? 'routed' : 'unrouted', complementNet: netC"), fn.indexOf("complementPayout: verse ? 'routed' : 'unrouted', complementNet: netC") + 900);
ok(/await recordMollieFee\(db, reqId, String\(r\.molliePaymentId \|\| ''\)/.test(wh), 'le second paiement payé est relevé tout de suite, sans attendre le lendemain');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
