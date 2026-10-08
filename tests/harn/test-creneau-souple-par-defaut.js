/* « FAIRE DU CRÉNEAU SOUPLE LE DÉFAUT, PAS L'EXCEPTION. »

   « Précise » était pré-cochée sur les vingt et un métiers : le client était poussé, par
   défaut, vers la demande LA PLUS DIFFICILE à satisfaire. Il devine une heure, personne
   ne répond, et il n'apprend jamais pourquoi.

   LE CRITÈRE N'EST PAS « EST-CE PERMIS » MAIS « LE CLIENT EST-IL LE SUJET ». Une coupe,
   un massage, un cours : la personne EST la prestation. Un ménage, un jardin, une
   piscine : c'est une tournée, et l'heure appartient à celui qui la fait.

   L'épreuve mesure l'ÉCRAN DE COMMANDE rendu, métier par métier : ce qui est allumé, ce
   que le client lit, et qu'un seul toucher ramène l'heure. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  /* On ouvre l'écran de commande comme le client l'ouvre, et on lit ce qui est RENDU :
     le segment allumé, la présence d'un sélecteur d'heure, la phrase. */
  const commande = (svc) => p.evaluate((svc) => {
    window.__setFB({ auth: { currentUser: { uid: 'u', email: 'c@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: 'a1', label: 'Maison', zone: 'Gustavia', address: 'Lurin', geo: null, access: '' }];
    S.addrDefault = 'a1'; S.mission = null; S.payStep = false; S.admin = null; S.clientNav = 'home';
    const sv = window.__svc.trouve(svc);
    if (!sv) return { absent: true };
    S.draft = window.__newMission(sv);
    S.view = 'config'; window.__render();
    const v = document.getElementById('view');
    const segs = Array.from(v.querySelectorAll('[data-slotflex]'));
    const on = segs.filter((x) => x.classList.contains('on')).map((x) => x.dataset.slotflex);
    const txt = (v.textContent || '').replace(/\s+/g, ' ');
    return { flex: S.draft.slotFlex, allume: on, segs: segs.map((x) => x.dataset.slotflex),
      heure: !!v.querySelector('[data-cfhour]'),
      phrase: /le pro choisit son heure de passage/.test(txt) };
  }, svc);

  /* A — LES TROIS TOURNÉES. Le client ne choisit plus d'heure, et l'écran dit pourquoi. */
  console.log('A — une tournée : la journée par défaut, et l’écran le DIT');
  for (const svc of ['menage', 'jardin', 'piscine']) {
    const r = await commande(svc);
    ok(r.flex === 'day', svc + ' : le créneau part sur la journée');
    ok(r.allume.join(',') === 'day', svc + ' : c’est « Journée » qui est allumée (' + r.allume.join(',') + ')');
    ok(!r.heure, svc + ' : aucun sélecteur d’heure — on ne demande pas de deviner');
    ok(r.phrase, svc + ' : et l’écran dit que le pro choisit son heure de passage');
  }

  /* B — LE CLIENT EST LE SUJET : on ne touche à rien. Une coupe, un massage, un cours,
     une garde — la personne EST la prestation, elle organise sa journée autour. */
  console.log('B — le client est le sujet : l’heure reste à lui');
  for (const svc of ['coiffure', 'massage', 'yoga', 'baby', 'demenagement', 'plomberie']) {
    const r = await commande(svc);
    if (r.absent) { ok(false, svc + ' : métier introuvable'); continue; }
    ok(!r.flex, svc + ' : « Précise » par défaut (' + JSON.stringify(r.flex) + ')');
    ok(r.heure, svc + ' : le sélecteur d’heure est là');
  }

  /* C — UN SEUL TOUCHER RAMÈNE L'HEURE. Un défaut qu'on ne peut pas défaire n'est pas un
     défaut, c'est une contrainte : « Précise » est sur le même écran, sous les yeux. */
  console.log('C — « Précise » est à un toucher, et elle ramène l’heure');
  await commande('menage');
  const avant = await p.evaluate(() => !!document.getElementById('view').querySelector('[data-cfhour]'));
  await p.click('#view [data-slotflex="0"]');
  await p.waitForTimeout(420);
  const apres = await p.evaluate(() => {
    const v = document.getElementById('view');
    return { flex: window.__S.draft.slotFlex, heure: !!v.querySelector('[data-cfhour]'),
      on: Array.from(v.querySelectorAll('[data-slotflex].on')).map((x) => x.dataset.slotflex).join(',') };
  });
  ok(avant === false && apres.heure, 'le sélecteur d’heure revient au toucher de « Précise »');
  ok(!apres.flex && apres.on === '0', 'et c’est « Précise » qui est allumée');

  /* D — LE GARDE-FOU, LÀ OÙ IL PEUT RÉELLEMENT SE DÉCLENCHER. `recalerCreneau` retire la
     souplesse large dès que le métier ne l'admet pas — ici parce que le client SE DÉPLACE
     chez le prestataire, et qu'il lui faut alors une heure, pas une fenêtre que l'autre
     choisit.

     AUCUN DES TROIS MÉTIERS À DÉFAUT SOUPLE NE PEUT LE DÉCLENCHER : un ménage, un jardin,
     une piscine n'ont pas de salon, et ne se comptent pas en jours. L'éprouver sur eux
     ne prouverait rien — on le pose donc sur un massage, qui a les deux lieux. */
  console.log('D — le client se déplace : la souplesse large se retire');
  const d = await p.evaluate(() => {
    const S = window.__S;
    S.draft = window.__newMission(window.__svc.trouve('massage'));
    S.draft.slotFlex = 'day';
    S.draft.locationMode = 'salon';
    S.view = 'config'; window.__render();
    const v = document.getElementById('view');
    return { flex: S.draft.slotFlex, heure: !!v.querySelector('[data-cfhour]'),
      journee: !!v.querySelector('[data-slotflex="day"]') };
  });
  ok(!d.flex, 'chez le prestataire, le créneau redevient précis (' + JSON.stringify(d.flex) + ')');
  ok(d.heure, 'et le sélecteur d’heure est rendu au client');
  ok(!d.journee, 'le bouton « Journée » n’est même plus proposé');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
