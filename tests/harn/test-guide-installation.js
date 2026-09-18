/* LE GUIDE D'INSTALLATION iPHONE : CE QU'IL MONTRE, ET CE QU'IL N'AFFIRME PAS.

   Quatre défauts mesurés sur la feuille rendue à 390 px.

   1. L'ANIMATION NE MONTRAIT RIEN. 81 × 132 px — 21 % de la largeur — et le « ••• »
      qu'elle désigne mesurait trois pixels, sous une accroche qui dit « Regardez le
      geste ». On promettait une démonstration, on montrait une vignette.

   2. LA LÉGENDE RÉPÉTAIT L'ÉTAPE 1, mot pour mot (« en bas, à droite de l'adresse »).
      Le défaut avait déjà été corrigé pour Chrome iPhone — le commentaire du code le dit
      — et la branche Safari ne l'avait jamais suivi. Sa place revient au dessin.

   3. UN iPAD RECEVAIT LES INSTRUCTIONS iOS 26, ET ELLES SONT FAUSSES. Son UA se donne
      pour un « Macintosh » et ne porte AUCUN numéro de version : `iosVer` valait 0, donc
      le chemin moderne — « le bouton ••• EN BAS » — alors que sa barre est en haut.

   4. ET IL N'Y AVAIT AUCUNE ISSUE. La branche Safari ne portait pas de repli : le guide
      affirmait un chemin sans laisser passer à l'autre. On DEVINE la version d'iOS ;
      mieux vaut une porte que de mieux parier. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

const UA={
  ios26:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ios18:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipad :'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  chrome:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1'
};

(async()=>{
const b=await chromium.launch(o);
// `navigator.standalone` n'existe pas dans Chromium : sans lui, la détection conclut à
// un navigateur INTÉGRÉ (WhatsApp…) et l'on n'atteindrait jamais la branche Safari.
async function feuille(ua,touch,h,lang,deplier){
  const ctx=await b.newContext({viewport:{width:390,height:h||844},userAgent:ua,locale:'fr-FR',isMobile:true,hasTouch:true});
  await ctx.addInitScript(([t])=>{try{Object.defineProperty(navigator,'standalone',{get:()=>false});}catch(_){}
    if(t)try{Object.defineProperty(navigator,'maxTouchPoints',{get:()=>t});}catch(_){}},[touch||0]);
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
  await p.waitForFunction(()=>window.__S); await p.waitForTimeout(400);
  if(lang){ await p.evaluate((l)=>{window.__S.lang=l;window.__render();},lang); await p.waitForTimeout(500); }
  await p.evaluate(()=>{const t=document.querySelector('#installBtn')||document.querySelector('[data-act="get-app"]');t&&t.click();});
  await p.waitForTimeout(deplier?900:500);
  if(deplier)await p.evaluate(()=>{const d=document.querySelector('.ig-fallback');if(d)d.open=true;});
  const r=await p.evaluate(()=>{const s=document.querySelector('.ig-sheet');if(!s)return{absent:true};
    const a=s.querySelector('.ig-anim'), c1=s.querySelector('.ig-card');
    const ab=a?a.getBoundingClientRect():null, cb=c1?c1.getBoundingClientRect():null;
    return {badge:(s.querySelector('.ig-badge-browser')||{}).innerText||'',
      animH: ab?Math.round(ab.height):0, animW: ab?Math.round(ab.width):0,
      etapes:[...s.querySelectorAll('.ig-cards')][0].children.length,
      etape1Visible: cb? cb.bottom<=window.innerHeight : false,
      sortie:!!s.querySelector('.ig-fallback'), legende:!!s.querySelector('.ig-cap'),
      video:!!s.querySelector('.ig-video'),
      intro:(s.querySelector('.ig-intro')||{}).innerText||'',
      txt:s.innerText.replace(/\s+/g,' ')};});
  await ctx.close(); return r;
}

console.log('\nA — iPhone, Safari, iOS 26 : trois gestes, et on ne se répète pas');
const a=await feuille(UA.ios26,0,844);
ok(a.etapes===3,'trois étapes — autant que l’animation joue de frappes ('+a.etapes+')');
ok(!a.legende,'plus de légende sous l’animation : elle redisait le sous-titre de l’étape 1');
ok(/iOS 26/.test(a.badge),'le badge DIT la version reconnue — « '+a.badge+' »');
ok(a.sortie,'et une issue existe si la reconnaissance se trompe');

console.log('\nB — l’animation est enfin regardable, sans chasser la première étape');
ok(a.animH>=170,'elle passe de 132 à '+a.animH+' px de haut ('+a.animW+' de large)');
const petit=await feuille(UA.ios26,0,667);
ok(petit.etape1Visible,'sur un petit iPhone (390 × 667), l’étape 1 reste à l’écran sans défiler');
ok(petit.animH>=170,'et le dessin n’y est pas rétréci pour autant ('+petit.animH+' px)');

console.log('\nC — iPhone, Safari avant iOS 26 : deux gestes, pas trois');
const c=await feuille(UA.ios18,0,667);
ok(c.etapes===2,'« En voir plus » n’est pas une étape : elle ne se produit que si la liste est courte ('+c.etapes+' étapes)');
ok(/En voir plus/.test(c.txt),'elle reste dite, en sous-titre de l’étape qu’elle sert');
ok(/iOS 18/.test(c.badge),'badge — « '+c.badge+' »');
ok(c.etape1Visible,'étape 1 visible sans défiler');

console.log('\nD — un iPad n’est pas un iPhone, et on n’invente rien sur lui');
const d=await feuille(UA.ipad,5,844);
ok(/Sur iPad/.test(d.badge),'il est reconnu et nommé — « '+d.badge+' »');
ok(!/iOS \d/.test(d.badge),'sans version : son UA n’en porte aucune, et l’inventer serait pire que se taire');
ok(!/juste à droite de l.adresse/.test(d.txt) && !/tout en bas de l.écran/.test(d.txt),
  'aucune position de bouton ne lui est affirmée — sa barre n’est pas celle d’un iPhone');
ok(d.animH===0,'et pas d’animation : le dessin est celui d’un TÉLÉPHONE');
ok(!/Regardez le geste/.test(d.intro),'l’accroche ne promet donc pas un geste à regarder');
ok(d.sortie,'l’issue est là aussi');

console.log('\nE — Chrome sur iPhone : inchangé, sauf l’étape conditionnelle');
const e=await feuille(UA.chrome,0,844);
ok(e.etapes===2,'deux étapes, comme son animation joue deux frappes ('+e.etapes+')');
ok(e.video,'la vidéo reste : elle a été filmée dans Chrome, le navigateur qu’iOS 26 n’a pas changé');
ok(/en haut à droite de la barre d.adresse/.test(e.txt),'et son repère reste le sien : Partager est en HAUT');

console.log('\nF — et la feuille se lit ENTIÈREMENT dans la langue choisie');
// La règle du projet : une phrase mi-française mi-étrangère est pire qu'une phrase
// française. La feuille en portait déjà (« Regardez le geste… en full screen »), et le
// libellé DESSINÉ dans l'animation se lisait « Partilhar » puis « Sur l'écran d'accueil ».
const FR=['Touchez','le bouton','Sur l\'écran','d\'accueil','si vous ne la voyez pas',
          'ne ressemble pas','Regardez le geste','quelques secondes','barre d\'outils',
          'Dans le menu','Pas de bouton','En voir plus','faites défiler'];
for(const lang of ['en','pt']){
  const r=await feuille(UA.ios26,0,844,lang,true);
  const reste=FR.filter(m=>r.txt.includes(m));
  ok(!reste.length,'iOS 26 en '+lang.toUpperCase()+' : aucun mot français ne subsiste'+(reste.length?' — reste : '+reste.join(' · '):''));
  const r2=await feuille(UA.ios18,0,844,lang,true);
  const reste2=FR.filter(m=>r2.txt.includes(m));
  ok(!reste2.length,'iOS 18 en '+lang.toUpperCase()+' : idem'+(reste2.length?' — reste : '+reste2.join(' · '):''));
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
