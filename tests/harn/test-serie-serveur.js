/* LA RÉCURRENCE CÔTÉ SERVEUR (l'éditeur, 25/11/2026) : passages créés, pause et
   suppression sans pénalité, passage décliné annoncé au client, carte obligatoire. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = path.resolve(__dirname, '..', '..');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const regles = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const bloc = (a, b) => fn.slice(fn.indexOf(a), fn.indexOf(b, fn.indexOf(a)));

console.log('A — la carte enregistrée est obligatoire pour une récurrente');
const i0 = fn.indexOf('const COUVERTURE_MOTIFS'), i1 = fn.indexOf("// Vérifie l'onboarding RÉEL", i0);
const bac = {}; vm.createContext(bac);
new vm.Script(fn.slice(i0, i1) + '\nthis.C = commandeCouverture;').runInContext(bac);
const refus = { empreinte: { statut: '' }, mandat: {}, moisPrestation: '2026-12', enregistrementRefuse: true };
ok(bac.C(refus).geste === 'empreinte', 'ponctuelle, banque qui refuse l’enregistrement : empreinte du montant réel (inchangé)');
ok(bac.C(Object.assign({}, refus, { recurrente: true })).geste === 'carte', 'récurrente : on redemande d’enregistrer une carte, jamais d’empreinte');
ok(/recurrente: !!SERIE\.recurrencePropre\(r\.recurrence\)/.test(fn), 'createClientPayment le dit à la décision');

console.log('B — les passages');
const gen = bloc('async function genererPassagesDeLaSerie', 'exports.genererPassagesRecurrents');
ok(/if \(!r\.providerUid\)/.test(gen) && /M\.mandat\.statut === 'valid'/.test(gen), 'seulement avec un prestataire engagé et une carte valide');
ok(/SERIE\.passagesACreer\(/.test(gen) && /ref\.create\(/.test(gen) && /SERIE\.idPassage\(parentDoc\.id, d\)/.test(gen), 'les dates du noyau, créées une seule fois par jour');
ok(/collection\('private'\)\.doc\('details'\)\.set\(prive\)/.test(gen), 'l’adresse privée suit le passage');
ok(/exports\.genererPassagesRecurrents = onSchedule\(\{schedule: 'every 6 hours'\}/.test(fn), 'un balayage toutes les 6 h');

console.log('C — pause et suppression : sans pénalité, à partir de demain ; la reprise recrée');
const ch = bloc('exports.serieChangeEtat', '/* ── Rappel de re-commande');
ok(/lateCancel: false, cancelFee: 0, feeDecision: 'none'/.test(ch), 'annulation sans indemnité');
ok(/String\(x\.dateISO \|\| ''\) < demain\) continue/.test(ch), 'les passages du jour même restent');
ok(/after\.serieEtat === 'active'[\s\S]*?genererPassagesDeLaSerie/.test(ch), 'reprendre recrée les passages sans attendre');

console.log('D — passage décliné : le client est prévenu');
ok(/bStatus === 'accepted' && aStatus === 'declined' && after\.serieId/.test(fn) && /Passage à remplacer/.test(fn), 'notification « Passage à remplacer »');
ok(/'serieId',/.test(regles.slice(regles.indexOf('function serverKeys'), regles.indexOf('function serverKeys') + 8000)), 'serieId réservé au serveur');
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
