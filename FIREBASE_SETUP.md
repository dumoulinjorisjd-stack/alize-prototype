# Ti-Services — mise en place de la bêta (Phase 1)

Objectif : passer du **prototype simulé** à une **vraie bêta** que tu testes seul —
comptes réels, données qui persistent, flux demande → acceptation → validation.

Stack : **Firebase** (Auth + Firestore), hébergée sur l'URL GitHub Pages actuelle.
**Aucun paiement réel** en Phase 1, **aucune facturation** (quota gratuit).

---

## 1. À faire par toi dans la console Firebase (~10 min)

Sur <https://console.firebase.google.com> :

1. **Créer un projet** — ex. `ti-services-beta` (Analytics facultatif).
2. **Authentication → Get started → Sign-in method** : activer
   - **Google**
   - **E-mail/Mot de passe → Email link (sign-in without password)** (lien magique).
3. **Firestore Database → Créer une base** — mode *production*, région `eur3`
   (ou `europe-west`).
4. **Authentication → Settings → Authorized domains → Add domain** :
   ajouter `dumoulinjorisjd-stack.github.io`.
5. **Paramètres du projet ⚙️ → Général → Tes applications → Web (`</>`)** :
   enregistrer l'app, puis récupérer l'objet **`firebaseConfig`**.

### À me renvoyer
- L'objet `firebaseConfig` complet (apiKey, authDomain, projectId, appId…).
  *(Ces clés ne sont pas secrètes : elles sont destinées au client web. La sécurité
  repose sur les règles Firestore + les domaines autorisés.)*
- L'**e-mail** avec lequel tu te connecteras → il servira de compte **admin**.

---

## 2. Règles de sécurité

Le fichier [`firestore.rules`](./firestore.rules) contient les règles de la bêta
(cloisonnement par compte, validation des artisans par l'admin, « premier arrivé
premier servi », messagerie privée).

Avant de les publier, **remplacer** dans `firestore.rules` l'adresse
`ADMIN_EMAIL_A_REMPLACER@gmail.com` par ton e-mail admin (je le ferai dès que tu me
le donnes).

Publication (au choix) :
- **Simple** : Firestore → onglet *Rules* → coller le contenu → *Publier*.
- **CLI** : `firebase deploy --only firestore:rules` (nécessite `firebase-tools`).

---

## 3. Modèle de données (Firestore)

| Collection | Contenu |
|---|---|
| `users/{uid}` | Profil : nom, e-mail, téléphone, zone, rôle(s). |
| `artisans/{uid}` | Dossier prestataire : services, tarif, SIRET, assurance, statut (`attente`/`valide`/`refuse`), fidélité. |
| `requests/{id}` | Demande : client, service, offre, créneau, adresse, notes, statut, prestataire assigné. |
| `requests/{id}/messages/{id}` | Messagerie à numéro masqué (client ↔ prestataire). |

---

## 4. Ensuite (à ma charge)

Une fois le `firebaseConfig` reçu : j'ajoute le SDK Firebase, l'écran de connexion
(Google + lien e-mail), et je branche l'onboarding, les demandes, l'acceptation, la
messagerie et la console admin sur Firestore. Puis on teste en ligne.

**Phases suivantes** : Cloud Functions + Mollie (paiement séquestré), notifications push.
