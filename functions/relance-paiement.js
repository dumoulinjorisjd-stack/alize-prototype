'use strict';
/* QUAND RETENTER UN PAIEMENT, ET QUAND S'ARRÊTER — module PUR : aucune base, aucun
   réseau, aucune horloge.

   « Pour le paiement par carte il faut être sûr de ce que tu fais. Il ne faut pas que
   l'on soit bloqué par une série de paiements refusés » (l'éditeur, 23/11/2026). Relevé
   le même jour : chaque matin, le rapprochement reprélevait PAR LE MANDAT, sans le
   client, tout supplément « en échec » — y compris celui que la banque venait de
   refuser. Refusé, puis reprélevé le lendemain, sans fin. Et un lien de paiement neuf
   était créé chaque matin, même quand le précédent était encore ouvert.

   Trois règles :
   1. APRÈS UN REFUS DE LA BANQUE, PLUS AUCUN PRÉLÈVEMENT AUTOMATIQUE. Un seul lien de
      paiement (le client agit, 3-D Secure), puis on attend. On ne reprélève seul que
      si le client a enregistré une AUTRE carte depuis le refus.
   2. UN SEUL LIEN EN ATTENTE : tant qu'il est ouvert, on n'en crée pas d'autre.
   3. AU PLUS TROIS REFUS DE LA BANQUE PAR COMMANDE : au-delà, on ne propose plus de
      payer cette commande ; le client contacte sa banque ou repasse commande avec une
      autre carte. */

const REFUS_CARTE_MAX = 3;
const RELANCE_GESTES = ['rien', 'prelever', 'lien'];

/* `e` : { statut        — complementStatus ('impossible' | 'echec' | 'a_regler') ;
           lienOuvert    — vrai si le dernier paiement du supplément est encore « open » ;
           refusBanque   — vrai si la banque a refusé le dernier prélèvement ;
           mandatRefuse  — le mandat sur lequel ce refus a eu lieu ('' si aucun) ;
           mandatActuel  — le mandat VALIDE du client aujourd'hui ('' si aucun) ;
           lienApresRefus — vrai si le lien d'après-refus a déjà été créé }
   Rend { geste, motif }. */
function relanceDecider(e) {
  e = e || {};
  if (e.statut === 'a_regler' && e.lienOuvert === true) return { geste: 'rien', motif: 'lien-en-cours' };
  if (e.refusBanque === true) {
    const actuel = String(e.mandatActuel || '');
    if (actuel && actuel !== String(e.mandatRefuse || '')) return { geste: 'prelever', motif: 'nouvelle-carte' };
    if (e.lienApresRefus === true) return { geste: 'rien', motif: 'lien-deja-envoye' };
    return { geste: 'lien', motif: 'refus-banque' };
  }
  return { geste: 'prelever', motif: 'a-retenter' };
}

/* Encore une tentative de paiement pour cette commande ? Les refus se comptent par
   identifiant de paiement : le webhook et le rattrapage peuvent voir le même. */
function tentativeCarteAdmise(refusIds) {
  const n = Array.isArray(refusIds) ? new Set(refusIds.filter((x) => typeof x === 'string' && x)).size : 0;
  return n < REFUS_CARTE_MAX;
}

module.exports = { REFUS_CARTE_MAX, RELANCE_GESTES, relanceDecider, tentativeCarteAdmise };
