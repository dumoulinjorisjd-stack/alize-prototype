/* LE CATALOGUE D'UN PRESTATAIRE S'ÉDITE DANS SA FICHE, AU TÉLÉPHONE AUSSI.
   Relevé par l'éditeur le 19/11/2026 : à 393 px, la phrase de durée s'écrasait à 8 px de
   large sur 504 de haut (une lettre par ligne, un grand vide), le ✕ sortait du cadre de
   83 px et le menu affichait « mi » au lieu de « min ». La colonne de valeur de la fiche
   ne laissait que 205 px au formulaire. Mesuré dans le rendu, des deux côtés. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const mesurer = async (b, largeur) => {
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: largeur, height: 1400}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(500);
  const m = await p.evaluate(() => {
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.account = {name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin'};
    S.persona = 'admin'; S.onboarded = true; S.authView = null; S.lang = 'fr';
    S.adminMetier = Object.assign({}, S.adminMetier, {coiffure: {catalogueLibre: true}});
    S.adminArtisans = [{id: 'a1', uid: 'a1', real: true, name: 'Vincent Beaudouin', status: 'valide', siret: '12345678901234', cats: ['coiffure'], rates: {}, jobs: 0,
      mollieStatus: 'active', skipAt: {}, ownCatalog: {coiffure: {on: true, lines: [{nm: '', price: null}, {nm: 'Coupe femme et brushing long', price: 60}]}}}];
    S.adminArtsLoaded = true; S.admin = {view: 'art', sel: 'a1'}; window.__render();
    const bloc = document.querySelector('.catbloc');
    if (!bloc) return null;
    const bl = bloc.getBoundingClientRect();
    const r = (e) => e.getBoundingClientRect();
    const phrases = [...bloc.querySelectorAll('[data-catdinfo]')].map(r);
    const retirer = [...bloc.querySelectorAll('[data-catdel]')].map(r);
    const prixTxt = [...bloc.querySelectorAll('[data-catpx] + span')].map(r);
    const unites = [...bloc.querySelectorAll('[data-catdu]')];
    const valeurs = [...bloc.querySelectorAll('[data-catdv]')].map(r);
    const rangee = bloc.closest('.fr');
    const k = rangee.querySelector('.k').getBoundingClientRect();
    // Largeur nécessaire à « min » dans le menu : le texte mesuré + le retrait de gauche + la place du chevron.
    const sel = unites[0], cs = getComputedStyle(sel);
    const cv = document.createElement('canvas').getContext('2d'); cv.font = cs.font;
    const besoin = cv.measureText('min').width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    if (!(bl.width > 0)) return {invisible: true};
    return {
      blocL: Math.round(bl.width),
      deborde: Math.max(...[...bloc.querySelectorAll('*')].map((e) => Math.round(r(e).right - bl.right))),
      phraseL: Math.min(...phrases.map((q) => Math.round(q.width))), phraseH: Math.max(...phrases.map((q) => Math.round(q.height))),
      retirerDedans: retirer.every((q) => q.right <= bl.right + 0.5),
      prixH: Math.max(...prixTxt.map((q) => Math.round(q.height))),
      menuAssez: sel.clientWidth + 0.5 >= besoin, menuL: sel.clientWidth, besoin: Math.round(besoin),
      memeLigne: Math.abs(phrases[0].top + phrases[0].height / 2 - (valeurs[0].top + valeurs[0].height / 2)) < 12,
      libelleDessus: k.bottom <= bl.top + 1, libelleAGauche: k.right <= bl.left,
      pageDeborde: document.documentElement.scrollWidth > innerWidth,
    };
  });
  await ctx.close();
  return {m, errs};
};

(async () => {
  const b = await chromium.launch(o);
  for (const largeur of [393, 360]) {
    console.log('Téléphone ' + largeur + ' px');
    const {m, errs} = await mesurer(b, largeur);
    ok(m && !m.invisible, 'le catalogue s’ouvre dans la fiche, et se voit');
    if (!m || m.invisible) continue;
    ok(m.blocL >= 280, 'le formulaire prend la largeur de la fiche (' + m.blocL + ' px, il en avait 205)');
    ok(m.libelleDessus, 'le libellé « Catalogue » passe au-dessus');
    ok(m.deborde <= 0, 'rien ne sort du cadre (' + m.deborde + ' px)');
    ok(m.retirerDedans, 'le ✕ reste dans le cadre');
    ok(m.phraseL >= 150 && m.phraseH <= 40, 'la phrase de durée se lit en ligne (' + m.phraseL + ' × ' + m.phraseH + ' px, elle faisait 8 × 504)');
    ok(m.prixH <= 40, 'le prix et le net tiennent sur une ou deux lignes (' + m.prixH + ' px)');
    ok(m.menuAssez, 'le menu montre « min » en entier (' + m.menuL + ' px pour ' + m.besoin + ' nécessaires)');
    ok(!m.pageDeborde, 'la page ne déborde pas');
    ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 120) + ')');
  }
  console.log('Ordinateur 1280 px');
  const {m} = await mesurer(b, 1280);
  ok(m && !m.invisible && m.libelleAGauche, 'le libellé reste dans sa colonne, à gauche');
  ok(m && m.memeLigne, 'la phrase de durée reste sur la ligne des champs');
  ok(m && m.deborde <= 0 && m.menuAssez, 'rien ne sort du cadre, « min » se lit en entier');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
