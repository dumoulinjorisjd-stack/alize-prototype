/* « UNE PETITE BARRE QUI MONTRE LES PROCHAINES ÉTAPES ; QUAND ELLES SONT VALIDÉES, UN
   BADGE VERT. ON VISUALISE D'UN COUP D'ŒIL LES ÉTAPES QUE L'ON AURA À VALIDER ET CELLES
   QUE LE PRESTATAIRE DEVRA VALIDER. »

   Il y avait déjà une frise, en bas de l'écran de suivi, à la verticale. Son défaut
   n'était pas celui qu'on croit : son `activeIdx` ne connaissait que trois statuts, mais
   les trois autres ne passent pas par cet écran — ils ont le leur. LE VRAI MANQUE EST
   QU'ELLE S'ARRÊTAIT À LA PORTE DE SON ÉCRAN : le client en traverse QUATRE après avoir
   commandé (recherche, suivi, validation, reçu) et perdait le fil à chaque passage. Et
   elle ne disait jamais QUI doit valider.

   L'épreuve mesure l'ÉCRAN RENDU à chacun des états, sur les quatre écrans. */
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

  const suivi = (statut) => p.evaluate((statut) => {
    window.__setFB({ auth: { currentUser: { uid: 'u', email: 'c@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = []; S.draft = null; S.payStep = false; S.admin = null;
    S.clientNav = 'wallet';
    S.mission = { reqId: 'r1', svc: 'menage', svcName: 'Ménage', status: statut,
      when: 'Aujourd’hui', slot: '14:00', duration: 3, unit: 'h', rate: 35, zone: 'Gustavia',
      address: 'Lurin', acts: null, chat: [], support: {}, finalHours: null, rating: 0,
      provider: statut === 'pending' ? null : { nm: 'Prestataire A', ini: 'PA' } };
    window.__render();
    const v = document.getElementById('view');
    const bar = v.querySelector('.etapes');
    if (!bar) return { barre: false, txt: (v.textContent || '').replace(/\s+/g, ' ') };
    const et = Array.from(bar.querySelectorAll('.et')).map((e) => ({
      t: (e.querySelector('.et-t') || {}).textContent || '',
      qui: (e.querySelector('.et-qui') || {}).textContent || '',
      /* L'ÉTAT SE DEMANDE AU CLASSEUR, il ne se découpe pas dans une chaîne : la pastille
         porte d'autres classes (`zouti`), et un `replace` naïf rendait « encours zouti ». */
      etat: e.classList.contains('faite') ? 'faite' : (e.classList.contains('encours') ? 'encours' : 'avenir'),
      coche: !!e.querySelector('.et-rond svg, .et-rond img'),
      vert: getComputedStyle(e.querySelector('.et-rond')).backgroundColor }));
    /* La GOUTTIÈRE entre deux libellés se mesure sur le TEXTE et non sur la colonne :
       une colonne de largeur fixe ne dit pas si les mots se touchent. */
    const gout = Array.from(bar.querySelectorAll('.et')).map((e) => {
      const t = e.querySelector('.et-t'), rg = document.createRange();
      rg.selectNodeContents(t);
      return e.getBoundingClientRect().width - rg.getBoundingClientRect().width; });
    const cr = bar.getBoundingClientRect(), rd = bar.querySelector('.encours .et-rond');
    /* L'ONDE à son maximum doit tenir dans la carte. ON NE DEVINE PAS SON AMPLEUR : on lit
       le nom d'animation que le navigateur APPLIQUE à l'onde, puis l'échelle écrite dans
       SES propres images clés. Un chiffre recopié ici passerait au vert le jour où la
       barre repointerait vers `ping` (4,2×) — c'est-à-dire le défaut qu'on corrige. */
    const onde = rd ? (function () {
      const nom = getComputedStyle(rd, '::after').animationName;
      let ech = null;
      for (const f of Array.from(document.styleSheets)) {
        let rs; try { rs = f.cssRules; } catch (_) { continue; }
        for (const r of Array.from(rs || [])) {
          if (r.type !== CSSRule.KEYFRAMES_RULE || r.name !== nom) continue;
          for (const k of Array.from(r.cssRules)) {
            const m = /scale\(([\d.]+)\)/.exec(k.style.transform || '');
            if (m) ech = Math.max(ech || 0, parseFloat(m[1]));
          }
        }
      }
      if (ech == null) return null;
      const r = rd.getBoundingClientRect(), c = r.left + r.width / 2, d = r.width * ech / 2;
      return Math.min(c - d - cr.left, cr.right - (c + d)); })() : null;
    return { barre: true, et: et,
      att: (bar.querySelector('.et-att') || {}).textContent || '',
      moi: !!bar.querySelector('.et-att.moi'),
      deb: Math.max(0, bar.scrollWidth - bar.clientWidth),
      gout: Math.min.apply(null, gout), onde: onde,
      zouti: bar.querySelectorAll('.et-zouti').length,
      zoutiEcran: v.querySelectorAll('.et-zouti, .radar .core svg, .radar .core img').length,
      frise: v.querySelectorAll('.timeline').length };
  }, statut);

  console.log('\nA — les cinq étapes, et qui valide chacune');
  const a = await suivi('pending');
  ok(a.barre && a.et.length === 5, 'la barre montre cinq étapes');
  ok(a.et.map((e) => e.t).join(' ') === 'Envoyée Acceptée Démarrée Terminée Validée',
    'dans l’ordre : ' + a.et.map((e) => e.t).join(' · '));
  ok(a.et.map((e) => e.qui).join(',') === 'vous,le pro,le pro,le pro,vous',
    'et chacune dit QUI valide : ' + a.et.map((e) => e.qui).join(' · '));
  ok(a.deb === 0, 'tout tient sur 390 px, sans débordement');

  console.log('B — le badge vert suit l’avancement');
  const vert = (x) => /rgb\(\s*1[0-9],\s*16[0-9]|rgb\(18,\s*162/.test(x) || x !== 'rgba(0, 0, 0, 0)';
  const faites = (r) => r.et.filter((e) => e.etat === 'faite').length;
  const encours = (r) => (r.et.find((e) => e.etat === 'encours') || {}).t || '—';
  for (const [st, n, suite] of [['pending', 1, 'Acceptée'], ['accepted', 2, 'Démarrée'],
    ['working', 3, 'Terminée'], ['done_pro', 4, 'Validée'], ['paid', 5, '—']]) {
    const r = await suivi(st);
    ok(faites(r) === n && encours(r) === suite,
      st + ' : ' + n + ' étape(s) cochée(s), en cours « ' + encours(r) + ' »');
  }
  const t = await suivi('paid');
  /* LA COCHE EST UN SVG : `textContent` est vide, c'est sa PRÉSENCE qu'on mesure, et la
     couleur du rond qu'on compare à celle des étapes à venir. Une épreuve qui aurait
     lu le texte aurait conclu qu'aucune étape n'est cochée, sur un écran où elles le
     sont toutes. */
  ok(t.et.every((e) => e.coche), 'une fois réglée, les cinq portent la coche');
  const avenir = (await suivi('pending')).et[4].vert;
  ok(t.et.every((e) => e.vert !== avenir),
    'et leur rond est vert (' + t.et[0].vert + '), pas celui des étapes à venir (' + avenir + ')');

  /* C — LE DÉFAUT QUI MOTIVE TOUT. À `done_pro`, l'ancienne frise repassait TOUT en
     « à venir », y compris « Demande envoyée ». C'est l'état où le client doit agir. */
  console.log('C — à l’instant où le client doit agir');
  const d = await suivi('done_pro');
  ok(faites(d) === 4 && d.et[0].etat === 'faite',
    '« Envoyée » reste cochée (elle a bien eu lieu) et quatre étapes sont faites');
  ok(/valider/i.test(d.att) && d.moi,
    'et l’écran dit que c’est à VOUS, en corail : « ' + d.att.trim() + ' »');
  const w = await suivi('working');
  ok(/prestataire/i.test(w.att) && !w.moi,
    'tant qu’on attend le pro, la phrase est neutre : « ' + w.att.trim() + ' »');

  console.log('D — la barre suit le client d’un écran à l’autre');
  ok(d.frise === 0, 'l’ancienne frise verticale du bas a disparu');
  for (const [st, ecran] of [['searching', 'recherche'], ['working', 'suivi'],
    ['done_pro', 'validation'], ['paid', 'reçu']]) {
    const r = await suivi(st);
    ok(r.barre, 'écran de ' + ecran + ' (' + st + ') : la barre y est aussi');
  }

  /* E — UNE BARRE QUI PROMETTRAIT DES ÉTAPES QUI NE VIENDRONT JAMAIS SERAIT PIRE QUE PAS
     DE BARRE : sur une mission annulée ou en litige, elle ne s'affiche pas. */
  console.log('E — ce qui ne suit pas ce chemin ne montre pas de barre');
  for (const st of ['cancelled', 'disputed', 'expired']) {
    const r = await suivi(st);
    ok(!r.barre, st + ' : aucune barre');
  }

  /* F — CE QUE LE RENDU A DIT, ET QU'AUCUNE LECTURE DU CODE N'AURAIT DIT. Trois mesures
     prises sur la barre dessinée, à quatre largeurs d'écran.

     LES CINQ LIBELLÉS SE TOUCHAIENT : à 11,5 px il restait 0,6 px entre « Démarrée » et
     sa voisine sur 390 px, et la gouttière passait à −5,4 px sur 360 — les mots se
     chevauchaient. ET L'ONDE DE L'ÉTAPE EN COURS SORTAIT DE LA CARTE : `ping` monte à
     4,2×, ce qui vaut pour une pastille de 8 px mais fait 109 px sur une de 26, et la
     dernière étape n'est qu'à 46 px du bord — l'onde s'y coupait net. */
  console.log('F — ce que la barre MESURE une fois dessinée');
  for (const L of [320, 360, 375, 390, 430]) {
    await p.setViewportSize({ width: L, height: 900 });
    const r = await suivi('done_pro');
    /* « > 0 » ne suffit pas : 0,6 px de gouttière se LIT comme deux mots collés. */
    ok(r.gout >= 2, L + ' px : les libellés ne se touchent pas (' + r.gout.toFixed(1) + ' px de gouttière)');
    ok(r.onde != null && r.onde > 0, L + ' px : l’onde de l’étape en cours tient dans la carte (' + (r.onde == null ? 'aucune onde lue' : r.onde.toFixed(1) + ' px de marge') + ')');
    ok(r.deb === 0, L + ' px : rien ne déborde en largeur');
  }
  await p.setViewportSize({ width: 390, height: 900 });

  /* ZOUTI NE SE DÉDOUBLE PAS. L'écran de recherche porte déjà le grand Zouti au centre de
     son radar ; un second, soixante pixels plus haut, se lit comme une coquille. */
  console.log('G — un seul Zouti par écran');
  const zr = await suivi('searching');
  ok(zr.zouti === 0, 'écran de recherche : la barre laisse le Zouti du radar seul');
  ok(zr.zoutiEcran === 1, 'et il y en a bien UN sur l’écran, pas zéro');
  for (const st of ['working', 'done_pro']) {
    const r = await suivi(st);
    ok(r.zouti === 1, st + ' : Zouti marque l’étape en cours');
  }
  /* TOUT RÉGLÉ, IL N'Y A PLUS D'ÉTAPE EN COURS. Zouti vit dans la pastille, qui passe
     alors au fond papier : une sixième allure au bout d'une file de ronds verts pleins
     se lirait comme une étape qui RESTE à faire, l'inverse de « Tout est validé ». */
  ok((await suivi('paid')).zouti === 0,
    'mission réglée : plus d’étape en cours, donc plus de Zouti — cinq ronds verts pleins');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
