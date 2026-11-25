/* MAQUETTE — CHARTE GRAPHIQUE (l'éditeur, 25/11/2026).
 * « Il faut qu'on définisse une charte graphique […] pour éviter d'avoir des écrans avec
 * plein de hauteurs de texte différentes, des boutons qui ne se ressemblent pas forcément
 * et des couleurs pas identiques. »
 * Aucun code de l'app n'est modifié. Deux sorties :
 *   1. charte-planche.png : la charte proposée (texte, graisses, couleurs, arrondis, boutons) ;
 *   2. charte-<écran>.png : avant / après sur quatre écrans RÉELS. L'« après » est l'écran
 *      rendu, sur lequel on applique la charte (chaque taille, graisse, arrondi, couleur et
 *      bouton ramené à la valeur de la charte la plus proche). Sous chaque image, le compte
 *      de ce que l'écran AFFICHE vraiment (valeurs calculées par le navigateur).
 *   RACINE=/home/user/alize-prototype node outils/maquette/charte.js */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

/* LA CHARTE PROPOSÉE — une seule source pour la planche et pour l'« après ». */
const CHARTE = {
  tailles: [
    { px: 30, nom: 'Titre d’écran', g: 800, ex: 'Vos demandes' },
    { px: 22, nom: 'Montant principal', g: 800, ex: '95,20 €' },
    { px: 18, nom: 'Intertitre', g: 700, ex: 'Ménage · Gustavia' },
    { px: 16, nom: 'Bouton, champ', g: 700, ex: 'Confirmer la commande' },
    { px: 14, nom: 'Texte courant', g: 400, ex: 'Montant net versé après chaque passage.' },
    { px: 12, nom: 'Mention, pastille', g: 700, ex: 'RÉSERVATIONS · Artisan trouvé' },
  ],
  graisses: [{ v: 400, nom: 'Normal' }, { v: 700, nom: 'Gras' }, { v: 800, nom: 'Titre' }],
  // [variable de l'app, nom de la charte, usage]
  couleurs: [
    ['--ink', 'Encre', 'textes, titres'], ['--ink-soft', 'Encre douce', 'texte secondaire'], ['--muted', 'Gris', 'mentions'],
    ['--hair', 'Filet', 'bordures, séparateurs'], ['--sand', 'Sable', 'fond d’écran'], ['--sand-2', 'Sable foncé', 'fond de zone'],
    ['--card', 'Carte', 'fond des cartes'], ['--teal', 'Corail', 'action, bouton principal'], ['--teal-deep', 'Corail profond', 'liens, montants'],
    ['--teal-wash', 'Corail pâle', 'bandeau, pastille'], ['--coral', 'Rouge', 'danger, erreur'], ['--coral-wash', 'Rouge pâle', 'alerte'],
    ['--good', 'Vert', 'fait, payé'], ['--good-wash', 'Vert pâle', 'pastille « fait »'], ['--warn', 'Ambre', 'attention'],
  ],
  rayons: [{ px: 12, nom: 'Petit', us: 'boutons, champs, bandeaux' }, { px: 18, nom: 'Carte', us: 'cartes, feuilles' }, { px: 999, nom: 'Pastille', us: 'pastilles, avatars' }],
};

const css = `
.ch{font-family:var(--f-body);color:var(--ink);background:var(--sand);padding:22px 18px 30px;width:390px;box-sizing:border-box}
.ch h2{font:800 12px/1 var(--f-body);letter-spacing:.09em;text-transform:uppercase;color:var(--teal-deep);margin:26px 0 12px}
.ch h2:first-of-type{margin-top:6px}
.ch .t{display:flex;align-items:baseline;gap:12px;padding:8px 0;border-bottom:1px solid var(--hair)}
.ch .t .n{flex:none;width:58px;font:700 12px var(--f-num);color:var(--muted)}
.ch .t .x{flex:1;min-width:0;line-height:1.2}
.ch .t .u{display:block;font:400 12px var(--f-body);color:var(--muted);margin-top:3px}
.ch .sw{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ch .sw div{display:flex;gap:9px;align-items:center;font-size:12px;line-height:1.25}
.ch .sw i{flex:none;width:34px;height:34px;border-radius:12px;border:1px solid var(--hair)}
.ch .sw b{display:block;font-size:14px;font-weight:700}
.ch .ra{display:flex;gap:10px}
.ch .ra div{flex:1;text-align:center;font-size:12px;color:var(--muted)}
.ch .ra i{display:block;height:54px;background:var(--card);border:1.5px solid var(--teal);margin-bottom:6px}
.ch .ra b{display:block;color:var(--ink);font-size:14px}
.ch .b{display:flex;align-items:center;justify-content:center;width:100%;border-radius:12px;font:700 16px var(--f-body);height:52px;box-sizing:border-box;border:0}
.ch .b.p{background:linear-gradient(180deg,var(--teal),var(--teal-deep));color:#fff}
.ch .b.s{background:var(--card);border:1.5px solid var(--hair);color:var(--ink)}
.ch .b.c{height:44px;font-size:14px;width:auto;padding:0 18px}
.ch .lk{display:inline-flex;align-items:center;min-height:44px;font:700 14px var(--f-body);color:var(--teal-deep);text-decoration:underline;text-underline-offset:3px}
.ch .lk.d{color:var(--coral)}
.ch .lg{font-size:12px;color:var(--muted);margin:4px 0 12px}
.ch .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ch .pa{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;font:700 12px var(--f-body)}
.ch .card{background:var(--card);border:1px solid var(--hair);border-radius:18px;padding:16px}
.ch .bd{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:12px;font-size:14px;font-weight:700;margin-top:8px}
`;

function planche() {
  const T = CHARTE.tailles.map((t) => `<div class="t"><span class="n">${t.px} px</span><span class="x" style="font-size:${t.px}px;font-weight:${t.g}${t.px === 12 ? ';letter-spacing:.06em' : ''}">${t.ex}<span class="u">${t.nom} · ${t.g === 800 ? 'titre' : t.g === 700 ? 'gras' : 'normal'}</span></span></div>`).join('');
  const G = `<div class="row" style="gap:18px;font-size:18px">${CHARTE.graisses.map((g) => `<span style="font-weight:${g.v}">${g.nom}</span>`).join('')}</div>`;
  const C = `<div class="sw">${CHARTE.couleurs.map(([v, n, u]) => `<div><i style="background:var(${v})"></i><span><b>${n}</b>${u}</span></div>`).join('')}</div>`;
  const R = `<div class="ra">${CHARTE.rayons.map((r) => `<div><i style="border-radius:${r.px}px${r.px === 999 ? ';height:34px;margin:10px 0 16px' : ''}"></i><b>${r.nom}</b>${r.us}</div>`).join('')}</div>`;
  const B = `<button class="b p">Confirmer la commande</button><p class="lg">Principal · 52 px · un seul par écran</p>
    <button class="b s">Mettre en pause</button><p class="lg">Secondaire · 52 px</p>
    <div class="row"><button class="b p c">Accepter</button><button class="b s c">Refuser</button></div><p class="lg">Compact · 44 px · dans une carte ou une liste</p>
    <div class="row" style="gap:22px"><a class="lk">Voir le détail</a><a class="lk d">Supprimer</a></div><p class="lg">Lien · 44 px de cible · rouge s’il détruit</p>`;
  const K = `<div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:18px">Ménage</b><span class="pa" style="background:var(--good-wash);color:var(--good)">Artisan trouvé</span></div>
    <div style="font-size:14px;color:var(--muted);margin-top:4px">mer. 2 déc. · 08:00 · Gustavia</div>
    <div class="bd" style="background:var(--teal-wash);color:var(--teal-deep)">Récurrente · chaque semaine</div>
    <div class="bd" style="background:var(--coral-wash);color:var(--coral-deep)">Paiement refusé par la banque</div>
    <div class="row" style="margin-top:10px"><span class="pa" style="background:var(--teal-wash);color:var(--teal-deep)">En attente</span><span class="pa" style="background:var(--coral-wash);color:var(--coral-deep)">Annulée</span><span class="pa" style="background:var(--sand-2);color:var(--ink-soft)">Terminée</span></div></div>
    <p class="lg">Carte · bandeau info (corail pâle) · bandeau alerte (rouge pâle) · pastilles</p>`;
  return `<div class="ch"><h2>Texte · 6 tailles</h2>${T}<h2>Graisses · 3</h2>${G}<h2>Couleurs · ${CHARTE.couleurs.length}</h2>${C}<h2>Arrondis · 3</h2>${R}<h2>Boutons · 3 sortes</h2>${B}<h2>Cartes, bandeaux, pastilles</h2>${K}</div>`;
}

/* Ce que l'écran AFFICHE : valeurs calculées, éléments visibles avec du texte ou un fond. */
function releve(racineSel) {
  const R = document.querySelector(racineSel) || document.body;
  const tailles = new Set(), graisses = new Set(), couleurs = new Set(), rayons = new Set(), boutons = new Set();
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const e of R.querySelectorAll('*')) {
    if (!visible(e) || e.closest('svg')) continue;
    const s = getComputedStyle(e);
    const texte = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (texte) { tailles.add(s.fontSize); graisses.add(s.fontWeight); couleurs.add(s.color); }
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') couleurs.add(s.backgroundColor);
    const rr = parseFloat(s.borderTopLeftRadius); const r = e.getBoundingClientRect();
    if (rr > 0 && !(rr >= Math.min(r.width, r.height) / 2)) rayons.add(Math.round(rr));
    if (e.tagName === 'BUTTON' && !e.classList.contains('card') && !e.closest('nav,.tabbar')) {
      boutons.add([s.backgroundImage !== 'none' ? 'dégradé' : s.backgroundColor, s.borderTopWidth, Math.round(rr), s.fontSize, Math.round(r.height), s.textDecorationLine].join('|'));
    }
  }
  return { tailles: tailles.size, graisses: graisses.size, couleurs: couleurs.size, rayons: rayons.size, boutons: boutons.size };
}

/* La charte posée par-dessus l'écran rendu. */
function appliquer(arg) {
  const { racineSel, tailles, rayons, vars } = arg;
  const R = document.querySelector(racineSel) || document.body;
  const rs = getComputedStyle(document.documentElement);
  const rgb = (c) => { const m = String(c).match(/\d+(\.\d+)?/g); return m ? m.map(Number) : null; };
  const palette = vars.map((v) => { const d = document.createElement('i'); d.style.color = rs.getPropertyValue(v).trim(); document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return rgb(c); }).filter(Boolean);
  palette.push([255, 255, 255]);
  const proche = (c) => { const x = rgb(c); if (!x || (x.length > 3 && x[3] < 1)) return null; let best = null, bd = 1e9;
    for (const p of palette) { const d = (p[0] - x[0]) ** 2 + (p[1] - x[1]) ** 2 + (p[2] - x[2]) ** 2; if (d < bd) { bd = d; best = p; } }
    return bd === 0 ? null : (bd < 60 * 60 * 3 ? 'rgb(' + best.join(',') + ')' : null); };
  const snap = (v, liste) => liste.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) || (Math.abs(b - v) === Math.abs(a - v) && b > a)) ? b : a);
  const els = [...R.querySelectorAll('*')].filter((e) => !e.closest('svg'));
  const lu = els.map((e) => ({ e, s: getComputedStyle(e), r: e.getBoundingClientRect() }));
  for (const { e, s, r } of lu) {
    const st = e.style;
    st.setProperty('font-size', snap(parseFloat(s.fontSize), tailles) + 'px', 'important');
    const g = +s.fontWeight; st.setProperty('font-weight', g < 550 ? '400' : (g <= 760 ? '700' : '800'), 'important');
    const rr = parseFloat(s.borderTopLeftRadius);
    if (rr > 0 && !(rr >= Math.min(r.width, r.height) / 2 - 1)) st.setProperty('border-radius', (rr >= 30 ? 999 : (e.classList.contains('card') || rr >= 17 ? rayons[1] : rayons[0])) + 'px', 'important');
    const c1 = proche(s.color); if (c1) st.setProperty('color', c1, 'important');
    if (s.backgroundImage === 'none') { const c2 = proche(s.backgroundColor); if (c2) st.setProperty('background-color', c2, 'important'); }
    if (parseFloat(s.borderTopWidth) > 0) { const c3 = proche(s.borderTopColor); if (c3) st.setProperty('border-color', c3, 'important'); }
  }
  // Boutons : trois sortes. Plein → principal ; bordé ou fond clair → secondaire ; sans fond → lien.
  for (const { e, s, r } of lu) {
    if (e.tagName !== 'BUTTON' || e.classList.contains('card') || e.closest('nav,.tabbar,.seg-group') || e.classList.contains('seg') || e.classList.contains('chip') || e.classList.contains('banner')) continue;
    if (e.textContent.trim().length <= 2) continue;                 // « − », « + », une icône : ce n'est pas un bouton à texte
    if (e.querySelector('.card,.row.between')) continue;            // une rangée cliquable reste une rangée
    const st = e.style; const plein = s.backgroundImage !== 'none';
    const sansFond = !plein && s.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(s.borderTopWidth) === 0;
    if (sansFond) { if (r.height < 60 && !e.querySelector('svg:only-child')) { st.setProperty('font-size', '14px', 'important'); st.setProperty('font-weight', '700', 'important'); } continue; }
    if (r.width < 48 && r.height < 48) continue;                     // pastille ronde, icône
    const compact = r.height < 50 || r.width < 300;
    st.setProperty('min-height', compact ? '44px' : '52px', 'important'); st.setProperty('height', 'auto', 'important');
    st.setProperty('border-radius', '12px', 'important');
    st.setProperty('font-size', compact ? '14px' : '16px', 'important'); st.setProperty('font-weight', '700', 'important');
    if (!plein) { st.setProperty('background', 'var(--card)', 'important'); st.setProperty('border', '1.5px solid var(--hair)', 'important'); st.setProperty('color', 'var(--ink)', 'important'); }
  }
}

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-11-25T14:00:00Z') });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  const charger = async () => {
    await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
    await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
    await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}*{transition:none!important}' });
  };

  // 1. LA PLANCHE (variables de couleur et polices de l'app)
  await charger();
  await p.addStyleTag({ content: css });
  await p.evaluate((h) => { document.body.innerHTML = h; document.body.style.background = 'var(--sand)'; document.body.style.margin = '0'; }, planche());
  await (await p.$('.ch')).screenshot({ path: path.join(SORTIE, 'charte-planche.png') });

  // 2. AVANT / APRÈS sur quatre écrans réels
  const base = (persona) => p.evaluate((persona) => {
    window.__setFB({ auth: { currentUser: { uid: persona === 'pro' ? 'u0' : (persona === 'admin' ? 'a' : 'c1'), email: persona === 'admin' ? 'contact@ti-services.fr' : 'x@e.fr' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), updateDoc: () => Promise.resolve(), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = persona; S.mission = null; S.draft = null;
    S.proStatus = 'valide'; S.proName = 'Karla Barbosa';
    S.account = { name: persona === 'pro' ? 'Karla' : (persona === 'admin' ? 'Admin' : 'Laure'), email: 'x@e.fr', uid: persona === 'pro' ? 'u0' : 'c1', role: persona };
  }, persona);
  const ecrans = [
    ['commande', 'Commande (client)', async () => { await base('client'); await p.evaluate(() => { const S = window.__S; S.draft = window.__newMission(window.__svc.trouve('menage')); S.clientNav = 'home'; window.__render(); }); }],
    ['reservations', 'Réservations (client)', async () => { await base('client'); await p.evaluate(() => { const S = window.__S;
      S.series = { S1: { id: 'S1', recurrence: { rythme: 'semaine', jours: [3, 6], debut: '2026-11-25' }, serieEtat: 'active', svc: 'menage', svcName: 'Ménage', providerName: 'Karla Barbosa', slot: '08:00', status: 'paid' } };
      const mk = (id, d, st, w) => Object.assign(window.__newMission(window.__svc.trouve('menage')), { _id: 'm' + id, reqId: id, serieId: 'S1', status: st, dateISO: d, when: w, slot: '08:00', zone: 'Gustavia', provider: { nm: 'Karla Barbosa', ini: 'KB' }, providerUid: st === 'declined' ? null : 'u0', duration: 4, rate: 28 });
      S.missions = [mk('S1-2026-12-02', '2026-12-02', 'accepted', 'Mer. 2 déc.'), mk('S1-2026-12-05', '2026-12-05', 'declined', 'Sam. 5 déc.')]; S.clientNav = 'wallet'; window.__render(); }); }],
    ['fiche-pro', 'Demande vue par le prestataire', async () => { await base('pro'); await p.evaluate(() => { const S = window.__S; S.proNav = 'home';
      S.openRequests = [{ id: 'R1', status: 'pending', service: 'menage', serviceName: 'Ménage', clientUid: 'c1', clientName: 'Laure', when: 'Mer. 2 déc.', dateISO: '2026-12-02', slot: '08:00', zone: 'Gustavia', unit: 'h', duration: 4, rate: 28, total: 112, recurrence: { rythme: 'semaine', jours: [3, 6], debut: '2026-12-02' } }];
      S.proReqView = 'R1'; window.__render(); }); }],
    ['console', 'Console (admin)', async () => { await base('admin'); await p.evaluate(() => { const S = window.__S;
      S.adminBookings = []; S.adminClients = []; S.adminArtsLoaded = true; S.adminClisLoaded = true;
      S.adminArtisans = [{ id: 'u2', uid: 'u2', real: true, name: 'Karla Barbosa', status: 'valide', cats: ['menage'], skipAt: {}, vueAt: {} }];
      S.adminReqs = [{ id: 'r1', uid: 'c1', at: Date.now() - 18 * 3600000, svc: 'menage', svcName: 'Ménage', when: 'Mer. 25 nov.', dateISO: '2026-11-25', slot: '08:00', acceptedSlot: '', status: 'accepted',
        zone: 'Cul-de-Sac · Toiny', total: 112, unit: 'h', duration: 4, client: 'Cécile', provider: 'Karla Barbosa', providerUid: 'u2', directed: false, boostEur: 0,
        diff: { motif: 'envoyee', cibles: 1, push: 1, mail: 0, at: Date.now() - 18 * 3600000 }, prevenus: ['u2'], invites: [], canaux: { u2: 'push' }, etapesAt: { accepted: Date.now() - 17 * 3600000 }, complementStatus: '' }];
      S.adminReqsLus = true; S.admin = { view: 'home' }; S._admCmdStat = { accepted: true }; S._admCmdMet = { 'accepted|menage': true };
      S._fold = { 'a-bookings': true, 'a-cmd-toutes': true, 'cmd-ouvre-r1': true }; window.__render(); }); }],
  ];
  const vars = CHARTE.couleurs.map((c) => c[0]).concat(['--coral-deep', '--teal-deep']);
  const bilan = [];
  for (const [id, titre, preparer] of ecrans) {
    const images = {}, mesures = {};
    for (const quand of ['avant', 'apres']) {
      await charger(); await preparer(); await p.clock.runFor(300);
      await p.evaluate(() => window.scrollTo(0, 0));
      if (quand === 'apres') await p.evaluate(appliquer, { racineSel: '#view', tailles: CHARTE.tailles.map((t) => t.px), rayons: [12, 18], vars });
      mesures[quand] = await p.evaluate(releve, '#view');
      images[quand] = (await p.screenshot({ clip: { x: 0, y: 0, width: 390, height: 1100 } })).toString('base64');
    }
    bilan.push([titre, mesures]);
    const ligne = (m) => `${m.tailles} tailles · ${m.graisses} graisses · ${m.couleurs} couleurs · ${m.rayons} arrondis · ${m.boutons} formes de bouton`;
    const comp = await (await b.newContext({ viewport: { width: 820, height: 1240 }, deviceScaleFactor: 2 })).newPage();
    await comp.setContent(`<body style="margin:0;background:#EDE6E1;font:14px -apple-system,system-ui,sans-serif;color:#231E33;padding:14px">
      <div style="font-weight:800;font-size:18px;margin:0 0 10px">${titre}</div><div style="display:flex;gap:12px">
      ${['avant', 'apres'].map((q) => `<div style="width:390px"><div style="font-weight:700;margin-bottom:6px">${q === 'avant' ? 'Aujourd’hui (v945)' : 'Avec la charte'}</div>
        <img style="width:390px;display:block;border-radius:12px;border:1px solid #d9cfc8" src="data:image/png;base64,${images[q]}">
        <div style="font-size:12px;margin-top:6px;color:#4E4757">${ligne(mesures[q])}</div></div>`).join('')}</div></body>`);
    await comp.screenshot({ path: path.join(SORTIE, 'charte-' + id + '.png'), fullPage: true });
    await comp.context().close();
  }
  console.log(JSON.stringify(bilan, null, 0));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
