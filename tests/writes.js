/* Garde-fou anti-écrasement.
 *
 * Il y a maintenant de VRAIS prestataires et de VRAIS clients dans Firestore.
 * Un `setDoc` sans `{merge:true}` REMPLACE le document entier : tous les champs
 * absents de l'objet écrit sont perdus (gains, missions, code de parrainage,
 * attestation d'assurance, statut Mollie, disponibilités…).
 *
 * Ce test relit le code et refuse toute écriture non fusionnée sur une collection
 * qui contient des données durables. Les collections où l'écrasement est voulu
 * (création d'un document neuf, table de correspondance) sont listées et
 * justifiées ci-dessous — y ajouter une entrée doit être un geste conscient.
 *
 *   node tests/writes.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

// Collections dont les documents VIVENT et s'enrichissent avec le temps :
// toute écriture doit être une fusion.
const DURABLE = ['artisans', 'users', 'clients', 'concierges'];

// Écrasements légitimes, avec leur raison.
const OVERWRITE_OK = {
  settings: 'document de configuration écrit en entier par la console admin',
  prospects: 'fiche de démarchage créée d’un bloc',
  requests: 'mission créée d’un bloc, sur un identifiant tout neuf',
  fcmOwners: 'table jeton → propriétaire : la valeur remplace la précédente',
  adminTokens: 'jeton d’administration : remplacé, jamais complété',
  serviceWishes: 'souhait de service déposé d’un bloc, sur un identifiant neuf',
  ledger: 'écriture comptable d’une mission : posée une fois, jamais complétée',
  icalTokens: 'jeton d’agenda : remplacé, jamais complété',
  gcalStates: 'état OAuth éphémère (15 min)',
  gcalTokens: 'jeton Google : remplacé à chaque autorisation',
  gcalEvents: 'correspondance mission → événement, réécrite en entier',
};

// Découpe un appel `setDoc(...)` en respectant les parenthèses imbriquées.
function calls(src, fn) {
  const out = [];
  const re = new RegExp(fn + '\\(', 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, at: m.index, code: src.slice(m.index, i) });
  }
  return out;
}

// Nom de la collection visée, quand il est écrit en clair dans l'appel (client)
// ou juste avant lui (serveur : `collection('x').doc(id).set(...)`).
function collOf(code, before) {
  let m = /doc\((?:FB\.db|db)\s*,\s*'([^']+)'/.exec(code);
  if (m) return m[1];
  m = /collection\((?:FB\.db|db)\s*,\s*'([^']+)'/.exec(code);
  if (m) return m[1];
  if (before) {
    const all = before.match(/collection\(\s*'([^']+)'\s*\)/g);
    if (all) return /'([^']+)'/.exec(all[all.length - 1])[1];
  }
  return null;
}

// Le document visé est-il fabriqué juste au-dessus (donc forcément neuf) ?
function freshRef(src, lineNo) {
  const lines = src.split('\n');
  const around = lines.slice(Math.max(0, lineNo - 8), lineNo).join('\n');
  return /=\s*FB\.f\.doc\(FB\.f\.collection\(FB\.db,'([^']+)'\)\)/.test(around)
    ? (/=\s*FB\.f\.doc\(FB\.f\.collection\(FB\.db,'([^']+)'\)\)/.exec(around) || [])[1]
    : null;
}

// Côté client on écrit `setDoc(...)`, côté Functions `…doc(id).set(…)`.
// Un `.set(` n'est une écriture Firestore que s'il suit un `.doc(...)` : cela
// écarte `map.set(...)`, `res.set('Content-Type'…)` et consorts.
function writes(src) {
  const cl = calls(src, 'setDoc');
  const sv = calls(src, '\\.set').filter((c) => /\.doc\([^()]*\)\s*$/.test(src.slice(Math.max(0, c.at - 200), c.at)));
  return cl.concat(sv).sort((a, b) => a.line - b.line);
}

function audit(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const lines = src.split('\n');
  const bad = [], unknown = [];
  const all = writes(src);
  all.forEach((c) => {
    if (/merge\s*:\s*true/.test(c.code)) return;
    const before = src.slice(Math.max(0, c.at - 300), c.at);
    const coll = collOf(c.code, before) || freshRef(src, c.line);
    if (!coll) { unknown.push(c.line + ' → cible inconnue'); return; }
    if (DURABLE.indexOf(coll) >= 0) bad.push(file + ':' + c.line + ' → ' + coll);
    else if (!OVERWRITE_OK[coll]) unknown.push(c.line + ' → ' + coll);
  });
  return { bad, unknown, total: all.length };
}

console.log('A — aucune écriture ne peut écraser une fiche vivante');
['index.html', 'functions/index.js'].filter((x) => fs.existsSync(path.join(ROOT, x))).forEach((file) => {
  const r = audit(file);
  ok(r.bad.length === 0, file + ' : ' + r.total + ' écritures, aucune non fusionnée sur '
    + DURABLE.join('/') + (r.bad.length ? '\n      ' + r.bad.join('\n      ') : ''));
  ok(r.unknown.length === 0, file + ' : aucune écriture non fusionnée vers une collection non justifiée'
    + (r.unknown.length ? ' (' + r.unknown.join(', ') + ') — ajoutez-la à OVERWRITE_OK si c’est voulu' : ''));
});

console.log('B — les champs qui portent l’historique ne sont jamais réécrits à zéro');
{
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Ces champs sont alimentés par le serveur ou s'accumulent : le client ne doit
  // jamais les remettre à une valeur fixe.
  [['earnings', /earnings\s*:\s*0\b/], ['jobsTotal', /jobsTotal\s*:\s*0\b/],
   ['founderGross', /founderGross\s*:\s*0\b/], ['noShowCount', /noShowCount\s*:\s*0\b/]].forEach(([nm, re]) => {
    const hits = calls(src, 'setDoc').filter((c) => re.test(c.code));
    ok(hits.length === 0, 'aucune écriture ne remet ' + nm + ' à 0'
      + (hits.length ? ' (lignes ' + hits.map((h) => h.line).join(', ') + ')' : ''));
  });
}

console.log('C — l’inscription prestataire ne détruit pas un compte déjà en place');
{
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sig = calls(src, 'setDoc').find((c) => /'artisans'/.test(c.code) && /status:'attente'/.test(c.code));
  ok(!!sig, 'l’écriture d’inscription est bien identifiée');
  ok(sig && /merge\s*:\s*true/.test(sig.code), 'elle fusionne : un prestataire qui repasse par le formulaire ne perd ni ses gains ni son ancienneté');
}

console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
