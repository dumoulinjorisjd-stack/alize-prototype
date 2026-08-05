/* LE MANUEL D'EXPLOITATION DOIT DIRE CE QUE FAIT VRAIMENT L'APPLICATION.
   C'est le document que l'admin lit pour répondre à un prestataire ou à un client au
   téléphone. Un manuel en retard sur le code est pire qu'absent : il fait répondre une
   chose fausse avec assurance. Il annonçait encore « net de la commission de 15 % » (taux
   figé, alors qu'il est dégressif) et ne disait rien du verrou paiement, du partage
   Mollie, des versements bloqués, ni de la règle d'alerte au prestataire. */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const M = src.slice(src.indexOf("function adminManual()"), src.indexOf("function adminManual()") + 30000);

console.log('A — le verrou paiement, et comment il se débloque');
ok(/aucun d'eux n'est prévenu/.test(M),
  'le manuel dit qu’à ce stade AUCUN prestataire n’est prévenu — c’est ce qui a fait perdre une journée');
ok(/c'est CE passage qui déclenche l'alerte/.test(M),
  'et que l’alerte part au passage à « En attente », jamais à la création');
ok(/l'application interroge Mollie elle-même/.test(M),
  'ainsi que le filet qui ouvre la demande si le message de Mollie n’arrive pas');

console.log('B — le partage du paiement et les versements bloqués');
ok(/activée<\/b> sur demande|activée .{0,12}sur demande/.test(M), 'l’activation « Marketplace » est signalée comme obtenue sur demande');
ok(/personnes morales ou auto-entrepreneurs/.test(M), 'la condition posée par Mollie y figure');
ok(/Versements prestataires bloqués/.test(M), 'la carte console est décrite');
ok(/Je l'ai versé à la main/.test(M), 'y compris le recours manuel');
ok(/n'est plus partageable/.test(M),
  'et la limite : un paiement déjà viré en banque ne se partage plus');

console.log('C — la règle d’alerte au prestataire');
ok(/12 bis/.test(M), 'une section lui est consacrée');
ok(/on ne l\\'alerte que s\\'il a une action à faire/i.test(M), 'la règle est énoncée telle quelle');
ok(/Vous, en revanche, êtes prévenu dans tous les cas/.test(M),
  'et la contrepartie : l’admin, lui, voit tout');
ok(/reçoit un <b>e-mail<\/b> à la place/.test(M), 'le filet e-mail est documenté');

console.log('D — ce qui était faux ne l’est plus');
ok(!/net de la commission de 15 %/.test(M),
  '« net de la commission de 15 % » a disparu — le taux est dégressif, pas fixe');
ok(/au bout de <b>48 h<\/b>/.test(M), 'la validation tacite à 48 h est dans la réponse type');
ok(/Validation tacite à 48 h/.test(M), 'et dans le cycle de vie d’une demande');
ok(/point GPS obligatoire<\/b> et infos d'accès/.test(M),
  'le point GPS exigé partout, colis compris, est documenté');
ok(/CGV, article 5/.test(M),
  'et le plancher petites commandes renvoie aux CGV, là où il est désormais écrit');

console.log('E — la console au quotidien');
ok(/Rapport quotidien \(9 h\)/.test(M), 'le rapport de 9 h est décrit comme le point de contrôle');
ok(/Essai sur cet appareil/.test(M), 'et l’essai avant ouverture, avec le rappel de le couper');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
