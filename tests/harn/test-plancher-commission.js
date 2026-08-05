/* UNE RÈGLE QUI COÛTE DE L'ARGENT AU PRESTATAIRE DOIT ÊTRE ÉCRITE QUELQUE PART.
   Un prestataire Ambassadeur, à qui on promet 5 % de commission, a lu « Commission
   Ti-Services (10 %) » sur son reçu. La règle appliquée était le plancher petites
   commandes — en dessous de 21 € de base, la commission ne descend pas sous 10 %, parce
   qu'en dessous elle ne couvre même pas les frais fixes d'encaissement. La règle est
   défendable ; ce qui ne l'était pas, c'est qu'elle n'existait QUE dans le manuel
   d'administration. Le prestataire n'avait aucun moyen de comprendre, et en concluait
   qu'on ne tient pas parole. Elle est désormais dans les conditions de vente, dans les
   trois langues — et nulle part ailleurs : un reçu n'est pas un endroit où plaider. */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

console.log('A — la règle appliquée par le code');
const mMin = /const SMALL_COMM_MIN=(\d+), SMALL_COMM_PCT=(\d+);/.exec(src);
ok(!!mMin, 'le plancher est défini côté application');
const MIN = mMin ? mMin[1] : '', PCT = mMin ? mMin[2] : '';
const sMin = /const SMALL_COMM_MIN = (\d+)[,;]/.exec(fn) || /SMALL_COMM_MIN = (\d+)/.exec(fn);
const sPct = /SMALL_COMM_PCT = (\d+)/.exec(fn);
ok(sMin && sMin[1] === MIN && sPct && sPct[1] === PCT,
  'et le serveur applique EXACTEMENT le même (' + MIN + ' € / ' + PCT + ' %) — deux valeurs qui divergent, c’est une facture fausse');

console.log('B — et écrite dans les conditions de vente, dans les trois langues');
// Les chiffres du texte légal sont comparés aux constantes : si l'un bouge sans l'autre,
// les conditions mentent, et c'est le document qui fait foi devant un prestataire.
ok(new RegExp('Plancher sur les petites commandes').test(src), 'FR : la clause existe');
ok(new RegExp('inférieure à ' + MIN + ' €').test(src) && new RegExp('minimum à ' + PCT + ' %').test(src),
  'FR : avec les mêmes chiffres que le code (' + MIN + ' € / ' + PCT + ' %)');
ok(/statut Ambassadeur/.test(src),
  'FR : et elle dit explicitement qu’elle prime sur le statut Ambassadeur — c’est là que naissait le malentendu');
ok(/frais fixes d'encaissement bancaire/.test(src), 'FR : la raison est donnée, pas seulement la règle');

ok(/Floor on small orders/.test(src), 'EN : la clause existe');
ok(new RegExp('below €' + MIN).test(src) && new RegExp('minimum of ' + PCT + '%').test(src), 'EN : mêmes chiffres');
ok(/Ambassador status/.test(src), 'EN : même mention du statut');

ok(/Limite mínimo nas pequenas encomendas/.test(src), 'PT : la clause existe');
ok(new RegExp('inferior a ' + MIN + ' €').test(src) && new RegExp('mínimo de ' + PCT + ' %').test(src), 'PT : mêmes chiffres');
ok(/estatuto Embaixador/.test(src), 'PT : même mention du statut');

console.log('C — la numérotation des articles n’a pas bougé');
// Insérer une clause en créant un article décale tout ce qui suit : les renvois entre
// articles, et ceux que des tiers ont pu faire, deviennent faux.
const num = (anc) => { const i = src.indexOf(anc); const t = []; src.slice(i, i + 22000).replace(/<h3>(\d+)\. /g, (m, n) => { t.push(Number(n)); return m; }); return t.slice(0, 12).join(','); };
ok(num('<h3>1. Objet</h3>') === '1,2,3,4,5,6,7,8,9,10,11,12', 'FR : 1 à 12, inchangée');
ok(num('<h3>2. Prices</h3>').startsWith('2,3,4,5,6,7,8,9,10,11,12'), 'EN : idem');
ok(num('<h3>2. Preços</h3>').startsWith('2,3,4,5,6,7,8,9,10,11,12'), 'PT : idem');

console.log('D — et nulle part ailleurs');
// Le reçu du prestataire n'est pas un endroit où plaider sa cause : il affiche un taux,
// pas une justification. La règle se lit dans les conditions, qu'il a acceptées.
const recu = src.slice(src.indexOf('function proPaid()'), src.indexOf('function proPaid()') + 3000);
ok(!/plancher|21 €|petites commandes/i.test(recu),
  'le reçu de fin de mission n’explique pas la règle — il montre le taux appliqué');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
