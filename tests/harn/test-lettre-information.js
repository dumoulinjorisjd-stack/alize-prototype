/* « Peut-on faire une newsletter à envoyer à tous les inscrits pour leur dire tous les
   services qui sont ouverts, sans trop rentrer dans les détails, pour les inciter à
   revenir voir sur l'application ? »

   CE N'EST PAS UNE NOTIFICATION DE PLUS, C'EST UN ENVOI COMMERCIAL, et il obéit à
   d'autres règles que les messages de service. Trois d'entre elles ne se négocient pas :
   un lien de désinscription dans CHAQUE message, qui marche SANS se connecter ; on ne
   réécrit jamais à qui a dit non ; et personne ne reçoit deux fois le même envoi.

   ET LA LISTE DES SERVICES NE SE TAPE PAS, ELLE SE MESURE : un métier n'y figure que
   s'il a un prestataire validé. L'écrire à la main reviendrait à promettre un service
   que personne ne viendrait honorer — la personne revient comme on le lui a demandé,
   commande, et attend. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const bloc = (n) => { const i = srv.indexOf(n); return i < 0 ? '' : srv.slice(i, i + 5200); };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 2400 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__nl, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — la liste des services est MESURÉE, jamais tapée');
  const A = await p.evaluate(() => {
    const S = window.__S;
    S.customServices = [{ id: 'c_cata', nm: 'Location catamaran', rate: 0, custom: true, ico: 'bateau', cat: '', lieu: 'depart' }];
    const pose = (arts) => { S.adminArtisans = arts; return window.__nl.services(); };
    return {
      vide: pose([]),
      unValide: pose([{ uid: 'a1', status: 'valide', cats: ['menage'] }]),
      deux: pose([{ uid: 'a1', status: 'valide', cats: ['menage'] }, { uid: 'a2', status: 'valide', cats: ['jardin', 'menage'] }]),
      attente: pose([{ uid: 'a1', status: 'attente', cats: ['menage'] }]),
      refuse: pose([{ uid: 'a1', status: 'refuse', cats: ['menage'] }]),
      test: pose([{ uid: 'a1', status: 'valide', cats: ['menage'], test: true }]),
      custom: pose([{ uid: 'a1', status: 'valide', cats: ['c_cata'] }]),
    };
  });
  ok(A.vide.length === 0, 'sans prestataire validé, il n’y a rien à annoncer');
  ok(A.unValide.join() === 'Ménage', 'un métier tenu par un prestataire validé y figure : ' + A.unValide.join(', '));
  ok(A.deux.length === 2 && A.deux.indexOf('Ménage') >= 0 && A.deux.indexOf('Jardinage') >= 0,
    'deux métiers, chacun une fois : ' + A.deux.join(', '));
  ok(A.attente.length === 0 && A.refuse.length === 0, 'un prestataire en attente ou refusé n’ouvre rien');
  ok(A.test.length === 0, 'et un compte de TEST non plus : il ne viendrait honorer personne');
  ok(A.custom.join() === 'Location catamaran', 'un métier créé depuis la console y entre comme les autres');

  console.log('B — la carte de la console, rendue');
  const B = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null }; S.adminArtsLoaded = true; S.adminClisLoaded = true;
    S.adminClients = []; S.adminReqs = []; S.adminReqsLus = true; S.adminDrafts = []; S.adminConcierges = [];
    S.adminArtisans = [{ uid: 'a1', id: 'a1', status: 'valide', cats: ['menage'], name: 'Un' }];
    S._fold = { 'a-nl': true }; S.admNl = null; S._nlCompte = null;
    window.__render();
    const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="a-nl"]'));
    const t = c ? c.innerText.replace(/\s+/g, ' ') : '';
    return { t: t, sujet: !!document.querySelector('[data-nl="sujet"]'), intro: !!document.querySelector('[data-nl="intro"]'),
      essai: !!document.querySelector('[data-adm="nlessai"]'), compte: !!document.querySelector('[data-adm="nlcompte"]'),
      envoi: !!document.querySelector('[data-adm="nlenvoi"]') };
  });
  ok(B.sujet && B.intro, 'un objet et une phrase d’introduction se saisissent');
  ok(/Ménage/.test(B.t), 'et la carte MONTRE ce qui sera annoncé, avant tout envoi');
  ok(B.essai && B.compte, '« M’envoyer un essai » et « Compter les destinataires » sont là');
  ok(!B.envoi, 'mais PAS le bouton d’envoi : on ne l’offre qu’une fois le nombre connu');
  ok(/lien de désinscription/.test(B.t), 'la carte rappelle ce que chaque message portera');
  ok(/deux fois le même envoi/.test(B.t), 'et qu’un destinataire ne le reçoit qu’une fois');

  console.log('C — sans métier ouvert, l’envoi est fermé');
  const C = await p.evaluate(() => {
    const S = window.__S; S.adminArtisans = []; S._fold = { 'a-nl': true }; window.__render();
    const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="a-nl"]'));
    const e = document.querySelector('[data-adm="nlessai"]');
    return { t: c ? c.innerText.replace(/\s+/g, ' ') : '', bloque: !!(e && e.disabled) };
  });
  ok(/Aucun métier n’a de prestataire validé/.test(C.t), 'l’écran le dit');
  ok(C.bloque === true, 'et l’essai est fermé : annoncer une liste vide n’inciterait personne à revenir');

  console.log('D — le serveur : qui reçoit, et qui ne reçoit jamais');
  ok(/exports\.envoyerNewsletter = onCall/.test(srv), 'l’envoi est une fonction serveur, pas une boucle dans le navigateur');
  const S = bloc('exports.envoyerNewsletter');
  ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\) \|\| !verifie/.test(S),
    'réservée à l’administrateur, ET à une adresse VÉRIFIÉE : cette fonction peut écrire à tout le parc');
  const N = bloc('function nlRetenu');
  ok(/if \(u\.test === true\) return false;/.test(N), 'un compte de test n’est pas une personne');
  ok(/if \(u\.mailOn === false\) return false;/.test(N), 'un refus ne s’use pas : qui s’est désinscrit ne reçoit plus rien');
  ok(/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$/.test(N), 'une adresse vide ou abîmée ne mène nulle part');
  ok(/if \(audience === 'clients'\) return role === 'client';/.test(N), 'et le public se choisit : un prestataire sait déjà quels métiers sont ouverts');

  console.log('E — personne ne reçoit deux fois');
  ok(/await trace\.create\(/.test(S) && S.indexOf('trace.create') < S.indexOf('const ok = await sendMail'),
    'le destinataire est inscrit AVANT que le courrier parte : deuxième clic, réessai, deux onglets — rien ne double');
  ok(/catch \(_\) \{ deja\+\+; continue; \}/.test(S), 'et un envoi déjà fait est compté, pas refait');
  ok(/NL_LOT/.test(S) && /const NL_LOT = 20;/.test(srv), 'le parc se parcourt par paquets : tout charger casse au-delà de quelques milliers de fiches');

  console.log('F — la désinscription marche SANS compte ouvert');
  ok(/exports\.desinscription = onRequest/.test(srv), 'c’est une adresse publique, pas un écran de l’application');
  const D = bloc('exports.desinscription');
  ok(/String\(u\.mailToken \|\| ''\) !== token/.test(D), 'un jeton propre au compte, tiré au hasard : on ne se désinscrit pas à la place d’un autre');
  ok(/mailOn: false, mailOffAt/.test(D), 'et le refus est écrit');
  ok(/Les messages liés à vos réservations[\s\S]{0,120}continuent de vous parvenir/.test(D),
    'la page dit ce qui CONTINUE d’arriver : se désinscrire d’une lettre n’est pas se couper de ses propres réservations');
  ok(/"source": "\/desinscription"/.test(fs.readFileSync(path.join(RACINE, 'firebase.json'), 'utf8')),
    'et l’adresse est servie par le site, donc le lien du courrier mène quelque part');
  ok(/_nlLienDesinscription\(doc\.id, token\)/.test(S), 'chaque message porte SON lien, pas un lien générique');
  ok(/nlCorpsHtml\(intro, services, lien/.test(srv) && /Ne plus recevoir nos lettres/.test(srv),
    'le corps est rendu par le SERVEUR : oublier le lien une fois enverrait un courrier illégal à tout le parc');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
