/* L'ICÔNE D'UN MÉTIER CRÉÉ DEPUIS LA CONSOLE.

   « Dans la console admin, je ne peux pas modifier manuellement le nom d'une catégorie,
   peux-tu mettre à jour l'icône pour le service administratif. »

   Vingt métiers sont dessinés dans la charte maison ; le vingt-et-unième — celui qu'un
   administrateur ajoute sans code — recevait le rond-plus générique À VIE. La cause tient
   en une ligne : svcIco renvoyait I.other dès que le service était `custom`, AVANT même de
   regarder la table. Aucun réglage ne pouvait le corriger, il n'existait pas de champ.

   Et son NOM ne se corrigeait nulle part : une coquille se réparait en supprimant puis
   recréant, ce qui forge un identifiant NEUF et détache en silence les prestataires qui
   portaient l'ancien dans leurs métiers.

   Ce qui est enregistré est une CLÉ d'une liste FERMÉE, jamais un dessin : le catalogue
   est un document partagé, écrit par la console et relu par tout le monde en innerHTML. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');

(async()=>{
const b=await chromium.launch(o); const p=await b.newPage();
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__svc&&window.__S);

console.log('\nA — l’icône n’est plus condamnée au rond-plus');
const av=await p.evaluate(()=>{
  const S=window.__S; S.customServices=[];
  window.__svc.ajoute('Services administratifs',30);
  const s=(window.__S.customServices||[])[0];
  return {id:s&&s.id, defaut:window.__svc.ico(s.id), autre:window.__svc.table().other};
});
ok(!!av.id&&av.id.indexOf('c_')===0,'un métier ajouté depuis la console reçoit bien un identifiant « c_… »');
ok(av.defaut===av.autre,'sans choix, il garde le rond-plus — aucun compte existant ne change d’allure');

const ap=await p.evaluate(()=>{
  const s=window.__S.customServices[0]; s.ico='administratif';
  return {rendu:window.__svc.ico(s.id), attendu:window.__svc.table().administratif, autre:window.__svc.table().other};
});
ok(ap.rendu===ap.attendu&&ap.rendu!==ap.autre,'une fois l’icône choisie, c’est ELLE qui est rendue');
ok(/administratif:'<svg /.test(src),'et « Démarches » existe dans la charte maison, en SVG comme les vingt autres');
ok(!/administratif:'[^']*[\u{1F300}-\u{1FAFF}☀-➿]/u.test(src),'pas un emoji — le dessin ne dépend pas de la police du système');

console.log('\nB — ce qui est enregistré est une CLÉ, jamais un dessin');
const mal=await p.evaluate(()=>{
  const hostile='"><svg onload=alert(1)><img src=x onerror=alert(1)>';
  window.__svc.relit({services:[{id:'c_x',nm:'X',rate:30,ico:hostile}]});
  const s=window.__S.customServices[0];
  return {garde:s.ico, rendu:window.__svc.ico('c_x'), autre:window.__svc.table().other};
});
ok(mal.garde==='','une valeur qui n’est pas de la liste ne survit pas à la relecture du catalogue');
ok(mal.rendu===mal.autre,'et elle retombe sur le rond-plus, sans jamais atteindre la page');
ok(mal.rendu.indexOf('onerror')<0&&mal.rendu.indexOf('onload')<0,'rien du texte hostile ne ressort');
const vide=await p.evaluate(()=>window.__svc.valide(undefined)+'|'+window.__svc.valide('administratif'));
ok(vide==='|administratif','la liste fermée accepte ce qu’elle connaît et rend vide le reste');
ok(/ico:icoValide\(s\.ico\)/.test(src),'la validation est posée À LA LECTURE du document partagé, pas à l’affichage');

console.log('\nC — toutes les icônes proposées existent vraiment');
const choix=await p.evaluate(()=>{
  const T=window.__svc.table();
  return window.__svc.choix().map(function(c){return {k:c[0],nom:c[1],ok:typeof T[c[0]]==='string'&&T[c[0]].indexOf('<svg')===0};});
});
ok(choix.length>=12,'le choix est assez large pour un vrai métier ('+choix.length+' icônes)');
ok(choix.every(c=>c.ok),'chacune est un vrai dessin de la table — aucun choix ne mènerait à un trou');
ok(choix.every(c=>c.nom&&c.nom.length>1),'chacune porte un nom lisible, pour l’infobulle et le lecteur d’écran');
ok(choix[0].k==='other','« Par défaut » vient en tête — c’est ce que porte un métier qu’on n’a pas réglé');

console.log('\nD — le nom se corrige SUR PLACE, l’identifiant ne bouge pas');
ok(/data-catname="\$\{s\.id\}"/.test(src),'la carte du métier porte un champ de renommage');
ok(/const cnm=e\.target\.closest\('\[data-catname\]'\)/.test(src),'la frappe est écoutée sans redessiner — le curseur reste dans le champ');
ok(/\[data-catpricev\]|\[data-catname\]/.test(src)&&/ecritDansCatalogue/.test(src)
  &&/\[data-optpricev\],\[data-catname\]/.test(src),
  'et le catalogue relu en temps réel ne redessine pas sous les doigts');
const idStable=await p.evaluate(()=>{
  window.__svc.relit({services:[{id:'c_admin',nm:'Srvices administratifs',rate:30,ico:'administratif'}]});
  const s=window.__S.customServices[0]; const avant=s.id;
  s.nm='Services administratifs';            // ce que fait le champ de renommage
  return {avant, apres:window.__S.customServices[0].id, nom:window.__S.customServices[0].nm,
          ico:window.__svc.ico('c_admin')===window.__svc.table().administratif};
});
ok(idStable.avant===idStable.apres,'corriger la coquille ne forge PAS un identifiant neuf');
ok(idStable.nom==='Services administratifs','le nom corrigé est bien celui retenu');
ok(idStable.ico,'et l’icône choisie survit au renommage');

console.log('\nE — deux refus, les mêmes qu’à la création');
ok(/Un métier ne peut pas être sans nom/.test(src),'un métier SANS NOM est refusé — il s’afficherait en tuile vide chez tous les clients');
ok(/est déjà au catalogue/.test(src),'un nom DÉJÀ PRIS est refusé — deux métiers identiques à l’écran, deux catalogues distincts');
ok(/sv\.nm=av;cnb\.value=av/.test(src),'le refus rend le nom précédent au lieu de laisser le champ dans un état faux');

console.log('\nF — le bloc vit dans le corps de la carte, pas dans l’éditeur de tarif');
ok(/\$\{optionsEditorHtml\(s\.id\)\}\$\{metierEditor\}/.test(src),
  'il suit les options, donc il paraît quelle que soit la façon dont le métier se tarife');
ok(!/priceCtl\(s\.id,px,'\/h','Tarif horaire'\)\+\(s\.custom/.test(src),
  '« Retirer ce métier » n’est plus enfermé dans la branche horaire — un métier à qui on avait '+
  'ajouté des prestations basculait dans la grille à l’acte, où il devenait irretirable');
ok(/const metierEditor=!s\.custom\?''/.test(src),'et rien de tout cela ne paraît sur les vingt métiers du code');

console.log('\nG — une seule porte pour l’icône d’un service');
ok(!/I\[s\.id\]\|\|svcIco\(s\.id\)/.test(src),
  'plus de double recherche qui court-circuiterait le choix de l’administrateur');
const portes=(src.match(/svcIco\(/g)||[]).length;
ok(portes>=12,'les écrans passent tous par svcIco ('+portes+' appels) — accueil, console, choix des métiers');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
