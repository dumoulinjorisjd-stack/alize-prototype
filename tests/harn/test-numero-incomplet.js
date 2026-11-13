/* « JE NE PEUX PAS APPELER UN ARTISAN QUI POURRAIT RÉPONDRE, IL S'EST TROMPÉ DANS SON
   NUMÉRO, IL EST INCOMPLET. On ne devrait pas pouvoir mettre un numéro incomplet. »
   — l'éditeur, le 13/11/2026.

   Deux trous, mesurés avant d'écrire :
     1. MODIFIER SON NUMÉRO N'ÉTAIT PAS CONTRÔLÉ. L'inscription refusait un numéro qui ne
        peut pas exister ; « Modifier téléphone, présentation & IBAN » ne contrôlait que
        l'IBAN. Un numéro juste pouvait donc être remplacé par un numéro incomplet.
     2. SEUL +590 AVAIT SON PLAN. Ailleurs, de 6 à 14 chiffres passaient : un numéro
        français de huit chiffres s'enregistrait sans un mot.
   Et ce qui est déjà enregistré de travers se DIT à l'artisan, sur son accueil. */
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const o = {headless: true};
if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({viewport: {width: 390, height: 844}});
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html'));
  await p.waitForFunction(() => window.__S && window.__tel && window.__render);

  console.log('A — un numéro incomplet ne passe plus, quel que soit son pays');
  const A = await p.evaluate(() => {
    const lu = (pfx, n) => window.__tel.lu(pfx, n);
    return {
      fr8: lu('+33', '6 12 34 56 7'), fr9: lu('+33', '06 12 34 56 78'), fr10: lu('+33', '6 12 34 56 789'),
      us9: lu('+1', '514 555 012'), us10: lu('+1', '514 555 0123'),
      es: lu('+34', '612 34 56 78'), esCourt: lu('+34', '612 34 56'), pt: lu('+351', '912 345 678'),
      sbh: lu('+590', '0690 21 09 02'), sbhCourt: lu('+590', '0690 21 09'),
      uk10: lu('+44', '7911 123456'), uk9: lu('+44', '1632 96011'), de: lu('+49', '30 1234567'),
    };
  });
  ok(!A.fr8.ok && A.fr8.cause === 'court', 'un numéro français de huit chiffres est refusé (avant : accepté)');
  ok(A.fr9.ok, 'un numéro français complet passe, zéro de tête compris');
  ok(!A.fr10.ok && A.fr10.cause === 'long', 'un chiffre de trop aussi se dit');
  ok(!A.us9.ok && A.us10.ok, '+1 : dix chiffres, pas un de moins');
  ok(A.es.ok && !A.esCourt.ok && A.pt.ok, 'Espagne et Portugal : neuf chiffres');
  ok(A.sbh.ok && !A.sbhCourt.ok, '+590 ne change pas');
  ok(A.uk10.ok && A.uk9.ok && A.de.ok, 'Royaume-Uni et Allemagne gardent la fourchette large : leurs longueurs varient, on ne refuse pas un numéro juste');

  console.log('B — le message parle du bon pays');
  const B = await p.evaluate(() => ({fr: window.__tel.avis('+33', '6 12 34 56 7').txt, sbh: window.__tel.avis('+590', '0690 21 09').txt,
    console: window.__tel.console('+33 612345')}));
  ok(/Il manque 1 chiffre : un numéro français en compte 9/.test(B.fr), 'il chiffre ce qui manque, pour un numéro français (' + B.fr + ')');
  ok(/un numéro d’ici en compte 9/.test(B.sbh), 'et garde ses mots pour Saint-Barthélemy');
  ok(/ne peut pas sonner : 6 chiffres au lieu de 9/.test(B.console), 'la console signale désormais un numéro français tronqué (' + B.console + ')');

  console.log('C — modifier son numéro est contrôlé comme l’inscrire');
  const sauver = (tel) => p.evaluate((tel) => {
    const S = window.__S;
    S.onboarded = true; S.guest = false; S.lang = 'fr'; S.persona = 'pro'; S.proNav = 'account'; S.proStatus = 'approved';
    S.proPhone = '+590 0690 21 09 02'; S.proIban = ''; S.proEditContact = true; S._fold = {'p-infos': true};
    S.proContactForm = {phone: tel, bio: '', iban: '', ibanTitulaire: ''};
    window.__render();
    const bt = document.querySelector('[data-act="pro-contact-save"]');
    if (bt) bt.click();
    return {trouve: !!bt, tel: S.proPhone, edit: S.proEditContact};
  }, tel);
  const c1 = await sauver('+33 6 12 34 56');
  ok(c1.trouve, 'le bouton « Enregistrer » est bien là (assertion arrière : on mesure le vrai geste)');
  ok(c1.tel === '+590 0690 21 09 02' && c1.edit === true, 'un numéro incomplet N’ENTRE PAS : l’ancien reste, la saisie reste à l’écran');
  const c2 = await sauver('');
  ok(c2.tel === '+590 0690 21 09 02' && c2.edit === true, 'un numéro vidé non plus : c’est par lui qu’on le joint');
  const c3 = await sauver('+33 6 12 34 56 78');
  ok(c3.tel === '+33 6 12 34 56 78' && c3.edit === false, 'un numéro complet s’enregistre');

  console.log('D — un numéro déjà faux se dit sur l’accueil de l’artisan');
  const accueil = (tel) => p.evaluate((tel) => {
    const S = window.__S;
    S.persona = 'pro'; S.proNav = 'home'; S.proStatus = 'approved'; S.proOnline = true; S.proCats = ['massage'];
    S.proMollie = 'active'; S.proMollieOrgId = 'org_1'; S.proMollieOnb = 'completed'; S.proMollieCanWork = true;
    S.proNetIrroutable = 0; S.proEditContact = false; S.proContactForm = null; S.proPhone = tel; S.mission = null; S.detail = null;
    window.__render();
    const bt = document.querySelector('[data-act="pro-tel"]');
    return bt ? bt.textContent.replace(/\s+/g, ' ') : '';
  }, tel);
  const d1 = await accueil('+33 612345');
  ok(/Votre numéro ne permet pas de vous joindre/.test(d1) && /6 chiffres au lieu de 9/.test(d1), 'la carte nomme le numéro et ce qui ne va pas');
  ok((await accueil('+33 6 12 34 56 78')) === '', 'rien quand le numéro est juste');
  ok((await accueil('')) === '', 'rien quand il n’y a pas de numéro : il n’a rien promis');
  await accueil('+33 612345');
  const mene2 = await p.evaluate(() => {
    const bt = document.querySelector('[data-act="pro-tel"]');
    if (!bt) return {absente: true};
    bt.click();
    const S = window.__S;
    return {nav: S.proNav, edit: S.proEditContact, champ: !!document.querySelector('[data-phonenum]')};
  });
  ok(mene2.nav === 'account' && mene2.edit === true && mene2.champ, 'elle mène au champ du numéro, déjà en saisie');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.log('KO : l’épreuve n’a pas pu aller au bout — ' + e.message); process.exit(1); });
