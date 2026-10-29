/* MAQUETTE — « À L'INSCRIPTION, SI ON REFUSE LA GRILLE, ON DOIT POUVOIR METTRE EN
 * DÉTAIL TOUT SON PROPRE CATALOGUE » (l'éditeur, 29/10/2026).
 *
 * CE QUE L'ÉCRAN DEMANDE AUJOURD'HUI, MESURÉ : décocher « J'applique la grille » ouvre
 * UN champ par métier — « € net/h souhaités » (`desiredNet`). Un seul nombre, en NET,
 * à l'heure. Pour un métier à l'acte il ne peut rien dire : ni les lignes, ni leurs
 * durées, ni leurs noms. Et c'est du NET, quand le client paie un prix CLIENT.
 *
 * C'est le même éditeur que la console, de l'autre côté — et la saisie est la sienne :
 * il nomme ses prestations et fixe ce que le client paiera. On lui montre ce qu'il
 * perçoit, puisque c'est en net qu'il raisonne.
 *
 *   node outils/maquette/catalogue-a-l-inscription.js
 */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SORTIE = process.env.SORTIE || '/tmp/claude-0/-home-user-archipel/80ca5604-90c0-5740-88fb-67b15377cf22/scratchpad/maquettes';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);
  await p.evaluate(() => {
    window.__setFB({ auth: { currentUser: null }, db: {},
      f: { doc: () => ({}), setDoc: () => Promise.resolve(), getDoc: () => Promise.resolve({ exists: () => false, data: () => ({}) }) },
      fn: { httpsCallable: () => () => new Promise(() => {}) }, functions: {} });
    document.body.classList.add('standalone');
    /* LA PORTE D'INSTALLATION PASSE AVANT TOUTE INSCRIPTION (`accountsHere`), et elle a
       raison : « c'est l'application installée qui vous prévient ». La scène la franchit
       comme un vrai appareil installé plutôt que de la contourner. */
    try { localStorage.setItem('ti_installee', '1'); } catch (_) {}
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const S = window.__S;
    S.lang = 'fr'; S.adminPricesLus = true;
    S.draft = null; S.persona = 'pro'; S.proStatus = 'draft'; S.onboarded = false;
    S.authView = null; S.onbStep = 0; S.signupKind = 'artisan'; S.proStep = 'svc';
    /* ELLE A DÉCOCHÉ LA GRILLE : c'est le seul cas où l'écran pose la question, et c'est
       celui que la demande vise. */
    S.proForm = { name: 'Chloé R.', phone: '0690 55 04 21', cats: ['massage'],
      acceptsGrille: false, desiredNet: { massage: 128 } };
    window.__render();
  });
  await p.waitForTimeout(450);

  const zone = () => p.evaluate(() => {
    const n = Array.from(document.querySelectorAll('#view *')).find((e) => /net\/h souhait/i.test(e.textContent || '') && !Array.from(e.children).some((c) => /net\/h souhait/i.test(c.textContent || '')));
    if (!n) return null;
    let z = n; while (z && !(z.style && /teal-wash/.test(z.getAttribute('style') || '')) && z.parentElement) z = z.parentElement;
    return !!z;
  });
  if (!(await zone())) {
    console.log('✗ bloc « € net/h souhaités » introuvable. Écran rendu :');
    console.log(await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 800)));
    await b.close(); process.exit(1);
  }

  const bloc = await p.evaluateHandle(() => {
    const n = Array.from(document.querySelectorAll('#view *')).find((e) => /net\/h souhait/i.test(e.textContent || '') && !Array.from(e.children).some((c) => /net\/h souhait/i.test(c.textContent || '')));
    let z = n; while (z && !/teal-wash/.test(z.getAttribute('style') || '') && z.parentElement) z = z.parentElement;
    return z;
  });
  await p.evaluate((e) => e.scrollIntoView({ block: 'center' }), bloc);
  await p.waitForTimeout(200);
  const tirer = async (n) => { const f = path.join(SORTIE, n + '.png'); await bloc.screenshot({ path: f }); return f; };
  const rendus = [['avant', await tirer('6-inscription-avant')]];

  await p.evaluate(() => {
    const n = Array.from(document.querySelectorAll('#view *')).find((e) => /net\/h souhait/i.test(e.textContent || '') && !Array.from(e.children).some((c) => /net\/h souhait/i.test(c.textContent || '')));
    let z = n; while (z && !/teal-wash/.test(z.getAttribute('style') || '') && z.parentElement) z = z.parentElement;
    const net = (px) => Math.round(px * 0.85); // l'écran réel appellera `proNetHint`
    const sien = [['Massage californien · 1 h', 150], ['Deep tissue · 1 h 15', 185],
      ['Rituel signature · 1 h 30', 230], ['Duo en cabine · 1 h', 260]];
    /* ON GARDE LA BOÎTE, ON CHANGE LA QUESTION : même bloc teinté, même place dans le
       parcours, même enregistrement au fil de la frappe. Ce qui change est ce qu'on
       demande — des PRESTATIONS, plus un nombre. */
    z.innerHTML = '<div class="mini" style="font-weight:800">Votre catalogue · Massage</div>'
      + '<div class="mini" style="margin-top:4px">Vos prestations, telles que vos clients les liront, et le prix qu\'ils paieront. '
      + 'Les clients vous choisiront vous&nbsp;: ils verront cette carte, et elle seule.</div>'
      + sien.map(function (a) {
          return '<div style="margin-top:11px">'
            + '<input class="txt" value="' + a[0] + '" placeholder="Nom de la prestation, durée comprise" style="width:100%">'
            + '<div class="row" style="gap:8px;align-items:center;margin-top:6px">'
            + '<input class="txt" value="' + a[1] + '" inputmode="decimal" placeholder="Prix" style="flex:none;width:82px;text-align:right">'
            + '<span class="mini" style="flex:1;white-space:nowrap">€ client · <b>' + net(a[1]) + ' € pour vous</b></span>'
            + '<button class="btn ghost sm" style="flex:none;width:auto;padding:6px 10px;margin:0">✕</button></div></div>';
        }).join('')
      + '<button class="btn ghost sm" style="width:auto;margin:13px 0 0;padding:8px 12px">+ Ajouter une prestation</button>'
      + '<div class="mini" style="margin-top:11px;padding-top:9px;border-top:1px solid rgba(0,0,0,.07)">'
      + 'Ti-Services relit votre catalogue avant de l\'ouvrir aux clients.</div>';
  });
  await p.waitForTimeout(250);
  rendus.push(['apres', await tirer('6-inscription-apres')]);
  console.log('\nInscription :'); rendus.forEach(([n, f]) => console.log('  ' + n.padEnd(6) + ' ' + f));
  if (errs.length) console.log('\nErreurs de page : ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
