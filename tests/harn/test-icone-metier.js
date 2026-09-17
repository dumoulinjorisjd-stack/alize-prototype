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
ok(/data-catname="\$\{id\}"/.test(src)&&/\$\{nomChamp\(s\.id,s\.nm\)\}/.test(src),
  'la carte de CHAQUE métier porte un champ de renommage, par un gabarit commun');
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
ok(/if\(!r\.ok\)\{renommerMetier\(id,av\);toast\(r\.raison\);\}/.test(src),
  'le refus rend le nom précédent au lieu de laisser le champ dans un état faux');

console.log('\nF — le bloc vit dans le corps de la carte, pas dans l’éditeur de tarif');
ok(/\$\{optionsEditorHtml\(s\.id\)\}\$\{metierEditor\}/.test(src),
  'il suit les options, donc il paraît quelle que soit la façon dont le métier se tarife');
ok(!/priceCtl\(s\.id,px,'\/h','Tarif horaire'\)\+\(s\.custom/.test(src),
  '« Retirer ce métier » n’est plus enfermé dans la branche horaire — un métier à qui on avait '+
  'ajouté des prestations basculait dans la grille à l’acte, où il devenait irretirable');
ok(/\$\{nomChamp\(s\.id,s\.nm\)\}\$\{!s\.custom\?'':`/.test(src),
  'le NOM se corrige partout, mais l’icône et le retrait restent aux seuls métiers créés '+
  'sans code — les vingt du fichier ont leur dessin fait pour eux');

console.log('\nH — les vingt métiers du code se renomment aussi');
const bi=await p.evaluate(()=>{
  const S=window.__S; S.customServices=[]; S.nomsMetiers={};
  const r=window.__svc.renomme('menage','Ménage à domicile');
  return {ok:r.ok, nom:window.__svc.nom('menage'), liste:window.__svc.liste(),
          defaut:window.__svc.defaut('menage'),
          // le même objet que lisent les vingt `SERVICES.find(...)` du fichier
          direct:(function(){const S=window.__S;return window.__svc.nom('menage');})()};
});
ok(bi.ok&&bi.nom==='Ménage à domicile','« Ménage » se renomme sans mise en ligne');
ok(bi.defaut==='Ménage','le nom écrit dans le code reste connu — il y a de quoi revenir en arrière');
ok(bi.liste.length===1&&bi.liste[0].id==='menage','et SEUL ce qui diffère est enregistré');

const cat=await p.evaluate(()=>{
  const r=window.__svc.renomme('beaute','Beauté & bien-être');
  return {ok:r.ok, nom:window.__svc.nom('beaute'), n:window.__svc.liste().length};
});
ok(cat.ok&&cat.nom==='Beauté & bien-être','les trois regroupements de l’accueil se renomment par la même porte');
ok(cat.n===2,'chacun compte pour une seule entrée');

const retour=await p.evaluate(()=>{
  window.__svc.renomme('menage','Ménage');
  return {nom:window.__svc.nom('menage'), liste:window.__svc.liste().map(x=>x.id)};
});
ok(retour.nom==='Ménage','rendre le nom d’origine le rétablit');
ok(retour.liste.indexOf('menage')<0,
  'et RETIRE la clé — sans quoi une correction faite dans le code ne reviendrait plus jamais');

console.log('\nI — ce qui est enregistré est une LISTE, pas un objet');
ok(/noms:nomsEnListe\(\)/.test(src),'le catalogue écrit une liste');
ok(/function nomsEnListe\(\)/.test(src)&&/function nomsValides\(d\)\{const out=\{\};if\(!Array\.isArray\(d\)\)/.test(src),
  'et la relit comme telle — un OBJET écrit en « merge » fusionne clé par clé, donc un nom '+
  'rendu à sa valeur d’origine n’aurait jamais quitté le serveur');
const relu=await p.evaluate(()=>{
  window.__svc.relit({noms:[{id:'menage',nm:'Ménage complet'},{id:'c_inconnu',nm:'X'},
                            {id:'jardin',nm:'   '},{id:'baby',nm:'Baby-sitting'}]});
  return {menage:window.__svc.nom('menage'), jardin:window.__svc.nom('jardin'),
          ids:window.__svc.liste().map(x=>x.id)};
});
ok(relu.menage==='Ménage complet','un nom réécrit revient du document partagé');
ok(relu.ids.indexOf('c_inconnu')<0,'un identifiant inconnu n’entre pas');
ok(relu.jardin==='Jardinage','un nom vide ne vide pas la tuile — elle reprend le nom du code');
ok(relu.ids.indexOf('baby')<0,'un nom ÉGAL au code n’est pas gardé — on n’enregistre que ce qui diffère');
const long=await p.evaluate(()=>{
  window.__svc.relit({noms:[{id:'menage',nm:'M'.repeat(5000)}]});
  return window.__svc.nom('menage').length;
});
ok(long<=40,'un nom démesuré est borné ('+long+' signes) — il casserait la mise en page de tous les clients');

console.log('\nJ — les deux refus valent pour les métiers du code');
const ref=await p.evaluate(()=>{
  window.__svc.relit({noms:[]});
  return {vide:window.__svc.renomme('menage',''), pris:window.__svc.renomme('menage','Jardinage'),
          apres:window.__svc.nom('menage')};
});
ok(!ref.vide.ok&&/sans nom/.test(ref.vide.raison),'un métier du code ne peut pas non plus être sans nom');
ok(!ref.pris.ok&&/déjà au catalogue/.test(ref.pris.raison),'ni prendre le nom d’un autre');
ok(ref.apres==='Ménage','et un refus ne laisse rien d’écrit');
ok(/Un nom réécrit s'affiche <b>tel quel<\/b> en anglais et en portugais/.test(src),
  'la conséquence sur les traductions est DITE — un nom réécrit n’a pas d’entrée au dictionnaire');
ok(/data-adm="catnomdef:\$\{id\}"/.test(src),'et « Rétablir » évite de retaper le nom d’origine à la lettre près');

console.log('\nG — une seule porte pour l’icône d’un service');
ok(!/I\[s\.id\]\|\|svcIco\(s\.id\)/.test(src),
  'plus de double recherche qui court-circuiterait le choix de l’administrateur');
const portes=(src.match(/svcIco\(/g)||[]).length;
ok(portes>=12,'les écrans passent tous par svcIco ('+portes+' appels) — accueil, console, choix des métiers');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
})();
