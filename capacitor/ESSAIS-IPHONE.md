# Essais sur iPhone — 26/11/2026 (Xcode 26.3, app lancée sur l'iPhone de l'éditeur)

Relevé tenu PENDANT les essais. Décision de l'éditeur : **tout corriger une fois les
essais terminés**, en une fois, puis suite complète et publication sur son « Publie ».

L'iPhone de l'éditeur s'affiche en **320 points** de large (zoom de l'écran « Texte plus
grand » ou petit modèle) : toute correction d'affichage se mesure à 320 ET à 375/393.

## À corriger (après les essais)

| # | Constat | État |
|---|---|---|
| 1 | Connexion sans réseau : « Erreur : auth/network-request-failed » (code brut). | Corrigé dans la 949 (`fbErr` → `fbErrTxt`), test `test-erreur-connexion.js`. **Pas encore publié.** |
| 2 | L'écran saute à chaque lettre tapée, surtout en revenant dans une case qui contient déjà du texte (connexion, et beaucoup d'autres écrans). | Corrigé dans la 949 pour tous les champs (`saisieClavierNative`), test `test-clavier-natif.js`. **Pas encore publié** ; à revérifier sur l'iPhone après publication, sur plusieurs écrans. |
| 3 | Profil client à 320 points : « Mes informati… », « Mes adre… » coupés par les pastilles « Tél. manquant », « Adresse manquante » (`foldCard`). | Maquette VALIDÉE par l'éditeur : sous 360 points, la pastille passe sous le texte, dans la colonne, chevron à droite (`outils` : avant/après dans le relevé de session). À coder : CSS `.fold-head` en grille sous 360 px ; vérifier TOUTES les cartes `foldCard` (client, prestataire, conciergerie) en FR/EN/PT ; rien ne bouge à 375 et plus. |
| 4 | Premier lancement depuis Xcode : accueil, puis long écran noir, puis accueil. Pas reproduit aux lancements suivants. | À revérifier sur une installation NEUVE par TestFlight (supprimer l'app, réinstaller, ouvrir). |

## Notes, sans correction prévue

- Commande commencée : reprise par la carte « Reprendre votre commande » de l'**Accueil**
  (pas dans Réservations). Fonctionne. Un rappel aussi dans Réservations serait une
  décision de produit (maquette d'abord) : non demandée à ce jour.
- Notifications : impossibles à tester depuis Xcode (clé APNs de **développement** absente
  dans Firebase ; la clé de production FB63ZZ5N54 est en place). À tester par TestFlight.
- Paiement réel et agenda Google : non testés sur l'iPhone (l'examinateur passe par la
  commande simulée du compte de démonstration).
- Défaut ancien : « Version 1.5 · 26 novembre 2026 » reste en français dans les CGU EN/PT.
- Mac : deux Xcode (16.4 dans Applications, 26.3 dans Téléchargements). Ouvrir le projet
  avec `open -a ~/Downloads/Xcode.app ~/alize-prototype/capacitor/ios/App/App.xcworkspace`.
  Un ancien exemplaire du projet traîne dans `~/Documents/alize-prototype` : ne pas l'utiliser.

## Validé sur l'iPhone

- Coquille : plein écran, ni « Installer l'application » ni bouton Google, version 948.
- Hors ligne : l'app s'ouvre sur le site gardé en mémoire ; l'action qui demande le
  serveur le dit (après la 949 : en phrase claire).
- Position : demande avec le texte de Ti-Services ; refus géré (« Localisation refusée,
  autorisez-la dans les réglages du téléphone ») ; saisie à la main ; « Placer sur la
  carte » fonctionne sans autorisation.
- Photo : demande d'accès, appareil photo et photothèque, pas de plantage.
- Conversation : message normal envoyé ; « Test connard » refusé, texte gardé ;
  « Signaler » et « Bloquer » présents.
- Compte de démonstration client : connexion OK, commande en cours visible.
- Signature Xcode : équipe JORIS DUMOULIN, profil géré, Push Notifications, Background
  Modes → Remote notifications, GoogleService-Info.plist rattaché.

## Reste à essayer

- Compte de démonstration prestataire (demande d'exemple, aucune vraie demande,
  Accepter ouvre la conversation, Signaler/Bloquer).
- Suppression de compte sur un compte jetable.
- Archive → TestFlight, puis installation neuve (point 4) et notifications.
