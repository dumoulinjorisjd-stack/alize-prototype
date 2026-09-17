/* LE RATTACHEMENT D'UN PRESTATAIRE À UN MÉTIER.

   « À partir du moment où on a renommé le service auquel il s'était proposé, cela l'a
   déconnecté du service, il n'y est plus rattaché ; il faut que je puisse dans sa fiche
   cocher les catégories auxquelles il participe et être sûr qu'il recevra les commandes
   client rattachées à ce service. »

   Le renommage n'a rien déconnecté : LE PRESTATAIRE N'A JAMAIS ÉTÉ RATTACHÉ. Quand il se
   propose pour un métier hors liste il est enregistré en `cats:['autre']` avec son texte
   libre dans `other` ; « Ajouter au catalogue » créait le métier et s'arrêtait là, sans
   toucher sa fiche. Le seul signe visible était une ligne verte « figure déjà au
   catalogue », obtenue en comparant son texte libre au NOM du métier — une ressemblance,
   pas un lien. Renommer cassait la ressemblance, d'où l'impression d'une déconnexion.

   La preuve était à l'écran depuis le début : la carte du métier affichait « 0 artisan »,
   et ce compteur-là, lui, lit le vrai rattachement.

   ET C'EST `cats` QUI ROUTE LES COMMANDES, seul : l'application du prestataire filtre
   dessus, les trois envois de notification du serveur aussi, l'annuaire « choisir un
   prestataire » également, et la liste des services OUVERTS aux clients s'en déduit. Un
   métier que personne ne porte reste « Bientôt disponible » : rien ne peut y être commandé. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

(async()=>{
const b=await chromium.launch(o); const p=await b.newPage({viewport:{width:390,height:900}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__art&&window.__svc&&window.__S);

const semer=()=>{
  const S=window.__S;
  S.customServices=[];S.nomsMetiers={};S.adminPrices=S.adminPrices||{};
  S.adminArtisans=[{id:'a1',uid:'a1',real:false,name:'Paul',status:'valide',
    cats:['autre'],other:'Services administratifs',otherPrice:30,rates:{autre:30},pendingCats:[]}];
  return S.adminArtisans[0];
};

console.log('\nA — « Ajouter au catalogue » rattache le prestataire, au lieu de le laisser seul');
const av=await p.evaluate(()=>{
  const a=(function(){const S=window.__S;
    S.customServices=[];S.adminPrices=S.adminPrices||{};
    S.adminArtisans=[{id:'a1',uid:'a1',real:false,name:'Paul',status:'valide',
      cats:['autre'],other:'Services administratifs',otherPrice:30,rates:{autre:30},pendingCats:[]}];
    return S.adminArtisans[0];})();
  const sid=window.__svc.ajoute(a.other,30);
  return {sid, catsAvant:a.cats.slice(), ouverts:window.__art.ouverts()};
});
ok(!!av.sid&&av.sid.indexOf('c_')===0,'le métier est bien créé au catalogue');
ok(av.catsAvant.indexOf(av.sid)<0,'créer le métier ne rattache personne — c’est le défaut d’origine');
ok(av.ouverts.indexOf(av.sid)<0,
  'et le métier n’entre PAS dans la liste des services ouverts : « Bientôt disponible », rien à commander');

const ap=await p.evaluate(()=>{
  const S=window.__S,a=S.adminArtisans[0];
  const sid=(S.customServices[0]||{}).id;
  window.__art.cat(a,sid,true); window.__art.cat(a,'autre',false);
  return {sid, cats:a.cats.slice(), ouverts:window.__art.ouverts()};
});
ok(ap.cats.indexOf(ap.sid)>=0,'une fois rattaché, le métier figure dans ses `cats`');
ok(ap.cats.indexOf('autre')<0,'et il quitte « Autre » — sinon la fiche recréerait un métier jumeau');
ok(ap.ouverts.indexOf(ap.sid)>=0,
  'le métier entre alors dans les services OUVERTS : le client peut commander');

console.log('\nB — le bouton de la fiche fait les deux d’un coup');
ok(/const ex=\(S\.customServices\|\|\[\]\)\.find\(function\(x\)\{return x\.nm\.toLowerCase\(\)===a\.other\.toLowerCase\(\);\}\);/.test(src),
  'un métier du même nom déjà présent est réemployé, au lieu d’être créé en double');
ok(/adminSetCat\(a,sid,true\);/.test(src),'« Ajouter au catalogue » rattache désormais le prestataire');
ok(/adminSetCat\(a,'autre',false\);/.test(src),'et le sort de « Autre »');
ok(/if\(a\.otherPrice>0\)\{a\.rates=a\.rates\|\|\{\};a\.rates\[sid\]=a\.otherPrice;/.test(src),
  'le prix qu’il demandait le suit — sinon il repartirait à un tarif que personne n’a discuté avec lui');
ok(/return sid; \/\/ l'appelant en a besoin/.test(src),'la création rend l’identifiant, sans quoi il n’y a rien à rattacher');

console.log('\nC — la fiche laisse COCHER les métiers');
const fiche=await p.evaluate(()=>{
  const a=(function(){const S=window.__S;
    S.customServices=[{id:'c_admin',nm:'Services administratifs',rate:30,custom:true,ico:'administratif'}];
    S.adminArtisans=[{id:'a1',uid:'a1',real:false,name:'Paul',status:'valide',
      cats:['menage'],other:'',rates:{},pendingCats:['jardin']}];
    return S.adminArtisans[0];})();
  const h=window.__art.fiche(a);
  const d=document.createElement('div'); d.innerHTML=h;
  const btn=[...d.querySelectorAll('[data-adm^="artcat:"]')];
  return {n:btn.length,
    coches:btn.filter(x=>x.getAttribute('aria-pressed')==='true').map(x=>x.dataset.adm),
    custom:btn.some(x=>x.dataset.adm==='artcat:a1:c_admin'),
    demande:/demandé/.test(h), route:/lui seul — qui lui envoie les commandes/.test(h)};
});
ok(fiche.n>=20,'tous les métiers sont offerts au clic ('+fiche.n+')');
ok(fiche.coches.length===1&&fiche.coches[0]==='artcat:a1:menage','ceux qu’il exerce déjà sont cochés');
ok(fiche.custom,'y compris les métiers créés depuis la console');
ok(fiche.demande,'un métier qu’il a DEMANDÉ se distingue de ceux qu’il exerce');
ok(fiche.route,'et la fiche dit que c’est ce rattachement qui lui envoie les commandes');

console.log('\nD — ce que cocher ne suffit PAS à faire est dit');
const dits=await p.evaluate(()=>{
  const S=window.__S;
  const seul=window.__art.fiche({id:'a2',cats:['autre'],other:'X',pendingCats:[],status:'valide'});
  const att=window.__art.fiche({id:'a3',cats:['menage'],pendingCats:[],status:'attente'});
  const ok2=window.__art.fiche({id:'a4',cats:['menage'],pendingCats:[],status:'valide'});
  return {aucun:/Aucun métier rattaché/.test(seul), libre:/Service libre déclaré/.test(seul),
    nonValide:/Prestataire non validé/.test(att), muet:!/Prestataire non validé|Aucun métier rattaché/.test(ok2)};
});
ok(dits.aucun,'un prestataire sans aucun métier est signalé — il ne recevra rien');
ok(dits.libre,'« Autre » n’est pas compté comme un métier : son texte libre est rappelé à part');
ok(dits.nonValide,'un prestataire NON VALIDÉ est signalé — cocher n’ouvre alors rien aux clients');
ok(dits.muet,'et rien de tout cela ne s’affiche quand tout va bien');

console.log('\nE — le rattachement s’écrit vraiment, et la disponibilité se recalcule');
ok(/function adminSetCat\(a,sv,on\)\{/.test(src),'une seule porte pour rattacher et détacher');
ok(/cats:on\?FB\.f\.arrayUnion\(sv\):FB\.f\.arrayRemove\(sv\)/.test(src),
  'l’écriture est un ajout ou un retrait ciblé, jamais un remplacement de toute la liste');
ok(/pendingCats:FB\.f\.arrayRemove\(sv\)/.test(src),'la demande en attente est soldée du même geste');
ok(/\}\}\n *saveAvailability\(\);\n *\}/.test(src)||/saveAvailability\(\);\s*\n\s*\}/.test(src),
  'et la liste des services ouverts est recalculée — sans elle, rien ne serait commandable');
const nonValide=await p.evaluate(()=>{
  const S=window.__S;
  S.adminArtisans=[{id:'a1',uid:'a1',real:false,name:'P',status:'attente',cats:['c_admin'],pendingCats:[]}];
  return window.__art.ouverts();
});
ok(nonValide.indexOf('c_admin')<0,
  'un métier porté par un prestataire non validé n’ouvre rien — ce que la fiche annonce');

console.log('\nF — le prestataire peut enfin demander un métier créé depuis la console');
ok(/const avail=allSvc\(\)\.filter\(function\(s\)\{return owned\.indexOf\(s\.id\)<0;\}\);/.test(src),
  'son écran « Ajouter un métier » liste TOUS les métiers, pas seulement ceux du code');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
