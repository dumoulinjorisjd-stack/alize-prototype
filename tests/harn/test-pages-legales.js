/* LES SIX TEXTES LÉGAUX SONT LISIBLES SANS EXÉCUTER L'APPLICATION.

   Ils vivaient en constantes `LEGAL_*` dans `index.html` et ne paraissaient qu'une fois
   l'application lancée : un moteur qui suivait `?legal=cgu` recevait la coquille et
   devait faire tourner soixante mille lignes de JavaScript pour voir trois paragraphes
   de mentions légales. `node outils/pages-legales.js` les écrit d'avance.

   UNE SEULE SOURCE. On ne recopie pas un texte juridique : deux copies divergent, et
   c'est la copie oubliée qui part chez le client. Cette épreuve REGÉNÈRE et compare
   octet pour octet — un texte modifié dans `index.html` sans régénération la fait
   rougir, ce qui est exactement ce qu'on veut d'un garde-fou.

   `?legal=…` N'EST PAS CASSÉ : c'est l'adresse inscrite dans les fiches App Store et
   Play Store. Les deux portes mènent au même texte. */
const fs=require('fs'),path=require('path');
const RACINE='/home/user/alize-work';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const gen=require(path.join(RACINE,'outils/pages-legales.js'));
const lire=(f2)=>{try{return fs.readFileSync(path.join(RACINE,f2),'utf8');}catch(_){return null;}};

console.log('\nA — les pages existent, et elles sont À JOUR');
// On prend la date du sitemap DÉJÀ écrit : c'est le seul champ qui dépend du jour, et
// on éprouve le CONTENU, pas l'horloge.
const smAct=lire('sitemap.xml')||'';
const jour=(/<lastmod>([\d-]+)<\/lastmod>/.exec(smAct)||[])[1]||'2026-01-01';
const attendu=gen.rendu(jour);
const chemins=Object.keys(attendu);
ok(chemins.length===19,'six documents × trois langues, plus le sitemap ('+chemins.length+' fichiers)');
const manquants=chemins.filter(c=>lire(c)===null);
ok(!manquants.length,'aucun ne manque sur le disque'+(manquants.length?' — '+manquants.join(', '):''));
const divergents=chemins.filter(c=>lire(c)!==attendu[c]);
ok(!divergents.length,
  'chacun correspond EXACTEMENT à ce que le générateur produit depuis index.html'
  +(divergents.length?' — à regénérer : '+divergents.join(', '):''));

console.log('\nB — chaque page dit aux moteurs ce qu’il faut');
const pbs=[];
chemins.filter(c=>c!=='sitemap.xml').forEach(c=>{
  const h=lire(c)||''; const t=(/<title>([^<]*)<\/title>/.exec(h)||[])[1]||'';
  const oct=Buffer.from(h).indexOf('charset');
  if(oct<0||oct>1024)pbs.push(c+' : charset à l’octet '+oct);
  if(!t)pbs.push(c+' : sans titre');
  else if(t.length>60)pbs.push(c+' : titre de '+t.length+' caractères');
  if(!/<meta name="description" content="[^"]{60,}"/.test(h))pbs.push(c+' : résumé absent ou trop court');
  if(!/<meta name="robots" content="index,follow">/.test(h))pbs.push(c+' : pas indexable');
  if(!/<link rel="canonical" href="https:\/\/ti-services\.fr\/[^"]+">/.test(h))pbs.push(c+' : sans adresse canonique');
  if((h.match(/rel="alternate" hreflang=/g)||[]).length!==4)pbs.push(c+' : les trois langues + x-default ne sont pas déclarées');
  if(!/<h1>/.test(h))pbs.push(c+' : sans titre de premier rang');
});
ok(!pbs.length,'les dix-huit pages sont en règle'+(pbs.length?' — '+pbs.slice(0,4).join(' · '):''));

console.log('\nC — le texte est bien CELUI de l’application, entier');
const src=lire('index.html')||'';
const ecarts=[];
gen.DOCS.forEach(d=>gen.LANGUES.forEach(L=>{
  const corps=gen.constante(d.c+L.suf);
  const page=lire(L.dossier+'/'+d.cle+'.html')||'';
  // Le générateur ne change QUE le rang des intertitres (h3 → h2, pour que la page ait
  // un plan correct sous son h1) : le reste doit s'y retrouver caractère pour caractère.
  if(!page.includes(corps.replace(/<(\/?)h3>/g,'<$1h2>')))ecarts.push(L.dossier+'/'+d.cle);
}));
ok(!ecarts.length,'chaque page porte le texte complet de sa constante'+(ecarts.length?' — '+ecarts.join(', '):''));

console.log('\nD — on les trouve : le sitemap et le pied de l’accueil');
const sm=lire('sitemap.xml')||'';
const absents=gen.DOCS.flatMap(d=>gen.LANGUES.map(L=>SITEURL(L,d))).filter(u=>!sm.includes('<loc>'+u+'</loc>'));
function SITEURL(L,d){return 'https://ti-services.fr/'+L.dossier+'/'+d.cle+'.html';}
ok(!absents.length,'les dix-huit adresses sont au sitemap'+(absents.length?' — '+absents.length+' manquent':''));
ok(/<loc>https:\/\/ti-services\.fr\/<\/loc>/.test(sm),'et l’accueil y reste');
ok(/Allow: \/\s/.test(lire('robots.txt')||'')&&/Sitemap: https:\/\/ti-services\.fr\/sitemap\.xml/.test(lire('robots.txt')||''),
  'robots.txt ouvre le site et nomme le sitemap');
const piedOk=gen.DOCS.every(d=>src.includes('<a href="legal/'+d.cle+'.html" data-legal="'+d.cle+'">'));
ok(piedOk,'le pied de l’accueil pointe vers les pages STATIQUES, celles qu’un moteur peut lire');

console.log('\nE — et l’ancienne porte n’est pas cassée');
ok(/q\.get\('legal'\)/.test(src),
  '`?legal=…` reste lu au démarrage : c’est l’adresse inscrite dans les fiches App Store et Play Store');
ok(/data-legal/.test(src)&&/_lgA/.test(src),
  'et le clic reste intercepté dans l’app — on ne quitte pas l’application pour lire ses propres conditions');


/* F — LE PIÈGE QUI NE SE SERAIT VU QUE CHEZ LES VISITEURS DÉJÀ VENUS.
   `sw.js` rendait la coquille de l'application pour TOUTE navigation. Un moteur, qui
   n'exécute aucun service worker, aurait vu la page légale ; un visiteur revenu une
   seconde fois aurait reçu l'accueil de l'application à la place. Mesuré des deux
   côtés : sans l'exception, `/legal/cgu.html` rend « Un pro de confiance… ». */
(async()=>{
  const http=require('http');
  const serveur=http.createServer((rq,rs)=>{
    const f2=decodeURIComponent((rq.url||'/').split('?')[0]).replace(/^\/+/,'')||'index.html';
    const dest=path.join(RACINE,f2);
    if(!dest.startsWith(RACINE)||!fs.existsSync(dest)||fs.statSync(dest).isDirectory()){rs.statusCode=404;return rs.end('non');}
    const t={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png',
      '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.xml':'application/xml'}[path.extname(dest)]||'text/plain';
    rs.setHeader('Content-Type',t); rs.end(fs.readFileSync(dest));
  });
  await new Promise(r=>serveur.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+serveur.address().port;
  console.log('\nF — une page légale survit au service worker');
  const {chromium}=require('playwright-core');
  const o2={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o2.executablePath='/opt/pw-browsers/chromium';
  const b=await chromium.launch(o2);
  const ctx=await b.newContext({viewport:{width:390,height:844},locale:'fr-FR',serviceWorkers:'allow'});
  const p2=await ctx.newPage();
  await p2.goto(base+'/index.html',{waitUntil:'load'}); await p2.waitForTimeout(2500);
  const actif=await p2.evaluate(()=>!!(navigator.serviceWorker&&navigator.serviceWorker.controller));
  ok(actif,'le service worker prend bien la main (sans quoi l’épreuve ne mesurerait rien)');
  await p2.goto(base+'/legal/cgu.html',{waitUntil:'load'}); await p2.waitForTimeout(600);
  const vu=await p2.evaluate(()=>({t:document.title,h1:(document.querySelector('h1')||{}).innerText||''}));
  ok(/Conditions Générales d’Utilisation/.test(vu.t),
    'et la page rendue est bien le document, pas l’accueil de l’app — « '+vu.t+' »');
  ok(/legal/.test(fs.readFileSync(path.join(RACINE,'sw.js'),'utf8').match(/req\.mode === 'navigate'[^\n]*/)[0]),
    'l’exception est écrite sur la règle de navigation elle-même');

  /* G — ET ON PEUT Y ARRIVER SANS JAVASCRIPT. Les pages sont lisibles telles quelles,
     mais encore faut-il les ATTEINDRE : l'écran de démarrage est retiré PAR LE SCRIPT,
     donc sans script il restait à 390 × 844, opaque, par-dessus tout — le visiteur
     voyait une pieuvre sur fond crème, définitivement, et jamais le bloc `noscript`
     écrit pour lui juste en dessous. Mesuré avant : `elementFromPoint` au centre de
     l'écran rendait l'écran de démarrage. */
  console.log('\nG — sans JavaScript du tout, on voit et on atteint les textes');
  const ctx2=await b.newContext({viewport:{width:390,height:844},locale:'fr-FR',javaScriptEnabled:false});
  const p3=await ctx2.newPage();
  await p3.goto(base+'/index.html',{waitUntil:'load'});
  const sansJs=await p3.evaluate(()=>{
    const sp=document.getElementById('splash');
    const l=[...document.querySelectorAll('a[href^="legal/"]')].filter(a=>a.getBoundingClientRect().height>0);
    return {splash:sp?getComputedStyle(sp).display:'absent', liens:l.length,
      devant:(()=>{const t=document.elementFromPoint(195,300);return t?(t.id||t.tagName):'?';})()};});
  ok(sansJs.splash==='none','l’écran de démarrage s’efface de lui-même ('+sansJs.splash+')');
  ok(sansJs.devant!=='splash','et il n’intercepte plus les clics — au centre de l’écran : '+sansJs.devant);
  ok(sansJs.liens>=6,'les liens vers les documents sont visibles et cliquables ('+sansJs.liens+')');
  await p3.click('a[href="legal/cgv.html"]'); await p3.waitForLoadState('load');
  const lu=await p3.evaluate(()=>({t:document.title,
    mots:(document.body.innerText||'').split(/\s+/).filter(Boolean).length}));
  ok(/Conditions Générales de Vente/.test(lu.t)&&lu.mots>400,
    'et le texte entier se lit, sans qu’une ligne de l’application ne s’exécute ('+lu.mots+' mots)');
  await ctx2.close();

  await b.close(); serveur.close();
  console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
  process.exit(f?1:0);
})();
