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
ok(/^2026-08-21 — 3 visiteurs, 0 installée$/.test(r.infobulle.trim()),
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

await b.close();
console.log(f?('\n'+f+' ÉCHEC(S)\n'):'\nTout est vert.\n');
process.exit(f?1:0);
})();
