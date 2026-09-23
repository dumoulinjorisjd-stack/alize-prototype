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
ok(/async function sendMail\(db, to, message\) \{\n[\s\S]{0,240}?\n  message = tiCharteMessage\(message, pro\);/.test(fn),
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


/* ============================================================================
   D — LE CODE COULEUR : CORAIL AU CLIENT, SARCELLE AU PRESTATAIRE.

   Relevé sur trois captures le 23/09/2026 : la bienvenue CLIENT arrivait en corail,
   la bienvenue PRESTATAIRE en sarcelle — les deux justes — mais « Attestation
   validée », envoyée à une PRESTATAIRE, arrivait en corail. La cause n'était dans
   aucun de ces e-mails : l'enveloppe COMMUNE (`tiCharteHtml`), qui habille tout ce
   qui n'a pas de gabarit à soi, portait le corail EN DUR. Et l'invitation, elle,
   mélangeait les deux : bandeau sarcelle, logotype corail, dans le même message.

   On MESURE donc le rendu, pas la source : le bandeau dégradé, le logotype, et le
   nombre d'hexadécimaux de l'AUTRE monde. La seule exception est voulue et se
   compte — la bienvenue porte un encart vers l'autre monde, dans l'accent de
   l'autre monde. ========================================================== */
console.log('D — corail au client, sarcelle au prestataire');

const decoupe = (a, b) => fn.slice(fn.indexOf(a), fn.indexOf(b));
const srcPalette = decoupe('const MAIL_COULEURS = {', 'function tiCharteHtml(');
const srcGabarits = decoupe('function welcomeFeatureRow(', 'exports.sendResetEmail');
const fabG = new Function('require', '__dirname',
  'const APP_URL = \'https://ti-services.fr\';\n' + esc + '\n' + srcPalette + '\n' + srcGabarits +
  '\nreturn {MAIL_COULEURS, mailPalette, welcomeHtml, inviteArtisanHtml, mollieReminderHtml,' +
  ' approvedArtisanHtml, resetPasswordEmail};');
const G = fabG(bac.require, bac.__dirname);
const CLIENT = G.MAIL_COULEURS.client, PRO = G.MAIL_COULEURS.pro;

const compte = (html, h) => (html.split(h).length - 1);
// Trois repères, mesurés sur le RENDU : le bandeau de 6 px, le logotype « Ti », et
// ce qui reste de l'autre palette.
function charte(nom, html, pro, croisesAttendus) {
  const A = pro ? PRO : CLIENT; const B = pro ? CLIENT : PRO;
  ok(html.indexOf('linear-gradient(90deg,' + A.c1 + ',' + A.c2 + ')') >= 0,
    nom + ' : le bandeau est ' + (pro ? 'sarcelle' : 'corail'));
  ok(html.indexOf('<span style="color:' + A.c1 + '">Ti</span>') >= 0,
    nom + ' : le logotype « Ti » est dans la MÊME couleur que le bandeau');
  const croises = compte(html, B.c1) + compte(html, B.c2);
  ok(croises === croisesAttendus,
    nom + ' : ' + croises + ' trace(s) de l\'autre palette, ' + croisesAttendus + ' attendue(s)');
}

// La bienvenue : les deux mondes, et son encart croisé (UN accent de l'autre monde).
charte('bienvenue client', G.welcomeHtml('Aurore', 'client'), false, 1);
charte('bienvenue prestataire', G.welcomeHtml('Émilie', 'artisan'), true, 1);
// Les quatre gabarits qui ne parlent QU'À un prestataire.
charte('invitation', G.inviteArtisanHtml('Émilie', ''), true, 0);
charte('relance Mollie (pièce)', G.mollieReminderHtml('Émilie', 1, 'piece'), true, 0);
charte('relance Mollie (paiements)', G.mollieReminderHtml('Émilie', 3, 'paiements'), true, 0);
charte('profil validé', G.approvedArtisanHtml('Émilie'), true, 0);
// Le mot de passe part des DEUX côtés : c'est le destinataire qui décide.
charte('mot de passe (client)', G.resetPasswordEmail('https://x/y', 'fr', false).html, false, 0);
charte('mot de passe (prestataire)', G.resetPasswordEmail('https://x/y', 'fr', true).html, true, 0);
// Et l'enveloppe commune, celle qui habille tout le reste.
charte('enveloppe commune (client)', tiCharteHtml('<p>Bonjour.</p>', null, false), false, 0);
charte('enveloppe commune (prestataire)', tiCharteHtml('<p>Bonjour.</p>', null, true), true, 0);

/* LA COULEUR SE LIT À UN SEUL ENDROIT. Six gabarits recopiaient leurs hexadécimaux :
   c'est ainsi qu'un bandeau et un logotype ont fini de deux couleurs différentes. */
const hexs = (fn.match(/#FF6A5B|#FF9F54|#0FA896|#14C2A8/g) || []).length;
ok(hexs === 4, 'les quatre couleurs de marque ne sont écrites qu\'une fois, dans MAIL_COULEURS (' + hexs + ')');

/* QUI EST LE DESTINATAIRE ? On le DEMANDE à la base, on ne le fait pas déclarer par
   les vingt appels — le vingt-et-unième oublierait. Éprouvé sur une fausse base. */
const srcPro = decoupe('const _proParMail = new Map();', 'async function sendMail');
const { _destinataireEstPro, _proParMail } = new Function(
  srcPro + '\nreturn {_destinataireEstPro, _proParMail};')();
const baseAvec = (vide) => ({collection: () => ({where: () => ({limit: () => ({
  get: async () => ({empty: vide}) })})})});
const basePanne = {collection: () => { throw new Error('réseau'); }};
(async () => {
  ok((await _destinataireEstPro(baseAvec(false), 'Emilie@Dugard.fr')) === true,
    'une adresse qui porte une fiche prestataire est reconnue (casse et espaces ignorés)');
  ok((await _destinataireEstPro(baseAvec(true), 'client@exemple.fr')) === false,
    'une adresse sans fiche prestataire est un client');
  _proParMail.clear();
  ok((await _destinataireEstPro(basePanne, 'panne@exemple.fr')) === false,
    'et en cas de panne on retombe sur le corail, c\'est-à-dire sur ce qui se faisait avant');
  // Un appelant qui SAIT peut le dire : l'invitation part chez quelqu'un qui n'a pas
  // encore de fiche, aucune lecture ne le trouverait.
  ok(/html: inviteArtisanHtml\(name, message\),[\s\S]{0,260}?pro: true,/.test(fn),
    'l\'invitation déclare `pro: true` — la lecture ne trouverait pas une fiche qui n\'existe pas');
  ok(/const pro = \(message && typeof message\.pro === 'boolean'\)\n\s*\? message\.pro : await _destinataireEstPro\(db, to\);/.test(fn),
    'sendMail préfère ce que l\'appelant déclare, et demande à la base sinon');
  ok(/delete m\.cta; delete m\.pro;/.test(fn),
    '`pro` a servi à l\'habillage : il ne part pas dans le document mis en file');

  process.exitCode = f ? 1 : 0;
  console.log(f ? ('\n' + f + ' ÉCHEC(S)') : '\nTOUT EST VERT');
})();

