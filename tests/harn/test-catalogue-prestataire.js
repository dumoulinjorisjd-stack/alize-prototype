/* SON CATALOGUE À LUI, ET LE PRIX QUI SERA PRÉLEVÉ.

   Décisions de l'éditeur, 29/10/2026 : les prestataires à la grille restent dans
   l'aléatoire ET choisissables ; ceux qui ont leur propre catalogue ne sont QUE
   choisissables ; « on ne compare rien, pour ne rendre personne dans une mauvaise
   posture, on est sur du haut de gamme » ; la possibilité ne s'ouvre QUE sur les
   métiers que la console ouvre ; « il peut ajouter autant de lignes qu'il veut » ;
   et « le choix doit pouvoir évoluer ».

   Le noyau est PUR et s'éprouve ici sans base ni réseau ; le câblage se lit dans la
   source, parce qu'aucun banc ne fait tourner les fonctions Firebase. */
const fs=require('fs'),path=require('path');
const RACINE='/home/user/alize-work';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const C=require(path.join(RACINE,'functions','catalogue-prestataire.js'));
const src=fs.readFileSync(path.join(RACINE,'functions','index.js'),'utf8');
const app=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

const OUVERT={catalogueLibre:true}, FERME={};
const GRILLE=[{id:'a30',nm:'30 min ciblé',price:60},{id:'a60',nm:'1 h relaxant',price:110},
  {id:'a90',nm:'1 h 30',price:160},{id:'duo',nm:'Duo (2 pers., 1 h)',price:210}];
const SIENNES=[{id:'s1',nm:'Massage californien · 1 h',price:150},
  {id:'s2',nm:'Deep tissue · 1 h 15',price:185},{id:'s3',nm:'Rituel signature · 1 h 30',price:230}];
const CHLOE={ownCatalog:{massage:{on:true,lines:SIENNES}}};
const MAYA={};

console.log('\nA — le métier est la porte, et il commande les deux autres niveaux');
ok(!C.metierOuvreCatalogue(FERME)&&!C.metierOuvreCatalogue(null)&&!C.metierOuvreCatalogue({}),
  'un métier qui n’a jamais été ouvert ne porte rien : c’est le comportement d’aujourd’hui');
ok(!C.metierOuvreCatalogue({catalogueLibre:'oui'})&&!C.metierOuvreCatalogue({catalogueLibre:1}),
  'et seul le VRAI booléen ouvre — « oui » en texte n’ouvre pas un métier');
ok(C.catalogueProprePose(CHLOE,'massage',OUVERT),'métier ouvert + ses lignes : son catalogue est en service');
ok(!C.catalogueProprePose(CHLOE,'massage',FERME),
  'FERMER LE MÉTIER REFERME TOUT, sans toucher à un seul compte — c’est ce qui rend le choix réversible');
ok(C.catalogueQuiFaitFoi(CHLOE,'massage',GRILLE,FERME).lignes[1].price===110,
  'et le client retrouve alors la grille Ti-Services, au centime');
ok(C.catalogueQuiFaitFoi(CHLOE,'massage',GRILLE,FERME).propre===false,
  'le verdict le DIT, il ne se devine pas du nombre de lignes');

console.log('\nB — décocher sans rien saisir ne rend personne incommandable');
ok(!C.catalogueProprePose({ownCatalog:{massage:{on:true,lines:[]}}},'massage',OUVERT),
  'la case cochée mais AUCUNE ligne : il reste à la grille plutôt que de disparaître');
ok(C.catalogueQuiFaitFoi({ownCatalog:{massage:{on:true,lines:[]}}},'massage',GRILLE,OUVERT).lignes.length===4,
  'un champ vide ne rend personne inexistant — la leçon de la masseuse disparue de l’écran de commande');
ok(C.recoitLAleatoire({ownCatalog:{massage:{on:true,lines:[]}}},'massage',OUVERT),
  'et il continue de recevoir l’aléatoire, puisque c’est la grille qui s’applique');

console.log('\nC — le choix évolue dans les deux sens, et rien ne s’efface');
const MASQUE={ownCatalog:{massage:{on:false,lines:SIENNES}}};
ok(!C.catalogueProprePose(MASQUE,'massage',OUVERT),'recoché « grille » : son catalogue n’est plus en service');
ok(MASQUE.ownCatalog.massage.lines.length===3,
  'mais ses lignes sont CONSERVÉES : effacer un travail qu’on ne sait pas refaire ferait un choix à sens unique');
ok(C.catalogueProprePose({ownCatalog:{massage:{on:true,lines:MASQUE.ownCatalog.massage.lines}}},'massage',OUVERT),
  'et décocher de nouveau les remet en service telles quelles');

console.log('\nD — l’aléatoire ne part qu’à ceux qui sont à la grille');
ok(C.recoitLAleatoire(MAYA,'massage',OUVERT),'celle qui est à la grille reçoit les commandes aléatoires');
ok(!C.recoitLAleatoire(CHLOE,'massage',OUVERT),'celle qui a son catalogue n’en reçoit pas');
ok(C.recoitLAleatoire(CHLOE,'coiffure',OUVERT),
  'et c’est PAR MÉTIER : son catalogue de massage ne la retire pas de l’aléatoire en coiffure');
ok(C.recoitLAleatoire(CHLOE,'massage',FERME),
  'métier refermé, elle y revient — sans qu’on ait touché à sa fiche');

console.log('\nE — « autant de lignes qu’il veut », mais ce qui dépasse se DIT');
const beaucoup=[];for(let i=0;i<C.CAT_LIGNES_MAX+5;i++)beaucoup.push({id:'x'+i,nm:'Soin '+i,price:100+i});
const N=C.lignesPropres(beaucoup);
ok(N.lignes.length===C.CAT_LIGNES_MAX,'le catalogue est borné — il voyage avec TOUS les prestataires d’un métier');
ok(N.coupees===5,'et ce qui dépasse est COMPTÉ, pour que l’écran puisse le dire au lieu de le jeter en silence');
ok(C.lignesPropres([{nm:'Soin',price:0}]).lignes.length===0
 &&C.lignesPropres([{nm:'',price:90}]).lignes.length===0
 &&C.lignesPropres([{nm:'Soin',price:-5}]).lignes.length===0
 &&C.lignesPropres([{nm:'Soin',price:'abc'}]).lignes.length===0,
  'une ligne sans nom, sans prix, à prix nul ou illisible est écartée : elle finirait sur un écran de client');
ok(C.lignesPropres([{nm:'Soin',price:1e9}]).lignes.length===0,
  'et un prix hors de toute mesure aussi — c’est un montant qu’on prélèverait');
ok(C.lignesPropres([{nm:'A'.repeat(500),price:90}]).lignes[0].nm.length===C.CAT_NOM_MAX,
  'le nom est borné : il part chez le client, sur la facture, et dans la demande');
ok(C.lignesPropres([{id:'s1',nm:'Un',price:90},{id:'s1',nm:'Deux',price:120}]).lignes.length===1,
  'deux lignes du même identifiant n’en font qu’une : une commande ne saurait plus laquelle elle porte');
ok(C.lignesPropres([{nm:'Sans id',price:90}]).lignes[0].id==='c1',
  'une ligne sans identifiant en reçoit un — et il tient à la LIGNE, pas à son rang');

console.log('\nF — le prix prélevé est celui du catalogue qui fait foi');
const cat=C.catalogueQuiFaitFoi(CHLOE,'massage',GRILLE,OUVERT).lignes;
ok(C.prixAttendu([{id:'s1',price:150,qty:1}],cat).ok,'une commande conforme passe');
ok(C.prixAttendu([{id:'s1',price:150,qty:1},{id:'s2',price:185,qty:2}],cat).total===520,
  'et le total est celui du catalogue, quantités comprises');
const bas=C.prixAttendu([{id:'s1',price:10,qty:1}],cat);
ok(!bas.ok&&bas.motif===C.MOTIFS.prix,
  'UN PRIX ÉCRIT PAR L’APPAREIL DU CLIENT NE FAIT PAS AUTORITÉ : 10 € sur une prestation à 150 € est refusé');
ok(bas.ecarts[0].commande===10&&bas.ecarts[0].catalogue===150,
  'et le refus DIT les deux chiffres — on ne corrige pas en silence un montant que le client n’a pas vu');
ok(!C.prixAttendu([{id:'inconnu',price:150,qty:1}],cat).ok,
  'une ligne qui n’est pas à son catalogue est refusée : elle pourrait être la nôtre, ou n’exister nulle part');
ok(!C.prixAttendu([],cat).ok&&C.prixAttendu([],cat).motif===C.MOTIFS.vide,
  'une commande sans ligne n’est pas une commande à zéro euro');
ok(!C.prixAttendu([{id:'s1',price:150,qty:0}],cat).ok
 &&!C.prixAttendu([{id:'s1',price:150,qty:1.5}],cat).ok
 &&!C.prixAttendu([{id:'s1',price:150,qty:-2}],cat).ok,
  'une quantité nulle, fractionnaire ou négative est refusée');
ok(C.prixAttendu([{id:'s1',price:150.004,qty:1}],cat).ok,
  'le millième d’euro ne fait pas un refus : les prix passent par JSON et par des champs de saisie');
ok(!C.prixAttendu([{id:'s1',price:150.02,qty:1}],cat).ok,
  'mais deux centimes, si — c’est de l’argent');

console.log('\nG — la grille reste la grille pour qui ne demande rien');
const catMaya=C.catalogueQuiFaitFoi(MAYA,'massage',GRILLE,OUVERT);
ok(!catMaya.propre&&catMaya.lignes.length===4,'un prestataire sans catalogue propre est jugé sur la grille');
ok(C.prixAttendu([{id:'a60',price:110,qty:1}],catMaya.lignes).ok,
  'et une commande à la grille passe chez lui — c’est la moitié qui compte');
ok(!C.prixAttendu([{id:'s1',price:150,qty:1}],catMaya.lignes).ok,
  'tandis qu’une ligne du catalogue de QUELQU’UN D’AUTRE n’y passe pas');

console.log('\nH — le câblage : un noyau que personne n’appelle ne garde rien');
const corps=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'$1');
ok(/require\('\.\/catalogue-prestataire'\)/.test(src),'le serveur charge le noyau');
ok(/recoitLAleatoire\s*\(/.test(corps),'la diffusion aléatoire LIT la décision, au lieu de la redire à sa façon');
ok(/prixAttendu\s*\(/.test(corps),'et le prélèvement vérifie le prix contre le catalogue qui fait foi');
// Assertion arrière : un relevé qui ne reconnaîtrait plus rien innocenterait tout le monde.
ok(/notifyArtisansNewRequest/.test(corps)&&/createClientPayment/.test(corps),
  'assertion arrière — le relevé lit bien un serveur qui porte ces deux fonctions');
ok(/catalogueQuiFaitFoi/.test(app),'et le client passe par la même porte pour savoir quoi afficher');

console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
