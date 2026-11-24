/* « RÉGLER MAINTENANT » (l'éditeur, 23/11/2026). Quand le prélèvement automatique n'a pas
   pu encaisser un supplément — ou toute la prestation, l'empreinte ayant expiré —, le
   client règle lui-même : le paiement s'ouvre sur le moment (3-D Secure). */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = { headless: true };
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RELP = require(path.join(RACINE, 'functions', 'relance-paiement.js'));
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

(async () => {
console.log('A — le serveur relit tout avant d’ouvrir un paiement');
const i = SRV.indexOf('exports.reglerReste = onCall(');
const src = i >= 0 ? SRV.slice(i, SRV.indexOf('\n});\n', i) + 4) : '';
const appel = async (doc, data, mollie) => {
  const ecrits = []; const crees = [];
  const db = { collection: (c) => ({ doc: (id) => ({
    get: async () => ({ exists: c === 'requests' ? !!doc : true, data: () => (c === 'requests' ? doc : { mollieCustomerId: 'cst_1' }) }),
    set: async (v) => ecrits.push(v) }) }) };
  let fn = null;
  try { fn = src ? new Function('onCall', 'HttpsError', 'getFirestore', 'mollieApiConfigured', 'mollieApi', 'montantsDemande', 'round2', 'RELP', 'APP_URL', 'PRODUIT', 'console',
    'return ' + src.replace(/^exports\.reglerReste = /, '').replace(/;\n$/, ''))((o2, f2) => f2, HttpsError, () => db, () => true,
    async (url, meth, body) => { if (meth === 'POST') { crees.push(body); return { ok: true, data: { id: 'tr_new', _links: { checkout: { href: 'https://mollie/x' } } } }; }
      return mollie || { ok: true, data: { status: 'failed' } }; },
    () => ({ gross: 140 }), (x) => Math.round(x * 100) / 100, RELP, 'https://ti-services.fr', 'ti-services', { log() {}, warn() {} }) : null; } catch (e) { fn = null; }
  if (!fn) return { err: 'absente', ecrits, crees };
  try { return { ok: await fn({ auth: { uid: 'c1' }, data }), ecrits, crees }; } catch (e) { return { err: e.code || String(e), ecrits, crees }; }
};
const du = { clientUid: 'c1', complementStatus: 'echec', complementAmount: 140, serviceName: 'Ménage', complementRefusBanque: true };
let r = await appel(du, { reqId: 'r1' });
ok(r.ok && r.ok.checkoutUrl === 'https://mollie/x' && r.crees.length === 1, 'un montant dû : un paiement s’ouvre, et c’est tout');
ok(r.crees[0] && r.crees[0].amount.value === '140.00' && r.crees[0].method === 'creditcard' && r.crees[0].metadata.kind === 'complement' && !r.crees[0].sequenceType && !r.crees[0].mandateId,
  'le montant du document, par carte, avec 3-D Secure (jamais le mandat), rangé comme un second paiement');
ok(r.ecrits.some((w) => w.complementStatus === 'a_regler' && w.complementPaymentId === 'tr_new'), 'la demande retient ce paiement');
r = await appel(Object.assign({}, du, { clientUid: 'autre' }), { reqId: 'r1' });
ok(r.err === 'permission-denied' && r.crees.length === 0, 'la demande d’un autre : refusé');
r = await appel(Object.assign({}, du, { complementStatus: 'paye' }), { reqId: 'r1' });
ok(r.err === 'failed-precondition' && r.crees.length === 0, 'rien de dû : rien ne s’ouvre');
r = await appel(Object.assign({}, du, { complementAmount: 500 }), { reqId: 'r1' });
ok(r.err === 'failed-precondition' && r.crees.length === 0, 'au-delà du total de la prestation : refusé');
r = await appel(Object.assign({}, du, { refusCarteIds: ['a', 'b', 'c'] }), { reqId: 'r1' });
ok(r.err === 'resource-exhausted' && r.crees.length === 0, 'trois refus de la banque : plus de tentative');
r = await appel(Object.assign({}, du, { complementPaymentId: 'tr_old' }), { reqId: 'r1' }, { ok: true, data: { status: 'paid' } });
ok(r.ok && r.ok.deja === true && r.crees.length === 0, 'déjà payé chez Mollie (webhook perdu) : jamais un second paiement');
r = await appel(Object.assign({}, du, { complementStatus: 'a_regler', complementPaymentId: 'tr_open' }), { reqId: 'r1' }, { ok: true, data: { status: 'open', _links: { checkout: { href: 'https://mollie/open' } } } });
ok(r.ok && r.ok.checkoutUrl === 'https://mollie/open' && r.crees.length === 0, 'un paiement encore ouvert : on le resert, on n’en crée pas un autre');
ok(/if \(refusB\) await noterRefusCarte\(ref, pay\);/.test(SRV), 'un refus sur ce paiement compte dans les trois de la commande');

console.log('B — à l’écran');
const b = await chromium.launch(o);
const p = await b.newPage({ viewport: { width: 393, height: 1400 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.route('**/*', (rq) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(rq.request().url()) ? rq.abort() : rq.continue());
await p.goto(INDEX, { waitUntil: 'load' }); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);
const detail = (rr) => p.evaluate((rr) => {
  document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
  const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.mission = null; S.draft = null;
  S.account = { name: 'Cécile Martinez', email: 'c@e.fr', uid: 'c1', role: 'client' };
  const h = { reqId: 'r1', svc: 'menage', svcName: 'Ménage', dateISO: '2026-11-25', when: 'mer. 25 nov.', slot: '09:00', unit: 'h', duration: 4, rate: 28, total: 112, provider: { nm: 'Karla Barbosa' }, zone: 'Toiny', invNo: '2026-AB-0012', status: 'paid' };
  S.detail = { h, r: rr, det: {}, side: 'client', loaded: true }; window.__render();
  const v = document.getElementById('view');
  const bt = v.querySelector('[data-act^="regler-reste:"]'); const fac = v.querySelector('[data-act="detail-inv"]');
  return { txt: v.textContent.replace(/\s+/g, ' '), bouton: bt ? bt.getAttribute('data-act') : '', facture: fac ? fac.className : '',
    deborde: Math.max(...[...v.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - window.innerWidth)) };
}, rr);
const base = { reqId: 'r1', dateISO: '2026-11-25', slot: '09:00', unit: 'h', duration: 4, providerName: 'Karla Barbosa', molliePaymentId: 'tr_x' };
const d1 = await detail(Object.assign({}, base, { complementStatus: 'echec', complementAmount: 140, complementRefusBanque: true }));
ok(/Reste à régler/.test(d1.txt) && !/Total réglé/.test(d1.txt), 'dû : « Reste à régler », plus jamais « Total réglé » (' + d1.txt.slice(d1.txt.indexOf('Montant'), d1.txt.indexOf('Montant') + 60) + ')');
ok(/Votre banque a refusé le prélèvement\./.test(d1.txt) && /3-D Secure/.test(d1.txt), 'il dit pourquoi, et que la banque protège le paiement');
ok(d1.bouton === 'regler-reste:r1' && / ghost/.test(' ' + d1.facture), '« Régler maintenant » est le geste principal, « Voir ma facture » passe en second');
ok(!/Encaissement non confirmé/.test(d1.txt), 'et la mention « Encaissement non confirmé » ne s’ajoute plus');
ok(d1.deborde <= 0, 'à 393 px, rien ne déborde (' + Math.round(d1.deborde) + ' px)');
const d2 = await detail(Object.assign({}, base, { mollieCaptured: true, mollieCaptureAmount: 112 }));
ok(/Total réglé/.test(d2.txt) && !d2.bouton && /primary/.test(d2.facture), 'rien de dû : l’écran d’hier, inchangé');

const acc = await p.evaluate(async () => {
  window.__appels = [];
  window.__setFB({ auth: { currentUser: { uid: 'c1', email: 'c@e.fr' } }, db: {}, functions: {},
    f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
      collection: () => ({}), where: () => ({}), query: () => ({}),
      getDocs: () => Promise.resolve({ forEach: (cb) => [{ id: 'r1', data: () => ({ serviceName: 'Ménage', service: 'menage', when: 'mer. 25 nov.', providerName: 'Karla Barbosa', complementStatus: 'echec', complementAmount: 140 }) },
        { id: 'r2', data: () => ({ serviceName: 'Ménage', complementStatus: 'paye', complementAmount: 30 }) }].forEach(cb) }) },
    fn: { httpsCallable: (_f, nom) => (data) => { window.__appels.push({ nom, data }); return Promise.resolve({ data: { deja: true } }); } } });
  const S = window.__S; S.detail = null; S.clientNav = 'home'; S._resteDuLu = false; S.resteDu = null; window.__render();
  await new Promise((r) => setTimeout(r, 60));
  const v = document.getElementById('view'); const ban = v.querySelector('.regler-bandeau');
  const avant = { existe: !!ban, n: v.querySelectorAll('.regler-bandeau').length, txt: ban ? ban.textContent.replace(/\s+/g, ' ') : '' };
  const bt = ban && ban.querySelector('[data-act="regler-reste:r1"]'); if (bt) bt.click();
  await new Promise((r) => setTimeout(r, 60));
  return { avant, appels: window.__appels, apres: document.querySelectorAll('.regler-bandeau').length, toast: document.getElementById('toast').textContent };
});
ok(acc.avant.existe && acc.avant.n === 1 && /Un règlement reste à faire/.test(acc.avant.txt) && /140,00/.test(acc.avant.txt),
  'l’accueil montre ce qui est dû, et seulement cela (« ' + acc.avant.txt.slice(0, 90) + ' »)');
ok(acc.appels.length === 1 && acc.appels[0].nom === 'reglerReste' && acc.appels[0].data.reqId === 'r1', 'le bouton appelle le serveur pour CETTE prestation');
ok(acc.apres === 0 && /Déjà réglé/.test(acc.toast), 'déjà réglé : le bandeau s’en va et c’est dit');
const cap = await p.evaluate(async () => {
  window.__setFB(Object.assign({}, { auth: { currentUser: { uid: 'c1' } }, db: {}, functions: {}, f: {},
    fn: { httpsCallable: () => () => Promise.reject({ code: 'functions/resource-exhausted' }) } }));
  const bt = document.createElement('button'); bt.setAttribute('data-act', 'regler-reste:r1'); document.body.appendChild(bt); bt.click();
  await new Promise((r) => setTimeout(r, 60)); bt.remove(); return document.getElementById('toast').textContent;
});
ok(/Ajoutez une autre carte dans Profil → Moyen de paiement/.test(cap) && !/repassez la commande/.test(cap), 'au plafond, il lit le seul geste qui règle une prestation déjà faite (« ' + cap + ' »)');
ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 140) + ')');
await b.close();
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
