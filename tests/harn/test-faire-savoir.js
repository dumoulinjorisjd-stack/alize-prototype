/* « LES PRESTATAIRES EN MÉNAGE NE RÉPONDENT JAMAIS, JE NE SAIS PAS COMMENT MIEUX LES
   INFORMER DES DEMANDES » (l'éditeur, 22/11/2026). Trois gestes gratuits : un WhatsApp
   prérempli par prestataire dans la console, « vue / jamais vue » pour savoir si l'alerte
   arrive, et un rappel « activez vos notifications » relu avant de partir. */
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
const tranche = (debut, n) => { const i = fn.indexOf(debut); return i >= 0 ? fn.slice(i, i + (n || 3000)) : ''; };

console.log('A — le rappel, côté serveur');
const rap = tranche('exports.rappelNotifications', 2400);
ok(/_adminOuRefus\(request\)/.test(rap), 'réservé à l’administrateur');
ok(/if \(!envoyer\) return \{apercu: \{sujet: RAPPEL_NOTIF_SUJET, texte: rappelNotifTexte\('\[prénom\]'\)\}\};/.test(rap),
  'l’aperçu rend le texte qui part, et n’envoie rien');
ok(/if \(joignables\.has\(d\.id\)\) continue;/.test(rap), 'seuls ceux qu’aucun appareil ne joint le reçoivent');
ok(/if \(deja > seuil\) \{ recents\+\+; continue; \}/.test(rap) && /RAPPEL_NOTIF_JOURS = 7/.test(fn), 'pas plus d’une fois par semaine chacun');
ok(/rappelNotifAt: FieldValue\.serverTimestamp\(\)/.test(rap), 'et c’est noté sur sa fiche');
{ const src = tranche('function rappelNotifTexte(', 1400); const fin = src.indexOf('\n}\n');
  const texte = new Function('return ' + src.slice(0, fin + 2))()('Lydie');
  ok(/^Bonjour Lydie,/.test(texte) && /Sur iPhone : ouvrez ti-services\.fr dans Safari, bouton Partager → « Sur l’écran d’accueil »/.test(texte)
    && /Sur Android : ouvrez ti-services\.fr dans Chrome/.test(texte) && /« Activer les notifications »/.test(texte),
    'le texte dit le geste exact, sur iPhone et sur Android'); }
ok(/if \(prevenus\.has\(d\.id\)\) return;/.test(tranche('exports.diffusionDiagnostic', 2200)),
  '« Non prévenus » ne reprend plus ceux que vous avez prévenus : ils sont dans « Réponses »');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 393, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);

  console.log('B — « Réponses » : vue / jamais vue, et un WhatsApp prérempli');
  const r1 = await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' }; S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminClients = []; S.adminArtsLoaded = true; S.adminClisLoaded = true;
    const vue = new Date(2026, 10, 22, 15, 2).getTime();
    S.adminArtisans = [
      { id: 'u1', uid: 'u1', real: true, name: 'Lydie Antoine', status: 'valide', cats: ['menage'], phone: '0690 55 04 21', skipAt: {}, vueAt: { r1: vue } },
      { id: 'u2', uid: 'u2', real: true, name: 'Karla Barbosa', status: 'valide', cats: ['menage'], phone: '', skipAt: {}, vueAt: {} }];
    S.adminReqs = [{ id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 120000, svc: 'menage', svcName: 'Ménage', when: 'Demain', slot: '09:00',
      zone: 'Toiny', total: 112, unit: 'h', duration: 4, client: 'Cécile', provider: '', providerUid: '', directed: false, boostEur: 0,
      diff: { motif: 'envoyee', cibles: 7, push: 3, mail: 4, at: Date.now() - 120000 }, prevenus: ['u1', 'u2'], invites: ['u2'] }];
    S.adminReqsLus = true; S.admin = { view: 'home' }; S._fold = { 'a-bookings': true };
    window.__render();
    const rep = document.querySelector('.cmd-reponses');
    const a = document.querySelector('[data-wa="u1"]');
    const carte = rep ? rep.closest('.card').getBoundingClientRect() : null;
    const deborde = rep ? Math.max(...[...rep.querySelectorAll('*')].map((e) => e.getBoundingClientRect().right - carte.right)) : 99;
    const lien = a ? [...a.getClientRects()] : [];
    return { deborde: Math.round(deborde), uneLigne: lien.length === 1, txt: rep ? rep.textContent.replace(/\s+/g, ' ') : '', href: a ? a.getAttribute('href') : '', target: a ? a.getAttribute('target') : '',
      waU2: !!document.querySelector('[data-wa="u2"]'), entete: document.getElementById('view').textContent.replace(/\s+/g, ' ') };
  });
  ok(/Lydie Antoine sans réponse · vue 15:02/.test(r1.txt), 'elle l’a vue à 15 h 02 et ne l’a pas prise : c’est dit');
  ok(/Karla Barbosa sans réponse · jamais vue/.test(r1.txt), 'lui ne l’a jamais vue : l’alerte ne l’a pas atteint');
  const txt = decodeURIComponent((r1.href.split('?text=')[1] || ''));
  ok(/^https:\/\/wa\.me\/590690550421\?text=/.test(r1.href) && r1.target === '_blank', 'WhatsApp s’ouvre sur son numéro, à l’indicatif de Saint-Barth');
  ok(/^Bonjour Lydie, une demande de Ménage vous attend sur Ti-Services : Demain à 09:00, Toiny\. Elle est dans votre app : https:\/\/ti-services\.fr\/\?open=missions$/.test(txt),
    'le message est prérempli, sans montant (chacun touche un net différent) : « ' + txt + ' »');
  ok(!r1.waU2, 'pas de bouton sans numéro de téléphone');
  ok(r1.deborde <= 0, 'à 393 px, rien ne sort du cadre (' + r1.deborde + ' px)');
  ok(r1.uneLigne, 'et l’icône WhatsApp ne se sépare pas de son mot');
  ok(/7 prestataires prévenus · 3 par notification, 4 par e-mail · \+ 1 prévenu par vous/.test(r1.entete), 'l’en-tête compte aussi ceux que vous avez prévenus');

  console.log('C — côté prestataire : la demande vue est notée, une fois');
  const r2 = await p.evaluate(async () => {
    window.__ecrits = [];
    window.__setFB({ auth: { currentUser: { uid: 'u1', email: 'l@e.fr' } }, db: {}, functions: {},
      f: { doc: (db, col, id) => ({ col: col, id: id }), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }),
        updateDoc: (ref, patch) => { window.__ecrits.push({ ref: ref, patch: patch }); return Promise.resolve(); } },
      fn: { httpsCallable: () => () => new Promise(() => {}) } });
    const S = window.__S;
    S.persona = 'pro'; S.account = { name: 'Lydie', email: 'l@e.fr', uid: 'u1', role: 'artisan' }; S.proValidated = true; S.proStatus = 'valide';
    S.proCats = ['menage']; S.proOnline = true; S.proNav = 'home'; S.mission = null; S.proSkipped = []; S.proSkipAt = {}; S._openReqLoading = false;
    S.openRequests = [{ id: 'r1', status: 'pending', service: 'menage', serviceName: 'Ménage', clientUid: 'c1', dateISO: '2030-01-10', slot: '09:00', duration: 4, rate: 28, zone: 'Toiny' }];
    window.__render(); await new Promise((r) => setTimeout(r, 50));
    window.__render(); await new Promise((r) => setTimeout(r, 50));
    return window.__ecrits.filter((e) => e.patch && Object.keys(e.patch).some((k) => k.indexOf('vuesAt.') === 0)).map((e) => ({ col: e.ref.col, id: e.ref.id, cles: Object.keys(e.patch) }));
  });
  ok(r2.length === 1 && r2[0].col === 'artisans' && r2[0].id === 'u1' && r2[0].cles.join() === 'vuesAt.r1',
    'une seule écriture, sur SA fiche, « vuesAt.r1 » (' + JSON.stringify(r2) + ')');

  console.log('D — le rappel, dans la carte Notifications : aperçu, puis envoi armé');
  const r3 = await p.evaluate(async () => {
    window.__appels = [];
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_f, nom) => (data) => { window.__appels.push({ nom: nom, data: data });
        if (nom === 'rappelNotifications') return Promise.resolve({ data: data && data.envoyer ? { envoyes: 3, recents: 1, sansEmail: 0 }
          : { apercu: { sujet: 'Ti-Services · Activez les notifications pour recevoir les missions', texte: 'Bonjour [prénom],\n\nSur iPhone : …' } } });
        return new Promise(() => {}); } }, functions: {} });
    const S = window.__S;
    S.persona = 'admin'; S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' };
    S.adminArtisans = [{ id: 'u2', uid: 'u2', real: true, name: 'Karla Barbosa', status: 'valide', cats: ['menage'], phone: '0690 11 22 33', skipAt: {}, vueAt: {} }];
    S.adminNotifs = { u2: { jetons: 0, role: 'artisan', at: 0 } };
    S.admin = { view: 'home' }; S._fold = { 'a-notifs': true }; S._rappelNotif = {};
    window.__render();
    const b1 = document.querySelector('[data-adm="rappel-notif-apercu"]');
    if (!b1) return { b1: false };
    b1.click(); await new Promise((r) => setTimeout(r, 60));
    const apercu = document.getElementById('view').textContent;
    const envoi = document.querySelector('[data-adm="rappel-notif-envoi"]');
    envoi.click(); await new Promise((r) => setTimeout(r, 40));
    const apres1 = window.__appels.filter((a) => a.data && a.data.envoyer).length;
    document.querySelector('[data-adm="rappel-notif-envoi"]').click(); await new Promise((r) => setTimeout(r, 60));
    return { b1: true, apercu: /Activez les notifications pour recevoir les missions/.test(apercu) && /Bonjour \[prénom\]/.test(apercu),
      apres1, envois: window.__appels.filter((a) => a.data && a.data.envoyer).length, toast: document.getElementById('toast').textContent };
  });
  ok(r3.b1, '« Voir l’e-mail de rappel » est offert quand des prestataires n’ont aucune notification');
  ok(r3.apercu, 'l’administrateur lit le sujet et le texte avant tout envoi');
  ok(r3.apres1 === 0 && r3.envois === 1, 'l’envoi s’arme : le premier appui n’envoie rien, le second envoie une fois');
  ok(/Rappel envoyé ✓ 3 prestataires · 1 déjà relancé cette semaine/.test(r3.toast), 'et le résultat est dit (' + r3.toast + ')');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ').slice(0, 140) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
