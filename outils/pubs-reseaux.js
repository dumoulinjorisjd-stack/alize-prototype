#!/usr/bin/env node
/* VISUELS RÉSEAUX SOCIAUX TI-SERVICES — format portrait 4:5 (Instagram, Facebook).

   MÊME SOURCE QUE LES CARTES DE VISITE, ET DONC QUE L'APPLICATION. Les teintes, le dessin
   de Zouti, la police et les ICÔNES viennent d'`index.html` par `outils/cartes-visite.js`,
   qui sert ici de boîte à outils. Rien n'est recopié : une couleur de marque qui change
   dans l'application se retrouve sur le prochain visuel.

   CE QUI CHANGE PAR RAPPORT AUX VISUELS PRÉCÉDENTS, ET POURQUOI :

   — PLUS UN SEUL EMOJI. Les anciens portaient 💰 🆓 🙌 🧹 👶 🌿 ✂️ 🔧 📦 ✅ ⭐. Un emoji est
     dessiné par la police du système : il change d'un téléphone à l'autre, il est colorié
     par quelqu'un d'autre, et il n'a rien à voir avec les icônes de trait de la charte.
     On emploie celles de l'application — les mêmes que le client retrouvera dans l'app.

   — LE CORAIL EST CELUI D'AUJOURD'HUI. Le dégradé descendait jusqu'au corail profond ; il
     s'arrête désormais bien avant, comme sur les cartes (voir outils/cartes/LISEZ-MOI.md).

   — « PLACES LIMITÉES » DISPARAÎT, parce que c'est faux : la page d'accueil dit « Aucune
     place limitée — seule la date compte ». Une promesse de rareté inventée pour presser
     quelqu'un est le genre de phrase qu'on paie cher quand elle se sait.

   Usage :  node outils/pubs-reseaux.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const O = require('./cartes-visite.js');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'outils', 'pubs');

/* Portrait 4:5 — le format qui occupe le plus de hauteur dans un fil, sur les deux
   réseaux. 1080 de large est la largeur native d'Instagram ; on rend à 2× pour que le
   texte reste net une fois recompressé par le réseau. */
const L = 1080, H = 1350, ECHELLE = 2;

const feuille = (c, polices) => `
  ${polices.map(p => `@font-face{font-family:'Inter';font-style:normal;font-weight:${p.g};
    font-display:block;src:url(data:font/ttf;base64,${p.b64}) format('truetype')}`).join('\n  ')}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${L}px;height:${H}px}
  body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;color:${c['ink']}}
  .pub{position:relative;width:${L}px;height:${H}px;overflow:hidden;background:
      radial-gradient(70% 50% at 10% -4%, ${c['teal']}1c, transparent 60%),
      radial-gradient(60% 45% at 104% 4%, #A26A0C12, transparent 55%),
      ${c['sand']}}
  /* LES DEUX RONDS DE L'ANCIENNE AFFICHE SONT GARDÉS — ils faisaient sa signature — mais
     dans le corail d'aujourd'hui, et le second en voile plutôt qu'en jaune : la charte n'a
     pas de jaune, elle a un or de reflet qui ne tient pas un aplat de cette taille. */
  .rond{position:absolute;border-radius:50%;pointer-events:none}
  /* LE ROND RESTE DANS SON COIN. Au premier jet il descendait jusqu'au titre : « Et si les
     clients venaient à VOUS ? » passait dessus, et le mot « vous », en corail foncé, s'y
     effaçait — du corail sur du corail. Un aplat décoratif ne doit jamais toucher un mot.
     Le script le VÉRIFIE maintenant : il refuse un visuel où un bloc de texte recoupe un
     rond. */
  .rond.haut{width:540px;height:540px;right:-200px;top:-250px;
    background:linear-gradient(155deg, ${O.melange(c['teal'], '#ffffff', .16)}, ${O.melange(c['teal'], c['teal-deep'], .18)})}
  .rond.bas{width:400px;height:400px;left:-290px;bottom:-120px;
    background:${O.melange(c['teal'], '#ffffff', .9)}}
  .dedans{position:relative;padding:72px 72px 0;height:${H}px;display:flex;flex-direction:column}

  .tete{display:flex;align-items:center;gap:20px}
  .tete .zouti{width:104px;height:auto;display:block;flex:none}
  .mot{font-weight:800;font-size:46px;letter-spacing:-.025em;line-height:1}
  .mot b{color:${c['teal-deep']};font-weight:800} .mot span{color:${c['ink']}}
  .lieu{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:19px;font-weight:700;
    letter-spacing:.14em;text-transform:uppercase;color:${c['teal-deep']}}
  .lieu svg{width:19px;height:19px}

  .sur{margin-top:64px;font-size:22px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
    color:${c['teal-deep']}}
  h1{margin-top:20px;font-size:84px;font-weight:800;line-height:1.02;letter-spacing:-.035em;
    max-width:14ch}
  h1 em{font-style:normal;color:${c['teal-deep']}}
  .sous{margin-top:26px;font-size:31px;line-height:1.42;font-weight:500;color:${c['ink-soft']};
    max-width:26ch}

  /* Les puces de service : la forme de la vitrine — icône du catalogue, sa teinte, son nom. */
  .chips{display:flex;flex-wrap:wrap;gap:16px;margin-top:40px;max-width:900px}
  .chip{display:flex;align-items:center;gap:13px;background:${c['card']};border:1.5px solid ${c['hair']};
    border-radius:999px;padding:16px 26px;font-size:29px;font-weight:700;white-space:nowrap;
    box-shadow:0 6px 18px -12px rgba(70,40,32,.45)}
  .chip svg{width:34px;height:34px;flex:none;stroke-width:1.9}
  .suite{margin-top:22px;font-size:26px;font-weight:600;color:${c['muted']}}

  .points{margin-top:46px;display:flex;flex-direction:column;gap:26px}
  .point{display:flex;align-items:center;gap:20px;font-size:33px;font-weight:700;line-height:1.25}
  .pic{flex:none;width:64px;height:64px;border-radius:20px;background:${c['teal-wash']};
    display:flex;align-items:center;justify-content:center;color:${c['teal-deep']}}
  .pic svg{width:32px;height:32px;stroke-width:2}

  .bandeau{margin-top:40px;background:${O.melange(c['teal'], '#ffffff', .84)};
    border:2px solid ${O.melange(c['teal'], '#ffffff', .62)};border-radius:28px;padding:28px 32px;
    display:flex;align-items:center;gap:20px}
  .bandeau .pic{background:${c['card']}}
  .bandeau div{font-size:28px;line-height:1.35;font-weight:650;color:${c['ink']}}
  .bandeau b{color:${c['teal-deep']}}

  .pied{position:absolute;left:0;right:0;bottom:0;height:126px;background:${c['ink']};
    display:flex;align-items:center;justify-content:space-between;padding:0 72px;color:#fff}
  .pied .act{font-size:34px;font-weight:700}
  .pied .url{font-size:38px;font-weight:800;letter-spacing:-.02em}
`;

const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>`;

const tete = logo => `<div class="tete">${logo}
  <div><div class="mot"><b>Ti</b><span>-Services</span></div>
  <div class="lieu">${PIN}Saint-Barthélemy</div></div></div>`;

const page = (titre, style, corps) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${titre}</title><style>${style}</style></head><body>${corps}</body></html>`;

/* ---------- Les deux visuels ----------
   Les phrases sont celles de la vitrine et des cartes, pas des variantes inventées ici :
   une campagne qui promet autre chose que la page d'arrivée fait fuir au premier clic. */
const PUBS = [
  {
    cle: 'client',
    sur: 'Services à domicile',
    titre: 'Un pro de confiance, chez vous en quelques&nbsp;minutes.',
    metiers: ['menage', 'jardin', 'colis', 'baby', 'coiffure', 'massage'],
    suite: '… et plein d’autres',
    points: [
      ['shield', 'Prestataires vérifiés et assurés'],
      ['lock', 'Réglé en ligne, après la prestation'],
      ['heart', 'Gratuit, sans abonnement']
    ],
    acte: 'Réservez en 2 min'
  },
  {
    cle: 'pro',
    sur: 'Rejoignez nos prestataires',
    titre: 'Et si les clients venaient à <em>vous</em> ?',
    sous: 'Ti-Services vous envoie des clients de toute l’île. Vous ne prospectez plus.',
    points: [
      ['lock', 'Paiement garanti — fini les impayés'],
      ['heart', 'Zéro abonnement, zéro frais fixes'],
      ['check', 'Vous choisissez vos missions']
    ],
    // « Places limitées » est retiré : la page d'accueil dit le contraire.
    bandeau: ['star', '<b>Programme Ambassadeur</b> — commission réduite et mise en avant dans l’app.'],
    acte: 'Inscription en 2 min'
  }
];

function corps(p, c, logo, metier, I) {
  const chips = p.metiers ? `<div class="chips">${p.metiers.map(id => { const m = metier(id);
      return `<span class="chip"><span style="color:${m.col};line-height:0">${m.ico}</span>${m.nm}</span>`;
    }).join('')}</div>${p.suite ? `<div class="suite">${p.suite}</div>` : ''}` : '';
  const points = `<div class="points">${p.points.map(([ic, t]) =>
    `<div class="point"><span class="pic">${I[ic] || I.check}</span><span>${t}</span></div>`).join('')}</div>`;
  const bandeau = p.bandeau
    ? `<div class="bandeau"><span class="pic">${I[p.bandeau[0]] || I.heart}</span><div>${p.bandeau[1]}</div></div>` : '';
  return `<div class="pub">
    <span class="rond haut"></span><span class="rond bas"></span>
    <div class="dedans">
      ${tete(logo)}
      <div class="sur">${p.sur}</div>
      <h1>${p.titre}</h1>
      ${p.sous ? `<div class="sous">${p.sous}</div>` : ''}
      ${chips}${points}${bandeau}
    </div>
    <div class="pied"><span class="act">${p.acte}</span><span class="url">ti-services.fr</span></div>
  </div>`;
}

async function main() {
  const src = O.lireSource();
  const c = O.couleurs(src);
  const metierBrut = O.metiersDeLApp(src);
  const I = O.iconesDeLApp(src);
  const logo = O.zouti();
  const style = feuille(c, O.police());
  fs.mkdirSync(SORTIE, { recursive: true });

  const { chromium } = require(path.join(RACINE, 'node_modules', 'playwright-core'));
  const opts = { args: ['--no-sandbox', '--font-render-hinting=none'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  const nav = await chromium.launch(opts);

  // Les icônes des métiers sont recentrées et mises à la même taille apparente, exactement
  // comme sur les cartes — c'est le même défaut d'origine et le même remède.
  const cadres = await O.centrerIcones(nav, metierBrut, [...new Set(PUBS.flatMap(p => p.metiers || []))]);
  for (const id in cadres) cadres[id].optique = O.ICO_OPTIQUE[id] || 0;
  const metier = id => { const m = metierBrut(id); return { ...m, ico: O.icoCentree(m.ico, cadres[id]) }; };

  const ctx = await nav.newContext({ viewport: { width: L, height: H }, deviceScaleFactor: ECHELLE });
  const p = await ctx.newPage();
  for (const pub of PUBS) {
    const html = page('Ti-Services — visuel ' + pub.cle, style, corps(pub, c, logo, metier, I));
    const f = path.join(SORTIE, 'pub-' + pub.cle + '.html');
    fs.writeFileSync(f, html);
    await p.goto('file://' + f, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);

    /* CE QUI DÉPASSE NE SE VOIT PAS SUR UNE MAQUETTE, IL SE MESURE. Un visuel est une
       boîte FERMÉE : un texte trop long ne pousse pas la page, il passe sous le bandeau du
       bas ou hors du cadre, et l'on s'en aperçoit une fois publié. */
    const debord = await p.evaluate(() => {
      const d = document.querySelector('.dedans'), pied = document.querySelector('.pied');
      const bas = d.lastElementChild.getBoundingClientRect().bottom;
      return Math.round(pied.getBoundingClientRect().top - bas);
    });
    /* AUCUN MOT SUR UN ROND, ET ON MESURE CE QU'ON PRÉTEND MESURER. Un premier jet
       comparait le RECTANGLE du bloc à celui du rond : deux formes qu'aucun des deux
       n'a. Un bloc comme « Services à domicile » occupe toute la largeur de la colonne
       alors que son texte tient sur 300 px à gauche ; le rectangle englobant d'un disque
       de 540 px déborde, lui, de 79 px dans chaque coin. Les deux visuels étaient donc
       refusés pour des rencontres qui n'existent pas. On compare maintenant le DISQUE
       (distance du centre au point le plus proche, contre le rayon) aux boîtes de LIGNE
       du texte — celles que le navigateur dessine réellement — plus les éléments qui
       posent un fond, une bordure ou un tracé. Huit pixels de marge : frôler, c'est
       toucher. */
    const dessus = await p.evaluate(() => {
      const MARGE = 8;
      const ronds = [...document.querySelectorAll('.rond')].map(e => {
        const r = e.getBoundingClientRect();
        return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, rayon: r.width / 2 };
      });
      const touche = r => ronds.some(o => {
        const dx = Math.max(r.left - o.x, 0, o.x - r.right);
        const dy = Math.max(r.top - o.y, 0, o.y - r.bottom);
        return Math.hypot(dx, dy) < o.rayon + MARGE;
      });
      const nomme = el => {
        for (let e = el; e && e !== document.body; e = e.parentElement)
          if (e.className && typeof e.className === 'string') return '.' + e.className.trim().split(/\s+/)[0];
          else if (e.tagName === 'H1') return 'le titre';
        return 'un bloc';
      };
      const dedans = document.querySelector('.dedans'), pris = new Set();
      const peint = el => { const s = getComputedStyle(el);
        return el.tagName.toLowerCase() === 'svg' || s.backgroundImage !== 'none'
          || !/^rgba\(0, 0, 0, 0\)$/.test(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0; };
      dedans.querySelectorAll('*').forEach(el => {
        if (peint(el) && touche(el.getBoundingClientRect())) pris.add(nomme(el));
      });
      const w = document.createTreeWalker(dedans, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const g = document.createRange(); g.selectNodeContents(n);
        if ([...g.getClientRects()].some(touche)) pris.add(nomme(n.parentElement));
      }
      return [...pris];
    });
    if (dessus.length) {
      console.log('  \u2717 pub-' + pub.cle + ' : un aplat touche ' + dessus.join(', '));
      process.exitCode = 1;
    }
    if (debord < 24) {
      console.log('  ✗ pub-' + pub.cle + ' : le contenu arrive à ' + debord +
        ' px du bandeau du bas (24 minimum)');
      process.exitCode = 1;
    } else {
      console.log('  ✓ pub-' + pub.cle + ' — ' + debord + ' px sous le dernier bloc');
    }

    const png = path.join(SORTIE, 'pub-' + pub.cle + '.png');
    await p.locator('.pub').screenshot({ path: png });
    await p.locator('.pub').screenshot({ path: path.join(SORTIE, 'pub-' + pub.cle + '.jpg'),
      type: 'jpeg', quality: 100 });
  }
  await nav.close();
  console.log('\n' + PUBS.length + ' visuels dans outils/pubs/ · ' +
    (L * ECHELLE) + ' × ' + (H * ECHELLE) + ' px (portrait 4:5, rendu à ' + ECHELLE + '×)');
}

main().catch(e => { console.error(e); process.exit(1); });
