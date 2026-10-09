/* « J'AI BIEN ACTIVÉ LES NOTIFICATIONS ET J'AI REÇU LE MAIL, MAIS PAS LA NOTIFICATION. »

   L'E-MAIL EST LA PREUVE. `mailArtisansSansAppareil` n'écrit qu'aux prestataires que le
   serveur ne peut PAS joindre par notification : le recevoir signifie qu'aucun jeton
   n'était enregistré pour ce compte.

   OR « Notifications activées » SE DISAIT DEPUIS LA PERMISSION DU NAVIGATEUR, pas depuis
   le jeton arrivé en base. L'enregistrement avait quatre sorties muettes et son écriture
   était enveloppée d'un `catch` vide : tout pouvait échouer, l'écran annonçait le succès.

   ET L'ÉCHEC ÉTAIT DÉFINITIF : `pushRegUid` était posé AVANT l'écriture, donc une
   écriture ratée interdisait toute nouvelle tentative. Retoucher le bouton ne pouvait
   plus rien y faire. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ permissions: ['notifications'], viewport: { width: 390, height: 1200 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__push);

  /* A — LE SERVEUR : l'e-mail est bien le repli de ceux qu'on ne peut pas joindre. */
  console.log('A — pourquoi un e-mail plutôt qu’une notification');
  const mailFn = SRV.slice(SRV.indexOf('async function mailArtisansSansAppareil'),
    SRV.indexOf('async function mailArtisansSansAppareil') + 900);
  ok(/const sansAppareil = \(targetUids \|\| \[\]\)\.filter\(\(uid\) => !joignables\[uid\]\)/.test(mailFn),
    'le courriel ne part qu’aux prestataires SANS jeton : le recevoir prouve qu’il n’y en avait pas');
  ok(/\(ud\.pushTokens \|\| \[\]\)\.forEach/.test(SRV),
    'et les jetons se lisent sur `users/{uid}.pushTokens`');

  /* B — LE MOT RENDU, et la phrase qui va avec. */
  console.log('B — l’enregistrement dit POURQUOI il n’a pas eu lieu');
  const mots = await p.evaluate(() => {
    const E = window.__push.etats();
    const m = {}; E.forEach(function (e) { m[e] = window.__push.phrase(e); });
    return { etats: E, phrases: m };
  });
  ok(mots.etats.length >= 6, 'la liste des issues est FERMÉE (' + mots.etats.length + ')');
  ok(mots.phrases['ok'] === 'Notifications activées' && mots.phrases['deja'] === 'Notifications activées',
    'enregistré : on dit que c’est activé');
  ok(/pas pu être enregistré/.test(mots.phrases['ecriture']) && /pas pu être enregistré/.test(mots.phrases['pas-de-jeton']),
    'écriture ratée ou jeton absent : on NE dit PAS que c’est activé');
  ok(/Reconnectez-vous/.test(mots.phrases['pas-de-session']), 'sans session, on dit quoi faire');
  ok(new Set(Object.values(mots.phrases)).size >= 4, 'et les issues ne se confondent pas toutes');

  /* C — CHAQUE SORTIE REND SON MOT, au lieu de se taire. */
  console.log('C — aucune sortie muette');
  const sorties = await p.evaluate(async () => {
    const out = {};
    window.__setFB(null);
    out.sansSession = await window.__push.enregistre('artisan', true);
    window.__setFB({ auth: { currentUser: null }, db: {}, f: {}, fn: {}, functions: {} });
    out.sansUtilisateur = await window.__push.enregistre('artisan', true);
    return out;
  });
  ok(sorties.sansSession === 'pas-de-session' && sorties.sansUtilisateur === 'pas-de-session',
    'sans session, elle le DIT au lieu de rendre undefined (' + sorties.sansSession + ')');

  /* D — UNE ÉCRITURE RATÉE N'EST PLUS DÉFINITIVE. C'est le cœur : `pushRegUid` se posait
     AVANT l'écriture, donc un échec passager laissait croire à l'enregistrement et
     `pushNeedsRegister` refusait toute nouvelle tentative — retoucher le bouton ne
     pouvait plus rien y faire, et la personne attendait indéfiniment.

     ON ÉPROUVE LA COQUILLE NATIVE, intégralement simulable (le SDK de messagerie du Web
     se télécharge depuis gstatic, hors d'atteinte d'ici). C'est le MÊME enchaînement :
     jeton, écriture, pose du repère. */
  console.log('D — un échec d’écriture laisse une seconde chance');
  const retry = await p.evaluate(async () => {
    let echoue = true, ecritures = 0, jetons = 0;
    window.Capacitor = { isNativePlatform: function () { return true; },
      Plugins: { FirebaseMessaging: {
        requestPermissions: function () { return Promise.resolve({ receive: 'granted' }); },
        getToken: function () { jetons++; return Promise.resolve({ token: 'JETON-APPAREIL' }); } } } };
    const ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: function () { return {}; }, arrayUnion: function (x) { return ['∪', x]; },
        serverTimestamp: function () { return 0; },
        setDoc: function (ref, data) { ecritures++;
          if (echoue) return Promise.reject(new Error('réseau'));
          ecrits.push(data); return Promise.resolve(); } },
      fn: { httpsCallable: function () { return function () { return new Promise(function () {}); }; } }, functions: {} });
    const premier = await window.__push.enregistre('artisan', true);
    const besoinApres = window.__push.besoin('pro1');
    echoue = false;
    const second = await window.__push.enregistre('artisan', true);
    const besoinFinal = window.__push.besoin('pro1');
    const troisieme = await window.__push.enregistre('artisan', true);
    delete window.Capacitor;
    return { premier: premier, besoinApres: besoinApres, second: second,
      besoinFinal: besoinFinal, troisieme: troisieme, jetons: jetons, ecrits: ecrits };
  });
  ok(retry.premier === 'ecriture',
    'une écriture ratée est RENDUE comme telle, au lieu d’être avalée (' + retry.premier + ')');
  ok(retry.besoinApres === true,
    'et le compte reste « à enregistrer » : c’est ce qui rend une seconde tentative possible');
  ok(retry.second === 'ok' && retry.besoinFinal === false,
    'le second essai aboutit (' + retry.second + ')');
  ok(retry.troisieme === 'deja',
    'et le troisième ne refait rien, en le disant (' + retry.troisieme + ')');
  const d0 = retry.ecrits[0] || {};
  ok(d0.notifOn === true && d0.role === 'artisan' && Array.isArray(d0.pushTokens),
    'ce qui est écrit est bien le jeton, le rôle et le consentement — ce que le serveur lit');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
