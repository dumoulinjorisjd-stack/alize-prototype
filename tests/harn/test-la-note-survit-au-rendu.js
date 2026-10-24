/* « QUAND ON CLIQUE SUR LES ÉTOILES, ON REVIENT À CET ÉCRAN. »

   Signalé le 24/10/2026, capture du reçu d'un massage à 110 € à l'appui. Le geste
   marchait pourtant : le clic posait bien la note, allumait les étoiles et ouvrait le
   bouton. C'est le RENDU qui ne relisait pas ce que le clic venait d'écrire — les
   étoiles étaient redessinées TOUJOURS éteintes et le bouton TOUJOURS `disabled`.

   REPRODUIT AVANT DE CORRIGER, dans le navigateur :
     avant le clic  : 0 allumée · note null · bouton désactivé
     après le clic  : 4 allumées · note 4   · bouton ACTIF
     après un rendu : 0 allumée · note 4   · bouton DÉSACTIVÉ

   La note SURVIVAIT dans l'état — l'écoute de la demande modifie la mission en place,
   elle ne la remplace pas — mais l'écran l'oubliait, et le bouton redevenait
   inatteignable : on ne pouvait plus envoyer son avis du tout.

   ET CET ÉCRAN EST CELUI QUI SE REDESSINE LE PLUS. `watchRequest` appelle `render()`
   dès que la demande bouge, et c'est précisément ici qu'elle bouge : la facture
   s'écrit et part côté serveur pendant que la cliente regarde les étoiles. La capture
   le montre elle-même, « Facture reçue · Envoyée à … ✓ Reçue ».

   Même famille que le brouillon de message effacé par le message qui arrive : un rendu
   doit relire ce qu'un geste vient d'écrire.

   Ce que cette épreuve tient — les DEUX moitiés :
   • la note choisie survit à un rendu, étoiles ET bouton ;
   • un écran SANS note n'allume rien et garde son bouton fermé (sans quoi un correctif
     qui allumerait tout passerait au vert) ;
   • le clic seul n'envoie RIEN : l'avis part quand elle appuie, pas avant ;
   • et après le rendu, l'envoi marche encore et porte la bonne note. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 428, height: 1000 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(900);

  // La prestation de la capture : un massage au forfait, réglé, prêt à être noté.
  await p.evaluate(() => {
    const S = window.__S;
    /* Sans cette classe, toute la scène est en `display:none` : hauteurs nulles et
       aucun élément ne peut recevoir le focus. C'est la convention du harnais. */
    document.body.classList.add('standalone');
    S.onboarded = true; S.guest = false; S.lang = 'fr'; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'wallet'; S.detail = null; S.draft = null;
    S.mission = { reqId: 'r1', _id: 'm1', status: 'paid', svc: 'massage', svcName: 'Massage',
      when: 'Aujourd’hui', slot: '15:00', duration: 1, unit: 'forfait', rate: 110,
      zone: 'Gustavia', tip: 0, chat: [], provider: { nm: 'Courcot Laura', ini: 'CL' } };
    window.__ecrites = [];
    window.__setFB({ db: {}, auth: { currentUser: { uid: 'cli' } },
      f: { doc: () => ({}), updateDoc: (ref, patch) => { window.__ecrites.push(patch); return Promise.resolve(); } } });
    window.__render();
  });
  await p.waitForTimeout(400);

  const etat = () => p.evaluate(() => {
    const st = [...document.querySelectorAll('#rateStars button')];
    const rb = document.getElementById('rateBtn');
    return { n: st.length, allumees: st.filter(x => x.classList.contains('lit')).length,
      note: Number((window.__S.mission || {}).rating) || 0,
      ouvert: !!rb && !rb.disabled, envois: (window.__ecrites || []).length };
  });

  console.log('A — l’écran vierge n’allume rien, et ne s’envoie pas');
  const v = await etat();
  ok(v.n === 5, 'c’est bien l’écran de notation qu’on mesure (' + v.n + ' étoiles)');
  ok(v.allumees === 0, 'aucune étoile allumée sans note (' + v.allumees + ')');
  ok(!v.ouvert, 'le bouton d’envoi est fermé tant qu’aucune note n’est choisie');

  console.log('\nB — le clic pose la note, allume et ouvre');
  await p.evaluate(() => document.querySelector('#rateStars button[data-star="4"]').click());
  await p.waitForTimeout(150);
  const c = await etat();
  ok(c.allumees === 4, 'quatre étoiles allumées après le clic (' + c.allumees + ')');
  ok(c.note === 4, 'la note est posée dans l’état (' + c.note + ')');
  ok(c.ouvert, 'le bouton d’envoi s’ouvre');
  ok(c.envois === 0, 'et RIEN n’est envoyé par le seul clic (' + c.envois + ' écriture)');

  console.log('\nC — ce qui arrive pendant qu’elle note n’efface plus son choix');
  /* LE RENDU, tel que l'écoute de la demande le déclenche : `watchRequest` appelle
     `render()` dès que le document bouge — ici la facture qui s'écrit côté serveur. */
  await p.evaluate(() => window.__render());
  await p.waitForTimeout(250);
  const d = await etat();
  ok(d.allumees === 4, 'les quatre étoiles survivent au rendu (' + d.allumees + ')');
  ok(d.note === 4, 'la note est toujours là (' + d.note + ')');
  ok(d.ouvert, 'et le bouton d’envoi reste atteignable');

  console.log('\nD — et l’avis part encore, avec la bonne note');
  await p.evaluate(() => document.querySelector('[data-act="submit-rating"]').click());
  await p.waitForTimeout(300);
  const e = await p.evaluate(() => (window.__ecrites || [])[0] || null);
  ok(!!e && e.rating === 4, 'l’envoi après rendu porte bien la note de 4 (' + JSON.stringify(e) + ')');
  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');

  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})();
