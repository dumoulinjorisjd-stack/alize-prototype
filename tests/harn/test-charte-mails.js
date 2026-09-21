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
// L'enveloppe échappe ce qu'on lui confie : on lui donne le VRAI `escHtmlS`, pris dans
// la même source, sinon l'épreuve mesurerait une imitation.
const esc = /function escHtmlS\(s\) \{[^\n]*\}/.exec(fn)[0];
const fab = new Function('require', '__dirname',
  'const APP_URL = \'https://ti-services.fr\';\n' + esc + '\n' + bloc +
  '\nreturn {tiCharteHtml, tiCharteMessage, tiLogoAttachment, corpsPorteUnBouton};');
const {tiCharteHtml, tiCharteMessage, tiLogoAttachment, corpsPorteUnBouton} = fab(bac.require, bac.__dirname);

const brut = '<p>Bonjour Aurore,</p><p>Votre attestation d\'assurance est validée. Rien d\'autre à faire.</p><p>L\'équipe Ti-Services</p>';
const enveloppe = tiCharteHtml(brut);
ok(enveloppe.indexOf('cid:tilogo') >= 0, 'le logo est dans l’en-tête');
ok(enveloppe.indexOf('Ti</span><span style="color:#231E33">-Services') >= 0, 'le nom Ti-Services est composé');
ok(enveloppe.indexOf('Services à la demande · Saint-Barthélemy') >= 0, 'le sous-titre de la marque est là');
ok(enveloppe.indexOf('C.C.S, Construction Conseils et Services') >= 0, 'le pied C.C.S est là');
ok(enveloppe.indexOf('Votre attestation d\'assurance est validée') >= 0, 'le corps du message est conservé');
ok((enveloppe.match(/L'équipe Ti-Services/g) || []).length === 1,
  'la signature n’apparaît qu’UNE fois (celle du corps brut est retirée, le pied signe)');
ok(/href="https:\/\/ti-services\.fr"[^>]*>Ouvrir Ti-Services<\/a>/.test(enveloppe),
  'le bouton « Ouvrir Ti-Services » est là (chaque e-mail ramène vers l’app)');

/* B1 — UN SEUL BOUTON, ET IL MÈNE OÙ LE CORPS LE DIT.

   Vu en production le 21/09/2026 : « Un document pour être payé » arrivait avec DEUX
   « Ouvrir Ti-Services », de deux oranges différents, menant à deux endroits différents.
   La cause n'était pas cet e-mail : l'enveloppe posait son bouton SANS CONDITION, donc
   tout corps qui dessine le sien en obtient deux. Le corps déclare maintenant sa
   destination, l'enveloppe la dessine une fois. */
const boutons = (html) => (html.match(/<a\b[^>]*style="[^"]*display:\s*inline-block/gi) || []).length;
ok(boutons(enveloppe) === 1, 'un corps ordinaire reçoit UN bouton (' + boutons(enveloppe) + ')');

const avecCta = tiCharteHtml('<p>Une demande vient d’être publiée.</p>',
  {label: 'Ouvrir mes missions', url: 'https://ti-services.fr/?open=missions'});
ok(boutons(avecCta) === 1 && /href="https:\/\/ti-services\.fr\/\?open=missions"[^>]*>Ouvrir mes missions<\/a>/.test(avecCta),
  'un corps qui DÉCLARE sa destination reçoit un seul bouton, qui y mène');

const dejaBouton = tiCharteHtml('<p>Bonjour,</p><p><a href="https://ti-services.fr/?open=missions" '
  + 'style="display:inline-block;background:#e8613c;color:#fff;padding:12px 20px">Ouvrir Ti-Services</a></p>');
ok(boutons(dejaBouton) === 1,
  'et un corps qui dessine QUAND MÊME son bouton n’en reçoit pas un second — le défaut mesuré (' + boutons(dejaBouton) + ')');

// UN LIEN DANS UNE PHRASE N'EST PAS UN BOUTON : « le détail est sur ti-services.fr » ne
// se voit pas comme une action, et l'e-mail garderait le sien pour rien.
const lienNu = tiCharteHtml('<p>Le détail est dans votre espace sur <a href="https://ti-services.fr">ti-services.fr</a>.</p>');
ok(boutons(lienNu) === 1 && !corpsPorteUnBouton('<a href="x">ti-services.fr</a>'),
  'un lien ordinaire au fil du texte ne prive pas l’e-mail de son bouton');

// ET LES DEUX E-MAILS EN CAUSE ONT CESSÉ DE DESSINER LE LEUR.
ok(/cta: \{label: 'Ouvrir Ti-Services', url: link\}/.test(fn) && !/background:#e8613c/.test(fn),
  '« un document pour être payé » déclare sa destination au lieu de peindre un second bouton');
ok(/cta: \{label: 'Ouvrir mes missions', url: lien\}/.test(fn) && !/>Ouvrir mes missions<\/a>/.test(fn),
  'et « nouvelle demande » aussi — son lien nu devient LE bouton de l’e-mail');

console.log('B2 — les verdicts artisan ont un corps e-mail étoffé, distinct du push');
ok(/mail: 'Bonne nouvelle : votre nouveau métier \(<b>'/.test(fn),
  'métier validé : version e-mail enrichie (le push garde sa phrase courte)');
ok(/mail: 'Bonne nouvelle : votre attestation d\\'assurance a été vérifiée/.test(fn),
  'attestation validée : version e-mail enrichie');
ok(/n\.mail \|\| escHtmlS\(n\.corps\)/.test(fn),
  'l’e-mail préfère la version étoffée et retombe sur le texte du push sinon');
ok(/escHtmlS\(valides\.join\(', '\)\)/.test(fn) && /escHtmlS\(refuses\.join\(', '\)\)/.test(fn),
  'les noms de métiers sont échappés dans les corps e-mail');

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
