/* « SUR ORDINATEUR, LA PAGE DE PRÉSENTATION EST MOINS FOURNIE QUE SUR MOBILE. »

   Vérifié, et c'était pire que cela : au-delà de 1024 px, `body.desktop .brief` masque la
   vitrine ENTIÈRE et c'est l'écran d'accueil de l'application qu'on découvre — 121 mots
   contre 200 sur téléphone, sans rien en dessous. Un visiteur sur ordinateur n'apprenait
   ni comment ça marche, ni quels services existent, ni qu'on couvre les 16 quartiers,
   ni — en pleine campagne de recrutement — que l'ouverture est le 1er octobre et qu'il y
   a un programme Ambassadeur.

   ON NE RÉÉCRIT RIEN : le contenu est CLONÉ depuis la vitrine. Une seule source, une
   seule traduction — les nœuds clonés repassent par `i18nApply`, donc l'anglais et le
   portugais suivent sans qu'on ajoute une clé. Cette épreuve garde les deux propriétés
   qui comptent : le grand écran DIT ce que dit le téléphone, et le téléphone ne bouge
   pas d'un pixel. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const F='file://'+path.join(RACINE,'tests/harn/app.html');

(async()=>{
const b=await chromium.launch(o);
async function releve(w,h){
  const ctx=await b.newContext({viewport:{width:w,height:h},locale:'fr-FR',isMobile:w<500,hasTouch:w<500});
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
  await p.goto(F); await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{
    const vu=e=>{const r2=e.getBoundingClientRect();const st=getComputedStyle(e);
      return r2.width>0&&r2.height>0&&st.visibility!=='hidden'&&st.display!=='none';};
    const racines=[...document.querySelectorAll('.brief,#view')].filter(vu);
    const txt=racines.map(e=>e.innerText).join('\n');
    const n=sel=>racines.reduce((t,e)=>t+[...e.querySelectorAll(sel)].filter(vu).length,0);
    const v=document.getElementById('view');
    return {mots:txt.split(/\s+/).filter(Boolean).length,
      etapes:n('.pstep'), metiers:n('.jchip'), ile:n('.cover-isle'),
      ambassadeur:n('.land-founder'), ouverture:/1er octobre 2026/.test(txt),
      mobileDabord:/s.utilise sur téléphone|made for your phone|no telemóvel/.test(txt),
      plus:!!document.querySelector('.welcome-plus')&&vu(document.querySelector('.welcome-plus')),
      defile:v?v.scrollHeight>v.clientHeight+2:null,
      deborde:v?v.scrollWidth>v.clientWidth+2:null,
      hauteurBrief:(()=>{const e=document.querySelector('.brief');const r2=e.getBoundingClientRect();return Math.round(r2.height);})()};});
  await ctx.close(); return r;
}

console.log('\nA — l’ordinateur dit enfin ce que dit le téléphone');
const tel=await releve(390,844), ordi=await releve(1512,900);
ok(ordi.mots>=400,'le contenu passe de 121 à '+ordi.mots+' mots (téléphone : '+tel.mots+')');
ok(ordi.etapes===6,'les trois étapes de CHAQUE public sont là ('+ordi.etapes+') — un visiteur d’ordinateur peut être l’un ou l’autre');
ok(ordi.metiers>=9,'les métiers sont nommés ('+ordi.metiers+')');
ok(ordi.ile===1,'la carte de l’île paraît UNE fois — elle dit la même chose des deux côtés');
ok(ordi.ambassadeur===1,'le programme Ambassadeur est là : c’est l’argument de recrutement du moment');
ok(ordi.ouverture,'et la date d’ouverture du 1er octobre, qui n’apparaissait nulle part sur grand écran');

console.log('\nB — et il dit que l’application se vit sur téléphone');
ok(ordi.mobileDabord,'le bandeau l’explique : c’est l’app installée qui prévient');
ok(ordi.defile,'l’écran défile désormais — avant, la page n’avait rien en dessous');
ok(!ordi.deborde,'et rien ne déborde en largeur');

console.log('\nC — sur téléphone, RIEN ne change sauf ce qui a été demandé');
// La mise en page du téléphone est restée telle quelle à chaque étape de ce travail. Une
// seule chose y a changé, et sur demande expresse : la liste des métiers, qui porte
// désormais les icônes du catalogue au lieu de pastilles de couleur.
ok(!tel.plus,'le bloc du grand écran n’existe pas sur téléphone : la vitrine y est déjà complète');
ok(tel.etapes===3&&tel.ile===1&&tel.hauteurBrief>1000,
  'la vitrine garde ses étapes, son île et sa hauteur ('+tel.hauteurBrief+' px)');
ok(tel.metiers===ordi.metiers,
  'et sa liste de métiers est celle du catalogue, la même que sur grand écran ('+tel.metiers+')');

console.log('\nC bis — c’est une VITRINE : le client, les boutons, le professionnel');
{
  const ctx=await b.newContext({viewport:{width:1512,height:950},locale:'fr-FR'});
  const p2=await ctx.newPage();
  await p2.goto(F); await p2.waitForFunction(()=>window.__S&&window.__render); await p2.waitForTimeout(700);
  const g=await p2.evaluate(()=>{
    const y=e=>e?Math.round(e.getBoundingClientRect().top):null;
    const secs=[...document.querySelectorAll('.wp-cols>section')];
    const cta=document.querySelector('.wp-cta');
    const axes=new Set();
    secs.forEach(s2=>[...s2.children].forEach(e=>{
      const a=getComputedStyle(e).textAlign; axes.add(a==='start'?'left':a);}));
    const pad=document.querySelector('.pad.welcome').getBoundingClientRect();
    const hero=document.querySelector('.welcome-hero').getBoundingClientRect();
    const bas=document.querySelector('.welcome-bas').getBoundingClientRect();
    const rangees=secs.map(s2=>{const st=s2.querySelector('.pitch-steps');
      return st?new Set([...st.children].map(e=>Math.round(e.getBoundingClientRect().top))).size:null;});
    return {axes:[...axes], sections:secs.length, yClient:y(secs[0]), yCta:y(cta), yPro:y(secs[1]),
      boutons:cta?[...cta.querySelectorAll('button')].map(x=>x.dataset.act):[],
      largeurSection:Math.round(secs[0].getBoundingClientRect().width),
      part:Math.round(pad.width/window.innerWidth*100),
      rangees, vide:Math.round(bas.top-hero.bottom)};});
  ok(g.sections===2&&g.yClient<g.yCta&&g.yCta<g.yPro,
    'le client d’abord, les boutons, puis le professionnel — jamais côte à côte ('+g.yClient+' → '+g.yCta+' → '+g.yPro+')');
  ok(g.boutons.join(',')==='onb-start,go-artisan-signup',
    'et ce sont les deux boutons d’inscription, dans l’ordre — '+g.boutons.join(' · '));
  ok(g.rangees[0]===1&&g.rangees[1]===1,
    'chaque partie déploie ses trois étapes sur UNE rangée : c’est elle qui emploie la largeur, pas deux discours qui se concurrencent');
  ok(g.axes.length===1&&g.axes[0]==='left',
    'tous les blocs sont sur le MÊME axe ('+g.axes.join(', ')+') — avant, ils alternaient start et center');
  ok(g.part>=88,'la vitrine occupe '+g.part+' % de la fenêtre — elle en occupait 55');
  ok(g.largeurSection>=1200,'chaque partie prend toute la largeur ('+g.largeurSection+' px, contre 390 en deux colonnes)');
  ok(g.vide<=40,'et le vide entre le héros et la suite tombe à '+g.vide+' px (136 avant)');
  await ctx.close();
}

console.log('\nC ter — les métiers viennent du CATALOGUE, avec leurs icônes, et se mettent à jour seuls');
{
  const lire=async(w)=>{
    const ctx=await b.newContext({viewport:{width:w,height:950},locale:'fr-FR',isMobile:w<500,hasTouch:w<500});
    const p2=await ctx.newPage();
    await p2.goto(F); await p2.waitForFunction(()=>window.__S&&window.__render); await p2.waitForTimeout(700);
    const r=await p2.evaluate(()=>{
      const vu=e=>{const r2=e.getBoundingClientRect();return r2.width>0&&r2.height>0;};
      const ou=[...document.querySelectorAll('.jobs')].find(vu);
      if(!ou)return {absent:true};
      const ch=[...ou.querySelectorAll('.jchip')];
      return {clone:!!ou.closest('.welcome-plus'), n:ch.length,
        icones:ch.filter(c=>c.querySelector('.jc-ico svg')).length,
        pastilles:ch.filter(c=>c.querySelector('i')).length,
        hauteurs:[...new Set(ch.map(c=>Math.round(c.getBoundingClientRect().height)))],
        teintes:new Set(ch.map(c=>(c.querySelector('.jc-ico')||{style:{}}).style.color)).size,
        catalogue:(window.__S.customServices||[]).length+21};});
    await ctx.close(); return r;
  };
  const g=await lire(1512), m=await lire(390);
  ok(g.clone&&g.n===g.catalogue,
    'la grille porte TOUT le catalogue ('+g.n+' métiers), plus les neuf écrits à la main');
  ok(g.icones===g.n&&g.pastilles===0,
    'chacun porte l’icône de la charte, et plus aucune pastille');
  ok(g.teintes>=7,'chacune garde la teinte de son service ('+g.teintes+' distinctes) — c’est ce qui rend la grille lisible d’un coup d’œil');
  ok(g.hauteurs.length===1,'toutes les puces ont la même hauteur ('+g.hauteurs.join(', ')+' px), quelle que soit la longueur du nom');
  ok(!m.clone&&m.icones===m.n&&m.pastilles===0,
    'le téléphone porte les mêmes icônes, à la même source — '+m.icones+' sur '+m.n);
  ok(m.n===g.n,'et la même liste : le catalogue, pas neuf libellés écrits à la main ('+m.n+')');
  ok(m.hauteurs.length===1,'ses puces ont elles aussi une seule hauteur ('+m.hauteurs.join(', ')+' px)');

  // LA MISE À JOUR SE FAIT SEULE. `loadCatalog` écoute le document en continu, dès
  // l'ouverture et AVANT toute connexion ; `applyCatalogDoc` appelle `render`. Il n'y a
  // donc aucun bouton à presser : on éprouve ici que la grille se refait au rendu.
  const ctx=await b.newContext({viewport:{width:1512,height:950},locale:'fr-FR'});
  const p3=await ctx.newPage();
  await p3.goto(F); await p3.waitForFunction(()=>window.__S&&window.__render&&window.__svc); await p3.waitForTimeout(700);
  const avant=await p3.evaluate(()=>[...document.querySelectorAll('.welcome-plus .jchip')].length);
  const apres=await p3.evaluate(()=>{const S=window.__S;
    S.customServices=[{id:'vitrerie',nm:'Vitrerie',rate:40,custom:true,ico:'other'}];
    window.__svc.renomme('menage','Ménage & repassage');
    window.__render();
    return [...document.querySelectorAll('.welcome-plus .jchip')].map(c=>c.innerText.trim());});
  ok(apres.length===avant+1&&apres.some(x=>/Vitrerie/.test(x)),
    'un métier ajouté depuis la console paraît sur la vitrine, sans qu’on touche à rien ('+avant+' → '+apres.length+')');
  ok(apres.some(x=>/Ménage & repassage/.test(x)),
    'et un métier renommé porte son nouveau nom');
  await ctx.close();
  // Et la vitrine du TÉLÉPHONE se repeint elle aussi, aux trois moments où il le faut.
  const ctxT=await b.newContext({viewport:{width:390,height:844},locale:'fr-FR',isMobile:true,hasTouch:true});
  const pt=await ctxT.newPage();
  await pt.goto(F); await pt.waitForFunction(()=>window.__S&&window.__render&&window.__svc); await pt.waitForTimeout(700);
  const telAv=await pt.evaluate(()=>[...document.querySelectorAll('.brief .jchip')].length);
  const telAp=await pt.evaluate(()=>{const S=window.__S;
    S.customServices=[{id:'vitrerie',nm:'Vitrerie',rate:40,custom:true,ico:'other'}];
    window.__svc.renomme('menage','Ménage & repassage');
    // le chemin réel : un instantané du catalogue redessine ET repeint la vitrine
    if(typeof window.__render==='function')window.__render();
    const f=document.querySelector('.brief [data-act="lang-fr"]'); if(f)f.click();
    return [...document.querySelectorAll('.brief .jchip')].map(c=>c.innerText.trim());});
  ok(telAp.length===telAv+1&&telAp.some(x=>/Vitrerie/.test(x))&&telAp.some(x=>/Ménage & repassage/.test(x)),
    'sur téléphone aussi, l’ajout et le renommage arrivent sans qu’on touche à rien ('+telAv+' → '+telAp.length+')');
  const enTel=await pt.evaluate(()=>{const x=document.querySelector('.brief [data-act="lang-en"]');if(x)x.click();
    return new Promise(r=>setTimeout(()=>r([...document.querySelectorAll('.brief .jchip')].slice(0,3).map(c=>c.innerText.trim())),600));});
  ok(enTel.every(x=>!/^(Jardinage|Coiffure|Déménagement)$/.test(x)),
    'et la grille peinte se traduit — on peint AVANT de traduire, sinon elle resterait en français : '+enTel.join(' · '));
  await ctxT.close();

  const src2=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
  ok(/if\(ecritDansCatalogue\(\)\)return; render\(\);/.test(src2),
    'chaque instantané du catalogue redessine : c’est ce qui rend la mise à jour automatique');
  ok(/loadCatalog\(\); \/\/ catalogue partagé/.test(src2),
    'et l’écoute démarre à l’ouverture, avant toute connexion — donc sur la vitrine aussi');
  ok(/render\(\); applyLandLang\(\); \}/.test(src2),
    'le même instantané repeint la vitrine du téléphone, que `render` ne touche pas');
}

console.log('\nC quater — les deux boutons d’inscription ne sont qu’à UN endroit');
{
  const ctx=await b.newContext({viewport:{width:1512,height:950},locale:'fr-FR'});
  const p4=await ctx.newPage();
  await p4.goto(F); await p4.waitForFunction(()=>window.__S&&window.__render); await p4.waitForTimeout(700);
  const r=await p4.evaluate(()=>{
    const vu=e=>{const r2=e.getBoundingClientRect();return r2.width>0&&r2.height>0;};
    const dans=s2=>[...document.querySelectorAll(s2)].filter(vu).map(e=>e.dataset.act);
    return {heros:dans('.welcome .footcta>.btn.choice'), entre:dans('.wp-cta>.btn.choice'),
      connecter:[...document.querySelectorAll('.welcome .footcta [data-act="show-login"]')].filter(vu).length};});
  ok(r.heros.length===0,'plus de boutons corail en tête : on ne les offre pas avant d’avoir rien expliqué');
  ok(r.entre.join(',')==='onb-start,go-artisan-signup','ils sont entre les deux parties, dans l’ordre');
  ok(r.connecter===1,'et « Déjà un compte ? Se connecter » reste : ce n’est pas la même demande');
  await ctx.close();
}

console.log('\nD — une seule source : le contenu est CLONÉ, pas recopié');
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
ok(/src\.innerHTML=\(_briefFR!=null\?_briefFR:br\.innerHTML\)/.test(src),
  'il est pris dans la vitrine elle-même — deux textes qui disent la même chose divergent');
ok(/querySelectorAll\('\[id\]'\)\.forEach\(e=>e\.removeAttribute\('id'\)\)/.test(src),
  'les identifiants sont retirés du clone : deux éléments de même `id` dans une page, c’est une animation qui vise le mauvais');
// On compte les occurrences DANS LE BALISAGE : les deux autres sont les clés anglaise
// et portugaise du dictionnaire, ce qui est leur place.
const compte=(src.match(/Commandez en deux gestes</g)||[]).length;
ok(compte===1,'la phrase n’est écrite qu’UNE fois dans le balisage (« Commandez en deux gestes » : '+compte+')');

console.log('\nE — et les trois langues suivent sans une clé de plus pour la vitrine');
for(const [lg,mot] of [['en','made for your phone'],['pt','no telemóvel']]){
  const ctx=await b.newContext({viewport:{width:1512,height:900},locale:'fr-FR'});
  const p=await ctx.newPage();
  await p.goto(F); await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(600);
  await p.evaluate((l)=>{const x=document.querySelector('#view [data-act="lang-'+l+'"]');if(x)x.click();},lg);
  await p.waitForTimeout(900);
  const t=await p.evaluate(()=>{const wp=document.querySelector('.welcome-plus');
    const txt=wp?wp.innerText.replace(/\s+/g,' '):'';
    const FR=['Vous cherchez','Vous êtes professionnel','Commandez en deux gestes','Partout sur l\'île',
      'Recevez des demandes','Le programme Ambassadeur','Ouverture aux clients','Installer sur mon'];
    return {reste:FR.filter(m=>txt.includes(m)), a:txt.includes('')};});
  ok(!t.reste.length,lg.toUpperCase()+' : aucun mot français ne subsiste'+(t.reste.length?' — '+t.reste.join(' · '):''));
  await ctx.close();
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
