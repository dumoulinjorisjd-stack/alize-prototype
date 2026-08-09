/* DEPUIS QUAND CE DOSSIER MOLLIE ATTEND-IL ?
   La console disait l'ÉTAT d'un dossier (« validation en cours »), jamais sa DURÉE.
   Impossible de distinguer une vérification qui suit son cours d'un dossier bloqué
   depuis des semaines, ni de relancer Mollie avec une date en main. Le serveur
   horodate désormais l'entrée en attente (mollieSince) ; la console l'affiche,
   alerte au-delà de deux semaines, et remonte le plus ancien en tête. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const JOUR = 86400000;

console.log('A — côté serveur : l’horodatage est posé, effacé, et protégé');
ok(/if \(ready\.ok\) \{\s*\n\s*if \(ad\.mollieSince\) \{ upd\.mollieSince = FieldValue\.delete\(\)/.test(fn),
  'le repère est effacé dès l’activation (un futur blocage repart de zéro)');
ok(/\} else if \(!ad\.mollieSince\) \{\s*\n\s*upd\.mollieSince = Date\.now\(\);/.test(fn),
  'et posé à la première observation d’un dossier non actif');
ok(/if \(prevStatus === 'pending'\) upd\.mollieSinceEstime = true;/.test(fn),
  'un dossier qui attendait DÉJÀ est marqué « estimé » — pas de « depuis 0 jour » mensonger');
ok(/mollieSince', 0\) == resource\.data\.get\('mollieSince/.test(rules),
  'l’artisan ne peut pas remettre son compteur à zéro (règle Firestore)');
ok(/mollieSinceEstime', false\) == resource\.data\.get\('mollieSinceEstime/.test(rules),
  'ni retirer la mention « estimé »');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 420, height: 900}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.body.classList.add('standalone'); });

  // Trois prestataires validés dont les paiements ne sont pas actifs, d'ancienneté
  // croissante — plus un actif, qui ne doit jamais apparaître dans les bloqués.
  const poser = (jours) => p.evaluate((J) => {
    const S = window.__S;
    const j = (n) => Date.now() - n * 86400000;
    S.persona = 'admin'; S.admin = {view: 'home', sel: null};
    S.demoMode = false; S.adminArtsLoaded = true; S.adminClients = []; S.adminThreads = [];
    S.adminArtisans = [
      {id: 'a-recent', name: 'Nadia Récent', status: 'valide', cats: ['menage'], zone: 'Gustavia',
        mollieStatus: 'pending', mollieOnb: 'in-review', mollieCanPay: true, mollieCanSettle: false,
        mollieCanWork: true, mollieSince: j(J[0]), mollieSinceEstime: false, pendingCats: []},
      {id: 'a-vieux', name: 'Laure Ancienne', status: 'valide', cats: ['coiffure'], zone: 'Lorient',
        mollieStatus: 'pending', mollieOnb: 'in-review', mollieCanPay: true, mollieCanSettle: false,
        mollieCanWork: true, mollieSince: j(J[1]), mollieSinceEstime: false, pendingCats: []},
      {id: 'a-estime', name: 'Aurore Estimée', status: 'valide', cats: ['jardin'], zone: 'Saline',
        mollieStatus: 'pending', mollieOnb: 'needs-data', mollieCanPay: false, mollieCanSettle: false,
        mollieCanWork: false, mollieSince: j(J[2]), mollieSinceEstime: true, pendingCats: []},
      {id: 'a-actif', name: 'Paul Actif', status: 'valide', cats: ['plomberie'], zone: 'Gustavia',
        mollieStatus: 'active', mollieCanPay: true, mollieCanSettle: true, mollieCanWork: true, pendingCats: []},
    ];
    window.__render();
  }, jours).then(() => p.evaluate(() => {
    // La carte « Prêts à encaisser » est repliée par défaut : on l'ouvre, sinon son
    // contenu n'est même pas dans la page.
    const h = document.querySelector('[data-fold="a-mollie"]');
    if (h && h.getAttribute('aria-expanded') !== 'true') h.click();
  }));

  console.log('B — la durée s’affiche dans la liste des dossiers bloqués');
  await poser([3, 21, 9]);
  await p.waitForTimeout(400);
  const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/En attente depuis 3 jours/.test(txt), 'un dossier de 3 jours affiche « depuis 3 jours »');
  ok(/En attente depuis au moins 9 jours/.test(txt),
    'un dossier repris en cours de route affiche « depuis AU MOINS 9 jours »');
  ok(!/Paul Actif/.test(txt), 'le prestataire actif n’apparaît pas parmi les dossiers à relancer');

  console.log('C — au-delà de deux semaines, on alerte');
  ok(/depuis 21 jours — inhabituel, relancez Mollie/.test(txt),
    '21 jours : « inhabituel, relancez Mollie »');
  ok(!/depuis 3 jours — inhabituel/.test(txt), '3 jours : aucune alarme (c’est normal)');

  console.log('D — deux populations distinctes, chacune du plus ancien au plus récent');
  const ordre = await p.evaluate(() => Array.from(document.querySelectorAll('[data-adm^="art:a-"]'))
    .map((x) => x.dataset.adm));
  // Aurore ne peut pas travailler du tout : c'est le blocage le plus grave, il passe avant
  // ceux qui encaissent déjà et attendent seulement l'ouverture de leurs virements.
  ok(ordre[0] === 'art:a-estime',
    'le dossier qui empêche de travailler vient en premier — ordre : ' + ordre.join(' > '));
  ok(ordre.indexOf('art:a-vieux') < ordre.indexOf('art:a-recent'),
    'et dans les virements retenus, Laure (21 j) passe avant Nadia (3 j)');
  // innerText applique text-transform : l'intertitre ressort en capitales.
  ok(/virements retenus par mollie · 2/i.test(txt),
    'la section « virements retenus » les compte tous les deux — ils étaient invisibles avant');
  ok(/Leur gain est en sécurité et part tout seul/.test(txt),
    'et rappelle que leur argent n’est pas perdu');

  console.log('E — la fiche de l’artisan porte aussi la durée');
  await p.evaluate(() => {
    window.__S.admin = {view: 'art', sel: 'a-vieux'}; window.__render();
  });
  await p.waitForTimeout(350);
  const fiche = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/Laure Ancienne/.test(fiche), 'la fiche est ouverte');
  ok(/En attente depuis 21 jours/.test(fiche), 'elle indique l’ancienneté du dossier');

  console.log('F — sans horodatage (dossier jamais synchronisé), rien n’est inventé');
  await p.evaluate(() => {
    const S = window.__S;
    S.admin = {view: 'home', sel: null};
    S.adminArtisans = [{id: 'a-sans', name: 'Sans Repère', status: 'valide', cats: ['menage'],
      zone: 'Gustavia', mollieStatus: 'pending', mollieOnb: 'in-review', mollieCanPay: true,
      mollieCanSettle: false, mollieCanWork: true, mollieSince: 0, pendingCats: []}];
    window.__render();
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const h = document.querySelector('[data-fold="a-mollie"]');
    if (h && h.getAttribute('aria-expanded') !== 'true') h.click();
  });
  await p.waitForTimeout(350);
  const sans = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/Sans Repère/.test(sans), 'le dossier est bien listé');
  ok(!/En attente depuis/.test(sans), 'aucune durée affichée tant qu’on n’en connaît pas le départ');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');
  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
