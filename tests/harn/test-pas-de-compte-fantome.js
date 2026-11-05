/* LE COMPTE FANTÔME : « Camille Magras » quand le serveur ne répond pas.

   « Avec le compte admin parfois la connexion marche mal et je tombe sur ce compte,
   je ferme tout et c'est bon. » (05/11/2026)

   LA CAUSE, LUE DANS LE CODE : « Camille Magras » est le personnage de la MAQUETTE
   (ADMIN_CLIS, ADMIN_BOOK, et le repli de `attemptLogin` sans serveur). Quand les
   modules Firebase ne se chargent pas — réseau faible, gstatic injoignable — `initFirebase`
   tombait dans son `catch` (« Firebase indisponible, mode démo »), laissait FB à null, et
   l'application continuait COMME LA MAQUETTE : « Se connecter » fabriquait un compte local
   « Camille Magras » et disait « Content de vous revoir ». Fermer et rouvrir rechargeait
   les modules sur une connexion revenue, d'où « je ferme tout et c'est bon ».

   LA FRONTIÈRE : la configuration Firebase existe ET nous sommes servis par un hôte (pas
   un fichier local, pas le banc) → l'absence de FB est une PANNE. On le dit, on réessaie
   tout seul, et aucun geste ne fabrique une identité en attendant. Sous `file://`, le
   prototype garde son comportement — c'est la moitié qui compte (section C).

   CE QUE CHAQUE CONTRE-ÉPREUVE FAIT ROUGIR :
     · la garde de `attemptLogin` retirée ................ 3 mesures (le fantôme revient)
     · le bandeau n'est plus posé à l'échec du chargement .. 2 mesures — au boot, et après
       le rechargement. Celui de `panneServeur` est un FILET : il repose le bandeau au premier
       geste, donc le retirer seul ne fait rougir PERSONNE (mesuré), et avec le `catch` retiré
       il garde « Réessayer » présent après « Se connecter ». Les deux portes restent.
     · `sansServeur` ne regarde plus le protocole ........ 2 mesures (le banc file:// devient une panne) */
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const SRC=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

(async()=>{
const serveur=http.createServer((rq,rs)=>{
  const f2=decodeURIComponent((rq.url||'/').split('?')[0]).replace(/^\/+/,'')||'app.html';
  const dest=path.join(RACINE,'tests/harn',f2);
  if(!fs.existsSync(dest)||fs.statSync(dest).isDirectory()){rs.statusCode=404;return rs.end('non');}
  rs.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.js':'text/javascript'}[path.extname(dest)]||'application/octet-stream'); rs.end(fs.readFileSync(dest));
});
await new Promise(r=>serveur.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+serveur.address().port+'/app.html';
const b=await chromium.launch(o);
// Le réseau est COUPÉ hors du serveur local : c'est exactement « la connexion marche mal ».
async function ouvrir(url){
  const ctx=await b.newContext({viewport:{width:390,height:844},locale:'fr-FR'});
  const p=await ctx.newPage(); const tentatives=[];
  await p.route('**/*',r=>{ const u=r.request().url(); if(/^http:\/\/127\.0\.0\.1/.test(u)||/^file:/.test(u))return r.continue(); tentatives.push(u); r.abort(); });
  p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto(url); await p.waitForFunction(()=>window.__S&&window.__srv); await p.waitForTimeout(900);
  return {ctx,p,tentatives};
}
// L'écran de connexion n'existe que dans l'application installée (sinon la barrière
// d'installation) : on pose la marque, comme le ferait l'app ouverte en plein écran.
const connexion=(p)=>p.evaluate(()=>{ const S=window.__S; try{localStorage.setItem('ti_installee','1');}catch(_){} S.onboarded=false; S.persona='client'; S.authView='login'; S.loginForm={email:'admin@ti-services.fr',password:'secret',remember:true}; window.__render();
  const fm=document.querySelector('[data-loginform]'); if(!fm)return {absent:true,texte:document.body.innerText.slice(0,200)};
  fm.requestSubmit();
  return {onboarded:!!S.onboarded, nom:(S.account&&S.account.name)||null, texte:document.body.innerText.replace(/\s+/g,' '), toast:(document.getElementById('toast')||{}).textContent||''}; });

console.log('\nA — servie par un hôte, sans réseau : c’est une panne, et elle se dit');
{ const {ctx,p,tentatives}=await ouvrir(base);
  const e=await p.evaluate(()=>({fb:window.__srv.fb(),sans:window.__srv.sans(),panne:window.__srv.panne(),demo:!!window.__S.demoMode,
    bandeau:(document.getElementById('fbPanne')||{}).innerText||''}));
  ok(tentatives.some(u=>/gstatic\.com\/firebasejs/.test(u)),'Firebase a bien été demandé, et le réseau l’a refusé ('+tentatives.filter(u=>/firebasejs/.test(u)).length+' tentatives)');
  ok(!e.fb&&e.sans,'FB est resté nul, et l’application SAIT que c’est une panne et non la maquette');
  ok(e.panne&&/Pas de connexion au serveur/.test(e.bandeau)&&/Réessayer/.test(e.bandeau),'le bandeau le dit, avec un bouton — « '+e.bandeau.replace(/\s+/g,' ')+' » (panne='+e.panne+')');
  console.log('\nB — « Se connecter » ne fabrique AUCUN compte');
  const r=await connexion(p);
  ok(!r.onboarded&&!r.nom,'on n’est pas entré, aucun compte local n’est né (nom : '+r.nom+')');
  ok(!/Camille Magras/.test(r.texte)&&!/Content de vous revoir/.test(r.texte),'aucune trace du personnage de la maquette ni de son « Content de vous revoir »');
  ok(/Pas de connexion au serveur/.test(r.toast),'et le geste reçoit sa raison — « '+r.toast+' »');
  const sg=await p.evaluate(()=>{ const S=window.__S; S.authView='signup'; S.clientForm={name:'Test Fantôme',email:'t@f.fr',zone:'Gustavia',password:'secret1',password2:'secret1',photo:'',cgu:true}; window.__render();
    const bt=document.querySelector('[data-act="signup"]'); if(bt)bt.click(); return {onboarded:!!S.onboarded,nom:(S.account&&S.account.name)||null}; });
  ok(!sg.onboarded&&!sg.nom,'l’inscription non plus (nom : '+sg.nom+')');
  console.log('\nC bis — « Réessayer » RECHARGE la page : un import de module raté est mémorisé par le navigateur');
  // Mesuré avant d'écrire : rappeler `initFirebase` ne redemandait RIEN (4 → 4 tentatives).
  const avant=tentatives.filter(u=>/firebasejs/.test(u)).length; const navs=[];
  p.on('framenavigated',fr=>{ if(fr===p.mainFrame())navs.push(fr.url()); });
  // On mesure l'ABSENCE du bouton au lieu de buter dessus : une épreuve qui lève n'est pas une mesure.
  const retry=await p.evaluate(()=>{const b=document.getElementById('fbPanneRetry'); if(b)b.click(); return !!b;}); await p.waitForTimeout(1500);
  ok(retry,'le bouton « Réessayer » est là');
  const apres=tentatives.filter(u=>/firebasejs/.test(u)).length;
  ok(navs.length>=1&&apres>avant,'le bouton recharge ('+navs.length+' navigation) et Firebase est redemandé ('+avant+' → '+apres+' tentatives)');
  await p.waitForFunction(()=>window.__srv).catch(()=>{}); await p.waitForTimeout(900);
  ok(await p.evaluate(()=>window.__srv.panne()),'…et le bandeau revient tant que ça échoue');
  await ctx.close(); }

console.log('\nC — sous file://, le prototype garde sa maquette (le banc et l’ouverture locale)');
{ const {ctx,p}=await ouvrir('file://'+path.join(RACINE,'tests/harn/app.html'));
  const e=await p.evaluate(()=>({sans:window.__srv.sans(),panne:window.__srv.panne()}));
  ok(!e.sans&&!e.panne,'pas de panne déclarée, pas de bandeau');
  const r=await connexion(p);
  ok(r.onboarded&&r.nom==='Camille Magras','et « Se connecter » y fabrique bien le compte de la maquette, comme avant (nom : '+r.nom+')');
  await ctx.close(); }

console.log('\nD — le code : chaque repli de la maquette passe par la frontière');
const replis=(SRC.match(/else if\(sansServeur\(\)\)\{panneServeur\(\);\}/g)||[]).length+(SRC.match(/else if\(sansServeur\(\)\)\{ panneServeur\(\); \}/g)||[]).length+(SRC.match(/if\(sansServeur\(\)\)\{panneServeur\(\);break;\}/g)||[]).length;
ok(replis>=7,'connexion, inscription client, Google ×3, dossier prestataire ×2, conciergerie : '+replis+' replis gardés');
ok(!/console\.warn\('Firebase indisponible, mode démo',e\)/.test(SRC),'le `catch` ne dit plus « mode démo » à une application servie par un hôte');

await b.close(); serveur.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
