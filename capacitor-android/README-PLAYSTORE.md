# Ti-Services sur le Play Store — la coquille Android

Même principe que la coquille iOS (`../capacitor/`) : une vraie application Android
qui charge `https://ti-services.fr` et reçoit les **notifications natives** (FCM).
Le site se sait dans une coquille (`isNativeShell()`) et masque en conséquence
« Installer l'application » et les boutons Google, que Google bloque en WebView.

**Les mises à jour du site sont instantanées dans l'application.** On ne reconstruit
un paquet que pour changer la coquille elle-même (icône, plugins, version d'Android
visée).

## Pourquoi un dossier séparé de `capacitor/`

La coquille iOS est figée sur Capacitor 6 — elle est en cours d'examen chez Apple et
on n'y touche pas. Le Play Store, lui, refuse toute nouvelle application qui ne vise
pas une version récente d'Android : il faut Capacitor 8 (`targetSdk 36`). Deux
projets, deux versions, aucune interférence. Quand l'examen Apple sera clos, les
deux pourront être réunis sur une seule version de Capacitor.

Ce qui doit rester identique entre les deux : `appId` (`fr.tiservices.app`),
`appName`, `appendUserAgent` et la liste `allowNavigation`.

## Ce que le dépôt ne contient pas, et ne contiendra jamais

- **`android/app/google-services.json`** — la configuration Firebase de l'app Android.
- **`android/app/ti-services-upload.jks`** — le magasin de clés de signature.

Les deux arrivent au moment du build, depuis les secrets GitHub. Sans eux, seul un
build de débogage est possible : c'est voulu.

## Secrets GitHub à créer (une seule fois)

Dépôt → Settings → Secrets and variables → Actions → *New repository secret*.

| Nom | Contenu |
|---|---|
| `ANDROID_GOOGLE_SERVICES_JSON_B64` | `google-services.json` encodé en base64 |
| `ANDROID_KEYSTORE_B64` | le fichier `.jks` encodé en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du magasin |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé |

## Construire un paquet

Onglet **Actions** → *Build Android (AAB Play Store)* → **Run workflow** → indiquer
le nom de version (ex. `1.0.0`). Le `versionCode` est le numéro du run : il augmente
tout seul, et Google refuse deux envois portant le même.

À la fin, l'AAB est téléchargeable dans les *Artifacts* du run. C'est ce fichier
qu'on dépose dans la console Play.

## Version d'Android visée

`variables.gradle` : `minSdkVersion 24` (Android 7, 2016) et `targetSdkVersion 36`.
Google impose de viser une version récente pour toute nouvelle application, et
resserre l'exigence chaque année au 31 août. Le jour où un envoi est refusé pour
cette raison, c'est `compileSdkVersion` et `targetSdkVersion` qu'il faut monter,
en même temps que Capacitor.

## Dépannage

- **Build échoue sur `google-services.json`** → le secret n'est pas posé, ou il a été
  collé avec un retour à la ligne au milieu.
- **Google refuse l'AAB : « versionCode déjà utilisé »** → relancer le workflow suffit,
  le numéro de run aura changé.
- **Pas de notifications sur Android** → l'app Android doit exister dans le projet
  Firebase `t-service-prod` avec le nom de paquet `fr.tiservices.app`, et
  l'empreinte SHA-256 de la clé de signature Play doit y être déclarée.
