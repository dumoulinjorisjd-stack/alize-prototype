/* « ON FAIT L'EMPREINTE DU MONTANT RÉEL AU REFUS DE LA BANQUE » (l'éditeur, 23/11/2026).
   Une cliente, 3-D Secure passé, voit sa banque refuser l'enregistrement de carte à
   0,00 € « pour une raison inconnue ». Redemander le même enregistrement la remettait
   devant le même refus. Au refus (et seulement au refus), la commande suivante pose
   l'empreinte du montant réel. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RACINE = path.resolve(__dirname, '..', '..');
const srv = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const i0 = srv.indexOf('const COUVERTURE_MOTIFS');
const i1 = srv.indexOf("// Vérifie l'onboarding RÉEL", i0);
const bac = {}; vm.createContext(bac);
new vm.Script(srv.slice(i0, i1) + '\nthis.C = commandeCouverture; this.motifs = COUVERTURE_MOTIFS; this.seau = empreinteSeau;').runInContext(bac);
const C = bac.C;

console.log('A — la décision');
const refus = C({ empreinte: { statut: '' }, mandat: null, moisPrestation: '2026-12', enregistrementRefuse: true });
ok(refus.geste === 'empreinte' && refus.motif === 'carte-refusee' && refus.par === 'empreinte',
  'la banque a refusé l’enregistrement : on pose l’empreinte du montant réel (' + JSON.stringify(refus) + ')');
ok(refus.couvert === false, 'et on ne la dit pas couverte tant que l’empreinte n’est pas autorisée');
ok(bac.motifs.indexOf('carte-refusee') >= 0, 'le motif est dans la liste fermée');
const abandon = C({ empreinte: { statut: '' }, mandat: null, moisPrestation: '2026-12' });
ok(abandon.geste === 'carte' && abandon.motif === 'sans-moyen', 'sans refus (abandon, première commande) : on redemande la carte, comme avant');
const deja = C({ empreinte: { statut: 'authorized' }, mandat: null, moisPrestation: '2026-12', enregistrementRefuse: true });
ok(deja.geste === 'rien', 'une empreinte déjà autorisée : rien à redemander');
const mandat = C({ empreinte: { statut: '' }, mandat: { statut: 'valid', exp: '2030-01' }, moisPrestation: '2026-12', enregistrementRefuse: true });
ok(mandat.geste === 'empreinte' && mandat.motif === 'mandat', 'avec un mandat valide, rien ne change : empreinte, et le mandat reste le filet');
ok(bac.seau({ lu: true, mandat: null, moisPrestation: '2026-12' }) === 'relancer', 'le rapport du matin ne change pas de seau');

console.log('B — la commande lit le refus écrit par le serveur, et corrige ce qu’elle avait noté');
const n = srv.indexOf('exports.createClientPayment');
const cp = srv.slice(n, srv.indexOf('\n});\n', n));
ok(/enregistrementRefuse: String\(r\.cardSetupStatus \|\| ''\) === 'failed',/.test(cp), 'seul « failed » (refus) ouvre le repli, lu sur la demande');
ok(/couverturePar: 'empreinte', couvertureMotif: 'carte-refusee'/.test(cp), '« couverte par le mandat », noté par l’enregistrement raté, est corrigé');
const iC = cp.indexOf("enregistrementRefuse:"), iP = cp.indexOf("captureMode: 'manual'");
ok(iC > 0 && iP > iC, 'la décision précède la création de l’empreinte');
ok(/'cardSetupStatus'/.test(fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8')), 'le refus est écrit par le serveur seul (règles)');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
