'use strict';
/* CE QUE MOLLIE A RÉELLEMENT ENCAISSÉ POUR UNE PRESTATION — module PUR : aucune base,
   aucun réseau, aucune horloge. Les paiements se reçoivent tels que Mollie les rend.

   Relevé le 20/11/2026 : une massothérapeute payée 104,50 € net, un versement fait à la
   main… et sa mission absente de « Factures par artisan », de la commission cumulée et
   du chiffre d'affaires. Son empreinte bancaire avait EXPIRÉ avant la fin : le serveur a
   alors prélevé TOUTE la prestation par un second paiement (le mandat), et ce second
   paiement est bien « paid ». Mais l'entrée en comptabilité ne regardait que le PREMIER
   paiement — l'empreinte expirée — et la mission restait « jamais encaissée ».

   Une prestation est encaissée dès qu'au moins un de ses paiements l'est, et la somme
   encaissée est celle de ses paiements payés, chacun à ce qu'il a VRAIMENT débité : une
   empreinte capturée en partie compte son capturé, une empreinte expirée compte zéro. */

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function val(o) { const v = o && o.value != null ? Number(o.value) : NaN; return isNaN(v) ? null : v; }

/* Ce qu'un paiement a débité, et ce que Mollie en reverse après ses frais. Un paiement
   qui n'est pas « paid » n'a débité personne, quoi que dise son montant autorisé. */
function jambe(p) {
  if (!p || String(p.status || '') !== 'paid') return { paye: false, montant: 0, reglement: null };
  const cap = val(p.amountCaptured);
  const montant = cap != null ? cap : (val(p.amount) || 0);
  return { paye: true, montant: round2(montant), reglement: val(p.settlementAmount) };
}

/* `principal` : le premier paiement (l'empreinte, ou le paiement direct). `second` : le
   paiement par le mandat, quand il existe. Rend :
     encaisse    — vrai si Mollie a encaissé au moins l'un des deux ;
     par         — 'principal' | 'second' | 'les-deux' | '' ;
     montantPaye — la somme réellement débitée ;
     frais       — les frais Mollie, seulement quand TOUS les paiements payés ont leur
                   règlement connu (sinon `null` : on attend, on ne devine pas) ;
     reglement   — la somme reversée par Mollie, aux mêmes conditions. */
function encaissement(principal, second) {
  const a = jambe(principal), b = jambe(second);
  const payes = [a, b].filter((j) => j.paye);
  const par = a.paye && b.paye ? 'les-deux' : a.paye ? 'principal' : b.paye ? 'second' : '';
  const montantPaye = round2(payes.reduce((t, j) => t + j.montant, 0));
  const reglementConnu = payes.length > 0 && payes.every((j) => j.reglement != null);
  const reglement = reglementConnu ? round2(payes.reduce((t, j) => t + j.reglement, 0)) : null;
  return {
    encaisse: payes.length > 0,
    par: par,
    montantPaye: montantPaye,
    reglement: reglement,
    frais: (reglement != null && montantPaye > 0) ? round2(montantPaye - reglement) : null,
  };
}

module.exports = { encaissement, round2 };
