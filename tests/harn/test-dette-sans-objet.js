/* « POURQUOI J'AI ENCORE LA DETTE, JE L'AI RÉGLÉ CETTE FACTURE » (l'éditeur, 24/11/2026).
   Mesuré en production : Laura, massage, 104,50 €. L'empreinte avait expiré sans débiter,
   le second paiement avait tout réglé et son versement était acté à la main. La liste des
   versements disait « 0,00 € dû » ; le bandeau « Dû aux prestataires » comptait 104,50 €.
   « Réessayer » avait tenté le partage d'un paiement expiré (Mollie : 404) et inscrit
   `unrouted` au REGISTRE — que lit le bandeau — sans l'inscrire sur la demande. Une seule
   règle désormais (IRR.jambeSansObjet), écrite des deux côtés. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const IRR = require(path.join(RACINE, 'functions', 'versement-irroutable.js'));
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

console.log('A — la règle');
ok(IRR.jambeSansObjet({ statutMollie: 'expired', complementStatus: 'paye' }), 'empreinte expirée + second paiement payé : rien à verser sur la jambe');
ok(IRR.jambeSansObjet({ statutMollie: 'canceled', complementStatus: 'paye' }) && IRR.jambeSansObjet({ statutMollie: 'failed', complementStatus: 'paye' }), 'de même annulée ou refusée');
ok(!IRR.jambeSansObjet({ statutMollie: 'paid', complementStatus: 'paye' }), 'une empreinte DÉBITÉE garde sa dette');
ok(!IRR.jambeSansObjet({ statutMollie: 'authorized', complementStatus: 'paye' }), 'une empreinte encore ouverte aussi (elle peut être débitée)');
ok(!IRR.jambeSansObjet({ statutMollie: 'expired', complementStatus: '' }), 'sans second paiement payé, on ne conclut rien');
ok(!IRR.jambeSansObjet({ statutMollie: '', complementStatus: 'paye' }), 'Mollie muet : on ne conclut rien');

console.log('B — le serveur : aucun partage tenté, et l’état écrit des deux côtés');
const scan = fn.slice(fn.indexOf('exports.payoutRetry'), fn.indexOf('LES SUPPLÉMENTS BLOQUÉS AUSSI'));
const iSans = scan.indexOf('IRR.jambeSansObjet(');
const iRoute = scan.indexOf('mollieRouteNet(r.molliePaymentId');
ok(iSans > 0 && iRoute > iSans, 'la règle est lue AVANT toute tentative de partage');
const bloc = scan.slice(iSans, scan.indexOf('continue;', iSans));
ok(/d\.ref\.update\(\{molliePayout: 'sans-objet'/.test(bloc) && /collection\('ledger'\)\.doc\(d\.id\)\.set\(\{molliePayout: 'sans-objet'\}/.test(bloc),
  'la demande ET le registre reçoivent « sans-objet »');
ok(/x\.molliePayout === 'sans-objet'\) continue;/.test(scan), 'une jambe « sans-objet » ne revient plus dans la liste');

console.log('C — la console : le bandeau et la carte disent la même chose');
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 2400 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);
  const ecran = (ledger, vers) => p.evaluate(({ ledger, vers }) => {
    const S = window.__S; S.onboarded = true; S.guest = false; S.persona = 'admin'; S.lang = 'fr'; S.demoMode = false; S.mission = null;
    S.admin = { view: 'fact', sel: null, fact: null, factQ: '' }; S._fold = { 'f-acc': true, 'f-vers': true };
    S.adminOrph = { loaded: false, list: [] }; S.adminVers = vers; S.adminLedger = ledger; window.__render();
    const v = document.getElementById('view');
    const carte = [...v.querySelectorAll('.card')].find((c) => /Courcot Laura/.test(c.textContent) && c.querySelectorAll('.card').length === 0);
    return { txt: v.textContent.replace(/\s+/g, ' '), carte: carte ? carte.textContent.replace(/\s+/g, ' ') : '',
      boutons: carte ? [...carte.querySelectorAll('button')].map((x) => x.textContent.trim()) : [],
      relancerTout: !!v.querySelector('[data-adm="vers-run"]') };
  }, { ledger, vers });
  const L = (o) => Object.assign({ type: 'commission', mollieEncaisse: true, mollieFee: 0, commissionAmount: 14.42, netAmount: 104.5,
    providerName: 'Courcot Laura', serviceName: 'Massage', invNo: '2026-B-0001', reqId: 'rl', complementPayout: 'manuel', complementNet: 104.5 }, o);
  const ligne = { reqId: 'rl', serviceName: 'Massage', providerName: 'Courcot Laura', invNo: '2026-B-0001', net: 104.5, etat: 'expired', parLeSecond: true,
    tente: false, motif: 'HTTP 404, Payment not found', iban: 'FR7614006000390109220400700', ibanTitulaire: 'Laura Courcot', org: 'oui' };
  let r = await ecran([L({ molliePayout: 'unrouted' })], { loaded: true, list: [ligne] });
  ok(/Dû aux prestataires/.test(r.txt), 'témoin : registre encore « unrouted », le bandeau compte la dette (état d’avant)');
  ok(/rien n’est dû|Rien à verser sur celle-ci/.test(r.carte), 'la carte dit qu’il n’y a rien à verser');
  ok(!/jamais été tenté|Réponse de Mollie|Le partage fonctionne|IBAN du prestataire/.test(r.carte), 'et plus rien qui le contredise (ni « jamais tenté », ni 404, ni IBAN) : « ' + r.carte.slice(0, 120) + ' »');
  ok(!r.boutons.some((x) => /Réessayer|versé à la main/.test(x)) && !r.relancerTout, 'aucun bouton pour verser ce qui n’est pas dû (' + r.boutons.join(' | ') + ')');
  r = await ecran([L({ molliePayout: 'sans-objet' })], { loaded: true, list: [], sansObjet: 1 });
  ok(!/Dû aux prestataires/.test(r.txt), 'une fois « sans-objet » écrit : plus de dette au bandeau');
  ok(/1 empreinte expirée, prestation réglée par le second paiement/.test(r.txt), 'la carte des versements dit ce qu’elle a rangé');
  ok(/Commissions encaissées/.test(r.txt) && /14,42/.test(r.txt), 'la commission reste dans les comptes');
  ok(!/calqués sur Mollie/.test(r.txt), 'plus de bandeau qui explique le calcul sans geste à faire (l’éditeur, 24/11/2026)');
  r = await ecran([L({ molliePayout: 'sans-objet', complementPayout: 'unrouted' })], { loaded: true, list: [] });
  ok(/Dû aux prestataires/.test(r.txt) && /104,50/.test(r.txt), 'si c’est le second paiement qui n’est pas versé, la dette reste, sur LUI');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 160) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
