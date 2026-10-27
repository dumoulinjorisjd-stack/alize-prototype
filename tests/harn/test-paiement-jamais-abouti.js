/* « Des fois c'est un essai, mais des fois, quand c'est un paiement échoué, je ne veux
   pas le garder dans la console, c'est inutile. Bon, je peux cliquer sur "C'était un
   essai, écarter". » — et « pourquoi ça marque supplément massage ? »

   DEUX QUESTIONS, UNE SEULE CAUSE, ET UN TROISIÈME DÉFAUT QUE PERSONNE N'AVAIT SIGNALÉ.
   Mesuré le 27/10/2026 sur une capture de production : deux lignes de 104,50 € pour la
   MÊME prestation — « Massage » (état Mollie `expired`) et « Supplément · Massage »
   (`paid`) — et un total annonçant 209,00 € dus là où 104,50 € ont été encaissés.

   LA CAUSE. Quand l'empreinte de carte a EXPIRÉ, tout le solde repart par le mandat, sur
   un SECOND paiement. Le serveur le sait au moment de prélever — la description envoyée
   à Mollie dit déjà « prestation » et non « supplément », et `REGLEMENT_MOTIFS` déclare
   `hors-session` à côté d'`empreinte-partielle` — mais il JETAIT ce motif, et la console
   écrivait « Supplément · » en dur.

   ET L'ÉCRAN AFFIRMAIT UNE DETTE QUI N'EXISTE PAS. Il parle de versements bloqués, sa
   bannière dit « le client a payé, la somme reste due » ; c'est faux d'une ligne dont
   l'empreinte a expiré, où rien n'a été prélevé. Son net entrait pourtant dans le total.

   D'OÙ LA TROISIÈME PORTE, avec les bons mots : on ne doit pas avoir à DÉCLARER « c'était
   un essai » — une affirmation sur l'intention — pour sortir une ligne dont le fait est
   autre. Même geste (`ledgerExclude`, réversible, qui garde qui, quand et pourquoi),
   motif différent, et offert SEULEMENT là où Mollie dit le paiement mort. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const SRV = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* ── LE LIBELLÉ DU SECOND PAIEMENT, MONTÉ DANS UN BAC VIDE ───────────────────────────── */
const i0 = SRV.indexOf('function complementLibelle');
const ctx = vm.createContext({});
new vm.Script(SRV.slice(i0, SRV.indexOf('\n}', i0) + 2) + '\nthis.X = {complementLibelle: complementLibelle};').runInContext(ctx);
const { complementLibelle } = ctx.X;

console.log('\n── UN SECOND PAIEMENT N\'EST PAS TOUJOURS UN SUPPLÉMENT ─────────────────');
ok(complementLibelle('hors-session') === 'Prestation',
  'empreinte expirée, tout le solde repart : c\'est la PRESTATION, pas un supplément');
ok(complementLibelle('empreinte-partielle') === 'Supplément',
  'empreinte partielle : là, c\'est bien un supplément');
/* CE QU'ON NE SAIT PAS NE S'INVENTE PAS : les prestations d'avant le 27/10/2026 n'ont
   retenu aucun motif. On dit le seul fait dont on soit sûr — c'est un second paiement. */
ok(complementLibelle('') === 'Second paiement' && complementLibelle(undefined) === 'Second paiement',
  'aucun motif retenu : on ne devine pas, on dit « Second paiement »');
ok(complementLibelle('un-motif-quon-ne-connait-pas') === 'Second paiement',
  'un motif qu\'on ne reconnaît pas ne devient pas « Supplément »');
/* LE MOTIF VIENT D'UNE LISTE DÉCLARÉE, pas d'une chaîne écrite ici : les deux noms jugés
   doivent exister dans `REGLEMENT_MOTIFS`, sans quoi la porte juge un vocabulaire mort. */
const decl = (/const REGLEMENT_MOTIFS = \[([^\]]*)\]/.exec(SRV) || [, ''])[1];
ok(/'hors-session'/.test(decl) && /'empreinte-partielle'/.test(decl),
  'arrière : les deux motifs jugés sont bien ceux que le serveur déclare');

console.log('\n── ET LE MOTIF EST RETENU AU MOMENT DE PRÉLEVER ────────────────────────');
/* SANS CETTE ÉCRITURE, LA PORTE NE JUGE JAMAIS RIEN et rend « Second paiement » pour
   l'éternité : c'est le câblage qui fait la correction, pas la fonction. */
ok(/complementAmount: R\.horsSession, complementMotif: R\.motif, complementCommission/.test(SRV),
  'le prélèvement retient `complementMotif` à côté du montant');
ok(/serviceName: complementLibelle\(r\.complementMotif\)/.test(SRV),
  'l\'écran des versements compose son libellé par la porte');
ok(!/'Supplément · '/.test(SRV),
  'arrière : plus aucun « Supplément · » écrit en dur dans le serveur');

/* ── CE PAIEMENT A-T-IL ABOUTI ? LE JUGE DE LA CONSOLE ───────────────────────────────── */
const a0 = APP.indexOf('const VERS_SANS_ARGENT');
const a1 = APP.indexOf('versDu=round2', a0);   // la borne s'arrête à la FONCTION, pas au calcul qui la suit
const cc = vm.createContext({});
new vm.Script(APP.slice(a0, a1) + '\nthis.X = {versAbouti: versAbouti};').runInContext(cc);
const { versAbouti } = cc.X;

console.log('\n── UNE LIGNE SANS ARGENT N\'EST PAS UNE DETTE ───────────────────────────');
ok(versAbouti({etat: 'expired'}) === false, 'empreinte expirée : rien n\'a été prélevé');
ok(versAbouti({etat: 'failed'}) === false && versAbouti({etat: 'canceled'}) === false,
  'refusé, annulé : rien non plus');
ok(versAbouti({etat: 'paid'}) === true && versAbouti({etat: 'authorized'}) === true,
  'payé, autorisé : l\'argent existe, le net reste dû');
/* DANS LE DOUTE ON NE RETIRE RIEN : un versement réellement dû ne doit pas pouvoir
   s'écarter parce que Mollie n'a pas répondu. */
ok(versAbouti({etat: 'open'}) === null && versAbouti({etat: 'pending'}) === null,
  'en cours : on ne sait pas, et on ne décide pas');
ok(versAbouti({etat: ''}) === null && versAbouti({}) === null && versAbouti({etat: 'introuvable (HTTP 404)'}) === null,
  'aucun état, ou une réponse qu\'on ne reconnaît pas : ignorance, pas verdict');
ok(versAbouti({etat: 'PAID'}) === true && versAbouti({etat: ' expired '}) === false,
  'la casse et les espaces d\'une réponse de Mollie ne changent pas le verdict');

console.log('\n── CE QUE L\'ÉCRAN EN FAIT ──────────────────────────────────────────────');
const ecr = APP.slice(APP.indexOf('let versDu=0,versRien=0'), APP.indexOf('return `<div class="pad">', a0));
ok(/versAbouti\(v\)===false\?0:\(Number\(v\.net\)\|\|0\)/.test(ecr),
  'le total ne compte pas le net d\'un paiement qui n\'a jamais abouti');
ok(/versRien=versList\.filter\(function\(v\)\{return versAbouti\(v\)===false;\}\)\.length/.test(ecr)
  && /sans paiement abouti, rien à verser/.test(ecr),
  'ce qui n\'est pas compté se DIT : un total qui rétrécit sans un mot se lit comme une perte');
ok(/rien n’a été prélevé au client, <b>rien n’est dû<\/b>/.test(ecr),
  'la carte dit, ligne par ligne, que rien n\'est dû');
ok(/\$\{versNb\?'Le client a payé/.test(ecr),
  'la bannière n\'affirme une dette que lorsqu\'il y en a une');
ok(/versAbouti\(v\)===false\?`<button class="btn ghost sm" data-adm="vers-rate:/.test(ecr),
  'la sortie n\'est offerte QUE là où Mollie dit le paiement mort');

console.log('\n── LA SORTIE EST LE MÊME GESTE, AVEC LES BONS MOTS ─────────────────────');
const h = APP.slice(APP.indexOf("else if(act==='vers-rate')"), APP.indexOf("else if(act==='remb-open')"));
ok(/ledgerExclude'\)\(\{reqId:id,exclu:true,motif:'paiement jamais abouti, rien à verser'\}\)/.test(h),
  'elle passe par `ledgerExclude`, avec un motif qui dit le fait et non une intention');
ok(/isAdminAccount\(\)/.test(h) && /S\._versRateArm!==id/.test(h),
  'réservée à l\'administrateur, et elle s\'arme comme ses voisines');
ok(/S\._versRateArm=id;S\._versEssaiArm=null/.test(h) && /S\._versEssaiArm=id;S\._versRateArm=null/.test(APP),
  'armer l\'une désarme l\'autre : deux confirmations en attente ne se lisent pas');
/* ET IL N'Y A TOUJOURS QU'UNE PORTE D'EXCLUSION : trois boutons, un seul appelable. */
const n = (APP.match(/httpsCallable\(FB\.functions,'ledgerExclude'\)/g) || []).length;
ok(n >= 3, 'arrière : les gestes d\'écart appellent tous la même porte (' + n + ')');
/* ET UN ÉCART N'EST PAS UNE SUPPRESSION. `ledgerDelete` existe et c'est un geste
   légitime — il RETIRE la facture du registre, après l'avoir archivée dans
   `ledgerSupprime` — mais il est lourd et d'un autre ordre. Les trois boutons d'écart
   passent par le geste LÉGER et réversible ; si l'un d'eux basculait sur la suppression,
   un appui de trop effacerait une facture. */
const gestes = ["else if(act==='vers-rate')", "else if(act==='vers-essai')", "else if(act==='cmd-essai')"];
const basculé = gestes.filter(function (g) {
  const i = APP.indexOf(g); if (i < 0) return true;         // le geste a disparu : à dire
  const corps = APP.slice(i, APP.indexOf("else if(act==='", i + 20));
  return !/ledgerExclude/.test(corps) || /ledgerDelete/.test(corps);
});
ok(basculé.length === 0, 'arrière : aucun geste d\'écart ne bascule sur la suppression' + (basculé.length ? ' — ' + basculé.join(', ') : ''));

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
