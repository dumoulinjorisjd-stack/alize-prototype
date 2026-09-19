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
      ambassadeur:n('.land-founder'), ouverture:/les services seront disponibles à partir du 1er octobre|services go live on 1 October|os serviços abrem a 1 de outubro/i.test(txt),
      accroche:n('.pro-hook'),
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
ok(ordi.ouverture,'et l’invitation à s’inscrire, les services ouvrant le 1er octobre');

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
ok(tel.accroche===1&&ordi.accroche===0,
  'l’accroche « Vous faites … ? » reste sur téléphone, où la grille n’est pas visible d’un regard');
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
    const al=e=>{const a=getComputedStyle(e).textAlign;return a==='start'?'left':a;};
    const intro=secs.every(s2=>al(s2.querySelector('.eyebrow'))==='center'
      && al(s2.querySelector('.wp-tete'))==='center');
    // Ce qui ANNONCE ou CONCLUT une partie est centré (intertitre, accroche, punchline,
    // et les deux paragraphes qui encadrent une liste) ; ce qui se LIT en bloc reste au
    // fer à gauche — les cartes d'étapes, la figure de l'île.
    const annonce=e=>e.classList.contains('eyebrow')||e.classList.contains('wp-tete')
      ||e.classList.contains('pitch-sub');
    const detail=secs.every(s2=>[...s2.children].filter(e=>!annonce(e)).every(e=>al(e)==='left'));
    const conclut=[...document.querySelectorAll('.welcome-plus .pitch-sub')].every(e=>al(e)==='center');
    // Les pastilles de confiance sont un flex : c'est leur boîte qu'on mesure, pas leur
    // `text-align` — et c'est la seule mesure qui dise vraiment « c'est centré ».
    const mi=e=>{const r=e.getBoundingClientRect();return (r.left+r.right)/2;};
    // UNE SEULE SÉRIE DE PASTILLES SUR GRAND ÉCRAN : celle du client redisait mot pour mot
    // deux des quatre cartes du héros, deux centimètres plus haut.
    const chips=[...document.querySelectorAll('.welcome-plus .pitch-trust')];
    const chipsCentrees=chips.length===1&&chips.every(c=>{
      const k=[...c.children]; if(!k.length)return false;
      const g=k[0].getBoundingClientRect().left, d=k[k.length-1].getBoundingClientRect().right;
      return Math.abs((g+d)/2-mi(c.parentElement))<=2;});
    // La mesure d'un texte suivi : les trois encadrés ne courent plus sur toute la largeur.
    const encadres=[...document.querySelectorAll('.welcome-plus .wp-mobile,.welcome-plus .open-note,.welcome-plus .land-founder')];
    const mesure=encadres.length===3&&encadres.every(e=>e.getBoundingClientRect().width<=910);
    // L'entre-deux se nomme : deux boutons corail ne disent pas d'eux-mêmes ce qu'ils font.
    // Une punchline tient sur UNE ligne sur grand écran : le retour du balisage est celui
    // du téléphone, où la même phrase ne passe pas. On compte les rectangles de la ligne,
    // on ne lit pas la feuille de style.
    const lignes=e=>{const rg=document.createRange();rg.selectNodeContents(e);
      return new Set([...rg.getClientRects()].map(x=>Math.round(x.top))).size;};
    const titres=[...document.querySelectorAll('.welcome-plus .wp-tete .pitch-h')];
    const uneLigne=titres.length===2&&titres.every(e=>lignes(e)===1);
    const espace=titres.every(e=>/,\s\S/.test(e.innerText.replace(/\s+/g,' ')));
    // LA GRILLE DES SERVICES OUVRE LA PAGE et le bandeau du téléphone est descendu chez le
    // professionnel : c'est l'échange demandé, et il se mesure par la position, pas par le
    // balisage.
    const sv=document.querySelector('.wp-services'), bande=document.querySelector('.welcome-plus .wp-mobile');
    const ySv=sv?Math.round(sv.getBoundingClientRect().top):null;
    const yBande=bande?Math.round(bande.getBoundingClientRect().top):null;
    const bandeChezLePro=!!(bande&&secs[1]&&secs[1].contains(bande));
    const grilleEnTete=!!(sv&&sv.querySelector('.jchip')&&ySv<y(secs[0]));
    const accroche=document.querySelectorAll('.welcome-plus .pro-hook').length;
    // Une rangée incomplète de la grille se CENTRE : sans cela, la dernière puce pendait
    // seule à gauche, en tête de page.
    const puces=[...document.querySelectorAll('.wp-services .jchip')];
    const rangs={}; puces.forEach(c=>{const r=c.getBoundingClientRect();
      (rangs[Math.round(r.top)]=rangs[Math.round(r.top)]||[]).push(r);});
    const grilleCentree=Object.values(rangs).every(rg=>{
      const g2=Math.min(...rg.map(r=>r.left)), d=Math.max(...rg.map(r=>r.right));
      return Math.abs((g2+d)/2-mi(sv))<=2;});
    const bloc=document.querySelector('.wp-cta-bloc');
    const tete=bloc&&bloc.querySelector('.eyebrow');
    const inscr=!!tete&&/inscription|sign up|inscri/i.test(tete.textContent)
      &&Math.abs(mi(tete)-mi(bloc))<=2
      &&tete.compareDocumentPosition(bloc.querySelector('.wp-cta'))&Node.DOCUMENT_POSITION_FOLLOWING;
    const ile=document.querySelector('.welcome-plus .cover-isle');
    const mil=e=>{const r=e.getBoundingClientRect();return (r.left+r.right)/2;};
    const pad=document.querySelector('.pad.welcome').getBoundingClientRect();
    const hero=document.querySelector('.welcome-hero').getBoundingClientRect();
    const bas=document.querySelector('.welcome-bas').getBoundingClientRect();
    // LES QUATRE ARGUMENTS SONT SOUS LE HÉROS, SUR UNE RANGÉE — ils étaient en colonne à
    // droite, et cette colonne décentrait la mascotte. On mesure ce qui compte : une seule
    // ligne, et le milieu du héros sur l'axe de la page.
    const desk=document.querySelector('.welcome-desk');
    const cartes=[...desk.children].map(e=>e.getBoundingClientRect());
    const uneRangee=new Set(cartes.map(r=>Math.round(r.top))).size===1;
    const deskR=desk.getBoundingClientRect();
    const sousLeHeros=Math.round(deskR.top)>=Math.round(hero.bottom)-1;
    const zouti=document.querySelector('.welcome .octo-hero').getBoundingClientRect();
    const axe=Math.round(Math.abs((zouti.left+zouti.right)/2-(pad.left+pad.right)/2));
    const rangees=secs.map(s2=>{const st=s2.querySelector('.pitch-steps');
      return st?new Set([...st.children].map(e=>Math.round(e.getBoundingClientRect().top))).size:null;});
    return {introCentree:intro, detailAuFer:detail, conclut, chipsCentrees, mesure, inscr,
      grilleEnTete, bandeChezLePro, accroche, grilleCentree, ySv, yBande,
      rangs:Object.keys(rangs).length,
      uneLigne, espace, titres:titres.map(e=>e.innerText.replace(/\s+/g,' ')),
      largeurEncadres:encadres.map(e=>Math.round(e.getBoundingClientRect().width)),
      punchline:parseFloat(getComputedStyle(secs[0].querySelector('.pitch-h')).fontSize),
      ecartIle:Math.round(Math.abs(mil(ile)-mil(secs[0]))),
      sections:secs.length, yClient:y(secs[0]), yCta:y(cta), yPro:y(secs[1]),
      boutons:cta?[...cta.querySelectorAll('button')].map(x=>x.dataset.act):[],
      largeurSection:Math.round(secs[0].getBoundingClientRect().width),
      part:Math.round(pad.width/window.innerWidth*100),
      rangees, vide:Math.round(bas.top-deskR.bottom),
      cartes:cartes.length, uneRangee, sousLeHeros, axe, zouti:Math.round(zouti.width)};});
  ok(g.sections===2&&g.yClient<g.yCta&&g.yCta<g.yPro,
    'le client d’abord, les boutons, puis le professionnel — jamais côte à côte ('+g.yClient+' → '+g.yCta+' → '+g.yPro+')');
  ok(g.boutons.join(',')==='onb-start,go-artisan-signup',
    'et ce sont les deux boutons d’inscription, dans l’ordre — '+g.boutons.join(' · '));
  ok(g.rangees[0]===1&&g.rangees[1]===1,
    'chaque partie déploie ses trois étapes sur UNE rangée : c’est elle qui emploie la largeur, pas deux discours qui se concurrencent');
  // L'AXE N'EST PLUS UNIQUE, ET C'EST UNE RÈGLE, PAS UN ZIGZAG : ce qui ANNONCE une
  // partie est centré, ce qui se LIT reste ferré à gauche. Avant, les blocs alternaient
  // sans raison DANS une même colonne ; ici la différence d'axe DIT quelque chose.
  ok(g.introCentree,'l’intertitre, l’accroche et la punchline sont centrés — ils annoncent la partie');
  ok(g.detailAuFer,'les cartes d’étapes et la figure de l’île restent au fer à gauche — elles se lisent');
  ok(g.conclut,'les deux paragraphes qui encadrent une liste sont centrés : l’un annonce la partie, l’autre la ferme');
  ok(g.chipsCentrees,'la seule série de pastilles restante — celle du professionnel — reprend l’axe de la partie ; celle du client redisait le héros et part');
  ok(g.mesure,'et les trois encadrés de texte suivi tiennent une mesure lisible ('+g.largeurEncadres.join(' · ')+' px, contre 1 332)');
  ok(g.inscr,'« Inscription » nomme les deux boutons corail, au-dessus d’eux et sur leur axe');
  ok(g.grilleEnTete,'la grille des services ouvre la page — c’est la réponse à « qu’est-ce que ce site ? » ('+g.ySv+' px, avant la partie du client à '+g.yClient+')');
  ok(g.bandeChezLePro,'et le bandeau « s’utilise sur téléphone » est descendu dans la partie du professionnel ('+g.yBande+' px)');
  ok(g.grilleCentree,'chaque rangée de la grille est centrée, y compris la dernière quand elle est incomplète ('+g.rangs+' rangées)');
  ok(g.accroche===0,'et l’accroche au métier qui tourne a disparu : la grille entière est au-dessus');
  ok(g.uneLigne,'chaque punchline tient sur une seule ligne : '+g.titres.join(' · '));
  ok(g.espace,'et les deux morceaux restent séparés par une espace — le retour du balisage n’en portait pas');
  ok(g.punchline>=30,'la punchline porte la taille d’un titre ('+g.punchline+' px, contre 26 avant)');
  ok(g.ecartIle<=2,'et le dessin de l’île est centré, plus collé au bord gauche (écart '+g.ecartIle+' px)');
  ok(g.part>=88,'la vitrine occupe '+g.part+' % de la fenêtre — elle en occupait 55');
  ok(g.largeurSection>=1200,'chaque partie prend toute la largeur ('+g.largeurSection+' px, contre 390 en deux colonnes)');
  ok(g.cartes===4&&g.uneRangee&&g.sousLeHeros,
    'les quatre arguments sont SOUS le héros, sur une seule rangée — ils étaient en colonne à droite');
  ok(g.axe<=1,'la mascotte est sur l’axe de la page ('+g.axe+' px d’écart) : la colonne de droite la décentrait');
  ok(g.zouti>=270,'et elle a la place de grandir — '+g.zouti+' px de large (230 avant)');
  ok(g.vide<=40,'le vide entre les arguments et la suite reste à '+g.vide+' px');
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

console.log('\nE bis — « Se connecter » est le seul geste du héros : il se vise');
{
  const ctx=await b.newContext({viewport:{width:1512,height:950},locale:'fr-FR'});
  const p5=await ctx.newPage();
  await p5.goto(F); await p5.waitForFunction(()=>window.__S&&window.__render); await p5.waitForTimeout(700);
  const r=await p5.evaluate(()=>{const l=document.querySelector('.welcome .footcta .linklike');
    if(!l)return null; const b2=l.getBoundingClientRect(); const cs=getComputedStyle(l);
    return {h:Math.round(b2.height), w:Math.round(b2.width), px:parseFloat(cs.fontSize),
      cadre:cs.borderTopWidth!=='0px'};});
  ok(!!r&&r.h>=34,'la cible fait '+(r?r.h:0)+' px de haut — un lien de 17 px ne tient pas le rôle du seul geste du héros');
  ok(!!r&&r.cadre,'et elle porte un cadre : on voit qu’il y a quelque chose à viser, sans prendre le corail des deux inscriptions');
  await ctx.close();
}

console.log('\nF — la page d’accueil se met à jour TOUTE SEULE');
// La pastille « nouvelle version » existe pour ne pas effacer une saisie en cours. Sur
// l'écran d'accueil il n'y a pas un champ : demander revient à faire presser un bouton
// pour rien, et qui découvre le site ne le presse pas — il repart avec la version d'avant.
{
  const ctx=await b.newContext({viewport:{width:1512,height:950},locale:'fr-FR'});
  const p6=await ctx.newPage();
  await p6.goto(F); await p6.waitForFunction(()=>window.__S&&window.__maj); await p6.waitForTimeout(700);
  ok(await p6.evaluate(()=>window.__maj.sansRisque()),
    'sur l’écran d’accueil, rien n’est en jeu : la version fraîche se prend sans demander');
  ok(await p6.evaluate(()=>{const d=document.createElement('div');d.className='sheet-back';document.body.appendChild(d);
      const v=window.__maj.sansRisque(); d.remove(); return !v;}),
    'une fenêtre ouverte par-dessus suspend la mise à jour — on ne recharge pas sous les doigts');
  ok(await p6.evaluate(()=>{const i=document.createElement('input');i.value='Marie';document.body.appendChild(i);
      const v=window.__maj.sansRisque(); i.remove(); return !v;}),
    'un champ déjà rempli aussi : c’est la saisie qu’on protège, pas l’écran');
  ok(await p6.evaluate(()=>{const i=document.createElement('input');document.body.appendChild(i);i.focus();
      const v=window.__maj.sansRisque(); i.remove(); return !v;}),
    'et un champ en cours de frappe, même vide');
  const ailleurs=await p6.evaluate(()=>{const x=[...document.querySelectorAll('[data-act="onb-start"]')]
      .find(e=>e.getBoundingClientRect().width>0); if(!x)return null; x.click();
    return new Promise(r=>setTimeout(()=>r({welcome:!!document.querySelector('.pad.welcome'),sr:window.__maj.sansRisque()}),600));});
  ok(!!ailleurs&&!ailleurs.welcome&&!ailleurs.sr,
    'dès qu’on entre dans l’inscription, la pastille reprend la main — c’est là qu’un rechargement coûte quelque chose');
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
