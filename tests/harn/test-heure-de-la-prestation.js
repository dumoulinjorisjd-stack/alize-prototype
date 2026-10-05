/* « La date de l'heure souhaitée pour cette catégorie doit être en fonction du produit
   choisi. On ne peut pas réserver une journée entière pour aujourd'hui alors qu'il est
   déjà 14 h 00. »

   L'écran proposait TOUTES les demi-heures de 00:00 à 23:30, quelle que soit la formule.
   Une journée complète en mer part le matin ; la proposer à 14 h, ou à 23 h 30, c'est
   laisser commander quelque chose qui ne peut pas avoir lieu — et c'est le prestataire
   qui devra le dire au client.

   CHAQUE PRESTATION PORTE SES HEURES DE DÉPART, liste fermée saisie dans la console. Une
   prestation qui n'en déclare aucune ne change rien. ET UN JOUR SANS HEURE TENABLE N'EST
   PLUS OFFERT, ce qui se DIT. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

const BATEAU = { id: 'c_catamaran', nm: 'Location catamaran', rate: 0, custom: true, ico: 'bateau', choixPro: false, cat: '', lieu: 'depart' };
// « Journée complète » ne part qu'à 09:00 ; la demie journée part l'après-midi.
const ACTES = { c_catamaran: [
  { id: 'a1', nm: 'Demie journée avec sunset', price: 990, h: '13:30' },
  { id: 'a2', nm: 'Journée complète avec sunset', price: 1490, h: '09:00' },
  { id: 'a3', nm: 'Transfert', price: 150 }] };

(async () => {
  const b = await chromium.launch(o);
  // L'horloge du navigateur est posée à 14 h 00, l'heure exacte de la capture.
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__heures, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — ce qu’on accepte comme heure, et ce qu’on refuse');
  const A = await p.evaluate(() => ({
    simple: window.__heures.net('09:00'),
    deux: window.__heures.net('09:00, 13:30'),
    desordre: window.__heures.net('13:30 ; 09:00'),
    double: window.__heures.net('09:00, 09:00'),
    zero: window.__heures.net('9:00'),
    faux: window.__heures.net('25:00, 10:70, midi, 9h'),
    vide: window.__heures.net(''),
    trop: window.__heures.net('01:00,02:00,03:00,04:00,05:00,06:00,07:00,08:00,09:00,10:00,11:00,12:00,13:00,14:00').length,
  }));
  ok(A.simple.join() === '09:00' && A.deux.join() === '09:00,13:30', 'une ou plusieurs heures se saisissent');
  ok(A.desordre.join() === '09:00,13:30', 'l’ordre de saisie ne compte pas, la liste est triée');
  ok(A.double.join() === '09:00', 'et la même heure deux fois n’en fait qu’une');
  ok(A.zero.join() === '09:00', '« 9:00 » est complété en « 09:00 », pas refusé');
  ok(A.faux.length === 0, 'une heure impossible n’est pas devinée : « 25:00 », « 10:70 », « midi », « 9h » ne donnent rien');
  ok(A.vide.length === 0, 'et vide ne déclare rien');
  ok(A.trop === 12, 'la liste est bornée (' + A.trop + ')');

  console.log('B — les heures communes à ce qui est coché');
  const B = await p.evaluate(() => ({
    une: window.__heures.communes([{ h: '09:00, 13:30' }]),
    aucune: window.__heures.communes([{ nm: 'sans heures' }]),
    muette: window.__heures.communes([{ h: '09:00' }, { nm: 'sans heures' }]),
    deux: window.__heures.communes([{ h: '09:00, 13:30' }, { h: '13:30, 17:00' }]),
    conflit: window.__heures.communes([{ h: '09:00' }, { h: '13:30' }]),
    rien: window.__heures.communes([]),
  }));
  ok(B.une.declare === true && B.une.heures.join() === '09:00,13:30', 'une prestation qui déclare impose ses heures');
  ok(B.aucune.declare === false, 'une prestation qui ne déclare rien n’impose rien');
  ok(B.muette.heures.join() === '09:00', 'et elle ne retire rien à celle qui déclare');
  ok(B.deux.heures.join() === '13:30', 'deux prestations : on garde l’heure COMMUNE');
  ok(B.conflit.declare === true && B.conflit.heures.length === 0, 'deux départs incompatibles n’ont aucune heure commune, et c’est dit plutôt que masqué');
  ok(B.rien.declare === false, 'rien de coché ne déclare rien');

  console.log('C — l’écran de commande, à 14 h 00');
  const C = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'client'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Client', email: 'c@x.fr' }; S.addresses = []; S.availableServices = null;
    S.customServices = [sv]; S.adminCatalog = actes; S.adminMetier = { c_catamaran: { exclusif: true } };
    const choisir = (id) => {
      S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
      const el0 = document.querySelector('[data-actpick="' + id + '"]');
      window.__render();
      const el = document.querySelector('[data-actpick="' + id + '"]'); if (el) el.click();
      const sel = document.querySelector('[data-cfhour]');
      return { heures: sel ? [...sel.options].map((o) => o.value) : [], slot: S.draft.slot,
        jour: S.draft.dateISO, txt: document.getElementById('view').innerText };
    };
    return { journee: choisir('a2'), demi: choisir('a1'), libre: choisir('a3') };
  }, [BATEAU, ACTES]);
  ok(C.journee.heures.join() === '09:00', 'la journée complète ne propose QUE son heure de départ : ' + C.journee.heures.join(', '));
  ok(C.demi.heures.join() === '13:30', 'la demie journée propose la sienne : ' + C.demi.heures.join(', '));
  ok(C.libre.heures.length > 40, 'et une prestation sans heures déclarées garde la grille des demi-heures (' + C.libre.heures.length + ' créneaux)');
  ok(C.journee.slot === '09:00' && C.demi.slot === '13:30', 'le créneau de la commande suit la formule choisie, il ne reste pas sur 14:00');

  console.log('D — un jour sans départ possible n’est plus offert, et on dit pourquoi');
  const D = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    S.customServices = [sv]; S.adminCatalog = actes; S.adminMetier = { c_catamaran: { exclusif: true } };
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
    S.draft.acts = [{ id: 'a2', nm: 'Journée complète', price: 1490, qty: 1 }];
    window.__render();
    const sel = document.querySelector('[data-cfday]');
    const jours = sel && sel.tagName === 'SELECT' ? [...sel.options].map((o) => o.value) : [];
    const h = new Date().getHours(), passe = h >= 9;
    return { jours: jours, auj: iso(auj), passe: passe, txt: document.getElementById('view').innerText,
      tenableAuj: window.__heures.tenables(S.draft, iso(auj)).length };
  }, [BATEAU, ACTES]);
  if (D.passe) {
    ok(D.tenableAuj === 0, 'après 09:00, aucune heure ne tient plus aujourd’hui pour la journée complète');
    ok(D.jours.indexOf(D.auj) < 0, 'aujourd’hui disparaît donc de la liste des jours');
    ok(/Plus de départ possible aujourd’hui/.test(D.txt), 'et l’écran DIT pourquoi, au lieu de laisser un jour manquer sans explication');
  } else {
    ok(D.tenableAuj === 1, 'avant 09:00, le départ du jour tient encore');
    ok(D.jours.indexOf(D.auj) >= 0, 'et aujourd’hui reste proposé');
  }

  console.log('E — la console saisit les heures, et le catalogue ne les perd pas');
  ok(/data-acthours="/.test(html), 'chaque prestation a son champ « Heures de départ »');
  ok(/const ah=e\.target\.closest\('\[data-acthours\]'\)/.test(html), 'et ce qui est tapé est enregistré NETTOYÉ');
  ok(/if\(heuresDeLActe\(a\)\.length\)o\.h=/.test(html),
    'la refonte du catalogue (ajout d’une prestation au métier) ne les efface pas : la liste fermée les porte');
  ok(/\[data-acthours\],\[data-actpricev\]/.test(html), 'et le champ ne se redessine pas sous les doigts pendant la frappe');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
