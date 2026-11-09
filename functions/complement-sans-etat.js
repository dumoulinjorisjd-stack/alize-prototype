'use strict';
/* ══ UN SECOND PAIEMENT PAYÉ CHEZ MOLLIE, SANS ÉTAT DE VERSEMENT CHEZ NOUS ═══════════
 * Quand l'empreinte posée à la commande a expiré, la prestation ENTIÈRE est prélevée sur
 * la carte enregistrée par un second paiement (« complément », motif hors-session). Son
 * état de versement (`complementPayout`) est écrit par le webhook au moment du « paid ».
 * Relevé en production le 09/11/2026 : une prestation de 110 € payée le 24/10, routée
 * 0 € chez Mollie, et AUCUN état chez nous — ni « unrouted », ni rien. La console ne la
 * listait pas (elle cherche `complementPayout == 'unrouted'`), le rattrapage des 15
 * minutes non plus (même clé) : le jour où le prestataire aurait ouvert ses virements,
 * ces 110 € ne seraient jamais partis. Le ratissage qui retrouve les paiements « jamais
 * tentés » avait été écrit pour l'empreinte seule.
 *
 * Ce noyau décide ce qu'on a le droit d'ÉCRIRE à partir de ce que Mollie dit. Il ne lit
 * ni l'heure, ni le réseau : le statut du paiement et le nombre de routes se REÇOIVENT.
 *
 * TROIS REFUS, parce que ce qu'on écrit finit par faire partir de l'argent :
 *  • un état DÉJÀ connu ne se réécrit pas (le chemin ordinaire s'en occupe) ;
 *  • SILENCE N'EST PAS RÉPONSE : Mollie injoignable, ou routes illisibles, n'écrivent
 *    rien — déclarer « dû » un paiement qu'on n'a pas relu ferait verser à l'aveugle ;
 *  • un paiement qui n'est PAS « paid » n'est pas dû — rien n'a été prélevé.
 * Et une route déjà posée chez Mollie dit « déjà versé » : c'est notre fiche qui était
 * en retard, on la corrige, on ne route pas en double. */

const SANS_ETAT_STATUTS = ['paye', 'en_cours', 'a_regler'];

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** e : { complementPayout, complementPaymentId, statutMollie, routes, complementNet, montant, commission } */
function complementSansEtatDecider(e) {
  e = e || {};
  const etat = e.complementPayout;
  if (etat === 'routed' || etat === 'manuel' || etat === 'unrouted') return {ecrire: false, raison: 'etat-connu'};
  if (!e.complementPaymentId) return {ecrire: false, raison: 'sans-paiement'};
  if (e.statutMollie == null || e.statutMollie === '') return {ecrire: false, raison: 'mollie-muet'};
  if (e.statutMollie !== 'paid') return {ecrire: false, raison: 'non-paye'};
  if (e.routes == null || !(Number(e.routes) >= 0)) return {ecrire: false, raison: 'routes-inconnues'};
  if (Number(e.routes) > 0) return {ecrire: true, etat: 'routed', raison: 'deja-route'};
  const montant = round2(e.montant);
  const net = (e.complementNet != null) ? round2(e.complementNet)
    : round2(Math.max(0, montant - round2(e.commission)));
  if (!(net > 0.009)) return {ecrire: false, raison: 'net-nul'};
  return {ecrire: true, etat: 'unrouted', net: net, raison: 'du'};
}

module.exports = {SANS_ETAT_STATUTS, complementSansEtatDecider, round2};
