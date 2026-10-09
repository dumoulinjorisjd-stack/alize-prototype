/* « UNE FOIS QUE L'ON A DÉMARRÉ LA PRESTATION, L'ÉCRAN POUR DIRE QUE L'ON A TERMINÉ DOIT
   ÊTRE PLUS LÉGER, PAS BESOIN DE REVOIR TOUTES LES INFORMATIONS. »

   Le même écran sert avant et pendant : il porte tout ce qu'il faut pour ARRIVER (le
   plan, l'itinéraire, « Ajouter à mon agenda ») puis, une fois sur place, il n'y a plus
   qu'UN geste — dire que c'est fini. Garder ces blocs, c'est faire défiler un plan du
   quartier pour atteindre le bouton.

   CE QU'ON NE RETIRE PAS : le recours. « Un problème ? Contacter Ti-Services » était
   encadré sur la capture avec l'agenda, mais c'est PENDANT la prestation qu'un problème
   survient. Ce n'est pas une information à relire, c'est une porte de sortie. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  const ecran = (statut) => p.evaluate((statut) => {
    window.__setFB({ auth: { currentUser: { uid: 'pro1', email: 'p@x.c' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), collection: () => ({}), onSnapshot: () => (() => {}) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = 'Laure M.';
    S.account = { name: 'Laure M.', email: 'p@x.c', uid: 'pro1', role: 'artisan' };
    S.proReqView = null; S.finishing = false;
    const base = window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 });
    const m = Object.assign(base, { reqId: 'r1', _id: 'mr1', status: statut, svc: 'menage',
      svcName: 'Ménage', when: 'Aujourd’hui', slot: '09:00', duration: 2, zone: 'Lorient',
      address: '12 rue des Dinzey, Gustavia', geo: { lat: 17.89536, lng: -62.8484 },
      access: 'Portail code 1234', clientName: 'Joris', clientPhone: '',
      chat: [], support: { client: [], pro: [] } });
    S.proMissions = [m]; S.mission = m;
    window.__render();
    const v = document.getElementById('view');
    return { txt: (v.textContent || '').replace(/\s+/g, ' '),
      /* `scrollHeight` de la vue ne dit rien : elle porte une hauteur MINIMALE d'écran.
         Ce qu'on mesure est le CONTENU — du haut de la colonne au bas du dernier bloc. */
      hauteur: (function () { const pad = v.querySelector('.pad'); return pad ? Math.round(pad.getBoundingClientRect().height) : v.scrollHeight; })(),
      carte: !!v.querySelector('svg.minimap, .minimap, [data-minimap]'),
      navig: /Lancer la navigation/.test(v.textContent || ''),
      agenda: !!v.querySelector('[data-act="mission-ics"]'),
      support: /Contacter Ti-Services/.test(v.textContent || ''),
      bouton: (function () { const x = v.querySelector('.footcta .btn.primary'); return x ? (x.textContent || '').trim() : ''; })(),
      yBouton: (function () { const x = v.querySelector('.footcta .btn.primary'); return x ? Math.round(x.getBoundingClientRect().top + window.scrollY) : -1; })() };
  }, statut);

  console.log('A — avant le départ : tout ce qu’il faut pour arriver');
  const avant = await ecran('accepted');
  ok(avant.navig, 'l’itinéraire est là');
  ok(avant.agenda, '« Ajouter à mon agenda externe » aussi');
  ok(/Démarrer la prestation/.test(avant.bouton), 'et le bouton démarre la prestation');

  console.log('B — une fois démarrée : il ne reste que le geste à faire');
  const pendant = await ecran('working');
  ok(!pendant.navig, 'plus d’itinéraire : on y est (' + (pendant.navig ? 'encore là' : 'retiré') + ')');
  ok(!pendant.agenda, 'plus d’agenda : on y est aussi');
  ok(/terminé la prestation/.test(pendant.bouton), 'le bouton dit qu’on a terminé');

  console.log('C — ce qu’on ne retire PAS');
  ok(pendant.support,
    'le recours reste : c’est PENDANT la prestation qu’un problème survient');
  ok(/Joris/.test(pendant.txt), 'le client reste nommé');
  ok(/Dinzey/.test(pendant.txt), 'et l’adresse reste lisible, elle ne pousse rien vers le bas');
  ok(/Portail code 1234/.test(pendant.txt), 'les infos d’accès restent : on peut ressortir');
  ok(/déjà sécurisé/.test(pendant.txt), 'et la phrase qui rassure sur le paiement');

  console.log('D — et l’écran raccourcit vraiment');
  const gain = avant.hauteur - pendant.hauteur;
  ok(gain > 300, 'le contenu perd ' + gain + ' px (' + avant.hauteur + ' → ' + pendant.hauteur + ')');
  ok(pendant.yBouton > 0 && pendant.yBouton < avant.yBouton,
    'le bouton remonte de ' + (avant.yBouton - pendant.yBouton) + ' px');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
