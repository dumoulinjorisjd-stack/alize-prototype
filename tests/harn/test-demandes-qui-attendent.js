/* « UN NOUVEAU PRESTATAIRE MÉNAGE VOIT LES DEMANDES EN COURS QUI SONT LÀ AVANT SON
   INSCRIPTION ? »

   OUI — le fil des missions n'a AUCUNE borne de date : il interroge toutes les demandes
   encore en recherche, quelle que soit leur ancienneté, puis filtre par métier, par lieu,
   par grille de disponibilités, par interrupteur « en ligne » et par blocage. Rien n'y
   regarde la date d'inscription du prestataire.

   MAIS AUCUNE NOTIFICATION NE PART POUR ELLES : les alertes se déclenchent à la CRÉATION
   d'une demande et à son ouverture au pool, deux instants déjà passés quand il s'inscrit.
   Il fallait donc qu'il pense à ouvrir l'application et à regarder, sans rien qui le lui
   suggère. L'e-mail de validation le lui dit désormais.

   Le fil se mesure dans le navigateur ; le câblage serveur se lit dans la source, comme
   pour l'anti-abus — aucun banc ne fait tourner les fonctions Firebase. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRV = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  /* A — LE FIL N'A PAS DE BORNE DE DATE. C'est la réponse à la question, et elle se lit
     dans la requête elle-même : on demande les demandes « pending », point. */
  console.log('A — le fil des missions ne regarde pas la date d’inscription');
  const req = /FB\.f\.query\(FB\.f\.collection\(FB\.db,'requests'\),FB\.f\.where\('status','==','pending'\)\)/.test(APP);
  ok(req, 'la requête demande les demandes en recherche, sans borne de date');
  const fil = APP.slice(APP.indexOf("FB.f.where('status','==','pending')"),
    APP.indexOf('S.openRequests=list;'));
  ok(!/createdAt|validatedAt|approvedAt|inscription/i.test(fil),
    'et rien dans le fil ne compare une demande à la date d’inscription du prestataire');

  /* B — CE QUI FILTRE VRAIMENT, et qu'il faut savoir nommer quand on répond. */
  console.log('B — ce qui peut la lui cacher, en revanche');
  for (const [quoi, re] of [['son métier', /cats\.indexOf\(r\.service\)<0/],
    ['le lieu de la prestation', /siteMatches\(mySite/],
    ['sa grille de disponibilités', /availOk\(S\.avail,r\)/],
    ['son interrupteur « en ligne »', /S\.proOnline===false/],
    ['une demande adressée à quelqu’un d’autre', /r\.preferredProviderUid!==myUid/],
    ['un blocage, dans les deux sens', /estBloque\(r\.clientUid\)/]]) {
    ok(re.test(fil), quoi + ' : ce filtre-là existe bien');
  }
  /* Une demande ADRESSÉE à ce prestataire passe outre la grille et l'interrupteur :
     le client l'a choisi, il attendrait sans jamais savoir pourquoi. */
  ok(/_directedMe&&!availOk/.test(fil) && /_directedMe&&S\.proOnline===false/.test(fil),
    'une demande qui lui est adressée passe outre sa grille et son interrupteur');

  /* C — ET IL L'APPREND. Les alertes partent à la création de la demande et à son
     ouverture au pool ; pour celui qui s'inscrit après, ces deux instants sont passés. */
  console.log('C — l’e-mail de validation dit ce qui l’attend déjà');
  const appr = SRV.slice(SRV.indexOf('exports.notifyArtisanApproved'),
    SRV.indexOf('exports.', SRV.indexOf('exports.notifyArtisanApproved') + 20));
  ok(/where\('status', '==', 'pending'\)/.test(appr),
    'la validation compte les demandes encore en recherche');
  ok(/cats\.indexOf\(r\.service\) < 0/.test(appr), 'dans SES métiers');
  ok(/r\.clientUid === uid/.test(appr), 'jamais ses propres demandes');
  ok(/r\.preferredProviderUid !== uid/.test(appr), 'ni celles adressées à quelqu’un d’autre');
  /* ON NE COMPTE PAS CE QU'ON NE PEUT PAS TENIR. Le fil filtre aussi par lieu, par
     grille et par interrupteur — trois réglages qu'un compte du premier jour n'a pas
     posés. Annoncer « 3 demandes » puis n'en montrer qu'une serait pire que se taire. */
  ok(!/availOk|siteMatches|online/.test(appr.slice(appr.indexOf('let enAttente'), appr.indexOf('const attenteTxt'))),
    'et sur le métier SEUL : on ne promet pas un chiffre que le fil ne tiendra pas');
  ok(/attenteTxt\s*\?/.test(appr) && /Votre compte Ti-Services est activé/.test(appr),
    'la notification le dit, et garde son texte d’origine quand rien n’attend');
  const html = SRV.slice(SRV.indexOf('function approvedArtisanHtml'), SRV.indexOf('function approvedArtisanHtml') + 4000);
  ok(/!attenteTxt \? '' :/.test(html),
    'et le bloc de l’e-mail ne s’imprime pas quand rien n’attend — « 0 demande » découragerait');

  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);
  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs[0] : ''));
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
