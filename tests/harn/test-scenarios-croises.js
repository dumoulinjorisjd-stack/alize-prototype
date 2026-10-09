/* LES DEUX ÉCRANS AU MÊME INSTANT.

   « Refais plein de simulations avec plusieurs scénarios de commande et de réponse
   prestataire pour voir les écrans simultanés et voir si tout est logique. »

   Chaque épreuve jusqu'ici regardait UN côté. Or le défaut qui coûte cher est celui où
   les deux écrans du même fait se contredisent : le client lit « 09:00 » pendant que le
   prestataire lit « 14:00 », ou le client attend une réponse d'un prestataire qui ne
   voit plus sa demande. On monte donc les deux au même instant, sur le même état, et
   l'on compare ce qu'ils DISENT.

   Avec TISS_CAPTURES=1, chaque scénario rend aussi une image côte à côte. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const CAPT = process.env.TISS_CAPTURES === '1';
const SORTIE = process.env.TISS_SORTIE || '/tmp/scenarios';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('    ✓ ' + l); else { f++; console.log('    ✗ ÉCHEC : ' + l); } };

const iso = (n) => { const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const AUJ = iso(0), DEM = iso(1);

(async () => {
  if (CAPT) fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 400, height: 1500 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__fil);

  /* Un faux Firebase qui RETIENT ce qui est écrit : c'est par là que l'état voyage
     d'un écran à l'autre, exactement comme en vrai. */
  await p.evaluate(() => {
    window.__base = { req: null, props: {} };
    window.__brancher = function (uid, email) {
      window.__setFB({ auth: { currentUser: { uid: uid, email: email } }, db: {},
        f: {
          doc: function () { return { _p: Array.prototype.slice.call(arguments, 1) }; },
          collection: function () { return {}; },
          onSnapshot: function () { return function () {}; },
          getDoc: function () { return Promise.resolve({ exists: function () { return false; }, data: function () { return {}; } }); },
          setDoc: function (ref, data) {
            if (ref._p[2] === 'propositions') window.__base.props[ref._p[3]] = data;
            else Object.assign(window.__base.req, data);
            return Promise.resolve();
          },
          updateDoc: function (ref, data) { Object.assign(window.__base.req, data); return Promise.resolve(); },
          deleteDoc: function (ref) { if (ref._p[2] === 'propositions') delete window.__base.props[ref._p[3]]; return Promise.resolve(); },
        },
        fn: { httpsCallable: function () { return function () { return new Promise(function () {}); }; } }, functions: {} });
    };
    window.__decor = function () {
      document.body.classList.add('standalone');
      const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
      const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    };
  });

  /* ── LES DEUX ÉCRANS, SUR LE MÊME ÉTAT ────────────────────────────────────────── */
  const ecranClient = () => p.evaluate(() => {
    const S = window.__S, R = window.__base.req;
    window.__brancher('cli1', 'c@x.c'); window.__decor();
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'wallet'; S.propAsk = null;
    S.account = { name: 'Camille', email: 'c@x.c', uid: 'cli1', role: 'client' };
    const base = window.__newMission({ id: R.service, nm: R.serviceName, rate: 35 });
    const m = Object.assign(base, { reqId: 'r1', _id: 'mr1', status: R.status,
      when: R.when, dateISO: R.dateISO, slot: R.acceptedSlot || R.slot, slotFlex: R.slotFlex,
      duration: R.duration, zone: R.zone, unit: R.unit,
      preferredUid: R.preferredProviderUid || null, preferredName: R.preferredProviderName || '',
      directed: !!R.directed, providerUid: R.providerUid || null,
      provider: R.providerName ? { nm: R.providerName, ini: 'LM', rating: 0, jobs: 0, founder: false, insured: true } : null,
      proposedSlot: R.acceptedSlot || null });
    S.missions = [m]; S.mission = m;
    S.contrePropsRecues = { r1: Object.keys(window.__base.props).map(function (k) { return window.__base.props[k]; }) };
    window.__render();
    return { txt: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ') };
  });

  const ecranPro = (uid, nom) => p.evaluate(({ uid, nom }) => {
    const S = window.__S, R = window.__base.req;
    window.__brancher(uid, uid + '@x.c'); window.__decor();
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = nom;
    S.account = { name: nom, email: uid + '@x.c', uid: uid, role: 'artisan' };
    S.mission = null; S._accepting = false; S.proMissions = []; S.proSkipped = []; S.proSkipAt = {};
    S.proCats = [R.service]; S.proSiteMode = 'both'; S.avail = null; S.proOnline = true;
    S.proReqSlot = null; S.contreProp = null;
    S.contrePropEnvoyees = window.__base.props[uid] ? { r1: window.__base.props[uid] } : {};
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    S._openReqBrut = [Object.assign({ id: 'r1' }, R)];
    S.openRequests = window.__fil.visibles(S._openReqBrut);
    const voit = S.openRequests.length > 0;
    S.proReqView = voit ? 'r1' : null;
    window.__render();
    return { voit: voit, txt: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ') };
  }, { uid, nom });

  const capturer = async (nom, titreG, titreD) => {
    if (!CAPT) return;
    await p.screenshot({ path: path.join(SORTIE, nom), fullPage: false });
  };

  /* Deux écrans COLLÉS dans une seule image, pour les voir au même instant. */
  const cote = async (nom, gauche, droite) => {
    if (!CAPT) return;
    const g = (await p.screenshot({ clip: { x: 0, y: 0, width: 400, height: 1200 } })).toString('base64');
    return g;
  };

  const planche = async (nom, lblG, lblD, faireG, faireD) => {
    if (!CAPT) { await faireG(); await faireD(); return; }
    await faireG();
    const g = (await p.screenshot()).toString('base64');
    await faireD();
    const d = (await p.screenshot()).toString('base64');
    const page2 = await b.newPage({ viewport: { width: 900, height: 1560 }, deviceScaleFactor: 1 });
    await page2.setContent('<body style="margin:0;background:#1b1b1f;font:600 15px system-ui;color:#fff">'
      + '<div style="display:flex;gap:14px;padding:14px">'
      + '<div style="flex:1"><div style="padding:6px 2px 8px">' + lblG + '</div><img src="data:image/png;base64,' + g + '" style="width:100%;border-radius:10px;display:block"></div>'
      + '<div style="flex:1"><div style="padding:6px 2px 8px">' + lblD + '</div><img src="data:image/png;base64,' + d + '" style="width:100%;border-radius:10px;display:block"></div>'
      + '</div></body>');
    await page2.waitForTimeout(150);
    await page2.screenshot({ path: path.join(SORTIE, nom), fullPage: true });
    await page2.close();
  };

  const poser = (req) => p.evaluate((req) => { window.__base.req = req; window.__base.props = {}; }, req);
  const prop = (uid, nom, dateISO, slot) => p.evaluate(({ uid, nom, dateISO, slot }) => {
    window.__base.props[uid] = { providerUid: uid, providerName: nom, dateISO: dateISO, slot: slot, at: Date.now() };
  }, { uid, nom, dateISO, slot });

  const DEMANDE = (o) => Object.assign({ status: 'pending', clientUid: 'cli1', clientName: 'Camille',
    service: 'menage', serviceName: 'Ménage', when: 'Demain', dateISO: DEM, slot: '09:00', slotFlex: 0,
    zone: 'Lorient', total: 70, unit: 'h', duration: 2, rate: 35, locationMode: 'domicile',
    directed: false, preferredProviderUid: '', preferredProviderName: '', providerUid: null, providerName: '' }, o || {});

  let C, P, P2;

  /* ══ 1 ── HEURE PRÉCISE, RIEN À PROPOSER ════════════════════════════════════════ */
  console.log('\n1 — le client a fixé une heure précise');
  await poser(DEMANDE({ slotFlex: 0, slot: '09:00' }));
  await planche('1-heure-precise.png', 'CLIENT · en recherche', 'PRESTATAIRE · fiche de la mission',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro1', 'Laure M.'); });
  ok(P.voit, 'le prestataire voit la demande');
  ok(!/Proposez votre heure de passage/.test(P.txt),
    'aucune carte « proposez votre heure » : il n’y a rien à choisir');
  ok(/Proposer un autre moment/.test(P.txt),
    'mais il peut proposer un autre moment s’il ne peut pas');
  ok(/09:00/.test(C.txt) && /09:00/.test(P.txt), 'les deux écrans lisent la même heure');

  /* ══ 2 ── JOURNÉE OUVERTE, LE PRESTATAIRE CHOISIT L'HEURE ═══════════════════════ */
  console.log('\n2 — le client laisse la journée ouverte');
  await poser(DEMANDE({ slotFlex: 'day' }));
  await planche('2-journee-ouverte.png', 'CLIENT · souplesse annoncée', 'PRESTATAIRE · il choisit son heure',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro1', 'Laure M.'); });
  ok(/proposera une heure précise/.test(C.txt),
    'le client sait qu’un prestataire lui proposera une heure');
  ok(/Proposez votre heure de passage/.test(P.txt), 'et le prestataire a la carte pour le faire');
  const heures = await p.evaluate(() => { const s = document.querySelector('[data-proreqheure]');
    return s ? Array.from(s.options).map((x) => x.value) : []; });
  ok(heures.length > 0 && heures[0] === '08:00' && heures[heures.length - 1] === '18:00',
    'dans les horaires du métier, à la demie (' + heures.length + ' créneaux, ' + heures[0] + ' → ' + heures[heures.length - 1] + ')');
  ok(!/Autre…/.test(P.txt), 'et plus de bouton « Autre… », qui n’ouvrait rien d’utilisable');
  /* LE MÊME ÉCRAN NE DOIT PAS ANNONCER DEUX HEURES. La liste montrait le premier cran
     rond, le bouton « Accepter » le simple rabotage de l'heure demandée sur la fenêtre :
     « 17:30 » dans la liste, « j'arrive à 17:29 » sur le bouton, relevé sur capture. Et
     c'est cette seconde qui était ÉCRITE et montrée au client. */
  const deux = await p.evaluate(() => {
    const sel = document.querySelector('[data-proreqheure]');
    const bt = Array.from(document.querySelectorAll('[data-act^="accept-req:"]'))[0];
    const ban = Array.from(document.querySelectorAll('.banner')).map((x) => x.textContent || '').join(' ');
    return { liste: sel ? sel.value : null, bouton: (bt ? bt.textContent : '') || '', banniere: ban };
  });
  ok(deux.liste && deux.bouton.indexOf(deux.liste) >= 0,
    'la liste et le bouton « Accepter » annoncent la MÊME heure (' + deux.liste + ' / ' + deux.bouton.trim() + ')');
  ok(deux.banniere.indexOf(deux.liste) >= 0,
    'et la phrase sous la liste aussi');
  /* ET C'EST CETTE HEURE-LÀ QUI PART CHEZ LE CLIENT. */
  /* Le défaut est l'heure que le CLIENT a demandée quand elle tient encore : c'est celle
     qui l'arrange, et le prestataire n'a rien à changer. */
  const defaut = await p.evaluate(() => window.__heures.proposee(Object.assign({ id: 'r1' }, window.__base.req)));
  ok(defaut === '09:00', 'le défaut est l’heure demandée par le client quand elle tient (' + defaut + ')');

  /* ══ 3 ── IL NE PEUT PAS : CONTRE-PROPOSITION ═══════════════════════════════════ */
  console.log('\n3 — il ne peut pas ce jour-là, il propose le lendemain');
  await poser(DEMANDE({ slotFlex: 'day', dateISO: AUJ, when: 'Aujourd’hui' }));
  await prop('pro1', 'Laure M.', DEM, '09:00');
  await planche('3-contre-proposition.png', 'CLIENT · une proposition arrive', 'PRESTATAIRE · il a proposé',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro1', 'Laure M.'); });
  ok(/propose un autre créneau/.test(C.txt), 'le client voit la proposition');
  ok(/Laure M\./.test(C.txt), 'et qui la fait');
  /* LE MÊME ÉCRAN NE DOIT PAS ANNONCER DEUX HEURES — et l'écart ne se voit QUE sur une
     demande du jour, dont la fenêtre commence à la minute qu'il est. La liste montrait
     « 17:30 », le bouton « j'arrive à 17:29 », et c'est la seconde qui était ÉCRITE et
     envoyée au client. Mesuré sur capture. */
  const memeHeure = await p.evaluate(() => {
    const S = window.__S; const avant = S.proReqView;
    S.proReqView = 'r1'; S.proReqSlot = null; window.__render();
    const sel = document.querySelector('[data-proreqheure]');
    const bt = document.querySelector('[data-act^="accept-req:"]');
    const r = Object.assign({ id: 'r1' }, window.__base.req);
    const out = { liste: sel ? sel.value : null, bouton: (bt ? bt.textContent : '') || '',
      ecrite: window.__heures.proposee(r), crans: window.__heures.proposables(r) };
    S.proReqView = avant;
    return out;
  });
  ok(memeHeure.liste && memeHeure.bouton.indexOf(memeHeure.liste) >= 0,
    'la liste et le bouton « Accepter » annoncent la MÊME heure (' + memeHeure.liste
      + ' / ' + memeHeure.bouton.trim() + ')');
  ok(memeHeure.ecrite === memeHeure.liste,
    'et c’est elle qui sera écrite sur la demande, donc lue par le client ('
      + memeHeure.ecrite + ')');
  ok(memeHeure.crans.indexOf(memeHeure.ecrite) >= 0,
    'jamais une minute intermédiaire, toujours un créneau offert');
  ok(/Vous avez proposé/.test(P.txt), 'le prestataire lit ce qu’il a proposé');
  ok(/Le client décide/.test(P.txt), 'et que c’est au client de trancher');
  P2 = await ecranPro('pro9', 'Marc T.');
  ok(P2.voit, 'pendant ce temps la demande reste proposée aux autres');
  ok(!/Vous avez proposé/.test(P2.txt), 'qui, eux, n’ont rien proposé');

  /* ══ 4 ── LE CLIENT ACCEPTE ═════════════════════════════════════════════════════ */
  console.log('\n4 — le client accepte le créneau proposé');
  await p.evaluate(() => {
    const S = window.__S;
    document.querySelector('[data-act="prop-ok:pro1"]') && document.querySelector('[data-act="prop-ok:pro1"]').click();
  });
  C = await ecranClient();
  await p.evaluate(() => {
    const b1 = document.querySelector('[data-act="prop-ok:pro1"]'); if (b1) b1.click();
    const b2 = document.querySelector('[data-act="prop-go:pro1"]'); if (b2) b2.click();
  });
  await planche('4-acceptee.png', 'CLIENT · réservée à Laure', 'PRESTATAIRE · réservée pour vous',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro1', 'Laure M.'); });
  const req = await p.evaluate(() => window.__base.req);
  ok(req.directed === true && req.preferredProviderUid === 'pro1',
    'la demande est adressée à celui qui a proposé');
  ok(req.dateISO === DEM && req.slot === '09:00' && req.slotFlex === 0,
    'au jour et à l’heure proposés (' + req.dateISO + ' ' + req.slot + ')');
  ok(req.status === 'pending' && req.providerUid === null,
    'et elle reste en recherche : c’est lui qui l’acceptera, avec son identité et son SIRET');
  ok(/réservée à Laure/i.test(C.txt), 'le client lit à qui elle est réservée');
  ok(!/propose un autre créneau/.test(C.txt), 'et la carte des propositions se tait');
  ok(P.voit && /réservée pour vous/i.test(P.txt), 'le prestataire la voit, réservée pour lui');
  /* ET POUR LA BONNE RAISON. Le bandeau affirmait « parce que vous avez déjà travaillé
     ensemble » : vrai quand le client choisit son prestataire habituel, FAUX ici — il
     lisait une raison inventée. */
  ok(/a accepté le créneau que vous avez proposé/.test(P.txt),
    'et le bandeau dit POURQUOI elle lui est réservée : son créneau a été accepté');
  ok(!/déjà travaillé ensemble/.test(P.txt),
    'et n’invente plus un passé commun qui n’existe pas');
  ok(/Vous percevez/.test(P.txt) && !/Vous percevez 0,00/.test(P.txt),
    'et son gain n’est pas nul (' + (P.txt.match(/Vous percevez ?([\d  ,]+€)/) || [])[1] + ')');
  ok(!/Proposer un autre moment/.test(P.txt), 'et on ne lui propose plus de proposer : il accepte');
  P2 = await ecranPro('pro9', 'Marc T.');
  ok(!P2.voit, 'un confrère ne la voit plus du tout');

  /* ══ 5 ── LE CLIENT REFUSE ══════════════════════════════════════════════════════ */
  console.log('\n5 — le client refuse la proposition');
  await poser(DEMANDE({ slotFlex: 'day', dateISO: AUJ, when: 'Aujourd’hui' }));
  await prop('pro1', 'Laure M.', DEM, '09:00');
  C = await ecranClient();
  await p.evaluate(() => { const x = document.querySelector('[data-act="prop-non:pro1"]'); if (x) x.click(); });
  await planche('5-refusee.png', 'CLIENT · proposition écartée', 'PRESTATAIRE · la demande reste à prendre',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro9', 'Marc T.'); });
  const restes = await p.evaluate(() => Object.keys(window.__base.props));
  ok(restes.length === 0, 'la proposition est retirée');
  ok(!/propose un autre créneau/.test(C.txt), 'elle ne s’affiche plus');
  const r5 = await p.evaluate(() => window.__base.req);
  ok(r5.directed === false && r5.status === 'pending',
    'et la demande reste en recherche, ouverte à tous, inchangée');
  ok(P.voit, 'les autres la voient toujours');

  /* ══ 6 ── DEUX PRESTATAIRES PROPOSENT ═══════════════════════════════════════════ */
  console.log('\n6 — deux prestataires proposent, le client n’en retient qu’un');
  await poser(DEMANDE({ slotFlex: 'day', dateISO: AUJ, when: 'Aujourd’hui' }));
  await prop('pro1', 'Laure M.', DEM, '09:00');
  await prop('pro9', 'Marc T.', DEM, '14:30');
  await planche('6-deux-propositions.png', 'CLIENT · deux créneaux proposés', 'PRESTATAIRE · Marc a proposé aussi',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro9', 'Marc T.'); });
  ok(/Des prestataires proposent/.test(C.txt), 'le titre se met au pluriel');
  ok(/Laure M\./.test(C.txt) && /Marc T\./.test(C.txt), 'les deux sont nommés');
  ok(/09:00/.test(C.txt) && /14:30/.test(C.txt), 'avec leurs deux créneaux');
  /* La planche a laissé l'écran du PRESTATAIRE affiché : on revient chez le client
     avant de toucher ses boutons, sinon on cliquerait dans le vide. */
  C = await ecranClient();
  await p.evaluate(() => {
    const b1 = document.querySelector('[data-act="prop-ok:pro9"]'); if (b1) b1.click();
    const b2 = document.querySelector('[data-act="prop-go:pro9"]'); if (b2) b2.click();
  });
  C = await ecranClient();
  const r6 = await p.evaluate(() => window.__base.req);
  ok(r6.preferredProviderUid === 'pro9' && r6.slot === '14:30', 'celui qu’il retient est le bon');
  ok(!/Laure M\./.test(C.txt) || !/propose un autre créneau/.test(C.txt),
    'et la proposition de l’autre ne lui est plus présentée');
  P = await ecranPro('pro1', 'Laure M.');
  ok(!P.voit, 'Laure, qui avait proposé, ne voit plus la demande');

  /* ══ 7 ── LA MISSION EST PRISE PAR QUELQU'UN D'AUTRE ════════════════════════════ */
  console.log('\n7 — pendant qu’un prestataire propose, un autre accepte tout de suite');
  await poser(DEMANDE({ slotFlex: 'day', dateISO: AUJ, when: 'Aujourd’hui' }));
  await prop('pro1', 'Laure M.', DEM, '09:00');
  await p.evaluate(() => { Object.assign(window.__base.req, { status: 'accepted',
    providerUid: 'pro9', providerName: 'Marc T.', acceptedSlot: '11:00' }); });
  await planche('7-prise-par-un-autre.png', 'CLIENT · mission acceptée', 'PRESTATAIRE · elle n’est plus au fil',
    async () => { C = await ecranClient(); }, async () => { P = await ecranPro('pro1', 'Laure M.'); });
  ok(/Mission acceptée/.test(C.txt) && /Marc T\./.test(C.txt), 'le client lit qui intervient');
  ok(/11:00/.test(C.txt), 'et à quelle heure');
  ok(!/propose un autre créneau/.test(C.txt),
    'la proposition de Laure ne lui est plus présentée : il n’y a plus rien à décider');
  ok(!P.voit, 'et Laure ne voit plus la demande');

  console.log('');
  ok(errs.length === 0, 'aucune erreur de page sur les sept scénarios' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est cohérent');
  process.exit(f ? 1 : 0);
})();
