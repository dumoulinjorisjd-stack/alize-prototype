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
const {onDocumentCreated, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const {onRequest} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({region: 'europe-west1', maxInstances: 5});

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
 * configurés (compte Mollie Connect à ouvrir). Sans secret, tout est un no-op sûr :
 *   firebase functions:secrets:set MOLLIE_CLIENT_ID
 *   firebase functions:secrets:set MOLLIE_CLIENT_SECRET
 *   firebase functions:secrets:set MOLLIE_ACCESS_TOKEN     (jeton d'organisation plateforme)
 * ========================================================================== */
const MOLLIE_AUTHORIZE = 'https://my.mollie.com/oauth2/authorize';
const MOLLIE_TOKEN = 'https://api.mollie.com/oauth2/tokens';
const MOLLIE_API = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || 'https://ti-services.web.app';
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
    .filter((d) => { const c = (d.data() || {}).cats || []; return !svc || c.indexOf(svc) >= 0; })
    .map((d) => d.id);
  if (!uids.length) { console.log('Aucun artisan validé pour ce service.'); return; }

  // Priorité : si le client a demandé un artisan précis, seul lui est notifié
  // pendant la fenêtre de priorité (le repli vers tous les artisans après le délai
  // est géré côté application, qui rend la demande visible à tous passé priorityUntil).
  const preferred = r.preferredProviderUid;
  const targetUids = preferred ? (uids.indexOf(preferred) >= 0 ? [preferred] : []) : uids;
  if (!targetUids.length) { console.log('Artisan prioritaire indisponible — repli géré côté app.'); return; }

  // Jetons push de ces artisans (avec correspondance jeton -> uid pour le nettoyage).
  const tokenToUid = {};
  await Promise.all(targetUids.map(async (uid) => {
    try {
      const u = await db.collection('users').doc(uid).get();
      ((u.data() || {}).pushTokens || []).forEach((tok) => { tokenToUid[tok] = uid; });
    } catch (_) {}
  }));
  const tokens = Object.keys(tokenToUid);
  if (!tokens.length) { console.log('Aucun jeton artisan enregistré.'); return; }

  const svcName = (r.serviceName || 'Nouvelle prestation').toString().slice(0, 60);
  const zone = (r.zone || '').toString().slice(0, 40);
  const message = {
    tokens,
    data: {
      title: preferred ? 'Espace artisan · Mission pour vous' : 'Espace artisan · Nouvelle mission',
      body: preferred
        ? (svcName + (zone ? ' · ' + zone : '') + ' — demandée pour vous en priorité.')
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
exports.notifyArtisanApproved = onDocumentUpdated('artisans/{artisanId}', async (event) => {
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
      await db.collection('mail').add({
        to: email,
        message: {
          subject: 'Votre inscription Ti-Services est validée 🎉',
          html: '<p>Bonjour ' + name + ',</p>' +
                '<p>Bonne nouvelle : votre inscription en tant qu\'artisan sur <b>Ti-Services</b> vient d\'être validée.</p>' +
                '<p>Votre compte est désormais actif : vous pouvez recevoir des demandes de missions. Ouvrez l\'application pour commencer — elle s\'ouvrira automatiquement sur votre espace missions.</p>' +
                '<p>À très vite,<br>L\'équipe Ti-Services</p>',
        },
      });
    } catch (e) { console.warn('approve email queue', e); }
  }
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
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

exports.settleCommission = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  // On agit UNIQUEMENT sur la transition -> « paid », et une seule fois.
  if (before.status === 'paid' || after.status !== 'paid') return;
  if (after.commissionSettled) return;

  const providerUid = after.providerUid;
  if (!providerUid) { console.log('settleCommission : demande sans providerUid, ignorée.'); return; }

  const rate = Number(after.rate) || 0;
  const hours = (after.finalHours != null) ? Number(after.finalHours) : (Number(after.duration) || 0);
  const base = round2(rate * hours);
  const boost = Number(after.boost) || 0;
  const gross = round2(base + round2(base * boost / 100));

  const db = getFirestore();
  let jobsTotal = 0;
  try {
    const a = await db.collection('artisans').doc(providerUid).get();
    jobsTotal = (a.data() || {}).jobsTotal || 0;
  } catch (_) {}

  const pct = commissionTierPct(jobsTotal);
  const commission = round2(base * pct / 100);
  const net = round2(gross - commission);

  const reqId = event.params.reqId;

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
      grossTotal: gross,          // réglé par le client
      commissionPct: pct,
      commissionAmount: commission, // revenu Ti-Services
      netAmount: net,             // net perçu par l'artisan
      invNo: saleInvoiceNo,       // numéro de facture séquentiel (mandat, au nom de l'artisan)
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

    // 3) VERSEMENT MOLLIE (le cas échéant) : route le NET vers l'organisation de
    //    l'artisan et garde la commission sur le solde plateforme. Inerte tant que
    //    Mollie n'est pas configuré ou que le paiement est simulé (pas de molliePaymentId).
    try {
      const orgId = after.mollieOrgId || (await db.collection('artisans').doc(providerUid).get()).get('mollieOrgId');
      if (orgId && after.molliePaymentId) {
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
  if (!(wasActive && after.status === 'pending')) return;

  const db = getFirestore();
  const svc = after.service;
  const exclude = before.providerUid || '';

  // 1) Re-notifier les artisans validés du service (hors celui qui s'est désisté).
  try {
    const artsSnap = await db.collection('artisans').where('status', '==', 'valide').get();
    const uids = artsSnap.docs
      .filter((d) => { const c = (d.data() || {}).cats || []; return (!svc || c.indexOf(svc) >= 0) && d.id !== exclude; })
      .map((d) => d.id);
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

  // 2) Prévenir le client que la recherche est relancée.
  try {
    const clientUid = after.clientUid;
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
 * mollieOnboardingStart : point d'entrée du parcours d'activation des paiements.
 * L'app y redirige l'artisan ; on renvoie (302) vers le parcours hébergé Mollie
 * (OAuth). `state` = uid de l'artisan pour le corréler au retour.
 *
 * SÉCURITÉ : en production, signer `state` (jeton à usage unique) plutôt que de
 * passer l'uid en clair, et vérifier l'authentification de l'appelant. Inerte tant
 * que MOLLIE_CLIENT_ID/SECRET ne sont pas configurés.
 */
exports.mollieOnboardingStart = onRequest({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET']}, (req, res) => {
  if (!mollieOAuthConfigured()) { res.status(503).json({error: 'Mollie non configuré', message: 'Compte Mollie Connect à ouvrir + secrets à définir.'}); return; }
  const uid = (req.query.uid || req.query.state || '').toString();
  if (!uid) { res.status(400).json({error: 'uid manquant'}); return; }
  const redirectUri = (req.query.redirect_uri || (APP_URL.replace(/\/$/, '') + '/mollieOnboardingReturn')).toString();
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
  if (!code || !uid) { res.redirect(302, APP_URL); return; }
  try {
    const redirectUri = APP_URL.replace(/\/$/, '') + '/mollieOnboardingReturn';
    const basic = Buffer.from(process.env.MOLLIE_CLIENT_ID + ':' + process.env.MOLLIE_CLIENT_SECRET).toString('base64');
    const tokRes = await fetch(MOLLIE_TOKEN, {
      method: 'POST',
      headers: {'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=authorization_code&code=' + encodeURIComponent(code) + '&redirect_uri=' + encodeURIComponent(redirectUri),
    });
    if (!tokRes.ok) { console.warn('mollie token', tokRes.status, await tokRes.text()); res.redirect(302, APP_URL + '?mollie=error'); return; }
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
    res.redirect(302, APP_URL + '?mollie=' + (orgId ? 'active' : 'pending'));
  } catch (e) { console.warn('mollieOnboardingReturn', e); res.redirect(302, APP_URL + '?mollie=error'); }
});
