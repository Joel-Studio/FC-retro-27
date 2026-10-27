/* =============================================================================
 * traits.js  -  Player traits
 * -----------------------------------------------------------------------------
 * Short tags that change how a player is driven by the AI (see the hooks in
 * engine.js: carrierThink, aiThink, tackle, shoot, pass, gkThink, penalty).
 * Headline players carry hand-written tags taken from their scouting
 * descriptions; every other card gets tags derived from its position and stats.
 *
 *   attack     gun shoot-mad   sel selfless   fin clinical    lng long shots   box box hunter   run runs in behind
 *              late late box arrivals        drp drops deep to link    tgt target man   wka weak in the air
 *   wide       wid hugs the line   inv inverted, cuts inside   crs crosser   ovl overlapping runner
 *   creative   vis playmaker   swi long diagonals   sfe safe, keeps the ball   vrt vertical, risky   nlk poor link-up   bpl ball-playing defender
 *   dribbling  dri takes players on   fea fearless under pressure   brs explosive first steps
 *   defending  lzy rarely tracks back   wrk relentless worker   stp aggressive stopper   clm calm   hot hothead   div draws fouls
 *              anc anchor in front of the back line   rec recovery pace   air dominant in the air
 *   body       dur durable   frg fragile
 *   keeper     swp sweeper   stk shot-stopper   cmd commands the box   shk shaky with his feet   pks penalty saver
 *   mind       clu big-game player   inc inconsistent   iso fades when isolated   ldr leader
 *   set piece  pen flawless penalties   ck corners   fk free kicks
 * ========================================================================== */
(function () {
  const T = {
    // ---- Manchester City / Arsenal / Liverpool / Chelsea / Premier League
    'Erling Haaland': 'gun fin box brs nlk wka lng', 'Mohamed Salah': 'inv brs dur fin run lzy', 'Rodri': 'anc sfe vis lng ldr',
    'Virgil van Dijk': 'clm bpl ldr', 'Alisson': 'swp pks clu', 'Florian Wirtz': 'vis dri fea sfe clu', 'Bukayo Saka': 'inv dur sfe pen clu',
    'Gianluigi Donnarumma': 'cmd stk pks shk', 'Martin Ødegaard': 'vis sfe ldr ck', 'Declan Rice': 'anc wrk lng ck rec', 'William Saliba': 'clm rec bpl',
    'Cole Palmer': 'pen clu vis lzy', 'Alexander Isak': 'dri fin pen run', 'Alexis Mac Allister': 'sfe vis clu', 'Rúben Dias': 'ldr stp clm',
    'Gabriel Magalhães': 'stp hot ldr air', 'Moisés Caicedo': 'stp anc wrk', 'Bruno Fernandes': 'swi vrt pen ldr hot ck', 'David Raya': 'swp pks',
    'Ryan Gravenberch': 'dri sfe rec', 'Phil Foden': 'dri sfe inv', 'Josko Gvardiol': 'stp rec dri', 'Viktor Gyökeres': 'brs run wrk fin',
    'Martín Zubimendi': 'anc sfe', 'Bruno Guimarães': 'vis dri hot ldr fea', 'Emiliano Martínez': 'pks cmd hot', 'Enzo Fernández': 'swi lng vis',
    'Tijjani Reijnders': 'dri late', 'Omar Marmoush': 'brs dri fk run', 'Sandro Tonali': 'swi stp', 'Ollie Watkins': 'run wrk fin',
    'Morgan Rogers': 'dri late', 'Bryan Mbeumo': 'inv fin wrk', 'Micky van de Ven': 'rec stp brs', 'Anthony Gordon': 'wrk div run hot',
    'Morgan Gibbs-White': 'dri wrk vis', 'João Pedro': 'drp pen fin', 'Xavi Simons': 'dri fea sfe', 'Hugo Ekitiké': 'dri fin run',
    'Granit Xhaka': 'swi vis ldr hot', 'Jarrod Bowen': 'run fin wrk clu', 'Chris Wood': 'tgt air box',
    // ---- Real Madrid / Barcelona / Spain
    'Kylian Mbappé': 'run brs dri fin clu iso lzy', 'Vinícius Jr.': 'run brs dri fea div hot inv', 'Lamine Yamal': 'inv dri fea vis inc',
    'Jude Bellingham': 'late dri hot ldr fea wrk', 'Thibaut Courtois': 'stk cmd pks clu', 'Raphinha': 'wrk inv ck lng gun', 'Pedri': 'sfe vis sel fea',
    'Federico Valverde': 'wrk lng rec dur', 'Julián Álvarez': 'wrk drp fin clu', 'Robert Lewandowski': 'box fin pen clu', 'Jan Oblak': 'stk',
    'Frenkie de Jong': 'dri sfe vis frg', 'Antonio Rüdiger': 'stp hot rec', 'Jules Koundé': 'stp rec', 'Trent Alexander-Arnold': 'swi crs ck fk vis',
    'Nico Williams': 'brs dri wid', 'Aurélien Tchouaméni': 'stp anc lng', 'Éder Militão': 'stp rec', 'Pau Cubarsí': 'clm bpl', 'Joan García': 'swp',
    'Dani Olmo': 'fin late vis frg', 'Antoine Griezmann': 'wrk sel vis clu drp', 'Arda Güler': 'vis fk', 'Gavi': 'wrk hot fea frg',
    'Alex Baena': 'vis fea sfe', 'Mikel Oyarzabal': 'fin pen ldr', 'Isco': 'dri sfe vis fea', 'Unai Simón': 'pks stk', 'Dean Huijsen': 'bpl clm',
    'Koke': 'sfe ldr', 'Marcus Rashford': 'brs run lng inc', 'Alexander Sørloth': 'tgt air',
    // ---- Italy / Serie A
    'Lautaro Martínez': 'box fin wrk run clu', 'Kevin De Bruyne': 'vis swi fk ck hot frg', 'Nicolò Barella': 'late wrk hot lng', 'Alessandro Bastoni': 'bpl vis',
    'Mike Maignan': 'swp pks cmd', 'Hakan Çalhanoğlu': 'swi pen lng fk', 'Rafael Leão': 'brs dri inc iso fea', 'Scott McTominay': 'late box wrk',
    'Marcus Thuram': 'tgt dri sel', 'Federico Dimarco': 'crs fk ovl', 'Yann Sommer': 'stk pks', 'Christian Pulisic': 'brs dri fin', 'Luka Modrić': 'sfe vis swi ldr',
    'Kenan Yıldız': 'dri fea', 'Gleison Bremer': 'stp air', 'Ademola Lookman': 'dri fin clu', 'Alessandro Buongiorno': 'ldr clm bpl', 'Stanislav Lobotka': 'sfe fea',
    'Dušan Vlahović': 'tgt box fin gun', 'Charles De Ketelaere': 'vis sfe drp', 'Paulo Dybala': 'fin fk dri frg', 'Mile Svilar': 'stk cmd', 'Adrien Rabiot': 'late air hot',
    'Jonathan David': 'fin run sel', 'Romelu Lukaku': 'tgt fin box', 'Nico Paz': 'vis dri sfe', 'Teun Koopmeiners': 'vis ck late', 'Manuel Locatelli': 'sfe anc',
    'Rasmus Højlund': 'run brs gun', 'Mattia Zaccagni': 'fin ldr inv',
    // ---- Germany / Bundesliga
    'Harry Kane': 'vis drp fin pen clu sfe', 'Jamal Musiala': 'dri fea sfe', 'Joshua Kimmich': 'crs vis ldr wrk sfe', 'Michael Olise': 'inv dri ck lzy', 'Gregor Kobel': 'stk',
    'Manuel Neuer': 'swp cmd dur', 'Luis Díaz': 'wrk dri fea run', 'Serhou Guirassy': 'fin air box', 'Alejandro Grimaldo': 'crs fk lng ovl', 'Dayot Upamecano': 'stp rec',
    'Jonathan Tah': 'air ldr clm', 'Nico Schlotterbeck': 'bpl stp ldr', 'Alphonso Davies': 'ovl brs rec stp', 'Julian Brandt': 'vis sfe', 'Serge Gnabry': 'inv fin inc',
    'Konrad Laimer': 'wrk stp', 'Patrik Schick': 'air fin box', 'Exequiel Palacios': 'sfe dri', 'Angelo Stiller': 'swi vis sfe', 'Karim Adeyemi': 'brs run inc',
    'Christoph Baumgartner': 'late run', 'David Raum': 'crs ck ovl', 'Felix Nmecha': 'dri lng', 'Deniz Undav': 'tgt sel',
    // ---- France / PSG / Ligue 1
    'Ousmane Dembélé': 'dri brs inc frg fea', 'Achraf Hakimi': 'ovl brs rec lng', 'Vitinha': 'sfe vis fea', 'Khvicha Kvaratskhelia': 'dri fea inv', 'Marquinhos': 'clm ldr bpl',
    'João Neves': 'stp sfe wrk', 'Nuno Mendes': 'ovl rec stp', 'Désiré Doué': 'dri fea clu inv', 'Willian Pacho': 'clm bpl', 'Fabián Ruiz': 'sfe lng vis', 'Lucas Chevalier': 'stk swp',
    'Bradley Barcola': 'brs dri inv iso', 'Mason Greenwood': 'fin gun inv', 'Geronimo Rulli': 'swp', 'Pierre-Emerick Aubameyang': 'run brs fin', 'Gonçalo Ramos': 'box fin',
    'Leonardo Balerdi': 'ldr stp', 'Brice Samba': 'pks', 'Corentin Tolisso': 'late', 'Malick Fofana': 'dri brs fea', 'Lamine Camara': 'lng stp', 'Aleksandr Golovin': 'vis ck',
    // ---- the rest of the headline cards
    'Bernardo Silva': 'dri sfe wrk sel', 'Aleix García': 'sfe vis', 'Oliver Baumann': 'stk cmd', 'Wladimiro Falcone': 'stk', 'Kingsley Coman': 'brs dri frg clu',
    'Jack Grealish': 'dri div sfe fea', 'Lucas Paquetá': 'dri fea vis hot', 'Thomas Partey': 'anc lng frg', 'James Maddison': 'vis ck fk', 'Reece James': 'crs lng frg ovl',
    'Pierre-Emile Højbjerg': 'sfe anc ldr', 'Benjamin Pavard': 'stp swi', 'Gianluca Mancini': 'stp hot lng ldr', 'Casemiro': 'stp anc clu', 'Denzel Dumfries': 'ovl air',
    'Matthias Ginter': 'air clm', 'Amir Rrahmani': 'ldr stp', 'Ivan Toney': 'tgt pen box', 'Eric García': 'bpl clm', 'Nicolas Jackson': 'run brs inc gun', 'Lisandro Martínez': 'stp hot',
    'John Stones': 'bpl clm', 'Mateo Kovačić': 'dri sfe fea', 'Marcos Llorente': 'dur wrk lng ovl', 'Gabriel Martinelli': 'wrk run brs inc', 'Jeremie Frimpong': 'ovl brs rec',
    'Nahuel Molina': 'ovl clm', 'Manuel Akanji': 'rec clm bpl', 'Ibrahima Konaté': 'rec stp', 'Takefusa Kubo': 'inv sfe', 'Douglas Luiz': 'pen fk sfe', 'João Palhinha': 'stp air anc',
    'José María Giménez': 'stp hot ldr air', 'Ricardo Horta': 'fin vis', 'Oihan Sancet': 'late air box', 'Stefan de Vrij': 'clm', 'Luis Suárez': 'box fin hot div',
    'Christos Tzolis': 'dri inv', 'Péter Gulácsi': 'cmd', 'Yassine Bounou': 'pks clu', 'Conor Gallagher': 'wrk stp ldr', 'Harvey Elliott': 'sfe vis', 'Jean-Clair Todibo': 'bpl',
    'Álex Remiro': 'swp', 'Robin Le Normand': 'clm', 'Dominic Solanke': 'wrk sel drp', 'Hirving Lozano': 'run brs', 'Samuel Chukwueze': 'inv brs inc', 'Youri Tielemans': 'lng sfe vis',
    'Pau Torres': 'bpl swi', 'Kieran Trippier': 'crs fk ck', 'Wilfried Zaha': 'dri div fea inc', 'Nicolas Pépé': 'inv inc fin', 'Naby Keïta': 'dri frg', 'Neto': 'swp',
    'Moussa Niakhaté': 'stp ldr', 'Édouard Mendy': 'stk', 'Ismaël Koné': 'dri late', 'Kaoru Mitoma': 'dri brs fea inv', 'Remo Freuler': 'anc sfe', 'Ivan Perišić': 'crs wrk',
    'Rui Silva': 'stk', 'Galeno': 'inv fin brs', 'Alejandro Garnacho': 'dri fea inc', 'Kobbie Mainoo': 'sfe fea', 'Savinho': 'crs dri', 'Josip Stanišić': 'clm', 'Pedro Neto': 'brs crs frg',
    'Riccardo Calafiori': 'bpl stp', 'Joshua Zirkzee': 'drp tgt inc', 'Éderson': 'wrk dri stp', 'Evan Ndicka': 'rec clm', 'Arthur Theate': 'stp', 'Lucas Beraldo': 'clm',
    'Samu Omorodion': 'tgt brs', 'Oscar Bobb': 'dri sfe', 'Rico Lewis': 'clm sfe', 'Conor Bradley': 'ovl wrk fea', 'Harvey Barnes': 'run fin brs', 'Jacob Murphy': 'wrk run',
    'Sean Longstaff': 'wrk', 'Emile Smith Rowe': 'sfe vis', 'Alex Iwobi': 'vis sfe dur', 'Andreas Pereira': 'ck vis', 'Rodrigo Muniz': 'box gun', 'Vitaliy Mykolenko': 'stp',
    'James Tarkowski': 'air stp ldr', 'Robin Koch': 'air ldr', 'Marc Guéhi': 'clm ldr', 'Adam Wharton': 'swi sfe', 'Tyrick Mitchell': 'clm', 'Jean-Philippe Mateta': 'tgt air',
    'Jarell Quansah': 'bpl', 'Curtis Jones': 'dri late', 'Malo Gusto': 'ovl brs', 'Noni Madueke': 'inv inc', 'Levi Colwill': 'bpl clm', 'Roméo Lavia': 'stp sfe frg', 'Amad Diallo': 'dri clu',
    'Noussair Mazraoui': 'sfe', 'Manuel Ugarte': 'stp hot', 'Fermín López': 'wrk fea clu', 'Marc Casadó': 'sfe anc', 'Endrick': 'fin gun clu', 'Fran García': 'ovl rec', 'Brahim Díaz': 'dri sfe',
    'Jamie Gittens': 'brs inv', 'Yan Couto': 'ovl dri', 'Maximilian Beier': 'run', 'Matías Soulé': 'inv dri', 'Santiago Giménez': 'box fin', 'Johan Bakayoko': 'wid inv', 'Brian Brobbey': 'tgt brs',
    'Jorrel Hato': 'ldr bpl', 'Archie Gray': 'sfe clm', 'Lucas Bergvall': 'dri clu', 'Wilson Odobert': 'dri inv', 'Liam Delap': 'tgt', 'Omari Hutchinson': 'dri', 'Jhon Durán': 'lng gun',
    'Ethan Nwaneri': 'inv fea', 'Myles Lewis-Skelly': 'hot fea ovl',
  };
  const INFO = {
    hld: 'Holds his position in possession', lib: 'Sweeper: sits deep behind the line', hyb: 'Steps into midfield in possession', wb: 'Wing-back: high and wide', ifb: 'Inverted: tucks into midfield', hsp: 'Lives in the half-spaces', free: 'Free role: roams to the ball', tck: 'Tucks in to help the midfield', prs: 'Leads the press', chn: 'Runs the channels', sub: 'Impact sub: bursts after 70 minutes',
    gun: 'Shoot-mad: shoots far more often', sel: 'Selfless: looks for the pass before the shot', fin: 'Clinical finisher', lng: 'Takes long shots', box: 'Box hunter: lives in the penalty area',
    run: 'Runs in behind the line', late: 'Late arrivals into the box', drp: 'Drops deep to link play', tgt: 'Target man: holds the ball up', wka: 'Weak in the air',
    wid: 'Hugs the touchline', inv: 'Inverted winger: cuts inside and shoots', crs: 'Crosser', ovl: 'Overlapping runner',
    vis: 'Playmaker: threads through balls', swi: 'Long diagonal passer', sfe: 'Safe: keeps the ball', vrt: 'Vertical: risky forward passes', nlk: 'Poor link-up play', bpl: 'Ball-playing defender',
    dri: 'Takes defenders on', fea: 'Fearless under pressure', brs: 'Explosive first steps',
    lzy: 'Rarely tracks back', wrk: 'Relentless worker', stp: 'Aggressive stopper', clm: 'Calm defender', hot: 'Hothead: fouls and cards', div: 'Draws fouls', anc: 'Anchors in front of the back line', rec: 'Recovery pace', air: 'Dominant in the air',
    dur: 'Durable', frg: 'Fragile', swp: 'Sweeper keeper', stk: 'Shot-stopper', cmd: 'Commands his box', shk: 'Shaky with his feet', pks: 'Penalty saver',
    clu: 'Big-game player', inc: 'Inconsistent', iso: 'Fades when isolated', ldr: 'Leader', pen: 'Flawless penalties', ck: 'Corner taker', fk: 'Free-kick taker',
  };
  const cache = {};
  /** Cache key part: the same card id with different stats (an evolved or boosted copy) must not share tags, or two machines could disagree. */
  const fp = card => { let t = card.rating | 0; const s = card.sub; if (s) for (const k in s) t = (t * 31 + (s[k] | 0)) % 1000003; return t; };
  /** Hand-written tags when the headline player has them, otherwise derived from position and stats. Returns a Set. */
  function traitsFor(card) {
    const ck = card.id + '|' + fp(card);
    if (cache[ck]) return cache[ck];
    let tags = T[card.name];
    if (tags == null) {
      const s = card.sub || {}, n = k => (s[k] || 55), pos = card.position, out = [];
      if (pos === 'GK') { if (n('gkKicking') > 72) out.push('swp'); else out.push('stk'); if (n('gkHandling') > 78) out.push('cmd'); }
      else {
        const fwd = ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(pos), wide = ['LW', 'RW', 'LM', 'RM'].includes(pos), back = ['LB', 'RB', 'LWB', 'RWB'].includes(pos);
        if (n('sprintSpeed') > 82 && fwd) out.push('run');
        if (n('acceleration') > 85) out.push('brs');
        if (n('dribbling') > 76 && fwd) out.push('dri');
        if (n('finishing') > 80 && pos === 'ST') out.push('fin', 'box');
        if (n('headingAccuracy') > 76 && n('strength') > 76 && pos === 'ST') out.push('tgt');
        if (n('crossing') > 74 && (wide || back)) out.push('crs');
        if (back && n('stamina') > 75) out.push('ovl');
        if (n('vision') > 76 && (pos === 'CM' || pos === 'CAM' || pos === 'CDM')) out.push('vis');
        if (n('shortPassing') > 80 && (pos === 'CM' || pos === 'CDM')) out.push('sfe');
        if (n('longShots') > 80 && !fwd) out.push('lng');
        if (pos === 'CDM' && n('interceptions') > 72) out.push('anc');
        if (pos === 'CB') { if (n('aggression') > 76) out.push('stp'); else out.push('clm'); if (n('longPassing') > 74) out.push('bpl'); }
        if (n('aggression') > 85 && pos !== 'ST') out.push('hot');
        if (n('stamina') > 85 && (pos === 'CM' || pos === 'CAM')) out.push('wrk');
      }
      tags = out.join(' ');
    }
    return (cache[ck] = new Set(tags.split(' ').filter(Boolean)));
  }
  window.RUT = window.RUT || {};
  RUT.TRAITS = T; RUT.TRAIT_INFO = INFO; RUT.traitsFor = traitsFor; RUT.cardFingerprint = fp;
})();
