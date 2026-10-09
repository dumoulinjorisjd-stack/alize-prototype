/* « QUAND J'AI FAIT RETOUR EN ARRIÈRE, ÇA M'A REMIS SUR L'ÉCRAN COMME SI JE N'ÉTAIS
   JAMAIS INSCRIT, AVEC TOUS LES DOCUMENTS À REMPLIR. »

   Une seule ligne mène là : le retour du téléphone faisait passer « candidature
   déposée » (`pending`) à « remplir ma candidature » (`signup`). Ce n'est pas un retour,
   c'est une marche AVANT déguisée — et pour quelqu'un qui a déjà tout rempli, revoir ce
   formulaire se lit comme un compte perdu.

   LA GARDE QUI EXISTAIT NE SUFFISAIT PAS. `isRealArtisan()` lit `S.account.role`, qui
   n'est posé qu'une fois la fiche artisan relue : entre l'ouverture de l'application et
   ce moment-là, il rend FAUX pour un prestataire parfaitement inscrit. Et certains
   chemins ouvrent l'espace pro AVANT l'authentification — le lien d'une notification
   (`?open=missions`) en est un. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1300 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__back);

  /* `etat` décrit ce qu'on veut : une session Firebase ou non, un compte ou non. */
  const reculer = (etat) => p.evaluate((etat) => {
    if (etat.session) {
      window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
        f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
        fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    } else { window.__setFB(null); }
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = !!etat.demo;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = etat.statut; S.proName = 'Laure M.';
    S.account = etat.compte ? { name: 'Laure M.', email: 'p@x.c', uid: 'pro1', role: etat.compte } : null;
    S.mission = null; S.proReqView = null; S.proStep = null; S.proConflict = null;
    S.openRequests = []; S._openReqBrut = [];
    window.__render();
    window.__back();
    return { statut: S.proStatus, persona: S.persona,
      txt: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ').slice(0, 200) };
  }, etat);

  /* A — LE CAS SIGNALÉ : une candidature déposée, et l'on recule. */
  console.log('A — une candidature déposée ne se transforme pas en formulaire vide');
  const connecte = await reculer({ statut: 'pending', session: true, compte: 'artisan' });
  ok(connecte.statut === 'pending',
    'prestataire connu : reculer ne touche à rien (' + connecte.statut + ')');

  /* LA FENÊTRE OÙ LA GARDE D'AVANT LÂCHAIT : connecté, mais la fiche artisan pas encore
     relue — donc `S.account` pas encore posé. C'est l'état de l'application pendant les
     premières secondes, et celui des chemins qui ouvrent l'espace pro avant
     l'authentification (le lien d'une notification). */
  const tot = await reculer({ statut: 'pending', session: true, compte: null });
  ok(tot.statut === 'pending',
    'session ouverte mais fiche pas encore lue : reculer ne le désinscrit pas (' + tot.statut + ')');
  ok(!/Envoyer ma candidature/.test(tot.txt) && !/attestation/i.test(tot.txt),
    'et aucun formulaire de candidature ne paraît');

  /* Et le compte qui a basculé « client » le temps d'une lecture : même protection. */
  const cli = await reculer({ statut: 'pending', session: true, compte: 'client' });
  ok(cli.statut === 'pending', 'quel que soit le rôle déjà lu, la session suffit');

  /* B — CE QU'ON NE CASSE PAS. Le parcours de DÉMONSTRATION garde son retour : c'est
     une visite, personne n'y a rempli de dossier. */
  console.log('B — la démonstration garde son chemin de retour');
  const demo = await reculer({ statut: 'pending', session: false, demo: true, compte: null });
  ok(demo.statut === 'signup',
    'en démonstration, reculer depuis « candidature déposée » revient au formulaire');

  /* C — ET LE FORMULAIRE LUI-MÊME NE PIÈGE PERSONNE : on doit pouvoir en sortir. */
  console.log('C — on sort toujours du formulaire de candidature');
  const sortie = await reculer({ statut: 'signup', session: true, compte: 'client' });
  ok(sortie.persona === 'client',
    'un client qui ouvre la candidature peut la quitter (' + sortie.persona + ')');

  /* D — LA PROPRIÉTÉ GÉNÉRALE, celle qui doit tenir quoi qu'on ajoute : aucun état
     connecté ne doit sortir de `goBack` sur un formulaire de candidature. */
  console.log('D — aucun état connecté ne sort sur le formulaire de candidature');
  const etats = ['approved', 'pending', 'draft'];
  const roles = ['artisan', 'client', null];
  let fautes = [];
  for (const st of etats) for (const ro of roles) {
    const r = await reculer({ statut: st, session: true, compte: ro });
    if (r.statut === 'signup') fautes.push(st + '/' + (ro || 'sans compte'));
  }
  ok(fautes.length === 0,
    'neuf combinaisons éprouvées, aucune ne fabrique le formulaire'
      + (fautes.length ? ' (' + fautes.join(', ') + ')' : ''));

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
