/* « SÉPARE LES DEUX DANS LE RAPPORT. » — l'éditeur, le 26/10/2026.

   Le rapport du matin listait toutes les empreintes qui vieillissent dans le MÊME seau.
   Or elles n'appellent pas le même geste : derrière certaines il y a une carte
   enregistrée — le solde se prélèvera tout seul, hors session — et derrière d'autres il
   n'y a RIEN : si l'autorisation expire, il faudra envoyer un lien de paiement et
   attendre, pendant que le prestataire a déjà travaillé.

   CE QUI SE MESURE ICI. Que le rangement REJOUE la règle de la commande au lieu d'en
   écrire une seconde — sans quoi le rapport finirait par ne plus dire la même chose que
   l'écran qui a encaissé — et que « Mollie n'a pas répondu » ne se range NI d'un côté NI
   de l'autre.

   Mollie n'est pas joignable depuis le harnais : ce qui s'éprouve est la DÉCISION et le
   CÂBLAGE, pas un aller-retour. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { codeNu } = require('./lib-code-nu.js');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

/* ── LE NOYAU, DANS UN BAC À SABLE VIDE ─────────────────────────────────────────────── */
const i0 = srv.indexOf('const COUVERTURE_MOTIFS');
const i1 = srv.indexOf("// Vérifie l'onboarding RÉEL", i0);
const source = srv.slice(i0, i1);
// ASSERTION ARRIÈRE : un relevé vide satisferait toutes les gardes de pureté.
ok(i0 > 0 && i1 > i0 && /function empreinteSeau/.test(source),
  'le noyau est bien dans le bloc relevé (sinon rien n’est mesuré)');

const bac = {}; vm.createContext(bac);
new vm.Script(source + '\nthis.E = empreinteSeau; this.SEAUX = EMPREINTE_SEAUX;').runInContext(bac);
const E = bac.E;
ok(typeof E === 'function', 'il s’exécute sans horloge, sans réseau et sans base');

const PRESTA = '2026-12';
console.log('A — ce qu’il y a derrière décide, et rien d’autre');
ok(E({ lu: true, mandat: { statut: 'valid', exp: '2027-06' }, moisPrestation: PRESTA }) === 'couverte',
  'une carte enregistrée et valable le jour venu → couverte');
ok(E({ lu: true, mandat: null, moisPrestation: PRESTA }) === 'relancer',
  'aucune carte enregistrée → à relancer, c’est le cas qui coûte');
ok(E({ lu: true, mandat: { statut: 'pending', exp: '2027-06' }, moisPrestation: PRESTA }) === 'attente',
  'un enregistrement en cours attend, on ne court pas après le client');

console.log('B — la règle de la commande est REJOUÉE, pas réécrite');
ok(E({ lu: true, mandat: { statut: 'valid', exp: '2026-09' }, moisPrestation: PRESTA }) === 'relancer',
  'un mandat « valid » dont la CARTE expire avant la prestation ne couvre pas');
ok(/commandeCouverture\(/.test(source.slice(source.indexOf('function empreinteSeau'))),
  'et il appelle commandeCouverture au lieu d’écrire sa propre règle');
const corpsSeau = source.slice(source.indexOf('function empreinteSeau'));
ok(codeNu(corpsSeau).indexOf('carteExpireAvant') < 0,
  'il ne refait pas le calcul d’expiration de son côté');

console.log('C — silence n’est pas réponse');
ok(E({ lu: false, mandat: { statut: 'valid', exp: '2027-06' }, moisPrestation: PRESTA }) === 'inconnu',
  'Mollie muet → inconnu, MÊME avec un mandat qui a l’air valide');
ok(E({ lu: false, mandat: null, moisPrestation: PRESTA }) === 'inconnu',
  'et muet sans mandat ne vaut pas « à relancer » non plus');
ok(E({}) === 'inconnu' && E(null) === 'inconnu',
  'une entrée vide ne lève pas et ne conclut rien');
ok(bac.SEAUX.length === 4 && bac.SEAUX.indexOf('inconnu') >= 0,
  'les quatre seaux sont déclarés (' + bac.SEAUX.join(', ') + ')');

console.log('D — le rapport du matin les sépare vraiment');
const d0 = srv.indexOf('// 2. Empreintes qui vieillissent');
const d1 = srv.indexOf('// 3. Terminées côté pro', d0);
const bloc = srv.slice(d0, d1);
ok(d0 > 0 && d1 > d0 && bloc.length > 500, 'la section se relève (sinon rien n’est mesuré)');
ok(/empreinteSeau\(/.test(bloc), 'elle appelle le noyau');
ok(/mandatDuClient\(/.test(bloc), 'et va lire le mandat du client');
['relancer', 'couverte', 'attente', 'inconnu'].forEach((s) => {
  ok(bloc.indexOf('seaux.' + s) > 0, 'le seau « ' + s +' » est rendu');
});
// CE QUI APPELLE UN GESTE PASSE DEVANT CE QUI SE CONSTATE.
ok(bloc.indexOf('seaux.relancer') < bloc.indexOf('seaux.couverte'),
  'et « à relancer » est imprimé AVANT « couvertes »');
// UN APPEL PAR CLIENT, PAS PAR COMMANDE.
ok(/uids\.indexOf\(u\) < 0/.test(bloc), 'les clients sont dédupliqués avant d’interroger Mollie');
ok(/RECO_MANDATS_MAX/.test(bloc) && /uids\.length > vus\.length/.test(bloc),
  'le plafond existe, et un dépassement se DIT au lieu d’être rangé au hasard');
// LE TOTAL RESTE CELUI DE TOUTES LES EMPREINTES : l’addition se refait de tête.
ok(/vieillissent \(' \+ bruts\.length/.test(bloc), 'le total en tête compte toutes les commandes');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
process.exit(f ? 1 : 0);
