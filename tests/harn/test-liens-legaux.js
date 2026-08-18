/* UNE ADRESSE PUBLIQUE DOIT OUVRIR LE DOCUMENT, PAS L'APPLICATION.
   La fiche App Store et la fiche Play pointent vers ti-services.fr/?legal=… pour les
   conditions, la confidentialité et la suppression de compte. Ces trois adresses sont
   VÉRIFIÉES par les deux magasins : un examinateur qui clique et tombe sur l'accueil
   conclut que le document n'existe pas. Or « ?legal= » n'était lu nulle part.

   Ce test ouvre chaque adresse comme le ferait un examinateur, et vérifie qu'elle
   affiche le bon texte — dans les trois langues pour la page de suppression, que
   Google exige et lit vraiment. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

const ADRESSES=[
  ['cgu','Conditions Générales d’Utilisation'],
  ['cgv','Conditions Générales de Vente'],
  ['mentions','Mentions légales'],
  ['confidentialite','Politique de confidentialité'],
  ['suppression','Suppression de compte'],
];

(async()=>{
  const b=await chromium.launch(o);
  const p=await (await b.newContext({locale:'fr-FR',viewport:{width:420,height:1200}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps|tile/.test(r.request().url())?r.abort():r.continue());

  console.log('\nA — chaque adresse ouvre son document');
  for(const [cle,titre] of ADRESSES){
    await p.goto('file://'+path.join(RACINE,'index.html')+'?legal='+cle,{waitUntil:'load'});
    await p.waitForTimeout(1200);
    const r=await p.evaluate(()=>({vue:(window.__S&&window.__S.legalView)||null,
      txt:(document.body.innerText||'').replace(/\s+/g,' ')}));
    ok(r.txt.indexOf(titre)>=0,'?legal='+cle+' affiche « '+titre+' »');
  }

  console.log('\nB — une clé inconnue n’ouvre rien (et ne casse rien)');
  await p.goto('file://'+path.join(RACINE,'index.html')+'?legal=nimportequoi',{waitUntil:'load'});
  await p.waitForTimeout(1100);
  const bidon=await p.evaluate(()=>(document.body.innerText||'').replace(/\s+/g,' '));
  ok(bidon.indexOf('Document légal')<0,'l’application s’ouvre normalement, sans document');

  console.log('\nC — la page de suppression dit ce que le code fait vraiment');
  await p.goto('file://'+path.join(RACINE,'index.html')+'?legal=suppression',{waitUntil:'load'});
  await p.waitForTimeout(1200);
  const t=await p.evaluate(()=>(document.body.innerText||'').replace(/\s+/g,' '));
  ok(/Supprimer mon compte/.test(t),'elle indique le chemin exact dans l’application');
  ok(/contact@ti-services\.fr/.test(t),'elle donne une adresse pour ceux qui n’ont plus l’app');
  ok(/trente jours/.test(t),'elle annonce un délai — Google le demande');
  ok(/dix ans/.test(t)&&/L. 123-22/.test(t.replace(/ /g,' ')),
    'elle dit ce qui est CONSERVÉ, et sur quel fondement');
  ok(/cinq ans/.test(t),'y compris les pièces d’un intervenant');
  ok(/immédiate et définitive/.test(t),'et que la suppression ne se rattrape pas');
  // Google pose DEUX questions distinctes : supprimer le compte, et faire effacer une
  // partie de ses données SANS le fermer. Déclarer la seconde oblige la page à décrire
  // la procédure « de manière bien distincte » — un article à elle, pas une incise.
  ok(/Effacer certaines données sans fermer son compte/.test(t),
    'la suppression partielle a son propre article');
  ok(/Suppression de données/.test(t),'avec l’objet d’e-mail exact à employer');
  ok(/reste ouvert et utilisable/.test(t),'et dit que le compte survit');

  // Le changement de langue passe par l'état interne : on repasse donc par le harnais,
  // qui l'expose. L'adresse publique, elle, se teste sur le fichier livré.
  console.log('\nD — les trois langues');
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);
  for(const [lang,attendu] of [['en','Deleting your account from the app'],['pt','Eliminar a conta a partir da aplicação']]){
    const r=await p.evaluate((l)=>{const S=window.__S;document.body.classList.add('standalone');
      S.lang=l;S.legalView='suppression';window.__render();
      return (document.body.innerText||'').replace(/\s+/g,' ');},lang);
    ok(r.indexOf(attendu)>=0,'la page existe en '+lang.toUpperCase());
  }

  console.log('\nE — le document est atteignable depuis l’application, pas seulement par l’adresse');
  const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
  ok(/data-act="view-suppression"/.test(src),'un lien figure dans le pied de page légal');
  ok(/case 'view-suppression'/.test(src),'et il est branché');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
