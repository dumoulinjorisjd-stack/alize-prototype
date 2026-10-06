/* « QUAND UN ARTISAN S'INSCRIT, IL COCHE S'IL PRATIQUE À DOMICILE OU SI LE CLIENT DOIT SE
   DÉPLACER ? IL FAUT ENSUITE CONFIGURER LA COMMANDE CLIENT POUR QU'IL SACHE. »

   NON, IL NE COCHE RIEN À L'INSCRIPTION. Le formulaire d'inscription prestataire demande
   nom, téléphone, e-mail, métiers, SIRET, adresse, assurance — jamais le lieu
   d'exercice. Le réglage « Lieu d'intervention » vit dans ses PARAMÈTRES, n'apparaît que
   s'il exerce un métier qui se pratique des deux façons, et vaut « à domicile ET dans mon
   salon » PAR DÉFAUT pour tout le monde.

   Le client, lui, CHOISISSAIT « chez le prestataire » et lisait « son adresse dès qu'il
   accepte ». Une adresse que personne n'avait peut-être saisie : `salonAddress` n'est
   exigé nulle part, et le serveur ne disait même pas s'il existait.

   TROIS CHANGEMENTS. Le serveur rend le FAIT (`salonPret`, un booléen — l'adresse
   elle-même n'a pas à circuler avant qu'une mission existe). L'écran de commande ne
   propose « chez le prestataire » que si quelqu'un peut vraiment recevoir. Et une
   pastille rouge le dit, des deux côtés : au prestataire qui a coché « le client vient
   chez moi » sans adresse, au client qui n'a enregistré aucune adresse. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const srv = fs.readFileSync(path.join(RACINE, 'functions/index.js'), 'utf8');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render && window.__cfg && window.__svc && window.__setFB);
  // SANS SESSION, `proDirFor` rend l'annuaire de DÉMONSTRATION et ignore celui qu'on
  // pose : l'épreuve mesurerait alors deux prestataires fictifs au lieu du cas voulu.
  await p.evaluate(() => window.__setFB({
    auth: { currentUser: { uid: 'u-test' } }, db: {},
    f: { doc: () => ({}), setDoc: () => Promise.resolve() },
    fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {},
  }));

  // L'annuaire du métier, tel que le serveur le rend. On le pose à la main : la
  // commande doit se régler sur CE QUI EXISTE, et c'est ce fait-là qu'on fait varier.
  const commande = (svc, annuaire) => p.evaluate(({ svc, annuaire }) => {
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'home'; S.jalons = {}; S._cfgVu = null;
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.mission = null; S.payStep = false;
    S._proDir = {}; if (annuaire !== null) S._proDir[svc] = { list: annuaire };
    S.draft = window.__newMission(window.__svc.trouve(svc));
    window.__cfg.render();
    const v = document.getElementById('view') || document.body;
    return {
      lieux: Array.from(v.querySelectorAll('[data-loc]')).map((x) => x.textContent.trim()),
      mode: S.draft.locationMode,
      texte: v.textContent || '',
    };
  }, { svc, annuaire });

  const AVEC = [{ uid: 'a', name: 'Maya', siteMode: 'both', salonPret: true, assure: true }];
  const SANS = [{ uid: 'b', name: 'Léa', siteMode: 'both', salonPret: false, assure: true },
    { uid: 'c', name: 'Jo', siteMode: 'domicile', salonPret: false, assure: true }];

  console.log('\nA — quelqu’un peut recevoir : le client a le choix');
  const avec = await commande('massage', AVEC);
  ok(avec.lieux.length === 2, 'les deux lieux sont proposés (' + avec.lieux.join(' / ') + ')');
  ok(/Chez le prestataire/.test(avec.lieux.join(' ')), 'dont « Chez le prestataire »');

  console.log('B — personne ne peut recevoir : on ne le propose plus');
  const sans = await commande('massage', SANS);
  ok(sans.lieux.length === 0,
    'le choix du lieu disparaît : il n’y a rien à choisir (' + sans.lieux.length + ' bouton)');
  ok(!/Son adresse dès qu’il accepte/.test(sans.texte),
    'et la promesse « son adresse dès qu’il accepte » ne s’écrit plus : elle n’aurait pas été tenue');

  console.log('C — un choix devenu impossible ne survit pas en silence');
  const bascule = await p.evaluate(({ SANS }) => {
    const S = window.__S;
    S._proDir = { massage: { list: SANS } };
    S.draft.locationMode = 'salon';     // comme s'il venait d'un brouillon enregistré
    window.__cfg.render();
    return S.draft.locationMode;
  }, { SANS });
  ok(bascule === 'domicile',
    'le brouillon repris revient « à domicile » (' + bascule + ')');

  console.log('D — tant qu’on ne SAIT pas, on n’affirme rien');
  const inconnu = await commande('massage', null);
  ok(inconnu.lieux.length === 2,
    'annuaire pas encore arrivé : le choix reste offert, il se corrigera en arrivant');

  console.log('E — le serveur rend le fait, pas l’adresse');
  ok(/salonPret: !!String\(a\.salonAddress \|\| ''\)\.trim\(\)/.test(srv),
    'listProviders dit SI le prestataire a une adresse de salon');
  ok(!/salonAddress: /.test(srv.slice(srv.indexOf('exports.listProviders'), srv.indexOf('exports.listProviders') + 3000)),
    'et ne fait pas circuler l’adresse elle-même avant qu’une mission existe');

  console.log('F — les deux pastilles rouges');
  ok(/\(\(sm==='salon'\|\|sm==='both'\)&&!String\(S\.proSalonAddress\|\|''\)\.trim\(\)\)/.test(src.replace(/\s+/g, '')) ||
     /sm==='salon'\|\|sm==='both'\)&&!String\(S\.proSalonAddress/.test(src),
    'le prestataire qui reçoit sans adresse porte « Adresse manquante »');
  const pastilleClient = await p.evaluate(() => {
    const S = window.__S;
    S.draft = null; S.payStep = false; S.clientNav = 'profile'; S.addresses = [];
    window.__render();
    // `document.body.textContent` contient AUSSI le script de la page : on lirait le
    // code source au lieu de l'écran, et l'assertion passerait toujours.
    const vu = () => ((document.getElementById('view') || {}).textContent || '');
    const sans = vu().indexOf('Adresse manquante') >= 0;
    S.addresses = [{ id: '1', label: 'Villa', address: 'Lurin', zone: 'Gustavia', geo: { lat: 17.9, lng: -62.8 } }];
    window.__render();
    const avec = vu().indexOf('Adresse manquante') >= 0;
    return { sans, avec };
  });
  ok(pastilleClient.sans, 'le client sans aucune adresse enregistrée la porte aussi');
  ok(!pastilleClient.avec, 'et elle disparaît dès qu’une adresse est enregistrée');

  /* G — DEUX POINTS RELEVÉS EN JOUANT LES 21 COMMANDES.

     « Journée » et « Semaine » veulent dire « choisissez votre heure ». C'est juste quand
     le prestataire se déplace, absurde quand c'est le CLIENT qui doit venir : une
     épilation définitive se fait en cabine, sur rendez-vous. La règle suit donc le LIEU,
     elle n'énumère pas les métiers — un massage dont le client a choisi le salon est dans
     le même cas.

     Et une garde d'enfants ne demandait nulle part COMBIEN d'enfants. On ne la branche
     pas sur `needsPeople` : cette liste MULTIPLIE le prix par le nombre de personnes, ce
     qui est juste pour un cours et faux pour une garde — le tarif est horaire, qu'il y
     ait un enfant ou trois. On demande le fait, on le dit, et on le montre au
     prestataire : le demander sans le lui transmettre ne servirait à rien. */
  console.log('G — ce que l’audit des 21 commandes a relevé');
  const laser = await commande('epilationdef', AVEC);
  ok(laser.texte.indexOf('Journée') < 0 && laser.texte.indexOf('Semaine') < 0,
    'épilation définitive : ni « Journée » ni « Semaine », le client vient sur rendez-vous');
  const massageSalon = await p.evaluate(({ AVEC }) => {
    const S = window.__S;
    S._proDir = { massage: { list: AVEC } };
    S.draft = window.__newMission(window.__svc.trouve('massage'));
    S.draft.locationMode = 'salon'; S._cfgVu = null;
    window.__cfg.render();
    const v = document.getElementById('view');
    return Array.from(v.querySelectorAll('[data-slotflex]')).map((x) => x.textContent.trim());
  }, { AVEC });
  ok(massageSalon.indexOf('Journée') < 0 && massageSalon.indexOf('Semaine') < 0,
    'et un massage CHEZ LE PRESTATAIRE non plus : c’est le lieu qui décide, pas le métier');
  const menage = await commande('menage', AVEC);
  ok(menage.texte.indexOf('Journée') >= 0,
    'le ménage les garde : c’est lui qui se déplace, la maison est là toute la journée');

  const garde = await commande('baby', AVEC);
  ok(garde.texte.indexOf('Combien d’enfants') >= 0 || garde.texte.indexOf("Combien d'enfants") >= 0,
    'le baby-sitting demande combien d’enfants');
  ok(garde.texte.indexOf('Le tarif horaire ne change pas') >= 0,
    'et DIT que le prix ne bouge pas : ce n’est pas une prestation par personne');
  ok(menage.texte.indexOf('enfants') < 0, 'le ménage ne le demande pas');
  ok(/kids:demandeEnfants\(m\.svc\)\?enfantsDe\(m\):null/.test(src),
    'la valeur part avec la demande');
  ok(/demandeEnfants\(r\.service\)&&Number\(r\.kids\)>0/.test(src),
    'et le prestataire la voit : la demander sans la transmettre ne servirait à rien');

  /* H — POINT 5 : UNE GARDE D'ANIMAUX A UNE HEURE DE DÉPÔT, ET ELLE SE NÉGOCIE.
     Le séjour se compte en JOURS, donc « Journée » et « Semaine » n'y ont rien à faire —
     `souplesseLarge` s'en charge. Mais le DÉPÔT a une heure, et un « ± 1 h » est
     exactement ce qui fait accepter une demande. On ne cachait pas trop peu, on cachait
     TOUT : la carte était muette sur le seul créneau qui existe. */
  console.log('H — la garde d’animaux peut assouplir son heure de dépôt');
  const animaux = await commande('animaux', AVEC);
  ok(animaux.texte.indexOf('Souplesse sur le créneau') >= 0,
    'la souplesse réapparaît sur un séjour compté en jours');
  ok(animaux.texte.indexOf('Journée') < 0 && animaux.texte.indexOf('Semaine') < 0,
    'mais sans « Journée » ni « Semaine » : le séjour les contient déjà');

  /* I — POINT 6 : « PUIS SUPPRIMÉE APRÈS LE RETRAIT. » L'écran du colis le promet au
     client pour la pièce d'identité du destinataire. Rien ne le tenait : elle part dans
     `requests/{id}/private/details` et n'en sortait qu'à la purge du COMPTE ENTIER.
     Une promesse sur une donnée d'identité qui ne se vérifie pas est pire qu'aucune
     promesse — le client la lit, et nous renseigne sur cette foi. */
  console.log('I — ce qu’on a promis d’effacer s’efface');
  ok(/exports\.purgerPiecesIdentite = onSchedule/.test(srv),
    'une purge quotidienne existe');
  ok(/'colis\.idFront': FieldValue\.delete\(\), 'colis\.idBack': FieldValue\.delete\(\)/.test(srv),
    'elle n’efface QUE les deux images : le nom, l’adresse et la facture restent');
  ok(/COLIS_ID_ETATS = \['done', 'rated', 'cancelled', 'declined', 'refuse'\]/.test(srv)
     && /COLIS_ID_GRACE_J = 7/.test(srv),
    'et seulement sur une mission terminée, après un délai de grâce : un retrait contesté se règle dans les jours qui suivent');
  ok(/if \(COLIS_ID_ETATS\.indexOf\(String\(r\.status \|\| ''\)\) < 0\) continue;/.test(srv),
    'une demande encore en cours n’est jamais touchée');

  /* J — « LE PROBLÈME EST POUR LE PRESTATAIRE DÉJÀ INSCRIT, COMMENT VA-T-ON CHOISIR ? »
     Personne ne l'a jamais déclaré, et l'absence était lue comme « les deux » PARTOUT,
     y compris sur l'écran du prestataire lui-même : il voyait une réponse qu'il n'avait
     pas donnée, et rien ne distinguait « n'a pas répondu » de « a répondu les deux ».
     Deux portes, décidées avec l'éditeur : la console règle le parc existant (il est
     petit, c'est plus rapide que d'attendre que chacun ouvre ses paramètres), et le
     formulaire d'inscription pose la question aux suivants pour ne pas refaire le trou.
     RIEN N'EST PRÉ-COCHÉ des deux côtés : une réponse par défaut est exactement ce qui a
     produit un parc entier de « les deux » que personne n'a choisis. */
  console.log('J — qui exerce où, et qui le déclare');
  const console_ = await p.evaluate(() => {
    const S = window.__S;
    S.persona = 'admin'; S.admin = { view: 'art', sel: 'a1' };
    S.adminArtisans = [
      { id: 'a1', uid: 'a1', real: false, name: 'Maya', status: 'valide', cats: ['massage'], siteMode: '', salonAddress: '' },
      { id: 'a2', uid: 'a2', real: false, name: 'Jo', status: 'valide', cats: ['plomberie'], siteMode: '', salonAddress: '' },
    ];
    window.__render();
    const v = document.getElementById('view'); const t = v.textContent || '';
    const boutons = Array.from(v.querySelectorAll('[data-adm^="artsite:"]')).map((x) => x.textContent.trim());
    return { t: t, boutons: boutons, nonDeclare: t.indexOf('Non déclaré') >= 0 };
  });
  ok(console_.boutons.length === 3,
    'la console propose les trois réponses (' + console_.boutons.join(' / ') + ')');
  ok(console_.nonDeclare,
    'et DIT que ce n’est pas déclaré, au lieu d’afficher « les deux » comme une réponse');
  const plombier = await p.evaluate(() => {
    const S = window.__S; S.admin = { view: 'art', sel: 'a2' }; window.__render();
    return document.querySelectorAll('[data-adm^="artsite:"]').length;
  });
  ok(plombier === 0,
    'la question ne se pose pas pour un plombier : il n’exerce aucun métier des deux façons');

  /* L'ÉTAPE « MÉTIERS & TARIFS » NE SE REND PAS DANS LE HARNAIS — elle dépend d'un état
     de dossier que le bac ne reconstitue pas, et je n'ai pas voulu la forcer : une épreuve
     qui tord l'application pour l'atteindre ne mesure plus l'application. On vérifie donc
     la fonction VIVANTE par sa source, et on le DIT ici plutôt que de laisser croire à une
     mesure d'écran. `proServicesSection` est bien celle qui sert : `proSignup()` existe
     dans le fichier mais n'est appelé NULLE PART — du code mort, sur lequel une épreuve
     passerait au vert en ne regardant rien. */
  const section = src.slice(src.indexOf('function proServicesSection(f){'),
    src.indexOf('function proSignup(){'));
  ok(section.indexOf('${lieuCard(f)}') >= 0,
    'l’étape « Métiers & tarifs » du dossier porte la question du lieu');
  const carte = src.slice(src.indexOf('function lieuCard(f){'), src.indexOf('function grilleCard(f){'));
  ok(/if\(!\(\(f\.cats\|\|\[\]\)\.some\(canOnSite\)\)\)return '';/.test(carte),
    'elle ne paraît que si un des sept métiers des deux façons est coché');
  ok(carte.indexOf("const sm=f.siteMode||'';") >= 0 && carte.indexOf("sm===x[0]?'on':''") >= 0,
    'et RIEN n’est pré-coché : la réponse par défaut est ce qui a produit le trou qu’on comble');
  ok(/\(sm==='salon'\|\|sm==='both'\)\?`<div class="field"[\s\S]{0,120}Adresse de votre local/.test(carte),
    '« le client vient chez moi » réclame aussitôt l’adresse du local');
  ok(/if\(b\.dataset\.psite!=null\)\{if\(S\.proForm\)\{S\.proForm\.siteMode=b\.dataset\.psite/.test(src)
     && /\[data-pdip\],\[data-psite\],/.test(src),
    'le bouton est branché ET atteignable par le gestionnaire de clics');
  ok(/siteMode:\(f\.siteMode\|\|''\),salonAddress:\(f\.salonAddress\|\|''\)\.trim\(\)/.test(src),
    'les deux partent avec la fiche à la création : la question ne sert à rien si la réponse se perd');

  /* K — « QUAND JE CHOISIS UN PRESTATAIRE QUI EXERCE UNIQUEMENT DANS SON LOCAL, ÇA ME
     DEMANDE ENCORE DE RENTRER MON ADRESSE. » Vérifié : vrai, et pas qu'un champ en trop.
     Le lieu ne dépendait que du bouton « Lieu de la prestation » ; la personne CHOISIE
     n'entrait nulle part dans le calcul. La demande partait donc en « à domicile » chez
     quelqu'un qui ne se déplace jamais — et côté serveur la diffusion filtre sur le LIEU
     avant de restreindre au prestataire demandé, donc elle n'atteignait PERSONNE, sans un
     mot. Le client attendait une réponse qui ne pouvait pas venir. */
  console.log('K — la personne choisie décide du lieu');
  const DIR = [{ uid: 'local', name: 'Maya', siteMode: 'salon', salonPret: true, assure: true },
    { uid: 'mobile', name: 'Jo', siteMode: 'domicile', salonPret: false, assure: true },
    { uid: 'deux', name: 'Ana', siteMode: 'both', salonPret: true, assure: true },
    { uid: 'sansAdr', name: 'Zoé', siteMode: 'salon', salonPret: false, assure: true }];
  const avecChoix = (uid) => p.evaluate(({ DIR, uid }) => {
    const S = window.__S;
    // Les sections précédentes ont promené l'état : on REPOSE la session, sinon
    // `proDirFor` bascule sur l'annuaire de DÉMONSTRATION et ignore le nôtre.
    window.__setFB({ auth: { currentUser: { uid: 'u-test' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve() },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    S.lang = 'fr'; S.onboarded = true; S.persona = 'client'; S.clientNav = 'home';
    S.guest = false; S.demoMode = false; S.proStatus = ''; S.admin = null;
    S.account = { name: 'C', email: 'c@e.fr', zone: 'Gustavia' };
    S.mission = null; S.payStep = false; S.addresses = []; S._proDir = { massage: { list: DIR } };
    S.draft = window.__newMission(window.__svc.trouve('massage'));
    if (uid) S.draft.preferredUid = uid;
    S._cfgVu = null; window.__cfg.render();
    const v = document.getElementById('view'); const t = v.textContent || '';
    return { adresse: /Adresse de la prestation/.test(t), gps: /Point GPS/.test(t),
      rdv: /Lieu du rendez-vous/.test(t), choix: v.querySelectorAll('[data-loc]').length,
      liste: t };
  }, { DIR, uid });

  const local = await avecChoix('local');
  ok(!local.adresse && !local.gps,
    'un prestataire qui n’exerce QUE dans son local : plus d’adresse ni de point GPS à saisir');
  ok(local.rdv, 'l’écran parle du « Lieu du rendez-vous »');
  ok(local.choix === 0, 'et le choix du lieu disparaît : il n’y a plus rien à choisir');

  const mobile = await avecChoix('mobile');
  ok(mobile.adresse && mobile.gps && mobile.choix === 0,
    'un prestataire qui ne fait QUE se déplacer : l’adresse est demandée, sans choix à faire');

  const deux = await avecChoix('deux');
  ok(deux.choix === 2, 'et celui qui fait les deux laisse le choix au client');

  const aucun = await avecChoix(null);
  ok(aucun.choix === 2 && aucun.adresse,
    'sans prestataire choisi, rien ne change : le client décide comme avant');

  /* UN PRESTATAIRE « LOCAL SEUL » SANS ADRESSE EST UN CUL-DE-SAC : le client le choisit,
     l'écran lui promet « son adresse dès qu'il accepte », et il n'y en a pas. */
  ok(aucun.liste.indexOf('Zoé') < 0 && aucun.liste.indexOf('Maya') >= 0,
    'il ne figure pas dans la liste où on le choisirait pour rien, les autres si');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
