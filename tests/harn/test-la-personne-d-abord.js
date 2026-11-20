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

async function ouvrir(b, largeur, svc, lang, liste, histo) {
  const p = await b.newPage({viewport: {width: largeur, height: 900}});
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);
  await p.evaluate(({CHLOE, svc, lang, liste, histo}) => {
    window.__setFB({auth: {currentUser: {uid: 'c1', email: 'c@e.fr'}}, db: {}, functions: {},
      f: {doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({exists: () => false, data: () => ({})})},
      fn: {httpsCallable: () => () => new Promise(() => {})}});
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = lang || 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.authView = null;
    S.account = {name: 'Claire', email: 'c@e.fr', uid: 'c1', role: 'client'};
    if (histo) S.history = histo;
    S._proDir = {}; S._proDir[svc] = {loading: false, list: liste || [
      {uid: 'p1', name: 'Chloé Rivière', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: true, cat: CHLOE},
      {uid: 'p2', name: 'Maya Beauté', founder: true, cal: true, photo: null, siteMode: 'both', ownCat: false, cat: null}]};
    window.__render();
    const t = document.createElement('button'); t.dataset.svc = svc; document.getElementById('view').appendChild(t); t.click();
  }, {CHLOE, svc, lang, liste, histo});
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
  const CH = {uid: 'p1', name: 'Chloé Rivière', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: true, alea: false, cat: CHLOE};
  const LEA = {uid: 'p3', name: 'Léa Martin', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: true, alea: false,
    cat: [{id: 'l1', nm: 'Coupe courte', price: 60, min: 45}]};
  const vue = (p) => p.evaluate(() => ({
    premierDispo: !!document.querySelector('[data-prefart=""]'),
    choisi: window.__S.draft.preferredUid || null,
    titre: ([...document.querySelectorAll('#view .cfg-bloc h3')][1] || {}).textContent || '',
    lignes: document.querySelectorAll('[data-actpick]').length, familles: document.querySelectorAll('.actgrp').length,
    sous: (document.querySelector('#view .h-hello + .sub') || {}).textContent || '',
    cta: (document.querySelector('[data-cfg="confirm"]') || {}).textContent || '', ctaOff: !!(document.querySelector('[data-cfg="confirm"]') || {}).disabled,
    promet: /proposer à tous/.test(document.getElementById('view').textContent)}));

  console.log('D — un seul prestataire, avec sa carte (l’éditeur, 19/11/2026)');
  { const {p, errs} = await ouvrir(b, 390, 'coiffure', 'fr', [CH]);
    const v = await vue(p);
    ok(!v.premierDispo, '« Le premier disponible » n’est plus offert : personne ne prend la demande ouverte');
    ok(v.choisi === 'p1' && v.titre.trim() === 'La carte de Chloé Rivière' && v.lignes === 3 && v.familles === 0,
      'Chloé est choisie d’office et SA carte s’affiche, pas la grille (' + v.titre.trim() + ', ' + v.lignes + ' lignes, ' + v.familles + ' familles)');
    ok(!/prix fixes Ti-Services/.test(v.sous) && /Envoyer à Chloé/.test(v.cta), 'ni « prix fixes Ti-Services », et le bouton dit à qui ça part');
    ok(!v.promet, 'et l’écran ne promet plus « vous pourrez la proposer à tous »');
    ok(errs.length === 0, 'aucune erreur JS');
    await p.close(); }

  console.log('E — plusieurs, tous avec leur carte');
  { const {p} = await ouvrir(b, 390, 'coiffure', 'fr', [CH, LEA]);
    let v = await vue(p);
    ok(!v.premierDispo && !v.choisi, 'pas de « premier disponible », et personne n’est choisi à sa place');
    ok(v.lignes === 0 && v.familles === 0 && v.ctaOff, 'aucune grille à cocher, le bouton reste éteint tant qu’on n’a pas choisi');
    ok(/Choisissez votre prestataire, puis composez votre commande/.test(v.sous), 'la phrase du haut dit le geste');
    await p.click('[data-prefart="p3"]'); await p.waitForTimeout(150);
    v = await vue(p);
    ok(v.titre.trim() === 'La carte de Léa Martin' && v.lignes === 1, 'Léa choisie : sa carte');
    await p.close(); }

  console.log('F — un prestataire à la grille parmi eux : rien ne change');
  { const {p} = await ouvrir(b, 390, 'coiffure', 'fr', [CH, {uid: 'p2', name: 'Maya Beauté', founder: true, cal: true, photo: null, siteMode: 'both', ownCat: false, alea: true, cat: null}]);
    const v = await vue(p);
    ok(v.premierDispo && !v.choisi && v.familles > 1, '« Le premier disponible » reste, avec la grille');
    await p.close(); }

  console.log('G — hors grille sans carte : il ne prend pas la demande ouverte non plus');
  { const {p} = await ouvrir(b, 390, 'coiffure', 'fr', [{uid: 'p4', name: 'Tom Hors', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: false, alea: false, cat: null}]);
    const v = await vue(p);
    ok(!v.premierDispo && v.choisi === 'p4', 'l’annuaire le dit (alea), et l’écran ne propose pas une demande qui ne partirait vers personne');
    await p.close(); }

  console.log('I — « déjà venu » ne suffit plus : absent de l’annuaire, il n’est pas proposé (éditeur, 19/11/2026)');
  { const MAYA = {uid: 'p2', name: 'Maya Beauté', founder: true, cal: true, photo: null, siteMode: 'both', ownCat: false, alea: true, cat: null};
    const histo = [{providerUid: 'p9', provider: {nm: 'Tom Ancien'}, svc: 'coiffure'}, {providerUid: 'p2', provider: {nm: 'Maya Beauté'}, svc: 'coiffure'}];
    let r = await ouvrir(b, 390, 'coiffure', 'fr', [CH, MAYA], histo);
    let noms = await r.p.evaluate(() => [...document.querySelectorAll('[data-prefart]')].map((x) => x.dataset.prefart));
    ok(noms.indexOf('p9') < 0 && noms.indexOf('p2') >= 0,
      'Tom, venu chez elle mais absent de l’annuaire (hors grille sans carte), n’est plus proposé ; Maya, oui (' + noms.join(',') + ')');
    await r.p.close();
    r = await ouvrir(b, 390, 'coiffure', 'fr', [CH, MAYA, {uid: 'p9', name: 'Tom Ancien', founder: false, cal: false, photo: null, siteMode: 'both', ownCat: false, alea: true, cat: null}], histo);
    noms = await r.p.evaluate(() => [...document.querySelectorAll('[data-prefart]')].map((x) => x.dataset.prefart));
    ok(noms.indexOf('p9') >= 0, 'présent dans l’annuaire, il reste proposé (assertion arrière)');
    await r.p.close(); }

  console.log('H — le serveur dit qui prend la demande ouverte, avec la règle de la diffusion');
  { const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
    ok(/alea: CATP\.recoitLAleatoire\(a, svc, regMet\)/.test(fn), 'listProviders envoie alea = recoitLAleatoire, la même décision que la diffusion');
    const lp = fn.slice(fn.indexOf('exports.listProviders'), fn.indexOf('exports.listProviders') + 4000);
    ok(/if \(!CATP\.commandable\(a, svc, regMet\)\) return;/.test(lp), 'l’annuaire écarte qui n’a aucun prix à proposer (commandable)');
    const pp = fn.slice(fn.indexOf('exports.providerPublic'), fn.indexOf('exports.providerPublic') + 4000);
    ok(/\.filter\(\(c\) => CATP\.commandable\(a, c, REGL\.metier\[c\]\)\)/.test(pp), 'sa page publique ne propose que les métiers où il est commandable');
    const cp = fn.slice(fn.indexOf('PRESTATAIRE NON COMMANDABLE') - 1500, fn.indexOf('PRESTATAIRE NON COMMANDABLE') + 400);
    ok(/if \(!r\.providerUid && r\.preferredProviderUid\)/.test(cp) && /CATP\.commandable\(ds\.data\(\) \|\| \{\}, svcD/.test(cp)
      && fn.indexOf('PRESTATAIRE NON COMMANDABLE') < fn.indexOf('if (Array.isArray(r.acts) && r.acts.length)'),
      'et une demande qui lui est adressée se refuse avant l’empreinte, à l’heure comme à l’acte'); }
  { const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
    const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
    const ng = fn.slice(fn.indexOf('async function noterGrilleTravaillee('), fn.indexOf('async function noterGrilleTravaillee(') + 900);
    ok(/if \(CATP\.catalogueProprePose\(a, svc, REG\.metier\[svc\]\)\) return false;/.test(ng),
      'le fait « a travaillé au prix de la grille » ne se pose pas sur une mission faite à SES prix (carte en service)');
    ok(/await noterGrilleTravaillee\(db, providerUid, after\.service \|\| ''\)/.test(fn), 'il se pose à chaque mission réglée');
    ok((fn.match(/await rattraperGrilleTravaillee\(db\)/g) || []).length === 2,
      'et se rattrape sur les missions passées : rapprochement quotidien et « Rapprocher avec Mollie »');
    ok(/request\.resource\.data\.get\('grilleTravaillee', \{\}\) == resource\.data\.get\('grilleTravaillee', \{\}\)/.test(RULES),
      'un prestataire ne peut pas se l’attribuer : les règles le verrouillent'); }
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
