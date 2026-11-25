/* « LES UTILISATEURS ONT TENDANCE À OUBLIER DE VALIDER LES ÉTAPES », puis « on relance
   1 h après le manque de pointage » (l'éditeur, 25/11/2026). */
const fs = require('fs'), path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
const R = require(path.join(RACINE, 'functions', 'relance-pointage.js'));
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');
const app = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const H = 3600000, MN = 60000;
const huitH = Date.parse('2026-11-25T12:00:00Z');   // 08:00 à Saint-Barthélemy

console.log('A — pas démarrée');
const acc = { status: 'accepted', dateISO: '2026-11-25', slot: '08:00', unit: 'h', duration: 4 };
ok(R.debutPrevuMs(acc) === huitH, '08:00 se lit à l’heure de Saint-Barthélemy (UTC−4)');
ok(R.relancePointageDecider(acc, huitH + 59 * MN) === '', '59 min après : rien encore');
ok(R.relancePointageDecider(acc, huitH + 61 * MN) === 'demarrage', '1 h après : on relance le démarrage');
ok(R.relancePointageDecider(Object.assign({}, acc, { relanceDemarrageAt: 1 }), huitH + 2 * H) === '', 'une seule fois');
ok(R.relancePointageDecider(acc, huitH + 13 * H) === '', 'au-delà de 12 h, plus de relance (la console le montre)');
ok(R.relancePointageDecider(Object.assign({}, acc, { slot: '06:00', acceptedSlot: '08:00' }), huitH + 61 * MN) === 'demarrage'
  && R.relancePointageDecider(Object.assign({}, acc, { slot: '06:00', acceptedSlot: '08:00' }), huitH + 30 * MN) === '', 'l’heure convenue par le prestataire l’emporte');
ok(R.relancePointageDecider(Object.assign({}, acc, { slot: '', slotFlex: 'day' }), huitH + 5 * H) === '', 'sans heure convenue, on ne devine rien');
ok(R.relancePointageDecider(Object.assign({}, acc, { unit: 'j' }), huitH + 2 * H) === '', 'à la journée, pas de relance');

console.log('B — démarrée, pas terminée');
const wk = { status: 'working', dateISO: '2026-11-25', slot: '08:00', unit: 'h', duration: 4, workingAtMs: huitH + 3 * H };
ok(R.relancePointageDecider(wk, huitH + 7.9 * H) === '', 'démarrée à 11:00 pour 4 h : rien à 15:54');
ok(R.relancePointageDecider(wk, huitH + 8.1 * H) === 'fin', 'à 16:06 (fin prévue + 1 h) : on relance la fin');
ok(R.relancePointageDecider(Object.assign({}, wk, { relanceFinAt: 1 }), huitH + 9 * H) === '', 'une seule fois');
ok(R.relancePointageDecider({ status: 'working', dateISO: '2026-11-25', slot: '08:00', unit: 'forfait', dureePrevueMin: 90, workingAtMs: huitH }, huitH + 2.6 * H) === 'fin',
  'à l’acte : la durée enregistrée à la commande (90 min) fait foi');
ok(R.relancePointageDecider({ status: 'working', dateISO: '2026-11-25', slot: '08:00', unit: 'forfait', workingAtMs: huitH }, huitH + 6 * H) === '',
  'durée inconnue (ancienne commande à l’acte) : on ne devine pas la fin');
ok(R.relancePointageDecider(Object.assign({}, wk, { status: 'done_pro' }), huitH + 9 * H) === '', 'terminée : rien');

console.log('C — le serveur relance le prestataire et le note ; la commande enregistre sa durée');
const mr = fn.slice(fn.indexOf('exports.missionReminders'), fn.indexOf('Rappel de re-commande'));
ok(/RPT\.relancePointageDecider\(/.test(mr), 'le balayage des rappels lit la règle');
ok(/for \(const st of \['accepted', 'working'\]\)/.test(mr) && /where\('dateISO', 'in', veille\)/.test(mr), 'il regarde les missions acceptées et démarrées d’hier et d’aujourd’hui');
ok(/relanceDemarrageAt: FieldValue\.serverTimestamp\(\)/.test(mr) && /relanceFinAt: FieldValue\.serverTimestamp\(\)/.test(mr), 'il note chaque relance pour ne pas la refaire');
ok(/pushMulticast\(tokens, titre, corps, '\/\?open=promissions'/.test(mr) && /sendMail\(db, u\.email, \{ subject: titre/.test(mr), 'notification au prestataire, e-mail s’il n’a pas d’appareil');
ok(/dureePrevueMin:\(function\(\)\{const d=Math\.round\(dureeMinDuDraft\(m\)\|\|0\);return d>0\?d:null;\}\)\(\),/.test(app), 'la commande enregistre sa durée prévue');
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
