#!/usr/bin/env node
/* SITEMAP — `node outils/sitemap.js`
 *
 * UNE SEULE MAIN L'ÉCRIT. Il était produit par le générateur des pages légales, qui ne
 * connaît que les siennes : le jour où d'autres pages sont apparues, elles étaient
 * absentes, et relancer ce générateur-là aurait effacé les nouvelles lignes. Le sitemap
 * n'appartient à aucun générateur, il appartient au SITE.
 *
 * ON NE TIENT AUCUNE LISTE. Le fichier se construit en PARCOURANT ce qui est réellement
 * servi : toute page HTML publiée y entre, sauf celles qui se déclarent `noindex` —
 * c'est la PAGE qui décide, pas une liste d'exclusions qui vieillirait mal.
 *
 * LA DATE VIENT DE GIT, pas du système de fichiers : dans un clone frais, tous les
 * fichiers portent la date du clone, et le sitemap annoncerait quarante pages modifiées
 * le même jour — un mensonge qui coûte la confiance qu'on essaie de gagner.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const SITE = 'https://ti-services.fr';
/* Dossiers hors du site servi (cf. `firebase.json` → hosting.ignore). */
const HORS = ['node_modules', '.git', '.github', 'functions', 'outils', 'tests', 'deploy',
  'capacitor', 'capacitor-android', 'tools'];

function pages(dossier, prefixe) {
  const out = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (e.name.startsWith('.') || HORS.indexOf(e.name) >= 0) continue;
    const rel = prefixe + e.name;
    if (e.isDirectory()) { out.push(...pages(path.join(dossier, e.name), rel + '/')); continue; }
    if (!e.name.endsWith('.html')) continue;
    const txt = fs.readFileSync(path.join(dossier, e.name), 'utf8');
    // La page décide : `noindex` quelque part dans sa tête et elle n'entre pas.
    if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(txt)) continue;
    out.push(rel);
  }
  return out;
}

function jourGit(rel) {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel],
      { cwd: RACINE, encoding: 'utf8' }).trim();
    if (d) return d;
  } catch (_) {}
  return new Date().toISOString().slice(0, 10);
}

/* Le rang d'une page dans le site, pas son importance absolue : l'accueil, puis les
   pages qui répondent à une recherche, puis les textes qu'on lit une fois. */
function rang(rel) {
  if (rel === 'index.html') return { loc: '/', freq: 'weekly', pri: '1.0' };
  if (/^(en\/)?services\/index\.html$/.test(rel)) return { loc: '/' + rel.replace(/index\.html$/, ''), freq: 'weekly', pri: '0.9' };
  if (/^(en\/)?services\//.test(rel)) return { loc: '/' + rel, freq: 'monthly', pri: '0.8' };
  if (/^legal\/|^legal\//.test(rel) || /\/legal\//.test(rel)) return { loc: '/' + rel, freq: 'yearly', pri: '0.3' };
  return { loc: '/' + rel, freq: 'monthly', pri: '0.5' };
}

function sitemap() {
  const rels = pages(RACINE, '').sort();
  const lignes = rels.map((rel) => {
    const r = rang(rel);
    return '  <url>\n    <loc>' + SITE + r.loc + '</loc>\n    <lastmod>' + jourGit(rel)
      + '</lastmod>\n    <changefreq>' + r.freq + '</changefreq>\n    <priority>' + r.pri + '</priority>\n  </url>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + lignes.join('\n') + '\n</urlset>\n';
}

if (require.main === module) {
  const x = sitemap();
  fs.writeFileSync(path.join(RACINE, 'sitemap.xml'), x);
  console.log('sitemap.xml · ' + (x.match(/<url>/g) || []).length + ' adresses');
}
module.exports = { sitemap, pages, SITE };
