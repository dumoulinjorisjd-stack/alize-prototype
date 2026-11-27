/* UN CLIENT QUI S'INSCRIT AVEC GOOGLE RESTE CLIENT (l'éditeur, 27/11/2026 : « ça le met
   directement en prestataire »). Le drapeau « inscription prestataire en cours », posé dès
   qu'on ouvre le parcours prestataire, n'était effacé que par « retour côté client » ;
   resté levé, il l'emportait sur le bouton Google CLIENT.
   A. on a ouvert le Google prestataire, puis on choisit le Google CLIENT : compte client ;
   B. une vieille intention « prestataire » + le Google de l'écran « Se connecter » : client ;
   C. contrôle : le Google PRESTATAIRE seul mène bien à l'espace prestataire. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const errs = [];
  const essai = async (gestes, intentionAvant) => {
    const p = await (await b.newContext({ viewport: { width: 393, height: 900 }, serviceWorkers: 'block' })).newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
    await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__session && window.__setFB);
    return p.evaluate(async ({ gestes, intentionAvant }) => {
      window.__ecrits = [];
      const cu = { uid: 'g1', email: 'cecile@gmail.com', displayName: 'Cécile G', providerData: [{ providerId: 'google.com' }] };
      window.__setFB({ auth: { currentUser: null },
        a: { GoogleAuthProvider: function () {}, signInWithPopup: () => Promise.resolve({ user: cu }), setPersistence: () => Promise.resolve(), browserLocalPersistence: {} },
        f: { getDoc: () => Promise.resolve({ exists: () => false, data: () => null }), doc: (_, c, id) => ({ path: c + '/' + id }),
          setDoc: (r, d) => { window.__ecrits.push({ r: r.path, role: d && d.role }); return Promise.resolve(); }, updateDoc: () => Promise.resolve(), onSnapshot: () => function () {},
          collection: () => ({}), query: () => ({}), where: () => ({}), serverTimestamp: () => 0, arrayUnion: () => ({}), arrayRemove: () => ({}) },
        db: {}, fn: { httpsCallable: () => () => Promise.resolve({ data: {} }) }, functions: {} });
      try { if (intentionAvant) localStorage.setItem('tiSignupIntent', intentionAvant); else localStorage.removeItem('tiSignupIntent'); } catch (_) {}
      const S = window.__S; S.lang = 'fr'; S.onboarded = false; S.guest = false; S.demoMode = false; S.persona = 'client'; S.account = null; window.__render();
      const view = document.getElementById('view');
      for (const g of gestes) { const bt = document.createElement('button'); bt.dataset.act = g; view.appendChild(bt); bt.click(); await new Promise((r) => setTimeout(r, 30)); bt.remove(); }
      await window.__session(cu); await new Promise((r) => setTimeout(r, 50));
      return { persona: S.persona, role: S.account && S.account.role, users: window.__ecrits.filter((x) => /^users\//.test(x.r)).map((x) => x.role) };
    }, { gestes, intentionAvant });
  };
  console.log('A — Google prestataire ouvert, puis Google CLIENT');
  const a = await essai(['google-pro', 'google-client'], '');
  ok(a.persona === 'client', 'espace client (' + a.persona + ')');
  ok(a.users.indexOf('artisan') < 0, 'aucune fiche « artisan » écrite (' + (a.users.join(', ') || 'rien') + ')');
  console.log('B — vieille intention « prestataire », Google depuis « Se connecter »');
  const bb = await essai(['google-soon'], 'artisan');
  ok(bb.persona === 'client' && bb.users.indexOf('artisan') < 0, 'espace client, aucune fiche « artisan » (' + bb.persona + ' / ' + (bb.users.join(', ') || 'rien') + ')');
  console.log('C — contrôle : Google PRESTATAIRE seul');
  const c = await essai(['google-pro'], '');
  ok(c.persona === 'pro', 'espace prestataire, comme prévu (' + c.persona + ')');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
