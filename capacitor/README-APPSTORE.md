# Ti-Services sur l'App Store — guide complet (compte particulier)

Ce dossier contient la **coquille native iOS** (Capacitor) : une vraie app App Store
qui charge `https://ti-services.fr` avec le **push natif** (APNs → FCM). Le serveur
envoie déjà via FCM : les jetons natifs arrivent dans les mêmes collections
(`users.pushTokens`, `fcmOwners`) — **aucun changement côté Cloud Functions**.

Le site détecte la coquille (`isNativeShell()` dans `index.html`) : il masque
« Installer l'application » et les boutons Google (bloqués par Google en WebView),
et les notifications passent par le plugin natif.

---

## Prérequis (une fois)

1. **Compte Apple Developer actif** (particulier, 99 $/an) — e-mail « Welcome » reçu.
2. **Un Mac avec Xcode** (App Store → Xcode, gratuit, ~15 Go). Connecte-toi dans
   Xcode → Settings → Accounts avec ton identifiant Apple.
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

## Étape 5 — Réglages Xcode (2 minutes)

Ouvre **App.xcworkspace** (pas .xcodeproj) :
1. Cible **App** → onglet **Signing & Capabilities** :
   - Team : ton compte ; « Automatically manage signing » coché.
   - Bundle Identifier : `fr.tiservices.app`.
   - **+ Capability** → **Push Notifications**.
   - **+ Capability** → **Background Modes** → coche *Remote notifications*
     (normalement déjà présent via Info.plist).
2. Onglet **General** : Display Name `Ti-Services`, Version `1.0.0`, Build `1`.
3. **App Icons** : dans `Assets.xcassets` → AppIcon, glisse l'icône 1024×1024
   (utiliser `icon-512.png` du repo agrandi, ou l'export 1024 de la charte —
   PAS l'icône beta).

## Étape 6 — Tester sur ton iPhone

1. Branche l'iPhone au Mac → sélectionne-le comme destination → **▶ Run**.
2. Vérifie : l'app charge ti-services.fr plein écran ; le bouton « Installer
   l'application » n'apparaît PAS ; « Activer les notifications » (profil) déclenche
   la demande système iOS ; après acceptation, une mission test doit notifier.

## Étape 7 — App Store Connect (fiche)

1. appstoreconnect.apple.com → **Apps** → **+** → Nouvelle app :
   iOS · Nom **Ti-Services** · français · Bundle ID `fr.tiservices.app` · SKU `tiservices-ios`.
2. Renseigne la fiche avec le contenu de **`fiche-appstore.md`** (textes prêts).
3. **Confidentialité** : URL `https://ti-services.fr/?legal=confidentialite` +
   questionnaire (réponses dans fiche-appstore.md).
4. **Captures d'écran** obligatoires : iPhone 6,7" (1290×2796) et 6,5" (1284×2778) —
   fais-les depuis le simulateur Xcode (iPhone 15 Pro Max : ⌘S).

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

## Dépannage rapide

- **Build échoue « No such module FirebaseCore »** → `pod install` pas fait, ou
  ouvert `.xcodeproj` au lieu de `.xcworkspace`.
- **Crash au lancement** → `GoogleService-Info.plist` manquant (étape 4).
- **Pas de notifications** → clé APNs pas importée dans Firebase (étape 3), ou
  capability Push absente (étape 5).
- **Boutons Google visibles dans l'app** → vieux cache : tirer pour rafraîchir.
