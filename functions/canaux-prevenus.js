'use strict';
/* PAR QUEL CANAL CHAQUE PRESTATAIRE A ÉTÉ PRÉVENU — module PUR : aucune base, aucun
   réseau, aucune horloge.

   « Il me manque juste de distinguer ceux qui ont reçu la notification de ceux qui ont
   eu le mail. On relance par WhatsApp surtout ceux qui reçoivent juste le mail »
   (l'éditeur, 22/11/2026). La demande ne gardait que des TOTAUX (« 3 par notification,
   4 par e-mail ») : impossible de savoir QUI n'a eu que l'e-mail.

   Le canal est celui qui a RÉELLEMENT livré, pas celui qu'on a tenté :
     'push'    — au moins une notification acceptée par un de ses appareils ;
     'mail'    — aucune notification livrée, l'e-mail est parti ;
     'plafond' — l'e-mail ne part pas : il a atteint son plafond du jour ;
     'aucun'   — rien ne l'a atteint (ni appareil qui accepte, ni adresse).
   Un appareil dont le jeton est périmé n'a rien reçu : son propriétaire n'est pas
   « notifié », quoi qu'en dise le nombre de jetons. */

const CANAUX = ['push', 'mail', 'plafond', 'aucun'];

function canauxPrevenus(uids, tokenToUid, jetonsLivres, mailes, plafonnes) {
  const livre = {};
  (jetonsLivres || []).forEach((t) => { const u = (tokenToUid || {})[t]; if (u) livre[u] = true; });
  const m = new Set(mailes || []);
  const p = new Set(plafonnes || []);
  const out = {};
  (uids || []).forEach((uid) => {
    if (typeof uid !== 'string' || !uid || uid.length > 128) return;
    out[uid] = livre[uid] ? 'push' : (m.has(uid) ? 'mail' : (p.has(uid) ? 'plafond' : 'aucun'));
  });
  return out;
}

/* Les jetons qu'un envoi groupé a livrés, dans l'ordre des réponses de FCM. */
function jetonsLivres(tokens, responses) {
  const out = [];
  (responses || []).forEach((r, i) => { if (r && r.success && tokens && tokens[i]) out.push(tokens[i]); });
  return out;
}

module.exports = { CANAUX, canauxPrevenus, jetonsLivres };
