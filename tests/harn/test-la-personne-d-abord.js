/* LA PERSONNE D'ABORD, PUIS SA CARTE (l'éditeur, 19/11/2026).
   « On choisit la prestation, on descend, on clique sur ce prestataire parce qu'on veut
   lui, mais finalement il ne propose pas ces services à ces prix. » Mesuré avant : en
   coiffure, choisir une prestataire qui a sa carte retirait la prestation cochée, disait
   « choisissez parmi les siennes » dans un message qui s'efface, et n'en affichait
   AUCUNE (0 ligne sur 3, les dix familles de la grille restant à l'écran). */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const CHLOE = [{id: 'c1', nm: 'Coupe et brushing signature', price: 85, min: 75},
  {id: 'c2', nm: 'Balayage soleil', price: 180, min: 150}, {id: 'c3', nm: 'Soin profond à la kératine', price: 120, min: 90}];

async function ouvrir(b, largeur, svc, lang) {
  const p = await b.newPage({viewport: {width: largeur, height: 900}});
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);
  await p.evaluate(({CHLOE, svc, lang}) => {
    window.__setFB({auth: {currentUser: {uid: 'c1', email: 'c@e.fr'}}, db: {}, functions: {},
      f: {doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({exists: () => false, data: () => ({})})},
      fn: {httpsCallable: () => () => new Promise(() => {})}});
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = lang || 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.authView = null;
    S.account = {name: 'Claire', email: 'c@e.fr', uid: 'c1', role: 'client'};
    S._proDir = {}; S._proDir[svc] = {loading: false, list: [
      {uid: 'p1', name: 'Chloé Rivière', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: true, cat: CHLOE},
      {uid: 'p2', name: 'Maya Beauté', founder: true, cal: true, photo: null, siteMode: 'both', ownCat: false, cat: null}]};
    window.__render();
    const t = document.createElement('button'); t.dataset.svc = svc; document.getElementById('view').appendChild(t); t.click();
  }, {CHLOE, svc, lang});
  await p.waitForTimeout(250);
  return {p, errs};
}
const etat = (p) => p.evaluate(() => {
  const blocs = [...document.querySelectorAll('#view .cfg-bloc')].map((c) => ({t: c.querySelector('h3').textContent.trim(), pref: !!c.querySelector('[data-prefart]')}));
  const presta = [...document.querySelectorAll('#view .cfg-bloc')][1];
  return {blocs, titre: blocs[1] && blocs[1].t,
    sesLignes: ['c1', 'c2', 'c3'].filter((id) => document.querySelector('[data-actpick="' + id + '"]')).length,
    familles: document.querySelectorAll('.actgrp').length,
    sous: (document.querySelector('#view .h-hello + .sub') || {}).textContent || '',
    retire: presta ? ((presta.querySelector('p.mini[style*="coral"]') || {}).textContent || '') : '',
    acts: (window.__S.draft.acts || []).map((a) => a.id + ':' + a.price),
    libelleRedit: !!document.querySelector('.cfg-bloc .field > label') && [...document.querySelectorAll('.cfg-bloc .field > label')].some((l) => /Votre prestataire/.test(l.textContent)),
    deborde: document.documentElement.scrollWidth > innerWidth};
});

(async () => {
  const b = await chromium.launch(o);
  console.log('A — coiffure (grille par familles), au téléphone');
  { const {p, errs} = await ouvrir(b, 390, 'coiffure');
    let e = await etat(p);
    ok(e.blocs[0] && /Avec qui/.test(e.blocs[0].t) && e.blocs[0].pref, '« Avec qui ? » est le PREMIER bloc, et porte le choix du prestataire');
    ok(!e.blocs.slice(1).some((x) => x.pref), 'le choix n’est plus au fond de « Précisions »');
    ok(!e.libelleRedit, 'et « Votre prestataire » ne redit pas le titre du bloc');
    ok(e.titre === 'Choisissez vos prestations' && e.familles > 1 && /prix fixes Ti-Services/.test(e.sous),
      'le premier disponible : la grille, rangée par familles, aux prix Ti-Services, comme avant');
    await p.click('[data-actgrp*="coupe"]'); await p.waitForTimeout(100);
    await p.click('.actgrp.open [data-actpick]'); await p.waitForTimeout(100);
    await p.click('[data-prefart="p1"]'); await p.waitForTimeout(150);
    e = await etat(p);
    ok(e.titre === 'La carte de Chloé Rivière', 'Chloé choisie : le bloc s’appelle « La carte de Chloé Rivière » (' + e.titre + ')');
    ok(e.sesLignes === 3 && e.familles === 0, 'ses 3 prestations sont à l’écran, plus les familles de la grille (' + e.sesLignes + ' lignes, ' + e.familles + ' familles)');
    ok(/aux prix de Chloé Rivière/.test(e.sous), 'la phrase du haut ne dit plus « prix fixes Ti-Services »');
    ok(e.acts.length === 0 && /Retiré de votre commande, absent de sa carte/.test(e.retire) && /coupe garçonne/.test(e.retire),
      'la prestation de la grille cochée avant est retirée, et c’est DIT dans la liste, pas dans un message qui s’efface');
    await p.click('[data-actpick="c1"]'); await p.waitForTimeout(100);
    e = await etat(p);
    ok(e.acts.join() === 'c1:85' && !e.retire, 'elle coche sa prestation, au prix de sa carte ; la mention du retrait s’en va');
    await p.click('[data-prefart="p2"]'); await p.waitForTimeout(150);
    e = await etat(p);
    ok(e.titre === 'Choisissez vos prestations' && e.familles > 1, 'Maya, à la grille : retour à la grille, sans rien inventer');
    ok(!e.deborde, 'rien ne déborde à 390 px');
    ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 120) + ')');
    await p.close(); }

  console.log('B — massage (liste simple) et ordinateur');
  { const {p} = await ouvrir(b, 1280, 'massage');
    let e = await etat(p);
    ok(/Avec qui/.test(e.blocs[0].t), 'même ordre sur un métier à liste simple, sur ordinateur');
    await p.click('[data-prefart="p1"]'); await p.waitForTimeout(150);
    e = await etat(p);
    ok(e.titre === 'La carte de Chloé Rivière' && e.sesLignes === 3, 'sa carte, à son nom');
    await p.close(); }

  console.log('C — en anglais');
  { const {p} = await ouvrir(b, 390, 'coiffure', 'en');
    await p.click('[data-prefart="p1"]'); await p.waitForTimeout(250);
    const t = await p.evaluate(() => [...document.querySelectorAll('#view .cfg-bloc h3')].slice(0, 2).map((h) => h.textContent.trim()));
    ok(t[0] === 'With whom?' && t[1] === 'Chloé Rivière’s menu', 'les deux titres se traduisent (' + t.join(' | ') + ')');
    await p.close(); }
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
