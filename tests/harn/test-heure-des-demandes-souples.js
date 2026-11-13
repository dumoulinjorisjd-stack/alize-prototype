/* « J'AI L'IMPRESSION QUE TOUTES LES COMMANDES SONT POUR 14H00 » — l'éditeur, le 13/11/2026.
   C'était à moitié vrai. Toute commande démarre à 14:00 (valeur de départ du menu, qu'on
   GARDE : décision de l'éditeur). Mais le ménage, le jardin et la piscine partent « à
   tout moment de la journée » : le menu des heures est grisé, le client n'en choisit
   aucune — et la demande s'enregistrait quand même avec 14:00, que la console, les cartes
   du prestataire, l'en-tête d'une discussion et l'e-mail aux prestataires affichaient.

   Ce que l'on tient ici :
     A — l'affichage dit ce que le client a dit, et une heure CONVENUE l'emporte toujours ;
     B — une demande souple s'enregistre SANS heure, une demande ordinaire garde la sienne ;
     C — 14:00 reste la valeur de départ d'une commande (décision de l'éditeur) ;
     D — plus aucun écran ne recolle le jour et l'heure à la main ; l'e-mail suit. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({viewport: {width: 390, height: 844}});
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html'));
  await p.waitForFunction(() => window.__S && window.__quand && window.__newMission && window.__svc);

  console.log('A — l’affichage dit ce que le client a dit');
  const A = await p.evaluate(() => {
    const q = window.__quand.txt;
    return {
      soupleBrouillon: q({svc: 'menage', when: 'Aujourd’hui', slot: '14:00', slotFlex: 'day', status: 'draft'}),
      soupleFiche: q({service: 'menage', when: 'Demain', slot: '14:00', slotFlex: 'day', status: 'pending'}),
      soupleNeuve: q({service: 'jardin', when: 'Demain', slot: '', slotFlex: 'day', status: 'pending'}),
      semaine: q({svc: 'piscine', when: 'Lundi', slot: '14:00', slotFlex: 'week', status: 'pending'}),
      ordinaire: q({svc: 'coiffure', when: 'Demain', slot: '14:00', slotFlex: 0, status: 'pending'}),
      convenue: q({service: 'menage', when: 'Demain', slot: '', slotFlex: 'day', status: 'accepted', acceptedSlot: '09:30'}),
      missionAcceptee: q({svc: 'menage', when: 'Demain', slot: '10:00', slotFlex: 'day', status: 'accepted'}),
      proposee: q({svc: 'menage', when: 'Demain', slot: '', slotFlex: 'day', status: 'pending', proposedSlot: '11:00'}),
      marge: q({svc: 'menage', when: 'Demain', slot: '15:00', slotFlex: 60, status: 'pending'}),
      colis: q({svc: 'colis', when: 'Aujourd’hui', slot: '14:00', dateFrom: '2026-11-13', dateTo: '2026-11-20'}),
    };
  });
  ok(A.soupleBrouillon === 'Aujourd’hui · à tout moment de la journée', 'une demande « à tout moment » ne montre plus 14:00 (' + A.soupleBrouillon + ')');
  ok(A.soupleFiche === 'Demain · à tout moment de la journée', 'les fiches déjà enregistrées avec 14:00 aussi — lues côté console (champ « service »)');
  ok(A.soupleNeuve === 'Demain · à tout moment de la journée', 'une fiche neuve, sans heure, se dit pareil');
  ok(A.semaine === 'Lundi · n’importe quel jour de la semaine', 'souplesse sur la semaine : dite telle quelle');
  ok(A.ordinaire === 'Demain · 14:00', 'une commande ordinaire montre son heure — 14:00 compris, c’est un vrai choix');
  ok(A.convenue === 'Demain · 09:30', 'l’heure retenue par le prestataire l’emporte sur la souplesse');
  ok(A.missionAcceptee === 'Demain · 10:00', 'sur une mission acceptée, `slot` porte l’heure convenue : on la montre');
  ok(A.proposee === 'Demain · 11:00', 'une heure proposée se montre');
  ok(A.marge === 'Demain · 15:00', 'une marge (± 1 h) garde l’heure autour de laquelle elle s’ouvre');
  ok(/Retrait entre le/.test(A.colis) && !/14:00/.test(A.colis), 'un colis garde sa fenêtre de dates (le correctif d’avant reste)');

  console.log('B — ce qui s’enregistre');
  const B = await p.evaluate(async () => {
    const S = window.__S, ecrits = [];
    window.__setFB({auth: {currentUser: {uid: 'u1', email: 'c@e.fr'}}, db: {},
      f: {doc: () => ({id: 'req' + (ecrits.length + 1)}), collection: () => ({}), setDoc: (r, d) => { ecrits.push(d); return Promise.resolve(); },
        serverTimestamp: () => 0, getDoc: () => Promise.resolve({exists: () => false, data: () => ({})})},
      fn: {httpsCallable: () => () => Promise.resolve({data: {}})}, functions: {}});
    S.account = {name: 'Camille', email: 'c@e.fr'};
    const souple = window.__newMission(window.__svc.trouve('menage'));
    souple.dateISO = '2026-11-20'; souple.when = 'Vendredi';
    await window.__quand.persiste(souple);
    // Le même ménage, mais le client a décoché « à tout moment » : l'heure est la sienne.
    const ordinaire = window.__newMission(window.__svc.trouve('menage'));
    ordinaire.dateISO = '2026-11-20'; ordinaire.when = 'Vendredi'; ordinaire.slotFlex = 0;
    await window.__quand.persiste(ordinaire);
    // Chaque demande écrit aussi sa fiche privée (adresse) : on ne garde que les fiches publiques.
    const fiches = ecrits.filter((d) => d && ('slotFlex' in d));
    ecrits.length = 0; fiches.forEach((d) => ecrits.push(d));
    return {flex: souple.slotFlex, docSouple: ecrits[0] && ecrits[0].slot, local: souple.slot,
      flexDoc: ecrits[0] && ecrits[0].slotFlex, docOrdinaire: ecrits[1] && ecrits[1].slot, n: ecrits.length};
  });
  ok(B.n === 2, 'les deux demandes ont bien été écrites (assertion arrière : on mesure une vraie écriture)');
  ok(B.flex === 'day' && B.flexDoc === 'day', 'le ménage part bien « à tout moment de la journée »');
  ok(B.docSouple === '', 'la demande souple s’enregistre SANS heure (avant : « 14:00 »)');
  ok(B.local === '', 'la mission locale aussi : sa clé de créneau est celle du serveur');
  ok(B.docOrdinaire === '14:00', 'une commande ordinaire garde l’heure qu’elle porte');

  console.log('C — 14:00 reste la valeur de départ (décision de l’éditeur)');
  const C = await p.evaluate(() => ({m: window.__newMission(window.__svc.trouve('menage')).slot, c: window.__newMission(window.__svc.trouve('coiffure')).slot}));
  ok(C.m === '14:00' && C.c === '14:00', 'une commande neuve démarre toujours à 14:00');
  ok(/unit:r\.unit\|\|'h',slot:r\.slot\|\|'14:00'/.test(src) && /slot:old\.slot\|\|'14:00'/.test(src),
    'recommander une demande souple redonne 14:00 si l’on décoche « à tout moment »');

  console.log('D — aucun écran ne recolle le jour et l’heure à la main');
  const restes = [/\$\{esc\(m\.when\|\|''\)\} · \$\{esc\(m\.slot\|\|''\)\}/, /\[r\.when,r\.slot,r\.zone\]/, /\$\{esc\(t\.when\)\} \$\{esc\(t\.slot\)\}/,
    /\$\{esc\(m\.when\)\} \$\{esc\(m\.slot\)\}/, /\[d\.when,d\.slot\]/, /\[x\.when,x\.slot\]/, /S\.mission\.when\+' '\+S\.mission\.slot/];
  const vus = restes.filter((r) => r.test(src));
  ok(vus.length === 0, 'les sept recollages d’avant ont disparu' + (vus.length ? ' — reste : ' + vus.join(' ') : ''));
  ok(/slotFlex:r\.slotFlex\|\|0,status:r\.status/.test(src), 'la liste des discussions de la console garde la souplesse pour la dire');
  { const i = fn.indexOf('const quandM'); const bloc = fn.slice(Math.max(0, i - 600), i + 80);
    const soupleM = /soupleM = \(r\.slotFlex === 'day' \|\| r\.slotFlex === 'week'\)/.test(bloc);
    // On rejoue la phrase de l'e-mail telle qu'elle est écrite.
    const m = /const soupleM[\s\S]*?const quandM = [^;]+;/.exec(bloc);
    let dit = '';
    if (m) { const r = {when: 'Demain', slot: '14:00', slotFlex: 'day'}; dit = (new Function('r', m[0] + ' return quandM;'))(r); }
    ok(soupleM && dit === 'Demain, à tout moment de la journée', 'l’e-mail aux prestataires ne dit plus « à 14:00 » (' + dit + ')');
    const r2 = {when: 'Demain', slot: '14:00', slotFlex: 0};
    const dit2 = m ? (new Function('r', m[0] + ' return quandM;'))(r2) : '';
    ok(dit2 === 'Demain à 14:00', 'et garde l’heure d’une commande ordinaire'); }

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.log('KO : l’épreuve n’a pas pu aller au bout — ' + e.message); process.exit(1); });
