/* « Mais le prénom n'est pas bon ....? » — devant la console, sur « ONETTI RODRIGUEZ JADE ».

   EXACT, ET LE CODE PORTAIT DÉJÀ LA RÈGLE QU'IL NE TENAIT PAS. Le serveur écrit noir sur
   blanc, depuis le 25/10 : « L'ORDRE D'UN NOM NE SE DEVINE PAS […] le découpage ne reste
   qu'un point de départ, montré avant d'être envoyé et corrigible ». Mesuré : la console
   ne pouvait pas le tenir — elle recevait deux moitiés sans savoir si le prestataire les
   avait SAISIES dans sa fiche ou si le serveur les avait DEVINÉES au premier espace. Elle
   les pré-remplissait donc dans les deux cas, `molNomOk` passait, et le bouton « Créer
   chez Mollie » s'allumait sur « Prénom = ONETTI » — une identité inversée déclarée à un
   établissement qui la vérifie pièce en main, et qui se découvre des jours plus tard.

   ET LE TÉLÉPHONE, DANS LE MÊME LOT. Mollie affichait « +31 6 00000000 » : on n'envoyait
   aucun numéro, au motif que les nôtres « ne sont pas garantis dans ce format ». Vrai du
   champ BRUT, faux de ce qu'on sait en faire — `waIntl` normalise déjà. ELLE SE TROMPAIT
   POURTANT SUR LES FIXES : « 0590 27 62 18 » rendait « +33 590… », l'indicatif de la
   métropole sur un numéro de Saint-Barthélemy. Les mobiles étaient justes, les fixes non,
   et comme on n'envoie pas de WhatsApp à un fixe le défaut ne s'était jamais vu.

   Mollie n'est pas joignable depuis le harnais : ce qui s'éprouve est la DÉCISION et le
   CÂBLAGE, pas un aller-retour. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* ── LES NOYAUX, MONTÉS DANS UN BAC VIDE ────────────────────────────────────────────── */
function bac(source, debut, fin, noms) {
  const i0 = source.indexOf(debut); const i1 = source.indexOf(fin, i0);
  if (i0 < 0 || i1 < 0) throw new Error('bornes introuvables : ' + debut);
  const ctx = vm.createContext({});
  new vm.Script(source.slice(i0, i1) + '\nthis.X={' + noms.map((n) => n + ':' + n).join(',') + '};').runInContext(ctx);
  return ctx.X;
}
const S = bac(srv, 'const TEL_PREFIXES_590', '/* UN CODE POSTAL', ['telE164']);
const C = bac(srv, 'function lienNomCoupe', '/* LE LIEN FINAL', ['clientLinkProposition', 'telE164']);
const A = bac(app, '  function molRep(E,charge,cle)', '  function molManquesRestants', ['molRep', 'molNomOk', 'molNomSuggestions']);

console.log('\n── LE TÉLÉPHONE EN E.164 ───────────────────────────────────────────────');
ok(S.telE164('0590 27 62 18') === '+590590276218', 'un FIXE de Saint-Barthélemy prend +590, pas +33 (le défaut mesuré)');
ok(S.telE164('0690 55 04 21') === '+590690550421', 'un mobile 0690 prend +590');
ok(S.telE164('0691 12 34 56') === '+590691123456', 'un mobile 0691 prend +590');
ok(S.telE164('06 25 70 75 72') === '+33625707572', 'un mobile de métropole garde +33');
ok(S.telE164('02 41 45 98 93') === '+33241459893', 'un fixe de métropole garde +33');
ok(S.telE164('+590 690 55 04 21') === '+590690550421', 'un numéro déjà international n\'est pas repréfixé');
ok(S.telE164('00590690550421') === '+590690550421', 'le préfixe d\'accès 00 vaut le +');
/* CE QU'ON NE SAIT PAS METTRE EN FORME NE PART PAS : un champ vide se corrige chez
   Mollie, un champ faux se découvre au contrôle d'identité. */
ok(S.telE164('123') === '', 'trop court : rien, plutôt qu\'un numéro faux');
ok(S.telE164('') === '' && S.telE164(null) === '' && S.telE164(undefined) === '', 'vide, nul, absent : rien');
/* ASSERTION ARRIÈRE : une porte qui rendrait toujours '' satisferait les trois refus
   ci-dessus sans rien mettre en forme. */
ok(S.telE164('0690550421').indexOf('+590') === 0, 'arrière : la porte met bien en forme (sans quoi les refus ne mesurent rien)');

console.log('\n── LE NUMÉRO PART DANS LA CHARGE, S\'IL SE MET EN FORME ──────────────────');
const fiche = {email: 'a@b.fr', legalName: 'ONETTI RODRIGUEZ JADE', repGiven: 'Jade', repFamily: 'Onetti Rodriguez',
  address: '12 rue des Palmiers, 97133 Gustavia', siret: '12345678901234'};
const p1 = C.clientLinkProposition(Object.assign({}, fiche, {phone: '0590 27 62 18'}), 'BL', 'fr_FR');
ok(p1.charge.owner.phone === '+590590276218', 'un fixe lisible part en E.164 dans owner.phone');
const p2 = C.clientLinkProposition(Object.assign({}, fiche, {phone: '12'}), 'BL', 'fr_FR');
ok(!('phone' in p2.charge.owner), 'un numéro illisible : le champ est OMIS, pas envoyé vide');
ok(p2.pret === true, 'et son absence n\'empêche pas la préparation (Mollie le demandera)');

console.log('\n── SAISI OU DEVINÉ, LE SERVEUR LE DIT ──────────────────────────────────');
ok(C.clientLinkProposition(fiche, 'BL', 'fr_FR').nomDevine === false, 'deux cases remplies par le prestataire : nomDevine faux');
const dev = C.clientLinkProposition({email: 'a@b.fr', legalName: 'ONETTI RODRIGUEZ JADE'}, 'BL', 'fr_FR');
ok(dev.nomDevine === true, 'fiche sans prénom/nom : nomDevine VRAI');
ok(dev.charge.owner.givenName === 'ONETTI', 'le découpage reste rendu (il sert de proposition)');
ok(C.clientLinkProposition({email: 'a@b.fr', legalName: 'CCS'}, 'BL', 'fr_FR').nomDevine === false,
   'un seul mot : rien n\'a été deviné, donc nomDevine faux (et « nom » manque)');

console.log('\n── LA CONSOLE NE PRÉ-REMPLIT PLUS UN DÉCOUPAGE DEVINÉ ──────────────────');
const chg = dev.charge;
ok(A.molRep({nomDevine: true}, chg, 'Given') === '', 'deviné : la case Prénom part VIDE');
ok(A.molRep({nomDevine: true}, chg, 'Family') === '', 'deviné : la case Nom part VIDE');
ok(A.molNomOk({nomDevine: true}, chg) === false, 'deviné : le bouton « Créer chez Mollie » ne s\'allume PAS');
/* LA MOITIÉ QUI COMPTE : ce que le prestataire a lui-même saisi se pré-remplit, sinon on
   lui ferait retaper une identité qu'il a déjà donnée. */
ok(A.molRep({nomDevine: false}, fiche.repGiven ? {owner: {givenName: 'Jade', familyName: 'Onetti Rodriguez'}} : chg, 'Given') === 'Jade',
   'saisi : la case Prénom est pré-remplie');
ok(A.molNomOk({nomDevine: false}, {owner: {givenName: 'Jade', familyName: 'Onetti Rodriguez'}}) === true,
   'saisi : le bouton s\'allume');
ok(A.molRep({nomDevine: true, repGiven: 'Jade'}, chg, 'Given') === 'Jade', 'ce qu\'on tape dans la console l\'emporte toujours');

console.log('\n── LES DEUX ORDRES SE PROPOSENT, AUCUN NE SE SUPPOSE ───────────────────');
const sg = A.molNomSuggestions({name: 'ONETTI RODRIGUEZ JADE'});
ok(sg.length === 2, 'trois mots : deux propositions');
ok(sg[0].given === 'ONETTI' && sg[0].family === 'RODRIGUEZ JADE', 'le premier mot comme prénom');
ok(sg[1].given === 'JADE' && sg[1].family === 'ONETTI RODRIGUEZ', 'le dernier mot comme prénom (l\'ordre du registre)');
const cl = A.molNomSuggestions({name: 'Courcot Laura'});
ok(cl.length === 2 && cl[1].given === 'Laura' && cl[1].family === 'Courcot', 'le cas de production « Courcot Laura » est proposé dans les deux sens');
ok(A.molNomSuggestions({name: 'CCS'}).length === 0, 'un seul mot ne se coupe pas');
ok(A.molNomSuggestions({name: 'Dupont  Dupont'}).length === 1, 'deux mots identiques ne font qu\'une proposition');
ok(A.molNomSuggestions({}).length === 0 && A.molNomSuggestions(null).length === 0, 'sans nom : rien');

console.log('\n── LE CÂBLAGE ──────────────────────────────────────────────────────────');
ok(/nomDevine: !\(rGiven && rFamily\) && !!coupe/.test(srv), 'le serveur rend nomDevine');
ok(/nomDevine:!!d\.nomDevine/.test(app), 'et la console le GARDE dans son état (sans quoi il serait perdu au rendu suivant)');
ok(/data-adm="mol-nom:/.test(app), 'les propositions sont des boutons');
ok(/act==='mol-nom'/.test(app), 'et le geste est branché');
/* UNE SEULE RÈGLE DE TÉLÉPHONE : deux normalisations finiraient par ne plus rendre le
   même numéro, et c'est précisément comment le fixe s'est trompé six mois. */
ok(/function waIntl\(phone\) \{ return telE164\(phone\)\.slice\(1\); \}/.test(srv),
   'waIntl APPELLE la porte au lieu d\'en porter une seconde');
ok(!/\/\^69\[01\]\/\.test\(rest\)/.test(srv), 'et son ancienne règle, qui ignorait les fixes, a disparu');
ok(/const tel = telE164\(f\.phone\);/.test(srv), 'la charge Mollie appelle la porte');
/* LE NOYAU RESTE PUR : il part dans une charge envoyée à un tiers. */
ok(!/Date|Math\.random|fetch|getFirestore/.test(srv.slice(srv.indexOf('function telE164'), srv.indexOf('\n}\n', srv.indexOf('function telE164')))),
   'la porte ne lit ni l\'heure ni le réseau');

console.log('\n── COMMENT IL SE CONNECTE, DIT SOUS LE BOUTON ──────────────────────────');
/* « Vu que l'on crée nous-même le compte Mollie, comment le prestataire s'identifie ? Il
   n'a rentré aucun mot de passe. » La question se posait sur l'écran MÊME qui porte le
   bouton : il ouvrait l'espace Mollie sans dire un mot de l'identifiant. */
const iAcc = app.indexOf('data-act="mollie-manage"');
const bloc = app.slice(iAcc, iAcc + 900);
ok(iAcc > 0, 'le bouton d\'accès existe');
ok(/mollie-manage[\s\S]{0,120}<\/button>\s*\n\s*<p class="mini"/.test(bloc), 'l\'explication est SOUS le bouton, pas ailleurs dans l\'écran');
ok(/monAdresseMollie\(\)/.test(bloc), 'elle nomme l\'adresse qui ouvre son compte');
ok(/adresse de votre fiche/.test(bloc), 'et si on ne peut pas la lire, elle ne l\'invente pas');
ok(/nous ne le connaissons pas/.test(bloc), 'elle dit que le mot de passe est chez Mollie, pas chez nous');
ok(/Mot de passe oubli/.test(bloc), 'et nomme la porte de secours, qui est celle de Mollie');
/* ON NE NOMME PAS UNE ADRESSE QU'ON N'A PAS : un prestataire envoyé se connecter avec la
   mauvaise croirait son compte perdu. */
const iAdr = app.indexOf('function monAdresseMollie');
ok(iAdr > 0 && /return ''/.test(app.slice(iAdr, iAdr + 400)), 'la porte rend vide plutôt que de deviner');

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
