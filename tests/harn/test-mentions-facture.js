/* LES MENTIONS DE LA FACTURE (l'éditeur, 25/11/2026 : « Oui corrige les factures »).
   Fiche Service Public F31808 (vérifiée le 11/08/2026) : nom de l'entrepreneur individuel
   suivi de « EI » (C. com. R526-27), date de la prestation (fin d'exécution), numéro
   unique d'une séquence continue — donc jamais fabriqué.
   + « quand il rentre son SIRET, toutes ces informations se mettent automatiquement » ;
     « mettre les profils à jour depuis le SIRET et depuis la console ».
   A. noyaux (functions/mentions-facture.js, functions/fiche-sirene.js)
   B. le PDF du serveur
   C. le miroir de l'écran dit la même chose que le noyau
   D. la facture du client à l'écran
   E. le profil : carte « adresse incomplète », écart Sirene, Appliquer
   F. la console : Mettre à jour depuis le SIRET */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const INDEX = 'file://' + path.join(RACINE, 'tests', 'harn', 'app.html');
const MF = require(path.join(RACINE, 'functions', 'mentions-facture.js'));
const FS = require(path.join(RACINE, 'functions', 'fiche-sirene.js'));
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

// 25 novembre 2026 à 22 h à Saint-Barthélemy = 26 novembre 02:00 UTC
const FIN_22H = Date.UTC(2026, 10, 26, 2, 0);

console.log('A — noyaux');
ok(MF.nomPrestataire({ legal: 'Karla Barbosa', statusType: 'micro' }) === 'Karla Barbosa EI', 'micro-entrepreneur : « Karla Barbosa EI »');
ok(MF.nomPrestataire({ legal: 'Paul Hodge', statusType: 'entreprise', legalForm: 'EI' }) === 'Paul Hodge EI', 'forme « EI » déclarée : suffixe EI');
ok(MF.nomPrestataire({ legal: 'Karla Barbosa EI', statusType: 'micro' }) === 'Karla Barbosa EI', 'jamais deux fois « EI »');
ok(MF.nomPrestataire({ legal: 'Jardins du Lagon', statusType: 'entreprise', legalForm: 'SARL' }) === 'Jardins du Lagon', 'une société ne prend pas « EI »');
ok(MF.datePrestationISO({ doneProAtMs: FIN_22H, dateISO: '2026-11-24' }) === '2026-11-25', 'fin à 22 h sur l’île : le 25, pas le 26 (heure de Saint-Barthélemy)');
ok(MF.datePrestationISO({ dateISO: '2026-11-24' }) === '2026-11-24', 'sans fin pointée : le jour prévu');
ok(MF.dateFrLongue('2026-11-25') === '25 novembre 2026', 'date longue en français');
ok(!MF.adresseComplete('Jean bart') && MF.adresseComplete('Gustavia, 97133 Saint-Barthélemy') && MF.adresseComplete('Rue Jean Bart, Saint-Barth'), 'adresse complète = code postal ou commune');
const lp = MF.lignesPrestataire({ statusType: 'entreprise', legalForm: 'SARL', capital: '1000', rcsCity: 'Basse-Terre', siret: '12345678900012', address: 'Lorient, 97133 Saint-Barthélemy' }, (n) => n.toFixed(2).replace('.', ',') + ' €');
ok(lp.join(' | ') === 'SARL au capital de 1000,00 € | Lorient, 97133 Saint-Barthélemy | SIRET 12345678900012 | RCS Basse-Terre 123456789', 'société : forme, capital, adresse, SIRET, RCS (format inchangé)');

const sirene = (o) => ({ results: [Object.assign({ siren: '912345678', nom_raison_sociale: null, nom_complet: 'KARLA BARBOSA', statut_diffusion: 'O', nature_juridique: '1000', etat_administratif: 'A',
  complements: { est_entrepreneur_individuel: true },
  siege: { siret: '91234567800011', adresse: 'ANCIENNE ADRESSE 97133 SAINT-BARTHELEMY', code_postal: '97133', libelle_commune: 'SAINT-BARTHELEMY', etat_administratif: 'F', statut_diffusion_etablissement: 'O' },
  matching_etablissements: [{ siret: '91234567800029', adresse: 'RUE JEAN BART 97133 SAINT-BARTHELEMY', code_postal: '97133', libelle_commune: 'SAINT-BARTHELEMY', etat_administratif: 'A', statut_diffusion_etablissement: 'O' }] }, o)] });
let fi = FS.ficheDepuisSirene(sirene(), '912 345 678 00029');
ok(fi.trouve && fi.estEI && fi.adresse === 'RUE JEAN BART 97133 SAINT-BARTHELEMY' && fi.ouvert, 'l’adresse est celle de l’ÉTABLISSEMENT du SIRET saisi, pas celle du siège fermé');
ok(fi.nom === 'KARLA BARBOSA', 'le nom vient du répertoire');
ok(!FS.ficheDepuisSirene(sirene({ statut_diffusion: 'P' }), '91234567800029').adresse, 'non diffusible : aucune adresse reprise');
ok(FS.ficheDepuisSirene(sirene(), '91234567800011').ouvert === false, 'établissement fermé : dit');
ok(!FS.ficheDepuisSirene({ results: [] }, '91234567800029').trouve, 'introuvable : dit');
ok(FS.ficheDepuisSirene(sirene({ nature_juridique: '5710', complements: { est_entrepreneur_individuel: false } }), '91234567800029').formeJuridique === 'SAS', 'forme d’une société : SAS');
let ec = FS.ecartProfil({ address: 'Jean bart', statusType: 'micro' }, fi);
ok(ec.length === 1 && ec[0].champ === 'address' && ec[0].avant === 'Jean bart', 'écart : l’adresse seule (un EI ne prend pas de forme de société)');
ok(FS.ecartProfil({ address: 'rue jean  bart 97133 saint-barthelemy' }, fi).length === 0, 'même adresse à la casse près : aucun écart');

(async () => {
  console.log('B — le PDF du serveur');
  const src = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
  const prendre = (debut) => { const i = src.indexOf(debut); if (i < 0) throw new Error('introuvable : ' + debut); let k = src.indexOf('{', i), n = 0;
    for (let j = k; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (!n) return src.slice(i, j + 1); } } };
  const code = ['function eurTxt(', 'function frDate(', 'function wrapPdf(', 'async function buildInvoicePdf('].map(prendre).join('\n');
  const fab = new Function('require', 'MF', code + '\nreturn { buildInvoicePdf, frDate };');
  const SRV = fab((m) => require(path.join(RACINE, 'functions', 'node_modules', m)), MF);
  ok(SRV.frDate(FIN_22H) === '25 novembre 2026', 'date d’émission au jour de Saint-Barthélemy (réglée à 22 h → le 25)');
  const b64 = await SRV.buildInvoicePdf({ invNo: '2026-D-0001', dateStr: '25 novembre 2026', datePrestaStr: '25 novembre 2026',
    provider: { legal: 'Karla Barbosa', address: 'Rue Jean Bart, 97133 Saint-Barthélemy', siret: '91234567800029', statusType: 'micro' },
    client: { name: 'Cécile Martinez', zone: 'Cul-de-Sac · Toiny' }, lines: [{ label: 'Ménage', qty: '4 h', unit: '28,00 €', total: 112 }], total: 112 });
  const tmp = path.join(os.tmpdir(), 'facture-test-' + process.pid + '.pdf');
  fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
  let txt = '';
  try { txt = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8' }); } catch (e) { txt = ''; }
  fs.unlinkSync(tmp);
  const t = txt.replace(/\s+/g, ' ');
  ok(/Karla Barbosa EI/.test(t), 'PDF : « Karla Barbosa EI »');
  ok(/Micro-entreprise/.test(t) && /Rue Jean Bart, 97133 Saint-Barth/.test(t), 'PDF : forme et adresse');
  ok(/Prestation du 25 novembre 2026/.test(t), 'PDF : date de la prestation');
  ok(/N° 2026-D-0001/.test(t), 'PDF : le numéro de la série');
  ok(!/'2026-' \+ /.test(src), 'serveur : plus aucun numéro de secours fabriqué');
  ok(/if \(!saleNo\) \{ console\.error\('emailClientInvoice : facture sans numéro, non envoyée'/.test(src), 'sans numéro, la facture ne part pas');

  const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
  const b = await chromium.launch(o);
  const p = await (await b.newContext({ viewport: { width: 393, height: 2400 }, timezoneId: 'America/St_Barthelemy', serviceWorkers: 'block' })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-11-26T14:00:00Z') });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto(INDEX); await p.clock.runFor(1500); await p.waitForFunction(() => window.__S && window.__render);
  await p.addStyleTag({ content: '.stage{display:block!important}.pad{opacity:1!important;animation:none!important}' });

  console.log('C — le miroir de l’écran dit la même chose que le noyau');
  const cas = [{ legal: 'Karla Barbosa', statusType: 'micro' }, { legal: 'Paul Hodge', statusType: 'entreprise', legalForm: 'E.I.' }, { legal: 'X EI', statusType: 'micro' }, { legal: 'Lagon SARL', statusType: 'entreprise', legalForm: 'SARL' }, { legal: '', statusType: 'micro' }];
  const dates = [{ doneProAtMs: FIN_22H }, { dateISO: '2026-11-24' }, { doneProAtMs: Date.UTC(2026, 10, 25, 3, 59) }, {}];
  const adr = ['Jean bart', 'Gustavia, 97133 Saint-Barthélemy', 'St Barth', '', 'Lorient'];
  const ecran = await p.evaluate(({ cas, dates, adr }) => ({ n: cas.map(window.__factNomPrestataire), d: dates.map(window.__factDatePrestationISO), a: adr.map(window.__factAdresseComplete) }), { cas, dates, adr });
  ok(JSON.stringify(ecran.n) === JSON.stringify(cas.map(MF.nomPrestataire)), 'nom + EI : identique');
  ok(JSON.stringify(ecran.d) === JSON.stringify(dates.map(MF.datePrestationISO)), 'date de prestation : identique');
  ok(JSON.stringify(ecran.a) === JSON.stringify(adr.map(MF.adresseComplete)), 'adresse complète : identique');

  console.log('D — la facture du client à l’écran');
  const factureClient = (invNo) => p.evaluate((invNo) => {
    window.__setFB({ auth: { currentUser: { uid: 'c1', email: 'c@e.fr' } }, db: {}, f: { doc: () => ({}), setDoc: () => Promise.resolve(), updateDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) }, fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'client'; S.account = { name: 'Cécile Martinez', uid: 'c1', email: 'c@e.fr' };
    const m = Object.assign(window.__newMission(window.__svc.trouve('menage')), { reqId: 'R1', status: 'paid', invNo: invNo, dateISO: '2026-11-25', zone: 'Gustavia', providerLegal: 'Karla Barbosa', providerStatusType: 'micro',
      providerAddress: 'Rue Jean Bart, 97133 Saint-Barthélemy', providerSiret: '91234567800029', doneProAtMs: Date.UTC(2026, 10, 26, 2, 0), settledAtMs: Date.UTC(2026, 10, 26, 2, 30), provider: { nm: 'Karla', ini: 'KB' } });
    return window.__clientInvoiceDoc(m).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  }, invNo);
  let t1 = await factureClient('2026-D-0001');
  ok(/Karla Barbosa EI/.test(t1) && /Micro-entreprise/.test(t1), 'nom suivi de « EI », forme « Micro-entreprise »');
  ok(/Prestation du 25 nov\. 2026/.test(t1), 'date de la prestation (fin à 22 h sur l’île → le 25)');
  ok(/N° 2026-D-0001/.test(t1), 'le numéro de la série');
  t1 = await factureClient('');
  ok(/N° en cours d’attribution/.test(t1) && !/2026-0198/.test(t1), 'sans numéro : « en cours d’attribution », plus de « 2026-0198 » inventé');

  console.log('E — le profil du prestataire');
  const pro = (adresse, siret) => p.evaluate(({ adresse, siret }) => {
    window.__ecrits = []; window.__appels = [];
    window.__setFB({ auth: { currentUser: { uid: 'u0', email: 'k@e.fr' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), setDoc: (ref, data) => { window.__ecrits.push({ ref: ref.path, data }); return Promise.resolve(); }, updateDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_f, nom) => (data) => { window.__appels.push({ nom, data }); return Promise.resolve({ data: window.__reponse || {} }); } }, functions: {} });
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S; S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'pro'; S.proStatus = 'valide'; S.proName = 'Karla'; S.proLegal = 'Karla Barbosa';
    S.proStatusType = 'micro'; S.proAddress = adresse; S.proSiret = siret; S.proPhone = '0690 12 34 56'; S.account = { name: 'Karla', email: 'k@e.fr', uid: 'u0', role: 'pro' };
    S.proNav = 'home'; S.mission = null; S.sirenePro = null; S.proEditContact = false; S.proContactForm = null; window.__render();
    return document.getElementById('view').textContent.replace(/\s+/g, ' ');
  }, { adresse, siret });
  let accueil = await pro('Jean bart', '91234567800029');
  ok(/Votre adresse est incomplète sur vos factures/.test(accueil) && /Il manque le code postal ou la commune/.test(accueil), 'accueil : la carte « adresse incomplète »');
  ok(!/Votre adresse est incomplète/.test(await pro('Rue Jean Bart, 97133 Saint-Barthélemy', '91234567800029')), 'adresse complète : pas de carte');
  await pro('Jean bart', '91234567800029');
  await p.evaluate((r) => { window.__reponse = r; document.querySelector('[data-act="pro-adresse"]').click(); }, { fiche: fi, ecart: FS.ecartProfil({ address: 'Jean bart', statusType: 'micro' }, fi) });
  await p.waitForTimeout(60);
  let r2 = await p.evaluate(() => ({ appels: window.__appels.slice(), t: document.getElementById('view').textContent.replace(/\s+/g, ' '), champ: !!document.querySelector('[data-proeditaddr]'), btn: !!document.querySelector('[data-act="pro-sirene-appliquer"]') }));
  ok(r2.appels.length === 1 && r2.appels[0].nom === 'ficheSiret', 'Corriger › interroge le répertoire par le serveur');
  ok(r2.champ && r2.btn && /Le répertoire Sirene indique/.test(r2.t) && /RUE JEAN BART 97133 SAINT-BARTHELEMY/.test(r2.t), 'l’écart est montré, avec le champ adresse et « Appliquer »');
  ok(await p.evaluate(() => window.__ecrits.length === 0), 'rien n’est écrit avant le geste');
  await p.evaluate(() => document.querySelector('[data-act="pro-sirene-appliquer"]').click());
  await p.waitForTimeout(30);
  const ap = await p.evaluate(() => ({ e: window.__ecrits.slice(), adr: window.__S.proAddress }));
  ok(ap.e.length === 1 && ap.e[0].ref === 'artisans/u0' && ap.e[0].data.address === 'RUE JEAN BART 97133 SAINT-BARTHELEMY' && Object.keys(ap.e[0].data).length === 1, 'Appliquer : la fiche reçoit l’adresse du répertoire, et rien d’autre');
  ok(ap.adr === 'RUE JEAN BART 97133 SAINT-BARTHELEMY', 'et l’écran la reprend');
  // Saisie à la main : une adresse changée qui ne situe pas n'entre pas
  await pro('Jean bart', '');
  await p.evaluate(() => { document.querySelector('[data-act="pro-adresse"]').click(); });
  await p.waitForTimeout(30);
  const man = await p.evaluate(() => { const i = document.querySelector('[data-proeditaddr]'); i.value = 'Rue Jean Bart'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="pro-contact-save"]').click(); return { e: window.__ecrits.length, adr: window.__S.proAddress, appels: window.__appels.length }; });
  ok(man.appels === 0, 'sans SIRET, aucune recherche');
  ok(man.e === 0 && man.adr === 'Jean bart', 'adresse sans code postal ni commune : refusée, rien n’est écrit');
  const man2 = await p.evaluate(() => { const i = document.querySelector('[data-proeditaddr]'); i.value = 'Rue Jean Bart, 97133 Saint-Barthélemy'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-act="pro-contact-save"]').click(); return { e: window.__ecrits.filter((x) => x.ref === 'artisans/u0').map((x) => x.data.address), adr: window.__S.proAddress }; });
  ok(man2.e[0] === 'Rue Jean Bart, 97133 Saint-Barthélemy' && man2.adr === 'Rue Jean Bart, 97133 Saint-Barthélemy', 'adresse complète : enregistrée');

  console.log('E2 — l’inscription se remplit au 14e chiffre');
  const ins = await p.evaluate(async (r) => {
    window.__appels = []; window.__reponse = r; const S = window.__S;
    S.proForm = { siret: '', name: 'Karla Barbosa', address: '', statusType: 'entreprise' }; S._siretVu = ''; S._siretBusy = false;
    window.__lookupSiret && 0;
    S.proForm.siret = '91234567800029'; await window.__lookupSiret(true); await new Promise((z) => setTimeout(z, 20));
    return { appels: window.__appels.slice(), f: Object.assign({}, S.proForm) };
  }, { fiche: fi, ecart: [] });
  ok(ins.appels.length === 1 && ins.appels[0].data.siret === '91234567800029', 'au 14e chiffre : une recherche, par le serveur');
  ok(ins.f.address === 'RUE JEAN BART 97133 SAINT-BARTHELEMY' && ins.f.statusType === 'micro' && ins.f.name === 'Karla Barbosa', 'adresse remplie, statut micro, le nom déjà saisi gardé');
  const ins2 = await p.evaluate(async () => { window.__appels = []; await window.__lookupSiret(true); return window.__appels.length; });
  ok(ins2 === 0, 'le même numéro ne relance pas la recherche');

  console.log('F — la console');
  const cons = await p.evaluate((r) => {
    window.__ecrits = []; window.__appels = []; window.__reponse = r;
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'contact@ti-services.fr' } }, db: {},
      f: { doc: (...a) => ({ path: a.slice(1).join('/') }), setDoc: (ref, data) => { window.__ecrits.push({ ref: ref.path, data }); return Promise.resolve(); }, updateDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: (_f, nom) => (data) => { window.__appels.push({ nom, data }); return Promise.resolve({ data: window.__reponse || {} }); } }, functions: {} });
    const S = window.__S; S.persona = 'admin'; S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'a', role: 'admin' };
    S.adminArtisans = [{ id: 'u0', uid: 'u0', real: true, name: 'Karla', legalName: 'Karla Barbosa', status: 'valide', cats: ['menage'], siret: '91234567800029', address: 'Jean bart', statusType: 'micro', skipAt: {}, vueAt: {} }];
    S.adminArtsLoaded = true; S.admin = { view: 'art', sel: 'u0' }; window.__render();
    const t0 = document.getElementById('view').textContent.replace(/\s+/g, ' ');
    const bt = document.querySelector('[data-adm="sirene:u0"]'); if (bt) bt.click();
    return { t0, bouton: !!bt };
  }, { fiche: fi, ecart: FS.ecartProfil({ address: 'Jean bart', statusType: 'micro' }, fi) });
  await p.waitForTimeout(60);
  ok(cons.bouton, 'la fiche du prestataire porte « Mettre à jour depuis le SIRET »');
  ok(/Incomplète sur ses factures/.test(cons.t0), 'la console signale l’adresse incomplète');
  const c2 = await p.evaluate(() => ({ appels: window.__appels.slice(), btn: !!document.querySelector('[data-act="adm-sirene-appliquer"]') }));
  ok(c2.appels.length === 1 && c2.appels[0].data.uid === 'u0', 'la console interroge pour CE prestataire');
  await p.evaluate(() => document.querySelector('[data-act="adm-sirene-appliquer"]').click());
  await p.waitForTimeout(30);
  const c3 = await p.evaluate(() => ({ e: window.__ecrits.slice(), a: window.__S.adminArtisans[0].address }));
  ok(c3.e.length === 1 && c3.e[0].ref === 'artisans/u0' && c3.e[0].data.address === 'RUE JEAN BART 97133 SAINT-BARTHELEMY', 'Appliquer : la fiche du prestataire est mise à jour');
  ok(c3.a === 'RUE JEAN BART 97133 SAINT-BARTHELEMY', 'et la console l’affiche');

  console.log('G — le répertoire ne publie pas l’adresse (l’éditeur, 26/11/2026 : « Conforme » sur « Jean bart »)');
  const fiP = FS.ficheDepuisSirene(sirene({ statut_diffusion: 'P' }), '91234567800029');
  const repP = { fiche: fiP, ecart: FS.ecartProfil({ address: 'Jean bart', statusType: 'micro' }, fiP) };
  ok(fiP.trouve && !fiP.adresse && fiP.diffusible === false && repP.ecart.length === 0, 'noyau : trouvé, sans adresse, aucun écart');
  const g1 = await p.evaluate((r) => {
    window.__ecrits = []; window.__appels = []; window.__reponse = r;
    const S = window.__S; S.admSirene = null; S.admin = { view: 'art', sel: 'u0' }; S.adminArtisans[0].address = 'Jean bart'; window.__render();
    document.querySelector('[data-adm="sirene:u0"]').click();
    return 1;
  }, repP);
  await p.waitForTimeout(60);
  const g2 = await p.evaluate(() => ({ t: document.getElementById('view').textContent.replace(/\s+/g, ' '), champ: document.querySelector('[data-admaddr]') }));
  ok(!/Conforme au répertoire Sirene/.test(g2.t), 'plus de « Conforme » quand le répertoire ne donne pas d’adresse');
  ok(/ne publie pas l’adresse \(diffusion restreinte\)/.test(g2.t), 'la console dit pourquoi');
  const g3 = await p.evaluate(() => { const i = document.querySelector('[data-admaddr]'); if (!i) return null; const v0 = i.value;
    i.value = 'Rue Jean Bart'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-act="adm-adresse-enregistrer"]').click();
    const refus = window.__ecrits.length;
    i.value = 'Rue Jean Bart, 97133 Saint-Barthélemy'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-act="adm-adresse-enregistrer"]').click();
    return { v0, refus }; });
  await p.waitForTimeout(30);
  const g4 = await p.evaluate(() => ({ e: window.__ecrits.slice(), a: window.__S.adminArtisans[0].address }));
  ok(g3 && g3.v0 === 'Jean bart', 'le champ part de l’adresse actuelle');
  ok(g3 && g3.refus === 0, 'adresse sans code postal ni commune : refusée');
  ok(g4.e.length === 1 && g4.e[0].ref === 'artisans/u0' && g4.e[0].data.address === 'Rue Jean Bart, 97133 Saint-Barthélemy' && Object.keys(g4.e[0].data).length === 1, 'la console enregistre l’adresse saisie, et rien d’autre');
  ok(g4.a === 'Rue Jean Bart, 97133 Saint-Barthélemy', 'et l’affiche');
  // côté prestataire : même vérité, et le geste pour la saisir
  await pro('Jean bart', '91234567800029');
  await p.evaluate((r) => { window.__reponse = r; window.__S.proNav = 'account'; window.__S._fold = Object.assign({}, window.__S._fold, { 'p-infos': true }); window.__render(); document.querySelector('[data-act="pro-sirene"]').click(); }, repP);
  await p.waitForTimeout(60);
  const g5 = await p.evaluate(() => ({ t: document.getElementById('view').textContent.replace(/\s+/g, ' '), btn: !!document.querySelector('[data-act="pro-adresse"]') }));
  ok(!/Conforme au répertoire Sirene/.test(g5.t) && /ne publie pas l’adresse/.test(g5.t) && g5.btn, 'prestataire : pas de « Conforme », la raison, et « Saisir mon adresse »');

  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? f + ' ÉCHEC(S)' : 'TOUT EST VERT');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
