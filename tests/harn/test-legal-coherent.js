/* CE QUE LES SIX PIÈCES LÉGALES DISENT, ET CE QUE L'APPLICATION FAIT.

   Un audit des six documents × trois langues a trouvé des contradictions entre eux, et des
   affirmations que le code dément. Un document qui promet ce qui n'existe pas est pire
   qu'un document absent : il crée une obligation qu'on ne tiendra pas.

   Ce qui est tenu ici — chaque ligne correspond à un écart mesuré, pas à une précaution : */
const fs=require('fs'),path=require('path');
const RACINE='/home/user/alize-work';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const srv=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');
const bloc=(n)=>{const i=src.indexOf('const '+n+'=`');if(i<0)return '';return src.slice(i,src.indexOf('`;',i));};
const D=(n)=>({FR:bloc('LEGAL_'+n),EN:bloc('LEGAL_'+n+'_EN'),PT:bloc('LEGAL_'+n+'_PT')});
const CGV=D('CGV'),PRIV=D('PRIVACY'),SUPP=D('SUPPRESSION');
const TOUT=['CGU','CGV','CHARTE','MENTIONS','PRIVACY','SUPPRESSION']
  .map(n=>Object.values(D(n)).join(' ')).join(' ');

console.log('\nA — le pourboire : le code prélève une commission, les CGV le disent enfin');
ok(/tip\s*\*\s*commPct|Math\.round\(tip\*commPct\)/.test(src),
  'le code prélève bien la commission sur le pourboire — c’est LUI la référence');
ok(!/no commission<\/b> on it|qualquer comissão<\/b> sobre ela|na totalidade ao Prestador/.test(TOUT),
  'l’anglais et le portugais ne disent plus l’INVERSE du français et du code');
ok(/deduzida a comissão da Ti-Services/.test(CGV.PT)&&/less Ti-Services' commission/.test(CGV.EN),
  'les trois langues disent maintenant la même chose');
ok(!/neither to the tip|nem sobre a gorjeta/.test(TOUT),
  'et l’article sur la facturation ne l’exonère plus non plus');

console.log('\nB — l’indemnité d’annulation appartient au prestataire, qui DÉCIDE');
ok(/feeDecision:'pending'/.test(src)&&/apply-cancelfee/.test(src)&&/waive-cancelfee/.test(src),
  'dans l’application, c’est le prestataire qui applique l’indemnité ou y renonce');
ok(/c'est lui qui décide de l'appliquer ou d'y renoncer/.test(CGV.FR),
  'les CGV ne la présentent plus comme automatique');
ok(/it is for them to apply it or waive it/.test(CGV.EN)&&/é ele que decide aplicá-lo ou renunciar-lhe/.test(CGV.PT),
  'dans les trois langues');
ok(!/absence du Client au rendez-vous|Client's no-show at the appointment|ausência do Cliente ao encontro/.test(TOUT),
  'et la promesse d’une indemnité pour l’ABSENCE DU CLIENT disparaît : aucun bouton, nulle part, '+
  'ne permet à un prestataire de la déclarer — on ne promet pas un recours qui n’existe pas');
ok(/montant total de la commande/.test(CGV.FR),
  'son assiette est dite : le total, forfait de déplacement compris, comme le calcule le code');

console.log('\nC — la commission ne suit pas l’ancienneté, et son barème n’est pas publié');
ok(/nombre de prestations réalisées/.test(PRIV.FR),
  'la politique dit le VOLUME et non l’ancienneté — c’est ce que calcule fidFor()');
ok(!/barème publié|ancienneté sur la Plateforme|antiguidade na Plataforma/.test(TOUT),
  'et elle ne prétend plus que le barème est publié : il ne l’est délibérément pas');

console.log('\nD — deux destinataires de données qui n’étaient déclarés nulle part');
ok(/sendWhatsAppTemplate/.test(srv),'le serveur envoie bien des données au Cloud API de Meta');
ok(/Meta Platforms Ireland/.test(PRIV.FR)&&/Meta Platforms Ireland/.test(PRIV.EN)&&/Meta Platforms Ireland/.test(PRIV.PT),
  'Meta figure désormais parmi les destinataires, dans les trois langues');
ok(/comptesSupprimes/.test(srv)&&/JOURNAL_JOURS/.test(srv),
  'le serveur garde bien un journal des départs après la suppression d’un compte');
ok(/Journal des départs/.test(PRIV.FR)&&/Departure log/.test(PRIV.EN)&&/Registo de saídas/.test(PRIV.PT),
  'il est déclaré dans la politique de confidentialité, avec sa durée et sa base');
ok(/Journal des départs/.test(SUPP.FR)&&/Departure log/.test(SUPP.EN)&&/Registo de saídas/.test(SUPP.PT),
  'ET dans la notice de suppression, qui prétendait tout effacer');

console.log('\nE — deux documents ne donnent plus deux délais différents');
ok(!/trente jours<\/b> au plus tard|thirty days<\/b> at the latest|máximo de trinta dias/.test(TOUT),
  'la notice ne promet plus trente jours quand la politique en annonce un mois prolongeable');
ok(/sous un mois<\/b>, délai prolongeable de deux mois/.test(SUPP.FR),
  'elle reprend le délai du règlement, celui qu’on peut tenir');

console.log('\nF — un mot de passe est HACHÉ, et les trois langues le disent');
ok(!/stocké chiffré|stored encrypted|armazenada encriptada/.test(TOUT),
  'la section « données collectées » ne dit plus « chiffré » là où l’autre disait « haché »');
ok(/hachée<\/b>/.test(PRIV.FR)&&/hashed<\/b>/.test(PRIV.EN)&&/hash<\/b>/.test(PRIV.PT),
  'le portugais, qui ne le disait NULLE PART, le dit maintenant aussi');

console.log('\nG — on ne renvoie plus à un bouton que l’utilisateur ne verra jamais');
ok(!/Supprimer mon compte/.test(SUPP.EN)&&!/Supprimer mon compte/.test(SUPP.PT),
  'les guides anglais et portugais nommaient un libellé FRANÇAIS que l’application traduit');
ok(/Delete my account/.test(SUPP.EN)&&/Eliminar a minha conta/.test(SUPP.PT),
  'ils nomment celui que l’utilisateur a réellement sous les yeux');

console.log('\nH — ce qui reste vrai, et qu’on ne casse pas en passant');
ok(/AUTO_VALID_H = 48/.test(srv)&&/quarante-huit|48\s*h/i.test(CGV.FR),'les 48 h de validation tacite');
ok(/SMALL_COMM_MIN=21/.test(src)&&/21/.test(CGV.FR),'le plancher de 21 € / 10 %');
ok(/huit \(8\) heures avant/.test(CGV.FR),'la gratuité jusqu’à 8 heures avant');

console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
