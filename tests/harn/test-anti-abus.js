/* ON NE FAIT PAS PARTIR CENT E-MAILS DEPUIS NOTRE DOMAINE.

   « On peut sécuriser les envois de demande de mission par mail ? » puis « comment éviter
   cette malveillance » (20/09/2026). Le transport était déjà sûr (TLS, SMTP authentifié,
   SPF strict, DMARC en rejet) et le contenu déjà minimal (ni nom, ni adresse, ni téléphone
   du client, aucun jeton dans le lien). Ce qui manquait n'était pas un chiffrement :
   c'était une BORNE. Une demande publiée fait partir un e-mail à tous les prestataires
   sans appareil notifié ; rien ne limitait le nombre de demandes.

   TROIS VERROUS, QUI NE PROTÈGENT PAS DE LA MÊME CHOSE.

   1. LA RÈGLE. `molliePaymentAuthorized` est la preuve qu'une carte a été autorisée, et
      c'est sur elle que le serveur s'appuie pour savoir qu'une demande est réelle. Elle
      était librement écrivable à la création : la preuve se déclarait donc elle-même.
   2. LA GARANTIE. Une demande née DÉJÀ publiée ne se diffuse que si elle vient de la
      conciergerie ou qu'un paiement est autorisé. En production, le chemin normal passe
      par « pending_payment » : cette porte-là ne devrait voir QUE la conciergerie.
   3. LE PLAFOND. Par client et par jour pour la diffusion, par prestataire et par jour
      pour l'e-mail. Il attrape ce que la garantie laisse passer : le double appui, la
      boucle, et surtout la RÉOUVERTURE d'une demande (déclinée → publiée), qui ne
      redemande aucun paiement et coûte donc zéro à répéter.

   Le noyau est PUR et s'éprouve ici sans base ni réseau ; le câblage se lit dans la
   source, parce qu'aucun banc ne fait tourner les fonctions Firebase. */
const fs=require('fs'),path=require('path');
const RACINE='/home/user/alize-work';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const A=require(path.join(RACINE,'functions','anti-abus.js'));
const src=fs.readFileSync(path.join(RACINE,'functions','index.js'),'utf8');
const rules=fs.readFileSync(path.join(RACINE,'firestore.rules'),'utf8');

console.log('\nA — la garantie : une demande publiée d’office doit être adossée à quelque chose');
ok(A.diffusionAdmise({status:'pending'},{estProd:true}).ok===false,
  'un compte qui écrit lui-même une demande « publiée » ne diffuse RIEN');
ok(A.diffusionAdmise({status:'pending'},{estProd:true}).motif==='sans-garantie',
  'et le refus dit pourquoi, pour la trace et pour l’alerte');
ok(A.diffusionAdmise({status:'pending',conciergeUid:'c1'},{estProd:true}).ok,
  'la conciergerie passe : ses commandes n’ont pas de verrou de paiement, c’est voulu');
ok(A.diffusionAdmise({status:'pending',molliePaymentAuthorized:true},{estProd:true}).ok,
  'une demande dont la carte est autorisée passe');
ok(A.diffusionAdmise({status:'pending'},{estProd:false}).ok,
  'hors production, aucune carte n’est demandée : la règle ne s’applique pas, sinon la bêta ne notifierait plus personne');
// Le drapeau vient du SERVEUR ou il ne vaut rien : une chaîne « true », un 1, ne sont pas
// une autorisation de paiement.
ok(!A.diffusionAdmise({status:'pending',molliePaymentAuthorized:'true'},{estProd:true}).ok
  && !A.diffusionAdmise({status:'pending',molliePaymentAuthorized:1},{estProd:true}).ok,
  'et seul le VRAI booléen compte — « true » en texte n’est pas une autorisation');

console.log('\nB — le plafond : il borne, il ne juge pas');
ok(A.quotaDecide(0,12).ok&&A.quotaDecide(0,12).n===1,'le premier passage compte 1');
ok(A.quotaDecide(11,12).ok&&A.quotaDecide(11,12).franchit,
  'le douzième passe ET signale qu’il atteint le plafond : c’est là qu’on alerte, une seule fois');
ok(!A.quotaDecide(12,12).ok&&!A.quotaDecide(12,12).franchit,
  'le treizième ne passe pas, et ne réalerte pas');
ok(!A.quotaDecide(99,12).ok,'et rien ne repasse ensuite dans la journée');
ok(A.DIFFUSIONS_JOUR_CLIENT>=10&&A.MAILS_JOUR_PRESTATAIRE>=20,
  'les plafonds sont HAUTS ('+A.DIFFUSIONS_JOUR_CLIENT+' et '+A.MAILS_JOUR_PRESTATAIRE+') : ils empêchent l’ordre de grandeur suivant, pas l’usage réel');

console.log('\nC — le câblage : les deux portes de diffusion, pas une seule');
// La création (demande née publiée) ET la réouverture (déclinée → publiée). La seconde est
// le chemin le moins cher à abuser : aucun paiement n'est redemandé.
const creation=/exports\.notifyArtisansNewRequest[\s\S]*?exports\./.exec(src)[0];
const reouverture=/exports\.notifyReopenedRequest[\s\S]*?exports\./.exec(src)[0];
ok(/ANTI\.diffusionAdmise\(r, \{ estProd: EST_PROD \}\)/.test(creation),
  'la création demande la garantie');
ok(creation.indexOf('ANTI.diffusionAdmise')<creation.indexOf('artisans'),
  'et elle la demande AVANT de lire la liste des prestataires : on ne prépare pas un envoi qu’on va refuser');
ok(/_quotaJour\(db, 'diff-' \+ \(r\.clientUid/.test(creation),'la création compte pour le client');
ok(/_quotaJour\(db, 'diff-' \+ \(after\.clientUid/.test(reouverture),
  'la réouverture compte pour le MÊME client, sur le même compteur : rouvrir cent fois ne contourne pas le plafond');
ok(/_quotaJour\(db, 'mail-pro-' \+ uid, ANTI\.MAILS_JOUR_PRESTATAIRE\)/.test(src),
  'et chaque prestataire a son propre plafond d’e-mails, quelle que soit l’origine des demandes');

console.log('\nD — ce qui protège l’alerte elle-même, et le compteur');
ok(/_quotaJour\(db, 'alerte-' \+ cle, 1\)/.test(src),
  'l’alerte à l’administrateur est elle-même plafonnée à une par jour et par sujet — sinon elle devient l’inondation qu’elle dénonce');
ok(/catch \(e\) \{[\s\S]{0,120}return \{ ok: true[\s\S]{0,60}panne: true \}/.test(src),
  'un compteur en panne LAISSE PASSER : un service qui se bloque tout seul serait pire que le risque couvert');
ok(/runTransaction/.test(/async function _quotaJour[\s\S]*?\n\}/.exec(src)[0]),
  'le compteur s’incrémente dans une TRANSACTION : deux demandes simultanées ne peuvent pas lire le même nombre');
ok(/compteurs anti-abus/.test(src)&&/jourStBarth\(new Date\(now - 7 \* 86400000\)\)/.test(src),
  'et les compteurs échus s’effacent d’eux-mêmes au ménage quotidien (sept jours)');

console.log('\nE — la règle Firestore : la preuve du paiement ne se déclare pas soi-même');
const create=/allow create: if signedIn\(\)[\s\S]*?;/.exec(rules.slice(rules.indexOf('match /requests')))[0];
ok(/molliePaymentAuthorized/.test(create)&&/hasAny\(serverKeys\(\)\)/.test(create),
  'à la création, ni la preuve du paiement ni les champs financiers du serveur ne peuvent être écrits par un client');
ok(/!request\.resource\.data\.keys\(\)\.hasAny/.test(create),
  'et c’est un REFUS de clés, pas une liste blanche de valeurs : on ne peut pas les glisser autrement');

console.log('\nF — le contenu de l’e-mail reste minimal');
const mail=/async function mailArtisansSansAppareil[\s\S]*?\n\}/.exec(src)[0];
ok(!/clientName|address|adresse|phone/i.test(mail),
  'la demande envoyée par e-mail ne porte ni nom, ni adresse, ni téléphone du client');
ok(/sendMail\(db, mail,/.test(mail)&&!/\.join\(','\)/.test(mail),
  'et un message PAR destinataire : personne n’y découvre l’adresse des autres');

console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
