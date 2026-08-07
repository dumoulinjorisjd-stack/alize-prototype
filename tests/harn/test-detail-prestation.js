/* REVOIR UNE PRESTATION TERMINÉE. Une fois réglée, une prestation ne laissait qu'une
   facture : toute la carte était un bouton qui téléchargeait le PDF, où qu'on appuie.
   Adresse, horaire, durée facturée, état du règlement — plus rien n'était consultable,
   ni côté client ni côté prestataire. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const INDEX='file://'+path.join(RACINE,'tests','harn','app.html');
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

console.log('A — la carte n’est plus un bouton « facture » géant');
ok(/data-act="histdet:\$\{i\}"/.test(src),'le corps de la carte client ouvre le détail');
ok(/data-act="histinv:\$\{i\}" style="margin-top:11px/.test(src),'et la facture a son propre bouton');
ok(/data-act="prohistdet:/.test(src),'le prestataire a aussi un bouton Détail');

(async()=>{
  const b=await chromium.launch(o);
  const ctx=await b.newContext({locale:'fr-FR',viewport:{width:390,height:1400}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto(INDEX,{waitUntil:'load'}); await p.waitForTimeout(1300);

  console.log('B — côté client');
  const cli=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.onboarded=true;S.guest=false;S.persona='client';S.lang='fr';S.demoMode=false;S.clientNav='wallet';
    S.account={name:'Joris',email:'j@e.fr',zone:'Gustavia',phone:'+590690112233'};
    S.mission=null;S.missions=[];S.histCat='colis';S.detail=null;
    S.history=[{reqId:'r9',svc:'colis',svcName:'Colis & courrier',status:'paid',when:'Aujourd’hui',
      dateISO:'2026-08-06',zone:'Gustavia',unit:'forfait',duration:1,rate:20,boost:0,tip:2,
      address:'Villa Bleue, Pointe Milou',geo:{lat:17.9,lng:-62.84},access:'Portail bleu, code 2468',
      invNo:'2026-0044',provider:{nm:'Laureguyon',ini:'L'}}];
    window.__render();
    const q=(s)=>document.querySelector(s);
    return {corps:!!q('[data-act="histdet:0"]'),fact:!!q('[data-act="histinv:0"]'),
      txt:(q('.phone')||document.body).innerText.replace(/\s+/g,' ')};
  });
  ok(cli.corps,'la carte expose l’action « détail »');
  ok(cli.fact,'et un bouton facture distinct');
  ok(/Voir le détail/.test(cli.txt),'le libellé annonce le détail, plus la facture');

  const det=await p.evaluate(()=>{
    document.querySelector('[data-act="histdet:0"]').click();
    return {txt:(document.querySelector('.phone')||document.body).innerText.replace(/\s+/g,' '),
      large:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1};
  });
  ok(/Villa Bleue, Pointe Milou/.test(det.txt),'l’adresse d’intervention est visible — elle ne l’était nulle part');
  ok(/Portail bleu/.test(det.txt),'les infos d’accès aussi');
  ok(/Point GPS/.test(det.txt),'le point GPS est signalé');
  ok(/2026-0044/.test(det.txt),'le numéro de facture est rappelé');
  ok(/Laureguyon/.test(det.txt),'le prestataire est nommé');
  ok(/pourboire/i.test(det.txt),'le pourboire apparaît dans le montant');
  ok(det.large,'rien ne déborde sur un écran d’iPhone');

  console.log('C — l’écran ne prétend pas que l’argent est encaissé');
  ok(!/Encaissé/.test(det.txt),
    'sans confirmation du serveur, aucun « encaissé » affiché — c’est l’argent qui fait foi, pas l’écran');

  console.log('D — retour');
  const back=await p.evaluate(()=>{document.querySelector('[data-act="close-detail"]').click();
    return (document.querySelector('.phone')||document.body).innerText.replace(/\s+/g,' ');});
  ok(/Voir le détail/.test(back),'le retour ramène à la liste');

  console.log('E — côté prestataire');
  const pro=await p.evaluate(()=>{
    const S=window.__S;
    S.persona='pro';S.proNav='earnings';S.proStatus='approved';S.proName='Laure G.';S.detail=null;S.mission=null;S.interv=true;S.invClient='Joris D.';
    S.proHistory=[{id:'hm1',reqId:'r9',dateISO:'2026-08-06',svc:'colis',client:'Joris D.',clientFull:'Joris D.',
      clientZone:'Gustavia',duration:1,unit:'forfait',travel:0,tip:2,rate:20,amount:7,commPct:10,commission:0.5,
      net:6.5,invNo:'2026-0044',paidVia:'carte'}];
    window.__render();
    const btn=document.querySelector('[data-act^="prohistdet:"]');
    if(!btn)return {absent:true};
    btn.click();
    return {txt:(document.querySelector('.phone')||document.body).innerText.replace(/\s+/g,' ')};
  });
  ok(!pro.absent,'le bouton Détail existe sur la carte du prestataire');
  ok(pro.txt&&/Joris D\./.test(pro.txt),'il voit le client');
  ok(pro.txt&&/Vous percevez|Vous avez perçu/.test(pro.txt),'et ce qu’il touche');
  ok(pro.txt&&!/%/.test(pro.txt),'aucun pourcentage de commission ne s’affiche à l’artisan');
  ok(pro.txt&&/vous est due/.test(pro.txt),
    'tant que Mollie n’a pas routé, on dit « due », jamais « payé »');

  const vrais=errs.filter(e=>!/net::|Failed to load|firebase|ERR_FAILED/i.test(e));
  ok(vrais.length===0,'aucune erreur JS ('+vrais.join(' | ').slice(0,160)+')');
  await b.close();
  console.log(f?'\n'+f+' ÉCHEC(S)':'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
