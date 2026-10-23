/* UN MESSAGE REÇU EFFAÇAIT LA RÉPONSE EN COURS D'ÉCRITURE.
   « Quand je suis en train d'écrire, si je reçois en même temps un message de la personne
   ça efface mon message en cours d'écriture. La cellule de saisie ne s'agrandit pas donc
   je finis par ne plus voir ce que j'écris. » — 23/10/2026.

   DEUX DÉFAUTS, ET LE PREMIER N'EST PAS UNE MALADRESSE : l'écoute en direct appelle
   `render()` dès qu'un message arrive, et c'est NÉCESSAIRE — c'est ce redessin qui affiche
   le message reçu. Mais il reconstruit l'écran entier, donc la cellule de saisie, et le
   texte tapé partait avec elle. Ne pas redessiner n'est pas une option ; le brouillon doit
   survivre au redessin. La cellule était par ailleurs un <input> d'une seule ligne : au-delà
   d'une ligne et demie, le texte défile à l'horizontale et l'on écrit à l'aveugle.

   Ce que cette épreuve tient :
   • on tape, un message arrive, le texte EST TOUJOURS LÀ — avec son curseur et son focus ;
   • il survit aussi à un redessin venu d'ailleurs, et quand on n'a PAS le focus ;
   • la cellule grandit avec le texte, et s'arrête à une borne au lieu de manger l'écran ;
   • envoyer la vide VRAIMENT (un brouillon laissé reviendrait se poser dedans) ;
   • Entrée envoie, Maj+Entrée va à la ligne ;
   • les trois barres passent par la même porte — la troisième n'avait pas Entrée. */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const RACINE = '/home/user/alize-work';
const APP = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
const o = { headless: true }; if (fs.existsSync('/opt/pw-browsers/chromium')) o.executablePath = '/opt/pw-browsers/chromium';
let f = 0; const ok = (c, l) => { if (c) console.log('  ✓ ' + l); else { f++; console.log('  ✗ ÉCHEC : ' + l); } };

console.log('A — une seule porte pour les trois barres');
/* Trois conversations portaient leur barre recopiée mot pour mot, et la troisième
   n'avait jamais reçu la touche Entrée que les deux autres avaient. */
ok(/function barreDeSaisie\(id, placeholder, act\)/.test(APP), 'la porte existe');
const barresEnDur = (APP.match(/<div class="chatbar"><input/g) || []).length;
ok(barresEnDur === 0, 'aucune barre n’est plus écrite à la main (' + barresEnDur + ' trouvée(s))');
const parLaPorte = (APP.match(/barreDeSaisie\('/g) || []).length;
ok(parLaPorte === 3, 'les trois barres passent par elle (' + parLaPorte + ')');
ok(/data-brouillon="\$\{id\}"/.test(APP), 'la cellule DÉCLARE qu’elle porte un brouillon');
ok(/<textarea id="\$\{id\}"/.test(APP), 'c’est une zone de texte, plus un champ d’une ligne');
/* La touche ne tient aucune table : elle fait ce que fait le bouton de SA barre. */
ok(/e\.key==='Enter'&&!e\.shiftKey&&e\.target&&e\.target\.dataset&&e\.target\.dataset\.brouillon/.test(APP)
  && /bar&&bar\.querySelector\('button\[data-act\]'\)/.test(APP),
  'Entrée fait ce que fait le bouton de sa barre, sans liste d’identifiants');
/* Relevé avant l'effacement, et non tenu par une écoute : le remplacement du DOM émet
   lui-même un « focusout », qui aurait effacé le repère avant qu'on s'en serve. */
ok(/const _brAvant=brouillonActif\(\);/.test(APP) && /restaurerBrouillons\(_brAvant\);/.test(APP),
  'paintView — la porte unique de toute peinture — relève puis restaure');

(async () => {
  const b = await chromium.launch(o);
  const p = await b.newPage({ viewport: { width: 420, height: 1400 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(RACINE, 'tests/harn/app.html'));
  await p.waitForFunction(() => window.__S && window.__render);

  // La conversation, telle que l'application la monte : une mission acceptée des deux côtés.
  const monter = async () => p.evaluate(() => {
    const S = window.__S;
    /* SANS CETTE CLASSE, TOUTE LA SCÈNE EST EN `display:none` — `body:not(.standalone):not(.desktop)
       .stage{display:none}` — donc hauteur NULLE partout, et un élément hors mise en page ne
       peut pas recevoir le focus. Mon premier jet l'avait oubliée : quatre mesures rouges
       sur un produit juste, dont deux qui accusaient le focus et deux la hauteur. C'est la
       convention du harnais, et elle est ici la condition de la mesure. */
    document.body.classList.add('standalone');
    S.lang = 'fr'; S.demoMode = true; S.persona = 'client'; S.onboarded = true;
    const m = window.__newMission({ id: 'massage', nm: 'Massage', rate: 60 });
    m.reqId = 'req-test'; m.svc = 'massage'; m.svcName = 'Massage';
    m.status = 'accepted'; m.clientAccepted = true; m.proAccepted = true;
    m.clientName = 'Claire'; m.clientPhone = '0690000001';
    m.provider = { nm: 'Marc', uid: 'pro-1' }; m.providerPhone = '0690000002';
    m.chat = [{ from: 'pro', text: 'Bonjour, je confirme pour demain.', at: Date.now() - 60000 }];
    S.mission = m; S.chat = true; S.support = false;
    window.__render();
    return !!document.getElementById('chatInput');
  });
  ok(await monter(), 'la conversation s’ouvre et porte sa cellule de saisie');

  console.log('B — le message reçu n’efface plus la réponse en cours');
  const EN_COURS = 'Oui, 14 h me va très bien, je serai là';
  const r1 = await p.evaluate(async (txt) => {
    const el = document.getElementById('chatInput');
    el.focus();
    // La frappe, telle que le navigateur la produit : valeur + événement « input ».
    el.value = txt; el.setSelectionRange(10, 10);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    /* LE MESSAGE QUI ARRIVE, reproduit tel que l'écoute le traite : on pousse dans
       `m.chat` puis on redessine — c'est exactement la ligne de `subscribeClient`. */
    window.__S.mission.chat.push({ from: 'pro', text: 'Parfait, à demain !', at: Date.now() });
    window.__render();
    const apres = document.getElementById('chatInput');
    return {
      texte: apres ? apres.value : null,
      debut: apres ? apres.selectionStart : null,
      focus: document.activeElement === apres,
      recu: /Parfait, à demain/.test(document.querySelector('.chat-msgs').textContent),
    };
  }, EN_COURS);
  ok(r1.texte === EN_COURS, 'ce que je tapais est toujours là après le message reçu');
  ok(r1.debut === 10, 'et le curseur n’a pas bougé (' + r1.debut + ')');
  ok(r1.focus === true, 'et je n’ai pas perdu le champ : je continue de taper');
  ok(r1.recu === true, 'le message reçu s’affiche bien — c’est pour ça qu’on redessine');

  console.log('C — il survit à un redessin venu d’ailleurs, et sans le focus');
  const r2 = await p.evaluate(() => {
    const el = document.getElementById('chatInput');
    el.value = 'je réfléchis…'; el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur();                      // on relâche le champ : on a touché autre chose
    window.__render();              // un redessin pour une tout autre raison
    const a = document.getElementById('chatInput');
    return { texte: a ? a.value : null, vole: document.activeElement === a };
  });
  ok(r2.texte === 'je réfléchis…', 'le brouillon survit même quand on n’a pas le champ');
  ok(r2.vole === false, 'et le champ ne VOLE pas le focus qu’on ne lui avait pas donné');

  console.log('D — la cellule grandit avec ce qu’on écrit, et s’arrête');
  const r3 = await p.evaluate(() => {
    const el = document.getElementById('chatInput');
    const pose = (v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); return el.getBoundingClientRect().height; };
    const coupe = () => el.scrollHeight > el.clientHeight + 1;
    // COMBIEN DE LIGNES SE VOIENT — la vraie grandeur. Une hauteur en pixels dépend de la
    // police et du remplissage ; le nombre de lignes lisibles est ce que l'utilisateur voit.
    let vues = 0;
    for (let n = 1; n <= 10; n++) { pose(Array.from({ length: n }, (_, i) => 'l' + i).join('\n')); if (!coupe()) vues = n; }
    const h1 = pose('Bonjour'); const coupe1 = coupe();
    const h5 = pose('une\ndeux\ntrois\nquatre\ncinq');
    const h40 = pose(Array.from({ length: 40 }, (_, i) => 'ligne ' + i).join('\n'));
    const coupe40 = coupe();
    const hRetour = pose('Bonjour');
    const st = getComputedStyle(el);
    return { h1, h5, h40, hRetour, coupe1, coupe40, vues, resize: st.resize, overflow: st.overflowY };
  });
  ok(r3.h5 > r3.h1 + 20, 'cinq lignes font une cellule plus haute qu’une (' + Math.round(r3.h1) + ' → ' + Math.round(r3.h5) + ' px)');
  ok(r3.h40 < 240, 'quarante lignes ne mangent pas l’écran (' + Math.round(r3.h40) + ' px)');
  ok(r3.vues >= 6, 'six lignes au moins se lisent sans défiler (' + r3.vues + ')');
  /* LES DEUX SENS, et c'est la première moitié qui compte : mon jet d'avant ne mesurait
     que « ça déborde », après être revenu à UNE ligne — c'était vrai, et pour la mauvaise
     raison (l'étirement oubliait la bordure, donc une cellule d'une ligne débordait déjà
     de 3 px et rognait son texte). */
  ok(r3.coupe1 === false, 'une seule ligne ne déborde PAS : rien n’est rogné');
  ok(r3.coupe40 === true && r3.overflow === 'auto', 'au-delà de la borne, c’est la CELLULE qui défile, pas la page');
  ok(Math.abs(r3.hRetour - r3.h1) < 2, 'et elle redescend quand on efface (' + Math.round(r3.hRetour) + ' px)');
  ok(r3.resize === 'none', 'pas de poignée de redimensionnement : la hauteur se règle seule');

  console.log('E — envoyer vide vraiment, Entrée envoie, Maj+Entrée va à la ligne');
  const r4 = await p.evaluate(() => {
    const avant = (window.__S.mission.chat || []).length;
    const el = document.getElementById('chatInput');
    el.focus(); el.value = 'À tout de suite'; el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const a = document.getElementById('chatInput');
    return { envoye: (window.__S.mission.chat || []).length === avant + 1,
      cellule: a ? a.value : null,
      brouillon: (window.__S.brouillons && window.__S.brouillons.chatInput) || '',
      dernier: (window.__S.mission.chat || []).slice(-1)[0].text };
  });
  ok(r4.envoye === true, 'Entrée envoie le message');
  ok(r4.dernier === 'À tout de suite', 'et c’est bien ce que j’avais écrit');
  ok(r4.cellule === '', 'la cellule est vide après l’envoi');
  ok(r4.brouillon === '', 'et le brouillon AUSSI : laissé là, il reviendrait se poser dedans');

  const r5 = await p.evaluate(() => {
    const avant = (window.__S.mission.chat || []).length;
    const el = document.getElementById('chatInput');
    el.focus(); el.value = 'première ligne'; el.dispatchEvent(new Event('input', { bubbles: true }));
    const ev = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return { envoye: (window.__S.mission.chat || []).length !== avant, bloque: ev.defaultPrevented };
  });
  ok(r5.envoye === false, 'Maj+Entrée n’envoie pas');
  ok(r5.bloque === false, 'et le navigateur garde la main : c’est lui qui écrit le saut de ligne');

  console.log('F — la troisième barre a enfin la touche Entrée');
  /* Le support général portait la même barre que les deux autres et n'était PAS dans la
     liste des identifiants : Entrée n'y faisait rien. La porte unique le règle sans qu'on
     ait à l'y inscrire. */
  const r6 = await p.evaluate(() => {
    const S = window.__S;
    S.chat = false; S.support = false; S.generalSupport = true; S.genSupport = [];
    window.__render();
    const el = document.getElementById('gsupInput');
    if (!el) return { absent: true };
    el.focus(); el.value = 'Une question sur mon compte'; el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return { envoye: (S.genSupport || []).length === 1, texte: (S.genSupport || []).length ? S.genSupport[0].text : null };
  });
  ok(!r6.absent, 'la barre du support général est là');
  ok(r6.envoye === true && r6.texte === 'Une question sur mon compte', 'Entrée y envoie aussi, désormais');

  ok(errs.length === 0, 'aucune erreur JS (' + errs.join(' | ') + ')');
  await b.close();
  console.log(f ? '\n' + f + ' ÉCHEC(S)' : '\nTOUT EST VERT');
  process.exit(f ? 1 : 0);
})();
