'use strict';
/**
 * Remise à zéro TOTALE de la BÊTA Ti-Services (projet ti-service-e8ced).
 *
 * Efface : tous les comptes Auth, toutes les collections Firestore,
 * tous les fichiers Storage. La bêta repart vierge, comme le site réel.
 *
 * TRIPLE GARDE-FOU (voir aussi .github/workflows/beta-purge.yml) :
 *   1. PROJECT_ID doit valoir ti-service-e8ced ;
 *   2. le project_id de la clé de service doit valoir ti-service-e8ced ;
 *   3. le workflow exige la saisie manuelle « PURGER-BETA ».
 * => Impossible de viser la production (t-service-prod), qui utilise un
 *    autre secret et un autre PROJECT_ID.
 */
const admin = require('firebase-admin');

const BETA = 'ti-service-e8ced';
const PROJECT = process.env.PROJECT_ID || '';

function abort(msg) { console.error('ABANDON : ' + msg); process.exit(1); }

if (PROJECT !== BETA) abort('PROJECT_ID = "' + PROJECT + '" (attendu ' + BETA + ').');

// Vérifie le projet réel porté par la clé de service (garde-fou n°2).
let keyProject = '';
try {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath) keyProject = require(keyPath).project_id || '';
} catch (_) { /* la clé peut venir d'une autre source */ }
if (keyProject && keyProject !== BETA) {
  abort('La clé de service vise "' + keyProject + '", pas la bêta ' + BETA + '.');
}

admin.initializeApp({ projectId: BETA });
const auth = admin.auth();
const db = admin.firestore();

async function purgeAuth() {
  let token, total = 0;
  do {
    const res = await auth.listUsers(1000, token);
    if (res.users.length) {
      const uids = res.users.map(function (u) { return u.uid; });
      const r = await auth.deleteUsers(uids);
      total += r.successCount;
      if (r.failureCount) {
        console.warn('Auth : ' + r.failureCount + ' échec(s).');
        r.errors.forEach(function (e) { console.warn('  - ' + e.error.message); });
      }
    }
    token = res.pageToken;
  } while (token);
  console.log('Auth : ' + total + ' compte(s) supprimé(s).');
}

async function purgeFirestore() {
  const cols = await db.listCollections();
  if (!cols.length) { console.log('Firestore : déjà vide.'); return; }
  for (const c of cols) {
    await db.recursiveDelete(c);
    console.log('Firestore : collection « ' + c.id +' » effacée.');
  }
}

async function purgeStorage() {
  // Le bucket bêta peut être nommé .appspot.com (ancien) ou .firebasestorage.app.
  const candidates = [
    process.env.STORAGE_BUCKET,
    BETA + '.appspot.com',
    BETA + '.firebasestorage.app'
  ].filter(Boolean);
  for (const name of candidates) {
    try {
      const bucket = admin.storage().bucket(name);
      const [exists] = await bucket.exists();
      if (!exists) continue;
      await bucket.deleteFiles({ force: true });
      console.log('Storage : fichiers du bucket « ' + name + ' » supprimés.');
      return;
    } catch (e) {
      console.warn('Storage : bucket « ' + name + ' » ignoré (' + e.message + ').');
    }
  }
  console.log('Storage : aucun bucket à purger.');
}

(async function () {
  console.log('=== PURGE BÊTA ' + BETA + ' ===');
  await purgeAuth();
  await purgeFirestore();
  await purgeStorage();
  console.log('=== Purge terminée : la bêta repart de zéro. ===');
})().catch(function (e) { console.error(e); process.exit(1); });
