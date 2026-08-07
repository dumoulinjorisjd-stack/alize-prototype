/* L'APPLICATION NE SAVAIT PAS RENDRE L'ARGENT.
   Elle savait encaisser, capturer, verser — jamais rembourser. Aucune fonction serveur,
   aucun écran : le seul recours était le tableau de bord Mollie, hors de toute
   comptabilité. Sur un essai à 2 € ça ne se voit pas ; face à un client mécontent le
   2 octobre, c'est une crise. Le motif décide du sort de la part du prestataire, parce
   que « il n'a rien fait » et « geste commercial » n'ont rien à voir. */
const fs=require('fs');
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const fn=fs.readFileSync('/home/user/alize-work/functions/index.js','utf8');
const src=fs.readFileSync('/home/user/alize-work/index.html','utf8');

console.log('A — le serveur sait rendre, et seulement l’administrateur');
ok(/exports\.refundOrder = onCall\(\{secrets: \['MOLLIE_ACCESS_TOKEN'\]\}/.test(fn),'la fonction existe');
const bloc=fn.slice(fn.indexOf('exports.refundOrder'),fn.indexOf('exports.payoutManual'));
ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)/.test(bloc),'réservée à l’administrateur');
ok(/payments\/' \+ encodeURIComponent\(r\.molliePaymentId\) \+ '\/refunds', 'POST'/.test(bloc),
  'elle appelle bien l’API de remboursement de Mollie');

console.log('B — on ne rend jamais plus que ce qui a été encaissé');
ok(/String\(p\.data\.status \|\| ''\) !== 'paid'/.test(bloc),
  'une empreinte jamais capturée n’a rien prélevé : on refuse de « rembourser » du vide');
ok(/amountRefunded/.test(bloc),'les remboursements déjà faits sont déduits');
ok(/On ne peut pas rendre plus que ce qui a été encaissé/.test(bloc),'et le dépassement est refusé avec le reste disponible');

console.log('C — le motif décide du sort de la part du prestataire');
ok(/const reprise = \(motif === 'non_faite'\);/.test(bloc),'le motif est lu');
ok(/if \(reprise && r\.molliePayout === 'routed'\)/.test(bloc),
  'la reprise n’a de sens que si la part lui a été routée');
ok(/body\.reverseRouting = true;/.test(bloc),'remboursement total → Mollie ramène sa part');
ok(/body\.routingReversals = \[\{amount/.test(bloc),'remboursement partiel → reprise au prorata');
ok(/type: 'organization', organizationId: orgId/.test(bloc),'depuis SON organisation, pas une autre');

console.log('D — la raison d’un refus est conservée telle quelle');
ok(/String\(d\.detail \|\| d\.title \|\| ''\)/.test(bloc),
  'Mollie explique son refus : on garde son explication, on n’en invente pas');

console.log('E — les comptes le savent');
ok(/refundedTotal: cumul, refunds: FieldValue\.arrayUnion\(ligne\)/.test(bloc),'la prestation garde la trace de chaque remboursement');
ok(/collection\('ledger'\)\.doc\(reqId\)\.set\(\{refundedTotal: cumul/.test(bloc),
  'et le registre aussi — sinon le justificatif annonce un revenu sur une somme rendue');
ok(/refundedTotal:\(Number\(e\.refundedTotal\)\|\|0\)/.test(src),
  'la console recopie ce champ — le piège de molliePayout, on ne le refait pas');

console.log('F — l’écran ne laisse pas rembourser d’un doigt qui glisse');
ok(/data-adm="remb-open:/.test(src)&&/data-adm="remb-go:/.test(src),'ouverture et validation sont deux gestes distincts');
ok(/if\(S\._rembArm!==id\)\{S\._rembArm=id;/.test(src),'premier appui = armé, second = c’est parti');
ok(/Un remboursement est <b>irréversible<\/b>/.test(src),'et l’écran le dit avant, pas après');
ok(/Intégralement remboursée/.test(src),'une facture entièrement rendue ne propose plus de bouton');

console.log(f?'\n'+f+' ÉCHEC(S)':'\nTOUT EST VERT');
process.exit(f?1:0);
