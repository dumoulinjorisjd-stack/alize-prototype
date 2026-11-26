# App Store — ce qui reste à faire par l'éditeur

Audit du 26/11/2026 contre les règles d'Apple (« Last Updated : October 16, 2026 »).
Tout ce qui pouvait se faire sans compte Apple ni Mac est fait (voir
`README-APPSTORE.md`, « Déjà fait dans le dépôt »). Voici le reste, dans l'ordre.

## A. Trois décisions à prendre (avant de soumettre)

1. **Clause « tolérance zéro » des CGU** (règle 1.2 : Apple attend que les conditions
   acceptées à l'inscription disent qu'aucun contenu ni comportement abusif n'est
   toléré). Proposition, à valider ou corriger, article 7 :
   > **7.6. Tolérance zéro.** Ti-Services ne tolère aucun contenu injurieux, haineux,
   > menaçant, obscène ou harcelant, ni aucun comportement abusif envers un autre
   > utilisateur. Un tel contenu est retiré et son auteur peut être suspendu ou exclu
   > dès qu'il est constaté ou signalé. Les signalements adressés à
   > contact@ti-services.fr sont examinés dans les 24 heures.

   « Dans les 24 heures » est un engagement : ne le garder que s'il peut être tenu.
   Modifier les CGU change leur version : dire s'il faut la faire réaccepter.
2. **Pourboire** : la facture PDF écrit « Pourboire — libéralité, reversée
   intégralement au prestataire », mais le serveur prélève la commission sur le
   pourboire. L'un des deux doit changer (le texte, ou la pratique).
3. **Noms coupés en haut des écrans** : « Bonjour Marie-Christine… »,
   « Cul-de-Sac · Toiny… » se coupent avec « … » sur tous les iPhone. C'est le gabarit
   voulu (« une ligne, une ligne »). Le garder, ou passer à deux lignes ?

## B. Ce que j'attends de vous

4. **Le texte exact du premier retour d'Apple** (ASC → l'app → « App Review »).
5. **« Publie »** pour mettre en ligne la version web 948 : l'examen d'Apple regarde le
   site en ligne, pas le dépôt.
6. **Vérifier dans la console** que les comptes de démonstration existent :
   `demo.client@ti-services.fr` et `demo.prestataire@ti-services.fr` (ou
   `demo.artisan@…`, les deux sont reconnus), le prestataire **validé**, et que vous
   connaissez leur mot de passe.

## C. Sur developer.apple.com et App Store Connect

7. Accepter le **contrat du programme** mis à jour (13/10/2026), s'il est proposé.
8. Renseigner le **statut de commerçant (DSA)** : adresse, téléphone, e-mail de C.C.S
   (obligatoire pour être distribué dans l'Union européenne, donc en France).
9. Vérifier l'**identifiant d'app** `fr.tiservices.app` avec **Push Notifications**,
   et la **clé APNs (.p8)** importée dans Firebase (guide, étapes 2 et 3).

## D. Firebase

10. App iOS déclarée dans le projet t-service-prod, **GoogleService-Info.plist**
    téléchargé et glissé dans Xcode (guide, étape 4).

## E. Sur le Mac

11. **Xcode 26 ou plus récent** (le plus récent possible).
12. `git pull`, puis dans `capacitor/` : `npm install`, `npx cap sync ios`,
    `cd ios/App && pod install`.
13. Ouvrir `App.xcworkspace`, choisir l'équipe (Team) ; vérifier Push et Background
    Modes (guide, étape 5).
14. **Essais sur iPhone** : la liste à cocher du guide, étape 6 (hors ligne, position,
    photo, notifications, paiement, agenda Google, comptes de démonstration,
    suppression de compte).
15. Product → **Archive** → Distribute → App Store Connect → **TestFlight**, essayer
    l'app installée.

## F. Dans App Store Connect

16. Fiche, App Privacy, classification par âge (**18+**), URL : tout est dans
    `fiche-appstore.md`.
17. Charger les **captures** de `captures-appstore/` (6,9" et 6,3").
18. Informations d'examen : les deux comptes de démonstration et leur mot de passe,
    votre téléphone, les notes (en anglais, prêtes dans la fiche).
19. Répondre au premier retour d'Apple, point par point, puis **Soumettre**.
