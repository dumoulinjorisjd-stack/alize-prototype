/* LES NOTES QUE LES CLIENTS DONNENT AUX PRESTATAIRES.

   « Je ne vois nulle part les notes que donnent les clients aux prestataires »
   (l'éditeur, 30/10/2026). MESURÉ, ET ELLES ÉTAIENT TOUTES LÀ : `submit-rating` écrit
   `rating` et `ratedAt` sur la DEMANDE depuis toujours. Ce qui manquait, c'est que
   personne ne les lisait — trois arrêts l'un derrière l'autre :
     1. `reqPourConsole`, la liste FERMÉE qui alimente la console, ne portait pas la note :
        elle était jetée à l'entrée ;
     2. la projection des prestataires écrivait `rating: 0` EN DUR, jamais rempli ;
     3. le mot « rating » n'apparaît pas UNE SEULE FOIS dans tout `functions/`.
   La ligne « Note · missions » de la fiche lisait donc ce zéro câblé, et affichait « — »
   pour tout le monde, pour toujours. Les seules notes non nulles du fichier étaient
   celles des prestataires de DÉMONSTRATION de la vitrine — ce qui explique qu'on « voie
   des notes » sans jamais voir les vraies.

   CETTE ÉPREUVE TIENT LES DEUX BOUTS : ce qui doit paraître, et ce qui ne doit PAS être
   inventé — sans quoi une règle qui noterait tout le monde, ou personne, passerait au
   vert. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const F='file://'+path.join(RACINE,'tests/harn/app.html');

(async()=>{
const b=await chromium.launch(o);
const p=await (await b.newContext({locale:'fr-FR'})).newPage();
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto(F); await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(400);

/* ── 1. LA NOTE TRAVERSE LA LISTE FERMÉE ────────────────────────────────────── */
console.log('\n1. La note du client traverse la liste fermée de la console');
const P=await p.evaluate(()=>{
  const C=window.__cmd;
  const brute={status:'rated',clientUid:'c1',providerUid:'u1',service:'massage',
               serviceName:'Massage',total:150,rating:4,ratedAt:1760000000000};
  const r=C.projette('r1',brute);
  const sans=C.projette('r2',{status:'paid',clientUid:'c1',providerUid:'u1'});
  return {note:r.note,noteAt:r.noteAt,sansNote:sans.note,sansDate:sans.noteAt,
          cles:Object.keys(r).length};
});
ok(P.note===4&&P.noteAt===1760000000000,
   'la note et sa date arrivent dans la console (elles étaient JETÉES à l\'entrée)');
ok(P.sansNote===0&&P.sansDate===0, 'une mission non notée porte zéro, pas une note inventée');

/* ── 2. CE QU'EST UNE NOTE, ET CE QUI N'EN EST PAS UNE ──────────────────────── */
console.log('\n2. Une note est entre 1 et 5 — zéro est une absence, pas une note');
const N=await p.evaluate(()=>{
  const C=window.__cmd;
  return {un:C.noteDe({note:1}),cinq:C.noteDe({note:5}),
          zero:C.noteDe({note:0}),six:C.noteDe({note:6}),moins:C.noteDe({note:-2}),
          texte:C.noteDe({note:'bien'}),rien:C.noteDe({}),nul:C.noteDe(null),
          virgule:C.noteDe({note:4.4}),hausse:C.noteDe({note:4.6})};
});
ok(N.un===1&&N.cinq===5, 'une étoile et cinq étoiles sont des notes');
ok(N.zero===0&&N.six===0&&N.moins===0, 'zéro, six et une note négative n\'en sont pas');
ok(N.texte===0&&N.rien===0&&N.nul===0, 'et ce qu\'on ne sait pas lire n\'en est pas une non plus');
ok(N.virgule===4&&N.hausse===5, 'une note à virgule s\'arrondit, elle ne se jette pas');

/* ── 3. LA MOYENNE, ET CE QU'ELLE COMPTE ───────────────────────────────────── */
console.log('\n3. La moyenne d\'un prestataire ne compte que SES missions notées');
const M=await p.evaluate(()=>{
  const C=window.__cmd;
  const reqs=[
    {providerUid:'u1',note:5,noteAt:300,svcName:'Massage'},
    {providerUid:'u1',note:4,noteAt:200,svcName:'Massage duo'},
    {providerUid:'u1',note:3,noteAt:100,svcName:'Ménage'},
    {providerUid:'u1',note:0,noteAt:0,svcName:'Jamais notée'},   // pas une note
    {providerUid:'u2',note:1,noteAt:400,svcName:'Chez quelqu\'un d\'autre'},
    {providerUid:'',note:5,noteAt:500,svcName:'Sans prestataire'}];
  const a=C.notes(reqs,'u1'), b2=C.notes(reqs,'u2'),
        vide=C.notes(reqs,'u3'), sansUid=C.notes(reqs,''), sansReqs=C.notes(null,'u1');
  return {moy:a.moyenne,avis:a.avis,ordre:a.liste.map(x=>x.note),
          autre:{moy:b2.moyenne,avis:b2.avis},
          vide:vide,sansUid:sansUid,sansReqs:sansReqs};
});
ok(M.avis===3, 'trois missions notées sur quatre : la non notée ne compte pas ('+M.avis+')');
ok(M.moy===4, 'la moyenne est 4,0 — pas 3,0, ce qu\'un zéro compté aurait donné ('+M.moy+')');
ok(M.ordre.join(',')==='5,4,3', 'et la plus récente vient en tête : '+M.ordre.join(' · '));
ok(M.autre.avis===1&&M.autre.moy===1, 'la note de l\'un n\'entre pas chez l\'autre');
ok(M.vide===null, 'un prestataire que personne n\'a noté rend `null`, jamais 0,0 ★');
ok(M.sansUid===null&&M.sansReqs===null, 'et sans identifiant ni demandes, on ne rend rien');

/* ── 4. LA MOYENNE EST ARRONDIE À UN ENDROIT ───────────────────────────────── */
console.log('\n4. La moyenne se lit telle qu\'elle est calculée');
const A=await p.evaluate(()=>{
  const C=window.__cmd;
  const n=(notes)=>C.notes(notes.map((v,i)=>({providerUid:'u1',note:v,noteAt:i})),'u1').moyenne;
  return {deux:n([5,4]),trois:n([5,4,4]),sept:n([5,5,4,4,4,3,3]),cinqcinq:n([5,5,5])};
});
ok(A.deux===4.5&&A.cinqcinq===5, 'deux notes 5 et 4 font 4,5 ; trois 5 font 5');
ok(A.trois===4.3, 'et 5+4+4 fait 4,3 — un seul arrondi, celui qui s\'affiche ('+A.trois+')');
ok(A.sept===4, 'sept notes : '+A.sept);

/* ── 5. LA FICHE DIT LA VÉRITÉ, ET NE DIT RIEN AVANT D'AVOIR LU ────────────── */
console.log('\n5. La fiche d\'un prestataire montre enfin ses notes');
const V=await p.evaluate(()=>{
  const S=window.__S;
  const art={id:'u1',uid:'u1',real:true,name:'Maya',cats:['massage'],status:'valide',
             acceptedTerms:true,jobs:12};
  S.adminArtisans=[art];S.adminArtsLoaded=true;S.adminMetier={};
  S.persona='admin';S.admin={sel:'u1',view:'art'};
  const lire=()=>{
    window.__render();
    const v=document.getElementById('view')||document.body;
    const r=Array.from(v.querySelectorAll('.fiche .fr'))
      .find(x=>/Note/.test((x.querySelector('.k')||{}).textContent||''));
    return r?(r.querySelector('.v').textContent||'').replace(/\s+/g,' ').trim():'(pas de ligne)';
  };
  const out={};
  S.adminReqsLus=false;S.adminReqs=null;            out.avantLecture=lire();
  S.adminReqsLus=true;S.adminReqs=[];               out.aucunAvis=lire();
  S.adminReqs=[
    {providerUid:'u1',note:5,noteAt:Date.parse('2026-10-20'),svcName:'Massage',svc:'massage'},
    {providerUid:'u1',note:4,noteAt:Date.parse('2026-10-10'),svcName:'Massage duo',svc:'massage'},
    {providerUid:'u1',note:2,noteAt:Date.parse('2026-10-01'),svcName:'Ménage',svc:'menage'}];
                                                    out.avecAvis=lire();
  /* DIX AVIS : la liste deborde, et la phrase du reste parait — c'est le SECOND
     endroit qui compte des avis, et trois notes ne le font jamais paraitre. */
  S.adminReqs=Array.from({length:10},(_,i)=>({providerUid:'u1',note:4,
    noteAt:Date.parse('2026-10-20')-i*864e5,svcName:'Massage',svc:'massage'}));
                                                    out.dixAvis=lire();
  S.adminReqs=[
    {providerUid:'u1',note:5,noteAt:Date.parse('2026-10-20'),svcName:'Massage',svc:'massage'},
    {providerUid:'u1',note:4,noteAt:Date.parse('2026-10-10'),svcName:'Massage duo',svc:'massage'},
    {providerUid:'u1',note:2,noteAt:Date.parse('2026-10-01'),svcName:'Ménage',svc:'menage'}];
                                                    lire();
  /* UNE NOTE BASSE EST EXACTEMENT CE QU'ON VEUT VOIR : elle est peinte à part. */
  const v=document.getElementById('view')||document.body;
  const r=Array.from(v.querySelectorAll('.fiche .fr'))
    .find(x=>/Note/.test((x.querySelector('.k')||{}).textContent||''));
  out.basses=r?Array.from(r.querySelectorAll('b')).filter(b=>/coral/.test(b.getAttribute('style')||'')).map(b=>b.textContent.trim()):[];
  return out;
});
ok(/Lecture des demandes/.test(V.avantLecture),
   'avant d\'avoir lu les demandes, on ne dit PAS « aucun avis » : '+V.avantLecture);
ok(/Aucun avis/.test(V.aucunAvis)&&/12 missions/.test(V.aucunAvis),
   'personne ne l\'a noté : on le dit, avec ses missions — « '+V.aucunAvis+' »');
ok(/3,7/.test(V.avecAvis), 'la moyenne paraît, en français : « '+V.avecAvis.slice(0,40)+' »');
ok(/3 avis/.test(V.avecAvis)&&/12 missions/.test(V.avecAvis),
   'le nombre d\'AVIS est dit à côté du nombre de MISSIONS — ce ne sont pas le même fait');
/* « AVIS » EST INVARIABLE — et `plN` ajoute un « s » a tout ce qu'on lui passe.
   L'assertion « 3 avis » ci-dessus est vraie de « 3 aviss » : elle ne mord pas. */
ok(!/aviss/.test(V.avecAvis)&&!/aviss/.test(V.dixAvis),
   'le mot « avis » ne prend pas de « s » : « '+V.avecAvis.slice(0,30)+' » / « '+(V.dixAvis.match(/et \d+ avis[^.]*/)||['(rien)'])[0]+' »');
// Assertion arriere : sans le mot, « pas de aviss » serait vraie de rien du tout.
ok(/\bavis\b/.test(V.avecAvis)&&/et 2 avis plus anciens/.test(V.dixAvis),
   'et les deux endroits qui comptent des avis le disent bien (fiche, puis reste de la liste)');
ok(/Massage duo/.test(V.avecAvis)&&/M[ée]nage/.test(V.avecAvis),
   'et les notes elles-mêmes sont là, mission par mission');
ok(V.basses.length===1&&/^2/.test(V.basses[0]),
   'une note basse est peinte à part — c\'est elle qu\'on cherche ('+V.basses.join(',')+')');

/* ── 6. LE CHAMP MORT NE PEUT PLUS FAIRE MENTIR LA FICHE ───────────────────── */
console.log('\n6. Le zéro câblé qui faisait mentir la fiche a disparu');
const html=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
ok(!/test:!!a\.test,rating:0/.test(html),
   'la projection des prestataires n\'écrit plus un `rating` toujours nul');
// Assertion arrière : sans la ligne relevée, la mesure ci-dessus serait vraie de rien.
ok(/test:!!a\.test,jobs:a\.jobsTotal/.test(html),
   'et c\'est bien CETTE projection qu\'on a mesurée (elle porte toujours ses missions)');
ok(!/a\.rating\?a\.rating\.toFixed/.test(html),
   'et la fiche ne lit plus ce champ : elle calcule depuis les demandes');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT VERT');
process.exit(f?1:0);
})();
