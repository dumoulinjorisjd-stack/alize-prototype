#!/usr/bin/env node
/* CARTES DE VISITE TI-SERVICES — carré, recto présentation, verso QR-code.

   RIEN N'EST RECOPIÉ DE L'APPLICATION. Les couleurs, le dessin de Zouti et l'encodeur
   de QR-code sont LUS dans `index.html` et `zouti-logo.svg` au moment de la génération :
   une teinte de marque changée dans l'application se retrouve sur la prochaine carte
   imprimée, et le QR-code est fabriqué par le MÊME code que celui qui le dessine à
   l'écran — pas par une bibliothèque tierce dont le tracé pourrait différer.

   POURQUOI ON FABRIQUE LE QR PLUTÔT QUE DE REPRENDRE LE TRACÉ STATIQUE : `index.html`
   porte deux tracés pré-calculés, mais rien dans le fichier ne dit avec certitude quelle
   adresse ils encodent — et une carte de visite ne se corrige pas après tirage. On
   encode donc l'adresse ICI, et `outils/cartes-visite.js --verifier` la relit sur le PNG
   rendu avec un décodeur indépendant (zbarimg).

   LA POLICE EST EMBARQUÉE. L'application s'affiche en SF Pro sur un Mac ; un conteneur
   Linux n'a pas cette police et retomberait sur DejaVu, qui ne ressemble à rien de ce
   que l'éditeur voit. Inter (SIL OFL, dans outils/cartes/) est l'équivalent libre le
   plus proche, encodée en base64 dans chaque fichier : le PDF part complet chez
   l'imprimeur, sans dépendance réseau.

   Usage :  node outils/cartes-visite.js            (écrit HTML, PDF et PNG)
            node outils/cartes-visite.js --verifier (relit les QR des PNG produits)
*/
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'outils', 'cartes');

/* ---------- Format ----------
   65 × 65 mm est le carré des imprimeurs en ligne français (MOO, Vistaprint). Le fond
   perdu de 3 mm par côté est ce qu'ils demandent tous : le fond doit déborder du trait
   de coupe, sinon un liseré blanc apparaît au massicot. La marge de sécurité tient le
   texte à distance de ce même trait — une coupe se déplace toujours d'un demi-millimètre.

   ELLE EST PASSÉE DE 5 À 4 mm, et c'est ce qui a payé l'agrandissement du texte : la
   carte était pleine au millimètre, le dessin ne devait pas rétrécir, il fallait donc
   prendre les quatre millimètres quelque part. Quatre reste au-dessus du minimum que
   demandent les imprimeurs en ligne (trois), et c'est le seul endroit où l'on pouvait
   gagner sans rien retirer. En dessous de trois, on ne le ferait pas. */
const MM = { carte: 65, fond: 3, securite: 4 };
MM.page = MM.carte + 2 * MM.fond;     // 71 mm
MM.marge = MM.fond + MM.securite;     // 8 mm depuis le bord de la planche

/* ---------- Ce qu'on lit dans l'application ---------- */
function lireSource() {
  return fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
}

// Les teintes de marque : on les prend dans `:root`, pas dans une copie.
function couleurs(src) {
  const bloc = src.slice(src.indexOf(':root{'), src.indexOf('@media (prefers-color-scheme:dark)'));
  const c = {};
  bloc.replace(/--([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})/g, (m, k, v) => { c[k] = v; return m; });
  const exige = ['sand', 'sand-2', 'card', 'ink', 'ink-soft', 'muted', 'hair', 'teal', 'teal-deep', 'coral', 'coral-deep'];
  const manque = exige.filter(k => !c[k]);
  if (manque.length) throw new Error('Teintes introuvables dans :root — ' + manque.join(', '));
  return c;
}

/* MÉLANGER DEUX TEINTES DE MARQUE. On ne choisit pas une couleur « à la main » : on
   déclare une PROPORTION entre deux jetons du `:root`, et le fichier porte l'hexadécimal
   calculé — lisible par qui ouvre le PDF, et refait tout seul si la marque change. */
function melange(a, b, part) {
  const lire = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = lire(a), [r2, g2, b2] = lire(b);
  const m = (x, y) => Math.round(x * (1 - part) + y * part).toString(16).padStart(2, '0');
  return '#' + m(r1, r2) + m(g1, g2) + m(b1, b2);
}

// L'encodeur de QR-code de l'application, exécuté tel quel. On le délimite par deux
// repères stables ; s'ils bougent, on lève plutôt que de produire un QR d'une autre source.
function qrDeLApp(src) {
  const a = src.indexOf('  const QRC_DATA =');
  const b = src.indexOf('  function qrSvg(px,kind){');
  if (a < 0 || b < 0 || b < a) throw new Error('Encodeur QR introuvable dans index.html');
  const bloc = src.slice(a, b);
  const f = new Function(bloc + '\n;return {qrEncode,qrSvgFrom};');
  return f();
}

/* LES MÉTIERS VIENNENT DU CATALOGUE, COMME SUR LA VITRINE. Trois déclarations
   d'`index.html` — la table des icônes, la liste des services, les teintes — sont
   découpées et exécutées telles quelles : un métier renommé ou une icône redessinée
   arrive sur la prochaine carte, et le dessin est EXACTEMENT celui que le client
   retrouvera dans l'application. On lit la déclaration en comptant les accolades
   (les tracés SVG sont dans des chaînes, on les saute) plutôt qu'en devinant sa fin. */
function declaration(src, debut, ouvre, ferme) {
  const i = src.indexOf(debut);
  if (i < 0) throw new Error('Déclaration introuvable dans index.html : ' + debut);
  let j = src.indexOf(ouvre, i), p2 = 0, q = null;
  for (let k = j; k < src.length; k++) {
    const ch = src[k];
    if (q) { if (ch === '\\') k++; else if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === ouvre) p2++;
    else if (ch === ferme) { p2--; if (!p2) return src.slice(j, k + 1); }
  }
  throw new Error('Déclaration non refermée : ' + debut);
}
/* UN NOM DE CATALOGUE QUI NE RENTRE PAS. « Colis & courrier » demande 20,9 mm dans une
   colonne qui en offre 18,3 — mesuré. Trois sorties possibles : rapetisser le texte que
   l'éditeur vient de faire grossir, laisser le nom passer à deux lignes (la rangée grandit,
   la carte déborde), ou le raccourcir ICI. On le raccourcit, en le disant : la carte n'est
   pas l'application, elle annonce un métier, et « … et plein d'autres » dit déjà que la
   liste continue. Tout autre nom garde celui du catalogue, et le script REFUSE d'écrire un
   PDF où un nom déborde de sa colonne — on ne peut donc pas en ajouter un sans le voir. */
const LIBELLES_COURTS = { colis: 'Colis' };
// Rempli par la mesure, au lancement — jamais écrit à la main.
let CADRES = {};

/* CHAQUE ICÔNE EST CENTRÉE SUR SON DESSIN, PAS SUR SA BOÎTE. Les icônes partagent une
   boîte de 24 × 24, mais leur tracé n'y occupe pas la même place : le lotus du massage
   descend bas, la silhouette du baby-sitting est haute, la bouteille du ménage penche à
   gauche. Alignées par leur boîte — ce que fait n'importe quelle mise en page — elles
   paraissent donc décalées les unes des autres et par rapport à leur nom. On MESURE le
   rectangle réellement dessiné (getBBox, dans le navigateur, sur le tracé lui-même) et on
   déplace la fenêtre de la boîte pour que ce rectangle tombe au centre. Rien n'est
   redessiné, aucune valeur n'est écrite à la main, et une icône redessinée dans
   l'application est remesurée à la génération suivante. */
async function centrerIcones(nav, metier, ids) {
  const ctx = await nav.newContext();
  const p = await ctx.newPage();
  await p.setContent('<body style="margin:0">' +
    ids.map(id => '<span data-id="' + id + '">' + metier(id).ico + '</span>').join('') + '</body>');
  const cadres = await p.evaluate(() => {
    const o = {};
    document.querySelectorAll('[data-id]').forEach(sp => {
      const svg = sp.querySelector('svg');
      // getBBox ignore l'épaisseur du trait : on l'ajoute, sinon un tracé épais déborde du
      // rectangle mesuré et le centrage penche du côté du trait le plus long.
      const e = parseFloat(svg.getAttribute('stroke-width') || 0) || 0;
      const b = svg.getBBox();
      o[sp.dataset.id] = { x: b.x - e / 2, y: b.y - e / 2, w: b.width + e, h: b.height + e };
    });
    return o;
  });
  await ctx.close();
  return cadres;
}
// La fenêtre de 24 × 24 se déplace pour que le centre du dessin tombe au centre de la boîte.
function icoCentree(svg, cadre) {
  if (!cadre) return svg;
  const dx = +(cadre.x + cadre.w / 2 - 12).toFixed(3), dy = +(cadre.y + cadre.h / 2 - 12).toFixed(3);
  const nu = svg.replace('viewBox="0 0 24 24"', 'viewBox="' + dx + ' ' + dy + ' 24 24"');
  if (nu === svg) throw new Error('viewBox 24×24 introuvable — une icône a changé de gabarit');
  return nu;
}

function metiersDeLApp(src) {
  const I = declaration(src, '  const I = {', '{', '}');
  const SERVICES = declaration(src, '  const SERVICES=[', '[', ']');
  const COULEURS = declaration(src, '  const SVC_COLORS={', '{', '}');
  const f = new Function('return {I:' + I + ',SERVICES:' + SERVICES + ',COULEURS:' + COULEURS + '};');
  const o = f();
  return function (id) {
    const s2 = o.SERVICES.find(x => x.id === id);
    if (!s2) throw new Error('Métier absent du catalogue : ' + id);
    if (!o.I[id]) throw new Error('Icône absente pour : ' + id);
    return { nm: LIBELLES_COURTS[id] || s2.nm, ico: o.I[id], col: o.COULEURS[id] || '#CE301C' };
  };
}

// Zouti : le fichier statique, pas la version animée — une carte ne bouge pas.
function zouti() {
  const svg = fs.readFileSync(path.join(RACINE, 'zouti-logo.svg'), 'utf8').trim();
  // On retire les dimensions fixes : la carte décide de la taille.
  return svg.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', '<svg class="zouti"');
}

/* TROIS GRAISSES FIXES, PAS UNE POLICE VARIABLE. Le premier jet embarquait Inter en
   variable : Chromium ne sait pas en découper une instance pour un PDF et retombe sur des
   glyphes de TYPE 3 — mesuré, `pdffonts` le disait. Un Type 3 n'est ni cherchable ni
   sélectionnable, et plusieurs RIP d'imprimerie le rendent mal ou le refusent. Les trois
   instances fixes (500, 700, 800) sont tirées de la variable par `fontTools` et
   s'embarquent en TrueType découpé. C'est pour cela que les graisses du gabarit sont
   exactement 500, 700 et 800 : une valeur intermédiaire ferait synthétiser un gras à
   l'imprimeur, et deux tirages ne se ressembleraient plus. */
const GRAISSES = [500, 700, 800];
function police() {
  return GRAISSES.map(g => {
    const f = path.join(SORTIE, 'Inter-' + g + '.ttf');
    if (!fs.existsSync(f)) throw new Error('Police absente : ' + f);
    return { g, b64: fs.readFileSync(f).toString('base64') };
  });
}

/* ---------- Les deux cartes ----------
   Le recto PRÉSENTE, le verso DONNE L'ADRESSE. Les phrases ne sont pas inventées ici :
   ce sont celles de la vitrine, dont la formulation a déjà été arbitrée. */
const CARTES = [
  {
    cle: 'client',
    url: 'https://ti-services.fr/?client',
    punch: 'Un pro de confiance,<br>chez vous en quelques minutes.',
    // SIX MÉTIERS DESSINÉS, EN LIGNE. C'est ce qui fait comprendre en une seconde de quoi
    // il s'agit — et six, pas vingt et un : sur 49 mm de large, la liste complète donnerait
    // des noms de deux millimètres que personne ne lit. Ils couvrent six familles (maison,
    // extérieur, piscine, enfants, beauté, dépannage) et portent des noms assez courts
    // pour tenir à côté de leur icône.
    // ILS ÉTAIENT HUIT, EMPILÉS — nom sous l'icône, quatre colonnes. C'est la disposition
    // qui coûtait cher : 5,9 mm par rangée contre 3,4 côte à côte. Rendre ces cinq
    // millimètres est ce qui a permis au dessin de grandir et au reste de respirer.
    metiers: ['menage', 'jardin', 'colis', 'baby', 'coiffure', 'massage'],
    // SIX MÉTIERS NE SONT PAS LE CATALOGUE, et une carte qui n'en montre que six laisse
    // croire qu'il n'y a que ça. La suite se dit en trois mots plutôt que de s'entasser.
    metiersSuite: '… et plein d’autres',
    versoTitre: 'Réservez en deux gestes',
    versoPied: 'Gratuit · sans abonnement'
  },
  {
    cle: 'pro',
    url: 'https://ti-services.fr/?pro',
    punch: 'Des clients,<br>sans prospecter.',
    services: 'Facture et paiement automatique',
    metiers: null,
    versoTitre: 'Inscrivez-vous',
    versoPied: 'Zéro abonnement · paiement garanti'
  }
];

/* LE QR À MÊME LE CORAIL. `qrSvgFrom` pose un rectangle blanc sous le code : c'est la
   zone de silence, obligatoire, mais elle n'a pas à être BLANCHE — elle doit seulement
   être claire et unie autour des modules. On la retire, le corail la remplace, et le
   contraste reste de 6,6 contre 1 entre l'encre et le fond. On ne le suppose pas : le
   décodeur indépendant relit chaque code, sur le PNG ET sur le JPEG compressé, à chaque
   génération — la marge des modules du code est exactement là où la compression loge ses
   artefacts. */
function qrNu(svg) {
  const nu = svg.replace(/<rect [^>]*fill="#fff"\/>/, '');
  if (nu === svg) throw new Error('Fond du QR introuvable — `qrSvgFrom` a changé');
  return nu;
}

/* LA CARTE UNIQUE — une seule carte pour les deux publics. Le recto est celui du client,
   le verso celui du prestataire, et sur ce verso le QR-code prend la place de Zouti : on
   ne met pas deux fois la mascotte sur la même carte, et le geste attendu d'un
   prestataire est de scanner. Son QR mène à `?pro`, l'inscription prestataire. Cette face
   garde le CORAIL des versos : c'est à la couleur qu'on voit, carte retournée, qu'on a
   changé d'interlocuteur.
   RÉSERVE À DIRE : cette carte ne porte alors AUCUN QR pour le client — il lui reste
   l'adresse, qui n'est nulle part sur le recto non plus. Les deux cartes séparées, elles,
   gardent chacune leur QR. */
const DUO = { cle: 'duo', clientUrl: CARTES[0].url, url: CARTES[1].url };

/* ---------- Le gabarit ---------- */
function feuille(c, polices) {
  return `
  ${polices.map(p => `@font-face{font-family:'Inter';font-style:normal;font-weight:${p.g};
    font-display:block;src:url(data:font/ttf;base64,${p.b64}) format('truetype')}`).join('\n  ')}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${MM.page}mm;height:${MM.page}mm}
  body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;
    text-rendering:geometricPrecision;font-feature-settings:"kern" 1}
  .carte{position:relative;width:${MM.page}mm;height:${MM.page}mm;overflow:hidden;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:${MM.marge}mm;text-align:center}
  /* AUCUN BLOC NE SE LAISSE ÉCRASER. Dans une colonne souple, un contenu un peu trop haut
     rétrécit ce qui peut l'être — et c'est le dessin qui cède le premier : Zouti est sorti
     à 7 mm au lieu de 21. On fixe donc chaque bloc, et c'est la composition qui doit tenir
     dans la hauteur, pas le logo qui doit rapetisser pour elle. */
  .carte>*{flex:none}
  /* LE RECTO RETROUVE SON DÉGRADÉ « LAGON », celui de l'application : un voile de corail
     en haut à gauche, un d'or à droite, un de turquoise en bas. Ils sont légers — 13 %, 8 %
     et 10 % d'opacité — et c'est ce qui les rend justes sur un papier : un aplat très clair
     ne se voit pas, un dégradé se voit parce que l'œil compare deux endroits de la même
     carte. Il avait été remplacé par un blanc franc puis par un corail plat ; ni l'un ni
     l'autre ne tenait. */
  .recto{background:
      radial-gradient(70% 55% at 14% -6%, ${c['teal']}22, transparent 62%),
      radial-gradient(64% 52% at 106% 6%, #A26A0C14, transparent 58%),
      radial-gradient(76% 60% at 60% 112%, #5EC9C11A, transparent 60%),
      ${c['sand']}}
  /* LE DÉGRADÉ NE DESCEND PLUS JUSQU'AU CORAIL PROFOND. Il allait de #FF6A5B à #CE301C :
     à l'impression, ce bas de dégradé vire au rouge sombre — une encre saturée perd
     toujours de la clarté en passant en CMJN, et c'est le point le plus foncé qui donne
     son poids à toute la face. On garde le corail de marque en HAUT, là où se lit le nom
     (rien ne change donc pour le contraste du texte blanc, déjà le plus faible à cet
     endroit), et on remonte seulement le BAS : trois dixièmes de corail profond au lieu
     de la teinte pure. La face s'éclaircit sans quitter la marque. */
  .verso{background:linear-gradient(155deg, ${melange(c['teal'], '#ffffff', .16)} 0%, ${melange(c['teal'], c['teal-deep'], .18)} 100%);color:#fff}

  /* LES TAILLES DU RECTO SONT CELLES QUI TIENNENT DANS LA MARGE DE SÉCURITÉ, mesurées
     après coup : la grille des métiers a coûté une dizaine de millimètres de hauteur, et
     tout le bloc du haut les a rendus. Toucher l'une de ces valeurs demande de relancer —
     le script refuse d'écrire un PDF dont le contenu déborde. */
  /* ZOUTI EST CE QUI ATTIRE L'ŒIL : c'est lui qu'on agrandit, et les millimètres qu'il
     prend viennent des espacements — jamais de la marge de sécurité, que le script
     vérifie. */
  .zouti{width:18.5mm;height:auto;display:block}
  .mot{font-weight:800;font-size:5.9mm;letter-spacing:-.02em;line-height:1;margin-top:1.5mm}
  .mot b{color:${c['teal-deep']};font-weight:800}
  .mot span{color:${c['ink']}}
  .lieu{display:flex;align-items:center;justify-content:center;gap:.9mm;margin-top:1.1mm;
    font-size:2.35mm;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${c['teal-deep']}}
  .lieu svg{width:2.5mm;height:2.5mm}
  /* LE FILET EST PARTI. Un trait de huit millimètres séparait deux blocs que rien ne
     confondait, et ses marges coûtaient 3,2 mm de hauteur — sur une carte pleine, c'est
     ce qu'il faut pour que le dessin grandisse et que le reste respire. */
  .punch{margin-top:2.8mm;font-size:3.15mm;font-weight:800;line-height:1.28;letter-spacing:-.015em;
    color:${c['ink']};text-wrap:balance}
  .services{margin-top:3.4mm;font-size:2.3mm;line-height:1.55;font-weight:500;color:${c['muted']};
    max-width:45mm;text-wrap:balance}
  /* LA GRILLE DES MÉTIERS. Quatre colonnes, deux rangées : l'icône dit le métier avant
     qu'on ait lu son nom, et c'est ce qui fait comprendre « service à domicile » d'un
     regard. Les colonnes sont égales et le nom tient sur UNE ligne — un nom qui passerait
     à deux décalerait sa rangée. */
  .metiers{margin-top:2.3mm;display:grid;grid-template-columns:repeat(3,1fr);gap:1.4mm 1mm;width:100%}
  /* CHAQUE ICÔNE SUR L'AXE DE SA COLONNE. Centré dans sa cellule, un couple icône + nom se
     déplace avec la longueur du nom : « Piscine » commençait deux millimètres à droite de
     « Plomberie », juste au-dessus. C'est la colonne d'icônes que l'œil suit. */
  .metier{display:flex;align-items:center;justify-content:start;gap:.9mm;min-width:0}
  .metier svg{width:3.5mm;height:3.5mm;display:block;stroke-width:1.9;flex:none}
  .metier span{font-size:2.2mm;font-weight:600;line-height:1;color:${c['ink-soft']};
    white-space:nowrap}
  .suite{margin-top:1.6mm;font-size:2mm;font-weight:600;line-height:1.15;color:${c['muted']}}

  .v-mot{font-weight:800;font-size:4.8mm;letter-spacing:-.02em;line-height:1}
  .v-mot b{color:${c['teal-deep']};font-weight:800} .v-mot span{color:${c['ink']}}
  .v-titre{margin-top:.8mm;font-size:2.5mm;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
    color:#fff;opacity:.86}
  /* Plus de carré blanc : le code est posé à même le corail. Le bloc ne garde que sa
     place et son espacement. */
  .tuile{margin:3mm 0 2.6mm;line-height:0}
  .tuile svg{display:block;width:27mm;height:27mm}
  /* LE QR PREND LA PLACE DU DESSIN : même bloc de tête, même axe, même largeur à peu de
     chose près (22 mm de code contre 18,5 de mascotte). */
  .tuile.tete{margin:0 0 1mm}
  .tuile.tete svg{width:22mm;height:22mm}
  /* LE NOM GARDE SES DEUX TEINTES SUR LE CORAIL, comme au recto : c'est la signature de
     la marque, elle ne doit pas changer d'une face à l'autre. */
  .verso .punch{color:#fff}
  .verso .lieu{color:#fff;opacity:.88}
  .verso .services,.verso .suite{color:#fff;opacity:.9}
  .v-url{font-size:3.9mm;font-weight:800;letter-spacing:-.01em;color:#fff}
  /* LE PIED RESTE DANS LE FLUX. Posé en absolu au bas de la carte, il venait se coucher
     sur la ligne du dessus dès que celle-ci prenait trois lignes — et rien ne le disait
     avant le rendu. Une carte n'a pas de place à gaspiller : ce qui tient dans la colonne
     est ce qui rentre. */
  .v-pied{margin-top:2.4mm;font-size:2.25mm;font-weight:700;letter-spacing:.06em;
    text-transform:uppercase;color:#fff;opacity:.78;max-width:56mm;text-wrap:balance}

  @page{size:${MM.page}mm ${MM.page}mm;margin:0}
  @media print{html,body{margin:0}}`;
}

const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>`;

function pageHtml(titre, style, corps) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${titre}</title><style>${style}</style></head><body>${corps}</body></html>`;
}

/* LA TÊTE DE LA FACE EST UN ARGUMENT. Une face claire porte, en haut, soit le dessin soit
   le QR-code : c'est la seule différence entre le recto d'une carte à deux faces et le
   verso de la carte unique, où le QR prend la place de Zouti. Le reste — nom, lieu,
   punchline, métiers — est le même bloc, écrit une fois. */
function recto(c, carte, tete, style, metier, titre, classe) {
  const bas = carte.metiers
    ? `<div class="metiers">${carte.metiers.map(id => { const m = metier(id);
        return `<div class="metier"><span style="color:${m.col};line-height:0">${m.ico}</span><span>${m.nm}</span></div>`;
      }).join('')}</div>${carte.metiersSuite ? `<div class="suite">${carte.metiersSuite}</div>` : ''}`
    : `<div class="services">${carte.services}</div>`;
  return pageHtml(titre || `Ti-Services — carte ${carte.cle}, recto`, style, `<div class="carte ${classe || 'recto'}">
  ${tete}
  <div class="mot"><b>Ti</b><span>-Services</span></div>
  <div class="lieu">${PIN}Saint-Barthélemy</div>
  <div class="punch">${carte.punch}</div>
  ${bas}
</div>`);
}

function verso(carte, qrSvg, style) {
  return pageHtml(`Ti-Services — carte ${carte.cle}, verso`, style, `<div class="carte verso">
  <div class="v-mot"><b>Ti</b><span>-Services</span></div>
  <div class="v-titre">${carte.versoTitre}</div>
  <div class="tuile">${qrSvg}</div>
  <div class="v-url">ti-services.fr</div>
  <div class="v-pied">${carte.versoPied}</div>
</div>`);
}

/* ---------- Aperçu : les quatre faces côte à côte, à l'échelle ---------- */
function apercu(faces, c) {
  const vign = faces.map(f => `<figure>
    <div class="cadre"><iframe src="${f.fichier}" scrolling="no" title="${f.titre}"></iframe>
      <span class="coupe" aria-hidden="true"></span></div>
    <figcaption>${f.titre}</figcaption></figure>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartes de visite Ti-Services</title><style>
  :root{color-scheme:light}
  body{margin:0;padding:34px 24px 46px;background:${c['sand-2']};
    font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:${c['ink']}}
  h1{margin:0 auto 6px;max-width:980px;font-size:24px;letter-spacing:-.02em}
  .sous{margin:0 auto 26px;max-width:980px;color:${c['muted']}}
  /* DEUX COLONNES, PAS « autant qu'il rentre » : on regarde un recto ET son verso, pas
     quatre faces à la file — à trois par rangée, le verso d'une carte se retrouvait à
     côté du recto de l'autre. */
  .grille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 30px;
    max-width:720px;margin:0 auto}
  @media (max-width:620px){.grille{grid-template-columns:1fr}}
  figure{margin:0}
  .cadre{position:relative;width:100%;aspect-ratio:1;background:#fff;border-radius:14px;
    box-shadow:0 10px 30px -14px rgba(60,30,20,.45);overflow:hidden}
  iframe{position:absolute;inset:0;width:${MM.page}mm;height:${MM.page}mm;border:0;
    transform-origin:0 0}
  /* Le trait de coupe : ce qui sera VRAIMENT sur la carte est à l'intérieur. */
  .coupe{position:absolute;inset:${(MM.fond / MM.page * 100).toFixed(3)}%;
    border:1px dashed rgba(206,48,28,.5);border-radius:2px;pointer-events:none}
  figcaption{margin-top:10px;font-size:13px;font-weight:650;color:${c['ink-soft']}}
  .note{max-width:980px;margin:30px auto 0;font-size:13px;line-height:1.7;color:${c['ink-soft']}}
  .note b{color:${c['ink']}}
</style></head><body>
<h1>Cartes de visite Ti-Services</h1>
<p class="sous">Carré ${MM.carte} × ${MM.carte} mm, fond perdu ${MM.fond} mm.
  Le pointillé corail est le trait de coupe : tout ce qui est en dehors sera massicoté.</p>
<div class="grille">${vign}</div>
<p class="note"><b>À l'impression</b> — envoyez les PDF : ils font ${MM.page} × ${MM.page} mm
  (carte + fond perdu, planche mesurée 70,87 mm — Chromium arrondit au pixel, l'écart est
  absorbé par le fond perdu) et portent la police intégrée. Les <b>JPEG</b> sont là pour un
  imprimeur qui demande une image : 1 681 px de côté, soit <b>601 ppp</b>, qualité maximale.
  Les PNG font 301 ppp. Les deux portent leur densité réelle dans le fichier et se posent à
  ${MM.page} mm tout seuls — ne les rééchantillonnez pas « à 300 ppp ». Les couleurs sont en RVB : la plupart
  des imprimeries en ligne convertissent elles-mêmes en CMJN ; si la vôtre exige un CMJN
  profilé, demandez-lui le profil et faites la conversion à l'ouverture du PDF.</p>
<script>
  // L'iframe rend la carte à sa taille réelle ; on la met à l'échelle du cadre.
  function caler(){document.querySelectorAll('.cadre').forEach(function(d){
    var f=d.querySelector('iframe'), k=d.clientWidth/f.offsetWidth;
    f.style.transform='scale('+k+')';});}
  addEventListener('load',caler);addEventListener('resize',caler);caler();
</script>
</body></html>`;
}

/* UN PNG DIT SA TAILLE PHYSIQUE, PAS SEULEMENT SON NOMBRE DE PIXELS. La planche fait
   71 mm, soit 268,35 px CSS ; le navigateur ne sait pas rendre une fraction de pixel et
   sort 841 px au lieu des 838,58 attendus à 300 ppp. Placée « à 300 ppp », l'image
   mesurerait donc 71,2 mm — deux dixièmes de trop. On n'étire pas l'image : on écrit sa
   densité RÉELLE dans le morceau pHYs (pixels par mètre), et n'importe quel logiciel la
   pose alors à 71 mm exactement. */
function poserDensite(fichier) {
  const buf = fs.readFileSync(fichier);
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error('PNG inattendu : ' + fichier);
  const largeur = buf.readUInt32BE(16);
  const ppm = Math.round(largeur / (MM.page / 1000));
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0); data.writeUInt32BE(ppm, 4); data[8] = 1;   // 1 = mètre
  const type = Buffer.from('pHYs');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 0);
  const lg = Buffer.alloc(4); lg.writeUInt32BE(9, 0);
  const morceau = Buffer.concat([lg, type, data, crc]);
  const finIhdr = 8 + 4 + 4 + buf.readUInt32BE(8) + 4;   // signature + IHDR complet
  const sansAncien = retirerPhys(buf, finIhdr);
  fs.writeFileSync(fichier, Buffer.concat([sansAncien.slice(0, finIhdr), morceau, sansAncien.slice(finIhdr)]));
  return Math.round(ppm * 0.0254);
}
/* UN JPEG DIT AUSSI SA TAILLE PHYSIQUE. Il n'a pas de morceau pHYs mais un en-tête JFIF
   qui porte une unité et deux densités ; Chromium écrit « unité 0 » (aucune, simple
   rapport d'aspect), ce qui fait qu'un logiciel de mise en page pose l'image à la taille
   qui l'arrange. On écrit donc la densité RÉELLE en points par pouce — l'image se pose à
   71 mm exactement, comme le PNG. Si l'en-tête JFIF manque, on l'insère. */
function poserDensiteJpeg(fichier, mm) {
  const buf = fs.readFileSync(fichier);
  if (buf.readUInt16BE(0) !== 0xFFD8) throw new Error('JPEG inattendu : ' + fichier);
  const largeur = tailleJpeg(buf);
  const ppp = Math.round(largeur / (mm / 25.4));
  let out = buf;
  if (buf.readUInt16BE(2) === 0xFFE0 && buf.toString('ascii', 6, 10) === 'JFIF') {
    out = Buffer.from(buf);
    out[13] = 1;                    // unité : 1 = point par pouce
    out.writeUInt16BE(ppp, 14); out.writeUInt16BE(ppp, 16);
  } else {
    const app0 = Buffer.alloc(20);
    app0.writeUInt16BE(0xFFE0, 0); app0.writeUInt16BE(16, 2);
    app0.write('JFIF\0', 4, 'ascii');
    app0[9] = 1; app0[10] = 2;      // version 1.02
    app0[11] = 1;                   // unité : ppp
    app0.writeUInt16BE(ppp, 12); app0.writeUInt16BE(ppp, 14);
    app0[16] = 0; app0[17] = 0;     // pas de vignette
    out = Buffer.concat([buf.slice(0, 2), app0.slice(0, 18), buf.slice(2)]);
  }
  fs.writeFileSync(fichier, out);
  return ppp;
}
// Largeur en pixels, lue dans le segment SOF — on ne se fie pas au facteur d'échelle.
function tailleJpeg(buf) {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return buf.readUInt16BE(i + 7);
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('Largeur JPEG introuvable');
}

function retirerPhys(buf, i) {
  // Chromium n'en pose pas, mais une exécution sur un PNG déjà traité en poserait un second.
  let p2 = i;
  while (p2 + 8 <= buf.length) {
    const lg = buf.readUInt32BE(p2), type = buf.toString('ascii', p2 + 4, p2 + 8);
    if (type === 'pHYs') return Buffer.concat([buf.slice(0, p2), buf.slice(p2 + 12 + lg)]);
    if (type === 'IDAT' || type === 'IEND') break;
    p2 += 12 + lg;
  }
  return buf;
}
let TABLE_CRC = null;
function crc32(b) {
  if (!TABLE_CRC) { TABLE_CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE_CRC[n] = c; } }
  let c = -1;
  for (let i = 0; i < b.length; i++) c = TABLE_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* ---------- Écriture ---------- */
async function main() {
  const verifierSeul = process.argv.includes('--verifier');
  const src = lireSource();
  const c = couleurs(src);
  const { qrEncode, qrSvgFrom } = qrDeLApp(src);
  const metierBrut = metiersDeLApp(src);
  const metier = id => { const m = metierBrut(id); return { ...m, ico: icoCentree(m.ico, CADRES[id]) }; };
  const logo = zouti();
  const b64 = police();
  const style = feuille(c, b64);
  fs.mkdirSync(SORTIE, { recursive: true });

  const qr = (url, px) => { const mat = qrEncode(url);
    if (!mat) throw new Error('QR non encodable : ' + url);
    return qrSvgFrom(px, mat, 'QR-code Ti-Services'); };

  // Le plan : chaque face dit son fichier, son titre, et l'adresse que son QR doit porter
  // (rien s'il n'en a pas). C'est cette adresse que le décodeur indépendant vérifiera.
  const plan = [];
  for (const carte of CARTES) {
    plan.push({ cle: carte.cle, face: 'recto', titre: 'Carte ' + carte.cle + ' — recto',
      html: () => recto(c, carte, logo, style, metier) });
    plan.push({ cle: carte.cle, face: 'verso', titre: 'Carte ' + carte.cle + ' — verso',
      url: carte.url, html: () => verso(carte, qrNu(qr(carte.url, 400)), style) });
  }
  plan.push({ cle: DUO.cle, face: 'recto', titre: 'Carte unique — recto (client)',
    html: () => recto(c, CARTES[0], logo, style, metier, 'Ti-Services — carte unique, recto client') });
  plan.push({ cle: DUO.cle, face: 'verso', titre: 'Carte unique — verso (prestataire)', url: DUO.url,
    html: () => recto(c, CARTES[1], `<div class="tuile tete">${qrNu(qr(DUO.url, 400))}</div>`,
      style, metier, 'Ti-Services — carte unique, verso prestataire', 'verso') });

  const faces = plan.map(f => ({ cle: f.cle, face: f.face, titre: f.titre, url: f.url,
    fichier: `carte-${f.cle}-${f.face}.html` }));

  // Le navigateur sert d'abord à MESURER (les icônes), ensuite à rendre.
  const { chromium } = require(path.join(RACINE, 'node_modules', 'playwright-core'));
  const opts = { args: ['--no-sandbox', '--font-render-hinting=none'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  const nav = await chromium.launch(opts);
  CADRES = await centrerIcones(nav, metierBrut, [...new Set(CARTES.flatMap(x => x.metiers || []))]);

  if (!verifierSeul) {
    plan.forEach((f, i) => fs.writeFileSync(path.join(SORTIE, faces[i].fichier), f.html()));
    fs.writeFileSync(path.join(SORTIE, 'apercu.html'), apercu(faces, c));
  }
  // 300 ppp : 1 mm = 300/25.4 px. Le PNG sort donc à la taille exacte d'un tirage.
  const ppmm = 300 / 25.4;
  const JPEG_PPP = 600;
  const ctx = await nav.newContext({ deviceScaleFactor: ppmm / (96 / 25.4) });
  const p = await ctx.newPage();
  for (const f of faces) {
    const url = 'file://' + path.join(SORTIE, f.fichier);
    await p.goto(url, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    if (!verifierSeul) {
      const pdf = f.fichier.replace('.html', '.pdf');
      // `preferCSSPageSize` fait foi de `@page{size:71mm 71mm}`. Passer la taille en
      // millimètres à `pdf()` la convertissait d'abord en pixels à 96 ppp, puis en points :
      // la planche sortait à 71,29 mm — un quart de millimètre qu'un imprimeur relève.
      await p.pdf({ path: path.join(SORTIE, pdf), preferCSSPageSize: true,
        printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' });
    }
    /* LA MARGE DE SÉCURITÉ SE MESURE, ELLE NE SE SUPPOSE PAS. Une composition un peu
       trop haute déborde du rembourrage sans que rien ne le dise : le premier jet de la
       grille des métiers sortait à 66,7 mm du haut, soit 3,7 mm DANS la zone que le
       massicot peut mordre. On demande donc au navigateur où commence et où finit
       vraiment le contenu, et on refuse d'écrire un PDF qui déborde. */
    f.trop = await p.evaluate(() => [...document.querySelectorAll('.metier')]
      .filter(e => e.scrollWidth > e.clientWidth + 1)
      .map(e => e.textContent.trim() + ' (' + Math.round(e.scrollWidth / 96 * 25.4 * 10) / 10 +
        ' mm pour ' + Math.round(e.clientWidth / 96 * 25.4 * 10) / 10 + ')'));
    if (f.trop.length) {
      console.log('  ✗ ' + f.fichier + ' — nom trop long pour sa colonne : ' + f.trop.join(', '));
      process.exitCode = 1;
    }
    f.debord = await p.evaluate((marge) => {
      const carte = document.querySelector('.carte');
      const r = carte.getBoundingClientRect();
      const px = (marge / 25.4) * 96;
      let haut = Infinity, bas = -Infinity, g = Infinity, d = -Infinity;
      for (const e of carte.children) { const b = e.getBoundingClientRect();
        if (!b.height) continue;
        haut = Math.min(haut, b.top - r.top); bas = Math.max(bas, b.bottom - r.top);
        g = Math.min(g, b.left - r.left); d = Math.max(d, b.right - r.left); }
      const mm = v => +(v / 96 * 25.4).toFixed(2);
      // Aucune tolérance : la marge de sécurité EST la tolérance. Un dixième de
      // millimètre rendu ici, c'est un dixième de moins face au massicot.
      return { haut: mm(haut), bas: mm(r.height - bas), gauche: mm(g), droite: mm(r.width - d),
        depasse: Math.min(haut, r.height - bas, g, r.width - d) < px - 0.2 };
    }, MM.marge);
    if (f.debord.depasse) {
      console.log('  ✗ ' + f.fichier + ' déborde de la marge de sécurité — haut ' + f.debord.haut +
        ' bas ' + f.debord.bas + ' gauche ' + f.debord.gauche + ' droite ' + f.debord.droite +
        ' mm (minimum ' + MM.marge + ')');
      process.exitCode = 1;
    }
    const png = f.fichier.replace('.html', '.png');
    await p.locator('.carte').screenshot({ path: path.join(SORTIE, png) });
    f.png = png;
    f.ppp = poserDensite(path.join(SORTIE, png));
  }
  await ctx.close();

  /* LE JPEG EST RENDU À PART, ET DEUX FOIS PLUS FIN. Un JPEG est une image de POINTS : là
     où le PDF garde le texte en courbes, le JPEG le fige en pixels. À 300 ppp les
     contre-formes d'un texte de 2 mm et les modules du QR-code tombent sur un pixel et
     demi ; à 600 ils en ont trois. La compression est poussée au maximum de qualité et
     sans sous-échantillonnage de la couleur : sur des aplats et du trait, c'est le
     réglage qui ne laisse pas de franges autour des lettres corail. */
  const ctxJ = await nav.newContext({ deviceScaleFactor: JPEG_PPP / 96 });
  const pj = await ctxJ.newPage();
  for (const f of faces) {
    await pj.goto('file://' + path.join(SORTIE, f.fichier), { waitUntil: 'load' });
    await pj.evaluate(() => document.fonts.ready);
    const jpg = f.fichier.replace('.html', '.jpg');
    await pj.locator('.carte').screenshot({ path: path.join(SORTIE, jpg), type: 'jpeg', quality: 100 });
    f.jpg = jpg;
    f.pppJpeg = poserDensiteJpeg(path.join(SORTIE, jpg), MM.page);
  }
  await ctxJ.close();
  await nav.close();

  // VÉRIFICATION DU QR SUR L'IMAGE RENDUE, avec un décodeur indépendant. Une carte de
  // visite ne se corrige pas après tirage : on ne se fie pas à l'encodeur pour se relire.
  const { execFileSync } = require('child_process');
  let decodeur = true;
  // ON RELIT LES DEUX IMAGES. Le JPEG est compressé : ses artefacts se logent justement
  // sur les transitions noir/blanc franches, c'est-à-dire sur les modules du QR-code. Un
  // code qui se lit dans le PNG ne prouve donc rien du JPEG — on vérifie les deux.
  for (const f of faces.filter(x => x.url)) {
    for (const img of [f.png, f.jpg]) {
      let lu = '';
      try { lu = execFileSync('zbarimg', ['-q', '--raw', path.join(SORTIE, img)], { encoding: 'utf8' }).trim(); }
      catch (e) { decodeur = false; lu = '(zbarimg absent ou muet)'; }
      const ok = lu === f.url;
      console.log((ok ? '  ✓ ' : '  ✗ ') + img + ' → ' + lu + (ok ? '' : '   ATTENDU ' + f.url));
      if (!ok && decodeur) process.exitCode = 1;
    }
  }
  if (!decodeur) console.log('  ⚠︎ décodeur indépendant indisponible — QR NON vérifié');
  console.log('\n' + faces.length + ' faces dans outils/cartes/ · ' +
    MM.carte + '×' + MM.carte + ' mm, fond perdu ' + MM.fond + ' mm (planche ' + MM.page + '×' + MM.page + ' mm)');
  if (faces[0] && faces[0].ppp) console.log('PNG : ' + faces[0].ppp + ' ppp · JPEG : ' + faces[0].pppJpeg +
    ' ppp — densité écrite dans les deux, posés à ' + MM.page + ' mm exactement');
}

main().catch(e => { console.error(e); process.exit(1); });
