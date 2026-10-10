/* « IL FAUT UN PANNEAU POUR LES COMMANDES EXPIRÉES AVEC LA POSSIBILITÉ DE COMMANDER À
   L'IDENTIQUE MAIS EN POUVANT MODIFIER LES INFORMATIONS, C'EST JUSTE PRÉ-REMPLI À
   L'IDENTIQUE. » — l'éditeur, le 16/10/2026.

   AVANT, ELLES DISPARAISSAIENT SANS TRACE. `loadActiveRequests` ne recharge que les
   statuts vivants et la purge locale retirait le reste : le client n'avait aucun moyen de
   retrouver ce qu'il avait demandé, ni de le redemander autrement qu'en refaisant tout de
   mémoire.

   CE QUE CETTE ÉPREUVE TIENT :
   • seules les EXPIRÉES sont reproposées (une annulée l'a été exprès) ;
   • bornées dans le temps et en nombre, la plus récente d'abord ;
   • un métier fermé depuis est MONTRÉ et DIT, jamais un bouton qui échoue ;
   • le brouillon passe par `renewMission`, la porte qui existait, et celle-ci reprend
     désormais le TARIF DU JOUR (elle recopiait celui d'avant, écrit tel quel sur la
     nouvelle demande et envoyé au serveur) et les ACTES CHOISIS (perdus jusqu'ici) ;
   • le coup de pouce ne suit pas, et la demande ne repart pas dirigée ;
   • l'adresse exacte est relue dans le sous-document privé, et son absence n'écrase rien. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const J = 86400000;

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__repr);

  /* ── A. LE NOYAU ──────────────────────────────────────────────────────────────── */
  console.log('A — ce qui mérite d’être reproposé');
  const noy = await p.evaluate(({ J }) => {
    const T = 1760000000000;
    const base = { id: 'r1', status: 'expired', service: 'menage', serviceName: 'Ménage',
      when: 'Hier', dateISO: '2026-10-09', slot: '09:00', total: 70, fin: T - 2 * J };
    const L = window.__repr.lue, LI = window.__repr.liste;
    const mk = (i, fin, st) => ({ id: 'r' + i, status: st || 'expired', service: 'menage',
      serviceName: 'Ménage', total: 70, fin: fin });
    const beaucoup = []; for (let i = 1; i <= 9; i++) beaucoup.push(mk(i, T - i * J));
    return {
      bon: L(base, T),
      annulee: L(Object.assign({}, base, { status: 'cancelled' }), T),
      enCours: L(Object.assign({}, base, { status: 'pending' }), T),
      payee: L(Object.assign({}, base, { status: 'paid' }), T),
      sansFin: L(Object.assign({}, base, { fin: 0 }), T),
      vieille: L(Object.assign({}, base, { fin: T - 120 * J }), T),
      limite: L(Object.assign({}, base, { fin: T - 89 * J }), T),
      future: L(Object.assign({}, base, { fin: T + J }), T),
      sansService: L(Object.assign({}, base, { service: '' }), T),
      nomLong: L(Object.assign({}, base, { serviceName: 'x'.repeat(300) }), T),
      enTrop: L(Object.assign({}, base, { clientUid: 'secret', molliePaymentId: 'tr_x' }), T),
      ordre: LI([mk(1, T - 5 * J), mk(2, T - J), mk(3, T - 3 * J)], T, null).map((x) => x.id),
      borne: LI(beaucoup, T, null).length, max: window.__repr.max(), jours: window.__repr.jours(),
      ferme: LI([mk(1, T - J)], T, function (id) { return id !== 'menage'; })[0],
    };
  }, { J });
  ok(!!noy.bon && noy.bon.svc === 'menage' && noy.bon.total === 70, 'une commande expirée récente est reproposable');
  ok(noy.annulee === null,
    'une ANNULÉE ne l’est pas : elle l’a été exprès, la reproposer d’office serait présomptueux');
  ok(noy.enCours === null && noy.payee === null, 'ni une demande en recherche, ni une prestation réglée');
  ok(noy.sansFin === null, 'sans date de fin, on ne sait pas si c’est vieux et l’on ne devine pas');
  ok(noy.vieille === null && noy.limite !== null,
    'au-delà de ' + noy.jours + ' jours on ne la propose plus : ni le besoin ni le tarif ne sont les mêmes');
  ok(noy.future === null, 'et une fin dans le futur n’est pas une commande passée');
  ok(noy.sansService === null, 'sans métier, rien');
  ok(noy.nomLong.svcName.length === 60, 'le nom du métier est borné (' + noy.nomLong.svcName.length + ')');
  ok(!('clientUid' in noy.enTrop) && !('molliePaymentId' in noy.enTrop),
    'et la projection est FERMÉE : ni identifiant de compte, ni identifiant de paiement (' + Object.keys(noy.enTrop).join(', ') + ')');
  ok(noy.ordre.join(',') === 'r2,r3,r1', 'la plus récente d’abord (' + noy.ordre.join(',') + ')');
  ok(noy.borne === noy.max, 'et le panneau est borné à ' + noy.max + ' : un panneau qui garde tout n’est plus un panneau');
  ok(!!noy.ferme && noy.ferme.ouvert === false,
    'un métier fermé depuis est MONTRÉ et marqué fermé, plutôt que d’offrir un bouton qui échouera');

  /* ── B. LA PORTE QUI EXISTAIT, ET CE QU'ELLE RECOPIAIT DE TRAVERS ─────────────── */
  console.log('B — renewMission : le tarif du jour, et ce qui avait été choisi');
  const ren = await p.evaluate(() => {
    const S = window.__S;
    S.adminPrices = { menage: 35, coiffure: 40 };
    S.addresses = []; S.addrDefault = null;
    window.__repr.renouvelle({ svc: 'menage', svcName: 'Ménage', rate: 19, duration: 4, unit: 'h',
      slot: '09:00', slotFlex: 0, boost: 25, zone: 'Lorient', address: 'Rue X', addressId: '__manual',
      geo: { lat: 1, lng: 2 }, access: 'Portail bleu', notes: 'Deux chats',
      acts: [{ id: 'a1', nm: 'Coupe', price: 30, qty: 1 }],
      options: [{ id: 'o1', nm: 'Repassage', price: 10 }], people: 3, locationMode: 'domicile' });
    const d = S.draft || {};
    return { rate: d.rate, duration: d.duration, zone: d.zone, access: d.access, notes: d.notes,
      acts: (d.acts || []).length, options: (d.options || []).length, people: d.people,
      dateISO: d.dateISO, when: d.when, boost: d.boost, status: d.status };
  });
  ok(ren.rate === 35,
    'LE TARIF EST CELUI DU CATALOGUE (35 €), pas celui de la commande d’origine (19 €) : ce nombre part au serveur, qui s’en sert');
  ok(ren.acts === 1 && ren.options === 1,
    'les actes et les options choisis reviennent : « à l’identique » rendait une commande vide de son contenu');
  ok(ren.duration === 4 && ren.zone === 'Lorient' && ren.access === 'Portail bleu' && ren.notes === 'Deux chats' && ren.people === 3,
    'durée, zone, consignes d’accès, notes et nombre de personnes sont repris');
  /* LA DATE N'EST PAS « VIDE » À L'ARRIVÉE, ET C'EST VOULU : `renewMission` la vide, puis
     `renderConfig` appelle `recalerCreneau`, qui pose le premier créneau tenable. La
     propriété qui compte n'est donc pas la vacuité mais qu'elle ne soit JAMAIS PASSÉE. */
  ok(ren.when === 'Aujourd’hui' || /^\d{4}-\d{2}-\d{2}$/.test(ren.dateISO), 'la date est repartie du présent');
  ok(ren.dateISO === '' || ren.dateISO >= new Date().toISOString().slice(0, 10),
    'et jamais une date passée (' + (ren.dateISO || 'vide') + ')');
  ok(ren.status === 'draft', 'c’est un BROUILLON : rien n’est envoyé, rien n’est payé');

  /* ── C. LE PANNEAU ────────────────────────────────────────────────────────────── */
  console.log('C — le panneau sur l’écran des réservations');
  const ecran = (expirees) => p.evaluate(({ expirees }) => {
    const S = window.__S;
    window.__setFB({ auth: { currentUser: { uid: 'cli1', email: 'c@x.c' } }, db: {},
      f: { doc: function () { return { _p: Array.prototype.slice.call(arguments, 1) }; },
        collection: function () { return {}; }, onSnapshot: function () { return function () {}; },
        updateDoc: function () { return Promise.resolve(); }, setDoc: function () { return Promise.resolve(); },
        getDoc: function (ref) {
          return Promise.resolve({ exists: function () { return true; },
            data: function () { return { address: '12 rue des Flamboyants', zone: 'Lorient',
              geo: { lat: 17.9, lng: -62.8 }, access: 'Portail bleu, chien gentil' }; } });
        } },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'wallet'; S.mission = null; S.draft = null;
    S.account = { name: 'Camille', email: 'c@x.c', uid: 'cli1', role: 'client' };
    S.adminPrices = { menage: 35 }; S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    S.missions = []; S.history = []; S.recurring = [];
    S.expirees = expirees; S._expireesBrut = {};
    (expirees || []).forEach(function (x) {
      S._expireesBrut[x.id] = { id: x.id, status: 'expired', service: x.svc, serviceName: x.svcName,
        duration: 4, unit: 'h', slot: '09:00', slotFlex: 0, boost: 30, boostEur: 40,
        zone: 'Gustavia', notes: 'Deux chats', people: 2, locationMode: 'domicile',
        preferredProviderUid: 'proX', preferredProviderName: 'Laure', directed: true,
        acts: [{ id: 'a1', nm: 'Coupe', price: 30, qty: 1 }] };
    });
    window.__render();
    const view = document.getElementById('view');
    return { txt: (view.textContent || '').replace(/\s+/g, ' '),
      boutons: view.querySelectorAll('[data-act^="reprendre:"]').length,
      enCours: /En cours ·/.test(view.textContent || '') };
  }, { expirees });

  const vide = await ecran([]);
  ok(!/Sans suite/.test(vide.txt), 'sans commande expirée, aucun panneau');

  const T = Date.now();
  const un = await ecran([{ id: 'r1', svc: 'menage', svcName: 'Ménage', when: 'Vendredi 9 octobre',
    dateISO: '2026-10-09', slot: '09:00', total: 140, fin: T - 2 * J, age: 2, ouvert: true }]);
  ok(/Sans suite · 1/.test(un.txt), 'avec une expirée, le panneau paraît et se compte');
  ok(/Ménage/.test(un.txt) && /Vendredi 9 octobre · 09:00/.test(un.txt), 'il nomme le métier et le créneau demandé');
  ok(/Personne n’a accepté à temps/.test(un.txt) && /Rien ne vous a été prélevé/.test(un.txt),
    'il dit pourquoi, et lève l’inquiétude');
  ok(un.boutons === 1 && /Commander à nouveau/.test(un.txt), 'et il porte le seul geste qui a du sens après');
  ok(!un.enCours, 'les expirées ne rejoignent PAS « En cours » : elles compteraient parmi les réservations vivantes');
  ok(!/Aucune prestation pour l’instant/.test(un.txt),
    'et l’écran ne se dit plus vide alors qu’il porte quelque chose (relevé sur la capture, pas à la relecture)');
  ok(/Aucune prestation pour l’instant/.test(vide.txt),
    'le carton de vide reste quand l’écran est VRAIMENT vide (sans ce repère, la mesure du dessus passerait en supprimant le carton)');

  const ferme = await ecran([{ id: 'r2', svc: 'menage', svcName: 'Ménage', when: 'Hier', dateISO: '2026-10-09',
    slot: '', total: 70, fin: T - J, age: 1, ouvert: false }]);
  ok(ferme.boutons === 0 && /n’est plus proposé pour le moment/.test(ferme.txt),
    'un métier fermé n’a pas de bouton, et l’écran DIT pourquoi');

  /* ── D. REPRENDRE POUR DE VRAI ────────────────────────────────────────────────── */
  console.log('D — le clic rouvre la commande, pré-remplie et modifiable');
  await ecran([{ id: 'r1', svc: 'menage', svcName: 'Ménage', when: 'Vendredi 9 octobre',
    dateISO: '2026-10-09', slot: '09:00', total: 140, fin: T - 2 * J, age: 2, ouvert: true }]);
  await p.evaluate(() => document.querySelector('[data-act^="reprendre:"]').click());
  await p.waitForFunction(() => !!window.__S.draft, { timeout: 4000 }).catch(() => {});
  const rep = await p.evaluate(() => {
    const d = window.__S.draft || {};
    return { svc: d.svc, duration: d.duration, unit: d.unit, zone: d.zone, notes: d.notes,
      people: d.people, acts: (d.acts || []).length, rate: d.rate,
      address: d.address, access: d.access, geo: !!d.geo,
      boost: d.boost, boostEur: d.boostEur || 0,
      preferredUid: d.preferredUid || null, directed: !!d.directed,
      dateISO: d.dateISO, status: d.status };
  });
  ok(rep.svc === 'menage' && rep.duration === 4 && rep.unit === 'h' && rep.notes === 'Deux chats' && rep.people === 2,
    'la commande revient à l’identique : métier, durée, unité, notes, nombre de personnes');
  ok(rep.acts === 1, 'avec ce qui avait été choisi au catalogue');
  ok(rep.address === '12 rue des Flamboyants' && rep.access === 'Portail bleu, chien gentil' && rep.geo,
    'et l’ADRESSE EXACTE, relue dans le sous-document privé : sans elle, « à l’identique » rendait l’adresse par défaut du compte');
  ok(rep.rate === 35, 'au tarif du jour');
  ok(rep.boost === 0 && rep.boostEur === 0,
    'LE COUP DE POUCE NE SUIT PAS : c’était un levier de désespoir sur la commande qui n’a pas trouvé preneur, le recopier augmenterait le prix sans que personne ne l’ait demandé');
  ok(!rep.preferredUid && !rep.directed,
    'ET ELLE NE REPART PAS DIRIGÉE : readresser au prestataire qui n’a jamais répondu la ferait expirer une seconde fois');
  ok((rep.dateISO === '' || rep.dateISO >= new Date().toISOString().slice(0, 10)) && rep.status === 'draft',
    'jamais une date passée, et un simple brouillon : l’écran de commande ordinaire s’ouvre, tout reste modifiable, rien n’est envoyé');

  /* L'ADRESSE QUI NE SE LIT PAS N'ÉCRASE RIEN : on ne pose que ce qu'on a eu. */
  const sansDet = await p.evaluate(() => {
    const S = window.__S;
    S.draft = null;
    S.addresses = [{ id: 'ad1', label: 'Maison', address: 'Mon adresse par défaut', zone: 'Gustavia', geo: null, access: '' }];
    S.addrDefault = 'ad1';
    window.__setFB({ auth: { currentUser: { uid: 'cli1', email: 'c@x.c' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: () => Promise.resolve(),
        setDoc: () => Promise.resolve(), getDoc: function () { return Promise.reject(new Error('refus')); } },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    return window.__repr.reprendre({ id: 'r1', svc: 'menage', svcName: 'Ménage' })
      .then(function () { const d = window.__S.draft || {}; return { address: d.address, svc: d.svc }; });
  });
  ok(sansDet.svc === 'menage' && sansDet.address === 'Mon adresse par défaut',
    'si le sous-document privé ne se lit pas, tout le reste est repris et l’adresse du compte reste en place (elle n’est pas vidée)');

  ok(errs.length === 0, 'aucune erreur JS sur ces écrans' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
