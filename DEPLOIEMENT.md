# Ti-Services — mise en ligne & bascule de domaine

Ce guide prépare la mise en ligne **sans domaine pour l'instant**, tout en rendant
le passage au vrai nom de domaine **trivial** le moment venu — sans jamais perdre
de compte.

---

## Le principe à retenir (important)

> **Les comptes ne sont PAS liés au domaine. Ils vivent dans le projet Firebase.**

Un compte (client, artisan, admin) est stocké dans **Firebase Authentication**, qui
appartient au **projet Firebase** (`Ti-Service`), pas à l'adresse web. Conséquence :

- On peut changer d'URL (GitHub Pages → `*.web.app` → `ti-services.fr`) **sans perdre
  un seul compte**, tant qu'on garde **le même projet Firebase**.
- Le domaine ne sert qu'à **héberger la page** et à **autoriser les connexions**
  (liste des « domaines autorisés » côté Firebase Auth + URL de retour des liens
  e-mail / Google).

Donc la règle d'or : **un seul projet Firebase, dès le départ.** Le reste est
réglable en quelques clics.

---

## Ce qui est déjà prêt côté code (rien à refaire au changement de domaine)

- ✅ **Chemins relatifs partout** (`manifest.webmanifest`, `sw.js`, icônes) → l'app
  fonctionne à l'identique sur n'importe quelle adresse, y compris en sous-dossier.
- ✅ **Aucune URL du domaine en dur** dans le code (vérifié). Les seuls liens
  externes sont WhatsApp, Google Maps et `mailto:` — indépendants du domaine.
- ✅ **Un seul point de configuration** en haut de `index.html` :

  ```js
  const CONFIG = {
    appName: 'Ti-Services',
    siteUrl: '',                     // ← LE jour J : 'https://ti-services.fr'
    supportEmail: 'bonjour@ti-services.fr',
    adminEmail: '',                  // compte admin (bêta)
    firebase: null                   // objet firebaseConfig (bêta)
  };
  ```

  Les liens absolus (partage, parrainage, lien e-mail de connexion) sont construits
  via `siteBase()` : ils utilisent `siteUrl` si défini, sinon l'adresse courante.
  **Changer de domaine = changer cette seule ligne `siteUrl`.**

- ✅ **`firebase.json`** contient déjà la config **Hosting** (en plus de Firestore) :
  prêt pour `firebase deploy --only hosting` et pour l'ajout d'un domaine
  personnalisé.

---

## Étape 1 — Maintenant, sans domaine : passer sur Firebase

Objectif : héberger l'app **et** activer les vrais comptes, sur une URL provisoire
**gratuite et stable** fournie par Firebase (`https://<projet>.web.app`). Les comptes
créés là resteront valides après l'achat du domaine.

1. **Récupérer le `firebaseConfig`** du projet `Ti-Service`
   (Console Firebase → ⚙️ Paramètres → Général → Vos applications → Web).
2. Me l'envoyer **avec l'e-mail admin** → je branche Auth + Firestore (cf.
   `FIREBASE_SETUP.md`) et je renseigne `CONFIG.firebase` + `CONFIG.adminEmail`.
3. Déploiement de l'hébergement :
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use ti-service-XXXX          # l'ID de ton projet
   firebase deploy --only hosting,firestore:rules
   ```
   L'app est alors en ligne sur **`https://ti-service-XXXX.web.app`** (SSL inclus).
4. Firebase Auth → **Settings → Authorized domains** : vérifier que
   `ti-service-XXXX.web.app` (et `localhost`) y figurent.

> À partir d'ici, on peut tester la bêta avec de vrais comptes. Tout ce qui est créé
> reste rattaché au projet.

---

## Étape 2 — Le jour J : brancher le vrai domaine (≈ 15 min + propagation DNS)

Une fois `ti-services.fr` (ou autre) acheté :

1. **Firebase Hosting → Ajouter un domaine personnalisé** → saisir le domaine →
   Firebase donne **2 enregistrements DNS** (A / TXT) à créer chez le registrar.
   Le certificat **SSL est automatique** (quelques heures).
2. **Firebase Auth → Settings → Authorized domains → Add domain** : ajouter
   `ti-services.fr` (et `www.` si utilisé). ← *c'est ce qui « lie » les connexions
   au domaine ; les comptes existants continuent de marcher.*
3. Dans `index.html`, mettre **`CONFIG.siteUrl = 'https://ti-services.fr'`**
   (seule ligne de code à changer). Cela met à jour les liens de partage/parrainage,
   l'URL canonique, et l'URL de retour des liens e-mail de connexion.
4. Si connexion **Google / lien e-mail** : vérifier que l'URL de redirection /
   `continueUrl` pointe bien vers le nouveau domaine (elle dérive de `siteBase()`).
5. `firebase deploy --only hosting` → redéployer.

**L'ancienne URL `*.web.app` continue de fonctionner en parallèle** : aucune coupure,
aucun compte perdu, aucune migration de données.

---

## Aide-mémoire « qui est lié à quoi »

| Élément | Rattaché à | Impact d'un changement de domaine |
|---|---|---|
| Comptes (client/artisan/admin) | **Projet Firebase** | ❌ aucun — ils restent |
| Données (demandes, messages…) | **Projet Firebase (Firestore)** | ❌ aucun |
| Paiements / tokens carte | **Prestataire (Mollie)** | ❌ aucun |
| Domaines autorisés (connexion) | Firebase Auth | ✅ ajouter le nouveau domaine |
| URL de la page / liens partagés | `CONFIG.siteUrl` | ✅ 1 ligne à changer |
| Hébergement | Firebase Hosting | ✅ ajouter le domaine + DNS |

---

## Ce qu'il me faut de ta part pour avancer

1. Le **`firebaseConfig`** du projet `Ti-Service`.
2. L'**e-mail admin** (le compte qui aura les droits d'administration).

Avec ça je branche la bêta sur l'URL `*.web.app`, et le jour où tu as le domaine,
la bascule se fait avec la checklist « Étape 2 » ci-dessus.
