# Cartes de visite Ti-Services

Carré **65 × 65 mm**, recto présentation / verso QR-code. Deux jeux :

| Fichier | Pour qui | Ce que le QR ouvre |
|---|---|---|
| `carte-client-recto` / `-verso` | à donner aux **clients** | `https://ti-services.fr/?client` |
| `carte-pro-recto` / `-verso` | à donner aux **prestataires** qu'on recrute | `https://ti-services.fr/?pro` |

`apercu.html` montre les quatre faces à l'échelle, avec le trait de coupe.

## Ce qu'on envoie à l'imprimeur

**Les PDF.** Un fichier par face, police intégrée (Inter, découpée en TrueType), fond
jusqu'au bord. C'est le format que toutes les imprimeries en ligne acceptent.

Les **PNG** sont là pour un imprimeur qui demande une image, ou pour un aperçu : ils
portent leur densité réelle (≈ 301 ppp) dans le fichier, donc ils se posent à 71 mm
exactement dans n'importe quel logiciel — ne les rééchantillonnez pas « à 300 ppp ».

## Les trois mesures qui comptent

- **Format fini : 65 × 65 mm.** C'est le carré standard des imprimeurs en ligne français
  (MOO, Vistaprint). Pour un autre format, changez `MM.carte` dans
  `outils/cartes-visite.js` et relancez.
- **Fond perdu : 3 mm par côté**, donc une planche de **71 × 71 mm**. Le fond doit
  déborder du trait de coupe : sans cela, un liseré blanc apparaît au massicot.
- **Marge de sécurité : 5 mm** après la coupe. Aucun texte ne s'en approche — une coupe
  se déplace toujours d'un demi-millimètre.

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
