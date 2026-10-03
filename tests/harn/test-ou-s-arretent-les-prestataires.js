/* OÙ S'ARRÊTE UNE CANDIDATURE PRESTATAIRE.

   « On a où s'arrêtent les clients dans la console, mais pas où s'arrêtent les
   prestataires quand ils ne finalisent pas leur inscription. »

   Et c'était IMPOSSIBLE à savoir : le dossier vit dans le `localStorage` du téléphone
   du prestataire jusqu'à l'envoi. La console voyait qu'un compte existait sans fiche —
   rien de plus. Impossible de distinguer celui qui n'a rien rempli de celui qui a tout
   fait sauf téléverser son attestation.

   ET ON NE DÉSIGNE PAS UN MUR, contrairement aux clients : les quatre étapes sont
   quatre cartes qu'on remplit dans l'ordre qu'on veut, il n'y a pas d'escalier. On
   compte donc, étape par étape, combien l'ont franchie — celle qui manque le plus
   souvent est celle qui bloque. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__pro, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — les quatre étapes se lisent du dossier, pas d’une supposition');
  const j = await p.evaluate(() => ({
    vide: window.__pro.jalons({}),
    // Un dossier d'identité complet : nom, téléphone, SIRET à 14 chiffres, adresse, majeur.
    identite: window.__pro.jalons({ name: 'Léa Brin', phone: '0690112233', siret: '12345678901234',
      address: 'Lorient', birth: '1990-05-05' }),
    engagements: window.__pro.jalons({ mandat: true, cgu: true, charte: true }),
    assurance: window.__pro.jalons({ insuranceDoc: true }),
  }));
  ok(j.vide.id === false && j.vide.ins === false && j.vide.svc === false && j.vide.acc === false,
    'un dossier vide n’a aucune étape franchie');
  ok(j.identite.id === true && j.identite.ins === false,
    'l’identité complète coche son étape, et elle seule');
  ok(j.assurance.ins === true, 'l’attestation coche la sienne');
  ok(j.engagements.acc === true, 'et les trois cases d’engagement la leur');

  console.log('\nB — ce qui bloque est celui qui manque le plus souvent');
  const D = (uid, nm, jal, push, test) => ({ uid: uid, id: uid, name: nm, email: uid + '@e.fr',
    phone: '0690000000', createdAt: 1790000000000, push: push === undefined ? 1 : push,
    jalonsPro: jal, jalonsProAt: 1790000000000, test: !!test });
  const T4 = { id: true, ins: true, svc: true, acc: true };
  const drafts = [
    D('a', 'Anne Ba', { id: true, ins: false, svc: true, acc: true }),      // il ne manque QUE l'assurance
    D('b', 'Bruno Ca', { id: true, ins: false, svc: true, acc: false }),
    D('c', 'Chloé Da', { id: false, ins: false, svc: false, acc: false }, 0),
    D('d', 'Denis Ea', null),                                              // d'avant la mesure
    D('e', 'Essai', T4, 1, true),                                          // compte de test
  ];
  const P = await p.evaluate((d) => window.__pro.parcours(d), drafts);
  ok(P.total === 4 && P.exclus === 1, 'le compte de test est écarté (' + P.total + ' suivis, ' + P.exclus + ' écarté)');
  ok(P.connus === 3 && P.inconnus === 1,
    'trois dossiers remontent leur avancement, un est d’avant la mesure (' + P.connus + '/' + P.inconnus + ')');
  const et = (k) => (P.etapes.find((x) => x.cle === k) || {}).faites;
  ok(et('ins') === 0, 'AUCUN des trois n’a fourni son attestation : c’est elle qui bloque (' + et('ins') + ')');
  ok(et('id') === 2 && et('svc') === 2 && et('acc') === 1,
    'les autres étapes sont inégalement franchies (identité ' + et('id') + ', métiers ' + et('svc') + ', engagements ' + et('acc') + ')');
  ok(P.presque.length === 1 && P.presque[0].name === 'Anne Ba',
    'et on NOMME celui qui est à une seule étape de pouvoir envoyer : c’est là qu’un appel rapporte le plus');
  ok(P.parNombre[0] === 1 && P.parNombre[3] === 1,
    'zéro sur quatre et trois sur quatre n’appellent pas le même geste, et se comptent séparément');
  ok(P.sansPush === 1, 'un ne peut recevoir aucune notification : un rappel dans l’app ne l’atteindrait pas');

  /* ON NE DÉSIGNE PAS UN MUR. L'écran présente quatre cartes qu'on remplit dans
     l'ordre qu'on veut : en faire un escalier inventerait un ordre que rien n'impose. */
  ok(!/PRO_MURS|murs:PRO_ETAPES/.test(html),
    'aucun « mur » côté prestataire : les quatre étapes ne sont pas un escalier');

  console.log('\nC — la carte de la console, rendue');
  const vue = await p.evaluate((d) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null };
    S.adminArtisans = []; S.adminArtsLoaded = true; S.adminClients = []; S.adminClisLoaded = true;
    S.adminReqs = []; S.adminReqsLus = true; S.adminDrafts = d;
    S._fold = { 'a-drafts': true };
    window.__render();
    const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="a-drafts"]'));
    return c ? c.innerText.replace(/\s+/g, ' ') : null;
  }, drafts);
  ok(!!vue && /SUR 3 DOSSIERS SUIVIS/i.test(vue), 'la carte s’ouvre sur ce que les dossiers suivis ont rempli');
  ok(!!vue && /Assurance 3 ne l’ont pas faite/.test(vue),
    'et met l’étape qui bloque EN PREMIER, avec son nombre');
  ok(!!vue && /est à UNE étape de pouvoir envoyer/.test(vue) && /Anne/.test(vue),
    'elle nomme celui qu’il faut rappeler en priorité');
  // `innerText` est normalisé plus haut par /\s+/ → ' ', et `\s` remplace AUSSI les
  // espaces insécables : la citation ne peut donc pas être cherchée avec les siennes.
  ok(!!vue && /il ne manque que « ?Assurance ?»/.test(vue),
    'et sa ligne le dit aussi, à l’endroit où on lit son nom');
  ok(!!vue && /avant cette mesure/.test(vue),
    'ce qu’on ne sait pas est DIT : un dossier d’avant la mesure n’est pas compté comme vide');
  ok(!!vue && !/Essai/.test(vue), 'et le compte de test n’y figure pas');

  console.log('\nD — le jalon part d’une seule porte, et seulement s’il change');
  ok(/function saveProDraft\(\)\{noterJalonsPro\(\);/.test(html),
    'tout enregistrement de brouillon passe par la même porte');
  ok(/if\(S\._jalonsProEcrits===cle\)return;/.test(html),
    'et réécrire la fiche à l’identique n’apprendrait rien à personne : on ne le fait pas');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
