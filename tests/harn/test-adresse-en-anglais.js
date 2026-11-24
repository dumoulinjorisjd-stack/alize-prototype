/* L'ADRESSE DE LA COMMANDE, EN ANGLAIS (l'éditeur, 24/11/2026 : « Je suis en anglais,
   cette partie est mal traduite »). Mesuré : « Adresse exacte », « Nom du lieu
   (facultatif) », « Je suis sur place », « Placer sur la carte », la phrase du point GPS
   et les deux placeholders restaient en français ; les dates « jeu. 26 nov. » aussi (le
   point final du mois faisait manquer la règle). On rend l'écran en EN et en PT, et rien
   de ce qui est en français ne doit y rester tel quel. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
// Ce qui se dit pareil, ou ne se traduit pas : la marque, les lieux, « Total », « Photo ».
const PAREIL = /^(-Services|Total|Photo|Public|Gustavia|Colombier|Corossol|Marigot|Saint-Jean|Grand Fond|Anse .*|Cul-de-Sac.*|Grande & Petite Saline|Lorient.*|Lurin.*|Pointe Milou.*|Terre Neuve.*|Vitet.*)$/;

(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2400 }, locale: 'fr-FR', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(500);
  const rendre = (svc, lang) => p.evaluate(({ svc, lang }) => {
    const S = window.__S; S.lang = lang; S.onboarded = true; S.persona = 'client'; S.mission = null; S.clientNav = 'home';
    S.account = { name: 'C', email: 'c@e.fr', uid: 'c1', role: 'client' }; S.addresses = [];
    S.draft = window.__newMission(window.__svc.trouve(svc)); S.draft.addressId = '__manual'; window.__render();
    const v = document.getElementById('view'); const L = []; const w = document.createTreeWalker(v, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t && /[a-zà-ÿ]{3}/i.test(t)) L.push(t); }
    v.querySelectorAll('[placeholder]').forEach((e) => L.push('@' + e.getAttribute('placeholder')));
    return { L, txt: v.textContent.replace(/\s+/g, ' ') };
  }, { svc, lang });
  for (const svc of ['menage', 'deck']) {
    console.log('— ' + svc);
    const fr = await rendre(svc, 'fr');
    for (const lang of ['en', 'pt']) {
      const r = await rendre(svc, lang);
      const vus = new Set(fr.L);
      const restes = [...new Set(r.L.filter((t) => vus.has(t) && !PAREIL.test(t.replace(/^@/, ''))))];
      ok(restes.length === 0, lang.toUpperCase() + ' : plus rien de français tel quel (' + restes.slice(0, 6).join(' | ') + ')');
    }
    const en = await rendre(svc, 'en');
    ok(/Exact address/.test(en.txt) && /Pin on the map/.test(en.txt) && /Required: in Saint-Barth/.test(en.txt), 'EN : « Exact address », « Pin on the map », la phrase du point GPS');
    ok(en.L.includes('@Place name') && en.L.includes('@Place name, area'), 'EN : les deux placeholders');
    ok(en.L.some((t) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/.test(t)), 'EN : les jours se lisent « Thu 26 Nov »');
  }
  await p.evaluate(() => { window.__S.lang = 'fr'; });
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
