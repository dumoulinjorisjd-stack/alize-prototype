/* « SUR ORDINATEUR, QUAND JE VEUX AJOUTER UNE PHOTO, LA FEUILLE SE MET TOUT EN BAS. »

   Une feuille collée au bas de l'écran est un idiome de TÉLÉPHONE : le bas est sous le
   pouce, et l'écran fait dix centimètres. Sur un grand écran elle paraît à un demi-mètre
   du bouton qu'on vient de cliquer — mesuré à 1280 × 860 : bouton « Ajouter une photo »
   à 354 px du haut, feuille tout en bas, « Annuler » rogné par le bord de la fenêtre sur
   la capture de l'éditeur.

   Elle se centre donc sur ordinateur, exactement comme la feuille d'installation le fait
   déjà. La règle porte sur `.sheet-back`, la CLASSE : les deux feuilles qui l'emploient
   suivent, on n'énumère pas. Et le téléphone ne bouge pas — c'est là que l'idiome est
   juste. L'épreuve demande au navigateur ce qu'il APPLIQUE, et mesure des positions. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

(async()=>{
const b=await chromium.launch(o);
async function mesure(w,h,mob){
  const ctx=await b.newContext({viewport:{width:w,height:h},locale:'fr-FR',isMobile:!!mob,hasTouch:!!mob});
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
  await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(350);
  await p.evaluate(()=>{const S=window.__S;
    try{localStorage.setItem('ti_installee','1');}catch(_){}   // la barrière n'est pas le sujet
    S.account=null;S.onboarded=false;S.showPitch=false;S.legalView=null;S.persona='client';
    S.authView='signup';S.onbStep=1;
    S.clientForm={name:'',email:'',zone:'Gustavia',password:'',password2:'',photo:''};
    window.__render();
    const btn=document.querySelector('[data-act^="photopick:"]');
    window.__btnRect=btn?btn.getBoundingClientRect():null; if(btn)btn.click();});
  await p.waitForTimeout(500);                                  // la feuille finit de monter
  const r=await p.evaluate(()=>{
    const back=document.querySelector('#photosheet'), sh=back&&back.querySelector('.sheet');
    if(!sh)return {absente:true};
    const s=sh.getBoundingClientRect(), bt=window.__btnRect;
    // Le conteneur de référence : en maquette, .screen porte un transform, qui ré-ancre
    // tout position:fixed sur lui. On mesure donc contre CE qui fait le fond.
    const fond=back.getBoundingClientRect();
    return {cale:getComputedStyle(back).alignItems,
      haut:Math.round(s.top-fond.top), bas:Math.round(s.bottom-fond.top),
      fond:Math.round(fond.height),
      rogne:s.bottom>fond.bottom+1,
      ecart: bt?Math.round(Math.abs(s.top-bt.top)):null};});
  await ctx.close(); return r;
}

console.log('\nA — sur ordinateur, la feuille vient là où l’on regarde');
const d=await mesure(1280,860,false);
ok(d.cale==='center','le navigateur la cale au CENTRE, plus au bas ('+d.cale+')');
ok(!d.rogne && d.haut>0 && d.bas<d.fond,'elle tient entière à l’écran — '+d.haut+' → '+d.bas+' sur '+d.fond+' px');
ok(d.ecart!==null && d.ecart<200,'et elle paraît près du bouton qu’on vient de cliquer ('+d.ecart+' px)');

console.log('\nB — sur téléphone, rien ne bouge : c’est là que l’idiome est juste');
const t=await mesure(390,844,true);
ok(t.cale==='flex-end','elle reste calée en bas ('+t.cale+')');
ok(!t.rogne && Math.abs(t.bas-t.fond)<=1,'collée au bord, sans rien dépasser ('+t.bas+' / '+t.fond+' px)');

console.log('\nC — la règle porte sur la CLASSE, pas sur cette feuille-là');
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
ok(/body\.desktop \.sheet-back\{align-items:center\}/.test(src),
  'c’est `.sheet-back` qui se centre : la feuille des prix, qui l’emploie aussi, suit sans être nommée');
ok(!/body\.desktop #photosheet/.test(src),'aucune règle ne vise cette feuille par son identifiant');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
