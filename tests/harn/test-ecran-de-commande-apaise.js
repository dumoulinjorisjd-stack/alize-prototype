/* DEUX RETOUCHES DE L'ÉCRAN DE COMMANDE, RELEVÉES SUR CAPTURE.

   1) « ENLÈVE LES DEUX LIGNES SOUS LE TOTAL, ELLES FONT PEUR. » Sous un total de 84 €,
      l'écran posait un paragraphe de « prix ferme » et un autre annonçant que 42 €
      resteraient dus en cas d'annulation — à quelqu'un qui n'a pas encore trouvé de
      prestataire et n'a rien payé. Deux pavés d'avertissement avant le premier clic.

   MAIS LES CGV ET LA FAQ PROMETTAIENT QUE CES CONDITIONS S'AFFICHENT. Les supprimer
   partout aurait rendu le contrat faux. Elles vivent donc là où l'engagement se prend,
   l'écran de paiement — et là, elles ont cessé de MENTIR : la phrase y était écrite 8 h
   et 50 % EN DUR, alors qu'un métier peut avoir ses propres arrhes (sept jours et 30 %
   sur une sortie en mer). Elle lit maintenant les vraies valeurs, par les mêmes fonctions
   que l'écran de commande employait. Les textes qui promettent « sur l'écran de
   commande » disent désormais « au moment de payer ».

   2) « POUR LE BABY-SITTING, ENLÈVE LA SOUPLESSE JOURNÉE ET SEMAINE. » Ce ne sont pas des
      souplesses parmi d'autres : elles laissent le prestataire choisir son heure, ce qui
      a un sens pour un ménage. Garder des enfants suppose un parent qui part à une heure
      PRÉCISE. Une liste nommée par son critère, pas un `if` dans chacun des deux écrans. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const cgv = fs.readFileSync(path.join(RACINE, 'legal/cgv.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg);

  const ouvrir = (svc) => p.evaluate((svc) => {
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'home'; S.jalons = {}; S._cfgVu = null;
    S.account = { name: 'Camille', email: 'c@e.fr', zone: 'Gustavia' };
    S.mission = null; S.payStep = false;
    S.draft = window.__newMission(window.__svc.trouve(svc));
    window.__cfg.render();
    const vue = document.getElementById('view') || document.body;
    return {
      texte: vue.textContent || '',
      souplesses: Array.from(document.querySelectorAll('[data-slotflex]')).map((x) => x.textContent.trim()),
    };
  }, svc);

  console.log('\nA — sous le total, plus rien qui fasse peur');
  const menage = await ouvrir('menage');
  ok(menage.texte.indexOf('Total') >= 0, 'l’écran de commande affiche bien son total');
  ok(menage.texte.indexOf('Prix ferme') < 0,
    'le pavé « Prix ferme » a quitté l’écran de commande');
  ok(menage.texte.indexOf('restent dus au prestataire') < 0,
    'et l’avertissement d’annulation aussi : on n’a encore ni prestataire ni paiement');

  console.log('B — mais la promesse du contrat tient, au moment de payer');
  ok(/function clientPay\(\)/.test(src) && /arrhesDuSvc\(m&&m\.svc\)/.test(src.slice(src.indexOf('function clientPay()'), src.indexOf('function clientPay()') + 2600)),
    'l’écran de paiement lit les VRAIES conditions du métier');
  ok(!/Annulation gratuite jusqu'à 8&nbsp;h avant\. Ensuite, 50&nbsp;% dus/.test(src),
    'il ne les écrit plus 8 h et 50 % en dur : une sortie en mer n’a ni ce délai ni cette part');
  ok(cgv.indexOf('au moment de payer, avant tout débit') >= 0
    && cgv.indexOf("affichés sur l'écran de commande") < 0,
    'et les CGV promettent ce qui se passe vraiment (pages légales régénérées)');
  ok(src.indexOf('le montant exact est écrit au moment de payer.') >= 0,
    'la FAQ dit la même chose, au même endroit du parcours');

  console.log('C — baby-sitting : une garde a une heure, pas une semaine');
  const baby = await ouvrir('baby');
  ok(baby.souplesses.length > 0, 'l’écran du baby-sitting offre bien des souplesses (' + baby.souplesses.join(', ') + ')');
  ok(baby.souplesses.indexOf('Journée') < 0 && baby.souplesses.indexOf('Semaine') < 0,
    'mais ni « Journée » ni « Semaine » : un parent part à une heure précise');
  ok(baby.souplesses.indexOf('Précise') >= 0 && baby.souplesses.indexOf('± 1 h') >= 0,
    'les souplesses courtes restent, elles gardent leur sens');

  console.log('D — et les autres métiers n’ont rien perdu');
  ok(menage.souplesses.indexOf('Journée') >= 0 && menage.souplesses.indexOf('Semaine') >= 0,
    'le ménage garde « Journée » et « Semaine » : la maison est là toute la journée');

  console.log('E — un choix devenu impossible ne survit pas dans un brouillon repris');
  const repris = await p.evaluate(() => {
    const S = window.__S;
    S.draft = window.__newMission(window.__svc.trouve('baby'));
    S.draft.slotFlex = 'week';          // comme s'il venait d'un brouillon enregistré
    S._cfgVu = null; S.jalons = {};
    window.__cfg.render();
    return { flex: S.draft.slotFlex, prepare: !!S.jalons.prepare };
  });
  ok(repris.flex !== 'week', 'le recalage ramène le créneau à « Précise » (' + repris.flex + ')');
  ok(!repris.prepare,
    'et ce recalage automatique ne compte PAS comme une saisie du client');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
