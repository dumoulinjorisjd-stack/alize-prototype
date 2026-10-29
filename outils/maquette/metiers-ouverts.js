/* MAQUETTE — « QUE DANS LES CATÉGORIES QUE JE CHOISIS D'OUVRIR À CETTE POSSIBILITÉ ».
 *
 * (l'éditeur, 29/10/2026.) Trois niveaux, et le métier est la PORTE :
 *   ① le métier autorise les catalogues propres — décidé ici, par la console ;
 *   ② un prestataire donné en reçoit un — sa fiche, maquette précédente ;
 *   ③ il peut le décocher lui-même depuis son profil — mais seulement si ① est ouvert.
 *
 * LA MAISON A DÉJÀ CE RÉGLAGE, SA PLACE ET SA CONVENTION : `S.adminMetier[svcId]`,
 * persisté dans `settings/catalog`, où « une clé vide retire l'entrée ». Et l'écran
 * porte déjà trois interrupteurs pour ce métier — dont `catchoix`, « le client peut
 * choisir son prestataire ». C'est le voisin exact : l'un ouvre le CHOIX, l'autre
 * ouvre le CATALOGUE, et le second n'a de sens que si le premier est ouvert.
 *
 *   node outils/maquette/metiers-ouverts.js
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
    S.adminPricesLus = true;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    S.admin = { view: 'home', sel: null }; window.__render();
  });
  await p.waitForTimeout(350);
  // Le vrai chemin de la console : Accueil › Prestations & tarifs › le métier.
  await p.click('[data-fold="a-prices"]'); await p.waitForTimeout(350);
  await p.click('[data-adm="priceopen:massage"]'); await p.waitForTimeout(450);

  const ancreOk = await p.evaluate(() => !!document.querySelector('[data-adm="catchoix:massage"]'));
  if (!ancreOk) { console.log('✗ interrupteur « catchoix » introuvable'); await b.close(); process.exit(1); }

  const tirer = async (n) => {
    const f = path.join(SORTIE, n + '.png');
    const r = await p.evaluate(() => {
      const sw = document.querySelector('[data-adm="catchoix:massage"]');
      let rang = sw; while (rang && !/between/.test(rang.className || '') && rang.parentElement) rang = rang.parentElement;
      const rects = [rang.getBoundingClientRect()];
      document.querySelectorAll('[data-maq]').forEach((m) => rects.push(m.getBoundingClientRect()));
      const x = Math.min.apply(null, rects.map((c) => c.left)), y = Math.min.apply(null, rects.map((c) => c.top));
      return { x: x - 10, y: y - 10, width: Math.max.apply(null, rects.map((c) => c.right)) - x + 20, height: Math.max.apply(null, rects.map((c) => c.bottom)) - y + 20 };
    });
    await p.evaluate(() => { const sw = document.querySelector('[data-adm="catchoix:massage"]'); sw.scrollIntoView({ block: 'center' }); });
    await p.waitForTimeout(180);
    const r2 = await p.evaluate(() => {
      const sw = document.querySelector('[data-adm="catchoix:massage"]');
      let rang = sw; while (rang && !/between/.test(rang.className || '') && rang.parentElement) rang = rang.parentElement;
      const rects = [rang.getBoundingClientRect()];
      document.querySelectorAll('[data-maq]').forEach((m) => rects.push(m.getBoundingClientRect()));
      const x = Math.min.apply(null, rects.map((c) => c.left)), y = Math.min.apply(null, rects.map((c) => c.top));
      return { x: x - 10, y: y - 10, width: Math.max.apply(null, rects.map((c) => c.right)) - x + 20, height: Math.max.apply(null, rects.map((c) => c.bottom)) - y + 20 };
    });
    await p.screenshot({ path: f, clip: r2.height > 0 ? r2 : r });
    return f;
  };
  const rendus = [['avant', await tirer('7-metier-avant')]];

  await p.evaluate((ouvert) => {
    document.querySelectorAll('[data-maq]').forEach((e) => e.remove());
    const sw = document.querySelector('[data-adm="catchoix:massage"]');
    let rang = sw; while (rang && !/between/.test(rang.className || '') && rang.parentElement) rang = rang.parentElement;
    /* ON CLONE LA RANGÉE RÉELLE de l'interrupteur voisin : mêmes classes, même
       interrupteur, même écartement — c'est le gabarit de cet écran, pas une imitation. */
    const n = rang.cloneNode(true);
    n.setAttribute('data-maq', '1');
    const t = n.querySelector('.sub'); if (t) t.textContent = 'Catalogue propre autorisé';
    const m = n.querySelector('.mini');
    if (m) m.innerHTML = 'Un prestataire de ce métier peut décocher la grille et proposer <b>ses propres prestations, autant qu\'il veut</b>. '
      + 'Il quitte alors les commandes aléatoires&nbsp;: les clients le choisissent, et voient sa carte à lui.';
    const i = n.querySelector('.switch');
    if (i) {
      i.setAttribute('data-adm', 'metcata:massage');
      i.style.background = 'var(--good)';
      const k = i.querySelector('.knob'); if (k) k.style.left = '25px';
    }
    rang.insertAdjacentElement('afterend', n);

    /* ET CE QUE LE MÉTIER FERMÉ DONNE, dit sur la même rangée plutôt que deviné : la
       phrase change, l'interrupteur aussi, et rien d'autre ne bouge. */
    if (!ouvert) {
      i.style.background = 'var(--hair)';
      const k = i.querySelector('.knob'); if (k) k.style.left = '3px';
      m.innerHTML = 'Fermé&nbsp;: tout le monde est à la grille Ti-Services sur ce métier. '
        + 'Les prestataires n\'ont pas la case dans leur profil, et la fiche d\'un prestataire ne la propose pas non plus.';
    }
  }, true);
  await p.waitForTimeout(250);
  rendus.push(['ouvert', await tirer('7-metier-ouvert')]);

  await p.evaluate(() => {
    const n = document.querySelector('[data-maq]');
    const i = n.querySelector('.switch'); i.style.background = 'var(--hair)';
    n.querySelector('.knob').style.left = '3px';
    n.querySelector('.mini').innerHTML = 'Fermé&nbsp;: tout le monde est à la grille Ti-Services sur ce métier. '
      + 'Les prestataires n\'ont pas la case dans leur profil, et la fiche d\'un prestataire ne la propose pas non plus.';
  });
  await p.waitForTimeout(220);
  rendus.push(['ferme', await tirer('7-metier-ferme')]);

  console.log('\nMétier, la porte :'); rendus.forEach(([n, f]) => console.log('  ' + n.padEnd(7) + ' ' + f));
  if (errs.length) console.log('\nErreurs de page : ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
