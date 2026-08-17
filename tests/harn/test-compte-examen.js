/* L'EXAMINATEUR DOIT POUVOIR ATTEINDRE CE QU'ON LUI DEMANDE DE VÉRIFIER.
   Apple exige de voir « Signaler » et « Bloquer ». Or les deux vivent dans la
   conversation, la conversation vit dans une prestation acceptée, et une prestation
   acceptée suppose une autorisation de carte PUIS un vrai prestataire qui accepte.
   Un examinateur n'obtient ni l'une ni l'autre : il ouvrait « Mes réservations » sur
   du vide et ne trouvait nulle part les deux mécanismes décrits dans la réponse.

   Ce test tient le bac à sable des comptes d'examen :
     · une prestation est déjà en cours à la connexion, avec sa conversation ;
     · commander depuis un compte d'examen n'écrit RIEN et ne paie RIEN ;
     · la prestation de démonstration porte un prestataire identifié — sans quoi
       « Bloquer » n'aurait aucune cible et le bouton serait décoratif ;
     · rien de tout cela ne s'applique à un vrai compte. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

(async()=>{
  const b=await chromium.launch(o);
  const p=await (await b.newContext({locale:'fr-FR',viewport:{width:428,height:1400}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);

  console.log('\nA — une prestation acceptée par le prestataire de démonstration');
  const acc=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=false;S.persona='client';S.clientNav='wallet';
    S.account={name:'Examen',email:'demo.client@ti-services.fr',zone:'Gustavia'};
    S.blocked=[];S.blockNoms={};S.chat=false;S.report=null;S.blockedView=false;S.blockAsk=false;
    const m=window.__newMission({id:'menage',nm:'Ménage',rate:35});
    m._id='mx';m._demoExamen=true;
    window.__demo.accepte(m);
    S.missions=[m];S.mission=m;S.chat=true;window.__render();
    const racine=document.querySelector('.phone')||document.body;
    return {
      statut:m.status, reqId:m.reqId||null, prestataire:m.providerUid||'',
      nom:(m.provider&&m.provider.nm)||'', messages:(m.chat||[]).length,
      signaler:!!racine.querySelector('[data-act="report-open"]'),
      bloquer:!!racine.querySelector('[data-act="block-ask"]'),
      saisie:!!racine.querySelector('#chatInput'),
    };
  });
  ok(acc.statut==='accepted','la prestation passe en « acceptée » ('+acc.statut+')');
  ok(!acc.reqId,'elle ne porte AUCUN identifiant de demande — donc rien n’a été écrit');
  ok(!!acc.prestataire,'un prestataire est identifié ('+acc.prestataire+')');
  ok(acc.nom==='Laure G.','il a un nom affichable ('+acc.nom+')');
  ok(acc.messages>0,'la conversation n’est pas vide ('+acc.messages+' message(s))');
  ok(acc.signaler&&acc.bloquer,'« Signaler » et « Bloquer » sont atteignables depuis cette conversation');
  ok(acc.saisie,'et l’examinateur peut répondre comme un vrai client');

  console.log('\nB — écrire dans cette conversation ne sort pas de l’appareil');
  const local=await p.evaluate(()=>{
    const S=window.__S;
    const avant=S.mission.chat.length;
    const el=document.getElementById('chatInput');
    el.value='Bonjour, test examen';
    document.querySelector('[data-act="chat-send"]').click();
    return {avant:avant, apres:S.mission.chat.length, reqId:S.mission.reqId||null};
  });
  ok(local.apres===local.avant+1,'le message s’affiche bien');
  ok(!local.reqId,'et la prestation reste sans identifiant : aucune écriture Firestore possible');

  console.log('\nC — un vrai compte n’entre jamais dans ce bac à sable');
  const vrai=await p.evaluate(()=>{
    const S=window.__S;
    S.account={name:'Vrai',email:'joris@exemple.fr',zone:'Gustavia'};
    const a=window.__demo.estExamen();
    S.account={name:'Examen',email:'demo.client@ti-services.fr',zone:'Gustavia'};
    return {vrai:a, demoHorsProd:window.__demo.estExamen()};
  });
  ok(vrai.vrai===false,'une adresse quelconque n’est pas un compte d’examen');
  ok(vrai.demoHorsProd===false,'et hors du domaine de production, même l’adresse d’examen ne l’est pas');

  console.log('\nD — le code, là où la lecture d’écran ne suffit pas');
  const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
  ok(/function payReal\(\)\{try\{return isProdHost\(\)&&!isDemo\(\)&&!isReviewDemo\(\)/.test(src),
    'aucun paiement réel ne peut partir d’un compte d’examen');
  const pm=src.slice(src.indexOf('function placeMission()'));
  const iDemo=pm.indexOf('if(isReviewDemo()){'), iPersist=pm.indexOf('persistRequest(');
  ok(iDemo>=0&&iDemo<iPersist,
    'la commande d’un compte d’examen sort AVANT toute écriture de demande');
  ok(/loadActiveRequests\(user\.uid\);\s*\n\s*seedReviewDemo\(\);/.test(src),
    'la prestation de démonstration est semée à la connexion du client');
  ok(/IS_PROD&&REVIEW_DEMO_EMAILS\.indexOf\(em\)>=0/.test(src),
    'et le bac à sable est réservé au domaine de production');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
