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

  console.log('\nE — le client ne lit « Assuré » que si c’est vrai');
  ok(/assure: !!a\.insured && a\.insuranceStatus !== 'refuse'/.test(fns),
    'le serveur renvoie le FAIT dans l’annuaire des prestataires');
  ok(/providers: out\.slice\(0, 20\)\.map\(\(p\) => \(\{[^}]*assure: p\.assure/.test(fns),
    'et il sort bien de la réponse (il aurait pu être calculé puis jeté)');
  ok(/p\.assure\?' Vérifié · Assuré':' Vérifié'/.test(html),
    'l’annuaire du choix ne l’affirme que lorsqu’il le sait');
  ok(/p\.insured\?'Vérifié · Assuré':'Vérifié'/.test(html),
    'la carte de la mission acceptée aussi');
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

  console.log('\nG — l’étape du dossier progressif passe au vert');
  const H = await p.evaluate((d) => {
    const s = window.__assur.etapes(Object.assign({}, d, { insuranceNone: true }));
    return s.map((x) => ({ id: x.id, done: !!x.done }));
  }, PRESQUE);
  ok(H.length === 4 && H.every((x) => x.done), 'les quatre cartes du dossier sont faites (' + JSON.stringify(H) + ')');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
