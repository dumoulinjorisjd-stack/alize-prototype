/* MAQUETTE — DEUX PORTES, AUCUNE COMPARAISON.
 *
 * « On ne compare rien, soit on choisit aléatoire pour ceux qui ont accepté les prix,
 * soit on choisit un prestataire qui a son propre catalogue, mais on ne compare rien
 * pour ne rendre personne dans une mauvaise posture, on est sur du haut de gamme »
 * (l'éditeur, 29/10/2026).
 *
 * CELA INVALIDE LA PRÉMISSE DES SEPT MAQUETTES PRÉCÉDENTES. Elles mettaient les prix
 * côte à côte pour qu'on puisse les comparer ; la comparaison est exactement ce qu'on
 * refuse. Et avec elle tombe « les mêmes lignes, ses chiffres à lui » : il n'a pas une
 * variante de notre catalogue, IL A LE SIEN.
 *
 * CE QUE ÇA DÉPLACE, MESURÉ : aujourd'hui « Choisissez vos prestations » est une carte
 * PLUS HAUT que le choix du prestataire. Si le catalogue dépend de la personne, cet
 * ordre est à l'envers — on choisirait des lignes avant de savoir lesquelles existent.
 *
 *   node outils/maquette/deux-portes.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg && window.__svc);
  await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: null }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: '1', label: 'Mon adresse', address: 'Lurin', zone: 'Gustavia', geo: { lat: 17.9, lng: -62.8 } }];
    S.mission = null; S.payStep = false; S.admin = null; S.catOpen = null; S.cfgMore = true;
    S.draft = window.__newMission(window.__svc.trouve('massage')); S._cfgVu = null; window.__cfg.render();
  });
  await p.waitForTimeout(500);

  const carteDe = (re) => p.evaluateHandle((re) => {
    const r = new RegExp(re, 'i');
    const t = Array.from(document.querySelectorAll('#view .card')).find((c) => r.test((c.textContent || '').slice(0, 140)));
    return t || null;
  }, re);
  const tirer = async (h, n) => { const f = path.join(SORTIE, n + '.png'); await h.screenshot({ path: f }); return f; };

  // ── L'ORDRE D'AUJOURD'HUI : les prestations AVANT la personne ────────────────────
  const ordre = await p.evaluate(() => Array.from(document.querySelectorAll('#view .card'))
    .map((c) => ((c.querySelector('.cardh, h3, .eyebrow, label') || {}).textContent || '').trim()).filter(Boolean));
  console.log('\nOrdre des cartes aujourd\'hui :');
  ordre.forEach((t, i) => console.log('  ' + (i + 1) + '. ' + t.replace(/\s+/g, ' ').slice(0, 60)));

  const cPresta = await carteDe('Choisissez vos prestations');
  const rendus = [];
  if (await p.evaluate((e) => !!e, cPresta)) rendus.push(['avant-prestations', await tirer(cPresta, '4-avant-prestations')]);

  /* ── LA PROPOSITION ───────────────────────────────────────────────────────────────
     1. « Avec qui ? » passe EN TÊTE, et ne porte AUCUN prix — c'est le geste du haut de
        gamme : on choisit sa praticienne, puis on regarde sa carte. Rien ne se compare
        parce que rien n'est mis côte à côte.
     2. La carte des prestations dit DE QUI elle est, et porte SON catalogue à elle. */
  await p.evaluate(() => {
    const vues = Array.from(document.querySelectorAll('#view .card'));
    const cPre = vues.find((c) => /Choisissez vos prestations/i.test(c.textContent || ''));
    const champ = Array.from(document.querySelectorAll('#view .field > label'))
      .find((l) => /Votre prestataire/i.test(l.textContent || '')).parentElement;

    // ① la carte « Avec qui ? », construite du champ RÉEL qu'on déplace
    const carte = document.createElement('div');
    carte.className = cPre.className; carte.setAttribute('data-maq', '1');
    const tete = cPre.firstElementChild.cloneNode(true);
    tete.innerHTML = tete.innerHTML.replace(/Choisissez vos prestations/i, 'Avec qui ?');
    carte.appendChild(tete);
    champ.querySelector('label').remove();
    champ.querySelector('[data-prefart=""] .mini').textContent = 'Tarifs Ti-Services. Proposé à tous les prestataires du métier, le plus rapide.';
    carte.appendChild(champ);
    cPre.insertAdjacentElement('beforebegin', carte);

    // ② la carte des prestations devient LA SIENNE
    const t2 = cPre.firstElementChild;
    t2.innerHTML = t2.innerHTML.replace(/Choisissez vos prestations/i, 'Les prestations de Chloé R.');
    const rows = Array.from(cPre.querySelectorAll('.actrow'));
    /* SON CATALOGUE EST LE SIEN : ni le même nombre de lignes, ni les mêmes noms, ni
       les mêmes durées. On CLONE une rangée réelle et l'on n'en change que le texte —
       classes, états et gestes restent ceux de l'application. */
    const sien = [['Massage californien · 1 h', 150], ['Deep tissue · 1 h 15', 185],
      ['Rituel signature · 1 h 30', 230], ['Duo en cabine · 1 h', 260]];
    const hote = rows[0].parentElement;
    rows.forEach((r) => r.remove());
    sien.forEach((l) => {
      const n = rows[0].cloneNode(true);
      n.classList.remove('on');
      n.querySelector('.actck').textContent = '';
      n.querySelector('.actnm').textContent = l[0];
      n.querySelector('.actpr').textContent = l[1] + ' €';
      hote.appendChild(n);
    });
    const note = document.createElement('p');
    note.className = 'mini'; note.setAttribute('data-maq', '1');
    note.style.cssText = 'margin-top:9px;color:var(--muted)';
    note.textContent = 'Les tarifs de Chloé R. Elle vous recevra elle-même.';
    hote.parentElement.appendChild(note);
  });
  await p.waitForTimeout(300);

  const cQui = await carteDe('Avec qui');
  rendus.push(['apres-avec-qui', await tirer(cQui, '4-apres-1-avec-qui')]);
  const cSon = await carteDe('Les prestations de');
  rendus.push(['apres-son-catalogue', await tirer(cSon, '4-apres-2-son-catalogue')]);

  console.log('\nMaquettes :'); rendus.forEach(([n, f]) => console.log('  ' + n.padEnd(20) + ' ' + f));
  if (errs.length) console.log('\nErreurs de page : ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
