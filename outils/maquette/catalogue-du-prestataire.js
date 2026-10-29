/* MAQUETTE — « DEPUIS LA CONSOLE, N'IMPORTE LEQUEL, ET LE CHOIX DOIT POUVOIR ÉVOLUER ».
 *
 * (l'éditeur, 29/10/2026). Trois états, parce que c'est la RÉVERSIBILITÉ qui est le
 * sujet — pas le réglage : à la grille, hors grille, et remis à la grille alors qu'il
 * a déjà un catalogue.
 *
 * CE QU'IL A SIGNÉ N'EST PAS CE QU'ON DÉCIDE. La fiche porte déjà une pastille
 * « Grille tarifaire » dans la rangée « Engagements », et son commentaire dit ce
 * qu'elle est : « Preuve d'acceptation : ce qui protège Ti-Services en cas de litige ».
 * La décocher d'un clic de console réécrirait une signature. L'arrangement
 * d'aujourd'hui est donc une rangée À PART ; la preuve reste intacte à côté.
 *
 *   node outils/maquette/catalogue-du-prestataire.js
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
    S.adminPricesLus = true;
    /* UNE PRESTATAIRE QUI A BEL ET BIEN ACCEPTÉ LA GRILLE À L'INSCRIPTION : c'est le cas
       que « n'importe lequel » ouvre — elle a signé, et l'on peut tout de même lui
       donner son catalogue sans toucher à sa signature. */
    S.adminArtisans = [{ id: 'a1', name: 'Chloé R.', status: 'valide', type: 'entreprise',
      cats: ['massage'], rates: { massage: 110 }, rate: 110, acceptsGrille: true,
      acceptedTerms: true, acceptedCharte: true, acceptedMandat: true, termsVersion: '3',
      siret: '12345678901234', insured: true, rating: 0, jobs: 0, zone: 'Gustavia',
      phone: '0690 55 04 21', email: 'chloe@exemple.fr', photo: '' }];
    S.admin = { view: 'art', sel: 'a1', fact: null };
    window.__render();
  });
  await p.waitForTimeout(400);

  const ancre = () => p.evaluate(() => {
    const l = Array.from(document.querySelectorAll('#view .fr > *')).find((e) => /^Engagements/i.test((e.textContent || '').trim()));
    return !!l;
  });
  if (!(await ancre())) { console.log('✗ rangée « Engagements » introuvable'); await b.close(); process.exit(1); }

  const tirer = async (n) => {
    const f = path.join(SORTIE, n + '.png');
    const r = await p.evaluate(() => {
      const l = Array.from(document.querySelectorAll('#view .fr > *')).find((e) => /^Engagements/i.test((e.textContent || '').trim()));
      const rects = [l.parentElement.getBoundingClientRect()];
      document.querySelectorAll('[data-maq]').forEach((m) => rects.push(m.getBoundingClientRect()));
      const x = Math.min.apply(null, rects.map((c) => c.left)), y = Math.min.apply(null, rects.map((c) => c.top));
      return { x: x - 8, y: y - 8, width: Math.max.apply(null, rects.map((c) => c.right)) - x + 16, height: Math.max.apply(null, rects.map((c) => c.bottom)) - y + 16 };
    });
    await p.screenshot({ path: f, clip: r });
    return f;
  };

  const poser = (etat) => p.evaluate((etat) => {
    document.querySelectorAll('[data-maq]').forEach((e) => e.remove());
    const l = Array.from(document.querySelectorAll('#view .fr > *')).find((e) => /^Engagements/i.test((e.textContent || '').trim()));
    const rangee = l.parentElement;
    const net = (px) => Math.round(px * 0.85); // l'écran réel appellera `proNetHint`

    /* UNE RANGÉE DE FICHE, au gabarit de la maison : libellé à gauche, valeur à droite,
       pour que celle-ci ne reparte pas avec sa propre taille et son propre alignement. */
    const neuve = document.createElement('div');
    neuve.className = rangee.className; neuve.setAttribute('data-maq', '1');
    const gauche = document.createElement('div');
    gauche.className = (rangee.firstElementChild || {}).className || '';
    gauche.textContent = 'Catalogue';
    const droite = document.createElement('div');
    droite.className = (rangee.lastElementChild || {}).className || '';

    const coche = (on) => '<span style="display:inline-flex;width:19px;height:19px;border-radius:6px;flex:none;'
      + 'align-items:center;justify-content:center;font-size:12px;font-weight:800;'
      + (on ? 'background:var(--teal-deep);color:#fff">✓' : 'border:1.5px solid var(--hair);background:#fff">')
      + '</span>';
    const tete = (on, txt) => '<div class="row" style="gap:9px;align-items:flex-start">' + coche(on)
      + '<div style="min-width:0"><b>' + txt + '</b></div></div>';

    let h = '';
    if (etat === 'N1') {
      h = tete(true, 'Grille tarifaire Ti-Services')
        + '<div class="mini" style="margin-top:5px;color:var(--muted)">Il reçoit les commandes aléatoires, et les clients peuvent aussi le choisir. '
        + 'Dans les deux cas, le catalogue et les prix sont les nôtres.</div>'
        + '<div class="mini" style="margin-top:7px">Décocher lui donne <b>son propre catalogue</b>&nbsp;: il ne recevra plus de commandes aléatoires, '
        + 'et les clients qui le choisissent verront ses prestations et ses tarifs.</div>';
    }
    if (etat === 'N2' || etat === 'N3') {
      const sien = [['Massage californien · 1 h', 150], ['Deep tissue · 1 h 15', 185],
        ['Rituel signature · 1 h 30', 230], ['Duo en cabine · 1 h', 260]];
      if (etat === 'N2') {
        h = tete(false, 'Son propre catalogue')
          + '<div class="mini" style="margin-top:5px;color:var(--muted)">Il ne reçoit pas de commandes aléatoires. Les clients le choisissent, et voient ceci.</div>'
          + '<div style="margin-top:10px;padding:11px 12px;background:var(--sand-2);border:1px solid var(--hair);border-radius:12px">'
          + '<div class="mini" style="font-weight:700">Massage</div>'
          /* DEUX LIGNES PAR PRESTATION, ET C'EST MESURÉ : la colonne de valeur d'une
             fiche fait ~230 px, quatre contrôles sur une rangée écrasaient le nom à
             46 px — « Ma… », « De… », « Rit… ». Le nom prend donc sa ligne. */
          + sien.map(function (a) {
              return '<div style="margin-top:10px">'
                + '<input class="txt" value="' + a[0] + '" style="width:100%;padding:6px 8px">'
                + '<div class="row" style="gap:7px;align-items:center;margin-top:5px">'
                + '<input class="txt" value="' + a[1] + '" inputmode="decimal" style="flex:none;width:72px;text-align:right;padding:6px 8px">'
                + '<span class="mini" style="flex:1;color:var(--muted);white-space:nowrap">' + net(a[1]) + ' € net pour lui</span>'
                + '<button class="btn ghost sm" style="flex:none;width:auto;padding:5px 9px;margin:0">✕</button></div></div>';
            }).join('')
          + '<button class="btn ghost sm" style="width:auto;margin:10px 0 0;padding:7px 11px">+ Ajouter une prestation</button>'
          + '</div>';
      } else {
        /* N3 — REMIS À LA GRILLE, ET SON CATALOGUE EST GARDÉ. « On retire la question,
           jamais la valeur » : effacer ses quatre prestations parce qu'on recoche une
           case, ce serait jeter un travail qu'on ne sait pas refaire — et le choix ne
           pourrait plus « évoluer », il ne pourrait qu'aller dans un sens. */
        h = tete(true, 'Grille tarifaire Ti-Services')
          + '<div class="mini" style="margin-top:5px;color:var(--muted)">Il reçoit de nouveau les commandes aléatoires, au catalogue et aux prix Ti-Services.</div>'
          + '<div class="mini" style="margin-top:8px;padding:9px 11px;background:var(--sand-2);border:1px solid var(--hair);border-radius:10px">'
          + 'Ses <b>4 prestations</b> sont conservées, simplement masquées. Décochez pour les remettre en service. '
          + '<span style="color:var(--muted)">Les commandes déjà passées à ses tarifs ne changent pas.</span></div>';
      }
    }
    droite.innerHTML = h;
    neuve.appendChild(gauche); neuve.appendChild(droite);
    rangee.insertAdjacentElement('afterend', neuve);
  }, etat);

  const rendus = [];
  for (const e of ['N1', 'N2', 'N3']) { await poser(e); await p.waitForTimeout(220); rendus.push([e, await tirer('5-console-' + e)]); }
  console.log('\nTrois états :'); rendus.forEach(([n, f]) => console.log('  ' + n + '  ' + f));
  if (errs.length) console.log('\nErreurs de page : ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
