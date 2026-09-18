/* « J'INSTALLE L'APPLICATION, JE L'OUVRE, ET ELLE ME DEMANDE DE L'INSTALLER. »

   La barrière `accountsHere()` ne connaissait qu'UN fait : `display-mode: standalone`,
   c'est-à-dire « suis-je AFFICHÉ en plein écran À CET INSTANT ? ». C'est la bonne
   question pour la mesure d'entonnoir, et la mauvaise pour décider si quelqu'un a le
   droit de créer un compte — les deux se séparent dès qu'on quitte le téléphone.

   Sur Mac, Chrome ouvre un ONGLET pour tout lien ti-services.fr, et le menu ⋮ de la
   fenêtre d'app propose « Ouvrir dans Chrome », choix qu'il retient. Or au-delà de
   1024 px la classe .desktop MASQUE la vitrine : l'onglet ressemble trait pour trait à
   l'application. On lisait donc « Votre compte se crée dans l'application » DANS
   l'application, sans autre sortie que ?admin, qui n'est écrit nulle part.

   Rien ne se souvenait : l'événement `appinstalled` n'écrivait qu'une mesure. La
   question était reposée à zéro à chaque ouverture. Elle se pose désormais une fois. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

(async()=>{
// 1280 px : la largeur d'un Mac, celle où .desktop masque la vitrine.
const b=await chromium.launch(o); const p=await b.newPage({viewport:{width:1280,height:860}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render);

// Un onglet ordinaire : PAS de plein écran, donc pas de classe .standalone.
const onglet=(marque)=>p.evaluate((m)=>{const S=window.__S;
  document.body.classList.remove('standalone');
  try{ if(m)localStorage.setItem('ti_installee','1'); else localStorage.removeItem('ti_installee'); }catch(_){}
  S.lang='fr';S.legalView=null;S.showPitch=false;S.demoMode=false;S.onboarded=false;S.guest=false;
  S.account=null;S.persona='client';S.draft=null;S.authView='signup';S.onbStep=1;
  S.clientForm={name:'',email:'',zone:'Gustavia',password:'',password2:'',photo:''};
  window.__render();
  const v=document.getElementById('view');
  return {txt:(v?v.innerText:'').replace(/\s+/g,' ').trim(),
          gate:!!document.querySelector('[data-act="gate-back"]')};},marque);

console.log('\nA — le défaut : un onglet sur Mac, et la barrière tombe');
const sans=await onglet(false);
ok(sans.gate,'sans mémoire, on reçoit bien l’écran d’installation — « '+sans.txt.slice(0,52)+'… »');
ok(/compte se crée dans l/.test(sans.txt),'c’est `installGate()`, celui que l’éditeur a photographié');

console.log('\nB — la mémoire de l’installation lève la barrière');
const avec=await onglet(true);
ok(!avec.gate,'avec la marque, plus d’écran d’installation');
ok(!/compte se crée dans l/.test(avec.txt),'on atteint l’inscription — « '+avec.txt.slice(0,52)+'… »');

console.log('\nC — la marque n’est posée qu’aux instants où l’on SAIT');
ok(/window\.addEventListener\('appinstalled',function\(\)\{ try\{ noterInstallation\(\); \}catch\(_\)\{\} /.test(src),
  'à l’événement `appinstalled` — il se déclenche dans l’onglet où l’on vient d’accepter');
ok(/try\{ if\(appInstalled\(\)\)noterInstallation\(\); \}catch\(_\)\{\}/.test(src),
  'et à tout démarrage en plein écran');
ok(/function accountsHere\(\)\{ try\{ return appDejaInstallee\(\)\|\|_adminWebFlag; \}/.test(src),
  'la barrière lit la mémoire, pas la fenêtre du moment');

console.log('\nD — la MESURE, elle, n’est pas trompée');
ok(/if\(appInstalled\(\)\)trackFunnel\('installed'\)/.test(src),
  'l’entonnoir continue de lire l’affichage réel : il compte des installations, pas des souvenirs');
ok(!/appDejaInstallee\(\)\)trackFunnel/.test(src),
  'la mémoire ne franchit jamais la frontière de la mesure');

console.log('\nE — on DEMANDE au système, au lieu de déduire de la forme de la fenêtre');
// Mesuré chez l'éditeur : fenêtre d'application Chrome sur Mac, et la barrière tombait
// quand même. `display-mode` dit comment on est AFFICHÉ, pas si l'on est INSTALLÉ.
async function avecSysteme(reponse){
  const ctx=await b.newContext({viewport:{width:1280,height:860},locale:'fr-FR'});
  await ctx.addInitScript(([r])=>{
    navigator.getInstalledRelatedApps=()=>Promise.resolve(r?[{platform:'webapp',id:'ti'}]:[]);
  },[reponse]);
  const p2=await ctx.newPage();
  await p2.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
  await p2.waitForFunction(()=>window.__S&&window.__render);
  await p2.waitForTimeout(700);
  const r=await p2.evaluate(()=>{let m=null;try{m=localStorage.getItem('ti_installee');}catch(_){}
    return {marque:m};});
  await ctx.close(); return r;
}
ok((await avecSysteme(true)).marque==='1','Chrome répond « installée » → la marque est posée, sans plein écran');
ok((await avecSysteme(false)).marque!=='1','Chrome répond « non » → rien n’est écrit : on n’invente pas une installation');
ok(/related_applications/.test(fs.readFileSync(path.join(RACINE,'manifest.webmanifest'),'utf8')),
  'le manifeste se cite lui-même, sans quoi l’API ne peut rien reconnaître');
ok(/"url": "\.\/manifest\.webmanifest"/.test(fs.readFileSync(path.join(RACINE,'manifest.webmanifest'),'utf8')),
  'et il le fait par une adresse RELATIVE : elle tombe juste sur chaque hôte');

console.log('\nF — une porte sur le mur, et seulement sur ordinateur');
const porte=await p.evaluate(()=>{const S=window.__S;
  document.body.classList.remove('standalone');
  try{localStorage.removeItem('ti_installee');}catch(_){}
  S.account=null;S.onboarded=false;S.authView='signup';S.showPitch=false;S.legalView=null;
  window.__render();
  const a=document.querySelector('[data-act="gate-installee"]');
  return {la:!!a, texte:a?a.innerText.trim():''};});
ok(porte.la,'sur ordinateur, une sortie discrète existe — « '+porte.texte+' »');
await p.evaluate(()=>{document.querySelector('[data-act="gate-installee"]').click();});
await p.waitForTimeout(250);
const apres=await p.evaluate(()=>{let m=null;try{m=localStorage.getItem('ti_installee');}catch(_){}
  return {marque:m, gate:!!document.querySelector('[data-act="gate-back"]')};});
ok(!apres.gate,'elle lève la barrière sur-le-champ');
ok(apres.marque==='1','et durablement : on ne le redemandera pas à chaque ouverture');

const tel=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'fr-FR',
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'});
const pt=await tel.newPage();
await pt.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await pt.waitForFunction(()=>window.__S&&window.__render); await pt.waitForTimeout(300);
const surTel=await pt.evaluate(()=>{const S=window.__S;
  document.body.classList.remove('standalone');
  try{localStorage.removeItem('ti_installee');}catch(_){}
  S.account=null;S.onboarded=false;S.authView='signup';S.showPitch=false;S.legalView=null;
  window.__render();
  return {gate:!!document.querySelector('[data-act="gate-back"]'),
          porte:!!document.querySelector('[data-act="gate-installee"]')};});
ok(surTel.gate,'sur téléphone la barrière reste');
ok(!surTel.porte,'et SANS porte : là, sans installation il n’y a pas de notification, donc pas de mission vue');
await tel.close();

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
