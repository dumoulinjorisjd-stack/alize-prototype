/* LE POURBOIRE NE COÛTE PLUS D'ARGENT À TI-SERVICES.
   Versé « en totalité au prestataire », chaque pourboire laissait à la plateforme les
   frais bancaires de son prélèvement séparé : encaisser 2 € coûtait ~0,22 € — à nous.
   Et la route Mollie qui portait 100 % du paiement était refusée : le pourboire restait
   sur le solde plateforme, sans motif enregistré, sans rattrapage, invisible partout.
   Désormais le pourboire porte la MÊME commission que la prestation (taux de l'artisan),
   retenue sur le paiement qui le transporte — et un supplément non reversé se voit, se
   comprend (motif Mollie conservé) et se rattrape comme le net de la mission. */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

console.log('A — la commission porte aussi sur le pourboire, au même taux, partout pareil');
ok(/const commission=\(Math\.round\(\(sub\+maj\)\*commPct\)\+Math\.round\(tip\*commPct\)\)\/100/.test(src),
  'l’app : commission = (prestation + coup de pouce) + pourboire, arrondis à part');
ok(/const tipCommission = round2\(tip \* pct \/ 100\);/.test(fn),
  'le serveur fait le MÊME arrondi séparé — écran, facture et versement au centime près');
ok(/commissionAmount: commissionTotale/.test(fn),
  'le registre inscrit la commission totale (part pourboire comprise)');
ok(/tipCommission: tipCommission/.test(fn),
  'et garde la part pourboire à part, pour la lire sans la recalculer');

console.log('B — la retenue se fait sur le paiement qui transporte le pourboire');
ok(/const tipDansComplement = Math\.min\(tip, complement\);/.test(fn),
  'le règlement sait si le pourboire voyage dans le supplément ou dans l’empreinte');
ok(/capte - commission - commTipEmpreinte/.test(fn),
  'empreinte : on retient la commission de ce qu’elle transporte, rien de plus');
ok(/function commissionDuComplement\(r, montant\)/.test(fn),
  'supplément : sa commission est figée au règlement, recalculée au taux figé sinon');
ok(/const netC = round2\(Math\.max\(0, montant - commC\)\);/.test(fn) && /mollieRouteNet\(pay\.id, orgId, netC,/.test(fn),
  'le webhook route le NET du supplément — la route ne porte plus jamais 100 % du paiement');

console.log('C — un supplément non reversé se voit, se comprend, se rattrape');
ok(/complementPayoutMotif: verse \? '' : \(routeMotif\(\) \|\| ''\)/.test(fn),
  'le motif exact du refus Mollie est conservé sur la demande');
ok(/where\('complementPayout', '==', 'unrouted'\)/.test(fn),
  'les suppléments bloqués sont cherchés par leur propre état');
ok(/'c~' \+ d\.id/.test(fn),
  'la console les liste et les retente (payoutRetry), identifiés « c~ »');
ok(/brut\.indexOf\('c~'\) === 0/.test(fn),
  'et « Je l’ai versé à la main » solde le supplément sans toucher au net de la mission');
ok(fn.indexOf('rerouteArtisanPayouts') < fn.indexOf("where('providerUid', '==', uid).where('complementPayout', '==', 'unrouted')"),
  'le rattrapage automatique (ouverture des virements) re-route aussi les suppléments');

console.log('D — plus AUCUNE promesse d’intégralité sur les pourboires, dans les trois langues');
['versé en totalité au prestataire', 'reversée en totalité au Prestataire',
  '100 % au prestataire', '(100&nbsp;% pour vous)', '100 % prestataire',
  'jamais commissionné', 'paid in full to the pro', 'Paid in full to the pro',
  'pago integralmente ao prestador', 'paga integralmente ao profissional',
  'reversée intégralement au prestataire'].forEach(function(t) {
  ok(src.indexOf(t) < 0, 'disparu : « ' + t + ' »');
});
ok(/déduction faite de la commission de Ti-Services/.test(src),
  'les CGV disent la nouvelle règle noir sur blanc (article 2)');

process.exitCode = f ? 1 : 0;
console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
