# Cartes de visite Ti-Services

Carré **65 × 65 mm**. Trois cartes : deux dédiées (recto présentation, verso QR-code) et
une carte **unique** pour les deux publics.

Le recto de la carte **client** porte six métiers dessinés — icône et nom côte à côte —
parce qu'un nom de service se lit, mais qu'un dessin se comprend avant d'être lu. Six et
non vingt et un : sur 49 mm de large, la liste complète donnerait des noms de deux
millimètres que personne ne lit. Les icônes, les noms et les teintes viennent du
catalogue de l'application, comme sur la vitrine.

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

**Le recto est un blanc franc, sans dégradé.** Il portait le fond « lagon » de
l'application : à l'écran c'est une atmosphère, imprimé c'est une teinte pâle irrégulière
qui ne se retrouve pas d'un tirage à l'autre.

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
