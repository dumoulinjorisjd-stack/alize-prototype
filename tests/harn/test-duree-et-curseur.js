/* LE CURSEUR NE SAUTE PLUS, ET LA DURÉE A SA PROPRE CASE.

   « À chaque fois que je tape une lettre ça saute, vérifie que pour le prestataire il
   n'y ait pas le même souci. La durée doit se remplir dans une case à part propre à ça,
   avec le choix du type d'unité et de la valeur, pour que lors de la commande le créneau
   horaire s'ajuste. » (l'éditeur, 29/10/2026)

   MESURÉ AVANT DE CORRIGER, et les causes ne sont pas celles qu'on lit. LE SAUT ne vient
   pas des gestionnaires de frappe — leur propre commentaire dit « s'enregistre sans
   redessiner » et c'est vrai : il vient du RETOUR de l'instantané `artisans`, qui fait
   `render()` sans condition et remplace tout l'écran. CHEZ LE PRESTATAIRE, non : son
   écoute ne redessine que si son interrupteur en ligne ou ses métiers changent.
   LA DURÉE existait dans la grille (`a.d`) mais EN HEURES ENTIÈRES, et le catalogue
   propre n'en portait aucune — elle était noyée dans le nom (« durée comprise »), donc
   inexploitable par l'agenda. Et le serveur la JETAIT : `lignesPropres` ne gardait que
   l'identifiant, le nom et le prix, donc la durée d'un prestataire n'atteignait jamais
   l'écran du client.

   CETTE ÉPREUVE TIENT LES DEUX BOUTS : ce qui doit changer, et ce qui ne doit PAS bouger
   — la grille en heures, le calcul d'avant, l'argent. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const F='file://'+path.join(RACINE,'tests/harn/app.html');
const CATP=require(path.join(RACINE,'functions/catalogue-prestataire.js'));

(async()=>{
const b=await chromium.launch(o);
const ctx=await b.newContext({locale:'fr-FR'});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto(F); await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(500);

/* ── 1. LE CURSEUR SURVIT À UNE PEINTURE VENUE D'AILLEURS ────────────────────── */
console.log('\n1. Le curseur survit à une peinture venue d\'ailleurs');
const K=await p.evaluate(async()=>{
  const S=window.__S;
  const art={id:'u1',uid:'u1',real:true,name:'Maya',cats:['massage'],status:'valide',
             acceptedTerms:true,acceptsGrille:false,
             ownCatalog:{massage:{on:true,lines:[{id:'l1',nm:'Forfait',price:150}]}}};
  S.adminArtisans=[art];S.adminMetier={massage:{catalogueLibre:true}};
  S.persona='admin';S.admin={sel:'u1',view:'art'};
  window.__render();
  const v=document.getElementById('view')||document.body;
  const ch=v.querySelector('[data-catnm]');
  if(!ch)return {trouve:false};
  ch.focus();
  ch.value='Forfait massage';
  /* LA FRAPPE DOIT ÊTRE ENREGISTRÉE, sinon la peinture rend l'ANCIENNE valeur et la
     position se rabat sur sa longueur : la mesure mentirait sur un code juste. */
  ch.dispatchEvent(new Event('input',{bubbles:true}));
  ch.setSelectionRange(8,8);                       // le curseur est DANS le mot
  const avant={actif:document.activeElement===ch,pos:ch.selectionStart};
  /* LA PEINTURE QUI FAISAIT SAUTER : exactement ce que fait le retour de l'instantané. */
  window.__render();
  const v2=document.getElementById('view')||document.body;
  const ch2=v2.querySelector('[data-catnm]');
  return {trouve:true,avant:avant,
    memeElement:ch2===ch,
    actifApres:!!(ch2&&document.activeElement===ch2),
    posApres:ch2?ch2.selectionStart:-1,
    nomDuChamp:ch2?ch2.dataset.catnm:''};
});
ok(K.trouve, 'le champ du catalogue est bien dans la fiche');
ok(K.avant&&K.avant.actif&&K.avant.pos===8, 'le curseur est posé au milieu du mot avant la peinture');
ok(!K.memeElement, 'la peinture recrée bien le champ — c\'est le fait qui faisait sauter');
ok(K.actifApres, 'après la peinture, le champ a REPRIS le foyer');
ok(K.posApres===8, 'et le curseur est rendu à sa place exacte, pas au début du mot ('+K.posApres+')');

/* ── 1 bis. DEUX REFUS : un champ disparu, et un foyer déjà pris ─────────────── */
console.log('\n1 bis. On ne restaure ni dans le vide, ni par-dessus quelqu\'un');
const K2=await p.evaluate(()=>{
  const S=window.__S;
  const art={id:'u1',uid:'u1',real:true,name:'Maya',cats:['massage'],status:'valide',
             acceptedTerms:true,acceptsGrille:false,
             ownCatalog:{massage:{on:true,lines:[{id:'l1',nm:'Forfait',price:150}]}}};
  S.adminArtisans=[art];S.adminMetier={massage:{catalogueLibre:true}};
  S.persona='admin';S.admin={sel:'u1',view:'art'};
  window.__render();
  let v=document.getElementById('view')||document.body;
  const ch=v.querySelector('[data-catnm]');
  ch.focus();
  /* L'écran change pour un AUTRE : le champ n'existe plus, rien ne doit revenir. */
  S.admin={sel:null,view:'home'};
  window.__render();
  v=document.getElementById('view')||document.body;
  const a1=document.activeElement;
  return {disparu:!v.querySelector('[data-catnm]'),
          pasDeFoyerVolant:!(a1&&a1.dataset&&a1.dataset.catnm)};
});
ok(K2.disparu, 'le champ a bien disparu de l\'écran suivant');
ok(K2.pasDeFoyerVolant, 'et personne ne lui rend le clavier sur un écran où il n\'est plus');

/* ── 2. UNE LETTRE N'EST PAS UNE ÉCRITURE ────────────────────────────────────── */
console.log('\n2. Une lettre n\'est pas une écriture Firestore');
const W=await p.evaluate(async()=>{
  const S=window.__S;
  const ecrits=[];
  window.__setFB({f:{doc:function(db,col,id){return {col:col,id:id};},
                     setDoc:function(ref,obj){ecrits.push({id:ref.id,obj:obj});return Promise.resolve();}},
                  db:{},auth:{currentUser:{uid:'u1'}},fn:{},functions:{}});
  const art={id:'u1',uid:'u1',real:true,name:'Maya',cats:['massage'],status:'valide',
             ownCatalog:{massage:{on:true,lines:[{id:'l1',nm:'',price:150}]}}};
  S.adminArtisans=[art];S.adminMetier={massage:{catalogueLibre:true}};
  S.persona='admin';S.admin={sel:'u1',view:'art'};
  window.__render();
  const v=document.getElementById('view')||document.body;
  const ch=v.querySelector('[data-catnm]');
  const mot='Forfait massage 90 min';
  for(let i=1;i<=mot.length;i++){
    ch.value=mot.slice(0,i);
    ch.dispatchEvent(new Event('input',{bubbles:true}));
  }
  const pendant=ecrits.length;
  const nomLocal=(((S.adminArtisans[0].ownCatalog||{}).massage||{}).lines||[])[0].nm;
  await new Promise(r=>setTimeout(r,700));
  const apres=ecrits.length;
  const envoye=apres?(((ecrits[apres-1].obj.ownCatalog||{}).massage||{}).lines||[])[0].nm:'';
  return {lettres:mot.length,pendant:pendant,apres:apres,nomLocal:nomLocal,envoye:envoye};
});
ok(W.pendant===0, 'vingt-deux lettres : AUCUNE écriture pendant la frappe (était une par lettre) — '+W.pendant);
ok(W.nomLocal==='Forfait massage 90 min', 'et pourtant l\'état local porte le nom à la lettre, tout de suite');
ok(W.apres===1, 'une seule écriture part, après la frappe ('+W.apres+')');
ok(W.envoye==='Forfait massage 90 min', 'et elle porte le nom ENTIER — aucune lettre perdue');

/* ── 3. CHEZ LE PRESTATAIRE, PAS DE SAUT ─────────────────────────────────────── */
console.log('\n3. Chez le prestataire, son écran ne saute pas');
const P=await p.evaluate(()=>{
  const html=document.documentElement.outerHTML;
  /* MESURÉ SUR LA SOURCE : son écoute ne redessine que derrière `_filtre`, et seuls
     l'interrupteur en ligne et ses métiers le posent. Un changement de catalogue ne
     peut donc pas repeindre son écran — c'est la raison, pas une chance. */
  const bloc=(html.split('function subscribeProStatus')[1]||'').slice(0,2600);
  const poses=(bloc.match(/_filtre\s*=\s*true/g)||[]).length;
  const rendu=/if\(_filtre\)/.test(bloc);
  const catalogueDansLeBloc=/proOwnCatalog/.test(bloc);
  const catalogueposeLeFiltre=/ownCatalog[\s\S]{0,120}_filtre\s*=\s*true/.test(bloc);
  return {poses:poses,rendu:rendu,catalogueDansLeBloc:catalogueDansLeBloc,
          catalogueposeLeFiltre:catalogueposeLeFiltre};
});
ok(P.catalogueDansLeBloc, 'son écoute reçoit bien son catalogue en direct — il le VOIT changer');
ok(P.rendu, 'et elle ne repeint que derrière une condition');
ok(!P.catalogueposeLeFiltre, 'que le catalogue ne pose JAMAIS : son écran ne saute pas sous ses doigts');

/* ── 4. LA DURÉE, EN MINUTES, SANS RIEN MIGRER ───────────────────────────────── */
console.log('\n4. La durée se déclare en minutes, et la grille en heures ne bouge pas');
const D=await p.evaluate(()=>{
  const H=window.__heures;
  return {
    min90:H.dureeMin({dm:90}),
    grille2h:H.dureeMin({d:2}),
    rien:H.dureeMin({}),
    minutesGagnent:H.dureeMin({dm:90,d:3}),
    tropGrand:H.dureeMin({dm:5000}),
    negatif:H.dureeMin({dm:-30}),
    texteDm:H.dureeMin({dm:'une heure'}),
    plafond:H.minutesMax(),
    /* EN HEURES pour ce qui raisonne en heures, sans tronquer vers le bas. */
    h90:H.duree({dm:90}),
    h120:H.duree({dm:120}),
    hGrille:H.duree({d:2}),
    /* LA PLUS LONGUE, JAMAIS LA SOMME. */
    fin90:H.fin('14:00',H.duree({dm:90})),
    fin45:H.fin('14:00',H.duree({dm:45})),
    finGrille:H.fin('14:00',H.duree({d:2})),
    txt:[H.texte(45),H.texte(60),H.texte(90),H.texte(150),H.texte(0)]
  };
});
ok(D.min90===90&&D.grille2h===120, 'les minutes se lisent, et une durée de grille en heures vaut ses minutes');
ok(D.rien===0, 'rien de déclaré : zéro — le calcul d\'avant tient');
ok(D.minutesGagnent===90, 'si les deux sont là, les minutes font foi (la case la plus précise)');
ok(D.tropGrand===0&&D.negatif===0&&D.texteDm===0, 'une durée qu\'on ne sait pas lire N\'EST PAS une durée');
ok(D.plafond===24*60, 'le plafond est celui de la grille, en minutes ('+D.plafond+')');
ok(D.h90===1.5&&D.h120===2&&D.hGrille===2, 'en heures, quatre-vingt-dix minutes valent 1,5 h — jamais 1 h, jamais 2 h');
ok(D.fin90==='15:30', 'un massage de 90 min annoncé à 14:00 finit à 15:30, pas à 15:00 ni à 16:00 ('+D.fin90+')');
ok(D.fin45==='14:45'&&D.finGrille==='16:00', 'et les durées courtes comme la grille tombent juste aussi');
ok(D.txt[0]==='45 min'&&D.txt[1]==='1 h'&&D.txt[2]==='1 h 30'&&D.txt[3]==='2 h 30'&&D.txt[4]==='',
   'ce qui se lit à l\'écran est du français : '+JSON.stringify(D.txt));

/* ── 5. LA DURÉE DU PRESTATAIRE CHOISI, PAS CELLE DE NOTRE GRILLE ───────────── */
console.log('\n5. Le créneau s\'ajuste sur la durée de la personne choisie');
const C=await p.evaluate(()=>{
  const S=window.__S,H=window.__heures;
  /* NOTRE grille dit une heure pour cette prestation ; SA carte dit quatre-vingt-dix
     minutes. C'est elle qui fait foi dès qu'on l'a choisie. */
  S.adminCatalog={massage:[{id:'l1',nm:'Forfait',price:110,d:1}]};
  S.adminMetier={massage:{catalogueLibre:true}};
  S._proDir={massage:{loading:false,list:[
    {uid:'u1',name:'Maya',ownCat:true,cat:[{id:'l1',nm:'Forfait 90 min',price:150,dm:90}]},
    {uid:'u2',name:'Léa',ownCat:false,cat:null}]}};
  const sansChoix={svc:'massage',acts:[{id:'l1',nm:'Forfait',price:110,qty:1}],slot:'14:00'};
  const choisie=Object.assign({},sansChoix,{preferredUid:'u1'});
  const autre=Object.assign({},sansChoix,{preferredUid:'u2'});
  return {grille:H.dureeMinDraft(sansChoix),
          sienne:H.dureeMinDraft(choisie),
          grilleAussi:H.dureeMinDraft(autre),
          finGrille:H.fin('14:00',H.dureeDraft(sansChoix)),
          finSienne:H.fin('14:00',H.dureeDraft(choisie)),
          heuresServeur:H.mission(choisie)};
});
ok(C.grille===60, 'sans prestataire choisi, c\'est notre grille : 60 min');
ok(C.sienne===90, 'avec elle choisie, c\'est SA durée : 90 min (était 60 — le créneau ne s\'ajustait pas)');
ok(C.grilleAussi===60, 'et celui qui est resté à la grille garde la durée de la grille');
ok(C.finGrille==='15:00'&&C.finSienne==='15:30',
   'le « retour prévu vers » suit : 15:00 sur la grille, 15:30 chez elle');
ok(C.heuresServeur===1.5, 'et le serveur des créneaux reçoit 1,5 h — il compte en fractions, mesuré');

/* ── 6. LA CASE À PART, AVEC SON UNITÉ ──────────────────────────────────────── */
console.log('\n6. La durée a sa case, avec le choix de l\'unité');
const E=await p.evaluate(()=>{
  const O=window.__ownCat;
  const h90=O.ligne({id:'l1',nm:'Forfait',price:150,dm:90},0,'massage','adm');
  const h2h=O.ligne({id:'l2',nm:'Duo',price:290,dm:120},1,'massage','adm');
  const hRien=O.ligne({id:'l3',nm:'Sans',price:90},2,'massage','adm');
  const d=document.createElement('div');d.innerHTML=h90;
  const d2=document.createElement('div');d2.innerHTML=h2h;
  const d3=document.createElement('div');d3.innerHTML=hRien;
  const lire=(x)=>({champ:!!x.querySelector('[data-catdv]'),
    valeur:(x.querySelector('[data-catdv]')||{}).value,
    unite:(x.querySelector('[data-catdu]')||{}).value,
    options:Array.from(x.querySelectorAll('[data-catdu] option')).map(o=>o.value),
    phrase:((x.querySelector('[data-catdinfo]')||{}).textContent||'').trim(),
    placeholderNom:(x.querySelector('[data-catnm]')||{}).placeholder||''});
  return {m90:lire(d),h2:lire(d2),rien:lire(d3),
          unite90:O.unite('adm:massage:0',90),unite120:O.unite('adm:massage:1',120),
          val90min:O.valeur(90,'min'),val90h:O.valeur(90,'h'),val120h:O.valeur(120,'h')};
});
ok(E.m90.champ&&E.h2.champ&&E.rien.champ, 'chaque ligne porte sa case de durée, remplie ou non');
ok(E.m90.options.join(',')==='min,h', 'avec le choix de l\'unité : '+E.m90.options.join(', '));
ok(E.m90.valeur==='90'&&E.m90.unite==='min', 'quatre-vingt-dix minutes se lisent « 90 min »');
ok(E.h2.valeur==='2'&&E.h2.unite==='h', 'deux heures rondes se lisent « 2 h », pas « 120 min »');
ok(E.rien.valeur===''&&/non dite/.test(E.rien.phrase), 'rien de déclaré : la case est vide et l\'écran le DIT');
ok(/1 h 30/.test(E.m90.phrase)&&/agenda/.test(E.m90.phrase),
   'et la phrase dit ce que l\'agenda va bloquer : '+E.m90.phrase);
ok(!/dur.e comprise/i.test(E.m90.placeholderNom),
   'le nom ne demande plus la durée « comprise » dedans : « '+E.m90.placeholderNom+' »');
ok(E.val90h==='1,5'&&E.val120h==='2'&&E.val90min==='90',
   'changer d\'unité REDIT la même durée, il ne la change pas');

/* ── 7. LA SAISIE ÉCRIT DES MINUTES, QUELLE QUE SOIT L'UNITÉ ────────────── */
console.log('\n7. La saisie écrit des minutes, quelle que soit l\'unité tapée');
const S7=await p.evaluate(async()=>{
  const S=window.__S;
  window.__setFB({f:{doc:function(db,col,id){return {col:col,id:id};},
                     setDoc:function(){return Promise.resolve();}},
                  db:{},auth:{currentUser:{uid:'u1'}},fn:{},functions:{}});
  /* LA SCÈNE PART D'UNE DURÉE DE GRILLE EN HEURES (`d:3`) : c'est le cas réel d'une
     ligne reprise, et il fait que l'unité affichée est « h ». On ne le suppose pas,
     on le mesure — un premier jet tapait « 90 » en croyant être en minutes. */
  const art={id:'u1',uid:'u1',real:true,name:'Maya',cats:['massage'],status:'valide',
             ownCatalog:{massage:{on:true,lines:[{id:'l1',nm:'Forfait',price:150,d:3}]}}};
  S.adminArtisans=[art];S.adminMetier={massage:{catalogueLibre:true}};
  S.persona='admin';S.admin={sel:'u1',view:'art'};S.catUnite={};
  window.__render();
  const ligne=()=>(((S.adminArtisans[0].ownCatalog||{}).massage||{}).lines||[])[0];
  const v=()=>document.getElementById('view')||document.body;
  const champ=()=>v().querySelector('[data-catdv]');
  const phrase=()=>((v().querySelector('[data-catdinfo]')||{}).textContent||'').trim();
  const unite=(u)=>{const sel=v().querySelector('[data-catdu]');sel.value=u;
    sel.dispatchEvent(new Event('input',{bubbles:true}));};
  const taper=(val)=>{const c=champ();c.value=val;
    c.dispatchEvent(new Event('input',{bubbles:true}));
    return {l:Object.assign({},ligne()),ph:phrase()};};
  const depart={valeur:champ().value,unite:(v().querySelector('[data-catdu]')||{}).value,ph:phrase()};
  unite('min');
  const enMinutes={valeur:champ().value};
  const t90=taper('90');
  unite('h');
  const redit={valeur:champ().value};
  const t15=taper('1,5');
  const trop=taper('90');                 // 90 HEURES : au-delà du créneau
  const apresTrop={valeur:champ().value};
  unite('min');
  const vide=taper('');
  return {depart:depart,enMinutes:enMinutes,t90:t90,redit:redit,t15:t15,
          trop:trop,apresTrop:apresTrop,vide:vide,plafond:window.__heures.minutesMax()};
});
ok(S7.depart.valeur==='3'&&S7.depart.unite==='h',
   'une durée de grille en heures s’affiche en heures : « '+S7.depart.valeur+' '+S7.depart.unite+' »');
ok(/3 h réservées/.test(S7.depart.ph), 'et la phrase dit ce que l\'agenda bloque : '+S7.depart.ph);
ok(S7.enMinutes.valeur==='180', 'passer en minutes REDIT la même durée : 180 ('+S7.enMinutes.valeur+')');
ok(S7.t90.l.dm===90, '« 90 » en minutes écrit 90 minutes ('+S7.t90.l.dm+')');
ok(S7.t90.l.d===undefined, 'et EFFACE la durée en heures de la grille : jamais deux sources');
ok(/1 h 30 réservées/.test(S7.t90.ph), 'la phrase se repeint sur place, sans redessiner la carte : '+S7.t90.ph);
ok(S7.redit.valeur==='1,5', 'repasser en heures redit 90 min sous la forme « 1,5 » ('+S7.redit.valeur+')');
ok(S7.t15.l.dm===90, '« 1,5 » en heures écrit bien 90 minutes ('+S7.t15.l.dm+')');
ok(S7.trop.l.dm===S7.plafond, '« 90 » en HEURES retient le plafond, pas 5400 min ('+S7.trop.l.dm+')');
ok(/au plus/.test(S7.trop.ph)&&/créneau/.test(S7.trop.ph),
   'et le plafond se DIT, il ne se tait pas : '+S7.trop.ph);
ok(S7.vide.l.dm===undefined, 'vider la case retire la durée — rien n\'est deviné');

/* ── 8. LE SERVEUR LA PORTE, ET REFUSE CE QU'IL NE SAIT PAS LIRE ────────────── */
console.log('\n8. Le serveur porte la durée jusqu\'à l\'écran du client');
const L=CATP.lignesPropres([
  {id:'a',nm:'Massage 90 min',price:150,dm:90},
  {id:'b',nm:'Massage 60 min',price:110,dm:60},
  {id:'c',nm:'Sans durée',price:90},
  {id:'d',nm:'Durée absurde',price:90,dm:5000},
  {id:'e',nm:'Durée négative',price:90,dm:-30},
  {id:'f',nm:'Durée en texte',price:90,dm:'une heure'}]);
const par={};L.lignes.forEach(l=>{par[l.id]=l;});
ok(L.lignes.length===6, 'les six lignes passent : une durée illisible ne fait pas tomber la ligne');
ok(par.a.dm===90&&par.b.dm===60, 'la durée voyage (elle était JETÉE — le créneau du client ne pouvait pas s\'ajuster)');
ok(!('dm' in par.c), 'une ligne sans durée n\'en porte pas une inventée');
ok(!('dm' in par.d)&&!('dm' in par.e)&&!('dm' in par.f),
   'et ce qu\'on ne sait pas lire n\'entre pas : plafond, négatif, texte');
ok(CATP.CAT_DUREE_MIN_MAX===24*60, 'le plafond serveur est celui du client, en minutes ('+CATP.CAT_DUREE_MIN_MAX+')');
/* MIROIR : les deux côtés plafonnent à la même valeur, sinon un prestataire déclarerait
   une durée que son client ne verrait pas. */
const plafondClient=await p.evaluate(()=>window.__heures.minutesMax());
ok(plafondClient===CATP.CAT_DUREE_MIN_MAX, 'client et serveur plafonnent au même nombre — rien ne se perd en route');

/* ── 9. L'ARGENT NE BOUGE PAS ───────────────────────────────────────────────── */
console.log('\n9. Ce qui ne doit pas bouger : l\'argent');
const A=await p.evaluate(()=>{
  const O=window.__ownCat;
  /* `prixAttendu` chiffre sur l'identifiant, le nom et le prix — la durée n'y entre
     pas, et ne doit pas y entrer : on ne facture pas du temps ici, on facture un
     forfait. On le MESURE plutôt que de l'affirmer. */
  const m={svc:'massage',preferredUid:'u1',
           acts:[{id:'l1',nm:'Forfait 90 min',price:150,qty:1}]};
  const S=window.__S;
  S._proDir={massage:{loading:false,list:[
    {uid:'u1',name:'Maya',ownCat:true,cat:[{id:'l1',nm:'Forfait 90 min',price:150,dm:90}]}]}};
  const r=O.rechiffre(m);
  return {retirees:r.retirees.length,rechiffrees:r.rechiffrees,
          prix:m.acts[0].price,nom:m.acts[0].nm};
});
ok(A.retirees===0&&A.rechiffrees===0, 'une ligne qui gagne une durée n\'est pas « re-chiffrée » : le prix n\'a pas bougé');
ok(A.prix===150&&A.nom==='Forfait 90 min', 'le prix et le nom traversent intacts');
const PA=CATP.prixAttendu([{id:'a',qty:1}],[{id:'a',nm:'Massage',price:150,dm:90}]);
ok(PA.total===150, 'et l\'autorité du prix, côté serveur, ignore la durée : '+PA.total+' €');

/* ── 10. CE QUE VOUS ÉCRIVEZ, ELLE LE VOIT ET LE MODIFIE CHEZ ELLE ────────── */
console.log('\n10. Ce que la console écrit, elle le voit dans son profil — et peut le changer');
const R=await p.evaluate(()=>{
  const S=window.__S,O=window.__ownCat;
  S.adminMetier={massage:{catalogueLibre:true}};
  /* UNE SEULE DONNÉE, DEUX PORTES : `artisans/{uid}.ownCatalog`. Vous écrivez depuis la
     fiche, son écoute le lui apporte, elle le modifie depuis son profil, et votre
     instantané le reçoit en retour. On MESURE le premier sens, qui est celui de la
     question posée — le second est tenu par `test-bout-en-bout-catalogue`. */
  const art={id:'u1',uid:'u1',real:true,name:'Maya',cats:['massage'],status:'valide',ownCatalog:{}};
  S.adminArtisans=[art];
  O.poser('adm',art,'massage',{on:true,lines:[{id:'l1',nm:'Forfait 90 min',price:150,dm:90}]});
  const ecrit=JSON.parse(JSON.stringify(art.ownCatalog));
  /* CE QUE SON ÉCOUTE LUI POSE (`subscribeProStatus` fait exactement cela). */
  S.proOwnCatalog=ecrit; S.persona='pro'; S.proForm=null;
  const vue=O.entree('moi',null,'massage');
  const d=document.createElement('div');
  d.innerHTML=O.editeur('massage','moi',null);
  return {nom:(vue.lines||[])[0].nm,prix:(vue.lines||[])[0].price,duree:(vue.lines||[])[0].dm,
          enService:vue.on!==false,
          saCase:!!d.querySelector('[data-catdv]'),
          saValeur:(d.querySelector('[data-catdv]')||{}).value,
          sonUnite:(d.querySelector('[data-catdu]')||{}).value,
          sesChamps:Array.from(d.querySelectorAll('[data-catnm],[data-catpx]')).map(i=>i.value)};
});
ok(R.nom==='Forfait 90 min'&&R.prix===150, 'elle voit le nom et le prix que la console a écrits');
ok(R.duree===90, 'et la durée avec — c’est le même champ, pas une copie');
ok(R.enService, 'sa carte est en service : la console ne la pose jamais suspendue');
ok(R.saCase&&R.saValeur==='90'&&R.sonUnite==='min',
   'son profil porte LA MÊME case de durée, remplie : « '+R.saValeur+' '+R.sonUnite+' »');
ok(R.sesChamps.indexOf('Forfait 90 min')>=0&&R.sesChamps.indexOf('150')>=0,
   'et elle peut tout y changer elle-même : '+JSON.stringify(R.sesChamps));

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT VERT');
process.exit(f?1:0);
})();
