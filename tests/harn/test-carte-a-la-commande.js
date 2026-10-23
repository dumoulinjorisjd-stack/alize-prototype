/* « Fais le lot suivant, l'enregistrement de la carte à la commande. » — l'éditeur, le
   23/10/2026.

   CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE. L'enregistrement de la carte (0,00 € + 3-D Secure)
   EXISTAIT déjà — `clientCard action:'setup'` — mais il ne se faisait que depuis le
   Profil, donc facultativement. La plupart des clients n'avaient aucun mandat, et le
   filet posé au lot précédent (prélever le solde hors session quand l'empreinte est
   morte) retombait alors sur un LIEN DE PAIEMENT qu'il faut envoyer et attendre, pendant
   que le prestataire a déjà travaillé.

   ET MOLLIE NE COMBINE PAS LES DEUX GESTES. Ce n'est pas une supposition : c'est écrit
   dans `createClientPayment` depuis qu'on l'a payé en production — une empreinte
   (`captureMode:'manual'`) demandée en même temps qu'un premier paiement
   (`sequenceType:'first'`) ouvrait un écran de règlement VIDE, au tout premier paiement
   d'un client. La commande doit donc CHOISIR lequel des deux elle demande, et n'en
   montrer qu'un : doubler le 3-D Secure à l'instant de la commande se paierait en
   commandes abandonnées.

   CE QUE CETTE ÉPREUVE GARDE. Le noyau qui choisit (bac à sable VIDE), le plafond du
   CONSENTEMENT — qui n'est plus un effet de bord de l'empreinte — et le câblage des
   quatre endroits qui dépendaient d'elle.

   Mollie n'est pas joignable depuis le harnais : ce qui s'éprouve est la DÉCISION et le
   CÂBLAGE, pas un aller-retour. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const {codeNu, verifieDetourage} = require('./lib-code-nu.js');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');

/* ── LE NOYAU, DANS UN BAC À SABLE VIDE ─────────────────────────────────────────────── */
const i0 = srv.indexOf('const COUVERTURE_MOTIFS');
const i1 = srv.indexOf("// Vérifie l'onboarding RÉEL", i0);
ok(i0 > 0 && i1 > i0, 'le noyau se trouve dans le serveur, à sa place');
const source = srv.slice(i0, i1);
// Assertion arrière : un relevé vide satisferait toutes les gardes de pureté ci-dessous.
ok(source.length > 800 && /function commandeCouverture/.test(source),
  'et le relevé porte bien le noyau (sinon les gardes de pureté ne mesurent rien)');

console.log('A — le noyau ne touche rien du monde extérieur');
verifieDetourage(ok);
const nu = codeNu(source);
for (const mot of ['Date', 'Math.random', 'fetch', 'require', 'process', 'db.', 'getFirestore', 'mollieApi', 'console.', 'await']) {
  ok(nu.indexOf(mot) < 0, 'il n\'emploie pas ' + mot);
}
const bac = {};
vm.createContext(bac);
new vm.Script(source + '\nthis.C = commandeCouverture; this.motifs = COUVERTURE_MOTIFS; this.gestes = COUVERTURE_GESTES; this.exp = carteExpireAvant;').runInContext(bac);
const C = bac.C;
ok(typeof C === 'function', 'il s\'exécute dans un bac sans horloge, sans réseau et sans base');

console.log('B — un seul écran, et c\'est celui qui porte');
const sans = C({empreinte: {statut: ''}, mandat: null, moisPrestation: '2026-12'});
ok(sans.geste === 'carte', 'sans moyen mémorisé, la commande demande la CARTE');
ok(sans.motif === 'sans-moyen', 'et elle dit pourquoi');
ok(sans.couvert === false, 'rien ne couvre encore la prestation');
const avec = C({empreinte: {statut: ''}, mandat: {statut: 'valid', exp: '2030-01'}, moisPrestation: '2026-12'});
ok(avec.geste === 'empreinte', 'avec un mandat valide, elle pose l\'empreinte — comme avant');
ok(avec.couvert === true && avec.par === 'mandat', 'et le mandat couvre déjà, lui');
const deja = C({empreinte: {statut: 'authorized'}, mandat: null, moisPrestation: '2026-12'});
ok(deja.geste === 'rien', 'une empreinte DÉJÀ autorisée ne fait rien redemander');
ok(deja.couvert === true && deja.par === 'empreinte', 'elle couvre, et on le dit');
// JAMAIS DEUX ÉCRANS : c'est la raison d'être du choix. Aucune entrée ne doit rendre
// « enregistrer la carte ET poser l'empreinte » — le geste est un, par construction.
ok(bac.gestes.length === 4 && bac.gestes.indexOf('carte') >= 0 && bac.gestes.indexOf('empreinte') >= 0,
  'les gestes sont une liste FERMÉE de quatre, donc jamais deux à la fois');

console.log('C — « en cours » n\'est pas « aucune carte », et c\'est la distinction qui compte');
/* `mollieChargeComplement` exige un mandat `valid` : « pending » ne peut rien porter.
   Mais c'est un enregistrement EN COURS — le client revient de sa banque et Mollie n'a
   pas encore basculé l'état. Confondre les deux ferait, au choix, lui redemander une
   carte qu'il vient de valider, ou compter sur un mandat qui ne prélèvera rien. */
const encours = C({empreinte: {statut: ''}, mandat: {statut: 'pending', exp: '2030-01'}, moisPrestation: '2026-12'});
ok(encours.couvert === false, 'un mandat « pending » ne COUVRE pas');
ok(encours.geste === 'attendre', 'mais on ne redemande pas la carte : on attend');
ok(encours.motif === 'mandat-en-cours', 'et le motif le distingue de « sans moyen »');
ok(encours.geste !== sans.geste, 'les deux situations ne rendent pas le même geste');

console.log('D — une carte qui expire avant la prestation ne couvre pas');
/* C'est la seule durée qu'un mandat possède. Une réservation à trois mois sur une carte
   qui expire dans deux ne sera pas prélevable le jour venu : on le dit À LA COMMANDE,
   quand le client peut encore en donner une autre, et non à la fin, devant un
   prestataire qui a travaillé. */
const morte = C({empreinte: {statut: ''}, mandat: {statut: 'valid', exp: '2026-11'}, moisPrestation: '2027-02'});
ok(morte.couvert === false, 'la carte sera expirée : elle ne couvre pas');
ok(morte.geste === 'carte' && morte.motif === 'carte-expiree', 'on en redemande une, et on dit pourquoi');
ok(morte.carteExpire === true, 'le fait est rendu, pas seulement déduit');
// LE MOIS D'EXPIRATION COMPTE ENTIER : une carte vit jusqu'à la FIN de son mois.
ok(C({empreinte: {statut: ''}, mandat: {statut: 'valid', exp: '2027-02'}, moisPrestation: '2027-02'}).couvert === true,
  'une carte qui expire LE MOIS de la prestation couvre encore (elle vit jusqu\'à sa fin)');
ok(bac.exp('2027-01', '2027-02') === true && bac.exp('2027-03', '2027-02') === false,
  'la comparaison des mois se fait dans le bon sens');
// ON NE CONCLUT RIEN D'UNE VALEUR QU'ON N'A PAS SU LIRE : déclarer une carte expirée sur
// un champ vide renverrait saisir une carte à quelqu'un dont la carte va très bien.
ok(bac.exp('', '2027-02') === false && bac.exp('2027-01', '') === false,
  'un mois absent ne déclare JAMAIS une carte expirée');
ok(bac.exp('n\'importe quoi', '2027-02') === false, 'ni un mois illisible');
ok(C({empreinte: {statut: ''}, mandat: {statut: 'valid', exp: ''}, moisPrestation: '2026-12'}).couvert === true,
  'un mandat valide sans date d\'expiration lisible couvre (on ne l\'invalide pas sur une ignorance)');

console.log('E — ce qui ne doit PAS changer');
ok(C({empreinte: {statut: 'paid'}, mandat: null, moisPrestation: '2026-12'}).couvert === true,
  'une empreinte déjà capturée couvre aussi');
// Une empreinte MORTE (expirée chez Mollie) ne couvre plus : c'est le défaut du lot
// précédent, et le règlement sait repartir sur le mandat.
ok(C({empreinte: {statut: 'expired'}, mandat: null, moisPrestation: '2026-12'}).geste === 'carte',
  'une empreinte expirée sans mandat renvoie à la carte');
ok(C({empreinte: {statut: 'expired'}, mandat: {statut: 'valid', exp: '2030-01'}, moisPrestation: '2026-12'}).couvert === true,
  'et avec un mandat valide, elle est couverte malgré l\'empreinte morte');
ok(bac.motifs.length === 5, 'les motifs sont une liste fermée');
ok(bac.motifs.indexOf(sans.motif) >= 0 && bac.motifs.indexOf(encours.motif) >= 0
  && bac.motifs.indexOf(morte.motif) >= 0 && bac.motifs.indexOf(avec.motif) >= 0 && bac.motifs.indexOf(deja.motif) >= 0,
  'et chaque motif rendu vient de cette liste');

console.log('F — déterminisme');
const e1 = {empreinte: {statut: ''}, mandat: {statut: 'valid', exp: '2026-11'}, moisPrestation: '2027-02'};
ok(JSON.stringify(C(e1)) === JSON.stringify(C(e1)), 'deux appels sur la même entrée rendent le même résultat');
ok(JSON.stringify(C({})) === JSON.stringify(C(null)), 'et une entrée vide ne lève pas');
ok(C(null).geste === 'carte', 'sans rien savoir, on demande la carte (le côté sûr : on ne se croit pas couvert)');

console.log('G — le montant consenti s\'écrit, il n\'est plus un effet de bord de l\'empreinte');
const cp0 = srv.indexOf('exports.createClientPayment');
const cp1 = srv.indexOf('exports.mollieWebhook', cp0);
const CP = srv.slice(cp0, cp1);
ok(cp0 > 0 && cp1 > cp0 && CP.length > 2000, 'la porte de paiement de la commande se relève (assertion arrière)');
// LE PLAFOND EST LE PLUS RESTRICTIF DES DEUX SOURCES : `r.total` est ce que l'ÉCRAN a
// montré mais il est écrit par le navigateur ; `MT.gross` est ce que le SERVEUR recalcule.
// Prendre le minimum fait qu'aucun des deux côtés ne peut gonfler le plafond.
ok(/Math\.min\(annonce, MT\.gross\)/.test(CP), 'il est le MINIMUM de l\'annonce et du recalcul serveur');
ok(/totalConsenti: consenti/.test(CP) && /totalConsentiAt/.test(CP), 'et il est écrit sur la demande, daté');
ok(/console\.warn\('createClientPayment ÉCART/.test(CP), 'un écart entre les deux sources se DIT');
// AUTOVALIDATE : le silence ne vaut accord que jusqu'à ce que le client a vu. Son plafond
// était le montant de l'empreinte — donc INERTE sur une commande couverte par le mandat.
ok(/const autorise = round2\(Number\(r\.totalConsenti\) \|\| Number\(r\.molliePaymentAmount\) \|\| 0\)/.test(srv),
  'la validation par silence lit le CONSENTEMENT, avec repli sur l\'empreinte pour les demandes antérieures');
ok(/accordRequis = hausse \|\| \(autorise > 0 && duTotal > autorise/.test(srv),
  'et elle exige toujours l\'accord explicite au-delà de ce plafond');

console.log('H — le câblage : les quatre endroits qui dépendaient de l\'empreinte');
// 1. La commande demande le geste que le noyau a choisi — elle ne le choisit pas elle-même.
ok(/const COUV = commandeCouverture\(\{/.test(CP), 'la commande APPELLE le noyau');
ok(/if \(COUV\.geste === 'attendre'\) return/.test(CP), 'et elle consulte sa décision (« attendre »)');
ok(/if \(COUV\.geste === 'carte'\) \{/.test(CP), 'et le geste « carte »');
ok(/sequenceType: 'first'/.test(CP) && /value: '0\.00'/.test(CP), 'l\'enregistrement est bien un 0,00 € qui crée le mandat');
ok(/metadata: \{reqId: reqId, clientUid: uid, cardSetup: true/.test(CP),
  'et il porte le reqId — sans quoi le webhook ne saurait pas quelle demande ouvrir');
// UN REFUS NE BLOQUE PAS LA RÉSERVATION : on retombe sur l'empreinte, et on le dit.
ok(/enregistrement refusé reqId=/.test(CP) && CP.indexOf('subject: \'Enregistrement de carte refusé à la commande\'') > 0,
  'un refus de Mollie retombe sur l\'empreinte et part en alerte');
ok(CP.indexOf("if (COUV.geste === 'carte')") < CP.indexOf('captureMode:'),
  'la décision est prise AVANT de poser une empreinte');
/* ET JAMAIS UNE SECONDE EMPREINTE. Trouvé en éprouvant : le garde-fou d'idempotence ne
   rend la main que s'il retrouve un LIEN de règlement chez Mollie. Une empreinte
   « authorized » dont le lien a expiré tombait donc jusqu'au bout et en faisait poser une
   seconde, pendant que la première retient encore les fonds — deux blocages sur la carte
   du client pour une seule commande. */
ok(/if \(COUV\.geste === 'rien'\) \{/.test(CP) && /return \{geste: 'rien', motif: COUV\.motif/.test(CP),
  'une empreinte déjà autorisée ne fait pas poser une SECONDE empreinte');
ok(CP.indexOf("if (COUV.geste === 'rien')") < CP.indexOf('captureMode:'),
  'et ce refus vient avant la création du paiement');
// 2. Le webhook ouvre la demande — et seulement si quelque chose la couvre.
const wh0 = srv.indexOf('exports.mollieWebhook');
const WH = srv.slice(wh0, srv.indexOf('exports.', wh0 + 40));
ok(/const reqSetup = String\(\(pay\.metadata && pay\.metadata\.reqId\) \|\| ''\)/.test(WH),
  'le webhook lit le reqId de l\'enregistrement');
ok(/if \(pay\.mandateId\) \{\s*\n\s*await rref\.set\(\{status: 'pending', couverturePar: 'mandat'/.test(WH),
  'il n\'ouvre la demande que s\'il y a VRAIMENT un mandat');
ok(/status: 'payment_failed', cardSetupStatus: 'sans-mandat'/.test(WH),
  'payé sans mandat : rien ne couvre, la demande n\'est pas ouverte');
ok(/rr\.clientUid === uid && attend/.test(WH),
  'et il ne touche qu\'à la demande de ce client, et seulement si elle attend encore');
// 3. Le rattrapage sait lire un enregistrement, pas seulement une empreinte.
const op0 = srv.indexOf('exports.orderPaymentCheck');
const OP = srv.slice(op0, srv.indexOf('exports.clientCard', op0));
ok(/if \(r\.cardSetupPaymentId && !r\.molliePaymentId\) \{/.test(OP),
  'le rattrapage traite la commande SANS empreinte');
ok(/if \(et === 'paid' && mid\) \{/.test(OP), 'il n\'ouvre que sur un mandat réellement créé');
ok(/mollieMandateId: mid, mollieCardSetupAt/.test(OP),
  'et il inscrit le mandat sur la fiche du client, comme le ferait le webhook');
ok(OP.indexOf("if (!mollieApiConfigured()) return") < OP.indexOf('cardSetupPaymentId'),
  'la sortie « Mollie non configuré » ne court-circuite plus la branche de l\'enregistrement');
// 4. Le remboursement suit l'argent, où qu'il soit.
const rf0 = srv.indexOf('exports.refundOrder');
const RF = srv.slice(rf0, srv.indexOf('exports.', rf0 + 40));
ok(/const payId = String\(r\.molliePaymentId \|\| r\.complementPaymentId \|\| ''\)/.test(RF),
  'le remboursement prend le paiement qui PORTE l\'argent');
ok(/const champPayout = r\.molliePaymentId \? 'molliePayout' : 'complementPayout'/.test(RF),
  'et la reprise de route suit le même paiement');
ok(/encodeURIComponent\(payId\) \+ '\/refunds'/.test(RF), 'le remboursement est posé sur CE paiement');
ok(!/encodeURIComponent\(r\.molliePaymentId\)/.test(RF), 'et plus jamais sur l\'empreinte seule');
ok(/rien n\\'a été prélevé au client/.test(RF), 'sans aucun paiement, il dit la vérité au lieu d\'une erreur technique');
// 5. UNE SEULE PORTE pour « quel mandat peut porter de l'argent ».
ok(/async function mandatDuClient\(db, uid\)/.test(srv), 'la lecture du mandat a une porte');
const mc0 = srv.indexOf('async function mollieChargeComplement');
const MC = srv.slice(mc0, srv.indexOf('\nfunction commissionDuComplement', mc0));
ok(/const M = await mandatDuClient\(db, clientUid\)/.test(MC), 'le prélèvement hors session l\'emprunte');
ok(!/\/mandates\?limit=50/.test(MC), 'et il ne cherche plus les mandats pour son compte');
ok(/M\.mandat\.statut === 'valid'/.test(MC), 'seul un mandat VALIDE prélève hors session');

console.log('I — l\'écran dit le geste AVANT le clic, et le client ne le choisit pas');
ok(/const _pc=payReal\(\)\?payCard\(\):null;/.test(app), 'l\'écran de commande lit l\'état de la carte');
ok(/const _gesteConnu=payReal\(\)&&_pc!==undefined;/.test(app),
  'et il distingue « pas de carte » de « lecture en cours »');
ok(/_enreg\?`\$\{I\.card\} Enregistrer ma carte`/.test(app), 'le bouton dit « Enregistrer ma carte » quand c\'est le geste');
ok(/_gesteConnu\?`\$\{I\.lock\} Payer en sécurité/.test(app), 'et « Payer en sécurité » quand c\'est l\'empreinte');
ok(/Continuer · \$\{eur\(t\.total\)\}/.test(app), 'tant que la lecture n\'a pas abouti, il ne promet ni l\'un ni l\'autre');
// LA PHRASE INVARIANTE RESTE VRAIE DANS LES DEUX CAS : c'est la promesse commerciale.
ok(/<b>Aucun débit maintenant\.<\/b> Vous n'êtes prélevé qu'après avoir validé la prestation, jamais plus que/.test(app),
  'la promesse « aucun débit, jamais plus que X » est dite quel que soit le geste');
ok(!/Votre carte est seulement autorisée&nbsp;; vous n'êtes prélevé/.test(app),
  'et l\'ancienne phrase, qui ne valait que pour l\'empreinte, ne s\'affiche plus pour les deux');
ok(/if\(d\.geste==='attendre'\)\{toast/.test(app), 'le client exécute le geste que le SERVEUR a choisi');
ok(/if\(d\.geste==='rien'\)return true;/.test(app), 'et « rien à faire » ne marque pas la commande en échec');
// LE MESSAGE DU RETOUR SUIT LE GESTE : « paiement confirmé » après un simple
// enregistrement ferait chercher un débit sur le relevé.
ok(/d\.par==='mandat'\?'Carte enregistrée, votre demande est envoyée aux prestataires'/.test(app),
  'au retour, le message dit « carte enregistrée » quand rien n\'a été autorisé');
// L'écran de paiement peut se redessiner : c'est lui qui annonce le geste.
ok(/if\(S\.persona==='client'&&\(!S\.draft\|\|\(S\.payStep&&!S\.payEdit\)\)\)render\(\);/.test(app),
  'la lecture de la carte redessine l\'écran de confirmation (sans champ de saisie à perdre)');

console.log('J — les règles : ce que le serveur SEUL constate');
const sk0 = rules.indexOf('function serverKeys()');
const SK = rules.slice(sk0, rules.indexOf('}', rules.indexOf('];', sk0)));
ok(sk0 > 0 && SK.length > 400, 'la liste des clés serveur se relève (assertion arrière)');
for (const k of ['totalConsenti', 'totalConsentiAt', 'cardSetupPaymentId', 'cardSetupStatus',
  'couverturePar', 'mollieMandateId']) {
  ok(SK.indexOf("'" + k + "'") >= 0, k + ' est écrit par le serveur seul');
}

console.log('K — la version monte des deux côtés');
const vSw = (/ti-services-v(\d+)/.exec(fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8')) || [])[1];
const vApp = (/VERSION_APP='(\d+)'/.exec(app) || [])[1];
ok(!!vSw && vSw === vApp, 'le cache du service worker et la version du client portent le même numéro (' + vSw + ')');

console.log('');
if (f) { console.log('Carte à la commande : ' + f + ' mesure(s) rouge(s)'); process.exit(1); }
console.log('Carte à la commande : tout est vert');
