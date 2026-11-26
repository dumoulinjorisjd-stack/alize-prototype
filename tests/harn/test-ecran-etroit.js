/* L'IPHONE À 320 POINTS (zoom de l'écran « Texte plus grand », vu sur l'iPhone de
   l'éditeur le 26/11/2026). Quatre défauts relevés pendant les essais :
   A. cartes repliables (profil client, compte prestataire) : la pastille coupait le titre
      (« Mes informati… ») — sous 360 points elle passe sous le texte ;
   B. « Statut fidélité » : les pastilles sortaient de la carte et de l'écran ;
   C. carte « Bon retour » de l'accueil : l'e-mail coupé au milieu (« demo.artisan@ti- ») ;
   D. pied de page : un « · » orphelin en bout de ligne (« CGU · CGV · »).
   Mesuré à 320, 375, 393 et 430 points, en FR, EN et PT, sur ce que le navigateur REND
   (rectangles, lignes de texte), pas sur la source.
   E. contrôle : à 393 points, la pastille d'une carte repliable reste à droite du titre
      (rien n'a bougé au-dessus de 360). */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const ECRANS = {
  accueil: "S.onboarded=false;S.guest=false;S.persona='client';S.showPitch=false;S.authView=null;S.account={name:'APPLE',email:'demo.artisan@ti-services.fr'};",
  profil: "S.onboarded=true;S.persona='client';S.account={name:'Apple TEST',email:'a@t.fr',uid:'c1'};S.addresses=[];S.clientNav='profile';S.tab='profile';S.clientTab='profile';",
  pro: "S.onboarded=true;S.persona='pro';S.proStatus='valide';S.proNav='account';S.account={name:'APPLE',email:'p@t.fr',uid:'p1',role:'pro'};S.proPhone='0690 12 34 56';S.proFounder=true;",
};
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const defauts = []; let tetes393 = null, errs = [];
  for (const w of [320, 375, 393, 430]) for (const lang of ['fr', 'en', 'pt']) for (const ec of Object.keys(ECRANS)) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: 'block' }); const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
    await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render);
    await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
    const r = await p.evaluate(({ lang, etat }) => {
      document.body.classList.add('standalone'); try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
      const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
      const S = window.__S; S.lang = lang; S.demoMode = false; (new Function('S', etat))(S); window.__render();
      const d = []; const vw = document.documentElement.clientWidth;
      const lignes = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter((x) => x.width > 0); const t = [...new Set(rs.map((x) => Math.round(x.top)))]; return t.length; };
      // A — cartes repliables
      document.querySelectorAll('.fold-head').forEach((h) => {
        const card = h.closest('.card').getBoundingClientRect(); const bt = h.querySelector('.fh-main b'); const col = bt.parentElement.getBoundingClientRect();
        const rg = document.createRange(); rg.selectNodeContents(bt); const droite = Math.max(...[...rg.getClientRects()].map((x) => x.right));
        if (droite > col.right + 1) d.push('A titre coupé : ' + bt.textContent.trim());
        h.querySelectorAll('.chip').forEach((c) => { if (c.getBoundingClientRect().right > card.right + 1) d.push('A pastille hors carte : ' + c.textContent.trim()); });
        const ch = h.querySelector('.fold-chev').getBoundingClientRect(); if (!(ch.width > 0 && ch.right <= card.right + 1)) d.push('A chevron absent : ' + bt.textContent.trim());
      });
      // B — statut fidélité
      document.querySelectorAll('[data-act="open-fidelity"]').forEach((c) => { const card = c.getBoundingClientRect(); c.querySelectorAll('.chip').forEach((x) => { if (x.getBoundingClientRect().right > card.right + 1) d.push('B pastille hors carte : ' + x.textContent.trim()); }); });
      // C — e-mail de la carte « Bon retour » : coupé seulement devant le @, jamais au milieu d'un mot
      const br = document.querySelector('.bonretour .mini');
      if (br) { const rg = document.createRange(); rg.selectNodeContents(br); const rs = [...rg.getClientRects()].filter((x) => x.width > 0);
        const nb = new Set(rs.map((x) => Math.round(x.top))).size;
        // Chaque morceau (« demo.artisan », « @ti-services.fr ») tient sur une ligne : la seule
        // coupure possible tombe juste avant le @.
        const morceaux = [...br.querySelectorAll('.em')];
        if (!morceaux.length) d.push('C e-mail sans découpe au @');
        morceaux.forEach((m) => { if (lignes(m) > 1) d.push('C e-mail coupé au milieu : ' + m.textContent); });
        if (nb > 1 && morceaux.length === 2 && !(morceaux[1].getBoundingClientRect().top > morceaux[0].getBoundingClientRect().top + 2)) d.push('C coupure ailleurs qu au @');
        if (br.closest('.card').scrollWidth > br.closest('.card').clientWidth + 1) d.push('C carte Bon retour déborde'); }
      // D — pied de page : aucune ligne ne finit par un séparateur ; les liens restent dans l'écran
      document.querySelectorAll('.legal-links').forEach((ll) => {
        if (/·/.test(ll.textContent)) d.push('D séparateur « · » dans les liens');
        ll.querySelectorAll('button').forEach((bt) => { const r = bt.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1) d.push('D lien hors écran : ' + bt.textContent); if (lignes(bt) > 1) d.push('D lien coupé : ' + bt.textContent); });
      });
      if (document.documentElement.scrollWidth > vw + 1) d.push('page plus large que l\'écran');
      return { d, tetes: [...document.querySelectorAll('.fold-head')].filter((h) => h.querySelector('.chip')).map((h) => { const col = h.querySelector('.fh-main b').parentElement.getBoundingClientRect(); const c = h.querySelector('.chip').getBoundingClientRect(); return c.left >= col.right - 1 && c.top < col.bottom; }), nbFold: document.querySelectorAll('.fold-head').length, legal: document.querySelectorAll('.legal-links').length, bon: !!br, fid: document.querySelectorAll('[data-act="open-fidelity"]').length };
    }, { lang, etat: ECRANS[ec] });
    r.d.forEach((x) => defauts.push(w + ' ' + lang + ' ' + ec + ' — ' + x));
    if (w === 320 && lang === 'fr') console.log('  (' + ec + ' : ' + r.nbFold + ' cartes repliables, ' + r.legal + ' pied de page, carte Bon retour ' + (r.bon ? 'oui' : 'non') + ', fidélité ' + r.fid + ')');
    if (w === 393 && lang === 'fr' && ec === 'profil') tetes393 = r.tetes;
    await ctx.close();
  }
  console.log('A à D — 320, 375, 393, 430 points × FR, EN, PT');
  ok(!defauts.length, 'aucun titre coupé, aucune pastille hors carte, chevron présent, e-mail coupé seulement au @, pied de page sans séparateur orphelin' + (defauts.length ? '\n      ' + defauts.join('\n      ') : ''));
  console.log('E — contrôle : rien ne bouge au-dessus de 360 points');
  ok(tetes393 && tetes393.length && tetes393.every(Boolean), 'à 393 points, la pastille reste à droite du titre, comme avant (' + (tetes393 || []).length + ' cartes à pastille)');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
