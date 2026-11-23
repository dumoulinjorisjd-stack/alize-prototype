/* « IL FAUT QUE JE VOIE CEUX QUI NE SONT PAS PRÉVENUS ET QUE JE PUISSE LES PRÉVENIR
   QUAND MÊME ; LIBRE À EUX D'ACCEPTER OU NON » (l'éditeur, 20/11/2026).
   Relevé : une prestataire du métier, en ligne, notifications actives, absente des
   « 7 prestataires prévenus » — sans que rien ne dise pourquoi. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = { headless: true };
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const tranche = (debut, n) => { const i = fn.indexOf(debut); return i >= 0 ? fn.slice(i, i + (n || 3000)) : ''; };

console.log('A — une seule porte pour la raison, lue par la diffusion elle-même');
const porte = tranche('function motifNonPrevenu(', 900);
ok(/return 'metier'/.test(porte) && /return 'lieu'/.test(porte) && /'carte' : 'hors-grille'/.test(porte)
  && /return 'indisponible'/.test(porte) && /return 'hors-ligne'/.test(porte), 'motifNonPrevenu nomme chaque raison');
const diff = tranche('exports.notifyArtisansNewRequest', 6000);
ok(/motifs\[d\.id\] = motifNonPrevenu\(/.test(diff) && /uids\.filter\(\(uid\) => motifs\[uid\] === ''\)/.test(diff),
  'la diffusion décide par cette porte : la console dira ce que la diffusion a fait');
ok(!/availOk\(availById\[uid\], r\) && enLigne\(onlineById\[uid\]\)/.test(diff), 'plus de seconde copie du filtre dans la diffusion');
const dia = tranche('exports.diffusionDiagnostic', 2200);
ok(/_adminOuRefus\(request\)/.test(dia) && /motifNonPrevenu\(a, r, svc, REG\.metier\[svc\], reqId, d\.id\)/.test(dia),
  '« Non prévenus » : réservé à l’administrateur, raison donnée par la même porte');
const pqm = tranche('exports.prevenirQuandMeme', 2600);
ok(/_adminOuRefus\(request\)/.test(pqm) && /invites: FieldValue\.arrayUnion\(uid\), prevenus: FieldValue\.arrayUnion\(uid\)/.test(pqm),
  '« Prévenir quand même » : réservé à l’administrateur, il inscrit l’invité ET le compte parmi les prévenus');
ok(/r\.status !== 'pending'/.test(pqm) && /blockedUids/.test(pqm) && /a\.status !== 'valide'/.test(pqm),
  'jamais sur une demande prise, ni vers un prestataire bloqué par le client ou non validé');
ok(/messageNouvelleMission\(r, false, tokens\)/.test(pqm) && /messageNouvelleMission\(r, !!preferred, tokens\)/.test(fn),
  'le même message que la diffusion, écrit une fois');
ok(/'diffusion','prevenus','refusHisto','invites',/.test(RULES), 'les invités ne s’écrivent que par le serveur');

console.log('A bis — qui a déjà dit non n’est plus relancé (éditeur, 20/11/2026)');
{ const src = tranche('function dejaRepondu(', 700); const fin = src.indexOf('\n}\n');
  const dejaRepondu = new Function('return ' + src.slice(0, fin + 2))();
  ok(dejaRepondu({}, {declinedBy: 'u1'}, 'r1', 'u1') === 'a-refuse', 'refusée quand elle lui était adressée : « a refusé »');
  ok(dejaRepondu({}, {refusHisto: [{uid: 'u2', nom: 'B'}]}, 'r1', 'u2') === 'a-refuse', 'refus gardé dans l’historique, même après réouverture');
  ok(dejaRepondu({skippedAt: {r1: 123}}, {}, 'r1', 'u3') === 'a-passe', 'passée dans son fil : « a passé »');
  ok(dejaRepondu({skippedAt: {r9: 123}}, {declinedBy: 'x'}, 'r1', 'u3') === '', 'une AUTRE demande passée ne compte pas (assertion arrière)'); }
ok(/const rep = dejaRepondu\(dd, r, reqId, uid\);\s*if \(rep\) return rep;/.test(porte), 'la porte unique le dit avant tout le reste');
const pool = tranche('async function diffuserAuPool(', 1800);
ok(/motifNonPrevenu\(dd, r, svc, REGP\.metier\[svc\], reqId, d\.id\) === ''/.test(pool) && !/availOk\(availById\[uid\], r\)/.test(pool),
  '« Relancer les prestataires » passe par la même porte : qui a dit non n’est pas relancé');
ok(/motifNonPrevenu\(d\.data\(\) \|\| \{\}, r, svc, REGC\.metier\[svc\], reqIdC, d\.id\)/.test(diff), 'la première diffusion aussi');
ok(/if \(dejaRepondu\(a, r, reqId, uid\)\) throw new HttpsError\('failed-precondition'/.test(pqm), '« Prévenir quand même » n’insiste pas non plus');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 393, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);

  console.log('B — la console : voir les non prévenus, avec leur raison, et les prévenir');
  const r1 = await p.evaluate(async () => {
    window.__appels = [];
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_f, nom) => (data) => { window.__appels.push({ nom: nom, data: data });
        if (nom === 'diffusionDiagnostic') return Promise.resolve({ data: { ouverte: true, liste: [
          { uid: 'm1', nom: 'Marie Coursieres', motif: 'hors-grille', invite: false },
          { uid: 'x2', nom: 'Xavier', motif: 'indisponible', invite: false },
          { uid: 'b3', nom: 'Bruno', motif: 'bloque', invite: false },
          { uid: 'p4', nom: 'Paula', motif: 'a-passe', invite: false }] } });
        if (nom === 'prevenirQuandMeme') return Promise.resolve({ data: { push: 1, mail: 0 } });
        return new Promise(() => {}); } }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' }; S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminArtisans = []; S.adminClients = []; S.adminArtsLoaded = true; S.adminClisLoaded = true;
    S.adminReqs = [{ id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 600000, svc: 'menage', svcName: 'Ménage', when: 'Aujourd’hui', slot: '15:00',
      zone: 'Toiny', total: 84, unit: 'h', duration: 3, client: 'Cécile', provider: '', providerUid: '', directed: false, boostEur: 0,
      diff: { motif: 'envoyee', cibles: 7, push: 3, mail: 4, at: Date.now() - 600000 }, prevenus: ['u1'] }];
    S.adminReqsLus = true; S.admin = { view: 'home' }; S._fold = { 'a-bookings': true, 'cmd-ouvre-r1': true }; S._nonPrev = {};
    window.__render();
    const voir = document.querySelector('[data-adm="np-voir:r1"]');
    if (!voir) return { voir: false };
    voir.click(); await new Promise((r) => setTimeout(r, 80));
    const txt = document.getElementById('view').textContent.replace(/\s+/g, ' ');
    const boutons = [...document.querySelectorAll('[data-adm^="np-prev:"]')].map((x) => x.dataset.adm);
    document.querySelector('[data-adm="np-prev:r1:m1"]').click(); await new Promise((r) => setTimeout(r, 80));
    const apres = document.getElementById('view').textContent.replace(/\s+/g, ' ');
    return { voir: true, txt, boutons, appels: window.__appels, apres, toast: document.getElementById('toast').textContent,
      boutonsApres: [...document.querySelectorAll('[data-adm^="np-prev:"]')].map((x) => x.dataset.adm) };
  });
  ok(r1.voir, '« Voir les non prévenus » est offert sur une demande ouverte');
  ok(r1.voir && /Marie Coursieres · a refusé la grille sur ce métier/.test(r1.txt) && /Xavier · pas disponible à ce créneau/.test(r1.txt),
    'chacun est nommé, avec SA raison (celle du serveur)');
  ok(r1.voir && r1.boutons.join() === 'np-prev:r1:m1,np-prev:r1:x2', 'un « Prévenir quand même » par prestataire ; aucun pour celui que le client a bloqué, ni pour qui a déjà dit non');
  ok(r1.voir && /Paula · a déjà passé cette demande/.test(r1.txt), 'qui a déjà passé la demande est nommé comme tel, pas « sans réponse »');
  ok(r1.voir && r1.appels.some((a) => a.nom === 'prevenirQuandMeme' && a.data.reqId === 'r1' && a.data.uid === 'm1'),
    'le geste prévient CE prestataire-là, sur CETTE demande');
  ok(r1.voir && /Prévenu ✓/.test(r1.toast) && r1.boutonsApres.join() === 'np-prev:r1:x2', 'c’est dit, et son bouton laisse place à « Prévenu »');

  console.log('C — l’invité voit la demande dans son app, même hors de ses créneaux');
  const vis = await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: { uid: 'm1', email: 'm@e.fr' } }, db: {}, functions: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) } });
    const S = window.__S;
    S.persona = 'pro'; S.proCats = ['menage']; S.proOnline = false; S.proSiteMode = 'both';
    S.avail = { lun: {}, mar: {}, mer: {}, jeu: {}, ven: {}, sam: {}, dim: {} };
    const base = { status: 'pending', service: 'menage', clientUid: 'c1', dateISO: '2026-11-20', slot: '15:00' };
    return (typeof window.__demandesVisibles === 'function' ? window.__demandesVisibles([
      Object.assign({ id: 'r1', invites: ['m1'] }, base), Object.assign({ id: 'r2' }, base)]).map((r) => r.id) : 'absent');
  });
  ok(Array.isArray(vis) && vis.join() === 'r1', 'invitée, hors ligne et sans créneau : elle voit r1 ; pas r2, où elle n’est pas invitée (' + JSON.stringify(vis) + ')');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 120) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
