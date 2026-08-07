/* LISIBLE EN PLEIN SOLEIL, PAS SEULEMENT SUR UN ÉCRAN DE BUREAU.
   L'application se lit dehors, à Saint-Barth, sur un téléphone. Les couleurs claires du
   thème étaient jolies et sous le seuil : la ligne grise qui explique chaque carte
   tombait à 3,4:1 et les pastilles vertes « Vérifié · Assuré » à 2,85:1, quand la norme
   WCAG AA demande 4,5:1 pour du texte sous 18 px.

   Ce test mesure le contraste réellement calculé par le navigateur, thème clair ET thème
   sombre. Il échoue si quelqu'un ré-éclaircit un jeton sans mesurer. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

// Les paires réellement utilisées à l'écran : couleur de texte sur son fond.
const PAIRES=[
  ['--muted',     '--card',      'la ligne qui explique une carte, sur fond blanc'],
  ['--muted',     '--sand',      'la même sur le fond sable de la page'],
  ['--muted',     '--card-2',    'la même sur les cartes secondaires'],
  ['--ink-soft',  '--card',      'le texte courant adouci'],
  ['--ink',       '--card',      'le texte principal'],
  ['--teal-deep', '--card',      'les titres de section et les liens'],
  ['--teal-deep', '--teal-wash', 'un lien dans une pastille corail'],
  ['--good',      '--good-wash', 'les pastilles « Vérifié », « Actif », « Assurance OK »'],
  ['--good',      '--card',      'un montant en vert sur une carte'],
  ['--coral-deep','--coral-wash','les pastilles d’alerte'],
  ['--warn',      '--card',      'les avertissements'],
];
const SEUIL=4.5;

(async()=>{
  const b=await chromium.launch(o);
  const ctx=await b.newContext({locale:'fr-FR',viewport:{width:428,height:900}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1200);

  const mesurer=(theme,paires)=>p.evaluate((e)=>{
    document.documentElement.setAttribute('data-theme',e.theme);
    const cs=getComputedStyle(document.documentElement);
    const rgb=function(v){
      // Le navigateur rend les jetons en « rgb(r, g, b) » ou en hexa selon la source.
      const d=document.createElement('span');d.style.color=v;document.body.appendChild(d);
      const c=getComputedStyle(d).color;d.remove();
      const m=c.match(/(\d+),\s*(\d+),\s*(\d+)/);
      return m?[+m[1],+m[2],+m[3]]:null;
    };
    const lum=function(c){
      const f=function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);};
      return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);
    };
    return e.paires.map(function(pr){
      const a=rgb(cs.getPropertyValue(pr[0]).trim()), bb=rgb(cs.getPropertyValue(pr[1]).trim());
      if(!a||!bb)return {n:pr[0]+' / '+pr[1], r:0, lbl:pr[2], err:true};
      const la=lum(a), lb=lum(bb), lo=Math.min(la,lb), hi=Math.max(la,lb);
      return {n:pr[0]+' / '+pr[1], r:Math.round(((hi+0.05)/(lo+0.05))*100)/100, lbl:pr[2]};
    });
  },{theme,paires});

  for(const theme of ['light','dark']){
    console.log('\nTHÈME '+(theme==='light'?'CLAIR':'SOMBRE')+' — seuil WCAG AA : '+SEUIL+':1');
    for(const m of await mesurer(theme,PAIRES)){
      ok(!m.err&&m.r>=SEUIL, m.lbl+' — '+m.n+' : '+m.r+':1');
    }
  }

  // Le thème par défaut (aucun attribut) doit valoir le thème clair : c'est ce que voit
  // quelqu'un qui n'a jamais touché au réglage.
  console.log('\nPAR DÉFAUT — sans réglage, on doit être au même niveau qu’en clair');
  const parDefaut=await p.evaluate((paires)=>{
    document.documentElement.removeAttribute('data-theme');
    const cs=getComputedStyle(document.documentElement);
    return paires.map(function(pr){return cs.getPropertyValue(pr[0]).trim()+'|'+cs.getPropertyValue(pr[1]).trim();});
  },PAIRES);
  await p.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  const enClair=await p.evaluate((paires)=>{
    const cs=getComputedStyle(document.documentElement);
    return paires.map(function(pr){return cs.getPropertyValue(pr[0]).trim()+'|'+cs.getPropertyValue(pr[1]).trim();});
  },PAIRES);
  ok(parDefaut.length===enClair.length&&parDefaut.length>0,'les deux jeux de jetons sont lisibles');
  ok(parDefaut.join('§')!==''&&enClair.join('§')!=='','les jetons sont bien définis dans les deux cas');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
