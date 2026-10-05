/* CHANGER LE PALIER DE FIDÉLITÉ, ET LE BADGE AMBASSADEUR, À LA MAIN.

   « Je voulais aussi changer leur statut de fidélité, par exemple le passer manuellement
   de bronze à fondateur ou à platine. » Le palier se DÉDUISAIT du nombre de missions,
   sans aucun recours : récompenser quelqu'un, ou corriger une injustice, demandait de lui
   inventer des missions.

   DEUX CHOSES DIFFÉRENTES, et il faut qu'elles le restent : le PALIER est permanent et se
   déduit des missions ; le badge AMBASSADEUR est une distinction dont l'avantage est
   TEMPORAIRE (90 jours ou 2 000 € de prestations). Les confondre ferait croire qu'on
   accorde une commission à 5 % pour toujours.

   ET ÇA CHANGE DE L'ARGENT : si le serveur ne lisait pas le palier forcé là où la
   commission se calcule, l'application afficherait un taux que la facture ne pratiquerait
   pas. C'est la moitié de cette épreuve. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const fns = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

const ART = (x) => Object.assign({ id: 'a1', uid: 'a1', real: false, name: 'Nautylus',
  status: 'valide', siret: '12345678901234', insured: true, insuranceStatus: 'valide',
  cats: ['menage'], jobs: 3, refBonusJobs: 0, founder: false, tierForce: '' }, x);

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1600 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__statut && window.__statut.fid, null, { timeout: 20000 });
  await p.waitForTimeout(800);

  console.log('A — bronze → platine, et retour à l’automatique');
  const A = await p.evaluate((base) => {
    const a = Object.assign({}, base);
    const out = { depart: a.tierForce };
    window.__statut.palier(a, 'platine'); out.platine = a.tierForce;
    window.__statut.palier(a, 'auto'); out.auto = a.tierForce;
    window.__statut.palier(a, 'or'); out.or = a.tierForce;
    window.__statut.palier(a, 'diamant'); out.inconnu = a.tierForce;
    return out;
  }, ART({}));
  ok(A.depart === '', 'au départ, rien n’est forcé');
  ok(A.platine === 'platine', 'on le passe à Platine');
  ok(A.auto === '', '« Automatique » efface le forçage');
  ok(A.or === 'or', 'et n’importe quel palier du barème est atteignable');
  ok(A.inconnu === 'or', 'un palier qui n’existe pas n’entre pas (' + A.inconnu + ')');

  console.log('\nB — le palier forcé fait foi PARTOUT côté prestataire');
  const B = await p.evaluate(() => {
    const S = window.__S;
    S.proJobsTotal = 3; S.proFounder = false; S.proFounderGross = 0; S.proFounderSince = null;
    S.referrals = []; S.proTierForce = '';
    const auto = { palier: window.__statut.mien().key, taux: window.__statut.taux() };
    S.proTierForce = 'platine';
    const force = { palier: window.__statut.mien().key, taux: window.__statut.taux() };
    S.proTierForce = 'cle-inconnue';
    const abime = { palier: window.__statut.mien().key, taux: window.__statut.taux() };
    S.proTierForce = '';
    return { auto: auto, force: force, abime: abime };
  });
  ok(B.auto.palier === 'bronze' && B.auto.taux === 15, 'trois missions donnent Bronze à 15 % (' + B.auto.taux + ')');
  ok(B.force.palier === 'platine', 'forcé, son écran dit Platine');
  ok(B.force.taux === 8, 'ET son taux de commission suit, 8 % (' + B.force.taux + ')');
  ok(B.abime.palier === 'bronze' && B.abime.taux === 15,
    'une clé abîmée ne force rien : on retombe sur ses missions, qui sont toujours vraies');

  console.log('\nC — le serveur le lit là où la commission se calcule');
  ok(/function tierPctForce\(cle, tiers\)/.test(fns), 'le serveur sait lire un palier forcé');
  ok(/tierForce = a\.tierForce \|\| '';/.test(fns), 'il le prend sur la fiche');
  const sites = (fns.match(/pctForce2? != null \? pctForce2? :/g) || []).length;
  ok(sites === 2, 'et les DEUX calculs l’honorent : la prestation et l’indemnité (' + sites + ')');
  ok(/const table = \(Array\.isArray\(tiers\) && tiers\.length\) \? tiers : TIERS_DEFAUT;/.test(fns),
    'le taux vient du barème de la console, jamais d’un pourcentage écrit en dur');
  ok(/if \(!k\) return null;/.test(fns), 'un champ vide ne force rien');

  console.log('\nD — le badge Ambassadeur est une AUTRE chose, et sa fenêtre démarre au don');
  const D = await p.evaluate((base) => {
    const a = Object.assign({}, base);
    window.__statut.amb(a, true);
    const donne = { founder: a.founder, depuis: a.founderSince };
    window.__statut.amb(a, false);
    const retire = { founder: a.founder };
    // Un ambassadeur de longue date garde sa date d'origine si on le redonne.
    const vieux = Object.assign({}, base, { founder: false, founderSince: 1700000000000 });
    window.__statut.amb(vieux, true);
    return { donne: donne, retire: retire, vieux: vieux.founderSince };
  }, ART({}));
  ok(D.donne.founder === true && typeof D.donne.depuis === 'number' && D.donne.depuis > 1790000000000,
    'accorder le badge pose sa date de départ (sans elle, l’avantage serait déjà expiré)');
  ok(D.retire.founder === false, 'et il se retire');
  ok(D.vieux === 1700000000000, 'une date déjà posée n’est pas réécrite');

  console.log('\nE — la carte dit l’état, le taux, et ce qu’on est en train de faire');
  const E = await p.evaluate((base) => ({
    auto: window.__statut.fid(Object.assign({}, base)),
    force: window.__statut.fid(Object.assign({}, base, { tierForce: 'platine' })),
    descend: window.__statut.fid(Object.assign({}, base, { jobs: 400, tierForce: 'bronze' })),
    amb: window.__statut.fid(Object.assign({}, base, { founder: true, founderSince: Date.now() })),
    // L'avantage expire au PLAFOND ou au délai — et le délai ne démarre jamais avant
    // l'ouverture aux clients, donc à cinq jours de celle-ci c'est le plafond qui parle.
    ambVieux: window.__statut.fid(Object.assign({}, base, { founder: true, founderSince: 1700000000000, founderGross: 2500 })),
  }), ART({}));
  ok(/Ses missions lui donnent/.test(E.auto) && /Bronze/.test(E.auto), 'elle dit ce que ses missions lui donnent');
  ok((E.auto.match(/data-adm="palier-art:/g) || []).length === 5, 'cinq choix : automatique + les quatre paliers');
  ok(/Palier automatique/.test(E.auto) && /15&nbsp;%/.test(E.auto), 'et le taux qui en découle');
  ok(/Palier forcé/.test(E.force) && /8&nbsp;%/.test(E.force), 'forcé, elle annonce le nouveau taux');
  ok(/son compte de missions ne change pas/i.test(E.force), 'et que son compte de missions ne bouge pas');
  ok(/en dessous/.test(E.descend) && /sa commission augmente/.test(E.descend),
    'descendre quelqu’un est DIT, avec sa conséquence');
  ok(!/en dessous/.test(E.force), 'et ce n’est dit que dans ce cas');
  ok(/Badge actif/.test(E.amb) && /Retirer/.test(E.amb), 'le badge actif se retire');
  ok(/avantage expiré/.test(E.ambVieux), 'un badge dont la fenêtre est passée le dit');
  ok(/Accorder/.test(E.auto), 'et il s’accorde à qui ne l’a pas');

  console.log('\nF — le prestataire voit d’où vient son palier');
  ok(/attribué par Ti-Services/.test(html), 'son écran dit qu’il lui a été attribué');
  ok(/const forcePal=!!palierDeCle\(S\.proTierForce\),next=forcePal\?null:fidNext\(jobs\)/.test(html),
    'et la progression « plus que N missions » se tait, puisqu’elle n’a plus de sens');
  ok(/S\.proTierForce=ad\.tierForce\|\|'';/.test(html), 'le champ est relu au démarrage');
  ok((html.match(/S\.proTierForce=ad\.tierForce\|\|''/g) || []).length === 2,
    'et à chaque changement de sa fiche, sinon il verrait l’ancien');

  console.log('\nG — dans la fiche réelle, le clic');
  await p.evaluate((base) => {
    const S = window.__S;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    S.persona = 'admin'; S.onboarded = true; S.authView = null;
    S.adminArtisans = [Object.assign({}, base)];
    S.admin = { view: 'art', sel: 'a1' };
    window.__render();
  }, ART({}));
  await p.waitForTimeout(400);
  const G1 = await p.evaluate(() => document.querySelectorAll('#view [data-adm^="palier-art:"]').length);
  ok(G1 === 5, 'les cinq boutons sont dans la fiche (' + G1 + ')');
  await p.evaluate(() => document.querySelector('#view [data-adm="palier-art:a1:platine"]').click());
  await p.waitForTimeout(400);
  const G2 = await p.evaluate(() => ({ force: window.__S.adminArtisans[0].tierForce,
    vue: window.__S.admin.view,
    dit: /Palier forcé/.test(document.getElementById('view').textContent || '') }));
  ok(G2.force === 'platine' && G2.vue === 'art', 'le clic force le palier, sans quitter la fiche');
  ok(G2.dit, 'et la carte l’annonce aussitôt');
  await p.evaluate(() => document.querySelector('#view [data-adm="amb-art:a1:1"]').click());
  await p.waitForTimeout(400);
  const G3 = await p.evaluate(() => ({ amb: !!window.__S.adminArtisans[0].founder,
    bouton: !!document.querySelector('#view [data-adm="amb-art:a1:0"]') }));
  ok(G3.amb, 'le badge s’accorde d’un clic');
  ok(G3.bouton, 'et le bouton propose alors de le retirer');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
