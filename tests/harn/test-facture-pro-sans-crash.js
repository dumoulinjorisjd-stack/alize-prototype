/* « QUAND LE PRESTATAIRE OUVRE UNE FACTURE, LE BOUTON RETOUR N'EXISTE PAS. »

   Il existe : `<button class="reset" data-act="close-invoice">← Retour</button>`, et il
   n'est masqué que sur Android, qui a son bouton matériel. S'il n'était pas là, c'est
   que L'ÉCRAN ENTIER ne s'était pas dessiné.

   LA CAUSE : `eur()` appelait `toLocaleString` sur ce qu'on lui donnait. La ligne
   d'historique d'une INDEMNITÉ D'ANNULATION n'a pas de tarif horaire — il n'y en a pas,
   c'est une indemnité — et la facture imprimait `eur(h.rate)`. La valeur absente levait,
   et comme l'écran est fabriqué d'une seule traite, rien ne paraissait : ni titre, ni
   bouton. La personne voyait l'écran précédent, sans recours. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1300 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const facture = (ligne) => p.evaluate((ligne) => {
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.demoMode = false; S.persona = 'pro';
    S.proStatus = 'approved'; S.proNav = 'earnings'; S.proName = 'Laure M.';
    S.proLegal = 'Laure M.'; S.proAddress = 'Gustavia'; S.proSiret = '123'; S.proStatusType = 'entreprise';
    S.account = { name: 'Laure M.', email: 'p@x.c', uid: 'pro1', role: 'artisan' };
    S.mission = null; S.proMissions = [];
    S.proHistory = [ligne]; S.invoiceId = ligne.id;
    let leve = '';
    try { window.__render(); } catch (e) { leve = e.message || String(e); }
    const v = document.getElementById('view');
    const bt = v.querySelector('[data-act="close-invoice"]');
    const r = bt ? bt.getBoundingClientRect() : null;
    return { leve: leve, bouton: !!bt,
      cliquable: r ? (function () { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(e && e.closest && e.closest('[data-act="close-invoice"]')); })() : false,
      txt: (v.textContent || '').replace(/\s+/g, ' ') };
  }, ligne);

  const AUJ = new Date().toISOString().slice(0, 10);
  const COMMUNE = { id: 'h1', reqId: 'r1', dateISO: AUJ, svc: 'menage', client: 'Joris',
    clientFull: 'Joris D.', clientZone: 'Lorient', duration: 2, unit: 'h', rate: 35,
    amount: 70, commPct: 15, commission: 10.5, net: 59.5, invNo: 'F001', paidVia: 'carte' };
  /* LA LIGNE RÉELLE D'UNE INDEMNITÉ, telle que l'application l'inscrit : ni tarif
     horaire, ni durée — il n'y en a pas. */
  const INDEMNITE = { id: 'cf1', reqId: 'r2', dateISO: AUJ, svc: 'menage', client: 'Joris',
    clientFull: 'Joris D.', clientZone: 'Lorient', cancelFee: true, duration: 0, unit: 'h',
    amount: 35, commPct: 15, commission: 5.25, net: 29.75, invNo: 'IND-1001', paidVia: 'indemnité' };

  console.log('A — une facture ordinaire');
  const A = await facture(COMMUNE);
  ok(!A.leve, 'elle se dessine sans lever' + (A.leve ? ' (' + A.leve + ')' : ''));
  ok(A.bouton && A.cliquable, 'et son bouton « ← Retour » est là, atteignable au doigt');
  ok(/F001/.test(A.txt) && /70,00/.test(A.txt), 'avec son numéro et son montant');

  console.log('B — la facture d’une indemnité d’annulation');
  const B = await facture(INDEMNITE);
  ok(!B.leve, 'elle se dessine sans lever' + (B.leve ? ' (' + B.leve + ')' : ''));
  ok(B.bouton && B.cliquable, 'et SON bouton retour est là aussi : c’est tout l’objet');
  ok(/Indemnité d’annulation tardive|Indemnité d'annulation tardive/.test(B.txt),
    'la ligne dit ce qu’elle est');
  ok(!/0 h/.test(B.txt),
    'et n’invente ni durée ni tarif horaire pour un travail jamais fait');
  ok(/35,00/.test(B.txt), 'le montant de l’indemnité est le bon');

  console.log('C — afficher un montant ne fait jamais tomber un écran');
  const sommes = await p.evaluate(() => {
    const out = {};
    ['rien', 'vide', 'texte', 'nul', 'inf'].forEach(function () {});
    try { out.indefini = window.__eur(undefined); } catch (e) { out.indefini = 'LÈVE'; }
    try { out.nul = window.__eur(null); } catch (e) { out.nul = 'LÈVE'; }
    try { out.texte = window.__eur('bonjour'); } catch (e) { out.texte = 'LÈVE'; }
    try { out.chaine = window.__eur('12.5'); } catch (e) { out.chaine = 'LÈVE'; }
    try { out.nombre = window.__eur(70); } catch (e) { out.nombre = 'LÈVE'; }
    return out;
  });
  ok(sommes.indefini !== 'LÈVE' && sommes.nul !== 'LÈVE' && sommes.texte !== 'LÈVE',
    'une valeur absente ou illisible ne lève pas (' + sommes.indefini + ')');
  ok(/^0,00/.test(sommes.indefini) && /^0,00/.test(sommes.texte),
    'elle vaut zéro et s’affiche, elle ne prend pas la page avec elle');
  ok(/^70,00/.test(sommes.nombre) && /^12,50/.test(sommes.chaine),
    'et les vraies sommes sont rendues comme avant (' + sommes.nombre + ', ' + sommes.chaine + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
