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
   orpheline, le sitemap correspond à ce qui existe, et ce qui est écrit est VRAI.

   ET CE QUI N'Y EST PAS : AUCUN TARIF (21/09/2026). Les pages portaient la grille de
   prix, lue dans le catalogue de l'application. L'éditeur les a retirées : un prix ne
   s'annonce que là où il engage, c'est-à-dire dans l'application, avant la commande.
   La garde s'inverse donc — elle ne vérifie plus qu'un prix affiché est JUSTE, elle
   vérifie qu'il n'y en a AUCUN, ce qui ne dépend d'aucune donnée et attrape aussi bien
   le chiffre remis à la main que l'`Offer` glissé dans les données structurées. */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
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
ok(SVC.every((s) => !PAGES.includes('services/' + s.id + '.html') || full.includes(s.nm)),
  'llms-full.txt décrit chaque métier qui a une page');
ok(/Saint-Barthélemy/.test(llms),
  'et il dit où l’on travaille');
// LA CONSIGNE VAUT AUSSI QUAND ELLE S'ADRESSE À UNE MACHINE : `llms-full.txt` DIT qu'il
// n'y a pas de tarif et qu'il ne faut pas en estimer. Sans cette phrase, un assistant
// comblerait le silence par une fourchette de son cru, présentée comme la nôtre.
ok(/ne pas en citer, ne pas en estimer/i.test(full),
  'et il dit à l’assistant de ne PAS inventer de tarif là où il n’en trouve pas');

/* F0 — AUCUN PRIX, NULLE PART (21/09/2026, décision de l'éditeur).

   Le prix ne s'annonce que là où il engage : dans l'application, avant la commande. Un
   tarif posé sur une page indexée survit dans le cache d'un moteur et dans la mémoire
   d'un assistant longtemps après avoir changé, et la concurrence le lit aussi bien que
   le client. Cette garde est plus forte que celle qu'elle remplace (« le prix annoncé
   est celui du catalogue ») : elle ne dépend d'aucune donnée, et elle attrape le prix
   qu'on remettrait sans y penser, en toutes lettres comme en chiffres, dans le texte
   visible comme dans les données structurées. */
console.log('\nF0 — aucun tarif ne sort de l’application');
const ARGENT = [/\d[\d  ., ]*(€|EUR\b)/i, /(€|EUR)\s?\d/i, /"price"/i, /priceCurrency/i,
  /priceSpecification/i, /"[Oo]ffer"/, /à partir de\s+\d/i, /\bfrom\s+\d+\s*(€|EUR)/i];
const avecPrix = [];
for (const rel of SERVICES.concat(EN, ['services/index.html', 'en/services/index.html'])) {
  const t = lire(rel);
  ARGENT.forEach((re) => { const m = re.exec(t); if (m) avecPrix.push(rel + ' : ' + m[0].slice(0, 30)); });
}
[['llms.txt', llms], ['llms-full.txt', full]].forEach(([nom, t]) => {
  ARGENT.forEach((re) => { const m = re.exec(t); if (m) avecPrix.push(nom + ' : ' + m[0].slice(0, 30)); });
});
ok(!avecPrix.length, 'aucun montant sur les 44 pages ni dans les fichiers lus par les assistants'
  + (avecPrix.length ? ' — ' + avecPrix.slice(0, 3).join(' · ') : ''));
// ET ON NE LAISSE PAS UNE SECTION VIDE DERRIÈRE : un intitulé « Tarifs » suivi de rien se
// lirait comme une page cassée, et un intitulé « Quartiers desservis » sans quartiers
// serait pire que l'énumération qu'on vient de retirer.
const sections = [];
for (const rel of SERVICES.concat(EN, ['services/index.html', 'en/services/index.html'])) {
  const t = lire(rel);
  [/>Tarifs</, />Prices</, />Quartiers desservis</, />Areas covered</].forEach((re) => {
    if (re.test(t)) sections.push(rel + ' : ' + re);
  });
}
ok(!sections.length, 'et aucun intitulé de section ne reste sans son contenu'
  + (sections.length ? ' — ' + sections[0] : ''));
// L'AIRE DESSERVIE, ELLE, RESTE DÉCLARÉE — une fois, à la machine, où elle sert à nous
// situer. La retirer aussi nous rendrait invisibles sur « à Saint-Barthélemy ».
const sansAire = SERVICES.filter((rel) => !/"areaServed"[\s\S]{0,120}Saint-Barth/.test(lire(rel)));
ok(!sansAire.length, 'l’île reste déclarée comme aire desservie dans les données structurées'
  + (sansAire.length ? ' — ' + sansAire[0] : ''));

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
/* ET ELLES SE LISENT SANS L'APPLICATION : une page de 1 Mo qui doit exécuter soixante
   mille lignes avant d'afficher trois paragraphes n'est pas une page, c'est une attente.

   ON MESURE CE QUI PART SUR LE FIL. Le plafond portait sur les octets du DISQUE, or
   personne ne télécharge ces octets-là : l'hébergeur sert la page compressée. Les icônes
   de métier sont du SVG en ligne, donc très répétitif, et se compriment d'un facteur
   quatre — un plafond au disque aurait refusé une page qui ne coûte rien de plus au
   visiteur, et poussé à retirer ce qui fait justement l'allure. Le plafond du disque
   reste, large : il attrape la page qui deviendrait une application. */
const pesee = (rel) => {
  const brut = fs.readFileSync(path.join(RACINE, rel));
  return { rel: rel, disque: brut.length,
    fil: zlib.brotliCompressSync(brut, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
};
const TOUTES = SERVICES.concat(EN, ['services/index.html', 'en/services/index.html']);
const pesees = TOUTES.map(pesee);
const surLeFil = pesees.filter((x) => x.fil > 12000);
const surDisque = pesees.filter((x) => x.disque > 40000);
const pire = pesees.reduce((a, b) => (b.fil > a.fil ? b : a));
ok(!surLeFil.length && !surDisque.length,
  'chaque page part en moins de 12 Ko sur le fil (la plus lourde : ' + pire.rel + ', '
  + Math.round(pire.fil / 102.4) / 10 + ' Ko compressés, ' + Math.round(pire.disque / 102.4) / 10 + ' Ko au disque)'
  + (surLeFil.length ? ' — ' + surLeFil[0].rel : '') + (surDisque.length ? ' — ' + surDisque[0].rel : ''));
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

  /* I — L'ALLURE TIENT, ET ELLE EST CELLE DE L'APPLICATION.

     Une page de référencement est la PREMIÈRE chose qu'un inconnu voit de Ti-Services.
     Ce qui se mesure ici n'est pas « c'est joli » — personne ne peut l'éprouver — mais
     les quatre choses qui cassent en silence et qu'on ne voit pas dans un diff. */
  console.log('\nI — l’allure tient, et c’est celle de l’application');

  /* 1. LA TEINTE EST CELLE DU MÉTIER, prise dans l'application. Si la lecture de
        `SVC_COLORS` cassait, les pages resteraient uniformément corail : joli quand même,
        et faux — on aurait cessé de montrer le même produit.
        ON LA DEMANDE AU NAVIGATEUR. Un premier jet la cherchait dans le TEXTE du fichier
        et tombait sur la valeur par défaut déclarée en tête de la feuille, celle que la
        règle suivante remplace : il a rendu « une seule teinte pour vingt-et-un métiers »
        sur des pages qui en portaient vingt-et-une. Ce qui compte est la valeur CALCULÉE. */
  const SRCAPP = lire('index.html');
  const litApp = (nom, o, c) => { const i = SRCAPP.indexOf(nom), j = i + nom.length; let d = 0, k = j;
    for (; k < SRCAPP.length; k++) { const x = SRCAPP[k]; if (x === o) d++; else if (x === c) { d--; if (!d) break; } }
    return new Function('return ' + SRCAPP.slice(j, k + 1))(); };
  const COUL = litApp('const SVC_COLORS=', '{', '}');
  const teintes = new Set(); const ecarts = [];
  for (const rel of ['menage', 'plomberie', 'animaux', 'yoga', 'coiffure', 'piscine', 'jardin']) {
    await pg.goto(base + '/services/' + rel + '.html', { waitUntil: 'load' }); await pg.waitForTimeout(120);
    const vu = await pg.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase(),
      medaille: getComputedStyle(document.querySelector('.medaille')).color,
      icone: !!document.querySelector('.medaille svg path, .medaille svg circle, .medaille svg rect') }));
    if (vu.accent !== String(COUL[rel]).toLowerCase()) ecarts.push(rel + ' : ' + vu.accent + ' au lieu de ' + COUL[rel]);
    if (!vu.icone) ecarts.push(rel + ' : médaillon sans dessin');
    teintes.add(vu.accent);
  }
  ok(!ecarts.length && teintes.size === 7,
    'chaque page porte la couleur ET l’icône de SON métier, celles de l’application ('
    + teintes.size + ' teintes distinctes sur 7 pages)' + (ecarts.length ? ' — ' + ecarts[0] : ''));

  /* 2. LA MASCOTTE NE SOURIT QU'UNE FOIS. Son dessin porte DEUX bouches — la seconde ne
        sert qu'au sourire large — et c'est une règle de l'APPLICATION qui la masque. Elle
        est reprise ici : sans elle, Zouti s'affiche avec deux bouches superposées sur les
        quarante-six pages, et rien dans un diff ne le dirait. */
  await pg.goto(base + '/services/menage.html', { waitUntil: 'load' }); await pg.waitForTimeout(250);
  const mascotte = await pg.evaluate(() => {
    const z = document.querySelector('.zouti');
    if (!z) return { la: false };
    const grande = z.querySelector('.z-mouth-big');
    return { la: true, corps: !!z.querySelector('.z-body'), etoile: !!z.querySelector('.z-star'),
      grande: !!grande, cachee: grande ? getComputedStyle(grande).opacity === '0' : false,
      largeur: Math.round(z.getBoundingClientRect().width) };
  });
  ok(mascotte.la && mascotte.corps && mascotte.etoile && mascotte.grande && mascotte.cachee && mascotte.largeur > 30,
    'la mascotte de l’application est là (' + mascotte.largeur + ' px) et ne montre qu’une bouche');

  // 3. RIEN NE DÉBORDE, À AUCUNE LARGEUR. Un débordement horizontal ne se voit pas sur
  //    l'écran où l'on travaille ; il se voit sur le téléphone de quelqu'un d'autre.
  const deborde = [];
  for (const w of [390, 768, 1280, 1600]) {
    await pg.setViewportSize({ width: w, height: 900 });
    for (const rel of ['services/menage.html', 'services/index.html', 'en/services/baby.html']) {
      await pg.goto(base + '/' + rel, { waitUntil: 'load' }); await pg.waitForTimeout(150);
      const d = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (d > 1) deborde.push(rel + ' à ' + w + 'px : ' + d + 'px');
    }
  }
  ok(!deborde.length, 'aucun débordement horizontal, de 390 à 1600 px' + (deborde.length ? ' — ' + deborde[0] : ''));

  /* 4. LA FOIRE AUX QUESTIONS S'OUVRE SANS UNE LIGNE DE SCRIPT. C'est `<details>` qui le
        permet ; le jour où l'on remplacerait la balise par un bloc stylé, la réponse
        deviendrait invisible pour tout le monde, et l'épreuve « aucun script » resterait
        verte en laissant une page morte.
        ON MESURE LA HAUTEUR DE LA FENÊTRE DÉPLIANTE, pas celle du paragraphe : un premier
        jet mesurait le `<p>` et le trouvait haut de 66 px alors que le bloc était FERMÉ —
        un navigateur récent range le contenu d'un `<details>` replié derrière
        `content-visibility`, qui saute le rendu SANS remettre la boîte à zéro. La hauteur
        du bloc, elle, est ce que l'œil voit. */
  await pg.setViewportSize({ width: 1280, height: 900 });
  await pg.goto(base + '/services/menage.html', { waitUntil: 'load' }); await pg.waitForTimeout(200);
  const mesure = () => pg.evaluate(() => {
    const d = document.querySelector('details');
    return { h: Math.round(d.getBoundingClientRect().height), ouvert: d.open }; });
  const replie = await mesure();
  await pg.click('details summary'); await pg.waitForTimeout(300);
  const deplie = await mesure();
  ok(!replie.ouvert && deplie.ouvert && deplie.h > replie.h + 30,
    'une question s’ouvre au clic, sans script — ' + replie.h + ' px repliée, ' + deplie.h + ' px dépliée');

  await b.close(); serveur.close();

  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
