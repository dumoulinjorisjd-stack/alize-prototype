/* TROIS NIVEAUX, PAS QUATRE BOUTONS IDENTIQUES.
   Sur l'écran d'une mission en cours, « Appeler », « Contacter le client par messagerie »,
   « Ajouter à mon calendrier » et « Contacter Ti-Services (support) » avaient exactement le
   même poids visuel — quatre cartes empilées, même taille, même bordure. Or ils ne servent
   pas au même moment : joindre l'autre partie est le geste courant, sur place, une main sur
   le volant ; le support est l'extrême recours. Les mettre au même rang banalise l'appel au
   support et noie le bouton qu'on cherche vraiment. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

console.log('A — un seul bloc, partagé par les deux côtés');
ok(/function blocContact\(o\)/.test(src), 'le bloc de contact est écrit une fois');
ok((src.match(/blocContact\(\{/g) || []).length === 2,
  'et sert au prestataire comme au client — pas un écran soigné et l’autre oublié');
ok(!/Contacter le client par messagerie<\/button>/.test(src),
  'les quatre boutons de même poids ont disparu');

console.log('B — sur l’écran réel du prestataire');
(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({locale: 'fr-FR', viewport: {width: 390, height: 1600}});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX, {waitUntil: 'load'});
  await p.waitForTimeout(1400);

  const mesures = await p.evaluate(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.onboarded = true; S.guest = false; S.persona = 'pro'; S.lang = 'fr';
    S.demoMode = false; S.proNav = 'home'; S.proStatus = 'approved'; S.proName = 'Laureguyon';
    S.proMollieCanWork = true; S.proMollieOrgId = 'org_1'; S.proMollieStatus = 'active'; S.proMollieOnb = 'completed';
    S.mission = {reqId: 'r1', _id: 'pm1', status: 'accepted', svc: 'menage', svcName: 'Ménage',
      when: 'Aujourd’hui', slot: '14:00', duration: 2, unit: 'h', rate: 35, zone: 'Gustavia', tip: 0,
      clientName: 'Joris Dumoulin', clientPhone: '+590690112233',
      clientAccepted: true, proAccepted: true, accepted: true,
      address: 'Villa Bleue, Gustavia', geo: {lat: 17.89537, lng: -62.8498},
      chat: [{}], support: {pro: []}};
    S.proMissions = [S.mission];
    window.__render();
    const q = (s) => document.querySelector(s);
    const aire = (el) => { if (!el) return 0; const r = el.getBoundingClientRect(); return Math.round(r.width * r.height); };
    const tel = q('a[href^="tel:"]');
    const msg = q('[data-act="open-chat"]');
    const ics = q('[data-act="mission-ics"]');
    const sup = q('[data-act="open-support"]');
    const rTel = tel && tel.getBoundingClientRect();
    const rMsg = msg && msg.getBoundingClientRect();
    return {
      texte: (q('.phone') || document.body).innerText.replace(/\s+/g, ' '),
      aTel: aire(tel), aMsg: aire(msg), aIcs: aire(ics), aSup: aire(sup),
      memeLigne: !!(rTel && rMsg && Math.abs(rTel.top - rMsg.top) < 4),
      supY: sup ? Math.round(sup.getBoundingClientRect().top) : 0,
      telY: rTel ? Math.round(rTel.top) : 0,
      icsY: ics ? Math.round(ics.getBoundingClientRect().top) : 0,
      supTaille: sup ? parseFloat(getComputedStyle(sup).fontSize) : 0,
      msgTaille: msg ? parseFloat(getComputedStyle(msg).fontSize) : 0,
      supBalise: sup ? sup.className : '',
      msgBalise: msg ? msg.className : '',
      large: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    };
  });

  ok(/LE CLIENT/i.test(mesures.texte), 'les deux façons de joindre le client sont réunies sous un titre');
  ok(mesures.memeLigne, 'Appeler et Message sont côte à côte, pas empilés');
  ok(mesures.aTel > 0 && mesures.aMsg > 0, 'les deux sont bien de vrais boutons');
  ok(Math.abs(mesures.aTel - mesures.aMsg) < 900, 'de même poids entre eux — aucun des deux n’est prioritaire');

  ok(mesures.aIcs > 0 && mesures.telY < mesures.icsY,
    'l’agenda reste un bouton ordinaire, seul, sous le bloc du client');
  ok(mesures.icsY < mesures.supY, 'et il passe AVANT le support');

  ok(/Un problème \? Contacter Ti-Services/.test(mesures.texte),
    'le support est reformulé : on ne le contacte pas pour rien');
  ok(mesures.aSup > 0 && mesures.aSup < mesures.aIcs / 2,
    'il occupe moins de la moitié de la place d’un bouton ordinaire (' + mesures.aSup + ' contre ' + mesures.aIcs + ')');
  ok(mesures.supTaille < mesures.msgTaille,
    'son texte est plus petit (' + mesures.supTaille + ' contre ' + mesures.msgTaille + ')');
  ok(/linklike/.test(mesures.supBalise) && /btn/.test(mesures.msgBalise),
    'et ce n’est plus un bouton mais un lien — la forme dit déjà le rang');
  ok(mesures.large, 'rien ne déborde de l’écran d’un iPhone');

  console.log('C — côté client, le même traitement');
  const cli = await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'client'; S.clientNav = 'wallet';
    S.account = {name: 'Joris Dumoulin', email: 'j@e.fr', zone: 'Gustavia', phone: '+590690112233'};
    S.mission = {reqId: 'r2', status: 'accepted', svc: 'menage', svcName: 'Ménage',
      when: 'Aujourd’hui', slot: '14:00', duration: 2, unit: 'h', rate: 35, zone: 'Gustavia', tip: 0,
      clientAccepted: true, proAccepted: true, accepted: true, providerPhone: '+590690445566',
      provider: {nm: 'Laure G.', ini: 'LG', jobs: 3}, chat: [], support: {client: []}};
    S.missions = [S.mission];
    window.__render();
    const sup = document.querySelector('[data-act="open-support"]');
    return {
      texte: (document.querySelector('.phone') || document.body).innerText.replace(/\s+/g, ' '),
      lien: sup ? sup.className : '',
    };
  });
  ok(/VOTRE PRESTATAIRE/i.test(cli.texte), 'le client aussi a ses deux gestes réunis sous un titre');
  ok(/Un problème \? Contacter Ti-Services/.test(cli.texte), 'et le même support discret');
  ok(/linklike/.test(cli.lien), 'en lien, pas en bouton');

  const vrais = errs.filter((e) => !/net::ERR|Failed to load|firebase|firestore|ERR_FAILED/i.test(e));
  ok(vrais.length === 0, 'aucune erreur JS (' + vrais.join(' | ').slice(0, 150) + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
