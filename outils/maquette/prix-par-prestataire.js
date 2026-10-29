/* MAQUETTES — « LE PRIX DE CHACUN » SUR L'ÉCRAN DE COMMANDE.
 *
 * Décision de l'éditeur, le 29/10/2026 : « Pour les massages, tous ceux qui ont accepté la
 * grille tarifaire ont la possibilité d'être dans les commandes aléatoires ou d'être
 * sélectionnés précisément. Ceux qui n'acceptent pas la grille, on peut uniquement les
 * choisir en cliquant dessus, mais pas en aléatoire, en connaissant sa propre grille de
 * tarifs. Mais dans ce cas il faut voir les tarifs de chacun. On fait des maquettes avant. »
 *
 * CE N'EST PAS UN DESSIN. On ouvre l'application RÉELLE dans le harnais, on capture l'écran
 * tel qu'il est, on injecte la proposition SUR CETTE PAGE, et on recapture au même pixel.
 * « Ça fait faux » a déjà tranché ce point ailleurs : une maquette qui n'est pas le produit
 * ne prouve rien sur le produit.
 *
 * ET ON NE RÉÉCRIT PAS LE BALISAGE À LA MAIN : on CLONE les nœuds que l'app vient de
 * rendre et l'on y ajoute la ligne de prix. Les classes, les polices, les écartements sont
 * donc ceux de l'application, pas une imitation.
 *
 *   node outils/maquette/prix-par-prestataire.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

/* LES TARIFS DE LA MAQUETTE SONT CEUX DE LA CONVERSATION : notre grille massage commence à
 * 110 €, la prestataire hors grille demande 150 €. Rien n'est inventé ailleurs. */
const PRIX = { grille: 110, sien: 150 };

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg && window.__svc);

  // ── L'ÉCRAN DE COMMANDE D'UN MASSAGE, tel que l'application le rend ────────────────
  await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: null }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: '1', label: 'Mon adresse', address: 'Lurin', zone: 'Gustavia', geo: { lat: 17.9, lng: -62.8 } }];
    S.mission = null; S.payStep = false; S.admin = null; S.catOpen = null; S.cfgMore = true;
    S.draft = window.__newMission(window.__svc.trouve('massage'));
    /* LE CLIENT A DÉJÀ CHOISI SA PRESTATION QUAND IL ARRIVE ICI : « Choisissez vos
       prestations » est une carte PLUS HAUT que « Précisions », qui porte le choix du
       prestataire. La scène le reflète, sans quoi la maquette mesurerait un écran que
       personne ne voit. */
    const a = (window.__cat.list('massage') || []).find((x) => x.price === 110);
    if (a) S.draft.acts = [{ id: a.id, nm: a.nm, price: a.price, qty: 1 }];
    S._cfgVu = null; window.__cfg.render();
  });
  await p.waitForTimeout(500);

  // La carte « Votre prestataire » : on la trouve par son intitulé, jamais par un rang.
  const carte = await p.evaluateHandle(() => {
    const lbs = Array.from(document.querySelectorAll('#view .field > label'));
    const l = lbs.find((x) => /Votre prestataire/i.test(x.textContent || ''));
    return l ? l.parentElement : null;
  });
  const estLa = await p.evaluate((el) => !!el, carte);
  if (!estLa) { console.log('✗ la carte « Votre prestataire » n\'a pas été trouvée'); await b.close(); process.exit(1); }
  await p.evaluate((el) => el.scrollIntoView({ block: 'center' }), carte);
  await p.waitForTimeout(260);

  const tirer = async (nom) => { const f = path.join(SORTIE, nom + '.png'); await carte.screenshot({ path: f }); return f; };
  const rendus = [];
  rendus.push(['avant', await tirer('1-avant')]);

  /* ── CE QUE LES MAQUETTES PROPOSENT ────────────────────────────────────────────────
     La sous-ligne de chaque carte a été VIDÉE exprès (« Vérifié · Assuré » y était sur
     tout le monde, donc ne distinguait personne, et elle occupe « la seule ligne où le
     client cherche ce qui DIFFÈRE d'une personne à l'autre »). Un prix est exactement
     cela. On s'y installe, on n'ajoute aucune rangée. */
  const poser = (variante, prix) => p.evaluate(({ variante, prix }) => {
    const lbs = Array.from(document.querySelectorAll('#view .field > label'));
    const champ = lbs.find((x) => /Votre prestataire/i.test(x.textContent || '')).parentElement;
    champ.querySelectorAll('[data-maq]').forEach((e) => e.remove());
    champ.querySelectorAll('[data-maq-off]').forEach((e) => { e.style.opacity = ''; e.removeAttribute('data-maq-off'); });

    const opts = Array.from(champ.querySelectorAll('.addr-opt'));
    const pool = opts[0];                       // « Le premier disponible »
    const pros = opts.slice(1);                 // Maya Beauté, Chloé R.

    const ligne = (txt, fort) => {
      const d = document.createElement('div');
      d.className = 'mini'; d.setAttribute('data-maq', '1');
      d.style.marginTop = '2px';
      if (fort) { d.style.color = 'var(--coral-deep)'; d.style.fontWeight = '650'; }
      d.textContent = txt;
      return d;
    };
    const aDroite = (txt, fort) => {
      const s = document.createElement('b');
      s.setAttribute('data-maq', '1');
      s.style.cssText = 'margin-left:auto;flex:none;font-size:13px;white-space:nowrap'
        + (fort ? ';color:var(--coral-deep)' : '');
      s.textContent = txt;
      return s;
    };
    const corps = (o) => o.querySelector('.row') || o;
    // LA COLONNE DU NOM, jamais la rangée flex : `div[style]` attrape le `.row`, et la
    // ligne de prix s'y pose alors À DROITE de l'avatar, ce qui casse le nom en deux.
    const colonne = (o) => o.querySelector('.row > div[style*="min-width"]') || o;

    if (variante === 'A') {
      // A — LA SOUS-LIGNE PORTE LE PRIX. Aucune rangée de plus, aucun pixel de plus.
      pool.appendChild(ligne('Grille Ti-Services · dès ' + prix.grille + ' €'));
      colonne(pros[0]).appendChild(ligne('Grille Ti-Services · dès ' + prix.grille + ' €'));
      colonne(pros[1]).appendChild(ligne('Sa grille · dès ' + prix.sien + ' € · sur choix uniquement', true));
    }
    if (variante === 'B') {
      // B — LE PRIX EN COLONNE, À DROITE. Le client compare en descendant du regard.
      corps(pool).appendChild(aDroite('dès ' + prix.grille + ' €'));
      corps(pros[0]).appendChild(aDroite('dès ' + prix.grille + ' €'));
      corps(pros[1]).appendChild(aDroite('dès ' + prix.sien + ' €', true));
      colonne(pros[1]).appendChild(ligne('Sa grille · sur choix uniquement', true));
      pool.querySelector('.mini').textContent = 'Proposé aux prestataires à la grille Ti-Services, le plus rapide.';
    }
    if (variante === 'F' || variante === 'G' || variante === 'J') {
      /* F — ON NE POINTE PERSONNE DU DOIGT. « Chacun ses tarifs, mais on ne pointe pas
         du doigt » (l'éditeur, 29/10). Mes six premières maquettes marquaient UNE
         personne : encre d'alerte sur elle seule, « SA grille » contre « la NÔTRE »,
         « sur choix uniquement » qui dit une restriction. Trois façons de désigner un
         mauvais élève.
         La symétrie est la correction : le client a DÉJÀ choisi sa prestation en arrivant
         ici, donc chaque carte porte LE PRIX DE CE QU'IL A CHOISI, dans la même encre, au
         même endroit. C'est un fait sur sa commande, pas un verdict sur une personne.
         Et le seul fait qui reste asymétrique — l'une n'est pas dans l'aléatoire — vit
         sur la carte du POOL, qui le dit déjà, et non en badge sur elle. */
      const acte = (window.__S.draft.acts || [])[0];
      const px = (uid) => uid === 'demo-b' ? Math.round(acte.price * prix.sien / prix.grille) : acte.price;
      const t = document.createElement('div');
      t.className = 'mini'; t.setAttribute('data-maq', '1');
      t.style.cssText = 'margin:0 0 6px;color:var(--muted)';
      t.textContent = acte.nm + ' · le prix chez chacun';
      champ.querySelector('.stack').insertAdjacentElement('beforebegin', t);
      corps(pool).appendChild(aDroite(acte.price + ' €'));
      pros.forEach((o) => corps(o).appendChild(aDroite(px(o.dataset.prefart) + ' €')));
      if (variante === 'J') {
        /* J — ELLE NOMME SA PRESTATION AUTREMENT, ET LA COMMANDE RESTE COMPARABLE.
           La ligne du catalogue ne change pas d'identité : le client a demandé « 1 h
           relaxant », chaque carte répond sur CETTE ligne — c'est ce qui permet de lire
           110 € à côté de 150 €. Seul le NOM qu'elle lui donne s'ajoute, sous son propre
           nom, là où vit déjà ce qui diffère d'une personne à l'autre.
           ON NE REMPLACE PAS L'INTITULÉ DU HAUT par le sien : il dit ce que le CLIENT a
           choisi, et le changer selon la carte qu'on regarde ferait croire qu'on commande
           autre chose. */
        colonne(pros[1]).appendChild(ligne('Massage californien · 1 h'));
        colonne(pros[0]).appendChild(ligne('Voir tous ses tarifs'));
        colonne(pros[1]).appendChild(ligne('Voir tous ses tarifs'));
      }
      if (variante === 'G') {
        /* G — ET « VOIR TOUS SES TARIFS » SUR CHAQUE CARTE, pas sur une seule : offrir le
           geste à l'une et pas à l'autre, c'est remettre le doigt. */
        pros.forEach((o) => colonne(o).appendChild(ligne('Voir tous ses tarifs')));
      }
    }
    if (variante === 'D') {
      /* D — LE PRIX NE S'ÉCRIT QUE LÀ OÙ IL DIFFÈRE. « Grille Ti-Services · dès 110 € »
         répété sur chaque carte est la faute de « VÉRIFIÉ · ASSURÉ » : la même mention
         sur tout le monde ne distingue personne, et elle occupe la seule ligne où le
         client cherche ce qui DIFFÈRE. La grille se dit UNE fois, en tête ; seule la
         personne qui s'en écarte porte un prix. */
      const t = document.createElement('div');
      t.className = 'mini'; t.setAttribute('data-maq', '1');
      t.style.cssText = 'margin:0 0 6px;display:flex;gap:8px;align-items:baseline';
      t.innerHTML = '<span>Grille Ti-Services</span><b style="margin-left:auto">60 € à 210 €</b>';
      champ.querySelector('.stack').insertAdjacentElement('beforebegin', t);
      corps(pros[1]).appendChild(aDroite('dès ' + prix.sien + ' €', true));
      colonne(pros[1]).appendChild(ligne('Sa grille · sur choix uniquement · voir ses tarifs', true));
    }
    if (variante === 'C' || variante === 'C2' || variante === 'E') {
      /* C — SA GRILLE SE DÉPLIE SUR PLACE : « il faut voir les tarifs de chacun », sans
         quitter l'écran de commande. LES LIGNES SONT CELLES DU CATALOGUE RÉEL, lues dans
         l'application — un premier jet en avait inventé trois, ce qui est la faute même
         qu'une maquette en captures réelles existe pour éviter.
         C2 — LA MÊME, SANS LA COMPARAISON BARRÉE : voir ci-dessous. */
      corps(pool).appendChild(aDroite('dès ' + prix.grille + ' €'));
      corps(pros[0]).appendChild(aDroite('dès ' + prix.grille + ' €'));
      /* « DÈS X € » NE COMPARE PAS DEUX GRILLES, ET IL ÉTAIT FAUX. Un premier jet posait
         « dès 150 € » sur sa carte : 150 € est son prix d'UNE HEURE, son plancher est 82 €.
         Et corrigé en « dès 82 € » il devient pire — il la fait paraître MOINS CHÈRE que
         la grille alors que chacune de ses lignes est au-dessus : deux grilles se croisent,
         un seul nombre ne les résume pas. E ne résume donc rien, il OUVRE. */
      if (variante === 'E') { const c = aDroite('Ses tarifs', true); c.textContent = 'Ses tarifs ▾'; corps(pros[1]).appendChild(c); }
      else corps(pros[1]).appendChild(aDroite('dès ' + prix.sien + ' €', true));
      const barre = (variante === 'C');
      const actes = (window.__cat.list('massage') || []);
      const g = document.createElement('div');
      g.setAttribute('data-maq', '1');
      g.style.cssText = 'margin:6px 0 0;padding:10px 12px;background:var(--sand-2);border:1px solid var(--hair);border-radius:12px';
      g.innerHTML = '<div class="mini" style="font-weight:650;color:var(--coral-deep)">Les tarifs de Chloé R. · sur choix uniquement</div>'
        + actes.map(function (a) {
            /* SON PRIX EST LE NÔTRE DANS SON RAPPORT À LUI (150/110), arrondi à l'euro :
               la maquette ne prétend pas connaître sa grille, elle montre une FORME. */
            const sien = Math.round(a.price * prix.sien / prix.grille);
            return '<div class="row between" style="margin-top:5px;gap:10px">'
              + '<span class="mini">' + a.nm + '</span>'
              + '<span class="mini" style="white-space:nowrap"><b>' + sien + ' €</b>'
              + (barre ? ' <span style="opacity:.45;text-decoration:line-through">' + a.price + ' €</span>' : '')
              + '</span></div>';
          }).join('')
        + (barre ? '<div class="mini" style="margin-top:7px;opacity:.65">Barré : la grille Ti-Services, pour comparer.</div>' : '');
      pros[1].insertAdjacentElement('afterend', g);
    }
  }, { variante, prix });

  for (const v of ['A', 'B', 'D', 'C', 'C2', 'E', 'F', 'G', 'J']) {
    await poser(v, PRIX);
    await p.waitForTimeout(220);
    rendus.push([v, await tirer('2-apres-' + v)]);
  }

  // ── ET LA GRILLE D'ACTES DU MASSAGE, telle qu'elle est aujourd'hui ────────────────
  // Pourquoi elle compte : `desiredNet` ne capte QU'UN net €/h. Un métier à l'acte a
  // plusieurs lignes ; « sa grille » ne peut donc pas être un seul nombre.
  const grille = await p.evaluate(() => (window.__cat.list('massage') || [])
    .map((a) => ({ nm: a.nm, px: a.price, grp: a.grp || '' })));

  console.log('\nMaquettes rendues :');
  rendus.forEach(([n, f]) => console.log('  ' + n.padEnd(6) + ' ' + f));
  console.log('\nLa grille massage d\'aujourd\'hui, ' + grille.length + ' prestations :');
  grille.slice(0, 8).forEach((a) => console.log('  ' + String(a.px).padStart(4) + ' €  ' + a.nm + (a.grp ? '   [' + a.grp + ']' : '')));
  if (grille.length > 8) console.log('  … et ' + (grille.length - 8) + ' autres');
  if (errs.length) console.log('\nErreurs de page : ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
