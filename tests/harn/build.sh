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
     s/^  function adminLedgerGroups(){/  window.__ledgerTotal=function(){var l=adminCommissionLedger();return {lignes:l.length,commission:l.reduce(function(t,e){return t+(e.commissionAmount||0);},0)};};\n  function adminLedgerGroups(){/
     s/^  function srvMontants(src){/  window.__rev={srv:function(x){return srvMontants(x);},recale:function(h,r){return recaleHist(h,r);},record:function(m){return recordProPaid(m);}};\n  function srvMontants(src){/
     s/^  function catalogGroups(id){/  window.__cat={list:function(i){return catalogFor(i);},groups:function(i){return catalogGroups(i);}};\n  function catalogGroups(id){/
     s/^  function admSeenGet(){/  window.__adm={artNew:function(a){return admArtNew(a);},cliNew:function(c){return admCliNew(c);},thNew:function(t){return admThreadNew(t);},seen:function(k,v){return admSeenSet(k,v);},artSig:function(a){return admArtSig(a);},cliSig:function(c){return admCliSig(c);},count:function(){return adminNewCount();}};\n  function admSeenGet(){/
     s/^  function i18nApply(root){/  window.__tr=function(v,lang){var av=S.lang;S.lang=lang;try{return trOne(v);}finally{S.lang=av;}};window.__dict=function(lang){return lang===String.fromCharCode(112,116)?PT_DICT:EN_DICT;};\n  function i18nApply(root){/' \
  "$SRC" > "$OUT"
for f in __S __render __err __newMission __peutTravailler __tr __adm __cat __rev; do
  grep -q "window.$f" "$OUT" || { echo "MANQUE $f"; exit 1; }
done
echo "harnais complet"
