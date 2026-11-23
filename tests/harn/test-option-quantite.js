/* « SURTOUT QUE ÇA FAIT ÇA » (l'éditeur, 23/11/2026) : une option cochée avec sa
   quantité écrasait son propre nom — coupé mot à mot — et le prix chevauchait le texte.
   La ligne « Quantité − 1 × + » se pose désormais SOUS le nom, sur toute la largeur. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = { headless: true };
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const mesure = async (largeur) => {
    const p = await b.newPage({ viewport: { width: largeur, height: 1400 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
    await p.goto(INDEX, { waitUntil: 'load' }); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
      const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.mission = null;
      S.adminOptions = Object.assign({}, S.adminOptions, { deck: [{ id: 'o1', nm: 'Monobrosse (matériel de la villa) /m2', price: 5, unit: 'u' },
        { id: 'o2', nm: 'Monobrosse (matériel du prestataire) /m2', price: 10, unit: 'u' }] });
      S.draft = window.__newMission(window.__svc.trouve('deck')); S.clientNav = 'home'; S.draft.options = [{ id: 'o1', nm: 'Monobrosse (matériel de la villa) /m2', price: 5, unit: 'u', qty: 1 }];
      window.__render();
      const bt = document.querySelector('[data-optpick="o1"]'); if (!bt) return null;
      const row = bt.closest('.actrow'); const qte = row.querySelector('.optqte');
      const nm = bt.querySelector('.actnm'), px = bt.querySelector('.actpr');
      const rb = bt.getBoundingClientRect(), rr = row.getBoundingClientRect(), rq = qte ? qte.getBoundingClientRect() : null;
      const lignesNom = Math.round(nm.getBoundingClientRect().height / parseFloat(getComputedStyle(nm).lineHeight || '17'));
      const chevauche = px && (px.getBoundingClientRect().left < nm.getBoundingClientRect().right - 1);
      return { large: rb.width / rr.width, dessous: rq ? rq.top >= rb.bottom - 1 : false, lignesNom, chevauche: !!chevauche,
        deborde: Math.max(...[...row.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - rr.right)) };
    });
    await p.close();
    return { r, errs };
  };
  for (const L of [393, 1280]) {
    console.log(L === 393 ? 'A — au téléphone (393 px)' : 'B — à l’ordinateur (1280 px)');
    const { r, errs } = await mesure(L);
    ok(r && r.large > 0.95, 'cochée, l’option garde toute la largeur (' + (r && Math.round(r.large * 100)) + ' %)');
    ok(r && r.dessous, 'la quantité est SOUS le nom');
    ok(r && r.lignesNom <= 2, 'le nom tient sur deux lignes au plus (' + (r && r.lignesNom) + ')');
    ok(r && !r.chevauche, 'le prix ne chevauche pas le nom');
    ok(r && r.deborde <= 0, 'rien ne déborde (' + (r && Math.round(r.deborde)) + ' px)');
    ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 120) + ')');
  }
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
