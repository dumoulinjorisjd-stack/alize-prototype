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
  const C = (uid, nm, push, adr, card, j, jal) => ({ uid: uid, id: uid, name: nm, email: uid + '@e.fr',
    phone: '', zone: 'Gustavia', status: 'valide', push: push, addresses: adr, card: card,
    bookings: 0, history: [], recurring: [], createdAt: T - j * JOUR, jalons: jal || {} });
  const clients = [
    // a : inscrit, n'a RIEN fait ensuite — pas même ouvert le catalogue.
    C('a', 'Alice Ba', 0, [], 'Aucune carte enregistrée', 30, {}),
    // a2 : a parcouru le catalogue et touché un métier pas encore ouvert, puis reculé.
    C('a2', 'Anna Ga', 1, [], 'Aucune carte enregistrée', 10, { catalogue: T - 9 * JOUR, indispo: T - 9 * JOUR }),
    // b : a configuré une prestation, jamais vu le paiement.
    C('b', 'Bruno Ca', 2, [{ id: 1 }], 'Visa ••4242', 20, { catalogue: T - 19 * JOUR, config: T - 19 * JOUR, revenu: T - 19 * JOUR }),
    // c : a vu l'écran de paiement et n'a pas confirmé.
    C('c', 'Chloé Da', 1, [], 'Aucune carte enregistrée', 2, { catalogue: T - JOUR, config: T - JOUR, paiement: T - JOUR }),
    // d : a confirmé, la demande est morte au paiement.
    C('d', 'David Ea', 1, [{ id: 1 }], 'Visa ••1111', 40, { catalogue: T - 39 * JOUR, config: T - 39 * JOUR, paiement: T - 39 * JOUR }),
    // e : a commandé AVANT que les jalons existent — il n'en porte aucun.
    C('e', 'Eva Fa', 1, [{ id: 1 }], 'Visa ••2222', 50, {}),
  ];
  const demandes = {
    d: [{ status: 'pending_payment', at: T - 39 * JOUR }],
    e: [{ status: 'paid', at: T - 49 * JOUR }, { status: 'pending_payment', at: T - JOUR }],
  };
  const P = await parc(clients, demandes, T);
  const mur = (k) => (P.murs.find((m) => m.cle === k) || {}).n;
  ok(P.total === 6, 'les six comptes sont comptés (' + P.total + ')');
  ok(mur('catalogue') === 1, 'un seul n’a JAMAIS touché au catalogue (' + mur('catalogue') + ')');
  ok(mur('config') === 1, 'un a regardé le catalogue sans rien configurer — ce n’est pas le même (' + mur('config') + ')');
  ok(mur('paiement') === 1, 'un a configuré sans jamais voir le paiement (' + mur('paiement') + ')');
  ok(mur('confirme') === 1, 'un a vu le paiement et n’a pas confirmé (' + mur('confirme') + ')');
  ok(mur('commande') === 1, 'un a confirmé, et sa demande est morte au paiement (' + mur('commande') + ')');
  ok(P.abouti === 1, 'et un seul a commandé (' + P.abouti + ')');
  ok(mur('catalogue') + mur('config') + mur('paiement') + mur('confirme') + mur('commande') + P.abouti === P.total,
    'les cinq murs et les aboutis font le total : personne n’est compté deux fois ni oublié');

  /* ON NE RÉTROGRADE PERSONNE FAUTE DE JALON. Les comptes d'avant cette mise en ligne
     n'en portent aucun : sans cette règle, « Eva », qui a bel et bien commandé, serait
     rangée au mur « n'a jamais configuré ». C'est la preuve la plus FORTE qui classe. */
  ok(P.abouti === 1 && mur('catalogue') === 1,
    'un compte qui a commandé SANS aucun jalon reste « a commandé » : sa demande prouve tout le reste');
  // Seule « Eva » est antérieure aux jalons : « David » porte les siens, il n'est donc
  // pas dans ce cas, et le compteur ne doit PAS le ramasser au passage.
  ok(P.sansJalon === 1, 'et l’écran dit combien de comptes sont dans ce cas — un seul (' + P.sansJalon + ')');

  console.log('\nB — les faits se comptent sur les BLOQUÉS, là où ils expliquent quelque chose');
  ok(P.bloques === 5, 'cinq comptes sont bloqués quelque part (' + P.bloques + ')');
  /* LE RENSEIGNEMENT LE PLUS UTILE DE TOUS : il ne situe personne sur le chemin, mais il
     dit ce qu'on vous demande et que vous ne vendez pas. C'est un FAIT, pas une marche. */
  ok(P.faits.indispo === 1, 'un a touché un métier pas encore ouvert (' + P.faits.indispo + ')');
  ok(/PARCOURS_MURS=\[\['catalogue'/.test(html) && !/\['indispo','A demandé[^\]]*\][\s\S]{0,120}?PARCOURS_MURS/.test(html),
    'et « a demandé un métier pas encore ouvert » reste un fait, jamais un mur');
  ok(P.faits.revenus === 1, 'un seul est revenu un autre jour — les autres ne sont jamais repassés (' + P.faits.revenus + ')');
  ok(P.faits.sansPush === 1, 'un ne peut recevoir aucune notification (' + P.faits.sansPush + ')');
  ok(P.faits.sansAdresse === 3, 'trois n’ont aucune adresse enregistrée (' + P.faits.sansAdresse + ')');
  ok(P.faits.vieux === 4, 'quatre sont inscrits depuis plus de 7 jours — un compte d’hier n’est pas un compte perdu (' + P.faits.vieux + ')');
  ok(/Ce ne sont pas des .tapes/.test(html),
    'et l’écran le DIT : on peut commander sans avoir rien enregistré de tout cela');
  /* « REVENU » N'EST PAS UNE MARCHE. On peut tout faire le jour de son inscription :
     en faire une étape inventerait un ordre que rien n'impose. */
  ok(/PARCOURS_MURS=\[\['catalogue'/.test(html)
     && !/PARCOURS_MURS=\[[\s\S]{0,260}?'revenu'/.test(html),
    'et « revenu un autre jour » reste un fait, jamais un mur');

  console.log('\nC — le relevé est pris AVANT le filtre de la messagerie');
  const i1 = html.indexOf('S.adminReqs=reqs;');
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
    // La liste est devenue la source UNIQUE : les deux cartes en dérivent, donc on ne
    // peut plus leur donner des totaux qui ne correspondraient à aucune demande.
    S.adminReqs = [
      { status: 'pending_payment', uid: 'd', at: 1 }, { status: 'pending_payment', uid: 'x1', at: 1 },
      { status: 'payment_failed', uid: 'x2', at: 1 }, { status: 'paid', uid: 'e', at: 1 },
      { status: 'pending', uid: 'x3', at: 1 }, { status: 'pending', uid: 'x4', at: 1 },
      { status: 'pending', uid: 'x5', at: 1 }];
    S.adminReqsLus = true;
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
  ok(!!vue.par && /N’a jamais touché au catalogue 1/.test(vue.par)
     && /A regardé, n’a rien configuré 1/.test(vue.par)
     && /A configuré, jamais vu le paiement 1/.test(vue.par)
     && /A vu le paiement, n’a pas confirmé 1/.test(vue.par),
    'la carte du parcours nomme les cinq murs avec leur nombre');
  ok(!!vue.par && /a touché un métier pas encore ouvert/.test(vue.par),
    'et met en avant ceux qui ont demandé un métier qu’on ne vend pas');
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

  /* ── LES COMPTES DE TEST NE SONT PAS DES CLIENTS ──────────────────────────────
     « Dedans il y a peut-être nos anciens tests qui faussent les informations. » Oui.
     Mais un chiffre qui écarte des gens EN SILENCE est pire qu'un chiffre trop gros :
     on ne devine donc rien — ni « test » dans l'adresse, ni un nom qui y ressemble — et
     l'écran dit toujours combien de comptes sont écartés. */
  console.log('\nF — les comptes de test, écartés sans jamais être devinés');
  const avecTests = clients.concat([
    { uid: 'z1', id: 'z1', name: 'Console', email: 'contact@ti-services.fr', zone: 'Gustavia',
      status: 'valide', push: 0, addresses: [], card: '', bookings: 0, createdAt: T - 60 * JOUR, jalons: {} },
    { uid: 'z2', id: 'z2', name: 'Démo magasin', email: 'demo.client@ti-services.fr', zone: 'Gustavia',
      status: 'valide', push: 0, addresses: [], card: '', bookings: 0, createdAt: T - 60 * JOUR, jalons: {} },
    { uid: 'z3', id: 'z3', name: 'Mon essai', email: 'moi@exemple.fr', zone: 'Gustavia', test: true,
      status: 'valide', push: 0, addresses: [], card: '', bookings: 0, createdAt: T - 60 * JOUR, jalons: {} },
    // CELUI-CI DOIT RESTER : son nom ressemble à un test, mais rien ne le déclare.
    { uid: 'z4', id: 'z4', name: 'Testard', email: 'test.famille@exemple.fr', zone: 'Gustavia',
      status: 'valide', push: 0, addresses: [], card: '', bookings: 0, createdAt: T - 60 * JOUR, jalons: {} },
  ]);
  const PT = await parc(avecTests, demandes, T);
  ok(PT.exclus === 3, 'trois comptes sont écartés : l’adresse d’administration, la démo des magasins, et celui coché à la main (' + PT.exclus + ')');
  ok(PT.total === 7, 'et sept comptes restent comptés (' + PT.total + ')');
  ok(PT.total === avecTests.length - 3,
    'un compte qui s’APPELLE « Testard » et dont l’adresse commence par « test. » reste compté : rien ne le déclare, on ne devine pas');

  const vueT = await p.evaluate(([cl, rq]) => {
    const S = window.__S;
    S.adminClients = cl; S.adminClisLoaded = true;
    S.adminReqs = [{ status: 'paid', uid: 'e', at: 1 }, { status: 'pending_payment', uid: 'd', at: 1 },
      { status: 'pending_payment', uid: 'z1', at: 1 }];
    S.adminReqsLus = true; S._fold = { 'a-parcours': true, 'a-demandes': true };
    window.__render();
    const lire = (id) => { const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="' + id + '"]')); return c ? c.innerText.replace(/\s+/g, ' ') : null; };
    return { par: lire('a-parcours'), dem: lire('a-demandes') };
  }, [avecTests, demandes]);
  ok(!!vueT.par && /3 comptes de test écartés/.test(vueT.par),
    'la carte le DIT : elle n’écarte jamais quelqu’un en silence');
  // Les demandes d'un compte de test gonflent autant les statuts que le parcours :
  // les écarter d'un seul côté ferait deux cartes qui se contredisent.
  ok(!!vueT.dem && /1 demande de comptes de test est écartée/.test(vueT.dem),
    'et la carte des demandes écarte les leurs, par la même porte');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
