/* LA SCÈNE DE LA VIDÉO — les VRAIS écrans de l'application, pas des maquettes.
 *
 * On ne redessine rien : on ouvre l'app dans le harnais de test, on pose un état
 * (Camille cliente, Léa masseuse, un massage à Lorient), et on PHOTOGRAPHIE ce que
 * son propre render() produit. Un écran qui changerait dans l'app changerait ici.
 *
 * DEUX VALEURS SONT POSÉES DANS UNE COPIE, ET SEULEMENT LÀ : `IS_PROD` et
 * `isProdHost()`. Toutes deux se décident sur le nom de domaine, et une ouverture
 * en `file://` n'en a pas — l'app se croit alors en bêta et couvre ses écrans de
 * « Démonstration » et de « BÊTA ». La vidéo montre le produit tel qu'il est servi
 * sur ti-services.fr ; le dépôt, lui, n'est pas touché.
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const RACINE = '/home/user/alize-work';
const CHROME = '/opt/pw-browsers/chromium';

// Les services ouverts et les noms de la scène : ce sont des choix de MISE EN SCÈNE,
// au même titre que « Camille ». Ils sont déclarés ici, en un seul endroit, pour qu'on
// sache en les lisant ce que la vidéo suppose.
const SERVICES_OUVERTS = ['menage','baby','jardin','demenagement','coiffure','animaux',
  'massage','manucure','epilation','plomberie','elec','clim','coach','yoga'];
const CLIENTE = { uid:'cli1', name:'Camille', email:'camille@exemple.fr', phone:'0690123456' };
const MASSEUSE = { uid:'pro1', name:'Léa Mercier', email:'lea@exemple.fr', phone:'0690887766' };
const ADRESSE = { id:'a1', label:'Maison', zone:'Lorient',
  address:'12 rue des Flamboyants, Lorient', geo:{ lat:17.906, lng:-62.837 }, access:'Portail blanc' };

/* ---------- la copie de scène ---------- */
function preparerCopie() {
  execFileSync('sh', [path.join(RACINE, 'tests/harn/build.sh')], { stdio: 'inherit' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti-scene-'));
  const src = fs.readFileSync(path.join(RACINE, 'tests/harn/app.html'), 'utf8');
  const out = src
    .replace(/^  const IS_PROD = .*$/m, '  const IS_PROD = true;')
    .replace(/^  function isProdHost\(\)\{.*$/m, '  function isProdHost(){return true;}');
  for (const marque of ['const IS_PROD = true;', 'function isProdHost(){return true;}']) {
    if (out.indexOf(marque) < 0) throw new Error('Scène : « ' + marque + ' » non posé — le source a changé.');
  }
  fs.writeFileSync(path.join(dir, 'app.html'), out);
  // Les ressources vivent à la racine du dépôt ; app.html, lui, vit dans un
  // sous-dossier. Sans cette copie, le logo Zouti sort en carré vide.
  for (const f of ['zouti-logo.svg', 'icon.svg', 'icon-192-beta.png']) {
    fs.copyFileSync(path.join(RACINE, f), path.join(dir, f));
  }
  return dir;
}

/* ---------- un faux Firebase INERTE ----------
   Il a la FORME que l'app attend et ne répond rien. Il sert à une seule chose : que
   l'app se croie en ligne et rende ses écrans de production. Aucun appel ne part,
   aucune donnée n'entre — tout ce qui s'affiche est posé à la main, ci-dessous. */
async function poserFauxFB(p) {
  await p.evaluate(() => {
    window.__FAUXFB = function () {
      const rien = function () { return undefined; };
      const appelable = { httpsCallable: function () { return async function () { return { data: {} }; }; } };
      return { auth:{ currentUser:{ uid:'u' } }, db:{}, app:{}, a:{}, fnBrut:{},
        f: new Proxy({}, { get: function () { return rien; } }),
        fn: appelable, functions: appelable };
    };
  });
}

async function ouvrirApp(navigateur, dir, { w = 390, h = 844, echelle = 3 } = {}) {
  const ctx = await navigateur.newContext({ viewport:{ width:w, height:h },
    deviceScaleFactor: echelle, locale:'fr-FR', isMobile:true, hasTouch:true });
  const p = await ctx.newPage();
  const pannes = [];
  p.on('pageerror', e => pannes.push(e.message));
  await p.goto('file://' + path.join(dir, 'app.html'));
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(400);
  await p.evaluate(() => document.body.classList.add('standalone'));
  await poserFauxFB(p);
  p.__pannes = pannes;
  return p;
}

/* ---------- les états ---------- */
const ETATS = {
  async client(p) {
    await p.evaluate(a => { const S = window.__S;
      window.__setFB(window.__FAUXFB());
      S.demoMode = false; try { delete window.__NOFB; } catch (_) {}
      S.persona='client'; S.onboarded=true; S.guest=false; S.clientNav='home';
      S.account = a.cli; S.addresses = [a.adr]; S.addrDefault = a.adr.id;
      S.availableServices = a.svc.slice();
      S.missions = []; S.draft = null; S.payStep = false;
      window.__render();
    }, { cli: CLIENTE, adr: ADRESSE, svc: SERVICES_OUVERTS });
  },

  async configMassage(p) {
    await p.evaluate(() => { const S = window.__S;
      const m = window.__newMission(window.__svc.trouve('massage'));
      m.duration = 1; m.slot = '17:00'; m.when = 'Aujourd’hui';
      m.acts = [{ id:'relax60', nm:'1 h relaxant', price:110 }];
      S.draft = m; window.__render();
    });
  },

  async confirmer(p) { await p.evaluate(() => { window.__S.payStep = true; window.__render(); }); },

  async suivi(p) {
    await p.evaluate(a => { const S = window.__S;
      S.payStep = false; S.draft = null;
      const m = window.__newMission(window.__svc.trouve('massage'));
      m.id='r1'; m.status='accepted'; m.duration=1; m.slot='17:00'; m.when='Aujourd’hui';
      m.acts = [{ id:'relax60', nm:'1 h relaxant', price:110 }];
      m.provider = { uid:a.pro.uid, name:'Léa', rating:4.9, phone:a.pro.phone };
      S.missions = [m]; S.clientNav = 'wallet'; window.__render();
    }, { pro: MASSEUSE });
  },

  async pro(p, { fil = true, mission = null, onglet = null } = {}) {
    await p.evaluate(o => { const S = window.__S;
      window.__setFB(window.__FAUXFB());
      S.persona='pro'; S.proNav = o.onglet || 'home'; S.proStatus='valide'; S.proOnline=true;
      S.proName = o.pro.name; S.proCats = ['massage']; S.proJobsTotal = 24;
      S.proMollieCanWork = true; S.proMollieOrgId = 'org_x'; S.proMollieReady = true;
      S.account = o.pro;
      const demain = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
      const faire = st => { const d = window.__newMission(window.__svc.trouve('massage'));
        d.id='r9'; d.status=st; d.duration=1; d.when='Demain'; d.dateISO=demain;
        d.slot='17:00'; d.zone=o.adr.zone; d.address=o.adr.address;
        d.acts = [{ id:'relax60', nm:'1 h relaxant', price:110 }];
        d.client = { name:o.cli.name, phone:o.cli.phone }; return d; };
      S.openRequests = o.fil ? [faire('pending')] : [];
      S.proMissions = o.mission ? [faire(o.mission)] : [];
      S.missions = [];
      // Un mois de travail derrière elle : c'est ce que l'écran Revenus additionne.
      const jour = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
      const noms = ['Camille','Noé','Inès','Marc & Julie','Sarah','Tom','Léna'];
      S.proHistory = [110,160,110,210,110,160,110].map((px, i) => ({
        id:'h'+i, dateISO:jour(2 + i*3), svc:'massage', svcName:'Massage', client:noms[i],
        amount:px, commPct:1500, commission:Math.round(px*15)/100, net:Math.round(px*85)/100,
        duration:1, unit:'h' }));
      window.__render();
    }, { fil, mission, onglet, pro: MASSEUSE, cli: CLIENTE, adr: ADRESSE });
  },
};

/* ---------- la capture ----------
   Chaque écran porte le nom de ce qu'il MONTRE, et une phrase qui doit s'y lire :
   un écran qui cesserait de la porter ferait échouer la capture au lieu de produire
   une vidéo qui dit autre chose que l'app.

   LES MONTANTS SONT DANS LA GARDE, et c'est le point. Le film ÉCRIT « 93,50 € pour
   elle » dans une pastille, alors que l'écran, lui, le CALCULE (110 € moins la
   commission). Le jour où le tarif du massage ou le taux de commission changent,
   la pastille mentirait et la capture, elle, serait parfaite. On exige donc le
   chiffre : la capture échoue, on reprend la pastille, et les deux restent d'accord. */
const ECRANS = [
  // Deux gardes par écran quand la phrase ET le chiffre comptent.
  { nom:'01-accueil',      dit:'De quel service avez-vous besoin',  pose: p => ETATS.client(p) },
  { nom:'02-config',       dit:'1 h relaxant',                      pose: p => ETATS.configMassage(p) },
  { nom:'03-confirmer',    dit:['Aucun débit maintenant', '110,00 €'], pose: p => ETATS.confirmer(p) },
  { nom:'04-suivi',        dit:'Artisan trouvé',                    pose: p => ETATS.suivi(p) },
  { nom:'05-pro-fil',      dit:'93,50 €',                            pose: p => ETATS.pro(p, { fil:true }) },
  { nom:'06-pro-acceptee', dit:'Vous percevez 93,50 €',              pose: p => ETATS.pro(p, { fil:true, mission:'accepted' }) },
  { nom:'07-pro-revenus',  dit:'Paiement garanti',                  pose: p => ETATS.pro(p, { fil:false, mission:'paid', onglet:'earnings' }) },
  { nom:'08-pro-agenda',   dit:'Mon planning',                      pose: p => ETATS.pro(p, { fil:false, mission:'accepted', onglet:'agenda' }) },
];

async function capturer(sortie) {
  fs.mkdirSync(sortie, { recursive: true });
  const dir = preparerCopie();
  const opt = { headless: true };
  if (fs.existsSync(CHROME)) opt.executablePath = CHROME;
  const b = await chromium.launch(opt);
  const p = await ouvrirApp(b, dir);
  const faits = [];
  for (const e of ECRANS) {
    await e.pose(p);
    await p.waitForTimeout(350);
    const txt = await p.evaluate(() => document.getElementById('view').innerText);
    // Les espaces d'un montant sont insécables dans l'app : on compare sur ce qui SE LIT.
    const lisible = t => t.replace(/[\u00A0\u202F\u2009]/g, ' ');
    for (const attendu of [].concat(e.dit)) {
      if (lisible(txt).indexOf(lisible(attendu)) < 0) {
        throw new Error('Écran « ' + e.nom + ' » : « ' + attendu + ' » ne s\'y lit plus.\n' + txt.slice(0, 500));
      }
    }
    await p.screenshot({ path: path.join(sortie, e.nom + '.png') });
    faits.push(e.nom);
  }
  if (p.__pannes.length) throw new Error('L\'app a levé pendant la capture :\n' + p.__pannes.join('\n'));
  await b.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return faits;
}

module.exports = { capturer, ECRANS, ouvrirApp, preparerCopie, ETATS, RACINE, CHROME,
  SERVICES_OUVERTS, CLIENTE, MASSEUSE, ADRESSE };

if (require.main === module) {
  capturer(path.join(__dirname, 'ecrans'))
    .then(f => console.log('écrans capturés : ' + f.join(', ')))
    .catch(e => { console.error(e.message); process.exit(1); });
}
