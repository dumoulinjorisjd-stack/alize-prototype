/* « Pour une sortie bateau il y a trop d'information inutile ou qui ne font pas du tout
   sens. L'heure souhaitée est l'heure de départ souhaité. »

   Tout l'écran de commande suppose que LE PRESTATAIRE SE DÉPLACE : adresse, point GPS
   OBLIGATOIRE (« le seul repère fiable pour qu'on vous trouve »), code du portail, chat
   à la maison, clé sous le pot, « enregistrer cette adresse dans mon profil ». Devant une
   location de catamaran, chacune de ces questions est à côté — et le GPS de la villa
   BLOQUE une commande qu'il ne renseigne pas.

   LA MACHINE EXISTAIT (`salonOnly`, écrit pour l'épilation définitive). Il lui manquait
   une PORTE — aucun écran ne permettait de la poser sur un métier créé depuis la console
   — et un MOT : « vous vous rendez chez le prestataire » est juste pour un salon, faux
   pour une sortie en mer. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

const BATEAU = { id: 'c_catamaran', nm: 'Location catamaran', rate: 0, custom: true, ico: 'bateau', choixPro: false, cat: '', lieu: 'depart' };
const ACTES = { c_catamaran: [{ id: 'a1', nm: 'Demie journée avec sunset', price: 990 }, { id: 'a2', nm: 'Journée complète avec sunset', price: 1490 }] };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__lieu, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  console.log('A — trois lieux, liste fermée, et le défaut ne change rien pour le parc');
  const A = await p.evaluate((sv) => {
    window.__S.customServices = [sv, Object.assign({}, sv, { id: 'c_menage', nm: 'Ménage', lieu: 'domicile' }),
      Object.assign({}, sv, { id: 'c_abime', nm: 'Abîmé', lieu: 'n’importe quoi' })];
    return {
      choix: window.__lieu.choix().map((l) => l[0]),
      bateau: window.__lieu.du('c_catamaran'),
      menage: window.__lieu.du('c_menage'),
      abime: window.__lieu.du('c_abime'),
      inconnu: window.__lieu.du('c_jamais_vu'),
      // Un métier du CODE, sans la clé : rien ne bouge.
      origine: window.__lieu.du('menage'),
      // Et celui qui portait déjà l'ancien drapeau est reconnu.
      laser: window.__lieu.du('epilationdef'),
      valide: [window.__lieu.valide('depart'), window.__lieu.valide('salon'), window.__lieu.valide('')],
    };
  }, BATEAU);
  ok(A.choix.join(',') === 'domicile,surplace,depart', 'trois lieux et pas un de plus : ' + A.choix.join(', '));
  ok(A.bateau === 'depart' && A.menage === 'domicile', 'chaque métier porte le sien');
  ok(A.abime === 'domicile', 'une valeur abîmée ne devient pas un lieu : on retombe sur le défaut');
  ok(A.inconnu === 'domicile' && A.origine === 'domicile', 'un métier inconnu ou livré avec l’application se déplace, comme avant');
  ok(A.laser === 'surplace', 'l’épilation définitive, qui portait déjà `salonOnly`, est reconnue sans migration');
  ok(A.valide[0] === 'depart' && A.valide[1] === '' && A.valide[2] === '', '« salon » n’est pas une valeur : la liste est fermée');

  console.log('B — le mot suit le lieu');
  const B = await p.evaluate(() => ({
    bateau: window.__lieu.mots('c_catamaran'),
    menage: window.__lieu.mots('c_menage'),
    laser: window.__lieu.mots('epilationdef'),
    salonB: window.__lieu.salon('c_catamaran'), salonM: window.__lieu.salon('c_menage'),
  }));
  ok(B.bateau.heure === 'Heure de départ souhaitée', 'pour une sortie, l’heure est une heure de DÉPART : « ' + B.bateau.heure + ' »');
  ok(B.laser.heure === 'Heure du rendez-vous', 'pour un salon, c’est un rendez-vous : « ' + B.laser.heure + ' »');
  ok(B.menage.heure === 'Heure souhaitée', 'et rien ne change quand le prestataire se déplace');
  ok(B.bateau.titre === 'Point de départ' && /partez/.test(B.bateau.texte), 'le bloc de lieu parle de départ, pas d’adresse');
  ok(!/vous rendez/.test(B.bateau.texte), 'et ne dit plus « vous vous rendez chez le prestataire » devant un bateau');
  ok(B.salonB === true && B.salonM === false, 'les deux lieux « le client vient » effacent le bloc d’adresse, le troisième non');

  console.log('C — l’écran de commande, rendu pour de vrai');
  const C = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.persona = 'client'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.account = { name: 'Client', email: 'c@x.fr' }; S.addresses = []; S.availableServices = null;
    S.customServices = [sv]; S.adminCatalog = actes;
    S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
    S.draft.acts = [{ id: 'a2', nm: 'Journée complète avec sunset', price: 1490, qty: 1 }];
    window.__render();
    const t = document.getElementById('view').innerText;
    return { t: t, geo: !!document.querySelector('[data-cfg="geoloc"]'), adr: !!document.querySelector('[data-addrmanual]'),
      bandeaux: (t.match(/Vous partez avec le prestataire/g) || []).length };
  }, [BATEAU, ACTES]);
  ok(/Heure de départ souhaitée/.test(C.t) && !/Heure souhaitée/.test(C.t), 'l’écran dit « Heure de départ souhaitée »');
  ok(!/Adresse de la prestation/.test(C.t), 'le bloc « Adresse de la prestation » a disparu');
  ok(!C.geo, 'le point GPS obligatoire a disparu : il ne renseignait rien et bloquait la commande');
  ok(!C.adr, 'les champs d’adresse aussi');
  ok(!/clé sous le pot|code portail|Code portail/i.test(C.t), 'les infos d’accès (code portail, clé sous le pot) ont disparu');
  ok(!/Enregistrer cette adresse dans mon profil/.test(C.t), 'et « enregistrer cette adresse dans mon profil » avec elles');
  ok(/Point de départ/.test(C.t), 'à leur place, le point de départ');
  ok(C.bandeaux === 1, 'et la phrase ne paraît QU’UNE fois : elle était écrite en haut ET en bas (' + C.bandeaux + ')');

  console.log('D — le même écran pour un métier qui se déplace ne bouge pas d’un mot');
  const D = await p.evaluate(([sv, actes]) => {
    const S = window.__S;
    S.customServices = [Object.assign({}, sv, { lieu: 'domicile' })]; S.adminCatalog = actes;
    S.draft = window.__newMission(window.__svc.trouve('c_catamaran'));
    S.draft.acts = [{ id: 'a2', nm: 'Journée complète', price: 1490, qty: 1 }];
    window.__render();
    const t = document.getElementById('view').innerText;
    return { t: t, geo: !!document.querySelector('[data-cfg="geoloc"]') };
  }, [BATEAU, ACTES]);
  ok(/Heure souhaitée/.test(D.t), 'l’heure redevient « Heure souhaitée »');
  ok(/Adresse de la prestation/.test(D.t) && D.geo, 'l’adresse et le point GPS obligatoire sont revenus');

  console.log('E — la console pose le lieu, et le catalogue le garde');
  ok(/data-adm="catlieu:/.test(html), 'le choix existe dans la console, sur la fiche du métier');
  ok(/lieu:lieuValide\(s\.lieu\)/.test(html), 'et `applyCatalogDoc` le relit, sinon le serveur l’effacerait au tour suivant');
  const E = await p.evaluate(() => {
    const S = window.__S;
    S.customServices = [{ id: 'c_x', nm: 'X', rate: 10, custom: true, ico: '', choixPro: false, cat: '', lieu: 'depart' }];
    // Ce que le catalogue renvoie du serveur, relu par la porte unique.
    window.__svc.relit({ services: [{ id: 'c_x', nm: 'X', rate: 10, ico: '', choixPro: false, cat: '', lieu: 'depart' }] });
    const apres = window.__lieu.du('c_x');
    window.__svc.relit({ services: [{ id: 'c_x', nm: 'X', rate: 10, ico: '', choixPro: false, cat: '', lieu: 'pirate' }] });
    return { apres: apres, pirate: window.__lieu.du('c_x') };
  });
  ok(E.apres === 'depart', 'un aller-retour par le serveur ne perd pas le lieu');
  ok(E.pirate === 'domicile', 'et une valeur inventée côté serveur ne passe pas');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
