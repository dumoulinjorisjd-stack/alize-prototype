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

   CE QU'ON PEUT FAIRE AUJOURD'HUI, ET QUI EST MESURÉ ICI : le mode d'emploi se lit UNE
   carte à la fois, en 18 px, avec un bouton de 58 px qui avance ; sur le plus petit
   iPhone, la carte ET le bouton tiennent à l'écran sans défiler ; la dernière carte dit
   de toucher l'icône ; et à la première ouverture en plein écran, l'application DIT
   qu'elle est installée. « Minimise les textes, personne ne lit rien. Il faut juste des
   boutons à suivre » (le même jour) : une carte dit un GESTE et trois mots pour dire où,
   le bouton dit « Suivant », la progression est un chiffre — et c'est COMPTÉ (section A),
   sans quoi les phrases reviendraient une à une. Relevé AVANT ce lot, feuille rendue à 390 px :
   trois cartes empilées en 13,5 px, sous-titres en 12, et rien à la fin des gestes — on
   revenait dans Safari devant le même écran, sans savoir si ça avait marché.

   CE QUE CHAQUE CONTRE-ÉPREUVE FAIT ROUGIR, nommé :
     · le pas à pas n'est plus branché (toutes les cartes à la fois) ...... 9 mesures
     · l'accroche revient au-dessus du dessin ............................. 1 mesure (le bouton sort de l'écran)
     · la carte « C'est fait » n'est plus ajoutée ......................... 4 mesures
     · la confirmation n'est plus posée à la 1ʳᵉ ouverture ................ 2 mesures
     · « Installer » ouvre le guide même quand l'App Store est renseigné .. 2 mesures */
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
  await ctx.addInitScript(([inst,safari])=>{
    if(safari)try{Object.defineProperty(navigator,'standalone',{get:()=>!!inst});}catch(_){}
    if(inst){const mm=window.matchMedia; window.matchMedia=function(q){ if(/display-mode:\s*standalone/.test(q))return {matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}; return mm.call(window,q); };}
  },[!!opts.installee, opts.safari!==false]);
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto('file://'+(opts.fichier||APP));
  await p.waitForFunction(()=>window.__S); await p.waitForTimeout(400);
  if(opts.lang){ await p.evaluate((l)=>{window.__S.lang=l;window.__render();},opts.lang); await p.waitForTimeout(400); }
  return {ctx,p};
}
async function guide(p){ await p.evaluate(()=>{const t=document.querySelector('[data-act="get-app"]');t&&t.click();}); await p.waitForTimeout(450); }
const releve=(p)=>p.evaluate(()=>{const s=document.querySelector('.ig-sheet'); if(!s)return {absent:true};
  const cur=s.querySelector('.ig-card.ig-cur'), suiv=s.querySelector('.ig-suiv'), prec=s.querySelector('.ig-prec'), prog=s.querySelector('.ig-prog');
  const cb=cur?cur.getBoundingClientRect():null, sb=suiv?suiv.getBoundingClientRect():null;
  const vis=[...s.querySelectorAll('.ig-card')].filter(c=>c.offsetParent!==null);
  return {pas:s.classList.contains('ig-pas'), cartes:s.querySelectorAll('.ig-cards')[0].children.length, visibles:vis.length,
    txt:cur?cur.innerText.replace(/\s+/g,' ').trim():'', mots:cur?cur.innerText.replace(/\s+/g,' ').trim().split(' ').length:0, police:cur?parseFloat(getComputedStyle(cur.querySelector('.ig-txt')).fontSize):0,
    sous:cur&&cur.querySelector('.ig-sub')?parseFloat(getComputedStyle(cur.querySelector('.ig-sub')).fontSize):null,
    prog:prog?prog.textContent:null, bouton:suiv?suiv.textContent:null, bH:sb?Math.round(sb.height):0, bFont:suiv?parseFloat(getComputedStyle(suiv).fontSize):0,
    carteBas:cb?Math.round(cb.bottom):0, boutonBas:sb?Math.round(sb.bottom):0, ecran:innerHeight,
    precVisible:!!(prec&&!prec.hidden), anim:!!(s.querySelector('.ig-anim')&&s.querySelector('.ig-anim').getBoundingClientRect().height>0), fin:!!(cur&&cur.classList.contains('ig-fin')),
    sousTitre:!!s.querySelector('.ig-head span').offsetParent,
    aide:parseFloat(getComputedStyle(s.querySelector('.ig-aide-lien')).fontSize)};});

console.log('\nA — iPhone (Safari, iOS 26), le plus petit écran : une carte, en grand, et le bouton sous l’œil');
{ const {ctx,p}=await ouvrir(UA.ios26); await guide(p); const r=await releve(p);
  ok(r.pas&&r.visibles===1,'une seule carte est affichée à la fois ('+r.visibles+' visible sur '+r.cartes+')');
  ok(r.cartes===4,'quatre cartes dans la feuille : les trois gestes, puis « C’est fait » ('+r.cartes+')');
  ok(/^1 Touchez •••/.test(r.txt)&&r.mots<=8,'la première dit le geste et où, en '+r.mots+' mots — « '+r.txt+' »');
  ok(!r.sousTitre,'le sous-titre de l’en-tête (« Pour créer votre compte… ») ne s’affiche pas : personne ne le lit');
  ok(r.police>=18,'son texte fait '+r.police+' px (13,5 avant ce lot)');
  ok(r.sous>=15,'et son sous-titre '+r.sous+' px (12 avant)');
  ok(r.bH>=56&&r.bFont>=18,'le bouton qui avance fait '+r.bH+' px de haut et '+r.bFont+' px de corps : il se vise au pouce');
  ok(r.carteBas<=r.ecran&&r.boutonBas<=r.ecran,'sur 390 × 667, la carte ('+r.carteBas+') ET le bouton ('+r.boutonBas+') tiennent dans l’écran sans défiler');
  ok(r.prog==='1 / 3','la progression est un chiffre : « '+r.prog+' » — la carte finale n’est pas un geste, elle ne compte pas');
  ok(r.bouton==='Suivant →','et le bouton, un mot : « '+r.bouton+' »');
  ok(!r.precVisible,'pas de « précédente » sur la première');
  ok(r.anim,'le dessin du geste est là, à la première étape');
  ok(r.aide>=15,'le lien « je n’arrive pas à installer » lit à '+r.aide+' px (12,5 avant)');
  await ctx.close(); }

console.log('\nB — le parcours : trois « c’est fait », une carte finale, et le bouton ferme');
{ const {ctx,p}=await ouvrir(UA.ios26); await guide(p);
  const suivant=async()=>{ await p.evaluate(()=>document.querySelector('.ig-suiv').click()); await p.waitForTimeout(250); return releve(p); };
  const r2=await suivant();
  ok(/^2 Touchez « Partager »/.test(r2.txt)&&r2.mots<=5&&r2.prog==='2 / 3','« Suivant » montre la deuxième — « '+r2.txt+' », '+r2.prog);
  ok(!r2.anim,'le dessin se retire dès la deuxième étape : on a regardé, on fait');
  ok(r2.precVisible,'et « étape précédente » apparaît');
  ok(r2.carteBas<=r2.ecran&&r2.boutonBas<=r2.ecran,'carte et bouton toujours à l’écran ('+r2.carteBas+' / '+r2.boutonBas+')');
  await p.evaluate(()=>document.querySelector('.ig-prec').click()); await p.waitForTimeout(200);
  const r1=await releve(p); ok(/^1 /.test(r1.txt)&&r1.anim,'« précédente » revient à la première, dessin compris');
  await suivant(); const r3=await suivant();
  ok(/^3 Touchez « Sur l.écran d.accueil », puis Ajouter$/.test(r3.txt),'troisième geste, rien de plus — « '+r3.txt+' »');
  const r4=await suivant();
  ok(r4.fin&&/C.est fait/.test(r4.txt)&&/Touchez l.icône Ti-Services sur votre écran d.accueil/.test(r4.txt)&&r4.mots<=12,
    'la carte finale dit de toucher l’icône, en '+r4.mots+' mots — « '+r4.txt+' »');
  ok(r4.prog===''&&r4.bouton==='Fermer','plus de progression, et le bouton dit « Fermer »');
  ok(r4.carteBas<=r4.ecran&&r4.boutonBas<=r4.ecran,'elle tient aussi dans 667 px ('+r4.carteBas+' / '+r4.boutonBas+')');
  await p.evaluate(()=>document.querySelector('.ig-suiv').click()); await p.waitForTimeout(400);
  ok(!(await p.evaluate(()=>!!document.querySelector('.ig-sheet'))),'il ferme : on ne laisse personne devant un bouton qui ne fait plus rien');
  await ctx.close(); }

console.log('\nC — les autres contextes : Safari 18, Chrome iPhone, WhatsApp, Android');
{ const {ctx,p}=await ouvrir(UA.ios18); await guide(p); const r=await releve(p);
  ok(r.pas&&r.cartes===3&&r.prog==='1 / 2','Safari avant iOS 26 : deux gestes + la carte finale, « '+r.prog+' »');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.chrome); await guide(p); const r=await releve(p);
  ok(r.pas&&r.cartes===3&&/en haut à droite/.test(r.txt),'Chrome sur iPhone : pas à pas aussi, deux gestes + la carte finale, et Partager en HAUT');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.whatsapp,{safari:false}); await guide(p); const r=await releve(p);
  ok(!r.pas&&r.visibles>=3,'dans WhatsApp, PAS de pas à pas : la feuille propose deux chemins et se lit d’un bloc ('+r.visibles+' cartes visibles)');
  await ctx.close(); }
{ const {ctx,p}=await ouvrir(UA.android,{safari:false}); await guide(p); const r=await releve(p);
  ok(!r.pas&&r.visibles===2&&r.bouton===null,'Android : inchangé — ses deux cartes, aucun bouton « suivante » (il a l’invite native)');
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
  const tx=[]; for(let k=0;k<4;k++){ const r=await releve(p); tx.push(r.prog+' | '+r.bouton+' | '+r.txt); await p.evaluate(()=>document.querySelector('.ig-suiv').click()); await p.waitForTimeout(200); }
  const all=tx.join(' ');
  const FR=['Suivant','Fermer','Précédent','C\'est fait','Touchez','écran d\'accueil','Partager','en bas'];
  const reste=FR.filter(m=>all.includes(m));
  ok(!reste.length,lang.toUpperCase()+' : progression, boutons et carte finale traduits'+(reste.length?' — reste : '+reste.join(' · '):''));
  await ctx.close();
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
