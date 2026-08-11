/* PURGER UN COMPTE, ET QUE TOUT SUIVE.
   Vu en production : deux fiches clients portant la même adresse. Supprimer un compte
   depuis l'onglet Authentication de Firebase n'efface QUE l'identifiant de connexion —
   les documents Firestore survivaient, la console continuait d'afficher la fiche, et
   l'adresse redevenue libre permettait une réinscription… avec une SECONDE fiche.
   Désormais : un déclencheur Authentication nettoie les profils quelle que soit
   l'origine de la suppression, et la console propose deux purges — « fiche seule »
   (garde la comptabilité, pour un vrai compte) et « tout effacer » (comptes de test). */
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

console.log('A — le serveur : deux modes, et l’accès part en dernier');
ok(/exports\.adminPurgeAccount = onCall/.test(fn), 'la purge est une fonction serveur (l’admin ne peut pas le faire seul)');
ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)[\s\S]{0,120}permission-denied/.test(fn),
  'réservée à l’administrateur');
ok(/Vous ne pouvez pas purger votre propre compte administrateur/.test(fn),
  'l’admin ne peut pas se purger lui-même (on ne se coupe pas la branche)');
ok(/const mode = \(\(request\.data && request\.data\.mode\) === 'total'\) \? 'total' : 'profil'/.test(fn),
  'tout ce qui n’est pas « total » retombe sur le mode prudent');
// L'ordre compte : si une étape échouait après la suppression de l'accès, il resterait
// des données que plus personne ne pourrait réclamer ni nettoyer.
const iProfils = fn.indexOf('bilan.profils = await effacerDocs');
const iAuth = fn.indexOf('await getAuth().deleteUser(uid)');
ok(iProfils > 0 && iAuth > iProfils, 'l’identifiant de connexion est supprimé EN DERNIER');
ok(/if \(!\(e && e\.code === 'auth\/user-not-found'\)\) throw e/.test(fn),
  'un accès déjà supprimé (cas de la fiche fantôme) n’est pas une erreur');

console.log('B — ce que chaque mode emporte');
ok(/effacerDocs\(\['users', 'artisans', 'concierges'\]/.test(fn), 'toujours : les fiches de profil');
ok(/effacerDocs\(\['mollieTokens', 'gcalTokens', 'counters'\]/.test(fn), 'toujours : Mollie, agenda, numérotation');
ok(/for \(const col of \['icalTokens', 'fcmOwners'\]\)[\s\S]{0,200}where\('uid', '==', uid\)/.test(fn),
  'toujours : les jetons retrouvés par leur champ uid');
ok(/if \(mode === 'total'\) \{[\s\S]{0,700}collection\('requests'\)\.where\(champ, '==', uid\)/.test(fn),
  'mode total SEUL : les commandes du compte');
ok(/collection\('ledger'\)\.doc\(reqId\)/.test(fn) && /bilan\.registre/.test(fn),
  'mode total SEUL : les lignes de registre correspondantes');
ok(/const priv = await d\.ref\.collection\('private'\)\.get\(\)/.test(fn),
  'et les pièces privées des commandes (adresse exacte, GPS) — jamais laissées derrière');
// La garantie qui compte pour un VRAI compte : le mode profil ne doit pas toucher au
// registre. On vérifie que ces effacements sont bien enfermés dans la branche 'total'.
const bloc = fn.slice(fn.indexOf('async function purgerCompte'), fn.indexOf('exports.adminPurgeAccount'));
const avantTotal = bloc.slice(0, bloc.indexOf("if (mode === 'total')"));
ok(avantTotal.indexOf("collection('ledger')") < 0 && avantTotal.indexOf("collection('requests')") < 0,
  'en mode « fiche seule », ni le registre ni les commandes ne sont touchés');

console.log('C — le déclencheur Authentication : la console suit enfin');
ok(/exports\.onUserDeleted = require\('firebase-functions\/v1'\)/.test(fn),
  'un déclencheur sur la suppression d’un compte existe (interface v1, seule à le proposer)');
ok(/\.auth\.user\(\)\.onDelete\(async \(user\) => \{/.test(fn), 'il écoute bien la suppression');
ok(/purgerCompte\(getFirestore\(\), user\.uid, 'profil'\)/.test(fn),
  'il nettoie les PROFILS seulement : une suppression faite dans Firebase n’ordonne pas d’effacer la comptabilité');
ok(/\.region\('europe-west1'\)/.test(fn), 'déployé dans la même région que le reste');

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

  const ouvrirFiche = () => p.evaluate(() => {
    const S = window.__S;
    S.persona = 'admin'; S.demoMode = false; S.adminArtsLoaded = true;
    S.adminThreads = []; S.adminArtisans = [];
    // real: true = fiche issue de Firestore (pas une fiche de démonstration).
    S.adminClients = [{id: 'u-test', uid: 'u-test', real: true, name: 'Apple TEST', status: 'valide',
      email: 'demo.client@ti-services.fr', zone: 'Gustavia', addresses: [], history: []}];
    S.admin = {view: 'cli', sel: 'u-test'};
    S._purgeArm = null; S._purgeBusy = null; S._purgeBilan = null;
    window.__render();
  });

  console.log('D — la console : deux boutons, deux promesses distinctes');
  await ouvrirFiche();
  await p.waitForTimeout(400);
  const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/Apple TEST/.test(txt), 'la fiche est ouverte');
  ok(/Retirer la fiche \(garder la comptabilité\)/.test(txt), 'bouton « fiche seule »');
  ok(/Tout effacer \(compte de test\)/.test(txt), 'bouton « tout effacer »');
  ok(/Conserve.{0,40}les commandes passées et le registre/.test(txt),
    'le premier annonce clairement ce qu’il garde');
  ok(/Irréversible/.test(txt), 'le second prévient que c’est irréversible');
  ok(!/se supprime depuis la console Firebase/.test(txt),
    'l’ancien texte « à supprimer depuis Firebase » a disparu — ce n’est plus vrai');

  console.log('E — double appui obligatoire, et les deux boutons s’arment séparément');
  await p.evaluate(() => { document.querySelector('[data-purge^="total:"]').click(); });
  await p.waitForTimeout(300);
  const arme = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  ok(/Confirmer — TOUT effacer/.test(arme), 'le premier appui arme, il ne supprime pas');
  ok(!/Confirmer — retirer la fiche/.test(arme), 'et n’arme pas l’autre bouton');
  ok((await p.evaluate(() => window.__S._purgeArm)) === 'purge:total:u-test', 'l’armement est bien ciblé');

  console.log('F — hors ligne, on le dit plutôt que de faire semblant');
  await p.evaluate(() => { document.querySelector('[data-purge^="total:"]').click(); });
  await p.waitForTimeout(400);
  ok((await p.evaluate(() => window.__S._purgeArm)) === null, 'le second appui consomme l’armement');
  ok((await p.evaluate(() => (window.__S.adminClients || []).length)) === 1,
    'sans serveur joignable, la fiche n’est PAS retirée de l’écran (aucune fausse réussite)');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' · ') + ')');
  await b.close();
  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
