# La vidéo de présentation

`ti-services.mp4` — **1080 × 1920**, 25 im/s, ~52 s, sans son.
Format vertical : Instagram/Facebook Reels, statut WhatsApp, TikTok.

## Ce qu'elle montre

Un massage à Lorient, de bout en bout, **avec les vrais écrans de l'application** :

1. le besoin — « Envie d'un massage. Aujourd'hui. »
2. ce que fait une petite annonce — et où ça s'arrête
3. côté client — l'accueil, le choix de la prestation, « Aucun débit maintenant »
4. côté prestataire — la demande arrive, elle accepte, elle est payée et facturée
5. ce qu'une annonce ne fera jamais — validation, paiement, documents
6. la marque et l'adresse

L'argument est celui-là, et un seul : **un site d'annonces vous laisse là,
Ti-Services va jusqu'au paiement.**

## Refabriquer

    node outils/video/film.js                 # capture les écrans PUIS rend le film
    node outils/video/film.js --sans-capture  # rend le film, écrans inchangés
    node outils/video/scene.js                # recapture les écrans seuls

Il faut `ffmpeg` et le Chromium de Playwright. Le rendu prend ~2 min
(1 290 images), puis ffmpeg assemble.

## Comment c'est fait

**Les écrans sont les VRAIS.** `scene.js` ouvre l'application dans le harnais de
test, pose un état (Camille cliente, Léa masseuse, un massage à Lorient) et
photographie ce que son propre `render()` produit. Un écran qui changerait dans
l'app changerait dans la vidéo. Chaque capture est **gardée par une phrase** qui
doit s'y lire : si « Aucun débit maintenant » quittait l'écran de confirmation,
la capture échouerait au lieu de produire une vidéo qui dit autre chose que
l'app.

**Rien n'est retapé.** La palette, Zouti, les icônes et la silhouette de l'île se
lisent dans `index.html` (via `outils/cartes-visite.js`). La police est l'Inter
des cartes de visite.

**Le film est déterministe.** `film.html` porte une fonction `anime(t)` qui place
tout pour l'instant `t` : aucune transition CSS, aucun minuteur. On photographie
image par image, puis ffmpeg assemble. Deux rendus donnent le même fichier.
(Playwright sait filmer, mais son encodeur n'est pas installé ici.)

`ecrans/08-pro-agenda.png` n'est pas employé par le film : il est capturé pour
les affiches et les fiches de magasin, par la même porte et avec la même garde.

## Ce que la scène suppose — à savoir avant de publier

- **Tous les métiers sont ouverts** dans la grille d'accueil. Dans l'app, un
  métier n'est réservable que s'il a au moins un prestataire validé ; la vidéo
  montre l'application une fois le parc constitué.
- **Léa a un mois de missions derrière elle** (824,50 € de net) : c'est ce que
  l'écran Revenus additionne.
- `IS_PROD` et `isProdHost()` sont posés à vrai **dans une copie**, jamais dans
  le dépôt : sans cela l'app se croit en bêta et couvre ses écrans de
  « Démonstration » et de « BÊTA ». La vidéo montre le produit tel qu'il est
  servi sur ti-services.fr.
- Les montants (110 € le massage d'une heure, 93,50 € pour la prestataire) ne
  sont pas écrits dans la vidéo : ils viennent du catalogue et du taux de
  commission de l'application. Ils suivront si les tarifs changent.

## Ce que la vidéo N'affirme PAS, et pourquoi

Un premier jet annonçait « prestataires vérifiés **et assurés** ». C'est faux :
`draftInsDone` accepte `insuranceNone`, et `insPeutValider` laisse valider un
dossier dont l'assurance est « déclarée absente » — le commentaire du code le dit
en toutes lettres, c'est à l'éditeur de trancher au cas par cas. Une vidéo
publique ne peut pas promettre ce que le produit ne tient pas.

Ce qui EST vrai, et qui est dit à la place : **chaque prestataire est validé à la
main** avant de recevoir la moindre demande (`status === 'valide'` conditionne
tout), et son identité, son assurance et son statut sont **contrôlés** — l'état
de l'assurance est connu et arbitré, qu'elle soit validée, à vérifier, refusée ou
déclarée absente.

## Pas de musique

Aucune piste sonore n'est jointe : nous n'avons pas de licence. Sur les réseaux,
ajoutez la musique depuis l'éditeur de la plateforme (Instagram, TikTok), qui
fournit les droits. La vidéo se lit sans son — tout est écrit à l'image.
