#!/usr/bin/env node
/* TI-SERVICES — « LES DEUX PORTES », un seul visuel pour les deux publics (4:5).

   POURQUOI UNE TROISIÈME AFFICHE PLUTÔT QU'UNE RETOUCHE DES DEUX AUTRES. `pub-client`
   et `pub-pro` restent : elles disent chacune une chose à une personne, c'est leur
   force, et on ne les touche pas. Celle-ci répond à une autre question — « on peut
   faire une pub dans ce style-là ? » devant une affiche concurrente qui vend LES DEUX
   CÔTÉS d'un même marché sur une seule image.

   CE QU'ON REPREND DE LA RÉFÉRENCE, ET POURQUOI C'EST LÉGITIME :
   — UN VISUEL, DEUX PORTES. C'est la trouvaille, et elle n'appartient à personne : un
     service à deux versants (qui commande, qui travaille) se vend mieux quand la même
     image montre qu'il y a deux façons d'y entrer. Une campagne au lieu de deux.
   — L'ÎLE PRÉSENTE, pas seulement nommée. Nos deux affiches écrivent
     « Saint-Barthélemy » et s'arrêtent là.
   — UN BOUTON, pas un bandeau. L'adresse était posée à plat en bas ; elle devient ce
     qu'elle est, un geste à faire.

   CE QU'ON NE REPREND PAS, ET POURQUOI :
   — LA PALETTE (bleu nuit + jaune) est celle de l'autre marque. La nôtre est le corail,
     l'encre et le sable, et elle sort d'`index.html` comme partout ailleurs.
   — LES PERSONNES EN CASQUETTE DE MARQUE, en studio sur fond de plage. Notre figure
     est ZOUTI, et notre photo est celle de l'île, pas d'une équipe posée.
   — LES BULLES, LES RAYONS, LES FLÈCHES TRACÉES À LA MAIN, LE MOT ENCADRÉ. C'est la
     signature graphique de l'autre : la copier serait se faire passer pour lui.

   CE QUE LA RÉFÉRENCE N'A PAS, ET QUE NOUS METTONS : LES PRIX. Ils viennent du
   catalogue de l'application (`SERVICES`), donc ils sont vrais, et ils répondent à la
   seule question que se pose quelqu'un qui hésite à commander.

   Usage :  node outils/pub-deux-portes.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const O = require('./cartes-visite.js');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'outils', 'pubs');
const CLE = 'deux-portes';

/* Même format que les deux autres affiches : portrait 4:5, 1080 de large (la largeur
   native d'Instagram), rendu à 2× pour que le texte tienne la recompression. */
const L = 1080, H = 1350, ECHELLE = 2;

/* LA PHOTO DE FOND, EMBARQUÉE. Le visuel doit rester UN fichier qui s'ouvre partout :
   le HTML est écrit à côté du PNG, et un chemin relatif vers une image se casse dès
   qu'on déplace l'un sans l'autre. Les polices sont déjà embarquées de cette façon. */
function fondEmbarque() {
  const f = path.join(SORTIE, 'fond-saint-barth.jpg');
  if (!fs.existsSync(f)) throw new Error('La photo de fond est introuvable : ' + f);
  return 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
}

/* LA CARTE DE L'ÎLE EST LUE DANS L'APPLICATION, pas recopiée ici. C'est le MÊME tracé
   que le client touche du doigt pour choisir son quartier. */
/* LES MÉTIERS MONTRÉS. Quatre, et leur prix. Au-delà, une affiche devient un catalogue
   et plus personne ne lit. Ce sont les quatre que la vitrine nomme en premier. */
const VITRINE = ['menage', 'jardin', 'baby', 'coiffure'];

/* LE SABLE AVEC UNE TRANSPARENCE. La couleur vient des jetons de l'application, seule
   l'opacité est écrite ici : c'est elle qu'on règle, pas la teinte. */
const voile = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

const feuille = (c, polices, fond) => `
  ${polices.map(p => `@font-face{font-family:'Inter';font-style:normal;font-weight:${p.g};
    font-display:block;src:url(data:font/ttf;base64,${p.b64}) format('truetype')}`).join('\n  ')}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${L}px;height:${H}px}
  body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;color:${c['ink']}}
  /* ══ LA PHOTO SITUE, LE VOILE REND LE TEXTE LISIBLE ═══════════════════════════════
     Gustavia en arrière-plan : ce qu'aucune phrase ne fait aussi vite. Mais une photo
     sous du texte est un piège — le gris d'un toit et le gris d'un mot se valent, et
     l'on ne s'en aperçoit qu'une fois publié. Le voile de sable est donc DENSE là où
     il y a des mots (le haut, le bas) et il s'écarte au milieu, derrière les deux
     cartes, qui sont opaques et n'ont besoin de rien. Le script MESURE ensuite le
     contraste réel de chaque texte contre ce qui est peint dessous. */
  .pub{position:relative;width:${L}px;height:${H}px;overflow:hidden;
    background:${c['sand']}}
  .photo{position:absolute;inset:0;background:url("${fond}") center 30%/cover no-repeat;
    pointer-events:none}
  .voile{position:absolute;inset:0;pointer-events:none;background:
      radial-gradient(60% 40% at 104% 2%, ${c['warn']}18, transparent 55%),
      linear-gradient(180deg,
        ${voile(c['sand'], .96)} 0%,
        ${voile(c['sand'], .93)} 20%,
        ${voile(c['sand'], .70)} 44%,
        ${voile(c['sand'], .70)} 62%,
        ${voile(c['sand'], .90)} 78%,
        ${voile(c['sand'], .95)} 100%)}
  /* LA CARTE DES 16 QUARTIERS A ÉTÉ RETIRÉE QUAND LA PHOTO EST ARRIVÉE. Les deux
     disaient la même chose — « c'est ici » — et la photo le dit mieux ; superposées,
     le tracé passait sur les toits et ne se lisait plus que comme un défaut
     d'impression. Le pied continue de nommer les 16 quartiers, ce que la photo d'un
     seul port ne dit pas. */
  .dedans{position:relative;padding:68px 68px 0;height:${H}px;display:flex;flex-direction:column}

  .tete{display:flex;align-items:center;gap:20px}
  .tete .zouti{width:98px;height:auto;display:block;flex:none}
  .mot{font-weight:800;font-size:44px;letter-spacing:-.025em;line-height:1}
  .mot b{color:${c['teal-deep']};font-weight:800} .mot span{color:${c['ink']}}
  .lieu{display:flex;align-items:center;gap:8px;margin-top:7px;font-size:18px;font-weight:700;
    letter-spacing:.14em;text-transform:uppercase;color:${c['teal-deep']}}
  .lieu svg{width:18px;height:18px}

  h1{margin-top:40px;font-size:76px;font-weight:800;line-height:1.04;letter-spacing:-.035em;
    max-width:17ch}
  h1 em{font-style:normal;color:${c['teal-deep']}}

  /* LES DEUX PORTES. Même largeur, même hauteur, le même nombre de lignes : aucune des
     deux n'est le choix principal. Elles se distinguent par la SURFACE (le papier d'un
     côté, l'encre de l'autre) et non par la taille, sinon l'affiche choisirait pour le
     lecteur. */
  .portes{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:44px}
  .porte{border-radius:30px;padding:34px 32px 32px;display:flex;flex-direction:column}
  .porte.client{background:${c['card']};border:1.5px solid ${c['hair']};
    box-shadow:0 18px 40px -28px rgba(70,40,32,.5)}
  .porte.pro{background:${c['ink']};color:#fff}
  .etiq{display:flex;align-items:center;gap:13px;font-size:21px;font-weight:800;
    letter-spacing:.1em;text-transform:uppercase}
  .porte.client .etiq{color:${c['teal-deep']}}
  .porte.pro .etiq{color:${O.melange(c['teal'], '#ffffff', .42)}}
  .etiq .rond-ico{flex:none;width:50px;height:50px;border-radius:16px;display:flex;
    align-items:center;justify-content:center}
  .porte.client .rond-ico{background:${c['teal-wash']}}
  .porte.pro .rond-ico{background:${c['frame-line']}}
  .etiq svg{width:26px;height:26px;stroke-width:2}
  .promesse{margin-top:22px;font-size:34px;font-weight:750;line-height:1.22;letter-spacing:-.015em}
  .porte.pro .promesse{color:#fff}
  /* LES DEUX LISTES PARTENT DU BAS. Les promesses ne font pas le même nombre de lignes
     (trois à gauche, deux à droite) : alignées par le HAUT, les deux colonnes de coches
     ne commençaient pas à la même hauteur, et deux portes qui se valent doivent se lire
     sur la même ligne. */
  .traits{margin-top:auto;padding-top:24px;display:flex;flex-direction:column;gap:14px}
  .trait{display:flex;align-items:flex-start;gap:12px;font-size:24px;line-height:1.3;
    font-weight:600;color:${c['ink-soft']}}
  .porte.pro .trait{color:${O.melange(c['ink'], '#ffffff', .78)}}
  .trait svg{width:24px;height:24px;flex:none;stroke-width:2.4;margin-top:3px}
  .porte.client .trait svg{color:${c['good']}}
  .porte.pro .trait svg{color:${O.melange(c['teal'], '#ffffff', .3)}}

  /* LES PRIX. Une seule rangée : ce qu'on y lit doit se lire d'un coup d'œil, pas se
     parcourir. */
  .prix{display:flex;flex-wrap:wrap;align-items:center;gap:13px;margin-top:40px}
  .tarif{display:flex;align-items:center;gap:11px;background:${c['card']};
    border:1.5px solid ${c['hair']};border-radius:999px;padding:13px 22px;white-space:nowrap;
    box-shadow:0 6px 18px -13px rgba(70,40,32,.45)}
  .tarif svg{width:28px;height:28px;flex:none;stroke-width:1.9}
  .tarif .nm{font-size:24px;font-weight:700}
  .tarif .mt{font-size:24px;font-weight:800;color:${c['teal-deep']}}
  /* LE GRIS DISCRET DE L'APPLICATION NE TIENT PAS SUR UNE PHOTO. « … et 17 autres »
     était écrit en « muted », comme partout dans l'app où il se pose sur du blanc : sur
     les toits de Gustavia la garde a mesuré 3,85:1, sous le seuil. Il descend d'un
     cran vers l'encre et reste secondaire par sa TAILLE, pas par sa pâleur. */
  .autres{font-size:23px;font-weight:700;color:${c['ink-soft']}}

  /* LE PIED EST UN GESTE, PAS UN BANDEAU. Le bouton porte l'adresse ; la ligne au-dessus
     dit ce qu'on y trouve. */
  .pied{position:absolute;left:0;right:0;bottom:0;padding:0 68px 44px;
    display:flex;flex-direction:column;align-items:center;gap:18px}
  .bouton{display:flex;align-items:center;justify-content:center;gap:16px;width:100%;
    height:116px;border-radius:999px;background:${c['teal-deep']};color:#fff;
    font-size:44px;font-weight:800;letter-spacing:-.02em;
    box-shadow:0 20px 44px -22px ${c['teal-deep']}}
  .bouton svg{width:34px;height:34px;stroke-width:2.6}
  .promesse-pied{font-size:25px;font-weight:650;color:${c['ink-soft']};text-align:center}
  .promesse-pied b{color:${c['ink']};font-weight:800}
`;

const page = (titre, style, corps) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${titre}</title><style>${style}</style></head><body>${corps}</body></html>`;

/* LES PHRASES SONT CELLES DE LA VITRINE, pas des variantes inventées ici : une affiche
   qui promet autre chose que la page d'arrivée fait fuir au premier clic. */
const AFFICHE = {
  titre: 'D’un côté un besoin.<br>De l’autre, <em>un pro</em>.',
  portes: [
    { classe: 'client', ico: 'home', etiq: 'Vous avez besoin',
      promesse: 'Un pro de confiance, chez vous en quelques minutes.',
      traits: ['Prestataires vérifiés et assurés', 'Prix connu avant de réserver',
               'Réglé après la prestation'] },
    { classe: 'pro', ico: 'hardhat', etiq: 'Vous êtes pro',
      promesse: 'Des clients de toute l’île, sans prospecter.',
      traits: ['Vous choisissez vos missions', 'Payé après validation, fini les impayés',
               'Zéro abonnement, zéro frais fixes'] }
  ],
  pied: 'Les <b>16 quartiers</b> de Saint-Barthélemy · Gratuit, sans abonnement'
};

function corps(c, logo, metier, nMetiers, I) {
  const tarif = id => { const m = metier(id);
    const montant = m.forfait ? `${m.rate} €` : `dès ${m.rate} €/h`;
    return `<span class="tarif"><span style="color:${m.col};line-height:0">${m.ico}</span>` +
      `<span class="nm">${m.nm}</span><span class="mt">${montant}</span></span>`; };
  const portes = AFFICHE.portes.map(p => `<div class="porte ${p.classe}">
      <div class="etiq"><span class="rond-ico">${I[p.ico]}</span>${p.etiq}</div>
      <div class="promesse">${p.promesse}</div>
      <div class="traits">${p.traits.map(t =>
        `<div class="trait">${I.check}<span>${t}</span></div>`).join('')}</div>
    </div>`).join('');
  return `<div class="pub">
    <div class="photo"></div><div class="voile"></div>
    <div class="dedans">
      <div class="tete">${logo}
        <div><div class="mot"><b>Ti</b><span>-Services</span></div>
        <div class="lieu">${I.pin}Saint-Barthélemy</div></div></div>
      <h1>${AFFICHE.titre}</h1>
      <div class="portes">${portes}</div>
      <div class="prix">${VITRINE.map(tarif).join('')}<span class="autres">… et ${nMetiers - VITRINE.length} autres</span></div>
    </div>
    <div class="pied">
      <span class="bouton">ti-services.fr${I.chevron}</span>
      <span class="promesse-pied">${AFFICHE.pied}</span>
    </div>
  </div>`;
}

async function main() {
  const src = O.lireSource();
  const c = O.couleurs(src);
  const metierBrut = O.metiersDeLApp(src);
  const nMetiers = O.nombreDeMetiers(src);
  const I = O.iconesDeLApp(src);
  const logo = O.zouti();
  const style = feuille(c, O.police(), fondEmbarque());
  fs.mkdirSync(SORTIE, { recursive: true });

  const { chromium } = require(path.join(RACINE, 'node_modules', 'playwright-core'));
  const opts = { args: ['--no-sandbox', '--font-render-hinting=none'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  const nav = await chromium.launch(opts);

  // Mêmes icônes recentrées que sur les cartes et les deux autres affiches.
  const cadres = await O.centrerIcones(nav, metierBrut, VITRINE);
  for (const id in cadres) cadres[id].optique = O.ICO_OPTIQUE[id] || 0;
  const metier = id => { const m = metierBrut(id); return { ...m, ico: O.icoCentree(m.ico, cadres[id]) }; };

  const ctx = await nav.newContext({ viewport: { width: L, height: H }, deviceScaleFactor: ECHELLE });
  const p = await ctx.newPage();
  const html = page('Ti-Services — visuel ' + CLE, style, corps(c, logo, metier, nMetiers, I));
  const f = path.join(SORTIE, 'pub-' + CLE + '.html');
  fs.writeFileSync(f, html);
  await p.goto('file://' + f, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);

  /* ═══ LES MÊMES GARDES QUE LES DEUX AUTRES AFFICHES ═══════════════════════════════
     Un visuel est une boîte FERMÉE : un texte trop long ne pousse pas la page, il
     passe sous le pied ou hors du cadre, et l'on s'en aperçoit une fois publié. */
  let rouge = 0;
  const debord = await p.evaluate(() => {
    const d = document.querySelector('.dedans'), pied = document.querySelector('.pied');
    const bas = d.lastElementChild.getBoundingClientRect().bottom;
    return Math.round(pied.getBoundingClientRect().top - bas);
  });
  /* ══ CHAQUE MOT SE LIT SUR CE QUI EST PEINT DESSOUS ═════════════════════════════
     La garde d'hier refusait qu'un texte touche un ROND de couleur. Il n'y a plus de
     rond : elle serait passée au vert sans rien mesurer, et c'est le pire des deux
     mondes. Ce qui a remplacé l'aplat est une PHOTO, donc le risque a changé de
     nature — le gris d'un toit et le gris d'un mot se valent, et l'œil ne le voit pas
     sur une maquette réduite.

     On MESURE donc le contraste réel : la page est rendue une seconde fois avec tous
     les mots en transparent, on relève la couleur MOYENNE de ce qui reste peint sous
     chaque texte, et on la compare à l'encre de ce texte (WCAG : 4,5 pour un texte
     ordinaire, 3 pour un grand). Un texte posé sur une carte opaque y passe tout seul
     — c'est la couleur de la carte qu'on relève. */
  const textes = await p.evaluate(() => {
    const dedans = [...document.querySelectorAll('.dedans, .pied')];
    const w = dedans.map(r => document.createTreeWalker(r, NodeFilter.SHOW_TEXT));
    const out = [];
    for (const t of w) for (let n = t.nextNode(); n; n = t.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement, st = getComputedStyle(el);
      const g = document.createRange(); g.selectNodeContents(n);
      const r = [...g.getClientRects()].filter(x => x.width > 2 && x.height > 2);
      if (!r.length) continue;
      const px = parseFloat(st.fontSize), gras = parseInt(st.fontWeight, 10) >= 700;
      out.push({
        mot: n.nodeValue.trim().slice(0, 28),
        couleur: st.color,
        /* WCAG : « grand texte » = 24 px, ou 18,66 px en gras. Mesuré le 20/10 :
           les 30 textes passent AUSSI le seuil de 4,5 ; la marge est donc réelle et
           non arrachée au palier des grands caractères. */
        seuil: (px >= 24 || (gras && px >= 18.66)) ? 3 : 4.5,
        rects: r.map(x => ({ x: x.left, y: x.top, w: x.width, h: x.height }))
      });
    }
    return out;
  });
  const nuTmp = path.join(SORTIE, '.pub-' + CLE + '-sans-texte.png');
  await p.addStyleTag({ content: '*{color:transparent!important}' });
  await p.locator('.pub').screenshot({ path: nuTmp });
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const moyenne = (x, y, w, h) => {
    const E = ECHELLE;
    const s = require('child_process').execFileSync('convert',
      [nuTmp, '-crop', `${Math.max(1, Math.round(w * E))}x${Math.max(1, Math.round(h * E))}` +
        `+${Math.round(x * E)}+${Math.round(y * E)}`, '+repage', '-resize', '1x1', '-depth', '8', 'txt:-'],
      { encoding: 'utf8' });
    const m = /\((\d+),(\d+),(\d+)/.exec(s);
    if (!m) throw new Error('lecture du pixel impossible : ' + s.slice(0, 120));
    return [+m[1], +m[2], +m[3]];
  };
  const palots = [];
  for (const t of textes) {
    const [tr, tg, tb] = (/(\d+), ?(\d+), ?(\d+)/.exec(t.couleur) || [0, 0, 0, 0]).slice(1).map(Number);
    let pire = 99, oux = null;
    for (const r of t.rects) {
      const f = moyenne(r.x, r.y, r.w, r.h);
      const a = lum([tr, tg, tb]), b = lum(f);
      const c2 = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      if (c2 < pire) { pire = c2; oux = f; }
    }
    if (pire < t.seuil) palots.push(`« ${t.mot} » ${pire.toFixed(2)}:1 (${t.seuil} exigé, fond rgb(${oux}))`);
  }
  fs.unlinkSync(nuTmp);
  await p.reload({ waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);

  /* LES DEUX PORTES SE VALENT. Si l'une devient plus haute que l'autre, l'affiche a
     choisi à la place du lecteur, et la grille le ferait en silence. */
  const ecartPortes = await p.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.porte')].map(e => e.getBoundingClientRect().height);
    return Math.round(Math.abs(a - b));
  });
  /* RIEN NE DÉBORDE DE LA PAGE, en largeur comme en hauteur : une rangée de prix trop
     longue sort du cadre sans rien pousser. */
  const horsCadre = await p.evaluate(() => {
    const pub = document.querySelector('.pub').getBoundingClientRect();
    const sortis = [];
    document.querySelectorAll('.dedans *, .pied *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.right > pub.right + 1 || r.left < pub.left - 1 || r.bottom > pub.bottom + 1)
        sortis.push('.' + (String(el.className || '').trim().split(/\s+/)[0] || el.tagName));
    });
    return [...new Set(sortis)];
  });
  /* DEUX MOTS QU'ON NE VEUT PAS VOIR : le tiret cadratin (« ça fait trop IA »), et la
     COMMISSION — ce qu'on vend à un professionnel est ce qu'il touche, jamais le
     pourcentage qu'on prend. */
  const interdits = await p.evaluate(() => {
    const t = document.querySelector('.pub').innerText;
    const m = [];
    if (t.includes('—')) m.push('un tiret cadratin');
    if (/commission/i.test(t)) m.push('le mot « commission »');
    if (/rémunération/i.test(t)) m.push('le mot « rémunération », qui dit la même chose par l\'autre bout');
    return m;
  });

  if (interdits.length) { console.log('  ✗ porte ' + interdits.join(' et ')); rouge++; }
  if (palots.length) { palots.forEach(m => console.log('  ✗ illisible sur la photo : ' + m)); rouge++; }
  else console.log('  ✓ ' + textes.length + ' textes lisibles sur ce qui est peint dessous');
  if (horsCadre.length) { console.log('  ✗ sort du cadre : ' + horsCadre.join(', ')); rouge++; }
  if (ecartPortes > 2) { console.log('  ✗ les deux portes n’ont pas la même hauteur (' + ecartPortes + ' px d’écart)'); rouge++; }
  else console.log('  ✓ les deux portes à la même hauteur');
  if (debord < 24) { console.log('  ✗ le contenu arrive à ' + debord + ' px du pied (24 minimum)'); rouge++; }
  else console.log('  ✓ ' + debord + ' px sous le dernier bloc');

  /* LE PDF : LA MÊME PAGE, EN VECTORIEL — 210 × 262,5 mm, le 4:5 au dixième de mm. */
  const ECH = 793.7008 / L;
  await p.addStyleTag({ content: `@page{size:210mm 262.5mm;margin:0}
    html,body{width:${L * ECH}px;height:${H * ECH}px;overflow:hidden;background:#fff}
    .pub{transform:scale(${ECH});transform-origin:top left}` });
  const fpdf = path.join(SORTIE, 'pub-' + CLE + '.pdf');
  await p.pdf({ path: fpdf, printBackground: true, preferCSSPageSize: true });
  {
    const d = fs.readFileSync(fpdf);
    const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(d.toString('latin1'));
    const r = m ? Number(m[2]) / Number(m[1]) : 0;
    const fontes = (d.toString('latin1').match(/\/FontFile2/g) || []).length;
    const type3 = d.includes('/Type3');
    if (Math.abs(r - H / L) > .004 || !fontes || type3) {
      console.log('  ✗ le PDF : rapport ' + r.toFixed(4) + ', ' + fontes + ' police(s) embarquée(s)' +
        (type3 ? ', des glyphes DESSINÉS (Type 3)' : '')); rouge++;
    } else console.log('  ✓ le PDF — 210 × 262,5 mm, texte vectoriel (' + fontes + ' polices)');
  }

  await p.addStyleTag({ content: `@page{size:auto}html,body{width:${L}px;height:${H}px;background:none}
    .pub{transform:none}` });
  const png = path.join(SORTIE, 'pub-' + CLE + '.png');
  await p.locator('.pub').screenshot({ path: png });
  /* LE JPEG DESCEND À 92, ET SEULEMENT SUR CELLE-CI. Les deux autres affiches sont des
     aplats et du texte : à 100 elles pèsent 800 Ko et la moindre perte s'y verrait en
     halo autour des lettres. Celle-ci porte une PHOTO, que les réseaux recompressent de
     toute façon — 100 n'y ajoute rien de visible et triple le poids du dépôt. */
  await p.locator('.pub').screenshot({ path: path.join(SORTIE, 'pub-' + CLE + '.jpg'),
    type: 'jpeg', quality: 92 });
  await nav.close();
  if (rouge) process.exitCode = 1;
  console.log('\noutils/pubs/pub-' + CLE + '.{png,jpg,pdf} · ' + (L * ECHELLE) + ' × ' + (H * ECHELLE) +
    ' px (portrait 4:5, rendu à ' + ECHELLE + '×)');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
