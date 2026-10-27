/* L'IMAGE QU'ON ENVOIE NE DOIT PAS CONTREDIRE L'APPLICATION.

   `outils/aide-installation.js` fabrique la fiche qu'on joint à un WhatsApp quand
   quelqu'un signale « je n'arrive pas à installer ». Elle montre les mêmes gestes que
   `showInstallGuide` — et si le guide change sans qu'elle suive, on enverra une aide
   qui désigne un bouton que l'écran ne porte plus. Pire qu'aucune aide.

   ET UN GLYPHE QUI POINTE UN FICHIER NE SE DESSINE PAS HORS DE L'APPLICATION.
   `IG_GLYPH.app` est un `<img src="./zouti-logo.svg">` : dans la page il a une base,
   dans `setContent` il n'en a aucune et sort en CARRÉ VIDE — au milieu de l'étape qui
   compte. Vu sur l'image RENDUE, jamais à la relecture. */
const fs = require('fs'), path = require('path');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const OUTIL = require(path.join(RACINE, 'outils/aide-installation.js'));

console.log('\n── LES GLYPHES VIENNENT DE L\'APPLICATION ───────────────────────────────');
const G = OUTIL.glyphesDeLApp(APP);
ok(G && G.IG_GLYPH && G.IG_LOGO, 'les deux tables se relèvent dans index.html');
const attendus = ['dots', 'share', 'addhome', 'safari', 'app'];
const manque = attendus.filter((k) => !G.IG_GLYPH[k]);
ok(manque.length === 0, 'les glyphes employés par la fiche existent' + (manque.length ? ' — manque ' + manque.join(', ') : ''));
/* ARRIÈRE : une extraction qui ne rendrait plus rien satisferait « aucun ne manque ». */
ok(Object.keys(G.IG_GLYPH).length >= 5 && Object.keys(G.IG_LOGO).length >= 4,
  'arrière : l\'extraction rend bien des tables garnies (' + Object.keys(G.IG_GLYPH).length + ' + ' + Object.keys(G.IG_LOGO).length + ')');

console.log('\n── AUCUN GLYPHE À CHEMIN RELATIF NE SURVIT DANS LA FICHE ───────────────');
const relatif = Object.keys(G.IG_GLYPH).filter((k) => /<img[^>]+src=["']\.?\//i.test(String(G.IG_GLYPH[k])));
ok(relatif.length > 0, 'arrière : l\'application en porte bien au moins un (' + relatif.join(', ') + ')');
const casses = [];
OUTIL.FICHES.forEach((F) => {
  F.sortir.concat(F.installer).forEach((e, i) => {
    if (/<img[^>]+src=["']\.?\//i.test(String(e.g))) casses.push(F.cle + ' étape ' + (i + 1));
  });
});
ok(casses.length === 0, 'la fiche n\'en porte aucun' + (casses.length ? ' — ' + casses.join(', ') : ''));

console.log('\n── ET ELLE DIT CE QUE LE GUIDE DIT ─────────────────────────────────────');
/* Chaque phrase clé de la fiche doit se retrouver dans le guide. On compare le TEXTE
   NU : la fiche met des espaces insécables là où le guide met des espaces, et
   l'inverse — ce qui compte est le geste nommé, pas la typographie. */
const nu = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const guide = nu(APP.slice(APP.indexOf('function showInstallGuide'), APP.indexOf('function showInstallGuide') + 14000));
const phrases = [
  'ouvrir dans le navigateur', 'installer l\'application', 'ouvrir dans safari',
  'sur l\'écran d\'accueil', 'd\'ici, l\'installation est', 'ti-services.fr',
];
const absentes = phrases.filter((p) => guide.indexOf(nu(p)) < 0);
ok(absentes.length === 0, 'les gestes nommés par la fiche sont ceux du guide' + (absentes.length ? ' — introuvables : ' + absentes.join(' · ') : ''));
/* ARRIÈRE : une tranche vide rendrait « tout est introuvable », pas « tout va bien » —
   mais une tranche qui contiendrait TOUT le fichier rendrait l'épreuve sans valeur. */
ok(guide.length > 3000 && guide.length < 20000, 'arrière : la tranche du guide est bien délimitée (' + guide.length + ' caractères)');

console.log('\n── LES DEUX FICHES EXISTENT, ET ELLES SORTENT ──────────────────────────');
ok(OUTIL.FICHES.length === 2 && OUTIL.FICHES.every((F) => F.sortir.length && F.installer.length && F.repli),
  'une fiche par appareil, chacune avec sa sortie, son installation et son repli');
const dir = path.join(RACINE, 'outils/aide');
const rendues = OUTIL.FICHES.filter((F) => fs.existsSync(path.join(dir, 'installer-' + F.cle + '.png')));
ok(rendues.length === OUTIL.FICHES.length, 'les images sont rendues et commitées (' + rendues.length + '/' + OUTIL.FICHES.length + ')');

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
