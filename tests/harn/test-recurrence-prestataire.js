/* LA RÉCURRENCE CÔTÉ PRESTATAIRE (l'éditeur, 25/11/2026) : « le pro accepte dès le début
   la récurrence, il doit honorer cette récurrence sauf s'il met explicitement qu'il ne
   peut pas passer cette fois » — « oui 48 h ». */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2600 }, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-25T14:00:00Z') });   // mer. 25 nov., 10:00
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  const pro = () => p.evaluate(() => {
    window.__ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'u0', email: 'k@e.fr' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), updateDoc: (ref, patch) => { window.__ecrits.push({ ref: ref.path, patch }); return Promise.resolve(); }, setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro'; S.proStatus = 'valide'; S.proName = 'Karla Barbosa';
    S.account = { name: 'Karla', email: 'k@e.fr', uid: 'u0', role: 'pro' };
  });

  console.log('A — la demande annonce l’engagement');
  await pro();
  let r = await p.evaluate(() => {
    const S = window.__S; S.mission = null; S.proNav = 'home';
    S.openRequests = [{ id: 'R1', status: 'pending', service: 'menage', serviceName: 'Ménage', clientUid: 'c1', clientName: 'Laure', dateISO: '2026-12-02', slot: '08:00', zone: 'Gustavia', unit: 'h', duration: 4, rate: 28, total: 112,
      recurrence: { rythme: 'semaine', jours: [3, 6], debut: '2026-12-02' } }];
    S.proReqView = 'R1'; window.__render(); return document.getElementById('view').textContent.replace(/\s+/g, ' ');
  });
  ok(/Récurrente · chaque semaine \(Me · Sa\)\. En acceptant, vous vous engagez sur chaque passage\./.test(r), 'la demande dit le rythme, les jours, et l’engagement');
  const en = await p.evaluate(() => { window.__S.lang = 'en'; window.__render(); const t = document.getElementById('view').textContent.replace(/\s+/g, ' '); window.__S.lang = 'fr'; return t; });
  ok(/Recurring · every week \(We · Sa\)\. By accepting, you commit to every visit\./.test(en), 'et en anglais');

  // « il faut comprendre que la somme perçue est par prestation » (l'éditeur, 25/11/2026)
  ok(/Vous percevez ?\d+,\d\d € par passage Montant net que vous touchez à chaque passage, versé après chacun\./.test(r), 'la fiche dit que le montant vaut pour un passage');
  const liste = await p.evaluate(() => { const S = window.__S; S.proReqView = null; window.__render(); return document.getElementById('view').textContent.replace(/\s+/g, ' '); });
  ok(/Ménage ?\d+,\d\d € par passage/.test(liste), 'la liste des missions disponibles aussi');
  const ponct = await p.evaluate(() => { const S = window.__S; delete S.openRequests[0].recurrence; S.proReqView = 'R1'; window.__render(); const t = document.getElementById('view').textContent.replace(/\s+/g, ' '); S.proReqView = null; window.__render(); return t + ' || ' + document.getElementById('view').textContent.replace(/\s+/g, ' '); });
  ok(!/par passage/.test(ponct) && /pour cette mission, versé après la prestation/.test(ponct), 'une demande ponctuelle ne change pas');
  const enP = await p.evaluate(() => { const S = window.__S; S.openRequests[0].recurrence = { rythme: 'semaine', jours: [3, 6], debut: '2026-12-02' }; S.proReqView = 'R1'; S.lang = 'en'; window.__render(); const t = document.getElementById('view').textContent.replace(/\s+/g, ' '); S.lang = 'fr'; S.proReqView = null; window.__render(); return t; });
  await p.clock.runFor(500); await p.evaluate(() => { window.__ecrits = []; });   // la « vue » de la fiche s'écrit à part
  ok(/per visit Net amount you earn for each visit, paid after each one\./.test(enP), 'et en anglais');

  console.log('B — un passage à plus de 48 h : « Je ne peux pas cette fois »');
  const passage = (dateISO, serieId) => p.evaluate(({ dateISO, serieId }) => {
    const S = window.__S; S.proReqView = null; S.proDeclinAsk = false; S.proReopenAsk = false;
    const m = window.__newMission(window.__svc.trouve('menage'));
    Object.assign(m, { reqId: 'P-' + dateISO, status: 'accepted', serieId: serieId, dateISO: dateISO, when: '', slot: '08:00', zone: 'Gustavia', clientName: 'Laure', duration: 4, rate: 28 });
    S.proMissions = [m]; S.mission = m; window.__render();
    const t = document.getElementById('view').textContent.replace(/\s+/g, ' ');
    return { t, declin: !!document.querySelector('[data-act="pro-passage-declin"]'), rendre: !!document.querySelector('[data-act="pro-reopen"]') };
  }, { dateISO, serieId });
  r = await passage('2026-11-28', 'S1');   // samedi 08:00, dans 70 h
  ok(r.declin && !r.rendre, 'le bouton est là, à la place de « je ne peux plus assurer cette mission »');
  await p.evaluate(() => document.querySelector('[data-act="pro-passage-declin"]').click());
  const confirme = await p.evaluate(() => ({ t: document.getElementById('view').textContent.replace(/\s+/g, ' '), ok: !!document.querySelector('[data-act="pro-passage-declin-ok"]'), ecrits: window.__ecrits.length }));
  ok(confirme.ok && /Libérer ce passage \? Le client le proposera à quelqu’un d’autre, les suivants restent à vous\./.test(confirme.t) && confirme.ecrits === 0, 'premier toucher : il demande confirmation, rien n’est écrit');
  await p.evaluate(() => document.querySelector('[data-act="pro-passage-declin-ok"]').click());
  const fait = await p.evaluate(() => ({ e: window.__ecrits.slice(), mission: window.__S.mission, missions: (window.__S.proMissions || []).length }));
  const w = fait.e.find((x) => /P-2026-11-28/.test(x.ref)) || {};
  ok(w.patch && w.patch.status === 'declined' && w.patch.providerUid === null && w.patch.declinedBy === 'u0', 'confirmé : le passage est décliné, il lui est retiré (status declined, providerUid null)');
  ok(fait.mission === null && fait.missions === 0, 'il disparaît de ses missions');

  console.log('C — à moins de 48 h : on prévient par message ; hors série : rien ne change');
  r = await passage('2026-11-26', 'S1');   // demain 08:00, dans 22 h
  ok(!r.declin && /Passage dans moins de 48 h : prévenez le client par message\./.test(r.t), 'moins de 48 h : pas de bouton, la consigne');
  r = await passage('2026-11-28', '');
  ok(!r.declin && r.rendre, 'une mission ponctuelle garde « je ne peux plus assurer cette mission »');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
