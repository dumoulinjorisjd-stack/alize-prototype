/* LA FICHE D'UN PRESTATAIRE DIT TOUJOURS OÙ EN EST SON CATALOGUE, ET OÙ ÇA SE RÈGLE.

   « Dans la console, dans la fiche du prestataire je ne vois pas comment modifier ses
   tarifs » (l'éditeur, 29/10/2026). MESURÉ : la rangée Catalogue n'existait PAS DU TOUT
   tant qu'aucun de ses métiers n'était ouvert — c'est-à-dire l'état de TOUTE console le
   premier jour, `adminMetier` partant vide. Ni réglage, ni explication, ni chemin.

   « Pour certains où j'ai préparé le compte Mollie, il me le dit dès la première page,
   pour d'autres non, alors qu'à la seconde il me prévient qu'un compte existe déjà » (le
   même jour). MÊME FAUTE PAR UNE AUTRE PORTE : la première page lisait la mémoire de la
   SESSION, la seconde lisait la fiche. Deux sources, un seul fait.

   CETTE ÉPREUVE TIENT LES DEUX BOUTS DE CHAQUE CORRECTION : ce qui se met à paraître, et
   ce qui ne doit PAS bouger — sans quoi une règle qui dirait tout, ou rien, passerait au
   vert. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const F='file://'+path.join(RACINE,'tests/harn/app.html');
const J=24*3600*1000;

(async()=>{
const b=await chromium.launch(o);
const ctx=await b.newContext({locale:'fr-FR'});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto(F); await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(500);

/* ── 1. LE CATALOGUE : la rangée paraît TOUJOURS ─────────────────────────────── */
console.log('\n1. La fiche dit toujours où en est son catalogue');
const C=await p.evaluate(()=>{
  const S=window.__S;
  const art={id:'u1',uid:'u1',name:'Maya',cats:['massage','coiffure'],status:'valide',
             acceptedTerms:true,acceptsGrille:false,
             ownCatalog:{massage:{on:true,lines:[{id:'l1',nm:'Forfait 60 min',price:150},
                                                 {id:'l2',nm:'Duo',price:290}]}}};
  const lire=()=>{
    S.adminArtisans=[art];S.persona='admin';S.admin={sel:'u1',view:'art'};
    window.__render();
    const v=document.getElementById('view')||document.body;
    const r=Array.from(v.querySelectorAll('.fiche .fr'))
      .find(x=>/Catalogue/.test((x.querySelector('.k')||{}).textContent||''));
    const z=r?r.querySelector('.v'):null;
    return {ligne:!!r,
      mots:z?(z.textContent||'').replace(/\s+/g,' ').trim():'',
      champs:z?z.querySelectorAll('input').length:0,
      prix:z?Array.from(z.querySelectorAll('input')).map(i=>i.value).filter(x=>/^\d/.test(x)):[],
      bascule:z?z.querySelectorAll('[data-caton]').length:0,
      porte:z?Array.from(z.querySelectorAll('[data-adm^="catouvrir:"]')).map(x=>x.dataset.adm):[]};
  };
  const out={};
  S.adminMetier={};                                                            out.rien=lire();
  S.adminMetier={massage:{catalogueLibre:true}};                               out.un=lire();
  S.adminMetier={massage:{catalogueLibre:true},coiffure:{catalogueLibre:true}}; out.deux=lire();
  return out;
});
ok(C.rien.ligne, 'aucun métier ouvert : la rangée Catalogue paraît quand même');
ok(/Grille tarifaire/.test(C.rien.mots)&&/Massage/.test(C.rien.mots)&&/Coiffure/.test(C.rien.mots),
   'elle NOMME les métiers fermés : '+C.rien.mots.slice(0,60));
ok(/au métier/.test(C.rien.mots)&&/tous les prestataires/.test(C.rien.mots),
   'et elle dit que le réglage vaut pour tout le métier, pas pour cette personne');
ok(C.rien.porte.length===1&&C.rien.porte[0]==='catouvrir:massage,coiffure',
   'une seule porte, qui porte LES DEUX métiers fermés : '+JSON.stringify(C.rien.porte));
ok(C.rien.champs===0&&C.rien.bascule===0,
   'et aucun réglage qu\'on ne pourrait pas servir : ni champ, ni bascule');
// LA MOITIÉ QUI COMPTE : un métier ouvert ne bouge pas d'un cheveu.
ok(C.un.champs===4&&C.un.prix.join(',')==='150,290',
   'métier ouvert : ses deux prestations restent saisissables, à ses prix ('+C.un.prix.join(' · ')+')');
ok(C.un.bascule>=2, 'la bascule « grille / son catalogue » est toujours là');
ok(C.un.porte.length===1&&C.un.porte[0]==='catouvrir:coiffure',
   'et la porte ne nomme plus que le métier encore fermé');
ok(C.deux.porte.length===0,
   'tous les métiers ouverts : plus de porte du tout, il n\'y a plus rien à régler');

/* ── 2. ET LA PORTE MÈNE ─────────────────────────────────────────────────────── */
console.log('\n2. La porte mène au réglage, et ne le touche pas');
const D=await p.evaluate(()=>{
  const S=window.__S;
  S.adminMetier={};S.admPriceOpen={};S._fold={};
  S.persona='admin';S.admin={sel:'u1',view:'art'};window.__render();
  const v=document.getElementById('view')||document.body;
  const btn=v.querySelector('[data-adm^="catouvrir:"]');
  if(!btn)return {clic:false};
  btn.click();
  return {clic:true,vue:S.admin.view,
    pli:!!(S._fold&&S._fold['a-prices']),
    massage:!!(S.admPriceOpen&&S.admPriceOpen.massage),
    coiffure:!!(S.admPriceOpen&&S.admPriceOpen.coiffure),
    reglage:!!document.querySelector('[data-adm="metcata:massage"]'),
    toujoursFerme:!window.__ownCat.libre('massage')};
});
ok(D.clic, 'la porte existe et se clique');
ok(D.vue==='home'&&D.pli, 'elle ouvre l\'écran des tarifs, carte dépliée');
ok(D.massage&&D.coiffure, 'et elle déplie LES DEUX métiers qu\'elle nommait');
ok(D.reglage, 'le réglage « Catalogue propre autorisé » est bien à l\'écran, pas ailleurs');
// ON NE RÈGLE RIEN AU PASSAGE : ouvrir un métier vaut pour tous ses prestataires, ce
// n'est pas à un clic venu d'une fiche d'en décider.
ok(D.toujoursFerme, 'et le métier reste FERMÉ : la porte mène, elle ne décide pas');

/* ── 3. MOLLIE : un seul fait, les deux surfaces ─────────────────────────────── */
console.log('\n3. « Son compte est déjà préparé » se lit sur sa fiche, pas dans la session');
const M=await p.evaluate((J)=>{
  const S=window.__S;
  const base={id:'u1',uid:'u1',name:'Marie Coursieres',cats:['massage'],status:'valide',acceptedTerms:true};
  const lire=(extra)=>{
    S.adminArtisans=[Object.assign({},base,extra)];
    S.persona='admin';S.admin={sel:'u1',view:'art'};S.admMolInscr={};
    window.__render();
    const v=document.getElementById('view')||document.body;
    const r=Array.from(v.querySelectorAll('.fiche .fr'))
      .find(x=>/Paiements/.test((x.querySelector('.k')||{}).textContent||''));
    const z=r?r.querySelector('.v'):null;
    const t=z?(z.textContent||'').replace(/\s+/g,' ').trim():'';
    return {dit:/déjà préparé/.test(t),expire:/lien a expiré/.test(t),
      bouton:(z?Array.from(z.querySelectorAll('[data-adm^="mol-prep:"]')):[]).map(x=>x.textContent.trim())[0]||''};
  };
  return {jamais:lire({}),
    frais:lire({mollieClientLinkHref:'https://my.mollie.com/x',mollieClientLinkAt:Date.now()-3*J}),
    perime:lire({mollieClientLinkHref:'https://my.mollie.com/x',mollieClientLinkAt:Date.now()-40*J})};
},J);
ok(!M.jamais.dit&&!M.jamais.expire&&/Préparer/.test(M.jamais.bouton),
   'aucun compte préparé : rien n\'est annoncé, le bouton propose d\'en préparer un');
ok(M.frais.dit&&!M.frais.expire,
   'un compte préparé il y a 3 jours est annoncé DÈS la première page');
ok(/Revoir/.test(M.frais.bouton),
   'et le bouton cesse de promettre une création : « '+M.frais.bouton+' »');
ok(M.perime.expire&&!M.perime.dit,
   'un lien de 40 jours est annoncé EXPIRÉ : en créer un nouveau est sans conséquence');
ok(/Préparer/.test(M.perime.bouton),
   'et le bouton redevient « préparer » — les deux cas n\'appellent pas le même geste');

/* ── 4. LE MIROIR DE LA FRAÎCHEUR ────────────────────────────────────────────── */
console.log('\n4. La fraîcheur du lien est la MÊME des deux côtés');
const SERVEUR=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');
const CLIENT=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const js=(SERVEUR.match(/const CLIENT_LINK_JOURS\s*=\s*(\d+)/)||[])[1];
const jc=(CLIENT.match(/const MOL_LIEN_JOURS\s*=\s*(\d+)/)||[])[1];
ok(!!js&&!!jc, 'les deux constantes se relèvent (serveur '+js+', client '+jc+')'); // assertion arrière
ok(js===jc, 'et elles portent le même nombre de jours');
ok(/\(maintenant\s*-\s*t\)\s*<\s*CLIENT_LINK_JOURS\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(SERVEUR)
   &&/\(maintenant\s*-\s*t\)\s*<\s*MOL_LIEN_JOURS\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(CLIENT),
   'et la règle elle-même est écrite pareil des deux côtés');
// UNE SEULE LECTURE DU FAIT. `E.lienFrais` est la réponse du serveur : si une surface
// la relit de son côté, les deux se remettront à diverger — c'est le défaut corrigé.
const n=(CLIENT.match(/E\.lienFrais/g)||[]).length;
ok(n===1, 'et `E.lienFrais` n\'est lu qu\'à UN endroit, la porte commune (relevé : '+n+')');

console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
await b.close();
process.exit(f?1:0);
})();
