/* LE CLAVIER DANS L'APPLICATION IPHONE (vu sur iPhone le 26/11/2026). En tapant l'e-mail
   de la connexion, l'écran sautait à chaque lettre : iOS remontait la page pour garder
   le champ au-dessus du clavier, et le recalage à 0 du plein écran la redescendait.
   A. application native, un champ a le doigt : le décalage voulu par iOS reste ;
   B. application native, aucun champ : le recalage à 0 joue toujours ;
   C. application native, le clavier part : retour à 0 ;
   D. contrôle PWA (hors application native) : le recalage reste comme avant, même en saisie. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const ouvrir = async (natif) => {
    const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' + (natif ? ' TiServicesShell/1.0' : '') });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
    await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render);
    await p.evaluate(() => {
      document.body.classList.add('standalone'); try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
      const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
      const S = window.__S; S.lang = 'fr'; S.onboarded = false; S.guest = false; S.account = null; S.persona = 'client'; S.showPitch = false; S.authView = 'login'; window.__render();
      const cale = document.createElement('div'); cale.id = 'caleTest'; cale.style.cssText = 'height:3000px;width:1px;position:absolute;top:0;left:0'; document.documentElement.appendChild(cale);
    });
    return { p, errs };
  };
  const decalage = (p, avecChamp) => p.evaluate(async (avecChamp) => {
    const champ = document.querySelector('[data-loginform] [data-lf="email"]');
    if (avecChamp) champ.focus(); else if (document.activeElement) document.activeElement.blur();
    window.scrollTo(0, 150); await new Promise((r) => setTimeout(r, 120));
    return { y: window.scrollY, focus: document.activeElement === champ };
  }, avecChamp);

  const nat = await ouvrir(true);
  console.log('A — application native, un champ a le doigt');
  const a = await decalage(nat.p, true);
  ok(a.focus, 'le champ e-mail a le focus');
  ok(a.y === 150, 'le décalage voulu par iOS reste (' + a.y + ' px)');
  console.log('B — application native, aucun champ');
  const bb = await decalage(nat.p, false);
  ok(bb.y === 0, 'recalage à 0 (' + bb.y + ' px)');
  console.log('C — application native, le clavier part');
  const c = await nat.p.evaluate(async () => {
    const champ = document.querySelector('[data-loginform] [data-lf="email"]'); champ.focus();
    window.scrollTo(0, 150); await new Promise((r) => setTimeout(r, 60)); const pendant = window.scrollY;
    champ.blur(); await new Promise((r) => setTimeout(r, 200)); return { pendant, apres: window.scrollY };
  });
  ok(c.pendant === 150 && c.apres === 0, 'pendant la saisie ' + c.pendant + ' px, après ' + c.apres + ' px');
  ok(!nat.errs.length, 'aucune erreur JS' + (nat.errs.length ? ' : ' + nat.errs.join(' | ') : ''));

  console.log('D — contrôle PWA : rien ne change');
  const pwa = await ouvrir(false);
  const d = await decalage(pwa.p, true);
  ok(d.focus && d.y === 0, 'PWA en saisie : recalage à 0 comme avant (' + d.y + ' px)');
  ok(!pwa.errs.length, 'aucune erreur JS' + (pwa.errs.length ? ' : ' + pwa.errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
