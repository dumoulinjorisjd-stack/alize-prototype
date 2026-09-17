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
});

console.log('\nB — la marque est nommée, avec son numéro et sa classe');
['FR','EN','PT'].forEach(function(l){
  ok(/5299123/.test(MENTIONS[l])&&/5299123/.test(CGU[l]),
    l+' : le numéro de dépôt figure dans les mentions ET dans les CGU');
  ok(/INPI/.test(MENTIONS[l])&&/INPI/.test(CGU[l]),l+' : l’office est nommé');
  ok(/35/.test(MENTIONS[l]),l+' : la classe est dite — une marque ne protège que ce qu’elle couvre');
  ok(/Ti services/.test(MENTIONS[l]),l+' : le signe déposé est cité tel qu’il a été déposé');
});

console.log('\nC — déposée, et pas enregistrée');
ok(!/®/.test(src),'aucun ® nulle part : ce symbole annonce un enregistrement qui n’existe pas encore');
ok(!/marque enregistrée|registered trade ?mark|marca registada/i.test(src),
  'et aucune formule qui le dirait en toutes lettres');
ok(/en cours d'examen/.test(MENTIONS.FR)&&/under examination/.test(MENTIONS.EN)&&/em análise/.test(MENTIONS.PT),
  'les trois langues disent que l’examen est EN COURS');
ok(/demande d'enregistrement de marque verbale française/.test(CGU.FR),
  'les CGU parlent d’une DEMANDE d’enregistrement, pas d’un droit acquis');

console.log('\nD — le renvoi des mentions vers les CGU tombe juste');
['FR','EN','PT'].forEach(function(l){
  ok(/article 12|artigo 12/.test(MENTIONS[l]),l+' : les mentions renvoient à l’article 12…');
  ok(/<h3>12\. (Propriété intellectuelle|Intellectual property|Propriedade intelectual)<\/h3>/.test(CGU[l]),
    l+' : …et c’est bien là que vit la propriété intellectuelle');
  ok(!/article 10 (des CGU|of the ToU)|artigo 10 das CGU/.test(MENTIONS[l]),
    l+' : l’ancien renvoi, qui pointait vers un autre article, a disparu');
});

console.log('\nE — ce que l’interdiction couvre est dit');
ok(/nom de domaine/.test(CGU.FR)&&/domain name/.test(CGU.EN)&&/nome de domínio/.test(CGU.PT),
  'l’usage du signe comme nom de domaine, enseigne ou dénomination sociale est visé — '+
  'pas seulement la copie du code');

console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
