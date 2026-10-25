/* LE BOUTON DE LA CONSOLE, TEL QU'IL SE REND ET CE QU'IL ENVOIE.

   « Il faut que, depuis la console, une fois toutes les informations données par le
   prestataire dans son profil, on puisse quasiment, d'un bouton de la console, l'enregistrer
   sur Mollie. » — l'éditeur, le 24/10/2026.

   Mollie n'est pas joignable depuis le harnais : on remplace la fonction serveur par un faux
   appelable et l'on mesure DEUX choses que seul le rendu peut dire — ce que la console
   ENVOIE vraiment (le premier appui n'écrit rien, le second porte le pays confirmé) et ce
   qu'elle MONTRE (la déclaration relue, les manques nommés, un refus de Mollie qui laisse la
   proposition à l'écran). L'épreuve du noyau et du câblage vit à côté
   (`test-inscrire-chez-mollie.js`). */
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = {headless: true}; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

/* La fiche telle que l'inscription l'écrit vraiment (`legalName`, `name`, `email`,
   `address`, `siret`) — et AUCUNE trace de Mollie : c'est le cas du prestataire qui bute. */
const ARTS = [
  {id: 'a1', uid: 'a1', name: 'Marie-Lou Cagan', legalName: 'Marie-Lou Cagan', status: 'valide',
    email: 'marielou@exemple.fr', address: 'Rue de la Paix, 97133 Gustavia', siret: '80412578900014',
    cats: ['menage'], zone: 'Gustavia'},
  {id: 'a2', uid: 'a2', name: 'Sanszou', legalName: '', status: 'valide', email: '',
    address: 'Gustavia', siret: '804', cats: ['jardin'], zone: 'Lorient'},
  {id: 'a3', uid: 'a3', name: 'Déjà Reliée', legalName: 'Déjà Reliée', status: 'valide',
    email: 'd@x.fr', address: '97133 Gustavia', siret: '80412578900014',
    mollieStatus: 'active', mollieOrgId: 'org_1', cats: ['menage'], zone: 'Gustavia'}
];

(async () => {
const b = await chromium.launch(o);
const p = await b.newPage({viewport: {width: 1100, height: 1800}});
p.on('pageerror', (e) => console.log('ERREUR PAGE:', e.message));
await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);

/* LE FAUX SERVEUR NOTE CE QU'ON LUI ENVOIE et rend ce qu'on lui dit de rendre. C'est la
   seule façon de mesurer « le premier appui n'écrit rien » : la frontière est une CHARGE
   UTILE, pas un écran. */
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
  window.__render();
}, reponses);

const poser = (artisans, sel) => p.evaluate(([A, s]) => {
  const S = window.__S;
  S.adminArtisans = A; S.admin = {view: 'art', sel: s, fact: null};
  window.__render();
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const bouton = (q) => { const e = document.querySelector('[data-adm="' + q + '"]'); return e ? {txt: e.innerText.replace(/\s+/g, ' '), off: e.disabled === true} : null; };
  return {txt: t,
    prep: bouton('mol-prep:' + s), cree: bouton('mol-cree:' + s),
    creeOff: !!(document.querySelector('[data-adm^="mol-cree"]') === null && /Créer chez Mollie/.test(t)),
    select: !!document.querySelector('[data-molpays="' + s + '"]')};
}, [artisans, sel]);

const clic = (q) => p.evaluate((sel) => { const e = document.querySelector(sel); if (e) e.click(); }, '[data-adm="' + q + '"]');
const choisirPays = (id, v) => p.evaluate(([i, val]) => {
  const s = document.querySelector('[data-molpays="' + i + '"]');
  if (!s) return false; s.value = val; s.dispatchEvent(new Event('change', {bubbles: true})); return true;
}, [id, v]);
const lire = () => p.evaluate(() => ({txt: document.body.innerText.replace(/\s+/g, ' '),
  appels: window.__molAppels,
  creeAbsent: document.querySelector('[data-adm^="mol-cree"]') === null,
  creeOff: !!(document.querySelector('[data-adm^="mol-cree"]') || {disabled: false}).disabled}));

const PROPO = {apercu: true, pret: true, manques: [], dejaPrepare: false,
  charge: {owner: {email: 'marielou@exemple.fr', givenName: 'Marie-Lou', familyName: 'Cagan', locale: 'fr_FR'},
    name: 'Marie-Lou Cagan',
    address: {country: '', streetAndNumber: 'Rue de la Paix', postalCode: '97133', city: 'Gustavia'},
    registrationNumber: '80412578900014'}};

console.log('A — un prestataire sans compte Mollie : le bouton est là, et il n\'a rien envoyé');
await scene([PROPO]);
let r = await poser(ARTS, 'a1');
ok(/Jamais commencé/.test(r.txt), 'la fiche dit toujours qu\'il n\'a jamais commencé');
ok(r.prep && /Préparer son compte Mollie/.test(r.prep.txt), 'et elle offre de le préparer à sa place');
ok(/Rien ne part avant que vous ayez relu/.test(r.txt), 'en annonçant que rien ne part avant relecture');
ok(!r.select, 'aucun sélecteur de pays tant qu\'on n\'a rien demandé');
let v = await lire();
ok(v.appels.length === 0, 'et AUCUN appel n\'a été fait au seul affichage de la fiche');

console.log('B — « Préparer » montre la déclaration, et n\'écrit rien chez Mollie');
await clic('mol-prep:a1'); await p.waitForTimeout(250);
v = await lire();
ok(v.appels.length === 1, 'un appel, un seul');
ok(!!v.appels[0] && v.appels[0].uid === 'a1' && v.appels[0].confirmer === undefined,
  'il ne porte PAS de confirmation : le serveur ne touchera pas à Mollie');
ok(/Ce qui partira chez Mollie/.test(v.txt), 'l\'écran montre ce qui partirait');
ok(/Marie-Lou/.test(v.txt) && /Cagan/.test(v.txt), 'le prénom et le nom séparés');
ok(/marielou@exemple\.fr/.test(v.txt), 'l\'adresse électronique');
ok(/Rue de la Paix/.test(v.txt) && /97133/.test(v.txt) && /Gustavia/.test(v.txt), 'la voie, le code postal, la commune');
ok(/80412578900014/.test(v.txt), 'et le SIRET');

console.log('C — le pays : la France, parce qu\'elle a été MESURÉE, et modifiable');
/* LA SECTION ÉNONÇAIT L'ANCIENNE RÈGLE — « aucun défaut, le bouton reste fermé ». Elle a
   rougi, et c'est le signal attendu : la question avait une réponse qu'on n'avait pas, et
   l'éditeur l'a mesurée dans SON propre compte Mollie le 25/10/2026 — une entreprise de
   Saint-Barthélemy y est enregistrée en FRANCE. Forcer un choix sur une question réglée
   serait de la friction sans bénéfice ; ce qui reste exigé est qu'on dise D'OÙ vient la
   réponse, et qu'elle se change. */
ok(/France/.test(v.txt), 'la France est proposée');
ok(/Relevé le 25\/10\/2026 dans le compte Mollie/.test(v.txt),
  'et l\'écran dit d\'où vient la réponse : une mesure, pas une supposition');
ok(!v.creeAbsent && !v.creeOff, 'le bouton de création est ouvert : la question est réglée');
ok(v.appels.length === 1, 'et rien n\'a encore été envoyé');
ok(await choisirPays('a1', 'BL'), 'le sélecteur reste modifiable');
await p.waitForTimeout(150);
v = await lire();
ok(v.appels.length === 1, 'changer de pays n\'envoie toujours RIEN');

console.log('C bis — la console ÉTABLIT ce qu\'elle ne peut pas lire');
/* ON NE SAIT PAS s'il a déjà un compte Mollie : rien dans sa fiche ne le dit, et Mollie ne
   répond pas à cette question sur une adresse (ce serait un outil d'énumération de comptes).
   Le seul qui le sache est LUI — la console pose donc le fait avant de créer. */
ok(/a-t-il déjà un compte Mollie/.test(v.txt), 'elle demande de lui poser la question');
ok(/ne lui préparez rien/.test(v.txt), 'et dit quoi faire si la réponse est oui');
ok(/J.{0,3}ai déjà un compte Mollie/.test(v.txt),
  'en nommant la porte qui reste de son côté : l\'erreur est sans conséquence');

console.log('D — « Créer » porte le pays confirmé, et le dit quand c\'est fait');
await scene([PROPO, {pret: true, cree: true, id: 'cl_1'}]);
await poser(ARTS, 'a1');
await clic('mol-prep:a1'); await p.waitForTimeout(250);
const paysVu = await p.evaluate(() => { const e = document.querySelector('[data-molpays="a1"]'); return e ? e.value : '(absent)'; });
await clic('mol-cree:a1'); await p.waitForTimeout(250);
v = await lire();
ok(v.appels.length === 2, 'un second appel');
ok(!!v.appels[1] && v.appels[1].confirmer === true, 'celui-là confirme');
ok(!!v.appels[1] && v.appels[1].pays === 'FR',
  'et il porte la France sans qu\'on ait rien touché : la réponse mesurée part telle quelle');
/* ET L'ÉCRAN ET L'APPEL DISENT LA MÊME CHOSE. Un premier jet posait « selected » dans le
   balisage en laissant l'état vide : la console MONTRAIT la France et envoyait un pays
   VIDE. Deux surfaces qui se contredisent sur le même fait — c'est cette mesure qui l'a
   trouvé, et c'est elle qui l'empêche de revenir. */
ok(paysVu === ((v.appels[1] || {}).pays || '(aucun appel)'),
  'le pays affiché est celui qui part : « ' + paysVu + ' » des deux côtés');
/* ET UN AUTRE PAYS PART AUSSI, sans quoi le sélecteur serait un décor. */
await scene([PROPO, {pret: true, cree: true, id: 'cl_2'}]);
await poser(ARTS, 'a1');
await clic('mol-prep:a1'); await p.waitForTimeout(250);
await choisirPays('a1', 'BL'); await p.waitForTimeout(150);
await clic('mol-cree:a1'); await p.waitForTimeout(250);
v = await lire();
ok(!!v.appels[1] && v.appels[1].pays === 'BL', 'et le pays qu\'on change part changé');
ok(/compte Mollie est préparé/.test(v.txt), 'l\'écran dit que c\'est fait');
ok(/n.{0,3}a plus qu.{0,3}à appuyer/.test(v.txt),
  'et ce qui reste à faire au prestataire : UN bouton');

console.log('E — une fiche incomplète : on nomme ce qui manque, rien ne part');
await scene([{apercu: true, pret: false, manques: ['email', 'nom'],
  charge: {owner: {email: '', givenName: '', familyName: '', locale: 'fr_FR'}, name: 'Sanszou',
    address: {country: ''}}}]);
await poser(ARTS, 'a2');
await clic('mol-prep:a2'); await p.waitForTimeout(250);
v = await lire();
ok(/Il manque/.test(v.txt), 'l\'écran dit qu\'il manque quelque chose');
ok(/adresse électronique/.test(v.txt) && /prénom et nom/.test(v.txt),
  'et NOMME les champs, en français, pour qu\'on les fasse compléter');
ok(/À compléter sur sa fiche/.test(v.txt), 'en disant où les compléter');
ok(v.creeAbsent || v.creeOff,
  'et la création reste fermée, pays réglé ou non : une déclaration incomplète ne part pas');
ok(/SIRET absent ou incomplet/.test(v.txt), 'un SIRET à trois chiffres est dit omis, pas tronqué');
ok(/Aucun code postal lisible/.test(v.txt), 'et une adresse sans code postal le dit aussi');

console.log('F — Mollie refuse : la proposition reste, le motif est dit, rien n\'est cassé');
await scene([PROPO, {pret: true, cree: false, repli: 'autorisation', raison: 'Client links not enabled for this account'}]);
await poser(ARTS, 'a1');
await clic('mol-prep:a1'); await p.waitForTimeout(250);
await clic('mol-cree:a1'); await p.waitForTimeout(250);
v = await lire();
ok(/Mollie a refusé/.test(v.txt), 'le refus est annoncé');
ok(/Client links not enabled/.test(v.txt), 'avec le motif TEL QUEL : c\'est lui qui se porte à Mollie');
ok(/Rien n.{0,3}est cassé/.test(v.txt) && /chemin actuel/.test(v.txt),
  'et l\'écran dit que le prestataire garde le chemin d\'aujourd\'hui');
ok(/Ce qui partira chez Mollie/.test(v.txt), 'la déclaration relue reste à l\'écran — on n\'a pas à tout refaire');
ok(!v.creeAbsent, 'et le bouton reste, pour réessayer sans tout refaire');

console.log('G — ce qui ne doit PAS changer : un prestataire déjà relié');
/* SANS CETTE MOITIÉ, un bouton qui s'afficherait partout passerait au vert — et l'on
   proposerait de créer un SECOND compte Mollie à qui en a déjà un. */
await scene([PROPO]);
r = await poser(ARTS, 'a3');
ok(/Actif/.test(r.txt), 'sa fiche dit « Actif »');
ok(!r.prep, 'et ne propose NULLE PART de préparer un compte');
ok(!/Ce qui partira chez Mollie/.test(r.txt), 'ni de relire une déclaration');
v = await lire();
ok(v.appels.length === 0, 'aucun appel n\'a été fait pour lui');

await b.close();
console.log();
if (f) { console.log(f + ' ÉCHEC(S)'); process.exit(1); }
console.log('Console · inscrire chez Mollie : tout est vert');
})();
