/* « FAIS DES RETOURS EN ARRIÈRE, VOIS COMMENT LES ÉCRANS RÉAGISSENT ET CE QUI SE
   SAUVEGARDE, SI ON DOIT TOUT RECOMMENCER À ZÉRO À LA MOINDRE ERREUR DE MANIPULATION. »
   — l'éditeur, le 16/10/2026.

   CE QUE LE CODE PROMETTAIT : un commentaire, au-dessus de `sauverBrouillon`, annonce
   qu'il protège la commande du « ← Retour », et que le formulaire du prestataire « était
   déjà protégé ».

   CE QU'IL FAISAIT : `sauverBrouillon()` n'était appelé QUE sur `visibilitychange` et
   `pagehide`, c'est-à-dire quand on QUITTE l'application. Les deux chemins de retour
   effacent `S.draft` sans jamais l'enregistrer, et celui du bouton « ← Retour » efface en
   plus la copie locale. Une commande configurée pendant cinq minutes — adresse, durée,
   consignes d'accès, photos — disparaissait donc entièrement sur un toucher, sans
   confirmation et sans recours. La carte « Reprendre votre commande » existait, mais elle
   ne pouvait se nourrir que d'un enregistrement fait en fermant l'application.

   LE CÔTÉ PRESTATAIRE, lui, tient sa promesse : `saveProDraft()` est appelé par le retour
   et à chaque étape. Cette épreuve le vérifie aussi, pour que la règle vaille des deux
   côtés et qu'on sache lequel régresse si l'un des deux change. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__brouillon && window.__back);

  /* LA CLÉ DU BROUILLON DÉPEND DE `FB.auth.currentUser.uid` (`ti_draft_<uid>`), et le
     harnais perd `FB` sans prévenir : le SDK Firebase est chargé depuis un réseau
     injoignable, et son échec asynchrone remet `FB` à null. Enregistrer sous
     `ti_draft_cli1` puis relire sous `ti_draft_anon` ne rend rien — l'épreuve échouait
     une fois sur trois en accusant le produit. On réépingle donc AVANT chaque mesure,
     comme le fait déjà `test-remise-en-ligne-fait-reparaitre`. */
  const EPINGLE = `window.__setFB({ auth: { currentUser: { uid: 'cli1', email: 'c@x.c' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: function(){return Promise.resolve();},
        setDoc: function(){return Promise.resolve();}, getDoc: function(){return Promise.resolve({ exists: function(){return false;}, data: function(){return {};} });} },
      fn: { httpsCallable: function(){ return function(){ return new Promise(function(){}); }; } }, functions: {} });`;
  const mesure = (fn) => p.evaluate('(function(){' + EPINGLE + 'return (' + fn.toString() + ')();})()');

  /* Une commande CONFIGURÉE : ce qu'on a mis cinq minutes à saisir. */
  const commande = () => mesure(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'home'; S.mission = null; S.payStep = false;
    S.account = { name: 'Camille', email: 'c@x.c', uid: 'cli1', role: 'client' };
    S.adminPrices = { menage: 35 }; S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    S.missions = []; S.addresses = []; S.addrDefault = null;
    window.__brouillon.oublier();
    const d = window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 });
    d.duration = 4; d.address = '12 rue des Flamboyants'; d.zone = 'Lorient';
    d.access = 'Portail bleu, chien gentil'; d.notes = 'Deux chats, produits fournis';
    d.people = 2;
    S.draft = d; S.cfgMore = false; S._cfgVu = null;
    window.__cfg.render();
    return { svc: d.svc, duration: d.duration, notes: d.notes };
  });

  const etat = () => mesure(() => {
    const S = window.__S, p = window.__brouillon.lire();
    return { draft: !!S.draft, enBase: !!p,
      notes: p && p.draft ? p.draft.notes : null,
      duree: p && p.draft ? p.draft.duration : null,
      acces: p && p.draft ? p.draft.access : null,
      ecran: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ').slice(0, 200) };
  });

  console.log('A — le bouton « ← Retour » de l’écran de commande');
  await commande();
  await mesure(() => { const el = document.querySelector('[data-cfg="back"]'); if (el) el.click(); return 1; });
  const apresBouton = await etat();
  ok(!apresBouton.draft, 'le retour quitte bien l’écran de commande');
  ok(apresBouton.enBase,
    'ET LA COMMANDE EST GARDÉE : quatre heures, une adresse, des consignes d’accès et deux lignes de notes ne '
    + 'se retapent pas parce qu’on a touché une flèche');
  ok(apresBouton.notes === 'Deux chats, produits fournis' && apresBouton.duree === 4
    && apresBouton.acces === 'Portail bleu, chien gentil',
    'avec TOUT ce qui avait été saisi, pas seulement le métier');

  console.log('A bis — l’icône « accueil » de l’en-tête de commande');
  /* ELLE EST DANS LA MÊME RANGÉE QUE LA FLÈCHE, à deux centimètres, et elle effaçait la
     commande aussi. C'est une NAVIGATION, pas un abandon : une épreuve qui ne couvrirait
     que la flèche laisserait la moitié du geste sans garde. */
  await commande();
  const maison = await mesure(() => {
    const el = document.querySelector('.cfghead [data-act="go-home"]')
      || document.querySelector('[data-act="go-home"]');
    return { trouve: !!el, clique: el ? (el.click(), true) : false };
  });
  ok(maison.trouve, 'l’icône est bien dans l’en-tête de l’écran de commande');
  const apresMaison = await etat();
  ok(!apresMaison.draft && apresMaison.enBase && apresMaison.notes === 'Deux chats, produits fournis',
    'elle ramène à l’accueil et garde la commande, comme la flèche');

  console.log('B — le retour du navigateur et du bouton Android');
  await commande();
  await mesure(() => { window.__back(); return 1; });
  const apresBack = await etat();
  ok(!apresBack.draft, 'il quitte aussi l’écran de commande');
  ok(apresBack.enBase && apresBack.notes === 'Deux chats, produits fournis',
    'et garde la même chose : les deux chemins de retour ne peuvent pas avoir deux mémoires différentes');

  console.log('C — et l’écran le PROPOSE, sinon la garder ne sert à rien');
  const accueil = await mesure(() => {
    const S = window.__S; S.clientNav = 'home'; S.draft = null; window.__render();
    const v = document.getElementById('view');
    return { txt: (v.textContent || '').replace(/\s+/g, ' '),
      reprendre: v.querySelectorAll('[data-act="brouillon-reprendre"]').length,
      abandonner: v.querySelectorAll('[data-act="brouillon-oublier"]').length };
  });
  ok(accueil.reprendre === 1 && /Reprendre votre commande/.test(accueil.txt),
    'l’accueil propose de reprendre la commande, en la nommant');
  ok(accueil.abandonner === 1, 'et de l’abandonner : on ne force personne à la reprendre');

  const reprise = await mesure(() => {
    document.querySelector('[data-act="brouillon-reprendre"]').click();
    const d = window.__S.draft || {};
    return { svc: d.svc, duration: d.duration, notes: d.notes, access: d.access, people: d.people };
  });
  ok(reprise.svc === 'menage' && reprise.duration === 4 && reprise.notes === 'Deux chats, produits fournis'
    && reprise.access === 'Portail bleu, chien gentil' && reprise.people === 2,
    'et la reprendre rend EXACTEMENT ce qui avait été saisi');

  console.log('D — abandonner, c’est abandonner');
  const apresAbandon = await mesure(() => {
    const S = window.__S; S.draft = null; S.clientNav = 'home'; window.__render();
    const el = document.querySelector('[data-act="brouillon-oublier"]'); if (el) el.click();
    return { enBase: !!window.__brouillon.lire(),
      carte: document.querySelectorAll('[data-act="brouillon-reprendre"]').length };
  });
  ok(!apresAbandon.enBase && apresAbandon.carte === 0,
    'quand on le DEMANDE, la commande est effacée pour de bon : une garde qu’on ne peut pas lever finit par encombrer');

  console.log('E — une commande ENVOYÉE ne revient pas hanter l’accueil');
  await commande();
  await mesure(() => { window.__brouillon.oublier(); window.__S.draft = null; window.__render(); return 1; });
  const apresEnvoi = await mesure(() => ({ enBase: !!window.__brouillon.lire(),
    carte: document.querySelectorAll('[data-act="brouillon-reprendre"]').length }));
  ok(!apresEnvoi.enBase && apresEnvoi.carte === 0,
    'une fois la commande placée, le brouillon est oublié : le proposer serait proposer de la passer deux fois');

  console.log('F — côté PRESTATAIRE, le dossier d’inscription est déjà protégé');
  const pro = await mesure(() => {
    const S = window.__S;
    S.persona = 'pro'; S.proStatus = 'draft'; S.proStep = 'identite';
    S.proForm = { name: 'Laure M.', phone: '0690123456', siret: '12345678901234',
      bio: 'Dix ans de ménage à Saint-Barth', cats: ['menage'], rates: { menage: 35 } };
    window.__render();
    window.__back();                       // retour depuis une étape du dossier
    /* `loadProDraft` ne REND rien, il remplit `S.proForm` : on vide le formulaire en
       mémoire avant de recharger, sans quoi on mesurerait ce qui n'a jamais été
       enregistré. Une épreuve qui relit sa propre variable ne prouve rien. */
    const step = S.proStep, statut = S.proStatus;
    S.proForm = {};
    window.__dossier.charge();
    const a = S.proForm || {};
    return { step: step, statut: statut,
      nom: a.name, bio: a.bio, cats: a.cats || [], tel: a.phone, siret: a.siret };
  });
  ok(pro.step === null, 'le retour depuis une étape ramène au sommaire du dossier');
  ok(pro.statut === 'draft', 'et ne fait PAS renaître un formulaire vierge : le dossier reste un dossier');
  ok(pro.nom === 'Laure M.' && /Saint-Barth/.test(pro.bio || '') && pro.cats.indexOf('menage') >= 0
     && pro.tel === '0690123456' && pro.siret === '12345678901234',
    'ce qui a été saisi est enregistré au passage et RELU depuis le disque : nom, téléphone, SIRET, texte libre et métiers');

  console.log('G — un prestataire déjà inscrit ne revoit jamais le formulaire');
  const dejaInscrit = await mesure(() => {
    const S = window.__S;
    S.persona = 'pro'; S.proStatus = 'pending'; S.proStep = null; S.proNav = 'home';
    window.__render(); window.__back();
    return { statut: S.proStatus };
  });
  ok(dejaInscrit.statut === 'pending',
    'reculer depuis « candidature déposée » n’a pas de destination : on ne bouge pas, on ne lui redemande pas ses papiers');

  console.log('H — le retour depuis le suivi n’annule pas la commande');
  /* LE CHEMIN LE PLUS INQUIÉTANT DE `goBack`, et il est sain : il ANNULE la demande
     lorsqu'elle est « searching ». Vérifié, ce statut n'existe qu'en DÉMO — en mode réel
     `startSearch` pose « pending ». Une commande payée et en recherche n'est donc pas
     annulée par une flèche. On pose la garde parce que la conséquence serait grave et
     silencieuse : l'empreinte rendue, le prestataire averti, et l'utilisateur qui voulait
     seulement revenir en arrière. */
  const suivi = await mesure(() => {
    const S = window.__S;
    S.persona = 'client'; S.draft = null; S.payStep = false;
    const m = Object.assign(window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 }),
      { reqId: 'r1', _id: 'mr1', status: 'pending', when: 'Demain', slot: '09:00', zone: 'Gustavia' });
    S.missions = [m]; S.mission = m; S.clientNav = 'wallet';
    window.__render();
    window.__back();
    return { mission: !!S.mission, statut: m.status, encore: (S.missions || []).length,
      nav: S.clientNav };
  });
  ok(!suivi.mission && suivi.nav === 'wallet',
    'le retour quitte le suivi et ramène à la liste des réservations');
  ok(suivi.statut === 'pending' && suivi.encore === 1,
    'et la commande reste EN RECHERCHE : elle n’est ni annulée ni retirée, une flèche ne rend pas une empreinte bancaire');

  ok(errs.length === 0, 'aucune erreur JS sur ces parcours' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
