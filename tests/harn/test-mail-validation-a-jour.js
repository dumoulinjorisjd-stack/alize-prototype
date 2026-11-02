/* L'E-MAIL DE VALIDATION DIT CE QUI EST VRAI AUJOURD'HUI.

   « Dans l'e-mail de bienvenue suite à la validation de l'inscription, rappelle que
   c'est important aussi d'activer les notifications. Relis ce mail pour t'assurer que
   tout soit à jour. » — l'éditeur, le 02/11/2026.

   EN LE RELISANT ON A TROUVÉ MIEUX QU'UN MANQUE : il était FAUX depuis le 09/10/2026.
   Ce jour-là, `firestore.rules` a retiré la porte Mollie de l'acceptation — « ACCEPTER
   N'EXIGE PLUS MOLLIE, décision de l'éditeur » — et l'application a suivi (« Vous pouvez
   accepter, mais vous ne serez pas payé tout de suite », `blocPaiementDiffere` ;
   « Obligatoire pour être payé. Vous pouvez accepter sans », l'écran Compte).
   L'e-mail, lui, est resté en arrière et annonçait l'inverse :
     · « il reste une DERNIÈRE ÉTAPE avant de recevoir vos premières missions »
     · « À PARTIR DE LÀ, vous pourrez recevoir des missions »
   Il se contredisait d'ailleurs tout seul : le bloc « des demandes vous attendent »
   s'imprime juste au-dessus avec un bouton « Voir les demandes ».

   CETTE ÉPREUVE TIENT LES TROIS FAITS, et elle exécute la VRAIE fonction extraite du
   source, avec ses vraies dépendances — jamais une imitation.

   CE QUE CHAQUE CONTRE-ÉPREUVE FAIT ROUGIR :
     · le bloc des notifications n'est plus posé .............. 4 mesures
     · il revient, mais APRÈS Mollie .......................... 1 mesure
     · le cas iPhone disparaît ................................ 1 mesure
     · « à partir de là, vous pourrez recevoir des missions » .. 2 mesures
     · le badge « DERNIÈRE ÉTAPE » revient .................... 1 mesure
     · le bouton mène à une route qui n'existe pas ............ 1 mesure

   ET UNE QUI RESTE VERTE QUAND LE BLOC DISPARAÎT, donc dite : la mesure de l'ORDRE
   compare deux positions, et `indexOf` rend −1 pour ce qui est absent — « avant » est
   alors vrai sans rien mesurer. Elle garde son sens tant que le bloc existe, et ce sont
   les quatre autres qui tiennent son existence. */
const fs=require('fs'),path=require('path');
const RACINE=path.resolve(__dirname,'..','..');
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const fn=fs.readFileSync(path.join(RACINE,'functions','index.js'),'utf8');
const app=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const regles=fs.readFileSync(path.join(RACINE,'firestore.rules'),'utf8');

const prendre=(nom)=>{const i=fn.indexOf('function '+nom+'(');
  if(i<0)throw new Error('introuvable : '+nom);
  let p=0;for(let k=fn.indexOf('{',i);k<fn.length;k++){
    if(fn[k]==='{')p++;else if(fn[k]==='}'){p--;if(!p)return fn.slice(i,k+1);} }
  throw new Error('non fermée : '+nom);};
const COUL=/const MAIL_COULEURS = \{[\s\S]*?\n\};/.exec(fn);
const approvedArtisanHtml=new Function(
  'const APP_URL = \'https://ti-services.fr\';\n'+COUL[0]+'\n'+
  prendre('escHtmlS')+'\n'+prendre('mailPalette')+'\n'+
  prendre('mailBouton')+'\n'+prendre('mailPied')+'\n'+prendre('approvedArtisanHtml')+
  '\nreturn approvedArtisanHtml;')();

const nu=approvedArtisanHtml('Marie',false,'');
const plein=approvedArtisanHtml('Marie',true,'3 demandes vous attendent');
const txt=h=>h.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/\s+/g,' ');

console.log('\nA — les notifications sont rappelées, et elles passent en premier');
ok(/Activez vos notifications/.test(nu),'le bloc des notifications est là');
ok(/le premier qui répond la prend/.test(txt(nu)),
  'il DIT pourquoi : la demande part à tous, le premier qui répond la prend');
ok(/\?open=alerts/.test(nu),'et son bouton mène à la porte qui existe (?open=alerts)');
/* ON N'INVENTE PAS DE ROUTE : `?open=alerts` ouvre le Compte ET déplie la carte des
   alertes. Si l'application cessait de la reconnaître, le bouton mènerait à un écran de
   réglages à fouiller — l'épreuve le mesure DANS l'application, pas dans l'e-mail. */
ok(/open==='alerts'/.test(app),'l’application reconnaît encore cette route');
ok(nu.indexOf('Activez vos notifications')<nu.indexOf('Activez vos paiements'),
  'les notifications passent AVANT Mollie : les demandes arrivent déjà, le versement non');
/* L'ÉCHEC LE PLUS SILENCIEUX DE LA CHAÎNE : sur iPhone, tant que Ti-Services n'est pas
   sur l'écran d'accueil, l'API de notification n'existe pas — le bouton ne peut rien
   faire et la personne croit avoir activé. L'application le dit (`notifCTA`), l'e-mail
   doit le dire aussi, puisqu'il est lu AVANT d'ouvrir l'application. */
ok(/Sur iPhone/.test(txt(nu))&&/écran d'accueil/.test(txt(nu)),
  'le cas iPhone est dit : sans l’app installée, aucune notification possible');
ok(/ajoutez d'abord Ti-Services à votre écran d'accueil/.test(app),
  'et c’est le même fait que l’application énonce de son côté');

console.log('\nB — ce qui était faux depuis le 09/10/2026 ne s’y lit plus');
ok(/ACCEPTER N'EXIGE PLUS MOLLIE/.test(regles),
  'la règle Firestore dit toujours qu’accepter n’exige plus Mollie (sinon tout ce bloc est à revoir)');
ok(!/dernière étape avant de recevoir vos premières missions/i.test(txt(nu)),
  'l’e-mail ne promet plus les missions APRÈS Mollie');
ok(!/À partir de là, vous pourrez recevoir des missions/i.test(txt(nu)),
  'ni « à partir de là, vous pourrez recevoir des missions »');
ok(!/DERNIÈRE ÉTAPE/.test(nu),'le badge ne dit plus « dernière étape » — il y en a deux');
ok(/Vous pouvez accepter des missions sans attendre/.test(txt(nu)),
  'il dit ce qui est vrai : il peut accepter tout de suite');
ok(/mis de côté pour vous/.test(txt(nu)),
  'et ce qui reste vrai de Mollie : sans lui le gain est mis de côté');
/* LA MOITIÉ QUI COMPTE : l'application et l'e-mail disent LE MÊME fait. Deux
   formulations d'un même fait finissent par se contredire, et l'une des deux par mentir
   — c'est exactement ce qui vient d'arriver pendant trois semaines. */
ok(/Vous pouvez accepter sans/.test(app)||/Vous pouvez accepter, mais vous ne serez pas payé/.test(app),
  'l’application dit la même chose de son côté');

console.log('\nC — et le reste de l’e-mail n’a pas bougé');
ok(/Votre inscription est validée/.test(txt(nu)),'le titre');
ok(/Marie/.test(txt(nu)),'le prénom');
ok(/Activez vos paiements/.test(txt(nu))&&/\?open=missions/.test(nu),'le bloc Mollie et son bouton');
ok(/réponses toutes prêtes à copier-coller/.test(txt(nu)),'la promesse du guide pas à pas');
ok(/mollie-guide-open/.test(app),'…que l’application tient toujours');
ok(/SOUS RÉSERVE/.test(plein)&&/\?legal=assurance/.test(plein),'la réserve d’assurance et son lien');
ok(!/SOUS RÉSERVE/.test(nu),'et elle ne paraît pas quand il est assuré');
ok(/3 demandes vous attendent/.test(txt(plein)),'le bloc des demandes en attente');
ok(!/demandes vous attendent/.test(txt(nu)),'et il ne s’imprime pas à vide');
/* ASSERTION ARRIÈRE : sans un e-mail réellement rendu, toutes les mesures « il ne dit
   plus X » seraient vraies d'une chaîne vide. */
ok(nu.length>2000&&plein.length>nu.length,
  'les deux versions sont bien rendues ('+nu.length+' et '+plein.length+' caractères)');

process.exitCode=f?1:0;
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
