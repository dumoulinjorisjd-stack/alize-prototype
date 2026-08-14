/* SIGNALER ET BLOQUER SONT DEUX GESTES DIFFÉRENTS.
   Apple l'exige pour toute application qui laisse ses utilisateurs produire du contenu,
   et Ti-Services en produit : messagerie client↔prestataire, photos jointes à une
   demande, présentation d'un prestataire. L'application n'avait ni l'un ni l'autre —
   « Signaler un problème » existait, mais il ouvre un litige sur la PRESTATION.

   Ce que ce test tient :
     · les deux gestes sont accessibles depuis la conversation, là où le problème naît ;
     · signaler ne bloque pas, bloquer ne signale pas — aucune confusion des deux ;
     · bloquer ferme la conversation ET retire la personne des mises en relation
       futures, dans les DEUX sens (celui qui bloque et celui qui est bloqué) ;
     · bloquer n'annule pas la prestation en cours — sinon il suffirait de bloquer son
       prestataire à la fin du chantier pour ne pas le payer ;
     · le blocage se défait. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

const MISSION={_id:'m1',reqId:'r1',svc:'menage',svcName:'Ménage',status:'accepted',when:'Aujourd’hui',
  slot:'14:00',duration:3,unit:'h',rate:35,zone:'Gustavia',chat:[],support:{client:[]},
  clientAccepted:true,proAccepted:true,accepted:true,clientUid:'c1',providerUid:'p1',
  providerPhone:'+590690445566',provider:{nm:'Laure G.',ini:'LG'}};

(async()=>{
  const b=await chromium.launch(o);
  const p=await (await b.newContext({locale:'fr-FR',viewport:{width:428,height:1600}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);

  const rendre=(cfg)=>p.evaluate((e)=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=false;S.persona=e.persona||'client';
    S.account={name:'Joris',email:'j@e.fr',zone:'Gustavia'};
    const m=JSON.parse(JSON.stringify(e.mission));
    S.missions=[m];S.mission=m;S.clientNav='wallet';S.proNav='home';
    S.chat=!!e.chat;S.report=e.report||null;S.blockedView=!!e.blockedView;S.blockAsk=!!e.blockAsk;
    S.blocked=(e.blocked||[]).slice();S.blockNoms={p1:'Laure G.',c1:'Joris'};
    window.__render();
    const racine=document.querySelector('.phone')||document.body;
    const q=function(s){return racine.querySelector(s);};
    return {
      texte:(racine.innerText||'').replace(/\s+/g,' '),
      signaler:!!q('[data-act="report-open"]'),
      bloquer:!!q('[data-act="block-ask"]'),
      debloquer:!!racine.querySelector('[data-act^="unblock:"]'),
      saisie:!!q('#chatInput'),
      envoyer:!!q('[data-act="chat-send"]'),
      support:!!q('[data-act="open-support"]'),
      confirmer:!!q('[data-act="block-confirm"]'),
      motifs:racine.querySelectorAll('[data-act^="report-motif:"]').length,
      envoiPret:!!(q('[data-act="report-send"]')&&!q('[data-act="report-send"]').disabled),
    };
  },cfg);

  console.log('\nA — les deux gestes existent, et là où le problème se produit');
  const chat=await rendre({chat:true,mission:MISSION});
  ok(chat.signaler,'« Signaler » est accessible depuis la conversation');
  ok(chat.bloquer,'« Bloquer » aussi');
  ok(chat.saisie&&chat.envoyer,'et la conversation fonctionne normalement');
  ok(chat.support,'le support reste distinct des deux — trois recours, trois rangs');

  console.log('\nB — signaler n’est pas bloquer');
  const rep=await rendre({report:{motif:'',texte:'',uid:'p1',nom:'Laure G.',reqId:'r1'},mission:MISSION});
  ok(rep.motifs===6,'six motifs proposés, liste fermée ('+rep.motifs+')');
  ok(!rep.envoiPret,'sans motif choisi, l’envoi reste fermé');
  ok(/Rien n'est communiqué à la personne signalée/.test(rep.texte),
    'et l’écran dit ce que le signalement fait — et ne fait pas');
  const repPret=await rendre({report:{motif:'offensant',texte:'',uid:'p1',nom:'Laure G.',reqId:'r1'},mission:MISSION});
  ok(repPret.envoiPret,'un motif suffit pour envoyer');
  const repAutre=await rendre({report:{motif:'autre',texte:'',uid:'p1',nom:'Laure G.',reqId:'r1'},mission:MISSION});
  ok(!repAutre.envoiPret,'sauf « Autre », qui exige une description');

  console.log('\nC — la confirmation dit la vérité sur ce que bloquer fait');
  const ask=await rendre({chat:true,blockAsk:true,mission:MISSION});
  ok(ask.confirmer,'la confirmation demande un second geste');
  ok(/La prestation en cours n'est pas annulée/.test(ask.texte),
    'elle prévient que la prestation en cours n’est PAS annulée');
  ok(/débloquer à tout moment/.test(ask.texte),'et que le blocage se défait');

  console.log('\nD — une fois bloqué, la conversation se ferme');
  const bloq=await rendre({chat:true,blocked:['p1'],mission:MISSION});
  ok(!bloq.saisie&&!bloq.envoyer,'plus de champ de saisie ni de bouton Envoyer');
  ok(bloq.debloquer,'un bouton « Débloquer » prend leur place');
  ok(bloq.support,'le support reste joignable — bloquer quelqu’un n’isole pas du support');
  ok(/vous ne serez plus mis en relation/i.test(bloq.texte),'l’écran dit l’effet réel du blocage');

  console.log('\nE — la liste des bloqués, et la sortie');
  const liste=await rendre({blockedView:true,blocked:['p1'],mission:MISSION});
  ok(/Personnes bloquées/.test(liste.texte),'la liste existe');
  ok(liste.debloquer,'chaque ligne se débloque');
  const vide=await rendre({blockedView:true,blocked:[],mission:MISSION});
  ok(/n’avez bloqué personne|n'avez bloqué personne/.test(vide.texte),
    'et vide, elle le dit plutôt que d’afficher une page blanche');

  console.log('\nF — le blocage retire des mises en relation, dans les deux sens');
  const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
  ok(/if\(estBloque\(r\.clientUid\)\)return;/.test(src),
    'le prestataire ne voit plus les demandes d’un client qu’il a bloqué');
  ok(/r\.blockedUids\.indexOf\(myUid\)>=0\)return;/.test(src),
    'et il ne voit plus celles d’un client qui l’a bloqué, lui');
  ok(/blockedUids:blockedList\(\)/.test(src),
    'la demande porte la liste du client, sinon le second filtre serait aveugle');
  ok(/if\(estBloque\(list\[i\]\.uid\)\)list\.splice\(i,1\);/.test(src),
    'un prestataire bloqué disparaît aussi du choix « Votre prestataire »');

  console.log('\nG — côté serveur, le blocage n’est pas qu’un affichage');
  const fn=fs.readFileSync(path.join(RACINE,'functions','index.js'),'utf8');
  ok(/async function userPushTokens\(db, uid, senderUid\)/.test(fn),
    'l’envoi de notification connaît l’expéditeur');
  ok(/u\.blocked\.indexOf\(senderUid\) >= 0/.test(fn),
    'et se tait si le destinataire a bloqué cet expéditeur');
  ok(/exports\.reportContent = onCall/.test(fn),'le signalement passe par une fonction serveur');
  ok(/throw new HttpsError\('unauthenticated'/.test(fn.slice(fn.indexOf('exports.reportContent'))),
    'qui exige une session — personne ne signale au nom d’un autre');
  ok(/escHtmlS\(texte\)/.test(fn),'et qui échappe le texte avant de l’envoyer par courriel');

  console.log('\nH — la prestation en cours survit au blocage');
  ok(!/block-confirm[^]{0,400}cancelActiveRequest|block-confirm[^]{0,400}removeMission/.test(src),
    'bloquer ne déclenche aucune annulation de mission');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
