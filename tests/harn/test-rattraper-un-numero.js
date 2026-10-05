/* « On ne peut rien faire pour rattraper les erreurs de numéro de téléphone, notamment
   le 0 manquant ? »

   SI, POUR UNE PARTIE — et il faut savoir laquelle, sans jamais se tromper de côté.

   ON RETIRE CE QU'ON PROUVE EN TROP : un indicatif retapé dans la case du numéro
   (« 590690210902 », « 00590690210902 ») donne une lecture UNIQUE, donc on la propose,
   annoncée avant d'être écrite.

   ON N'AJOUTE JAMAIS UN CHIFFRE. « 90210902 » en a huit ; le neuvième manque. Le
   compléter donnerait « 590210902 » (un fixe) OU « 690210902 » (un mobile) : les deux
   existent, les deux sonnent chez quelqu'un. Un numéro deviné est pire qu'un numéro
   absent — on croit pouvoir appeler, et on dérange un inconnu. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__tel && window.__tel.rattrape, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — ce qui se rattrape : un indicatif retapé dans la case du numéro');
  const A = await p.evaluate(() => ({
    double: window.__tel.rattrape('+590 590690210902'),
    inter: window.__tel.rattrape('+590 00590690210902'),
    zeroInter: window.__tel.rattrape('+590 0590690210902'),
  }));
  ok(A.double.etat === 'propose' && A.double.valeur === '+590 690210902', 'l’indicatif écrit deux fois se retire : ' + A.double.valeur);
  ok(A.inter.etat === 'propose' && A.inter.valeur === '+590 690210902', 'la forme internationale 00590 aussi : ' + A.inter.valeur);
  ok(A.zeroInter.etat === 'propose' && A.zeroInter.valeur === '+590 690210902', 'et le 0 devant l’indicatif : ' + A.zeroInter.valeur);

  console.log('B — ce qui NE se rattrape pas, et qui se dit');
  const B = await p.evaluate(() => ({
    capture: window.__tel.rattrape('+590 90210902'),
    txt: window.__tel.txt(window.__tel.rattrape('+590 90210902')),
    inconnu: window.__tel.rattrape('+590 123456789'),
  }));
  ok(B.capture.etat === 'perdu', 'le numéro de la capture n’est PAS rattrapé : il manque un chiffre, et deux numéros existants commenceraient ainsi');
  ok(!B.capture.valeur, 'et aucune valeur n’est proposée — on n’ajoute jamais un chiffre');
  ok(/deviner/.test(B.txt) && /Demandez-le-lui/.test(B.txt), 'la phrase dit le geste, pas « numéro invalide » : ' + B.txt);
  ok(B.inconnu.etat === 'perdu', 'un numéro qui ne ressemble à rien non plus');

  console.log('C — un numéro juste, ou vide, n’est pas un chantier');
  const C = await p.evaluate(() => ({
    bon: window.__tel.rattrape('+590 690210902'),
    zero: window.__tel.rattrape('+590 0690210902'),
    espaces: window.__tel.rattrape('+590 6 90 21 09 02'),
    fixe: window.__tel.rattrape('+590 590275555'),
    vide: window.__tel.rattrape(''),
  }));
  ok(C.bon.etat === 'ok' && C.espaces.etat === 'ok' && C.zero.etat === 'ok', 'un bon numéro, même mal espacé ou avec son 0, se lit déjà : rien à faire');
  ok(C.fixe.etat === 'ok', 'un FIXE 590 n’est pas pris pour un indicatif en double : on ne lui retire rien');
  ok(C.vide.etat === 'vide', 'une case vide n’a rien promis : ce n’est pas un numéro faux');

  console.log('D — la console les trouve tous, dans les quatre populations');
  const D = await p.evaluate(() => {
    const S = window.__S;
    S.adminArtisans = [{ uid: 'a1', id: 'a1', name: 'Vincent Beaudouin', email: 'v@x.fr', phone: '+590 90210902' },
      { uid: 'a2', id: 'a2', name: 'Bon Numéro', email: 'b@x.fr', phone: '+590 690210902' },
      { uid: 'a3', id: 'a3', name: 'Compte Essai', email: 'e@x.fr', phone: '+590 1', test: true }];
    S.adminDrafts = [{ uid: 'd1', name: 'Candidate', email: 'c@x.fr', phone: '+590 590690210902' }];
    S.adminClients = [{ uid: 'c1', uid: 'c1', name: 'Cliente', email: 'cl@x.fr', phone: '+590 12345' }];
    S.adminConcierges = [{ uid: 'k1', id: 'k1', name: 'Villa Rentals', email: 'k@x.fr', phone: '' }];
    const l = window.__tel.cibles();
    return { n: l.length, noms: l.map((x) => x.nom), kinds: l.map((x) => x.kind), etats: l.map((x) => x.r.etat) };
  });
  ok(D.n === 3, 'trois comptes concernés sur six : ' + D.noms.join(', '));
  ok(D.noms.indexOf('Bon Numéro') < 0, 'un numéro qui sonne n’est pas dans la liste');
  ok(D.noms.indexOf('Compte Essai') < 0, 'un compte de test non plus');
  ok(D.noms.indexOf('Villa Rentals') < 0, 'et un compte SANS numéro non plus : il n’a rien promis');
  ok(D.kinds.join(',') === 'artisan,draft,client', 'les quatre populations passent par la même porte : ' + D.kinds.join(', '));
  ok(D.etats.indexOf('propose') >= 0 && D.etats.indexOf('perdu') >= 0, 'et chacune porte son propre verdict');

  console.log('E — la carte de la console, rendue, et le bouton qui écrit');
  const E = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null };
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminReqs = []; S.adminReqsLus = true;
    S._fold = { 'a-tel': true };
    window.__render();
    const carte = () => [...document.querySelectorAll('.card')].find((x) => x.querySelector('[data-fold="a-tel"]'));
    const txt = carte() ? carte().innerText.replace(/\s+/g, ' ') : '';
    const auto = carte() && carte().querySelector('[data-telfix^="auto:"]');
    const libelle = auto ? auto.innerText.replace(/\s+/g, ' ').trim() : '';
    if (auto) auto.click();
    const apres = (S.adminDrafts || []).filter((d) => d.uid === 'd1')[0];
    return { txt: txt, libelle: libelle, ecrit: apres && apres.phone, reste: window.__tel.cibles().length };
  });
  ok(/Vincent Beaudouin/.test(E.txt) && /Candidate/.test(E.txt) && /Cliente/.test(E.txt), 'la carte nomme les trois comptes');
  ok(/Prestataire/.test(E.txt) && /Candidature/.test(E.txt) && /Client/.test(E.txt), 'et dit de quelle population chacun vient');
  ok(/deviner/.test(E.txt), 'elle dit, pour celui qu’on ne peut pas réparer, qu’on ne le devinera pas');
  ok(/\+590 690210902/.test(E.libelle), 'le bouton ANNONCE ce qu’il va écrire avant le clic : « ' + E.libelle + ' »');
  ok(E.ecrit === '+590 690210902', 'et le clic l’écrit : ' + E.ecrit);
  ok(E.reste === 2, 'le compte réparé quitte la liste (' + E.reste + ' restent)');

  console.log('F — la console ne peut pas écrire ce que l’inscription refuse');
  const G = await p.evaluate(() => ({
    faux: window.__tel.corrige('artisan', 'a1', '+590 90210902'),
    vide: window.__tel.corrige('artisan', 'a1', ''),
    inconnu: window.__tel.corrige('martien', 'a1', '+590 690210902'),
    bon: window.__tel.corrige('artisan', 'a1', '+590 691000000'),
    apres: (window.__S.adminArtisans || []).filter((a) => a.uid === 'a1')[0].phone,
  }));
  ok(G.faux === false && G.vide === false, 'un numéro qui ne peut pas sonner est refusé ici aussi : la console ne rouvre pas la porte qu’on vient de fermer');
  ok(G.inconnu === false, 'et une population inconnue n’écrit nulle part');
  ok(G.bon === true && G.apres === '+590 691000000', 'un vrai numéro s’écrit, et l’écran le montre sans attendre le serveur');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
