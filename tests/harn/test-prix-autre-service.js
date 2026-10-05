/* « 1450€ LA JOURNEE COMPLETE AVEC SUNSET INCLUS. DEMIE JOURNEE 950€ AVEC SUNSET »

   Relevé en production le 05/10/2026, sur une inscription RÉELLE. Un loueur de catamaran
   écrit cela dans la case « Ce que vous voulez percevoir ». `Number(...)` rend NaN, donc
   0, donc son dossier n'est jamais complet — et ce qu'on lui répondait, « il reste à
   fournir : le prix que vous voulez percevoir pour "Location de catamaran…" », NOMMAIT CE
   QU'IL VENAIT D'ÉCRIRE. Rien ne disait « un nombre seul ». La case acceptait sa phrase,
   « Enregistrer et continuer » marchait, et le refus tombait sur un autre écran.

   DEUX DÉFAUTS, ET LE SECOND COMMANDE LE PREMIER. La case ne tient qu'UN prix, son offre
   en a quatre : il a écrit une phrase parce qu'il n'y avait aucun autre endroit où la
   mettre. Lui demander « un nombre seul » sans lui donner cet endroit lui ferait JETER
   trois de ses quatre prix, et publierait une offre qui ne ressemble pas à ce qu'il vend.

   ON NE DEVINE PAS LE NOMBRE : prendre 1450 et laisser tomber le reste serait une valeur
   fausse qui se lit comme une valeur juste, et c'est le prix public qui en découle. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

// La saisie exacte de la capture.
const VRAIE = '1450€ la journee complete avec sunset inclus. demie journee 950€ avec sunset';
const SERVICE = 'Location de catamaran avec skipper sur st Barthelemy et les Caraïbes, à la demie journée, journée, weekend et semaine.';

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__prix, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — ce qu’on comprend d’une saisie, et ce qu’on refuse de deviner');
  const L = await p.evaluate((v) => ({
    vraie: window.__prix.lu(v),
    nu: window.__prix.lu('1450'),
    euro: window.__prix.lu('1450 €'),
    espaces: window.__prix.lu(' 1 450€ '),
    virgule: window.__prix.lu('37,50'),
    vide: window.__prix.lu(''),
    zero: window.__prix.lu('0'),
    mot: window.__prix.lu('à discuter'),
    deux: window.__prix.lu('950 ou 1450'),
  }), VRAIE);
  ok(L.vraie.ok === false && L.vraie.valeur === 0,
    'la phrase du loueur n’est PAS un prix, et ne vaut surtout pas 1450 par déduction');
  ok(L.vraie.cause === 'plusieurs' && L.vraie.nombres.length === 2,
    'on sait DIRE pourquoi : elle porte deux nombres (' + JSON.stringify(L.vraie.nombres) + ')');
  ok(L.nu.ok && L.nu.valeur === 1450, 'un nombre nu passe');
  ok(L.euro.ok && L.euro.valeur === 1450, 'avec l’euro aussi : le symbole est déjà imprimé en face');
  ok(L.espaces.ok && L.espaces.valeur === 1450, 'les espaces d’un millier ne font pas une faute');
  ok(L.virgule.ok && L.virgule.valeur === 37.5, 'la virgule décimale non plus (' + L.virgule.valeur + ')');
  ok(L.vide.cause === 'vide' && !L.vide.ok, 'une case vide est vide, pas fautive');
  ok(!L.zero.ok, 'zéro n’est pas un prix');
  ok(!L.mot.ok && L.mot.cause === 'texte', 'un mot est du texte');
  ok(!L.deux.ok && L.deux.cause === 'plusieurs', 'deux nombres restent deux nombres');

  console.log('\nB — la phrase que l’écran dit, et qui manquait');
  const A = await p.evaluate((v) => ({
    vraie: window.__prix.avis(v, 'forfait'),
    bonne: window.__prix.avis('1450', 'forfait'),
    heure: window.__prix.avis('45', 'h'),
    mot: window.__prix.avis('à discuter', 'forfait'),
    vide: window.__prix.avis('', 'forfait'),
  }), VRAIE);
  ok(A.vraie.cls === 'ko' && /seul nombre/i.test(A.vraie.txt),
    'devant sa phrase, on NOMME la faute (« ' + A.vraie.txt + ' »)');
  ok(/autres formules/i.test(A.vraie.txt), 'et on montre la sortie, au lieu de le laisser devant un mur');
  ok(A.mot.cls === 'ko' && /nombre seul/i.test(A.mot.txt) && /1450/.test(A.mot.txt),
    'un texte reçoit un exemple chiffré (« ' + A.mot.txt + ' »)');
  const esp = (x) => String(x || '').replace(/[\s\u202f\u00a0]+/g, ' ');
  ok(A.bonne.cls === 'ok' && /1 450 €/.test(esp(A.bonne.txt)) && /par prestation/.test(A.bonne.txt),
    'et un prix juste est CONFIRMÉ, unité comprise (« ' + A.bonne.txt + ' »)');
  ok(A.heure.cls === 'ok' && /de l’heure/.test(A.heure.txt), 'à l’heure aussi (« ' + A.heure.txt + ' »)');
  ok(A.vide.txt === '', 'et une case vide ne reçoit aucun reproche');

  console.log('\nC — le refus ne répète plus la question');
  const M = await p.evaluate((d) => {
    const base = { cats: ['autre'], otherService: d.sv };
    return { phrase: window.__prix.manque(Object.assign({}, base, { otherPrice: d.v })),
      bon: window.__prix.manque(Object.assign({}, base, { otherPrice: '1450' })) };
  }, { v: VRAIE, sv: SERVICE });
  const ligne = M.phrase.filter((x) => /catamaran|CHIFFR/i.test(x))[0] || '';
  ok(!!ligne && /CHIFFR/.test(ligne), 'ce qui manque est nommé « un montant CHIFFRÉ » (« ' + ligne.slice(0, 80) + '… »)');
  ok(/nombre seul/.test(ligne), 'et la phrase dit la forme attendue');
  ok(M.bon.filter((x) => /catamaran/i.test(x)).length === 0, 'avec un nombre, la ligne disparaît');

  console.log('\nD — la case où ses quatre formules ont le droit de vivre');
  const C = await p.evaluate((sv) => {
    const vue = window.__prix.carte(sv, '', 'forfait', 'data-pf="otherPrice"', 'othunit', 'data-pf="otherPriceNote"', '');
    return { note: /data-pf="otherPriceNote"/.test(vue), aire: /<textarea/.test(vue),
      titre: /Vos autres formules/.test(vue), avis: /id="autrePrixAvis"/.test(vue),
      exemple: /950 € la demi-journée/.test(vue), un: /ne tient qu'<b>un<\/b> prix/.test(vue) };
  }, SERVICE);
  ok(C.note && C.aire, 'la carte porte une zone de texte pour les autres formules');
  ok(C.titre, 'elle est nommée « Vos autres formules »');
  ok(C.exemple, 'et son exemple est celui d’une vraie offre à plusieurs prix');
  ok(C.un, 'la carte DIT que la case du dessus ne tient qu’un prix');
  ok(C.avis, 'et l’avis vit sous la case, pas sur un autre écran');

  console.log('\nE — bout en bout : le dossier du loueur passe, sans rien perdre');
  const E = await p.evaluate((d) => {
    const f = { cats: ['autre'], otherService: d.sv, otherPrice: d.v, otherUnit: 'forfait' };
    const avant = window.__prix.okAutre(f);
    // Il fait ce que l'écran lui dit : le nombre dans la case, la phrase en dessous.
    f.otherPrice = '1450';
    f.otherPriceNote = '950 € la demi-journée avec sunset, 1 450 € la journée complète.';
    return { avant: avant, apres: window.__prix.okAutre(f), note: f.otherPriceNote };
  }, { v: VRAIE, sv: SERVICE });
  ok(E.avant === false, 'sa saisie d’origine ne valide pas l’étape');
  ok(E.apres === true, 'et après le partage nombre / phrase, elle valide');

  console.log('\nF — la phrase voyage, et quelqu’un la lit');
  ok(/'otherService','otherPrice','otherPriceNote','otherUnit'/.test(html),
    'le brouillon la garde, donc elle suit le compte d’un appareil à l’autre');
  ok(/otherPriceNote:\(f\.otherPriceNote\|\|''\)\.trim\(\)\.slice\(0, ?400\)/.test(html),
    'la candidature l’écrit, bornée');
  ok(/otherPriceNote:a\.otherPriceNote\|\|''/.test(html), 'la console la relit');
  ok((html.match(/Ses autres formules/g) || []).length === 2,
    'et elle paraît aux DEUX endroits où l’éditeur décide du prix public');

  console.log('\nG — une seule lecture pour tout le monde');
  const restes = (html.match(/Number\(String\(f\.otherPrice\|\|''\)/g) || []).length;
  ok(restes === 0, 'plus aucun endroit ne relit ce champ à sa façon (' + restes + ')');
  ok((html.match(/prixAutreLu\(/g) || []).length >= 5,
    'les cinq lecteurs passent par la même porte');

  console.log('\nH — dans l’écran réel, l’avis apparaît PENDANT la frappe');
  // C'est tout le défaut : la case acceptait sa phrase sans rien dire, et le refus
  // tombait sur un autre écran, formulé comme s'il n'avait rien écrit.
  await p.evaluate((d) => {
    try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
    const S = window.__S;
    S.persona = 'pro'; S.onboarded = true; S.authView = null; S.guest = false;
    S.account = { name: 'Skipper', email: 's@e.fr', uid: 'u9', role: 'artisan' };
    S.proStatus = 'draft'; S.proStep = 'svc';
    S.proForm = { name: 'Skipper', phone: '0690112233', siret: '12345678901234',
      address: 'Gustavia', birth: '1980-01-01', cats: ['autre'], otherService: d.sv,
      otherPrice: '', otherUnit: 'forfait', acceptsGrille: true, authed: true, googleAuth: true };
    window.__render();
  }, { sv: SERVICE });
  await p.waitForTimeout(400);
  const champ = await p.evaluate(() => !!document.querySelector('#view [data-pf="otherPrice"]'));
  ok(champ, 'la case du prix est bien à l’écran');
  // On tape sa phrase, exactement comme lui, et l'on écoute ce que l'écran répond.
  const taper = (v) => p.evaluate((val) => {
    const el = document.querySelector('#view [data-pf="otherPrice"]');
    if (!el) return null;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const a = document.getElementById('autrePrixAvis');
    return a ? { txt: a.textContent, vu: a.style.display !== 'none', couleur: a.style.color } : null;
  }, v);
  const H1 = await taper(VRAIE);
  ok(!!H1 && H1.vu && /seul nombre/i.test(H1.txt),
    'sa phrase fait apparaître la raison, sous la case (« ' + (H1 ? H1.txt.slice(0, 60) : '—') + '… »)');
  ok(!!H1 && /coral/.test(H1.couleur), 'en rouge : c’est un refus, et il se voit');
  const H2 = await taper('1450');
  ok(!!H2 && H2.vu && /Vous toucherez/.test(H2.txt) && /good/.test(H2.couleur),
    'le nombre seul le confirme aussitôt, en vert (« ' + (H2 ? H2.txt : '—') + ' »)');
  const H3 = await taper('');
  ok(!!H3 && !H3.vu, 'et la case vidée ne laisse aucun reproche affiché');
  // Enfin la zone des formules est là, dans le même écran, prête à recevoir la phrase.
  const H4 = await p.evaluate(() => {
    const t = document.querySelector('#view [data-pf="otherPriceNote"]');
    if (!t) return null;
    t.value = '950 € la demi-journée, 1 450 € la journée.';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    return { gardee: window.__S.proForm.otherPriceNote };
  });
  ok(!!H4 && /950/.test(H4.gardee), 'la phrase tapée dans « Vos autres formules » est retenue');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
