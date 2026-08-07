/* QUATRE BLOCS AVANT LA PREMIÈRE MISSION.
   Sur « Mes missions », le prestataire traversait : carte notifications, carte dossier
   de paiement, bandeau d'ouverture au 1er octobre, interrupteur en ligne — puis
   seulement ses missions. Aucun de ces blocs n'était faux ; c'est leur ORDRE qui l'était.
   Règle appliquée : CE QUI ATTEND UN GESTE passe devant, ce qui n'attend rien descend.
   Nuance essentielle : trois de ces blocs sont là POUR RÂLER et s'effacent tout seuls une
   fois la chose faite — notifCTA disparaît dès les notifications activées, la carte
   Mollie dès le dossier actif. Les enterrer sous les missions leur retirerait ce qui
   fait leur utilité : ces gestes sont indispensables AVANT d'accepter une mission.
   Ne descend donc que ce qui n'appelle aucune action. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

const base=(S)=>{
  document.body.classList.add('standalone');
  S.onboarded=true;S.guest=false;S.lang='fr';S.demoMode=false;S.persona='pro';S.proNav='home';
  S.proStatus='approved';S.proName='Laure G.';S.mission=null;S.detail=null;S.proCats=['menage'];S.proNotifPush=false;
  S.proMissions=[{reqId:'m1',_id:'pm1',status:'accepted',svc:'menage',svcName:'Ménage',when:'Aujourd’hui',
    slot:'14:00',duration:2,unit:'h',rate:35,zone:'Gustavia',tip:0,clientName:'Joris D.',accepted:true,
    clientAccepted:true,proAccepted:true,chat:[],support:{pro:[]}}];
};

(async()=>{
  const b=await chromium.launch(o);
  const ctx=await b.newContext({locale:'fr-FR',viewport:{width:428,height:1600}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);
  await p.exposeFunction('__base',()=>{});

  const rendre=(etat)=>p.evaluate((e)=>{
    const S=window.__S;
    document.body.classList.add('standalone');
    S.onboarded=true;S.guest=false;S.lang='fr';S.demoMode=false;S.persona='pro';S.proNav='home';
    S.proStatus='approved';S.proName='Laure G.';S.mission=null;S.detail=null;S.proCats=['menage'];S.proNotifPush=false;
    S.proMissions=[{reqId:'m1',_id:'pm1',status:'accepted',svc:'menage',svcName:'Ménage',when:'Aujourd’hui',
      slot:'14:00',duration:2,unit:'h',rate:35,zone:'Gustavia',tip:0,clientName:'Joris D.',accepted:true,
      clientAccepted:true,proAccepted:true,chat:[],support:{pro:[]}}];
    S.proOnline=e.online;S.proMollieOrgId='org_1';S.proMollie=e.mollie;S.proMollieStatus=e.mollie;
    S.proMollieOnb=e.onb;S.proMollieCanWork=e.canWork;
    window.__render();
    const t=(document.querySelector('.phone')||document.body).innerText;
    const pos=(s)=>t.indexOf(s);
    return {txt:t.replace(/\s+/g,' '),
      iEnLigne:Math.max(pos('Hors ligne'),pos('Vous êtes en ligne')),
      iMissions:pos('MISSIONS EN COURS'),iNotif:pos('Ne manquez aucune mission'),
      iOuverture:pos('Ouverture aux clients'),iPaiement:Math.max(pos('Finissez votre dossier'),pos('Dernière étape pour être payé')),
      large:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1};
  },etat);

  console.log('A — hors ligne : l’interrupteur commande tout, il passe devant');
  const off=await rendre({online:false,mollie:'active',onb:'completed',canWork:true});
  ok(off.iEnLigne>0&&off.iEnLigne<off.iMissions,'« Hors ligne » est AVANT les missions');
  // Le rappel des notifications est un PRÉ-REQUIS : sans elles, il ne reçoit aucune
  // demande. Il reste donc devant les missions — et il s'effacera de lui-même.
  ok(off.iNotif>0&&off.iNotif<off.iMissions,'le rappel des notifications reste AVANT les missions : c’est un pré-requis, pas une information');
  ok(off.iMissions>0&&off.iMissions<off.iOuverture,'seul le bandeau du 1er octobre, qui n’attend aucun geste, descend sous les missions');

  console.log('B — en ligne : il n’a plus rien d’urgent à dire, il redescend');
  const on=await rendre({online:true,mollie:'active',onb:'completed',canWork:true});
  ok(on.iMissions>0&&on.iMissions<on.iEnLigne,'les missions passent AVANT l’interrupteur');
  ok(/Vous êtes en ligne/.test(on.txt),'et l’état reste consultable, plus bas');

  console.log('C — un dossier de paiement qui BLOQUE reste en tête');
  const bloc=await rendre({online:true,mollie:'pending',onb:'needs-data',canWork:false});
  ok(bloc.iPaiement>0&&bloc.iPaiement<bloc.iMissions,
    'sans dossier complet il ne peut rien accepter : ça passe devant les missions');

  console.log('D — un dossier en cours de vérification n’a rien d’urgent');
  const info=await rendre({online:true,mollie:'pending',onb:'in-review',canWork:true});
  ok(info.iMissions>0&&info.iMissions<info.txt.length,'les missions restent en tête');
  ok(info.txt.indexOf('Vous pouvez accepter des missions')>info.txt.indexOf('MISSIONS EN COURS'),
    'le rappel « rien à faire de votre côté » descend sous le contenu — lui n’attend aucun geste');

  ok(off.large&&on.large,'rien ne déborde de l’écran');
  const vrais=errs.filter(e=>!/net::|Failed to load|firebase|ERR_FAILED/i.test(e));
  ok(vrais.length===0,'aucune erreur JS ('+vrais.join(' | ').slice(0,140)+')');
  await b.close();
  console.log(f?'\n'+f+' ÉCHEC(S)':'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
