/* INSTALLER TI-SERVICES SUR UN iPHONE QUAND ON A QUATRE-VINGTS ANS.

   « Il faut que l'application, qui est une PWA, puisse sur iPhone s'installer le plus
   facilement possible. Quitte à faire un mode d'emploi, les boutons sont cliquables et
   l'installation peut se faire le plus simplement possible. Dis-toi que nous avons
   affaire à des gens de 80 ans en maison de retraite. Il faut vraiment qu'en cliquant
   sur un seul bouton, ils puissent installer l'application. » (05/11/2026)

   CE QUI EST VRAI, ET QU'ON NE PEUT PAS CONTOURNER : sur iPhone, aucune page web ne
   s'installe elle-même — il n'y a pas d'API, le geste appartient à Safari. Le SEUL bouton
   qui installe est « Obtenir » sur l'App Store, et la coquille native de ce dépôt
   (`capacitor/`) attend d'y être publiée par l'éditeur. La section E garde la porte qui
   l'attend : vide aujourd'hui, et le jour où elle se remplit, « Installer » y mène d'un
   toucher — sans que l'on puisse remplir l'adresse sans la bannière Safari, ni l'inverse.

   CE QU'ON PEUT FAIRE AUJOURD'HUI, ET QUI EST MESURÉ ICI. La v906 avait fait un PAS À PAS
   (une carte, « Suivant ») — « quand on fait l'action on ne voit plus l'écran, ce pas à pas
   ne peut jamais se visualiser » (l'éditeur, le lendemain) : dès le premier geste le menu
   puis la feuille de partage RECOUVRENT la page. Donc UN SEUL ÉCRAN, tout se lit avant de
   commencer, en grand, et tout tient sur le plus petit iPhone sans défiler. Et le premier
   geste devient un BOUTON : Safari sait ouvrir sa feuille de partage depuis la page
   (`navigator.share`) — deux gestes sur trois disparaissent SI cette feuille porte « Sur
   l'écran d'accueil », ce que le banc ne peut pas voir (il n'a pas d'iPhone) : le chemin à
   la main reste plié dessous, et c'est l'éditeur qui tranche sur son téléphone. La dernière
   carte dit de toucher l'icône ; à la première ouverture en plein écran, l'application DIT
   qu'elle est installée. « Minimise les textes, personne ne lit rien » : chaque carte dit un
   GESTE, et c'est COMPTÉ.

   CE QUE CHAQUE CONTRE-ÉPREUVE FAIT ROUGIR, nommé :
     · l'écran unique n'est plus branché (igUnEcran retiré) ............... 10 mesures
     · le bouton de partage n'est plus rendu (partage=false) ............. 12 mesures
     · la carte « C'est fait » n'est plus ajoutée ......................... 6 mesures
     · la confirmation n'est plus posée à la 1ʳᵉ ouverture ................ 2 mesures
     · « Installer » n'envoie plus sur l'App Store renseigné .............. 2 mesures */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const APP=path.join(RACINE,'tests/harn/app.html');
const SRC=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const UA={
  ios26:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ios18:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  chrome:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  whatsapp:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24.1',
  android:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
};

(async()=>{
const b=await chromium.launch(o);
// `navigator.standalone` n'existe pas dans Chromium : sans lui la détection conclut à un
// navigateur INTÉGRÉ. `standalone:true` simule l'application installée (plein écran).
async function ouvrir(ua,opts){
  opts=opts||{};
  const ctx=await b.newContext({viewport:{width:390,height:opts.h||667},userAgent:ua,locale:'fr-FR',isMobile:true,hasTouch:true});
  await ctx.addInitScript(([inst,safari,share,refuse])=>{
    if(safari)try{Object.defineProperty(navigator,'standalone',{get:()=>!!inst});}catch(_){}
    // `navigator.share` : on note ce que l'application lui donne. Chromium sous file://
    // ne l'a pas forcément : on le pose (ou on le retire) EXPRÈS, selon ce qu'on mesure.
    window.__parts=[];
    try{ if(share){ navigator.share=function(d){ window.__parts.push(d); return refuse?Promise.reject(new DOMException('x','AbortError')):Promise.resolve(); }; }
         else{ Object.defineProperty(navigator,'share',{get:()=>undefined,configurable:true}); } }catch(_){}
    if(inst){const mm=window.matchMedia; window.matchMedia=function(q){ if(/display-mode:\s*standalone/.test(q))return {matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}; return mm.call(window,q); };}
  },[!!opts.installee, opts.safari!==false, opts.share!==false, !!opts.shareRefuse]);
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto('file://'+(opts.fichier||APP));
  await p.waitForFunction(()=>window.__S); await p.waitForTimeout(400);
  if(opts.lang){ await p.evaluate((l)=>{window.__S.lang=l;window.__render();},opts.lang); await p.waitForTimeout(400); }
  return {ctx,p};
}
async function guide(p){ await p.evaluate(()=>{const t=document.querySelector('[data-act="get-app"]');t&&t.click();}); await p.waitForTimeout(450); }
const releve=(p)=>p.evaluate(()=>{const s=document.querySelector('.ig-sheet'); if(!s)return {absent:true};
  const cards=[...s.querySelectorAll('.ig-cards')[0].children];
  const vis=cards.filter(c=>c.offsetParent!==null);
  const visTous=[...s.querySelectorAll('.ig-card')].filter(c=>c.offsetParent!==null).length;
  const o=s.querySelector('#igOuvrir'), ob=o?o.getBoundingClientRect():null;
  const c2=vis[1]||vis[0];
  const last=vis.length?vis[vis.length-1].getBoundingClientRect():{bottom:0};
  const aide=s.querySelector('.ig-aide-lien'), ab=aide?aide.getBoundingClientRect():{bottom:0};
  return {uni:s.classList.contains('ig-uni'), pas:s.classList.contains('ig-pas'), cartes:cards.length, visibles:vis.length, visTous,
    txt:vis.map(c=>c.innerText.replace(/\s+/g,' ').trim()),
    bouton:!!o, bTxt:o?o.innerText.replace(/\s+/g,' ').trim():null, bH:ob?Math.round(ob.height):0, bFont:o?parseFloat(getComputedStyle(o.querySelector('.ig-txt')).fontSize):0,
    police:c2?parseFloat(getComputedStyle(c2.querySelector('.ig-txt')).fontSize):0,
    sous:c2&&c2.querySelector('.ig-sub')?parseFloat(getComputedStyle(c2.querySelector('.ig-sub')).fontSize):null,
    derniereBas:Math.round(last.bottom), aideBas:Math.round(ab.bottom), ecran:innerHeight,
    anim:!!(s.querySelector('.ig-anim')&&s.querySelector('.ig-anim').getBoundingClientRect().height>0),
    fin:!!(vis.length&&vis[vis.length-1].classList.contains('ig-fin')),
    sousTitre:!!s.querySelector('.ig-head span').offsetParent,
    repli:(s.querySelector('.ig-fallback summary')||{textContent:''}).textContent.replace(/\s+/g,' ').trim(),
    repliTxt:(s.querySelector('.ig-fallback .ig-card')||{textContent:''}).textContent.replace(/\s+/g,' ').trim(),
    suiv:!!s.querySelector('.ig-suiv'),
    aide:aide?parseFloat(getComputedStyle(aide).fontSize):0};});

console.log('\nA — iPhone (Safari, iOS 26), le plus petit écran : UN écran, tout se lit avant de commencer');
{ const {ctx,p}=await ouvrir(UA.ios26); await guide(p); const r=await releve(p);
  ok(r.uni&&!r.pas&&!r.suiv,'pas de pas à pas, pas de « Suivant » : on ne voit plus l’écran pendant le geste');
  ok(r.cartes===3&&r.visibles===3,'trois cartes, toutes visibles : le bouton, le geste, puis « C’est fait » ('+r.visibles+' / '+r.cartes+')');
  ok(r.bouton&&r.bTxt==='1 Touchez ici','la première est un BOUTON qui ouvre le partage — « '+r.bTxt+' »');
  ok(r.bH>=70&&r.bFont>=18,'il fait '+r.bH+' px de haut et '+r.bFont+' px de corps : il se vise au pouce');
  ok(/^2 Touchez « Sur l.écran d.accueil », puis Ajouter/.test(r.txt[1]),'la deuxième dit le seul geste qui reste — « '+r.txt[1]+' »');
  ok(r.police>=17&&r.sous>=14,'texte '+r.police+' px, sous-titre '+r.sous+' px (13,5 et 12 avant la v906)');
  ok(!r.sousTitre,'le sous-titre de l’en-tête ne s’affiche pas : personne ne le lit');
  ok(!r.anim,'pas de dessin animé : il repoussait la dernière carte hors de l’écran (744 > 667, mesuré)');
  ok(r.derniereBas<=r.ecran&&r.aideBas<=r.ecran,'sur 390 × 667, la dernière carte ('+r.derniereBas+') ET le lien d’aide ('+r.aideBas+') tiennent sans défiler');
  ok(r.fin&&/C.est fait/.test(r.txt[2])&&/Touchez l.icône Ti-Services/.test(r.txt[2]),'la dernière dit de toucher l’icône — « '+r.txt[2]+' »');
  ok(r.repli==="rien ne s'ouvre ?"&&/Touchez •••, en bas à droite, puis « Partager », puis « Sur l.écran d.accueil »/.test(r.repliTxt),'le chemin à la main reste, plié, sous « '+r.repli+' » — « '+r.repliTxt+' »');
  ok(r.aide>=15,'le lien « je n’arrive pas à installer » lit à '+r.aide+' px');
  await ctx.close(); }

console.log('\nB — le bouton ouvre la feuille de partage de Safari, et le guide reste derrière');
{ const {ctx,p}=await ouvrir(UA.ios26); await guide(p);
  // On mesure l'ABSENCE du bouton au lieu de buter dessus : une épreuve qui lève n'est pas une mesure.
  const presse=await p.evaluate(()=>{const b=document.getElementById('igOuvrir'); if(b)b.click(); return !!b;}); await p.waitForTimeout(300);
  ok(presse,'le bouton est là');
  const r=await p.evaluate(()=>({parts:window.__parts, feuille:!!document.querySelector('.ig-sheet'), fin:!!document.querySelector('.ig-card.ig-fin')}));
  ok(r.parts.length===1&&/\/app\.html$/.test((r.parts[0]||{}).url||''),'un toucher, UN appel à navigator.share, avec l’adresse de la page — '+JSON.stringify(r.parts[0]));
  ok(r.parts[0]&&r.parts[0].title==='Ti-Services','et le nom de l’application');
  ok(r.feuille&&r.fin,'le guide reste ouvert derrière : au retour, « C’est fait » est sous les yeux');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.ios26,{shareRefuse:true}); await guide(p);
  await p.evaluate(()=>{const b=document.getElementById('igOuvrir'); if(b)b.click();}); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>({parts:window.__parts.length, feuille:!!document.querySelector('.ig-sheet')}));
  ok(r.parts===1&&r.feuille,'la feuille refermée sans rien choisir (AbortError) ne casse rien : le guide est toujours là');
  await ctx.close(); }

console.log('\nC — les autres contextes : sans navigator.share, Safari 18, Chrome iPhone, WhatsApp, Android');
{ const {ctx,p}=await ouvrir(UA.ios26,{share:false}); await guide(p); const r=await releve(p);
  ok(r.uni&&!r.bouton&&r.cartes===4&&r.visibles===4&&/^1 Touchez ••• en bas à droite/.test(r.txt[0]),'sans partage programmable : les trois gestes à la main, tous visibles ('+r.visibles+')');
  ok(r.derniereBas<=r.ecran&&r.aideBas<=r.ecran,'et ils tiennent dans 667 px ('+r.derniereBas+' / '+r.aideBas+')');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.ios18); await guide(p); const r=await releve(p);
  ok(r.bouton&&r.cartes===3&&/Touchez Partager ⬆︎, en bas de l.écran, puis « Sur l.écran d.accueil »/.test(r.repliTxt),'Safari avant iOS 26 : même bouton, et le repli à la main nomme Partager EN BAS — « '+r.repliTxt+' »');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.chrome); await guide(p); const r=await releve(p);
  ok(r.uni&&!r.bouton&&r.cartes===3&&r.visibles===3&&/en haut à droite/.test(r.txt[0]),'Chrome sur iPhone : ses cartes, toutes visibles, Partager en HAUT, pas de bouton (sa feuille n’est pas mesurée)');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.whatsapp,{safari:false}); await guide(p); const r=await releve(p);
  ok(!r.uni&&!r.bouton&&r.visTous>=3,'dans WhatsApp, rien de tout cela : la feuille propose deux chemins et se lit d’un bloc ('+r.visTous+' cartes visibles)');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.android,{safari:false}); await guide(p); const r=await releve(p);
  ok(!r.uni&&r.visibles===2&&!r.bouton&&!r.suiv,'Android : inchangé — ses deux cartes, aucun bouton (il a l’invite native)');
  await ctx.close(); }

console.log('\nD — à la PREMIÈRE ouverture en plein écran, l’application dit qu’elle est installée');
{ const {ctx,p}=await ouvrir(UA.ios26,{installee:true}); await p.waitForTimeout(1200);
  const r=await p.evaluate(()=>{const e=document.getElementById('instOk'); const m=localStorage.getItem('ti_installee');
    if(!e)return {absent:true,m};
    const b=e.querySelector('button'), bb=b.getBoundingClientRect();
    return {txt:e.textContent.replace(/\s+/g,' ').trim(), police:parseFloat(getComputedStyle(e.querySelector('b')).fontSize), bH:Math.round(bb.height), m, dedans:bb.bottom<=innerHeight};});
  ok(!r.absent&&/Ti-Services est installée\.\s*Compris$/.test(r.txt||''),'le bandeau le dit, en une phrase et un bouton — « '+(r.txt||'')+' »');
  ok(r.police>=17&&r.bH>=48&&r.dedans,'en '+r.police+' px, avec un bouton « Compris » de '+r.bH+' px, dans l’écran');
  ok(r.m==='1','et la marque d’installation est posée');
  await p.evaluate(()=>document.querySelector('#instOk button').click());
  ok(!(await p.evaluate(()=>!!document.getElementById('instOk'))),'« Compris » le retire');
  // Deuxième ouverture : la marque est là, on ne le redit pas.
  await p.reload(); await p.waitForFunction(()=>window.__S); await p.waitForTimeout(1200);
  ok(!(await p.evaluate(()=>!!document.getElementById('instOk'))),'à la deuxième ouverture, plus rien : on l’a dit une fois');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.ios26); await p.waitForTimeout(1200);
  ok(!(await p.evaluate(()=>!!document.getElementById('instOk'))),'et dans Safari (pas en plein écran), jamais : il n’y a rien d’installé à annoncer');
  await ctx.close(); }

console.log('\nE — l’App Store : la seule porte à un seul bouton, et elle attend sa publication');
ok(/\n  const APP_STORE_URL='';\n/.test(SRC),'l’adresse de l’App Store est déclarée, et VIDE : rien n’est publié');
ok(/if\(b\.dataset\.act==='get-app'\)\{ if\(allerAppStore\(\)\)return; showInstallGuide\(\);return;\}/.test(SRC),'« Installer l’application » la consulte AVANT d’ouvrir le guide');
const meta=/<meta name="apple-itunes-app" content="app-id=(\d+)"/.exec(SRC.slice(0,SRC.indexOf('</head>')));
const urlId=/const APP_STORE_URL='[^']*?id(\d+)/.exec(SRC);
ok(!meta===!urlId && (!meta || meta[1]===urlId[1]),'la bannière Safari (<meta apple-itunes-app>) et l’adresse vont ENSEMBLE : '
  +(meta?'id '+meta[1]:'aucune bannière')+' / '+(urlId?'id '+urlId[1]:'aucune adresse'));
{ const {ctx,p}=await ouvrir(UA.ios26);
  const r=await p.evaluate(()=>{const avant=location.href; document.querySelector('[data-act="get-app"]').click(); return {guide:!!document.querySelector('.ig-sheet'), bouge:location.href!==avant};});
  ok(r.guide&&!r.bouge,'adresse vide : « Installer » ouvre le guide et ne navigue nulle part');
  await ctx.close(); }
// Le jour où elle est remplie : on l'éprouve sur une COPIE du harnais, adresse posée.
{ const copie=path.join(RACINE,'tests/harn/app-appstore.tmp.html');
  fs.writeFileSync(copie, fs.readFileSync(APP,'utf8').replace("const APP_STORE_URL='';","const APP_STORE_URL='https://apps.apple.com/fr/app/ti-services/id6740000000';"));
  try{
    const {ctx,p}=await ouvrir(UA.ios26,{fichier:copie});
    // Le conteneur n'atteint pas apps.apple.com : on sert la page nous-mêmes, pour que
    // la navigation ABOUTISSE et qu'on lise où elle est allée.
    await p.route('**/*apps.apple.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>App Store</title>'}));
    const nav=[]; p.on('framenavigated',fr=>nav.push(fr.url()));
    await p.evaluate(()=>{ document.querySelector('[data-act="get-app"]').click(); });
    await p.waitForTimeout(600);
    const guideOuvert=await p.evaluate(()=>!!document.querySelector('.ig-sheet')).catch(()=>false);
    ok(nav.some(u=>/apps\.apple\.com\/fr\/app\/ti-services/.test(u)),'adresse remplie : « Installer » part sur l’App Store d’un seul toucher ('+(nav[0]||'aucune navigation')+')');
    ok(!guideOuvert,'…et n’ouvre pas le guide par-dessus');
    await ctx.close();
    const {ctx:c2,p:p2}=await ouvrir(UA.android,{fichier:copie,safari:false});
    const n2=[]; p2.on('framenavigated',fr=>n2.push(fr.url()));
    await p2.evaluate(()=>{ document.querySelector('[data-act="get-app"]').click(); }); await p2.waitForTimeout(500);
    ok(!n2.length&&await p2.evaluate(()=>!!document.querySelector('.ig-sheet')),'Android ne va pas sur l’App Store : il garde son guide');
    await c2.close();
  } finally { try{fs.unlinkSync(copie);}catch(_){} }
}

console.log('\nF — et tout cela se lit dans la langue choisie');
for(const lang of ['en','pt']){
  const {ctx,p}=await ouvrir(UA.ios26,{lang}); await guide(p);
  const r=await releve(p); const all=[r.bTxt,...r.txt,r.repli,r.repliTxt].join(' | ');
  const FR=['Touchez','C\'est fait','écran d\'accueil','Partager','en bas','rien ne s','faites défiler'];
  const reste=FR.filter(m=>all.includes(m));
  ok(!reste.length,lang.toUpperCase()+' : bouton, gestes, carte finale et repli traduits'+(reste.length?' — reste : '+reste.join(' · '):''));
  await ctx.close();
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
