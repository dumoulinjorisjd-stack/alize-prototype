/* « SAUVEGARDE DES FACTURES » PARLAIT COMPTABILITÉ À DES CLIENTS — ET NE MARCHAIT PAS.

   La carte est partagée entre le client, le prestataire et la conciergerie. Elle testait
   `S.proHistory` POUR TOUT LE MONDE : un client qui a dix factures a cet historique VIDE,
   donc la carte lui annonçait « dès vos premières missions, vous pourrez… » indéfiniment
   et le bouton de téléchargement n'apparaissait JAMAIS — alors que l'export, lui, sait
   parfaitement produire ses factures (`myBackupData` a une branche client).

   On demande donc à l'export LUI-MÊME s'il a quelque chose à rendre : une seule source de
   vérité, et le cas de la conciergerie se règle du même coup.

   ET LE VOCABULAIRE SUIT. Un client n'a pas de comptabilité : il a des factures. Ni
   « données comptables », ni « conservation de vos justificatifs », ni surtout une pastille
   corail « À faire » — un prestataire a une obligation mensuelle, un client n'a rien à
   tenir : lui annoncer un retard, c'est inventer une dette. */
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
const cas=(pe,av)=>p.evaluate(([pe,av])=>{const S=window.__S;
  document.body.classList.add('standalone');S.lang='fr';S.onboarded=true;S.demoMode=false;
  S.account={name:'C',email:'c@e.fr',zone:'Gustavia'};S.mission=null;S._fold={backup:true};
  S.history=[];S.proHistory=[];
  const h={id:'h1',reqId:'r1',dateISO:'2026-09-01',svc:'menage',svcName:'Menage',rate:35,
    duration:3,unit:'h',invNo:'FA-1',provider:{nm:'Paul'},clientFull:'Villa Rose',tip:0};
  if(av){ if(pe==='pro')S.proHistory=[h]; else S.history=[h]; }
  if(pe==='pro'){S.persona='pro';S.proNav='account';S.proStatus='approved';
    S.proMollie='active';S.proMollieCanWork=true;S.proInsured=true;}
  else {S.persona='client';S.clientNav='profile';}
  window.__render();
  const c=[...document.querySelectorAll('.fold-head')].find(x=>/Sauvegarde des factures/.test(x.textContent||''));
  const corps=c?c.parentElement:null,txt=corps?corps.innerText:'';
  const m=(c?c.innerText:'').match(/À faire|À jour/);
  return {carte:!!c, bouton:!!(corps&&corps.querySelector('[data-act="download-backup"]')),
    pastille:m?m[0]:'', compta:/données comptables/.test(txt),
    justif:/conservation de vos justificatifs/.test(txt), txt:txt};},[pe,av]);

console.log('\nA — un client qui a des factures peut enfin les télécharger');
const cSans=await cas('client',false), cAvec=await cas('client',true);
ok(cSans.carte&&cAvec.carte,'la carte est bien offerte au client');
ok(!cSans.bouton,'sans réservation, rien à télécharger — et on le dit sans promettre');
ok(cAvec.bouton,
  'AVEC une facture, le bouton paraît — il ne paraissait JAMAIS, la carte lisant l’historique du PRESTATAIRE');
ok(/const _bk=myBackupData\(\);/.test(src)&&/const hasData=!!\(_bk&&_bk\.rows&&_bk\.rows\.length>1\)/.test(src),
  'la carte demande à l’export s’il a quelque chose : une seule source, la conciergerie comprise');
ok(!/const hasData=\(S\.proHistory\|\|\[\]\)\.length>0;/.test(src),
  'elle n’interroge plus l’historique du prestataire pour tout le monde');

console.log('\nB — on ne parle plus comptabilité à un client');
ok(!cSans.compta&&!cAvec.compta,'« données comptables » a disparu de son écran');
ok(!cAvec.justif,'« conservation de vos justificatifs » aussi — c’est une obligation de professionnel');
ok(/Dès votre première réservation/.test(cSans.txt),'il lit « réservation » et non « missions »');
ok(/une copie de vos factures, à conserver de votre côté/.test(cAvec.txt),'et on lui dit simplement ce qu’il obtient');

console.log('\nC — aucune pastille de retard chez qui n’a rien à tenir');
ok(cAvec.pastille===''&&cSans.pastille==='',
  'pas de « À faire » corail chez le client : il n’a aucune échéance, lui en annoncer une invente une dette');
ok(/const due=_pro&&hasData&&backupDue\(\);/.test(src),'l’échéance est réservée au prestataire');

console.log('\nD — rien ne change pour le prestataire');
const pSans=await cas('pro',false), pAvec=await cas('pro',true);
ok(!pSans.bouton&&pAvec.bouton,'son bouton suit toujours ses missions');
ok(pSans.compta&&pAvec.compta,'son vocabulaire comptable est conservé — lui en a une');
ok(pAvec.justif,'et le rappel sur la conservation de ses justificatifs aussi');
ok(pAvec.pastille==='À faire','sa pastille d’échéance mensuelle reste');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
