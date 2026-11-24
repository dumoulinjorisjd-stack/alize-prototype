/* MAQUETTE — « DECK & TERRASSE AU M² » (l'éditeur, 23/11/2026).
 *
 * « Tu as été trop vite, tu proposes quoi ? » puis « je dois pouvoir choisir tout ça
 * depuis la console ». Aujourd'hui la cliente choisit une DURÉE (40 €/h) puis AJOUTE la
 * monobrosse au m² : elle paie le temps et la surface, et devine combien d'heures il faut.
 * Proposé : le métier se vend au m². Elle choisit sa prestation, TAPE sa surface, lit le
 * total ; le temps réservé chez le prestataire se calcule (minutes par m², réglées dans
 * la console). Aucun code de l'app n'est modifié : on part du vrai écran « à l'acte ».
 *
 *   RACINE=/home/user/alize-prototype node outils/maquette/deck-au-m2.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

async function ouvrir(b, auM2) {
  const p = await b.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(500);
  await p.evaluate((auM2) => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.mission = null;
    S.account = { name: 'Cécile Martinez', email: 'c@e.fr', uid: 'c1', role: 'client' };
    if (auM2) {
      S.adminCatalog = Object.assign({}, S.adminCatalog, { deck: [
        { id: 'dk1', nm: 'Nettoyage monobrosse (matériel de la villa)', price: 5, grp: '' },
        { id: 'dk2', nm: 'Nettoyage monobrosse (matériel du prestataire)', price: 10, grp: '' }] });
      S.draft = window.__newMission(window.__svc.trouve('deck')); S.clientNav = 'home';
      S.draft.acts = [{ id: 'dk1', nm: 'Nettoyage monobrosse (matériel de la villa)', price: 5, qty: 45 }];
    } else {
      // EN PRODUCTION la grille livrée (tranches de surface) a été vidée : le métier est
      // redevenu horaire. On la vide ici aussi, sinon l'« avant » ne serait pas le vôtre.
      S.adminCatalog = Object.assign({}, S.adminCatalog, { deck: [] });
      S.adminPrices = Object.assign({}, S.adminPrices, { deck: 40 });
      S.adminOptions = Object.assign({}, S.adminOptions, { deck: [{ id: 'o1', nm: 'Monobrosse (matériel de la villa) /m2', price: 5, unit: 'u' }, { id: 'o2', nm: 'Monobrosse (matériel du prestataire) /m2', price: 10, unit: 'u' }] });
      S.draft = window.__newMission(window.__svc.trouve('deck')); S.clientNav = 'home';
      S.draft.options = [{ id: 'o1', nm: 'Monobrosse (matériel de la villa) /m2', price: 5, unit: 'u', qty: 1 }];
    }
    window.__render(); window.scrollTo(0, 0);
  }, auM2);
  await p.waitForTimeout(300);
  return p;
}
async function tirer(p, nom) {
  const h = await p.evaluateHandle(() => { const f = document.querySelector('[data-actpick], [data-optpick]'); return f ? (f.closest('.card') || f.closest('.field')) : null; });
  const r = await h.asElement().boundingBox();
  await p.screenshot({ path: path.join(SORTIE, nom + '.png'), clip: { x: 0, y: Math.max(0, r.y - 60), width: 390, height: Math.min(r.height + 90, 1350) } });
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  let p = await ouvrir(b, false);
  await tirer(p, '5-avant-deck-a-l-heure'); await p.close();
  p = await ouvrir(b, true);
  await p.evaluate(() => {
    const v = document.getElementById('view');
    // Le prix se lit au m².
    v.querySelectorAll('[data-actpick] .actpr').forEach((e) => { e.innerHTML = e.textContent.trim().replace('€', '€/m²'); });
    // La surface se TAPE : le compteur 1 par 1 devient un champ chiffré.
    const ligne = v.querySelector('[data-actpick="dk1"]').closest('.actrow');
    const q = ligne.querySelector('.actqty');
    if (q) q.outerHTML = '';
    ligne.style.flexWrap = 'wrap';
    ligne.insertAdjacentHTML('beforeend', `<div class="row" style="flex:1 0 100%;gap:8px;align-items:center;padding:4px 12px 10px">
      <span class="mini" style="color:var(--muted)">Surface</span>
      <input class="txt money" value="45" inputmode="numeric" style="width:84px;padding:8px 10px;text-align:right;font-size:15px"><b class="mini">m²</b>
      <span class="mini" style="margin-left:auto;color:var(--ink-soft)">225,00&nbsp;€</span></div>`);
    // Sous la liste : ce que le prestataire réserve.
    const liste = ligne.parentNode;
    liste.insertAdjacentHTML('afterend', `<p class="mini" style="margin-top:8px;color:var(--muted)">Durée estimée&nbsp;: <b>1&nbsp;h&nbsp;30</b> pour 45&nbsp;m² (le prestataire réserve ce temps).</p>`);
    // L'estimation dit la surface.
    v.querySelectorAll('.est .line span').forEach((s) => { if (/monobrosse/i.test(s.textContent)) s.textContent = 'Nettoyage monobrosse (matériel de la villa) · 45 m²'; });
  });
  await tirer(p, '6-apres-deck-au-m2'); await p.close();
  await b.close();
  console.log('Maquettes dans ' + SORTIE);
})().catch((e) => { console.error(e); process.exit(1); });
