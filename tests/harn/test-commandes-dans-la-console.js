/* « J'AI UNE PERSONNE QUI A PASSÉ UNE COMMANDE MAIS AUCUN MOYEN DE VOIR QUOI QUE CE SOIT
   DANS LA CONSOLE TANT QU'UN PRESTATAIRE N'A PAS ACCEPTÉ. »

   Exact, et pas seulement avant l'acceptation. La seule liste de la console,
   « Réservations en cours », était bâtie sur `S.mission` — c'est-à-dire la commande de
   L'ADMINISTRATEUR sur CET appareil — complétée de lignes de démonstration. Une commande
   réelle n'existait donc nulle part ailleurs que comme « +1 » dans le compteur par
   statut, et n'atteignait la messagerie que si quelqu'un y écrivait un message.

   LA DONNÉE ÉTAIT LÀ, L'ÉCRAN MANQUAIT : la console écoute déjà TOUTES les demandes
   (c'est ainsi qu'elle les compte), elle n'en gardait que le statut, le compte et la
   date. L'épreuve mesure ce que la console REND. */
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
  await p.waitForFunction(() => window.__S && window.__render);

  /* La console d'un administrateur, avec les demandes telles que l'écoute les pose. */
  const console_ = (reqs, clients) => p.evaluate(({ reqs, clients }) => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'A', email: 'ccs.dumoulin@gmail.com' };
    S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminArtisans = []; S.adminClients = clients || [];
    S.adminArtsLoaded = true; S.adminClisLoaded = true;
    S.adminReqs = JSON.parse(JSON.stringify(reqs)); S.adminReqsLus = true;
    S.admin = { view: 'home' }; S._fold = { 'a-bookings': true };
    window.__render();
    const v = document.getElementById('view');
    const carte = Array.from(v.querySelectorAll('.foldc')).find((c) => /Réservations en cours/.test(c.textContent || ''));
    return { txt: carte ? (carte.textContent || '').replace(/\s+/g, ' ') : '(carte absente)',
      lignes: carte ? carte.querySelectorAll('.fold-body .card').length : 0 };
  }, { reqs, clients });

  const H = 3600000;
  const EN_RECHERCHE = { id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 5 * H,
    svc: 'menage', svcName: 'Ménage', when: 'Demain', slot: '09:00', zone: 'Lorient',
    total: 105, unit: 'h', duration: 3, client: 'Camille', provider: '', providerUid: '',
    directed: false, boostEur: 0 };

  /* A — UNE COMMANDE QUE PERSONNE N'A ENCORE ACCEPTÉE SE VOIT. C'est tout l'objet. */
  console.log('A — une commande en recherche se voit, avant toute acceptation');
  const A = await console_([EN_RECHERCHE], []);
  ok(A.lignes >= 1, 'la carte porte ' + A.lignes + ' ligne(s)');
  ok(/Ménage/.test(A.txt), 'on lit le métier');
  ok(/Camille/.test(A.txt), 'on lit le client');
  ok(/Demain/.test(A.txt) && /09:00/.test(A.txt) && /Lorient/.test(A.txt), 'le créneau et le secteur');
  ok(/105,00/.test(A.txt), 'et le montant');
  ok(/personne n’a encore accepté/.test(A.txt), 'et qu’aucun prestataire n’a accepté');

  /* B — L'ÂGE EST LE FAIT UTILE. « En recherche » ne se corrige pas, « en recherche
     depuis 5 h » si : c'est la seule ligne sur laquelle on peut agir. */
  console.log('B — l’âge d’une recherche, parce que c’est ce qui appelle un geste');
  ok(/depuis 5 h/.test(A.txt), 'la ligne dit depuis combien de temps elle cherche');
  const jeune = await console_([Object.assign({}, EN_RECHERCHE, { at: Date.now() - 20 * 60000 })], []);
  ok(/depuis 20 min/.test(jeune.txt), 'et en minutes quand c’est récent');

  /* C — LA COMMANDE DE L'ADMINISTRATEUR N'EST PLUS LA SOURCE. La liste venait de
     `S.mission` : sans commande en cours sur CET appareil, elle était vide même avec des
     demandes en base, et elle montrait une ligne même sans aucune demande en base. */
  console.log('C — la liste vient de la base, pas de l’appareil');
  const vide = await console_([], []);
  ok(/Aucune commande/.test(vide.txt) && vide.lignes === 0,
    'aucune demande en base : la carte le dit (' + vide.lignes + ' ligne)');
  const trois = await console_([EN_RECHERCHE,
    Object.assign({}, EN_RECHERCHE, { id: 'r2', status: 'accepted', provider: 'Maya', at: Date.now() - 2 * H }),
    Object.assign({}, EN_RECHERCHE, { id: 'r3', status: 'working', provider: 'Léa', at: Date.now() - H })], []);
  ok(trois.lignes === 3, 'trois demandes en base, trois lignes (' + trois.lignes + ')');
  ok(/3 commandes en cours/.test(trois.txt), 'et le nombre est annoncé');
  ok(/Maya/.test(trois.txt) && /Léa/.test(trois.txt), 'avec le prestataire quand il y en a un');

  /* D — LES COMPTES DE TEST RESTENT ÉCARTÉS, comme dans les autres cartes : deux cartes
     qui se contrediraient sur le même fait seraient pires qu'une carte absente. */
  console.log('D — les comptes de test sont écartés, comme ailleurs');
  const t = await console_([Object.assign({}, EN_RECHERCHE, { uid: 'ctest' })],
    [{ uid: 'ctest', name: 'Test', email: 't@e.fr', test: true }]);
  ok(t.lignes === 0, 'une demande d’un compte de test ne paraît pas (' + t.lignes + ' ligne)');

  /* E — CE QUI REVIENT D'UN COMPTE S'AFFICHE, IL NE DÉCIDE PAS. */
  console.log('E — une valeur hostile paraît inerte');
  const x = await console_([Object.assign({}, EN_RECHERCHE,
    { client: '<img src=x onerror=alert(1)>', svcName: '"><script>alert(2)</script>' })], []);
  ok(x.lignes >= 1 && /onerror/.test(x.txt), 'le texte hostile se LIT, en toutes lettres');
  const vivants = await p.evaluate(() => document.querySelectorAll('#view script, #view img[onerror]').length);
  ok(vivants === 0, 'et aucune balise ne s’est ouverte (' + vivants + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
