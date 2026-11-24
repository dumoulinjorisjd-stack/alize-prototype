/* LE DÉPLOIEMENT DE PRODUCTION NE PUBLIE JAMAIS UN ÉCRAN SANS SON SERVEUR
   (l'éditeur, 24/11/2026 : « tant que le risque d'une publication qui crée des bugs
   n'existe pas »). On fait tourner `deploy/deployer-prod.sh` contre une fausse CLI
   firebase qui rejoue les lignes RÉELLES du run 790 (« Failed to set invoker »), dans une
   copie jetable du dépôt, et on lit l'ordre des appels. */
const fs = require('fs'), path = require('path'), os = require('os');
const { execSync, spawnSync } = require('child_process');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-'));
const sh = (c, cwd) => execSync(c, { cwd: cwd || tmp, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
// Un dépôt jetable : deux commits, l'un dans functions/, l'autre dans index.html.
const depot = path.join(tmp, 'depot'), nu = path.join(tmp, 'nu.git');
fs.mkdirSync(path.join(depot, 'functions'), { recursive: true }); fs.mkdirSync(path.join(depot, 'deploy'));
fs.copyFileSync(path.join(RACINE, 'deploy', 'deployer-prod.sh'), path.join(depot, 'deploy', 'deployer-prod.sh'));
fs.writeFileSync(path.join(depot, 'functions', 'index.js'), '1'); fs.writeFileSync(path.join(depot, 'index.html'), '1');
sh('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm a', depot);
sh('git clone -q --bare ' + depot + ' ' + nu); sh('git remote add origin ' + nu, depot);
// Lignes VERBATIM du journal du run 790 (production, 24/11/2026).
const ECHEC = ['\u001b[1m\u001b[31mError:\u001b[39m\u001b[22m \u001b[4mThere was an error deploying functions\u001b[24m:',
  'Functions deploy had errors with the following functions:', '\tmollieOnboardingSweep(europe-west1)', '\tpaymentReconciliation(europe-west1)', '',
  'Unable to set the invoker for the IAM policy on the following functions:', '\tmollieOnboardingSweep(europe-west1)', '\tpaymentReconciliation(europe-west1)'].join('\n');
fs.writeFileSync(path.join(tmp, 'echec.log'), ECHEC + '\n');
const faux = path.join(tmp, 'bin'); fs.mkdirSync(faux);
fs.writeFileSync(path.join(faux, 'firebase'), `#!/bin/bash
echo "$*" | sed 's/ --project.*//' >> "$APPELS"
case "$MODE:$*" in
  invoker:"deploy --only functions "*) cat "${tmp}/echec.log"; exit 2;;
  muet:"deploy --only functions "*) echo "Error: autre chose"; exit 2;;
  toujours:"deploy --only functions"*) cat "${tmp}/echec.log"; exit 2;;
esac
exit 0
`, { mode: 0o755 });
const lancer = (mode) => {
  const appels = path.join(tmp, 'appels-' + mode + '-' + Date.now()); fs.writeFileSync(appels, '');
  const script = fs.readFileSync(path.join(depot, 'deploy', 'deployer-prod.sh'), 'utf8').replace('sleep 60', 'sleep 0');
  const r = spawnSync('bash', ['-c', script], { cwd: depot, env: Object.assign({}, process.env, { PATH: faux + ':' + process.env.PATH, MODE: mode, APPELS: appels, PROJECT_ID: 'x', RUNNER_TEMP: tmp }) });
  const tag = sh('git ls-remote --tags origin', depot).includes('prod-fonctions');
  return { code: r.status, appels: fs.readFileSync(appels, 'utf8').trim().split('\n').filter(Boolean), tag };
};
const sansTag = () => { try { sh('git tag -d prod-fonctions', depot); } catch (_) {} try { sh('git push -q origin :refs/tags/prod-fonctions', depot); } catch (_) {} };

console.log('A — « Failed to set invoker » : on reprend les deux nommées, puis l’écran');
sansTag(); let r = lancer('invoker');
ok(r.code === 0, 'le déploiement aboutit sans geste à la main');
ok(r.appels.join(' | ') === 'deploy --only firestore:rules | deploy --only functions | deploy --only functions:mollieOnboardingSweep,functions:paymentReconciliation | deploy --only hosting',
  'règles, fonctions, reprise des DEUX seules, écran en dernier (' + r.appels.join(' | ') + ')');
ok(r.tag, 'le point de référence est posé après le succès');

console.log('B — un échec qu’on ne sait pas nommer : l’écran ne part pas');
sansTag(); r = lancer('muet');
ok(r.code !== 0 && !r.appels.some((a) => /hosting/.test(a)), 'arrêt, AUCUN hosting (' + r.appels.join(' | ') + ')');
ok(!r.tag, 'le point de référence n’avance pas : la prochaine fois, tout repartira');

console.log('C — trois essais au plus, puis arrêt sans écran');
sansTag(); r = lancer('toujours');
ok(r.code !== 0 && r.appels.filter((a) => /functions/.test(a)).length === 3 && !r.appels.some((a) => /hosting/.test(a)), 'trois essais, puis arrêt sans hosting (' + r.appels.length + ' appels)');

console.log('D — rien n’a changé côté serveur : seulement règles et écran');
sansTag(); lancer('ok');
fs.writeFileSync(path.join(depot, 'index.html'), '2'); sh('git -c user.email=t@t -c user.name=t commit -qam ecran', depot);
r = lancer('ok');
ok(r.code === 0 && r.appels.join(' | ') === 'deploy --only firestore:rules | deploy --only hosting', 'index.html seul : pas une fonction redéployée (' + r.appels.join(' | ') + ')');
fs.writeFileSync(path.join(depot, 'functions', 'index.js'), '2'); sh('git -c user.email=t@t -c user.name=t commit -qam serveur', depot);
r = lancer('ok');
ok(r.appels.includes('deploy --only functions'), 'functions/ changé : les fonctions repartent');

console.log('E — le workflow appelle bien ce script, sur tout l’historique, et en Node 22');
const W = fs.readFileSync(path.join(RACINE, '.github', 'workflows', 'firebase-deploy-prod.yml'), 'utf8');
ok(/bash deploy\/deployer-prod\.sh/.test(W) && /fetch-depth: 0/.test(W) && /contents: write/.test(W), 'script appelé, historique entier, droit de poser l’étiquette');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
