/* « IL FAUT METTRE À JOUR POUR PROPOSER LE LENDEMAIN. »

   Quand le client laisse de la souplesse, le prestataire choisit l'HEURE dans la
   journée que le client a fixée, et elle s'applique toute seule. Changer de JOUR n'est
   pas la même commande : la date est le choix du client. Le prestataire PROPOSE, le
   client DÉCIDE, et la demande reste proposée aux autres pendant ce temps.

   ET L'ACCEPTATION NE DÉSIGNE PAS LE PRESTATAIRE, ELLE LUI ADRESSE LA DEMANDE. Une
   mission acceptée porte la photo, le téléphone, l'identité légale et le SIRET du
   prestataire : c'est LUI qui les écrit en acceptant, et la facture en dépend. Si le
   client l'assignait, la mission naîtrait sans rien de tout cela. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const jPlus = (n) => { const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__prop);

  /* A — LE NOYAU. Ce qui arrive vient d'un AUTRE compte et finit dans la commande du
     client : rien n'est deviné, et le jour se REÇOIT. */
  console.log('A — ce qu’une proposition a le droit d’être');
  const noy = await p.evaluate(({ demain, hier }) => {
    const L = window.__prop.lue;
    const bon = { providerUid: 'pro1', providerName: 'Laure', dateISO: demain, slot: '09:00', at: 5 };
    return {
      bon: L(bon, { dateISO: hier, slot: '14:00' }, hier),
      sansUid: L(Object.assign({}, bon, { providerUid: '' }), null, null),
      dateFolle: L(Object.assign({}, bon, { dateISO: 'demain matin' }), null, null),
      heureFolle: L(Object.assign({}, bon, { slot: '25:70' }), null, null),
      passee: L(Object.assign({}, bon, { dateISO: hier }), null, demain),
      identique: L(bon, { dateISO: demain, slot: '09:00' }, null),
      sansNom: L(Object.assign({}, bon, { providerName: '' }), null, null),
      longNom: L(Object.assign({}, bon, { providerName: 'x'.repeat(200) }), null, null),
      enTrop: L(Object.assign({}, bon, { total: 99999, status: 'accepted' }), null, null),
      champs: window.__prop.champs(),
    };
  }, { demain: jPlus(1), hier: jPlus(-1) });
  ok(noy.bon.ok && noy.bon.prop.slot === '09:00', 'une proposition valable passe');
  ok(!noy.sansUid.ok && noy.sansUid.raison === 'sans-prestataire', 'sans prestataire, rien');
  ok(!noy.dateFolle.ok && noy.dateFolle.raison === 'date-illisible', 'une date illisible est refusée, pas devinée');
  ok(!noy.heureFolle.ok && noy.heureFolle.raison === 'heure-illisible', 'une heure impossible aussi');
  ok(!noy.passee.ok && noy.passee.raison === 'deja-passee',
    'une proposition déjà passée n’en est plus une : l’accepter fixerait un rendez-vous dans le passé');
  ok(!noy.identique.ok && noy.identique.raison === 'identique',
    'et redire le créneau demandé n’est pas une contre-proposition : il n’y a qu’à accepter');
  ok(noy.sansNom.ok && noy.sansNom.prop.providerName === 'Un prestataire',
    'sans nom, on n’invente pas : « Un prestataire »');
  ok(noy.longNom.prop.providerName.length === 60, 'un nom démesuré est borné (' + noy.longNom.prop.providerName.length + ')');
  ok(Object.keys(noy.enTrop.prop).every((k) => noy.champs.indexOf(k) >= 0),
    'et rien d’autre ne passe : un « total » ou un « status » glissés dedans sont jetés ('
      + Object.keys(noy.enTrop.prop).join(', ') + ')');

  console.log('B — la liste : l’ordre d’arrivée, et une borne');
  const liste = await p.evaluate(({ demain, hier }) => {
    const mk = (i, at) => ({ providerUid: 'p' + i, providerName: 'P' + i, dateISO: demain, slot: '0' + (i % 9) + ':00', at: at });
    const beaucoup = []; for (let i = 1; i <= 9; i++) beaucoup.push(mk(i, 100 - i));
    return { ordre: window.__prop.liste([mk(1, 50), mk(2, 10), mk(3, 30)], null, null).map((x) => x.providerUid),
      borne: window.__prop.liste(beaucoup, null, null).length,
      max: window.__prop.max(),
      filtre: window.__prop.liste([mk(1, 1), { providerUid: 'p2', dateISO: 'n’importe quoi', slot: '09:00' },
        { providerUid: 'p3', providerName: 'P3', dateISO: hier, slot: '09:00', at: 2 }], null, demain).map((x) => x.providerUid) };
  }, { demain: jPlus(2), hier: jPlus(-1) });
  ok(liste.ordre.join(',') === 'p2,p3,p1', 'elles sont rendues dans l’ordre d’arrivée (' + liste.ordre.join(',') + ')');
  ok(liste.borne === liste.max, 'et bornées à ' + liste.max + ' : au-delà, l’écran n’aide plus à choisir');
  ok(liste.filtre.join(',') === 'p1', 'ce qui ne tient pas debout ne paraît pas (' + liste.filtre.join(',') + ')');

  /* C — CE QUE L'ACCEPTATION ÉCRIT. Elle n'assigne PAS le prestataire : elle lui ADRESSE
     la demande, qui reste `pending`. C'est le cœur de la décision. */
  console.log('C — accepter adresse la demande, elle ne l’attribue pas');
  const acc = await p.evaluate(({ demain }) => window.__prop.accepter(
    { providerUid: 'pro7', providerName: 'Laure M.', dateISO: demain, slot: '09:00', at: 1 },
    'Demain', 1700000000000), { demain: jPlus(1) });
  ok(acc.status === 'pending', 'la demande reste en recherche, elle ne passe pas « acceptée »');
  ok(acc.providerUid === null && acc.providerName === '',
    'et AUCUN prestataire n’est attribué : c’est lui qui écrira sa photo, son identité et son SIRET en acceptant');
  ok(acc.directed === true && acc.preferredProviderUid === 'pro7',
    'elle lui est ADRESSÉE : lui seul la voit, le serveur le prévient, il accepte par la porte ordinaire');
  ok(acc.slotFlex === 0 && acc.slot === '09:00' && acc.dateISO === jPlus(1),
    'le créneau devient précis : l’heure est convenue, il n’y a plus rien à choisir');
  ok(acc.when === 'Demain', 'le libellé du jour est DONNÉ au noyau, qui ne connaît ni la langue ni le format');
  ok(acc.declinedBy === null && acc.declinedName === '',
    'et un refus antérieur est effacé, sinon la demande porterait deux histoires');

  /* D — LA RÈGLE FIRESTORE. Un prestataire validé n'a aucun droit d'écriture sur une
     demande qui n'est pas la sienne : la proposition vit donc à côté. */
  console.log('D — ce que la base autorise, et ce qu’elle refuse');
  ok(/match \/propositions\/\{proUid\}/.test(RULES), 'la sous-collection a sa règle');
  const bloc = RULES.slice(RULES.indexOf('match /propositions/{proUid}'), RULES.indexOf('match /propositions/{proUid}') + 2200);
  ok(/uid\(\) == proUid/.test(bloc),
    'l’identifiant EST son uid : il ne peut pas semer cent propositions sur la même demande');
  ok(/isValidArtisan\(\)/.test(bloc), 'seul un prestataire validé propose');
  ok(/parent\(\)\.status == 'pending'/.test(bloc), 'et seulement sur une demande encore en recherche');
  ok(/parent\(\)\.clientUid != uid\(\)/.test(bloc), 'jamais sur sa propre demande');
  ok(/hasOnly\(\['providerUid','providerName','dateISO','slot','at'\]\)/.test(bloc),
    'la liste des champs est FERMÉE, la même que le noyau');
  ok(/providerName\.size\(\) <= 60/.test(bloc) && /dateISO\.size\(\) == 10/.test(bloc),
    'et les tailles sont bornées');
  ok(/allow read: if isAdmin\(\)[\s\S]{0,200}parent\(\)\.clientUid == uid\(\)/.test(bloc),
    'le client les lit ; un prestataire ne lit que la sienne');

  /* E — LE CLIENT EST PRÉVENU MÊME APPLICATION FERMÉE, sans quoi la proposition dort
     jusqu'à ce qu'il rouvre par hasard, et la demande expire pendant ce temps. */
  console.log('E — le serveur prévient le client');
  ok(/onDocumentCreated\('requests\/\{reqId\}\/propositions\/\{proUid\}'/.test(SRV),
    'une fonction écoute l’arrivée d’une proposition');
  const fn = SRV.slice(SRV.indexOf('notifyClientCounterOffer'), SRV.indexOf('notifyClientCounterOffer') + 1800);
  ok(/status \|\| ''\) !== 'pending'/.test(fn), 'elle se tait si la demande n’est plus en recherche');
  ok(/userPushTokens\(db, clientUid\)/.test(fn), 'elle écrit au CLIENT, par le canal qui existe déjà');
  ok(!/dateISO/.test(fn),
    'et elle ne recopie PAS la date dans la notification : une date abîmée ferait croire à un rendez-vous qui n’existe pas');

  /* F — L'ÉCRAN DU PRESTATAIRE. Le noyau peut être juste et le câblage faux : c'est ici
     qu'on le vérifie, en touchant les boutons. */
  console.log('F — le prestataire propose, depuis sa fiche de mission');
  const pro = await p.evaluate(({ demain }) => {
    const ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: function () { return { _p: Array.prototype.slice.call(arguments, 1) }; },
        setDoc: function (ref, data) { ecrits.push({ chemin: ref._p, data: data }); return Promise.resolve(); },
        collection: function () { return {}; }, onSnapshot: function () { return function () {}; },
        updateDoc: function () { return Promise.resolve(); } },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = 'Laure M.';
    S.account = { name: 'Laure M.', email: 'p@x.c', uid: 'pro1', role: 'artisan' };
    S.mission = null; S._accepting = false; S.proMissions = []; S.proCats = ['menage'];
    S.proSiteMode = 'both'; S.avail = null; S.proOnline = true;
    S.contreProp = null; S.contrePropEnvoyees = {};
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    S.openRequests = [{ id: 'r1', status: 'pending', clientUid: 'cli1', clientName: 'Un client',
      service: 'menage', serviceName: 'Ménage', when: 'Aujourd’hui', dateISO: new Date().toISOString().slice(0, 10),
      slot: '09:00', slotFlex: 'day', zone: 'Lorient', total: 70, unit: 'h', duration: 2, locationMode: 'domicile' }];
    S.proReqView = 'r1';
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    window.__render();
    const v = document.getElementById('view');
    const bouton = v.querySelector('[data-act="contreprop-open:r1"]');
    if (bouton) bouton.click();
    const jours = Array.from(document.querySelectorAll('[data-contrepropjour] option')).map((o) => o.value);
    const premier = (window.__S.contreProp || {}).dateISO;
    const heures = Array.from(document.querySelectorAll('[data-contrepropheure] option')).map((o) => o.value);
    /* On choisit DEMAIN, puis on envoie, exactement comme elle le ferait. */
    const sel = document.querySelector('[data-contrepropjour]');
    let change = false;
    if (sel && jours.indexOf(demain) >= 0) { sel.value = demain;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true })); change = true; }
    const heuresDemain = Array.from(document.querySelectorAll('[data-contrepropheure] option')).map((o) => o.value);
    const env = document.querySelector('[data-act="contreprop-send:r1"]');
    if (env) env.click();
    return { bouton: !!bouton, jours: jours, premier: premier, heures: heures, heuresDemain: heuresDemain, change: change, ecrits: ecrits };
  }, { demain: jPlus(1) });
  ok(pro.bouton, 'la fiche porte « Proposer un autre moment »');
  ok(pro.jours.length > 1 && pro.jours.indexOf(jPlus(1)) >= 0,
    'le formulaire offre plusieurs jours, dont demain (' + pro.jours.length + ')');
  /* LE CLIENT A DÉJÀ OUVERT TOUTE SA JOURNÉE : une autre HEURE ce jour-là n'est pas une
     contre-proposition, la carte du dessus le fait déjà. Le formulaire part du
     lendemain, et n'offre même pas le jour demandé. */
  ok(pro.jours.indexOf(jPlus(0)) < 0,
    'et pas le jour que le client a déjà entièrement ouvert : il n’y a rien à y proposer');
  ok(pro.premier === jPlus(1), 'il s’ouvre donc sur demain (' + pro.premier + ')');
  /* Une contre-proposition est une heure PRÉCISE, pas un cran d'une fenêtre souple :
     la grille est celle du client, à la demi-heure, et bornée par le métier. */
  ok(pro.heures.length > 0 && pro.heures.every((h) => /:(00|30)$/.test(h)),
    'et des heures à la demie, comme celles que le client choisit (' + pro.heures.slice(0, 3).join(', ') + '…)');
  ok(pro.heuresDemain[0] === '08:00' && pro.heuresDemain[pro.heuresDemain.length - 1] === '18:00',
    'bornées par les horaires du métier (' + pro.heuresDemain[0] + ' → ' + pro.heuresDemain[pro.heuresDemain.length - 1] + ')');
  ok(pro.ecrits.length === 1, 'envoyer écrit une fois, et une seule (' + pro.ecrits.length + ')');
  const e0 = pro.ecrits[0] || { chemin: [], data: {} };
  ok(e0.chemin.join('/') === 'requests/r1/propositions/pro1',
    'à sa place, sous SON uid : il ne peut pas en semer cent (' + e0.chemin.join('/') + ')');
  ok(Object.keys(e0.data).sort().join(',') === 'at,dateISO,providerName,providerUid,slot',
    'avec les cinq champs de la liste fermée, et rien d’autre (' + Object.keys(e0.data).sort().join(',') + ')');
  ok(e0.data.dateISO === jPlus(1) && e0.data.providerUid === 'pro1',
    'le jour choisi et son uid, jamais devinés');
  /* L'envoi est asynchrone : on attend que l'écran soit redessiné avant de le lire,
     plutôt que de mesurer l'instant d'avant. */
  await p.waitForFunction(() => /Vous avez proposé/.test(document.getElementById('view').textContent || ''), { timeout: 4000 })
    .then(() => ok(true, 'et la fiche dit ensuite ce qu’il a proposé, au lieu de reproposer le formulaire'))
    .catch(() => ok(false, 'et la fiche dit ensuite ce qu’il a proposé, au lieu de reproposer le formulaire'));

  /* G — L'ÉCRAN DU CLIENT. Accepter DÉPLACE sa commande : ce qui va se passer se lit
     AVANT le clic, comme pour l'annulation et pour « Clore ». */
  console.log('G — le client décide, et il sait ce qu’il décide');
  const cli = await p.evaluate(({ demain }) => {
    const patchs = [];
    window.__setFB({ auth: { currentUser: { uid: 'cli1', email: 'c@x.c' } }, db: {},
      f: { doc: function () { return { _p: Array.prototype.slice.call(arguments, 1) }; },
        setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}),
        deleteDoc: () => Promise.resolve(),
        updateDoc: function (ref, data) { patchs.push({ chemin: ref._p, data: data }); return Promise.resolve(); } },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.persona = 'client'; S.clientNav = 'wallet'; S.proReqView = null; S.contreProp = null;
    S.account = { name: 'Un client', email: 'c@x.c', uid: 'cli1', role: 'client' };
    const base = window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 });
    const m = Object.assign(base, { reqId: 'r1', _id: 'mr1', status: 'pending',
      when: 'Aujourd’hui', dateISO: new Date().toISOString().slice(0, 10), slot: '09:00',
      slotFlex: 'day', duration: 2, preferredUid: null, preferredName: '' });
    S.missions = [m]; S.mission = m; S.propAsk = null;
    S.contrePropsRecues = { r1: [{ providerUid: 'pro1', providerName: 'Laure M.', dateISO: demain, slot: '09:00', at: 1 }] };
    window.__render();
    const v = () => (document.getElementById('view').textContent || '').replace(/\s+/g, ' ');
    const avant = v();
    const bOk = document.querySelector('[data-act="prop-ok:pro1"]');
    if (bOk) bOk.click();
    const arme = v();
    const bGo = document.querySelector('[data-act="prop-go:pro1"]');
    if (bGo) bGo.click();
    return { avant: avant, arme: arme, trouve: !!bOk, confirme: !!bGo, patchs: patchs,
      apres: v(), mission: { dateISO: m.dateISO, slot: m.slot, slotFlex: m.slotFlex, pref: m.preferredUid } };
  }, { demain: jPlus(1) });
  ok(cli.trouve && /propose un autre créneau/.test(cli.avant),
    'le client voit la proposition sur sa demande en recherche');
  ok(/Laure M\./.test(cli.avant), 'avec le nom de qui propose');
  ok(cli.confirme && /Le montant ne change pas/.test(cli.arme),
    'un premier toucher ARME et dit ce que le second fera, montant compris');
  ok(cli.patchs.length === 1 && cli.patchs[0].chemin.join('/') === 'requests/r1',
    'confirmer écrit une fois, sur la demande (' + cli.patchs.length + ')');
  const d0 = (cli.patchs[0] || { data: {} }).data;
  ok(d0.status === 'pending' && d0.providerUid === null,
    'la demande reste en recherche et n’attribue personne');
  ok(d0.directed === true && d0.preferredProviderUid === 'pro1',
    'elle est adressée à celui qui a proposé');
  ok(d0.dateISO === jPlus(1) && d0.slot === '09:00' && d0.slotFlex === 0,
    'au jour et à l’heure proposés, sans souplesse');
  ok(cli.mission.pref === 'pro1' && cli.mission.dateISO === jPlus(1),
    'et l’écran du client suit tout de suite, sans attendre l’aller-retour');
  ok(!/propose un autre créneau/.test(cli.apres),
    'la carte se tait alors : « réservée à Laure » dit la suite, deux cartes se contrediraient');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
