/* MAQUETTE — PERSONNALISER LES TARIFS D'UN PRESTATAIRE DEPUIS LA CONSOLE.
 *
 * « Et dans la console il faut que je puisse personnaliser les tarifs de chacun »
 * (l'éditeur, 29/10/2026). Captures réelles de la fiche d'un prestataire, variante
 * injectée sur la même page au même pixel. Aucune ligne de produit touchée.
 *
 * CE QUE LA CONSOLE FAIT DÉJÀ, MESURÉ : elle AFFICHE le souhait du prestataire
 * (`desiredNetRates`, un net €/h par métier) sous « Prix net souhaité », et conclut
 * « à discuter avec lui avant validation ». La discussion est donc prévue — et il
 * n'existe nulle part où en consigner l'issue. C'est exactement ce trou.
 *
 *   node outils/maquette/tarifs-dans-la-console.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 980 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }), serverTimestamp: () => 'ts' },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    /* UNE PRESTATAIRE QUI A REFUSÉ LA GRILLE ET DIT CE QU'ELLE VOULAIT : le cas de la
       conversation — notre heure de massage est à 110 €, elle demande 150 €. */
    S.adminArtisans = [{ id: 'a1', name: 'Chloé R.', status: 'attente', type: 'entreprise',
      cats: ['massage'], rates: { massage: 110 }, rate: 110, acceptsGrille: false,
      desiredNetRates: { massage: 128 }, siret: '12345678901234', insured: true,
      acceptedTerms: true, acceptedCharte: true, acceptedMandat: true,
      rating: 0, jobs: 0, zone: 'Gustavia', phone: '0690 55 04 21', email: 'chloe@exemple.fr', photo: '' }];
    /* LA GRILLE DOIT ÊTRE LUE, sinon l'écran dit « Grille en cours de lecture… » — et
       il a raison : il refuse de montrer sa valeur de repli comme si c'était le tarif
       de Ti-Services. La scène la sème plutôt que de contourner la garde. */
    S.adminPricesLus = true;
    S.admin = { view: 'art', sel: 'a1', fact: null };
    window.__render();
  });
  await p.waitForTimeout(400);

  /* LA RANGÉE DES TARIFS, trouvée par son INTITULÉ et non par un rang — et l'on prend
     la rangée (`.fr`), jamais un ancêtre : un premier jet remontait jusqu'à la carte
     entière et capturait 6 274 px de fiche. */
  const bloc = await p.evaluateHandle(() => {
    const l = Array.from(document.querySelectorAll('#view .fr > *')).find((e) => /^Tarifs?\b/i.test((e.textContent || '').trim()));
    return l ? l.parentElement : null;
  });
  if (!(await p.evaluate((e) => !!e, bloc))) {
    console.log('✗ rangée « Tarifs » introuvable. Intitulés rendus :');
    console.log(await p.evaluate(() => Array.from(document.querySelectorAll('#view .fr')).map((r) => (r.firstElementChild || {}).textContent || '').join(' | ').slice(0, 700)));
    await b.close(); process.exit(1);
  }
  await p.evaluate((e) => e.scrollIntoView({ block: 'center' }), bloc);
  await p.waitForTimeout(200);
  /* ON CAPTURE L'UNION de la rangée et de ce qu'on ajoute : `elementHandle.screenshot`
     ne prend qu'UN élément, et la proposition vit à côté de ce qu'elle complète. */
  const tirer = async (n) => {
    const f = path.join(SORTIE, n + '.png');
    const r = await p.evaluate(() => {
      const l = Array.from(document.querySelectorAll('#view .fr > *')).find((e) => /^Tarifs?\b/i.test((e.textContent || '').trim()));
      const rects = [l.parentElement.getBoundingClientRect()];
      const m = document.querySelector('[data-maq]'); if (m) rects.push(m.getBoundingClientRect());
      const x = Math.min.apply(null, rects.map((b) => b.left)), y = Math.min.apply(null, rects.map((b) => b.top));
      return { x: x - 6, y: y - 6, width: Math.max.apply(null, rects.map((b) => b.right)) - x + 12, height: Math.max.apply(null, rects.map((b) => b.bottom)) - y + 12 };
    });
    await p.screenshot({ path: f, clip: r });
    return f;
  };
  const rendus = [['avant', await tirer('3-console-avant')]];

  const poser = (variante) => p.evaluate((variante) => {
    const l = Array.from(document.querySelectorAll('#view .fr > *')).find((e) => /^Tarifs?\b/i.test((e.textContent || '').trim()));
    const champ = l.parentElement;
    champ.querySelectorAll('[data-maq]').forEach((e) => e.remove());
    const anciens = champ.querySelectorAll('[data-maq-cache]');
    anciens.forEach((e) => { e.style.display = ''; e.removeAttribute('data-maq-cache'); });

    const actes = (window.__cat.list('massage') || []);
    /* LA MAQUETTE CALCULE LE NET AU TAUX PUBLIÉ (COMMISSION = 15 %) PARCE QUE LE
       HARNAIS N'EXPOSE PAS `proNetHint`. L'ÉCRAN RÉEL DEVRA L'APPELER, JAMAIS
       RECALCULER : la commission effective dépend du prix et de la cohorte
       d'inscription (`effCommPct(signupCommPct(), p)`), et un second barème écrit ici
       finirait par ne plus dire ce que la facture prélève. */
    const net = (px) => Math.round(px * 0.85);
    const bloc = document.createElement('div');
    bloc.setAttribute('data-maq', '1');
    bloc.style.cssText = 'margin-top:10px;padding:12px 13px;background:var(--sand-2);border:1px solid var(--hair);border-radius:12px';

    const dem = 128; // ce qu'elle demande, en net/h
    let h = '<div class="mini" style="font-weight:700">Ses tarifs · Massage</div>'
      + '<div class="mini" style="margin-top:3px;color:var(--muted)">Une case vide garde la grille Ti-Services. '
      + 'Vous ne réglez que ce qui s\'en écarte.</div>';

    h += actes.map(function (a, i) {
      /* LE CAS QUI COMPTE EST LE TROISIÈME : UNE SEULE LIGNE RÉGLÉE. Une case vide
         n'est pas zéro — c'est « il reste à la grille sur cette prestation ». Un
         prestataire peut donc s'écarter sur UNE ligne et pas sur les trois autres, ce
         qu'un seul net €/h ne pouvait pas dire. */
      const sien = (i === 1) ? 150 : (i === 3 ? 260 : '');
      const ecart = sien ? Math.round((sien - a.price) / a.price * 100) : 0;
      return '<div class="row" style="gap:8px;align-items:center;margin-top:9px">'
        + '<span class="mini" style="flex:1;min-width:0">' + a.nm + '</span>'
        + '<span class="mini" style="flex:none;color:var(--muted);white-space:nowrap">' + a.price + ' €</span>'
        + '<input class="txt" value="' + sien + '" inputmode="decimal" placeholder="' + a.price + '"'
        + ' style="flex:none;width:72px;text-align:right;padding:6px 8px">'
        + '<span class="mini" style="flex:none;width:62px;text-align:right;white-space:nowrap">'
        + (sien ? ((ecart > 0 ? '+' : '') + ecart + ' %<br><span style="color:var(--muted)">' + net(sien) + ' € net</span>')
                : '<span style="color:var(--muted)">grille</span>') + '</span>'
        + '</div>';
    }).join('');

    if (variante === 'H2') {
      /* H2 — ET CE QU'ELLE A DEMANDÉ RESTE LISIBLE À CÔTÉ DE CE QU'ON LUI ACCORDE.
         Elle a demandé un NET à l'heure, la console règle un prix CLIENT : sans la
         conversion sous les yeux, on négocie à l'aveugle. Et l'on n'écrase pas sa
         demande avec sa décision — ce sont deux faits, pas un. */
      h += '<div class="mini" style="margin-top:10px;padding-top:9px;border-top:1px solid var(--hair);color:var(--muted)">'
        + 'Elle demandait <b>' + dem + ' € net/h</b>. Une heure à 150 € lui en laisse <b>' + net(150) + ' €</b>.</div>';
    }
    h += '<div class="row" style="gap:8px;margin-top:11px"><button class="btn sm ghost" style="flex:none">Tout remettre à la grille</button></div>';
    bloc.innerHTML = h;

    /* ON NE RETIRE PAS CE QUI EXISTE, ON LE GARDE AU-DESSUS : le souhait du prestataire
       est la matière de la discussion, la grille réglée en est l'issue. Effacer l'un
       quand on écrit l'autre, c'est perdre la trace de ce qu'il avait demandé. */
    /* PLEINE LARGEUR, APRÈS LA RANGÉE. Un premier jet l'appendait DANS la rangée : la
       fiche est une grille à deux colonnes (`.fr`), le bloc héritait donc de la colonne
       ÉTROITE du libellé et chaque ligne se cassait en cinq. */
    bloc.style.gridColumn = '1 / -1';
    champ.insertAdjacentElement('afterend', bloc);
  }, variante);

  for (const v of ['H', 'H2']) { await poser(v); await p.waitForTimeout(200); rendus.push([v, await tirer('3-console-apres-' + v)]); }
  console.log('\nMaquettes console :'); rendus.forEach(([n, f]) => console.log('  ' + n.padEnd(5) + ' ' + f));
  if (errs.length) console.log('\nErreurs de page : ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
