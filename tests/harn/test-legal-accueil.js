/* « SUR LA PAGE D'ACCUEIL MOBILE, IL N'Y A AUCUN LIEN VERS NOS DOCUMENTS LÉGAUX ? »

   Non, aucun — mesuré : zéro lien sur l'accueil public, zéro sur l'écran « Découvrir ».
   `legalFooter()` existait, mais n'était appelé que depuis le profil client, le profil
   prestataire et l'inscription prestataire : il fallait donc avoir un compte pour lire
   les conditions qu'on accepte en en créant un. Or les mentions légales doivent être
   accessibles au VISITEUR, la politique de confidentialité avec elles, et « Suppression
   de compte » est une adresse que les deux magasins d'applications exigent publique.

   CE SONT DE VRAIS LIENS, et ils mènent aux pages STATIQUES (`legal/<clé>.html`) : un
   moteur qui les suit lit le texte sans exécuter l'application. Le clic est intercepté
   pour rester dans l'app — on ne quitte pas Ti-Services pour lire ses propres
   conditions — mais si ce gestionnaire disparaissait, le lien marcherait encore.
   `?legal=…` continue d'ouvrir le texte dans l'application : c'est l'adresse inscrite
   dans les fiches App Store et Play Store. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
// QUATRE sur les pages publiques. La charte de l'intervenant et la suppression de compte
// ne concernent que quelqu'un qui a déjà un compte : elles reparaissent DANS le compte, et
// restent atteignables par leur adresse — c'est sur l'adresse que portent les exigences
// des deux magasins d'applications, pas sur un lien en pied d'accueil.
const ATTENDUS=['mentions','cgu','cgv','confidentialite'];
const RESERVES=['charte','suppression'];

(async()=>{
const b=await chromium.launch(o);
const ctx=await b.newContext({viewport:{width:390,height:844},locale:'fr-FR',isMobile:true,hasTouch:true});
const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(500);

console.log('\nA — l’accueil public les porte, et on les voit');
const a=await p.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();const st=getComputedStyle(e);
    return r.width>0&&r.height>0&&st.visibility!=='hidden';};
  const l=[...document.querySelectorAll('.brief .lp-legal a')];
  const rows=new Set(l.filter(vis).map(e=>Math.round(e.getBoundingClientRect().top)));
  return {n:l.length, visibles:l.filter(vis).length, cles:l.map(e=>e.getAttribute('data-legal')),
    rangees:rows.size, deborde:l.some(e=>e.getBoundingClientRect().right>window.innerWidth+1),
    cible:Math.min(...l.map(e=>Math.round(e.getBoundingClientRect().height)))};});
ok(a.n===4&&a.visibles===4,'les quatre documents du visiteur sont là et visibles ('+a.visibles+'/'+a.n+')');
ok(ATTENDUS.every(k=>a.cles.includes(k)),'aucun ne manque — '+a.cles.join(', '));
ok(!RESERVES.some(k=>a.cles.includes(k)),
  'et ni la charte ni la suppression de compte : elles ne concernent que qui a un compte');
ok(!a.deborde,'rien ne dépasse à 390 px : la rangée passe à la ligne au lieu de défiler ('+a.rangees+' rangées)');

console.log('\nB — ce sont de VRAIS liens, pas des boutons');
const hrefs=await p.$$eval('.brief .lp-legal a',l=>l.map(x=>x.tagName+' '+x.getAttribute('href')));
ok(hrefs.every(h=>/^A legal\/[a-z]+\.html$/.test(h)),
  'chacun porte son adresse, et c’est celle de la page STATIQUE — « '+hrefs[0]+' »');
ok(/\?legal=/.test(fs.readFileSync(path.join(RACINE,'index.html'),'utf8')),
  'et `?legal=` reste lu au démarrage : c’est l’adresse des fiches App Store et Play Store, on ne la casse pas');

console.log('\nC — le clic ouvre le texte, et le retour ramène à l’accueil');
const avant=p.url();
await p.click('.brief a[data-legal="mentions"]'); await p.waitForTimeout(400);
const ouvert=await p.evaluate(()=>({vue:window.__S.legalView,
  standalone:document.body.classList.contains('standalone'),
  titre:(document.querySelector('#view .h-hello')||{}).innerText||''}));
ok(ouvert.vue==='mentions'&&/Mentions légales/.test(ouvert.titre),'le document s’ouvre — « '+ouvert.titre+' »');
ok(ouvert.standalone,'la vitrine est masquée : sans cela le texte restait derrière l’accueil');
ok(p.url()===avant,'et la page n’a pas été rechargée — l’adresse n’a pas bougé');
await p.click('[data-act="close-legal"]'); await p.waitForTimeout(400);
const ferme=await p.evaluate(()=>({vue:window.__S.legalView,
  standalone:document.body.classList.contains('standalone'),
  vitrine:(()=>{const e=document.querySelector('.brief');const r=e.getBoundingClientRect();return r.width>0&&r.height>0;})()}));
ok(!ferme.vue&&!ferme.standalone&&ferme.vitrine,'« ← Retour » rend l’accueil public, pas un écran vide');

console.log('\nD — l’écran « Découvrir » a le sien : la vitrine y est masquée');
await p.evaluate(()=>{const b=[...document.querySelectorAll('[data-act="explore-app"]')]
  .find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}); if(b)b.click();});
await p.waitForTimeout(500);
const d=await p.evaluate(()=>{
  const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const l=[...document.querySelectorAll('#view [data-act^="view-"]')].filter(vis);
  const br=document.querySelector('.brief').getBoundingClientRect();
  return {n:l.length, vitrineVisible:br.width>0&&br.height>0};});
ok(!d.vitrineVisible,'la vitrine y est bien masquée — son pied ne pouvait donc pas servir');
ok(d.n===4,'l’écran de découverte porte les mêmes quatre ('+d.n+')');

console.log('\nE — et ils se lisent dans les trois langues');
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);
for(const [lg,mot] of [['en','Legal notice'],['pt','Menções legais']]){
  await p.click('.brief [data-act="lang-'+lg+'"]'); await p.waitForTimeout(500);
  const t=await p.$$eval('.brief .lp-legal a',l=>l.map(x=>x.innerText.trim()));
  ok(t[0]===mot&&!t.some(x=>/^(CGU|CGV|Confidentialité)$/.test(x)),
    lg.toUpperCase()+' : aucun mot français ne subsiste — '+t.join(' · '));
}

console.log('\nF — sur une TABLETTE en paysage, la vitrine est masquée : l’écran d’accueil les porte');
// Au-delà de 1024 px, `body.desktop .brief{display:none}` : ce n'est plus la vitrine
// qu'on découvre mais l'écran d'accueil de l'application, qui ne portait rien. Sur une
// tablette en paysage, c'est la première et la seule page.
{
  const large=await b.newContext({viewport:{width:1280,height:800},locale:'fr-FR'});
  const pl=await large.newPage(); pl.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await pl.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
  await pl.waitForFunction(()=>window.__S&&window.__render); await pl.waitForTimeout(600);
  const t=await pl.evaluate(()=>{
    const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
    const br=document.querySelector('.brief').getBoundingClientRect();
    return {desktop:document.body.classList.contains('desktop'),
      vitrine:br.width>0&&br.height>0,
      liens:[...document.querySelectorAll('#view [data-act^="view-"]')].filter(vis).length};});
  ok(t.desktop&&!t.vitrine,'à 1280 px la vitrine est bien masquée — son pied ne peut pas servir');
  ok(t.liens===4,'et l’écran d’accueil porte les mêmes quatre ('+t.liens+')');
  await large.close();
}

console.log('\nG — et sur téléphone, le pied tient sur UN axe');
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(500);
const pied=await p.evaluate(()=>{
  const c=e=>{const r=document.querySelector(e).getBoundingClientRect();
    return Math.round((r.left+r.right)/2);};
  const pd=document.querySelector('.lp-pied');
  return {editeur:c('.lp-pied .pitch-foot'), liens:c('.lp-legal'), fb:c('.lp-pied .fb-link'),
    filet:getComputedStyle(pd).borderTopWidth,
    milieu:Math.round(window.innerWidth/2)};});
const ecart=Math.max(Math.abs(pied.editeur-pied.milieu),Math.abs(pied.liens-pied.milieu),Math.abs(pied.fb-pied.milieu));
ok(ecart<=2,'les trois blocs partagent le même centre ('+pied.editeur+' · '+pied.liens+' · '+pied.fb+' pour un milieu à '+pied.milieu+')');
ok(pied.filet!=='0px','et un filet les détache de ce qui précède ('+pied.filet+')');

console.log('\nH — les deux réservés reparaissent DANS le compte, et restent atteignables');
{
  const c2=await b.newContext({viewport:{width:1280,height:800},locale:'fr-FR'});
  const pc=await c2.newPage();
  await pc.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
  await pc.waitForFunction(()=>window.__S&&window.__render); await pc.waitForTimeout(500);
  const cli=await pc.evaluate(()=>{const S=window.__S;
    S.onboarded=true;S.persona='client';S.clientNav='profile';S.authView=null;S.showPitch=false;S.legalView=null;
    S.account={name:'Camille',email:'c@e.fr',zone:'Gustavia'};window.__render();
    return [...document.querySelectorAll('#view [data-act^="view-"]')].map(x=>x.innerText.trim());});
  ok(cli.includes('Suppression de compte')&&!cli.includes('Charte intervenant'),
    'profil client : la suppression de compte revient, pas la charte — '+cli.join(' · '));
  const pro=await pc.evaluate(()=>{const S=window.__S;
    S.persona='pro';S.proStatus='pending';S.proNav='home';window.__render();
    return [...document.querySelectorAll('#view [data-act^="view-"]')].map(x=>x.innerText.trim());});
  ok(pro.includes('Charte intervenant')&&pro.includes('Suppression de compte'),
    'compte prestataire : les deux — '+pro.join(' · '));
  await c2.close();
}
for(const k of RESERVES){
  ok(fs.existsSync(path.join(RACINE,'legal/'+k+'.html')),
    'la page '+k+' reste en ligne : c’est l’ADRESSE qu’exigent App Store et Play Store');
  ok(fs.readFileSync(path.join(RACINE,'sitemap.xml'),'utf8').includes('/legal/'+k+'.html'),
    'et elle reste au sitemap, donc indexée');
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
