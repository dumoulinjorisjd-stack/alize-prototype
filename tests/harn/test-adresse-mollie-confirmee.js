/* L'ADRESSE QUI DÉCIDE DE QUELLE ORGANISATION SE RELIE.

   « Oui, affiche l'adresse dans la console avant de préparer le lien. » — l'éditeur,
   le 30/10/2026.

   MESURÉ AVANT D'ÉCRIRE, ET ELLE L'ÉTAIT DÉJÀ : la carte « Ce qui partira chez Mollie »
   montrait l'adresse depuis le premier jour. Ce qui manquait est ailleurs, et c'est ce que
   cette épreuve tient — elle était une ligne de LECTURE parmi six autres, rien ne disait
   qu'elle décide, et on ne pouvait PAS la corriger.

   POURQUOI ELLE DÉCIDE. `docs.mollie.com` est devenu lisible le 30/10/2026 : le parcours
   préparé « relie une organisation NOUVELLE OU EXISTANTE », et `owner.locale` décrit
   « the LOGIN screen, if applicable. For the consent screen, the preferred language of the
   LOGGED IN merchant ». Le prestataire se reconnaît donc par son adresse. Si son compte
   Mollie est sous une AUTRE que celle de sa fiche, c'est la dernière porte par laquelle un
   SECOND compte pourrait naître — et deux comptes dont un seul reçoit les versements est
   le pire résultat possible.

   ET LA MOITIÉ QUI COMPTE : `artisans.email` est l'adresse à laquelle NOUS écrivons.
   Confirmer celle de Mollie ne doit JAMAIS la remplacer, sans quoi il cesserait de
   recevoir ses avis de mission sans que personne le sache. Le serveur le garde
   (`test-inscrire-chez-mollie.js`) ; ici on mesure ce que la console ENVOIE. */
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = {headless: true}; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const ART = {id: 'a1', uid: 'a1', name: 'Marie-Lou Cagan', legalName: 'Marie-Lou Cagan',
  status: 'valide', email: 'marielou@exemple.fr', address: 'Rue de la Paix, 97133 Gustavia',
  siret: '80412578900014', repGiven: 'Marie-Lou', repFamily: 'Cagan', cats: ['menage'], zone: 'Gustavia'};
/* LA CHARGE QUE LE SERVEUR REND À L'APERÇU, telle que `clientLinkProposition` la compose. */
const CHARGE = {owner: {email: 'marielou@exemple.fr', givenName: 'Marie-Lou', familyName: 'Cagan', locale: 'fr_FR'},
  name: 'Marie-Lou Cagan', address: {country: 'FR', streetAndNumber: 'Rue de la Paix', postalCode: '97133', city: 'Gustavia'},
  registrationNumber: '80412578900014'};

(async () => {
const b = await chromium.launch(o);
const p = await b.newPage({viewport: {width: 1100, height: 2000}});
p.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message));
await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);

const scene = (reponses) => p.evaluate((rep) => {
  window.__molAppels = [];
  window.__setFB({auth: {currentUser: {uid: 'adm', email: 'contact@ti-services.fr'}}, db: {},
    f: {doc: () => ({}), setDoc: () => Promise.resolve(),
      getDoc: () => Promise.resolve({exists: () => false, data: () => ({})}), serverTimestamp: () => 'ts'},
    fn: {httpsCallable: (_f, nom) => (data) => {
      if (nom !== 'adminMollieInscrire') return new Promise(() => {});
      window.__molAppels.push(JSON.parse(JSON.stringify(data || {})));
      const r = rep[window.__molAppels.length - 1] || rep[rep.length - 1] || {};
      return Promise.resolve({data: r});
    }}, functions: {}});
  document.body.classList.add('standalone');
  const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
  const S = window.__S;
  S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
  S.account = {name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin'};
  S.admMolInscr = {};
  S.adminArtisans = [JSON.parse(JSON.stringify(window.__ART))];
  S.admin = {view: 'art', sel: 'a1', fact: null};
  window.__render();
}, reponses);

await p.evaluate(([a, c]) => { window.__ART = a; window.__CHARGE = c; }, [ART, CHARGE]);

const clic = (q) => p.evaluate((s) => { const e = document.querySelector('[data-adm="' + s + '"]'); if (!e) return false; e.click(); return true; }, q);
const taper = (v) => p.evaluate((val) => {
  const e = document.querySelector('[data-molmail]');
  if (!e) return false;
  e.value = val; e.dispatchEvent(new Event('input', {bubbles: true}));
  return true;
}, v);
const lire = () => p.evaluate(() => {
  const e = document.querySelector('[data-molmail]');
  const bt = document.querySelector('[data-molcree]');
  return {champ: e ? e.value : null, type: e ? e.getAttribute('type') : null,
    txt: document.body.innerText.replace(/\s+/g, ' '),
    creeOff: bt ? bt.disabled === true : null,
    appels: window.__molAppels};
});

console.log('\nA — l\'adresse se MONTRE, et elle se CORRIGE');
await scene([{apercu: true, pret: true, manques: [], charge: CHARGE}]);
await clic('mol-prep:a1'); await p.waitForTimeout(300);
let V = await lire();
ok(V.champ === 'marielou@exemple.fr',
  'elle est préremplie avec ce qui partirait, tiré de sa fiche (« ' + V.champ + ' »)');
ok(V.type === 'email', 'et c\'est un champ, pas une ligne de lecture : on peut la corriger');
/* ON NE SE CONTENTE PAS DE LA MONTRER : rien ne disait qu'elle décide, et c'est ce qui la
   rendait indiscernable des cinq autres lignes de la carte. */
ok(/se reconna/.test(V.txt) && /second/.test(V.txt),
  'la carte DIT pourquoi cette ligne-là décide, et ce qu\'une autre adresse entraînerait');
ok(/d[ée]j[àa] un compte/.test(V.txt),
  'et elle nomme la question à lui poser au téléphone');

console.log('\nB — ce qui est tapé part, et SEULEMENT ce qui est tapé');
await taper('marielou@autre-adresse.fr'); await p.waitForTimeout(120);
await clic('mol-cree:a1'); await p.waitForTimeout(300);
V = await lire();
const dernier = V.appels[V.appels.length - 1] || {};
ok(dernier.mollieEmail === 'marielou@autre-adresse.fr',
  'la console envoie l\'adresse confirmée (« ' + dernier.mollieEmail + '  »)');
/* LA MOITIÉ QUI COMPTE. Sans elle, une console qui écraserait l'adresse du compte
   satisferait la mesure ci-dessus. */
ok(!('email' in dernier),
  'et elle n\'envoie RIEN qui touche à l\'adresse du compte : c\'est à celle-là que nous écrivons');
ok(dernier.confirmer === true && dernier.uid === 'a1',
  'assertion arrière : c\'est bien la demande de CRÉATION qu\'on vient de mesurer');

console.log('\nC — une adresse qui n\'en est pas une ne part pas');
await scene([{apercu: true, pret: true, manques: ['email'], charge: CHARGE}]);
await clic('mol-prep:a1'); await p.waitForTimeout(300);
await taper('marielou'); await p.waitForTimeout(120);
V = await lire();
ok(V.creeOff === true,
  'sans « @ », le bouton qui crée reste fermé — on ne déclare pas une valeur abîmée à un établissement de paiement');
await taper('marielou@exemple.fr'); await p.waitForTimeout(120);
V = await lire();
ok(V.creeOff === false, 'et il se rouvre dès qu\'elle en redevient une');

console.log('\nD — ce qu\'on a tapé survit à l\'aller-retour');
await scene([{apercu: true, pret: true, manques: [], charge: CHARGE},
             {pret: true, cree: false, repli: 'autorisation', raison: 'Mollie a refusé', charge: CHARGE}]);
await clic('mol-prep:a1'); await p.waitForTimeout(300);
await taper('confirmee@mollie.fr'); await p.waitForTimeout(120);
await clic('mol-cree:a1'); await p.waitForTimeout(350);
V = await lire();
ok(V.champ === 'confirmee@mollie.fr',
  'après un refus de Mollie, elle est encore là : on ne la fait pas retaper (« ' + V.champ + ' »)');
ok(/refus/i.test(V.txt) || /Mollie a refus/.test(V.txt),
  'assertion arrière : c\'est bien APRÈS un refus qu\'on la relit');

await b.close();
console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nAdresse Mollie confirmée : tout est vert');
process.exit(f ? 1 : 0);
})();
