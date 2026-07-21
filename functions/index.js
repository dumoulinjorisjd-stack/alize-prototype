/**
 * Cloud Functions Ti-Services.
 *
 * notifyAdminNewArtisan : à chaque nouveau dossier artisan « en attente »,
 * envoie une notification push (FCM Web Push) à tous les appareils de l'admin
 * enregistrés dans la collection `adminTokens` — même application fermée.
 *
 * Déploiement :
 *   cd functions && npm install
 *   firebase deploy --only functions
 * (nécessite le plan Blaze, déjà activé.)
 */
const {onDocumentCreated, onDocumentUpdated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onRequest, onCall, HttpsError} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const {defineSecret} = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({region: 'europe-west1', maxInstances: 5});

/* ============================================================================
 * E-MAIL — envoi RÉEL et observable (SMTP Infomaniak).
 *
 * Historique : toutes les fonctions écrivaient dans la collection Firestore
 * `mail` en comptant sur l'extension « Trigger Email from Firestore » pour
 * l'envoi. Si l'extension n'est pas installée / mal configurée (SMTP absent),
 * les messages s'empilent et RIEN ne part, sans erreur visible.
 *
 * Désormais : si le secret SMTP_PASS est défini, on envoie directement en SMTP
 * via la boîte contact@ti-services.fr (Infomaniak) et on journalise le résultat.
 * En cas d'échec — ou si le secret est absent — on retombe sur la collection
 * `mail` pour ne rien perdre. Pour activer :
 *   1) firebase functions:secrets:set SMTP_PASS   (= mot de passe de la boîte
 *      contact@ti-services.fr, ou un mot de passe d'application Infomaniak) ;
 *   2) redéployer les fonctions.
 * ==========================================================================*/
const SMTP_PASS = defineSecret('SMTP_PASS');
const SMTP_HOST = 'mail.infomaniak.com';
const SMTP_PORT = 465; // SSL/TLS
const MAIL_FROM_EMAIL = 'contact@ti-services.fr';
const MAIL_FROM_NAME = 'Ti-Services';

// Les mots de passe d'application (Infomaniak, Google…) s'affichent souvent en
// groupes séparés par des espaces ; on retire tout espace au cas où il aurait été
// collé tel quel — un mot de passe d'application ne contient jamais d'espace.
function smtpPass() { return (process.env.SMTP_PASS || '').replace(/\s+/g, ''); }

let _mailTx = null;
function mailTransport() {
  const pass = smtpPass();
  if (!pass) return null;
  if (_mailTx) return _mailTx;
  const nodemailer = require('nodemailer');
  _mailTx = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: {user: MAIL_FROM_EMAIL, pass},
  });
  return _mailTx;
}

async function sendMail(db, to, message) {
  const tx = mailTransport();
  if (tx) {
    try {
      const info = await tx.sendMail({
        from: '"' + MAIL_FROM_NAME + '" <' + MAIL_FROM_EMAIL + '>',
        to,
        subject: message.subject,
        html: message.html,
        attachments: (Array.isArray(message.attachments) && message.attachments.length) ? message.attachments : undefined,
      });
      console.log('[mail] envoyé à ' + to + ' (id=' + (info && info.messageId || '?') + ') — ' + message.subject);
      return true;
    } catch (e) {
      console.error('[mail] échec SMTP → ' + to + ' : ' + (e && e.message));
      try { await db.collection('mail').add({to, message}); } catch (_) {}
      return false;
    }
  }
  console.warn('[mail] SMTP_PASS absent — message mis en file `mail` pour ' + to +
    ' (rien ne partira sans l\'extension Trigger Email OU le secret SMTP_PASS).');
  await db.collection('mail').add({to, message});
  return false;
}

// Métiers pouvant se pratiquer au domicile du client OU chez le prestataire (salon).
const CAN_ON_SITE = ['sport', 'coach', 'natation', 'pilates', 'yoga', 'massage', 'coiffure', 'beaute'];
// Métiers facturés « par personne » (cours de sport, massages) : le prix (donc l'assiette
// de commission) est multiplié par le nombre de participants.
const NEEDS_PEOPLE = ['sport', 'coach', 'natation', 'pilates', 'yoga', 'massage'];
function peopleCount(svc, p) { return NEEDS_PEOPLE.indexOf(svc) >= 0 ? Math.max(1, Math.min(20, Number(p) || 1)) : 1; }
// Un artisan est-il éligible à une demande selon le LIEU ? Un « domicile seul » ne reçoit
// pas les demandes « salon », et inversement. Mode absent ('both' par défaut) => tout voir.
function siteOk(artisan, svc, locMode) {
  if (CAN_ON_SITE.indexOf(svc) < 0) return true;
  const sm = (artisan && artisan.siteMode) || 'both';
  if (sm === 'both') return true;
  return sm === (locMode || 'domicile');
}
// DISPONIBILITÉS : un artisan ne reçoit une demande que si elle tombe sur un créneau coché
// (jour + matin/après-midi/soir). Grille absente => disponible partout (défaut H24 / 7j).
// Doit rester identique au calcul côté client (index.html : availOk).
function slotToMin(s) { const p = (s || '0:0').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
function slotBlockAt(min) { min = ((min % 1440) + 1440) % 1440; return min < 360 ? 'n' : (min < 720 ? 'm' : (min < 1080 ? 'a' : 's')); }
function windowBlocks(startMin, flex) { const end = startMin + Math.max(0, Number(flex) || 0); const set = {}; for (let t = startMin; t <= end; t += 30) set[slotBlockAt(t)] = 1; set[slotBlockAt(end)] = 1; return Object.keys(set); }
function dowKey(dateISO) { const q = (dateISO || '').split('-'); if (q.length < 3) return null; const d = new Date(Date.UTC(+q[0], (+q[1]) - 1, +q[2])); return ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][d.getUTCDay()]; }
function availOk(avail, r) {
  if (!avail || typeof avail !== 'object') return true;
  if (r.slotFlex === 'week') { for (const d in avail) { const rw = avail[d]; if (rw && (rw.n || rw.m || rw.a || rw.s)) return true; } return false; }
  const dk = dowKey(r.dateISO); if (!dk || !avail[dk]) return true; const row = avail[dk];
  if (r.slotFlex === 'day') return !!(row.n || row.m || row.a || row.s);
  const startMin = /^\d{1,2}:\d{2}$/.test(r.slot || '') ? slotToMin(r.slot) : 720;
  const bs = windowBlocks(startMin, r.slotFlex); for (let i = 0; i < bs.length; i++) if (row[bs[i]]) return true; return false;
}

/* ============================================================================
 * MOLLIE CONNECT — activation des paiements artisans + versement automatique.
 *
 * PRINCIPE (vérifié sur la doc Mollie « Connect for Marketplaces ») :
 *  1) L'artisan s'onboarde une fois via le parcours hébergé Mollie (OAuth). Mollie
 *     vérifie son identité + IBAN (obligation DSP2/LCB-FT) et nous renvoie l'id de
 *     son organisation connectée (mollieOrgId), stocké sur sa fiche `artisans`.
 *  2) À chaque prestation réglée, on crée une « route » sur le paiement Mollie qui
 *     verse le NET (commission déjà déduite) à l'organisation de l'artisan ; le
 *     reste demeure sur le solde Ti-Services = notre commission. Le pourcentage
 *     vit chez NOUS (barème de fidélité) : Mollie applique le montant qu'on envoie,
 *     donc changer la commission d'un artisan ne demande AUCUNE config chez Mollie.
 *
 * ÉTAT : le code ci-dessous est prêt mais INERTE tant que les secrets ne sont pas
 * configurés (compte Mollie Connect à ouvrir). Sans secret, process.env.MOLLIE_* est
 * indéfini → mollie*Configured() renvoie false → tout est un no-op sûr. Pour ACTIVER
 * (après ouverture du compte Mollie Connect) :
 *   1) firebase functions:secrets:set MOLLIE_CLIENT_ID
 *      firebase functions:secrets:set MOLLIE_CLIENT_SECRET
 *      firebase functions:secrets:set MOLLIE_ACCESS_TOKEN   (jeton d'organisation plateforme)
 *   2) déclarer ces secrets sur les fonctions concernées, ex. :
 *      onRequest({secrets:['MOLLIE_CLIENT_ID','MOLLIE_CLIENT_SECRET']}, ...)  (start/return)
 *      settleCommission → {secrets:['MOLLIE_ACCESS_TOKEN']}
 *   NB : ne PAS déclarer un secret inexistant, sinon le déploiement échoue — c'est
 *   pourquoi les déclarations `secrets` sont volontairement absentes tant que Mollie
 *   n'est pas ouvert.
 * ========================================================================== */
const MOLLIE_AUTHORIZE = 'https://my.mollie.com/oauth2/authorize';
const MOLLIE_TOKEN = 'https://api.mollie.com/oauth2/tokens';
const MOLLIE_API = 'https://api.mollie.com/v2';
// Retour OAuth : DOIT pointer vers la fonction (pas l'hébergement) et matcher
// l'URL enregistrée dans l'app Mollie Connect. Retour app : domaine prod canonique.
const MOLLIE_RETURN_URL = 'https://europe-west1-t-service-prod.cloudfunctions.net/mollieOnboardingReturn';
const MOLLIE_APP_RETURN = 'https://ti-services.fr';
const APP_URL = process.env.APP_URL || 'https://ti-services.fr';
function mollieOAuthConfigured() { return !!(process.env.MOLLIE_CLIENT_ID && process.env.MOLLIE_CLIENT_SECRET); }
function mollieApiConfigured() { return !!process.env.MOLLIE_ACCESS_TOKEN; }

// Crée une route de versement du NET vers l'organisation Mollie de l'artisan, en
// gardant la commission sur le solde plateforme. No-op tant que Mollie n'est pas
// configuré ou que le paiement n'a pas d'identifiant Mollie (paiements simulés).
async function mollieRouteNet(molliePaymentId, orgId, netAmount, label) {
  if (!mollieApiConfigured() || !molliePaymentId || !orgId || !(netAmount > 0)) return false;
  try {
    const res = await fetch(MOLLIE_API + '/payments/' + encodeURIComponent(molliePaymentId) + '/routes', {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + process.env.MOLLIE_ACCESS_TOKEN, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        amount: {currency: 'EUR', value: netAmount.toFixed(2)},
        description: (label || 'Prestation Ti-Services').toString().slice(0, 100),
        destination: {type: 'organization', organizationId: orgId},
      }),
    });
    if (!res.ok) { console.warn('mollieRouteNet HTTP', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.warn('mollieRouteNet', e); return false; }
}
// Appel bas-niveau à l'API Mollie (jeton plateforme). Renvoie {ok, data|status}.
async function mollieApi(path, method, body) {
  try {
    const res = await fetch(MOLLIE_API + path, {
      method: method || 'GET',
      headers: {'Authorization': 'Bearer ' + process.env.MOLLIE_ACCESS_TOKEN, 'Content-Type': 'application/json'},
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (_) {}
    if (!res.ok) { console.warn('mollieApi', method, path, res.status, (txt || '').slice(0, 300)); return {ok: false, status: res.status, data: data}; }
    return {ok: true, data: data};
  } catch (e) { console.warn('mollieApi throw', method, path, e); return {ok: false, error: String(e)}; }
}
/* ============================================================================
 * WHATSAPP BUSINESS CLOUD API — alerte directe à l'artisan (officiel, Meta).
 *
 * POURQUOI : les notifications push (FCM) ne suffisent pas toujours (PWA iOS
 * fermée, jeton expiré). Un message WhatsApp arrive de façon fiable. On l'envoie
 * en PLUS du push, surtout pour les demandes DIRIGÉES (un client redemande un
 * artisan précis) — l'artisan doit être prévenu à coup sûr.
 *
 * ÉTAT : prêt mais INERTE tant que les secrets ne sont pas configurés (même
 * logique que Mollie). Sans secret, whatsAppConfigured() renvoie false → no-op.
 *
 * POUR ACTIVER (compte Meta WhatsApp Business à ouvrir) :
 *   1) Créer un numéro WhatsApp Business + un token permanent + récupérer le
 *      Phone Number ID dans Meta Business Manager (developers.facebook.com).
 *   2) Faire APPROUVER un modèle (template) de message, ex. « nouvelle_demande »,
 *      langue « fr », catégorie UTILITY, avec 2 variables de corps :
 *        {{1}} = intitulé de la prestation, {{2}} = secteur (ou « pour vous »).
 *      Exemple de corps :
 *        « Ti-Services : nouvelle demande {{1}} · {{2}}. Ouvrez l'app pour
 *          accepter avant les autres. »
 *   3) Recueillir l'OPT-IN de l'artisan (case notifWa déjà présente à
 *      l'inscription / réglages) — obligatoire (politique WhatsApp + RGPD).
 *   4) firebase functions:secrets:set WHATSAPP_TOKEN
 *      firebase functions:secrets:set WHATSAPP_PHONE_ID
 *      (optionnel) firebase functions:secrets:set WHATSAPP_TEMPLATE
 *   5) Déclarer les secrets sur la fonction notifyArtisansNewRequest, ex. :
 *        onDocumentCreated({document:'requests/{reqId}',
 *          secrets:['WHATSAPP_TOKEN','WHATSAPP_PHONE_ID','WHATSAPP_TEMPLATE']}, ...)
 *      NB : ne PAS déclarer un secret inexistant (le déploiement échouerait) —
 *      c'est pourquoi la déclaration est absente tant que le compte n'est pas ouvert.
 * ========================================================================== */
const WA_GRAPH = 'https://graph.facebook.com/v20.0';
function whatsAppConfigured() { return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID); }
// Numéro au format international SANS « + » (attendu par l'API). Gère le 0 de
// tête (numéro national) : 0690… → 590690…, sinon indicatif France 33.
function waIntl(phone) {
  let d = (phone || '').toString().replace(/[^\d+]/g, '');
  const hadPlus = d.charAt(0) === '+';
  d = d.replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  else if (!hadPlus && d.charAt(0) === '0') { const rest = d.slice(1); d = (/^69[01]/.test(rest) ? '590' : '33') + rest; }
  return d.length >= 8 ? d : '';
}
// Envoi best-effort d'un message modèle WhatsApp. No-op sûr si non configuré.
async function sendWhatsAppTemplate(toPhone, param1, param2) {
  if (!whatsAppConfigured()) return false;
  const to = waIntl(toPhone);
  if (!to) return false;
  const template = process.env.WHATSAPP_TEMPLATE || 'nouvelle_demande';
  try {
    const res = await fetch(WA_GRAPH + '/' + encodeURIComponent(process.env.WHATSAPP_PHONE_ID) + '/messages', {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + process.env.WHATSAPP_TOKEN, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: {code: 'fr'},
          components: [{type: 'body', parameters: [
            {type: 'text', text: (param1 || 'prestation').toString().slice(0, 60)},
            {type: 'text', text: (param2 || 'Saint-Barth').toString().slice(0, 60)},
          ]}],
        },
      }),
    });
    if (!res.ok) { console.warn('sendWhatsAppTemplate HTTP', res.status, await res.text()); return false; }
    return true;
  } catch (e) { console.warn('sendWhatsAppTemplate', e); return false; }
}

exports.notifyAdminNewArtisan = onDocumentCreated('artisans/{artisanId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const a = snap.data() || {};

  // On n'alerte que pour une candidature réellement en attente de validation.
  if ((a.status || 'attente') !== 'attente') return;

  const db = getFirestore();
  const tokensSnap = await db.collection('adminTokens').get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
  if (!tokens.length) {
    console.log('Aucun jeton admin enregistré — notification ignorée.');
    return;
  }

  const name = (a.name || 'Un artisan').toString().slice(0, 80);
  const message = {
    tokens,
    data: {
      title: 'Console admin · Nouvelle candidature',
      body: name + ' souhaite rejoindre Ti-Services.',
      url: './?open=admin',
    },
    webpush: {
      fcmOptions: {link: '/'},
      headers: {Urgency: 'high'},
    },
  };

  const res = await getMessaging().sendEachForMulticast(message);
  console.log(`Push envoyés : ${res.successCount}/${tokens.length}`);

  // Nettoyage des jetons devenus invalides (appareil désinscrit, etc.).
  const dels = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          code === 'messaging/invalid-registration-token') {
        dels.push(db.collection('adminTokens').doc(tokens[i]).delete());
      }
    }
  });
  if (dels.length) await Promise.all(dels);
});

/**
 * assignFounderSpot : programme « Artisan Fondateur ». Les FOUNDER_TOTAL premières
 * candidatures reçoivent automatiquement le statut fondateur. Le compteur est tenu
 * côté serveur (settings/stats.founderTaken) dans une TRANSACTION atomique — impossible
 * de dépasser le total, quelle que soit la simultanéité des inscriptions. Le champ
 * founder de la fiche artisan est positionné true/false par le serveur (jamais le client).
 */
const FOUNDER_TOTAL = 12;
exports.assignFounderSpot = onDocumentCreated('artisans/{artisanId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const db = getFirestore();
  const statsRef = db.doc('settings/stats');
  try {
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(snap.ref);
      // Fiche disparue entre-temps, ou statut fondateur déjà tranché : on ne retouche pas.
      if (!cur.exists) return;
      if (typeof (cur.data() || {}).founder === 'boolean') return;
      const st = await tx.get(statsRef);
      const taken = (st.exists && Number(st.data().founderTaken)) || 0;
      if (taken < FOUNDER_TOTAL) {
        tx.set(statsRef, {founderTaken: taken + 1}, {merge: true});
        // founderSince démarre la fenêtre d'avantage (3 mois / 2 000 €).
        tx.set(snap.ref, {founder: true, founderSince: FieldValue.serverTimestamp()}, {merge: true});
      } else {
        tx.set(snap.ref, {founder: false}, {merge: true});
      }
    });
  } catch (e) {
    console.error('assignFounderSpot', e);
  }
});

/**
 * notifyArtisansNewRequest : à chaque nouvelle demande client « pending »,
 * notifie par push tous les artisans validés proposant le service demandé
 * (premier arrivé, premier servi). Les jetons sont lus dans users/{uid}.pushTokens.
 */
exports.notifyArtisansNewRequest = onDocumentCreated('requests/{reqId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const r = snap.data() || {};
  if ((r.status || 'pending') !== 'pending') return;

  const svc = r.service;
  const db = getFirestore();

  // Artisans validés (filtrage du service en mémoire : pas d'index composite requis).
  const artsSnap = await db.collection('artisans').where('status', '==', 'valide').get();
  const uids = artsSnap.docs
    .filter((d) => { const dd = d.data() || {}; const c = dd.cats || []; return (!svc || c.indexOf(svc) >= 0) && siteOk(dd, svc, r.locationMode); })
    .map((d) => d.id);
  if (!uids.length) { console.log('Aucun artisan validé pour ce service.'); return; }

  // Demande DIRIGÉE : si le client a demandé un artisan précis (choix / renouvellement),
  // SEUL cet artisan est notifié — la demande ne tombe jamais dans la recherche standard
  // tant qu'il n'a pas décliné. Le repli vers tous les artisans n'a lieu qu'ensuite, si le
  // client rouvre la demande (declined -> pending, géré par notifyReopenedRequest).
  const preferred = r.preferredProviderUid;
  // Demande DIRIGÉE : l'artisan choisi est notifié quelle que soit sa grille de dispo (le
  // client l'a demandé ; il déclinera au besoin). Pour le POOL, on filtre par disponibilité.
  const availById = {}; artsSnap.docs.forEach((d) => { availById[d.id] = (d.data() || {}).avail; });
  const targetUids = preferred
    ? (uids.indexOf(preferred) >= 0 ? [preferred] : [])
    : uids.filter((uid) => availOk(availById[uid], r));
  if (!targetUids.length) { console.log('Aucun artisan disponible pour ce créneau.'); return; }

  const svcNm = (r.serviceName || 'Nouvelle prestation').toString().slice(0, 60);
  const secteur = (r.zone || 'Saint-Barth').toString().slice(0, 40);

  // Alerte WhatsApp (officielle) EN PLUS du push — surtout pour une demande dirigée,
  // où l'artisan choisi doit être prévenu à coup sûr. No-op tant que WhatsApp n'est
  // pas configuré. On n'écrit qu'aux artisans ayant coché l'opt-in WhatsApp (notifWa).
  if (whatsAppConfigured()) {
    const artById = {};
    artsSnap.docs.forEach((d) => { artById[d.id] = d.data() || {}; });
    await Promise.all(targetUids.map(async (uid) => {
      const a = artById[uid] || {};
      if (!a.notifWa || !a.phone) return;
      try { await sendWhatsAppTemplate(a.phone, svcNm, preferred ? 'demande réservée pour vous' : secteur); }
      catch (_) {}
    }));
  }

  // Jetons push de ces artisans (avec correspondance jeton -> uid pour le nettoyage).
  const tokenToUid = {};
  await Promise.all(targetUids.map(async (uid) => {
    try {
      const u = await db.collection('users').doc(uid).get();
      const ud = u.data() || {};
      // Le compte n'est PLUS un artisan (redevenu client) : on ne lui envoie aucune
      // notification « nouvelle prestation », même si sa fiche artisan traîne encore.
      if (ud.role && ud.role !== 'artisan') return;
      (ud.pushTokens || []).forEach((tok) => { tokenToUid[tok] = uid; });
    } catch (_) {}
  }));
  // PROPRIÉTÉ DU JETON. Un même appareil a pu servir à plusieurs comptes (ex. un
  // artisan qui est ensuite devenu client). Le jeton FCM appartient au DERNIER compte
  // qui l'a enregistré (fcmOwners/{token}.uid). On écarte tout jeton dont le
  // propriétaire actuel n'est plus cet artisan — sinon un ex-artisan devenu client
  // continuerait de recevoir les « prestations à faire » sur son appareil.
  await Promise.all(Object.keys(tokenToUid).map(async (tok) => {
    try {
      const o = await db.collection('fcmOwners').doc(tok).get();
      const od = o.exists ? (o.data() || {}) : null;
      if (od && od.uid && od.uid !== tokenToUid[tok]) delete tokenToUid[tok];
    } catch (_) {}
  }));
  const tokens = Object.keys(tokenToUid);
  if (!tokens.length) { console.log('Aucun jeton artisan enregistré.'); return; }

  const svcName = (r.serviceName || 'Nouvelle prestation').toString().slice(0, 60);
  const zone = (r.zone || '').toString().slice(0, 40);
  const cliFirst = (r.clientName || 'Un client').toString().split(' ')[0].slice(0, 30);
  const message = {
    tokens,
    data: {
      title: preferred ? '🌟 Demande réservée pour vous' : 'Espace artisan · Nouvelle mission',
      body: preferred
        ? (cliFirst + ' vous demande directement — ' + svcName + (zone ? ' · ' + zone : '') + '. Hors file d’attente, rien que pour vous.')
        : (svcName + (zone ? ' · ' + zone : '') + ' — premier arrivé, premier servi.'),
      url: './?open=missions',
    },
    webpush: { fcmOptions: { link: '/?open=missions' }, headers: { Urgency: 'high' } },
  };

  const res = await getMessaging().sendEachForMulticast(message);
  console.log(`Push artisans : ${res.successCount}/${tokens.length}`);

  const dels = [];
  res.responses.forEach((rp, i) => {
    if (!rp.success) {
      const code = rp.error && rp.error.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          code === 'messaging/invalid-registration-token') {
        const tok = tokens[i]; const uid = tokenToUid[tok];
        if (uid) dels.push(db.collection('users').doc(uid).update({ pushTokens: FieldValue.arrayRemove(tok) }));
      }
    }
  });
  if (dels.length) await Promise.all(dels);
});

/**
 * notifyArtisanApproved : quand l'admin fait passer un artisan à « valide »,
 * prévient l'artisan par notification push ET met un e-mail en file d'envoi
 * (collection `mail`, lue par l'extension Firebase « Trigger Email »).
 */
exports.notifyArtisanApproved = onDocumentUpdated({document: 'artisans/{artisanId}', secrets: [SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  // On agit uniquement sur la transition -> « valide ».
  if (before.status === 'valide' || after.status !== 'valide') return;

  const uid = event.params.artisanId;
  const db = getFirestore();
  const name = (after.name || '').toString().slice(0, 60) || 'Bonjour';

  // Adresse e-mail et jetons push depuis la fiche users.
  let email = '';
  let tokens = [];
  try {
    const u = await db.collection('users').doc(uid).get();
    const ud = u.data() || {};
    email = ud.email || '';
    tokens = ud.pushTokens || [];
  } catch (_) {}

  // 1) Notification push (immédiate, sans configuration).
  if (tokens.length) {
    try {
      await getMessaging().sendEachForMulticast({
        tokens,
        data: {
          title: 'Espace artisan · Inscription validée 🎉',
          body: 'Votre compte Ti-Services est activé — vous pouvez recevoir des missions.',
          url: './?open=missions',
        },
        webpush: { fcmOptions: { link: '/?open=missions' }, headers: { Urgency: 'high' } },
      });
    } catch (e) { console.warn('approve push', e); }
  }

  // 2) E-mail (mis en file dans la collection `mail` ; nécessite l'extension
  //    « Trigger Email from Firestore » pour l'envoi réel).
  if (email) {
    try {
      await sendMail(db, email, {
        subject: 'Votre inscription Ti-Services est validée 🎉',
        html: '<p>Bonjour ' + name + ',</p>' +
              '<p>Bonne nouvelle : votre inscription en tant qu\'artisan sur <b>Ti-Services</b> vient d\'être validée.</p>' +
              '<p>Votre compte est désormais actif : vous pouvez recevoir des demandes de missions. Ouvrez l\'application pour commencer — elle s\'ouvrira automatiquement sur votre espace missions.</p>' +
              '<p>À très vite,<br>L\'équipe Ti-Services</p>',
      });
    } catch (e) { console.warn('approve email queue', e); }
  }
});

/**
 * notifyServiceAddition : un artisan DÉJÀ inscrit a demandé à proposer un nouveau
 * métier (ajout dans `pendingCats`). On alerte l'admin par e-mail pour qu'il valide
 * ou refuse depuis la console. Tant que l'admin n'a pas déplacé le métier dans `cats`
 * (lui seul le peut, cf. règles), il n'est ni matché ni visible côté client.
 */
const ADMIN_EMAIL = 'contact@ti-services.fr';
exports.notifyServiceAddition = onDocumentUpdated({document: 'artisans/{artisanId}', secrets: [SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const bp = Array.isArray(before.pendingCats) ? before.pendingCats : [];
  const ap = Array.isArray(after.pendingCats) ? after.pendingCats : [];
  const added = ap.filter((c) => bp.indexOf(c) < 0);
  if (!added.length) return;

  const db = getFirestore();
  const name = (after.name || 'Un artisan').toString().slice(0, 80);
  const labels = added.map((c) => (c === 'autre'
    ? ('Autre : ' + (after.pendingOther || '').toString().slice(0, 80))
    : c)).join(', ');
  try {
    await sendMail(db, ADMIN_EMAIL, {
      subject: 'Ti-Services · Métier à valider — ' + name,
      html: '<p><b>' + name + '</b> demande à proposer un nouveau métier sur Ti-Services :</p>' +
            '<p style="font-size:16px"><b>' + labels + '</b></p>' +
            '<p>Ouvrez la console admin, puis la fiche de l\'artisan, pour vérifier (assurance — et diplômes pour la garde d\'enfants) et <b>valider</b> ou <b>refuser</b> le métier. Tant qu\'il n\'est pas validé, il n\'est pas proposé aux clients.</p>',
    });
  } catch (e) { console.warn('service add notify', e); }
});

/**
 * recomputeAvailability : maintient `settings/availability` à jour côté SERVEUR.
 * Un service n'est proposé aux clients que s'il existe AU MOINS un artisan « valide »
 * qui le pratique. Se déclenche à chaque changement d'une fiche artisan — y compris la
 * SUPPRESSION du compte (le dernier artisan d'un métier part → le service repasse en
 * « Bientôt disponible »/grisé). On ne recalcule que si le statut ou les métiers
 * changent (ou création/suppression), pour ignorer les écritures fréquentes (en ligne,
 * disponibilités…). Source de vérité : la collection `artisans` lue en direct.
 */
exports.recomputeAvailability = onDocumentWritten('artisans/{artisanId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.exists) ? event.data.before.data() : null;
  const after = (event.data && event.data.after && event.data.after.exists) ? event.data.after.data() : null;
  const catsKey = (a) => JSON.stringify((a && Array.isArray(a.cats)) ? a.cats.slice().sort() : []);
  const relevant = (!before || !after) ||
    (before.status !== after.status) ||
    (catsKey(before) !== catsKey(after));
  if (!relevant) return;
  const db = getFirestore();
  try {
    const snap = await db.collection('artisans').get();
    const set = {};
    snap.forEach((doc) => {
      const a = doc.data() || {};
      if (a.status === 'valide' && Array.isArray(a.cats)) {
        a.cats.forEach((c) => { if (c) set[c] = 1; });
      }
    });
    const services = Object.keys(set);
    await db.collection('settings').doc('availability').set(
      {services, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    console.log('[availability] recalculée (' + services.length + ' service(s)) : ' + (services.join(', ') || '—'));
  } catch (e) { console.warn('recomputeAvailability', e); }
});

/**
 * notifyNewMessage : à chaque nouveau message dans la messagerie interne d'une
 * demande (champ `messages` du document requests/{reqId}), envoie une
 * notification push (FCM Web Push) au DESTINATAIRE — même application fermée,
 * comme WhatsApp. La messagerie relie ainsi les échanges pro à l'application.
 *
 * Convention des messages : { from: 'client' | 'pro', text, at }.
 *  - message du client  -> destinataire = l'artisan assigné (providerUid) ;
 *  - message de l'artisan -> destinataire = le client (clientUid).
 * Les jetons du destinataire sont lus dans users/{uid}.pushTokens.
 */
exports.notifyNewMessage = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const bMsgs = Array.isArray(before.messages) ? before.messages : [];
  const aMsgs = Array.isArray(after.messages) ? after.messages : [];
  if (aMsgs.length <= bMsgs.length) return; // aucun nouveau message

  const fresh = aMsgs.slice(bMsgs.length);
  const last = fresh[fresh.length - 1] || {};
  const from = last.from;
  if (from !== 'client' && from !== 'pro') return;

  // Destinataire = l'autre partie.
  const recipientUid = (from === 'client') ? after.providerUid : after.clientUid;
  if (!recipientUid) return;

  const db = getFirestore();
  let tokens = [];
  try {
    const u = await db.collection('users').doc(recipientUid).get();
    tokens = (u.data() || {}).pushTokens || [];
  } catch (_) {}
  if (!tokens.length) { console.log('Message : aucun jeton pour le destinataire.'); return; }

  const senderName = (from === 'client'
    ? (after.clientName || 'Le client')
    : (after.providerName || 'Votre artisan')).toString().slice(0, 60);
  const body = (last.text || 'Nouveau message').toString().slice(0, 140);
  // L'artisan travaille depuis l'espace Missions ; le client depuis la réservation
  // concernée (deep-link direct). Le titre indique l'espace visé (multi-comptes).
  const link = (from === 'client')
    ? '/?open=missions'
    : ('/?open=wallet&r=' + event.params.reqId);
  const spaceLabel = (from === 'client') ? 'Espace artisan' : 'Vos réservations';
  const title = (spaceLabel + ' · ' + senderName).slice(0, 90);

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: title, body: body, url: '.' + link },
    webpush: { fcmOptions: { link: link }, headers: { Urgency: 'high' } },
  });
  console.log(`Push message : ${res.successCount}/${tokens.length}`);

  const dels = [];
  res.responses.forEach((rp, i) => {
    if (!rp.success) {
      const code = rp.error && rp.error.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          code === 'messaging/invalid-registration-token') {
        dels.push(db.collection('users').doc(recipientUid).update({ pushTokens: FieldValue.arrayRemove(tokens[i]) }));
      }
    }
  });
  if (dels.length) await Promise.all(dels);
});

/**
 * notifySupportMessage : messagerie SUPPORT (client↔Ti-Services, artisan↔Ti-Services),
 * stockée dans supportClient / supportPro du document de demande.
 *  - message d'un utilisateur (client/pro) -> push à l'admin (collection adminTokens) ;
 *  - réponse de l'admin -> push à l'utilisateur concerné (clientUid / providerUid).
 */
async function pushMulticast(tokens, title, body, link, onInvalid) {
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: title, body: body, url: '.' + (link || '/') },
    webpush: { fcmOptions: { link: link || '/' }, headers: { Urgency: 'high' } },
  });
  if (onInvalid) {
    const dels = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const c = r.error && r.error.code;
        if (c === 'messaging/registration-token-not-registered' ||
            c === 'messaging/invalid-argument' ||
            c === 'messaging/invalid-registration-token') {
          dels.push(onInvalid(tokens[i]));
        }
      }
    });
    if (dels.length) await Promise.all(dels);
  }
}

exports.notifySupportMessage = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const db = getFirestore();

  async function handle(field, userUidField, userNameField, fallbackName) {
    const b = Array.isArray(before[field]) ? before[field] : [];
    const a = Array.isArray(after[field]) ? after[field] : [];
    if (a.length <= b.length) return;
    const last = a[a.length - 1] || {};
    const body = String(last.text || 'Nouveau message').slice(0, 140);
    if (last.from === 'admin') {
      // Réponse de l'admin -> notifier l'utilisateur concerné.
      const uid = after[userUidField];
      if (!uid) return;
      let tokens = [];
      try { const u = await db.collection('users').doc(uid).get(); tokens = (u.data() || {}).pushTokens || []; } catch (_) {}
      await pushMulticast(tokens, 'Ti-Services · Support', body, '/',
        (tok) => db.collection('users').doc(uid).update({ pushTokens: FieldValue.arrayRemove(tok) }));
    } else {
      // Message d'un utilisateur -> notifier l'admin.
      let tokens = [];
      try { const ts = await db.collection('adminTokens').get(); tokens = ts.docs.map((d) => d.id).filter(Boolean); } catch (_) {}
      const who = (after[userNameField] || fallbackName || 'Un utilisateur').toString().slice(0, 60);
      await pushMulticast(tokens, 'Support — ' + who, body, '/',
        (tok) => db.collection('adminTokens').doc(tok).delete());
    }
  }

  await handle('supportClient', 'clientUid', 'clientName', 'Client');
  await handle('supportPro', 'providerUid', 'providerName', 'Artisan');
});

/**
 * notifyGeneralSupport : support GÉNÉRAL (hors réservation), stocké dans
 * users/{uid}.support. Message d'un utilisateur -> push à l'admin ; réponse de
 * l'admin -> push à l'utilisateur.
 */
exports.notifyGeneralSupport = onDocumentUpdated('users/{uid}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const b = Array.isArray(before.support) ? before.support : [];
  const a = Array.isArray(after.support) ? after.support : [];
  if (a.length <= b.length) return;
  const last = a[a.length - 1] || {};
  const body = String(last.text || 'Nouveau message').slice(0, 140);
  const db = getFirestore();
  const uid = event.params.uid;
  if (last.from === 'admin') {
    const tokens = after.pushTokens || [];
    await pushMulticast(tokens, 'Ti-Services · Support', body, '/',
      (tok) => db.collection('users').doc(uid).update({ pushTokens: FieldValue.arrayRemove(tok) }));
  } else {
    let tokens = [];
    try { const ts = await db.collection('adminTokens').get(); tokens = ts.docs.map((d) => d.id).filter(Boolean); } catch (_) {}
    const who = (after.name || 'Un utilisateur').toString().slice(0, 60);
    await pushMulticast(tokens, 'Support général — ' + who, body, '/',
      (tok) => db.collection('adminTokens').doc(tok).delete());
  }
});

/**
 * notifyClientStatus : prévient le CLIENT des étapes clés de SA demande —
 *  - pending -> accepted : un artisan a accepté (« Artisan trouvé ») ;
 *  - -> done_pro         : la prestation est terminée, à valider par le client.
 * Le clic ouvre directement la réservation concernée (deep-link).
 */
exports.notifyClientStatus = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const bStatus = before.status || '';
  const aStatus = after.status || '';
  if (bStatus === aStatus) return;

  const clientUid = after.clientUid;
  if (!clientUid) return;

  const provider = (after.providerName || 'Un artisan').toString().slice(0, 60);
  const svcName = (after.serviceName || 'votre prestation').toString().slice(0, 60);

  let title = '';
  let body = '';
  if (bStatus === 'pending' && aStatus === 'accepted') {
    title = 'Vos réservations · Artisan trouvé';
    body = provider + ' a accepté votre demande de ' + svcName + '.';
  } else if (aStatus === 'done_pro') {
    title = 'Vos réservations · Prestation terminée';
    body = provider + ' a terminé — validez pour finaliser.';
  } else if (bStatus === 'pending' && aStatus === 'declined') {
    // L'artisan PRÉCISÉMENT demandé (demande dirigée) a décliné : le client doit
    // décider de la suite (proposer à tous les artisans, ou annuler).
    const who = (after.declinedName || after.preferredProviderName || 'Votre artisan').toString().slice(0, 60);
    title = 'Vos réservations · Artisan indisponible';
    body = who + ' n\'est pas disponible pour ' + svcName + ' — à vous de décider.';
  } else {
    return; // autres transitions : pas de notification client
  }

  const db = getFirestore();
  let tokens = [];
  try {
    const u = await db.collection('users').doc(clientUid).get();
    tokens = (u.data() || {}).pushTokens || [];
  } catch (_) {}
  if (!tokens.length) { console.log('Statut client : aucun jeton pour ' + clientUid); return; }

  await pushMulticast(tokens, title, body, '/?open=wallet&r=' + event.params.reqId,
    (tok) => db.collection('users').doc(clientUid).update({ pushTokens: FieldValue.arrayRemove(tok) }));
  console.log('Push statut client (' + aStatus + ') envoyé à ' + clientUid);
});

/**
 * settleCommission : au moment où une demande passe à « paid », calcule et FIGE la
 * commission Ti-Services CÔTÉ SERVEUR — source de vérité comptable, indépendante de
 * l'appareil de l'artisan. Base = tarif (fixé par l'admin, non modifiable par l'artisan)
 * × heures facturées ; la majoration « coup de pouce » revient à l'intervenant. Le taux
 * suit le barème de fidélité selon le nombre de missions de l'artisan. Écrit une seule
 * fois (idempotent via `commissionSettled`) sur la demande :
 *   commissionPct, commissionBase, commissionAmount, grossTotal, netAmount.
 */
function commissionTierPct(jobsTotal) {
  const n = Number(jobsTotal) || 0;
  if (n >= 300) return 8;   // Platine
  if (n >= 150) return 10;  // Or
  if (n >= 50) return 12;   // Argent
  return 15;                // Bronze
}
// Artisan Fondateur (Ambassadeur) : commission fortement réduite (5 %) pendant une
// fenêtre limitée (3 mois OU 2 000 € de prestations). Ces trois constantes doivent
// rester alignées avec index.html.
const FOUNDER_COMM_PCT = 5;
const FOUNDER_DAYS = 90;
const FOUNDER_GROSS_CAP = 2000;
// Petits montants : sous ce seuil de base (€), un taux PLANCHER s'applique — sinon la
// commission serait dérisoire (ex. 5 % de 15 € = 0,75 €), non viable. Vaut pour TOUS,
// y compris les ambassadeurs (leur 5 % passe à 10 % sous le seuil). Aligné avec index.html.
const SMALL_COMM_MIN = 21;   // seuil de base (€) sous lequel le plancher s'applique
const SMALL_COMM_PCT = 10;   // taux plancher sous le seuil
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

/**
 * notifyArtisanPaid : quand le CLIENT valide la prestation (statut -> paid), on
 * prévient l'ARTISAN par push — même application fermée. Le pourboire est mis en
 * avant s'il y en a un ; le montant net exact reste affiché dans l'app.
 */
exports.notifyArtisanPaid = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  if (before.status === 'paid' || after.status !== 'paid') return; // transition -> paid, une seule fois
  const uid = after.providerUid;
  if (!uid) return;

  const db = getFirestore();
  let tokens = [];
  try { const u = await db.collection('users').doc(uid).get(); tokens = (u.data() || {}).pushTokens || []; } catch (_) {}
  if (!tokens.length) { console.log('notifyArtisanPaid : aucun jeton pour ' + uid); return; }

  const cli = (after.clientName || 'Le client').toString().split(' ')[0].slice(0, 30);
  const tip = Math.max(0, round2(Number(after.tip) || 0));
  const net = Number(after.netAmount);
  const amt = (net > 0) ? (' — vous percevez ' + eurTxt(net)) : '';
  const body = tip > 0
    ? ('💛 ' + cli + ' a validé et vous a laissé ' + eurTxt(tip) + ' de pourboire' + amt)
    : (cli + ' a validé votre prestation' + amt + '. Vous êtes payé 🎉');

  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      data: { title: '🎉 Prestation validée — vous êtes payé', body: body, url: './?open=missions' },
      webpush: { fcmOptions: { link: '/?open=missions' }, headers: { Urgency: 'high' } },
    });
    console.log('notifyArtisanPaid push ' + res.successCount + '/' + tokens.length);
    const dels = [];
    res.responses.forEach((rp, i) => {
      if (!rp.success) {
        const code = rp.error && rp.error.code;
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-argument' ||
            code === 'messaging/invalid-registration-token') {
          dels.push(db.collection('users').doc(uid).update({ pushTokens: FieldValue.arrayRemove(tokens[i]) }));
        }
      }
    });
    if (dels.length) await Promise.all(dels);
  } catch (e) { console.warn('notifyArtisanPaid push', e); }
});

/**
 * notifyBoosted : le client a ajouté (ou augmenté) un COUP DE POUCE pendant la
 * recherche (reboostedAt change, demande encore pending). On re-notifie TOUS les
 * artisans validés du service — y compris ceux qui avaient « passé » la mission.
 */
exports.notifyBoosted = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  if (after.status !== 'pending') return;
  const rb = Number(after.reboostedAt) || 0;
  if (!rb || rb === (Number(before.reboostedAt) || 0)) return; // pas de NOUVEAU coup de pouce
  const svc = after.service;
  const reqId = event.params.reqId;
  const db = getFirestore();
  const artsSnap = await db.collection('artisans').where('status', '==', 'valide').get();
  const uids = artsSnap.docs
    .filter((d) => { const dd = d.data() || {}; const c = dd.cats || []; return (!svc || c.indexOf(svc) >= 0) && siteOk(dd, svc, after.locationMode) && availOk(dd.avail, after); })
    .map((d) => d.id);
  if (!uids.length) return;
  // « Re-solliciter TOUS les artisans, même ceux qui avaient passé » : on RETIRE cette
  // demande de la liste `skippedRequests` de chaque artisan concerné. Ainsi la mission
  // ré-apparaît dans son fil « Missions disponibles » — y compris sur une version de
  // l'app encore en cache (le filtre côté client ne suffit pas si la coquille est ancienne).
  await Promise.all(uids.map((uid) =>
    db.collection('artisans').doc(uid).update({ skippedRequests: FieldValue.arrayRemove(reqId) }).catch(() => {})
  ));
  let tokens = [];
  await Promise.all(uids.map(async (uid) => {
    try {
      const u = await db.collection('users').doc(uid).get();
      const ud = u.data() || {};
      if (ud.role && ud.role !== 'artisan') return;
      (ud.pushTokens || []).forEach((t) => tokens.push(t));
    } catch (_) {}
  }));
  tokens = Array.from(new Set(tokens));
  if (!tokens.length) return;
  const svcName = (after.serviceName || 'Une mission').toString().slice(0, 60);
  const zone = (after.zone || '').toString().slice(0, 40);
  const boost = Number(after.boost) || 0;
  const boostEur = Math.max(0, Math.round(Number(after.boostEur) || 0));
  const bonusTxt = boostEur ? (' — bonus +' + boostEur + ' € ajouté') : (boost ? (' — bonus +' + boost + '% ajouté') : '');
  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        title: '🔥 Coup de pouce sur une mission',
        body: svcName + (zone ? ' · ' + zone : '') + bonusTxt + '. À saisir avant les autres !',
        url: './?open=missions',
      },
      webpush: { fcmOptions: { link: '/?open=missions' }, headers: { Urgency: 'high' } },
    });
    console.log('notifyBoosted push -> ' + tokens.length + ' jetons');
  } catch (e) { console.warn('notifyBoosted push', e); }
});

exports.settleCommission = onDocumentUpdated({document: 'requests/{reqId}', secrets: ['MOLLIE_ACCESS_TOKEN']}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  // On agit UNIQUEMENT sur la transition -> « paid », et une seule fois.
  if (before.status === 'paid' || after.status !== 'paid') return;
  if (after.commissionSettled) return;

  const providerUid = after.providerUid;
  if (!providerUid) { console.log('settleCommission : demande sans providerUid, ignorée.'); return; }

  const rate = Number(after.rate) || 0;
  // Base = montant de la prestation. Prestation À L'ACTE (catalogue) : somme des actes.
  // Forfait sans acte : le prix fixe (1×). Sinon horaire : tarif × heures facturées.
  const acts = Array.isArray(after.acts) ? after.acts : null;
  let base;
  if (acts && acts.length) {
    base = round2(acts.reduce((t, a) => t + (Number(a.price) || 0) * (Number(a.qty) || 1), 0));
  } else {
    const hours = (after.unit === 'forfait') ? 1 : ((after.finalHours != null) ? Number(after.finalHours) : (Number(after.duration) || 1));
    base = round2(rate * hours);
  }
  // Prestations « par personne » (sport, massage) : le prix est multiplié par le nombre
  // de participants — l'assiette de commission doit l'être aussi.
  base = round2(base * peopleCount(after.service, after.people));
  const boost = Number(after.boost) || 0;
  // Coup de pouce en euros (relance pendant la recherche) : montant fixe soumis à la
  // commission (comme la majoration en %). S'ajoute à l'assiette et au brut.
  const boostEur = Math.max(0, Math.round(Number(after.boostEur) || 0));
  // Pourboire laissé par le client à la validation : versé EN TOTALITÉ à l'artisan
  // (aucune commission Ti-Services). Il s'ajoute donc au brut ET au net.
  const tip = Math.max(0, round2(Number(after.tip) || 0));
  const gross = round2(base + round2(base * boost / 100) + boostEur + tip);

  const db = getFirestore();
  let jobsTotal = 0; let isFounder = false; let founderSinceMs = null; let founderGross = 0;
  try {
    const a = (await db.collection('artisans').doc(providerUid).get()).data() || {};
    jobsTotal = a.jobsTotal || 0;
    isFounder = !!a.founder;
    founderGross = Number(a.founderGross) || 0;
    founderSinceMs = (a.founderSince && a.founderSince.toMillis) ? a.founderSince.toMillis() : (typeof a.founderSince === 'number' ? a.founderSince : null);
  } catch (_) {}

  // Artisan Fondateur : commission réduite aux seuls frais bancaires (jamais Bronze),
  // MAIS uniquement pendant la fenêtre d'avantage — 3 mois OU 2 000 € de prestations
  // (au premier des deux atteint), puis commission standard (palier de fidélité).
  // La prestation qui franchit le plafond bénéficie encore du taux fondateur ; on cumule
  // ensuite le CA dans founderGross pour couper l'avantage aux suivantes.
  const withinTime = (founderSinceMs == null) ? true : (Date.now() - founderSinceMs < FOUNDER_DAYS * 86400000);
  const withinGross = founderGross < FOUNDER_GROSS_CAP;
  const founderActive = isFounder && withinTime && withinGross;
  const basePct = founderActive ? FOUNDER_COMM_PCT : commissionTierPct(jobsTotal);
  // Plancher « petits montants » : au moins SMALL_COMM_PCT % sous SMALL_COMM_MIN € de base.
  const pct = (base < SMALL_COMM_MIN) ? Math.max(basePct, SMALL_COMM_PCT) : basePct;
  const commission = round2((base + round2(base * boost / 100) + boostEur) * pct / 100);
  const net = round2(gross - commission);

  const reqId = event.params.reqId;

  // CONTRÔLE DU TARIF contre la grille officielle (settings/prices). Le tarif est figé
  // dès l'acceptation (règles), mais il pourrait avoir été manipulé à la CRÉATION
  // (collusion client/artisan pour réduire l'assiette de commission). On ne touche PAS
  // aux montants — le client a payé le tarif affiché — mais on POSE UN INDICATEUR pour
  // l'admin quand le tarif est nettement sous la grille (> 10 %).
  let rateExpected = null; let rateFlag = false;
  try {
    if (after.service) {
      const ps = await db.collection('settings').doc('prices').get();
      const grid = (ps.exists && ps.data() && ps.data().prices) || {};
      // Facturation à la journée (garde d'animaux) → tarif journalier « <svc>_j » ;
      // sinon tarif horaire « <svc> ».
      const key = ((after.unit || 'h') === 'j') ? (after.service + '_j') : after.service;
      const off = grid[key];
      if (typeof off === 'number' && off > 0) {
        rateExpected = off;
        if (rate < off * 0.9) rateFlag = true;
      }
    }
  } catch (e) { console.warn('settleCommission price check', e); }
  if (rateFlag) {
    console.warn('Tarif sous la grille reqId=' + reqId + ' déclaré=' + rate + ' attendu=' + rateExpected);
  }

  // Numéro de facture SÉQUENTIEL par intervenant, attribué de façon ATOMIQUE par le
  // serveur (transaction sur un compteur dédié). C.C.S, mandataire de facturation,
  // garantit ainsi une numérotation continue, unique et sans doublon (art. 242 nonies A
  // du CGI) — impossible à obtenir avec des compteurs locaux multi-appareils. Le compteur
  // démarre à zéro tant qu'aucune facture n'a été émise (donc « remis à zéro » au
  // lancement officiel une fois les données de test purgées).
  let saleInvoiceNo = after.saleInvoiceNo || '';
  if (!saleInvoiceNo) {
    try {
      saleInvoiceNo = await db.runTransaction(async (tx) => {
        const cref = db.collection('counters').doc(providerUid);
        const csnap = await tx.get(cref);
        const seq = ((csnap.exists ? (csnap.data().saleSeq || 0) : 0)) + 1;
        tx.set(cref, { saleSeq: seq, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return (new Date()).getFullYear() + '-' + String(seq).padStart(4, '0');
      });
    } catch (e) { console.warn('settleCommission numbering', e); saleInvoiceNo = ''; }
  }

  try {
    // 1) REGISTRE COMPTABLE IMMUABLE : un document par prestation réglée, écrit
    //    UNIQUEMENT par le serveur (les règles interdisent toute écriture client).
    //    C'est la source de vérité inviolable pour la comptabilité — aucune manip,
    //    mise à jour ou suppression côté client ne peut l'altérer ni la perdre.
    await db.collection('ledger').doc(reqId).set({
      type: 'commission',
      reqId: reqId,
      clientUid: after.clientUid || null,
      clientName: (after.clientName || '').toString().slice(0, 80),
      providerUid: providerUid,
      providerName: (after.providerName || '').toString().slice(0, 80),
      service: after.service || '',
      serviceName: (after.serviceName || '').toString().slice(0, 80),
      unit: after.unit || 'h',
      hours: hours,
      rate: rate,
      base: base,
      boost: boost,
      tip: tip,                   // pourboire — 100 % artisan, hors commission
      grossTotal: gross,          // réglé par le client
      commissionPct: pct,
      commissionAmount: commission, // revenu Ti-Services
      netAmount: net,             // net perçu par l'artisan
      invNo: saleInvoiceNo,       // numéro de facture séquentiel (mandat, au nom de l'artisan)
      rateExpected: rateExpected, // tarif attendu (grille officielle), pour audit
      rateFlag: rateFlag,         // true si tarif nettement sous la grille → à vérifier
      settledAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 2) Report des montants + numéro figés sur la demande (lecture pratique côté app).
    await event.data.after.ref.update({
      commissionSettled: true,
      commissionPct: pct,
      commissionBase: base,
      commissionAmount: commission,
      grossTotal: gross,
      netAmount: net,
      saleInvoiceNo: saleInvoiceNo,
      settledAt: FieldValue.serverTimestamp(),
    });
    console.log('Commission figée + registre reqId=' + reqId +
      ' base=' + base + ' pct=' + pct + '% comm=' + commission + ' net=' + net);

    // Cumul du CA fondateur (pour couper l'avantage à 2 000 €) + démarrage de la fenêtre
    // si elle n'a pas encore de date (fondateurs créés avant l'automatisation).
    if (isFounder) {
      try {
        const upd = { founderGross: FieldValue.increment(gross) };
        if (founderSinceMs == null) upd.founderSince = FieldValue.serverTimestamp();
        await db.collection('artisans').doc(providerUid).set(upd, { merge: true });
      } catch (e) { console.warn('founderGross update', e); }
    }

    // 2 bis) APPORT CONCIERGERIE : si la demande vient d'une conciergerie (mandataire),
    //    on reverse une commission d'apport (retroRate % de la base), PRÉLEVÉE SUR LA
    //    MARGE Ti-Services (le prix client ne change pas). On l'inscrit au registre
    //    (charge), on la reporte sur la demande (lue par la conciergerie) et on cumule
    //    sur la fiche conciergerie — source de vérité serveur de sa rétribution.
    if (after.viaConcierge && after.conciergeUid) {
      try {
        // Taux d'apport OFFICIEL depuis settings/config (jamais la valeur envoyée par
        // la conciergerie, qui pourrait être gonflée). Repli sur 8 % par défaut.
        let retroRate = 8;
        try {
          const cfg = await db.collection('settings').doc('config').get();
          const rr = cfg.exists && cfg.data() ? cfg.data().retroRate : null;
          if (typeof rr === 'number') retroRate = rr;
        } catch (_) {}
        const retro = round2(base * retroRate / 100);
        await db.collection('ledger').doc(reqId + '_retro').set({
          type: 'retro', reqId: reqId,
          conciergeUid: after.conciergeUid,
          clientUid: after.conciergeUid,   // = partie « cliente » de la demande (lecture)
          conciergeName: (after.conciergeName || '').toString().slice(0, 80),
          base: base, retroRate: retroRate, retroAmount: retro,
          settledAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await event.data.after.ref.update({ retro: retro, retroRate: retroRate });
        await db.collection('concierges').doc(after.conciergeUid)
          .set({ earn: FieldValue.increment(retro) }, { merge: true });
        console.log('Apport conciergerie reqId=' + reqId + ' retro=' + retro + ' (' + retroRate + '%)');
      } catch (e) { console.warn('settleCommission retro', e); }
    }

    // 3) CAPTURE de l'empreinte puis VERSEMENT du net. À la validation, on débite
    //    RÉELLEMENT le montant final (gross), plafonné à l'empreinte posée (« jamais
    //    plus que le montant annoncé »). Sans molliePaymentId (paiement simulé) : no-op.
    let captureOk = true;
    if (mollieApiConfigured() && after.molliePaymentId && !after.mollieCaptured) {
      captureOk = false;
      try {
        const held = round2(Number(after.molliePaymentAmount) || gross);
        const toCapture = round2(Math.min(gross, held));
        const p = await mollieApi('/payments/' + encodeURIComponent(after.molliePaymentId), 'GET');
        const st = (p.ok && p.data) ? p.data.status : '';
        if (st === 'authorized') {
          const cap = await mollieApi('/payments/' + encodeURIComponent(after.molliePaymentId) + '/captures', 'POST',
            {amount: {currency: 'EUR', value: toCapture.toFixed(2)}});
          captureOk = cap.ok;
        } else if (st === 'paid') {
          captureOk = true;   // déjà capturé
        }
        await event.data.after.ref.update({mollieCaptured: captureOk, mollieCaptureAmount: toCapture});
      } catch (e) { console.warn('settleCommission capture', e); }
    }
    // 3 bis) VERSEMENT MOLLIE : route le NET vers l'organisation de l'artisan et garde
    //    la commission sur le solde plateforme. Uniquement si la capture a réussi.
    try {
      const orgId = after.mollieOrgId || (await db.collection('artisans').doc(providerUid).get()).get('mollieOrgId');
      if (orgId && after.molliePaymentId && captureOk) {
        const routed = await mollieRouteNet(after.molliePaymentId, orgId, net,
          'Ti-Services · ' + (after.serviceName || after.service || 'prestation') + ' · ' + saleInvoiceNo);
        if (routed) await event.data.after.ref.update({molliePayout: 'routed'});
      }
    } catch (e) { console.warn('settleCommission route', e); }
  } catch (e) { console.warn('settleCommission write', e); }
});

/**
 * notifyReopenedRequest : quand un artisan se désiste d'une mission acceptée, la demande
 * repasse en « pending ». On re-notifie les autres artisans validés du service (sauf
 * celui qui s'est désisté) ET on prévient le client que la recherche est relancée.
 * Concrétise l'engagement « on relance la recherche » — sans en faire une garantie.
 */
exports.notifyReopenedRequest = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const wasActive = ['accepted', 'working', 'done_pro'].indexOf(before.status) >= 0;
  // Une demande DIRIGÉE déclinée que le client rouvre à tous (declined -> pending)
  // doit aussi être diffusée au pool — mais SANS prévenir le client (c'est lui qui l'a
  // rouverte volontairement). On exclut du push l'artisan qui vient de décliner.
  const wasDeclined = before.status === 'declined';
  if (!((wasActive || wasDeclined) && after.status === 'pending')) return;

  const db = getFirestore();
  const svc = after.service;
  const exclude = wasDeclined ? (before.declinedBy || '') : (before.providerUid || '');

  // 1) Re-notifier les artisans validés du service (hors celui qui s'est désisté).
  //    Demande re-DIRIGÉE (le client a choisi une autre baby-sitter après l'appel) :
  //    SEULE la personne nouvellement demandée est notifiée — jamais le pool.
  try {
    const artsSnap = await db.collection('artisans').where('status', '==', 'valide').get();
    let uids = artsSnap.docs
      .filter((d) => { const dd = d.data() || {}; const c = dd.cats || []; return (!svc || c.indexOf(svc) >= 0) && d.id !== exclude && siteOk(dd, svc, after.locationMode); })
      .map((d) => d.id);
    const preferred = after.directed ? (after.preferredProviderUid || '') : '';
    if (preferred) {
      uids = uids.indexOf(preferred) >= 0 ? [preferred] : [];
    } else {
      // Pool : on ne re-notifie que les artisans DISPONIBLES sur ce créneau.
      const availById = {}; artsSnap.docs.forEach((d) => { availById[d.id] = (d.data() || {}).avail; });
      uids = uids.filter((uid) => availOk(availById[uid], after));
    }
    const tokenToUid = {};
    await Promise.all(uids.map(async (uid) => {
      try { const u = await db.collection('users').doc(uid).get(); ((u.data() || {}).pushTokens || []).forEach((t) => { tokenToUid[t] = uid; }); } catch (_) {}
    }));
    const tokens = Object.keys(tokenToUid);
    if (tokens.length) {
      const svcName = (after.serviceName || 'Une mission').toString().slice(0, 60);
      const zone = (after.zone || '').toString().slice(0, 40);
      await pushMulticast(tokens, 'Espace artisan · Mission de nouveau disponible',
        svcName + (zone ? ' · ' + zone : '') + ' — un créneau se libère, à saisir.', '/?open=missions',
        (t) => db.collection('users').doc(tokenToUid[t]).update({ pushTokens: FieldValue.arrayRemove(t) }));
    }
  } catch (e) { console.warn('reopen notify artisans', e); }

  // 2) Prévenir le client que la recherche est relancée — uniquement en cas de
  //    désistement d'un artisan engagé (pas quand le client ouvre lui-même à tous,
  //    ni quand il change volontairement de baby-sitter : reopenedBy='client-choice').
  try {
    const clientUid = (wasActive && after.reopenedBy !== 'client-choice') ? after.clientUid : null;
    if (clientUid) {
      const u = await db.collection('users').doc(clientUid).get();
      const tokens = (u.data() || {}).pushTokens || [];
      await pushMulticast(tokens, 'Vos réservations · Recherche relancée',
        'Votre artisan s\'est désisté — nous cherchons un nouvel intervenant.', '/?open=wallet&r=' + event.params.reqId,
        (t) => db.collection('users').doc(clientUid).update({ pushTokens: FieldValue.arrayRemove(t) }));
    }
  } catch (e) { console.warn('reopen notify client', e); }
});

/**
 * recordNoShow : quand un CLIENT signale que l'artisan engagé ne s'est pas présenté
 * (transition accepted -> pending avec reopenedBy='client'), on inscrit un manquement
 * sur la fiche de l'artisan RÉELLEMENT assigné (before.providerUid, source de vérité —
 * on n'utilise jamais une valeur fournie par le client pour désigner la victime).
 * C'est un signal de fiabilité pour l'admin ; il n'entraîne pas de sanction automatique.
 */
exports.recordNoShow = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  if (!(before.status === 'accepted' && after.status === 'pending' && after.reopenedBy === 'client')) return;
  const uid = before.providerUid;
  if (!uid) return;
  try {
    await getFirestore().collection('artisans').doc(uid).set({
      noShowCount: FieldValue.increment(1),
      lastNoShowAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    console.log('No-show enregistré artisan=' + uid + ' req=' + event.params.reqId);
  } catch (e) { console.warn('recordNoShow', e); }
});

/**
 * mollieOnboardingStart : point d'entrée du parcours d'activation des paiements.
 * L'app y redirige l'artisan ; on renvoie (302) vers le parcours hébergé Mollie
 * (OAuth). `state` = uid de l'artisan pour le corréler au retour.
 *
 * SÉCURITÉ : en production, signer `state` (jeton à usage unique) plutôt que de
 * passer l'uid en clair, et vérifier l'authentification de l'appelant. Inerte tant
 * que MOLLIE_CLIENT_ID/SECRET ne sont pas configurés.
 */
/**
 * createClientPayment : pose l'EMPREINTE bancaire (autorisation Mollie, capture
 * manuelle) pour une demande. Le client passe par le parcours sécurisé Mollie ; RIEN
 * n'est débité — le débit réel n'a lieu qu'à la capture, déclenchée à la validation de
 * la prestation (settleCommission). Montant = total FIGÉ côté serveur (jamais une
 * valeur envoyée par le client) → « jamais plus que le montant annoncé ». Inerte si
 * Mollie n'est pas configuré (renvoie {simulated:true}) : la bêta continue de simuler.
 */
exports.createClientPayment = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const reqId = ((request.data && request.data.reqId) || '').toString();
  const returnUrl = ((request.data && request.data.returnUrl) || '').toString();
  if (!reqId) throw new HttpsError('invalid-argument', 'reqId manquant.');
  if (!mollieApiConfigured()) return {simulated: true};

  const db = getFirestore();
  const snap = await db.collection('requests').doc(reqId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Demande introuvable.');
  const r = snap.data() || {};
  if (r.clientUid !== uid) throw new HttpsError('permission-denied', 'Demande d\u2019un autre compte.');
  const amount = round2(Number(r.total) || 0);
  if (!(amount > 0)) throw new HttpsError('failed-precondition', 'Montant invalide.');

  // Idempotence : si une empreinte est déjà en cours (open/pending/authorized), on
  // renvoie son lien plutôt que de bloquer les fonds une seconde fois.
  if (r.molliePaymentId) {
    const ex = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId), 'GET');
    if (ex.ok && ex.data && ['open', 'pending', 'authorized'].indexOf(ex.data.status) >= 0) {
      const link = ex.data._links && ex.data._links.checkout && ex.data._links.checkout.href;
      return {paymentId: ex.data.id, checkoutUrl: link || null, status: ex.data.status, reused: true};
    }
  }

  const appUrl = APP_URL.replace(/\/$/, '');
  const redirectUrl = returnUrl || (appUrl + '/?paid=' + encodeURIComponent(reqId));
  const webhookUrl = 'https://europe-west1-t-service-prod.cloudfunctions.net/mollieWebhook';
  const out = await mollieApi('/payments', 'POST', {
    amount: {currency: 'EUR', value: amount.toFixed(2)},
    description: ('Ti-Services \u00b7 ' + (r.serviceName || r.service || 'prestation')).toString().slice(0, 100),
    redirectUrl: redirectUrl,
    webhookUrl: webhookUrl,
    captureMode: 'manual',
    metadata: {reqId: reqId, clientUid: uid},
  });
  if (!out.ok || !out.data) throw new HttpsError('internal', 'Création du paiement Mollie échouée.');
  const pay = out.data;
  await db.collection('requests').doc(reqId).set({
    molliePaymentId: pay.id, molliePaymentStatus: pay.status || 'open', molliePaymentAmount: amount,
  }, {merge: true});
  const checkout = pay._links && pay._links.checkout && pay._links.checkout.href;
  return {paymentId: pay.id, checkoutUrl: checkout || null, status: pay.status || 'open'};
});

/**
 * mollieWebhook : Mollie POSTe l'id du paiement à chaque changement d'état. On
 * re-interroge Mollie (source de vérité) et on reflète l'état sur la demande. On ne
 * débite jamais ici : la capture se fait à la validation (settleCommission). On répond
 * toujours 200 pour éviter les relances en boucle de Mollie.
 */
exports.mollieWebhook = onRequest({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (req, res) => {
  try {
    if (!mollieApiConfigured()) { res.status(200).send('ok'); return; }
    const id = (req.body && req.body.id) || (req.query && req.query.id) || '';
    if (!id) { res.status(400).send('missing id'); return; }
    const out = await mollieApi('/payments/' + encodeURIComponent(id), 'GET');
    if (out.ok && out.data) {
      const pay = out.data;
      const reqId = (pay.metadata && pay.metadata.reqId) || '';
      if (reqId) {
        const db = getFirestore();
        const upd = {molliePaymentStatus: pay.status || ''};
        if (pay.status === 'authorized') upd.molliePaymentAuthorized = true;
        if (pay.status === 'paid') upd.molliePaymentCaptured = true;
        try { await db.collection('requests').doc(reqId).set(upd, {merge: true}); } catch (e) { console.warn('mollieWebhook update', e); }
      }
    }
    res.status(200).send('ok');
  } catch (e) { console.warn('mollieWebhook', e); res.status(200).send('ok'); }
});

exports.mollieOnboardingStart = onRequest({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET']}, (req, res) => {
  if (!mollieOAuthConfigured()) { res.status(503).json({error: 'Mollie non configuré', message: 'Compte Mollie Connect à ouvrir + secrets à définir.'}); return; }
  const uid = (req.query.uid || req.query.state || '').toString();
  if (!uid) { res.status(400).json({error: 'uid manquant'}); return; }
  // redirect_uri FIGÉ côté serveur (jamais depuis la requête) : sinon un attaquant
  // pourrait détourner le code OAuth vers son propre domaine.
  const redirectUri = MOLLIE_RETURN_URL;
  const scope = ['onboarding.read', 'onboarding.write', 'organizations.read', 'payments.read', 'payments.write', 'profiles.read'].join(' ');
  const url = MOLLIE_AUTHORIZE +
    '?client_id=' + encodeURIComponent(process.env.MOLLIE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&state=' + encodeURIComponent(uid) +
    '&scope=' + encodeURIComponent(scope) +
    '&response_type=code&approval_prompt=auto';
  res.redirect(302, url);
});

/**
 * mollieOnboardingReturn : retour du parcours Mollie. On échange le `code` contre un
 * jeton, on lit l'organisation connectée de l'artisan et on l'enregistre sur sa fiche
 * (mollieOrgId + mollieStatus). Puis on renvoie l'artisan dans l'app.
 * Inerte tant que Mollie n'est pas configuré.
 */
exports.mollieOnboardingReturn = onRequest({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET']}, async (req, res) => {
  if (!mollieOAuthConfigured()) { res.status(503).json({error: 'Mollie non configuré'}); return; }
  const code = (req.query.code || '').toString();
  const uid = (req.query.state || '').toString();
  if (!code || !uid) { res.redirect(302, MOLLIE_APP_RETURN); return; }
  try {
    const redirectUri = MOLLIE_RETURN_URL;
    const basic = Buffer.from(process.env.MOLLIE_CLIENT_ID + ':' + process.env.MOLLIE_CLIENT_SECRET).toString('base64');
    const tokRes = await fetch(MOLLIE_TOKEN, {
      method: 'POST',
      headers: {'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=authorization_code&code=' + encodeURIComponent(code) + '&redirect_uri=' + encodeURIComponent(redirectUri),
    });
    if (!tokRes.ok) { console.warn('mollie token', tokRes.status, await tokRes.text()); res.redirect(302, MOLLIE_APP_RETURN + '?mollie=error'); return; }
    const tok = await tokRes.json();
    // Lit l'organisation connectée avec le jeton d'accès obtenu.
    const orgRes = await fetch(MOLLIE_API + '/organizations/me', {headers: {'Authorization': 'Bearer ' + tok.access_token}});
    const org = orgRes.ok ? await orgRes.json() : {};
    const orgId = org.id || '';
    await getFirestore().collection('artisans').doc(uid).set({
      mollieOrgId: orgId,
      mollieStatus: orgId ? 'active' : 'pending',
      mollieOnboardedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    res.redirect(302, MOLLIE_APP_RETURN + '?mollie=' + (orgId ? 'active' : 'pending'));
  } catch (e) { console.warn('mollieOnboardingReturn', e); res.redirect(302, MOLLIE_APP_RETURN + '?mollie=error'); }
});

/* ============================================================================
 * FACTURE CLIENT PAR E-MAIL — envoi AUTOMATIQUE à la fin de chaque mission.
 *
 * À la bascule « commission réglée » (le n° de facture est alors figé côté
 * serveur), on génère la facture CLIENT (au nom du prestataire, mandat de
 * facturation) en PDF VECTORIEL léger (pdf-lib, ~30-60 Ko, texte net) et on
 * la met en file dans la collection `mail` (extension Trigger Email) en PIÈCE
 * JOINTE base64. Le PDF n'est PAS stocké en permanence → impact stockage
 * négligeable (l'e-mail et sa pièce jointe sont transitoires).
 *
 * On n'envoie QUE la facture client (justificatif de la prestation). Les
 * factures de COMMISSION (Ti-Services ↔ artisan) restent internes, non
 * envoyées au client. Idempotent via `invoiceEmailed`.
 * ========================================================================== */
function eurTxt(x) { return (Math.round((Number(x) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
function escHtmlS(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function frDate(ts) {
  let d;
  try { d = (ts && ts.toDate) ? ts.toDate() : (ts ? new Date(ts) : new Date()); } catch (_) { d = new Date(); }
  if (!d || isNaN(d.getTime())) d = new Date();
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return d.getDate() + ' ' + mois[d.getMonth()] + ' ' + d.getFullYear();
}
// Reconstitue lignes + total EXACTEMENT comme l'app (totals()) : à l'acte =
// somme des actes + coup de pouce + forfait déplacement (< 50 €) ; horaire =
// tarif × heures facturées (finalHours si déclarées) + coup de pouce.
function invoiceLines(r) {
  const acts = Array.isArray(r.acts) ? r.acts : null;
  const boost = Number(r.boost) || 0;
  const lines = [];
  let sub = 0;
  if (acts && acts.length) {
    acts.forEach((a) => {
      const q = Number(a.qty) || 1; const pu = Number(a.price) || 0;
      lines.push({ label: a.nm || 'Prestation', qty: String(q), unit: eurTxt(pu), total: pu * q });
      sub += pu * q;
    });
  } else {
    const rate = Number(r.rate) || 0;
    const forfait = r.unit === 'forfait';
    const hours = forfait ? 1 : ((r.finalHours != null) ? Number(r.finalHours) : (Number(r.duration) || 1));
    const dayU = r.unit === 'j';
    lines.push({ label: r.serviceName || 'Prestation', qty: forfait ? 'forfait' : (hours + (dayU ? ' j' : ' h')), unit: eurTxt(rate), total: rate * hours });
    sub += rate * hours;
  }
  const maj = Math.round(sub * boost / 100);
  if (maj > 0) lines.push({ label: 'Coup de pouce +' + boost + '%', qty: '1', unit: eurTxt(maj), total: maj });
  const travel = (acts && acts.length && sub > 0 && sub < 50) ? 20 : 0;
  if (travel > 0) lines.push({ label: 'Forfait de déplacement', qty: '1', unit: eurTxt(travel), total: travel });
  // Pourboire (facultatif, laissé à la validation) — reversé intégralement à l'artisan.
  const tip = Math.max(0, Math.round((Number(r.tip) || 0) * 100) / 100);
  if (tip > 0) lines.push({ label: 'Pourboire', qty: '1', unit: eurTxt(tip), total: tip });
  return { lines, total: Math.round((sub + maj + travel + tip) * 100) / 100 };
}
function wrapPdf(page, font, size, color, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) > maxW && line) { page.drawText(line, { x, y, size, font, color }); y -= lh; line = w; }
    else { line = test; }
  }
  if (line) { page.drawText(line, { x, y, size, font, color }); y -= lh; }
  return y;
}
// PDF vectoriel A4 → base64. Texte uniquement (pas d'image) = fichier très léger.
async function buildInvoicePdf(inv) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.137, 0.118, 0.2); const coral = rgb(1, 0.416, 0.357);
  const mut = rgb(0.45, 0.43, 0.5); const hair = rgb(0.87, 0.85, 0.88); const teal = rgb(0.05, 0.5, 0.5);
  const M = 46; const W = 595.28; const R = W - M;
  const T = (s, x, y, sz, f, c) => page.drawText(String(s == null ? '' : s), { x, y, size: sz, font: f || font, color: c || ink });
  const TR = (s, xr, y, sz, f, c) => { s = String(s == null ? '' : s); const w = (f || font).widthOfTextAtSize(s, sz); page.drawText(s, { x: xr - w, y, size: sz, font: f || font, color: c || ink }); };
  let y = 792;
  T('Ti', M, y, 22, bold, coral);
  T('-Services', M + bold.widthOfTextAtSize('Ti', 22), y, 22, bold, ink);
  T('Services à la demande - Saint-Barthélemy', M, y - 15, 8.5, font, mut);
  TR('FACTURE', R, y + 2, 20, bold, ink);
  TR('N° ' + inv.invNo, R, y - 13, 10, font, mut);
  TR(inv.dateStr, R, y - 26, 10, font, mut);
  TR('PAYÉE', R, y - 41, 10, bold, teal);
  y -= 62;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1, color: hair });
  y -= 22;
  const colL = M; const colR = M + 275;
  T('PRESTATAIRE', colL, y, 8, bold, mut); T('FACTURÉ À', colR, y, 8, bold, mut);
  y -= 14;
  T(inv.provider.legal || 'Artisan Ti-Services', colL, y, 11, bold, ink);
  T(inv.client.company || inv.client.name || 'Client', colR, y, 11, bold, ink);
  y -= 13;
  const pL = [inv.provider.address || 'Saint-Barthélemy', inv.provider.siret ? ('SIRET ' + inv.provider.siret) : ''].filter(Boolean);
  const cL = [inv.client.company ? inv.client.name : '', inv.client.siret ? ('SIRET ' + inv.client.siret) : '', (inv.client.zone ? inv.client.zone + ', ' : '') + 'Saint-Barthélemy'].filter(Boolean);
  const mx = Math.max(pL.length, cL.length);
  for (let i = 0; i < mx; i++) { if (pL[i]) T(pL[i], colL, y, 9, font, mut); if (cL[i]) T(cL[i], colR, y, 9, font, mut); y -= 12; }
  y -= 14;
  const cQty = 372; const cUnit = 462; const cTot = R;
  page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 20, color: rgb(0.98, 0.965, 0.955) });
  T('Prestation', M + 6, y + 1, 9, bold, ink); TR('Qté', cQty, y + 1, 9, bold, ink); TR('Prix unit.', cUnit, y + 1, 9, bold, ink); TR('Total', cTot - 6, y + 1, 9, bold, ink);
  y -= 13;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.7, color: hair });
  y -= 16;
  inv.lines.forEach((ln) => {
    T(ln.label, M + 6, y, 10, font, ink); TR(ln.qty, cQty, y, 10, font, ink); TR(ln.unit, cUnit, y, 10, font, ink); TR(eurTxt(ln.total), cTot - 6, y, 10, bold, ink);
    y -= 18;
  });
  y -= 2;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.7, color: hair });
  y -= 22;
  T('TOTAL RÉGLÉ', cUnit - 44, y, 11, bold, ink);
  TR(eurTxt(inv.total), cTot - 6, y, 13, bold, coral);
  y -= 17;
  TR('Réglé par carte bancaire le ' + inv.dateStr + ' - encaissement via Mollie (agréé). Aucun solde dû.', cTot - 6, y, 7.5, font, mut);
  y -= 34;
  const legal = [
    "TVA non applicable - Saint-Barthélemy (collectivité d'outre-mer, hors du champ de la TVA française).",
    "Facture établie par Ti-Services au nom et pour le compte du prestataire, en vertu d'un mandat de facturation (art. 289 du CGI).",
    'Document remis au client à titre de justificatif de la prestation réglée.',
    'Ti-Services est un service édité par C.C.S - Construction Conseils et Services, SAS.',
  ];
  legal.forEach((p) => { y = wrapPdf(page, font, 7.5, mut, p, M, y, R - M, 10); y -= 3; });
  const bytes = await doc.save();
  return Buffer.from(bytes).toString('base64');
}

// PROCURATION (mandat de retrait de colis par un tiers) — vrai document PDF vectoriel,
// avec la signature manuscrite du destinataire intégrée (PNG). Généré à la demande.
async function buildProcurationPdf(d) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.137, 0.118, 0.2); const coral = rgb(1, 0.416, 0.357);
  const mut = rgb(0.45, 0.43, 0.5); const hair = rgb(0.87, 0.85, 0.88);
  const M = 46; const W = 595.28; const R = W - M;
  const T = (s, x, y, sz, f, c) => page.drawText(String(s == null ? '' : s), { x, y, size: sz, font: f || font, color: c || ink });
  const TR = (s, xr, y, sz, f, c) => { s = String(s == null ? '' : s); const w = (f || font).widthOfTextAtSize(s, sz); page.drawText(s, { x: xr - w, y, size: sz, font: f || font, color: c || ink }); };
  let y = 792;
  T('Ti', M, y, 20, bold, coral); T('-Services', M + bold.widthOfTextAtSize('Ti', 20), y, 20, bold, ink);
  T('Services à la demande - Saint-Barthélemy', M, y - 14, 8.5, font, mut);
  TR('PROCURATION', R, y + 1, 20, bold, ink);
  TR('Retrait de courrier / colis par un tiers', R, y - 14, 9, font, mut);
  y -= 34;
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1, color: hair }); y -= 24;
  y = wrapPdf(page, font, 11, ink, 'Je soussigné(e) ' + (d.recipient || '-') + ', destinataire, donne procuration à ' + (d.providerName || 'le prestataire mandaté par Ti-Services') + ' pour retirer en mon nom, au bureau de poste de ' + (d.poste || '-') + ', le(s) pli(s) et colis désignés ci-dessous.', M, y, R - M, 16);
  y -= 16;
  page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 20, color: rgb(0.98, 0.965, 0.955) });
  T('Type', M + 6, y + 1, 9, bold, ink); T("N° d'avis", M + 250, y + 1, 9, bold, ink);
  y -= 13; page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.7, color: hair }); y -= 16;
  const items = d.items || [];
  if (items.length) { items.forEach((it) => { T(it.type || 'Objet', M + 6, y, 10, font, ink); T(it.num || '-', M + 250, y, 10, font, ink); y -= 16; }); }
  else { T('-', M + 6, y, 10, font, mut); y -= 16; }
  y -= 4; page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 0.7, color: hair }); y -= 22;
  T('PIÈCES JOINTES', M, y, 8, bold, mut); y -= 13;
  y = wrapPdf(page, font, 9, mut, "Copie de la pièce d'identité du destinataire. Le mandataire présentera sa propre pièce d'identité originale au guichet.", M, y, R - M, 12);
  y -= 22;
  T('Fait à Saint-Barthélemy', M, y, 9, font, mut);
  if (d.dateFromStr || d.dateToStr) T('Période : ' + (d.dateFromStr || '') + ' -> ' + (d.dateToStr || ''), M, y - 13, 9, font, mut);
  TR('Signature du destinataire', R, y + 30, 8, bold, mut);
  if (d.signatureBytes) {
    try { const png = await doc.embedPng(d.signatureBytes); const sw = 150; const sh = Math.min(png.height * (sw / png.width), 56); page.drawImage(png, { x: R - sw, y: y - 4, width: sw, height: sh }); } catch (e) { console.warn('procuration sig embed', e); }
  }
  TR(d.signedDateStr ? ('Signé électroniquement le ' + d.signedDateStr) : 'Signé électroniquement via Ti-Services', R, y - 12, 7.5, font, mut);
  y -= 40;
  const legal = [
    "Procuration établie via Ti-Services (mise en relation). Certains plis « à remettre en main propre » (actes d'huissier, plis judiciaires) ne peuvent être retirés par un tiers.",
    'Document valable pour la période indiquée. Ti-Services est un service édité par C.C.S - Construction Conseils et Services, SAS.',
  ];
  legal.forEach((p) => { y = wrapPdf(page, font, 7.5, mut, p, M, y, R - M, 10); y -= 3; });
  const bytes = await doc.save();
  return Buffer.from(bytes).toString('base64');
}

exports.emailClientInvoice = onDocumentUpdated({document: 'requests/{reqId}', secrets: [SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  // Bascule « commission réglée » (n° de facture figé) — une seule fois.
  if (before.commissionSettled || !after.commissionSettled) return;
  if (after.invoiceEmailed) return;
  const clientUid = after.clientUid;
  if (!clientUid) { console.log('emailClientInvoice : demande sans clientUid, ignorée.'); return; }
  const db = getFirestore();
  let email = ''; let clientName = after.clientName || 'Client'; let company = ''; let csiret = '';
  try {
    const u = (await db.collection('users').doc(clientUid).get()).data() || {};
    email = u.email || '';
    if (u.name) clientName = u.name;
    if (u.isPro) { company = u.company || ''; csiret = u.siret || ''; }
  } catch (_) {}
  if (!email) { console.log('emailClientInvoice : pas d\'e-mail client, ignoré.'); return; }
  const { lines, total } = invoiceLines(after);
  const invNo = after.saleInvoiceNo || after.invNo || ('2026-' + String(event.params.reqId).slice(-4));
  const dateStr = frDate(after.settledAt);
  const svcName = (after.serviceName || 'prestation').toString().slice(0, 80);
  let pdfB64 = '';
  try {
    pdfB64 = await buildInvoicePdf({
      invNo, dateStr,
      provider: { legal: after.providerLegal || after.providerName || 'Artisan Ti-Services', address: after.providerAddress || '', siret: after.providerSiret || '' },
      client: { name: clientName, company, siret: csiret, zone: after.zone || '' },
      lines, total,
    });
  } catch (e) { console.warn('buildInvoicePdf', e); }
  const message = {
    subject: 'Votre facture Ti-Services - ' + svcName + ' (n° ' + invNo + ')',
    html: '<p>Bonjour ' + escHtmlS(String(clientName).split(' ')[0]) + ',</p>' +
          '<p>Merci d\'avoir fait appel à <b>Ti-Services</b>. Vous trouverez ci-joint votre facture (PDF) pour la prestation « ' + escHtmlS(svcName) + ' » du ' + dateStr + '.</p>' +
          '<p>Elle reste également disponible à tout moment dans l\'application, rubrique « Historique &amp; factures ».</p>' +
          '<p>À très vite,<br>L\'équipe Ti-Services</p>',
  };
  if (pdfB64) message.attachments = [{ filename: 'Facture-Ti-Services-' + invNo + '.pdf', content: pdfB64, encoding: 'base64' }];
  try {
    await sendMail(db, email, message);
    await event.data.after.ref.update({ invoiceEmailed: true, invoiceEmailedAt: FieldValue.serverTimestamp() });
    console.log('Facture client envoyée à ' + email + ' (n° ' + invNo + ', ' + total + ' €)');
  } catch (e) { console.warn('emailClientInvoice send', e); }
});

/* Téléchargement à la demande de la facture PDF (bouton « Télécharger le PDF » de
 * l'app). On régénère EXACTEMENT le même document vectoriel que celui envoyé par
 * e-mail, à partir de la demande figée dans Firestore — donc un vrai fichier .pdf,
 * sans passer par la boîte d'impression du navigateur. Réservé au client concerné,
 * au prestataire assigné et à l'admin. */
exports.invoicePdf = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const reqId = String((request.data && request.data.reqId) || '').trim();
  if (!reqId) throw new HttpsError('invalid-argument', 'Facture introuvable.');
  const db = getFirestore();
  const snap = await db.collection('requests').doc(reqId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Facture introuvable.');
  const r = snap.data() || {};
  const email = (request.auth.token && request.auth.token.email) || '';
  const admin = !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (r.clientUid !== uid && r.providerUid !== uid && !admin) {
    throw new HttpsError('permission-denied', 'Accès refusé.');
  }
  const { lines, total } = invoiceLines(r);
  const invNo = r.saleInvoiceNo || r.invNo || ('2026-' + reqId.slice(-4));
  const dateStr = frDate(r.settledAt);
  let clientName = r.clientName || 'Client'; let company = ''; let csiret = '';
  try {
    const u = (await db.collection('users').doc(r.clientUid).get()).data() || {};
    if (u.name) clientName = u.name;
    if (u.isPro) { company = u.company || ''; csiret = u.siret || ''; }
  } catch (_) {}
  let pdf = '';
  try {
    pdf = await buildInvoicePdf({
      invNo, dateStr,
      provider: { legal: r.providerLegal || r.providerName || 'Artisan Ti-Services', address: r.providerAddress || '', siret: r.providerSiret || '' },
      client: { name: clientName, company, siret: csiret, zone: r.zone || '' },
      lines, total,
    });
  } catch (e) { console.warn('invoicePdf build', e); throw new HttpsError('internal', 'Génération du PDF impossible.'); }
  return { pdf, invNo, filename: 'Facture-Ti-Services-' + invNo + '.pdf' };
});

// Téléchargement de la PROCURATION en PDF (mandat de retrait de colis) : régénère un
// vrai document signé à partir de la demande + des détails privés. Réservé au client
// concerné, au prestataire assigné et à l'admin.
exports.procurationPdf = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const reqId = String((request.data && request.data.reqId) || '').trim();
  if (!reqId) throw new HttpsError('invalid-argument', 'Demande introuvable.');
  const db = getFirestore();
  const snap = await db.collection('requests').doc(reqId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Demande introuvable.');
  const r = snap.data() || {};
  if (r.service !== 'colis') throw new HttpsError('failed-precondition', 'Cette demande n’a pas de procuration.');
  const email = (request.auth.token && request.auth.token.email) || '';
  const admin = !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (r.clientUid !== uid && r.providerUid !== uid && !admin) throw new HttpsError('permission-denied', 'Accès refusé.');
  let det = {};
  try { det = (await db.collection('requests').doc(reqId).collection('private').doc('details').get()).data() || {}; } catch (_) {}
  const colis = det.colis || {};
  const TYPES = { recommande: 'Recommandé', colis: 'Colis', suivi: 'Lettre suivie', autre: 'Autre' };
  const items = (colis.items || []).map((it) => ({ type: TYPES[it.type] || 'Objet', num: it.num || '' }));
  let signatureBytes = null;
  const sig = r.colisSignature || '';
  if (sig && /^data:image\/png;base64,/.test(sig)) { try { signatureBytes = Buffer.from(sig.replace(/^data:image\/png;base64,/, ''), 'base64'); } catch (_) {} }
  let pdf = '';
  try {
    pdf = await buildProcurationPdf({
      recipient: colis.recipient || r.clientName || '',
      providerName: r.providerName || '',
      poste: r.poste || colis.poste || '',
      dateFromStr: (r.dateFrom || colis.dateFrom) ? frDate(r.dateFrom || colis.dateFrom) : '',
      dateToStr: (r.dateTo || colis.dateTo) ? frDate(r.dateTo || colis.dateTo) : '',
      items,
      signatureBytes,
      signedDateStr: r.colisSignedAt ? frDate(r.colisSignedAt) : '',
    });
  } catch (e) { console.warn('procurationPdf build', e); throw new HttpsError('internal', 'Génération du PDF impossible.'); }
  return { pdf, filename: 'Procuration-Ti-Services-' + reqId.slice(-5) + '.pdf' };
});

/* ============================================================================
 * E-MAIL DE BIENVENUE — à la création d'un compte, un e-mail soigné à la charte
 * Ti-Services. Deux versions distinctes : CLIENT (réserver un intervenant) et
 * INTERVENANT / prestataire (profil enregistré, recevoir des missions). Aucune
 * mention d'argent ni de commission. Rappelle d'installer l'application + comment.
 * ========================================================================== */
function welcomeFeatureRow(dot, title, txt) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>' +
    '<td width="30" valign="top"><div style="width:11px;height:11px;border-radius:50%;background:' + dot + ';margin-top:5px"></div></td>' +
    '<td><b style="font-size:14px;color:#231E33">' + title + '</b>' +
    '<div style="font-size:13px;color:#6b6577;margin-top:2px;line-height:1.5">' + txt + '</div></td></tr></table>';
}

function welcomeHtml(first, role) {
  const app = APP_URL.replace(/\/$/, '');
  const isPro = (role === 'artisan' || role === 'concierge' || role === 'pro');
  // Accents : corail pour les clients, sarcelle (teal) pour les intervenants.
  const c1 = isPro ? '#0FA896' : '#FF6A5B';
  const c2 = isPro ? '#14C2A8' : '#FF9F54';
  const btn = isPro ? '#0FA896' : '#FF6A5B';
  const dot = isPro ? '#0FA896' : '#FF6A5B';
  const name = escHtmlS(first);

  const intro = isPro ?
    ('Votre <b>profil intervenant</b> Ti-Services est bien enregistré. Dès qu\'il est validé par notre équipe, ' +
     'vous recevrez vos premières <b>demandes de mission</b> directement dans l\'application — près de chez vous, ' +
     'à Saint-Barthélemy.') :
    ('Votre compte <b>Ti-Services</b> est créé, votre inscription est confirmée. Réservez en quelques minutes un ' +
     'intervenant local et de confiance, où que vous soyez à Saint-Barth : ménage, jardinage, coiffure, sport, ' +
     'garde d\'enfants, et bien plus.');

  const feats = isPro ? (
    welcomeFeatureRow(dot, 'Des missions près de chez vous', 'Recevez les demandes de votre zone, selon les créneaux que vous choisissez.') +
    welcomeFeatureRow(dot, 'Vous gardez la main', 'Vous acceptez uniquement les missions qui vous conviennent et gérez votre agenda.') +
    welcomeFeatureRow(dot, 'Un cadre sérieux', 'Profils vérifiés et assurés : un environnement de confiance pour vous et vos clients.')
  ) : (
    welcomeFeatureRow(dot, 'Des intervenants vérifiés', 'Identité, SIRET et assurance contrôlés avant l\'activation de chaque profil.') +
    welcomeFeatureRow(dot, '100 % Saint-Barth', 'Des professionnels locaux, disponibles à la demande, près de chez vous.') +
    welcomeFeatureRow(dot, 'Suivi en direct', 'Vous suivez votre intervention et échangez avec votre intervenant dans l\'app.')
  );

  const installIntro = isPro ?
    'Installez l\'app et activez les notifications pour ne manquer aucune demande de mission&nbsp;:' :
    'Ajoutez Ti-Services à votre écran d\'accueil — vous la retrouverez comme une vraie application, avec les notifications&nbsp;:';

  const ctaLabel = isPro ? 'Ouvrir mon espace' : 'Ouvrir Ti-Services';

  const installBlock =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F4;border:1px solid #efeae4;border-radius:14px;margin-top:6px">' +
      '<tr><td style="padding:16px 18px">' +
        '<div style="font-size:14px;font-weight:700;color:#231E33">Installez l\'application</div>' +
        '<div style="font-size:13px;color:#6b6577;line-height:1.5;margin:6px 0 12px">' + installIntro + '</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px"><tr><td align="center">' +
          '<a href="' + app + '/?install=1" style="display:inline-block;background:' + btn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:11px">Installer l\'application</a>' +
        '</td></tr></table>' +
        '<div style="font-size:12px;color:#8a8494;line-height:1.5;margin-bottom:10px">Le bouton ci-dessus ouvre l\'app et lance l\'installation. Ou à la main&nbsp;:</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr>' +
          '<td width="86" valign="top"><span style="display:inline-block;font-size:11px;font-weight:700;color:' + c1 + ';background:#ffffff;border:1px solid #efeae4;border-radius:8px;padding:4px 8px">iPhone</span></td>' +
          '<td style="font-size:13px;color:#4a4556;line-height:1.5">Ouvrez ce lien dans <b>Safari</b>, touchez le bouton <b>Partager</b> (le carré avec une flèche), puis <b>« Sur l\'écran d\'accueil »</b>.</td>' +
        '</tr></table>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
          '<td width="86" valign="top"><span style="display:inline-block;font-size:11px;font-weight:700;color:' + c1 + ';background:#ffffff;border:1px solid #efeae4;border-radius:8px;padding:4px 8px">Android</span></td>' +
          '<td style="font-size:13px;color:#4a4556;line-height:1.5">Ouvrez ce lien dans <b>Chrome</b>, touchez le menu <b>⋮</b> en haut à droite, puis <b>« Installer l\'application »</b>.</td>' +
        '</tr></table>' +
      '</td></tr>' +
    '</table>';

  return '' +
  '<div style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#231E33">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F4;padding:24px 12px">' +
      '<tr><td align="center">' +
        '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">' +
          '<tr><td style="height:6px;background:linear-gradient(90deg,' + c1 + ',' + c2 + ')"></td></tr>' +
          '<tr><td align="center" style="padding:26px 30px 4px">' +
            '<img src="cid:tilogo" width="60" height="60" alt="Ti-Services" style="display:block;border-radius:16px;margin:0 auto 10px">' +
            '<div style="font-size:24px;font-weight:800;letter-spacing:-.02em"><span style="color:' + (isPro ? '#0FA896' : '#FF6A5B') + '">Ti</span><span style="color:#231E33">-Services</span></div>' +
            '<div style="font-size:12px;color:#8a8494;margin-top:2px">Services à la demande · Saint-Barthélemy</div>' +
          '</td></tr>' +
          '<tr><td style="padding:14px 30px 0">' +
            '<h1 style="font-size:22px;margin:8px 0 0;color:#231E33">Bienvenue ' + name + '&nbsp;!</h1>' +
            '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:12px 0 0">' + intro + '</p>' +
          '</td></tr>' +
          '<tr><td style="padding:22px 30px 4px">' + feats + '</td></tr>' +
          '<tr><td style="padding:6px 30px 0">' + installBlock + '</td></tr>' +
          '<tr><td align="center" style="padding:20px 30px 28px">' +
            '<a href="' + app + '" style="display:inline-block;background:' + btn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:12px">' + ctaLabel + '</a>' +
          '</td></tr>' +
          '<tr><td style="padding:16px 30px;border-top:1px solid #efeae4;background:#FBF7F4">' +
            '<div style="font-size:12px;color:#8a8494;line-height:1.6">À très vite,<br>L\'équipe Ti-Services<br>' +
            '<span style="color:#b0aab8">Service édité par C.C.S — Construction Conseils et Services, SAS · Saint-Barthélemy</span></div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}

/* ============================================================================
 * E-MAIL D'INVITATION ARTISAN — pour prospecter un pro (envoyé à la main depuis la
 * console admin). Même charte que la bienvenue, accent sarcelle. Aucun détail
 * d'argent/commission ; met en avant les missions locales et l'inscription gratuite.
 * ========================================================================== */
function inviteArtisanHtml(name) {
  const app = APP_URL.replace(/\/$/, '');
  // Couleurs de marque Ti-Services (corail), comme l'e-mail de bienvenue client.
  const c1 = '#FF6A5B', c2 = '#FF9F54', btn = '#FF6A5B', dot = '#FF6A5B';
  // Salutation sans prénom par défaut (envoi rapide sans risque) ; prénom seulement si fourni.
  const hi = name ? ('Bonjour ' + escHtmlS(name) + ',') : 'Bonjour,';
  const feats =
    welcomeFeatureRow(dot, 'Des missions près de chez vous', 'Recevez les demandes de votre zone, sur les créneaux que vous choisissez.') +
    welcomeFeatureRow(dot, 'Vous gardez la main', 'Vous acceptez seulement les missions qui vous conviennent et gérez votre agenda.') +
    welcomeFeatureRow(dot, 'Un cadre sérieux', 'Profils vérifiés et assurés : un environnement de confiance pour vous et vos clients.') +
    welcomeFeatureRow(dot, 'Inscription gratuite', 'Créez votre profil en quelques minutes, sans engagement.');
  return '' +
  '<div style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#231E33">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F4;padding:24px 12px">' +
      '<tr><td align="center">' +
        '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">' +
          '<tr><td style="height:6px;background:linear-gradient(90deg,' + c1 + ',' + c2 + ')"></td></tr>' +
          '<tr><td align="center" style="padding:26px 30px 4px">' +
            '<img src="cid:tilogo" width="60" height="60" alt="Ti-Services" style="display:block;border-radius:16px;margin:0 auto 10px">' +
            '<div style="font-size:24px;font-weight:800;letter-spacing:-.02em"><span style="color:#FF6A5B">Ti</span><span style="color:#231E33">-Services</span></div>' +
            '<div style="font-size:12px;color:#8a8494;margin-top:2px">Services à la demande · Saint-Barthélemy</div>' +
          '</td></tr>' +
          '<tr><td style="padding:14px 30px 0">' +
            '<h1 style="font-size:22px;margin:8px 0 0;color:#231E33">Rejoignez Ti-Services</h1>' +
            '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:12px 0 0">' + hi + '</p>' +
            '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:10px 0 0">Votre travail à Saint-Barthélemy correspond exactement à ce que recherchent nos clients. <b>Ti-Services</b> est une nouvelle application <b>100 % Saint-Barth</b> qui met en relation les habitants avec des artisans et intervenants locaux de confiance — et vous recevez vos <b>demandes de mission</b> directement dans l\'application.</p>' +
          '</td></tr>' +
          '<tr><td style="padding:22px 30px 4px">' + feats + '</td></tr>' +
          '<tr><td align="center" style="padding:18px 30px 6px">' +
            '<a href="' + app + '" style="display:inline-block;background:' + btn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:12px">Créer mon profil</a>' +
          '</td></tr>' +
          '<tr><td align="center" style="padding:0 30px 26px"><div style="font-size:12px;color:#8a8494">C\'est gratuit et ça prend quelques minutes · <a href="' + app + '" style="color:' + c1 + ';text-decoration:none">ti-services.fr</a></div></td></tr>' +
          '<tr><td style="padding:16px 30px;border-top:1px solid #efeae4;background:#FBF7F4">' +
            '<div style="font-size:12px;color:#8a8494;line-height:1.6">Au plaisir de vous compter parmi nous,<br>L\'équipe Ti-Services<br>' +
            '<span style="color:#b0aab8">Service édité par C.C.S — Construction Conseils et Services, SAS · Saint-Barthélemy</span></div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}

// Envoi de l'e-mail d'invitation artisan — RÉSERVÉ à l'admin (console). L'e-mail part
// via le SMTP, avec le logo intégré (cid).
exports.sendArtisanInvite = onCall({secrets: [SMTP_PASS]}, async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const to = String((request.data && request.data.email) || '').trim();
  const name = String((request.data && request.data.name) || '').trim().slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    throw new HttpsError('invalid-argument', 'Adresse e-mail invalide.');
  }
  const attachments = [];
  try {
    const logo = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png'));
    attachments.push({ filename: 'ti-services.png', content: logo, cid: 'tilogo' });
  } catch (_) {}
  const ok = await sendMail(getFirestore(), to, {
    subject: 'Rejoignez Ti-Services — les clients de Saint-Barth vous cherchent',
    html: inviteArtisanHtml(name),
    attachments,
  });
  if (!ok) throw new HttpsError('internal', 'L\'envoi a échoué — réessayez.');
  return { sent: true };
});

exports.welcomeClientEmail = onDocumentCreated({document: 'users/{uid}', secrets: [SMTP_PASS]}, async (event) => {
  const snap = event.data; if (!snap) return;
  const u = snap.data() || {};
  const email = u.email || '';
  if (!email) return;
  const role = u.role || 'client';
  const isPro = (role === 'artisan' || role === 'concierge' || role === 'pro');
  const first = String(u.name || '').trim().split(' ')[0] || (isPro ? 'à bord' : 'à bord');
  const subject = isPro ?
    'Bienvenue chez Ti-Services — votre profil intervenant' :
    'Bienvenue sur Ti-Services';
  // Logo intégré à l'e-mail (cid:tilogo) : s'affiche toujours, sans dépendre d'une URL.
  const attachments = [];
  try {
    const logo = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png'));
    attachments.push({ filename: 'ti-services.png', content: logo, cid: 'tilogo' });
  } catch (_) {}
  try {
    await sendMail(getFirestore(), email, { subject, html: welcomeHtml(first, role), attachments });
    console.log('E-mail de bienvenue (' + (isPro ? 'intervenant' : 'client') + ') → ' + email);
  } catch (e) { console.warn('welcomeClientEmail', e); }
});


// Export interne pour les tests unitaires (inerte en production : TI_TEST non défini).
if (process.env.TI_TEST) { module.exports.__test = { buildInvoicePdf, buildProcurationPdf, invoiceLines, eurTxt, frDate, welcomeHtml, inviteArtisanHtml }; }
