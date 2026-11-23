/* MAQUETTE — « RÉGLER MAINTENANT » (l'éditeur, 23/11/2026).
 *
 * Quand la banque refuse le prélèvement d'un supplément — ou de toute la prestation,
 * l'empreinte ayant expiré —, le serveur ne reprélève plus seul (v930). Le client doit
 * pouvoir régler LUI-MÊME, depuis l'app : un bouton qui ouvre le paiement Mollie sur le
 * moment (3-D Secure), donc sans le piège des liens qui meurent en 15 minutes.
 *
 * AVANT : le vrai écran « détail de la prestation » d'aujourd'hui, pour une prestation
 * dont le prélèvement a été refusé — il affiche « Total réglé 112,00 € ».
 * APRÈS : le même écran, le montant dit « Reste à régler », et le bouton. Plus l'accueil
 * du client, où il arrive depuis la notification, avec la même porte. Aucun code de l'app
 * n'est modifié : on remplace le texte et on ajoute le geste dans l'écran rendu.
 *
 *   RACINE=/home/user/alize-prototype node outils/maquette/regler-maintenant.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = process.env.RACINE || '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

async function ouvrir(b) {
  const p = await b.newPage({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 2 });
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|google\.com/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    document.body.classList.add('standalone'); const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false; S.authView = null;
    S.account = { name: 'Cécile Martinez', email: 'c@e.fr', uid: 'c1', role: 'client' };
    S.persona = 'client'; S.clientNav = 'home'; S.mission = null; S.draft = null;
  });
  return p;
}
const h = { reqId: 'r1', svc: 'menage', svcName: 'Ménage', dateISO: '2026-11-25', when: 'mer. 25 nov.', slot: '09:00', unit: 'h', duration: 4, rate: 28, total: 112,
  provider: { nm: 'Karla Barbosa' }, zone: 'Toiny', invNo: '2026-AB-0012', status: 'paid' };
const r = { reqId: 'r1', dateISO: '2026-11-25', slot: '09:00', unit: 'h', duration: 4, providerName: 'Karla Barbosa', molliePaymentId: 'tr_x',
  complementStatus: 'echec', complementAmount: 140 };

const BOUTON = `
  <div class="regler-du" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--hair)">
    <div class="mini" style="color:var(--coral-deep);font-weight:650;line-height:1.45">Votre banque a refusé le prélèvement.</div>
    <button class="btn primary" style="margin-top:10px">__LOCK__&nbsp;Régler maintenant · 140,00&nbsp;€</button>
    <div class="mini" style="margin-top:7px;color:var(--muted)">Paiement sécurisé par votre banque (3-D Secure).</div>
  </div>`;
const BANDEAU = `
  <div class="card regler-bandeau" style="padding:14px;margin-top:12px;border-left:4px solid var(--coral)">
    <b style="font-size:14px">Un règlement reste à faire</b>
    <div class="mini" style="margin-top:4px;line-height:1.45">Ménage du mer. 25 nov. avec Karla Barbosa · <b>140,00&nbsp;€</b></div>
    <button class="btn primary sm" style="margin-top:10px;width:auto;padding:9px 14px">__LOCK__&nbsp;Régler maintenant</button>
  </div>`;

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  // 1. Le détail de la prestation, tel qu'il est aujourd'hui.
  let p = await ouvrir(b);
  await p.evaluate(({ h, r }) => { const S = window.__S; S.detail = { h, r, det: {}, side: 'client', loaded: true }; window.__render(); window.scrollTo(0, 0); }, { h, r });
  await p.waitForTimeout(300);
  const montant = () => p.evaluateHandle(() => [...document.querySelectorAll('.card')].find((c) => /Montant/.test(c.querySelector('.eyebrow') ? c.querySelector('.eyebrow').textContent : '')) || null);
  if (!(await montant()).asElement()) { console.log('✗ carte « Montant » introuvable'); process.exit(1); }
  await p.screenshot({ path: path.join(SORTIE, '1-avant-detail.png'), fullPage: false });
  // 2. Le même écran, après.
  await p.evaluate((BOUTON) => {
    const c = [...document.querySelectorAll('.card')].find((x) => /Montant/.test(x.querySelector('.eyebrow') ? x.querySelector('.eyebrow').textContent : ''));
    const rows = c.querySelectorAll('.row.between');
    rows[0].querySelector('.sub').textContent = 'Reste à régler';
    const m = c.querySelector('.mini[style*="coral"], .mini[style*="good"]'); if (m) m.remove();
    rows[0].insertAdjacentHTML('afterend', BOUTON.replace('__LOCK__', window.__svc.table().lock));
    const fac = [...document.querySelectorAll('[data-act="detail-inv"]')][0]; if (fac) { fac.classList.remove('primary'); fac.classList.add('ghost'); }
  }, BOUTON);
  await p.screenshot({ path: path.join(SORTIE, '2-apres-detail.png'), fullPage: false });
  await p.close();
  // 3. L'accueil du client, où mène la notification.
  p = await ouvrir(b);
  await p.evaluate(() => { const S = window.__S; S.detail = null; window.__render(); window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(SORTIE, '3-avant-accueil.png'), fullPage: false });
  await p.evaluate((BANDEAU) => {
    const v = document.getElementById('view');
    // Sous « De quel service avez-vous besoin ? », au-dessus de tout le reste.
    const sous = [...v.querySelectorAll('*')].find((e) => e.children.length === 0 && /De quel service avez-vous besoin/.test(e.textContent));
    (sous || v.firstElementChild).insertAdjacentHTML('afterend', BANDEAU.replace('__LOCK__', window.__svc.table().lock));
  }, BANDEAU);
  await p.screenshot({ path: path.join(SORTIE, '4-apres-accueil.png'), fullPage: false });
  await p.close(); await b.close();
  console.log('Maquettes dans ' + SORTIE);
})().catch((e) => { console.error(e); process.exit(1); });
