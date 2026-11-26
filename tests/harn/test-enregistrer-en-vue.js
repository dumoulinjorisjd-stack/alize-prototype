/* ENREGISTRER RESTE EN VUE (essais sur iPhone, 26/11/2026). Après « Corriger › » sur la
   carte d'adresse, le bouton Enregistrer était 550 px sous le champ, hors de l'écran ;
   l'éditeur : « il faut penser à cliquer sur Enregistrer ». Et à 320 points, le numéro
   de téléphone était coupé dans sa case (« 0690 12 3 »).
   A. à 320×693 et 393×852 : champ adresse au centre, Enregistrer visible au-dessus des onglets ;
   B. à 320 points : le numéro entier tient dans sa case ;
   C. contrôle : à 393 points, la case de l'indicatif garde sa largeur (112 px). */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o); const errs = [];
  const mesure = async (w, h) => {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' })).newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
    await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__setFB);
    await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });
    await p.evaluate(() => {
      window.__setFB({ auth: { currentUser: { uid: 'p1', email: 'p@t.fr' } }, db: {}, f: { doc: () => ({}), setDoc: () => Promise.resolve(), updateDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) }, fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
      document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
      const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro'; S.proStatus = 'valide'; S.proNav = 'missions';
      S.account = { name: 'APPLE', email: 'p@t.fr', uid: 'p1', role: 'pro' }; S.proPhone = '0690 12 34 56'; S.proAddress = 'Jean bart'; window.__render();
    });
    const carte = await p.$('[data-act="pro-adresse"]'); if (!carte) return { pasDeCarte: true };
    await carte.click(); await p.waitForTimeout(400);
    return p.evaluate(() => {
      const f = document.querySelector('[data-proeditaddr]'); if (f) f.scrollIntoView({ block: 'center' });
      const sv = document.querySelector('[data-act="pro-contact-save"]').getBoundingClientRect(); const nav = document.querySelector('.navbar').getBoundingClientRect();
      const tel = document.querySelector('[data-phonenum="proedit"]'); const pfx = document.querySelector('[data-phonepfx="proedit"]');
      return { enregVisible: sv.top >= 0 && sv.bottom <= nav.top + 1, enregBas: Math.round(sv.bottom), navHaut: Math.round(nav.top),
        champVisible: f && f.getBoundingClientRect().bottom <= nav.top, telEntier: tel.scrollWidth <= tel.clientWidth + 1, telValeur: tel.value, pfxLarg: Math.round(pfx.getBoundingClientRect().width) };
    });
  };
  console.log('A — Enregistrer en vue');
  const a = await mesure(320, 693), b2 = await mesure(393, 852);
  ok(!a.pasDeCarte, 'la carte « adresse incomplète » mène au formulaire');
  ok(a.enregVisible && a.champVisible, '320×693 : champ et Enregistrer visibles au-dessus des onglets (bas ' + a.enregBas + ' / onglets ' + a.navHaut + ')');
  ok(b2.enregVisible && b2.champVisible, '393×852 : champ et Enregistrer visibles (bas ' + b2.enregBas + ' / onglets ' + b2.navHaut + ')');
  console.log('B — le numéro entier à 320 points');
  ok(a.telEntier, 'le numéro « ' + a.telValeur + ' » tient dans sa case (indicatif ' + a.pfxLarg + ' px)');
  console.log('C — contrôle à 393 points');
  ok(b2.pfxLarg === 112, 'la case de l’indicatif garde 112 px (' + b2.pfxLarg + ')');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
