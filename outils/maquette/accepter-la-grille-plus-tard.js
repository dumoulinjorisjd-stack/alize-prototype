/* MAQUETTE — « UN PRESTATAIRE QUI A REFUSÉ LA GRILLE L'ACCEPTE PLUS TARD » (19/11/2026).
 *
 * Décision de l'éditeur, le même jour : qui a refusé la grille ne reçoit plus aucune
 * commande aléatoire (horsGrilleSur). Il faut donc une porte de retour, et elle est
 * CHEZ LUI : `acceptsGrille` est la trace de ce qu'il a signé, la console ne la
 * réécrit pas. Accepter plus tard est une NOUVELLE acceptation, datée.
 *
 * AVANT : la vraie carte « Mes tarifs » d'aujourd'hui, pour un coiffeur qui a refusé la
 * grille — elle lui dit « vous recevez les commandes aléatoires », ce qui n'est plus vrai.
 * APRÈS : la même carte, dont on remplace seulement le texte et ajoute le geste (aucun
 * code de l'app n'est modifié). Deux cas : métier ouvert aux cartes, et métier fermé
 * (aujourd'hui, pas de carte du tout : il n'aurait aucun moyen de revenir).
 *
 *   node outils/maquette/accepter-la-grille-plus-tard.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

async function ouvrir(b, ouvert) {
  const p = await b.newPage({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(500);
  await p.evaluate((ouvert) => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.authView = null;
    S.account = { name: 'Vincent', email: 'v@e.fr', uid: 'a1', role: 'artisan' };
    S.persona = 'pro'; S.proValidated = true; S.proStatus = 'valide'; S.proCats = ['coiffure'];
    S.adminMetier = Object.assign({}, S.adminMetier, { coiffure: { catalogueLibre: ouvert } });
    S.proOwnCatalog = {}; S.proNav = 'account';
    S._fold = Object.assign({}, S._fold, { 'p-tarifs': true });
    window.__render();
  }, ouvert);
  await p.waitForTimeout(300);
  return p;
}
const carte = (p) => p.evaluateHandle(() => {
  const h = [...document.querySelectorAll('.foldc')].find((c) => /Mes tarifs/.test(c.textContent));
  return h || null;
});
async function tirer(p, nom) {
  const h = await carte(p);
  await h.scrollIntoViewIfNeeded(); await p.waitForTimeout(120);
  const r = await h.boundingBox();
  await p.screenshot({ path: path.join(SORTIE, nom + '.png'), clip: { x: 0, y: Math.max(0, r.y - 12), width: 390, height: Math.min(r.height + 24, 1500) } });
}

const PROPOSE = `
  <div style="margin-top:14px;padding-top:13px;border-top:1px solid var(--hair)">
    <b style="font-size:14px">Vous préférez la grille Ti-Services&nbsp;?</b>
    <p class="mini" style="margin-top:4px;color:var(--muted);line-height:1.5">En coiffure, vous recevrez alors les demandes ouvertes à tous, aux prix de la grille.</p>
    <button class="btn ghost sm" style="width:auto;margin-top:10px;padding:9px 14px">Appliquer la grille en coiffure</button>
  </div>`;

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);

  // 1. Métier ouvert aux cartes : la carte existe, et ment désormais pour lui.
  let p = await ouvrir(b, true);
  if (!(await carte(p)).asElement()) { console.log('✗ carte « Mes tarifs » introuvable'); process.exit(1); }
  await tirer(p, '7-avant-mes-tarifs-hors-grille');
  await p.evaluate((PROPOSE) => {
    const c = [...document.querySelectorAll('.foldc')].find((x) => /Mes tarifs/.test(x.textContent));
    const t = c.querySelector('p.mini');
    t.innerHTML = 'Vous n’avez pas accepté la <b>grille Ti-Services</b> en coiffure&nbsp;: vous ne recevez pas les demandes ouvertes à tous. Posez vos prestations, les clients qui vous choisissent verront <b>votre carte</b>.';
    c.querySelector('.catbloc').insertAdjacentHTML('afterend', PROPOSE);
    const st = c.querySelector('.fh-sub'); if (st) st.textContent = 'Hors grille · coiffure';
  }, PROPOSE);
  await tirer(p, '8-apres-mes-tarifs-hors-grille');
  await p.close();

  // 2. Métier fermé aux cartes : aujourd'hui, aucune carte. Après : la seule porte.
  p = await ouvrir(b, false);
  const existe = !!(await carte(p)).asElement();
  console.log('Métier fermé, carte « Mes tarifs » aujourd’hui :', existe ? 'présente' : 'ABSENTE');
  await p.evaluate((PROPOSE) => {
    // Le dessin de la carte est celui que l'app rend quand le métier est ouvert : on le
    // relève, on referme le métier, et on ne garde que la porte.
    const S = window.__S;
    S.adminMetier.coiffure.catalogueLibre = true; window.__render();
    const modele = [...document.querySelectorAll('.foldc')].find((x) => /Mes tarifs/.test(x.textContent)).cloneNode(true);
    S.adminMetier.coiffure.catalogueLibre = false; window.__render();
    const sous = modele.querySelector('.fh-sub'); if (sous) sous.textContent = 'Hors grille · coiffure';
    modele.querySelector('.fold-body').innerHTML = '<p class="mini" style="color:var(--muted);line-height:1.5">Vous n’avez pas accepté la <b>grille Ti-Services</b> en coiffure&nbsp;: vous ne recevez pas les demandes ouvertes à tous.</p>'
      + PROPOSE.replace('margin-top:14px;padding-top:13px;border-top:1px solid var(--hair)', 'margin-top:8px');
    const voisin = [...document.querySelectorAll('.foldc')].find((x) => /Lieu d/.test(x.textContent)) || document.querySelector('.foldc');
    voisin.parentNode.insertBefore(modele, voisin);
  }, PROPOSE);
  await tirer(p, '9-apres-metier-ferme');
  await p.close();
  await b.close();
  console.log('Maquettes dans ' + SORTIE);
})();
