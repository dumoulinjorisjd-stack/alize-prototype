/* LE RUNTIME DES FONCTIONS A UNE DATE DE PÉREMPTION, ET PERSONNE NE LA LIT.
 *
 * Relevé le 29/10/2026 dans le journal d'un déploiement production, au milieu de
 * quatre-vingts lignes vertes : « Runtime Node.js 20 was deprecated on 2026-04-30 and
 * will be decommissioned on 2026-10-30, after which you will not be able to deploy
 * without upgrading. » C'est-à-dire LE LENDEMAIN. Un avertissement noyé dans un journal
 * qu'on ne lit qu'en cas d'échec n'est pas un avertissement : c'est une surprise à retard.
 * Le jour où il mord, aucun correctif serveur ne peut plus partir — et c'est précisément
 * le jour où l'on en a besoin.
 *
 * LE CALENDRIER VIENT DU CODE PUBLIÉ PAR GOOGLE, pas d'une mémoire :
 * firebase-tools/lib/deploy/functions/runtimes/supported/types.js —
 *   nodejs20 : GA, déprécié 2026-04-30, DÉCOMMISSIONNÉ 2026-10-30
 *   nodejs22 : GA, déprécié 2027-04-30, décommissionné 2028-10-31
 *   nodejs24 : GA, déprécié 2028-04-30, décommissionné 2028-10-31
 *
 * ON NE VA PAS CHERCHER CE CALENDRIER ICI. Une épreuve qui demande au réseau échoue hors
 * connexion et devient une épreuve qu'on désarme. On écrit donc un PLANCHER, avec sa date
 * et sa raison, et c'est le plancher qu'on relève le jour où la date approche.
 *
 * ET LES QUATRE DÉCLARATIONS DOIVENT S'ACCORDER — c'est le défaut RÉALISTE, pas le
 * plancher. Cette garde en nommait TROIS, et la quatrième est celle qui a refusé le
 * déploiement du 30/10/2026 : `firebase.json` porte `functions.runtime`, et c'est CELUI-LÀ
 * que la CLI envoie à Cloud Functions — `functions/package.json` disait déjà 22 pendant
 * que `firebase.json` disait 20, la garde était verte sur les deux lignes qu'elle lisait,
 * et le run prod est mort sur celle qu'elle ne lisait pas. Une garde qui surveille la
 * bonne famille de défaut au mauvais endroit désigne les mauvaises lignes à corriger.
 * `functions/package.json` dit le runtime des fonctions ; les deux workflows de
 * MESURÉ ENSUITE, ET CELA CORRIGE LE MOTIF DE CETTE GARDE : le run bêta #437, CLI sur
 * Node 20 et `firebase.json` à `nodejs22`, est passé par « Loading and analyzing source
 * code » puis « Serving at port 8790 » — la découverte des déclencheurs EXÉCUTE bien le
 * code des fonctions, et ce code se charge sous Node 20 — et il est mort beaucoup plus
 * loin, sur `SMTP_PASS` absent. Donc `firebase.json` SUFFISAIT, et les deux
 * `node-version: '20'` NE BLOQUENT AUCUN DÉPLOIEMENT aujourd'hui. On garde la mesure :
 * son raisonnement reste juste (le jour où ce code emploiera une syntaxe de Node 22, il
 * ne se chargera plus sous Node 20), mais son rouge veut dire « à ranger », pas
 * « la production est cassée ». Les deux rouges ne se distinguent pas dans le total de la
 * suite, et c'est ce qui m'a fait annoncer à tort qu'un correctif serveur ne pouvait pas
 * partir : c'est une décision d'éditeur, pas une ligne à changer ici.
 *
 * déploiement disent le Node du RUNNER, celui qui fait tourner firebase-tools. Ce sont
 * deux choses différentes, et une seule a une échéance ; mais trois déclarations du même
 * nombre à trois endroits finissent par diverger, et c'est alors le runner qui ment sur ce
 * que la CLI exécute. Les workflows Android ne sont PAS jugés : leur Node construit
 * Capacitor, il n'a aucune raison de suivre le runtime des fonctions. */
const fs = require('fs'), path = require('path');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

/* LE PLANCHER. Node 20 est décommissionné le 2026-10-30 : en dessous de 22, un
   déploiement de fonctions est REFUSÉ par Google, pas seulement signalé. */
const PLANCHER = 22;

const pkg = JSON.parse(fs.readFileSync(path.join(RACINE, 'functions/package.json'), 'utf8'));
const runtime = String(((pkg.engines || {}).node) || '');
// Assertion arrière : sans runtime relevé, « il est au-dessus du plancher » serait vrai
// d'une chaîne vide, et la garde ne mesurerait rien.
ok(/^\d+$/.test(runtime), 'le runtime des fonctions se relève dans functions/package.json : « ' + (runtime || '(aucun)') + ' »');
ok(Number(runtime) >= PLANCHER,
  'et il est au moins Node ' + PLANCHER + ' : Node 20 est DÉCOMMISSIONNÉ depuis le 2026-10-30, un déploiement y est refusé');

/* `firebase.json`, LA DÉCLARATION QUE LA CLI ENVOIE VRAIMENT. Mesuré le 30/10/2026 sur le
   run prod #759 : « Runtime Node.js 20 was decommissioned on 2026-10-30. To deploy you
   must first upgrade your runtime version. » Rien n'était sorti — l'erreur tombe à la
   préparation des fonctions — mais aucune mesure de cette garde ne portait sur la ligne
   en cause. */
const fbj = JSON.parse(fs.readFileSync(path.join(RACINE, 'firebase.json'), 'utf8'));
const fbRt = String(((fbj.functions || {}).runtime) || '');
const fbNum = /^nodejs(\d+)$/.exec(fbRt);
// Assertion arrière : sans runtime relevé, « il s'accorde » serait vrai d'une chaîne vide.
ok(!!fbNum, 'firebase.json déclare le runtime des fonctions : « ' + (fbRt || '(aucun)') + ' »');
if (fbNum) {
  ok(Number(fbNum[1]) >= PLANCHER,
    'et il est au moins Node ' + PLANCHER + ' — c\'est CETTE ligne que Google refuse (' + fbRt + ')');
  ok(Number(fbNum[1]) === Number(runtime),
    'et elle dit le même Node que functions/package.json (' + fbNum[1] + ' contre ' + runtime + ')');
}

/* LES DEUX WORKFLOWS QUI DÉPLOIENT. On relève, on ne suppose pas : un workflow renommé
   ou ajouté sans sa déclaration doit se voir. */
const WF = ['firebase-deploy.yml', 'firebase-deploy-prod.yml'];
const runners = [];
for (const w of WF) {
  const p = path.join(RACINE, '.github/workflows', w);
  ok(fs.existsSync(p), 'le workflow ' + w + ' est bien là (sinon les mesures suivantes ne mesurent rien)');
  if (!fs.existsSync(p)) continue;
  const m = /node-version:\s*['"]?(\d+)/.exec(fs.readFileSync(p, 'utf8'));
  ok(!!m, w + ' déclare un Node pour son runner');
  if (m) runners.push({w: w, v: Number(m[1])});
}
// Assertion arrière : une liste vide satisferait « tous s'accordent » sans rien comparer.
ok(runners.length === WF.length, 'les ' + WF.length + ' runners de déploiement ont été relevés (' + runners.length + ')');
for (const r of runners) {
  ok(r.v === Number(runtime),
    r.w + ' fait tourner la CLI sur le même Node que les fonctions (' + r.v + ' contre ' + runtime + ')');
}

console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Runtime Node : une seule version, au-dessus du plancher');
