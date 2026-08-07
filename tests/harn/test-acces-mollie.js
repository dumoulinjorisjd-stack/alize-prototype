/* LE PRESTATAIRE N'AVAIT AUCUN CHEMIN VERS SON COMPTE MOLLIE.
   Tant qu'on croyait « routé = payé », ça ne se voyait pas. Mais une part routée
   stationne sur le solde Mollie du prestataire avant d'arriver sur sa banque : sans
   accès à ce solde, il n'a AUCUN moyen de constater que son argent existe. Il ne lui
   reste qu'à nous croire sur parole — exactement ce qu'on refuse de lui demander.
   Le lien existait dans le code (openMollieAccount) mais n'était affiché que dans
   certains états ; l'état le plus courant — dossier en vérification, encaissement
   ouvert — n'en proposait aucun. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

console.log('A — le lien existe et ne dépend plus de l’état du dossier');
ok(/data-act="mollie-manage">\$\{I\.card\} Voir mon compte Mollie ›/.test(src),'le raccourci est présent');
ok(/\$\{S\.proMollieOrgId\?`<p class="mini" style="margin-top:12px"><button class="linklike" data-act="mollie-manage"/.test(src),
  'affiché dès qu’un compte Mollie existe, quel que soit l’avancement du dossier');
ok(/"Voir mon compte Mollie ›":"View my Mollie account ›"/.test(src)
  && /"Voir mon compte Mollie ›":"Ver a minha conta Mollie ›"/.test(src),'traduit en anglais et en portugais');

console.log('B — sur l’écran réel, dans l’état où il manquait');
(async()=>{
  const b=await chromium.launch(o);
  const ctx=await b.newContext({locale:'fr-FR',viewport:{width:390,height:1500}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);
  const vue=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.onboarded=true;S.guest=false;S.lang='fr';S.demoMode=false;S.persona='pro';S.proNav='account';
    S.proStatus='approved';S.proName='Laure G.';S.mission=null;S.detail=null;
    // L'état exact de la capture : dossier complet, en vérification, encaissement ouvert.
    S.proMollieOrgId='org_1';S.proMollieStatus='pending';S.proMollieOnb='in-review';S.proMollieCanWork=true;
    S._fold=Object.assign({},S._fold,{'p-pay':true});
    window.__render();
    const l=document.querySelector('[data-act="mollie-manage"]');
    const carte=l?l.closest('.card'):null;
    return {present:!!l, cls:l?l.className:'', carte:carte?carte.innerText.replace(/\s+/g,' '):'',
      txt:(document.querySelector('.phone')||document.body).innerText.replace(/\s+/g,' '),
      large:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1};
  });
  ok(vue.present,'le prestataire a bien un chemin vers son compte Mollie');
  // Selon que Mollie a déjà ouvert l'encaissement ou non, la carte affiche l'un ou
  // l'autre message d'attente. Le test ne fige pas lequel : ce qui compte est que le
  // raccourci coexiste avec le message, au lieu de le remplacer.
  ok(/Rien à faire|examen|Activez vos paiements|Réglé automatiquement/.test(vue.carte||vue.txt),
    'le message d’attente de cet état est conservé — le lien s’ajoute, il ne remplace rien');
  ok(/linklike/.test(vue.cls),
    'c’est un lien discret, pas un bouton : utile, mais ce n’est pas le geste principal de l’écran');
  ok(/avant d’arriver sur votre banque|avant d'arriver sur votre banque/.test(vue.txt),
    'on lui dit POURQUOI y aller : ses gains y stationnent avant la banque');
  ok(vue.large,'rien ne déborde de l’écran');
  const vrais=errs.filter(e=>!/net::|Failed to load|firebase|ERR_FAILED/i.test(e));
  ok(vrais.length===0,'aucune erreur JS ('+vrais.join(' | ').slice(0,140)+')');
  await b.close();
  console.log(f?'\n'+f+' ÉCHEC(S)':'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
