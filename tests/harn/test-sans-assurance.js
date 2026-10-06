/* « JE NE DISPOSE PAS D'ASSURANCE RESPONSABILITÉ CIVILE ».

   « Pour toutes les inscriptions des pro, même en cours, on met la possibilité de cocher
   une case “je ne dispose pas d'assurance responsabilité civile”. Cela débloque cette
   case obligatoire pour finaliser l'inscription. »

   LA CASE EST UNE DÉCLARATION, PAS UNE DISPENSE : `insured` reste FAUX et le dossier part
   en `insuranceStatus: 'aucune'`, un état DISTINCT de « manquante » — l'une attend un
   document, l'autre dit qu'il n'y en a pas. Les deux appelaient le même geste.

   ET LE FORMULAIRE N'ÉTAIT QUE LA PREMIÈRE PORTE : la console refusait de valider tout
   prestataire sans `insured`, bouton grisé et garde dans le gestionnaire. Débloquer la
   case sans ouvrir celle-là, c'était envoyer la candidature contre un mur que personne ne
   pouvait ouvrir. La question était d'ailleurs posée de TROIS façons différentes selon
   l'endroit ; elle l'est maintenant d'une seule.

   ENFIN LE CLIENT LISAIT « ✓ Vérifié · Assuré » SUR CHAQUE PRESTATAIRE VALIDÉ, un
   raccourci que le code justifiait par « vraie pour tout prestataire validé ». Cette
   phrase cesse d'être vraie ici : le repère devient un FAIT, renvoyé par le serveur. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fns = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

// Un dossier complet, à l'attestation près.
const PRESQUE = {
  name: 'Léa Brin', phone: '0690112233', siret: '12345678901234', address: 'Gustavia',
  birth: '1990-05-05', cats: ['menage'], rates: { menage: 30 }, acceptsGrille: true,
  mandat: true, cgu: true, charte: true, googleAuth: true, authed: true,
};

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__assur, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — la case débloque l’attestation, et rien d’autre');
  const G = await p.evaluate((d) => ({
    rien: { etape: window.__assur.etape(d), complet: window.__assur.complet(d), manque: window.__assur.manque(d) },
    coche: (function () { const x = Object.assign({}, d, { insuranceNone: true });
      return { etape: window.__assur.etape(x), complet: window.__assur.complet(x), manque: window.__assur.manque(x) }; })(),
    jointe: (function () { const x = Object.assign({}, d, { insuranceDoc: true });
      return { etape: window.__assur.etape(x), complet: window.__assur.complet(x) }; })(),
    // La case ne compense QUE l'assurance : un dossier sans SIRET reste incomplet.
    sansSiret: (function () { const x = Object.assign({}, d, { insuranceNone: true, siret: '' });
      return { complet: window.__assur.complet(x), manque: window.__assur.manque(x) }; })(),
  }), PRESQUE);
  ok(G.rien.etape === false && G.rien.complet === false, 'sans rien, l’étape Assurance bloque encore');
  ok(/assurance/i.test(G.rien.manque.join(' ')) && /n’en ai pas|n'en ai pas/.test(G.rien.manque.join(' ')),
    'et ce qui manque NOMME la case (« ' + G.rien.manque.join(' · ') + ' »)');
  ok(G.coche.etape === true && G.coche.complet === true,
    'la case cochée franchit l’étape et rend la candidature envoyable');
  ok(G.coche.manque.length === 0, 'il ne reste plus rien à fournir (' + JSON.stringify(G.coche.manque) + ')');
  ok(G.jointe.etape === true && G.jointe.complet === true, 'une attestation jointe fait toujours l’affaire');
  ok(G.sansSiret.complet === false && /SIRET|siret/.test(JSON.stringify(G.sansSiret.manque)),
    'et elle ne débloque QUE l’assurance : sans SIRET le dossier reste incomplet');

  console.log('\nB — un seul champ, donc les DEUX inscriptions l’ont');
  // Celle en une page, et l'étape « Assurance » du dossier progressif : c'est cette
  // seconde qui porte les inscriptions EN COURS.
  const nb = (html.match(/\$\{champAssurance\(f\)\}/g) || []).length;
  ok(nb === 2, 'le champ est appelé aux deux endroits et écrit à un seul (' + nb + ' appels)');
  const dup = (html.match(/Joindre mon attestation \(PDF\/photo\)/g) || []).length;
  ok(dup === 1, 'le balisage n’est plus recopié (' + dup + ' occurrence)');
  const vues = await p.evaluate(() => ({
    vide: window.__assur.champ({}),
    coche: window.__assur.champ({ insuranceNone: true }),
    jointe: window.__assur.champ({ insuranceDoc: true, insuranceName: 'att.pdf' }),
    deux: window.__assur.champ({ insuranceDoc: true, insuranceName: 'att.pdf', insuranceNone: true }),
  }));
  ok(/toggle-noins/.test(vues.vide) && /Je ne dispose pas d'assurance responsabilité civile/.test(vues.vide),
    'la case est offerte quand rien n’est joint, avec les mots demandés');
  ok(/req/.test(vues.vide) && !/req/.test(vues.coche),
    'l’astérisque d’obligation s’efface quand la case est cochée : plus rien ne bloque');
  ok(!/toggle-noins/.test(vues.jointe),
    'une attestation jointe ne propose plus la case : la question ne se pose plus');
  ok(!/toggle-noins/.test(vues.deux) && /att\.pdf/.test(vues.deux),
    'et les deux réponses ne peuvent jamais s’afficher ensemble');
  ok(/J'ai une attestation à joindre/.test(vues.coche),
    'la case cochée laisse une porte pour se corriger');

  console.log('\nC — « déclarée absente » n’est pas « manquante »');
  const E = await p.evaluate(() => ({
    rien: window.__assur.etat({}),
    declare: window.__assur.etat({ insuranceNone: true }),
    declareStatut: window.__assur.etat({ insuranceStatus: 'aucune' }),
    jointe: window.__assur.etat({ insured: true, insuranceUrl: 'https://x/y' }),
    validee: window.__assur.etat({ insuranceStatus: 'valide' }),
    lbl: [window.__assur.etiquette('none'), window.__assur.etiquette('aucune')],
  }));
  ok(E.rien === 'none' && E.declare === 'aucune', 'la déclaration donne son propre état');
  ok(E.declareStatut === 'aucune', 'et un dossier déjà écrit se relit pareil');
  ok(E.jointe === 'attente' && E.validee === 'valide', 'les états existants ne bougent pas');
  ok(E.lbl[0][1] !== E.lbl[1][1], 'les deux ne portent pas le même mot (« ' + E.lbl[0][1] + ' » / « ' + E.lbl[1][1] + ' »)');

  console.log('\nD — la console peut vraiment valider, et le bouton le DIT');
  const V = await p.evaluate(() => {
    const A = (x) => Object.assign({ id: 'z', name: 'Léa Brin', siret: '12345678901234', status: 'attente' }, x);
    return {
      rien: window.__assur.peutValider(A({})),
      declare: window.__assur.peutValider(A({ insuranceNone: true, insuranceStatus: 'aucune' })),
      aVerifier: window.__assur.peutValider(A({ insured: true, insuranceStatus: 'attente' })),
      refusee: window.__assur.peutValider(A({ insured: true, insuranceStatus: 'refuse' })),
      validee: window.__assur.peutValider(A({ insured: true, insuranceStatus: 'valide' })),
    };
  });
  ok(V.rien === false, 'un dossier sans rien ne se valide pas');
  ok(V.declare === true, 'un prestataire qui a DÉCLARÉ ne pas avoir de RC se valide');
  ok(V.aVerifier === false && V.refusee === false && V.validee === true,
    'et les trois autres états gardent exactement leur règle');
  // La console affiche la console pour de vrai : on la rend sur un dossier déclaré.
  await p.evaluate(() => {
    const S = window.__S;
    S.account = { name: 'Admin', email: 'joris@ti-services.fr', uid: 'adm', role: 'admin' };
    S.persona = 'admin'; S.admin = { view: 'home', sel: null };
    S.adminArtisans = [{ id: 'z', uid: 'z', name: 'Léa Brin', status: 'attente', type: 'entreprise',
      cats: ['menage'], rates: { menage: 30 }, rate: 30, siret: '12345678901234',
      insured: false, insuranceNone: true, insuranceStatus: 'aucune', phone: '0690112233',
      email: 'lea@e.fr', rating: 0, jobs: 0, zone: 'Gustavia' }];
    window.__render();
  });
  await p.waitForTimeout(400);
  // On lit la CARTE elle-même (`textContent`) : la console est rendue dans un conteneur
  // que `innerText` peut juger invisible, et l'épreuve passerait alors au vert sans rien lire.
  const C = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('[data-adm^="valid-art:"]'));
    const carte = btns.length ? btns[0].closest('.card') : null;
    return { t: carte ? carte.textContent.replace(/\s+/g, ' ') : '',
      btn: btns.map((b) => ({ txt: (b.textContent || '').trim(), off: b.disabled })) };
  });
  ok(C.btn.length > 0 && C.btn.every((x) => !x.off),
    'le bouton de validation n’est pas grisé (' + JSON.stringify(C.btn) + ')');
  ok(C.btn.every((x) => /sans assurance/i.test(x.txt)),
    'et il NOMME ce qu’il va faire avant le clic');
  ok(/déclaré ne pas avoir d'assurance/i.test(C.t), 'la console dit le fait');
  ok(!/validation impossible/i.test(C.t), 'et ne parle plus d’une validation impossible');
  ok(/Déclarée absente/i.test(C.t), 'la pastille porte le mot juste');

  /* E — LE FAIT VOYAGE LÀ OÙ IL SERT. « Vérifié · Assuré » a quitté l'écran du CHOIX :
     la mention était la même sur tout le monde, donc elle ne distinguait personne. Le
     fait n'est pas devenu faux pour autant — il part avec la mission ACCEPTÉE, quand il
     y a quelqu'un en face. Et il ne circule plus avec l'annuaire : une donnée que
     personne n'affiche n'a rien à faire dans une réponse. */
  console.log('\nE — le client ne lit « Assuré » que si c’est vrai');
  ok(fns.indexOf('assure: p.assure') < 0 && fns.indexOf('assure: !!a.insured') < 0,
    'l’annuaire des prestataires ne la fait plus circuler : plus aucun écran ne l’affiche');
  ok(!/Vérifié · Assuré/.test(html.slice(html.indexOf('function prefArtisanSelect(m){'),
    html.indexOf('function prefArtisanSelect(m){') + 4000)),
    'et la carte du choix ne la porte plus sous le nom');
  ok(/p\.insured\?'Vérifié · Assuré':'Vérifié'/.test(html),
    'la carte de la mission acceptée, elle, la porte toujours');
  ok(/providerInsured:\(!!S\.proInsured&&S\.proInsuranceStatus!=='refuse'\)/.test(html),
    'le fait voyage avec l’acceptation de la mission');
  ok(/insured:!!r\.providerInsured/.test(html) && /m\.provider\.insured=!!r\.providerInsured/.test(html),
    'et il est relu, même quand la fiche n’est pas reconstruite');
  // Le manuel de la console DÉCRIT ce que le client voit : il affirmait « tout
  // prestataire validé », c'est-à-dire exactement le raccourci qu'on vient de retirer.
  ok(!/Vérifié · Assuré » \(tout prestataire validé\)/.test(html),
    'le manuel ne décrit plus la mention comme acquise à tout prestataire validé');
  ok(/déclaré ne pas avoir de RC/.test(html), 'et il dit ce que voit le client dans l’autre cas');

  console.log('\nF — ce qui est déclaré part dans le compte, et en revient');
  ok(/insuranceNone:!!f\.insuranceNone,insurer:f\.insurer\|\|'',insuranceUrl:insuranceUrl,insuranceStatus:\(f\.insuranceNone\?'aucune':'attente'\)/.test(html),
    'la candidature écrit la déclaration ET l’état « aucune »');
  ok(/j\.insuranceNone=!!f\.insuranceNone;/.test(html),
    'le brouillon la garde, donc elle suit le compte d’un appareil à l’autre');
  ok(/\{insuranceUrl:url,insured:true,insuranceNone:false,insuranceStatus:'attente'\}/.test(html),
    'et joindre une attestation plus tard l’efface dans le compte');
  ok(/insuranceNone:!!a\.insuranceNone/.test(html), 'la console relit le champ');
  // Le repère « Assuré » du client repose désormais sur `insured` / `insuranceStatus`,
  // deux champs que le prestataire écrit lui-même : il fallait donc que le VERDICT, lui,
  // ne puisse pas s'écrire soi-même, sans quoi le « fait » n'en serait pas un.
  const regles = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
  ok(/function insDeclaree\(\) \{[\s\S]{0,160}in \['attente', 'aucune'\]/.test(regles),
    'le prestataire ne peut DÉCLARER que « attente » ou « aucune »');
  ok(/allow create: if uid\(\) == artisanId\s*&& insDeclaree\(\)/.test(regles),
    'la règle vaut à la création du dossier');
  ok(/insuranceStatus', ''\) == resource\.data\.get\('insuranceStatus', ''\)\s*\|\| insDeclaree\(\)/.test(regles),
    'et à chaque mise à jour : « valide » et « refuse » restent les mots de la console');

  console.log('\nG — l’étape du dossier progressif passe au vert');
  const H = await p.evaluate((d) => {
    const s = window.__assur.etapes(Object.assign({}, d, { insuranceNone: true }));
    return s.map((x) => ({ id: x.id, done: !!x.done }));
  }, PRESQUE);
  ok(H.length === 4 && H.every((x) => x.done), 'les quatre cartes du dossier sont faites (' + JSON.stringify(H) + ')');

  console.log('\nH — une inscription COMMENCÉE AVANT ce changement ne casse pas');
  // Le brouillon tel qu'il a été écrit hier : il ne porte AUCUNE des clés nouvelles.
  const AVANT = { name: 'Marc Ancien', phone: '0690998877', siret: '98765432101234',
    address: 'Lorient', birth: '1985-03-03', cats: ['jardin'], rates: { jardin: 40 },
    acceptsGrille: true, mandat: true, cgu: true, charte: true, insuranceDoc: false,
    googleAuth: true, authed: true };
  const H2 = await p.evaluate((d) => {
    localStorage.setItem(window.__dossier.cle(), JSON.stringify(d));
    window.__S.proForm = {};
    window.__dossier.charge();
    const f = window.__S.proForm;
    const avant = { etape: window.__assur.etape(f), complet: window.__assur.complet(f),
      manque: window.__assur.manque(f), champs: Object.keys(f).length,
      perdus: Object.keys(d).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(d[k])),
      none: f.insuranceNone };
    f.insuranceNone = true;
    return { avant: avant, apres: { etape: window.__assur.etape(f), complet: window.__assur.complet(f) } };
  }, AVANT);
  ok(H2.avant.perdus.length === 0, 'le brouillon se relit entier (perdus : ' + (H2.avant.perdus.join(', ') || 'aucun') + ')');
  ok(H2.avant.none === undefined, 'il ne porte pas la clé nouvelle, et on ne la lui invente pas');
  ok(H2.avant.etape === false && H2.avant.complet === false,
    'son dossier reste exactement où il en était : l’attestation manque toujours');
  ok(/assurance/.test(H2.avant.manque.join(' ')), 'et c’est toujours ce qu’on lui demande');
  ok(H2.apres.etape === true && H2.apres.complet === true,
    'il coche la case, et il peut envoyer : rien d’autre n’a bougé');
  // Et l'enregistrement n'ajoute QUE la clé nouvelle au brouillon d'hier.
  const H3 = await p.evaluate((d) => {
    window.__S.proForm = Object.assign({}, d);
    window.__dossier.enregistre();
    const j = JSON.parse(localStorage.getItem(window.__dossier.cle()) || '{}');
    return { none: j.insuranceNone, changes: Object.keys(d).filter((k) => JSON.stringify(j[k]) !== JSON.stringify(d[k])) };
  }, AVANT);
  ok(H3.none === false && H3.changes.length === 0,
    'l’enregistrement ajoute la clé à faux et ne touche à rien (' + JSON.stringify(H3.changes) + ')');

  console.log('\nI — le bouton, cliqué pour de vrai, dans l’écran réel');
  // La barrière d'installation remplace tout écran d'inscription tant que l'app n'est pas
  // installée : sans ce drapeau, on mesurerait la barrière et non l'étape « Assurance ».
  await p.evaluate((d) => {
    try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
    const S = window.__S;
    S.persona = 'pro'; S.onboarded = true; S.authView = null; S.guest = false;
    S.account = { name: 'Léa Brin', email: 'lea@e.fr', uid: 'u1', role: 'artisan' };
    S.proStatus = 'draft'; S.proStep = 'ins';
    S.proForm = Object.assign({}, d);
    window.__render();
  }, PRESQUE);
  await p.waitForTimeout(400);
  // ON LIT L'ÉCRAN, PAS LE PROGRAMME : le script de l'app vit dans <body>, donc
  // `document.body.textContent` contient tout son source — trois assertions écrites
  // ainsi passaient sans rien mesurer, les phrases cherchées étant dans le code.
  const ecran = () => p.evaluate(() => (document.getElementById('view').textContent || '').replace(/\s+/g, ' '));
  const vu = await p.evaluate(() => ({ bouton: !!document.querySelector('#view [data-act="toggle-noins"]'),
    titre: (document.getElementById('view').textContent || '').indexOf('Attestation d\'assurance responsabilité civile') >= 0 }));
  ok(vu.titre && vu.bouton, 'l’étape « Assurance » du dossier en cours porte bien la case');
  // La coquille de l'app reste à hauteur nulle dans le harnais (l'animation d'entrée ne
  // tourne pas hors navigation réelle), donc `page.click` la juge invisible : on déclenche
  // un VRAI clic sur l'élément, qui remonte au même gestionnaire délégué que le doigt.
  // Un clic qui ne trouve pas sa cible RAPPORTE au lieu de faire tomber l'épreuve :
  // une exception ici masquerait tout ce qui suit.
  const clic = () => p.evaluate(() => {
    const el = document.querySelector('#view [data-act="toggle-noins"]');
    if (!el) return false; el.click(); return true;
  });
  ok(await clic(), 'le clic trouve sa cible');
  await p.waitForTimeout(350);
  const apresClic = await p.evaluate(() => ({
    pose: window.__S.proForm.insuranceNone === true,
    garde: JSON.parse(localStorage.getItem(window.__dossier.cle()) || '{}').insuranceNone,
    phrase: (document.getElementById('view').textContent || '').indexOf('candidature peut être envoyée') >= 0,
  }));
  ok(apresClic.pose, 'le clic pose la déclaration');
  ok(apresClic.garde === true, 'et l’enregistre aussitôt dans le brouillon : fermer l’app ne la perd pas');
  ok(apresClic.phrase, 'l’écran dit ce que cela permet');
  // On repasse au récapitulatif : les quatre cartes, pour de vrai.
  await p.evaluate(() => { window.__S.proStep = null; window.__render(); });
  await p.waitForTimeout(350);
  const hub = await p.evaluate(() => {
    const t = (document.getElementById('view').textContent || '').replace(/\s+/g, ' ');
    const b = document.querySelector('#view [data-act="draft-submit"]');
    return { quatre: /4\/4 étapes/.test(t), bouton: !!b && !b.disabled, reste: /Il reste à fournir/.test(t) };
  });
  ok(hub.quatre, 'le dossier affiche 4/4 étapes');
  ok(hub.bouton && !hub.reste, 'et « Envoyer ma candidature » est actif, sans liste de manques (' + JSON.stringify(hub) + ')');
  // Puis on la retire : l'étape redevient bloquante, rien n'est resté coincé.
  await p.evaluate(() => { window.__S.proStep = 'ins'; window.__render(); });
  await p.waitForTimeout(300);
  ok(await clic(), 'et la case se retrouve pour être décochée');
  await p.waitForTimeout(300);
  const retire = await p.evaluate(() => ({ pose: !!window.__S.proForm.insuranceNone,
    garde: JSON.parse(localStorage.getItem(window.__dossier.cle()) || '{}').insuranceNone }));
  ok(retire.pose === false && retire.garde === false, 'décocher la retire, dans l’écran comme dans le brouillon');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
