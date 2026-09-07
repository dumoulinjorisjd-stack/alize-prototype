/* « JE REÇOIS L'E-MAIL, ET LA PERSONNE N'Y EST PLUS. »
   Signalé en production : des candidatures arrivent par e-mail, l'admin y va plus tard,
   la fiche n'est plus là. Sans trace, impossible de savoir si la personne s'est
   désinscrite avant validation ou si elle ne s'était jamais vraiment inscrite.
   Le serveur inscrit désormais chaque départ AVANT d'effacer les fiches — quelle que
   soit l'origine — et la console le montre. Journal volontairement maigre et temporaire :
   ces personnes ont demandé leur effacement. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');

console.log('A — le départ est noté AVANT l’effacement');
const iJournal = fn.indexOf('await journaliserDepart(db, uid');
const iEfface = fn.indexOf("bilan.profils = await effacerDocs(['users'");
ok(iJournal > 0 && iEfface > iJournal,
  'journaliserDepart s’exécute avant la suppression des fiches (après, il n’y aurait plus rien à noter)');
ok(/collection\('comptesSupprimes'\)\.doc\(uid\)\.set/.test(fn), 'la ligne est écrite dans comptesSupprimes');
ok(/purgerCompte\(getFirestore\(\), user\.uid, 'profil', user\)/.test(fn),
  'le déclencheur Authentication transmet le compte — seule source encore disponible quand l’app a déjà effacé ses fiches');
ok(/\(au\.metadata && au\.metadata\.creationTime\)/.test(fn),
  'la date d’inscription est reprise du compte d’authentification si les fiches ont disparu');
ok(/origine: origine/.test(fn) && /\(authUser \? 'auth' : \('console-' \+ mode\)\)/.test(fn),
  'l’origine du départ est consignée (application, console, Firebase)');

console.log('B — ce que le journal retient, et ce qu’il ne retient pas');
ok(/statut: String\(a\.status \|\| ''\)/.test(fn),
  'le statut du dossier AU MOMENT du départ — c’est lui qui dit « parti avant validation »');
ok(/avaitCandidature: !!a\.name/.test(fn), 'et si une candidature avait bien été déposée');
const bloc = fn.slice(fn.indexOf('async function journaliserDepart'), fn.indexOf('async function purgerCompte'));
ok(bloc.indexOf('siret') < 0 && bloc.indexOf('phone') < 0 && bloc.indexOf('address') < 0,
  'ni SIRET, ni téléphone, ni adresse : on ne garde que ce qui répond à la question');
ok(/expireLe: Date\.now\(\) \+ JOURNAL_JOURS \* 86400000/.test(fn), 'chaque ligne porte sa date de péremption');
ok(/const JOURNAL_JOURS = 90/.test(fn), 'le journal ne vit que 90 jours');
ok(/collection\('comptesSupprimes'\)\.where\('expireLe', '<=', now\)/.test(fn),
  'et le balayage quotidien efface les lignes échues');

console.log('C — qui peut le lire');
ok(/match \/comptesSupprimes\/\{uid\} \{[\s\S]{0,120}allow read:  if isAdmin\(\);[\s\S]{0,60}allow write: if false;/.test(rules),
  'lecture administrateur seule, écriture serveur seule');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 420, height: 900}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1000);
  await p.evaluate(() => { document.body.classList.add('standalone'); });

  const poser = (departs) => p.evaluate((D) => {
    const S = window.__S;
    S.persona = 'admin'; S.admin = {view: 'home', sel: null}; S.demoMode = false;
    S.adminArtsLoaded = true; S.adminArtisans = []; S.adminClients = []; S.adminThreads = [];
    S.adminDeparts = D;
    window.__render();
    const h = document.querySelector('[data-fold="a-departs"]');
    if (h && h.getAttribute('aria-expanded') !== 'true') h.click();
  }, departs);

  const J = (n) => Date.now() - n * 86400000;

  console.log('D — la console montre les départs, et distingue les candidatures perdues');
  await poser([
    {uid: 'a1', nom: 'Kevin Laplace', email: 'kevin@ex.fr', role: 'artisan', statut: 'attente',
      avaitCandidature: true, metiers: ['menage'], inscritLe: J(4), supprimeLe: J(2), origine: 'auth'},
    {uid: 'c1', nom: 'Sophie Client', email: 'sophie@ex.fr', role: 'client', statut: '',
      avaitCandidature: false, metiers: [], inscritLe: J(30), supprimeLe: J(1), origine: 'auth'},
  ]);
  await p.waitForTimeout(450);
  const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/Comptes supprimés/i.test(txt), 'la carte « Comptes supprimés » est là');
  ok(/Kevin Laplace/.test(txt) && /Sophie Client/.test(txt), 'les deux départs sont listés');
  ok(/1 candidature partie avant validation/.test(txt),
    'le bandeau compte les candidatures perdues — la réponse à la question posée');
  ok(/Candidature perdue/.test(txt), 'la ligne concernée est marquée');
  ok(/2 jours après son inscription/.test(txt),
    'on lit combien de temps la personne est restée (parti 2 jours après son inscription)');

  console.log('E — journal vide : on ne laisse pas croire que personne n’est jamais parti');
  await poser([]);
  await p.waitForTimeout(400);
  const vide = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/Aucun départ enregistré/.test(vide), 'le cas vide est dit');
  ok(/les comptes partis avant n'y figurent pas|comptes partis .{0,10}avant.{0,10} n.y figurent pas/i.test(vide),
    'et on précise que le journal démarre à sa mise en service — pas de fausse certitude');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');
  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
