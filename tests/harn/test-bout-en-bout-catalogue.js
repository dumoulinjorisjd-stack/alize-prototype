/* DE L'INSCRIPTION AU PRÉLÈVEMENT, AVEC UN CATALOGUE PROPRE — LA CHAÎNE ENTIÈRE.

   La demande de l'éditeur, le 29/10/2026 : « fais un test complet de l'inscription a la
   commande en passant par les modifications console pour etre sur que tout suit et que
   rien ne casse, que tout se passe bien et que le paiement débité au client suit
   egalement le bon prix ».

   CE QUI SE MESURE ICI N'EST PAS UNE FONCTION, C'EST UN JOINT. Chaque pièce a sa propre
   épreuve (`test-catalogue-prestataire.js` tient le noyau et son câblage) ; celle-ci
   suit UNE valeur — le prix d'une ligne écrite par un prestataire — à travers les six
   surfaces qui la portent :

     son dossier d'inscription  ->  le document `artisans`  ->  la projection de
     `listProviders`  ->  l'écran de commande du client  ->  `m.acts`  ->  le document
     `requests`  ->  `montantsDemande` du serveur, qui décide du montant prélevé.

   C'est à ces joints que les prix se perdent : `m.acts` RECOPIE nom et prix au moment où
   le client coche, et c'est cette copie que le serveur additionne. Une surface qui
   recalcule au lieu de recopier, ou qui recopie sans rechiffrer, fait payer le prix de
   quelqu'un d'autre — et chaque écran pris seul a l'air juste.

   LA MOITIÉ QUI COMPTE EST LA SECTION E : un prestataire à la grille garde la grille,
   reçoit l'aléatoire, et son client paie le prix de la maison. Sans elle, un correctif
   qui donnerait son catalogue à tout le monde passerait au vert.

   LE PRIX PRÉLEVÉ SE MESURE SUR LE VRAI `montantsDemande` (section D) : il est EXTRAIT de
   `functions/index.js`, jamais recopié — une copie finirait par ne plus compter comme le
   serveur. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

/* ── LE SERVEUR, TEL QU'IL COMPTE ────────────────────────────────────────────────────
   On extrait de `functions/index.js` la fonction qui décide du montant et ce dont elle
   dépend. On ne la recopie pas : le jour où elle change, l'épreuve suit. La fin du corps
   se COMPTE en accolades — sans danger ici, le corps ne porte ni expression régulière ni
   chaîne à accolade, et l'assertion arrière plus bas le vérifie en l'EXÉCUTANT. */
function serveurQuiCompte(){
  const src=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');
  const lignes=src.split('\n');
  const prendreBloc=(debut)=>{
    const i=lignes.findIndex((l)=>l.indexOf(debut)===0);
    if(i<0)throw new Error('introuvable : '+debut);
    let prof=0,out=[];
    for(let j=i;j<lignes.length;j++){
      out.push(lignes[j]);
      for(const c of lignes[j]){ if(c==='{')prof++; else if(c==='}')prof--; }
      if(prof===0&&out.length>1)break;
    }
    return out.join('\n');
  };
  const prendreLigne=(debut)=>{
    const l=lignes.find((x)=>x.indexOf(debut)===0);
    if(!l)throw new Error('introuvable : '+debut);
    return l;
  };
  const code=[
    prendreLigne('const NEEDS_PEOPLE'),
    prendreLigne('function peopleCount'),
    prendreLigne('const round2'),
    prendreLigne('const TRAVEL_MIN'),
    prendreBloc('function montantsDemande'),
    'this.montantsDemande=montantsDemande;'
  ].join('\n');
  const bac={};
  vm.createContext(bac);
  new vm.Script(code).runInContext(bac);
  return bac.montantsDemande;
}

(async()=>{
const MT=serveurQuiCompte();

console.log('\nLE SERVEUR QUI COMPTE — assertion arrière avant toute mesure');
{
  // Une extraction de travers rendrait une fonction qui lève, ou qui rend n'importe quoi :
  // les mesures de la section D seraient alors sans objet sans que rien ne le dise.
  const t=MT({acts:[{price:110,qty:1}],service:'massage',people:1});
  ok(typeof MT==='function'&&t&&t.gross===110,
    'la fonction du serveur est bien extraite et compte (110 € pour une ligne à 110 €, rendu '+(t&&t.gross)+')');
  const d=MT({acts:[{price:40,qty:1}],service:'massage',people:1});
  ok(d&&d.travel===20,'et elle porte bien la règle du déplacement sous 50 € (rendu '+(d&&d.travel)+' €)');
}

const b=await chromium.launch(o);
const p=await b.newPage({viewport:{width:430,height:1600}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.addInitScript(()=>{try{localStorage.setItem('ti_installee','1');}catch(_){}});
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);

/* SON CATALOGUE : quatre lignes, dont deux qui n'existent nulle part chez nous. Les prix
   ne sont PAS ceux de la grille — c'est tout l'objet. */
const SIEN=[{nm:'Massage signature 1 h',price:150},
            {nm:'Massage signature 1 h 30',price:220},
            {nm:'Rituel aux pierres chaudes',price:260},
            {nm:'Duo signature',price:290}];

// ═══ A — L'INSCRIPTION ═══════════════════════════════════════════════════════════════
console.log('\nA — L’INSCRIPTION : il refuse la grille et pose son catalogue');

const grille=await p.evaluate(()=>{
  const S=window.__S; S.demoMode=false; S.adminPricesLus=true;
  return window.__cat.list('massage').map((a)=>({id:a.id,nm:a.nm,price:a.price}));
});
ok(grille.length>=3&&grille.every((l)=>l.price>0),
  'la grille de la maison est lue ('+grille.length+' lignes, de '+Math.min.apply(null,grille.map(l=>l.price))+' à '+Math.max.apply(null,grille.map(l=>l.price))+' €)');
const PRIX_GRILLE=grille.map((l)=>l.price);
ok(!SIEN.some((s)=>PRIX_GRILLE.indexOf(s.price)>=0),
  'et aucun de ses prix n’est un prix de la grille — sans quoi la mesure ne distinguerait rien');

// Le métier est FERMÉ : la console ne l'a pas ouvert.
const ferme=await p.evaluate(()=>{
  const S=window.__S; S.adminMetier={};
  return {libre:window.__ownCat.libre('massage'),
          ok:window.__ownCat.proOk({ownCatalog:{massage:{lines:[{nm:'X',price:150}]}}},'massage')};
});
ok(ferme.libre===false,'métier fermé : le catalogue libre n’est pas offert');
ok(ferme.ok===true,
  'mais `catalogueProOk` juge la SAISIE et non la porte — c’est `desiredNetOk` qui compose les deux');

// La console OUVRE le métier.
const ouvert=await p.evaluate(()=>{
  const S=window.__S; S.adminMetier={massage:{catalogueLibre:true}};
  return window.__ownCat.libre('massage');
});
ok(ouvert===true,'la console ouvre le métier : le catalogue libre devient possible');

// Il remplit son dossier, refuse la grille, pose ses quatre lignes.
const insc=await p.evaluate((SIEN)=>{
  const S=window.__S;
  S.proForm={name:'Institut Lumière',repGiven:'Maya',repFamily:'B.',email:'maya@e.fr',
    phone:'+590690000001',siret:'12345678900011',address:'Gustavia',statusType:'entreprise',
    cats:['massage'],acceptsGrille:false,cgu:true,charte:true,mandat:true,
    insuranceDoc:true,insurer:'AXA',diplomas:['cap'],ownCatalog:{},
    /* `proMissing` RECLAME CES DEUX-LA, et il a raison : sans eux il n'y a pas de compte
       a creer. Une scene incomplete fait refuser le produit et accuser le correctif, et
       c'est la sonde qui l'a dit, pas la relecture. */
    birth:'1990-04-12',password:'motdepasse',password2:'motdepasse'};
  const avant=window.__ownCat.proOk(S.proForm,'massage');
  // Il ajoute ses lignes par la MÊME porte que l'écran (`catPoser`), pas en écrivant l'objet.
  SIEN.forEach((l,i)=>{
    const e=window.__ownCat.entree('pro',null,'massage');
    e.lines=e.lines||[]; e.lines.push({id:'l'+i,nm:l.nm,price:l.price});
    window.__ownCat.poser('pro',null,'massage',e);
  });
  return {avant:avant,apres:window.__ownCat.proOk(S.proForm,'massage'),
          lignes:((S.proForm.ownCatalog||{}).massage||{}).lines||[]};
},SIEN);
ok(insc.avant===false,'avant la saisie, son dossier n’est pas complet sur ce métier');
ok(insc.apres===true&&insc.lignes.length===4,
  'après, il l’est, et ses quatre lignes sont dans son dossier ('+insc.lignes.length+')');
ok(insc.lignes.length===4&&insc.lignes[3].price===290,
  'autant de lignes qu’il veut : la quatrième porte bien 290 € (rendu '+(insc.lignes[3]||{}).price+')');

// Son dossier part : ownCatalog doit atteindre le document `artisans`.
/* UNE SEULE FABRIQUE DE FAUX RESEAU, ET CHAQUE SECTION LA REPOSE. Une section qui
   remplace `FB` par un faux a elle et ne le repose pas laisse la suivante mesurer un
   reseau qui ne note plus rien : la section D a trouve zero ecriture, et seule la SUITE
   COMPLETE l'a dit -- j'avais verifie la sortie de ma section, pas le total.
   `doc()` S'APPELLE DE DEUX FACONS : `doc(db,col,id)` pour une fiche connue, et
   `doc(collection(db,col))` pour un identifiant a naitre, qui est celle que la creation
   d'une demande emprunte. Un faux qui n'en connait qu'une rend un `ref.col` vide, et le
   releve ne retrouve plus rien. */
await p.evaluate(()=>{
  window.__faux=function(extra){
    window.__ecrites=window.__ecrites||[];
    const f={doc:function(){const a=arguments;
           return a.length<=1?{col:(a[0]&&a[0].col)||'',id:'auto'}:{col:a[1],id:a[2]||'auto'};},
         collection:(db,col)=>({col:col}),
         setDoc:(ref,patch,opt)=>{window.__ecrites.push({ref:ref,patch:patch,opt:opt});return Promise.resolve();},
         updateDoc:()=>Promise.resolve(), addDoc:()=>Promise.resolve({id:'x'}),
         onSnapshot:()=>function(){}, serverTimestamp:()=>0, arrayUnion:(v)=>v,
         getDoc:()=>Promise.resolve({exists:()=>false,data:()=>({})})};
    Object.assign(f, extra||{});
    window.__setFB({db:{},auth:{currentUser:{uid:'pro-maya',email:'maya@e.fr'}},f:f,
      fn:{httpsCallable:()=>()=>Promise.resolve({data:{}})}});
  };
});
const envoi=await p.evaluate(()=>{ window.__ecrites=[]; window.__faux(); return true; });
ok(envoi===true,'le réseau est simulé : on relève ce qui part réellement');

/* LA PORTE D'ENVOI EST `fbProSignup`, PAS `proSignup` : la seconde REND L'ECRAN du
   formulaire et n'ecrit rien -- mon epreuve visait la mauvaise, et le releve a dit
   << 0 ecriture >> sur un produit parfaitement juste. `authed:true` lui fait reutiliser
   la session ouverte, le chemin de toute inscription progressive. */
const complet=await p.evaluate(()=>({manque:window.__form.manque(window.__S.proForm),
                                     ok:window.__form.ok(window.__S.proForm)}));
ok(complet.ok===true&&complet.manque.length===0,
  'son dossier est complet aux yeux du produit (manque : '+(complet.manque.join(', ')||'rien')+')');
await p.evaluate(async()=>{
  window.__S.proForm.authed=true;
  try{await window.__envoyer(window.__S.proForm);}catch(e){window.__erreurSignup=(e&&e.message)||String(e);}
});
await p.waitForTimeout(900);
const art=await p.evaluate(()=>{
  /* DEUX ECRITURES PARTENT DANS `artisans` : le dossier, puis une fusion de suite
     (statut, parrainage). On nomme le DOSSIER par ce qui le distingue -- la liste de ses
     metiers -- jamais par son rang : prendre la derniere prenait la fusion, qui ne porte
     aucun catalogue, et l'epreuve accusait un produit juste. Meme piege que pour
     `requests`, deux sections plus bas, et c'est le meme remede. */
  const t=(window.__ecrites||[]).filter((x)=>x.ref&&x.ref.col==='artisans');
  const e=t.filter((x)=>x.patch&&Array.isArray(x.patch.cats));
  return {n:t.length,dossiers:e.length,patch:e.length?e[0].patch:null,err:window.__erreurSignup||null};
});
ok(art.dossiers===1,'son dossier est écrit dans `artisans` ('+art.n+' écriture'+(art.n>1?'s':'')+', dont '+art.dossiers+' dossier'+(art.err?', erreur : '+art.err:'')+')');
const OC=(art.patch||{}).ownCatalog||null;
ok(!!(OC&&OC.massage&&Array.isArray(OC.massage.lines)&&OC.massage.lines.length===4),
  'et son catalogue voyage avec lui ('+((OC&&OC.massage&&OC.massage.lines)||[]).length+' lignes)');
ok(!!(OC&&OC.massage&&OC.massage.lines||[]).length&&OC.massage.lines.every((l)=>l.nm&&l.price>0),
  'chaque ligne porte SA désignation ET son prix — les deux étaient demandés');
ok((art.patch||{}).acceptsGrille===false,
  'sa signature dit qu’il n’a pas accepté la grille : c’est une preuve, pas un arrangement');
ok((art.patch||{}).desiredNetRates===null,
  'et il n’a aucun « net souhaité » : sur un métier ouvert, c’est le catalogue qui répond');
{
  /* LA MESURE QUI COMPTE DE TOUT LE LOT : on donne au noyau du SERVEUR le dossier que
     l'inscription vient reellement d'ecrire. C'est elle qui a trouve que `catEntree`
     posait une entree neuve a `on:false` -- donc un catalogue saisi a l'inscription que
     le serveur n'appliquait JAMAIS, en silence, pour tout nouvel inscrit. Ni la relecture
     ni l'epreuve du noyau ne pouvaient le dire : celle-ci fabrique ses entrees a la main. */
  const CATP=require(path.join(RACINE,'functions/catalogue-prestataire.js'));
  const reg={catalogueLibre:true};
  ok(CATP.catalogueProprePose(art.patch||{},'massage',reg)===true,
    'et le SERVEUR le tient pour un catalogue qui fait foi \u2014 son carnet s\u2019applique vraiment');
  ok(CATP.recoitLAleatoire(art.patch||{},'massage',reg)===false,
    'donc il sort de l\u2019al\u00e9atoire, qui ne distribue que les prix de la maison');
  const foi=CATP.catalogueQuiFaitFoi(art.patch||{},'massage',grille,reg);
  ok(foi.propre===true&&foi.lignes.length===4
     &&SIEN.every((l,i)=>foi.lignes[i].nm===l.nm&&foi.lignes[i].price===l.price),
    'et les quatre lignes que le serveur rendra sont EXACTEMENT celles qu\u2019il a saisies');
}

// ═══ B — LA CONSOLE ══════════════════════════════════════════════════════════════════
console.log('\nB — LA CONSOLE : le choix évolue dans les deux sens, et rien ne s’efface');

const MAYA=()=>({uid:'pro-maya',id:'pro-maya',name:'Institut Lumière',acceptsGrille:false,
  cats:['massage'],ownCatalog:JSON.parse(JSON.stringify({massage:{on:true,lines:SIEN.map((l,i)=>({id:'l'+i,nm:l.nm,price:l.price}))}}))});

/* UNE DESIGNATION VIT DANS LE `value` D'UN CHAMP DE SAISIE, pas dans le texte de la
   page : la lire en retirant les balises l'effacait, et l'epreuve accusait un ecran juste.
   On POSE donc l'editeur dans la page et l'on demande au navigateur ce qu'il a rendu. */
const fiche=await p.evaluate((a)=>{
  const S=window.__S; S.adminMetier={massage:{catalogueLibre:true}};
  const d=document.createElement('div');
  d.innerHTML=window.__ownCat.editeur('massage','adm',a);
  document.body.appendChild(d);
  const noms=[...d.querySelectorAll('[data-catnm]')].map((i)=>i.value);
  const prix=[...d.querySelectorAll('[data-catpx]')].map((i)=>i.value);
  const bascule=!!d.querySelector('[data-caton]');
  const ajout=!!d.querySelector('[data-catadd]');
  const supp=[...d.querySelectorAll('[data-catdel]')].length;
  d.remove();
  return {noms:noms,prix:prix,bascule:bascule,ajout:ajout,supp:supp};
},MAYA());
ok(fiche.noms.length===4&&SIEN.every((l,i)=>fiche.noms[i]===l.nm),
  'sa fiche de console porte ses quatre d\u00e9signations, modifiables une par une ('+fiche.noms.length+' champs)');
ok(fiche.prix.length===4&&SIEN.every((l,i)=>Number(fiche.prix[i])===l.price),
  'et ses quatre prix, personnalisables un par un ('+fiche.prix.join(', ')+' \u20ac)');
ok(fiche.ajout===true&&fiche.supp===4,
  'avec de quoi ajouter une ligne et retirer chacune des quatre ('+fiche.supp+' retraits)');
ok(fiche.bascule===true,
  'et de quoi masquer son catalogue sans le perdre \u2014 le choix \u00e9volue depuis la console');

// Masquer : les lignes survivent.
const masq=await p.evaluate((a)=>{
  const S=window.__S;
  const e=window.__ownCat.entree('adm',a,'massage');
  e.on=false; window.__ownCat.poser('adm',a,'massage',e);
  const apres=((a.ownCatalog||{}).massage||{});
  return {on:apres.on,lignes:(apres.lines||[]).length};
},MAYA());
ok(masq.on===false&&masq.lignes===4,
  'masquer son catalogue garde ses quatre lignes ('+masq.lignes+') — on ne retire que la question');

// Refermer le métier : son catalogue devient inerte, sans rien perdre.
const refer=await p.evaluate((a)=>{
  const S=window.__S;
  S.adminMetier={};               // la console referme
  const libre=window.__ownCat.libre('massage');
  S.adminMetier={massage:{catalogueLibre:true}};   // puis rouvre
  return {ferme:libre,rouvert:window.__ownCat.libre('massage'),
          lignes:((a.ownCatalog||{}).massage||{}).lines.length};
},MAYA());
ok(refer.ferme===false&&refer.rouvert===true,
  'le métier se referme et se rouvre : le choix évolue');
ok(refer.lignes===4,'et ses lignes sont toujours là après l’aller-retour ('+refer.lignes+')');

{
  /* LE PREMIER AJOUT DEPUIS LA CONSOLE DOIT NAITRE EN SERVICE, et c'est le chemin ou le
     defaut vivait : `catPoser('adm', ...)` ecrit l'entree TELLE QUELLE dans Firestore,
     donc une entree neuve a `on:false` faisait naitre SUSPENDUE la carte qu'on venait de
     remplir -- le serveur ne l'appliquait jamais. L'inscription, elle, n'etait pas
     touchee : son payload ecrit `{on:true}` explicitement. C'est la contre-epreuve qui
     l'a dit, apres que j'aie annonce le contraire. */
  const neuf=await p.evaluate(()=>{
    const S=window.__S; S.adminMetier={massage:{catalogueLibre:true}};
    window.__ecrites=[];
    const a={uid:'u-neuf',real:true,name:'Nouveau',cats:['massage'],acceptsGrille:false};
    const e=window.__ownCat.entree('adm',a,'massage');
    e.lines=[{id:'n0',nm:'Soin signature',price:175}];
    window.__ownCat.poser('adm',a,'massage',e);
    const w=(window.__ecrites||[]).filter((x)=>x.ref&&x.ref.col==='artisans');
    const d=document.createElement('div');
    d.innerHTML=window.__ownCat.editeur('massage','adm',a);
    const txt=d.innerText||d.textContent||'';
    return {on:((a.ownCatalog||{}).massage||{}).on,
            ecrit:w.length?((((w[0].patch||{}).ownCatalog)||{}).massage||{}).on:'(rien)',
            suspendue:/Suspendue/.test(txt)};
  });
  ok(neuf.on===true&&neuf.ecrit===true,
    'la premiere prestation ajoutee depuis la console nait EN SERVICE (en memoire '+neuf.on+', ecrit '+neuf.ecrit+')');
  ok(neuf.suspendue===false,
    'et sa fiche ne la dit pas suspendue \u2014 une carte qu\u2019on vient de remplir s\u2019applique');
  const CATP2=require(path.join(RACINE,'functions/catalogue-prestataire.js'));
  ok(CATP2.catalogueProprePose({ownCatalog:{massage:{on:neuf.ecrit,lines:[{id:'n0',nm:'Soin signature',price:175}]}}},
     'massage',{catalogueLibre:true})===true,
    'donc le serveur l\u2019applique d\u00e8s le premier ajout');
}

// ═══ B2 — SON PROFIL ════════════════════════════════════════════════════════════════
console.log('\nB2 — SON PROFIL : il règle ses prix lui-même, et seulement là où c\u2019est ouvert');

const profil=async(metiers)=>p.evaluate((metiers)=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.persona='pro';S.onboarded=true;S.guest=false;S.demoMode=false;S.lang='fr';
  S.proStatus='approved';S.proName='Institut Lumi\u00e8re';S.proCats=['massage','coiffure'];
  S.proNav='account';S.proOnline=true;S.authView=null;S.legalView=null;S.showPitch=false;
  S.adminMetier=metiers;
  S._fold=S._fold||{}; S._fold['p-tarifs']=true;   // on la déplie, comme on la toucherait
  window.__ecrites=[];
  window.__render();
  const r=document.querySelector('.phone')||document.body;
  return {titre:/Mes tarifs/.test(r.innerText),
          noms:[...r.querySelectorAll('[data-catnm]')].map((i)=>i.value),
          ajout:[...r.querySelectorAll('[data-catadd]')].map((b)=>b.dataset.catadd),
          bascule:[...r.querySelectorAll('[data-caton]')].length,
          txt:r.innerText.replace(/\s+/g,' ')};
},metiers);

const pOuvert=await profil({massage:{catalogueLibre:true}});
ok(pOuvert.titre===true,'sa carte « Mes tarifs » existe d\u00e8s qu\u2019un de ses m\u00e9tiers est ouvert');
ok(pOuvert.ajout.length===1&&pOuvert.ajout[0]==='moi:massage',
  'et elle ne porte QUE le m\u00e9tier ouvert, pas la coiffure ('+pOuvert.ajout.join(', ')+')');
ok(/grille Ti-Services/i.test(pOuvert.txt),
  'sans carte pos\u00e9e, elle dit qu\u2019il est \u00e0 la grille et qu\u2019il re\u00e7oit l\u2019al\u00e9atoire');
ok(pOuvert.bascule===0,
  'et aucune bascule tant qu\u2019il n\u2019a rien pos\u00e9 : suspendre un catalogue vide ne veut rien dire');

const pFerme=await profil({});
ok(pFerme.titre===false,
  'aucun m\u00e9tier ouvert : la carte n\u2019existe pas — on ne promet pas une porte qui ne m\u00e8ne nulle part');

// Il pose une ligne depuis SON profil : elle part dans SON document.
const sien=await p.evaluate(()=>{
  const S=window.__S; S.adminMetier={massage:{catalogueLibre:true}};
  S.proOwnCatalog={}; window.__ecrites=[];
  const e=window.__ownCat.entree('moi',null,'massage');
  e.lines=[{id:'m0',nm:'Signature 1 h',price:150}];
  window.__ownCat.poser('moi',null,'massage',e);
  const w=(window.__ecrites||[]).filter((x)=>x.ref&&x.ref.col==='artisans');
  return {memoire:((S.proOwnCatalog||{}).massage||{}),
          ecrit:w.length?(((w[0].patch||{}).ownCatalog||{}).massage||{}):null,
          cles:w.length?Object.keys(w[0].patch||{}):[]};
});
ok(!!(sien.ecrit&&(sien.ecrit.lines||[]).length===1&&sien.ecrit.on===true),
  'ce qu\u2019il pose part dans SON document `artisans`, en service');
ok(sien.cles.length===1&&sien.cles[0]==='ownCatalog',
  'et SEUL son catalogue y part : sa signature `acceptsGrille` ne bouge pas ('+sien.cles.join(', ')+')');
{
  const CATP3=require(path.join(RACINE,'functions/catalogue-prestataire.js'));
  ok(CATP3.catalogueProprePose({ownCatalog:{massage:sien.ecrit}},'massage',{catalogueLibre:true})===true,
    'le serveur l\u2019applique — ce qu\u2019il r\u00e8gle depuis son profil vaut autant que ce qu\u2019il a saisi \u00e0 l\u2019inscription');
}

{
  /* SA CARTE DOIT DESCENDRE AVEC SON DOCUMENT, et cette mesure doit passer par le VRAI
     chemin : une épreuve qui pose `S.proOwnCatalog` à la main ne mesure pas la descente —
     c'est la contre-épreuve qui l'a dit, en ne faisant rougir personne. On livre donc un
     instantané à `subscribeProStatus`, comme Firestore le fait. */
  const desc=await p.evaluate(()=>{
    const S=window.__S;
    S.proOwnCatalog={};
    let livrer=null;
    window.__faux({onSnapshot:(ref,cb)=>{livrer=cb;return function(){};}});
    window.__fil.statut('pro-maya');
    if(!livrer)return {livre:false};
    livrer({exists:()=>true,data:()=>({status:'valide',cats:['massage','coiffure'],
      ownCatalog:{massage:{on:true,lines:[{id:'m0',nm:'Signature 1 h',price:150}]}}})});
    const out={livre:true,lignes:(((S.proOwnCatalog||{}).massage||{}).lines||[]).length,
               prix:((((S.proOwnCatalog||{}).massage||{}).lines||[])[0]||{}).price};
    window.__faux();   // on repose l'ecran comme on l'a trouve
    return out;
  });
  ok(desc.livre===true,'l\u2019\u00e9coute de son document est bien pos\u00e9e (assertion arri\u00e8re)');
  ok(desc.lignes===1&&desc.prix===150,
    'et son catalogue DESCEND avec son document : sa carte ne part pas vide \u00e0 chaque ouverture ('+desc.lignes+' ligne)');
}

const pPose=await profil({massage:{catalogueLibre:true}});
ok(pPose.noms.length===1&&pPose.noms[0]==='Signature 1 h',
  'sa carte la relit ('+(pPose.noms[0]||'rien')+')');
ok(pPose.bascule===1,'et la bascule para\u00eet maintenant qu\u2019il a quelque chose \u00e0 suspendre');
ok(/Vos clients voient vos prix/.test(pPose.txt),
  'le mot suit la personne \u00e0 qui l\u2019on parle : « vos prix », pas « sa carte \u00e0 lui »');

// ═══ C — LA COMMANDE ═════════════════════════════════════════════════════════════════
console.log('\nC — LA COMMANDE : le client le choisit et voit SON catalogue');

const scene=async(uid)=>p.evaluate((uid)=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.persona='client';S.onboarded=true;S.guest=false;S.demoMode=false;S.lang='fr';
  S.adminPricesLus=true;S.adminMetier={massage:{catalogueLibre:true}};
  S.account={name:'Joris D.',email:'j@e.fr',zone:'Gustavia'};
  S.mission=null;S.payStep=false;S.authView=null;S.legalView=null;S.showPitch=false;
  S.history=[];S.blocked=[];
  // L'annuaire tel que `listProviders` le rend : la projection porte `ownCat` et `cat`.
  S._proDir={massage:{list:[
    {uid:'pro-maya',name:'Institut Lumière',founder:false,cal:false,photo:null,siteMode:'both',
     ownCat:true,cat:[{id:'l0',nm:'Massage signature 1 h',price:150},
                      {id:'l1',nm:'Massage signature 1 h 30',price:220},
                      {id:'l2',nm:'Rituel aux pierres chaudes',price:260},
                      {id:'l3',nm:'Duo signature',price:290}]},
    {uid:'pro-grille',name:'Chloé R.',founder:false,cal:false,photo:null,siteMode:'both',
     ownCat:false,cat:null}]}};
  const m=window.__newMission(window.__svc.trouve('massage'));
  m.preferredUid=uid||null; m.preferredName=uid==='pro-maya'?'Institut Lumière':'';
  S.draft=m;S.clientNav='home';window.__render();
  return {lignes:window.__cat.list('massage',uid).map((a)=>({id:a.id,nm:a.nm,price:a.price})),
          propre:window.__cat.foi('massage',uid).propre};
},uid);

const chezElle=await scene('pro-maya');
ok(chezElle.propre===true&&chezElle.lignes.length===4,
  'choisie, c’est SON catalogue qui s’affiche ('+chezElle.lignes.length+' lignes, propre='+chezElle.propre+')');
ok(chezElle.lignes.map((l)=>l.price).join(',')==='150,220,260,290',
  'avec ses prix à elle ('+chezElle.lignes.map((l)=>l.price).join(', ')+' €)');
ok(chezElle.lignes.some((l)=>l.nm==='Rituel aux pierres chaudes'),
  'et ses désignations à elle, dont une qui n’existe nulle part chez nous');

const auHasard=await scene(null);
ok(auHasard.propre===false&&auHasard.lignes.length===grille.length,
  'sans personne choisie, c’est la grille — on ne compare rien, ce sont deux portes');

// Le client coche À LA GRILLE, puis choisit Maya : la commande doit se rechiffrer.
const rech=await p.evaluate(()=>{
  const S=window.__S;
  const m=S.draft;
  const g=window.__cat.list('massage');           // la grille
  m.preferredUid=null;
  m.acts=[{id:g[0].id,nm:g[0].nm,price:g[0].price,qty:1}];
  const avant={id:m.acts[0].id,prix:m.acts[0].price};
  m.preferredUid='pro-maya';
  const chg=window.__ownCat.rechiffre(m);
  return {avant:avant,retirees:chg.retirees,rechiffrees:chg.rechiffrees,restantes:m.acts.length};
});
ok(rech.retirees.length===1&&rech.restantes===0,
  'une ligne de la grille n’est pas à son catalogue : elle est retirée, et c’est DIT ('+(rech.retirees[0]||'rien')+')');

// Il coche chez elle : m.acts porte SES prix.
const panier=await p.evaluate(()=>{
  const S=window.__S,m=S.draft;
  m.preferredUid='pro-maya';
  const c=window.__cat.list('massage','pro-maya');
  m.acts=[{id:c[1].id,nm:c[1].nm,price:c[1].price,qty:1},
          {id:c[2].id,nm:c[2].nm,price:c[2].price,qty:1}];
  const chg=window.__ownCat.rechiffre(m);
  return {acts:m.acts.map((a)=>({id:a.id,nm:a.nm,price:a.price,qty:a.qty})),
          retirees:chg.retirees.length,sub:window.__totals(m).sub};
});
ok(panier.retirees===0&&panier.acts.length===2,
  'ses deux prestations à elle restent dans le panier ('+panier.acts.length+')');
ok(panier.acts[0].price===220&&panier.acts[1].price===260,
  '`m.acts` recopie SES prix — c’est cette copie que le serveur additionnera ('+panier.acts.map(a=>a.price).join(' + ')+')');
ok(panier.sub===480,'et le client voit 480 € (rendu '+panier.sub+' €)');

// ═══ D — LE PRIX PRÉLEVÉ ═════════════════════════════════════════════════════════════
console.log('\nD — LE PRIX PRÉLEVÉ : ce que le serveur compte sur ce que le navigateur a écrit');

const doc=await p.evaluate(async()=>{
  window.__ecrites=[];
  const S=window.__S,m=S.draft;
  m.zone='Gustavia';m.address='Rue de la République';m.slot='10:00';m.dateISO='2026-11-02';
  m.people=1;m.locationMode='domicile';m.reqId=null;
  await window.__demande(m);
  /* DEUX DOCUMENTS PARTENT DANS `requests` : la demande elle-meme, et la fiche PRIVEE
     qui porte l'adresse et le telephone. On nomme la demande par ce qui la distingue
     (`clientUid`), jamais par son rang : prendre la derniere prenait la fiche privee, qui
     ne porte aucun prix, et l'epreuve accusait un produit juste. */
  const e=(window.__ecrites||[]).filter((x)=>x.ref&&x.ref.col==='requests'&&x.patch&&x.patch.clientUid);
  return e.length?e[e.length-1].patch:null;
});
ok(!!doc,'la demande est écrite dans `requests`');
ok(!!(doc&&Array.isArray(doc.acts)&&doc.acts.length===2),
  'et le document porte les deux prestations ('+((doc&&doc.acts)||[]).length+')');
ok(!!(doc&&doc.acts)&&doc.acts[0].price===220&&doc.acts[1].price===260,
  'avec SES prix, pas les nôtres ('+((doc&&doc.acts)||[]).map(a=>a.price).join(' + ')+')');
ok(doc&&doc.forfaitTotal===480,'le total ferme du document dit 480 € (rendu '+(doc&&doc.forfaitTotal)+')');

{
  // LE JOINT QUI COMPTE : on donne au VRAI serveur le document que le navigateur vient
  // d'écrire, et l'on regarde ce qu'il prélèverait.
  const r=Object.assign({},doc,{service:'massage',rate:doc.rate,unit:doc.unit});
  const t=MT(r);
  ok(t.gross===480,'le serveur prélèverait 480 € — le prix de SON catalogue (rendu '+t.gross+' €)');
  ok(t.travel===0,'aucun déplacement ajouté : la commande dépasse le plancher');
  const sommeDuCat=SIEN[1].price+SIEN[2].price;
  ok(t.gross===sommeDuCat,
    'et ce montant est EXACTEMENT la somme de ses deux lignes, telles qu’il les a saisies à l’inscription ('+sommeDuCat+' €)');
}

// ═══ E — RIEN NE CASSE ═══════════════════════════════════════════════════════════════
console.log('\nE — RIEN NE CASSE : la grille reste la grille, et son client paie la grille');

const chezLui=await p.evaluate(()=>{
  const S=window.__S,m=S.draft;
  m.preferredUid='pro-grille';m.preferredName='Chloé R.';m.reqId=null;
  const chg=window.__ownCat.rechiffre(m);
  const c=window.__cat.list('massage','pro-grille');
  return {propre:window.__cat.foi('massage','pro-grille').propre,
          lignes:c.map((a)=>({id:a.id,nm:a.nm,price:a.price})),retirees:chg.retirees.length};
});
ok(chezLui.propre===false,
  'un prestataire qui n’a posé aucun catalogue est jugé sur la grille — c’est la moitié qui compte');
ok(chezLui.lignes.length===grille.length&&chezLui.lignes.every((l,i)=>l.price===grille[i].price),
  'et c’est la grille entière, aux mêmes prix ('+chezLui.lignes.map(l=>l.price).join(', ')+' €)');
ok(chezLui.retirees===2,
  'les deux lignes du catalogue de l’AUTRE sont retirées, et c’est dit ('+chezLui.retirees+')');

const docGrille=await p.evaluate(async()=>{
  window.__ecrites=[];
  const S=window.__S,m=S.draft;
  const g=window.__cat.list('massage','pro-grille');
  m.acts=[{id:g[0].id,nm:g[0].nm,price:g[0].price,qty:1}];
  m.reqId=null;
  await window.__demande(m);
  const e=(window.__ecrites||[]).filter((x)=>x.ref&&x.ref.col==='requests'&&x.patch&&x.patch.clientUid);
  return {patch:e.length?e[e.length-1].patch:null,attendu:g[0].price};
});
{
  const d=docGrille.patch;
  ok(!!(d&&d.acts&&d.acts.length===1&&d.acts[0].price===docGrille.attendu),
    'sa commande porte le prix de la GRILLE ('+((d&&d.acts&&d.acts[0])||{}).price+' €)');
  const t=d?MT(Object.assign({},d,{service:'massage'})):{gross:-1};
  ok(t.gross===docGrille.attendu+(docGrille.attendu<50?20:0),
    'et le serveur prélèverait ce prix-là (rendu '+t.gross+' €)');
}

// L'aléatoire, côté serveur : la décision est celle du noyau, on la mesure ici aussi.
{
  const CATP=require(path.join(RACINE,'functions/catalogue-prestataire.js'));
  const reg={catalogueLibre:true};
  ok(CATP.recoitLAleatoire(MAYA(),'massage',reg)===false,
    'Maya ne reçoit PAS l’aléatoire : il ne distribue que les prix de la maison');
  ok(CATP.recoitLAleatoire({uid:'pro-grille',cats:['massage']},'massage',reg)===true,
    'Chloé le reçoit — rien ne change pour elle');
  ok(CATP.recoitLAleatoire(MAYA(),'massage',{})===true,
    'et métier refermé, Maya le reçoit de nouveau : le choix évolue dans les deux sens');
}

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTout est vert.');
process.exit(f?1:0);
})().catch((e)=>{console.log('ÉCHEC : '+e.message);process.exit(1);});
