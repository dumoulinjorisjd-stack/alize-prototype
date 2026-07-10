#!/usr/bin/env python3
"""Régénère le QR-code de partage inséré dans index.html (constante QR_PATH).

À lancer quand l'URL de partage change (ex. passage au vrai domaine) :

    pip install segno
    python3 gen_qr.py "https://ti-services.fr/"

Copier ensuite la valeur QR_VB et la chaîne QR_PATH affichées dans index.html
(et mettre à jour CONFIG.shareUrl avec la même URL).
"""
import sys
import segno

URL = sys.argv[1] if len(sys.argv) > 1 else "https://dumoulinjorisjd-stack.github.io/alize-prototype/"
QZ = 4  # zone de silence (quiet zone) — 4 modules, requis par la norme

qr = segno.make(URL, error="m")
matrix = [list(row) for row in qr.matrix]
n = len(matrix)
size = n + 2 * QZ

# Un module noir = un carré 1x1 ; on fusionne les suites horizontales en un seul segment.
d = []
for y, row in enumerate(matrix):
    x = 0
    while x < n:
        if row[x]:
            x0 = x
            while x < n and row[x]:
                x += 1
            d.append(f"M{x0 + QZ} {y + QZ}h{x - x0}v1h-{x - x0}z")
        else:
            x += 1

print(f"# URL      : {URL}")
print(f"# version  : {qr.version}  |  correction : {qr.error}  |  modules : {n}x{n}")
print(f"const QR_VB = {size};")
print("const QR_PATH = '" + "".join(d) + "';")
