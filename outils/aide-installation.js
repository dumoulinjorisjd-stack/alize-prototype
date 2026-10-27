#!/usr/bin/env node
/* TI-SERVICES — L'IMAGE QU'ON ENVOIE À QUELQU'UN QUI N'ARRIVE PAS À INSTALLER.

   POURQUOI ELLE EXISTE. `signalerInstallation` nous écrit « Quelqu'un n'arrive pas à
   installer l'application et demande qu'on le rappelle », avec l'appareil. Sur le cas
   relevé le 27/10/2026 il disait « Android · Chrome · navigateur intégré » — et c'est
   LA cause, pas un détail : la personne a ouvert le lien depuis WhatsApp, et dans un
   navigateur intégré l'installation est IMPOSSIBLE, il n'y a aucun menu pour ça. Lui
   expliquer d'installer avant de lui dire de SORTIR, c'est l'envoyer chercher un bouton
   qui n'existe pas sur son écran.

   RIEN N'EST REDESSINÉ. Les teintes, le ⋮, le logo Chrome et Zouti sont EXTRAITS
   d'`index.html` — la discipline des cartes de visite. Une image d'aide qui montrerait
   un autre ⋮ que celui du guide ferait douter de celui qu'on a sous les yeux.

   ET ELLE DIT CE QUE LE GUIDE DIT. Les mots viennent de `showInstallGuide`, branche par
   branche : si le guide change, cette image doit changer avec — une aide qui contredit
   l'application est pire qu'aucune aide. `tests/harn/test-aide-installation.js` le tient.

   Usage :  node outils/aide-installation.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const O = require('./cartes-visite.js');

const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(__dirname, 'aide');

/* LES GLYPHES DE L'APPLICATION, PRIS À LA SOURCE. Deux repères stables ; s'ils bougent,
   on lève plutôt que de dessiner des icônes d'une autre main. */
function glyphesDeLApp(src) {
  const coupe = (debut, fin) => {
    const a = src.indexOf(debut), b = src.indexOf(fin, a);
    if (a < 0 || b < 0) throw new Error('Glyphes introuvables dans index.html — ' + debut);
    return src.slice(a, b);
  };
  const bloc = coupe('  const IG_GLYPH={', '  // Logos des navigateurs')
    + coupe('  const IG_LOGO={', '  const IG_BROWSER_NAME=');
  return new Function(bloc + '\n;return {IG_GLYPH,IG_LOGO};')();
}

const src = O.lireSource();
const C = O.couleurs(src);
const { IG_GLYPH, IG_LOGO } = glyphesDeLApp(src);
const ZOUTI = fs.readFileSync(path.join(RACINE, 'zouti-logo.svg'), 'utf8');

/* UN GLYPHE QUI POINTE UN FICHIER NE SE DESSINE PAS ICI. `IG_GLYPH.app` est un
   `<img src="./zouti-logo.svg">` : dans l'application la page a une base, ici
   `setContent` n'en a aucune — il sortait en CARRÉ VIDE au milieu de l'étape qui
   compte. Vu sur l'image rendue, pas à la relecture. On remplace l'adresse par le
   dessin lui-même ; les autres glyphes, qui sont des SVG en ligne, ne bougent pas. */
function sansLien(g) {
  return /<img[^>]+src=/i.test(String(g)) ? ZOUTI : g;
}

/* LES DEUX FICHES. Chacune dit D'ABORD de sortir du navigateur intégré — c'est le cas
   que l'e-mail signale — puis d'installer. Les mots sont ceux de `showInstallGuide`. */
const FICHES = [
  {
    cle: 'android',
    appareil: 'Android',
    sortir: [
      { g: IG_GLYPH.dots, t: 'Touchez le menu <b>⋮</b> en haut à droite,<br>puis <b>«&nbsp;Ouvrir dans le navigateur&nbsp;»</b> (Chrome) ' + IG_LOGO.chrome },
    ],
    installer: [
      { g: IG_GLYPH.dots, t: 'Dans Chrome, ouvrez le <b>menu ⋮</b> en haut à droite ' + IG_LOGO.chrome },
      { g: sansLien(IG_GLYPH.app), t: 'Touchez <b>«&nbsp;Installer l\'application&nbsp;»</b>, puis <b>Installer</b>' },
    ],
    repli: 'Ouvrez <b>Chrome</b> vous-même et tapez&nbsp;: <b>ti-services.fr</b>',
  },
  {
    cle: 'iphone',
    appareil: 'iPhone',
    sortir: [
      { g: IG_GLYPH.safari, t: 'Touchez <b>Partager</b> (en bas) ou la <b>boussole Safari</b> ' + IG_LOGO.safari + ' (en bas à droite), puis <b>«&nbsp;Ouvrir dans Safari&nbsp;»</b>' },
    ],
    installer: [
      { g: IG_GLYPH.share, t: 'Dans Safari, touchez le bouton <b>Partager</b> ⬆︎<span>s\'il n\'y est pas, touchez <b>•••</b> à droite de l\'adresse, puis «&nbsp;Partager&nbsp;»</span>' },
      { g: IG_GLYPH.addhome, t: 'Touchez <b>«&nbsp;Sur l\'écran d\'accueil&nbsp;»</b>, puis <b>Ajouter</b><span>si vous ne la voyez pas, faites défiler la liste</span>' },
    ],
    repli: 'Ouvrez <b>Safari</b> vous-même et tapez&nbsp;: <b>ti-services.fr</b>',
  },
];

const esc = s => String(s);
/* UNE SEULE SUITE DE NUMÉROS. Deux sections numérotées 1-2 chacune donnaient DEUX
   « 1 » sur la même fiche : on ne sait plus où on en est. Les titres disent le moment,
   les numéros disent le geste, et ils se suivent. */
const etape = (n, e) => `<div class="et"><span class="n">${n}</span><span class="g">${e.g}</span><div class="t">${e.t}</div></div>`;

function page(F) {
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:${C.sand};font:16px/1.45 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased}
  .f{width:1080px;background:${C.sand};padding:58px 54px 48px}
  .tete{display:flex;align-items:center;gap:18px;margin-bottom:10px}
  .tete svg{width:64px;height:64px;flex:none}
  .nom{font-size:40px;font-weight:800;letter-spacing:-.5px}
  .nom i{color:${C.teal};font-style:normal}
  .sous{font-size:21px;color:${C.muted};margin:0 0 34px 82px}
  h2{font-size:27px;font-weight:800;margin:0 0 6px}
  .pourquoi{background:${C['teal-wash']};border-radius:20px;padding:24px 26px;margin-bottom:34px;font-size:22px;line-height:1.5;color:${C['ink-soft']}}
  .pourquoi b{color:${C.ink}}
  .bloc{margin-bottom:34px}
  .bloc .intro{font-size:20px;color:${C.muted};margin:4px 0 16px}
  .et{display:flex;align-items:flex-start;gap:18px;background:${C.card};border:1px solid ${C.hair};border-radius:20px;padding:22px 24px;margin-bottom:12px}
  .n{flex:none;width:40px;height:40px;border-radius:50%;background:${C.teal};color:#fff;font-weight:800;font-size:21px;display:flex;align-items:center;justify-content:center}
  .g{flex:none;width:46px;height:46px;display:flex;align-items:center;justify-content:center}
  .g svg,.g img{width:38px;height:38px}
  .t{flex:1;font-size:22px;line-height:1.45;padding-top:4px}
  .t svg{width:26px;height:26px;vertical-align:-5px}
  .t span{display:block;font-size:18px;color:${C.muted};margin-top:5px}
  .repli{background:${C['sand-2']};border-radius:18px;padding:20px 24px;font-size:21px;color:${C['ink-soft']}}
  .pied{margin-top:38px;padding-top:22px;border-top:1px solid ${C.hair};font-size:19px;color:${C.muted};display:flex;justify-content:space-between;align-items:center}
  .pied b{color:${C.teal};font-size:22px}
  </style><div class="f">
    <div class="tete">${ZOUTI}<div class="nom"><i>Ti</i>-Services</div></div>
    <p class="sous">Installer l'application sur ${F.appareil}</p>

    <div class="pourquoi">Vous avez ouvert le lien <b>à l'intérieur d'une autre app</b> (WhatsApp, Instagram, Messenger…). D'ici, l'installation est <b>impossible</b>&nbsp;: il faut d'abord en sortir.</div>

    <div class="bloc">
      <h2>D'abord&nbsp;: sortir de WhatsApp</h2>
      <p class="intro">Le lien doit s'ouvrir dans un vrai navigateur.</p>
      ${F.sortir.map((e, i) => etape(i + 1, e)).join('')}
    </div>

    <div class="bloc">
      <h2>Ensuite&nbsp;: installer</h2>
      <p class="intro">Une fois dans le navigateur.</p>
      ${F.installer.map((e, i) => etape(F.sortir.length + i + 1, e)).join('')}
    </div>

    <div class="repli">${'Ça ne marche pas&nbsp;? ' + F.repli}</div>

    <div class="pied"><span>Besoin d'aide&nbsp;? On vous rappelle.</span><b>ti-services.fr</b></div>
  </div>`;
}

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const { chromium } = require(path.join(RACINE, 'node_modules', 'playwright-core'));
  const opts = {};
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  const nav = await chromium.launch(opts);
  const p = await nav.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
  for (const F of FICHES) {
    await p.setContent(page(F), { waitUntil: 'load' });
    const cible = p.locator('.f');
    await cible.screenshot({ path: path.join(SORTIE, 'installer-' + F.cle + '.png') });
    await cible.screenshot({ path: path.join(SORTIE, 'installer-' + F.cle + '.jpg'), type: 'jpeg', quality: 92 });
    const b = await cible.boundingBox();
    console.log('  ✓ installer-' + F.cle + '  ' + Math.round(b.width) + '×' + Math.round(b.height));
  }
  await nav.close();
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { glyphesDeLApp, FICHES };
