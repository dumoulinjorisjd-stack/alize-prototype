/* LA COMMANDE D'UN VISITEUR, DU PREMIER TOUCHER AU PAIEMENT — AVEC DE VRAIS
   RECHARGEMENTS.

   « L'important, c'est que même un client qui n'a pas encore créé son compte puisse
   commander une prestation, découvrir le principe même de l'application par le biais
   d'une commande, et comme ça on ne ferme rien à personne. Mais au moment où il veut
   valider, il doit d'abord créer son compte, s'être enregistré dans un panier, et après
   il rentre sa carte bleue. Le pire serait un nouveau client qui arrive, qui s'inscrit
   et paf, sa commande n'est pas récupérable. »

   CE QUI MANQUAIT À LA MESURE EXISTANTE. test-lien-d-une-prestataire.js (section A)
   éprouve la porte d'adoption et rejoue la naissance de session — mais elle SIMULE la
   redirection Google en vidant la mémoire à la main, et ne recharge jamais la page. Or
   c'est le rechargement qui est le cas réel : signInWithPopup retombe sur
   signInWithRedirect dès que le popup est bloqué — l'application installée et les
   navigateurs mobiles, c'est-à-dire le chemin de quelqu'un qui arrive d'une publicité
   sur son téléphone. Tout ce qui se passe au BOOT (l'ordre des appels, un brouillon qui
   ne se sérialise pas) est donc hors de sa portée.

   ICI LA PAGE RECHARGE POUR DE VRAI, et l'on mesure ce qui survit. Plus les trois façons
   dont la commande pourrait se perdre en silence : des photos trop lourdes, un stockage
   plein, un stockage interdit (navigation privée). */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE=path.resolve(__dirname,'..','..');
const APP='file://'+path.join(RACINE,'tests','harn','app.html');
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

/* LE FAUX FIREBASE NAÎT DANS LA PAGE : une fonction ne traverse pas `evaluate`, que
   Playwright sérialise. On pose une porte unique, et chaque section l'appelle. */
const POSE=()=>{window.__fauxFB=function(uid){
  const cu={uid:uid,email:uid+'@test.fr'};
  window.__setFB({auth:{currentUser:cu},
    f:{getDoc:()=>Promise.resolve({exists:()=>false,data:()=>null}),doc:()=>({}),
       setDoc:()=>Promise.resolve(),updateDoc:()=>Promise.resolve(),onSnapshot:()=>function(){},
       collection:()=>({}),query:()=>({}),where:()=>({}),serverTimestamp:()=>0,
       arrayUnion:()=>({}),arrayRemove:()=>({})},
    db:{},fn:{httpsCallable:()=>()=>Promise.resolve({data:{}})},functions:{}});
  return cu;};};

(async()=>{
const b=await chromium.launch(o);
const p=await b.newPage({viewport:{width:430,height:1200}});
const errs=[]; p.on('pageerror',(e)=>errs.push(e.message));
const prete=async()=>{await p.waitForFunction(()=>window.__S&&window.__render&&window.__brouillon&&window.__session);await p.evaluate(POSE);};

await p.goto(APP,{waitUntil:'load'}); await prete();

console.log('\nA — il configure sans compte, la page RECHARGE, et sa commande revient');
/* Le visiteur : aucune session, et c'est l'état où l'application démarre pour qui arrive
   d'une publicité. Il configure, puis touche le bouton du bas — qui, sans compte, mène à
   la création de compte et non à la carte bancaire. */
const voulu=await p.evaluate(()=>{
  const S=window.__S; document.body.classList.add('standalone');
  try{localStorage.clear();localStorage.setItem('ti_installee','1');}catch(_){}
  /* L'APPLICATION EST INSTALLÉE, parce que c'est le chemin décrit (« quand on a
     l'application mobile ») et que la création de compte n'existe pas ailleurs
     (`accountsHere()`). Le visiteur non installé, lui, se heurte au mur d'installation :
     c'est voulu, et la section C' mesure que sa commande n'y est pas perdue. */
  window.__setFB({auth:{currentUser:null}});
  S.demoMode=false;S.lang='fr';S.guest=true;S.onboarded=false;S.account=null;
  S.authView=null;S.payStep=false;S._resumeOrder=false;S.clientNav='home';S.history=[];
  const m=window.__newMission(window.__svc.trouve('menage'));
  m.hours=3;                      // on ne FORCE pas la date : le configurateur la refuse
  S.draft=m;window.__render();
  /* ET C'EST L'APPLICATION QUI CHOISIT LA DATE, pas l'épreuve. Mesuré : `__render`
     renormalise `when` et `slot` sur ce qu'elle peut honorer — « Mardi » posé à la main
     redevient « Aujourd'hui », et le créneau le prochain libre. C'est juste (elle refuse
     une date qu'elle ne tiendrait pas), donc on relève ce qu'elle a retenu et l'on
     mesure que c'est CELA qui revient. */
  return {svc:S.draft.svc, hours:S.draft.hours, when:S.draft.when, slot:S.draft.slot};
});
ok(!!voulu.when&&!!voulu.slot,'le configurateur a retenu une date qu’il peut honorer ('+voulu.when+' '+voulu.slot+')');
const pose=await p.evaluate(()=>{
  /* Le geste réel du bas d'écran pour un invité : proceedToPay marque l'adoption AVANT
     de quitter l'écran, puis bascule sur l'inscription. On emprunte la même porte. */
  window.__brouillon.marquer();
  const S=window.__S; S._resumeOrder=true;S.authView='signup';S.onbStep=1;window.__render();
  let brut=null; try{brut=localStorage.getItem('ti_draft_anon');}catch(_){}
  const t=document.body.innerText.replace(/\s+/g,' ');
  return {anon:!!brut, svc:brut?(JSON.parse(brut).draft||{}).svc:null,
    marque:!!localStorage.getItem('tiDraftAdopt'),
    // la carte bancaire ne doit PAS être à l'écran, et un champ de compte doit l'être
    champs:[...document.querySelectorAll('input[type="email"],input[type="password"]')].length,
    carte:/Carte bancaire|Payer |Numéro de carte/i.test(t), extrait:t.slice(0,160)};
});
ok(pose.anon&&pose.svc==='menage','sa commande est écrite dans le téléphone avant qu’il parte ('+pose.svc+')');
ok(pose.marque,'et le marqueur d’adoption est posé — c’est lui qui la lui rendra');
ok(pose.champs>=2&&!pose.carte,'le bouton du bas mène à la création de compte, pas à la carte bancaire ('+pose.champs+' champs) — '+pose.extrait);

/* LE RECHARGEMENT RÉEL. C'est ce que fait signInWithRedirect : la page repart de zéro,
   la mémoire est perdue, il ne reste que le téléphone. */
await p.reload({waitUntil:'load'}); await prete();
const apresBoot=await p.evaluate(()=>({
  draftEnMemoire:!!window.__S.draft,
  anonEncoreLa:!!localStorage.getItem('ti_draft_anon'),
  marqueEncoreLa:!!localStorage.getItem('tiDraftAdopt')}));
ok(!apresBoot.draftEnMemoire,'après le rechargement la mémoire est bien vide — c’est le cas qu’on mesure');
ok(apresBoot.anonEncoreLa&&apresBoot.marqueEncoreLa,'mais le téléphone a tout gardé');

const naissance=await p.evaluate(async(uid)=>{
  const S=window.__S; document.body.classList.add('standalone'); S.demoMode=false;S.lang='fr';
  try{localStorage.setItem('ti_installee','1');}catch(_){}
  const cu=window.__fauxFB(uid);
  try{await window.__session(cu);}catch(e){return {err:String((e&&e.message)||e)};}
  return {svc:S.draft&&S.draft.svc, heures:S.draft&&S.draft.hours,
    quand:S.draft&&S.draft.when, creneau:S.draft&&S.draft.slot,
    pay:!!S.payStep, onb:!!S.onboarded,
    chezLui:!!localStorage.getItem('ti_draft_'+uid),
    anonPartie:!localStorage.getItem('ti_draft_anon')};
},'u-pub');
ok(!naissance.err,'la naissance du compte se déroule sans lever'+(naissance.err?' — '+naissance.err:''));
ok(naissance.svc===voulu.svc&&naissance.heures===voulu.hours
   &&naissance.quand===voulu.when&&naissance.creneau===voulu.slot,
  'SA COMMANDE EST LÀ, entière et au caractère près ('+naissance.svc+', '+naissance.heures
  +' h, '+naissance.quand+' '+naissance.creneau+')');
ok(naissance.pay,'et l’on est à l’étape paiement : il n’a plus qu’à entrer sa carte');
ok(naissance.chezLui&&naissance.anonPartie,'elle est rangée sous son compte, et ne traîne plus sous celle du visiteur');

console.log('\nB — et au rechargement SUIVANT, elle est toujours reprenable');
/* LE MARQUEUR S'EST CONSOMMÉ à l'adoption : il ne vaut que pour CE compte-là, et c'est
   voulu (le téléphone de famille ne doit pas hériter). Reste à savoir ce qu'il advient
   s'il recharge AVANT de payer — hésitation, appel, batterie. La commande est désormais
   sous SA clé, donc c'est la carte « Reprendre votre commande » de son accueil qui doit
   la lui rendre : sans elle, le marqueur consommé la rendrait inatteignable. */
await p.reload({waitUntil:'load'}); await prete();
const repris=await p.evaluate(async(uid)=>{
  const S=window.__S; document.body.classList.add('standalone'); S.demoMode=false;S.lang='fr';
  try{localStorage.setItem('ti_installee','1');}catch(_){}
  const cu=window.__fauxFB(uid);
  try{await window.__session(cu);}catch(e){return {err:String((e&&e.message)||e)};}
  const gardee=!!localStorage.getItem('ti_draft_'+uid);
  S.draft=null;S.payStep=false;S.clientNav='home';window.__render();
  const carte=document.querySelector('[data-act="brouillon-reprendre"]');
  const out={gardee:gardee,carte:!!carte, txt:carte?carte.innerText.replace(/\s+/g,' ').slice(0,90):''};
  if(carte){carte.click();await new Promise(r=>setTimeout(r,400));
    out.svc=S.draft&&S.draft.svc; out.heures=S.draft&&S.draft.hours;}
  return out;
},'u-pub');
ok(!repris.err,'la session se rouvre'+(repris.err?' — '+repris.err:''));
ok(repris.gardee,'sa commande a traversé le second rechargement');
ok(repris.carte,'« Reprendre votre commande » est sur son accueil — '+(repris.txt||'ABSENTE'));
ok(repris.svc===voulu.svc&&repris.heures===voulu.hours,'et elle revient entière au toucher ('+repris.svc+', '+repris.heures+' h)');

console.log('\nC — le mur d’installation est un détour, pas une perte');
/* SANS APPLICATION INSTALLÉE, LA CRÉATION DE COMPTE N'EXISTE PAS : `accountsHere()` est
   faux et tout essai d'inscription tombe sur « Votre compte se crée dans l'application ».
   C'est une décision, et elle tient (sans l'application installée, pas de notification,
   donc pas de prestataire qui répond). Ce qui serait un défaut, c'est que la commande se
   perde en route — il installe, l'application s'ouvre, et sa saisie a disparu. */
await p.reload({waitUntil:'load'}); await prete();
const murInstall=await p.evaluate(()=>{
  const S=window.__S; document.body.classList.add('standalone');
  try{localStorage.clear();}catch(_){}                  // pas installée : aucune marque
  window.__setFB({auth:{currentUser:null}});
  S.demoMode=false;S.lang='fr';S.guest=true;S.onboarded=false;S.account=null;S.history=[];
  const m=window.__newMission(window.__svc.trouve('menage')); m.hours=2;
  S.draft=m;window.__render();
  const garde={svc:S.draft.svc,hours:S.draft.hours,when:S.draft.when,slot:S.draft.slot};
  window.__brouillon.marquer();
  S._resumeOrder=true;S.authView='signup';S.onbStep=1;window.__render();
  const t=document.body.innerText.replace(/\s+/g,' ');
  return {garde:garde, mur:/compte se crée dans l.application/i.test(t),
    installer:!!document.querySelector('[data-act="get-app"]'),
    gardee:!!localStorage.getItem('ti_draft_anon'),
    marque:!!localStorage.getItem('tiDraftAdopt')};
});
ok(murInstall.mur&&murInstall.installer,'hors de l’application, l’inscription mène au mur et propose d’installer');
ok(murInstall.gardee&&murInstall.marque,'ET SA COMMANDE EST DÉJÀ DANS LE TÉLÉPHONE, marqueur compris — le mur ne la mange pas');

/* Il installe : l'application s'ouvre, et c'est la naissance de session qui doit la lui
   rendre, exactement comme après la redirection Google. */
await p.reload({waitUntil:'load'}); await prete();
const apresInstall=await p.evaluate(async(uid)=>{
  const S=window.__S; document.body.classList.add('standalone'); S.demoMode=false;S.lang='fr';
  try{localStorage.setItem('ti_installee','1');}catch(_){}
  const cu=window.__fauxFB(uid);
  try{await window.__session(cu);}catch(e){return {err:String((e&&e.message)||e)};}
  return {svc:S.draft&&S.draft.svc, heures:S.draft&&S.draft.hours,
    quand:S.draft&&S.draft.when, creneau:S.draft&&S.draft.slot, pay:!!S.payStep};
},'u-install');
ok(!apresInstall.err,'après installation, la session s’ouvre'+(apresInstall.err?' — '+apresInstall.err:''));
ok(apresInstall.svc===murInstall.garde.svc&&apresInstall.heures===murInstall.garde.hours
   &&apresInstall.quand===murInstall.garde.when&&apresInstall.creneau===murInstall.garde.slot&&apresInstall.pay,
  'et la commande du mur revient entière, au paiement ('+apresInstall.svc+', '+apresInstall.heures+' h, '+apresInstall.quand+' '+apresInstall.creneau+')');

console.log('\nD — les trois façons de la perdre en silence, et ce qui l’en empêche');
/* 1. DES PHOTOS TROP LOURDES. Une photo de commande pèse jusqu'à 250 Ko et il peut y en
      avoir six : l'écriture saute. Mieux vaut perdre les photos que la saisie entière —
      et le DIRE, une pièce jointe qui disparaît sans un mot est pire que son absence. */
await p.reload({waitUntil:'load'}); await prete();
const photos=await p.evaluate(()=>{
  const S=window.__S,B=window.__brouillon; S.demoMode=false;
  try{localStorage.clear();}catch(_){}
  window.__setFB({auth:{currentUser:null}});
  const grosse='d'.repeat(600000);            // 600 Ko : au-delà du quota d'un seul coup
  S.draft={svc:'menage',svcName:'Ménage',hours:3,
    photos:[grosse,grosse,grosse,grosse,grosse,grosse,grosse,grosse,grosse]};
  B.sauver();
  let d=null; try{d=JSON.parse(localStorage.getItem('ti_draft_anon')||'null');}catch(_){}
  return {gardee:!!(d&&d.draft&&d.draft.svc), svc:d&&d.draft&&d.draft.svc,
    heures:d&&d.draft&&d.draft.hours,
    photos:d&&d.draft&&(d.draft.photos||[]).length, dites:d&&d.photosPerdues};
});
ok(photos.gardee&&photos.svc==='menage'&&photos.heures===3,
  'quota dépassé : la SAISIE est gardée, pas jetée avec les photos');
ok(photos.photos===0&&photos.dites>0,'les photos partent, et leur nombre est retenu pour être DIT ('+photos.dites+')');

/* 2. UN STOCKAGE INTERDIT (navigation privée) : rien ne doit lever. On perd la commande
      — il n'y a nulle part où l'écrire — mais l'inscription doit aboutir quand même. */
const prive=await p.evaluate(async(uid)=>{
  const S=window.__S,B=window.__brouillon; S.demoMode=false;
  const vrai=window.localStorage;
  const mort={getItem(){throw new Error('refusé');},setItem(){throw new Error('refusé');},
    removeItem(){throw new Error('refusé');},clear(){throw new Error('refusé');},
    key(){return null;},length:0};
  try{Object.defineProperty(window,'localStorage',{value:mort,configurable:true});}
  catch(_){return {pasRemplacable:true};}
  const out={};
  try{S.draft={svc:'coiffure',svcName:'Coiffure'};B.sauver();B.marquer();out.ecriture='sans lever';}
  catch(e){out.ecriture='LEVÉE : '+e.message;}
  try{B.adopter();out.adoption='sans lever';}catch(e){out.adoption='LEVÉE : '+e.message;}
  try{const cu=window.__fauxFB(uid);await window.__session(cu);out.session='sans lever';}
  catch(e){out.session='LEVÉE : '+e.message;}
  try{Object.defineProperty(window,'localStorage',{value:vrai,configurable:true});}catch(_){}
  return out;
},'u-prive');
ok(!prive.pasRemplacable,'le stockage se remplace pour la mesure'+(prive.pasRemplacable?' — non : mesure sans objet':''));
ok(prive.ecriture==='sans lever','stockage interdit : écrire la commande ne lève pas ('+prive.ecriture+')');
ok(prive.adoption==='sans lever','la relire ne lève pas non plus ('+prive.adoption+')');
ok(prive.session==='sans lever','ET L’INSCRIPTION ABOUTIT QUAND MÊME ('+prive.session+')');

/* 3. IL RENONCE, OU L'INSCRIPTION ÉCHOUE (adresse déjà prise, mot de passe refusé), puis
      il revient. Le marqueur n'a pas été consommé : sa commande l'attend. */
await p.reload({waitUntil:'load'}); await prete();
const revient=await p.evaluate(async(uid)=>{
  const S=window.__S,B=window.__brouillon; S.demoMode=false;
  try{localStorage.clear();}catch(_){}
  window.__setFB({auth:{currentUser:null}});
  S.draft={svc:'menage',svcName:'Ménage',hours:2};B.sauver();B.marquer();
  // il renonce : retour à la navigation invité, la commande reste au chaud
  S.authView=null;S.onbStep=0;S._resumeOrder=false;window.__render();
  const enAttente=!!localStorage.getItem('ti_draft_anon')&&!!localStorage.getItem('tiDraftAdopt');
  // puis il s'inscrit pour de bon, plus tard
  S.draft=null;
  const cu=window.__fauxFB(uid);
  try{await window.__session(cu);}catch(e){return {err:String((e&&e.message)||e)};}
  return {enAttente:enAttente, svc:S.draft&&S.draft.svc, heures:S.draft&&S.draft.hours, pay:!!S.payStep};
},'u-tard');
ok(!revient.err,'le second essai d’inscription aboutit'+(revient.err?' — '+revient.err:''));
ok(revient.enAttente,'après un renoncement, la commande et son marqueur restent en attente');
ok(revient.svc==='menage'&&revient.heures===2&&revient.pay,
  'et elle revient quand il s’inscrit enfin ('+revient.svc+', '+revient.heures+' h, paiement ouvert)');

console.log('\nE — ce qui ne doit PAS arriver');
await p.reload({waitUntil:'load'}); await prete();
const refus=await p.evaluate(async(uid)=>{
  const S=window.__S,B=window.__brouillon; S.demoMode=false; const out={};
  // un compte qui a DÉJÀ sa propre commande ne se la fait pas remplacer par celle d'un visiteur
  try{localStorage.clear();}catch(_){}
  window.__setFB({auth:{currentUser:null}});
  S.draft={svc:'menage',svcName:'Celle du visiteur'};B.sauver();B.marquer();
  const cu=window.__fauxFB(uid);
  S.draft={svc:'coiffure',svcName:'La sienne'};B.sauver();
  S.draft=null;
  try{await window.__session(cu);}catch(e){return {err:String((e&&e.message)||e)};}
  const lu=B.lire(); out.resteLaSienne=lu&&lu.draft&&lu.draft.svcName;
  // et le mode démonstration n'écrit jamais rien dans le téléphone
  try{localStorage.clear();}catch(_){}
  S.demoMode=true; S.draft={svc:'menage',svcName:'Démo'}; B.sauver(); B.marquer();
  out.demoEcrit=!!localStorage.getItem(B.cle())||!!localStorage.getItem('tiDraftAdopt');
  S.demoMode=false;
  return out;
},'u-deja');
ok(!refus.err,'la session se déroule'+(refus.err?' — '+refus.err:''));
ok(refus.resteLaSienne==='La sienne','la commande d’un compte n’est jamais remplacée par celle d’un visiteur ('+refus.resteLaSienne+')');
ok(!refus.demoEcrit,'et le mode démonstration n’écrit rien dans le téléphone');

ok(errs.filter(e=>!/net::ERR|Failed to load|firebase|firestore/i.test(e)).length===0,
  'aucune erreur JS sur tout le parcours ('+(errs.join(' · ')||'aucune')+')');

await b.close();
process.exitCode=f?1:0;
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
})().catch((e)=>{console.error('FATAL',e);process.exit(1);});
