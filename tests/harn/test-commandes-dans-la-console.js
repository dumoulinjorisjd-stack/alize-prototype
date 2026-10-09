/* « J'AI UNE PERSONNE QUI A PASSÉ UNE COMMANDE MAIS AUCUN MOYEN DE VOIR QUOI QUE CE SOIT
   DANS LA CONSOLE TANT QU'UN PRESTATAIRE N'A PAS ACCEPTÉ. »

   Exact, et pas seulement avant l'acceptation. La seule liste de la console,
   « Réservations en cours », était bâtie sur `S.mission` — c'est-à-dire la commande de
   L'ADMINISTRATEUR sur CET appareil — complétée de lignes de démonstration. Une commande
   réelle n'existait donc nulle part ailleurs que comme « +1 » dans le compteur par
   statut, et n'atteignait la messagerie que si quelqu'un y écrivait un message.

   LA DONNÉE ÉTAIT LÀ, L'ÉCRAN MANQUAIT : la console écoute déjà TOUTES les demandes
   (c'est ainsi qu'elle les compte), elle n'en gardait que le statut, le compte et la
   date. L'épreuve mesure ce que la console REND. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  /* La console d'un administrateur, avec les demandes telles que l'écoute les pose. */
  const console_ = (reqs, clients) => p.evaluate(({ reqs, clients }) => {
    window.__setFB({ auth: { currentUser: { uid: 'a', email: 'ccs.dumoulin@gmail.com' } }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.persona = 'admin';
    S.account = { name: 'A', email: 'ccs.dumoulin@gmail.com' };
    S.mission = null; S.draft = null;
    S.adminBookings = []; S.adminArtisans = []; S.adminClients = clients || [];
    S.adminArtsLoaded = true; S.adminClisLoaded = true;
    S.adminReqs = JSON.parse(JSON.stringify(reqs)); S.adminReqsLus = true;
    S.admin = { view: 'home' }; S._fold = { 'a-bookings': true };
    window.__render();
    const v = document.getElementById('view');
    const carte = Array.from(v.querySelectorAll('.foldc')).find((c) => /Réservations en cours/.test(c.textContent || ''));
    return { txt: carte ? (carte.textContent || '').replace(/\s+/g, ' ') : '(carte absente)',
      lignes: carte ? carte.querySelectorAll('.fold-body .card').length : 0 };
  }, { reqs, clients });

  const H = 3600000;
  const EN_RECHERCHE = { id: 'r1', status: 'pending', uid: 'c1', at: Date.now() - 5 * H,
    svc: 'menage', svcName: 'Ménage', when: 'Demain', slot: '09:00', zone: 'Lorient',
    total: 105, unit: 'h', duration: 3, client: 'Camille', provider: '', providerUid: '',
    directed: false, boostEur: 0 };

  /* A — UNE COMMANDE QUE PERSONNE N'A ENCORE ACCEPTÉE SE VOIT. C'est tout l'objet. */
  console.log('A — une commande en recherche se voit, avant toute acceptation');
  const A = await console_([EN_RECHERCHE], []);
  ok(A.lignes >= 1, 'la carte porte ' + A.lignes + ' ligne(s)');
  ok(/Ménage/.test(A.txt), 'on lit le métier');
  ok(/Camille/.test(A.txt), 'on lit le client');
  ok(/Demain/.test(A.txt) && /09:00/.test(A.txt) && /Lorient/.test(A.txt), 'le créneau et le secteur');
  ok(/105,00/.test(A.txt), 'et le montant');
  ok(/personne n’a encore accepté/.test(A.txt), 'et qu’aucun prestataire n’a accepté');

  /* B — L'ÂGE EST LE FAIT UTILE. « En recherche » ne se corrige pas, « en recherche
     depuis 5 h » si : c'est la seule ligne sur laquelle on peut agir. */
  console.log('B — l’âge d’une recherche, parce que c’est ce qui appelle un geste');
  ok(/depuis 5 h/.test(A.txt), 'la ligne dit depuis combien de temps elle cherche');
  const jeune = await console_([Object.assign({}, EN_RECHERCHE, { at: Date.now() - 20 * 60000 })], []);
  ok(/depuis 20 min/.test(jeune.txt), 'et en minutes quand c’est récent');

  /* C — LA COMMANDE DE L'ADMINISTRATEUR N'EST PLUS LA SOURCE. La liste venait de
     `S.mission` : sans commande en cours sur CET appareil, elle était vide même avec des
     demandes en base, et elle montrait une ligne même sans aucune demande en base. */
  console.log('C — la liste vient de la base, pas de l’appareil');
  const vide = await console_([], []);
  ok(/Aucune commande/.test(vide.txt) && vide.lignes === 0,
    'aucune demande en base : la carte le dit (' + vide.lignes + ' ligne)');
  const trois = await console_([EN_RECHERCHE,
    Object.assign({}, EN_RECHERCHE, { id: 'r2', status: 'accepted', provider: 'Maya', at: Date.now() - 2 * H }),
    Object.assign({}, EN_RECHERCHE, { id: 'r3', status: 'working', provider: 'Léa', at: Date.now() - H })], []);
  ok(trois.lignes === 3, 'trois demandes en base, trois lignes (' + trois.lignes + ')');
  ok(/3 commandes en cours/.test(trois.txt), 'et le nombre est annoncé');
  ok(/Maya/.test(trois.txt) && /Léa/.test(trois.txt), 'avec le prestataire quand il y en a un');

  /* D — LES COMPTES DE TEST RESTENT ÉCARTÉS, comme dans les autres cartes : deux cartes
     qui se contrediraient sur le même fait seraient pires qu'une carte absente. */
  console.log('D — les comptes de test sont écartés, comme ailleurs');
  const t = await console_([Object.assign({}, EN_RECHERCHE, { uid: 'ctest' })],
    [{ uid: 'ctest', name: 'Test', email: 't@e.fr', test: true }]);
  ok(t.lignes === 0, 'une demande d’un compte de test ne paraît pas (' + t.lignes + ' ligne)');

  /* E — CE QUI REVIENT D'UN COMPTE S'AFFICHE, IL NE DÉCIDE PAS. */
  console.log('E — une valeur hostile paraît inerte');
  const x = await console_([Object.assign({}, EN_RECHERCHE,
    { client: '<img src=x onerror=alert(1)>', svcName: '"><script>alert(2)</script>' })], []);
  ok(x.lignes >= 1 && /onerror/.test(x.txt), 'le texte hostile se LIT, en toutes lettres');
  const vivants = await p.evaluate(() => document.querySelectorAll('#view script, #view img[onerror]').length);
  ok(vivants === 0, 'et aucune balise ne s’est ouverte (' + vivants + ')');

  /* F — LA CONSOLE DIT CE QUI EST PARTI AUX PRESTATAIRES. « Rien ne semble être parti »
     n'avait aucune réponse : la diffusion décide en silence — garantie de paiement
     refusée, plafond du jour, aucun artisan du métier, personne de disponible — et ne
     laissait qu'une ligne dans les journaux du serveur, que la console ne lit pas. */
  console.log('F — qui a été prévenu, et sinon pourquoi');
  const envoyee = await console_([Object.assign({}, EN_RECHERCHE,
    { diff: { motif: 'envoyee', cibles: 4, push: 3, mail: 1 } })], []);
  ok(/4 prestataires prévenus/.test(envoyee.txt), 'combien ont été prévenus');
  ok(/3 par notification/.test(envoyee.txt) && /1 par e-mail/.test(envoyee.txt),
    'et par quel chemin — la notification ET l’e-mail de secours');
  for (const [motif, mot] of [['sans-garantie', /paiement n’a jamais été garanti/],
    ['plafond-client', /plafond de diffusions/],
    ['aucun-artisan', /aucun prestataire validé/],
    ['aucun-disponible', /disponible sur ce créneau/],
    ['dirige-introuvable', /prestataire demandé/]]) {
    const r = await console_([Object.assign({}, EN_RECHERCHE, { diff: { motif: motif, cibles: 0, push: 0, mail: 0 } })], []);
    ok(/Personne prévenu/.test(r.txt) && mot.test(r.txt), motif + ' : la raison est dite');
  }
  /* UNE DEMANDE D'AVANT CE CHAMP NE DIT RIEN plutôt que de dire « personne » : on ne
     sait pas, et ce n'est pas la même chose. */
  const muette = await console_([EN_RECHERCHE], []);
  ok(!/Personne prévenu/.test(muette.txt) && !/prévenus/.test(muette.txt),
    'une demande d’avant ce champ ne prétend rien');

  /* G — LA CONSOLE NE PEUT DIRE QUE CE QUE LE SERVEUR ÉCRIT. Aucun banc ne fait tourner
     les fonctions Firebase : le câblage se lit donc dans la source, comme pour l'anti-abus. */
  console.log('G — le câblage serveur, lu dans la source');
  const issues = ['sans-garantie', 'plafond-client', 'aucun-artisan', 'aucun-disponible', 'dirige-introuvable'];
  issues.forEach(function (m) {
    ok(SRV.indexOf("'" + m + "'") >= 0, 'le serveur sait écrire l’issue « ' + m + ' »');
  });
  ok((SRV.match(/_noterDiffusion\(/g) || []).length >= 8,
    'et il l’écrit à chaque sortie des deux chemins de diffusion ('
    + (SRV.match(/_noterDiffusion\(/g) || []).length + ' appels)');

  /* LE CHAMP EST RÉSERVÉ AU SERVEUR. Laissé libre, un compte écrirait « 12 prestataires
     prévenus » sur sa propre demande, et la console afficherait ce chiffre comme un fait. */
  ok(/'diffusion'\]/.test(RULES.replace(/\s+/g, ' ')) || /'diffusion'/.test(RULES),
    'la règle Firestore réserve `diffusion` au serveur');
  const dep = RULES.indexOf('function serverKeys()');
  const bloc = RULES.slice(dep, RULES.indexOf('];', dep));
  ok(/'diffusion'/.test(bloc), 'et c’est bien dans `serverKeys`, la liste que nul client ne peut écrire');

  /* UNE DEMANDE DIRIGÉE ATTEINT LA PERSONNE DEMANDÉE, en ligne ou non. Le chemin de la
     création le disait déjà ; la réouverture — par laquelle passe TOUTE commande réelle,
     puisqu'une demande naît « pending_payment » — appliquait `online` à tout le monde,
     y compris à elle. L'exemption ne servait donc jamais. */
  const rd = SRV.indexOf('exports.notifyReopenedRequest');
  const reopen = SRV.slice(rd, SRV.indexOf('exports.', rd + 20));
  ok(/if \(preferred && d\.id === preferred\)/.test(reopen),
    'à la réouverture, le prestataire demandé échappe au filtre « en ligne » et à la grille');

  /* ELLE REND CE QU'ELLE A FAIT : sans cela, l'appelant retombait sur le nombre de
     JETONS et annonçait des envois qui ont pu tous échouer. */
  ok(/return \{ successCount: ok, failureCount: ko \}/.test(SRV),
    'pushMulticast rend le nombre réellement envoyé');

  /* LES DEUX CHEMINS LISENT LE CONSENTEMENT PAR LA MÊME PORTE. La réouverture — celle
     que prend TOUTE commande réelle — se contentait de `pushTokens` : un prestataire qui
     avait COUPÉ ses notifications était quand même poussé, et comme un jeton périmé le
     faisait compter comme « joignable », il ne recevait pas non plus l'e-mail de
     secours. Il n'était prévenu par AUCUN chemin. */
  ok((SRV.match(/await _jetonsArtisans\(db,/g) || []).length === 2,
    'les deux chemins passent par la même porte à jetons');
  ok(!/\(\(u\.data\(\) \|\| \{\}\)\.pushTokens \|\| \[\]\)\.forEach/.test(SRV),
    'et plus personne ne lit `pushTokens` à côté de cette porte');
  const porte = SRV.slice(SRV.indexOf('async function _jetonsArtisans'), SRV.indexOf('/* CE QUI EST PARTI'));
  ok(/ud\.role && ud\.role !== 'artisan'/.test(porte), 'la porte écarte un compte qui n’est plus artisan');
  ok(/consent\[uid\] === false/.test(porte), 'elle respecte un refus de notifications');
  ok(/fcmOwners/.test(porte), 'et elle départage deux comptes sur un même téléphone');

  /* SANS APPAREIL ET SANS ADRESSE, PERSONNE NE LE PRÉVIENT — et on le comptait comme
     courriellé. Le chiffre que la console affiche doit être celui des envois RÉELS. */
  ok(/return envoyes;/.test(SRV), 'le repli e-mail rend le nombre d’envois réels');
  ok(/pro-injoignable/.test(SRV),
    'et un prestataire validé que rien ne peut joindre déclenche une alerte');

  /* H — FAIRE LE TRI. Rien n'expirait jamais une demande que personne n'a prise : le
     serveur promet pourtant, noir sur blanc, une demande « purgée 12 h après son
     créneau ». Des demandes d'essai de quatre-vingts jours étaient donc toujours
     comptées « en cours ». Le geste à la main est ici, la purge au serveur. */
  console.log('H — clore une demande que personne n’a prise');
  const clo = await p.evaluate(() => {
    const S = window.__S; const out = {};
    const bouton = function () { return document.querySelector('[data-adm^="reqclore:"]'); };
    out.offert = !!bouton();
    out.libelle = bouton() ? bouton().textContent.trim() : '';
    if (bouton()) bouton().click();
    out.arme = !!(bouton() && /Confirmer/.test(bouton().textContent));
    out.phrase = /empreinte bancaire du client est libérée/.test(document.getElementById('view').textContent || '');
    return out;
  });
  ok(clo.offert, 'une demande en recherche porte un bouton « Clore » (' + clo.libelle + ')');
  ok(clo.arme, 'un premier toucher ARME, il n’écrit rien');
  ok(clo.phrase, 'et l’écran dit ce que le second fera avant de le faire');

  /* ON NE PROPOSE PAS DE CLORE CE QUI EST ENGAGÉ. Clore une mission acceptée serait une
     annulation : un prestataire s'est engagé, une empreinte tient, une indemnité peut
     être due — cela se décide dans la mission, pas dans une liste. */
  for (const st of ['accepted', 'working', 'done_pro', 'paid']) {
    const r = await console_([Object.assign({}, EN_RECHERCHE, { status: st, provider: 'Maya' })], []);
    const offert = await p.evaluate(() => !!document.querySelector('[data-adm^="reqclore:"]'));
    ok(!offert, st + ' : aucun bouton « Clore » — ce n’est plus une demande qui cherche');
  }

  /* LA PURGE AUTOMATIQUE, lue dans la source : aucun banc ne fait tourner les tâches. */
  const purge = SRV.slice(SRV.indexOf('exports.expirerDemandesNonHonorees'),
    SRV.indexOf('exports.autoValidate'));
  ok(purge.length > 100, 'le serveur porte une tâche qui expire les demandes non honorées');
  ok(/where\('status', '==', 'pending'\)/.test(purge),
    'elle ne touche QUE ce qui cherche encore, jamais une mission acceptée');
  ok(/PURGE_APRES_MS/.test(purge) && /12 \* 3600000/.test(SRV),
    'douze heures APRÈS LE CRÉNEAU, pas après la création');
  ok(/dateISO/.test(purge) && /sansDate\+\+/.test(purge),
    'et sans date lisible elle ne devine pas : elle laisse la demande et le dit');
  ok(/runTransaction/.test(purge),
    'elle relit dans une transaction : une demande acceptée à la seconde près n’est pas écrasée');

  /* I — UNE COMMANDE ANNULÉE NE DISPARAÎT PLUS EN SILENCE. « Si une commande est
     finalement annulée il faut bien que la console le signale. » Elle quittait la carte
     sans un mot — ni « en cours » ni « réglée » — et ne restait qu'en « +1 » dans le
     compteur par statut. Or c'est l'issue qui appelle le plus souvent un geste. */
  console.log('I — une commande annulée, et ce qui s’est passé à la fin');
  const H2 = 3600000;
  const ANNUL = Object.assign({}, EN_RECHERCHE, { id: 'r9', status: 'cancelled',
    fin: Date.now() - 2 * H2, tardive: false, frais: 0, decision: 'none' });
  const ann = await console_([ANNUL], []);
  ok(/Annulées ou expirées/.test(ann.txt), 'elles ont leur section');
  ok(ann.lignes >= 1, 'et la commande y figure');
  ok(/Annulée depuis 2 h, sans frais/.test(ann.txt),
    'avec ce qui s’est passé : quand, et sans frais');
  ok(/Annulée/.test(ann.txt) && !/Annulées/.test(ann.txt.replace('Annulées ou expirées', '')),
    'et la pastille parle au singulier — une ligne n’est pas un compteur');

  /* UNE ANNULATION TARDIVE N'EST PAS UNE ANNULATION : une part reste due, et c'est le
     PRESTATAIRE qui décide. Tant qu'il n'a pas tranché, quelque chose attend vraiment. */
  const tard = await console_([Object.assign({}, ANNUL, { tardive: true, frais: 52.5, decision: 'pending' })], []);
  ok(/Annulée tardivement/.test(tard.txt), 'une annulation tardive est nommée comme telle');
  ok(/52,50/.test(tard.txt) && /décision du prestataire/.test(tard.txt),
    'avec l’indemnité en jeu et qui doit trancher');
  const levee = await console_([Object.assign({}, ANNUL, { tardive: true, frais: 52.5, decision: 'waived' })], []);
  ok(/levée par le prestataire/.test(levee.txt), 'et une fois tranchée, on sait ce qu’il a décidé');

  /* UNE EXPIRATION N'EST PAS UNE ANNULATION : personne n'a renoncé, personne n'a pris. */
  const exp = await console_([Object.assign({}, EN_RECHERCHE, { id: 'rx', status: 'expired',
    fin: Date.now() - 30 * H2, parQui: 'auto' })], []);
  ok(/Expirée/.test(exp.txt) && /faute de preneur/.test(exp.txt),
    'une demande expirée dit qu’elle n’a trouvé personne');
  const clos = await console_([Object.assign({}, EN_RECHERCHE, { id: 'rc', status: 'expired',
    fin: Date.now() - H2, parQui: 'admin' })], []);
  ok(/close depuis la console/.test(clos.txt),
    'et celle que vous avez close le dit — ce n’est pas le même fait');

  /* LES ARRÊTÉES PASSENT AVANT LES RÉGLÉES : c'est là qu'il peut y avoir un geste. */
  const melange = await console_([ANNUL,
    Object.assign({}, EN_RECHERCHE, { id: 'rp', status: 'paid', at: Date.now() - H2 })], []);
  const iArr = melange.txt.indexOf('Annulées ou expirées'), iReg = melange.txt.indexOf('Dernières réglées');
  ok(iArr >= 0 && iReg >= 0 && iArr < iReg,
    'elles sont placées avant les réglées (les deux sections présentes, dans cet ordre)');

  /* ET CE QU'ON NE MONTRE PAS, ON LE DIT. Une septième annulation qui disparaîtrait en
     silence serait le défaut même qu'on vient de corriger, à six près. */
  const huit = []; for (let i = 0; i < 8; i++) huit.push(Object.assign({}, ANNUL, { id: 'a' + i, fin: Date.now() - i * H2 }));
  const trop = await console_(huit, []);
  ok(trop.lignes === 6, 'la section en montre six au plus (' + trop.lignes + ')');
  ok(/et 2 autres plus anciennes/.test(trop.txt), 'et elle dit combien restent derrière');

  /* ET PAS UN SEUL TIRET CADRATIN. « Enlève les tirets cadratins partout dans
     l'application » : la règle vaut aussi pour la console, que le balayage des quinze
     écrans ne visite pas. Elle s'éprouve donc ici, sur ce que la carte REND, avec toutes
     les formes de ligne à la fois. Un tiret écrit demain fait rougir celle-ci. */
  const toutes = await console_([
    ANNUL,
    Object.assign({}, ANNUL, { id: 'r9b', tardive: true, frais: 52.5, decision: 'pending' }),
    Object.assign({}, ANNUL, { id: 'r9c', tardive: true, frais: 52.5, decision: 'waived' }),
    Object.assign({}, ANNUL, { id: 'r9d', tardive: true, frais: 52.5, decision: 'applied' }),
    Object.assign({}, EN_RECHERCHE, { id: 'rx2', status: 'expired', fin: Date.now(), parQui: 'auto' }),
    Object.assign({}, EN_RECHERCHE, { id: 'rx3', status: 'expired', fin: Date.now(), parQui: 'admin' }),
    Object.assign({}, EN_RECHERCHE, { id: 'rd', diff: { motif: 'aucun-disponible', cibles: 0, push: 0, mail: 0 } }),
    Object.assign({}, EN_RECHERCHE, { id: 'rd2', diff: { motif: 'envoyee', cibles: 3, push: 2, mail: 1 } }),
    Object.assign({}, EN_RECHERCHE, { id: 'rp2', status: 'paid', provider: 'Prestataire' }),
  ], []);
  ok(toutes.txt.indexOf('\u2014') < 0,
    'pas un seul tiret cadratin sur la carte, toutes formes de ligne confondues');
  ok(/Camille Demain/.test(toutes.txt),
    'et sans prestataire la flèche ne paraît pas : elle promettrait un destinataire');
  ok(/Camille → Prestataire/.test(toutes.txt), 'alors qu’avec un prestataire elle le nomme');

  /* J — LA PROJECTION ELLE-MÊME. Les sections précédentes posent `S.adminReqs` à la
     main : elles mesurent ce que la console REND, jamais ce qu'elle GARDE du document.
     Un champ qui cesserait d'être recopié se serait donc tu sans faire rougir personne.
     Et il y a un piège réel : le navigateur écrit la date d'arrêt en nombre
     (`Date.now()`), le balayage nocturne du serveur en horodatage (`serverTimestamp()`,
     qui porte `.toMillis()`) — `Number()` sur le second rend NaN, donc « pas de date ». */
  console.log('J — ce que la console garde du document, les deux formes de date comprises');
  const proj = await p.evaluate(({ t }) => {
    const num = window.__cmd.projette('r1', { status: 'cancelled', cancelledAt: t - 7200000,
      lateCancel: true, cancelFee: 52.5, feeDecision: 'pending', clientName: 'Camille' });
    /* Un horodatage serveur, tel que le SDK le rend : un objet qui sait se convertir. */
    const horo = window.__cmd.projette('r2', { status: 'expired', expiredBy: 'auto',
      expiredAt: { toMillis: function () { return t - 108000000; } } });
    const sans = window.__cmd.projette('r3', { status: 'pending' });
    return { num: num, horo: horo, sans: sans,
      dateNum: window.__cmd.date(t), dateHoro: window.__cmd.date({ toMillis: function () { return t; } }),
      dateVide: window.__cmd.date(null), dateTexte: window.__cmd.date('bonjour') };
  }, { t: Date.now() });
  ok(proj.num.fin > 0 && proj.num.tardive === true && proj.num.frais === 52.5
    && proj.num.decision === 'pending',
    'une annulation tardive est recopiée en entier : quand, tardive, indemnité, décision');
  ok(proj.horo.fin > 0 && proj.horo.parQui === 'auto',
    'un horodatage SERVEUR donne bien une date — le balayage nocturne n’écrit pas un nombre');
  ok(proj.sans.fin === 0 && proj.sans.tardive === false,
    'et une demande vivante ne porte aucune fin');
  ok(proj.dateNum > 0 && proj.dateHoro > 0 && proj.dateVide === 0 && proj.dateTexte === 0,
    'la lecture d’une date accepte les deux formes et refuse le reste');
  /* Et l'on ne recopie PAS l'adresse : elle vit dans la sous-collection privée de la
     demande, la console n'a pas à la sortir pour dresser une liste. */
  const fuite = await p.evaluate(() => Object.keys(window.__cmd.projette('r', {
    status: 'pending', address: '12 rue des Lataniers', addr: 'x', phone: '0690', email: 'a@b.c',
  })));
  ok (fuite.indexOf('address') < 0 && fuite.indexOf('addr') < 0
    && fuite.indexOf('phone') < 0 && fuite.indexOf('email') < 0,
    'ni adresse, ni téléphone, ni courriel : la liste est fermée');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
