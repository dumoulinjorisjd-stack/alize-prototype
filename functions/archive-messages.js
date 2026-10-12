/* LA PREUVE NE PEUT PAS VIVRE DANS LE DOCUMENT QU'ON EFFACE.
   ─────────────────────────────────────────────────────────
   « Les messages dans la messagerie de l'application ont disparu de la console, la
   conversation de ce matin ayant disparu je n'ai plus le moyen de prouver ce qu'elle m'a
   dit, cela ne doit plus se reproduire. » — l'éditeur, le 12/10/2026.

   LA MESSAGERIE GÉNÉRALE VIT SUR `users/{uid}.support`, c'est-à-dire DANS la fiche du
   compte. Tout ce qui efface la fiche efface la conversation avec elle, et il existait
   une archive — mais elle était prise AU MOMENT DE LA SUPPRESSION, donc elle perdait la
   course : le commentaire de `journaliserDepart` le dit mot pour mot, « les fiches ont pu
   être effacées AVANT nous (l'application supprime ses documents puis le compte) ». Une
   archive qui dépend du bon ordre de deux effacements n'est pas une archive.

   ON COPIE DONC À L'ÉCRITURE, PAS À LA MORT. Chaque message passe dans `supportArchive`
   à la seconde où il est envoyé, par le serveur, dans une collection que le règlement
   interdit à tout client (`allow write: if false` — seul l'Admin SDK y entre). Après
   quoi, effacer son compte, vider la conversation depuis la console ou perdre sa fiche
   n'y change plus rien.

   ON N'ENLÈVE JAMAIS RIEN. La fusion est une UNION : ce qui est archivé le reste, même
   si la conversation vivante rétrécit — c'est précisément le cas qu'on protège. Une
   archive qui suivrait la source aurait exactement le même défaut que la source.

   LA CLÉ EST CE QUI SE LIT. Deux exemplaires du même message portent le même auteur, le
   même instant et le même texte ; ils n'en font qu'un. On ne se fie pas à un rang dans
   un tableau : le tableau est réordonné à chaque lecture, et deux appareils ne l'écrivent
   pas dans le même ordre.

   Module PUR : aucun accès réseau, aucune base, aucune horloge. Éprouvé par
   `tests/test-archive-messages.js`. */

// Un document Firestore plafonne à 1 Mio. 400 messages de 2 000 caractères tiennent
// largement dessous, et une conversation de support qui dépasse 400 messages n'existe pas
// dans ce parc. Au-delà on garde les DERNIERS et l'on DIT qu'on a tronqué.
const ARCHIVE_MSG_MAX = 400;
const ARCHIVE_TXT_MAX = 2000;

function nombre(v) { const n = Number(v); return (isFinite(n) && n > 0) ? n : 0; }

// Un message réduit à ce qu'une preuve demande : qui, quoi, quand. Bornes dures — ce qui
// entre ici vient d'un compte, et c'est le serveur qui l'écrit.
function msgNet(m) {
  const d = m || {};
  return {
    from: String(d.from == null ? '' : d.from).slice(0, 20),
    text: String(d.text == null ? '' : d.text).slice(0, ARCHIVE_TXT_MAX),
    at: nombre(d.at),
  };
}

// CE QUI SE LIT fait l'identité. Le séparateur est `\u0000` : aucun texte ne le contient,
// donc deux messages différents ne peuvent pas fabriquer la même clé par collision.
function cleMsg(m) {
  const n = msgNet(m);
  return n.at + '\u0000' + n.from + '\u0000' + n.text;
}

/* L'UNION, jamais la soustraction. Rend la liste fusionnée, combien de messages sont
   NEUFS (c'est le seul cas où il faut écrire) et si l'on a dû tronquer. */
function fusionMessages(anciens, nouveaux, max) {
  const plafond = nombre(max) || ARCHIVE_MSG_MAX;
  const vus = Object.create(null);
  const tout = [];
  const verser = function (liste, compteNeuf) {
    (Array.isArray(liste) ? liste : []).forEach(function (m) {
      const n = msgNet(m);
      // Un message sans auteur NI texte n'est pas un message : l'archiver ferait un
      // nombre qui ne correspond à rien de lisible.
      if (!n.from && !n.text) return;
      const k = cleMsg(n);
      if (vus[k]) return;
      vus[k] = 1;
      tout.push({m: n, neuf: compteNeuf});
    });
  };
  verser(anciens, false);
  verser(nouveaux, true);
  // L'ordre est celui de l'envoi. À instant égal, la clé départage — il faut un ordre
  // STABLE, sinon deux exécutions rendraient deux archives différentes pour les mêmes
  // messages, et l'on réécrirait sans fin.
  tout.sort(function (a, b) {
    if (a.m.at !== b.m.at) return a.m.at - b.m.at;
    const ka = cleMsg(a.m); const kb = cleMsg(b.m);
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  });
  const total = tout.length;
  const gardes = total > plafond ? tout.slice(total - plafond) : tout;
  let ajoutes = 0;
  gardes.forEach(function (x) { if (x.neuf) ajoutes++; });
  return {
    liste: gardes.map(function (x) { return x.m; }),
    ajoutes: ajoutes,
    total: total,
    tronque: total > plafond,
  };
}

/* SORTIR TÔT EST UNE EXIGENCE, PAS UNE OPTIMISATION. Ce déclencheur voit CHAQUE écriture
   sur `users/{uid}` — un jeton de notification, un jalon, une adresse. Relire l'archive à
   chaque fois coûterait une lecture par geste de chaque utilisateur du parc. On compare
   donc d'abord ce qui est déjà en main. */
function supportBouge(avant, apres) {
  const a = Array.isArray(avant && avant.support) ? avant.support : [];
  const b = Array.isArray(apres && apres.support) ? apres.support : [];
  if (!b.length) return false;              // plus rien à copier (compte effacé, conversation vidée)
  if (a.length !== b.length) return true;
  // Même longueur : on compare le CONTENU, pas le rang. Un message corrigé, ou deux
  // appareils qui réécrivent le tableau dans un autre ordre, doivent se voir.
  const cles = {};
  a.forEach(function (m) { cles[cleMsg(m)] = 1; });
  for (let i = 0; i < b.length; i++) { if (!cles[cleMsg(b[i])]) return true; }
  return false;
}

/* L'IDENTITÉ QUI ACCOMPAGNE LA PREUVE. Elle ne sert pas à retrouver un compte vivant (il
   a sa fiche) mais à nommer celui qui n'en a plus. On ne REMPLACE jamais une valeur
   connue par du vide : une fiche en cours d'effacement arrive souvent à moitié lue. */
function identiteArchive(apres, ancien) {
  const u = apres || {}; const v = ancien || {};
  const pick = function (a, b, n) {
    const x = String(a == null ? '' : a).slice(0, n);
    return x || String(b == null ? '' : b).slice(0, n);
  };
  return {
    nom: pick(u.name, v.nom, 80),
    email: pick(u.email, v.email, 200),
    role: pick(u.role, v.role, 20) || 'client',
  };
}

module.exports = {
  ARCHIVE_MSG_MAX, ARCHIVE_TXT_MAX,
  msgNet, cleMsg, fusionMessages, supportBouge, identiteArchive,
};
