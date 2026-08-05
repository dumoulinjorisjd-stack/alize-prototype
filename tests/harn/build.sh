#!/bin/sh
# Reconstruit le harnais : expose au navigateur de test les fonctions internes de l'app.
# DANS LE DÉPÔT, et plus dans un dossier temporaire : le harnais avait déjà été perdu une
# fois avec l'environnement, emportant des dizaines de tests écrits au fil du projet.
SRC=${SRC:-/home/user/alize-work/index.html}
OUT=${OUT:-/home/user/alize-work/tests/harn/app.html}
sed 's/function render(){/function render(){window.__S=S;window.__render=render;window.__setFB=function(v){FB=v;};/
     s/^  function fbErrTxt(e){/  window.__err=function(e){return fbErrTxt(e);};\n  function fbErrTxt(e){/
     s/^  function newMission(svc){/  window.__newMission=function(s){return newMission(s);};\n  function newMission(svc){/
     s/^  function molliePeutTravailler(){/  window.__peutTravailler=function(){return molliePeutTravailler();};window.__differe=function(){return versementDiffere();};\n  function molliePeutTravailler(){/
     s/^  function adminLedgerGroups(){/  window.__ledgerTotal=function(){var l=adminCommissionLedger();return {lignes:l.length,commission:l.reduce(function(t,e){return t+(e.commissionAmount||0);},0)};};\n  function adminLedgerGroups(){/' \
  "$SRC" > "$OUT"
for f in __S __render __err __newMission __peutTravailler; do
  grep -q "window.$f" "$OUT" || { echo "MANQUE $f"; exit 1; }
done
echo "harnais complet"
