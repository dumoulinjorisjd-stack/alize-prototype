/* « Est-ce que j'ai un moyen de voir sur la console si les artisans concernés par la
   demande en cours ont cliqué sur passer cette demande ou l'ont refusée ? »

   NON, ET POUR TROIS RAISONS MESURÉES. La diffusion ne gardait que des NOMBRES (« 3
   prestataires prévenus ») ; « passer » s'écrit sur la fiche de l'artisan, que la console
   ne lisait pas ; et un refus s'écrit sur la demande puis S'EFFACE quand le client la
   rouvre, quelques secondes plus tard. L'épreuve tient les trois portes : le serveur
   garde la liste et l'historique, la console les croise avec l'heure de passage. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — le serveur garde QUI a été prévenu, et QUI a refusé');
const iN = SRV.indexOf('async function _noterDiffusion');
const corpsN = SRV.slice(iN, SRV.indexOf('\n}\n', iN));
ok(/prevenus: FieldValue\.arrayUnion\(\.\.\._uidsPrevenus\(info\)\)/.test(corpsN), 'la liste s\'ACCUMULE (arrayUnion), une relance ne l\'efface pas');
const appels = (SRV.match(/motif: 'envoyee', cibles: targetUids\.length[^}]*\}/g) || []);
ok(appels.length === 2 && appels.every((a) => /uids: targetUids/.test(a)), 'les deux envois de la création passent la liste (' + appels.length + ')');
ok(/_noterDiffusion\(db, reqId, Object\.assign\(\{ uids: uids \}, issue\)\)/.test(SRV), 'la relance et la réouverture aussi (diffuserAuPool)');
const iR = SRV.indexOf('LE REFUS NE S\'EFFACE PLUS');
const iQ = SRV.indexOf('_quotaJour(db, \'diff-\'', iR);
ok(iR > 0 && /if \(wasDeclined && before\.declinedBy\) \{\s*try \{\s*await db\.collection\('requests'\)\.doc\(event\.params\.reqId\)\.set\(\{ refusHisto: FieldValue\.arrayUnion/.test(SRV.slice(iR, iQ)), 'le refus est gardé à la réouverture, dès qu\'une demande déclinée repart');
ok(iQ > iR, 'et AVANT le plafond, qui peut faire sortir plus bas');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const iA = APP.indexOf('function refreshAdminArtisans');
ok(/skipAt:\(a\.skippedAt&&typeof a\.skippedAt==='object'\)\?a\.skippedAt:\{\}/.test(APP.slice(iA, iA + 4000)),
  'la console lit l\'heure de passage sur la fiche de chaque artisan');
ok(/'diffusion','prevenus','refusHisto'/.test(RULES), 'les deux champs sont réservés au serveur (serverKeys)');
ok(eval('(' + SRV.slice(SRV.indexOf('function _uidsPrevenus'), SRV.indexOf('async function _noterDiffusion')).replace(/^function _uidsPrevenus/, 'function') + ')')
  ? true : false, 'le filtre se relit');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cmd);

  console.log('B — la console projette ce que le serveur a écrit');
  const proj = await p.evaluate(() => {
    const brut = { status: 'pending', clientUid: 'c1', service: 'menage',
      diffusion: { motif: 'relancee', cibles: 3, push: 2, mail: 1, at: 2000 },
      prevenus: ['u1', 'u2', 'u3', 42, ''],
      refusHisto: [{ uid: 'u2', nom: 'Bob', at: 1500 }, { nom: 'sans uid' }] };
    const enCours = { status: 'declined', declinedBy: 'u3', declinedName: 'Cléo', declinedAt: 1800 };
    return { a: window.__cmd.projette('r1', brut), b: window.__cmd.projette('r2', enCours) };
  });
  ok(JSON.stringify(proj.a.prevenus) === '["u1","u2","u3"]', 'la liste des prévenus, nettoyée de ce qui n\'est pas un identifiant');
  ok(proj.a.refus.length === 1 && proj.a.refus[0].uid === 'u2' && proj.a.refus[0].at === 1500, 'l\'historique des refus (une entrée sans identifiant est jetée)');
  ok(proj.b.refus.length === 1 && proj.b.refus[0].nom === 'Cléo', 'un refus PAS ENCORE rouvert se lit sur la demande elle-même');
  ok(proj.a.diff && proj.a.diff.at === 2000, 'l\'heure de la diffusion voyage, pour dater la relance');

  const console_ = (reqs, arts) => p.evaluate(({ reqs, arts }) => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'A', email: 'ccs.dumoulin@gmail.com' }; S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminArtisans = arts; S.adminClients = [];
    S.adminArtsLoaded = true; S.adminClisLoaded = true;
    S.adminReqs = JSON.parse(JSON.stringify(reqs)); S.adminReqsLus = true;
    S.admin = { view: 'home' }; S._fold = { 'a-bookings': true };
    window.__render();
    const el = document.querySelector('.cmd-reponses');
    return { txt: el ? el.textContent.replace(/\s+/g, ' ') : '(absent)',
      etats: el ? Array.from(el.querySelectorAll('.cmd-rep')).map((x) => x.dataset.etat) : [] };
  }, { reqs, arts });

  const H = 3600000;
  const base = { id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 5 * H, svc: 'menage', svcName: 'Ménage',
    when: 'Demain', slot: '09:00', zone: 'Lorient', total: 105, unit: 'h', duration: 3, client: 'Camille',
    provider: '', providerUid: '', directed: false, boostEur: 0 };
  const art = (uid, name, skipAt) => ({ id: uid, uid: uid, real: true, name: name, status: 'valide', cats: ['menage'], skipAt: skipAt || {} });
  const t0 = Date.now() - 2 * H;

  console.log('C — chaque prévenu, et ce qu\'il a fait');
  const C = await console_([Object.assign({}, base, {
    diff: { motif: 'envoyee', cibles: 3, push: 3, mail: 0, at: t0 },
    prevenus: ['u1', 'u2', 'u3'], refus: [{ uid: 'u2', nom: 'Bob', at: t0 + 600000 }] })],
    [art('u1', 'Alice', { r1: t0 + 300000 }), art('u2', 'Bob'), art('u3', 'Cléo'), art('u4', 'Dan', { autre: t0 })]);
  ok(/Alice a passé/.test(C.txt), 'Alice a passé, et c\'est dit');
  ok(/Bob a refusé/.test(C.txt), 'Bob a refusé, et c\'est dit — même si la demande a été rouverte');
  ok(/Cléo sans réponse/.test(C.txt), 'Cléo, prévenue, n\'a encore rien fait');
  ok(!/Dan/.test(C.txt), 'Dan a passé une AUTRE demande : il n\'est pas nommé ici');
  ok(JSON.stringify(C.etats) === '["refus","passe","attente"]', 'refus, puis passages, puis sans réponse (' + C.etats + ')');
  ok(/Réponses : 1 refus, 1 passage, 1 sans réponse/.test(C.txt), 'le résumé compte (' + C.txt.slice(0, 80) + ')');

  console.log('D — la relance ne fait pas oublier qui avait passé');
  const D = await console_([Object.assign({}, base, {
    diff: { motif: 'relancee', cibles: 3, push: 3, mail: 0, at: t0 + 900000 }, prevenus: ['u1'], refus: [] })],
    [art('u1', 'Alice', { r1: t0 + 300000 })]);
  ok(/Alice a passé \d\d:\d\d \(avant la relance\)/.test(D.txt), 'passé AVANT la relance, et c\'est dit');

  console.log('E — une demande prise nomme celui qui l\'a prise');
  const E = await console_([Object.assign({}, base, { status: 'accepted', providerUid: 'u3', provider: 'Cléo',
    diff: { motif: 'envoyee', cibles: 2, push: 2, mail: 0, at: t0 }, prevenus: ['u1', 'u3'], refus: [] })],
    [art('u1', 'Alice', { r1: t0 + 1 }), art('u3', 'Cléo')]);
  ok(/Cléo a pris la mission/.test(E.txt) && !/Cléo sans réponse/.test(E.txt), 'Cléo a pris la mission, elle n\'est pas « sans réponse »');

  console.log('F — une demande d\'avant la liste le dit, au lieu de se taire');
  const F = await console_([Object.assign({}, base, {
    diff: { motif: 'envoyee', cibles: 4, push: 4, mail: 0, at: t0 }, prevenus: [], refus: [] })],
    [art('u1', 'Alice', { r1: t0 + 1 })]);
  ok(/Alice a passé/.test(F.txt), 'les passages restent lisibles (la fiche de l\'artisan les portait déjà)');
  ok(/n’était pas encore gardée/.test(F.txt), 'et la console dit que la liste des prévenus manque');
  const G = await console_([Object.assign({}, base, { diff: { motif: 'envoyee', cibles: 4, push: 4, mail: 0, at: t0 }, prevenus: [], refus: [] })], [art('u1', 'Alice')]);
  ok(G.txt === '(absent)', 'personne n\'a rien fait et la liste manque : aucune ligne inventée');

  console.log('G — un nom venu d\'un compte ne s\'exécute pas');
  const X = await console_([Object.assign({}, base, { diff: { motif: 'envoyee', cibles: 1, push: 1, mail: 0, at: t0 },
    prevenus: ['ux'], refus: [] })], [art('ux', '<img src=x onerror="window.__pwn=1">')]);
  const pwn = await p.evaluate(() => !!window.__pwn || !!document.querySelector('.cmd-reponses img'));
  ok(!pwn && /<img/.test(X.txt), 'le nom paraît en texte, aucune balise ne s\'ouvre');

  ok(errs.length === 0, 'aucune erreur de page (' + errs.slice(0, 2).join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})();
