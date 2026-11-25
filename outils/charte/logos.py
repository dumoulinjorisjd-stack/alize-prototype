"""LOGOS TI-SERVICES — fichiers vectoriels pour la charte (l'éditeur, 25/11/2026).

« La charte doit être plus précise afin de pouvoir la transmettre à un service
marketing, pour des logos, des enseignes, de la pub. »

Le nom est VECTORISÉ (contours) dans Inter Display ExtraBold (licence SIL OFL : usage
commercial, impression et vectorisation permis) : un imprimeur n'a besoin d'aucune
police, et le nom a le même dessin partout (l'appli l'affiche dans la police du
téléphone, qui change d'un appareil à l'autre).
La mascotte, Zouti, est reprise telle quelle de zouti-logo.svg et badge.svg.

    python3 outils/charte/logos.py <dossier de sortie>
"""
import os
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
POLICE = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'

# Couleurs de la marque (une seule source : charte.js lit le même tableau via couleurs.json)
CORAIL = '#FF6A5B'        # mascotte
CORAIL_PROFOND = '#CE301C'  # « Ti » du nom sur fond clair (comme l'en-tête de l'appli)
ENCRE = '#231E33'         # « -Services »
ENCRE_LOGO = '#2A2340'    # contours de la mascotte
BLANC = '#FFFFFF'


def mot(texte, taille, interlettre=-0.02):
    """Contours du texte : liste de (chemin SVG, avance) et largeur totale, base à y=0."""
    f = TTFont(POLICE)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f['head'].unitsPerEm
    k = taille / upm
    x = 0.0
    morceaux = []
    for ch in texte:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        # repère police (y vers le haut) → SVG (y vers le bas)
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, 0)))
        morceaux.append(pen.getCommands())
        x += gs[g].width * k + interlettre * taille
    x -= interlettre * taille
    capitale = f['OS/2'].sCapHeight * k
    return morceaux, x, capitale


def corps_mascotte(blanc=False):
    src = open(os.path.join(RACINE, 'badge.svg' if blanc else 'zouti-logo.svg')).read()
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', src).group(1).split()]
    corps = re.sub(r'^.*?<svg[^>]*>|</svg>\s*$', '', src, flags=re.S)
    return corps, vb


def svg(w, h, contenu):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
            f'width="{w:.0f}" height="{h:.0f}">\n{contenu}\n</svg>\n')


def nom(couleur_ti, couleur_services, taille=100):
    m1, l1, cap = mot('Ti', taille)
    m2, l2, _ = mot('-Services', taille)
    esp = -0.02 * taille
    p = (f'<g fill="{couleur_ti}">' + ''.join(f'<path d="{d}"/>' for d in m1) + '</g>'
         f'<g fill="{couleur_services}" transform="translate({l1 + esp:.2f} 0)">'
         + ''.join(f'<path d="{d}"/>' for d in m2) + '</g>')
    return p, l1 + esp + l2, cap


def logo_horizontal(variante):
    """Proportions de l'en-tête de l'appli : mascotte 54 px de large, nom en 25 px, écart 12 px."""
    blanc = variante == 'blanc'
    corps, vb = corps_mascotte(blanc)
    k = 4.0                                  # 54 px → 216 unités
    mw, mh = 54 * k, 54 * k * vb[3] / vb[2]
    taille = 25 * k
    ti, services = {'couleur': (CORAIL_PROFOND, ENCRE), 'negatif': (CORAIL, BLANC), 'blanc': (BLANC, BLANC)}[variante]
    chemins, lnom, cap = nom(ti, services, taille)
    gap = 12 * k
    h = mh
    base = h / 2 + cap / 2                   # nom centré sur la hauteur de la mascotte
    w = mw + gap + lnom
    s = mw / vb[2]
    contenu = (f'<g transform="scale({s:.5f}) translate({-vb[0]:.2f} {-vb[1]:.2f})">{corps}</g>'
               f'<g transform="translate({mw + gap:.2f} {base:.2f})">{chemins}</g>')
    return svg(w, h, contenu)


def logo_nom(variante):
    ti, services = {'couleur': (CORAIL_PROFOND, ENCRE), 'negatif': (CORAIL, BLANC), 'blanc': (BLANC, BLANC)}[variante]
    chemins, lnom, cap = nom(ti, services, 100)
    marge_basse = 0.24 * 100                 # jambage absent : on garde un pied pour l'équilibre
    return svg(lnom, cap + marge_basse, f'<g transform="translate(0 {cap:.2f})">{chemins}</g>')


def mascotte(blanc=False):
    corps, vb = corps_mascotte(blanc)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(str(v) for v in vb)}" '
            f'width="{vb[2] * 4:.0f}" height="{vb[3] * 4:.0f}">{corps}</svg>\n')


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RACINE, 'outils', 'charte', 'logos')
    os.makedirs(out, exist_ok=True)
    fichiers = {
        'ti-services-logo-couleur.svg': logo_horizontal('couleur'),
        'ti-services-logo-negatif.svg': logo_horizontal('negatif'),
        'ti-services-logo-blanc.svg': logo_horizontal('blanc'),
        'ti-services-nom-couleur.svg': logo_nom('couleur'),
        'ti-services-nom-negatif.svg': logo_nom('negatif'),
        'ti-services-nom-blanc.svg': logo_nom('blanc'),
        'ti-services-zouti-couleur.svg': mascotte(False),
        'ti-services-zouti-blanc.svg': mascotte(True),
    }
    for n, c in fichiers.items():
        open(os.path.join(out, n), 'w').write(c)
    print('\n'.join(sorted(fichiers)))
