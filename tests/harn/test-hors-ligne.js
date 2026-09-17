/* L'INTERRUPTEUR « HORS LIGNE », QUI NE COUPAIT RIEN.

   La carte annonce « Activez pour recevoir des missions ». Le champ `online` était écrit
   dans la fiche du prestataire… et lu NULLE PART : ni par le flux de l'application, ni par
   aucun des trois envois de notification du serveur. Il coupait à 19 h et continuait de
   recevoir toutes les demandes et toutes les notifications. Le seul bouton qui dit
   « laissez-moi tranquille » était un placebo.

   LA RÈGLE DE SÛRETÉ : on compare à `false`, jamais à « pas vrai ». Une fiche qui ne porte
   pas encore ce champ est EN LIGNE — sinon tout le parc deviendrait invisible d'un coup à
   la première mise en ligne, et plus personne ne recevrait de mission.

   L'EXCEPTION : une demande ADRESSÉE à ce prestataire passe quand même. Le client l'a
   choisi nommément ; il attendrait sans jamais savoir pourquoi. C'est la même exception
   que la grille de disponibilités, et elle est DITE sur la carte. */
const fs=require('fs'),path=require('path');
const RACINE='/home/user/alize-work';
let f=0; const ok=(c,l)=>{if(c)console.log('  ✓ '+l);else{f++;console.log('  ✗ ÉCHEC : '+l);}};
const src=fs.readFileSync(path.join(RACINE,'index.html'),'utf8');
const srv=fs.readFileSync(path.join(RACINE,'functions/index.js'),'utf8');

console.log('\nA — la règle de sûreté, une seule fois, au bon endroit');
ok(/function enLigne\(v\) \{ return v !== false; \}/.test(srv),
  'le serveur a UNE porte : « absent ou vrai » = en ligne');
ok(!/online\s*===\s*true/.test(srv)&&!/!dd\.online/.test(srv)&&!/!a\.online/.test(srv),
  'nulle part on ne traite « pas vrai » comme hors ligne — ce serait éteindre tout le parc');
ok(/S\.proOnline===false/.test(src),'côté application aussi, la comparaison est stricte');

console.log('\nB — le flux de l’artisan se tait vraiment');
ok(/if\(!_directedMe&&S\.proOnline===false\)return;/.test(src),
  'une demande du pot commun ne paraît plus quand il est hors ligne');
const iAvail=src.indexOf('if(!_directedMe&&!availOk(S.avail,r))return;');
const iOnline=src.indexOf('if(!_directedMe&&S.proOnline===false)return;');
ok(iAvail>0&&iOnline>iAvail,'le filtre est posé avec les autres, après les disponibilités');

console.log('\nC — les TROIS envois du serveur, pas un seul');
const n=(srv.match(/enLigne\(/g)||[]).length;
ok(n>=4,'la règle est appliquée partout où le serveur choisit qui prévenir ('+(n-1)+' relais)');
ok(/availOk\(availById\[uid\], r\) && enLigne\(onlineById\[uid\]\)/.test(srv),
  'nouvelle demande : le pot commun est filtré');
ok(/availOk\(dd\.avail, after\) && enLigne\(dd\.online\)/.test(srv),
  'coup de pouce : un artisan hors ligne n’est pas re-sollicité');
ok(/d\.id !== exclude && siteOk\(dd, svc, after\.locationMode\) && enLigne\(dd\.online\)/.test(srv),
  'demande rouverte après un lapin : même règle');

console.log('\nD — la demande ADRESSÉE passe quand même, et on le dit');
ok(/const targetUids = preferred\s*\n\s*\? \(uids\.indexOf\(preferred\) >= 0 \? \[preferred\] : \[\]\)/.test(srv),
  'le serveur ne filtre le hors-ligne que sur le pot commun, jamais sur un choix nominatif');
ok(/Une demande qui vous est adressée personnellement vous parvient quand même/.test(src),
  'et la carte l’annonce — une exception qu’on ne dit pas est une surprise');

console.log('\nE — les faux signaux d’urgence ont disparu');
ok(!/ring-timer/.test(src),'l’anneau de 25 secondes, relié à aucune échéance, est retiré');
ok(!/@keyframes count\{/.test(src),'son animation aussi — pas de code mort laissé derrière');
ok(/Au premier qui accepte<\/div>/.test(src),'la phrase VRAIE reste : c’est bien au premier qui accepte');
ok(!/\$\{m\.competitors\} artisans notifiés/.test(src),
  'le compteur disparaît de la carte de l’artisan : il affichait toujours 0 en production, '+
  'et le vrai chiffre dirait à un artisan qu’il est seul');
ok(/id="notif"/.test(src),
  'le compteur SIMULÉ du mode démonstration reste — là, il montre l’application telle qu’elle sera');

console.log(f?('\n'+f+' ÉCHEC(S)'):'\nTOUT PASSE');
process.exit(f?1:0);
