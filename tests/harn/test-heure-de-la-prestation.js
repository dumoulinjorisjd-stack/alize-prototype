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
    faux: window.__heures.net('25:00, 10:70, midi'),
    francais: window.__heures.net('9h, 9h30, 09h00, 9'),
    avisOk: window.__heures.avis('9h, 13h30'),
    avisKo: window.__heures.avis('vers midi'),
    avisVide: window.__heures.avis(''),
    vide: window.__heures.net(''),
    trop: window.__heures.net('01:00,02:00,03:00,04:00,05:00,06:00,07:00,08:00,09:00,10:00,11:00,12:00,13:00,14:00').length,
  }));
  ok(A.simple.join() === '09:00' && A.deux.join() === '09:00,13:30', 'une ou plusieurs heures se saisissent');
  ok(A.desordre.join() === '09:00,13:30', 'l’ordre de saisie ne compte pas, la liste est triée');
  ok(A.double.join() === '09:00', 'et la même heure deux fois n’en fait qu’une');
  ok(A.zero.join() === '09:00', '« 9:00 » est complété en « 09:00 », pas refusé');
  ok(A.faux.length === 0, 'une heure impossible n’est pas devinée : « 25:00 », « 10:70 », « midi » ne donnent rien');
  // Le défaut relevé en production : « 9h », « 9h00 », « 9 » étaient JETÉS EN SILENCE.
  ok(A.francais.join() === '09:00,09:30', 'une heure écrite comme on l’écrit en français est comprise : ' + A.francais.join(', '));
  ok(/Départs retenus/.test(A.avisOk.txt) && /09:00/.test(A.avisOk.txt), 'et la console DIT ce qu’elle a compris : ' + A.avisOk.txt);
  ok(A.avisKo.cls === 'ko' && /Aucune heure comprise/.test(A.avisKo.txt), 'une saisie illisible ne part plus en silence : ' + A.avisKo.txt);
  ok(A.avisVide.txt === '', 'et ne rien déclarer ne reproche rien : c’est le cas ordinaire');
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

  console.log('F — la durée : l’agenda du prestataire, et le retour annoncé au client');
  const G = await p.evaluate(() => ({
    nulle: window.__heures.duree({ nm: 'sans durée' }),
    huit: window.__heures.duree({ d: 8 }),
    abimee: [window.__heures.duree({ d: 0 }), window.__heures.duree({ d: -3 }), window.__heures.duree({ d: 99 }), window.__heures.duree({ d: 'longue' })],
    fin: window.__heures.fin('09:00', 8),
    minuit: window.__heures.fin('20:00', 8),
    sans: window.__heures.fin('09:00', 0),
  }));
  ok(G.nulle === 0 && G.huit === 8, 'une prestation déclare sa durée, ou ne la déclare pas');
  ok(G.abimee.join() === '0,0,0,0', 'une durée abîmée ne devient pas une plage d’agenda : ' + G.abimee.join(', '));
  ok(G.fin === '17:00', 'le client sait quand il rentre : 09:00 + 8 h = ' + G.fin);
  ok(/lendemain/.test(G.minuit), 'et un retour après minuit le DIT, au lieu d’afficher une heure plus petite que le départ : ' + G.minuit);
  ok(G.sans === '', 'sans durée déclarée, on n’annonce aucun retour : on ne l’invente pas');
  ok(/function dureeMission\(m\)\{return dureeDuDraft\(m\)\|\|billHours\(m\);\}/.test(html),
    'l’AGENDA lit la durée réelle, pas `billHours` qui sert à FACTURER : deux questions, deux fonctions, l’argent ne bouge pas');
  ok(/hours:dureeMission\(m\)/.test(html),
    'la vérification des disponibilités du prestataire bloque donc la vraie plage (une journée en mer ne bloquait qu’une heure)');
  ok(/if\(dureeDeLActe\(a\)\)o\.d=dureeDeLActe\(a\)/.test(html), 'et la refonte du catalogue ne perd pas la durée non plus');

  console.log('G — un départ fixe n’a aucune souplesse');
  const H = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    S.customServices = [sv]; S.adminCatalog = actes; S.adminMetier = { c_catamaran: { exclusif: true } };
    const avec = (id) => {
      S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
      window.__render();
      const el = document.querySelector('[data-actpick="' + id + '"]'); if (el) el.click();
      return { souplesse: !!document.querySelector('[data-slotflex]'), txt: document.getElementById('view').innerText };
    };
    return { fixe: avec('a2'), libre: avec('a3') };
  }, [BATEAU, ACTES]);
  ok(H.fixe.souplesse === false, '« ± 1 h » sur une sortie qui part à 9 h ne veut rien dire : la question disparaît');
  ok(!/Souplesse sur le créneau/.test(H.fixe.txt), 'et son intitulé avec elle');
  ok(H.libre.souplesse === true, 'une prestation sans départ fixe garde sa souplesse : rien ne change pour les métiers d’aujourd’hui');

    ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
