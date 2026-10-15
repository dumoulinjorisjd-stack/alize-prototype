/* « LE PRIX AFFICHÉ DE 60 EUROS N'EST PAS LE BON. » — l'éditeur, le 15/10/2026, sur une
   demande de massage dont le catalogue annonce « 1 h relaxant · 110 € ».

   LA DEMANDE ÉCRIT BIEN SES ACTES. Ce qui manquait est la RELECTURE : l'écoute temps réel
   du client recopiait vingt champs de la demande sur sa mission — tarif, durée, zone,
   personnes, lieu — mais ni `acts` ni `options`. `totals` ne trouvait plus d'acte,
   retombait sur sa branche horaire (`tarif × durée × personnes`) et rendait le tarif de
   repli du métier.

   ET CE N'EST PAS QU'UN AFFICHAGE : le « coup de pouce » RÉÉCRIT `total` sur la demande,
   et c'est ce total que Mollie prélève. Un client qui relançait sa demande faisait donc
   tomber son prix pour de vrai, et le prestataire était payé là-dessus.

   Ce que cette épreuve tient :
   • un forfait du catalogue garde son prix après un aller-retour par la base ;
   • les options le suivent ;
   • un métier HORAIRE n'est pas touché (il n'a pas d'acte, et c'est normal) ;
   • le total RELANCÉ repart du bon prix ;
   • et une écoute qui arrive sans les actes n'efface pas ceux qu'on a déjà. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — ce que le serveur fait du montant');
/* LE PRÉLÈVEMENT LIT LE TOTAL STOCKÉ, écrit une fois à la création : il est juste, SAUF
   si un geste du client l'a réécrit depuis une mission amputée. */
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
ok(/const amount = round2\(Number\(r\.total\) \|\| 0\);/.test(SRV),
  'Mollie prélève le total STOCKÉ sur la demande, pas un total recalculé');
ok(/pushReqUpdate\(m,\{boostEur:m\.boostEur,total:t\.total,reboostedAt/.test(APP),
  'mais le coup de pouce RÉÉCRIT ce total : c’est par là que l’erreur d’affichage devenait une erreur d’argent');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  console.log('B — un forfait survit à l’aller-retour par la base');
  const r = await p.evaluate(() => {
    const S = window.__S;
    S.lang = 'fr'; S.demoMode = false; S.persona = 'client';
    S.adminPrices = { massage: 60, menage: 28 };
    S.adminPricesLus = true;
    const ACTE = { id: 'relax1h', nm: '1 h relaxant', price: 110, qty: 1 };
    const base = { id: 'massage', nm: 'Massage', rate: 60 };
    const faire = function () {
      const m = window.__newMission(base);
      m.duration = 1; m.unit = 'h'; m.people = 1; m.locationMode = 'domicile';
      return m;
    };
    const avecActe = faire(); avecActe.acts = [ACTE];
    const sansActe = faire(); sansActe.acts = null;
    /* LA RELECTURE, reproduite telle qu'elle tourne : on repart d'une mission NEUVE
       (c'est ce que fait l'écoute quand l'application a été rouverte) et l'on recopie la
       demande dessus. */
    const relu = faire();
    const demande = { acts: [ACTE], options: [], people: 1, locationMode: 'domicile',
      duration: 1, unit: 'h', rate: 60 };
    relu.duration = demande.duration; relu.unit = demande.unit; relu.rate = demande.rate;
    relu.people = demande.people; relu.locationMode = demande.locationMode;
    if (Array.isArray(demande.acts)) relu.acts = demande.acts.slice();
    if (Array.isArray(demande.options)) relu.options = demande.options.map(function (o) { return Object.assign({}, o); });
    return {
      avecActe: window.__totals(avecActe).total,
      sansActe: window.__totals(sansActe).total,
      relu: window.__totals(relu).total,
      horaire: (function () { const h = window.__newMission({ id: 'menage', nm: 'Ménage', rate: 28 });
        h.duration = 2; h.unit = 'h'; h.people = 1; h.acts = null; return window.__totals(h).total; })(),
    };
  });
  ok(r.avecActe >= 110, 'la commande d’origine vaut bien son forfait (' + r.avecActe + ' €)');
  ok(r.sansActe < r.avecActe,
    'sans acte, le calcul retombe sur l’horaire — c’était exactement le 60 € affiché (' + r.sansActe + ' €)');
  ok(r.relu === r.avecActe,
    'et après l’aller-retour par la base, le prix est le MÊME qu’à la commande (' + r.relu + ' € contre ' + r.avecActe + ' €)');
  ok(r.horaire >= 56,
    'un métier horaire n’est pas touché : il n’a pas d’acte, et c’est sa nature (' + r.horaire + ' €)');

  console.log('C — la relecture recopie bien les actes');
  /* LE BLOC B PROUVE LE CALCUL, PAS LE CHEMIN : il reconstitue la recopie. Ce qui manquait
     était une LIGNE, à un endroit précis — on la cherche donc DANS `loadActiveRequests`,
     et pas n'importe où dans le fichier : la trouver ailleurs ne prouverait rien. */
  const ECOUTE = APP.slice(APP.indexOf('function loadActiveRequests'),
    APP.indexOf('function loadActiveRequests') + 7000);
  ok(ECOUTE.length > 1000, 'on tient bien l’écoute des demandes du client');
  ok(/if\(Array\.isArray\(r\.acts\)\)m\.acts=r\.acts\.slice\(\);/.test(ECOUTE),
    'l’écoute du client recopie les prestations choisies');
  ok(/if\(Array\.isArray\(r\.options\)\)m\.options=r\.options\.map\(/.test(ECOUTE),
    'et les options, qui s’additionnent au forfait');
  /* UNE ÉCOUTE QUI ARRIVE SANS LES ACTES N'EFFACE PAS CEUX QU'ON A. Un prix qui clignote
     entre deux valeurs est pire qu'un prix qui attend. */
  ok(!/m\.acts=Array\.isArray\(r\.acts\)\?r\.acts\.slice\(\):null/.test(APP),
    'et elle ne les EFFACE pas quand la demande n’en porte pas encore');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
