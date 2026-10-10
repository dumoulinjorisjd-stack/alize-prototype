/* « BIZARRE, LA COMMANDE URGENTE D'UNE VRAIE CLIENTE D'HIER POUR DEUX HEURES DE MÉNAGE
   EST INTROUVABLE. » — l'éditeur, le 16/10/2026, après deux corrections de la console.

   ELLE ÉTAIT INTROUVABLE PARCE QU'ELLE N'EXISTAIT PLUS. `cancelActiveRequest` appelait
   `deleteDoc` : le document Firestore était EFFACÉ. Aucune carte, aucun compteur, aucune
   statistique ne pouvait plus la montrer — ce n'était pas un défaut d'affichage, et
   aucune correction de la console n'y aurait rien changé.

   ET C'ÉTAIT LE CAS LE PLUS COURANT. Une demande ACCEPTÉE s'annule par son STATUT : les
   deux premières branches de `cancel-confirm` le font, et leur commentaire explique même
   pourquoi (« la suppression du document est interdite par les règles »). Seule la
   demande SANS prestataire — exactement celle que personne n'a prise — tombait dans la
   branche qui efface. Deux chemins y menaient : « Annuler la demande » depuis le suivi,
   et « Supprimer » (ou son glissé) depuis le portefeuille, à UN seul toucher. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const SRC = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const RULES = fs.readFileSync(path.join(RACINE, 'firestore.rules'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 390, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  /* Le serveur simulé note TOUT : ce qui est effacé, et ce qui est écrit. */
  const EPINGLE = `window.__base={suppr:[],maj:[]};
    window.__setFB({ auth:{currentUser:{uid:'cli1',email:'c@x.c'}}, db:{},
      f:{ doc:function(){ return {_p:Array.prototype.slice.call(arguments,1)}; },
        collection:function(){return {};}, onSnapshot:function(){return function(){};},
        deleteDoc:function(ref){ window.__base.suppr.push(ref._p.join('/')); return Promise.resolve(); },
        updateDoc:function(ref,d){ window.__base.maj.push({chemin:ref._p.join('/'),data:d}); return Promise.resolve(); },
        setDoc:function(){return Promise.resolve();},
        getDoc:function(){return Promise.resolve({exists:function(){return false;},data:function(){return {};}});} },
      fn:{ httpsCallable:function(){ return function(){ return new Promise(function(){}); }; } }, functions:{} });`;
  const mesure = (fn) => p.evaluate('(function(){' + EPINGLE + 'return (' + fn.toString() + ')();})()');

  const commande = () => mesure(() => {
    const S = window.__S;
    document.body.classList.add('standalone');
    const sp = document.getElementById('splash'); if (sp) sp.style.display = 'none';
    const br = document.querySelector('aside.brief'); if (br) br.style.display = 'none';
    S.lang = 'fr'; S.onboarded = true; S.guest = false; S.demoMode = false;
    S.persona = 'client'; S.clientNav = 'wallet'; S.mission = null; S.draft = null;
    S.delAsk = null; S.cancelAsk = false;
    S.account = { name: 'Camille', email: 'c@x.c', uid: 'cli1', role: 'client' };
    S.adminPrices = { menage: 35 };
    /* DEUX HEURES DE MÉNAGE, POUR DEMAIN, QUE PERSONNE N'A PRISE : le cas exact. */
    const m = Object.assign(window.__newMission({ id: 'menage', nm: 'Ménage', rate: 35 }),
      { reqId: 'rVraie', _id: 'mVraie', status: 'pending', duration: 2, when: 'Demain',
        slot: '09:00', zone: 'Gustavia', provider: null, providerUid: null });
    S.missions = [m]; S.history = []; S.recurring = [];
    window.__render();
    return { lignes: document.querySelectorAll('[data-act^="del-demand:"]').length };
  });

  console.log('A — depuis le portefeuille : deux touchers, et rien n’est effacé');
  const dep = await commande();
  ok(dep.lignes >= 1, 'la commande en recherche porte bien son bouton');

  const premier = await mesure(() => {
    document.querySelector('[data-act^="del-demand:"]').click();
    const v = document.getElementById('view');
    return { suppr: window.__base.suppr.length, maj: window.__base.maj.length,
      encore: (window.__S.missions || []).length,
      txt: (v.textContent || '').replace(/\s+/g, ' ') };
  });
  ok(premier.suppr === 0 && premier.maj === 0 && premier.encore === 1,
    'LE PREMIER TOUCHER N’ÉCRIT RIEN : il armait et partait, sur une commande vivante');
  ok(/Confirmer l’annulation/.test(premier.txt), 'il demande confirmation…');
  ok(/La recherche s’arrête/.test(premier.txt), '…et DIT ce que le second toucher fera');

  const second = await p.evaluate(() => {
    document.querySelector('[data-act^="del-demand:"]').click();
    return new Promise(function (r) { setTimeout(function () {
      r({ suppr: window.__base.suppr.slice(), maj: window.__base.maj.slice(),
        encore: (window.__S.missions || []).length }); }, 150); });
  });
  ok(second.suppr.length === 0,
    'ET RIEN N’EST EFFACÉ : le document Firestore survit, c’est tout l’objet de ce correctif ('
    + (second.suppr.join(', ') || 'aucune suppression') + ')');
  ok(second.maj.length === 1 && second.maj[0].data.status === 'cancelled',
    'la demande passe en « annulée », par son statut');
  ok(second.maj[0].data.cancelledAt > 0,
    'avec sa date d’arrêt, sans laquelle la console ne saurait pas quand la ranger');
  ok(second.maj[0].data.lateCancel === false && second.maj[0].data.feeDecision === 'none'
     && second.maj[0].data.cancelFee === 0,
    'et SANS indemnité : personne ne s’était engagé, la console ne doit pas annoncer qu’un prestataire doit trancher');
  ok(second.encore === 0, 'elle quitte la liste du client, qui ne la cherche plus');

  console.log('B — depuis l’écran de suivi, le même chemin');
  await commande();
  const suivi = await p.evaluate(() => {
    const S = window.__S; S.mission = S.missions[0]; S.cancelAsk = true; window.__render();
    const el = document.querySelector('[data-act="cancel-confirm"]');
    if (!el) return { trouve: false };
    el.click();
    return new Promise(function (r) { setTimeout(function () {
      r({ trouve: true, suppr: window.__base.suppr.slice(), maj: window.__base.maj.slice() }); }, 150); });
  });
  ok(suivi.trouve, 'la confirmation d’annulation est bien là');
  ok(suivi.suppr.length === 0 && suivi.maj.length === 1 && suivi.maj[0].data.status === 'cancelled',
    'elle annule par le statut elle aussi : une demande sans prestataire ne s’efface plus par cette porte non plus');

  console.log('C — ce qui ne devait pas changer');
  ok(/releaseHoldOnDelete/.test(fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8')),
    'le filet qui libère l’empreinte sur une suppression reste en place, pour une suppression d’administrateur');
  ok(/before\.status !== 'cancelled' && after\.status === 'cancelled'/.test(
    fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8')),
    'et le serveur écoute « cancelled » : il libère l’empreinte, rend les arrhes et prévient — tout ce que la suppression faisait, et le reste');
  ok(/allow delete: if isAdmin\(\) \|\| \(isClient\(\)/.test(RULES),
    'LA RÈGLE AUTORISE ENCORE LE CLIENT À SUPPRIMER, et c’est volontaire pour l’instant : '
    + 'une version plus ancienne encore installée appelle toujours `deleteDoc`, et la lui refuser '
    + 'la laisserait avec une commande impossible à annuler, empreinte bancaire retenue. À resserrer '
    + 'une fois le parc à jour.');

  ok(errs.length === 0, 'aucune erreur JS' + (errs.length ? ' (' + errs[0] + ')' : ''));
  await b.close();
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTout est vert');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC (levée) : ' + (e && e.message)); process.exit(1); });
