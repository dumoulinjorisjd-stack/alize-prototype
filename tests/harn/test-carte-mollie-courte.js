/* « AI-JE QUELQUE CHOSE À FAIRE ? » — LA SEULE QUESTION QU'ON SE POSE DEVANT CETTE CARTE.

   « Cette phrase n'est pas très claire, il faut la réécrire, et s'il reste une étape la
   marquer. Mais on fait court. » La carte expliquait le mécanisme en quatre lignes sur
   un téléphone sans jamais répondre à la question.

   ET ELLE DISAIT FAUX À CEUX QUI TRAVAILLENT DÉJÀ. « Document manquant » passe avant
   « peut accepter », or les deux vont ensemble en production : Mollie ouvre
   l'encaissement, puis réclame une pièce. Ces gens-là lisaient « sans lui, impossible
   d'accepter des missions » alors qu'ils acceptaient déjà — ce qui attend, ce sont
   leurs VIREMENTS. C'est la nuance posée le 21/09 sur la relance hebdomadaire, jamais
   reportée sur cet écran-ci. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const ctx = await b.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 1400 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__S && window.__render, null, { timeout: 20000 });
  await p.waitForTimeout(900);

  // Les quatre états réels de l'onboarding Mollie, mesurés sur la carte RENDUE.
  const carte = (mollie, onb, canWork) => p.evaluate(([mollie, onb, canWork]) => {
    const S = window.__S;
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.demoMode = false; S.persona = 'pro'; S.proNav = 'home';
    S.onboarded = true; S.guest = false; S.proStatus = 'approved'; S.proName = 'Laure G.';
    S.mission = null; S.detail = null; S.proCats = ['menage']; S.proMissions = [];
    S.proMollie = mollie; S.proMollieOnb = onb;
    S.proMollieCanWork = canWork; S.proMollieOrgId = canWork ? 'org_x' : '';
    window.__render();
    const el = document.querySelector('[data-act="pro-mollie"]');
    if (!el) return null;
    const t = el.innerText.replace(/\s+/g, ' ').trim();
    const r = el.getBoundingClientRect();
    return { txt: t, h: Math.round(r.height) };
  }, [mollie, onb, canWork]);

  console.log('A — il peut accepter, Mollie vérifie : rien à faire, et ça se lit tout de suite');
  const a = await carte('pending', 'in-review', true);
  ok(!!a && /^Vous pouvez accepter des missions/.test(a.txt), 'le titre dit ce qu’il peut faire');
  ok(!!a && /Rien à faire\./.test(a.txt), 'et la première chose qu’on lit est « Rien à faire. »');
  ok(!!a && /Suivre ›/.test(a.txt), 'le bouton suit, il n’invite pas à activer ce qui l’est déjà');
  ok(!!a && a.h <= 120, 'la carte tient en hauteur sur un téléphone de 390 px (' + (a ? a.h : '—') + ' px)');

  console.log('\nB — il peut accepter MAIS Mollie réclame une pièce : l’étape est marquée');
  const bb = await carte('pending', 'needs-data', true);
  ok(!!bb && /^Un document à fournir/.test(bb.txt), 'le titre nomme l’étape qui reste (« ' + (bb ? bb.txt.slice(0, 22) : '') + ' »)');
  ok(!!bb && !/impossible d’accepter|impossible d'accepter/.test(bb.txt),
    'et on ne lui dit PLUS qu’il ne peut pas accepter de mission : il en accepte déjà');
  ok(!!bb && /Vos gains sont mis de côté/.test(bb.txt), 'ce qui attend, ce sont ses virements, et c’est ce qui est dit');
  ok(!!bb && /Compléter ›/.test(bb.txt), 'le bouton nomme le geste : compléter, pas activer');

  console.log('\nC — il ne peut pas encore accepter, et une pièce manque : là c’est vrai');
  const c = await carte('pending', 'needs-data', false);
  ok(!!c && /^Un document à fournir/.test(c.txt), 'même titre, même étape');
  ok(!!c && /Sans lui, impossible d’accepter|Sans lui, impossible d'accepter/.test(c.txt),
    'et la conséquence est dite, parce que là elle est exacte');

  console.log('\nD — dossier complet en examen, et dossier jamais commencé');
  const d1 = await carte('pending', 'in-review', false);
  ok(!!d1 && /^Paiements en cours de validation/.test(d1.txt) && /En examen chez Mollie\. Vous serez prévenu\./.test(d1.txt),
    'en examen : une ligne, et rien de plus');
  const d2 = await carte('none', '', false);
  ok(!!d2 && /^Dernière étape pour être payé/.test(d2.txt) && /Activer ›/.test(d2.txt),
    'jamais commencé : l’étape est marquée et le bouton active');

  console.log('\nE — et la carte disparaît quand tout est en ordre');
  const e = await carte('active', 'completed', true);
  ok(e === null, 'paiements actifs : plus de carte du tout');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)\n') : '\nTout est vert.\n');
  process.exit(f ? 1 : 0);
})();
