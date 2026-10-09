/* « IL FAUT QUE LES CONDITIONS D'ANNULATION SOIENT COMPLÈTEMENT SUPPRIMABLES, ET QU'IL
   PUISSE Y AVOIR ANNULATION À 4 H AVANT LA PRESTATION. »

   La part retenue descendait déjà jusqu'à 0 dans la console, mais ZÉRO N'ÉTAIT PAS
   ENTENDU PARTOUT : `cancelPolicy` déclarait l'annulation « payante » pour 0,00 €, donc
   le client passait par l'écran de confirmation d'une indemnité qui n'existe pas. Et sur
   l'écran de suivi, la phrase disait « 8 h » et « 50 % » EN DUR, sur un écran où chaque
   métier a ses propres conditions depuis longtemps : un métier réglé autrement annonçait
   au client exactement autre chose que ce qui lui serait retenu.

   Le délai le plus court offert était 8 heures ; 4 heures rejoint la liste FERMÉE. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1100 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__arrhes);

  /* L'écran de SUIVI d'une mission acceptée, où le client lit ce qu'une annulation
     coûterait. Le rendez-vous est demain : on est donc au-delà de tout délai court. */
  const suivi = (arrhes, heuresAvant) => p.evaluate(({ arrhes, heuresAvant }) => {
    window.__setFB({ auth: { currentUser: { uid: 'u', email: 'c@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = []; S.draft = null; S.payStep = false; S.admin = null; S.clientNav = 'wallet';
    S.adminArrhes = arrhes ? JSON.parse(JSON.stringify(arrhes)) : {};
    const d = new Date(Date.now() + heuresAvant * 3600000);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    S.mission = { reqId: 'r1', svc: 'menage', svcName: 'Ménage', status: 'accepted',
      when: 'Demain', dateISO: iso, slot: String(d.getHours()).padStart(2, '0') + ':00',
      duration: 3, unit: 'h', rate: 35, zone: 'Gustavia', address: 'Lurin', acts: null,
      chat: [], support: {}, finalHours: null, rating: 0,
      provider: { nm: 'Prestataire A', ini: 'PA' } };
    window.__render();
    const t = (document.getElementById('view').textContent || '').replace(/\s+/g, ' ');
    return { txt: t, pol: window.__arrhes.politique ? window.__arrhes.politique(S.mission) : null };
  }, { arrhes, heuresAvant });

  /* A — LES CONDITIONS SE RETIRENT COMPLÈTEMENT. */
  console.log('A — part retenue à zéro : plus aucune condition d’annulation');
  const z = await suivi({ menage: { pct: 0, h: 8 } }, 2);
  ok(/Annulation gratuite à tout moment/.test(z.txt),
    'l’écran dit que l’annulation est gratuite à tout moment');
  ok(!/indemnité/.test(z.txt) || /aucune indemnité/.test(z.txt),
    'et ne promet aucune indemnité');
  ok(z.pol && z.pol.free === true && z.pol.fee === 0 && z.pol.sansIndemnite === true,
    'et la politique elle-même dit « gratuit », pas « 0,00 € à payer » ('
    + JSON.stringify(z.pol && { free: z.pol.free, fee: z.pol.fee, sans: z.pol.sansIndemnite }) + ')');
  /* Le délai réglé sur ce métier ne doit plus rien changer : à zéro pour cent, il n'y a
     pas d'« avant » ni d'« après ». */
  const z2 = await suivi({ menage: { pct: 0, h: 720 } }, 2);
  ok(z2.pol && z2.pol.free === true, 'même avec un délai de 30 jours, c’est gratuit');

  /* B — ET QUAND ELLES EXISTENT, L'ÉCRAN DIT CELLES DU MÉTIER. La phrase annonçait
     « 8 h » et « 50 % » quelles que soient les valeurs réglées. */
  console.log('B — l’écran dit les conditions DU MÉTIER, pas celles du code');
  const q = await suivi({ menage: { pct: 20, h: 4 } }, 48);
  ok(/4 heures/.test(q.txt), 'le délai annoncé est celui du métier (4 heures)');
  ok(/20 %/.test(q.txt) && !/50 %/.test(q.txt), 'la part annoncée est celle du métier (20 %)');

  /* C — QUATRE HEURES EST UN DÉLAI OFFERT, ET IL DÉCIDE VRAIMENT : en deçà l'annulation
     coûte, au-delà elle est gratuite.

     L'HEURE SE DEMANDE À L'APPLICATION, elle ne se calcule pas de notre côté : elle
     compte en heure de Saint-Barth, le conteneur tourne en UTC, et un premier jet posait
     « dans trois heures » selon SA montre — la mission tombait vingt-six heures plus
     loin pour l'application, et l'épreuve rougissait sur un décalage horaire. On balaie
     donc des créneaux et l'on retient ceux dont ELLE dit qu'ils sont en deçà et au-delà. */
  console.log('C — un délai de 4 heures, et il décide vraiment');
  const C = await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: { uid: 'u' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.demoMode = true; S.persona = 'client';
    S.adminArrhes = { menage: { pct: 50, h: 4 } };
    const essai = function (quand, heure) {
      S.mission = { reqId: 'r1', svc: 'menage', svcName: 'Ménage', status: 'accepted',
        when: quand, slot: String(heure).padStart(2, '0') + ':00',
        duration: 3, unit: 'h', rate: 35, zone: 'Gustavia', address: 'Lurin', acts: null,
        chat: [], support: {}, finalHours: null, rating: 0, provider: { nm: 'P', ini: 'P' } };
      return window.__arrhes.politique(S.mission);
    };
    let dedans = null, dehors = null;
    for (const quand of ['Aujourd’hui', 'Demain']) {
      for (let h = 0; h <= 23 && !(dedans && dehors); h++) {
        const pol = essai(quand, h);
        if (pol.hours == null) continue;
        if (!dedans && pol.hours > 0.5 && pol.hours < 3.5) dedans = pol;
        if (!dehors && pol.hours > 5 && pol.hours < 30) dehors = pol;
      }
    }
    return { dedans: dedans, dehors: dehors };
  });
  ok(C.dedans && C.dedans.free === false && C.dedans.fee > 0,
    'à ' + (C.dedans ? C.dedans.hours.toFixed(1) : '?') + ' h du rendez-vous : une indemnité est due ('
    + (C.dedans && C.dedans.fee) + ' €)');
  ok(C.dehors && C.dehors.free === true,
    'à ' + (C.dehors ? C.dehors.hours.toFixed(1) : '?') + ' h : c’est gratuit');

  /* D — LA LISTE RESTE FERMÉE. Un champ libre laisserait écrire « 0 » (jamais gratuit)
     ou « 10000 » (jamais payant) sans que rien ne le dise. */
  console.log('D — la liste des délais reste fermée');
  const D = await p.evaluate(() => ({
    liste: window.__arrhes.delais().map((x) => x[0]),
    /* Une valeur hors liste retombe sur le réglage d'origine (8 h), elle n'est jamais prise. */
    retenu: [4, 8, 5, 0, 3, 720, 1000].map((v) => window.__arrhes.de({ x: { h: v } }, 'x').h),
    zero: window.__arrhes.de({ x: { pct: 0 } }, 'x').pct,
  }));
  ok(D.liste.indexOf(4) === 0, '4 heures est le délai le plus court offert (' + D.liste.join(', ') + ')');
  ok(JSON.stringify(D.retenu) === JSON.stringify([4, 8, 8, 8, 8, 720, 8]),
    'et une valeur hors liste retombe sur le réglage d’origine (' + JSON.stringify(D.retenu) + ')');
  /* Zéro est une VALEUR, pas une absence : s'il retombait sur 50 % par défaut, on ne
     pourrait jamais retirer les conditions d'annulation d'un métier. */
  ok(D.zero === 0, 'zéro pour cent est une valeur retenue, pas une absence (' + D.zero + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
