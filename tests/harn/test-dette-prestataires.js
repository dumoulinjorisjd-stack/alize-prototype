/* CE QUI EST SUR LE COMPTE N'EST PAS CE QU'ON A GAGNÉ.
   Quand le partage Mollie fonctionne, la banque de Ti-Services ne reçoit QUE la commission :
   le net part directement chez le prestataire. Quand il échoue — et il a échoué sur les
   premières prestations — elle reçoit la TOTALITÉ de l'encaissement. La part du prestataire
   y transite et devient une DETTE. Le justificatif affichait un revenu exact (la commission
   est bien acquise dès que le client est débité) mais taisait ce passif : image fausse pour
   le comptable, qui voit de l'argent sur le compte sans savoir qu'une partie est due. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

console.log('A — le registre sait ce qui est parti, et ce qui ne l’est pas');
ok((fn.match(/collection\('ledger'\)\.doc\([^)]*\)\.set\(\{molliePayout/g) || []).length === 6,
  'les six endroits qui décident d’un versement l’inscrivent au registre');
ok(/collection\('ledger'\)\.doc\(reqId\)\.set\(\{molliePayout: 'unrouted'\}/.test(fn),
  'un versement refusé y est marqué « non parti »');
ok(/collection\('ledger'\)\.doc\(reqId\)\.set\(\{molliePayout: 'manuel'\}/.test(fn),
  'et un virement fait à la main solde la dette');

console.log('B — le justificatif distingue le revenu de la dette');
ok(/const _duList=_led\.filter\(function\(e\)\{return e\.molliePayout==='unrouted';\}\);/.test(src),
  'la dette ne compte QUE les versements dont on sait qu’ils n’ont pas été faits');
ok(/const duInconnu=_led\.filter\(function\(e\)\{return e\.molliePayout==null;\}\)\.length;/.test(src),
  'les écritures antérieures au suivi sont comptées à part — on dit qu’on ne sait pas, on n’invente pas');
ok(/Dû aux prestataires/.test(src), 'la ligne existe');
ok(/c'est une <b>dette<\/b>, pas un revenu/.test(src), 'et elle nomme sa nature');
ok(/Elle n'entre donc pas dans le résultat ci-dessus/.test(src),
  'en précisant qu’elle ne se soustrait PAS du résultat — une dette n’est pas une charge');

console.log('C — et l’export comptable la porte aussi');
ok(/DÛ AUX PRESTATAIRES \(dette — hors résultat\)/.test(src), 'un bloc dédié dans le CSV');
ok(/Total dû aux prestataires/.test(src), 'avec son total');
const iRev = src.indexOf("'Revenu net réel Ti-Services',''");
const iDet = src.indexOf('DÛ AUX PRESTATAIRES');
ok(iRev > 0 && iDet > iRev, 'placé APRÈS le résultat, jamais mêlé à son calcul');

console.log('D — sur l’écran réel');
(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 390, height: 2000}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1400);

  const ecran = (ledger) => p.evaluate((ledger) => {
    const S = window.__S;
    S.onboarded = true; S.guest = false; S.persona = 'admin'; S.lang = 'fr';
    S.demoMode = false; S.mission = null;
    S.admin = {view: 'fact', sel: null, fact: null, factQ: ''};
    S._fold = {'f-acc': true};
    S.adminOrph = {loaded: false, list: []}; S.adminVers = {loaded: false, list: []};
    S.adminLedger = ledger;
    window.__render();
    const carte = [...document.querySelectorAll('.fold-head')].find((h) => /Justificatif de revenus/.test(h.textContent));
    return carte ? carte.parentElement.textContent.replace(/\s+/g, ' ').trim() : '';
  }, ledger);

  const base = (o) => Object.assign({type: 'commission', mollieEncaisse: true, mollieFee: 0,
    commissionAmount: 0.5, netAmount: 4.5, providerName: 'Laureguyon', serviceName: 'Colis & courrier',
    invNo: '2026-0002', reqId: 'r1'}, o);

  const du = await ecran([base({molliePayout: 'unrouted'}), base({reqId: 'r2', molliePayout: 'routed'})]);
  ok(/Dû aux prestataires/.test(du), 'la dette apparaît dès qu’un versement n’est pas parti');
  ok(/4,50/.test(du), 'avec son montant — le NET du prestataire, pas la commission');
  ok(/1 versement non parti/.test(du), 'et le nombre concerné');
  ok(/Commissions encaissées/.test(du) && /1,00/.test(du),
    'le revenu, lui, compte les DEUX commissions : elle est acquise dès que le client est débité');

  const sain = await ecran([base({molliePayout: 'routed'})]);
  ok(!/Dû aux prestataires/.test(sain), 'rien ne s’affiche quand tout est versé');

  const flou = await ecran([base({})]);
  ok(/état inconnu/.test(flou),
    'une écriture antérieure au suivi est signalée comme inconnue, pas comptée d’office');

  const vrais = errs.filter((e) => !/net::ERR|Failed to load|firebase|firestore|ERR_FAILED/i.test(e));
  ok(vrais.length === 0, 'aucune erreur JS (' + vrais.join(' | ').slice(0, 150) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
