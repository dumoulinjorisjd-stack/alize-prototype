/* MAQUETTE v2 — RÉCURRENCE (l'éditeur, 25/11/2026).
 * « Le pro accepte dès le début la récurrence, il doit honorer cette récurrence sauf
 * s'il met explicitement qu'il ne peut pas passer cette fois ; le client peut cliquer
 * sur proposer à quelqu'un d'autre pour ce passage. Il faut aussi un bouton supprimer.
 * Chaque jour c'est 7/7, mais ça pose la question de deux passages par semaine. »
 * → sous « Semaine », on coche ses jours : un, deux… ou les sept.
 * Aucun code de l'app n'est modifié : on part des vrais écrans de la v940.
 *   RACINE=/home/user/alize-prototype node outils/maquette/recurrence-v2.js */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
const seg = (t, on) => `<button class="seg${on ? ' on' : ''}">${t}</button>`;
const jours = (on) => `<div class="field maq-freq"><label>Les jours</label><div class="row" style="gap:4px">${['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((j, i) =>
  `<button class="seg${on.indexOf(i) >= 0 ? ' on' : ''}" style="flex:1 1 0;min-width:0;height:44px;padding:0">${j}</button>`).join('')}</div></div>`;

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 390, height: 2400 }, deviceScaleFactor: 2, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  await p.clock.install({ time: new Date('2026-11-25T14:00:00Z') });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  const base = (persona) => p.evaluate((persona) => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = persona; S.mission = null; S.draft = null;
    S.account = { name: persona === 'pro' ? 'Karla' : 'Laure', email: 'x@e.fr', uid: persona === 'pro' ? 'u0' : 'c1', role: persona };
  }, persona);
  const tirer = async (sel, nom) => { const h = await p.evaluateHandle((sel) => { const e = document.querySelector(sel); return e.closest('.card') || e; }, sel); await h.asElement().screenshot({ path: path.join(SORTIE, nom + '.png') }); };

  // 25 — la commande : Semaine, mercredi et samedi
  await base('client');
  await p.evaluate(({ bloc }) => {
    const S = window.__S; S.draft = window.__newMission(window.__svc.trouve('menage')); S.draft.dateISO = '2026-12-02'; S.draft.dateMode = 'pick';
    S.clientNav = 'home'; window.__render();
    const jour = document.querySelector('[data-cfday]').closest('.field');
    jour.insertAdjacentHTML('beforebegin', bloc);
    const lab = jour.querySelector('label'); if (lab) lab.textContent = 'Premier passage';
    const carte = jour.closest('.card') || jour.parentElement;
    [...carte.querySelectorAll('.field')].pop().insertAdjacentHTML('afterend', '<p class="mini" style="margin:10px 0 0;color:var(--ink-soft);font-weight:600">Chaque mercredi et samedi, à partir du 2 déc. Pause à tout moment dans Réservations.</p>');
  }, { bloc: `<div class="field maq-freq"><label>Fréquence</label><div class="segs">${seg('Ponctuelle')}${seg('Récurrente', 1)}</div></div><div class="field maq-freq"><label>Chaque</label><div class="segs">${seg('Jour')}${seg('Semaine', 1)}${seg('Mois')}</div></div>${jours([2, 5])}` });
  await tirer('.maq-freq', '25-recurrence-jours');

  // 26 — la demande vue par le prestataire : il s'engage sur chaque passage
  await base('pro');
  await p.evaluate(() => {
    const S = window.__S; const m = window.__newMission(window.__svc.trouve('menage'));
    Object.assign(m, { status: 'pending', reqId: 'r1', dateISO: '2026-12-02', when: '', slot: '08:00', slotFlex: 0, zone: 'Cul-de-Sac · Toiny', frequency: 'hebdo', clientName: 'Laure', duration: 4, rate: 28 });
    S.proStatus = 'valide'; S.mission = m; S.proNav = 'home'; window.__render();
    const ban = [...document.querySelectorAll('.banner')].find((x) => /Prestation récurrente/.test(x.textContent));
    if (ban) ban.querySelector('span').innerHTML = '<b>Récurrente · chaque mercredi et samedi</b>, à partir du 2 déc. En acceptant, vous vous engagez sur chaque passage.';
    window.scrollTo(0, 0);
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({ path: path.join(SORTIE, '26-recurrence-pro-demande.png') });
  await p.setViewportSize({ width: 390, height: 2400 });

  // 27 — la mission acceptée côté prestataire : les prochains passages, « je ne peux pas »
  await base('pro');
  await p.evaluate(() => {
    const S = window.__S; const m = window.__newMission(window.__svc.trouve('menage'));
    S.proStatus = 'valide'; Object.assign(m, { status: 'accepted', reqId: 'r1', dateISO: '2026-12-02', when: '', slot: '08:00', slotFlex: 0, zone: 'Cul-de-Sac · Toiny', frequency: 'hebdo', clientName: 'Laure', duration: 4, rate: 28 });
    S.mission = m; window.__render();
    const v = document.getElementById('view'); const pad = v.querySelector('.pad') || v;
    const t = pad.querySelector('.h-hello');
    const l = (d, x) => `<div class="row between" style="min-height:44px;border-top:1px solid var(--hair);align-items:center"><span class="mini" style="color:var(--ink)">${d}</span>${x}</div>`;
    t.insertAdjacentHTML('afterend', `<div class="card maq-pass" style="padding:14px;margin-top:12px"><div class="row between"><span class="eyebrow" style="color:var(--teal-deep)">↻ Chaque mercredi et samedi</span></div>
      <div style="margin-top:8px">${l('mer. 2 déc. · 08:00', '<span class="chip good">Prochain</span>')}${l('sam. 5 déc. · 08:00', '<button class="linklike mini" style="color:var(--coral-deep);font-weight:700">Je ne peux pas cette fois</button>')}${l('mer. 9 déc. · 08:00', '<button class="linklike mini" style="color:var(--coral-deep);font-weight:700">Je ne peux pas cette fois</button>')}</div></div>`);
  });
  await tirer('.maq-pass', '27-recurrence-pro-passages');

  // 28 — le client : un passage décliné, « proposer à quelqu'un d'autre », pause et supprimer
  await base('client');
  await p.evaluate(() => {
    const S = window.__S; S.clientNav = 'wallet'; window.__render();
    const v = document.getElementById('view'); const pad = v.querySelector('.pad') || v;
    let tete = pad.querySelector('.h-hello'); while (tete.parentElement && tete.parentElement !== pad) tete = tete.parentElement;
    tete.insertAdjacentHTML('afterend', `<div class="maq-recur" style="margin-top:16px"><div class="eyebrow" style="color:var(--teal-deep)">↻ Récurrentes · 1</div>
      <div class="card" style="padding:14px;margin-top:9px;border-left:4px solid var(--teal-deep)">
        <div class="row between"><b style="font-size:14px">Ménage</b><span class="chip good">Mer. et sam.</span></div>
        <div class="mini" style="margin-top:3px">08:00 · Karla Barbosa</div>
        <div class="mini" style="margin-top:6px;color:var(--ink-soft)">Prochain passage : mer. 2 déc.</div>
        <div class="banner warn" style="margin-top:10px">⚠<span><b>Karla ne peut pas venir sam. 5 déc.</b></span></div>
        <button class="btn primary sm" style="margin-top:8px">Proposer à quelqu’un d’autre</button>
        <div class="row between" style="margin-top:12px;align-items:center"><button class="btn ghost sm" style="width:auto;padding:9px 15px">Mettre en pause</button><button class="linklike" style="color:var(--coral-deep);font-weight:700;min-height:44px">Supprimer</button></div>
      </div></div>`);
  });
  await tirer('.maq-recur .card', '28-recurrence-client-passage');
  await b.close();
  console.log('Maquettes dans ' + SORTIE);
})().catch((e) => { console.error(e); process.exit(1); });
