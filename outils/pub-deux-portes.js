#!/usr/bin/env node
/* TI-SERVICES — « LES DEUX PORTES », un seul visuel pour les deux publics.

   POURQUOI UNE TROISIÈME AFFICHE PLUTÔT QU'UNE RETOUCHE DES DEUX AUTRES. `pub-client`
   et `pub-pro` restent : elles disent chacune une chose à une personne, c'est leur
   force, et on ne les touche pas. Celle-ci répond à une autre question — « on peut
   faire une pub dans ce style-là ? » devant une affiche concurrente qui vend LES DEUX
   CÔTÉS d'un même marché sur une seule image.

   CE QU'ON REPREND DE LA RÉFÉRENCE, ET POURQUOI C'EST LÉGITIME :
   — UN VISUEL, DEUX PORTES. C'est la trouvaille, et elle n'appartient à personne : un
     service à deux versants (qui commande, qui travaille) se vend mieux quand la même
     image montre qu'il y a deux façons d'y entrer. Une campagne au lieu de deux.
   — LE FORMAT STORY (9:16), qui est celui où elle a été vue, et la composition
     CENTRÉE qui va avec : dans une story l'œil descend l'axe, il ne balaie pas.
   — L'ÎLE PRÉSENTE, pas seulement nommée.
   — UN BOUTON, pas un bandeau. L'adresse devient ce qu'elle est, un geste à faire.

   CE QU'ON NE REPREND PAS, ET POURQUOI :
   — LA PALETTE (bleu nuit + jaune) est celle de l'autre marque. La nôtre est le corail,
     l'encre et le sable, et elle sort d'`index.html` comme partout ailleurs.
   — LES PERSONNES EN CASQUETTE DE MARQUE, en studio sur fond de plage. Notre figure
     est ZOUTI, et notre photo est celle de l'île, pas d'une équipe posée.
   — LES BULLES, LES RAYONS, LES FLÈCHES TRACÉES À LA MAIN, LE MOT ENCADRÉ. C'est la
     signature graphique de l'autre : la copier serait se faire passer pour lui.

   ET CE QUI NOUS SÉPARE D'EUX SUR LE FOND : ILS VENDENT DES EXTRAS AUX ÉTABLISSEMENTS,
   NOUS SERVONS LES GENS QUI VIVENT ICI. C'est la demande du 20/10 — « insiste sur le
   côté pour les locaux » — et elle se tient en trois endroits plutôt qu'un slogan :
   la pastille au-dessus du titre, la phrase sous le titre, et « de toute l'île » dans
   la porte du professionnel. Rien n'y affirme qui nous SOMMES (une marque n'est pas
   d'ici parce qu'elle l'écrit) : tout y dit pour QUI c'est fait, ce qui se vérifie.

   Usage :  node outils/pub-deux-portes.js
            TS_VOILE=0.8 node outils/pub-deux-portes.js   (balayage du voile)
*/
'use strict';
const fs = require('fs');
const path = require('path');
const O = require('./cartes-visite.js');

const RACINE = path.resolve(__dirname, '..');
const SORTIE = path.join(RACINE, 'outils', 'pubs');
const ECHELLE = 2;

/* ══ LES DEUX FORMATS, DE LA MÊME SOURCE ═══════════════════════════════════════════
   La STORY (9:16) est le format de la référence et celui qu'on demande. Le 4:5 reste
   parce que c'est lui qui occupe le plus de hauteur dans un FIL, sur les deux réseaux,
   et que le fil est là où porte la plupart des vues. Une seule mise en page, deux
   hauteurs : ce qui diffère est la RÉSERVE en haut et en bas.

   LES RÉSERVES DE LA STORY NE SONT PAS DÉCORATIVES. Instagram et Facebook posent leur
   propre interface par-dessus : le nom du compte en haut, « Sponsorisée » et le geste
   d'appel en bas. Un titre ou un bouton placé là est recouvert, et l'on ne s'en aperçoit
   qu'une fois la campagne lancée. On garde donc 250 px en haut et 380 en bas, et la
   photo seule y vit. */
const FORMATS = [
  { cle: 'deux-portes-story', L: 1080, H: 1920, haut: 250, bas: 380, nom: 'story 9:16',
    r: Number(process.env.TS_R || .72), t: Number(process.env.TS_T || .90) },
  { cle: 'deux-portes', L: 1080, H: 1350, haut: 74, bas: 74, nom: 'portrait 4:5',
    r: Number(process.env.TS_R2 || .64), t: Number(process.env.TS_T2 || .84) },
  { cle: 'deux-portes-carre', L: 1080, H: 1080, haut: 56, bas: 56, nom: 'carré 1:1',
    r: Number(process.env.TS_R1 || .56), t: Number(process.env.TS_T1 || .78), sans: ['prix'] }
];

/* LA MÊME MISE EN PAGE, DEUX RESPIRATIONS. Une story offre 1 290 px de zone utile, un
   4:5 n'en offre que 1 202 : la même colonne y déborderait de 133 px, et un contenu
   qui déborde d'une boîte FERMÉE ne pousse rien, il sort du cadre. Plutôt que deux
   mises en page, deux boutons — le RYTHME (les blancs entre les blocs) et la TAILLE
   (le texte) — et la mesure en fin de script dit si ça tient. On resserre d'abord le
   rythme, ensuite seulement les caractères : c'est l'air qu'on retire avant les mots.

   ET LA STORY N'EST PAS PLUS GÉNÉREUSE QU'IL N'Y PARAÎT. Elle fait 1 920 px de haut
   contre 1 350, mais une fois les deux réserves posées il lui reste 1 290 px utiles
   contre 1 202 : quatre-vingt-huit de plus, pas cinq cent soixante-dix. C'est pour
   cela que les TROIS formats se resserrent. Balayé le 20/10, puis REBALAYÉ le même
   jour quand le titre a grandi : il ne restait alors que 23 px de jeu sur la story et
   le 4:5 débordait de 3 px. Les réglages tenus aujourd'hui laissent 44, 61 et 50 px.
   TS_R/TS_T, TS_R2/TS_T2, TS_R1/TS_T1 rejouent le balayage format par format. */

/* LES MÉTIERS MONTRÉS. Cinq, sans leur prix. Au-delà, une affiche devient un catalogue
   et plus personne ne lit. Ce sont ceux que la vitrine nomme en premier. */
const VITRINE = ['menage', 'jardin', 'baby', 'coiffure', 'massage'];

/* LA PHOTO DE FOND, EMBARQUÉE. Le visuel doit rester UN fichier qui s'ouvre partout :
   le HTML est écrit à côté du PNG, et un chemin relatif vers une image se casse dès
   qu'on déplace l'un sans l'autre. Les polices sont déjà embarquées de cette façon. */
function fondEmbarque() {
  const f = path.join(SORTIE, 'fond-saint-barth.jpg');
  if (!fs.existsSync(f)) throw new Error('La photo de fond est introuvable : ' + f);
  return 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
}

const voile = (hex, a) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

/* ══ LA DENSITÉ DU VOILE SE MESURE, ELLE NE SE JUGE PAS ════════════════════════════
   « Le filtre blanc est trop fort. » Un seul bouton tient les six arrêts du dégradé,
   et le réglage a été trouvé en le baissant jusqu'à ce que la garde du contraste
   refuse. Balayé le 20/10 : rouge à 0,65 (« Saint-Barthélemy », 4,46:1 sur le ciel) ;
   et à 0,70 le « Ti » du logo tombe à 4,47 dès qu'on exige 4,5 PARTOUT, c'est-à-dire
   sans s'abriter derrière le palier des grands caractères. 0,75 est donc la photo la
   plus visible où CHAQUE mot garde une marge réelle. TS_VOILE rejoue le balayage. */
const VOILE = Number(process.env.TS_VOILE || 0.75);

const feuille = (c, polices, fond, F) => `
  ${polices.map(p => `@font-face{font-family:'Inter';font-style:normal;font-weight:${p.g};
    font-display:block;src:url(data:font/ttf;base64,${p.b64}) format('truetype')}`).join('\n  ')}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${F.L}px;height:${F.H}px}
  body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;color:${c['ink']}}

  /* ══ LA PHOTO SITUE, LE VOILE REND LE TEXTE LISIBLE ═══════════════════════════════
     Gustavia en arrière-plan : ce qu'aucune phrase ne fait aussi vite. Mais une photo
     sous du texte est un piège — le gris d'un toit et le gris d'un mot se valent, et
     l'on ne s'en aperçoit qu'une fois publié. Le voile de sable est donc DENSE là où
     il y a des mots et s'écarte au milieu, derrière les deux cartes, qui sont opaques
     et n'ont besoin de rien. Le script MESURE ensuite le contraste réel de chaque
     texte contre ce qui est peint dessous. */
  .pub{--r:${F.r};--t:${F.t};
    position:relative;width:${F.L}px;height:${F.H}px;overflow:hidden;
    background:${c['sand']}}
  .photo{position:absolute;inset:0;background:url("${fond}") center 30%/cover no-repeat;
    pointer-events:none}
  .voile{position:absolute;inset:0;pointer-events:none;background:
      radial-gradient(60% 40% at 104% 2%, ${c['warn']}18, transparent 55%),
      /* LES ARRÊTS SONT EN PIXELS, PAS EN POURCENTAGE. En pourcentage, le même dégradé
         ne tombe pas au même endroit sur deux hauteurs de page : le bandeau du logo du
         4:5 se retrouvait dans la partie claire, et la garde l'a mesuré à 4,44:1. Ils
         se comptent donc depuis les RÉSERVES, c'est-à-dire depuis le texte. */
      linear-gradient(180deg,
        ${voile(c['sand'], .96 * VOILE)} 0px,
        ${voile(c['sand'], .93 * VOILE)} ${F.haut + 170}px,
        ${voile(c['sand'], .70 * VOILE)} ${F.haut + 430}px,
        ${voile(c['sand'], .70 * VOILE)} ${F.H - F.bas - 300}px,
        ${voile(c['sand'], .90 * VOILE)} ${F.H - F.bas - 90}px,
        ${voile(c['sand'], .95 * VOILE)} ${F.H}px)}

  /* ══ TOUT EST CENTRÉ, ET LE BOUTON EST DANS LE FLUX ══════════════════════════════
     Demandé le 20/10. Le pied était posé en ABSOLU en bas ; dans une story il serait
     tombé dans la réserve de l'interface du réseau. Il entre donc dans la colonne, et
     la colonne entière se centre entre les deux réserves : la mise en page n'a plus à
     savoir quelle hauteur fait la page. */
  .dedans{position:relative;height:${F.H}px;padding:${F.haut}px 64px ${F.bas}px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center}

  /* LE TITRE AVEC ZOUTI PREND SA PLACE (20/10). Il faisait 98 px de haut pour un
     visuel de 1 920 : la marque arrivait après le titre dans l'ordre du regard, alors
     que c'est elle qu'on doit reconnaître en premier dans un fil qui défile. Zouti
     passe à 140, le mot de 44 à 62, le lieu de 18 à 24 — et les trois suivent la
     taille du format, comme le reste. */
  .tete{display:flex;align-items:center;gap:calc(26px * var(--t))}
  .tete .zouti{width:calc(140px * var(--t));height:auto;display:block;flex:none}
  .mot{font-weight:800;font-size:calc(62px * var(--t));letter-spacing:-.025em;line-height:1;
    text-align:left}
  .mot b{color:${c['teal-deep']};font-weight:800} .mot span{color:${c['ink']}}
  .lieu{display:flex;align-items:center;gap:9px;margin-top:calc(9px * var(--t));
    font-size:calc(24px * var(--t));font-weight:700;
    letter-spacing:.14em;text-transform:uppercase;color:${c['teal-deep']}}
  .lieu svg{width:calc(24px * var(--t));height:calc(24px * var(--t))}

  /* LA PASTILLE « POUR LES GENS D'ICI ». Elle est le premier mot qu'on lit après la
     marque, et c'est voulu : la concurrence vend des extras aux établissements, nous
     servons ceux qui habitent l'île. Un aplat d'encre, pas de corail : le corail est
     déjà pris par le bouton, et deux appels à l'œil s'annulent. */
  .ici{margin-top:calc(42px * var(--r));display:inline-flex;align-items:center;gap:12px;
    background:${c['ink']};color:#fff;border-radius:999px;padding:calc(15px * var(--t)) calc(32px * var(--t));
    /* UNE PHRASE PERSONNELLE NE SE MET PAS EN CAPITALES ESPACÉES. « POUR LES GENS
       D'ICI » était une étiquette et le supportait ; « Un ti coup de main » y perdait
       exactement ce qu'on venait d'y mettre, et se lisait comme un sigle. */
    font-size:calc(28px * var(--t));font-weight:750;letter-spacing:-.01em}
  .ici svg{width:24px;height:24px;stroke-width:2.2;color:${O.melange(c['teal'], '#ffffff', .3)}}

  h1{margin-top:calc(39px * var(--r));font-size:calc(76px * var(--t));font-weight:800;line-height:1.04;letter-spacing:-.035em;
    max-width:15ch}
  h1 em{font-style:normal;color:${c['teal-deep']}}
  .sous{margin-top:calc(31px * var(--r));font-size:calc(30px * var(--t));line-height:1.35;font-weight:650;
    color:${c['ink-soft']};max-width:24ch}
  .sous b{color:${c['ink']};font-weight:800}

  /* LES DEUX PORTES. Même largeur, même hauteur, le même nombre de lignes : aucune des
     deux n'est le choix principal. Elles se distinguent par la SURFACE (le papier d'un
     côté, l'encre de l'autre) et non par la taille, sinon l'affiche choisirait pour le
     lecteur. */
  .portes{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:calc(50px * var(--r));width:100%}
  .porte{border-radius:30px;padding:calc(34px * var(--t)) calc(30px * var(--t));display:flex;flex-direction:column;
    align-items:center}
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
  .promesse{margin-top:calc(24px * var(--t));font-size:calc(34px * var(--t));font-weight:750;line-height:1.22;letter-spacing:-.015em}
  .porte.pro .promesse{color:#fff}
  /* LA LISTE EST UN BLOC CENTRÉ, SON TEXTE RESTE À GAUCHE. Centrer chaque ligne d'une
     liste à cocher décale les coches les unes par rapport aux autres : on ne suit plus
     la colonne, et une liste qu'on ne suit pas n'est plus une liste. */
  .traits{margin-top:auto;padding-top:calc(26px * var(--t));display:flex;flex-direction:column;gap:calc(15px * var(--t));
    text-align:left}
  .trait{display:flex;align-items:flex-start;gap:12px;font-size:calc(24px * var(--t));line-height:1.3;
    font-weight:600;color:${c['ink-soft']}}
  .porte.pro .trait{color:${O.melange(c['ink'], '#ffffff', .78)}}
  .trait svg{width:24px;height:24px;flex:none;stroke-width:2.4;margin-top:3px}
  .porte.client .trait svg{color:${c['good']}}
  .porte.pro .trait svg{color:${O.melange(c['teal'], '#ffffff', .3)}}

  /* LES MÉTIERS. Des pastilles, sans prix : décision de l'éditeur du 20/10. Un tarif
     sur une affiche devient la seule chose qu'on en retient, et il se compare avant
     même qu'on ait lu ce qu'il y a dedans. */
  .prix{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;
    gap:calc(15px * var(--t));margin-top:calc(48px * var(--r))}
  .tarif{display:flex;align-items:center;gap:12px;background:${c['card']};
    border:1.5px solid ${c['hair']};border-radius:999px;padding:calc(15px * var(--t)) calc(28px * var(--t));white-space:nowrap;
    box-shadow:0 6px 18px -13px rgba(70,40,32,.45)}
  .tarif svg{width:30px;height:30px;flex:none;stroke-width:1.9}
  .tarif .nm{font-size:calc(27px * var(--t));font-weight:700}
  .autres{font-size:calc(23px * var(--t));font-weight:700;color:${c['ink-soft']}}

  /* LE PIED EST UN GESTE, PAS UN BANDEAU. */
  .pied{margin-top:calc(55px * var(--r));width:100%;display:flex;flex-direction:column;align-items:center;gap:calc(19px * var(--t))}
  .bouton{display:flex;align-items:center;justify-content:center;gap:16px;width:100%;
    height:calc(116px * var(--t));border-radius:999px;background:${c['teal-deep']};color:#fff;
    font-size:calc(44px * var(--t));font-weight:800;letter-spacing:-.02em;
    box-shadow:0 20px 44px -22px ${c['teal-deep']}}
  .bouton svg{width:34px;height:34px;stroke-width:2.6}
  /* LA DERNIÈRE LIGNE EST À L'ENCRE PLEINE. Elle tombe tout en bas, là où la photo est
     la plus sombre quel que soit le cadrage : sur le carré, les toits de Gustavia l'ont
     fait mesurer 4,06:1. Elle ne se distingue donc plus par sa pâleur mais par sa
     GRAISSE, comme « … et 16 autres ». */
  .promesse-pied{font-size:calc(25px * var(--t));font-weight:600;color:${c['ink']}}
  .promesse-pied b{font-weight:800}
`;

const page = (titre, style, corps) => `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${titre}</title><style>${style}</style></head><body>${corps}</body></html>`;

/* LES PHRASES SONT CELLES DE LA VITRINE, pas des variantes inventées ici : une affiche
   qui promet autre chose que la page d'arrivée fait fuir au premier clic. Les deux
   seules neuves sont celles qui disent pour qui c'est fait. */
const AFFICHE = {
  /* ══ LA PASTILLE DIT L'ÎLE, PAS « LES LOCAUX » ═════════════════════════════════
     « Pour les gens d'ici » était juste et sans visage : n'importe quelle marque de
     n'importe quelle île aurait pu l'écrire. « Un ti coup de main » est à nous deux
     fois — c'est le registre des Antilles, et c'est le mot même de la marque, le TI
     de Ti-Services, que personne ne peut reprendre.

     CE QUI A ÉTÉ ÉCARTÉ, ET POURQUOI. Du créole guadeloupéen : Saint-Barth n'est pas
     la Guadeloupe et la distinction compte sur l'île — une phrase en créole y serait
     lue comme venue d'ailleurs. « Entre Saint-Barths » : le mot désigne, pour une
     partie de l'île, les familles d'origine, et l'affiche s'adresse à tous ceux qui y
     vivent. Et tout ce qui REDIT Saint-Barthélemy, écrit juste au-dessus dans le
     bandeau : la pastille dit la RELATION, le bandeau dit le lieu. */
  ici: 'Un ti coup de main',
  titre: 'D’un côté un besoin.<br>De l’autre, <em>un pro</em>.',
  sous: 'Entre habitants de Saint-Barth, <b>toute l’année</b>.',
  portes: [
    { classe: 'client', ico: 'home', etiq: 'Vous avez besoin',
      promesse: 'Un pro de confiance, chez vous en quelques minutes.',
      traits: ['Prestataires vérifiés', 'Prix connu avant de réserver',
               'Réglé après la prestation'] },
    { classe: 'pro', ico: 'hardhat', etiq: 'Vous êtes pro',
      promesse: 'Des clients de toute l’île, sans prospecter.',
      traits: ['Vous choisissez vos missions', 'Payé après validation, fini les impayés',
               'Zéro abonnement, zéro frais fixes'] }
  ],
  pied: '<b>Gratuit</b>, sans abonnement'
};

function corps(c, logo, metier, nMetiers, I, F) {
  const tarif = id => { const m = metier(id);
    return `<span class="tarif"><span style="color:${m.col};line-height:0">${m.ico}</span>` +
      `<span class="nm">${m.nm}</span></span>`; };
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
      <div class="ici">${I.users}${AFFICHE.ici}</div>
      <h1>${AFFICHE.titre}</h1>
      <div class="sous">${AFFICHE.sous}</div>
      <div class="portes">${portes}</div>
      ${(F.sans || []).includes('prix') ? '' :
        `<div class="prix">${VITRINE.map(tarif).join('')}<span class="autres">… et ${nMetiers - VITRINE.length} autres</span></div>`}
      <div class="pied">
        <span class="bouton">ti-services.fr${I.chevron}</span>
        <span class="promesse-pied">${AFFICHE.pied}</span>
      </div>
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
  const fond = fondEmbarque();
  fs.mkdirSync(SORTIE, { recursive: true });

  const { chromium } = require(path.join(RACINE, 'node_modules', 'playwright-core'));
  const opts = { args: ['--no-sandbox', '--font-render-hinting=none'] };
  if (fs.existsSync('/opt/pw-browsers/chromium')) opts.executablePath = '/opt/pw-browsers/chromium';
  const nav = await chromium.launch(opts);

  // Mêmes icônes recentrées que sur les cartes et les deux autres affiches.
  const cadres = await O.centrerIcones(nav, metierBrut, VITRINE);
  for (const id in cadres) cadres[id].optique = O.ICO_OPTIQUE[id] || 0;
  const metier = id => { const m = metierBrut(id); return { ...m, ico: O.icoCentree(m.ico, cadres[id]) }; };

  let rouge = 0;
  for (const F of FORMATS) {
    console.log('\n' + F.cle + ' — ' + F.nom + ' (' + (F.L * ECHELLE) + ' × ' + (F.H * ECHELLE) + ' px)');
    const ctx = await nav.newContext({ viewport: { width: F.L, height: F.H }, deviceScaleFactor: ECHELLE });
    const p = await ctx.newPage();
    const html = page('Ti-Services — visuel ' + F.cle, feuille(c, O.police(), fond, F),
      corps(c, logo, metier, nMetiers, I, F));
    const f = path.join(SORTIE, 'pub-' + F.cle + '.html');
    fs.writeFileSync(f, html);
    await p.goto('file://' + f, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);

    /* ══ LA COLONNE TIENT ENTRE LES DEUX RÉSERVES ════════════════════════════════════
       Un visuel est une boîte FERMÉE, et la story a en plus deux bandes que le réseau
       recouvre. Un contenu trop grand ne pousse pas la page : il déborde de la zone
       utile, et l'on s'en aperçoit une fois la campagne lancée. */
    const reste = await p.evaluate(() => {
      const d = document.querySelector('.dedans'), s = getComputedStyle(d);
      const utile = d.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
      let pris = 0;
      [...d.children].forEach((e, i) => { const r = e.getBoundingClientRect();
        pris += r.height + (i ? parseFloat(getComputedStyle(e).marginTop) : 0); });
      return Math.round(utile - pris);
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
      const t = document.createTreeWalker(document.querySelector('.dedans'), NodeFilter.SHOW_TEXT);
      const out = [];
      for (let n = t.nextNode(); n; n = t.nextNode()) {
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
             tous les textes passent AUSSI le seuil de 4,5 ; la marge est donc réelle
             et non arrachée au palier des grands caractères. */
          seuil: (px >= 24 || (gras && px >= 18.66)) ? 3 : 4.5,
          rects: r.map(x => ({ x: x.left, y: x.top, w: x.width, h: x.height }))
        });
      }
      return out;
    });
    const nuTmp = path.join(SORTIE, '.pub-' + F.cle + '-sans-texte.png');
    await p.addStyleTag({ content: '*{color:transparent!important}' });
    await p.locator('.pub').screenshot({ path: nuTmp });
    const lum = ([r, g, b]) => { const h = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * h(r) + .7152 * h(g) + .0722 * h(b); };
    const moyenne = (x, y, w, h) => {
      const s = require('child_process').execFileSync('convert',
        [nuTmp, '-crop', `${Math.max(1, Math.round(w * ECHELLE))}x${Math.max(1, Math.round(h * ECHELLE))}` +
          `+${Math.round(x * ECHELLE)}+${Math.round(y * ECHELLE)}`, '+repage', '-resize', '1x1', '-depth', '8', 'txt:-'],
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
        const f2 = moyenne(r.x, r.y, r.w, r.h);
        const a = lum([tr, tg, tb]), b = lum(f2);
        const c2 = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (c2 < pire) { pire = c2; oux = f2; }
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
    /* ET TOUT EST SUR L'AXE. « Recentre tout » : un bloc qui resterait calé à gauche se
       verrait au premier coup d'œil sur une story, où l'œil descend l'axe. */
    const hors = await p.evaluate(() => {
      const pub = document.querySelector('.pub').getBoundingClientRect();
      const axe = (pub.left + pub.right) / 2, pris = [];
      [...document.querySelector('.dedans').children].forEach(e => {
        const r = e.getBoundingClientRect();
        if (Math.abs((r.left + r.right) / 2 - axe) > 1)
          pris.push('.' + String(e.className || e.tagName).trim().split(/\s+/)[0]);
        if (r.right > pub.right + 1 || r.left < pub.left - 1) pris.push('déborde : ' + e.tagName);
      });
      return [...new Set(pris)];
    });
    /* DEUX MOTS QU'ON NE VEUT PAS VOIR : le tiret cadratin (« ça fait trop IA »), et la
       COMMISSION — ce qu'on vend à un professionnel est ce qu'il touche, jamais le
       pourcentage qu'on prend. */
    const interdits = await p.evaluate(() => {
      const t = document.querySelector('.pub').innerText, m = [];
      if (t.includes('—')) m.push('un tiret cadratin');
      if (/commission/i.test(t)) m.push('le mot « commission »');
      if (/rémunération/i.test(t)) m.push('le mot « rémunération », qui dit la même chose par l\'autre bout');
      return m;
    });

    if (interdits.length) { console.log('  ✗ porte ' + interdits.join(' et ')); rouge++; }
    if (palots.length) { palots.forEach(m => console.log('  ✗ illisible sur la photo : ' + m)); rouge++; }
    else console.log('  ✓ ' + textes.length + ' textes lisibles sur ce qui est peint dessous');
    if (hors.length) { console.log('  ✗ pas sur l’axe : ' + hors.join(', ')); rouge++; }
    else console.log('  ✓ tous les blocs centrés sur l’axe');
    if (ecartPortes > 2) { console.log('  ✗ les deux portes n’ont pas la même hauteur (' + ecartPortes + ' px)'); rouge++; }
    else console.log('  ✓ les deux portes à la même hauteur');
    if (reste < 0) { console.log('  ✗ la colonne déborde de ' + (-reste) + ' px de la zone utile'); rouge++; }
    else console.log('  ✓ ' + reste + ' px de jeu dans la zone utile' +
      (F.bas > 100 ? ' (réserves ' + F.haut + '/' + F.bas + ' px pour l’interface du réseau)' : ''));

    /* LE PDF : LA MÊME PAGE, EN VECTORIEL — 210 mm de large, le rapport au dixième de mm. */
    const ECH = 793.7008 / F.L, mmH = (210 * F.H / F.L).toFixed(2);
    await p.addStyleTag({ content: `@page{size:210mm ${mmH}mm;margin:0}
      html,body{width:${F.L * ECH}px;height:${F.H * ECH}px;overflow:hidden;background:#fff}
      .pub{transform:scale(${ECH});transform-origin:top left}` });
    const fpdf = path.join(SORTIE, 'pub-' + F.cle + '.pdf');
    await p.pdf({ path: fpdf, printBackground: true, preferCSSPageSize: true });
    {
      const d = fs.readFileSync(fpdf);
      const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(d.toString('latin1'));
      const r = m ? Number(m[2]) / Number(m[1]) : 0;
      const fontes = (d.toString('latin1').match(/\/FontFile2/g) || []).length;
      const type3 = d.includes('/Type3');
      if (Math.abs(r - F.H / F.L) > .004 || !fontes || type3) {
        console.log('  ✗ le PDF : rapport ' + r.toFixed(4) + ', ' + fontes + ' police(s) embarquée(s)' +
          (type3 ? ', des glyphes DESSINÉS (Type 3)' : '')); rouge++;
      } else console.log('  ✓ le PDF — 210 × ' + mmH + ' mm, texte vectoriel (' + fontes + ' polices)');
    }

    await p.addStyleTag({ content: `@page{size:auto}html,body{width:${F.L}px;height:${F.H}px;background:none}
      .pub{transform:none}` });
    await p.locator('.pub').screenshot({ path: path.join(SORTIE, 'pub-' + F.cle + '.png') });
    /* LE JPEG DESCEND À 92. Les deux autres affiches sont des aplats et du texte : à 100
       la moindre perte s'y verrait en halo autour des lettres. Celle-ci porte une PHOTO,
       que les réseaux recompressent de toute façon. */
    await p.locator('.pub').screenshot({ path: path.join(SORTIE, 'pub-' + F.cle + '.jpg'),
      type: 'jpeg', quality: 92 });
    await ctx.close();
  }
  await nav.close();
  if (rouge) process.exitCode = 1;
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
