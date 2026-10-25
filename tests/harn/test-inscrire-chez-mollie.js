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
/* UNE ADRESSE SANS CODE POSTAL EST LE CAS ORDINAIRE DU PARC — à Saint-Barthélemy on écrit
   « Gustavia », pas « 97133 Gustavia ». Un premier jet la jetait tout entière ; ce qui est
   ÉCRIT dans la fiche part, tel quel, comme voie. Et la moitié qui compte : le code postal
   de l'île n'est pas ajouté pour autant — un code postal supposé est une donnée fausse
   déclarée à un établissement de paiement. */
const sansCp = P({name: 'A B', email: 'a@b.fr', address: 'Gustavia'}, 'FR');
ok(sansCp.pret === true && sansCp.charge.address.streetAndNumber === 'Gustavia',
  'une adresse sans code postal n\'est pas jetée : elle part comme voie (« ' + (sansCp.charge.address.streetAndNumber || '—') + ' »)');
ok(!('postalCode' in sansCp.charge.address) && !('city' in sansCp.charge.address),
  'et rien n\'est inventé autour : ni code postal ni commune');
const avecCp = P({name: 'A B', email: 'a@b.fr', address: 'Rue de la Paix, 97133 Gustavia'}, 'FR');
ok(avecCp.charge.address.postalCode === '97133' && avecCp.charge.address.streetAndNumber === 'Rue de la Paix'
  && avecCp.charge.address.city === 'Gustavia',
  'une adresse qui PORTE un code postal se découpe toujours comme hier');
/* LE NOM D'UNE PERSONNE A SA PROPRE SOURCE. Mesuré sur l'inscription prestataire le
   25/10/2026 : elle ne demande qu'un champ, « nom / raison sociale », recopié dans `name`,
   `legalName` et `users.name`. « CCS » ne se coupe pas en deux — et ce n'était pas une
   lecture fautive, la donnée n'existait nulle part. */
const ent = P({name: 'CCS', legalName: 'CCS', email: 'a@b.fr'}, 'FR');
ok(ent.pret === false && ent.manques.indexOf('nom') >= 0,
  'une raison sociale d\'un seul mot ne fait toujours pas un prénom et un nom');
const entRep = P({name: 'CCS', legalName: 'CCS', email: 'a@b.fr', repGiven: 'Joris', repFamily: 'Dumoulin'}, 'FR');
ok(entRep.pret === true && entRep.charge.owner.givenName === 'Joris' && entRep.charge.owner.familyName === 'Dumoulin',
  'le représentant déclaré donne le prénom et le nom');
/* L'ORDRE D'UN NOM NE SE DEVINE PAS : « Courcot Laura », relevé sur une fiche de
   production, est le nom de famille d'abord. Le découpage le propose, les deux moitiés
   saisies l'emportent — et une seule moitié ne suffit pas, sinon on déclarerait un demi
   nom à un établissement de paiement. */
const inv = P({name: 'Courcot Laura', legalName: 'Courcot Laura', email: 'a@b.fr'}, 'FR');
ok(inv.charge.owner.givenName === 'Courcot' && inv.charge.owner.familyName === 'Laura',
  'sans rien saisir, le découpage reste celui d\'hier — proposé, et montré avant d\'être envoyé');
const remis = P({name: 'Courcot Laura', legalName: 'Courcot Laura', email: 'a@b.fr',
  repGiven: 'Laura', repFamily: 'Courcot'}, 'FR');
ok(remis.charge.owner.givenName === 'Laura' && remis.charge.owner.familyName === 'Courcot',
  'remis à l\'endroit, ce sont les moitiés saisies qui partent');
const moitie = P({name: 'CCS', legalName: 'CCS', email: 'a@b.fr', repGiven: 'Joris'}, 'FR');
ok(moitie.pret === false && moitie.manques.indexOf('nom') >= 0,
  'une seule moitié ne fait pas une identité');
ok(entRep.charge.name === 'CCS',
  'et il ne remplace PAS la raison sociale : ce sont deux faits, Mollie les demande tous les deux');
const part = P({name: 'Marie-Lou Cagan', legalName: 'Marie-Lou Cagan', email: 'a@b.fr'}, 'FR');
ok(part.pret === true && part.charge.owner.givenName === 'Marie-Lou',
  'et un prestataire inscrit en son nom propre marche comme hier, sans rien saisir de plus');
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
/* UNE GARDE DE SOURCE NE PROUVE PAS UN COMPORTEMENT. La première version cherchait la
   PRÉSENCE de l'appel : `if (false) return mollieLienClient(...)` la laissait VERTE, et une
   contre-épreuve a rendu zéro rouge — c'est-à-dire qu'elle ne mesurait rien. Elle épingle
   donc la CONDITION qui déclenche le retour, et refuse les formes qui la neutralisent en
   silence. Ce que le harnais ne peut pas rejouer est dit : cette fonction lit Firestore et
   ne tourne pas ici ; le rendu côté console, lui, est mesuré à côté. */
const iRet = lien.indexOf('return {url: mollieLienClient(href, uid');
const iIf = iRet > 0 ? lien.lastIndexOf('if (', iRet) : -1;
/* ON NE DEVINE PAS LA CONDITION PAR UNE EXPRESSION RÉGULIÈRE : un « .*? » partait du PREMIER
   `if (` de la fonction et capturait tout son corps, si bien que « la condition porte sur
   href » était vraie quoi qu'on mette — la contre-épreuve l'a dit. On remonte au `if (` le
   plus proche du retour, et l'on lit ce qu'il y a entre. */
const cond = (iIf > 0 && iRet > iIf) ? lien.slice(iIf + 4, lien.lastIndexOf(') ', iRet)).trim() : '';
ok(!!cond && /\bhref\b/.test(cond),
  'et il ne le compose que sous une condition portant sur ce lien, jamais sous une condition morte : « ' + (cond || '(aucune)') + ' »');
ok(/indexOf\('https:\/\/'\) === 0/.test(cond),
  'cette condition exige une vraie adresse, pas une chaîne quelconque');
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
ok(/clientLinkProposition\(fiche, pays, 'fr_FR'\)/.test(corps), 'la décision vient du noyau, la fonction ne la refait pas');
/* LE NOM DU RESPONSABLE ARRIVE DE LA CONSOLE, parce qu'il n'est nulle part dans le parc —
   l'inscription ne demande qu'un champ, « nom / raison sociale ». Ce qui compte ici : il
   est BORNÉ (il vient d'un appelant), il entre dans la décision SANS écraser la fiche lue,
   et il ne s'écrit qu'avec le lien — jamais sur un aperçu, qui ne doit RIEN écrire. */
ok(/const mot = \(v\) => String\(v == null \? '' : v\)\.trim\(\)\.slice\(0, 80\)/.test(corps),
  'les deux moitiés reçues sont rognées et bornées : elles viennent d\'un appelant, pas de la fiche');
ok(/const fiche = \(rGiven && rFamily\) \? Object\.assign\(\{\}, a, \{repGiven: rGiven, repFamily: rFamily\}\) : a;/.test(corps),
  'elles complètent une COPIE de la fiche, et seulement ENSEMBLE : un demi nom n\'écrase rien');
const apresCreer = corps.slice(corps.indexOf('mollieCreerClientLink'));
ok(/ecrire\.repGiven = rGiven; ecrire\.repFamily = rFamily;/.test(apresCreer),
  'et elles ne s\'écrivent sur la fiche qu\'APRÈS le lien : un aperçu n\'écrit rien');
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

/* ── UN JETON PAR USAGE, ET CELUI QUI TOUCHE L'ARGENT NE BOUGE PAS ───────────────────
   Mollie a refusé le 25/10/2026 sur une PERMISSION (`clients.write`), que seul un « jeton
   d'accès avancé » porte. Remplacer `MOLLIE_ACCESS_TOKEN` par un tel jeton casserait les
   paiements : c'est une clé de PROFIL, et c'est elle — pas une charge utile — qui range
   chaque paiement sur Ti-services plutôt que sur Archipel BTP. D'où un SECOND secret, qui
   ne sert qu'aux client links. Ce qui est mesuré ici est sa FRONTIÈRE. */
console.log('\n── Le second jeton ne sert qu\'aux client links ──');
const sigApi = srv.slice(srv.indexOf('async function mollieApi('));
const corpsApi = sigApi.slice(0, sigApi.indexOf('\n}\n'));
ok(/async function mollieApi\(path, method, body, jeton\)/.test(corpsApi),
  'mollieApi accepte un jeton, en dernier et facultatif');
ok(/'Bearer ' \+ \(jeton \|\| process\.env\.MOLLIE_ACCESS_TOKEN\)/.test(corpsApi),
  'et sans lui elle présente la clé d\'aujourd\'hui : les appels existants ne changent pas d\'un caractère');
ok(/'\/client-links', 'POST', charge, process\.env\.MOLLIE_CLIENTS_TOKEN \|\| ''/.test(cc),
  'la porte des client links présente MOLLIE_CLIENTS_TOKEN');
ok(/\|\| ''/.test(cc),
  'et son absence retombe sur le comportement d\'hier : rien ne casse tant que le secret n\'est pas posé');
/* LA MOITIÉ QUI COMPTE. Un jeton d'organisation employé sur /payments rangerait l'argent
   sur le mauvais profil, ou le ferait refuser faute de `profileId` — qui n'existe dans
   AUCUNE charge utile, mesuré juste en dessous. Le second jeton ne doit donc toucher
   qu'une seule ressource. */
/* ON COMPTE LE CODE, PAS LA PROSE. Un premier jet comptait les occurrences dans le
   fichier entier et rougissait sur le COMMENTAIRE qui explique le correctif — la garde
   mesurait sa propre justification. Les commentaires de bloc et les lignes entièrement
   commentées partent donc ; une ligne de code n'est jamais tronquée, de sorte qu'aucune
   occurrence réelle ne peut se cacher derrière un `//` de fin de ligne. */
const codeSeul = srv.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
ok(codeSeul.length > srv.length / 3 && /exports\.adminMollieInscrire/.test(codeSeul),
  'assertion arrière : le code dépouillé de ses commentaires est encore le serveur');
/* ON COMPTE LES APPELS, PAS LES DÉCLARATIONS. Une liste `secrets:` n'envoie rien à
   personne : elle dit seulement quelles fonctions ont le droit de lire le secret, et il y
   en a légitimement plusieurs dès que deux portes mènent aux client links. Ce qui doit
   rester unique est l'endroit où le jeton est PRÉSENTÉ à Mollie. (Première version : un
   simple compte d'occurrences — elle a rougi dès qu'une seconde fonction a déclaré le
   secret, sur un code parfaitement juste.) */
const occDecl = codeSeul.split('MOLLIE_CLIENTS_TOKEN').length - 1;
ok(occDecl >= 2, 'le second secret est bien dans le CODE, pas seulement dans un commentaire (assertion arrière : ' + occDecl + ')');
const sansSecrets = codeSeul.replace(/secrets: \[[^\]]*\]/g, '');
const occ = sansSecrets.split('MOLLIE_CLIENTS_TOKEN').length - 1;
ok(occ === 1, 'et il n\'est PRÉSENTÉ qu\'une seule fois, hors des listes de secrets — jamais sur un paiement');
ok(/'\/client-links', 'POST', charge, process\.env\.MOLLIE_CLIENTS_TOKEN/.test(sansSecrets),
  'et cette unique fois est bien l\'appel aux client links');
ok(/secrets: \['MOLLIE_ACCESS_TOKEN', 'MOLLIE_CLIENTS_TOKEN'/.test(codeSeul),
  'il est déclaré sur la seule fonction qui emprunte cette porte');
ok(codeSeul.split('profileId').length - 1 === 0,
  'et aucune charge utile ne porte de profileId : c\'est la CLÉ qui range un paiement sur le bon profil, et elle ne bouge pas');

/* ── UN LIEN PÉRIMÉ NE SE SERT PAS ──────────────────────────────────────────────────
   Relevé le 25/10/2026 : Mollie périme un client link au bout de TRENTE JOURS. Nous
   écrivions `mollieClientLinkAt` et ne le relisions JAMAIS — le lien était servi
   indéfiniment. Une prestataire qui tarde un mois aurait donc pressé son bouton pour
   arriver sur une adresse morte, c'est-à-dire exactement l'écran sans issue que tout ce
   travail existe pour supprimer, revenu par la porte du temps. */
console.log('\n── Un lien périmé se refait, il ne se sert pas ──');
const iF0 = srv.indexOf('const CLIENT_LINK_JOURS');
const iF1 = srv.indexOf('\n}\n', srv.indexOf('function clientLinkFrais'));
ok(iF0 > 0 && iF1 > iF0, 'la durée de vie du lien est déclarée dans le serveur');
const srcF = srv.slice(iF0, iF1 + 2);
ok(/function clientLinkFrais/.test(srcF), 'assertion arrière : le relevé porte bien la décision');
ok(codeNu(srcF).indexOf('Date') < 0,
  'et elle ne lit PAS l\'horloge : le moment se reçoit, donc « vingt-neuf jours » s\'éprouve sans attendre un mois');
const bacF = {};
vm.createContext(bacF);
new vm.Script(srcF + '\nthis.frais = clientLinkFrais; this.jours = CLIENT_LINK_JOURS;').runInContext(bacF);
const J = 24 * 60 * 60 * 1000, T = 1800000000000;
ok(bacF.jours < 30, 'elle garde une marge sous les trente jours de Mollie (' + bacF.jours + ')');
ok(bacF.frais(T, T) === true, 'un lien du jour est frais');
ok(bacF.frais(T - 27 * J, T) === true, 'à vingt-sept jours il l\'est encore');
ok(bacF.frais(T - 29 * J, T) === false, 'à vingt-neuf jours il ne l\'est plus');
ok(bacF.frais(0, T) === false && bacF.frais(undefined, T) === false && bacF.frais('x', T) === false,
  'et SANS date on ne sait pas : on refait plutôt que de servir une adresse qu\'on ne peut pas dater');
/* LE CÂBLAGE. La décision ne vaut que si le chemin du prestataire la consulte — et que si
   l'échec retombe sur l'autorisation, le chemin d'hier, qui marche toujours. */
const iL = srv.indexOf('exports.mollieOnboardingLink');
const porteP = srv.slice(iL, srv.indexOf('\n});\n', iL));
ok(porteP.length > 600, 'assertion arrière : le corps de la porte du prestataire est bien relevé');
ok(/clientLinkFrais\(a\.mollieClientLinkAt, Date\.now\(\)\)/.test(porteP),
  'la porte du prestataire consulte la fraîcheur avant de servir le lien');
ok(/href = '';/.test(porteP) && /mollieCreerClientLink\(P\.charge\)/.test(porteP),
  'un lien périmé est jeté, puis refait');
ok(/String\(a\.mollieClientLinkPays \|\| ''\)\.trim\(\)/.test(porteP) && /if \(paysGarde\)/.test(porteP),
  'et il se refait avec le pays DÉJÀ confirmé par un humain — jamais un pays deviné');
ok(!/throw/.test(porteP.slice(porteP.indexOf('clientLinkFrais'))),
  'rien ne LÈVE dans ce rattrapage : un refus de Mollie retombe sur l\'autorisation, jamais pire qu\'avant');
ok(/secrets: \['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET', 'MOLLIE_ACCESS_TOKEN', 'MOLLIE_CLIENTS_TOKEN'\]/.test(srv),
  'la porte déclare les secrets dont la refabrication a besoin');
ok(/mollieClientLinkPays: pays/.test(corps),
  'et le pays confirmé est gardé À LA CRÉATION, sans quoi il n\'y aurait rien à réemployer');

console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Inscription chez Mollie : tout est vert');
