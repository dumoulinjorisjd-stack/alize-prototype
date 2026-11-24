/* UNE PRESTATION, UN CHOIX OBLIGATOIRE (l'éditeur, 24/11/2026 : « quand on choisit un
   type de prestation on doit obligatoirement choisir une option, ce qui permettrait de
   choisir si l'équipement est celui de la villa ou du prestataire sans risquer un
   doublon ou un oubli » ; « le matériel ne change pas le temps »).
   Mesuré en v933 : deux prestations « Monobrosse » cochées ensemble, 750 € pour 50 m². */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const LIGNE = { id: 'dk', nm: 'Nettoyage monobrosse', price: 5, grp: '', u: 'm2', dm2: 2,
  ch: { nm: 'Matériel', opts: [{ id: 'o1', nm: 'De la villa', price: 5 }, { id: 'o2', nm: 'Du prestataire', price: 10 }] } };

(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 1600 }, locale: 'fr-FR', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(500);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  await p.evaluate(() => { document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none'; });

  const commande = (lignes) => p.evaluate((lignes) => {
    const S = window.__S; S.persona = 'client'; S.onboarded = true; S.mission = null; S.clientNav = 'home';
    S.account = { name: 'Cécile', email: 'c@e.fr', uid: 'c1', role: 'client' };
    S.adminCatalog = { deck: lignes }; S.catalogSeed = 999;
    S.draft = window.__newMission(window.__svc.trouve('deck')); window.__render();
  }, lignes);
  const clic = (sel) => p.evaluate((sel) => { const x = document.querySelector(sel); if (x) x.click(); return !!x; }, sel);
  const etat = () => p.evaluate(() => {
    const v = document.getElementById('view'); const cta = document.querySelector('[data-cfg="confirm"]');
    return { acts: JSON.parse(JSON.stringify(window.__S.draft.acts || [])), txt: v.textContent.replace(/\s+/g, ' '),
      prix: ((v.querySelector('[data-actpick="dk"] .actpr') || {}).textContent || '').replace(/\s+/g, ' '),
      pastilles: [...v.querySelectorAll('[data-actch="dk"]')].map((x) => ({ opt: x.dataset.actopt, on: x.getAttribute('aria-pressed') === 'true', h: x.getBoundingClientRect().height })),
      cta: cta ? cta.textContent.replace(/\s+/g, ' ') : '', off: cta ? cta.disabled : true,
      soustotal: (v.querySelector('[data-actm2tot="dk"]') || {}).textContent || '' };
  });

  console.log('A — cochée, la prestation attend son choix : rien ne part sans lui');
  await commande([LIGNE]);
  let e = await etat();
  ok(/^dès\s5\s€\/m²$/.test(e.prix.trim()), 'la carte dit « dès » le moins cher (« ' + e.prix + ' »)');
  ok(e.pastilles.length === 0, 'tant qu’elle n’est pas cochée, pas de choix affiché');
  await clic('[data-actpick="dk"]'); await p.waitForTimeout(80);
  await p.evaluate(() => { const el = document.querySelector('[data-actm2="dk"]'); el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(80);
  e = await etat();
  ok(e.pastilles.length === 2 && e.pastilles.every((x) => !x.on), 'cochée : deux options, AUCUNE présélectionnée');
  ok(e.pastilles.every((x) => x.h >= 44), 'les deux options font au moins 44 px de haut (' + e.pastilles.map((x) => Math.round(x.h)).join(', ') + ')');
  ok(/Matériel · à choisir/.test(e.txt), 'l’intitulé dit « Matériel · à choisir »');
  ok(e.off && /Choisissez une option pour continuer/.test(e.txt), 'surface tapée mais sans choix, la commande ne part pas, et c’est dit');
  ok(e.acts.length === 1 && e.acts[0].ch === '' && e.acts[0].price === 0 && e.soustotal === '', 'aucun prix n’est annoncé tant que rien n’est choisi');

  console.log('B — un seul choix à la fois, et c’est son prix qui compte');
  await clic('[data-actch="dk"][data-actopt="o2"]'); await p.waitForTimeout(80);
  e = await etat();
  ok(e.acts.length === 1 && e.acts[0].ch === 'o2' && e.acts[0].price === 10 && e.acts[0].qty === 50, 'du prestataire : 10 €/m², 50 m² gardés');
  ok(e.acts[0].nm === 'Nettoyage monobrosse · Du prestataire', 'le nom porte l’option (facture, prestataire) : « ' + e.acts[0].nm + ' »');
  ok(/500,00/.test(e.soustotal) && /500,00/.test(e.cta) && !e.off, 'total 500,00 €, la commande peut partir (« ' + e.cta + ' »)');
  ok(/Matériel/.test(e.txt) && !/à choisir/.test(e.txt), 'choisi, l’intitulé ne réclame plus rien');
  await clic('[data-actch="dk"][data-actopt="o1"]'); await p.waitForTimeout(80);
  e = await etat();
  ok(e.acts.length === 1 && e.acts[0].price === 5 && /250,00/.test(e.cta), 'changer d’avis remplace, n’ajoute pas : 250,00 €, une seule ligne');
  ok(e.pastilles.filter((x) => x.on).map((x) => x.opt).join() === 'o1', 'une seule option allumée');
  const dur = await p.evaluate(() => /Durée estimée : 1 h 40/.test(document.getElementById('view').textContent.replace(/\s+/g, ' ').replace(/ /g, ' ')));
  ok(dur, 'la durée ne dépend pas de l’option : 50 m² × 2 min = 1 h 40');
  const deborde = await p.evaluate(() => { const r = document.querySelector('[data-actpick="dk"]').closest('.actrow'); const rr = r.getBoundingClientRect(); return Math.max(...[...r.querySelectorAll('*')].map((x) => x.getBoundingClientRect().right - rr.right)); });
  ok(deborde <= 0, 'à 393 px, rien ne déborde (' + Math.round(deborde) + ' px)');
  const SRC = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  ok(/a\.ch\?\{ch:String\(a\.ch\)\}:\{\}/.test(SRC), 'la demande enregistrée garde l’option choisie');

  console.log('C — une ligne sans choix, ou au choix incomplet, se commande comme hier');
  await commande([{ id: 'dk', nm: 'Haute pression', price: 120, grp: '' }]);
  await clic('[data-actpick="dk"]'); await p.waitForTimeout(80);
  e = await etat();
  ok(e.acts.length === 1 && !('ch' in e.acts[0]) && e.acts[0].price === 120 && !e.off, 'sans choix : la ligne d’hier, à 120 €, sans champ en plus');
  await commande([Object.assign({}, LIGNE, { u: '', ch: { nm: 'Matériel', opts: [{ id: 'o1', nm: 'De la villa', price: 5 }, { id: 'o2', nm: '', price: 10 }] } })]);
  await clic('[data-actpick="dk"]'); await p.waitForTimeout(80);
  e = await etat();
  ok(e.pastilles.length === 0 && !e.off && !('ch' in e.acts[0]), 'un choix à une seule option complète n’en est pas un : rien n’est réclamé');

  console.log('D — la console règle le choix');
  await p.evaluate(() => {
    const S = window.__S; S.persona = 'admin'; S.admin = { view: 'home' }; S.adminArtisans = []; S.adminClients = []; S.adminPricesLus = true;
    S.adminCatalog = { deck: [{ id: 'dk', nm: 'Nettoyage monobrosse', price: 5, grp: '', u: 'm2', dm2: 2 }] }; S.catalogSeed = 999;
    S._fold = { 'a-prices': true }; S.admPriceOpen = { deck: true }; window.__render();
  });
  ok(await clic('[data-actchon="deck:dk"]'), 'chaque prestation offre « Choix obligatoire »');
  await p.waitForTimeout(120);
  const saisir = (sel, v) => p.evaluate(({ sel, v }) => { const el = document.querySelector(sel); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }, { sel, v });
  let c = await p.evaluate(() => ({ incomplet: /Pas encore proposé/.test(document.body.innerText), a: JSON.parse(JSON.stringify(window.__S.adminCatalog.deck[0])) }));
  ok(c.incomplet && c.a.ch && c.a.ch.opts.length === 2, 'il s’ouvre avec deux options à remplir, et dit qu’il n’est pas encore proposé');
  await saisir('[data-actchnm="deck:dk"]', 'Matériel');
  await saisir('[data-actchonm="deck:dk:o1"]', 'De la villa'); await saisir('[data-actchopx="deck:dk:o1"]', '6');
  await saisir('[data-actchonm="deck:dk:o2"]', 'Du prestataire'); await saisir('[data-actchopx="deck:dk:o2"]', '10');
  await p.evaluate(() => window.__render()); await p.waitForTimeout(80);
  c = await p.evaluate(() => ({ a: JSON.parse(JSON.stringify(window.__S.adminCatalog.deck[0])), prixSeul: !!document.querySelector('[data-actpricev="deck:dk"]'), txt: document.body.innerText }));
  ok(c.a.ch.nm === 'Matériel' && c.a.ch.opts.map((x) => x.nm + '=' + x.price).join() === 'De la villa=6,Du prestataire=10', 'intitulé, noms et prix enregistrés');
  ok(c.a.price === 6, 'le prix de la ligne suit la moins chère des options (6), son « dès »');
  ok(!c.prixSeul && /Prix selon l’option/.test(c.txt) && !/Pas encore proposé/.test(c.txt), 'complet : le prix unique cède la place, plus d’avertissement');
  await clic('[data-actchoadd="deck:dk"]'); await p.waitForTimeout(80);
  c = await p.evaluate(() => window.__S.adminCatalog.deck[0].ch.opts.map((x) => x.id).join());
  ok(c === 'o1,o2,o3', 'une option s’ajoute (' + c + ')');
  await clic('[data-actchodel="deck:dk:o3"]'); await p.waitForTimeout(80);
  c = await p.evaluate(() => window.__S.adminCatalog.deck[0].ch.opts.map((x) => x.id).join());
  ok(c === 'o1,o2', 'et se retire (' + c + ')');
  await clic('[data-actchoff="deck:dk"]'); await p.waitForTimeout(80);
  c = await p.evaluate(() => ({ ch: 'ch' in window.__S.adminCatalog.deck[0], prix: !!document.querySelector('[data-actpricev="deck:dk"]') }));
  ok(!c.ch && c.prix, 'retirer le choix rend la ligne d’hier, avec son prix');

  console.log('E — le serveur juge le prix de l’option');
  const CATP = require(path.join(RACINE, 'functions', 'catalogue-prestataire.js'));
  const L = CATP.lignesPropres([LIGNE]).lignes;
  ok(L[0].ch && L[0].ch.opts.length === 2, 'le nettoyage du catalogue garde le choix');
  ok(CATP.prixAttendu([{ id: 'dk', price: 10, qty: 50, ch: 'o2' }], L).ok, 'du prestataire à 10 €/m² : conforme');
  const t = CATP.prixAttendu([{ id: 'dk', price: 5, qty: 50, ch: 'o2' }], L);
  ok(!t.ok && t.code === 'prix' && t.ecarts[0].catalogue === 10, 'du prestataire écrit à 5 € : l’écart est vu (attendu 10)');
  ok(CATP.prixAttendu([{ id: 'dk', price: 5, qty: 50 }], L).ok, 'une commande passée avant le choix reste conforme');
  ok(CATP.choixPropre({ nm: 'Matériel', opts: [{ id: 'a', nm: 'X', price: 5 }] }) === null, 'une seule option : pas un choix');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
