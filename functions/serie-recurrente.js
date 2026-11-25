'use strict';
/* UNE COMMANDE RÉCURRENTE — module PUR : aucune base, aucun réseau, aucune horloge
   (le jour et le maintenant se reçoivent).

   Décisions de l'éditeur, 25/11/2026 :
   « Un bouton quand on passe une commande, comme pour un virement : ponctuel,
     récurrent ; si récurrent, une fréquence : quotidien, hebdomadaire, mensuel. »
   « Le pro accepte dès le début la récurrence, il doit honorer cette récurrence sauf
     s'il met explicitement qu'il ne peut pas passer cette fois ; le client peut cliquer
     sur proposer à quelqu'un d'autre pour ce passage. » — « Oui 48 h. »
   « Chaque jour c'est 7/7 » ; deux passages par semaine : on coche ses jours.
   « On n'applique pas de pénalité sur les engagements récurrents. »
   « Au moment du paiement il faut l'obliger à cliquer "enregistrer ma carte". »

   LA COMMANDE D'ORIGINE EST LE PREMIER PASSAGE, et elle porte la série : son rythme
   (`recurrence`) et son état (`serieEtat`). Les passages suivants sont des commandes
   ordinaires, créées par le serveur, déjà acceptées par le même prestataire, et qui
   suivent tout le cycle connu (rappels, démarrage, fin, validation, règlement). */

const RYTHMES = ['jour', 'semaine', 'mois'];
const SERIE_ETATS = ['active', 'pause', 'supprimee'];
const HORIZON_JOURS = 14;                    // les passages existent deux semaines à l'avance
const DECLIN_DELAI_MS = 48 * 60 * 60 * 1000; // « je ne peux pas cette fois » jusqu'à 48 h avant
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(iso) {
  if (!ISO_RE.test(String(iso || ''))) return false;
  const d = new Date(iso + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
function jourSemaine(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }     // 0 = dimanche
function ajouterJours(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dernierJourDuMois(iso) { const d = new Date(iso.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.getUTCDate(); }

/* CE QUE LE CLIENT A CHOISI, NETTOYÉ. Une récurrence qu'on ne sait pas lire n'en est
   pas une : la commande reste ponctuelle. */
function recurrencePropre(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const rythme = String(brut.rythme || '');
  const debut = String(brut.debut || '');
  if (RYTHMES.indexOf(rythme) < 0 || !dateValide(debut)) return null;
  if (rythme === 'semaine') {
    const jours = [...new Set((Array.isArray(brut.jours) ? brut.jours : []).map(Number)
      .filter((j) => Number.isInteger(j) && j >= 0 && j <= 6))].sort((a, b) => a - b);
    if (!jours.length) return null;
    return {rythme: 'semaine', jours: jours, debut: debut};
  }
  return {rythme: rythme, jours: [], debut: debut};
}

/* CE JOUR-LÀ FAIT-IL PARTIE DE LA SÉRIE ? « Chaque mois » garde le quantième du premier
   passage ; un 31 tombe le dernier jour d'un mois plus court, jamais le mois suivant. */
function correspond(rec, iso) {
  if (!rec || !dateValide(iso) || iso < rec.debut) return false;
  if (rec.rythme === 'jour') return true;
  if (rec.rythme === 'semaine') return rec.jours.indexOf(jourSemaine(iso)) >= 0;
  const q = Number(rec.debut.slice(8, 10));
  return Number(iso.slice(8, 10)) === Math.min(q, dernierJourDuMois(iso));
}

/* LES PASSAGES À CRÉER : ceux du rythme, après le premier, à partir de demain et
   jusqu'à l'horizon, qui n'existent pas encore. Rien quand la série n'est pas active
   (en pause ou supprimée) : les passages déjà créés, eux, ne sont pas touchés ici. */
function passagesACreer(e) {
  e = e || {};
  const rec = recurrencePropre(e.recurrence);
  if (!rec || e.etat !== 'active' || !dateValide(e.aujourdhui)) return [];
  const existe = new Set((e.existants || []).filter(dateValide));
  const n = Number(e.horizonJours) > 0 ? Math.min(60, Number(e.horizonJours)) : HORIZON_JOURS;
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = ajouterJours(e.aujourdhui, i);
    if (d > rec.debut && correspond(rec, d) && !existe.has(d)) out.push(d);
  }
  return out;
}

/* LE PRESTATAIRE PEUT-IL ENCORE DIRE « JE NE PEUX PAS CETTE FOIS » ? Jusqu'à 48 h avant
   le passage. Sans heure de début connue, on ne l'autorise pas : on ne devine pas. */
function declinPossible(debutMs, maintenant) {
  const d = Number(debutMs) || 0;
  return d > 0 && (Number(maintenant) || 0) <= d - DECLIN_DELAI_MS;
}

/* CE QU'UN PASSAGE REPREND DE LA COMMANDE D'ORIGINE — LISTE FERMÉE. Jamais un champ de
   paiement ni de règlement : un passage qui recopierait l'identifiant de l'empreinte
   du premier pourrait la capturer une seconde fois. Les champs du prestataire (son nom,
   son identité légale pour la facture, son téléphone) sont ceux qu'il a écrits en
   acceptant : il s'est engagé sur la série. */
const CHAMPS_COPIES = ['clientUid', 'clientName', 'clientPhoto', 'blockedUids', 'service', 'serviceName',
  'zone', 'slot', 'acceptedSlot', 'unit', 'duration', 'rate', 'boost', 'boostEur', 'total', 'totalConsenti',
  'people', 'kids', 'locationMode', 'notes', 'acts', 'options', 'forfaitTotal', 'dureePrevueMin', 'photos'];
const PREFIXE_PRESTATAIRE = 'provider';
const PRESTATAIRE_EXCLUS = ['providerUidAvant'];
function passageDepuis(parent, dateISO, parentId) {
  const p = parent || {};
  const out = {};
  CHAMPS_COPIES.forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
  Object.keys(p).forEach((k) => { if (k.indexOf(PREFIXE_PRESTATAIRE) === 0 && PRESTATAIRE_EXCLUS.indexOf(k) < 0) out[k] = p[k]; });
  Object.assign(out, {
    status: 'accepted', dateISO: dateISO, when: '', slotFlex: 0, frequency: 'ponctuelle',
    serieId: String(parentId || ''),
    // Adressé à SON prestataire : s'il le décline, le client choisit de l'ouvrir à tous.
    directed: true, preferredProviderUid: p.providerUid || null, preferredProviderName: p.providerName || '',
  });
  return out;
}
function idPassage(parentId, dateISO) { return String(parentId) + '-' + dateISO; }

module.exports = {
  RYTHMES, SERIE_ETATS, HORIZON_JOURS, DECLIN_DELAI_MS, CHAMPS_COPIES,
  recurrencePropre, correspond, passagesACreer, declinPossible, passageDepuis, idPassage,
  jourSemaine, ajouterJours,
};
