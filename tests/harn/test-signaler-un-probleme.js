/* « SIGNALER UN PROBLÈME » NE SIGNALAIT RIEN.

   case 'report-issue': toast('Signalement transmis — vous ne serez pas débité'); break;

   C'était le handler ENTIER. Aucune écriture, aucun statut, aucune alerte. Et l'écran
   promet deux lignes plus bas : « Signaler un problème suspend le prélèvement. » Or
   `autoValidate` balaie toutes les heures les prestations restées `done_pro` et, au bout
   de 48 h, valide et DÉBITE LA CARTE. Le client mécontent cliquait, lisait un message
   rassurant, fermait l'application — et était débité deux jours plus tard sans qu'aucune
   trace de sa plainte n'existe nulle part.

   Le mécanisme qui suspend vraiment existait déjà : le litige (`status:'disputed'`), que
   `autoValidate` ne touche pas. Il ne servait qu'à contester des HEURES, et n'était même
   offert que si l'artisan avait ajusté sa durée — il n'y avait AUCUN chemin pour contester
   la QUALITÉ, c'est-à-dire le motif le plus courant. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const srv=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');

(async()=>{
const b=await chromium.launch(o); const p=await b.newPage({viewport:{width:390,height:900}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render);

console.log('\nA — le bouton n’affiche plus un message, il ouvre un signalement');
ok(!/case 'report-issue':toast\(/.test(src),'le toast qui ne faisait rien a disparu');
ok(/case 'report-issue':S\.disputeKind='qualite';S\.disputing=true;render\(\);break;/.test(src),
  'il ouvre l’écran de signalement, motif QUALITÉ');

console.log('\nB — l’écran s’ouvre vraiment, et parle de qualité et non d’heures');
const ecr=await p.evaluate(()=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=true;S.persona='client';S.clientNav='wallet';
  S.account={name:'Camille',email:'c@e.fr',zone:'Gustavia'};
  S.mission={_id:'m1',reqId:'r1',status:'done_pro',svc:'menage',svcName:'Ménage',rate:35,duration:3,
    finalHours:3,unit:'h',zone:'Gustavia',when:'Aujourd’hui',slot:'09:00',chat:[],
    provider:{nm:'Paul Martin',ini:'PM'},providerUid:'a1'};
  S.disputeKind='qualite';S.disputing=true;window.__render();
  const t=document.body.innerText;
  return {titre:/Signaler un problème/.test(t), heures:/Accord initial/.test(t),
    montant:/Montant en attente/.test(t), champ:!!document.getElementById('disputeMsg')};
});
ok(ecr.titre,'l’écran s’intitule « Signaler un problème »');
ok(!ecr.heures,'il ne montre PAS « Accord initial / Déclaré » — personne ne conteste des heures ici');
ok(ecr.montant,'il montre le montant en attente, qui est ce qui est en jeu');
ok(ecr.champ,'et le champ de message est bien là');

console.log('\nC — envoyer écrit vraiment, et suspend le prélèvement');
const env=await p.evaluate(()=>{
  const el=document.getElementById('disputeMsg');
  el.value='La salle de bain n’a pas été nettoyée.';
  const envoie=[...document.querySelectorAll('[data-act="dispute-send"]')][0];
  const ecrits=[]; const vrai=window.__S; 
  window.__pushCapture=ecrits;
  envoie.click();
  const m=window.__S.mission;
  return {statut:m.status, motif:m.disputeKind, msg:m.disputeMsg, ecran:document.body.innerText.slice(0,200)};
});
ok(env.statut==='disputed',
  'le statut passe à « disputed » — c’est CE statut qu’autoValidate ne balaie pas, donc le prélèvement est suspendu');
ok(env.motif==='qualite','le motif voyage avec la plainte');
ok(/salle de bain/.test(env.msg||''),'et le texte du client est retenu');
ok(/En cours d’examen|Signalement transmis/.test(env.ecran),'l’écran confirme sans mentir');

console.log('\nD — autoValidate ne peut plus l’attraper');
ok(/status === 'done_pro'|status !== 'done_pro'|'done_pro'/.test(srv),
  'la validation automatique ne porte que sur les prestations restées « done_pro »');
ok(/if \(before\.status === 'disputed' \|\| after\.status !== 'disputed'\) return;/.test(srv),
  'et le passage en litige déclenche bien l’alerte à l’administrateur');

console.log('\nE — deux motifs, des mots différents, une liste fermée');
ok(/const qual = after\.disputeKind === 'qualite';/.test(srv),
  'le serveur distingue les deux motifs par une comparaison stricte');
ok(/qual \? 'Ti-Services · Problème signalé, ' : 'Ti-Services · Litige à arbitrer, '/.test(srv),
  'l’e-mail à l’administrateur ne parle plus de durée quand il s’agit de qualité');
ok(/qual \? 'Problème signalé, ' : 'Durée contestée, '/.test(srv),
  'ni la notification à l’artisan — on ne l’envoie pas vérifier des heures que personne ne discute');
ok(/disputeKind:r\.disputeKind\|\|'duree'/.test(src),
  'une valeur inconnue retombe sur la durée, seul motif possible jusqu’ici');

console.log('\nF — la console sait arbitrer les deux');
const adm=await p.evaluate(()=>{
  const S=window.__S;
  S.persona='admin';S.admin={view:'home',sel:null};
  const m={disputeKind:'qualite',duration:3,finalHours:3,rate:35,disputeMsg:'Rien n’a été fait',
    clientName:'Camille',svcName:'Ménage'};
  S.mission=m;window.__render();
  return true;
});
ok(/Aucune heure n'est contestée ici/.test(src),
  'la carte d’arbitrage dit que rien n’est en cause côté heures');
ok(/data-adm="dispute-revert">Régler la prestation/.test(src),
  'et n’offre qu’un seul geste sensé : régler au montant convenu');
ok(/geste commercial ou un remboursement se décide à part/.test(src),
  'le remboursement reste une décision séparée — on n’invente pas un demi-mécanisme');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
