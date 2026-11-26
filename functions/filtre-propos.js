/* FILTRE DES PROPOS — noyau pur (audit App Store, 26/11/2026).
 *
 * Règle 1.2 d'Apple (Safety — User-Generated Content, version du 16/10/2026) : une app
 * qui fait circuler du contenu entre utilisateurs doit offrir « a method for filtering
 * objectionable material from being posted », en plus du signalement, du blocage et
 * d'un contact publié. Ti-Services avait les trois derniers ; voici le premier.
 *
 * Ce qu'il fait : refuser d'envoyer un texte qui contient une insulte, une injure
 * raciste ou homophobe, une grossièreté sexuelle ou une menace de mort, en français,
 * anglais ou portugais. Il ne corrige rien et ne censure pas en silence : l'écran dit
 * pourquoi, la personne reformule. Les simples jurons d'humeur (« zut », « merde »,
 * « putain » isolé) ne sont PAS bloqués : ce n'est pas une attaque contre quelqu'un.
 * Liste fermée, mots entiers (après minuscules, accents retirés, l33t courant ramené),
 * pour ne pas bloquer « content », « contact », « concombre ». Écartés exprès parce
 * qu'ils ont un sens courant innocent : « retard » (en retard), « crevé » (fatigué).
 * Miroir dans index.html (proposInjurieux), comparé par tests/harn/test-filtre-propos.js.
 * Pur : ni réseau, ni état. */

const TERMES = [
  // français
  'connard', 'connards', 'connasse', 'conasse', 'salope', 'salopes', 'salaud', 'salauds', 'encule', 'encules', 'enculer',
  'fils de pute', 'sale pute', 'pute', 'putes', 'batard', 'batards', 'nique ta mere', 'ntm', 'fdp', 'pd', 'pede', 'pedes',
  'tapette', 'negre', 'negres', 'bougnoule', 'bougnoules', 'youpin', 'bamboula', 'sale noir', 'sale arabe',
  'je vais te tuer', 'je vais te buter', 'je vais te crever', 'je vais te defoncer', 'suce ma',
  // anglais
  'fuck', 'fucking', 'fucker', 'motherfucker', 'fuck you', 'cunt', 'bitch', 'bitches', 'whore', 'slut', 'asshole',
  'nigger', 'nigga', 'faggot', 'fag', 'i will kill you', 'i ll kill you',
  // portugais
  'caralho', 'porra', 'puta', 'foda se', 'fodase', 'filho da puta', 'puta que pariu', 'viado', 'cabrao', 'vadia', 'arrombado',
  'vou te matar', 'vou matar te', 'vai tomar no cu',
];

function normaliser(t) {
  return String(t || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ').trim();
}

/* Le premier terme refusé trouvé, ou '' si le texte peut partir. */
function proposInjurieux(texte) {
  const t = ' ' + normaliser(texte) + ' ';
  if (t.length < 3) return '';
  for (const terme of TERMES) {
    if (t.indexOf(' ' + terme + ' ') >= 0) return terme;
  }
  return '';
}

module.exports = { TERMES, normaliser, proposInjurieux };
