/* LE VERSEMENT QUE MOLLIE NE FERA JAMAIS, ET CE QU'ON EN FAIT.
   ─────────────────────────────────────────────────────────────
   Relevé en production le 09/11/2026 : une prestataire relie son compte Mollie APRÈS sa
   première mission. Le second paiement (110 €) est bien « paid », aucune route n'existe,
   et la relance renvoie HTTP 422 : « Routed organization had no marketplace partnership
   with payment owner when the payment was paid ». Ce n'est pas une panne de notre côté :
   la documentation de Mollie (« Delayed routing ») l'écrit mot pour mot — « The
   destination organization must be connected to your platform at payment creation to be
   eligible to receive routes. » Un paiement encaissé avant la liaison ne lui sera JAMAIS
   routé, quel que soit le nombre de tentatives.

   Trois conséquences, décidées ici et nulle part ailleurs :
     1. ce refus est DÉFINITIF : on cesse de le retenter toutes les quinze minutes, et on
        le dit avec les mots de Mollie, pas avec « incident technique » ;
     2. l'argent, lui, est bloqué dans le solde d'attente de la place de marché tant
        qu'aucune route ne le dirige quelque part : on le LIBÈRE en routant le paiement
        ENTIER vers notre propre organisation (Mollie le prévoit : « use your own
        organization ID as the destination »), puis on vire sa part à la prestataire ;
     3. une route vers NOUS n'est pas un versement À ELLE : compter « une route = versé »
        aurait marqué sa part comme partie alors qu'elle est chez nous.

   Module PUR : aucune base, aucune horloge, aucun appel. Les faits se reçoivent. */

const ISSUE_LIAISON = 'liaison_posterieure';
const REGLE_MOLLIE = 'Mollie n’autorise le versement direct que pour les paiements reçus après la liaison du compte du prestataire.';

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* Le motif EXACT de Mollie, et lui seul. On ne reconnaît pas un refus définitif à un
   mot approchant : « no marketplace partnership » ET « when the payment was paid » — la
   seconde moitié dit que c'est le MOMENT du paiement qui tranche, donc qu'aucune
   nouvelle tentative ne changera rien. Un autre 422 reste retentable. */
function refusDefinitif(motif) {
  const m = String(motif || '');
  return /no marketplace partnership/i.test(m) && /when the payment was paid/i.test(m);
}

/* Une jambe (empreinte, second paiement, arrhes) se retente-t-elle ? Non si elle porte
   déjà la cause définitive, ou si son dernier motif est le refus définitif — un ancien
   refus, écrit avant que la cause existe, est reconnu à son texte. */
function jambeRetentable(e) {
  e = e || {};
  if (e.issue === ISSUE_LIAISON) return false;
  if (refusDefinitif(e.motif)) return false;
  return true;
}

/* Ce que les routes d'un paiement disent. `routes` est la liste rendue par Mollie
   (chaque route porte destination.organizationId). Une route vers le prestataire = sa
   part est partie. Une route vers la PLATEFORME = le paiement a été libéré sur notre
   solde, rien n'est parti chez lui. Toute autre destination est comptée à part et dite. */
function routesDecider(routes, orgPresta, orgPlateforme) {
  const out = {versees: 0, liberees: 0, autres: 0, total: 0, montantLibere: 0};
  if (!Array.isArray(routes)) return null;              // illisible : on ne décide rien
  routes.forEach((r) => {
    const dest = String((r && r.destination && (r.destination.organizationId || r.destination.id)) || '');
    const montant = round2(r && r.amount && r.amount.value);
    out.total++;
    if (orgPresta && dest === String(orgPresta)) out.versees++;
    else if (orgPlateforme && dest === String(orgPlateforme)) { out.liberees++; out.montantLibere = round2(out.montantLibere + montant); }
    else out.autres++;
  });
  return out;
}

/* Peut-on libérer ce paiement sur le solde Ti-Services ? Chaque refus est NOMMÉ : c'est
   ce que la console affichera, et chacun appelle un geste différent. */
const LIBERER_REFUS = ['plateforme-inconnue', 'non-paye', 'routes-inconnues', 'deja-verse', 'deja-libere', 'montant-nul', 'refus-non-definitif'];
function libererDecider(e) {
  e = e || {};
  if (!e.orgPlateforme) return {ok: false, raison: 'plateforme-inconnue'};
  if (e.statutMollie !== 'paid') return {ok: false, raison: 'non-paye'};
  const rd = routesDecider(e.routes, e.orgPresta, e.orgPlateforme);
  if (!rd) return {ok: false, raison: 'routes-inconnues'};
  if (rd.versees > 0) return {ok: false, raison: 'deja-verse'};
  if (rd.liberees > 0) return {ok: false, raison: 'deja-libere', montant: rd.montantLibere};
  const montant = round2(e.montant);
  if (!(montant > 0.009)) return {ok: false, raison: 'montant-nul'};
  // Libérer n'a de sens que lorsque Mollie ne versera JAMAIS : sur un refus passager,
  // la bonne réponse est de retenter, pas de rapatrier l'argent chez nous.
  if (!(e.issue === ISSUE_LIAISON || refusDefinitif(e.motif))) return {ok: false, raison: 'refus-non-definitif'};
  return {ok: true, montant: montant};
}

module.exports = {ISSUE_LIAISON, REGLE_MOLLIE, LIBERER_REFUS, refusDefinitif, jambeRetentable, routesDecider, libererDecider, round2};
