/* CE QU'ON PEUT COMMANDER PASSE DEVANT.

   « On fait remonter les prestations disponibles en haut et les bientôt disponibles plus
   en bas » (20/09/2026). Un métier sans prestataire validé restait à la place que lui
   donne le catalogue : le client tombait sur trois tuiles grises avant d'atteindre ce
   qu'il peut réellement réserver, et la première impression d'une île entière tenait à
   l'ordre alphabétique d'une liste écrite il y a des mois.

   ON PARTITIONNE, ON NE TRIE PAS. L'ordre du catalogue a été posé à la main — les métiers
   les plus demandés en tête — et un tri le détruirait. Chaque groupe garde donc son
   ordre, et seuls les « bientôt » passent derrière : c'est ce que cette épreuve mesure,
   pas seulement « les gris sont en bas ».

   ET « BIENTÔT » NE SE DÉCIDE QU'UNE FOIS : la tuile le lisait déjà pour se griser, et
   l'ordre lit la même fonction. Deux définitions se seraient séparées au premier ajout de
   règle (un métier débloqué pour un essai, un compte d'examen App Store…). */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

(async()=>{
const b=await chromium.launch(o);
const p=await b.newPage({viewport:{width:430,height:1500}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);

// `forceGate` allume la disponibilité par métier hors production : sans elle, tout est
// ouvert et l'épreuve ne mesurerait rien.
const accueil=(dispos,catView)=>p.evaluate(([D,CV])=>{
  const S=window.__S; document.body.classList.add('standalone');
  S.persona='client';S.onboarded=true;S.guest=false;S.demoMode=false;S.lang='fr';
  S.draft=null;S.mission=null;S.catView=CV||null;
  S.account={name:'Joris D.',email:'j@e.fr',zone:'Gustavia'};
  S.forceGate=true;S.availableServices=D;
  window.__render();
  const g=document.querySelector('.cats');
  const cases=[...g.children].map(function(e){
    const sep=e.className.indexOf('cats-sep')>=0;
    const t=(e.innerText||'').replace(/\s+/g,' ').trim();
    return {sep:sep, bientot:/BIENTÔT/.test(t), nom:t.replace(/^BIENTÔT ?/,'').split(' dès ')[0].split(' Bientôt')[0].trim()};
  });
  return cases;
},[dispos,catView||null]);

const DISPOS=['menage','jardin','colis','coiffure'];

console.log('\nA — les tuiles commandables sont toutes devant');
const a=await accueil(DISPOS);
const iSep=a.findIndex(x=>x.sep);
const avant=a.slice(0,iSep), apres=a.slice(iSep+1);
ok(iSep>0,'un intertitre sépare les deux groupes');
ok(avant.length&&avant.every(x=>!x.bientot),
  'tout ce qui est au-dessus se commande ('+avant.map(x=>x.nom).join(', ')+')');
ok(apres.length&&apres.every(x=>x.bientot),
  'tout ce qui est en dessous est « bientôt » ('+apres.length+' tuiles)');
ok(a.filter(x=>x.sep).length===1,'et il n’y a qu’un seul intertitre');

console.log('\nB — l’ordre du catalogue survit DANS chaque groupe');
// Le catalogue place Ménage avant Jardinage, et Baby-sitting avant Déménagement. Un tri
// (alphabétique, par disponibilité…) casserait ces deux relations ; une partition, non.
const pos=(nom)=>a.findIndex(x=>x.nom===nom);
ok(pos('Ménage')>=0&&pos('Ménage')<pos('Jardinage'),
  'Ménage reste avant Jardinage, comme dans le catalogue');
ok(pos('Baby-sitting')<pos('Déménagement'),
  'et Baby-sitting avant Déménagement, tous deux dans le groupe du bas');

console.log('\nC — l’intertitre ne paraît que s’il sépare vraiment quelque chose');
const tout=await accueil(['menage','baby','jardin','demenagement','coiffure','animaux','massage',
  'manucure','epilation','epilationdef','maquillage','piscine','plomberie','electricite','deck',
  'clim','coach','natation','pilates','yoga','colis']);
ok(!tout.some(x=>x.sep)&&!tout.some(x=>x.bientot),
  'tout est ouvert : aucun intertitre, il annoncerait une section vide');
const rien=await accueil([]);
ok(!rien.some(x=>x.sep)&&rien.every(x=>x.bientot),
  'rien n’est ouvert : aucun intertitre non plus, il n’y a rien devant');

console.log('\nD — une catégorie ouverte suit la même règle');
// « Beauté » : coiffure ouverte, les quatre autres non.
const beaute=await accueil(DISPOS,'beaute');
const j=beaute.findIndex(x=>x.sep);
ok(j===1&&beaute[0].nom==='Coiffure'&&beaute.slice(2).every(x=>x.bientot),
  'dans Beauté, la coiffure passe devant et les quatre autres suivent l’intertitre');

console.log('\nE — une seule définition de « bientôt »');
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const home=/function clientHome\(\)\{[\s\S]{0,9000}?const cats=/.exec(src)[0];
ok((home.match(/!svcAvailable\(/g)||[]).length===1&&(home.match(/!catAvailable\(/g)||[]).length===1,
  'la disponibilité n’est lue qu’à UN endroit : la tuile et l’ordre ne peuvent plus diverger');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
