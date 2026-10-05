/* « Son numéro de téléphone n'est pas bon 😔😭 »

   Relevé en production le 05/10/2026, sur la fiche d'un prestataire VALIDÉ : +590 90210902,
   HUIT chiffres. Il en faut neuf. Ce numéro ne sonne nulle part, et rien ne le signalait —
   ni à la saisie, ni sur la fiche, ni sur la carte d'attente qui sert à le rappeler.

   DEUX DÉFAUTS. Le premier est la saisie : `^0+` retirait TOUS les zéros de tête (« 0690… »
   et « 00590… » perdaient deux chiffres au lieu d'un) et les espaces de lecture restaient
   dans la valeur enregistrée. Le second est l'absence totale de garde : la seule exigence
   était « au moins six caractères », donc huit chiffres passaient toutes les portes jusqu'à
   la validation.

   ON NE JUGE QUE CE QU'ON CONNAÎT (+590), ET ON NE CORRIGE PAS : compléter 90210902 en
   690210902 fabriquerait un numéro qui sonne chez quelqu'un d'autre. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__tel, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — le numéro de la capture, et ceux qui existent');
  const L = await p.evaluate(() => ({
    capture: window.__tel.lu('+590', '90210902'),
    mobile: window.__tel.lu('+590', '690210902'),
    mobile691: window.__tel.lu('+590', '691000000'),
    fixe: window.__tel.lu('+590', '590275555'),
    neufMaisFaux: window.__tel.lu('+590', '123456789'),
    trop: window.__tel.lu('+590', '6902109021'),
    vide: window.__tel.lu('+590', ''),
    espaces: window.__tel.lu('+590', '690 21 09 02'),
  }));
  ok(L.capture.ok === false && L.capture.chiffres === 8 && L.capture.attendu === 9, 'le numéro de la fiche est refusé : 8 chiffres au lieu de 9');
  ok(L.capture.cause === 'court', 'et la cause est nommée (trop court), pas « invalide »');
  ok(L.mobile.ok === true && L.mobile691.ok === true && L.fixe.ok === true, 'un mobile 690, un mobile 691 et un fixe 590 passent');
  ok(L.neufMaisFaux.ok === false && L.neufMaisFaux.cause === 'debut', 'neuf chiffres ne suffisent pas : 123456789 ne commence comme aucun numéro d’ici');
  ok(L.trop.ok === false && L.trop.cause === 'long', 'un chiffre de trop est refusé aussi');
  ok(L.vide.ok === false && L.vide.cause === 'vide', 'une case vide n’est pas un numéro faux : elle est vide');
  ok(L.espaces.ok === true, 'les espaces de lecture ne font pas un numéro faux');

  console.log('B — un indicatif qu’on ne connaît pas ne se juge pas à la lettre');
  const E = await p.evaluate(() => ({
    fr: window.__tel.lu('+33', '612345678'),
    us: window.__tel.lu('+1', '3055551234'),
    court: window.__tel.lu('+33', '1234'),
    long: window.__tel.lu('+33', '123456789012345'),
  }));
  ok(E.fr.ok === true && E.us.ok === true, 'un numéro étranger plausible passe : on ne prétend pas connaître son plan');
  ok(E.court.ok === false && E.long.ok === false, 'mais une plage absurde reste refusée, dans les deux sens');

  console.log('C — ce qui est ENREGISTRÉ : un seul zéro, aucun espace');
  const S = await p.evaluate(() => {
    const S = window.__S; S.proForm = S.proForm || {};
    const vue = document.getElementById('view');
    const essai = (v) => {
      vue.innerHTML = '<div class="row"><select data-phonepfx="pro"><option value="+590" selected>+590</option><option value="+33">+33</option></select><input data-phonenum="pro" value=""></div><p class="mini" data-telavis="pro" style="display:none"></p>';
      const nm = vue.querySelector('[data-phonenum="pro"]'); nm.value = v;
      window.__S.proForm.phone = '';
      // readPhoneCombo n'est pas exposé : on passe par le gestionnaire réel.
      nm.dispatchEvent(new Event('input', { bubbles: true }));
      return { val: window.__S.proForm.phone, avis: vue.querySelector('[data-telavis="pro"]').textContent, vu: vue.querySelector('[data-telavis="pro"]').style.display };
    };
    return { zero: essai('0690210902'), espaces: essai('06 90 21 09 02'), inter: essai('00590690210902'), court: essai('90210902') };
  });
  ok(S.zero.val === '+590 690210902', 'un 0 de tête part, un seul : ' + S.zero.val);
  ok(S.espaces.val === '+590 690210902', 'les espaces de lecture ne sont pas enregistrés : ' + S.espaces.val);
  ok(S.court.val === '+590 90210902', 'et on n’ajoute AUCUN chiffre à un numéro trop court : ' + S.court.val);

  console.log('D — l’avis se dit pendant la frappe, et seulement quand il y a quelque chose à dire');
  ok(S.zero.vu === 'none' && !S.zero.avis, 'un numéro juste n’affiche rien');
  ok(S.court.vu !== 'none' && /chiffre/.test(S.court.avis), 'un numéro trop court le dit : ' + S.court.avis);
  const D = await p.evaluate(() => ({ debut: window.__tel.avis('+590', '123456789').txt, vide: window.__tel.avis('+590', '').txt }));
  ok(/Saint-Barth/.test(D.debut), 'un début impossible est nommé comme tel : ' + D.debut);
  ok(D.vide === '', 'une case vide ne reproche rien');

  console.log('E — la console NOMME un numéro qui ne peut pas sonner');
  const C = await p.evaluate(() => ({
    capture: window.__tel.console('+590 90210902'),
    bon: window.__tel.console('+590 690210902'),
    vide: window.__tel.console(''),
    debut: window.__tel.console('+590 123456789'),
    stocke: window.__tel.stocke('+590 90210902').ok,
    stockeBon: window.__tel.stocke('+590 690210902').ok,
  }));
  ok(C.stocke === false && C.stockeBon === true, 'un numéro déjà enregistré se relit avec le même verdict');
  ok(/8 chiffres au lieu de 9/.test(C.capture), 'la fiche dit le fait, chiffré : ' + C.capture);
  ok(C.bon === '' && C.vide === '', 'un bon numéro, ou pas de numéro, n’affiche aucun reproche');
  ok(/ne peut pas sonner/.test(C.debut), 'un début impossible se dit aussi dans la console');

  console.log('F — les portes de l’inscription refusent désormais un numéro impossible');
  const G = await p.evaluate(() => {
    const base = { name: 'Vincent Beaudouin', siret: '12345678901234', address: 'Gustavia', birth: '1980-01-01' };
    const avec = (t) => Object.assign({}, base, { phone: t });
    return {
      idCourt: window.__assur.faites(avec('+590 90210902')).id,
      idBon: window.__assur.faites(avec('+590 690210902')).id,
      manqueCourt: window.__assur.manqueEtape('id', avec('+590 90210902')),
      manqueBon: window.__assur.manqueEtape('id', avec('+590 690210902')),
      texte: window.__prix.manque(avec('+590 90210902')).join(' | '),
    };
  });
  ok(G.idBon === true, 'un dossier avec un vrai numéro franchit l’étape Identité');
  ok(G.idCourt === false, 'le même dossier avec 8 chiffres ne la franchit plus');
  ok(/ne peut pas exister|puisse exister/.test(G.manqueCourt.join(' ')), 'et l’écran DIT pourquoi : ' + G.manqueCourt.join(' / '));
  ok(G.manqueBon.length === 0, 'rien ne manque quand le numéro est bon');
  ok(/téléphone/.test(G.texte), 'la liste du dossier complet le nomme aussi : ' + G.texte);

  console.log('G — la pastille verte dit la même chose que la garde');
  const V = await p.evaluate(() => {
    const vue = document.getElementById('view');
    const essai = (pfx, v) => {
      vue.innerHTML = '<div class="row"><select data-phonepfx="pro"><option value="+590">+590</option><option value="+33">+33</option></select><input class="txt" data-phonenum="pro" data-v="phone" value=""></div><p class="mini" data-telavis="pro" style="display:none"></p>';
      const sel = vue.querySelector('[data-phonepfx="pro"]'); sel.value = pfx;
      const nm = vue.querySelector('[data-phonenum="pro"]'); nm.value = v;
      nm.dispatchEvent(new Event('input', { bubbles: true }));
      return nm.classList.contains('vok');
    };
    return { bon: essai('+590', '0690210902'), court: essai('+590', '90210902'), etranger: essai('+33', '612345678') };
  });
  ok(V.bon === true, 'un vrai numéro allume le crochet');
  ok(V.court === false, 'huit chiffres ne l’allument plus : la pastille ne promet plus ce que l’inscription refuse');
  ok(V.etranger === true, 'et un indicatif qu’on ne connaît pas n’est pas jugé à la lettre');

    ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
