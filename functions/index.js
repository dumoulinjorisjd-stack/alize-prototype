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
const {onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentDeleted} = require('firebase-functions/v2/firestore');
const {onRequest, onCall, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {setGlobalOptions} = require('firebase-functions/v2');
const {defineSecret} = require('firebase-functions/params');
const crypto = require('crypto');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');
const {getAuth} = require('firebase-admin/auth');

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
// Copie cachée systématique à Ti-Services. Un envoi SMTP ne laisse AUCUNE trace côté
// expéditeur — le dossier « Messages envoyés » d'une boîte n'est alimenté que par ce
// qu'on y dépose explicitement, et un serveur qui remet un message ne le fait pas.
// Cette copie tient donc lieu de journal : elle arrive dans la boîte de réception de
// contact@ti-services.fr (un filtre permet d'en faire un dossier dédié).
// Mettre à '' pour la désactiver.
const MAIL_BCC = 'contact@ti-services.fr';

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

// Enveloppe pour la file d'attente : même copie cachée que l'envoi direct.
function withBcc(to, message) {
  const d = {to, message};
  if (MAIL_BCC && String(to).toLowerCase() !== MAIL_BCC) d.bcc = MAIL_BCC;
  return d;
}
async function sendMail(db, to, message) {
  const tx = mailTransport();
  if (tx) {
    try {
      const info = await tx.sendMail({
        from: '"' + MAIL_FROM_NAME + '" <' + MAIL_FROM_EMAIL + '>',
        to,
        // Pas de copie quand le destinataire EST déjà Ti-Services : inutile de recevoir
        // deux fois ses propres notifications d'administration.
        bcc: (MAIL_BCC && String(to).toLowerCase() !== MAIL_BCC) ? MAIL_BCC : undefined,
        subject: message.subject,
        html: message.html,
        attachments: (Array.isArray(message.attachments) && message.attachments.length) ? message.attachments : undefined,
      });
      console.log('[mail] envoyé à ' + to + ' (id=' + (info && info.messageId || '?') + ') — ' + message.subject);
      return true;
    } catch (e) {
      console.error('[mail] échec SMTP → ' + to + ' : ' + (e && e.message));
      try { await db.collection('mail').add(withBcc(to, message)); } catch (_) {}
      return false;
    }
  }
  console.warn('[mail] SMTP_PASS absent — message mis en file `mail` pour ' + to +
    ' (rien ne partira sans l\'extension Trigger Email OU le secret SMTP_PASS).');
  await db.collection('mail').add(withBcc(to, message));
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
// SIGNATURE DU `state` OAUTH (anti-détournement de liaison). Le state = uid de l'artisan +
// expiration, signés par HMAC avec le secret Mollie. Seule la fonction AUTHENTIFIÉE
// (mollieOnboardingLink) peut en produire un valide → un tiers ne peut PAS lier son compte
// Mollie à la fiche d'un autre artisan en forgeant un uid. Le retour rejette tout state
// non signé par nous.
function signMollieState(uid) {
  const exp = Date.now() + 30 * 60 * 1000;   // valable 30 minutes
  const payload = String(uid) + '.' + exp;
  const sig = crypto.createHmac('sha256', process.env.MOLLIE_CLIENT_SECRET || '').update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyMollieState(state) {
  try {
    const parts = String(state || '').split('.');
    if (parts.length !== 3) return null;
    const uid = parts[0], exp = parts[1], sig = parts[2];
    if (!uid || !/^\d+$/.test(exp) || Date.now() > Number(exp)) return null;   // absent / malformé / expiré
    const expected = crypto.createHmac('sha256', process.env.MOLLIE_CLIENT_SECRET || '').update(uid + '.' + exp).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;    // signature invalide
    return uid;
  } catch (_) { return null; }
}

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
/**
 * mollieChargeComplement : encaisse un SUPPLÉMENT au-delà de l'empreinte — heures
 * déclarées en plus, coup de pouce ajouté après la commande, pourboire. Une empreinte
 * bancaire ne se relève JAMAIS : sans ce second paiement, ces sommes figuraient sur la
 * facture du client sans être prélevées, et l'artisan attendait un versement impossible.
 *
 * Chemin normal : la carte du client est déjà mémorisée (mandat Mollie créé lors du
 * premier paiement) → on prélève DIRECTEMENT, sans rien lui redemander.
 * Repli : aucun mandat valide, ou refus → on crée un paiement classique et on renvoie
 * son lien, à faire suivre au client. On ne verse jamais à l'artisan ce qui n'a pas
 * été encaissé : le versement du supplément n'a lieu qu'au webhook « paid ».
 */
async function mollieChargeComplement(db, reqId, clientUid, amount, label) {
  const out = {ok: false, direct: false, paymentId: '', checkoutUrl: '', reason: ''};
  if (!mollieApiConfigured() || !(amount > 0) || !reqId) { out.reason = 'inactif'; return out; }
  let customerId = '';
  try { customerId = (await db.collection('users').doc(clientUid).get()).get('mollieCustomerId') || ''; } catch (_) {}
  const app = APP_URL.replace(/\/$/, '');
  const body = {
    amount: {currency: 'EUR', value: round2(amount).toFixed(2)},
    description: (label || 'Ti-Services · supplément').toString().slice(0, 100),
    webhookUrl: 'https://europe-west1-t-service-prod.cloudfunctions.net/mollieWebhook',
    metadata: {reqId: reqId, clientUid: clientUid, kind: 'complement'},
  };
  if (customerId) {
    let mandateId = '';
    try {
      const mds = await mollieApi('/customers/' + encodeURIComponent(customerId) + '/mandates?limit=50', 'GET');
      const arr = (mds.ok && mds.data && mds.data._embedded && mds.data._embedded.mandates) || [];
      const m = arr.find((x) => x && x.status === 'valid');   // « pending » ne peut rien porter
      if (m) mandateId = m.id;
    } catch (_) {}
    if (mandateId) {
      const rec = await mollieApi('/payments', 'POST',
        Object.assign({customerId: customerId, sequenceType: 'recurring', mandateId: mandateId}, body));
      if (rec.ok && rec.data && rec.data.id) {
        out.ok = true; out.direct = true; out.paymentId = rec.data.id;
        out.reason = 'direct:' + (rec.data.status || '');
        return out;
      }
      console.warn('mollieChargeComplement direct refusé reqId=' + reqId);
    }
  }
  const one = await mollieApi('/payments', 'POST', Object.assign(
    {redirectUrl: app + '/?paid=' + encodeURIComponent(reqId)},
    customerId ? {customerId: customerId} : {}, body));
  if (one.ok && one.data && one.data.id) {
    out.ok = true; out.paymentId = one.data.id;
    out.checkoutUrl = (one.data._links && one.data._links.checkout && one.data._links.checkout.href) || '';
    out.reason = 'lien';
    return out;
  }
  out.reason = 'echec';
  return out;
}
// Vérifie l'onboarding RÉEL de l'organisation liée au jeton d'accès fourni. Avoir
// une organisation connectée ne suffit PAS : Mollie doit avoir vérifié l'identité et
// le compte bancaire (statut « completed » + capable de recevoir paiements ET
// règlements). Renvoie {ok, status}. FAIL-SAFE : toute erreur => ok=false — on
// préfère BLOQUER (l'artisan ne peut pas accepter / être réglé) que verser dans le vide.
async function mollieOnboardingReady(accessToken) {
  try {
    const res = await fetch(MOLLIE_API + '/onboarding/me', {headers: {'Authorization': 'Bearer ' + accessToken}});
    if (!res.ok) { console.warn('mollieOnboardingReady HTTP', res.status); return {ok: false, status: 'error', dashboard: ''}; }
    const ob = await res.json();
    const status = ob.status || 'in-review';
    const canPay = ob.canReceivePayments !== false;
    const canSettle = ob.canReceiveSettlements !== false;
    // Lien de complétion hébergé par Mollie (pour finir le dossier : identité, IBAN…).
    const dashboard = (ob._links && ob._links.dashboard && ob._links.dashboard.href) || '';
    // On remonte AUSSI les deux capacités séparément : Mollie autorise souvent à encaisser
    // avant d'avoir fini de vérifier le dossier, et son tableau de bord le dit à l'artisan
    // (« vous pouvez commencer à accepter des paiements »). Sans cette nuance, la console
    // affichait « en examen » en face d'un artisan à qui Mollie disait le contraire.
    return {ok: status === 'completed' && canPay && canSettle, status: status, dashboard: dashboard,
      canPay: canPay, canSettle: canSettle};
  } catch (e) { console.warn('mollieOnboardingReady', e); return {ok: false, status: 'error', dashboard: '', canPay: false, canSettle: false}; }
}
// FRAIS MOLLIE RÉELS d'un paiement. Mollie expose `settlementAmount` = ce qu'il verse
// vraiment après ses frais ; le frais exact = amount − settlementAmount. On enregistre ce
// frais + le revenu net RÉEL de Ti-Services (commission − frais) sur le registre et la
// demande. `settlementAmount` n'est parfois connu qu'au règlement (différé) : dans ce cas
// on ne fait rien, le balayage quotidien re-tentera. No-op si Mollie non configuré /
// paiement simulé. NB : n'affecte NI le versement à l'artisan NI le débit du client
// (déjà exacts) — c'est de la comptabilité interne (marge réelle Ti-Services).
async function recordMollieFee(db, reqId, molliePaymentId, commission) {
  if (!mollieApiConfigured() || !molliePaymentId) return false;
  try {
    const p = await mollieApi('/payments/' + encodeURIComponent(molliePaymentId), 'GET');
    if (!p.ok || !p.data) return false;
    const amt = Number(p.data.amount && p.data.amount.value);
    const settle = (p.data.settlementAmount && p.data.settlementAmount.value != null) ? Number(p.data.settlementAmount.value) : null;
    if (!(amt > 0) || settle == null || isNaN(settle)) return false; // règlement Mollie pas encore connu
    const fee = round2(amt - settle);
    const netTs = round2((Number(commission) || 0) - fee);
    await db.collection('ledger').doc(reqId).set({mollieFee: fee, mollieSettlementAmount: settle, netTiServices: netTs}, {merge: true});
    try { await db.collection('requests').doc(reqId).set({mollieFee: fee, netTiServices: netTs}, {merge: true}); } catch (_) {}
    return true;
  } catch (e) { console.warn('recordMollieFee', e); return false; }
}
// Prévient l'ARTISAN (push + e-mail) quand son compte de paiement Mollie n'est pas
// validé et requiert son action (dossier refusé / informations manquantes), ou quand un
// versement n'a pas pu lui être fait. `reason` : 'needs-data' | 'route_failed' | 'no_org'.
async function notifyArtisanMollieProblem(db, uid, reason) {
  let email = '', tokens = [], name = '';
  try {
    const u = await db.collection('users').doc(uid).get();
    const ud = u.data() || {};
    email = ud.email || ''; tokens = ud.pushTokens || []; name = (ud.name || '').toString().slice(0, 60);
  } catch (_) {}
  const link = APP_URL.replace(/\/$/, '') + '/?open=missions';
  const blocked = (reason === 'route_failed' || reason === 'no_org');
  const pushBody = blocked
    ? 'Un paiement n\'a pas pu vous être versé : votre compte Mollie n\'est pas encore validé. Ouvrez l\'app pour le finaliser.'
    : 'Votre compte de paiement Mollie n\'est pas encore validé. Ouvrez l\'app pour finaliser — sans cela vous ne pouvez pas accepter de missions.';
  if (tokens.length) {
    try {
      await getMessaging().sendEachForMulticast({
        tokens,
        data: {title: 'Ti-Services · Paiements à finaliser', body: pushBody, url: './?open=missions'},
        webpush: {fcmOptions: {link: '/?open=missions'}, headers: {Urgency: 'high'}},
      });
    } catch (e) { console.warn('mollieProblem push', e); }
  }
  if (email) {
    const intro = blocked
      ? '<p>Une prestation a été validée, mais nous n\'avons <b>pas pu vous verser votre gain</b> : votre compte de paiement <b>Mollie</b> n\'est pas encore validé.</p><p>Rassurez-vous, la somme est en sécurité et vous sera versée dès que votre compte sera activé.</p>'
      : '<p>Votre compte de paiement <b>Mollie</b> n\'est pas encore validé : il manque une information ou un justificatif (pièce d\'identité, IBAN…).</p><p><b>Mollie vous indique précisément ce qui manque</b> sur sa page sécurisée — et vous a peut-être déjà écrit à ce sujet. Tant que le dossier n\'est pas complet, vous <b>ne pouvez pas accepter de missions</b> ni être payé.</p>';
    try {
      await sendMail(db, email, {
        subject: 'Ti-Services · Finalisez vos paiements pour recevoir vos missions',
        html: '<p>Bonjour ' + escHtmlS(name || '') + ',</p>' + intro +
              '<p>C\'est rapide : ouvrez l\'application Ti-Services, allez dans <b>« Recevoir mes paiements »</b> et suivez le parcours Mollie (identité + IBAN). Mollie est un établissement de paiement agréé — vos coordonnées bancaires ne transitent jamais par Ti-Services.</p>' +
              '<p><a href="' + link + '" style="display:inline-block;background:#e8613c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Finaliser mes paiements</a></p>' +
              '<p>Besoin d\'aide ? Répondez simplement à cet e-mail.</p>' +
              '<p>À très vite,<br>L\'équipe Ti-Services</p>',
      });
    } catch (e) { console.warn('mollieProblem email', e); }
  }
}
// Bonne nouvelle proactive : le compte Mollie de l'artisan vient d'être validé — il peut
// désormais recevoir des missions et être payé automatiquement.
async function notifyArtisanMollieActivated(db, uid) {
  let email = '', tokens = [], name = '';
  try {
    const u = await db.collection('users').doc(uid).get();
    const ud = u.data() || {};
    email = ud.email || ''; tokens = ud.pushTokens || []; name = (ud.name || '').toString().slice(0, 60);
  } catch (_) {}
  if (tokens.length) {
    try {
      await getMessaging().sendEachForMulticast({
        tokens,
        data: {title: 'Ti-Services · Paiements activés 🎉', body: 'Votre compte de paiement est validé — vous pouvez recevoir des missions et être payé automatiquement.', url: './?open=missions'},
        webpush: {fcmOptions: {link: '/?open=missions'}, headers: {Urgency: 'high'}},
      });
    } catch (e) { console.warn('mollieActivated push', e); }
  }
  if (email) {
    try {
      await sendMail(db, email, {
        subject: 'Ti-Services · Vos paiements sont activés 🎉',
        html: '<p>Bonjour ' + escHtmlS(name || '') + ',</p>' +
              '<p>Bonne nouvelle : votre compte de paiement <b>Mollie</b> vient d\'être validé.</p>' +
              '<p>Vous pouvez désormais <b>accepter des missions</b> — et à chaque prestation validée, votre gain net (commission déduite) vous est <b>versé automatiquement</b>, sans aucun virement à faire.</p>' +
              '<p>À très vite,<br>L\'équipe Ti-Services</p>',
      });
    } catch (e) { console.warn('mollieActivated email', e); }
  }
}
// Re-synchronise le statut Mollie d'UN artisan : rafraîchit son jeton, interroge
// l'onboarding réel, met à jour sa fiche, et le prévient (dossier incomplet → alerte ;
// nouvellement actif → bonne nouvelle), chaque notification étant idempotente (drapeaux
// mollieIssueNotified / mollieActiveNotified) pour ne jamais spammer. Renvoie {status,
// active} ou null si rien à faire (pas d'organisation / pas de jeton / erreur). Partagé
// par mollieCheckStatus (app), le webhook Mollie (temps réel) et le balayage planifié.
// RATTRAPAGE DES VERSEMENTS EN ATTENTE. Un artisan peut travailler dès que Mollie
// l'autorise à encaisser ; si ses virements ne sont pas encore ouverts, son net reste sur
// le solde plateforme (jamais perdu, mais pas versé). Dès que Mollie les ouvre, on repasse
// sur tout ce qui l'attendait et on le lui route — sans intervention humaine.
async function rerouteArtisanPayouts(db, uid, orgId) {
  if (!orgId) return 0;
  const q = await db.collection('requests')
    .where('providerUid', '==', uid).where('molliePayout', '==', 'unrouted').get();
  let n = 0;
  for (const d of q.docs) {
    const r = d.data() || {};
    const net = round2(Number(r.molliePayoutNet) || 0);
    if (!r.molliePaymentId || net <= 0) continue;   // net inconnu : régularisation à la main
    let ok = false;
    try {
      ok = await mollieRouteNet(r.molliePaymentId, orgId, net,
        'Ti-Services · ' + (r.serviceName || r.service || 'prestation') + (r.saleInvoiceNo ? (' · ' + r.saleInvoiceNo) : ''));
    } catch (e) { console.warn('rerouteArtisanPayouts', e); }
    if (ok) { try { await d.ref.update({molliePayout: 'routed', molliePayoutIssue: ''}); } catch (_) {} n++; }
  }
  if (n) console.log('Versements rattrapés pour ' + uid + ' : ' + n);
  return n;
}
async function syncArtisanMollie(db, uid) {
  if (!mollieOAuthConfigured()) return null;
  const artSnap = await db.collection('artisans').doc(uid).get();
  if (!artSnap.exists) return null;
  const ad = artSnap.data() || {};
  if (!ad.mollieOrgId) return null;
  // GARDE-FOU : la fiche pointe par erreur vers l'organisation Mollie de la PLATEFORME (CCS)
  // — liaison croisée (appareil connecté au compte Mollie de Ti-Services). On NE marque
  // JAMAIS actif et on nettoie la liaison erronée pour forcer une vraie ré-activation.
  const platformOrg = await molliePlatformOrgId();
  if (platformOrg && String(ad.mollieOrgId) === platformOrg) {
    await db.collection('artisans').doc(uid).set({mollieStatus: 'none', mollieOrgId: '', mollieDashboardUrl: '', mollieOnboardingStatus: 'wrong-account'}, {merge: true});
    return {status: 'wrong-account', active: false, dashboard: ''};
  }
  const tokSnap = await db.collection('mollieTokens').doc(uid).get();
  const refresh = tokSnap.exists ? ((tokSnap.data() || {}).refresh || '') : '';
  if (!refresh) return null;
  let tok;
  try {
    const basic = Buffer.from(process.env.MOLLIE_CLIENT_ID + ':' + process.env.MOLLIE_CLIENT_SECRET).toString('base64');
    const tr = await fetch(MOLLIE_TOKEN, {
      method: 'POST',
      headers: {'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refresh),
    });
    if (!tr.ok) { console.warn('syncArtisanMollie refresh', tr.status); return null; }
    tok = await tr.json();
  } catch (e) { console.warn('syncArtisanMollie refresh throw', e); return null; }
  // Mollie fait tourner le refresh-token : on garde le nouveau pour la fois suivante.
  if (tok.refresh_token) {
    try { await db.collection('mollieTokens').doc(uid).set({refresh: tok.refresh_token, updatedAt: FieldValue.serverTimestamp()}, {merge: true}); } catch (_) {}
  }
  const ready = await mollieOnboardingReady(tok.access_token);
  const prevStatus = ad.mollieStatus || 'none';
  const prevNotified = ad.mollieIssueNotified || '';
  // Lien vers le compte Mollie de l'artisan (page hébergée : compléter / gérer son dossier).
  // On le conserve pour que l'app puisse TOUJOURS proposer l'accès au compte Mollie.
  const dashboard = ready.dashboard || ad.mollieDashboardUrl || '';
  // PEUT TRAVAILLER : Mollie ouvre l'encaissement AVANT de finir de vérifier le dossier,
  // et cette vérification ne se déclenche qu'après une première transaction. Exiger le
  // dossier validé pour accepter une mission enfermait donc l'artisan dans un cercle :
  // pas de mission → pas de transaction → pas de validation → pas de mission. Dès que
  // Mollie l'autorise à encaisser, il peut travailler ; son net est mis de côté sur le
  // solde plateforme tant que ses virements ne sont pas ouverts, et part tout seul après.
  const peutTravailler = !!(ad.mollieOrgId && ready.canPay === true);
  const upd = {mollieStatus: ready.ok ? 'active' : 'pending', mollieOnboardingStatus: ready.status,
    mollieCanPay: ready.canPay !== false, mollieCanSettle: ready.canSettle !== false,
    mollieCanWork: peutTravailler, mollieDashboardUrl: dashboard};
  // Ses virements viennent de s'ouvrir : on rattrape tout de suite ce qui l'attendait.
  if (ready.canSettle === true && ad.mollieCanSettle === false) {
    try { await rerouteArtisanPayouts(db, uid, ad.mollieOrgId); } catch (e) { console.warn('reroute', e); }
  }
  if (ready.status === 'needs-data' && prevNotified !== 'needs-data') {
    upd.mollieIssueNotified = 'needs-data';
    try { await notifyArtisanMollieProblem(db, uid, 'needs-data'); } catch (_) {}
  } else if (ready.ok) {
    if (prevNotified) upd.mollieIssueNotified = '';
    // Transition vers « actif » → on prévient l'artisan (une seule fois).
    if (prevStatus !== 'active' && ad.mollieActiveNotified !== true) {
      upd.mollieActiveNotified = true;
      try { await notifyArtisanMollieActivated(db, uid); } catch (_) {}
    }
  }
  await db.collection('artisans').doc(uid).set(upd, {merge: true});
  return {status: ready.status, active: ready.ok, dashboard: dashboard};
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
// ORGANISATION MOLLIE DE LA PLATEFORME (CCS). Sert de garde-fou anti-liaison croisée :
// si un artisan lance l'onboarding sur un appareil DÉJÀ connecté au compte Mollie de
// Ti-Services/CCS, l'OAuth relie par erreur l'organisation de la PLATEFORME comme compte
// de versement de l'artisan (elle est « complète » → faux « actif » très problématique).
// On refuse ce cas en comparant l'org connectée à celle de la plateforme. Mémorisé par
// instance (valeur fixe). Renvoie '' si le jeton plateforme n'est pas configuré (garde inerte).
let _platformOrgId = null;
async function molliePlatformOrgId() {
  if (_platformOrgId !== null) return _platformOrgId;
  if (!mollieApiConfigured()) { _platformOrgId = ''; return ''; }
  try {
    const r = await mollieApi('/organizations/me', 'GET');
    _platformOrgId = (r.ok && r.data && r.data.id) ? String(r.data.id) : '';
  } catch (_) { _platformOrgId = ''; }
  return _platformOrgId;
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
 * assignFounderSpot : programme « Artisan Fondateur ». Il n'y a plus de quota — est
 * ambassadeur TOUT prestataire dont la fiche est créée avant l'ouverture aux clients.
 * Le champ founder est posé par le serveur, jamais par le client. Après l'ouverture,
 * les nouvelles fiches naissent sans avantage.
 */
exports.assignFounderSpot = onDocumentCreated('artisans/{artisanId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  try {
    const cur = snap.data() || {};
    // Statut déjà tranché (reprise de fiche, import) : on ne retouche pas.
    if (typeof cur.founder === 'boolean') return;
    const avantOuverture = Date.now() < FOUNDER_LAUNCH_MS;
    await snap.ref.set(avantOuverture
      // founderSince démarre la fenêtre d'avantage ; elle ne court qu'à partir de
      // l'ouverture (cf. founderStartMs), jamais avant.
      ? {founder: true, founderSince: FieldValue.serverTimestamp()}
      : {founder: false}, {merge: true});
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
  const consent = {};   // users/{uid}.notifOn : ce compte veut-il être notifié sur cet appareil ?
  await Promise.all(targetUids.map(async (uid) => {
    try {
      const u = await db.collection('users').doc(uid).get();
      const ud = u.data() || {};
      // Le compte n'est PLUS un artisan (redevenu client) : on ne lui envoie aucune
      // notification « nouvelle prestation », même si sa fiche artisan traîne encore.
      if (ud.role && ud.role !== 'artisan') return;
      if (typeof ud.notifOn === 'boolean') consent[uid] = ud.notifOn;
      (ud.pushTokens || []).forEach((tok) => { tokenToUid[tok] = uid; });
    } catch (_) {}
  }));
  // PLUSIEURS COMPTES SUR UN MÊME TÉLÉPHONE. Le jeton appartient à l'appareil, pas au
  // compte : deux artisans qui utilisent le même téléphone partagent le même jeton.
  // Chacun peut vouloir être notifié — c'est le cas d'un gérant qui suit deux comptes.
  // On respecte donc le CONSENTEMENT de chaque compte (users/{uid}.notifOn), posé
  // quand il active les notifications et levé quand il les coupe.
  // Pour les comptes anciens, sans consentement enregistré, on garde l'ancienne règle :
  // le jeton revient au dernier qui l'a enregistré (fcmOwners/{token}.uid) — sinon un
  // ex-artisan devenu client recevrait encore des « prestations à faire ».
  await Promise.all(Object.keys(tokenToUid).map(async (tok) => {
    try {
      const uid = tokenToUid[tok];
      if (consent[uid] === true) return;          // ce compte a dit oui : on le notifie
      if (consent[uid] === false) { delete tokenToUid[tok]; return; }
      const o = await db.collection('fcmOwners').doc(tok).get();
      const od = o.exists ? (o.data() || {}) : null;
      if (od && od.uid && od.uid !== uid) delete tokenToUid[tok];
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
      // Logo intégré (cid:tilogo), comme l'e-mail de bienvenue — s'affiche sans URL externe.
      const attachments = [];
      try {
        const logo = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png'));
        attachments.push({filename: 'ti-services.png', content: logo, cid: 'tilogo'});
      } catch (_) {}
      await sendMail(db, email, {
        subject: 'Votre inscription Ti-Services est validée 🎉',
        html: approvedArtisanHtml(name === 'Bonjour' ? '' : name),
        attachments,
      });
    } catch (e) { console.warn('approve email queue', e); }
  }

  // 3) PARRAINAGE : si ce nouvel artisan a été parrainé (referredByCode) et n'a pas encore
  //    été crédité, on crédite le PARRAIN (statut +5 missions) — écriture serveur seule,
  //    donc infalsifiable. Le rapprochement se fait sur le code propre du parrain
  //    (referralCode, stocké sur sa fiche). Idempotent via le drapeau referralCredited.
  const refCode = (after.referredByCode || '').toString().trim().toUpperCase();
  if (refCode && !after.referralCredited) {
    try {
      const q = await db.collection('artisans').where('referralCode', '==', refCode).limit(1).get();
      if (!q.empty && q.docs[0].id !== uid) {
        const refDoc = q.docs[0];
        const cur = Number((refDoc.data() || {}).refBonusJobs) || 0;
        await refDoc.ref.set({
          refBonusJobs: cur + REF_CREDIT_JOBS,
          filleuls: FieldValue.arrayUnion({name: (after.name || 'Filleul').toString().slice(0, 60), at: Date.now()}),
        }, {merge: true});
        // Notifie le parrain (push best-effort).
        try {
          const ru = (await db.collection('users').doc(refDoc.id).get()).data() || {};
          const rtok = ru.pushTokens || [];
          if (rtok.length) {
            await getMessaging().sendEachForMulticast({
              tokens: rtok,
              data: {title: 'Parrainage validé 🎉', body: 'Votre filleul est validé — +' + REF_CREDIT_JOBS + ' missions vers votre statut.', url: './?open=missions'},
              webpush: {fcmOptions: {link: '/?open=missions'}},
            });
          }
        } catch (_) {}
      }
    } catch (e) { console.warn('referral credit', e); }
    // Marque le filleul comme crédité (même si le parrain est introuvable — pas de double essai).
    try { await db.collection('artisans').doc(uid).set({referralCredited: true}, {merge: true}); } catch (_) {}
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
 * notifyAdminDispute : le client conteste la durée déclarée (statut -> disputed). On alerte
 * l'admin par e-mail pour qu'il arbitre depuis la console (valider la durée déclarée, ou
 * revenir à l'accord initial). Le client n'est pas débité tant que le litige n'est pas réglé.
 */
exports.notifyAdminDispute = onDocumentUpdated({document: 'requests/{reqId}', secrets: [SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  if (before.status === 'disputed' || after.status !== 'disputed') return;
  const db = getFirestore();
  const svc = (after.serviceName || after.service || 'Prestation').toString().slice(0, 60);
  const cli = (after.clientName || 'Client').toString().slice(0, 60);
  const pro = (after.providerName || 'Prestataire').toString().slice(0, 60);
  const rate = Number(after.rate) || 0;
  const dur = Number(after.duration) || 0;
  const fin = (after.finalHours != null) ? Number(after.finalHours) : dur;
  const msg = (after.disputeMsg || '').toString().slice(0, 500);
  const money = (x) => (Math.round((Number(x) || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' €';
  try {
    await sendMail(db, ADMIN_EMAIL, {
      subject: 'Ti-Services · Litige à arbitrer — ' + svc,
      html: '<p><b>Un désaccord de durée est à arbitrer</b> sur une prestation :</p>' +
            '<p><b>' + escHtmlS(svc) + '</b> — ' + escHtmlS(cli) + ' → ' + escHtmlS(pro) + '</p>' +
            '<p>Accord initial : <b>' + dur + ' h</b> (' + money(rate * dur) + ')<br>' +
            'Déclaré par le prestataire : <b>' + fin + ' h</b> (' + money(rate * fin) + ')</p>' +
            (msg ? '<p>Message du client :<br>« ' + escHtmlS(msg) + ' »</p>' : '') +
            '<p>Ouvrez la <b>console admin → Messagerie</b> (ou le tableau de bord) pour <b>valider la durée déclarée</b> ou <b>revenir à l\'accord initial</b>. Le client n\'est pas débité tant que le litige n\'est pas réglé.</p>',
    });
  } catch (e) { console.warn('dispute notify', e); }
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
function commissionTierPct(jobsTotal, tiers) {
  const n = Number(jobsTotal) || 0;
  // Barème PERSONNALISÉ par l'admin (settings/config.fidTiers) prioritaire : on retient le
  // palier de plus haut seuil `min` atteint. Repli sur le barème par défaut si absent.
  if (Array.isArray(tiers) && tiers.length) {
    let pct = null; let bestMin = -1;
    for (const t of tiers) { const m = Number(t.min) || 0; const p = Number(t.pct); if (!isNaN(p) && n >= m && m >= bestMin) { bestMin = m; pct = p; } }
    if (pct != null) return pct;
  }
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
// La fenêtre d'avantage fondateur ne démarre qu'à l'ouverture aux clients (1er oct,
// AST = UTC-4) : inutile de brûler les 3 mois tant qu'aucun client ne peut commander.
// DOIT rester aligné avec index.html (launchMs / founderStartMs).
const FOUNDER_LAUNCH_MS = Date.parse('2026-10-01T00:00:00-04:00');
// Parrainage : missions créditées au parrain à chaque filleul validé (aligné avec REF_CREDIT
// côté client). Fait monter son statut de fidélité (donc baisser sa commission).
const REF_CREDIT_JOBS = 5;
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

exports.settleCommission = onDocumentUpdated({document: 'requests/{reqId}', secrets: ['MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async (event) => {
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
  // Prestations / options additionnelles (à l'unité ou à l'heure) : elles s'ajoutent à
  // l'assiette de commission (après le multiplicateur « par personne », comme côté client).
  const opts = Array.isArray(after.options) ? after.options : null;
  if (opts && opts.length) {
    base = round2(base + opts.reduce((t, o) => t + (Number(o.price) || 0) * (Number(o.qty) || 1), 0));
  }
  const boost = Number(after.boost) || 0;
  // Coup de pouce en euros (relance pendant la recherche) : montant fixe soumis à la
  // commission (comme la majoration en %). S'ajoute à l'assiette et au brut.
  const boostEur = Math.max(0, Math.round(Number(after.boostEur) || 0));
  // Pourboire laissé par le client à la validation : versé EN TOTALITÉ à l'artisan
  // (aucune commission Ti-Services). Il s'ajoute donc au brut ET au net.
  const tip = Math.max(0, round2(Number(after.tip) || 0));
  const gross = round2(base + round2(base * boost / 100) + boostEur + tip);

  const db = getFirestore();
  let jobsTotal = 0; let isFounder = false; let founderSinceMs = null; let founderGross = 0; let refBonusJobs = 0;
  try {
    const a = (await db.collection('artisans').doc(providerUid).get()).data() || {};
    jobsTotal = a.jobsTotal || 0;
    isFounder = !!a.founder;
    founderGross = Number(a.founderGross) || 0;
    founderSinceMs = (a.founderSince && a.founderSince.toMillis) ? a.founderSince.toMillis() : (typeof a.founderSince === 'number' ? a.founderSince : null);
    // Crédit de parrainage : chaque filleul validé fait monter le statut de fidélité
    // (comme des missions réalisées) — écrit UNIQUEMENT par le serveur (jamais par l'artisan).
    refBonusJobs = Number(a.refBonusJobs) || 0;
  } catch (_) {}
  // Barème de commission PERSONNALISÉ par l'admin (settings/config) — pour que la commission
  // réellement prélevée reflète le barème réglé dans la console (et non des valeurs figées).
  let cfgTiers = null;
  try { const cfg = (await db.collection('settings').doc('config').get()).data() || {}; if (Array.isArray(cfg.fidTiers)) cfgTiers = cfg.fidTiers; } catch (_) {}

  // Artisan Fondateur : commission réduite aux seuls frais bancaires (jamais Bronze),
  // MAIS uniquement pendant la fenêtre d'avantage — 3 mois OU 2 000 € de prestations
  // (au premier des deux atteint), puis commission standard (palier de fidélité).
  // La prestation qui franchit le plafond bénéficie encore du taux fondateur ; on cumule
  // ensuite le CA dans founderGross pour couper l'avantage aux suivantes.
  // Départ du compte à rebours = le plus tardif entre l'inscription et l'ouverture clients.
  const founderStartMs = Math.max(founderSinceMs || 0, FOUNDER_LAUNCH_MS);
  const withinTime = (Date.now() - founderStartMs) < FOUNDER_DAYS * 86400000;
  const withinGross = founderGross < FOUNDER_GROSS_CAP;
  const founderActive = isFounder && withinTime && withinGross;
  const basePct = founderActive ? FOUNDER_COMM_PCT : commissionTierPct(jobsTotal + refBonusJobs, cfgTiers);
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
      molliePaymentId: after.molliePaymentId || '', // pour rapprocher le frais Mollie réel
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
    // Montant RÉELLEMENT encaissé sur l'empreinte (jamais plus qu'elle) : c'est lui, et
    // pas le total de la facture, qui borne ce qu'on peut verser à l'artisan.
    let capte = gross;
    if (mollieApiConfigured() && after.molliePaymentId && !after.mollieCaptured) {
      captureOk = false;
      try {
        const held = round2(Number(after.molliePaymentAmount) || gross);
        const toCapture = round2(Math.min(gross, held));
        capte = toCapture;
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
    } else if (after.mollieCaptureAmount != null) {
      capte = round2(Number(after.mollieCaptureAmount) || gross);
    }

    // 3 bis) SUPPLÉMENT NON COUVERT PAR L'EMPREINTE. Heures déclarées en plus, coup de
    //    pouce ajouté après la commande, pourboire : le total validé peut dépasser la
    //    somme autorisée à la commande. Une empreinte ne se relève pas — on encaisse
    //    donc la différence par un SECOND paiement, directement sur la carte déjà
    //    mémorisée quand c'est possible. Sans ça la facture annonçait une somme qui
    //    n'était jamais prélevée, et le versement à l'artisan échouait.
    const complement = round2(Math.max(0, gross - capte));
    // AUCUN SUPPLÉMENT NE DISPARAÎT EN SILENCE. Sans empreinte sur la demande (paiement
    // jamais abouti, demande créée hors carte, Mollie non configuré), il n'y a personne à
    // débiter : le pourboire figurait alors sur la facture sans laisser la moindre trace,
    // ni chez Mollie ni côté client. On l'inscrit sur la demande et on alerte l'exploitant.
    if (complement > 0.009 && !after.complementPaymentId && (!mollieApiConfigured() || !after.molliePaymentId)) {
      const motif = !mollieApiConfigured() ? 'Mollie non configuré sur cet environnement'
        : 'aucun paiement par carte n’est rattaché à cette demande';
      try {
        await event.data.after.ref.update({complementAmount: complement, complementStatus: 'impossible', complementIssue: motif});
      } catch (_) {}
      console.warn('Supplément NON prélevable reqId=' + reqId + ' ' + complement + ' € — ' + motif);
      try {
        await sendMail(db, ADMIN_EMAIL, {
          subject: 'Supplément impossible à prélever — ' + (after.serviceName || after.service || 'prestation'),
          html: '<p>La facture porte un supplément (pourboire, heures en plus, coup de pouce) qui n\'a pas pu être prélevé : <b>aucun prélèvement n\'a même été tenté</b>.</p>'
            + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
            + '<li><b>Supplément :</b> ' + eurTxt(complement) + '</li>'
            + '<li><b>Cause :</b> ' + escHtmlS(motif) + '</li></ul>'
            + '<p>Cette part n\'est PAS versée à l\'artisan. Si la prestation elle-même n\'a pas été réglée par carte, c\'est toute la demande qu\'il faut vérifier.</p>',
        });
      } catch (_) {}
    }
    if (complement > 0.009 && mollieApiConfigured() && after.molliePaymentId && !after.complementPaymentId) {
      try {
        const r2 = await mollieChargeComplement(db, reqId, after.clientUid,
          complement, 'Ti-Services · supplément · ' + (after.serviceName || after.service || 'prestation'));
        const patch = {complementAmount: complement, complementStatus: r2.ok ? (r2.direct ? 'en_cours' : 'a_regler') : 'echec',
          complementPaymentId: r2.paymentId || '', complementCheckoutUrl: r2.checkoutUrl || ''};
        await event.data.after.ref.update(patch);
        if (!r2.ok || !r2.direct) {
          // Le client doit repasser par sa carte : on le lui dit, et on prévient l'admin.
          try {
            const u = (await db.collection('users').doc(after.clientUid).get()).data() || {};
            const tokens = u.pushTokens || [];
            if (tokens.length) {
              await pushMulticast(tokens, 'Un complément reste à régler',
                'Votre prestation a coûté ' + eurTxt(complement) + ' de plus que le montant autorisé au départ.',
                '/?paid=' + encodeURIComponent(reqId),
                (tok) => db.collection('users').doc(after.clientUid).update({pushTokens: FieldValue.arrayRemove(tok)}).catch(() => {}));
            }
          } catch (_) {}
          try {
            await sendMail(db, ADMIN_EMAIL, {
              subject: 'Supplément à encaisser — ' + (after.serviceName || after.service || 'prestation'),
              html: '<p>Le montant validé dépasse l\'empreinte posée à la commande, et le prélèvement direct n\'a pas pu se faire.</p>'
                + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
                + '<li><b>Supplément :</b> ' + eurTxt(complement) + '</li>'
                + '<li><b>Cause :</b> ' + escHtmlS(r2.reason || 'inconnue') + '</li></ul>'
                + (r2.checkoutUrl ? ('<p>Lien de paiement à transmettre au client :<br>' + escHtmlS(r2.checkoutUrl) + '</p>') : '')
                + '<p>Tant qu\'il n\'est pas réglé, ce supplément n\'est PAS versé à l\'artisan.</p>',
            });
          } catch (_) {}
        }
        console.log('Supplément reqId=' + reqId + ' ' + complement + ' € — ' + r2.reason);
      } catch (e) { console.warn('settleCommission complement', e); }
    }

    // 3 ter) VERSEMENT MOLLIE : route le NET vers l'organisation de l'artisan et garde
    //    la commission sur le solde plateforme. Uniquement si la capture a réussi.
    try {
      const orgId = after.mollieOrgId || (await db.collection('artisans').doc(providerUid).get()).get('mollieOrgId');
      // On ne verse JAMAIS plus que ce qui a été encaissé sur ce paiement. La commission
      // est intégralement prélevée ici ; le supplément éventuel sera reversé en entier à
      // l'artisan quand il sera payé (webhook), pour un total identique à net.
      const netA = round2(Math.max(0, capte - commission));
      if (after.molliePaymentId && captureOk) {
        const routed = (orgId && netA > 0) ? await mollieRouteNet(after.molliePaymentId, orgId, netA,
          'Ti-Services · ' + (after.serviceName || after.service || 'prestation') + ' · ' + saleInvoiceNo) : (netA <= 0);
        if (routed) {
          await event.data.after.ref.update({molliePayout: 'routed'});
        } else {
          // FILET DE SÉCURITÉ : le client a été débité mais le NET n'a PAS pu être versé
          // à l'artisan (onboarding Mollie incomplet, organisation absente, refus API).
          // L'argent reste sur le solde plateforme — on ne le perd JAMAIS en silence :
          // on marque la mission et on alerte l'admin pour régularisation manuelle.
          // On inscrit le NET DÛ : sans lui, aucun rattrapage automatique n'est possible
          // quand Mollie ouvre enfin les virements de l'artisan.
          await event.data.after.ref.update({molliePayout: 'unrouted', molliePayoutIssue: orgId ? 'route_failed' : 'no_org', molliePayoutNet: netA});
          // On prévient AUSSI l'artisan : son compte Mollie n'est pas validé, un versement
          // n'a pas pu lui être fait (la somme est en sécurité en attendant).
          try { await notifyArtisanMollieProblem(db, providerUid, orgId ? 'route_failed' : 'no_org'); } catch (_) {}
          try {
            await sendMail(db, ADMIN_EMAIL, {
              subject: 'Versement Mollie à régulariser — ' + (after.serviceName || after.service || 'prestation'),
              html: '<p>Le client a été débité, mais le versement du net à l\'artisan n\'a pas pu être routé automatiquement.</p>'
                + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
                + '<li><b>Artisan :</b> ' + escHtmlS(after.providerName || providerUid) + '</li>'
                + '<li><b>Net dû :</b> ' + eurTxt(netA) + '</li>'
                + '<li><b>Cause :</b> ' + (orgId ? 'routage refusé par Mollie (onboarding probablement incomplet)' : 'aucune organisation Mollie connectée') + '</li></ul>'
                + '<p>À faire : vérifier l\'onboarding Mollie de l\'artisan, puis re-router le paiement (ou virement manuel). L\'argent est en sécurité sur le solde plateforme.</p>',
            });
          } catch (_) {}
        }
      }
    } catch (e) { console.warn('settleCommission route', e); }
    // 3 ter) FRAIS MOLLIE RÉELS de ce paiement (si déjà connus) → registre. Sinon le
    //    balayage quotidien (paymentReconciliation) complétera au règlement Mollie.
    try { await recordMollieFee(db, reqId, after.molliePaymentId, commission); } catch (_) {}
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
  // Ouverture au pool après autorisation de la carte (verrou paiement) : une demande
  // 'pending_payment' devient 'pending' → c'est là qu'on notifie les prestataires (jamais
  // à la création, tant que le paiement n'est pas garanti).
  const wasPendingPayment = before.status === 'pending_payment';
  if (!((wasActive || wasDeclined || wasPendingPayment) && after.status === 'pending')) return;

  const db = getFirestore();
  const svc = after.service;
  const exclude = wasDeclined ? (before.declinedBy || '') : (wasActive ? (before.providerUid || '') : '');

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
      const title = wasPendingPayment ? 'Espace artisan · Nouvelle mission' : 'Espace artisan · Mission de nouveau disponible';
      const body = svcName + (zone ? ' · ' + zone : '') + (wasPendingPayment ? ' — une nouvelle demande de votre zone, à saisir.' : ' — un créneau se libère, à saisir.');
      await pushMulticast(tokens, title, body, '/?open=missions',
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

/* Le programme Ambassadeur n'a plus de quota : est ambassadeur qui s'inscrit avant
   l'ouverture aux clients. Les fonctions qui rendaient, reprenaient et recomptaient les
   places (releaseFounderSpot, releaseFounderSpotOnDelete, recountFounderSpots) n'ont
   donc plus d'objet et ont été retirées. */

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
 * clientCard : APERÇU et RETRAIT de la carte mémorisée du client. La carte n'est jamais
 * chez Ti-Services — elle vit chez Mollie sous forme de « mandat » attaché au client
 * Mollie (users/{uid}.mollieCustomerId), créé par le premier paiement réussi. On n'en
 * lit que ce que Mollie expose : marque, 4 derniers chiffres, échéance.
 *   action 'get'    → {card:{id,brand,last4,exp,holder}|null}
 *   action 'revoke' → révoque le mandat : la prochaine réservation redemande la carte.
 * Inerte (card:null) tant que Mollie n'est pas configuré : la bêta simulée continue.
 */
exports.clientCard = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (!mollieApiConfigured()) return {card: null, simulated: true};
  const action = String((request.data && request.data.action) || 'get');
  let customerId = '';
  let udoc = {};
  try {
    const snap = await db.collection('users').doc(uid).get();
    udoc = (snap.exists && snap.data()) || {};
    customerId = udoc.mollieCustomerId || '';
  } catch (_) {}

  // Le « client Mollie » porte les cartes mémorisées. Il naissait au premier paiement —
  // mais on doit pouvoir enregistrer sa carte AVANT toute commande, justement pour ne
  // pas la saisir le jour J. On le crée donc ici, à la demande.
  const ensureCustomer = async () => {
    if (customerId) return customerId;
    const body = {name: String(udoc.name || 'Client Ti-Services').slice(0, 100), metadata: {uid: uid}};
    const em = String(udoc.email || (request.auth.token && request.auth.token.email) || '').slice(0, 100);
    if (em) body.email = em;
    const cust = await mollieApi('/customers', 'POST', body);
    if (cust.ok && cust.data && cust.data.id) {
      customerId = String(cust.data.id);
      try { await db.collection('users').doc(uid).set({mollieCustomerId: customerId}, {merge: true}); } catch (_) {}
    }
    return customerId;
  };

  // La carte mémorisée = un mandat Mollie valide. Deux chemins, dans cet ordre :
  //   1. le mandat que Mollie nous a NOMMÉ à l'enregistrement (inscrit sur la fiche par le
  //      webhook) — la source sûre, qui ne dépend d'aucune recherche ;
  //   2. à défaut, le mandat valide le plus récent du client.
  // Le premier chemin existe parce que le second pouvait ne rien rendre : le client
  // validait son enregistrement auprès de sa banque et retrouvait « Aucune carte
  // mémorisée ».
  // On accepte AUSSI un mandat « pending ». Après une autorisation à 0,00 €, Mollie peut
  // ne le rendre « valid » qu'une fois sa vérification faite : le filtrer sans le dire
  // revenait à annoncer « Aucune carte » à quelqu'un qui venait de l'enregistrer. On le
  // remonte donc avec son état, et l'écran dit lequel des deux c'est.
  const carteDeMandat = (m) => {
    if (!m || ['valid', 'pending'].indexOf(m.status) < 0) return null;
    const d = m.details || {};
    return {
      id: String(m.id || ''),
      brand: String(d.cardLabel || (m.method === 'creditcard' ? 'Carte' : m.method) || 'Carte'),
      last4: String(d.cardNumber || '').slice(-4),
      exp: String(d.cardExpiryDate || '').slice(0, 7),   // AAAA-MM
      holder: String(d.cardHolder || ''),
      status: String(m.status || ''),
    };
  };
  const readCard = async () => {
    if (!customerId) return null;
    const base = '/customers/' + encodeURIComponent(customerId) + '/mandates';
    if (udoc.mollieMandateId) {
      try {
        const un = await mollieApi(base + '/' + encodeURIComponent(String(udoc.mollieMandateId)), 'GET');
        const c = (un.ok && un.data) ? carteDeMandat(un.data) : null;
        if (c) return c;
      } catch (_) {}
    }
    const out = await mollieApi(base + '?limit=50', 'GET');
    const arr = (out.ok && out.data && out.data._embedded && out.data._embedded.mandates) || [];
    const utiles = arr.filter((m) => m && ['valid', 'pending'].indexOf(m.status) >= 0);
    if (!utiles.length) return null;
    // Un mandat valide prime toujours sur un mandat en attente ; à état égal, le plus récent.
    utiles.sort((a, b) => (a.status === b.status
      ? String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      : (a.status === 'valid' ? -1 : 1)));
    return carteDeMandat(utiles[0]);
  };

  // Peut-on proposer l'enregistrement ? On interrogeait l'API Methods avec un montant
  // nul ; sur ce compte elle répondait VIDE, et le bouton ne s'affichait donc jamais —
  // le client ne pouvait pas enregistrer sa carte, sans qu'aucune erreur soit visible.
  // On le propose désormais, et on ne le retire que si Mollie a réellement refusé une
  // fois, refus consigné (avec son motif) sur la fiche du client.
  const setupMethods = () => ['creditcard'];

  if (action === 'revoke') {
    const cur = await readCard();
    if (!cur || !cur.id) return {card: null, revoked: false, setupMethods: setupMethods()};
    // Mollie répond 204 sans corps : mollieApi renvoie {ok:true, data:null}.
    const del = await mollieApi('/customers/' + encodeURIComponent(customerId) + '/mandates/' + encodeURIComponent(cur.id), 'DELETE');
    // Le mandat nommé sur la fiche n'existe plus : sans ce nettoyage, la lecture suivante
    // irait interroger un mandat révoqué.
    if (del.ok && String(udoc.mollieMandateId || '') === cur.id) {
      udoc.mollieMandateId = '';
      try { await db.collection('users').doc(uid).set({mollieMandateId: ''}, {merge: true}); } catch (_) {}
    }
    return {card: await readCard(), revoked: !!del.ok, setupMethods: setupMethods()};
  }

  // ENREGISTREMENT AVANT TOUTE RÉSERVATION : Mollie accepte un « premier paiement » de
  // 0,00 € en carte — la carte est vérifiée (3-D Secure) et le mandat créé, SANS aucun
  // débit ni empreinte. Le client peut donc enregistrer sa carte dès l'inscription ;
  // elle sera proposée d'office à sa première commande.
  if (action === 'setup') {
    // Un client qui n'a encore rien commandé n'a pas de « client Mollie » : on le crée
    // ici, sinon l'enregistrement de la carte serait réservé à ceux qui ont déjà payé.
    await ensureCustomer();
    if (!customerId) return {checkoutUrl: null, error: 'setup_refused', reason: 'client Mollie non créé'};
    const returnUrl = String((request.data && request.data.returnUrl) || '').slice(0, 400);
    const appUrl = APP_URL.replace(/\/$/, '');
    const body = {
      amount: {currency: 'EUR', value: '0.00'},
      description: 'Ti-Services · enregistrement de votre carte',
      redirectUrl: /^https:\/\//.test(returnUrl) ? returnUrl : (appUrl + '/?card=1'),
      webhookUrl: 'https://europe-west1-t-service-prod.cloudfunctions.net/mollieWebhook',
      method: 'creditcard',            // seules la carte et PayPal acceptent le 0,00 €
      sequenceType: 'first',
      customerId: customerId,
      metadata: {clientUid: uid, cardSetup: true},
    };
    let out = await mollieApi('/payments', 'POST', body);
    // Certains comptes Mollie n'autorisent pas encore le montant nul : on retente alors
    // en laissant Mollie choisir la méthode (PayPal accepte aussi le 0,00 €).
    if (!out.ok) {
      const alt = Object.assign({}, body);
      delete alt.method;
      out = await mollieApi('/payments', 'POST', alt);
    }
    if (!out.ok || !out.data) {
      // On remonte le motif Mollie (message technique sur NOTRE usage de l'API, aucune
      // donnée personnelle) : sans lui, l'échec est indiagnosticable côté exploitation.
      const d = out.data || {};
      const reason = String(d.detail || d.title || ('HTTP ' + (out.status || '?'))).slice(0, 160);
      console.warn('clientCard setup refusé', out.status, reason);
      // Refus CONSERVÉ mais pas bloquant : on garde la trace (motif, date) pour
      // l'exploitation, sans condamner le bouton. Un refus peut tenir à un réglage Mollie
      // qui change du jour au lendemain ; masquer définitivement l'enregistrement sur un
      // seul échec priverait le client d'une fonction redevenue disponible.
      try { await db.collection('users').doc(uid).set({cardSetupReason: reason, cardSetupAt: Date.now()}, {merge: true}); } catch (_) {}
      try {
        await sendMail(db, ADMIN_EMAIL, {
          subject: 'Enregistrement de carte refusé par Mollie',
          html: '<p>Un client a tenté d\'enregistrer sa carte (autorisation à 0,00 €) et Mollie a refusé.</p>'
            + '<ul><li><b>Client :</b> ' + escHtmlS(String(udoc.email || uid)) + '</li>'
            + '<li><b>Statut HTTP :</b> ' + escHtmlS(String(out.status || '?')) + '</li>'
            + '<li><b>Motif Mollie :</b> ' + escHtmlS(reason) + '</li></ul>'
            + '<p>Le bouton ne lui est plus proposé. Sa carte lui sera demandée à la réservation.</p>',
        });
      } catch (_) {}
      return {checkoutUrl: null, error: 'setup_refused', reason: reason};
    }
    const link = out.data._links && out.data._links.checkout && out.data._links.checkout.href;
    return {checkoutUrl: link || null, paymentId: String(out.data.id || '')};
  }
  return {card: await readCard(), setupMethods: setupMethods()};
});

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

  // Idempotence — mais SEULEMENT quand les fonds sont réellement retenus. Un paiement
  // « authorized » a bloqué la somme : on renvoie son lien, sûrement pas une seconde
  // empreinte. Un paiement resté « open » ou « pending » n'a rien bloqué, et son écran
  // de règlement ne vit qu'un temps : le resservir renvoyait le client sur un « page
  // not found » chez Mollie, sans aucun moyen d'en sortir. On l'annule et on repart sur
  // un lien neuf — aucun risque de double blocage, puisque rien n'était retenu.
  if (r.molliePaymentId) {
    const ex = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId), 'GET');
    const st = (ex.ok && ex.data) ? ex.data.status : '';
    if (st === 'authorized') {
      const link = ex.data._links && ex.data._links.checkout && ex.data._links.checkout.href;
      if (link) return {paymentId: ex.data.id, checkoutUrl: link, status: st, reused: true};
    }
    if (st === 'open' || st === 'pending') {
      try {
        if (ex.data.isCancelable) await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId), 'DELETE');
      } catch (_) {}
      console.log('Empreinte inaboutie remplacée reqId=' + reqId + ' (' + st + ')');
    }
  }

  const appUrl = APP_URL.replace(/\/$/, '');
  const redirectUrl = returnUrl || (appUrl + '/?paid=' + encodeURIComponent(reqId));
  const webhookUrl = 'https://europe-west1-t-service-prod.cloudfunctions.net/mollieWebhook';
  // CARTE ENREGISTRÉE : on rattache un « client Mollie » (créé une seule fois et mémorisé
  // sur users/{uid}.mollieCustomerId). Au paiement suivant, la carte déjà utilisée est
  // proposée en un clic — le client ne la ressaisit plus.
  let customerId = '';
  try {
    const uref = db.collection('users').doc(uid);
    const usnap = await uref.get();
    const ud = (usnap.exists && usnap.data()) || {};
    customerId = ud.mollieCustomerId || '';
    if (!customerId) {
      const custBody = {name: (r.clientName || ud.name || 'Client Ti-Services').toString().slice(0, 100), metadata: {uid: uid}};
      const em = (ud.email || '').toString().slice(0, 100);
      if (em) custBody.email = em;
      const cust = await mollieApi('/customers', 'POST', custBody);
      if (cust.ok && cust.data && cust.data.id) {
        customerId = cust.data.id;
        try { await uref.set({mollieCustomerId: customerId}, {merge: true}); } catch (_) {}
      }
    }
  } catch (_) {}

  const payBody = {
    amount: {currency: 'EUR', value: amount.toFixed(2)},
    description: ('Ti-Services \u00b7 ' + (r.serviceName || r.service || 'prestation')).toString().slice(0, 100),
    redirectUrl: redirectUrl,
    webhookUrl: webhookUrl,
    captureMode: 'manual',
    metadata: {reqId: reqId, clientUid: uid},
  };
  if (customerId) payBody.customerId = customerId;
  // PAS de `sequenceType:'first'` ici. Mémoriser la carte et poser une empreinte (capture
  // manuelle) sont deux choses que Mollie ne combine pas : la demande passait, mais
  // l'écran de règlement s'ouvrait VIDE — et seulement au tout premier paiement d'un
  // client, donc au pire moment. L'empreinte ne fait qu'une chose : autoriser la somme.
  // La carte se mémorise par le chemin dédié (Profil → moyen de paiement, autorisation à
  // 0 €), qui crée un mandat propre ; le `customerId` suffit d'ailleurs à ce que Mollie
  // propose la carte déjà connue.
  const out = await mollieApi('/payments', 'POST', payBody);
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
      const genre = (pay.metadata && pay.metadata.kind) || '';
      // ENREGISTREMENT DE CARTE (autorisation à 0,00 €). Mollie confirme ici, et LUI SEUL
      // sait quel mandat vient d'être créé : il le donne sur le paiement. On l'inscrit
      // donc tout de suite sur la fiche du client, au lieu d'aller le redemander plus tard
      // en fouillant la liste des mandats — une recherche qui pouvait ne rien rendre et
      // laissait le client devant « Aucune carte mémorisée » alors qu'il venait de la
      // valider auprès de sa banque.
      if ((pay.metadata && pay.metadata.cardSetup) || genre === 'cardSetup') {
        const uid = String((pay.metadata && pay.metadata.clientUid) || '');
        if (uid && pay.status === 'paid') {
          const db = getFirestore();
          const patch = {mollieCardSetupAt: Date.now()};
          if (pay.customerId) patch.mollieCustomerId = String(pay.customerId);
          if (pay.mandateId) patch.mollieMandateId = String(pay.mandateId);
          try { await db.collection('users').doc(uid).set(patch, {merge: true}); } catch (_) {}
          console.log('Carte enregistrée uid=' + uid + ' mandat=' + (pay.mandateId || '(absent)'));
          // Aucun mandat sur un paiement d'enregistrement réussi : anomalie côté Mollie,
          // le client croirait sa carte mémorisée sans qu'elle le soit. On le signale.
          if (!pay.mandateId) {
            try {
              await sendMail(db, ADMIN_EMAIL, {
                subject: 'Enregistrement de carte payé mais SANS mandat',
                html: '<p>Un client a validé l\'autorisation à 0,00 € (paiement <code>' + escHtmlS(String(pay.id || '')) + '</code>) mais Mollie n\'a rattaché aucun mandat.</p>'
                  + '<p>Sa carte ne sera donc pas proposée à la réservation. À vérifier dans le tableau de bord Mollie.</p>',
              });
            } catch (_) {}
          }
        }
        res.status(200).send('ok');
        return;
      }
      // SUPPLÉMENT (heures en plus, pourboire, coup de pouce ajouté après coup). C'est un
      // SECOND paiement, distinct de l'empreinte : il doit être traité avant le garde-fou
      // ci-dessous, qui écarte justement tout paiement autre que celui de la demande.
      // Tant qu'il n'est pas encaissé, sa part n'est PAS versée à l'artisan.
      if (reqId && genre === 'complement') {
        const db = getFirestore();
        const ref = db.collection('requests').doc(reqId);
        const snap = await ref.get();
        const r = snap.exists ? (snap.data() || {}) : {};
        if (r.complementPaymentId && r.complementPaymentId !== pay.id) { res.status(200).send('ok'); return; }
        if (pay.status === 'paid') {
          const montant = round2(Number((pay.amount && pay.amount.value) || r.complementAmount) || 0);
          let verse = false;
          try {
            const orgId = r.mollieOrgId || (r.providerUid
              ? (await db.collection('artisans').doc(r.providerUid).get()).get('mollieOrgId') : '');
            // La commission a déjà été intégralement prélevée sur l'empreinte : le
            // supplément revient donc EN ENTIER à l'artisan.
            if (orgId && montant > 0) {
              verse = await mollieRouteNet(pay.id, orgId, montant,
                'Ti-Services · supplément · ' + (r.serviceName || r.service || 'prestation'));
            }
          } catch (e) { console.warn('mollieWebhook complement route', e); }
          try { await ref.set({complementStatus: 'paye', complementPaidAt: Date.now(), complementPayout: verse ? 'routed' : 'unrouted'}, {merge: true}); } catch (_) {}
          if (!verse) {
            try {
              await sendMail(db, ADMIN_EMAIL, {
                subject: 'Supplément encaissé mais non reversé — ' + escHtmlS(r.serviceName || r.service || 'prestation'),
                html: '<p>Le supplément a bien été prélevé au client, mais le versement à l\'artisan n\'a pas pu être routé.</p>'
                  + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
                  + '<li><b>Montant :</b> ' + eurTxt(montant) + '</li></ul>'
                  + '<p>L\'argent est en sécurité sur le solde plateforme — à reverser à la main.</p>',
              });
            } catch (_) {}
          }
          console.log('Supplément payé reqId=' + reqId + ' ' + montant + ' € — versement ' + (verse ? 'ok' : 'à régulariser'));
        } else if (['failed', 'canceled', 'expired'].indexOf(pay.status) >= 0) {
          // Non encaissé : on le dit, et surtout on ne verse rien qu'on n'a pas.
          try { await ref.set({complementStatus: 'echec'}, {merge: true}); } catch (_) {}
          try {
            await sendMail(db, ADMIN_EMAIL, {
              subject: 'Supplément NON encaissé — ' + escHtmlS(r.serviceName || r.service || 'prestation'),
              html: '<p>Le prélèvement du supplément a échoué (' + escHtmlS(pay.status || '') + ').</p>'
                + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
                + '<li><b>Montant :</b> ' + eurTxt(Number(r.complementAmount) || 0) + '</li></ul>'
                + '<p>L\'artisan n\'a PAS été réglé de cette part. À voir avec le client.</p>',
            });
          } catch (_) {}
        }
        res.status(200).send('ok');
        return;
      }
      if (reqId) {
        const db = getFirestore();
        // Un paiement qui n'est PLUS celui de la demande ne doit plus parler en son nom.
        // Quand une tentative inaboutie est remplacée, Mollie nous notifie son annulation :
        // sans ce garde-fou, cette notification marquait la demande « paiement non abouti »
        // alors que le client était en train de régler la nouvelle — et l'écran repartait
        // en boucle sur « Réessayer ».
        try {
          const cur0 = await db.collection('requests').doc(reqId).get();
          const enCours = cur0.exists ? ((cur0.data() || {}).molliePaymentId || '') : '';
          if (enCours && enCours !== pay.id) {
            console.log('Webhook ignoré : paiement remplacé reqId=' + reqId + ' ' + pay.id + ' (' + (pay.status || '') + ')');
            res.status(200).send('ok');
            return;
          }
        } catch (_) {}
        const upd = {molliePaymentStatus: pay.status || ''};
        if (pay.status === 'authorized') upd.molliePaymentAuthorized = true;
        if (pay.status === 'paid') upd.molliePaymentCaptured = true;
        // VERROU PAIEMENT : une demande n'est ouverte aux prestataires (status 'pending')
        // qu'UNE FOIS la carte du client autorisée. Avant ça elle est en 'pending_payment'
        // (invisible du pool). Aucun prestataire ne peut donc accepter/réaliser une
        // prestation non garantie financièrement.
        if (pay.status === 'authorized' || pay.status === 'paid') {
          try {
            const cur = await db.collection('requests').doc(reqId).get();
            const st = cur.exists && (cur.data() || {}).status;
            // Ouverture au pool, y compris après une tentative précédente expirée (le client
            // a fini par autoriser sa carte). On n'ouvre jamais une demande déjà accept./réglée.
            if (st === 'pending_payment' || st === 'payment_failed') upd.status = 'pending';
          } catch (_) {}
        }
        // Empreinte expirée / annulée / échouée avant autorisation : la demande n'a jamais
        // été ouverte, on la marque pour purge côté client (elle ne partira jamais au pool).
        if (['expired', 'canceled', 'failed'].indexOf(pay.status) >= 0) {
          try {
            const cur = await db.collection('requests').doc(reqId).get();
            if (cur.exists && (cur.data() || {}).status === 'pending_payment') upd.status = 'payment_failed';
          } catch (_) {}
        }
        try { await db.collection('requests').doc(reqId).set(upd, {merge: true}); } catch (e) { console.warn('mollieWebhook update', e); }
      }
    }
    res.status(200).send('ok');
  } catch (e) { console.warn('mollieWebhook', e); res.status(200).send('ok'); }
});

// Départ SÉCURISÉ du parcours Mollie : fonction AUTHENTIFIÉE. Seul l'artisan connecté
// obtient un lien signé pour SA propre fiche (uid = request.auth.uid, jamais fourni par le
// client). Renvoie l'URL OAuth Mollie ; l'app y redirige. Remplace l'ancien endpoint public.
exports.mollieOnboardingLink = onCall({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET']}, (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (!mollieOAuthConfigured()) throw new HttpsError('failed-precondition', 'Mollie non configuré.');
  const scope = ['onboarding.read', 'onboarding.write', 'organizations.read', 'payments.read', 'payments.write', 'profiles.read'].join(' ');
  const url = MOLLIE_AUTHORIZE +
    '?client_id=' + encodeURIComponent(process.env.MOLLIE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(MOLLIE_RETURN_URL) +
    '&state=' + encodeURIComponent(signMollieState(uid)) +
    '&scope=' + encodeURIComponent(scope) +
    // approval_prompt=force : Mollie affiche TOUJOURS l'écran de consentement. L'artisan voit
    // explicitement quelle organisation il relie (et peut annuler / changer de compte) au lieu
    // d'une validation silencieuse qui reliait par erreur le compte déjà ouvert sur l'appareil.
    '&response_type=code&approval_prompt=force';
  return {url: url};
});

// PONT DE COMPATIBILITÉ : ancien départ public (uid en clair), désormais abandonné pour la
// sécurité. On IGNORE totalement le paramètre `uid` (non fiable) et on renvoie l'utilisateur
// dans l'app avec le drapeau `?mollie=start`. L'app (version à jour, rechargée depuis le
// réseau car c'est une navigation) relance alors le parcours par la fonction AUTHENTIFIÉE
// `mollieOnboardingLink` — seule à pouvoir produire un lien signé pour la fiche de l'artisan
// CONNECTÉ. Sans ce pont, les clients encore en cache (ancienne version) qui pointaient vers
// cet endpoint retombaient bêtement sur l'accueil sans jamais atteindre Mollie.
exports.mollieOnboardingStart = onRequest((req, res) => {
  res.redirect(302, MOLLIE_APP_RETURN + '?mollie=start');
});

/**
 * mollieOnboardingReturn : retour du parcours Mollie. On échange le `code` contre un
 * jeton, on lit l'organisation connectée de l'artisan et on l'enregistre sur sa fiche
 * (mollieOrgId + mollieStatus). Puis on renvoie l'artisan dans l'app.
 * Inerte tant que Mollie n'est pas configuré.
 */
exports.mollieOnboardingReturn = onRequest({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET', 'MOLLIE_ACCESS_TOKEN']}, async (req, res) => {
  if (!mollieOAuthConfigured()) { res.status(503).json({error: 'Mollie non configuré'}); return; }
  const code = (req.query.code || '').toString();
  // Le `state` DOIT être un jeton signé par notre serveur (mollieOnboardingLink). Sinon on
  // refuse : impossible de lier une organisation Mollie à un uid forgé par un tiers.
  const uid = verifyMollieState(req.query.state);
  if (!code || !uid) { res.redirect(302, MOLLIE_APP_RETURN + (code ? '?mollie=error' : '')); return; }
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
    // GARDE-FOU anti-liaison croisée : l'artisan était connecté au compte Mollie de la
    // PLATEFORME (Ti-Services/CCS) → l'OAuth a renvoyé NOTRE organisation. On REFUSE : ne
    // rien enregistrer, ne jamais marquer « actif », et renvoyer un message explicite pour
    // qu'il se déconnecte de ce compte Mollie et recommence avec le SIEN.
    const platformOrg = await molliePlatformOrgId();
    if (orgId && platformOrg && orgId === platformOrg) {
      console.warn('mollieOnboardingReturn: liaison REFUSÉE (compte plateforme CCS) pour uid', uid);
      res.redirect(302, MOLLIE_APP_RETURN + '?mollie=platform');
      return;
    }
    // « active » = dossier Mollie réellement terminé (identité + IBAN vérifiés). Sinon
    // « pending ». Mais accepter une mission ne demande QUE l'autorisation d'encaisser
    // (mollieCanWork) : Mollie ne finit sa vérification qu'après une première transaction,
    // exiger le dossier complet enfermerait l'artisan dans un cercle sans issue.
    const ready = orgId ? await mollieOnboardingReady(tok.access_token) : {ok: false, status: 'needs-data', dashboard: ''};
    const db = getFirestore();
    await db.collection('artisans').doc(uid).set({
      mollieOrgId: orgId,
      mollieStatus: (orgId && ready.ok) ? 'active' : 'pending',
      mollieOnboardingStatus: ready.status,
      mollieCanPay: ready.canPay !== false,
      mollieCanSettle: ready.canSettle !== false,
      mollieCanWork: !!(orgId && ready.canPay === true),
      mollieDashboardUrl: ready.dashboard || '',
      mollieOnboardedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    // Refresh-token conservé CÔTÉ SERVEUR UNIQUEMENT (collection verrouillée, illisible par
    // le client) : permet de re-vérifier le statut plus tard — l'artisan finit souvent sa
    // vérification Mollie APRÈS être revenu dans l'app (statut « in-review » au retour).
    if (tok.refresh_token) {
      try { await db.collection('mollieTokens').doc(uid).set({refresh: tok.refresh_token, updatedAt: FieldValue.serverTimestamp()}, {merge: true}); } catch (_) {}
    }
    // ANTI-BOUCLE. Après consentement, le parcours OAuth peut rebondir aussitôt : sans
    // ce garde-fou, un artisan au dossier incomplet retombait en boucle sur son profil
    // Ti-Services sans jamais pouvoir finir. Désormais :
    //  - completed  -> retour app « activé » ;
    //  - needs-data -> redirection vers la page Mollie de COMPLÉTION (dashboard hébergé)
    //                  pour qu'il saisisse ses informations manquantes ;
    //  - in-review  -> Mollie vérifie, rien à faire : retour app « en vérification ».
    // La mise à jour du statut est ensuite captée par le webhook onboarding, le balayage
    // planifié (15 min) et la re-vérification à l'ouverture de l'écran paiements.
    if (orgId && ready.ok) {
      res.redirect(302, MOLLIE_APP_RETURN + '?mollie=active');
    } else if (ready.status === 'needs-data' && ready.dashboard) {
      res.redirect(302, ready.dashboard);
    } else {
      res.redirect(302, MOLLIE_APP_RETURN + '?mollie=pending');
    }
  } catch (e) { console.warn('mollieOnboardingReturn', e); res.redirect(302, MOLLIE_APP_RETURN + '?mollie=error'); }
});

/**
 * mollieCheckStatus : re-vérifie l'onboarding Mollie de l'artisan connecté et met à jour
 * sa fiche (mollieStatus 'active' UNIQUEMENT si l'onboarding est réellement « completed »).
 * Appelée par l'app quand le prestataire ouvre son écran « paiements » ou revient du
 * parcours Mollie : indispensable car la vérification Mollie se termine souvent APRÈS le
 * retour dans l'app. Utilise le refresh-token conservé côté serveur. Fail-safe : en cas
 * de doute, on laisse « pending » (l'artisan reste bloqué à l'acceptation).
 */
exports.mollieCheckStatus = onCall({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET', 'MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (!mollieOAuthConfigured()) return {status: 'unconfigured', active: false};
  const db = getFirestore();
  const res = await syncArtisanMollie(db, uid);
  return res || {status: 'unknown', active: false};
});

/**
 * mollieOnboardingWebhook : TEMPS RÉEL. Mollie appelle cette URL dès que le statut
 * d'onboarding d'une organisation connectée change (dossier validé, refusé, infos
 * requises). On re-synchronise l'artisan concerné SUR-LE-CHAMP → l'alerte (ou la bonne
 * nouvelle) part à la seconde, sans que l'artisan ait à rouvrir l'app.
 *
 * À CONFIGURER UNE FOIS côté Mollie : dans les réglages de l'application Mollie Connect,
 * renseigner l'URL de webhook « onboarding » :
 *   https://europe-west1-t-service-prod.cloudfunctions.net/mollieOnboardingWebhook
 * Répond toujours 200 (comme le webhook paiement) pour éviter les relances en boucle.
 */
exports.mollieOnboardingWebhook = onRequest({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET', 'MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async (req, res) => {
  try {
    if (!mollieOAuthConfigured()) { res.status(200).send('ok'); return; }
    const db = getFirestore();
    // Mollie transmet l'identifiant de l'organisation concernée (selon les intégrations :
    // body.id / body.organizationId / query). On l'utilise pour cibler l'artisan.
    const orgId = ((req.body && (req.body.id || req.body.organizationId)) ||
                   (req.query && (req.query.id || req.query.organizationId)) || '').toString();
    if (orgId) {
      const q = await db.collection('artisans').where('mollieOrgId', '==', orgId).limit(1).get();
      if (!q.empty) { try { await syncArtisanMollie(db, q.docs[0].id); } catch (e) { console.warn('onboardingWebhook sync', e); } }
    } else {
      // Pas d'organisation identifiée dans l'appel : par sécurité, on re-synchronise tous
      // les dossiers encore en attente (petit volume tant que le réseau démarre).
      const pend = await db.collection('artisans').where('mollieStatus', '==', 'pending').get();
      for (const d of pend.docs) { if ((d.data() || {}).mollieOrgId) { try { await syncArtisanMollie(db, d.id); } catch (_) {} } }
    }
    res.status(200).send('ok');
  } catch (e) { console.warn('mollieOnboardingWebhook', e); res.status(200).send('ok'); }
});

/**
 * mollieOnboardingSweep : FILET DE SÉCURITÉ planifié. Même si le webhook n'était pas
 * configuré (ou manquait un événement), on re-vérifie régulièrement les dossiers Mollie
 * encore « en attente » et on notifie tout changement. Garantit qu'aucun artisan ne
 * reste bloqué en silence. Volume faible → coût négligeable.
 */
/* ── Rappel 1 h avant : push au prestataire pour chaque mission acceptée qui
   démarre dans l'heure (balayage toutes les 15 min, heure de Saint-Barthélemy). ── */
exports.missionReminders = onSchedule({schedule: 'every 15 minutes'}, async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  // Aujourd'hui ET demain en heure locale (une mission de 00:30 se rappelle la veille à 23:30).
  const dayISO = (ms) => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
  const days = [dayISO(nowMs), dayISO(nowMs + 24 * 3600 * 1000)];
  const snap = await db.collection('requests').where('status', '==', 'accepted').where('dateISO', 'in', days).get();
  for (const doc of snap.docs) {
    const r = doc.data() || {};
    if (r.reminded1h || !r.providerUid) continue;
    const slot = /^\d{1,2}:\d{2}$/.test(r.acceptedSlot || '') ? r.acceptedSlot : (/^\d{1,2}:\d{2}$/.test(r.slot || '') ? r.slot : null);
    if (!slot || r.unit === 'j') continue;
    const startMs = Date.parse(r.dateISO + 'T' + (slot.length < 5 ? '0' : '') + slot + ':00-04:00');
    const delta = startMs - nowMs;
    if (!(delta > 0 && delta <= 60 * 60 * 1000)) continue;
    let tokens = [];
    try { tokens = ((await db.collection('users').doc(r.providerUid).get()).data() || {}).pushTokens || []; } catch (_) {}
    await doc.ref.update({ reminded1h: true });
    if (!tokens.length) continue;
    const first = (((r.clientName || '').trim().split(/\s+/)[0]) || 'votre client');
    const where = (r.locationMode === 'salon') ? 'dans votre salon' : ('à ' + (r.zone || 'Saint-Barthélemy'));
    await pushMulticast(tokens, 'Dans 1 h · ' + (r.serviceName || 'Mission'),
      slot + ' — ' + first + ' ' + where + '.', '/?open=promissions',
      (tok) => db.collection('users').doc(r.providerUid).update({ pushTokens: FieldValue.arrayRemove(tok) }));
    console.log('Rappel 1 h envoyé pour ' + doc.id);
  }
});

/* ── Rappel de re-commande : pour les prestations récurrentes par nature, si la
   dernière prestation validée d'un client date de 3 à 5 semaines et qu'il n'a rien
   re-commandé depuis, une notification l'invite à refaire en 1 clic (lien ?rebook=svc
   → commande pré-remplie, même prestataire). Garde-fous : 1 rappel max par service
   et par mois (users.rebookNudges), 50 envois max par passage. ── */
const REBOOK_SVCS = ['menage', 'jardin', 'piscine', 'baby', 'coach', 'massage',
  'coiffure', 'beaute', 'manucure', 'epilation', 'epilationdef', 'animaux'];
exports.rebookNudges = onSchedule({schedule: 'every day 14:00'}, async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const dayISO = (ms) => new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 10);
  const from = dayISO(nowMs - 35 * 86400 * 1000);
  const to = dayISO(nowMs - 21 * 86400 * 1000);
  const snap = await db.collection('requests').where('dateISO', '>=', from).where('dateISO', '<=', to).get();
  // Dernière prestation validée par (client, service) dans la fenêtre.
  const best = {};
  snap.docs.forEach((doc) => {
    const r = doc.data() || {};
    if (['paid', 'rated'].indexOf(r.status) < 0) return;
    if (!r.clientUid || REBOOK_SVCS.indexOf(r.service) < 0) return;
    const k = r.clientUid + '|' + r.service;
    if (!best[k] || String(r.dateISO) > String(best[k].dateISO)) best[k] = r;
  });
  let sent = 0;
  for (const k of Object.keys(best)) {
    if (sent >= 50) break;
    const r = best[k];
    // Le client a déjà re-commandé ce service depuis ? Alors aucun rappel.
    let later = false;
    try {
      const q = await db.collection('requests').where('clientUid', '==', r.clientUid).where('service', '==', r.service).get();
      later = q.docs.some((d) => { const x = d.data() || {}; return String(x.dateISO || '') > String(r.dateISO) && x.status !== 'cancelled'; });
    } catch (_) {}
    if (later) continue;
    const uref = db.collection('users').doc(r.clientUid);
    let u = {};
    try { u = (await uref.get()).data() || {}; } catch (_) { continue; }
    if (u.role && u.role !== 'client') continue;
    const nudges = u.rebookNudges || {};
    if (nudges[r.service] && (nowMs - nudges[r.service]) < 30 * 86400 * 1000) continue;
    const tokens = u.pushTokens || [];
    if (!tokens.length) continue;
    const first = String(r.providerName || '').trim().split(/\s+/)[0];
    const svcNm = String(r.serviceName || 'Votre prestation').slice(0, 40);
    const weeks = Math.max(3, Math.round((nowMs - Date.parse(r.dateISO + 'T12:00:00-04:00')) / (7 * 86400 * 1000)));
    await pushMulticast(tokens, 'Envie de refaire ?',
      svcNm + (first ? (' avec ' + first) : '') + ' — c\'était il y a ' + weeks + ' semaines. Re-commandez en 1 clic.',
      '/?rebook=' + encodeURIComponent(r.service),
      (tok) => uref.update({ pushTokens: FieldValue.arrayRemove(tok) }).catch(() => {}));
    await uref.set({ rebookNudges: Object.assign({}, nudges, (() => { const o = {}; o[r.service] = nowMs; return o; })()) }, { merge: true });
    sent++;
  }
  console.log('rebookNudges : ' + sent + ' rappel(s) envoyé(s)');
});

/**
 * mollieActivationReminder : RELANCE HEBDOMADAIRE des prestataires VALIDÉS qui ne peuvent
 * pas encore encaisser.
 *
 * Ce qu'elle répare : un prestataire validé sans compte de paiement connecté voit les
 * demandes arriver et ne peut en accepter AUCUNE — la règle Firestore l'exige. L'e-mail de
 * validation le dit déjà, mais une seule fois, le jour même. Beaucoup remettent à plus tard
 * et n'y reviennent jamais ; on ne s'en aperçoit que le jour de l'ouverture aux clients.
 *
 * Une fois par semaine, pas plus : c'est un rappel, pas du harcèlement. Il s'arrête de
 * lui-même dès que les paiements sont actifs, la sélection ne retenant que ceux qui ne le
 * sont pas. `mollieRelances` alimente la console (« relancé 3 fois »).
 * Lundi 13 h UTC = 9 h à Saint-Barthélemy : jour ouvré, heure ouvrable.
 */
exports.mollieActivationReminder = onSchedule({schedule: 'every monday 13:00', secrets: [SMTP_PASS]}, async () => {
  const db = getFirestore();
  const nowMs = Date.now();
  const snap = await db.collection('artisans').where('status', '==', 'valide').get();
  const attachments = [];
  try {
    const logo = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png'));
    attachments.push({filename: 'ti-services.png', content: logo, cid: 'tilogo'});
  } catch (_) {}
  let sent = 0; let actifs = 0;
  for (const d of snap.docs) {
    const a = d.data() || {};
    if (a.mollieStatus === 'active') { actifs++; continue; }
    // Celui qui peut déjà encaisser et à qui Mollie ne réclame aucune pièce n'a RIEN à
    // faire : il attend seulement la validation. Le relancer serait un reproche sans objet
    // — et il peut déjà accepter des missions.
    if (a.mollieCanWork === true && a.mollieOnboardingStatus !== 'needs-data') { actifs++; continue; }
    // Garde-fou : jamais deux relances à moins de 6 jours, même si la tâche est rejouée à
    // la main ou si l'ordonnanceur double un déclenchement.
    const last = Number(a.mollieRelanceAt) || 0;
    if (last && (nowMs - last) < 6 * 86400 * 1000) continue;
    const n = (Number(a.mollieRelances) || 0) + 1;
    // Notification : le canal qui porte le mieux sur un téléphone.
    try {
      const u = (await db.collection('users').doc(d.id).get()).data() || {};
      const tokens = u.pushTokens || [];
      if (tokens.length) {
        await pushMulticast(tokens, 'Tes paiements ne sont pas encore activés',
          'Sans cette étape tu ne peux accepter aucune mission. Quelques minutes suffisent.',
          '/?open=missions',
          (tok) => db.collection('users').doc(d.id).update({pushTokens: FieldValue.arrayRemove(tok)}).catch(() => {}));
      }
    } catch (e) { console.warn('mollieActivationReminder push', d.id, e); }
    // E-mail : le seul canal qui atteigne encore quelqu'un ayant désinstallé l'application.
    if (a.email) {
      try {
        await sendMail(db, a.email, {
          subject: 'Il te reste une étape pour recevoir des missions',
          html: mollieReminderHtml(String(a.name || '').trim(), n),
          attachments,
        });
      } catch (e) { console.warn('mollieActivationReminder mail', d.id, e); }
    }
    try { await d.ref.set({mollieRelances: n, mollieRelanceAt: nowMs}, {merge: true}); } catch (_) {}
    sent++;
  }
  console.log('mollieActivationReminder : ' + sent + ' relance(s), ' + actifs + ' déjà actif(s) sur ' + snap.size + ' validé(s).');
});

exports.mollieOnboardingSweep = onSchedule({schedule: 'every 15 minutes', secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET', 'MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async () => {
  if (!mollieOAuthConfigured()) return;
  const db = getFirestore();
  const pend = await db.collection('artisans').where('mollieStatus', '==', 'pending').get();
  for (const d of pend.docs) {
    if (!(d.data() || {}).mollieOrgId) continue;
    try { await syncArtisanMollie(db, d.id); } catch (e) { console.warn('mollieSweep', d.id, e); }
  }
  console.log('mollieOnboardingSweep : ' + pend.size + ' dossier(s) en attente re-vérifié(s).');
});

/**
 * paymentReconciliation : RÉCONCILIATION QUOTIDIENNE de l'argent, en LECTURE SEULE.
 * Ne modifie rien, ne débite rien — balaye les demandes et signale à l'admin, par
 * e-mail, tout ce qui « coince » dans le circuit de paiement :
 *   1. commandes bloquées au paiement (pending_payment / payment_failed > 6 h) ;
 *   2. missions actives dont l'EMPREINTE bancaire vieillit (autorisée depuis > 5 jours,
 *      jamais capturée) — une autorisation Mollie finit par EXPIRER : si elle expire
 *      avant la validation, le client ne pourrait plus être débité ;
 *   3. prestations terminées côté pro mais jamais validées par le client (> 72 h) —
 *      l'argent n'est ni capturé ni versé ;
 *   4. versements artisan non routés (molliePayout = 'unrouted') pas encore régularisés.
 * Aucune anomalie => aucun e-mail. Tourne chaque matin à ~5 h (heure de Saint-Barth).
 */
exports.paymentReconciliation = onSchedule({schedule: '0 9 * * *', secrets: [SMTP_PASS]}, async () => {
  const db = getFirestore();
  const now = Date.now();
  const H = 3600 * 1000;
  const ageH = (ts) => {
    let t = 0;
    try { t = (ts && ts.toMillis) ? ts.toMillis() : (Number(ts) || 0); } catch (_) { t = 0; }
    return t ? Math.round((now - t) / H) : null;   // null = horodatage absent → ignoré
  };
  const row = (id, r, extra) => '<li><b>' + escHtmlS(r.serviceName || r.service || 'prestation') + '</b> — ' +
    escHtmlS(r.clientName || '?') + ' / ' + escHtmlS(r.providerName || 'aucun pro') +
    ' — ' + eurTxt(Number(r.total) || 0) + ' — <code>' + escHtmlS(id) + '</code>' + (extra ? ' — ' + extra : '') + '</li>';
  const sections = [];
  const scan = async (status) => { try { return (await db.collection('requests').where('status', '==', status).get()).docs; } catch (e) { console.warn('reco scan', status, e); return []; } };

  // 1. Bloquées au paiement (> 6 h) — le client croit peut-être avoir commandé.
  {
    const items = [];
    for (const st of ['pending_payment', 'payment_failed']) {
      for (const d of await scan(st)) {
        const r = d.data() || {}; const a = ageH(r.createdAt);
        if (a !== null && a >= 6) items.push(row(d.id, r, st + ' depuis ' + a + ' h'));
      }
    }
    if (items.length) sections.push('<h3>🛒 Commandes bloquées au paiement (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Le pool de prestataires ne les voit pas. Le client doit finaliser (ou la demande expirer).</p>');
  }
  // 2. Empreintes qui vieillissent (> 5 jours sans capture) — risque d'expiration.
  {
    const items = [];
    for (const st of ['accepted', 'working', 'done_pro']) {
      for (const d of await scan(st)) {
        const r = d.data() || {};
        if (!r.molliePaymentId || r.mollieCaptured) continue;
        const a = ageH(r.acceptedAt || r.createdAt);
        if (a !== null && a >= 5 * 24) items.push(row(d.id, r, 'autorisée il y a ' + Math.round(a / 24) + ' j (' + st + ')'));
      }
    }
    if (items.length) sections.push('<h3>⏳ Empreintes bancaires qui vieillissent (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Si l\'autorisation expire avant la validation, le client ne pourra plus être débité. Relancer la validation de la prestation.</p>');
  }
  // 3. Terminées côté pro, jamais validées (> 72 h).
  {
    const items = [];
    for (const d of await scan('done_pro')) {
      const r = d.data() || {}; const a = ageH(r.acceptedAt || r.createdAt);
      if (a !== null && a >= 72) items.push(row(d.id, r, 'en attente de validation client'));
    }
    if (items.length) sections.push('<h3>⚠️ Prestations terminées non validées depuis > 72 h (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Ni capture ni versement tant que le client ne valide pas — relancer le client.</p>');
  }
  // 4. Versements artisan non routés, à régulariser.
  {
    const items = [];
    try {
      for (const d of (await db.collection('requests').where('molliePayout', '==', 'unrouted').get()).docs) {
        const r = d.data() || {};
        items.push(row(d.id, r, r.molliePayoutIssue === 'no_org' ? 'aucun compte Mollie connecté' : 'routage refusé par Mollie'));
      }
    } catch (e) { console.warn('reco unrouted', e); }
    if (items.length) sections.push('<h3>💸 Versements artisan à régulariser (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Le client a payé, l\'artisan n\'a pas reçu son net (fonds en sécurité sur le solde plateforme). Vérifier son onboarding Mollie puis re-router (ou virement manuel).</p>');
  }
  // 5. Suppléments facturés mais non encaissés — pourboire, heures en plus, coup de pouce.
  //    Une somme qui figure sur une facture sans avoir été prélevée ne doit jamais
  //    dormir : ni le client ne l'a payée, ni l'artisan ne l'a touchée.
  {
    const items = [];
    const mots = {impossible: 'aucun prélèvement possible', echec: 'prélèvement refusé', a_regler: 'lien de paiement en attente'};
    try {
      for (const st of ['impossible', 'echec', 'a_regler']) {
        for (const d of (await db.collection('requests').where('complementStatus', '==', st).get()).docs) {
          const r = d.data() || {};
          items.push(row(d.id, r, eurTxt(Number(r.complementAmount) || 0) + ' — ' + mots[st] +
            (r.complementIssue ? (' (' + escHtmlS(r.complementIssue) + ')') : '')));
        }
      }
    } catch (e) { console.warn('reco complements', e); }
    if (items.length) sections.push('<h3>💛 Suppléments facturés mais non encaissés (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Ces montants figurent sur la facture du client sans avoir été prélevés. Ils ne sont pas versés à l\'artisan tant qu\'ils ne sont pas encaissés.</p>');
  }

  // BACKFILL DES FRAIS MOLLIE RÉELS : le règlement (settlementAmount) n'est souvent connu
  // qu'un jour ou deux après la prestation. On complète ici, chaque matin, les frais des
  // prestations réglées dont le frais Mollie n'est pas encore renseigné (200 plus récentes).
  try {
    const led = await db.collection('ledger').where('type', '==', 'commission').orderBy('settledAt', 'desc').limit(200).get();
    let filled = 0;
    for (const d of led.docs) {
      const e = d.data() || {};
      if (e.mollieFee == null && e.molliePaymentId) { if (await recordMollieFee(db, d.id, e.molliePaymentId, e.commissionAmount)) filled++; }
    }
    if (filled) console.log('paymentReconciliation : ' + filled + ' frais Mollie complété(s).');
  } catch (e) { console.warn('reco mollieFee backfill', e); }

  if (!sections.length) { console.log('paymentReconciliation : aucune anomalie ✓'); return; }
  try {
    await sendMail(db, ADMIN_EMAIL, {
      subject: 'Ti-Services · Réconciliation paiements — ' + sections.length + ' point(s) à vérifier',
      html: '<p>Contrôle quotidien automatique du circuit de paiement :</p>' + sections.join('') +
            '<p style="color:#888">E-mail envoyé uniquement quand une anomalie est détectée. Aucune action automatique n\'a été faite.</p>',
    });
    console.log('paymentReconciliation : ' + sections.length + ' section(s) signalée(s) à l\'admin.');
  } catch (e) { console.warn('paymentReconciliation mail', e); }
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
  // Mentions légales du prestataire selon son statut. Société : forme juridique + capital
  // + RCS (obligatoire). Micro-entreprise : mention dédiée. SIREN = 9 premiers chiffres du
  // SIRET. Pour un particulier, on n'ajoute ni forme ni RCS.
  const pSiret = (inv.provider.siret || '').replace(/\s/g, '');
  const siren = pSiret.slice(0, 9);
  const stype = inv.provider.statusType || '';
  let formLine = '';
  if (stype === 'micro') {
    formLine = 'Micro-entreprise';
  } else if (stype !== 'particulier') {
    const capNum = Number(String(inv.provider.capital || '').replace(/[^\d.]/g, ''));
    formLine = [inv.provider.legalForm || '', (capNum > 0 ? 'au capital de ' + eurTxt(capNum) : '')].filter(Boolean).join(' ');
  }
  const rcsLine = (stype !== 'particulier' && stype !== 'micro' && inv.provider.rcsCity && siren)
    ? ('RCS ' + inv.provider.rcsCity + ' ' + siren) : '';
  const pL = [formLine, inv.provider.address || 'Saint-Barthélemy', pSiret ? ('SIRET ' + pSiret) : '', rcsLine].filter(Boolean);
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
  // Libellé aligné à DROITE, se terminant 14 pt avant le montant (calé à droite) : plus
  // aucun chevauchement, quelle que soit la largeur du total (dizaines ou milliers d'euros).
  const totalStr = eurTxt(inv.total);
  const totalW = bold.widthOfTextAtSize(totalStr, 13);
  TR('TOTAL RÉGLÉ', (cTot - 6) - totalW - 14, y, 11, bold, ink);
  TR(totalStr, cTot - 6, y, 13, bold, coral);
  y -= 17;
  TR('Réglé par carte bancaire le ' + inv.dateStr + ' - encaissement via Mollie (agréé). Aucun solde dû.', cTot - 6, y, 7.5, font, mut);
  y -= 34;
  const legal = [
    "TVA non applicable - Saint-Barthélemy (collectivité d'outre-mer, hors du champ de la TVA française).",
    "Facture établie par Ti-Services au nom et pour le compte du prestataire, en vertu d'un mandat de facturation (art. 289 du CGI).",
    'Document remis au client à titre de justificatif de la prestation réglée.',
    'Ti-Services est un service édité par C.C.S - Construction Conseils et Services, SAS.',
  ];
  // Vente à un CLIENT PROFESSIONNEL (raison sociale ou SIRET renseigné) : mentions B2B
  // obligatoires (pénalités de retard + indemnité forfaitaire de recouvrement).
  if (inv.client.company || inv.client.siret) {
    legal.splice(3, 0, "Client professionnel — en cas de retard de paiement : pénalités au taux de 3 fois l'intérêt légal et indemnité forfaitaire de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d'escompte pour paiement anticipé.");
  }
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
      provider: { legal: after.providerLegal || after.providerName || 'Artisan Ti-Services', address: after.providerAddress || '', siret: after.providerSiret || '', statusType: after.providerStatusType || '', legalForm: after.providerLegalForm || '', capital: after.providerCapital || '', rcsCity: after.providerRcsCity || '' },
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

/* Entonnoir d'installation : compteurs ANONYMES (aucune donnée personnelle) —
 * visites → guide d'installation ouvert → app réellement installée, ventilés par
 * plateforme. Écrits ici (Admin SDK) pour garder les règles Firestore fermées à
 * l'écriture ; le client déduplique (1×/jour, installé 1×/appareil) et appelle en
 * fire-and-forget. Doc settings/installFunnel_{prod|beta}, lu par la console admin. */
const FUNNEL_EVENTS = ['visit', 'guide', 'installed'];
const FUNNEL_PLATFORMS = ['ios', 'android', 'desktop'];
exports.trackFunnel = onCall(async (request) => {
  const d = request.data || {};
  const ev = String(d.event || '');
  const pf = String(d.platform || '');
  const env = d.env === 'prod' ? 'prod' : 'beta';
  const did = String(d.did || '').slice(0, 64);
  if (!FUNNEL_EVENTS.includes(ev) || !FUNNEL_PLATFORMS.includes(pf)) {
    throw new HttpsError('invalid-argument', 'Événement inconnu.');
  }
  if (!/^[a-f0-9-]{16,64}$/i.test(did)) throw new HttpsError('invalid-argument', 'Identifiant invalide.');
  const db = getFirestore();
  // APPAREILS UNIQUES : chaque appareil porte un identifiant anonyme stable (généré
  // côté client, aucune donnée personnelle). Une transaction n'incrémente le compteur
  // que la PREMIÈRE fois que CET appareil franchit CETTE étape — les revisites, les
  // rechargements et les doublons ne comptent plus. Champs « u_* » : nouveau comptage
  // unique ; les anciens champs (comptage avec doublons) restent archivés dans le doc.
  const devRef = db.collection('funnelDevices_' + env).doc(did);
  const cntRef = db.doc('settings/installFunnel_' + env);
  await db.runTransaction(async (tx) => {
    const dev = await tx.get(devRef);
    const dd = dev.exists ? (dev.data() || {}) : {};
    if (dd[ev]) return; // déjà compté pour cet appareil
    const dpatch = {updatedAt: FieldValue.serverTimestamp()};
    dpatch[ev] = true; dpatch[ev + 'Pf'] = pf;
    tx.set(devRef, dpatch, {merge: true});
    const upd = {updatedAt: FieldValue.serverTimestamp()};
    upd['u_' + ev + '_total'] = FieldValue.increment(1);
    upd['u_' + ev + '_' + pf] = FieldValue.increment(1);
    tx.set(cntRef, upd, {merge: true});
  });
  return {ok: true};
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
      provider: { legal: r.providerLegal || r.providerName || 'Artisan Ti-Services', address: r.providerAddress || '', siret: r.providerSiret || '', statusType: r.providerStatusType || '', legalForm: r.providerLegalForm || '', capital: r.providerCapital || '', rcsCity: r.providerRcsCity || '' },
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
    ('Votre <b>compte intervenant</b> Ti-Services est créé&nbsp;! Dernière étape&nbsp;: <b>complétez votre profil</b> ' +
     'dans l\'application (en quelques minutes) pour <b>envoyer votre candidature</b>. Dès qu\'elle est validée par ' +
     'notre équipe, vous recevrez vos premières <b>demandes de mission</b> près de chez vous, à Saint-Barthélemy.') :
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
function inviteArtisanHtml(name, message) {
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
            // Texte modifiable par l'admin : inséré ÉCHAPPÉ dans le même gabarit (charte
            // conservée : logo, bandeau, points forts, bouton). Sans texte fourni, le
            // paragraphe standard (avec ses mises en gras) est utilisé.
            (message
              ? String(message).split(/\n{2,}/).map(function (par) {
                  return '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:10px 0 0">' + escHtmlS(par).replace(/\n/g, '<br>') + '</p>';
                }).join('')
              : '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:10px 0 0">Votre travail à Saint-Barthélemy correspond exactement à ce que recherchent nos clients. <b>Ti-Services</b> est une nouvelle application <b>100 % Saint-Barth</b> qui met en relation les habitants avec des artisans et intervenants locaux de confiance — et vous recevez vos <b>demandes de mission</b> directement dans l\'application.</p>') +
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

/* ============================================================================
 * E-MAIL « INSCRIPTION VALIDÉE » — envoyé quand l'admin valide un artisan. Même
 * charte que la bienvenue (accent sarcelle intervenant). Annonce la validation,
 * RAPPELLE l'étape Mollie (activation des paiements), précise que la validation
 * Mollie peut prendre jusqu'à 48 h, et qu'à partir de là l'artisan peut recevoir
 * des missions. Le bouton ouvre directement l'écran d'activation des paiements.
 * ========================================================================== */
/**
 * mollieReminderHtml : e-mail de relance « active tes paiements ».
 * Tutoiement volontaire : sur l'île on se parle ainsi, et un courrier qui sonne
 * administratif ne fait bouger personne. Deux choses seulement, jamais plus : activer
 * les paiements, et laisser les notifications ouvertes — c'est le couple qui décide si
 * la personne travaillera ou regardera passer les missions. Ton factuel, jamais
 * culpabilisant : on rappelle la conséquence concrète plutôt que de réclamer une
 * démarche. Au fil des relances le message se resserre — on ne répète pas mot pour mot
 * une chose déjà lue trois fois. Sert aussi à la relance manuelle (sendMollieRelance).
 */
function mollieReminderHtml(name, n) {
  const app = APP_URL.replace(/\/$/, '');
  const c1 = '#0FA896'; const c2 = '#14C2A8'; const btn = '#0FA896';
  const hi = name ? escHtmlS(String(name).split(/\s+/)[0]) : '';
  const relance = Number(n) || 1;
  const accroche = relance >= 3
    ? 'Ton profil est validé depuis un moment, et tu ne peux toujours <b>pas accepter de mission</b>. Il ne manque qu\'une chose.'
    : (relance === 2
      ? 'Petit rappel&nbsp;: sans compte de paiement, tu ne peux <b>pas encore accepter de mission</b>.'
      : 'Ton profil est validé — il ne manque plus que tes <b>paiements</b>.');
  return '' +
  '<div style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#231E33">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F4;padding:24px 12px">' +
      '<tr><td align="center">' +
        '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">' +
          '<tr><td style="height:6px;background:linear-gradient(90deg,' + c1 + ',' + c2 + ')"></td></tr>' +
          '<tr><td align="center" style="padding:26px 30px 4px">' +
            '<img src="cid:tilogo" width="60" height="60" alt="Ti-Services" style="display:block;border-radius:16px;margin:0 auto 10px">' +
            '<div style="font-size:24px;font-weight:800;letter-spacing:-.02em"><span style="color:' + c1 + '">Ti</span><span style="color:#231E33">-Services</span></div>' +
            '<div style="font-size:12px;color:#8a8494;margin-top:2px">Services à la demande · Saint-Barthélemy</div>' +
          '</td></tr>' +
          '<tr><td style="padding:16px 30px 0">' +
            '<h1 style="font-size:21px;margin:6px 0 0;color:#231E33">' + (hi ? (hi + ', il') : 'Il') + ' te reste une étape</h1>' +
            '<p style="font-size:14.5px;line-height:1.6;color:#4a4556;margin:12px 0 0">' + accroche + '</p>' +
            // 1 — les paiements. Le vrai verrou : sans compte Mollie, aucune mission acceptable.
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F3;border:1px solid #cfece7;border-radius:14px;margin-top:16px">' +
              '<tr><td style="padding:16px 18px">' +
                '<div style="font-size:15px;font-weight:800;color:#231E33">1 · Active tes paiements</div>' +
                '<div style="font-size:13.5px;color:#4a4556;line-height:1.55;margin-top:7px">Ton argent t\'est versé <b>automatiquement</b> après chaque prestation&nbsp;: pas de facture à courir, pas de virement à réclamer. Pour ça il faut un compte de paiement à ton nom chez <b>Mollie</b>, notre prestataire agréé. C\'est <b>une seule fois</b>, et l\'application te guide question par question.</div>' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td align="center">' +
                  '<a href="' + app + '/?open=missions" style="display:inline-block;background:' + btn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 24px;border-radius:11px">Activer mes paiements</a>' +
                '</td></tr></table>' +
                '<div style="font-size:12px;color:#8a8494;line-height:1.5;margin-top:10px;text-align:center">Compte quelques minutes — c\'est plus simple depuis un <b>ordinateur</b>.</div>' +
              '</td></tr>' +
            '</table>' +
            // 2 — les notifications. Sans elles, les missions partent avant d'être vues.
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF4EF;border:1px solid #f6dcd0;border-radius:14px;margin-top:12px">' +
              '<tr><td style="padding:16px 18px">' +
                '<div style="font-size:15px;font-weight:800;color:#231E33">2 · Laisse tes notifications allumées</div>' +
                '<div style="font-size:13.5px;color:#4a4556;line-height:1.55;margin-top:7px">Une demande part à tous les prestataires du métier en même temps, et <b>le premier qui répond la prend</b>. Sans notification tu l\'apprends trop tard. Vérifie qu\'elles sont bien actives&nbsp;: <b>Compte</b> → <b>Alertes nouvelles demandes</b>.</div>' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px"><tr><td align="center">' +
                  '<a href="' + app + '/?open=alerts" style="display:inline-block;background:#ffffff;border:1.5px solid #F26A4B;color:#D6421F;text-decoration:none;font-weight:700;font-size:13.5px;padding:9px 20px;border-radius:11px">Vérifier mes notifications</a>' +
                '</td></tr></table>' +
              '</td></tr>' +
            '</table>' +
            '<p style="font-size:13px;line-height:1.6;color:#8a8494;margin:16px 0 0">Mollie vérifie ton identité et ton IBAN&nbsp;: ça peut prendre jusqu\'à 48&nbsp;h. Mieux vaut ne pas s\'y prendre au dernier moment. Tu reçois ce message chaque semaine tant que tes paiements ne sont pas actifs — il s\'arrête tout seul dès que c\'est fait.</p>' +
            '<p style="font-size:13px;line-height:1.6;color:#8a8494;margin:12px 0 0">Un blocage, une question&nbsp;? Réponds simplement à cet e-mail.</p>' +
          '</td></tr>' +
          '<tr><td style="padding:22px 30px 26px">' +
            '<div style="height:1px;background:#EEE5DF"></div>' +
            '<div style="font-size:11px;color:#a79fa8;line-height:1.5;padding-top:10px">C.C.S (Ti-Services) — Carrefour des 4 Chemins, Marigot, 97133 Saint-Barthélemy</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}

function approvedArtisanHtml(name) {
  const app = APP_URL.replace(/\/$/, '');
  // Accent sarcelle (teal) : même code couleur que l'e-mail de bienvenue intervenant.
  const c1 = '#0FA896', c2 = '#14C2A8', btn = '#0FA896', dot = '#0FA896';
  const hi = name ? escHtmlS(name) : 'Bonjour';
  // Bloc « dernière étape » Mollie : mis en avant sur fond sarcelle très doux.
  const mollieBlock =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F3;border:1px solid #cfece7;border-radius:14px;margin-top:6px">' +
      '<tr><td style="padding:16px 18px">' +
        '<span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:.04em;color:#ffffff;background:' + c1 + ';border-radius:999px;padding:4px 11px">DERNIÈRE ÉTAPE</span>' +
        '<div style="font-size:16px;font-weight:800;color:#231E33;margin-top:11px">Activez vos paiements (Mollie)</div>' +
        '<div style="font-size:13.5px;color:#4a4556;line-height:1.55;margin-top:7px">Pour être réglé <b>automatiquement</b> après chaque prestation, vous devez ouvrir votre compte de paiement sécurisé chez <b>Mollie</b> — notre prestataire agréé. C\'est <b>une seule fois</b> et l\'application vous guide question par question (des réponses toutes prêtes à copier-coller).</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>' +
          '<td width="26" valign="top"><div style="font-size:15px;line-height:1.3">⏱️</div></td>' +
          '<td style="font-size:13px;color:#4a4556;line-height:1.5">La vérification de votre dossier par Mollie (identité, IBAN) peut prendre <b>jusqu\'à 48&nbsp;h</b>. Vous recevrez un e-mail dès qu\'elle est validée.</td>' +
        '</tr></table>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:9px"><tr>' +
          '<td width="26" valign="top"><div style="font-size:15px;line-height:1.3">✅</div></td>' +
          '<td style="font-size:13px;color:#4a4556;line-height:1.5"><b>À partir de là, vous pourrez recevoir des missions</b> et accepter les demandes près de chez vous — votre gain net (commission déduite) vous est versé tout seul, sans virement à faire.</td>' +
        '</tr></table>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td align="center">' +
          '<a href="' + app + '/?open=missions" style="display:inline-block;background:' + btn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 24px;border-radius:11px">Activer mes paiements</a>' +
        '</td></tr></table>' +
        '<div style="font-size:12px;color:#8a8494;line-height:1.5;margin-top:10px;text-align:center">Astuce&nbsp;: cette étape est plus simple depuis un <b>ordinateur</b>.</div>' +
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
            '<div style="font-size:24px;font-weight:800;letter-spacing:-.02em"><span style="color:' + c1 + '">Ti</span><span style="color:#231E33">-Services</span></div>' +
            '<div style="font-size:12px;color:#8a8494;margin-top:2px">Services à la demande · Saint-Barthélemy</div>' +
          '</td></tr>' +
          '<tr><td style="padding:14px 30px 0">' +
            '<h1 style="font-size:22px;margin:8px 0 0;color:#231E33">Votre inscription est validée&nbsp;🎉</h1>' +
            '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:12px 0 0">Bonjour ' + hi + ',</p>' +
            '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:10px 0 0">Bonne nouvelle&nbsp;: votre profil <b>intervenant</b> sur Ti-Services vient d\'être <b>validé</b> par notre équipe. Bienvenue à bord&nbsp;! Il reste une dernière étape avant de recevoir vos premières missions.</p>' +
          '</td></tr>' +
          '<tr><td style="padding:18px 30px 4px">' + mollieBlock + '</td></tr>' +
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
 * E-MAIL « MOT DE PASSE OUBLIÉ » — soigné, aux couleurs Ti-Services, envoyé
 * depuis contact@ti-services.fr (au lieu de l'e-mail générique Firebase).
 * Trilingue (fr/en/pt). Le lien de réinitialisation est généré côté serveur
 * par l'Admin SDK ; on ne révèle jamais si l'adresse est inscrite.
 * ========================================================================== */
function resetPasswordEmail(link, lang) {
  const L = {
    fr: {
      subject: 'Réinitialisation de votre mot de passe Ti-Services',
      h1: 'Mot de passe oublié ?',
      intro: 'Pas d\'inquiétude. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe et retrouver votre compte Ti-Services.',
      btn: 'Réinitialiser mon mot de passe',
      alt: 'Le bouton ne fonctionne pas ? Copiez-collez ce lien dans votre navigateur :',
      note: 'Ce lien est valable une heure et ne peut servir qu\'une seule fois. Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement cet e-mail — votre mot de passe reste inchangé.',
      signoff: 'À très vite,',
    },
    en: {
      subject: 'Reset your Ti-Services password',
      h1: 'Forgot your password?',
      intro: 'No worries. Click the button below to choose a new password and get back into your Ti-Services account.',
      btn: 'Reset my password',
      alt: 'Button not working? Copy and paste this link into your browser:',
      note: 'This link is valid for one hour and can only be used once. If you didn\'t request this, just ignore this email — your password stays unchanged.',
      signoff: 'See you soon,',
    },
    pt: {
      subject: 'Redefinir a sua palavra-passe Ti-Services',
      h1: 'Esqueceu-se da palavra-passe?',
      intro: 'Sem problema. Clique no botão abaixo para escolher uma nova palavra-passe e voltar a aceder à sua conta Ti-Services.',
      btn: 'Redefinir a minha palavra-passe',
      alt: 'O botão não funciona? Copie e cole esta ligação no seu navegador:',
      note: 'Esta ligação é válida durante uma hora e só pode ser usada uma vez. Se não fez este pedido, ignore este e-mail — a sua palavra-passe permanece inalterada.',
      signoff: 'Até breve,',
    },
  };
  const t = L[lang] || L.fr;
  const c1 = '#FF6A5B', c2 = '#FF9F54', btn = '#FF6A5B';
  const safe = escHtmlS(link);
  const html = '' +
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
            '<h1 style="font-size:22px;margin:8px 0 0;color:#231E33">' + t.h1 + '</h1>' +
            '<p style="font-size:15px;line-height:1.6;color:#4a4556;margin:12px 0 0">' + t.intro + '</p>' +
          '</td></tr>' +
          '<tr><td align="center" style="padding:22px 30px 6px">' +
            '<a href="' + safe + '" style="display:inline-block;background:' + btn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:12px">' + t.btn + '</a>' +
          '</td></tr>' +
          '<tr><td style="padding:6px 30px 0"><div style="font-size:12px;color:#8a8494;line-height:1.5">' + t.alt + '<br><a href="' + safe + '" style="color:' + c1 + ';word-break:break-all">' + safe + '</a></div></td></tr>' +
          '<tr><td style="padding:16px 30px 4px"><div style="font-size:13px;color:#6b6577;line-height:1.6;background:#FBF7F4;border:1px solid #efeae4;border-radius:12px;padding:12px 14px">' + t.note + '</div></td></tr>' +
          '<tr><td style="padding:16px 30px 24px;border-top:1px solid #efeae4;background:#FBF7F4;margin-top:8px">' +
            '<div style="font-size:12px;color:#8a8494;line-height:1.6">' + t.signoff + '<br>L\'équipe Ti-Services<br>' +
            '<span style="color:#b0aab8">Service édité par C.C.S — Construction Conseils et Services, SAS · Saint-Barthélemy</span></div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</div>';
  return { subject: t.subject, html };
}

// Envoi de l'e-mail « mot de passe oublié » soigné (SMTP Ti-Services). Appelé sans
// authentification (l'utilisateur est déconnecté). On ne révèle jamais si l'adresse
// est inscrite, et on limite à un envoi par minute et par adresse (anti-abus).
exports.sendResetEmail = onCall({secrets: [SMTP_PASS]}, async (request) => {
  const email = String((request.data && request.data.email) || '').trim().toLowerCase();
  const lang0 = String((request.data && request.data.lang) || 'fr');
  const lang = (lang0 === 'en' || lang0 === 'pt') ? lang0 : 'fr';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Adresse e-mail invalide.');
  }
  const db = getFirestore();
  // Anti-abus : au plus un e-mail par minute et par adresse.
  try {
    const id = email.replace(/[^a-z0-9._+-]/g, '_').slice(0, 120);
    const ref = db.collection('pwResetThrottle').doc(id);
    const snap = await ref.get();
    const last = snap.exists && snap.data() && snap.data().last;
    if (last && (Date.now() - last) < 60000) return { sent: true };
    await ref.set({ last: Date.now() }, { merge: true });
  } catch (_) {}
  // Génère le lien de réinitialisation (Admin SDK). Compte inexistant → on reste muet.
  let link;
  try {
    link = await getAuth().generatePasswordResetLink(email);
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') return { sent: true };
    console.warn('sendResetEmail generateLink', e && e.code);
    throw new HttpsError('internal', 'Envoi impossible — réessayez.');
  }
  const attachments = [];
  try {
    const logo = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png'));
    attachments.push({ filename: 'ti-services.png', content: logo, cid: 'tilogo' });
  } catch (_) {}
  const { subject, html } = resetPasswordEmail(link, lang);
  try {
    await sendMail(db, email, { subject, html, attachments });
    console.log('E-mail de réinitialisation → ' + email);
  } catch (e) { console.warn('sendResetEmail send', e); }
  return { sent: true };
});

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
  const message = String((request.data && request.data.message) || '').trim().slice(0, 1200);
  const ok = await sendMail(getFirestore(), to, {
    subject: 'Rejoignez Ti-Services — les clients de Saint-Barth vous cherchent',
    html: inviteArtisanHtml(name, message),
    attachments,
  });
  if (!ok) throw new HttpsError('internal', 'L\'envoi a échoué — réessayez.');
  return { sent: true };
});

// Relance manuelle depuis la console admin : exactement le même e-mail que la relance
// automatique du lundi, envoyé tout de suite. C'est ce qu'on veut juste après avoir eu
// la personne au téléphone — le message est déjà écrit, il part avec la charte.
// L'envoi incrémente le compteur de relances : la tâche du lundi voit le garde-fou des
// 6 jours et ne double donc pas ce message.
exports.sendMollieRelance = onCall({secrets: [SMTP_PASS]}, async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const uid = String((request.data && request.data.uid) || '').trim().slice(0, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Prestataire manquant.');
  const db = getFirestore();
  const ref = db.collection('artisans').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Fiche prestataire introuvable.');
  const a = snap.data() || {};
  // Ne jamais relancer quelqu'un qui a terminé : ce serait le message le plus décourageant.
  if (a.mollieStatus === 'active') return {sent: false, reason: 'active'};
  // Ni quelqu'un qui n'a plus rien à faire : Mollie l'autorise déjà à encaisser et son
  // dossier ne réclame aucune pièce — il attend simplement la validation. Le relancer
  // serait un reproche sans objet.
  if (a.mollieCanWork === true && a.mollieOnboardingStatus !== 'needs-data') {
    return {sent: false, reason: 'attente-mollie'};
  }
  let email = a.email || '';
  if (!email) {
    try { email = ((await db.collection('users').doc(uid).get()).data() || {}).email || ''; } catch (_) {}
  }
  if (!email) throw new HttpsError('failed-precondition', 'Aucune adresse e-mail connue pour ce prestataire.');
  const n = (Number(a.mollieRelances) || 0) + 1;
  const attachments = [];
  try {
    const logo = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png'));
    attachments.push({filename: 'ti-services.png', content: logo, cid: 'tilogo'});
  } catch (_) {}
  const ok = await sendMail(db, email, {
    subject: 'Il te reste une étape pour recevoir des missions',
    html: mollieReminderHtml(String(a.name || '').trim(), n),
    attachments,
  });
  if (!ok) throw new HttpsError('internal', 'L\'envoi a échoué — réessayez.');
  try { await ref.set({mollieRelances: n, mollieRelanceAt: Date.now()}, {merge: true}); } catch (_) {}
  return {sent: true, email: email, relances: n};
});

/**
 * releaseHoldOnDelete : rend au client la somme RÉSERVÉE quand sa demande disparaît.
 *
 * L'empreinte est posée à la commande, avant même qu'un prestataire voie la demande —
 * c'est ce qui garantit le paiement. Mais quand le client annulait (ou qu'une demande
 * était supprimée pour une autre raison), on effaçait la demande sans rien dire à
 * Mollie : la somme restait immobilisée sur sa carte jusqu'à expiration de
 * l'autorisation, plusieurs jours plus tard, sans explication. Sur un déménagement,
 * c'est plusieurs centaines d'euros bloqués pour rien.
 *
 * On se branche sur la SUPPRESSION plutôt que sur le bouton « Annuler » : tous les
 * chemins passent par là, présents et futurs, et il n'y a pas de course entre le
 * client qui efface et le serveur qui libère.
 *
 * Deux cas volontairement épargnés :
 *  - un paiement déjà capturé (prestation réglée) — il n'y a plus rien à libérer ;
 *  - une annulation tardive, qui ne supprime PAS la demande (le prestataire décide de
 *    l'indemnité) — l'empreinte doit rester en place pour pouvoir la prélever.
 */
exports.releaseHoldOnDelete = onDocumentDeleted({document: 'requests/{reqId}', secrets: ['MOLLIE_ACCESS_TOKEN']}, async (event) => {
  const reqId = event.params.reqId;
  const r = (event.data && typeof event.data.data === 'function' && event.data.data()) || {};
  const id = r.molliePaymentId || '';
  if (!id || !mollieApiConfigured()) return;
  if (r.mollieCaptured) return;   // déjà débité : plus rien à rendre
  try {
    const p = await mollieApi('/payments/' + encodeURIComponent(id), 'GET');
    const st = (p.ok && p.data) ? (p.data.status || '') : '';
    if (['open', 'pending', 'authorized'].indexOf(st) < 0) return;   // rien de retenu
    if (p.data.isCancelable === false) {
      // Mollie refuse l'annulation : l'argent se libérera à l'expiration, mais on ne
      // laisse PAS ça passer en silence — l'admin doit pouvoir prévenir le client.
      console.warn('Empreinte non libérable reqId=' + reqId + ' ' + id + ' (' + st + ')');
      try {
        await sendMail(getFirestore(), ADMIN_EMAIL, {
          subject: 'Empreinte à libérer à la main — demande annulée',
          html: '<p>Une demande a été annulée, mais Mollie refuse d\'annuler l\'autorisation : la somme reste réservée sur la carte du client jusqu\'à expiration.</p>'
            + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
            + '<li><b>Paiement :</b> ' + escHtmlS(id) + ' (' + escHtmlS(st) + ')</li>'
            + '<li><b>Montant réservé :</b> ' + eurTxt(Number(r.molliePaymentAmount) || 0) + '</li></ul>'
            + '<p>À faire : annuler le paiement depuis le tableau de bord Mollie, et prévenir le client.</p>',
        });
      } catch (_) {}
      return;
    }
    const del = await mollieApi('/payments/' + encodeURIComponent(id), 'DELETE');
    console.log('Empreinte rendue reqId=' + reqId + ' ' + id + ' (' + st + ') — ' + (del.ok ? 'ok' : 'échec'));
  } catch (e) { console.warn('releaseHoldOnDelete', e); }
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


/* ============================================================
   AGENDA PERSO (iCal) — chaque prestataire dispose d'un flux privé
   listant ses missions Ti-Services, à ABONNER dans Google Agenda ou
   Apple Calendrier (et donc visible dans Planity si le prestataire a
   activé la synchro Google côté Planity). L'URL porte un JETON secret
   (crypto), révocable en régénérant le lien. Le flux ne contient
   AUCUNE donnée sensible : service, prénom du client, secteur —
   les détails (adresse exacte, téléphone) restent dans l'application.
   ============================================================ */
function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// Événements → texte iCalendar. Heures LOCALES de Saint-Barthélemy (UTC−4, sans
// heure d'été) converties en UTC — affichage correct dans tous les agendas.
function buildIcs(events) {
  const utc = (ms) => {
    const d = new Date(ms);
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + '00Z';
  };
  const stamp = utc(Date.now());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ti-Services//Agenda prestataire//FR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Ti-Services', 'X-WR-TIMEZONE:America/St_Barthelemy'];
  (events || []).forEach((ev) => {
    L.push('BEGIN:VEVENT', 'UID:' + ev.id + '@ti-services.fr', 'DTSTAMP:' + stamp);
    if (ev.allDay) {
      const day = ev.dateISO.replace(/-/g, '');
      const next = new Date(Date.parse(ev.dateISO + 'T12:00:00Z') + 24 * 3600 * 1000);
      const p = (n) => (n < 10 ? '0' : '') + n;
      L.push('DTSTART;VALUE=DATE:' + day,
        'DTEND;VALUE=DATE:' + next.getUTCFullYear() + p(next.getUTCMonth() + 1) + p(next.getUTCDate()));
    } else {
      const start = Date.parse(ev.dateISO + 'T' + (ev.slot.length < 5 ? '0' : '') + ev.slot + ':00-04:00');
      L.push('DTSTART:' + utc(start), 'DTEND:' + utc(start + (ev.hours || 1) * 3600 * 1000));
    }
    L.push('SUMMARY:' + icsEscape(ev.summary), 'LOCATION:' + icsEscape(ev.location || ''),
      'DESCRIPTION:' + icsEscape(ev.description || ''), 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

// Crée (ou régénère avec {rotate:true}) le lien d'agenda privé du prestataire connecté.
exports.getIcalUrl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const uid = request.auth.uid;
  const db = getFirestore();
  const ref = db.collection('artisans').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Profil prestataire introuvable.');
  let tok = (snap.data() || {}).icalToken || '';
  const rotate = !!(request.data && request.data.rotate);
  if (!tok || rotate) {
    const old = tok;
    tok = require('crypto').randomBytes(24).toString('base64url');
    await ref.set({ icalToken: tok }, { merge: true });
    await db.collection('icalTokens').doc(tok).set({ uid: uid, createdAt: FieldValue.serverTimestamp() });
    if (old) { try { await db.collection('icalTokens').doc(old).delete(); } catch (_) {} }
  } else {
    await db.collection('icalTokens').doc(tok).set({ uid: uid }, { merge: true });
  }
  // Via la réécriture Hosting (firebase.json) : une adresse au nom de ti-services.fr,
  // rassurante et cohérente (l'ancienne adresse cloudfunctions.net reste servie).
  return { url: 'https://ti-services.fr/icalFeed?t=' + tok };
});

// Le flux lui-même : text/calendar, authentifié par le jeton porteur de l'URL.
exports.icalFeed = onRequest(async (req, res) => {
  try {
    const tok = String((req.query && req.query.t) || '');
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(tok)) { res.status(404).send('Introuvable'); return; }
    const db = getFirestore();
    const map = await db.collection('icalTokens').doc(tok).get();
    const uid = map.exists ? (map.data() || {}).uid : null;
    if (!uid) { res.status(404).send('Introuvable'); return; }
    const snap = await db.collection('requests').where('providerUid', '==', uid).limit(500).get();
    const keep = { accepted: 1, done_pro: 1, completed: 1, paid: 1 };
    const cutoff = Date.now() - 60 * 24 * 3600 * 1000; // 60 jours d'historique
    const events = [];
    snap.forEach((doc) => {
      const r = doc.data() || {};
      if (!keep[r.status]) return;
      const dateISO = r.dateISO || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return;
      const t = Date.parse(dateISO + 'T12:00:00Z');
      if (isFinite(t) && t < cutoff) return;
      const slot = /^\d{1,2}:\d{2}$/.test(r.acceptedSlot || '') ? r.acceptedSlot
        : (/^\d{1,2}:\d{2}$/.test(r.slot || '') ? r.slot : '09:00');
      const allDay = r.unit === 'j';
      const hours = Math.max(1, Math.min(12, Number(r.duration) || 1));
      const first = (((r.clientName || '').trim().split(/\s+/)[0]) || 'Client');
      const salon = r.locationMode === 'salon';
      events.push({
        id: doc.id, dateISO: dateISO, slot: slot, hours: hours, allDay: allDay,
        summary: 'Ti-Services — ' + (r.serviceName || r.service || 'Mission') + ' · ' + first,
        location: salon ? 'Votre salon / studio' : (r.zone || 'Saint-Barthélemy'),
        description: 'Réservation Ti-Services' + (r.zone ? ' · ' + r.zone : '') + ' — détails dans l’application.'
      });
    });
    events.sort((a, b) => (a.dateISO + a.slot).localeCompare(b.dateISO + b.slot));
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=300');
    res.status(200).send(buildIcs(events));
  } catch (e) {
    console.error('icalFeed', e);
    res.status(500).send('Erreur');
  }
});

/* ============================================================
   AGENDA GOOGLE (OAuth) — le prestataire connecte son Google Agenda :
   1) LECTURE des créneaux occupés (freeBusy) → alerte « conflit possible »
      sur la fiche mission AVANT d'accepter ;
   2) ÉCRITURE automatique : mission acceptée → événement dans son agenda
      (et suppression si la mission est annulée). Comme Planity sait se
      synchroniser avec Google Agenda, la boucle se ferme sans toucher Planity.
   Config Google Cloud (une fois, projet t-service-prod) :
   - Écran de consentement + client OAuth « Web » avec l'URI de redirection
     https://europe-west1-t-service-prod.cloudfunctions.net/gcalOAuthReturn
   - remplacer GCAL_CLIENT_ID ci-dessous ;
   - secret : firebase functions:secrets:set GCAL_OAUTH_SECRET
   Jetons de rafraîchissement dans gcalTokens/{uid} (serveur uniquement).
   ============================================================ */
const GCAL_CLIENT_ID = '616112558398-hrcn1vp27gfv69ssqclkkamq2va78a97.apps.googleusercontent.com';
const GCAL_OAUTH_SECRET = defineSecret('GCAL_OAUTH_SECRET');
const GCAL_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';
function gcalConfigured() { return GCAL_CLIENT_ID.indexOf('A_CONFIGURER') < 0; }
function gcalRedirectUri() {
  // Via la réécriture Hosting (firebase.json) : l'autorisation Google s'affiche au nom
  // de ti-services.fr — pas du domaine technique cloudfunctions.net (anxiogène).
  return 'https://ti-services.fr/gcalOAuthReturn';
}
// Fenêtre d'une mission en ISO avec fuseau de Saint-Barthélemy (UTC−4, sans heure d'été).
function gcalWindow(dateISO, slot, hours) {
  const s = /^\d{1,2}:\d{2}$/.test(slot || '') ? ((slot.length < 5 ? '0' : '') + slot) : '09:00';
  const start = dateISO + 'T' + s + ':00-04:00';
  const endMs = Date.parse(start) + Math.max(1, Math.min(12, Number(hours) || 1)) * 3600 * 1000;
  // Fin reformatée en heure LOCALE (UTC−4) : on retire l'offset pour réutiliser les getters UTC.
  const loc = new Date(endMs - 4 * 3600 * 1000);
  const p = (n) => (n < 10 ? '0' : '') + n;
  const end = loc.getUTCFullYear() + '-' + p(loc.getUTCMonth() + 1) + '-' + p(loc.getUTCDate())
    + 'T' + p(loc.getUTCHours()) + ':' + p(loc.getUTCMinutes()) + ':00-04:00';
  return { timeMin: start, timeMax: end };
}
async function gcalAccessToken(uid) {
  const db = getFirestore();
  const doc = await db.collection('gcalTokens').doc(uid).get();
  const refresh = doc.exists ? (doc.data() || {}).refresh : null;
  if (!refresh) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GCAL_CLIENT_ID, client_secret: GCAL_OAUTH_SECRET.value(), refresh_token: refresh, grant_type: 'refresh_token' }).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    // Accès révoqué côté Google : on nettoie pour que l'app repasse en « non connecté ».
    if (j && j.error === 'invalid_grant') {
      try { await db.collection('gcalTokens').doc(uid).delete(); } catch (_) {}
      try { await db.collection('artisans').doc(uid).set({ gcalOn: false }, { merge: true }); } catch (_) {}
    }
    return null;
  }
  return j.access_token;
}

// URL de consentement pour l'artisan connecté (état signé, 15 min).
exports.gcalAuthUrl = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (!gcalConfigured()) throw new HttpsError('failed-precondition', 'Connexion Google Agenda pas encore configurée.');
  const uid = request.auth.uid;
  const db = getFirestore();
  const art = await db.collection('artisans').doc(uid).get();
  if (!art.exists) throw new HttpsError('failed-precondition', 'Profil prestataire introuvable.');
  const state = require('crypto').randomBytes(24).toString('base64url');
  await db.collection('gcalStates').doc(state).set({ uid: uid, exp: Date.now() + 15 * 60 * 1000 });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GCAL_CLIENT_ID, redirect_uri: gcalRedirectUri(), response_type: 'code',
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    scope: GCAL_SCOPES, state: state
  }).toString();
  return { url: url };
});

// Retour du consentement Google : échange du code, stockage du refresh token.
exports.gcalOAuthReturn = onRequest({ secrets: [GCAL_OAUTH_SECRET] }, async (req, res) => {
  const back = 'https://ti-services.fr/';
  try {
    const state = String(req.query.state || '');
    const code = String(req.query.code || '');
    const db = getFirestore();
    const st = state ? await db.collection('gcalStates').doc(state).get() : null;
    const uid = (st && st.exists && (st.data() || {}).exp > Date.now()) ? (st.data() || {}).uid : null;
    if (state) { try { await db.collection('gcalStates').doc(state).delete(); } catch (_) {} }
    if (!uid || !code) { res.redirect(back + '?gcal=err'); return; }
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GCAL_CLIENT_ID, client_secret: GCAL_OAUTH_SECRET.value(), code: code, grant_type: 'authorization_code', redirect_uri: gcalRedirectUri() }).toString()
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.refresh_token) { console.error('gcalOAuthReturn: échange', j); res.redirect(back + '?gcal=err'); return; }
    // e-mail Google (informatif) depuis l'id_token — payload non vérifié : affichage seulement.
    let email = '';
    try { email = JSON.parse(Buffer.from(String(j.id_token || '').split('.')[1] || '', 'base64').toString('utf8')).email || ''; } catch (_) {}
    await db.collection('gcalTokens').doc(uid).set({ refresh: j.refresh_token, email: email, updatedAt: FieldValue.serverTimestamp() });
    await db.collection('artisans').doc(uid).set({ gcalOn: true, gcalEmail: email }, { merge: true });
    res.redirect(back + '?gcal=ok');
  } catch (e) { console.error('gcalOAuthReturn', e); res.redirect(back + '?gcal=err'); }
});

// Déconnexion : révoque le jeton côté Google et nettoie.
exports.gcalDisconnect = onCall({ secrets: [GCAL_OAUTH_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const uid = request.auth.uid;
  const db = getFirestore();
  const doc = await db.collection('gcalTokens').doc(uid).get();
  const refresh = doc.exists ? (doc.data() || {}).refresh : null;
  if (refresh) {
    try { await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(refresh), { method: 'POST' }); } catch (_) {}
  }
  try { await db.collection('gcalTokens').doc(uid).delete(); } catch (_) {}
  await db.collection('artisans').doc(uid).set({ gcalOn: false, gcalEmail: '' }, { merge: true });
  return { ok: true };
});

// Créneaux occupés autour d'une mission : alerte « conflit possible » avant d'accepter.
exports.gcalFreeBusy = onCall({ secrets: [GCAL_OAUTH_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const uid = request.auth.uid;
  const d = request.data || {};
  const tok = await gcalAccessToken(uid);
  // Occupations d'une fenêtre : Google (si connecté) + « autres agendas » (liens iCal).
  const busyFor = async (w) => {
    let busy = [];
    if (tok) {
      const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: w.timeMin, timeMax: w.timeMax, items: [{ id: 'primary' }] })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) busy = (((j.calendars || {}).primary || {}).busy || []).slice(0, 5);
    }
    (await extCalsBusy(uid, Date.parse(w.timeMin), Date.parse(w.timeMax))).forEach((b) => busy.push(b));
    return busy.slice(0, 8);
  };
  const hasExt = (((await getFirestore().collection('artisans').doc(uid).get()).data() || {}).extCals || []).length > 0;
  if (!tok && !hasExt) return { connected: false };
  // Mode LISTE (badges de la liste des missions) : jusqu'à 20 fenêtres, un drapeau chacune.
  if (Array.isArray(d.windows)) {
    const results = [];
    for (const win of d.windows.slice(0, 20)) {
      const dateISO = String((win || {}).dateISO || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) { results.push({ conflict: false }); continue; }
      const busy = await busyFor(gcalWindow(dateISO, win.slot, win.hours));
      results.push({ conflict: busy.length > 0 });
    }
    return { connected: true, results: results };
  }
  const dateISO = String(d.dateISO || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new HttpsError('invalid-argument', 'Date invalide.');
  const busy = await busyFor(gcalWindow(dateISO, d.slot, d.hours));
  return { connected: true, conflict: busy.length > 0, busy: busy };
});

/* ── Autres agendas (import iCal inverse) : le prestataire colle le lien iCal exporté
   par SA plateforme (Planity via Google, Fresha, Calendly, iCloud partagé, Outlook…) —
   Ti-Services lit ses créneaux occupés quelle que soit la plateforme. ── */
// Analyse minimale d'un flux iCalendar : rend les intervalles occupés [start,end] (ms)
// chevauchant la fenêtre. Formats gérés : UTC (…Z), heure locale/TZID (traitée en heure
// de Saint-Barthélemy, UTC−4 — le public visé est local), et VALUE=DATE (journée entière).
// Les récurrences (RRULE) ne sont pas développées : limite acceptée en v1.
function parseIcsBusy(text, fromMs, toMs) {
  const busy = [];
  const chunks = String(text || '').split('BEGIN:VEVENT').slice(1);
  const parseDt = (line) => {
    const v = line.split(':').pop().trim();
    if (/^\d{8}$/.test(v)) return { ms: Date.parse(v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8) + 'T00:00:00-04:00'), allDay: true };
    const m = v.match(/^(\d{8})T(\d{6})(Z?)$/);
    if (!m) return null;
    const iso = m[1].slice(0, 4) + '-' + m[1].slice(4, 6) + '-' + m[1].slice(6, 8) + 'T' + m[2].slice(0, 2) + ':' + m[2].slice(2, 4) + ':' + m[2].slice(4, 6) + (m[3] ? 'Z' : '-04:00');
    return { ms: Date.parse(iso), allDay: false };
  };
  for (const c of chunks) {
    const body = c.split('END:VEVENT')[0];
    // lignes dépliées (continuation par espace) puis repérage DTSTART/DTEND
    const lines = body.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    let ds = null, de = null;
    for (const l of lines) {
      if (/^DTSTART/i.test(l)) ds = parseDt(l);
      else if (/^DTEND/i.test(l)) de = parseDt(l);
    }
    if (!ds || !isFinite(ds.ms)) continue;
    let end = (de && isFinite(de.ms)) ? de.ms : (ds.allDay ? ds.ms + 24 * 3600 * 1000 : ds.ms + 3600 * 1000);
    if (ds.allDay && de && de.allDay) end = de.ms; // DTEND exclusif déjà au lendemain
    if (end > fromMs && ds.ms < toMs) busy.push({ start: new Date(Math.max(ds.ms, fromMs)).toISOString(), end: new Date(Math.min(end, toMs)).toISOString() });
    if (busy.length >= 20) break;
  }
  return busy;
}
async function extCalsBusy(uid, fromMs, toMs) {
  const db = getFirestore();
  let urls = [];
  try { urls = ((await db.collection('artisans').doc(uid).get()).data() || {}).extCals || []; } catch (_) {}
  const out = [];
  for (const u of urls.slice(0, 3)) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(u, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const txt = await r.text();
      if (txt.indexOf('BEGIN:VCALENDAR') < 0) continue;
      parseIcsBusy(txt, fromMs, toMs).forEach((b) => out.push(b));
    } catch (_) {}
  }
  return out;
}

// Enregistre les liens iCal des « autres agendas » du prestataire (3 max, validés).
exports.setExtCals = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const db = getFirestore();
  const art = await db.collection('artisans').doc(request.auth.uid).get();
  if (!art.exists) throw new HttpsError('failed-precondition', 'Profil prestataire introuvable.');
  const raw = Array.isArray((request.data || {}).urls) ? request.data.urls : [];
  const urls = [];
  for (let u of raw.slice(0, 3)) {
    u = String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
    if (!/^https:\/\/[^\s]{8,500}$/i.test(u)) continue;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(u, { signal: ctl.signal });
      clearTimeout(t);
      const txt = r.ok ? (await r.text()).slice(0, 200000) : '';
      if (txt.indexOf('BEGIN:VCALENDAR') >= 0) urls.push(u);
    } catch (_) {}
  }
  if (raw.length && !urls.length) throw new HttpsError('invalid-argument', "Ce lien ne renvoie pas un calendrier iCal — vérifiez l'adresse (elle finit souvent par .ics).");
  await db.collection('artisans').doc(request.auth.uid).set({ extCals: urls }, { merge: true });
  return { ok: true, count: urls.length };
});

/* ── Annuaire public des prestataires d'un métier : le client peut viser un prestataire
   PRÉCIS dès la première commande (défaut : « le premier disponible »). On n'expose que
   le profil public — jamais téléphone, e-mail ou adresse exacte. ── */
exports.listProviders = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const svc = String((request.data || {}).service || '').slice(0, 40);
  if (!svc) throw new HttpsError('invalid-argument', 'Service requis.');
  const db = getFirestore();
  const snap = await db.collection('artisans').where('status', '==', 'valide').get();
  const out = [];
  snap.docs.forEach((doc) => {
    const a = doc.data() || {};
    if ((a.cats || []).indexOf(svc) < 0) return;
    out.push({
      uid: doc.id,
      name: String(a.name || 'Prestataire').slice(0, 60),
      // Photo de profil (vignette recadrée par l'app) — bornée pour la taille de réponse.
      photo: (typeof a.photo === 'string' && a.photo.indexOf('data:image') === 0 && a.photo.length < 90000) ? a.photo : null,
      jobs: Number(a.jobsTotal) || 0,
      founder: !!a.founder,
      siteMode: a.siteMode || 'both',
      salonZone: String(a.salonZone || '').slice(0, 40),
      cal: ((a.extCals || []).length > 0)
    });
  });
  // Agenda vérifiable ? (Google connecté compte aussi — collection serveur gcalTokens.)
  await Promise.all(out.map(async (p) => {
    if (p.cal) return;
    try { p.cal = (await db.collection('gcalTokens').doc(p.uid).get()).exists; } catch (_) {}
  }));
  out.sort((x, y) => (Number(y.founder) - Number(x.founder)) || (y.jobs - x.jobs));
  // Le nombre de missions sert au TRI côté serveur mais ne sort JAMAIS vers le client
  // (le client ne doit pas voir les volumes d'activité des prestataires).
  return { providers: out.slice(0, 20).map((p) => ({ uid: p.uid, name: p.name, photo: p.photo, founder: p.founder, siteMode: p.siteMode, salonZone: p.salonZone, cal: p.cal })) };
});

/* ── Créneaux réellement libres d'un prestataire pour UNE journée : le client qui vise
   un prestataire précis voit quelles heures sont réellement disponibles. Sources :
   agenda Google, liens iCal externes, missions Ti-Services déjà acceptées ce jour-là.
   Réponse : un booléen libre/occupé par créneau — jamais le détail des rendez-vous. ── */
exports.providerSlots = onCall({ secrets: [GCAL_OAUTH_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const d = request.data || {};
  const uid = String(d.providerUid || '').slice(0, 128);
  const dateISO = String(d.dateISO || '');
  if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) throw new HttpsError('invalid-argument', 'Paramètres invalides.');
  const slots = (Array.isArray(d.slots) ? d.slots : []).slice(0, 48)
    .map((s) => String(s || '')).filter((s) => /^\d{1,2}:\d{2}$/.test(s));
  const hours = Math.min(12, Math.max(1, Number(d.hours) || 1));
  const db = getFirestore();
  const fromMs = Date.parse(dateISO + 'T00:00:00-04:00');
  const toMs = fromMs + 24 * 3600 * 1000;
  const busy = [];
  // 1) Agenda Google du prestataire (une seule requête pour la journée entière).
  const tok = await gcalAccessToken(uid);
  if (tok) {
    try {
      const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), items: [{ id: 'primary' }] })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) (((j.calendars || {}).primary || {}).busy || []).slice(0, 20).forEach((b) => busy.push(b));
    } catch (_) {}
  }
  // 2) Autres agendas (liens iCal — Planity via Google, Fresha, Calendly…).
  (await extCalsBusy(uid, fromMs, toMs)).forEach((b) => busy.push(b));
  const hasExt = ((((await db.collection('artisans').doc(uid).get()).data() || {}).extCals) || []).length > 0;
  // 3) Missions Ti-Services déjà acceptées ce jour-là (toujours prises en compte).
  try {
    const reqs = await db.collection('requests')
      .where('providerUid', '==', uid).where('dateISO', '==', dateISO).get();
    reqs.docs.forEach((doc) => {
      const q = doc.data() || {};
      if (['accepted', 'working'].indexOf(q.status) < 0) return;
      const sl = String(q.acceptedSlot || q.slot || '09:00');
      const st = Date.parse(dateISO + 'T' + (sl.length < 5 ? '0' : '') + sl + ':00-04:00');
      if (!isFinite(st)) return;
      const dur = (q.unit === 'j') ? 8 : Math.max(1, Number(q.duration) || 1);
      busy.push({ start: new Date(st).toISOString(), end: new Date(st + dur * 3600 * 1000).toISOString() });
    });
  } catch (_) {}
  const free = {};
  slots.forEach((s) => {
    const st = Date.parse(dateISO + 'T' + (s.length < 5 ? '0' : '') + s + ':00-04:00');
    const en = st + hours * 3600 * 1000;
    free[s] = !busy.some((b) => Date.parse(b.start) < en && Date.parse(b.end) > st);
  });
  return { cal: (!!tok || hasExt), free: free };
});

// Mission acceptée → événement dans l'agenda Google du prestataire ; annulée → retiré.
exports.gcalSyncEvent = onDocumentUpdated({ document: 'requests/{reqId}', secrets: [GCAL_OAUTH_SECRET] }, async (event) => {
  if (!gcalConfigured()) return;
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  if (before.status === after.status) return;
  const uid = after.providerUid;
  if (!uid) return;
  const db = getFirestore();
  const reqId = event.params.reqId;
  // Acceptation : insertion (une seule fois).
  if (after.status === 'accepted') {
    const tok = await gcalAccessToken(uid);
    if (!tok) return;
    const seen = await db.collection('gcalEvents').doc(reqId).get();
    if (seen.exists) return;
    const dateISO = after.dateISO || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return;
    const slot = after.acceptedSlot || after.slot || '09:00';
    const first = (((after.clientName || '').trim().split(/\s+/)[0]) || 'Client');
    const salon = after.locationMode === 'salon';
    let body;
    if (after.unit === 'j') {
      const next = new Date(Date.parse(dateISO + 'T12:00:00Z') + 24 * 3600 * 1000);
      const p = (n) => (n < 10 ? '0' : '') + n;
      const nd = next.getUTCFullYear() + '-' + p(next.getUTCMonth() + 1) + '-' + p(next.getUTCDate());
      body = { start: { date: dateISO }, end: { date: nd } };
    } else {
      const w = gcalWindow(dateISO, slot, after.duration);
      body = { start: { dateTime: w.timeMin, timeZone: 'America/St_Barthelemy' }, end: { dateTime: w.timeMax, timeZone: 'America/St_Barthelemy' } };
    }
    body.summary = 'Ti-Services — ' + (after.serviceName || after.service || 'Mission') + ' · ' + first;
    body.location = salon ? 'Votre salon / studio' : (after.zone || 'Saint-Barthélemy');
    body.description = 'Réservation Ti-Services — détails dans l’application.';
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.id) {
      await db.collection('gcalEvents').doc(reqId).set({ uid: uid, eventId: j.id, createdAt: FieldValue.serverTimestamp() });
      console.log('gcalSyncEvent: événement créé pour ' + reqId);
    } else { console.error('gcalSyncEvent: insertion', j); }
    return;
  }
  // Annulation après acceptation : on retire l'événement.
  if (after.status === 'cancelled' || after.status === 'declined') {
    const seen = await db.collection('gcalEvents').doc(reqId).get();
    if (!seen.exists) return;
    const ev = seen.data() || {};
    const tok = await gcalAccessToken(ev.uid || uid);
    if (tok && ev.eventId) {
      try { await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(ev.eventId), { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + tok } }); } catch (_) {}
    }
    try { await db.collection('gcalEvents').doc(reqId).delete(); } catch (_) {}
    console.log('gcalSyncEvent: événement retiré pour ' + reqId);
  }
});

// Export interne pour les tests unitaires (inerte en production : TI_TEST non défini).
if (process.env.TI_TEST) { module.exports.__test = { buildInvoicePdf, buildProcurationPdf, invoiceLines, eurTxt, frDate, welcomeHtml, inviteArtisanHtml, approvedArtisanHtml, resetPasswordEmail, buildIcs, icsEscape, gcalWindow, parseIcsBusy }; }
