/* « Enlève la phrase sous demain. Enlève aussi le texte explicatif sous photo »
   (l'éditeur, 24/11/2026). Le comportement reste : à 23 h 50 (heure de Saint-Barth), aujourd'hui n'est plus
   proposé — seulement, plus aucune phrase ne le commente. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2400 }, locale: 'fr-FR', timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-25T03:50:00Z') });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  for (const svc of ['deck', 'menage']) {
    const r = await p.evaluate((svc) => {
      const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.persona = 'client'; S.mission = null; S.clientNav = 'home';
      S.account = { name: 'C', email: 'c@e.fr', uid: 'c1', role: 'client' };
      S.draft = window.__newMission(window.__svc.trouve(svc)); window.__render();
      const v = document.getElementById('view'); const sel = v.querySelector('[data-cfday]');
      const photo = [...v.querySelectorAll('.field')].find((x) => /^Photos/.test((x.querySelector('label') || {}).textContent || ''));
      return { txt: v.textContent.replace(/\s+/g, ' '), jours: sel ? [...sel.options].map((x) => x.textContent) : [],
        apresJour: sel && sel.nextElementSibling ? sel.nextElementSibling.textContent : '',
        photo: !!photo, photoAide: photo ? [...photo.querySelectorAll('p')].map((x) => x.textContent).join(' ') : '' };
    }, svc);
    console.log('— ' + svc);
    ok(r.jours.length && r.jours[0] === 'Demain' && !r.jours.includes('Aujourd’hui'), 'à 23 h 50, la liste commence à « Demain » (' + r.jours.slice(0, 2).join(', ') + ')');
    ok(!/Plus de créneau disponible|Plus de départ possible/.test(r.txt) && r.apresJour === '', 'aucune phrase sous le jour');
    if (svc === 'deck') ok(r.photo && r.photoAide === '' && !/Une photo aide le prestataire|Montrez le résultat/.test(r.txt), 'le champ Photos reste, sans texte explicatif');
  }
  // « Pareil sous adresse » (l'éditeur, 24/11/2026) : plus de phrase sous le titre.
  console.log('— adresse');
  for (const cas of [{ svc: 'deck', adr: [] }, { svc: 'deck', adr: [{ id: 'a1', label: 'Villa', address: 'Lorient', zone: 'Lorient', geo: null }] }, { svc: 'colis', adr: [] }]) {
    const r = await p.evaluate((cas) => {
      const S = window.__S; S.addresses = cas.adr; S.draft = window.__newMission(window.__svc.trouve(cas.svc)); S.draft.addressId = '__manual'; window.__render();
      const box = document.getElementById('manualAddr');
      const premier = box ? box.firstElementChild : null;
      return { box: !!box, premier: premier ? premier.className + '|' + premier.textContent.trim().slice(0, 40) : '', txt: document.getElementById('view').textContent };
    }, cas);
    ok(r.box && /^field\|/.test(r.premier) && !/Indiquez où le prestataire|Nouvelle adresse pour cette|Indiquez où vous faire livrer/.test(r.txt),
      cas.svc + (cas.adr.length ? ' (adresses enregistrées)' : '') + ' : le bloc commence par son premier champ (' + r.premier + ')');
  }
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
