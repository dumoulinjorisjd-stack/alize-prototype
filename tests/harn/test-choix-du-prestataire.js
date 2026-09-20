/* QUI PEUT CHOISIR SON PRESTATAIRE, ET SUR QUEL CRITÈRE.

   La question de l'éditeur, le 20/09/2026 : « certaines catégories permettent de choisir
   le prestataire précis dès la première commande et d'autres non, sur quel critère ? »

   La réponse tenait dans une ligne, et elle était fausse par accident :

     function pickProSvc(svc){ return canOnSite(svc) || ['baby','epilation','animaux']… }

   `canOnSite()` ne répond pas à « la personne compte-t-elle ? » mais à « la prestation
   peut-elle se faire CHEZ le prestataire ? » — la question du LIEU. Elle servait ici
   d'approximation, et sa liste portait `beaute` et `sport`, deux identifiants de
   CATÉGORIE qui ne désignent aucune prestation : ils ne déclenchaient rien, mais ils
   donnaient à lire que toute la famille Beauté en était. MANUCURE et MAQUILLAGE — les
   métiers les plus personnels du catalogue — n'avaient donc aucun annuaire, et rien
   dans le code ne le disait.

   Le métier DÉCLARE maintenant `choixPro`. Ce n'est pas un déplacement de liste : un
   métier créé depuis la console pose la question au moment où on le crée, au lieu d'être
   oublié dans une énumération écrite en dur.

   CE QUI SE MESURE ICI : ce que le client VOIT à la commande, métier par métier. La
   différence n'est pas « choisir ou pas » — c'est DANS QUELLE LISTE : l'annuaire du
   métier (des cartes, dès la première commande) ou son propre historique (un menu, vide
   au premier achat). */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

(async()=>{
const b=await chromium.launch(o);
const p=await b.newPage({viewport:{width:430,height:1400}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);

// Ouvre le panneau de commande d'un métier et relève ce qu'on y voit. `histo` permet de
// donner au client un prestataire DÉJÀ eu sur ce métier : c'est l'autre source de choix.
const commande=(svc,histo)=>p.evaluate(([svc,histo])=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.persona='client';S.onboarded=true;S.guest=false;S.demoMode=false;S.lang='fr';
  S.account={name:'Joris D.',email:'j@e.fr',zone:'Gustavia'};
  S.mission=null;S.payStep=false;S.authView=null;S.legalView=null;S.showPitch=false;
  S.history=histo?[{svc:svc,providerUid:'u-deja',provider:{nm:'Claire M.'}}]:[];
  S.blocked=[];
  const m=window.__newMission(window.__svc.trouve(svc));
  S.draft=m;S.clientNav='home';window.__render();
  const r=document.querySelector('.phone')||document.body;
  const cartes=[...r.querySelectorAll('[data-prefart]')];
  const sel=r.querySelector('select[data-prefsel]');
  return {txt:r.innerText.replace(/\s+/g,' '),
    cartes:cartes.length, noms:cartes.map(c=>c.innerText.replace(/\s+/g,' ').slice(0,40)),
    menu:!!sel, options:sel?[...sel.options].map(o=>o.text):[]};
},[svc,!!histo]);

console.log('\nA — les métiers où la PERSONNE compte : l’annuaire, dès la première commande');
for(const svc of ['coiffure','massage','manucure','maquillage','baby','animaux','yoga','epilationdef']){
  const r=await commande(svc,false);
  ok(r.cartes>=2&&/Votre prestataire/.test(r.txt)&&/Le premier disponible/.test(r.txt),
    svc+' : l’annuaire du métier s’affiche ('+r.cartes+' choix, sans aucun passé)');
}
{
  const r=await commande('manucure',false);
  ok(/Vérifié · Assuré/.test(r.txt),
    'et chaque carte dit ce qui aide à choisir, jamais un volume d’activité');
}

console.log('\nB — les autres : on ne choisit que parmi les prestataires DÉJÀ eus');
for(const svc of ['menage','jardin','colis','plomberie','demenagement']){
  const r=await commande(svc,false);
  ok(r.cartes===0&&!r.menu,
    svc+' : aucune liste au premier achat — l’annuaire complet n’est jamais exposé');
}
{
  const r=await commande('menage',true);
  ok(!r.cartes&&r.menu&&r.options.length===2&&/Claire M\./.test(r.options.join(' ')),
    'mais dès qu’un prestataire est déjà venu, il se redemande (menu : '+r.options.join(' · ')+')');
  const autre=await commande('jardin',true);
  ok(autre.menu&&/Claire M\./.test(autre.options.join(' ')),
    'et ce menu suit le MÉTIER sur lequel cette personne est venue');
}

console.log('\nC — un métier créé depuis la console porte la propriété, et elle décide');
{
  const r=await p.evaluate(()=>{
    const S=window.__S;
    S.customServices=[{id:'c_tatouage',nm:'Tatouage',rate:80,custom:true,ico:'',choixPro:true},
                      {id:'c_vitrier',nm:'Vitrier',rate:50,custom:true,ico:'',choixPro:false}];
    const lire=(id)=>{const m=window.__newMission(window.__svc.trouve(id));S.draft=m;S.history=[];S.clientNav='home';window.__render();
      const rr=document.querySelector('.phone')||document.body;
      return rr.querySelectorAll('[data-prefart]').length;};
    return {avec:lire('c_tatouage'), sans:lire('c_vitrier')};
  });
  ok(r.avec>=2,'« Tatouage » créé avec la case cochée : l’annuaire s’affiche ('+r.avec+')');
  ok(r.sans===0,'« Vitrier » sans la case : premier disponible, comme la plomberie');
}

console.log('\nD — la règle est DANS le métier, plus dans deux listes écrites en dur');
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const ligne=/function pickProSvc\(svc\)\{([^}]*)\}/.exec(src);
ok(!!ligne&&!/\[/.test(ligne[1]),
  'pickProSvc ne contient plus aucune liste d’identifiants — il lit `choixPro` sur le métier');
ok(!/\['sport','coach'|'beaute'/.test(/function canOnSite[^}]*}/.exec(src)[0]),
  'et `canOnSite` ne porte plus `beaute` ni `sport`, deux identifiants de CATÉGORIE qui n’y désignaient rien');
// UNE PROPRIÉTÉ QUI NE REVIENT PAS DU SERVEUR NE VAUT RIEN : le catalogue partagé est
// relu à CHAQUE instantané Firestore, et `applyCatalogDoc` recompose chaque service champ
// par champ. Un `choixPro` oublié là s'écrirait… puis se perdrait au rendu suivant, sans
// un mot. On rejoue donc une relecture, comme le ferait le serveur.
const relu=await p.evaluate(()=>{
  window.__svc.relit({services:[{id:'c_relu',nm:'Relu',rate:40,ico:'',choixPro:true},
                                {id:'c_plat',nm:'Plat',rate:40,ico:''}]});
  const l=window.__S.customServices||[];
  return {avec:!!(l[0]&&l[0].choixPro), sans:!!(l[1]&&l[1].choixPro)};
});
ok(relu.avec&&!relu.sans,
  'et le catalogue partagé la RAPPORTE : un instantané Firestore ne l’efface plus');
const cree=await p.evaluate(()=>{
  window.__S.customServices=[];
  window.__svc.ajoute('Tatouage éphémère',60,true); window.__svc.ajoute('Vitrier',50);
  const l=window.__S.customServices||[];
  return {avec:!!(l[0]&&l[0].choixPro), sans:!!(l[1]&&l[1].choixPro), n:l.length};
});
ok(cree.n===2&&cree.avec&&!cree.sans,
  'la console pose la question à la CRÉATION du métier, et la réponse est enregistrée');
ok(/admNewCatChoix/.test(src),'la case existe dans le formulaire « Ajouter un métier »');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
