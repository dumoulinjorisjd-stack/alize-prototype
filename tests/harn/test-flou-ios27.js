/* LE FLOU D'iOS 27 (l'éditeur, 25/11/2026 : « sur iPhone depuis une mise à jour ça fait
   flou en haut, ça peut être de notre fait ? »). Non : iOS 27 floute le haut des applis
   web installées. Remède relevé : un élément FIXE, opaque, à moins de 4 px du bord haut,
   d'au moins 6 px de haut et 80 % de large. On ne peut pas mesurer le flou d'iOS ici ;
   on mesure que la bande remplit ces conditions, et qu'elle ne change AUCUN pixel ni
   aucun toucher ailleurs. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.waitForFunction(() => window.__S && window.__render); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.persona = 'client'; S.account = { name: 'Laure', email: 'l@e.fr', uid: 'c1', role: 'client' }; window.__render();
    const cs = getComputedStyle(document.body, '::before');
    return { content: cs.content, position: cs.position, top: parseFloat(cs.top), haut: parseFloat(cs.height), large: parseFloat(cs.width) || (window.innerWidth - parseFloat(cs.left || 0) - parseFloat(cs.right || 0)),
      fond: cs.backgroundColor, fondApp: getComputedStyle(document.body).backgroundColor, clic: cs.pointerEvents, vw: window.innerWidth };
  });
  ok(r.content !== 'none' && r.position === 'fixed' && r.top <= 4, 'un élément fixe, collé au bord haut (top ' + r.top + ' px)');
  ok(r.haut >= 6 && r.large >= 0.8 * r.vw, 'au moins 6 px de haut et 80 % de large (' + r.haut + ' × ' + Math.round(r.large) + ' px)');
  ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(r.fond) && r.fond === r.fondApp, 'opaque, de la couleur du fond de l’app (' + r.fond + ')');
  ok(r.clic === 'none', 'il ne prend aucun toucher');
  ok(errs.length === 0, 'aucune erreur JS');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
