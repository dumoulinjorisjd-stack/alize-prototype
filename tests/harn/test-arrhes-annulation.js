/* « Les arrhes sont payées au prestataire, commission déduite. En cas d'annulation il
   conserve, on choisit le montant nous-même dans la console. »

   LA RÈGLE EXISTAIT, CALIBRÉE POUR UNE HEURE DE MÉNAGE : les CGV ouvrent au prestataire,
   sur une annulation tardive, une indemnité qu'il DÉCIDE d'appliquer ; le serveur la
   prélève sur l'empreinte, Ti-Services y prend sa commission, le prestataire touche le
   net. C'est mot pour mot ce qui est demandé. Ce qui n'allait pas : « 8 heures » et
   « 50 % » étaient écrits EN DUR. On ne revend pas une journée de catamaran la veille.

   ET LE MONTANT EST DÉCIDÉ PAR LE SERVEUR, pas par le navigateur de celui qui annule. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');
const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__arrhes, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — le réglage par métier, et un défaut qui ne change rien');
  const A = await p.evaluate(() => ({
    vide: window.__arrhes.de({}, 'c_x'),
    bateau: window.__arrhes.de({ c_catamaran: { pct: 50, h: 168 } }, 'c_catamaran'),
    partiel: window.__arrhes.de({ c_x: { h: 336 } }, 'c_x'),
    abime: window.__arrhes.de({ c_x: { pct: 500, h: 3 } }, 'c_x'),
    negatif: window.__arrhes.de({ c_x: { pct: -10 } }, 'c_x'),
    zero: window.__arrhes.de({ c_x: { pct: 0 } }, 'c_x'),
    autre: window.__arrhes.de({ c_y: { pct: 30 } }, 'c_x'),
  }));
  ok(A.vide.pct === 50 && A.vide.h === 8 && A.vide.regle === false, 'un métier non réglé garde 50 % et 8 heures, comme avant');
  ok(A.bateau.pct === 50 && A.bateau.h === 168 && A.bateau.regle === true, 'un métier réglé porte sa part et son délai (7 jours)');
  ok(A.partiel.pct === 50 && A.partiel.h === 336, 'on peut ne régler QUE le délai, la part reste au défaut');
  ok(A.abime.pct === 50 && A.abime.h === 8, 'une part hors bornes et un délai hors liste retombent sur le défaut : on n’applique pas un nombre abîmé à une vraie carte');
  ok(A.negatif.pct === 50, 'un pourcentage négatif non plus');
  ok(A.zero.pct === 0 && A.zero.regle === true, 'mais ZÉRO est un réglage : « annulation toujours gratuite » se dit');
  ok(A.autre.pct === 50, 'et le réglage d’un métier ne déborde pas sur le voisin');

  console.log('B — le montant, en euros, sur les prix réels');
  const B = await p.evaluate(() => ({
    demi: window.__arrhes.montant(990, 50), jour: window.__arrhes.montant(1490, 50),
    trente: window.__arrhes.montant(1490, 30), nul: window.__arrhes.montant(1490, 0),
    centime: window.__arrhes.montant(66.65, 50),
    txt7: window.__arrhes.txt(168), txt8: window.__arrhes.txt(8),
    delais: window.__arrhes.delais().map((d) => d[0]),
  }));
  ok(B.demi === 495 && B.jour === 745, '50 % de 990 € et de 1490 € : ' + B.demi + ' € et ' + B.jour + ' €');
  ok(B.trente === 447, '30 % de 1490 € : ' + B.trente + ' €');
  ok(B.nul === 0, 'et 0 % ne retient rien');
  ok(B.centime === 33.33, 'un montant d’argent a deux décimales : ' + B.centime);
  ok(B.txt7 === '7 jours' && B.txt8 === '8 heures', 'le délai se dit en toutes lettres');
  ok(B.delais.indexOf(168) >= 0 && B.delais.indexOf(720) >= 0, 'la liste va jusqu’à 30 jours, ce qu’une sortie en mer demande');

  console.log('C — ce que l’annulation coûtera se lit AVANT de commander');
  const C = await p.evaluate(() => {
    const S = window.__S;
    S.adminArrhes = { c_catamaran: { pct: 30, h: 168 } };
    const m = { svc: 'c_catamaran' };
    return { bateau: window.__arrhes.avis(m, 1490), menage: window.__arrhes.avis({ svc: 'menage' }, 60),
      vide: window.__arrhes.avis(m, 0), gratuit: (S.adminArrhes.c_z = { pct: 0 }, window.__arrhes.avis({ svc: 'c_z' }, 500)) };
  });
  ok(/447,00/.test(C.bateau) && /7 jours/.test(C.bateau), 'la phrase donne les EUROS et le délai : ' + C.bateau.replace(/<[^>]+>/g, ''));
  ok(/30 %/.test(C.bateau), 'et la part, pour qu’on puisse refaire le calcul');
  ok(/8 heures/.test(C.menage) && /30,00/.test(C.menage), 'un métier non réglé dit sa propre règle : ' + C.menage.replace(/<[^>]+>/g, ''));
  ok(C.vide === '', 'sans rien de coché, la phrase se tait : elle annoncerait 0,00 €');
  ok(/gratuite/.test(C.gratuit) && !/restent dus/.test(C.gratuit), 'un métier à 0 % annonce une annulation gratuite, il ne promet pas une retenue nulle');

  console.log('D — la politique d’annulation d’une mission suit le métier');
  const D = await p.evaluate(() => {
    const S = window.__S; S.adminArrhes = { c_catamaran: { pct: 30, h: 168 } };
    const base = { svc: 'c_catamaran', status: 'accepted', provider: { nm: 'V' }, unit: 'forfait',
      acts: [{ id: 'a', nm: 'Jour', price: 1490, qty: 1 }], duration: 1, people: 1, rate: 0, boost: 0,
      locationMode: 'salon', zone: 'Gustavia', when: 'Aujourd’hui', slotFlex: 0 };
    const dans = (h) => { const d = new Date(Date.now() + h * 3600e3);
      return Object.assign({}, base, { dateMode: 'pick', dateISO: d.toISOString().slice(0, 10),
        slot: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }); };
    return { loin: window.__arrhes.politique(dans(24 * 10)), proche: window.__arrhes.politique(dans(24 * 2)),
      pasAccepte: window.__arrhes.politique(Object.assign({}, dans(1), { provider: null, status: 'searching' })) };
  });
  ok(D.loin.free === true, 'à dix jours du départ, l’annulation est gratuite');
  ok(D.proche.free === false && D.proche.pct === 30, 'à deux jours, la part du métier s’applique (' + D.proche.pct + ' %)');
  ok(D.proche.fee > 0, 'et elle vaut quelque chose : ' + D.proche.fee + ' €');
  ok(D.pasAccepte.free === true, 'tant que personne n’a accepté, rien n’est dû');

  console.log('E — le serveur décide du montant, pas le navigateur du client');
  ok(/arrhesPctServeur/.test(srv), 'le serveur lit lui-même la part du métier dans le catalogue');
  ok(/const assiette = round2\(Number\(after\.molliePaymentAmount\) \|\| assietteMollie/.test(srv),
    'et l’assiette est le montant RÉELLEMENT autorisé chez Mollie, écrit par le serveur');
  ok(/p\.data\.amount && p\.data\.amount\.value != null/.test(srv),
    'si ce champ manque (demande ancienne), on le DEMANDE à Mollie plutôt que de retomber sur une valeur écrite par le client');
  ok(/Indemnité nulle reqId=/.test(srv),
    'et une assiette introuvable ne capture rien : on le dit, on ne devine pas');
  ok(!/const fee = round2\(Number\(after\.cancelFee\)/.test(srv),
    '`cancelFee`, écrit par celui qui annule, n’est plus la source du prélèvement');
  ok(/cancelFeeSettled: true, cancelFee: fee, cancelFeePct: pctArrhes/.test(srv),
    'et si le client annonçait autre chose, la vraie valeur part avec l’écriture FINALE : une écriture plus tôt relancerait le déclencheur et capturerait deux fois');
  ok(/if \(assiette > 0 && fee > assiette\) fee = assiette;/.test(srv), 'jamais plus que l’empreinte posée');

  console.log('F — un enregistrement qui échoue le DIT');
  ok(/Non enregistré : vous n’êtes plus connecté/.test(html),
    'une session expirée ne laisse plus croire que le réglage est parti');
  ok(/if\(pr&&pr\.catch\)pr\.catch\(function\(e\)\{toast\(/.test(html),
    'et une écriture refusée par le serveur se dit, au lieu d’être avalée');
  ok(/toast\(L\?\('Enregistré : '\+L\[1\]\)/.test(html), 'le choix du lieu se confirme : sans un mot, on ne sait pas si le clic a porté');

  console.log('G — la version s’affiche, et elle est celle qui s’exécute');
  const V = await p.evaluate(() => window.__arrhes.version());
  const cache = (sw.match(/ti-services-v(\d+)/) || [])[1];
  ok(V === cache, 'le numéro affiché est celui du service worker : ' + V + ' / ' + cache);
  ok(/<span>Version<\/span> <span>\$\{VERSION_APP\}<\/span>/.test(html), 'il paraît au pied de chaque écran, pour toutes les personnes');
  ok(/"Version":"Vers/.test(html), 'et le MOT se traduit, le numéro restant un nombre : le pied de page se lit dans les trois langues');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
