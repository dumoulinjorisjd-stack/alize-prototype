/* L'ARGENT MIS DE CÔTÉ, DIT AU PRESTATAIRE.
   ─────────────────────────────────────────
   « Il y a des prestataires qui font des prestations mais ne s'inscrivent jamais sur
   Mollie, donc ils ne sont jamais payés. […] Ils ne le commencent même pas. » (l'éditeur,
   07/11/2026). Leur net n'est jamais perdu : il reste sur le solde Ti-Services, marqué
   `molliePayout == 'unrouted'`, et part le jour où leur compte s'ouvre. Mais l'écran
   d'accueil disait « activez vos paiements » SANS CHIFFRE, et l'avis de fin de mission
   non plus. Un rappel sans montant est une démarche ; un montant est de l'argent à soi.

   Décision de l'éditeur : la somme sur l'écran d'accueil, ET une notification pour ceux
   qui l'ont activée, un e-mail pour les autres — jamais les deux.

   Module PUR : aucune base, aucune horloge, les instants se reçoivent. */

const TROP_TOT_MS = 60 * 60 * 1000;          // deux jambes d'une même mission, à quelques secondes
const DEJA_DIT_MS = 7 * 86400 * 1000;        // montant inchangé : la relance hebdomadaire s'en charge

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/* Ce qui est mis de côté : le net de chaque mission dont le versement n'a pas pu partir.
   C'est la MÊME somme que la relance hebdomadaire annonce (`netEnAttente` côté serveur
   lit la même condition) — deux chiffres pour le même argent seraient le défaut. */
/* TROIS JAMBES, PAS UNE. Une mission se paie par l'empreinte (molliePayout), ou par le
   second paiement quand l'empreinte a expiré (complementPayout — c'est alors la
   prestation ENTIÈRE), ou par des arrhes (arrhesPayout). Ne compter que la première
   affichait 0 € à une prestataire dont les 110 € dormaient sur le second paiement —
   relevé le 09/11/2026. Chaque jambe porte son net figé au moment du refus. */
const JAMBES = [['molliePayout', 'molliePayoutNet'], ['complementPayout', 'complementNet'], ['arrhesPayout', 'arrhesPayoutNet']];
function netMisDeCote(requests) {
  let net = 0;
  (Array.isArray(requests) ? requests : []).forEach((r) => {
    if (!r) return;
    JAMBES.forEach(([etat, champNet]) => {
      if (r[etat] !== 'unrouted') return;
      net += Number(r[champNet]) || 0;
    });
  });
  return round2(net);
}

/* Faut-il le dire maintenant, et par où.
   - rien à dire sans argent ;
   - la NOTIFICATION pour qui l'a activée, sinon l'E-MAIL, sinon personne (et on le dit) ;
   - pas deux fois à une heure d'écart (une mission a deux jambes de versement) ;
   - un montant INCHANGÉ ne se redit pas avant sept jours : c'est le travail de la relance
     du lundi, et deux messages identiques dans la semaine apprennent à ne plus lire. */
function rappelArgentDecider(e) {
  e = e || {};
  const net = round2(e.net);
  if (net <= 0) return {envoyer: false, canal: 'aucun', raison: 'rien', net};
  const canal = e.aPush ? 'push' : (e.aMail ? 'mail' : 'aucun');
  if (canal === 'aucun') return {envoyer: false, canal, raison: 'injoignable', net};
  const dernierAt = Number(e.dernierAt) || 0;
  const now = Number(e.now) || 0;
  if (dernierAt && now - dernierAt < TROP_TOT_MS) return {envoyer: false, canal, raison: 'trop-tot', net};
  if (dernierAt && round2(e.dernierNet) === net && now - dernierAt < DEJA_DIT_MS) return {envoyer: false, canal, raison: 'deja-dit', net};
  return {envoyer: true, canal, raison: 'nouveau', net};
}

/* Le montant écrit comme un montant français. Le noyau ne connaît pas la langue de
   l'interface : c'est une notification, elle part en français. */
function eurTexte(net) {
  const n = round2(net);
  const [ent, dec] = n.toFixed(2).split('.');
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + dec + ' €';
}

/* Un titre qui dit la somme, un corps qui dit le geste. Rien d'autre. */
function rappelArgentTextes(net) {
  const t = eurTexte(net);
  return {
    titre: t + ' vous attendent',
    corps: 'Votre gain est mis de côté. Connectez votre compte de paiement pour le recevoir : quelques minutes, une seule fois.',
    montant: t,
  };
}

module.exports = {JAMBES, netMisDeCote, rappelArgentDecider, rappelArgentTextes, eurTexte, TROP_TOT_MS, DEJA_DIT_MS};
