#!/usr/bin/env node
/* GÉNÉRATEUR DES PAGES LÉGALES STATIQUES — `node outils/pages-legales.js`
 *
 * POURQUOI. Les six textes vivent dans `index.html`, en constantes `LEGAL_*`, et ne
 * s'affichent qu'une fois l'application exécutée. Un moteur de recherche qui suit
 * `?legal=cgu` reçoit donc la même coquille que tout le monde et doit faire tourner
 * soixante mille lignes de JavaScript pour voir trois paragraphes de mentions légales.
 * Ces pages sont écrites une fois pour toutes, servies telles quelles, lisibles sans
 * JavaScript — et c'est aussi ce qui les rend consultables par quelqu'un qui bloque les
 * scripts, ou par un navigateur d'un autre âge.
 *
 * UNE SEULE SOURCE. On ne RECOPIE pas les textes : on les LIT dans `index.html`. Deux
 * copies d'un texte juridique divergent, et c'est la copie oubliée qui part chez le
 * client. `tests/harn/test-pages-legales.js` regénère et compare : un texte modifié sans
 * régénération fait rougir l'épreuve.
 *
 * CE QU'ON N'ÉCRIT PAS. Aucune position juridique n'est inventée ici, aucune phrase
 * ajoutée : le générateur habille, il ne rédige pas. */
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SITE = 'https://ti-services.fr';

// Les six documents, dans l'ordre où on les propose au visiteur. La clé est celle que
// `?legal=…` emploie déjà — celle des fiches App Store et Play Store : un seul vocabulaire.
const DOCS = [
  {cle: 'mentions',        c: 'LEGAL_MENTIONS',    fr: 'Mentions légales',                        en: 'Legal notice',        pt: 'Menções legais'},
  {cle: 'cgu',             c: 'LEGAL_CGU',         fr: 'Conditions Générales d’Utilisation',      en: 'Terms of Use',        pt: 'Condições Gerais de Utilização'},
  {cle: 'cgv',             c: 'LEGAL_CGV',         fr: 'Conditions Générales de Vente',           en: 'Terms of Sale',       pt: 'Condições Gerais de Venda'},
  {cle: 'confidentialite', c: 'LEGAL_PRIVACY',     fr: 'Politique de confidentialité',            en: 'Privacy Policy',      pt: 'Política de privacidade'},
  {cle: 'charte',          c: 'LEGAL_CHARTE',      fr: 'Charte de responsabilité du prestataire', en: 'Provider charter',    pt: 'Carta do prestador'},
  {cle: 'suppression',     c: 'LEGAL_SUPPRESSION', fr: 'Suppression de compte',                   en: 'Account deletion',    pt: 'Eliminação de conta'},
];
const LANGUES = [
  {lg: 'fr', suf: '',     dossier: 'legal',    retour: 'Retour à Ti-Services', autres: 'Les autres documents'},
  {lg: 'en', suf: '_EN',  dossier: 'legal/en', retour: 'Back to Ti-Services',  autres: 'Other documents'},
  {lg: 'pt', suf: '_PT',  dossier: 'legal/pt', retour: 'Voltar à Ti-Services', autres: 'Os outros documentos'},
];

const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

function constante(nom) {
  // Les constantes sont des gabarits sans interpolation : on prend tout jusqu'au
  // backquote qui ferme. Si l'une d'elles en gagnait une un jour, on le DIT au lieu
  // d'écrire un texte tronqué dans une page publique.
  const i = src.indexOf('const ' + nom + '=`');
  if (i < 0) throw new Error('constante introuvable : ' + nom);
  const deb = i + ('const ' + nom + '=`').length;
  const fin = src.indexOf('`;', deb);
  if (fin < 0) throw new Error('constante non fermée : ' + nom);
  const txt = src.slice(deb, fin);
  if (/\$\{/.test(txt)) throw new Error('interpolation dans ' + nom + ' : la page serait fausse');
  return txt.trim();
}
function valeur(nom) {
  const m = new RegExp('const ' + nom + "='([^']*)'").exec(src);
  if (!m) throw new Error('valeur introuvable : ' + nom);
  return m[1];
}
const VERSION = valeur('TERMS_VERSION');
const DATE_FR = valeur('TERMS_DATE');

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Le résumé de la page est la PREMIÈRE PHRASE du document, débarrassée de ses balises —
 * pas une phrase écrite à la main, qui vieillirait sans que personne s'en aperçoive. On
 * coupe sur un mot entier : un résumé tronqué au milieu d'un mot s'affiche tel quel dans
 * un résultat de recherche. */
function resume(html, repli) {
  // On prend le premier PARAGRAPHE, pas le début du document : la plupart des textes
  // s'ouvrent sur un intertitre, et « 1. Éditeur Le présent service… » est ce qu'aurait
  // lu quelqu'un dans un résultat de recherche. Le retrait des balises laisse des
  // espaces devant la ponctuation (« C.C.S , société ») : on les referme.
  const par = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const brut = (par ? par[1] : html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1').trim();
  if (!brut) return repli;
  let t = brut.slice(0, 158);
  if (brut.length > 158) t = t.slice(0, t.lastIndexOf(' ')) + '…';
  return t;
}

const STYLE = `:root{--sable:#FBF7F4;--papier:#fff;--encre:#231E33;--doux:#4E4757;--gris:#766F7D;--filet:#EEE5DF;--corail:#CE301C}
@media(prefers-color-scheme:dark){:root{--sable:#191320;--papier:#221B2B;--encre:#F3EFF7;--doux:#CFC7D8;--gris:#A79FB2;--filet:#3A3145;--corail:#FF8C7C}}
*{box-sizing:border-box}
body{margin:0;background:var(--sable);color:var(--encre);font:16px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
.enveloppe{max-width:720px;margin:0 auto;padding:22px 18px 56px}
header{display:flex;align-items:center;gap:11px;padding-bottom:16px;border-bottom:1px solid var(--filet)}
header img{width:38px;height:38px;border-radius:10px;display:block}
header b{font-size:17px;letter-spacing:-.01em}
header span{display:block;font-size:12.5px;color:var(--gris);font-weight:400;letter-spacing:0}
h1{font-size:25px;line-height:1.25;letter-spacing:-.02em;margin:24px 0 4px}
.v{font-size:12.5px;color:var(--gris);margin:0 0 22px}
h2{font-size:16px;margin:26px 0 6px;letter-spacing:-.01em}
p,li{color:var(--doux)}
p{margin:0 0 11px}
ul,ol{margin:0 0 11px;padding-left:22px}
b{color:var(--encre)}
a{color:var(--corail)}
article{font-size:15px}
nav.autres{margin-top:34px;padding-top:18px;border-top:1px solid var(--filet)}
nav.autres b{display:block;font-size:13px;margin-bottom:8px}
nav.autres a{display:block;padding:7px 0;font-size:14.5px;text-decoration:none;border-bottom:1px solid var(--filet)}
nav.autres a:last-of-type{border-bottom:0}
.retour{display:inline-block;margin-top:22px;font-size:14.5px;font-weight:650;text-decoration:none}
footer{margin-top:26px;font-size:12.5px;color:var(--gris)}
.langues{margin-top:10px;font-size:12.5px}
.langues a{margin-right:12px;text-decoration:none}`;

function page(doc, L) {
  const titre = doc[L.lg];
  const corps = constante(doc.c + L.suf).replace(/<(\/?)h3>/g, '<$1h2>');
  const chemin = (L.dossier === 'legal' ? 'legal' : L.dossier) + '/' + doc.cle + '.html';
  const url = SITE + '/' + chemin;
  const alt = LANGUES.map((x) => `<link rel="alternate" hreflang="${x.lg}" href="${SITE}/${x.dossier}/${doc.cle}.html">`).join('\n');
  const autres = DOCS.filter((d) => d.cle !== doc.cle)
    .map((d) => `<a href="${d.cle}.html">${esc(d[L.lg])}</a>`).join('\n      ');
  const langues = LANGUES.filter((x) => x.lg !== L.lg)
    .map((x) => `<a href="${SITE}/${x.dossier}/${doc.cle}.html" hreflang="${x.lg}">${x.lg.toUpperCase()}</a>`).join('');
  const desc = resume(corps, titre + ' — Ti-Services, Saint-Barthélemy.');
  const racine = L.dossier === 'legal' ? '../' : '../../';
  const dateAff = L.lg === 'fr' ? DATE_FR : DATE_FR;
  // La déclaration d'encodage doit tenir dans le PREMIER kibioctet de la réponse : au-delà
  // le navigateur devine, et une page française devinée en latin-1 s'affiche en mojibake
  // avant qu'on ait lu un mot. Elle est donc la toute première balise.
  return `<!doctype html>
<html lang="${L.lg}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titre)} — Ti-Services</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${url}">
${alt}
<link rel="alternate" hreflang="x-default" href="${SITE}/legal/${doc.cle}.html">
<link rel="icon" type="image/png" href="${racine}icon-192.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Ti-Services">
<meta property="og:locale" content="${L.lg === 'fr' ? 'fr_FR' : (L.lg === 'pt' ? 'pt_PT' : 'en_US')}">
<meta property="og:title" content="${esc(titre)} — Ti-Services">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLE}</style>
</head>
<body>
<div class="enveloppe">
  <header>
    <img src="${racine}icon-192.png" width="38" height="38" alt="">
    <b>Ti-Services<span>Services à la demande · Saint-Barthélemy</span></b>
  </header>
  <h1>${esc(titre)}</h1>
  <p class="v">Version ${esc(VERSION)} · ${esc(dateAff)}</p>
  <article>
${corps}
  </article>
  <nav class="autres">
    <b>${esc(L.autres)}</b>
      ${autres}
  </nav>
  <a class="retour" href="${racine}">← ${esc(L.retour)}</a>
  <div class="langues">${langues}</div>
  <footer>© 2026 C.C.S — Ti-Services™. Tous droits réservés.</footer>
</div>
</body>
</html>
`;
}

function sitemap(jour) {
  const u = [];
  u.push({loc: SITE + '/', freq: 'weekly', pri: '1.0'});
  DOCS.forEach((d) => LANGUES.forEach((L) =>
    u.push({loc: SITE + '/' + L.dossier + '/' + d.cle + '.html', freq: 'yearly', pri: '0.3'})));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + u.map((x) => `  <url>\n    <loc>${x.loc}</loc>\n    <lastmod>${jour}</lastmod>\n    <changefreq>${x.freq}</changefreq>\n    <priority>${x.pri}</priority>\n  </url>`).join('\n')
    + '\n</urlset>\n';
}

function rendu(jour) {
  const out = {};
  LANGUES.forEach((L) => DOCS.forEach((d) => { out[L.dossier + '/' + d.cle + '.html'] = page(d, L); }));
  out['sitemap.xml'] = sitemap(jour);
  return out;
}

module.exports = {rendu, DOCS, LANGUES, constante};

if (require.main === module) {
  // La date du sitemap est celle de la dernière retouche des textes, pas celle du jour :
  // annoncer « modifié aujourd'hui » à chaque exécution est le mensonge qu'un `lastmod`
  // sert précisément à éviter.
  const jour = process.argv[2] || new Date().toISOString().slice(0, 10);
  const fichiers = rendu(jour);
  Object.keys(fichiers).forEach((f) => {
    const dest = path.join(RACINE, f);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, fichiers[f]);
    console.log('écrit  ' + f + '  (' + Buffer.byteLength(fichiers[f]) + ' octets)');
  });
}
