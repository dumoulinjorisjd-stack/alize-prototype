/* SIX DOCUMENTS, TROIS LANGUES, UNE SEULE VÉRITÉ.
   Les CGU et la politique de confidentialité vivent dans six constantes séparées —
   une par langue et par document. Rien, dans le code, n'oblige à les modifier
   ensemble : on peut compléter le français et laisser l'anglais d'hier, sans qu'aucun
   écran ne le signale. Un client anglophone lirait alors des engagements différents
   de ceux du client français, ce qui est un problème contractuel, pas un défaut
   d'affichage.

   Ce test compare les trois langues article par article et vérifie que les clauses
   qui portent un engagement sont présentes partout. */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');
const RACINE='/home/user/alize-work';
const o={headless:true}; if(fs.existsSync('/opt/pw-browsers/chromium'))o.executablePath='/opt/pw-browsers/chromium';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};

// Ce que chaque version doit contenir, quelle que soit la langue.
const ENGAGEMENTS={
  cgu:[
    ['âge minimum',        {fr:/personnes majeures/i,      en:/restricted to <b>adults<\/b>|adults/i, pt:/maiores de idade/i}],
    ['coordonnées d’une mission', {fr:/détourner de leur finalité/i, en:/misuse the details/i,      pt:/desviar da sua finalidade/i}],
    ['licence non sous-licenciable', {fr:/non sous-licenciable/i,  en:/non-sublicensable/i,         pt:/não sublicenciável/i}],
    ['profil affiché aux clients',   {fr:/affichées aux Clients/i, en:/shown to Clients/i,          pt:/exibidas aos Clientes/i}],
    ['adresse de signalement',       {fr:/signalement@ti-services\.fr/, en:/signalement@ti-services\.fr/, pt:/signalement@ti-services\.fr/}],
    ['sommes acquises préservées',   {fr:/ne prive l'Intervenant d'aucune somme acquise/i, en:/does not deprive a Provider of any sum earned/i, pt:/não priva o Prestador de qualquer montante adquirido/i}],
    ['préavis de trente jours',      {fr:/préavis de trente jours/i, en:/thirty days' notice/i,     pt:/pré-aviso de trinta dias/i}],
  ],
  confidentialite:[
    ['sous-traitant courrier', {fr:/Infomaniak/, en:/Infomaniak/, pt:/Infomaniak/}],
    ['sous-traitant Apple',    {fr:/Apple Inc\./, en:/Apple Inc\./, pt:/Apple Inc\./}],
    ['violation sous 72 h',    {fr:/soixante-douze heures/i, en:/seventy-two hours/i, pt:/setenta e duas horas/i}],
    ['retrait du consentement',{fr:/Retrait du consentement/i, en:/Withdrawal of consent/i, pt:/Retirada do consentimento/i}],
    ['décisions automatisées', {fr:/aucune décision entièrement automatisée/i, en:/no solely automated decision/i, pt:/qualquer decisão exclusivamente automatizada/i}],
    ['droit post-mortem',      {fr:/post-mortem/i, en:/Post-mortem/i, pt:/post mortem/i}],
    ['adresse de la CNIL',     {fr:/Fontenoy/, en:/Fontenoy/, pt:/Fontenoy/}],
    ['délai d’un mois',        {fr:/délai d'<b>un mois<\/b>|un mois/i, en:/within <b>one month<\/b>|one month/i, pt:/prazo de <b>um mês<\/b>|um mês/i}],
    ['journaux 12 mois',       {fr:/douze mois/i, en:/twelve months/i, pt:/doze meses/i}],
  ],
};

(async()=>{
  const b=await chromium.launch(o);
  const p=await (await b.newContext({locale:'fr-FR',viewport:{width:428,height:1400}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/*',r=>/gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url())?r.abort():r.continue());
  await p.goto('file://'+path.join(RACINE,'tests','harn','app.html'),{waitUntil:'load'});
  await p.waitForTimeout(1300);

  const lire=(lang,doc)=>p.evaluate((e)=>{
    const S=window.__S; document.body.classList.add('standalone');
    S.onboarded=true;S.guest=false;S.demoMode=false;S.persona='client';S.mission=null;S.detail=null;
    S.lang=e.lang;S.legalView=e.doc;
    window.__render();
    const racine=document.querySelector('.phone')||document.body;
    return {titres:[...racine.querySelectorAll('h3')].map(x=>x.textContent.trim()),
            html:racine.innerHTML};
  },{lang,doc});

  for(const doc of ['cgu','confidentialite']){
    console.log('\n'+(doc==='cgu'?'CGU':'POLITIQUE DE CONFIDENTIALITÉ')+' — les trois langues doivent coïncider');
    const v={};
    for(const lang of ['fr','en','pt']) v[lang]=await lire(lang,doc);

    const n=v.fr.titres.length;
    ok(n>0,'le document français porte '+n+' articles');
    ok(v.en.titres.length===n,'l’anglais en porte autant ('+v.en.titres.length+')');
    ok(v.pt.titres.length===n,'le portugais en porte autant ('+v.pt.titres.length+')');

    // La numérotation doit courir de 1 à N, sans trou ni doublon, dans chaque langue.
    for(const lang of ['fr','en','pt']){
      const nums=v[lang].titres.map(t=>parseInt((t.match(/^(\d+)\./)||[0,0])[1],10));
      const attendu=nums.map((_,i)=>i+1);
      ok(JSON.stringify(nums)===JSON.stringify(attendu),
        'numérotation continue en '+lang.toUpperCase()+' (1 à '+n+')');
    }

    for(const [nom,motifs] of ENGAGEMENTS[doc]){
      const manquants=['fr','en','pt'].filter(l=>!motifs[l].test(v[l].html));
      ok(manquants.length===0, nom+(manquants.length?' — manque en '+manquants.join(', ').toUpperCase():' — présent dans les trois langues'));
    }
  }

  console.log('\nCOHÉRENCE — ce que les documents promettent doit exister ailleurs');
  const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
  ok(/signalement@ti-services\.fr/.test(src),'l’adresse de signalement est bien celle citée partout');
  ok(/mail\.infomaniak\.com/.test(fs.readFileSync(path.join(RACINE,'functions','index.js'),'utf8')),
    'Infomaniak est déclaré parce qu’il est réellement utilisé pour le courrier');
  ok(!/anthropic|openai/i.test(fs.readFileSync(path.join(RACINE,'functions','index.js'),'utf8')),
    'aucun fournisseur d’IA côté serveur — rien à déclarer de ce côté');

  ok(errs.length===0,'aucune erreur JS ('+errs.join(' | ')+')');
  await b.close();
  console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT EST VERT');
  process.exit(f?1:0);
})().catch(function(e){console.error(e);process.exit(1);});
