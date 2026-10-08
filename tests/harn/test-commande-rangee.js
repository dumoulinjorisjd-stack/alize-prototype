/* « QUAND ON VOIT ÇA ON SE DIT QU'IL Y A QUELQUE CHOSE À FAIRE ESTHÉTIQUEMENT. »

   Mesuré avant de décider : l'écran de commande portait SIX paires libellé + champ
   empilées sur le fond sable et AUCUNE carte sur onze cents pixels. Rien ne disait où
   une question finissait, où la suivante commençait. La carte est pourtant l'idiome de
   toute l'application — cet écran, le seul par lequel passe chaque commande, était le
   seul à n'en porter aucune.

   Et les cinq boutons de souplesse cassaient en 4 + 1, « Semaine » orpheline sur sa
   rangée. Ce n'est pas un hasard de largeur : ce sont DEUX familles — « Précise / ± 1 h /
   ± 2 h » sont des degrés autour de l'heure choisie, « Journée / Semaine » la retirent.
   La grille le dit maintenant, trois puis deux, chaque rangée pleine.

   L'épreuve mesure l'ÉCRAN RENDU, sur les DEUX écrans de commande (celui des métiers à
   l'heure et celui des métiers à prestations). */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const ecran = (svc) => p.evaluate((svc) => {
    window.__setFB({ auth: { currentUser: { uid: 'u', email: 'c@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: 'a1', label: 'Maison', zone: 'Gustavia', address: 'Lurin', geo: { lat: 17.9, lng: -62.84 }, access: '' }];
    S.addrDefault = 'a1'; S.mission = null; S.payStep = false; S.admin = null; S.clientNav = 'home';
    S.draft = window.__newMission(window.__svc.trouve(svc));
    if (S.draft.acts !== undefined && Array.isArray(S.draft.acts)) S.draft.acts = S.draft.acts;
    S.view = 'config'; window.__render();
    const v = document.getElementById('view');
    const blocs = Array.from(v.querySelectorAll('.cfg-bloc')).map((c) => {
      const h = c.querySelector('h3');
      const corps = c.cloneNode(true); const hh = corps.querySelector('h3'); if (hh) hh.remove();
      return { titre: (h ? h.textContent : '').trim(),
        /* un bloc VIDE serait pire que pas de bloc : un titre au-dessus de rien */
        corps: (corps.textContent || '').replace(/\s/g, '').length,
        /* le libellé du PREMIER champ ne doit pas redire le titre juste au-dessus */
        premier: ((c.querySelector('.field > label') || {}).textContent || '').trim() };
    });
    /* AUCUN CHAMP NE FLOTTE : tous sont dans un bloc. */
    const champs = Array.from(v.querySelectorAll('.field'));
    const dehors = champs.filter((x) => !x.closest('.cfg-bloc')).length;
    const segs = Array.from(v.querySelectorAll('[data-slotflex]')).map((x) => {
      const r = x.getBoundingClientRect();
      return { t: x.textContent.trim(), top: Math.round(r.top), g: Math.round(r.left), d: Math.round(r.right) };
    });
    const grille = v.querySelector('.segs.souplesse');
    const gr = grille ? grille.getBoundingClientRect() : null;
    return { blocs, nChamps: champs.length, dehors, segs,
      rangee: gr ? { g: Math.round(gr.left), d: Math.round(gr.right) } : null,
      deb: Math.max(0, v.scrollWidth - v.clientWidth) };
  }, svc);

  /* A — L'ÉCRAN EST RANGÉ, SUR LES DEUX VARIANTES. */
  console.log('A — chaque question dans son bloc, aucun champ ne flotte');
  for (const [svc, quoi] of [['menage', 'métier à l’heure'], ['massage', 'métier à prestations']]) {
    const r = await ecran(svc);
    ok(r.blocs.length >= 3, svc + ' (' + quoi + ') : ' + r.blocs.length + ' blocs — ' + r.blocs.map((x) => x.titre).join(' · '));
    ok(r.dehors === 0, svc + ' : aucun des ' + r.nChamps + ' champs ne flotte hors d’un bloc');
    ok(r.deb === 0, svc + ' : rien ne déborde en largeur');
  }

  /* B — UN BLOC VIDE NE SE DESSINE PAS. La moitié des champs sont conditionnels (mode de
     garde, participants, enfants, lieu, prestataire choisi) : un titre au-dessus de rien
     serait pire que l'absence de bloc. */
  console.log('B — aucun bloc titré au-dessus du vide');
  for (const svc of ['menage', 'massage', 'coiffure', 'baby', 'jardin']) {
    const r = await ecran(svc);
    const creux = r.blocs.filter((x) => x.corps < 3);
    ok(creux.length === 0, svc + ' : les ' + r.blocs.length + ' blocs ont tous un contenu' + (creux.length ? ' sauf « ' + creux.map((x) => x.titre).join(', ') + ' »' : ''));
  }

  /* C — ON NE DIT PAS DEUX FOIS LA MÊME CHOSE. Le titre du bloc et le libellé du premier
     champ disaient « Quand ? » l'un sous l'autre, et « Lieu de la prestation » de même. */
  console.log('C — le titre du bloc n’est pas redit par le champ qui le suit');
  const net = (x) => x.toLowerCase().replace(/[\s?:.,!]| /g, '');
  for (const svc of ['menage', 'massage', 'coiffure']) {
    const r = await ecran(svc);
    const doubles = r.blocs.filter((x) => x.premier && net(x.premier) === net(x.titre));
    ok(doubles.length === 0, svc + ' : aucun doublon titre/libellé' + (doubles.length ? ' — « ' + doubles.map((x) => x.titre).join(', ') + ' »' : ''));
  }

  /* D — LES DEUX RANGÉES DE SOUPLESSE SONT PLEINES. Avant : 4 + 1, « Semaine » seule. */
  console.log('D — trois degrés, puis deux ouvertures, chaque rangée pleine');
  const r = await ecran('menage');
  const rangs = [...new Set(r.segs.map((s) => s.top))];
  ok(r.segs.length === 5 && rangs.length === 2, 'cinq souplesses sur deux rangées (' + rangs.length + ')');
  for (const t of rangs) {
    const sur = r.segs.filter((s) => s.top === t);
    const plein = Math.abs(sur[0].g - r.rangee.g) <= 1 && Math.abs(sur[sur.length - 1].d - r.rangee.d) <= 1;
    ok(plein, 'rangée de ' + sur.length + ' (' + sur.map((s) => s.t).join(' · ') + ') : elle remplit la largeur');
  }
  ok(r.segs.filter((s) => s.top === rangs[0]).length === 3,
    'la première rangée porte les trois degrés autour de l’heure choisie');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
