/* =============================================================================
 * database.js  —  Phase 1: Database & Core Models
 * -----------------------------------------------------------------------------
 * FC RETRO 27 ships with:
 *   1. The 150 headline players across the Top 5 leagues (real names/clubs,
 *      ESTIMATED ratings — FC 27 ratings are not public data, so face stats are
 *      plausible hand-tuned guesses, not EA numbers).
 *   2. A deterministic "reserve pool" of procedurally generated bronze / silver /
 *      common-gold fodder, so packs, SBCs and the market have a realistic economy
 *      (you can't build an SBC economy out of 150 superstars).
 *
 * Every card is expanded at boot into a full JSON object:
 *   { id, name, club, league, nation, position, altPositions, rating, rarity,
 *     face:{pac,sho,pas,dri,def,phy}, sub:{acceleration, sprintSpeed, ...},
 *     playStyles:[...], value, generated }
 *
 * Exposed as the global `RUT.DB` (plain script, so index.html works from file://).
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
   * Deterministic PRNG (mulberry32) + string hash. The same name always produces
   * the same sub-stats, so saves stay valid across reloads.
   * ------------------------------------------------------------------------- */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------------------------------------------------------------------------
   * Leagues, clubs (with kit colours used by cards + the match engine) and
   * nation flag stripes (for the pixel-art walkout).
   * ------------------------------------------------------------------------- */
  const LEAGUES = {
    EPL: { code: 'EPL', name: 'Premier League', short: 'PL' },
    LAL: { code: 'LAL', name: 'LALIGA', short: 'LAL' },
    SEA: { code: 'SEA', name: 'Serie A', short: 'SA' },
    BUN: { code: 'BUN', name: 'Bundesliga', short: 'BL' },
    L1:  { code: 'L1',  name: 'Ligue 1', short: 'L1' },
    // v3: leagues for JODIO's 150 who play outside the top 5
    SPL: { code: 'SPL', name: 'Saudi Pro League', short: 'SPL' },
    MLS: { code: 'MLS', name: 'MLS', short: 'MLS' },
    LPT: { code: 'LPT', name: 'Liga Portugal', short: 'LPT' },
    ERE: { code: 'ERE', name: 'Eredivisie', short: 'ERE' },
    BPL: { code: 'BPL', name: 'Belgian Pro League', short: 'BPL' },
  };
  const TOP5 = ['EPL', 'LAL', 'SEA', 'BUN', 'L1'];

  // club: [league, primary kit, secondary kit]
  const CLUBS = {
    'Man City': ['EPL', '#6cabdd', '#ffffff'], 'Liverpool': ['EPL', '#c8102e', '#f6eb61'],
    'Arsenal': ['EPL', '#ef0107', '#ffffff'], 'Chelsea': ['EPL', '#034694', '#ffffff'],
    'Man Utd': ['EPL', '#da291c', '#000000'], 'Tottenham': ['EPL', '#ffffff', '#132257'],
    'Newcastle': ['EPL', '#241f20', '#ffffff'], 'Aston Villa': ['EPL', '#670e36', '#95bfe5'],
    'Nottm Forest': ['EPL', '#dd0000', '#ffffff'], 'West Ham': ['EPL', '#7a263a', '#1bb1e7'],
    'Sunderland': ['EPL', '#eb172b', '#ffffff'], 'Brighton': ['EPL', '#0057b8', '#ffffff'],
    'Real Madrid': ['LAL', '#ffffff', '#febe10'], 'Barcelona': ['LAL', '#a50044', '#004d98'],
    'Atlético Madrid': ['LAL', '#cb3524', '#ffffff'], 'Athletic Club': ['LAL', '#ee2523', '#ffffff'],
    'Real Sociedad': ['LAL', '#0067b1', '#ffffff'], 'Real Betis': ['LAL', '#00954c', '#ffffff'],
    'Villarreal': ['LAL', '#ffe667', '#005187'], 'Sevilla': ['LAL', '#ffffff', '#d2001f'],
    'Inter': ['SEA', '#0068a8', '#000000'], 'AC Milan': ['SEA', '#fb090b', '#000000'],
    'Napoli': ['SEA', '#12a0d7', '#ffffff'], 'Juventus': ['SEA', '#ffffff', '#000000'],
    'Atalanta': ['SEA', '#1e71b8', '#000000'], 'Roma': ['SEA', '#8e1f2f', '#f0bc42'],
    'Lazio': ['SEA', '#87d8f7', '#ffffff'], 'Como': ['SEA', '#003da5', '#ffffff'],
    'Bayern': ['BUN', '#dc052d', '#ffffff'], 'Dortmund': ['BUN', '#fde100', '#000000'],
    'Leverkusen': ['BUN', '#e32221', '#000000'], 'RB Leipzig': ['BUN', '#ffffff', '#dd0741'],
    'Stuttgart': ['BUN', '#ffffff', '#e32219'], 'Frankfurt': ['BUN', '#000000', '#e1000f'],
    'PSG': ['L1', '#004170', '#da291c'], 'Marseille': ['L1', '#ffffff', '#2faee0'],
    'Lyon': ['L1', '#ffffff', '#da0812'], 'Monaco': ['L1', '#e7192b', '#ffffff'],
    'Rennes': ['L1', '#e13327', '#000000'], 'Lille': ['L1', '#e01e13', '#20325f'],
  };
  // The reserve pool is generated from the original clubs only, so reserve ids stay stable for old saves.
  const BASE_CLUB_KEYS = Object.keys(CLUBS);
  Object.assign(CLUBS, {
    'Brentford': ['EPL', '#e30613', '#ffffff'], 'Crystal Palace': ['EPL', '#1b458f', '#c4122e'],
    'Fulham': ['EPL', '#ffffff', '#000000'], 'Everton': ['EPL', '#003399', '#ffffff'],
    'Ipswich': ['EPL', '#3a64a3', '#ffffff'],
    'Bournemouth': ['EPL', '#da291c', '#000000'], 'Wolves': ['EPL', '#fdb913', '#231f20'], 'Leeds': ['EPL', '#ffffff', '#1d428a'], 'Burnley': ['EPL', '#6c1d45', '#99d6ea'],
    'Hoffenheim': ['BUN', '#1961b5', '#ffffff'], 'Freiburg': ['BUN', '#e2001a', '#ffffff'],
    'Werder Bremen': ['BUN', '#1d9053', '#ffffff'],
    'Lecce': ['SEA', '#ffd700', '#d40000'], 'Bologna': ['SEA', '#a21c26', '#1a2f48'],
    'Al Ahli': ['SPL', '#00843d', '#ffffff'], 'Al Hilal': ['SPL', '#005ba6', '#ffffff'],
    'Al Qadsiah': ['SPL', '#e30613', '#f7d117'],
    'Al Nassr': ['SPL', '#f7d117', '#0b3d91'],
    'Inter Miami': ['MLS', '#f7b5cd', '#231f20'], 'San Diego FC': ['MLS', '#041e42', '#7ad1e3'],
    'Braga': ['LPT', '#d6001c', '#ffffff'], 'Porto': ['LPT', '#003893', '#ffffff'],
    'PSV': ['ERE', '#ed1c24', '#ffffff'], 'Feyenoord': ['ERE', '#ffffff', '#e3001b'],
    'Ajax': ['ERE', '#ffffff', '#d2122e'],
    'Club Brugge': ['BPL', '#0067b1', '#000000'],
  });

  // nation -> horizontal or vertical pixel flag stripes
  const FLAGS = {
    ENG: { dir: 'h', c: ['#ffffff', '#cf081f', '#ffffff'] }, ESP: { dir: 'h', c: ['#aa151b', '#f1bf00', '#aa151b'] },
    FRA: { dir: 'v', c: ['#0055a4', '#ffffff', '#ef4135'] }, GER: { dir: 'h', c: ['#000000', '#dd0000', '#ffce00'] },
    ITA: { dir: 'v', c: ['#009246', '#ffffff', '#ce2b37'] }, BRA: { dir: 'h', c: ['#009c3b', '#ffdf00', '#009c3b'] },
    ARG: { dir: 'h', c: ['#74acdf', '#ffffff', '#74acdf'] }, POR: { dir: 'v', c: ['#006600', '#ff0000', '#ff0000'] },
    NED: { dir: 'h', c: ['#ae1c28', '#ffffff', '#21468b'] }, BEL: { dir: 'v', c: ['#000000', '#fdda24', '#ef3340'] },
    NOR: { dir: 'h', c: ['#ba0c2f', '#ffffff', '#00205b'] }, EGY: { dir: 'h', c: ['#ce1126', '#ffffff', '#000000'] },
    CRO: { dir: 'h', c: ['#ff0000', '#ffffff', '#171796'] }, URU: { dir: 'h', c: ['#ffffff', '#0038a8', '#ffffff'] },
    SWE: { dir: 'h', c: ['#006aa7', '#fecc00', '#006aa7'] }, TUR: { dir: 'h', c: ['#e30a17', '#ffffff', '#e30a17'] },
    MAR: { dir: 'h', c: ['#c1272d', '#006233', '#c1272d'] }, POL: { dir: 'h', c: ['#ffffff', '#ffffff', '#dc143c'] },
    USA: { dir: 'h', c: ['#b22234', '#ffffff', '#3c3b6e'] }, CAN: { dir: 'v', c: ['#ff0000', '#ffffff', '#ff0000'] },
    SUI: { dir: 'h', c: ['#d52b1e', '#ffffff', '#d52b1e'] }, DEN: { dir: 'h', c: ['#c8102e', '#ffffff', '#c8102e'] },
    GHA: { dir: 'h', c: ['#ce1126', '#fcd116', '#006b3f'] }, SEN: { dir: 'v', c: ['#00853f', '#fdef42', '#e31b23'] },
    CIV: { dir: 'v', c: ['#f77f00', '#ffffff', '#009e60'] }, NGA: { dir: 'v', c: ['#008751', '#ffffff', '#008751'] },
    JPN: { dir: 'h', c: ['#ffffff', '#bc002d', '#ffffff'] }, MEX: { dir: 'v', c: ['#006847', '#ffffff', '#ce1126'] },
    COL: { dir: 'h', c: ['#fcd116', '#003893', '#ce1126'] }, GRE: { dir: 'h', c: ['#0d5eaf', '#ffffff', '#0d5eaf'] },
    HUN: { dir: 'h', c: ['#ce2939', '#ffffff', '#477050'] }, UKR: { dir: 'h', c: ['#0057b7', '#0057b7', '#ffd700'] },
    CMR: { dir: 'v', c: ['#007a5e', '#ce1126', '#fcd116'] }, GUI: { dir: 'v', c: ['#ce1126', '#fcd116', '#009460'] },
    GAB: { dir: 'h', c: ['#009e60', '#fcd116', '#3a75c4'] }, SVK: { dir: 'h', c: ['#ffffff', '#0b4ea2', '#ee1c25'] },
    KVX: { dir: 'h', c: ['#244aa5', '#d0a650', '#244aa5'] }, NIR: { dir: 'h', c: ['#ffffff', '#cf081f', '#ffffff'] },
  };
  FLAGS.SVN = { dir: 'h', c: ['#ffffff', '#0057a8', '#ed1c24'] }; FLAGS.GEO = { dir: 'h', c: ['#ffffff', '#e8112d', '#ffffff'] }; FLAGS.GAM = { dir: 'h', c: ['#ce1126', '#0c1c8c', '#3a7728'] }; FLAGS.RUS = { dir: 'h', c: ['#ffffff', '#0039a6', '#d52b1e'] }; FLAGS.SRB = { dir: 'h', c: ['#c6363c', '#0c4076', '#ffffff'] };
  const DEFAULT_FLAG = { dir: 'h', c: ['#666666', '#999999', '#666666'] };

  /* ---------------------------------------------------------------------------
   * PlayStyles+. `code` is used in the compact table below; `engine` documents
   * how engine.js manifests it on the 2D pitch.
   * ------------------------------------------------------------------------- */
  const PLAYSTYLES = {
    RA: { name: 'Rapid+', icon: '»', engine: '2 s burst of top speed when sprinting with the ball, 5 s cooldown' },
    QS: { name: 'Quick Step+', icon: '⇡', engine: '3 s of sharper acceleration when sprinting without the ball, 5 s cooldown' },
    FS: { name: 'Finesse Shot+', icon: '◠', engine: 'Shots curl hard into the far corner, cyan curve trail' },
    PS: { name: 'Power Shot+', icon: '✸', engine: 'Faster shots with a red streak, harder to save' },
    LD: { name: 'Low Driven Shot+', icon: '_', engine: 'Shots stay on the deck, keeper reacts later' },
    CS: { name: 'Chip Shot+', icon: '⌒', engine: 'Lobbed finishes over advanced keepers' },
    AC: { name: 'Acrobatic+', icon: '↺', engine: 'Better finishing from bouncing / aerial balls' },
    PH: { name: 'Precision Header+', icon: '▲', engine: 'Wins aerial duels' },
    PP: { name: 'Pinged Pass+', icon: '═', engine: 'Laser-line passes travel 35% faster' },
    IP: { name: 'Incisive Pass+', icon: '↗', engine: 'Through balls placed perfectly into space' },
    LB: { name: 'Long Ball Pass+', icon: '⤴', engine: 'Accurate long switches of play' },
    WP: { name: 'Whipped Pass+', icon: '~', engine: 'Curled crosses with added pace' },
    TT: { name: 'Tiki Taka+', icon: '∞', engine: 'First-time short passes never stray' },
    DB: { name: 'Dead Ball+', icon: '●', engine: 'Set-piece / long-range curve accuracy' },
    TE: { name: 'Technical+', icon: '✦', engine: 'Tighter turning while dribbling' },
    TR: { name: 'Trickster+', icon: '?', engine: 'Skill-move sidestep shakes off tacklers' },
    FT: { name: 'First Touch+', icon: '◉', engine: 'Instant ball control on receive' },
    PR: { name: 'Press Proven+', icon: '■', engine: 'Shields the ball under pressure' },
    RE: { name: 'Relentless+', icon: '∑', engine: 'Stamina barely drains' },
    IN: { name: 'Intercept+', icon: '✋', engine: 'Larger interception radius, blue ring flash' },
    AN: { name: 'Anticipate+', icon: '◎', engine: 'Clean standing tackles, wins the ball forward' },
    BR: { name: 'Bruiser+', icon: '✊', engine: 'Crunching tackles + "CRUNCH!" flash' },
    JO: { name: 'Jockey+', icon: '⇄', engine: 'Mirrors dribblers without lunging' },
    SL: { name: 'Slide Tackle+', icon: '⟿', engine: 'Long-reach slide tackles' },
    FR: { name: 'Far Reach+', icon: '⟷', engine: 'GK dives cover more of the goal' },
    FW: { name: 'Footwork+', icon: '⚡', engine: 'GK reflex saves at close range' },
    TV: { name: 'Inventive+', icon: '⟲', engine: 'Outside-of-the-boot passes that bend the other way (purple arc)' },
    GC: { name: 'Gamechanger+', icon: '✺', engine: 'Fancy and awkward strikes under pressure' },
    AF: { name: 'Aerial Fortress+', icon: '⇧', engine: 'Higher jumps in aerial duels' },
    BL: { name: 'Block+', icon: '▣', engine: 'Blocks shots with his body' },
    EN: { name: 'Enforcer+', icon: '⛨', engine: 'Shoulder challenges and shielding' },
    LT: { name: 'Long Throw+', icon: '⤒', engine: 'Throw-ins into the box' },
    C1: { name: '1v1 Close Down+', icon: '⊕', engine: 'Keeper rushes out faster' },
    CC: { name: 'Cross Claimer+', icon: '⌃', engine: 'Keeper claims and punches crosses' },
    DF: { name: 'Deflector+', icon: '⤫', engine: 'Keeper parries into safe areas' },
    FTW: { name: 'Far Throw+', icon: '⇉', engine: 'Keeper distribution travels further' },
  };

  /* v148 (JODIO, 2026-10-23): PlayStyles work like the EA SPORTS FC 27 PlayStyles guide: 36 of them, each in two tiers. Silver (no plus) is the base effect, Gold (the + name) is the
   * mastered version, about twice as strong. A gold code is upper case (FS), its silver is the same code in lower case (fs). Engine strength: gold 1, silver 0.55 (engine.js, p.pf). */
  const PS_GUIDE = {
    'Finesse Shot': ['Finesse shots faster, with extra curve and better accuracy.', 'Much faster, maximum curve: starts wide on a diagonal and bends back in.'],
    'Power Shot': ['Power shots faster, with more ball speed.', 'Much faster execution and a big gain in ball speed; never curves.'],
    'Low Driven Shot': ['Low driven shots with better accuracy and quicker release.', 'Much better accuracy and an even quicker release (no extra speed).'],
    'Chip Shot': ['Chips faster and more accurate.', 'Chips quicker with exceptional accuracy.'],
    'Dead Ball': ['Set pieces with more speed, curve and accuracy.', 'Exceptional set-piece speed, curve and accuracy.'],
    'Precision Header': ['Headers with more accuracy and power.', 'Greatly increased header accuracy and power.'],
    'Acrobatic': ['Volleys more accurate.', 'Volleys much more accurate.'],
    'Gamechanger': ['Fancy and awkward strikes more accurate under pressure.', 'Greatly improved accuracy on fancy and awkward strikes.'],
    'Incisive Pass': ['Through passes more accurate.', 'Far more accurate through passes.'],
    'Pinged Pass': ['Ground passes travel faster.', 'Ground passes travel much faster.'],
    'Tiki Taka': ['Short and first-time passes more accurate.', 'Short and first-time passes exceptionally accurate.'],
    'Long Ball Pass': ['Lobs more accurate and harder to intercept.', 'Even more accurate, faster and far harder to intercept.'],
    'Whipped Pass': ['Crosses more accurate, faster and with more curve.', 'Same, plus driven crosses with exceptional power.'],
    'Inventive': ['Fancy and outside-of-the-boot passes more accurate.', 'Greatly improved accuracy on fancy passes.'],
    'First Touch': ['Less error when trapping the ball.', 'Minimal trapping error, much quicker control.'],
    'Press Proven': ['Shields the ball better under pressure.', 'Much more effective shielding under pressure.'],
    'Rapid': ['Higher sprint speed with the ball.', 'Even higher dribbling sprint speed (2 s burst, 5 s cooldown).'],
    'Technical': ['Tighter turns while dribbling.', 'Even tighter, more precise turns.'],
    'Trickster': ['Unlocks flick skill moves.', 'More skill moves and more agile dribbling.'],
    'Aerial Fortress': ['Jumps higher in defensive aerial duels.', 'Even higher jumps and greater aerial presence.'],
    'Anticipate': ['Improved standing-tackle success.', 'Significantly improved tackle success.'],
    'Block': ['A bit more reach and chance to block shots.', 'Greater reach and a better chance to block shots.'],
    'Intercept': ['More reach on interceptions.', 'Even more reach on interceptions.'],
    'Jockey': ['Higher jockey speed.', 'Higher jockey speed, a quicker switch to sprinting.'],
    'Slide Tackle': ['Wins more slide tackles.', 'Greater slide-tackle reach and success.'],
    'Quick Step': ['Accelerates faster in an explosive sprint.', 'Accelerates significantly faster (3 s, 5 s cooldown).'],
    'Relentless': ['Less fatigue during play.', 'Greatly reduces fatigue.'],
    'Bruiser': ['More strength in physical tackles.', 'Even more strength in physical tackles.'],
    'Enforcer': ['More effective shoulder challenges and shielding.', 'Greatly more effective shoulder challenges and shielding.'],
    'Long Throw': ['Throw-ins with more power and distance.', 'Throw-ins with maximum power and distance.'],
    '1v1 Close Down': ['Keeper rushes out faster and reads close shots better.', 'Even faster rush out and better close-range saves.'],
    'Cross Claimer': ['Keeper claims crosses from further and punches harder.', 'Even more claiming reach and punch power.'],
    'Deflector': ['Parries shots into safer areas.', 'Maximum parry power into safe areas.'],
    'Far Reach': ['Dives cover more of the goal.', 'Dives cover even more, better odds on long shots.'],
    'Far Throw': ['Keeper distribution travels further.', 'Even greater distribution distance.'],
    'Footwork': ['Better against low shots and close saves.', 'Even better against low shots and close saves.'],
  };
  Object.keys(PLAYSTYLES).forEach(code => {
    const g = PLAYSTYLES[code], base = g.name.replace(/\+$/, ''), tx = PS_GUIDE[base];
    g.tier = 'gold'; if (tx) g.engine = 'Gold: ' + tx[1];
    PLAYSTYLES[code.toLowerCase()] = { name: base, icon: g.icon, engine: 'Silver: ' + (tx ? tx[0] : g.engine), tier: 'silver' };
  });
  const PS_ALIAS = { 'Power Header+': 'Precision Header+', 'Power Header': 'Precision Header', 'Trivela+': 'Inventive+', 'Trivela': 'Inventive' };   // names saved before v148
  const isGold = n => /\+$/.test(n);
  /** Silver PlayStyles a player earns from his attributes (v148): deterministic, never one he already holds in gold. group: A attacker, M midfielder, D defender, G keeper. */
  const SILVER_RULES = [
    ['FS', 'A', s => s.curve >= 82 && s.finishing >= 74], ['PS', 'A', s => s.shotPower >= 85 && s.finishing >= 76], ['LD', 'A', s => s.finishing >= 83],
    ['CS', 'A', s => s.finishing >= 80 && s.composure >= 80], ['AC', 'A', s => s.volleys >= 80], ['PH', 'AD', s => s.headingAccuracy >= 80],
    ['GC', 'A', s => s.dribbling >= 86 && s.composure >= 76], ['DB', 'AM', s => s.fkAccuracy >= 82],
    ['PP', 'M', s => s.shortPassing >= 85], ['IP', 'AM', s => s.vision >= 84], ['LB', 'MD', s => s.longPassing >= 84], ['WP', 'AMD', s => s.crossing >= 82],
    ['TT', 'M', s => s.shortPassing >= 82 && s.ballControl >= 84], ['TV', 'AM', s => s.vision >= 80 && s.dribbling >= 82],
    ['FT', 'AM', s => s.ballControl >= 86], ['PR', 'AM', s => s.strength >= 76 && s.ballControl >= 80], ['RA', 'AMD', s => s.sprintSpeed >= 80],
    ['TE', 'AM', s => s.agility >= 84 && s.dribbling >= 84], ['TR', 'A', s => s.dribbling >= 88],
    ['AF', 'D', s => s.jumping >= 82 && s.strength >= 80], ['AN', 'MD', s => s.standingTackle >= 82], ['BL', 'D', s => s.defAwareness >= 82],
    ['IN', 'MD', s => s.interceptions >= 82], ['JO', 'D', s => s.defAwareness >= 78 && s.agility >= 70], ['SL', 'MD', s => s.slidingTackle >= 82],
    ['QS', 'AMD', s => s.acceleration >= 80], ['RE', 'AMD', s => s.stamina >= 88], ['BR', 'MD', s => s.strength >= 86], ['EN', 'MD', s => s.strength >= 82 && s.aggression >= 72],
    ['LT', 'D', s => s.strength >= 78], ['FR', 'G', s => s.gkDiving >= 84], ['FW', 'G', s => s.gkReflexes >= 84], ['C1', 'G', s => s.gkReflexes >= 80 && s.gkPositioning >= 78],
    ['CC', 'G', s => s.gkHandling >= 80], ['DF', 'G', s => s.gkHandling >= 82], ['FTW', 'G', s => s.gkKicking >= 82],
  ];
  const PS_GROUP_OF = pos => pos === 'GK' ? 'G' : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(pos) ? 'D' : ['CDM', 'CM'].includes(pos) ? 'M' : 'A';
  function silverFor(pos, sub, rating, have, seed) {
    if (rating < 62) return [];
    const g = PS_GROUP_OF(pos), r = rng(hashStr(seed + '#silver')), cand = [];
    SILVER_RULES.forEach(([code, grp, ok]) => { if (!grp.includes(g) && !(g === 'M' && pos === 'CAM' && grp.includes('A'))) return; const nm = PLAYSTYLES[code].name.replace(/\+$/, ''); if (have.has(nm)) return; let yes = false; try { yes = ok(sub); } catch (e) { yes = false; } if (yes) cand.push(nm); });
    if (!cand.length) return [];
    const n = rating >= 84 ? 3 : rating >= 75 ? 2 : 1, out = [];
    while (cand.length && out.length < n) out.push(cand.splice(Math.floor(r() * cand.length), 1)[0]);
    return out;
  }

  /* ---------------------------------------------------------------------------
   * THE 150. Compact table:
   * [name, club, nation, pos, ovr, PAC, SHO, PAS, DRI, DEF, PHY, playStyle codes]
   * For goalkeepers the six numbers are DIV, HAN, KIC, REF, SPD, POS.
   * League is derived from the club. Ratings are estimates (see header).
   * ------------------------------------------------------------------------- */
  const TOP150 = [
    // ---------------- Premier League (42) ----------------
    ['Erling Haaland', 'Man City', 'NOR', 'ST', 91, 89, 93, 66, 80, 45, 88, 'PS AC'],
    ['Mohamed Salah', 'Liverpool', 'EGY', 'RW', 90, 89, 88, 84, 88, 45, 75, 'FS'],
    ['Rodri', 'Man City', 'ESP', 'CDM', 90, 66, 80, 86, 84, 87, 85, 'TT IN'],
    ['Virgil van Dijk', 'Liverpool', 'NED', 'CB', 88, 77, 59, 70, 71, 89, 85, 'AN PH'],
    ['Alisson', 'Liverpool', 'BRA', 'GK', 87, 84, 83, 83, 87, 52, 88, 'FR'],
    ['Florian Wirtz', 'Liverpool', 'GER', 'CAM', 86, 79, 79, 84, 87, 47, 63, 'TE IP'],
    ['Bukayo Saka', 'Arsenal', 'ENG', 'RW', 87, 85, 81, 82, 87, 48, 68, 'FS WP'],
    ['Gianluigi Donnarumma', 'Man City', 'ITA', 'GK', 89, 89, 83, 77, 90, 52, 87, 'FR'],
    ['Martin Ødegaard', 'Arsenal', 'NOR', 'CAM', 86, 72, 79, 88, 86, 59, 63, 'IP TT'],
    ['Declan Rice', 'Arsenal', 'ENG', 'CM', 88, 76, 75, 84, 81, 85, 85, 'RE IN'],
    ['William Saliba', 'Arsenal', 'FRA', 'CB', 88, 82, 45, 70, 74, 89, 85, 'AN JO'],
    ['Cole Palmer', 'Chelsea', 'ENG', 'CAM', 88, 77, 85, 86, 87, 50, 66, 'FS DB'],
    ['Alexander Isak', 'Liverpool', 'SWE', 'ST', 86, 85, 85, 74, 85, 38, 74, 'FS FT'],
    ['Alexis Mac Allister', 'Liverpool', 'ARG', 'CM', 87, 70, 80, 85, 84, 79, 76, 'TT'],
    ['Rúben Dias', 'Man City', 'POR', 'CB', 87, 63, 42, 67, 68, 89, 87, 'BR AN'],
    ['Gabriel Magalhães', 'Arsenal', 'BRA', 'CB', 89, 72, 54, 65, 68, 90, 89, 'PH BR'],
    ['Moisés Caicedo', 'Chelsea', 'ECU', 'CDM', 86, 73, 64, 78, 79, 85, 83, 'IN RE'],
    ['Bruno Fernandes', 'Man Utd', 'POR', 'CAM', 89, 74, 87, 91, 85, 70, 78, 'IP DB'],
    ['David Raya', 'Arsenal', 'ESP', 'GK', 87, 85, 82, 88, 87, 50, 84, 'FW'],
    ['Ryan Gravenberch', 'Liverpool', 'NED', 'CDM', 86, 78, 70, 80, 84, 80, 80, 'PR'],
    ['Phil Foden', 'Man City', 'ENG', 'CAM', 86, 82, 83, 84, 89, 55, 62, 'TE FS'],
    ['Josko Gvardiol', 'Man City', 'CRO', 'CB', 86, 80, 64, 75, 78, 86, 82, 'AN'],
    ['Viktor Gyökeres', 'Arsenal', 'SWE', 'ST', 86, 86, 87, 72, 82, 40, 87, 'PS BR'],
    ['Martín Zubimendi', 'Arsenal', 'ESP', 'CDM', 86, 64, 68, 84, 80, 84, 76, 'TT IN'],
    ['Bruno Guimarães', 'Arsenal', 'BRA', 'CM', 86, 68, 78, 85, 84, 80, 82, 'TT'],
    ['Emiliano Martínez', 'Aston Villa', 'ARG', 'GK', 86, 85, 82, 84, 86, 48, 85, 'FR'],
    ['Enzo Fernández', 'Man City', 'ARG', 'CM', 86, 71, 79, 87, 83, 75, 77, 'LB'],
    ['Tijjani Reijnders', 'Al Qadsiah', 'NED', 'CM', 85, 80, 79, 82, 84, 70, 75, 'RE'],
    ['Omar Marmoush', 'Man City', 'EGY', 'ST', 85, 88, 84, 78, 85, 38, 72, 'RA FS'],
    ['Sandro Tonali', 'Tottenham', 'ITA', 'CDM', 85, 72, 76, 82, 80, 80, 80, 'LB'],
    ['Ollie Watkins', 'Aston Villa', 'ENG', 'ST', 84, 85, 84, 74, 80, 45, 78, 'RA'],
    ['Morgan Rogers', 'Chelsea', 'ENG', 'CAM', 84, 84, 79, 78, 85, 55, 78, 'TE'],
    ['Bryan Mbeumo', 'Man Utd', 'CMR', 'RW', 84, 85, 82, 79, 84, 40, 72, 'FS'],
    ['Micky van de Ven', 'Tottenham', 'NED', 'CB', 84, 93, 45, 64, 70, 83, 80, 'RA AN'],
    ['Anthony Gordon', 'Barcelona', 'ENG', 'LW', 84, 91, 78, 77, 84, 45, 70, 'RA'],
    ['Morgan Gibbs-White', 'Nottm Forest', 'ENG', 'CAM', 84, 79, 78, 83, 85, 60, 72, 'IP'],
    ['João Pedro', 'Chelsea', 'BRA', 'ST', 84, 82, 83, 76, 85, 45, 74, 'AC'],
    ['Xavi Simons', 'Tottenham', 'NED', 'CAM', 84, 84, 79, 81, 86, 50, 66, 'TR'],
    ['Hugo Ekitiké', 'Liverpool', 'FRA', 'ST', 84, 86, 82, 72, 85, 38, 74, 'FT'],
    ['Granit Xhaka', 'Sunderland', 'SUI', 'CM', 84, 55, 78, 86, 78, 80, 80, 'LB PP'],
    ['Jarrod Bowen', 'West Ham', 'ENG', 'RW', 83, 85, 81, 78, 82, 50, 72, 'RE'],
    ['Chris Wood', 'Nottm Forest', 'NZL', 'ST', 83, 68, 84, 64, 74, 40, 84, 'PH'],
    // ---------------- LALIGA (32) ----------------
    ['Kylian Mbappé', 'Real Madrid', 'FRA', 'ST', 91, 97, 90, 80, 92, 36, 77, 'RA QS'],
    ['Vinícius Jr.', 'Real Madrid', 'BRA', 'LW', 90, 95, 84, 81, 91, 29, 69, 'TR RA'],
    ['Lamine Yamal', 'Barcelona', 'ESP', 'RW', 90, 86, 82, 86, 92, 35, 62, 'FS TE TV'],
    ['Jude Bellingham', 'Real Madrid', 'ENG', 'CAM', 90, 81, 86, 84, 89, 78, 84, 'RE'],
    ['Thibaut Courtois', 'Real Madrid', 'BEL', 'GK', 90, 87, 90, 77, 91, 47, 90, 'FR'],
    ['Raphinha', 'Barcelona', 'BRA', 'LW', 88, 89, 85, 84, 87, 51, 72, 'PP DB'],
    ['Pedri', 'Barcelona', 'ESP', 'CM', 90, 76, 75, 89, 92, 71, 69, 'TT TE'],
    ['Federico Valverde', 'Real Madrid', 'URU', 'CM', 87, 87, 82, 83, 84, 78, 83, 'RE PS'],
    ['Julián Álvarez', 'Atlético Madrid', 'ARG', 'ST', 86, 80, 85, 77, 84, 52, 74, 'FS PR'],
    ['Robert Lewandowski', 'Barcelona', 'POL', 'ST', 87, 72, 89, 78, 84, 43, 80, 'AC'],
    ['Jan Oblak', 'Atlético Madrid', 'SVN', 'GK', 88, 86, 89, 76, 89, 49, 88, 'FR'],
    ['Frenkie de Jong', 'Barcelona', 'NED', 'CM', 86, 80, 70, 86, 88, 77, 76, 'TT'],
    ['Antonio Rüdiger', 'Real Madrid', 'GER', 'CB', 86, 82, 54, 72, 68, 87, 87, 'BR'],
    ['Jules Koundé', 'Barcelona', 'FRA', 'RB', 86, 84, 60, 76, 80, 85, 80, 'JO AN'],
    ['Trent Alexander-Arnold', 'Real Madrid', 'ENG', 'RB', 86, 76, 76, 90, 80, 76, 72, 'WP LB DB'],
    ['Nico Williams', 'Athletic Club', 'ESP', 'LW', 86, 93, 77, 79, 87, 38, 66, 'RA TR'],
    ['Aurélien Tchouaméni', 'Real Madrid', 'FRA', 'CDM', 85, 72, 70, 79, 77, 84, 84, 'IN'],
    ['Éder Militão', 'Real Madrid', 'BRA', 'CB', 85, 86, 55, 66, 70, 85, 84, 'AN'],
    ['Pau Cubarsí', 'Barcelona', 'ESP', 'CB', 86, 73, 46, 77, 73, 86, 76, 'AN PP'],
    ['Joan García', 'Barcelona', 'ESP', 'GK', 86, 86, 83, 83, 87, 51, 84, 'FW'],
    ['Dani Olmo', 'Barcelona', 'ESP', 'CAM', 85, 78, 82, 84, 86, 50, 66, 'TE'],
    ['Antoine Griezmann', 'Atlético Madrid', 'FRA', 'ST', 85, 76, 84, 86, 85, 55, 70, 'IP'],
    ['Arda Güler', 'Real Madrid', 'TUR', 'CAM', 84, 74, 81, 85, 86, 45, 58, 'FS DB'],
    ['Gavi', 'Barcelona', 'ESP', 'CM', 84, 78, 70, 81, 84, 70, 72, 'RE'],
    ['Alex Baena', 'Atlético Madrid', 'ESP', 'LM', 84, 74, 79, 85, 84, 55, 66, 'WP'],
    ['Mikel Oyarzabal', 'Real Sociedad', 'ESP', 'ST', 84, 78, 83, 79, 82, 45, 74, 'FT'],
    ['Isco', 'Real Betis', 'ESP', 'CAM', 84, 62, 77, 86, 87, 55, 66, 'TT'],
    ['Unai Simón', 'Athletic Club', 'ESP', 'GK', 84, 82, 80, 84, 84, 48, 82, 'FW'],
    ['Dean Huijsen', 'Real Madrid', 'ESP', 'CB', 83, 70, 45, 75, 70, 83, 80, 'LB'],
    ['Koke', 'Atlético Madrid', 'ESP', 'CM', 83, 60, 74, 85, 78, 72, 72, 'LB'],
    ['Marcus Rashford', 'Barcelona', 'ENG', 'LW', 83, 88, 80, 77, 82, 40, 72, 'RA PS'],
    ['Alexander Sørloth', 'Atlético Madrid', 'NOR', 'ST', 83, 76, 84, 66, 74, 40, 85, 'PH'],
    // ---------------- Serie A (30) ----------------
    ['Lautaro Martínez', 'Inter', 'ARG', 'ST', 87, 80, 87, 73, 84, 48, 80, 'AC FS'],
    ['Kevin De Bruyne', 'Napoli', 'BEL', 'CAM', 87, 66, 86, 92, 84, 60, 72, 'IP PP DB'],
    ['Nicolò Barella', 'Inter', 'ITA', 'CM', 87, 78, 76, 85, 85, 76, 78, 'RE'],
    ['Alessandro Bastoni', 'Inter', 'ITA', 'CB', 86, 71, 54, 78, 75, 85, 81, 'AN LB'],
    ['Mike Maignan', 'AC Milan', 'FRA', 'GK', 87, 86, 82, 88, 88, 52, 84, 'FW'],
    ['Hakan Çalhanoğlu', 'Inter', 'TUR', 'CDM', 86, 64, 82, 87, 81, 77, 72, 'DB LB'],
    ['Rafael Leão', 'AC Milan', 'POR', 'LW', 86, 93, 80, 76, 87, 30, 77, 'RA TR'],
    ['Scott McTominay', 'Napoli', 'SCO', 'CM', 86, 74, 82, 76, 78, 75, 84, 'PH RE'],
    ['Marcus Thuram', 'Inter', 'FRA', 'ST', 85, 85, 82, 74, 82, 40, 84, 'BR'],
    ['Federico Dimarco', 'Inter', 'ITA', 'LB', 86, 79, 77, 86, 81, 77, 73, 'WP DB'],
    ['Yann Sommer', 'Inter', 'SUI', 'GK', 85, 84, 82, 80, 86, 48, 82, 'FW'],
    ['Christian Pulisic', 'AC Milan', 'USA', 'RW', 85, 85, 81, 80, 86, 45, 66, 'FS'],
    ['Luka Modrić', 'AC Milan', 'CRO', 'CM', 85, 68, 74, 88, 86, 70, 66, 'TT IP TV'],
    ['Kenan Yıldız', 'Juventus', 'TUR', 'LW', 85, 84, 80, 80, 87, 40, 66, 'TR'],
    ['Gleison Bremer', 'Juventus', 'BRA', 'CB', 86, 79, 41, 59, 67, 88, 87, 'BR'],
    ['Ademola Lookman', 'Atalanta', 'NGA', 'LW', 85, 88, 82, 76, 86, 40, 66, 'FS'],
    ['Alessandro Buongiorno', 'Napoli', 'ITA', 'CB', 84, 72, 40, 62, 64, 85, 84, 'SL'],
    ['Stanislav Lobotka', 'Napoli', 'SVK', 'CDM', 84, 66, 62, 84, 86, 76, 70, 'TT'],
    ['Dušan Vlahović', 'Juventus', 'SRB', 'ST', 84, 80, 85, 68, 78, 40, 84, 'PS'],
    ['Charles De Ketelaere', 'Atalanta', 'BEL', 'CAM', 84, 76, 80, 82, 84, 50, 72, 'IP'],
    ['Paulo Dybala', 'Roma', 'ARG', 'CAM', 84, 74, 84, 84, 87, 40, 58, 'FS DB'],
    ['Mile Svilar', 'Roma', 'SRB', 'GK', 84, 84, 80, 78, 85, 48, 82, 'FR'],
    ['Adrien Rabiot', 'AC Milan', 'FRA', 'CM', 84, 74, 76, 80, 80, 77, 82, 'RE'],
    ['Jonathan David', 'Juventus', 'CAN', 'ST', 84, 87, 84, 72, 82, 38, 70, 'FT'],
    ['Romelu Lukaku', 'Napoli', 'BEL', 'ST', 83, 76, 84, 72, 76, 35, 87, 'BR'],
    ['Nico Paz', 'Como', 'ARG', 'CAM', 83, 76, 80, 82, 85, 40, 68, 'FS'],
    ['Teun Koopmeiners', 'Juventus', 'NED', 'CM', 83, 66, 82, 82, 80, 70, 78, 'PS'],
    ['Manuel Locatelli', 'Juventus', 'ITA', 'CDM', 83, 60, 72, 82, 78, 78, 76, 'LB'],
    ['Rasmus Højlund', 'Napoli', 'DEN', 'ST', 82, 86, 80, 64, 76, 35, 80, 'RA'],
    ['Mattia Zaccagni', 'Lazio', 'ITA', 'LW', 82, 84, 78, 78, 84, 35, 66, 'FS'],
    // ---------------- Bundesliga (24) ----------------
    ['Harry Kane', 'Bayern', 'ENG', 'ST', 90, 68, 93, 85, 83, 47, 82, 'PS DB LB'],
    ['Jamal Musiala', 'Bayern', 'GER', 'CAM', 87, 82, 81, 80, 91, 59, 61, 'TE TR'],
    ['Joshua Kimmich', 'Bayern', 'GER', 'CDM', 88, 70, 74, 89, 84, 81, 74, 'PP LB'],
    ['Michael Olise', 'Bayern', 'FRA', 'RW', 90, 90, 88, 92, 91, 42, 66, 'FS WP'],
    ['Gregor Kobel', 'Dortmund', 'SUI', 'GK', 87, 85, 84, 80, 88, 50, 84, 'FR'],
    ['Manuel Neuer', 'Bayern', 'GER', 'GK', 86, 84, 85, 90, 86, 55, 86, 'FW'],
    ['Luis Díaz', 'Bayern', 'COL', 'LW', 88, 92, 82, 81, 90, 47, 72, 'QS TR'],
    ['Serhou Guirassy', 'Dortmund', 'GUI', 'ST', 86, 80, 88, 66, 80, 42, 84, 'PS PH'],
    ['Alejandro Grimaldo', 'Leverkusen', 'ESP', 'LB', 85, 82, 76, 86, 84, 74, 66, 'WP DB'],
    ['Dayot Upamecano', 'Bayern', 'FRA', 'CB', 87, 82, 47, 67, 72, 87, 87, 'BR'],
    ['Jonathan Tah', 'Bayern', 'GER', 'CB', 87, 72, 47, 67, 66, 88, 87, 'AN'],
    ['Nico Schlotterbeck', 'Dortmund', 'GER', 'CB', 87, 78, 57, 74, 72, 87, 84, 'LB'],
    ['Alphonso Davies', 'Bayern', 'CAN', 'LB', 84, 94, 62, 74, 82, 76, 78, 'RA'],
    ['Julian Brandt', 'Dortmund', 'GER', 'CAM', 83, 72, 78, 84, 84, 45, 62, 'IP'],
    ['Serge Gnabry', 'Bayern', 'GER', 'RW', 83, 86, 80, 77, 84, 40, 70, 'FS'],
    ['Konrad Laimer', 'Bayern', 'AUT', 'RB', 83, 82, 66, 74, 78, 80, 80, 'RE PR'],
    ['Patrik Schick', 'Leverkusen', 'CZE', 'ST', 83, 72, 85, 66, 77, 30, 80, 'PH'],
    ['Exequiel Palacios', 'Leverkusen', 'ARG', 'CM', 83, 66, 72, 82, 82, 77, 76, 'TT'],
    ['Angelo Stiller', 'Stuttgart', 'GER', 'CDM', 83, 64, 70, 84, 80, 76, 72, 'LB'],
    ['Karim Adeyemi', 'Dortmund', 'GER', 'LW', 82, 94, 78, 70, 80, 30, 66, 'RA'],
    ['Christoph Baumgartner', 'RB Leipzig', 'AUT', 'CAM', 82, 76, 79, 78, 80, 55, 74, 'AC'],
    ['David Raum', 'RB Leipzig', 'GER', 'LB', 82, 84, 66, 80, 78, 74, 72, 'WP'],
    ['Felix Nmecha', 'Dortmund', 'GER', 'CM', 82, 74, 74, 79, 82, 72, 78, 'TE'],
    ['Deniz Undav', 'Stuttgart', 'GER', 'ST', 82, 74, 83, 74, 80, 35, 74, 'FS'],
    // ---------------- Ligue 1 (22) ----------------
    ['Ousmane Dembélé', 'PSG', 'FRA', 'RW', 90, 92, 86, 84, 90, 40, 66, 'TR FS TV'],
    ['Achraf Hakimi', 'PSG', 'MAR', 'RB', 88, 91, 74, 82, 82, 78, 79, 'RA RE'],
    ['Vitinha', 'PSG', 'POR', 'CM', 90, 75, 79, 90, 90, 73, 67, 'TT PP'],
    ['Khvicha Kvaratskhelia', 'PSG', 'GEO', 'LW', 89, 87, 83, 82, 91, 41, 71, 'TR TE'],
    ['Marquinhos', 'PSG', 'BRA', 'CB', 87, 74, 55, 72, 74, 88, 79, 'AN'],
    ['João Neves', 'PSG', 'POR', 'CM', 88, 81, 73, 85, 88, 79, 73, 'PR TT'],
    ['Nuno Mendes', 'PSG', 'POR', 'LB', 89, 94, 68, 81, 86, 84, 82, 'RA'],
    ['Désiré Doué', 'PSG', 'FRA', 'RW', 86, 86, 80, 80, 88, 45, 66, 'TE'],
    ['Willian Pacho', 'PSG', 'ECU', 'CB', 89, 84, 44, 68, 70, 90, 88, 'BR'],
    ['Fabián Ruiz', 'PSG', 'ESP', 'CM', 86, 67, 79, 87, 85, 73, 73, 'LB'],
    ['Lucas Chevalier', 'PSG', 'FRA', 'GK', 85, 85, 80, 80, 86, 48, 82, 'FR'],
    ['Bradley Barcola', 'Liverpool', 'FRA', 'LW', 84, 93, 76, 74, 84, 30, 66, 'RA'],
    ['Mason Greenwood', 'Marseille', 'ENG', 'RW', 84, 82, 85, 78, 83, 35, 70, 'FS PS'],
    ['Geronimo Rulli', 'Marseille', 'ARG', 'GK', 83, 82, 80, 80, 84, 45, 80, 'FW'],
    ['Pierre-Emerick Aubameyang', 'Marseille', 'GAB', 'ST', 82, 86, 82, 68, 78, 30, 70, 'QS'],
    ['Gonçalo Ramos', 'AC Milan', 'POR', 'ST', 82, 78, 82, 66, 78, 40, 76, 'AC'],
    ['Leonardo Balerdi', 'Marseille', 'ARG', 'CB', 82, 70, 40, 60, 62, 82, 80, 'BR'],
    ['Brice Samba', 'Rennes', 'FRA', 'GK', 82, 82, 78, 76, 84, 45, 80, 'FR'],
    ['Corentin Tolisso', 'Lyon', 'FRA', 'CM', 81, 64, 76, 80, 78, 72, 76, 'LB'],
    ['Malick Fofana', 'Lyon', 'BEL', 'LW', 81, 88, 74, 72, 82, 30, 60, 'RA'],
    ['Lamine Camara', 'Monaco', 'SEN', 'CDM', 81, 72, 70, 78, 80, 76, 76, 'IN'],
    ['Aleksandr Golovin', 'Monaco', 'RUS', 'CAM', 81, 72, 76, 82, 84, 50, 66, 'TE'],
  ];

  /* ---------------------------------------------------------------------------
   * JODIO's 150 (added in v3). Same compact format, except `pos` may list
   * alternate positions ("CAM/RW"): the first is the card's position, the rest
   * are extra positions where it earns chemistry. Ratings and positions are
   * exactly as requested; face stats are hand-estimated in FUTBIN style
   * (FUTBIN blocks automated lookups). A name already in TOP150 is updated in
   * place (same id, so saves and SBC rewards keep working); new names are
   * appended as p151+.
   * ------------------------------------------------------------------------- */
  const ADDED150 = [
    // ---------------- 84 ----------------
    ['Phil Foden', 'Man City', 'ENG', 'CAM/RW', 84, 80, 81, 83, 87, 52, 60, 'TE FS'],
    ['Bernardo Silva', 'Man City', 'POR', 'CM/RW', 84, 72, 74, 84, 88, 66, 67, 'TT RE'],
    ['Trent Alexander-Arnold', 'Real Madrid', 'ENG', 'RB', 84, 74, 72, 89, 79, 74, 70, 'PP WP DB'],
    ['Martín Zubimendi', 'Arsenal', 'ESP', 'CDM', 84, 64, 64, 80, 79, 82, 76, 'IN TT'],
    ['Aleix García', 'Leverkusen', 'ESP', 'CM', 84, 62, 70, 85, 81, 72, 68, 'PP LB'],
    ['Nico Paz', 'Como', 'ARG', 'CAM', 84, 74, 80, 82, 84, 40, 68, 'FS'],
    ['Yann Sommer', 'Inter', 'SUI', 'GK', 84, 83, 81, 80, 86, 50, 84, 'FW'],
    ['Oliver Baumann', 'Hoffenheim', 'GER', 'GK', 84, 84, 82, 76, 85, 47, 84, 'FR'],
    ['Wladimiro Falcone', 'Lecce', 'ITA', 'GK', 84, 85, 80, 72, 86, 52, 82, 'FW'],
    ['Kingsley Coman', 'Al Nassr', 'FRA', 'LM/LW', 84, 90, 75, 77, 86, 32, 62, 'RA QS'],
    ['Jack Grealish', 'Man City', 'ENG', 'LW/LM', 84, 76, 72, 82, 87, 45, 67, 'TE PR'],
    ['Lucas Paquetá', 'West Ham', 'BRA', 'CAM/CM', 84, 72, 77, 82, 85, 62, 75, 'TR TE'],
    ['Serge Gnabry', 'Bayern', 'GER', 'RM/RW', 84, 84, 82, 78, 85, 42, 70, 'FS'],
    ['Manuel Locatelli', 'Juventus', 'ITA', 'CDM/CM', 84, 60, 72, 82, 79, 80, 77, 'LB IN'],
    ['Thomas Partey', 'Villarreal', 'GHA', 'CDM/CM', 84, 70, 74, 79, 80, 80, 82, 'BR'],
    ['James Maddison', 'Tottenham', 'ENG', 'CAM', 84, 72, 80, 86, 83, 52, 64, 'DB IP'],
    ['Reece James', 'Chelsea', 'ENG', 'RB', 84, 78, 72, 82, 79, 80, 83, 'WP'],
    ['Pierre-Emile Højbjerg', 'Marseille', 'DEN', 'CDM', 84, 62, 73, 79, 76, 81, 82, 'IN RE'],
    ['Benjamin Pavard', 'Inter', 'FRA', 'CB/RB', 84, 70, 60, 70, 72, 84, 78, 'AN'],
    ['Gianluca Mancini', 'Roma', 'ITA', 'CB', 84, 66, 50, 62, 66, 85, 83, 'BR PH'],
    // ---------------- 83 ----------------
    ['Casemiro', 'Man Utd', 'BRA', 'CDM', 83, 50, 72, 74, 70, 84, 85, 'BR IN'],
    ['Denzel Dumfries', 'Inter', 'NED', 'RB/RWB', 83, 86, 70, 72, 75, 77, 84, 'RE'],
    ['Matthias Ginter', 'Freiburg', 'GER', 'CB', 83, 60, 52, 68, 64, 84, 80, 'AN'],
    ['Jarrod Bowen', 'West Ham', 'ENG', 'RM/RW', 83, 84, 81, 76, 82, 45, 75, 'FS'],
    ['Amir Rrahmani', 'Napoli', 'KVX', 'CB', 83, 58, 40, 60, 60, 84, 82, 'BR'],
    ['Ivan Toney', 'Al Ahli', 'ENG', 'ST', 83, 70, 84, 72, 77, 40, 82, 'PS DB'],
    ['Stanislav Lobotka', 'Napoli', 'SVK', 'CM/CDM', 83, 70, 60, 81, 86, 74, 67, 'TT PR'],
    ['Eric García', 'Barcelona', 'ESP', 'CB/RB', 83, 64, 55, 74, 72, 82, 74, 'PP'],
    ['Nicolas Jackson', 'Chelsea', 'SEN', 'ST', 83, 88, 80, 68, 80, 35, 76, 'RA'],
    ['Lisandro Martínez', 'Man Utd', 'ARG', 'CB', 83, 70, 52, 74, 74, 84, 80, 'BR LB'],
    ['John Stones', 'Man City', 'ENG', 'CB/CDM', 83, 66, 55, 75, 74, 82, 76, 'PP'],
    ['Mateo Kovačić', 'Man City', 'CRO', 'CM', 83, 70, 70, 82, 87, 70, 72, 'PR TE'],
    ['Marcos Llorente', 'Atlético Madrid', 'ESP', 'RB/RM', 83, 86, 76, 77, 79, 70, 84, 'RE'],
    ['Alejandro Grimaldo', 'Leverkusen', 'ESP', 'LB/LWB', 83, 80, 72, 85, 83, 72, 64, 'DB WP'],
    ['Gabriel Martinelli', 'Al Hilal', 'BRA', 'LW', 83, 90, 78, 74, 85, 42, 70, 'RA'],
    ['Christian Pulisic', 'AC Milan', 'USA', 'RW/LW', 83, 84, 80, 78, 85, 40, 64, 'QS'],
    ['Jeremie Frimpong', 'Liverpool', 'NED', 'RB/RWB', 83, 94, 70, 75, 84, 70, 62, 'RA'],
    ['Nahuel Molina', 'Atlético Madrid', 'ARG', 'RB', 83, 82, 66, 76, 77, 78, 75, 'RE'],
    ['Manuel Akanji', 'Man City', 'SUI', 'CB', 83, 75, 50, 70, 70, 84, 80, 'AN'],
    ['Ibrahima Konaté', 'Liverpool', 'FRA', 'CB', 83, 82, 42, 58, 66, 84, 87, 'BR'],
    ['Takefusa Kubo', 'Real Sociedad', 'JPN', 'RW', 83, 84, 76, 79, 87, 40, 60, 'TE'],
    ['Bryan Mbeumo', 'Man Utd', 'CMR', 'RW/ST', 83, 84, 82, 79, 84, 40, 68, 'FS'],
    ['Ollie Watkins', 'Aston Villa', 'ENG', 'ST', 83, 85, 83, 72, 80, 44, 76, 'QS'],
    ['Douglas Luiz', 'Juventus', 'BRA', 'CM/CDM', 83, 68, 76, 81, 82, 74, 76, 'DB'],
    ['David Raya', 'Arsenal', 'ESP', 'GK', 83, 82, 79, 87, 85, 52, 82, 'FR'],
    // ---------------- 82 ----------------
    ['João Palhinha', 'Bayern', 'POR', 'CDM', 82, 58, 65, 72, 70, 85, 85, 'AN BR'],
    ['José María Giménez', 'Atlético Madrid', 'URU', 'CB', 82, 66, 48, 58, 60, 84, 84, 'PH'],
    ['Ricardo Horta', 'Braga', 'POR', 'CAM/LW', 82, 78, 80, 80, 84, 40, 62, 'FS'],
    ['Oihan Sancet', 'Athletic Club', 'ESP', 'CAM', 82, 74, 80, 79, 83, 50, 74, 'TE'],
    ['Stefan de Vrij', 'Inter', 'NED', 'CB', 82, 58, 50, 68, 64, 84, 77, 'AN'],
    ['Luis Suárez', 'Inter Miami', 'URU', 'ST', 82, 62, 85, 78, 80, 40, 77, 'FS AC'],
    ['Christos Tzolis', 'Club Brugge', 'GRE', 'LW', 82, 88, 80, 74, 84, 30, 62, 'RA'],
    ['Péter Gulácsi', 'RB Leipzig', 'HUN', 'GK', 82, 80, 81, 74, 84, 45, 82, ''],
    ['Yassine Bounou', 'Al Hilal', 'MAR', 'GK', 82, 84, 79, 76, 84, 50, 81, 'FW'],
    ['Conor Gallagher', 'Atlético Madrid', 'ENG', 'CM', 82, 74, 74, 78, 79, 76, 80, 'RE'],
    ['Harvey Elliott', 'Liverpool', 'ENG', 'CAM/RW', 82, 76, 76, 81, 85, 50, 60, 'TE'],
    ['Anthony Gordon', 'Barcelona', 'ENG', 'LW', 82, 90, 77, 74, 83, 45, 70, 'RA'],
    ['Serhou Guirassy', 'Dortmund', 'GUI', 'ST', 82, 78, 85, 64, 76, 40, 82, 'PS'],
    ['Jean-Clair Todibo', 'West Ham', 'FRA', 'CB', 82, 74, 40, 66, 70, 82, 80, 'AN'],
    ['Álex Remiro', 'Real Sociedad', 'ESP', 'GK', 82, 82, 79, 74, 84, 48, 82, ''],
    ['Robin Le Normand', 'Atlético Madrid', 'ESP', 'CB', 82, 62, 45, 60, 62, 83, 82, 'PH'],
    ['Jonathan David', 'Lille', 'CAN', 'ST', 82, 83, 83, 72, 81, 38, 70, 'QS'],
    ['Teun Koopmeiners', 'Juventus', 'NED', 'CM/CAM', 82, 66, 80, 81, 79, 70, 76, 'PS DB'],
    ['Morgan Gibbs-White', 'Nottm Forest', 'ENG', 'CAM', 82, 76, 76, 81, 83, 50, 70, 'IP'],
    ['Dominic Solanke', 'Tottenham', 'ENG', 'ST', 82, 76, 82, 72, 79, 42, 78, 'FS'],
    ['Pierre-Emerick Aubameyang', 'Marseille', 'GAB', 'ST', 82, 86, 83, 70, 78, 32, 70, 'QS'],
    ['Hirving Lozano', 'San Diego FC', 'MEX', 'RW', 82, 88, 78, 75, 83, 35, 64, 'QS'],
    ['Samuel Chukwueze', 'AC Milan', 'NGA', 'RW', 82, 89, 74, 72, 84, 30, 60, 'TR'],
    ['Youri Tielemans', 'Aston Villa', 'BEL', 'CM', 82, 62, 77, 83, 79, 68, 70, 'LB DB'],
    ['Pau Torres', 'Aston Villa', 'ESP', 'CB', 82, 64, 50, 74, 70, 82, 75, 'LB'],
    ['Kieran Trippier', 'Newcastle', 'ENG', 'RB', 82, 64, 66, 85, 76, 76, 70, 'WP DB'],
    ['Wilfried Zaha', 'Lyon', 'CIV', 'LW', 82, 84, 76, 72, 86, 38, 72, 'TR'],
    ['Nicolas Pépé', 'Villarreal', 'CIV', 'RM/RW', 82, 84, 78, 76, 84, 36, 66, 'FS'],
    ['Naby Keïta', 'Werder Bremen', 'GUI', 'CM', 82, 74, 72, 79, 85, 64, 68, 'TE'],
    ['Neto', 'Arsenal', 'BRA', 'GK', 82, 80, 79, 76, 83, 46, 81, ''],
    // ---------------- 81 ----------------
    ['Moussa Niakhaté', 'Lyon', 'SEN', 'CB', 81, 70, 42, 58, 62, 82, 83, 'BR'],
    ['Édouard Mendy', 'Al Ahli', 'SEN', 'GK', 81, 82, 78, 72, 82, 46, 80, 'FR'],
    ['Ismaël Koné', 'Marseille', 'CAN', 'CM', 81, 74, 70, 77, 80, 72, 80, 'RE'],
    ['Kaoru Mitoma', 'Brighton', 'JPN', 'LM/LW', 81, 87, 75, 74, 86, 40, 62, 'TR QS'],
    ['Remo Freuler', 'Bologna', 'SUI', 'CDM/CM', 81, 62, 70, 78, 76, 78, 78, 'RE'],
    ['Ivan Perišić', 'PSV', 'CRO', 'LW/LB', 81, 74, 78, 80, 78, 66, 76, 'WP'],
    ['Rui Silva', 'Real Betis', 'POR', 'GK', 81, 80, 78, 75, 83, 47, 80, ''],
    ['Galeno', 'Porto', 'BRA', 'LM/LW', 81, 87, 80, 74, 82, 35, 68, 'PS'],
    ['Alejandro Garnacho', 'Man Utd', 'ARG', 'LW/RW', 81, 88, 76, 72, 84, 34, 64, 'RA'],
    ['Kobbie Mainoo', 'Man Utd', 'ENG', 'CM/CDM', 81, 70, 70, 78, 83, 72, 72, 'PR'],
    ['Savinho', 'Tottenham', 'BRA', 'RW/LW', 81, 89, 70, 75, 86, 30, 55, 'TR'],
    ['Josip Stanišić', 'Bayern', 'CRO', 'RB/CB', 81, 74, 54, 70, 72, 80, 79, 'AN'],
    ['Pedro Neto', 'Chelsea', 'POR', 'RW/LW', 81, 90, 72, 78, 84, 38, 62, 'RA WP'],
    ['Riccardo Calafiori', 'Arsenal', 'ITA', 'LB/CB', 81, 74, 58, 74, 76, 80, 79, 'AN'],
    ['Joshua Zirkzee', 'Man Utd', 'NED', 'ST', 81, 70, 79, 77, 83, 40, 76, 'FT'],
    ['Ademola Lookman', 'Atalanta', 'NGA', 'ST/LM', 81, 86, 80, 74, 84, 35, 64, 'FS'],
    ['Éderson', 'Atalanta', 'BRA', 'CM/CDM', 81, 72, 70, 76, 79, 76, 82, 'BR'],
    ['Evan Ndicka', 'Roma', 'CIV', 'CB', 81, 74, 40, 60, 64, 81, 80, 'AN'],
    ['Arthur Theate', 'Frankfurt', 'BEL', 'CB/LB', 81, 72, 50, 66, 68, 80, 80, 'BR'],
    ['Bradley Barcola', 'Liverpool', 'FRA', 'LW/RW', 81, 90, 75, 72, 82, 30, 64, 'RA'],
    ['João Neves', 'PSG', 'POR', 'CM/CDM', 88, 81, 75, 86, 90, 81, 73, 'TT RE'],
    ['Lucas Beraldo', 'PSG', 'BRA', 'CB', 81, 70, 42, 66, 66, 81, 78, 'IN'],
    ['Samu Omorodion', 'Porto', 'ESP', 'ST', 81, 82, 80, 58, 74, 36, 85, 'PH'],
    ['Oscar Bobb', 'Man City', 'NOR', 'RW', 81, 84, 72, 75, 85, 35, 55, 'TE'],
    ['Rico Lewis', 'Man City', 'ENG', 'RB/CDM', 81, 76, 60, 77, 80, 74, 64, 'TT'],
    ['Conor Bradley', 'Liverpool', 'NIR', 'RB', 81, 84, 60, 72, 75, 76, 72, 'RE'],
    ['Harvey Barnes', 'Newcastle', 'ENG', 'LW', 81, 85, 80, 72, 80, 38, 66, 'FS'],
    ['Jacob Murphy', 'Newcastle', 'ENG', 'RM', 81, 82, 75, 77, 79, 50, 70, 'WP'],
    ['Sean Longstaff', 'Newcastle', 'ENG', 'CM', 81, 66, 70, 76, 74, 72, 76, 'RE'],
    ['Emile Smith Rowe', 'Fulham', 'ENG', 'CAM', 81, 76, 76, 78, 83, 45, 62, 'TE'],
    ['Alex Iwobi', 'Fulham', 'NGA', 'CM/LM', 81, 76, 72, 78, 82, 58, 72, 'RE'],
    ['Andreas Pereira', 'Fulham', 'BRA', 'CAM', 81, 70, 75, 81, 80, 55, 64, 'DB'],
    ['Rodrigo Muniz', 'Fulham', 'BRA', 'ST', 81, 74, 81, 60, 74, 38, 80, 'PH'],
    ['Vitaliy Mykolenko', 'Everton', 'UKR', 'LB', 81, 78, 50, 68, 72, 79, 77, 'JO'],
    ['James Tarkowski', 'Everton', 'ENG', 'CB', 81, 52, 45, 60, 56, 83, 84, 'PH BR'],
    // ---------------- 80 to 75 ----------------
    ['Robin Koch', 'Frankfurt', 'GER', 'CB', 80, 64, 46, 62, 62, 81, 80, 'AN'],
    ['Marc Guéhi', 'Crystal Palace', 'ENG', 'CB', 80, 72, 40, 62, 66, 81, 78, 'AN'],
    ['Adam Wharton', 'Crystal Palace', 'ENG', 'CDM/CM', 80, 64, 62, 80, 77, 72, 68, 'PP'],
    ['Tyrick Mitchell', 'Crystal Palace', 'ENG', 'LB', 80, 80, 50, 70, 74, 76, 76, 'RE'],
    ['Jean-Philippe Mateta', 'Crystal Palace', 'FRA', 'ST', 80, 74, 80, 60, 72, 40, 84, 'PH'],
    ['Jarell Quansah', 'Liverpool', 'ENG', 'CB', 80, 70, 35, 58, 60, 80, 80, 'BR'],
    ['Curtis Jones', 'Liverpool', 'ENG', 'CM', 80, 68, 70, 78, 82, 68, 72, 'PR'],
    ['Malo Gusto', 'Chelsea', 'FRA', 'RB', 80, 84, 56, 72, 76, 74, 70, 'RE'],
    ['Noni Madueke', 'Chelsea', 'ENG', 'RW', 80, 88, 74, 70, 82, 32, 64, 'QS'],
    ['Levi Colwill', 'Chelsea', 'ENG', 'CB/LB', 80, 72, 45, 70, 70, 80, 77, 'LB'],
    ['Roméo Lavia', 'Chelsea', 'BEL', 'CDM', 80, 66, 60, 76, 78, 77, 72, 'IN'],
    ['Amad Diallo', 'Man Utd', 'CIV', 'RM/RW', 80, 85, 74, 74, 84, 35, 58, 'TE'],
    ['Noussair Mazraoui', 'Man Utd', 'MAR', 'RB/LB', 80, 76, 58, 74, 77, 77, 70, 'TT'],
    ['Manuel Ugarte', 'Man Utd', 'URU', 'CDM', 80, 70, 52, 68, 72, 80, 79, 'IN BR'],
    ['Fermín López', 'Barcelona', 'ESP', 'CM/CAM', 80, 76, 78, 76, 80, 55, 70, 'FS'],
    ['Marc Casadó', 'Barcelona', 'ESP', 'CDM', 80, 66, 58, 76, 75, 77, 72, 'TT'],
    ['Pau Cubarsí', 'Barcelona', 'ESP', 'CB', 86, 74, 41, 78, 76, 87, 78, 'PP AN'],
    ['Arda Güler', 'Real Madrid', 'TUR', 'CAM/RW', 80, 74, 77, 81, 84, 35, 52, 'DB FS'],
    ['Endrick', 'Real Madrid', 'BRA', 'ST', 80, 86, 80, 66, 80, 30, 74, 'PS'],
    ['Fran García', 'Real Madrid', 'ESP', 'LB', 80, 86, 56, 72, 78, 74, 68, 'RE'],
    ['Brahim Díaz', 'Real Madrid', 'MAR', 'CAM/RW', 80, 82, 72, 75, 86, 30, 55, 'TE TR'],
    ['Jamie Gittens', 'Dortmund', 'ENG', 'LW/RW', 79, 90, 72, 68, 84, 28, 55, 'RA'],
    ['Karim Adeyemi', 'Dortmund', 'GER', 'LM/ST', 79, 94, 74, 68, 78, 30, 64, 'RA'],
    ['Yan Couto', 'Dortmund', 'BRA', 'RB/RM', 79, 82, 60, 74, 79, 70, 62, 'WP'],
    ['Maximilian Beier', 'Dortmund', 'GER', 'ST', 79, 86, 77, 66, 76, 38, 70, 'QS'],
    ['Kenan Yıldız', 'Juventus', 'TUR', 'CAM/LW', 79, 80, 75, 75, 82, 30, 64, 'FS'],
    ['Matías Soulé', 'Roma', 'ARG', 'RW/CAM', 79, 78, 76, 76, 82, 35, 58, 'TV'],
    ['Santiago Giménez', 'Feyenoord', 'MEX', 'ST', 79, 74, 81, 62, 74, 35, 78, 'PH'],
    ['Johan Bakayoko', 'PSV', 'BEL', 'RW', 79, 86, 74, 72, 83, 30, 60, 'TR'],
    ['Brian Brobbey', 'Ajax', 'NED', 'ST', 79, 80, 78, 58, 74, 34, 88, 'PR'],
    ['Jorrel Hato', 'Ajax', 'NED', 'CB/LB', 78, 76, 42, 68, 70, 77, 74, 'JO'],
    ['Archie Gray', 'Tottenham', 'ENG', 'RB/CM', 78, 72, 55, 72, 74, 74, 72, 'RE'],
    ['Lucas Bergvall', 'Tottenham', 'SWE', 'CM', 78, 72, 68, 75, 78, 62, 70, 'TE'],
    ['Wilson Odobert', 'Tottenham', 'FRA', 'LW/RW', 78, 84, 70, 68, 80, 30, 62, 'TR'],
    ['Liam Delap', 'Ipswich', 'ENG', 'ST', 77, 80, 77, 55, 70, 35, 82, 'PS'],
    ['Omari Hutchinson', 'Ipswich', 'ENG', 'CAM/RM', 77, 82, 70, 70, 81, 30, 55, 'TE'],
    ['Morgan Rogers', 'Chelsea', 'ENG', 'CAM/LW', 77, 80, 72, 72, 79, 40, 76, 'PR'],
    ['Jhon Durán', 'Aston Villa', 'COL', 'ST', 77, 78, 78, 55, 70, 30, 82, 'PS'],
    ['Ethan Nwaneri', 'Arsenal', 'ENG', 'CAM', 75, 74, 70, 72, 79, 35, 55, 'TE'],
    ['Myles Lewis-Skelly', 'Arsenal', 'ENG', 'LB/CM', 75, 74, 50, 68, 74, 70, 68, ''],
    // ---------------- Legends of the modern game (v84) ----------------
    ['Lionel Messi', 'Inter Miami', 'ARG', 'RW/CAM', 89, 77, 89, 92, 96, 35, 65, 'FS TE'],
    ['Cristiano Ronaldo', 'Al Nassr', 'POR', 'ST', 86, 80, 90, 70, 80, 35, 80, 'PS PH'],
  ];

  /* ---------------------------------------------------------------------------
   * Position model. altPositions mirror FC's "alternate positions": a card gets
   * chemistry in any slot listed here.
   * ------------------------------------------------------------------------- */
  const ALT_POS = {
    GK: ['GK'], CB: ['CB'], LB: ['LB', 'LWB'], RB: ['RB', 'RWB'],
    CDM: ['CDM', 'CM'], CM: ['CM', 'CDM', 'CAM'], CAM: ['CAM', 'CM', 'CF'],
    LM: ['LM', 'LW'], RM: ['RM', 'RW'], LW: ['LW', 'LM'], RW: ['RW', 'RM'], ST: ['ST', 'CF'],
  };

  /* ---------------------------------------------------------------------------
   * Sub-stat expansion: each face stat fans out into its FC sub-attributes with
   * a seeded +/- spread. Position archetypes nudge certain sub-stats (e.g. CBs
   * get strength, wingers acceleration) so the engine has real differentiation.
   * ------------------------------------------------------------------------- */
  const SUB_MAP = {
    pac: ['acceleration', 'sprintSpeed'],
    sho: ['positioning', 'finishing', 'shotPower', 'longShots', 'volleys', 'penalties'],
    pas: ['vision', 'crossing', 'fkAccuracy', 'shortPassing', 'longPassing', 'curve'],
    dri: ['agility', 'balance', 'reactions', 'ballControl', 'dribbling', 'composure'],
    def: ['interceptions', 'headingAccuracy', 'defAwareness', 'standingTackle', 'slidingTackle'],
    phy: ['jumping', 'stamina', 'strength', 'aggression'],
  };
  const GK_SUB = { pac: 'gkDiving', sho: 'gkHandling', pas: 'gkKicking', dri: 'gkReflexes', def: 'speed', phy: 'gkPositioning' };
  const ARCHETYPE = {
    CB: { strength: 4, headingAccuracy: 4, agility: -5, balance: -3 },
    ST: { finishing: 3, positioning: 3, crossing: -6 },
    LW: { acceleration: 3, agility: 3, strength: -4 }, RW: { acceleration: 3, agility: 3, strength: -4 },
    CAM: { vision: 3, agility: 2, headingAccuracy: -6 }, CM: { stamina: 4, shortPassing: 2 },
    CDM: { interceptions: 3, stamina: 3, strength: 2 }, LB: { stamina: 4, crossing: 3 }, RB: { stamina: 4, crossing: 3 },
  };

  function expandSubStats(seedName, pos, face) {
    const r = rng(hashStr(seedName + '#sub'));
    const sub = {};
    if (pos === 'GK') {
      Object.keys(GK_SUB).forEach(k => { sub[GK_SUB[k]] = clamp(face[k] + Math.round((r() - 0.5) * 4), 20, 99); });
      // outfield-ish values the engine still reads (movement)
      sub.acceleration = clamp(face.def + Math.round((r() - 0.5) * 8), 25, 75);
      sub.sprintSpeed = clamp(face.def + Math.round((r() - 0.5) * 8), 25, 75);
      sub.agility = 55 + Math.round(r() * 15); sub.balance = 50 + Math.round(r() * 15);
      sub.reactions = clamp(face.dri - 2, 40, 99); sub.shortPassing = clamp(face.pas - 15, 30, 80);
      sub.longPassing = clamp(face.pas - 5, 30, 90); sub.strength = 60 + Math.round(r() * 25);
      sub.stamina = 40 + Math.round(r() * 20);
      // keepers still need every outfield key (the engine reads them when a GK carries the ball)
      Object.values(SUB_MAP).forEach(list => list.forEach(name => { if (sub[name] == null) sub[name] = 30 + Math.round(r() * 20); }));
      return sub;
    }
    Object.keys(SUB_MAP).forEach(k => {
      SUB_MAP[k].forEach(name => { sub[name] = face[k] + Math.round((r() - 0.5) * 10); });
    });
    const arch = ARCHETYPE[pos] || {};
    Object.keys(arch).forEach(k => { sub[k] += arch[k]; });
    // keep acceleration & sprint speed honest to the face PAC (FC formula ~45/55)
    const drift = Math.round((r() - 0.5) * 8);
    sub.acceleration = face.pac + drift; sub.sprintSpeed = face.pac - Math.round(drift * 0.8);
    Object.keys(sub).forEach(k => { sub[k] = clamp(sub[k], 20, 99); });
    return sub;
  }

  /* ---------------------------------------------------------------------------
   * Market valuation curve (coins). Exponential in rating, boosted by pace and
   * PlayStyles+ the way the real meta prices cards.
   * ------------------------------------------------------------------------- */
  function roundToIncrement(v) {
    if (v < 1000) return Math.max(150, Math.round(v / 50) * 50);
    if (v < 10000) return Math.round(v / 100) * 100;
    if (v < 50000) return Math.round(v / 250) * 250;
    if (v < 100000) return Math.round(v / 500) * 500;
    if (v < 1000000) return Math.round(v / 1000) * 1000;
    return Math.round(v / 10000) * 10000;
  }
  function valuation(rating, face, playStyles, pos, rare) {
    let base;
    if (rating < 65) base = 150 + (rating - 45) * 15;
    else if (rating < 75) base = 400 + (rating - 65) * 60;
    else base = 650 * Math.pow(1.42, rating - 75); // 75 -> 650, 83 -> ~10k, 88 -> ~62k, 91 -> ~180k
    if (rare) base *= 1.3;
    if (pos !== 'GK') base *= 1 + Math.max(0, face.pac - 80) * 0.03; // pace tax
    else base *= 0.6;                                               // keepers are cheaper
    base *= 1 + playStyles.filter(n => /\+$/.test(n)).length * 0.06;
    return roundToIncrement(base);
  }

  function rarityFor(rating) { return rating < 65 ? 'bronze' : rating < 75 ? 'silver' : 'gold'; }

  function buildCard(id, name, club, nation, posSpec, rating, f6, psCodes, generated, rare) {
    // "CAM/RW" -> position CAM, chemistry also in RW (and RW's usual partner slots)
    const posList = String(posSpec).split('/');
    const pos = posList[0];
    const alts = [];
    posList.forEach(p => (ALT_POS[p] || [p]).forEach(a => { if (!alts.includes(a)) alts.push(a); }));
    const face = { pac: f6[0], sho: f6[1], pas: f6[2], dri: f6[3], def: f6[4], phy: f6[5] };
    // v102: a player can also play the positions his stats suit (a winger on the other wing or as a CAM, a CM as a CAM or CDM, a full-back on the other side...)
    { const add = (...ps) => ps.forEach(x => { if (!alts.includes(x)) alts.push(x); }), wide = f6[3] >= 78, f = face;
      if (['LW', 'RW', 'LM', 'RM'].includes(pos)) { if (wide) add('LW', 'RW', 'LM', 'RM'); if (f.pas >= 76 && f.dri >= 80) add('CAM'); if (f.sho >= 82) add('ST', 'CF'); if (f.pas >= 75 && f.def >= 62) add('CM'); }
      else if (pos === 'CAM') { if (f.pas >= 74) add('CM'); if (f.pac >= 78 && f.dri >= 80) add('LW', 'RW', 'LM', 'RM'); if (f.sho >= 78) add('ST', 'CF'); }
      else if (pos === 'CF' || pos === 'ST') { if (f.pas >= 76 && f.dri >= 80) add('CAM'); if (f.pac >= 84 && f.dri >= 80) add('LW', 'RW'); if (f.pac >= 80 && f.dri >= 76) add('LM', 'RM'); }
      else if (pos === 'CM') { if (f.pas >= 78 && f.dri >= 76) add('CAM'); if (f.def >= 66) add('CDM'); if (f.pac >= 75 && f.dri >= 78) add('LM', 'RM'); }
      else if (pos === 'CDM') { add('CM'); if (f.def >= 78 && f.phy >= 75) add('CB'); }
      else if (['LB', 'RB', 'LWB', 'RWB'].includes(pos)) { if (f.def >= 66) add('LB', 'RB', 'LWB', 'RWB'); if (f.def >= 78 && f.phy >= 72) add('CB'); if (f.pac >= 80 && f.dri >= 70) add('LM', 'RM'); }
      else if (pos === 'CB') { if (f.pas >= 68 && f.def >= 78) add('CDM'); } }
    let codes = (psCodes || '').split(' ').filter(Boolean);
    // Rapid+ and Quick Step+ never together; neither on players under 87 unless they are truly quick (92+ pace); 88-91 pace gets at most one
    if (codes.includes('RA') && codes.includes('QS')) codes = codes.filter(c => c !== 'QS');
    if (rating < 87 && f6[0] < 92) codes = codes.filter(c => (c !== 'RA' && c !== 'QS') || f6[0] >= 88);
    const subS = expandSubStats(name + id, pos, face);
    const before = codes.length;
    codes = codes.filter(c => (c !== 'RA' || subS.sprintSpeed >= 88) && (c !== 'QS' || subS.acceleration >= 88));
    const psBroke = codes.length < before;   // Rapid+ needs 88+ sprint speed, Quick Step+ 88+ acceleration
    const psRaw = codes.length;
    if (pos === 'GK' && rating >= 86 && !codes.includes('FR') && !codes.includes('FW')) codes.push(hashStr(name + id) % 2 ? 'FW' : 'FR');   // top keepers always carry a keeper PlayStyle
    if (rating >= 75) codes = codes.slice(0, 1);                  // v157 (JODIO): a normal card carries one gold PlayStyle; only special cards (promo, evolved) carry 2 or more
    const golds = codes.map(c => PLAYSTYLES[c] ? PLAYSTYLES[c].name : c);
    let playStyles = golds.concat(silverFor(pos, subS, rating, new Set(golds.map(n => n.replace(/\+$/, ''))), name + id));   // v148: Silver PlayStyles from his attributes
    // v148: the ten newer styles reach gold on elite cards with a free gold slot (about 1 in 3 of the silvers they earn)
    const NEWG = ['Chip Shot', 'Gamechanger', 'Aerial Fortress', 'Block', 'Enforcer', 'Long Throw', '1v1 Close Down', 'Cross Claimer', 'Deflector', 'Far Throw'];
    if (rating >= 82 && golds.length < 1) playStyles = playStyles.map(n => (golds.length < 1 && NEWG.includes(n) && hashStr(name + id + n) % 3 === 0) ? (golds.push(n + '+'), n + '+') : n);
    playStyles = psExclusive(playStyles, []);
    return {
      id, name, club, league: CLUBS[club][0], nation, position: pos,
      altPositions: alts, rating, rarity: rarityFor(rating), rare: !!rare,
      face, sub: subS, playStyles, psRaw, psBroke,
      value: valuation(rating, face, playStyles, pos, rare), generated: !!generated,
      details: cardDetails(name + id, pos, face, rating),
    };
  }

  /** Extra card metadata (2x detail): skill moves, weak foot, work rates, height, foot, kit number, age. */
  function cardDetails(seed, pos, face, rating) {
    const r = rng(hashStr(seed + '#det'));
    const attacker = ['ST', 'LW', 'RW', 'CAM', 'LM', 'RM'].includes(pos);
    const sm = pos === 'GK' ? 1 : clamp(Math.round((face.dri - 55) / 9 + (attacker ? 0.5 : -0.5) + (r() - 0.5)), 1, 5);
    const wf = clamp(Math.round(2.5 + (rating - 75) / 10 + (r() - 0.5) * 2), 1, 5);
    const WR = ['Low', 'Med', 'High'];
    const att = pos === 'GK' ? 'Med' : WR[clamp(Math.round(attacker ? 1.6 + r() * 0.8 : r() * 2), 0, 2)];
    const def = pos === 'GK' ? 'Med' : WR[clamp(Math.round(['CB', 'CDM', 'LB', 'RB'].includes(pos) ? 1.6 + r() * 0.8 : r() * 1.6), 0, 2)];
    const base = { GK: 191, CB: 188, ST: 184, CDM: 182, CM: 178, CAM: 176 }[pos] || 177;
    const height = Math.round(base + (r() - 0.5) * 14 + (face.phy - 70) * 0.15);
    const nums = { GK: [1, 13], CB: [4, 5, 3, 15], LB: [3, 12], RB: [2, 22], CDM: [6, 16], CM: [8, 14], CAM: [10, 20], LM: [11], RM: [7], LW: [11, 7], RW: [7, 17], ST: [9, 19] }[pos] || [18];
    return {
      skillMoves: sm, weakFoot: wf, workRates: att + '/' + def, height, foot: r() < 0.22 ? 'Left' : 'Right',
      number: nums[Math.floor(r() * nums.length)], age: 19 + Math.floor(r() * 15),
    };
  }

  /* ---------------------------------------------------------------------------
   * Chemistry Styles: at 3 chem the targeted sub-stats get the full boost
   * (+8..+15); at 1-2 chem a proportional share; at 0 chem base stats stay.
   * ------------------------------------------------------------------------- */
  const CHEM_STYLES = {
    basic:    { name: 'Basic', icon: '◆', sub: { acceleration: 4, sprintSpeed: 4, finishing: 4, shortPassing: 4, dribbling: 4, standingTackle: 4, strength: 4 } },
    hunter:   { name: 'Hunter', icon: '◢', sub: { acceleration: 12, sprintSpeed: 12, finishing: 12, volleys: 12, shotPower: 8 } },
    finisher: { name: 'Finisher', icon: '◎', sub: { finishing: 15, shotPower: 12, positioning: 12, agility: 8, balance: 8 } },
    engine:   { name: 'Engine', icon: '⚙', sub: { acceleration: 8, stamina: 12, shortPassing: 8, balance: 12, dribbling: 8 } },
    hawk:     { name: 'Hawk', icon: '▲', sub: { acceleration: 8, sprintSpeed: 8, longShots: 12, shotPower: 12, jumping: 12, strength: 8 } },
    maestro:  { name: 'Maestro', icon: '♪', sub: { vision: 12, shortPassing: 12, longPassing: 12, curve: 8, dribbling: 8 } },
    shadow:   { name: 'Shadow', icon: '◑', sub: { acceleration: 12, sprintSpeed: 12, interceptions: 12, standingTackle: 15, slidingTackle: 15 } },
    anchor:   { name: 'Anchor', icon: '⚓', sub: { acceleration: 8, sprintSpeed: 8, defAwareness: 12, standingTackle: 12, strength: 12, jumping: 8 } },
    wall:     { name: 'Wall', icon: '▉', sub: { gkDiving: 12, gkHandling: 12, gkKicking: 8 } },
    cat:      { name: 'Cat', icon: '◐', sub: { gkReflexes: 15, speed: 12, gkPositioning: 8 } },
  };
  function applyChemStyle(card, styleId, chem) {
    const st = CHEM_STYLES[styleId];
    if (!st || !chem) return card;
    const sub = Object.assign({}, card.sub);
    Object.entries(st.sub).forEach(([k, v]) => { if (sub[k] != null) sub[k] = clamp(sub[k] + Math.round(v * chem / 3), 1, 99); });
    const face = Object.assign({}, card.face);
    const avg = keys => Math.round(keys.reduce((a, k) => a + (sub[k] || 0), 0) / keys.length);
    if (card.position !== 'GK') {
      face.pac = avg(['acceleration', 'sprintSpeed']); face.sho = avg(['positioning', 'finishing', 'shotPower', 'longShots', 'volleys', 'penalties']);
      face.pas = avg(['vision', 'crossing', 'fkAccuracy', 'shortPassing', 'longPassing', 'curve']); face.dri = avg(['agility', 'balance', 'reactions', 'ballControl', 'dribbling', 'composure']);
      face.def = avg(['interceptions', 'headingAccuracy', 'defAwareness', 'standingTackle', 'slidingTackle']); face.phy = avg(['jumping', 'stamina', 'strength', 'aggression']);
      Object.keys(face).forEach(k => { face[k] = Math.max(card.face[k], face[k]); });
    }
    return Object.assign({}, card, { sub, face, chemStyle: styleId, chemApplied: chem });
  }

  /* ---------------------------------------------------------------------------
   * Signature stars: unique card aura, walkout sequence and goal celebration.
   * ------------------------------------------------------------------------- */
  const SIGNATURES = {
    'Kylian Mbappé':  { key: 'mbappe', aura: 'lightning', color: '#3cc8ff', celebration: 'CROSSED ARMS', walkout: 'KM ⚡ THE TORTOISE IS FAST', fx: 'bolts' },
    'Erling Haaland': { key: 'haaland', aura: 'zen', color: '#ffd84a', celebration: 'ZEN MEDITATION', walkout: 'THE TERMINATOR HAS ARRIVED', fx: 'aura' },
    'Mohamed Salah':  { key: 'salah', aura: 'pharaoh', color: '#ff4040', celebration: 'THE PHARAOH KNEELS', walkout: 'THE EGYPTIAN KING', fx: 'sand' },
    'Lamine Yamal':   { key: 'yamal', aura: 'stars', color: '#ff5ad8', celebration: '304 HANDS', walkout: 'A STAR IS BORN', fx: 'stars' },
    'Vinícius Jr.':   { key: 'vini', aura: 'samba', color: '#4cff7a', celebration: 'SAMBA DANCE', walkout: 'BAILA VINI BAILA', fx: 'confetti' },
    'Jude Bellingham':{ key: 'jude', aura: 'wings', color: '#ffffff', celebration: 'ARMS WIDE', walkout: 'HEY JUDE', fx: 'feathers' },
    'Cole Palmer':    { key: 'palmer', aura: 'frost', color: '#9fe8ff', celebration: 'COLD SHIVER', walkout: 'COLD PALMER', fx: 'frost' },
    'Lionel Messi':   { key: 'messi', aura: 'ballon', color: '#74acdf', celebration: 'LOOKS TO THE SKY', walkout: 'THE GOAT', fx: 'stars' },
    'Cristiano Ronaldo': { key: 'cr7', aura: 'crown', color: '#ff3a3a', celebration: 'SIUUUU', walkout: 'CR7 ARRIVES', fx: 'spiral' },
    'Harry Kane':     { key: 'kane', aura: 'crown', color: '#ffb000', celebration: 'THE HURRICANE', walkout: 'GOLDEN BOOT INCOMING', fx: 'spiral' },
    'Ousmane Dembélé':{ key: 'dembele', aura: 'ballon', color: '#e8c55a', celebration: 'BALLON D\'OR POSE', walkout: 'BALLON D\'OR WINNER', fx: 'stars' },
  };

  /* ---------------------------------------------------------------------------
   * Reserve pool generator: bronze/silver/common-gold players with plausible
   * names per nation. Fully deterministic (fixed seed) so IDs are stable.
   * ------------------------------------------------------------------------- */
  const NAME_POOLS = {
    ENG: ['Walker', 'Ashby', 'Harlow', 'Fenwick', 'Pryce', 'Dunmore', 'Keighley', 'Oakes', 'Rendell', 'Stroud'],
    ESP: ['Moreno', 'Ibarra', 'Castell', 'Rivas', 'Olmedo', 'Segura', 'Lozano', 'Nieto', 'Ferrer', 'Arenas'],
    ITA: ['Russo', 'Galli', 'Ferraro', 'Marchi', 'Bellotti', 'Conti', 'Vitale', 'Serra', 'Longo', 'Pace'],
    GER: ['Becker', 'Hoffmann', 'Krüger', 'Lang', 'Vogt', 'Seidel', 'Brandl', 'Hahn', 'Roth', 'Kessler'],
    FRA: ['Lefèvre', 'Moreau', 'Girard', 'Roux', 'Faure', 'Blanc', 'Garnier', 'Chevalier', 'Perrin', 'Marchand'],
    BRA: ['Souza', 'Oliveira', 'Pereira', 'Lima', 'Carvalho', 'Ribeiro', 'Almeida', 'Rocha', 'Teixeira', 'Barros'],
    NED: ['de Vries', 'Bakker', 'Visser', 'Smit', 'Mulder', 'de Boer', 'Bos', 'Vos', 'Kuipers', 'Jansen'],
    POR: ['Silva', 'Costa', 'Mendes', 'Ferreira', 'Gomes', 'Lopes', 'Marques', 'Pinto', 'Sousa', 'Neves'],
    ARG: ['Gómez', 'Paredes', 'Acosta', 'Benítez', 'Sosa', 'Ledesma', 'Ríos', 'Medina', 'Cabrera', 'Vera'],
  };
  const LEAGUE_NATIONS = {
    EPL: ['ENG', 'ENG', 'ENG', 'BRA', 'POR', 'NED', 'FRA', 'ESP', 'ARG'],
    LAL: ['ESP', 'ESP', 'ESP', 'ARG', 'BRA', 'FRA', 'POR'],
    SEA: ['ITA', 'ITA', 'ITA', 'ARG', 'BRA', 'NED', 'FRA'],
    BUN: ['GER', 'GER', 'GER', 'NED', 'FRA', 'POR', 'BRA'],
    L1: ['FRA', 'FRA', 'FRA', 'POR', 'BRA', 'ESP', 'ARG'],
  };
  const POS_WEIGHTS = ['GK', 'GK', 'CB', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'ST'];
  const INITIALS = 'ABCDEFGHIJKLMNOPRSTV';
  // Face profile per position (offsets from overall)
  const PROFILE = {
    GK: [0, -2, -6, 1, -35, -1], CB: [-8, -30, -18, -14, 2, 2], LB: [3, -25, -6, -6, -3, -6], RB: [3, -25, -6, -6, -3, -6],
    CDM: [-10, -12, -2, -4, 1, 1], CM: [-6, -6, 1, 0, -10, -4], CAM: [-2, -2, 1, 2, -30, -12],
    LM: [4, -5, -2, 1, -32, -12], RM: [4, -5, -2, 1, -32, -12], LW: [5, -3, -4, 2, -36, -14], RW: [5, -3, -4, 2, -36, -14],
    ST: [2, 2, -10, -2, -38, -2],
  };
  const PS_CODES = Object.keys(PLAYSTYLES).filter(c => /^[A-Z0-9]+$/.test(c) && !['FR', 'FW', 'C1', 'CC', 'DF', 'FTW'].includes(c));

  /** A generated player with a club of your choosing (used by the Top 5 Leagues opponents). `r` is a seeded rng; the card is not added to the database. */
  const SYN_NAMES = {
    ENG: ['Walker', 'Ashby', 'Harlow', 'Fenwick', 'Pryce', 'Dunmore', 'Keighley', 'Oakes', 'Rendell', 'Stroud', 'Marlow', 'Hartley'],
    ESP: ['Moreno', 'Ibarra', 'Castell', 'Rivas', 'Olmedo', 'Segura', 'Lozano', 'Nieto', 'Ferrer', 'Arenas', 'Calvo', 'Prieto'],
    ITA: ['Russo', 'Galli', 'Ferraro', 'Marchi', 'Bellotti', 'Conti', 'Vitale', 'Serra', 'Longo', 'Pace', 'Greco', 'Fabbri'],
    GER: ['Becker', 'Hoffmann', 'Krüger', 'Lang', 'Vogt', 'Seidel', 'Brandl', 'Hahn', 'Roth', 'Kessler', 'Winkler', 'Engel'],
    FRA: ['Lefèvre', 'Moreau', 'Girard', 'Roux', 'Faure', 'Blanc', 'Garnier', 'Chevalier', 'Perrin', 'Marchand', 'Collet', 'Renaud'],
    BRA: ['Souza', 'Oliveira', 'Pereira', 'Lima', 'Carvalho', 'Ribeiro', 'Almeida', 'Rocha', 'Teixeira', 'Barros'],
    NED: ['de Vries', 'Bakker', 'Visser', 'Smit', 'Mulder', 'de Boer', 'Bos', 'Vos', 'Kuipers', 'Jansen'],
    POR: ['Silva', 'Costa', 'Mendes', 'Ferreira', 'Gomes', 'Lopes', 'Marques', 'Pinto', 'Sousa', 'Neves'],
    ARG: ['Gómez', 'Paredes', 'Acosta', 'Benítez', 'Sosa', 'Ledesma', 'Ríos', 'Medina', 'Cabrera', 'Vera'],
  };
  function synthCard(id, club, nation, pos, ovr, r) {
    const pool = SYN_NAMES[nation] || SYN_NAMES.ENG;
    const name = INITIALS[Math.floor(r() * INITIALS.length)] + '. ' + pool[Math.floor(r() * pool.length)];
    const prof = PROFILE[pos] || PROFILE.CM;
    const f6 = prof.map(o => clamp(ovr + o + Math.round((r() - 0.5) * 8), 25, 95));
    const ps = (r() < 0.45) ? PS_CODES[Math.floor(r() * PS_CODES.length)] : (pos === 'GK' ? 'FR' : '');
    return buildCard(id, name, club, nation, pos, ovr, f6, ps, true, false);
  }


  function generateReserves() {
    const r = rng(1999);
    const out = [];
    const tiers = [{ n: 70, lo: 52, hi: 64 }, { n: 90, lo: 65, hi: 74 }, { n: 110, lo: 75, hi: 82 }];
    const clubsBy = {};
    BASE_CLUB_KEYS.forEach(c => { (clubsBy[CLUBS[c][0]] = clubsBy[CLUBS[c][0]] || []).push(c); });
    const lgs = TOP5;
    let n = 0;
    tiers.forEach(t => {
      for (let i = 0; i < t.n; i++) {
        const lg = lgs[Math.floor(r() * lgs.length)];
        const nation = LEAGUE_NATIONS[lg][Math.floor(r() * LEAGUE_NATIONS[lg].length)];
        const pool = NAME_POOLS[nation];
        const name = INITIALS[Math.floor(r() * INITIALS.length)] + '. ' + pool[Math.floor(r() * pool.length)];
        const club = clubsBy[lg][Math.floor(r() * clubsBy[lg].length)];
        const pos = POS_WEIGHTS[Math.floor(r() * POS_WEIGHTS.length)];
        const ovr = t.lo + Math.floor(r() * (t.hi - t.lo + 1));
        const prof = PROFILE[pos];
        const f6 = prof.map(o => clamp(ovr + o + Math.round((r() - 0.5) * 10), 25, 95));
        const ps = (ovr >= 75 && r() < 0.35) ? PS_CODES[Math.floor(r() * PS_CODES.length)] : (pos === 'GK' && ovr >= 75 ? 'FR' : '');
        const id = 'g' + String(++n).padStart(3, '0');
        out.push(buildCard(id, name, club, nation, pos, ovr, f6, ps, true, r() < 0.3));
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------------------
   * Build the full database at boot.
   * ------------------------------------------------------------------------- */
  /* v121: 50 more well-known players (JODIO, 2026-10-19). Ratings and clubs are estimates like the rest of the table. */
  const ADDED_V121 = [
    ['Yan Diomandé', 'Real Madrid', 'CIV', 'LW/RW', 84, 93, 76, 78, 87, 40, 66, 'RA TE'],
    ['Rayan Cherki', 'Man City', 'FRA', 'CAM/RW', 83, 80, 83, 85, 87, 48, 69, 'TE TR'],
    ['Dominik Szoboszlai', 'Liverpool', 'HUN', 'CAM/CM', 85, 80, 85, 87, 89, 50, 71, 'DB PP'],
    ['Marc Cucurella', 'Chelsea', 'ESP', 'LB', 82, 80, 64, 76, 78, 82, 78, 'AN JO'],
    ['Jérémy Doku', 'Man City', 'BEL', 'LW', 83, 94, 79, 81, 86, 38, 63, 'RA TR'],
    ['Alejandro Balde', 'Barcelona', 'ESP', 'LB', 82, 91, 64, 76, 78, 82, 78, 'RA'],
    ['Rodrygo', 'Real Madrid', 'BRA', 'RW/LW/ST', 84, 86, 80, 82, 87, 39, 64, 'FS'],
    ['Eduardo Camavinga', 'Real Madrid', 'FRA', 'CM/CDM/LB', 84, 76, 80, 86, 84, 66, 76, 'PR AN'],
    ['Federico Chiesa', 'Liverpool', 'ITA', 'RW/LW', 78, 85, 74, 76, 81, 33, 58, 'TE'],
    ['Rúben Neves', 'Al Hilal', 'POR', 'CM/CDM', 82, 56, 78, 84, 82, 64, 74, 'LB DB'],
    ['Sergej Milinković-Savić', 'Al Hilal', 'SRB', 'CM', 82, 66, 78, 84, 82, 64, 74, 'PH'],
    ['Kalidou Koulibaly', 'Al Hilal', 'SEN', 'CB', 80, 70, 48, 66, 64, 84, 84, 'BR'],
    ['Cody Gakpo', 'Liverpool', 'NED', 'LW/ST', 84, 84, 80, 82, 87, 39, 64, 'PS FS'],
    ['Kai Havertz', 'Arsenal', 'GER', 'ST/CAM', 83, 72, 85, 73, 79, 37, 81, 'PH'],
    ['Leandro Trossard', 'Arsenal', 'BEL', 'LW', 80, 80, 76, 78, 83, 35, 60, 'TE'],
    ['Jurriën Timber', 'Arsenal', 'NED', 'RB/CB', 84, 80, 66, 78, 80, 84, 80, 'AN JO'],
    ['Eberechi Eze', 'Arsenal', 'ENG', 'CAM/LW', 84, 80, 84, 86, 88, 49, 70, 'TE TR'],
    ['Mohammed Kudus', 'Tottenham', 'GHA', 'RW/CAM', 82, 83, 78, 80, 85, 37, 62, 'TR'],
    ['Dejan Kulusevski', 'Tottenham', 'SWE', 'RW/CAM', 82, 76, 78, 80, 85, 37, 62, 'IP'],
    ['Cristian Romero', 'Tottenham', 'ARG', 'CB', 85, 74, 53, 71, 69, 89, 89, 'BR AN'],
    ['Khéphren Thuram', 'Juventus', 'FRA', 'CM/CDM', 82, 74, 78, 84, 82, 64, 74, 'PR'],
    ['Gianluca Scamacca', 'Atalanta', 'ITA', 'ST', 81, 70, 83, 71, 77, 35, 79, 'PS'],
    ['Mateo Retegui', 'Al Qadsiah', 'ARG', 'ST', 82, 72, 84, 72, 78, 36, 80, 'PS'],
    ['Matteo Politano', 'Napoli', 'ITA', 'RW', 80, 78, 76, 78, 83, 35, 60, 'TE'],
    ['Alex Meret', 'Napoli', 'ITA', 'GK', 80, 82, 80, 74, 81, 56, 78, 'FR'],
    ['Pierre Kalulu', 'Juventus', 'FRA', 'CB/RB', 80, 78, 48, 66, 64, 84, 84, 'AN'],
    ['Hiroki Ito', 'Bayern', 'JPN', 'CB/LB', 80, 76, 48, 66, 64, 84, 84, 'IN'],
    ['Waldemar Anton', 'Dortmund', 'GER', 'CB', 82, 66, 50, 68, 66, 86, 86, 'PH'],
    ['Emre Can', 'Dortmund', 'GER', 'CDM/CB', 80, 62, 68, 80, 74, 82, 80, 'BR'],
    ['Benjamin Šeško', 'Man Utd', 'SVN', 'ST', 82, 84, 84, 72, 78, 36, 80, 'PS PH'],
    ['Matheus Cunha', 'Man Utd', 'BRA', 'CAM/ST/LW', 84, 80, 84, 86, 88, 49, 70, 'TE FS'],
    ['Senne Lammens', 'Man Utd', 'BEL', 'GK', 80, 82, 80, 74, 81, 56, 78, 'FR'],
    ['Nick Woltemade', 'Newcastle', 'GER', 'ST', 82, 72, 84, 72, 78, 36, 80, 'PH TE'],
    ['Lewis Hall', 'Newcastle', 'ENG', 'LB', 80, 80, 62, 74, 76, 80, 76, 'AN'],
    ['Yankuba Minteh', 'Brighton', 'GAM', 'RW', 78, 92, 74, 76, 81, 33, 58, 'RA'],
    ['Ezri Konsa', 'Aston Villa', 'ENG', 'CB', 82, 74, 50, 68, 66, 86, 86, 'AN'],
    ['Amadou Onana', 'Aston Villa', 'BEL', 'CDM/CM', 81, 68, 69, 81, 75, 83, 81, 'PH PR'],
    ['Ismaïla Sarr', 'Crystal Palace', 'SEN', 'RW/ST', 81, 90, 77, 79, 84, 36, 61, 'RA'],
    ['Igor Thiago', 'Brentford', 'BRA', 'ST', 80, 70, 82, 70, 76, 34, 78, 'PS PH'],
    ['Amine Gouiri', 'Marseille', 'FRA', 'ST/CAM', 80, 76, 82, 70, 76, 34, 78, 'FS'],
    ['Folarin Balogun', 'Monaco', 'USA', 'ST', 79, 78, 81, 69, 75, 33, 77, 'LD'],
    ['Georges Mikautadze', 'Lyon', 'GEO', 'ST/RW', 79, 78, 81, 69, 75, 33, 77, 'LD'],
    ['Warren Zaïre-Emery', 'PSG', 'FRA', 'CM/RB', 82, 78, 78, 84, 82, 64, 74, 'RE PR'],
    ['Matvey Safonov', 'PSG', 'RUS', 'GK', 80, 82, 80, 74, 81, 56, 78, 'FR'],
    ['Ronald Araújo', 'Barcelona', 'URU', 'CB/RB', 84, 82, 52, 70, 68, 88, 88, 'SL BR'],
    ['Wojciech Szczęsny', 'Barcelona', 'POL', 'GK', 80, 82, 80, 74, 81, 56, 78, 'FR'],
    ['Álvaro Carreras', 'Real Madrid', 'ESP', 'LB', 80, 80, 62, 74, 76, 80, 76, 'AN'],
    ['Giuliano Simeone', 'Atlético Madrid', 'ARG', 'RW/RM', 79, 84, 75, 77, 82, 34, 59, 'RE'],
    ['Piotr Zieliński', 'Inter', 'POL', 'CM/CAM', 82, 66, 78, 84, 82, 64, 74, 'IP TT'],
    ['Francesco Pio Esposito', 'Inter', 'ITA', 'ST', 78, 74, 80, 68, 74, 32, 76, 'PH'],
  ];
  /* v146 (JODIO, 2026-10-22): more Premier League players (estimated ratings like the rest), plus Bournemouth, Wolves, Leeds and Burnley. */
  const ADDED_V146 = [
    ['Ben White', 'Arsenal', 'ENG', 'RB/CB', 82, 82, 64, 78, 78, 86, 81, 'AN'],
    ['Mikel Merino', 'Arsenal', 'ESP', 'CM/CDM', 82, 72, 78, 87, 83, 68, 78, 'PH'],
    ['Piero Hincapié', 'Arsenal', 'ECU', 'LB/CB', 80, 77, 66, 72, 77, 81, 75, 'AN'],
    ['Gabriel Jesus', 'Arsenal', 'BRA', 'ST/LW', 80, 71, 80, 72, 73, 31, 79, 'TE'],
    ['Christian Nørgaard', 'Arsenal', 'DEN', 'CDM', 77, 68, 68, 80, 73, 77, 78, 'PR'],
    ['Kepa Arrizabalaga', 'Arsenal', 'ESP', 'GK', 77, 80, 75, 70, 77, 56, 78, 'FR'],
    ['Max Dowman', 'Arsenal', 'ENG', 'CAM', 71, 66, 72, 75, 76, 51, 62, 'TE'],
    ['Estêvão', 'Chelsea', 'BRA', 'RW', 82, 85, 78, 84, 83, 39, 59, 'FS TR'],
    ['Robert Sánchez', 'Chelsea', 'ESP', 'GK', 80, 83, 77, 73, 84, 58, 80, 'FR'],
    ['Wesley Fofana', 'Chelsea', 'FRA', 'CB', 80, 68, 48, 67, 66, 82, 85, 'AN'],
    ['Trevoh Chalobah', 'Chelsea', 'ENG', 'CB', 79, 72, 52, 69, 65, 81, 84, 'AN'],
    ['Tosin Adarabioyo', 'Chelsea', 'ENG', 'CB', 79, 66, 45, 63, 61, 84, 83, 'AN'],
    ['Andrey Santos', 'Chelsea', 'BRA', 'CM/CDM', 77, 67, 73, 83, 80, 61, 72, 'IP'],
    ['Benoît Badiashile', 'Chelsea', 'FRA', 'CB', 78, 67, 50, 67, 63, 82, 86, 'AN'],
    ['Giorgi Mamardashvili', 'Liverpool', 'GEO', 'GK', 82, 81, 80, 74, 82, 58, 77, 'FR'],
    ['Milos Kerkez', 'Liverpool', 'HUN', 'LB', 82, 83, 62, 76, 76, 79, 79, 'RA'],
    ['Andy Robertson', 'Liverpool', 'SCO', 'LB', 82, 86, 66, 72, 82, 85, 76, 'AN'],
    ['Joe Gomez', 'Liverpool', 'ENG', 'CB/RB', 79, 69, 51, 68, 67, 87, 81, 'AN'],
    ['Wataru Endo', 'Liverpool', 'JPN', 'CDM', 77, 64, 69, 79, 73, 84, 81, 'BR'],
    ['Rio Ngumoha', 'Liverpool', 'ENG', 'LW', 73, 78, 71, 72, 75, 33, 53, 'RA'],
    ['Kostas Tsimikas', 'Liverpool', 'GRE', 'LB', 75, 78, 65, 76, 68, 74, 72, 'AN'],
    ['Nico O\'Reilly', 'Man City', 'ENG', 'LB/CB', 82, 82, 60, 73, 79, 85, 75, 'AN'],
    ['Nathan Aké', 'Man City', 'NED', 'CB/LB', 82, 72, 49, 71, 67, 87, 88, 'AN'],
    ['Matheus Nunes', 'Man City', 'POR', 'RB/CM', 82, 81, 61, 73, 75, 83, 81, 'AN'],
    ['Nico González', 'Man City', 'ESP', 'CDM/CM', 82, 74, 74, 79, 78, 89, 83, 'TT'],
    ['Abdukodir Khusanov', 'Man City', 'UZB', 'CB', 80, 67, 48, 70, 68, 84, 84, 'RA'],
    ['James Trafford', 'Man City', 'ENG', 'GK', 80, 80, 77, 75, 82, 53, 82, 'FR'],
    ['Claudio Echeverri', 'Man City', 'ARG', 'CAM', 74, 73, 76, 78, 80, 45, 64, 'TE'],
    ['Diogo Dalot', 'Man Utd', 'POR', 'RB', 82, 79, 63, 76, 78, 82, 81, 'AN'],
    ['Leny Yoro', 'Man Utd', 'FRA', 'CB', 80, 74, 50, 68, 63, 84, 85, 'AN'],
    ['Harry Maguire', 'Man Utd', 'ENG', 'CB', 80, 72, 50, 63, 65, 82, 86, 'AN'],
    ['Matthijs de Ligt', 'Man Utd', 'NED', 'CB', 80, 68, 52, 69, 68, 88, 81, 'AN'],
    ['Luke Shaw', 'Man Utd', 'ENG', 'LB', 80, 83, 60, 77, 78, 82, 75, 'AN'],
    ['Mason Mount', 'Man Utd', 'ENG', 'CAM/CM', 77, 71, 79, 83, 83, 50, 63, 'TE'],
    ['André Onana', 'Man Utd', 'CMR', 'GK', 78, 77, 76, 74, 82, 54, 78, 'FR'],
    ['Patrick Dorgu', 'Man Utd', 'DEN', 'LB/LW', 77, 81, 65, 75, 77, 81, 76, 'RA'],
    ['Christian Eriksen', 'Man Utd', 'DEN', 'CM', 76, 64, 72, 82, 75, 59, 71, 'IP'],
    ['Ayden Heaven', 'Man Utd', 'ENG', 'CB', 72, 67, 50, 66, 55, 81, 80, 'AN'],
    ['Pedro Porro', 'Tottenham', 'ESP', 'RB', 83, 86, 61, 79, 78, 80, 83, 'RA'],
    ['Guglielmo Vicario', 'Tottenham', 'ITA', 'GK', 82, 88, 82, 74, 83, 60, 81, 'FR'],
    ['Destiny Udogie', 'Tottenham', 'ITA', 'LB', 80, 83, 62, 74, 79, 84, 79, 'AN'],
    ['Pape Matar Sarr', 'Tottenham', 'SEN', 'CM', 80, 67, 82, 82, 81, 63, 71, 'IP'],
    ['Rodrigo Bentancur', 'Tottenham', 'URU', 'CM/CDM', 80, 70, 76, 88, 84, 66, 76, 'IP'],
    ['Randal Kolo Muani', 'Tottenham', 'FRA', 'ST', 79, 74, 80, 71, 75, 32, 80, 'PH'],
    ['Richarlison', 'Tottenham', 'BRA', 'ST', 79, 74, 80, 66, 77, 31, 79, 'PH'],
    ['Brennan Johnson', 'Tottenham', 'WAL', 'RW', 79, 82, 73, 78, 83, 35, 63, 'RA'],
    ['Kevin Danso', 'Tottenham', 'AUT', 'CB', 78, 68, 44, 67, 59, 86, 81, 'AN'],
    ['Mathys Tel', 'Tottenham', 'FRA', 'ST', 77, 72, 78, 65, 73, 33, 76, 'PH'],
    ['Djed Spence', 'Tottenham', 'ENG', 'RB', 77, 74, 61, 72, 74, 76, 74, 'RA'],
    ['Tino Livramento', 'Newcastle', 'ENG', 'RB', 82, 79, 67, 79, 76, 80, 76, 'RA'],
    ['Joelinton', 'Newcastle', 'BRA', 'CM', 82, 69, 84, 88, 87, 65, 73, 'PH'],
    ['Malick Thiaw', 'Newcastle', 'GER', 'CB', 80, 67, 49, 63, 63, 82, 83, 'AN'],
    ['Dan Burn', 'Newcastle', 'ENG', 'CB/LB', 80, 74, 47, 63, 68, 88, 83, 'AN'],
    ['Sven Botman', 'Newcastle', 'NED', 'CB', 80, 69, 46, 65, 61, 81, 87, 'AN'],
    ['Yoane Wissa', 'Newcastle', 'COD', 'ST', 80, 73, 78, 69, 77, 37, 79, 'PH'],
    ['Fabian Schär', 'Newcastle', 'SUI', 'CB', 79, 72, 51, 70, 65, 86, 87, 'LB'],
    ['Nick Pope', 'Newcastle', 'ENG', 'GK', 79, 78, 81, 76, 78, 53, 77, 'FR'],
    ['Jacob Ramsey', 'Newcastle', 'ENG', 'CM/CAM', 78, 67, 80, 86, 83, 65, 70, 'IP'],
    ['Joe Willock', 'Newcastle', 'ENG', 'CM', 76, 61, 74, 83, 80, 63, 67, 'IP'],
    ['William Osula', 'Newcastle', 'ENG', 'ST', 74, 72, 77, 63, 74, 30, 74, 'PH'],
    ['Boubacar Kamara', 'Aston Villa', 'FRA', 'CDM', 83, 68, 73, 82, 81, 90, 83, 'IN'],
    ['John McGinn', 'Aston Villa', 'SCO', 'CM', 80, 64, 77, 82, 79, 67, 71, 'IP'],
    ['Donyell Malen', 'Aston Villa', 'NED', 'RW/ST', 80, 86, 80, 77, 86, 39, 61, 'RA'],
    ['Matty Cash', 'Aston Villa', 'POL', 'RB', 79, 81, 63, 75, 79, 76, 76, 'AN'],
    ['Lucas Digne', 'Aston Villa', 'FRA', 'LB', 79, 83, 59, 77, 78, 81, 77, 'IP'],
    ['Leon Bailey', 'Aston Villa', 'JAM', 'RW', 78, 84, 74, 74, 79, 39, 61, 'RA'],
    ['Ian Maatsen', 'Aston Villa', 'NED', 'LB', 78, 79, 64, 75, 77, 79, 74, 'AN'],
    ['Victor Lindelöf', 'Aston Villa', 'SWE', 'CB', 78, 66, 45, 65, 66, 79, 86, 'AN'],
    ['Evann Guessand', 'Aston Villa', 'CIV', 'ST', 76, 67, 77, 68, 70, 37, 75, 'PH'],
    ['Ross Barkley', 'Aston Villa', 'ENG', 'CM', 74, 61, 76, 80, 79, 56, 66, 'IP'],
    ['Carlos Baleba', 'Man Utd', 'CMR', 'CDM', 79, 71, 71, 79, 72, 80, 80, 'IN'],
    ['Georginio Rutter', 'Brighton', 'FRA', 'CAM/LW', 79, 73, 81, 85, 85, 54, 69, 'TE'],
    ['Bart Verbruggen', 'Brighton', 'NED', 'GK', 80, 84, 82, 71, 80, 60, 76, 'FR'],
    ['Pervis Estupiñán', 'Brighton', 'ECU', 'LB', 78, 75, 65, 71, 73, 78, 72, 'AN'],
    ['Lewis Dunk', 'Brighton', 'ENG', 'CB', 78, 72, 48, 63, 60, 85, 85, 'AN'],
    ['Danny Welbeck', 'Brighton', 'ENG', 'ST', 78, 75, 77, 71, 77, 37, 77, 'PH'],
    ['Matt O\'Riley', 'Brighton', 'DEN', 'CM', 77, 66, 78, 82, 77, 59, 73, 'IP'],
    ['Brajan Gruda', 'Brighton', 'GER', 'CAM', 76, 74, 80, 78, 81, 50, 62, 'TE'],
    ['Jack Hinshelwood', 'Brighton', 'ENG', 'CM', 76, 63, 72, 83, 80, 57, 74, 'IP'],
    ['Crysencio Summerville', 'West Ham', 'NED', 'LW', 79, 84, 73, 80, 84, 38, 57, 'RA'],
    ['Aaron Wan-Bissaka', 'West Ham', 'ENG', 'RB', 79, 78, 61, 72, 79, 81, 77, 'AN'],
    ['Max Kilman', 'West Ham', 'ENG', 'CB', 79, 68, 50, 66, 62, 80, 87, 'AN'],
    ['Alphonse Areola', 'West Ham', 'FRA', 'GK', 79, 83, 80, 71, 84, 56, 79, 'FR'],
    ['Niclas Füllkrug', 'West Ham', 'GER', 'ST', 78, 75, 76, 65, 74, 30, 78, 'PH'],
    ['Tomás Soucek', 'West Ham', 'CZE', 'CM/CDM', 78, 62, 79, 86, 79, 65, 70, 'IP'],
    ['Mateus Fernandes', 'Tottenham', 'POR', 'CM', 77, 67, 72, 82, 76, 58, 73, 'IP'],
    ['Callum Wilson', 'West Ham', 'ENG', 'ST', 75, 70, 74, 64, 76, 37, 74, 'PH'],
    ['Dean Henderson', 'Crystal Palace', 'ENG', 'GK', 81, 81, 82, 78, 86, 56, 82, 'FR'],
    ['Maxence Lacroix', 'Chelsea', 'FRA', 'CB', 81, 73, 49, 70, 69, 89, 86, 'AN'],
    ['Daniel Muñoz', 'Crystal Palace', 'COL', 'RB/RWB', 80, 84, 64, 74, 73, 84, 77, 'RA'],
    ['Yeremy Pino', 'Crystal Palace', 'ESP', 'RW', 78, 79, 74, 76, 82, 33, 56, 'RA'],
    ['Daichi Kamada', 'Crystal Palace', 'JPN', 'CM/CAM', 78, 61, 78, 85, 84, 63, 75, 'IP'],
    ['Chris Richards', 'Crystal Palace', 'USA', 'CB', 78, 65, 47, 69, 62, 80, 79, 'AN'],
    ['Jefferson Lerma', 'Crystal Palace', 'COL', 'CDM', 77, 68, 66, 79, 76, 84, 78, 'PR'],
    ['Caoimhín Kelleher', 'Brentford', 'IRL', 'GK', 80, 81, 84, 72, 78, 60, 80, 'FR'],
    ['Nathan Collins', 'Brentford', 'IRL', 'CB', 78, 66, 46, 66, 64, 81, 84, 'AN'],
    ['Kevin Schade', 'Brentford', 'GER', 'ST/LW', 77, 73, 76, 68, 71, 32, 74, 'RA'],
    ['Mikkel Damsgaard', 'Brentford', 'DEN', 'CAM', 77, 71, 74, 80, 84, 51, 65, 'TE'],
    ['Dango Ouattara', 'Brentford', 'BFA', 'RW', 77, 84, 75, 74, 77, 33, 57, 'RA'],
    ['Keane Lewis-Potter', 'Brentford', 'ENG', 'LB/LW', 76, 77, 59, 73, 71, 77, 71, 'AN'],
    ['Joachim Andersen', 'Fulham', 'DEN', 'CB', 80, 70, 45, 66, 65, 85, 81, 'AN'],
    ['Bernd Leno', 'Fulham', 'GER', 'GK', 80, 82, 80, 75, 84, 57, 79, 'FR'],
    ['Antonee Robinson', 'Fulham', 'USA', 'LB', 80, 79, 62, 75, 74, 82, 76, 'RA'],
    ['Harry Wilson', 'Fulham', 'WAL', 'RW', 77, 84, 73, 75, 81, 34, 56, 'FS'],
    ['Sander Berge', 'Fulham', 'NOR', 'CDM', 76, 63, 72, 78, 73, 77, 78, 'PR'],
    ['Raúl Jiménez', 'Fulham', 'MEX', 'ST', 75, 74, 80, 64, 74, 33, 76, 'PH'],
    ['Kenny Tete', 'Fulham', 'NED', 'RB', 76, 78, 64, 76, 70, 73, 74, 'AN'],
    ['Jordan Pickford', 'Everton', 'ENG', 'GK', 83, 86, 85, 78, 81, 59, 78, 'FR'],
    ['Jarrad Branthwaite', 'Everton', 'ENG', 'CB', 81, 74, 46, 63, 66, 83, 88, 'AN'],
    ['Iliman Ndiaye', 'Man City', 'SEN', 'LW/CAM', 79, 80, 74, 75, 82, 39, 56, 'TR'],
    ['Kiernan Dewsbury-Hall', 'Everton', 'ENG', 'CM', 79, 62, 77, 81, 84, 67, 73, 'IP'],
    ['Idrissa Gueye', 'Everton', 'SEN', 'CDM', 76, 67, 71, 84, 74, 79, 75, 'PR'],
    ['Jake O\'Brien', 'Everton', 'IRL', 'CB', 76, 69, 44, 63, 64, 84, 80, 'AN'],
    ['Dwight McNeil', 'Everton', 'ENG', 'LW', 76, 82, 73, 71, 78, 36, 54, 'RA'],
    ['Beto', 'Everton', 'POR', 'ST', 76, 69, 79, 69, 69, 33, 72, 'PH'],
    ['Elliot Anderson', 'Man City', 'ENG', 'CM', 82, 70, 77, 88, 87, 68, 75, 'IP'],
    ['Murillo', 'Nottm Forest', 'BRA', 'CB', 81, 73, 48, 69, 65, 85, 88, 'AN'],
    ['Nikola Milenković', 'Nottm Forest', 'SRB', 'CB', 80, 69, 48, 67, 62, 83, 81, 'AN'],
    ['Matz Sels', 'Nottm Forest', 'BEL', 'GK', 79, 80, 82, 70, 77, 55, 76, 'FR'],
    ['Callum Hudson-Odoi', 'Nottm Forest', 'ENG', 'RW', 78, 86, 71, 77, 81, 33, 56, 'TR'],
    ['Anthony Elanga', 'Nottm Forest', 'SWE', 'RW', 78, 84, 75, 74, 79, 33, 57, 'RA'],
    ['Ibrahim Sangaré', 'Nottm Forest', 'CIV', 'CDM', 78, 65, 65, 78, 74, 81, 83, 'PR'],
    ['Ola Aina', 'Nottm Forest', 'NGA', 'RB', 77, 76, 63, 72, 70, 79, 70, 'AN'],
    ['Enzo Le Fée', 'Sunderland', 'FRA', 'CAM', 79, 76, 78, 79, 81, 47, 64, 'IP'],
    ['Nordi Mukiele', 'Sunderland', 'FRA', 'CB/RB', 78, 65, 49, 66, 66, 85, 84, 'AN'],
    ['Noah Sadiki', 'Sunderland', 'COD', 'CM', 77, 62, 76, 82, 77, 61, 69, 'IP'],
    ['Reinildo', 'Sunderland', 'MOZ', 'LB', 77, 75, 58, 77, 70, 75, 72, 'AN'],
    ['Habib Diarra', 'Sunderland', 'SEN', 'CM', 76, 64, 76, 77, 75, 58, 74, 'IP'],
    ['Robin Roefs', 'Sunderland', 'NED', 'GK', 76, 77, 78, 71, 77, 56, 71, 'FR'],
    ['Justin Kluivert', 'Bournemouth', 'NED', 'LW/CAM', 79, 86, 72, 79, 83, 35, 61, 'TR'],
    ['Illia Zabarnyi', 'Bournemouth', 'UKR', 'CB', 79, 73, 45, 66, 63, 85, 82, 'AN'],
    ['Marcus Tavernier', 'Bournemouth', 'ENG', 'CAM/RW', 78, 77, 77, 83, 85, 50, 62, 'TE'],
    ['Alex Scott', 'Bournemouth', 'ENG', 'CM', 78, 62, 77, 82, 79, 64, 70, 'IP'],
    ['Evanilson', 'Bournemouth', 'BRA', 'ST', 78, 72, 79, 68, 76, 36, 73, 'PH'],
    ['Djordje Petrović', 'Bournemouth', 'SRB', 'GK', 78, 78, 80, 73, 78, 55, 80, 'FR'],
    ['Ryan Christie', 'Bournemouth', 'SCO', 'CM', 76, 59, 78, 81, 82, 59, 72, 'IP'],
    ['Adrien Truffert', 'Bournemouth', 'FRA', 'LB', 75, 72, 64, 75, 70, 76, 70, 'AN'],
    ['João Gomes', 'Wolves', 'BRA', 'CDM', 80, 66, 69, 83, 76, 81, 82, 'IN'],
    ['Hee-chan Hwang', 'Wolves', 'KOR', 'RW', 77, 79, 70, 78, 80, 39, 56, 'RA'],
    ['José Sá', 'Wolves', 'POR', 'GK', 77, 83, 78, 72, 80, 55, 79, 'FR'],
    ['Emmanuel Agbadou', 'Wolves', 'CIV', 'CB', 75, 64, 48, 63, 62, 82, 78, 'AN'],
    ['Mario Lemina', 'Wolves', 'GAB', 'CDM', 74, 64, 70, 78, 69, 75, 73, 'PR'],
    ['Tolu Arokodare', 'Wolves', 'NGA', 'ST', 74, 68, 73, 65, 68, 33, 75, 'PH'],
    ['Dominic Calvert-Lewin', 'Leeds', 'ENG', 'ST', 78, 70, 78, 66, 77, 31, 80, 'PH'],
    ['Ethan Ampadu', 'Leeds', 'WAL', 'CDM', 78, 69, 67, 82, 73, 78, 82, 'PR'],
    ['Anton Stach', 'Leeds', 'GER', 'CM', 78, 62, 73, 82, 79, 63, 69, 'IP'],
    ['Noah Okafor', 'Leeds', 'SUI', 'LW', 76, 81, 75, 76, 83, 36, 56, 'RA'],
    ['Joe Rodon', 'Leeds', 'WAL', 'CB', 75, 64, 50, 64, 62, 80, 84, 'AN'],
    ['Lucas Perri', 'Leeds', 'BRA', 'GK', 75, 74, 74, 66, 74, 59, 74, 'FR'],
    ['Brenden Aaronson', 'Leeds', 'USA', 'CAM', 74, 72, 76, 77, 79, 48, 58, 'TE'],
    ['Daniel James', 'Leeds', 'WAL', 'RW', 75, 82, 72, 72, 78, 37, 58, 'RA'],
    ['Zian Flemming', 'Burnley', 'NED', 'CAM/ST', 75, 70, 74, 78, 78, 48, 62, 'TE'],
    ['Lesley Ugochukwu', 'Burnley', 'FRA', 'CDM', 74, 60, 64, 78, 72, 82, 74, 'PR'],
    ['Martin Dúbravka', 'Burnley', 'SVK', 'GK', 74, 75, 73, 66, 74, 55, 72, 'FR'],
    ['Maxime Estève', 'Burnley', 'FRA', 'CB', 74, 67, 48, 67, 62, 76, 78, 'AN'],
    ['Josh Cullen', 'Burnley', 'IRL', 'CDM', 74, 67, 68, 80, 73, 77, 78, 'PR'],
    ['Jaidon Anthony', 'Burnley', 'ENG', 'LW', 74, 76, 74, 71, 75, 34, 59, 'RA'],
  ];
  const ROWS = TOP150.slice();
  ADDED150.forEach(row => {
    const at = ROWS.findIndex(r => r[0] === row[0]);
    if (at >= 0) ROWS[at] = row; else ROWS.push(row);
  });
  ADDED_V121.forEach(row => { if (!ROWS.some(r => r[0] === row[0])) ROWS.push(row); });
  /* v156: the three 2026 Ballon d'Or nominees the game did not have yet (estimated ratings like the rest) */
  const ADDED_V156 = [
    ['Ferran Torres', 'Barcelona', 'ESP', 'ST/RW', 81, 78, 82, 72, 80, 42, 68, 'FS'],
    ['Sadio Mané', 'Al Nassr', 'SEN', 'LW/ST', 81, 84, 82, 76, 84, 44, 70, 'QS'],
    ['Julián Quiñones', 'Al Qadsiah', 'MEX', 'LW/RW', 80, 85, 78, 70, 81, 34, 72, 'RA'],
  ];
  ADDED_V146.forEach(row => { if (!ROWS.some(r => r[0] === row[0])) ROWS.push(row); });
  ADDED_V156.forEach(row => { if (!ROWS.some(r => r[0] === row[0])) ROWS.push(row); });
  const players = ROWS.map((row, i) => {
    const [name, club, nation, pos, ovr, a, b, c, d, e, f, ps] = row;
    return buildCard('p' + String(i + 1).padStart(3, '0'), name, club, nation, pos, ovr, [a, b, c, d, e, f], ps, false, true);
  });
  const reserves = generateReserves();
  const all = players.concat(reserves);
  const byId = {};
  all.forEach(p => { byId[p.id] = p; });
  // v157 (JODIO): every Harry Kane card has 3% better passing; every Lamine Yamal card 2% better shooting and 4% better passing (his base card here, so every promo copy built from it carries it too)
  const STAT_BOOST = { 'Harry Kane': { pas: 3 }, 'Lamine Yamal': { sho: 2, pas: 4 } };
  players.forEach(c => {
    const bo = STAT_BOOST[c.name]; if (!bo) return;
    Object.keys(bo).forEach(k => { const m = 1 + bo[k] / 100; c.face[k] = clamp(Math.round(c.face[k] * m), 1, 99); (SUB_MAP[k] || []).forEach(x => { c.sub[x] = clamp(Math.round(c.sub[x] * m), 1, 99); }); });
    c.value = valuation(c.rating, c.face, c.playStyles, c.position, c.rare);
  });
  // v217 (JODIO): real-life strengths the face stats hid. Yamal shoots better (finishing, power, long shots, curl); Haaland and Kane win headers
  // (heading accuracy, jumping, strength) and hit harder. Values are floors: an evolved or promo copy that is already higher keeps its own.
  const SUB_SET = {
    'Lamine Yamal': { finishing: 87, shotPower: 86, longShots: 88, curve: 92, volleys: 82, composure: 89 },
    'Erling Haaland': { headingAccuracy: 89, jumping: 87, strength: 94, shotPower: 95, finishing: 97 },
    'Harry Kane': { headingAccuracy: 90, jumping: 81, strength: 84, shotPower: 94, finishing: 95, longShots: 90 },
  };
  players.forEach(c => {
    const set = SUB_SET[c.name]; if (!set) return;
    Object.keys(set).forEach(k => { c.sub[k] = Math.max(c.sub[k] || 0, set[k]); });
    const sho = SUB_MAP.sho || []; if (sho.length) c.face.sho = Math.max(c.face.sho, Math.round(sho.reduce((a, k) => a + (c.sub[k] || 0), 0) / sho.length));
    c.value = valuation(c.rating, c.face, c.playStyles, c.position, c.rare);
  });
  all.forEach(capFace);
  // v157 (JODIO): the value of every normal (non-special) card under 89 is 30% lower (promo cards are made after this and are untouched)
  all.forEach(c => { if (!c.promo && c.rating < 89) c.value = roundToIncrement(c.value * 0.7); });

  /* ---------------------------------------------------------------------------
   * Promo cards (SBC / Evolution / Player-pick rewards) are created at runtime
   * as boosted copies of a base card and registered here so the rest of the
   * game can treat them like any other card id.
   * ------------------------------------------------------------------------- */
  // NLPOFM (Nations League Player of the Month): +5% on every attribute and two brand-new PlayStyles per player
  const NLPOFM = {
    p105: ['Dead Ball+', 'Finesse Shot+'],        // Kane
    p045: ['Trickster+', 'Whipped Pass+'],        // Yamal
    p023: ['Rapid+', 'Low Driven Shot+'],         // Gyökeres
    p108: ['Technical+', 'Trickster+'],           // Olise
    p046: ['Incisive Pass+', 'Press Proven+'],    // Bellingham
    p063: ['Incisive Pass+', 'First Touch+'],     // Olmo
    p035: ['Relentless+', 'Press Proven+'],       // Gordon
    p136: ['Quick Step+', 'Finesse Shot+'],       // Doué
  };
  // NL Stars: 7 more players from each of the eight Nations League top-2 sides (the best the game has), +3% on every attribute, one new PlayStyle, all their own kept
  const NL_TEAMS = ['FRA', 'ITA', 'NED', 'GRE', 'ESP', 'ENG', 'POR', 'DEN'];
  const NLSTAR_IDS = [];
  NL_TEAMS.forEach(n => { players.filter(c => c.nation === n && !NLPOFM[c.id]).sort((a, b) => b.rating - a.rating).slice(0, 7).forEach(c => NLSTAR_IDS.push(c.id)); });
  const PS_WANT = {
    ST: ['Finesse Shot+', 'Power Shot+', 'Low Driven Shot+', 'Chip Shot+', 'Acrobatic+', 'First Touch+', 'Rapid+', 'Trickster+'],
    LW: ['Trickster+', 'Technical+', 'Whipped Pass+', 'Finesse Shot+', 'Rapid+', 'Quick Step+', 'Low Driven Shot+', 'First Touch+'],
    CAM: ['Incisive Pass+', 'Technical+', 'Finesse Shot+', 'First Touch+', 'Tiki Taka+', 'Inventive+'],
    CM: ['Incisive Pass+', 'Pinged Pass+', 'Press Proven+', 'Relentless+', 'Tiki Taka+', 'Long Ball Pass+'],
    CDM: ['Intercept+', 'Anticipate+', 'Pinged Pass+', 'Long Ball Pass+', 'Press Proven+', 'Relentless+', 'Jockey+', 'Enforcer+', 'Block+'],
    CB: ['Anticipate+', 'Intercept+', 'Power Header+', 'Jockey+', 'Slide Tackle+', 'Long Ball Pass+', 'Bruiser+', 'Aerial Fortress+', 'Block+'],
    LB: ['Jockey+', 'Whipped Pass+', 'Relentless+', 'Intercept+', 'Slide Tackle+', 'Rapid+', 'Quick Step+', 'Long Throw+'],
    GK: ['Far Reach+', 'Footwork+', 'Cross Claimer+', 'Deflector+', '1v1 Close Down+', 'Far Throw+'],
  };
  const PS_GROUP = { ST: 'ST', CF: 'ST', LW: 'LW', RW: 'LW', LM: 'LW', RM: 'LW', CAM: 'CAM', CM: 'CM', CDM: 'CDM', CB: 'CB', LB: 'LB', RB: 'LB', LWB: 'LB', RWB: 'LB', GK: 'GK' };
  function newStylesFor(base, sub) {
    const have = base.playStyles, list = PS_WANT[PS_GROUP[base.position] || 'CM'];
    for (const x of list) {
      if (have.includes(x)) continue;
      if ((x === 'Power Shot+' && have.some(n => /^Finesse Shot/.test(n))) || (x === 'Finesse Shot+' && have.some(n => /^Power Shot/.test(n)))) continue;   // v149
      if (x === 'Rapid+' && (sub.sprintSpeed < 88 || have.includes('Quick Step+'))) continue;
      if (x === 'Quick Step+' && (sub.acceleration < 88 || have.includes('Rapid+'))) continue;
      return x;
    }
    return null;
  }
  // v155 Ballon d'Or promo: the 30 real 2026 nominees, ranked by JODIO (favourites Mbappé, Kane, Yamal first). Top 3 = 95 with 4 PlayStyles, 4-10 = 94, 11-20 = 93, 21-30 = 92.
  const BDOR_NAMES = ['Harry Kane', 'Kylian Mbappé', 'Lamine Yamal',   // v197 (JODIO): Kane wins, Mbappé 2nd, Yamal 3rd
    'Ousmane Dembélé', 'Vitinha', 'Khvicha Kvaratskhelia', 'Michael Olise', 'Lionel Messi', 'Erling Haaland', 'Rodri',
    'Jude Bellingham', 'Vinícius Jr.', 'Pau Cubarsí', 'Achraf Hakimi', 'Nuno Mendes', 'João Neves', 'Bruno Fernandes', 'Luis Díaz', 'William Saliba', 'Declan Rice',
    'Gabriel Magalhães', 'Willian Pacho', 'Marquinhos', 'Fabián Ruiz', 'Dayot Upamecano', 'Marc Cucurella', 'Lautaro Martínez', 'Ferran Torres', 'Sadio Mané', 'Julián Quiñones'];
  BDOR_NAMES.push('Cristiano Ronaldo');   // v165 (JODIO): Ronaldo is the Ballon d'Or honorable mention, shown as HM, 94
  const BDOR_IDS = BDOR_NAMES.map(n => { const c = players.find(x => x.name === n); if (!c) console.warn('Ballon d\'Or: missing ' + n); return c && c.id; }).filter(Boolean);
  // v197 (JODIO): award winners promo (only in Ballon d'Or packs, 94 OVR)
  // v198 (JODIO): tonight's real 2026 ceremony winners (khelnow.com full list; Yashin also on Yahoo Sports)
  const AWARDS = [['Harry Kane', 'GERD MÜLLER', 'Gerd Müller Trophy 2026'], ['Lamine Yamal', 'KOPA', 'Kopa Trophy 2026'], ['Unai Simón', 'YASHIN', 'Yashin Trophy 2026'], ['Bukayo Saka', 'SÓCRATES', 'Sócrates Award 2026']];
  const AWARD_IDS = AWARDS.map(a => { const c = players.find(x => x.name === a[0]); return c && c.id; });
  const bdorRating = rank => (rank === 1 ? 96 : rank <= 3 ? 95 : rank <= 10 ? 94 : rank <= 20 ? 93 : rank <= 30 ? 92 : 94);   // v165: rank 31 = honorable mention (Ronaldo, 94)
  const clBoost = {};   // baseId -> CL promo boost in percent (cl.js fills it before the cards are registered)
  /** v255 (JODIO): Nations League boost and rating cap by the country's finish (js/nl_data.js). A nation without a rank keeps the old +3% (+5% for the Player of the Month) and cap 92. */
  function nlTier(nat, extra) {
    const N = RUT.NL_DATA || {}, fin = /final/i.test(N.stage || '') && !/league phase|knockout|quarter|semi/i.test(N.stage || '');
    let r = N.rank && N.rank[nat]; if (!r) return { pct: 3 + extra, cap: 92 };
    if (r === 1 && !fin) r = 2;
    const t = r === 1 ? [7, 97] : r === 2 ? [6, 95] : r === 3 ? [5.5, 94] : r === 4 ? [5, 93] : r <= 8 ? [4, 92] : r <= 12 ? [3, 91] : [2.5, 90];
    return { pct: t[0] + extra, cap: t[1] };
  }
  function registerPromoRaw(baseId, promo, boost, newId) {
    const base = byId[baseId];
    if (!base) return null;
    const id = newId || (baseId + '_' + promo + '_' + boost);
    if (byId[id]) return byId[id];
    if (promo === 'bdor') {   // boost = the nominee's rank (1-30)
      const rank = boost, target = bdorRating(rank), k = target / base.rating, up = v => clamp(Math.round(v * k), 1, 99), face = {}, sub = {};
      Object.keys(base.face).forEach(x => { face[x] = up(base.face[x]); }); Object.keys(base.sub).forEach(x => { sub[x] = up(base.sub[x]); });
      const want = rank <= 3 ? 4 : 3, ps = base.playStyles.slice();
      for (let n = 0; n < 4 && ps.filter(x => /\+$/.test(x)).length < want; n++) { const nw = newStylesFor(Object.assign({}, base, { playStyles: ps }), sub); if (!nw) break; ps.push(nw); }
      const card = Object.assign({}, base, { id, rating: target, rarity: 'promo', promo, bdorRank: rank, face, sub, rare: true, baseId, playStyles: psGate(target, sub, ps, base.playStyles, want) });
      if (rank === 1) { const has = n => card.playStyles.some(x => x.replace(/\+$/, '') === n), extra = (PS_WANT[PS_GROUP[base.position] || 'CM'] || []).map(x => x.replace(/\+$/, '')).find(n => !has(n) && !/^(Finesse|Power) Shot$/.test(n)); if (extra) card.playStyles = card.playStyles.concat([extra]); }   // v197: the winner (Kane, 96) gets one more PlayStyle (not a +)
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * (rank <= 3 ? 2.2 : rank <= 10 || rank > 30 ? 1.8 : 1.5));
      byId[id] = card; all.push(card);
      return card;
    }
    if (promo === 'toty' || promo === 'tots') {   // v257: boost = 1-based place in RUT.SEASON_DATA[promo].picks; the pick's own rating, 3 gold PlayStyles (and so 3 Gametraits)
      const S = (RUT.SEASON_DATA || {})[promo] || { picks: [] }, pk = S.picks[boost - 1] || {}, target = clamp(pk.rating || Math.min(97, base.rating + 5), base.rating, 99), k = target / base.rating, up = v => clamp(Math.round(v * k), 1, 99), face = {}, sub = {};
      Object.keys(base.face).forEach(x => { face[x] = up(base.face[x]); }); Object.keys(base.sub).forEach(x => { sub[x] = up(base.sub[x]); });
      const ps = base.playStyles.slice(); for (let n = 0; n < 4 && ps.filter(x => /\+$/.test(x)).length < 3; n++) { const nw = newStylesFor(Object.assign({}, base, { playStyles: ps }), sub); if (!nw) break; ps.push(nw); }
      const card = Object.assign({}, base, { id, rating: target, rarity: 'promo', promo, face, sub, rare: true, baseId, pickIdx: boost, potLg: promo === 'tots' ? base.league : undefined, seasonInfo: { label: S.label, why: pk.why }, playStyles: psGate(target, sub, ps, base.playStyles, 3) });
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 2.0);
      byId[id] = card; all.push(card); return card;
    }
    if (promo === 'award') {   // boost = 1-based index into AWARDS
      const a = AWARDS[boost - 1] || AWARDS[0], target = 94, k = target / base.rating, up = v => clamp(Math.round(v * k), 1, 99), face = {}, sub = {};
      Object.keys(base.face).forEach(x => { face[x] = up(base.face[x]); }); Object.keys(base.sub).forEach(x => { sub[x] = up(base.sub[x]); });
      const ps = base.playStyles.slice(); for (let n = 0; n < 4 && ps.filter(x => /\+$/.test(x)).length < 3; n++) { const nw = newStylesFor(Object.assign({}, base, { playStyles: ps }), sub); if (!nw) break; ps.push(nw); }
      const card = Object.assign({}, base, { id, rating: target, rarity: 'promo', promo, award: a[2], awardShort: a[1], face, sub, rare: true, baseId, playStyles: psGate(target, sub, ps, base.playStyles, 3) });
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 1.8);
      byId[id] = card; all.push(card); return card;
    }
    if (promo === 'lpotw' || promo === 'lpotm') {   // v249 (JODIO): Player of the Week +1% (max 92), Player of the Month +2% (max 93)
      const k = promo === 'lpotw' ? 1.01 : 1.02, up = v => clamp(Math.round(v * k), 1, 99), face = {}, sub = {};
      Object.keys(base.face).forEach(x => { face[x] = up(base.face[x]); }); Object.keys(base.sub).forEach(x => { sub[x] = up(base.sub[x]); });
      const rating = Math.min(promo === 'lpotw' ? 92 : 93, Math.max(base.rating + 1, up(base.rating)));
      // v258 (JODIO): one player can get each of these cards up to 3 times (boost 1/2, 101/102, 201/202 = 1st/2nd/3rd); every repeat carries different PlayStyles+ and Gametraits+
      const occ = Math.min(2, Math.floor(boost / 100)), pool = base.playStyles.slice(), extra = [];
      for (let n = 0; n < 4; n++) { const nw = newStylesFor(Object.assign({}, base, { playStyles: pool }), sub); if (!nw) break; pool.push(nw); extra.push(nw); }
      const first = occ ? extra.slice((occ - 1) * 2, occ * 2) : base.playStyles;
      const card = Object.assign({}, base, { id, rating, rarity: 'promo', promo, face, sub, rare: true, baseId, potLg: base.league, gtVar: occ, occ: occ + 1, playStyles: psGate(rating, sub, occ ? pool : base.playStyles, first, 2) });
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 1.4);
      byId[id] = card; all.push(card); return card;
    }
    if (promo === 'nlstar') {
      const nt = nlTier(base.nation, 0), up = v => clamp(Math.round(v * (1 + nt.pct / 100)), 1, 99), face = {}, sub = {};
      Object.keys(base.face).forEach(k => { face[k] = up(base.face[k]); }); Object.keys(base.sub).forEach(k => { sub[k] = up(base.sub[k]); });
      const rating = Math.min(nt.cap, up(base.rating)), nw = newStylesFor(base, sub);
      const card = Object.assign({}, base, { id, rating, rarity: 'promo', promo, face, sub, rare: true, baseId, playStyles: psGate(rating, sub, base.playStyles.concat(nw ? [nw] : []), base.playStyles, 2) });
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 1.4);
      byId[id] = card; all.push(card);
      return card;
    }
    if (promo === 'clpromo') {   // Champions League promo (v98): +4% on every stat, overall capped at 93, the base PlayStyles + one new
      const pct = clBoost[baseId] || 4, up = v => clamp(Math.round(v * (1 + pct / 100)), 1, 99), face = {}, sub = {};   // v110: the 100 top-20-team cards get +3% to +8% from their real CL ratings (clBoost, set in cl.js), the rest +4%
      Object.keys(base.face).forEach(k => { face[k] = up(base.face[k]); }); Object.keys(base.sub).forEach(k => { sub[k] = up(base.sub[k]); });
      const rating = Math.min(93, up(base.rating)), nw = newStylesFor(base, sub);   // v209 (JODIO): every Champions League card tops out at 93
      const card = Object.assign({}, base, { id, rating, rarity: 'promo', promo, face, sub, rare: true, baseId, playStyles: psGate(rating, sub, base.playStyles.concat(nw ? [nw] : []), base.playStyles, 2) });
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 1.45 * 1.3);
      byId[id] = card; all.push(card);
      return card;
    }
    if (promo === 'nlpofm') {
      const nt = nlTier(base.nation, 2), up = v => clamp(Math.round(v * (1 + nt.pct / 100)), 1, 99), face = {}, sub = {};
      Object.keys(base.face).forEach(k => { face[k] = up(base.face[k]); }); Object.keys(base.sub).forEach(k => { sub[k] = up(base.sub[k]); });
      const rating = Math.min(nt.cap, up(base.rating)), news = NLPOFM[baseId] || [];
      const card = Object.assign({}, base, { id, rating, rarity: 'promo', promo, face, sub, rare: true, baseId, playStyles: psGate(rating, sub, news.concat(base.playStyles), news, 3) });
      card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 1.4);
      byId[id] = card; all.push(card);
      return card;
    }
    const face = {}; Object.keys(base.face).forEach(k => { face[k] = clamp(base.face[k] + boost + (k === 'def' && base.face[k] < 50 ? -boost : 0), 1, 99); });
    const sub = {}; Object.keys(base.sub).forEach(k => { sub[k] = clamp(base.sub[k] + boost, 1, 99); });
    const card = Object.assign({}, base, {
      id, rating: clamp(base.rating + boost, 1, 99), rarity: 'promo', promo, face, sub, rare: true,
      playStyles: base.playStyles.slice(), baseId,
    });
    card.value = roundToIncrement(valuation(card.rating, face, card.playStyles, card.position, true) * 1.4);
    byId[id] = card; all.push(card);
    return card;
  }

  /** PlayStyle rules for a card after boosts: Rapid+ 88+ sprint speed, Quick Step+ 88+ acceleration, never both, gold max 2 (`first` = names kept first). */
  /** v149: Power Shot and Finesse Shot (either tier) never share a player. The one he got first stays (an evolution's new one is refused when he already has the other). */
  function psExclusive(list, first) {
    const base = n => n.replace(/\+$/, ''), has = b => list.some(n => base(n) === b);
    if (!has('Power Shot') || !has('Finesse Shot')) return list;
    const drop = (first || []).some(n => base(n) === 'Power Shot') ? 'Power Shot' : (first || []).some(n => base(n) === 'Finesse Shot') ? 'Finesse Shot'
      : list.findIndex(n => base(n) === 'Power Shot') < list.findIndex(n => base(n) === 'Finesse Shot') ? 'Finesse Shot' : 'Power Shot';
    return list.filter(n => base(n) !== drop);
  }
  /** v157: an evolution never takes a card past 3 gold PlayStyles: it adds only what fits (a card that already has more keeps them and gets nothing). Returns { ps, cap }. */
  function evoPs(baseStyles, evoStyles) {
    const g = baseStyles.filter(isGold).length, room = Math.max(0, 3 - g), add = evoStyles.filter(x => !baseStyles.includes(x)).slice(0, room);
    return { ps: add, cap: Math.max(3, g) };
  }
  function psGate(rating, subStats, names, first, cap) {
    names = names.map(n => PS_ALIAS[n] || n); first = (first || []).map(n => PS_ALIAS[n] || n);
    const gold = Array.from(new Set(names.filter(isGold))), baseOf = n => n.replace(/\+$/, '');
    let l = gold;
    l = l.filter(x => (x !== 'Rapid+' || subStats.sprintSpeed >= 88) && (x !== 'Quick Step+' || subStats.acceleration >= 88));
    if (l.includes('Rapid+') && l.includes('Quick Step+')) l = l.filter(x => x !== (first.includes('Rapid+') ? 'Quick Step+' : 'Rapid+'));
    cap = cap || 2;   // NLPOFM cards may keep 3
    if (cap < 3 && rating < 86) cap = 1;   // v149: a card under 86 carries one gold PlayStyle at most
    if (rating >= 75 && l.length > cap) l = Array.from(new Set(first.concat(l))).filter(x => l.includes(x)).slice(0, cap);
    // Silver ones stay (the cap is for the gold ones); a silver is replaced by its own gold
    const have = new Set(l.map(baseOf)), silver = Array.from(new Set(names.filter(n => !isGold(n)))).filter(n => !have.has(n));
    return psExclusive(l.concat(silver), first);
  }
  /** v157 (JODIO): special (promo) cards are worth 30% more, on the market and when sold. */
  /** v226 (JODIO): face stat cap by OVR, 92 -> 95, 96 -> 98 (round(95 + (OVR-92)*0.75)). */
  function faceCap(r) { return clamp(Math.round(95 + (r - 92) * 0.75), 30, 99); }
  function capFace(c) { if (!c || !c.face) return c; const m = faceCap(c.rating); Object.keys(c.face).forEach(k => { if (c.face[k] > m) c.face[k] = m; }); return c; }
  /** v251 (JODIO): every Olise card has pace = overall, shooting = overall - 2, passing = overall + 2 (the sub-stats move by the same amount) */
  function oliseFix(c) {
    const want = { pac: c.rating, sho: c.rating - 2, pas: Math.min(99, c.rating + 2) };
    Object.keys(want).forEach(g => { const d = want[g] - c.face[g]; if (!d) return; c.face[g] = want[g]; (SUB_MAP[g] || []).forEach(k => { if (c.sub[k] != null) c.sub[k] = clamp(c.sub[k] + d, 1, 99); }); });
  }
  function registerPromo(baseId, promo, boost, newId) {
    const card = registerPromoRaw(baseId, promo, boost, newId);
    if (card) capFace(card);
    if (card && /Olise/.test(card.name)) oliseFix(card);
    if (card && !card.v157) { card.v157 = true; card.value = roundToIncrement(card.value * 1.3); }
    return card;
  }
  RUT.DB = {
    faceCap, capFace, psGate, evoPs, buildCard, synthCard,
    PS_GUIDE, LEAGUES, CLUBS, FLAGS, DEFAULT_FLAG, PLAYSTYLES, ALT_POS, CHEM_STYLES, SIGNATURES, applyChemStyle,
    signatureFor: c => (c ? SIGNATURES[c.name] || null : null),
    players,          // headline players (original 150 + JODIO's 150)
    reserves,         // generated fodder pool
    all,              // everything (incl. registered promos)
    byId, get: id => byId[id],
    registerPromo, clBoost, BDOR_IDS, AWARDS, AWARD_IDS, bdorRating, NLPOFM, NLSTAR_IDS, roundToIncrement, rng, hashStr, clamp,
    flagFor: n => FLAGS[n] || DEFAULT_FLAG,
    kitFor: club => (CLUBS[club] ? [CLUBS[club][1], CLUBS[club][2]] : ['#888888', '#ffffff']),
  };
  // the Nations League cards exist from the start so packs, the market and saves can all find them
  Object.keys(NLPOFM).forEach(id => registerPromo(id, 'nlpofm', 5));
  NLSTAR_IDS.forEach(id => registerPromo(id, 'nlstar', 3));
  // v249: Player of the Week / Month cards from potw_data.js; v258 (JODIO): the same player may get each card up to 3 times (the 2nd and 3rd are different cards, boost +100 / +200)
  const POTW_IDS = [], POTM_IDS = [], POTW_ENT = [], POTM_ENT = [], POT_INFO = {};
  try { const P = window.RUT && RUT.POTW_DATA, find = n => all.find(c => !c.promo && c.name === n), cnt = {};
    [['weeks', 'lpotw', POTW_IDS, POTW_ENT, 1], ['months', 'lpotm', POTM_IDS, POTM_ENT, 2]].forEach(([k, pr, out, ent, b]) => ((P && P[k]) || []).forEach(per => per.picks.forEach(p => { const c = find(p.name); if (!c) return; const key = pr + c.id, n = cnt[key] || 0; if (n >= 3) return; cnt[key] = n + 1; if (!n) out.push(c.id); const bo = b + 100 * n, card = registerPromo(c.id, pr, bo); if (card) { card.potInfo = { period: per.label, why: p.why, lg: p.lg }; POT_INFO[card.id] = card.potInfo; ent.push({ id: c.id, boost: bo }); } }))); } catch (e) { /* optional data */ }
  Object.assign(RUT.DB, { POTW_IDS, POTM_IDS, POTW_ENT, POTM_ENT, POT_INFO });
  // v257: Team of the Year / Team of the Season cards exist from their release time on
  const SEASON_IDS = { toty: [], tots: [] }, seasonLive = k => { const S = window.RUT && RUT.SEASON_DATA && RUT.SEASON_DATA[k]; return !!(S && Date.parse(S.release) <= Date.now()); };
  try { ['toty', 'tots'].forEach(k => { if (!seasonLive(k)) return; const S = RUT.SEASON_DATA[k], seen = {}; S.picks.forEach((p, i) => { const c = all.find(x => !x.promo && x.name === p.name); if (!c || seen[c.id]) return; seen[c.id] = 1; if (registerPromo(c.id, k, i + 1)) SEASON_IDS[k].push(c.id); }); }); } catch (e) { /* optional */ }
  Object.assign(RUT.DB, { SEASON_IDS, seasonLive });
  BDOR_IDS.forEach((id, i) => registerPromo(id, 'bdor', i + 1));
  AWARD_IDS.forEach((id, i) => { if (id) registerPromo(id, 'award', i + 1); });
})();
