#!/bin/bash
# DÉPLOYER LA PRODUCTION SANS QU'UN ÉCRAN NEUF PARLE À UN SERVEUR ANCIEN.
#
# « Pourquoi cette erreur en permanence ? » puis « fais les changements, tant que le
# risque d'une publication qui crée des bugs n'existe pas » (l'éditeur, 24/11/2026).
#
# MESURÉ (run 790, v934) : chaque publication redéployait les 86 fonctions d'un coup ;
# Google limite les mises à jour par minute (« Quota Exceeded… Waiting to retry ») et,
# sous cette limite, la relecture des droits des deux tâches planifiées échouait (« Failed
# to set invoker »). Le run s'arrêtait : règles et 84 fonctions en ligne, écran PAS publié
# (aucune ligne « release » pour hosting). Il fallait relancer à la main.
#
# L'ORDRE EST LA GARANTIE :
#   1. les règles (rapide, sautées par Firebase si identiques) ;
#   2. les fonctions, SEULEMENT si leur source a changé depuis le dernier déploiement
#      RÉUSSI (étiquette git `prod-fonctions`) — sans étiquette, ou au moindre doute :
#      toutes. Celles qui échouent sont redéployées seules, trois essais au plus ; un
#      échec qu'on ne sait pas nommer arrête tout ;
#   3. l'écran (hosting) EN DERNIER, et seulement si 1 et 2 ont réussi. Sinon rien ne
#      change pour les clients.
#
#   deploy/deployer-prod.sh                      (dans le workflow)
#   DEPLOY_ESSAI=1 deploy/deployer-prod.sh       (à blanc : dit ce qu'il ferait)
set -u
PROJET="${PROJECT_ID:?PROJECT_ID manquant}"
ETIQUETTE=prod-fonctions
JOURNAL="${RUNNER_TEMP:-/tmp}/deploy-fonctions.log"
ESSAIS_MAX=3
fb(){ if [ "${DEPLOY_ESSAI:-}" = 1 ]; then echo "[à blanc] firebase deploy --only $1"; return 0; fi
      firebase deploy --only "$1" --project "$PROJET" --non-interactive --force; }

# Les fonctions à redéployer : celles que la CLI liste sous « Functions deploy had errors ».
fonctions_en_echec(){
  sed 's/\x1b\[[0-9;]*m//g' "$1" \
    | sed -n '/Functions deploy had errors with the following functions:/,/^[[:space:]]*$/p' \
    | grep -oE '^[[:space:]]+[A-Za-z0-9_-]+\(' | tr -d ' \t(' | sort -u
}

# Les fonctions ont-elles changé depuis le dernier déploiement réussi ? Répond « oui »
# dans le doute : étiquette absente, historique incomplet, diff impossible.
fonctions_a_deployer(){
  git fetch -q --tags origin 2>/dev/null || true
  local base; base=$(git rev-parse -q --verify "refs/tags/$ETIQUETTE^{commit}" 2>/dev/null) || { echo oui; return; }
  git cat-file -e "$base" 2>/dev/null || { echo oui; return; }
  local chg; chg=$(git diff --name-only "$base" HEAD -- functions firebase.json firestore.rules firestore.indexes.json 2>/dev/null) || { echo oui; return; }
  [ -n "$chg" ] && echo oui || echo non
}

deployer_fonctions(){
  local cibles=functions essai=1
  while :; do
    echo "── fonctions, essai $essai : $cibles"
    if [ "${DEPLOY_ESSAI:-}" = 1 ]; then fb "$cibles"; return 0; fi
    fb "$cibles" 2>&1 | tee "$JOURNAL"; local rc=${PIPESTATUS[0]}
    [ "$rc" -eq 0 ] && return 0
    [ "$essai" -ge "$ESSAIS_MAX" ] && { echo "::error::Fonctions toujours en échec après $ESSAIS_MAX essais."; return 1; }
    local echecs; echecs=$(fonctions_en_echec "$JOURNAL")
    [ -z "$echecs" ] && { echo "::error::Échec des fonctions sans liste nommée : on s'arrête."; return 1; }
    cibles=$(echo "$echecs" | sed 's/^/functions:/' | paste -sd, -)
    echo "── en échec : $cibles — nouvel essai dans 60 s"
    sleep 60; essai=$((essai+1))
  done
}

echo "── 1. règles Firestore"
fb firestore:rules || { echo "::error::Règles refusées : rien d'autre n'est déployé."; exit 1; }

echo "── 2. fonctions"
if [ "$(fonctions_a_deployer)" = oui ]; then
  deployer_fonctions || { echo "::error::L'écran n'est PAS publié : il resterait sans son serveur."; exit 1; }
else
  echo "   source inchangée depuis $ETIQUETTE : rien à redéployer"
fi
# Le point de référence n'avance qu'APRÈS un succès : un échec fera tout redéployer la fois suivante.
if [ "${DEPLOY_ESSAI:-}" != 1 ]; then
  git tag -f "$ETIQUETTE" HEAD >/dev/null && git push -qf origin "refs/tags/$ETIQUETTE" \
    || echo "::warning::Étiquette $ETIQUETTE non poussée : le prochain déploiement refera toutes les fonctions."
fi

echo "── 3. écran (hosting), en dernier"
fb hosting || { echo "::error::Hosting refusé."; exit 1; }
echo "── déploiement complet"
