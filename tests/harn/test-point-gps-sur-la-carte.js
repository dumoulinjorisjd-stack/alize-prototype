/* POSER LE POINT GPS SANS ÊTRE SUR PLACE.

   « Enregistrer le point GPS » ne savait faire qu'UNE chose : prendre la position de
   l'appareil. Il fallait donc se TROUVER à l'endroit. Or celui qui commande est rarement
   sur place : un client depuis son hôtel pour la villa qu'il loue, une conciergerie pour
   la maison de son client, quelqu'un qui prépare la venue de demain. Le point GPS étant
   OBLIGATOIRE à Saint-Barth, la commande était bloquée pour tous ceux-là.

   LA CARTE SAVAIT DÉJÀ LE FAIRE : `miniMap(g,'edit')` donne un repère qu'on glisse et une
   carte qu'on touche. Il lui manquait de pouvoir s'ouvrir SANS point de départ.

   ET LA RÈGLE QU'ON NE DÉFAIT PAS. Une ancienne version enregistrait LE CENTRE DE L'ÎLE
   dès que la position échouait, en annonçant « Point GPS enregistré » : le client croyait
   avoir pointé sa maison, le prestataire était envoyé à deux kilomètres. Ouvrir une carte
   centrée quelque part ne pose donc AUCUN point. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 2000 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps|unpkg|openstreetmap/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — le bloc est écrit UNE fois, pour les trois personnes qui en ont besoin');
  ['draft', 'addr', 'ageo'].forEach(function (t) {
    ok(new RegExp("blocPointGps\\(\\{geo:[^}]*target:'" + t + "'").test(html), 'le même bloc sert pour « ' + t + ' »');
  });
  ok((html.match(/blocPointGps\(\{/g) || []).length === 4, 'quatre emplacements, un seul code : commande (deux cas), carnet d’adresses, fiche villa');
  ok(!/data-cfg="geoloc"/.test(html), 'l’ancien bouton isolé a disparu : plus de chemin parallèle');

  console.log('B — ouvrir la carte n’enregistre RIEN');
  const B = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'client'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Client', email: 'c@x.fr' }; S.addresses = []; S.availableServices = null;
    S.customServices = []; S._posePt = '';
    S.draft = window.__newMission(window.__svc.trouve('menage'));
    S.draft.addressId = '__manual'; S.draft.geo = null; S.draft.address = 'Villa Bel Air';
    window.__render();
    const avant = { geo: S.draft.geo, bouton: !!document.querySelector('[data-act="posegps:draft"]'), carte: !!document.querySelector('[data-mapmode="pose"]') };
    const btn = document.querySelector('[data-act="posegps:draft"]'); if (btn) btn.click();
    const t = document.getElementById('view').innerText;
    return { avant: avant, apres: { geo: S.draft.geo, carte: !!document.querySelector('[data-mapmode="pose"]'), pose: S._posePt },
      txt: t, bloqueEncore: /Obligatoire/.test(t) || /Aucun point tant que/.test(t) };
  });
  ok(B.avant.bouton === true, 'le bouton « Placer sur la carte » est offert avant tout point');
  ok(B.avant.carte === false, 'la carte n’est pas ouverte d’emblée : elle prend de la place et personne ne l’a demandée');
  ok(B.apres.carte === true && B.apres.pose === 'draft', 'un clic l’ouvre');
  ok(B.apres.geo === null, 'et AUCUN point n’est enregistré : c’est exactement la faute de l’ancienne version');
  ok(/Aucun point tant que vous n’avez pas touché la carte/.test(B.txt), 'l’écran le dit, au lieu de laisser croire que c’est fait');
  ok(/on n’enregistre pas un centre d’île à votre place/.test(B.txt), 'et il dit pourquoi : la faute est nommée');

  console.log('C — le repère de pose est CREUX, et le premier geste écrit');
  ok(/data-mapmode="pose"/.test(html) && /const pose=mode==='pose'/.test(html), 'la carte connaît un mode « pose », distinct de « edit »');
  ok(/className:'pin-creux'/.test(html) && /\.pin-creux span\{[^}]*border:2\.5px dashed/.test(html),
    'son repère est creux et pointillé : plein, il affirmerait un point qui n’existe pas');
  ok(/if\(pose\)\{S\._posePt='';toast\('Point posé sur la carte'\);render\(\);\}/.test(html),
    'le premier geste — toucher la carte ou glisser le repère — écrit le point et repasse en mode normal');

  console.log('D — où la carte s’ouvre, et ce qu’on refuse de centrer');
  const D = await p.evaluate(() => {
    const C = (g, cache) => {
      try { if (cache) localStorage.setItem('ts_geo', JSON.stringify(cache)); else localStorage.removeItem('ts_geo'); } catch (_) {}
      return window.__gps.centre(g);
    };
    return {
      existant: C({ lat: 17.9, lng: -62.83 }, null),
      sansRien: C(null, null),
      cacheIle: C(null, { lat: 17.91, lng: -62.84, at: Date.now() }),
      cacheParis: C(null, { lat: 48.85, lng: 2.35, at: Date.now() }),
    };
  });
  ok(D.existant.lat === 17.9, 'un point déjà posé est le centre, évidemment');
  ok(Math.abs(D.sansRien.lat - 17.8962) < 0.001, 'sans rien, on ouvre sur Saint-Barthélemy');
  ok(Math.abs(D.cacheIle.lat - 17.91) < 0.001, 'la dernière position connue sert si elle est sur l’île');
  ok(Math.abs(D.cacheParis.lat - 17.8962) < 0.001,
    'mais commander depuis Paris ne centre pas Paris : on retombe sur l’île (' + D.cacheParis.lat + ')');

  console.log('E — « Je suis sur place » reste là, et n’a pas changé de comportement');
  ok(/Je suis sur place/.test(B.txt), 'le bouton de position existe toujours, sous un nom qui dit ce qu’il fait');
  ok(/case 'cfg-geoloc':geolocate\(/.test(html), 'et il appelle toujours la géolocalisation, inchangée');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
