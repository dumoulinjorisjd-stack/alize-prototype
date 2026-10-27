/* LE FILM — une page HTML de 1080×1920 qu'on photographie image par image.
 *
 * Pourquoi pas un enregistrement vidéo : Playwright sait filmer, mais son encodeur
 * n'est pas installé dans ce conteneur (il réclame /opt/pw-browsers/ffmpeg-*). Un
 * film image par image vaut mieux de toute façon — il est DÉTERMINISTE : `anime(t)`
 * place tout pour l'instant t, on photographie, on avance. Deux rendus donnent le
 * même fichier, et rien ne dépend de la charge de la machine.
 *
 * Rien n'est retapé : la palette, Zouti et la silhouette de l'île se LISENT dans
 * index.html ; les écrans du téléphone sont les vrais, capturés par scene.js.
 */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const { lireSource, couleurs, melange, zouti, police, iconesDeLApp } = require('../cartes-visite.js');
const { capturer, RACINE, CHROME } = require('./scene.js');

const LARGEUR = 1080, HAUTEUR = 1920, FPS = 25;
const ECRANS = path.join(__dirname, 'ecrans');

/* La silhouette de Saint-Barthélemy : le tracé réel, pris dans la feuille de style
   de l'app (`.isle-wm::after`) et non recopié. */
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
   Un plan = un moment du film. Les secondes sont ABSOLUES : on lit le minutage
   en diagonale, et déplacer un plan ne décale pas les suivants par accident. */
const PLANS = [
  { nom:'hook',      de: 0.0,  a: 4.2 },
  { nom:'annonces',  de: 4.2,  a: 10.6 },
  { nom:'bascule',   de: 10.6, a: 14.2 },
  { nom:'client',    de: 14.2, a: 25.8 },
  { nom:'pro',       de: 25.8, a: 37.4 },
  { nom:'promesses', de: 37.4, a: 46.2 },
  { nom:'fin',       de: 46.2, a: 51.6 },
];
const DUREE = PLANS[PLANS.length - 1].a;

const pl = n => PLANS.find(p => p.nom === n);
const a  = (de, duree) => `data-a="${de},${duree}"`;   // entrée
const s  = (de, duree) => `data-s="${de},${duree}"`;   // sortie
const f  = (de, duree) => `data-f="${de},${duree}"`;   // fané : il reste, il ne compte plus

function page(c, src) {
  const Z = zouti();
  /* LES ICÔNES SONT CELLES DE L'APP. Un premier jet posait des emojis système :
     dessinés par la police du téléphone, coloriés, d'une graisse que personne ne
     contrôle, au milieu d'une affiche au trait. On prend le jeu maison et on lui
     laisse décider de sa taille. */
  const I = iconesDeLApp(src);
  const ico = k => {
    if (!I[k]) throw new Error('Icône absente de l\'app : ' + k);
    /* ON NE DÉSHABILLE QUE LA BALISE <svg>. Un premier jet retirait width et height
       PARTOUT : le <rect> de la carte bancaire perdait les siens et l'icône se
       réduisait à un trait. La taille se décide en CSS, sur le <svg> seul. */
    return I[k].replace(/^<svg[^>]*>/, t => t.replace(/\s(width|height)="[^"]*"/g, ''));
  };
  const ILE = ile(src);
  const fontes = police().map(f =>
    `@font-face{font-family:Inter;font-weight:${f.g};font-style:normal;font-display:block;` +
    `src:url(data:font/ttf;base64,${f.b64}) format('truetype')}`).join('\n');

  // Un téléphone : le cadre, et dedans le VRAI écran.
  /* LE TÉLÉPHONE NE PARAÎT JAMAIS VIDE. Le premier écran entre À L'INSTANT où le
     plan paraît, sans fondu : avec un fondu, deux ou trois images montrent un
     cadre noir creux, et cela se lit comme un raté de rendu. */
  const tel = (ecrans) => `<div class="tel"><div class="tel-dedans">` +
    ecrans.map((e, i) => `<img src="ecrans/${e.f}.png" class="ecran" ` +
      `${a(e.de, i === 0 ? 0.01 : 0.55)} ${e.s ? s(e.s, 0.45) : ''}>`).join('') +
    `</div></div>`;

  const pastille = (txt, de, dur) => `<div class="pastille" ${a(de, 0.5)} ${s(de + dur, 0.4)}>${txt}</div>`;

  const P = {};
  PLANS.forEach(p => { P[p.nom] = p; });

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${fontes}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden}
body{font-family:Inter,sans-serif;background:${c.sand};color:${c.ink};
  -webkit-font-smoothing:antialiased}
.film{position:relative;width:${LARGEUR}px;height:${HAUTEUR}px;overflow:hidden}
.plan{position:absolute;inset:0;display:none;padding:110px 72px}
.plan.on{display:block}
/* Un plan sans téléphone se CENTRE : sinon il pend en haut et laisse un tiers
   de l'image vide, ce qui se lit comme un défaut de rendu. */
.plan.centre{display:none}
.plan.centre.on{display:flex;flex-direction:column;justify-content:center}

/* ——— l'île, en filigrane, respire lentement d'un bout à l'autre du film ——— */
/* L'ÎLE PASSE DERRIÈRE, ET RIEN D'AUTRE NE BOUGE. C'est le procédé de l'app
   elle-même (.isle-wm : isolation + z-index -1), repris tel quel. Une règle
   « .plan > * » posée pour faire remonter le reste, elle, écrasait le
   position:absolute de la pastille et du téléphone — deux fois de suite. */
.plan{isolation:isolate}
.ile{position:absolute;right:-110px;top:50%;width:900px;height:560px;margin-top:-280px;
  background:url("data:image/svg+xml,${encodeURIComponent(ILE)}") center/contain no-repeat;
  opacity:.06;pointer-events:none;z-index:-1}

/* ——— l'animation : chaque élément porte sa propre progression ——— */
[data-a],[data-s]{opacity:calc(var(--p,1) * var(--q,1))}
.monte{transform:translateY(calc((1 - var(--p,1)) * 46px))}
.glisse{transform:translateX(calc((1 - var(--p,1)) * -60px))}
.grandit{transform:scale(calc(.86 + var(--p,1) * .14))}

/* ——— typographie ——— */
.sourcil{font-size:30px;font-weight:800;letter-spacing:.20em;text-transform:uppercase;
  color:${c['teal-deep']}}
.titre{font-size:104px;line-height:1.02;font-weight:800;letter-spacing:-.035em;margin-top:26px}
.titre.petit{font-size:78px}
.sous{font-size:44px;line-height:1.3;color:${c['ink-soft']};margin-top:30px;font-weight:500}
.coup{color:${c['teal-deep']}}

/* Un bloc calé en BAS de l'image : sur un format vertical, le regard part du bas. */
.bas{position:absolute;left:72px;right:72px;bottom:150px}
.zouti-haut{position:absolute;left:50%;margin-left:-190px;top:300px;width:380px}

/* ——— le téléphone ——— */
.tel{position:absolute;left:50%;margin-left:-311px;top:412px;width:622px;height:1346px;
  border-radius:62px;background:${c.ink};padding:13px;
  box-shadow:0 60px 120px -30px rgba(35,30,51,.42), 0 0 0 1px rgba(35,30,51,.06)}
.tel-dedans{position:relative;width:100%;height:100%;border-radius:50px;overflow:hidden;
  background:${c.sand}}
.ecran{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}

/* ——— pastilles de commentaire, posées sur le téléphone ——— */
.pastille{position:absolute;left:72px;right:72px;top:196px;z-index:3;
  background:${c.card};border-radius:28px;padding:28px 34px;
  font-size:40px;font-weight:700;line-height:1.25;text-align:center;
  box-shadow:0 26px 60px -18px rgba(35,30,51,.30);border:2px solid ${c.hair}}
.pastille b{color:${c['teal-deep']}}

/* ——— plan « annonces » ——— */
.bulle{background:${c.card};border-radius:34px;border:2px solid ${c.hair};
  padding:36px 40px;font-size:42px;font-weight:600;line-height:1.3;margin-top:28px;
  box-shadow:0 18px 44px -20px rgba(35,30,51,.22);max-width:840px}
.bulle.droite{margin-left:auto;background:${melange(c.sand, c['sand-2'], 50)}}
.bulle .qui{display:block;font-size:26px;font-weight:800;letter-spacing:.12em;
  text-transform:uppercase;color:${c.muted};margin-bottom:12px}
/* FANÉ N'EST PAS DISPARU. Les bulles s'effaçaient avant la chute : la phrase
   tombait alors dans un trou, sans rien à quoi répondre. Elles restent, grises,
   et la chute se pose dessus. */
[data-f]{filter:grayscale(var(--f,0));
  opacity:calc(var(--p,1) * var(--q,1) * (1 - .56 * var(--f,0)))}

/* ——— plan « bascule » : le fond passe au corail ——— */
#bascule{background:linear-gradient(160deg,${c.teal},${c['teal-deep']});color:${c.card};
  display:none;align-items:center;justify-content:center;text-align:center;flex-direction:column}
#bascule.on{display:flex}
#bascule .titre{color:${c.card}}
.marque{display:flex;align-items:center;gap:26px;font-size:92px;font-weight:800;
  letter-spacing:-.03em}
.marque .zouti{width:118px;height:118px}
.marque .ti{color:${c.card}}

/* ——— plan « promesses » ——— */
.carte{background:${c.card};border-radius:36px;border:2px solid ${c.hair};padding:44px 46px;
  margin-top:34px;box-shadow:0 22px 56px -24px rgba(35,30,51,.22);display:flex;gap:34px;
  align-items:flex-start}
.carte .pastilleIco{flex:0 0 94px;height:94px;border-radius:28px;
  background:${melange(c.card, c.teal, 14)};display:flex;align-items:center;justify-content:center;
  color:${c['teal-deep']}}
.carte .pastilleIco svg{width:50px;height:50px}
.carte h3{font-size:46px;font-weight:800;letter-spacing:-.02em;line-height:1.15}
.carte p{font-size:34px;color:${c['ink-soft']};margin-top:12px;line-height:1.35;font-weight:500}

/* ——— plan final ——— */
#fin{display:none;align-items:center;justify-content:center;text-align:center;flex-direction:column}
#fin.on{display:flex}
#fin .zouti{width:210px;height:210px}
.adresse{margin-top:52px;font-size:50px;font-weight:800;color:${c['teal-deep']};
  letter-spacing:-.01em}
.pied{margin-top:26px;font-size:32px;color:${c.muted};font-weight:600}
</style></head><body><div class="film">

<!-- 1 · le besoin -->
<section class="plan" id="hook"><div class="ile"></div>
  <div class="zouti-haut grandit" ${a(0.0, 0.45)}>${Z}</div>
  <div class="bas">
    <div class="sourcil monte" ${a(0.05, 0.4)}>Gustavia · 17 h 00</div>
    <h1 class="titre monte" ${a(0.2, 0.5)}>Envie d'un<br>massage.</h1>
    <p class="sous monte" ${a(0.6, 0.5)}>Aujourd'hui. Chez vous.<br>À Saint-Barth.</p>
  </div>
</section>

<!-- 2 · ce que fait une annonce -->
<section class="plan" id="annonces"><div class="ile"></div>
  <div class="sourcil monte" ${a(4.35, 0.6)}>Sur les groupes de l'île</div>
  <div class="bulle monte" ${a(4.7, 0.55)} ${f(8.0, 0.9)}><span class="qui">Vous</span>Quelqu'un connaît une bonne masseuse&nbsp;?</div>
  <div class="bulle droite monte" ${a(5.6, 0.55)} ${f(8.0, 0.9)}><span class="qui">Un inconnu</span>MP&nbsp;!</div>
  <div class="bulle monte" ${a(6.5, 0.55)} ${f(8.0, 0.9)}><span class="qui">Trois jours plus tard</span>Toujours sans réponse.</div>
  <p class="titre petit monte" style="margin-top:76px" ${a(8.4, 0.8)}>Une annonce,<br>ça <span class="coup">s'arrête là</span>.</p>
</section>

<!-- 3 · la bascule -->
<section class="plan" id="bascule">
  <div class="marque grandit" ${a(10.8, 0.7)}>${Z}<span><span class="ti">Ti</span>-Services</span></div>
  <h2 class="titre monte" style="margin-top:46px" ${a(11.5, 0.8)}>Nous, on va<br>jusqu'au bout.</h2>
</section>

<!-- 4 · côté client -->
<section class="plan" id="client"><div class="ile"></div>
  <div class="sourcil glisse" ${a(14.25, 0.6)}>Côté client</div>
  ${pastille('Vous choisissez. <b>Prix ferme.</b>', 14.8, 3.1)}
  ${pastille('Pas de devis, pas de marchandage.', 18.3, 3.1)}
  ${pastille('<b>Aucun débit maintenant.</b><br>Vous payez après la prestation.', 21.8, 3.6)}
  ${tel([
    { f:'01-accueil',   de:14.2, s:17.9 },
    { f:'02-config',    de:17.9, s:21.5 },
    { f:'03-confirmer', de:21.5 },
  ])}
</section>

<!-- 5 · côté prestataire -->
<section class="plan" id="pro"><div class="ile"></div>
  <div class="sourcil glisse" ${a(25.85, 0.6)}>Côté prestataire</div>
  ${pastille('La demande arrive chez <b>Léa</b>.', 26.4, 3.2)}
  ${pastille('Elle accepte. <b>93,50 € pour elle.</b>', 30.0, 3.2)}
  ${pastille('Payée, facturée. <b>Sans relancer personne.</b>', 33.6, 3.5)}
  ${tel([
    { f:'05-pro-fil',      de:25.8, s:29.6 },
    { f:'06-pro-acceptee', de:29.6, s:33.2 },
    { f:'07-pro-revenus',  de:33.2 },
  ])}
</section>

<!-- 6 · ce qu'une annonce ne fera jamais -->
<section class="plan centre" id="promesses"><div class="ile"></div>
  <div class="sourcil monte" ${a(37.5, 0.6)}>Ce qu'une annonce ne fera jamais</div>
  <div class="carte monte" ${a(38.1, 0.7)}><div class="pastilleIco">${ico('shield')}</div>
    <div><h3>Chaque prestataire est validé à la main</h3>
    <p>Identité, assurance, statut : contrôlés avant qu'il reçoive une seule demande.</p></div></div>
  <div class="carte monte" ${a(39.4, 0.7)}><div class="pastilleIco">${ico('card')}</div>
    <div><h3>Payé après la prestation validée</h3>
    <p>Le client n'est débité qu'une fois le travail fait. Le pro est réglé sans relancer.</p></div></div>
  <div class="carte monte" ${a(40.7, 0.7)}><div class="pastilleIco">${ico('doc')}</div>
    <div><h3>Factures et attestations automatiques</h3>
    <p>Chaque mission facturée au nom du prestataire. Relevé mensuel, attestation annuelle.</p></div></div>
  <p class="sous monte" style="margin-top:56px;font-size:40px" ${a(42.3, 0.8)}>Un site d'annonces vous laisse là.<br><b class="coup">Ti-Services va jusqu'au paiement.</b></p>
</section>

<!-- 7 · fin -->
<section class="plan" id="fin"><div class="ile"></div>
  <div class="grandit" ${a(46.4, 0.7)}>${Z}</div>
  <h2 class="titre monte" style="margin-top:40px" ${a(46.9, 0.8)}>Tous les services<br>de l'île.<br><span class="coup">Une seule app.</span></h2>
  <div class="adresse monte" ${a(47.9, 0.7)}>ti-services.fr</div>
  <div class="pied monte" ${a(48.5, 0.7)}>Saint-Barthélemy</div>
</section>

</div><script>
/* Une seule fonction place TOUT le film à l'instant t. Rien n'est joué par le
   navigateur : pas de transition CSS, pas de minuteur — donc pas de course, et
   deux rendus de la même seconde donnent exactement la même image. */
var PLANS = ${JSON.stringify(PLANS)};
function douceur(x){ return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; }
function part(spec, t){
  var v = spec.split(','), de = +v[0], duree = +v[1] || 0.01;
  return douceur(Math.max(0, Math.min(1, (t - de) / duree)));
}
function anime(t){
  for (var i = 0; i < PLANS.length; i++){
    var p = PLANS[i], el = document.getElementById(p.nom);
    if (el) el.classList.toggle('on', t >= p.de && t < p.a);
  }
  var tous = document.querySelectorAll('[data-a],[data-s],[data-f]');
  for (var k = 0; k < tous.length; k++){
    var e = tous[k];
    var ent = e.getAttribute('data-a'), sor = e.getAttribute('data-s');
    var fan = e.getAttribute('data-f');
    e.style.setProperty('--p', ent ? part(ent, t) : 1);
    e.style.setProperty('--q', sor ? 1 - part(sor, t) : 1);
    if (fan) e.style.setProperty('--f', part(fan, t));
  }
}
window.anime = anime; window.DUREE = ${DUREE};
anime(0);
</script></body></html>`;
}

/* ---------- le rendu ---------- */
async function rendre({ recapturer = true, fps = FPS } = {}) {
  if (recapturer) await capturer(ECRANS);
  for (const e of ['01-accueil','03-confirmer','05-pro-fil','07-pro-revenus']) {
    if (!fs.existsSync(path.join(ECRANS, e + '.png'))) throw new Error('Écran manquant : ' + e);
  }
  const src = lireSource();
  const c = couleurs(src);
  const html = path.join(__dirname, 'film.html');
  fs.writeFileSync(html, verifierPromesses(page(c, src)));

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
  return { mp4, images: total, duree: DUREE };
}

module.exports = { rendre, page, verifierPromesses, PLANS, DUREE, LARGEUR, HAUTEUR, FPS };

if (require.main === module) {
  rendre({ recapturer: process.argv.indexOf('--sans-capture') < 0 })
    .then(r => console.log('film : ' + r.mp4 + ' — ' + r.images + ' images, ' + r.duree + ' s'))
    .catch(e => { console.error(e.message); process.exit(1); });
}
