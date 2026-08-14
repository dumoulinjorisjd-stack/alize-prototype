/* AUCUNE PHRASE À MOITIÉ TRADUITE.
   Le traducteur remplace des nœuds de texte ENTIERS. Quand une phrase n'est pas
   enregistrée mais qu'un mot à l'intérieur l'est (parce qu'un <b> coupe le nœud en
   trois), l'écran affiche « Chaque client autorise sa card once ». Ce n'est pas
   « pas encore traduit », c'est cassé.

   Ce test rend les dix écrans principaux en français, relève chaque nœud de texte et
   demande au dictionnaire s'il sait le rendre. Tout ce qui reste français en EN ou en
   PT est un défaut — sauf les noms propres et les marques, listés ci-dessous. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

// Données de démonstration et marques : rien à traduire.
const HORS=/^(Joris Dumoulin|Joris|Laure G\.|Laure Guyon EI|Villa Rose|Sophie B\.|JD|LG|CG|TS|SB|Ti|-Services|Ti-Services|FR76 \.\.\.|Gustavia · Saint-Barth|Gustavia|Lorient|Bronze|Argent|Platine|Mollie|Google|Apple|Planity|WhatsApp|Visa|Mastercard|AXA|Google · Apple|IBAN|SIRET|FR|EN|PT|PRO|Laure|Laure G\.|LG)$/;
const ATRADUIRE=(t)=>{
  if(t.length<2)return false;
  if(!/[A-Za-zÀ-ÿ]/.test(t))return false;
  if(/^[\d\s.,€%×+\-–—·:/]+$/.test(t))return false;
  return !HORS.test(t);
};
const ECRANS=[
  ['client','home'],['client','wallet'],['client','profile'],
  ['pro','home'],['pro','agenda'],['pro','earnings'],['pro','account'],
  ['concierge','home'],['concierge','clients'],['concierge','retrib'],
];
// Écrans qui vivent par-dessus un onglet (messagerie, signalement, personnes bloquées).
// Sans eux, la couverture s'arrêtait aux onglets — et les écrans les plus récents, donc
// les plus exposés à l'oubli, n'étaient gardés par rien.
const SURCOUCHES=['chat','chat-bloque','chat-confirme','signalement','bloques'];

(async()=>{
  const b=await chromium.launch(o);
  const p=await (await b.newContext({locale:'fr-FR',viewport:{width:428,height:2200}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps|tile/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1400);

  const releve=(cfg)=>p.evaluate((e)=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=false;S.mission=null;S.detail=null;S.draft=null;
    S.account={name:'Joris Dumoulin',email:'j@e.fr',zone:'Gustavia',phone:'+590690112233'};
    S.card={brand:'Visa',last4:'6508',exp:'08/28'};S.missions=[];S.history=[];
    S.proStatus='approved';S.proName='Laure G.';S.proCats=['menage','colis'];S.proNotifPush=true;S.proOnline=true;
    S.proMollieOrgId='org_1';S.proMollie='active';S.proMollieStatus='active';S.proMollieOnb='completed';S.proMollieCanWork=true;
    S.proInsured=true;S.proInsuranceStatus='valide';S.proSiret='90212345600017';S.proLegal='Laure Guyon EI';
    S.proRate=35;S.proStatusType='micro';S.proJobsTotal=12;S.proHistory=[];
    S.concStatus='valide';S.concName='Villa Rose';S.concOrder=null;S.concView=null;S.concForm=null;
    S.concInvoice=null;S.concRetInv=false;S.concClientView=null;
    S.persona=e.persona;
    if(e.persona==='client')S.clientNav=e.nav;
    if(e.persona==='pro')S.proNav=e.nav;
    if(e.persona==='concierge')S.concNav=e.nav;
    window.__render();
    const racine=document.querySelector('.phone')||document.body;
    const w=document.createTreeWalker(racine,NodeFilter.SHOW_TEXT,null);
    const out=[];let n;
    while(n=w.nextNode()){
      const pa=n.parentNode; if(pa&&/^(SCRIPT|STYLE|TEXTAREA)$/.test(pa.nodeName))continue;
      const t=(n.nodeValue||'').trim(); if(!t)continue;
      // « Connu » = le dictionnaire a la clé, OU une règle de forme la reconnaît. Une
      // traduction identique au français (Massage, Documents, Agenda en portugais…) est
      // une vraie traduction : c'est l'ABSENCE d'entrée qui est un défaut.
      out.push({t:t,
        en:(!!window.__dict('en')[t])||window.__tr(t,'en').trim()!==t,
        pt:(!!window.__dict('pt')[t])||window.__tr(t,'pt').trim()!==t});
    }
    return out;
  },cfg);

  // Les surcouches se rendent depuis une mission en cours, avec l'autre partie identifiée
  // (sans uid, ni « Bloquer » ni « Signaler » n'ont de cible et l'écran serait creux).
  const releveSurcouche=(k)=>p.evaluate((e)=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=false;S.persona='client';S.clientNav='wallet';
    S.account={name:'Joris',email:'j@e.fr',zone:'Gustavia'};
    const m={_id:'m1',reqId:'r1',svc:'menage',svcName:'Ménage',status:'accepted',when:'Aujourd’hui',
      slot:'14:00',duration:3,unit:'h',rate:35,zone:'Gustavia',chat:[],support:{client:[]},
      clientAccepted:true,proAccepted:true,accepted:true,clientUid:'c1',providerUid:'p1',
      providerPhone:'+590690445566',provider:{nm:'Laure G.',ini:'LG'}};
    S.missions=[m];S.mission=m;
    S.chat=false;S.report=null;S.blockedView=false;S.blockAsk=false;S.blocked=[];S.blockNoms={p1:'Laure G.'};
    if(e.k==='chat')S.chat=true;
    if(e.k==='chat-bloque'){S.chat=true;S.blocked=['p1'];}
    if(e.k==='chat-confirme'){S.chat=true;S.blockAsk=true;}
    if(e.k==='signalement')S.report={motif:'autre',texte:'',uid:'p1',nom:'Laure G.',reqId:'r1'};
    if(e.k==='bloques'){S.blockedView=true;S.blocked=['p1'];}
    window.__render();
    const racine=document.querySelector('.phone')||document.body;
    const w=document.createTreeWalker(racine,NodeFilter.SHOW_TEXT,null);
    const out=[];let n;
    while(n=w.nextNode()){
      const pa=n.parentNode; if(pa&&/^(SCRIPT|STYLE|TEXTAREA)$/.test(pa.nodeName))continue;
      const t=(n.nodeValue||'').trim(); if(!t)continue;
      out.push({t:t,
        en:(!!window.__dict('en')[t])||window.__tr(t,'en').trim()!==t,
        pt:(!!window.__dict('pt')[t])||window.__tr(t,'pt').trim()!==t});
    }
    return out;
  },{k});

  const restentEN=[], restentPT=[];
  for(const [persona,nav] of ECRANS){
    for(const x of await releve({persona,nav})){
      if(!ATRADUIRE(x.t))continue;
      if(!x.en)restentEN.push(persona+'/'+nav+' · '+x.t.slice(0,70));
      if(!x.pt)restentPT.push(persona+'/'+nav+' · '+x.t.slice(0,70));
    }
  }
  for(const k of SURCOUCHES){
    for(const x of await releveSurcouche(k)){
      if(!ATRADUIRE(x.t))continue;
      if(!x.en)restentEN.push(k+' · '+x.t.slice(0,70));
      if(!x.pt)restentPT.push(k+' · '+x.t.slice(0,70));
    }
  }

  console.log('\nCOUVERTURE — quinze écrans, trois langues');
  ok(restentEN.length===0,'aucun texte français ne subsiste en anglais'+(restentEN.length?'\n      '+restentEN.slice(0,12).join('\n      '):''));
  ok(restentPT.length===0,'aucun texte français ne subsiste en portugais'+(restentPT.length?'\n      '+restentPT.slice(0,12).join('\n      '):''));

  console.log('\nPHRASES COUPÉES PAR UN <b> — les trois morceaux doivent tomber ensemble');
  const phrase=await p.evaluate(()=>{
    // Les surcouches rendues juste avant laissent leur état : sans ce nettoyage, le
    // routeur afficherait « Personnes bloquées » au lieu de l'écran conciergerie.
    const S=window.__S;S.chat=false;S.report=null;S.blockedView=false;S.blockAsk=false;S.mission=null;
    S.persona='concierge';S.concNav='clients';S.lang='en';window.__render();
    const t=(document.querySelector('.phone')||document.body).innerText;
    S.lang='pt';window.__render();
    const t2=(document.querySelector('.phone')||document.body).innerText;
    S.lang='fr';window.__render();
    return {en:t,pt:t2};
  });
  ok(!/autorise/.test(phrase.en),'la phrase de la carte client ne garde aucun mot français en anglais');
  ok(!/autorise sa card|autorise sa cartão/.test(phrase.en+phrase.pt),'plus de phrase mi-française mi-étrangère');
  ok(/authorizes their card/.test(phrase.en),'elle se lit entièrement en anglais');
  ok(/autoriza o seu cartão/.test(phrase.pt),'elle se lit entièrement en portugais');

  console.log('\nCHAÎNES COMPOSÉES — le nombre change, la phrase doit suivre');
  const comp=await p.evaluate(()=>({
    net:window.__tr('Net perçu · août 2026','en'),
    tot:window.__tr('12 missions au total ›','en'),
    taux:window.__tr("Taux d'apport : 8 % · versé par Ti-Services en fin de mois",'en'),
    metiers:window.__tr('Ménage · Colis & courrier','en'),
    inconnu:window.__tr('Gustavia · Saint-Barth','en'),
    profil:window.__tr('Mon profil · Gustavia','en'),
  }));
  ok(comp.net==='Net earned · August 2026','le mois se traduit dans « Net perçu · … » ('+comp.net+')');
  ok(comp.tot==='12 jobs in total ›','le compteur de missions se traduit ('+comp.tot+')');
  ok(/^Referral rate: 8 %/.test(comp.taux),'le taux d’apport se traduit ('+comp.taux+')');
  ok(comp.metiers==='Cleaning · Parcels & mail','une liste de métiers se traduit entièrement');
  ok(comp.inconnu==='Gustavia · Saint-Barth','une liste dont une partie est inconnue reste EN FRANÇAIS — jamais à moitié');
  ok(comp.profil==='My profile · Gustavia','le secteur reste tel quel dans « Mon profil · … »');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
