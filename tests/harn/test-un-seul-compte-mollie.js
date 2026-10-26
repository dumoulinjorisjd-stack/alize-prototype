/* « J'ai l'impression de pouvoir le faire plein de fois. Je l'ai fait une fois pour un
   prestataire, mais quand je retourne dans la console je peux le faire à nouveau. »

   EXACT, ET LA CONSÉQUENCE EST CHÈRE. Chaque appel à `/client-links` ouvre un NOUVEAU
   client chez Mollie — relevé en production le 26/10/2026 : `org_19689446`, en révision.
   Recliquer, c'est en semer un second : orphelin si le prestataire n'y est pas encore
   allé, et PIRE s'il a déjà commencé son parcours sur le premier, puisque la fiche ne
   garde que le dernier identifiant et que c'est lui qui recommencerait à zéro.

   LE GARDE-FOU EXISTAIT À MOITIÉ : `if (a.mollieOrgId) return {deja:true}` ferme la porte
   une fois le prestataire RELIÉ. Mais `mollieOrgId` ne s'écrit qu'au retour d'onboarding :
   entre l'envoi du lien et ce retour — c'est-à-dire précisément la fenêtre signalée — rien
   n'empêchait de recréer.

   ON NE RÉÉCRIT PAS LA RÈGLE. `clientLinkFrais` décide déjà, pour `mollieOnboardingLink`,
   si un lien mérite d'être refabriqué. C'est elle qu'on consulte ici.

   Mollie n'est pas joignable depuis le harnais : ce qui s'éprouve est la DÉCISION et le
   CÂBLAGE, pas un aller-retour. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { codeNu } = require('./lib-code-nu.js');
const RACINE = '/home/user/alize-work';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* ── LE CORPS DE LA FONCTION, RELEVÉ PAR SES BORNES ─────────────────────────────────── */
const i0 = srv.indexOf('exports.adminMollieInscrire');
const i1 = srv.indexOf('exports.clientCard', i0);
const corps = srv.slice(i0, i1);
// ASSERTION ARRIÈRE : un relevé vide satisferait toutes les gardes ci-dessous.
ok(i0 > 0 && i1 > i0 && /mollieCreerClientLink/.test(corps),
  'la fonction se relève (sinon rien n’est mesuré)');

console.log('A — un lien encore bon ne se refait pas');
ok(/clientLinkFrais\(/.test(corps),
  'la fraîcheur est jugée par la règle qui existe, pas par une seconde');
ok(/if \(lienFrais && !refaire\) return/.test(corps),
  'et quand il est frais, la fonction rend AVANT de créer quoi que ce soit');
// L'ORDRE EST LE FAIT : le garde-fou doit précéder l'appel, sinon il ne garde rien.
// `indexOf` rend -1 quand la ligne n'existe pas, et -1 précède tout : sans la borne,
// cette mesure serait verte sur un garde-fou RETIRÉ.
const iRefus = corps.indexOf('if (lienFrais && !refaire) return');
ok(iRefus > 0 && iRefus < corps.indexOf('await mollieCreerClientLink'),
  'le refus est posé AVANT l’appel à Mollie');
ok(/const refaire = \(request\.data && request\.data\.refaire\) === true;/.test(corps),
  'refaire reste possible, mais seulement s’il est DEMANDÉ');
// LA MOITIÉ QUI COMPTE : un lien périmé doit encore pouvoir se refaire.
ok(!/if \(lienFrais\) return/.test(corps) || /!refaire/.test(corps),
  'un lien périmé n’est pas bloqué pour autant');

console.log('B — le garde-fou d’avant n’est pas défait');
ok(/if \(a\.mollieOrgId\) return \{deja: true/.test(corps),
  'un prestataire déjà relié ne crée toujours rien');
ok(corps.indexOf('if (a.mollieOrgId)') < corps.indexOf('const refaire'),
  'et cette porte-là reste la première');

console.log('C — l’aperçu rend de quoi le DIRE');
ok(/lienFrais: lienFrais, lienAt: lienAt/.test(corps),
  'la console reçoit la fraîcheur et la date, pas seulement « déjà préparé »');

console.log('D — l’écran dit la conséquence avant de la faire');
ok(/nouveau compte chez Mollie/.test(app), 'la fenêtre nomme ce qu’un second lien ouvrirait');
ok(/data-adm="mol-refait:/.test(app), 'le second geste a son propre bouton');
ok(/S\._molRefait!==id/.test(app) && /second appui/i.test(app),
  'il s’arme : le premier appui annonce, le second agit');
ok(/refaire:true/.test(app), 'et lui seul envoie « refaire »');
// CE QUI NE DOIT PAS ARRIVER : que le bouton ordinaire force la recréation.
const iCree = app.indexOf("data-adm=\"mol-cree:");
const bloc = app.slice(iCree - 1200, iCree + 400);
ok(iCree > 0 && !/refaire/.test(bloc),
  'le bouton ordinaire « Créer chez Mollie » ne force jamais');

console.log('E — rien n’est envoyé qu’on ne maîtrise pas');
/* RÈGLE RENVERSÉE LE 26/10/2026, ET CETTE ASSERTION DISAIT L'ANCIENNE. Elle exigeait
   qu'AUCUN téléphone ne parte, au motif que « nos numéros ne sont pas garantis dans ce
   format » — vrai du champ BRUT, faux de ce qu'on sait en faire : `telE164` rend de
   l'E.164 ou RIEN. Le « +31 6 00000000 » vu chez Mollie n'était pas nous ; c'était leur
   défaut, et on le laissait en place faute d'envoyer le vrai numéro.
   CE QUI RESTE VRAI, ET QU'ON MESURE : on n'envoie que ce qui a traversé la porte. */
const iCharge = srv.indexOf('function clientLinkProposition');
const charge = srv.slice(iCharge, srv.indexOf('\n  return {pret:', iCharge));
ok(iCharge > 0 && /owner:/.test(charge), 'la charge se relève (sinon rien n’est mesuré)');
const nu = codeNu(charge);
ok(/const tel = telE164\(f\.phone\);/.test(nu),
  'le téléphone passe par la porte qui le met en E.164');
ok(/if \(tel\) charge\.owner\.phone = tel;/.test(nu),
  'et il ne part que si elle a rendu quelque chose');
/* ON NE LIT JAMAIS LE CHAMP BRUT : c'est lui qui n'est pas garanti, et c'est l'erreur
   que l'ancienne règle évitait en n'envoyant rien du tout. */
ok(!/phone = (String\()?f\.phone/.test(nu) && !/phone: f\.phone/.test(nu),
  'le champ brut de la fiche ne part jamais tel quel');

/* ── ET CE QUE L'ÉCRAN FAIT VRAIMENT ────────────────────────────────────────────────
   Une garde de source ne prouve pas un comportement : on ouvre la fiche et on regarde
   quel bouton est rendu. */
const { chromium } = require('playwright-core');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const rendre = (frais) => p.evaluate((frais) => {
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'a@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.demoMode = false; S.persona = 'admin'; S.mission = null;
    S.account = { name: 'A', email: 'a@x.c', uid: 'adm', role: 'admin' };
    S.adminArtisans = [{ id: 'pro9', uid: 'pro9', name: 'ONETTI RODRIGUEZ JADE', email: 'o@x.c',
      status: 'valide', cats: ['menage'], siret: '99365021700017',
      address: '57 rue de fagnon, 08000 Charleville', type: 'entreprise', history: [],
      repGiven: 'Jade', repFamily: 'Onetti' }];
    S.adminArtsLoaded = true;
    S.admin = { view: 'art', sel: 'pro9', fact: null };
    S.admMolInscr = { pro9: { busy: false, pays: 'FR', manques: [], dejaPrepare: true,
      lienFrais: frais, lienAt: Date.now() - 3 * 86400000,
      charge: { owner: { email: 'o@x.c', givenName: 'Jade', familyName: 'Onetti' },
        name: 'ONETTI RODRIGUEZ JADE', registrationNumber: '99365021700017',
        address: { country: 'FR', postalCode: '08000', city: 'Charleville' } } } };
    let leve = ''; try { window.__render(); } catch (e) { leve = e.message || String(e); }
    const v = document.getElementById('view');
    return { leve: leve, txt: (v.textContent || '').replace(/\s+/g, ' '),
      refait: !!v.querySelector('[data-adm="mol-refait:pro9"]'),
      cree: !!v.querySelector('[data-adm="mol-cree:pro9"]') };
  }, frais);

  console.log('F — le bon bouton, et lui seul');
  const A = await rendre(true);
  ok(!A.leve, 'la fiche se dessine sans lever' + (A.leve ? ' (' + A.leve + ')' : ''));
  ok(/Son compte est déjà préparé/.test(A.txt), 'un lien frais le DIT, avec sa date');
  ok(A.refait && !A.cree,
    'et « Créer chez Mollie » n’est PAS offert : seul le geste armé l’est');

  const B = await rendre(false);
  ok(!B.leve, 'un lien périmé se dessine sans lever');
  ok(B.cree && !B.refait, 'là, « Créer chez Mollie » revient — rien n’est bloqué');
  ok(/lien a expiré/.test(B.txt), 'et l’écran dit pourquoi c’est sans conséquence');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
