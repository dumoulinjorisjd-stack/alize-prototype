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

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
