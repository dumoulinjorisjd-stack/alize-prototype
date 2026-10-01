/* OÙ S'ARRÊTENT LES CLIENTS, ET POURQUOI ON NE POUVAIT PAS LE SAVOIR.

   « On commence à avoir pas mal de clients, de prestataires, mais aucune commande en
   cours. J'aimerais savoir ce qui fait que les clients ne vont pas plus loin que
   l'inscription, comment déterminer cela ? »

   La réponse était déjà en base. Le parcours de paiement écrit la demande en
   `pending_payment` AVANT d'ouvrir Mollie : un client qui configure sa prestation puis
   renonce laisse une trace. Mais l'unique écoute de `requests` sert à bâtir la
   messagerie et jette tout ce qui n'a ni message ni litige — exactement cette
   population. « Aucune commande en cours » ne permettait donc pas de distinguer
   « personne n'a essayé » de « personne n'a abouti ».

   ON DÉSIGNE LE MUR, PAS UN POURCENTAGE, et chaque compte ne compte qu'une fois. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const JOUR = 864e5, T = 1790000000000;

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1400 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__parcours, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  const parc = (cl, rq, now) => p.evaluate(([cl, rq, now]) => window.__parcours(cl, rq, now), [cl, rq, now]);

  console.log('A — le noyau désigne LE mur, et chaque compte ne compte qu’une fois');
  const C = (uid, nm, push, adr, card, j) => ({ uid: uid, id: uid, name: nm, email: uid + '@e.fr',
    phone: '', zone: 'Gustavia', status: 'valide', push: push, addresses: adr, card: card,
    bookings: 0, history: [], recurring: [], createdAt: T - j * JOUR });
  const clients = [
    C('a', 'Alice Ba', 0, [], 'Aucune carte enregistrée', 30),
    C('b', 'Bruno Ca', 2, [{ id: 1 }], 'Visa ••4242', 20),
    C('c', 'Chloé Da', 1, [], 'Aucune carte enregistrée', 2),
    C('d', 'David Ea', 1, [{ id: 1 }], 'Visa ••1111', 40),
  ];
  const demandes = {
    b: [{ status: 'pending_payment', at: T - 19 * JOUR }],
    c: [{ status: 'payment_failed', at: T - JOUR }],
    d: [{ status: 'paid', at: T - 39 * JOUR }, { status: 'pending_payment', at: T - JOUR }],
  };
  const P = await parc(clients, demandes, T);
  ok(P.total === 4, 'les quatre comptes sont comptés (' + P.total + ')');
  const mur = (k) => (P.murs.find((m) => m.cle === k) || {}).n;
  ok(mur('paiement') === 1, 'un seul n’a JAMAIS atteint le paiement — celui sans aucune demande (' + mur('paiement') + ')');
  ok(mur('commande') === 2, 'deux se sont arrêtés AU paiement : demande écrite, jamais aboutie (' + mur('commande') + ')');
  ok(P.abouti === 1, 'et un seul a commandé (' + P.abouti + ')');
  ok(mur('paiement') + mur('commande') + P.abouti === P.total,
    'les murs et les aboutis font le total : personne n’est compté deux fois ni oublié');
  ok(P.abouti === 1 && mur('commande') === 2,
    'un client qui a DÉJÀ commandé puis abandonné une seconde demande reste « a commandé » — on ne le reclasse pas en bloqué');

  console.log('\nB — les faits se comptent sur les BLOQUÉS, là où ils expliquent quelque chose');
  ok(P.faits.sansPush === 1, 'sur les 3 bloqués, 1 ne peut recevoir aucune notification (' + P.faits.sansPush + ')');
  ok(P.faits.sansAdresse === 2, '2 n’ont aucune adresse enregistrée (' + P.faits.sansAdresse + ')');
  ok(P.faits.sansCarte === 2, '2 n’ont aucune carte (' + P.faits.sansCarte + ')');
  ok(P.faits.vieux === 2, 'et 2 sont inscrits depuis plus de 7 jours — un compte d’hier n’est pas un compte perdu (' + P.faits.vieux + ')');
  ok(/Ce ne sont pas des .tapes/.test(html),
    'et l’écran le DIT : on peut commander sans avoir rien enregistré de tout cela');

  console.log('\nC — le relevé est pris AVANT le filtre de la messagerie');
  const i1 = html.indexOf('S.adminReqStats=stats;');
  const i2 = html.indexOf("if(!chat.length&&!supC.length&&!supP.length&&r.status!=='disputed')return;");
  ok(i1 > 0 && i2 > i1,
    'sans quoi on ne compterait que les demandes QUI ONT UN MESSAGE — c’est-à-dire pas celles qu’on cherche');
  ok(!/onSnapshot\(FB\.f\.collection\(FB\.db,'requests'\)[\s\S]{0,40}?\)[\s\S]{0,4000}?onSnapshot\(FB\.f\.collection\(FB\.db,'requests'\)/.test(html),
    'et il se greffe sur l’écoute qui tournait déjà : pas un second abonnement sur la même collection');

  console.log('\nD — les deux cartes, rendues dans la console');
  const vue = await p.evaluate(([clients, demandes]) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'a@e.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null }; S.adminArtisans = []; S.adminArtsLoaded = true;
    S.adminClients = clients; S.adminClisLoaded = true;
    S.adminReqParClient = demandes; S.adminReqsLus = true;
    S.adminReqStats = { pending_payment: 2, payment_failed: 1, paid: 1, pending: 3 };
    S._fold = { 'a-demandes': true, 'a-parcours': true };
    window.__render();
    const lire = (id) => { const c = [...document.querySelectorAll('.card')].find((x) => (x.querySelector('[data-fold="' + id + '"]'))); return c ? c.innerText.replace(/\s+/g, ' ') : null; };
    return { dem: lire('a-demandes'), par: lire('a-parcours') };
  }, [clients, demandes]);
  ok(!!vue.dem && /3 demandes se sont arrêtées à l’écran de paiement/.test(vue.dem),
    'la carte des demandes met en avant celles qui sont mortes au paiement');
  // Chaque ligne porte son intitulé, son explication, puis son nombre : on vérifie le
  // compte RATTACHÉ au bon statut, pas une juxtaposition de mots.
  ok(!!vue.dem && /Mortes au paiement Demande écrite, paiement jamais abouti 2/.test(vue.dem)
     && /Paiement refusé La carte a été refusée ou la fenêtre fermée 1/.test(vue.dem),
    'et distingue le renoncement du refus de carte — ce ne sont pas les mêmes gestes');
  ok(!!vue.par && /N’a jamais atteint le paiement 1/.test(vue.par) && /S’est arrêté au paiement 2/.test(vue.par),
    'la carte du parcours nomme les deux murs avec leur nombre');
  ok(!!vue.par && /ne peut recevoir aucune notification/.test(vue.par),
    'et dit, sur les bloqués, ce qui peut l’expliquer');

  console.log('\nE — ce qu’on ne sait pas encore ne se dit pas « zéro »');
  const vide = await p.evaluate(() => {
    const S = window.__S;
    S.adminReqsLus = false; S.adminClisLoaded = false; S.adminReqStats = null; S.adminReqParClient = null;
    window.__render();
    const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="a-parcours"]'));
    return c ? c.innerText.replace(/\s+/g, ' ') : null;
  });
  ok(!!vide && /Lecture des comptes et des demandes/.test(vide) && !/0 bloqué/.test(vide),
    'tant que rien n’est lu, la carte patiente — « 0 bloqué » se lirait comme un fait');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
