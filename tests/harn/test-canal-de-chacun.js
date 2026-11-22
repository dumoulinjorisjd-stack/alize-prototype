/* « IL ME MANQUE JUSTE DE DISTINGUER CEUX QUI ONT REÇU LA NOTIFICATION DE CEUX QUI ONT EU
   LE MAIL. ON RELANCE PAR WHATSAPP SURTOUT CEUX QUI REÇOIVENT JUSTE LE MAIL »
   (l'éditeur, 22/11/2026). Le serveur note, pour chacun, le canal qui l'a RÉELLEMENT
   atteint ; la console le dit sur chaque ligne « sans réponse », e-mail seul en tête. */
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
const CANP = require(path.join(RACINE, 'functions', 'canaux-prevenus.js'));
const tranche = (debut, n) => { const i = fn.indexOf(debut); return i >= 0 ? fn.slice(i, i + (n || 3000)) : ''; };

console.log('A — le canal est celui qui a LIVRÉ, pas celui qu’on a tenté');
{ const t2u = { tA: 'u1', tB: 'u3', tC: 'u3' };
  const c = CANP.canauxPrevenus(['u1', 'u2', 'u3', 'u4', 'u5'], t2u, CANP.jetonsLivres(['tA', 'tB', 'tC'], [{ success: true }, { success: false }, { success: false }]),
    ['u2', 'u3'], ['u4']);
  ok(c.u1 === 'push', 'une notification acceptée : « notifié »');
  ok(c.u2 === 'mail', 'pas d’appareil, l’e-mail est parti : « e-mail seulement »');
  ok(c.u3 === 'mail', 'des jetons tous périmés : il n’a rien reçu par notification, c’est l’e-mail qui l’atteint');
  ok(c.u4 === 'plafond', 'l’e-mail retenu par le plafond du jour est dit tel');
  ok(c.u5 === 'aucun', 'rien ne l’a atteint : « injoignable »');
  ok(CANP.jetonsLivres(['a', 'b'], [{ success: false }, { success: true }]).join() === 'b', 'les jetons livrés suivent l’ordre des réponses de FCM'); }

console.log('B — les trois envois le notent, et l’e-mail suit ce qui a été livré');
const creation = tranche("LA NOTIFICATION D'ABORD, L'E-MAIL ENSUITE", 2600);
const pool = tranche('async function diffuserAuPool(', 3800);
const prev = tranche('exports.prevenirQuandMeme', 3400);
const mailApres = (src) => { const iP = src.search(/sendEachForMulticast|pushMulticast\(tokens/); const iM = src.indexOf('mailArtisansSansAppareil(db, artById,');
  return iP >= 0 && iM > iP && /mailArtisansSansAppareil\(db, artById, [^,]+, livresA, r, [^,]+, suivi\)/.test(src); };
ok(mailApres(creation), 'création : la notification part d’abord, l’e-mail à ceux qu’elle n’a pas atteints');
ok(mailApres(pool), 'relance et réouverture : même règle');
ok(mailApres(prev), '« Prévenir quand même » : même règle');
ok(/canaux: CANP\.canauxPrevenus\(targetUids, tokenToUid, livres, suivi\.mailes, suivi\.plafonnes\)/.test(creation)
   && /canaux: CANP\.canauxPrevenus\(uids, tokenToUid, livres, suivi\.mailes, suivi\.plafonnes\)/.test(pool)
   && /await ref\.set\(\{canaux: \{\[uid\]: canal\}\}, \{merge: true\}\);/.test(prev), 'chacun écrit le canal de CHAQUE prestataire sur la demande');
ok(/\.\.\._canauxBornes\(info\),/.test(tranche('async function _noterDiffusion(', 1600)), 'la diffusion l’enregistre, fusionné clé par clé');
{ const src = tranche('function _canauxBornes(', 600); const corps = src.slice(0, src.indexOf('\n}\n') + 2);
  const bornes = new Function('CANP', 'PREVENUS_MAX', 'return ' + corps)(CANP, 80);
  const r = bornes({ canaux: { u1: 'push', u2: 'n’importe quoi', u3: 'mail' } });
  ok(JSON.stringify(r) === '{"canaux":{"u1":"push","u3":"mail"}}', 'une valeur hors de la liste fermée ne s’écrit pas (' + JSON.stringify(r) + ')'); }
ok(/if \(S\.mailes\) S\.mailes\.push\(uid\);/.test(fn) && /if \(S\.plafonnes\) S\.plafonnes\.push\(uid\);/.test(fn), 'l’envoi d’e-mails dit à QUI il a écrit');
ok(/'diffusion','prevenus','refusHisto','invites','canaux',/.test(fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8')), 'seul le serveur écrit le canal (règles)');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 393, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);

  console.log('C — « Réponses » : le canal de chacun, e-mail seul en tête');
  const r1 = await p.evaluate(async () => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_f, nom) => () => nom === 'prevenirQuandMeme' ? Promise.resolve({ data: { push: 0, mail: 1, canal: 'mail' } }) : new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' }; S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminClients = []; S.adminArtsLoaded = true; S.adminClisLoaded = true;
    const art = (id, name, phone) => ({ id: id, uid: id, real: true, name: name, status: 'valide', cats: ['menage'], phone: phone, skipAt: {}, vueAt: {} });
    S.adminArtisans = [art('u1', 'Lydie Antoine', '0690 55 04 21'), art('u2', 'Karla Barbosa', '0690 11 22 33'),
      art('u3', 'Nadia Questel', ''), art('u4', 'Rose Gréaux', '0690 44 55 66'), art('u5', 'Inès Lédée', '0690 77 88 99')];
    S.adminReqs = [{ id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 120000, svc: 'menage', svcName: 'Ménage', when: 'Demain', slot: '09:00',
      zone: 'Toiny', total: 112, unit: 'h', duration: 4, client: 'Cécile', provider: '', providerUid: '', directed: false, boostEur: 0,
      diff: { motif: 'envoyee', cibles: 4, push: 1, mail: 2, at: Date.now() - 120000 }, prevenus: ['u1', 'u2', 'u3', 'u4'], invites: [],
      canaux: { u1: 'push', u2: 'mail', u3: 'aucun', u4: 'mail' } }];
    S.adminReqsLus = true; S.admin = { view: 'home' }; S._fold = { 'a-bookings': true };
    window.__render();
    const rep = document.querySelector('.cmd-reponses');
    const carte = rep ? rep.closest('.card').getBoundingClientRect() : null;
    const deborde = rep ? Math.max(...[...rep.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - carte.right)) : 99;
    const ordre = rep ? [...rep.querySelectorAll('.cmd-rep[data-etat="attente"] b')].map((e) => e.textContent) : [];
    const txt = rep ? rep.textContent.replace(/\s+/g, ' ') : '';
    // « Prévenir quand même » : le canal revient, il est dit et noté tout de suite.
    const bt = document.createElement('button'); bt.setAttribute('data-adm', 'np-prev:r1:u5'); document.getElementById('view').appendChild(bt);
    bt.click(); await new Promise((r) => setTimeout(r, 80));
    return { deborde: Math.round(deborde), ordre: ordre, txt: txt, toast: document.getElementById('toast').textContent,
      canalU5: (S.adminReqs[0].canaux || {}).u5 || '' };
  });
  ok(r1.ordre.join(' / ') === 'Karla Barbosa / Rose Gréaux / Nadia Questel / Lydie Antoine',
    'ceux que seul l’e-mail a atteints d’abord, puis l’injoignable, puis la notifiée (' + r1.ordre.join(' / ') + ')');
  ok(/Karla Barbosa sans réponse · e-mail seulement · jamais vue/.test(r1.txt), '« e-mail seulement » sur sa ligne');
  ok(/Nadia Questel sans réponse · injoignable · jamais vue/.test(r1.txt), '« injoignable » quand rien ne l’a atteinte');
  ok(/Lydie Antoine sans réponse · notifié · jamais vue/.test(r1.txt), '« notifié » quand la notification est arrivée');
  ok(/Réponses : 4 sans réponse dont 2 par e-mail seulement/.test(r1.txt), 'le résumé compte ceux à relancer par WhatsApp (' + r1.txt.slice(0, 80) + ')');
  ok(r1.deborde <= 0, 'à 393 px, rien ne sort du cadre (' + r1.deborde + ' px)');
  ok(/Prévenu par e-mail seulement ✓ : relancez-le par WhatsApp/.test(r1.toast) && r1.canalU5 === 'mail',
    '« Prévenir quand même » dit le canal et la console le note (' + r1.toast + ')');

  console.log('D — une demande d’avant le relevé des canaux ne change pas');
  const r2 = await p.evaluate(() => {
    const S = window.__S; delete S.adminReqs[0].canaux; S.adminReqs[0].prevenus = ['u1', 'u2']; window.__render();
    const rep = document.querySelector('.cmd-reponses');
    return { txt: rep ? rep.textContent.replace(/\s+/g, ' ') : '', canal: !!(rep && rep.querySelector('[data-canal]')) };
  });
  ok(!r2.canal && /Lydie Antoine sans réponse · jamais vue/.test(r2.txt) && /Réponses : 2 sans réponse(?! dont)/.test(r2.txt),
    'pas de canal inventé : la ligne reste celle d’hier');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 140) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
