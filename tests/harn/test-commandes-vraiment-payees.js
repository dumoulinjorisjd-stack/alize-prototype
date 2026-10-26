/* « Il y a beaucoup de commandes réglées alors que c'était des tests, ça n'a même jamais
   été payé. Il faudrait un rapprochement par rapport à Mollie. »

   EXACT, ET LA CONSOLE LE SAVAIT DÉJÀ AILLEURS. Le registre des factures écarte depuis
   toujours ce que Mollie n'a pas encaissé — `mollieEncaisse`, « vrai UNIQUEMENT si Mollie
   dit paid ; c'est ce champ, et lui seul, qui fait entrer une prestation dans la
   comptabilité ». Mais « Toutes les commandes » range sur le STATUT APPLICATIF, qui dit
   « réglée » dès que le parcours est allé au bout, qu'un euro ait bougé ou non. Deux
   surfaces du même compte, deux vérités.

   ON NE CACHE RIEN, ON DIT. Cet écran promet que rien n'est coupé : une commande qui
   disparaîtrait serait pire que le chiffre qu'on corrige.

   Mollie n'est pas joignable depuis le harnais, et il n'a pas à l'être : le rapprochement
   se fait sur le registre que la console charge DÉJÀ. Aucune lecture de plus. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright-core');
const { codeNu } = require('./lib-code-nu.js');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* ── LE NOYAU, DANS UN BAC À SABLE VIDE ─────────────────────────────────────────────── */
const i0 = app.indexOf("const ENCAISSEMENT_ETATS");
const i1 = app.indexOf("  /* LES STATUTS OÙ L'ARGENT", i0);
const source = app.slice(i0, i1);
// ASSERTION ARRIÈRE : un relevé vide satisferait toutes les gardes de pureté.
ok(i0 > 0 && i1 > i0 && /function encaissementTotaux/.test(source),
  'le noyau se relève (sinon rien n’est mesuré)');
const nu = codeNu(source);
['Date', 'Math.random', 'fetch', 'document', 'window', 'eur('].forEach((m) => {
  ok(nu.indexOf(m) < 0, 'il n’emploie pas ' + m);
});
// `\bS\.` et non la sous-chaîne « S. » : ENCAISSEMENT_ETATS.forEach en contient une.
ok(!/\bS\./.test(nu), 'il ne lit pas l’état de l’application');
const bac = {}; vm.createContext(bac);
new vm.Script(source + '\nthis.C = commandeEncaissement; this.T = encaissementTotaux;').runInContext(bac);
const C = bac.C, T = bac.T;

console.log('A — le registre fait foi, pas le statut applicatif');
ok(C({ auRegistre: true, encaisse: true }) === 'encaisse', 'Mollie dit payé → encaissée');
ok(C({ auRegistre: true, encaisse: false }) === 'jamais',
  'le registre existe et dit non → jamais encaissée, c’est le cas signalé');
ok(C({ auRegistre: false, encaisse: false }) === 'inconnu',
  'aucune écriture au registre → inconnu, pas « jamais »');
ok(C({ auRegistre: false, encaisse: true }) === 'inconnu',
  'et sans registre on ne se fie pas davantage à un « encaissé » venu d’ailleurs');
ok(C({}) === 'inconnu' && C(null) === 'inconnu', 'une entrée vide ne lève pas et ne conclut rien');

console.log('B — l’addition se refait de tête');
const t = T([
  { total: 120, enc: { auRegistre: true, encaisse: true } },
  { total: 150, enc: { auRegistre: true, encaisse: true } },
  { total: 90, enc: { auRegistre: true, encaisse: false } },
  { total: 60, enc: { auRegistre: false } },
]);
ok(t.encaisse.n === 2 && t.encaisse.total === 270, 'les encaissées (' + t.encaisse.total + ')');
ok(t.jamais.n === 1 && t.jamais.total === 90, 'les jamais encaissées (' + t.jamais.total + ')');
ok(t.inconnu.n === 1 && t.inconnu.total === 60, 'et celles qu’on ne sait pas (' + t.inconnu.total + ')');
ok(t.encaisse.total + t.jamais.total + t.inconnu.total === 420,
  'les trois retombent sur le total du groupe');

/* ── CE QUE L'ÉCRAN EN FAIT ─────────────────────────────────────────────────────────── */
(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const rendre = (avecTests) => p.evaluate((avecTests) => {
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'a@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.demoMode = false; S.persona = 'admin'; S.mission = null;
    S.account = { name: 'Admin', email: 'a@x.c', uid: 'adm', role: 'admin' };
    S.admin = { view: 'home', sel: null, fact: null };
    const req = (id, st, tot, svc) => ({ id: id, status: st, uid: 'cli1', at: Date.now() - 86400000,
      svc: svc, svcName: svc, when: 'lun. 12', slot: '09:00', zone: 'Gustavia', total: tot,
      unit: 'h', duration: 2, client: 'Joris', provider: 'Laure', providerUid: 'pro1',
      directed: false, boostEur: 0, fin: 0, tardive: false, frais: 0, decision: '', parQui: '', diff: null });
    const led = (reqId, enc, st) => ({ id: reqId, reqId: reqId, invNo: 'F' + reqId,
      molliePaymentId: 'tr_' + reqId, providerUid: 'pro1', clientUid: 'cli1', dateISO: '2026-10-20',
      clientName: 'Joris', providerName: 'Laure', service: 'menage', serviceName: 'Ménage',
      commissionAmount: 10, netAmount: 50, grossTotal: 100, base: 100, exclu: false,
      mollieStatus: st, mollieEncaisse: enc, mollieVerifie: true });
    S.adminReqs = [req('r1', 'paid', 120, 'menage'), req('r2', 'paid', 150, 'menage'),
      req('c1', 'cancelled', 70, 'menage')];
    S.adminLedger = [led('r1', true, 'paid'), led('r2', true, 'paid')];
    if (avecTests) {
      S.adminReqs = S.adminReqs.concat([req('t1', 'paid', 90, 'menage'), req('t2', 'paid', 80, 'menage')]);
      S.adminLedger = S.adminLedger.concat([led('t1', false, 'authorized'), led('t2', false, 'expired')]);
    }
    S.adminReqsLus = true;
    S._fold = { 'a-cmd-toutes': true }; S._admCmdStat = { paid: true, cancelled: true };
    S._admCmdMet = { 'paid|menage': true };
    let leve = ''; try { window.__render(); } catch (e) { leve = e.message || String(e); }
    const v = document.getElementById('view');
    const txt = (v.textContent || '').replace(/\s+/g, ' ');
    /* ON LIT LA CARTE, PAS UNE TRANCHE DE TEXTE : une fenêtre de N caractères mord sur
       le groupe suivant, et l'épreuve accuse alors une carte parfaitement muette. */
    const carte = (st) => { const e = v.querySelector('[data-adm="cmdstat:' + st + '"]');
      return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
    return { leve: leve, txt: txt, bloc: carte('paid'), annulees: carte('cancelled') };
  }, avecTests);

  console.log('C — ce qui est réellement entré est dit, sous le total');
  const A = await rendre(true);
  ok(!A.leve, 'l’écran se dessine sans lever' + (A.leve ? ' (' + A.leve + ')' : ''));
  ok(/Réglées 440,00 € 4/.test(A.bloc), 'le total du groupe ne bouge pas : rien n’est coupé');
  ok(/270,00 € réellement encaissé/.test(A.bloc), 'ce que Mollie a encaissé est nommé');
  ok(/2 jamais encaissées \(170,00 €\)/.test(A.bloc), 'et ce qui ne l’a jamais été aussi');
  ok(270 + 170 === 440, 'les deux retombent sur le total affiché');

  console.log('D — la ligne porte l’état que Mollie a répondu');
  ok(/Empreinte autorisée, jamais débitée/.test(A.txt),
    'une empreinte jamais capturée le dit sur sa ligne');
  ok(/Autorisation expirée/.test(A.txt), 'une autorisation expirée aussi');

  console.log('E — et rien là où il n’y a rien à dire');
  ok(A.annulees.length > 0 && !/encaissé/.test(A.annulees),
    'une commande annulée ne reçoit aucune mention d’encaissement (' + A.annulees + ')');
  const B = await rendre(false);
  ok(!B.leve, 'un parc entièrement encaissé se dessine sans lever');
  ok(/Réglées 270,00 € 2/.test(B.bloc), 'son total est le bon');
  ok(!/réellement encaissé/.test(B.bloc),
    'et SA carte ne dit rien : un groupe sans écart n’a rien à ajouter');
  ok(!/Empreinte autorisée/.test(B.txt), 'aucune ligne n’est marquée');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
