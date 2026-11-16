/* « Je le vois où, si le prestataire a bien rentré son RIB ? » — l'IBAN qu'il saisit dans
   Ti-Services (« Mon compte ») pour les sommes que Ti-Services lui vire lui-même.

   IL ÉTAIT ENREGISTRÉ ET NE SE LISAIT QU'À UN ENDROIT : l'écran des versements bloqués.
   Tant que rien n'était bloqué, la console ne pouvait pas dire s'il l'avait rempli. La
   fiche du prestataire le dit maintenant, masqué (le numéro entier reste là où il sert,
   au moment du virement), et une clé qui ne tombe pas juste se dit aussi. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — la console lit l\'IBAN sur la fiche de chaque artisan');
const iA = APP.indexOf('function refreshAdminArtisans');
const lect = APP.slice(iA, iA + 6000);
ok(/iban:typeof a\.iban==='string'\?a\.iban\.slice\(0,40\):''/.test(lect), 'l\'IBAN est lu à l\'écoute des artisans');
ok(/ibanTitulaire:typeof a\.ibanTitulaire==='string'/.test(lect), 'et son titulaire');

const ART = (x) => Object.assign({ id: 'a1', uid: 'a1', real: true, name: 'Vincent Beaudouin',
  status: 'valide', siret: '12345678901234', cats: ['menage'], rates: { menage: 40 }, jobs: 0,
  mollieStatus: 'active', skipAt: {} }, x);
const VALIDE = 'FR7630006000011234567890189';
const FAUX = 'FR7630006000011234567890180';

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 430, height: 1800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(600);

  const fiche = (a) => p.evaluate((a) => {
    const S = window.__S;
    S.account = { name: 'Admin', email: 'contact@ti-services.fr', uid: 'adm', role: 'admin' };
    S.persona = 'admin'; S.onboarded = true; S.authView = null;
    S.adminArtisans = [a]; S.adminArtsLoaded = true;
    S.admin = { view: 'art', sel: 'a1' };
    window.__render();
    const rows = Array.from(document.querySelectorAll('#view .fiche > *'));
    const ligne = rows.find((r) => /IBAN \(virements Ti-Services\)/.test(r.textContent || ''));
    return { ligne: ligne ? ligne.textContent.replace(/\s+/g, ' ').trim() : '(absente)',
      vue: (document.getElementById('view').textContent || '').replace(/\s+/g, ' '),
      img: !!document.querySelector('#view .fiche img[src="x"]') };
  }, a);

  console.log('B — saisi, masqué, avec son titulaire');
  const B = await fiche(ART({ iban: VALIDE, ibanTitulaire: 'Vincent Beaudouin' }));
  ok(/Saisi/.test(B.ligne) && !/invalide/.test(B.ligne), 'la fiche dit « Saisi » (' + B.ligne.slice(0, 90) + ')');
  ok(/FR76 •••• 0189/.test(B.ligne), 'l\'IBAN paraît masqué');
  ok(B.vue.indexOf('30006000011234567890') < 0, 'le numéro entier n\'est nulle part sur la fiche');
  ok(/Vincent Beaudouin/.test(B.ligne), 'le titulaire paraît');

  console.log('C — saisi avant le contrôle, et faux');
  const C = await fiche(ART({ iban: FAUX }));
  ok(/Saisi mais invalide/.test(C.ligne) && /clé de contrôle/.test(C.ligne), 'une clé qui ne tombe pas juste se dit');

  console.log('D — rien de saisi');
  const D = await fiche(ART({ iban: '' }));
  ok(/Non saisi/.test(D.ligne), 'un prestataire sans IBAN : « Non saisi »');
  const D2 = await fiche(ART({}));
  ok(/Non saisi/.test(D2.ligne), 'une fiche sans le champ du tout : « Non saisi », pas une erreur');

  console.log('E — un titulaire venu d\'un compte ne s\'exécute pas');
  const E = await fiche(ART({ iban: VALIDE, ibanTitulaire: '<img src="x">' }));
  ok(!E.img && /<img src="x">/.test(E.ligne), 'le nom paraît en texte, aucune balise ne s\'ouvre');

  ok(errs.length === 0, 'aucune erreur de page (' + errs.slice(0, 2).join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})();
