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
| 3 | Profil client à 320 points : titres coupés par les pastilles (`foldCard`). | **Corrigé (949)** : sous 360 points, pastille sous le texte, chevron à droite. Test `test-ecran-etroit.js` (320/375/393/430 × FR/EN/PT). |
| 5 | Adresse du prestataire : « il manque le code postal », mais pas de case pour le code postal. | **Corrigé (949), solution (a)** : « Ajoutez le code postal dans votre adresse, ex. 97133 Saint-Barthélemy. » La solution (b), trois cases, reste possible sur décision (maquette d'abord). |
| 6 | Après « Corriger › », Enregistrer 550 px sous le champ (hors écran) ; numéro coupé dans sa case à 320 points. | **Corrigé (949)**, maquette validée : barre Enregistrer / Annuler collée au-dessus des onglets pendant l'édition ; indicatif +590 plus étroit sous 360 points. Test `test-enregistrer-en-vue.js`. |
| 7 | Compte prestataire à 320 points : pastilles de fidélité hors carte ; « Mes documents » : l'état sort de la carte. | **Corrigé (949)**, y compris en portugais à 375 et 393 points (trouvé par la mesure). Le test mesure désormais tout texte hors carte. |
| 8 | Pied de page : « · » orphelin en bout de ligne. | **Corrigé (949)**, variante B validée : « DOCUMENTS LÉGAUX », deux liens par ligne quand ils tiennent, un seul sinon. |
| 9 | Carte « Bon retour » : e-mail coupé au milieu. | **Corrigé (949)**, variante B validée (après une première version jugée « pas jolie ni convaincante ») : initiale, nom et e-mail en haut, « Se connecter » en contour sur toute la largeur. « Déjà un compte ? » GARDÉ (utile avec plusieurs comptes). |
| 4 | Premier lancement depuis Xcode : accueil, puis long écran noir, puis accueil. Pas reproduit aux lancements suivants. | À revérifier sur une installation NEUVE par TestFlight (supprimer l'app, réinstaller, ouvrir). |

## Notes, sans correction prévue

- Compte prestataire à 320 points : « Contacter Ti- / Services » se replie sur le trait
  d'union du nom de marque (pas de texte coupé, mais le nom est scindé). À trancher.

- En-têtes coupés avec « … » (« Bonsoir Apple », « Gustavia · Saint-Barth », PT « Os meus
  serviços ») : gardés sur décision de l'éditeur (« on garde les noms coupés »). À 320
  points, même un prénom court se coupe.

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
- Compte de démonstration prestataire : une seule demande d'exemple (« demain à 9h00 »),
  aucune vraie demande ; Accepter ouvre la conversation ; « Signaler » et « Bloquer Camille ».
  Adresse complétée (Gustavia, 97133 Saint-Barthélemy) : la carte rouge a disparu.
- Suppression de compte (compte jetable) : va au bout depuis l'app, reconnexion refusée.
- Signature Xcode : équipe JORIS DUMOULIN, profil géré, Push Notifications, Background
  Modes → Remote notifications, GoogleService-Info.plist rattaché.

## Reste à essayer

- Archive → TestFlight, puis installation neuve (point 4) et notifications.
