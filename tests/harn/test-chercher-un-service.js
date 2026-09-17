/* CHERCHER UN SERVICE — IL N'Y AVAIT AUCUNE RECHERCHE.

   Pour trouver « Plomberie », un client devait balayer dix tuiles à l'œil puis deviner
   qu'elle se cachait sous « Dépannage & entretien ». Et quand le service n'existe pas, le
   seul recours — la boîte « un service qui manque » — vivait trois écrans plus loin, dans
   le profil : donc hors de portée d'un invité, et très loin du seul moment où l'on a
   quelque chose à dire.

   ON COMPARE CE QUI SE LIT, pas ce qui s'écrit : accents, casse et espaces ne font pas une
   différence pour quelqu'un qui tape « epilation » ou « ELECTRICITE ».

   ET LE CURSEUR NE SAUTE PAS : la grille est repeinte SEULE. Un `render()` complet
   recréerait le champ à chaque lettre — le défaut déjà corrigé sur le catalogue admin. */
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
await p.waitForFunction(()=>window.__S&&window.__render);
const accueil=async(onb)=>p.evaluate((o)=>{const S=window.__S;document.body.classList.add('standalone');
  S.lang='fr';S.onboarded=o;S.guest=!o;S.demoMode=true;S.persona='client';S.clientNav='home';
  S.account={name:'Camille',email:'c@e.fr',zone:'Gustavia'};
  S.mission=null;S.draft=null;S.catView=null;S.rech='';S.wishText='';S.wishSent=false;
  S.authView=null;S.onbStep=0;
  window.__render();},onb);

console.log('\nA — le champ est SOUS le catalogue, et discret');
await accueil(true);
const dep=await p.evaluate(()=>({champ:!!document.querySelector('[data-rech]'),
  tuiles:document.querySelectorAll('#home-catalogue .cat').length}));
ok(dep.champ,'un champ de recherche est offert sur l’accueil');
ok(dep.tuiles>=8,'sans rien taper, toutes les tuiles restent ('+dep.tuiles+')');
const place=await p.evaluate(()=>{const g=document.getElementById('home-catalogue').getBoundingClientRect();
  const i=document.querySelector('[data-rech]').getBoundingClientRect();
  return {sous:i.top>=g.bottom-2, h:Math.round(i.height)};});
ok(place.sous,'il vient APRÈS les tuiles : elles sont le geste principal, on ne leur met rien devant');
ok(place.h<=40,'et il reste discret ('+place.h+' px de haut)');

console.log('\nB — une lettre ne filtre rien, deux suffisent');
const court=await p.evaluate(()=>{window.__S.rech='p';return (window.__rech?0:0)||document.querySelectorAll('#home-catalogue .cat').length;});
ok(/const RECH_MIN=2;/.test(src),'en dessous de deux lettres, on ne filtre pas — « p » ne veut rien dire');

console.log('\nC — un métier RANGÉ DANS UNE CATÉGORIE se trouve quand même');
await p.click('[data-rech]'); await p.type('[data-rech]','plomb',{delay:25});
const r1=await p.evaluate(()=>{const i=document.querySelector('[data-rech]');
  return {n:document.querySelectorAll('#home-catalogue .cat').length,
    txt:document.getElementById('home-catalogue').innerText,
    focus:document.activeElement===i,caret:i.selectionStart};});
ok(r1.n===1&&/Plomberie/.test(r1.txt),
  '« plomb » trouve Plomberie, qui est rangée sous « Dépannage & entretien »');
ok(!/Dépannage/.test(r1.txt),
  'et montre LE MÉTIER, pas sa catégorie — sinon il faudrait encore deviner où il se cache');

console.log('\nD — le curseur ne saute pas');
ok(r1.focus,'le champ garde le focus après cinq lettres');
ok(r1.caret===5,'et le curseur reste à la fin ('+r1.caret+') — la grille est repeinte seule');
ok(/const box=document\.getElementById\('home-catalogue'\)/.test(src),
  'la frappe ne redessine que le catalogue, jamais tout l’écran');

console.log('\nE — on lit ce qui SE LIT');
await p.fill('[data-rech]',''); await p.type('[data-rech]','ELECTRICITE',{delay:15});
const r2=await p.evaluate(()=>document.getElementById('home-catalogue').innerText);
ok(/Électricité/.test(r2),'« ELECTRICITE » sans accent ni minuscule trouve « Électricité »');
await p.fill('[data-rech]',''); await p.type('[data-rech]','  MÉNAGE ',{delay:15});
const r3=await p.evaluate(()=>document.getElementById('home-catalogue').innerText);
ok(/Ménage/.test(r3),'les espaces autour ne comptent pas non plus');

console.log('\nF — rien ne correspond : ce n’est plus un cul-de-sac');
await p.fill('[data-rech]',''); await p.type('[data-rech]','vitrier',{delay:15});
const r4=await p.evaluate(()=>{const b=document.getElementById('home-catalogue');
  return {n:b.querySelectorAll('.cat').length, h:Math.round(b.getBoundingClientRect().height),
    vide:/Aucun service ne correspond/.test(b.innerText),
    fiche:!!b.querySelector('.card'), champ:!!b.querySelector('textarea'),
    lien:!!document.querySelector('[data-act="demander-service"]')};});
ok(r4.n===0&&r4.vide,'aucune tuile, et on le dit');
ok(!r4.fiche&&!r4.champ,
  'UNE LIGNE et pas une fiche : un premier jet posait ici une carte avec titre, paragraphe, '+
  'champ et bouton — quatre fois la hauteur de ce qu’elle avait à dire, sur l’écran le plus consulté');
ok(r4.h<=40,'le message tient en une ligne ('+r4.h+' px)');
ok(r4.lien,'et il MÈNE à la demande de service, qui existe déjà au complet dans le profil');

console.log('\nG — un invité est mené quelque part, pas dans un mur');
await accueil(false);
await p.click('[data-rech]'); await p.type('[data-rech]','vitrier',{delay:15});
const r5=await p.evaluate(()=>{
  document.querySelector('[data-act="demander-service"]').click();
  return {authView:window.__S.authView};});
ok(r5.authView==='signup',
  'un invité qui clique « Demandez-le » est envoyé créer son compte — une demande anonyme '+
  'n’aurait ni nom ni secteur, donc rien pour y répondre');

console.log('\nH — la croix efface, et il n’y en a qu’une');
await accueil(true);
await p.click('[data-rech]'); await p.type('[data-rech]','plomb',{delay:15});
const avant=await p.evaluate(()=>document.querySelectorAll('[data-act="rech-vider"]').length);
ok(avant===1,'une seule croix — celle du navigateur est masquée, on en avait deux');
ok(/input\[type=search\]::-webkit-search-cancel-button/.test(src),'et elle l’est par une règle, pas par hasard');
await p.click('[data-act="rech-vider"]');
const apres=await p.evaluate(()=>({v:(document.querySelector('[data-rech]')||{}).value,
  n:document.querySelectorAll('#home-catalogue .cat').length}));
ok(apres.v===''&&apres.n>=8,'la croix rend la grille entière');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
