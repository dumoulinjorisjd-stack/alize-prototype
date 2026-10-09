/* « ON A DES MÉTIERS PAS DESTINÉS À ÊTRE DE NUIT QUI PERMETTENT DE CHOISIR DES HORAIRES
   IMPROBABLES, JE PEUX CHANGER ÇA DEPUIS LA CONSOLE ? »

   Non, et c'était vrai des vingt et un métiers : `hourOptions` déroulait 00:00 à 23:30
   par demi-heures, sans exception. On pouvait demander un ménage à trois heures du matin
   — une demande qu'aucun prestataire n'acceptera, et que le client ne verra jamais
   refusée : il attend, puis s'en va. Le seul réglage existant, « Heures de départ », vit
   PAR PRESTATION et liste des départs exacts (il a été fait pour les sorties en mer) :
   borner une journée avec lui demanderait de taper vingt-huit valeurs sur chaque ligne.

   La plage se règle donc PAR MÉTIER, dans la console. Non réglée, c'est la journée
   entière — l'état de tout le parc, et rien ne bouge tant que l'administrateur ne pose
   rien. L'épreuve mesure le SÉLECTEUR D'HEURE rendu au client. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  /* On pose la plage comme la console la pose, puis on ouvre l'écran de commande et on
     lit les heures RÉELLEMENT offertes. */
  const heures = (svc, metier) => p.evaluate(({ svc, metier }) => {
    window.__setFB({ auth: { currentUser: { uid: 'u', email: 'c@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: 'a1', label: 'Maison', zone: 'Gustavia', address: 'Lurin', geo: { lat: 17.9, lng: -62.84 }, access: '' }];
    S.addrDefault = 'a1'; S.mission = null; S.payStep = false; S.admin = null; S.clientNav = 'home';
    S.adminMetier = metier ? JSON.parse(JSON.stringify(metier)) : {};
    S.draft = window.__newMission(window.__svc.trouve(svc));
    /* On veut le SÉLECTEUR, donc un créneau précis : la journée ouverte le remplace par
       une phrase, et l'on ne mesurerait rien. */
    S.draft.slotFlex = 0;
    /* Demain : « aujourd'hui » écarte les heures déjà passées et la mesure dépendrait
       de l'heure à laquelle l'épreuve tourne. */
    const d = new Date(); d.setDate(d.getDate() + 1);
    S.draft.dateMode = 'pick';
    S.draft.dateISO = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    S.view = 'config'; window.__render();
    const sel = document.getElementById('view').querySelector('[data-cfhour]');
    if (!sel) return { absent: true };
    const vals = Array.from(sel.options).filter((x) => !x.disabled).map((x) => x.value);
    return { n: vals.length, premiere: vals[0], derniere: vals[vals.length - 1],
      choisie: S.draft.slot, dansLaListe: vals.indexOf(S.draft.slot) >= 0 };
  }, { svc, metier });

  /* A — RIEN DE POSÉ : AUCUN MÉTIER DU PARC NE CHANGE. */
  console.log('A — plage non réglée : la journée entière, comme avant');
  for (const svc of ['menage', 'coiffure', 'plomberie']) {
    const r = await heures(svc, {});
    ok(r.premiere === '00:00' && r.derniere === '23:30' && r.n === 48,
      svc + ' : ' + r.n + ' heures, de ' + r.premiere + ' à ' + r.derniere);
  }

  /* B — UNE PLAGE POSÉE BORNE LE SÉLECTEUR, aux deux bouts. */
  console.log('B — une plage posée : plus rien en dehors');
  const B = await heures('menage', { menage: { ouvre: 480, ferme: 1080 } });
  ok(B.premiere === '08:00', 'rien avant l’ouverture : la première heure est ' + B.premiere);
  ok(B.derniere === '18:00', 'rien après la fermeture : la dernière est ' + B.derniere);
  ok(B.n === 21, 'et toutes les demi-heures entre les deux (' + B.n + ')');

  /* C — L'HEURE PAR DÉFAUT EST RATTRAPÉE. Une commande naît à 14:00 ; sur un métier qui
     n'ouvre qu'à 18 h, cette heure n'existe plus — `recalerCreneau` prend la première
     tenable. Sans cela, le client partirait avec un créneau absent de sa propre liste. */
  console.log('C — le créneau par défaut est rattrapé dans la plage');
  const C = await heures('menage', { menage: { ouvre: 1080, ferme: 1320 } });
  ok(C.choisie === '18:00', 'la commande part à ' + C.choisie + ', pas à 14:00');
  ok(C.dansLaListe, 'et cette heure est bien dans la liste offerte');

  /* D — UNE PLAGE QUI NE TIENT PAS DEBOUT N'EST PAS UNE PLAGE. Un écran de commande sans
     aucune heure serait pire que des heures improbables : on retombe sur la journée. */
  console.log('D — une plage impossible ne vide jamais le sélecteur');
  for (const [nom, m] of [['fermeture avant ouverture', { ouvre: 1080, ferme: 480 }],
    ['fermeture égale à l’ouverture', { ouvre: 600, ferme: 600 }],
    ['une seule borne', { ouvre: 600 }],
    ['une heure qui n’est pas sur la demi-heure', { ouvre: 605, ferme: 1080 }]]) {
    const r = await heures('menage', { menage: m });
    ok(r.n === 48 && r.premiere === '00:00', nom + ' : la journée entière (' + r.n + ' heures)');
  }

  /* E — LES DÉPARTS DÉCLARÉS PAR UNE PRESTATION PASSENT AVANT. Ce sont des heures exactes
     posées prestation par prestation, plus précises qu'une plage de métier : les filtrer
     pourrait vider la liste en silence. */
  console.log('E — les heures de départ d’une prestation restent les siennes');
  const E = await p.evaluate(() => {
    const S = window.__S;
    S.adminMetier = { massage: { ouvre: 480, ferme: 600 } };
    S.draft = window.__newMission(window.__svc.trouve('massage'));
    const liste = window.__heures.options(Object.assign({}, S.draft,
      { acts: [{ id: 'x', nm: 'Formule', price: 100, h: '09:00, 14:00, 19:00' }] }));
    return liste.map((x) => x.s);
  });
  ok(E.join(',') === '09:00,14:00,19:00',
    'les trois départs sont offerts, 19:00 compris malgré une plage 08:00–10:00 (' + E.join(' · ') + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
