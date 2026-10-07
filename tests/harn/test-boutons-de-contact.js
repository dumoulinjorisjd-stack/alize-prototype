/* « LE BOUTON WHATSAPP ET APPELER DEVRAIT ÊTRE CLIQUABLE UNIQUEMENT S'IL Y A BIEN UN
   NUMÉRO DE TÉLÉPHONE À CONTACTER. »

   Les trois boutons de la carte « Contacter » étaient posés sans condition. Sur une fiche
   sans téléphone, « Appeler » ouvrait un `tel:` vide et WhatsApp un `wa.me/` tout court,
   qui mène à la page d'accueil de WhatsApp. Un bouton qui ne fait rien use la confiance
   qu'on a dans tous les autres de l'écran.

   L'épreuve mesure l'ÉCRAN RENDU de la console — les liens réellement présents et leur
   adresse — et pas le texte de la fonction : c'est ce que l'administrateur peut cliquer
   qui compte. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1200 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  // La fiche d'un client, telle que la console la dessine.
  const fiche = (client) => p.evaluate(({ client }) => {
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'admin'; S.admin = { view: 'cli', sel: 'c1' }; S.mission = null; S.share = null;
    S.support = false; S.generalSupport = false; S.adminSupervise = false;
    S.adminClients = [Object.assign({ id: 'c1', uid: 'c1', real: true, name: 'Marie',
      status: 'valide', addresses: [], history: [] }, client)];
    window.__render();
    const v = document.getElementById('view');
    const lien = (re) => Array.from(v.querySelectorAll('a')).filter((a) => re.test(a.getAttribute('href') || ''));
    return { wa: lien(/wa\.me/).map((a) => a.getAttribute('href')),
      tel: lien(/^tel:/).map((a) => a.getAttribute('href')),
      mail: lien(/^mailto:/).map((a) => a.getAttribute('href')),
      txt: v.textContent || '' };
  }, { client });

  console.log('\nA — aucune ligne de téléphone sur la fiche');
  const sans = await fiche({ email: 'marie97133@gmail.com', phone: '' });
  ok(sans.wa.length === 0, 'pas de bouton WhatsApp : il n’y a personne à joindre');
  ok(sans.tel.length === 0, 'pas de bouton Appeler non plus');
  ok(sans.mail.length === 1 && /marie97133@gmail\.com/.test(sans.mail[0]),
    'l’e-mail, lui, reste cliquable : celui-là existe');
  ok(/Pas de numéro de téléphone sur cette fiche/.test(sans.txt),
    'et l’écran DIT pourquoi : sans la phrase, on chercherait le défaut du mauvais côté');

  console.log('\nB — un numéro bien là');
  const avec = await fiche({ email: 'marie97133@gmail.com', phone: '+590 690 12 34 56' });
  ok(avec.wa.length === 1 && /wa\.me\/590690123456/.test(avec.wa[0]),
    'WhatsApp part sur le numéro international (' + (avec.wa[0] || '') + ')');
  ok(avec.tel.length === 1 && /^tel:\+?590690123456$/.test(avec.tel[0].replace(/\s/g, '')),
    'Appeler compose le numéro (' + (avec.tel[0] || '') + ')');
  ok(!/Pas de numéro de téléphone/.test(avec.txt), 'et plus rien à signaler');

  /* C — UN NUMÉRO QUI NE PEUT PAS SONNER N'EST PAS UN NUMÉRO ABSENT. On garde les
     boutons — la validité se juge sur les plans de Saint-Barthélemy, et un numéro de
     métropole ou de l'étranger en sortirait « impossible » : retirer le bouton d'appel
     sur un numéro qui sonne serait pire que le défaut qu'on corrige. On AVERTIT. */
  console.log('\nC — un numéro douteux : on prévient, on ne retire pas');
  const faux = await fiche({ email: 'marie97133@gmail.com', phone: '+590 690 12' });
  ok(faux.tel.length === 1, 'le bouton reste : c’est peut-être un numéro d’ailleurs');
  ok(/ne peut pas sonner/.test(faux.txt), 'mais l’écran prévient qu’il ne peut pas sonner');

  console.log('\nD — ni téléphone ni e-mail');
  const rien = await fiche({ email: '', phone: '' });
  ok(rien.wa.length === 0 && rien.tel.length === 0 && rien.mail.length === 0,
    'aucun bouton de contact : il n’y a rien à cliquer');
  ok(/Pas de numéro de téléphone/.test(rien.txt) && /Pas d’adresse e-mail/.test(rien.txt),
    'les deux manques sont nommés');

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
