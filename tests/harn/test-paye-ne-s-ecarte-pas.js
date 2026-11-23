/* « J'AI PU LES RÉINTÉGRER, MAIS EST-CE QU'ELLES NE SONT PAS ÉCARTÉES PAR UN BALAYAGE
   AUTOMATIQUE ? » (l'éditeur, 23/11/2026). Aucun balayage n'écarte : trois missions
   payées, libérées et virées à la main étaient sorties des comptes par « C'était un
   essai, écarter », posé sur chaque ligne des versements bloqués. Deux corrections :
   - ce que Mollie a encaissé ne s'écarte plus « comme un essai » (écran ET serveur) ;
   - le rapprochement relève aussi les indemnités d'annulation, que la console compte
     dès qu'elles sont encaissées et qui restaient « hors comptes » pour toujours. */
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
const bloc = (debut, fin) => { const i = SRV.indexOf(debut); return i >= 0 ? SRV.slice(i, SRV.indexOf(fin, i) + fin.length) : ''; };

/* Une base Firestore en mémoire, juste ce qu'il faut. */
function fausseBase(docs) {
  const ecrits = [];
  const docRef = (col, id) => ({
    get: async () => ({ exists: !!(docs[col] && docs[col][id]), data: () => (docs[col] || {})[id] }),
    set: async (v) => { ecrits.push({ col, id, v }); docs[col] = docs[col] || {}; docs[col][id] = Object.assign({}, docs[col][id] || {}, v); },
  });
  return { ecrits, collection: (col) => ({
    doc: (id) => docRef(col, id),
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: Object.keys(docs[col] || {}).map((id) => ({ id, data: () => docs[col][id] })) }) }) }),
  }) };
}
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

(async () => {
console.log('A — ce que Mollie a encaissé ne s’écarte pas « comme un essai »');
{ const src = bloc('exports.ledgerExclude = onCall(', '\n});\n');
  let ledgerExclude = null;
  try { ledgerExclude = src ? new Function('onCall', 'getFirestore', 'HttpsError', 'FieldValue', 'ADMIN_EMAIL', 'console',
    'return ' + src.replace(/^exports\.ledgerExclude = /, '').replace(/;\n$/, ''))((fn) => fn, () => base, HttpsError, { serverTimestamp: () => 'TS' }, 'a@ti.fr', { log() {}, warn() {} }) : null; } catch (e) { ledgerExclude = null; }
  var base = fausseBase({ ledger: { P: { mollieEncaisse: true, invNo: '2026-A-0001' }, T: { mollieEncaisse: false } }, requests: { P: {}, T: {} } });
  const appel = async (data) => { try { return { ok: await ledgerExclude({ auth: { token: { email: 'a@ti.fr' } }, data }) }; } catch (e) { return { err: e.code || String(e) }; } };
  const r1 = ledgerExclude ? await appel({ reqId: 'P', exclu: true, motif: 'essai, versement jamais dû' }) : { err: 'absente' };
  ok(r1.err === 'failed-precondition' && !(base.ecrits.some((w) => w.id === 'P' && w.v.exclu === true)),
    '« C’était un essai » sur une prestation encaissée : refusé, rien n’est écrit (' + JSON.stringify(r1) + ')');
  const r2 = ledgerExclude ? await appel({ reqId: 'P', exclu: true, motif: 'paiement jamais abouti, rien à verser' }) : { err: 'absente' };
  ok(r2.err === 'failed-precondition', '« Paiement jamais abouti » non plus');
  const r3 = ledgerExclude ? await appel({ reqId: 'P', exclu: true }) : { err: 'absente' };
  ok(r3.ok && r3.ok.exclu === true, 'elle s’écarte encore depuis « Retrouver une facture » (sans motif), quand c’est voulu');
  const r4 = ledgerExclude ? await appel({ reqId: 'T', exclu: true, motif: 'essai, versement jamais dû' }) : { err: 'absente' };
  ok(r4.ok && r4.ok.exclu === true, 'un vrai essai, que Mollie n’a pas encaissé, s’écarte comme avant');
  const r5 = ledgerExclude ? await appel({ reqId: 'P', exclu: false }) : { err: 'absente' };
  ok(r5.ok && r5.ok.exclu === false, 'et la réintégration passe toujours'); }

console.log('B — le rapprochement relève aussi les indemnités d’annulation');
{ const src = bloc('const REGISTRE_ENCAISSABLE', 'async function lireRegistre(') ;
  const corps = src ? bloc('const REGISTRE_ENCAISSABLE', '\n}\n') : '';
  let lire = null, ENC = null;
  try { if (corps) { const m = new Function(corps + '\nreturn {lireRegistre, REGISTRE_ENCAISSABLE};')(); lire = m.lireRegistre; ENC = m.REGISTRE_ENCAISSABLE; } } catch (e) { lire = null; }
  const base = fausseBase({ ledger: { A: { type: 'commission' }, 'B-annulation': { type: 'cancel-fee' }, C: {}, D: { type: 'retro' } } });
  const tous = lire ? (await lire(base, 0, ENC)).map((d) => d.id).sort().join() : 'absente';
  const prest = lire ? (await lire(base)).map((d) => d.id).sort().join() : 'absente';
  ok(tous === 'A,B-annulation,C', 'le rapprochement lit prestations ET indemnités (' + tous + ')');
  ok(prest === 'A,C', 'la grille travaillée ne lit que les missions faites (' + prest + ')');
  const n = (SRV.match(/lireRegistre\(db, 0, REGISTRE_ENCAISSABLE\)/g) || []).length;
  ok(n === 4, 'les quatre lectures de rapprochement (bouton, compte, relevé du matin, alerte) prennent les deux (' + n + ')');
  ok(/for \(const d of await lireRegistre\(db\)\)/.test(bloc('async function rattraperGrilleTravaillee(', '\n}\n')), 'la grille travaillée reste sur les missions');
  // L'écriture d'une indemnité n'a pas de demande à son nom : on n'en crée pas une fausse.
  const rmf = bloc('async function recordMollieFee(', '\n}\n');
  ok(/if \(patch\.mollieFee != null && demandeExiste\)/.test(rmf) && /demandeExiste = rq\.exists;/.test(rmf),
    'les frais ne se recopient que sur une demande qui existe (pas de fausse demande « …-annulation »)'); }

console.log('C — à l’écran : pas de « C’était un essai » sur une ligne encaissée');
const b = await chromium.launch(o);
const p = await (await b.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 2400 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
await p.goto(INDEX, { waitUntil: 'load' }); await p.waitForTimeout(1400);
const r = await p.evaluate(() => {
  const S = window.__S;
  S.onboarded = true; S.guest = false; S.persona = 'admin'; S.lang = 'fr'; S.demoMode = false; S.mission = null;
  S.admin = { view: 'fact', sel: null, fact: null, factQ: '' }; S._fold = { 'f-vers': true };
  const l = (id, extra) => Object.assign({ reqId: id, serviceName: 'Ménage', providerName: 'Lydie', net: 66, invNo: '2026-A-000' + id.length, etat: '' }, extra);
  S.adminOrph = { loaded: true, list: [] }; S.adminLedger = [];
  S.adminVers = { loaded: true, list: [l('payee', { etat: 'paid' }), l('liberee', { etat: 'paid', libere: true, definitif: true }),
    l('parlesecond', { etat: 'expired', parLeSecond: true }), l('inconnue', { etat: '' }), l('jamais', { etat: 'expired' })] };
  window.__render();
  const a = (id) => !!document.querySelector('[data-adm="vers-essai:' + id + '"]');
  window.__dbg = [...document.querySelectorAll('[data-adm^="vers-essai:"]')].map((e) => e.getAttribute('data-adm')).join();
  return { dbg: window.__dbg, payee: a('payee'), liberee: a('liberee'), parlesecond: a('parlesecond'), inconnue: a('inconnue'), jamais: a('jamais'),
    main: document.querySelectorAll('[data-adm^="vers-main:"]').length };
});
ok(!r.payee && !r.liberee && !r.parlesecond, 'payée, libérée ou réglée par le second paiement : le bouton n’y est plus (' + r.dbg + ')');
ok(r.inconnue && r.jamais, 'un état inconnu ou jamais abouti le garde (un essai reste écartable)');
ok(r.main === 5, '« Je l’ai versé à la main » reste sur chaque ligne');
ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 140) + ')');
await b.close();
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
