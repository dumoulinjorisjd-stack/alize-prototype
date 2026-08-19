/* CE QUI NE SE VOIT QUE DANS L'APPLICATION INSTALLÉE.
   Le site marche, l'app installée non — c'est le pire des écarts, parce qu'aucun test
   de navigateur ne le montre. Trois défauts trouvés sur un vrai téléphone Android :

     · la barre des onglets passait SOUS la barre système. Le plafond de 10 px de marge
       basse est un choix iPhone ; Android 15 dessine l'application bord à bord et
       réclame jusqu'à 48 px.
     · le bouton retour du téléphone FERMAIT l'application depuis n'importe quel écran.
       Capacitor ne relie plus le bouton système à l'historique de la page.
     · le point GPS enregistrait le CENTRE DE L'ÎLE quand la position échouait, en
       annonçant « Point GPS enregistré ». Le client croyait pointer sa maison.

   Et un quatrième, de conception : la connexion Google est masquée dans l'app (Google
   l'interdit en WebView), ce qui laissait sans issue ceux qui s'étaient inscrits ainsi. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

console.log('\nA — la barre des onglets n’est plus cachée par la barre système');
ok(/document\.body\.classList\.add\('native-android'\)/.test(src),
  'la coquille Android se distingue de la coquille iOS');
ok(/body\.native-android \.navbar\{padding-bottom:max\(6px, env\(safe-area-inset-bottom\)\)\}/.test(src),
  'et y prend la marge réelle du système, sans plafond');
ok(/body\.native-android \.view>div:has\(>\.navbar\)>\.pad\{padding-bottom:calc\(62px \+ max\(6px, env\(safe-area-inset-bottom\)\)\)\}/.test(src),
  'le contenu réserve la même hauteur, sinon le bas de page passerait dessous');
ok(/clamp\(6px, env\(safe-area-inset-bottom\), 10px\)/.test(src),
  'le plafond iPhone est conservé — il corrigeait une vraie bande blanche');

console.log('\nB — le bouton retour du téléphone remonte au lieu de quitter');
ok(/addListener\('backButton'/.test(src),'l’application écoute le bouton système');
const bb=src.slice(src.indexOf("addListener('backButton'"));
ok(/if\(canGoBack\(\)\)\{ goBack\(\); return; \}/.test(bb.slice(0,400)),
  'il emprunte exactement le même chemin que la flèche de l’écran');
ok(/A\.exitApp\(\)/.test(bb.slice(0,400)),'et ne ferme l’application que depuis la racine');
const pkg=JSON.parse(fs.readFileSync(path.join(RACINE,'capacitor-android','package.json'),'utf8'));
ok(!!pkg.dependencies['@capacitor/app'],
  'le module qui expose ce bouton est déclaré — sans lui, l’écouteur ne serait jamais appelé');

console.log('\nC — le point GPS ne ment plus');
const g=src.slice(src.indexOf('function geolocate('),src.indexOf('function geolocate(')+1600);
// La coordonnée du centre de l'île subsiste ailleurs à bon droit : balises SEO,
// données structurées, adresse de démonstration. C'est DANS geolocate qu'elle mentait.
ok(!/17\.8962/.test(g),'le repli sur le centre de l’île a disparu de la localisation');
ok(/timeout:20000/.test(g),'le délai laisse le temps à un GPS froid d’accrocher');
ok(/p\.coords\.accuracy/.test(g),'la précision obtenue est lue');
ok(/Position approximative à ±/.test(g),'et annoncée quand elle est mauvaise');
ok(/Localisation refusée/.test(g)&&/Position trop longue/.test(g),
  'un échec se dit, avec sa cause');
ok(!/toast\('Point GPS enregistré'\)/.test(src),
  'plus aucun « enregistré » qui ne corresponde à rien');

console.log('\nD — les boutons Google restent masqués dans l’app');
ok(/body\.native-shell \[data-act="google-client"\]/.test(src),
  'Google interdit sa propre connexion en WebView — le bouton reste masqué');

console.log('\nF — la mise à jour ne s’annonce plus dans l’app installée');
ok(/function handleUpdateAvailable\(reg\)\{/.test(src),'un aiguillage existe avant le bandeau');
const hu=src.slice(src.indexOf('function handleUpdateAvailable('));
ok(/if\(isNativeShell\(\)\)\{ scheduleNativeUpdate\(reg\); return; \}/.test(hu.slice(0,200)),
  'dans l’app, la mise à jour ne passe plus par le bandeau visible');
ok(/if\(document\.visibilityState==='hidden'\)\{ applyNativeUpdate\(reg\); return; \}/.test(src),
  'elle attend que l’écran ne soit plus regardé');
ok(/document\.visibilityState==='hidden'&&_pendingNativeUpdate/.test(src),
  'et se déclenche au moment où l’app repasse en arrière-plan');
ok(/handleUpdateAvailable\(reg\);\s*\n\s*reg\.addEventListener\('updatefound'/.test(src),
  'l’aiguillage couvre la mise à jour déjà prête au chargement');
ok(/nw\.state==='installed'&&navigator\.serviceWorker\.controller\)handleUpdateAvailable\(reg\);/.test(src),
  'et celle qui arrive pendant que l’app tourne');

console.log('\nE — la localisation est déclarée dans les deux coquilles');
const man=fs.readFileSync(path.join(RACINE,'capacitor-android','android','app','src','main','AndroidManifest.xml'),'utf8');
ok(/ACCESS_FINE_LOCATION/.test(man)&&/ACCESS_COARSE_LOCATION/.test(man),
  'Android demande les deux permissions');
const plist=fs.readFileSync(path.join(RACINE,'capacitor','ios','App','App','Info.plist'),'utf8');
ok(/NSLocationWhenInUseUsageDescription/.test(plist),'iOS porte sa phrase d’explication');

console.log('\nG — la marge basse ne manque plus, même sans barre d’onglets');
// Chaque écran SANS barre d'onglets (connexion, inscription, documents légaux,
// conversation…) perdait sa marge basse : .pad ne consultait jamais
// env(safe-area-inset-bottom), contrairement à .footcta/.sheet qui le font déjà
// sans condition — la valeur vaut 0 partout ailleurs, un plein écran seul la rend
// non nulle. La barre système Android passait donc par-dessus les boutons.
ok(/\.pad\{padding:6px 18px calc\(26px \+ env\(safe-area-inset-bottom\)\)\}/.test(src),
  'la marge basse de .pad suit désormais la zone sûre, comme .footcta le fait déjà');
ok(!/style="padding:6px 18px 26px"/.test(src),'aucune trace de l’ancienne valeur fixe');

console.log('\nH — plus d’encart Google dans l’écran de connexion');
ok(!/Vous vous êtes inscrit avec Google/.test(src),'le texte a été retiré, à la demande');
ok(!/\.native-only\{display:none\}/.test(src),'et son habillage CSS avec lui — rien d’orphelin');

console.log('\nI — le bouton retour matériel ferme réellement ce que le bouton retiré fermait');
ok(/function tryVisibleBackLink\(\)\{/.test(src),'un filet général existe, avant la longue liste d’états');
ok(/if\(tryVisibleBackLink\(\)\)return;/.test(src),'goBack() le consulte en premier');
ok(/'\.reset\[data-act\]:not\(\[data-act="mollie-refresh"\]\), \.reset\[data-adm\]'/.test(src),
  'il ignore le bouton « Actualiser », qui n’est pas un bouton retour');
ok(/body\.native-android \.backfab\{display:none!important\}/.test(src),
  'la bulle flottante disparaît sur Android — elle appelait déjà goBack(), donc rien à couvrir en plus');
ok(/body\.native-android \.reset\[data-act\]:not\(\[data-act="mollie-refresh"\]\),/.test(src),
  'les liens « ← ... » disparaissent avec elle, avec la même exception');

(async()=>{
  const b2=await chromium.launch(o);
  const p=await (await b2.newContext({locale:'fr-FR',viewport:{width:420,height:1300}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps|tile/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);

  console.log('\nJ — deux écrans qui n’avaient AUCUN moyen de se fermer au bouton matériel');
  // Sous-catégorie ouverte sur l'accueil client. Avant le filet général, goBack() ne
  // connaissait pas S.catView : le bouton matériel n'y faisait RIEN.
  const cat=await p.evaluate(()=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.lang='fr';S.onboarded=true;S.guest=false;S.demoMode=false;S.persona='client';S.clientNav='home';
    S.account={name:'Joris',email:'j@e.fr',zone:'Gustavia'};S.catView='beaute';S.mission=null;S.draft=null;
    window.__render();
    const avant=window.__S.catView;
    window.__back();
    return {avant, apres:window.__S.catView};
  });
  ok(cat.avant==='beaute','la sous-catégorie était bien ouverte avant le geste');
  ok(cat.apres===null,'le bouton retour matériel la ferme désormais');

  // Détail des factures d'un client, côté prestataire. Même défaut, côté S.invClient.
  const inv=await p.evaluate(()=>{
    const S=window.__S;S.persona='pro';S.proNav='earnings';S.mission=null;
    // Prestataire VALIDÉ, sinon l'écran affiché est « Candidature envoyée », pas les
    // factures. Le détail d'un client n'existe que s'il a au moins une mission à son nom.
    S.proStatus='approved';S.proMollie='active';S.proMollieCanWork=true;S.proInsured=true;
    S.proHistory=[{id:'h1',clientFull:'Villa Rose',svc:'menage',dateISO:'2026-08-01',unit:'h',duration:3,invNo:'FA-1',tip:0}];
    S.interv=true;S.invClient='Villa Rose';
    window.__render();
    const avant=window.__S.invClient;
    window.__back();
    return {avant, apres:window.__S.invClient};
  });
  ok(inv.avant==='Villa Rose','le détail du client était bien ouvert avant le geste');
  ok(inv.apres===null,'le bouton retour matériel le ferme désormais aussi');

  ok(errs.length===0,'aucune erreur JS pendant ces deux gestes ('+errs.join(' | ')+')');
  await b2.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
