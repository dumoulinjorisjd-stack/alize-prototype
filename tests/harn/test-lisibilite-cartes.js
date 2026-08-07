/* CE QUI EXPLIQUE NE DOIT PAS ÊTRE COUPÉ.
   Trois défauts de lisibilité qui touchaient tous les espaces à la fois :

   1. Les cartes repliables (console admin, Compte prestataire, Profil client) coupaient
      leur ligne d'explication à la première ligne : « Payées par le client, jamais
      inscrites au regis… ». Or cette ligne EST le contenu utile de la carte — le titre
      seul ne dit pas ce qu'on va trouver derrière. Elle respire maintenant sur deux
      lignes.
   2. L'icône d'un bandeau se faisait écraser à zéro dès que le texte dépassait deux
      lignes : il ne restait qu'un point gris et le bandeau perdait son signe.
   3. Espace conciergerie : le RIB — sans lequel RIEN n'est versé — était rangé APRÈS
      l'explication du mécanisme de rétribution. Ce qui attend un geste passe devant. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

(async()=>{
  const b=await chromium.launch(o);
  const ctx=await b.newContext({locale:'fr-FR',viewport:{width:428,height:1600}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);

  // ——— 1. Console admin · onglet Factures : les lignes d'explication en entier ———
  console.log('\nCONSOLE ADMIN — la ligne qui explique la carte reste lisible');
  const adm=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.onboarded=true;S.guest=false;S.lang='fr';S.demoMode=true;S.persona='admin';
    S.support=false;S.adminSupervise=false;S.generalSupport=false;
    S.admin=Object.assign({},S.admin||{},{view:'fact',art:null,cli:null,conc:null,fact:null});
    window.__render();
    const subs=[...document.querySelectorAll('.fold-head .fh-sub')].map(function(d){
      const cs=getComputedStyle(d);
      return {txt:(d.textContent||'').trim(), nowrap:(cs.whiteSpace==='nowrap'),
              lignes:Math.round(d.getBoundingClientRect().height/parseFloat(cs.lineHeight||'18'))};
    });
    // Le bord droit doit être tenu : pastille et chevron alignés d'une carte à l'autre.
    const bords=[...document.querySelectorAll('.fold-head .fh-end')].map(function(e){
      return Math.round(e.getBoundingClientRect().right);
    });
    return {subs:subs, bords:bords, texte:(document.querySelector('.phone')||document.body).innerText};
  });
  ok(adm.subs.length>=4,'l’onglet Factures présente bien ses cartes dépliantes ('+adm.subs.length+')');
  ok(adm.subs.every(function(s){return !s.nowrap;}),'aucune ligne d’explication n’est bloquée sur une seule ligne');
  ok(adm.subs.every(function(s){return !/…$/.test(s.txt);}),'aucune ne se termine par des points de suspension');
  ok(/jamais inscrites au registre/.test(adm.texte),'« Payées par le client, jamais inscrites au registre » se lit en entier');
  ok(/n’a pas reçu son net/.test(adm.texte),'« le prestataire n’a pas reçu son net » se lit en entier');
  ok(adm.subs.some(function(s){return s.lignes>1;}),'les plus longues occupent deux lignes au lieu d’être tronquées');
  ok(adm.subs.every(function(s){return s.lignes<=2;}),'aucune ne dépasse deux lignes — la carte reste une carte');
  ok(new Set(adm.bords).size===1,'pastilles et chevrons restent alignés sur un même bord droit');

  // ——— 2. L'icône d'un bandeau ne s'écrase jamais ———
  console.log('\nBANDEAUX — l’icône garde sa taille même sous un texte long');
  const ban=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.onboarded=true;S.lang='fr';S.demoMode=true;S.persona='concierge';
    S.concStatus='valide';S.concName='Villa Rose';S.concNav='retrib';
    S.concOrder=null;S.concView=null;S.concForm=null;S.concInvoice=null;S.concRetInv=false;S.concClientView=null;
    window.__render();
    return [...document.querySelectorAll('.banner>svg')].map(function(s){
      return Math.round(s.getBoundingClientRect().width);
    });
  });
  ok(ban.length>0,'la page rétribution porte bien un bandeau à icône');
  ok(ban.every(function(w){return w>=14;}),'l’icône fait sa taille pleine, pas un point ('+ban.join(', ')+' px)');

  // ——— 3. Conciergerie : le RIB avant l'explication ———
  console.log('\nCONCIERGERIE — ce qui attend un geste passe devant');
  const conc=await p.evaluate(()=>{
    const t=(document.querySelector('.phone')||document.body).innerText;
    const rib=t.indexOf('Pour être payé');
    const expl=t.indexOf('Vous êtes rémunéré par Ti-Services');
    const detail=t.indexOf('DÉTAIL DES PRESTATIONS');
    const badge=!!document.querySelector('.card .benic');
    return {rib:rib, expl:expl, detail:detail, badge:badge, t:t};
  });
  ok(conc.rib>0&&conc.expl>0,'les deux blocs sont bien présents');
  ok(conc.rib<conc.expl,'le RIB — sans lui rien n’est versé — passe avant l’explication du mécanisme');
  ok(conc.expl<conc.detail,'l’explication descend juste au-dessus du détail des prestations');
  ok(conc.badge,'la carte RIB porte la pastille d’icône de la charte');
  ok(!/\(mensuelle\)/.test(conc.t),'le bouton de facture tient sur une ligne — « (mensuelle) » retiré');

  // ——— 4. Rien n'a cassé ailleurs : le Compte prestataire tient toujours ———
  console.log('\nCOMPTE PRESTATAIRE — la même charte, sans rien perdre');
  const pro=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.persona='pro';S.proNav='account';S.demoMode=false;S.onboarded=true;
    S.proStatus='approved';S.proName='Laure G.';S.proCats=['menage','colis'];
    S.proMollieOrgId='org_1';S.proMollie='active';S.proMollieStatus='active';S.proMollieOnb='completed';
    S.proInsured=true;S.proInsuranceStatus='valide';S.proSiret='90212345600017';S.proLegal='Laure Guyon EI';
    window.__render();
    const bords=[...document.querySelectorAll('.fold-head .fh-end')].map(function(e){
      return Math.round(e.getBoundingClientRect().right);
    });
    return {bords:bords, texte:(document.querySelector('.phone')||document.body).innerText};
  });
  ok(/Mes informations d'inscription/.test(pro.texte),'« Mes informations d’inscription » est toujours là');
  ok(/Recevoir mes paiements/.test(pro.texte),'« Recevoir mes paiements » est toujours là');
  ok(pro.bords.length>0&&new Set(pro.bords).size===1,'le bord droit reste tenu ici aussi');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
