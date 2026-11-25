/* PONCTUELLE OU RÉCURRENTE, À LA COMMANDE (l'éditeur, 25/11/2026). */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const SERIE = require(path.join(RACINE, 'functions', 'serie-recurrente.js'));
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2600 }, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-25T14:00:00Z') });   // mercredi 25 nov., 10:00
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  await p.evaluate(() => { document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none'; });
  const ouvrir = (svc, lang) => p.evaluate(({ svc, lang }) => {
    const S = window.__S; S.lang = lang || 'fr'; S.onboarded = true; S.persona = 'client'; S.mission = null; S.account = { name: 'L', email: 'l@e.fr', uid: 'c1', role: 'client' };
    S.draft = window.__newMission(window.__svc.trouve(svc)); window.__render(); return !!document.querySelector('[data-recur]');
  }, { svc, lang });
  const clic = (sel) => p.evaluate((sel) => { const x = document.querySelector(sel); if (x) x.click(); return !!x; }, sel);
  const etat = () => p.evaluate(() => { const S = window.__S; const sel = document.querySelector('[data-cfday]');
    return { recur: JSON.parse(JSON.stringify(S.draft.recur || null)), date: S.draft.dateISO, opts: sel ? [...sel.options].map((x) => x.value) : [],
      label: [...document.querySelectorAll('.field label')].map((l) => l.textContent).join('|'), cta: (document.querySelector('[data-cfg="confirm"]') || {}).textContent || '',
      jours: [...document.querySelectorAll('[data-recjour]')].map((x) => ({ j: +x.dataset.recjour, on: x.getAttribute('aria-pressed') === 'true', h: x.getBoundingClientRect().height })) }; });
  const jour = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();

  console.log('A — le choix');
  ok(await ouvrir('menage'), 'le ménage propose « Ponctuelle / Récurrente »');
  let e = await etat();
  ok(e.recur === null && /\|Jour\|/.test('|' + e.label + '|') && !/par passage/.test(e.cta), 'par défaut : ponctuelle, comme avant');
  await clic('[data-recur="recurrente"]'); e = await etat();
  ok(e.recur && e.recur.rythme === 'semaine' && e.recur.jours.length === 1 && e.recur.jours[0] === jour(e.date), 'récurrente : chaque semaine, le jour de la date choisie');
  ok(/Premier passage/.test(e.label) && /par passage/.test(e.cta), '« Premier passage », et le prix se lit « par passage »');
  ok(e.jours.length === 7 && e.jours.every((x) => x.h >= 44), 'sept jours à cocher, chacun de 44 px');
  await clic('[data-recjour="6"]'); e = await etat();
  ok(e.recur.jours.indexOf(6) >= 0 && e.opts.every((iso) => e.recur.jours.indexOf(jour(iso)) >= 0), 'cocher le samedi : deux passages par semaine ; le premier passage ne propose que les jours cochés');
  await clic('[data-recjour="' + jour(e.date) + '"]'); e = await etat();
  ok(e.recur.jours.indexOf(jour(e.date)) >= 0 && e.recur.jours.length === 1 && e.recur.jours[0] === 6, 'décocher le jour du premier passage : il passe au prochain jour coché');
  await clic('[data-recjour="6"]'); e = await etat();
  ok(e.recur.jours.length === 1, 'le dernier jour coché ne se décoche pas');
  await clic('[data-rythme="jour"]'); e = await etat();
  ok(e.recur.rythme === 'jour' && e.jours.length === 0, 'chaque jour : plus de jours à cocher (7/7)');
  await clic('[data-recur="ponctuelle"]'); e = await etat();
  ok(e.recur === null && !/par passage/.test(e.cta), 'revenir à ponctuelle efface la récurrence');
  ok(!(await ouvrir('colis')), 'pas de récurrence sur le colis');

  console.log('B — ce qui part au serveur');
  ok(/recurrence:recurrenceDuDraft\(m\),serieEtat:recurrenceDuDraft\(m\)\?'active':null,/.test(app), 'la commande enregistre sa récurrence et une série active');
  const draft = await p.evaluate(() => { const S = window.__S; S.draft = window.__newMission(window.__svc.trouve('menage')); S.draft.recur = { rythme: 'semaine', jours: [6, 3, 3] }; S.draft.dateISO = '2026-12-02'; return { rythme: 'semaine', jours: S.draft.recur.jours, debut: S.draft.dateISO }; });
  ok(JSON.stringify(SERIE.recurrencePropre(draft)) === JSON.stringify({ rythme: 'semaine', jours: [3, 6], debut: '2026-12-02' }), 'le serveur lit ce que l’écran a choisi');

  console.log('C — en anglais et en portugais');
  for (const lang of ['en', 'pt']) {
    await ouvrir('menage', lang); await clic('[data-recur="recurrente"]');
    const txt = await p.evaluate(() => document.querySelector('[data-recur]').closest('.card').textContent + ' ' + document.querySelector('[data-cfg="confirm"]').textContent);
    ok(!/Ponctuelle|Récurrente|Les jours|Premier passage|Pause à tout moment|par passage/.test(txt), lang.toUpperCase() + ' : plus rien de français dans le choix');
  }
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
