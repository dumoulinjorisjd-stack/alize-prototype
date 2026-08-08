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
// ============================================================================
// CHARTE E-MAIL — aucun message ne part « nu ». Les gabarits soignés (bienvenue,
// invitation…) portent déjà la charte complète (repérable à leur logo cid:tilogo) ;
// tout autre HTML est enveloppé ici dans le même écrin : bandeau dégradé, logo,
// nom Ti-Services, carte blanche, pied C.C.S. Branché DANS sendMail pour couvrir
// aussi les e-mails futurs.
let _tiLogoBuf;
function tiLogoAttachment() {
  if (_tiLogoBuf === undefined) {
    try { _tiLogoBuf = require('fs').readFileSync(require('path').join(__dirname, 'mail-logo.png')); } catch (_) { _tiLogoBuf = null; }
  }
  return _tiLogoBuf ? {filename: 'ti-services.png', content: _tiLogoBuf, cid: 'tilogo'} : null;
}
function tiCharteHtml(inner) {
  // Le pied signe déjà « L'équipe Ti-Services » : on retire la signature du corps
  // brut pour ne pas la voir deux fois.
  const body = String(inner || '').replace(/<p>(?:À très vite,\s*<br\s*\/?>\s*)?L'équipe Ti-Services\s*\.?<\/p>\s*$/, '');
  return '' +
  '<div style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#231E33">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F4;padding:24px 12px">' +
      '<tr><td align="center">' +
        '<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden">' +
          '<tr><td style="height:6px;background:linear-gradient(90deg,#FF6A5B,#FF9F54)"></td></tr>' +
          '<tr><td align="center" style="padding:26px 30px 4px">' +
            '<img src="cid:tilogo" width="60" height="60" alt="Ti-Services" style="display:block;border-radius:16px;margin:0 auto 10px">' +
            '<div style="font-size:24px;font-weight:800;letter-spacing:-.02em"><span style="color:#FF6A5B">Ti</span><span style="color:#231E33">-Services</span></div>' +
            '<div style="font-size:12px;color:#8a8494;margin-top:2px">Services à la demande · Saint-Barthélemy</div>' +
          '</td></tr>' +
          '<tr><td style="padding:14px 30px 6px"><div style="font-size:15px;line-height:1.6;color:#4a4556">' + body + '</div></td></tr>' +
          '<tr><td align="center" style="padding:14px 30px 26px">' +
            '<a href="' + APP_URL.replace(/\/$/, '') + '" style="display:inline-block;background:#FF6A5B;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:11px">Ouvrir Ti-Services</a>' +
          '</td></tr>' +
          '<tr><td style="padding:16px 30px;border-top:1px solid #efeae4;background:#FBF7F4">' +
            '<div style="font-size:12px;color:#8a8494;line-height:1.6">L\'équipe Ti-Services<br>' +
            '<span style="color:#b0aab8">Service édité par C.C.S — Construction Conseils et Services, SAS · Saint-Barthélemy</span></div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>' +
    '</table>' +
  '</div>';
}
function tiCharteMessage(message) {
  if (!message || !message.html) return message;
  let m = message;
  if (m.html.indexOf('cid:tilogo') < 0) m = Object.assign({}, m, {html: tiCharteHtml(m.html)});
  // Le logo doit accompagner tout gabarit qui le référence (y compris ceux qui
  // avaient oublié la pièce jointe : l'image apparaissait cassée).
  const deja = (Array.isArray(m.attachments) ? m.attachments : []).some((a) => a && a.cid === 'tilogo');
  if (!deja) {
    const lg = tiLogoAttachment();
    if (lg) m = Object.assign({}, m, {attachments: (Array.isArray(m.attachments) ? m.attachments : []).concat([lg])});
  }
  return m;
}
async function sendMail(db, to, message) {
  message = tiCharteMessage(message);
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
// Motif du dernier refus de routage, relevé juste après l'appel (le versement se joue
// dans un seul fil : pas de course possible).
let _routeMotif = '';
function routeMotif() { return _routeMotif; }
async function mollieRouteNet(molliePaymentId, orgId, netAmount, label) {
  _routeMotif = '';
  if (!mollieApiConfigured() || !molliePaymentId || !orgId || !(netAmount > 0)) {
    _routeMotif = !molliePaymentId ? 'aucun paiement Mollie sur la demande'
      : !orgId ? 'aucune organisation Mollie pour ce prestataire'
        : !(netAmount > 0) ? 'net à verser nul' : 'Mollie non configuré';
    return false;
  }
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
    if (!res.ok) {
      // LA RAISON DU REFUS, CONSERVÉE. « routage refusé par Mollie » n'apprend rien et
      // laisse chercher à l'aveugle — on a déjà perdu des jours ainsi sur la carte
      // bancaire. Mollie explique son refus : on garde son explication.
      const txt = await res.text();
      let motif = '';
      try { const j = JSON.parse(txt); motif = j.detail || j.title || ''; } catch (_) { motif = (txt || '').slice(0, 200); }
      console.warn('mollieRouteNet HTTP', res.status, txt);
      _routeMotif = 'HTTP ' + res.status + (motif ? (' — ' + String(motif).slice(0, 220)) : '');
      return false;
    }
    _routeMotif = '';
    return true;
  } catch (e) { console.warn('mollieRouteNet', e); _routeMotif = String((e && e.message) || e).slice(0, 220); return false; }
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
    metadata: {reqId: reqId, clientUid: clientUid, kind: 'complement', produit: PRODUIT},
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
    {redirectUrl: app + '/?paid=' + encodeURIComponent(reqId), method: 'creditcard'},
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
// Commission due sur un SUPPLÉMENT encaissé : celle du pourboire qu'il transporte, figée
// dans `complementCommission` au règlement de la prestation. Repli (suppléments réglés
// avant cette règle) : recalcul au taux figé de la prestation — jamais plus que le
// supplément lui-même. Sans elle, le supplément était reversé EN ENTIER : les frais
// bancaires de ce second paiement restaient à la charge de Ti-Services, et la route
// portait 100 % du paiement.
function commissionDuComplement(r, montant) {
  r = r || {};
  let com;
  if (r.complementCommission != null) com = round2(Number(r.complementCommission) || 0);
  else {
    const tip = Math.max(0, round2(Number(r.tip) || 0));
    const pct = Number(r.commissionPct) || 0;
    com = round2(Math.min(tip, montant) * pct / 100);
  }
  return Math.max(0, Math.min(com, montant));
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
// LES COMPTES SE CALQUENT SUR MOLLIE, PAS SUR CE QUE L'APPLICATION CROIT. On interroge le
// paiement chez Mollie et on inscrit son ÉTAT RÉEL au registre :
//   • `mollieStatus` — ce que Mollie répond (paid, authorized, expired, failed, canceled…) ;
//   • `mollieEncaisse` — vrai UNIQUEMENT si Mollie dit « paid ». C'est ce champ, et lui
//     seul, qui fait entrer une prestation dans la comptabilité. Une empreinte simplement
//     autorisée (essai, mission jamais capturée) porte un identifiant de paiement mais
//     n'a jamais débité personne : elle ne doit pas peser dans les comptes ;
//   • `mollieMontantPaye` — la somme RÉELLEMENT capturée (jamais l'autorisation) ;
//   • `mollieFee` / `netTiServices` — dès que Mollie connaît son règlement (1 à 2 jours).
// Renvoie true quand l'état a pu être relevé.
// LECTURE DU REGISTRE — SANS INDEX COMPOSITE. La requête « type == commission ORDER BY
// settledAt » réclame un index composite que le projet ne déclare pas : elle échouait donc
// systématiquement (FAILED_PRECONDITION), silencieusement là où elle était sous try/catch —
// et le rapprochement Mollie ne s'est jamais fait. On trie sur un seul champ (index
// automatique) et on filtre le type en mémoire : même résultat, aucun index à créer,
// aucune attente de construction.
async function lireRegistre(db, n) {
  const snap = await db.collection('ledger').orderBy('settledAt', 'desc').limit(n || 300).get();
  return snap.docs.filter((d) => ((d.data() || {}).type || 'commission') === 'commission');
}
async function recordMollieFee(db, reqId, molliePaymentId, commission) {
  if (!mollieApiConfigured() || !molliePaymentId) return false;
  try {
    const p = await mollieApi('/payments/' + encodeURIComponent(molliePaymentId), 'GET');
    if (!p.ok || !p.data) return false;
    const d = p.data;
    const statut = String(d.status || '');
    // Capture partielle : `amount` reste l'autorisation, `amountCaptured` est le débit réel.
    const capture = (d.amountCaptured && d.amountCaptured.value != null) ? Number(d.amountCaptured.value) : null;
    const autorise = (d.amount && d.amount.value != null) ? Number(d.amount.value) : null;
    const paye = (capture != null && !isNaN(capture)) ? capture : autorise;
    const patch = {
      mollieStatus: statut,
      mollieEncaisse: (statut === 'paid'),
      mollieVerifieAt: FieldValue.serverTimestamp(),
    };
    if (paye != null && !isNaN(paye)) patch.mollieMontantPaye = round2(paye);
    const settle = (d.settlementAmount && d.settlementAmount.value != null) ? Number(d.settlementAmount.value) : null;
    if (paye > 0 && settle != null && !isNaN(settle)) {
      patch.mollieFee = round2(paye - settle);
      patch.mollieSettlementAmount = settle;
      patch.netTiServices = round2((Number(commission) || 0) - patch.mollieFee);
    }
    await db.collection('ledger').doc(reqId).set(patch, {merge: true});
    if (patch.mollieFee != null) {
      try { await db.collection('requests').doc(reqId).set({mollieFee: patch.mollieFee, netTiServices: patch.netTiServices}, {merge: true}); } catch (_) {}
    }
    return true;
  } catch (e) { console.warn('recordMollieFee', e); return false; }
}
// Prévient l'ARTISAN (push + e-mail) quand son compte de paiement Mollie n'est pas
// validé et requiert son action (dossier refusé / informations manquantes), ou quand un
// versement n'a pas pu lui être fait. `reason` : 'needs-data' | 'route_failed' | 'no_org'.
//
// RÈGLE, ET ELLE EST SIMPLE : ON N'ALERTE LE PRESTATAIRE QUE S'IL A UNE ACTION À FAIRE.
// Un versement retenu parce que Mollie termine son contrôle de sécurité — celui qui se
// déclenche à la première transaction — n'appelle AUCUN geste de sa part. L'en avertir,
// c'est l'inquiéter pour rien, l'envoyer chercher une démarche qui n'existe pas, et surtout
// lui apprendre à ignorer nos notifications. Le jour où l'une d'elles comptera vraiment, il
// ne la lira plus. L'administrateur, lui, est prévenu dans tous les cas : un versement
// bloqué est NOTRE problème tant que le prestataire n'y peut rien.
async function notifyArtisanMollieProblem(db, uid, reason) {
  let onb = '';
  try { onb = (await db.collection('artisans').doc(uid).get()).get('mollieOnboardingStatus') || ''; } catch (_) {}
  // Les deux seuls cas où il a la main : Mollie réclame une pièce, ou aucun compte n'est
  // connecté. Un « route_failed » sans demande de Mollie ne le concerne pas.
  const manquePiece = (reason === 'needs-data') || (reason === 'route_failed' && onb === 'needs-data');
  const pasDeCompte = (reason === 'no_org');
  if (!manquePiece && !pasDeCompte) {
    console.log('Alerte Mollie NON envoyée à ' + uid + ' (' + reason + ', onboarding « ' + (onb || 'inconnu') + ' ») : rien à faire de son côté');
    return;
  }
  let email = '', tokens = [], name = '';
  try {
    const u = await db.collection('users').doc(uid).get();
    const ud = u.data() || {};
    email = ud.email || ''; tokens = ud.pushTokens || []; name = (ud.name || '').toString().slice(0, 60);
  } catch (_) {}
  const link = APP_URL.replace(/\/$/, '') + '/?open=missions';
  // Un titre qui dit l'action, un corps qui dit laquelle. Rien d'autre.
  const titre = pasDeCompte ? 'Ti-Services · Une action pour être payé' : 'Ti-Services · Un document pour être payé';
  const corps = pasDeCompte
    ? 'Connectez votre compte de paiement pour recevoir vos gains — quelques minutes, une seule fois.'
    : 'Mollie a besoin d\'un justificatif pour ouvrir vos virements. Ouvrez l\'app pour le fournir.';
  if (tokens.length) {
    try {
      await getMessaging().sendEachForMulticast({
        tokens,
        data: {title: titre, body: corps, url: './?open=missions'},
        webpush: {fcmOptions: {link: '/?open=missions'}, headers: {Urgency: 'high'}},
      });
    } catch (e) { console.warn('mollieProblem push', e); }
  }
  if (email) {
    try {
      await sendMail(db, email, {
        subject: titre.replace('Ti-Services · ', ''),
        html: '<p>Bonjour ' + escHtmlS(name || '') + ',</p>'
          + '<p>' + escHtmlS(corps) + '</p>'
          + (manquePiece ? '<p>Mollie vous indique précisément ce qui manque (pièce d\'identité, IBAN…). Vos gains déjà acquis vous restent dus et partiront dès l\'ouverture.</p>' : '')
          + '<p><a href="' + link + '" style="display:inline-block;background:#e8613c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Ouvrir Ti-Services</a></p>'
          + '<p>Une question ? Répondez à cet e-mail.</p>',
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
// RATTRAPAGE DES SUPPLÉMENTS EN ATTENTE. Pourboire, heures déclarées en plus, coup de
// pouce : ces montants dépassent la somme réservée à la commande et se prélèvent à part.
// Sans carte mémorisée, le prélèvement direct est impossible et un lien de paiement est
// envoyé — que le client ne suit pas toujours. Dès qu'une carte est mémorisée (ou lors du
// balayage quotidien), on repasse sur tout ce qui reste dû et on le prélève, sans rien
// redemander. Renvoie le nombre de suppléments réellement encaissés ou relancés.
async function relancerComplements(db, clientUid) {
  if (!mollieApiConfigured() || !clientUid) return 0;
  let docs = [];
  try {
    docs = (await db.collection('requests').where('clientUid', '==', clientUid)
      .where('complementStatus', 'in', ['impossible', 'echec', 'a_regler']).get()).docs;
  } catch (e) { console.warn('relancerComplements requête', e); return 0; }
  let n = 0;
  for (const d of docs) {
    const r = d.data() || {};
    const montant = round2(Number(r.complementAmount) || 0);
    if (!(montant > 0.009)) continue;
    let out;
    try {
      out = await mollieChargeComplement(db, d.id, clientUid, montant,
        'Ti-Services · supplément · ' + (r.serviceName || r.service || 'prestation'));
    } catch (e) { console.warn('relancerComplements', d.id, e); continue; }
    if (!out || !out.ok) continue;                       // on retentera plus tard
    try {
      await d.ref.update({complementStatus: out.direct ? 'en_cours' : 'a_regler',
        complementPaymentId: out.paymentId || '', complementCheckoutUrl: out.checkoutUrl || '',
        complementIssue: ''});
    } catch (_) {}
    if (out.direct) n++;
    console.log('Supplément relancé reqId=' + d.id + ' ' + montant + ' € — ' + out.reason);
  }
  return n;
}
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
    if (ok) { try { await d.ref.update({molliePayout: 'routed', molliePayoutIssue: '', molliePayoutMotif: ''}); } catch (_) {}
      try { await db.collection('ledger').doc(d.id).set({molliePayout: 'routed'}, {merge: true}); } catch (_) {} n++; }
    else { try { await d.ref.update({molliePayoutMotif: routeMotif() || ''}); } catch (_) {} }
  }
  // MÊME RATTRAPAGE POUR LES SUPPLÉMENTS (pourboire, heures en plus, coup de pouce) :
  // encaissés sur un SECOND paiement, ils ont leur propre état de versement
  // (complementPayout) et restaient invisibles de ce rattrapage — un pourboire refusé au
  // routage ne repartait JAMAIS tout seul, même quand Mollie ouvrait les virements.
  const qc = await db.collection('requests')
    .where('providerUid', '==', uid).where('complementPayout', '==', 'unrouted').get();
  for (const d of qc.docs) {
    const r = d.data() || {};
    const montant = round2(Number(r.complementAmount) || 0);
    const net = (r.complementNet != null) ? round2(Number(r.complementNet) || 0)
      : round2(Math.max(0, montant - commissionDuComplement(r, montant)));
    if (!r.complementPaymentId || net <= 0) continue;
    let ok = false;
    try {
      ok = await mollieRouteNet(r.complementPaymentId, orgId, net,
        'Ti-Services · supplément · ' + (r.serviceName || r.service || 'prestation'));
    } catch (e) { console.warn('rerouteArtisanPayouts supplément', e); }
    if (ok) { try { await d.ref.update({complementPayout: 'routed', complementPayoutIssue: '', complementPayoutMotif: ''}); } catch (_) {}
      try { await db.collection('ledger').doc(d.id).set({complementPayout: 'routed'}, {merge: true}); } catch (_) {} n++; }
    else { try { await d.ref.update({complementPayoutMotif: routeMotif() || ''}); } catch (_) {} }
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
  // Ses virements sont ouverts : on rattrape ce qui l'attendait. L'ancienne garde
  // (`=== false`) exigeait une transition observée ICI ; or le retour OAuth écrivait
  // déjà mollieCanSettle:true sans rerouter — la transition était « consommée » et le
  // rattrapage ne se déclenchait plus jamais (idem pour les fiches où le champ était
  // absent : undefined !== false). `!== true` couvre les deux cas, et une fois la fiche
  // à true, on ne repasse plus ici.
  if (ready.canSettle === true && ad.mollieCanSettle !== true) {
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

exports.notifyAdminNewArtisan = onDocumentCreated({document: 'artisans/{artisanId}', secrets: [SMTP_PASS]}, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const a = snap.data() || {};

  // On n'alerte que pour une candidature réellement en attente de validation.
  if ((a.status || 'attente') !== 'attente') return;

  const db = getFirestore();
  const tokensSnap = await db.collection('adminTokens').get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
  const name = (a.name || 'Un artisan').toString().slice(0, 80);
  // E-MAIL SYSTÉMATIQUE : une candidature est rare et importante — sans jeton admin
  // enregistré, elle passait totalement inaperçue (aucun repli n'existait).
  // Grille refusée : le souhait tarifaire du candidat est LA matière de la discussion —
  // il doit sauter aux yeux dès l'e-mail, pas se découvrir en ouvrant la fiche.
  let grille = '';
  if (a.acceptsGrille === false) {
    const dn = a.desiredNetRates || {};
    const lignes = Object.keys(dn).map((c) => '<li>' + escHtmlS(c) + ' : <b>' + escHtmlS(String(dn[c])) + ' € net/h</b></li>').join('');
    grille = '<p>⚠️ <b>Il n\'applique pas la grille tarifaire.</b>' + (lignes
      ? ' Prix net souhaité :</p><ul>' + lignes + '</ul>'
      : ' Aucun prix souhaité indiqué.</p>');
  }
  try {
    await sendMail(db, ADMIN_EMAIL, {
      subject: 'Ti-Services · Nouvelle candidature — ' + name + (a.acceptsGrille === false ? ' (hors grille)' : ''),
      html: '<p><b>' + escHtmlS(name) + '</b> souhaite rejoindre Ti-Services.</p>' + grille
        + '<p>Ouvrez la console admin pour examiner le dossier et valider ou refuser.</p>',
    });
  } catch (e) { console.warn('newArtisan mail', e && e.message); }
  if (!tokens.length) {
    console.log('Aucun jeton admin enregistré — e-mail seul.');
    return;
  }
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
/**
 * FILET E-MAIL. La notification d'une nouvelle demande ne partait QUE par push. Or le push
 * exige que l'artisan ait installé l'application ET accepté les alertes — sa propre fiche
 * admin le dit quand ce n'est pas le cas : « Aucun appareil notifié — il ne verra pas les
 * demandes ». On s'arrêtait alors sur « aucun jeton enregistré » et RIEN ne partait : le
 * client attendait une réponse qui ne pouvait pas venir. L'e-mail, lui, marche toujours.
 *
 * Il ne part qu'à ceux qui n'ont AUCUN appareil joignable — jamais en double d'un push.
 * Appelé aux DEUX endroits qui diffusent une demande : la création (demandes sans verrou
 * de paiement) et le passage à « pending » (le cas normal, après autorisation de la carte).
 */
async function mailArtisansSansAppareil(db, artById, targetUids, tokenToUid, r, dirigee) {
  try {
    const joignables = {};
    Object.keys(tokenToUid || {}).forEach((tok) => { joignables[tokenToUid[tok]] = true; });
    const sansAppareil = (targetUids || []).filter((uid) => !joignables[uid]);
    if (!sansAppareil.length) return 0;
    const svcM = (r.serviceName || 'une prestation').toString().slice(0, 60);
    const zoneM = (r.zone || '').toString().slice(0, 40);
    const quandM = ((r.when || '') + (r.slot ? (' à ' + r.slot) : '')).trim().slice(0, 60);
    const lien = APP_URL.replace(/\/$/, '') + '/?open=missions';
    await Promise.all(sansAppareil.map(async (uid) => {
      const a = artById[uid] || {};
      const mail = (a.email || '').trim();
      if (!mail) return;
      try {
        await sendMail(db, mail, {
          subject: (dirigee ? 'Une demande vous est réservée — ' : 'Nouvelle demande — ') + svcM,
          html: '<p>Bonjour ' + escHtmlS((a.name || '').split(' ')[0] || '') + ',</p>'
            + (dirigee
              ? '<p>Un client vous demande <b>directement</b> sur Ti-Services.</p>'
              : '<p>Une nouvelle demande vient d\'être publiée sur Ti-Services.</p>')
            + '<ul><li><b>Prestation :</b> ' + escHtmlS(svcM) + '</li>'
            + (zoneM ? ('<li><b>Secteur :</b> ' + escHtmlS(zoneM) + '</li>') : '')
            + (quandM ? ('<li><b>Quand :</b> ' + escHtmlS(quandM) + '</li>') : '')
            + '</ul>'
            + (dirigee
              ? '<p>Elle vous est réservée : elle n\'est proposée à personne d\'autre tant que vous n\'avez pas répondu.</p>'
              : '<p>Premier arrivé, premier servi.</p>')
            + '<p><a href="' + lien + '">Ouvrir mes missions</a></p>'
            + '<p style="color:#666;font-size:13px">Vous recevez cet e-mail parce qu\'aucun appareil n\'est encore relié à votre compte. '
            + 'Activez les notifications dans l\'application : vous serez prévenu en quelques secondes au lieu de quelques minutes.</p>',
        });
      } catch (e) { console.warn('mailArtisansSansAppareil', uid, e); }
    }));
    console.log('E-mail « nouvelle demande » à ' + sansAppareil.length + ' artisan(s) sans appareil notifié.');
    return sansAppareil.length;
  } catch (e) { console.warn('mailArtisansSansAppareil', e); return 0; }
}

exports.notifyArtisansNewRequest = onDocumentCreated({document: 'requests/{reqId}', secrets: [SMTP_PASS]}, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const r = snap.data() || {};
  // Statut EXPLICITE exigé. Le repli « || 'pending' » traitait un document sans statut —
  // par exemple recréé par accident — comme une demande ouverte, et l'envoyait à tous.
  if (r.status !== 'pending') return;

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
  const artById = {};
  artsSnap.docs.forEach((d) => { artById[d.id] = d.data() || {}; });
  if (whatsAppConfigured()) {
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

  await mailArtisansSansAppareil(db, artById, targetUids, tokenToUid, r, !!preferred);
  if (!tokens.length) { console.log('Aucun jeton artisan enregistré — e-mail(s) envoyé(s) à la place.'); return; }

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
  const dnp = (after.pendingDesiredNet && typeof after.pendingDesiredNet === 'object') ? after.pendingDesiredNet : {};
  const labels = added.map((c) => (c === 'autre'
    ? ('Autre : ' + (after.pendingOther || '').toString().slice(0, 80))
    : (c + (dnp[c] ? ' (souhaite ' + dnp[c] + ' € net/h)' : '')))).join(', ');
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
 * notifyArtisanDecisions : les DÉCISIONS de l'admin sur une fiche artisan, notifiées à
 * l'artisan lui-même. Jusqu'ici, seule la VALIDATION du compte partait (notifyArtisanApproved) ;
 * le refus de candidature, la validation ou le refus d'un métier ajouté et le verdict sur
 * l'attestation d'assurance ne prévenaient PERSONNE — l'artisan restait devant « en cours
 * d'examen » à vie. Notification push d'abord ; l'e-mail ne sert que de FILET quand
 * l'artisan n'a aucun jeton push (application sans notifications) — sinon il recevait
 * chaque verdict en double, push + courriel.
 */
exports.notifyArtisanDecisions = onDocumentUpdated({document: 'artisans/{artisanId}', secrets: [SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const uid = event.params.artisanId;
  const db = getFirestore();

  // Ce qu'on annonce : {titre, corps} — on collecte puis on envoie en une passe.
  const avis = [];

  // 1) Candidature refusée (attente -> refuse). La remise en attente ou la validation
  //    ont déjà leurs circuits ; le refus n'en avait aucun.
  // `corps` = notification push (courte) ; `mail` = version e-mail un peu plus
  // étoffée (2-3 phrases, HTML léger), enveloppée dans la charte par sendMail.
  if (before.status !== 'refuse' && after.status === 'refuse') {
    avis.push({
      titre: 'Espace artisan · Candidature non retenue',
      corps: 'Votre dossier n\'a pas été retenu en l\'état. Contactez-nous depuis l\'application pour en savoir plus ou compléter votre dossier.',
      mail: 'Votre dossier n\'a pas été retenu en l\'état — cela ne veut pas dire jamais. ' +
        'Écrivez-nous depuis l\'application : nous vous dirons ce qui manque et comment compléter votre dossier pour retenter votre chance.',
    });
  }

  // 2) Métier(s) ajouté(s) : validés (déplacés de pendingCats vers cats) ou refusés
  //    (retirés de pendingCats sans apparaître dans cats).
  const bp = Array.isArray(before.pendingCats) ? before.pendingCats : [];
  const ap = Array.isArray(after.pendingCats) ? after.pendingCats : [];
  const bc = Array.isArray(before.cats) ? before.cats : [];
  const ac = Array.isArray(after.cats) ? after.cats : [];
  const sortis = bp.filter((c) => ap.indexOf(c) < 0);
  const valides = sortis.filter((c) => ac.indexOf(c) >= 0 && bc.indexOf(c) < 0);
  const refuses = sortis.filter((c) => ac.indexOf(c) < 0);
  if (valides.length) {
    avis.push({
      titre: 'Espace artisan · Métier validé 🎉',
      corps: 'Votre nouveau métier (' + valides.join(', ') + ') est validé — les clients peuvent désormais vous solliciter.',
      mail: 'Bonne nouvelle : votre nouveau métier (<b>' + escHtmlS(valides.join(', ')) + '</b>) vient d\'être validé par notre équipe. ' +
        'Il apparaît dès maintenant sur votre profil et les clients de toute l\'île peuvent vous solliciter. ' +
        'Pensez à garder vos disponibilités à jour dans votre agenda pour recevoir les demandes au bon moment.',
    });
  }
  if (refuses.length) {
    avis.push({
      titre: 'Espace artisan · Métier non retenu',
      corps: 'Votre demande de métier (' + refuses.join(', ') + ') n\'a pas été retenue. Contactez-nous depuis l\'application pour en savoir plus.',
      mail: 'Votre demande de métier (<b>' + escHtmlS(refuses.join(', ')) + '</b>) n\'a pas été retenue pour le moment. ' +
        'Contactez-nous depuis l\'application : nous vous expliquerons ce qui manque et comment la représenter — votre profil actuel, lui, reste pleinement actif.',
    });
  }

  // 3) Attestation d'assurance : verdict de l'admin.
  if (before.insuranceStatus !== after.insuranceStatus) {
    if (after.insuranceStatus === 'valide') {
      avis.push({
        titre: 'Espace artisan · Attestation validée',
        corps: 'Votre attestation d\'assurance est validée. Rien d\'autre à faire.',
        mail: 'Bonne nouvelle : votre attestation d\'assurance a été vérifiée et validée par notre équipe. ' +
          'Votre profil est en règle et vous continuez de recevoir les demandes normalement — rien d\'autre à faire de votre côté. ' +
          'Merci de contribuer au sérieux de la plateforme.',
      });
    } else if (after.insuranceStatus === 'refuse') {
      avis.push({
        titre: 'Espace artisan · Attestation refusée',
        corps: 'Votre attestation d\'assurance n\'a pas pu être validée — merci d\'en déposer une nouvelle depuis votre espace.',
        mail: 'Votre attestation d\'assurance n\'a pas pu être validée — document illisible, incomplet ou arrivé à échéance, le plus souvent. ' +
          'Déposez-en une nouvelle depuis votre espace : notre équipe la vérifiera rapidement. ' +
          'En cas de doute sur le document attendu, écrivez-nous depuis l\'application.',
      });
    }
  }

  if (!avis.length) return;

  let email = '';
  try { email = ((await db.collection('users').doc(uid).get()).data() || {}).email || ''; } catch (_) {}
  if (!email) email = (after.email || '').toString();
  const tokens = await userPushTokens(db, uid);
  for (const n of avis) {
    await pushMulticast(tokens, n.titre, n.corps, '/?open=missions',
      (tok) => db.collection('users').doc(uid).update({pushTokens: FieldValue.arrayRemove(tok)}), 'ti-compte-' + uid);
    if (email && !tokens.length) {
      try {
        await sendMail(db, email, {
          subject: 'Ti-Services · ' + n.titre.replace('Espace artisan · ', ''),
          // La signature vient du pied de la charte (tiCharteHtml) — pas ici.
          html: '<p>Bonjour' + (after.name ? ' ' + escHtmlS(String(after.name).split(' ')[0]) : '') + ',</p><p>' + (n.mail || escHtmlS(n.corps)) + '</p>',
        });
      } catch (e) { console.warn('notifyArtisanDecisions mail', e && e.message); }
    }
  }
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
  // L'ARTISAN dont la durée est contestée doit le savoir tout de suite (seul l'admin
  // était prévenu — l'artisan attendait un paiement sans comprendre le silence), et le
  // CLIENT reçoit un accusé de réception : sa contestation est bien prise en compte.
  try {
    if (after.providerUid) {
      const tokens = await userPushTokens(db, after.providerUid);
      await pushMulticast(tokens, 'Durée contestée — ' + svc,
        cli + ' conteste la durée déclarée (' + fin + ' h au lieu de ' + dur + ' h prévues). Ti-Services arbitre : votre paiement est suspendu le temps de l\'examen.',
        '/?open=promissions',
        (tok) => db.collection('users').doc(after.providerUid).update({pushTokens: FieldValue.arrayRemove(tok)}), 'ti-litige-' + event.params.reqId);
      const u = (await db.collection('users').doc(after.providerUid).get()).data() || {};
      if (u.email) {
        await sendMail(db, u.email, {
          subject: 'Ti-Services · Durée contestée — ' + svc,
          html: '<p>' + escHtmlS(cli) + ' conteste la durée déclarée sur « ' + escHtmlS(svc) + ' » (' + fin + ' h déclarées, ' + dur + ' h prévues).</p>'
            + '<p>Ti-Services examine la situation et arbitre — votre paiement est suspendu le temps de l\'examen. Vous pouvez apporter des précisions depuis la messagerie de la mission.</p>',
        });
      }
    }
  } catch (e) { console.warn('dispute artisan notify', e); }
  try {
    if (after.clientUid) {
      const tokens = await userPushTokens(db, after.clientUid);
      await pushMulticast(tokens, 'Contestation bien reçue',
        'Votre signalement sur « ' + svc + ' » est pris en compte : rien ne sera prélevé tant que Ti-Services n\'a pas arbitré.',
        '/?open=wallet&r=' + event.params.reqId,
        (tok) => db.collection('users').doc(after.clientUid).update({pushTokens: FieldValue.arrayRemove(tok)}), 'ti-litige-' + event.params.reqId);
    }
  } catch (e) { console.warn('dispute client ack', e); }
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

  // UNE RAFALE PEUT PORTER LES DEUX VOIX. Reconnexion après coupure réseau, écritures
  // coalescées : le lot peut contenir un message du client PUIS un de l'artisan. Ne
  // regarder que le dernier privait l'une des deux parties de sa notification. On
  // notifie donc chaque partie qui a AU MOINS un message de l'autre dans le lot, sur
  // la base du dernier message qui la concerne.
  const fresh = aMsgs.slice(bMsgs.length);
  const db = getFirestore();
  for (const from of ['client', 'pro']) {
    const lot = fresh.filter((x) => x && x.from === from);
    if (!lot.length) continue;
    const last = lot[lot.length - 1];
    // Destinataire = l'autre partie (opt-out notifOn respecté).
    const recipientUid = (from === 'client') ? after.providerUid : after.clientUid;
    if (!recipientUid) continue;
    const tokens = await userPushTokens(db, recipientUid);
    if (!tokens.length) { console.log('Message : aucun jeton pour le destinataire.'); continue; }

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
    // Tag = le fil : même valeur que la notification locale de la page
    // (« ti-msg-<reqId> »), pour que le push serveur et l'alerte locale se
    // REGROUPENT au lieu de s'afficher en double quand l'app est ouverte.
    await pushMulticast(tokens, title, body, link,
      (tok) => db.collection('users').doc(recipientUid).update({ pushTokens: FieldValue.arrayRemove(tok) }),
      'ti-msg-' + event.params.reqId);
  }
});

/**
 * notifySupportMessage : messagerie SUPPORT (client↔Ti-Services, artisan↔Ti-Services),
 * stockée dans supportClient / supportPro du document de demande.
 *  - message d'un utilisateur (client/pro) -> push à l'admin (collection adminTokens) ;
 *  - réponse de l'admin -> push à l'utilisateur concerné (clientUid / providerUid).
 */
// UN ENVOI QUI ÉCHOUE NE DOIT JAMAIS FAIRE ÉCHOUER L'APPELANT : pushMulticast est
// appelée en chaîne (support client PUIS support artisan) et au milieu de traitements
// financiers — une exception FCM sacrifiait tout ce qui suivait. On encaisse, on
// journalise (avant : zéro trace des échecs), on continue. FCM refuse aussi les lots
// de plus de 500 jetons (adminTokens n'est pas borné) : on découpe. Le `tag` regroupe
// les notifications d'un même fil sur l'appareil — sans lui, tout retombait sur le tag
// unique du service worker et chaque push ÉCRASAIT le précédent dans le centre de
// notifications. Enfin, `messaging/invalid-argument` peut venir de la CHARGE UTILE et
// pas du jeton : supprimer le jeton sur ce code purgeait des appareils valides.
async function pushMulticast(tokens, title, body, link, onInvalid, tag) {
  if (!tokens.length) return;
  try {
    const msg = getMessaging();
    let ok = 0; let ko = 0;
    for (let off = 0; off < tokens.length; off += 450) {
      const lot = tokens.slice(off, off + 450);
      const res = await msg.sendEachForMulticast({
        tokens: lot,
        data: Object.assign({ title: title, body: body, url: '.' + (link || '/') }, tag ? { tag: tag } : {}),
        webpush: { fcmOptions: { link: link || '/' }, headers: { Urgency: 'high' } },
      });
      ok += res.successCount; ko += res.failureCount;
      const dels = [];
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const c = r.error && r.error.code;
          if (onInvalid && (c === 'messaging/registration-token-not-registered' ||
              c === 'messaging/invalid-registration-token')) {
            dels.push(Promise.resolve(onInvalid(lot[i])).catch(() => {}));
          } else {
            console.warn('pushMulticast échec', c || (r.error && r.error.message) || 'inconnu');
          }
        }
      });
      if (dels.length) await Promise.all(dels);
    }
    if (ko) console.warn('pushMulticast : ' + ok + ' envoyés, ' + ko + ' échecs sur ' + tokens.length + ' jetons');
  } catch (e) { console.warn('pushMulticast', (e && e.message) || e); }
}
// Jetons push d'un utilisateur, en RESPECTANT son choix : notifOn === false (il a coupé
// les notifications) => aucun jeton. Seul le pool « nouvelle mission » faisait ce
// contrôle ; la messagerie et les statuts continuaient d'envoyer malgré l'opt-out.
async function userPushTokens(db, uid) {
  if (!uid) return [];
  try {
    const u = (await db.collection('users').doc(uid).get()).data() || {};
    if (u.notifOn === false) return [];
    return Array.isArray(u.pushTokens) ? u.pushTokens : [];
  } catch (_) { return []; }
}

exports.notifySupportMessage = onDocumentUpdated('requests/{reqId}', async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const db = getFirestore();

  async function handle(field, userUidField, userNameField, fallbackName, side) {
    const b = Array.isArray(before[field]) ? before[field] : [];
    const a = Array.isArray(after[field]) ? after[field] : [];
    if (a.length <= b.length) return;
    // La rafale peut contenir un message de l'utilisateur ET la réponse de l'admin
    // (reconnexion, écritures coalescées) : ne lire que le dernier privait l'un des
    // deux de sa notification. On traite chaque sens présent dans le lot.
    const fresh = a.slice(b.length);
    const tag = 'ti-sup-' + event.params.reqId + '-' + side;   // même tag que l'alerte locale de la page
    const fromAdmin = fresh.filter((x) => x && x.from === 'admin');
    const fromUser = fresh.filter((x) => x && x.from !== 'admin');
    if (fromAdmin.length) {
      // Réponse de l'admin -> notifier l'utilisateur concerné (opt-out respecté).
      const uid = after[userUidField];
      if (uid) {
        const body = String((fromAdmin[fromAdmin.length - 1] || {}).text || 'Nouveau message').slice(0, 140);
        const tokens = await userPushTokens(db, uid);
        // Le clic ouvre la réservation concernée, pas l'accueil.
        const link = (side === 'client') ? ('/?open=wallet&r=' + event.params.reqId) : '/?open=missions';
        await pushMulticast(tokens, 'Ti-Services · Support', body, link,
          (tok) => db.collection('users').doc(uid).update({ pushTokens: FieldValue.arrayRemove(tok) }), tag);
      }
    }
    if (fromUser.length) {
      // Message d'un utilisateur -> notifier l'admin.
      let tokens = [];
      try { const ts = await db.collection('adminTokens').get(); tokens = ts.docs.map((d) => d.id).filter(Boolean); } catch (_) {}
      const body = String((fromUser[fromUser.length - 1] || {}).text || 'Nouveau message').slice(0, 140);
      const who = (after[userNameField] || fallbackName || 'Un utilisateur').toString().slice(0, 60);
      await pushMulticast(tokens, 'Support — ' + who, body, '/',
        (tok) => db.collection('adminTokens').doc(tok).delete(), tag);
    }
  }

  await handle('supportClient', 'clientUid', 'clientName', 'Client', 'client');
  await handle('supportPro', 'providerUid', 'providerName', 'Artisan', 'pro');
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
  const db = getFirestore();
  const uid = event.params.uid;
  // Comme pour la messagerie de réservation : une rafale peut contenir les deux voix.
  const fresh = a.slice(b.length);
  const tag = 'ti-supg-' + uid;
  const fromAdmin = fresh.filter((x) => x && x.from === 'admin');
  const fromUser = fresh.filter((x) => x && x.from !== 'admin');
  if (fromAdmin.length) {
    const body = String((fromAdmin[fromAdmin.length - 1] || {}).text || 'Nouveau message').slice(0, 140);
    const tokens = (after.notifOn === false) ? [] : (after.pushTokens || []);
    await pushMulticast(tokens, 'Ti-Services · Support', body, '/',
      (tok) => db.collection('users').doc(uid).update({ pushTokens: FieldValue.arrayRemove(tok) }), tag);
  }
  if (fromUser.length) {
    let tokens = [];
    try { const ts = await db.collection('adminTokens').get(); tokens = ts.docs.map((d) => d.id).filter(Boolean); } catch (_) {}
    const body = String((fromUser[fromUser.length - 1] || {}).text || 'Nouveau message').slice(0, 140);
    const who = (after.name || 'Un utilisateur').toString().slice(0, 60);
    await pushMulticast(tokens, 'Support général — ' + who, body, '/',
      (tok) => db.collection('adminTokens').doc(tok).delete(), tag);
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

  // HORODATAGE SERVEUR de la fin de prestation. C'est lui, et jamais une date envoyée par
  // un téléphone, qui fait courir le délai de validation automatique : l'horloge d'un
  // appareil se règle à la main.
  if (aStatus === 'done_pro' && !after.doneProAt) {
    try { await event.data.after.ref.update({doneProAt: FieldValue.serverTimestamp()}); } catch (e) { console.warn('doneProAt', e); }
  }

  const clientUid = after.clientUid;
  if (!clientUid) return;

  const provider = (after.providerName || 'Un artisan').toString().slice(0, 60);
  const svcName = (after.serviceName || 'votre prestation').toString().slice(0, 60);

  let title = '';
  let body = '';
  if (bStatus === 'pending' && aStatus === 'accepted') {
    title = 'Vos réservations · Artisan trouvé';
    body = provider + ' a accepté votre demande de ' + svcName + '.';
  } else if (aStatus === 'working') {
    // Début de mission : le client n'était prévenu par RIEN — il découvrait la
    // prestation démarrée en rouvrant l'app par hasard.
    title = 'Vos réservations · Prestation en cours';
    body = provider + ' a démarré ' + svcName + '.';
  } else if (aStatus === 'done_pro') {
    title = 'Vos réservations · Prestation terminée';
    body = provider + ' a terminé — validez pour finaliser.';
  } else if (bStatus === 'pending' && aStatus === 'declined') {
    // L'artisan PRÉCISÉMENT demandé (demande dirigée) a décliné : le client doit
    // décider de la suite (proposer à tous les artisans, ou annuler).
    const who = (after.declinedName || after.preferredProviderName || 'Votre artisan').toString().slice(0, 60);
    title = 'Vos réservations · Artisan indisponible';
    body = who + ' n\'est pas disponible pour ' + svcName + ' — à vous de décider.';
  } else if (aStatus === 'payment_failed') {
    // Paiement refusé à la commande : sans ce message, la demande n'était JAMAIS
    // diffusée aux artisans et le client ne l'apprenait nulle part.
    title = 'Vos réservations · Paiement non abouti';
    body = 'Votre réservation de ' + svcName + ' n\'est pas confirmée — réessayez le paiement.';
  } else {
    return; // autres transitions : pas de notification client
  }

  const db = getFirestore();
  const tokens = await userPushTokens(db, clientUid);
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
exports.notifyArtisanPaid = onDocumentUpdated({document: 'requests/{reqId}', secrets: [SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  if (before.status === 'paid' || after.status !== 'paid') return; // transition -> paid, une seule fois
  const uid = after.providerUid;
  if (!uid) return;

  const db = getFirestore();
  let tokens = [];
  try { const u = await db.collection('users').doc(uid).get(); tokens = (u.data() || {}).pushTokens || []; } catch (_) {}

  const cli = (after.clientName || 'Le client').toString().split(' ')[0].slice(0, 30);
  const tip = Math.max(0, round2(Number(after.tip) || 0));
  const net = Number(after.netAmount);
  const amt = (net > 0) ? (' — vous percevez ' + eurTxt(net)) : '';
  const body = tip > 0
    ? ('💛 ' + cli + ' a validé et vous a laissé ' + eurTxt(tip) + ' de pourboire' + amt)
    : (cli + ' a validé votre prestation' + amt + '. Vous êtes payé 🎉');

  // Artisan sans appareil enregistré : REPLI E-MAIL. Le circuit « nouvelle demande »
  // a ce filet depuis toujours (mailArtisansSansAppareil) ; « vous êtes payé » — le
  // message le plus important pour lui — n'en avait aucun.
  if (!tokens.length) {
    console.log('notifyArtisanPaid : aucun jeton pour ' + uid + ' — repli e-mail');
    try {
      const u = (await db.collection('users').doc(uid).get()).data() || {};
      const a = (await db.collection('artisans').doc(uid).get()).data() || {};
      const em = u.email || a.email || '';
      if (em) {
        await sendMail(db, em, {
          subject: 'Prestation validée — vous êtes payé',
          html: '<p>' + escHtmlS(body) + '</p><p>Le détail est dans votre espace Missions sur <a href="' + APP_URL + '">ti-services.fr</a>.</p>',
        });
      }
    } catch (e) { console.warn('notifyArtisanPaid mail', e && e.message); }
    return;
  }

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

// DEUX PRODUITS SUR LE MÊME COMPTE MOLLIE. Ti-Services et Archipel BTP encaissent via le
// même compte. La séparation se joue au niveau du PROFIL Mollie, et c'est la CLÉ API qui
// détermine le profil — vérifié auprès de Mollie (/profiles/me) : la clé de Ti-Services
// est rattachée au profil « Ti-services ». Il n'y a donc rien à régler côté code, et un
// `profileId` envoyé avec une clé de profil n'aurait rien changé : ce réglage, ainsi que
// l'écran de console qui allait avec, ont été retirés.
// Reste ici une étiquette `produit` dans les métadonnées de CHAQUE paiement : elle ressort
// dans les exports Mollie et permet de trier sans dépendre du texte du libellé.
const PRODUIT = 'ti-services';
// MONTANTS D'UNE DEMANDE — SOURCE UNIQUE. La facture (PDF) et le règlement calculaient
// chacun de leur côté et ne tombaient pas d'accord : la facture ajoutait un forfait de
// déplacement même quand le client s'était rendu chez le prestataire, oubliait le
// multiplicateur « par personne » et les options ; le règlement, lui, ignorait le forfait
// de déplacement — donc l'encaissait jamais alors qu'il figurait sur la facture. Un
// document légal ne peut pas annoncer un montant différent de celui qui est prélevé.
//
// Règles, identiques à celles annoncées au client :
//   • assiette de commission = prestation (× personnes, + options) + coup de pouce ;
//   • le POURBOIRE porte la même commission que la prestation (taux de l'artisan) :
//     versé en entier, chaque pourboire coûtait de l'argent à Ti-Services — les frais
//     bancaires de son prélèvement séparé restaient à la charge de la plateforme ;
//   • forfait de déplacement : intégralement au prestataire, hors commission ;
//   • le brut est ce que le client paie ; le net de l'artisan = brut − commission.
// Code de série de facturation : 1 → A, 26 → Z, 27 → AA… Attribué une fois par
// prestataire, il rend chaque numéro de facture unique et non ambigu (deux prestataires
// pouvaient sinon porter le même « 2026-0002 »).
function serieCode(n) {
  let s = '';
  n = Math.max(1, Math.floor(Number(n) || 1));
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const TRAVEL_MIN = 50, TRAVEL_FEE = 20;
function montantsDemande(r) {
  r = r || {};
  const rate = Number(r.rate) || 0;
  const acts = Array.isArray(r.acts) ? r.acts : null;
  // Heures facturées : celles corrigées par l'artisan en fin de mission si elles existent,
  // sinon celles commandées. Ressortie plus bas (M.hours) : le registre comptable en a
  // besoin et doit lire EXACTEMENT la valeur qui a servi au calcul du montant.
  const hours = (r.unit === 'forfait') ? 1 : ((r.finalHours != null) ? Number(r.finalHours) : (Number(r.duration) || 1));
  let base;
  if (acts && acts.length) {
    base = round2(acts.reduce((t, a) => t + (Number(a.price) || 0) * (Number(a.qty) || 1), 0));
  } else {
    base = round2(rate * hours);
  }
  base = round2(base * peopleCount(r.service, r.people));
  const opts = Array.isArray(r.options) ? r.options : null;
  if (opts && opts.length) {
    base = round2(base + opts.reduce((t, o) => t + (Number(o.price) || 0) * (Number(o.qty) || 1), 0));
  }
  const boostPct = Number(r.boost) || 0;
  const boostEur = Math.max(0, Math.round(Number(r.boostEur) || 0));
  const maj = round2(round2(base * boostPct / 100) + boostEur);
  // Jamais de déplacement quand c'est le CLIENT qui se déplace (prestation en salon).
  const travel = (r.locationMode === 'salon') ? 0
    : ((acts && acts.length && base > 0 && base < TRAVEL_MIN) ? TRAVEL_FEE : 0);
  const tip = Math.max(0, round2(Number(r.tip) || 0));
  return {
    base: base, boostPct: boostPct, maj: maj, travel: travel, tip: tip, hours: hours,
    assiette: round2(base + maj),          // ce sur quoi porte la commission
    gross: round2(base + maj + travel + tip),
  };
}
exports.settleCommission = onDocumentUpdated({document: 'requests/{reqId}', secrets: ['MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async (event) => {
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  // RATTRAPABLE. On ne se limite plus à l'instant précis de la transition vers « paid » :
  // si ce règlement échoue (panne, bug, quota), la demande resterait réglée côté client
  // et JAMAIS inscrite au registre — donc sans numéro de facture, sans commission, et
  // introuvable dans la console. C'est exactement ce qui est arrivé. Désormais toute
  // modification ultérieure d'une prestation payée mais non réglée relance le règlement ;
  // `commissionSettled` reste le verrou qui garantit qu'il ne s'exécute qu'une fois.
  if (after.status !== 'paid') return;
  if (after.commissionSettled) return;

  const providerUid = after.providerUid;
  if (!providerUid) { console.log('settleCommission : demande sans providerUid, ignorée.'); return; }

  const rate = Number(after.rate) || 0;
  // Base = montant de la prestation. Prestation À L'ACTE (catalogue) : somme des actes.
  // Forfait sans acte : le prix fixe (1×). Sinon horaire : tarif × heures facturées.
  // Un seul calcul pour la facture ET le règlement (montantsDemande) : ce qui est écrit
  // sur le document est exactement ce qui est prélevé.
  const M = montantsDemande(after);
  const base = M.base, boost = M.boostPct;
  // Le forfait de déplacement revient en totalité au prestataire. Le POURBOIRE, lui,
  // porte la même commission que la prestation — calculée à part pour être retenue sur
  // le paiement qui le transporte (le supplément, dans la quasi-totalité des cas).
  const tip = M.tip;
  const gross = M.gross;

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
  const commission = round2(M.assiette * pct / 100);   // prestation + coup de pouce
  // Commission sur le POURBOIRE, au même taux, arrondie à part : elle est retenue sur le
  // paiement qui transporte le pourboire (empreinte ou supplément — voir plus bas),
  // jamais deux fois. L'app fait le même arrondi séparé (totals) : mêmes centimes partout.
  const tipCommission = round2(tip * pct / 100);
  const commissionTotale = round2(commission + tipCommission);
  const net = round2(gross - commissionTotale);

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
  //
  // SÉRIE PAR PRESTATAIRE. Le mandat autorise une série distincte par mandant, mais le
  // numéro doit alors désigner sa série sans ambiguïté. Sans elle, deux prestataires
  // atteignaient tous deux « 2026-0002 » : deux factures différentes, même numéro. Chaque
  // prestataire reçoit donc, à sa première facture, un code de série attribué une fois
  // pour toutes (A, B, … Z, AA…) → « 2026-B-0002 ». Les numéros déjà émis ne changent
  // PAS : une numérotation se poursuit, elle ne se réécrit jamais.
  let saleInvoiceNo = after.saleInvoiceNo || '';
  if (!saleInvoiceNo) {
    try {
      saleInvoiceNo = await db.runTransaction(async (tx) => {
        const cref = db.collection('counters').doc(providerUid);
        const aref = db.collection('artisans').doc(providerUid);
        const sref = db.collection('counters').doc('_series');
        // TOUTES les lectures avant la moindre écriture (contrainte des transactions).
        const csnap = await tx.get(cref);
        const asnap = await tx.get(aref);
        let serie = String((asnap.exists && asnap.data().invoiceSerie) || '').trim();
        let serieN = 0;
        if (!serie) {
          const ssnap = await tx.get(sref);
          serieN = ((ssnap.exists ? (ssnap.data().next || 0) : 0)) + 1;
          serie = serieCode(serieN);
        }
        const seq = ((csnap.exists ? (csnap.data().saleSeq || 0) : 0)) + 1;
        if (serieN) {
          tx.set(sref, { next: serieN }, { merge: true });
          tx.set(aref, { invoiceSerie: serie }, { merge: true });
        }
        tx.set(cref, { saleSeq: seq, invoiceSerie: serie, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return (new Date()).getFullYear() + '-' + serie + '-' + String(seq).padStart(4, '0');
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
      hours: M.hours,
      rate: rate,
      base: base,
      boost: boost,
      tip: tip,                   // pourboire — commissionné au même taux que la prestation
      tipCommission: tipCommission, // part de la commission assise sur le pourboire
      grossTotal: gross,          // réglé par le client
      commissionPct: pct,
      commissionAmount: commissionTotale, // revenu Ti-Services (part pourboire comprise)
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
      commissionBase: M.assiette,   // prestation + coup de pouce (le pourboire est commissionné à part, même taux)
      commissionAmount: commissionTotale,
      tipCommission: tipCommission,
      grossTotal: gross,
      netAmount: net,
      saleInvoiceNo: saleInvoiceNo,
      settledAt: FieldValue.serverTimestamp(),
    });
    console.log('Commission figée + registre reqId=' + reqId +
      ' base=' + base + ' pct=' + pct + '% comm=' + commissionTotale
      + (tipCommission ? (' (dont pourboire ' + tipCommission + ')') : '') + ' net=' + net);

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
    // OÙ VIT LE POURBOIRE ? Ajouté à la validation, il dépasse presque toujours
    // l'empreinte posée à la commande : il voyage alors dans le SUPPLÉMENT, et sa
    // commission est retenue sur ce second paiement. Cas particulier (durée revue à la
    // baisse) : le pourboire tient dans l'empreinte — sa commission est alors retenue
    // sur le versement de l'empreinte, comme celle de la prestation.
    const tipDansComplement = Math.min(tip, complement);
    const commTipComplement = round2(tipDansComplement * pct / 100);
    const commTipEmpreinte = round2(tipCommission - commTipComplement);
    // AUCUN SUPPLÉMENT NE DISPARAÎT EN SILENCE. Sans empreinte sur la demande (paiement
    // jamais abouti, demande créée hors carte, Mollie non configuré), il n'y a personne à
    // débiter : le pourboire figurait alors sur la facture sans laisser la moindre trace,
    // ni chez Mollie ni côté client. On l'inscrit sur la demande et on alerte l'exploitant.
    if (complement > 0.009 && !after.complementPaymentId && !mollieApiConfigured()) {
      const motif = 'Mollie non configuré sur cet environnement';
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
    if (complement > 0.009 && mollieApiConfigured() && !after.complementPaymentId) {
      try {
        const r2 = await mollieChargeComplement(db, reqId, after.clientUid,
          complement, 'Ti-Services · supplément · ' + (after.serviceName || after.service || 'prestation'));
        const patch = {complementAmount: complement, complementCommission: commTipComplement,
          complementStatus: r2.ok ? (r2.direct ? 'en_cours' : 'a_regler') : 'echec',
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
      // de la prestation est retenue ici (plus celle du pourboire s'il tient dans
      // l'empreinte) ; celle du pourboire porté par le supplément est retenue sur le
      // paiement du supplément (webhook) — le total versé à l'artisan reste `net`.
      const netA = round2(Math.max(0, capte - commission - commTipEmpreinte));
      if (after.molliePaymentId && captureOk) {
        const routed = (orgId && netA > 0) ? await mollieRouteNet(after.molliePaymentId, orgId, netA,
          'Ti-Services · ' + (after.serviceName || after.service || 'prestation') + ' · ' + saleInvoiceNo) : (netA <= 0);
        if (routed) {
          await event.data.after.ref.update({molliePayout: 'routed'});
          // LE REGISTRE DOIT SAVOIR CE QUI EST PARTI. Tant que le net n'est pas versé, la
          // TOTALITÉ de l'encaissement transite par le compte Ti-Services : la part de
          // l'artisan y est une DETTE, pas un revenu. Sans cette information au registre,
          // le justificatif comptable affiche un revenu juste… et tait un passif.
          try { await db.collection('ledger').doc(reqId).set({molliePayout: 'routed'}, {merge: true}); } catch (_) {}
        } else {
          // FILET DE SÉCURITÉ : le client a été débité mais le NET n'a PAS pu être versé
          // à l'artisan (onboarding Mollie incomplet, organisation absente, refus API).
          // L'argent reste sur le solde plateforme — on ne le perd JAMAIS en silence :
          // on marque la mission et on alerte l'admin pour régularisation manuelle.
          // On inscrit le NET DÛ : sans lui, aucun rattrapage automatique n'est possible
          // quand Mollie ouvre enfin les virements de l'artisan.
          await event.data.after.ref.update({molliePayout: 'unrouted', molliePayoutIssue: orgId ? 'route_failed' : 'no_org',
            molliePayoutMotif: routeMotif() || '', molliePayoutNet: netA});
          try { await db.collection('ledger').doc(reqId).set({molliePayout: 'unrouted'}, {merge: true}); } catch (_) {}
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
                + '<li><b>Cause :</b> ' + (orgId ? ('routage refusé par Mollie' + (routeMotif() ? (' — ' + escHtmlS(routeMotif())) : '')) : 'aucune organisation Mollie connectée') + '</li></ul>'
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
exports.notifyReopenedRequest = onDocumentUpdated({document: 'requests/{reqId}', secrets: [SMTP_PASS]}, async (event) => {
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
      const body = svcName + (zone ? ' · ' + zone : '') + (wasPendingPayment ? ' — une nouvelle demande, à saisir.' : ' — un créneau se libère, à saisir.');
      await pushMulticast(tokens, title, body, '/?open=missions',
        (t) => db.collection('users').doc(tokenToUid[t]).update({ pushTokens: FieldValue.arrayRemove(t) }));
    }
    // C'EST ICI que part l'alerte d'une commande réelle : une demande naît en
    // « pending_payment » et ne devient « pending » qu'une fois la carte autorisée. La
    // fonction de création ne la voit donc jamais. Le filet e-mail doit être des DEUX
    // côtés, sinon il ne sert à rien là où ça compte.
    const artById = {};
    artsSnap.docs.forEach((d) => { artById[d.id] = d.data() || {}; });
    await mailArtisansSansAppareil(db, artById, uids, tokenToUid, after, !!preferred);
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
/**
 * resettlePending : relance le règlement des prestations payées par le client mais jamais
 * inscrites au registre comptable (donc sans numéro de facture, sans commission, sans
 * versement à l'artisan, et introuvables dans la console). Réservé à l'administrateur.
 *
 * Le rattrapage passe par une simple modification de la demande : `settleCommission` se
 * redéclenche alors, et son verrou `commissionSettled` garantit qu'il ne s'exécute qu'une
 * fois. Le balayage quotidien fait la même chose tout seul ; ce bouton évite d'attendre
 * jusqu'au lendemain.
 *   action 'list' (défaut) → {pending:[…]} — inventaire, sans rien modifier
 *   action 'run'           → relance, retourne le nombre de demandes touchées
 */
exports.resettlePending = onCall(async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const db = getFirestore();
  const action = String((request.data && request.data.action) || 'list');
  const docs = (await db.collection('requests').where('status', '==', 'paid').get()).docs
    .filter((d) => { const r = d.data() || {}; return !r.commissionSettled && !!r.providerUid; });
  const pending = docs.map((d) => {
    const r = d.data() || {};
    return {
      reqId: d.id,
      clientName: String(r.clientName || ''), providerName: String(r.providerName || ''),
      serviceName: String(r.serviceName || r.service || ''),
      total: montantsDemande(r).gross,
      dateISO: String(r.dateISO || ''),
    };
  });
  if (action !== 'run') return {pending: pending};
  // UNE SEULE, OU TOUTES. Le lot n'est pas toujours homogène : une prestation d'essai
  // peut s'y trouver et n'a rien à faire dans la comptabilité. On peut donc désigner
  // précisément la demande à régler.
  const cible = String((request.data && request.data.reqId) || '').trim();
  const aRegler = cible ? docs.filter((d) => d.id === cible) : docs;
  if (cible && !aRegler.length) return {relances: 0, pending: pending, introuvable: true};
  let relances = 0;
  for (const d of aRegler) {
    try { await d.ref.update({resettleAt: FieldValue.serverTimestamp()}); relances++; } catch (e) { console.warn('resettlePending', d.id, e); }
  }
  console.log('resettlePending : ' + relances + ' règlement(s) relancé(s) par ' + who + (cible ? (' (ciblé ' + cible + ')') : ''));
  return {relances: relances, pending: pending};
});

/**
 * ledgerExclude : écarte de la comptabilité une prestation qui y figure à tort — un essai
 * réalisé avec une carte qui n'a jamais été réellement débitée, par exemple. Réservé à
 * l'administrateur.
 *
 * On n'EFFACE JAMAIS une écriture : le registre est immuable, et une ligne supprimée est
 * une piste d'audit perdue. On pose un indicateur `exclu` — la ligne reste consultable et
 * signalée comme telle, mais elle sort des totaux, de l'export comptable et du
 * justificatif de revenus. L'opération est réversible, et l'on garde qui l'a faite, quand
 * et pourquoi.
 */
/**
 * ledgerReconcile : rapproche le registre comptable de la RÉALITÉ MOLLIE. Pour chaque
 * écriture, on demande à Mollie l'état du paiement et on l'inscrit — état, montant
 * réellement capturé, frais, règlement. Réservé à l'administrateur.
 *
 * C'est ce rapprochement qui donne son sens aux comptes : une prestation n'entre au
 * chiffre d'affaires que si Mollie répond « paid ». Une empreinte simplement autorisée
 * (essai, mission jamais capturée) porte pourtant un identifiant de paiement — sans ce
 * relevé, elle passerait pour un encaissement.
 *
 * Le balayage quotidien fait la même chose ; ce bouton évite d'attendre le lendemain.
 */
exports.ledgerReconcile = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  if (!mollieApiConfigured()) return {simulated: true, releves: 0, encaissees: 0, autres: 0};
  const db = getFirestore();
  try {
    const led = await lireRegistre(db);
    let releves = 0; let echecs = 0;
    for (const d of led) {
      const e = d.data() || {};
      if (!e.molliePaymentId) continue;
      // Un paiement introuvable chez Mollie ne doit pas faire tomber tout le rapprochement.
      try { if (await recordMollieFee(db, d.id, e.molliePaymentId, e.commissionAmount)) releves++; else echecs++; } catch (_) { echecs++; }
    }
    // On relit APRÈS écriture : on annonce un état vérifié, jamais un état supposé.
    let encaissees = 0; let autres = 0;
    (await lireRegistre(db)).forEach((d) => { const e = d.data() || {}; if (e.exclu) return; if (e.mollieEncaisse === true) encaissees++; else autres++; });
    console.log('ledgerReconcile : ' + releves + ' relevé(s), ' + echecs + ' sans réponse, ' + encaissees + ' encaissée(s), ' + autres + ' non encaissée(s) — par ' + who);
    return {releves: releves, echecs: echecs, encaissees: encaissees, autres: autres};
  } catch (e) {
    // Plutôt qu'une « erreur interne » opaque : on remonte la cause, telle quelle.
    console.error('ledgerReconcile', e);
    return {erreur: String((e && e.message) || e).slice(0, 300)};
  }
});

/**
 * ledgerDelete : SUPPRIME une facture du registre comptable. Rare, mais nécessaire — une
 * écriture peut être erronée au point de ne pas devoir survivre (essai passé en réel,
 * doublon). Réservé à l'administrateur.
 *
 * La facture disparaît de la console, de la recherche, des relevés et des comptes. Une
 * copie intégrale est d'abord versée dans `ledgerSupprime` avec l'auteur, la date et le
 * motif : rien n'est reconstitué de mémoire si une question se pose plus tard, et cette
 * collection n'est lisible par aucun client. Le numéro de facture n'est PAS réattribué —
 * une numérotation ne se réutilise jamais, c'est ce qui la rend vérifiable.
 *
 * La demande est marquée pour que le rattrapage automatique ne la ressuscite pas.
 */
exports.ledgerDelete = onCall(async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const reqId = String((request.data && request.data.reqId) || '').trim().slice(0, 128);
  if (!reqId) throw new HttpsError('invalid-argument', 'Prestation non désignée.');
  const motif = String((request.data && request.data.motif) || '').trim().slice(0, 200);
  const db = getFirestore();
  const ref = db.collection('ledger').doc(reqId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Aucune facture pour cette prestation.');
  const avant = snap.data() || {};
  await db.collection('ledgerSupprime').doc(reqId).set(Object.assign({}, avant, {
    supprimePar: who,
    supprimeAt: FieldValue.serverTimestamp(),
    supprimeMotif: motif || 'supprimée depuis la console',
  }), {merge: true});
  await ref.delete();
  // `commissionSettled` reste vrai : sans cela le rattrapage quotidien la recréerait.
  try {
    await db.collection('requests').doc(reqId).set({
      comptaExclue: true, factureSupprimee: true, factureSupprimeeAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } catch (_) {}
  console.log('ledgerDelete ' + reqId + ' (facture ' + (avant.invNo || '—') + ') par ' + who + ' — ' + (motif || 'sans motif'));
  return {ok: true, invNo: String(avant.invNo || '')};
});

exports.ledgerExclude = onCall(async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const reqId = String((request.data && request.data.reqId) || '').trim().slice(0, 128);
  if (!reqId) throw new HttpsError('invalid-argument', 'Prestation non désignée.');
  const exclu = !!(request.data && request.data.exclu);
  const motif = String((request.data && request.data.motif) || '').trim().slice(0, 200);
  const db = getFirestore();
  const ref = db.collection('ledger').doc(reqId);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Aucune écriture pour cette prestation.');
  await ref.set({
    exclu: exclu,
    excluMotif: exclu ? (motif || 'prestation d\'essai — jamais réellement encaissée') : '',
    excluPar: exclu ? who : '',
    excluAt: exclu ? FieldValue.serverTimestamp() : null,
  }, {merge: true});
  try { await db.collection('requests').doc(reqId).set({comptaExclue: exclu}, {merge: true}); } catch (_) {}
  console.log('ledgerExclude ' + reqId + ' → ' + (exclu ? 'écartée' : 'réintégrée') + ' par ' + who);
  return {ok: true, exclu: exclu};
});

/**
 * payoutRetry : DEMANDER À MOLLIE POURQUOI, plutôt que de le deviner. Un versement non
 * routé n'était signalé que par « routage refusé par Mollie » — une phrase qui n'apprend
 * rien et laisse chercher à l'aveugle. Ici on interroge Mollie sur le paiement, on relit
 * les routes déjà posées, on retente, et on renvoie SA réponse, mot pour mot.
 *
 * Trois choses que seul Mollie sait, et qu'aucune supposition ne remplace :
 *   • l'état réel du paiement (une empreinte jamais capturée n'est pas routable) ;
 *   • les routes DÉJÀ créées — le versement a pu partir sans que nous l'ayons noté ;
 *   • le motif exact du refus (dossier de l'artisan incomplet, paiement pas encore
 *     routable, fenêtre de routage dépassée…).
 *
 * `list` inventorie, `run` retente (une prestation désignée, ou toutes). Rien n'est
 * détruit : au pire la demande garde le motif du dernier refus. Réservé à l'administrateur.
 */
exports.payoutRetry = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const db = getFirestore();
  const relance = String((request.data && request.data.action) || 'list') === 'run';
  const cible = String((request.data && request.data.reqId) || '').trim().slice(0, 128);
  const bloques = [];
  try {
    // DEUX FAÇONS DE NE PAS ÊTRE VERSÉ, ET UNE SEULE ÉTAIT CHERCHÉE.
    //   • `unrouted` : le partage a été tenté et refusé — on connaît le motif.
    //   • AUCUN état : le partage n'a jamais été tenté, le champ n'a jamais été écrit.
    // La console n'interrogeait que le premier cas. Les secondes étaient invisibles :
    // absentes des « versements bloqués », donc réputées versées, alors que le
    // prestataire n'avait rien reçu et qu'aucune route n'existait chez Mollie. Le
    // bandeau vert « tous les prestataires ont reçu leur net » s'affichait pendant que
    // de l'argent était dû. On ratisse donc aussi les prestations réglées sans état.
    const aTraiter = new Map();
    const q = await db.collection('requests').where('molliePayout', '==', 'unrouted').get();
    q.docs.forEach((d) => aTraiter.set(d.id, d));
    // LE NET DÛ N'EST PAS SUR LA DEMANDE. Il n'y est inscrit QUE lorsqu'un routage a été
    // tenté et refusé : quand le partage n'a jamais été lancé, la demande ne porte ni
    // état ni net, et la chercher là ne donne rien — c'est ce qui laissait ces deux
    // prestations invisibles. Le REGISTRE, lui, connaît le net de chaque prestation
    // réglée, et c'est déjà lui que compte le justificatif comptable. On part donc de la
    // même source que l'écran qui signalait l'anomalie : les deux ne peuvent plus se
    // contredire, puisqu'ils lisent la même chose.
    const duRegistre = new Map();
    const orphelins = [];
    let vus = 0;
    try {
      // Pas de filtre sur `type` : une écriture dont le frais Mollie a été enregistré
      // avant le règlement existe sans ce champ, et la filtrer la ferait disparaître —
      // exactement le genre d'angle mort qu'on est en train de corriger.
      const led = await db.collection('ledger').get();
      for (const e of led.docs) {
        const x = e.data() || {};
        // ON N'ÉCARTE QUE CE QUI EST RÉELLEMENT RÉGLÉ. Écarter dès qu'un état existe
        // laissait passer les écritures marquées « unrouted » dont la DEMANDE a été
        // supprimée : la requête sur les demandes ne les trouve plus, et cette
        // seconde passe les ignorait aussi. De l'argent dû, invisible des deux côtés.
        if (x.molliePayout === 'routed' || x.molliePayout === 'manuel') continue;
        if (!(round2(Number(x.netAmount) || 0) > 0.009)) continue;     // rien n'est dû
        vus++;
        duRegistre.set(e.id, x);
        if (!aTraiter.has(e.id)) {
          let dd = null;
          try { dd = await db.collection('requests').doc(e.id).get(); } catch (_) {}
          // LA DEMANDE PEUT AVOIR DISPARU (essai supprimé, ménage) — le registre, lui,
          // ne s'efface jamais. Sans ce repli, l'écriture était silencieusement ignorée
          // et l'argent dû redevenait invisible : la panne qu'on répare ici.
          if (dd && dd.exists) aTraiter.set(e.id, dd); else orphelins.push({id: e.id, x: x});
        }
      }
    } catch (e) { console.warn('payoutRetry : lecture du registre', e); }
    console.log('payoutRetry : ' + vus + ' écriture(s) sans état au registre, dont ' + orphelins.length + ' sans demande associée');
    for (const d of aTraiter.values()) {
      if (cible && d.id !== cible) continue;
      const r = d.data() || {};
      const reg = duRegistre.get(d.id) || null;
      const net = round2(Number(r.molliePayoutNet) || (reg ? Number(reg.netAmount) : 0) || 0);
      let orgId = r.mollieOrgId || '';
      if (!orgId && r.providerUid) {
        try { orgId = (await db.collection('artisans').doc(r.providerUid).get()).get('mollieOrgId') || ''; } catch (_) {}
      }
      const ligne = {
        reqId: d.id, serviceName: String(r.serviceName || (reg && reg.serviceName) || r.service || 'Prestation'),
        providerName: String(r.providerName || (reg && reg.providerName) || ''), clientName: String(r.clientName || (reg && reg.clientName) || ''),
        net: net, invNo: String(r.saleInvoiceNo || (reg && reg.invNo) || ''), org: orgId ? 'oui' : 'non',
        motif: String(r.molliePayoutMotif || ''), etat: '', routes: -1, verse: false,
        // `false` = le partage n'a JAMAIS été tenté (aucun état enregistré). La console
        // doit le dire autrement qu'un refus : il n'y a pas de motif à afficher.
        tente: !!r.molliePayout,
        lecture: '', liensRoutes: null,
      };
      if (mollieApiConfigured() && r.molliePaymentId) {
        // L'état RÉEL du paiement : une empreinte autorisée mais jamais capturée n'a
        // rien à router, et le dire évite de chercher du côté de l'artisan.
        try {
          const p = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId));
          ligne.etat = (p.ok && p.data) ? String(p.data.status || '') : ('introuvable (HTTP ' + (p.status || '?') + ')');
          // Mollie annonce lui-même les sous-ressources d'un paiement. Si `routes` n'y
          // figure pas, le partage n'existe PAS pour ce compte — la cause n'est pas le
          // dossier du prestataire, et il est inutile de le chercher de ce côté.
          if (p.ok && p.data && p.data._links) ligne.liensRoutes = !!p.data._links.routes;
        } catch (_) {}
        // Les routes DÉJÀ posées. Si Mollie en a une, le versement est parti et c'est
        // NOTRE fiche qui est en retard — on la corrige au lieu de re-router en double.
        // On garde AUSSI la réponse en clair quand la lecture échoue : lire et écrire
        // passent par la même adresse, donc un échec en LECTURE distingue une adresse
        // que Mollie ne reconnaît pas d'un refus portant sur ce versement précis.
        try {
          const l = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId) + '/routes');
          if (l.ok && l.data) {
            const arr = (l.data._embedded && l.data._embedded.routes) || l.data.routes || [];
            ligne.routes = Array.isArray(arr) ? arr.length : 0;
            if (ligne.routes > 0) {
              ligne.verse = true;
              ligne.motif = 'déjà versé — Mollie a bien la route, notre fiche était en retard';
              try { await d.ref.update({molliePayout: 'routed', molliePayoutIssue: '', molliePayoutMotif: ''}); } catch (_) {}
              try { await db.collection('ledger').doc(d.id).set({molliePayout: 'routed'}, {merge: true}); } catch (_) {}
            }
          } else {
            ligne.lecture = 'HTTP ' + (l.status || '?')
              + ((l.data && (l.data.detail || l.data.title)) ? (' — ' + String(l.data.detail || l.data.title).slice(0, 160)) : '');
          }
        } catch (_) {}
      }
      if (relance && !ligne.verse) {
        if (r.molliePaymentId && orgId && net > 0) {
          let ok = false;
          try {
            ok = await mollieRouteNet(r.molliePaymentId, orgId, net, 'Ti-Services · '
              + (r.serviceName || r.service || 'prestation') + (r.saleInvoiceNo ? (' · ' + r.saleInvoiceNo) : ''));
          } catch (e) { console.warn('payoutRetry', d.id, e); }
          ligne.verse = ok;
          ligne.motif = ok ? '' : (routeMotif() || 'refus sans explication de Mollie');
          try {
            await d.ref.update(ok ? {molliePayout: 'routed', molliePayoutIssue: '', molliePayoutMotif: ''}
              : {molliePayoutMotif: ligne.motif});
            await db.collection('ledger').doc(d.id).set({molliePayout: ok ? 'routed' : 'unrouted'}, {merge: true});
          } catch (_) {}
        } else {
          ligne.motif = !r.molliePaymentId ? 'aucun paiement Mollie sur cette prestation'
            : !orgId ? 'aucun compte Mollie connecté pour ce prestataire'
              : 'net à verser inconnu — régularisation à la main';
        }
      }
      bloques.push(ligne);
    }
    // LES SUPPLÉMENTS BLOQUÉS AUSSI. Pourboire, heures en plus, coup de pouce :
    // encaissés sur un SECOND paiement, leur versement a son propre état
    // (complementPayout) — et cet écran ne les cherchait pas. Un pourboire prélevé au
    // client mais refusé au routage restait invisible : ni listé, ni retenté, sans le
    // moindre motif. On les inventorie et on les retente exactement comme le net de la
    // mission, identifiés par « c~ » devant la demande (deux lignes possibles pour une
    // même prestation : son net ET son supplément).
    try {
      const qc = await db.collection('requests').where('complementPayout', '==', 'unrouted').get();
      for (const d of qc.docs) {
        const cle = 'c~' + d.id;
        if (cible && cible !== cle) continue;
        const r = d.data() || {};
        const montant = round2(Number(r.complementAmount) || 0);
        const net = (r.complementNet != null) ? round2(Number(r.complementNet) || 0)
          : round2(Math.max(0, montant - commissionDuComplement(r, montant)));
        let orgId = r.mollieOrgId || '';
        if (!orgId && r.providerUid) {
          try { orgId = (await db.collection('artisans').doc(r.providerUid).get()).get('mollieOrgId') || ''; } catch (_) {}
        }
        const ligne = {
          reqId: cle, genre: 'supplement',
          serviceName: 'Supplément · ' + String(r.serviceName || r.service || 'Prestation'),
          providerName: String(r.providerName || ''), clientName: String(r.clientName || ''),
          net: net, invNo: String(r.saleInvoiceNo || ''), org: orgId ? 'oui' : 'non',
          motif: String(r.complementPayoutMotif || ''), etat: '', routes: -1, verse: false,
          tente: !!r.complementPayout, lecture: '', liensRoutes: null,
        };
        if (mollieApiConfigured() && r.complementPaymentId) {
          try {
            const p = await mollieApi('/payments/' + encodeURIComponent(r.complementPaymentId));
            ligne.etat = (p.ok && p.data) ? String(p.data.status || '') : ('introuvable (HTTP ' + (p.status || '?') + ')');
            if (p.ok && p.data && p.data._links) ligne.liensRoutes = !!p.data._links.routes;
          } catch (_) {}
          // Une route déjà posée chez Mollie = le versement est parti, c'est notre fiche
          // qui est en retard — on la corrige au lieu de re-router en double.
          try {
            const l = await mollieApi('/payments/' + encodeURIComponent(r.complementPaymentId) + '/routes');
            if (l.ok && l.data) {
              const arr = (l.data._embedded && l.data._embedded.routes) || l.data.routes || [];
              ligne.routes = Array.isArray(arr) ? arr.length : 0;
              if (ligne.routes > 0) {
                ligne.verse = true;
                ligne.motif = 'déjà versé — Mollie a bien la route, notre fiche était en retard';
                try { await d.ref.update({complementPayout: 'routed', complementPayoutIssue: '', complementPayoutMotif: ''}); } catch (_) {}
                try { await db.collection('ledger').doc(d.id).set({complementPayout: 'routed'}, {merge: true}); } catch (_) {}
              }
            } else {
              ligne.lecture = 'HTTP ' + (l.status || '?')
                + ((l.data && (l.data.detail || l.data.title)) ? (' — ' + String(l.data.detail || l.data.title).slice(0, 160)) : '');
            }
          } catch (_) {}
        }
        if (relance && !ligne.verse) {
          if (r.complementPaymentId && orgId && net > 0) {
            let ok = false;
            try {
              ok = await mollieRouteNet(r.complementPaymentId, orgId, net,
                'Ti-Services · supplément · ' + (r.serviceName || r.service || 'prestation'));
            } catch (e) { console.warn('payoutRetry supplément', d.id, e); }
            ligne.verse = ok;
            ligne.motif = ok ? '' : (routeMotif() || 'refus sans explication de Mollie');
            try {
              await d.ref.update(ok ? {complementPayout: 'routed', complementPayoutIssue: '', complementPayoutMotif: ''}
                : {complementPayoutMotif: ligne.motif});
              await db.collection('ledger').doc(d.id).set({complementPayout: ok ? 'routed' : 'unrouted'}, {merge: true});
            } catch (_) {}
          } else {
            ligne.motif = !r.complementPaymentId ? 'aucun paiement Mollie sur ce supplément'
              : !orgId ? 'aucun compte Mollie connecté pour ce prestataire'
                : 'net à verser nul — rien à router';
          }
        }
        bloques.push(ligne);
      }
    } catch (e) { console.warn('payoutRetry suppléments', e); }
    // Écritures dont la DEMANDE a disparu : elles doivent quand même se voir, sinon on
    // recrée exactement le trou qu'on répare. Rien à réessayer automatiquement — sans
    // demande, il n'y a plus d'identifiant de paiement à router : c'est un virement à la
    // main, puis « Je l'ai versé à la main ».
    for (const o of orphelins) {
      if (cible && o.id !== cible) continue;
      bloques.push({
        reqId: o.id, serviceName: String(o.x.serviceName || o.x.service || 'Prestation'),
        providerName: String(o.x.providerName || ''), clientName: String(o.x.clientName || ''),
        net: round2(Number(o.x.netAmount) || 0), invNo: String(o.x.invNo || ''), org: 'non',
        motif: 'La demande n\'existe plus (essai supprimé ou ménage) : le registre garde la trace du net dû, mais il n\'y a plus de paiement à partager. Virement à la main.',
        etat: 'demande absente', routes: -1, verse: false, lecture: '', liensRoutes: null, tente: false, sansDemande: true,
      });
    }
  } catch (e) {
    console.error('payoutRetry', e);
    return {erreur: String((e && e.message) || e).slice(0, 300)};
  }
  const verses = bloques.filter((b) => b.verse).length;
  console.log('payoutRetry (' + (relance ? 'relance' : 'inventaire') + ') : ' + bloques.length
    + ' versement(s) bloqué(s), ' + verses + ' réglé(s) — par ' + who);
  return {bloques: bloques, verses: verses};
});

/**
 * payoutManual : ACTER UN VERSEMENT FAIT À LA MAIN. Quand Mollie ne peut pas partager le
 * paiement, la totalité finit par être virée sur le compte bancaire de Ti-Services — la
 * part du prestataire comprise. Elle ne lui est pas due un peu moins pour autant : elle
 * est simplement passée par nous. Il faut alors la lui virer, et pouvoir le dire ici.
 *
 * Ce n'est PAS une exclusion comptable : la prestation, la commission et la facture
 * restent exactement ce qu'elles étaient. On note seulement que le net a été réglé
 * autrement — avec qui l'a fait, quand, et la référence du virement. Sans cette trace,
 * la console réclamerait indéfiniment un versement déjà payé, et rien ne prouverait
 * qu'il l'a été. Réservé à l'administrateur.
 */
/**
 * refundOrder : RENDRE L'ARGENT. L'application savait encaisser, capturer, verser — jamais
 * rendre. Aucune fonction de remboursement n'existait, ni serveur ni console : le seul
 * recours était le tableau de bord Mollie, hors de toute comptabilité. Sur un essai à 2 €
 * ça ne se voit pas ; face à un client mécontent, c'est une crise.
 *
 * LE MOTIF DÉCIDE DU SORT DE LA PART DU PRESTATAIRE, parce que les deux situations n'ont
 * rien à voir :
 *   • « prestation non faite » → il n'a rien à percevoir : on récupère sa part via le
 *     mécanisme de Mollie (reverseRouting sur un remboursement total, routingReversals
 *     sur un partiel), qui ramène la somme vers le solde de la plateforme ;
 *   • « geste commercial » → la prestation a bien eu lieu, il garde ce qu'il a gagné :
 *     le remboursement sort de la poche de Ti-Services, sans toucher à sa part.
 *
 * Jamais plus que ce qui a été réellement encaissé, remboursements précédents déduits.
 * Et si Mollie refuse, on garde SA raison mot pour mot : « refus » n'apprend rien.
 */
exports.refundOrder = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  if (!mollieApiConfigured()) throw new HttpsError('failed-precondition', 'Mollie n\'est pas configuré sur cet environnement.');

  const reqId = String((request.data && request.data.reqId) || '').trim().slice(0, 128);
  if (!reqId) throw new HttpsError('invalid-argument', 'Prestation manquante.');
  const motif = (String((request.data && request.data.motif) || '') === 'non_faite') ? 'non_faite' : 'geste';
  const note = String((request.data && request.data.note) || '').trim().slice(0, 200);

  const db = getFirestore();
  const ref = db.collection('requests').doc(reqId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Prestation introuvable.');
  const r = snap.data() || {};
  if (!r.molliePaymentId) throw new HttpsError('failed-precondition', 'Aucun paiement Mollie sur cette prestation.');

  // CE QUI A ÉTÉ ENCAISSÉ, PAS CE QUI A ÉTÉ FACTURÉ. Une empreinte autorisée mais jamais
  // capturée n'a rien prélevé : il n'y a rien à rendre, et le prétendre créerait une
  // dette imaginaire. On lit l'état réel chez Mollie plutôt que de faire confiance à
  // notre propre fiche, qui a déjà eu tort.
  let encaisse = 0; let orgId = String(r.mollieOrgId || '');
  try {
    const p = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId), 'GET');
    if (!p.ok || !p.data) throw new HttpsError('failed-precondition', 'Mollie ne retrouve pas ce paiement (HTTP ' + (p.status || '?') + ').');
    if (String(p.data.status || '') !== 'paid') {
      throw new HttpsError('failed-precondition', 'Ce paiement n\'a pas été encaissé (état Mollie : ' + String(p.data.status || 'inconnu') + ') — il n\'y a rien à rembourser.');
    }
    const a = p.data.amount || {};
    encaisse = round2(Number(a.value) || 0);
    const dejaM = round2(Number((p.data.amountRefunded || {}).value) || 0);
    encaisse = round2(encaisse - dejaM);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('unavailable', 'Mollie injoignable — réessayez dans un instant.');
  }
  if (!(encaisse > 0.009)) throw new HttpsError('failed-precondition', 'Ce paiement est déjà intégralement remboursé.');

  const demande = (request.data && request.data.amount != null) ? round2(Number(request.data.amount) || 0) : encaisse;
  if (!(demande > 0.009)) throw new HttpsError('invalid-argument', 'Montant à rembourser invalide.');
  if (demande > encaisse + 0.009) {
    throw new HttpsError('invalid-argument', 'On ne peut pas rendre plus que ce qui a été encaissé (' + eurTxt(encaisse) + ' restant).');
  }
  const total = (demande >= encaisse - 0.009);
  const reprise = (motif === 'non_faite');

  const body = {
    amount: {currency: 'EUR', value: demande.toFixed(2)},
    description: ('Ti-Services · remboursement · ' + (r.serviceName || r.service || 'prestation')).slice(0, 100),
  };
  // La reprise de la part du prestataire n'a de sens que si elle lui a été routée.
  if (reprise && r.molliePayout === 'routed') {
    if (total) body.reverseRouting = true;
    else if (orgId) {
      body.routingReversals = [{amount: {currency: 'EUR', value: demande.toFixed(2)},
        source: {type: 'organization', organizationId: orgId}}];
    }
  }

  const res = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId) + '/refunds', 'POST', body);
  if (!res.ok) {
    // LA RAISON DE MOLLIE, MOT POUR MOT. On a déjà perdu des jours à chercher à l'aveugle
    // derrière un « refus » sans explication.
    const d = res.data || {};
    const motifM = String(d.detail || d.title || '').slice(0, 220);
    console.warn('refundOrder HTTP', res.status, reqId, motifM);
    throw new HttpsError('failed-precondition', 'Mollie a refusé le remboursement (HTTP ' + (res.status || '?') + ')'
      + (motifM ? (' — ' + motifM) : '') + '.');
  }

  const ligne = {
    montant: demande, motif: motif, total: total, repriseArtisan: !!body.reverseRouting || !!body.routingReversals,
    refundId: String((res.data && res.data.id) || ''), par: who, note: note, at: Date.now(),
  };
  const cumul = round2((Number(r.refundedTotal) || 0) + demande);
  try {
    await ref.update({refundedTotal: cumul, refunds: FieldValue.arrayUnion(ligne)});
    // Le registre doit le savoir : sans ça, le justificatif continue d'annoncer un revenu
    // sur une somme rendue au client.
    await db.collection('ledger').doc(reqId).set({refundedTotal: cumul, refundMotif: motif,
      refundRepriseArtisan: ligne.repriseArtisan}, {merge: true});
  } catch (e) { console.warn('refundOrder écriture', e); }

  console.log('refundOrder ' + reqId + ' — ' + demande + ' € rendus (' + motif
    + (ligne.repriseArtisan ? ', part artisan reprise' : ', absorbé par Ti-Services') + ') par ' + who);
  return {ok: true, montant: demande, total: total, repriseArtisan: ligne.repriseArtisan, restant: round2(encaisse - demande)};
});

exports.payoutManual = onCall(async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const brut = String((request.data && request.data.reqId) || '').trim().slice(0, 132);
  if (!brut) throw new HttpsError('invalid-argument', 'Prestation manquante.');
  // « c~<demande> » désigne le SUPPLÉMENT de la demande (pourboire, heures en plus…) :
  // son versement a son propre état, distinct du net de la mission — acter l'un ne doit
  // jamais éteindre l'autre.
  const estComplement = brut.indexOf('c~') === 0;
  const reqId = estComplement ? brut.slice(2) : brut;
  const ref = getFirestore().collection('requests').doc(reqId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Prestation introuvable.');
  const r = snap.data() || {};
  const champ = estComplement ? 'complementPayout' : 'molliePayout';
  if (r[champ] === 'routed') throw new HttpsError('failed-precondition', 'Ce versement est déjà parti par Mollie.');
  if (r[champ] === 'manuel') return {ok: true, deja: true};
  const upd = {};
  upd[champ] = 'manuel';
  upd[champ + 'ManuelPar'] = who;
  upd[champ + 'ManuelAt'] = FieldValue.serverTimestamp();
  upd[champ + 'ManuelRef'] = String((request.data && request.data.ref) || '').trim().slice(0, 140);
  await ref.update(upd);
  // Écritures au registre en toutes lettres (une par nature de versement) : le registre
  // est la source de vérité de la dette, et le harnais vérifie que chaque endroit qui
  // décide d'un versement l'y inscrit.
  try {
    if (estComplement) await ref.firestore.collection('ledger').doc(reqId).set({complementPayout: 'manuel'}, {merge: true});
    else await ref.firestore.collection('ledger').doc(reqId).set({molliePayout: 'manuel'}, {merge: true});
  } catch (_) {}
  const net = estComplement
    ? round2(Number(r.complementNet != null ? r.complementNet : r.complementAmount) || 0)
    : round2(Number(r.molliePayoutNet) || 0);
  console.log('payoutManual ' + brut + ' — ' + net + ' € versés à la main par ' + who);
  return {ok: true, net: net};
});

/**
 * orderPaymentCheck : NE PLUS DÉPENDRE D'UN SEUL CANAL POUR LE MOMENT DÉCISIF.
 *
 * Une commande naît en « pending_payment » : invisible des prestataires tant que la carte
 * n'est pas autorisée. Le SEUL chemin qui la faisait basculer en « pending » — et donc qui
 * déclenchait l'alerte aux prestataires — était le webhook de Mollie. S'il se perd, arrive
 * en retard, ou tombe pendant un déploiement, la commande reste bloquée : le client voit
 * sa carte débitée (une autorisation apparaît comme un débit en attente sur son relevé),
 * il croit avoir commandé, et PERSONNE ne cherche. Le balayage quotidien ne faisait que le
 * signaler, six heures plus tard.
 *
 * Ici, c'est le client lui-même qui déclenche la vérification en revenant dans l'app : on
 * demande à Mollie l'état réel du paiement et on ouvre la demande si elle doit l'être.
 * Idempotent : si le webhook a déjà fait le travail, on ne fait rien.
 */
exports.orderPaymentCheck = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const reqId = String((request.data && request.data.reqId) || '').trim().slice(0, 128);
  if (!reqId) throw new HttpsError('invalid-argument', 'Demande manquante.');
  const db = getFirestore();
  const ref = db.collection('requests').doc(reqId);
  const snap = await ref.get();
  if (!snap.exists) return {absente: true};
  const r = snap.data() || {};
  // On ne renseigne QUE le client de cette demande : l'état d'un paiement ne regarde
  // personne d'autre.
  if (r.clientUid && r.clientUid !== uid) throw new HttpsError('permission-denied', 'Demande non autorisée.');
  const st = r.status || '';
  if (st !== 'pending_payment' && st !== 'payment_failed') return {status: st, ouverte: st === 'pending'};
  if (!mollieApiConfigured() || !r.molliePaymentId) return {status: st, attente: true};

  const pay = await mollieApi('/payments/' + encodeURIComponent(r.molliePaymentId));
  if (!pay.ok || !pay.data) return {status: st, attente: true};
  const etat = String(pay.data.status || '');

  if (etat === 'authorized' || etat === 'paid') {
    const upd = {status: 'pending', molliePaymentStatus: etat, molliePaymentAuthorized: true};
    if (etat === 'paid') upd.molliePaymentCaptured = true;
    await ref.update(upd);
    console.log('orderPaymentCheck : demande ' + reqId + ' ouverte au pool (' + etat + ') — webhook non parvenu à temps');
    return {status: 'pending', ouverte: true, etat: etat};
  }
  if (['expired', 'canceled', 'failed'].indexOf(etat) >= 0) {
    if (st !== 'payment_failed') await ref.update({status: 'payment_failed', molliePaymentStatus: etat});
    return {status: 'payment_failed', echec: true, etat: etat};
  }
  return {status: st, attente: true, etat: etat};
});

exports.clientCard = onCall({secrets: ['MOLLIE_ACCESS_TOKEN']}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (!mollieApiConfigured()) return {card: null, simulated: true};
  // Cette fonction n'avait PAS de `db` : chaque `db.collection(...)` levait une
  // ReferenceError, avalée par les try/catch alentour. L'identifiant du client Mollie
  // n'était donc jamais relu ni jamais écrit — la carte enregistrée chez Mollie restait
  // introuvable chez nous, indéfiniment, et sans la moindre trace.
  const db = getFirestore();
  const action = String((request.data && request.data.action) || 'get');
  let customerId = '';
  let udoc = {};
  try {
    const snap = await db.collection('users').doc(uid).get();
    udoc = (snap.exists && snap.data()) || {};
    customerId = udoc.mollieCustomerId || '';
  } catch (e) { console.error('clientCard: fiche client illisible pour ' + uid, e); }

  // Le « client Mollie » porte les cartes mémorisées. Il naissait au premier paiement —
  // mais on doit pouvoir enregistrer sa carte AVANT toute commande, justement pour ne
  // pas la saisir le jour J. On le crée donc ici, à la demande.
  const memoriser = async (id) => {
    customerId = String(id);
    // Écriture NON silencieuse : c'est elle qui manquait, et son échec muet a fait
    // disparaître des cartes réellement enregistrées chez Mollie.
    try { await db.collection('users').doc(uid).set({mollieCustomerId: customerId}, {merge: true}); } catch (e) {
      console.error('clientCard: mollieCustomerId NON enregistré pour ' + uid, e);
    }
    return customerId;
  };
  const ensureCustomer = async () => {
    if (customerId) return customerId;
    // RATTRAPAGE : un client Mollie a pu être créé lors d'une tentative précédente sans
    // que son identifiant nous revienne. On le retrouve par la marque qu'on y laisse
    // (metadata.uid) plutôt que d'en créer un second — sinon la carte déjà enregistrée
    // resterait accrochée à un client orphelin.
    try {
      const liste = await mollieApi('/customers?limit=250', 'GET');
      const arr = (liste.ok && liste.data && liste.data._embedded && liste.data._embedded.customers) || [];
      const deja = arr.filter((c) => c && c.metadata && String(c.metadata.uid || '') === uid);
      if (deja.length) {
        deja.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        console.log('clientCard: client Mollie retrouvé pour ' + uid + ' → ' + deja[0].id);
        return await memoriser(deja[0].id);
      }
    } catch (e) { console.warn('clientCard: recherche du client Mollie', e); }
    const body = {name: String(udoc.name || 'Client Ti-Services').slice(0, 100), metadata: {uid: uid}};
    const em = String(udoc.email || (request.auth.token && request.auth.token.email) || '').slice(0, 100);
    if (em) body.email = em;
    const cust = await mollieApi('/customers', 'POST', body);
    if (cust.ok && cust.data && cust.data.id) return await memoriser(cust.data.id);
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

  // DIAGNOSTIC. Trois causes plausibles ont été corrigées sans que l'enregistrement
  // aboutisse : il faut cesser de supposer et REGARDER. On renvoie ici, pour le seul
  // compte appelant et sur ses seules données, ce que Mollie répond vraiment — identifiant
  // client, mandat inscrit sur la fiche, et la liste des mandats avec leur état. Aucun
  // numéro de carte, aucune donnée d'un tiers.
  if (action === 'diag') {
    if (!customerId) { try { await ensureCustomer(); } catch (_) {} }
    const out = {customerId: customerId || '', mandatInscrit: String(udoc.mollieMandateId || ''),
      cardSetupAt: Number(udoc.mollieCardSetupAt) || 0, dernierRefus: String(udoc.cardSetupReason || ''),
      mandats: [], httpMandats: 0, erreur: ''};
    if (!customerId) { out.erreur = 'aucun client Mollie sur la fiche'; return out; }
    try {
      const r = await mollieApi('/customers/' + encodeURIComponent(customerId) + '/mandates?limit=50', 'GET');
      out.httpMandats = r.status || (r.ok ? 200 : 0);
      const arr = (r.ok && r.data && r.data._embedded && r.data._embedded.mandates) || [];
      out.mandats = arr.map((m) => ({id: String(m.id || ''), statut: String(m.status || ''),
        methode: String(m.method || ''), cree: String(m.createdAt || '').slice(0, 19),
        detail: !!(m.details && (m.details.cardNumber || m.details.cardLabel))}));
      if (!r.ok) out.erreur = 'Mollie a refusé la lecture des mandats (HTTP ' + out.httpMandats + ')';
      else if (!arr.length) out.erreur = 'Mollie ne rattache AUCUN mandat à ce client';
    } catch (e) { out.erreur = String((e && e.message) || e).slice(0, 160); }
    return out;
  }

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
      metadata: {clientUid: uid, cardSetup: true, produit: PRODUIT},
    };
      // Un seul essai, et en carte. Le repli qui laissait Mollie choisir la méthode pouvait
    // créer un mandat PayPal : il n'aurait pas porté l'empreinte d'une commande, et la
    // carte annoncée au client n'aurait pas existé. Un refus est désormais dit, pas
    // contourné par un moyen de paiement que le reste du parcours ne sait pas honorer.
    const out = await mollieApi('/payments', 'POST', body);
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
  // Aperçu : si la fiche ne porte pas encore d'identifiant, on va voir si Mollie connaît
  // déjà ce client — une carte enregistrée ne doit jamais rester invisible.
  if (!customerId) { try { await ensureCustomer(); } catch (_) {} }
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

  // CARTE UNIQUEMENT, et c'est structurel. Tout le modèle repose sur trois choses que
  // seule la carte permet : autoriser sans débiter (l'empreinte), débiter plus tard à la
  // validation du client, et prélever hors session un pourboire ou des heures en plus.
  // Sans cette contrainte, le client se verrait proposer TOUTES les méthodes activées sur
  // le compte Mollie de Ti-Services — Mollie peut en ouvrir de nouvelles de son côté — et
  // une commande réglée autrement ferait tomber la garantie sans que personne le voie.
  const payBody = {
    amount: {currency: 'EUR', value: amount.toFixed(2)},
    description: ('Ti-Services \u00b7 ' + (r.serviceName || r.service || 'prestation')).toString().slice(0, 100),
    redirectUrl: redirectUrl,
    webhookUrl: webhookUrl,
    captureMode: 'manual',
    method: 'creditcard',
    metadata: {reqId: reqId, clientUid: uid, produit: PRODUIT},
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
          // La carte vient d'arriver : tout supplément resté en souffrance (pourboire,
          // heures en plus, coup de pouce) se prélève maintenant, sans rien redemander.
          if (pay.mandateId) {
            try { await relancerComplements(db, uid); } catch (e) { console.warn('relance après carte', e); }
          }
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
          // La commission de la PRESTATION a été retenue sur l'empreinte ; celle du
          // POURBOIRE se retient ici, sur le paiement qui le transporte. Elle couvre les
          // frais bancaires de ce second encaissement (reversé en entier, chaque
          // pourboire coûtait de l'argent à Ti-Services) — et la route ne porte plus
          // jamais 100 % du paiement.
          const commC = commissionDuComplement(r, montant);
          const netC = round2(Math.max(0, montant - commC));
          let verse = false; let orgId = '';
          try {
            orgId = r.mollieOrgId || (r.providerUid
              ? (await db.collection('artisans').doc(r.providerUid).get()).get('mollieOrgId') : '');
            if (orgId && netC > 0) {
              verse = await mollieRouteNet(pay.id, orgId, netC,
                'Ti-Services · supplément · ' + (r.serviceName || r.service || 'prestation'));
            }
          } catch (e) { console.warn('mollieWebhook complement route', e); }
          // LE MOTIF DU REFUS EST CONSERVÉ sur la demande (comme pour le net de la
          // mission) : « non reversé » sans explication fait chercher à l'aveugle, et le
          // net figé (`complementNet`) permet au rattrapage de re-router le bon montant.
          try {
            await ref.set({complementStatus: 'paye', complementPaidAt: Date.now(),
              complementCommission: commC, complementNet: netC,
              complementPayout: verse ? 'routed' : 'unrouted',
              complementPayoutIssue: verse ? '' : (orgId ? 'route_failed' : 'no_org'),
              complementPayoutMotif: verse ? '' : (routeMotif() || '')}, {merge: true});
          } catch (_) {}
          try { await db.collection('ledger').doc(reqId).set({complementPayout: verse ? 'routed' : 'unrouted', complementNet: netC}, {merge: true}); } catch (_) {}
          if (!verse) {
            try {
              await sendMail(db, ADMIN_EMAIL, {
                subject: 'Supplément encaissé mais non reversé — ' + escHtmlS(r.serviceName || r.service || 'prestation'),
                html: '<p>Le supplément a bien été prélevé au client, mais le versement à l\'artisan n\'a pas pu être routé.</p>'
                  + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li>'
                  + '<li><b>Encaissé :</b> ' + eurTxt(montant) + '</li>'
                  + '<li><b>Net à reverser :</b> ' + eurTxt(netC) + (commC ? (' (commission pourboire ' + eurTxt(commC) + ')') : '') + '</li>'
                  + '<li><b>Cause :</b> ' + (orgId ? (routeMotif() ? escHtmlS(routeMotif()) : 'routage refusé par Mollie, sans explication') : 'aucune organisation Mollie connectée') + '</li></ul>'
                  + '<p>L\'argent est en sécurité sur le solde plateforme. Console → Factures → «&nbsp;Versements prestataires bloqués&nbsp;»&nbsp;: réessayer, ou acter un virement manuel.</p>',
              });
            } catch (_) {}
          }
          console.log('Supplément payé reqId=' + reqId + ' ' + montant + ' € (net ' + netC + ') — versement ' + (verse ? 'ok' : 'à régulariser'));
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
        // NE JAMAIS RESSUSCITER UNE DEMANDE SUPPRIMÉE. `set(..., {merge:true})` CRÉE le
        // document quand il n'existe plus. Un client qui annule supprime sa demande ; si
        // l'empreinte Mollie s'autorisait ensuite — ce qui arrive, le webhook est différé —
        // la demande renaissait, sans statut, et le notificateur de création la traitait
        // comme « pending » : TOUS les prestataires étaient alertés d'une prestation
        // annulée, qu'aucun ne pouvait honorer. On écrit donc en `update`, qui échoue
        // proprement sur un document absent.
        try { await db.collection('requests').doc(reqId).update(upd); }
        catch (e) {
          if (e && e.code === 5) console.log('mollieWebhook : demande ' + reqId + ' supprimée (annulée) — rien à mettre à jour');
          else console.warn('mollieWebhook update', e);
        }
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
exports.mollieOnboardingReturn = onRequest({secrets: ['MOLLIE_CLIENT_ID', 'MOLLIE_CLIENT_SECRET', 'MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async (req, res) => {
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
    // Fiche AVANT écriture : ce chemin est le premier à voir un compte déjà vérifié
    // (« active » dès la liaison). Sans lecture préalable, il consommait la transition —
    // ni notification « paiements activés », ni rattrapage des versements en attente,
    // et les synchros suivantes ne pouvaient plus les déclencher (prevStatus déjà actif).
    let avant = {};
    try { avant = (await db.collection('artisans').doc(uid).get()).data() || {}; } catch (_) {}
    const patch = {
      mollieOrgId: orgId,
      mollieStatus: (orgId && ready.ok) ? 'active' : 'pending',
      mollieOnboardingStatus: ready.status,
      mollieCanPay: ready.canPay !== false,
      mollieCanSettle: ready.canSettle !== false,
      mollieCanWork: !!(orgId && ready.canPay === true),
      mollieDashboardUrl: ready.dashboard || '',
      mollieOnboardedAt: FieldValue.serverTimestamp(),
    };
    if (orgId && ready.ok && avant.mollieActiveNotified !== true) patch.mollieActiveNotified = true;
    await db.collection('artisans').doc(uid).set(patch, {merge: true});
    if (orgId && ready.ok && avant.mollieActiveNotified !== true) {
      try { await notifyArtisanMollieActivated(db, uid); } catch (e) { console.warn('return notify', e && e.message); }
    }
    if (orgId && ready.canSettle === true) {
      try { await rerouteArtisanPayouts(db, uid, orgId); } catch (e) { console.warn('return reroute', e && e.message); }
    }
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
exports.missionReminders = onSchedule({schedule: 'every 15 minutes', secrets: [SMTP_PASS]}, async () => {
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
    // PRESTATAIRE : push, et REPLI E-MAIL s'il n'a aucun appareil — avant, le drapeau
    // reminded1h était posé AVANT l'envoi : un artisan sans jeton perdait son rappel
    // pour toujours, sans même une trace.
    try {
      const u = (await db.collection('users').doc(r.providerUid).get()).data() || {};
      const tokens = (u.notifOn === false) ? [] : (u.pushTokens || []);
      const first = (((r.clientName || '').trim().split(/\s+/)[0]) || 'votre client');
      const where = (r.locationMode === 'salon') ? 'dans votre salon' : ('à ' + (r.zone || 'Saint-Barthélemy'));
      const corps = slot + ' — ' + first + ' ' + where + '.';
      if (tokens.length) {
        await pushMulticast(tokens, 'Dans 1 h · ' + (r.serviceName || 'Mission'), corps, '/?open=promissions',
          (tok) => db.collection('users').doc(r.providerUid).update({ pushTokens: FieldValue.arrayRemove(tok) }), 'ti-rappel-' + doc.id);
      } else if (u.email) {
        await sendMail(db, u.email, {
          subject: 'Dans 1 h · ' + (r.serviceName || 'Mission') + ' — ' + slot,
          html: '<p>Rappel : votre mission « ' + escHtmlS(r.serviceName || 'Mission') + ' » commence à ' + escHtmlS(slot) + ' (' + escHtmlS(corps) + ').</p>',
        });
      }
      // CLIENT : lui aussi a rendez-vous — il n'avait AUCUN rappel.
      if (r.clientUid) {
        const ctokens = await userPushTokens(db, r.clientUid);
        const qui = (r.providerName || 'Votre prestataire').toString().slice(0, 60);
        await pushMulticast(ctokens, 'Dans 1 h · ' + (r.serviceName || 'votre prestation'),
          slot + ' — ' + qui + ' arrive comme prévu.', '/?open=wallet&r=' + doc.id,
          (tok) => db.collection('users').doc(r.clientUid).update({ pushTokens: FieldValue.arrayRemove(tok) }), 'ti-rappel-' + doc.id);
      }
      await doc.ref.update({ reminded1h: true });
      console.log('Rappel 1 h envoyé pour ' + doc.id);
    } catch (e) { console.warn('missionReminders', doc.id, e); }
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
  // FILET : les versements restés « unrouted » (mission ou supplément) chez des artisans
  // dont les virements sont OUVERTS. Le rattrapage ne se déclenchait que sur la
  // transition canSettle false→true observée par une synchro ; un refus ponctuel de
  // Mollie (ou une transition consommée par le retour OAuth) laissait l'argent bloqué
  // pour toujours. Ici, on retente à chaque passage — zéro document = zéro coût.
  try {
    const uids = new Set();
    for (const champ of ['molliePayout', 'complementPayout']) {
      const q = await db.collection('requests').where(champ, '==', 'unrouted').limit(50).get();
      q.forEach((d) => { const u = (d.data() || {}).providerUid; if (u) uids.add(u); });
    }
    for (const uid of uids) {
      const a = (await db.collection('artisans').doc(uid).get()).data() || {};
      if (a.mollieOrgId && a.mollieCanSettle === true) {
        try { await rerouteArtisanPayouts(db, uid, a.mollieOrgId); } catch (e) { console.warn('sweep reroute', uid, e); }
      }
    }
  } catch (e) { console.warn('sweep filet unrouted', e); }
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
/**
 * autoValidate : VALIDATION AUTOMATIQUE APRÈS 48 H.
 *
 * Une prestation terminée par le prestataire attend la validation du client pour être
 * débitée et versée. Un client qui ne fait simplement rien bloquait donc son prestataire
 * INDÉFINIMENT — et l'empreinte bancaire finissait par expirer, si bien que plus personne
 * ne pouvait être payé. Passé 48 h sans réponse, la prestation est considérée comme
 * acceptée : elle passe en « payée », ce qui déclenche le règlement habituel (capture de
 * l'empreinte, facture, versement du net au prestataire).
 *
 * Deux garde-fous, parce qu'un débit automatique n'est acceptable que prévenu et évitable :
 *   • à 24 h, un rappel part au client — notification et e-mail — indiquant la date et
 *     l'heure exactes de la validation automatique, et comment contester avant ;
 *   • une prestation CONTESTÉE (statut « disputed ») n'est jamais validée automatiquement :
 *     le litige se règle d'abord.
 * Le délai court depuis l'horodatage SERVEUR de la fin de prestation, jamais depuis une
 * date envoyée par un téléphone.
 */
const AUTO_VALID_H = 48, AUTO_RAPPEL_H = 24;
exports.autoValidate = onSchedule({schedule: 'every 1 hours', secrets: [SMTP_PASS]}, async () => {
  const db = getFirestore();
  const now = Date.now();
  const ms = (ts) => { try { return (ts && ts.toMillis) ? ts.toMillis() : (Number(ts) || 0); } catch (_) { return 0; } };
  let valides = 0; let rappels = 0;
  let docs = [];
  try { docs = (await db.collection('requests').where('status', '==', 'done_pro').get()).docs; } catch (e) { console.warn('autoValidate scan', e); return; }
  for (const d of docs) {
    const r = d.data() || {};
    const depuis = ms(r.doneProAt);
    if (!depuis) continue;                    // pas d'horodatage serveur → on ne décide rien
    const heures = (now - depuis) / 3600000;

    // JAMAIS AU-DELÀ DE CE QUI A ÉTÉ ACCEPTÉ. L'écran de validation promet au client
    // qu'un ajustement À LA HAUSSE exige son feu vert : pas de silence valant accord sur
    // une somme qu'il n'a pas vue. On écarte donc les heures revues à la hausse, et tout
    // total qui dépasserait l'empreinte posée à la commande.
    const hausse = (r.finalHours != null && Number(r.finalHours) > (Number(r.duration) || 0));
    const autorise = Number(r.molliePaymentAmount) || 0;
    const duTotal = montantsDemande(r).gross;
    // Montant revu à la hausse : pas de validation automatique — mais SURTOUT pas le
    // silence. Le `continue` d'avant sautait AUSSI le rappel : c'était précisément le
    // cas qui exige l'accord du client, et le seul où il ne recevait aucune relance
    // (la demande restait en done_pro pour toujours, l'artisan jamais payé).
    const accordRequis = hausse || (autorise > 0 && duTotal > autorise + 0.009);

    if (!accordRequis && heures >= AUTO_VALID_H) {
      // On relit dans une transaction : si le client valide à la seconde près, c'est lui
      // qui gagne — on ne double jamais une validation.
      try {
        const fait = await db.runTransaction(async (tx) => {
          const s = await tx.get(d.ref);
          const cur = s.data() || {};
          if (cur.status !== 'done_pro') return false;
          tx.update(d.ref, {
            status: 'paid',
            validationAuto: true,
            validationAutoAt: FieldValue.serverTimestamp(),
            paidAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
        if (!fait) continue;
        valides++;
        console.log('autoValidate : ' + d.id + ' validée automatiquement après ' + Math.round(heures) + ' h');
        // On le dit au client — un débit qu'on découvre sur son relevé n'est pas acceptable.
        try {
          const u = (await db.collection('users').doc(r.clientUid).get()).data() || {};
          const nom = (r.serviceName || r.service || 'votre prestation').toString().slice(0, 60);
          if ((u.pushTokens || []).length) {
            await pushMulticast(u.pushTokens, 'Prestation validée automatiquement',
              nom + ' — sans réponse de votre part sous ' + AUTO_VALID_H + ' h, la prestation a été validée et réglée.',
              '/?paid=' + encodeURIComponent(d.id),
              (tok) => db.collection('users').doc(r.clientUid).update({pushTokens: FieldValue.arrayRemove(tok)}).catch(() => {}));
          }
          if (u.email) {
            await sendMail(db, u.email, {
              subject: 'Ti-Services · ' + nom + ' — prestation validée automatiquement',
              html: '<p>Bonjour,</p><p>Votre prestataire a déclaré la prestation « ' + escHtmlS(nom) + ' » terminée il y a plus de ' + AUTO_VALID_H + '&nbsp;heures. Sans réponse de votre part, elle a été <b>validée automatiquement</b> et le montant convenu a été prélevé sur votre carte, comme prévu par nos conditions générales.</p>'
                + '<p>Votre facture est disponible dans l\'application, rubrique « Historique &amp; factures ».</p>'
                + '<p><b>Un problème sur cette prestation&nbsp;?</b> Répondez à cet e-mail ou écrivez-nous depuis l\'application&nbsp;: nous examinons chaque situation.</p>'
                + '<p>L\'équipe Ti-Services</p>',
            });
          }
        } catch (e) { console.warn('autoValidate avis client', e); }
      } catch (e) { console.warn('autoValidate', d.id, e); }
      continue;
    }

    if (heures >= AUTO_RAPPEL_H && !r.autoValidRappel) {
      // Rappel unique, à mi-parcours : la date exacte, et la porte de sortie. Quand le
      // montant a été revu à la hausse (accordRequis), pas d'échéance automatique à
      // annoncer : on demande simplement la validation explicite.
      try {
        const limite = new Date(depuis + AUTO_VALID_H * 3600000);
        // Saint-Barthélemy est à UTC−4 : on annonce l'heure locale, pas l'heure serveur.
        const loc = new Date(limite.getTime() - 4 * 3600000);
        const quand = String(loc.getUTCDate()).padStart(2, '0') + '/' + String(loc.getUTCMonth() + 1).padStart(2, '0') +
          ' à ' + String(loc.getUTCHours()).padStart(2, '0') + 'h' + String(loc.getUTCMinutes()).padStart(2, '0');
        const nom = (r.serviceName || r.service || 'votre prestation').toString().slice(0, 60);
        const u = (await db.collection('users').doc(r.clientUid).get()).data() || {};
        const corpsPush = accordRequis
          ? (nom + ' — le montant a été ajusté : votre validation est nécessaire pour régler votre prestataire.')
          : (nom + ' — sans réponse, elle sera validée et réglée automatiquement le ' + quand + '.');
        if (u.notifOn !== false && (u.pushTokens || []).length) {
          await pushMulticast(u.pushTokens, 'Validez votre prestation', corpsPush,
            '/?open=' + encodeURIComponent(d.id),
            (tok) => db.collection('users').doc(r.clientUid).update({pushTokens: FieldValue.arrayRemove(tok)}).catch(() => {}));
        }
        if (u.email) {
          await sendMail(db, u.email, {
            subject: 'Ti-Services · ' + nom + (accordRequis ? ' — votre validation est attendue' : ' — à valider avant le ' + quand),
            html: '<p>Bonjour,</p><p>Votre prestataire a déclaré la prestation « ' + escHtmlS(nom) + ' » terminée.</p>'
              + (accordRequis
                ? '<p>La durée déclarée dépasse ce qui était prévu à la commande&nbsp;: <b>rien ne sera prélevé sans votre accord</b>. Ouvrez l\'application pour vérifier le détail, puis validez — votre prestataire n\'est payé qu\'à ce moment-là.</p>'
                : '<p>Sans réponse de votre part, elle sera <b>validée automatiquement le ' + escHtmlS(quand) + '</b> (heure de Saint-Barthélemy) et le montant convenu sera prélevé sur votre carte.</p>')
              + '<p><b>Tout s\'est bien passé&nbsp;?</b> Validez dès maintenant depuis l\'application&nbsp;: votre prestataire est payé immédiatement.</p>'
              + '<p><b>Un souci&nbsp;?</b> Signalez-le depuis l\'application&nbsp;: rien ne sera prélevé tant que la situation n\'est pas réglée.</p>'
              + '<p>L\'équipe Ti-Services</p>',
          });
        }
        await d.ref.update({autoValidRappel: true, autoValidRappelAt: FieldValue.serverTimestamp()});
        rappels++;
      } catch (e) { console.warn('autoValidate rappel', d.id, e); }
    }
  }
  if (valides || rappels) console.log('autoValidate : ' + valides + ' validée(s), ' + rappels + ' rappel(s).');
});

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
    // Depuis la validation automatique à 48 h, rester ici plus longtemps est ANORMAL :
    // soit l'horodatage serveur de fin de prestation manque, soit la validation
    // automatique échoue. Dans les deux cas le prestataire n'est pas payé.
    for (const d of await scan('done_pro')) {
      const r = d.data() || {}; const a = ageH(r.doneProAt || r.acceptedAt || r.createdAt);
      if (a !== null && a >= AUTO_VALID_H + 2) {
        items.push(row(d.id, r, 'terminée depuis ' + a + ' h' + (r.doneProAt ? '' : ' — fin de prestation jamais horodatée')));
      }
    }
    if (items.length) sections.push('<h3>⚠️ Prestations non validées au-delà du délai automatique (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Elles auraient dû être validées et réglées automatiquement au bout de ' + AUTO_VALID_H + '&nbsp;h. Ni capture ni versement tant qu\'elles restent ici — consulter les journaux de <code>autoValidate</code>.</p>');
  }
  // 4. Versements artisan non routés, à régulariser.
  {
    const items = [];
    try {
      for (const d of (await db.collection('requests').where('molliePayout', '==', 'unrouted').get()).docs) {
        const r = d.data() || {};
        const pourquoi = r.molliePayoutIssue === 'no_org' ? 'aucun compte Mollie connecté'
          : ('routage refusé par Mollie' + (r.molliePayoutMotif ? (' — ' + escHtmlS(String(r.molliePayoutMotif))) : ''));
        items.push(row(d.id, r, pourquoi));
      }
    } catch (e) { console.warn('reco unrouted', e); }
    // Les SUPPLÉMENTS encaissés mais non reversés (pourboire, heures en plus, coup de
    // pouce) : même situation, autre état (complementPayout) — ils n'apparaissaient
    // nulle part dans ce rapport.
    try {
      for (const d of (await db.collection('requests').where('complementPayout', '==', 'unrouted').get()).docs) {
        const r = d.data() || {};
        items.push(row(d.id, r, 'supplément encaissé non reversé ('
          + eurTxt(Number(r.complementNet != null ? r.complementNet : r.complementAmount) || 0) + ')'
          + (r.complementPayoutMotif ? (' — ' + escHtmlS(String(r.complementPayoutMotif))) : '')));
      }
    } catch (e) { console.warn('reco unrouted complements', e); }
    if (items.length) sections.push('<h3>💸 Versements artisan à régulariser (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Le client a payé, l\'artisan n\'a pas reçu son net (fonds en sécurité sur le solde plateforme). Vérifier son onboarding Mollie puis re-router (ou virement manuel) — Console → Factures → «&nbsp;Versements prestataires bloqués&nbsp;».</p>');
  }
  // 5. Suppléments facturés mais non encaissés — pourboire, heures en plus, coup de pouce.
  //    Une somme qui figure sur une facture sans avoir été prélevée ne doit jamais
  //    dormir : ni le client ne l'a payée, ni l'artisan ne l'a touchée.
  {
    const items = [];
    const mots = {impossible: 'aucun prélèvement possible', echec: 'prélèvement refusé', a_regler: 'lien de paiement en attente'};
    // On RETENTE avant de se plaindre : entre-temps le client a pu mémoriser sa carte.
    try {
      const clients = new Set();
      for (const st of ['impossible', 'echec', 'a_regler']) {
        for (const d of (await db.collection('requests').where('complementStatus', '==', st).get()).docs) {
          const c = (d.data() || {}).clientUid; if (c) clients.add(c);
        }
      }
      for (const c of clients) { try { await relancerComplements(db, c); } catch (_) {} }
    } catch (e) { console.warn('reco relance complements', e); }
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

  // 6. PRESTATIONS PAYÉES MAIS JAMAIS INSCRITES AU REGISTRE — rattrapage automatique.
  //    Une prestation réglée par le client dont le règlement serveur n'a pas abouti n'a
  //    ni numéro de facture, ni commission, ni versement : elle est invisible dans la
  //    console et l'artisan n'est pas payé. On ne se contente pas de le signaler : on
  //    touche la demande, ce qui relance `settleCommission` (rejouable tant que
  //    `commissionSettled` est absent). On signale ensuite ce qui résiste.
  {
    const items = [];
    try {
      let relances = 0;
      for (const d of await scan('paid')) {
        const r = d.data() || {};
        if (r.commissionSettled) continue;
        if (!r.providerUid) continue;            // sans prestataire, rien à régler
        const a = ageH(r.paidAt || r.settledAt || r.acceptedAt || r.createdAt);
        try { await d.ref.update({resettleAt: FieldValue.serverTimestamp()}); relances++; } catch (_) {}
        items.push(row(d.id, r, 'jamais inscrite au registre' + (a !== null ? (' depuis ' + a + ' h') : '') + ' — règlement relancé'));
      }
      if (relances) console.log('paymentReconciliation : ' + relances + ' règlement(s) relancé(s).');
    } catch (e) { console.warn('reco resettle', e); }
    if (items.length) sections.push('<h3>🧾 Prestations payées jamais inscrites au registre (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Le client a payé mais aucune facture n\'a été numérotée et aucune commission n\'a été prélevée. Le règlement vient d\'être relancé automatiquement — si la ligne revient demain, c\'est qu\'il échoue à chaque fois : consulter les journaux de <code>settleCommission</code>.</p>');
  }

  // BACKFILL DES FRAIS MOLLIE RÉELS : le règlement (settlementAmount) n'est souvent connu
  // qu'un jour ou deux après la prestation. On complète ici, chaque matin, les frais des
  // prestations réglées dont le frais Mollie n'est pas encore renseigné (200 plus récentes).
  try {
    const led = await lireRegistre(db);
    let filled = 0;
    for (const d of led) {
      const e = d.data() || {};
      if (!e.molliePaymentId) continue;
      // On relève l'état réel tant que le frais n'est pas connu OU que Mollie n'a pas
      // encore dit « payé » : une empreinte autorisée aujourd'hui peut être capturée
      // demain, et une autorisation non capturée finira par expirer. Les comptes suivent.
      if (e.mollieFee == null || e.mollieEncaisse !== true) {
        if (await recordMollieFee(db, d.id, e.molliePaymentId, e.commissionAmount)) filled++;
      }
    }
    if (filled) console.log('paymentReconciliation : ' + filled + ' écriture(s) rapprochée(s) de Mollie.');
  } catch (e) { console.warn('reco mollieFee backfill', e); }

  // 7. ÉCRITURES QUE MOLLIE N'A JAMAIS ENCAISSÉES. Après rapprochement, une prestation
  //    facturée dont le paiement n'est pas « paid » chez Mollie n'a rien à faire dans la
  //    comptabilité — et surtout, elle signale que personne n'a été débité.
  try {
    const items = [];
    const led = await lireRegistre(db);
    for (const d of led) {
      const e = d.data() || {};
      if (e.exclu) continue;
      if (e.mollieEncaisse === true) continue;
      items.push('<li><b>' + escHtmlS(e.serviceName || e.service || 'prestation') + '</b> — ' +
        escHtmlS(e.clientName || '?') + ' / ' + escHtmlS(e.providerName || '?') + ' — ' +
        eurTxt(Number(e.grossTotal) || 0) + ' — facture ' + escHtmlS(e.invNo || '—') +
        ' — état Mollie : <b>' + escHtmlS(e.mollieStatus || (e.molliePaymentId ? 'non relevé' : 'aucun paiement')) + '</b></li>');
    }
    if (items.length) sections.push('<h3>🏦 Facturé mais jamais encaissé chez Mollie (' + items.length + ')</h3><ul>' + items.join('') + '</ul><p>Ces prestations <b>ne comptent pas</b> dans le chiffre d\'affaires ni dans les commissions&nbsp;: les comptes se calquent sur ce que Mollie a réellement encaissé. Une empreinte « authorized » peut encore être capturée&nbsp;; « expired » ou « failed » veut dire que personne n\'a été débité.</p>');
  } catch (e) { console.warn('reco non encaissees', e); }

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
// Lignes et total de la facture — calculés par la SOURCE UNIQUE (montantsDemande), la
// même que celle du règlement. Chacun calculait de son côté et ils divergeaient : la
// facture ajoutait un forfait de déplacement même quand le client s'était rendu chez le
// prestataire, et oubliait le multiplicateur « par personne » ainsi que les options ; le
// règlement, lui, ignorait le forfait de déplacement. Un document légal ne peut pas
// annoncer un montant différent de celui qui est prélevé.
function invoiceLines(r) {
  const M = montantsDemande(r);
  const lines = [];
  const acts = Array.isArray(r.acts) ? r.acts : null;
  const per = peopleCount(r.service, r.people);
  const perTxt = (per > 1) ? (' \u00d7 ' + per + ' pers.') : '';
  if (acts && acts.length) {
    acts.forEach((a) => {
      const q = Number(a.qty) || 1; const pu = Number(a.price) || 0;
      lines.push({ label: (a.nm || 'Prestation') + perTxt, qty: String(q), unit: eurTxt(pu), total: round2(pu * q * per) });
    });
  } else {
    const rate = Number(r.rate) || 0;
    const forfait = r.unit === 'forfait';
    const hours = forfait ? 1 : ((r.finalHours != null) ? Number(r.finalHours) : (Number(r.duration) || 1));
    const dayU = r.unit === 'j';
    lines.push({ label: (r.serviceName || 'Prestation') + perTxt,
      qty: forfait ? 'forfait' : (hours + (dayU ? ' j' : ' h')), unit: eurTxt(rate), total: round2(rate * hours * per) });
  }
  // Options / prestations additionnelles : elles étaient prélevées sans jamais apparaître
  // sur la facture. Chacune a désormais sa ligne.
  const opts = Array.isArray(r.options) ? r.options : null;
  if (opts && opts.length) {
    opts.forEach((o) => {
      const q = Number(o.qty) || 1; const pu = Number(o.price) || 0;
      if (pu * q > 0) lines.push({ label: o.nm || 'Prestation complémentaire', qty: String(q), unit: eurTxt(pu), total: round2(pu * q) });
    });
  }
  if (M.maj > 0) lines.push({ label: 'Coup de pouce' + (M.boostPct ? (' +' + M.boostPct + '%') : ''), qty: '1', unit: eurTxt(M.maj), total: M.maj });
  if (M.travel > 0) lines.push({ label: 'Forfait de d\u00e9placement', qty: '1', unit: eurTxt(M.travel), total: M.travel });
  // Le pourboire est une LIBÉRALITÉ du client, hors prix de la prestation et hors
  // commission, reversée en totalité au prestataire. La facture doit le dire.
  if (M.tip > 0) lines.push({ label: 'Pourboire \u2014 libéralité, revers\u00e9e int\u00e9gralement au prestataire', qty: '1', unit: eurTxt(M.tip), total: M.tip });
  return { lines, total: M.gross, tip: M.tip };
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
     'notre équipe, vous recevrez vos premières <b>demandes de mission</b>, partout à Saint-Barthélemy.') :
    ('Votre compte <b>Ti-Services</b> est créé, votre inscription est confirmée. Réservez en quelques minutes un ' +
     'intervenant local et de confiance, où que vous soyez à Saint-Barth : ménage, jardinage, coiffure, sport, ' +
     'garde d\'enfants, et bien plus.');

  const feats = isPro ? (
    welcomeFeatureRow(dot, 'Des missions dans toute l\'île', 'Recevez toutes les demandes de Saint-Barthélemy pour vos métiers, selon les créneaux que vous choisissez.') +
    welcomeFeatureRow(dot, 'Vous gardez la main', 'Vous acceptez uniquement les missions qui vous conviennent et gérez votre agenda.') +
    welcomeFeatureRow(dot, 'Un cadre sérieux', 'Profils vérifiés et assurés : un environnement de confiance pour vous et vos clients.')
  ) : (
    welcomeFeatureRow(dot, 'Des intervenants vérifiés', 'Identité, SIRET et assurance contrôlés avant l\'activation de chaque profil.') +
    welcomeFeatureRow(dot, '100 % Saint-Barth', 'Des professionnels locaux, disponibles à la demande, près de chez vous.') +
    welcomeFeatureRow(dot, 'Suivi en direct', 'Vous suivez votre intervention et échangez avec votre intervenant dans l\'app.')
  );

  const ctaLabel = isPro ? 'Ouvrir mon espace' : 'Ouvrir Ti-Services';

  // BLOC CROISÉ : chacun des deux mondes propose l'autre. Un client peut aussi être
  // professionnel (et inversement) — avec une AUTRE adresse e-mail, chaque compte ayant
  // la sienne. Le lien ouvre DIRECTEMENT le bon formulaire d'inscription dans l'app
  // (deep-links ?open=pro-signup / ?open=client-signup). Plus de bloc « installez
  // l'application » : l'inscription ne se fait aujourd'hui qu'APRÈS l'installation,
  // ce mail arrive donc toujours chez quelqu'un qui a déjà l'app.
  const crossTitle = isPro ? 'Besoin d\'un service pour vous ?' : 'Vous êtes aussi professionnel ?';
  const crossText = isPro ?
    ('Ti-Services marche dans les deux sens&nbsp;: avec <b>une autre adresse e-mail</b>, créez aussi votre ' +
     '<b>compte client</b> pour réserver ménage, jardinage, coiffure, sport et plus — près de chez vous.') :
    ('Proposez vos services sur Ti-Services et recevez des missions dans toute l\'île. Créez votre ' +
     '<b>profil intervenant</b> — avec <b>une autre adresse e-mail</b> que celle de ce compte.');
  const crossHref = app + (isPro ? '/?open=client-signup' : '/?open=pro-signup');
  const crossLabel = isPro ? 'Créer mon compte client' : 'Devenir intervenant';
  const crossBtn = isPro ? '#FF6A5B' : '#0FA896';   // l'accent de l'AUTRE monde
  const crossBlock =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7F4;border:1px solid #efeae4;border-radius:14px;margin-top:6px">' +
      '<tr><td style="padding:16px 18px">' +
        '<div style="font-size:14px;font-weight:700;color:#231E33">' + crossTitle + '</div>' +
        '<div style="font-size:13px;color:#6b6577;line-height:1.55;margin:6px 0 12px">' + crossText + '</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">' +
          '<a href="' + crossHref + '" style="display:inline-block;background:' + crossBtn + ';color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:11px">' + crossLabel + '</a>' +
        '</td></tr></table>' +
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
          '<tr><td style="padding:6px 30px 0">' + crossBlock + '</td></tr>' +
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
    welcomeFeatureRow(dot, 'Des missions dans toute l\'île', 'Recevez toutes les demandes de Saint-Barthélemy pour vos métiers, sur les créneaux que vous choisissez.') +
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

/* ============================================================================
 * RÉCUPÉRATION D'UN COMPTE SUPPRIMÉ — PITR (lecture à un instant donné).
 *
 * Firestore garde un historique des versions (1 h par défaut, 7 jours une fois la
 * « récupération à un instant donné » activée dans la console Google Cloud). Cette
 * fonction relit, À LA DATE DEMANDÉE, la fiche users + artisans + concierges d'un
 * compte (retrouvé par e-mail), puis la réécrit — sur le compte d'origine, ou sur le
 * NOUVEAU compte si la personne s'est réinscrite (l'authentification supprimée ne se
 * restaure pas : seule la base revient). Lecture CIBLÉE : personne d'autre ne bouge.
 *
 * REST + readTime plutôt que le SDK : c'est l'API documentée de PITR, et elle dit
 * clairement pourquoi elle refuse (fenêtre dépassée, PITR non activé…).
 * ========================================================================== */
async function pitToken() {
  const {GoogleAuth} = require('google-auth-library');
  const auth = new GoogleAuth({scopes: ['https://www.googleapis.com/auth/datastore']});
  return await auth.getAccessToken();
}
// Valeur REST Firestore -> valeur JS/SDK (récursif). Les horodatages redeviennent des
// Timestamps (sinon ils reviendraient en chaînes et cassaient les .toMillis() de l'app).
function pitVal(v) {
  const {Timestamp} = require('firebase-admin/firestore');
  if (v == null || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Timestamp.fromDate(new Date(v.timestampValue));
  if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k of Object.keys(f)) o[k] = pitVal(f[k]); return o; }
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(pitVal);
  return null;   // bytes/référence/géopoint : inutilisés dans nos fiches
}
function pitFields(doc) { const o = {}; const f = (doc && doc.fields) || {}; for (const k of Object.keys(f)) o[k] = pitVal(f[k]); return o; }
exports.adminRestoreAccount = onCall({timeoutSeconds: 120}, async (request) => {
  const who = (request.auth && request.auth.token && request.auth.token.email) || '';
  if (!who || who.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.');
  }
  const email = String((request.data && request.data.email) || '').trim().toLowerCase().slice(0, 200);
  const atISO = String((request.data && request.data.at) || '').trim();
  const targetUid = String((request.data && request.data.targetUid) || '').trim().slice(0, 128);
  if (!/.+@.+\..+/.test(email)) throw new HttpsError('invalid-argument', 'E-mail du compte à récupérer manquant.');
  const at = new Date(atISO);
  if (isNaN(at.getTime())) throw new HttpsError('invalid-argument', 'Date/heure invalide.');
  if (at.getTime() >= Date.now()) throw new HttpsError('invalid-argument', 'La date doit être dans le passé (au moment où le compte existait encore).');
  if (Date.now() - at.getTime() > 7 * 86400000) throw new HttpsError('invalid-argument', 'Au-delà de 7 jours : hors fenêtre de récupération Firestore.');

  const projet = process.env.GCLOUD_PROJECT || 't-service-prod';
  const base = 'https://firestore.googleapis.com/v1/projects/' + projet + '/databases/(default)';
  const readTime = at.toISOString();
  const tok = await pitToken();
  const appel = async (chemin, corps) => {
    const res = await fetch(base + chemin, {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'},
      body: JSON.stringify(corps),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      // FAILED_PRECONDITION = readTime hors fenêtre (PITR non activé => 1 h seulement).
      throw new HttpsError('failed-precondition', 'Firestore refuse la lecture à cette date : ' + String(msg).slice(0, 300)
        + ' — si la récupération 7 jours n\'est pas activée sur le projet, seule la dernière heure est lisible.');
    }
    return data;
  };

  // 1) Retrouver le compte tel qu'il était à cette date, par son e-mail.
  const q = await appel('/documents:runQuery', {
    structuredQuery: {from: [{collectionId: 'users'}], where: {fieldFilter: {field: {fieldPath: 'email'}, op: 'EQUAL', value: {stringValue: email}}}, limit: 5},
    readTime,
  });
  const ligne = (Array.isArray(q) ? q : []).find((x) => x.document && x.document.name);
  if (!ligne) throw new HttpsError('not-found', 'Aucun compte « ' + email + ' » à cette date. Essayez une date où le compte existait encore (avant la suppression).');
  const oldUid = ligne.document.name.split('/').pop();
  const usersDoc = pitFields(ligne.document);

  // 2) Relire les fiches artisan / conciergerie du même compte, à la même date.
  const bg = await appel('/documents:batchGet', {
    documents: [base.replace('https://firestore.googleapis.com/v1/', '') + '/documents/artisans/' + oldUid,
      base.replace('https://firestore.googleapis.com/v1/', '') + '/documents/concierges/' + oldUid],
    readTime,
  });
  let artDoc = null; let concDoc = null;
  for (const r of (Array.isArray(bg) ? bg : [])) {
    if (r.found && r.found.name) {
      if (r.found.name.indexOf('/artisans/') >= 0) artDoc = pitFields(r.found);
      if (r.found.name.indexOf('/concierges/') >= 0) concDoc = pitFields(r.found);
    }
  }

  // 3) Réécrire — sur le nouveau compte si fourni (réinscription), sinon sur l'ancien.
  const cible = targetUid || oldUid;
  const db = getFirestore();
  // Jetons push d'époque écartés (appareils re-enregistrés par le nouveau compte) ;
  // l'e-mail reste celui du compte CIBLE s'il existe déjà (réinscription).
  delete usersDoc.pushTokens;
  if (targetUid && targetUid !== oldUid) delete usersDoc.email;
  const marque = {restoredFromPIT: readTime, restoredFromUid: oldUid, restoredAt: FieldValue.serverTimestamp()};
  const restaure = [];
  await db.collection('users').doc(cible).set(Object.assign({}, usersDoc, marque), {merge: true}); restaure.push('users');
  if (artDoc) { await db.collection('artisans').doc(cible).set(Object.assign({}, artDoc, marque), {merge: true}); restaure.push('artisans'); }
  if (concDoc) { await db.collection('concierges').doc(cible).set(Object.assign({}, concDoc, marque), {merge: true}); restaure.push('concierges'); }
  console.log('adminRestoreAccount : ' + email + ' (' + oldUid + ') → ' + cible + ' [' + restaure.join(', ') + '] à ' + readTime);
  return {
    oldUid, wroteTo: cible, restored: restaure,
    warning: (cible === oldUid)
      ? 'Fiches restaurées sur le compte d\'origine. Son ACCÈS (e-mail/mot de passe) reste supprimé : si la personne se réinscrit, relancez la récupération en indiquant son nouvel identifiant pour tout raccrocher.'
      : 'Fiches raccrochées au nouveau compte. Les anciennes réservations et factures restent liées à l\'ancien identifiant au registre (la comptabilité ne se réécrit pas).',
  };
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
async function releaseMollieHold(db, reqId, r, contexte) {
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
        await sendMail(db, ADMIN_EMAIL, {
          subject: 'Empreinte à libérer à la main — ' + (contexte || 'demande annulée'),
          html: '<p>Une demande a été ' + escHtmlS(contexte || 'annulée') + ', mais Mollie refuse d\'annuler l\'autorisation : la somme reste réservée sur la carte du client jusqu\'à expiration.</p>'
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
  } catch (e) { console.warn('releaseMollieHold', e); }
}
exports.releaseHoldOnDelete = onDocumentDeleted({document: 'requests/{reqId}', secrets: ['MOLLIE_ACCESS_TOKEN']}, async (event) => {
  const r = (event.data && typeof event.data.data === 'function' && event.data.data()) || {};
  await releaseMollieHold(getFirestore(), event.params.reqId, r, 'supprimée');
});

/**
 * settleCancellation : les ANNULATIONS et EXPIRATIONS, enfin traitées côté serveur.
 * Jusqu'ici, un statut « cancelled » ou « expired » ne déclenchait RIEN :
 *  - l'artisan assigné n'apprenait l'annulation qu'en rouvrant l'app ;
 *  - l'empreinte bancaire du client restait réservée jusqu'à expiration naturelle
 *    (seule la SUPPRESSION du document la libérait) ;
 *  - l'indemnité d'annulation tardive « appliquée » par l'artisan n'existait que dans
 *    ses statistiques locales : rien n'était réellement prélevé au client, rien n'était
 *    versé à l'artisan, rien n'entrait au registre.
 */
exports.settleCancellation = onDocumentUpdated({document: 'requests/{reqId}', secrets: ['MOLLIE_ACCESS_TOKEN', SMTP_PASS]}, async (event) => {
  const before = (event.data && event.data.before && event.data.before.data()) || {};
  const after = (event.data && event.data.after && event.data.after.data()) || {};
  const reqId = event.params.reqId;
  const db = getFirestore();
  const svc = (after.serviceName || after.service || 'prestation').toString().slice(0, 60);

  const notifieArtisan = async (titre, corps) => {
    const uid = after.providerUid || before.providerUid;
    if (!uid) return;
    const tokens = await userPushTokens(db, uid);
    await pushMulticast(tokens, titre, corps, '/?open=promissions',
      (tok) => db.collection('users').doc(uid).update({pushTokens: FieldValue.arrayRemove(tok)}), 'ti-annul-' + reqId);
    try {
      const u = (await db.collection('users').doc(uid).get()).data() || {};
      if (u.email) await sendMail(db, u.email, {subject: 'Ti-Services · ' + titre, html: '<p>' + escHtmlS(corps) + '</p><p>Le détail est dans votre espace Missions.</p>'});
    } catch (_) {}
  };
  const notifieClient = async (titre, corps, mailAussi) => {
    const uid = after.clientUid;
    if (!uid) return;
    const tokens = await userPushTokens(db, uid);
    await pushMulticast(tokens, titre, corps, '/?open=wallet&r=' + reqId,
      (tok) => db.collection('users').doc(uid).update({pushTokens: FieldValue.arrayRemove(tok)}), 'ti-annul-' + reqId);
    if (mailAussi) {
      try {
        const u = (await db.collection('users').doc(uid).get()).data() || {};
        if (u.email) await sendMail(db, u.email, {subject: 'Ti-Services · ' + titre, html: '<p>' + escHtmlS(corps) + '</p>'});
      } catch (_) {}
    }
  };

  // 1) ANNULATION. Tardive (lateCancel) : l'empreinte RESTE en place — le prestataire
  //    décide de l'indemnité. Sinon : on libère la somme réservée et on prévient.
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    if (after.lateCancel) {
      await notifieArtisan('Mission annulée à moins de 8 h',
        (after.clientName || 'Le client') + ' a annulé « ' + svc + ' ». C\'est à vous de décider : appliquer l\'indemnité de 50 % ou y renoncer, depuis votre espace Missions.');
    } else {
      await releaseMollieHold(db, reqId, after, 'annulée');
      await notifieArtisan('Mission annulée', (after.clientName || 'Le client') + ' a annulé « ' + svc + ' ». Le créneau est de nouveau libre.');
    }
    return;
  }

  // 2) EXPIRATION (demande non honorée, purgée 12 h après son créneau) : on libère
  //    l'empreinte et on informe les deux parties — avant, PERSONNE n'était prévenu et
  //    la somme restait réservée sur la carte du client jusqu'à expiration bancaire.
  if (before.status !== 'expired' && after.status === 'expired') {
    await releaseMollieHold(db, reqId, after, 'expirée');
    if (after.molliePaymentId && !after.mollieCaptured) {
      await notifieClient('Demande expirée', 'Votre demande de ' + svc + ' n\'a pas été honorée : rien n\'est prélevé, la somme réservée vous est rendue.', true);
    }
    await notifieArtisan('Mission expirée', 'La mission « ' + svc + ' » n\'a pas été honorée dans les temps — elle est retirée de votre planning.');
    return;
  }

  // 3) DÉCISION SUR L'INDEMNITÉ d'une annulation tardive.
  if (after.status !== 'cancelled' || before.feeDecision === after.feeDecision) return;

  if (after.feeDecision === 'waived') {
    // Le prestataire renonce : la somme réservée est rendue au client.
    await releaseMollieHold(db, reqId, after, 'annulée (indemnité levée)');
    await notifieClient('Annulation sans frais', 'Le prestataire a renoncé à l\'indemnité pour « ' + svc + ' » : rien n\'est prélevé, la somme réservée vous est rendue.', true);
    return;
  }

  if (after.feeDecision !== 'applied' || after.cancelFeeSettled) return;
  // Le prestataire applique l'indemnité de 50 % : on la PRÉLÈVE réellement (capture
  // partielle de l'empreinte), on retient la commission, on VERSE le net à l'artisan et
  // on inscrit le tout au registre. L'app de l'artisan affichait déjà tout cela — mais
  // aucun argent ne bougeait.
  const fee = round2(Number(after.cancelFee) || 0);
  const payId = after.molliePaymentId || '';
  if (!(fee > 0) || !payId || !mollieApiConfigured()) {
    console.warn('Indemnité inapplicable reqId=' + reqId + ' fee=' + fee + ' pay=' + (payId || 'aucun'));
    try {
      await sendMail(db, ADMIN_EMAIL, {
        subject: 'Indemnité d\'annulation NON prélevable — ' + svc,
        html: '<p>Le prestataire a appliqué l\'indemnité, mais elle ne peut pas être prélevée automatiquement.</p>'
          + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li><li><b>Indemnité :</b> ' + eurTxt(fee) + '</li>'
          + '<li><b>Cause :</b> ' + (payId ? 'montant nul' : 'aucun paiement Mollie sur la demande') + '</li></ul>',
      });
    } catch (_) {}
    return;
  }
  try {
    const p = await mollieApi('/payments/' + encodeURIComponent(payId), 'GET');
    const st = (p.ok && p.data) ? (p.data.status || '') : '';
    if (st !== 'authorized') {
      console.warn('Indemnité : empreinte non capturable reqId=' + reqId + ' (' + st + ')');
      try {
        await sendMail(db, ADMIN_EMAIL, {
          subject: 'Indemnité d\'annulation à régulariser — ' + svc,
          html: '<p>Le prestataire a appliqué l\'indemnité de 50 %, mais l\'empreinte n\'est plus capturable (statut Mollie : ' + escHtmlS(st || 'inconnu') + ').</p>'
            + '<ul><li><b>Demande :</b> ' + escHtmlS(reqId) + '</li><li><b>Indemnité :</b> ' + eurTxt(fee) + '</li>'
            + '<li><b>Paiement :</b> ' + escHtmlS(payId) + '</li></ul>'
            + '<p>À faire : prélever ou facturer à la main, puis régler l\'artisan.</p>',
        });
      } catch (_) {}
      return;
    }
    const cap = await mollieApi('/payments/' + encodeURIComponent(payId) + '/captures', 'POST',
      {amount: {currency: 'EUR', value: fee.toFixed(2)}, description: ('Ti-Services · indemnité annulation · ' + svc).slice(0, 100)});
    if (!cap.ok) {
      console.warn('Indemnité : capture refusée reqId=' + reqId, cap.status);
      try {
        await sendMail(db, ADMIN_EMAIL, {
          subject: 'Indemnité d\'annulation : capture refusée — ' + svc,
          html: '<p>Mollie a refusé la capture de l\'indemnité (' + eurTxt(fee) + ') sur la demande ' + escHtmlS(reqId) + ' (HTTP ' + escHtmlS(String(cap.status || '?')) + ').</p>',
        });
      } catch (_) {}
      return;
    }
    // Commission sur l'indemnité : même règle que l'app de l'artisan (taux de fidélité,
    // avantage fondateur, plancher petits montants sur l'assiette de l'indemnité).
    let jobsTotal = 0; let isFounder = false; let founderSinceMs = null; let founderGross = 0; let refBonusJobs = 0;
    try {
      const a = (await db.collection('artisans').doc(after.providerUid).get()).data() || {};
      jobsTotal = a.jobsTotal || 0; isFounder = !!a.founder; founderGross = Number(a.founderGross) || 0;
      founderSinceMs = (a.founderSince && a.founderSince.toMillis) ? a.founderSince.toMillis() : (typeof a.founderSince === 'number' ? a.founderSince : null);
      refBonusJobs = Number(a.refBonusJobs) || 0;
    } catch (_) {}
    let cfgTiers = null;
    try { const cfg = (await db.collection('settings').doc('config').get()).data() || {}; if (Array.isArray(cfg.fidTiers)) cfgTiers = cfg.fidTiers; } catch (_) {}
    const founderStartMs = Math.max(founderSinceMs || 0, FOUNDER_LAUNCH_MS);
    const founderActive = isFounder && (Date.now() - founderStartMs) < FOUNDER_DAYS * 86400000 && founderGross < FOUNDER_GROSS_CAP;
    const basePct = founderActive ? FOUNDER_COMM_PCT : commissionTierPct(jobsTotal + refBonusJobs, cfgTiers);
    const pct = (fee < SMALL_COMM_MIN) ? Math.max(basePct, SMALL_COMM_PCT) : basePct;
    const commission = round2(fee * pct / 100);
    const net = round2(fee - commission);
    // Registre comptable (document distinct : la demande n'a jamais été réglée).
    try {
      await db.collection('ledger').doc(reqId + '-annulation').set({
        type: 'cancel-fee', reqId: reqId,
        clientUid: after.clientUid || null, clientName: (after.clientName || '').toString().slice(0, 80),
        providerUid: after.providerUid || null, providerName: (after.providerName || '').toString().slice(0, 80),
        service: after.service || '', serviceName: svc,
        grossTotal: fee, commissionPct: pct, commissionAmount: commission, netAmount: net,
        molliePaymentId: payId, settledAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    } catch (e) { console.warn('ledger annulation', e); }
    // Versement du net à l'artisan — même circuit que les prestations : en cas de refus,
    // la fiche passe « unrouted » et tous les rattrapages existants prennent le relais.
    let orgId = '';
    try { orgId = ((await db.collection('artisans').doc(after.providerUid).get()).data() || {}).mollieOrgId || ''; } catch (_) {}
    const routed = (orgId && net > 0) ? await mollieRouteNet(payId, orgId, net, 'Ti-Services · indemnité annulation · ' + svc) : false;
    await event.data.after.ref.update({
      cancelFeeSettled: true, cancelFeeCommissionPct: pct, cancelFeeCommission: commission, cancelFeeNet: net,
      mollieCaptured: true, mollieCaptureAmount: fee,
      molliePayout: routed ? 'routed' : 'unrouted',
      molliePayoutIssue: routed ? '' : (orgId ? 'route_failed' : 'no_org'),
      molliePayoutMotif: routed ? '' : (routeMotif() || ''), molliePayoutNet: net,
    });
    try { await db.collection('ledger').doc(reqId + '-annulation').set({molliePayout: routed ? 'routed' : 'unrouted'}, {merge: true}); } catch (_) {}
    await notifieClient('Indemnité d\'annulation prélevée',
      'Annulation à moins de 8 h de « ' + svc + ' » : le prestataire a appliqué l\'indemnité de 50 %, soit ' + eurTxt(fee) + ', prélevée sur votre carte comme prévu par les conditions générales.', true);
    await notifieArtisan('Indemnité appliquée · ' + eurTxt(fee),
      'L\'indemnité d\'annulation de « ' + svc + ' » a été prélevée au client — vous percevez ' + eurTxt(net) + (routed ? '.' : ' (versement en cours).'));
    console.log('Indemnité réglée reqId=' + reqId + ' ' + fee + ' € (net ' + net + ' €, ' + (routed ? 'routé' : 'à router') + ')');
  } catch (e) { console.warn('settleCancellation', reqId, e); }
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
