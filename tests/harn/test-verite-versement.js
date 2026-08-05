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
ok(/const verse=\(m\.molliePayout==='routed'\|\|m\.molliePayout==='manuel'\);/.test(src),
  'et « payé » n’est vrai que si le serveur l’a constaté — routé par Mollie, ou viré à la main');

console.log('B — ce qu’on demande au prestataire suit ce que MOLLIE demande');
// Réclamer un IBAN à qui n'en doit pas est aussi faux que promettre un virement non parti.
// Mollie distingue trois états, et l'app doit les distinguer aussi : « needs-data » (il
// manque vraiment des pièces), et les autres (Mollie vérifie — rien à faire).
ok(/needsData=\(st==='pending'&&S\.proMollieOnb==='needs-data'\)/.test(src),
  'l’état « il manque des pièces » vient de Mollie, pas d’une supposition');
const iNeeds = src.indexOf("needsData?`<p class=\"mini\"><b>Il manque des éléments");
const iTrav = src.indexOf("(st==='pending'&&molliePeutTravailler())?`<p class=\"mini\"><b>Vous pouvez accepter");
ok(iNeeds > 0 && iTrav > iNeeds,
  'et il est traité AVANT : la branche suivante ne concerne que les dossiers auxquels Mollie ne demande rien');
ok(/contrôle de sécurité — il se déclenche à votre première transaction/.test(src),
  'à qui Mollie ne demande rien, on dit la vraie raison de l’attente');
ok(/rien à faire de votre côté/.test(src),
  'et donc bien « rien à faire » — l’inventer serait envoyer quelqu’un remplir un dossier déjà complet');
ok(/S\.proMollieOnb==='needs-data'\?'Il manque des éléments à votre dossier Mollie/.test(src),
  'l’écran de fin de mission fait la même distinction');

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
  ok(/cette somme vous est due/.test(bloque),
    'la somme est explicitement dite DUE — c’est la seule question du prestataire');
  ok(/rien à faire de votre côté/.test(bloque),
    'et on ne lui invente pas de démarche : Mollie ne lui demande rien');

  const manque = await ecran('unrouted', 'needs-data');
  ok(/Il manque des éléments à votre dossier Mollie/.test(manque),
    'en revanche, quand Mollie réclame des pièces, c’est dit là où il le lit');
  ok(/Recevoir mes paiements/.test(manque), 'avec l’endroit exact où aller');

  const verse = await ecran('routed');
  ok(/Vous avez été payé/.test(verse), 'versement routé : là, on peut le dire');
  ok(/versés sur votre compte/.test(verse), 'et l’annoncer sans réserve');
  ok(!/versement en attente/.test(verse), 'sans mélanger les deux messages');

  const main = await ecran('manuel');
  ok(/Vous avez été payé/.test(main), 'un virement fait à la main compte aussi comme un paiement');

  const vrais = errs.filter((e) => !/net::ERR|Failed to load|firebase|firestore|ERR_FAILED/i.test(e));
  ok(vrais.length === 0, 'aucune erreur JS (' + vrais.join(' | ').slice(0, 150) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
