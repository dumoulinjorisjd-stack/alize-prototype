/* ÉPREUVE DES RÈGLES FIRESTORE, CONTRE LE VRAI MOTEUR.
   À LANCER AVANT TOUTE MISE EN LIGNE QUI TOUCHE `firestore.rules`.

   On ne raisonne pas sur le TEXTE des règles, on demande au moteur ce qu'il autorise :
   une règle relue paraît toujours juste, et une erreur d'évaluation refuse pour la
   mauvaise raison — ce qui passerait pour une porte fermée. Chaque mesure a donc sa
   moitié POSITIVE (ce qui doit rester possible) à côté de sa moitié négative.

   MODE D'EMPLOI (l'émulateur n'est pas dans le dépôt, il se télécharge) :

     mkdir -p /tmp/rt && cd /tmp/rt && npm init -y
     npm i @firebase/rules-unit-testing firebase firebase-tools
     cp <depot>/firestore.rules .
     printf '%s' '{"emulators":{"firestore":{"port":8080},"ui":{"enabled":false}},
                   "firestore":{"rules":"firestore.rules"}}' > firebase.json
     npx firebase emulators:start --only firestore --project demo-ti &
     cp <depot>/tests/regles.emulateur.mjs .   # node resout ses modules depuis ICI
     node regles.emulateur.mjs

   Il faut Java pour l'émulateur. Le fichier de règles est lu dans le répertoire
   COURANT : on l'y recopie depuis le dépôt avant de lancer. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, arrayUnion, deleteField } from 'firebase/firestore';
import fs from 'fs';

const CLI = 'uid-client', PRO = 'uid-pro', AUTRE = 'uid-autre';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const passe = async (p) => { try { await p; return true; } catch (e) { return false; } };

const env = await initializeTestEnvironment({
  projectId: 'demo-ti',
  firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync('firestore.rules', 'utf8') },
});

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (c) => {
  const d = c.firestore();
  await setDoc(doc(d, 'artisans', PRO), { status: 'valide', name: 'Pro' });
  await setDoc(doc(d, 'artisans', AUTRE), { status: 'valide', name: 'Autre' });
  await setDoc(doc(d, 'users', CLI), { name: 'Client', mollieCustomerId: 'cst_LEGITIME', mollieMandateId: 'mdt_LEGITIME' });
  await setDoc(doc(d, 'requests', 'R1'), {
    clientUid: CLI, providerUid: PRO, status: 'accepted', rate: 35, duration: 2,
    service: 'menage', serviceName: 'Ménage', unit: 'h',
    messages: [{ from: 'client', text: 'bonjour', at: 1 }],
    supportClient: [], supportPro: [],
    // Les prix détaillés et le pourboire : ce qui décide du TOTAL à prélever.
    acts: [{ id: 'a1', nm: 'Prestation', price: 35, qty: 2 }], options: [], tip: 0,
  });
  await setDoc(doc(d, 'settings', 'installFunnel_prod'), { install: 42 });
  await setDoc(doc(d, 'settings', 'catalog'), { services: [] });
});

/* CHAQUE CONTEXTE PORTE UNE ADRESSE : `isAdmin()` lit `token.email`, et sans elle
   la règle LÈVE au lieu de décider — un refus pour la mauvaise raison masquerait
   une vraie porte ouverte. */
const dCli = env.authenticatedContext(CLI, { email: 'client@exemple.fr', email_verified: true }).firestore();
const dPro = env.authenticatedContext(PRO, { email: 'pro@exemple.fr', email_verified: true }).firestore();
const dAut = env.authenticatedContext(AUTRE, { email: 'autre@exemple.fr', email_verified: true }).firestore();
const dAno = env.unauthenticatedContext().firestore();
const R = (d) => doc(d, 'requests', 'R1');

console.log('\n── LE FIL DE DISCUSSION ──');
ok(await passe(updateDoc(R(dCli), { messages: arrayUnion({ from: 'client', text: 'a', at: 2 }) })),
   'le client écrit son propre message (doit rester possible)');
ok(await passe(updateDoc(R(dPro), { messages: arrayUnion({ from: 'pro', text: 'b', at: 3 }) })),
   'le prestataire écrit le sien (doit rester possible)');
ok(!(await passe(updateDoc(R(dCli), { messages: arrayUnion({ from: 'pro', text: 'JE SIGNE À SA PLACE', at: 4 }) }))),
   'le client NE signe PAS à la place du prestataire');
ok(!(await passe(updateDoc(R(dPro), { messages: arrayUnion({ from: 'client', text: 'À SA PLACE', at: 5 }) }))),
   'le prestataire NE signe PAS à la place du client');
ok(!(await passe(updateDoc(R(dCli), { messages: arrayUnion({ from: 'admin', text: 'Ti-Services vous informe…', at: 6 }) }))),
   'personne ne se fait passer pour Ti-Services');
ok(!(await passe(updateDoc(R(dCli), { messages: [] }))),
   'le client n’EFFACE pas le fil');
ok(!(await passe(updateDoc(R(dPro), { messages: [{ from: 'client', text: 'réécrit', at: 1 }] }))),
   'le prestataire ne RÉÉCRIT pas le fil');
ok(!(await passe(updateDoc(R(dAut), { messages: arrayUnion({ from: 'pro', text: 'x', at: 7 }) }))),
   'un prestataire étranger à la mission n’écrit rien');
ok(await passe(updateDoc(R(dCli), { supportClient: arrayUnion({ from: 'client', text: 'au secours', at: 8 }) })),
   'le client écrit à Ti-Services (doit rester possible)');
ok(!(await passe(updateDoc(R(dCli), { supportClient: arrayUnion({ from: 'admin', text: 'faux support', at: 9 }) }))),
   'et ne répond pas à sa propre place au nom de Ti-Services');

console.log('\n── LE PREMIER MESSAGE D’UNE MISSION (le champ n’existe pas encore) ──');
/* LE CAS LE PLUS COURANT : une demande fraîche ne porte AUCUN champ `messages`.
   Si la règle trébuchait sur l’absence, c’est le premier message de CHAQUE mission
   qui ne partirait plus — la régression la plus chère possible. */
await env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), 'requests', 'R2'), {
    clientUid: CLI, providerUid: PRO, status: 'accepted', rate: 35, duration: 2,
    service: 'menage', serviceName: 'Ménage', unit: 'h',
  });
});
ok(await passe(updateDoc(doc(dCli, 'requests', 'R2'), { messages: arrayUnion({ from: 'client', text: 'premier', at: 10 }) })),
   'le client envoie le PREMIER message, sur un champ absent');
ok(await passe(updateDoc(doc(dPro, 'requests', 'R2'), { messages: arrayUnion({ from: 'pro', text: 'réponse', at: 11 }) })),
   'le prestataire répond');
ok(!(await passe(updateDoc(doc(dPro, 'requests', 'R2'), { messages: arrayUnion({ from: 'client', text: 'faux', at: 12 }) }))),
   'et il ne signe toujours pas à la place du client');
ok(await passe(updateDoc(doc(dCli, 'requests', 'R2'), { supportClient: arrayUnion({ from: 'client', text: 'aide', at: 13 }) })),
   'le premier message au support part aussi, sur un champ absent');

console.log('\n── CE QUE LES DEUX PARTIES DOIVENT POUVOIR FAIRE SANS TOUCHER AU FIL ──');
ok(await passe(updateDoc(doc(dPro, 'requests', 'R2'), { status: 'done_pro', finalHours: 3 })),
   'le prestataire déclare la mission faite et sa durée réelle');
ok(await passe(updateDoc(doc(dCli, 'requests', 'R2'), { status: 'completed' })),
   'le client valide la prestation');

console.log('\n── LES IDENTIFIANTS MOLLIE DU CLIENT ──');
ok(await passe(updateDoc(doc(dCli, 'users', CLI), { name: 'Nouveau nom' })),
   'le client modifie sa fiche (doit rester possible)');
ok(!(await passe(updateDoc(doc(dCli, 'users', CLI), { mollieCustomerId: 'cst_VICTIME' }))),
   'il ne se pose PAS l’identifiant Mollie d’un tiers');
ok(!(await passe(updateDoc(doc(dCli, 'users', CLI), { mollieMandateId: 'mdt_VICTIME' }))),
   'ni le mandat d’un tiers');

console.log('\n── CE QUI EST PUBLIC, ET CE QUI NE L’EST PAS ──');
ok(await passe(getDoc(doc(dAno, 'settings', 'catalog'))), 'le catalogue reste lisible de tous');
ok(!(await passe(getDoc(doc(dAno, 'settings', 'installFunnel_prod')))), 'l’entonnoir d’installation ne l’est plus');

console.log('\n── LA SOUS-COLLECTION MORTE ──');
ok(!(await passe(setDoc(doc(dCli, 'requests', 'R1', 'messages', 'm1'), { nimporte: 'quoi' }))),
   'plus rien ne s’écrit dans requests/{id}/messages');

console.log('\n── QUI DÉCIDE DU MONTANT À PRÉLEVER ──');
/* AVEC LE MANDAT, UN PRÉLÈVEMENT N'A NI ÉCRAN NI 3-D SECURE : ce qui protège le client
   n'est plus le plafond de la banque mais le fait que rien ne bouge sans sa validation.
   Encore faut-il que le prestataire ne puisse pas gonfler le total qu'on lui soumet.
   Mesuré : `tip`, `acts` et `options` n'étaient épinglés dans AUCUNE règle. */
ok(await passe(updateDoc(R(dPro), { finalHours: 3 })),
   'le prestataire déclare la durée réelle — son seul levier légitime, qui doit rester possible');
ok(await passe(updateDoc(R(dCli), { tip: 10, status: 'paid' })),
   'le client ajoute son pourboire en validant — c’est le chemin RÉEL du règlement, il doit rester possible');
ok(!(await passe(updateDoc(R(dPro), { tip: 500 }))),
   'le prestataire NE se donne PAS de pourboire');
ok(!(await passe(updateDoc(R(dPro), { acts: [{ id: 'a1', nm: 'Prestation', price: 5000, qty: 1 }] }))),
   'il ne réécrit PAS les prix détaillés : ce sont des termes du contrat, figés dès l’acceptation');
ok(!(await passe(updateDoc(R(dPro), { options: [{ id: 'o1', nm: 'Supplément', price: 900, qty: 1 }] }))),
   'ni les options');
ok(!(await passe(updateDoc(R(dCli), { acts: [{ id: 'a1', nm: 'Prestation', price: 1, qty: 1 }] }))),
   'et le client non plus : un total n’est pas une saisie libre après acceptation');

console.log('\n── CE QUE SEUL LE SERVEUR CONSTATE D’UN ENCAISSEMENT ──');
for (const [champ, val] of [['arrhesPayout', 'routed'], ['reglementAjourne', ''],
                            ['empreinteMorteAu', 'authorized'], ['commissionNonRetenue', 0]]) {
  ok(!(await passe(updateDoc(R(dCli), { [champ]: val }))),
     'le client ne se déclare pas « ' + champ + ' »');
  ok(!(await passe(updateDoc(R(dPro), { [champ]: val }))),
     'le prestataire non plus');
}

console.log('\n── LE MONTANT CONSENTI, ET CE QUI COUVRE LA COMMANDE ──');
/* Le plafond du SILENCE : `autoValidate` ne valide seule que jusqu'à la somme que le
   client a vue. Laissé libre, un client s'écrirait un consentement à sa convenance, et
   un prestataire le mettrait à zéro pour bloquer toute validation automatique.
   `couverturePar` / `cardSetupStatus` disent, eux, pourquoi une demande a été ouverte
   aux prestataires SANS empreinte : s'en déclarer couvert sans qu'aucune carte soit
   mémorisée enverrait quelqu'un travailler sur une prestation non prélevable. */
for (const [champ, val] of [['totalConsenti', 1], ['totalConsentiAt', 1],
                            ['cardSetupPaymentId', 'tr_x'], ['cardSetupStatus', 'paid'],
                            ['couverturePar', 'mandat'], ['mollieMandateId', 'mdt_x']]) {
  ok(!(await passe(updateDoc(R(dCli), { [champ]: val }))),
     'le client ne s’écrit pas « ' + champ + ' »');
  ok(!(await passe(updateDoc(R(dPro), { [champ]: val }))),
     'le prestataire non plus');
}

await env.cleanup();
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert.');
process.exit(f ? 1 : 0);
