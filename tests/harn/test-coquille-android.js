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
const RACINE='/home/user/alize-work';
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

console.log('\nD — personne n’est enfermé dehors');
ok(/body\.native-shell \[data-act="google-client"\]/.test(src),
  'les boutons Google restent masqués dans l’app — Google les y interdit');
ok(/native-only/.test(src)&&/Vous vous êtes inscrit avec Google/.test(src),
  'mais l’application explique enfin comment se connecter malgré tout');
ok(/\.native-only\{display:none\}/.test(src)&&/body\.native-shell \.native-only\{display:block\}/.test(src),
  'et ce message n’apparaît QUE dans l’app, où il a un sens');

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

console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
process.exit(f?1:0);
