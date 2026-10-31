/* LE LIEN D'UNE PRESTATAIRE, ET LA COMMANDE QUI NE SE PERD PLUS.

   « Un lien internet du site qui mène directement sur la commande de la prestation de
   l'artisan en particulier. Est-ce que ça peut marcher si le client n'a pas de compte ? »

   Trois faits mesurés avant d'écrire une ligne, et chacun a commandé un correctif.

   1. LE MODE INVITÉ ÉTAIT ÉCRIT, CÂBLÉ, ET INATTEIGNABLE. « enter-guest » n'était offert
      par AUCUN bouton du fichier : zéro occurrence, mesuré. « Je cherche un service »
      posait « onb-start », c'est-à-dire la création de compte — le premier geste de
      quelqu'un qui ouvre l'application était de donner son nom et un mot de passe avant
      d'avoir vu ce qu'on propose.

   2. LA COMMANDE D'UN VISITEUR ÉTAIT PERDUE À LA NAISSANCE DE SON COMPTE. Le brouillon
      est rangé par compte (« ti_draft_<uid> », « ti_draft_anon » sans session) : à la
      seconde où le compte naît, la clé change et la commande devient ORPHELINE. Mesuré :
      écrite sous « ti_draft_anon », introuvable sous « ti_draft_u-nouveau », et elle
      restait dans le téléphone sans que rien n'aille la chercher. Invisible avec une
      inscription par e-mail (la page ne recharge pas, la mémoire survit) ; réel avec
      GOOGLE, qui retombe sur une redirection dès que le popup est bloqué — l'application
      installée et les navigateurs mobiles, c'est-à-dire le chemin de quelqu'un qui
      arrive d'une publicité sur son téléphone.

   3. LE CATALOGUE PROPRE N'ARRIVAIT JAMAIS CHEZ LE CLIENT. La projection finale de
      « listProviders » ne portait ni « ownCat » ni « cat », alors que son en-tête promet
      que le catalogue voyage et que « catalogueDuChoisi » les lit. Elle ne trouvait donc
      rien, pour TOUT LE PARC, et la grille s'imposait en silence à celle qui a son
      propre catalogue. C'est la faute que le commentaire voisin de « salonPret » décrit
      lui-même : une valeur absente de la projection ne voyage pas.

   ET UN VISITEUR SANS COMPTE RECEVAIT L'ANNUAIRE DE DÉMONSTRATION — « Maya Beauté »,
   « Chloé R. » — inoffensif tant qu'aucun chemin n'y menait, mensonger dès que le mode
   invité s'ouvre. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const srv=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');

// La fiche que le serveur rendrait : deux métiers, un catalogue propre sur l'un.
const FICHE={poignee:'maya-beaute',uid:'u-maya',name:'Maya Beauté',photo:null,founder:true,
  cats:['coiffure','massage'],siteMode:'both',salonZone:'Gustavia',salonAddress:'Rue du Roi Oscar II',
  catalogues:{coiffure:{ownCat:true,cat:[{id:'c1',nm:'Brushing signature',price:55},{id:'c2',nm:'Couleur',price:95}]},
              massage:{ownCat:false,cat:null}}};

(async()=>{
const b=await chromium.launch(o);
const page=async(url)=>{const p=await b.newPage({viewport:{width:390,height:900}});
  p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto('file://'+path.join(RACINE,'tests/harn/app.html')+(url||''));
  await p.waitForFunction(()=>window.__S&&window.__render);
  return p;};

/* ───────────────────────── A — la commande survit au compte ───────────────────────── */
console.log('\nA — la commande d’un visiteur survit à la naissance de son compte');
let p=await page();
await p.waitForFunction(()=>window.__brouillon&&window.__brouillon.adopter);
const A=await p.evaluate(()=>{
  const S=window.__S,B=window.__brouillon; S.demoMode=false; const out={};
  const visiteur=()=>{localStorage.clear();window.__setFB({auth:{currentUser:null}});};
  // le chemin de la publicité : il configure, part créer son compte, Google recharge
  visiteur();
  S.draft={svc:'menage',svcName:'Ménage',rate:35,duration:3,unit:'h',when:'Mardi',slot:'09:00'};
  B.marquer();
  out.cleAnon=B.cle(null);
  S.draft=null;                                   // la page a rechargé : la mémoire est partie
  window.__setFB({auth:{currentUser:{uid:'u-nouveau'}}});
  out.cleCompte=B.cle();
  const a=B.adopter();
  out.adopte=!!(a&&a.draft); out.svc=a&&a.draft&&a.draft.svc;
  out.rangeeChezLui=!!localStorage.getItem(B.cle());
  out.orphelineEffacee=!localStorage.getItem(B.cle(null));
  out.marqueConsommee=!localStorage.getItem('tiDraftAdopt');
  // téléphone de famille : aucun marqueur, personne n'hérite
  visiteur();
  S.draft={svc:'coiffure',svcName:'Coiffure'}; B.sauver();
  window.__setFB({auth:{currentUser:{uid:'papa'}}});
  out.familleHerite=!!B.adopter();
  // sa propre commande gagne toujours
  visiteur();
  S.draft={svc:'menage',svcName:'Du visiteur'}; B.sauver(); B.marquer();
  window.__setFB({auth:{currentUser:{uid:'u3'}}});
  S.draft={svc:'coiffure',svcName:'La sienne'}; B.sauver();
  out.ecraseLaSienne=!!B.adopter();
  const lu=B.lire(); out.resteLaSienne=lu&&lu.draft&&lu.draft.svcName;
  // périmée : au-delà de vingt-quatre heures, la date choisie est derrière nous
  visiteur();
  localStorage.setItem(B.cle(null),JSON.stringify({draft:{svc:'menage'},ts:Date.now()-25*3600*1000}));
  localStorage.setItem('tiDraftAdopt',String(Date.now()));
  window.__setFB({auth:{currentUser:{uid:'u4'}}});
  out.perimeeAdoptee=!!B.adopter();
  return out;
});
ok(A.cleAnon==='ti_draft_anon'&&A.cleCompte==='ti_draft_u-nouveau',
  'les deux clés diffèrent — c’est bien là que la commande se perdait ('+A.cleAnon+' → '+A.cleCompte+')');
ok(A.adopte&&A.svc==='menage','la commande laissée au passage au paiement revient avec lui');
ok(A.rangeeChezLui,'elle est rangée sous la clé de son compte tout neuf');
ok(A.orphelineEffacee,'et elle ne traîne plus sous la clé du visiteur');
ok(A.marqueConsommee,'le marqueur se consomme : il ne vaut que pour CE compte');
ok(!A.familleHerite,'sans marqueur, personne n’hérite — le téléphone de famille est protégé');
ok(!A.ecraseLaSienne&&A.resteLaSienne==='La sienne','la commande du compte gagne toujours sur celle d’un visiteur');
ok(!A.perimeeAdoptee,'une commande de plus de vingt-quatre heures n’est pas reprise');
ok(/marquerAdoptionBrouillon\(\);\s*\n\s*S\._resumeOrder=true;S\.authView='signup'/.test(src),
  'le marqueur est posé au passage au paiement, AVANT qu’on quitte l’écran');

/* ET LE VRAI CHEMIN SE REJOUE, pas seulement la porte. On fabrique la naissance de
   session — « loadUserProfile » avec un faux Firebase — après avoir vidé la mémoire comme
   une redirection Google le fait. C'est la seule mesure qui prouve la phrase demandée :
   « une fois le compte créé, elle n'a plus qu'à cliquer pour payer ». */
const A2=await p.evaluate(async()=>{
  const S=window.__S,B=window.__brouillon; S.demoMode=false; localStorage.clear();
  const faux={auth:{currentUser:{uid:'u-neuf',email:'a@b.fr'}},
    f:{getDoc:()=>Promise.resolve({exists:()=>false,data:()=>null}),doc:()=>({}),
       setDoc:()=>Promise.resolve(),updateDoc:()=>Promise.resolve(),onSnapshot:()=>function(){},
       collection:()=>({}),query:()=>({}),where:()=>({}),serverTimestamp:()=>0,
       arrayUnion:()=>({}),arrayRemove:()=>({})},
    db:{},fn:{httpsCallable:()=>()=>Promise.resolve({data:{}})},functions:{}};
  window.__setFB({auth:{currentUser:null}});
  S.draft={svc:'menage',svcName:'Ménage',rate:35,duration:3,unit:'h'};
  B.marquer();
  S.draft=null;                                   // Google est parti en redirection
  S.payStep=false;S._resumeOrder=false;S.onboarded=false;
  window.__setFB(faux);
  try{await window.__session(faux.auth.currentUser);}catch(e){return {err:String((e&&e.message)||e)};}
  return {draft:S.draft&&S.draft.svc, pay:!!S.payStep, onb:!!S.onboarded};
});
ok(!A2.err,'la naissance de session se rejoue'+(A2.err?' — '+A2.err:''));
ok(A2.draft==='menage','après la création du compte, sa commande est là');
ok(A2.pay&&A2.onb,'et l’on retombe à l’étape PAIEMENT : « elle n’a plus qu’à cliquer pour payer »');
await p.close();

/* ──────────────── B — « Je cherche un service » ouvre les prestations ──────────────── */
console.log('\nB — « Je cherche un service » ouvre les prestations, plus la création de compte');
p=await page();
await p.evaluate(()=>{const S=window.__S;document.body.classList.add('standalone');
  S.lang='fr';S.onboarded=false;S.guest=false;S.authView=null;S.onbStep=0;S.demoMode=false;
  S.persona='client';S.draft=null;S.mission=null;S.account=null;S.proPublic=null;window.__render();});
/* ON RELEVE TOUTES LES PORTES VISIBLES, PAS UN NOM. Chercher l'absence de
   « onb-start » ne mesurait plus rien du jour où ce gestionnaire a été retiré : la
   requête rendait `null` quoi qu'il arrive, et l'assertion serait restée verte avec une
   porte vers le formulaire sous un autre nom. */
const Bv=await p.evaluate(()=>{const vu=e=>!!(e&&(e.offsetWidth||e.offsetHeight));
  const bt=document.querySelector('[data-act="enter-guest"]');
  const portes=[...document.querySelectorAll('[data-act]')].filter(vu)
    .map(e=>e.getAttribute('data-act'));
  return {invite:!!bt, inviteVu:vu(bt), portes:portes,
    versFormulaire:portes.filter(a=>a==='onb-start'||a==='guest-signup'||a==='land-client-signup'),
    connexion:!!document.querySelector('[data-act="show-login"]')};});
ok(Bv.invite&&Bv.inviteVu,'le bouton de l’écran de bienvenue mène au mode invité');
ok(Bv.versFormulaire.length===0,
  'et plus aucune porte visible n’ouvre la création de compte à ce moment ('
  +(Bv.versFormulaire.join(' · ')||'aucune')+')');
ok(Bv.portes.length>=2,
  'la mesure porte bien sur un écran RENDU — '+Bv.portes.length+' portes visibles relevées');
ok(Bv.connexion,'« Déjà un compte ? Se connecter » reste offert — aucune porte n’est fermée');
/* UN CLIC QUI BUTE N'EST PAS UNE MESURE. Le bouton peut manquer — c'est précisément ce
   que la contre-épreuve enlève — et « p.click » lèverait : l'épreuve s'arrêterait sur
   « n'a pas pu aller au bout », qui ne dit rien de ce qui est mesuré. */
if(Bv.inviteVu){await p.click('[data-act="enter-guest"]');await p.waitForTimeout(350);}
const Bg=await p.evaluate(()=>{const S=window.__S;
  return {guest:S.guest,auth:S.authView,tuiles:document.querySelectorAll('[data-svc]').length,
    question:document.body.innerText.indexOf('De quel service')>=0,
    creerCompte:!!document.querySelector('[data-act="guest-signup"]'),
    onglets:document.querySelectorAll('.navbar [data-cnav]').length};});
ok(Bg.guest&&!Bg.auth,'on entre en invité, sans formulaire');
ok(Bg.tuiles>=3&&Bg.question,'et l’on tombe sur les prestations ('+Bg.tuiles+' services, « De quel service… »)');
ok(Bg.creerCompte&&Bg.onglets===3,'avec « Créer un compte » en tête et les trois onglets');
ok(/case 'enter-guest':S\.guest=true;S\.authView=null;S\.clientNav='home';S\.mission=null;render\(\);/.test(src),
  'entrer en invité n’efface plus une commande en cours');
await p.close();

/* ─────────────── C — le lien ouvre sa fiche, et ses seuls métiers ─────────────── */
console.log('\nC — le lien d’une prestataire ouvre sa fiche, sans compte');
p=await page('?pro=maya-beaute');
// LE LIEN, TEL QU'IL ARRIVE : l'adresse est lue au démarrage, avant toute mise en scène.
const C0=await p.evaluate(()=>({search:location.search,lien:window.__S._proLien,
  guest:window.__S.guest,onb:window.__S.onboarded,
  retenue:(function(){try{return localStorage.getItem('tiProLien');}catch(_){return null;}})()}));
ok(C0.lien==='maya-beaute','l’adresse « /?pro=sa-poignée » est lue au démarrage');
ok(C0.guest&&!C0.onb,'et elle fait entrer en MODE INVITÉ — la fiche se lit sans compte');
ok(C0.retenue==='maya-beaute','la poignée est retenue : elle survit à une inscription qui recharge la page');
ok(C0.search==='','l’adresse est nettoyée derrière nous (la poignée ne traîne pas dans la barre)');
// Le serveur n'est pas joignable ici : on capte l'appel et l'on rend SA fiche.
await p.evaluate((F)=>{
  const S=window.__S; S.demoMode=false; S.lang='fr';
  window.__appels=[];
  window.__setFB({auth:{currentUser:null},functions:{},fn:{httpsCallable:function(_f,nom){
    return function(d){window.__appels.push({nom:nom,d:d});
      return nom==='providerPublic'?Promise.resolve({data:F}):Promise.resolve({data:{}});};}}});
  document.body.classList.add('standalone');
  S.onboarded=false;S.account=null;S.proPublic=null;S.proPublicErr=false;
  window.__fichePub(S._proLien);
},FICHE);
await p.waitForFunction(()=>window.__S.proPublic&&window.__S.proPublic.uid,{timeout:4000}).catch(()=>{});
const C=await p.evaluate(()=>{const S=window.__S;window.__render();
  const txt=document.body.innerText;
  return {appels:(window.__appels||[]).map(x=>x.nom),poignee:((window.__appels||[])[0]||{}).d,
    fiche:!!(S.proPublic&&S.proPublic.uid),
    nom:txt.indexOf('Maya Beauté')>=0, adressee:txt.indexOf('adressée directement')>=0,
    tuiles:Array.from(document.querySelectorAll('[data-svc]')).map(e=>e.dataset.svc)};});
ok(C.appels.indexOf('providerPublic')>=0,'la fiche est demandée au serveur par la fonction publique');
ok(C.poignee&&C.poignee.poignee==='maya-beaute','et c’est bien sa poignée qui est demandée');
ok(C.fiche&&C.nom,'sa carte paraît en tête de l’accueil, avec son nom');
ok(C.adressee,'et elle dit que la demande lui sera adressée directement');
ok(C.tuiles.length===2&&C.tuiles.indexOf('coiffure')>=0&&C.tuiles.indexOf('massage')>=0,
  'l’accueil ne montre QUE ses métiers ('+C.tuiles.join(', ')+')');

/* ─────────── D — la commande part dirigée, avec SON catalogue ─────────── */
console.log('\nD — la commande née sous le lien part dirigée, et porte SON catalogue');
const D=await p.evaluate(()=>{const S=window.__S;
  const sv=window.__svc.trouve('coiffure');
  if(!sv)return {err:'service introuvable dans la mise en scène'};
  let m;try{m=window.__newMission(sv);}catch(e){return {err:String((e&&e.message)||e)};}
  const sien=window.__cat.foi('coiffure',m.preferredUid);
  const grille=window.__cat.foi('coiffure',null);
  S.draft=m;window.__render();
  const txt=document.body.innerText;
  return {uid:m.preferredUid,nom:m.preferredName,viaLien:!!m.viaLien,
    propre:!!sien.propre,lignes:(sien.lignes||[]).map(x=>x.nm),
    grillePropre:!!grille.propre,
    carteFigee:txt.indexOf('Votre demande lui est adressée directement')>=0,
    selecteur:!!document.querySelector('[data-prefsel]')};});
ok(!D.err,'le brouillon se fabrique'+(D.err?' — '+D.err:''));
ok(D.uid==='u-maya'&&D.nom==='Maya Beauté'&&D.viaLien,
  'le brouillon naît dirigé vers elle (preferredUid + viaLien)');
ok(D.propre&&D.lignes.indexOf('Brushing signature')>=0,
  'et c’est SON catalogue qui fait foi ('+D.lignes.join(', ')+')');
ok(!D.grillePropre,'sans prestataire, la grille reste la grille — rien n’est changé pour les autres');
ok(D.carteFigee&&!D.selecteur,'sa carte remplace le sélecteur : on n’est pas venu choisir, on est venu pour elle');
ok(/preferredProviderUid:m\.preferredUid/.test(src),
  'et c’est ce champ que la demande emporte — « Demande réservée pour vous » chez elle');
await p.close();

/* ─────────── E — ce que le serveur ne laisse pas sortir ─────────── */
console.log('\nE — ce que le serveur ne laisse pas sortir');
const corps=(nom)=>{const i=srv.indexOf('exports.'+nom+' = onCall');if(i<0)return '';
  const j=srv.indexOf('\n});',i);return j<0?srv.slice(i):srv.slice(i,j);};
const pub=corps('providerPublic'), lst=corps('listProviders'), pos=corps('poigneePoser');
ok(pub.length>200&&lst.length>200&&pos.length>200,
  'les trois fonctions sont relevées (sinon les mesures suivantes ne mesurent rien)');
ok(!/request\.auth/.test(pub),'la fiche publique n’exige aucune session — c’est tout son objet');
ok(/if \(!request\.auth\) throw new HttpsError\('unauthenticated'/.test(lst),
  'et « listProviders » continue d’en exiger une : la LISTE reste fermée');
ok(!/\.email|\.phone|\.siret|\.earnings|jobsTotal/.test(pub.split('return {')[1]||''),
  'la fiche ne porte ni e-mail, ni téléphone, ni SIRET, ni revenus, ni nombre de missions');
ok(/a\.status !== 'valide'/.test(pub)&&/not-found/.test(pub),
  'quelqu’un de non validé répond « introuvable » — la page ne dit pas l’état du parc');
ok(/\.create\(\{ uid: uid/.test(pos),
  'l’unicité de la poignée est une écriture qui ÉCHOUE si elle est prise, pas une lecture');
ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)/.test(pos),
  'et la poser est réservé à l’administrateur, par la porte des seize autres appels');
ok(/ownCat: p\.ownCat, cat: p\.cat/.test(srv),
  'le catalogue propre voyage enfin avec l’annuaire — il manquait à la projection finale');
ok(!/match \/poignees\//.test(fs.readFileSync(path.join(RACINE,'firestore.rules'),'utf8')),
  'la collection des poignées n’est nommée par aucune règle : refusée par défaut, seul le serveur y touche');

/* ─────────── F — plus de faux prestataires à un visiteur réel ─────────── */
console.log('\nF — un visiteur réel ne reçoit plus l’annuaire de démonstration');
p=await page();
const F2=await p.evaluate(()=>{const S=window.__S;S.demoMode=false;S._proDir=null;S.proPublic=null;
  window.__setFB({auth:{currentUser:null}});
  const sansCompte=window.__dirPour('coiffure');                      // visiteur réel
  S.demoMode=true; const enDemo=window.__dirPour('coiffure'); S.demoMode=false;
  return {sansCompte:sansCompte===null?'null':JSON.stringify((sansCompte||[]).map(x=>x.name)),
    enDemo:(enDemo||[]).map(x=>x.name)};});
ok(F2.sansCompte==='null',
  'un visiteur sans compte reçoit « je ne sais pas » (null), jamais de faux noms — reçu : '+F2.sansCompte);
ok(F2.enDemo.indexOf('Maya Beauté')>=0,
  'et l’annuaire factice sert encore en mode démonstration ('+F2.enDemo.join(', ')+')');
await p.close();

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
