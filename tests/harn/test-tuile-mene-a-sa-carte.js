/* « Dans mon tableau de bord, en haut à gauche, quand je clique sur réservations en
   cours, je tombe sur l'onglet messagerie. »

   La tuile affichait le nombre de RÉSERVATIONS et ouvrait un AUTRE écran. Ses deux
   voisines (« Artisans », « Clients ») passent par `adm-list:<carte>`, qui déplie la
   carte portant ce chiffre ; celle-ci avait une action à elle, `adm-encours`, et c'est
   précisément ce qui lui permettait de diverger. Un cas particulier qui ne sert à rien
   finit toujours par mentir : elle rejoint la porte commune.

   LA PROPRIÉTÉ QU'ON ÉPROUVE N'EST PAS « ELLE OUVRE LA BONNE CARTE », c'est « elle
   ouvre la carte qui porte LE MÊME NOMBRE ». Une tuile qui compte quelque chose et mène
   ailleurs est un mensonge, quel que soit l'écran d'arrivée. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 2000 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — chaque cible `adm-list:` existe bel et bien comme carte');
  const cibles = [...new Set((html.match(/adm-list:([a-z0-9-]+)/g) || []).map((x) => x.split(':')[1]))];
  const absentes = cibles.filter((id) => html.indexOf("foldCard('" + id + "'") < 0);
  ok(cibles.length >= 3, cibles.length + ' tuiles mènent à une carte : ' + cibles.join(', '));
  ok(absentes.length === 0, 'aucune ne pointe vers une carte qui n’existe pas' + (absentes.length ? ' : ' + absentes.join(', ') : ''));
  ok(!/adm-encours/.test(html), 'et le cas particulier qui permettait la divergence a disparu');

  console.log('B — la console, rendue : chaque tuile ouvre la carte qui porte SON nombre');
  await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.admin = { view: 'home', sel: null }; S._fold = {};
    S.adminArtisans = [
      { uid: 'a1', id: 'a1', name: 'Un', status: 'valide', cats: ['menage'] },
      { uid: 'a2', id: 'a2', name: 'Deux', status: 'valide', cats: ['menage'] },
      { uid: 'a3', id: 'a3', name: 'Trois', status: 'attente', cats: [] }];
    S.adminArtsLoaded = true;
    S.adminClients = [{ uid: 'c1', name: 'Client Un', email: 'c1@x.fr' }];
    S.adminClisLoaded = true;
    // Même forme que les réservations réelles (cf. ADMIN_BOOK) : un montant, un libellé.
    S.adminBookings = [
      { id: 'r1', client: 'Client Un', artisan: 'Un', svc: 'menage', status: 'accepted', amount: 105, when: 'Auj. 14:00' },
      { id: 'r2', client: 'Client Un', artisan: 'Deux', svc: 'menage', status: 'pending', amount: 84, when: 'Demain 09:00' }];
    S.adminReqs = []; S.adminReqsLus = true; S.adminDrafts = []; S.adminConcierges = [];
    window.__render();
    return true;
  });
  // Les chiffres du tableau de bord montent en animation depuis zéro : les lire tout de
  // suite donnerait « 0 » partout, et l'épreuve passerait au vert sans rien mesurer.
  await p.waitForTimeout(1200);
  const R = await p.evaluate(() => {
    const S = window.__S;
    // Chaque tuile : le nombre qu'elle affiche, et la carte qu'elle ouvre.
    const tuiles = [...document.querySelectorAll('[data-act^="adm-list:"]')].map((t) => ({
      txt: t.innerText.replace(/\s+/g, ' ').trim(),
      cible: t.dataset.act.split(':')[1],
      // Le GRAND nombre de la tuile, deuxième ligne : « Artisans / 2 / 1 en attente ».
      n: (t.innerText.split('\n')[1] || '').trim(),
    }));
    const res = [];
    for (const t of tuiles) {
      S._fold = {};
      const btn = document.querySelector('[data-act="adm-list:' + t.cible + '"]');
      if (btn) btn.click();
      const carte = document.querySelector('[data-fold="' + t.cible + '"]');
      const chip = carte ? (carte.closest('.card') || carte).innerText.replace(/\s+/g, ' ') : '';
      res.push({ tuile: t.txt, cible: t.cible, n: t.n, vue: S.admin.view,
        ouverte: !!(S._fold || {})[t.cible], chip: chip.slice(0, 120) });
    }
    return res;
  });
  ok(R.length === 3, 'les trois tuiles du tableau de bord sont des portes : ' + R.map((x) => x.cible).join(', '));
  R.forEach(function (x) {
    ok(x.vue === 'home', '« ' + x.tuile.replace(/\n/g, ' ') + ' » reste sur le tableau de bord, elle ne saute pas sur un autre onglet (vue : ' + x.vue + ')');
    ok(x.ouverte === true, 'et elle déplie bien ' + x.cible);
    ok(x.chip.indexOf(x.n) >= 0, 'la carte ouverte porte le même nombre que la tuile (' + x.n + ') : ' + x.chip.slice(0, 60));
  });
  const enCours = R.filter((x) => /En cours/.test(x.tuile))[0];
  ok(enCours && enCours.cible === 'a-bookings', '« En cours · réservations » mène aux réservations, plus à la messagerie');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
