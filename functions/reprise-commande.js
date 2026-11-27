'use strict';
/* REPRENDRE UNE COMMANDE EXPIRÉE À TORT — module PUR : aucune base, aucun réseau, aucune
   horloge (le moment présent se reçoit).

   « Cette commande est partie en expiré parce que la femme de ménage n'a jamais cliqué
   sur démarré et terminé, mais elle l'a bien faite. » — l'éditeur, le 27/11/2026.

   LA FAUTE ÉTAIT DANS L'APP DU CLIENT (corrigée en v950) : sa purge locale passait en
   « expirée » une commande ACCEPTÉE douze heures après le créneau, sans écrire qui
   l'expirait. Le serveur, lui, écrit `expiredBy: 'auto'` ; la console `expiredBy: 'admin'`.
   Une expirée SANS auteur et AVEC un prestataire est donc exactement la trace du défaut.

   LA REPRISE REMET LA COMMANDE DANS LE CIRCUIT CLASSIQUE, au point « terminée par le
   prestataire », pour que tout suive comme d'habitude : la cliente est prévenue et
   valide (ou conteste), la validation automatique attend 48 h À COMPTER DE LA REPRISE
   (jamais de prélèvement surprise), le règlement constate l'empreinte libérée et réclame
   la somme par un second paiement (mandat, sinon lien « Régler maintenant »), puis
   facture, registre et versement au prestataire — manuel s'il n'a pas de compte Mollie.
   La date de fin écrite est celle du RENDEZ-VOUS : c'est elle que la facture imprime. */
const DEPASSE = require('./creneau-depasse');

/* L'empreinte de l'appli du client : expirée, sans auteur, avec un preneur, rien capturé. */
function expireeATort(r) {
  const d = r || {};
  return String(d.status || '') === 'expired' && !d.expiredBy
    && !!String(d.providerUid || '').trim() && d.mollieCaptured !== true;
}

/* La durée de la prestation, en heures, bornée : une valeur abîmée ne doit pas pousser
   la fin d'un ménage au lendemain. */
function dureeMs(d) {
  if (String(d.unit || 'h') !== 'h') return 0;
  const h = Number(d.finalHours != null ? d.finalHours : d.duration);
  return (isFinite(h) && h > 0) ? Math.min(12, h) * 3600000 : 0;
}

/* Peut-on reprendre, et avec quelle fin de prestation ? `{ok:false, motif}` ou
   `{ok:true, finMs}`. On ne devine pas une date qu'on ne sait pas lire. */
function repriseDecider(r, maintenant) {
  const d = r || {};
  if (String(d.status || '') !== 'expired') return {ok: false, motif: 'Cette commande n’est pas expirée.'};
  if (d.expiredBy) return {ok: false, motif: 'Expirée par ' + (d.expiredBy === 'admin' ? 'la console' : 'le serveur, faute de preneur') + ' : rien à reprendre.'};
  if (!String(d.providerUid || '').trim()) return {ok: false, motif: 'Aucun prestataire n’avait accepté cette commande.'};
  if (d.mollieCaptured === true) return {ok: false, motif: 'Un paiement a déjà été encaissé sur cette commande.'};
  const fin = DEPASSE.finDuCreneau(d);
  if (fin == null) return {ok: false, motif: 'Date du rendez-vous illisible : rien n’est écrit.'};
  const finMs = fin + dureeMs(d);
  if (!(Number(maintenant) > finMs)) return {ok: false, motif: 'Le rendez-vous n’est pas encore passé.'};
  return {ok: true, finMs: finMs};
}

/* LE DÉLAI DE VALIDATION AUTOMATIQUE COURT D'ICI. Une commande reprise porte une fin de
   prestation ancienne (le jour du ménage, pour la facture) : compter les 48 h depuis
   elle validerait sur-le-champ, sans laisser à la cliente le temps de répondre. */
function debutValidationMs(r, msDe) {
  const d = r || {};
  return msDe(d.validationDepuis) || msDe(d.doneProAt);
}

module.exports = {expireeATort, repriseDecider, debutValidationMs};
