/* « OÙ SONT DÉSORMAIS RANGÉS LES COMPTES TEST DE PRESTATAIRE ? »

   NULLE PART, et c'était la bonne question. Un compte de test est écarté du compteur du
   tableau de bord, de la liste des fiches, du décompte des métiers « sans prestataire »,
   de la liste des dossiers jamais envoyés et des métiers réputés ouverts. Tout cela est
   juste — sinon le parc se mesure faux. Mais `artsTest` les comptait depuis le début et
   n'était AFFICHÉ NULLE PART : écarter des chiffres est une chose, faire disparaître des
   comptes en est une autre, et l'on peut avoir besoin d'ouvrir le sien.

   Un compte de test REFUSÉ reparaissait en revanche parmi les vrais refus : écarté de
   cinq listes, présent dans la sixième. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const console_ = (arts, ouvre) => p.evaluate(({ arts, ouvre }) => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'A', email: 'ccs.dumoulin@gmail.com' };
    S.mission = null; S.draft = null; S.adminBookings = []; S.adminClients = [];
    S.adminReqs = []; S.adminReqsLus = true; S.adminClisLoaded = true;
    S.adminArtisans = JSON.parse(JSON.stringify(arts)); S.adminArtsLoaded = true; S.adminDrafts = [];
    S.admin = { view: 'home' }; S._fold = {};
    (ouvre || []).forEach((k) => { S._fold[k] = true; });
    window.__render();
    const v = document.getElementById('view');
    const carte = (titre) => Array.from(v.querySelectorAll('.foldc')).find((c) => new RegExp(titre).test(c.textContent || ''));
    const fiches = carte('Fiches artisans'), test = carte('Comptes de test');
    const tuile = Array.from(v.querySelectorAll('[data-act="adm-list:a-arts"]')).map((t) => t.innerText.replace(/\s+/g, ' '))[0] || '';
    return { tuile: tuile,
      fiches: fiches ? (fiches.textContent || '').replace(/\s+/g, ' ') : '(absente)',
      test: test ? (test.textContent || '').replace(/\s+/g, ' ') : '(absente)',
      liensTest: test ? test.querySelectorAll('[data-adm^="art:"]').length : 0 };
  }, { arts, ouvre });

  const REEL = { id: 'u1', uid: 'u1', name: 'Maya Beauté', email: 'maya@exemple.fr', status: 'valide', cats: ['menage'] };
  const TEST = { id: 'u2', uid: 'u2', name: 'Compte d’essai', email: 't@e.fr', test: true, status: 'valide', cats: ['menage'] };
  const TESTREF = { id: 'u3', uid: 'u3', name: 'Essai refusé', email: 'r@e.fr', test: true, status: 'refuse', cats: ['menage'] };

  /* A — ILS RESTENT ÉCARTÉS DES CHIFFRES. C'est la partie qui était juste. */
  console.log('A — écartés des compteurs, comme avant');
  const a = await console_([REEL, TEST], ['a-arts']);
  ok(/1 validé/.test(a.fiches) && !/2 validé/.test(a.fiches),
    'la carte « Fiches artisans » ne compte que le vrai (' + a.fiches.slice(0, 40) + ')');
  ok(!/Compte d’essai/.test(a.fiches), 'et ne le liste pas');
  ok(/Maya Beauté/.test(a.fiches), 'le vrai, lui, est bien là');

  /* B — MAIS ILS SONT QUELQUE PART. C'est ce qui manquait. */
  console.log('B — et rangés quelque part, nommés, ouvrables');
  ok(a.test !== '(absente)', 'une carte « Comptes de test » existe');
  ok(/1 compte/.test(a.test), 'elle les compte (' + a.test.slice(0, 48) + ')');
  const ouvert = await console_([REEL, TEST], ['a-arts-test']);
  ok(/Compte d’essai/.test(ouvert.test), 'dépliée, elle les NOMME');
  ok(ouvert.liensTest === 1, 'et chacun s’ouvre d’un clic (' + ouvert.liensTest + ' lien)');
  ok(/écartés des compteurs|écarté de tous les compteurs/.test(a.test),
    'elle dit qu’ils sont écartés des compteurs, pour qu’on ne les cherche pas ailleurs');

  /* C — LA CARTE N'EXISTE PAS QUAND IL N'Y EN A PAS. Une carte « 0 compte de test »
     serait du bruit permanent sur l'écran le plus chargé de l'application. */
  console.log('C — aucune carte quand il n’y en a aucun');
  const sans = await console_([REEL], ['a-arts']);
  ok(sans.test === '(absente)', 'pas de compte de test, pas de carte');

  /* D — UN COMPTE DE TEST REFUSÉ NE SE GLISSE PLUS PARMI LES VRAIS REFUS. */
  console.log('D — y compris refusé');
  const ref = await console_([REEL, TESTREF], ['a-arts']);
  ok(!/Essai refusé/.test(ref.fiches), 'il n’apparaît pas dans « Fiches artisans »');
  ok(!/1 refusé/.test(ref.fiches), 'ni dans le décompte des refusés (' + ref.fiches.slice(0, 44) + ')');
  const refOuv = await console_([REEL, TESTREF], ['a-arts-test']);
  ok(/Essai refusé/.test(refOuv.test), 'il est rangé avec les autres comptes de test');

  /* E — EN LIGNE PAR DÉFAUT. « Il faut qu'ils soient tous en ligne, le hors ligne sera
     une nouvelle action volontaire de leur part. » La fiche affichait « Hors ligne » à
     tout nouvel inscrit : `online` n'est écrit qu'au premier enregistrement de ses
     réglages, et la console coerçait l'absence en FAUX (`!!a.online`) pendant que
     l'application et le serveur tenaient l'absence pour EN LIGNE
     (`enLigne(v){return v!==false}`) et lui envoyaient les demandes.

     ET LA PHRASE DISAIT FAUX : « aucun appareil notifié, il ne verra pas les demandes ».
     L'absence d'appareil empêche de le PRÉVENIR, pas de voir — le fil des missions n'a
     rien à voir avec les jetons push, et la rangée « Notifications » juste en dessous le
     dit déjà correctement. */
  console.log('E — en ligne par défaut, hors ligne seulement s’il l’a décidé');
  const fiche = (art) => p.evaluate((art) => {
    const S = window.__S;
    S.adminArtisans = [JSON.parse(JSON.stringify(art))]; S.adminArtsLoaded = true;
    S.admin = { view: 'art', sel: art.id }; window.__render();
    const v = document.getElementById('view');
    return (v.textContent || '').replace(/\s+/g, ' ');
  }, art);

  const neuf = await fiche({ id: 'n1', uid: 'n1', name: 'Jean Bart', email: 'j@e.fr',
    status: 'valide', cats: ['menage'] });          // JAMAIS touché l'interrupteur
  ok(/En ligne/.test(neuf) && !/Hors ligne/.test(neuf),
    'un inscrit qui n’a jamais touché l’interrupteur est EN LIGNE');
  ok(!/il ne verra pas les demandes/.test(neuf),
    'et on ne prétend plus qu’il ne verra pas les demandes');
  ok(/reçoit les demandes de ses métiers/.test(neuf), 'on dit ce qui est vrai');

  const coupe = await fiche({ id: 'n2', uid: 'n2', name: 'Jean Bart', email: 'j@e.fr',
    status: 'valide', cats: ['menage'], online: false });   // il l'a DÉCIDÉ
  ok(/Hors ligne/.test(coupe), 'celui qui a coupé son interrupteur est hors ligne');
  ok(/coupé son interrupteur/.test(coupe), 'et l’écran dit que c’est un CHOIX, pas une panne');

  /* LE CHARGEMENT AUSSI, ET IL N'EST PAS COUVERT PAR CE QUI PRÉCÈDE : l'épreuve injecte
     `adminArtisans` à la main, donc elle saute le lecteur d'instantané qui FABRIQUE cette
     liste. Or c'est lui qui écrasait l'absence en `false` (`online:!!a.online`) : corriger
     l'affichage seul aurait été défait en production, l'information étant déjà perdue en
     amont. Le lecteur vit dans un `onSnapshot` sans porte de harnais — on le lit donc
     dans la source, et c'est dit. */
  ok(/online:\(a\.online!==false\)/.test(APP),
    'le lecteur d’instantané garde la distinction « jamais réglé » / « coupé » (lu dans la source)');
  ok(!/online:!!a\.online/.test(APP),
    'et plus rien n’écrase l’absence en « hors ligne »');

  /* F — REMETTRE TOUT LE MONDE EN LIGNE. Le correctif du défaut ne vaut que pour les
     fiches qui ne portent PAS le champ : celles qui ont enregistré leurs réglages pendant
     que l'application les croyait hors ligne ont `online:false` ÉCRIT, et y resteraient.
     Ce geste efface cette ardoise-là — une fois, et après lui « hors ligne » ne peut plus
     venir que d'une décision. */
  console.log('F — remettre tout le monde en ligne, une fois');
  const parc = (arts) => p.evaluate((arts) => {
    window.__ecrites = [];
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: (db, col, id) => ({ col: col, id: id }),
        setDoc: (ref, patch, opt) => { window.__ecrites.push({ id: ref.id, patch: patch, opt: opt }); return Promise.resolve(); },
        updateDoc: () => Promise.resolve(),
        getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    const S = window.__S;
    S.adminArtisans = JSON.parse(JSON.stringify(arts)); S.adminArtsLoaded = true;
    S.admEnLigneArme = false; S.admin = { view: 'home' }; S._fold = {};
    window.__render();
    const b = document.querySelector('[data-adm="tous-en-ligne"]');
    return { bouton: !!b, txt: b ? (b.closest('.card').textContent || '').replace(/\s+/g, ' ') : '' };
  }, arts);

  const R = (u, on) => ({ id: u, uid: u, real: true, name: 'Pro ' + u, email: u + '@e.fr',
    status: 'valide', cats: ['menage'], online: on });

  const horsLigne = await parc([R('p1', false), R('p2', false), R('p3', true)]);
  ok(horsLigne.bouton, 'le bouton paraît quand quelqu’un est hors ligne');
  ok(/2 prestataires hors ligne/.test(horsLigne.txt),
    'et il dit combien (' + horsLigne.txt.slice(0, 50) + ')');

  const tousEnLigne = await parc([R('p1', true), R('p3', true)]);
  ok(!tousEnLigne.bouton, 'et il disparaît quand personne ne l’est — un bouton inutile dilue les autres');

  /* DEUX TOUCHERS, et on regarde CE QUI PART. */
  await parc([R('p1', false), R('p2', false), R('p3', true)]);
  const fait = await p.evaluate(async () => {
    document.querySelector('[data-adm="tous-en-ligne"]').click();
    await new Promise((r) => setTimeout(r, 200));
    const arme = /Confirmer/.test(document.querySelector('[data-adm="tous-en-ligne"]').textContent || '');
    document.querySelector('[data-adm="tous-en-ligne"]').click();
    await new Promise((r) => setTimeout(r, 600));
    return { arme: arme, ecrites: window.__ecrites,
      restants: (window.__S.adminArtisans || []).filter((a) => a.online === false).length };
  });
  ok(fait.arme, 'un premier toucher ARME');
  ok((fait.ecrites || []).length === 2, 'le second n’écrit que sur les DEUX hors ligne (' + (fait.ecrites || []).length + ')');
  ok((fait.ecrites || []).every((e) => e.patch && e.patch.online === true),
    'et il écrit « en ligne »');
  ok((fait.ecrites || []).every((e) => e.opt && e.opt.merge === true),
    'en FUSION : une fiche vivante ne se remplace pas');
  ok((fait.ecrites || []).map((e) => e.id).sort().join(',') === 'p1,p2',
    'sur les bons comptes (' + (fait.ecrites || []).map((e) => e.id).join(',') + ')');
  ok(fait.restants === 0, 'plus personne n’est hors ligne');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
