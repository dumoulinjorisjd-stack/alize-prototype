/* UN BANDEAU VERT PENDANT QU'ON DOIT DE L'ARGENT.
   La console cherchait les versements dont l'état vaut « unrouted ». Les prestations
   dont le partage n'a JAMAIS été tenté — champ jamais écrit — n'entraient dans aucune
   des deux catégories : ni bloquées, ni versées. « Aucun : tous les prestataires ont
   reçu leur net » s'affichait alors que le prestataire n'avait rien reçu et qu'aucune
   route n'existait chez Mollie. Le justificatif, lui, comptait bien « 2 écritures sans
   état de versement connu » : deux écrans, deux vérités. */
const fs=require('fs');
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const fn=fs.readFileSync('/home/user/alize-work/functions/index.js','utf8');
const src=fs.readFileSync('/home/user/alize-work/index.html','utf8');

console.log('A — le serveur ratisse les deux cas');
ok(/where\('molliePayout', '==', 'unrouted'\)/.test(fn),'les versements refusés sont toujours cherchés');
// Le net dû n'est écrit sur la demande QUE si un routage a échoué : chercher là ne
// trouvait rien pour un partage jamais tenté. Le registre, lui, connaît le net de
// chaque prestation réglée — et c'est lui que compte le justificatif. Même source
// pour les deux écrans : ils ne peuvent plus se contredire.
ok(/const led = await db\.collection\('ledger'\)\.get\(\)/.test(fn),
  'le manque est cherché dans le REGISTRE ENTIER — filtrer sur le type ferait disparaître les écritures créées avant le règlement');
// Une demande peut avoir été supprimée (essai, ménage) ; le registre, lui, ne s'efface
// jamais. Sans repli, l'argent dû redevenait invisible — le trou qu'on répare.
ok(/orphelins\.push\(/.test(fn)&&/for \(const o of orphelins\)/.test(fn),
  'une écriture dont la demande a disparu est quand même remontée');
ok(/sansDemande: true/.test(fn),'et signalée comme telle : rien à router, virement à la main');
// Écarter dès qu'un état existe laissait passer les « unrouted » dont la demande a été
// supprimée : introuvables par la requête sur les demandes, ignorées ici. Invisibles.
ok(/x\.molliePayout === 'routed' \|\| x\.molliePayout === 'manuel'/.test(fn),
  'seules les écritures RÉELLEMENT réglées sont écartées, pas toutes celles qui portent un état');
ok(/round2\(Number\(x\.netAmount\) \|\| 0\) > 0\.009/.test(fn),
  'et seules celles avec un net réellement dû sont retenues — un net nul n’est dû à personne');
ok(/Number\(r\.molliePayoutNet\) \|\| \(reg \? Number\(reg\.netAmount\) : 0\)/.test(fn),
  'le montant affiché vient de la demande si elle le porte, du registre sinon');
ok(/tente: !!r\.molliePayout/.test(fn),'chaque ligne dit si le partage a seulement été tenté');

console.log('B — la console ne confond pas « refusé » et « jamais tenté »');
ok(/v\.tente===false/.test(src),'le cas « jamais tenté » a son propre message');
ok(/n'a jamais été tenté/.test(src),'et il le dit en clair, sans motif inventé');

console.log('C — le bandeau vert reste conditionné à une liste vide');
const i=src.indexOf('Aucun&nbsp;: tous les prestataires ont reçu leur net');
ok(i>0,'le bandeau existe toujours');
// Le bandeau vert doit rester dans la branche « sinon » du test sur la liste : c'est
// ce qui garantit qu'il ne s'affiche jamais tant qu'une ligne subsiste.
ok(src.lastIndexOf('versList.length?',i)>0 && src.lastIndexOf('versList.length?',i)<i,
  'il ne s’affiche que si la liste est vide — laquelle contient désormais les deux cas');

console.log('D — la console recopie l’état du versement');
// Le champ existait au registre mais n'était pas recopié au chargement : le justificatif
// comptait TOUTES les écritures comme « sans état », et la dette ne pouvait jamais
// s'afficher. Un oubli d'une ligne, invisible, qui rendait l'écran comptable menteur.
ok(/molliePayout:\(e\.molliePayout\|\|null\)/.test(src),
  'molliePayout est copié du registre vers la console');
const iLoad=src.indexOf('molliePayout:(e.molliePayout||null)');
ok(iLoad>0 && src.lastIndexOf('netAmount:e.netAmount',iLoad)>0,
  'au même endroit que le net — les deux servent au même calcul de dette');

console.log(f?'\n'+f+' ÉCHEC(S)':'\nTOUT EST VERT');
process.exit(f?1:0);
