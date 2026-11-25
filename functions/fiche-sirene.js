/* FICHE SIRENE — noyau pur (l'éditeur, 25/11/2026 : « quand il rentre son SIRET, toutes
 * ces informations se mettent automatiquement » ; « il faut pouvoir mettre les profils à
 * jour depuis le SIRET et depuis la console »).
 *
 * Lit la réponse de l'API publique « Recherche d'entreprises » (DINUM,
 * recherche-entreprises.api.gouv.fr, données INSEE Sirene + RNE, Licence Ouverte) et en
 * tire ce qui sert à la facture : nom, adresse de l'ÉTABLISSEMENT du SIRET saisi, forme
 * juridique, entrepreneur individuel ou non, établissement ouvert ou fermé.
 * Pur : reçoit le JSON, ne fait aucun appel. L'appel est dans functions/index.js
 * (ficheSiret), jamais sur le téléphone.
 * On ne DEVINE rien : un champ absent ou non diffusible reste vide, et c'est la personne
 * (prestataire ou console) qui applique, après avoir vu l'écart. */

const SIRET_RE = /^\d{14}$/;
function siretPropre(v) { const s = String(v || '').replace(/\s/g, ''); return SIRET_RE.test(s) ? s : ''; }

/* Catégories juridiques INSEE → libellé court de la facture. Table reprise de
   l'inscription (index.html, NATURE_JURIDIQUE), désormais tenue ici seule. Hors de cette
   liste fermée, la forme reste vide : on ne nomme pas une forme au jugé. */
const FORMES = { 1000: 'Entrepreneur individuel', 5202: 'SNC', 5306: 'Société en commandite simple', 5308: 'Société en commandite par actions',
  5385: 'Société d’exercice libéral', 5410: 'SARL', 5415: 'SARL', 5426: 'SARL', 5498: 'EURL', 5499: 'SARL', 5505: 'SA', 5510: 'SA', 5515: 'SA',
  5599: 'SA', 5710: 'SAS', 5720: 'SASU', 6540: 'SCI', 6220: 'GIE', 9220: 'Association' };

function nonDiffusible(v) { return /NON[\s-]?DIFFUSIBLE/i.test(String(v || '')); }

function ficheDepuisSirene(json, siretSaisi) {
  const siret = siretPropre(siretSaisi);
  const res = (json && Array.isArray(json.results)) ? json.results : [];
  if (!siret) return { trouve: false, motif: 'siret' };
  const ul = res.find((u) => u && (String(u.siren || '') === siret.slice(0, 9)));
  if (!ul) return { trouve: false, motif: 'introuvable' };
  const etabs = [].concat(Array.isArray(ul.matching_etablissements) ? ul.matching_etablissements : [], ul.siege ? [ul.siege] : []);
  const et = etabs.find((e) => e && String(e.siret || '') === siret) || null;
  const diffusible = String(ul.statut_diffusion || 'O') === 'O' && (!et || String(et.statut_diffusion_etablissement || 'O') === 'O');
  const nature = String(ul.nature_juridique || '');
  const estEI = !!(ul.complements && ul.complements.est_entrepreneur_individuel) || nature === '1000';
  const adresse = (et && diffusible && !nonDiffusible(et.adresse)) ? String(et.adresse || '').trim() : '';
  const nom = (diffusible && !nonDiffusible(ul.nom_raison_sociale || ul.nom_complet)) ? String(ul.nom_raison_sociale || ul.nom_complet || '').trim() : '';
  return {
    trouve: true,
    siret,
    etablissementTrouve: !!et,
    ouvert: et ? String(et.etat_administratif || '') === 'A' : String(ul.etat_administratif || '') === 'A',
    diffusible,
    nom,
    adresse,
    codePostal: et ? String(et.code_postal || '') : '',
    commune: et ? String(et.libelle_commune || '') : '',
    estEI,
    natureJuridique: nature,
    formeJuridique: FORMES[nature] || '',
  };
}

/* L'écart entre le profil et la fiche : seulement les champs que la fiche CONNAÎT et qui
   diffèrent. C'est ce qu'on montre avant d'appliquer. */
function ecartProfil(profil, fiche) {
  profil = profil || {}; const out = [];
  if (!fiche || !fiche.trouve) return out;
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (fiche.adresse && norm(fiche.adresse) !== norm(profil.address)) out.push({ champ: 'address', avant: String(profil.address || ''), apres: fiche.adresse });
  if (fiche.formeJuridique && !fiche.estEI && profil.statusType !== 'micro' && norm(fiche.formeJuridique) !== norm(profil.legalForm)) out.push({ champ: 'legalForm', avant: String(profil.legalForm || ''), apres: fiche.formeJuridique });
  return out;
}

module.exports = { FORMES, siretPropre, ficheDepuisSirene, ecartProfil };
