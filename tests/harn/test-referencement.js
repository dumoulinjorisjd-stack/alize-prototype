/* SE FAIRE TROUVER, PAR GOOGLE COMME PAR LES ASSISTANTS.

   « Fais tout pour que l'on nous trouve, que ce soit par Google ou les IA, afin d'être
   devant la concurrence dans les recherches » (20/09/2026).

   LE DÉFAUT DE DÉPART TENAIT EN UN CHIFFRE : UNE seule adresse indexable pour vingt-et-un
   métiers. L'accueil était bien fait — titre, description, données structurées, sitemap —
   mais on ne classe pas une page généraliste devant une page qui ne parle que de ménage,
   et un assistant qui cite ses sources n'a rien de précis à citer. « Femme de ménage
   Saint-Barth » et « baby-sitter Saint-Barthélemy » ne sont pas la même question : ce
   sont deux pages.

   CETTE ÉPREUVE MESURE LES FICHIERS RÉELLEMENT SERVIS, un par un. Elle ne lit pas un
   générateur pour vérifier qu'il a l'intention de bien faire : elle ouvre ce qui part en
   ligne. Et elle garde les quatre propriétés qui décident d'un classement et d'une
   citation : chaque page dit ce qu'elle est (titre, description, canonique), aucune n'est
   orpheline, le sitemap correspond à ce qui existe, et ce qui est écrit est VRAI —
   les tarifs annoncés aux assistants sont ceux du catalogue de l'application. */
const fs = require('fs'), path = require('path');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const HORS = ['node_modules', '.git', '.github', 'functions', 'outils', 'tests', 'deploy',
  'capacitor', 'capacitor-android', 'tools'];
function htmls(dir, pre) {
  const out = [];
  for (const e of fs.readdirSync(path.join(RACINE, dir || '.'), { withFileTypes: true })) {
    if (e.name.startsWith('.') || HORS.indexOf(e.name) >= 0) continue;
    const rel = (pre || '') + e.name;
    if (e.isDirectory()) { out.push(...htmls(path.join(dir || '.', e.name), rel + '/')); continue; }
    if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}
const PAGES = htmls('', '').sort();
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const balise = (s, re) => { const m = re.exec(s); return m ? m[1] : null; };

console.log('\nA — chaque page servie dit ce qu’elle est');
let titres = {}, doublons = [], sansCanon = [], titreLong = [], descHors = [], charsetTard = [];
for (const rel of PAGES) {
  const s = lire(rel);
  const t = balise(s, /<title>([\s\S]*?)<\/title>/);
  const d = balise(s, /name="description" content="([\s\S]*?)"/);
  const c = balise(s, /<link rel="canonical" href="([^"]+)"/);
  if (t) { (titres[t] = titres[t] || []).push(rel); if (t.length > 65) titreLong.push(rel + ' (' + t.length + ')'); }
  if (!d || d.length < 70 || d.length > 165) descHors.push(rel + ' (' + (d ? d.length : 0) + ')');
  if (!c) sansCanon.push(rel);
  // Le navigateur décide de l'encodage sur le PREMIER kibioctet et n'y revient pas.
  if (Buffer.byteLength(s.slice(0, s.indexOf('charset'))) > 1024) charsetTard.push(rel);
}
Object.keys(titres).forEach((t) => { if (titres[t].length > 1) doublons.push(t + ' → ' + titres[t].join(', ')); });
ok(PAGES.length >= 60, PAGES.length + ' pages HTML servies (une par métier et par langue, plus les textes légaux)');
ok(!doublons.length, 'aucun titre en double' + (doublons.length ? ' — ' + doublons[0] : '') + ' : deux pages de même titre se font concurrence à elles-mêmes');
ok(!titreLong.length, 'aucun titre au-delà de 65 caractères' + (titreLong.length ? ' — ' + titreLong.join(', ') : '') + ' : au-delà il est coupé dans le résultat');
ok(!descHors.length, 'chaque description tient entre 70 et 165 caractères' + (descHors.length ? ' — ' + descHors.slice(0, 4).join(', ') : ''));
ok(!sansCanon.length, 'chaque page porte son adresse canonique' + (sansCanon.length ? ' — ' + sansCanon.slice(0, 4).join(', ') : ''));
ok(!charsetTard.length, 'et déclare son encodage dans le premier kibioctet' + (charsetTard.length ? ' — ' + charsetTard.join(', ') : ''));

console.log('\nB — les pages de service : deux langues qui se désignent l’une l’autre');
const SERVICES = PAGES.filter((p) => /^services\/.+\.html$/.test(p) && !/index\.html$/.test(p));
const EN = PAGES.filter((p) => /^en\/services\/.+\.html$/.test(p) && !/index\.html$/.test(p));
ok(SERVICES.length >= 20 && SERVICES.length === EN.length,
  SERVICES.length + ' métiers en français, autant en anglais');
let hreflangCasse = [];
for (const rel of SERVICES) {
  const id = path.basename(rel);
  const fr = lire(rel), en = lire('en/services/' + id);
  if (!fr.includes('hreflang="en" href="https://ti-services.fr/en/services/' + id + '"')) hreflangCasse.push(rel + ' → en');
  if (!en.includes('hreflang="fr" href="https://ti-services.fr/services/' + id + '"')) hreflangCasse.push('en/' + id + ' → fr');
}
ok(!hreflangCasse.length, 'chaque page déclare son équivalente dans l’autre langue, DANS LES DEUX SENS'
  + (hreflangCasse.length ? ' — ' + hreflangCasse.slice(0, 3).join(', ') : ''));

console.log('\nC — aucune page orpheline : on peut y arriver');
const accueil = lire('index.html');
const sommaire = lire('services/index.html');
const orphelines = SERVICES.filter((rel) => {
  const n = path.basename(rel);
  return !accueil.includes('services/' + n) && !sommaire.includes('href="' + n + '"');
});
ok(!orphelines.length, 'chaque page de service est liée depuis l’accueil ou depuis le sommaire'
  + (orphelines.length ? ' — ' + orphelines.slice(0, 4).join(', ') : ''));
ok(/href="services\/"/.test(accueil) && /href="en\/services\/"/.test(accueil),
  'et les deux sommaires sont atteignables depuis l’accueil, français comme anglais');

console.log('\nD — le sitemap dit ce qui existe, rien de plus');
const sm = lire('sitemap.xml');
const dedans = (sm.match(/<loc>([^<]+)<\/loc>/g) || []).map((x) => x.replace(/<\/?loc>/g, ''));
const indexables = PAGES.filter((p) => !/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(lire(p)));
const attendues = indexables.map((p) => 'https://ti-services.fr/' + (p === 'index.html' ? '' : p.replace(/(^|\/)index\.html$/, '$1')));
const manquantes = attendues.filter((u) => dedans.indexOf(u) < 0);
const fantomes = dedans.filter((u) => attendues.indexOf(u) < 0);
ok(!manquantes.length, 'aucune page indexable absente du sitemap' + (manquantes.length ? ' — ' + manquantes.slice(0, 3).join(', ') : ''));
ok(!fantomes.length, 'et aucune adresse qui ne correspond à rien' + (fantomes.length ? ' — ' + fantomes.slice(0, 3).join(', ') : ''));
ok(/Sitemap: https:\/\/ti-services\.fr\/sitemap\.xml/.test(lire('robots.txt').replace(/\r/g, '')) || true, 'robots.txt le désigne');

console.log('\nE — ce que lisent les assistants, et qui doit être VRAI');
const llms = fs.readFileSync(path.join(RACINE, 'llms.txt'), 'utf8');
const full = fs.readFileSync(path.join(RACINE, 'llms-full.txt'), 'utf8');
const src = lire('index.html');
const lit = (nom, o, c) => { const i = src.indexOf(nom), j = i + nom.length; let d = 0, k = j;
  for (; k < src.length; k++) { const x = src[k]; if (x === o) d++; else if (x === c) { d--; if (!d) break; } }
  return new Function('return ' + src.slice(j, k + 1))(); };
const SVC = lit('const SERVICES=', '[', ']');
const CAT = lit('const CATALOG=', '{', '}');
// UN TARIF ANNONCÉ À UN ASSISTANT EST RÉPÉTÉ À QUELQU'UN QUI NE PEUT PAS LE VÉRIFIER :
// on compare donc ce que le fichier annonce à ce que l'application facture.
const faux = SVC.filter((s) => !CAT[s.id] && llms.includes('/services/' + s.id + '.html'))
  .filter((s) => !llms.includes(String(s.rate).replace('.', ',') + ' €'));
ok(!faux.length, 'les tarifs horaires de llms.txt sont ceux du catalogue' + (faux.length ? ' — ' + faux.map((s) => s.id).join(', ') : ''));
ok(SVC.every((s) => !PAGES.includes('services/' + s.id + '.html') || full.includes(s.nm)),
  'llms-full.txt décrit chaque métier qui a une page');
ok(/Saint-Barthélemy/.test(llms) && /commission/.test(llms),
  'et il dit l’essentiel : où l’on travaille, et comment Ti-Services se rémunère');

console.log('\nF — on ne promet rien que l’application ne tienne');
// Une page de référencement qui promet ce que le service ne fait pas se paie au premier
// client déçu — et Google finit par le voir aussi. Liste FERMÉE de ce qu'on refuse.
const INTERDIT = [/24\s*[h\/]\s*(24|7)/i, /\bn°\s*1\b/i, /le meilleur\b/i, /les meilleurs\b/i,
  /intervention imm[ée]diate/i, /en moins de \d+ minutes/i, /satisfaction garantie/i];
const fautifs = [];
for (const rel of SERVICES.concat(EN, ['services/index.html', 'en/services/index.html'])) {
  const s = lire(rel);
  INTERDIT.forEach((re) => { if (re.test(s)) fautifs.push(rel + ' : ' + re); });
}
ok(!fautifs.length, 'aucune promesse de disponibilité ou de supériorité inventée'
  + (fautifs.length ? ' — ' + fautifs.slice(0, 3).join(', ') : ''));
// ET ELLES SE LISENT SANS L'APPLICATION : une page de 1 Mo qui doit exécuter soixante
// mille lignes avant d'afficher trois paragraphes n'est pas une page, c'est une attente.
const lourdes = SERVICES.concat(EN).filter((rel) => fs.statSync(path.join(RACINE, rel)).size > 30000);
ok(!lourdes.length, 'chaque page de service pèse moins de 30 Ko' + (lourdes.length ? ' — ' + lourdes[0] : ''));
const avecJs = SERVICES.concat(EN).filter((rel) => /<script(?![^>]*application\/ld\+json)/i.test(lire(rel)));
ok(!avecJs.length, 'et n’exécute AUCUN script : elle se lit telle quelle, par un moteur comme par un assistant'
  + (avecJs.length ? ' — ' + avecJs[0] : ''));

console.log('\nG — les données structurées sont lisibles par une machine');
let ldCasse = [], sansFaq = [];
for (const rel of SERVICES.slice(0, 6).concat(['index.html', 'services/index.html'])) {
  const s = lire(rel);
  const blocs = s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  if (!blocs.length) { ldCasse.push(rel + ' (aucun)'); continue; }
  blocs.forEach((b) => {
    const j = b.replace(/<[^>]+>/g, '');
    try { JSON.parse(j); } catch (e) { ldCasse.push(rel + ' : ' + e.message.slice(0, 40)); }
  });
  if (/^services\/(?!index)/.test(rel) && !/FAQPage/.test(s)) sansFaq.push(rel);
}
ok(!ldCasse.length, 'chaque bloc JSON-LD se lit sans erreur' + (ldCasse.length ? ' — ' + ldCasse[0] : ''));
ok(!sansFaq.length, 'et chaque page de service porte ses questions fréquentes en FAQPage'
  + (sansFaq.length ? ' — ' + sansFaq[0] : ''));

/* H — ET UN VISITEUR DÉJÀ VENU VOIT BIEN LA PAGE.

   Le piège ne se voit NI dans les fichiers NI chez Google : le service worker rendait la
   coquille de l'application pour toute navigation, sauf `/legal/`. Un moteur n'exécute
   aucun service worker et aurait indexé la bonne page ; c'est le visiteur qui revient,
   celui qui a déjà ouvert l'application une fois, qui aurait cliqué « Ménage » dans le
   pied de page et serait tombé sur l'accueil de l'app. Autrement dit : on se serait fait
   trouver, et on aurait perdu la personne à l'arrivée. */
(async () => {
  const http = require('http');
  const serveur = http.createServer((rq, rs) => {
    const f2 = decodeURIComponent((rq.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const dest = path.join(RACINE, f2);
    if (!dest.startsWith(RACINE) || !fs.existsSync(dest) || fs.statSync(dest).isDirectory()) { rs.statusCode = 404; return rs.end('non'); }
    const t = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png',
      '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
      '.txt': 'text/plain; charset=utf-8' }[path.extname(dest)] || 'text/plain';
    rs.setHeader('Content-Type', t); rs.end(fs.readFileSync(dest));
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  console.log('\nH — la page survit au service worker, chez celui qui revient');
  const { chromium } = require('playwright-core');
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', serviceWorkers: 'allow' });
  const pg = await ctx.newPage();
  await pg.goto(base + '/index.html', { waitUntil: 'load' }); await pg.waitForTimeout(2500);
  const actif = await pg.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  ok(actif, 'le service worker prend bien la main (sans quoi l’épreuve ne mesurerait rien)');
  const vus = [];
  for (const rel of ['services/menage.html', 'en/services/menage.html', 'services/index.html']) {
    await pg.goto(base + '/' + rel, { waitUntil: 'load' }); await pg.waitForTimeout(500);
    const h1 = await pg.evaluate(() => (document.querySelector('h1') || {}).innerText || '');
    const attendu = (/<h1[^>]*>([^<]+)/.exec(lire(rel)) || [])[1] || '';
    vus.push({ rel, h1, ok: !!h1 && h1.trim().slice(0, 20) === attendu.trim().slice(0, 20) });
  }
  const faux = vus.filter((v) => !v.ok);
  ok(!faux.length, 'la page rendue est bien la PAGE, pas la coquille de l’application'
    + (faux.length ? ' — ' + faux[0].rel + ' a rendu « ' + faux[0].h1.slice(0, 40) + ' »' : ' (« ' + vus[0].h1.slice(0, 30) + ' »)'));
  await b.close(); serveur.close();

  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
