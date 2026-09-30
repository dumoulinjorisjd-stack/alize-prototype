/* UN MÉTIER CRÉÉ DEPUIS LA CONSOLE SE RANGE DANS UNE CATÉGORIE, ET « PEINTURE » A SON ICÔNE.

   « Quand je crée un nouveau service, je n'ai pas le moyen de le ranger dans la catégorie
   Dépannage & entretien par exemple. Il me faut aussi un logo pour la peinture. »
   L'appartenance à une catégorie était écrite EN DUR dans `CATEGORIES[].subs` : un métier
   ajouté sans code atterrissait toujours en tuile de premier niveau. Le métier DÉCLARE
   maintenant sa catégorie, et `catSubs` est la porte unique qui réunit le code et la
   console — onze endroits la lisent, aucun n'énumère plus `.subs` lui-même.

   Ce qu'on mesure, c'est le RENDU : la tuile d'accueil qui disparaît, la catégorie qui
   compte un métier de plus et le liste quand on l'ouvre, la console qui le nomme — puis
   le changement d'avis, et une clé abîmée qui ne range nulle part. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 428, height: 1100 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(900);

  console.log('A — l’icône « Peinture » existe, dans la liste fermée');
  ok(/\['peinture','Peinture'\]/.test(html), 'elle est dans SVC_ICOS, donc offerte dans le choix d’icône de la console');
  const svg = await p.evaluate(() => { const S = window.__S; const d = document.createElement('div'); d.innerHTML = (window.__I || {}).peinture || ''; return d.querySelector('svg') ? d.querySelector('svg').getAttribute('viewBox') : ''; }).catch(() => '');
  ok(/peinture:'<svg width="22" height="22" viewBox="0 0 24 24"/.test(html), 'et c’est un tracé de la charte, au même trait que ses voisins de métier (' + (svg || 'source') + ')');

  console.log('\nB — créer « Peinture » dans Dépannage & entretien, depuis la console');
  const cree = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    window.__setFB(null);
    S.lang = 'fr'; S.demoMode = false; S.onboarded = true; S.guest = false;
    S.persona = 'admin'; S.admin = { view: 'home', sel: null }; S.adminArtisans = []; S.adminClients = [];
    S.customServices = []; S.adminPrices = null; S.adminPricesLus = true;
    // L'action est réservée à l'administrateur, et la carte des métiers est un volet replié.
    S.account = { name: 'Admin', email: 'admin@exemple.fr', role: 'admin' };
    S._fold = S._fold || {}; S._fold['a-prices'] = true;
    window.__render();
    const nm = document.getElementById('admNewCatName'), rt = document.getElementById('admNewCatRate'), sel = document.getElementById('admNewCatIn');
    if (!nm || !sel) return { ok: false, raison: 'formulaire introuvable' };
    const opts = [...sel.options].map((x) => x.value + '=' + x.textContent);
    nm.value = 'Peinture'; rt.value = '42'; sel.value = 'depannage';
    document.querySelector('[data-act="admin-add-cat"]').click();
    const sv = (S.customServices || []).find((x) => x.nm === 'Peinture');
    return { ok: true, opts, sv: sv ? { id: sv.id, cat: sv.cat, rate: sv.rate } : null };
  });
  ok(cree.ok && cree.opts.length === 4 && /^=Aucune/.test(cree.opts[0]) && cree.opts.some((x) => /^depannage=/.test(x)),
    'le formulaire propose « Aucune » puis les trois catégories (' + (cree.opts || []).join(' | ') + ')');
  ok(cree.sv && cree.sv.cat === 'depannage', 'le métier créé PORTE sa catégorie (' + JSON.stringify(cree.sv) + ')');
  const dansConsole = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find((x) => /Catégories d'accueil/.test(x.textContent || ''));
    return c ? c.innerText.replace(/\s+/g, ' ') : '';
  });
  ok(/Climatisation · Peinture/.test(dansConsole), 'la carte « Catégories d’accueil » le nomme, à la suite des membres du code');

  console.log('\nC — côté client, il n’a pas de tuile à lui : il vit dans la catégorie');
  const accueil = await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'client'; S.clientNav = 'home'; S.catView = null; S.mission = null; S.draft = null; S.account = { name: 'Nina', email: 'n@e.fr', zone: 'Gustavia' };
    S.forceGate = false;
    window.__render();
    const tuiles = [...document.querySelectorAll('button.cat')].map((x) => x.innerText.replace(/\s+/g, ' ').trim());
    const dep = tuiles.find((t) => /Dépannage/.test(t)) || '';
    return { tuiles, dep };
  });
  ok(!accueil.tuiles.some((t) => /^Peinture/.test(t)), 'aucune tuile « Peinture » au premier niveau de l’accueil');
  ok(/6 prestations/.test(accueil.dep), 'la tuile Dépannage & entretien compte 6 prestations au lieu de 5 (« ' + accueil.dep + ' »)');
  const ouverte = await p.evaluate(() => {
    const S = window.__S; S.catView = 'depannage'; window.__render();
    return [...document.querySelectorAll('button.cat')].map((x) => x.innerText.replace(/\s+/g, ' ').trim());
  });
  ok(ouverte.some((t) => /^Peinture/.test(t)), 'et en ouvrant la catégorie, « Peinture » y est (' + ouverte.length + ' prestations listées)');

  console.log('\nD — on change d’avis depuis la fiche du métier : il retrouve sa tuile');
  const change = await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'admin'; S.catView = null; S.account = { name: 'Admin', email: 'admin@exemple.fr', role: 'admin' }; window.__render();
    const sv = (S.customServices || []).find((x) => x.nm === 'Peinture');
    if (!sv) return { ok: false, raison: 'métier absent' };
    // Chaque métier est replié dans la console : on déplie celui-là, comme le ferait un clic.
    S.admPriceOpen = S.admPriceOpen || {}; S.admPriceOpen[sv.id] = true; window.__render();
    const sel = document.querySelector('select[data-catin="' + sv.id + '"]');
    if (!sel) return { ok: false, raison: 'pas de sélecteur sur la fiche' };
    const avant = sel.value;
    sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
    S.persona = 'client'; S.clientNav = 'home'; window.__render();
    const tuiles = [...document.querySelectorAll('button.cat')].map((x) => x.innerText.replace(/\s+/g, ' ').trim());
    return { ok: true, avant, cat: sv.cat, tuile: tuiles.some((t) => /^Peinture/.test(t)), dep: tuiles.find((t) => /Dépannage/.test(t)) || '' };
  });
  ok(change.ok && change.avant === 'depannage', 'la fiche montrait la catégorie en cours (' + change.avant + ')');
  ok(change.ok && change.cat === '' && change.tuile, 'remis sur « Aucune », le métier a de nouveau sa tuile d’accueil');
  ok(/5 prestations/.test(change.dep), 'et Dépannage & entretien retombe à 5 prestations');

  console.log('\nE — ce qui revient du document partagé passe par la liste fermée');
  const abime = await p.evaluate(() => {
    const S = window.__S;
    // Ce que ferait un document abîmé, ou écrit par une version plus récente.
    const sv = (S.customServices || []).find((x) => x.nm === 'Peinture');
    sv.cat = 'categorie-inventee'; S.persona = 'client'; S.clientNav = 'home'; window.__render();
    const tuiles = [...document.querySelectorAll('button.cat')].map((x) => x.innerText.replace(/\s+/g, ' ').trim());
    return { tuile: tuiles.some((t) => /^Peinture/.test(t)) };
  });
  ok(abime.tuile, 'une clé inconnue ne range nulle part : le métier reste sur l’accueil, comme avant');
  ok(/cat:catValide\(s\.cat\)\}/.test(html), 'et `applyCatalogDoc` rejuge la clé au retour du serveur, comme il le fait pour l’icône');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
