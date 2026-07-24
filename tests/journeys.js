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

  // ── Test 2 : écran d'accueil compte — deux CTA, plus de mode invité, Google partout ─
  console.log('Test 2 — création de compte');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    ok(await page.$('[data-act="onb-start"]'), 'bouton « Je cherche un service » présent');
    ok(await page.$('[data-act="go-artisan-signup"]'), 'bouton « Je propose un service » présent');
    ok(!(await page.$('[data-act="enter-guest"]')), 'bouton découverte sans compte retiré');
    // Création de compte client : le bouton Google DOIT être proposé (inscription rapide).
    await page.click('[data-act="onb-start"]');
    await page.waitForTimeout(700);
    let txt = await page.evaluate(() => document.body.innerText);
    ok(/Créer mon compte/.test(txt), 'écran infos de création affiché');
    ok(!!(await page.$('[data-act="google-client"]')), 'Google proposé à la création de compte');
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

  // ── Test 3 : inscription prestataire e-mail — compte court → profil en 4 étapes ──
  console.log('Test 3 — inscription prestataire (compte court + étapes)');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    await page.click('[data-act="go-artisan-signup"]');
    await page.waitForTimeout(700);
    const kind = await page.$('[data-act="signup-kind:artisan"]');
    if (kind) { await kind.click(); await page.waitForTimeout(700); }
    // Écran d'entrée MINIMAL : juste de quoi créer le compte + option Google.
    ok(await page.$('[data-pf="name"]'), 'champ nom présent');
    ok(await page.$('[data-pf="email"]'), 'champ e-mail présent');
    ok(await page.$('[data-act="google-pro"]'), 'option Google présente');
    ok(!(await page.$('[data-pf="siret"]')), 'SIRET PAS demandé à l’entrée (repoussé au profil)');
    // Créer le compte (démo) → on entre en brouillon avec la checklist.
    await page.fill('[data-pf="name"]', 'Léa Artisan');
    await page.fill('[data-pf="email"]', 'lea@test.fr');
    await page.fill('[data-pf="password"]', 'azerty');
    await page.fill('[data-pf="password2"]', 'azerty');
    await page.click('[data-act="pro-account-create"]'); await page.waitForTimeout(700);
    const hub = await page.evaluate(() => document.body.innerText);
    ok(/Bienvenue Léa/.test(hub), 'brouillon : accueil « Bienvenue » après création');
    ok(/0\/4|1\/4/.test(hub), 'brouillon : compteur d’étapes');
    // Ouvrir l'étape Identité → les mentions société (forme/RCS) sont là.
    await page.click('[data-act="draft-step:id"]'); await page.waitForTimeout(600);
    ok(await page.$('[data-pf="siret"]'), 'étape Identité : champ SIRET présent');
    ok(await page.$('[data-pf="legalForm"]'), 'étape Identité : forme juridique (société)');
    ok(await page.$('[data-pf="rcsCity"]'), 'étape Identité : ville RCS (société)');
    ok(await page.$('[data-pf="refCode"]'), 'étape Identité : code de parrainage');
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

  // ── Test 4 : inscription via Google proposée côté client ET prestataire ─────
  console.log('Test 4 — inscription via Google (client & prestataire)');
  {
    const errs = [];
    const page = await newPage(browser, errs);
    // Le mode invité a été retiré de l'accueil.
    ok(!(await page.$('[data-act="enter-guest"]')), 'accueil sans bouton invité');
    // Client : Google proposé sur l'écran de création.
    await page.click('[data-act="onb-start"]');
    await page.waitForTimeout(700);
    ok(!!(await page.$('[data-act="google-client"]')), 'Google proposé à l’inscription client');
    ok(realErrors(errs).length === 0, 'aucune erreur JS (client)');
    await page.close();
    // Prestataire : Google proposé sur le formulaire de candidature.
    const page2 = await newPage(browser, errs);
    await page2.click('[data-act="go-artisan-signup"]');
    await page2.waitForTimeout(700);
    const kind = await page2.$('[data-act="signup-kind:artisan"]');
    if (kind) { await kind.click(); await page2.waitForTimeout(700); }
    ok(!!(await page2.$('[data-act="google-pro"]')), 'Google proposé à l’inscription prestataire');
    ok(realErrors(errs).length === 0, 'aucune erreur JS (prestataire)');
    await page2.close();
  }

  // ── Test 5 : point GPS OBLIGATOIRE avant de confirmer une commande à domicile ─
  console.log('Test 5 — point GPS obligatoire');
  {
    const errs = [];
    // Contexte avec géoloc autorisée + position fixée : « Enregistrer le point GPS » résout
    // immédiatement (sinon, sans permission, getCurrentPosition reste en attente en headless).
    const gctx = await browser.newContext({ locale: 'fr-FR', permissions: ['geolocation'], geolocation: { latitude: 17.9, longitude: -62.83 } });
    const page = await gctx.newPage();
    page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (/gstatic|googleapis|firebase|firebaseio|cloudfunctions/.test(u)) return route.abort();
      return route.continue();
    });
    await page.goto(INDEX, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1800);
    // Création de compte (démo) → l'accueil client (aucune adresse enregistrée).
    await page.click('[data-act="onb-start"]'); await page.waitForTimeout(500);
    await page.fill('[data-cf="name"]', 'Jean Test');
    await page.fill('[data-cf="email"]', 'jean@test.fr');
    await page.fill('[data-cf="password"]', 'azerty');
    await page.fill('[data-cf="password2"]', 'azerty');
    await page.click('[data-act="toggle-cterms"]'); await page.waitForTimeout(150);
    await page.click('[data-act="finish-onboard"]'); await page.waitForTimeout(600);
    ok(/Bonjour/i.test(await page.evaluate(() => document.body.innerText)), 'compte créé → accueil client');
    // Commande d'un service à domicile → écran de configuration (adresse ponctuelle, sans GPS).
    const svc = await page.$('[data-svc="menage"]'); ok(!!svc, 'tuile Ménage présente');
    if (svc) { await svc.click(); await page.waitForTimeout(500); }
    // Confirmer SANS point GPS doit être BLOQUÉ (on reste sur la configuration).
    await page.click('[data-cfg="confirm"]'); await page.waitForTimeout(400);
    ok(/obligatoire/i.test(await page.evaluate(() => document.body.innerText)), 'blocage : « obligatoire » sans GPS');
    ok(!!(await page.$('[data-cfg="confirm"]')), 'toujours sur la configuration (commande non envoyée)');
    // Enregistrer le point GPS (repli sur coordonnées par défaut si géoloc refusée) → la commande avance.
    const geo = await page.$('[data-cfg="geoloc"]'); ok(!!geo, 'bouton « Enregistrer le point GPS » présent');
    if (geo) { await geo.click(); await page.waitForTimeout(900); }
    await page.click('[data-cfg="confirm"]'); await page.waitForTimeout(600);
    ok(!(await page.$('[data-cfg="confirm"]')), 'GPS enregistré → la commande est acceptée');
    ok(realErrors(errs).length === 0, 'aucune erreur JS');
    await page.close(); await gctx.close();
  }

  // ── Test 6 : parrainage — code prérempli depuis un lien ?parrain= ────────────
  console.log('Test 6 — parrainage : préremplissage du code');
  {
    const errs = [];
    const ctx = await browser.newContext({ locale: 'fr-FR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
    await page.route('**/*', (route) => {
      const u = route.request().url();
      if (/gstatic|googleapis|firebase|firebaseio|cloudfunctions/.test(u)) return route.abort();
      return route.continue();
    });
    await page.goto(INDEX + '?parrain=kevin-8a3f', { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1800);
    await page.click('[data-act="go-artisan-signup"]'); await page.waitForTimeout(600);
    const kind = await page.$('[data-act="signup-kind:artisan"]');
    if (kind) { await kind.click(); await page.waitForTimeout(600); }
    // Créer le compte (démo) puis ouvrir l'étape Identité : le code parrain y est prérempli.
    await page.fill('[data-pf="name"]', 'Léa Artisan');
    await page.fill('[data-pf="email"]', 'lea@test.fr');
    await page.fill('[data-pf="password"]', 'azerty');
    await page.fill('[data-pf="password2"]', 'azerty');
    await page.click('[data-act="pro-account-create"]'); await page.waitForTimeout(600);
    await page.click('[data-act="draft-step:id"]'); await page.waitForTimeout(500);
    const val = await page.$eval('[data-pf="refCode"]', (el) => el.value).catch(() => null);
    ok(val === 'KEVIN-8A3F', 'code de parrainage prérempli en majuscules depuis le lien');
    ok(realErrors(errs).length === 0, 'aucune erreur JS');
    await page.close(); await ctx.close();
  }

  await browser.close();
  if (failures) { console.log('\n' + failures + ' échec(s) — DÉPLOIEMENT À BLOQUER'); process.exit(1); }
  console.log('\nTous les parcours passent ✓');
})().catch((e) => { console.error('HARNAIS EN ÉCHEC', e); process.exit(2); });
