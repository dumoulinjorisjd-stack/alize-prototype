# Fiche App Store — tout ce qu'il faut pour App Store Connect

Chaque section correspond à un champ d'App Store Connect (ASC), à copier-coller dans
l'ordre. Les mots de passe des comptes de démonstration ne figurent JAMAIS ici : le
dépôt est public. Ils se saisissent directement dans ASC.

Mise à jour du 26/11/2026, après audit contre les règles d'Apple « Last Updated :
October 16, 2026 » (https://developer.apple.com/app-store/review/guidelines/).

---

## Informations générales

| Champ ASC | Valeur |
|---|---|
| **Nom** | Ti-Services |
| **Sous-titre** (30 car. max) | Services à domicile à St-Barth |
| **Catégorie principale** | Style de vie |
| **Catégorie secondaire** | Économie et entreprise |
| **Prix** | Gratuit |
| **Disponibilité** | France (Saint-Barthélemy en fait partie) |
| **Copyright** | © 2026 C.C.S |
| **Appareils** | iPhone seulement (le projet est réglé ainsi : pas de captures iPad à fournir) |
| **URL d'assistance** | https://ti-services.fr/legal/mentions.html (adresse, e-mail et téléphone publiés) |
| **URL marketing** (facultatif) | https://ti-services.fr |
| **URL de confidentialité** | https://ti-services.fr/legal/confidentialite.html |

## Classification par âge (questionnaire ASC)

Les CGU réservent l'inscription aux **personnes majeures** : Apple demande alors de
retenir l'âge le plus élevé (aide ASC « Set an app age rating »). Réponses :

- Contenu généré par les utilisateurs : **Oui** (messagerie client ↔ prestataire, photos)
- Messagerie et discussion : **Oui**
- Localisation partagée : **Oui** (le point GPS de l'adresse est transmis au prestataire)
- Réseaux sociaux : **Non** (pas de fil public)
- Accès Web sans restriction : **Non** (la navigation est limitée à ti-services.fr et Mollie)
- Rencontres, jeux d'argent, violence, contenus sexuels, alcool, tabac, drogues : **Non**
- Âge minimal fixé par les conditions : **18 ans** → note **18+**

## Description

Ti-Services, c'est un pro de confiance chez vous en quelques minutes, à
Saint-Barthélemy.

Ménage, garde d'enfants, jardinage, coiffure, aide à domicile… Commandez en
quelques gestes : le service, l'heure, l'adresse, c'est tout. Un prestataire
vérifié accepte, vous suivez tout en direct, et le paiement est automatique et
sécurisé une fois la prestation faite, facture incluse.

POUR LES CLIENTS
• Des prestataires vérifiés (identité, SIRET, assurance)
• Commande en quelques gestes, point GPS précis, pratique sur l'île
• Commandes ponctuelles ou récurrentes, à mettre en pause à tout moment
• Paiement après la prestation, aucune avance
• Notifications à chaque étape : accepté, démarré, terminé
• Messagerie avec votre prestataire

POUR LES PRESTATAIRES
• Recevez les demandes en direct, acceptez d'un geste
• Paiement, facturation et suivi automatiques
• Une commission qui baisse au fil des missions

Ti-Services est édité par C.C.S à Saint-Barthélemy.

## Mots-clés (100 car. max)

saint-barth,ménage,jardinage,baby-sitting,coiffure,services,domicile,artisan,st-barthélemy

## Nouveautés de cette version (v1)

Première version de Ti-Services : commandez un service à domicile en quelques
gestes, suivez la prestation en direct, payez en toute sécurité une fois le
travail fait.

---

## Confidentialité de l'app (App Privacy)

Collecte de données : **OUI**. Pour chaque type : **lié à l'identité de
l'utilisateur**, usage **Fonctionnalité de l'app**, **pistage : NON**. Ces réponses
sont alignées sur `ios/App/App/PrivacyInfo.xcprivacy` ; changer l'un, c'est
changer l'autre.

- **Coordonnées** : nom, adresse e-mail, numéro de téléphone, adresse physique
- **Localisation** : localisation précise (point GPS de l'adresse d'intervention)
- **Contenu utilisateur** : photos, e-mails ou messages (messagerie dans l'app),
  autre contenu (présentation du prestataire, précisions d'une commande),
  service client (messages au support)
- **Historique d'achats** : prestations commandées
- **Informations financières** : autres informations financières (IBAN des
  prestataires). La carte bancaire est saisie chez Mollie : Ti-Services n'y a
  jamais accès, elle n'est pas « collectée » au sens d'Apple.
- **Identifiants** : identifiant utilisateur, identifiant d'appareil (jeton de
  notification)
- **Autres données** : pièce d'identité et attestation d'assurance des
  prestataires (vérification)
- **Pistage : NON**, aucune publicité, aucun courtier en données, donc pas de
  demande App Tracking Transparency.

## Chiffrement (export compliance)

Déclaré dans l'app (`ITSAppUsesNonExemptEncryption = false`) : HTTPS du système
uniquement, aucune question à chaque envoi.

---

## Informations pour l'examen (App Review Information)

### Connexion requise : OUI

- **Identifiant** : demo.client@ti-services.fr
- **Mot de passe** : *(saisir dans ASC seulement)*

### Coordonnées de contact

Joris DUMOULIN · [téléphone au format +590…] · [e-mail du compte développeur]

### Notes pour l'examinateur (copier-coller dans « Notes »)

Ti-Services is a local marketplace for home services on the island of
Saint-Barthélemy (France): cleaning, gardening, babysitting, hairdressing at home,
repairs, pet sitting, parcel pick-up. Clients order a service; verified local
providers (self-employed, registered businesses) accept it and carry it out at the
client's home.

NATIVE FEATURES: native push notifications (new missions for providers in real time,
order status for clients: accepted, started, finished, new message); precise GPS
point of the service address (location used only when the user taps the button,
manual address always possible); camera and photo library to attach photos to a
request; native offline screen with automatic retry; navigation restricted to our
own domain and to our payment provider.

DEMO ACCOUNTS (both are sandboxed: nothing they do reaches real users):
1. Client: demo.client@ti-services.fr (password above). An order is already in
   progress with its conversation. Placing a new order is simulated: no payment is
   taken and a demo provider accepts it after two seconds, which opens the
   conversation.
2. Provider: demo.prestataire@ti-services.fr / [same password]. It sees one sample
   request. Accepting it writes nothing and opens the conversation with the demo
   client. It never sees real clients' requests.

USER-GENERATED CONTENT (Guideline 1.2): messages containing insults, slurs or threats
are refused before they are sent (FR/EN/PT filter, also applied to provider
descriptions and order notes). In every conversation: "Signaler" (Report) and
"Bloquer" (Block). Users accept the Terms at sign-up; article 7.6 states zero
tolerance for objectionable content or abusive users. Reports:
contact@ti-services.fr, reviewed within 24 hours; the content is removed and its
author suspended or excluded.

PAYMENTS (Guideline 3.1.3(e)): all payments are for PHYSICAL services performed at the
client's home, processed by our payment provider Mollie (card). The optional tip is
passed on to the provider who performed the service, minus our commission covering card
and handling fees. "Coup de pouce" is an optional increase of
the price of that physical service, paid to the provider. No digital goods, no
subscriptions, no in-app content for sale.

SIGN-IN: our own email and password accounts only, no third-party login.

ACCOUNT DELETION (Guideline 5.1.1(v)): Profile → "Supprimer mon compte" (clients and
providers). Data are deleted; invoices already issued are kept for the legal period,
as stated in our privacy policy.

---

## Captures d'écran

Fournies dans `capacitor/captures-appstore/`, prises sur les vrais écrans avec les
comptes de démonstration :
- **iPhone 6,9"** (1320 × 2868) : `6.9-1-accueil.png` … `6.9-5-prestataire.png`
- **iPhone 6,3"** (1206 × 2622) : `6.3-1-accueil.png` … `6.3-5-prestataire.png`

Ordre : 1 accueil client · 2 commande · 3 réservations · 4 conversation · 5 espace
prestataire.

---

## Check-list finale avant « Soumettre pour examen »

- [ ] Version web v948 (ou plus) publiée sur ti-services.fr : bac à sable du
      prestataire de démonstration, filtre des propos, adresse de signalement
- [ ] Comptes de démonstration vérifiés dans la console : client ET prestataire
      validé, mots de passe connus, jamais purgés
- [ ] Build envoyé depuis Xcode 26 ou plus récent (Archive → Distribute) et sélectionné
- [ ] Captures chargées (6,9" et 6,3")
- [ ] App Privacy et classification par âge remplis comme ci-dessus
- [ ] Statut de commerçant (DSA) renseigné dans ASC
- [ ] Contrat du programme développeur à jour accepté (version du 13/10/2026)
- [ ] Réponse au premier retour d'Apple, point par point, dans « App Review »
