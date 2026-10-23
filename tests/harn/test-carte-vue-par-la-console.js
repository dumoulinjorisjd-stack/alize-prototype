/* LE PROFIL DISAIT « CARTE ENREGISTRÉE », LA CONSOLE DISAIT « AUCUNE ».
   Signalé le 23/10/2026, capture des deux écrans à l'appui : la fiche de Laure Guyon,
   côté administration, annonce « Aucune carte enregistrée » pendant que son propre Profil
   affiche « ✓ Enregistrée · Expire 01/2028 ».

   LES DEUX DISAIENT VRAI DE LEUR SOURCE, et c'est le défaut. Le profil demande à MOLLIE
   (callable clientCard) ; la console lisait `users/{uid}.card` — un champ que seul le
   NAVIGATEUR du client écrit, et seulement par le formulaire de DÉMONSTRATION, celui qui
   déchiffre un numéro de carte dans la page. En production la carte vit chez Mollie sous
   forme de mandat et n'atterrit JAMAIS dans ce champ : la console annonçait donc « aucune
   carte » à propos de TOUS les clients réels, depuis toujours.

   Ce que cette épreuve tient :
   • la console ne lit plus un champ de démonstration : elle lit ce que le SERVEUR écrit ;
   • une carte mémorisée chez Mollie compte comme une trace de client (sans quoi un compte
     passé prestataire disparaissait de la liste) ;
   • deux statistiques du parc cherchaient le mot « Aucune » DANS la phrase affichée :
     elles lisent un état fermé, qu'un libellé reformulé ne peut plus fausser ;
   • la lecture de la carte chez Mollie n'existe QU'UNE fois, et les deux écrans l'appellent ;
   • Mollie injoignable ne devient pas « aucune carte » ;
   • et la liste ne demande RIEN à Mollie : un appel par compte pour peindre un écran. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — une seule lecture de la carte chez Mollie, pour les deux écrans');
ok(/async function lireCarteMollie\(db, uid, connu\)/.test(SRV), 'la porte existe au niveau du fichier');
ok(/^function carteDeMandat\(m\) \{/m.test(SRV), 'et la forme d’un mandat ne s’écrit qu’une fois');
/* La copie locale de clientCard a disparu : sans cela, la console et le profil auraient
   deux lectures, c’est-à-dire la divergence qu’on corrige, par une autre porte. */
const copies = (SRV.match(/const carteDeMandat = \(m\) =>/g) || []).length;
ok(copies === 0, 'clientCard n’en garde plus de copie (' + copies + ')');
ok(/const r = await lireCarteMollie\(db, uid, \{customerId: customerId\}\);/.test(SRV),
  'clientCard APPELLE la porte, et lui passe le client Mollie déjà résolu');
ok(/exports\.adminClientCard = onCall/.test(SRV), 'l’administration a son guichet');
const blocAdmin = SRV.slice(SRV.indexOf('exports.adminClientCard'), SRV.indexOf('exports.clientCard'));
ok(/who\.toLowerCase\(\) !== ADMIN_EMAIL\.toLowerCase\(\)/.test(blocAdmin), 'réservé à l’administrateur');
ok(/await lireCarteMollie\(getFirestore\(\), uid\)/.test(blocAdmin), 'et il lit par la MÊME porte que le profil');
/* SILENCE N’EST PAS RÉPONSE : sans ce refus, une panne de réseau ferait annoncer qu’un
   client n’a pas de moyen de paiement — et l’on déciderait là-dessus. */
ok(/if \(!rep\.ok\) return out;/.test(SRV), 'Mollie injoignable ne devient pas « aucune carte »');

console.log('B — la console ne lit plus un champ de démonstration');
ok(/function carteDuCompte\(d\)\{/.test(APP) || /function carteDuCompte\(d\) *\{/.test(APP), 'le décideur existe');
ok(/if \(d\.mollieMandateId\) return \{etat:'mandat'/.test(APP),
  'le mandat écrit par le SERVEUR dit qu’une carte est mémorisée');
ok(/card:carte\.texte, carteEtat:carte\.etat/.test(APP), 'la liste en découle');
ok(!/card:card\?\(\(card\.brand\|\|'Carte'\)/.test(APP), 'et ne compose plus sa phrase depuis le seul champ de démonstration');
ok(/\|\|carte\.etat==='mandat'/.test(APP), 'une carte Mollie compte comme trace de client');
/* Deux statistiques cherchaient « Aucune » DANS la phrase : un libellé reformulé les
   faisait compter faux, sans que rien ne le dise. */
const parLaPhrase = (APP.match(/\/Aucune\/\.test/g) || []).length;
ok(parLaPhrase === 0, 'aucune statistique ne juge plus sur la phrase affichée (' + parLaPhrase + ')');
ok(/sansCarte:g\.filter\(compteSansCarte\)\.length/.test(APP) && /const sansCarte=compteSansCarte\(c\);/.test(APP),
  'les deux lisent l’état fermé');
/* La liste peint des centaines de comptes : elle ne doit appeler Mollie pour aucun. */
const listeBloc = APP.slice(APP.indexOf('function buildAdminClients'), APP.indexOf('function buildAdminClients') + 2600);
ok(!/adminClientCard/.test(listeBloc), 'la liste ne demande rien à Mollie');
ok(/data-act="adm-carte:\$\{esc\(cc\.uid\)\}"/.test(APP), 'le détail se demande compte par compte, depuis la fiche');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__carteDuCompte);

  console.log('C — le cas signalé, rejoué');
  const r = await p.evaluate(() => {
    const C = window.__carteDuCompte;
    return {
      // Laure Guyon : carte enregistrée chez Mollie, aucun champ « card » sur sa fiche.
      laure: C({ mollieCustomerId: 'cst_x', mollieMandateId: 'mdt_x' }),
      // Un compte qui a approché le paiement sans rien mémoriser.
      approche: C({ mollieCustomerId: 'cst_y' }),
      // Un compte neuf.
      neuf: C({}),
      // La démonstration garde son aperçu : c'est le seul cas où nous avons la carte.
      demo: C({ card: { brand: 'Visa', last4: '4242', exp: '08/28' } }),
      // Et le mandat prime sur un champ de démonstration vide.
      vide: C({ card: {}, mollieMandateId: 'mdt_z' }),
    };
  });
  ok(r.laure.etat === 'mandat' && !/Aucune/.test(r.laure.texte),
    'le compte de la capture n’est plus annoncé sans carte (« ' + r.laure.texte + ' »)');
  ok(r.approche.etat === 'client-mollie', 'un client Mollie sans mandat est dit tel quel, pas « carte enregistrée »');
  ok(r.neuf.etat === 'aucune' && /Aucune/.test(r.neuf.texte), 'un compte neuf n’a bien aucune carte');
  ok(r.demo.etat === 'carte' && r.demo.texte === 'Visa ••4242', 'la démonstration garde son aperçu');
  ok(r.vide.etat === 'mandat', 'un champ de démonstration vide ne cache pas un mandat réel');
  /* LES ÉTATS SONT UNE LISTE FERMÉE : c’est ce qui permet aux statistiques de juger sans
     lire une phrase. Sans cette mesure, un sixième état glissé un jour passerait partout. */
  const connus = await p.evaluate(() => window.__CARTE_ETATS.slice());
  ok(Object.values(r).every((x) => connus.indexOf(x.etat) >= 0),
    'tous les états rendus sont dans la liste fermée (' + connus.join(', ') + ')');

  console.log('D — « sans carte » compte ce qu’il doit');
  const st = await p.evaluate(() => {
    const S = window.__compteSansCarte;
    return { mandat: S({ carteEtat: 'mandat' }), carte: S({ carteEtat: 'carte' }),
      client: S({ carteEtat: 'client-mollie' }), aucune: S({ carteEtat: 'aucune' }), vide: S({}) };
  });
  ok(st.mandat === false && st.carte === false, 'un compte qui a une carte n’est pas compté « sans carte »');
  ok(st.client === true && st.aucune === true, 'un client Mollie sans mandat, lui, est compté sans carte');
  ok(st.vide === true, 'et une fiche qu’on ne sait pas lire compte comme sans carte — le choix sûr');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})();
