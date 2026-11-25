'use strict';
/* RELANCER LE PRESTATAIRE QUI A OUBLIÉ DE POINTER — module PUR : aucune base, aucun
   réseau, aucune horloge (le maintenant se reçoit).

   « Les utilisateurs ont tendance à oublier de valider les étapes », puis « on relance
   1 h après le manque de pointage » (l'éditeur, 25/11/2026). Mesuré le même jour : une
   mission prévue à 08:00, prestataire sur place, jamais « démarrée » à 11:00. Sans
   « Démarrer », pas de « Terminer » ; sans « Terminer », le client ne valide pas et le
   prestataire n'est pas payé.

   DEUX RELANCES, UNE FOIS CHACUNE :
     'demarrage' — acceptée, 1 h après l'heure prévue, toujours pas démarrée ;
     'fin'       — démarrée, 1 h après la fin prévue, toujours pas terminée.
   AU-DELÀ DE 12 H on ne relance plus : une mission aussi ancienne ne se rattrape pas
   par une notification, elle se voit dans la console.
   ON NE DEVINE PAS : sans heure prévue, ou sans durée connue, pas de relance. */

const RELANCE_POINTAGE_MS = 60 * 60 * 1000;
const RELANCE_FENETRE_MS = 12 * 60 * 60 * 1000;
const HEURE_RE = /^\d{1,2}:\d{2}$/;

/* L'heure prévue, à Saint-Barthélemy (UTC−4, sans heure d'été). */
function debutPrevuMs(r) {
  r = r || {};
  const d = String(r.dateISO || '');
  const h = HEURE_RE.test(String(r.acceptedSlot || '')) ? String(r.acceptedSlot) : (HEURE_RE.test(String(r.slot || '')) ? String(r.slot) : '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !h || r.unit === 'j') return 0;
  const t = Date.parse(d + 'T' + (h.length < 5 ? '0' : '') + h + ':00-04:00');
  return isFinite(t) ? t : 0;
}

/* La durée prévue, en minutes : celle que l'écran de commande a calculée
   (`dureePrevueMin`), sinon les heures d'une prestation à l'heure. */
function dureePrevueMin(r) {
  r = r || {};
  const m = Math.round(Number(r.dureePrevueMin));
  if (isFinite(m) && m > 0 && m <= 24 * 60) return m;
  const h = Number(r.duration);
  if (r.unit === 'h' && isFinite(h) && h > 0 && h <= 24) return Math.round(h * 60);
  return 0;
}

/* `e` : la demande, avec `workingAtMs` (l'heure du démarrage, en ms) déjà lue.
   Rend 'demarrage', 'fin' ou ''. */
function relancePointageDecider(e, maintenant) {
  e = e || {};
  const now = Number(maintenant) || 0;
  const dans = (t) => t > 0 && now >= t + RELANCE_POINTAGE_MS && now < t + RELANCE_FENETRE_MS;
  if (e.status === 'accepted' && !e.relanceDemarrageAt) {
    return dans(debutPrevuMs(e)) ? 'demarrage' : '';
  }
  if (e.status === 'working' && !e.relanceFinAt) {
    const base = Number(e.workingAtMs) || debutPrevuMs(e);
    const dur = dureePrevueMin(e);
    return (base > 0 && dur > 0 && dans(base + dur * 60000)) ? 'fin' : '';
  }
  return '';
}

module.exports = { RELANCE_POINTAGE_MS, RELANCE_FENETRE_MS, debutPrevuMs, dureePrevueMin, relancePointageDecider };
