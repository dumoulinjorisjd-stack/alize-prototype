# Réponse au retour d'Apple du 14/08/2026 — « Guideline 2.1 — Information Needed »

Apple n'a pas trouvé de défaut : il demande sept informations, à envoyer EN RÉPONSE dans
App Store Connect (Distribution → la soumission → « Répondre à l'équipe de vérification
des apps ») ET à recopier dans App Review Information → Notes pour les soumissions
suivantes. Texte en anglais ci-dessous, à copier-coller tel quel après avoir rempli les
[crochets]. Les mots de passe ne s'écrivent JAMAIS ici (dépôt public) : ils se saisissent
directement dans App Store Connect.

Tout ce qui est écrit doit être VRAI : chaque phrase a été vérifiée contre le code
(services externes relevés dans `index.html` et `functions/index.js` le 26/11/2026).

---

## Déroulé de la vidéo (point 1) — à filmer sur l'iPhone, 3 minutes environ

Avant : affichage standard (Réglages → Luminosité et affichage → Zoom de l'écran → Par
défaut), mode Ne pas déranger, l'app SUPPRIMÉE puis réinstallée depuis TestFlight pour
que les demandes d'autorisation apparaissent. Enregistrement : Centre de contrôle → bouton
d'enregistrement de l'écran (micro coupé).

1. Lancer l'app depuis l'écran d'accueil de l'iPhone (on voit l'icône Ti-Services).
2. Client — **inscription** : « Je cherche un service » → créer un compte jetable
   (prénom, e-mail, mot de passe, acceptation des CGU).
3. **Commande** : choisir un service (ex. Ménage), date et heure, adresse ;
   « Je suis sur place » → la **demande de position** d'iOS apparaît → Autoriser ;
   ajouter une photo → « Prendre une photo » → la **demande d'appareil photo** apparaît →
   Autoriser, prendre la photo.
4. **Paiement** : montrer l'écran de paiement (carte, payée APRÈS la prestation) sans
   valider un vrai paiement — ou avec le compte de démonstration, où la commande est
   simulée.
5. **Déconnexion**, puis **connexion** avec le compte de démonstration client :
   la commande en cours, la conversation ; envoyer un message normal ; tenter un
   message injurieux → refusé ; montrer **Signaler** et **Bloquer**.
6. Déconnexion, connexion avec le compte de démonstration **prestataire** : la demande
   d'exemple, **Accepter**, la conversation, Signaler / Bloquer.
7. Déconnexion, reconnexion avec le compte jetable de l'étape 2 : Profil →
   **Supprimer mon compte** jusqu'au bout ; tenter de se reconnecter → refusé.

---

## Texte de la réponse (anglais)

Hello,

Thank you for your review. Please find below the information requested.

**1. Screen recording**
Attached: a screen recording made on a physical iPhone, starting from the app launch. It
shows account registration, login, an order with the location and camera permission
prompts, the payment step, user-generated content (messaging) with the content filter,
Report and Block, the provider side, and account deletion.

**2. Devices tested**
- iPhone mini, iOS 27 (physical device, Xcode 26.3 and TestFlight)
- Layouts also checked in a browser at every current iPhone screen width, from 320
  points (Display Zoom) to 440 points.

**3. What the app does, for whom, and why**
Ti-Services is a local marketplace for home services on the island of Saint-Barthélemy
(French West Indies): cleaning, gardening, babysitting, hairdressing at home, small
repairs, pet sitting, parcel pick-up. Adult residents and visitors order a service in a
few steps; verified local providers (self-employed, registered businesses) accept it and
carry it out at the client's home.
The problem it solves: on a small island, finding an available, trustworthy provider is
done by word of mouth, and addresses are often imprecise. Ti-Services gives clients
providers whose identity, business registration (SIRET) and professional insurance are
checked before activation, a precise GPS point of the address, real-time tracking
(accepted, started, finished), payment only once the service is done, and an automatic
invoice. Providers receive requests in real time, get paid automatically and their
invoicing is done for them.

**4. How to access the main features**
Login is required. Two sandboxed demo accounts (passwords in the App Review Information
fields):
- Client: demo.client@ti-services.fr — an order is already in progress with its
  conversation. Placing a new order is simulated: no payment is taken and a demo provider
  accepts it after two seconds, which opens the conversation.
- Provider: demo.prestataire@ti-services.fr — it sees one sample request. Accepting it
  writes nothing and opens the conversation with the demo client. It never sees real
  clients' requests.
Main features: Home → choose a service → date, time, address and GPS point → confirm.
Bookings tab: orders, conversation, invoice. Profile tab: details, payment method,
addresses, language (FR / EN / PT), account deletion.
Messaging: in every conversation, "Signaler" (Report) and "Bloquer" (Block). Messages
containing insults, slurs or threats are refused before they are sent (French, English,
Portuguese). Our Terms of Use (article 7.6) state zero tolerance for objectionable
content or abusive users; reports sent to contact@ti-services.fr are reviewed within
24 hours, the content is removed and its author suspended or excluded.

**5. External services**
- Google Firebase: authentication, database (Cloud Firestore), server functions, file
  storage, web hosting, push notifications (Firebase Cloud Messaging → APNs).
- Mollie: card payments for the physical services, and payouts to providers.
- Infomaniak: transactional e-mails (confirmations, invoices, password reset).
- OpenStreetMap: map tiles used to place the GPS point of the address.
- French government business directory (recherche-entreprises.api.gouv.fr): checks the
  SIRET number of providers.
- Google Calendar API: optional, for providers who choose to sync their availability.
No advertising, no analytics or tracking SDK, no AI service.

**6. Regional differences**
The app is distributed in France only and the service area is Saint-Barthélemy. All
features are identical in the three available languages (French, English, Portuguese).

**7. Regulated industry**
Home services are not a regulated industry. Providers are independent businesses; our
team checks their identity document, business registration (SIRET) and professional
insurance before their account is activated. Payments for these physical services are
processed by Mollie, a regulated European payment service provider (Guideline
3.1.3(e): physical services consumed outside the app; no digital goods, no
subscriptions, no in-app content for sale). The optional tip is passed on to the
provider minus our commission covering card and handling fees.

Account deletion (Guideline 5.1.1(v)): Profile → "Supprimer mon compte", for clients and
providers. Invoices already issued are kept for the legal period, as stated in our
privacy policy.

Best regards,
[Joris DUMOULIN] — C.C.S, publisher of Ti-Services
