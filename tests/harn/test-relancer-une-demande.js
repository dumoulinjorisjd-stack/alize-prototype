/* « Dans la console, il faudrait un bouton de relance pour renvoyer les notifications aux
   prestataires concernés d'une demande non satisfaite. »

   LA CONSOLE DISAIT DÉJÀ POURQUOI PERSONNE N'AVAIT RÉPONDU — « aucun prestataire
   disponible sur ce créneau, ou tous hors ligne », « ce compte a atteint son plafond de
   diffusions du jour » — et la seule issue était d'attendre : rien ne permettait de
   renvoyer l'alerte à celui qui s'est reconnecté depuis.

   ON N'EN A PAS ÉCRIT UNE TROISIÈME COPIE, ET C'EST MESURÉ. La sélection des
   destinataires était écrite DEUX fois — à la création d'une demande sans verrou de
   paiement, et au passage à « pending » après autorisation de la carte — et les deux
   copies avaient déjà divergé : l'opt-in WhatsApp ne part qu'à la création. Une relance
   écrite de son côté aurait divergé une troisième fois. `diffuserAuPool` est la porte.

   Firestore et le FCM ne sont pas joignables depuis le harnais : ce qui s'éprouve est la
   DÉCISION et le CÂBLAGE, pas un aller-retour. */
const fs = require('fs'), path = require('path');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const SRV = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');

/* ── LE CORPS DE L'APPELABLE, RELEVÉ PAR SES BORNES ──────────────────────────────────── */
const i0 = SRV.indexOf('exports.adminRelancerDemande');
const i1 = SRV.indexOf('\nexports.', i0 + 20);
const corps = SRV.slice(i0, i1);
ok(i0 > 0 && i1 > i0, 'l\'appelable existe et ses bornes se relèvent');

console.log('\n── RÉSERVÉ À L\'ADMINISTRATEUR ──────────────────────────────────────────');
/* UN CONTRÔLE ÉCRIT DANS LE NAVIGATEUR SE CONTOURNE EN EFFAÇANT UNE LIGNE : ce geste
   envoie des notifications à des dizaines d'appareils réels. */
ok(/request\.auth && request\.auth\.token && request\.auth\.token\.email/.test(corps),
  'l\'appelant est lu dans le jeton, jamais reçu de la charge');
ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)/.test(corps), 'et comparé à l\'adresse de l\'administrateur');
ok(/throw new HttpsError\('permission-denied'/.test(corps), 'sinon la porte se ferme');
ok(corps.indexOf('permission-denied') < corps.indexOf('diffuserAuPool'),
  'et elle se ferme AVANT que la moindre notification ne parte');

console.log('\n── ON NE RELANCE QUE CE QUI CHERCHE ENCORE ─────────────────────────────');
/* Renvoyer une alerte sur une mission déjà prise ferait accourir des prestataires pour
   rien ; sur une demande annulée, expirée ou payée, il n'y a personne à prévenir. */
ok(/const RELANCE_STATUTS = \['pending'\];/.test(SRV), 'la liste des statuts relançables est FERMÉE');
ok(/RELANCE_STATUTS\.indexOf\(r\.status\) < 0/.test(corps), 'et le statut est confronté à cette liste');
/* LE STATUT EST LU SUR LE DOCUMENT, jamais reçu de l'appelant : un écran qui proposerait
   le bouton à tort ne doit pas pouvoir déclencher l'envoi. */
ok(/const snap = await db\.collection\('requests'\)\.doc\(reqId\)\.get\(\);/.test(corps),
  'la demande est relue chez elle');
ok(/const r = snap\.data\(\) \|\| \{\};/.test(corps) && corps.indexOf('snap.data()') < corps.indexOf('RELANCE_STATUTS.indexOf'),
  'et son statut vient de cette lecture, pas de la charge');
ok(!/request\.data[^)]*status/.test(corps), 'aucun statut n\'est accepté de l\'appelant');
ok(/if \(!snap\.exists\) throw new HttpsError\('not-found'/.test(corps), 'une demande introuvable est refusée');
ok(/if \(!reqId\) throw new HttpsError\('invalid-argument'/.test(corps), 'et une demande manquante aussi');
/* SILENCE N'EST PAS RÉPONSE : un refus de statut REND son motif au lieu de lever, pour
   que l'écran puisse dire « cette demande ne cherche plus » plutôt qu'une erreur nue. */
ok(/return \{ relance: false, raison: 'statut'/.test(corps), 'un mauvais statut se DIT, il ne lève pas');

console.log('\n── LA PORTE UNIQUE, ET AUCUNE SECONDE SÉLECTION ────────────────────────');
ok(/await diffuserAuPool\(db, reqId, r, \{/.test(corps), 'la relance passe par la porte de diffusion');
ok(!/where\('status', '==', 'valide'\)/.test(corps), 'elle ne relit pas les artisans de son côté');
ok(!/availOk|siteOk|enLigne/.test(corps), 'ni ne refait le filtre du créneau, du lieu ou de l\'interrupteur');
ok(!/pushMulticast|_jetonsArtisans|mailArtisansSansAppareil/.test(corps),
  'ni n\'envoie elle-même : la porte le fait, pour les trois chemins');
/* ASSERTION ARRIÈRE : un corps VIDE satisferait les quatre refus ci-dessus. */
ok(corps.length > 700 && /svcName/.test(corps), 'arrière : l\'appelable fait bien quelque chose');

console.log('\n── L\'ISSUE S\'ÉCRIT, SOUS SON PROPRE MOTIF ──────────────────────────────');
/* Une diffusion que l'opérateur a déclenchée ne se confond pas avec celle qui part toute
   seule : la ligne doit pouvoir dire laquelle on lit. */
ok(/motif: 'relancee'/.test(corps), 'la relance porte son motif');
ok(/d\.motif==='envoyee'\|\|d\.motif==='relancee'/.test(APP), 'et la console le lit comme un ENVOI, pas comme un refus');
ok(/relancee'\?'Relanc/.test(APP), 'en le nommant');
ok(/await _noterDiffusion\(db, reqId, issue\);/.test(SRV), 'et la porte écrit l\'issue sur la demande');
/* CE QUE NUL CLIENT NE PEUT ÉCRIRE : `diffusion` est le journal de ce qui est parti. */
const sk = RULES.slice(RULES.indexOf('function serverKeys()'), RULES.indexOf('];', RULES.indexOf('function serverKeys()')));
ok(/'diffusion'/.test(sk), 'le journal de diffusion reste réservé au serveur');

console.log('\n── LE PLAFOND DU CLIENT NE S\'APPLIQUE PAS, ET C\'EST VOULU ──────────────');
/* Il protège le parc d'un CLIENT qui ferait partir cent alertes avec une commande. Une
   relance d'opérateur n'est pas ce cas-là — et la porte, elle, n'en décide pas : chaque
   appelant pose sa propre garde. */
ok(!/_quotaJour/.test(corps), 'la relance ne consomme pas le plafond du client');
const dp = SRV.indexOf('async function diffuserAuPool');
const porte = SRV.slice(dp, SRV.indexOf('\nasync function pushMulticast', dp));
ok(!/_quotaJour/.test(porte), 'et la porte n\'en décide pas non plus');
/* LA MOITIÉ QUI COMPTE : les deux chemins AUTOMATIQUES le gardent. */
const rd = SRV.indexOf('exports.notifyReopenedRequest');
ok(/_quotaJour\(db, 'diff-'/.test(SRV.slice(rd, SRV.indexOf('\nexports.', rd + 20))),
  'la réouverture garde le sien');
ok(/console\.log\('Relance demande '/.test(corps), 'et la relance laisse une trace nommant l\'opérateur');

console.log('\n── LE BOUTON, LÀ OÙ L\'ON LIT QUE PERSONNE N\'A RÉPONDU ─────────────────');
const iR = APP.indexOf('const cmdRelance=function(r)');
const rel = APP.slice(iR, iR + 700);
ok(iR > 0, 'le bouton est composé par une fonction nommée');
ok(/r\.status!=='pending'\)return ''/.test(rel), 'il ne paraît que sur une demande qui cherche encore');
ok(/\$\{cmdDiffusion\(r\)\}\$\{cmdRelance\(r\)\}/.test(APP), 'et il suit la ligne qui dit l\'issue de la diffusion');
/* IL S'ARME. Une alerte partie ne se rappelle pas, et le geste touche des dizaines
   d'appareils : la discipline des deux boutons de purge. */
ok(/S\._cmdRelance===r\.id/.test(rel), 'il s\'arme');
ok(/if\(S\._cmdRelance!==id\)\{S\._cmdRelance=id;render\(\);/.test(APP), 'et n\'agit qu\'au second appui');
ok(/Un second appui renverra/.test(APP), 'le premier appui DIT ce que le second fera');
ok(/S\._cmdRelance=null;render\(\);\s*\n\s*FB\.fn\.httpsCallable\(FB\.functions,'adminRelancerDemande'\)/.test(APP),
  'et il se désarme avant d\'envoyer, pour qu\'un double clic ne relance pas deux fois');
/* CE QUI S'EST PASSÉ SE DIT, Y COMPRIS « PERSONNE » : un toast de succès sur zéro
   destinataire laisserait croire que l'alerte est partie. */
ok(/Cette demande ne cherche plus/.test(APP), 'un refus de statut se dit à l\'écran');
ok(/Personne à prévenir/.test(APP), 'et « personne à prévenir » aussi');
ok(/relancé'\+\(d\.cibles>1\?'s':''\)/.test(APP), 'le succès dit COMBIEN');
/* RIEN À RECHARGER : la console écoute `requests` en instantané. */
ok(!/chargerAdminLedger&&chargerAdminLedger/.test(APP), 'aucun rechargement inventé après l\'envoi');

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
