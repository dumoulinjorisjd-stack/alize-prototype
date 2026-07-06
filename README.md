# Ti-Services — maquette (PWA)

Prototype cliquable et **installable** d'une application de **mise en relation de petits
services à la demande** à **Saint-Barthélemy** : ménage, garde d'enfants, jardinage…

Inspiré d'Uber, **sans géolocalisation** (inutile pour ce type de prestation) :

- le **client** enregistre une carte une fois et commande en deux gestes — il ne gère
  jamais le paiement (débit automatique et sécurisé, seulement après validation) ;
- l'**artisan** renseigne ses **disponibilités** (planning hebdo) et accepte ou non ;
- **premier arrivé, premier servi** : la mission part au premier artisan qui accepte ;
- le paiement est **bloqué en garantie (séquestre)** puis versé à l'artisan après
  validation, la plateforme prélevant une **commission de mise en relation (15 %)**.

## Tester / installer sur téléphone

C'est une **PWA** (Progressive Web App) : elle s'installe sur l'écran d'accueil.

1. Ouvrir l'URL du site sur le téléphone.
2. **Android / Chrome** : menu → « Installer l'application » (ou la bannière).
   **iPhone / Safari** : bouton **Partager** ⬆️ → « Sur l'écran d'accueil ».
3. L'app s'ouvre en plein écran, sans barre de navigateur, et fonctionne hors-ligne.

Basculer entre **Client** et **Artisan** (en haut) pour dérouler le scénario à deux faces.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'app (HTML + CSS + JS, aucun backend) |
| `manifest.webmanifest` | Manifeste PWA (nom, icônes, couleurs, mode standalone) |
| `sw.js` | Service worker (coquille hors-ligne) |
| `icon*.png`, `icon.svg` | Icônes de l'application |

> Données simulées, aucun paiement réel. Application indépendante — distincte du projet Archipel.
