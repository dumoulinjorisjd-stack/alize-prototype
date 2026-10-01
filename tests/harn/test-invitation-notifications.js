/* L'INVITATION AUX NOTIFICATIONS SE VOIT, OU ELLE NE SERT À RIEN.

   Mesuré sur les douze vrais clients, une fois les comptes de test écartés : AUCUN n'a
   de notification active, AUCUN n'est jamais revenu, AUCUN n'a commandé. Et rien ne
   demande jamais la permission — elle ne part que si l'utilisateur touche un bouton.

   Ce bouton vivait sous la ligne de flottaison : mesuré à y = 850 sur un écran de
   844 px, après les sept tuiles ouvertes ET toute la section « Bientôt disponible ».
   Un client qui ne défile pas ne le voit jamais, n'active rien, et plus rien ne peut
   le rappeler — ce qui explique mécaniquement les douze.

   Il remonte au-dessus du catalogue, à UN seul endroit : affiché deux fois, il se
   lirait comme une insistance, et c'est le genre de bandeau qu'on apprend à ignorer. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
// Les douze métiers réellement ouverts en production, pour mesurer la vraie page.
const REELS = ['autre', 'baby', 'c_peinture', 'c_servicesadmini', 'deck', 'electricite',
  'epilation', 'jardin', 'massage', 'menage', 'piscine', 'plomberie'];

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  const accueil = () => p.evaluate((REELS) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'client'; S.clientNav = 'home'; S.onboarded = true; S.guest = false;
    S.demoMode = false; S.account = { name: 'Nina', email: 'n@e.fr', zone: 'Gustavia' };
    S.mission = null; S.draft = null; S.missions = []; S.availableServices = REELS; S.forceGate = true;
    window.__render();
    const cta = [...document.querySelectorAll('.notifcta')];
    const grille = document.querySelector('.cats');
    return {
      combien: cta.length,
      yBandeau: cta.length ? Math.round(cta[0].getBoundingClientRect().top) : null,
      yCatalogue: grille ? Math.round(grille.getBoundingClientRect().top) : null,
      ecran: window.innerHeight,
      texte: cta.length ? cta[0].innerText.replace(/\s+/g, ' ').slice(0, 60) : '',
    };
  }, REELS);

  console.log('A — il se voit sans défiler, et il passe devant le catalogue');
  const a = await accueil();
  ok(a.combien === 1, 'il n’apparaît qu’UNE fois : deux bandeaux se lisent comme une insistance (' + a.combien + ')');
  ok(a.yBandeau !== null && a.yBandeau < a.ecran,
    'il est au-dessus de la ligne de flottaison (y=' + a.yBandeau + ' pour un écran de ' + a.ecran + ')');
  ok(a.yBandeau < a.yCatalogue,
    'et avant les tuiles, pas après elles (bandeau ' + a.yBandeau + ', catalogue ' + a.yCatalogue + ')');
  ok(/Ne manquez aucune étape/.test(a.texte), 'c’est bien l’invitation du client (« ' + a.texte + ' »)');

  console.log('\nB — et il s’efface dès que la permission est accordée');
  const accorde = await p.evaluate((REELS) => {
    // On remplace la permission par « accordée », comme après un oui.
    try { Object.defineProperty(window.Notification, 'permission', { get: function () { return 'granted'; }, configurable: true }); } catch (e) { return { err: String(e) }; }
    const S = window.__S; S.availableServices = REELS; window.__render();
    return { combien: document.querySelectorAll('.notifcta').length,
      catalogue: !!document.querySelector('.cats') };
  }, REELS);
  ok(accorde.combien === 0, 'une fois accordée, le bandeau disparaît — il ne reste pas en travers du catalogue');
  ok(accorde.catalogue, 'et le catalogue, lui, est toujours là');

  console.log('\nC — ce qu’on n’a PAS fait');
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  /* ON NE DEMANDE RIEN TOUT SEUL. Une permission réclamée à l'arrivée, avant même
     d'avoir montré à quoi elle sert, se refuse — et un refus est DÉFINITIF : le
     navigateur ne repose plus jamais la question, et la carte du Profil ne pourrait
     plus que renvoyer vers les réglages du téléphone. L'invitation se voit, le geste
     reste celui de l'utilisateur. */
  ok(!/Notification\.requestPermission\(\)/.test(html.slice(html.indexOf('function loadUserProfile'), html.indexOf('function loadUserProfile') + 6000)),
    'aucune demande automatique à l’ouverture du compte : un refus est définitif, on ne le provoque pas');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
