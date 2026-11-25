/* CHARTE GRAPHIQUE TI-SERVICES — document à transmettre (l'éditeur, 25/11/2026).
 * « La charte doit être plus précise afin de pouvoir la transmettre à un service
 * marketing, par exemple pour des logos, des enseignes, de la pub. »
 * Produit, dans SORTIE :
 *   Charte-graphique-Ti-Services.pdf  (A4 paysage)
 *   apercu/page-NN.png                (pour relire sans ouvrir le PDF)
 *   logos/*.svg et logos/png/*.png    (vectoriels + PNG transparents 2400 px)
 * Prérequis : python3 outils/charte/logos.py (fontTools), police Inter installée.
 *   node outils/charte/charte.js [SORTIE] */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const ICI = __dirname;
const SORTIE = process.argv[2] || path.join(ICI, 'sortie');
const VERSION = 'Version 1 · proposition · 25 novembre 2026';

/* ── Couleurs : une seule table, d'où sortent les nuanciers, les contrastes et les CMJN ── */
const C = {
  corail: { hex: '#FF6A5B', nom: 'Corail', us: 'Zouti, aplats, bouton principal (fond)' },
  profond: { hex: '#CE301C', nom: 'Corail profond', us: '« Ti » du nom, liens, montants, titres de rubrique' },
  encre: { hex: '#231E33', nom: 'Encre', us: 'Textes, « -Services », fonds sombres' },
  sable: { hex: '#FBF7F4', nom: 'Sable', us: 'Fond principal' },
  blanc: { hex: '#FFFFFF', nom: 'Blanc', us: 'Cartes, textes sur fond sombre' },
  encreLogo: { hex: '#2A2340', nom: 'Encre Zouti', us: 'Contours et yeux de Zouti (seulement)' },
  jaune: { hex: '#FFC24B', nom: 'Jaune étoile', us: 'Étoile de Zouti, rares touches festives' },
  joue: { hex: '#FF9B8F', nom: 'Rose joues', us: 'Joues de Zouti (seulement)' },
  vert: { hex: '#0E7B4F', nom: 'Vert', us: 'Interface : fait, payé, validé' },
  rouge: { hex: '#E5484D', nom: 'Rouge', us: 'Interface : erreur, danger, suppression' },
  ambre: { hex: '#A26A0C', nom: 'Ambre', us: 'Interface : attention' },
  gris: { hex: '#766F7D', nom: 'Gris', us: 'Mentions, textes secondaires' },
  filet: { hex: '#EEE5DF', nom: 'Filet', us: 'Bordures, séparateurs' },
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const cmjn = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); const k = 1 - Math.max(r, g, b); if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100)); };
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const L = (f) => fs.readFileSync(path.join(SORTIE, 'logos', f), 'utf8').replace(/ width="\d+" height="\d+"/, '');
const logo = (f, style) => `<span class="lg" style="${style || ''}">${L(f)}</span>`;

function pages() {
  const P = [];
  const page = (titre, corps, num) => P.push(`<section class="page">${titre ? `<header><span class="rub">${titre}</span><span class="pied">Ti-Services · Charte graphique</span></header>` : ''}${corps}<footer>${VERSION}<span>${P.length + 1}</span></footer></section>`);

  // 1. Couverture
  P.push(`<section class="page couv"><div class="couv-l">${logo('ti-services-logo-couleur.svg', 'height:34mm')}
    <h1>Charte graphique</h1><p class="sous">Logo, couleurs, typographie, règles d’usage</p></div>
    <div class="couv-b"><span>${VERSION}</span><span>Éditeur : C.C.S, Construction Conseils et Services</span></div></section>`);

  // 2. Le logo
  page('1 · Le logo', `<h2>Trois versions, une seule marque</h2>
    <div class="g3">
      <div class="case"><div class="vi" style="background:var(--sable)">${logo('ti-services-logo-couleur.svg', 'height:22mm')}</div><b>Logo principal</b><p>Zouti et le nom. À utiliser partout où la place le permet : enseigne, affiche, site, en-tête de document.</p></div>
      <div class="case"><div class="vi" style="background:var(--sable)">${logo('ti-services-zouti-couleur.svg', 'height:30mm')}</div><b>Zouti seule</b><p>L’icône de l’application, les avatars de réseaux sociaux, les petits formats carrés.</p></div>
      <div class="case"><div class="vi" style="background:var(--sable)">${logo('ti-services-nom-couleur.svg', 'height:13mm')}</div><b>Nom seul</b><p>Quand Zouti est déjà présente ailleurs sur le support, ou en très petit sur une ligne de texte.</p></div>
    </div>
    <p class="note">Le nom est livré <b>vectorisé</b> (contours) : aucune police n’est nécessaire pour l’imprimer. Ne jamais le recomposer au clavier.</p>`);

  // 3. Zone de protection et tailles minimales
  page('1 · Le logo', `<h2>Zone de protection et tailles minimales</h2>
    <div class="g2">
      <div><div class="zp"><span class="x x1">x</span><span class="x x2">x</span><span class="x x3">x</span><span class="x x4">x</span>
        <div class="zp-in">${logo('ti-services-logo-couleur.svg', 'height:26mm')}</div></div>
        <p><b>x = hauteur du « T » de Ti-Services.</b> Aucun texte, bord de support ou autre image ne pénètre dans cette marge, de chaque côté.</p></div>
      <div><table class="t">
        <tr><th>Version</th><th>Imprimé</th><th>Écran</th></tr>
        <tr><td>Logo principal</td><td>35 mm de large</td><td>140 px de large</td></tr>
        <tr><td>Zouti seule</td><td>10 mm de haut</td><td>32 px de haut</td></tr>
        <tr><td>Nom seul</td><td>25 mm de large</td><td>100 px de large</td></tr></table>
        <p class="note">En dessous de ces tailles, les yeux de Zouti et le trait d’union ne se lisent plus. Sur un très petit format, utiliser Zouti seule.</p></div></div>`);

  // 4. Fonds et interdits
  const interdit = (contenu, txt) => `<div class="int"><div class="vi2">${contenu}</div><span>✕ ${txt}</span></div>`;
  page('1 · Le logo', `<h2>Sur quel fond</h2>
    <div class="g3">
      <div class="case"><div class="vi" style="background:var(--sable)">${logo('ti-services-logo-couleur.svg', 'height:16mm')}</div><b>Couleur</b><p>Sur sable ou blanc.</p></div>
      <div class="case"><div class="vi" style="background:var(--encre)">${logo('ti-services-logo-negatif.svg', 'height:16mm')}</div><b>Négatif</b><p>Sur encre ou fond sombre uni. « Ti » passe en corail, « -Services » en blanc.</p></div>
      <div class="case"><div class="vi" style="background:var(--corail)">${logo('ti-services-logo-blanc.svg', 'height:16mm')}</div><b>Blanc</b><p>Sur corail, sur photo sombre, en gravure ou en marquage une couleur.</p></div></div>
    <h3>À ne pas faire</h3>
    <div class="g6">
      ${interdit(logo('ti-services-logo-couleur.svg', 'height:7mm;transform:scaleX(1.3)'), 'Déformer')}
      ${interdit(logo('ti-services-logo-couleur.svg', 'height:9mm;filter:hue-rotate(160deg)'), 'Changer les couleurs')}
      ${interdit(logo('ti-services-logo-couleur.svg', 'height:9mm;transform:rotate(-12deg)'), 'Pivoter')}
      ${interdit(logo('ti-services-logo-couleur.svg', 'height:9mm;filter:drop-shadow(2px 3px 2px rgba(0,0,0,.6))'), 'Ajouter ombre ou contour')}
      <div class="int"><div class="vi2" style="background:var(--corail)">${logo('ti-services-logo-couleur.svg', 'height:9mm')}</div><span>✕ Couleur sur corail</span></div>
      ${interdit(`<span style="font:800 15px Inter;letter-spacing:.04em;color:var(--encre)">TI SERVICES</span>`, 'Réécrire le nom')}
    </div>`);

  // 5. Couleurs
  const sw = (k, grand) => { const c = C[k]; const [r, g, b] = rgb(c.hex); const [cc, m, j, n] = cmjn(c.hex);
    return `<div class="sw${grand ? ' gr' : ''}"><i style="background:${c.hex}"></i><b>${c.nom}</b><span class="us">${c.us}</span>
      <span class="code">HEX ${c.hex}<br>RVB ${r} ${g} ${b}<br>CMJN ${cc} ${m} ${j} ${n}</span></div>`; };
  page('2 · Couleurs', `<h2>Couleurs de la marque</h2>
    <div class="g5">${['corail', 'profond', 'encre', 'sable', 'blanc'].map((k) => sw(k, true)).join('')}</div>
    <h3>Proportions sur un support</h3>
    <div class="prop"><span style="flex:6;background:var(--sable)">Sable / blanc · 60 %</span><span style="flex:3;background:var(--encre);color:#fff">Encre · 30 %</span><span style="flex:1;background:var(--corail);color:#fff">Corail · 10 %</span></div>
    <p class="note">CMJN : conversion théorique, sans profil d’impression. L’imprimeur cale les valeurs sur une épreuve (BAT) ; le choix d’une référence Pantone se fait avec lui, sur nuancier.</p>`);
  page('2 · Couleurs', `<h2>Couleurs de Zouti et de l’interface</h2>
    <div class="g4">${['encreLogo', 'jaune', 'joue'].map((k) => sw(k)).join('')}<div></div></div>
    <p class="note" style="margin:2mm 0 5mm">Les couleurs de Zouti ne servent qu’à Zouti (et le jaune, en rare touche festive).</p>
    <div class="g4">${['vert', 'rouge', 'ambre', 'gris'].map((k) => sw(k)).join('')}</div>
    <p class="note" style="margin-top:2mm">Couleurs d’état de l’application. Elles ne portent pas la marque : jamais en aplat sur un support publicitaire.</p>`);

  // 6. Contrastes
  const paires = [['encre', 'sable', 'Texte courant'], ['profond', 'blanc', 'Lien, montant, « Ti »'], ['blanc', 'encre', 'Texte sur fond sombre'], ['blanc', 'profond', 'Texte sur bouton corail profond'],
    ['blanc', 'corail', 'Texte blanc sur corail'], ['corail', 'blanc', 'Corail sur blanc'], ['gris', 'sable', 'Mention'], ['encre', 'corail', 'Encre sur corail']];
  page('2 · Couleurs', `<h2>Lisibilité : quelles couleurs pour un texte</h2>
    <table class="t ct"><tr><th>Texte</th><th>Fond</th><th>Exemple</th><th>Contraste</th><th>Usage</th></tr>
    ${paires.map(([t, f, us]) => { const r = contraste(C[t].hex, C[f].hex); const v = r >= 4.5 ? 'Tout texte' : (r >= 3 ? 'Gros titre seulement (≥ 18 pt gras)' : 'Jamais pour du texte');
      return `<tr><td>${C[t].nom}</td><td>${C[f].nom}</td><td><span class="ex" style="color:${C[t].hex};background:${C[f].hex}">Ti-Services 112,00 €</span></td><td><b>${r.toFixed(1)} : 1</b></td><td class="${r >= 4.5 ? 'ok' : (r >= 3 ? 'moy' : 'ko')}">${v}</td></tr>`; }).join('')}</table>
    <p class="note">Seuils WCAG 2.1 (niveau AA) : 4,5 : 1 pour un texte courant, 3 : 1 pour un grand texte. Le corail est une couleur d’aplat et de Zouti, pas une couleur de texte.</p>`);

  // 7. Typographie
  page('3 · Typographie', `<h2>Une famille : Inter</h2>
    <div class="g2">
      <div><p class="spec" style="font:800 30pt/1.05 'Inter Display';letter-spacing:-.02em">Inter Display<br>ExtraBold</p>
        <p class="us2">Titres, accroches, le nom Ti-Services.</p>
        <p class="spec" style="font:400 16pt/1.3 Inter">Inter Regular · <b style="font-weight:600">SemiBold</b> · <b style="font-weight:700">Bold</b></p>
        <p class="us2">Textes, listes, mentions.</p>
        <p class="alph">Aa Bb Cc Dd Ee Ff Gg Hh Ii Jj Kk Ll Mm Nn Oo Pp Qq Rr Ss Tt Uu Vv Ww Xx Yy Zz<br>à â é è ê ë î ï ô ù û ü ç œ É À Ç · 0 1 2 3 4 5 6 7 8 9 · € % & @ « »</p></div>
      <div><table class="t"><tr><th>Imprimé</th><th>Taille</th><th>Graisse</th></tr>
        <tr><td>Titre</td><td>36 pt</td><td>Display ExtraBold</td></tr><tr><td>Sous-titre</td><td>18 pt</td><td>Bold</td></tr>
        <tr><td>Texte</td><td>10 à 11 pt</td><td>Regular</td></tr><tr><td>Mention</td><td>8 pt</td><td>Regular</td></tr></table>
        <table class="t" style="margin-top:4mm"><tr><th>Écran (application)</th><th>Taille</th><th>Graisse</th></tr>
        <tr><td>Titre d’écran</td><td>30 px</td><td>800</td></tr><tr><td>Montant principal</td><td>22 px</td><td>800</td></tr><tr><td>Intertitre</td><td>18 px</td><td>700</td></tr>
        <tr><td>Bouton, champ</td><td>16 px</td><td>700</td></tr><tr><td>Texte courant</td><td>14 px</td><td>400</td></tr><tr><td>Mention, pastille</td><td>12 px</td><td>700</td></tr></table></div></div>
    <p class="note">Inter est une police libre (licence SIL Open Font License) : usage commercial, impression, web et vectorisation permis. Téléchargement : rsms.me/inter.</p>`);

  // 8. Écriture
  page('4 · Écrire', `<h2>Le nom et le ton</h2><div class="g2">
    <div><h3>Le nom</h3><p class="bon">✓ Ti-Services</p><p class="mauv">✕ Ti Services · TI-SERVICES · TiServices · ti-services</p>
      <p>Un trait d’union, un T et un S majuscules, partout, y compris dans une phrase. En lettres capitales seulement dans un sur-titre court.</p>
      <h3>La signature</h3><p class="sig">Services à la demande · Saint-Barthélemy</p>
      <h3>La mascotte</h3><p>Elle s’appelle <b>Zouti</b>. Elle accompagne, elle ne parle pas à la place de la marque.</p></div>
    <div><h3>Le ton</h3><ul>
      <li><b>On vouvoie.</b></li><li><b>Phrases courtes.</b> On dit le fait et le geste, pas la mécanique.</li>
      <li><b>Rien qui n’existe pas.</b> Une affiche, une publicité ou un site ne promettent que ce que l’application fait vraiment.</li>
      <li><b>Saint-Barthélemy d’abord.</b> Les prestataires sont sur l’île ; les lieux s’écrivent comme sur l’île (Gustavia, Lorient, Saint-Jean…).</li>
      <li><b>Quatre langues.</b> Français, anglais, espagnol, portugais : un support traduit l’est en entier.</li></ul></div></div>`);

  // 9. Interface
  page('5 · Application', `<h2>Dans l’application</h2><div class="g2" style="align-items:start">
    <div class="pl">${['0%', '100%'].map((y) => `<div style="background-image:url(data:image/png;base64,${fs.readFileSync(path.join(ICI, 'planche-interface.png')).toString('base64')});background-position:0 ${y}"></div>`).join('')}</div>
    <div><ul>
      <li><b>6 tailles de texte</b>, <b>3 graisses</b> (voir page Typographie).</li>
      <li><b>3 sortes de boutons</b> : principal (plein corail, un seul par écran), secondaire (blanc bordé), lien (souligné). Hauteur 52 px, ou 44 px en compact.</li>
      <li><b>3 arrondis</b> : 12 px (boutons, champs, bandeaux), 18 px (cartes), pastille.</li>
      <li><b>Bandeau d’information</b> en corail pâle, <b>bandeau d’alerte</b> en rouge pâle, toujours pour une action à mener.</li>
      <li>Le rouge signale un danger ou une erreur ; un bouton qui détruit est un lien rouge.</li></ul></div></div>`);

  // 10. Exemples
  page('6 · Exemples', `<h2>Exemples d’application</h2>
    <div class="ex3">
      <div><div class="ens">${logo('ti-services-logo-negatif.svg', 'height:15mm')}<span>Services à la demande · Saint-Barthélemy</span></div><b>Enseigne, bandeau</b><p>Fond encre, logo négatif, signature en blanc.</p></div>
      <div><div class="fly"><div class="fz">${logo('ti-services-zouti-couleur.svg', 'height:24mm')}</div><div class="ft">Un prestataire de l’île, quand vous en avez besoin.</div>
        <div class="fl">Ménage · Jardinage · Garde d’enfants · Coiffure à domicile · Dépannage · Massage · Garde d’animaux · Livraison de colis</div>
        <div class="fp">Paiement après la prestation.</div><div class="fn">${logo('ti-services-nom-couleur.svg', 'height:5mm')}<span>ti-services.fr</span></div></div><b>Flyer A5</b><p>Fond sable, Zouti, une phrase, la liste des services.</p></div>
      <div><div class="res">${logo('ti-services-zouti-blanc.svg', 'height:20mm')}<div>Ménage, jardin, enfants :<br>un prestataire de l’île.</div>${logo('ti-services-nom-blanc.svg', 'height:5mm')}</div><b>Publication carrée</b><p>Fond corail, Zouti et nom en blanc, phrase en encre ou blanc gras.</p></div></div>`);

  // 11. Fichiers et points à valider
  page('7 · Fichiers', `<h2>Fichiers fournis</h2><div class="g2">
    <div><table class="t"><tr><th>Fichier</th><th>Usage</th></tr>
      <tr><td>ti-services-logo-couleur / negatif / blanc</td><td>Logo principal</td></tr>
      <tr><td>ti-services-zouti-couleur / blanc</td><td>Zouti seule</td></tr>
      <tr><td>ti-services-nom-couleur / negatif / blanc</td><td>Nom seul</td></tr></table>
      <p class="note">Chaque fichier existe en <b>SVG</b> (vectoriel : impression, enseigne, découpe) et en <b>PNG</b> transparent de 2400 px (bureautique, réseaux sociaux).</p></div>
    <div><h3>Points à valider par l’éditeur</h3><ol class="av">
      <li><b>Police de marque : Inter.</b> L’application affiche aujourd’hui la police du téléphone (San Francisco sur iPhone) : faut-il y charger Inter, pour que l’écran ressemble aux supports ?</li>
      <li><b>« Ti » en corail profond</b> sur fond clair, comme dans l’en-tête de l’application. La facture PDF l’écrit aujourd’hui en corail clair : elle s’alignerait.</li>
      <li><b>Deux encres</b> : #231E33 (textes) et #2A2340 (contours de Zouti), presque identiques. Les garder, ou n’en garder qu’une ?</li>
      <li><b>Boutons verts</b> de l’application (17 aujourd’hui) : deviennent-ils des boutons principaux corail ?</li></ol></div></div>`);
  return P;
}

const CSS = `
@page{size:297mm 210mm;margin:0}
:root{--corail:${C.corail.hex};--profond:${C.profond.hex};--encre:${C.encre.hex};--sable:${C.sable.hex};--filet:${C.filet.hex};--gris:${C.gris.hex}}
*{box-sizing:border-box}body{margin:0;font:400 10.5pt/1.45 Inter;color:var(--encre);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:297mm;height:210mm;padding:14mm 18mm 16mm;position:relative;overflow:hidden;page-break-after:always;background:#fff}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:.3mm solid var(--filet);padding-bottom:3mm;margin-bottom:7mm}
.rub{font:700 9pt Inter;letter-spacing:.09em;text-transform:uppercase;color:var(--profond)}.pied{font-size:8pt;color:var(--gris)}
footer{position:absolute;left:18mm;right:18mm;bottom:8mm;display:flex;justify-content:space-between;font-size:7.5pt;color:var(--gris)}
h1{font:800 44pt/1 'Inter Display';letter-spacing:-.02em;margin:16mm 0 4mm}h2{font:800 24pt/1.1 'Inter Display';letter-spacing:-.015em;margin:0 0 7mm}
h3{font:700 12pt Inter;margin:6mm 0 3mm}p{margin:0 0 2.5mm}.note{font-size:9pt;color:var(--gris);margin-top:5mm}
.lg{display:inline-block;line-height:0}.lg svg{height:100%;width:auto}
.couv{background:var(--sable);display:flex;flex-direction:column;justify-content:space-between;padding:26mm 24mm 16mm}
.couv .sous{font-size:15pt;color:var(--gris)}.couv-b{display:flex;justify-content:space-between;font-size:9pt;color:var(--gris)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12mm}.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:6mm}.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:5mm}.g6{display:grid;grid-template-columns:repeat(6,1fr);gap:4mm}
.case p{font-size:9pt;color:#4E4757}.case b{display:block;margin:3mm 0 1mm}
.vi{height:42mm;border-radius:3mm;display:flex;align-items:center;justify-content:center;border:.3mm solid var(--filet)}
.int{text-align:center;font-size:8.5pt;color:#BE343B;font-weight:600}.vi2{height:22mm;border-radius:2mm;display:flex;align-items:center;justify-content:center;background:var(--sable);border:.3mm solid var(--filet);margin-bottom:2mm;overflow:hidden}
.zp{position:relative;display:inline-block;padding:9mm;border:.4mm dashed var(--corail);margin:4mm 0 5mm}.zp-in{outline:.3mm solid var(--filet)}
.x{position:absolute;font:700 8pt Inter;color:var(--corail)}.x1{top:2.5mm;left:50%}.x2{bottom:2.5mm;left:50%}.x3{left:3mm;top:50%}.x4{right:3mm;top:50%}
.t{border-collapse:collapse;width:100%;font-size:9.5pt}.t th{text-align:left;font-weight:700;border-bottom:.4mm solid var(--encre);padding:2mm 3mm 2mm 0}.t td{border-bottom:.3mm solid var(--filet);padding:2mm 3mm 2mm 0;vertical-align:middle}
.sw i{display:block;height:24mm;border-radius:3mm;border:.3mm solid var(--filet);margin-bottom:2.5mm}.sw.gr i{height:34mm}
.sw b{display:block;font-size:11pt}.sw .us{display:block;font-size:8.5pt;color:#4E4757;min-height:9mm;margin:1mm 0 2mm}.sw .code{display:block;font:500 8.5pt/1.5 'DejaVu Sans Mono',monospace}
.prop{display:flex;height:13mm;border-radius:3mm;overflow:hidden;border:.3mm solid var(--filet);font-size:8.5pt;font-weight:700}.prop span{display:flex;align-items:center;padding-left:3mm}
.ct .ex{display:inline-block;padding:1.5mm 3mm;border-radius:1.5mm;font-weight:700;border:.3mm solid var(--filet)}.ok{color:#0E7B4F;font-weight:700}.moy{color:#A26A0C;font-weight:700}.ko{color:#BE343B;font-weight:700}
.spec{margin:0 0 1mm}.us2{font-size:9pt;color:var(--gris);margin-bottom:6mm}.alph{font-size:11pt;line-height:1.6;margin-top:4mm}
.bon{font:800 18pt 'Inter Display';color:#0E7B4F;margin:0 0 1mm}.mauv{font:600 11pt Inter;color:#BE343B;text-decoration:line-through;margin-bottom:3mm}
.sig{font:600 13pt Inter}ul,ol{margin:0;padding-left:5mm}li{margin-bottom:2.5mm}.av li{font-size:9.5pt}
.ex3{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:9mm;align-items:start}.ex3 b{display:block;margin-top:3mm}.ex3 p{font-size:9pt;color:#4E4757}
.ens{background:var(--encre);height:40mm;border-radius:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4mm;color:#fff;font:600 9.5pt Inter}
.fly{background:var(--sable);border:.3mm solid var(--filet);border-radius:2mm;aspect-ratio:148/210;padding:6mm;display:flex;flex-direction:column;gap:3mm;font-size:7.5pt;width:62mm}
.fz{text-align:center}.ft{font:800 13pt/1.1 'Inter Display';letter-spacing:-.01em}.fl{color:#4E4757;line-height:1.5}.fp{font-weight:700;color:var(--profond)}
.fn{margin-top:auto;display:flex;flex-direction:column;align-items:flex-start;gap:1.5mm;font-weight:600}
.pl{display:flex;gap:4mm}.pl div{width:62mm;height:140mm;background-size:62mm auto;background-repeat:no-repeat;border-radius:3mm;border:.3mm solid var(--filet)}
.res{background:var(--corail);aspect-ratio:1;border-radius:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4mm;color:#fff;font:800 12pt/1.15 'Inter Display';text-align:center;width:62mm}
`;

(async () => {
  fs.mkdirSync(path.join(SORTIE, 'apercu'), { recursive: true });
  fs.mkdirSync(path.join(SORTIE, 'logos', 'png'), { recursive: true });
  execFileSync('python3', [path.join(ICI, 'logos.py'), path.join(SORTIE, 'logos')], { stdio: 'inherit' });
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);

  // PNG transparents des logos (2400 px sur le grand côté)
  const pl = await b.newPage();
  for (const f of fs.readdirSync(path.join(SORTIE, 'logos')).filter((x) => x.endsWith('.svg'))) {
    const s = fs.readFileSync(path.join(SORTIE, 'logos', f), 'utf8');
    const [w, h] = s.match(/viewBox="([^"]+)"/)[1].split(/\s+/).slice(2).map(Number);
    const k = 2400 / Math.max(w, h);
    await pl.setViewportSize({ width: Math.round(w * k), height: Math.round(h * k) });
    await pl.setContent(`<body style="margin:0;background:transparent">${s.replace(/ width="\d+" height="\d+"/, ` width="${Math.round(w * k)}" height="${Math.round(h * k)}"`)}</body>`);
    await pl.screenshot({ path: path.join(SORTIE, 'logos', 'png', f.replace('.svg', '.png')), omitBackground: true });
  }

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Charte graphique Ti-Services</title><style>${CSS}</style></head><body>${pages().join('')}</body></html>`;
  fs.writeFileSync(path.join(SORTIE, 'charte.html'), html);
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.pdf({ path: path.join(SORTIE, 'Charte-graphique-Ti-Services.pdf'), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  // Aperçus : chaque page à 1123 × 794 px (A4 paysage à 96 dpi)
  await p.setViewportSize({ width: 1123, height: 794 });
  await p.emulateMedia({ media: 'print' });
  const n = await p.evaluate(() => document.querySelectorAll('.page').length);
  for (let i = 0; i < n; i++) {
    const el = (await p.$$('.page'))[i];
    await el.screenshot({ path: path.join(SORTIE, 'apercu', `page-${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log(n + ' pages →', path.join(SORTIE, 'Charte-graphique-Ti-Services.pdf'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
