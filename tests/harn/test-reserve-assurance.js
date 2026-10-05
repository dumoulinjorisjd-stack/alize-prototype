/* ACCEPTÉ SANS ASSURANCE : L'E-MAIL LE DIT, ET LE LIEN L'EXPLIQUE.

   « Ça c'est quand on lui envoie le mail comme quoi il est accepté, si l'acceptation a
   été faite sans assurance. Un lien qui ouvre un texte explicatif supplémentaire : un
   document qui dit qu'on lui demande de s'assurer dans les plus brefs délais et qu'on
   accepte son adhésion sous réserve qu'il s'assure dans les 3 mois. Du coup on pourra
   dire qu'on lui avait demandé de s'assurer. »

   L'ÉDITEUR A DIT LUI-MÊME QUE LE LONG TEXTE NE SERA PAS LU. L'e-mail porte donc les
   deux phrases qui comptent, et le document complet s'ouvre d'un lien, à son adresse
   publique — lisible sur n'importe quel téléphone, sans l'application.

   ET IL NE PARAÎT QUE LÀ OÙ IL EST VRAI : l'e-mail d'un intervenant qui a joint son
   attestation est EXACTEMENT celui d'avant. C'est ce que cette épreuve mesure, en
   retirant le bloc de la version « sans assurance » et en comparant les deux textes. */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

// On exécute la VRAIE fonction, extraite du source, avec ses vraies dépendances.
const prendre = (nom) => {
  const i = fn.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('introuvable : ' + nom);
  let p = 0, j = fn.indexOf('{', i);
  for (let k = j; k < fn.length; k++) {
    if (fn[k] === '{') p++; else if (fn[k] === '}') { p--; if (!p) return fn.slice(i, k + 1); }
  }
  throw new Error('non fermée : ' + nom);
};
// La palette est une constante du module : on la prend telle quelle, pas une copie.
const COUL = /const MAIL_COULEURS = \{[\s\S]*?\n\};/.exec(fn);
const fab = new Function(
  'const APP_URL = \'https://ti-services.fr\';\n' + COUL[0] + '\n' +
  prendre('escHtmlS') + '\n' + prendre('mailPalette') + '\n' +
  // Le bouton et le pied ont leur porte unique depuis le 05/10/2026 : on les prend
  // à la source comme le reste, plutôt que d'en recopier une imitation ici.
  prendre('mailBouton') + '\n' + prendre('mailPied') + '\n' + prendre('approvedArtisanHtml') +
  '\nreturn approvedArtisanHtml;');
const approvedArtisanHtml = fab();

console.log('A — sans réserve, l’e-mail est celui d’avant');
const normal = approvedArtisanHtml('Léa Brin', false);
ok(!/SOUS RÉSERVE/.test(normal), 'aucun bloc de réserve');
ok(!/legal=assurance/.test(normal), 'aucun lien vers le document');
ok(/DERNIÈRE ÉTAPE/.test(normal) && /Mollie/.test(normal), 'et la dernière étape Mollie est bien là');
ok(/Léa Brin/.test(normal), 'le prénom aussi');

console.log('\nB — avec réserve, tout ce qui a été demandé y est');
const reserve = approvedArtisanHtml('Léa Brin', true);
ok(/SOUS RÉSERVE/.test(reserve), 'le bloc paraît');
ok(/dans les plus brefs délais/.test(reserve), '« dans les plus brefs délais » est dit');
ok(/sous réserve<\/b> que vous nous transmettiez votre attestation <b>dans les trois mois<\/b>/.test(reserve),
  'l’adhésion est acceptée SOUS RÉSERVE, et le délai de trois mois est dans la phrase');
ok(/Mes documents/.test(reserve), 'et l’endroit où déposer l’attestation est nommé');
const lien = /href="([^"]*legal=assurance[^"]*)"/.exec(reserve);
ok(!!lien, 'le lien existe');
ok(!!lien && lien[1] === 'https://ti-services.fr/?legal=assurance',
  'il pointe sur l’adresse publique du document (' + (lien ? lien[1] : '—') + ')');
ok(/Lire les conditions de cette réserve/.test(reserve), 'et il porte un intitulé qui dit où il mène');
ok(/DERNIÈRE ÉTAPE/.test(reserve), 'la dernière étape Mollie n’a pas disparu pour autant');

console.log('\nC — les deux e-mails ne diffèrent QUE par ce bloc');
// On ne découpe pas le balisage à la main : on compare les deux textes. Préfixe commun
// et suffixe commun ; si leur somme fait la longueur de l'e-mail normal, c'est qu'UNE
// seule portion contiguë a été insérée, et rien d'autre n'a bougé.
let pre = 0; while (pre < normal.length && normal[pre] === reserve[pre]) pre++;
let suf = 0; while (suf < normal.length - pre && normal[normal.length - 1 - suf] === reserve[reserve.length - 1 - suf]) suf++;
const insere = reserve.slice(pre, reserve.length - suf);
ok(pre + suf === normal.length,
  'une seule portion est insérée, le reste est identique (' + pre + ' + ' + suf + ' = ' + normal.length + ')');
ok(/SOUS RÉSERVE/.test(insere) && /legal=assurance/.test(insere),
  'et cette portion est bien le bloc de réserve, rien d’autre (' + insere.length + ' caractères)');
ok(reserve.length - normal.length === insere.length,
  'l’e-mail ne grossit que de ce bloc');

console.log('\nD — le déclencheur sait, et il garde la trace');
ok(/const sansAssurance = after\.insuranceNone === true \|\| after\.insuranceStatus === 'aucune';/.test(fn),
  'il lit le MÊME fait que la console : la déclaration ou l’état');
ok(/approvedArtisanHtml\(name === 'Bonjour' \? '' : name, sansAssurance\)/.test(fn),
  'et il le passe à l’e-mail');
ok(/if \(sansAssurance && !after\.insuranceNoticeAt\)/.test(fn),
  'la date de la demande ne s’écrit qu’UNE fois');
ok(/insuranceDueAt: maintenant \+ 90 \* 24 \* 3600 \* 1000/.test(fn),
  'l’échéance des trois mois est posée avec elle');
// Elle doit être écrite APRÈS l'envoi : écrire d'abord, c'est dater une demande
// qui n'est peut-être jamais partie.
const iMail = fn.indexOf("approvedArtisanHtml(name === 'Bonjour'"), iNote = fn.indexOf('insuranceNoticeAt: maintenant');
ok(iMail > 0 && iNote > iMail, 'et seulement après l’envoi : on ne date pas une demande non partie');

console.log('\nE — le document existe, à l’adresse que l’e-mail donne');
ok(/const LEGAL_ASSURANCE=/.test(html), 'le texte est écrit');
ok(/LEGAL_CLES=\['cgu','cgv','charte','mentions','confidentialite','suppression','assurance'\]/.test(html),
  'et « assurance » est dans la liste fermée que l’adresse ?legal= consulte');
ok(/assurance:\['Adhésion sous réserve d’assurance',_lg\.assurance\]/.test(html), 'il a son titre');
ok(/trois \(3\) mois à compter de son inscription/.test(html), 'il porte le même délai que l’e-mail');
ok(/seul et entièrement responsable/.test(html) && /Ti-Services n'est pas son assureur/.test(html),
  'il ne relâche rien sur la responsabilité');
ok(/Par dérogation à l'article 2 de la Charte/.test(html),
  'et il résout la contradiction avec la Charte, qui fait DÉCLARER qu’on est assuré');

console.log('\nF — la console peut dire quand on l’a demandé');
ok(/insuranceNoticeAt:Number\(a\.insuranceNoticeAt\)\|\|0/.test(html), 'la fiche relit la date de la demande');
ok(/Demande envoyée le/.test(html) && /échéance le/.test(html), 'et elle l’affiche avec son échéance');
ok(/\(dépassée\)/.test(html), 'une échéance passée se voit');

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
process.exit(f ? 1 : 0);
