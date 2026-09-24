/* « VOS AVIS VÉRIFIÉS VOUS FONT REMONTER ET RAPPORTENT PLUS DE MISSIONS. »

   Question de l'éditeur devant cette carte, le 24/09/2026 : « c'est vrai ? ». Non,
   sur les deux affirmations, et le code disait le contraire à trois endroits.

   1. AUCUN AVIS N'EXISTAIT. « Envoyer mon avis » tenait en une ligne —
      `S.mission.status='rated'; render();` — sans une seule écriture. La note vivait
      dans une variable et mourait au rechargement : pas de collection, pas de champ,
      `rating` introuvable dans toutes les fonctions serveur. L'écran CLIENT promet
      pourtant qu'elle est « recueillie par Ti-Services pour veiller à la qualité ».
   2. RIEN NE FAISAIT REMONTER PERSONNE PAR LA NOTE. Le seul tri de prestataires du
      projet classe par statut Fondateur puis par NOMBRE DE MISSIONS ; la diffusion
      d'une demande, elle, ne trie pas du tout (métier, lieu, disponibilité, en ligne,
      puis premier arrivé premier servi).
   3. ET LES CGU DISENT DÉJÀ CE CLASSEMENT CHRONOLOGIQUE. Une promesse commerciale
      faite au prestataire contredisait le contrat qu'il signe.

   Deux corrections, qui ne vont pas l'une sans l'autre. La note PART (c'est ce que les
   deux écrans promettent, et c'est le seul moyen de veiller à la qualité) ; la carte du
   prestataire ne parle plus que de ce qui le fait vraiment remonter, son historique.
   On n'a PAS branché la note sur le classement : ce serait un choix de produit, pas une
   correction — et l'écran de notation promet au client qu'elle n'est pas publiée. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');

(async () => {
  console.log('A — ce que le classement regarde, et ce qu’il ne regarde pas');
  const tri = /out\.sort\(\(x, y\) => \(Number\(y\.founder\) - Number\(x\.founder\)\) \|\| \(y\.jobs - x\.jobs\)\);/.test(fn);
  ok(tri, 'le seul tri de prestataires classe par Fondateur puis par nombre de missions');
  // Aucune fonction serveur ne connaît la note : elle ne peut donc peser sur RIEN
  // de ce que le serveur décide — ni diffusion, ni classement, ni commission.
  const nRating = (fn.match(/\brating\b/g) || []).length;
  ok(nRating === 0, 'aucune fonction serveur ne lit ni n’écrit de note (' + nRating + ' occurrence)');
  ok(/chronologique « premier arrivé, premier servi »/.test(html),
    'et les CGU annoncent un classement chronologique — c’est ce que le code fait');

  console.log('\nB — la note quitte enfin l’appareil');
  ok(/case 'submit-rating':[^\n]*pushReqUpdate\(S\.mission,\{rating:/.test(html),
    '« Envoyer mon avis » écrit la note sur la demande');
  /* ON N'ENVOIE PAS LE STATUT AVEC ELLE. Trois déclencheurs serveur écoutent `status`
     sur `requests` ; un statut qu'ils ne connaissent pas ferait partir une
     notification à tort. Le geste ne doit ajouter AUCUN effet de bord. */
  const ligne = /case 'submit-rating':[^\n]*/.exec(html)[0];
  ok(ligne.indexOf('pushMissionStatus') < 0 && ligne.indexOf('status:') < 0,
    'et elle part SEULE : aucun statut inconnu n’est poussé vers les déclencheurs serveur');

  console.log('\nC — une note est l’avis du client sur une prestation faite et réglée');
  ok(/&& \(!changed\(\)\.hasAny\(\['rating','ratedAt'\]\)\s*\n\s*\|\| \(resource\.data\.status == 'paid'/.test(rules),
    'la règle ne l’accepte qu’une fois la prestation payée — c’est ce qui la rend vérifiable');
  ok(/request\.resource\.data\.rating >= 1[\s\S]{0,80}?request\.resource\.data\.rating <= 5/.test(rules),
    'et seulement entre 1 et 5 — une note hors bornes fausserait toute moyenne future');
  const bloc = rules.slice(rules.indexOf('|| (isProvider()'), rules.indexOf('// Le client ne peut supprimer'));
  ok(/!changed\(\)\.hasAny\(\['rating','ratedAt'\]\)/.test(bloc),
    'et le prestataire ne se note pas lui-même');

  console.log('\nD — aucun écran ne promet ce que le code ne fait pas');
  ok(html.indexOf('Vos avis vérifiés vous font remonter') < 0,
    'la carte du prestataire ne promet plus qu’un avis le fait remonter');
  ok(html.indexOf('avis de la communauté contrôlés') < 0,
    'et la vitrine ne dit plus contrôler des avis de communauté avant l’activation');
  ok(/Votre note est confidentielle[\s\S]{0,120}?Elle n'est pas publiée\./.test(html),
    'l’écran de notation continue de dire au client que sa note n’est pas publiée');

  console.log('\nE — mesuré dans le navigateur : l’écriture part vraiment');
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 428, height: 1000 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.onboarded = true; S.guest = false; S.lang = 'fr'; S.demoMode = false; S.persona = 'client'; S.clientNav = 'wallet'; S.detail = null; S.draft = null;
    S.mission = { reqId: 'r1', _id: 'm1', status: 'paid', svc: 'menage', svcName: 'Ménage',
      when: 'Aujourd’hui', slot: '14:00', duration: 2, unit: 'h', rate: 35, zone: 'Gustavia',
      tip: 0, chat: [], provider: { nm: 'Laure G.', ini: 'LG' } };
    window.__ecrites = [];
    window.__setFB({ db: {}, auth: { currentUser: { uid: 'cli' } },
      f: { doc: () => ({}), updateDoc: (ref, patch) => { window.__ecrites.push(patch); return Promise.resolve(); } } });
    window.__render();
  });
  await p.waitForTimeout(400);
  const vues = await p.evaluate(() => document.querySelectorAll('#rateStars button').length);
  ok(vues === 5, 'l’écran de notation est bien celui qu’on mesure (' + vues + ' étoiles)');
  await p.evaluate(() => {
    document.querySelector('#rateStars button[data-star="4"]').click();
    document.querySelector('[data-act="submit-rating"]').click();
  });
  await p.waitForTimeout(300);
  const ecrit = await p.evaluate(() => (window.__ecrites || [])[0] || null);
  ok(!!ecrit && ecrit.rating === 4,
    'quatre étoiles envoyées donnent bien une note de 4 sur la demande (' + JSON.stringify(ecrit) + ')');
  ok(!!ecrit && typeof ecrit.ratedAt === 'number' && !('status' in ecrit),
    'la note est datée, et le statut ne voyage pas avec elle');
  const nb = await p.evaluate(() => (window.__ecrites || []).length);
  ok(nb === 1, 'une seule écriture pour un seul avis (' + nb + ')');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();

  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
