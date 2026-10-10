/* « DANS LES RÉSERVATIONS EN COURS, JE NE VOIS PAS TOUTES CELLES QUI ONT EXPIRÉ OU
   ANNULÉ », et « POUR S'Y RETROUVER DANS TOUTES LES COMMANDES PASSÉES, IL FAUT UNE CARTE
   PAR STATUT, AVEC UNE SOUS-CARTE PAR MÉTIER. » — l'éditeur, le 16/10/2026.

   La carte « Réservations en cours » portait deux queues coupées : six annulations, cinq
   réglées, et « et N autres plus anciennes » — une phrase honnête, qui ne menait nulle
   part. Ce qui manquait n'était pas une limite plus haute, c'était un endroit où TOUT est
   rangé, et dépliable.

   CE QUE CETTE ÉPREUVE TIENT :
   • rien n'est coupé — toutes les commandes d'un métier paraissent quand on le déplie ;
   • l'ordre des statuts est DÉCLARÉ, pas celui des clés d'un objet ;
   • un statut inconnu ne disparaît pas, il passe en queue ;
   • déplier « ménage » sous « Expirées » ne le déplie pas sous « Réglées » ;
   • les montants sont des montants (deux décimales), par métier et par statut ;
   • et la carte des réservations ne garde que ce qui appelle un geste. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 2200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__grp);

  /* ── A. LE NOYAU ──────────────────────────────────────────────────────────────── */
  console.log('A — regrouper par statut, puis par métier');
  const noy = await p.evaluate(() => {
    const G = window.__grp.parStatut, O = window.__grp.ordre();
    const r = (id, st, svc, total, at) => ({ id: id, status: st, svc: svc, total: total, at: at });
    const liste = [
      r('a', 'expired', 'menage', 70, 10), r('b', 'expired', 'menage', 35.555, 30),
      r('c', 'expired', 'jardin', 96, 20), r('d', 'paid', 'menage', 140, 40),
      r('e', 'cancelled', 'coiffure', 50, 50), r('f', 'pending', 'menage', 70, 60),
    ];
    const g = G(liste, O, function (id) { return id === 'menage' ? 'Ménage' : id; });
    const parSt = {}; g.forEach(function (x) { parSt[x.statut] = x; });
    return {
      ordre: g.map(function (x) { return x.statut; }),
      expN: parSt.expired.n, expTotal: parSt.expired.total,
      expMetiers: parSt.expired.metiers.map(function (m) { return m.svc + ':' + m.n; }),
      expPremier: parSt.expired.metiers[0].nm,
      lignesMenage: parSt.expired.metiers[0].lignes.map(function (x) { return x.id; }),
      totalMenage: parSt.expired.metiers[0].total,
      vide: G([], O, null).length,
      sansStatut: G([{ id: 'x', total: 10 }], O, null).length,
      sansSvc: G([r('y', 'paid', '', 10, 1)], O, null)[0].metiers[0].svc,
      inconnu: G([r('z', 'martien', 'menage', 10, 1), r('w', 'paid', 'menage', 10, 2)], O, null)
        .map(function (x) { return x.statut; }),
    };
  });
  ok(noy.ordre.join(',') === 'pending,cancelled,expired,paid',
    'l’ordre est celui qui est DÉCLARÉ, le vivant d’abord (' + noy.ordre.join(',') + ')');
  ok(noy.expN === 3, 'les trois expirées sont comptées ensemble');
  ok(noy.expTotal === 201.56,
    'et leur total est un MONTANT, à deux décimales (70 + 35,555 + 96 = ' + noy.expTotal + ')');
  ok(noy.expMetiers.join(',') === 'menage:2,jardin:1',
    'rangées par métier, le plus fourni d’abord (' + noy.expMetiers.join(', ') + ')');
  ok(noy.expPremier === 'Ménage',
    'le nom du métier est INJECTÉ : le noyau ne lit pas le catalogue, et n’a pas à savoir qu’un métier se renomme');
  ok(noy.lignesMenage.join(',') === 'b,a', 'les lignes d’un métier vont de la plus récente à la plus ancienne');
  ok(noy.totalMenage === 105.56, 'et le total d’un métier est un montant aussi (' + noy.totalMenage + ')');
  ok(noy.vide === 0 && noy.sansStatut === 0, 'rien à grouper ne rend rien, et une ligne sans statut est écartée');
  ok(noy.sansSvc === 'autre',
    'un métier vide se range sous « autre », visiblement, plutôt que dans un groupe à clé vide que personne ne lit');
  ok(noy.inconnu.join(',') === 'paid,martien',
    'un statut INCONNU ne disparaît pas : il passe en queue, sous son propre nom (' + noy.inconnu.join(',') + ')');

  /* ── B. L'ÉCRAN DE LA CONSOLE ─────────────────────────────────────────────────── */
  console.log('B — la carte, et ce qu’on y déplie');
  const console_ = (etat) => p.evaluate(({ etat }) => {
    const S = window.__S;
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: () => Promise.resolve(),
        setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'admin'; S.admView = null; S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.adminReqsLus = true; S.adminClisLoaded = true; S.adminClients = [];
    S._fold = { 'a-cmd-toutes': true, 'a-bookings': true };
    S._admCmdStat = etat.stat || {}; S._admCmdMet = etat.met || {};
    /* QUINZE EXPIRÉES : au-delà des six que l'ancienne carte montrait. C'est le défaut
       signalé, et il ne se mesure qu'avec plus de six. */
    const reqs = [];
    for (let i = 0; i < 15; i++) reqs.push({ id: 'e' + i, status: 'expired', svc: (i % 2 ? 'jardin' : 'menage'),
      svcName: (i % 2 ? 'Jardinage' : 'Ménage'), client: 'Client ' + i, total: 70, at: 1000 - i, fin: 2000 - i });
    for (let i = 0; i < 8; i++) reqs.push({ id: 'p' + i, status: 'paid', svc: 'menage', svcName: 'Ménage',
      client: 'Client p' + i, total: 100, at: 500 - i, fin: 0 });
    reqs.push({ id: 'c1', status: 'cancelled', svc: 'coiffure', svcName: 'Coiffure', client: 'Zoé',
      total: 60, at: 400, fin: 450, tardive: true, decision: 'pending', frais: 30 });
    /* DEUX commandes vivantes, pas une : le piège du `.map` ne se voit qu'à partir de la
       SECONDE ligne (la première reçoit l'indice 0, qui est faux). */
    reqs.push({ id: 'v1', status: 'working', svc: 'menage', svcName: 'Ménage', client: 'Alix', provider: 'Maya', total: 70, at: 300 });
    reqs.push({ id: 'v2', status: 'pending', svc: 'jardin', svcName: 'Jardinage', client: 'Bruno', total: 96, at: 290 });
    S.adminReqs = reqs;
    window.__render();
    const view = document.getElementById('view');
    return { txt: (view.textContent || '').replace(/\s+/g, ' '),
      stats: Array.prototype.map.call(view.querySelectorAll('[data-adm^="cmdstat:"]'), function (b) { return b.dataset.adm.slice(8); }),
      mets: Array.prototype.map.call(view.querySelectorAll('[data-adm^="cmdmet:"]'), function (b) { return b.dataset.adm.slice(7); }),
      lignes: view.querySelectorAll('[data-adm^="reqclore:"]').length,
      /* Le TITRE de chaque ligne de commande, carte par carte. */
      titres: (function () {
        /* ON NOMME LES DEUX CARTES, on ne classe pas « tout le reste » comme vivante : la
           console en compte une quinzaine, et la dernière écrasait la mesure. */
        const toutes = Array.prototype.slice.call(view.querySelectorAll('.foldc'));
        const trouve = (re) => toutes.find(function (c) { return re.test(c.textContent || ''); });
        const titresDe = (c) => c ? Array.prototype.map.call(c.querySelectorAll('.fold-body div.card > .row > b'),
          function (x) { return (x.textContent || '').trim(); }) : [];
        return { registre: titresDe(trouve(/Par statut, puis par métier/)),
          vivante: titresDe(trouve(/Recherche → acceptée → en cours/)) };
      })(),
      /* LA CARTE SE CHERCHE PAR SON BOUTON DE REPLI, pas par son titre : « Toutes les
         commandes » paraît AUSSI dans la phrase de renvoi de la carte des réservations,
         donc un test sur le texte passait au vert sans la carte. */
      carte: !!view.querySelector('[data-fold="a-cmd-toutes"]') };
  }, { etat });

  const plie = await console_({});
  ok(plie.carte, 'la carte existe, et on la cherche par son bouton de repli, pas par son titre');
  ok(plie.stats.join(',') === 'pending,working,cancelled,expired,paid',
    'un bouton par statut présent, dans l’ordre déclaré (' + plie.stats.join(', ') + ')');
  ok(plie.mets.length === 0, 'et tout est REPLIÉ au départ : un parc de centaines de commandes ne tient pas sur un écran');
  ok(/Rien n’est coupé/.test(plie.txt), 'la carte annonce ce qu’elle garantit');

  const ouvEx = await console_({ stat: { expired: true } });
  ok(ouvEx.mets.join(',') === 'expired|menage,expired|jardin',
    'déplier un statut montre ses métiers, le plus fourni d’abord (' + ouvEx.mets.join(', ') + ')');
  ok(/Ménage/.test(ouvEx.txt) && /Jardinage/.test(ouvEx.txt), 'nommés');

  const ouvMet = await console_({ stat: { expired: true }, met: { 'expired|menage': true } });
  const nMenage = (ouvMet.txt.match(/Client \d+/g) || []).length;
  ok(nMenage === 8,
    'et déplier un métier montre TOUTES ses commandes, ici les huit ménages expirés : '
    + 'au-delà des six que l’ancienne carte s’arrêtait de montrer (' + nMenage + ')');

  const ouvDeux = await console_({ stat: { expired: true, paid: true }, met: { 'expired|menage': true } });
  ok(ouvDeux.mets.indexOf('paid|menage') >= 0,
    'un second statut se déplie à côté du premier');
  ok((ouvDeux.txt.match(/Client p\d+/g) || []).length === 0,
    'MAIS déplier « ménage » sous « Expirées » ne le déplie pas sous « Réglées » : la clé d’un métier porte son statut');

  /* ── C. LA CARTE DES RÉSERVATIONS NE GARDE QUE CE QUI APPELLE UN GESTE ────────── */
  console.log('C — « Réservations en cours » ne coupe plus, elle renvoie');
  ok(/Indemnité à trancher/.test(plie.txt) && /Zoé/.test(plie.txt),
    'une annulation tardive dont le prestataire n’a pas tranché reste en vue : c’est le seul cas qui attend quelqu’un');
  ok(!/plus ancienne/.test(plie.txt),
    'et les queues coupées ont disparu : « et N autres plus anciennes » ne menait nulle part');
  ok(/toutes sont dans « Toutes les commandes »/.test(plie.txt),
    'la carte DIT où tout se trouve, au lieu de taire ce qu’elle ne montre pas');

  /* ── D. LE TITRE D'UNE LIGNE DÉPEND DE CE QUI EST ÉCRIT AU-DESSUS ─────────────── */
  console.log('D — sous « Ménage », on cherche le client, pas le métier');
  const titres = ouvMet.titres || {};
  ok((titres.registre || []).length === 8 && (titres.registre || []).every(function (t) { return /^Client \d+$/.test(t); }),
    'sous une sous-carte « Ménage », chaque ligne est titrée par son CLIENT : le métier y était écrit huit fois et ne distinguait plus rien ('
    + (titres.registre || []).slice(0, 2).join(', ') + '…)');
  /* LE PIÈGE DU `.map` : `liste.map(cmdLigne)` passe l'INDICE en second argument, donc la
     PREMIÈRE ligne garderait son métier et toutes les suivantes le perdraient. Il faut
     donc mesurer au moins DEUX lignes de la carte vivante, jamais une seule. */
  const deuxVives = await console_({});
  const tv = (deuxVives.titres && deuxVives.titres.vivante) || [];
  /* ON NOMME LES TITRES ATTENDUS. « ne commence pas par Client » laissait passer « Alix »
     et « Bruno » : une assertion qui tolère la faute qu'elle cherche ne cherche rien. */
  ok(tv.length >= 2 && tv.indexOf('Ménage') >= 0 && tv.indexOf('Jardinage') >= 0
     && tv.indexOf('Alix') < 0 && tv.indexOf('Bruno') < 0,
    'et dans la carte des réservations, la ligne reste titrée par son MÉTIER, sur TOUTES les lignes ('
    + tv.join(', ') + ') : `map(cmdLigne)` aurait passé l’indice en second argument et dégradé toutes les suivantes en silence');

  ok(errs.length === 0, 'aucune erreur JS sur la console' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
