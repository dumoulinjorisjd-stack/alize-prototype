/* CE QUE LES PIÈCES LÉGALES DISENT DE LA MARQUE ET DE L'ÉDITEUR.

   Dépôt INPI du 17/09/2026 : marque VERBALE française « Ti services », n° 5299123,
   classe 35, déposée par C.C.S (SAS, SIREN 933 820 664, Carrefour des 4 Chemins - Marigot,
   97133 Saint-Barthélemy). C.C.S est à la fois l'ÉDITEUR du site et la TITULAIRE de la
   marque.

   Trois choses tenues ici :

   · ON REVENDIQUE UNE MARQUE, ON LA NOMME. Les CGU interdisaient déjà de reproduire « la
     marque » sans jamais dire laquelle, ni sous quel numéro : une revendication qu'on ne
     peut pas vérifier ne vaut pas grand-chose face à quelqu'un qui la conteste.

   · DÉPOSÉE N'EST PAS ENREGISTRÉE. L'examen de l'INPI est en cours : on écrit « demande
     d'enregistrement » et « en cours d'examen », jamais « marque enregistrée » ni « ® ».
     Se dire titulaire d'un droit qu'on n'a pas encore, c'est exactement le reproche qu'on
     se prépare à adresser aux autres.

   · UN RENVOI FAUX. Les mentions légales renvoyaient à « l'article 10 des CGU » pour la
     propriété intellectuelle — qui est l'article 12, dans les trois langues. */
const fs=require('fs'),path=require('path');
const RACINE='/home/user/alize-work';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
// on ne travaille que sur les pièces légales, pas sur tout le fichier
const bloc=(nom)=>{const i=src.indexOf('const '+nom+'=`');if(i<0)return '';const j=src.indexOf('`;',i);return src.slice(i,j);};
const MENTIONS={FR:bloc('LEGAL_MENTIONS'),EN:bloc('LEGAL_MENTIONS_EN'),PT:bloc('LEGAL_MENTIONS_PT')};
const CGU={FR:bloc('LEGAL_CGU'),EN:bloc('LEGAL_CGU_EN'),PT:bloc('LEGAL_CGU_PT')};

console.log('\nA — l’éditeur est identifié, dans les trois langues');
// LE DIRECTEUR DE LA PUBLICATION RESTE ANONYME, ET C'EST UN CHOIX, PAS UN OUBLI.
// Il avait été nommé (la LCEN demande un nom, pas une fonction) puis l'éditeur a demandé
// de revenir à la formule impersonnelle. On le consigne ici pour que personne ne « corrige »
// dans l'autre sens en croyant réparer un manque — la question a été posée et tranchée.
['FR','EN','PT'].forEach(function(l){
  ok(/C\.C\.S/.test(MENTIONS[l]),l+' : l’éditeur est nommé');
  ok(/933 820 664/.test(MENTIONS[l]),l+' : le SIREN du dépôt y figure');
  ok(/Carrefour des 4 Chemins/i.test(MENTIONS[l]),l+' : l’adresse du dépôt aussi');
  ok(/(représentant légal|legal representative|representante legal)/.test(MENTIONS[l]),
    l+' : le directeur de la publication est désigné par sa QUALITÉ');
  // LCEN art. 6 III-1 : ces trois-là sont OBLIGATOIRES et manquaient dans les trois langues.
  ok(/Basse-Terre/.test(MENTIONS[l]),l+' : le greffe d’immatriculation (RCS Basse-Terre)');
  ok(/55 04 21/.test(MENTIONS[l]),l+' : un téléphone pour joindre l’éditeur');
  ok(/543 1000/.test(MENTIONS[l]),l+' : et le téléphone de l’hébergeur, exigé au même titre que son adresse');
});

console.log('\nB — la marque est revendiquée, sans publier le dossier');
['FR','EN','PT'].forEach(function(l){
  ok(/Ti-Services/.test(MENTIONS[l])&&/INPI/.test(MENTIONS[l]),
    l+' : les mentions disent que le signe est une marque de C.C.S déposée à l’INPI');
  ok(/INPI/.test(CGU[l]),l+' : les CGU aussi, à l’appui de l’interdiction d’usage');
});
// CE QU'ON NE PUBLIE PLUS, ET POURQUOI. Rien n'oblige à donner le numéro de dossier, la
// date ni la classe — ce ne sont pas des mentions légales obligatoires. Et « demande en
// cours d'examen » ANNONCE à un concurrent que la fenêtre d'opposition est ouverte : c'est
// public au registre de toute façon, autant ne pas le mettre en avant.
const LEG=['FR','EN','PT'].map(function(l){return MENTIONS[l]+CGU[l];}).join(' ');
ok(!/5299123/.test(src),'le numéro de dépôt n’est publié nulle part');
ok(!/en cours d'examen|under examination|em análise/.test(LEG),
  'ni le calendrier de l’examen — la formule existe ailleurs pour le dossier d’un artisan, '+
  'c’est dans les PIÈCES LÉGALES qu’elle ne doit plus être');
ok(!/classe 35|class 35/.test(LEG),'ni la classe');

console.log('\nC — déposée, et pas enregistrée');
ok(!/®/.test(src),'aucun ® nulle part : ce symbole annonce un enregistrement qui n’existe pas encore');
ok(!/marque enregistrée|registered trade ?mark|marca registada/i.test(src),
  'et aucune formule qui le dirait en toutes lettres');
ok(/ayant fait l'objet d'un dépôt/.test(MENTIONS.FR)&&/filed with/.test(MENTIONS.EN)&&/objeto de um depósito/.test(MENTIONS.PT),
  'on dit le DÉPÔT, qui est un fait, et non un enregistrement qui n’est pas acquis');

console.log('\nD — le renvoi des mentions vers les CGU tombe juste');
['FR','EN','PT'].forEach(function(l){
  ok(/article 12|artigo 12/.test(MENTIONS[l]),l+' : les mentions renvoient à l’article 12…');
  ok(/<h3>12\. (Propriété intellectuelle|Intellectual property|Propriedade intelectual)<\/h3>/.test(CGU[l]),
    l+' : …et c’est bien là que vit la propriété intellectuelle');
  ok(!/article 10 (des CGU|of the ToU)|artigo 10 das CGU/.test(MENTIONS[l]),
    l+' : l’ancien renvoi, qui pointait vers un autre article, a disparu');
});

console.log('\nE — l’interdiction vise le SIGNE, quelle que soit sa graphie');
// Un dépôt VERBAL protège le MOT, indépendamment des majuscules, de l'espace et du trait
// d'union : « Ti services », « Ti-Services » et « TI SERVICES » sont le même signe. La
// clause énumérait deux orthographes — une énumération laisse croire qu'une troisième
// échappe.
ok(/sous quelque graphie que ce soit/.test(CGU.FR)&&/in any spelling/.test(CGU.EN)&&/sob qualquer grafia/.test(CGU.PT),
  'aucune orthographe n’est énumérée : c’est le signe qui est visé');
ok(/nom de domaine/.test(CGU.FR)&&/domain name/.test(CGU.EN)&&/nome de domínio/.test(CGU.PT),
  'et son usage comme nom de domaine, enseigne ou dénomination sociale, pas seulement la copie du code');

console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
