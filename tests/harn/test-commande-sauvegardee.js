/* LA COMMANDE EN COURS NE SE PERD PLUS.

   `S.draft` ne vivait QU'EN MÉMOIRE. Trois à quatre minutes de saisie — date, créneau,
   durée, options, notes, jusqu'à six photos, une adresse, et l'attente d'un point GPS qui
   est le geste le plus lent — disparaissaient si un appel arrivait, si le téléphone vidait
   l'onglet, ou d'un simple retour en arrière. Aucun `beforeunload`, rien dans le cache
   local : `cacheClientLocal` gardait missions, historique, adresses et carte, jamais le
   brouillon. Le formulaire d'inscription du PRESTATAIRE, lui, était déjà protégé — la
   preuve que l'intention existait.

   ON SAUVE AU SEUL INSTANT QUI COMPTE : la mise en arrière-plan. Une écriture par
   backgrounding, pas une par frappe.

   ET SI LE QUOTA SAUTE, ON PERD LES PHOTOS, PAS LA SAISIE — et on le DIT. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

(async()=>{
const b=await chromium.launch(o); const p=await b.newPage({viewport:{width:390,height:900}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__brouillon);
const accueil=()=>p.evaluate(()=>{const S=window.__S;document.body.classList.add('standalone');
  S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=false;S.persona='client';S.clientNav='home';
  S.account={name:'Camille',email:'c@e.fr',zone:'Gustavia'};S.mission=null;S.catView=null;
  try{localStorage.removeItem(window.__brouillon.cle());}catch(_){}
  window.__render();});
const BROUILLON=`{svc:'menage',svcName:'Ménage',rate:35,duration:3,unit:'h',when:'Mardi 22 sept.',slot:'09:00',
  zone:'Gustavia',address:'Villa Rose, Lurin',notes:'Le portail est à gauche',
  photos:['data:image/jpeg;base64,AAAA'],geo:{lat:17.89,lng:-62.84},dateISO:'2026-12-24',dateMode:'pick'}`;

console.log('\nA — l’application part en arrière-plan : la saisie est retenue');
await accueil();
const ecrit=await p.evaluate((B)=>{window.__S.draft=eval('('+B+')');
  window.dispatchEvent(new Event('pagehide'));
  const raw=localStorage.getItem(window.__brouillon.cle());
  return {stocke:!!raw, n:raw?raw.length:0};},BROUILLON);
ok(ecrit.stocke,'le brouillon est écrit au « pagehide » — l’événement que le navigateur émet en partant');
ok(/window\.addEventListener\('pagehide',function\(\)\{ sauverBrouillon\(\); \}\);/.test(src),
  'et aussi au passage en arrière-plan, que `pagehide` ne couvre pas toujours sur iPhone');
ok(/if\(document\.visibilityState==='hidden'\)sauverBrouillon\(\);/.test(src),
  'une écriture par mise en arrière-plan, jamais une par frappe');

console.log('\nB — au retour, on propose de reprendre — et on restitue TOUT');
const retour=await p.evaluate(()=>{window.__S.draft=null;window.__render();
  const c=document.querySelector('[data-act="brouillon-reprendre"]');
  return {carte:!!c, texte:c?c.innerText.replace(/\s+/g,' ').trim():'',
    abandon:!!document.querySelector('[data-act="brouillon-oublier"]')};});
ok(retour.carte,'une carte de reprise paraît sur l’accueil');
ok(/Ménage/.test(retour.texte)&&/09:00/.test(retour.texte),
  'elle dit QUOI et QUAND, pour qu’on sache ce qu’on reprend — « '+retour.texte.slice(0,46)+'… »');
ok(retour.abandon,'et un lien discret permet de l’abandonner');
await p.click('[data-act="brouillon-reprendre"]');
const rendu=await p.evaluate(()=>{const d=window.__S.draft||{};
  return {svc:d.svc,notes:d.notes,adr:d.address,photos:(d.photos||[]).length,geo:!!d.geo,slot:d.slot,dateISO:d.dateISO};});
ok(rendu.svc==='menage'&&rendu.slot==='09:00'&&rendu.dateISO==='2026-12-24',
  'le service, la DATE et le créneau reviennent intacts — une date à venir n’est pas retouchée');
ok(rendu.notes==='Le portail est à gauche'&&rendu.adr==='Villa Rose, Lurin','les notes et l’adresse aussi');
ok(rendu.photos===1,'les photos sont là');
ok(rendu.geo,'et le point GPS — le geste le plus lent de toute la commande');

console.log('\nB bis — une date déjà passée est ramenée, et on le DIT');
const passee=await p.evaluate(()=>{const S=window.__S;
  S.draft={svc:'menage',svcName:'Ménage',rate:35,duration:3,unit:'h',when:'Lundi',slot:'09:00',
    zone:'Gustavia',geo:{lat:17.89,lng:-62.84},dateISO:'2020-01-06',dateMode:'pick'};
  window.dispatchEvent(new Event('pagehide'));S.draft=null;window.__render();
  document.querySelector('[data-act="brouillon-reprendre"]').click();
  // le bandeau d'état est un élément fixe : on le lit là où il vit
  const t=document.getElementById('toast');
  return {dateISO:(window.__S.draft||{}).dateISO, avis:(t?t.textContent:'')};});
ok(passee.dateISO>'2020-01-06',
  'l’application ramène la date au prochain créneau — on ne commande pas dans le passé');
ok(/La date choisie est passée/.test(passee.avis),
  'et elle le DIT : sans un mot, la personne repartait avec un jour qu’elle n’avait pas choisi');

console.log('\nC — la commande passée ne se repropose jamais');
await accueil();
const apres=await p.evaluate((B)=>{window.__S.draft=eval('('+B+')');
  window.dispatchEvent(new Event('pagehide'));
  window.__brouillon.oublier();            // ce que fait l'enregistrement d'une commande
  window.__S.draft=null;window.__render();
  return !!document.querySelector('[data-act="brouillon-reprendre"]');},BROUILLON);
ok(!apres,'une fois la commande envoyée, la carte disparaît');
ok(/S\.mission=d;S\.draft=null;oublierBrouillon\(\);/.test(src),
  'l’effacement est posé à l’endroit où la commande part, pas ailleurs');
ok(/if\(c==='back'\)\{S\.draft=null;oublierBrouillon\(\);render\(\);\}/.test(src),
  '« ← Retour » abandonne vraiment');
ok(/case 'go-home':S\.mission=null;S\.draft=null;oublierBrouillon\(\);/.test(src),
  'le bouton d’accueil aussi — le brouillon ne survit qu’à une mise en arrière-plan, le cas qu’on répare');

console.log('\nD — le quota du téléphone : on perd les photos, jamais la saisie');
ok(/photos:\[\]\}\),ts:Date\.now\(\),photosPerdues:n/.test(src),
  'quand l’écriture échoue, on réessaie SANS les photos — une photo pèse jusqu’à 250 Ko, et il peut y en avoir six');
ok(/if\(p\.photosPerdues>0\)toast\(/.test(src),
  'et on le DIT au retour : une pièce jointe qui disparaît sans un mot est pire que son absence');
const perte=await p.evaluate(()=>{
  localStorage.setItem(window.__brouillon.cle(),JSON.stringify({
    draft:{svc:'menage',when:'Mardi',slot:'09:00',photos:[]},ts:Date.now(),photosPerdues:3}));
  const p2=window.__brouillon.lire();
  return {lu:!!p2, n:p2?p2.photosPerdues:0, photos:p2?(p2.draft.photos||[]).length:-1};});
ok(perte.lu&&perte.photos===0&&perte.n===3,'la saisie revient sans ses photos, et le nombre perdu est retenu');

console.log('\nE — un brouillon périmé ne revient pas');
const vieux=await p.evaluate(()=>{
  localStorage.setItem(window.__brouillon.cle(),JSON.stringify({
    draft:{svc:'menage',when:'Mardi',slot:'09:00'},ts:Date.now()-25*3600*1000}));
  const lu=window.__brouillon.lire();
  return {lu:!!lu, reste:!!localStorage.getItem(window.__brouillon.cle())};});
ok(!vieux.lu,'passé vingt-quatre heures, on ne le propose plus : sa date et son créneau sont derrière nous');
ok(!vieux.reste,'et il est effacé plutôt que gardé indéfiniment');

console.log('\nF — rien de tout cela en démonstration');
const demo=await p.evaluate((B)=>{const S=window.__S;S.demoMode=true;
  try{localStorage.removeItem(window.__brouillon.cle());}catch(_){}
  S.draft=eval('('+B+')');window.dispatchEvent(new Event('pagehide'));
  const r=!!localStorage.getItem(window.__brouillon.cle());S.demoMode=false;return r;},BROUILLON);
ok(!demo,'le mode démonstration n’écrit rien — il montre l’application, il ne laisse pas de traces');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
