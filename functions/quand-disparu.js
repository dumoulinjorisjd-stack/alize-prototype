/* QUAND LES MESSAGES ONT-ILS DISPARU ?
   ───────────────────────────────────
   « 😭 » — l'éditeur, le 13/10/2026, devant une lecture du 12/10 à 11 h 54 qui répond
   « aucun message dans son compte à cette date ».

   LA LECTURE A MARCHÉ, ET C'EST DÉJÀ UNE RÉPONSE : Firestore a bien servi l'état de la
   base d'il y a un jour, donc la fenêtre de sept jours EST ouverte sur ce projet. Ce qui
   manque n'est pas l'outil, c'est l'HEURE : à 11 h 54 la conversation était déjà vide, et
   personne ne sait à quelle minute elle s'est vidée. Tâtonner à la main, c'est une
   requête par essai, et la bonne minute peut être n'importe où dans sept jours.

   ON SONDE, PUIS ON ENCADRE. Quelques points régulièrement espacés donnent la FORME (où
   il y avait des messages, où il n'y en a plus), puis une dichotomie resserre le passage
   jusqu'à la minute. Une poignée de lectures suffit là où un balayage régulier en
   demanderait des milliers.

   CE QUE CETTE MÉTHODE SUPPOSE, ET QUI DOIT ÊTRE DIT : qu'il n'y a eu qu'UNE disparition.
   Une conversation vidée, puis réécrite, puis revidée tromperait la dichotomie — elle
   trouverait UN passage, pas tous. Les sondes brutes sont donc rendues telles quelles :
   l'œil y voit ce que la conclusion ne dit pas.

   Module PUR : aucune base, aucune horloge, les instants se RECOIVENT. */

const SONDES = 12;                  // points de reconnaissance sur la fenêtre
const BISSECTIONS_MAX = 14;         // 7 jours / 2^14 ≈ 1 minute
const PRECISION_MS = 60 * 1000;
const LECTURES_MAX = 32;            // plafond dur : une lecture coûte un aller-retour

function ms(v) { const n = Number(v); return isFinite(n) ? n : 0; }

/* Les instants à sonder, du plus ancien au plus récent, bornes comprises. */
function grilleSondes(debut, fin, n) {
  const a = ms(debut); const b = ms(fin);
  const k = Math.max(2, Math.floor(Number(n) || SONDES));
  if (!(b > a)) return [a];
  const pas = (b - a) / (k - 1);
  const out = [];
  for (let i = 0; i < k; i++) out.push(Math.round(a + pas * i));
  return out;
}

/* Le PASSAGE : le dernier instant sondé où il y avait des messages, et le premier
   d'après où il n'y en a plus. Rend `null` quand il n'y a rien à encadrer — et les deux
   cas sans passage ne se confondent pas, l'appelant les distingue par les sondes. */
function encadrer(sondes) {
  const l = (Array.isArray(sondes) ? sondes : []).slice()
    .sort(function (x, y) { return ms(x.at) - ms(y.at); });
  for (let i = l.length - 1; i >= 0; i--) {
    if (ms(l[i].n) > 0) {
      if (i === l.length - 1) return null;          // il y en a encore maintenant
      return {avant: l[i], apres: l[i + 1]};
    }
  }
  return null;                                       // il n'y en a eu nulle part
}

/* L'instant suivant à lire, ou `null` quand on est assez précis. */
function prochaineBissection(avant, apres, precisionMs) {
  const a = ms(avant && avant.at); const b = ms(apres && apres.at);
  const p = ms(precisionMs) || PRECISION_MS;
  if (!(b > a) || (b - a) <= p) return null;
  return Math.round((a + b) / 2);
}

/* Ce qu'on a appris. `etat` est une liste FERMÉE : un mot inattendu ne devient pas une
   phrase à l'écran. */
function verdict(sondes, cadre) {
  const l = (Array.isArray(sondes) ? sondes : []).slice()
    .sort(function (x, y) { return ms(x.at) - ms(y.at); });
  const avecMsg = l.filter(function (s) { return ms(s.n) > 0; });
  if (!l.length) return {etat: 'rien-lu', sondes: l};
  if (!avecMsg.length) return {etat: 'jamais', sondes: l};
  if (!cadre) return {etat: 'toujours-la', sondes: l, dernier: l[l.length - 1]};
  return {
    etat: 'disparu',
    sondes: l,
    // Le dernier instant où l'on a VU des messages, et le premier où il n'y en avait
    // plus : la disparition est entre les deux, pas « à » l'un des deux.
    vuLe: cadre.avant, videLe: cadre.apres,
    combien: ms(cadre.avant.n),
  };
}

module.exports = {
  SONDES, BISSECTIONS_MAX, PRECISION_MS, LECTURES_MAX,
  grilleSondes, encadrer, prochaineBissection, verdict,
};
