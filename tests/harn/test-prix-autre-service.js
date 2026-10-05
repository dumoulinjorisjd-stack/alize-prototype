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
    milliers: window.__prix.lu('1 450'),
    deuxEspace: window.__prix.lu('1450 950'),
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
  // « 1 450 » et « 1450 950 » sont la MÊME chaîne pour qui enlève les espaces : tolérer
  // la coquette revenait à lire deux prix côte à côte comme 1 450 950 €, un montant
  // valide et faux. On refuse les deux, et on dit lequel des deux cas c'est.
  ok(!L.milliers.ok && L.milliers.cause === 'espaces', 'l’espace des milliers est refusé, et nommé');
  ok(!L.deuxEspace.ok && L.deuxEspace.valeur === 0,
    'et surtout « 1450 950 » ne devient JAMAIS 1 450 950 € (' + L.deuxEspace.valeur + ')');
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
    esp: window.__prix.avis('1 450', 'forfait'),
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
  ok(A.esp.cls === 'ko' && /sans espace/.test(A.esp.txt), 'l’espace a sa phrase à lui (« ' + A.esp.txt + ' »)');
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

  console.log('\nI — la case n’accepte que des chiffres, et ne fabrique aucun prix');
  // « C'est un défaut de notre part, on devrait uniquement pouvoir mettre des chiffres. »
  // On tape caractère par caractère, comme un doigt sur un clavier.
  const frapper = (txt) => p.evaluate((t) => {
    const el = document.querySelector('#view [data-pf="otherPrice"]');
    if (!el) return null;
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
    for (const c of t) { el.value = el.value + c; el.dispatchEvent(new Event('input', { bubbles: true })); }
    const a = document.getElementById('autrePrixAvis');
    return { champ: el.value, garde: window.__S.proForm.otherPrice,
      avis: a ? a.textContent : '', rouge: a ? /coral/.test(a.style.color) : false };
  }, txt);
  const I1 = await frapper('1450');
  ok(!!I1 && I1.champ === '1450' && I1.garde === '1450', 'un nombre s’inscrit normalement');
  const I2 = await frapper('1450€ la journee');
  ok(!!I2 && !/[a-zA-Z€]/.test(I2.champ),
    'aucune lettre ni symbole ne s’inscrit (« ' + (I2 ? I2.champ : '—') + ' »)');
  const I2b = await p.evaluate(() => window.__prix.lu(window.__S.proForm.otherPrice));
  ok(I2b.ok && I2b.valeur === 1450, 'et ce qu’il reste se lit 1450, sans ambiguïté (' + I2b.valeur + ')');
  // LE PIÈGE DU FILTRE, trouvé par cette épreuve : refuser l'espace caractère par
  // caractère faisait que « 1450 950 » tapé au doigt s'inscrivait « 1450950 » — le filtre
  // reconstruisait le prix faux qu'il devait empêcher. L'espace reste donc admis À
  // L'ÉCRAN, et c'est la lecture qui refuse.
  const I3 = await frapper('1450 950');
  ok(!!I3 && I3.champ === '1450 950',
    'ce qui est tapé s’affiche tel quel, rien n’est recollé (« ' + (I3 ? I3.champ : '—') + ' »)');
  ok(!!I3 && I3.rouge && /sans espace/.test(I3.avis),
    'et c’est refusé, avec sa raison (« ' + (I3 ? I3.avis.slice(0, 70) : '—') + '… »)');
  const I3b = await p.evaluate(() => window.__prix.lu(window.__S.proForm.otherPrice).valeur);
  ok(I3b === 0, 'aucun prix n’en sort : surtout pas 1 450 950 € (' + I3b + ')');
  const I4 = await frapper('37,50');
  ok(!!I4 && I4.champ === '37,50', 'la virgule décimale passe (' + (I4 ? I4.champ : '—') + ')');
  // Le collage : l'autre façon d'arriver, et la plus dangereuse.
  const I5 = await p.evaluate((v) => {
    const el = document.querySelector('#view [data-pf="otherPrice"]');
    el.value = '1450'; el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));   // collage
    const a = document.getElementById('autrePrixAvis');
    return { champ: el.value, garde: window.__S.proForm.otherPrice,
      avis: a ? a.textContent : '', rouge: a ? /coral/.test(a.style.color) : false };
  }, VRAIE);
  ok(I5.champ === '1450' && I5.garde === '1450',
    'une phrase collée est refusée ENTIÈRE, la case garde sa dernière valeur bonne');
  ok(/seul nombre/i.test(I5.avis) && I5.rouge,
    'et l’avis dit ce qui vient d’être écarté, au lieu d’un vert rassurant (« ' + I5.avis.slice(0, 60) + '… »)');

  console.log('\nJ — « Autre » seul suffit : aucun métier du catalogue n’est imposé');
  const J = await p.evaluate((d) => {
    const f = { name: 'Skipper SAS', phone: '0690112233', siret: '12345678901234',
      address: 'Gustavia', birth: '1980-01-01', cats: ['autre'], otherService: d.sv,
      otherPrice: '1450', otherUnit: 'forfait', mandat: true, cgu: true, charte: true,
      insuranceNone: true, authed: true, googleAuth: true };
    return { etape: window.__assur.etapes(f).find((x) => x.id === 'svc').done,
      complet: window.__assur.complet(f), manque: window.__assur.manque(f) };
  }, { sv: SERVICE });
  ok(J.etape === true, 'l’étape « Métiers & tarifs » est franchie avec « Autre » pour seul métier');
  ok(J.complet === true && J.manque.length === 0,
    'et le dossier entier est complet, sans rien cocher d’autre (' + JSON.stringify(J.manque) + ')');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
