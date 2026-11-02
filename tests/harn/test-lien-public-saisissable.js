/* LE CHAMP DU LIEN PUBLIC SE SAISIT, Y COMPRIS SUR UN TÉLÉPHONE.

   Relevé sur une capture de la console, le 02/11/2026, pendant que l'éditeur demandait
   comment se servir du profil public : le champ où l'on tape la poignée était une
   pastille, et « Enregistrer » sortait de l'écran.

   MESURÉ : la colonne de droite d'une fiche vaut 202 px à 390 px de large (grille
   106px + 12 de gouttière, moins les marges de la carte). Le préfixe
   « ti-services.fr/?pro= » en prenait 112 et le bouton 98 — il ne restait RIEN, le champ
   mesurait 28 px, c'est-à-dire son seul rembourrage, zéro de contenu. Et la rangée ne
   débordait pas la page : elle était ROGNÉE, donc rien ne le signalait.

   L'ÉPREUVE NE COMPARE À AUCUN NOMBRE ÉCRIT À LA MAIN : elle exige que le champ ait au
   moins la largeur du bouton d'à côté (il porte un nom plus long qu'une poignée), et que
   le bouton tienne dans l'écran. Et elle mesure l'ORDINATEUR aussi : sans cette moitié,
   une règle qui empilerait tout passerait au vert. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE=path.resolve(__dirname,'..','..');
const APP='file://'+path.join(RACINE,'tests','harn','app.html');
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

const SCENE=()=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.demoMode=false;S.lang='fr';S.onboarded=true;S.persona='admin';S.isAdmin=true;
  S.admin=S.admin||{};S.admin.view='art';S.admin.sel='a1';
  S.adminArtisans=[{id:'a1',uid:'u-nex',name:'NEXORA SOLUTIONS',status:'valide',handle:'',
    cats:['clim'],siret:'10850244400012',kind:'entreprise',legalForm:'SASU',capital:'1000',
    rcs:'Saint-Barthélemy',birth:'1996-04-15',cgu:true,charte:true,mollieStatus:'none'}];
  window.__render();
  const row=[...document.querySelectorAll('.fiche .fr')]
    .find(e=>/Lien public/.test((e.querySelector('.k')||{}).textContent||''));
  if(!row)return {ouvert:false};
  const R=e=>e?e.getBoundingClientRect():null;
  const inp=row.querySelector('input[data-poignee]');
  const btn=row.querySelector('button[data-adm^="poignee:"]');
  const doc=document.documentElement;
  return {ouvert:true, champ:R(inp)&&Math.round(R(inp).width),
    bouton:R(btn)&&Math.round(R(btn).width), droite:R(btn)&&Math.round(R(btn).right),
    ecran:window.innerWidth, debord:Math.round(doc.scrollWidth-doc.clientWidth),
    aide:/lisible sans compte/.test(row.textContent||'')};
};

(async()=>{
const b=await chromium.launch(o);
const vus={};
for(const w of [390,430,1024]){
  const p=await b.newPage({viewport:{width:w,height:1200}});
  await p.goto(APP,{waitUntil:'load'});
  await p.waitForFunction(()=>window.__S&&window.__render);
  vus[w]=await p.evaluate(SCENE);
  await p.close();
}
console.log('\nLe champ où l’on tape la poignée');
for(const w of [390,430,1024]){
  const v=vus[w];
  ok(v.ouvert,w+' px : la fiche d’une prestataire validée montre bien le lien public');
  if(!v.ouvert)continue;
  ok(v.champ>=v.bouton,
    w+' px : le champ est au moins aussi large que « Enregistrer » ('+v.champ+' contre '+v.bouton+')');
  ok(v.droite<=v.ecran,
    w+' px : le bouton tient dans l’écran (il finit à '+v.droite+' sur '+v.ecran+')');
  ok(v.debord===0,w+' px : et la page ne déborde pas ('+v.debord+')');
}
/* ASSERTION ARRIÈRE : sans la phrase d'aide, la rangée mesurée ne serait pas la bonne —
   « le champ est large » serait vrai de n'importe quel champ de la fiche. */
ok(vus[390].aide&&vus[1024].aide,'et c’est bien la rangée du lien public qu’on mesure');
/* LA MOITIÉ QUI COMPTE : sur un ordinateur rien ne bouge. Relevé avant le correctif —
   champ 314, bouton 98, bord droit 967 — et l'épreuve refuse qu'il change. */
ok(vus[1024].champ===314&&vus[1024].bouton===98&&vus[1024].droite===967,
  'sur un ordinateur, la rangée est au pixel celle d’avant ('+vus[1024].champ+'/'
  +vus[1024].bouton+'/'+vus[1024].droite+')');

await b.close();
process.exitCode=f?1:0;
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
})().catch((e)=>{console.error('FATAL',e);process.exit(1);});
