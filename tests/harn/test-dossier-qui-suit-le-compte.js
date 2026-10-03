/* LE DOSSIER SUIT LE COMPTE, PAS LE TÉLÉPHONE.

   « Mais ce qu'il a fait ne s'enregistre que dans son téléphone ; quand il veut
   continuer son inscription plus tard, s'il le fait depuis un autre appareil il ne
   retrouve pas ses informations ? »

   NON, IL NE LES RETROUVAIT PAS. `saveProDraft` n'écrivait que dans le `localStorage`
   (`tiProDraft:<uid>`), et `enterProDraft` portait le commentaire qui le disait :
   « superpose les valeurs déjà saisies (même appareil) ». Tout était à retaper sur un
   second appareil : nom, téléphone, SIRET, adresse, naissance, forme juridique,
   capital, ville du RCS, présentation, assureur — et jusqu'à l'ADRESSE de l'attestation
   déjà téléversée, donc un fichier à redéposer alors qu'il dormait intact dans le
   stockage.

   LE LOCAL RESTE LA RÉFÉRENCE : il rend la main à la frappe, sans réseau, et c'est lui
   qui ne peut jamais perdre une lettre. Le compte reçoit une COPIE différée, et au
   retour cette copie NE REMPLIT QUE LES CASES VIDES — c'est la seule règle qui tienne
   quel que soit l'ordre dans lequel les deux appareils ont écrit. La photo, seule chose
   qui pèse, reste locale au-delà du plafond : elle se rechoisit en deux touchers et ne
   vaut pas de gonfler la fiche d'un compte. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

// Un dossier complet, tel qu'un prestataire l'a rempli sur son téléphone.
const DOSSIER = {
  name: 'Léa Brin', phone: '0690112233', siret: '12345678901234', address: 'Gustavia',
  birth: '1990-05-05', statusType: 'entreprise', legalForm: 'SASU', capital: '1000',
  rcsCity: 'Basse-Terre', bio: 'Peintre depuis douze ans.', insurer: 'Generali',
  insuranceName: 'attestation.pdf', insuranceUrl: 'https://exemple.test/att.pdf',
  insuranceDoc: true, mandat: true, cgu: true, charte: true, acceptsGrille: true,
  cats: ['peinture', 'menage'], rates: { peinture: 42 }, desiredNet: { menage: 18 },
  diplomas: ['cap'], diplomaOther: 'BP peinture', refCode: 'LEA-0001',
};

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__dossier, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  // Une fausse base qui NOTE ce qu'on lui écrit, et le chemin où on l'écrit.
  await p.evaluate(() => {
    window.__ecrites = [];
    window.__S.demoMode = false;
    window.__setFB({ db: {}, auth: { currentUser: { uid: 'pro42' } },
      f: { doc: (db, col, id) => ({ col: col, id: id }),
           setDoc: (ref, patch, opt) => { window.__ecrites.push({ ref: ref, patch: patch, opt: opt }); return Promise.resolve(); } } });
  });

  console.log('A — ce qui est saisi monte dans le compte, et une fois par pause');
  await p.evaluate((d) => {
    window.__S.proForm = Object.assign({}, d);
    window.__dossier.enregistre();           // trois frappes d'affilée
    window.__dossier.enregistre();
    window.__dossier.enregistre();
  }, DOSSIER);
  const tout_de_suite = await p.evaluate(() => window.__ecrites.filter((e) => 'proDraft' in e.patch).length);
  ok(tout_de_suite === 0, 'rien ne partvers le réseau pendant la frappe (' + tout_de_suite + ' écriture)');
  await p.waitForTimeout(1300);
  const E = await p.evaluate(() => window.__ecrites.filter((e) => 'proDraft' in e.patch));
  ok(E.length === 1, 'une seule écriture pour trois enregistrements (' + E.length + ')');
  ok(E.length === 1 && E[0].ref.col === 'users' && E[0].ref.id === 'pro42' && E[0].opt && E[0].opt.merge === true,
    'elle va dans la fiche du compte, en fusion');
  const envoye = E.length === 1 ? E[0].patch.proDraft : {};
  const manquants = Object.keys(DOSSIER).filter((k) => JSON.stringify(envoye[k]) !== JSON.stringify(DOSSIER[k]));
  ok(manquants.length === 0, 'les ' + Object.keys(DOSSIER).length + ' champs du dossier voyagent tous (manquants : ' + (manquants.join(', ') || 'aucun') + ')');
  ok(envoye.insuranceUrl === DOSSIER.insuranceUrl,
    'l’adresse de l’attestation voyage : le fichier est déjà dans le stockage, il n’y a rien à redéposer');
  ok(typeof envoye.at === 'number' && envoye.at > 0, 'la copie est datée');

  console.log('\nB — une photo qui pèse reste sur le téléphone');
  const ph = await p.evaluate(() => {
    const max = window.__dossier.max();
    window.__ecrites = [];
    window.__S.proForm.photo = 'data:image/jpeg;base64,' + 'A'.repeat(max + 10);
    window.__dossier.enregistre();
    return { max: max, local: (localStorage.getItem(window.__dossier.cle()) || '').length };
  });
  await p.waitForTimeout(1300);
  const sansPhoto = await p.evaluate(() => (window.__ecrites.filter((e) => 'proDraft' in e.patch)[0] || { patch: {} }).patch.proDraft || {});
  ok(!('photo' in sansPhoto), 'au-delà de ' + ph.max + ' caractères la photo ne monte pas');
  ok(sansPhoto.name === DOSSIER.name && sansPhoto.siret === DOSSIER.siret,
    'et tout le reste du dossier monte quand même');
  ok(ph.local > ph.max, 'la photo reste, elle, dans l’appareil (' + ph.local + ' caractères enregistrés)');
  const petite = await p.evaluate(() => {
    window.__ecrites = [];
    window.__S.proForm.photo = 'data:image/jpeg;base64,AAAA';
    window.__dossier.enregistre();
    return true;
  });
  await p.waitForTimeout(1300);
  const avecPhoto = await p.evaluate(() => (window.__ecrites.filter((e) => 'proDraft' in e.patch)[0] || { patch: {} }).patch.proDraft || {});
  ok(petite && avecPhoto.photo === 'data:image/jpeg;base64,AAAA', 'une photo légère, elle, monte');

  console.log('\nC — l’autre appareil retrouve ce qu’il n’a pas');
  const neuf = await p.evaluate((d) => {
    window.__S.proForm = {};                       // appareil vierge
    const n = window.__dossier.fusion(Object.assign({ at: 1790000000000 }, d));
    return { n: n, f: window.__S.proForm };
  }, DOSSIER);
  const perdus = Object.keys(DOSSIER).filter((k) => JSON.stringify(neuf.f[k]) !== JSON.stringify(DOSSIER[k]));
  ok(perdus.length === 0, 'les ' + Object.keys(DOSSIER).length + ' champs reviennent (perdus : ' + (perdus.join(', ') || 'aucun') + ')');
  ok(neuf.n === Object.keys(DOSSIER).length, 'et la reprise se COMPTE, pour pouvoir le dire (' + neuf.n + ')');
  ok(!('at' in neuf.f), 'la date de la copie n’entre pas dans le dossier');

  console.log('\nD — ce qui est saisi ici ne se fait jamais écraser');
  const garde = await p.evaluate((d) => {
    window.__S.proForm = { name: 'Nom tapé ici', phone: '0690999999', cats: ['plomberie'],
      rates: { plomberie: 50 }, cgu: true, siret: '' };
    const n = window.__dossier.fusion(Object.assign({ at: 1 }, d));
    return { n: n, f: window.__S.proForm };
  }, DOSSIER);
  ok(garde.f.name === 'Nom tapé ici' && garde.f.phone === '0690999999',
    'le nom et le téléphone saisis restent ceux de l’appareil');
  ok(JSON.stringify(garde.f.cats) === JSON.stringify(['plomberie']) && garde.f.rates.plomberie === 50,
    'une liste et une table déjà remplies ne se fondent pas : elles restent telles quelles');
  ok(garde.f.siret === DOSSIER.siret && garde.f.address === DOSSIER.address,
    'mais les cases vides, elles, se remplissent');
  ok(garde.f.cgu === true && garde.n < Object.keys(DOSSIER).length,
    'et la reprise ne compte que ce qu’elle a vraiment apporté (' + garde.n + ')');
  const rien = await p.evaluate(() => [window.__dossier.fusion(null), window.__dossier.fusion({}), window.__dossier.fusion('x')]);
  ok(rien.join(',') === '0,0,0', 'sans copie dans le compte, la fusion n’apporte rien et ne lève pas');

  console.log('\nE — envoyée, la candidature n’est plus un brouillon');
  const oubli = await p.evaluate(() => {
    window.__ecrites = [];
    window.__S.proForm = { name: 'Léa Brin', siret: '12345678901234' };
    window.__dossier.enregistre();    // une écriture est en attente…
    window.__dossier.oublie();        // …et la candidature part maintenant
    return window.__ecrites.map((e) => e.patch).filter((x) => 'proDraft' in x);
  });
  ok(oubli.length === 1 && 'proDraft' in oubli[0] && oubli[0].proDraft === null,
    'la copie est retirée du compte (' + JSON.stringify(oubli) + ')');
  await p.waitForTimeout(1300);
  const apres = await p.evaluate(() => window.__ecrites.map((e) => e.patch).filter((x) => 'proDraft' in x));
  ok(apres.length === 1, 'et l’écriture en attente est annulée : elle ne revient pas reposer le brouillon');

  console.log('\nF — le câblage : la copie du compte arrive jusqu’à l’écran');
  ok(/function enterProDraft\(user,nm,cloud\)/.test(html),
    'enterProDraft reçoit la copie du compte');
  const appels = (html.match(/enterProDraft\([^;)]{0,80}\)/g) || []).filter((x) => !/user,nm,cloud/.test(x));
  const muets = appels.filter((a) => !/proDraft/.test(a));
  ok(appels.length === 3 && muets.length === 1,
    'deux de ses trois appels lui passent la copie du compte (' + appels.length + ' appels, ' + muets.length + ' muet)');
  // Le troisième est la BASCULE d'un client vers prestataire : le rôle change à l'instant,
  // il n'existe aucun brouillon à retrouver. Sur un second appareil le compte est déjà
  // « artisan » et repasse par loadUserProfile, qui a la fiche en main.
  ok(muets.length === 1 && /^enterProDraft\(u,/.test(muets[0]),
    'et le troisième est la bascule client → prestataire, qui n’a rien à reprendre');
  ok(/loadProDraft\(\);[\s\S]{0,200}fusionnerBrouillonCloud\(cloud\)/.test(html),
    'le local est lu d’abord, le compte ne vient qu’ensuite combler');
  ok(/retrouvé votre dossier/.test(html), 'et on le DIT quand quelque chose est revenu');
  // La fiche du compte est écrite par son propriétaire : aucune règle à desserrer.
  const regles = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
  ok(/match \/users\/\{userId\}[\s\S]{0,400}allow update: if isAdmin\(\)[\s\S]{0,200}uid\(\) == userId/.test(regles),
    'la fiche du compte est déjà écrite par son propriétaire : aucune règle n’est desserrée');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
