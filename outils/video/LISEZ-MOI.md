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
   d'un film trépidant ».

Le premier jet était un diaporama : des écrans qui se succèdent dans un cadre
immobile, avec des légendes par-dessus. **Mesuré** : sur 48 secondes, trente
étaient « un écran change dans un téléphone immobile », la caméra ne bougeait
qu'ENTRE les plans, et les deux côtés se racontaient en deux blocs alors que
tout l'argument est qu'ils se passent EN MÊME TEMPS.

Ce qui est livré :

- **un monde**, large de 2 400 points — Camille à gauche (Lorient), Léa à droite
  (Gustavia), l'île entre les deux — et une **caméra** qui le parcourt ;
- **vingt-huit plans** de 0,7 à 2 s, dont **huit plans de détail** qui poussent
  sur le chiffre qui compte : « 110,00 € », « 93,50 € », « 824,50 € » ;
- **zéro seconde de caméra figée** sur quarante (mesuré) ;
- **six cartons pleins cadre** qui ponctuent, à la façon d'une bande-annonce — et
  qui cachent le déplacement de la caméra, de sorte que la coupe suivante tombe
  sur un cadre déjà en place ;
- **le plan qui porte le film** : la caméra recule, et la demande TRAVERSE l'île
  d'un téléphone à l'autre. C'est le seul plan long, et c'est volontaire : une
  bande-annonce accélère partout sauf à l'endroit qu'elle veut faire voir.

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
- Léa a un mois d'historique (sept massages, 824,50 € nets à 15 % de commission) ;
- `IS_PROD` est forcé **dans une copie temporaire** du fichier, pour que les
  bandeaux « Démonstration » et « BÊTA » ne paraissent pas. `index.html` n'est
  jamais modifié.

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
| le pavé « Nous enregistrons seulement votre carte » | il passe sur un **carton plein cadre**, où il se lit vraiment |

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
| `film.js` · `verifierGestes` | un doigt invisible ou hors du cadre |
| `film.js` · `verifierLisibilite` | **du texte de la vidéo posé sur une capture** |

Cette dernière vient du reproche n° 5. Elle relève le film tous les cinquièmes
de seconde et compare, rectangle par rectangle, chaque mot visible à chaque
dalle allumée.

---

## Ce qui reste à faire

- Une version **carrée** (1:1) pour le fil Facebook : `LARGEUR`/`HAUTEUR` dans
  `film.js`, puis refaire la mise en page des cartons.
- `08-pro-agenda` est capturé et n'est employé par aucun plan — gardé pour une
  version qui parlerait du planning.
