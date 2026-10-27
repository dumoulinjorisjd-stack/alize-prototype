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
/* `colis` EST OUVERT ICI ET NULLE PART AILLEURS. Mesuré : c'est le seul des dix
   pavés de l'accueil qui tombait en « Bientôt disponible » — un pavé gris, une
   rangée de séparation, et le dernier mot d'un écran qui vend. Ouvrir un métier
   est un état du marché (un prestataire validé), pas une promesse du produit :
   il change d'une semaine à l'autre, et la vidéo montre l'accueil d'un bon jour.
   Ce que la grille AFFIRME — les métiers, les prix — ne bouge pas d'un caractère. */
const SERVICES_OUVERTS = ['menage','baby','jardin','demenagement','coiffure','animaux',
  'massage','manucure','epilation','plomberie','elec','clim','coach','yoga','colis'];
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
      /* TROIS DEMANDES, PAS UNE. Mesuré sur la capture précédente : « Missions
         disponibles · 1 », une carte, puis 470 px de blanc. Un marché à une seule
         offre ne donne envie à personne de s'inscrire — et le fil d'une masseuse
         un soir de saison n'en porte pas une. Les deux autres ne servent qu'à ça :
         la première reste celle du film (c'est elle qu'on touche, c'est son
         93,50 € que la garde exige). Les trois montants sont ceux que le mois
         d'historique porte déjà, et les trois actes sont ceux du catalogue de
         massage, relevés sur l'écran de configuration — on n'invente ni un tarif
         ni une prestation.

         LES TROIS DURÉES SONT DES HEURES ENTIÈRES, ET C'EST UNE CONTRAINTE DE
         L'AFFICHAGE, PAS UN GOÛT : la carte du fil écrit `duration + ' h'` sans
         mise en forme, donc une prestation d'une heure et demie s'y lit
         « 1.5 h » — relevé sur un premier jet qui prenait l'acte « 1 h 30 » du
         catalogue. C'est un défaut de l'application, pas de la vidéo (voir
         LISEZ-MOI) ; on le contourne ici au lieu de le filmer. */
      const DEMANDES = [
        { id:'r9', cli:o.cli.name, zone:'Lorient · Camaruche', slot:'17:00', h:1, acte:'1 h relaxant',       px:110 },
        { id:'r8', cli:'Noé',      zone:'Gustavia',            slot:'10:00', h:1, acte:'Duo (2 pers., 1 h)', px:210 },
        { id:'r7', cli:'Inès',     zone:'Saint-Jean',          slot:'14:30', h:2, acte:'1 h relaxant',       px:110, fois:2 },
      ];
      const faire = (q, st) => { const d = window.__newMission(window.__svc.trouve('massage'));
        d.id=q.id; d.status=st; d.duration=q.h; d.when='Demain'; d.dateISO=demain;
        d.slot=q.slot; d.zone=q.zone; d.address=o.adr.address;
        d.acts = [{ id:q.id+'a', nm:q.acte, price:q.px, qty:q.fois || 1 }];
        d.client = { name:q.cli, phone:o.cli.phone }; return d; };
      /* CE QU'ELLE A PRIS N'EST PLUS À PRENDRE. La demande acceptée quittait le
         fil des disponibles — elle y restait, à côté d'elle-même, sous le même
         identifiant. */
      S.proMissions = o.mission ? [faire(DEMANDES[0], o.mission)] : [];
      S.openRequests = o.fil ? DEMANDES.slice(o.mission ? 1 : 0).map(q => faire(q, 'pending')) : [];
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
/* OÙ SE POSE LE DOIGT. Le film met en scène quelqu'un qui SE SERT de l'app : il
   lui faut les coordonnées des boutons qu'on touche. On ne les retape pas — on les
   DEMANDE à l'écran capturé, et elles voyagent avec les images (reperes.json).
   Le jour où une carte change de place, le doigt la suit. */
/* ———————————————————————————————————————————————————————————————
   L'ÉPURE DES CAPTURES.

   « Enlève les textes explicatifs et les messages en rouge : tout ça est bien
   dans l'application, mais pas dans une vidéo. » Juste — et ce n'est pas une
   retouche d'image : on n'efface RIEN de la capture, on met l'application dans
   l'état où ces blocs ne paraissent pas. Chacun est nommé avec sa raison, et
   la garde ci-dessous REFUSE une entrée qui ne rencontre plus personne : une
   liste de sélecteurs se périme en silence au premier renommage de classe.

   Ce qui reste visible est ce qui PORTE le film : les prix, les boutons, les
   montants, les cartes de mission. Ce qui part est ce qu'un utilisateur installé
   ne voit plus, ou ce qui n'a de sens qu'immobile, sous les yeux. */
const EPURE = [
  { sel: '#view .notifcta',
    quoi: 'la relance « activer les notifications » — quelqu\'un qui se sert de l\'app les a déjà activées' },
  { sel: '#view .trust',
    quoi: 'la rangée de réassurance de l\'accueil ; une de ses trois lignes promet plus que le produit ne tient (voir LISEZ-MOI)' },
  { sel: '#view .zouti-line',
    quoi: 'la phrase de l\'assistant : elle s\'adresse à qui regarde, pas à qui est filmé' },
  { sel: '#view p.mini',
    quoi: 'les mentions en petits caractères — illisibles à l\'écran d\'un téléphone filmé' },
  /* UN SOUS-TITRE N'EST PAS TOUJOURS UNE EXPLICATION. `p.sub` emportait « De quel
     service avez-vous besoin ? » — la QUESTION qui porte l'accueil, pas de la
     prose. C'est la longueur qui les sépare : une question tient en une ligne,
     une explication n'y tient jamais. (La garde du texte lisible l'a dit, et
     seulement parce que l'épure passe désormais AVANT elle.) */
  { sel: '#view p.sub', siPlusDe: 44,
    quoi: 'le sous-titre explicatif d\'un écran, quand c\'est de la prose et non une question' },
  /* LA RELANCE D'INSTALLATION DU PRESTATAIRE. Encadrée de corail, elle décrit où
     en est un dossier Mollie — une étape de mise en route, pas le produit. Elle
     tenait un quart de l'écran du fil, juste sous la mission : c'est la place de
     ce qu'on vend. (Même famille que `.notifcta` : quelqu'un qui travaille ne la
     voit plus.) */
  { sel: '#view [data-act="pro-mollie"]',
    quoi: 'la carte d\'état du dossier de paiement du prestataire — une mise en route, pas le produit' },
  /* ON GARDE LA PROMESSE, ON RETIRE SON MODE D'EMPLOI.
     « Aucun débit maintenant. » est LE bloc qui vend cet écran, et la phrase qui
     le suit explique le mécanisme en quatre lignes. Les deux vivent dans le MÊME
     <span> : la prose est un nœud de TEXTE, frère du <b>, donc aucun élément à
     masquer. On vide les nœuds de texte qui suivent le chapeau, et le bandeau
     reste — sa couleur, son bouclier, sa phrase. Mesuré : 112 px deviennent 40,
     et l'écran garde ce pour quoi on le montre.

     C'EST LA SECONDE ÉCRITURE DE CETTE ÉPURE, ET LA PREMIÈRE A COSTÉ L'ÉCRAN.
     Elle visait une phrase du corps (« Nous enregistrons seulement votre carte »)
     pour ne pas emporter le chapeau — mais la remontée vers « le bloc entier »
     reprenait le bandeau tout entier, chapeau compris. Résultat mesuré :
     « Confirmer la réservation », une ligne de prix, un bouton, et 514 px de
     blanc — 62 % de l'écran. Une épure qui vide l'écran qu'on vend coûte plus
     qu'elle ne rapporte. */
  { contient: 'Aucun débit maintenant', garder: 'b',
    quoi: 'les quatre lignes qui expliquent le prélèvement, sous un chapeau qu\'on garde' },
];

/* On masque, on n'efface pas : `visibility` garde la place, donc la mise en page
   ne se décale pas et les repères relevés restent ceux de l'écran réel. Sauf
   pour les blocs qui laisseraient un grand trou — ceux-là sortent du flux. */
async function epurer(p) {
  const vus = await p.evaluate(liste => {
    const n = [];
    for (const e of liste) {
      let cibles = [];
      if (e.garder) {
        // on ne masque pas un élément : on vide la prose qui suit le chapeau,
        // dans le parent qui les porte tous les deux.
        const chapeau = [...document.querySelectorAll('#view ' + e.garder)]
          .find(x => (x.textContent || '').indexOf(e.contient) >= 0);
        let n3 = 0;
        if (chapeau && chapeau.parentElement) {
          const sac = chapeau.parentElement;
          [...sac.childNodes].forEach(k => {
            if (k.nodeType === 3 && (k.nodeValue || '').trim().length > 2) { k.nodeValue = ''; n3++; }
          });
        }
        n.push({ quoi: '« ' + e.contient + ' » (sous son chapeau)', n: n3 });
        continue;
      }
      if (e.sel) cibles = [...document.querySelectorAll(e.sel)].filter(x =>
        !e.siPlusDe || (x.textContent || '').trim().length > e.siPlusDe);
      else {
        const c = [...document.querySelectorAll('#view *')].filter(x =>
          (x.textContent || '').indexOf(e.contient) >= 0 &&
          ![...x.children].some(k => (k.textContent || '').indexOf(e.contient) >= 0));
        // le bloc entier, pas seulement le mot : on remonte tant que le parent
        // ne porte que cette prose-là
        cibles = c.map(x => { let n2 = x;
          while (n2.parentElement && n2.parentElement.id !== 'view' &&
                 (n2.parentElement.textContent || '').trim().length <
                 (x.textContent || '').trim().length * 1.25) n2 = n2.parentElement;
          return n2; });
      }
      cibles = cibles.filter(x => x.getBoundingClientRect().height > 0);
      cibles.forEach(x => { x.style.display = 'none'; });
      n.push({ quoi: e.sel || ('« ' + e.contient + ' »'), n: cibles.length });
    }
    return n;
  }, EPURE.map(e => ({ sel: e.sel, contient: e.contient, siPlusDe: e.siPlusDe, garder: e.garder })));
  return vus;
}

/* DEUX REPÈRES PAR ÉCRAN PLUTÔT QU'UN, ET C'EST LA CAMÉRA QUI LES RÉCLAME.
   « Trop de zoom et dézoom, ça fait mal à la tête » : un seul repère par écran
   obligeait à repasser en plan large entre deux gros plans, donc à faire le
   yo-yo. Avec deux points visés sur le même écran, la caméra se DÉPLACE à
   focale constante — c'est une coupe, pas un zoom. */
const REPERES = {
  '01-accueil-bas':  { massage:  e => /^Massage/.test(e.textContent || '') },
  '02-config':       { relaxant: e => /1 h relaxant/.test(e.textContent || '') },
  '03-confirmer':    { carte:    e => /Enregistrer ma carte/.test(e.textContent || ''),
                       debit:    e => /Aucun débit maintenant/.test(e.textContent || ''),
                       prix:     e => /^\s*110,00/.test(e.textContent || '') },
  '05-pro-fil':      { mission:  e => /93,50/.test(e.textContent || ''),
                       seconde:  e => /178,50/.test(e.textContent || ''),
                       enligne:  e => /^Vous êtes en ligne/.test(e.textContent || '') },
  '06-pro-acceptee': { percoit:  e => /Vous percevez/.test(e.textContent || ''),
                       dispos:   e => /187,00/.test(e.textContent || '') },
  '07-pro-revenus':  { net:      e => /^\s*824,50/.test(e.textContent || ''),
                       factures: e => /^Mes factures par mission/.test(e.textContent || '') },
};

const ECRANS = [
  // Deux gardes par écran quand la phrase ET le chiffre comptent.
  { nom:'01-accueil',      dit:'De quel service avez-vous besoin',  pose: p => ETATS.client(p) },
  // Le même accueil, défilé jusqu'au massage : c'est là que le doigt se pose.
  { nom:'01-accueil-bas',  dit:'Massage',                           pose: async p => { await ETATS.client(p);
      await p.evaluate(() => { const v = document.getElementById('view'); v.scrollTop = v.scrollHeight; }); } },
  { nom:'02-config',       dit:'1 h relaxant',                      pose: p => ETATS.configMassage(p) },
  { nom:'03-confirmer',    dit:['Confirmer la réservation', '110,00 €'], pose: p => ETATS.confirmer(p) },
  { nom:'04-suivi',        dit:'Artisan trouvé',                    pose: p => ETATS.suivi(p) },
  { nom:'05-pro-fil',      dit:'93,50 €',                            pose: p => ETATS.pro(p, { fil:true }) },
  { nom:'06-pro-acceptee', dit:'Vous percevez 93,50 €',              pose: p => ETATS.pro(p, { fil:true, mission:'accepted' }) },
  { nom:'07-pro-revenus',  dit:['824,50 €', 'Ce mois-ci'],         pose: p => ETATS.pro(p, { fil:false, mission:'paid', onglet:'earnings' }) },
  { nom:'08-pro-agenda',   dit:'Mon planning',                      pose: p => ETATS.pro(p, { fil:false, mission:'accepted', onglet:'agenda' }) },
];

async function capturer(sortie) {
  fs.mkdirSync(sortie, { recursive: true });
  const reperes = {};
  const dir = preparerCopie();
  const opt = { headless: true };
  if (fs.existsSync(CHROME)) opt.executablePath = CHROME;
  const b = await chromium.launch(opt);
  const p = await ouvrirApp(b, dir);
  const faits = [];
  const compteEpure = {};
  for (const e of ECRANS) {
    await e.pose(p);
    await p.waitForTimeout(350);
    /* L'ÉPURE PASSE AVANT LE CONTRÔLE, et c'est l'ordre qui compte : ce qu'on
       garantit lisible doit l'être sur l'écran TEL QU'IL SERA FILMÉ. Lu avant,
       le contrôle validerait une phrase que l'épure vient de retirer. */
    const epure = await epurer(p);
    epure.forEach(x => { compteEpure[x.quoi] = (compteEpure[x.quoi] || 0) + x.n; });
    const txt = await p.evaluate(() => document.getElementById('view').innerText);
    // Les espaces d'un montant sont insécables dans l'app : on compare sur ce qui SE LIT.
    const lisible = t => t.replace(/[\u00A0\u202F\u2009]/g, ' ');
    for (const attendu of [].concat(e.dit)) {
      if (lisible(txt).indexOf(lisible(attendu)) < 0) {
        throw new Error('Écran « ' + e.nom + ' » : « ' + attendu + ' » ne s\'y lit plus.\n' + txt.slice(0, 500));
      }
    }
    const voulus = REPERES[e.nom];
    if (voulus) {
      reperes[e.nom] = {};
      for (const [cle, reconnait] of Object.entries(voulus)) {
        const box = await p.evaluate(src => {
          /* LE PLUS PETIT ÉLÉMENT QUI PORTE LE TEXTE. Un premier jet prenait le
             premier venu : « 1 h relaxant » ramenait la CARTE entière (354 × 276),
             et le doigt se posait au milieu d'un bloc au lieu de la ligne. */
          const reconnait = new Function('e', 'return (' + src + ')(e)');
          const cible = [...document.querySelectorAll('#view button, #view .card, #view [data-act], #view label, #view div, #view span, #view b, #view strong')]
            .filter(el => { const r = el.getBoundingClientRect();
              /* UN REPÈRE DOIT ÊTRE VISIBLE. En élargissant la recherche aux spans,
                 le relevé a ramené « 1 h relaxant » à y=1473 pour un écran haut de
                 844 : l'élément existe, la capture ne le montre pas, et un doigt
                 posé là désignerait du vide. Il doit tenir DANS l'image. */
              return r.width > 20 && r.height > 20
                  && r.top >= -2 && r.bottom <= window.innerHeight + 2
                  && reconnait(el); })
            .sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
              return (ra.width * ra.height) - (rb.width * rb.height); })[0];
          if (!cible) return null;
          const r = cible.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2,
                   w: Math.round(r.width), h: Math.round(r.height) };
        }, reconnait.toString());
        if (!box) throw new Error('Repère « ' + cle + ' » introuvable sur « ' + e.nom + ' ».');
        reperes[e.nom][cle] = { x: Math.round(box.x), y: Math.round(box.y), w: box.w, h: box.h };
      }
    }
    await p.screenshot({ path: path.join(sortie, e.nom + '.png') });
    faits.push(e.nom);
  }
  if (p.__pannes.length) throw new Error('L\'app a levé pendant la capture :\n' + p.__pannes.join('\n'));
  for (const nom of Object.keys(REPERES)) {
    if (!reperes[nom]) throw new Error('Aucun repère relevé pour « ' + nom + ' » — l\'écran a-t-il disparu ?');
  }
  fs.writeFileSync(path.join(sortie, 'reperes.json'), JSON.stringify(reperes, null, 1));
  await b.close();
  /* UNE LIGNE D'ÉPURE QUI NE RENCONTRE PLUS PERSONNE SE PÉRIME EN SILENCE : la
     classe a été renommée, le bloc revient dans le film, et personne ne le voit. */
  const mortes = Object.entries(compteEpure).filter(([, n]) => n === 0).map(([q]) => q);
  if (mortes.length) {
    throw new Error('Épure : ' + mortes.join(', ') + ' ne rencontre(nt) plus aucun élément.\n' +
      'Soit le bloc a quitté l\'app, soit sa classe a changé — dans les deux cas la liste ment.');
  }
  console.log('  épure : ' + Object.entries(compteEpure).map(([q, n]) => q + ' ×' + n).join(', '));
  fs.rmSync(dir, { recursive: true, force: true });
  return faits;
}

module.exports = { capturer, ECRANS, REPERES, EPURE, epurer, ouvrirApp, preparerCopie, ETATS, RACINE, CHROME,
  SERVICES_OUVERTS, CLIENTE, MASSEUSE, ADRESSE };

if (require.main === module) {
  capturer(path.join(__dirname, 'ecrans'))
    .then(f => console.log('écrans capturés : ' + f.join(', ')))
    .catch(e => { console.error(e.message); process.exit(1); });
}
