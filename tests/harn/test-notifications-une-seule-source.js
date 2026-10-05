/* « Pourquoi la disponibilité me dit qu'il ne verra pas les demandes alors que les
   notifications sont activées et que c'est marqué en ligne ? »

   Parce que les deux lignes de la MÊME fiche lisaient DEUX DOCUMENTS DIFFÉRENTS pour le
   même fait. Le jeton de notification n'est écrit QUE dans `users/{uid}` — c'est là que
   le serveur le lit pour envoyer — et JAMAIS dans la fiche `artisans`. Le champ `push`
   de la fiche valait donc zéro pour tout le monde, toujours : l'alarme « aucun appareil
   notifié, il ne verra pas les demandes » s'affichait sur CHAQUE prestataire, y compris
   ceux qui reçoivent parfaitement leurs demandes. Une alarme permanente cesse d'être lue,
   et le jour où elle dit vrai personne ne la croit.

   UNE SEULE SOURCE, CELLE QUE LE SERVEUR EMPLOIE. Et tant que les fiches utilisateurs ne
   sont pas lues, on dit qu'on ne sait pas encore plutôt que d'affirmer le pire. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 2200 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — le fait n’a qu’une source, et c’est celle du serveur');
  ok(/const u = \(await db\.collection\('users'\)\.doc\(uid\)\.get\(\)\)/.test(srv)
    && /return Array\.isArray\(u\.pushTokens\) \? u\.pushTokens : \[\]/.test(srv),
    'le serveur lit les jetons dans `users/{uid}`, c’est lui qui décide si la notification part');
  ok(!/pushTokens:FB\.f\.arrayUnion\([^)]*\)[^}]*'artisans'/.test(html)
    && (html.match(/setDoc\(FB\.f\.doc\(FB\.db,'users',[^)]*\),\{pushTokens:FB\.f\.arrayUnion/g) || []).length >= 1,
    'et l’application ne l’écrit QUE là : la fiche artisan n’en a jamais reçu un seul');
  ok(!/push:\(Array\.isArray\(a\.pushTokens\)/.test(html),
    'le champ piégé a quitté la fiche artisan : un champ qui ne peut pas être juste est pire qu’un champ absent');

  console.log('B — la fiche, rendue : les deux lignes disent la même chose');
  const R = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'admin'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', role: 'admin' };
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminReqs = []; S.adminReqsLus = true;
    S.adminClients = []; S.adminDrafts = []; S.adminConcierges = []; S.adminBookings = [];
    const art = { id: 'a1', uid: 'a1', real: true, name: 'Hotel Pearl Beach', status: 'valide',
      type: 'entreprise', statusType: 'entreprise', cats: ['menage'], rates: { menage: 30 }, rate: 30,
      siret: '12345678901234', insured: true, insuranceStatus: 'valide', online: true,
      address: 'Hotel pearl beach', createdAt: Date.parse('2026-09-25'), zone: 'Gustavia',
      phone: '+590690210902', email: 'h@x.fr', history: [], diplomas: [], cardExp: '' };
    S.adminArtisans = [art];
    S.admin = { view: 'art', sel: 'a1' };
    const lire = () => {
      window.__render();
      const t = document.getElementById('view').innerText.replace(/\s+/g, ' ');
      const i = t.indexOf('Disponibilité');
      const apres = t.indexOf('Assurance RC'); const j = apres >= 0 ? t.indexOf('Notifications', apres) : -1;
      return { dispo: i >= 0 ? t.slice(i, i + 120) : '', notifs: j >= 0 ? t.slice(j, j + 120) : '' };
    };
    S.adminNotifs = null;            const inconnu = lire();
    S.adminNotifs = { a1: { jetons: 1, role: 'artisan', at: Date.parse('2026-10-05') } }; const avec = lire();
    S.adminNotifs = { a1: { jetons: 0, role: 'artisan', at: 0 } };                        const sans = lire();
    return { inconnu: inconnu, avec: avec, sans: sans };
  });
  ok(/Notifications actives \(1 appareil\)/.test(R.avec.dispo),
    '1 appareil enregistré : la Disponibilité le dit aussi — « ' + R.avec.dispo.slice(0, 70) + ' »');
  ok(!/ne verra pas les demandes/.test(R.avec.dispo),
    'et l’alarme a disparu, c’est exactement la contradiction relevée sur la capture');
  ok(/Actives/.test(R.avec.notifs) && /1 appareil/.test(R.avec.notifs), 'la ligne Notifications dit la même chose, forcément : même source');
  ok(/ne verra pas les demandes/.test(R.sans.dispo), 'aucun appareil : l’alarme reparaît, et elle veut enfin dire quelque chose');
  ok(/lecture en cours/i.test(R.inconnu.dispo),
    'tant que les fiches ne sont pas lues, on dit qu’on ne sait pas encore plutôt que d’affirmer le pire : ' + R.inconnu.dispo.slice(0, 60));

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
