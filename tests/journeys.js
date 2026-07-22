/* Tests de parcours Ti-Services — harnais SANS framework (node + playwright-core).
 *
 * POURQUOI : les régressions récentes (verrou paiement, boutons de connexion,
 * formulaire d'inscription…) n'étaient détectables qu'en déroulant les VRAIS
 * parcours. Ce harnais ouvre l'app en local (Firebase bloqué → mode simulation),
 * clique comme un utilisateur et vérifie ce qui s'affiche. Il DOIT passer avant
 * tout déploiement (verrou dans le workflow GitHub Actions).
 *
 * Usage : node tests/journeys.js   (code de sortie ≠ 0 si un test échoue)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
// Chromium : chemin pré-provisionné (environnement local) sinon celui de Playwright (CI).
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOpts = { headless: true };
if (fs.existsSync(LOCAL_CHROMIUM)) launchOpts.executablePath = LOCAL_CHROMIUM;

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log('  ✓ ' + label); }
  else { failures++; console.log('  ✗ ÉCHEC : ' + label); }
}

async function newPage(browser, errs) {
  // Locale française forcée : l'app se traduit toute seule selon la langue du
  // navigateur, et les assertions du harnais sont écrites en français.
  const ctx = await browser.newContext({ locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  // Aucun appel réseau vers Firebase/Google : l'app démarre en mode simulation locale.
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (/gstatic|googleapis|firebase|firebaseio|cloudfunctions/.test(u)) return route.abort();
    return route.continue();
  });
  await page.goto(INDEX, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1800);
  return page;
}
function realErrors(errs) {
  return errs.filter((e) => !/net::ERR|Failed to load resource|firebase|firestore|ERR_FAILED/i.test(e));
}

(async () => {
  const browser = await chromium.launch(launchOpts);

  // ── Test 1 : démarrage sain ────────────────────────────────────────────────
  console.log('Test 1 — démarrage');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    const len = await page.evaluate(() => document.body.innerHTML.length);
    ok(len > 100000, 'app rendue (' + len + ' caractères)');
    ok(realErrors(errs).length === 0, 'aucune erreur JS (' + realErrors(errs).join(' | ').slice(0, 200) + ')');
    await page.close();
  }

  // ── Test 2 : écran d'accueil compte — deux CTA + invité, Google réservé à la connexion ─
  console.log('Test 2 — création de compte');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    ok(await page.$('[data-act="onb-start"]'), 'bouton « Je cherche un service » présent');
    ok(await page.$('[data-act="go-artisan-signup"]'), 'bouton « Je propose un service » présent');
    ok(await page.$('[data-act="enter-guest"]'), 'bouton découverte sans compte présent');
    // Création de compte client : PAS de bouton Google (impossible de distinguer client/pro).
    await page.click('[data-act="onb-start"]');
    await page.waitForTimeout(700);
    let txt = await page.evaluate(() => document.body.innerText);
    ok(/Créer mon compte/.test(txt), 'écran infos de création affiché');
    ok(!/Continuer avec Google/.test(txt), 'pas de Google à la création de compte');
    // Connexion : le bouton Google DOIT y être.
    const loginBtn = await page.$('[data-act="show-login"]');
    ok(!!loginBtn, 'lien « Se connecter » présent');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForTimeout(700);
      txt = await page.evaluate(() => document.body.innerText);
      ok(/Continuer avec Google/.test(txt), 'Google présent sur l\'écran de connexion');
      ok(!!(await page.$('[data-loginform]')) || /Mot de passe/i.test(txt), 'formulaire de connexion affiché');
    }
    ok(realErrors(errs).length === 0, 'aucune erreur JS');
    await page.close();
  }

  // ── Test 3 : inscription prestataire — champs société (forme/capital/RCS) ──
  console.log('Test 3 — inscription prestataire (mentions société)');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    await page.click('[data-act="go-artisan-signup"]');
    await page.waitForTimeout(700);
    // Choix du type (artisan / conciergerie) si l'écran existe, sinon déjà sur le formulaire.
    const kind = await page.$('[data-act="signup-kind:artisan"]');
    if (kind) { await kind.click(); await page.waitForTimeout(700); }
    ok(await page.$('[data-pf="name"]'), 'champ nom / raison sociale présent');
    ok(await page.$('[data-pf="siret"]'), 'champ SIRET présent');
    // Par défaut « Société » : les mentions légales société doivent être demandées.
    ok(await page.$('[data-pf="legalForm"]'), 'champ forme juridique présent (société)');
    ok(await page.$('[data-pf="rcsCity"]'), 'champ ville RCS présent (société)');
    // Bascule micro-entreprise : ces champs disparaissent (non requis).
    const micro = await page.$('[data-pstatustype="micro"]');
    ok(!!micro, 'segment micro-entreprise présent');
    if (micro) {
      await micro.click();
      await page.waitForTimeout(500);
      ok(!(await page.$('[data-pf="legalForm"]')), 'mentions société masquées en micro-entreprise');
    }
    ok(realErrors(errs).length === 0, 'aucune erreur JS');
    await page.close();
  }

  // ── Test 4 : mode invité — services visibles sans compte ───────────────────
  console.log('Test 4 — mode invité');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    await page.click('[data-act="enter-guest"]');
    await page.waitForTimeout(900);
    const txt = await page.evaluate(() => document.body.innerText);
    ok(/Ménage/i.test(txt), 'services affichés en invité (Ménage visible)');
    ok(realErrors(errs).length === 0, 'aucune erreur JS');
    await page.close();
  }

  await browser.close();
  if (failures) { console.log('\n' + failures + ' échec(s) — DÉPLOIEMENT À BLOQUER'); process.exit(1); }
  console.log('\nTous les parcours passent ✓');
})().catch((e) => { console.error('HARNAIS EN ÉCHEC', e); process.exit(2); });
