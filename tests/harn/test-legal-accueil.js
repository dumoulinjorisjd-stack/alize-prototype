/* « SUR LA PAGE D'ACCUEIL MOBILE, IL N'Y A AUCUN LIEN VERS NOS DOCUMENTS LÉGAUX ? »

   Non, aucun — mesuré : zéro lien sur l'accueil public, zéro sur l'écran « Découvrir ».
   `legalFooter()` existait, mais n'était appelé que depuis le profil client, le profil
   prestataire et l'inscription prestataire : il fallait donc avoir un compte pour lire
   les conditions qu'on accepte en en créant un. Or les mentions légales doivent être
   accessibles au VISITEUR, la politique de confidentialité avec elles, et « Suppression
   de compte » est une adresse que les deux magasins d'applications exigent publique.

   CE SONT DE VRAIS LIENS. `?legal=…` est la porte déjà en place — celle vers laquelle
   pointent les fiches App Store et Play Store — donc l'adresse se copie, se partage,
   s'indexe, et ouvre le texte même sans JavaScript. Le clic n'est intercepté que pour
   éviter un rechargement ; si le gestionnaire disparaissait, le lien marcherait encore. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const ATTENDUS=['mentions','cgu','cgv','confidentialite','charte','suppression'];

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
ok(a.n===6&&a.visibles===6,'les six documents sont là et visibles ('+a.visibles+'/'+a.n+')');
ok(ATTENDUS.every(k=>a.cles.includes(k)),'aucun ne manque — '+a.cles.join(', '));
ok(!a.deborde,'rien ne dépasse à 390 px : la rangée passe à la ligne au lieu de défiler ('+a.rangees+' rangées)');

console.log('\nB — ce sont de VRAIS liens, pas des boutons');
const hrefs=await p.$$eval('.brief .lp-legal a',l=>l.map(x=>x.tagName+' '+x.getAttribute('href')));
ok(hrefs.every(h=>/^A \?legal=/.test(h)),'chacun porte son adresse — « '+hrefs[0]+' »');
ok(/\?legal=/.test(fs.readFileSync(path.join(RACINE,'index.html'),'utf8')),
  'et `?legal=` est la porte qui existait déjà : celle des fiches App Store et Play Store');

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
ok(d.n>=5,'l’écran de découverte porte ses propres liens ('+d.n+')');

console.log('\nE — et ils se lisent dans les trois langues');
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);
for(const [lg,mot] of [['en','Legal notice'],['pt','Menções legais']]){
  await p.click('.brief [data-act="lang-'+lg+'"]'); await p.waitForTimeout(500);
  const t=await p.$$eval('.brief .lp-legal a',l=>l.map(x=>x.innerText.trim()));
  ok(t[0]===mot&&!t.some(x=>/^(CGU|CGV|Confidentialité)$/.test(x)),
    lg.toUpperCase()+' : aucun mot français ne subsiste — '+t.join(' · '));
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
