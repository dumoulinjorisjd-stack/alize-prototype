# Cartes de visite Ti-Services

Carré **65 × 65 mm**. Trois cartes : deux dédiées (recto présentation, verso QR-code) et
une carte **unique** pour les deux publics.

Le recto de la carte **client** porte six métiers dessinés — icône et nom côte à côte —
parce qu'un nom de service se lit, mais qu'un dessin se comprend avant d'être lu. Six et
non vingt et un : sur 49 mm de large, la liste complète donnerait des noms de deux
millimètres que personne ne lit. Les icônes, les noms et les teintes viennent du
catalogue de l'application, comme sur la vitrine.

**Chaque icône est centrée sur son DESSIN, pas sur sa boîte.** Les icônes partagent une
boîte de 24 × 24, mais leur tracé n'y occupe pas la même place : le lotus du massage
descend bas, la silhouette du baby-sitting est haute, la bouteille du ménage penche à
gauche. Alignées par leur boîte — ce que fait n'importe quelle mise en page — elles
paraissent décalées les unes des autres et par rapport à leur nom. Le script **rastérise**
chaque icône et relève le rectangle réellement encré, puis déplace la fenêtre de la boîte
pour que ce rectangle tombe au centre. Rien n'est redessiné, aucune valeur n'est écrite à
la main, et une icône redessinée dans l'application est remesurée à la génération suivante.

*Une fausse bonne idée, essayée et retirée* : centrer sur le **centre de gravité** de
l'encre plutôt que sur le rectangle. Il ne corrigeait rien là où l'œil voyait un défaut —
ménage, coiffure et massage ont leur masse centrée à un demi-dixième d'unité près — et il
en créait là où il n'y en avait pas : le jardinage, dont les feuilles pèsent lourd en haut
et la tige rien en bas, se retrouvait poussé de 2,7 unités vers le bas. Une tige, une
queue, une antenne : tout tracé fin et long trompe une moyenne pondérée.

**Et elles ont toutes la même taille apparente.** Centrer ne suffisait pas : le carton du
colis remplissait sa boîte, le lotus du massage en occupait les deux tiers — côte à côte,
l'un pesait visiblement plus que l'autre. La fenêtre est donc un carré proportionnel au
**plus grand côté du dessin**, si bien que chaque icône remplit la même fraction de sa
case quelle que soit sa forme. Mesuré : les six ont exactement **2,8 mm** de plus grand
côté. Le prix est que l'épaisseur du trait suit l'échelle — elle varie de 0,243 à
0,281 mm selon les icônes, quatre centièmes d'écart, invisibles à cette taille.

**Le placement est géométrique, la correction est à l'œil, et les deux sont séparés.**
Quatre icônes se lisent basses alors que leur rectangle est centré : le flacon du
pulvérisateur sous ses gouttelettes, les deux gros anneaux des ciseaux, la coupe des
pétales du lotus, l'arc d'épaules de la silhouette. C'est leur *forme* qui se lit basse,
pas leur position. Aucune mesure ne rend ce jugement-là ; l'œil, si. Il vit dans
`ICO_OPTIQUE`, en unités de la boîte, positif = le dessin remonte — 1,4 pour ménage,
coiffure et massage, 0,9 pour le baby-sitting, rien pour les autres. Une icône remontée
reste entièrement dans sa fenêtre : le script le vérifie.

**Un nom trop long pour sa colonne arrête la génération.** « Colis & courrier » demande
20,9 mm là où la colonne en offre 18,3 : la carte dit donc « Colis », raccourci déclaré
dans `LIBELLES_COURTS` et nulle part ailleurs. Tout autre métier garde le nom du
catalogue, et le script refuse d'écrire un PDF où un nom déborde — on ne peut pas en
ajouter un sans le voir.

Une ligne — « … et plein d'autres » — dit la suite : six métiers ne sont pas le catalogue,
et une carte qui n'en montre que six laisserait croire qu'il n'y a que ça.

Pour en montrer plus, la place se prend quelque part : la carte est pleine (8,0 mm de
marge, le minimum). Ajouter deux métiers demande de rendre au dessin ou aux blancs les
millimètres qu'ils prennent — c'est la liste `metiers` de `outils/cartes-visite.js`, et le
script refuse d'écrire un PDF qui déborde.

| Fichier | Pour qui | Ce que le QR ouvre |
|---|---|---|
| `carte-client-recto` / `-verso` | à donner aux **clients** | `https://ti-services.fr/?client` |
| `carte-pro-recto` / `-verso` | à donner aux **prestataires** qu'on recrute | `https://ti-services.fr/?pro` |
| `carte-duo-recto` / `-verso` | **une seule carte** : côté client au recto, côté prestataire au verso | `https://ti-services.fr/?pro` (verso seulement) |

Sur le verso de la carte unique, le **QR-code prend la place de Zouti** : même bloc de
tête, même axe — on ne met pas deux fois la mascotte sur la même carte, et le geste qu'on
attend d'un prestataire est de scanner. Cette face garde le **corail** des versos : c'est
à la couleur qu'on voit, carte retournée, qu'on a changé d'interlocuteur.

**Réserve à connaître avant de la faire imprimer** : cette carte ne porte alors aucune
adresse lisible, ni au recto ni au verso — seulement le QR du côté prestataire. Un client
à qui on la donne n'a rien à taper si son appareil photo ne lit pas le code. Y ajouter
`ti-services.fr` coûte trois millimètres, qu'il faut prendre sur le QR (22 → 19 mm, ce qui
reste largement lisible).

`apercu.html` montre les quatre faces à l'échelle, avec le trait de coupe.

## Ce qu'on envoie à l'imprimeur

**Les PDF.** Un fichier par face, police intégrée (Inter, découpée en TrueType), fond
jusqu'au bord. C'est le format que toutes les imprimeries en ligne acceptent.

Les **JPEG** sont là pour un imprimeur qui demande une image : **1 681 px de côté, soit
601 ppp**, qualité maximale et sans sous-échantillonnage de la couleur. Deux fois plus fin
que les 300 ppp habituels, parce qu'un JPEG fige le texte en pixels là où le PDF le garde
en courbes : à 300 ppp les contre-formes d'un texte de 2 mm et les modules du QR-code
tombent sur un pixel et demi, à 601 ils en ont trois.

Les **PNG** (301 ppp) servent d'aperçu, ou pour un logiciel qui préfère un format sans
perte.

Les deux portent leur **densité réelle dans le fichier** — pHYs pour le PNG, en-tête JFIF
pour le JPEG — donc ils se posent à 71 mm tout seuls dans n'importe quel logiciel (71,04
pour le JPEG : la densité d'un JPEG s'écrit en points par pouce entiers, quatre centièmes
de millimètre sont le plancher). **Ne les rééchantillonnez pas « à 300 ppp ».**

**Le QR-code est relu dans les DEUX images.** La compression JPEG loge ses artefacts
précisément sur les transitions noir/blanc franches, c'est-à-dire sur les modules du code :
un QR qui se lit dans le PNG ne prouve rien du JPEG. Les deux sont décodés à chaque
génération.

## Les trois mesures qui comptent

- **Format fini : 65 × 65 mm.** C'est le carré standard des imprimeurs en ligne français
  (MOO, Vistaprint). Pour un autre format, changez `MM.carte` dans
  `outils/cartes-visite.js` et relancez.
- **Fond perdu : 3 mm par côté**, donc une planche de **71 × 71 mm**. Le fond doit
  déborder du trait de coupe : sans cela, un liseré blanc apparaît au massicot.
- **Marge de sécurité : 4 mm** après la coupe. Aucun texte ne s'en approche — une coupe
  se déplace toujours d'un demi-millimètre. Elle valait 5 mm ; le millimètre rendu est ce
  qui a permis d'agrandir le texte sans rétrécir le dessin. Quatre reste au-dessus du
  minimum que demandent les imprimeurs en ligne (trois) ; en dessous de trois, on ne le
  ferait pas.

**La marge est vérifiée à chaque génération.** Le script mesure, dans le navigateur, où
commence et où finit vraiment le contenu de chaque face, et refuse d'écrire un PDF qui
entre dans les 4 mm de sécurité. C'est ce qui a rattrapé la grille des métiers de la carte
client : elle descendait à 3,1 mm du bord, soit en pleine zone que le massicot peut mordre.

**Une réserve honnête sur le PDF** : Chromium arrondit la page au pixel CSS, la planche
sort donc à **70,87 mm** au lieu de 71,00 — 0,13 mm de moins, absorbés par les 3 mm de
fond perdu, et sans effet sur la coupe. Si votre imprimeur refuse le format au contrôle
automatique, envoyez les PNG, qui sont exacts.

## Les couleurs

Les fichiers sont en **RVB**. La plupart des imprimeries en ligne convertissent
elles-mêmes en CMJN. Si la vôtre exige un CMJN profilé, demandez-lui son profil
(souvent *ISO Coated v2* ou *PSO Coated v3*) et convertissez à l'ouverture du PDF.

Le corail du verso est un aplat saturé : sur un papier non couché il paraîtra plus mat
et légèrement plus sombre qu'à l'écran. C'est normal, et c'est la raison de demander un
**BAT** ou un échantillon avant un gros tirage.

**Le dégradé a été éclairci deux fois** pour cette raison. Il allait de `#FF6A5B` à
`#CE301C` — ce corail profond vire au rouge sombre en CMJN et donnait son poids à toute
la face. Il va maintenant de **`#FF8275`** (le corail de marque plus un voile de blanc) à
**`#F66050`**. Les deux bouts se règlent sur une ligne chacun dans
`outils/cartes-visite.js`, en PROPORTION de deux jetons de la charte — jamais en teinte
choisie à la main.

**Le recto porte le dégradé « lagon » de l'application** : un voile de corail en haut à
gauche, un d'or à droite, un de turquoise en bas, sur le sable. Ils sont légers — 13 %, 8 %
et 10 % d'opacité — et c'est ce qui les rend justes sur un papier : un aplat très clair ne
se voit pas, un dégradé se voit parce que l'œil compare deux endroits de la même carte. Un
blanc franc et un corail plat ont été essayés ; ni l'un ni l'autre ne tenait.

**Le QR-code est posé à même le corail, sans carré blanc.** La zone de silence autour des
modules est obligatoire, mais elle n'a pas à être blanche : elle doit être claire et unie,
et le corail l'est. Contraste encre/fond : 6,6 contre 1.

*Ce que ça coûte, mesuré* — on réduit l'image de la carte jusqu'à ce que le décodeur
échoue : le code se lit jusqu'à **170 px** de côté de carte posé sur le corail, contre
**150 px** sur le carré blanc. Treize pour cent de marge en moins, sur une marge qui est
énorme — un téléphone qui photographie une carte de 65 mm en capture entre 800 et 2 000 px.
**Réserve** : ces mesures portent sur le fichier, pas sur le papier. À l'impression, l'encre
s'étale légèrement et un fond saturé pardonne moins qu'un blanc. Scannez le BAT avec deux
ou trois téléphones avant de lancer le tirage — c'est le seul essai qui compte.

**Ce que le fond clair coûte, mesuré.** Le nom garde ses deux teintes du recto sur les
deux faces — c'est la signature de la marque. Sur le blanc du recto, le « Ti » corail tient
à 5,2 contre 1 et le texte à 16 ; sur le haut du corail, le « -Services » encre tient à
6,7, le « Ti » corail à 2,1 (il se lit comme un mot plus foncé, pas comme un contraste) et
le **texte blanc tombe à 2,4** — c'est l'élément le plus juste de la carte, et il s'agit
partout de texte large et gras. Si une ligne blanche du haut vous paraît faible au tirage,
la passer en encre se fait sur une ligne.

## Régénérer

```bash
node outils/cartes-visite.js
```

**Rien n'est recopié de l'application** : les teintes de marque sont lues dans le `:root`
d'`index.html`, le dessin de Zouti dans `zouti-logo.svg`, et le QR-code est fabriqué par
le **même encodeur** que celui qui le dessine à l'écran. Une couleur de marque qui change
dans l'application se retrouve sur la prochaine carte.

À chaque exécution, le QR-code du PNG rendu est **relu par un décodeur indépendant**
(`zbarimg`) et comparé à l'adresse attendue. Une carte de visite ne se corrige pas après
tirage : si le décodeur manque sur la machine, le script le dit au lieu de se taire.

## La police

`Inter.woff2` est la version variable téléchargée depuis Google Fonts ; `Inter-500.ttf`,
`Inter-700.ttf` et `Inter-800.ttf` en sont trois instances fixes, produites avec
`fontTools` :

```bash
pip install fonttools brotli
python3 - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
for w in (500, 700, 800):
    f = TTFont('Inter.woff2')
    inst = instancer.instantiateVariableFont(f, {'wght': w}, inplace=False, updateFontNames=True)
    inst.flavor = None
    inst.save('Inter-%d.ttf' % w)
PY
```

**Pourquoi des instances fixes** : embarquée en variable, Chromium ne sait pas la
découper pour un PDF et retombe sur des glyphes de **Type 3** — ni cherchables, ni
sélectionnables, et mal rendus par plusieurs RIP d'imprimerie. C'est pour cela que le
gabarit n'emploie que les graisses 500, 700 et 800 : une valeur intermédiaire ferait
synthétiser un gras chez l'imprimeur, et deux tirages ne se ressembleraient plus.

L'application, elle, s'affiche en SF Pro sur un Mac ; Inter en est l'équivalent libre le
plus proche. Licence SIL OFL, texte complet dans `Inter-OFL.txt`.
