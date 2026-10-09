/* « SI ELLE MET EN LIGNE, LA MISSION VA APPARAÎTRE ? »

   Posée devant la toute première vraie mission du service, le prestataire pressenti
   ayant son interrupteur coupé. La réponse, telle que le code était écrit, était NON,
   ou plutôt « pas avant longtemps » : le filtre du fil vivait DANS le corps de
   l'instantané Firestore. La liste n'était donc reconstruite que lorsqu'une AUTRE
   personne touchait une demande en attente.

   Or TROIS gestes du prestataire changent son propre filtre sans écrire sur aucune
   demande : son interrupteur, sa grille de disponibilité, son mode de lieu. Il rallumait
   son interrupteur, l'écran se redessinait depuis une liste calculée pendant qu'il était
   hors ligne, c'est-à-dire VIDE, et il lisait « aucune mission disponible » en étant en
   ligne. Jusqu'au prochain démarrage de l'application, ou jusqu'à ce qu'un inconnu
   bouge quelque chose.

   LE FIL SE REJOUE DEPUIS LE BRUT GARDÉ, sans réseau et sans réabonnement : pas de
   squelettes, pas de seconde salve de notifications, et la réponse est OUI, tout de
   suite. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

/* Le jour de la semaine de la demande, pour que la grille de disponibilité soit écrite
   sur la BONNE ligne : on ne devine pas, on demande à l'application. */
(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__fil);

  /* LE SDK FIREBASE NE SE CHARGE PAS DANS CE CONTENEUR, et son échec ASYNCHRONE remet
     `FB` à nul — l'écran bascule alors sur « Liste indisponible », et l'épreuve rougit
     pour une raison qui n'a rien à voir avec ce qu'elle mesure. Sous charge, le moment
     de cet échec se déplace : d'où une rougeur intermittente. On rattache donc le faux
     Firebase JUSTE AVANT chaque mesure, jamais une seule fois au début. */
  const RATTACHER = `window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
    f: { doc: function(){return {};}, setDoc: function(){return Promise.resolve();},
      getDoc: function(){return Promise.resolve({ exists: function(){return false;}, data: function(){return {};} });},
      collection: function(){return {};}, onSnapshot: function(){return function(){};} },
    fn: { httpsCallable: function(){ return function(){ return new Promise(function(){}); }; } }, functions: {} });`;
  const rattacher = () => p.evaluate(RATTACHER);

  /* Un prestataire ménage validé, et UNE demande de ménage en attente : exactement la
     situation réelle du jour où la question a été posée. */
  const poser = (etat) => p.evaluate((etat) => {
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = 'Prestataire';
    S.account = { name: 'Prestataire', email: 'p@x.c', uid: 'pro1', role: 'artisan' };
    S.mission = null; S._accepting = false; S.proMissions = []; S.proSkipped = []; S.proSkipAt = {};
    S.proCats = ['menage']; S.proSiteMode = 'both'; S.avail = null;
    S.proOnline = etat.online; S.openRequests = []; S._openReqBrut = null;
    /* Le brut tel que l'instantané le pose : la liste des demandes en attente. */
    const dm = new Date(Date.now() + 86400000);
    const iso = dm.getFullYear() + '-' + String(dm.getMonth() + 1).padStart(2, '0') + '-' + String(dm.getDate()).padStart(2, '0');
    S._openReqBrut = [{ id: 'r1', status: 'pending', clientUid: 'cli1', clientName: 'Un client',
      service: 'menage', serviceName: 'Ménage', when: 'Demain', dateISO: iso, slot: '09:00',
      slotFlex: 0, zone: 'Lorient', total: 105, unit: 'h', duration: 3, locationMode: 'domicile' }];
    S.openRequests = window.__fil.visibles(S._openReqBrut);
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    window.__render();
    return { dateISO: iso, n: S.openRequests.length };
  }, etat);

  console.log('A — hors ligne, le fil est vide : c’est voulu, l’interrupteur coupe');
  const off = await poser({ online: false });
  ok(off.n === 0, 'aucune demande visible interrupteur coupé (' + off.n + ')');

  console.log('B — il le rallume, et la mission paraît SANS attendre qu’un tiers bouge');
  await rattacher();
  const apres = await p.evaluate(() => {
    const S = window.__S;
    /* Le geste réel : le bouton de la carte « Disponibilité ». */
    const bt = document.querySelector('[data-act="toggle-online"]');
    const trouve = !!bt;
    if (bt) bt.click(); else { S.proOnline = true; window.__fil.rafraichit(); }
    return { trouve: trouve, online: S.proOnline, n: (S.openRequests || []).length,
      texte: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ') };
  });
  ok(apres.trouve, 'le bouton de l’interrupteur est bien sur l’écran missions');
  ok(apres.online === true, 'le toucher le remet en ligne');
  ok(apres.n === 1, 'et la mission reparaît immédiatement (' + apres.n + ')');
  /* La phrase de vide est « Aucune mission disponible pour l'instant » : c'est elle qu'on
     nomme, et pas « aucune mission » tout court — l'encart des notifications dit « Ne
     manquez aucune mission », et la sonde passait au vert sans mesurer le bon fait. */
  ok(/Missions disponibles · 1/.test(apres.texte) && /Ménage/.test(apres.texte),
    'l’écran la compte et la nomme');
  ok(!/Aucune mission disponible/.test(apres.texte),
    'et il ne dit plus « Aucune mission disponible »');
  ok(/Vous êtes en ligne/.test(apres.texte), 'la carte confirme qu’il est en ligne');

  console.log('C — et il la perd s’il se recoupe : la porte joue dans les deux sens');
  await rattacher();
  const recoupe = await p.evaluate(() => {
    const bt = document.querySelector('[data-act="toggle-online"]'); if (bt) bt.click();
    return { online: window.__S.proOnline, n: (window.__S.openRequests || []).length };
  });
  ok(recoupe.online === false && recoupe.n === 0, 'recoupé, le fil se vide de nouveau');

  /* D — LA GRILLE DE DISPONIBILITÉ ET LE MODE DE LIEU SONT LE MÊME DÉFAUT. Ce ne sont
     pas trois corrections, c'en est une : « mon filtre a changé, refais la liste ». */
  console.log('D — la grille de disponibilité change le filtre, elle aussi');
  await rattacher();
  const dispo = await p.evaluate((dateISO) => {
    const S = window.__S;
    S.proOnline = true; window.__fil.rafraichit();
    const avant = (S.openRequests || []).length;
    /* On ferme le jour de la demande, sur la ligne que l'application elle-même désigne :
       les clés de jour sont les siennes, on ne les devine pas. */
    const q = dateISO.split('-'), dt = new Date(+q[0], (+q[1]) - 1, +q[2]);
    const cle = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dt.getDay()];
    S.avail = {}; S.avail[cle] = { n: false, m: false, a: false, s: false };
    window.__fil.rafraichit();
    const ferme = (S.openRequests || []).length;
    S.avail[cle] = { n: true, m: true, a: true, s: true };
    window.__fil.rafraichit();
    return { avant: avant, ferme: ferme, rouvert: (S.openRequests || []).length, cle: cle };
  }, off.dateISO);
  ok(dispo.avant === 1, 'en ligne et grille ouverte, la mission est là');
  ok(dispo.ferme === 0, 'le jour fermé, elle disparaît');
  ok(dispo.rouvert === 1, 'le jour rouvert, elle revient — sans réseau ni réabonnement');

  /* Le filtre de LIEU ne joue que sur les métiers qui peuvent se faire en salon : le
     ménage n'en est pas, et l'éprouver sur lui ne mesurerait rien. */
  console.log('E — le mode de lieu aussi');
  await rattacher();
  const lieu = await p.evaluate(() => {
    const S = window.__S;
    S.proCats = ['coiffure']; S.proSiteMode = 'both'; S.avail = null; S.proOnline = true;
    S._openReqBrut = [Object.assign({}, S._openReqBrut[0], { id: 'rc', service: 'coiffure',
      serviceName: 'Coiffure', locationMode: 'domicile' })];
    window.__fil.rafraichit();
    const both = (S.openRequests || []).length;
    S.proSiteMode = 'salon'; window.__fil.rafraichit();
    const salon = (S.openRequests || []).length;
    S.proSiteMode = 'domicile'; window.__fil.rafraichit();
    return { both: both, salon: salon, domicile: (S.openRequests || []).length };
  });
  ok(lieu.both === 1, 'qui fait les deux voit la demande à domicile');
  ok(lieu.salon === 0, 'qui ne reçoit QU’en salon ne la voit plus');
  ok(lieu.domicile === 1, 'et qui se déplace la revoit, sans réseau');

  /* F — SANS INSTANTANÉ REÇU, IL N'Y A RIEN À REJOUER, et l'on ne prétend pas le
     contraire : la porte rend faux plutôt que d'écrire une liste vide par-dessus. */
  console.log('F — sans instantané, la porte ne fabrique rien');
  await rattacher();
  const vide = await p.evaluate(() => {
    const S = window.__S; S._openReqBrut = null; S.openRequests = [{ id: 'gardee' }];
    const rendu = window.__fil.rafraichit();
    return { rendu: rendu, n: (S.openRequests || []).length };
  });
  ok(vide.rendu === false && vide.n === 1,
    'elle rend faux et ne touche pas ce qui est déjà à l’écran');

  /* G — LES TROIS GESTES PASSENT PAR LA PORTE, et pas par trois recopies. Deux d'entre
     eux (les disponibilités, le mode de lieu) vivent derrière plusieurs écrans : ils se
     lisent dans la source plutôt que de se toucher. ON LIT LA SOURCE DU HARNAIS, pas
     `index.html` du dépôt : lire le dépôt ferait passer cette section au vert alors que
     le navigateur exécute, lui, une version modifiée — c'est-à-dire une sonde qui ne
     peut pas rougir pour la raison qu'elle annonce. */
  const src = fs.readFileSync(path.join(RACINE, 'tests/harn/app.html'), 'utf8');
  ok((src.match(/rafraichirDemandes\(\)/g) || []).length >= 4,
    'la porte est appelée par les trois gestes (plus sa définition)');
  ok(/case 'toggle-online':[^\n]*rafraichirDemandes\(\)/.test(src), 'l’interrupteur');
  ok(/case 'save-dispo':[^\n]*rafraichirDemandes\(\)/.test(src), 'les disponibilités');
  ok(/sitemode[^\n]*rafraichirDemandes\(\)/.test(src), 'le mode de lieu');

  /* H — ET DEPUIS LA CONSOLE. L'écoute de sa fiche est VIVANTE et reçoit déjà chaque
     retouche, mais elle ne lisait ni son interrupteur ni ses métiers : l'administrateur
     pouvait le remettre en ligne sans que son téléphone l'apprenne avant le prochain
     démarrage. C'est la seconde moitié du même défaut, et c'est le chemin qu'emprunte le
     bouton « Remettre tout le monde en ligne ». */
  console.log('H — l’administrateur le remet en ligne, et son téléphone l’apprend');
  const distant = await p.evaluate(() => {
    const S = window.__S;
    let cb = null;
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(),
        onSnapshot: (ref, fn) => { cb = fn; return () => {}; } },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    /* La section précédente a vidé le brut exprès : on repose la demande de ménage. */
    const dm = new Date(Date.now() + 86400000);
    const iso = dm.getFullYear() + '-' + String(dm.getMonth() + 1).padStart(2, '0') + '-' + String(dm.getDate()).padStart(2, '0');
    S._openReqBrut = [{ id: 'r1', status: 'pending', clientUid: 'cli1', clientName: 'Un client',
      service: 'menage', serviceName: 'Ménage', when: 'Demain', dateISO: iso, slot: '09:00',
      slotFlex: 0, zone: 'Lorient', total: 105, unit: 'h', duration: 3, locationMode: 'domicile' }];
    S.proCats = ['menage']; S.proSiteMode = 'both'; S.avail = null; S.proStatus = 'approved';
    S.proOnline = false; window.__fil.rafraichit();
    const avant = (S.openRequests || []).length;
    window.__fil.statut('pro1');
    const branche = !!cb;
    /* La fiche telle que la console vient de l'écrire. */
    if (cb) cb({ exists: () => true, data: () => ({ status: 'valide', online: true, cats: ['menage'] }) });
    const apres = (S.openRequests || []).length, etat = S.proOnline;
    /* Et un métier ajouté depuis la console ouvre les demandes correspondantes. */
    S.proCats = ['jardin']; window.__fil.rafraichit();
    const autreMetier = (S.openRequests || []).length;
    if (cb) cb({ exists: () => true, data: () => ({ status: 'valide', online: true, cats: ['jardin', 'menage'] }) });
    return { avant: avant, branche: branche, apres: apres, etat: etat,
      autreMetier: autreMetier, rattache: (S.openRequests || []).length,
      cats: (S.proCats || []).slice() };
  });
  ok(distant.branche, 'l’écoute de la fiche est bien branchée');
  ok(distant.avant === 0 && distant.etat === true && distant.apres === 1,
    'coupé puis remis en ligne depuis la console : la mission paraît sans redémarrage');
  ok(distant.autreMetier === 0 && distant.rattache === 1 && distant.cats.length === 2,
    'et un métier ajouté depuis la console ouvre ses demandes, tout de suite');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
