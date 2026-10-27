/* LE FILM — une scène, une caméra, deux personnes.
 *
 * Premier jet : une succession d'écrans dans un cadre immobile, avec des légendes
 * par-dessus. « Il n'y a pas de mise en scène, juste une succession d'écran » —
 * c'était exact, et le défaut n'était pas le rythme : les deux côtés étaient
 * racontés l'un APRÈS l'autre, alors que tout l'intérêt du produit est qu'ils se
 * passent EN MÊME TEMPS, à deux endroits de la même île.
 *
 * Donc : un MONDE large de 2 400 points (Camille à gauche, Léa à droite, l'île
 * entre les deux), une CAMÉRA qui le parcourt, et au milieu du film la demande
 * qui TRAVERSE d'un téléphone à l'autre. Le reste suit — on pousse sur un détail,
 * on recule pour montrer les deux, un doigt touche l'écran.
 *
 * Pourquoi pas un enregistrement vidéo : Playwright sait filmer, mais son encodeur
 * n'est pas installé ici. Image par image vaut mieux de toute façon — `anime(t)`
 * place tout pour l'instant t, on photographie, on avance ; deux rendus donnent le
 * même fichier et rien ne dépend de la charge de la machine.
 *
 * Rien n'est retapé : palette, Zouti, icônes et silhouette de l'île se LISENT dans
 * index.html ; les écrans sont les vrais, capturés par scene.js, et les endroits
 * où le doigt se pose viennent de `ecrans/reperes.json`, relevés sur ces écrans.
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { lireSource, couleurs, melange, zouti, police, iconesDeLApp } = require('../cartes-visite.js');
const { capturer, CHROME } = require('./scene.js');

const LARGEUR = 1080, HAUTEUR = 1920, FPS = 25;
const ECRANS = path.join(__dirname, 'ecrans');

/* ---------- le monde ---------- */
const MONDE = { w: 2400, h: 1920 };
const TEL = { w: 622, h: 1316, bordure: 13 };          // le cadre, et l'écran dedans
const ECR = { w: 390, h: 844 };                         // la capture, telle qu'elle est prise
const K = (TEL.w - 2 * TEL.bordure) / ECR.w;            // 596 / 390 — l'écran tient SANS rognage
const CLIENTE_TEL = { x: 600, y: 1150 };
const PRO_TEL = { x: 1800, y: 1150 };

// Un point de l'ÉCRAN (coordonnées de la capture) ramené dans le monde.
function surEcran(tel, sx, sy) {
  return { x: Math.round(tel.x - TEL.w / 2 + TEL.bordure + sx * K),
           y: Math.round(tel.y - TEL.h / 2 + TEL.bordure + sy * K) };
}

/* ---------- la silhouette de l'île, prise dans la feuille de style de l'app ---------- */
function ile(src) {
  const m = src.match(/\.isle-wm::after\{.*?url\("data:image\/svg\+xml,([^"]*)"/);
  if (!m) throw new Error('Silhouette de l\'île introuvable dans index.html');
  return decodeURIComponent(m[1]);
}

/* ———————————————————————————————————————————————————————————————
   CE QUE LA VIDÉO N'A PAS LE DROIT DE DIRE.

   Un premier jet annonçait que les prestataires sont « assurés ». Le produit ne
   le tient pas : un dossier reste complet avec une assurance DÉCLARÉE ABSENTE
   (draftInsDone accepte insuranceNone, insPeutValider laisse passer 'aucune'),
   et c'est à l'éditeur de trancher au cas par cas. Une vidéo publique ne peut
   pas promettre cela.

   La règle ne tient donc pas à la mémoire : elle REFUSE de fabriquer le film.
   On ne garde que des tournures qu'on a décidé de ne pas employer ; la liste
   ne juge QUE le HTML produit, jamais ce fichier — sinon ce commentaire-ci la
   ferait rougir. */
const INTERDITS = [
  { motif: /prestataires?[^.<]{0,40}assur[ée]s?/i,
    pourquoi: 'un dossier reste complet avec une assurance déclarée absente' },
  { motif: /tous[^.<]{0,30}assur[ée]s?/i,
    pourquoi: 'un dossier reste complet avec une assurance déclarée absente' },
  { motif: /garanti[^.<]{0,20}rembours/i,
    pourquoi: 'aucune garantie de remboursement n\'existe dans l\'application' },
];

/* UNE COULEUR MALFORMÉE SE JETTE EN SILENCE. `melange(a, b, part)` prend une
   FRACTION ; huit appels lui passaient des dizaines. Résultat : des valeurs hors
   bornes, donc « #2331337c » ou « #255-727… », que le navigateur ignore sans un
   mot — le soleil et l'horizon n'ont jamais été peints, et j'ai cru qu'ils étaient
   trop discrets. On refuse donc tout ce qui n'est pas 3, 6 ou 8 chiffres hex.
   La garde porte son assertion arrière : un film sans aucune couleur la
   satisferait sinon. */
function verifierCouleurs(html) {
  const vues = html.match(/#[0-9a-fA-F-]{2,12}\b/g) || [];
  /* TROIS OU SIX CHIFFRES, JAMAIS HUIT. Le film n'écrit aucune couleur avec
     alpha — l'alpha passe par rgba(). Or le débordement de melange() produit
     précisément du huit-chiffres (« #2331337c » = un teal sombre à 48 %), que
     le navigateur accepte : c'est la forme qui a peint le ciel en gris, et une
     garde qui la tolère ne garde rien. La contre-épreuve l'a dit. */
  const propres = vues.filter(v => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v));
  if (propres.length < 20) {
    throw new Error('La garde des couleurs ne mesure rien : ' + propres.length + ' couleur(s) relevée(s).');
  }
  const sales = [...new Set(vues.filter(v => !propres.includes(v)))];
  if (sales.length) {
    throw new Error('Couleur(s) malformée(s) dans le film : ' + sales.slice(0, 6).join(', ') +
      '.\nLe navigateur les jette sans un mot — vérifiez que melange() reçoit une FRACTION, pas un pourcentage.');
  }
  return html;
}

function verifierPromesses(html) {
  const nu = html.replace(/<[^>]*>/g, ' ');
  for (const i of INTERDITS) {
    const m = nu.match(i.motif);
    if (m) throw new Error('Le film promet « ' + m[0].trim() + ' » — ' + i.pourquoi + '.');
  }
  // ASSERTION ARRIÈRE : une garde qui ne reconnaîtrait plus rien laisserait tout
  // passer en silence. On lui soumet un surengagement fabriqué.
  const faux = '<p>Des prestataires tous assurés.</p>'.replace(/<[^>]*>/g, ' ');
  if (!INTERDITS.some(i => i.motif.test(faux))) {
    throw new Error('La garde des promesses ne reconnaît plus un surengagement.');
  }
  return html;
}

/* ---------- le découpage ----------
   Les secondes sont ABSOLUES : on lit le minutage en diagonale, et déplacer un
   moment ne décale pas les suivants par accident. */
const DUREE = 40.0;

/* ———————————————————————————————————————————————————————————————
   LE MONTAGE.

   Deux fois de suite : « cela reste une succession d'écran, c'est ennuyeux ».
   Mesuré sur le découpage d'avant, et c'était exact : sur 48 secondes, TRENTE
   étaient « un écran change dans un téléphone immobile ». La caméra bougeait
   ENTRE les plans et tenait parfaitement fixe PENDANT — sept plans de sept
   secondes — et les deux côtés se racontaient en deux blocs, alors que tout
   l'argument est qu'ils se passent en même temps.

   Trois choses changent, et ce sont des faits du montage, pas de la décoration :

   · VINGT PLANS au lieu de sept, de 1 à 2,8 secondes.
   · HUIT PLANS DE DÉTAIL : on pousse sur « 110,00 € », sur « Aucun débit
     maintenant », sur « 93,50 € » — l'endroit vient de reperes.json, relevé sur
     l'écran RÉEL, donc le cadrage ne peut pas désigner autre chose que ce qu'on
     annonce. Les captures font 1170 px de large pour 596 affichés : jusqu'à
     2,1 fois, un détail reste net au pixel.
   · AUCUN PLAN N'EST FIGÉ : chaque plan porte une dérive, donc l'image vit même
     quand rien ne se passe.

   Un plan dit OÙ la caméra va et QUAND elle y arrive ; `montage()` en fait les
   points de regard. Écrire les points à la main, c'était se tromper d'arithmétique
   à chaque déplacement d'un plan. */
function montage(plans) {
  const K = [];
  plans.forEach((p, i) => {
    const arrivee = i === 0 ? p.de : p.de + (p.transit != null ? p.transit : 0.8);
    const d = p.derive || { x: 18, y: -16, z: 0.014 };
    /* LA DÉRIVE EST BORNÉE COMME L'ARRIVÉE. Mesuré : un plan de détail cadré au
       bord d'un écran arrivait dedans et en RESSORTAIT en dérivant — trois points
       de regard sur seize. Un plan qui porte une borne l'applique donc à ses DEUX
       extrémités, sinon la borne ne vaut que pour l'instant où l'on arrive. */
    const b = p.borne || (k => k);
    K.push(b({ t: +arrivee.toFixed(3), x: p.x, y: p.y, z: p.z }));
    K.push(b({ t: p.fin, x: p.x + d.x, y: p.y + d.y, z: +(p.z * (1 + d.z)).toFixed(4) }));
  });
  for (let i = 1; i < K.length; i++) {
    if (K[i].t <= K[i - 1].t) {
      throw new Error('Montage : le plan ' + i + ' arrive à ' + K[i].t +
        ', c\'est-à-dire avant la fin du précédent (' + K[i - 1].t + ') — le transit est trop long.');
    }
  }
  return K;
}

const a = (de, duree) => `data-a="${de},${duree}"`;          // entrée
const s = (de, duree) => `data-s="${de},${duree}"`;          // sortie
const f = (de, duree) => `data-f="${de},${duree}"`;          // fané : il reste, il ne compte plus
const tap = (de) => `data-tap="${de}"`;                       // un doigt touche
const pose = (p) => `style="--x:${p.x}px;--y:${p.y}px"`;      // posé dans le monde

function page(c, src) {
  const Z = zouti();
  const ILE = ile(src);
  const I = iconesDeLApp(src);
  const R = JSON.parse(fs.readFileSync(path.join(ECRANS, 'reperes.json'), 'utf8'));
  // Le point du monde que vise un plan de détail — relevé sur l'écran, pas choisi.
  const vise = (tele, ecran, nom) => {
    if (!R[ecran] || !R[ecran][nom]) throw new Error('Repère absent : ' + ecran + '.' + nom);
    return surEcran(tele, R[ecran][nom].x, R[ecran][nom].y);
  };
  /* UN PLAN DE DÉTAIL NE MONTRE QUE L'ÉCRAN. Centrer bêtement sur le repère faisait
     entrer le décor dans le plan : mesuré, 130 px de sable à droite du « 110,00 € »,
     parce que ce repère est à 317 sur 390 de large. On BORNE le regard pour que le
     cadre tienne dans la dalle — et comme 540/298 vaut 1,81, un détail ne descend
     jamais sous 1,90 : en dessous le cadre est PLUS LARGE que l'écran et aucune
     borne n'y peut rien. Horizontalement il ne reste alors qu'une quinzaine de
     points de latitude : un détail est donc cadré sur toute la largeur de l'écran
     et ne balaie qu'en hauteur, ce qui est la façon dont on lit un téléphone. */
  const DETAIL_Z_MIN = 1.90;
  const detail = (de, fin, tele, ecran, nom, z, transit, cale) => {
    if (z < DETAIL_Z_MIN) throw new Error('Plan de détail à ' + z + ' : sous ' +
      DETAIL_Z_MIN + ' le cadre déborde de l\'écran (' + ecran + '.' + nom + ').');
    const q = vise(tele, ecran, nom);
    const demiL = 540 / z, demiH = 960 / z;
    const gx = TEL.w / 2 - TEL.bordure, gy = TEL.h / 2 - TEL.bordure;
    const borne = (v, c, g, demi) => Math.max(c - g + demi, Math.min(c + g - demi, v));
    /* « haut » cale le cadre en tête d'écran. Un plan de détail peut emporter des
       voisins qu'on ne veut pas magnifier — ici la rangée de réassurance de
       l'accueil, dont une ligne promet plus que le produit ne tient (voir
       LISEZ-MOI). On cadre, on ne retouche pas la capture. */
    const dans = k => ({ t: k.t, z: k.z,
      x: Math.round(borne(k.x, tele.x, gx, 540 / k.z)),
      y: Math.round(cale === 'haut' ? tele.y - gy + 960 / k.z
                                    : borne(k.y, tele.y, gy, 960 / k.z)) });
    return { de, fin, z, transit, borne: dans,
      x: Math.round(borne(q.x, tele.x, gx, demiL)),
      y: Math.round(cale === 'haut' ? tele.y - gy + demiH : borne(q.y, tele.y, gy, demiH)),
      derive: { x: 6, y: cale === 'haut' ? 0 : -10, z: 0.02 } };
  };
  const plein = (de, fin, tele, z, transit, derive) =>
    ({ de, fin, x: tele.x, y: 1150, z: z || 1.00, transit, derive });

  const CAMERA = montage([
    /* ACTE 1 — ce qu'une annonce fait. Lent, puis ça se resserre bulle après bulle. */
    { de: 0.0,  fin: 1.4,  x: 600, y: 300, z: 0.600, derive: { x: 10, y: -2, z: 0.012 } },
    { de: 1.4,  fin: 2.8,  x: 600, y: 300, z: 0.620, transit: 0.9,  derive: { x: 14, y: -3, z: 0.016 } },
    { de: 2.8,  fin: 3.6,  x: 628, y: 296, z: 0.655, transit: 0.35, derive: { x: 10, y: -2, z: 0.014 } },
    { de: 3.6,  fin: 4.3,  x: 652, y: 292, z: 0.690, transit: 0.30, derive: { x: 10, y: -2, z: 0.014 } },
    { de: 4.3,  fin: 5.2,  x: 676, y: 288, z: 0.725, transit: 0.30, derive: { x: 10, y: -2, z: 0.014 } },
    { de: 5.2,  fin: 6.4,  x: 640, y: 320, z: 0.600, transit: 0.50, derive: { x: -6, y: 5, z: -0.010 } },
    { de: 6.4,  fin: 7.3,  x: 600, y: 900, z: 0.800, transit: 0.50, derive: { x: 0, y: 24, z: 0.030 } },

    /* ACTE 2 — elle commande. Le plein et le détail alternent, et les transits
       tombent à un dixième de seconde : à cette durée ce n'est plus un mouvement,
       c'est une COUPE. C'est la grammaire demandée. */
    plein(7.3, 8.6, CLIENTE_TEL, 1.00, 0.55),
    detail(8.6, 9.4, CLIENTE_TEL, '01-accueil-bas', 'massage', 1.92, 0.10, 'haut'),
    plein(9.4, 10.5, CLIENTE_TEL, 1.00, 0.10),
    detail(10.5, 11.2, CLIENTE_TEL, '02-config', 'relaxant', 1.95, 0.10),
    plein(11.2, 12.3, CLIENTE_TEL, 1.00, 0.10),
    detail(12.3, 13.1, CLIENTE_TEL, '03-confirmer', 'prix', 2.10, 0.10),
    plein(13.1, 14.3, CLIENTE_TEL, 1.00, 0.40),        // sous le carton : on se replace
    detail(14.3, 15.2, CLIENTE_TEL, '03-confirmer', 'carte', 1.95, 0.10),

    /* ACTE 3 — la traversée. LE SEUL PLAN LONG DU FILM, et c'est voulu : une
       bande-annonce accélère partout sauf à l'endroit qu'elle veut faire voir. */
    { de: 15.2, fin: 16.4, x: 1200, y: 1120, z: 0.560, transit: 0.9, derive: { x: 0, y: -10, z: 0.012 } },
    { de: 16.4, fin: 18.4, x: 1200, y: 1100, z: 0.600, transit: 1.0, derive: { x: 0, y: -18, z: 0.026 } },
    plein(18.4, 19.4, PRO_TEL, 1.00, 0.70),            // le coup de poing sur son téléphone

    /* ACTE 4 — elle gagne. Même alternance, encore un cran plus serrée. */
    plein(19.4, 20.6, PRO_TEL, 1.00, 0.08),
    detail(20.6, 21.4, PRO_TEL, '05-pro-fil', 'mission', 2.00, 0.10),
    plein(21.4, 22.5, PRO_TEL, 1.00, 0.10),
    detail(22.5, 23.3, PRO_TEL, '06-pro-acceptee', 'percoit', 1.95, 0.10),
    plein(23.3, 24.4, PRO_TEL, 1.00, 0.10),
    detail(24.4, 25.3, PRO_TEL, '07-pro-revenus', 'net', 2.10, 0.10),
    { de: 25.3, fin: 26.6, x: 1200, y: 640, z: 2.000, transit: 0.5, derive: { x: 0, y: 8, z: 0.008 } },

    /* ACTE 5 — ce qu'une annonce ne fera jamais, puis la fin. */
    { de: 26.6, fin: 28.8, x: 1200, y: 620, z: 2.000, transit: 0.5, derive: { x: 0, y: 12, z: 0.010 } },
    { de: 28.8, fin: 30.8, x: 1200, y: 645, z: 2.060, transit: 0.5, derive: { x: 0, y: 10, z: 0.010 } },
    { de: 30.8, fin: 32.8, x: 1200, y: 670, z: 2.110, transit: 0.5, derive: { x: 0, y: 10, z: 0.008 } },
    { de: 32.8, fin: 34.2, x: 1200, y: 695, z: 2.150, transit: 0.5, derive: { x: 0, y: 10, z: 0.008 } },
    { de: 34.2, fin: 40.0, x: 1200, y: 745, z: 2.170, transit: 0.8, derive: { x: 0, y: 24, z: 0.042 } },
  ]);
  const ico = k => {
    if (!I[k]) throw new Error('Icône absente de l\'app : ' + k);
    /* ON NE DÉSHABILLE QUE LA BALISE <svg>. Un premier jet retirait width et height
       PARTOUT : le <rect> de la carte bancaire perdait les siens et l'icône se
       réduisait à un trait. La taille se décide en CSS, sur le <svg> seul. */
    return I[k].replace(/^<svg[^>]*>/, t => t.replace(/\s(width|height)="[^"]*"/g, ''));
  };
  const fontes = police().map(ft =>
    `@font-face{font-family:Inter;font-weight:${ft.g};font-style:normal;font-display:block;` +
    `src:url(data:font/ttf;base64,${ft.b64}) format('truetype')}`).join('\n');

  /* Un téléphone posé dans le monde, et les écrans qui s'y succèdent.
     LE PREMIER ÉCRAN ENTRE SANS FONDU, à l'instant où le téléphone paraît :
     avec un fondu, deux ou trois images montrent un cadre creux. */
  const tel = (nom, p, ecrans, de) => `<div class="tel enMonde telMonte" id="tel-${nom}" ${pose(p)} ${a(de, 0.9)}>
    <div class="tel-dedans">` +
    ecrans.map((e, i) => `<img src="ecrans/${e.f}.png" class="ecran" ` +
      `${a(e.de, e.fondu != null ? e.fondu : (i === 0 ? 0.01 : 0.4))} ${e.s ? s(e.s, 0.35) : ''}>`).join('') +
    `</div></div>`;

  /* UN DÉFILEMENT N'EST PAS UN APPUI. Un premier jet posait un doigt au milieu de
     l'accueil pour motiver le passage à l'écran du bas : il tombait sur une tuile
     de service et promettait un clic qui n'a pas lieu. Le doigt GLISSE. */
  const glisse = (tele, sx, sy, t, dy) => {
    const p = surEcran(tele, sx, sy);
    return `<div class="pouce" ${pose(p)} data-glisse="${t},0.55,${dy}"><i></i></div>`;
  };
  // Un doigt qui touche un endroit PRÉCIS d'un écran — l'endroit vient de reperes.json.
  const doigt = (tele, repere, t) => {
    const p = surEcran(tele, repere.x, repere.y);
    return `<div class="pouce" ${pose(p)} ${tap(t)}><i></i></div>`;
  };

  const legende = (txt, de, dur, cl = '') =>
    `<div class="legende ${cl}" ${a(de, 0.45)} ${s(de + dur, 0.35)}>${txt}</div>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${fontes}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden}
body{font-family:Inter,sans-serif;background:${c.sand};color:${c.ink};-webkit-font-smoothing:antialiased}
.film{position:relative;width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden;background:${c.sand}}

/* ——— LE MONDE, et la caméra qui le regarde ———
   La caméra fixe un point et le grossit ; la transformation est posée par anime(t),
   jamais par une animation CSS — sinon deux rendus de la même seconde différeraient. */
.monde{position:absolute;left:0;top:0;width:${MONDE.w}px;height:${MONDE.h}px;
  transform-origin:0 0;will-change:transform}
.enMonde{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%)}

/* ——— le lieu ———
   PAS DE MER NI DE CIEL LITTÉRAUX : la marque n'a aucun bleu, et un premier jet
   posait une bande « mer » et un filet d'horizon qui, mesurés au rendu, ne se
   lisaient pas du tout — il restait du sable et un trait. Ce qui porte l'île,
   c'est la SILHOUETTE elle-même, celle que l'app emploie déjà en filigrane, plus
   une chaleur en haut et un soleil bas. Le ciel déborde largement du monde :
   l'ouverture regarde très haut, et sans ce débord le cadre finissait en blanc. */
.ciel{position:absolute;left:-600px;right:-600px;top:-1400px;height:3400px;
  background:linear-gradient(180deg,
    ${melange(c.sand, c['teal-wash'], 0.90)} 0%,
    ${melange(c.sand, c['teal-wash'], 0.45)} 34%,
    ${c.sand} 54%, ${c.sand} 100%)}
.soleil{position:absolute;left:1200px;top:300px;width:620px;height:620px;margin:-310px 0 0 -310px;
  border-radius:50%;background:radial-gradient(circle,${melange(c.sand, '#FFC24B', 0.58)} 0%,
  ${melange(c.sand, '#FFC24B', 0.30)} 38%, ${melange(c.sand, '#FFC24B', 0.11)} 62%, transparent 74%)}
.horizon{position:absolute;left:-600px;right:-600px;top:400px;height:320px;
  background:linear-gradient(180deg,transparent,${melange(c.sand, c['sand-2'], 0.75)} 62%,transparent)}
.ileScene{position:absolute;left:1200px;top:470px;width:1180px;height:732px;margin:-366px 0 0 -590px;
  background:url("data:image/svg+xml,${encodeURIComponent(ILE)}") center/contain no-repeat;
  opacity:.14}

/* ——— les deux personnes ——— */
.gens{text-align:center;width:460px}
.gens .rond{width:200px;height:200px;border-radius:50%;margin:0 auto;
  background:linear-gradient(150deg,${c.teal},${c['teal-deep']});color:${c.card};
  display:flex;align-items:center;justify-content:center;font-size:74px;font-weight:800;
  letter-spacing:.02em;box-shadow:0 22px 44px -16px rgba(206,48,28,.42)}
.gens .nom{margin-top:18px;font-size:64px;font-weight:800;letter-spacing:-.02em}
.gens .quoi{margin-top:6px;font-size:38px;font-weight:600;color:${c.muted}}

/* ——— le téléphone ——— */
.tel{width:${TEL.w}px;height:${TEL.h}px;border-radius:60px;background:${c.ink};padding:${TEL.bordure}px;
  box-shadow:0 70px 130px -34px rgba(35,30,51,.46), 0 0 0 1px rgba(35,30,51,.06)}
/* LA DALLE EST SOMBRE QUAND AUCUN ÉCRAN N'EST POSÉ. C'est ce qui permet au
   téléphone de Léa d'attendre, éteint, pendant que la demande traverse l'île, et
   de S'ALLUMER quand elle arrive. Ailleurs on ne le voit jamais : le premier
   écran d'un téléphone entre à l'instant même où il paraît. */
.tel-dedans{position:relative;width:100%;height:100%;border-radius:48px;overflow:hidden;background:${c.ink}}
.ecran{position:absolute;inset:0;width:100%;height:100%}

/* ——— un doigt qui touche ——— */
/* UN DOIGT NE CACHE PAS LE CHIFFRE QU'IL DÉSIGNE. Un premier jet était un disque
   plein : mesuré au rendu, il recouvrait « 93,50 € » sur la carte de mission,
   c'est-à-dire exactement ce que le plan existe pour montrer. Un ANNEAU marque
   l'endroit sans rien masquer, et le liseré clair le tient lisible aussi bien sur
   un fond blanc que sur un aplat corail. */
.pouce{position:absolute;left:var(--x);top:var(--y);
  width:104px;height:104px;border-radius:50%;background:transparent;opacity:0;
  border:5px solid ${c['teal-deep']};
  box-shadow:0 0 0 3px rgba(255,255,255,.78), 0 0 26px rgba(206,48,28,.34);
  transform:translate(-50%,-50%) scale(.6)}
.pouce i{position:absolute;inset:-28px;border-radius:50%;border:5px solid ${c['teal-deep']};opacity:0}

/* ——— la demande qui traverse ——— */
.jeton{position:absolute;left:0;top:0;width:540px;padding:30px 36px;border-radius:34px;
  /* EN CORAIL, PAS EN BLANC. Mesurée sur le rendu, une carte blanche sur du sable
     clair ne se détachait pas : elle traversait l'image sans qu'on la suive. */
  background:linear-gradient(135deg,${c.teal},${c['teal-deep']});color:${c.card};
  display:flex;gap:24px;align-items:center;
  box-shadow:0 30px 64px -16px rgba(206,48,28,.52), 0 0 0 12px ${melange(c.sand, c.teal, 0.20)};opacity:0}
.jeton .ic{flex:0 0 72px;height:72px;border-radius:22px;background:rgba(255,255,255,.22);
  color:${c.card};display:flex;align-items:center;justify-content:center}
.jeton .ic svg{width:40px;height:40px}
.jeton b{display:block;font-size:36px;font-weight:800;letter-spacing:-.02em;color:${c.card}}
.jeton span{display:block;font-size:27px;color:rgba(255,255,255,.9);font-weight:600;margin-top:4px}
.onde{position:absolute;left:0;top:0;width:260px;height:260px;margin:-130px 0 0 -130px;
  border-radius:50%;border:6px solid ${c['teal-deep']};opacity:0}

/* ——— l'animation : chaque élément porte sa propre progression ——— */
[data-a],[data-s]{opacity:calc(var(--p,1) * var(--q,1))}
/* FANÉ N'EST PAS DISPARU. Les bulles s'effaçaient avant la chute : la phrase
   tombait alors dans un trou, sans rien à quoi répondre. */
[data-f]{filter:grayscale(var(--f,0));opacity:calc(var(--p,1) * var(--q,1) * (1 - .56 * var(--f,0)))}
.monte{transform:translate(-50%,calc(-50% + (1 - var(--p,1)) * 56px))}
.grandit{transform:translate(-50%,-50%) scale(calc(.84 + var(--p,1) * .16))}
.telMonte{transform:translate(-50%,calc(-50% + (1 - var(--p,1)) * 340px))}

/* ——— ce qui est DEVANT la caméra : les mots, les cartes, la marque ——— */
.devant{position:absolute;inset:0;pointer-events:none}
.devant > *{position:absolute;left:72px;right:72px}
.sourcil{font-size:30px;font-weight:800;letter-spacing:.20em;text-transform:uppercase;color:${c['teal-deep']}}
.titre{font-size:98px;line-height:1.02;font-weight:800;letter-spacing:-.035em}
.titre.petit{font-size:76px}
.sous{font-size:42px;line-height:1.3;color:${c['ink-soft']};font-weight:500}
.coup{color:${c['teal-deep']}}
.devant .monte{transform:translateY(calc((1 - var(--p,1)) * 48px))}

/* ——— les bulles d'annonce ——— */
.bulle{position:absolute;background:${c.card};border-radius:34px;border:2px solid ${c.hair};
  padding:34px 38px;font-size:40px;font-weight:600;line-height:1.3;width:760px;
  box-shadow:0 20px 46px -22px rgba(35,30,51,.24)}
.bulle.droite{left:auto;right:72px;background:${melange(c.sand, c['sand-2'], 0.55)}}
.bulle .qui{display:block;font-size:25px;font-weight:800;letter-spacing:.12em;
  text-transform:uppercase;color:${c.muted};margin-bottom:10px}

/* ——— LE CARTON ———
   « On enchaîne ça façon bande-annonce. » Un carton plein cadre, opaque, qui
   PONCTUE. Il règle au passage le reproche d'avant — « attention au texte qui
   s'empile sur les captures » : un carton ne se pose JAMAIS sur un écran, il
   prend sa place. Et il sert à ce que sert un carton dans une bande-annonce :
   il cache le déplacement de la caméra, de sorte que la coupe suivante tombe
   sur un cadre déjà en place. */
.carton{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;padding:0 88px;
  background:${c.sand};z-index:5}
.carton.corail{background:linear-gradient(150deg,${c.teal},${c['teal-deep']});color:${c.card}}
.carton b{font-size:104px;line-height:1.0;font-weight:800;letter-spacing:-.04em;display:block}
.carton.petit b{font-size:82px}
.carton i{font-style:normal;font-size:32px;font-weight:800;letter-spacing:.24em;
  text-transform:uppercase;color:${c['teal-deep']};display:block;margin-bottom:28px}
.carton.corail i{color:rgba(255,255,255,.82)}
.carton .ileC{position:absolute;inset:0;
  background:url("data:image/svg+xml,${encodeURIComponent(ILE)}") center/78% no-repeat;opacity:.10}
.carton.corail .ileC{opacity:.14;filter:brightness(0) invert(1)}

/* ——— la légende qui commente ce qu'on voit ——— */
.legende{top:168px;background:${c.card};border-radius:28px;padding:26px 32px;
  font-size:39px;font-weight:700;line-height:1.25;text-align:center;
  box-shadow:0 26px 60px -18px rgba(35,30,51,.30);border:2px solid ${c.hair}}
.legende b{color:${c['teal-deep']}}
.legende.bas{top:auto;bottom:150px}

/* ——— les promesses ——— */
.carte{background:${c.card};border-radius:36px;border:2px solid ${c.hair};padding:40px 44px;
  box-shadow:0 26px 60px -24px rgba(35,30,51,.26);display:flex;gap:32px;align-items:flex-start}
.carte .ic{flex:0 0 88px;height:88px;border-radius:26px;background:${melange(c.card, c.teal, 0.14)};
  display:flex;align-items:center;justify-content:center;color:${c['teal-deep']}}
.carte .ic svg{width:46px;height:46px}
.carte h3{font-size:44px;font-weight:800;letter-spacing:-.02em;line-height:1.15}
.carte p{font-size:32px;color:${c['ink-soft']};margin-top:10px;line-height:1.35;font-weight:500}

/* ——— la marque ——— */
.marque{display:flex;align-items:center;justify-content:center;gap:26px;font-size:86px;font-weight:800;
  letter-spacing:-.03em}
.marque .zouti{width:112px;height:112px}
.adresse{font-size:48px;font-weight:800;color:${c['teal-deep']};text-align:center}
.pied{font-size:31px;color:${c.muted};font-weight:600;text-align:center}
</style></head><body><div class="film">

<div class="monde" id="monde">
  <div class="ciel"></div><div class="soleil"></div>
  <div class="horizon"></div>
  <div class="ileScene"></div>

  <div class="enMonde gens monte" style="--x:600px;--y:0px" ${a(0.0, 0.7)}>
    <div class="rond">C</div><div class="nom">Camille</div><div class="quoi">Lorient · cliente</div></div>

  <div class="enMonde gens monte" style="--x:1800px;--y:0px" ${a(15.4, 0.8)}>
    <div class="rond">LM</div><div class="nom">Léa</div><div class="quoi">Gustavia · masseuse</div></div>

  ${tel('cam', CLIENTE_TEL, [
    { f:'01-accueil',     de: 7.1 },
    { f:'01-accueil-bas', de: 8.1, fondu:0.22 },
    { f:'02-config',      de: 9.42, fondu:0.10 },
    { f:'03-confirmer',   de:11.22, fondu:0.10 },
  ], 7.0)}

  ${tel('lea', PRO_TEL, [
    // il s'allume À L'INSTANT où la demande se pose dessus — c'est le coup du film
    { f:'05-pro-fil',      de:18.26, fondu:0.18 },
    { f:'06-pro-acceptee', de:21.42, fondu:0.10 },
    { f:'07-pro-revenus',  de:23.32, fondu:0.10 },
  ], 15.8)}

  ${glisse(CLIENTE_TEL, 195, 640, 7.7, -300)}
  ${doigt(CLIENTE_TEL, R['01-accueil-bas'].massage, 8.9)}
  ${doigt(CLIENTE_TEL, R['02-config'].relaxant, 10.8)}
  ${doigt(CLIENTE_TEL, R['03-confirmer'].carte, 14.6)}
  ${doigt(PRO_TEL, R['05-pro-fil'].mission, 21.0)}

  <div class="jeton" id="jeton"><div class="ic">${ico('bolt')}</div>
    <div><b>Massage · 1 h</b><span>Aujourd'hui 17:00 · Lorient</span></div></div>
  <div class="onde" id="onde"></div>
</div>

<div class="devant">

  <!-- ACTE 1 · les bulles tombent sur le paysage, jamais sur une capture -->
  <div class="bulle monte" style="top:1130px" ${a(2.9, 0.3)} ${f(4.9, 0.5)} ${s(5.15, 0.3)}>
    <span class="qui">Dans un groupe de l'île</span>Quelqu'un connaît une bonne masseuse&nbsp;?</div>
  <div class="bulle droite monte" style="top:1330px" ${a(3.7, 0.3)} ${f(4.9, 0.5)} ${s(5.15, 0.3)}>
    <span class="qui">Un inconnu</span>MP&nbsp;!</div>
  <div class="bulle monte" style="top:1500px" ${a(4.4, 0.3)} ${f(4.9, 0.5)} ${s(5.15, 0.3)}>
    <span class="qui">Trois jours plus tard</span>Toujours sans réponse.</div>

  <!-- ACTE 5 · les promesses : les téléphones sont hors cadre, rien ne se recouvre -->
  <div class="sourcil monte" style="top:490px" ${a(26.6, 0.35)} ${s(32.7, 0.3)}>Ce qu'une annonce ne fera jamais</div>
  <div class="carte monte" style="top:560px" ${a(26.8, 0.35)} ${s(32.7, 0.3)}><div class="ic">${ico('shield')}</div>
    <div><h3>Chaque prestataire est validé à la main</h3>
    <p>Identité, assurance, statut : contrôlés avant qu'il reçoive une seule demande.</p></div></div>
  <div class="carte monte" style="top:840px" ${a(29.0, 0.35)} ${s(32.7, 0.3)}><div class="ic">${ico('card')}</div>
    <div><h3>Payé après la prestation validée</h3>
    <p>Le client n'est débité qu'une fois le travail fait. Le pro est réglé sans relancer.</p></div></div>
  <div class="carte monte" style="top:1090px" ${a(31.0, 0.35)} ${s(32.7, 0.3)}><div class="ic">${ico('doc')}</div>
    <div><h3>Factures et attestations automatiques</h3>
    <p>Chaque mission facturée au nom du prestataire. Relevé mensuel, attestation annuelle.</p></div></div>

  <!-- ACTE 5 · la fin -->
  <div class="marque monte" style="top:800px" ${a(34.4, 0.5)}>${Z}<span>Ti-Services</span></div>
  <p class="titre monte" style="top:960px;text-align:center" ${a(34.8, 0.5)}>Tous les services<br>de l'île.<br><span class="coup">Une seule app.</span></p>
  <div class="adresse monte" style="top:1300px" ${a(35.6, 0.5)}>ti-services.fr</div>
  <div class="pied monte" style="top:1376px" ${a(36.0, 0.5)}>Saint-Barthélemy</div>
</div>

<!-- LES CARTONS. Pleins cadre et opaques : ils ponctuent, et ils cachent le
     déplacement de la caméra pour que la coupe suivante tombe sur un cadre déjà
     en place. Aucun mot de la vidéo ne se pose plus sur une capture d'écran. -->
<div class="carton petit" ${a(0.0, 0.3)} ${s(1.3, 0.2)}><div class="ileC"></div>
  <i>Saint-Barthélemy · 17 h 02</i><b>Un massage.<br>Ce soir.</b></div>
<div class="carton corail petit" ${a(5.25, 0.18)} ${s(6.2, 0.18)}><div class="ileC"></div>
  <b>Trois jours.<br>Aucune réponse.</b></div>
<div class="carton petit" ${a(6.45, 0.18)} ${s(7.15, 0.18)}><div class="ileC"></div>
  <b>Il existe<br>une autre façon.</b></div>
<div class="carton corail petit" ${a(13.15, 0.18)} ${s(14.2, 0.18)}><div class="ileC"></div>
  <i>Ce que personne ne fait</i><b>Aucun débit<br>maintenant.</b></div>
<div class="carton" ${a(25.35, 0.18)} ${s(26.5, 0.18)}><div class="ileC"></div>
  <i>Pour elle, sur son compte</i><b>93,50 €</b></div>
<div class="carton corail petit" ${a(32.85, 0.18)} ${s(34.1, 0.18)}><div class="ileC"></div>
  <b>Un site d'annonces<br>vous laisse là.</b></div>

</div><script>
/* Une seule fonction place TOUT le film à l'instant t : la caméra, les éléments,
   le jeton qui traverse. Rien n'est joué par le navigateur — pas de transition
   CSS, pas de minuteur — donc pas de course, et deux rendus de la même seconde
   donnent exactement la même image. */
var CAMERA = ${JSON.stringify(CAMERA)};
var LARGEUR = ${LARGEUR}, HAUTEUR = ${HAUTEUR};

function douceur(x){ return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; }
function borne(x){ return Math.max(0, Math.min(1, x)); }
function part(spec, t){
  var v = spec.split(','), de = +v[0], duree = +v[1] || 0.01;
  return douceur(borne((t - de) / duree));
}

/* La caméra interpole entre ses clés. Entre deux clés identiques elle ne bouge
   pas : c'est ainsi qu'on tient un plan. */
function regard(t){
  if (t <= CAMERA[0].t) return CAMERA[0];
  for (var i = 1; i < CAMERA.length; i++){
    if (t <= CAMERA[i].t){
      var A = CAMERA[i-1], B = CAMERA[i];
      var u = douceur(borne((t - A.t) / (B.t - A.t || 1)));
      return { x: A.x + (B.x - A.x)*u, y: A.y + (B.y - A.y)*u, z: A.z + (B.z - A.z)*u };
    }
  }
  return CAMERA[CAMERA.length - 1];
}

/* LA DEMANDE TRAVERSE L'ÎLE. Elle quitte le téléphone de Camille, monte au-dessus
   de l'île et se pose sur celui de Léa — c'est le mécanisme du produit, mis en
   scène. Courbe de Bézier quadratique, calculée à chaque image. */
var JETON = { de: 16.5, duree: 1.75,
  p0: { x: 600, y: 580 }, c: { x: 1200, y: 160 }, p1: { x: 1800, y: 580 } };

function placerJeton(t){
  var j = document.getElementById('jeton'), o = document.getElementById('onde');
  var u = (t - JETON.de) / JETON.duree;
  if (u < -0.001 || u > 1.35){ j.style.opacity = 0; o.style.opacity = 0; return; }
  var e = douceur(borne(u));
  var k = 1 - e;
  var x = k*k*JETON.p0.x + 2*k*e*JETON.c.x + e*e*JETON.p1.x;
  var y = k*k*JETON.p0.y + 2*k*e*JETON.c.y + e*e*JETON.p1.y;
  // il paraît, il voyage, il se pose : l'opacité dit l'entrée et l'arrivée
  var op = borne(u/0.12) * (1 - borne((u - 1.0)/0.3));
  var ech = 0.74 + 0.3*Math.sin(Math.PI * borne(e));
  j.style.opacity = op;
  j.style.transform = 'translate(' + (x - 270) + 'px,' + (y - 66) + 'px) scale(' + ech + ') rotate(' + ((e - 0.5) * 7).toFixed(2) + 'deg)';
  // l'onde part du téléphone de Léa quand le jeton s'y pose
  var w = borne((u - 0.92) / 0.4);
  o.style.opacity = w > 0 ? (1 - w) * 0.85 : 0;
  o.style.transform = 'translate(' + JETON.p1.x + 'px,' + (JETON.p1.y + 120) + 'px) scale(' + (0.3 + w*2.4) + ')';
}

function anime(t){
  var r = regard(t);
  document.getElementById('monde').style.transform =
    'translate(' + (LARGEUR/2 - r.x*r.z) + 'px,' + (HAUTEUR/2 - r.y*r.z) + 'px) scale(' + r.z + ')';

  var tous = document.querySelectorAll('[data-a],[data-s],[data-f],[data-tap],[data-glisse]');
  for (var k = 0; k < tous.length; k++){
    var e = tous[k];
    var ent = e.getAttribute('data-a'), sor = e.getAttribute('data-s'), fan = e.getAttribute('data-f');
    if (ent) e.style.setProperty('--p', part(ent, t));
    if (sor) e.style.setProperty('--q', 1 - part(sor, t));
    if (fan) e.style.setProperty('--f', part(fan, t));
    var gl = e.getAttribute('data-glisse');
    if (gl){
      // il se pose, il remonte, il repart : le geste porte le changement d'écran
      var g = gl.split(','), gde = +g[0], gdur = +g[1], gdy = +g[2];
      var u = borne((t - gde) / gdur);
      var vu = (t >= gde - 0.2 && t <= gde + gdur + 0.25);
      e.style.opacity = vu ? (0.30 + 0.22 * Math.sin(Math.PI * borne(u + 0.001))) : 0;
      e.style.transform = 'translate(-50%,calc(-50% + ' + (douceur(u) * gdy) + 'px)) scale(1)';
      var an = e.firstElementChild; if (an) an.style.opacity = 0;
      continue;
    }
    var tp = e.getAttribute('data-tap');
    if (tp){
      // un doigt : il se pose, il appuie, il repart ; l'onde le suit
      var u = borne((t - (+tp)) / 0.5);
      var vu = (t >= +tp - 0.22 && t <= +tp + 0.6);
      var enfonce = u < 0.4 ? u/0.4 : 1 - (u - 0.4)/0.6;
      e.style.opacity = vu ? (0.30 + 0.34*enfonce) : 0;
      e.style.transform = 'translate(-50%,-50%) scale(' + (1.12 - 0.22*enfonce) + ')';
      var anneau = e.firstElementChild;
      if (anneau){ anneau.style.opacity = vu ? (1 - u) * 0.55 : 0;
        anneau.style.transform = 'scale(' + (0.7 + u*1.5) + ')'; }
    }
  }
  placerJeton(t);
}
window.anime = anime; window.DUREE = ${DUREE};
anime(0);
</script></body></html>`;
}

/* ———————————————————————————————————————————————————————————————
   UN GESTE QUI NE SE VOIT PAS NE DÉSIGNE RIEN.

   Mesuré avant de payer mille images : les CINQ doigts du film tombaient hors du
   cadre, et aucun n'était visible. Deux causes, et la première est la faute déjà
   payée sur les téléphones — `.pouce` n'avait pas `position:absolute`, donc ses
   coordonnées de monde ne servaient à rien ; la seconde est que le balayage
   d'`anime()` ne regardait pas `[data-glisse]`.

   La règle ne tient donc plus à la relecture : on DEMANDE à la page, à l'instant
   de chaque geste, s'il est peint et s'il tombe dans l'image. Avec son assertion
   arrière — une page sans aucun geste relevé passerait sinon pour une page saine. */
async function verifierGestes(p) {
  const gestes = await p.evaluate(() => [...document.querySelectorAll('.pouce')].map(e => ({
    t: +(e.getAttribute('data-tap') || (e.getAttribute('data-glisse') || '').split(',')[0]),
    quoi: e.hasAttribute('data-tap') ? 'appui' : 'glissé' })));
  if (!gestes.length) throw new Error('Aucun geste relevé dans le film — la garde ne mesure rien.');
  const fautifs = [];
  for (const g of gestes) {
    await p.evaluate(t => window.anime(t), g.t + 0.12);
    const vus = await p.evaluate(() => [...document.querySelectorAll('.pouce')]
      .map(e => { const r = e.getBoundingClientRect();
        return { o: +getComputedStyle(e).opacity, x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
      .filter(v => v.o > 0.08 && v.x > 0 && v.x < 1080 && v.y > 0 && v.y < 1920));
    if (!vus.length) fautifs.push(g.quoi + ' à ' + g.t + ' s');
  }
  if (fautifs.length) {
    throw new Error('Geste(s) invisible(s) ou hors du cadre : ' + fautifs.join(', ') +
      '.\nUn doigt qui ne se voit pas ne désigne rien.');
  }
  return gestes.length;
}

/* ———————————————————————————————————————————————————————————————
   AUCUN MOT NE SE POSE SUR UNE CAPTURE.

   « Attention au texte de la vidéo qui s'empile sur les captures et qui peut
   rendre illisible l'un et l'autre. » Juste, et c'était le cas : les légendes
   vivaient à 168 px du haut, donc au-dessus d'un écran plein cadre dans tous
   les plans de détail.

   La bande-annonce règle le fond — les mots sont sur des CARTONS pleins cadre,
   qui prennent la place de l'image au lieu de s'y superposer — et cette garde
   tient la règle : à chaque cinquième de seconde, un élément de la couche des
   mots ne doit RECOUPER aucune dalle allumée. Un carton visible couvre tout,
   il ne compte donc pas. Avec son assertion arrière : une page où l'on ne
   verrait jamais ni mot ni écran passerait sinon pour une page saine. */
async function verifierLisibilite(p, duree) {
  let vuMot = 0, vuEcran = 0;
  const fautes = [];
  for (let t = 0; t <= duree; t += 0.2) {
    await p.evaluate(x => window.anime(x), t);   // sans ça, on relève 200 fois le MÊME instant
    const r = await p.evaluate(() => {
      const lu = e => +getComputedStyle(e).opacity;
      const carton = [...document.querySelectorAll('.carton')].some(e => lu(e) > 0.5);
      const mots = [...document.querySelectorAll('.devant > *')]
        .filter(e => lu(e) > 0.15)
        .map(e => ({ r: e.getBoundingClientRect(),
                     t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) }));
      const dalles = [...document.querySelectorAll('.tel-dedans')]
        .filter(d => [...d.querySelectorAll('.ecran')].some(i => lu(i) > 0.15))
        .map(d => d.getBoundingClientRect());
      return { carton, mots: mots.map(m => ({ x: m.r.x, y: m.r.y, w: m.r.width, h: m.r.height, t: m.t })),
               dalles: dalles.map(d => ({ x: d.x, y: d.y, w: d.width, h: d.height })) };
    });
    if (r.mots.length) vuMot++;
    if (r.dalles.length) vuEcran++;
    if (r.carton) continue;
    for (const m of r.mots) for (const d of r.dalles) {
      const dx = Math.min(m.x + m.w, d.x + d.w) - Math.max(m.x, d.x);
      const dy = Math.min(m.y + m.h, d.y + d.h) - Math.max(m.y, d.y);
      if (dx > 4 && dy > 4) fautes.push('à ' + t.toFixed(1) + ' s, « ' + m.t + ' » recouvre un écran sur ' +
        Math.round(dx) + '×' + Math.round(dy) + ' px');
    }
  }
  if (!vuMot || !vuEcran) {
    throw new Error('La garde de lisibilité ne mesure rien : ' + vuMot + ' instant(s) avec du texte, ' +
      vuEcran + ' avec un écran allumé.');
  }
  if (fautes.length) {
    throw new Error('Du texte se pose sur une capture :\n  ' +
      [...new Set(fautes)].slice(0, 8).join('\n  ') +
      (fautes.length > 8 ? '\n  … et ' + (fautes.length - 8) + ' autre(s)' : ''));
  }
  return { mots: vuMot, ecrans: vuEcran };
}

/* ---------- le rendu ---------- */
async function rendre({ recapturer = true, fps = FPS } = {}) {
  if (recapturer) await capturer(ECRANS);
  for (const e of ['01-accueil','01-accueil-bas','03-confirmer','05-pro-fil','07-pro-revenus']) {
    if (!fs.existsSync(path.join(ECRANS, e + '.png'))) throw new Error('Écran manquant : ' + e);
  }
  const src = lireSource();
  const c = couleurs(src);
  const html = path.join(__dirname, 'film.html');
  fs.writeFileSync(html, verifierCouleurs(verifierPromesses(page(c, src))));

  const images = path.join(__dirname, 'images');
  fs.rmSync(images, { recursive: true, force: true });
  fs.mkdirSync(images, { recursive: true });

  const opt = { headless: true };
  if (fs.existsSync(CHROME)) opt.executablePath = CHROME;
  const b = await chromium.launch(opt);
  const ctx = await b.newContext({ viewport:{ width:LARGEUR, height:HAUTEUR }, deviceScaleFactor:1 });
  const p = await ctx.newPage();
  const pannes = []; p.on('pageerror', e => pannes.push(e.message));
  await p.goto('file://' + html);
  await p.waitForFunction(() => window.anime && document.fonts.status === 'loaded');
  await p.waitForTimeout(500);
  const nGestes = await verifierGestes(p);
  const lisible = await verifierLisibilite(p, DUREE);

  const total = Math.round(DUREE * fps);
  for (let i = 0; i < total; i++) {
    await p.evaluate(t => window.anime(t), i / fps);
    await p.screenshot({ path: path.join(images, String(i).padStart(5, '0') + '.png') });
  }
  if (pannes.length) throw new Error('La page du film a levé :\n' + pannes.join('\n'));
  await b.close();

  const mp4 = path.join(__dirname, 'ti-services.mp4');
  execFileSync('ffmpeg', ['-y', '-framerate', String(fps),
    '-i', path.join(images, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: ['ignore','ignore','pipe'] });
  fs.rmSync(images, { recursive: true, force: true });
  return { mp4, images: total, duree: DUREE, gestes: nGestes, lisible };
}

module.exports = { rendre, page, verifierPromesses, verifierCouleurs, verifierGestes, verifierLisibilite, montage, DUREE, LARGEUR, HAUTEUR, FPS, MONDE, surEcran };

if (require.main === module) {
  rendre({ recapturer: process.argv.indexOf('--sans-capture') < 0 })
    .then(r => console.log('film : ' + r.mp4 + ' — ' + r.images + ' images, ' + r.duree + ' s, ' +
      r.gestes + ' gestes, texte jamais sur une capture (' + r.lisible.mots + ' relevés)'))
    .catch(e => { console.error(e.message); process.exit(1); });
}
