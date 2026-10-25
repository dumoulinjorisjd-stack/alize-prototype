# Inscrire un prestataire chez Mollie depuis la console

*Relevé et écrit le 24/10/2026. Ce qui suit est MESURÉ dans le code et dans la
spécification publiée par Mollie, sauf les trois questions de la fin, qui sont
précisément ce qu'on ne peut pas mesurer d'ici.*

## Le défaut qu'on corrige

Le serveur ne créait **aucun** compte Mollie. Le lien de départ mène à
`oauth2/authorize`, qui **autorise une organisation existante**. Un prestataire
qui n'en a pas arrive donc sur un écran de consentement dont le bouton
« Connecter » reste **gris** — il n'a rien à connecter. C'est ce qui est arrivé
en production, et le texte de l'application parlait pourtant du « compte Mollie
créé pendant l'activation » : un compte que rien ne créait.

Le guide pas à pas donne les bonnes réponses à copier — mais copier-coller chez
Mollie reste **créer un compte chez Mollie**, et c'est là que tout le monde bute.

## Ce qui est livré

**Deux boutons, un de chaque côté, et le prestataire n'en voit qu'un.**

*Console, fiche d'un prestataire sans compte Mollie :*

1. **« Préparer son compte Mollie »** — ne fait **RIEN** chez Mollie. Il lit la
   fiche et rend ce qui *partirait* : prénom, nom, adresse électronique, raison
   sociale, voie, code postal, commune, SIRET.
2. Un **pays à confirmer**, sans aucun défaut (voir plus bas).
3. **« Créer chez Mollie »** — n'apparaît que si la fiche est complète **et** le
   pays choisi. Crée le compte, préremplis, et le mémorise sur la fiche.

*Profil du prestataire :* **rien ne change.** Son bouton « Activer mes
paiements » ouvre le parcours préparé si la console lui en a fait un, sinon le
lien d'autorisation d'aujourd'hui. Une seule porte, deux sources — il n'a pas à
savoir laquelle des deux situations est la sienne.

## Ce que le client link NE préremplit PAS

Relevé dans `CreateClientLinkRequest` : la charge utile ne porte que `owner`,
`name`, `address`, `registrationNumber`, `vatNumber`. **Donc Mollie demandera
encore** le site web, la description de l'activité et l'IBAN. Le guide pas à pas
reste utile pour ces trois-là et n'est pas retiré.

`vatNumber` est laissé vide : **aucune fiche du parc ne porte de numéro de TVA**
(zéro occurrence relevée), et en inventer un serait une fausse déclaration à un
établissement de paiement.

## Le pays : la France — mesuré, pas supposé

**Relevé le 25/10/2026 dans le compte Mollie de Ti-Services** : une entreprise
de Saint-Barthélemy y est enregistrée en **France**. C'est la réponse, et elle
vient de la même juridiction que les prestataires. La France est donc proposée,
et le sélecteur reste modifiable (`BL` disponible).

Ce qui ne change pas : l'écran **dit d'où vient la réponse**, pour que personne
ne la croie devinée, et le serveur refuse toujours un code qui n'est pas deux
lettres. C'était la question ouverte du lot précédent — une entreprise déclarée
au mauvais pays se découvre au contrôle d'identité, des jours plus tard, et
c'est la même prudence qui a fait refuser « Saint-Marin » à qui cherchait
Saint-Martin.

## Et s'il a DÉJÀ un compte Mollie non relié ?

**On ne sait pas** ce que Mollie fait si on envoie quelqu'un qui a déjà un compte
vers un lien préparé : l'autorise-t-il sur son organisation existante, ou en
crée-t-il une **seconde**, préremplie ? `docs.mollie.com` est refusé depuis le
conteneur et le code publié par Mollie n'en dit rien — relevé, y compris dans ses
propres épreuves. Deux comptes Mollie pour un prestataire, dont un seul reçoit
les versements, serait le pire résultat possible.

**On rend donc la question sans conséquence**, sur les deux bords :

- **La console POSE le fait** avant de créer : « demandez-lui d'abord, a-t-il déjà
  un compte Mollie ? ». Rien dans sa fiche ne le dit, et Mollie ne répond pas à
  cette question sur une adresse (ce serait un outil d'énumération de comptes) :
  lui seul le sait, et l'administrateur l'a au téléphone.
- **Son écran garde la porte qui relie** : sous le bouton principal, « J'ai déjà
  un compte Mollie, le relier » redemande explicitement le chemin
  d'autorisation, quoi qu'on ait préparé pour lui. Le paramètre ne peut que
  **restreindre** — l'uid vient toujours de l'authentification.

Donc : si tu lui prépares un compte par erreur, **il s'en sort tout seul en un
toucher**, et rien n'est à défaire.

## Si Mollie refuse

Rien n'est cassé : le prestataire garde le chemin d'aujourd'hui, et le **motif du
refus est affiché tel quel** dans la console. C'est lui qui se porte à Mollie.
Le jour où Mollie répond oui, le bouton s'allume **sans nouvelle mise en ligne**.

## Ce que Mollie a répondu, le 25/10/2026

Le bouton a été pressé en production, sur la fiche d'une prestataire. Mollie a
refusé, et son motif est la réponse aux deux questions qui restaient :

> Not all required permissions (**clients.write**) for accessing this resource
> were granted.

**CE N'EST PAS UN REFUS D'ACCÈS À LA FONCTION.** Mollie ne dit ni « inconnu »,
ni « réservé aux partenaires », ni « bêta fermée » : il nomme une PERMISSION
manquante sur le jeton présenté. La requête a donc été comprise, et la ressource
existe pour nous.

**ET LE JETON D'ORGANISATION NE SUFFIT PAS.** `mollieApi` présente
`process.env.MOLLIE_ACCESS_TOKEN` en `Bearer` : c'est ce jeton-là qui ne porte
pas `clients.write`. Rien à changer dans le code — la charge utile, l'adresse et
la méthode sont bonnes, c'est l'autorisation qui manque.

**CE QU'IL RESTE À FAIRE, ET QUI N'EST PAS DANS L'APPLICATION :**

1. Dans le tableau de bord Mollie, regarder le jeton que nous employons (jeton
   d'organisation / clé d'API) et voir si **`clients.write`** — et sans doute
   `clients.read` avec lui — peut lui être accordé. Les jetons d'organisation se
   créent avec une liste de permissions à cocher.
2. Si la permission est proposée : créer un jeton qui la porte, et remplacer le
   secret `MOLLIE_ACCESS_TOKEN` (`firebase functions:secrets:set
   MOLLIE_ACCESS_TOKEN --project t-service-prod`, puis redéployer les fonctions
   — un secret est attaché au déploiement). **Le jeton ne se colle jamais dans
   une conversation.**
3. Si elle n'est PAS proposée, c'est qu'elle est réservée au programme
   partenaire : c'est à Mollie qu'il faut la demander, en citant ce motif.

**ET SI LA PERMISSION N'ARRIVE JAMAIS, rien n'est à défaire** : le prestataire
garde le parcours d'aujourd'hui, celui qui relie un compte Mollie existant, et
la console affiche le motif au lieu de prétendre avoir créé quelque chose.

## La question qui reste

**Saint-Barthélemy** : la liste de Mollie ne le propose pas. L'éditeur a mesuré
le 25/10/2026 dans son propre compte qu'une entreprise de Saint-Barthélemy y est
enregistrée en **France** ; c'est ce que la console propose, et cela reste
modifiable. Ce qu'un contrôle d'identité Mollie en dira n'a pas encore été
éprouvé.

## Et quelqu'un qui a DÉJÀ un compte Mollie ?

Il le relie, et c'est ce qui marche depuis toujours : son bouton mène à l'écran
de consentement, il se connecte à **son** compte, l'écran nomme son organisation,
il valide. `approval_prompt=force` fait que l'écran s'affiche **toujours** — une
validation silencieuse avait relié par erreur le compte déjà ouvert sur
l'appareil. Et si c'est l'organisation de Ti-Services qui se relie, un garde-fou
serveur la refuse (`wrong-account`) plutôt que de le marquer actif à tort.
