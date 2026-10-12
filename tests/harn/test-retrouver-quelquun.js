/* « IL N'APPARAÎT PAS, ÇA ME DONNE L'IMPRESSION DE RÊVER QU'IL AIT EXISTÉ. »
   — l'éditeur, le 12/10/2026, après trois corrections de la carte des départs.

   LE PROBLÈME N'ÉTAIT PLUS UNE CARTE, C'EST QU'IL N'Y AVAIT PAS D'ENDROIT OÙ DEMANDER.
   Ce qu'un compte laisse est éparpillé par nature : sa fiche s'il est encore là, le
   journal des départs s'il est parti après la mise en service de celui-ci, ses
   PRESTATIONS qui portent son nom et son SIRET figés et ne partent jamais, et ses
   conversations archivées. Chacune a sa carte, aucune ne répond à « cette personne
   a-t-elle existé ».

   ET « RIEN, NULLE PART » EST UNE RÉPONSE — c'est même celle qu'on vient chercher. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__cmd && window.__cmd.cherche);

  console.log('A — le noyau : on cherche comme on se souvient');
  const noy = await p.evaluate(() => {
    const C = window.__cmd.cherche;
    const src = {
      /* L'E-MAIL NE DOIT PAS SAUVER L'ASSERTION. Il valait « aurelie@… », sans accent :
         chercher « aurelie » tombait dessus même sans normaliser le nom, et la mesure
         des accents passait au vert avec le correctif RETIRÉ. Le courriel ne porte donc
         plus le prénom. */
      artisans: [{ uid: 'a1', name: 'Aurélie Mercier', email: 'contact@exemple.fr', siret: '81234567800019' }],
      clients: [{ uid: 'c1', name: 'Camille Durand', email: 'camille@exemple.fr', phone: '0690112233' }],
      departs: [{ uid: 'p9', nom: 'Laure Mouchot', email: 'laure@exemple.fr', role: 'artisan' }],
      demandes: [{ id: 'r1', svcName: 'Ménage', client: 'Camille Durand', provider: 'Laure Mouchot',
        providerUid: 'p9', uid: 'c1', when: 'Hier', status: 'paid' }],
      archives: [{ uid: 'p9', nom: 'Laure Mouchot', email: 'laure@exemple.fr', support: [{ text: 'x' }, { text: 'y' }] }],
    };
    const fam = (r) => (r && r.familles || []).map((x) => x.cle).join(',');
    return {
      court: C('a', src),
      vide: C('', src),
      accents: fam(C('aurelie', src)),
      casse: fam(C('AURÉLIE', src)),
      siret: fam(C('81234567800019', src)),
      partie: fam(C('laure', src)),
      deuxMots: fam(C('laure menage', src)),
      motsOrdre: fam(C('menage laure', src)),
      inconnu: C('zzzz introuvable', src),
      totalLaure: (C('laure', src) || {}).total,
    };
  });
  ok(noy.court === null && noy.vide === null,
    'moins de deux caractères : on n’a pas cherché, et ce n’est pas « rien trouvé » — une lettre rapporterait tout le parc');
  ok(noy.accents === 'artisan' && noy.casse === 'artisan',
    'accents et casse ne comptent pas : « aurelie » trouve « Aurélie Mercier », dont le courriel ne porte pas le prénom');
  ok(noy.siret === 'artisan', 'un SIRET retrouve sa fiche');
  ok(noy.partie === 'depart,prestation,archive',
    'une personne PARTIE se retrouve dans les trois endroits qui la gardent (' + noy.partie + ')');
  ok(noy.totalLaure === 3, 'et le compte des résultats est juste (' + noy.totalLaure + ')');
  ok(noy.deuxMots === 'prestation' && noy.motsOrdre === 'prestation',
    'chaque MOT doit tomber, dans n’importe quel ordre : « laure menage » trouve sa prestation de ménage');
  ok(noy.inconnu && noy.inconnu.total === 0 && (noy.inconnu.familles || []).length === 0,
    'et un nom inconnu rend un résultat VIDE, pas `null` : « rien, nulle part » est une réponse, « je n’ai pas cherché » en est une autre');

  console.log('B — l’écran, et la réponse qu’on vient chercher');
  const ecran = (q, src) => p.evaluate(({ q, src }) => {
    const S = window.__S;
    window.__setFB({ auth: { currentUser: { uid: 'adm', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: function () { return Promise.resolve(); },
        setDoc: function () { return Promise.resolve(); },
        getDoc: function () { return Promise.resolve({ exists: function () { return false; }, data: function () { return {}; } }); } },
      fn: { httpsCallable: function () { return function () { return new Promise(function () {}); }; } }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'admin'; S.admin = { view: 'home' };
    S.account = { name: 'CCS', email: 'ccs.dumoulin@gmail.com', uid: 'adm', role: 'admin' };
    S.adminArtsLoaded = true; S.adminClisLoaded = true; S.adminReqsLus = true;
    S.adminArtisans = src.artisans; S.adminClients = src.clients;
    S.adminDeparts = src.departs; S.adminReqs = src.demandes; S.adminGeneralArchive = src.archives;
    S.adminGeneral = []; S.adminThreads = []; S.admRech = q;
    window.__render();
    const v = document.getElementById('view');
    const c = Array.prototype.slice.call(v.querySelectorAll('.card'))
      .find(function (x) { return /Retrouver quelqu/.test(x.textContent || ''); });
    return { txt: c ? (c.textContent || '').replace(/\s+/g, ' ') : '(absente)',
      champ: v.querySelectorAll('[data-rech]').length };
  }, { q, src });

  const SRC = {
    artisans: [], clients: [],
    departs: [{ uid: 'p9', nom: 'Laure Mouchot', email: 'laure@exemple.fr', role: 'artisan',
      metiers: ['menage'], avaitCandidature: true, statut: 'valide', inscritLe: 1, supprimeLe: 2, origine: 'desinscription' }],
    demandes: [{ id: 'r1', status: 'paid', svc: 'menage', svcName: 'Ménage', client: 'Camille',
      provider: 'Laure Mouchot', providerUid: 'p9', total: 70, at: 10, fin: 0 }],
    archives: [],
  };

  const repos = await ecran('', SRC);
  ok(repos.champ === 1, 'la console porte un champ de recherche, en tête');
  ok(/y compris pour un compte supprimé/.test(repos.txt),
    'et il annonce qu’il cherche aussi ce qui n’existe plus');
  ok(!/Rien, nulle part/.test(repos.txt), 'sans rien affirmer tant qu’on n’a pas cherché');

  const trouve = await ecran('laure', SRC);
  ok(/Compte parti/.test(trouve.txt) && /Laure Mouchot/.test(trouve.txt),
    'une prestataire partie se retrouve par son nom');
  ok(/Prestations/.test(trouve.txt) && /Ménage/.test(trouve.txt),
    'ET par sa prestation : c’est la trace qui ne part jamais, nom et SIRET figés dessus');

  const rien = await ecran('jean-michel introuvable', SRC);
  ok(/Rien, nulle part/.test(rien.txt),
    'un nom qu’on ne trouve nulle part le DIT : c’est la réponse qu’on vient chercher');
  ok(/avant la mise en service du journal des départs/.test(rien.txt),
    'et l’écran explique le seul cas où une personne réelle ne laisse aucune trace, au lieu de laisser croire à une erreur');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
