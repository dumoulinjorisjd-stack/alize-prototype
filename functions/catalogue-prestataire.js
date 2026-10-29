'use strict';
/* QUEL CATALOGUE FAIT AUTORITÉ, ET À QUEL PRIX — module PUR, aucune base, aucun réseau.

   Décisions de l'éditeur, 29/10/2026, dans l'ordre où elles sont tombées :

   « Ceux qui n'acceptent pas la grille, on peut uniquement les choisir en cliquant
     dessus, mais pas en aléatoire, en connaissant sa propre grille de tarif. »
   « On ne compare rien […] pour ne rendre personne dans une mauvaise posture, on est
     sur du haut de gamme. »
   « Depuis la console n'importe lequel, si je décoche la grille tarifaire basique — le
     choix doit pouvoir évoluer. »
   « Que dans les catégories que je choisis d'ouvrir à cette possibilité dans la
     console. Il peut ajouter autant de lignes qu'il veut. »

   TROIS NIVEAUX, ET LE MÉTIER COMMANDE LES DEUX AUTRES. Le métier ouvre (console) ; le
   prestataire reçoit (sa fiche, ou son profil) ; les lignes sont les siennes. Fermer le
   métier referme tout, sans toucher à un seul compte — c'est ce qui rend le choix
   réversible dans les deux sens, et c'est pour cela que la porte est là et pas ailleurs.

   ON NE COMPARE RIEN, ET C'EST STRUCTUREL : son catalogue n'est pas une variante du
   nôtre, c'est LE SIEN — ses lignes, ses noms, ses durées, autant qu'il veut. Il n'y a
   donc rien à rapprocher, donc rien à mettre côte à côte.

   ET LE PRIX NE VIENT PAS DE L'APPAREIL DU CLIENT. `montantsDemande` chiffre depuis
   `r.acts[].price`, que le navigateur écrit : les règles le FIGENT après acceptation
   (`prixKeys`) mais personne ne vérifiait sa VALEUR d'origine. Tant qu'il n'y avait
   qu'une grille, l'écart se voyait ; avec un catalogue par personne, il faut une
   autorité. `prixAttendu` est cette autorité, et elle est lue là où l'argent bouge.
*/

/* COMBIEN DE LIGNES. « Autant qu'il veut » n'est pas « sans borne » : le catalogue
   voyage dans la réponse de `listProviders`, qui rend TOUS les prestataires d'un métier.
   Quarante lignes tiennent largement un institut, et pèsent ~2 Ko à côté d'une photo de
   profil que la même réponse borne déjà à 90 000 caractères. Ce qui dépasse n'est pas
   jeté en silence : l'écran le DIT. */
const CAT_LIGNES_MAX = 40;
const CAT_NOM_MAX = 80;
const CAT_PRIX_MAX = 100000;
/* UN MONTANT D'ARGENT SE COMPARE AU CENTIME. Les prix passent par JSON et par des
   champs de saisie : on ne refuse pas une commande pour un millième d'euro. */
const CAT_CENTIME = 0.009;

const MOTIFS = {
  horsCatalogue: 'ligne absente du catalogue',
  prix: 'prix differe du catalogue',
  vide: 'commande sans ligne',
  quantite: 'quantite invalide',
};

function nbr(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function txt(v) { return String(v == null ? '' : v).trim(); }

/* CE MÉTIER OUVRE-T-IL LES CATALOGUES PROPRES ? La porte, décidée dans la console et
   rangée là où vivent déjà les autres réglages par métier. Absent = FERMÉ : un métier
   qui n'a jamais été ouvert ne porte rien, et c'est le comportement d'aujourd'hui. */
function metierOuvreCatalogue(reglageMetier) {
  return !!(reglageMetier && reglageMetier.catalogueLibre === true);
}

/* LES LIGNES PROPRES D'UN PRESTATAIRE, NETTOYÉES. Ce qui vient d'un compte et finit sur
   l'écran d'un client — et dans un montant prélevé — passe par ici et par rien d'autre :
   un nom borné, un prix fini et positif, un identifiant. Une ligne qu'on ne sait pas
   lire est ÉCARTÉE et COMPTÉE, jamais devinée. */
function lignesPropres(brut) {
  const src = Array.isArray(brut) ? brut : [];
  const out = []; let ecartees = 0; let coupees = 0;
  const vus = Object.create(null);
  src.forEach((l, i) => {
    const nm = txt(l && l.nm).slice(0, CAT_NOM_MAX);
    const px = nbr(l && l.price);
    if (!nm || !(px > 0) || px > CAT_PRIX_MAX) { ecartees++; return; }
    /* L'IDENTIFIANT EST CELUI DE LA LIGNE, PAS SON RANG. Une commande déjà passée le
       porte ; renuméroter au rang ferait pointer une ancienne commande sur une autre
       prestation dès qu'il réordonne sa carte. */
    const id = txt(l && l.id) || ('c' + (i + 1));
    if (vus[id]) { ecartees++; return; }
    vus[id] = 1;
    if (out.length >= CAT_LIGNES_MAX) { coupees++; return; }
    out.push({ id: id, nm: nm, price: Math.round(px * 100) / 100 });
  });
  return { lignes: out, ecartees: ecartees, coupees: coupees };
}

/* SON CATALOGUE EST-IL EN SERVICE SUR CE MÉTIER ? Trois conditions, et chacune a sa
   raison. Le métier ouvert — la porte. La case cochée — son choix, ou le vôtre. Et AU
   MOINS UNE LIGNE LISIBLE : décocher la grille sans rien saisir ne doit pas le rendre
   incommandable. Un champ vide ne rend personne inexistant — la leçon de la masseuse
   disparue de l'écran de commande parce qu'une case de sa fiche n'était pas remplie.
   Il reste donc à la grille, et l'écran le DIT. */
function catalogueProprePose(artisan, svcId, reglageMetier) {
  if (!metierOuvreCatalogue(reglageMetier)) return false;
  const e = ((artisan || {}).ownCatalog || {})[svcId];
  if (!e || e.on === false) return false;
  return lignesPropres(e.lines).lignes.length > 0;
}

/* LE CATALOGUE QUI FAIT FOI POUR CETTE PERSONNE SUR CE MÉTIER. Une seule porte : la
   diffusion, l'écran du client, la vérification du prix et le prélèvement posent la
   même question, et deux endroits qui y répondraient chacun de leur côté finiraient par
   ne plus répondre pareil. */
function catalogueQuiFaitFoi(artisan, svcId, grille, reglageMetier) {
  if (catalogueProprePose(artisan, svcId, reglageMetier)) {
    const n = lignesPropres((((artisan || {}).ownCatalog || {})[svcId] || {}).lines);
    return { propre: true, lignes: n.lignes, ecartees: n.ecartees, coupees: n.coupees };
  }
  return { propre: false, lignes: lignesPropres(grille).lignes, ecartees: 0, coupees: 0 };
}

/* CELUI QUI A SON CATALOGUE NE REÇOIT PAS DE COMMANDE ALÉATOIRE. C'est la décision de
   l'éditeur, et elle se tient toute seule : une demande ouverte part à plusieurs
   prestataires à la fois, au prix annoncé au client — donc au prix de la grille. */
function recoitLAleatoire(artisan, svcId, reglageMetier) {
  return !catalogueProprePose(artisan, svcId, reglageMetier);
}

/* CE QUE LA COMMANDE DOIT COÛTER, SELON LE CATALOGUE QUI FAIT FOI.
   On ne CORRIGE pas la commande — on dit si elle est conforme, et en quoi elle ne l'est
   pas. Corriger en silence prélèverait une somme que le client n'a jamais vue à l'écran,
   ce qui est le contraire de ce qu'on protège. */
function prixAttendu(acts, lignes) {
  const cat = Object.create(null);
  (Array.isArray(lignes) ? lignes : []).forEach((l) => { cat[l.id] = l; });
  const src = Array.isArray(acts) ? acts : [];
  if (!src.length) return { ok: false, motif: MOTIFS.vide, total: 0, ecarts: [] };
  let total = 0; const ecarts = [];
  src.forEach((a) => {
    const id = txt(a && a.id);
    /* ZÉRO EST FAUX EN JAVASCRIPT, et `nbr(qty) || 1` en faisait donc UN. Une quantité
       nulle redevenait valide en silence, sur la ligne qui décide d'un montant prélevé.
       L'ABSENCE vaut un (c'est la convention de la commande), une quantité ÉCRITE est
       jugée telle quelle. */
    const qBrut = (a && a.qty);
    const q = (qBrut === undefined || qBrut === null || qBrut === '') ? 1 : nbr(qBrut);
    const l = cat[id];
    if (!l) { ecarts.push({ id: id, motif: MOTIFS.horsCatalogue }); return; }
    if (!(q > 0) || q !== Math.floor(q)) { ecarts.push({ id: id, motif: MOTIFS.quantite }); return; }
    const px = nbr(a && a.price);
    if (Math.abs(px - l.price) > CAT_CENTIME) {
      ecarts.push({ id: id, motif: MOTIFS.prix, commande: px, catalogue: l.price });
    }
    total += l.price * q;
  });
  total = Math.round(total * 100) / 100;
  return { ok: ecarts.length === 0, motif: ecarts.length ? ecarts[0].motif : '', total: total, ecarts: ecarts };
}

module.exports = {
  CAT_LIGNES_MAX, CAT_NOM_MAX, CAT_PRIX_MAX, CAT_CENTIME, MOTIFS,
  metierOuvreCatalogue, lignesPropres, catalogueProprePose, catalogueQuiFaitFoi,
  recoitLAleatoire, prixAttendu,
};
