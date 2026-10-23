/* « L'ACCÈS AUX PAGES D'ADMINISTRATEUR EST DÉCIDÉ DANS LE NAVIGATEUR. »
   Signalé par un développeur de l'île, le 23/10/2026, et c'était exact.

   `handleDeepLink` lisait « ?open=admin » et posait `S.persona='admin'` SANS AUCUN
   CONTRÔLE : n'importe qui, en tapant l'adresse, ouvrait la coquille de la console.
   Les données, elles, n'ont jamais bougé — chaque lecture passe par les règles
   Firestore, mesurées refusées en production sur `users`, `artisans`, `prospects`,
   `ledger`, `reports`, `comptesSupprimes` et `adminTokens`. Mais `settings/*` est
   lisible de tous (c'est voulu : le catalogue), et la console en affiche les tarifs,
   le taux de rétrocession et les paliers de fidélité : la coquille n'était donc pas
   tout à fait vide. Et un visiteur pouvait photographier « Console d'administration »
   sur le site de production.

   LE LIEN N'A JAMAIS SERVI QU'À L'ADMINISTRATEUR, et il ne lui sert à rien : il vient
   de la notification push envoyée à ses propres jetons (`adminTokens`, admin seul), et
   quand sa session se rétablit `loadUserProfile` le met DÉJÀ dans la console. La route
   donnait donc zéro à celui qui y a droit, et une porte à tous les autres.

   LA MOITIÉ QUI COMPTE est que les deux routes voisines ne bougent pas : « ?open=missions »
   et « ?open=wallet » n'ouvrent aucun écran réservé — elles amènent sur l'espace d'un
   rôle, dont tout le contenu est gardé côté serveur — et elles servent, elles, aux
   e-mails de bienvenue de gens qui ne sont pas encore connectés. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const APP = 'file://' + path.join(RACINE, 'tests/harn/app.html');

async function ouvrir(b, qs) {
  const p = await b.newPage({ viewport: { width: 390, height: 1300 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(APP + (qs || ''));
  await p.waitForFunction(() => window.__S && window.__render);
  return { p, errs };
}

(async () => {
  const b = await chromium.launch(o);

  // 1 ·  LA PORTE
  console.log('\n« ?open=admin » dans la barre d’adresse');
  const a = await ouvrir(b, '?open=admin');
  const persona = await a.p.evaluate(() => window.__S.persona);
  ok(persona !== 'admin', 'un visiteur ne prend pas la peau de l’administrateur (persona = ' + persona + ')');

  // On demande au navigateur CE QU’IL A PEINT, pas ce que l’état déclare : la barre de
  // la console ne se dessine que dans l’espace admin.
  const barre = await a.p.evaluate(() => ({
    nav: !!document.querySelector('[data-adm="home"]'),
    mot: /Console d.administration|Démarchage/.test(document.body.innerText || ''),
  }));
  ok(!barre.nav, 'aucune barre de console n’est dessinée');
  ok(!barre.mot, 'les écrans de la console ne sont nommés nulle part');
  ok(a.errs.length === 0, 'la page s’ouvre sans erreur (' + (a.errs[0] || 'aucune') + ')');

  // 2 ·  LA MOITIÉ QUI COMPTE : les routes voisines sont intactes
  console.log('\nLes deux routes voisines ne bougent pas');
  const m = await ouvrir(b, '?open=missions');
  ok(await m.p.evaluate(() => window.__S.persona) === 'pro', '« ?open=missions » ouvre toujours l’espace prestataire');
  const w = await ouvrir(b, '?open=wallet');
  ok(await w.p.evaluate(() => window.__S.clientNav) === 'wallet', '« ?open=wallet » ouvre toujours les réservations');

  // 3 ·  ET LA PORTE LÉGITIME RESTE OUVERTE : le geste de l’application, lui, est gardé
  //      par `isAdminAccount()` — on vérifie que c’est bien LUI qui décide, à sa source.
  console.log('\nLa porte de l’application reste gardée');
  const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const goAdmin = (src.match(/case 'go-admin':[^\n]*/) || [''])[0];
  ok(/isAdminAccount\(\)/.test(goAdmin), '« Console d’administration » exige toujours le compte administrateur');
  const deep = (src.match(/if\(open==='admin'\)[^\n]*/) || [''])[0];
  ok(deep !== '', 'la route « ?open=admin » est toujours lue (assertion arrière : sans elle, tout passerait)');
  ok(!/persona='admin'/.test(deep), 'et elle ne donne plus la peau de l’administrateur');

  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert.');
  process.exit(f ? 1 : 0);
})();
