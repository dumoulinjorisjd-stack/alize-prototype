/* « JE RETROUVE SON NOM, LE PRESTATAIRE S'APPELAIT SUNNYREGARDS, MAIS IL APPARAÎT
   ABSOLUMENT NULLE PART. » — l'éditeur, le 12/10/2026.

   LE JOURNAL DES DÉPARTS S'EFFACE TOUT SEUL AU BOUT DE QUATRE-VINGT-DIX JOURS. La tâche
   de nuit supprime chaque ligne échue, et la raison écrite à côté est bonne : « garder
   au-delà reviendrait à conserver indéfiniment les coordonnées de gens qui ont demandé
   leur effacement ». Mais elle confond DEUX choses qui n'ont ni la même valeur ni les
   mêmes obligations : la COORDONNÉE (une adresse e-mail, par quoi on recontacte) et le
   FAIT (quelqu'un a été référencé ici, de telle date à telle date, et il est parti de
   lui-même). Effacer la coordonnée est juste ; effacer le fait rend impossible de
   répondre à « cette personne a-t-elle existé », qui est précisément la question qu'on
   vient poser des mois après.

   ET L'APPLICATION SE CONTREDISAIT DÉJÀ : l'archive des conversations, elle, N'EXPIRE
   PAS — c'est écrit, et une épreuve le tient. On gardait donc ce qu'une personne avait
   DIT en oubliant qu'elle avait EXISTÉ. Ce n'est pas un équilibre, c'est un oubli.

   ON RÉDUIT DONC, ON NE SUPPRIME PLUS. À l'échéance, la ligne perd son adresse et garde
   son fait. Le NOM suit la qualité : un prestataire a été RÉFÉRENCÉ publiquement sous ce
   nom, des clients l'ont vu, c'est le registre d'une activité professionnelle et c'est
   exactement ce que l'éditeur demande à garder ; un client qui s'efface n'a été référencé
   nulle part, son nom part avec son adresse.

   ET LA LIGNE RÉDUITE N'A PLUS D'ÉCHÉANCE DU TOUT — champ ABSENT, pas mis à zéro : la
   tâche de nuit sélectionne sur `expireLe <= maintenant`, et un document qui ne porte pas
   le champ n'est jamais rendu par ce filtre. À zéro, la même ligne reviendrait chaque
   nuit, pour toujours, et la purge n'avancerait jamais.

   Module PUR : aucune base, aucune horloge, le jour se REÇOIT. */

function txt(v, n) { return String(v == null ? '' : v).slice(0, n); }
function nombre(v) { const x = Number(v); return (isFinite(x) && x > 0) ? x : 0; }

/* Un départ est-il celui d'un PROFESSIONNEL ? Le rôle le dit, mais pas toujours : un
   compte qui a monté sa candidature sans l'envoyer porte `avaitCandidature`. On retient
   les deux — se tromper ici dans un sens efface le registre, dans l'autre il garde un nom
   de particulier, et c'est le premier qu'on ne peut pas rattraper. */
function departPro(l) {
  const d = l || {};
  return txt(d.role, 20) === 'artisan' || txt(d.role, 20) === 'concierge' || !!d.avaitCandidature;
}

/* La ligne réduite. `reduitLe` se REÇOIT : le jour n'est pas lu par le noyau. */
function reduireDepart(ligne, reduitLe) {
  const d = ligne || {};
  const pro = departPro(d);
  const out = {
    uid: txt(d.uid, 128),
    role: txt(d.role, 20),
    // LE NOM EST LE REGISTRE D'UNE ACTIVITÉ, pas une coordonnée : on ne recontacte
    // personne avec un nom commercial. Il reste pour un professionnel, il part pour un
    // particulier.
    nom: pro ? txt(d.nom, 80) : '',
    // LA COORDONNÉE PART. C'est elle, et elle seule, qu'un effacement vise.
    email: '',
    statut: txt(d.statut, 20),
    avaitCandidature: !!d.avaitCandidature,
    metiers: Array.isArray(d.metiers) ? d.metiers.slice(0, 12).map(function (m) { return txt(m, 40); }) : [],
    inscritLe: nombre(d.inscritLe),
    supprimeLe: nombre(d.supprimeLe),
    origine: txt(d.origine, 24),
    // Combien de messages l'archive garde pour ce compte : sans ce report, une ligne
    // réduite n'indiquerait plus qu'il existe une conversation à ressortir.
    supportArchive: nombre(d.supportArchive),
    reduitLe: nombre(reduitLe),
  };
  // `expireLe` est VOLONTAIREMENT ABSENT : voir l'en-tête. Sa présence ferait revenir la
  // ligne à chaque passage de la purge.
  return out;
}

// Une ligne déjà réduite ne se réduit pas deux fois (elle n'a plus d'échéance, donc la
// requête ne la rend plus — mais la garde reste, au cas où la requête changerait).
function dejaReduite(l) { return !!(l && nombre(l.reduitLe)); }

module.exports = {departPro, reduireDepart, dejaReduite};
