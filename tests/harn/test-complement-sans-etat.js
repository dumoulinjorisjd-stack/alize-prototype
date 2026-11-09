/* 110 € PAYÉS, ROUTÉS 0 €, ET AUCUN ÉTAT CHEZ NOUS.
   Relevé le 09/11/2026 : l'empreinte d'un massage avait expiré, la prestation entière a été
   prélevée sur la carte enregistrée (second paiement, « complément » hors-session). La
   carte « Versements prestataires bloqués » n'affichait que l'empreinte expirée (« rien
   n'est dû », exact pour elle) — et PAS le second paiement : son état de versement
   n'avait jamais été écrit, or la console comme le rattrapage des 15 minutes cherchent
   `complementPayout == 'unrouted'`. Le jour où la prestataire aurait ouvert ses
   virements, rien ne serait parti. Le ratissage « jamais tenté » ne couvrait que l'empreinte. */
const fs=require('fs');
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const RACINE='/home/user/alize-work';
const FN=fs.readFileSync(RACINE+'/functions/index.js','utf8');
const M=require(RACINE+'/functions/complement-sans-etat.js');
const A=require(RACINE+'/functions/argent-mis-de-cote.js');

console.log('A — le noyau : ce que Mollie permet d’affirmer');
{ const d=M.complementSansEtatDecider({complementPaymentId:'tr_x',statutMollie:'paid',routes:0,montant:110,commission:16.5});
  ok(d.ecrire&&d.etat==='unrouted'&&d.net===93.5,'payé, aucune route → dû, net = montant − commission (93,50)');
  const d2=M.complementSansEtatDecider({complementPaymentId:'tr_x',statutMollie:'paid',routes:0,montant:110,commission:16.5,complementNet:90});
  ok(d2.ecrire&&d2.net===90,'un net déjà figé l’emporte sur le recalcul');
  const d3=M.complementSansEtatDecider({complementPaymentId:'tr_x',statutMollie:'paid',routes:1,montant:110,commission:16.5});
  ok(d3.ecrire&&d3.etat==='routed'&&d3.net==null,'une route déjà posée = déjà versé : notre fiche était en retard, on ne route pas en double'); }
{ const refus=(e)=>M.complementSansEtatDecider(e);
  ok(!refus({complementPaymentId:'tr_x',statutMollie:null,routes:0,montant:110}).ecrire&&refus({complementPaymentId:'tr_x',statutMollie:null,routes:0,montant:110}).raison==='mollie-muet','Mollie injoignable : on n’écrit RIEN (silence n’est pas réponse)');
  ok(refus({complementPaymentId:'tr_x',statutMollie:'paid',routes:null,montant:110}).raison==='routes-inconnues','routes illisibles : on n’écrit rien non plus');
  ok(refus({complementPaymentId:'tr_x',statutMollie:'expired',routes:0,montant:110}).raison==='non-paye','un paiement expiré n’est pas dû');
  ok(refus({complementPaymentId:'',statutMollie:'paid',routes:0,montant:110}).raison==='sans-paiement','sans identifiant de paiement, rien à relire');
  ['routed','manuel','unrouted'].forEach(function(et){ ok(refus({complementPayout:et,complementPaymentId:'tr_x',statutMollie:'paid',routes:0,montant:110}).raison==='etat-connu','un état déjà connu ('+et+') ne se réécrit pas'); });
  ok(refus({complementPaymentId:'tr_x',statutMollie:'paid',routes:0,montant:10,commission:10}).raison==='net-nul','un net nul n’est pas une dette'); }

console.log('B — le serveur LIT le noyau, aux deux portes');
ok(/const CSE = require\('\.\/complement-sans-etat'\)/.test(FN)&&/CSE\.complementSansEtatDecider\(/.test(FN),'le serveur appelle la décision, il ne recopie pas la règle');
ok(/for \(const st of CSE\.SANS_ETAT_STATUTS\)/.test(FN),'il ratisse « payé », « en cours » ET « à régler » : le webhook manqué laisse le statut au cran d’avant');
const corps=FN.slice(FN.indexOf('async function ratisserComplementsSansEtat'),FN.indexOf('function versementEcarte'));
ok(/if \(r\.complementPayout \|\| !r\.complementPaymentId\) continue;/.test(corps),'il ne relit que les compléments SANS état et avec un paiement');
ok(/\/routes'\)/.test(corps)&&/encodeURIComponent\(r\.complementPaymentId\)\)/.test(corps),'il demande à Mollie l’état du paiement ET ses routes');
ok(/if \(!dec\.ecrire\) continue;/.test(corps),'et n’écrit que ce que la décision autorise');
ok(/patch\.complementNet = dec\.net/.test(corps),'le net dû est figé sur la demande : c’est lui que le rattrapage routera');
ok(/complementStatus = 'paye'/.test(corps),'un statut resté « en cours » est corrigé en « payé », puisque Mollie le dit');
ok(/await majNetMisDeCote\(db, r\.providerUid\)/.test(corps),'et la somme mise de côté du prestataire est remesurée');
// Les deux appelants, chacun AVANT la requête qu'il ferait sans ça.
const iRetry=FN.indexOf('exports.payoutRetry');
const retry=FN.slice(iRetry, FN.indexOf("where('complementPayout', '==', 'unrouted')", iRetry));
ok(/await ratisserComplementsSansEtat\(db\)/.test(retry),'la console ratisse AVANT de chercher les compléments « unrouted »');
const iSweep=FN.indexOf('exports.mollieOnboardingSweep');
const sweep=FN.slice(iSweep, FN.indexOf("for (const champ of ['molliePayout', 'complementPayout', 'arrhesPayout']", iSweep));
ok(/await ratisserComplementsSansEtat\(db\)/.test(sweep),'le balayage des 15 minutes aussi : un état écrit seulement quand l’administrateur ouvre une carte n’est pas un filet');

console.log('C — l’argent mis de côté compte les trois jambes');
ok(A.netMisDeCote([{molliePayout:'unrouted',molliePayoutNet:50},{complementPayout:'unrouted',complementNet:93.5},{arrhesPayout:'unrouted',arrhesPayoutNet:10}])===153.5,'empreinte + second paiement + arrhes : 153,50');
ok(A.netMisDeCote([{complementPayout:'routed',complementNet:999},{molliePayout:'routed',molliePayoutNet:999}])===0,'ce qui est parti ne compte pas');
ok(A.netMisDeCote([{molliePayout:'unrouted',molliePayoutNet:30,complementPayout:'unrouted',complementNet:20}])===50,'une mission qui doit par deux jambes les additionne');
const nea=FN.slice(FN.indexOf('async function netEnAttente'),FN.indexOf('async function netEnAttente')+900);
ok(/for \(const \[etat\] of ARGENT\.JAMBES\)/.test(nea)&&/\.where\(etat, '==', 'unrouted'\)/.test(nea),'netEnAttente interroge les trois jambes, par la liste du noyau');

console.log(f?('\n'+f+' échec(s)'):'\nTOUT EST VERT');
process.exit(f?1:0);
