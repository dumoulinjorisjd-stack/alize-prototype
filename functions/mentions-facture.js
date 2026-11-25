/* MENTIONS DE LA FACTURE — noyau pur (l'éditeur, 25/11/2026 : « Oui corrige les factures »).
 *
 * Vérifié sur la fiche Service Public Entreprendre « Mentions obligatoires sur une
 * facture » (F31808, vérifiée le 11 août 2026) :
 *  - entrepreneur individuel : « nom et prénom précédés ou suivis de la mention
 *    Entrepreneur individuel ou EI » (Code de commerce, art. R526-27) ;
 *  - « date de la vente ou de la prestation de services : jour effectif de la fin
 *    d'exécution de la prestation » ;
 *  - numéro unique, « basé sur une séquence chronologique et continue ».
 * Une seule porte pour le PDF (serveur) et pour les factures à l'écran (miroir dans
 * index.html, comparé par tests/harn/test-mentions-facture.js).
 * Pur : ni réseau, ni Date.now — l'instant se reçoit en millisecondes. */

// Saint-Barthélemy : UTC−4 toute l'année (pas d'heure d'été).
const DECALAGE_SBH_MS = 4 * 3600000;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* Le jour, à Saint-Barthélemy, d'un instant (ms) → 'AAAA-MM-JJ'. */
function jourSbhISO(ms) {
  const n = Number(ms);
  if (!(n > 0)) return '';
  return new Date(n - DECALAGE_SBH_MS).toISOString().slice(0, 10);
}

/* 'AAAA-MM-JJ' → '25 novembre 2026'. */
function dateFrLongue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return (+m[3]) + ' ' + MOIS[(+m[2]) - 1] + ' ' + m[1];
}

/* Date de la prestation = jour de FIN d'exécution (fin pointée par le prestataire) ;
   à défaut, le jour prévu de la prestation. */
function datePrestationISO(r) {
  r = r || {};
  return jourSbhISO(r.doneProAtMs) || (/^\d{4}-\d{2}-\d{2}$/.test(String(r.dateISO || '')) ? r.dateISO : '');
}

const FORMES_EI = /^(ei|e\.i\.?|eirl|entreprise individuelle|entrepreneur individuel)$/i;
const DEJA_EI = /(^|[\s,(])(EI|E\.I\.?|entrepreneur individuel)($|[\s,)])/i;

/* Micro-entrepreneur, ou forme juridique déclarée « EI » : un entrepreneur individuel. */
function estEntrepreneurIndividuel(p) {
  p = p || {};
  return p.statusType === 'micro' || FORMES_EI.test(String(p.legalForm || '').trim());
}

/* Le nom tel qu'il figure sur la facture : suivi de « EI » pour un entrepreneur
   individuel, sauf s'il le porte déjà. */
function nomPrestataire(p) {
  p = p || {};
  const nom = String(p.legal || '').trim();
  if (!nom) return '';
  return (estEntrepreneurIndividuel(p) && !DEJA_EI.test(nom)) ? (nom + ' EI') : nom;
}

/* Une adresse qui situe : un code postal, ou le nom de l'île. « Jean bart » seul ne
   dit ni la commune ni le code. On ne complète JAMAIS à la place du prestataire. */
function adresseComplete(a) {
  const s = String(a || '').trim();
  if (s.length < 4) return false;
  return /\b\d{5}\b/.test(s) || /\b(saint|st)[\s-]*barth/i.test(s);
}

/* Lignes sous le nom du prestataire : forme, adresse, SIRET, RCS (société). `eur` : le
   format monétaire de l'appelant (le serveur passe eurTxt, inchangé). */
function lignesPrestataire(p, eur) {
  p = p || {};
  eur = eur || ((n) => n.toFixed(2).replace('.', ',') + ' €');
  const siret = String(p.siret || '').replace(/\s/g, '');
  const siren = siret.slice(0, 9);
  const st = p.statusType || '';
  let forme = '';
  if (st === 'micro') forme = 'Micro-entreprise';
  else if (st !== 'particulier') {
    const cap = Number(String(p.capital || '').replace(/[^\d.]/g, ''));
    forme = [String(p.legalForm || ''), (cap > 0 ? 'au capital de ' + eur(cap) : '')].filter(Boolean).join(' ');
  }
  const rcs = (st !== 'particulier' && st !== 'micro' && p.rcsCity && siren) ? ('RCS ' + p.rcsCity + ' ' + siren) : '';
  return [forme, String(p.address || '').trim() || 'Saint-Barthélemy', siret ? ('SIRET ' + siret) : '', rcs].filter(Boolean);
}

module.exports = { DECALAGE_SBH_MS, jourSbhISO, dateFrLongue, datePrestationISO, estEntrepreneurIndividuel, nomPrestataire, adresseComplete, lignesPrestataire };
