/* « POUR LA DERNIÈRE INSCRITE, JE N'AI PAS VU LA FICHE ARTISAN COMME D'HABITUDE POUR
   L'ACCEPTER, J'AI DÛ DIRECTEMENT RENTRER DANS SON NOM ET CLIQUER SUR VALIDER. »

   La file « À traiter » du tableau de bord est la porte normale : elle porte la carte du
   candidat, avec « Valider », « Refuser » et « Fiche ». Passer par la liste des
   prestataires puis par sa fiche est le chemin de secours.

   AUCUNE ÉPREUVE NE COUVRAIT CE CHEMIN — le plus important de la console, celui par
   lequel chaque prestataire du parc est entré. On l'éprouve donc de bout en bout : ce
   que l'inscription ÉCRIT, ce que la console GARDE, et ce que l'écran REND. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRC = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  /* A — CE QUE L'INSCRIPTION ÉCRIT. Le statut « attente » est la seule chose qui met la
     candidature dans la file : s'il manquait, elle n'existerait que dans la liste. */
  console.log('A — l’inscription écrit bien une candidature EN ATTENTE');
  ok(/status:'attente',createdAt:FB\.f\.serverTimestamp\(\)\},\{merge:true\}\)/.test(SRC),
    'la fiche artisan naît avec status « attente »');
  /* ET ELLE NAÎT EN UNE SEULE FOIS. `notifyAdminNewArtisan` écoute la CRÉATION du
     document : une étape antérieure qui le créerait à moitié (sans nom, sans statut)
     enverrait l'alerte trop tôt et à vide, et le vrai dépôt, devenu une mise à jour,
     n'en déclencherait aucune. Les trois autres écritures sur `artisans/{uid}` (photo,
     coordonnées, attestation remplacée) ne sont atteignables que depuis l'espace d'un
     prestataire DÉJÀ inscrit ; ce qu'on mesure ici, c'est que l'inscription elle-même
     n'écrit qu'une fois. */
  const SIGNUP = SRC.slice(SRC.indexOf('async function fbProSignup(f)'), SRC.indexOf('async function fbConciergeSignup(f)'));
  ok((SIGNUP.match(/FB\.f\.setDoc\(FB\.f\.doc\(FB\.db,'artisans'/g) || []).length === 1,
    'l’inscription n’écrit la fiche artisan qu’UNE fois, donc l’alerte part une fois, complète');
  ok(/status:'attente'/.test(SIGNUP), 'et cette écriture-là porte le statut');

  /* B — CE QUE LA CONSOLE GARDE. Une fiche sans statut est traitée comme une
     candidature : c'est le choix sûr, une fiche abîmée se voit au lieu de disparaître. */
  console.log('B — la console range une fiche sans statut du bon côté');
  ok(/const st=a\.status\|\|'attente';/.test(SRC),
    'statut absent = candidature en attente, jamais un compte validé en silence');

  /* C — ET L'ÉCRAN LA REND. C'est le fait qu'aucune épreuve ne tenait. */
  console.log('C — la file « À traiter » porte la carte, avec ses trois boutons');
  const vue = (arts) => p.evaluate(({ arts }) => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}),
        onSnapshot: () => (() => {}), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'A', email: 'ccs.dumoulin@gmail.com' };
    S.mission = null; S.draft = null; S.adminBookings = []; S.adminClients = [];
    S.adminArtisans = JSON.parse(JSON.stringify(arts));
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminReqs = []; S.adminReqsLus = true;
    S.adminConcierges = []; S.admin = { view: 'home' }; S._fold = {};
    /* UN ÉCRAN QUI LÈVE DOIT ÊTRE DIT, PAS FAIRE MOURIR L'ÉPREUVE. Sans ce filet, une
       erreur de rendu faisait rejeter l'évaluation et le fichier s'arrêtait net : on
       lisait « aucun échec » là où RIEN n'avait été mesuré. */
    let leve = '';
    try { window.__render(); } catch (e) { leve = e.message || String(e); }
    const v = document.getElementById('view');
    return { leve: leve, txt: (v.textContent || '').replace(/\s+/g, ' '),
      valider: !!v.querySelector('[data-adm^="valid-art:"]'),
      refuser: !!v.querySelector('[data-adm^="rej-art:"]'),
      fiche: !!v.querySelector('[data-adm^="art:"]'),
      validerActif: !!v.querySelector('[data-adm^="valid-art:"]:not([disabled])') };
  }, { arts });

  /* La candidate telle que l'inscription la laisse : dossier complet, assurance envoyée. */
  const CANDIDATE = { id: 'u9', uid: 'u9', real: true, name: 'Nouvelle Inscrite', status: 'attente',
    type: 'entreprise', statusType: 'entreprise', cats: ['menage'], rates: { menage: 35 }, rate: 35,
    siret: '90311145500027', insured: true, insuranceUrl: 'https://x/att.pdf', insuranceStatus: 'attente',
    insuranceNone: false, pendingCats: [], email: 'n@x.c', phone: '+590690112233', zone: 'Lorient',
    photo: '', diplomas: [], founder: false, test: false, rating: 0, jobs: 0, history: [], earnings: 0, online: true };
  const A = await vue([CANDIDATE]);
  ok(!A.leve, 'le tableau de bord se dessine sans lever' + (A.leve ? ' (' + A.leve + ')' : ''));
  ok(/À traiter/.test(A.txt), 'la file existe');
  ok(/Nouvelle Inscrite/.test(A.txt), 'la candidate y est nommée');
  ok(A.valider && A.refuser && A.fiche, 'avec « Valider », « Refuser » et « Fiche »');
  ok(/1 en attente/.test(A.txt), 'et le compteur du tableau de bord le dit');
  ok(!/Aucune candidature en attente/.test(A.txt), 'la file ne se déclare pas vide');

  /* D — UNE FICHE ABÎMÉE NE DISPARAÎT PAS. Sans statut, sans nom, sans métier : elle
     paraît quand même, sinon un dossier à moitié écrit serait invisible pour toujours. */
  console.log('D — une fiche incomplète paraît quand même');
  const B = await vue([{ id: 'u8', uid: 'u8', real: true, name: 'Prestataire', status: 'attente',
    cats: [], rates: {}, rate: 0, siret: '', insured: false, insuranceStatus: '', pendingCats: [] }]);
  ok(/À traiter/.test(B.txt) && B.valider,
    'elle est dans la file, bouton présent');
  ok(!B.validerActif,
    'mais « Valider » est éteint : sans SIRET ni assurance, on ne valide pas (et l’écran le dit)');
  ok(/SIRET manquant/.test(B.txt), 'et il dit ce qui manque');

  /* E — UN COMPTE DE TEST NE DISPARAÎT PAS DE LA FILE. Il est écarté des compteurs et
     des listes, mais une candidature à traiter reste à traiter. */
  console.log('E — un compte marqué « test » reste dans la file');
  const C = await vue([Object.assign({}, CANDIDATE, { id: 'u7', uid: 'u7', test: true, name: 'Compte Essai' })]);
  ok(/Compte Essai/.test(C.txt), 'il est encore là, on peut le valider ou le refuser');

  /* F — ET UNE VALIDÉE N'Y EST PLUS. Sinon la file ne voudrait plus rien dire. */
  console.log('F — une fois validée, elle quitte la file');
  const D = await vue([Object.assign({}, CANDIDATE, { status: 'valide' })]);
  ok(/Aucune candidature en attente/.test(D.txt) && !D.valider,
    'la file est vide et le dit');
  ok(/0 en attente/.test(D.txt), 'et le compteur suit');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
