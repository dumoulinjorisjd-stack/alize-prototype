/* LA CHARTE SUR TOUS LES E-MAILS, SANS EXCEPTION.
   Vu en production (captures) : « Attestation validée », « Métier validé 🎉 »…
   partaient en texte nu — trois <p> sans logo, sans bandeau, sans pied C.C.S. —
   pendant que la bienvenue arrivait, elle, joliment habillée. Règle : AUCUN
   message ne part sans la charte. Le branchement est fait DANS sendMail
   (tiCharteMessage) pour couvrir aussi tous les e-mails écrits plus tard. */
const fs = require('fs');
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
let f = 0;
const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };
const fn = fs.readFileSync(path.join(RACINE, 'functions', 'index.js'), 'utf8');

console.log('A — le branchement est bien central (sendMail), pas au cas par cas');
ok(/async function sendMail\(db, to, message\) \{\n  message = tiCharteMessage\(message\);/.test(fn),
  'sendMail passe TOUT message par tiCharteMessage avant envoi ou mise en file');

console.log('B — l’enveloppe elle-même (exécutée pour de vrai)');
// On extrait les trois fonctions du source et on les évalue hors Firebase :
// elles ne dépendent que de fs/path (logo) et de chaînes.
const bloc = fn.slice(fn.indexOf('let _tiLogoBuf;'), fn.indexOf('async function sendMail'));
const bac = {require: (m) => require(m), __dirname: path.join(RACINE, 'functions')};
const fab = new Function('require', '__dirname', bloc +
  '\nreturn {tiCharteHtml, tiCharteMessage, tiLogoAttachment};');
const {tiCharteHtml, tiCharteMessage, tiLogoAttachment} = fab(bac.require, bac.__dirname);

const brut = '<p>Bonjour Aurore,</p><p>Votre attestation d\'assurance est validée. Rien d\'autre à faire.</p><p>L\'équipe Ti-Services</p>';
const enveloppe = tiCharteHtml(brut);
ok(enveloppe.indexOf('cid:tilogo') >= 0, 'le logo est dans l’en-tête');
ok(enveloppe.indexOf('Ti</span><span style="color:#231E33">-Services') >= 0, 'le nom Ti-Services est composé');
ok(enveloppe.indexOf('Services à la demande · Saint-Barthélemy') >= 0, 'le sous-titre de la marque est là');
ok(enveloppe.indexOf('C.C.S — Construction Conseils et Services') >= 0, 'le pied C.C.S est là');
ok(enveloppe.indexOf('Votre attestation d\'assurance est validée') >= 0, 'le corps du message est conservé');
ok((enveloppe.match(/L'équipe Ti-Services/g) || []).length === 1,
  'la signature n’apparaît qu’UNE fois (celle du corps brut est retirée, le pied signe)');

console.log('C — tiCharteMessage : qui est enveloppé, qui ne l’est pas');
const nu = tiCharteMessage({subject: 's', html: brut});
ok(nu.html.indexOf('linear-gradient(90deg,#FF6A5B,#FF9F54)') >= 0, 'un message nu reçoit le bandeau dégradé');
ok((nu.attachments || []).some((a) => a && a.cid === 'tilogo'), 'et le logo en pièce jointe');
const deja = '<div>gabarit maison <img src="cid:tilogo"> déjà charté</div>';
const passe = tiCharteMessage({subject: 's', html: deja});
ok(passe.html === deja, 'un gabarit déjà charté (cid:tilogo) n’est PAS ré-enveloppé');
ok((passe.attachments || []).some((a) => a && a.cid === 'tilogo'),
  'mais on lui joint le logo s’il l’avait oublié (image cassée sinon)');
const double = tiCharteMessage({subject: 's', html: deja, attachments: [{cid: 'tilogo', filename: 'x.png', content: 'x'}]});
ok((double.attachments || []).filter((a) => a && a.cid === 'tilogo').length === 1, 'jamais deux logos');
ok(tiLogoAttachment() !== null, 'le fichier mail-logo.png est bien présent à côté des functions');
const sig2 = tiCharteHtml('<p>Corps.</p><p>À très vite,<br>L\'équipe Ti-Services</p>');
ok((sig2.match(/L'équipe Ti-Services/g) || []).length === 1, 'la variante « À très vite, » est aussi dédoublonnée');

process.exitCode = f ? 1 : 0;
console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
