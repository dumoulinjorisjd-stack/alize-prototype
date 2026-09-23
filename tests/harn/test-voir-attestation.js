/* « QUAND JE CLIQUE SUR VOIR L'ATTESTATION, IL NE SE PASSE RIEN. »

   Relevé le 23/09/2026 dans la console, depuis l'application INSTALLÉE. Le lien était un
   `<a href="…" target="_blank">` : dans une application installée sur iPhone, un lien qui
   demande un nouvel onglet n'ouvre RIEN — pas d'erreur, pas de message, rien. Le chemin
   ordinaire de l'administrateur (ouvrir l'attestation, puis valider ou refuser) était donc
   coupé, et les deux boutons juste en dessous disent « ouvrez le document ci-dessus ».

   Le document s'ouvre maintenant DANS l'application. C'est meilleur partout : on reste à
   côté des boutons qui décident, au lieu de partir dans un onglet.

   DEUX AUTRES DÉFAUTS SUR LA MÊME LIGNE, trouvés en la lisant.
   1. UNE ATTESTATION EST UN PDF neuf fois sur dix, et la visionneuse ne posait qu'une
      balise `img` : un cadre blanc. Ce qu'on ne sait pas afficher se dit désormais.
   2. `insuranceUrl` est écrit par le PRESTATAIRE sur sa propre fiche — les règles le
      permettent, c'est lui qui dépose son attestation. `esc()` protège l'attribut, pas le
      SCHÉMA : « javascript:… » y passait entier, et c'est l'ADMINISTRATEUR qui clique,
      avec ses droits. Liste fermée : https, rien d'autre. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const o = { headless: true };
  if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 430, height: 1000 }, locale: 'fr-FR', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S, null, { timeout: 20000 });
  await p.waitForTimeout(700);
  // La scène du harnais est masquée : sans cela tout rectangle vaut zéro et l'épreuve
  // confirmerait n'importe quoi.
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });

  const poserDansLaPage = (url) => {
    const S = window.__S;
    S.persona = 'admin'; S.onboarded = true; S.admin = S.admin || {};
    S.adminArtisans = [{ id: 'a-test', uid: 'a-test', real: true, name: 'Test Prestataire', status: 'attente',
      type: 'entreprise', cats: ['menage'], rates: {}, rate: 35, siret: '80412578900014', zone: 'Gustavia',
      insured: true, insurer: 'AXA', insuranceUrl: url, insuranceStatus: 'attente', history: [], diplomas: [] }];
    S.adminClients = []; S.admin.view = 'art'; S.admin.sel = 'a-test';
    S.imgView = null; window.__render();
  };
  const poser = (url) => p.evaluate(poserDansLaPage, url);
  const lire = () => p.evaluate(() => {
    const bt = document.querySelector('[data-act="doc-open"]');
    return { bouton: !!bt, src: bt ? bt.getAttribute('data-src') : null,
      onglet: !!document.querySelector('a[target="_blank"][href*="attestation"]'),
      note: (document.body.innerText.match(/non exploitable[^\n]*/) || [''])[0] };
  });

  console.log('\nA — une adresse https ouvre le document DANS l’application');
  await poser('https://firebasestorage.googleapis.com/v0/b/x/o/insurance%2Fu%2Fattestation.pdf?alt=media&token=abc');
  await p.waitForTimeout(300);
  let vu = await lire();
  ok(vu.bouton, 'le document s’ouvre par un bouton de l’application, plus par un onglet qui n’ouvre rien');
  ok(!vu.onglet, 'et il ne reste aucun lien « nouvel onglet » comme seul chemin');

  await p.click('[data-act="doc-open"]'); await p.waitForTimeout(350);
  let v = await p.evaluate(() => ({ ouvert: !!document.querySelector('.imgviewer'),
    pdf: !!document.querySelector('.iv-pdf'), img: !!document.querySelector('.iv-img'),
    sortie: !!document.querySelector('.iv-bar [data-act="doc-dehors"]'),
    ancres: document.querySelectorAll('.iv-bar a').length }));
  ok(v.ouvert && v.pdf && !v.img, 'un PDF s’affiche dans un cadre, et non dans une balise image qui resterait blanche');
  /* LA BARRE N'A PLUS D'ANCRE. « Ouvrir dans un onglet » et « Télécharger » étaient des
     `<a target=_blank>` et `<a download>` : dans l'application installée, le premier
     n'ouvre rien et le second est ignoré — deux boutons morts au-dessus du document.
     Un seul geste les remplace, et il passe par la porte qui sait naviguer à défaut. */
  ok(v.sortie && v.ancres === 0,
    'la barre offre UN geste qui sort, et plus aucune ancre morte (' + v.ancres + ')');

  console.log('\nB — une image reste une image');
  await p.evaluate(() => { window.__S.imgView = null; window.__render(); });
  await poser('https://firebasestorage.googleapis.com/v0/b/x/o/insurance%2Fu%2Fattestation.jpg?alt=media&token=abc');
  await p.waitForTimeout(250);
  await p.click('[data-act="doc-open"]'); await p.waitForTimeout(300);
  v = await p.evaluate(() => ({ img: !!document.querySelector('.iv-img'), pdf: !!document.querySelector('.iv-pdf') }));
  ok(v.img && !v.pdf, 'une attestation photographiée s’affiche comme une image');

  console.log('\nC — ce qui n’est pas https ne devient pas un lien');
  await p.evaluate(() => { window.__S.imgView = null; window.__render(); });
  await poser('javascript:fetch("/vol")');
  await p.waitForTimeout(250);
  vu = await lire();
  ok(!vu.bouton, 'une adresse « javascript: » n’ouvre aucune porte — c’est l’ADMINISTRATEUR qui clique');
  ok(/non exploitable/.test(vu.note), 'et la fiche le DIT, au lieu de montrer un lien mort'
    + (vu.note ? ' — « ' + vu.note.slice(0, 60) + ' »' : ''));

  console.log('\nD — la garde est à la PORTE, pas seulement chez celui qui dessine le bouton');
  // Un bouton fabriqué ailleurs, ou modifié dans le navigateur, ne doit pas passer.
  await p.evaluate(() => {
    const d = document.createElement('button');
    d.setAttribute('data-act', 'doc-open'); d.setAttribute('data-src', 'javascript:1'); d.id = 'faux';
    document.body.appendChild(d); d.click();
  });
  await p.waitForTimeout(250);
  ok(await p.evaluate(() => !document.querySelector('.imgviewer')),
    'un bouton portant une adresse non https n’ouvre rien, même posé à la main');
  ok(/function lienSur\(u\)\{[^}]*https/.test(src.replace(/\s+/g, ' ')) || /lienSur/.test(src),
    'la garde existe et porte un nom, elle ne se recopie pas à chaque emploi');

  /* E — L'APPLICATION INSTALLÉE N'A PAS D'ONGLETS.
     « Quand je clique sur Télécharger ou Ouvrir dans un onglet, rien ne se passe » —
     signalé juste après, sur la visionneuse elle-même. Dans une application posée sur
     l'écran d'accueil d'un iPhone, `target="_blank"` n'ouvre rien, `download` est ignoré,
     et `window.open` rend `null` SANS lever : le `try/catch` ne rattrape rien. On essaie
     l'onglet, et s'il ne vient pas on NAVIGUE.
     L'épreuve se met dans cette peau : elle fait croire à l'application qu'elle est
     installée, et fait rendre `null` à `window.open` — les deux conditions exactes du
     défaut, qu'aucun navigateur de bureau ne reproduit tout seul. */
  console.log('\nE — dans l’application installée, un lien qui sort finit par sortir');
  /* DEUX PEAUX, ET LA SECONDE EST CELLE DE L'ÉDITEUR. Un premier jet ne reconnaissait
     l'application installée qu'à `display-mode: standalone` — qui répond FAUX dans une
     WebView Capacitor. La garde ne se serait donc jamais déclenchée dans l'application
     du Play Store, c'est-à-dire là où le défaut a été signalé. On éprouve les deux.
     Et l'on MESURE le comportement : une épreuve qui se contenterait de vérifier qu'une
     fonction existe passerait au vert sans rien prouver. */
  const peaux = [
    ['application posée sur l’écran d’accueil', () => {
      delete window.Capacitor;
      window.matchMedia = (q) => ({ matches: /display-mode:\s*standalone/.test(q), media: q,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }],
    ['coquille native du Play Store', () => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
      // Pas de `standalone` ici : c'est tout le piège.
      window.matchMedia = (q) => ({ matches: false, media: q,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    }],
  ];
  for (let i = 0; i < peaux.length; i++) {
    const [nom, poserPeau] = peaux[i];
    await p.evaluate(poserPeau);
    const ancre = '#sortie-' + i;
    await p.evaluate((a) => {
      window.__ouvertures = [];
      window.open = (u) => { window.__ouvertures.push(String(u)); return null; };
      const el = document.createElement('a');
      el.setAttribute('target', '_blank'); el.setAttribute('href', a);
      el.id = 'lien-sortant'; el.textContent = 'sortir'; document.body.appendChild(el);
    }, ancre);
    await p.click('#lien-sortant'); await p.waitForTimeout(250);
    const sortie = await p.evaluate(() => ({ tente: (window.__ouvertures || []).length, ancre: location.hash }));
    ok(sortie.tente === 1, nom + ' : l’onglet est tenté d’abord (' + sortie.tente + ')');
    ok(sortie.ancre === ancre,
      nom + ' : et comme il ne vient pas, on NAVIGUE — le lien ne meurt pas en silence');
    await p.evaluate(() => { const e = document.getElementById('lien-sortant'); if (e) e.remove(); });
  }
  await p.evaluate(() => { delete window.Capacitor; });

  // ET LA VISIONNEUSE N'A PLUS D'ANCRE MORTE DANS SA BARRE.
  ok(!/iv-bar[\s\S]{0,300}<a /.test(src.replace(/\n/g, '')),
    'la barre de la visionneuse n’a plus d’ancre « nouvel onglet » ni « télécharger », qui ne faisaient rien');
  // UN PDF SUR IPHONE NE S'AFFICHE PAS DANS UN CADRE : on ne pose pas le cadre, on le dit.
  // NI IOS, NI CHROME ANDROID, NI LA WEBVIEW N'ONT DE LECTEUR DE PDF EN CADRE : seul un
  // navigateur de BUREAU en a un. Un premier jet ne visait qu'iPhone ; l'éditeur est sur
  // Android, et le cadre y restait blanc de la même façon.
  ok(/pdfSansCadre=docEstPdf\(src\)&&\(!detectPlatform\(\)\.desktop\|\|isNativeShell\(\)\)/.test(src),
    'le cadre du PDF n’est posé que sur un navigateur de bureau, le seul qui sache l’afficher');
  /* ET DANS LA COQUILLE, ON NE « NAVIGUE » PAS VERS LE DOCUMENT : la configuration
     Capacitor autorise `*.googleapis.com`, donc l'adresse d'un fichier Storage s'ouvrirait
     DANS la WebView, qui ne sait rien afficher — l'utilisateur se retrouverait hors de
     l'application devant une page blanche. On écrit le fichier et on ouvre la feuille de
     partage, le chemin que l'application a déjà tracé pour ses factures. */
  ok(/isNativeShell\(\)\)\{[\s\S]{0,200}P\.Filesystem&&P\.Share/.test(src)
     && /Share\.share\(\{title:nomFichier/.test(src),
    'dans la coquille, le document passe d’abord par Filesystem + Share');
  /* ET QUAND LES PLUGINS NE SONT PAS DANS L'APK PUBLIÉ — ce qui est le cas —, on passe la
     main à ANDROID : une adresse `intent://` n'est pas dans `allowNavigation`, la WebView
     la remet au système, qui ouvre le lecteur de l'appareil. Aucun rebuild nécessaire.
     Et si même cela échoue, on COPIE le lien : un message « impossible » sans sortie
     laisse l'administrateur devant un document qu'il doit pourtant valider. */
  ok(/detectPlatform\(\)\.android[\s\S]{0,260}intent:\/\/'\+url\.replace/.test(src)
     && /action=android\.intent\.action\.VIEW/.test(src),
    'puis par une adresse `intent://`, que la WebView remet au système Android');
  ok(/navigator\.clipboard[\s\S]{0,160}Lien copié/.test(src),
    'et en dernier recours le lien est COPIÉ — jamais un « impossible » sans issue');
  // LE BOUTON QUI ACTIVE LES PAIEMENTS PASSE PAR LA MÊME PORTE.
  ok(/function openMollieAccount\(\)\{[\s\S]{0,400}ouvrirDehors\(url\);/.test(src),
    '« ouvrir mon compte Mollie » aussi : c’est par ce bouton qu’on active ses paiements');

  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
