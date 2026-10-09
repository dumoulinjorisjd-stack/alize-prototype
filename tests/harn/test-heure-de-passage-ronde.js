/* « IL FAUT METTRE À JOUR POUR PROPOSER LE LENDEMAIN » — une prestataire, capture à
   l'appui, le 09/10/2026. Sur sa demande de ménage « à tout moment de la journée »,
   l'écran lui proposait : 11:48, 12:48, 13:48 … 22:48.

   DEUX DÉFAUTS DANS CETTE SEULE LISTE, et aucun des deux n'est le sujet de sa phrase.

   LES HEURES NE SONT PAS RONDES. La liste partait de l'heure COURANTE et avançait d'un
   cran. Or c'est l'heure d'ARRIVÉE que le client lit ensuite, et personne ne dit « je
   passe à 17 h 48 ». On part du prochain cran rond au-delà du plus tôt possible.

   ET LA FENÊTRE IGNORAIT LES HORAIRES DU MÉTIER. Elle allait de minuit à 23 h 30 : un
   ménage dont le client a laissé toute la journée offrait 00:00, 01:00, 02:00 — les
   « horaires improbables » déjà corrigés côté CLIENT (`hourOptions`), jamais côté
   prestataire. Un métier sans horaires réglés ne bouge pas d'une minute. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__heures && window.__heures.ronds);

  /* A — LE DÉCOUPAGE EST PUR : les bornes et le pas lui sont donnés, aucune horloge. */
  console.log('A — des crans ronds, quelle que soit l’heure qu’il est');
  const ronds = await p.evaluate(() => {
    const R = window.__heures.ronds;
    return { midi: R(708, 1410, 60), pile: R(720, 1080, 60), demi: R(545, 660, 30),
      rien: R(1390, 1410, 60), vide: R(900, 800, 60), pasNul: R(0, 100, 0) };
  });
  ok(ronds.midi[0] === 720 && ronds.midi[1] === 780,
    'à 11 h 48 le premier cran est 12 h 00, pas 12 h 48 (' + ronds.midi.slice(0, 2).join(', ') + ')');
  ok(ronds.midi[ronds.midi.length - 1] === 1380,
    'et le dernier tient dans la fenêtre (' + ronds.midi[ronds.midi.length - 1] + ')');
  ok(ronds.pile[0] === 720, 'une borne déjà ronde n’est pas repoussée d’un cran');
  ok(ronds.demi[0] === 570 && ronds.demi[1] === 600,
    'au pas de trente minutes, les crans sont les demies (' + ronds.demi.slice(0, 2).join(', ') + ')');
  /* S'IL N'Y A PLUS DE CRAN ROND, LA LISTE NE DOIT PAS SE TAIRE : il reste vingt
     minutes, elles sont proposables, et une liste vide retirerait tout bouton. */
  ok(ronds.rien.length === 1 && ronds.rien[0] === 1390,
    'aucun cran rond ne tenant, le plus tôt possible est gardé (' + ronds.rien.join(',') + ')');
  ok(ronds.vide.length === 0 && ronds.pasNul.length === 0,
    'une fenêtre à l’envers ou un pas nul ne fabriquent rien');

  /* B — LA FENÊTRE DU PRESTATAIRE SUIT LES HORAIRES DU MÉTIER. */
  console.log('B — la fenêtre respecte les horaires du métier');
  const fen = await p.evaluate(() => {
    const S = window.__S;
    const dm = new Date(Date.now() + 86400000);
    const demain = dm.getFullYear() + '-' + String(dm.getMonth() + 1).padStart(2, '0') + '-' + String(dm.getDate()).padStart(2, '0');
    const dem = { svc: 'menage', slotFlex: 'day', dateMode: 'pick', dateISO: demain };
    S.adminMetier = {};
    const sans = window.__heures.fenetre(dem), sansL = window.__heures.proposables(dem);
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    const avec = window.__heures.fenetre(dem), avecL = window.__heures.proposables(dem);
    /* UNE OUVERTURE À LA DEMIE : le cas qui prouve l'arrondi PAR LA VRAIE PORTE, et il
       est atteignable — la console règle les horaires par pas de trente minutes. */
    S.adminMetier = { menage: { ouvre: 510, ferme: 1080 } };
    const demie = window.__heures.proposables(dem);
    /* Et une souplesse « ± 2 h » autour de 09:00 ne déborde pas l'ouverture. */
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    const pm = { svc: 'menage', slotFlex: 120, slot: '09:00', dateMode: 'pick', dateISO: demain };
    const marge = window.__heures.fenetre(pm);
    S.adminMetier = {};
    return { sans: sans, sansL: sansL, avec: avec, avecL: avecL, marge: marge, demie: demie };
  });
  ok(fen.sans[0] === '00:00' && fen.sans[1] === '23:30',
    'métier sans horaires réglés : la fenêtre ne bouge pas (' + fen.sans.join(' → ') + ')');
  ok(fen.sansL[0] === '00:00', 'et elle offre encore minuit, exactement comme avant');
  ok(fen.avec[0] === '08:00' && fen.avec[1] === '18:00',
    'horaires réglés 8 h → 18 h : la fenêtre les suit (' + fen.avec.join(' → ') + ')');
  ok(fen.avecL.indexOf('00:00') < 0 && fen.avecL[0] === '08:00'
    && fen.avecL[fen.avecL.length - 1] === '18:00',
    'plus une seule heure de nuit proposée (' + fen.avecL.length + ' crans, ' + fen.avecL[0] + ' → ' + fen.avecL[fen.avecL.length - 1] + ')');
  ok(fen.demie.indexOf('08:30') < 0 && fen.demie[0] === '09:00',
    'un métier qui ouvre à 8 h 30 ne propose pas « 08:30, 09:30, 10:30 » mais des heures pleines ('
      + fen.demie.slice(0, 3).join(', ') + ')');
  ok(fen.marge[0] === '08:00' && fen.marge[1] === '11:00',
    'une souplesse de ± 2 h autour de 9 h ne déborde pas l’ouverture (' + fen.marge.join(' → ') + ')');

  /* C — ET L'ON NE REND JAMAIS IMPROPOSABLE UNE DEMANDE DÉJÀ PASSÉE. Des horaires
     resserrés après coup laisseraient une demande de 22 h sans aucun créneau : la
     fenêtre se referme sur l'heure du client plutôt que de disparaître. */
  console.log('C — une demande hors des horaires reste proposable');
  const hors = await p.evaluate(() => {
    const S = window.__S;
    const dm = new Date(Date.now() + 86400000);
    const demain = dm.getFullYear() + '-' + String(dm.getMonth() + 1).padStart(2, '0') + '-' + String(dm.getDate()).padStart(2, '0');
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    const r = { svc: 'menage', slotFlex: 60, slot: '22:00', dateMode: 'pick', dateISO: demain };
    const w = window.__heures.fenetre(r), l = window.__heures.proposables(r);
    S.adminMetier = {};
    return { w: w, l: l };
  });
  ok(hors.l.length >= 1, 'il reste au moins un créneau (' + hors.l.join(', ') + ')');

  /* C bis — LA DATE FAIT FOI, PAS SON ÉTIQUETTE. `when` est figé à la commande : une
     demande passée hier soir pour « Demain » porte encore « Demain » ce matin. On lisait
     l'étiquette, donc on ne bornait pas à l'heure courante, et le prestataire se voyait
     proposer des heures DÉJÀ PASSÉES. Une demande relue de la base ne porte d'ailleurs
     jamais `dateMode` : la projection Firestore ne l'écrit pas. */
  console.log('C bis — l’étiquette « Demain » d’hier soir ne trompe plus');
  const etiq = await p.evaluate(() => {
    const S = window.__S; S.adminMetier = {};
    const au = new Date();
    const iso = au.getFullYear() + '-' + String(au.getMonth() + 1).padStart(2, '0') + '-' + String(au.getDate()).padStart(2, '0');
    /* Telle qu'elle arrive de la base : pas de `dateMode`, un libellé périmé. */
    const vieille = { svc: 'menage', slotFlex: 'day', when: 'Demain', dateISO: iso };
    const w = window.__heures.fenetre(vieille);
    /* Et une vraie demande de demain n'est PAS bornée à l'heure qu'il est. */
    const dm = new Date(Date.now() + 86400000);
    const dIso = dm.getFullYear() + '-' + String(dm.getMonth() + 1).padStart(2, '0') + '-' + String(dm.getDate()).padStart(2, '0');
    const w2 = window.__heures.fenetre({ svc: 'menage', slotFlex: 'day', when: 'Demain', dateISO: dIso });
    const maintenant = au.getHours() * 60 + au.getMinutes();
    return { debut: w[0], demain: w2[0], maintenant: maintenant };
  });
  const minDe = (s) => (+s.split(':')[0]) * 60 + (+s.split(':')[1]);
  ok(minDe(etiq.debut) >= etiq.maintenant,
    'une demande datée d’aujourd’hui est bornée à l’heure qu’il est, quoi que dise son libellé ('
      + etiq.debut + ')');
  ok(etiq.demain === '00:00',
    'et une vraie demande de demain ne l’est pas (' + etiq.demain + ')');

  /* D — SUR L'ÉCRAN RÉEL DU PRESTATAIRE, pas seulement dans les fonctions. */
  console.log('D — la carte « Proposez votre heure de passage », telle qu’elle se voit');
  const carte = await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = 'Prestataire';
    S.account = { name: 'Prestataire', email: 'p@x.c', uid: 'pro1', role: 'artisan' };
    S.mission = null; S._accepting = false; S.proMissions = []; S.proCats = ['menage'];
    S.proSiteMode = 'both'; S.avail = null; S.proOnline = true; S.proReqSlot = null; S.proReqPick = false;
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    const dm = new Date(Date.now() + 86400000);
    const demain = dm.getFullYear() + '-' + String(dm.getMonth() + 1).padStart(2, '0') + '-' + String(dm.getDate()).padStart(2, '0');
    S._openReqBrut = [{ id: 'r1', status: 'pending', clientUid: 'cli1', clientName: 'Un client',
      service: 'menage', serviceName: 'Ménage', svc: 'menage', when: 'Demain', dateMode: 'pick',
      dateISO: demain, slot: '09:00', slotFlex: 'day', zone: 'Lorient', total: 70, unit: 'h',
      duration: 2, locationMode: 'domicile' }];
    S.openRequests = window.__fil.visibles(S._openReqBrut);
    S.proReqView = 'r1';
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    window.__render();
    const btns = Array.from(document.querySelectorAll('[data-proreqslot]'))
      .map((x) => x.dataset.proreqslot).filter((x) => x !== '__pick');
    S.adminMetier = {};
    return { btns: btns, txt: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ') };
  });
  ok(/Proposez votre heure de passage/.test(carte.txt), 'la carte est bien là');
  ok(carte.btns.length > 0 && carte.btns.every((s) => /:00$/.test(s)),
    'toutes les heures offertes sont rondes (' + carte.btns.slice(0, 4).join(', ') + '…)');
  ok(carte.btns[0] === '08:00' && carte.btns[carte.btns.length - 1] === '18:00',
    'et elles tiennent dans les horaires du métier (' + carte.btns[0] + ' → ' + carte.btns[carte.btns.length - 1] + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
