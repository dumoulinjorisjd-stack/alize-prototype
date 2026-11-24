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

/* Ce qu'on peut router d'un paiement : ce qui a été DÉBITÉ, moins ce qui a été rendu.
   Une empreinte (`captureMode: manual`) autorise un plafond, puis la fin de prestation
   n'en capture souvent qu'une partie : `amount` reste l'autorisation, `amountCaptured`
   est le débit réel. Mollie refuse toute route qui dépasse le capturé — router
   `amount` faisait échouer la libération de chaque prestation plus courte que prévu.
   `p` est le paiement tel que Mollie le rend. */
function montantLiberable(p) {
  p = p || {};
  const cap = p.amountCaptured && p.amountCaptured.value != null ? Number(p.amountCaptured.value) : NaN;
  const debite = !isNaN(cap) ? cap : (Number(p.amount && p.amount.value) || 0);
  const rendu = Number(p.amountRefunded && p.amountRefunded.value) || 0;
  return Math.max(0, round2(debite - rendu));
}

/* L'ORGANISATION MOLLIE DE TI-SERVICES (C.C.S), et d'où on la tient.
   Relevé en production le 18/11/2026 : « Libérer » répondait « organisation inconnue ».
   `MOLLIE_ACCESS_TOKEN` est une clé de PROFIL (elle range chaque paiement sur le profil
   Ti-Services), et Mollie ne répond à `/organizations/me` qu'à un jeton d'organisation :
   l'appel échouait toujours, la libération était impossible et le garde-fou contre la
   liaison croisée dormait. L'identifiant d'une organisation n'est pas un secret : il se
   donne en configuration (MOLLIE_PLATFORM_ORG_ID). La réponse de Mollie, quand elle vient,
   l'emporte ; un identifiant mal formé ne vaut rien.
   ON NE LE DEVINE PAS : `org_19618413` (C.C.S, l'organisation que voit le connecteur
   Mollie) a été essayé le 18/11/2026 et Mollie a répondu qu'elle n'était pas partenaire
   du propriétaire du paiement — ce n'est PAS l'organisation qui encaisse Ti-Services, et
   la prendre pour elle aurait fait débrancher par le garde-fou tout compte relié à C.C.S.
   La bonne valeur, `org_19553481`, a été RELEVÉE le 18/11/2026 dans le tableau de bord
   Mollie de l'éditeur (organisation qui porte le profil Ti-services pfl_jw4dQ335VJ).
   MOLLIE_PLATFORM_ORG_ID la remplace sans toucher au code. */
const ORG_PLATEFORME = 'org_19553481';
const ORG_RE = /^org_\d{3,}$/;
function orgPlateforme(depuisMollie, configuree) {
  const a = String(depuisMollie || '').trim();
  if (ORG_RE.test(a)) return a;
  const b = String(configuree || '').trim();
  return ORG_RE.test(b) ? b : '';
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

/* LA JAMBE PRINCIPALE QUI N'A RIEN À VERSER (l'éditeur, 24/11/2026 : « pourquoi j'ai
   encore la dette, je l'ai réglé cette facture »). L'empreinte a expiré (ou a été annulée,
   ou refusée) sans débiter le client, et c'est le SECOND paiement qui a réglé toute la
   prestation : il n'y a pas d'argent sur cette jambe-ci, donc rien à partager ni à devoir.
   Mesuré en production : « Réessayer » tentait quand même le partage (Mollie : 404,
   Payment not found), écrivait `unrouted` au REGISTRE mais pas sur la demande — la liste
   disait « 0,00 € dû » pendant que le bandeau comptait 104,50 €. Une seule porte décide. */
const STATUTS_SANS_ARGENT = ['expired', 'canceled', 'failed'];
function jambeSansObjet(e) {
  e = e || {};
  const s = String(e.statutMollie || '').trim().toLowerCase();
  return STATUTS_SANS_ARGENT.indexOf(s) >= 0 && String(e.complementStatus || '') === 'paye';
}

module.exports = {STATUTS_SANS_ARGENT, jambeSansObjet, ISSUE_LIAISON, REGLE_MOLLIE, LIBERER_REFUS, refusDefinitif, jambeRetentable, routesDecider, libererDecider, montantLiberable, orgPlateforme, ORG_PLATEFORME, round2};
