# La vidéo Ti-Services

`ti-services.mp4` — 1080 × 1920, 25 i/s, **40 s**, sans son.
Format vertical : Instagram / TikTok / statut WhatsApp.

```bash
NODE_PATH=$PWD/node_modules node outils/video/film.js              # capture + rendu
NODE_PATH=$PWD/node_modules node outils/video/film.js --sans-capture   # rendu seul
```

---

## Ce que c'est

Une **bande-annonce**, pas une démonstration. Demandé dans cet ordre, et chaque
phrase a changé le film :

1. « mettre en situation un prestataire, masseuse, et un client qui recherche un
   massage, on doit voir l'intérêt et les **vrais écrans** de l'application » ;
2. « il n'y a pas de mise en scène, juste une succession d'écran » ;
3. « cela **reste** une succession d'écran, c'est ennuyeux » ;
4. « enlève les textes explicatifs et les messages en rouge » ;
5. « attention au texte de la vidéo qui s'empile sur les captures » ;
6. « on enchaîne ça façon grand film américain à suspense, une bande-annonce
   d'un film trépidant » ;
7. « l'idée est bien mais **trop de zoom et dézoom**, ça fait mal à la tête » ;
8. « n'hésite pas à **embellir la réalité** de l'application sur les visuels ».

Le premier jet était un diaporama : des écrans qui se succèdent dans un cadre
immobile, avec des légendes par-dessus. **Mesuré** : sur 48 secondes, trente
étaient « un écran change dans un téléphone immobile », la caméra ne bougeait
qu'ENTRE les plans, et les deux côtés se racontaient en deux blocs alors que
tout l'argument est qu'ils se passent EN MÊME TEMPS.

Ce qui est livré :

- **un monde**, large de 2 400 points — Camille à gauche (Lorient), Léa à droite
  (Gustavia), l'île entre les deux — et une **caméra** qui le parcourt ;
- **vingt-huit plans** de 0,7 à 2 s, dont **onze plans serrés** sur le chiffre
  qui compte : « 110,00 € », « 93,50 € », « 824,50 € » ;
- **zéro seconde de caméra figée** sur quarante (mesuré) ;
- **une seule focale de gros plan** pour tout le film (`Z_PRES`) : on entre une
  fois par acte, puis la caméra se **déplace** d'un repère à l'autre ;
- **six cartons pleins cadre** qui ponctuent, à la façon d'une bande-annonce — et
  qui cachent le déplacement de la caméra, de sorte que la coupe suivante tombe
  sur un cadre déjà en place ;
- **le plan qui porte le film** : la caméra recule, et la demande TRAVERSE l'île
  d'un téléphone à l'autre. C'est le seul plan long, et c'est volontaire : une
  bande-annonce accélère partout sauf à l'endroit qu'elle veut faire voir.

### Le tangage : pourquoi une seule focale

« L'idée est bien mais trop de zoom et dézoom, ça fait mal à la tête. » Ce qui
fatigue n'est pas le nombre de plans — une bande-annonce en a cent — c'est
l'**aller-retour** : entrer, ressortir, rentrer sur le même sujet. La coupe
précédente alternait plan large (z 1,00) et gros plan (z ≈ 2,00) **sept fois**,
chaque fois d'un facteur deux, et chaque plan de détail poussait encore de 2 %
avant de **retomber** à la coupe suivante — une scie.

On compte donc les **inversions de direction du zoom** sur tout le film, en
ignorant les variations qu'aucun œil ne lit (moins de 0,04), et `verifierTangage`
refuse au-delà de quatre. **Mesuré : 15 avant, 3 après** — et les trois disent
quelque chose : les bulles qui s'effondrent, la respiration avant la traversée,
et la poussée qui la referme.

Ce qui donne le rythme à la place : le **déplacement** d'un repère à l'autre à
focale constante (un transit d'un dixième de seconde est une coupe, pas un
mouvement), et surtout les **écrans qui changent sous le cadre** — quatre en huit
secondes pour Camille, trois pour Léa. C'est pour cela que chaque écran porte
désormais **deux ou trois repères** et non un seul : avec un seul point visé, il
fallait repasser en plan large entre deux gros plans, donc faire le yo-yo.

Le minutage, les points de regard et les textes sont dans `film.js`, en haut.

---

## Les écrans sont les vrais

`scene.js` ouvre l'**application réelle** dans le harnais des épreuves, la met
dans l'état voulu et la photographie en 1170 × 2532 (trois fois la dalle, ce qui
laisse de quoi pousser à 2,1 sans ramollir un pixel).

Rien n'est maquetté. La palette, le logo Zouti, les icônes et la silhouette de
l'île se **lisent** dans `index.html` ; les endroits où le doigt se pose sont
**relevés sur les écrans capturés** (`ecrans/reperes.json`), jamais écrits à la
main.

Ce que la scène suppose, et qui n'est pas l'état d'un compte ordinaire :

- tous les métiers sont ouverts (`SERVICES_OUVERTS`) ;
- Léa a un mois d'historique (sept massages, 824,50 € nets à 15 % de commission)
  et **trois demandes** dans son fil ;
- `IS_PROD` est forcé **dans une copie temporaire** du fichier, pour que les
  bandeaux « Démonstration » et « BÊTA » ne paraissent pas. `index.html` n'est
  jamais modifié.

### Embellir l'état, jamais le propos

« N'hésite pas à embellir la réalité de l'application sur les visuels, on vend
l'application, on ne fait pas une démo technique. » La frontière qu'on tient :
on met l'application dans son **meilleur état** — ce qu'un bon jour donne — et
on ne lui fait affirmer **rien de plus** qu'elle ne tient.

| mesuré sur la capture | ce qu'on a changé | ce que ça reste |
|---|---|---|
| le dixième pavé de l'accueil tombait en « Bientôt disponible », grisé, suivi d'une rangée de séparation | `colis` entre dans `SERVICES_OUVERTS` | un **état du marché** (un prestataire validé), qui change d'une semaine à l'autre. Les métiers et les prix affichés ne bougent pas d'un caractère. |
| « Missions disponibles · 1 », une carte, puis 470 px de blanc | trois demandes dans le fil de Léa | un marché à une seule offre ne donne envie à personne. Les trois montants sont ceux que son historique porte déjà, les trois actes ceux du catalogue de massage. |
| la demande acceptée restait **aussi** dans les disponibles, sous le même identifiant | ce qu'elle a pris n'est plus à prendre | c'est ce que l'app fait en vrai |
| l'écran de confirmation : un titre, une ligne, un bouton, **514 px de blanc — 62 %** | le bandeau « Aucun débit maintenant. » revient, sans ses quatre lignes de mécanisme | une épure qui vide l'écran qu'on vend coûte plus qu'elle ne rapporte |

Ce qui n'a **pas** été embelli : la ligne sur les prestataires assurés (voir
plus bas), et aucun chiffre, aucun tarif, aucune prestation inventés.

### L'épure des captures

« Tout ça est bien dans l'application, mais pas dans une vidéo. » On n'efface
rien de l'image : on met l'application dans l'état où ces blocs ne paraissent
pas. La liste est déclarée dans `scene.js` (`EPURE`), chaque ligne avec sa
raison, et **une garde refuse une entrée qui ne rencontre plus personne** — une
liste de sélecteurs se périme en silence au premier renommage de classe.

| retiré | pourquoi |
|---|---|
| `.notifcta` | la relance « activer les notifications » : qui se sert de l'app les a déjà activées |
| `.trust` | la rangée de réassurance de l'accueil (voir plus bas) |
| `.zouti-line` | la phrase de l'assistant : elle s'adresse à qui regarde, pas à qui est filmé |
| `p.mini` | les mentions en petits caractères, illisibles sur un téléphone filmé |
| `p.sub` **de plus de 44 signes** | un sous-titre explicatif — mais pas « De quel service avez-vous besoin ? », qui est la question qui porte l'écran |
| `[data-act="pro-mollie"]` | la carte d'état du dossier de paiement : une mise en route, pas le produit |
| les quatre lignes sous « **Aucun débit maintenant.** » | le chapeau **reste** — c'est lui qui vend l'écran ; seul son mode d'emploi part, et il passe sur un **carton plein cadre**, où il se lit vraiment |

Ce qui reste est ce qui porte le film : les prix, les boutons, les montants, les
cartes de mission.

---

## Ce que la vidéo N'AFFIRME PAS, et pourquoi

Un premier jet annonçait des prestataires « vérifiés **et assurés** ». **Le
produit ne le tient pas** : `draftInsDone` accepte `insuranceNone`,
`insPeutValider` laisse passer le statut `'aucune'`, et la console
d'administration porte un bouton nommé **« Valider sans assurance »**. Un dossier
reste donc complet avec une assurance déclarée **absente**.

La vidéo dit ce qui est vrai : **« Chaque prestataire est validé à la main —
identité, assurance, statut : contrôlés avant qu'il reçoive une seule
demande. »** Contrôlé n'est pas détenu.

`verifierPromesses()` dans `film.js` **refuse de fabriquer le film** si une
tournure de surengagement y reparaît, et porte son assertion arrière.

> **À décider par l'éditeur, et ce n'est pas la vidéo.** L'application elle-même
> fait la promesse que la vidéo refuse, à trois endroits : la rangée de
> réassurance de l'accueil (« Prestataires assurés »), son dépliant (« Chaque
> prestataire justifie d'une RC pro vérifiée ») et le paragraphe public indexé
> par Google (« prestataires **vérifiés et assurés** », `index.html:1719`). Les
> CGU, elles, sont justes : l'Intervenant *déclare* détenir une RC pro — une
> déclaration n'est pas une vérification. Soit le texte change, soit la
> validation sans assurance cesse. En attendant, l'épure tient cette rangée hors
> du film, et aucun plan ne la magnifie.

**Pas de musique** : aucune licence ici. À poser depuis l'éditeur de la
plateforme (Instagram, TikTok) au moment de publier — leurs bibliothèques sont
libres de droits pour un compte professionnel.

---

## Les gardes

Le film **refuse de se fabriquer** si l'une d'elles tombe. Chacune porte son
assertion arrière : une garde qui ne reconnaîtrait plus rien laisserait tout
passer en silence.

| garde | ce qu'elle refuse |
|---|---|
| `scene.js` · phrase par écran | une capture où le montant ou le libellé annoncé ne se lit plus |
| `scene.js` · repères visibles | un repère hors de l'image — un doigt qui désignerait du vide |
| `scene.js` · épure | une ligne d'épure qui ne rencontre plus aucun élément |
| `film.js` · `verifierPromesses` | une tournure de surengagement dans le film |
| `film.js` · `DETAIL_Z_MIN` + bornes | un plan de détail dont le cadre sort de la dalle |
| `film.js` · cadre hors cible | **un plan serré qui ne contient plus ce qu'il vise** |
| `film.js` · `verifierTangage` | **plus de quatre allers-retours de zoom sur le film** |
| `film.js` · `verifierGestes` | un doigt invisible ou hors du cadre |
| `film.js` · `verifierLisibilite` | **du texte de la vidéo posé sur une capture** |

La dernière vient du reproche n° 5. Elle relève le film tous les cinquièmes de
seconde et compare, rectangle par rectangle, chaque mot visible à chaque dalle
allumée.

« Cadre hors cible » est née d'un défaut qui allait passer : les repères sont
**mesurés** sur la capture, donc ils bougent quand l'écran bouge. Ouvrir un
dixième métier a fait descendre la tuile « Massage » de 160 px — le plan la
cadrait toujours aussi fièrement, et elle n'était plus dedans. Un plan qui rate
sa cible ne se voit qu'à l'œil, une image sur mille.

---

## Relevé au passage, et pas corrigé ici

**Une prestation d'une heure et demie s'affiche « 1.5 h ».** `durTxt` et la carte
du fil écrivent `duration + ' h'` sans mise en forme — et le catalogue massage
propose « 1 h 30 » (160 €) et « 30 min ciblé » (60 €), qui donnent 1.5 et 0.5.
Tout prestataire qui reçoit une de ces deux demandes le lit aujourd'hui. Ce
n'est pas un défaut de la vidéo : la scène le **contourne** (ses trois demandes
sont des heures entières) au lieu de le filmer. À corriger dans l'application,
pas dans une branche vidéo.

---

## Ce qui reste à faire

- Une version **carrée** (1:1) pour le fil Facebook : `LARGEUR`/`HAUTEUR` dans
  `film.js`, puis refaire la mise en page des cartons.
- `08-pro-agenda` est capturé et n'est employé par aucun plan — gardé pour une
  version qui parlerait du planning.
