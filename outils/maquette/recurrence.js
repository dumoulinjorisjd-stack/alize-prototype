/* MAQUETTE — « PONCTUELLE OU RÉCURRENTE » (l'éditeur, 25/11/2026).
 *
 * « Il faut faire un bouton quand on passe une commande, un peu comme quand on fait un
 * virement, avec ponctuel, récurrent, et si on choisit récurrent, on choisit une
 * fréquence, quotidien, hebdomadaire, mensuel. Quand on retourne sur notre petit panneau
 * de commande, on peut faire pause et reprendre. »
 * Aucun code de l'app n'est modifié : on part des vrais écrans de la v940.
 *
 *   RACINE=/home/user/alize-prototype node outils/maquette/recurrence.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

const seg = (txt, on) => `<button class="seg${on ? ' on' : ''}">${txt}</button>`;
function blocFrequence(recurrente, rythme) {
  return `<div class="field maq-freq"><label>Fréquence</label><div class="segs">${seg('Ponctuelle', !recurrente)}${seg('Récurrente', recurrente)}</div></div>`
    + (recurrente ? `<div class="field maq-freq"><label>Chaque</label><div class="segs">${seg('Jour', rythme === 'jour')}${seg('Semaine', rythme === 'semaine')}${seg('Mois', rythme === 'mois')}</div></div>` : '');
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 390, height: 2200 }, deviceScaleFactor: 2, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-25T14:00:00Z') });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  const base = () => p.evaluate(() => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.mission = null;
    S.account = { name: 'Laure', email: 'l@e.fr', uid: 'c1', role: 'client' };
  });
  // 1 et 2 — l'écran de commande, carte « Quand ? »
  const commande = async (recurrente, nom) => {
    await base();
    await p.evaluate(({ recurrente, bloc }) => {
      const S = window.__S; S.draft = window.__newMission(window.__svc.trouve('menage')); S.draft.dateISO = '2026-12-02'; S.draft.dateMode = 'pick'; S.draft.slot = '08:00';
      S.clientNav = 'home'; window.__render();
      const jour = document.querySelector('[data-cfday]').closest('.field');
      jour.insertAdjacentHTML('beforebegin', bloc);
      if (recurrente) {
        const lab = jour.querySelector('label'); if (lab) lab.textContent = 'Premier passage';
        const carte = jour.closest('.card') || jour.parentElement;
        const dernier = [...carte.querySelectorAll('.field')].pop();
        dernier.insertAdjacentHTML('afterend', '<p class="mini" style="margin:10px 0 0;color:var(--ink-soft);font-weight:600">Chaque mercredi, à partir du 2 déc. Pause à tout moment dans Réservations.</p>');
      }
      window.scrollTo(0, 0);
    }, { recurrente, bloc: blocFrequence(recurrente, 'semaine') });
    const h = await p.evaluateHandle(() => document.querySelector('.maq-freq').closest('.card') || document.querySelector('.maq-freq').parentElement);
    await h.asElement().screenshot({ path: path.join(SORTIE, nom + '.png') });
  };
  await commande(false, '22-recurrence-ponctuelle');
  await commande(true, '23-recurrence-hebdo');

  // 3 — le panneau Réservations : une récurrente active, une en pause
  await base();
  await p.evaluate(() => {
    const S = window.__S; S.draft = null; S.clientNav = 'wallet'; window.__render();
    const v = document.getElementById('view');
    const carte = (svc, rythme, quand, qui, etat, geste) => `<div class="card" style="padding:14px;margin-top:9px;border-left:4px solid ${etat ? 'var(--hair)' : 'var(--teal-deep)'}">
      <div class="row between"><b style="font-size:14px">${svc}</b><span class="chip ${etat ? '' : 'good'}" ${etat ? 'style="background:var(--sand-2)"' : ''}>${etat ? 'En pause' : rythme}</span></div>
      <div class="mini" style="margin-top:3px">${quand}${qui ? ' · ' + qui : ''}</div>
      <div class="mini" style="margin-top:6px;color:${etat ? 'var(--muted)' : 'var(--ink-soft)'}">${etat || 'Prochain passage : mer. 2 déc.'}</div>
      <div class="row" style="gap:8px;margin-top:11px"><button class="btn ${etat ? 'primary' : 'ghost'} sm" style="width:auto;padding:9px 15px">${geste}</button></div></div>`;
    const bloc = `<div class="maq-recur" style="margin-top:16px"><div class="eyebrow" style="color:var(--teal-deep)">↻ Récurrentes · 2</div>
      ${carte('Ménage', 'Chaque semaine', 'Le mercredi', 'Karla Barbosa', '', 'Mettre en pause')}
      ${carte('Entretien piscine', 'Chaque mois', 'Le 1er du mois à 09:00', 'Lydie Antoine', 'En pause depuis le 20 nov.', 'Reprendre')}</div>`;
    const pad = v.querySelector('.pad') || v;
    const titre = pad.querySelector('.h-hello') || pad.firstElementChild;
    // Sous l'EN-TÊTE entier (titre, partage, avatar), pas dans sa rangée.
    let tete = titre; while (tete.parentElement && tete.parentElement !== pad) tete = tete.parentElement;
    tete.insertAdjacentHTML('afterend', bloc);
    window.scrollTo(0, 0);
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: path.join(SORTIE, '24-recurrence-reservations.png') });
  await b.close();
  console.log('Maquettes dans ' + SORTIE);
})().catch((e) => { console.error(e); process.exit(1); });
