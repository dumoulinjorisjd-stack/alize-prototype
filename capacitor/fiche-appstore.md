# Fiche App Store — TOUT ce qu'il faut pour App Store Connect

Chaque section ci-dessous correspond à un champ d'App Store Connect.
Copier-coller dans l'ordre. Les seuls éléments à saisir de tête sont les
mots de passe des comptes démo (JAMAIS dans ce fichier : le dépôt est public).

---

## Informations générales

| Champ ASC | Valeur |
|---|---|
| **Nom** | Ti-Services |
| **Sous-titre** (30 car. max) | Services à domicile à St-Barth |
| **Catégorie principale** | Style de vie |
| **Catégorie secondaire** | Économie et entreprise |
| **Prix** | Gratuit |
| **Disponibilité** | France (suffit : St-Barthélemy en fait partie) — ou Monde entier, au choix |
| **Copyright** | © 2026 C.C.S |
| **Classification d'âge** | Répondre « Non » à tout le questionnaire → 4+ |
| **URL d'assistance** | https://ti-services.fr |
| **URL marketing** (facultatif) | https://ti-services.fr |
| **URL de confidentialité** | https://ti-services.fr/?legal=confidentialite |

## Description

Ti-Services, c'est un pro de confiance chez vous en quelques minutes, à
Saint-Barthélemy.

Ménage, garde d'enfants, jardinage, coiffure, aide à domicile… Commandez en
quelques gestes : le service, l'heure, l'adresse — c'est tout. Un prestataire
vérifié accepte, vous suivez tout en direct, et le paiement est automatique et
sécurisé une fois la prestation faite, facture incluse.

POUR LES CLIENTS
• Des prestataires vérifiés (identité, SIRET, assurance)
• Commande en 3 gestes, point GPS précis — pratique sur l'île
• Paiement sécurisé après la prestation, aucune avance
• Garantie Ti-Services : prestataire absent ou travail non conforme ? Vous n'êtes
  pas débité.
• Notifications à chaque étape : accepté, en route, terminé

POUR LES PRESTATAIRES
• Recevez les demandes en direct, acceptez d'un geste
• Concentrez-vous sur votre métier : paiement, facturation et suivi automatiques
• Un statut de fidélité qui fait baisser la commission au fil des missions

Ti-Services est édité par C.C.S à Saint-Barthélemy (COM, hors TVA).

## Mots-clés (100 car. max)

saint-barth,ménage,jardinage,baby-sitting,coiffure,services,domicile,artisan,st-barthélemy

## Nouveautés de cette version (obligatoire, v1)

Première version de Ti-Services : commandez un service à domicile en quelques
gestes, suivez la prestation en direct, payez en toute sécurité une fois le
travail fait.

---

## Questionnaire confidentialité (App Privacy)

Collecte de données : OUI. Déclarer, pour chaque type, « lié à l'identité de
l'utilisateur », usage « Fonctionnalité de l'app », **pistage : NON** :

- **Coordonnées** : nom, adresse e-mail, numéro de téléphone, adresse physique
- **Localisation** : localisation précise (point GPS de l'adresse d'intervention)
- **Informations financières** : infos de paiement (traitées par Mollie, PSP —
  l'app ne stocke jamais les numéros de carte)
- **Identifiants** : identifiant utilisateur
- **Pistage inter-apps (tracking) : NON** — pas de publicité, pas de revente,
  pas de courtiers en données.

## Export compliance (chiffrement)

Déjà déclaré dans l'app (`ITSAppUsesNonExemptEncryption = false`) : HTTPS
standard uniquement → aucune question à l'envoi du build.

---

## Informations pour l'examen (App Review Information)

### Connexion requise : OUI — identifiants à saisir dans ASC

- **Champ identifiant** : demo.client@ti-services.fr
- **Champ mot de passe** : *(saisir dans ASC uniquement — ne figure pas ici)*

### Coordonnées de contact

Joris DUMOULIN · [ton téléphone au format +590…] · ccs.dumoulin@gmail.com

### Notes pour l'examinateur (copier-coller dans le champ « Notes »)

Ti-Services est une place de marché locale de services à domicile pour l'île de
Saint-Barthélemy (France). L'app apporte les notifications push natives,
indispensables aux prestataires (nouvelles missions en temps réel) et aux
clients (suivi de prestation).

CONTEXTE D'OUVERTURE — L'ouverture au grand public est planifiée au 1er octobre
2026 : d'ici là, les comptes clients ordinaires voient les services « bientôt
disponibles ». Le compte de démonstration fourni ci-dessus dispose de l'ACCÈS
COMPLET (commande possible) afin d'évaluer l'intégralité du parcours.

MARKETPLACE — Certaines catégories peuvent afficher « Bientôt disponible » :
c'est le comportement normal d'une place de marché tant qu'aucun prestataire
vérifié ne propose ce service. La majorité des catégories sont actives et
commandables avec le compte fourni.

DEUXIÈME COMPTE DE DÉMONSTRATION (espace prestataire) — pour évaluer le côté
intervenant : demo.artisan@ti-services.fr / [même mot de passe — saisir ici].
Ce compte est un prestataire validé : il reçoit les demandes et peut les
accepter.

PAIEMENTS — Les paiements concernent exclusivement des prestations de services
PHYSIQUES rendues à domicile (ménage, jardinage…), traitées par le prestataire
de paiement Mollie, conformément à la règle 3.1.5(a) — l'achat intégré (IAP)
ne s'applique pas.

COMPTE — La suppression de compte est disponible dans l'app (Profil →
« Supprimer mon compte »), conformément à la règle 5.1.1(v).

---

## Captures d'écran (formats 6,7" 1290×2796 et 6,5" 1284×2778)

À faire depuis le simulateur (⌘S) ou fournies par l'outillage du projet :
1. Accueil client (grille des services) — connecté avec le compte démo
2. Commande (choix heure/adresse/point GPS)
3. Suivi de mission (statut en direct)
4. Espace prestataire « Mes missions »
5. Statut fidélité / parrainage

---

## Check-list finale avant de cliquer « Soumettre »

- [ ] Comptes démo créés sur ti-services.fr : demo.client@… (fait) et
      demo.artisan@… **validé** dans la console admin (fait)
- [ ] Mots de passe saisis DANS ASC (identifiants + notes), pas dans ce fichier
- [x] Toutes les catégories actives pour le compte démo : automatique (le compte
      de démonstration voit toutes les tuiles ouvertes, code v520)
- [ ] Build envoyé depuis Xcode (Archive → Distribute) et sélectionné dans ASC
- [ ] Captures d'écran chargées (2 tailles)
- [ ] Questionnaire confidentialité rempli (section ci-dessus)
- [ ] Numéro de téléphone de contact renseigné dans App Review Information
