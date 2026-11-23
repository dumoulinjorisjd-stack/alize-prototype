/* « POUR LE PAIEMENT PAR CARTE IL FAUT ÊTRE SÛR DE CE QUE TU FAIS. IL NE FAUT PAS QUE
   L'ON SOIT BLOQUÉ PAR UNE SÉRIE DE PAIEMENTS REFUSÉS » (l'éditeur, 23/11/2026).
   1. Après un refus de la banque, plus aucun prélèvement automatique : un seul lien.
   2. Un seul lien de paiement en attente à la fois.
   3. Au plus trois refus de la banque par commande. */
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
let RELP = null; try { RELP = require(path.join(RACINE, 'functions', 'relance-paiement.js')); } catch (_) {}
const bloc = (debut) => { const i = SRV.indexOf(debut); return i >= 0 ? SRV.slice(i, SRV.indexOf('\n}\n', i) + 2) : ''; };

(async () => {
console.log('A — la règle');
if (RELP) {
  const D = RELP.relanceDecider;
  ok(D({ statut: 'echec', refusBanque: true, mandatRefuse: 'mdt_A', mandatActuel: 'mdt_A' }).geste === 'lien', 'refus de la banque, même carte : un lien, pas de prélèvement');
  ok(D({ statut: 'echec', refusBanque: true, mandatRefuse: 'mdt_A', mandatActuel: 'mdt_A', lienApresRefus: true }).geste === 'rien', 'et une seule fois');
  ok(D({ statut: 'echec', refusBanque: true, mandatRefuse: 'mdt_A', mandatActuel: 'mdt_B' }).geste === 'prelever', 'une AUTRE carte enregistrée depuis : on peut prélever');
  ok(D({ statut: 'echec', refusBanque: true, mandatRefuse: 'mdt_A', mandatActuel: '' }).geste === 'lien', 'plus de carte du tout : un lien');
  ok(D({ statut: 'a_regler', lienOuvert: true }).geste === 'rien', 'un lien encore ouvert : on n’en crée pas d’autre');
  ok(D({ statut: 'impossible' }).geste === 'prelever', 'sans refus (aucune carte hier) : on retente, comme avant');
  ok(RELP.REFUS_CARTE_MAX === 3 && RELP.tentativeCarteAdmise(['a', 'b']) && !RELP.tentativeCarteAdmise(['a', 'b', 'c'])
    && RELP.tentativeCarteAdmise(['a', 'a', 'b', 'b']), 'trois refus distincts arrêtent la commande (un même paiement vu deux fois compte une fois)');
} else ok(false, 'le module relance-paiement existe');

console.log('B — le passage du matin, rejoué trois matins de suite');
{ const src = bloc('async function relancerComplements(');
  const docs = {
    refuse: { clientUid: 'c1', complementStatus: 'echec', complementAmount: 20, complementRefusBanque: true, complementRefusMandat: 'mdt_A' },
    ouvert: { clientUid: 'c1', complementStatus: 'a_regler', complementAmount: 10, complementPaymentId: 'tr_open' },
    sansCarte: { clientUid: 'c1', complementStatus: 'impossible', complementAmount: 5 },
    autreCarte: { clientUid: 'c2', complementStatus: 'echec', complementAmount: 15, complementRefusBanque: true, complementRefusMandat: 'mdt_OLD' },
  };
  const prelevements = [];
  const mandats = { c1: 'mdt_A', c2: 'mdt_NEW' };
  const db = { collection: () => ({ where: (k, op, v) => ({ where: (k2, op2, sts) => ({ get: async () => ({
    docs: Object.keys(docs).filter((id) => docs[id].clientUid === v && sts.indexOf(docs[id].complementStatus) >= 0)
      .map((id) => ({ id, data: () => docs[id], ref: { update: async (u) => { Object.assign(docs[id], u); } } })) }) }) }) }) };
  let relancer = null;
  try { relancer = src ? new Function('mollieApiConfigured', 'mandatDuClient', 'mollieApi', 'mollieChargeComplement', 'montantsDemande', 'round2', 'RELP', 'console',
    src + '\nreturn relancerComplements;')(() => true,
    async (db, uid) => ({ lu: true, mandat: mandats[uid] ? { id: mandats[uid], statut: 'valid' } : null }),
    async (url) => ({ ok: true, data: { status: /tr_open/.test(url) ? 'open' : 'expired' } }),
    async (db, reqId, uid, montant, label, plafond, opts) => { const lien = !!(opts && opts.lienSeul);
      prelevements.push({ reqId, lien }); return { ok: true, direct: !lien && !!mandats[uid], paymentId: 'tr_' + prelevements.length, checkoutUrl: lien ? 'https://x' : '' }; },
    () => ({ gross: 100 }), (x) => Math.round(x * 100) / 100, RELP, { log() {}, warn() {} }) : null; } catch (e) { relancer = null; }
  if (relancer) {
    for (let jour = 0; jour < 3; jour++) {
      await relancer(db, 'c1'); await relancer(db, 'c2');
      // Le lien d'après-refus expire chaque nuit sans être payé : le webhook le remet « en échec ».
      if (docs.refuse.complementStatus === 'a_regler') docs.refuse.complementStatus = 'echec';
    }
  }
  const de = (id) => prelevements.filter((x) => x.reqId === id);
  ok(relancer && de('refuse').length === 1 && de('refuse')[0].lien === true,
    'refusé par la banque : en trois matins, UN lien et aucun prélèvement par le mandat (' + JSON.stringify(de('refuse')) + ')');
  ok(relancer && de('ouvert').length === 0, 'un lien encore ouvert n’est jamais doublé');
  ok(relancer && de('sansCarte').length >= 1 && de('sansCarte').every((x) => !x.lien), 'sans refus, le rattrapage d’hier continue (carte enregistrée depuis)');
  ok(relancer && de('autreCarte').length >= 1 && de('autreCarte')[0].lien === false && docs.autreCarte.complementRefusBanque === false,
    'une autre carte depuis le refus : un prélèvement, et le refus d’hier est levé'); }

console.log('C — les refus d’une commande se comptent, sans doublon ni résurrection');
{ const src = bloc('async function noterRefusCarte(');
  let noter = null;
  try { noter = src ? new Function('FieldValue', 'console', src + '\nreturn noterRefusCarte;')({ arrayUnion: (x) => ({ union: x }) }, { warn() {} }) : null; } catch (_) {}
  const ecrits = [];
  const ref = (existe) => ({ get: async () => ({ exists: existe }), set: async (v) => ecrits.push(v) });
  if (noter) { await noter(ref(true), { id: 'tr_1', status: 'failed' }); await noter(ref(true), { id: 'tr_2', status: 'canceled' }); await noter(ref(false), { id: 'tr_3', status: 'failed' }); }
  ok(noter && ecrits.length === 1 && ecrits[0].refusCarteIds.union === 'tr_1', 'seul un refus (failed) se compte ; abandonné ne compte pas ; une demande supprimée ne renaît pas');
  const n = (SRV.match(/await noterRefusCarte\(/g) || []).length;
  ok(n === 4, 'les quatre endroits qui constatent un échec de paiement de commande le comptent (' + n + ')');
  const cp = bloc('exports.createClientPayment = onCall(').slice(0, 30000);
  const iCap = cp.indexOf('RELP.tentativeCarteAdmise(r.refusCarteIds)'), iMollie = cp.indexOf("mollieApi('/payments', 'POST'");
  ok(iCap > 0 && iMollie > iCap && /throw new HttpsError\('resource-exhausted'/.test(cp), 'au-delà de trois refus, la commande ne crée plus aucun paiement');
  const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
  ok(/'refusCarteIds','complementRefusBanque','complementRefusMandat','complementRefusAt','complementLienApresRefus',/.test(rules), 'un compte ne peut pas effacer ses refus (règles)');
  ok(/complementRefusBanque: true,\s*complementRefusMandat: String\(pay\.mandateId \|\| ''\)/.test(SRV) && /const refusB = pay\.status === 'failed';/.test(SRV),
    'le webhook d’un supplément refusé note le refus et la carte refusée'); }

console.log('D — à l’écran : le client lit le geste qui reste');
const b = await chromium.launch(o);
const p = await b.newPage({ viewport: { width: 393, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
await p.goto(INDEX, { waitUntil: 'load' }); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);
const essai = (lang) => p.evaluate(async (lang) => {
  window.__setFB({ auth: { currentUser: { uid: 'c1', email: 'c@e.fr' } }, db: {}, functions: {},
    f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
    fn: { httpsCallable: (_f, nom) => () => nom === 'createClientPayment' ? Promise.reject({ code: 'functions/resource-exhausted', message: 'x' }) : new Promise(() => {}) } });
  const S = window.__S; S.lang = lang; S.persona = 'client'; S.onboarded = true; S.guest = false; S.demoMode = false; S._payPlafond = null;
  S.mission = { reqId: 'r1', _id: 'm1', svc: 'menage', status: 'payment_failed', dateISO: '2030-01-10', slot: '09:00', duration: 4, rate: 28 };
  const bt = document.createElement('button'); bt.setAttribute('data-act', 'resume-pay'); document.body.appendChild(bt);
  const vus = []; const t = document.getElementById('toast');
  const obs = new MutationObserver(() => vus.push(t.textContent)); obs.observe(t, { childList: true, characterData: true, subtree: true });
  bt.click(); await new Promise((r) => setTimeout(r, 150)); obs.disconnect(); bt.remove();
  return { dernier: t.textContent, vus, statut: S.mission.status };
}, lang);
const fr = await essai('fr');
ok(/Votre banque a refusé ce paiement 3 fois\. Contactez-la, ou repassez la commande avec une autre carte\./.test(fr.dernier) && fr.statut === 'payment_failed',
  'le client lit pourquoi, et quoi faire (« ' + fr.dernier + ' »)');
ok(!fr.vus.some((x) => /réessayez/.test(x)), 'et on ne lui dit jamais « réessayez »');
const en = await essai('en');
ok(/Your bank has declined this payment three times/.test(en.dernier), 'en anglais aussi (« ' + en.dernier + ' »)');
const pt = await essai('pt');
ok(/O seu banco recusou este pagamento 3 vezes/.test(pt.dernier), 'et en portugais');
ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 140) + ')');
await b.close();
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
