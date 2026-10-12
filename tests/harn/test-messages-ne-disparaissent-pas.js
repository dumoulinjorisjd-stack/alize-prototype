/* « LES MESSAGES DANS LA MESSAGERIE DE L'APPLICATION ONT DISPARU DE LA CONSOLE, LA
   CONVERSATION DE CE MATIN AYANT DISPARU JE N'AI PLUS LE MOYEN DE PROUVER CE QU'ELLE M'A
   DIT, CELA NE DOIT PLUS SE REPRODUIRE. » — l'éditeur, le 12/10/2026.

   DEUX CAUSES, ET LA PREMIÈRE ÉTAIT À CINQUANTE PIXELS DE LA CONVERSATION. La console
   portait un bouton corbeille collé à chaque ligne, qui écrivait `support: []` et
   `messages: []` : la conversation était DÉTRUITE, sans copie. Son arme-puis-confirme
   dure quatre secondes, c'est-à-dire exactement le temps qu'il faut pour s'apercevoir
   qu'on a raté sa cible et retoucher au même endroit.

   LA SECONDE ÉTAIT DANS L'ARCHIVE ELLE-MÊME. Elle existait, mais elle était prise AU
   MOMENT DE LA SUPPRESSION du compte — et le commentaire du serveur disait déjà pourquoi
   elle ne pouvait pas tenir : « les fiches ont pu être effacées AVANT nous ». Une archive
   qui dépend du bon ordre de deux effacements n'est pas une archive. La copie se fait
   désormais À L'ÉCRITURE, dans une collection qu'aucun compte ne peut toucher.

   CE QUE CETTE ÉPREUVE TIENT :
   • plus aucune ligne de l'application n'écrit un tableau de messages VIDE ;
   • l'archive est une UNION : elle ne rétrécit jamais, même si la source rétrécit ;
   • on ne réécrit QUE s'il y a du neuf (sinon deux appareils se renverraient le compte) ;
   • une conversation classée qui reçoit un message REVIENT — sans quoi ranger rendrait
     sourd, ce qui serait pire que l'ancien bouton. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const ARCH = require(path.join(RACINE, 'functions', 'archive-messages.js'));
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — plus rien n’efface une conversation');
/* ON CHERCHE L'ÉCRITURE, PAS LE MOT « SUPPRIMER » : c'est le geste qui détruisait, et un
   bouton peut changer de nom sans changer de geste. Mais un tableau vide n'est pas en soi
   une faute — l'application en construit en mémoire (une conversation qui n'existe pas
   encore) et en lit comme valeur de repli. Ce qu'on interdit, c'est un tableau vide
   envoyé À LA BASE : on n'examine donc que les appels d'écriture. */
const ECRITURES = /(?:updateDoc|setDoc)\s*\(/g;
const vidages = [];
let mm;
while ((mm = ECRITURES.exec(APP)) !== null) {
  const bout = APP.slice(mm.index, mm.index + 400);
  const fin = bout.indexOf(');');
  const appel = fin > 0 ? bout.slice(0, fin) : bout;
  if (/(support|messages|supportClient|supportPro)\s*:\s*\[\s*\]/.test(appel)) vidages.push(appel.slice(0, 120));
}
ok(vidages.length === 0,
  'aucun appel d’écriture n’envoie un tableau de messages vide à la base'
  + (vidages.length ? ' (' + vidages[0] + ')' : ''));
ok(/supportClos/.test(APP) && /chatClos/.test(APP),
  'le geste de la console pose une DATE de classement au lieu d’effacer');
ok(/conversationClassee/.test(APP), 'et le classement a un nom, donc un seul endroit où se décider');

console.log('B — l’archive se prend à l’écriture, pas à la mort');
ok(/exports\.archiverMessagesSupport\s*=\s*onDocumentWritten\('users\/\{uid\}'/.test(SRV),
  'un déclencheur serveur copie chaque message dès qu’il est écrit');
ok(/ARCH\.supportBouge\(avant, apres\)/.test(SRV),
  'et il sort TÔT quand la conversation n’a pas bougé : il voit toutes les écritures de `users`');
ok(/if \(!f\.ajoutes\) return;/.test(SRV),
  'il n’écrit que s’il y a du NEUF — sinon deux appareils se renverraient l’archive sans fin');
/* L'ancienne archive REMPLAÇAIT le tableau : appelée avec une fiche à moitié lue, elle
   réduisait l'archive au lieu de la compléter. */
ok(/ARCH\.fusionMessages\(deja\.support, brut, ARCHIVE_MSG_MAX\)/.test(SRV),
  'et l’archive de la purge FUSIONNE désormais, au lieu de remplacer');

console.log('C — le noyau de la fusion : on n’enlève jamais rien');
const m = (at, from, text) => ({ at, from, text });
const anc = [m(100, 'client', 'bonjour'), m(200, 'admin', 'je vous écoute')];
const u1 = ARCH.fusionMessages(anc, [m(300, 'client', 'merci')], 400);
ok(u1.liste.length === 3 && u1.ajoutes === 1, 'un message neuf s’ajoute (' + u1.liste.length + ', +' + u1.ajoutes + ')');
/* LE CŒUR DU DÉFAUT : la source a été vidée, l'archive ne doit pas suivre. */
const u2 = ARCH.fusionMessages(u1.liste, [], 400);
ok(u2.liste.length === 3 && u2.ajoutes === 0,
  'la source vidée ne vide PAS l’archive : c’est exactement le cas qu’on protège');
const u3 = ARCH.fusionMessages(u1.liste, [m(200, 'admin', 'je vous écoute')], 400);
ok(u3.liste.length === 3 && u3.ajoutes === 0, 'un message déjà archivé n’ajoute rien, et ne se duplique pas');
/* Deux appareils n'écrivent pas le tableau dans le même ordre. */
const u4 = ARCH.fusionMessages(u1.liste, [m(300, 'client', 'merci'), m(100, 'client', 'bonjour')], 400);
ok(u4.ajoutes === 0 && u4.liste.map((x) => x.at).join(',') === '100,200,300',
  'l’ordre d’arrivée ne compte pas, et la sortie est triée par instant d’envoi');
const u5 = ARCH.fusionMessages([], [m(10, '', ''), m(20, 'client', 'x')], 400);
ok(u5.liste.length === 1, 'un message sans auteur ni texte n’est pas un message');
const gros = []; for (let i = 1; i <= 12; i++) gros.push(m(i, 'client', 'm' + i));
const u6 = ARCH.fusionMessages([], gros, 5);
ok(u6.liste.length === 5 && u6.tronque === true && u6.total === 12 && u6.liste[0].at === 8,
  'au plafond on garde les DERNIERS, et l’on dit qu’on a tronqué (' + u6.liste.length + '/' + u6.total + ')');
const b1 = ARCH.supportBouge({ support: [m(1, 'a', 'x')] }, { support: [m(1, 'a', 'x')] });
const b2 = ARCH.supportBouge({ support: [m(1, 'a', 'x')] }, { support: [m(1, 'a', 'y')] });
const b3 = ARCH.supportBouge({ support: [m(1, 'a', 'x')] }, null);
ok(b1 === false && b2 === true && b3 === false,
  'le raccourci compare le CONTENU, et un compte effacé ne déclenche rien (il n’y a plus rien à copier)');
/* L'identité ne doit pas être écrasée par une fiche à moitié lue. */
const id = ARCH.identiteArchive({ name: '', email: '', role: '' }, { nom: 'Aurélie B.', email: 'a@b.fr', role: 'artisan' });
ok(id.nom === 'Aurélie B.' && id.role === 'artisan',
  'et une fiche vide ne remplace jamais une identité déjà connue');

(async () => {
  console.log('D — classer n’est pas détruire, et ne rend pas sourd');
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__cmd && window.__cmd.classee);

  const noy = await p.evaluate(() => {
    const C = window.__cmd.classee;
    return { jamais: C(0, 5000), range: C(9000, 5000), revenu: C(5000, 9000), pile: C(5000, 5000) };
  });
  ok(noy.jamais === false, 'sans date de classement, une conversation est en cours');
  ok(noy.range === true, 'classée après le dernier message, elle sort de la liste');
  ok(noy.revenu === false,
    'MAIS un message reçu APRÈS le classement la ramène : ranger ne doit pas rendre sourd');
  ok(noy.pile === true, 'au même instant elle reste classée — le geste vient après le message qu’on vient de lire');

  const ecran = (clos, deplie) => p.evaluate(({ clos, deplie }) => {
    const S = window.__S;
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: function () { return Promise.resolve(); },
        setDoc: function () { return Promise.resolve(); },
        getDoc: function () { return Promise.resolve({ exists: function () { return false; }, data: function () { return {}; } }); } },
      fn: { httpsCallable: function () { return function () { return new Promise(function () {}); }; } }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'admin'; S.admin = { view: 'msg' };
    S._fold = deplie ? { 'a-msg-clos': 1 } : {};
    S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.support = false; S.supportSide = null; S.adminSupervise = false;
    S.generalSupport = false; S.genUser = null; S.mission = null;
    S.adminThreads = []; S.adminGeneralArchive = [];
    S.adminGeneral = [{ uid: 'u1', name: 'Nadine Pitou', role: 'artisan', clos: clos, ts: 5000,
      support: [{ from: 'client', text: 'Question sur le versement', at: 5000 }],
      supReadUser: 0, supReadAdmin: 0 }];
    window.__render();
    const v = document.getElementById('view');
    const t = (v.textContent || '').replace(/\s+/g, ' ');
    return { txt: t, boutons: v.querySelectorAll('[data-adm^="delmsg"]').length,
      rouvre: v.querySelectorAll('[data-adm^="remsg"]').length };
  }, { clos, deplie });

  const vivant = await ecran(0, false);
  ok(vivant.boutons === 1 && vivant.rouvre === 0, 'une conversation en cours offre « classer »');
  ok(!/Conversations class/.test(vivant.txt), 'et le bloc des classées ne paraît pas quand il n’y en a aucune');

  /* REPLIÉ, c'est la convention de toute la console — mais le bloc doit se VOIR et se
     COMPTER, sinon une conversation classée aurait exactement l'air d'une conversation
     détruite, qui est le défaut qu'on corrige. */
  const range = await ecran(9000, false);
  ok(/Conversations classées/.test(range.txt),
    'classée, elle a son bloc, nommé à l’écran');
  ok(/1 conversation rangée/.test(range.txt),
    'et le bloc la COMPTE : un bloc vide se lirait comme une conversation perdue');
  ok(!/Nadine Pitou/.test(range.txt) && range.boutons === 0,
    'elle a bien quitté la liste du dessus — c’est le geste qu’on venait faire');

  const ouvert = await ecran(9000, true);
  ok(/Nadine Pitou/.test(ouvert.txt) && /Question sur le versement/.test(ouvert.txt),
    'dépliée, la conversation est là, son message compris');
  ok(/rien n’est effac/.test(ouvert.txt) || /rien n.est effac/.test(ouvert.txt),
    'et l’écran DIT que rien n’est effacé — c’est la promesse qui remplace l’ancien bouton');
  ok(ouvert.rouvre === 1, 'avec un bouton pour la remettre en cours');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
