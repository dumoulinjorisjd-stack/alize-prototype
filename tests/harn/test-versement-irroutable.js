/* MOLLIE NE VERSERA JAMAIS CE PAIEMENT-CI — ET IL FAUT LE DIRE.
   Relevé le 09/11/2026 : 110 € encaissés pour un massage, le net (104,50 €) refusé au
   routage avec « HTTP 422, Routed organization had no marketplace partnership with payment
   owner when the payment was paid ». C'est une règle documentée de Mollie (« the destination
   organization must be connected to your platform at payment creation ») : la prestataire a
   relié son compte APRÈS le paiement. Le rattrapage le retentait toutes les quinze minutes,
   l'écran lui promettait « dès que Mollie ouvrira vos virements » — alors que son compte
   était ouvert — et l'argent restait en attente chez Mollie, faute de route.

   Ce que l'on tient ici :
     A — le noyau reconnaît le refus définitif, et distingue un versement d'une libération ;
     B — le serveur le LIT partout où il route, ne le retente plus, et sait LIBÉRER ;
     C — la règle Firestore garde la somme serveur et borne l'IBAN ;
     D — la console, l'accueil et la fiche disent la même chose, IBAN compris. */
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
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const IRR = require(path.join(RACINE, 'functions', 'versement-irroutable.js'));
const ARGENT = require(path.join(RACINE, 'functions', 'argent-mis-de-cote.js'));
const MOTIF = 'HTTP 422, Routed organization had no marketplace partnership with payment owner when the payment was paid';
const corps = (debut, fin) => { const i = fn.indexOf(debut); const j = fn.indexOf(fin, i + debut.length); return (i >= 0 && j > i) ? fn.slice(i, j) : ''; };

console.log('A — le noyau');
ok(IRR.refusDefinitif(MOTIF), 'le refus relevé en production est reconnu définitif');
ok(!IRR.refusDefinitif('HTTP 422, Routing is not enabled') && !IRR.refusDefinitif('') && !IRR.refusDefinitif(null),
  'un autre refus ne l’est pas — il se retente (assertion arrière : la règle ne reconnaît pas tout)');
ok(IRR.jambeRetentable({issue: 'route_failed', motif: 'HTTP 503'}) && !IRR.jambeRetentable({issue: 'route_failed', motif: MOTIF})
  && !IRR.jambeRetentable({issue: IRR.ISSUE_LIAISON, motif: ''}),
  'une jambe refusée AVANT que la cause existe se reconnaît à son motif, une jambe neuve à sa cause');
{ const rd = IRR.routesDecider([{destination: {organizationId: 'org_pf'}, amount: {value: '110.00'}}], 'org_presta', 'org_pf');
  ok(rd.versees === 0 && rd.liberees === 1 && rd.montantLibere === 110,
    'une route vers NOTRE organisation est une libération, pas un versement au prestataire');
  const rd2 = IRR.routesDecider([{destination: {organizationId: 'org_presta'}, amount: {value: '104.50'}}], 'org_presta', 'org_pf');
  ok(rd2.versees === 1 && rd2.liberees === 0, 'une route vers le prestataire est un versement');
  ok(IRR.routesDecider(null, 'a', 'b') === null, 'des routes illisibles ne se comptent pas (silence n’est pas réponse)'); }
{ const base = {orgPlateforme: 'org_pf', orgPresta: 'org_presta', statutMollie: 'paid', routes: [], montant: 110, motif: MOTIF};
  const d = IRR.libererDecider(base);
  ok(d.ok && d.montant === 110, 'un paiement payé, sans route, au refus définitif : on libère les 110 €');
  const raison = (x) => IRR.libererDecider(Object.assign({}, base, x)).raison;
  ok(raison({orgPlateforme: ''}) === 'plateforme-inconnue', 'sans notre organisation, rien ne part');
  ok(raison({statutMollie: 'authorized'}) === 'non-paye', 'un paiement non réglé n’a rien à libérer');
  ok(raison({routes: null}) === 'routes-inconnues', 'routes illisibles : on ne route pas à l’aveugle');
  ok(raison({routes: [{destination: {organizationId: 'org_presta'}, amount: {value: '104.50'}}]}) === 'deja-verse', 'déjà versé au prestataire : pas de seconde route');
  ok(raison({routes: [{destination: {organizationId: 'org_pf'}, amount: {value: '110.00'}}]}) === 'deja-libere', 'déjà libéré : jamais deux fois');
  ok(raison({montant: 0}) === 'montant-nul', 'un montant nul ne se route pas');
  ok(raison({motif: 'HTTP 503'}) === 'refus-non-definitif', 'un refus passager se RETENTE au lieu de se libérer');
  ok(IRR.LIBERER_REFUS.length === 7, 'sept refus, tous nommés'); }
{ const laura = [{complementPayout: 'unrouted', complementNet: 104.5, complementPayoutIssue: 'route_failed', complementPayoutMotif: MOTIF},
    {molliePayout: 'unrouted', molliePayoutNet: 20}];
  ok(ARGENT.netMisDeCote(laura) === 20, '« mis de côté » ne compte plus ce que Mollie ne versera jamais');
  ok(ARGENT.netIrroutable(laura) === 104.5, 'cette part a sa propre somme : 104,50 € à virer à la main'); }

console.log('B — le serveur lit le noyau partout où il route');
ok(/const IRR = require\('\.\/versement-irroutable'\)/.test(fn), 'le serveur charge le noyau, il ne recopie pas la règle');
ok((fn.match(/issueDuRefus\(orgId\)/g) || []).length >= 6,
  'la cause d’un refus s’écrit par une seule porte (règlement, annulation, supplément, rattrapages)');
{ const c = corps('async function _rerouteArtisanPayoutsCorps', 'async function ');
  ok((c.match(/IRR\.jambeRetentable\(/g) || []).length === 2, 'le rattrapage des quinze minutes saute une jambe définitive, sur les DEUX paiements'); }
{ const c = corps('exports.payoutRetry', 'exports.payoutManual');
  ok((c.match(/IRR\.routesDecider\(/g) || []).length === 2, 'la console compte les routes PAR DESTINATION, sur les deux paiements');
  ok((c.match(/ligne\.definitif \|\| ligne\.libere/g) || []).length === 2, 'et ne retente jamais un refus définitif ni une libération');
  ok(/await majNetMisDeCote\(db, uid\)/.test(c), 'la somme du prestataire est remesurée après chaque inventaire'); }
{ const c = corps('async function ratisserComplementsSansEtat', 'function versementEcarte');
  ok(/IRR\.routesDecider\(arr, orgId, orgPlateforme\)/.test(c), 'le ratissage ne prend pas une libération pour un versement'); }
{ const c = corps('exports.payoutLiberer', '/**');
  ok(c.length > 0, 'la libération existe');
  ok(/ADMIN_EMAIL/.test(c) && /permission-denied/.test(c), 'réservée à l’administrateur');
  ok(/IRR\.libererDecider\(/.test(c), 'elle passe par la décision du noyau');
  ok(/mollieRouteNet\(paymentId, orgPlateforme, dec\.montant/.test(c), 'elle route le paiement entier vers NOTRE organisation');
  ok(!/Payout: 'routed'/.test(c) && !/Payout: 'manuel'/.test(c), 'et la jambe RESTE due : la part du prestataire n’est pas soldée pour autant');
  ok(/set\(\{molliePayoutLibere: true/.test(c) && /set\(\{complementPayoutLibere: true/.test(c), 'la libération est inscrite au registre, une fois par nature de paiement');
  ok(/amountRefunded/.test(c), 'jamais plus que ce qui reste encaissé'); }
ok(/netIrroutable: so\.irroutable/.test(fn), 'la fiche du prestataire porte les deux sommes');
ok(/IRR\.refusDefinitif\(motif\)/.test(fn) && /IRR\.REGLE_MOLLIE/.test(fn), 'l’alerte à l’administrateur cite la règle et dit qu’il est inutile de re-router');

console.log('C — la règle Firestore');
ok(/request\.resource\.data\.get\('netIrroutable', 0\) == resource\.data\.get\('netIrroutable', 0\)/.test(RULES), 'un prestataire ne peut pas écrire sa propre somme due');
ok(/get\('iban', ''\) is string/.test(RULES) && /get\('iban', ''\)\.size\(\) <= 42/.test(RULES), 'son IBAN est borné en forme et en taille');

console.log('D — sur l’écran réel');
(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 390, height: 2400}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1400);

  const regle = await p.evaluate(() => window.__irr.regle());
  ok(regle === IRR.REGLE_MOLLIE, 'l’écran et le serveur citent la même phrase de Mollie, mot pour mot');
  ok(await p.evaluate((m) => window.__irr.jambe({complementPayout: 'unrouted', complementPayoutMotif: m}), MOTIF)
    && !(await p.evaluate(() => window.__irr.jambe({complementPayout: 'unrouted', complementPayoutMotif: 'HTTP 503'})))
    && !(await p.evaluate((m) => window.__irr.jambe({complementPayout: 'routed', complementPayoutMotif: m}), MOTIF)),
    'l’écran reconnaît la jambe définitive comme le serveur, et seulement si elle est encore due');
  ok(await p.evaluate(() => window.__irr.cle('FR76 3000 6000 0112 3456 7890 189') && !window.__irr.cle('FR76 3000 6000 0112 3456 7809 189') && !window.__irr.cle('')),
    'la clé de l’IBAN se contrôle : deux chiffres intervertis ne passent pas');

  const console_ = (list) => p.evaluate((list) => {
    const S = window.__S;
    S.onboarded = true; S.guest = false; S.persona = 'admin'; S.lang = 'fr'; S.demoMode = false; S.mission = null;
    S.admin = {view: 'fact', sel: null, fact: null, factQ: ''};
    S._fold = {'f-vers': true};
    S.adminOrph = {loaded: true, list: []}; S.adminVers = {loaded: true, list: list}; S.adminLedger = [];
    window.__render();
    const carte = [...document.querySelectorAll('.fold-head')].find((h) => /Versements prestataires bloqués/.test(h.textContent));
    const el = carte ? carte.parentElement : null;
    return el ? {txt: el.textContent.replace(/\s+/g, ' '), lib: [...el.querySelectorAll('[data-adm^="vers-lib:"]')].length,
      un: [...el.querySelectorAll('[data-adm^="vers-one:"]')].map((x) => x.dataset.adm), scan: [...el.querySelectorAll('[data-adm="vers-scan"]')].length} : null;
  }, list);
  const ligne = (x) => Object.assign({reqId: 'r1', genre: 'supplement', serviceName: 'Massage', providerName: 'Laura', net: 104.5, etat: 'paid', org: 'oui',
    motif: MOTIF, tente: true, routes: 0, verse: false, definitif: true, libere: false, iban: '', ibanTitulaire: ''}, x);
  const c1 = await console_([ligne({reqId: 'c~r1'}), ligne({reqId: 'r2', definitif: false, motif: 'HTTP 503'})]);
  ok(c1 && c1.txt.indexOf('Mollie ne versera jamais ce paiement-ci.') >= 0 && c1.txt.indexOf(IRR.REGLE_MOLLIE) >= 0,
    'la ligne bloquée dit que Mollie ne versera pas, avec la règle de Mollie');
  ok(c1 && c1.lib === 1, 'elle offre « Libérer sur le solde Ti-Services »');
  ok(c1 && c1.un.length === 1 && c1.un[0] === 'vers-one:r2', 'et ne propose plus de réessayer ce qui ne passera jamais — la ligne ordinaire, si');
  ok(c1 && /Aucun IBAN saisi/.test(c1.txt), 'sans IBAN, on dit qu’il manque et où le prestataire le saisit');
  ok(c1 && c1.scan === 1, '« Revérifier » reste offert quand la liste n’est pas vide');
  const c2 = await console_([ligne({reqId: 'c~r1', libere: true, montantLibere: 110, iban: 'FR7630006000011234567890189', ibanTitulaire: 'Laura Courcot'})]);
  ok(c2 && /Libéré sur le solde Ti-Services/.test(c2.txt) && /104,50/.test(c2.txt), 'libéré : il reste à virer sa part, et l’écran le chiffre');
  ok(c2 && c2.lib === 0, 'on ne libère pas deux fois');
  ok(c2 && c2.txt.indexOf('FR76 3000 6000 0112 3456 7890 189') >= 0 && /Laura Courcot/.test(c2.txt), 'son IBAN s’affiche en clair, par groupes de quatre, avec le titulaire');
  const c3 = await console_([ligne({definitif: false, motif: 'HTTP 503'})]);
  ok(c3 && c3.txt.indexOf('Mollie ne versera jamais') < 0 && c3.lib === 0, 'un refus ordinaire ne parle pas de règle définitive (assertion arrière)');

  const accueil = (net, iban) => p.evaluate(([net, iban]) => {
    const S = window.__S;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proOnline = true; S.proCats = ['massage'];
    S.proMollie = 'active'; S.proMollieOrgId = 'org_1'; S.proMollieOnb = 'completed'; S.proMollieCanWork = true;
    S.proNetMisDeCote = 0; S.proNetIrroutable = net; S.proIban = iban; S.mission = null; S.detail = null;
    window.__render();
    const bt = document.querySelector('[data-act="pro-iban"]');
    return bt ? bt.textContent.replace(/\s+/g, ' ') : '';
  }, [net, iban]);
  const a1 = await accueil(104.5, '');
  ok(/104,50 € vous sont dus/.test(a1), 'l’accueil du prestataire chiffre ce qui lui est dû, même quand son compte est actif');
  ok(a1.indexOf(IRR.REGLE_MOLLIE) >= 0 && /Indiquez votre IBAN/.test(a1), 'il dit pourquoi, et le seul geste qui débloque : l’IBAN');
  ok(/Votre IBAN est enregistré/.test(await accueil(104.5, 'FR7630006000011234567890189')), 'IBAN déjà saisi : il le dit, sans redemander');
  ok((await accueil(0, '')) === '', 'rien à dire quand rien n’est dû');

  const fiche = await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'pro'; S.proNav = 'home'; S.proNetIrroutable = 104.5; S.proIban = '';
    window.__render();
    document.querySelector('[data-act="pro-iban"]').click();
    return {nav: S.proNav, edit: S.proEditContact, champ: !!document.querySelector('[data-proeditiban]')};
  });
  ok(fiche.nav === 'account' && fiche.edit && fiche.champ, 'la carte mène AU CHAMP de l’IBAN, déjà en saisie');
  const refuse = await p.evaluate(() => {
    const S = window.__S;
    S.proContactForm = {phone: '0690 00 00 00', bio: '', iban: 'FR76 3000 6000 0112 3456 7809 189', ibanTitulaire: 'Laura'};
    document.querySelector('[data-act="pro-contact-save"]').click();
    return {edit: S.proEditContact, iban: S.proIban};
  });
  ok(refuse.edit === true && refuse.iban === '', 'un IBAN dont la clé ne tombe pas juste N’ENTRE PAS, et la saisie reste à l’écran');
  const accepte = await p.evaluate(() => {
    const S = window.__S;
    S.proContactForm = {phone: '0690 00 00 00', bio: '', iban: 'fr76 3000 6000 0112 3456 7890 189', ibanTitulaire: 'Laura'};
    document.querySelector('[data-act="pro-contact-save"]').click();
    return {edit: S.proEditContact, iban: S.proIban};
  });
  ok(accepte.edit === false && accepte.iban === 'FR7630006000011234567890189', 'un IBAN juste s’enregistre, normalisé');

  ok(/vous sont dus\$\/,'\$1 is owed to you'\]/.test(src) && /vous sont dus\$\/,'\$1 são-lhe devidos'\]/.test(src), 'le titre chiffré se traduit en anglais et en portugais');
  const vrais = errs.filter((e) => !/net::ERR|Failed to load|firebase|firestore|ERR_FAILED/i.test(e));
  ok(vrais.length === 0, 'aucune erreur JS (' + vrais.join(' | ').slice(0, 150) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
