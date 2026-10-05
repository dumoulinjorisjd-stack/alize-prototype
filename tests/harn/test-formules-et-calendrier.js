/* « Pas très logique » — capture à l'appui : « Demie journée avec sunset » ET « Journée
   complète avec sunset » cochées en même temps sur la même sortie en mer. La grille à
   l'acte a été écrite pour un salon de coiffure, où « coupe + couleur » se cumulent
   légitimement ; sur un bateau ce sont des FORMULES, on en prend une.

   « Et le calendrier ne me permet de réserver que jusqu'au 3 novembre » : `dayOptions`
   s'arrêtait à TRENTE jours, écrit en dur. Juste pour un ménage, absurde pour un charter
   qu'on réserve des mois à l'avance.

   DEUX RÉGLAGES PAR MÉTIER, et deux défauts qui ne changent rien au parc. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

const BATEAU = { id: 'c_catamaran', nm: 'Location catamaran', rate: 0, custom: true, ico: 'bateau', choixPro: false, cat: '', lieu: 'depart' };
const ACTES = { c_catamaran: [{ id: 'a1', nm: 'Demie journée avec sunset', price: 990 }, { id: 'a2', nm: 'Journée complète avec sunset', price: 1490 }] };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__metier, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — le noyau, et un défaut qui ne change rien');
  const A = await p.evaluate(() => ({
    vide: window.__metier.de({}, 'c_x'),
    bateau: window.__metier.de({ c_catamaran: { exclusif: true, jours: 180 } }, 'c_catamaran'),
    abime: window.__metier.de({ c_x: { exclusif: 'oui', jours: 45 } }, 'c_x'),
    partiel: window.__metier.de({ c_x: { jours: 365 } }, 'c_x'),
    choix: window.__metier.jours().map((d) => d[0]),
  }));
  ok(A.vide.exclusif === false && A.vide.jours === 30 && A.vide.regle === false, 'un métier non réglé cumule les prestations et réserve à 30 jours, comme avant');
  ok(A.bateau.exclusif === true && A.bateau.jours === 180, 'un métier réglé porte ses deux choix');
  ok(A.abime.exclusif === false && A.abime.jours === 30, 'une valeur abîmée ou un délai hors liste retombent sur le défaut : « oui » n’est pas vrai, 45 n’est pas un choix offert');
  ok(A.partiel.jours === 365 && A.partiel.exclusif === false, 'on peut ne régler QUE l’horizon');
  ok(A.choix.join(',') === '30,90,180,365', 'quatre horizons, pas un de plus : ' + A.choix.join(', '));

  console.log('B — une formule remplace l’autre, elle ne s’y ajoute pas');
  const B = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'client'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Client', email: 'c@x.fr' }; S.addresses = []; S.availableServices = null;
    S.customServices = [sv]; S.adminCatalog = actes;
    S.adminMetier = { c_catamaran: { exclusif: true } };
    S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
    window.__render();
    const clic = (id) => { const el = document.querySelector('[data-actpick="' + id + '"]'); if (el) el.click(); return (S.draft.acts || []).map((a) => a.id); };
    const un = clic('a1'); const deux = clic('a2'); const retire = clic('a2');
    return { un: un, deux: deux, retire: retire, total: document.getElementById('view').innerText.indexOf('2 480') };
  }, [BATEAU, ACTES]);
  ok(B.un.join(',') === 'a1', 'la demie journée se coche');
  ok(B.deux.join(',') === 'a2', 'cocher la journée complète REMPLACE la demie journée : ' + B.deux.join(', '));
  ok(B.retire.length === 0, 'et décocher reste possible : on ne force jamais une sélection, le total dirait un prix que personne n’a demandé');
  ok(B.total < 0, 'les deux formules ne s’additionnent plus (990 + 1490 = 2 480 € n’apparaît nulle part)');

  console.log('C — sans le réglage, les prestations se cumulent toujours');
  const C = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    S.customServices = [sv]; S.adminCatalog = actes; S.adminMetier = {};
    S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
    window.__render();
    const clic = (id) => { const el = document.querySelector('[data-actpick="' + id + '"]'); if (el) el.click(); return (S.draft.acts || []).map((a) => a.id); };
    clic('a1'); return clic('a2');
  }, [BATEAU, ACTES]);
  ok(C.join(',') === 'a1,a2', 'un salon de coiffure garde « coupe + couleur » : ' + C.join(', '));

  console.log('D — jusqu’à quand on peut réserver');
  const D = await p.evaluate(() => ({
    def: window.__metier.options().length,
    trente: window.__metier.options(30).length,
    an: window.__metier.options(365).length,
    borne: window.__metier.options(10000).length,
    long: window.__metier.long('2027-03-04'),
    brut: window.__metier.long('pas une date'),
  }));
  ok(D.def === 30 && D.trente === 30, 'sans rien demander, trente jours : rien ne change pour les métiers d’aujourd’hui');
  ok(D.an === 365, 'et un an quand le métier le demande');
  ok(D.borne === 400, 'une valeur absurde reste bornée (' + D.borne + ')');
  ok(/mars/.test(D.long) && /2027/.test(D.long), 'une date lointaine se dit en toutes lettres, année comprise : ' + D.long);
  ok(D.brut === 'pas une date', 'et ce qui n’est pas une date n’est pas maquillé en date');

  console.log('E — l’écran de commande : liste courte, puis calendrier du téléphone');
  const E = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    S.customServices = [sv]; S.adminCatalog = actes;
    const rend = (jours) => {
      S.adminMetier = jours ? { c_catamaran: { jours: jours } } : {};
      S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
      S.draft.acts = [{ id: 'a2', nm: 'Journée', price: 1490, qty: 1 }];
      window.__render();
      const el = document.querySelector('[data-cfday]');
      return { tag: el ? el.tagName : 'aucun', n: el && el.tagName === 'SELECT' ? el.options.length : 0,
        min: el ? el.getAttribute('min') : '', max: el ? el.getAttribute('max') : '' };
    };
    return { court: rend(0), long: rend(180) };
  }, [BATEAU, ACTES]);
  ok(E.court.tag === 'SELECT' && E.court.n === 30, 'à trente jours, la liste déroulante d’aujourd’hui, inchangée (' + E.court.n + ' jours)');
  ok(E.long.tag === 'INPUT', 'au-delà, le champ devient un vrai calendrier (' + E.long.tag + ')');
  const jours = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  ok(E.long.min && E.long.max && jours(E.long.min, E.long.max) === 180,
    'borné à ce que le métier autorise, ni avant aujourd’hui ni après : ' + E.long.min + ' → ' + E.long.max);

  console.log('F — la console pose les deux réglages');
  ok(/data-adm="metexcl:/.test(html) && /data-adm="metjours:/.test(html), 'les deux boutons existent sur la fiche du métier');
  ok(/metier:S\.adminMetier\|\|\{\}/.test(html), 'et le catalogue les écrit, sinon le serveur les effacerait au tour suivant');
  ok(/if\(d\.metier&&typeof d\.metier==='object'\)/.test(html), 'et les relit');
  const F = await p.evaluate(() => {
    const S = window.__S; S.adminMetier = {};
    document.body.classList.add('standalone');
    S.persona = 'admin'; S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null };
    S.adminArtisans = []; S.adminArtsLoaded = true; S.adminClients = []; S.adminClisLoaded = true;
    S.adminReqs = []; S.adminReqsLus = true; S.adminDrafts = []; S.adminConcierges = [];
    S._fold = { 'a-prices': true }; S.admPriceOpen = { c_catamaran: true };
    window.__render();
    const ex = document.querySelector('[data-adm="metexcl:c_catamaran"]');
    if (ex) ex.click();
    const apres = window.__metier.du('c_catamaran').exclusif;
    const j = document.querySelector('[data-adm="metjours:c_catamaran:180"]');
    if (j) j.click();
    return { ex: apres, jours: window.__metier.du('c_catamaran').jours, table: JSON.stringify(S.adminMetier) };
  });
  ok(F.ex === true, 'le bouton « une seule prestation » prend effet');
  ok(F.jours === 180, 'et l’horizon aussi (' + F.jours + ' jours)');
  ok(/"exclusif":true/.test(F.table) && /"jours":180/.test(F.table), 'on n’enregistre que ce qui diffère du défaut : ' + F.table);

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
