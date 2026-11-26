/* LE FILTRE DES PROPOS (audit App Store, 26/11/2026). Règle 1.2 d'Apple : une app où
   les utilisateurs s'écrivent doit filtrer le contenu choquant AVANT qu'il parte, en
   plus de « Signaler », « Bloquer » et d'un contact publié.
   A. le noyau (functions/filtre-propos.js) : refuse insultes, injures, menaces ; laisse
      passer les phrases courantes (« en retard », « je suis crevé », « content »…) ;
   B. le miroir de l'écran a la même liste et rend le même verdict ;
   C. la conversation : un message injurieux ne part pas, le texte reste à corriger ;
   D. la commande : des précisions injurieuses bloquent l'envoi ;
   E. la présentation du prestataire : refusée, rien n'est écrit. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const F = require(path.join(RACINE, 'functions', 'filtre-propos.js'));
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const PASSENT = ['Je serai en retard de 10 min', 'Je suis crevé ce soir', 'Le contact est content', 'Concombres et tomates', 'Merde, la pluie !',
  'Pode trazer a escova?', 'I will be late, sorry', 'Le portail sera ouvert', 'Le fagot de bois est dehors', 'Bonne journée 😊', ''];
const REFUSES = ['Espèce de connard', 'Fils-de-pute', 'fuck you', 'Je vais te tuer', 'vou te matar', 'sale arabe', 't es une s4lope', 'foda-se', "I'll kill you", 'PD', 'Connnnnard'];

console.log('A — le noyau');
const passent = PASSENT.filter((t) => F.proposInjurieux(t));
ok(!passent.length, 'les phrases courantes passent' + (passent.length ? ' — bloquées à tort : ' + passent.join(' | ') : ''));
const ratees = REFUSES.filter((t) => !F.proposInjurieux(t) && t !== 'Connnnnard');
ok(!ratees.length, 'insultes, injures et menaces sont refusées' + (ratees.length ? ' — passées : ' + ratees.join(' | ') : ''));
ok(F.proposInjurieux('Connnnnard') === 'connard', 'les lettres répétées ne contournent pas le filtre');

(async () => {
  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 1800 }, serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html')); await p.waitForFunction(() => window.__S && window.__render && window.__propos);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });

  console.log('B — le miroir de l’écran');
  const ecran = await p.evaluate((txt) => ({ termes: window.__propos.termes(), verdicts: txt.map(window.__propos.f) }), PASSENT.concat(REFUSES));
  ok(JSON.stringify(ecran.termes) === JSON.stringify(F.TERMES), 'même liste de termes (' + ecran.termes.length + ')');
  ok(JSON.stringify(ecran.verdicts) === JSON.stringify(PASSENT.concat(REFUSES).map(F.proposInjurieux)), 'même verdict sur chaque phrase');

  const fb = () => p.evaluate(() => {
    window.__ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'c1', email: 'c@e.fr' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), setDoc: (r, d) => { window.__ecrits.push({ r: r.path, d }); return Promise.resolve(); }, updateDoc: (r, d) => { window.__ecrits.push({ r: r.path, d }); return Promise.resolve(); },
        arrayUnion: (x) => x, getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.account = { name: 'Cécile', email: 'c@e.fr', uid: 'c1' };
  });

  console.log('C — la conversation');
  await fb();
  const c = await p.evaluate(() => {
    const S = window.__S; const m = window.__newMission({ id: 'menage', nm: 'Ménage', rate: 30 }); m._id = 'm1'; m._demoExamen = true;
    window.__demo.accepte(m); S.missions = [m]; S.mission = m; S.chat = true; window.__render();
    const avant = m.chat.length; const el = document.getElementById('chatInput');
    el.value = 'Espèce de connard'; document.querySelector('[data-act="chat-send"]').click();
    const apresRefus = m.chat.length; const reste = (document.getElementById('chatInput') || {}).value;
    const el2 = document.getElementById('chatInput'); el2.value = 'Le portail sera ouvert'; document.querySelector('[data-act="chat-send"]').click();
    return { avant, apresRefus, reste, apresOk: m.chat.length };
  });
  ok(c.apresRefus === c.avant, 'le message injurieux ne part pas');
  ok(c.reste === 'Espèce de connard', 'le texte reste dans le champ, pour être reformulé');
  ok(c.apresOk === c.avant + 1, 'un message normal part');

  console.log('D — les précisions d’une commande');
  const d = await p.evaluate(() => {
    const S = window.__S; S.mission = null; S.chat = false; S.missions = [];
    S.draft = window.__newMission({ id: 'menage', nm: 'Ménage', rate: 30 }); S.draft.notes = 'Le client précédent était un connard';
    window.__propos.place(); return { draft: !!S.draft, missions: (S.missions || []).length };
  });
  ok(d.draft && d.missions === 0, 'précisions injurieuses : la commande ne part pas, le brouillon reste');

  console.log('E — la présentation du prestataire');
  await fb();
  const e = await p.evaluate(() => {
    const S = window.__S; S.persona = 'pro'; S.proStatus = 'valide'; S.proPhone = '0690 12 34 56'; S.proBio = ''; S.proNav = 'account';
    S.proContactForm = { phone: '0690 12 34 56', bio: 'Je réponds aux connards', iban: '', ibanTitulaire: '', address: '' }; S.proEditContact = true; S._fold = { 'p-infos': true }; window.__render();
    document.querySelector('[data-act="pro-contact-save"]').click();
    return { ecrits: window.__ecrits.length, bio: S.proBio, edition: S.proEditContact };
  });
  ok(e.ecrits === 0 && e.bio === '' && e.edition, 'présentation injurieuse : refusée, rien n’est écrit, la saisie reste ouverte');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
