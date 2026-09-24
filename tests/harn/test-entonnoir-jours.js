/* L'ENTONNOIR D'INSTALLATION DIT ENFIN QUAND.

   « Il faut rendre cet entonnoir d'installation plus précis, avec les jours ou autre
   détail » (18/09/2026). La carte affichait 368 visiteurs et 58 installées DEPUIS
   TOUJOURS : un cumul ne peut que monter, donc il ne dit ni si le lancement décolle, ni
   si la semaine s'est effondrée. Et rien n'était daté — `updatedAt` était réécrit à
   chaque étape franchie, si bien qu'on ne pouvait même pas savoir quand un appareil
   avait installé.

   DEUX ÉCHELLES, ET CHACUNE DIT LA SIENNE. Un premier jet mettait les deux frises à la
   même échelle : les installations valent 16 % des visites, donc un à deux pixels au ras
   de l'axe — mesuré, et illisible. Deux échelles se lisent sans tromper à condition
   d'écrire le maximum de chacune, qui est ce qui permet de comparer deux jours.

   ET CE QU'ON NE SAIT PAS SE DIT : les installations d'avant cette mesure ne portent pas
   de date. Elles comptent dans le total, jamais dans les jours ni dans la médiane. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

// Trente jours fabriqués : deux semaines franchement différentes, des journées VIDES,
// et une dernière semaine qui monte — de quoi voir si les sommes et les frises suivent.
const VIS=[3,7,12,4,0,9,21,14,6,2,11,18,25,30,12,8,4,0,1,6,13,19,22,17,9,5,14,28,33,41];
const INS=VIS.map(v=>Math.round(v*0.16));
const JOURS=VIS.map((v,i)=>{const d=new Date(Date.parse('2026-08-21T12:00:00Z')+i*86400000).toISOString().slice(0,10);
  return {j:d,visit:v,guide:Math.round(v*0.3),installed:INS[i],ios:INS[i],android:0,desktop:0};});
const som=(a,k)=>a.reduce((t,x)=>t+x[k],0);

(async()=>{
const b=await chromium.launch(o);
const p=await b.newPage({viewport:{width:430,height:1100}});
p.on('pageerror',e=>console.log('ERREUR PAGE:',e.message));
await p.goto('file://'+path.join(RACINE,'tests/harn/app.html'));
await p.waitForFunction(()=>window.__S&&window.__render); await p.waitForTimeout(300);

async function carte(detail){
  return p.evaluate(([J,D])=>{const S=window.__S; document.body.classList.add('standalone');
    S.adminFunnel={u_visit_total:368,u_guide_total:82,u_installed_total:58,
      u_installed_ios:26,u_installed_android:24,u_installed_desktop:8};
    S.adminFunnelLoaded=true;
    S.adminFunnelDetail=D?Object.assign({jours:J},D):null;
    S.adminFunnelDetailLoaded=true;
    S.persona='admin';S.onboarded=true;S.authView=null;S.showPitch=false;S.legalView=null;
    S.admin={view:'home',sel:null}; window.__render();
    const c=[...document.querySelectorAll('.card')].filter(x=>/Entonnoir d'installation/.test(x.textContent||''));
    const t=c[c.length-1]; if(t&&!t.classList.contains('open')){const h=t.querySelector('.fold-head,button');if(h)h.click();}
    const carte=[...document.querySelectorAll('.card')].filter(x=>/Entonnoir d'installation/.test(x.textContent||'')).pop();
    const svgs=[...carte.querySelectorAll('svg[role="img"]')];
    return {txt:carte.innerText.replace(/\s+/g,' '),
      frises:svgs.length,
      colonnes:svgs.map(s=>s.querySelectorAll('g').length),
      barres:svgs.map(s=>s.querySelectorAll('rect[rx]').length),
      infobulle:(svgs[0]&&svgs[0].querySelector('title')||{}).textContent||''};
  },[JOURS,detail]);
}

console.log('\nA — la semaine se lit, et se compare à la précédente');
const r=await carte({recentes:[],delaiMedianMin:52,delaiN:31,installeesDatees:31});
const s7=JOURS.slice(-7), p7=JOURS.slice(-14,-7);
ok(r.txt.includes(som(s7,'visit')+' visiteurs'),'les 7 derniers jours sont sommés ('+som(s7,'visit')+' visiteurs)');
ok(r.txt.includes(som(s7,'installed')+' installées'),'et leurs installations ('+som(s7,'installed')+')');
ok(r.txt.includes('semaine précédente : '+som(p7,'visit')+' · '+som(p7,'installed')),
  'la semaine PRÉCÉDENTE est donnée : un nombre seul ne se juge pas');
ok(r.txt.includes('30 jours : '+som(JOURS,'visit')+' visiteurs'),'et la fenêtre entière, pour l’ordre de grandeur');

console.log('\nB — deux frises, deux échelles, et chacune écrit la sienne');
ok(r.frises===2,'une frise par mesure ('+r.frises+')');
ok(r.colonnes[0]===30&&r.colonnes[1]===30,
  'trente colonnes chacune, y compris les jours VIDES — un trou se lirait comme une absence de mesure');
ok(r.txt.includes('Visiteurs · plus forte journée : '+Math.max(...VIS)),
  'la frise des visiteurs annonce son maximum ('+Math.max(...VIS)+')');
ok(r.txt.includes('Installées · plus forte journée : '+Math.max(...INS)),
  'celle des installations aussi ('+Math.max(...INS)+') — sans quoi deux échelles tromperaient');
ok(r.barres[0]===VIS.filter(v=>v>0).length,
  'une barre par jour NON VIDE ('+r.barres[0]+') : zéro ne dessine rien, et se distingue ainsi de « peu »');
ok(/^2026-08-21, 3 visiteurs, 0 installée$/.test(r.infobulle.trim()),
  'l’infobulle donne le jour et ses deux nombres, au singulier quand il le faut — « '+r.infobulle.trim()+' »');

console.log('\nC — le délai se dit dans l’unité où on le pense');
ok(r.txt.includes('Délai visite → installation : 52 min'),'moins de 90 minutes : en minutes');
ok(r.txt.includes('médiane sur 31 appareils'),'et c’est une MÉDIANE : une installation trois semaines après déplace une moyenne, pas elle');
const h=await carte({recentes:[],delaiMedianMin:240,delaiN:9,installeesDatees:31});
ok(h.txt.includes('4 h'),'quelques heures : en heures');
const j=await carte({recentes:[],delaiMedianMin:4300,delaiN:9,installeesDatees:31});
ok(j.txt.includes('3 j'),'au-delà de deux jours : en jours');

console.log('\nD — ce qu’on ne sait pas se dit');
ok(r.txt.includes('27 installations d’avant cette mesure ne portent pas de date'),
  '58 au total, 31 datées : les 27 autres sont nommées, pas fondues dans la médiane');
const tout=await carte({recentes:[],delaiMedianMin:52,delaiN:58,installeesDatees:58});
ok(!/ne porte.? pas de date/.test(tout.txt),'et quand tout est daté, la phrase disparaît');
const vide=await carte(null);
ok(/Détail par jour indisponible/.test(vide.txt),
  'si le serveur ne répond pas, on le DIT — on n’affiche pas trente jours à zéro');

console.log('\nE — le jour est celui de Saint-Barthélemy, pas celui du serveur');
const src=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');
ok(/America\/St_Barthelemy/.test(src),'le fuseau de l’île est nommé dans la fonction');
const soir=new Date('2026-09-19T02:00:00Z');   // 22 h le 18 à Saint-Barth
const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/St_Barthelemy'}).format(soir);
ok(local==='2026-09-18'&&soir.toISOString().slice(0,10)==='2026-09-19',
  'une soirée de l’île tombe la veille en UTC ('+local+' contre '+soir.toISOString().slice(0,10)+') : découper en UTC mettrait chaque soirée dans le lendemain');
ok(/dpatch\[ev \+ 'At'\] = FieldValue\.serverTimestamp\(\)/.test(src),
  'chaque étape est datée une fois pour toutes, au lieu d’un `updatedAt` réécrit');
ok(/funnelDays_/.test(src)&&!/installFunnel_.*jours/.test(src),
  'les journées vivent dans un document PAR JOUR : une carte de jours dans le document des totaux finirait au plafond du mébioctet');
ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)/.test(src.slice(src.indexOf('exports.funnelDetail'),src.indexOf('exports.funnelDetail')+600)),
  'et le détail est réservé à l’administrateur — le document des totaux, lui, est public depuis toujours');


// LE CAS SIGNALÉ LE 19/09/2026 : la carte affichait « Visiteurs 0 · Guide ouvert 0 ·
// Installées 0 » au-dessus de sa propre frise, qui disait 24 visiteurs et 2 installées,
// et nommait les deux installations du jour avec l'heure. Ce rendu-là prend le compteur
// et le recomptage SÉPARÉMENT, pour les faire diverger exprès.
async function carteB(compteur,detail,detailCharge){
  return p.evaluate(([J,C,D,L])=>{const S=window.__S; document.body.classList.add('standalone');
    S.adminFunnel=C; S.adminFunnelLoaded=true;
    S.adminFunnelDetail=D?Object.assign({jours:J},D):null;
    S.adminFunnelDetailLoaded=!!L;
    S.persona='admin';S.onboarded=true;S.authView=null;S.showPitch=false;S.legalView=null;
    S.admin={view:'home',sel:null}; window.__render();
    const c=[...document.querySelectorAll('.card')].filter(x=>/Entonnoir d'installation/.test(x.textContent||''));
    const t=c[c.length-1]; if(t&&!t.classList.contains('open')){const h=t.querySelector('.fold-head,button');if(h)h.click();}
    const carte=[...document.querySelectorAll('.card')].filter(x=>/Entonnoir d'installation/.test(x.textContent||'')).pop();
    return true;
  },[JOURS,compteur,detail,detailCharge])
  // LES NOMBRES SONT ANIMÉS (ils montent de 0 à leur valeur en 620 ms) : lire le texte
  // trop tôt, c'est mesurer le milieu de l'animation et non ce que la carte annonce.
  .then(()=>p.waitForTimeout(800))
  .then(()=>p.evaluate(()=>{const c=[...document.querySelectorAll('.card')]
      .filter(x=>/Entonnoir d'installation/.test(x.textContent||'')).pop();
    return {txt:c.innerText.replace(/\s+/g,' ')};}));
}

console.log('\nF — le haut de la carte ne contredit plus sa propre frise');
{
  // Le compteur cumulé à ZÉRO, les appareils recomptés à 24 et 2 : exactement la capture.
  const zero={};
  const vrai={recentes:[],delaiMedianMin:0,delaiN:2,installeesDatees:2,
    totaux:{visit:24,guide:3,installed:2,ios:1,android:0,desktop:1}};
  const g=await carteB(zero,vrai,true);
  const haut=g.txt.slice(0,g.txt.indexOf('7 derniers jours'));
  ok(/Visiteurs 24/.test(haut)&&/Installées 2\b/.test(haut),
    'les totaux viennent des APPAREILS recomptés (24 · 2), pas du compteur resté à zéro');
  ok(!/Visiteurs 0 /.test(haut),'plus de « Visiteurs 0 » au-dessus d’une frise qui montre 24 visiteurs');
  ok(/iPhone 1 · Android 0 · Ordinateur 1/.test(g.txt),'et la ventilation par appareil suit la même source');

  // Un compteur qui a dérivé : on montre le bon chiffre ET on nomme l’autre.
  const d=await carteB({u_visit_total:9,u_guide_total:2,u_installed_total:1},vrai,true);
  ok(/le compteur cumulé, lui, en annonce 1/i.test(d.txt),
    'un compteur qui s’écarte est NOMMÉ : c’est ce désaccord, invisible, qui a produit la carte à zéro');

  // Tant qu’on n’a rien lu, on n’écrit pas un zéro.
  const att=await carteB(zero,null,false);
  const hautA=att.txt.slice(0,att.txt.indexOf('7 derniers jours')>0?att.txt.indexOf('7 derniers jours'):att.txt.length);
  ok(/Visiteurs …/.test(hautA)&&/Installées …/.test(hautA),
    'pendant le chargement, « … » et non trois zéros — un parc vide, ça se lit');
  // Le sous-titre de l'en-tête contient déjà le mot « installées » : c'est la PASTILLE
  // chiffrée qu'on cherche, pas le mot.
  ok(!/\d+ installées/.test((await p.evaluate(()=>{const c=[...document.querySelectorAll('.card')]
      .filter(x=>/Entonnoir d'installation/.test(x.textContent||'')).pop();
    const h=c.querySelector('.fold-head,button');return h?h.innerText:'';}))),
    'et l’en-tête n’annonce aucun nombre tant qu’il n’est pas lu');

  // Le recomptage a échoué côté serveur : on le dit, on ne fait pas passer le compteur
  // pour la vérité.
  const sans=await carteB({u_visit_total:9,u_guide_total:2,u_installed_total:1},
    {recentes:[],delaiMedianMin:0,delaiN:1,installeesDatees:1,totaux:null},true);
  ok(/Appareils non recomptés/.test(sans.txt)&&/Visiteurs 9/.test(sans.txt),
    'si le recomptage n’aboutit pas, le compteur sert de repli — et la carte le DIT');
}

/* UN NOUVEL APPAREIL QUI INSTALLE, C'EST UNE INSTALLATION — RIEN D'AUTRE À DIRE.
   La ligne portait « · déjà installée à sa découverte », qui décrit une limite de NOTRE
   mesure et non ce qu'a fait la personne. « On dit juste Android ou iPhone. » Le piège,
   en retirant l'étiquette, est de laisser revenir le délai : ces appareils portent un
   `min` de 0, et « 0 min après sa visite » est exactement la phrase corrigée le 23/09. */
console.log('\nH — une installation se nomme par sa plateforme, et rien de plus');
const nu=await carte({delaiMedianMin:23,delaiN:1,installeesDatees:9,dejaInstallees:8,
  recentes:[{at:Date.parse('2026-09-23T21:25:00Z'),pf:'ios',min:0,dejaInstallee:true},
            {at:Date.parse('2026-09-23T14:34:00Z'),pf:'android',min:23,dejaInstallee:false},
            {at:Date.parse('2026-09-22T17:52:00Z'),pf:'android',min:0,dejaInstallee:true}]});
ok(!/déjà installée à sa découverte/.test(nu.txt),
  'la ligne ne raconte plus la limite de la mesure');
ok(!/0 min après sa visite/.test(nu.txt),
  'et le délai ne revient pas par la porte de derrière : jamais « 0 min après sa visite »');
ok(/23 min après sa visite/.test(nu.txt),
  'un appareil vu d’abord dans un navigateur garde son délai, lui (23 min)');
// Ce qui reste dit, c'est COMBIEN d'appareils ne peuvent pas porter de délai : sans
// cette phrase, « médiane sur 1 appareil » se lirait comme une mesure cassée.
ok(/8 appareils découverts déjà installés/.test(nu.txt)&&/médiane sur 1 appareil/.test(nu.txt),
  'et la médiane dit toujours sur combien elle porte, et combien d’appareils n’en portent pas');

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
