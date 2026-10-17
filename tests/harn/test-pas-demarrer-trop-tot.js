/* « J'AI FAIT UNE RÉSERVATION POUR SAMEDI PROCHAIN, MAIS LE PRESTATAIRE A DÉJÀ CLIQUÉ SUR
   DÉMARRER, CE QUI FAIT QUE JE NE PEUX PLUS L'ANNULER. COMMENT A-T-IL PU DÉMARRER ? »
   — l'éditeur, le 17/10/2026.

   IL A PU PARCE QUE RIEN NE L'EN EMPÊCHAIT. « Démarrer la prestation » paraît dès que la
   mission est ACCEPTÉE, sans le moindre regard sur la date. Et le piège se referme
   derrière : la seule porte d'annulation du client est offerte sur une mission
   `accepted` — passer en `working` la fait disparaître. Un toucher d'un tiers, et le
   client reste avec une réservation dont il ne veut plus.

   LA FENÊTRE S'OUVRE QUAND LE CLIENT PEUT L'ATTENDRE : l'heure du créneau, moins la
   souplesse qu'il a accordée, moins une heure de courtoisie. Une souplesse « dans la
   journée » n'a pas d'heure : elle ouvre au début du jour.

   ET CE QU'ON NE SAIT PAS DATER, ON NE LE REFUSE PAS : un colis n'a pas de date de
   créneau, et bloquer sur une date qu'on n'a pas empêcherait de travailler. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  /* AU FUSEAU DE SAINT-BARTHÉLEMY : les instants sont construits et lus dans la page, et
     une heure de créneau se compare à une horloge locale. */
  const p = await b.newPage({ viewport: { width: 420, height: 1200 }, timezoneId: 'America/Guadeloupe' });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__demarrage);

  console.log('A — le noyau : la fenêtre s’ouvre quand le client peut l’attendre');
  const noy = await p.evaluate(() => {
    const D = window.__demarrage;
    const H = 3600000;
    const jour = function (dec) { const d = new Date(); d.setDate(d.getDate() + dec);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const le = function (dec, h) { const d = new Date(); d.setDate(d.getDate() + dec); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const m = function (dec, slot, flex) { return { dateISO: jour(dec), slot: slot, slotFlex: flex || 0 }; };
    return {
      // samedi prochain, 14 h, regardé aujourd'hui : c'est le cas de l'éditeur
      semaineProchaine: D.decider(m(6, '14:00'), Date.now(), H).ok,
      // le jour même, trois heures avant : toujours trop tôt
      troisHeuresAvant: D.decider(m(0, '14:00'), le(0, 11), H).ok,
      // une demi-heure avant : la courtoisie joue
      demiHeureAvant: D.decider(m(0, '14:00'), le(0, 13) + 30 * 60000, H).ok,
      // à l'heure
      aLHeure: D.decider(m(0, '14:00'), le(0, 14), H).ok,
      // en retard : évidemment permis
      enRetard: D.decider(m(0, '14:00'), le(0, 16), H).ok,
      // souplesse ± 2 h : le client accepte dès midi, donc la fenêtre ouvre plus tôt
      souple2h: D.decider(m(0, '14:00', 120), le(0, 11), H).ok,
      souple2hTropTot: D.decider(m(0, '14:00', 120), le(0, 9), H).ok,
      // « dans la journée » : aucune heure promise, la fenêtre ouvre le matin
      journee: D.decider(m(0, '14:00', 'day'), le(0, 7), H).ok,
      journeeVeille: D.decider(m(1, '14:00', 'day'), le(0, 7), H).ok,
      // ce qu'on ne sait pas dater n'est pas refusé
      sansDate: D.decider({ slot: '14:00' }, Date.now(), H),
      motif: D.decider(m(6, '14:00'), Date.now(), H).motif,
      courtoisie: D.courtoisie(),
    };
  });
  ok(noy.semaineProchaine === false,
    'une prestation de samedi prochain ne se démarre pas aujourd’hui — c’est exactement le cas signalé');
  ok(noy.motif === 'trop-tot', 'et le refus se nomme (' + noy.motif + ')');
  ok(noy.troisHeuresAvant === false, 'ni trois heures avant, le jour même');
  ok(noy.demiHeureAvant === true && noy.aLHeure === true && noy.enRetard === true,
    'mais une demi-heure avant, oui : un prestataire en avance ne doit pas se heurter à un refus');
  ok(noy.souple2h === true && noy.souple2hTropTot === false,
    'une souplesse de ± 2 h ouvre la fenêtre d’autant, pas davantage');
  ok(noy.journee === true,
    '« dans la journée » n’a pas d’heure promise : la fenêtre ouvre dès le matin');
  ok(noy.journeeVeille === false,
    'mais pas la VEILLE : « dans la journée » reste un jour précis');
  ok(noy.sansDate.ok === true && noy.sansDate.motif === 'sans-date',
    'et ce qu’on ne sait pas dater n’est pas refusé — un colis n’a pas d’heure de créneau');
  ok(noy.courtoisie === 3600000, 'la courtoisie est d’une heure');

  console.log('B — l’écran du prestataire');
  /* L'ÉCRAN LIT L'HORLOGE RÉELLE (il appelle `Date.now()`), donc la fixture ne doit pas
     dépendre de l'heure qu'il est : un créneau à 14 h ne s'ouvre qu'après 13 h, et
     l'épreuve rougissait le matin et passait l'après-midi. On choisit donc des créneaux
     dont la réponse est la même à toute heure du jour. */
  const ecran = (dec, slot) => p.evaluate(({ dec, slot }) => {
    const S = window.__S;
    const d = new Date(); d.setDate(d.getDate() + dec);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.demoMode = false; S.persona = 'pro';
    S.proStatus = 'approved'; S.proName = 'Laureguyon'; S.proNav = 'home';
    S.chat = false; S.support = false; S.pastChat = null;
    S.mission = Object.assign(window.__newMission({ id: 'menage', nm: 'Ménage', rate: 28 }), {
      _id: 'm1', reqId: 'r1', status: 'accepted', duration: 2, unit: 'h',
      dateISO: iso, when: dec === 0 ? 'Aujourd’hui' : 'sam. 24 oct.', slot: slot, slotFlex: 0,
      zone: 'Saint-Jean', clientName: 'Joris' });
    window.__render();
    const v = document.getElementById('view');
    const btn = Array.prototype.slice.call(v.querySelectorAll('button'))
      .find(function (x) { return /Démarrer la prestation/.test(x.textContent || ''); });
    return { trouve: !!btn, desactive: btn ? !!btn.disabled : null,
      txt: (v.textContent || '').replace(/\s+/g, ' ') };
  }, { dec, slot });

  const loin = await ecran(6, '14:00');
  ok(loin.trouve && loin.desactive === true,
    'le bouton est là mais ÉTEINT : le retirer laisserait croire que la mission est perdue');
  ok(/Vous pourrez démarrer à partir du/.test(loin.txt),
    'et l’écran DIT à partir de quand, au lieu de refuser sans rien expliquer');

  // Minuit : la fenêtre s'est ouverte la veille à 23 h, donc elle est ouverte à TOUTE
  // heure d'aujourd'hui — la mesure ne dépend plus du moment où l'épreuve tourne.
  const jour = await ecran(0, '00:00');
  ok(jour.trouve && jour.desactive === false,
    'une fois la fenêtre ouverte, le bouton s’allume');
  ok(!/Vous pourrez démarrer à partir du/.test(jour.txt),
    'et la phrase d’attente disparaît avec lui');

  console.log('C — le geste refuse aussi, pas seulement le bouton');
  /* UN ÉCRAN RENDU IL Y A DIX MINUTES GARDE SON BOUTON. Une garde qui ne vit que dans
     l'affichage se contourne en attendant. */
  const force = await p.evaluate(() => {
    const S = window.__S;
    const d = new Date(); d.setDate(d.getDate() + 6);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    S.mission.status = 'accepted'; S.mission.dateISO = iso; S.mission.slot = '14:00'; S.mission.slotFlex = 0;
    const faux = document.createElement('button');
    faux.dataset.act = 'pro-advance'; faux.dataset.to = 'working';
    document.body.appendChild(faux);
    faux.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    faux.remove();
    const t = document.getElementById('toast');
    return { statut: S.mission.status, msg: t ? (t.textContent || '') : '' };
  });
  ok(force.statut === 'accepted',
    'forcé depuis un bouton fabriqué, le statut ne bouge pas');
  ok(/Trop tôt/.test(force.msg),
    'et le refus se dit (' + force.msg + ')');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
