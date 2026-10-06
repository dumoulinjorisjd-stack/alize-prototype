/* « ILS ONT TOUS CONFIGURÉ SANS ALLER JUSQU'AU PAIEMENT, UNE RÉALITÉ OU UN MANQUE DE
   PRÉCISION ? »

   Un manque de précision, et il était total. Cinq fiches de production portaient la même
   phrase, mot pour mot. La cause tient en une instruction : `jalonClient('config')` était
   posé DANS LA MÊME LIGNE que `jalonClient('catalogue')`, au moment où l'on touche la
   tuile d'un métier. À cet instant `newMission()` vient de fabriquer un brouillon VIDE et
   `renderConfig()` vient d'afficher l'écran : personne n'a rien configuré. Le jalon
   n'apportait donc RIEN de plus que `catalogue`, le mur « a regardé, n'a rien configuré »
   était inatteignable, et tout le monde atterrissait au suivant.

   `prepare` dit ce qu'on cherchait. ON NE L'ÉNUMÈRE PAS champ par champ — date, heure,
   durée, lieu, options, personnes, photos, et ceux qu'on écrira demain : une liste
   vieillirait mal et le champ oublié serait invisible. On COMPARE le brouillon à
   lui-même, et la photo de référence se prend à la FIN du premier rendu, donc après les
   recalages automatiques.

   LE PARCOURS TIENT EN UNE SEULE PASSE SYNCHRONE. Un premier jet le découpait en cinq
   allers-retours avec le navigateur, et rougissait une fois sur trois : entre deux
   appels, les rendus différés de l'application rattrapent la page et brouillent la
   mesure. Les gestes d'un client, eux, s'enchaînent dans un même fil — on les joue comme
   tels. Le mécanisme avait été vérifié stable sur six pages neuves AVANT d'en arriver
   là : une épreuve intermittente ne mesure rien, et accuser le code à sa place aurait
   fait corriger ce qui marchait. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__setFB && window.__cfg);

  const R = await p.evaluate(() => {
    const S = window.__S;
    // Un compte connecté pour de faux : `jalonClient` écrit dans `S.jalons` et pousse la
    // fiche. On retient les écritures au lieu de les envoyer.
    const ecrits = [];
    window.__setFB({
      auth: { currentUser: { uid: 'u-test' } },
      db: {}, f: { doc: () => ({}), setDoc: (r, d) => { ecrits.push(d); return Promise.resolve(); } },
    });
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'home'; S.jalons = {}; S._cfgVu = null;
    S.account = { name: 'Camille', email: 'c@e.fr', zone: 'Gustavia' };
    S.mission = null; S.draft = null; S.catView = 'maison';
    window.__render();

    const out = {};
    // A — la porte réelle de l'application : le gestionnaire de `data-svc`.
    const tuile = document.querySelector('[data-svc]');
    if (!tuile) return { erreur: 'aucune tuile de métier' };
    tuile.click();
    out.svc = (S.draft || {}).svc || null;
    out.ouverture = Object.assign({}, S.jalons);

    // B — trois rendus de l'écran de configuration, sans y toucher. Les recalages
    // automatiques (créneau, date du jour, mode) ont lieu ici : s'ils comptaient comme
    // une saisie, tout le monde serait marqué.
    window.__cfg.render(); window.__cfg.render(); window.__cfg.render();
    out.immobile = Object.assign({}, S.jalons);

    // C — une vraie modification.
    S.draft.notes = 'Le portail est à gauche';
    window.__cfg.render();
    out.touche = Object.assign({}, S.jalons);
    out.ecritsApresC = ecrits.length;

    // D — deux de plus : un jalon ne s'écrit qu'une fois.
    S.draft.notes = 'Un autre mot'; window.__cfg.render();
    S.draft.notes = 'Encore un'; window.__cfg.render();
    out.ecritsApresD = ecrits.length;

    // E — une photo : son CONTENU ne pèse pas dans la signature, mais en ajouter une
    // reste une saisie.
    S.jalons = {}; S._cfgVu = null; S.draft.photos = [];
    window.__cfg.render();
    out.poids = (window.__cfg.vu() || '').length;
    S.draft.photos = ['data:image/jpeg;base64,' + 'A'.repeat(4000)];
    window.__cfg.render();
    out.photo = Object.assign({}, S.jalons);
    return out;
  });

  console.log('\nA — toucher la tuile d’un métier n’est PAS configurer');
  ok(!R.erreur, R.erreur || 'une tuile de métier s’ouvre');
  ok(!!R.svc, 'un brouillon est créé pour ce métier (' + R.svc + ')');
  ok(R.ouverture.catalogue && R.ouverture.config,
    'les deux jalons d’OUVERTURE sont posés, comme avant');
  ok(!R.ouverture.prepare,
    'mais PAS « a rempli la configuration » : c’est le défaut mesuré, cinq fiches identiques');

  console.log('B — réafficher l’écran sans y toucher ne pose toujours rien');
  ok(!R.immobile.prepare,
    'trois rendus de suite, rien n’est posé : les recalages automatiques ne sont pas une saisie');

  console.log('C — toucher à la configuration le pose');
  ok(!!R.touche.prepare, 'une modification du brouillon pose « a rempli la configuration »');
  ok(R.ecritsApresC > 0, 'et la fiche du client est écrite : le jalon vit en ligne, pas seulement à l’écran');

  console.log('D — un jalon ne s’écrit qu’UNE fois');
  ok(R.ecritsApresD === R.ecritsApresC,
    'deux modifications de plus n’écrivent rien : sans cela chaque frappe réécrirait la fiche');

  console.log('E — une photo compte, son contenu ne pèse pas');
  ok(!!R.photo.prepare, 'ajouter une photo compte comme une saisie');
  ok(R.poids < 4000, 'et la signature ne porte pas le contenu des images (' + R.poids + ' caractères)');

  console.log('F — la porte est l’enveloppe, pas une liste de champs');
  ok(/function renderConfig\(\)\{_renderConfigCorps\(\);_cfgSuivre\(\);\}/.test(src),
    'renderConfig enveloppe son corps : les trois branches (colis, forfait, générique) passent par là');
  ok(!/jalonClient\('prepare'\)/.test(src.replace(/function _cfgSuivre\(\)\{[\s\S]*?\n  \}/, '')),
    'et « prepare » n’est posé QUE dans cette porte, nulle part à la main');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
