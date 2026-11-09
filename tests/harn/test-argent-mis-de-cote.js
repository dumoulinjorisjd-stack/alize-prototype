/* L'ARGENT MIS DE CÔTÉ, DIT AU PRESTATAIRE — v909.

   « Il y a des prestataires qui font des prestations, mais ne s'inscrivent jamais sur
   Mollie, donc ils ne sont jamais payés. […] Ils ne le commencent même pas. » (l'éditeur,
   07/11/2026). Puis : « OK pour ta modification qui rappelle la somme à récupérer. Il faut
   que ça renvoie une notification pour ceux qui l'ont activé et un mail pour ceux qui
   n'ont pas la notification, en plus d'être sur l'écran d'accueil de l'application. »

   CE QUI EXISTAIT : le net d'une mission dont le versement n'a pas pu partir reste sur le
   solde Ti-Services (`molliePayout == 'unrouted'`), jamais perdu ; l'écran d'accueil disait
   « Dernière étape pour être payé » SANS CHIFFRE ; l'avis de fin de mission disait
   « connectez votre compte » sans chiffre ; la relance du lundi, elle, disait la somme —
   par les DEUX canaux à la fois.

   CE QUI EST MESURÉ ICI :
     A — le noyau pur : la somme, et QUI prévenir, PAR OÙ, et QUAND (jamais deux fois à une
         heure d'écart ; un montant inchangé attend la relance du lundi).
     B — le serveur : la somme est écrite sur la fiche (`netMisDeCote`) aux trois moments
         qui la changent, l'avis de fin de mission dit la somme par UN canal, la relance du
         lundi aussi, et la règle Firestore interdit au prestataire de l'écrire lui-même.
     C — l'écran : « 127,50 € vous attendent » sur l'accueil, avec « Recevoir › », en
         portugais aussi ; la bannière du compte la dit ; et sans argent, rien ne change.

   CE QUE CHAQUE CONTRE-ÉPREUVE FAIT ROUGIR, nommé :
     · la carte d'accueil ignore la somme ........................ 5 mesures
     · la relance du lundi repart par les deux canaux ............ 1 mesure
     · le noyau redit sans attendre (dédoublonnage retiré) ....... 2 mesures */
const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const APP=path.join(RACINE,'tests/harn/app.html');
const SRC=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const FN=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');
const RULES=fs.readFileSync(path.join(RACINE,'firestore.rules'),'utf8');
const M=require(path.join(RACINE,'functions/argent-mis-de-cote.js'));
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const H=3600*1000, J=86400*1000;

(async()=>{
console.log('\nA — le noyau : la somme, et qui prévenir, par où, quand');
{ const net=M.netMisDeCote([{molliePayout:'unrouted',molliePayoutNet:50},{molliePayout:'routed',molliePayoutNet:999},{molliePayout:'unrouted',molliePayoutNet:77.5},{molliePayout:'unrouted'},null]);
  ok(M.netMisDeCote([{complementPayout:'unrouted',complementNet:93.5}])===93.5,'le second paiement (empreinte expirée) compte aussi : 93,50 pour une prestation entière prélevée sur la carte');
  ok(net===127.5,'seuls les versements non partis comptent : 50 + 77,50 = '+net+' (le versé et le net inconnu sont ignorés)');
  ok(M.eurTexte(1234.5)==='1 234,50 €'&&M.eurTexte(127.5)==='127,50 €','le montant s’écrit en français : '+M.eurTexte(1234.5));
  const d0=M.rappelArgentDecider({net:0,aPush:true,aMail:true,now:10*J});
  ok(!d0.envoyer&&d0.raison==='rien','sans argent mis de côté, on ne dit rien');
  const d1=M.rappelArgentDecider({net:85,aPush:true,aMail:true,now:10*J});
  ok(d1.envoyer&&d1.canal==='push','la NOTIFICATION pour qui l’a activée, même s’il a aussi un e-mail');
  const d2=M.rappelArgentDecider({net:85,aPush:false,aMail:true,now:10*J});
  ok(d2.envoyer&&d2.canal==='mail','l’E-MAIL pour qui ne l’a pas');
  const d3=M.rappelArgentDecider({net:85,aPush:false,aMail:false,now:10*J});
  ok(!d3.envoyer&&d3.raison==='injoignable','ni l’un ni l’autre : on ne peut pas, et on le dit');
  const d4=M.rappelArgentDecider({net:85,aPush:true,dernierNet:50,dernierAt:10*J-20*60*1000,now:10*J});
  ok(!d4.envoyer&&d4.raison==='trop-tot','deux jambes d’une même mission à vingt minutes d’écart : UN message, pas deux');
  const d5=M.rappelArgentDecider({net:85,aPush:true,dernierNet:85,dernierAt:10*J-3*J,now:10*J});
  ok(!d5.envoyer&&d5.raison==='deja-dit','un montant INCHANGÉ ne se redit pas avant sept jours : c’est le travail de la relance du lundi');
  const d6=M.rappelArgentDecider({net:135,aPush:true,dernierNet:85,dernierAt:10*J-3*J,now:10*J});
  ok(d6.envoyer&&d6.raison==='nouveau','une nouvelle mission a ajouté de l’argent : on le dit');
  const d7=M.rappelArgentDecider({net:85,aPush:true,dernierNet:85,dernierAt:10*J-8*J,now:10*J});
  ok(d7.envoyer,'et un montant inchangé depuis plus de sept jours se redit');
  const T=M.rappelArgentTextes(85);
  ok(T.titre==='85,00 € vous attendent'&&/Connectez votre compte de paiement/.test(T.corps),'le titre dit la somme, le corps dit le geste — « '+T.titre+' »'); }

console.log('\nB — le serveur : la somme sur la fiche, un canal, et la règle qui la protège');
{ ok(/const ARGENT = require\('\.\/argent-mis-de-cote'\)/.test(FN)&&/ARGENT\.netMisDeCote\(/.test(FN)&&/ARGENT\.rappelArgentDecider\(/.test(FN),'le serveur LIT le noyau (somme et décision), il ne recopie pas la règle');
  const corpsNotif=FN.slice(FN.indexOf('async function notifyArtisanMollieProblem'),FN.indexOf('async function notifyArtisanMollieActivated'));
  ok(/if \(pasDeCompte\) \{[\s\S]*majNetMisDeCote\(db, uid\)[\s\S]*rappelArgentDecider\(/.test(corpsNotif),'l’avis de fin de mission sans compte écrit la somme sur la fiche PUIS demande au noyau');
  ok(/if \(dec\.canal === 'push'\) \{[\s\S]*\} else \{[\s\S]*mollieReminderHtml\(/.test(corpsNotif),'…et part par UN canal : la notification, SINON le courriel (le même courriel que la relance du lundi)');
  ok(/if \(!routed\) \{\s*\/\/[^\n]*\n\s*try \{ await majNetMisDeCote\(db, providerUid\); \}/.test(FN),'un versement qui n’a pas pu partir met la fiche à jour');
  ok(/async function rerouteArtisanPayouts\(db, uid, orgId\) \{[\s\S]{0,300}majNetMisDeCote\(db, uid\)/.test(FN),'un rattrapage réussi la fait redescendre');
  const corpsLundi=FN.slice(FN.indexOf('exports.mollieActivationReminder'),FN.indexOf('exports.mollieActivationReminder')+9000);
  ok(/const du = await majNetMisDeCote\(db, d\.id\)/.test(corpsLundi),'la relance du lundi la remet d’aplomb');
  ok(/if \(a\.email && !pushParti\)/.test(corpsLundi)&&/pushParti = true/.test(corpsLundi),'et n’envoie l’e-mail QUE si aucune notification n’est partie');
  ok(/request\.resource\.data\.get\('netMisDeCote', 0\) == resource\.data\.get\('netMisDeCote', 0\)/.test(RULES),'la règle Firestore : un artisan ne peut pas écrire sa propre somme');
  ok(/S\.proNetMisDeCote=Number\(ad\.netMisDeCote\)\|\|0/.test(SRC),'et l’application la LIT sur la fiche, elle ne la calcule jamais de son côté'); }

console.log('\nC — l’écran : la somme sur l’accueil, et rien ne change sans argent');
const b=await chromium.launch(o);
async function accueil(net,lang,etat){
  const ctx=await b.newContext({viewport:{width:390,height:844},locale:'fr-FR',isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto('file://'+APP); await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(300);
  const r=await p.evaluate(([net,lang,etat])=>{const S=window.__S;
    S.onboarded=true;S.guest=false;S.lang=lang;S.demoMode=false;S.persona='pro';S.proNav='home';S.proStatus='approved';S.proName='Laure G.';S.mission=null;S.detail=null;
    S.proMollieOrgId=etat==='needs-data'?'org_1':'';S.proMollie=etat==='needs-data'?'pending':'none';S.proMollieOnb=etat||'';S.proMollieCanWork=false;S.proNetMisDeCote=net;
    window.__render();
    const c=document.querySelector('[data-act="pro-mollie"]');
    const t=c?c.innerText.replace(/\s+/g,' ').trim():null;
    S.proNav='account'; window.__render();
    const bn=document.querySelector('.banner[data-act="pro-mollie"]');
    return {carte:t, titre:c?c.querySelector('b').textContent:null, cta:c?c.querySelector('span.mini').textContent:null, banniere:bn?bn.innerText.replace(/\s+/g,' ').trim():null};},[net,lang,etat]);
  await ctx.close(); return r;
}
{ const r=await accueil(127.5,'fr','');
  ok(r.titre==='127,50 € vous attendent','la carte d’accueil titre la SOMME — « '+r.titre+' »');
  ok(/Mis de côté pour vous\. Connectez votre compte de paiement/.test(r.carte),'et dit le geste — « '+r.carte+' »');
  ok(r.cta==='Recevoir ›','le bouton dit « Recevoir » : c’est son argent, pas une démarche ('+r.cta+')');
  ok(/127,50 € vous attendent, activez vos paiements pour les recevoir\./.test(r.banniere||''),'la bannière du compte dit la même somme — « '+r.banniere+' »'); }
{ const r=await accueil(0,'fr','');
  ok(r.titre==='Dernière étape pour être payé'&&r.cta==='Activer ›'&&/Activez vos paiements/.test(r.banniere||''),'sans argent mis de côté, la carte et la bannière sont celles d’hier — « '+r.titre+' · '+r.cta+' »'); }
{ const r=await accueil(42,'fr','needs-data');
  ok(r.titre==='42,00 € vous attendent'&&/Mollie attend un document/.test(r.carte)&&r.cta==='Compléter ›','avec un document à fournir, la somme reste en titre et le bouton nomme le bon geste — « '+r.cta+' »'); }
{ const r=await accueil(127.5,'pt','');
  ok(r.titre==='127,50 € estão à sua espera'&&/Guardados para si/.test(r.carte)&&r.cta==='Receber ›','en portugais : « '+r.titre+' · '+r.cta+' »'); }
await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
