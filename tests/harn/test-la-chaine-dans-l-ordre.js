/* LA CHAÎNE, DANS L'ORDRE, ET MESURÉE À CHAQUE MAILLON.

   « Un service est demandé, un nouvel intervenant s'inscrit APRÈS la demande, il n'a pas
   encore commencé Mollie, il voit quand même la demande et peut y répondre ? Il fera plus
   tard son inscription Mollie et sera payé. »

   Sept maillons. Cinq se DÉROULENT ici, dans un navigateur, avec le vrai code de
   l'application ; deux sont côté serveur et se LISENT dans la source, parce qu'aucun banc
   ne fait tourner les fonctions Firebase ni n'appelle Mollie. Ce qui est lu est dit comme
   tel — une chaîne dont un maillon serait supposé ne vaudrait rien. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const HIER = Date.now() - 36 * 3600000;   // la demande existe depuis hier
const AUJ = Date.now();                   // il s'inscrit aujourd'hui

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__fil);

  /* ── 1 & 2 & 3 — la demande existe depuis HIER ; il s'inscrit AUJOURD'HUI, sans Mollie.
     On monte exactement cette situation, puis on laisse le VRAI fil des missions tourner :
     `FB.f.onSnapshot` est intercepté pour lui remettre un instantané contenant la demande
     d'hier, et c'est le code de l'application qui filtre, pas l'épreuve. */
  const vu = await p.evaluate(({ HIER, AUJ }) => {
    let capte = null;
    window.__setFB({
      auth: { currentUser: { uid: 'pro-neuf', email: 'neuf@e.fr' } }, db: {},
      f: {
        doc: (db, col, id) => ({ col: col, id: id }),
        collection: () => ({}), query: () => ({}), where: () => ({}),
        onSnapshot: (q, cb) => { capte = cb; return () => {}; },
        updateDoc: (ref, patch) => { (window.__ecrites = window.__ecrites || []).push({ col: ref.col, id: ref.id, patch: patch }); return Promise.resolve(); },
        setDoc: () => Promise.resolve(),
        getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
        serverTimestamp: () => 'ts',
      },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {},
    });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro';
    S.proNav = 'home'; S.mission = null; S.proCats = ['menage']; S.proOnline = true;
    S.proStatus = 'valide'; S.avail = null; S.proName = 'Nouveau Pro';
    S.proCreatedAt = AUJ;                       // inscrit AUJOURD'HUI
    S.proMollie = 'none'; S.proMollieOrgId = ''; S.proMollieOnb = ''; S.proMollieCanPay = false;
    S.openRequests = []; S._openReqSeen = null;

    window.__fil.abonne();                      // le VRAI abonnement du fil
    if (!capte) return { abonne: false };
    // L'instantané que Firestore lui remettrait : UNE demande écrite HIER.
    const demande = { service: 'menage', serviceName: 'Ménage', status: 'pending',
      clientUid: 'cli-1', clientName: 'Camille', when: 'Demain', slot: '09:00',
      zone: 'Lorient', unit: 'h', duration: 3, rate: 35, total: 105,
      locationMode: 'domicile', slotFlex: 0, createdAt: HIER, blockedUids: [] };
    const docu = { id: 'r-hier', data: () => demande };
    capte({ forEach: (fn) => fn(docu), docChanges: () => [] });
    return { abonne: true, n: (window.__S.openRequests || []).length,
      ids: (window.__S.openRequests || []).map((r) => r.id) };
  }, { HIER, AUJ });

  console.log('1·2·3 — la demande date d’hier, il s’inscrit aujourd’hui, sans Mollie');
  ok(vu.abonne, 'le fil des missions s’abonne');

  console.log('4 — il la VOIT');
  ok(vu.n === 1 && vu.ids[0] === 'r-hier',
    'la demande d’hier entre dans son fil (' + vu.n + ' : ' + (vu.ids || []).join(', ') + ')');

  /* 5 — IL PEUT Y RÉPONDRE. On ouvre sa fiche et on CLIQUE, puis on lit ce qui part. */
  console.log('5 — il peut y répondre, et on lit ce qui part vers Firestore');
  const rep = await p.evaluate(async () => {
    /* LA SESSION SE REPOSE AVANT DE MESURER. Le SDK Firebase se charge depuis le réseau,
       injoignable ici : son échec arrive de façon ASYNCHRONE et remet la session à plat.
       Posée une seule fois, elle tient quand l'épreuve tourne seule et saute quand la
       machine est chargée — exactement le faux rouge déjà corrigé ailleurs. */
    window.__setFB({ auth: { currentUser: { uid: 'pro-neuf', email: 'neuf@e.fr' } }, db: {},
      f: { doc: (db, col, id) => ({ col: col, id: id }),
        collection: () => ({}), query: () => ({}), where: () => ({}),
        onSnapshot: () => (() => {}),
        updateDoc: (ref, patch) => { window.__ecrites.push({ col: ref.col, id: ref.id, patch: patch }); return Promise.resolve(); },
        setDoc: () => Promise.resolve(),
        getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
        serverTimestamp: () => 'ts' },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    window.__ecrites = [];
    S.proReqView = 'r-hier'; window.__render();
    const v = document.getElementById('view');
    const prevenu = /vous ne serez pas payé tout de suite/.test(v.textContent || '');
    const btn = v.querySelector('[data-act^="accept-req:"]');
    if (!btn) return { bouton: false, prevenu: prevenu };
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    return { bouton: true, prevenu: prevenu, ecrites: window.__ecrites,
      statut: (window.__S.mission || {}).status || '' };
  });
  ok(rep.prevenu, 'l’écran l’avertit qu’il ne sera pas payé tout de suite');
  ok(rep.bouton, 'le bouton « Accepter » est là malgré l’absence de Mollie');
  const maj = (rep.ecrites || []).find((e) => e.col === 'requests' && e.patch && e.patch.status === 'accepted');
  ok(!!maj && maj.id === 'r-hier', 'l’acceptation part sur la demande d’HIER');
  ok(!!maj && maj.patch.providerUid === 'pro-neuf', 'à son nom (' + (maj && maj.patch.providerUid) + ')');
  ok(rep.statut === 'accepted', 'et sa mission s’ouvre (' + rep.statut + ')');

  /* LA RÈGLE FIRESTORE LAISSERA PASSER : elle n'exige plus rien de Mollie, et le patch ne
     touche aucun des champs qu'elle verrouille. */
  const verrous = ['rate', 'boost', 'boostEur', 'unit', 'service', 'serviceName', 'duration',
    'clientUid', 'grossTotal', 'netAmount', 'commissionAmount', 'commissionPct', 'molliePaymentId'];
  const touche = maj ? verrous.filter((k) => Object.prototype.hasOwnProperty.call(maj.patch, k)) : ['(rien d’écrit)'];
  ok(touche.length === 0, 'et l’écriture ne touche aucun champ verrouillé' + (touche.length ? ' : ' + touche.join(', ') : ''));
  const clause = RULES.slice(RULES.indexOf('// « Premier arrivé »'), RULES.indexOf('// Demande DIRIGÉE déclinée'));
  ok(!/mollieOrgId|mollieCanWork/.test(clause), 'la règle, elle, n’exige plus d’organisation Mollie');

  /* ── 6 & 7 — CÔTÉ SERVEUR, ET C'EST LU, PAS DÉROULÉ. Aucun banc ne fait tourner les
     fonctions Firebase, et personne n'appelle l'API Mollie depuis ici. */
  console.log('6·7 — il fait Mollie plus tard, et il est payé (lu dans la source)');
  ok(/molliePayoutIssue: orgId \? 'route_failed' : 'no_org'/.test(SRV),
    'sans organisation, le serveur nomme le cas au lieu de le confondre avec un refus');
  ok(/molliePayoutNet: netA/.test(SRV), 'il inscrit le NET DÛ, sans quoi aucun rattrapage n’est possible');
  ok(/set\(\{molliePayout: 'unrouted'\}, \{merge: true\}\)/.test(SRV), 'le registre l’enregistre comme une DETTE');
  ok(/notifyArtisanMollieProblem\(db, providerUid/.test(SRV), 'le prestataire est prévenu');
  ok(/Versement Mollie à régulariser/.test(SRV), 'et l’administrateur alerté');
  /* Le rattrapage, aux trois endroits où l'organisation peut enfin arriver. */
  ok((SRV.match(/await rerouteArtisanPayouts\(db, uid/g) || []).length >= 3,
    'le rattrapage se déclenche au retour d’onboarding, à la synchro et au balayage ('
    + (SRV.match(/await rerouteArtisanPayouts\(db, uid/g) || []).length + ' endroits)');
  ok(/where\('molliePayout', '==', 'unrouted'\)/.test(SRV), 'il reprend ce qui attendait, pour CE prestataire');

  /* CE QUE L'ÉPREUVE NE PEUT PAS PROMETTRE, ET QU'ELLE DIT. La route se pose sur le
     PAIEMENT du client (`POST /payments/{id}/routes`) : elle n'est possible que tant que
     Mollie ne l'a pas versé. Au-delà, c'est un virement à la main — et c'est pour cela que
     l'alerte à l'administrateur existe. Le code le reconnaît, l'épreuve aussi. */
  ok(/\/payments\/' \+ encodeURIComponent\(molliePaymentId\) \+ '\/routes/.test(SRV),
    'la route s’attache au PAIEMENT : le rattrapage n’est donc possible qu’avant son versement');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
