/* LA RÉCURRENCE — LE NOYAU (l'éditeur, 25/11/2026). Voir functions/serie-recurrente.js. */
const path = require('path');
const S = require(path.join(path.resolve(__dirname, '..', '..'), 'functions', 'serie-recurrente.js'));
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('A — ce que le client a choisi');
ok(eq(S.recurrencePropre({ rythme: 'semaine', jours: [6, 3, 3, 9], debut: '2026-12-02' }), { rythme: 'semaine', jours: [3, 6], debut: '2026-12-02' }), 'les jours sont triés, dédoublonnés, bornés');
ok(S.recurrencePropre({ rythme: 'semaine', jours: [], debut: '2026-12-02' }) === null, 'une semaine sans jour n’est pas une récurrence');
ok(S.recurrencePropre({ rythme: 'annee', debut: '2026-12-02' }) === null && S.recurrencePropre({ rythme: 'jour', debut: '2026-02-30' }) === null, 'rythme ou date illisibles : ponctuelle');

console.log('B — les passages à créer');
const semaine = { rythme: 'semaine', jours: [3, 6], debut: '2026-12-02' };
ok(eq(S.passagesACreer({ recurrence: semaine, etat: 'active', aujourdhui: '2026-11-30' }), ['2026-12-05', '2026-12-09', '2026-12-12']),
  'mercredi et samedi, sur 14 jours, sans refaire le premier passage (la commande elle-même)');
ok(eq(S.passagesACreer({ recurrence: semaine, etat: 'active', aujourdhui: '2026-11-30', existants: ['2026-12-05'] }), ['2026-12-09', '2026-12-12']), 'un passage déjà créé ne se recrée pas');
ok(S.passagesACreer({ recurrence: { rythme: 'jour', debut: '2026-12-02' }, etat: 'active', aujourdhui: '2026-12-02' }).length === 14, 'chaque jour : 7 j sur 7');
ok(eq(S.passagesACreer({ recurrence: { rythme: 'mois', debut: '2026-01-31' }, etat: 'active', aujourdhui: '2026-02-20' }), ['2026-02-28']), 'chaque mois : un 31 tombe le dernier jour de février, pas en mars');
ok(eq(S.passagesACreer({ recurrence: { rythme: 'mois', debut: '2026-01-15' }, etat: 'active', aujourdhui: '2026-02-01' }), ['2026-02-15']), 'chaque mois : le même quantième');
ok(S.passagesACreer({ recurrence: semaine, etat: 'pause', aujourdhui: '2026-11-30' }).length === 0
  && S.passagesACreer({ recurrence: semaine, etat: 'supprimee', aujourdhui: '2026-11-30' }).length === 0, 'en pause ou supprimée : aucun passage créé');
ok(S.passagesACreer({ recurrence: { rythme: 'jour', debut: '2026-12-02' }, etat: 'active', aujourdhui: '2026-12-02' })[0] === '2026-12-03', 'jamais pour aujourd’hui : à partir de demain');

console.log('C — « je ne peux pas cette fois », jusqu’à 48 h avant');
const H = 3600000, t = Date.parse('2026-12-05T12:00:00Z');
ok(S.declinPossible(t, t - 49 * H) && !S.declinPossible(t, t - 47 * H), '49 h avant : oui ; 47 h avant : non');
ok(!S.declinPossible(0, t), 'sans heure connue : non');

console.log('D — ce qu’un passage reprend, et ce qu’il ne reprend jamais');
const parent = { clientUid: 'c', total: 112, totalConsenti: 112, acts: [{ id: 'a' }], providerUid: 'u', providerName: 'Karla', providerSiret: '123',
  molliePaymentId: 'tr_x', molliePaymentAmount: 112, mollieCaptured: true, commissionSettled: true, saleInvoiceNo: 'F1', status: 'paid', messages: [{}], rating: 5, recurrence: { rythme: 'jour' }, serieEtat: 'active' };
const p = S.passageDepuis(parent, '2026-12-05', 'R1');
ok(p.total === 112 && p.totalConsenti === 112 && p.providerSiret === '123' && eq(p.acts, [{ id: 'a' }]), 'le prix, le consentement, la prestation et l’identité du prestataire');
ok(['molliePaymentId', 'molliePaymentAmount', 'mollieCaptured', 'commissionSettled', 'saleInvoiceNo', 'messages', 'rating', 'recurrence', 'serieEtat'].every((k) => !(k in p)),
  'jamais un paiement, un règlement, une facture, la discussion, la note ni la série elle-même');
ok(p.status === 'accepted' && p.serieId === 'R1' && p.directed === true && p.preferredProviderUid === 'u' && p.dateISO === '2026-12-05', 'acceptée par son prestataire, rattachée à sa série');
ok(S.idPassage('R1', '2026-12-05') === 'R1-2026-12-05', 'un identifiant par jour : deux passages du même jour sont impossibles');
console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
process.exit(f ? 1 : 0);
