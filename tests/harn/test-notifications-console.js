/* QUI PEUT ÊTRE PRÉVENU, ET COMMENT LA CONSOLE LE DIT.

   « Il faut que je sache si les utilisateurs ont coché les notifications » (20/09/2026).
   La réponse était dans la base depuis toujours — `users/{uid}.pushTokens` — et
   n'apparaissait nulle part : la fiche d'un CLIENT portait une ligne, la fiche d'un
   PRESTATAIRE rien du tout, et aucun écran ne donnait le compte. Or c'est le prestataire
   qui coûte cher : sans notification il ne voit pas passer les demandes, elles partent à
   tous, et il ne les découvre qu'en ouvrant l'application.

   CE QU'UN JETON PROUVE. Qu'un appareil a accepté les notifications et s'est enregistré.
   PAS que la permission tient encore : elle se retire dans les réglages du téléphone sans
   que personne ne le sache. Le serveur efface le jeton au premier envoi qui échoue, donc
   le compte est juste AU DERNIER ENVOI — et la carte l'écrit, au lieu d'annoncer un
   chiffre qu'on croirait instantané.

   L'ÉPREUVE MESURE CE QUI EST RENDU, pas la présence d'une fonction : un compte fabriqué
   avec et sans jetons, et l'on demande à l'écran ce qu'il affiche. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

// Trois prestataires (deux joignables, un muet), deux clients (un seul joignable), et un
// prestataire REFUSÉ, qui ne doit compter dans rien : on ne relance pas quelqu'un qu'on
// n'a pas retenu.
const ARTS=[
  {id:'a1',uid:'a1',name:'Laure G.',status:'valide',cats:['menage'],zone:'Gustavia'},
  {id:'a2',uid:'a2',name:'Marc P.',status:'valide',cats:['jardin'],zone:'Lorient'},
  {id:'a3',uid:'a3',name:'Sonia T.',status:'attente',cats:['coiffure'],zone:'Gustavia'},
  {id:'a4',uid:'a4',name:'Refusé R.',status:'refuse',cats:['menage'],zone:'Gustavia'}
];
const CLIS=[
  {id:'c1',uid:'c1',name:'Joris D.',status:'valide',push:1,bookings:0,addresses:[],recurring:[]},
  {id:'c2',uid:'c2',name:'Anne B.',status:'valide',push:0,bookings:0,addresses:[],recurring:[]}
];
const NOTIFS={a1:{jetons:2,role:'artisan',at:Date.parse('2026-09-02T10:00:00Z')},
              a2:{jetons:0,role:'artisan',at:0},
              a3:{jetons:1,role:'artisan',at:0},
              a4:{jetons:0,role:'artisan',at:0},
              c1:{jetons:1,role:'client',at:0}, c2:{jetons:0,role:'client',at:0}};

(async()=>{
const b=await chromium.launch(o);
const p=await b.newPage({viewport:{width:430,height:1600}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);

const poser=(arts,clis,notifs)=>p.evaluate(([A,C,N])=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.persona='admin';S.onboarded=true;S.authView=null;S.showPitch=false;S.legalView=null;S.lang='fr';
  S.adminArtisans=A;S.adminClients=C;S.adminNotifs=N;S.admin={view:'home',sel:null};
  window.__render();
  const carte=[...document.querySelectorAll('.card')].filter(x=>/^Notifications/m.test((x.innerText||'').trim())||/Qui peut être prévenu/.test(x.textContent||'')).pop();
  if(carte&&!carte.classList.contains('open')){const h=carte.querySelector('.fold-head,button');if(h)h.click();}
  const c2=[...document.querySelectorAll('.card')].filter(x=>/Qui peut être prévenu/.test(x.textContent||'')).pop();
  return {txt:c2?c2.innerText.replace(/\s+/g,' '):'(carte absente)',
    relances:c2?[...c2.querySelectorAll('[data-adm^="art:"]')].map(e=>e.innerText.replace(/\s+/g,' ')):[]};
},[arts,clis,notifs]);

console.log('\nA — la console compte, et ne nomme que ce qui appelle un geste');
const r=await poser(ARTS,CLIS,NOTIFS);
ok(/2\/3/.test(r.txt),'deux prestataires joignables sur trois retenus : « '+(/(\d+\/\d+)/.exec(r.txt)||[])[1]+' »');
ok(!/\/4/.test(r.txt),'le prestataire REFUSÉ ne compte nulle part : on ne relance pas quelqu’un qu’on n’a pas retenu');
ok(/1\/2/.test(r.txt),'et un client sur deux');
ok(r.relances.length===1&&/Marc P\./.test(r.relances[0]),
  'seul le prestataire muet est NOMMÉ, avec un lien vers sa fiche ('+r.relances.join(' · ')+')');
ok(!/Anne B\./.test(r.txt),'les clients sans notification sont comptés, pas listés : on n’y peut rien de plus');
ok(/dernier envoi|envoi qui échoue/i.test(r.txt),
  'la carte dit ce que le chiffre vaut : une permission retirée ne se voit qu’au premier envoi qui échoue');

console.log('\nB — quand tout le monde est joignable, la carte le dit et ne liste rien');
const tous=await poser(ARTS,CLIS,Object.assign({},NOTIFS,{a2:{jetons:1,role:'artisan',at:0}}));
ok(/3\/3/.test(tous.txt)&&!tous.relances.length,
  'trois sur trois, aucune relance à faire');
ok(/peuvent être prévenus/i.test(tous.txt),'et la phrase le dit, au lieu d’une liste vide');

console.log('\nC — la fiche d’un prestataire porte la même information');
// La section B a rendu a2 joignable : on repose l'état de départ, sinon on mesurerait
// l'écran précédent (et l'épreuve passerait au vert en lisant autre chose).
await poser(ARTS,CLIS,NOTIFS);
const fiche=(uid)=>p.evaluate((uid)=>{
  const S=window.__S; S.admin={view:'art',sel:uid}; window.__render();
  const r=document.querySelector('.phone')||document.body;
  return r.innerText.replace(/\s+/g,' ');
},uid);
const f1=await fiche('a1');
ok(/Notifications Actives/.test(f1)&&/2 appareils enregistrés/.test(f1),
  'prestataire joignable : « Actives », et le nombre d’appareils');
ok(/depuis le 0?2\/09\/2026/.test(f1),'avec la date à laquelle il les a acceptées');
const f2=await fiche('a2');
ok(/Notifications .{0,3}Aucune/.test(f2)&&/ne sera pas prévenu/.test(f2),
  'prestataire muet : « Aucune », et la CONSÉQUENCE, pas seulement l’état');

console.log('\nD — ce qu’on ne sait pas encore ne se dit pas « zéro »');
const pasLu=await p.evaluate(()=>{
  const S=window.__S; S.adminNotifs=null; S.admin={view:'home',sel:null}; window.__render();
  const c=[...document.querySelectorAll('.card')].filter(x=>/Qui peut être prévenu/.test(x.textContent||'')).pop();
  if(c&&!c.classList.contains('open')){const h=c.querySelector('.fold-head,button');if(h)h.click();}
  const c2=[...document.querySelectorAll('.card')].filter(x=>/Qui peut être prévenu/.test(x.textContent||'')).pop();
  S.admin={view:'art',sel:'a1'}; window.__render();
  const fi=(document.querySelector('.phone')||document.body).innerText.replace(/\s+/g,' ');
  return {carte:c2?c2.innerText.replace(/\s+/g,' '):'', fiche:fi};
});
ok(/en cours/i.test(pasLu.carte)&&!/0\/\d/.test(pasLu.carte),
  'tant que les comptes ne sont pas lus, la carte patiente — « 0 prestataire joignable » se lirait comme un fait');
ok(/Lecture en cours/.test(pasLu.fiche),'et la fiche aussi');

console.log('\nE — une seule écoute, et le relevé est pris dedans');
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
ok(/buildAdminClients\(snap\);\s*buildAdminDrafts\(snap\);\s*buildAdminNotifs\(snap\);/.test(src),
  'le relevé se greffe sur l’écoute des comptes qui tournait déjà : pas un abonnement de plus');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
