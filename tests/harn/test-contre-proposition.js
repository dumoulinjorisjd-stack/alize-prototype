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

  /* F — L'ÉCRAN DU PRESTATAIRE, UNE SEULE CARTE. Il y en avait deux et elles se
     marchaient dessus : « Proposez votre heure de passage » et « Proposer un autre
     moment » offraient toutes deux de choisir une heure. Une carte, deux listes — jour,
     heure — et le bouton du bas DIT lequel des deux gestes il accomplit. */
  console.log('F — une seule carte : quand passez-vous ?');
  const pro = await p.evaluate(({ demain, apres }) => {
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
    S.proReqSlot = null; S.proReqJour = null; S.contrePropEnvoyees = {};
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    S.openRequests = [{ id: 'r1', status: 'pending', clientUid: 'cli1', clientName: 'Un client',
      /* POUR DEMAIN, et non pour aujourd'hui : passé l'heure de fermeture du métier,
         le jour courant n'a plus une seule heure tenable et l'épreuve mesurerait
         l'heure à laquelle elle tourne au lieu de ce qu'elle annonce. */
      service: 'menage', serviceName: 'Ménage', when: 'Demain', dateISO: demain,
      slot: '09:00', slotFlex: 'day', zone: 'Lorient', total: 70, unit: 'h', duration: 2,
      rate: 35, locationMode: 'domicile' }];
    S.proReqView = 'r1';
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    window.__render();
    const lire = function () {
      const v = document.getElementById('view');
      const j = v.querySelector('[data-passagejour]'), h = v.querySelector('[data-passageheure]');
      const bt = v.querySelector('.footcta .btn.accept');
      return { jours: j ? Array.from(j.options).map((o) => o.value) : [],
        jour: j ? j.value : null, heures: h ? Array.from(h.options).map((o) => o.value) : [],
        heure: h ? h.value : null, bouton: bt ? (bt.textContent || '').trim() : '',
        acte: bt ? bt.dataset.act : '',
        txt: (v.textContent || '').replace(/\s+/g, ' ') };
    };
    const memeJour = lire();
    /* ON CHOISIT DEMAIN : le même geste, et la nature du bouton doit changer. */
    const sj = document.querySelector('[data-passagejour]');
    if (sj && memeJour.jours.indexOf(apres) >= 0) { sj.value = apres;
      sj.dispatchEvent(new Event('change', { bubbles: true })); }
    const autreJour = lire();
    const bt = document.querySelector('.footcta .btn.accept'); if (bt) bt.click();
    return { memeJour: memeJour, autreJour: autreJour, ecrits: ecrits,
      deuxCartes: /Proposer un autre moment/.test(memeJour.txt) };
  }, { demain: jPlus(1), apres: jPlus(2) });
  ok(!pro.deuxCartes, 'il n’y a plus de seconde carte « Proposer un autre moment »');
  ok(pro.memeJour.jours.length > 1 && pro.memeJour.heures.length > 1,
    'une carte, deux listes : le jour et l’heure (' + pro.memeJour.jours.length + ' jours, '
      + pro.memeJour.heures.length + ' heures)');
  ok(pro.memeJour.jour === jPlus(1),
    'elle s’ouvre sur le jour que le client a demandé, jamais sur un autre');
  ok(pro.memeJour.acte && pro.memeJour.acte.indexOf('accept-req:') === 0,
    'dans ce que le client a accepté, le bouton ACCEPTE (' + pro.memeJour.acte + ')');
  ok(/j’arrive à/.test(pro.memeJour.bouton), 'et il dit à quelle heure');
  ok(pro.autreJour.jour === jPlus(2), 'on peut choisir un autre jour');
  ok(pro.autreJour.acte && pro.autreJour.acte.indexOf('passage-envoyer:') === 0,
    'et le bouton devient « envoyer ma proposition » (' + pro.autreJour.acte + ')');
  ok(/Envoyer ma proposition/.test(pro.autreJour.bouton) && /à /.test(pro.autreJour.bouton),
    'en nommant le jour et l’heure qu’il propose (' + pro.autreJour.bouton + ')');
  ok(/pas ce que le client a demandé/.test(pro.autreJour.txt),
    'la carte dit pourquoi ce n’est plus une acceptation');
  ok(pro.ecrits.length === 1, 'le bouton écrit une fois, et une seule (' + pro.ecrits.length + ')');
  const e0 = pro.ecrits[0] || { chemin: [], data: {} };
  ok(e0.chemin.join('/') === 'requests/r1/propositions/pro1',
    'à sa place, sous SON uid (' + e0.chemin.join('/') + ')');
  ok(Object.keys(e0.data).sort().join(',') === 'at,dateISO,providerName,providerUid,slot',
    'avec les cinq champs de la liste fermée (' + Object.keys(e0.data).sort().join(',') + ')');
  ok(e0.data.dateISO === jPlus(2), 'et le jour choisi, jamais deviné');

  /* ET SI LE JOUR DU CLIENT N'A PLUS UNE SEULE HEURE TENABLE — il est 19 h, le métier
     ferme à 18 h, la demande est pour aujourd'hui — la carte ne s'ouvre pas sur une
     liste vide : elle part du premier jour qui a quelque chose à offrir. */
  console.log('F bis — un jour sans heure disponible ne laisse pas la carte vide');
  const vide = await p.evaluate(({ auj }) => {
    const S = window.__S;
    S.proReqJour = null; S.proReqSlot = null;
    /* Un métier dont la journée est DÉJÀ finie, quelle que soit l'heure de l'épreuve. */
    S.adminMetier = { menage: { ouvre: 0, ferme: 30 } };
    const r = { id: 'rv', status: 'pending', service: 'menage', serviceName: 'Ménage',
      when: 'Aujourd’hui', dateISO: auj, slot: '09:00', slotFlex: 'day', duration: 2 };
    const c = window.__prop.choisi(r);
    S.adminMetier = {};
    return { jour: c.jour, n: c.heures.length, slot: c.slot, demande: auj };
  }, { auj: jPlus(0) });
  ok(vide.n > 0, 'la liste des heures n’est jamais vide (' + vide.n + ')');
  ok(vide.jour !== vide.demande,
    'elle s’ouvre sur un autre jour, celui qui a des heures (' + vide.jour + ')');

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

  /* H — UNE FOIS QUE LE CLIENT A TRANCHÉ, LA PORTE SE FERME. « À partir du moment où le
     client a accepté l'une des propositions, la demande de service n'apparaît plus et il
     ne reçoit plus de contre-proposition. » Accepter rend la demande DIRIGÉE, mais son
     statut reste « pending » — le prestataire choisi doit encore la confirmer. Sans une
     garde sur la DIRECTION, un confrère continuerait d'en proposer et le client verrait
     arriver des créneaux pour une prestation déjà décidée. */
  console.log('H — le client a tranché : plus de demande au fil, plus de proposition');
  const ferme = await p.evaluate(({ demain }) => {
    const S = window.__S;
    S.persona = 'pro'; S.proCats = ['menage']; S.proSiteMode = 'both'; S.avail = null;
    S.proOnline = true; S.contreProp = null; S.contrePropEnvoyees = {}; S.adminMetier = {};
    const base = { id: 'r1', status: 'pending', clientUid: 'cli1', clientName: 'Un client',
      service: 'menage', serviceName: 'Ménage', when: 'Aujourd’hui',
      dateISO: new Date().toISOString().slice(0, 10), slot: '09:00', slotFlex: 'day',
      zone: 'Lorient', total: 70, unit: 'h', duration: 2, locationMode: 'domicile' };
    /* CE QUE VOIT UN CONFRÈRE (uid pro9) une fois la demande dirigée vers pro1. */
    window.__setFB({ auth: { currentUser: { uid: 'pro9', email: 'x@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const dirigee = Object.assign({}, base, { directed: true, preferredProviderUid: 'pro1',
      preferredProviderName: 'Laure M.', dateISO: demain, slot: '09:00', slotFlex: 0 });
    const vuParAutre = window.__fil.visibles([dirigee]).length;
    const vuParPersonne = window.__fil.visibles([base]).length;
    /* ET CELUI À QUI ELLE EST ADRESSÉE ne se voit plus offrir de proposer : il accepte. */
    const boutonDirigee = (window.__blocCP(dirigee) || '').length > 0;
    const boutonOuverte = (window.__blocCP(base) || '').length > 0;
    return { vuParAutre: vuParAutre, vuParPersonne: vuParPersonne,
      boutonDirigee: boutonDirigee, boutonOuverte: boutonOuverte };
  }, { demain: jPlus(1) });
  ok(ferme.vuParPersonne === 1, 'tant que personne n’a été choisi, la demande est au fil de tous');
  ok(ferme.vuParAutre === 0,
    'une fois le créneau accepté, elle disparaît du fil des autres prestataires');
  ok(ferme.boutonOuverte === true, 'et la carte « Quand passez-vous ? » s’offre sur une demande ouverte');
  ok(ferme.boutonDirigee === false,
    'mais plus du tout une fois le client décidé : celui qui est choisi n’a qu’à confirmer');
  /* LA BASE LE TIENT AUSSI, et c'est elle qui compte : un écran se contourne. */
  const blocR = RULES.slice(RULES.indexOf('match /propositions/{proUid}'), RULES.indexOf('match /propositions/{proUid}') + 2400);
  ok(/parent\(\)\.get\('directed', false\) == false/.test(blocR),
    'la règle refuse toute nouvelle proposition sur une demande déjà dirigée');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
