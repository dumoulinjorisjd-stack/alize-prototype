/* « QUAND LA PRESTATION SOUHAITÉE EST DÉPASSÉE DANS LE TEMPS VOULU, IL FAUT QUE LE CLIENT
   REÇOIVE UNE NOTIFICATION QUI LUI PROPOSE DE METTRE UNE NOUVELLE DATE OU DE L'ANNULER. »
   — l'éditeur, le 16/10/2026.

   AVANT : la demande se fermait toute seule à quatre heures du matin, douze heures après
   son créneau, et le client ne l'apprenait que par la notification d'EXPIRATION, quand il
   n'y avait plus rien à décider. Aucun écran ne disait « votre créneau est passé », aucun
   geste n'était offert.

   CE QUE CETTE ÉPREUVE TIENT, et qui n'est pas qu'un affichage :
   • la fin du créneau est écrite UNE fois et les deux tâches la lisent, sinon l'une
     fermerait ce que l'autre n'a pas encore annoncé ;
   • la souplesse en fait partie : une demande « n'importe quelle heure dans la journée »
     n'est pas dépassée à neuf heures du matin ;
   • un COLIS n'a pas de `dateISO` du tout (l'écran de commande ne le remplit jamais) :
     toutes les commandes de ce métier étaient sautées par l'expiration, et restaient en
     recherche pour toujours avec l'empreinte bancaire de leur client dessus ;
   • on n'expire pas ce qu'on n'a pas demandé, ni moins de douze heures après l'avoir
     demandé — sinon la relance arrive et la demande meurt pendant qu'on y répond ;
   • la clé du rendez-vous s'invalide d'elle-même : déplacée, la demande repart, et
     PERSONNE n'a à effacer un champ qui ne lui appartient pas. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const D = require(path.join(RACINE, 'functions', 'creneau-depasse.js'));
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

const H = 3600000;
const jPlus = (n) => { const d = new Date(Date.now() + n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// Une demande en recherche, pour un rendez-vous DONNÉ (aucune horloge dans le noyau).
const dem = (x) => Object.assign({ status: 'pending', service: 'menage', serviceName: 'Ménage',
  dateISO: '2026-10-10', slot: '09:00' }, x || {});
// 2026-10-10 09:00 à Saint-Barth (UTC−4)
const T0900 = Date.parse('2026-10-10T09:00:00-04:00');

(async () => {
  /* ── A. LA FIN DU CRÉNEAU ─────────────────────────────────────────────────────── */
  console.log('A — quand le créneau finit, vraiment');
  ok(D.finDuCreneau(dem()) === T0900, 'une heure précise finit à cette heure-là, en heure de Saint-Barth');
  ok(D.finDuCreneau(dem({ slot: '' })) === Date.parse('2026-10-10T23:59:00-04:00'),
    'sans heure, la journée entière lui est laissée');
  ok(D.finDuCreneau(dem({ slotFlex: 60 })) === T0900 + H,
    'une souplesse de 60 min repousse la fin d’autant : le prestataire avait le droit de venir plus tard');
  ok(D.finDuCreneau(dem({ slotFlex: 'day' })) === Date.parse('2026-10-10T23:59:00-04:00'),
    'souplesse JOURNÉE : la fin est celle du jour, pas l’heure résiduelle de la commande');
  ok(D.finDuCreneau(dem({ slotFlex: 'week' })) === Date.parse('2026-10-16T23:59:00-04:00'),
    'souplesse SEMAINE : six jours de plus, comme le dit l’écran au client');
  ok(D.finDuCreneau(dem({ slotFlex: 99999 })) === T0900 + 24 * H,
    'une souplesse abîmée est BORNÉE à une journée, elle ne repousse pas l’échéance à l’année prochaine');
  ok(D.finDuCreneau({ status: 'pending', service: 'colis', dateISO: '', slot: '',
    dateFrom: '2026-10-10', dateTo: '2026-10-17' }) === Date.parse('2026-10-17T23:59:00-04:00'),
    'UN COLIS n’a pas de dateISO : c’est la fin de sa fenêtre de retrait qui fait foi');
  ok(D.finDuCreneau({ status: 'pending', service: 'colis', dateFrom: '2026-10-10' }) === Date.parse('2026-10-10T23:59:00-04:00'),
    'et s’il n’a qu’un début de fenêtre, c’est lui');
  ok(D.finDuCreneau(dem({ dateISO: '' })) === null && D.finDuCreneau(dem({ dateISO: 'demain' })) === null,
    'sans aucune date, on rend « je ne sais pas » plutôt que de deviner');

  /* ── B. LES TROIS ISSUES ──────────────────────────────────────────────────────── */
  console.log('B — relancer, attendre, fermer');
  const v = (r, t) => D.creneauDepasse(r, t);
  ok(v(dem(), T0900 - H).motif === 'a-venir' && !v(dem(), T0900 - H).relancer,
    'une heure avant le rendez-vous, on ne dit rien');
  ok(v(dem(), T0900 + 60000).relancer, 'une minute après, le créneau est passé et l’on relance');
  ok(v(dem({ status: 'accepted' }), T0900 + 99 * H).motif === 'pas-en-recherche',
    'une demande acceptée ne relève pas de ce balayage : elle a un prestataire engagé');
  ok(v(dem({ dateISO: '' }), T0900 + 99 * H).motif === 'sans-date' && !v(dem({ dateISO: '' }), T0900 + 99 * H).expirer,
    'sans date, ni relance ni fermeture, et le motif le DIT au journal');

  const cle = D.cleCreneau(dem());
  const prevenu = (t) => dem({ relancePour: cle, relanceAt: t });
  ok(!v(prevenu(T0900 + H), T0900 + 2 * H).relancer,
    'une fois prévenu pour CE rendez-vous, on ne le prévient plus');
  ok(v(prevenu(T0900 + H), T0900 + 2 * H).motif === 'prevenu', 'il a la main, et le journal le dit');
  ok(!v(prevenu(T0900 + H), T0900 + 12.5 * H).expirer,
    'DOUZE HEURES APRÈS LA RELANCE, pas seulement après le créneau : prévenu à 10 h, '
    + 'il n’est pas fermé à 21 h 30 — sinon le rattrapage d’une tâche arrêtée tuerait la demande pendant qu’on y répond');
  ok(v(prevenu(T0900 + H), T0900 + 13.5 * H).expirer, 'passé les deux délais, elle se ferme');
  ok(!v(dem(), T0900 + 99 * H).expirer && v(dem(), T0900 + 99 * H).relancer,
    'et JAMAIS sans avoir demandé : une demande vieille de quatre jours est d’abord relancée');
  ok(!v(dem({ relancePour: cle }), T0900 + 99 * H).motif.length === false
    && v(dem({ relancePour: cle }), T0900 + 99 * H).relancer,
    'une fiche à moitié écrite (clé sans horodatage) repart en relance au lieu de bloquer la demande pour toujours');

  console.log('C — la clé du rendez-vous s’invalide d’elle-même');
  ok(D.cleCreneau(dem({ dateISO: '2026-10-14' })) !== cle, 'changer de jour change la clé');
  ok(D.cleCreneau(dem({ slot: '14:00' })) !== cle, 'changer d’heure aussi');
  ok(D.cleCreneau(dem({ slotFlex: 'day' })) !== cle,
    'et ÉLARGIR À LA JOURNÉE aussi : c’est un autre rendez-vous, sinon la demande élargie resterait « déjà relancée »');
  ok(v(dem({ dateISO: '2026-10-14', relancePour: cle, relanceAt: T0900 + H }), Date.parse('2026-10-14T09:00:00-04:00') + H).relancer,
    'déplacée, la demande est relancée pour sa NOUVELLE date sans que personne n’ait rien effacé');
  ok(D.cleCreneau(dem({ dateISO: '' })) === '', 'sans date, pas de clé : on ne prévient pas pour un rendez-vous inconnu');

  /* ── D. CE QU'ON ÉCRIT AU CLIENT ──────────────────────────────────────────────── */
  console.log('D — la phrase qui part');
  const t1 = D.texteRelance(dem());
  ok(/créneau est passé/i.test(t1.titre), 'le titre dit le fait');
  ok(/10 octobre/.test(t1.corps) && /09:00/.test(t1.corps), 'le corps nomme le rendez-vous');
  ok(/nouvelle date/.test(t1.corps) && /annul/i.test(t1.corps), 'et il offre les DEUX gestes, comme demandé');
  ok(/rien ne vous a été prélevé/.test(t1.corps), 'il lève la seule inquiétude qui compte');
  ok(!/—/.test(t1.corps) && !/—/.test(t1.titre), 'aucun tiret cadratin dans ce qui s’affiche');
  ok(!/Demain|Aujourd/.test(D.texteRelance(dem({ when: 'Demain' })).corps),
    'il ne recopie PAS l’étiquette figée à la commande : « Demain » envoyé le surlendemain dirait n’importe quoi');
  ok(!/09:00/.test(D.texteRelance(dem({ slotFlex: 'day' })).corps),
    'une demande souple n’annonce aucune heure : son `slot` résiduel contredirait ce que le client a choisi');
  ok(/17 octobre/.test(D.texteRelance({ service: 'colis', serviceName: 'Colis & courrier',
    dateFrom: '2026-10-10', dateTo: '2026-10-17' }).corps), 'un colis parle de sa fenêtre');
  ok(D.texteRelance({ serviceName: 'x'.repeat(300) }).corps.indexOf('x'.repeat(61)) < 0,
    'et le nom du service est borné');

  /* ── E. LES DEUX TÂCHES SERVEUR ───────────────────────────────────────────────── */
  console.log('E — ce que le serveur fait, et une seule fois');
  ok(/exports\.relancerDemandesDepassees = onSchedule\(\{schedule: 'every 1 hours'/.test(SRV),
    'la relance a sa propre horloge, toutes les heures : à 04:10 elle arriverait après la fermeture');
  const R = SRV.slice(SRV.indexOf('exports.relancerDemandesDepassees'), SRV.indexOf('exports.relancerDemandesDepassees') + 3000);
  ok(/runTransaction/.test(R) && R.indexOf('tx.update') < R.indexOf('pushMulticast'),
    'elle ÉCRIT la trace avant de prévenir : une notification partie deux fois est pire qu’une trace manquante');
  ok(/DEPASSE\.creneauDepasse\(cur\.data\(\) \|\| \{\}, now\)\.relancer/.test(R),
    'et la transaction revérifie avec LE MÊME noyau, pas avec un bout de condition recopié');
  ok(/userPushTokens/.test(R) && /sendMail/.test(R),
    'push ET courriel : un compte sans jeton est le cas ordinaire, pas l’exception');
  ok(/relancePour: cle, relanceAt: now/.test(R), 'elle pose la clé du rendez-vous et l’heure');
  const E = SRV.slice(SRV.indexOf('exports.expirerDemandesNonHonorees'), SRV.indexOf('exports.expirerDemandesNonHonorees') + 1800);
  ok(/DEPASSE\.creneauDepasse/.test(E) && !/Date\.parse/.test(E),
    'l’expiration ne calcule plus sa propre date : elle lit le même noyau que la relance');
  ok(/'relancePour','relanceAt'\]/.test(RULES),
    'et les deux champs sont réservés au serveur : sinon un compte se déclarerait « déjà relancé » pour repousser sa fermeture');

  /* ── F. L'ÉCRAN DU CLIENT ─────────────────────────────────────────────────────── */
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1600 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__passe);

  console.log('F — les deux clés disent la même chose des deux côtés');
  const cas = [dem(), dem({ slot: '' }), dem({ slotFlex: 'day' }), dem({ slotFlex: 'week' }),
    dem({ slotFlex: 45 }), dem({ slotFlex: 99999 }), dem({ dateISO: '' }), dem({ dateISO: 'bof' }),
    { service: 'colis', dateFrom: '2026-10-10', dateTo: '2026-10-17' },
    { service: 'colis', dateFrom: '2026-10-10' }, { service: 'colis' }];
  const client = await p.evaluate((l) => l.map((x) => window.__passe.cle(Object.assign({ svc: x.service }, x))), cas);
  const serveur = cas.map((x) => D.cleCreneau(x));
  ok(client.join('|') === serveur.join('|'),
    'l’application reconstruit EXACTEMENT la clé du serveur sur ' + cas.length
    + ' cas : c’est cette épreuve qui tient les deux ensemble, pas la mémoire de qui touchera l’une des deux');

  console.log('G — la carte paraît quand le serveur l’a dit, et pas avant');
  const ecran = (extra) => p.evaluate(({ extra, demain }) => {
    const S = window.__S;
    window.__setFB({ auth: { currentUser: { uid: 'cli1', email: 'c@x.c' } }, db: {},
      f: { doc: function () { return { _p: [] }; }, collection: function () { return {}; },
        onSnapshot: function () { return function () {}; }, updateDoc: function () { return Promise.resolve(); },
        setDoc: function () { return Promise.resolve(); } },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'wallet'; S.cancelAsk = null; S.redate = null;
    S.account = { name: 'Camille', email: 'c@x.c', uid: 'cli1', role: 'client' };
    S.adminMetier = { menage: { ouvre: 480, ferme: 1080 } };
    S.contrePropsRecues = {};
    const m = Object.assign(window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 }), {
      reqId: 'r1', _id: 'mr1', status: 'pending', when: 'Hier', dateISO: '2026-10-10',
      slot: '09:00', slotFlex: 0, zone: 'Gustavia', duration: 2, provider: null,
      // créée il y a trois heures : l'escalade d'attente (45 min) voudrait paraître
      _createdMs: Date.now() - 3 * 3600000,
    }, extra || {});
    S.missions = [m]; S.mission = m;
    window.__render();
    const view = document.getElementById('view');
    return { txt: (view.textContent || '').replace(/\s+/g, ' '),
      annuler: view.querySelectorAll('[data-act="cancel-mission"]').length,
      jours: view.querySelectorAll('[data-ndday]').length,
      heures: view.querySelectorAll('[data-ndslot]').length,
      bouton: (function () { const el = view.querySelector('[data-act^="redate:"]');
        return el ? { lbl: el.textContent.replace(/\s+/g, ' ').trim(), act: el.dataset.act } : null; })(),
      carte: window.__passe.encours(S.mission) };
  }, { extra, demain: jPlus(1) });

  const avant = await ecran(null);
  ok(!avant.carte && !avant.bouton, 'tant que le serveur n’a rien dit, aucune carte : c’est LUI qui juge, pas l’horloge du téléphone');
  ok(/Toujours en recherche/.test(avant.txt), 'et l’escalade d’attente ordinaire est bien là (sans elle, la mesure suivante ne prouverait rien)');
  ok(avant.annuler === 1, 'un seul « Annuler la demande », celui du bas');

  const cleR1 = D.cleCreneau({ dateISO: '2026-10-10', slot: '09:00' });
  const apres = await ecran({ relancePour: cleR1, relanceAt: Date.now() - 3600000 });
  ok(apres.carte && /Votre créneau est passé/.test(apres.txt), 'une fois relancé, la carte paraît');
  ok(/rien ne vous a été prélevé/i.test(apres.txt), 'elle lève l’inquiétude, comme la notification');
  ok(/se fermera d’elle-même/.test(apres.txt), 'et elle DIT ce qui arrive si l’on ne fait rien, ce que personne ne disait');
  ok(apres.jours === 1 && apres.heures === 1, 'deux menus : un jour, une heure');
  /* LE LIBELLÉ DOIT PORTER CE QUE L'ATTRIBUT ÉCRIRA, c'est tout l'intérêt d'un bouton qui
     nomme son geste. On ne compare pas à une formule figée : on vérifie que l'heure du
     `data-act` se lit dans le libellé. (Et la préposition a disparu : « Déplacer AU
     Aujourd'hui » se lisait sur la capture, les libellés relatifs et les dates ne
     prennent pas la même.) */
  const vAp = apres.bouton ? apres.bouton.act.slice('redate:'.length).split('|') : [];
  ok(!!apres.bouton && /Déplacer/.test(apres.bouton.lbl) && apres.bouton.lbl.indexOf(vAp[1] || '\u0000') >= 0,
    'et un bouton qui NOMME le rendez-vous qu’il va écrire (' + (apres.bouton ? apres.bouton.lbl : '—') + ')');
  ok(!/ au Aujourd|au Demain/.test(apres.bouton ? apres.bouton.lbl : ''),
    'sans préposition bancale devant un libellé relatif');
  ok(!/Toujours en recherche/.test(apres.txt) && !/Coup de pouce|Personne ne répond/.test(apres.txt),
    'la carte REMPLACE l’escalade d’attente et le coup de pouce : élargir à une journée qui est finie ne sert à rien');
  ok(apres.annuler === 1,
    'et il reste UN SEUL « Annuler », dans la carte : le même geste à deux endroits du même écran est le doublon qu’on nous a signalé');

  const souple = await ecran({ slotFlex: 'day', relancePour: D.cleCreneau({ dateISO: '2026-10-10', slot: '09:00', slotFlex: 'day' }), relanceAt: Date.now() - 3600000 });
  ok(souple.carte && souple.jours === 1 && souple.heures === 0,
    'une demande souple ne redemande QUE le jour : lui faire choisir une heure contredirait son propre choix');
  ok(/laissez le prestataire choisir l’heure/.test(souple.txt), 'et la carte le dit');

  console.log('H — déplacer, et ce que cela écrit');
  const pat = await p.evaluate(({ j }) => ({
    bon: window.__passe.patch(j, '09:00', 'Demain', 0, 1700000000000),
    sansDate: window.__passe.patch('', '09:00', 'Demain', 0, 1),
    sansHeure: window.__passe.patch(j, '', 'Demain', 0, 1),
    souple: window.__passe.patch(j, '09:00', 'Demain', 'day', 1700000000000),
  }), { j: jPlus(2) });
  ok(pat.bon && pat.bon.status === 'pending', 'la demande reste en recherche, elle ne renaît pas');
  ok(pat.bon.dateISO === jPlus(2) && pat.bon.slot === '09:00' && pat.bon.slotFlex === 0, 'au nouveau rendez-vous');
  ok(pat.bon.reboostedAt === 1700000000000,
    'et TOUT LE MONDE est re-sollicité : une nouvelle date est une nouvelle chance, y compris pour ceux qui avaient passé');
  ok(!('relancePour' in pat.bon) && !('relanceAt' in pat.bon),
    'elle n’efface NI la clé NI l’horodatage : ils appartiennent au serveur, et la clé s’invalide toute seule');
  ok(!('providerUid' in pat.bon) && !pat.bon.directed,
    'et elle n’adresse la demande à personne : c’est le client qui déplace, aucun prestataire n’a rien proposé');
  ok(pat.sansDate === null && pat.sansHeure === null, 'une date ou une heure manquante ne produit rien plutôt qu’un rendez-vous faux');
  ok(pat.souple.slotFlex === 'day' && pat.souple.slot === '',
    'une demande souple garde sa souplesse et PERD son heure, sinon la nouvelle date serait jugée sur une heure que personne n’a demandée');

  /* ON REVIENT SUR L'ÉCRAN À HEURE PRÉCISE : le dernier rendu était la demande souple.
     ET L'ON NE MESURE PAS « la date a changé » — la date par défaut proposée est souvent
     AUJOURD'HUI, donc elle peut légitimement ne pas bouger, et c'est l'heure qui se
     déplace. La vraie propriété est que LE BOUTON ÉCRIT CE QU'IL ANNONCE. */
  await ecran({ relancePour: cleR1, relanceAt: Date.now() - 3600000 });
  const deplace = await p.evaluate(() => {
    const el = document.querySelector('[data-act^="redate:"]'); if (!el) return { fait: false };
    const v = el.dataset.act.slice('redate:'.length).split('|');
    const avant = { dateISO: window.__S.mission.dateISO, slot: window.__S.mission.slot };
    el.click();
    const m = window.__S.mission;
    return { fait: true, promis: { dateISO: v[0], slot: v[1] || '' }, avant: avant,
      apres: { dateISO: m.dateISO, slot: m.slot }, statut: m.status,
      carte: window.__passe.encours(m),
      txt: (document.getElementById('view').textContent || '').replace(/\s+/g, ' ') };
  });
  ok(deplace.fait, 'le bouton est là et se clique');
  ok(deplace.apres.dateISO === deplace.promis.dateISO && deplace.apres.slot === deplace.promis.slot,
    'et il écrit EXACTEMENT le rendez-vous qu’il annonçait : ' + deplace.promis.dateISO + ' ' + deplace.promis.slot);
  ok(deplace.avant.dateISO + ' ' + deplace.avant.slot !== deplace.apres.dateISO + ' ' + deplace.apres.slot,
    'le rendez-vous a bel et bien bougé (' + deplace.avant.dateISO + ' ' + deplace.avant.slot
    + ' → ' + deplace.apres.dateISO + ' ' + deplace.apres.slot + ')');
  ok(deplace.statut === 'pending', 'la demande reste en recherche');
  ok(!deplace.carte && !/Votre créneau est passé/.test(deplace.txt),
    'et la carte s’efface AUSSITÔT : la clé du serveur ne correspond plus, sans que rien n’ait été effacé');

  /* ── I. CE QUE LA CAPTURE A MONTRÉ, ET QU'AUCUNE ASSERTION N'AURAIT TROUVÉ ──────
     Premier rendu de la carte : l'écran affichait « Aucune prestation pour l'instant ».
     La purge locale (`purgeStaleMissions`, appelée à chaque rendu client) avait effacé
     la demande — et poussé « expired » au passage — pendant qu'on lui demandait de
     choisir. Et l'en-tête annonçait « les prestataires disponibles regardent votre
     demande » au-dessus d'une carte disant que personne ne l'a prise. */
  console.log('I — l’appareil du client ne ferme pas la question qu’on vient de lui poser');
  const purge = await p.evaluate(() => {
    const S = window.__S;
    const vieux = new Date(Date.now() - 4 * 86400000);
    const iso = vieux.getFullYear() + '-' + String(vieux.getMonth() + 1).padStart(2, '0') + '-' + String(vieux.getDate()).padStart(2, '0');
    const m = Object.assign(window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 }), {
      reqId: 'r9', _id: 'mr9', status: 'pending', dateISO: iso, slot: '09:00', slotFlex: 0, duration: 2 });
    const sansRelance = window.__passe.perimee(m);
    m.relancePour = window.__passe.cle(m); m.relanceAt = Date.now() - 3600000;
    const avecRelance = window.__passe.perimee(m);
    S.missions = [m]; S.mission = m;
    const restee = (window.__passe.purge(), (S.missions || []).length);
    return { sansRelance: sansRelance, avecRelance: avecRelance, restee: restee };
  });
  ok(purge.sansRelance === true,
    'une demande vieille de quatre jours est bien périmée pour l’appareil (sans ce repère, la mesure suivante ne prouverait rien)');
  ok(purge.avecRelance === false && purge.restee === 1,
    'mais tant que le serveur attend sa réponse, l’appareil ne l’efface pas et ne pousse pas « expired » sous ses doigts');

  const colis = await p.evaluate(() => {
    const hier = new Date(Date.now() - 86400000), dans6 = new Date(Date.now() + 6 * 86400000);
    const j = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const m = Object.assign(window.__newMission({ id: 'colis', nm: 'Colis & courrier', rate: 30 }), {
      reqId: 'rc', status: 'pending', dateISO: '', slot: '', dateFrom: j(hier), dateTo: j(dans6),
      _createdMs: Date.now() - 3 * 86400000 });
    return { ech: window.__passe.echeance(m), perimee: window.__passe.perimee(m),
      fin: j(dans6), sansFenetre: window.__passe.echeance(Object.assign({}, m, { dateFrom: '', dateTo: '' })) };
  });
  ok(colis.ech !== null && new Date(colis.ech).toISOString().slice(0, 10) >= colis.fin,
    'UN COLIS : l’échéance est la fin de sa fenêtre de retrait, pas le jour de la commande');
  ok(colis.perimee === false,
    'commandé il y a trois jours, retrait possible encore six jours : l’appareil ne le ferme plus (il le fermait, et poussait « expired » sur une demande vivante)');
  ok(colis.sansFenetre === null, 'et sans fenêtre lisible, il ne devine pas : rien ne se ferme');

  ok(!/prestataires disponibles regardent/.test(apres.txt) && /Créneau passé/.test(apres.txt),
    'enfin l’en-tête ne dit plus que des prestataires regardent une demande que plus personne ne peut prendre');

    ok(errs.length === 0, 'aucune erreur JS sur ces écrans' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
