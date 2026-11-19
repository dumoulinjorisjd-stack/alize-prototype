/* MAQUETTE — « ON CLIQUE SUR CE PRESTATAIRE PARCE QU'ON VEUT LUI, MAIS FINALEMENT IL NE
 * PROPOSE PAS CES SERVICES À CES PRIX » (l'éditeur, 19/11/2026).
 *
 * AVANT : vraies captures de l'écran de commande d'aujourd'hui. Le client coche une
 * prestation de la GRILLE, descend jusqu'à « Précisions », touche la prestataire qui a
 * sa propre carte — et la liste, au-dessus, hors de sa vue, change sous lui.
 *
 * APRÈS : le même écran, dont on DÉPLACE seulement des blocs déjà rendus par l'app
 * (aucun code de l'app n'est modifié) : « Avec qui ? » passe en premier ; la personne
 * choisie, la liste juste en dessous devient SA carte, titrée à son nom. Rien n'est
 * comparé : la liste des prestataires ne dit pas qui a une carte.
 *
 *   node outils/maquette/choisir-la-personne-d-abord.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

const CHLOE = [{ id: 'c1', nm: 'Coupe et brushing signature', price: 85, min: 75 },
  { id: 'c2', nm: 'Balayage soleil', price: 180, min: 150 }, { id: 'c3', nm: 'Soin profond à la kératine', price: 120, min: 90 }];

async function ouvrir(b, largeur) {
  const p = await b.newPage({ viewport: { width: largeur, height: largeur < 600 ? 860 : 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(500);
  await p.evaluate((CHLOE) => {
    window.__setFB({ auth: { currentUser: { uid: 'c1', email: 'c@e.fr' } }, db: {}, functions: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) } });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.authView = null;
    S.account = { name: 'Claire', email: 'c@e.fr', uid: 'c1', role: 'client' };
    S._proDir = { coiffure: { loading: false, list: [
      { uid: 'p1', name: 'Chloé Rivière', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: true, cat: CHLOE },
      { uid: 'p2', name: 'Maya Beauté', founder: true, cal: true, photo: null, siteMode: 'both', ownCat: false, cat: null }] } };
    window.__render();
    const t = document.createElement('button'); t.dataset.svc = 'coiffure'; document.getElementById('view').appendChild(t); t.click();
  }, CHLOE);
  await p.waitForTimeout(300);
  return { p, errs };
}

const bloc = (p, re) => p.evaluateHandle((src) => {
  const re = new RegExp(src);
  return [...document.querySelectorAll('#view .cfg-bloc')].find((c) => re.test(c.querySelector('h3').textContent)) || null;
}, re.source);

async function tirerHaut(p, nom) {
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(SORTIE, nom + '.png') });
}
async function tirerBloc(p, nom, re) {
  const h = await bloc(p, re);
  await h.scrollIntoViewIfNeeded();
  await p.waitForTimeout(150);
  await h.screenshot({ path: path.join(SORTIE, nom + '.png') });
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);

  /* ── AVANT ── */
  {
    const { p, errs } = await ouvrir(b, 390);
    await p.click('[data-actgrp*="coupe"]');
    await p.waitForTimeout(150);
    await p.click('.actgrp.open [data-actpick]');
    await p.waitForTimeout(150);
    await tirerHaut(p, '1-avant-on-coche-dans-la-grille');
    await tirerBloc(p, '2-avant-on-descend-et-on-la-choisit', /Précisions/);
    await p.click('[data-prefart="p1"]');
    await p.waitForTimeout(200);
    const fait = await p.evaluate(() => ({
      toast: (document.getElementById('toast') || {}).textContent || '',
      sesLignesVisibles: ['c1', 'c2', 'c3'].filter((id) => document.querySelector('[data-actpick="' + id + '"]')).length,
      famillesDeLaGrille: document.querySelectorAll('.actgrp').length,
      coche: (window.__S.draft.acts || []).map((a) => a.nm),
      sousTitre: (document.querySelector('#view .h-hello + .sub') || {}).textContent || '',
    }));
    await tirerBloc(p, '3-avant-apres-son-choix-elle-coche', /Précisions/);
    await tirerHaut(p, '4-avant-en-remontant');
    console.log('AVANT, une fois Chloé choisie :', JSON.stringify(fait));
    if (errs.length) console.log('  erreurs JS :', errs.join(' | ').slice(0, 200));
    await p.close();
  }

  /* ── APRÈS (blocs déplacés, rien de recodé) ── */
  const apres = async (largeur, suffixe) => {
    const { p } = await ouvrir(b, largeur);
    // « Avec qui ? » passe en premier : on prend le champ que l'app rend déjà.
    await p.evaluate(() => {
      const presta = [...document.querySelectorAll('#view .cfg-bloc')].find((c) => /Choisissez vos prestations/.test(c.querySelector('h3').textContent));
      const champ = document.querySelector('[data-prefart]').closest('.field');
      const qui = document.createElement('div'); qui.className = 'card cfg-bloc';
      const lieu = [...document.querySelectorAll('#view .cfg-bloc')].find((c) => /Lieu/.test(c.querySelector('h3').textContent));
      const ico = lieu ? (lieu.querySelector('h3 svg') || {}).outerHTML || '' : '';
      qui.innerHTML = '<h3>' + ico + 'Avec qui ?</h3>';
      champ.querySelector('label').remove();
      qui.appendChild(champ);
      presta.parentNode.insertBefore(qui, presta);
    });
    await tirerHaut(p, '5-apres-on-choisit-d-abord-la-personne' + suffixe);
    // Elle choisit Chloé : la liste juste en dessous devient SA carte, à son nom.
    await p.evaluate((CHLOE) => {
      document.querySelectorAll('[data-prefart]').forEach((x) => x.classList.toggle('on', x.dataset.prefart === 'p1'));
      const presta = [...document.querySelectorAll('#view .cfg-bloc')].find((c) => /Choisissez vos prestations/.test(c.querySelector('h3').textContent));
      const h = presta.querySelector('h3');
      h.innerHTML = h.innerHTML.replace(/Choisissez vos prestations/, 'La carte de Chloé Rivière');
      const sub = document.querySelector('#view .h-hello + .sub');
      if (sub) sub.textContent = 'Composez votre commande aux prix de Chloé Rivière, total ferme.';
      const grps = presta.querySelector('.actgrps');
      const liste = document.createElement('div'); liste.className = 'actlist';
      liste.innerHTML = CHLOE.map((a) => '<div class="actrow"><button class="actmain"><span class="actck"></span><span class="actnm">' + a.nm + '</span><span class="actpr">' + a.price + ' €</span></button></div>').join('');
      grps.replaceWith(liste);
    }, CHLOE);
    await tirerHaut(p, '6-apres-sa-carte-juste-en-dessous' + suffixe);
    await p.close();
  };
  await apres(390, '');
  await apres(1280, '-ordinateur');
  await b.close();
  console.log('Maquettes dans ' + SORTIE);
})();
