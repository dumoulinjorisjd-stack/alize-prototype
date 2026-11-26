/* UN CODE TECHNIQUE N'ARRIVE JAMAIS À L'ÉCRAN DE CONNEXION (vu sur iPhone, 26/11/2026).
   En mode avion, « Se connecter » affichait « Erreur : auth/network-request-failed ».
   fbErr (connexion, inscription) a ses phrases à lui ; pour tout autre code il passe
   désormais par la porte commune fbErrTxt, mise en phrase.
   A. sans réseau : une phrase française, sans code ; traduite en anglais et en portugais ;
   B. un code inconnu : la phrase générique, jamais le code ;
   C. contrôle : les phrases propres à la connexion restent (mot de passe incorrect). */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 852 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__setFB);
  const essai = (code, lang) => p.evaluate(async ({ code, lang }) => {
    window.__setFB({ auth: {}, db: {}, a: { signInWithEmailAndPassword: () => Promise.reject({ code }), setPersistence: () => Promise.resolve() },
      f: { doc: () => ({}), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) }, fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); try { localStorage.setItem('ti_installee', '1'); } catch (_) {} const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = lang; S.onboarded = false; S.guest = false; S.account = null; S.persona = 'client'; S.showPitch = false; S.authView = 'login'; S.loginForm = { email: 'demo.client@ti-services.fr', password: 'x', remember: true };
    window.__render();
    const bt = document.querySelector('#loginSubmit'); if (!bt) return { pasDeBouton: true };
    bt.click(); await new Promise((r) => setTimeout(r, 300));
    return { toast: (document.getElementById('toast') || {}).textContent || '' };
  }, { code, lang });

  console.log('A — sans réseau');
  const fr = await essai('auth/network-request-failed', 'fr');
  ok(!fr.pasDeBouton, 'le bouton « Se connecter » est là');
  ok(fr.toast === 'Connexion perdue, vérifiez votre réseau.', 'FR : « ' + fr.toast + ' »');
  ok(!/auth\/|Erreur :/.test(fr.toast), 'FR : aucun code technique');
  const en = await essai('auth/network-request-failed', 'en');
  ok(en.toast === 'Connection lost, please check your network.', 'EN : « ' + en.toast + ' »');
  const pt = await essai('auth/network-request-failed', 'pt');
  ok(pt.toast === 'Ligação perdida, verifique a sua rede.', 'PT : « ' + pt.toast + ' »');

  console.log('B — un code inconnu');
  const inc = await essai('auth/quelque-chose-de-neuf', 'fr');
  ok(inc.toast === 'Incident technique, réessayez dans un instant.', '« ' + inc.toast + ' »');

  console.log('C — contrôle : les phrases propres à la connexion restent');
  const mdp = await essai('auth/invalid-credential', 'fr');
  ok(mdp.toast === 'E-mail ou mot de passe incorrect.', '« ' + mdp.toast + ' »');
  const mdpEn = await essai('auth/invalid-credential', 'en');
  ok(mdpEn.toast === 'Incorrect email or password.', 'EN : « ' + mdpEn.toast + ' »');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
