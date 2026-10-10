'use strict';
/* UN CRÉNEAU PASSÉ SANS PRENEUR — module PUR : aucune base, aucun réseau, aucune horloge.

   « Quand la prestation souhaitée est dépassée dans le temps voulu, il faut que le client
   reçoive une notification qui lui propose de mettre une nouvelle date ou de l'annuler. »
   — l'éditeur, le 16/10/2026.

   AUJOURD'HUI ELLE SE FERME TOUTE SEULE, À QUATRE HEURES DU MATIN, SANS UN MOT.
   `expirerDemandesNonHonorees` passe la demande en « expirée » douze heures après le
   créneau ; le client n'a aucun écran pour cela, aucun choix, et il ne l'apprend que par
   la notification d'expiration — c'est-à-dire une fois qu'il n'y a plus rien à décider.
   On intercale donc une RELANCE : le créneau est passé, on le DIT, et l'on offre les deux
   seuls gestes qui existent, une autre date ou l'annulation.

   LA RELANCE SE SOUVIENT DU RENDEZ-VOUS, PAS DE L'HEURE OÙ ELLE EST PARTIE. Un simple
   drapeau « déjà relancé » aurait dû être EFFACÉ à chaque nouvelle date, par le navigateur
   du client, sur un champ que le serveur écrit — alors que la clé du créneau s'invalide
   d'elle-même : une demande déplacée à demain n'a plus été relancée « pour demain », et la
   relance repart sans que personne n'ait rien à nettoyer. L'horodatage reste nécessaire,
   mais pour une autre raison : voir plus bas.

   ON N'EXPIRE PLUS CE QU'ON N'A PAS DEMANDÉ, ET JAMAIS MOINS DE DOUZE HEURES APRÈS L'AVOIR
   DEMANDÉ. Les deux conditions comptent. Sans la première, le choix qu'on vient d'offrir
   serait retiré avant d'avoir été lu. Sans la seconde, une demande dont le créneau est
   passé depuis vingt heures — tâche arrêtée une nuit, mise en ligne, incident — serait
   relancée puis fermée à l'heure suivante : le client recevrait une notification lui
   proposant de choisir, et la demande mourrait pendant qu'il choisit. Dans le cas
   ordinaire, la relance partant dans l'heure qui suit le créneau, cela ne décale la
   fermeture que d'une heure au plus.

   LA FIN DU CRÉNEAU EST ÉCRITE ICI, UNE FOIS, POUR LES DEUX TÂCHES. L'expiration la
   calculait chez elle ; la relance doit tomber sur exactement la même seconde, sinon l'une
   fermerait ce que l'autre n'a pas encore annoncé.

   ET UN COLIS N'A PAS D'HEURE. Il se retire dans une FENÊTRE de dates (`dateFrom`,
   `dateTo`), et `renderColisConfig` ne remplit pas `dateISO` : toute commande « Colis &
   courrier » part donc avec une date illisible, et l'expiration les sautait TOUTES — elles
   restaient « en recherche » pour toujours, l'empreinte bancaire du client avec elles. Ce
   qui fait foi est la fin de la fenêtre. Sans date d'aucune sorte, on ne devine toujours
   rien : on ne sait pas si le rendez-vous est passé, et le dire serait fermer une demande
   vivante. */

// Douze heures : le délai qui existait, après le créneau. Il sert aussi, désormais, de
// fenêtre de réponse après la relance.
const PURGE_APRES_MS = 12 * 3600000;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* Une date Firestore, un nombre, ou rien. `toMillis` est une lecture, pas une horloge. */
function msDe(v) {
  if (v == null || v === '') return 0;
  if (typeof v.toMillis === 'function') { try { return Number(v.toMillis()) || 0; } catch (_) { return 0; } }
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function jourLisible(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')); }

/* « 10 octobre ». L'étiquette `when` de la demande est FIGÉE à la commande : une demande
   passée hier soir pour « Demain » porte encore « Demain » ce matin, et l'écrire dans une
   notification envoyée le surlendemain dirait n'importe quoi. On repart de la date. */
function dateEnClair(iso) {
  if (!jourLisible(iso)) return '';
  const p = String(iso).split('-');
  return String(Number(p[2])) + ' ' + (MOIS[Number(p[1]) - 1] || '');
}

/* Saint-Barth est à UTC−4 toute l'année : c'est l'heure dans laquelle le client a choisi
   son rendez-vous. Sans heure lisible, la journée entière lui est laissée. */
function finDuJour(iso, slot) {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(String(slot || ''));
  const t = Date.parse(iso + 'T' + (hm ? (String(hm[1]).padStart(2, '0') + ':' + hm[2]) : '23:59') + ':00-04:00');
  return isFinite(t) ? t : null;
}

/* LA SOUPLESSE FAIT PARTIE DU CRÉNEAU, et l'oublier était une faute silencieuse. Un
   client qui dit « n'importe quelle heure dans la journée » (`slotFlex: 'day'`) garde un
   `slot` dans sa demande, résidu de l'écran de commande : jugée sur cette heure, sa
   demande aurait été déclarée dépassée à neuf heures du matin alors qu'il laissait la
   journée entière. Même chose pour « dans la semaine », et pour une souplesse en MINUTES
   (± 60), qui repousse d'autant la fin de la fenêtre. La souplesse est BORNÉE : une
   valeur abîmée ne doit pas pousser l'échéance à l'année prochaine. */
const JOUR_MS = 86400000;
function finFlex(flex) {
  const mn = Number(flex);
  return (isFinite(mn) && mn > 0) ? Math.min(24 * 60, mn) * 60000 : 0;
}

/* LA FIN DU CRÉNEAU, porte unique. Rend `null` quand on ne sait pas : c'est un refus de
   deviner, pas une erreur. */
function finDuCreneau(r) {
  const d = r || {};
  // Colis : la fenêtre de retrait fait foi, et elle seule a un sens (dateISO n'est jamais
  // écrit pour ce métier). La fin de fenêtre, sinon son début s'il est seul.
  if (String(d.service || '') === 'colis') {
    const fen = jourLisible(d.dateTo) ? d.dateTo : (jourLisible(d.dateFrom) ? d.dateFrom : '');
    return fen ? finDuJour(fen, '') : null;
  }
  if (!jourLisible(d.dateISO)) return null;
  const flex = d.slotFlex;
  if (flex === 'week') { const t = finDuJour(String(d.dateISO), ''); return t == null ? null : t + 6 * JOUR_MS; }
  if (flex === 'day') return finDuJour(String(d.dateISO), '');
  const t = finDuJour(String(d.dateISO), d.slot);
  return t == null ? null : t + finFlex(flex);
}

/* LA CLÉ DU CRÉNEAU ANNONCÉ : le rendez-vous, souplesse comprise. Elle ne sert qu'à se
   comparer à SOI-MÊME, sur la même demande, pour deux questions — a-t-on déjà prévenu
   pour CE rendez-vous, et le client l'a-t-il déplacé depuis. Élargir à la journée change
   le rendez-vous autant que changer de jour : la souplesse en fait donc partie, sans quoi
   une demande élargie resterait « déjà relancée » pour un créneau qui n'existe plus.
   L'APPLICATION LA RECONSTRUIT DE SON CÔTÉ pour savoir si la carte doit paraître (le
   client n'a pas de module partagé avec le serveur) : une épreuve compare les deux
   implémentations sur une table de cas, et c'est elle qui les tient ensemble. */
function cleFlex(flex) {
  if (flex === 'day' || flex === 'week') return String(flex);
  const mn = Number(flex);
  return (isFinite(mn) && mn > 0) ? String(Math.min(24 * 60, Math.round(mn))) : '';
}
function cleCreneau(r) {
  const d = r || {};
  if (String(d.service || '') === 'colis') {
    const fen = jourLisible(d.dateTo) ? d.dateTo : (jourLisible(d.dateFrom) ? d.dateFrom : '');
    return fen ? ('colis:' + fen) : '';
  }
  if (!jourLisible(d.dateISO)) return '';
  const hm = /^(\d{1,2}):(\d{2})$/.exec(String(d.slot || ''));
  return String(d.dateISO) + 'T' + (hm ? (String(hm[1]).padStart(2, '0') + ':' + hm[2]) : '--:--')
    + '/' + cleFlex(d.slotFlex);
}

/* CE QU'IL FAUT FAIRE D'UNE DEMANDE, à cet instant. L'ordre des issues compte : on
   relance AVANT d'expirer, jamais l'inverse. Le motif est rendu dans tous les cas — un
   balayage qui ne fait rien doit pouvoir dire pourquoi. */
function creneauDepasse(r, maintenant) {
  const out = {relancer: false, expirer: false, motif: ''};
  const d = r || {};
  if (String(d.status || '') !== 'pending') { out.motif = 'pas-en-recherche'; return out; }
  const fin = finDuCreneau(d);
  if (fin == null) { out.motif = 'sans-date'; return out; }
  const t = Number(maintenant) || 0;
  if (!(t > fin)) { out.motif = 'a-venir'; return out; }
  const cle = cleCreneau(d);
  const le = msDe(d.relanceAt);
  /* LES DEUX, ou la relance repart. Une fiche à moitié écrite — la clé posée, l'horodatage
     manquant — bloquerait sinon la demande pour toujours : ni relancée (la clé
     correspond), ni expirable (l'horodatage est inconnu). */
  const annoncee = !!cle && String(d.relancePour || '') === cle && le > 0;
  if (!annoncee) { out.relancer = true; out.motif = 'depasse'; return out; }
  if ((t - fin) >= PURGE_APRES_MS && (t - le) >= PURGE_APRES_MS) { out.expirer = true; out.motif = 'sans-reponse'; return out; }
  out.motif = 'prevenu';
  return out;
}

/* CE QU'ON ÉCRIT AU CLIENT. Le noyau le rend, l'appelant l'expédie : une épreuve lit la
   phrase sans serveur ni réseau. Bornée, et sans tiret cadratin (règle de l'éditeur).
   ON NE PARLE PAS D'ARGENT AU-DELÀ DU FAIT : rien n'a été prélevé, c'est vrai et c'est la
   seule inquiétude que la notification doit lever. */
function texteRelance(r) {
  const d = r || {};
  const svc = String(d.serviceName || d.service || 'votre prestation').slice(0, 60);
  const colis = String(d.service || '') === 'colis';
  let quand = '';
  if (colis) {
    const fen = jourLisible(d.dateTo) ? d.dateTo : (jourLisible(d.dateFrom) ? d.dateFrom : '');
    const c = dateEnClair(fen);
    if (c) quand = ' avant le ' + c;
  } else {
    const c = dateEnClair(d.dateISO);
    // Une demande SOUPLE n'a pas d'heure à annoncer : le `slot` qu'elle garde encore est
    // un résidu de l'écran de commande, et l'écrire contredirait ce que le client a choisi.
    const souple = (d.slotFlex === 'day' || d.slotFlex === 'week');
    const heure = (!souple && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.slot || ''))) ? (' à ' + d.slot) : '';
    if (c) quand = ' pour le ' + c + heure;
  }
  return {
    titre: 'Votre créneau est passé',
    corps: 'Personne n\'a accepté ' + svc + quand
      + '. Choisissez une nouvelle date ou annulez, rien ne vous a été prélevé.',
  };
}

module.exports = {PURGE_APRES_MS, msDe, dateEnClair, finDuCreneau, cleCreneau, creneauDepasse, texteRelance};
