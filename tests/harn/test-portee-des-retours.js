/* UNE VARIABLE DÉCLARÉE DANS UN `try` N'EXISTE PLUS APRÈS LE `catch`.

   Relevé en production le 26/10/2026, capture à l'appui : « ⚠ incident technique de
   notre côté » sur « Vérifier maintenant ». `payoutRetry` levait un ReferenceError à
   chaque appui — `let ecartees = 0;` vivait dans le `try`, le `return` final est après
   le `catch`. `node -c` passe, la suite complète était verte, et l'écran de
   l'administrateur était inutilisable depuis trois heures.

   L'ÉPREUVE QUI DEVAIT LE GARDER MENTAIT. Elle comparait deux PROFONDEURS d'accolades
   et trouvait « 2 = 2 » : la déclaration à (fonction + try), le retour à (fonction +
   accolade de l'objet littéral `return {`). Deux fois deux, pour deux raisons
   différentes. Et sa contre-épreuve passait parce qu'elle déplaçait la déclaration d'un
   cran SUPPLÉMENTAIRE — elle prouvait que le compteur savait compter, pas que
   l'assertion savait mesurer.

   ON DEMANDE DONC À L'ANALYSEUR. On insère une REDÉCLARATION `let` juste avant le
   retour : V8 refuse (« already been declared ») si la variable est dans la même
   portée. L'erreur PROUVE qu'elle y est ; un source qui passe prouve le contraire.
   Aucune accolade comptée, aucune heuristique.

   CE QU'ELLE COUVRE, ET CE QU'ELLE NE COUVRE PAS. Elle juge les variables RENDUES par un
   `return {…}` de premier niveau : 38 sur les 79 exports du serveur, aucune hors sonde.
   La classe est plus large — une variable déclarée dans un `try` et lue n'importe où
   après le `catch` — et cette classe-là a été mesurée À LA MAIN le 26/10/2026 : elle est
   PROPRE, aucun second cas. On n'en fait pas une garde, et c'est une décision : sans
   analyseur de portées (il n'y en a aucun dans node_modules), la recherche textuelle
   sur-accuse par nature, et une garde qui crie au loup finit désarmée. Les quatre
   sources de bruit, relevées, pour qu'on ne refasse pas les trois sondes :
     • la PROSE des commentaires — `a` et `n` se lisent dans « aux montants », « aucune
       facture » : 6 faux positifs sur 8 ;
     • le NOM RÉUTILISÉ dans un `try` frère — `notifyArtisanPaid` déclare trois `u`
       distincts, chacun dans son bloc : 12 candidats ;
     • la CLÉ d'objet et l'ACCÈS de propriété — `{j: …}` et `b.j` ne sont pas des
       références à la variable `j` ;
     • le PARAMÈTRE de `catch`, qui n'est ni `let` ni `const` et échappe au filtre des
       redéclarations.

   CE QUE CETTE GARDE NE COUVRE PAS, ET C'EST DIT :
   • les retours IMBRIQUÉS (dans un `if`, une boucle) — un `let` intérieur masque
     légalement celui du dessus, et la sonde crierait au loup ;
   • les retours qui sont le CORPS d'un `if` sans accolades — y insérer un `let` donne
     une AUTRE erreur d'analyse (« lexical declaration in a single-statement context »),
     que la sonde reconnaît et met de côté plutôt que de la compter comme un défaut.
   Une sonde qui sur-signale finit ignorée : elle mesure moins, et ce qu'elle mesure est
   sûr. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const SRV = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

/* Profondeur d'accolades, chaînes, gabarits et commentaires IGNORÉS — un compteur naïf
   déraille sur une apostrophe prise dans une expression régulière (déjà payé par
   `tests/memoire-pdf.test.js`, qui accusait la mauvaise fonction). */
function prof(t, idx) {
  let n = 0, i = 0, st = null;
  while (i < idx) {
    const c = t[i], d = t[i + 1];
    if (st) {
      if (st === '//' && c === '\n') st = null;
      else if (st === '/*' && c === '*' && d === '/') { st = null; i++; }
      else if ((st === "'" || st === '"' || st === '`') && c === '\\') i++;
      else if (c === st && st !== '//' && st !== '/*') st = null;
      i++; continue;
    }
    if (c === '/' && d === '/') { st = '//'; i += 2; continue; }
    if (c === '/' && d === '*') { st = '/*'; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { st = c; i++; continue; }
    if (c === '{') n++; else if (c === '}') n--;
    i++;
  }
  return n;
}

const re = /^exports\.([A-Za-z0-9_]+) = /gm;
let m; const bornes = [];
while ((m = re.exec(SRV))) bornes.push({ nom: m[1], i: m.index });
bornes.forEach((b, k) => { b.j = k + 1 < bornes.length ? bornes[k + 1].i : SRV.length; });
ok(bornes.length > 40, 'les exports du serveur se relèvent (' + bornes.length + ')');

let mesurees = 0, sautes = 0;
const horsSonde = [];
const fautifs = [];
bornes.forEach((x) => {
  const c = SRV.slice(x.i, x.j);
  /* LE CORPS COMMENCE APRÈS LA FLÈCHE, PAS À LA PREMIÈRE ACCOLADE. `onCall({secrets:
     [...]}, async (request) => {` : la première est celle des OPTIONS. En la prenant, le
     source reconstruit était absurde, l'analyseur rendait une erreur quelconque, et la
     sonde classait la fonction « inapplicable » — elle SAUTAIT donc `payoutRetry`,
     c'est-à-dire la seule pour laquelle elle a été écrite. Trouvé par la contre-épreuve,
     pas par la relecture. */
  const fleche = c.search(/=>\s*\{/);
  const corps = fleche < 0 ? -1 : c.indexOf('{', fleche);
  if (corps < 0) return;
  /* ET IL FINIT À L'ACCOLADE QUI LE FERME, pas au prochain export : découpé là, on
     embarquait le `});` de fin et le source reconstruit était mal formé — « Unexpected
     token } ». L'analyseur rendait alors une erreur quelconque, la sonde classait
     « inapplicable », et `payoutRetry` était SAUTÉE une seconde fois. Deux
     contre-épreuves pour le voir ; aucune relecture ne l'aurait dit. */
  /* ET « ZÉRO » N'EST PAS LA FIN DU CORPS : `prof` compte aussi la parenthèse
     d'`onCall`, donc la profondeur ne retombe à zéro qu'une fois l'APPEL fermé —
     le faux corps emportait le `})` et l'analyseur rendait « Unexpected token } ».
     La fin du corps est là où la profondeur retrouve celle d'AVANT son accolade. */
  const dedans = prof(c, corps);
  const ferme = (function () { for (let k = corps + 1; k < c.length; k++) { if (prof(c, k) === dedans) return k; } return -1; })();
  const rr = /return \{/g; let r;
  while ((r = rr.exec(c))) {
    /* ET « 1 » ÉTAIT ÉCRIT EN DUR : à l'intérieur du corps la profondeur vaut
       `dedans + 1`, soit 2 pour tout `onCall(…, async (request) => {`. Aucun retour de
       premier niveau d'un callable ne passait donc ce filtre : les 30 variables
       « mesurées » venaient d'ailleurs, et `payoutRetry` était sautée une TROISIÈME
       fois. Trois contre-épreuves pour le voir. */
    if (prof(c, r.index) !== dedans + 1) continue;      // retour imbriqué : hors sonde
    const fin = c.indexOf('};', r.index);
    if (fin < 0) continue;
    const bloc = c.slice(r.index, fin + 2);
    [...bloc.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)[,}]/g)]
      .map((y) => y[2])
      .forEach((nom) => {
        if (!new RegExp('\\b(let|const|var)\\s+' + nom + '\\b').test(c)) return;  // pas une locale
        /* `c.slice(r.index, ferme)` PORTE DÉJÀ l'accolade qui ferme le corps : on
           n'en rajoute pas une, on ferme la parenthèse. */
        const sonder = (at) => {
          try { new vm.Script('(async function(){' + c.slice(corps + 1, at) + 'let ' + nom + ';' + c.slice(at, ferme) + ')'); }
          catch (e) { return /already been declared/.test(e.message) ? 'presente' : 'inapplicable'; }
          return 'absente';
        };
        let verdict = sonder(r.index);
        /* UN RETOUR QUI EST LE CORPS D'UN `if` SANS ACCOLADES rend une AUTRE SyntaxError
           (« lexical declaration ... single-statement context ») : on la saute, on ne la
           compte pas pour un défaut. Mais on ne l'abandonne pas non plus — on pose le
           `let` devant l'INSTRUCTION, dans le même bloc, ce qui éprouve exactement la
           même portée. L'y poser DANS le `if` ne vaudrait rien : un `let` d'un bloc
           intérieur masque légalement celui du dehors, donc il n'entrerait jamais en
           collision et la sonde accuserait TOUT LE MONDE. */
        if (verdict === 'inapplicable') {
          const ligne = c.lastIndexOf('\n', r.index) + 1;
          if (ligne > corps) verdict = sonder(ligne);
        }
        /* CE QU'ELLE NE PEUT PAS JUGER SE NOMME : un décompte muet se lirait comme une
           couverture entière. Il n'y en a aucun aujourd'hui. */
        if (verdict === 'inapplicable') { sautes++; horsSonde.push(x.nom + ' → « ' + nom + ' »'); return; }
        mesurees++;
        if (verdict === 'absente') fautifs.push(x.nom + ' → « ' + nom + ' »');
      });
  }
});

console.log('\n── CHAQUE VARIABLE RENDUE EXISTE ENCORE AU RETOUR ──────────────────────');
console.log('  (' + mesurees + ' mesurées · ' + sautes + ' hors de portée de la sonde)');
if (horsSonde.length) console.log('  hors sonde : ' + horsSonde.join(', '));
ok(fautifs.length === 0, 'aucune variable déclarée dans un bloc qui s\'est refermé' + (fautifs.length ? ' — ' + fautifs.join(', ') : ''));
/* ASSERTION ARRIÈRE : une sonde qui ne reconnaîtrait plus rien rendrait zéro fautif et
   innocenterait tout le monde — c'est arrivé à la garde des noyaux d'Archipel. */
ok(mesurees >= 20, 'arrière : la sonde mesure bien quelque chose (' + mesurees + ' variables)');
/* ET QU'ELLE SAIT ENCORE RECONNAÎTRE LE DÉFAUT, sur un morceau fabriqué — sans quoi
   « zéro fautif » ne vaudrait rien le jour où la reconnaissance se casse. */
(function () {
  const faux = 'const b=[];\ntry { let e=0; b.push(e); } catch(x){}\nreturn {b: b, e: e};\n';
  let vu = 'absente';
  try { new vm.Script('(async function(){' + faux.slice(0, faux.indexOf('return {')) + 'let e;' + faux.slice(faux.indexOf('return {')) + '})'); }
  catch (e) { vu = /already been declared/.test(e.message) ? 'presente' : 'inapplicable'; }
  ok(vu === 'absente', 'arrière : le défaut de production, fabriqué, est bien reconnu');
  const sain = 'const b=[];\nlet e=0;\ntry { e=1; } catch(x){}\nreturn {b: b, e: e};\n';
  let vu2 = 'absente';
  try { new vm.Script('(async function(){' + sain.slice(0, sain.indexOf('return {')) + 'let e;' + sain.slice(sain.indexOf('return {')) + '})'); }
  catch (e) { vu2 = /already been declared/.test(e.message) ? 'presente' : 'inapplicable'; }
  ok(vu2 === 'presente', 'arrière : et un code SAIN n\'est pas accusé');
})();

console.log('\n' + (f ? '✗ ' + f + ' ÉCHEC(S)' : '✓ TOUT PASSE'));
process.exit(f ? 1 : 0);
