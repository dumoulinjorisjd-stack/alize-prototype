/* CHERCHER QUELQU'UN DANS LA BASE D'IL Y A QUELQUES HEURES.
   ───────────────────────────────────────────────────────
   « Il était là ce matin », et il n'apparaît plus nulle part. Firestore garde l'état de
   la base pendant sept jours (lecture à un instant donné) : ce matin est donc LISIBLE.
   L'outil de récupération existait déjà — mais il demandait une ADRESSE E-MAIL, et il la
   cherchait par égalité stricte. Quand quelqu'un disparaît, on se souvient d'un NOM, pas
   d'une adresse ; et c'est précisément quand on ne sait plus rien qu'on vient chercher.

   ON RAMÈNE DONC LA LISTE ET ON FILTRE ICI. Une requête par égalité ne pardonne pas une
   lettre, et une recherche par préfixe n'existe pas sur ce champ. Le parc tient
   largement dans une lecture ; le jour où il ne tiendrait plus, la limite se voit (la
   réponse DIT qu'elle est tronquée) au lieu de rendre silencieusement un résultat faux.

   LA COMPARAISON PORTE SUR CE QUI SE LIT : accents, casse et espaces ne font pas une
   différence, et chaque MOT doit tomber — « sunny regards » trouve « sunnyregards » ?
   Non, et c'est voulu : coller deux mots est un autre nom. Mais « regards sunny » trouve
   « Sunnyregards SARL », parce que l'ordre dans lequel on se souvient d'un nom n'a aucune
   raison d'être le bon.

   Module PUR : aucune base, aucune horloge. */

const CANDIDATS_MAX = 25;

function netTexte(v) {
  return String(v == null ? '' : v).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/* Les champs d'identité d'une fiche, quelle que soit sa collection. On ratisse LARGE :
   celui qui cherche se souvient d'un nom commercial, d'une enseigne, d'un bout d'adresse
   e-mail — pas du champ où c'est rangé. */
function identiteTexte(l) {
  const d = l || {};
  return [d.name, d.legalName, d.company, d.email, d.phone, d.siret, d.zone, d.other]
    .filter(Boolean).join(' ');
}

/* Rend les candidats, et DIT s'il a fallu couper. Une liste tronquée qui ne le dit pas
   ferait conclure « il n'y est pas » alors qu'on n'a pas tout regardé. */
function filtrerCandidats(lignes, q, max) {
  const t = netTexte(q);
  const plafond = Number(max) > 0 ? Number(max) : CANDIDATS_MAX;
  if (!t) return {candidats: [], total: 0, tronque: false};
  const mots = t.split(' ').filter(Boolean);
  const gardes = [];
  (Array.isArray(lignes) ? lignes : []).forEach(function (l) {
    const foin = netTexte(identiteTexte(l));
    if (!foin) return;
    for (let i = 0; i < mots.length; i++) { if (foin.indexOf(mots[i]) < 0) return; }
    gardes.push(l);
  });
  return {
    candidats: gardes.slice(0, plafond),
    total: gardes.length,
    tronque: gardes.length > plafond,
  };
}

/* Deux collections, un seul compte : on réunit par uid pour ne pas présenter deux fois la
   même personne, et la fiche PRESTATAIRE l'emporte sur la fiche utilisateur (c'est elle
   qui porte le métier et le statut du dossier, donc ce qui permet de le reconnaître). */
function reunirParUid(users, artisans) {
  const m = Object.create(null);
  const verser = function (liste, source) {
    (Array.isArray(liste) ? liste : []).forEach(function (l) {
      const u = (l && l.uid) || '';
      if (!u) return;
      const avant = m[u] || {uid: u, sources: []};
      m[u] = {
        uid: u,
        nom: (source === 'artisans' ? (l.name || avant.nom) : (avant.nom || l.name)) || '',
        email: avant.email || l.email || '',
        role: (source === 'artisans' ? 'artisan' : (l.role || avant.role || 'client')),
        statut: (source === 'artisans' ? (l.status || '') : (avant.statut || '')),
        metiers: (source === 'artisans' && Array.isArray(l.cats)) ? l.cats.slice(0, 12) : (avant.metiers || []),
        sources: avant.sources.concat([source]),
      };
    });
  };
  verser(users, 'users');
  verser(artisans, 'artisans');
  return Object.keys(m).map(function (k) { return m[k]; });
}

module.exports = {CANDIDATS_MAX, netTexte, identiteTexte, filtrerCandidats, reunirParUid};
