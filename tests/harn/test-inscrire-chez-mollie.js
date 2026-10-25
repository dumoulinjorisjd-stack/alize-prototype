/* « Il faut que, depuis la console, une fois toutes les informations données par le
   prestataire dans son profil, on puisse quasiment, d'un bouton de la console, l'enregistrer
   sur Mollie. Ou en tout cas, faire le plus de choses possible pour que lui n'ait plus qu'un
   bouton à cliquer. » — l'éditeur, le 24/10/2026.

   CE QUI A ÉTÉ MESURÉ AVANT D'ÉCRIRE. Le serveur ne créait AUCUN compte Mollie : le lien de
   départ mène à `oauth2/authorize`, qui AUTORISE une organisation existante. Un prestataire
   qui n'en a pas arrivait donc sur un écran de consentement dont le bouton « Connecter »
   reste gris — rien à connecter. Le guide pas à pas existe et donne les bonnes réponses à
   copier, mais copier-coller chez Mollie reste créer un compte chez Mollie.

   CE QUE CETTE ÉPREUVE GARDE. Le noyau qui prépare la déclaration — monté dans un bac à
   sable VIDE, ni horloge, ni réseau, ni base — et le CÂBLAGE : une seule porte pour le
   prestataire, les permissions écrites une seule fois, l'adresse gardée NUE, et le repli sur
   le chemin d'aujourd'hui quand Mollie refuse.

   Mollie n'est pas joignable depuis le harnais, et `docs.mollie.com` est refusé par le
   mandataire de cette session : la spécification vient du code PUBLIÉ par Mollie
   (mollie-api-php). Ce qui s'éprouve ici est la DÉCISION et le CÂBLAGE, pas un aller-retour. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const {codeNu, verifieDetourage} = require('./lib-code-nu.js');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

/* ── LE NOYAU, DANS UN BAC À SABLE VIDE ─────────────────────────────────────────────── */
const i0 = srv.indexOf('const LIEN_MANQUES');
const i1 = srv.indexOf('/* LE LIEN FINAL SE COMPOSE AU DERNIER MOMENT', i0);
ok(i0 > 0 && i1 > i0, 'le noyau se trouve dans le serveur, à sa place');
const source = srv.slice(i0, i1);
// Assertion arrière : un relevé vide satisferait toutes les gardes de pureté ci-dessous.
ok(source.length > 900 && /function clientLinkProposition/.test(source),
  'et le relevé porte bien le noyau (sinon les gardes de pureté ne mesurent rien)');

console.log('A — le noyau ne touche rien du monde extérieur');
verifieDetourage(ok);
const nu = codeNu(source);
for (const mot of ['Date', 'Math.random', 'fetch', 'require', 'process', 'db.', 'getFirestore', 'mollieApi', 'console.', 'await']) {
  ok(nu.indexOf(mot) < 0, 'il n\'emploie pas ' + mot);
}
const bac = {};
vm.createContext(bac);
new vm.Script(source + '\nthis.prop = clientLinkProposition; this.manques = LIEN_MANQUES;').runInContext(bac);
const P = bac.prop;
ok(typeof P === 'function', 'il s\'exécute dans un bac sans horloge, sans réseau et sans base');

console.log('B — la fiche d\'un prestataire réel devient une déclaration prête à partir');
/* LES CHAMPS SONT CEUX QUE LA FICHE `artisans` ÉCRIT VRAIMENT, relevés dans l'écriture
   d'inscription (`legalName`, `name`, `email`, `address`, `siret`) — pas supposés : un nom
   lu dans un champ qui n'existe pas rendrait « nom manquant » sur toutes les fiches du parc,
   et le bouton de la console ne marcherait pour personne. */
const fiche = {name: 'Marie-Lou Cagan', legalName: 'Marie-Lou Cagan', email: 'marielou@exemple.fr',
  address: 'Rue de la Paix, 97133 Gustavia', siret: '80412578900014'};
const r = P(fiche, 'FR', 'fr_FR');
ok(r.pret === true && r.manques.length === 0, 'rien ne manque : le bouton peut partir');
ok(r.charge.owner.email === 'marielou@exemple.fr', 'l\'adresse électronique part telle quelle');
ok(r.charge.owner.givenName === 'Marie-Lou' && r.charge.owner.familyName === 'Cagan',
  'le prénom et le nom se séparent au premier espace');
ok(r.charge.name === 'Marie-Lou Cagan', 'la raison sociale est l\'identité LÉGALE de la fiche');
ok(r.charge.owner.locale === 'fr_FR', 'et les écrans de Mollie s\'ouvriront en français');
ok(r.charge.address.country === 'FR', 'le pays est celui qu\'on a reçu');
ok(r.charge.address.postalCode === '97133', 'le code postal est extrait de l\'adresse écrite d\'un tenant');
ok(r.charge.address.streetAndNumber === 'Rue de la Paix', 'ce qui le précède est la voie');
ok(r.charge.address.city === 'Gustavia', 'ce qui le suit est la commune');
ok(r.charge.registrationNumber === '80412578900014', 'et le SIRET part comme numéro d\'enregistrement');
const legal = P(Object.assign({}, fiche, {name: 'Marie-Lou', legalName: 'SARL Les Alizés'}), 'FR');
ok(legal.charge.name === 'SARL Les Alizés', 'une raison sociale différente du nom d\'usage l\'emporte');
const sansLegal = P({name: 'Jean Dupont', email: 'j@x.fr', address: '97133 Gustavia'}, 'FR');
ok(sansLegal.charge.name === 'Jean Dupont' && sansLegal.pret === true,
  'et sans raison sociale on prend le nom d\'usage : un particulier n\'est pas un dossier incomplet');

console.log('C — ce qu\'on ne sait pas se DIT, on ne l\'envoie pas à moitié');
const vide = P({}, '');
ok(vide.pret === false, 'une fiche vide ne part pas');
for (const m of ['email', 'nom', 'entreprise', 'pays']) {
  ok(vide.manques.indexOf(m) >= 0, 'et le manque « ' + m + ' » est nommé, pour qu\'on le fasse compléter');
  ok(bac.manques.indexOf(m) >= 0, 'ce manque vient d\'une liste fermée');
}
const unMot = P({name: 'Marie-Lou', email: 'm@x.fr'}, 'FR');
ok(unMot.manques.indexOf('nom') >= 0 && unMot.manques.indexOf('entreprise') < 0,
  'un seul mot ne fait pas un couple prénom/nom — et ce n\'est pas la raison sociale qui manque');
const malMail = P({name: 'A B', email: 'pas-une-adresse', address: '97133 X'}, 'FR');
ok(malMail.manques.indexOf('email') >= 0, 'une adresse électronique sans arrobase n\'en est pas une');
const siretCourt = P(Object.assign({}, fiche, {siret: '804125789'}), 'FR');
ok(siretCourt.pret === true, 'un SIRET incomplet ne bloque pas : Mollie le demandera lui-même');
ok(!('registrationNumber' in siretCourt.charge),
  'mais il est OMIS, pas tronqué : un numéro d\'enregistrement faux se découvre au contrôle d\'identité, des jours plus tard');
const siretEspaces = P(Object.assign({}, fiche, {siret: '804 125 789 00014'}), 'FR');
ok(siretEspaces.charge.registrationNumber === '80412578900014', 'les espaces d\'un SIRET saisi à la main ne le disqualifient pas');
const sansCp = P({name: 'A B', email: 'a@b.fr', address: 'Gustavia'}, 'FR');
ok(sansCp.pret === true && Object.keys(sansCp.charge.address).join() === 'country',
  'une adresse sans code postal ne part pas découpée au hasard : seul le pays part, et un champ vide se corrige');
const sansAdr = P({name: 'A B', email: 'a@b.fr'}, 'FR');
ok(sansAdr.charge.address.country === 'FR', 'une fiche sans adresse ne lève pas et ne perd pas le pays');

console.log('D — le pays se REÇOIT, il ne se devine pas');
/* C'est une déclaration faite à un établissement de paiement, et à la place de quelqu'un
   d'autre. Saint-Barthélemy est `BL`, et la liste de Mollie ne le propose pas ; ses
   entreprises sont françaises (SIRET, IBAN FR). Lequel envoyer n'est pas à nous de le
   supposer : la console le montre, un humain confirme. C'est la même règle qui fait refuser
   « Saint-Marin » à qui cherchait Saint-Martin. */
ok(P(fiche, '').manques.indexOf('pays') >= 0, 'sans pays confirmé, rien ne part');
ok(P(fiche, 'fr').charge.address.country === 'FR', 'il est normalisé en capitales');
ok(P(fiche, 'BL').charge.address.country === 'BL', 'et celui qu\'on confirme est celui qui part, quel qu\'il soit');
for (const faux of ['France', 'F', 'FRA', '97', 'fr-FR']) {
  ok(P(fiche, faux).manques.indexOf('pays') >= 0,
    '« ' + faux + " » n'est pas un code à deux lettres : on ne le corrige pas, on le refuse");
}
ok(!/97133|Saint-Barth|'BL'|"BL"/.test(nu.slice(nu.indexOf('function clientLinkProposition'))),
  'et le noyau ne porte AUCUN pays écrit en dur : rien à défaire le jour où la réponse de Mollie arrive');

console.log('E — le câblage : une seule porte pour le prestataire, deux sources');
const bloc = srv.slice(srv.indexOf('exports.mollieOnboardingLink'));
const lien = bloc.slice(0, bloc.indexOf('\n});'));
ok(lien.length > 400, 'le départ du prestataire a bien été trouvé (sinon les mesures suivantes ne mesurent rien)');
ok(/mollieClientLinkHref/.test(lien), 'il préfère le lien préparé par la console quand il existe');
ok(/mollieLienClient\(href, uid/.test(lien), 'et le compose au dernier moment, avec un état frais');
ok(/MOLLIE_AUTHORIZE/.test(lien), 'sinon il repart sur l\'autorisation d\'aujourd\'hui, qui relie un compte existant');
ok(/catch \(e\) \{ console\.warn\('mollieOnboardingLink fiche'/.test(lien),
  'une fiche illisible ne ferme rien : le prestataire ne reste jamais devant un bouton sans issue');
ok(/!a\.mollieOrgId/.test(lien), 'et un prestataire déjà relié ne se voit pas proposer de recréer un compte');
ok(/const MOLLIE_SCOPES = \[/.test(srv), 'les permissions demandées sont écrites une seule fois');
ok((srv.match(/'onboarding\.write'/g) || []).length === 1,
  'et une seule fois vraiment : deux listes finiraient par diverger, et les versements s\'arrêteraient sans que rien ne le dise');
ok(/MOLLIE_SCOPES\.join\(' '\)/.test(lien), 'le lien d\'autorisation les lit');
const mlc = srv.slice(srv.indexOf('function mollieLienClient'));
ok(/MOLLIE_SCOPES\.join\(' '\)/.test(mlc.slice(0, mlc.indexOf('\n}'))), 'le lien du client link aussi');

console.log('F — le bouton de la console : il montre avant d\'écrire');
const adm = srv.slice(srv.indexOf('exports.adminMollieInscrire'));
const corps = adm.slice(0, adm.indexOf('\n});'));
ok(corps.length > 800, 'le bouton de la console a bien été trouvé (sinon les mesures suivantes ne mesurent rien)');
ok(/ADMIN_EMAIL/.test(corps) && /permission-denied/.test(corps), 'il est réservé à l\'administrateur');
ok(/if \(!confirmer\) \{/.test(corps) && /apercu: true/.test(corps),
  'sans confirmation il ne fait RIEN chez Mollie : il rend ce qui PARTIRAIT');
const avantCreer = corps.slice(0, corps.indexOf('mollieCreerClientLink'));
ok(/if \(!confirmer\)/.test(avantCreer), 'et le refus d\'écrire est posé AVANT le moindre appel à Mollie');
ok(/if \(a\.mollieOrgId\) return \{deja: true/.test(corps),
  'un prestataire déjà relié n\'en reçoit pas un second : deux comptes Mollie pour un seul prestataire serait le pire résultat');
ok(/if \(!P\.pret\) return \{pret: false/.test(corps), 'une proposition incomplète est rendue telle quelle, avec ses manques');
ok(/clientLinkProposition\(a, pays, 'fr_FR'\)/.test(corps), 'la décision vient du noyau, la fonction ne la refait pas');
ok(/repli: 'autorisation'/.test(corps) && /raison: out\.raison/.test(corps),
  'un refus de Mollie retombe sur le chemin d\'aujourd\'hui, et son motif est DIT');
ok(/mollieClientLinkHref: out\.href/.test(corps) && !/mollieClientLinkUrl/.test(corps),
  'on ne garde que l\'adresse NUE : une requête signée mémorisée serait périmée avant d\'être touchée');
const creer = srv.slice(srv.indexOf('async function mollieCreerClientLink'));
const cc = creer.slice(0, creer.indexOf('\n}\n'));
ok(/'\/client-links', 'POST'/.test(cc), 'le lien se demande à Mollie sur /client-links');
ok(!/throw/.test(cc), 'et cet adaptateur ne LÈVE jamais : c\'est ce qui permet au repli d\'exister');
ok(/_links && r\.data\._links\.clientLink/.test(cc), 'l\'adresse se lit là où Mollie la met');
ok(/'réponse sans lien'/.test(cc), 'une réponse acceptée mais sans lien est un refus nommé, pas un succès vide');
/* ET LA CONSOLE NE REÇOIT AUCUN LIEN À TRANSMETTRE. Le `state` d'un lien ne vit que trente
   minutes : un lien copié dans une conversation serait mort avant d'être lu, et le
   prestataire retrouverait un écran qui ne marche pas — le défaut même que ce lot corrige,
   par la porte de derrière. */
ok(!/lien: mollieLienClient/.test(corps),
  'et elle ne reçoit AUCUN lien à transmettre : un lien copié dans un message serait périmé avant d\'être lu');

console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Inscription chez Mollie : tout est vert');
