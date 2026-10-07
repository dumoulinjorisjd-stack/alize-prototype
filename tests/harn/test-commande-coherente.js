/* PASSE COMPLÈTE SUR LA COMMANDE CLIENT, LES 21 MÉTIERS.

   Trois défauts relevés en jouant chaque commande, et corrigés ici.

   1. LE DUO ÉTAIT FACTURÉ DEUX FOIS. Cocher « Duo (2 pers., 1 h) » à 210 € puis répondre
      « 2 personnes » à la question posée juste en dessous donnait 420 €. La prestation
      annonce déjà qu'elle est pour deux. Même configuration sur le coach, le Pilates et
      le yoga. La règle est PAR PRESTATION et non par métier, parce que le panier en
      accepte plusieurs : « 1 h relaxant » doit suivre le nombre de personnes, « Duo »
      non, et les deux peuvent être cochés ensemble.
   2. LES PAS « − » NE SE GRISAIENT PAS à la borne : noirs, cliquables, sans effet.
   3. TROIS HAUTEURS DE BOUTON sur le même écran pour des commandes de même rang.

   L'épreuve mesure l'ÉCRAN et les TOTAUX, pas le texte des fonctions. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg && window.__svc);

  const poser = (svc) => p.evaluate((svc) => {
    window.__setFB({ auth: { currentUser: { uid: 'u', email: 'c@e.fr' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = true; S.persona = 'client';
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.addresses = [{ id: '1', label: 'Mon adresse', address: 'Lurin', zone: 'Gustavia', geo: { lat: 17.9, lng: -62.8 } }];
    S.mission = null; S.payStep = false; S.admin = null; S.catOpen = null; S.cfgMore = true;
    S.draft = window.__newMission(window.__svc.trouve(svc)); S._cfgVu = null; window.__cfg.render();
  }, svc);
  const total = () => p.evaluate(() => {
    const t = (document.getElementById('view').textContent || '').replace(/\s+/g, ' ');
    return (t.match(/Total\s*([\d  ,]+€)/) || [])[1] || '?';
  });
  const cocher = (re) => p.evaluate((re) => {
    const v = document.getElementById('view');
    v.querySelectorAll('[data-actgrp]').forEach((g) => g.click());
    return new Promise((r) => setTimeout(() => {
      const a = Array.from(v.querySelectorAll('[data-actpick]'));
      const e = a.find((x) => new RegExp(re, 'i').test(x.textContent || ''));
      if (e) e.click(); r(!!e);
    }, 260));
  }, re);
  const plusPers = () => p.evaluate(() => { const e = document.querySelector('[data-cfg="people-plus"]'); if (e) e.click(); });

  console.log('\nA — une prestation qui annonce déjà un nombre ne se multiplie pas');
  await poser('massage');
  ok(await cocher('Duo'), 'le massage a bien une prestation « Duo »');
  await p.waitForTimeout(320);
  const duo1 = await total();
  await plusPers(); await p.waitForTimeout(320);
  const duo2 = await total();
  ok(duo1 === duo2, 'Duo à 1 puis 2 personnes : le total ne bouge pas (' + duo1 + ' → ' + duo2 + ')');

  console.log('B — une prestation ordinaire, elle, se multiplie toujours');
  await poser('massage');
  await cocher('1 h relaxant'); await p.waitForTimeout(320);
  const un1 = await total();
  await plusPers(); await p.waitForTimeout(320);
  const un2 = await total();
  const n = (x) => Number(String(x).replace(/[^\d,]/g, '').replace(',', '.'));
  ok(Math.abs(n(un2) - 2 * n(un1)) < 0.01,
    '« 1 h relaxant » à 2 personnes vaut bien le double (' + un1 + ' → ' + un2 + ')');

  console.log('C — les deux dans le même panier, chacune sa règle');
  await poser('massage');
  await cocher('1 h relaxant'); await p.waitForTimeout(260);
  await cocher('Duo'); await p.waitForTimeout(320);
  const mix1 = await total();
  await plusPers(); await p.waitForTimeout(320);
  const mix2 = await total();
  ok(Math.abs(n(mix2) - (n(mix1) + 110)) < 0.01,
    'seule la prestation individuelle double (' + mix1 + ' → ' + mix2 + ', soit +110 €)');

  console.log('D — les trois autres métiers concernés');
  for (const svc of ['coach', 'pilates', 'yoga']) {
    await poser(svc);
    const eu = await cocher('duo');
    await p.waitForTimeout(320);
    const a = await total(); await plusPers(); await p.waitForTimeout(320);
    const bb = await total();
    ok(eu && a === bb, svc + ' : le duo ne double pas (' + a + ' → ' + bb + ')');
  }

  console.log('E — à la borne, le pas se grise');
  await poser('massage');
  const bornes = await p.evaluate(() => {
    const v = document.getElementById('view');
    const m = v.querySelector('[data-cfg="people-minus"]'), pl = v.querySelector('[data-cfg="people-plus"]');
    return { moins: m ? m.disabled : null, plus: pl ? pl.disabled : null,
      op: m ? getComputedStyle(m).opacity : '' };
  });
  ok(bornes.moins === true, 'à 1 personne, le « − » est désactivé (opacité ' + bornes.op + ')');
  ok(bornes.plus === false, 'et le « + » reste actif');
  await poser('baby');
  const kid = await p.evaluate(() => {
    const v = document.getElementById('view');
    const m = v.querySelector('[data-cfg="kids-minus"]'), d = v.querySelector('[data-cfg="minus"]');
    return { k: m ? m.disabled : null, d: d ? d.disabled : null };
  });
  ok(kid.k === true, 'à 1 enfant aussi');
  ok(kid.d === false, 'la durée, elle, part à 3 h : son « − » reste actif');

  /* On mesure sur un massage : c'est l'écran qui porte le PLUS de petites commandes de
     rangs différents — les cinq chips de souplesse, les deux boutons de lieu, le retour. */
  console.log('F — une seule hauteur pour les petites commandes');
  await poser('massage'); await p.waitForTimeout(260);
  const h = await p.evaluate(() => {
    const v = document.getElementById('view');
    const pris = (sel) => Array.from(v.querySelectorAll(sel)).filter((e) => e.offsetParent)
      .map((e) => Math.round(e.getBoundingClientRect().height));
    return { seg: pris('.seg'), reset: pris('.reset') };
  });
  const toutes = h.seg.concat(h.reset);
  ok(toutes.length > 3 && new Set(toutes).size === 1,
    'chips, lieu et « ← Retour » font tous la même hauteur (' + Array.from(new Set(toutes)).join('/') + ' px, ' + toutes.length + ' boutons)');

  console.log('G — rien d’autre n’a bougé');
  const prix = {};
  for (const svc of ['menage', 'jardin', 'baby', 'animaux', 'plomberie', 'clim']) {
    await poser(svc); await p.waitForTimeout(220); prix[svc] = await total();
  }
  ok(prix.menage === '105,00 €' && prix.jardin === '120,00 €' && prix.baby === '84,00 €',
    'les totaux horaires sont inchangés (' + prix.menage + ' / ' + prix.jardin + ' / ' + prix.baby + ')');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
