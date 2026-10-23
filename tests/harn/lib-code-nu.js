/* ══ SCANNER LE CODE, PAS LA PROSE — PORTE UNIQUE ═══════════════════════════════════
 * Les gardes de pureté d'un noyau cherchent des identifiants du monde extérieur
 * (`Date`, `await`, `fetch`…) dans sa source. Cherchés dans le TEXTE BRUT, ils tombent
 * sur les COMMENTAIRES qui expliquent précisément pourquoi le noyau ne s'en sert pas :
 * « le mandat vit jusqu'à l'expiration de la carte, que Mollie rend dans
 * `details.cardExpiryDate` » a fait rougir, le 23/10/2026, une garde portant sur un
 * noyau parfaitement pur. C'est la même faute que `facturationPhrase` cherché dans un
 * fichier entier : une garde qui lit sa propre justification ne garde rien, et elle
 * pousse à ne plus écrire la justification.
 *
 * On retire donc commentaires et littéraux de chaîne avant de scanner. UNE SEULE FOIS,
 * ici : deux épreuves avec deux détourages finiraient par ne plus détourer pareil.
 *
 * CE QU'IL NE FAIT PAS, ET C'EST DIT : il ne reconnaît pas les littéraux d'expression
 * régulière. Une barre oblique de division et celle d'un littéral régulier ne se
 * distinguent pas sans analyseur syntaxique (leçon payée côté Archipel sur un
 * dépouilleur écrit à la main). Conséquence : une regex qui contiendrait une apostrophe
 * ou `//` fausserait le détourage. Les noyaux éprouvés ici n'en ont pas, et
 * `verifieDetourage` ci-dessous rougit si le détourage cesse de mordre. */
function codeNu(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++;
      out += q + q;   // on garde une chaîne VIDE : la forme du code reste lisible
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* ASSERTION ARRIÈRE DU DÉTOURAGE LUI-MÊME. Un détourage qui rendrait du vide — ou qui
 * cesserait de reconnaître un commentaire — innocenterait n'importe quel noyau en
 * silence. On lui donne donc un morceau fabriqué : l'impureté écrite en CODE doit
 * survivre, celle écrite en COMMENTAIRE ou en CHAÎNE doit disparaître. */
function verifieDetourage(ok) {
  const faux = [
    'function f() {',
    '  // ce noyau ne lit pas Date.now(), et c\'est tout son intérêt',
    '  /* ni fetch, ni await : voir details.cardExpiryDate */',
    '  const m = "await fetch(Date)";',
    '  return 1;',
    '}',
  ].join('\n');
  const nu = codeNu(faux);
  ok(nu.indexOf('Date') < 0 && nu.indexOf('fetch') < 0 && nu.indexOf('await') < 0,
    'le détourage retire bien commentaires et chaînes (sinon les gardes de pureté lisent leur propre prose)');
  const vrai = codeNu('function g() { return Date.now(); }');
  ok(vrai.indexOf('Date') >= 0, 'et il laisse l\'impureté écrite en CODE (sinon il innocente tout le monde)');
  ok(codeNu('const a = 1;').indexOf('const a') >= 0, 'et il ne rend pas du vide');
}

module.exports = {codeNu, verifieDetourage};
