/* LE PRÉNOM ET LE NOM DU RESPONSABLE, DEMANDÉS À L'INSCRIPTION.

   « Oui, ajoute les deux champs à l'inscription. » — l'éditeur, le 25/10/2026, après
   avoir vu « Prénom Courcot / Nom Laura » sur la console : sa fiche porte « Courcot
   Laura », nom de famille d'abord, et le découpage au premier espace les inverse.

   CE QUI EST MESURÉ ICI EST LE FORMULAIRE RENDU, pas la fonction qui le valide : une
   garde posée sur `proSignupOk` serait verte alors même que les cases n'existeraient
   nulle part — la leçon payée deux fois cette nuit. On rend donc les deux formulaires
   complets et l'on interroge le navigateur sur ce qu'ils portent. */
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = {headless: true}; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

/* Une candidature complète À UN DÉTAIL PRÈS : tout y est sauf les deux cases neuves.
   C'est la seule mise en scène qui mesure « ce sont ELLES qui bloquent » — un formulaire
   vide serait refusé pour dix raisons, et la mesure ne dirait rien. */
const COMPLET = {name: 'CCS', repGiven: '', repFamily: '', phone: '+590690123456',
  email: 'ccs@exemple.fr', password: 'motdepasse', password2: 'motdepasse',
  siret: '93382066400011', address: 'Gustavia', insuranceNone: true, cats: ['menage'],
  rates: {menage: 35}, acceptsGrille: true, mandat: true, cgu: true, charte: true,
  birth: '1985-04-12'};

(async () => {
const b = await chromium.launch(o);
const p = await b.newPage({viewport: {width: 1100, height: 1600}});
p.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message));
await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);
await p.evaluate(() => {
  window.__setFB({auth: {currentUser: null}, db: {},
    f: {doc: () => ({}), setDoc: () => Promise.resolve(), serverTimestamp: () => 'ts',
      getDoc: () => Promise.resolve({exists: () => false, data: () => ({})})},
    fn: {httpsCallable: () => () => new Promise(() => {})}, functions: {}});
  document.body.classList.add('standalone');
  const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
});

/* On rend le formulaire TEL QUE L'APPLICATION l'écrit, dans un conteneur à nous : c'est
   le seul moyen d'interroger ses cases sans traverser tout le parcours d'inscription. */
const rendre = (quoi, form) => p.evaluate(([q, fo]) => {
  window.__S.proForm = Object.assign({}, fo);
  let h = '';
  try { h = (q === 'draft') ? window.__form.etape('id') : (q === 'court' ? window.__form.court() : window.__form.complet()); }
  catch (e) { return {err: String(e && e.message || e)}; }
  /* LE CONTENEUR VIT DANS `#view`, et ce n'est pas un détail : l'application écoute la
     frappe par DÉLÉGATION sur cet élément. Posé dans `body`, le formulaire se rendait,
     se lisait — et aucune frappe n'entrait dans la candidature. La mesure accusait un
     câblage sain. */
  let d = document.getElementById('__banc');
  if (!d) { d = document.createElement('div'); d.id = '__banc'; (document.getElementById('view') || document.body).appendChild(d); }
  d.innerHTML = h;
  const lire = (k) => { const e = d.querySelector('[data-pf="' + k + '"]'); return e ? {val: e.value, ph: e.placeholder || ''} : null; };
  return {given: lire('repGiven'), family: lire('repFamily'), nom: lire('name'),
    texte: d.innerText.replace(/\s+/g, ' ')};
}, [quoi, form]);

const juger = (form) => p.evaluate((fo) => ({ok: window.__form.ok(fo), manque: window.__form.manque(fo)}), form);

console.log('A — les deux cases sont dans les formulaires où vit l\'identité');
let r = await rendre('complet', COMPLET);
ok(!r.err, 'le formulaire complet se rend (sinon rien ne se mesure) : ' + (r.err || 'ok'));
ok(!!r.given && !!r.family, 'il porte une case Prénom ET une case Nom');
ok(r.given && r.given.ph === 'Prénom' && r.family && r.family.ph === 'Nom',
  'chacune dit laquelle elle est : « ' + (r.given ? r.given.ph : '—') + ' » / « ' + (r.family ? r.family.ph : '—') + ' »');
ok(/Mollie[^.]*personne/.test(r.texte), 'et l\'écran dit POURQUOI on les demande, sans quoi on les remplit au hasard');
r = await rendre('draft', COMPLET);
ok(!r.err && !!r.given && !!r.family, 'la complétion par étapes les porte aussi : les deux chemins mènent à la même fiche');

console.log('B — l\'écran court de création de compte ne les demande PAS');
/* LA MOITIÉ QUI COMPTE. Cet écran ne sert qu'à ouvrir le compte ; y empiler l'identité
   légale ferait reculer au premier pas quelqu'un qui n'a encore rien vu de l'application. */
r = await rendre('court', COMPLET);
ok(!r.err && !!r.nom, 'l\'écran court se rend et garde son nom (sinon la mesure ne mesure rien)');
ok(!r.given && !r.family, 'il ne porte aucune des deux cases');

console.log('C — sans elles, la candidature ne part pas, et le manque est NOMMÉ');
let j = await juger(COMPLET);
ok(j.ok === false, 'une candidature complète À CELA PRÈS est refusée');
ok(j.manque.some((m) => /responsable/.test(m)),
  'et ce qui manque est dit en toutes lettres : « ' + j.manque.join(' · ') + ' »');

console.log('D — une seule moitié ne suffit pas');
j = await juger(Object.assign({}, COMPLET, {repGiven: 'Laura'}));
ok(j.ok === false, 'un prénom seul ne fait pas une identité');
j = await juger(Object.assign({}, COMPLET, {repFamily: 'Courcot'}));
ok(j.ok === false, 'un nom seul non plus');
j = await juger(Object.assign({}, COMPLET, {repGiven: 'Laura', repFamily: 'Courcot'}));
ok(j.ok === true, 'les deux ensemble ouvrent l\'envoi : ' + (j.ok ? '' : j.manque.join(' · ')));
ok(j.manque.length === 0, 'et plus rien ne manque');

console.log('E — ce qui est tapé est retenu, gardé en brouillon, puis écrit sur la fiche');
await rendre('complet', COMPLET);   /* on repose la scène : la section d'avant a rendu l'écran COURT */
const tape = await p.evaluate(() => {
  const d = document.getElementById('__banc');
  const e = d.querySelector('[data-pf="repGiven"]');
  if (!e) return null;
  /* L'ÉVÉNEMENT RÉEL, pas un appel direct : c'est le câblage qu'on mesure. */
  e.value = 'Laura'; e.dispatchEvent(new Event('input', {bubbles: true}));
  return String(window.__S.proForm.repGiven || '');
});
ok(tape === 'Laura', 'une frappe dans la case entre dans la candidature : « ' + tape + ' »');
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const brouillon = src.slice(src.indexOf('function saveProDraft()'));
ok(/'repGiven','repFamily'/.test(brouillon.slice(0, brouillon.indexOf('\n  function'))),
  'le brouillon les garde : une candidature reprise le lendemain ne les redemande pas');
/* ON ANCRE SUR CE QUI N'EXISTE QU'UNE FOIS : `FB.f.doc(FB.db,'artisans',uid)` apparaît
   TROIS fois dans le fichier, et la première n'est pas l'écriture de la candidature —
   la mesure accusait un code juste. */
const iEcr = src.indexOf("legalName:(f.name||'').trim()");
ok(src.indexOf("legalName:(f.name||'').trim()", iEcr + 1) < 0,
  'l\'écriture de la candidature est reconnue sans ambiguïté (sinon on mesure autre chose)');
ok(/repGiven:\(f\.repGiven\|\|''\)\.trim\(\),repFamily:\(f\.repFamily\|\|''\)\.trim\(\)/.test(src.slice(iEcr, iEcr + 400)),
  'et la fiche les écrit : la console n\'aura plus à les demander au téléphone');

await b.close();
console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Le nom du responsable à l\'inscription : tout est vert');
})();
