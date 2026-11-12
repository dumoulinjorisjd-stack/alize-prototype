/* CAPTURES « OÙ METTRE SON IBAN », À ENVOYER À UN PRESTATAIRE.
   L'application réelle (harnais, Firebase simulé), sur un écran de téléphone, avec le
   bouton à toucher entouré et numéroté. Rien d'inventé : ce sont les vrais écrans.
   Refaire :  bash tests/harn/build.sh && node outils/guides/captures-iban.js  */
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright-core');
const RACINE = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'iban-prestataire');
const o = {headless: true}; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
const IBAN_EX = 'FR76 3000 6000 0112 3456 7890 189';   // IBAN d'exemple public, clé juste
(async () => {
  const b = await chromium.launch(o);
  const p = await (await b.newContext({locale: 'fr-FR', viewport: {width: 390, height: 844}, deviceScaleFactor: 2})).newPage();
  await p.route('**/*', (r) => /gstatic|googleapis|firebase|cloudfunctions|maps|tile/.test(r.request().url()) ? r.abort() : r.continue());
  await p.goto('file://' + path.join(RACINE, 'tests', 'harn', 'app.html'), {waitUntil: 'load'});
  await p.waitForTimeout(1400);
  const etat = (x) => p.evaluate((x) => {
    const S = window.__S; document.body.classList.add('standalone');
    Object.assign(S, {lang: 'fr', onboarded: true, guest: false, demoMode: false, mission: null, detail: null, draft: null,
      persona: 'pro', proStatus: 'approved', proName: 'Votre nom', proLegal: 'Votre nom', proCats: ['massage'], proOnline: true,
      proNotifPush: true, proMollie: 'active', proMollieOrgId: 'org_1', proMollieOnb: 'completed', proMollieCanWork: true,
      proInsured: true, proInsuranceStatus: 'valide', proSiret: '90212345600017', proPhone: '0690 00 00 00', proBio: '',
      proJobsTotal: 3, proHistory: [], missions: [], history: [], proNetMisDeCote: 0, proNetIrroutable: 104.5,
      account: {name: 'Votre nom', email: 'vous@exemple.fr', zone: 'Gustavia'}}, x);
    window.__render(); window.scrollTo(0, 0);
  }, x).then(nettoyer);
  /* Ce que le banc ne sait pas rendre, et qui brouillerait le geste montré : le logo
     relatif (le harnais vit dans tests/harn/), l'encart des notifications (le navigateur
     de test n'en a pas) et la liste des missions (aucun serveur). On les règle ou on les
     retire de la CAPTURE ; l'écran réel du prestataire n'est pas touché. */
  async function nettoyer() {
    await p.evaluate(() => {
      document.querySelectorAll('img').forEach((i) => { if (i.src.indexOf('/tests/harn/') >= 0) i.src = i.src.replace('/tests/harn/', '/'); });
      document.querySelectorAll('.show').forEach((e) => { if (/toast/i.test(e.id || e.className)) e.classList.remove('show'); });
      // On remonte jusqu'au bloc posé directement dans la page (.pad) : c'est lui qu'on retire.
      const bloc = (re) => { const f = [...document.querySelectorAll('.pad *')].find((e) => e.children.length === 0 && re.test(e.textContent));
        let d = f; while (d && d.parentElement && !d.parentElement.classList.contains('pad')) d = d.parentElement; return d; };
      [/Ne manquez aucune mission/, /Liste indisponible pour l/].forEach((re) => { const d = bloc(re); if (d) d.remove(); });
      const t = document.getElementById('toast') || document.querySelector('.toast'); if (t) t.classList.remove('show');
    });
    await p.waitForTimeout(150);
  }
  /* Entoure un élément et pose un numéro. Le cadre est hors du flux : rien ne bouge. */
  const marquer = (sel, n, texte) => p.evaluate(([sel, n, texte]) => {
    document.querySelectorAll('.guide-marque').forEach((e) => e.remove());
    const el = typeof sel === 'string' ? document.querySelector(sel) : null;
    if (!el) return false;
    el.scrollIntoView({block: 'center'});
    const r = el.getBoundingClientRect();
    const c = document.createElement('div'); c.className = 'guide-marque';
    Object.assign(c.style, {position: 'fixed', left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px',
      height: (r.height + 12) + 'px', border: '4px solid #e5383b', borderRadius: '14px', zIndex: 2147483646, pointerEvents: 'none',
      boxShadow: '0 0 0 4px rgba(229,56,59,.18)'});
    const pas = document.createElement('div'); pas.className = 'guide-marque';
    Object.assign(pas.style, {position: 'fixed', left: '8px', top: '0px', background: '#e5383b', color: '#fff', font: '700 15px/1.25 system-ui,sans-serif',
      padding: '8px 12px', borderRadius: '10px', zIndex: 2147483647, pointerEvents: 'none', maxWidth: (window.innerWidth - 24) + 'px', boxShadow: '0 4px 12px rgba(0,0,0,.2)'});
    pas.textContent = n + '. ' + texte;
    document.body.appendChild(c); document.body.appendChild(pas);
    const h = pas.getBoundingClientRect().height, w = pas.getBoundingClientRect().width;
    const dessus = r.top - 6 - 8 - h;
    pas.style.top = (dessus > 60 ? dessus : r.bottom + 14) + 'px';
    pas.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    // Le cadre reste dans l'écran (l'onglet du bas touche les bords).
    const L = Math.max(3, r.left - 6), R = Math.min(window.innerWidth - 3, r.right + 6), B = Math.min(window.innerHeight - 3, r.bottom + 6);
    Object.assign(c.style, {left: L + 'px', width: (R - L) + 'px', height: (B - (r.top - 6)) + 'px'});
    return true;
  }, [sel, n, texte]);
  const photo = async (nom) => { await p.waitForTimeout(250); await p.screenshot({path: path.join(OUT, nom)}); };
  const rendu = [];

  // A — depuis l'accueil
  await etat({proNav: 'home', proIban: '', proEditContact: false, proContactForm: null, _fold: {}});
  if (await marquer('[data-act="pro-iban"]', 1, 'Touchez cette carte')) { await photo('1-accueil-touchez-la-carte.png'); rendu.push('1'); }
  await p.evaluate(() => { document.querySelectorAll('.guide-marque').forEach((e) => e.remove()); document.querySelector('[data-act="pro-iban"]').click(); });
  await p.waitForTimeout(300);
  await nettoyer();
  await p.evaluate(() => { const i = document.querySelector('[data-proeditiban]'); if (i) i.parentElement.setAttribute('data-guide', 'bloc-iban'); });
  if (await marquer('[data-guide="bloc-iban"]', 2, 'Saisissez votre IBAN, puis le nom du titulaire')) { await photo('2-saisissez-votre-iban.png'); rendu.push('2'); }
  await p.evaluate((iban) => {
    const S = window.__S; S.proContactForm = Object.assign({}, S.proContactForm, {iban: iban, ibanTitulaire: 'Votre nom'});
    window.__render();
  }, IBAN_EX);
  await nettoyer();
  if (await marquer('[data-act="pro-contact-save"]', 3, 'Touchez « Enregistrer »')) { await photo('3-touchez-enregistrer.png'); rendu.push('3'); }
  await p.evaluate(() => { document.querySelectorAll('.guide-marque').forEach((e) => e.remove()); document.querySelector('[data-act="pro-contact-save"]').click(); });
  await etat({proNav: 'home', proEditContact: false});
  if (await marquer('[data-act="pro-iban"]', 4, 'C’est fait : « Votre IBAN est enregistré »')) { await photo('4-c-est-enregistre.png'); rendu.push('4'); }

  // B — l'autre chemin, par l'onglet Compte
  await etat({proNav: 'home', proIban: '', proEditContact: false, proContactForm: null, _fold: {}});
  const onglet = await p.evaluate(() => {
    const el = [...document.querySelectorAll('button,a')].find((x) => /^\s*Compte\s*$/.test(x.textContent) && x.getBoundingClientRect().top > window.innerHeight - 140);
    if (el) el.setAttribute('data-guide', 'onglet-compte'); return !!el;
  });
  if (onglet && await marquer('[data-guide="onglet-compte"]', 1, 'Sinon : touchez « Compte »')) { await photo('autre-chemin-1-onglet-compte.png'); rendu.push('B1'); }
  await etat({proNav: 'account', proIban: '', proEditContact: false, proContactForm: null, _fold: {}});
  if (await marquer('[data-fold="p-infos"]', 2, 'Ouvrez « Mes informations d’inscription »')) { await photo('autre-chemin-2-mes-informations.png'); rendu.push('B2'); }
  await etat({proNav: 'account', proIban: '', proEditContact: false, proContactForm: null, _fold: {'p-infos': true}});
  if (await marquer('[data-act="pro-contact-edit"]', 3, 'Touchez « Modifier téléphone, présentation & IBAN »')) { await photo('autre-chemin-3-modifier.png'); rendu.push('B3'); }

  await b.close();
  console.log('captures : ' + rendu.join(' ') + ' → ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
