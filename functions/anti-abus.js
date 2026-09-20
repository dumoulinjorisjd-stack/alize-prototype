'use strict';
/* CE QUI A LE DROIT DE FAIRE PARTIR UNE ALERTE — module PUR, aucune base, aucun réseau.

   Le défaut, relevé le 20/09/2026 en répondant à « on peut sécuriser les envois de demande
   de mission par mail ? » : une demande publiée fait partir un e-mail à TOUS les
   prestataires sans appareil notifié, depuis contact@ti-services.fr. Rien ne plafonnait
   cela. Un compte client, ou une boucle, pouvait donc expédier des centaines de messages
   en notre nom : les prestataires se désabonnent, et la réputation du domaine ne se
   répare pas en un jour.

   DEUX VERROUS, ET ILS NE PROTÈGENT PAS DE LA MÊME CHOSE.

   1. LA GARANTIE (`diffusionAdmise`). En production, une vraie commande naît en
      « pending_payment » et ne s'ouvre aux prestataires qu'une fois la CARTE AUTORISÉE :
      la diffusion à la création ne devrait donc jamais voir de demande « pending », sauf
      celles de la conciergerie (qui n'ont pas de verrou de paiement) — ou celles qu'un
      compte aurait écrites lui-même en sautant l'étape, ce que les règles Firestore
      permettaient. On exige donc une garantie : conciergerie, ou paiement autorisé.
      Hors production (bêta, banc d'essai), aucune carte n'est demandée : la règle ne
      s'applique pas, sinon plus rien ne partirait en bêta.

   2. LE PLAFOND (`quotaDecide`). Il ne juge pas la demande, il borne le VOLUME — par
      client et par jour pour la diffusion, par prestataire et par jour pour l'e-mail.
      Il attrape ce que la garantie laisse passer : le double appui, la boucle, et le
      compte qui rouvre cent fois la même demande (déclinée → publiée), chemin qui ne
      redemande aucun paiement.

   UN COMPTEUR CASSÉ NE DOIT PAS BLOQUER LE SERVICE : en cas de doute, on laisse passer
   et on le dit — c'est l'appelant qui tranche, et il a la trace.
*/

/* Plafonds JOURNALIERS. Ils sont hauts pour ne gêner personne de réel : un client qui
   publie douze demandes dans la journée est déjà un cas rare, un prestataire qui reçoit
   vingt-cinq e-mails de mission en un jour aussi. Ils ne servent qu'à empêcher l'ordre
   de grandeur suivant, celui qui abîme le domaine. */
const DIFFUSIONS_JOUR_CLIENT = 12;
const MAILS_JOUR_PRESTATAIRE = 25;

/* Une demande NÉE déjà ouverte se diffuse-t-elle ? `estProd` est fourni par l'appelant
   (il connaît son projet), jamais deviné ici. */
function diffusionAdmise(r, opts) {
  const d = r || {};
  const o = opts || {};
  if (o.estProd === false) return { ok: true, motif: 'hors-production' };
  if (d.conciergeUid) return { ok: true, motif: 'conciergerie' };
  if (d.molliePaymentAuthorized === true) return { ok: true, motif: 'paiement-autorise' };
  return { ok: false, motif: 'sans-garantie' };
}

/* Le compteur du jour vaut `n` AVANT ce passage. Rendre le nombre atteint permet à
   l'appelant de dire « 12 sur 12 » plutôt que « refusé », et de n'alerter qu'UNE fois,
   au franchissement. */
function quotaDecide(n, plafond) {
  const v = Number(n) || 0;
  const p = Number(plafond) || 0;
  if (v >= p) return { ok: false, n: v, plafond: p, franchit: false };
  return { ok: true, n: v + 1, plafond: p, franchit: (v + 1) === p };
}

module.exports = { DIFFUSIONS_JOUR_CLIENT, MAILS_JOUR_PRESTATAIRE, diffusionAdmise, quotaDecide };
