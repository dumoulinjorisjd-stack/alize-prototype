#!/bin/bash
# TOUT CE QUI GARDE TI-SERVICES, EN UNE COMMANDE.   bash tests/tout.sh
#
# POURQUOI CE FICHIER EXISTE. `tests/journeys.js` — le harnais qui déroule les VRAIS
# parcours, celui dont l'en-tête annonce « il DOIT passer avant tout déploiement » — était
# en échec depuis assez longtemps pour que trois de ses épreuves aient cessé de vouloir
# dire quelque chose, et AUCUN workflow ne l'appelait. Un garde-fou qu'on ne lance pas
# n'est pas un garde-fou : c'est un commentaire. Un seul point d'entrée, donc, et il les
# lance tous.
set -u
cd "$(dirname "$0")/.."
ECHECS=0
titre(){ echo; echo "═══ $1"; }

titre "Harnais (navigateur, Firebase simulé)"
bash tests/harn/build.sh >/dev/null || { echo "build du harnais en échec"; exit 1; }
for t in tests/harn/test-*.js; do
  out=$(node "$t" 2>&1)
  if [ $? -eq 0 ]; then echo "OK   $(basename "$t")"
  else ECHECS=$((ECHECS+1)); echo "FAIL $(basename "$t")"; echo "$out" | grep -i "ÉCHEC" | head -6; fi
done

titre "Parcours de bout en bout"
if node tests/journeys.js 2>&1 | tail -3; then :; fi
node tests/journeys.js >/dev/null 2>&1 || ECHECS=$((ECHECS+1))

titre "Écritures Firestore (anti-écrasement)"
node tests/writes.js 2>&1 | tail -2
node tests/writes.js >/dev/null 2>&1 || ECHECS=$((ECHECS+1))

echo
if [ "$ECHECS" -eq 0 ]; then echo "═══ TOUT EST VERT"; else echo "═══ $ECHECS en échec — NE PAS DÉPLOYER"; fi
exit $ECHECS
