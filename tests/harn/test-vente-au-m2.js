/* DECK & TERRASSE AU M² (l'éditeur, 23/11/2026 : « B », puis « je dois pouvoir choisir
   tout ça depuis la console »). Une prestation de la grille se vend à l'unité ou au m² ;
   au m², le client TAPE sa surface, le total et la durée la suivent ; la console règle
   l'unité, le prix au m², le temps par m², et peut passer un métier livré à l'acte. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 1600 }, locale: 'fr-FR', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(500);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
  await p.evaluate(() => { document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none'; });

  console.log('A — la console : passer un métier LIVRÉ à l’acte, armé');
  const consoleDeck = () => p.evaluate(() => {
    const S = window.__S; S.persona = 'admin'; S.onboarded = true; S.admin = { view: 'home' };
    S.adminArtisans = [{ id: 'u1', uid: 'u1', name: 'Several S&c', cats: ['deck'], status: 'valide' }]; S.adminClients = []; S.adminPricesLus = true;
    S._fold = { 'a-prices': true }; S.admPriceOpen = { deck: true }; window.__render();
  });
  await p.evaluate(() => { window.__S.adminCatalog = { deck: [] }; window.__S.catalogSeed = 999; });
  await consoleDeck();
  let c = await p.evaluate(() => ({ bascule: !!document.querySelector('[data-adm="acteon:deck"]'), txt: document.body.innerText }));
  ok(c.bascule && /1 prestataire l’exerce/.test(c.txt), 'Deck & terrasse (métier livré) offre « Passer à l’acte », et dit qui l’exerce');
  await p.evaluate(() => { const x = document.querySelector('[data-adm="acteon:deck"]'); if (x) x.click(); }); await p.waitForTimeout(200);
  c = await p.evaluate(() => ({ n: ((window.__S.adminCatalog || {}).deck || []).length, arme: /Confirmer/.test((document.querySelector('[data-adm="acteon:deck"]') || {}).textContent || '') }));
  ok(c.n === 0 && c.arme, 'le premier appui ne change rien : il s’arme');
  await p.evaluate(() => { const x = document.querySelector('[data-adm="acteon:deck"]'); if (x) x.click(); }); await p.waitForTimeout(250);
  c = await p.evaluate(() => ({ n: ((window.__S.adminCatalog || {}).deck || []).length, horaire: /Tarif horaire/.test(document.body.innerText) }));
  ok(c.n === 1 && !c.horaire, 'le second passe à l’acte : une prestation à régler, plus de tarif horaire');

  console.log('B — la console : au m², et le temps par m²');
  const id0 = await p.evaluate(() => (((window.__S.adminCatalog || {}).deck || [])[0] || {}).id || '');
  await p.evaluate((id) => { const x = document.querySelector('[data-actunit="deck:' + id + ':m2"]'); if (x) x.click(); }, id0); await p.waitForTimeout(150);
  for (let i = 0; i < 4; i++) { await p.evaluate((id) => { const x = document.querySelector('[data-actdm2="deck:' + id + ':up"]'); if (x) x.click(); }, id0); await p.waitForTimeout(60); }
  c = await p.evaluate(() => { const a = (((window.__S.adminCatalog || {}).deck || [])[0]) || {}; return { u: a.u, dm2: a.dm2, txt: document.body.innerText }; });
  ok(c.u === 'm2' && c.dm2 === 2, 'au m², avec 2 minutes par m² (4 crans de 30 s) (' + c.u + ', ' + c.dm2 + ')');
  ok(/Temps par m²/.test(c.txt) && /2 min/.test(c.txt) && /€\/m²/.test(c.txt), 'la console l’affiche en clair : temps par m², prix en €/m²');
  await p.evaluate((id) => { const x = document.querySelector('[data-actunit="deck:' + id + ':u"]'); if (x) x.click(); }, id0); await p.waitForTimeout(150);
  c = await p.evaluate(() => { const a = (((window.__S.adminCatalog || {}).deck || [])[0]) || {}; return { u: a.u || '', dm2: a.dm2 || 0, existe: !!a.id }; });
  ok(c.existe && c.u === '' && c.dm2 === 0, 'revenir « à l’unité » retire l’unité et le temps par m²');

  console.log('C — le client tape sa surface ; total et durée la suivent');
  const cmd = await p.evaluate(async () => {
    const S = window.__S; S.persona = 'client'; S.mission = null; S.clientNav = 'home';
    S.account = { name: 'Cécile', email: 'c@e.fr', uid: 'c1', role: 'client' };
    S.adminCatalog = { deck: [{ id: 'dk1', nm: 'Nettoyage monobrosse (matériel de la villa)', price: 5, grp: '', u: 'm2', dm2: 2 },
      { id: 'dk2', nm: 'Haute pression', price: 120, grp: '' }] };
    S.draft = window.__newMission(window.__svc.trouve('deck')); window.__render();
    const v = () => document.getElementById('view');
    const prix = (v().querySelector('[data-actpick="dk1"] .actpr') || {}).textContent || '';
    const pk = document.querySelector('[data-actpick="dk1"]'); if (pk) pk.click(); await new Promise((r) => setTimeout(r, 60));
    const champ = document.querySelector('[data-actm2="dk1"]');
    const vide = { champ: !!champ, focus: document.activeElement === champ, bouton: document.querySelector('[data-cfg="confirm"]').disabled,
      aide: /Indiquez la surface en m² pour continuer/.test(v().textContent) };
    // La cliente tape « 45 », chiffre par chiffre : le curseur ne quitte pas la case.
    if (!champ) return { prix, vide, garde: false, qte: 0, u: '', soustotal: '', cta: '', ctaOff: true, duree: false, est: [], deborde: 99 };
    for (const ch of ['4', '5']) { const el = document.querySelector('[data-actm2="dk1"]'); el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 30)); }
    const el = document.querySelector('[data-actm2="dk1"]');
    const t = v().textContent.replace(/\s+/g, ' ');
    const cta = document.querySelector('[data-cfg="confirm"]');
    const est = [...v().querySelectorAll('.est .line')].map((x) => x.textContent.replace(/\s+/g, ' '));
    const row = el.closest('.actrow'); const rr = row.getBoundingClientRect();
    return { prix, vide, garde: document.activeElement === el && el.value === '45', qte: S.draft.acts[0].qty, u: S.draft.acts[0].u,
      soustotal: (document.querySelector('[data-actm2tot="dk1"]') || {}).textContent || '', cta: cta.textContent.replace(/\s+/g, ' '), ctaOff: cta.disabled,
      duree: /Durée estimée : 1 h 30/.test(t.replace(/ /g, ' ')), est, dureeMin: window.__S && window.__S.draft ? null : null,
      deborde: Math.max(...[...row.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - rr.right)) };
  });
  ok(/5\s€\/m²/.test(cmd.prix), 'le prix se lit au m² (« ' + cmd.prix + ' »)');
  ok(cmd.vide.champ && cmd.vide.focus, 'cochée, la prestation ouvre un champ « Surface », curseur dedans');
  ok(cmd.vide.bouton && cmd.vide.aide, 'sans surface, la commande ne part pas, et c’est dit');
  ok(cmd.garde && cmd.qte === 45 && cmd.u === 'm2', 'elle tape 45, le curseur reste dans la case, la commande retient 45 m²');
  ok(/225,00/.test(cmd.soustotal) && /225,00/.test(cmd.cta) && !cmd.ctaOff, 'le total suit : 225,00 €, et la commande peut partir (« ' + cmd.cta + ' »)');
  ok(cmd.est.some((x) => /45\sm²/.test(x) && /225,00/.test(x)), 'le récapitulatif dit la surface (« ' + cmd.est.join(' | ') + ' »)');
  ok(cmd.duree, 'la durée suit la surface : 45 m² × 2 min = 1 h 30');
  ok(cmd.deborde <= 0, 'à 393 px, rien ne déborde (' + Math.round(cmd.deborde) + ' px)');

  console.log('D — ce qui part au serveur, et ce que lisent le prestataire et le papier');
  const dur = await p.evaluate(() => {
    const S = window.__S; const m = S.draft;
    return { h: window.__demarrage ? null : null, acts: JSON.parse(JSON.stringify(m.acts)) };
  });
  ok(dur.acts.length === 1 && dur.acts[0].u === 'm2' && dur.acts[0].qty === 45 && dur.acts[0].price === 5, 'la ligne envoyée porte prix unitaire, surface et unité : le serveur vérifie 5 € × 45');
  const SRC = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  ok(/acts:\(m\.acts&&m\.acts\.length\)\?m\.acts\.map\(function\(a\)\{return Object\.assign\(\{id:a\.id,nm:a\.nm,price:Number\(a\.price\)\|\|0,qty:a\.qty\|\|1\},actAuM2\(a\)\?\{u:'m2'\}:\{\}(,a\.ch\?\{ch:String\(a\.ch\)\}:\{\})?\);\}\)/.test(SRC),
    'la demande enregistrée garde l’unité');
  const CATP = require(path.join(RACINE, 'functions', 'catalogue-prestataire.js'));
  const v = CATP.prixAttendu([{ id: 'dk1', price: 5, qty: 45, u: 'm2' }], [{ id: 'dk1', price: 5 }]);
  ok(v.ok && v.total === 225, 'le serveur chiffre 225 € et ne voit aucun écart');
  ok(!CATP.prixAttendu([{ id: 'dk1', price: 5, qty: 0, u: 'm2' }], [{ id: 'dk1', price: 5 }]).ok, 'une surface nulle est refusée par le serveur');
  const papier = await p.evaluate(() => {
    const S = window.__S;
    const h = { reqId: 'r1', svc: 'deck', svcName: 'Deck & terrasse', dateISO: '2026-11-25', slot: '09:00', unit: 'h', duration: 1, total: 225, provider: { nm: 'Several' }, zone: 'Toiny', invNo: '2026-AB-1', status: 'paid',
      acts: [{ id: 'dk1', nm: 'Nettoyage monobrosse (matériel de la villa)', price: 5, qty: 45, u: 'm2' }] };
    S.draft = null; S.detail = { h, r: { reqId: 'r1', acts: h.acts, mollieCaptured: true, mollieCaptureAmount: 225 }, det: {}, side: 'client', loaded: true }; window.__render();
    return document.getElementById('view').textContent.replace(/\s+/g, ' ');
  });
  console.log('    [papier] ' + papier.slice(papier.indexOf('Détail commandé'), papier.indexOf('Détail commandé') + 120));
  ok(/matériel de la villa\)\s45\sm²\s?225,00/.test(papier), 'le détail de la prestation dit « 45 m² », pas « × 45 »');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
