/* « POURQUOI POUR CERTAINS JE NE PEUX PAS COCHER CES OPTIONS ? »

   Parce que « Le client choisit son prestataire » et « Demander une photo à la commande »
   n'étaient ouverts que sur les métiers AJOUTÉS depuis la console. Sur les vingt et un
   métiers d'origine ils étaient éteints et pâles, sous une phrase qui disait « réglé dans
   le code ». Or ce sont exactement les réglages qu'on veut corriger en regardant le parc
   vivre : un ménage dont on découvre qu'il mérite le choix du prestataire, un cours qui
   n'a rien à photographier.

   ON NE TOUCHE PAS AU CODE : sa valeur reste le DÉFAUT, et l'on n'enregistre que ce qui
   s'en écarte — reposer la valeur d'origine RETIRE la clé au lieu de la réécrire. Un parc
   qui ne change rien ne pèse rien de plus, et le jour où le code change d'avis, les
   métiers non touchés le suivent.

   L'épreuve mesure ce que le CLIENT voit sur son écran de commande, pas un drapeau. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg && window.__svc);

  /* L'écran de commande d'un client, avec un réglage posé comme la console le pose. */
  const vu = (svc, metier) => p.evaluate(({ svc, metier }) => {
    window.__setFB({ auth: { currentUser: { uid: 'u' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve() },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client';
    S.clientNav = 'home'; S.jalons = {}; S._cfgVu = null; S.mission = null; S.payStep = false;
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: 'a1', label: 'Maison', zone: 'Gustavia', address: 'Lurin', geo: { lat: 17.9, lng: -62.84 }, access: '' }];
    S.addrDefault = 'a1';
    S._proDir = {}; S._proDir[svc] = { list: [{ uid: 'a', name: 'Maya', siteMode: 'domicile' },
      { uid: 'b', name: 'Léa', siteMode: 'domicile' }] };
    S.adminMetier = metier ? JSON.parse(JSON.stringify(metier)) : {};
    S.draft = window.__newMission(window.__svc.trouve(svc));
    window.__cfg.render();
    const v = document.getElementById('view');
    return { annuaire: !!v.querySelector('[data-prefart]'),
      photo: /Ajouter une photo|photo aide le prestataire|résultat que vous aimeriez/.test(v.textContent || ''),
      cle: JSON.stringify(S.adminMetier[svc] || null) };
  }, { svc, metier });

  /* A — RIEN DE POSÉ : LE CODE DÉCIDE, comme avant. */
  console.log('A — rien de posé : la valeur du code, aucun métier du parc ne change');
  const a1 = await vu('coiffure', {});   // le code dit OUI au choix du prestataire
  const a2 = await vu('menage', {});     // le code dit NON
  ok(a1.annuaire, 'coiffure : l’annuaire du métier est offert');
  ok(!a2.annuaire, 'ménage : il ne l’est pas');
  const a3 = await vu('plomberie', {});  // le code demande une photo
  const a4 = await vu('yoga', {});       // le code n’en demande pas
  ok(a3.photo, 'plomberie : la photo est proposée');
  ok(!a4.photo, 'yoga : elle ne l’est pas');

  /* B — LA CONSOLE RENVERSE LES DEUX, SUR UN MÉTIER D'ORIGINE. C'est tout l'objet. */
  console.log('B — la console renverse les deux, sur un métier d’origine');
  ok((await vu('menage', { menage: { choixPro: true } })).annuaire,
    'ménage : le choix du prestataire s’ouvre');
  ok(!(await vu('coiffure', { coiffure: { choixPro: false } })).annuaire,
    'coiffure : il se ferme');
  ok(!(await vu('plomberie', { plomberie: { photo: 'non' } })).photo,
    'plomberie : la photo cesse d’être demandée');
  ok((await vu('yoga', { yoga: { photo: 'etat' } })).photo,
    'yoga : elle est demandée');

  /* C — UNE VALEUR ABÎMÉE N'EST PAS UN RÉGLAGE. Ce qui revient d'un compte passe par des
     listes fermées : sinon n'importe quoi deviendrait un rôle de photo. */
  console.log('C — ce qui revient du compte passe par des listes fermées');
  for (const mauvais of [{ photo: 'oui' }, { photo: 42 }, { choixPro: 'true' }, { choixPro: 1 }]) {
    const r = await vu('plomberie', { plomberie: mauvais });
    const ref = await vu('plomberie', {});
    ok(r.photo === ref.photo && r.annuaire === ref.annuaire,
      JSON.stringify(mauvais) + ' : ignoré, le code décide');
  }

  /* D — REPOSER LA VALEUR D'ORIGINE RETIRE LA CLÉ. Sans cela, un parc entier porterait
     des réglages identiques au code, et le jour où le code change d'avis plus personne
     ne le suivrait. On mesure le GESTE de la console, pas une intention. */
  console.log('D — reposer la valeur d’origine retire la clé');
  const d = await p.evaluate(() => {
    const S = window.__S; const out = {};
    S.adminMetier = {};
    const clic = function (act, id) {
      const b = document.createElement('button');
      b.dataset.adm = act + ':' + id; document.body.appendChild(b); b.click(); b.remove();
    };
    clic('catchoix', 'menage');                       // le code dit non → on pose oui
    out.pose = JSON.stringify(S.adminMetier.menage || null);
    clic('catchoix', 'menage');                       // retour à la valeur du code
    out.repose = JSON.stringify(S.adminMetier.menage || null);
    S.adminMetier = { menage: { jours: 90 } };
    clic('catchoix', 'menage'); clic('catchoix', 'menage');
    out.voisin = JSON.stringify(S.adminMetier.menage || null);
    return out;
  });
  ok(d.pose === '{"choixPro":true}', 'posé : ' + d.pose);
  ok(d.repose === 'null', 'reposé : la clé a disparu (' + d.repose + ')');
  ok(d.voisin === '{"jours":90}', 'et le réglage voisin du même métier survit (' + d.voisin + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
