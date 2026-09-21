#!/usr/bin/env node
/* GÉNÉRATEUR DES PAGES DE SERVICE — `node outils/pages-metiers.js`
 *
 * POURQUOI. L'application n'avait qu'UNE adresse indexable pour vingt-et-un métiers.
 * Quelqu'un qui cherche « femme de ménage Saint-Barth » ou « baby-sitter Saint-Barthélemy »
 * tombait sur une page qui parle de tout : un moteur n'a aucune raison de la classer devant
 * une page qui ne parle que de ménage, et un assistant qui cite ses sources n'a rien de
 * précis à citer. Une page par métier, c'est une réponse par question.
 *
 * UNE SEULE SOURCE. Les noms des métiers sont LUS dans `index.html` (SERVICES) : un
 * métier renommé dans la console ne peut pas laisser une page publique mentir. Ce qui est
 * ÉCRIT ici, c'est la prose — ce qu'aucune donnée ne peut dire.
 *
 * AUCUN PRIX, AUCUN QUARTIER (21/09/2026, décision de l'éditeur). Ces pages portaient la
 * grille tarifaire et la liste des dix-huit quartiers. Les deux sont parties.
 *   - LE PRIX ne se publie pas hors de l'application. Un tarif affiché sur une page
 *     indexée est une promesse faite à quelqu'un qu'on ne connaît pas, qui reste dans le
 *     cache d'un moteur et dans la mémoire d'un assistant longtemps après avoir changé ;
 *     et la concurrence le lit aussi bien que le client. Le prix s'annonce là où il
 *     ENGAGE : dans l'application, avant la commande. C'est d'ailleurs ce que dit la page.
 *   - LES QUARTIERS n'apprenaient rien : Ti-Services couvre toute l'île, et énumérer
 *     dix-huit noms pour dire « partout » est du remplissage, exactement ce qu'un moteur
 *     a appris à reconnaître. L'aire desservie reste déclarée UNE fois, à la machine
 *     (`areaServed`), où elle sert à quelque chose.
 * La contrepartie est assumée : on renonce aux recherches qui nomment un quartier
 * (« plombier Gustavia ») et à l'affichage d'un prix dans un résultat de recherche.
 *
 * CE QU'ON N'ÉCRIT PAS. Aucune promesse qui n'existe pas dans l'application : pas de
 * « disponible 24/7 », pas de « intervention en 30 minutes », pas d'avis inventés, pas de
 * note moyenne. Une page de référencement qui promet ce que le service ne tient pas se
 * paie au premier client déçu, et Google finit par le voir aussi.
 *
 * DEUX LANGUES. Le français et l'anglais : l'île vit avec une clientèle anglophone toute
 * l'année. Chaque page déclare son équivalente (`hreflang`), dans les deux sens.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SITE = 'https://ti-services.fr';
const SRC = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');

/* --- Lecture des données de l'application (compteur de délimiteurs, pas de regex
   fragile : une accolade dans une chaîne ne doit pas fermer le bloc). --- */
function litLitteral(nom, ouvre, ferme) {
  const i = SRC.indexOf(nom);
  if (i < 0) throw new Error('Introuvable dans index.html : ' + nom);
  const j = i + nom.length;
  let d = 0, k = j;
  for (; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === ouvre) d++;
    else if (c === ferme) { d--; if (!d) break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function('return ' + SRC.slice(j, k + 1))();
}
const SERVICES = litLitteral('const SERVICES=', '[', ']');
/* L'ICÔNE ET LA COULEUR DE CHAQUE MÉTIER, telles que le client les voit dans
   l'application. Les recopier ici en ferait une seconde vérité : un métier repeint dans
   la console laisserait la page publique sur l'ancienne teinte. */
const I = litLitteral('const I =', '{', '}');
const SVC_COLORS = litLitteral('const SVC_COLORS=', '{', '}');

/* ZOUTI, la mascotte — le VISAGE de la marque, et ce qu'on voit en premier sur l'accueil.
   `icon.svg` conviendrait, mais c'est l'icône d'application : un fond arrondi avec la
   pieuvre au tiers de sa boîte, donc un logo qui paraît deux fois plus petit qu'il n'est.
   On prend donc le DESSIN, à la source, dans `index.html` — un trait corrigé là-bas
   n'aura pas à l'être ici, et une seconde copie aurait fini par diverger. Rien à
   télécharger : c'est du SVG en ligne. */
function zouti() {
  const i = SRC.indexOf('function octoMini(');
  const j = SRC.indexOf('<g transform="translate(60 63)', i);
  const k = SRC.indexOf('</svg>', j);
  if (i < 0 || j < 0 || k < 0) throw new Error('Mascotte introuvable dans index.html');
  const corps = SRC.slice(j, k).trim();
  // Une interpolation qui passerait ici s'imprimerait telle quelle sur la page.
  if (corps.indexOf('${') >= 0) throw new Error('La mascotte porte une interpolation');
  return corps;
}
const ZOUTI = zouti();

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* --- LA PROSE. Une page qui ne dirait que le nom du métier serait une page vide de plus :
   ce qui la fait classer, et ce qui la rend utile à lire, c'est ce paragraphe-là. Écrit
   métier par métier, en français et en anglais. --- */
const M = {
  menage: {
    fr: { h1: 'Ménage à domicile à Saint-Barthélemy',
      intro: 'Entretien courant d’une villa, d’un appartement ou d’un studio, avec du personnel vérifié et assuré. Vous décrivez ce qu’il y a à faire, vous choisissez le créneau, et la personne qui vient est un professionnel déclaré, pas un contact de passage.',
      inclus: ['Sols, cuisine, salles de bain, poussières et vitres accessibles', 'Change du linge de lit et de bain si vous le demandez', 'Produits fournis par le prestataire, sauf mention contraire'],
      faq: [['Faut-il être présent pendant la prestation ?', 'Non. Beaucoup de clients laissent un code de portail ou une clé, et suivent la prestation depuis l’application.'],
            ['Est-ce possible entre deux locations ?', 'Oui, c’est l’un des usages les plus fréquents sur l’île : remise en état après départ et avant l’arrivée suivante.'],
            ['Puis-je reprendre la même personne ?', 'Oui. Une fois une prestation terminée, la personne apparaît dans vos choix pour la prochaine commande.']] },
    en: { h1: 'Home cleaning in St Barths',
      intro: 'Regular cleaning for a villa, an apartment or a studio, with vetted and insured staff. You describe the work, you pick the time slot, and the person who shows up is a registered professional, not a passing contact.',
      inclus: ['Floors, kitchen, bathrooms, dusting and reachable windows', 'Bed and bath linen change on request', 'Products supplied by the provider unless stated otherwise'],
      faq: [['Do I have to be there?', 'No. Many clients leave a gate code or a key and follow the job from the app.'],
            ['Can you clean between two rentals?', 'Yes, it is one of the most common jobs on the island: turnaround between a departure and the next arrival.'],
            ['Can I book the same person again?', 'Yes. Once a job is done, that person appears in your choices for the next booking.']] } },
  baby: {
    fr: { h1: 'Baby-sitting et garde d’enfants à Saint-Barthélemy',
      intro: 'Garde ponctuelle ou régulière, à la villa, à l’hôtel ou pour une soirée. Chaque intervenant présente ses diplômes de garde d’enfants, et vous choisissez précisément la personne dès la première réservation.',
      inclus: ['Garde au domicile, repas et coucher selon vos consignes', 'Diplômes (BAFA, petite enfance, secourisme) vérifiés à l’inscription', 'Personne choisie par vous, pas attribuée au hasard'],
      faq: [['Puis-je choisir la baby-sitter ?', 'Oui. Pour la garde d’enfants, vous voyez les personnes disponibles et vous en désignez une : la demande ne part qu’à elle.'],
            ['À partir de quel âge ?', 'C’est vous et la baby-sitter qui en convenez avant d’accepter : l’âge des enfants et les consignes sont dans la demande.'],
            ['Et pour une soirée tardive ?', 'Indiquez l’horaire de fin dans la demande : la personne accepte en connaissance de cause.']] },
    en: { h1: 'Babysitting and childcare in St Barths',
      intro: 'One-off or regular childcare, at your villa, at your hotel or for an evening out. Every sitter files their childcare qualifications, and you pick the person yourself from the very first booking.',
      inclus: ['Care at your place, meals and bedtime as you instruct', 'Qualifications (childcare, first aid) checked at sign-up', 'You choose the person, no random assignment'],
      faq: [['Can I choose the sitter?', 'Yes. For childcare you see who is available and pick one: the request goes to that person only.'],
            ['From what age?', 'You and the sitter agree before she accepts: the children’s ages and your instructions are in the request.'],
            ['What about a late evening?', 'Put the end time in the request, so the sitter accepts knowing exactly what she takes on.']] } },
  jardin: {
    fr: { h1: 'Jardinage et entretien d’extérieur à Saint-Barthélemy',
      titre: 'Jardinage à Saint-Barthélemy',
      intro: 'Tonte, taille de haies, débroussaillage, ramassage et évacuation des déchets verts. Le climat de l’île fait repousser vite : la plupart des clients prennent un passage régulier plutôt qu’une remise en état deux fois par an.',
      inclus: ['Tonte et finitions, taille des haies et des massifs', 'Ramassage des déchets verts', 'Matériel apporté par le prestataire'],
      faq: [['Les déchets verts sont-ils évacués ?', 'Convenez-en dans la demande : le ramassage est courant, l’évacuation en déchetterie se précise avant l’acceptation.'],
            ['Un passage régulier est-il possible ?', 'Oui, l’application gère les prestations récurrentes : même jour, même créneau, sans re-commander à chaque fois.'],
            ['Faut-il être là ?', 'Non, si l’accès au terrain est possible. Laissez les consignes d’accès dans la demande.']] },
    en: { h1: 'Gardening and grounds care in St Barths',
      intro: 'Mowing, hedge trimming, clearing and green waste collection. Things grow fast here: most clients book a regular visit rather than a full clean-up twice a year.',
      inclus: ['Mowing and edging, hedges and beds', 'Green waste collected', 'Tools brought by the provider'],
      faq: [['Is green waste taken away?', 'Agree it in the request: collection is standard, a tip run is confirmed before the provider accepts.'],
            ['Can I book a regular visit?', 'Yes, the app handles recurring jobs: same day, same slot, without ordering again each time.'],
            ['Do I need to be home?', 'No, as long as the grounds are accessible. Leave access instructions in the request.']] } },
  demenagement: {
    fr: { h1: 'Déménagement et transport à Saint-Barthélemy',
      intro: 'Aide au déménagement, transport de meubles, débarras, entre deux quartiers de l’île ou à l’intérieur d’une même villa. Le volume et l’étage se précisent dans la demande : le prestataire accepte en connaissance de cause.',
      inclus: ['Manutention, portage et chargement', 'Véhicule selon le forfait retenu', 'Protection des meubles à convenir avec le prestataire'],
      faq: [['Le camion est-il compris ?', 'Cela dépend du forfait choisi : l’application détaille ce qui inclut un véhicule et ce qui ne l’inclut pas.'],
            ['Combien de personnes ?', 'Indiquez le volume et l’étage : c’est ce qui permet au prestataire de venir accompagné si nécessaire.'],
            ['Et pour un simple transport ?', 'Un transport de meuble unique se commande comme le reste, au forfait.']] },
    en: { h1: 'Moving and transport in St Barths',
      intro: 'Moving help, furniture transport and clearance, between two parts of the island or inside the same villa. Volume and floor go in the request, so the provider accepts knowing what the job is.',
      inclus: ['Handling, carrying and loading', 'Vehicle depending on the package', 'Furniture protection to agree with the provider'],
      faq: [['Is a van included?', 'It depends on the package: the app states which ones include a vehicle.'],
            ['How many people come?', 'State the volume and the floor: that is what lets the provider bring help if needed.'],
            ['What about a single item?', 'A one-off furniture transport is booked like anything else, at a flat price.']] } },
  coiffure: {
    fr: { h1: 'Coiffure à domicile à Saint-Barthélemy',
      intro: 'Coupe, couleur, brushing, barbe : un coiffeur professionnel se déplace chez vous, à la villa ou à l’hôtel. Vous choisissez la personne et les prestations exactes, au prix affiché, sans surprise à la fin.',
      inclus: ['Déplacement et matériel du coiffeur', 'Prestations à l’acte, cochées avant de commander', 'Choix du coiffeur dès la première réservation'],
      faq: [['Puis-je choisir mon coiffeur ?', 'Oui : pour la coiffure vous voyez les professionnels disponibles et vous désignez le vôtre.'],
            ['Peut-on venir chez le coiffeur ?', 'Certains professionnels reçoivent dans leur salon : choisissez le lieu au moment de la commande.'],
            ['Les produits sont-ils fournis ?', 'Oui, le coiffeur vient avec son matériel et ses produits.']] },
    en: { h1: 'Mobile hairdresser in St Barths',
      intro: 'Cut, colour, blow-dry, beard: a professional hairdresser comes to you, at your villa or your hotel. You pick the person and the exact services, at the listed price, with no surprise at the end.',
      inclus: ['Travel and the hairdresser’s own kit', 'Per-service pricing, ticked before you book', 'You choose your hairdresser from the first booking'],
      faq: [['Can I choose my hairdresser?', 'Yes: for hairdressing you see who is available and pick yours.'],
            ['Can I go to the salon instead?', 'Some professionals welcome clients at their own place: choose the location when booking.'],
            ['Are products included?', 'Yes, the hairdresser brings their kit and products.']] } },
  animaux: {
    fr: { h1: 'Garde d’animaux à Saint-Barthélemy',
      intro: 'Garde de chien ou de chat, promenades, visites à domicile pendant votre absence. Vous désignez la personne, vous convenez du rythme des visites, et vous suivez la prestation depuis l’application.',
      inclus: ['Visites à domicile, nourriture et eau, litière', 'Promenades selon ce qui est convenu', 'Garde à la journée possible'],
      faq: [['Puis-je choisir la personne ?', 'Oui : pour la garde d’animaux, la personne se choisit dès la première demande.'],
            ['Combien de visites par jour ?', 'C’est vous qui le dites dans la demande ; le tarif à la journée existe aussi.'],
            ['Et si mon animal a un traitement ?', 'Précisez-le dans la demande : la personne accepte en le sachant.']] },
    en: { h1: 'Pet sitting in St Barths',
      intro: 'Dog and cat sitting, walks and home visits while you are away. You pick the person, you agree how often they come, and you follow the job from the app.',
      inclus: ['Home visits, food and water, litter', 'Walks as agreed', 'Day-rate care available'],
      faq: [['Can I choose the sitter?', 'Yes: for pet sitting, the person is chosen from the first request.'],
            ['How many visits a day?', 'You say so in the request; a day rate is available too.'],
            ['What if my pet is on medication?', 'Say so in the request: the sitter accepts knowing it.']] } },
  massage: {
    fr: { h1: 'Massage à domicile à Saint-Barthélemy',
      intro: 'Massage relaxant, sportif ou californien, chez vous, avec table fournie. Le praticien se déplace à la villa ou à l’hôtel ; vous choisissez la personne, la durée et le nombre de participants.',
      inclus: ['Table de massage et huiles apportées', 'Durée choisie à la commande', 'Plusieurs personnes possibles sur le même créneau'],
      faq: [['La table est-elle fournie ?', 'Oui, sauf mention contraire du praticien dans sa fiche.'],
            ['À deux ?', 'Le prix est par personne : indiquez le nombre de participants, le montant suit.'],
            ['Puis-je choisir le praticien ?', 'Oui, dès la première réservation.']] },
    en: { h1: 'Massage at home in St Barths',
      intro: 'Relaxing, sports or Californian massage at your place, table included. The therapist comes to your villa or hotel; you choose the person, the length and how many of you there are.',
      inclus: ['Massage table and oils brought along', 'Length chosen when booking', 'Several people on the same slot'],
      faq: [['Is the table provided?', 'Yes, unless the therapist states otherwise on their profile.'],
            ['For two?', 'The price is per person: state how many, the amount follows.'],
            ['Can I choose the therapist?', 'Yes, from the first booking.']] } },
  manucure: {
    fr: { h1: 'Manucure et beauté des ongles à Saint-Barthélemy',
      intro: 'Manucure, pédicure, semi-permanent, pose et dépose, à domicile. Les prestations se cochent une par une avant de commander : le montant affiché est celui que vous payez.',
      inclus: ['Matériel et vernis apportés par la prestataire', 'Prestations à l’acte, prix fermes', 'Choix de la prestataire dès la première fois'],
      faq: [['Semi-permanent ou vernis classique ?', 'Les deux figurent dans l’application : cochez ce que vous voulez avant de commander.'],
            ['La dépose est-elle comprise ?', 'Elle figure comme une prestation distincte dans l’application.'],
            ['À plusieurs ?', 'Ajoutez les prestations de chacun à la même commande.']] },
    en: { h1: 'Mobile manicure and nails in St Barths',
      intro: 'Manicure, pedicure, gel polish, application and removal, at home. You tick each service before booking: the amount shown is the amount you pay.',
      inclus: ['Kit and polish brought by the technician', 'Per-service pricing, firm', 'You pick your technician from the first booking'],
      faq: [['Gel or regular polish?', 'Both are listed in the app: tick what you want before booking.'],
            ['Is removal included?', 'It appears as its own service in the app.'],
            ['For several people?', 'Add everyone’s services to the same booking.']] } },
  epilation: {
    fr: { h1: 'Épilation à domicile à Saint-Barthélemy',
      intro: 'Épilation à la cire, jambes, maillot, aisselles, visage, chez vous. Les zones se choisissent à l’acte, et la professionnelle vient avec son matériel.',
      inclus: ['Cire et matériel apportés', 'Zones choisies une par une', 'Professionnelle choisie par vous'],
      faq: [['Quelle cire ?', 'Chaque professionnelle le précise sur sa fiche ; vous pouvez le demander dans la conversation avant la prestation.'],
            ['Combien de temps ?', 'La durée dépend des zones cochées ; elle est indiquée avant de commander.'],
            ['À domicile ou en institut ?', 'À domicile, ou chez la professionnelle si elle reçoit.']] },
    en: { h1: 'Waxing at home in St Barths',
      intro: 'Waxing at home: legs, bikini, underarms, face. You choose each area, and the professional brings her own kit.',
      inclus: ['Wax and kit brought along', 'Areas chosen one by one', 'You choose the professional'],
      faq: [['Which wax?', 'Each professional states it on her profile; you can ask in the chat before the appointment.'],
            ['How long does it take?', 'It depends on the areas you tick; the length is shown before you book.'],
            ['At home or at a studio?', 'At home, or at her place if she receives clients.']] } },
  epilationdef: {
    fr: { h1: 'Épilation définitive (laser) à Saint-Barthélemy',
      intro: 'Séances d’épilation définitive chez la professionnelle : l’appareil est fixe, la prestation se fait donc dans son institut. Les zones et le nombre de séances se choisissent à l’acte.',
      inclus: ['Séance chez la professionnelle, équipement fixe', 'Zones choisies une par une', 'Prix ferme par séance'],
      faq: [['Pourquoi pas à domicile ?', 'L’appareil ne se déplace pas : c’est la seule prestation du catalogue qui se fait uniquement chez la professionnelle.'],
            ['Combien de séances ?', 'Cela dépend de la zone et de la peau ; la professionnelle vous le dit avant de commencer.'],
            ['L’adresse est-elle donnée ?', 'Elle vous est communiquée une fois la séance acceptée.']] },
    en: { h1: 'Laser hair removal in St Barths',
      intro: 'Laser hair removal sessions at the professional’s studio: the equipment does not travel, so the session happens there. Areas and sessions are chosen one by one.',
      inclus: ['Session at the studio, fixed equipment', 'Areas chosen individually', 'Firm price per session'],
      faq: [['Why not at home?', 'The machine cannot be moved: this is the only service in the catalogue that happens at the professional’s place.'],
            ['How many sessions?', 'It depends on the area and the skin; the professional tells you before starting.'],
            ['Do I get the address?', 'You receive it once the session is accepted.']] } },
  maquillage: {
    fr: { h1: 'Maquillage professionnel à Saint-Barthélemy',
      intro: 'Maquillage mariage, soirée ou séance photo, à domicile. Essai possible, prestations à l’acte, et vous choisissez la maquilleuse dès la première réservation.',
      inclus: ['Produits et matériel apportés', 'Essai proposé en prestation distincte', 'Déplacement à la villa ou à l’hôtel'],
      faq: [['Un essai avant le mariage ?', 'Oui, il figure comme une prestation à part dans l’application.'],
            ['Combien de temps avant l’événement ?', 'Réservez le créneau qui vous arrange : la maquilleuse accepte ou non selon son agenda.'],
            ['Plusieurs personnes ?', 'Ajoutez une prestation par personne à la même commande.']] },
    en: { h1: 'Professional make-up in St Barths',
      intro: 'Wedding, evening or photoshoot make-up, at your place. Trials available, per-service pricing, and you choose the artist from the first booking.',
      inclus: ['Products and kit brought along', 'Trial offered as a separate service', 'Travel to your villa or hotel'],
      faq: [['A trial before the wedding?', 'Yes, it is a separate service in the app.'],
            ['How far ahead should I book?', 'Book the slot that suits you: the artist accepts according to her diary.'],
            ['Several people?', 'Add one service per person to the same booking.']] } },
  piscine: {
    fr: { h1: 'Entretien de piscine à Saint-Barthélemy',
      intro: 'Entretien hebdomadaire ou ponctuel : nettoyage, contrôle du pH, filtration, produits. Sous ce climat, une piscine laissée deux semaines sans passage se rattrape plus cher qu’un entretien régulier.',
      inclus: ['Nettoyage du bassin, ligne d’eau et skimmers', 'Contrôle du pH et du chlore', 'Vérification de la filtration'],
      faq: [['À quelle fréquence ?', 'L’hebdomadaire est le rythme le plus courant sur l’île ; l’application gère les passages récurrents.'],
            ['Les produits sont-ils compris ?', 'Cela dépend de la prestation cochée : l’application le précise.'],
            ['Faut-il être présent ?', 'Non, si l’accès au bassin est possible.']] },
    en: { h1: 'Pool maintenance in St Barths',
      intro: 'Weekly or one-off pool care: cleaning, pH check, filtration, chemicals. In this climate, a pool left alone for two weeks costs more to recover than regular upkeep.',
      inclus: ['Pool, waterline and skimmer cleaning', 'pH and chlorine check', 'Filtration checked'],
      faq: [['How often?', 'Weekly is the usual rhythm here; the app handles recurring visits.'],
            ['Are chemicals included?', 'It depends on the service you tick: the app says so.'],
            ['Do I need to be there?', 'No, as long as the pool is accessible.']] } },
  plomberie: {
    fr: { h1: 'Plombier à Saint-Barthélemy',
      intro: 'Fuite, chasse d’eau, mitigeur, chauffe-eau, évacuation : un plombier déclaré et assuré, au prix affiché. Vous décrivez la panne, la demande part aux professionnels disponibles, le premier qui accepte vient.',
      inclus: ['Diagnostic et intervention', 'Petites fournitures selon la prestation', 'Prix ferme annoncé avant la commande'],
      faq: [['Intervenez-vous en urgence, la nuit ou le dimanche ?', 'Les demandes partent aux professionnels disponibles sur le créneau que vous choisissez : il n’y a pas d’astreinte permanente.'],
            ['Les pièces sont-elles comprises ?', 'L’application précise ce qui est inclus ; le reste se convient dans la conversation.'],
            ['Et si le problème est plus gros que prévu ?', 'Le professionnel vous le dit avant d’aller plus loin : aucun supplément ne s’applique sans votre accord.']] },
    en: { h1: 'Plumber in St Barths',
      intro: 'Leak, toilet, mixer tap, water heater, drainage: a registered and insured plumber at a listed price. You describe the problem, the request goes to available professionals, the first to accept comes.',
      inclus: ['Diagnosis and repair', 'Small parts depending on the service', 'Firm price shown before you book'],
      faq: [['Do you handle emergencies at night or on Sundays?', 'Requests go to professionals available on the slot you choose: there is no permanent on-call service.'],
            ['Are parts included?', 'The app says what is included; anything else is agreed in the chat.'],
            ['What if the job is bigger than expected?', 'The professional tells you before going further: nothing is added without your agreement.']] } },
  electricite: {
    fr: { h1: 'Électricien à Saint-Barthélemy',
      intro: 'Prises, luminaires, tableau, dépannage : un électricien déclaré et assuré. Le prix est annoncé avant la commande, et l’intervention est suivie dans l’application, du départ à la facture.',
      inclus: ['Diagnostic et intervention', 'Petit appareillage selon la prestation', 'Facture émise automatiquement'],
      faq: [['Travaillez-vous sur un tableau complet ?', 'Décrivez le besoin dans la demande : le professionnel accepte s’il est équipé pour.'],
            ['Le matériel est-il fourni ?', 'L’application le précise prestation par prestation.'],
            ['Est-ce assuré ?', 'Chaque professionnel dépose son attestation de responsabilité civile, vérifiée avant validation.']] },
    en: { h1: 'Electrician in St Barths',
      intro: 'Sockets, lights, panels, troubleshooting: a registered and insured electrician. The price is shown before you book, and the job is tracked in the app, from dispatch to invoice.',
      inclus: ['Diagnosis and repair', 'Small fittings depending on the service', 'Invoice issued automatically'],
      faq: [['Do you work on a full panel?', 'Describe the job in the request: the professional accepts if equipped for it.'],
            ['Is hardware included?', 'The app states it service by service.'],
            ['Is the work insured?', 'Every professional files their liability certificate, checked before approval.']] } },
  deck: {
    fr: { h1: 'Deck et terrasse en bois à Saint-Barthélemy',
      intro: 'Ponçage, saturateur, nettoyage, reprise de lames : le bois exposé au sel et au soleil demande un passage régulier. La prestation se choisit à l’acte, au mètre carré ou au forfait.',
      inclus: ['Nettoyage et préparation du bois', 'Application de saturateur ou d’huile', 'Reprise des lames abîmées à convenir'],
      faq: [['À quelle fréquence ?', 'Sous ce climat, une à deux fois par an selon l’exposition.'],
            ['Le produit est-il compris ?', 'L’application le précise ; sinon cela se convient avant l’acceptation.'],
            ['Faut-il vider la terrasse ?', 'Dites ce qu’il y a à déplacer dans la demande : le professionnel en tient compte.']] },
    en: { h1: 'Wooden deck and terrace care in St Barths',
      intro: 'Sanding, oiling, cleaning, board replacement: wood exposed to salt and sun needs regular care. The job is priced per service, per square metre or as a flat rate.',
      inclus: ['Cleaning and preparing the wood', 'Oil or saturator applied', 'Damaged boards replaced as agreed'],
      faq: [['How often?', 'In this climate, once or twice a year depending on exposure.'],
            ['Is the product included?', 'The app says so; otherwise it is agreed before acceptance.'],
            ['Should I clear the terrace?', 'Say what needs moving in the request: the professional plans for it.']] } },
  clim: {
    fr: { h1: 'Climatisation à Saint-Barthélemy',
      intro: 'Entretien, nettoyage des filtres, contrôle du gaz, dépannage. Sur l’île, une clim mal entretenue consomme plus, refroidit moins et finit par lâcher au pire moment.',
      inclus: ['Nettoyage des filtres et de l’unité', 'Contrôle du niveau de gaz', 'Diagnostic de panne'],
      faq: [['Combien d’unités ?', 'Indiquez-le dans la demande : le prix suit le nombre d’unités.'],
            ['Faites-vous la recharge de gaz ?', 'Cela dépend du professionnel et du matériel : l’application et la conversation le précisent.'],
            ['À quelle fréquence entretenir ?', 'Un passage annuel est le minimum courant sous ce climat.']] },
    en: { h1: 'Air conditioning in St Barths',
      intro: 'Servicing, filter cleaning, gas check, troubleshooting. Here, a neglected unit uses more power, cools less and gives up at the worst moment.',
      inclus: ['Filter and unit cleaning', 'Gas level check', 'Fault diagnosis'],
      faq: [['How many units?', 'State it in the request: the price follows the number of units.'],
            ['Do you refill gas?', 'It depends on the professional and the equipment: the app and the chat say so.'],
            ['How often should it be serviced?', 'Once a year is the usual minimum in this climate.']] } },
  coach: {
    fr: { h1: 'Coach sportif à domicile à Saint-Barthélemy',
      intro: 'Séances individuelles ou à deux, chez vous, sur la plage ou chez le coach. Remise en forme, renforcement, préparation : le coach se choisit, comme un rendez-vous, pas comme une file d’attente.',
      inclus: ['Séance individuelle ou à plusieurs', 'Matériel de base apporté par le coach', 'Choix du coach dès la première séance'],
      faq: [['À deux ou en groupe ?', 'Le prix est par personne : indiquez le nombre de participants.'],
            ['Où se passe la séance ?', 'Chez vous, ou chez le coach s’il reçoit.'],
            ['Peut-on prendre un rythme régulier ?', 'Oui, les séances récurrentes se programment dans l’application.']] },
    en: { h1: 'Personal trainer in St Barths',
      intro: 'One-to-one or two-person sessions, at your place, on the beach or at the trainer’s. Fitness, strength, preparation: you choose the coach, like an appointment, not a queue.',
      inclus: ['Solo or small-group session', 'Basic equipment brought by the coach', 'You choose your coach from the first session'],
      faq: [['Two of us or a group?', 'The price is per person: state how many.'],
            ['Where does it take place?', 'At your place, or at the coach’s if they receive.'],
            ['Can I train regularly?', 'Yes, recurring sessions are scheduled in the app.']] } },
  natation: {
    fr: { h1: 'Cours de natation à Saint-Barthélemy',
      intro: 'Cours particuliers en piscine privée ou à la mer, pour enfant comme pour adulte. Le maître-nageur se choisit, et le niveau se précise dans la demande.',
      inclus: ['Cours particulier, enfant ou adulte', 'En piscine privée ou à la mer', 'Choix de l’intervenant'],
      faq: [['À partir de quel âge ?', 'Précisez l’âge dans la demande : l’intervenant accepte en connaissance de cause.'],
            ['Où se passe le cours ?', 'Dans votre piscine, ou à la mer si vous en convenez.'],
            ['Plusieurs enfants ?', 'Le prix est par personne : indiquez le nombre.']] },
    en: { h1: 'Swimming lessons in St Barths',
      intro: 'Private lessons in a private pool or in the sea, for children and adults. You choose the instructor, and the level goes in the request.',
      inclus: ['Private lesson, child or adult', 'In a private pool or in the sea', 'You choose the instructor'],
      faq: [['From what age?', 'Put the age in the request: the instructor accepts knowing it.'],
            ['Where does it happen?', 'In your pool, or in the sea if you agree on it.'],
            ['Several children?', 'The price is per person: state how many.']] } },
  pilates: {
    fr: { h1: 'Cours de Pilates à domicile à Saint-Barthélemy',
      intro: 'Séances de Pilates chez vous, seul ou à deux, tapis fourni. Le professeur se choisit dès la première séance, et le niveau se précise avant.',
      inclus: ['Séance à domicile, tapis fourni', 'Seul, à deux ou en petit groupe', 'Choix du professeur'],
      faq: [['Débutant ?', 'Dites-le dans la demande : la séance est adaptée.'],
            ['Faut-il du matériel ?', 'Le tapis est apporté ; le reste se convient avec le professeur.'],
            ['À deux ?', 'Le prix est par personne.']] },
    en: { h1: 'Pilates at home in St Barths',
      intro: 'Pilates sessions at your place, alone or with a partner, mat provided. You choose the teacher from the first session, and the level goes in the request.',
      inclus: ['Session at home, mat provided', 'Solo, duo or small group', 'You choose the teacher'],
      faq: [['Beginner?', 'Say so in the request: the session is adapted.'],
            ['Do I need equipment?', 'The mat is brought along; anything else is agreed with the teacher.'],
            ['For two?', 'The price is per person.']] } },
  yoga: {
    fr: { h1: 'Cours de yoga à domicile à Saint-Barthélemy',
      intro: 'Vinyasa, hatha ou yoga doux, chez vous, en solo ou à deux, tapis fourni. Le professeur se choisit, et la séance s’adapte au niveau annoncé.',
      inclus: ['Séance à domicile, tapis fourni', 'Solo, duo ou petit groupe', 'Choix du professeur'],
      faq: [['Quel style ?', 'Indiquez-le dans la demande ; chaque professeur précise ce qu’il enseigne.'],
            ['Débutant ?', 'Oui, dites-le : la séance est adaptée.'],
            ['En extérieur ?', 'Sur votre terrasse ou au jardin, si vous en convenez.']] },
    en: { h1: 'Yoga at home in St Barths',
      intro: 'Vinyasa, hatha or gentle yoga, at your place, solo or duo, mat provided. You choose the teacher, and the session follows the level you state.',
      inclus: ['Session at home, mat provided', 'Solo, duo or small group', 'You choose the teacher'],
      faq: [['Which style?', 'State it in the request; each teacher says what they teach.'],
            ['Beginner?', 'Yes, just say so: the session is adapted.'],
            ['Outdoors?', 'On your terrace or in the garden, if you agree on it.']] } },
  colis: {
    fr: { h1: 'Retrait de colis et de courrier à Saint-Barthélemy',
      intro: 'Retrait d’un recommandé ou d’un colis au bureau de poste de Gustavia ou de Lorient, et remise chez vous. Un forfait, une procuration signée dans l’application, et le pli arrive sans que vous ayez fait la queue.',
      inclus: ['Retrait au bureau de poste indiqué', 'Procuration signée dans l’application', 'Remise à l’adresse convenue'],
      faq: [['Est-ce légal ?', 'Oui : vous signez une procuration dans l’application, avec vos pièces, et c’est elle que le prestataire présente au guichet.'],
            ['Plusieurs plis ?', 'Un retrait peut couvrir plusieurs objets : listez-les dans la demande.'],
            ['Quels bureaux ?', 'Gustavia et Lorient.']] },
    en: { h1: 'Parcel and mail pickup in St Barths',
      intro: 'Pickup of a registered letter or a parcel at the Gustavia or Lorient post office, delivered to you. A flat price, a power of attorney signed in the app, and your mail arrives without you queuing.',
      inclus: ['Pickup at the stated post office', 'Power of attorney signed in the app', 'Delivery to the agreed address'],
      faq: [['Is it legal?', 'Yes: you sign a power of attorney in the app, with your ID, and that is what the provider presents at the counter.'],
            ['Several items?', 'One pickup can cover several items: list them in the request.'],
            ['Which post offices?', 'Gustavia and Lorient.']] } }
};

const L = {
  fr: { code: 'fr', dossier: '', locale: 'fr_FR', site: 'Services à la demande · Saint-Barthélemy',
    tous: 'Tous les services', inclus: 'Ce qui est inclus',
    marche: 'Comment ça marche', faq: 'Questions fréquentes',
    autres: 'Les autres services', cta: 'Réserver dans l’application',
    accueil: 'Accueil',
    etapes: ['Vous décrivez ce qu’il vous faut et choisissez le créneau.',
      'La demande part aux professionnels vérifiés du métier, ou à celui que vous avez choisi.',
      'Le premier qui accepte vient ; vous suivez la prestation et vous échangez dans l’application.',
      'Le paiement est sécurisé et n’est débité qu’une fois la prestation validée par vous.'],
    pourquoi: 'Pourquoi Ti-Services',
    gages: ['Prestataires vérifiés', 'Prix ferme avant la commande', 'Payé après validation'],
    args: [['Prestataires vérifiés', 'SIRET et attestation d’assurance contrôlés avant l’activation du profil.', 'bouclier'],
      ['Prix ferme', 'Annoncé dans l’application avant la commande, sans abonnement ni frais d’inscription.', 'etiquette'],
      ['Payé après coup', 'Le paiement en ligne n’est débité qu’une fois la prestation validée par vous.', 'cadenas']],
    titreIndex: 'Services à domicile à Saint-Barthélemy', },
  en: { code: 'en', dossier: 'en/', locale: 'en_US', site: 'On-demand services · St Barths',
    tous: 'All services', inclus: 'What is included',
    marche: 'How it works', faq: 'Frequently asked questions',
    autres: 'Other services', cta: 'Book in the app',
    accueil: 'Home',
    etapes: ['You describe what you need and pick a slot.',
      'The request goes to vetted professionals for that trade, or to the one you chose.',
      'The first to accept comes; you follow the job and chat in the app.',
      'Payment is secured and only charged once you have approved the job.'],
    pourquoi: 'Why Ti-Services',
    gages: ['Vetted providers', 'Firm price before you book', 'Charged after approval'],
    args: [['Vetted providers', 'Company registration and liability insurance checked before a profile goes live.', 'bouclier'],
      ['Firm price', 'Shown in the app before you book, no subscription and no sign-up fee.', 'etiquette'],
      ['Charged afterwards', 'Online payment is only taken once you have approved the job.', 'cadenas']],
    titreIndex: 'Home services in St Barths', }
};

/* --- L'ALLURE. Ces pages sont la PREMIÈRE chose qu'un inconnu voit de Ti-Services : il
   y arrive par une recherche, sans avoir jamais vu l'application. Une page sans visage
   se lit comme un annuaire — et un annuaire ne donne envie de rien.

   ON NE DESSINE PAS UNE SECONDE MARQUE. Tout ce qui suit est repris de l'application :
   la pieuvre, le sable, le corail de l'action, les cartes blanches à coins très arrondis,
   et surtout LES ICÔNES ET LES COULEURS DE MÉTIER (`I` et `SVC_COLORS`, lus dans
   `index.html`) — le ménage est bleu et porte son vaporisateur ici comme sur l'écran
   d'accueil. Quelqu'un qui arrive par « plombier Saint-Barth » puis ouvre l'application
   doit reconnaître le même produit, sinon la page a menti sur ce qu'elle vend.

   LA TEINTE DE LA PAGE EST CELLE DU MÉTIER (`--accent`) : médaillon, puces des titres,
   numéros des étapes, chevrons de la foire aux questions. Vingt-et-une pages, vingt-et-une
   couleurs, une seule feuille de style. L'ACTION, elle, reste CORAIL partout : c'est la
   marque, et deux couleurs d'action sur un même écran ne se hiérarchisent plus.

   CE QUE L'ALLURE N'A PAS LE DROIT DE COÛTER. Toujours AUCUN script (une page qui doit
   s'exécuter pour s'afficher n'est pas une page), aucune police téléchargée (la pile
   système est celle de l'application, `--f-disp`), aucune image hors la pieuvre déjà en
   cache, et moins de 30 Ko par page — les icônes sont du SVG EN LIGNE, donc zéro requête
   et zéro octet de plus que leur propre tracé. Les épreuves tiennent ces quatre points. --- */
const STYLE = `:root{--corail:#E5484D;--corail-fonce:#BE343B;
--encre:#231E33;--encre-doux:#4E4757;--gris:#766F7D;
--sable:#FBF7F4;--papier:#FFFFFF;--filet:#EEE5DF;--accent:#E24B3C}
*{box-sizing:border-box}
body{margin:0;background:var(--sable);color:var(--encre);
font:400 16.5px/1.65 "SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif;
-webkit-text-size-adjust:100%;-webkit-font-smoothing:antialiased;
background-image:radial-gradient(880px 520px at 88% -8%,color-mix(in srgb,var(--accent) 15%,transparent),transparent 60%),
radial-gradient(720px 460px at -10% 2%,color-mix(in srgb,var(--corail) 9%,transparent),transparent 62%);
background-repeat:no-repeat;background-attachment:fixed}
.enveloppe{max-width:840px;margin:0 auto;padding:0 20px 56px}
a{color:inherit}
:focus-visible{outline:2.5px solid var(--accent);outline-offset:3px;border-radius:6px}
.tete{display:flex;align-items:center;gap:12px;padding:22px 0 18px}
.mot{display:flex;align-items:center;gap:12px;flex:none;
font-weight:800;font-size:21px;letter-spacing:-.028em;line-height:1.05;text-decoration:none}
.zouti{flex:none;overflow:visible;filter:drop-shadow(0 8px 16px rgba(226,80,63,.22));
animation:flotte 5.4s ease-in-out infinite}
/* Le dessin porte DEUX bouches, la seconde ne servant qu'au sourire large : sans cette
   règle, prise dans l'application avec lui, les deux se superposent. */
.zouti .z-mouth-big{opacity:0}
@keyframes flotte{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}
.mot i{font-style:normal;color:var(--corail)}
.lieu{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:750;letter-spacing:.11em;
text-transform:uppercase;color:var(--corail);margin-top:4px}
.lieu svg{width:11px;height:11px;flex:none}
.tete .bascule{margin-left:auto;font-size:13px;font-weight:700;text-decoration:none;color:var(--encre-doux);
background:var(--papier);border:1px solid var(--filet);border-radius:999px;padding:7px 14px}
.fil{font-size:13px;color:var(--gris);padding:4px 0 14px}
.fil a{color:var(--gris);text-decoration:none;border-bottom:1px solid var(--filet)}
.fil a:hover{color:var(--encre)}
.hero{position:relative;overflow:hidden;background:var(--papier);border:1px solid var(--filet);
border-radius:26px;padding:30px 30px 27px;margin:0 0 34px;
box-shadow:0 30px 64px -44px rgba(35,30,51,.55)}
.hero::before{content:"";position:absolute;right:-90px;top:-150px;width:340px;height:340px;border-radius:50%;
background:radial-gradient(circle,color-mix(in srgb,var(--accent) 20%,transparent),transparent 68%);pointer-events:none}
.hero>*{position:relative}
.medaille{width:60px;height:60px;border-radius:19px;display:flex;align-items:center;justify-content:center;
background:color-mix(in srgb,var(--accent) 12%,var(--papier));color:var(--accent);
border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);margin:0 0 17px}
.medaille svg{width:30px;height:30px}
h1{font-size:clamp(28px,4.4vw,39px);line-height:1.08;letter-spacing:-.035em;font-weight:800;
margin:0 0 13px;text-wrap:balance}
.chapeau{font-size:17.5px;line-height:1.6;color:var(--encre-doux);margin:0 0 23px;max-width:62ch}
.cta{display:inline-flex;align-items:center;gap:9px;text-decoration:none;
background:linear-gradient(180deg,var(--corail),var(--corail-fonce));color:#fff;
font-weight:750;font-size:16px;letter-spacing:-.012em;padding:15px 24px;border-radius:15px;white-space:nowrap;
box-shadow:0 18px 32px -16px color-mix(in srgb,var(--corail) 78%,transparent)}
.cta svg{width:17px;height:17px}
.gages{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 0;padding:0;list-style:none}
.gages li{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;
color:var(--encre-doux);background:var(--sable);border:1px solid var(--filet);border-radius:999px;padding:7px 13px}
.gages svg{width:14px;height:14px;color:var(--accent);flex:none}
h2{font-size:21px;font-weight:800;letter-spacing:-.028em;margin:36px 0 15px;
display:flex;align-items:center;gap:11px}
h2::before{content:"";width:9px;height:9px;border-radius:3px;background:var(--accent);flex:none}
.bloc{background:var(--papier);border:1px solid var(--filet);border-radius:20px;padding:4px 21px;
box-shadow:0 18px 40px -34px rgba(35,30,51,.6)}
.inclus{list-style:none;margin:0;padding:0}
.inclus li{display:flex;gap:12px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--filet);
font-size:15.5px}
.inclus li:last-child{border-bottom:0}
.inclus svg{width:19px;height:19px;flex:none;margin-top:3px;color:var(--accent)}
.pas{list-style:none;margin:0;padding:0;counter-reset:p}
.pas li{position:relative;padding:1px 0 23px 50px;counter-increment:p;font-size:15.5px;color:var(--encre-doux)}
.pas li::before{content:counter(p);position:absolute;left:0;top:-1px;width:32px;height:32px;border-radius:50%;
background:color-mix(in srgb,var(--accent) 12%,var(--papier));color:var(--accent);
border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);
font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
.pas li:last-child{padding-bottom:0}
.atouts{display:grid;grid-template-columns:repeat(auto-fit,minmax(212px,1fr));gap:12px;
margin:0;padding:0;list-style:none}
.atouts li{background:var(--papier);border:1px solid var(--filet);border-radius:17px;padding:17px 17px 18px;
box-shadow:0 18px 40px -34px rgba(35,30,51,.6)}
.atouts .ic{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;
background:color-mix(in srgb,var(--accent) 12%,var(--papier));color:var(--accent);margin:0 0 12px}
.atouts svg{width:18px;height:18px}
.atouts b{display:block;font-size:15px;letter-spacing:-.018em;margin:0 0 5px}
.atouts span{display:block;font-size:14px;line-height:1.55;color:var(--encre-doux)}
details{background:var(--papier);border:1px solid var(--filet);border-radius:15px;margin:0 0 9px;
overflow:hidden;box-shadow:0 18px 40px -36px rgba(35,30,51,.6)}
summary{list-style:none;cursor:pointer;font-weight:700;font-size:15.5px;letter-spacing:-.014em;
padding:15px 50px 15px 18px;position:relative}
summary::-webkit-details-marker{display:none}
summary::after{content:"";position:absolute;right:20px;top:50%;width:9px;height:9px;
border-right:2.2px solid var(--accent);border-bottom:2.2px solid var(--accent);
transform:translateY(-70%) rotate(45deg);transition:transform .18s ease}
details[open] summary{color:var(--accent)}
details[open] summary::after{transform:translateY(-25%) rotate(-135deg)}
details p{margin:0;padding:0 18px 17px;font-size:15px;color:var(--encre-doux)}
.autres{display:grid;grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:10px;
margin:0;padding:0;list-style:none}
.autres a{display:flex;align-items:center;gap:11px;height:100%;text-decoration:none;
background:var(--papier);border:1px solid var(--filet);border-radius:14px;padding:12px 13px;
font-weight:650;font-size:14.5px;line-height:1.25;letter-spacing:-.012em;
box-shadow:0 14px 30px -28px rgba(35,30,51,.65)}
.autres .ic{width:32px;height:32px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;
background:color-mix(in srgb,var(--c) 13%,var(--papier));color:var(--c)}
.autres svg{width:18px;height:18px}
.liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:11px;
margin:0;padding:0;list-style:none}
.liste li{background:var(--papier);border:1px solid var(--filet);border-radius:17px;
box-shadow:0 18px 40px -34px rgba(35,30,51,.6)}
.liste a{display:flex;gap:13px;padding:15px 16px;text-decoration:none;align-items:flex-start}
.liste .ic{width:38px;height:38px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;
background:color-mix(in srgb,var(--c) 13%,var(--papier));color:var(--c)}
.liste svg{width:20px;height:20px}
.liste b{display:block;font-size:15.5px;letter-spacing:-.018em;margin:1px 0 3px}
.liste span{display:block;font-size:13.5px;line-height:1.5;color:var(--encre-doux)}
.final{margin:38px 0 0;text-align:center}
footer{margin-top:40px;padding-top:20px;border-top:1px solid var(--filet);
font-size:13px;color:var(--gris);display:flex;flex-wrap:wrap;align-items:center;gap:9px 16px}
footer a{color:var(--gris);text-decoration:none}
footer a:hover{color:var(--encre)}
.pousse{margin-left:auto}
@media (max-width:640px){
.enveloppe{padding:0 16px 44px}
.hero{padding:24px 21px 23px;border-radius:22px}
.cta{width:100%;justify-content:center}
.pousse{margin-left:0}
}
@media (prefers-color-scheme:dark){
:root{--sable:#171019;--papier:#241A29;--filet:#392B39;
--encre:#F5EEEA;--encre-doux:#D2C6C2;--gris:#9B8E96;--corail:#FF7E63;--corail-fonce:#F26A4B}
.cta{color:#1B1220}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

/* Les quelques pictogrammes qui ne sont pas des métiers. Écrits une fois, employés
   là où un mot seul serait plus lent à lire qu'un signe. */
const P = {
  fleche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="m12 5 7 7-7 7"/></svg>',
  coche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  bouclier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  etiquette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>',
  cadenas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"/><circle cx="12" cy="10" r="2.4"/></svg>'
};
/* Les icônes de l'application sont écrites en 22 px ; la feuille les redimensionne, mais
   un attribut de taille en dur gagnerait sur elle. On les laisse se régler. */
const ico = (id) => (I[id] || I.other || '').replace(/ width="\d+" height="\d+"/, '');
const teinte = (id) => SVC_COLORS[id] || '#E24B3C';

const svcById = {};
SERVICES.forEach((s) => { svcById[s.id] = s; });
const IDS = SERVICES.map((s) => s.id).filter((id) => M[id]);

function tete(l, racine, autre, lg) {
  return `<header class="tete"><a class="mot" href="${racine}"><svg class="zouti" viewBox="18.4 19.9 83.1 90.2" width="46" height="50" aria-hidden="true">${ZOUTI}</svg>
    <span><i>Ti-</i>Services<span class="lieu">${P.pin} Saint-Barthélemy</span></span></a>
    <a class="bascule" href="${autre}" hreflang="${lg === 'fr' ? 'en' : 'fr'}">${lg === 'fr' ? 'English' : 'Français'}</a></header>`;
}
function pied(l, racine, autre, lg) {
  const doc = lg === 'fr'
    ? [['Mentions légales', 'mentions'], ['Conditions d’utilisation', 'cgu'], ['Confidentialité', 'confidentialite']]
    : [['Legal notice', 'mentions'], ['Terms of use', 'cgu'], ['Privacy', 'confidentialite']];
  return `<footer>© 2026 C.C.S, Ti-Services™.
    ${doc.map((d) => `<a href="${racine}legal/${d[1]}.html">${esc(d[0])}</a>`).join('')}
    <a class="pousse" href="${autre}" hreflang="${lg === 'fr' ? 'en' : 'fr'}">${lg === 'fr' ? 'English' : 'Français'}</a></footer>`;
}

function page(id, lg) {
  const l = L[lg], s = svcById[id], m = M[id][lg];
  const url = SITE + '/' + l.dossier + 'services/' + id + '.html';
  const autre = lg === 'fr' ? SITE + '/en/services/' + id + '.html' : SITE + '/services/' + id + '.html';
  const racine = lg === 'fr' ? '../' : '../../';
  const desc = m.intro.replace(/\s+/g, ' ').slice(0, 155).replace(/[,\s]+$/, '') + '.';
  /* PAS D'`Offer`. Un `Offer` sans `price` est vide de sens, et un `Offer` AVEC prix est
     exactement ce qu'on a décidé de ne pas publier : Google l'afficherait dans le
     résultat de recherche, où il vivrait bien après avoir changé. `Service` dit le métier
     et l'aire desservie, ce qui est tout ce dont un moteur a besoin pour nous situer. */
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Service', '@id': url + '#service', name: m.h1, description: m.intro,
        serviceType: s.nm, provider: { '@type': 'LocalBusiness', name: 'Ti-Services', '@id': SITE + '/#business' },
        areaServed: { '@type': 'AdministrativeArea', name: 'Saint-Barthélemy' },
        availableChannel: { '@type': 'ServiceChannel', serviceUrl: SITE + '/', name: 'Ti-Services' } },
      { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: m.faq.map((q) => ({
        '@type': 'Question', name: q[0], acceptedAnswer: { '@type': 'Answer', text: q[1] } })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: l.accueil, item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: l.tous, item: SITE + '/' + l.dossier + 'services/' },
        { '@type': 'ListItem', position: 3, name: s.nm, item: url } ] }
    ]
  };
  const voisins = IDS.filter((x) => x !== id).slice(0, 12)
    .map((x) => `<li><a href="${x}.html" style="--c:${teinte(x)}"><span class="ic">${ico(x)}</span>${esc(svcById[x].nm)}</a></li>`).join('');
  return `<!doctype html>
<html lang="${l.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(m.titre || m.h1)} · Ti-Services</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="fr" href="${SITE}/services/${id}.html">
<link rel="alternate" hreflang="en" href="${SITE}/en/services/${id}.html">
<link rel="alternate" hreflang="x-default" href="${SITE}/services/${id}.html">
<link rel="icon" type="image/png" href="${racine}icon-192.png">
<meta name="theme-color" content="${teinte(id)}">
<meta name="geo.region" content="BL">
<meta name="geo.placename" content="Saint-Barthélemy">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ti-Services">
<meta property="og:locale" content="${l.locale}">
<meta property="og:title" content="${esc(m.h1)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${STYLE}
:root{--accent:${teinte(id)}}</style>
</head>
<body>
<div class="enveloppe">
  ${tete(l, racine, autre, lg)}
  <nav class="fil"><a href="${racine}">${esc(l.accueil)}</a> › <a href="./">${esc(l.tous)}</a> › ${esc(s.nm)}</nav>

  <div class="hero">
    <div class="medaille">${ico(id)}</div>
    <h1>${esc(m.h1)}</h1>
    <p class="chapeau">${esc(m.intro)}</p>
    <a class="cta" href="${racine}">${esc(l.cta)}${P.fleche}</a>
    <ul class="gages">${l.gages.map((g) => `<li>${P.coche}${esc(g)}</li>`).join('')}</ul>
  </div>

  <h2>${esc(l.inclus)}</h2>
  <div class="bloc"><ul class="inclus">${m.inclus.map((x) => `<li>${P.coche}<span>${esc(x)}</span></li>`).join('')}</ul></div>

  <h2>${esc(l.marche)}</h2>
  <ol class="pas">${l.etapes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>

  <h2>${esc(l.pourquoi)}</h2>
  <ul class="atouts">${l.args.map((a) => `<li><span class="ic">${P[a[2]]}</span><b>${esc(a[0])}</b><span>${esc(a[1])}</span></li>`).join('')}</ul>

  <h2>${esc(l.faq)}</h2>
  ${m.faq.map((q) => `<details><summary>${esc(q[0])}</summary><p>${esc(q[1])}</p></details>`).join('\n  ')}

  <h2>${esc(l.autres)}</h2>
  <ul class="autres">${voisins}</ul>

  <div class="final"><a class="cta" href="${racine}">${esc(l.cta)}${P.fleche}</a></div>
  ${pied(l, racine, autre, lg)}
</div>
</body>
</html>
`;
}

function index(lg) {
  const l = L[lg];
  const url = SITE + '/' + l.dossier + 'services/';
  const autre = lg === 'fr' ? SITE + '/en/services/' : SITE + '/services/';
  const racine = lg === 'fr' ? '../' : '../../';
  const desc = lg === 'fr'
    ? 'Ménage, baby-sitting, jardinage, coiffure, massage, piscine… Tous les services à domicile de Saint-Barthélemy, par des prestataires vérifiés.'
    : 'Cleaning, babysitting, gardening, hairdressing, massage, pool, plumbing, electricity… Every home service in St Barths, from vetted providers.';
  const lignes = IDS.map((id) => {
    const m = M[id][lg];
    return `<li style="--c:${teinte(id)}"><a href="${id}.html"><span class="ic">${ico(id)}</span>
      <span><b>${esc(svcById[id].nm)}</b><span>${esc(m.intro.split('.')[0])}.</span></span></a></li>`;
  }).join('\n      ');
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: l.titreIndex,
    itemListElement: IDS.map((id, i) => ({ '@type': 'ListItem', position: i + 1, name: svcById[id].nm,
      url: SITE + '/' + l.dossier + 'services/' + id + '.html' })) };
  return `<!doctype html>
<html lang="${l.code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(l.titreIndex)} · Ti-Services</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="fr" href="${SITE}/services/">
<link rel="alternate" hreflang="en" href="${SITE}/en/services/">
<link rel="alternate" hreflang="x-default" href="${SITE}/services/">
<link rel="icon" type="image/png" href="${racine}icon-192.png">
<meta name="theme-color" content="#E5484D">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ti-Services">
<meta property="og:locale" content="${l.locale}">
<meta property="og:title" content="${esc(l.titreIndex)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="enveloppe">
  ${tete(l, racine, autre, lg)}
  <nav class="fil"><a href="${racine}">${esc(l.accueil)}</a> › ${esc(l.tous)}</nav>

  <div class="hero">
    <h1>${esc(l.titreIndex)}</h1>
    <p class="chapeau">${esc(desc)}</p>
    <a class="cta" href="${racine}">${esc(l.cta)}${P.fleche}</a>
    <ul class="gages">${l.gages.map((g) => `<li>${P.coche}${esc(g)}</li>`).join('')}</ul>
  </div>

  <h2>${esc(l.tous)}</h2>
  <ul class="liste">
      ${lignes}
  </ul>

  <h2>${esc(l.marche)}</h2>
  <ol class="pas">${l.etapes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>

  <h2>${esc(l.pourquoi)}</h2>
  <ul class="atouts">${l.args.map((a) => `<li><span class="ic">${P[a[2]]}</span><b>${esc(a[0])}</b><span>${esc(a[1])}</span></li>`).join('')}</ul>

  <div class="final"><a class="cta" href="${racine}">${esc(l.cta)}${P.fleche}</a></div>
  ${pied(l, racine, autre, lg)}
</div>
</body>
</html>
`;
}

/* --- CE QUE LISENT LES ASSISTANTS. `llms.txt` est la convention qui se répand pour
   donner à un modèle une présentation courte et des adresses ; `llms-full.txt` porte le
   détail. Ils sont GÉNÉRÉS de la même source que les pages. On n'y écrit que des faits
   vérifiables dans l'application — une phrase inventée ici est répétée ailleurs, par
   quelqu'un qui n'a aucun moyen de la vérifier.

   LA MÊME RÈGLE QUE LES PAGES : AUCUN TARIF. Un prix cité par un assistant est un prix
   publié, et il est répété par quelqu'un qui n'a pas les moyens de le vérifier, souvent
   des mois après. Ce qu'on dit à la place est VRAI et suffit à répondre : le prix
   s'affiche dans l'application avant la commande. --- */
function llms() {
  const lignes = IDS.map((id) => '- [' + svcById[id].nm + '](' + SITE + '/services/' + id + '.html) : '
    + M[id].fr.intro.split('.')[0] + '.');
  return `# Ti-Services

> Plateforme de services à domicile à Saint-Barthélemy (Antilles françaises, collectivité
> d'outre-mer). Un client commande une prestation depuis une application web ; la demande
> part aux prestataires vérifiés du métier, le premier qui accepte intervient. Éditeur :
> C.C.S (Construction Conseils et Services), Marigot, 97133 Saint-Barthélemy.

## Ce qu'il faut savoir

- Zone desservie : l'île de Saint-Barthélemy, en entier.
- Prix FERMES, affichés dans l'application avant la commande. Aucun abonnement, aucun
  frais d'inscription. Les tarifs ne sont pas publiés hors de l'application : c'est là
  qu'ils sont à jour, et c'est là qu'ils engagent.
- Le paiement est en ligne et n'est débité qu'APRÈS validation de la prestation par le client.
- Les prestataires déposent leur SIRET et leur attestation d'assurance ; les deux sont
  contrôlés avant que leur profil soit activé.
- Sur les métiers où la personne compte (coiffure, massage, garde d'enfants, beauté, sport,
  garde d'animaux), le client choisit son prestataire dès la première commande. Sur les
  autres, la demande part à tous les professionnels disponibles du métier.
- Langues de l'application : français, anglais, portugais.
- L'application s'installe sur téléphone (PWA) ; elle fonctionne aussi dans un navigateur.

## Services

${lignes.join('\n')}

## Adresses

- [Accueil](${SITE}/) · [Tous les services](${SITE}/services/) · [All services (English)](${SITE}/en/services/)
- [Conditions générales d'utilisation](${SITE}/legal/cgu.html)
- [Conditions générales de vente](${SITE}/legal/cgv.html)
- [Mentions légales](${SITE}/legal/mentions.html)
- [Politique de confidentialité](${SITE}/legal/confidentialite.html)

## Devenir prestataire

Un professionnel déclaré (SIRET) peut proposer ses services : il crée son compte depuis
l'accueil, dépose son SIRET et son attestation d'assurance, choisit ses métiers et ses
disponibilités. Il n'y a ni abonnement ni frais fixes à l'inscription.
`;
}
function llmsFull() {
  const blocs = IDS.map((id) => {
    const s = svcById[id], m = M[id].fr;
    return '## ' + s.nm + '\n\n' + m.h1 + '\n' + SITE + '/services/' + id + '.html\n\n'
      + m.intro + '\n\nInclus :\n' + m.inclus.map((x) => '- ' + x).join('\n')
      + '\n\nQuestions :\n'
      + m.faq.map((q) => '- ' + q[0] + ' ' + q[1]).join('\n');
  });
  return 'Ti-Services — services à domicile à Saint-Barthélemy\n'
    + '='.repeat(52) + '\n\n'
    + 'Document destiné aux assistants et aux moteurs de recherche. Il est GÉNÉRÉ depuis\n'
    + 'l\'application : les prestations qui suivent sont celles qu\'un client peut commander.\n'
    + 'Les TARIFS n\'y figurent pas et ne figurent sur aucune page publique : ils sont\n'
    + 'affichés dans l\'application, avant la commande, et c\'est là seulement qu\'ils\n'
    + 'engagent. Ne pas en citer, ne pas en estimer.\n\n'
    + 'Zone desservie : l\'île de Saint-Barthélemy, en entier.\n\n'
    + 'Comment une commande se passe :\n'
    + L.fr.etapes.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\n\n'
    + blocs.join('\n\n') + '\n';
}

function rendu() {
  const out = {};
  ['fr', 'en'].forEach((lg) => {
    const d = L[lg].dossier + 'services/';
    out[d + 'index.html'] = index(lg);
    IDS.forEach((id) => { out[d + id + '.html'] = page(id, lg); });
  });
  out['llms.txt'] = llms();
  out['llms-full.txt'] = llmsFull();
  return out;
}

if (require.main === module) {
  const f = rendu();
  Object.keys(f).forEach((chemin) => {
    const abs = path.join(RACINE, chemin);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f[chemin]);
    console.log('écrit  ' + chemin + '  (' + Buffer.byteLength(f[chemin]) + ' octets)');
  });
  console.log('\n' + Object.keys(f).length + ' pages · ' + IDS.length + ' métiers × 2 langues + 2 sommaires');
}
module.exports = { rendu, IDS, M, SITE };
