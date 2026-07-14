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
const {setGlobalOptions} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({region: 'europe-west1', maxInstances: 5});

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
      title: 'Nouvelle candidature',
      body: name + ' souhaite rejoindre Ti-Services.',
      url: './',
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

  // Jetons push de ces artisans (avec correspondance jeton -> uid pour le nettoyage).
  const tokenToUid = {};
  await Promise.all(uids.map(async (uid) => {
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
      title: 'Nouvelle demande à prendre',
      body: svcName + (zone ? ' · ' + zone : '') + ' — premier arrivé, premier servi.',
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
          title: 'Inscription validée 🎉',
          body: 'Votre compte Ti-Services est activé — vous pouvez recevoir des missions.',
          url: './',
        },
        webpush: { fcmOptions: { link: '/' }, headers: { Urgency: 'high' } },
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
  // L'artisan travaille depuis l'espace Missions ; le client depuis ses réservations.
  const link = (from === 'client') ? '/?open=missions' : '/';

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: senderName, body: body, url: '.' + link },
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
