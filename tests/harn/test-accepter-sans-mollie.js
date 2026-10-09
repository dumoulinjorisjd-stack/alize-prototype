/* « ON L'AUTORISE À ACCEPTER MÊME SANS AVOIR ENTAMÉ MOLLIE, MAIS IL NE SERA PAYÉ QUE
   QUAND MOLLIE SERA FAIT. » Décision de l'éditeur, 09/10/2026 : un nouvel inscrit peut
   accepter une mission dans la seconde de son inscription, y compris une demande écrite
   AVANT qu'il existe.

   LA PORTE PROTÉGEAIT UN VRAI RISQUE : une route Mollie s'attache au paiement du client
   et vise une ORGANISATION (`org_…`). Sans organisation, il n'y a pas de destinataire —
   Mollie ne peut router nulle part. Ce qui se passe alors est connu et tenu : le client
   est débité normalement, la totalité reste sur le solde Ti-Services, le net dû est
   inscrit (`molliePayoutNet`, état `no_org`), le registre l'enregistre comme une DETTE,
   l'artisan est prévenu et l'administrateur alerté. Le rattrapage est automatique s'il
   active Mollie pendant que le paiement est encore routable, manuel ensuite.

   DONC : on n'interdit plus, ON PRÉVIENT — et avant le clic, pas après. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  /* A — LA PORTE EST OUVERTE DES DEUX CÔTÉS. Une seule des deux aurait suffi à bloquer. */
  console.log('A — plus de porte Mollie à l’acceptation');
  const clause = RULES.slice(RULES.indexOf('// « Premier arrivé »'), RULES.indexOf('// Demande DIRIGÉE déclinée'));
  ok(!/mollieOrgId/.test(clause) && !/mollieCanWork/.test(clause),
    'la règle Firestore n’exige plus d’organisation Mollie pour prendre une demande');
  ok(/resource\.data\.clientUid != uid\(\)/.test(clause),
    'mais elle garde ce qui compte : jamais sa propre demande');
  ok(!/function canAcceptMissions/.test(APP),
    'et la porte du client a DISPARU, elle n’a pas été mise à « vrai » (une fonction qui rend toujours vrai se lit comme un contrôle)');

  /* B — IL NE PEUT TOUJOURS PAS SE DÉCLARER PAYABLE. C'est l'autre verrou, et lui reste :
     sans vérification d'identité et d'IBAN par Mollie, aucun euro ne part. */
  console.log('B — ce qui reste verrouillé');
  ok(/request\.resource\.data\.get\('mollieCanWork', false\) == resource\.data\.get\('mollieCanWork', false\)/.test(RULES),
    'un artisan ne peut pas se poser lui-même « autorisé à encaisser »');
  ok(/mollieOrgId', ''\) == resource\.data\.get\('mollieOrgId/.test(RULES),
    'ni s’inventer une organisation Mollie');

  /* C — ET IL LE SAIT AVANT D'ACCEPTER. C'est la contrepartie de la porte ouverte : la
     phrase vit au-dessus du bouton qui engage, pas dans un e-mail qui suivra. */
  console.log('C — il le lit au-dessus du bouton, pas après');
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const fiche = (mollie) => p.evaluate((mollie) => {
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro';
    S.proNav = 'home'; S.mission = null; S.proCats = ['menage']; S.proOnline = true;
    S.proStatus = 'valide'; S.avail = null;
    S.proMollie = mollie.etat; S.proMollieOrgId = mollie.org || ''; S.proMollieOnb = mollie.onb || '';
    S.proMollieCanPay = mollie.canPay === true;
    S.openRequests = [{ id: 'r1', service: 'menage', serviceName: 'Ménage', status: 'pending',
      clientUid: 'c1', clientName: 'Camille', when: 'Demain', slot: '09:00', zone: 'Lorient',
      unit: 'h', duration: 3, rate: 35, total: 105, locationMode: 'domicile' }];
    S.proReqView = 'r1';
    window.__render();
    const v = document.getElementById('view');
    const acc = v.querySelector('[data-act^="accept-req:"]');
    return { accepte: !!acc,
      bloque: !!v.querySelector('[data-act="pro-mollie"].btn.primary'),
      txt: (v.textContent || '').replace(/\s+/g, ' ') };
  }, mollie);

  const sans = await fiche({ etat: 'none', org: '', onb: '' });
  ok(sans.accepte, 'sans aucun compte Mollie : le bouton « Accepter » est là');
  ok(!sans.bloque, 'et plus de bouton « Activer mes paiements pour accepter » à sa place');
  ok(/vous ne serez pas payé tout de suite/.test(sans.txt),
    'l’écran dit qu’il ne sera pas payé tout de suite');
  ok(/gardé pour vous/.test(sans.txt) && /dès que c’est fait|dès que c\'est fait/.test(sans.txt),
    'et que son gain est gardé pour lui, versé dès l’activation');

  /* L'AVERTISSEMENT DISPARAÎT DE LUI-MÊME quand il n'a plus lieu d'être : un bandeau qui
     reste après coup finit par ne plus être lu du tout. */
  const actif = await fiche({ etat: 'active', org: 'org_123', onb: 'completed' });
  ok(actif.accepte, 'paiements activés : il accepte toujours');
  ok(!/vous ne serez pas payé tout de suite/.test(actif.txt),
    'et l’avertissement a disparu, il n’a plus d’objet');

  /* D — CE QUE LE SERVEUR FAIT DE L'ARGENT ENTRE-TEMPS, lu dans la source. */
  console.log('D — l’argent n’est jamais perdu, et il le sait');
  ok(/molliePayoutIssue: orgId \? 'route_failed' : 'no_org'/.test(SRV),
    'le serveur nomme le cas « pas d’organisation » au lieu de le confondre avec un refus');
  ok(/molliePayoutNet: netA/.test(SRV), 'il inscrit le net dû, sans quoi aucun rattrapage n’est possible');
  ok(/set\(\{molliePayout: 'unrouted'\}, \{merge: true\}\)/.test(SRV),
    'et le registre comptable l’enregistre comme une DETTE, pas comme un revenu');
  ok(/async function rerouteArtisanPayouts/.test(SRV), 'le rattrapage existe');
  ok(/async function netEnAttente/.test(SRV), 'et le serveur sait dire combien lui est dû');

  /* E — LA RELANCE CESSE DE DIRE UNE CHOSE FAUSSE, et dit la plus forte. */
  console.log('E — la relance nomme l’argent, pas une interdiction qui n’existe plus');
  const relance = SRV.slice(SRV.indexOf('exports.mollieActivationReminder'), SRV.indexOf('exports.mollieOnboardingSweep'));
  ok(!/tu ne peux accepter aucune mission|pas accepter de mission|pas encore accepter de mission/.test(relance + SRV.slice(SRV.indexOf('function mollieReminderHtml'), SRV.indexOf('function mollieReminderHtml') + 3000)),
    'plus une ligne ne prétend qu’il ne peut pas accepter');
  ok(/t’attendent|t’attendent/.test(relance), 'elle annonce la somme qui l’attend');
  ok(/await netEnAttente\(db, d\.id\)/.test(relance), 'et cette somme est MESURÉE, pas supposée');

  /* F — ET ON LE FAIT POUR DE VRAI. Les épreuves ci-dessus lisent des écrans et des
     sources ; celle-ci CLIQUE « Accepter » avec un compte sans la moindre trace de
     Mollie, et regarde CE QUI PART VERS FIRESTORE. C'est la seule qui dirait si la
     porte s'est refermée ailleurs. */
  console.log('F — on clique « Accepter », sans Mollie, et on lit ce qui est écrit');
  const ecrit = await p.evaluate(async () => {
    window.__ecrites = [];
    window.__setFB({ db: {}, auth: { currentUser: { uid: 'pro1', email: 'p@e.fr' } },
      f: { doc: (db, col, id) => ({ col: col, id: id }),
        updateDoc: (ref, patch) => { window.__ecrites.push({ col: ref.col, id: ref.id, patch: patch }); return Promise.resolve(); },
        setDoc: () => Promise.resolve(),
        getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
        serverTimestamp: () => 'ts' },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro';
    S.proNav = 'home'; S.mission = null; S.proCats = ['menage']; S.proOnline = true;
    S.proStatus = 'valide'; S.avail = null; S.proName = 'Nouveau Pro';
    /* AUCUNE TRACE DE MOLLIE : ni organisation, ni statut, ni autorisation. */
    S.proMollie = 'none'; S.proMollieOrgId = ''; S.proMollieOnb = ''; S.proMollieCanPay = false;
    S.openRequests = [{ id: 'r1', service: 'menage', serviceName: 'Ménage', status: 'pending',
      clientUid: 'c1', clientName: 'Camille', when: 'Demain', slot: '09:00', zone: 'Lorient',
      unit: 'h', duration: 3, rate: 35, total: 105, locationMode: 'domicile', slotFlex: 0 }];
    S.proReqView = 'r1';
    window.__render();
    const b = document.querySelector('#view [data-act^="accept-req:"]');
    if (!b) return { bouton: false };
    b.click();
    await new Promise((r) => setTimeout(r, 900));
    return { bouton: true, ecrites: window.__ecrites, statut: (window.__S.mission || {}).status || '' };
  });
  ok(ecrit.bouton, 'le bouton « Accepter » est cliquable');
  const maj = (ecrit.ecrites || []).find((e) => e.col === 'requests' && e.patch && e.patch.status === 'accepted');
  ok(!!maj, 'une mise à jour « accepted » part vers la demande ('
    + (ecrit.ecrites || []).length + ' écriture(s))');
  ok(!!maj && maj.id === 'r1', 'sur la BONNE demande (' + (maj && maj.id) + ')');
  ok(!!maj && maj.patch.providerUid === 'pro1', 'et elle s’attribue le prestataire (' + (maj && maj.patch.providerUid) + ')');
  ok(!!maj && maj.patch.acceptedSlot === '09:00', 'avec l’heure convenue (' + (maj && maj.patch.acceptedSlot) + ')');
  /* ET LA RÈGLE FIRESTORE LAISSERA PASSER CETTE ÉCRITURE : elle n'exige plus rien de
     Mollie, et le patch ne touche ni les montants ni les termes du contrat. */
  const interdits = ['rate', 'boost', 'unit', 'service', 'serviceName', 'duration', 'clientUid',
    'grossTotal', 'netAmount', 'commissionAmount', 'molliePaymentId'];
  const touche = maj ? interdits.filter((k) => Object.prototype.hasOwnProperty.call(maj.patch, k)) : ['(pas d’écriture)'];
  ok(touche.length === 0,
    'le patch ne touche aucun champ verrouillé par la règle' + (touche.length ? ' : ' + touche.join(', ') : ''));
  ok(ecrit.statut === 'accepted', 'et l’écran du prestataire bascule sur sa mission (' + ecrit.statut + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
