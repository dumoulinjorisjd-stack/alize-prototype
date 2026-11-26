# Ti-Services sur l'App Store — guide complet (compte particulier)

Ce dossier contient la **coquille native iOS** (Capacitor) : une vraie app App Store
qui charge `https://ti-services.fr` avec le **push natif** (APNs → FCM). Le serveur
envoie déjà via FCM : les jetons natifs arrivent dans les mêmes collections
(`users.pushTokens`, `fcmOwners`) — **aucun changement côté Cloud Functions**.

Le site détecte la coquille (`isNativeShell()` dans `index.html`) : il masque
« Installer l'application » et les boutons Google (bloqués par Google en WebView),
et les notifications passent par le plugin natif.

---

## Déjà fait dans le dépôt (audit du 26/11/2026)

Ces réglages vivent dans le projet : plus rien à cocher pour eux dans Xcode.

- **Messages d'autorisation** (Info.plist + `fr/en/pt.lproj/InfoPlist.strings`) :
  position, appareil photo, photothèque (lecture et ajout). Sans eux, « Prendre une
  photo » faisait planter l'app.
- **Notifications** : `App/App.entitlements` (aps-environment) relié à la cible.
- **Manifeste de confidentialité** : `App/PrivacyInfo.xcprivacy` (aucun pistage,
  données déclarées, alignées sur `fiche-appstore.md`).
- **iPhone seulement, portrait seulement**, `arm64`, langue principale français.
- **Page hors ligne** : `www/index.html` + `server.errorPath` (plus d'écran vide sans
  réseau au lancement).
- **Chiffrement** : `ITSAppUsesNonExemptEncryption = false`.

---

## Prérequis (une fois)

1. **Compte Apple Developer actif** (particulier, 99 $/an) — e-mail « Welcome » reçu.
2. **Un Mac avec Xcode 26 ou plus récent** : Apple refuse tout envoi construit avec un
   SDK plus ancien depuis le 28/04/2026, et exigera le SDK iOS 27 en avril 2027 ;
   prendre la dernière version d'Xcode. Connecte-toi dans Xcode → Settings → Accounts
   avec ton identifiant Apple. Si la construction échoue avec Capacitor 6, me
   transmettre le message d'erreur exact : la mise à niveau se fera à ce moment-là.
3. **CocoaPods** sur le Mac : `sudo gem install cocoapods` (ou `brew install cocoapods`).
4. **Node.js** sur le Mac (nodejs.org, version LTS).

## Étape 1 — Récupérer le projet sur le Mac

```bash
git clone https://github.com/dumoulinjorisjd-stack/alize-prototype.git
cd alize-prototype/capacitor
npm install
npx cap sync ios
cd ios/App && pod install && cd ../..
```

## Étape 2 — Identifiant d'app (App ID) + push, sur developer.apple.com

1. developer.apple.com → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**
2. **App IDs** → App → Bundle ID **explicite** : `fr.tiservices.app` — Description : Ti-Services.
3. Coche la capability **Push Notifications** → Register.

## Étape 3 — Clé APNs (pour que Firebase envoie les push)

1. Même console → **Keys** → **+** → nom `TiServices APNs` → coche
   **Apple Push Notifications service (APNs)** → Continue → Register.
2. **Télécharge le fichier .p8** (une seule fois possible !) et note le **Key ID**
   et ton **Team ID** (en haut à droite de la console).
3. **Console Firebase** (projet t-service-prod) → ⚙️ Paramètres du projet →
   **Cloud Messaging** → section **Configuration de l'application Apple** →
   **Importer** la clé .p8 + Key ID + Team ID.

## Étape 4 — GoogleService-Info.plist

1. Console Firebase → ⚙️ Paramètres du projet → **Général** → **Ajouter une app** → **iOS**.
2. Bundle ID : `fr.tiservices.app` → Enregistrer → **télécharge `GoogleService-Info.plist`**.
3. Ouvre `capacitor/ios/App/App.xcworkspace` dans Xcode, puis **glisse le fichier**
   dans le dossier `App/App` (coche « Copy items if needed », target App).

## Étape 5 — Réglages Xcode (1 minute)

Ouvre **App.xcworkspace** (pas .xcodeproj) :
1. Cible **App** → onglet **Signing & Capabilities** :
   - Team : ton compte ; « Automatically manage signing » coché.
   - Bundle Identifier : `fr.tiservices.app`.
   - **Push Notifications** et **Background Modes → Remote notifications** doivent
     déjà apparaître (fichier de droits et Info.plist du dépôt). S'ils manquent :
     **+ Capability** pour chacun.
2. Onglet **General** : Display Name `Ti-Services`, Version `1.0.0`, Build `1`
   (à augmenter à chaque nouvel envoi). Supported Destinations : **iPhone** seul.
3. **App Icons** : l'icône 1024 × 1024 sans transparence est déjà dans
   `Assets.xcassets` → AppIcon. Vérifier qu'elle s'affiche.

## Étape 6 — Tester sur ton iPhone (à cocher une par une)

Branche l'iPhone au Mac → sélectionne-le comme destination → **▶ Run**. Puis :
- [ ] L'app charge ti-services.fr en plein écran ; « Installer l'application »
      n'apparaît pas ; aucun bouton Google.
- [ ] **Mode avion** puis lancer l'app : la page « Pas de connexion Internet » avec
      « Réessayer » ; réseau rétabli : le site revient seul.
- [ ] Une commande : « Je suis sur place » demande la position avec le message de
      Ti-Services ; refuser, puis saisir l'adresse à la main : ça marche aussi.
- [ ] Ajouter une photo : « Prendre une photo » (appareil photo) et « Photothèque »
      demandent l'autorisation avec le message de Ti-Services, sans planter.
- [ ] Profil → « Activer les notifications » : la demande iOS apparaît à ce moment-là,
      pas au lancement ; une mission test notifie.
- [ ] Paiement d'une commande réelle de faible montant : la page Mollie s'ouvre et
      revient dans l'app.
- [ ] Compte prestataire → « Connecter mon agenda Google » : la page Google s'ouvre
      dans Safari (Google refuse les fenêtres intégrées) ; revenir à l'app ensuite.
- [ ] Les deux comptes de démonstration : commande simulée, conversation, Signaler,
      Bloquer ; demande d'exemple côté prestataire.
- [ ] Sur un compte de test jetable : Profil → « Supprimer mon compte » va au bout.

## Étape 7 — App Store Connect (fiche)

1. appstoreconnect.apple.com → **Apps** → **+** → Nouvelle app :
   iOS · Nom **Ti-Services** · français · Bundle ID `fr.tiservices.app` · SKU `tiservices-ios`.
2. Renseigne la fiche avec le contenu de **`fiche-appstore.md`** (textes prêts).
3. **Confidentialité** : URL `https://ti-services.fr/legal/confidentialite.html` +
   questionnaire App Privacy, **classification par âge** et **statut de commerçant
   (DSA)** : réponses dans fiche-appstore.md.
4. **Captures d'écran** : déjà prêtes dans `captures-appstore/` (6,9" 1320×2868 et
   6,3" 1206×2622, vrais écrans, comptes de démonstration).

## Étape 8 — Envoyer le build + soumettre

1. Xcode : destination **Any iOS Device (arm64)** → menu **Product → Archive**.
2. Fenêtre Organizer → **Distribute App** → **App Store Connect** → Upload.
3. Dans App Store Connect : le build apparaît (~15 min) → **TestFlight** pour
   l'essayer en réel, puis onglet **App Store** → sélectionne le build →
   **Soumettre pour examen**.
4. Examen Apple : 1 à 3 jours en général. Si question de l'examinateur sur le
   contenu web : la réponse type est dans fiche-appstore.md (§ Notes examinateur).

## Mises à jour ensuite

Le contenu vient de ti-services.fr → **les mises à jour du site sont instantanées
dans l'app, sans repasser par Apple**. On ne re-soumet un build que pour changer
la coquille (icône, plugins, réglages natifs) : incrémenter Version/Build → Archive
→ Upload → Soumettre.

## Version minimale d'iOS

Le projet vise **iOS 15.0**. Cette valeur vit à DEUX endroits qui doivent rester
alignés : `platform :ios` dans le `Podfile`, et les quatre
`IPHONEOS_DEPLOYMENT_TARGET` du projet Xcode. N'en changer qu'un laisse les Pods
compilés pour l'ancienne cible, et l'avertissement revient à la validation.

Apple refuse tout envoi visant moins de 15.0 **à partir du printemps 2027**.
Après un `git pull` qui touche à ces valeurs :
`cd capacitor/ios/App && pod install` avant de réarchiver.

## Dépannage rapide

- **Build échoue « No such module FirebaseCore »** → `pod install` pas fait, ou
  ouvert `.xcodeproj` au lieu de `.xcworkspace`.
- **Crash au lancement** → `GoogleService-Info.plist` manquant (étape 4).
- **Pas de notifications** → clé APNs pas importée dans Firebase (étape 3), ou
  capability Push absente (étape 5).
- **Boutons Google visibles dans l'app** → vieux cache : tirer pour rafraîchir.
