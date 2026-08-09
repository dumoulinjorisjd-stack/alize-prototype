/* LE POURBOIRE QUI N'ARRIVAIT JAMAIS DANS LES REVENUS DU PRESTATAIRE.
   Vu en production : Mollie affiche 6,30 € à Laure, l'application lui annonce
   « Net perçu · août 2026 : 4,50 € ». Le pourboire est ajouté par le client À LA
   VALIDATION, depuis SON téléphone ; watchRequest ne recopiait jamais `tip` sur la
   mission locale, et l'appareil du prestataire inscrivait dans ses revenus un net
   calculé sans lui. Pire : au rechargement, la réconciliation ne corrigeait qu'un
   numéro de facture — le net faux restait à vie.
   Le serveur, lui, a toujours eu raison : netAmount = brut (pourboire compris) moins
   la commission totale. C'est lui qui fait foi. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

// Le cas réel : prestation 5 €, pourboire 2 €, commission 10 % sur les deux.
const DOC_SERVEUR = {
  status: 'paid', tip: 2, grossTotal: 7, commissionPct: 10,
  commissionAmount: 0.7, netAmount: 6.3, saleInvoiceNo: '2026-TS-0007',
  complementNet: 1.8, complementStatus: 'paye',
};

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 420, height: 900}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.body.classList.add('standalone'); });

  console.log('A — les montants du serveur font foi');
  const v = await p.evaluate((d) => window.__rev.srv(d), DOC_SERVEUR);
  ok(v && v.net === 6.3, 'netAmount (6,30 €) est repris tel quel — pourboire compris');
  ok(v && v.tip === 2, 'le pourboire est lu (2 €)');
  ok((await p.evaluate(() => window.__rev.srv({netAmount: 5}))) === null,
    'tant que le serveur n’a pas réglé, aucun montant « serveur » n’est inventé');
  // Le piège : complementNet (1,80 €) est la PART du pourboire prélevée sur le second
  // paiement, déjà comprise dans netAmount. L'additionner donnerait 8,10 € — faux.
  ok(v.net !== 6.3 + 1.8, 'complementNet n’est jamais additionné à netAmount (double compte)');

  console.log('B — la ligne de revenus écrite trop tôt est recalée');
  const rec = await p.evaluate((d) => {
    const h = {reqId: 'r1', amount: 5, tip: 0, commPct: 10, commission: 0.5, net: 4.5, invNo: '2026-1000'};
    const r = window.__rev.recale(h, d);
    return {h: h, chg: r.chg, delta: r.delta};
  }, DOC_SERVEUR);
  ok(rec.h.net === 6.3, 'le net passe de 4,50 € à 6,30 € (le montant réellement versé par Mollie)');
  ok(rec.h.tip === 2, 'le pourboire apparaît sur la ligne');
  ok(rec.h.amount === 7 && rec.h.commission === 0.7, 'brut et commission alignés sur le serveur');
  ok(rec.h.invNo === '2026-TS-0007', 'le numéro de facture officiel est adopté');
  ok(rec.delta === 1.8, 'l’écart rendu (+1,80 €) permet de corriger le cumul sans tout recompter');
  const stable = await p.evaluate((d) => {
    const h = {reqId: 'r1', amount: 7, tip: 2, commPct: 10, commission: 0.7, net: 6.3, invNo: '2026-TS-0007'};
    return window.__rev.recale(h, d);
  }, DOC_SERVEUR);
  ok(stable.chg === false && stable.delta === 0, 'une ligne déjà juste n’est pas retouchée (idempotent)');

  console.log('C — à l’enregistrement, le serveur l’emporte sur le calcul local');
  const enr = await p.evaluate((d) => {
    const S = window.__S;
    S.persona = 'pro'; S.proHistory = []; S.proEarnings = 0; S.proJobsTotal = 0; S.demoMode = false;
    const m = window.__newMission({id: 'menage', nm: 'Ménage'});
    // L'appareil du prestataire n'a PAS vu le pourboire (m.tip absent) : sans les
    // montants du serveur il écrirait 4,50 €.
    Object.assign(m, {reqId: 'r2', status: 'paid', unit: 'h', rate: 5, duration: 1, dateISO: '2026-08-08'}, d);
    window.__rev.record(m);
    return {n: S.proHistory.length, h: S.proHistory[0], earn: S.proEarnings};
  }, DOC_SERVEUR);
  ok(enr.n === 1 && enr.h.net === 6.3, 'la ligne est écrite directement à 6,30 €');
  ok(enr.h.tip === 2, 'avec son pourboire');
  ok(enr.earn === 6.3, 'le cumul des revenus suit');

  console.log('D — l’écran « Revenus » du prestataire affiche bien le total');
  const affiche = await p.evaluate(() => {
    const S = window.__S;
    const d = new Date();
    S.persona = 'pro'; S.proNav = 'earnings'; S.proStatus = 'approved'; S.demoMode = false;
    S.mission = null; S.detail = null; S.draft = null; S.interv = false;
    S.proHistory = [{id: 'h1', reqId: 'r2', dateISO: d.toISOString().slice(0, 10), svc: 'menage',
      client: 'Camille M.', clientFull: 'Camille M.', duration: 1, unit: 'h', rate: 5,
      amount: 7, tip: 2, commPct: 10, commission: 0.7, net: 6.3, invNo: '2026-TS-0007', paidVia: 'carte'}];
    window.__render();
    return document.body.innerText.replace(/\s+/g, ' ');
  });
  ok(/Net perçu/i.test(affiche), 'l’écran des revenus est affiché');
  ok(/6,30/.test(affiche), 'il annonce 6,30 € — le montant que Mollie a réellement versé');
  ok(!/4,50/.test(affiche), 'et plus 4,50 € (le net amputé du pourboire)');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');
  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
