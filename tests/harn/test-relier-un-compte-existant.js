/* « Un prestataire qui aurait déjà un compte Mollie pas relié à Ti-Services. En cliquant sur
   le bouton, ça va le relier ou ça va lui créer un nouveau compte ? » — l'éditeur, le
   25/10/2026.

   CE QU'ON NE SAIT PAS, ET QU'ON NE DEVINE PAS. Si la console a préparé un lien pour lui, son
   bouton ouvre le parcours PRÉPARÉ. On ignore si Mollie y reconnaîtrait un compte EXISTANT
   pour l'autoriser, ou s'il en créerait un SECOND, préremplis : `docs.mollie.com` est refusé
   depuis ce conteneur, et son code publié n'en dit rien — relevé, y compris dans ses propres
   épreuves (`CreateClientLinkRequestTest`). Or deux comptes Mollie pour un prestataire, dont
   un seul reçoit les versements, est le pire résultat possible.

   CE QU'ON FAIT À LA PLACE : on rend la question SANS CONSÉQUENCE. Le seul qui sache s'il a
   déjà un compte est LUI — la porte qui RELIE reste donc à un toucher, nommée, sur son écran,
   et elle redemande explicitement le chemin d'autorisation quoi que la console ait préparé.

   Et la console POSE le fait au lieu de le supposer : rien dans la fiche ne le dit, et Mollie
   ne répond pas à cette question sur une adresse — ce serait un outil d'énumération de
   comptes. */
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = {headless: true}; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

(async () => {
const b = await chromium.launch(o);
const p = await b.newPage({viewport: {width: 430, height: 1800}});
p.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message));
await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);

/* On CAPTE ce que le bouton envoie : c'est la seule mesure qui distingue « relier » de
   « créer », la décision vivant sur le serveur, qui ne tourne pas ici. */
const scene = () => p.evaluate(() => {
  window.__liens = [];
  window.__setFB({auth: {currentUser: {uid: 'pro1', email: 'p@e.fr'}}, db: {},
    f: {doc: () => ({}), setDoc: () => Promise.resolve(),
      getDoc: () => Promise.resolve({exists: () => false, data: () => ({})}), serverTimestamp: () => 'ts'},
    fn: {httpsCallable: (_f, nom) => (data) => {
      if (nom !== 'mollieOnboardingLink') return new Promise(() => {});
      window.__liens.push(JSON.parse(JSON.stringify(data || {})));
      return new Promise(() => {});   // on ne navigue pas : on mesure la DEMANDE
    }}, functions: {}});
  document.body.classList.add('standalone');
  const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
  const S = window.__S;
  S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro';
  S.proNav = 'home'; S.proMollieView = true; S.mission = null; S.proStatus = 'valide'; S.proCats = ['menage'];
  S.proName = 'Marie-Lou'; S.proLegal = 'Marie-Lou Cagan';
  /* AUCUNE TRACE DE MOLLIE côté application — c'est le cas de celui qui n'a jamais commencé
     chez nous, et c'est pourtant lui qui peut déjà avoir un compte Mollie à lui. */
  S.proMollie = 'none'; S.proMollieOrgId = ''; S.proMollieOnb = ''; S.proMollieCanPay = false;
  S.proMollieDashboard = '';
  window.__render();
  return document.body.innerText.replace(/\s+/g, ' ');
});

const clic = (q) => p.evaluate((sel) => { const e = document.querySelector(sel); if (e) { e.click(); return true; } return false; }, '[data-act="' + q + '"]');
const lire = () => p.evaluate(() => window.__liens);

console.log('A — la porte qui RELIE est sur son écran, nommée');
const txt = await scene();
ok(/Continuer vers Mollie/.test(txt), 'le bouton principal est là');
ok(/J.{0,3}ai déjà un compte Mollie/.test(txt),
  'et la porte de celui qui en a déjà un est NOMMÉE, à un toucher');

console.log('B — les deux boutons sont branchés, et ne lèvent pas');
/* CE QUE LE HARNAIS NE PEUT PAS REJOUER EST DIT. Le vrai départ est derrière `payReal()`,
   qui exige l'hôte de production ; et `payReal` est une liaison LEXICALE de la page — la
   remplacer depuis l'épreuve crée une AUTRE variable, l'application continue d'appeler la
   vraie (mesuré). L'appel réel ne part donc pas ici : ce qui se mesure est que les deux
   boutons existent, qu'ils sont branchés, qu'ils ne lèvent pas — et, sur la SOURCE, quelle
   voie chacun demande. C'est ce que la maison fait déjà pour les chemins sous `payReal`. */
ok(await clic('mollie-relier'), 'la porte qui relie se touche');
await p.waitForTimeout(150);
ok(await clic('mollie-start'), 'le bouton principal aussi');
await p.waitForTimeout(150);
ok((await lire()).length === 0,
  'aucun appel réel ne part du harnais, et aucun des deux ne lève : c\'est dit, pas masqué');

console.log('C — sur la source : chaque bouton demande sa voie, et une seule');
const cli0 = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
ok(/case 'mollie-relier':startMollieOnboarding\('autorisation'\);break;/.test(cli0),
  'la porte qui relie réclame le chemin d\'AUTORISATION, celui qui relie une organisation existante');
ok(/        startMollieOnboarding\(\);break;\}/.test(cli0),
  'le bouton principal ne réclame rien : c\'est le serveur qui choisit entre le préparé et l\'autorisation');
const sm = cli0.slice(cli0.indexOf('async function startMollieOnboarding'));
const smc = sm.slice(0, sm.indexOf('\n  }'));
ok(/'mollieOnboardingLink'\)\(voie\?\{voie:voie\}:\{\}\)/.test(smc),
  'et la voie voyage jusqu\'à l\'appel, sans être inventée quand personne ne l\'a demandée');
ok((cli0.match(/startMollieOnboarding\('autorisation'\)/g) || []).length === 1,
  'une seule porte la réclame : deux finiraient par ne plus demander la même chose');

console.log('D — le serveur honore la demande, et elle ne peut que RESTREINDRE');
const bloc = srv.slice(srv.indexOf('exports.mollieOnboardingLink'));
const lien = bloc.slice(0, bloc.indexOf('\n});'));
ok(lien.length > 400, 'le départ du prestataire a bien été trouvé (sinon les mesures suivantes ne mesurent rien)');
ok(/request\.data && request\.data\.voie/.test(lien), 'le serveur lit la demande');
ok(/=== 'autorisation'/.test(lien), 'et ne reconnaît que cette valeur : une liste fermée, pas un texte libre');
const iF = lien.indexOf('const forcer');
const iH = lien.indexOf('href = String(a.mollieClientLinkHref');
ok(iF > 0 && iH > iF && /if \(!forcer\)/.test(lien.slice(iF, iH)),
  'elle est posée AVANT la lecture du lien préparé : demander l\'autorisation l\'ignore vraiment');
/* ET ELLE NE PEUT PAS ÉLARGIR : l'uid vient toujours de l'authentification. Sans cette
   mesure, un paramètre venu du client pourrait un jour désigner la fiche d'un autre. */
ok(/const uid = request\.auth && request\.auth\.uid;/.test(lien),
  'et l\'uid vient toujours de l\'authentification, jamais du client');

console.log('E — la console POSE le fait qu\'elle ne peut pas lire');
const cli = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const mib = cli.slice(cli.indexOf('function molInscrireBloc'));
const corps = mib.slice(0, mib.indexOf('\n  }\n'));
ok(/a-t-il déjà un compte Mollie/.test(corps), 'elle demande de lui poser la question avant de créer');
ok(/ne lui préparez rien/.test(corps), 'et dit quoi faire si la réponse est oui');
ok(/J’ai déjà un compte Mollie/.test(corps),
  'en nommant la porte qui reste de son côté : une erreur de la console reste sans conséquence');
/* ON NE DEMANDE PAS À MOLLIE SI UNE ADRESSE A UN COMPTE, et ce n'est pas mesurable par un
   motif : une première version cherchait « /customers? » et tirait sur la liste de NOS
   clients Mollie, filtrée sur `metadata.uid` — un faux positif, et une garde qui prouve un
   négatif par un motif large tire sur n'importe quoi. Le fait vit dans ce que la console
   DIT, mesuré juste au-dessus : elle POSE la question au lieu de prétendre la lire. */

await b.close();
console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Relier un compte Mollie existant : tout est vert');
})();
