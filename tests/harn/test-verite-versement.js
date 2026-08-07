/* NE JAMAIS ANNONCER UN PAIEMENT QU'ON N'A PAS FAIT.
   Le prestataire a reçu, à la même seconde, deux messages contraires : l'écran de fin de
   mission affichait « Vous avez été payé — +4,50 € versés sur votre compte », pendant que
   la notification disait « Un paiement n'a pas pu vous être versé ». L'écran ne regardait
   tout simplement pas si le versement avait eu lieu : il l'affirmait. Et sa fiche compte
   ajoutait « rien à faire de votre côté » alors qu'il lui manquait son IBAN et sa pièce
   d'identité chez Mollie — c'est-à-dire précisément ce qui bloquait son argent.
   C'est Mollie qui dit la vérité. Les écrans doivent la répéter, pas la contredire. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

console.log('A — l’état réel du versement descend jusqu’au prestataire');
ok(/if\(r\.molliePayout!=null&&m\.molliePayout!==r\.molliePayout\)/.test(src),
  'l’écoute de la demande recopie l’état du versement écrit par le serveur');
ok(/if\(r\.molliePayoutNet!=null&&m\.molliePayoutNet!==r\.molliePayoutNet\)/.test(src),
  'ainsi que le net réellement dû');
// ROUTÉ N'EST PAS REÇU : une route acceptée par Mollie réserve la somme, elle ne la
// verse pas — le tableau de bord Mollie l'a montré noir sur blanc (« Montant routé
// 4,50 € » et « Règlement en attente » sur le même paiement). Seul le virement fait à
// la main a réellement quitté nos comptes pour les siens.
ok(/const verse=\(m\.molliePayout==='manuel'\);/.test(src),
  '« payé » n’est vrai que pour un virement réellement fait à la main');
ok(/const reserve=\(m\.molliePayout==='routed'\);/.test(src),
  'et « routé » a son propre état : réservé, pas encaissé');

console.log('B — ce qu’on demande au prestataire suit ce que MOLLIE demande');
// Réclamer un IBAN à qui n'en doit pas est aussi faux que promettre un virement non parti.
// Mollie distingue trois états, et l'app doit les distinguer aussi : « needs-data » (il
// manque vraiment des pièces), et les autres (Mollie vérifie — rien à faire).
ok(/needsData=\(st==='pending'&&S\.proMollieOnb==='needs-data'\)/.test(src),
  'l’état « il manque des pièces » vient de Mollie, pas d’une supposition');
const iNeeds = src.indexOf("needsData?`<p class=\"mini\"><b>Il manque des éléments");
const iTrav = src.indexOf("(st==='pending'&&molliePeutTravailler())?`<p class=\"mini\"><b>Rien à faire.</b>");
ok(iNeeds > 0 && iTrav > iNeeds,
  'et il est traité AVANT : la branche suivante ne concerne que les dossiers auxquels Mollie ne demande rien');
ok(/<b>Rien à faire\.<\/b> Vous pouvez accepter des missions/.test(src),
  'à qui Mollie ne demande rien, on le dit en trois mots — et on s’arrête là');
ok(!/déclenche à votre première transaction/.test(src),
  'sans lui expliquer la plomberie bancaire : il n’a rien à en faire');
ok(/S\.proMollieOnb==='needs-data'\?' Il manque une pièce à votre dossier/.test(src),
  'l’écran de fin de mission fait la même distinction');

console.log('B bis — on n’alerte QUE s’il y a une action à faire');
const fnSrv = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const NP = fnSrv.slice(fnSrv.indexOf('async function notifyArtisanMollieProblem'),
  fnSrv.indexOf('// Bonne nouvelle proactive'));
ok(/const manquePiece = \(reason === 'needs-data'\) \|\| \(reason === 'route_failed' && onb === 'needs-data'\);/.test(NP),
  'un versement bloqué ne l’alerte que si Mollie lui réclame quelque chose');
ok(/const pasDeCompte = \(reason === 'no_org'\);/.test(NP),
  'ou s’il n’a pas encore connecté de compte de paiement');
ok(/if \(!manquePiece && !pasDeCompte\) \{/.test(NP) && /return;/.test(NP),
  'sinon on ne lui envoie RIEN — l’administrateur, lui, est prévenu dans tous les cas');
ok(/rien à faire de son côté'\);/.test(NP),
  'et le journal garde la trace de l’alerte qu’on a choisi de ne pas envoyer');
// La bannière de la fiche de demande disait la même chose une troisième fois, au moment
// précis où le prestataire décide s'il accepte — c'est-à-dire au pire moment.
ok(!/Vous pouvez accepter — votre virement partira un peu plus tard/.test(src),
  'et le pavé qui s’affichait sur CHAQUE demande a disparu');

console.log('C — sur l’écran réel de fin de mission');
(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 390, height: 1400}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1400);

  const ecran = (payout, onb) => p.evaluate(({payout, onb}) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.onboarded = true; S.guest = false; S.persona = 'pro'; S.lang = 'fr';
    S.demoMode = false; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = 'Laureguyon';
    S.proMollieCanWork = true; S.proMollieOrgId = 'org_1'; S.proMollieStatus = 'pending'; S.proMollieOnb = onb || 'in-review';
    S.mission = {reqId: 'r1', _id: 'pm1', status: 'paid', svc: 'colis', svcName: 'Colis & courrier',
      when: 'Aujourd’hui', slot: '14:00', duration: 1, unit: 'forfait', rate: 5, zone: 'Gustavia',
      tip: 0, molliePayout: payout, molliePayoutNet: 4.5,
      client: 'Joris D.', provider: {nm: 'Laureguyon', ini: 'L'}};
    S.proMissions = [S.mission];
    window.__render();
    return (document.querySelector('.phone') || document.body).innerText.replace(/\s+/g, ' ');
  }, {payout, onb});

  const bloque = await ecran('unrouted');
  ok(!/Vous avez été payé/.test(bloque),
    'versement refusé : l’écran ne dit PLUS « Vous avez été payé »');
  ok(!/versés sur votre compte/.test(bloque),
    'ni « versés sur votre compte » — c’est vérifiable en dix secondes sur un relevé');
  ok(/Votre gain est acquis/.test(bloque),
    'il dit ce qui est vrai : le gain est acquis');
  ok(/versement en attente/.test(bloque), 'et que le versement, lui, attend');
  ok(/Cette somme vous est due/.test(bloque),
    'la somme est explicitement dite DUE — c’est la seule question du prestataire');
  ok(!/rien à faire|contrôle de sécurité|première transaction/.test(bloque),
    'et on ne lui explique PAS la plomberie : il n’a rien à faire, donc rien à lire');
  ok(bloque.split(/\s+/).length < 120,
    'l’écran reste court (' + bloque.split(/\s+/).length + ' mots)');

  const manque = await ecran('unrouted', 'needs-data');
  ok(/Il manque une pièce à votre dossier/.test(manque),
    'en revanche, quand Mollie réclame une pièce, c’est dit — là, il a une action');
  ok(/Recevoir mes paiements/.test(manque), 'avec l’endroit exact où aller');

  const verse = await ecran('routed');
  ok(!/Vous avez été payé/.test(verse),
    'versement routé : on ne dit PLUS « payé » — l’argent n’a pas encore quitté Mollie');
  ok(/réservée|mise de côté/.test(verse), 'on dit que la part est réservée');
  ok(/prochain règlement/.test(verse),
    'et quand elle partira — un prestataire qui regarde son relevé ne doit pas nous prendre en défaut');
  ok(!/versement en attente/.test(verse), 'sans mélanger avec le message d’un versement refusé');

  const main = await ecran('manuel');
  ok(/Vous avez été payé/.test(main), 'un virement fait à la main compte aussi comme un paiement');

  const vrais = errs.filter((e) => !/net::ERR|Failed to load|firebase|firestore|ERR_FAILED/i.test(e));
  ok(vrais.length === 0, 'aucune erreur JS (' + vrais.join(' | ').slice(0, 150) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
