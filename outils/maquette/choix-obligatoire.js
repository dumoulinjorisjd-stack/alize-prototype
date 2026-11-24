/* MAQUETTE — « UNE PRESTATION, UN CHOIX OBLIGATOIRE » (l'éditeur, 24/11/2026).
 *
 * « Quand on choisit un type de prestation on doit obligatoirement choisir une option :
 * équipement de la villa ou du prestataire, sans risquer un doublon ou un oubli. »
 * Aujourd'hui les deux monobrosses sont deux prestations : la cliente peut cocher les
 * deux (750 € pour 50 m²) ou se tromper. Proposé : UNE prestation « Nettoyage
 * monobrosse », et sous elle un choix obligatoire « Matériel », chaque choix portant son
 * prix. Aucun code de l'app n'est modifié : on part du vrai écran de la v933.
 *
 *   RACINE=/home/user/alize-prototype node outils/maquette/choix-obligatoire.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

async function ouvrir(b, actes, choix) {
  const p = await b.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(500);
  await p.evaluate(({ actes, choix }) => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.mission = null;
    S.account = { name: 'Cécile', email: 'c@e.fr', uid: 'c1', role: 'client' };
    S.adminCatalog = Object.assign({}, S.adminCatalog, { deck: actes }); S.adminOptions = {};
    S.draft = window.__newMission(window.__svc.trouve('deck')); S.clientNav = 'home'; S.draft.acts = choix;
    window.__render(); window.scrollTo(0, 0);
  }, { actes, choix });
  await p.waitForTimeout(300);
  return p;
}
async function tirer(p, nom) {
  const h = await p.evaluateHandle(() => document.querySelector('[data-actpick]').closest('.card'));
  await h.asElement().screenshot({ path: path.join(SORTIE, nom + '.png') });
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  // AVANT : la v933 en ligne, deux prestations, toutes deux cochées.
  let p = await ouvrir(b, [
    { id: 'dk1', nm: 'Monobrosse (matériel de la villa)', price: 5, grp: '', u: 'm2', dm2: 2 },
    { id: 'dk2', nm: 'Monobrosse (matériel du prestataire)', price: 10, grp: '', u: 'm2', dm2: 2 }],
    [{ id: 'dk1', nm: 'Monobrosse (matériel de la villa)', price: 5, qty: 50, u: 'm2' }, { id: 'dk2', nm: 'Monobrosse (matériel du prestataire)', price: 10, qty: 50, u: 'm2' }]);
  await tirer(p, '7-avant-doublon'); await p.close();
  // APRÈS : une prestation, un choix obligatoire.
  const apres = async (choisi, nom) => {
    const q = await ouvrir(b, [{ id: 'dk', nm: 'Nettoyage monobrosse', price: 5, grp: '', u: 'm2', dm2: 2 }],
      [{ id: 'dk', nm: 'Nettoyage monobrosse', price: 5, qty: choisi ? 50 : 0, u: 'm2' }]);
    await q.evaluate((choisi) => {
      const v = document.getElementById('view');
      const pr = v.querySelector('[data-actpick="dk"] .actpr'); if (pr) pr.innerHTML = 'dès 5&nbsp;€/m²';
      const ligne = v.querySelector('[data-actpick="dk"]').closest('.actrow');
      const surf = ligne.querySelector('.actm2');
      const pastille = (txt, prix, on) => `<button class="btn ${on ? 'primary' : 'ghost'} sm" style="width:auto;padding:10px 12px;flex:1 1 0;flex-direction:column;gap:2px;line-height:1.2"><span style="white-space:nowrap">${txt}</span><span style="font-size:12px;font-weight:500;color:inherit;opacity:.85">${prix}</span></button>`;
      surf.insertAdjacentHTML('beforebegin', `<div style="flex:1 0 100%;padding:6px 12px 2px">
        <div class="mini" style="color:${choisi ? 'var(--muted)' : 'var(--coral-deep)'};font-weight:650">Matériel${choisi ? '' : ' · à choisir'}</div>
        <div class="row" style="gap:8px;margin-top:6px">${pastille('De la villa', '5&nbsp;€/m²', false)}${pastille('Du prestataire', '10&nbsp;€/m²', choisi)}</div></div>`);
      const tot = surf.querySelector('[data-actm2tot]'); if (tot) tot.textContent = choisi ? '500,00 €' : '';
      if (!choisi) { const inp = surf.querySelector('input'); if (inp) inp.value = ''; }
    }, choisi);
    await tirer(q, nom); await q.close();
  };
  await apres(false, '8-apres-a-choisir');
  await apres(true, '9-apres-choisi');
  await b.close();
  console.log('Maquettes dans ' + SORTIE);
})().catch((e) => { console.error(e); process.exit(1); });
