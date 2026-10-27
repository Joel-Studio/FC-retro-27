/* =============================================================================
 * engine.js  —  1999 Arcade Match Engine (2.5D broadcast view, 3D ball / bodies / cloth nets)
 * -----------------------------------------------------------------------------
 * One simulation powers every mode:
 *   • PLAY    — you control the home side
 *   • CASUAL  — two people (one keyboard or two gamepads), or one vs the CPU
 *   • WATCH   — AI vs AI, rendered (1x / 4.5x speed)
 *   • SIM     — AI vs AI, headless, fast-forwarded to a final score
 *
 * Every stat goes through nrm(): 35 → 0 … 99 → 1, so a 91 is far better than a 60.
 *   Sprint Speed / Acceleration → top speed 5.4 … 10.2 m/s, accel 4.5 … 19.5 m/s²
 *   Agility + Balance            → turning; Dribbling → speed on the ball; Ball Control → first touch, heavy touches
 *   Short / Long Passing, Vision → pass speed, error, through-ball lead; Crossing for crosses
 *   Finishing / Long Shots       → shot error and the power-bar sweet spot; Shot Power → speed; Composure under pressure
 *   Tackles / Interceptions      → reach, success, lanes cut; Aggression → fouls; Strength → body checks (mass)
 *   GK Diving / Reflexes / Handling / Positioning → reach, save chance, catches vs parries, angles
 *   OVR → football brain (iq): 60 = poor decisions and slow reads, 90 = smart runs, marking, shot selection
 *
 * Controls (one player):  Arrows/WASD move · SHIFT sprint
 *   Z / J  pass          (defending: standing tackle)
 *   X / K  shoot, aim with ↑/↓  (defending: slide tackle)
 *   C / L  through ball  (defending: switch player)
 *   V / I  lob, long ball or cross (defending: hold for a team-mate to press)
 *   On the ball every button charges a power bar while held and fires on release.
 * Skill moves (on the ball, hold a direction): Q or SPACE = the player's own signature dribble (3 s cooldown) · E stepover · R body feint (P1: Q Y E R, P2: 7 0 8 9).
 * Two players: P1 WASD + L-Shift, F G H T · P2 arrows + R-Shift, J K L I (or , . / ; and numpad 0-4).
 * Gamepads: A pass, B shoot, X through, Y lob, bumpers / triggers sprint. M cycles the camera (TV / wide / close).
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';

  /* ----------------------------- constants ------------------------------- */
  let PITCH_W = 105, PITCH_H = 68, PW2 = 52.5, PH2 = 34;                // the pitch can be resized per match (setPitch): PW2/PH2 are its centre
  const IC_PSC = 3, SH_PSC = 2;                                          // reach and appetite grow with the pitch (a bigger pitch spreads the play, so shots and interceptions would dry up)
  let PSC = 1;                                                           // how much bigger the pitch is than the standard one (linear); used to keep reach and shot appetite in proportion
  const GOAL_HALF = 8.0, GOAL_H = 3.4;                                   // JODIO's big arcade goal: 16 m wide (twice the old width) and 3.4 m high
  const LEARN_FIRST = 12, LEARN_EVERY = 12;                           // seconds into the match of the first read of the other side's play, then how often the AI re-reads it
  const DEF_PUSH = 0.1, DEF_LINE = 3, DEF_UP = 4, DEF_HOLD = 0.25, DEF_FOLLOW = 9;   // v91: AI defenders hold a higher line (depth cap and line shift, metres)
  const AI_SHOOT = 1.5;                                                  // AI shot appetite
  const HOT_SHOOT = 0.6, HOT_SKILL = 0.7, HOT_DEFK = 0.8, HOT_TKL = 0.15, HOT_SPREAD = 1.45, HOT_SAVE = 0.12;   // Top 5 "hot" scoring
  const VCAP = 29 / 3.6;                                                 // the top speed of the whole game: 29 km/h
  const TRX = (typeof window !== 'undefined' && window.__TRX != null) ? window.__TRX : 2, tx2 = m => Math.max(0.05, 1 + (m - 1) * TRX);                // v128: traits and roles act 2x as strongly for AI-driven players (multiplier m becomes 1 + (m-1)*2)
  const PACE = 0.8;                                                      // every player's top speed is scaled by this (JODIO: 20% slower)
  const PITCH_SIZES = { standard: [105, 80], large: [130, 96], huge: [160, 116], colossal: [200, 145] };   // taller than the real 68 m so there is room for the wide goals
  const PITCH_GROW = 1;                // v218 grew pitches 40%; v219 (JODIO: "the tactics board, not the field") back to 1
  function setPitch(w, h) {
    w = clamp(Math.round(w * PITCH_GROW), 70, 280); h = clamp(Math.round(h * PITCH_GROW), 50, 203);
    if (w === PITCH_W && h === PITCH_H) return;
    PITCH_W = w; PITCH_H = h; PW2 = w / 2; PH2 = h / 2; PSC = Math.sqrt(w * h / 8400);
    if (typeof GFX !== 'undefined' && GFX) GFX.ground = null;           // ground and stands are rebuilt for the new size on the next frame
  }
  const PPM = 6;                       // pixels per metre (internal resolution)
  const MARGIN = 6;                    // metres of stands drawn around the pitch
  let VIEW_W = 480; const VIEW_H = 360, VOFF = (360 - 270) / 2;    // logical drawing space (16:9); the canvas itself is 1280x720 and the context is scaled by SC
  const OUT_W = 1440, OUT_H = 1080;   // default size; the real canvas matches the window's aspect at 1080 lines
  let SC = OUT_H / VIEW_H;            // device pixels per logical pixel; drops automatically on slow machines
  const ACTOR_BIG = 1.4;               // players and ball are drawn this much larger than true scale for readability
  const PLAYER_BIG = ACTOR_BIG * 0.9, BALL_BIG = 2.4;   // v176 (JODIO, from a real TV frame): players 10% smaller, ball 2x, so the ball is about a fifth of a player's height
  const FORMATION_433 = [              // home side, attacking → (+x)
    [4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [35, 34], [43, 22], [47, 45], [62, 11], [66, 34], [62, 57],
  ];

  /* ------------------------- formations and tactical styles ------------------------- */
  // A formation lists 11 home positions (x metres from own goal, y across a 105x68 pitch; stretched to the real pitch) by slot. Slot 0 is the keeper,
  // slots 1..nDef the back line, nDef+1..fwdFrom-1 the midfield, fwdFrom..10 the forwards. The AI reads roles from these numbers, not from fixed slots.
  const FORMATIONS = {
    '433': { nDef: 4, fwdFrom: 8, pts: FORMATION_433 },
    '442': { nDef: 4, fwdFrom: 9, pts: [[4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [42, 13], [37, 28], [37, 40], [42, 55], [60, 27], [60, 41]] },
    '352': { nDef: 3, fwdFrom: 9, pts: [[4, 34], [20, 17], [18, 34], [20, 51], [40, 5], [33, 34], [44, 22], [44, 46], [40, 63], [62, 26], [62, 42]] },
    '3331': { nDef: 3, fwdFrom: 8, pts: [[4, 34], [24, 16], [22, 34], [24, 52], [38, 20], [34, 34], [38, 48], [50, 34], [62, 10], [66, 34], [62, 58]] },
    '532': { nDef: 5, fwdFrom: 9, pts: [[4, 34], [24, 6], [18, 21], [13, 34], [18, 47], [24, 62], [30, 22], [30, 34], [30, 46], [50, 27], [50, 41]] },
    // v97: more shapes for the club's own formation picker (slot order as in RUT.State.FORMS)
    '4231': { nDef: 4, fwdFrom: 10, pts: [[4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [34, 26], [34, 42], [50, 11], [48, 34], [50, 57], [66, 34]] },
    '451': { nDef: 4, fwdFrom: 10, pts: [[4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [44, 9], [40, 25], [34, 34], [40, 43], [44, 59], [64, 34]] },
    '343': { nDef: 3, fwdFrom: 8, pts: [[4, 34], [22, 17], [19, 34], [22, 51], [40, 8], [36, 26], [36, 42], [40, 60], [60, 11], [66, 34], [60, 57]] },
    '541': { nDef: 5, fwdFrom: 10, pts: [[4, 34], [24, 6], [18, 21], [13, 34], [18, 47], [24, 62], [38, 12], [34, 28], [34, 40], [38, 56], [62, 34]] },
    // v118: the four playbook shapes the game did not have yet (diamond, 3-2-4-1, box, Christmas tree)
    '4121': { nDef: 4, fwdFrom: 9, pts: [[4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [32, 34], [42, 22], [42, 46], [52, 34], [64, 27], [64, 41]] },
    '3241': { nDef: 3, fwdFrom: 10, pts: [[4, 34], [22, 17], [19, 34], [22, 51], [34, 26], [34, 42], [48, 8], [50, 26], [50, 42], [48, 60], [66, 34]] },
    '4222': { nDef: 4, fwdFrom: 9, pts: [[4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [34, 26], [34, 42], [50, 20], [50, 48], [64, 27], [64, 41]] },
    '4321': { nDef: 4, fwdFrom: 10, pts: [[4, 34], [22, 10], [19, 26], [19, 42], [22, 58], [38, 22], [34, 34], [38, 46], [52, 24], [52, 44], [66, 34]] },
  };
  const FORM_KEYS = ['433', '442', '4231', '451', '352', '343', '3331', '532', '541', '4121', '3241', '4222', '4321'];   // the index is the one-character code in a tactic string ('2-2-2|wings@1' = 4-4-2)
  // Style knobs (all 1 / 0 = the balanced default). line: block shift toward the opponent in metres; width: stretch across the pitch; press: how many
  // players swarm the carrier; pressZone: the own-end share of the pitch in which they press (below it they drop and contain); counterPress: seconds
  // of all-out pressing after losing the ball; vert/shortW/range/eager: passing taste (forward, short, long, keen to pass); targetMan: bonus for passing
  // to forwards; counter: bonus for the quick ball forward in the seconds after winning it; cross: wide carriers in the final third cross; runs: runners
  // in behind; manMark: man-to-man strength; libero: slot that sweeps behind the line; trap: the whole line steps up as one; restGap: how far behind the
  // ball the back line stays while attacking; fbHigh/fbIn: full-backs push up / tuck inside; pivot: the first midfielder drops between the centre-backs;
  // drop9 / inside: the false nine drops deep while the wingers cut in; rotate: seconds between positional swaps; lanes: spread over five vertical
  // lanes (at most two per lane); aggro: how hard they tackle (more fouls and cards); longShot: appetite for shooting from range.
  const TAC_DEF = { name: 'Balanced', blurb: 'The standard 4-3-3.', backFwd: 0, link: 0, formation: '433', line: 0, width: 1, press: 1, pressZone: 1, counterPress: 0, vert: 1, shortW: 1, range: 1, eager: 0, targetMan: 0, counter: 0,
    shoot: 1, cross: 0, runs: 2, runsFwd: false, manMark: 0, libero: 0, trap: false, squeeze: 0.75, restGap: 4, fbSlots: [1, 4], fbHigh: 0, fbIn: 0, pivot: false, drop9: 0, inside: 0, rotate: 0, lanes: false, aggro: 1, longShot: 1 };
  const mkT = o => Object.assign({}, TAC_DEF, o);
  /* The tactics system. A team has 6 tactic points over three bars (Attack, Midfield, Defence, 0..3 each; if one bar has 3 the others
     stop at 2) and one tactical trait (a playing style) that also picks the role every position plays. A tactic is a string "A-M-D|trait",
     for example "3-2-1|longball", so it travels through the net layer like the old style names did. */
  const TACTIC_TRAITS = {
    longball: { name: 'Long ball', blurb: 'Hit it early and long. Poacher on the last defender, wingers sprinting far upfront, a shadow striker behind, holding midfielders.',
      add: { range: 0.6, vert: 0.6, targetMan: 6, cross: 0.25, longShot: 0.3, counter: 0.3 }, set: {},
      roles: { GK: 'gk-stop', CB: 'cb-stop', FB: 'fb-def', DM: 'dm-hold', CM: 'cm-b2b', AM: 'am-sh', W: 'w-run', ST: 'st-poach' } },
    tikitaka: { name: 'Tiki-taka', blurb: 'Short quick passing, a deep pivot, high full-backs and a counter-press after every loss.',
      add: { shortW: 0.5, eager: 3, vert: -0.4, range: -0.3, shoot: -0.1, longShot: -0.4, counterPress: 3, fbHigh: 6 }, set: { pivot: true },
      roles: { GK: 'gk-sweep', CB: 'cb-ball', FB: 'fb-att', DM: 'dm-reg', CM: 'cm-met', AM: 'am-10', W: 'w-inv', ST: 'st-f9' } },
    gegen: { name: 'Gegenpress', blurb: 'Win it back at once: three or four swarm the carrier, then straight vertical passes.',
      add: { press: 2, counterPress: 5, vert: 0.6, aggro: 0.3, restGap: 3, runs: 1 }, set: {},
      roles: { GK: 'gk-sweep', CB: 'cb-stop', FB: 'fb-att', DM: 'dm-des', CM: 'cm-b2b', AM: 'am-sh', W: 'w-run', ST: 'st-prs' } },
    counter: { name: 'Counter-attack', blurb: 'Sit, absorb, then break at pace: fast balls in behind for a channel runner and wide targets.',
      add: { counter: 1, vert: 0.8, range: 0.3, runs: 1, shoot: 0.1, line: -4, pressZone: -0.2 }, set: { runsFwd: true },
      roles: { GK: 'gk-stop', CB: 'cb-stop', FB: 'fb-def', DM: 'dm-des', CM: 'cm-car', AM: 'am-sh', W: 'w-run', ST: 'st-chn' } },
    wings: { name: 'Wing play', blurb: 'Touchline wingers, overlapping wing-backs, crosses for a target man.',
      add: { width: 0.25, cross: 0.5, targetMan: 3, fbHigh: 6, shoot: 0.1 }, set: {},
      roles: { GK: 'gk-stop', CB: 'cb-stop', FB: 'fb-wb', DM: 'dm-reg', CM: 'cm-b2b', AM: 'am-10', W: 'w-trad', ST: 'st-tar' } },
    positional: { name: 'Positional play', blurb: 'Five vertical lanes, at most two players per lane, inverted full-backs and attacks through the half-spaces.',
      add: { shortW: 0.3, eager: 2, vert: -0.2, fbIn: 0.4 }, set: { lanes: true, pivot: true },
      roles: { GK: 'gk-sweep', CB: 'cb-ball', FB: 'fb-inv', DM: 'dm-piv', CM: 'cm-miz', AM: 'am-fw', W: 'w-inv', ST: 'st-2nd' } },
    lowblock: { name: 'Low block', blurb: 'A deep 5-3-2: everybody behind the ball, a sweeper, man-marking, then a quick counter.',
      add: { line: -8, pressZone: -0.3, backFwd: 8, vert: 0.8, range: 0.5, counter: 0.6, aggro: 0.25, manMark: 0.4 }, set: { formation: '532', libero: 3, fbSlots: [1, 5] },
      roles: { GK: 'gk-stop', CB: 'cb-stop', FB: 'fb-def', DM: 'dm-hold', CM: 'cm-met', AM: 'am-sh', W: 'w-def', ST: 'st-tar' } },
    total: { name: 'Total football', blurb: 'Nobody has a fixed position: players rotate and every outfielder joins the attack.',
      add: { rotate: 9, runs: 1, shortW: 0.2 }, set: {},
      roles: { GK: 'gk-sweep', CB: 'cb-hyb', FB: 'fb-att', DM: 'dm-car', CM: 'cm-b2b', AM: 'am-free', W: 'w-inv', ST: 'st-comp' } },
    falsenine: { name: 'False nine', blurb: 'The striker drops into midfield, the wingers cut in and attack the empty box.',
      add: { drop9: 22, inside: 0.7, shortW: 0.2, shoot: -0.1 }, set: {},
      roles: { GK: 'gk-sweep', CB: 'cb-ball', FB: 'fb-att', DM: 'dm-reg', CM: 'cm-miz', AM: 'am-sh', W: 'w-inv', ST: 'st-f9' } },
    highline: { name: 'High line', blurb: 'The whole line steps up as one and traps offside, a sweeper-keeper behind it, a hard press up front.',
      add: { line: 8, press: 1, counterPress: 3, aggro: 0.2 }, set: { trap: true, squeeze: 0.65 },
      roles: { GK: 'gk-sweep', CB: 'cb-ball', FB: 'fb-att', DM: 'dm-piv', CM: 'cm-b2b', AM: 'am-10', W: 'w-run', ST: 'st-prs' } },
  };
  /* v210 (JODIO): FC 27 tactics. A build-up style, a defensive approach, a line height (0..100) and a tactical preset, laid over the plain 2-2-2 side.
     Tactic string "F<build><defence><line 00-99><preset>@<formation>", e.g. "Fsh75p@0" (Possession: Short Passing, High, 75, 4-3-3). The roles of
     the preset reach AI sides through T.roles (by position group); the club's own role + focus per position travels on its cards. */
  const FC_BUILD = {
    b: { name: 'Balanced', blurb: 'Mixes short and direct passing.', add: {} },
    s: { name: 'Short Passing', blurb: 'Patient short passes, players come close to offer.', add: { shortW: 0.5, eager: 3, vert: -0.4, range: -0.3, longShot: -0.3, link: 0.5 }, set: { pivot: true } },
    c: { name: 'Counter', blurb: 'Wins it and goes forward fast, runners break in behind.', add: { counter: 0.9, vert: 0.8, range: 0.3, runs: 1, shoot: 0.1 }, set: { runsFwd: true } },
    l: { name: 'Long Ball', blurb: 'Skips midfield with long balls to the forwards.', add: { range: 0.6, vert: 0.6, targetMan: 5, cross: 0.2, counter: 0.3 } },
  };
  const FC_DEF = {
    b: { name: 'Balanced', ln: 50, blurb: 'A mid block that presses when the ball comes close.', add: {} },
    d: { name: 'Deep', ln: 25, blurb: 'Drops deep and stays compact, little pressing.', add: { pressZone: -0.35, press: -1, counterPress: -2, backFwd: 6, restGap: 4 } },
    h: { name: 'High', ln: 75, blurb: 'Pushes up, squeezes the space and plays offside.', add: { press: 1, counterPress: 3 }, set: { trap: true, squeeze: 0.6 } },
    a: { name: 'Aggressive', ln: 65, blurb: 'Hunts the ball everywhere with hard tackles and a counter-press.', add: { press: 2, counterPress: 5, aggro: 0.3, restGap: 2 } },
  };
  const FC_PRESETS = {
    s: { name: 'Standard', form: '4231', bu: 'b', da: 'b', ln: 50, add: {}, blurb: 'A balanced side that can do a bit of everything.',
      roles: { GK: 'fc-gk:d', CB: 'fc-def:d', FB: 'fc-fb:b', DM: 'fc-dlp:u', CM: 'fc-b2b:b', AM: 'fc-pm:b', W: 'fc-wng:b', ST: 'fc-af:a' } },
    w: { name: 'Wing Play', form: '442', bu: 'b', da: 'b', ln: 50, add: { width: 0.25, cross: 0.5, targetMan: 3, fbHigh: 6 }, blurb: 'Wide wingers and overlapping wing-backs cross for a target forward.',
      roles: { GK: 'fc-gk:d', CB: 'fc-def:d', FB: 'fc-awb:a', DM: 'fc-hold:d', CM: 'fc-b2b:b', AM: 'fc-pm:b', W: 'fc-wng:a', ST: 'fc-tf:a' } },
    p: { name: 'Possession', form: '433', bu: 's', da: 'h', ln: 65, add: { shortW: 0.2, eager: 2 }, set: { lanes: true }, blurb: 'Keep the ball, move it through the lines, win it back high.',
      roles: { GK: 'fc-bpk:u', CB: 'fc-bpd:u', FB: 'fc-iwb:b', DM: 'fc-dlp:u', CM: 'fc-pm:r', AM: 'fc-pm:r', W: 'fc-wpm:b', ST: 'fc-f9:u' } },
    c: { name: 'Counter Attack', form: '4231', bu: 'c', da: 'd', ln: 30, add: {}, blurb: 'Sit deep, then break at pace with runners in behind.',
      roles: { GK: 'fc-gk:d', CB: 'fc-stp:d', FB: 'fc-fb:d', DM: 'fc-hold:d', CM: 'fc-b2b:b', AM: 'fc-ss:a', W: 'fc-if:a', ST: 'fc-af:a' } },
    l: { name: 'Long Ball', form: '442', bu: 'l', da: 'b', ln: 45, add: {}, blurb: 'Hit it long to a target forward and win the second ball.',
      roles: { GK: 'fc-gk:d', CB: 'fc-stp:d', FB: 'fc-fb:d', DM: 'fc-hold:d', CM: 'fc-b2b:b', AM: 'fc-ss:a', W: 'fc-wng:a', ST: 'fc-tf:a' } },
    h: { name: 'High Press', form: '433', bu: 'b', da: 'a', ln: 80, add: {}, set: { trap: true, squeeze: 0.65 }, blurb: 'Everybody presses high and wins the ball near their goal.',
      roles: { GK: 'fc-swk:a', CB: 'fc-stp:a', FB: 'fc-wb:b', DM: 'fc-hold:b', CM: 'fc-b2b:a', AM: 'fc-ss:a', W: 'fc-if:b', ST: 'fc-af:a' } },
    t: { name: 'Tiki-Taka', form: '433', bu: 's', da: 'h', ln: 70, add: { shortW: 0.4, eager: 3, counterPress: 3 }, set: { pivot: true }, blurb: 'Short quick passing triangles and a counter-press after every loss.',
      roles: { GK: 'fc-bpk:u', CB: 'fc-bpd:u', FB: 'fc-fsb:b', DM: 'fc-dlp:u', CM: 'fc-pm:u', AM: 'fc-pm:r', W: 'fc-if:r', ST: 'fc-f9:r' } },
    b: { name: 'Park the Bus', form: '532', bu: 'c', da: 'd', ln: 10, add: { manMark: 0.4, backFwd: 8 }, set: { libero: 3, fbSlots: [1, 5] }, blurb: 'Five at the back, everybody behind the ball, then a long clearance.',
      roles: { GK: 'fc-gk:d', CB: 'fc-def:d', FB: 'fc-fb:d', DM: 'fc-chf:d', CM: 'fc-hold:d', AM: 'fc-ss:b', W: 'fc-wm:d', ST: 'fc-tf:b' } },
    x: { name: 'Custom', form: '', bu: 'b', da: 'b', ln: 50, add: {}, blurb: 'Your own mix.', roles: null },
  };
  const TAC_MAXPTS = 6, TAC_GAIN = 1.5;
  /** Normalise points: each bar 0..3, the total at most 6, and a bar on 3 keeps the others at 2 or less. */
  function tacFix(a, m, d) {
    let v = [a, m, d].map(x => clamp(Math.round(+x || 0), 0, 3));
    if (v.includes(3)) { const k = v.indexOf(3); v = v.map((x, i) => i === k ? 3 : Math.min(x, 2)); }
    while (v[0] + v[1] + v[2] > TAC_MAXPTS) { const k = v.indexOf(Math.max(...v)); v[k]--; }
    return v;
  }
  function parseTactic(spec) {
    spec = String(spec || '');
    let form = '';
    { const k = spec.indexOf('@'); if (k >= 0) { form = FORM_KEYS[+spec.slice(k + 1)] || ''; spec = spec.slice(0, k); } }      // '@n': the club's chosen formation
    { const f = /^F([bscl])([bdha])(\d\d)([a-z])/.exec(spec); if (f) return { a: 2, m: 2, d: 2, trait: '', form, fc: { bu: f[1], da: f[2], ln: +f[3], pr: FC_PRESETS[f[4]] ? f[4] : 'x' } }; }
    if (TACTIC_TRAITS[spec]) spec = '2-2-2|' + spec;
    const [pts, tr] = spec.split('|'), n = (pts || '').split('-');
    const v = n.length === 3 ? tacFix(n[0], n[1], n[2]) : [2, 2, 2];
    return { a: v[0], m: v[1], d: v[2], trait: TACTIC_TRAITS[tr] ? tr : '', form };
  }
  const tacSpec = t => (t.fc ? 'F' + t.fc.bu + t.fc.da + String(clamp(Math.round(t.fc.ln), 0, 99)).padStart(2, '0') + (t.fc.pr || 'x') : t.a + '-' + t.m + '-' + t.d + '|' + (t.trait || '')) + (t.form && FORM_KEYS.indexOf(t.form) >= 0 ? '@' + FORM_KEYS.indexOf(t.form) : '');
  const _tacCache = {};
  /** The engine knobs for a tactic string. Attack = high line, runs in behind, shots, quick forward balls; Midfield = short passing, the forwards come
      deep to play; Defence = low block, little pressing, and the attackers drop back as well when the ball is lost. */
  function rawTactic(P0) {
    if (P0.fc) {   // v210: FC 27 tactic: the plain side, then build-up, defensive approach, line height and the preset's own touches
      const T = rawTactic({ a: 2, m: 2, d: 2, trait: '' }), f = P0.fc;
      [FC_BUILD[f.bu], FC_DEF[f.da], FC_PRESETS[f.pr]].forEach(x => { if (!x) return; Object.keys(x.add || {}).forEach(k => { T[k] = (T[k] || 0) + x.add[k]; }); Object.assign(T, x.set || {}); });
      T.line = (clamp(f.ln, 0, 99) - 50) / 50 * 12;
      T.pressZone = clamp(T.pressZone, 0.3, 1); T.press = clamp(Math.round(T.press), 1, 5); T.shortW = clamp(T.shortW, 0.7, 2);
      return T;
    }
    const { a, m, d } = P0, tt = TACTIC_TRAITS[P0.trait], T = Object.assign({}, TAC_DEF);
    T.line = 5 * (a - 2) - 7 * (d - 2);
    T.width = 1 + 0.06 * (a - 2) - 0.04 * (d - 2);
    T.pressZone = [1, 1, 0.85, 0.4][d];
    T.press = clamp(2 + 0.5 * (a - 2) + 0.5 * (m - 2) - 0.5 * (d - 2), 1, 4);
    T.counterPress = clamp(2 + 2 * (a - 2) + (m - 2) - 3 * (d - 2), 0, 9);
    T.runs = [0, 1, 2, 3][a]; T.runsFwd = a === 3;
    T.counter = [0, 0.3, 0.6, 1.1][a]; T.shoot = 1 + 0.07 * (a - 2); T.fbHigh = [0, 0, 4, 10][a];
    T.vert = clamp(1 + 0.15 * (a - 2) - 0.25 * (m - 2), 0.5, 2.2);
    T.shortW = [0.9, 1, 1.2, 1.5][m]; T.eager = [0, 0, 0, 1][a] + [0, 1, 2, 4][m];
    T.pivot = m >= 2; T.lanes = m === 3; T.drop9 = [0, 0, 8, 18][m]; T.inside = [0, 0, 0.2, 0.5][m]; T.link = [0, 0, 0.5, 1][m];
    T.backFwd = [0, 0, 3, 14][d]; T.restGap = [2, 3, 6, 10][d]; T.aggro = 1 + 0.08 * (d - 2) + 0.05 * (a - 2);
    if (tt) {
      Object.keys(tt.add).forEach(k => { T[k] = (T[k] || 0) + tt.add[k]; });
      Object.assign(T, tt.set);
      T.pressZone = clamp(T.pressZone, 0.3, 1); T.press = clamp(Math.round(T.press), 1, 5); T.shortW = clamp(T.shortW, 0.7, 2);
    }
    return T;
  }
  const GAIN_KEYS = ['line', 'width', 'press', 'pressZone', 'counterPress', 'vert', 'shortW', 'range', 'eager', 'targetMan', 'counter', 'cross', 'runs', 'fbHigh', 'fbIn', 'backFwd', 'restGap', 'drop9', 'inside', 'link', 'aggro', 'longShot', 'manMark', 'shoot'];
  function buildTactic(spec, gain) {
    const P0 = parseTactic(spec), key = tacSpec(P0) + (gain ? '#' + gain : '');
    if (_tacCache[key]) return _tacCache[key];
    const { a, m, d } = P0, tt = TACTIC_TRAITS[P0.trait], T = rawTactic(P0), B0 = rawTactic(parseTactic('2-2-2|'));
    // v94: tactics are felt, not hinted at: every knob's distance from the plain 2-2-2 side is stretched by half again (line height, width, press, directness, crosses, runs...)
    GAIN_KEYS.forEach(k => { if (typeof T[k] === 'number' && typeof B0[k] === 'number') T[k] = B0[k] + (T[k] - B0[k]) * (gain || TAC_GAIN); });
    T.width = clamp(T.width, 0.8, 1.4); T.pressZone = clamp(T.pressZone, 0.25, 1); T.press = clamp(Math.round(T.press), 1, 5); T.vert = clamp(T.vert, 0.4, 2.8); T.shortW = clamp(T.shortW, 0.6, 2.4);
    T.counterPress = clamp(T.counterPress, 0, 12); T.runs = clamp(Math.round(T.runs), 0, 4); T.restGap = Math.max(1, T.restGap); T.shoot = clamp(T.shoot, 0.7, 1.5); T.cross = clamp(T.cross, 0, 1.2); T.backFwd = Math.max(0, T.backFwd); T.eager = Math.max(0, T.eager); T.fbHigh = Math.max(0, T.fbHigh);
    T.name = (tt ? tt.name : 'Balanced') + ' ' + a + '-' + m + '-' + d;
    T.blurb = (tt ? tt.blurb + ' ' : '') + 'Attack ' + a + ', Midfield ' + m + ', Defence ' + d + '.';
    T.roles = tt ? tt.roles : null; T.spec = key;
    if (P0.fc) {
      const f = P0.fc, pr = FC_PRESETS[f.pr];
      T.name = pr.name + ' · ' + FC_BUILD[f.bu].name + ' · ' + FC_DEF[f.da].name + ' ' + f.ln;
      T.blurb = (f.pr !== 'x' ? pr.blurb + ' ' : '') + 'Build-up: ' + FC_BUILD[f.bu].blurb + ' Defence: ' + FC_DEF[f.da].blurb + ' Line height ' + f.ln + '.';
      T.roles = pr.roles || FC_PRESETS.s.roles; T.fc = f;
    }     // an AI side keeps its 4-3-3 (its cards are picked for it); the club's preset changes the club's own formation, which comes in as '@'
    if (P0.fc && P0.form && FORMATIONS[P0.form]) { T.formation = P0.form; T.formKey = P0.form; }
    if (P0.fc && T.formation !== '532') { T.libero = TAC_DEF.libero; T.fbSlots = TAC_DEF.fbSlots; }     // the sweeper / wing-back slots of Park the Bus only fit its 5-3-2
    if (P0.form && FORMATIONS[P0.form]) { T.formation = P0.form; T.formKey = P0.form; }     // the club's own formation beats the trait's shape
    return (_tacCache[key] = T);
  }
  const PS = n => n; // readability helper for PlayStyle names
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const len = (x, y) => Math.sqrt(x * x + y * y);
  const dist = (a, b) => len(a.x - b.x, a.y - b.y);
  /** Any attribute → 0..1 (35 → 0, 99 → 1). Every stat drives the engine through this curve, so a 91 is far better than a 60. */
  const nrm = v => clamp(((v == null ? 55 : v) - 35) / 64, 0, 1);
  /** v108: per-team play counters (passes, shots by zone, recoveries, shape...). Cheap, always on: they feed the play-style page, the highlights and the coach's before / after proof. */
  const mkRS = () => ({ pass: 0, fwd: 0, back: 0, long: 0, short: 0, lob: 0, thru: 0, cross: 0, lane: [0, 0, 0], shot: 0, sot: 0, box: 0, edge: 0, far: 0, gBox: 0, gEdge: 0, gFar: 0, skill: 0, tk: 0, tkw: 0, foul: 0, won: 0, wonHigh: 0, lost: 0, lostOwn: 0, save: 0, post: 0, lineS: 0, lineN: 0, widS: 0, widN: 0 });
  /** v108 coach: a set of knob changes ({add:{knob:delta}, set:{}, roles:{GROUP:role}}) laid over a built tactic (a copy), clamped like buildTactic does. */
  function applyCoach(T0, K) {
    const T = Object.assign({}, T0), add = K.add || {};
    Object.keys(add).forEach(k => { T[k] = (typeof T[k] === 'number' ? T[k] : 0) + add[k]; });
    Object.assign(T, K.set || {});
    if (K.roles) T.roles = Object.assign({}, T.roles || {}, K.roles);
    T.width = clamp(T.width, 0.8, 1.45); T.pressZone = clamp(T.pressZone, 0.25, 1); T.press = clamp(Math.round(T.press), 1, 5); T.vert = clamp(T.vert, 0.4, 2.8); T.shortW = clamp(T.shortW, 0.6, 2.4);
    T.counterPress = clamp(T.counterPress, 0, 12); T.runs = clamp(Math.round(T.runs), 0, 4); T.restGap = Math.max(1, T.restGap); T.shoot = clamp(T.shoot, 0.6, 1.8); T.cross = clamp(T.cross, 0, 1.4);
    T.backFwd = Math.max(0, T.backFwd); T.eager = Math.max(0, T.eager); T.fbHigh = Math.max(0, T.fbHigh); T.aggro = clamp(T.aggro, 0.4, 2); T.manMark = clamp(T.manMark, 0, 1); T.longShot = Math.max(0, T.longShot);
    T.range = clamp(T.range, 0.4, 2.2); T.targetMan = Math.max(0, T.targetMan); T.counter = clamp(T.counter, 0, 2); T.link = clamp(T.link, 0, 2); T.drop9 = Math.max(0, T.drop9); T.inside = clamp(T.inside, 0, 1.2); T.fbIn = clamp(T.fbIn, 0, 1.2); T.rotate = Math.max(0, T.rotate);
    T.coach = true; T.name = T.name + ' + Coach';
    return T;
  }

  /* --------------------- pitch condition, ball model, shot assist ------------------ */
  /** roll: rolling resistance (rain makes the ball run on), grip: how much a bounce bites (skids on wet turf), irr: random bounce on a worn pitch. */
  const SURF = {
    dry:  { name: 'Firm & dry', roll: 1,    grip: 1,    bounce: 1,    irr: 0,    slick: 0 },
    wet:  { name: 'Rain',       roll: 0.55, grip: 0.45, bounce: 0.94, irr: 0.02, slick: 1 },
    worn: { name: 'Worn',       roll: 1.35, grip: 0.8,  bounce: 0.9,  irr: 0.16, slick: 0 },
  };
  /** drag / magnus scale air resistance and swerve, mass the weight of a touch, bounce the restitution. */
  const BALLS = {
    match:   { name: 'Match ball', drag: 1,    magnus: 1,    bounce: 1,    mass: 1 },
    classic: { name: 'Classic',    drag: 0.85, magnus: 0.8,  bounce: 0.96, mass: 1.15 },
    light:   { name: 'Light',      drag: 1.2,  magnus: 1.3,  bounce: 1.04, mass: 0.9 },
  };
  /** aim: error cut; power: share of a mistimed power-bar correction; time: how much a mistimed press is softened; win: green window (s). */
  const ASSIST = {
    full:   { aim: 0.5,  power: 0, time: 0.7, win: 0.14, needPress: false },   // v197 (JODIO): full auto picks the side only; the power is whatever you charged
    semi:   { aim: 0.45, power: 0.6,  time: 0.55, win: 0.14, needPress: false },
    manual: { aim: 1,    power: 0,   time: 0,    win: 0.075, needPress: true },
  };

  /* ------------------------------ Player --------------------------------- */
  function makePlayer(card, team, slot, rng, troles, fpos) {
    const s = card.sub, ps = new Set(card.playStyles);
    const pf = {}; card.playStyles.forEach(n => { pf[n.replace(/\+$/, '')] = /\+$/.test(n) ? 1.5 : 0.55; });   // v148: PlayStyle tier factor (Silver 0.55); v167 (JODIO): PlayStyle+ is 1.5, half as strong again as before
    const isGK = card.position === 'GK' || slot === 0;
    // role play (js/roles.js): his traits with the role of his pitch slot layered on top (a chosen role on the card, else the best fit)
    const rpos = RUT.State && RUT.State.BASE_FORMATION && slot >= 0 && slot < 11 ? (fpos || RUT.State.BASE_FORMATION)[slot] : card.position;   // the labels of the team's own formation (AI sides: 4-3-3)
    // the team's tactical trait picks the role for the position, unless the card has a role of its own chosen for that position group
    const rg = RUT.roleGroup ? RUT.roleGroup(rpos) : null, own = card.role && RUT.ROLE_BY && RUT.roleFits(RUT.ROLE_BY[card.role], rg);
    const chosen = !own && troles && rg && troles[rg] ? troles[rg] : undefined;
    const role = RUT.roleOf ? RUT.roleOf(card, rpos, chosen) : null;
    const tr = RUT.effectiveTags ? RUT.effectiveTags(card, rpos, chosen) : (RUT.traitsFor ? RUT.traitsFor(card) : new Set());   // trait tags (js/traits.js) that steer the AI
    const n = v => clamp(((v == null ? 55 : v) - 35) / 64, 0, 1);   // stat → 0..1
    // top speed (JODIO v85): a 99 sprint speed runs at 29 km/h, the fastest speed anyone can reach, and Mbappé (94) at 28 km/h; 0.2 km/h per point below that, nobody under 18 km/h
    const spd = v => clamp(VCAP - (99 - (v == null ? 55 : v)) * 0.0556, 5.0, VCAP);
    const sprint = spd(s.sprintSpeed);
    // defending catch-up: while chasing a ball carrier, pace counts as 85/80 (x1.0625) of the defender's own stat, so 80 pace can run down 85 pace, 70 can run down 74.4, 90 down 95.6
    const A80 = 4.5 + 15 * Math.pow(n(80), 1.1), defK = isGK ? 1 : spd(Math.min(99, (s.sprintSpeed == null ? 55 : s.sprintSpeed) * 1.0625)) / spd(s.sprintSpeed);
    return {
      defK, card, team, slot, isGK, ps, pf, fpos: rpos, name: card.name.split(' ').slice(-1)[0].toUpperCase(),
      iq: clamp((card.rating - 60) / 30, -0.25, 1.15) + (role && role.fc && RUT.roleFam ? [-0.04, 0.04, 0.08][RUT.roleFam(card, role.key, rpos)] : 0),   // football brain from OVR: 60 → 0 (weak decisions), 90 → 1 (smart); v210: FC 27 role familiarity ++ / + reads the game better, no + a little worse
      x: 0, y: 0, vx: 0, vy: 0, fx: team === 0 ? 1 : -1, fy: 0,
      sprintMax: isGK ? (5.4 + 2.2 * n(s.speed)) * PACE : sprint, jogMax: (isGK ? (5.4 + 2.2 * n(s.speed)) * PACE : sprint) * 0.64,
      accel: (A80 + ((4.5 + 15 * Math.pow(n(s.acceleration), 1.1)) - A80) * 0.6) * (tr.has('brs') ? 1.12 : 1),
      turnAcc: 6 + 22 * n(((s.agility || 60) + (s.balance || 60)) / 2),
      agil: n((s.agility || 60) * 0.65 + (s.balance || 60) * 0.35),      // how quickly he re-aims his run: 0 = heavy, 1 = a dancer
      mass: 66 + 24 * n(s.strength) + 6 * (pf['Bruiser'] || 0),
      tr, role, order: card.order || null, mood: 1, moodT: 20 + rng() * 30, isoT: 0,
      stamina: 100, sprinting: false, moveT: 0,
      cool: { kick: 0, tackle: 0, stun: 0, slide: 0, decide: rng() * 0.3, think: rng() * 0.3, look: 0, skillcd: 0, sigcd: 0, rush: 0, fooled: 0, plant: 0, head: 0, volley: 0, trap: 0, ls: 0 },
      callT: -9, callQ: 0, warnT: -9, sayT: -9,
      trail: [], trailT: 0, anim: 0,
      dive: null, holdT: 0,
    };
  }

  /* ------------------------------- Match --------------------------------- */
  /**
   * @param cfg {
   *   home:{name, cards[11], kit?}, away:{name, cards[11], kit?},
   *   humanTeam: 0 | null, halfSeconds: 90, seed?, onEnd?(result), onEvent?(e)
   * }
   */
  function Match(cfg) {
    this.cfg = cfg;
    { const sz = Array.isArray(cfg.pitch) ? cfg.pitch : (PITCH_SIZES[cfg.pitch] || PITCH_SIZES.huge); setPitch(sz[0], sz[1]); }
    let seed = cfg.seed != null ? cfg.seed : (Math.random() * 1e9) | 0;
    this.rng = RUT.DB.rng(seed);
    this.seed0 = seed; this.tk = 0; this.rs = [mkRS(), mkRS()]; this._po = -1; this._ls = [null, null]; this.rec = null; this.reel = null;     // v108: recorder / reel state
    this.halfSeconds = cfg.halfSeconds || 90;
    this.brain = cfg.brain === 'ultra' ? 1 : 0;                           // Ultra mode: the computer players read the game faster and better (same on both sides, so it is part of the match setup)
    this.brainR = this.brain ? 0.6 : 1;
    this.surf = SURF[cfg.surface] || SURF.dry;                            // pitch condition and match ball: part of the match setup (same on both sides online)
    this.ballM = BALLS[cfg.ballModel] || BALLS.match;
    this.assist = ASSIST[cfg.assist] ? cfg.assist : 'semi';
    if (cfg.duel) [cfg.home, cfg.away].forEach(t => { const c = t.cards, k = [c[0]]; k[9] = c[1]; t.cards = k; });   // 1v1 duel: a keeper (slot 0) and one outfield player (slot 9) each
    this.teams = [cfg.home, cfg.away].map((t, i) => ({
      name: t.name, label: String(t.name || '').replace(/[^\w .'&-]/g, '').trim().slice(0, 9).toUpperCase(), short: (t.short || t.name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
      kit: t.kit || kitFor(t.cards), club: t.club || mainClub(t.cards), dir: i === 0 ? 1 : -1,
    }));
    if (colorClose(this.teams[0].kit[0], this.teams[1].kit[0])) this.teams[1].kit = [this.teams[1].kit[1], this.teams[1].kit[0]];
    if (colorClose(this.teams[0].kit[0], this.teams[1].kit[0])) this.teams[1].kit = ['#222222', '#ffffff'];
    const styles = cfg.styles || ['balanced', 'balanced'];
    this.tac = [0, 1].map(i => buildTactic(styles[i], cfg.tacGain && cfg.tacGain[i]));
    if (cfg.coach) [0, 1].forEach(i => { if (cfg.coach[i]) this.tac[i] = applyCoach(this.tac[i], cfg.coach[i]); });      // v108: the club's AI coach instructions (local matches)
          // v103: cfg.tacGain = [club, foe] stretch of the tactic knobs (default 1.5; the club's own tactics run at 3 in local matches)
    {   // computer teams get bolder and more aggressive the better their players are: more pressing, longer and more direct passing, more runs and shots from range
      const hs = cfg.humans || (cfg.humanTeam === 0 || cfg.humanTeam === 1 ? [cfg.humanTeam] : []);
      [cfg.home, cfg.away].forEach((t, ti) => {
        if (hs.includes(ti) || !t.cards || !t.cards.length) return;
        const avg = t.cards.reduce((a, c) => a + (c ? c.rating : 60), 0) / t.cards.length, lvl = clamp((avg - 62) / 28, 0, 1), T = this.tac[ti] = Object.assign({}, this.tac[ti]);        // a copy: tactics are shared between teams / matches
        T.level = lvl;
        T.press = clamp(T.press + Math.round(lvl * 1.6), 1, 5); T.counterPress += 0.8 * lvl; T.aggro *= 1 + 0.3 * lvl;
        if (lvl >= 0.28) { T.manMark = Math.max(T.manMark, 0.45 + 0.35 * lvl); }   // League B3 and up: the defenders pick a man each and stick to him
        T.eager += 0.4 * lvl; T.vert += 0.2 * lvl; T.range += 0.25 * lvl; T.counter += 0.4 * lvl; T.longShot *= 1 + 0.25 * lvl; T.shoot *= 1 + 0.15 * lvl;
        if (lvl > 0.55) T.runs = clamp(T.runs + 1, 0, 3);
        if (t.hot > 1) { T.hot = t.hot; T.shoot *= 1 + HOT_SHOOT * (t.hot - 1); T.eager += 0.25 * (t.hot - 1); }   // Top 5 Leagues clubs: far more dangerous against the human side (hot = goal multiplier aimed for)
        if (t.gb > 1) { T.gb = t.gb; T.shoot *= 1 + 0.45 * (t.gb - 1); T.press = clamp(T.press + 1, 1, 5); T.counterPress += 3; T.vert += 0.35; T.eager += 0.6; T.runs = clamp(T.runs + 1, 0, 4); T.counter += 0.5; }                      // v120: Top 5 goal boost (gb 5 = about five times the goals of a normal side)
        if (t.elite) { T.elite = true; T.press = clamp(T.press + 1, 1, 5); T.shoot *= 1.5; T.eager += 0.3; T.runs = clamp(T.runs + 1, 0, 3); }   // League A1: stronger than Legendary Galácticos, ruthless finishers whose shots are always on target
      });
    }
    [0, 1].forEach(ti => { const T = this.tac[ti] = Object.assign({}, this.tac[ti]); T.defSmart = true; T.manMark = Math.max(T.manMark, T.level >= 0.28 ? 0 : 0.45); });   // every side's AI defenders (the client's team-mates too) pick a man and stay with him
    // attacking knowledge +50% for every side's AI: more runs, more direct play, longer passing range, more shots, clearer reading of the pass (the passing style itself stays the tactic's: only tiki-taka / positional sides pass short and back)
    [0, 1].forEach(ti => { const T = this.tac[ti]; T.runs = clamp(T.runs + 1, 0, 3); T.vert *= 1.1; T.range *= 1.15; T.shoot *= 1.5; T.atk = 1; });
    this.learn = null;                                                                // Top 5 Leagues clubs study the other side's way of playing and change their tactic to beat it
    [cfg.home, cfg.away].forEach((t, ti) => { if (t && t.learn) { this.learn = this.learn || {}; this.learn[ti] = { base: this.tac[ti], prior: t.learn.prior || null, every: t.learn.every || LEARN_EVERY, next: t.learn.every || LEARN_FIRST, log: [], count: 0 }; } });
    if (this.learn) this.scout = [0, 1].map(() => ({ hold: 0, wing: 0, centre: 0, passes: 0, longP: 0, shots: 0, longS: 0, skills: 0, lineS: 0, lineN: 0, preS: 0, preN: 0 }));
    this.lostAt = [-99, -99]; this.wonAt = [-99, -99]; this.nextRot = [9, 12];
    this.shoutT = [-9, -9]; this.shoutK = [{}, {}]; this.gkClaim = [-9, -9]; this.cm = [null, null];
    this.spCfg = cfg.setPieces || [null, null];                            // v95: your corner / free-kick assignments (local matches only; online uses the automatic ones)
    this.players = [];
    // a `smart` side (Top 5 Leagues, 1.5): its reading-of-the-game attributes are raised by half the distance to 99 (vision, composure, reactions, positioning, interceptions, defensive awareness), which in 800+ simulated matches against a same-rated side wins it clearly more (see v84 notes)
    const SMART_KEYS = ['vision', 'composure', 'reactions', 'positioning', 'interceptions', 'defAwareness'];
    const TRAIN_KEYS = { att: ['finishing', 'shotPower', 'dribbling', 'positioning', 'ballControl'], mid: ['shortPassing', 'longPassing', 'vision', 'ballControl', 'stamina'], def: ['standingTackle', 'slidingTackle', 'interceptions', 'defAwareness', 'strength'], gk: ['gkDiving', 'gkReflexes', 'gkHandling', 'gkPositioning'] };
    const HOT_DEF = ['standingTackle', 'slidingTackle', 'interceptions', 'defAwareness', 'reactions', 'positioning'];
    const HOT_KEYS = ['finishing', 'shotPower', 'longShots', 'volleys', 'shortPassing', 'longPassing', 'crossing', 'curve', 'dribbling', 'ballControl', 'agility', 'balance'];
    const smartCards = (t, ti) => ((t.smart > 1 || t.hot > 1 || (cfg.train && cfg.train[ti])) ? t.cards.map(c => { if (!c) return c; const sub = Object.assign({}, c.sub); if (t.smart > 1) SMART_KEYS.forEach(k => { if (sub[k] != null) sub[k] = Math.round(sub[k] + Math.min(1, t.smart - 1) * (99 - sub[k])); });
      if (t.hot > 1 && c.position !== 'GK') HOT_DEF.forEach(k => { if (sub[k] != null) sub[k] = Math.round(sub[k] + Math.min(1, (t.hot - 1) * HOT_SKILL * HOT_DEFK) * (99 - sub[k])); });
      if (t.hot > 1 && !(c.position === 'GK')) HOT_KEYS.forEach(k => { if (sub[k] != null) sub[k] = Math.round(sub[k] + Math.min(1, (t.hot - 1) * HOT_SKILL) * (99 - sub[k])); });
      { const tr = cfg.train && cfg.train[ti], ar = c.position === 'GK' ? 'gk' : /^(CB|LB|RB|LWB|RWB)$/.test(c.position) ? 'def' : /^(ST|CF|LW|RW|CAM|LM|RM)$/.test(c.position) ? 'att' : 'mid';   // v120: training also sharpens the area's own skills
        if (tr && tr[ar]) (TRAIN_KEYS[ar]).forEach(k => { if (sub[k] != null) sub[k] = Math.round(sub[k] + Math.min(0.9, 2 * tr[ar]) * (99 - sub[k])); }); }
      return Object.assign({}, c, { sub }); }) : t.cards);
    [cfg.home, cfg.away].forEach((t, ti) => smartCards(t, ti).forEach((c, i) => this.players.push(makePlayer(c || fallbackCard(i), ti, i, this.rng, this.tac[ti].roles, this.tac[ti].formKey && RUT.State.FORMS[this.tac[ti].formKey] ? RUT.State.FORMS[this.tac[ti].formKey].pos : null))));
    [cfg.home, cfg.away].forEach((t, ti) => { if (t && t.smart > 1.5) this.players.forEach(p => { if (p.team === ti) p.iq = Math.min(1.2, p.iq + 0.3 * (t.smart - 1.5)); }); });   // v94: past 1.5 the football brain itself sharpens (2.0 = +0.15)
    if (this.brain) this.players.forEach(p => { p.iq = Math.min(1.15, p.iq + 0.1); });
    // v120: past smart 2 the side also thinks faster (smart 4 = decisions twice as quick) and its passes find their man more truly
    this.smartT = [cfg.home, cfg.away].map(t => (t && t.smart) || 1); this.teamIQ = [cfg.home, cfg.away].map(t => (t && t.teamIQ) || 1); /* v201: Champions League sides play 1.5x more as a team */ this.thinkK = this.smartT.map(v => v > 2 ? 2 / v : 1);
    /* v219 (JODIO: "FC 27's hardest AI, for every AI, most for the opponent"). From FC 27's Legendary/Ultimate: faster reactions, less time
       to recover after losing the ball (longer counter-press), a compact block that shifts to the ball side, a back line that drops off when
       the carrier has time (defends the through ball), switching play when the other side crowds one flank, attacking the central zone, and
       calmer finishing. eliteT 0..1 per side: Top 5 / Champions League (smart >= 4) 1, an AI opponent of a human 0.65, the human's own
       AI team-mates 0.35, AI vs AI 0.5. cfg.home/away.elite overrides. */
    { const hs = cfg.humans || (cfg.humanTeam === 0 || cfg.humanTeam === 1 ? [cfg.humanTeam] : []);
      this.eliteT = [cfg.home, cfg.away].map((t, ti) => t && t.elite != null ? t.elite : hs.includes(ti) ? 0.35 : t && t.smart >= 4 ? 1 : hs.length ? 0.65 : 0.5);
      this.thinkK = this.thinkK.map((k, ti) => k * (1 - 0.3 * this.eliteT[ti])); }
    // v118 training: cfg.train[team] = { att, mid, def, gk } (fractions, 0.10 = 10% better AI) lifts the football brain of that area's players
    [0, 1].forEach(t => { const tr = cfg.train && cfg.train[t]; if (!tr) return; this.players.forEach(p => { if (p.team !== t) return; const ps = p.fpos || p.card.position, k = p.isGK ? 'gk' : /^(CB|LB|RB|LWB|RWB)$/.test(ps) ? 'def' : /^(ST|CF|LW|RW)$/.test(ps) ? 'att' : 'mid'; if (tr[k]) { p.iq = Math.min(1.25, p.iq + 2.5 * tr[k]); p.tf = tr[k]; } }); });   // p.tf = trained fraction: sharper positioning (v128)
    [0, 1].forEach(t => { const n = this.players.filter(p => p.team === t && p.tr.has('ldr')).length; if (n) this.players.forEach(p => { if (p.team === t && !p.tr.has('ldr')) p.iq = Math.min(1.15, p.iq + 0.03 * Math.min(2, n)); }); });   // leaders organise the others
    this.ball = { x: PW2, y: PH2, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, owner: null, last: null, noPick: null, noPickT: 0, trail: [], trailType: null, shot: null };
    this.score = [0, 0];
    this.t = 0; this.half = 1;
    this.phase = 'kickoff'; this.phaseT = 1.2; this.kickTeam = 0;
    this.effects = []; this.events = [];
    this.stats = { shots: [0, 0], onTarget: [0, 0], passes: [0, 0], tackles: [0, 0], tkWon: [0, 0], possession: [0, 0], fouls: [0, 0], corners: [0, 0], cards: [] }; this.pstat = {}; this._lp = [null, null]; this._kp = [null, null];
    this.stoppage = 0; this.added = null; this.advantage = null; this.offsideList = [];
    // human controllers: one per human team. cfg.humans = [0] (you vs AI), [0, 1] (two players), [] (AI vs AI)
    const humans = cfg.humans || (cfg.humanTeam === 0 || cfg.humanTeam === 1 ? [cfg.humanTeam] : []);
    this.ctls = [null, null];
    humans.forEach((t, i) => { this.ctls[t] = newCtl(t, humans.length > 1 ? (i ? 'p2' : 'p1') : 'all', i); });
    this.human = humans.length ? humans[0] : null;
    this.cam = { x: PW2, y: PH2 }; this.camMode = CAMS[cfg.camera] ? cfg.camera : 'tv'; this.gfx = 'auto'; this.tagMode = 2;   // name tags: 0 off, 1 all players, 2 only the ones you control + the ball carrier
    this.speed = 1; this.over = false;
    this.ticker = 'KICK OFF!'; this.tickerT = 3;
    this.training = cfg.training || null;
    if (this.training) { this.halfSeconds = 1e9; this.noOffside = true; this.trainSetup(); this.ticker = 'TESTING GROUND'; }
    else this.setupKickoff(0);
  }

  /** A human controller: its own input, controlled player, shot charge and queued action. */
  function newCtl(team, keys, idx) {
    return { team, keys, idx, input: { up: false, down: false, left: false, right: false, sprint: false }, pad: null,
      controlled: null, queued: null, hold: null, mod: null, strike: null, arm: null, grace: 0, charge: 0, power: 0, pressHeld: false, pendingReceiver: null, manualSwitchT: 0, aim: 0, wd: 0, aimSet: null, mouseAim: false, mouseP: null };
  }

  function mainClub(cards) {
    const counts = {}; cards.forEach(c => { if (c) counts[c.club] = (counts[c.club] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  function kitFor(cards) { return RUT.DB.kitFor(mainClub(cards)); }
  function hex(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function colorClose(a, b) { const x = hex(a), y = hex(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 140; }
  function fallbackCard(i) { return RUT.DB.reserves.find(c => c.position === RUT.State.BASE_FORMATION[i]) || RUT.DB.reserves[0]; }

  const P = Match.prototype;
  const tl = t => (RUT.i18n && RUT.i18n.lang === 'fr' ? RUT.i18n.t(t) : t);   // French mode: ticker, events, floating texts and scoreboard words
  // older code and tests read these on the match: they map to the first human controller
  ['controlled', 'input', 'queued', 'hold', 'charge', 'power', 'pendingReceiver', 'manualSwitchT'].forEach(k => Object.defineProperty(P, k, {
    get: function () { const c = this.ctls && this.ctls[this.human]; return c ? c[k] : null; },
    set: function (v) { const c = this.ctls && this.ctls[this.human]; if (c) c[k] = v; },
  }));
  P.ctlOf = function (p) { const c = p && this.ctls[p.team]; return c && c.controlled === p ? c : null; };

  /* --------------------------- set pieces -------------------------------- */
  P.homeSpot = function (p, kickoff) {
    if (p.home) return p.home;                                           // testing ground dummies stand where they were put
    const T = this.tac[p.team], f = FORMATIONS[T.formation].pts[p.slot];
    const sx = PITCH_W / 105, sy = PITCH_H / 80;
    let x = f[0] * sx, y = PH2 + (f[1] * 80 / 68 * sy - PH2) * (p.slot ? T.width : 1);   // formations are drawn for 105x68 and stretch with the pitch (and the style's width)
    if (kickoff) x = Math.min(x * 0.5, PW2 - 2);
    return p.team === 0 ? { x, y } : { x: PITCH_W - x, y: PITCH_H - y };
  };

  P.setupKickoff = function (team) {
    this.players.forEach(p => { const h = this.homeSpot(p, true); p.x = h.x; p.y = h.y; p.vx = p.vy = 0; p.dive = null; p.cool.stun = 0; p.cool.slide = 0; });
    const b = this.ball;
    Object.assign(b, { x: PW2, y: PH2, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, owner: null, shot: null, trail: [], inNet: null });
    const taker = this.players.find(p => p.team === team && p.slot === 9) || this.players.filter(p => p.team === team && !p.isGK).pop() || this.players.find(p => p.team === team);
    taker.x = PW2 - this.teams[team].dir * 0.8; taker.y = PH2;
    this.giveBall(taker);
    this.phase = 'kickoff'; this.phaseT = 1.0; this.kickTeam = team;
    this.armSet('KICKOFF', team, taker);
  };

  /**
   * Restart rules: until the taker plays the ball he stands still and may only pass (kick-off, throw-in, goal kick and indirect free kick: no shot),
   * and the opponents stay out of the circle round the ball (centre circle at the kick-off, 10 m at corners and free kicks, the box at goal kicks).
   * At the kick-off everybody also stays in his own half. The restriction ends with the taker's first kick (or a safety timeout).
   */
  P.armSet = function (kind, team, taker) {
    const b = this.ball, R = { 'KICKOFF': 12, 'CORNER': 10, 'FREE KICK': 10, 'INDIRECT FREE KICK': 10, 'THROW IN': 4, 'GOAL KICK': 0 };
    this.sp = { kind, team, taker, x: taker.x, y: taker.y, bx: b.x, by: b.y, t: 0, r: R[kind] || 0, noShoot: !(kind === 'CORNER' || kind === 'FREE KICK') };
    this.spAfter = null; this.fkWall = null;
    if (kind === 'CORNER') this.planCorner(team, taker);
    else if (kind === 'FREE KICK') this.planFreeKick(team, taker);
  };
  P.enforceSet = function (dt) {
    const s = this.sp; if (!s) return;
    const b = this.ball; s.t += dt;
    if (b.owner !== s.taker || dist(b, { x: s.bx, y: s.by }) > 3 || s.t > 16) {
      if (s.plan && b.owner !== s.taker && s.t < 16) { this.spAfter = { plan: s.plan, kind: s.kind, team: s.team, taker: s.taker, until: this.t + 3.2, wall: s.wall }; if (s.wall) { this.fkWall = { players: s.wall, until: this.t + 2.2, jump: this.rng() < 0.6, t0: this.t }; } }
      this.sp = null; return;
    }
    const tk = s.taker; tk.x = s.x; tk.y = s.y; tk.vx = tk.vy = 0; tk.sx = tk.sy = 0; tk.tx = tk.ty = 0;
    this.players.forEach(o => {
      if (o === tk) return;
      if (s.kind === 'KICKOFF') { const d = this.teams[o.team].dir; if ((o.x - PW2) * d > -0.5) { o.x = PW2 - d * 0.5; if (o.vx * d > 0) o.vx = 0; } }     // own half only
      if (o.team === s.team) return;
      if (s.kind === 'GOAL KICK') {
        if (this.inBox(o, s.team)) { const gx = s.team === 0 ? 0 : PITCH_W; o.x = gx + (s.team === 0 ? 1 : -1) * 16.7; o.vx = 0; }
      } else if (s.r && !(o.isGK && (s.kind === 'CORNER' || s.kind === 'FREE KICK' || s.kind === 'INDIRECT FREE KICK'))) {
        let dx = o.x - s.bx, dy = o.y - s.by; const d = len(dx, dy);
        if (d < s.r) { if (d < 0.01) { dx = PW2 > s.bx ? 1 : -1; dy = 0; } const k = s.r / (d < 0.01 ? 1 : d); o.x = clamp(s.bx + dx * k, 0.5, PITCH_W - 0.5); o.y = clamp(s.by + dy * k, 0.5, PITCH_H - 0.5); o.vx *= 0.2; o.vy *= 0.2; }
      }
    });
  };
  /** The computer-controlled taker: waits a moment, then plays a pass (a cross at a corner), since he may not move. */
  P.setTake = function (p) {
    const s = this.sp, dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0;
    if (s.t < 0.9 + 0.5 * (1 - clamp(p.iq, 0, 1)) || (s.kind === 'FREE KICK' && s.t < 2.2 && Math.abs(gx - p.x) < 34)) return false;
    if (s.kind === 'THROW IN' && (p.pf['Long Throw'] || 0) && Math.abs(gx - p.x) < 42) {              // v148 Long Throw: a flat, hard throw into the box, to the best header
      let tg = null, ts = -1; this.players.forEach(o => { if (o.team === p.team && o !== p && !o.isGK && this.inBox(o, 1 - p.team)) { const sc = this.aerial(o) - 0.004 * dist(p, o); if (sc > ts) { ts = sc; tg = o; } } });
      if (tg) { this.pass(p, tg, false, { power: 0.9, lob: true }); return true; }
    }
    if (s.kind === 'CORNER' && s.plan && s.roles && this.cornerTake(p)) return true;
    if (s.kind === 'FREE KICK' && s.plan) { const r = this.fkTake(p); if (r) return true; if (r === null) return false; }
    if (s.kind === 'CORNER' && s.plan && s.t < 5) return false;
    let best = null, bs = -1e9;
    this.players.forEach(o => {
      if (o.team !== p.team || o === p || o.isGK) return;
      const d = dist(p, o); if (d < 3 || d > 60) return;
      let open = 1e9; this.players.forEach(q => { if (q.team !== p.team) open = Math.min(open, dist(q, o)); });
      const prog = (o.x - p.x) * dir;
      let sc = Math.min(open, 9) + prog * 0.15 - this.laneBlocked(p, o) * 4 - d * 0.05;
      if (s.kind === 'CORNER') sc = Math.min(open, 8) - Math.abs(gx - o.x) * 0.2 - Math.abs(o.y - PH2) * 0.15;
      if (sc > bs) { bs = sc; best = o; }
    });
    if (!best) return false;
    this.pass(p, best, false, s.kind === 'CORNER' ? { power: 0.8, lob: true } : undefined);
    return true;
  };


  /* ------------------------------------------------------------------------------------------------
   * Set pieces (v95), after EA SPORTS FC 26's corner and free-kick systems.
   * CORNERS: fewer attackers by default (less congested, fewer counters). Attacking assignments: Near Post, Back Post, Target Player, Top of Box
   *   and Defensive Cover (they stay back); a short-corner partner calls for it. Defending assignments: Threat Marker (goal-side of a dangerous
   *   header), Post Watcher (on the line), Near Post, Back Post, and the zonal rest; two attackers stay up for the counter.
   * FREE KICKS: a wall of 2-5 men 9.15 m away (it jumps), the best dead-ball taker (Free Kick Accuracy, Curve, Dead Ball+), a low driven shot at
   *   the far corner or an outside-foot curler over the wall; further out a cross into the box or a quick pass. Throw-ins go to a full-back / winger.
   * ---------------------------------------------------------------------------------------------- */
  P.dead = function (p) {                                                       // dead-ball quality 0..1.2 (corners and free kicks)
    const s = p.card.sub; return nrm(0.5 * (s.fkAccuracy || s.shotPower || 55) + 0.3 * (s.curve || 55) + 0.2 * (s.crossing || 55)) + 0.2 * (p.pf['Dead Ball'] || 0);
  };
  P.pickTaker = function (team, label, bx, by) {
    const cfg = this.spCfg[team], slot = cfg && (label === 'CORNER' ? cfg.ck : label === 'FREE KICK' ? cfg.fk : null);
    const mates = this.players.filter(p => p.team === team && !p.isGK);
    if (slot != null) { const t = mates.find(p => p.slot === slot); if (t) return t; }
    if (label === 'CORNER') return mates.slice().sort((a, c) => (this.dead(c) + 0.25 * (c.tr.has('ck') ? 1 : 0)) - (this.dead(a) + 0.25 * (a.tr.has('ck') ? 1 : 0)))[0];
    if (label === 'FREE KICK') {
      const gX = this.teams[team].dir > 0 ? PITCH_W : 0, d = Math.abs(gX - bx);
      return mates.slice().sort((a, c) => (this.dead(c) + (d < 34 ? 0.25 * (c.tr.has('fk') ? 1 : 0) + 0.002 * (c.card.sub.shotPower || 0) : 0)) - (this.dead(a) + (d < 34 ? 0.25 * (a.tr.has('fk') ? 1 : 0) + 0.002 * (a.card.sub.shotPower || 0) : 0)))[0];
    }
    if (label === 'THROW IN') {                                                  // a full-back or wide man, whoever is nearest on that side
      const wide = mates.filter(p => ['LB', 'RB', 'LM', 'RM', 'LW', 'RW'].indexOf(p.card.position) >= 0);
      const pool = wide.length ? wide : mates;
      const gX = this.teams[team].dir > 0 ? PITCH_W : 0, att = Math.abs(gX - bx) < 45;   // v148: in the attacking half the Long Throw specialist takes it
      const lts = att ? mates.filter(m => (m.pf['Long Throw'] || 0) && Math.hypot(m.x - bx, m.y - by) < 40).sort((a, c) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(c.x - bx, c.y - by)) : [];
      if (lts.length) return lts[0];
      return pool.slice().sort((a, c) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(c.x - bx, c.y - by))[0];
    }
    return null;
  };
  /** Put a player on his spot at once if he is far (dead ball: everybody jogs into position), else he walks the last bit. */
  P.placeAt = function (p, x, y) { const d = Math.hypot(x - p.x, y - p.y); if (d > 6) { const k = (d - 6) / d; p.x += (x - p.x) * k; p.y += (y - p.y) * k; } p.vx = p.vy = 0; };

  P.planCorner = function (team, taker) {
    const b = this.ball, dir = this.teams[team].dir, gx = dir > 0 ? PITCH_W : 0, side = b.y < PH2 ? -1 : 1, plan = new Map();
    const cfg = (this.spCfg[team] && this.spCfg[team].atk) || {}, def = (this.spCfg[1 - team] && this.spCfg[1 - team].def) || {};
    const mates = this.players.filter(p => p.team === team && p !== taker && !p.isGK);
    const used = new Set(), bySlot = k => { const sl = cfg[k]; if (sl == null) return null; const p = mates.find(m => m.slot === sl && !used.has(m)); if (p) used.add(p); return p || null; };
    const rank = (arr, f) => arr.filter(p => !used.has(p)).sort((a, c) => f(c) - f(a));
    const isDef = p => ['CB', 'LB', 'RB', 'CDM'].indexOf(p.card.position) >= 0;
    const covers = [];
    if (cfg.cover) cfg.cover.forEach(sl => { const p = mates.find(m => m.slot === sl && !used.has(m)); if (p) { used.add(p); covers.push(p); } });
    if (!cfg.cover) rank(mates.filter(isDef), p => nrm(p.card.sub.defAwareness) + 0.4 * nrm(p.card.sub.sprintSpeed)).slice(0, 2).forEach(p => { used.add(p); covers.push(p); });
    const take = (k, f) => bySlot(k) || (() => { const p = rank(mates, f)[0]; if (p) used.add(p); return p; })();
    const target = take('target', p => this.aerial(p) + 0.1 * nrm(p.card.sub.headingAccuracy));
    const back = take('back', p => this.aerial(p) + (isDef(p) ? 0.08 : 0));
    const near = take('near', p => 0.5 * this.aerial(p) + 0.5 * nrm(p.card.sub.positioning) + (p.card.position === 'ST' ? 0.1 : 0));
    const top = take('top', p => nrm(p.card.sub.longShots) + 0.5 * nrm(p.card.sub.shortPassing) + 0.3 * nrm(p.card.sub.composure));
    const rest = rank(mates, p => nrm(p.card.sub.shortPassing)), partner = rest[0], others = rest.slice(1);
    const put = (p, x, y, role, extra) => { if (!p) return; plan.set(p, Object.assign({ x, y, role }, extra || {})); this.placeAt(p, x, y); };
    const sg = gx - dir * 0;
    put(near, gx - dir * 4.5, PH2 + side * 6.2, 'near', { run: [0, 0] });
    put(back, gx - dir * 6, PH2 - side * 5.2, 'back', { run: [0.8, -0.6] });
    put(target, gx - dir * 10.5, PH2 - side * 1.5, 'target', { run: [-1.2, 0.5] });
    put(top, gx - dir * 19.5, PH2 - side * 5, 'top');
    put(partner, b.x - dir * 6.5, b.y + (PH2 - b.y) * 0.12, 'short');
    const edge = [[gx - dir * 24, PH2 + side * 11], [gx - dir * 23, PH2 - side * 12]];
    others.forEach((p, i) => { if (i < 2) put(p, edge[i][0], edge[i][1], 'edge'); else { used.add(p); covers.push(p); } });   // the rest stay back too: fewer men forward, fewer counters
    const cv = [[PW2 - dir * 4, PH2 - 11], [PW2 - dir * 6, PH2 + 11], [PW2 - dir * 10, PH2], [PW2 - dir * 12, PH2 - 20], [PW2 - dir * 12, PH2 + 20]];
    covers.forEach((p, i) => put(p, cv[i % cv.length][0], cv[i % cv.length][1], 'cover'));
    // the defending side
    const dteam = 1 - team, dg = gx, dd = this.players.filter(p => p.team === dteam && !p.isGK), dUsed = new Set();
    const atk = [target, back, near, top].filter(Boolean);
    const dRank = (f) => dd.filter(p => !dUsed.has(p)).sort((a, c) => f(c) - f(a));
    const dBy = k => { const sl = def[k]; if (sl == null) return null; const p = dd.find(m => m.slot === sl && !dUsed.has(m)); if (p) dUsed.add(p); return p || null; };
    const postA = dBy('postA') || (() => { const p = dRank(p => -this.aerial(p))[0]; if (p) dUsed.add(p); return p; })();
    const postB = dBy('postB') || (() => { const p = dRank(p => -this.aerial(p) + 0.01 * nrm(p.card.sub.reactions))[0]; if (p) dUsed.add(p); return p; })();
    const nearD = dBy('near') || (() => { const p = dRank(p => this.aerial(p) * 0.6 + nrm(p.card.sub.standingTackle) * 0.4)[0]; if (p) dUsed.add(p); return p; })();
    const backD = dBy('back') || (() => { const p = dRank(p => this.aerial(p) * 0.6 + nrm(p.card.sub.standingTackle) * 0.4)[0]; if (p) dUsed.add(p); return p; })();
    const threat = dBy('threat') || (() => { const p = dRank(p => this.aerial(p) + nrm(p.card.sub.strength) * 0.2)[0]; if (p) dUsed.add(p); return p; })();
    const dput = (p, x, y, role, extra) => { if (!p) return; plan.set(p, Object.assign({ x, y, role }, extra || {})); this.placeAt(p, x, y); };
    dput(postA, dg - dir * 0.8, PH2 + side * 6.5, 'post');                           // Post Watcher: on the line by the near post
    dput(postB, dg - dir * 0.8, PH2 - side * 6.5, 'post');                           // and the far post
    dput(nearD, dg - dir * 3.2, PH2 + side * 4, 'nearD');                            // Near Post
    dput(backD, dg - dir * 3.4, PH2 - side * 3.5, 'backD');                          // Back Post
    const hdr = atk.slice().sort((a, c) => this.aerial(c) - this.aerial(a));
    dput(threat, hdr[0] ? hdr[0].x : dg - dir * 9, hdr[0] ? hdr[0].y : PH2, 'mark', { mark: hdr[0] || null });                  // Threat Marker: sticks to the best header
    const zonal = dRank(p => this.aerial(p)), zs = [[dg - dir * 6.5, PH2 + side * 1], [dg - dir * 7.5, PH2 - side * 5], [dg - dir * 9, PH2 + side * 5], [dg - dir * 12, PH2 - side * 1.5]];
    let zi = 0, markI = 1;
    zonal.forEach(p => {
      if (dUsed.has(p)) return;
      if (hdr[markI] && zi < 4 && markI < 3) { dUsed.add(p); const m = hdr[markI++]; dput(p, m.x, m.y, 'mark', { mark: m }); return; }
      if (zi < 4) { dUsed.add(p); dput(p, zs[zi][0], zs[zi][1], 'zone'); zi++; return; }
    });
    const left = dd.filter(p => !dUsed.has(p)), up = [[PW2 - dir * 0, PH2 - 8], [PW2 - dir * 0, PH2 + 8]];
    left.forEach((p, i) => { dUsed.add(p); if (i < 2) dput(p, up[i][0], up[i][1], 'up'); else dput(p, dg - dir * 19, PH2 + (i % 2 ? 7 : -7), 'edgeD'); });    // two stay up for the counter, the rest guard the edge
    this.sp.plan = plan; this.sp.roles = { target, back, near, top, short: partner };
  };

  P.planFreeKick = function (team, taker) {
    const b = this.ball, dir = this.teams[team].dir, gx = dir > 0 ? PITCH_W : 0, gd = Math.hypot(gx - b.x, PH2 - b.y), plan = new Map();
    if (gd > 40 || Math.abs(gx - b.x) < 3) return;                                 // far from goal: a quick restart, no set routine
    const mates = this.players.filter(p => p.team === team && p !== taker && !p.isGK), used = new Set();
    const dd = this.players.filter(p => p.team !== team && !p.isGK);
    const wide = Math.abs(b.y - PH2) > 18, n = clamp((gd < 20 ? 5 : gd < 26 ? 4 : gd < 32 ? 3 : 2) - (wide ? 1 : 0), 2, 5);
    // the wall: 9.15 m from the ball on the line to the goal's centre, the tallest defenders, a man a little over the near post
    const ux = (gx - b.x) / gd, uy = (PH2 - b.y) / gd, wx = b.x + ux * 9.2, wy = b.y + uy * 9.2, px = -uy, py = ux;
    const wallers = dd.slice().sort((a, c) => (c.card.details && c.card.details.height || 180) - (a.card.details && a.card.details.height || 180)).slice(0, n);
    wallers.forEach((p, i) => { const off = (i - (n - 1) / 2) * 0.78; const x = wx + px * off, y = wy + py * off; plan.set(p, { x, y, role: 'wall' }); p.x = x; p.y = y; p.vx = p.vy = 0; });
    // attackers: three in the box, a lay-off man beside the taker, one on the edge, two stay back
    const rank = f => mates.filter(p => !used.has(p)).sort((a, c) => f(c) - f(a));
    const put = (p, x, y, role) => { if (!p) return; used.add(p); plan.set(p, { x, y, role }); this.placeAt(p, x, y); };
    const heads = rank(p => this.aerial(p));
    [[gx - dir * 10, PH2 - 6], [gx - dir * 8, PH2 + 1], [gx - dir * 11, PH2 + 7]].forEach(sp => put(heads.shift(), sp[0], sp[1], 'box'));
    put(rank(p => nrm(p.card.sub.shortPassing))[0], b.x - dir * 4 - ux * 0, b.y + (b.y < PH2 ? 5 : -5), 'layoff');
    put(rank(p => nrm(p.card.sub.longShots))[0], gx - dir * 22, PH2 + (b.y < PH2 ? 6 : -6), 'edge');
    mates.filter(p => !used.has(p)).sort((a, c) => (['CB', 'CDM'].indexOf(c.card.position) >= 0 ? 1 : 0) - (['CB', 'CDM'].indexOf(a.card.position) >= 0 ? 1 : 0)).forEach((p, i) => put(p, PW2 - dir * (6 + 3 * i), PH2 + (i % 2 ? 12 : -12), 'cover'));
    // the rest of the defence: markers on the box men, the others hold the edge
    const rest = dd.filter(p => !plan.has(p)), boxMen = mates.filter(p => plan.get(p) && plan.get(p).role === 'box');
    rest.forEach((p, i) => { const m = boxMen[i]; if (m) plan.set(p, { x: m.x, y: m.y, role: 'mark', mark: m }); else plan.set(p, { x: gx - dir * 17, y: PH2 + (i % 2 ? 9 : -9), role: 'edgeD' }); this.placeAt(p, plan.get(p).x, plan.get(p).y); });
    this.sp.plan = plan; this.sp.wall = wallers; this.sp.gd = gd;
  };

  /** A player on a set-piece assignment: walks to his spot (a threat marker stays goal-side of his man); after the kick the runners attack the delivery. */
  P.setPlayMove = function (p, R, sp, after) {
    const b = this.ball, ownG = this.teams[p.team].dir > 0 ? 0 : PITCH_W;
    if (after && R.role !== 'wall') { if (dist(p, b) < 4.2 && b.z < 2.9 && !b.shot) return false; }   // the ball is on him: normal play
    let tx = R.x, ty = R.y, spr = false;
    if (R.mark) { const m = R.mark; tx = m.x + (ownG - m.x) * 0.1; ty = m.y + (PH2 - m.y) * 0.04; spr = after; }
    if (after && R.run && R.role !== 'wall') { const lt = b.cross || b.passTo; if (lt) { tx = lt.x + R.run[0]; ty = lt.y + R.run[1]; spr = true; } }
    this.seek(p, tx, ty, spr);
    if (R.role === 'wall') { this.face(p, b.x - p.x, b.y - p.y); p.tx = p.ty = 0; if (after && this.fkWall && this.fkWall.jump && this.t - this.fkWall.t0 < 0.5) p.cool.head = 0.4; }
    return true;
  };
  /** Free-kick wall: a low shot is stopped by the men in it, one over 2.1 m (2.45 m if they jump) sails over. */
  P.wallCheck = function () {
    const w = this.fkWall, b = this.ball; if (!w) return;
    if (this.t > w.until || b.owner) { this.fkWall = null; return; }
    const top = w.jump && this.t - w.t0 < 0.7 ? 2.45 : 2.1;
    for (const p of w.players) {
      if (len(b.x - p.x, b.y - p.y) < 0.75 && b.z < top && (b.vx * (p.x - b.x) + b.vy * (p.y - b.y)) > -0.5 * 100) {
        this.deflect(p, 0.45); this.fkWall = null; this.say('WALL!'); return;
      }
    }
  };

  /** The computer-controlled corner: short (partner calls for it), low to the top of the box, or a high delivery to the near post, back post or target player. */
  P.cornerTake = function (p) {
    const s = this.sp, R = s.roles || {}, TK = this.tac[p.team], gm = this.gameMode(p.team);
    const ready = (() => { let n = 0, d = 0; s.plan.forEach((r, q) => { if (q.team === p.team && r.role !== 'cover' && r.role !== 'short') { n++; d += dist(q, r); } }); return !n || d / n < 2.6; })();
    if (!ready && s.t < 5) return false;
    const w = { near: 0.24, back: 0.3, target: 0.3, top: 0.1, short: 0.05 };
    if (TK.shortW >= 1.4 || TK.lanes || TK.pivot) w.short += 0.2;
    if (TK.cross >= 0.4) { w.back += 0.1; w.near += 0.1; }
    if (gm > 0) { w.short += 0.15; w.top += 0.1; } else if (gm < 0) { w.short = 0.02; w.target += 0.15; }
    const cs = (this.spCfg[p.team] || {}).cstyle; if (cs && w[cs] != null) w[cs] += 1.6;                 // the coach's call (Tactics > Set pieces)
    const keys = Object.keys(w).filter(k => R[k]); let tot = 0; keys.forEach(k => { tot += w[k]; });
    let r = this.rng() * tot, pick = keys[0]; for (const k of keys) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    if (!pick) return false;
    const tgt = R[pick];
    if (pick === 'short') { this.say('SHORT CORNER'); this.pass(p, tgt, false); return true; }
    if (pick === 'top') { this.say('CORNER · TOP OF THE BOX'); this.pass(p, tgt, false, { power: 0.75 }); return true; }
    this.say('CORNER · ' + { near: 'NEAR POST', back: 'BACK POST', target: 'TARGET MAN' }[pick]);
    this.pass(p, tgt, false, { power: 0.9, lob: true }); return true;
  };

  /** The computer-controlled free kick: a direct shot from range (low driven at the far corner, or an outside-foot curler over the wall), else a cross, else a pass. */
  P.fkTake = function (p) {
    const s = this.sp, b = this.ball, dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, gd = Math.hypot(gx - b.x, PH2 - b.y), dq = this.dead(p);
    if (s.plan && s.t < 3.2 && gd < 36) return null;                               // let the wall and the box set (null = keep waiting)
    if (s.plan && gd < 34 && this.rng() < clamp(0.15 + 0.4 * dq - (gd - 20) * 0.02, 0.05, 0.6)) {
      const curl = gd > 21 && (p.tr.has('fk') || dq > 0.55 || s.wall) && this.rng() < 0.6 + 0.3 * dq;
      this.fkShoot(p, curl ? 'curl' : 'low'); return true;
    }
    const R = s.plan ? Array.from(s.plan.entries()).filter(e => e[1].role === 'box').map(e => e[0]) : [];
    if (R.length && gd < 52) { const t = R.sort((a, c) => this.aerial(c) - this.aerial(a))[0]; this.say('FREE KICK · INTO THE BOX'); this.pass(p, t, false, { power: 0.9, lob: true }); return true; }
    return false;
  };
  /** Direct free kick. low = a driven strike at the far corner; curl = outside-foot, over the wall and bending in. Accuracy from Free Kick Accuracy, Curve and Dead Ball+. */
  P.fkShoot = function (p, style) {
    const s = p.card.sub, dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, b = this.ball, d = len(gx - b.x, PH2 - b.y), q = clamp(this.dead(p), 0, 1.15);
    const gk = this.players.find(o => o.isGK && o.team !== p.team), side = gk && Math.abs(gk.y - PH2) > 0.8 ? (gk.y > PH2 ? -1 : 1) : (this.rng() < 0.5 ? -1 : 1);
    const dg = this.ballM.drag, ay = PH2 + side * GOAL_HALF * (0.18 + 0.4 * this.rng() * Math.min(1, q + 0.2));
    let spin = 0, tspin = 0.5, speed, vz;
    const errA = (0.04 + 0.1 * (1 - Math.min(1, q))) * (0.7 + d / 30);
    let ang = Math.atan2(ay - b.y, gx - b.x);
    if (style === 'low') {
      speed = clamp(19 + 10 * nrm(s.shotPower), 18, 30); vz = 0.55 + this.rng() * 0.8; spin = this.gauss() * 0.06;
    } else {
      const wd = 9.4; let best = null, be = 1e9;                                    // pick pace and loft that clear the wall (2.3 m at 9.4 m) and drop under the bar
      for (let sp = 19; sp <= 30; sp += 1) for (let z = 3; z <= 9.5; z += 0.25) {
        const f1 = flightSim(sp, z, dg, wd), f2 = flightSim(sp, z, dg, d);
        if (!f1.ok || !f2.ok || f1.zAt < 2.4 || f2.zAt > 2.6 || f2.zAt < 0.5) continue;
        const e = Math.abs(f2.zAt - 1.5) * 2 + sp * 0.02; if (e < be) { be = e; best = [sp, z]; }
      }
      if (!best) { speed = 26; vz = 6.5; } else { speed = best[0] * (0.96 + 0.06 * nrm(s.shotPower)); vz = best[1]; }
      spin = -side * dir * 0.9 * (0.55 + 0.45 * nrm(s.curve)) * (1 + 0.15 * Math.max(p.pf['Dead Ball'] || 0, p.pf['Finesse Shot'] || 0));
      tspin = 0.35; const T = d / speed; ang -= spin * this.ballM.magnus * T * 0.5;
    }
    ang += this.gauss() * errA;
    let scuff = false; if (this.rng() < clamp((1 - q) * 0.12, 0, 0.1)) { scuff = true; speed *= 0.6; vz *= 0.5; }
    this.kick(p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz, spin, 'shot', tspin);
    p.kickType = 'shot';
    this.ball.shot = { team: p.team, by: p, saveChecked: false, pen: false, bk: false, type: style === 'curl' ? 'finesse' : 'low', q: clamp(q, 0, 1), scuff, green: false, fk: true };
    this.stats.shots[p.team]++;
    this.say(style === 'curl' ? 'FREE KICK · CURLED OVER THE WALL' : 'FREE KICK · LOW AT THE FAR CORNER');
    this.psIconAny(p, ['Dead Ball', style === 'curl' && 'Finesse Shot', 'Power Shot'], 'ball');
    this.fx({ type: 'text', x: p.x, y: p.y - 2, text: style === 'curl' ? 'CURLER' : 'DRIVEN', color: '#ffd040', life: 0.9 });
  };

  P.restart = function (team, x, y, label) {
    if (this.training) { this.say('OUT - BALL BACK TO YOU'); this.trainBall(); return; }
    const b = this.ball;
    Object.assign(b, { x: clamp(x, 0.5, PITCH_W - 0.5), y: clamp(y, 0.5, PITCH_H - 0.5), z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, owner: null, shot: null, trail: [], inNet: null });
    let taker = null, best = 1e9;
    this.players.forEach(p => { if (p.team === team && !(p.isGK && label !== 'GOAL KICK')) { const d = dist(p, b); if (d < best) { best = d; taker = p; } } });
    if (label === 'GOAL KICK') taker = this.players.find(p => p.team === team && p.isGK);
    else if (label === 'CORNER' || label === 'FREE KICK' || label === 'THROW IN') { const tk = this.pickTaker(team, label, b.x, b.y); if (tk) taker = tk; }   // v95: the dead-ball specialist, or the full-back for a throw-in
    taker.x = b.x; taker.y = b.y; this.giveBall(taker);
    taker.cool.decide = 0.6;
    this.say(label);
    this.noOffside = ['GOAL KICK', 'CORNER', 'THROW IN'].includes(label);
    this.offsideList = []; this.penaltyKick = false; this.spAfter = null; this.fkWall = null;
    if (label === 'CORNER') this.stats.corners[team]++;
    this.phase = 'restart'; this.phaseT = 0.7;
    this.armSet(label, team, taker);
  };

  P.giveBall = function (p) {
    const b = this.ball;
    const prev = b.owner || b.last;
    if (prev && prev.team !== p.team) { this.lostAt[prev.team] = this.t; this.wonAt[p.team] = this.t; }
    if (b.passTo && prev && this.pstat) { if (prev.team === p.team) { if (p !== prev) this.pst(prev, 'pc'); } else this.pst(p, 'int'); }
    if (b.indirect && p !== b.indirect) b.indirect = null;
    b.owner = p; b.last = p; b.z = 0; b.vz = 0; b.spin = 0; b.tspin = 0; b.shot = null; b.trailType = null; b.passTo = null; b.cross = null; b.gotT = this.t; b.gotSp = this._inSp || 0;
    const c = this.ctls[p.team]; if (c) c.controlled = p;
  };

  P.say = function (text) { text = tl(text); this.ticker = text; this.tickerT = 2.5; };
  P.event = function (text, kind) {
    const e = { min: this.minute(), text: tl(text), kind: kind || 'info' };
    this.events.push(e); this.say(text);
    if (this.cfg.onEvent) this.cfg.onEvent(e);
  };
  P.minute = function () { const m = Math.floor((this.t / this.halfSeconds) * 45) + 1, cap = this.half * 45; return m > cap ? cap + '+' + (m - cap) : m; };
  /** v158: the logo of a PlayStyle pops up over the head of the player who uses it (replaces the old text pops, rings, lasers and coloured trails). Only if he really has that PlayStyle. */
  /*  v166 (JODIO): only PlayStyle+ shows its logo, and the logo stays over his head for as long as the PlayStyle+ is at work:
   *  'ball' = until the ball he played is controlled by somebody (or play stops), 'own' = while he keeps the ball,
   *  a function = while it returns true, a number = that many seconds. It follows him and fades once the move is done. */
  P.psIcon = function (p, name, until) {
    if (this.headless || !p || !p.pf || !(p.pf[name] >= 1)) return false;
    const b = this.ball, t0 = this.t;
    let live;
    if (typeof until === 'function') live = until;
    else if (until === 'own') live = () => b.owner === p;
    else if (until === 'ball') live = () => !b.owner && b.last === p && this.phase === 'play';
    else { const d = until || 1.1; live = () => this.t - t0 < d; }
    p.psOn = { name, t0, live, off: null };
    return true;
  };
  P.psIconAny = function (p, names, until) { for (const n of names) if (n && this.psIcon(p, n, until)) return n; return null; };
  /** Each tick: the always-on PlayStyles+ show while they are in use (Press Proven, Enforcer, Technical on the ball, Relentless on a long sprint), and finished logos fade out. */
  P.psTick = function () {
    if (this.headless) return;
    const b = this.ball;
    for (const p of this.players) {
      const o = p.psOn;
      if (o) {
        const on = this.t - o.t0 < 0.6 || (this.t - o.t0 < 9 && o.live());
        if (on) o.off = null; else if (o.off == null) o.off = this.t; else if (this.t - o.off > 0.3) p.psOn = null;
      }
      if (p.psOn || !p.pf || this.phase !== 'play') continue;
      if (b.owner === p) {
        const pr = this.pressure(p);
        if (pr >= 1 && this.psIconAny(p, ['Press Proven', 'Enforcer'], () => b.owner === p && this.pressure(p) >= 1)) continue;
        if (len(p.vx, p.vy) > 2.5) this.psIcon(p, 'Technical', () => b.owner === p && len(p.vx, p.vy) > 1.5);
      } else if (p.sprinting && p.stamina != null && (p.pf['Relentless'] || 0) >= 1 && (p._sprT = (p._sprT || 0) + 1 / 30) > 1.5) this.psIcon(p, 'Relentless', () => p.sprinting);
      if (!p.sprinting) p._sprT = 0;
    }
  };
  P.fx = function (o) { if (!this.headless) this.effects.push(Object.assign({ t: 0 }, o)); };

  /* ------------------------------ kicking -------------------------------- */
  P.kick = function (p, vx, vy, vz, spin, trailType, tspin) {
    const b = this.ball; this._kz = b.z;
    b.owner = null; b.last = p; b.vx = vx; b.vy = vy; b.vz = vz; b.spin = spin || 0; b.tspin = tspin || 0;
    b.noPick = p; b.noPickT = 0.25; b.trailType = trailType || null; b.trail = []; b.passTo = null; b.cross = null;
    p.cool.kick = 0.35; p.kickType = trailType === 'shot' ? 'shot' : vz > 4 ? 'chip' : Math.hypot(vx, vy) > 21 ? 'drive' : 'pass';   // v181: lofted passes scoop, driven ones swing like a shot
    if (this.training && p === this.hero) this.lastKick = { speed: Math.sqrt(vx * vx + vy * vy + vz * vz), lift: vz, t: this.t };
    if (!p.isGK) { if (this._kz > 1.4) p.cool.head = 0.5; else if (this._kz > 0.7) p.cool.volley = 0.45; }
  };

  /** The ground ball's roll with the turf's friction (the same law as the ball model): distance covered, time taken and speed left. Stops at `d` if given. */
  function rollSim(v0, rf, d) {
    let v = v0, x = 0, t = 0; const h = 0.02;
    while (t < 8) {
      if (d != null && x >= d) return { x, t, v, ok: true };
      const ns = Math.max(0, v * (1 - 0.6 * rf * h) - 0.8 * rf * h);
      if (ns < 0.15) return { x, t, v: 0, ok: d == null || x >= d };
      v = ns; x += v * h; t += h;
    }
    return { x, t, v, ok: d == null || x >= d };
  }

  /** A lofted ball through the air drag (the law of integrateBall3D): where it is, and how high, when it has flown `d` metres along the ground; `ok` false if it lands short. */
  function flightSim(sp, vz, dg, d) {
    let x = 0, z = 0.1, vh = sp, v3 = vz, t = 0; const h = 0.02;
    while (t < 6) {
      const v = Math.sqrt(vh * vh + v3 * v3), k = 0.0125 * dg * v;
      vh -= k * vh * h; v3 -= (9.81 + k * v3) * h; x += vh * h; z += v3 * h; t += h;
      if (x >= d) return { ok: true, zAt: z, t, reach: x };
      if (z <= 0 && v3 < 0) return { ok: false, zAt: 0, t, reach: x };
    }
    return { ok: false, zAt: 0, t, reach: x };
  }

  /** A curled ball still has to land on its man: fly the straight shot for its time in the air, then turn the launch angle against the bend and trim the pace until the curved path ends on the line to the target at the same range. */
  P.curveAim = function (ang, speed, vz, spin, dd, box) {
    const dg = this.ballM.drag, mg = this.ballM.magnus, h = 0.02;
    const f = flightSim(speed, vz, dg, box ? dd : 1e9), T = f.t, R = f.reach;
    let delta = 0, sp = speed;
    for (let it = 0; it < 6; it++) {
      let vh = sp, v3 = vz, ph = delta, sn = spin, x = 0, y = 0;
      for (let t = 0; t < T; t += h) {
        const v = Math.sqrt(vh * vh + v3 * v3), k = 0.0125 * dg * v;
        vh -= k * vh * h; v3 -= (9.81 + k * v3) * h; ph += sn * mg * h; sn *= 1 - 0.5 * h;
        x += vh * Math.cos(ph) * h; y += vh * Math.sin(ph) * h;
      }
      delta -= Math.atan2(y, x); sp *= clamp(R / (Math.hypot(x, y) || 1), 0.8, 1.25);
    }
    return { ang: ang + delta, speed: sp };
  };

  /** Pass to a teammate. `through` leads the receiver into space. `o` (human power bar): {power 0..1, lob}. */
  P.pass = function (p, target, through, o) {
    if (this.deferKick(p, () => this.pass(p, target, through, o))) return;
    o = o || {};
    const s = p.card.sub, b = this.ball, dir = this.teams[p.team].dir;
    const d = dist(p, target);
    if (this.smartT[p.team] >= 4.5 && !this.ctlOf(p) && !p.isGK && !o.lob && d < 26) { p._g2 = { x: clamp(p.x + dir * 12, 2, PITCH_W - 2), y: clamp(p.y + (PH2 - p.y) * 0.3, 3, PITCH_H - 3), until: this.t + 2.2 }; target._g1 = { from: p, t: this.t }; }   // v201 Top 5 / UCL: pass and move (give-and-go)
    // crosses from wide in the final third use Crossing; long balls Long Passing; the rest Short Passing
    const crossing = o.lob && Math.abs(p.y - PH2) > 18 && ((p.x - PW2) * dir) > 18;
    const pasN = nrm(p.isGK ? s.gkKicking : crossing ? s.crossing : (d > 30 || o.lob) ? s.longPassing : s.shortPassing);
    let speed = clamp(7.5 + d * 1.05, 13, 33) * (0.88 + 0.32 * pasN) * 1.1;               // crisp, driven passes: the ball arrives quickly (better passers hit it harder and truer)
    const pinged = (p.pf['Pinged Pass'] || 0);
    const fixed = o.power != null;                                                  // human power bar: constant pace, the bar only picks the range
    if (fixed) speed = (through ? 21 : 27) * (0.92 + 0.16 * pasN);
    if (fixed && !through && !o.lob && o.power > 0.15) speed *= 1 + 0.4 * (o.power - 0.15) / 0.85;   // v205 (JODIO): held past 15% the pass is driven harder (up to +40% pace at a full bar)
    speed *= 1 + 0.3 * pinged;
    if (this.sp && this.sp.kind === 'THROW IN' && this.sp.taker === p) speed *= 1 + 0.25 * (p.pf['Long Throw'] || 0);          // v148 Long Throw: more power, more distance
    if (p.isGK) speed *= 1 + 0.12 * (p.pf['Far Throw'] || 0);                                                                  // v148 Far Throw: the keeper's distribution travels further
    if (through && !fixed) speed *= 0.8;                                            // through balls are weighted, not driven: slower and shorter
    // aim at where he will be: solve the interception point (ball speed vs his run) instead of a single linear lead
    let tx = target.x, ty = target.y;
    for (let it = 0; it < 4; it++) { const tr = len(tx - p.x, ty - p.y) / speed; tx = target.x + target.vx * tr * 0.95; ty = target.y + target.vy * tr * 0.95; }
    // v205 (JODIO): a long ball to a team-mate who is making a run is played into his path, like a lofted through ball
    if ((o.lob || (o.power == null && d > 28)) && !through && !p.isGK && len(tx - p.x, ty - p.y) >= 25) {
      const hv = len(target.vx, target.vy), runs = hv > 2.5 && ((target.vx * dir) > 2.5 || (target.run && target.run.until > this.t));
      if (runs) { const lead = 3 + 2 * (o.power != null ? o.power : nrm(s.vision)) + (p.pf['Long Ball Pass'] || 0); tx += target.vx / hv * lead; ty += target.vy / hv * lead; }
    }
    if (through) {
      // v92: a through ball always ends up 1 to 3 m in front of the runner (the power bar picks the 1-3 m), whoever plays it. It is aimed with the real roll of the ball
      // (friction slows it, so the runner has moved on by the time it arrives), always has the pace to get there, and carries no aim error.
      const lead = clamp(o.power != null ? 1 + 2 * o.power : 1 + 2 * nrm(s.vision), 1, 3), rf = this.surf.roll;
      const hv = len(target.vx, target.vy), ux = hv > 1.5 ? target.vx / hv : dir, uy = hv > 1.5 ? target.vy / hv : 0;
      const varr = Math.max(8, hv + 3);                                            // it arrives only a little faster than he runs, so he can take it in his stride
      const weigh = d1 => { for (const va of [varr, 4, 0]) { let v = Math.max(9, hv + 4); while (v < 36) { const r = rollSim(v, rf, d1); if (r.ok && r.v >= va) return v; v += 0.5; } } return 36; };
      for (let it = 0; it < 12; it++) {
        const d0 = len(tx - p.x, ty - p.y);
        speed = weigh(d0);
        const tt = rollSim(speed, rf, d0).t;
        tx = target.x + target.vx * tt + ux * lead; ty = target.y + target.vy * tt + uy * lead;
      }
      tx = clamp(tx, 1, PITCH_W - 1); ty = clamp(ty, 1, PITCH_H - 1);
      { const d1 = len(tx - p.x, ty - p.y), far = rollSim(36, rf, null).x * 0.97; if (d1 > far) { tx = p.x + (tx - p.x) * far / d1; ty = p.y + (ty - p.y) * far / d1; } }   // beyond the longest ball that can roll: play it as far as it goes
      speed = weigh(len(tx - p.x, ty - p.y));
    }
    tx = clamp(tx, 1, PITCH_W - 1); ty = clamp(ty, 1, PITCH_H - 1);
    let err = 0.006 + 0.14 * Math.pow(1 - pasN, 1.5) + (through ? 0.03 * (1 - nrm(s.vision)) : 0);   // a decent passer finds his man within a metre or so
    if (this.pressure(p) < 2) err *= 1 + (1 - nrm(s.composure)) * 0.6;          // rushed under pressure
    if (p.tr.has('nlk')) err *= 1.15;
    if (p.isGK && p.tr.has('shk')) err *= 1.7;                                  // shaky with his feet
    if (this.bigMoment(p)) err *= 0.85;
    err /= p.mood;
    err *= this.ctlOf(p) ? 0 : this.smartT[p.team] > 1 ? 0.35 / this.teamIQ[p.team] : 1;   // v201: Champions League sides pass even truer                  // v120: a human's pass goes exactly where it was aimed; smart sides' passes find their man far more truly
    if (d < 20) err *= 1 - 0.6 * (p.pf['Tiki Taka'] || 0);
    if (through) err *= 1 - 0.6 * (p.pf['Incisive Pass'] || 0);
    if (d > 30) err *= 1 - 0.6 * (p.pf['Long Ball Pass'] || 0);
    if (p.isGK) err *= 1 - 0.3 * (p.pf['Far Throw'] || 0);
    if (through) err = 0;
    const ang = Math.atan2(ty - p.y, tx - p.x) + clamp(this.gauss(), -2.2, 2.2) * err;
    let dd = len(tx - p.x, ty - p.y);
    // power bar weight: the ideal fill for this distance vs. what was held. Good passers correct a badly judged weight.
    let weight = 1;
    if (o.power != null && !through && false) {
      const ideal = o.lob ? clamp((dd - 10) / 45, 0, 1) : clamp((dd - 5) / 40, 0, 1);
      weight = 1 + (o.power - ideal) * (o.lob ? 0.9 : 0.7) * (1.15 - pasN);
      speed *= weight; dd *= o.lob ? weight : 1;
    }
    const lofted = !through && (o.lob || (o.power == null && (dd > 28 || (dd > 12 && this.laneBlocked(p, { x: tx, y: ty }) > 0))));
    let vz = 0;
    const boxCross = lofted && !p.isGK && dd > 14 && this.inBox({ x: tx, y: ty }, 1 - p.team);
    const whip = (p.pf['Whipped Pass'] || 0) && lofted && (crossing || boxCross || Math.abs(p.y - PH2) > 14);          // v105: a curled cross with added pace
    if (boxCross) {                                                                // v92: a long ball to a man in the box is a high cross that arrives at head height
      const T = clamp(0.8 + dd / 20, 1.3, 2.9) * (whip ? 0.9 : 1), dg = this.ballM.drag;
      vz = (2.1 + 4.9 * T * T) / T; speed = dd / T * 1.04;
      for (let it = 0; it < 7; it++) {                                            // fly it through the real air drag and fix pace and loft until it comes down at the man at 2.1 m
        const f = flightSim(speed, vz, dg, dd);
        if (!f.ok) { speed *= 1.12; continue; }
        speed *= dd / Math.max(1, f.reach) * 0.5 + 0.5; vz += (2.1 - f.zAt) / Math.max(0.8, f.t) * 0.8;
      }
    } else if (lofted && dd >= 25 && !crossing) {
      // v205 (JODIO): long balls are driven: faster and flatter, and they come down ON the receiver (about knee height) instead of bouncing short of him. Long Ball Pass(+) adds pace.
      const lbp = p.pf['Long Ball Pass'] || 0, dg = this.ballM.drag;
      speed = (fixed ? 29 * (0.92 + 0.16 * pasN) * (1 + 0.3 * pinged) * (o.power > 0.15 ? 1 + 0.25 * (o.power - 0.15) / 0.85 : 1) : clamp(14 + dd * 0.38, 20, 34)) * (1 + 0.1 * lbp);
      vz = clamp(4.9 * dd / speed, 3, 13);
      for (let it = 0; it < 8; it++) {
        const f = flightSim(speed, vz, dg, dd);
        if (!f.ok) { if (vz < 13) vz *= 1.12; else speed *= 1.06; continue; }
        vz += (0.7 - f.zAt) / Math.max(0.5, f.t) * 0.8;
      }
      vz = clamp(vz, 3, 14);
    } else if (lofted) { // chip it so it drops just short of the target and rolls on
      if (fixed) {                                                                // same pace at any range: a longer ball just flies higher
        speed = 21 * (0.92 + 0.16 * pasN) * (1 + 0.3 * pinged);
        const T = (dd * 0.9) / speed; vz = clamp(4.9 * T * 1.4, 3.6, 17);   // v149: long balls fly higher
        speed = (dd * 0.9) / (2 * vz / 9.8);
      } else {
        vz = (crossing ? 4.2 : 3.5) + dd * 0.09;
        const T = 2 * vz / 9.8;
        speed = (dd * 0.88) / T;
      }
    }
    let pspin = 0, ptrail = pinged ? 'pinged' : null, ang2 = ang;
    if (whip && vz > 0) {
      // v105 Whipped Pass+: a real curled cross. Sidespin bends the flight in towards the goal, with extra pace; the launch angle and pace are solved so the curve still lands on the man.
      const mag = 0.42 + 0.3 * nrm(s.curve || 60) + 0.15 * nrm(s.crossing || 60), sgn = Math.sign(Math.cos(ang) * (PH2 - p.y)) || 1;
      pspin = sgn * mag; ptrail = 'finesse';
      const cs = this.curveAim(ang, speed, vz, pspin, dd, boxCross); ang2 = cs.ang; speed = cs.speed;
    }
    const cnC = this.sp && this.sp.kind === 'CORNER' && this.sp.taker === p ? this.ctlOf(p) : null;   // v187: your corner's shape (Z knuckleball, C in / outswinger)
    if (cnC && vz > 0) {
      if (cnC.spKnuckle) { pspin = this.gauss() * 0.35; ptrail = 'pinged'; ang2 = ang; }
      else { const mag = 0.42 + 0.3 * nrm(s.curve || 60) + 0.15 * nrm(s.crossing || 60), sgn = (Math.sign(Math.cos(ang) * (PH2 - p.y)) || 1) * ((cnC.spCurve || 1) < 0 ? -1 : 1);
        pspin = sgn * mag; ptrail = 'finesse'; const cs = this.curveAim(ang, speed, vz, pspin, dd, boxCross); ang2 = cs.ang; speed = cs.speed; }
    }
    const inv = Math.max(p.pf['Inventive'] || 0, p.pf['Trivela'] || 0);
    if (!cnC && inv && this.pressure(p) < 3 && this.rng() < 0.6 * inv) { // outside of the boot under pressure (Trivela+ does it too since v166)
      pspin = 0.9 * (this.rng() < 0.5 ? -1 : 1); ptrail = 'trivela';
    }
    this.kick(p, Math.cos(ang2) * speed, Math.sin(ang2) * speed, vz, pspin, ptrail);
    this.ball.passTo = { p: target, x: tx, y: ty, hv: fixed };
    this.ball.cross = boxCross ? { p: target, x: tx, y: ty, t: this.t } : null;
    this.offsideSnapshot(p);
    this.stats.passes[p.team]++;
    this.ev('pass', p, { d: dd, tx, lob: lofted, thru: !!through, cross: !!boxCross || !!crossing });
    if (this.learn) { const sc = this.scout[p.team]; sc.passes++; if (d > 26 || o.lob || through) sc.longP++; }
    this.psIconAny(p, [whip && 'Whipped Pass', ptrail === 'trivela' && 'Inventive', ptrail === 'trivela' && 'Trivela', 'Pinged Pass', through && 'Incisive Pass', d > 30 && 'Long Ball Pass', d < 20 && 'Tiki Taka',
      this.sp && this.sp.kind === 'THROW IN' && this.sp.taker === p && 'Long Throw', p.isGK && 'Far Throw'], 'ball');   // v166: the logo of the PlayStyle+ that shaped this pass rides over him until it arrives
    const c = this.ctls[p.team]; if (c) { c.pendingReceiver = target; target.autoUntil = this.t + 4; target.hlUntil = this.t + 2.2; }   // the receiver runs onto the ball by himself until it reaches him
  };

  /**
   * Power bar sweet spot for a shot: releasing inside the green zone gives the cleanest strike. The zone is wider for
   * better finishers (Long Shots from distance). Returns {lo, hi} on the 0..1 bar.
   */
  P.shotZone = function (p) {
    const s = p.card.sub, gx = this.teams[p.team].dir > 0 ? PITCH_W : 0, d = len(gx - p.x, PH2 - p.y);
    const fin = nrm(d > 20 ? s.longShots : s.finishing), c = d > 20 ? 0.74 : 0.62, hw = (0.035 + 0.13 * fin) * (this.assist === 'manual' ? 1 : this.assist === 'semi' ? 1.5 : 1.35);
    return { lo: c - hw, hi: c + hw };
  };
  /** Shot = the zone check plus pass-type stats for the other bars: ideal fill for the current best target (white tick). */
  P.barIdeal = function (p, c) {
    if (c.hold === 'shoot') return null;
    let dx = c.input.right - c.input.left, dy = c.input.down - c.input.up;
    const pd0 = c.pad || c.touch; if (pd0 && (pd0.x || pd0.y)) { dx = pd0.x; dy = pd0.y; }
    const L = len(dx, dy);
    const t = this.pickTarget(p, L ? dx / L : p.fx, L ? dy / L : p.fy, false, c.charge, c.hold === 'lob');
    if (!t || c.hold === 'through') return null;
    const d = dist(p, t);
    return c.hold === 'lob' ? clamp((d - 10) / 45, 0, 1) : clamp((d - 5) / 40, 0, 1);
  };

  /**
   * Everything about the strike that is not the shooter's finishing stat, as an error multiplier (1 = a textbook strike) and a power multiplier.
   *   body shape   shooting across the body, or turned away from the target, costs accuracy (agility and balance soften it)
   *   momentum     sideways or backwards running at the moment of contact; off balance after a skill move / challenge
   *   stronger foot  a target that needs the weaker foot (weak-foot stars)
   *   lane         a defender's lunging leg or body in the shooting lane
   *   fatigue      a tired human player
   *   first time   a ball struck on arrival: pace comes from the incoming ball, accuracy depends on how it came and on the finisher
   */
  P.shotCtx = function (p, ang) {
    const s = p.card.sub, b = this.ball, dx = Math.cos(ang), dy = Math.sin(ang);
    const across = clamp((1 - (p.fx * dx + p.fy * dy)) / 2, 0, 1);
    const body = 1 + 1.4 * Math.pow(across, 1.5) * (1.3 - 0.6 * p.agil);
    const mx = p.sprintMax || 8, lat = Math.abs(p.vx * dy - p.vy * dx) / mx, back = Math.max(0, -(p.vx * dx + p.vy * dy)) / mx;
    let mom = 1 + 0.35 * lat + 0.4 * back;
    if (p.cool.stun > 0 || p.skill || p.cool.fooled > 0) mom *= 1.35;
    const cross = p.fx * dy - p.fy * dx, wf = (p.card.details && p.card.details.weakFoot) || 3, left = p.card.details && p.card.details.foot === 'Left';
    const weakSide = left ? cross > 0.15 : cross < -0.15;
    const foot = weakSide ? 1 + (5 - wf) * 0.1 * clamp(Math.abs(cross) / 0.4, 0, 1) : 1;
    let lane = 0;
    for (const o of this.players) {
      if (o.team === p.team || o.isGK) continue;
      const vx = o.x - p.x, vy = o.y - p.y, al = vx * dx + vy * dy;
      if (al < 0.4 || al > 11) continue;
      const pd = Math.abs(vx * dy - vy * dx);
      lane = Math.max(lane, clamp(1 - pd / 2.2, 0, 1) * (1 - al / 11) * (o.cool.slide > 0 ? 1.4 : 1));
    }
    const tired = p.stamina < 45 ? 1 + (45 - p.stamina) / 120 : 1;
    const ft = b.gotT != null && this.t - b.gotT < 0.35 && !b.owner ? 1 : (b.owner === p && this.t - (b.gotT == null ? -9 : b.gotT) < 0.35 ? 1 : 0);
    return { body, mom, foot, lane: 1 + 0.5 * lane, tired, ft, across };
  };

  /** A kicked/loose ball struck on the move. Types: normal, low, finesse, chip, power, volley, header (and auto-picked by ball height). */
  P.shotType = function (p, opt) {
    if (opt.type) return opt.type;
    const z = this.ball.owner === p ? 0 : this.ball.z;
    if (z > 1.35) return 'header';
    if (z > 0.3) return 'volley';
    if ((p.pf['Finesse Shot'] || 0)) return 'finesse';
    if ((p.pf['Power Shot'] || 0)) return 'power';
    if ((p.pf['Low Driven Shot'] || 0)) return 'low';
    return 'normal';
  };

  /** Shoot at goal. aim ∈ [-1, 1] (top/bottom post), power ∈ [0.2, 1]. `bar` = the human's raw power-bar fill (0..1).
   *  opt: {long, type, timing:{kind:'green'|'early'|'none', d}, assist, first}. */
  P.shoot = function (p, aim, power, bar, opt) {
    if (!(this.sp && this.sp.taker === p && this.sp.noShoot) && this.deferKick(p, () => this.shoot(p, aim, power, bar, opt))) return;
    opt = opt || {};
    if (this.sp && this.sp.taker === p && this.sp.noShoot) return;                  // at a kick-off, throw-in or goal kick the taker may only pass
    const longS = !!opt.long;                                                      // an AI 'have a go' from distance: full power, rising ball
    if (longS) power = 1;
    const s = p.card.sub, dir = this.teams[p.team].dir, b = this.ball;
    const gx = dir > 0 ? PITCH_W : 0;
    const d = len(gx - p.x, PH2 - p.y);
    const type = this.shotType(p, opt), loose = b.owner !== p;
    const AS = ASSIST[opt.assist || this.assist];
    const finesse = type === 'finesse', powerPS = type === 'power', low = type === 'low', chip = type === 'chip', volley = type === 'volley', head = type === 'header';
    const gk = this.players.find(o => o.isGK && o.team !== p.team);
    let ty = opt.ty != null ? opt.ty : PH2 + aim * (GOAL_HALF - 0.55);
    const netShot = opt.ty != null && !this.penaltyKick && this.rng() < 0.9;                  // v138: 9 in 10 semi / full-auto shots go into the net even when he is not facing the goal
    if (netShot) ty = PH2 + clamp(ty - PH2, -(GOAL_HALF - 0.9), GOAL_HALF - 0.9);
    if (netShot && (opt.assist || this.assist) === 'full' && this.ctlOf(p) && !head && !chip) {   // v206 (JODIO): your full-auto shots and finesse curlers go wider, out by the post (better finishers closer to it)
      const fin0 = nrm(d > 20 ? s.longShots : s.finishing);
      let off = ty - PH2;
      if (Math.abs(off) < 1.5 && gk && Math.abs(gk.y - PH2) > 0.5) off = gk.y > PH2 ? -1 : 1;                           // straight at the keeper: the open side
      const wide = (GOAL_HALF - 0.9) * (finesse ? 0.72 + 0.2 * fin0 : 0.72 + 0.22 * fin0);
      ty = PH2 + (Math.sign(off) || 1) * clamp(Math.max(Math.abs(off), wide), 0, GOAL_HALF - 0.6);
    }
    const ps0 = p.card.position, elite = (!!this.tac[p.team].elite || ps0 === 'ST' || ps0 === 'CF' || ps0 === 'RW' || ps0 === 'LW') && !this.ctlOf(p) && !p.isGK;   // A1 teams, and every AI striker / winger in any league: shots always on frame
    const autoA = !!opt.auto || elite, humanAs = (autoA || ((bar != null || opt.human) && this.assist !== 'manual')) && (!opt.long || elite) && !this.penaltyKick;
    // auto-assist with no aim given: pick a corner away from the keeper; how close to the post depends on the shooter's finishing
    if (humanAs && (autoA || this.assist === 'full') && aim === 0 && opt.ty == null && !head && !chip) {
      const side = gk && Math.abs(gk.y - PH2) > 0.8 ? (gk.y > PH2 ? -1 : 1) : (this.rng() < 0.5 ? -1 : 1);
      ty = PH2 + side * (GOAL_HALF - 0.55) * clamp(0.35 + 0.55 * nrm(d > 20 ? s.longShots : s.finishing) + this.gauss() * 0.1, 0.2, 0.95);
    }
    let speed = (11 + 22 * nrm(s.shotPower)) * (0.5 + 0.5 * power);                 // power stat scales how hard it is hit
    if (powerPS) speed *= (p.pf['Power Shot'] || 0) ? 1 + 0.15 * p.pf['Power Shot'] : 1.12;
    if (low) speed *= 1.3;                                                          // v208 (JODIO): low driven shots fly 30% faster
    // the stat that decides the accuracy of this kind of strike
    const fin = head ? nrm(0.5 * (s.headingAccuracy || 55) + 0.25 * (s.positioning || 55) + 0.25 * (s.finishing || 55))
      : volley ? nrm(0.65 * (s.volleys || s.finishing || 55) + 0.35 * (s.finishing || 55))
      : nrm(d > 20 ? s.longShots : s.finishing);
    let err = 0.02 + 0.36 * Math.pow(1 - fin, 1.3) + (d / 40) * (d > 20 ? 0.1 : 0.07) + (power > 0.9 ? 0.04 : 0);
    if (this.pressure(p) < 2) err *= 1 + (1 - nrm(s.composure)) * 0.7;
    if (p.tr.has('fin')) err *= 0.85;
    if (d > 20 && p.tr.has('lng')) err *= 0.85;
    if (volley && (bar != null || opt.human) && this.assist !== 'manual') err *= 0.8;          // assisted volleys are easier to keep on frame
    if (volley || head) err *= p.tr.has('wka') && head ? 1.5 : p.tr.has('air') && head ? 0.8 : 1;
    if (this.bigMoment(p)) err *= 0.85;
    if (p.tr.has('sub') && (parseInt(this.minute(), 10) >= 70)) err *= 0.85;
    if (!this.ctlOf(p)) err *= 1 - 0.18 * this.eliteT[p.team];                     // v219: elite AI finishes more calmly
    if (powerPS) err *= 1.18;                                                       // wind-up strikes trade accuracy for pace
    // v148 PlayStyles per the guide: Low Driven = accuracy (its speed is the attributes' own), Precision Header = header accuracy + power, Acrobatic = volleys, Chip = chips, Gamechanger = fancy / awkward strikes under pressure
    if (low) err *= 1 - 0.3 * (p.pf['Low Driven Shot'] || 0);
    if (head) err *= 1 - 0.35 * (p.pf['Precision Header'] || 0);
    if (volley) err *= 1 - 0.3 * (p.pf['Acrobatic'] || 0);
    if (chip) err *= 1 - 0.4 * (p.pf['Chip Shot'] || 0);
    if (this.pressure(p) >= 1) err *= 1 - 0.25 * (p.pf['Gamechanger'] || 0);
    const bk = this.boxKiller(p);
    if (bk) { err *= 0.35; speed *= 1.06; }
    else if (!opt.human && this.elite85(p)) { err *= 0.6; speed *= 1.04; }          // an 85+ striker of the ball is deadly from anywhere, not just in the box
    err /= p.mood;
    const isPen = !!this.penaltyKick;
    // v128 finisher edge: a high-finishing striker inside the box (human or AI) places it better and is harder to save, to a degree (full inside ~11 m, gone by 19 m)
    const fe = !isPen && !longS && !head && !chip && opt.ty == null ? clamp((nrm(s.finishing) - 0.55) / 0.45, 0, 1) * clamp((19 - d) / 8, 0, 1) : 0;
    if (fe && !bk) err *= 1 - 0.35 * fe;
    if (fe && (bar != null || opt.human) && gk) { const side = Math.abs(gk.y - PH2) > 0.8 ? (gk.y > PH2 ? -1 : 1) : (this.rng() < 0.5 ? -1 : 1); ty += (PH2 + side * (GOAL_HALF - 0.8) - ty) * 0.5 * fe; }
    // the error model: body shape, momentum, foot, lane, fatigue, first time. Penalties are a quiet run-up: none of it applies.
    const ang0 = Math.atan2(ty - p.y, gx - p.x);
    const X = isPen ? null : this.shotCtx(p, ang0);
    if (X) {
      err *= X.body * X.mom * X.foot * X.lane * X.tired * 0.93;
      if (X.ft && !head) { err *= 1 + 0.25 * (1 - nrm(0.5 * (s.finishing || 55) + 0.5 * (s.ballControl || 55))); speed *= 1 + 0.12 * clamp((b.gotSp || 0) / 22, 0, 1); }
      if (X.ft && (b.owner !== p)) speed *= 1;
    }
    // header: power and direction come from the jump timing, positioning and strength against the marker
    let jt = 1, win = 1;
    if (head) {
      const own = 0.5 * nrm(s.strength) + 0.5 * nrm(s.jumping), peak = 1.5 + 0.6 * nrm(s.jumping);
      jt = 1 - clamp(Math.abs(b.z - peak) / 1.0, 0, 1);
      let opp = 0.35; for (const o of this.players) if (o.team !== p.team && !o.isGK && dist(o, p) < 1.9) opp = Math.max(opp, 0.5 * nrm(o.card.sub.strength) + 0.5 * nrm(o.card.sub.jumping) + 0.12 * (o.pf['Aerial Fortress'] || 0));
      win = clamp(0.55 + own - opp, 0.2, 1);
      speed = (6 + 14 * nrm(0.35 * (s.headingAccuracy || 55) + 0.25 * (s.jumping || 55) + 0.25 * (s.strength || 55) + 0.15 * (s.positioning || 55))) * (0.5 + 0.5 * power) * (0.55 + 0.45 * jt * win);
      err *= 1 + (1 - jt) * 0.9 + (1 - win) * 0.7;
      speed *= 1 + 0.12 * (p.pf['Precision Header'] || 0) + 0.15 * (p.pf['Power Header'] || 0);   // v166: Power Header+ heads it harder
    }
    let skied = 0, timeCut = 1;
    if (bar != null) {
      // human power bar: green zone = clean strike; over-hit balloons it and sprays wide, under-hit is weak but tidy. Assists pull an
      // over- or under-charged bar back toward the sweet spot.
      const z = this.shotZone(p), mid = (z.lo + z.hi) / 2;
      bar = bar + (mid - bar) * AS.power * (bar > z.hi || bar < z.lo ? 1 : 0);
      if (bar >= z.lo && bar <= z.hi) { err *= 0.55; if (!this.headless) this.fx({ type: 'text', x: p.x, y: p.y - 2, text: 'PERFECT!', color: '#60ff60', life: 0.7 }); }
      else if (bar > z.hi) { const over = bar - z.hi; err += over * 0.35 * (1.25 - fin); skied = over * (42 - 20 * nrm(s.shotPower)); }
      else err *= 0.9;
    }
    // timed finishing: a second press at the moment of contact green-hits the strike; a mistimed one drags it wide or takes the sting out of it
    const tm = opt.timing;
    if (tm) {
      if (tm.kind === 'green') { err *= 0.45; speed *= 1.04; this.fx({ type: 'text', x: p.x, y: p.y - 3.2, text: 'GREEN HIT!', color: '#40ff90', life: 0.9 }); }
      else if (tm.kind === 'early') {
        const off = clamp((tm.d - AS.win) / 0.25, 0, 1) * (1 - AS.time);
        err += off * 0.22; timeCut = 1 - 0.35 * off; speed *= timeCut;
        if (off > 0.12) this.fx({ type: 'text', x: p.x, y: p.y - 3.2, text: 'MISTIMED', color: '#ff9060', life: 0.8 });
      } else if (AS.needPress) err *= 1.12;                                          // fully manual and no timing press: a scruffier strike
    }
    if (this.penaltyKick) { err = (0.012 + Math.pow(1 - clamp((s.penalties || 50) / 99, 0, 1), 1.3) * 0.3) * (p.tr.has('pen') ? 0.6 : 1) * (this.bigMoment(p) ? 0.85 : 1); this.penaltyKick = false; }   // v186 (JODIO): accuracy comes from the Penalties stat: 95 hits the spot, 60 sprays
    // assisted shooting: a correction layer on the human's strike (lower difficulties keep a weak aim on frame)
    if (bar != null || opt.timing || opt.human) err *= AS.aim;
    if ((bar != null || opt.human) && this.assist !== 'manual') {                  // assisted shooting rewards a good finisher: more pace and a truer strike
      const fq = nrm(Math.max(s.finishing || 55, d > 20 ? s.longShots || 55 : 0)) * (this.assist === 'full' ? 1 : 0.75);
      err *= 1 - 0.35 * fq; speed *= 1 + 0.14 * fq;
    }
    let spin = this.gauss() * 0.12, tspin = (this.rng() - 0.4) * 0.4;
    let ang = Math.atan2(ty - p.y, gx - p.x);
    let curlComp = 0;
    const ff = p.pf['Finesse Shot'] || 0;
    const fkC = !this.penaltyKick && this.sp && this.sp.kind === 'FREE KICK' && this.sp.taker === p ? this.ctlOf(p) : null, knuck = !!(fkC && fkC.spKnuckle);
    const fkDirect = !!(this.sp && this.sp.kind === 'FREE KICK' && this.sp.taker === p);
    if (!elite && !knuck && (fkC || finesse || (s.curve > 82 && !chip && !head && this.rng() < 0.4))) {
      // v148 curl (JODIO, per the PlayStyles guide): the strike starts out wide on a diagonal and bends back in to the far post. Aim pre-compensates the bend.
      let side = aim === 0 ? (Math.abs(PH2 - p.y) > 2 ? Math.sign(PH2 - p.y) : (this.rng() < 0.5 ? -1 : 1)) : Math.sign(aim);     // with no aim given the curler goes for the far post
      if (fkC && (fkC.spCurve || 1) < 0) side = -side;                              // v187: outside of the boot, it bends away instead
      var dbK = fkC ? (p.pf['Dead Ball'] || 0) : 0;                                 // v188: Dead Ball (+) = a bigger, truer bend from a free kick
      spin = -side * dir * (finesse ? 0.8 * (1 + (ff || 0.8)) : 0.8) * (0.85 + 0.3 * nrm(s.curve));     // Finesse Shot+: +100% curve (silver +55%); the curve stat decides how much it bends
      tspin = 0.25;
      if (finesse) speed *= 1 + 0.08 * (ff || 0.8);
      const T = d / speed;
      spin *= 1 + 0.45 * (dbK || 0);
      let comp = spin * this.ballM.magnus * T * 0.5; const lim = (finesse ? 0.4 + 0.3 * (ff || 0.8) : 0.4) + 0.2 * (dbK || 0);       // the run-up angle is capped (gold 0.64 rad, silver 0.56): a longer shot bends a little less instead
      if (Math.abs(comp) > lim) { spin *= lim / Math.abs(comp); comp = Math.sign(comp) * lim; }
      curlComp = comp;
      err *= finesse ? 1 - 0.3 * (ff || 0.8) : 1;
      err *= 1 - 0.35 * (dbK || 0);
    }
    if (elite) { spin = 0; curlComp = 0; }                                       // no curl or swerve: it goes where it was aimed
    if (knuck) { const db = p.pf['Dead Ball'] || 0; spin = (this.gauss() * 0.5 + (this.rng() < 0.5 ? -0.3 : 0.3)) * (1 + 0.4 * db); tspin = -0.25 * db; speed *= 1.1 + 0.06 * db; curlComp = 0; err *= 1 - 0.35 * db; }   // v188: Dead Ball (+) knuckles harder (more dip) and truer   // v187 knuckleball: no spin, wobbles and dips late
    if (powerPS && !elite) { tspin = 0; if (this.rng() < 0.25 + 0.3 * nrm(s.shotPower)) spin = this.gauss() * 0.6; }    // a hard, spinless strike can knuckle and dip late
    if ((p.pf['Power Shot'] || 0) >= 1) spin = 0;                                          // v139: a Power Shot+ player's strike never curves or knuckles: it goes dead straight
    if (volley) tspin = 0.55;
    if (low) tspin = 0.6;
    ang += this.gauss() * err * (elite ? 0.35 : 1);
    // assisted shots are pulled back onto the frame (most of the time for good finishers; poor ones can still miss)
    if (humanAs && (!head || elite)) {
      const fullA = autoA || this.assist === 'full', keep = elite || netShot ? 1 : this.assist === 'semi' && !autoA ? clamp(0.8 + 0.18 * fin, 0.8, 0.99) : clamp((fullA ? 0.6 : 0.3) + (fullA ? 0.38 : 0.4) * fin, 0.2, 0.97);   // semi assist keeps about 80-97% of shots on frame
      const yG = p.y + Math.tan(ang) * (gx - p.x), lim = GOAL_HALF - 0.35;
      if (Math.abs(yG - PH2) > lim && Math.cos(ang) * dir > 0 && this.rng() < keep) ang = Math.atan2(PH2 + clamp(yG - PH2, -lim, lim) - p.y, gx - p.x);
    }
    // scuffed / toe-poked: a poor strike (large error) sometimes catches the ball badly
    const sc = clamp((err - 0.14) * 0.3, 0, 0.18);
    let scuff = false;
    if (sc > 0 && !elite && this.rng() < sc) { scuff = true; speed *= 0.55; ang += this.gauss() * 0.12; }
    // harder hit = higher: full-power strikes lift off the ground; accurate finishers keep it down (the shot-accuracy stat), weak ones balloon
    let lift = (bar != null || longS ? (humanAs ? 9 : 11) * (1 + 0.015 * Math.max(0, d - 20)) : 1.6) * clamp((power - 0.45) / 0.55, 0, 1) * (1.15 - 0.75 * fin) * (low ? 0.25 : 1) * 2;   // v137: shots fly up to 2x as high
    let vz = (low ? 0.3 : 0.6 + this.rng() * 2.2 * (1 - fin * 0.7)) + lift + skied;
    if (volley) vz = 0.3 + this.rng() * 1.2 * (1 - fin) + lift * 0.6 + Math.max(0, b.z - 0.5) * -0.8;       // taken on the half-turn: keeps down if it is hit cleanly
    if (head) vz = -(0.6 + 2.6 * nrm(s.headingAccuracy) * jt) + (1 - jt) * 3.2 + this.gauss() * 0.5 * (1 - fin);   // nodded down; a mistimed jump sends it up
    if (scuff) vz *= 0.5;
    const curlAimY = curlComp && !chip ? p.y + Math.tan(ang) * (gx - p.x) : null;                               // v149: where the curler is meant to cross the line (the keeper reads the swerve from this)
    if (curlComp && !chip) ang -= curlComp;                                          // v148: the bend is added to the launch angle last, after the aim, the error and the keep-on-frame pull-back, so an assisted curler still starts wide and bends back in
    if (chip) {
      // reads the keeper: a lob with the apex above his reach that drops under the bar. Goes where he is not; a keeper on his line is hard to lift it over.
      const kd = gk ? Math.abs(gk.x - gx) : 0, T = clamp(1.25 + 0.012 * d, 1.1, 1.75);
      speed = Math.max(4, (d * 0.92) / T) * (1 + this.gauss() * 0.04 * (1 - fin));
      vz = 4.905 * T * (1 + this.gauss() * 0.05 * (1 - fin) * (1 - 0.5 * (p.pf['Chip Shot'] || 0)) + (kd < 1.8 ? 0.05 : 0));
      tspin = -1.0; spin *= 0.4; err *= 0.6;
    }
    // v187: penalties and direct free kicks: the keeper picks a side (or stays in the middle) at random before the strike
    if (isPen) { const gk0 = this.players.find(q => q.isGK && q.team !== p.team); if (gk0) { gk0._guess = this.ctls[gk0.team] ? (gk0._penPick || 0) : [-1, 0, 1][Math.floor(this.rng() * 3)]; gk0._penPick = null; } }   // v207: free kicks are no longer guessed: the keeper dives at the ball
    // v197 (JODIO): a human 94+ shooter never hits it at the keeper: a strike heading within 1.6 m of him is switched to the open side
    { const sho = Math.max(p.card.face && p.card.face.sho || 0, s.finishing || 0);
      if (sho >= 94 && this.ctlOf(p) && gk && !isPen && !chip && !head && Math.abs(gx - p.x) > 1) { const dx = gx - p.x, cross = curlAimY != null ? curlAimY : p.y + Math.tan(ang + (curlComp && !chip ? curlComp : 0)) * dx;
        if (Math.abs(cross - gk.y) < 1.6) { const side = Math.abs(gk.y - PH2) > 0.5 ? (gk.y > PH2 ? -1 : 1) : (cross >= gk.y ? 1 : -1); ang = Math.atan2(PH2 + side * (GOAL_HALF - 0.9) - p.y, dx) - (curlComp && !chip ? curlComp : 0); } } }
    // v196 (JODIO): assisted shooting for a human shooter: full auto keeps 95% of shots on frame, semi auto 90% (semi still goes where he aimed; only a shot that would miss is pulled inside the post / under the bar)
    { const am = opt.assist || this.assist;
      if (this.ctlOf(p) && (am === 'full' || am === 'semi') && !isPen && !chip && !head && Math.abs(gx - p.x) > 1 && this.rng() < (am === 'full' ? 0.86 : 0.66)) {   // forced share; with shots that stay on frame by themselves the total lands at about 95% / 90%
        const dx = gx - p.x, aimed = curlAimY != null ? curlAimY : p.y + Math.tan(ang) * dx, lim = GOAL_HALF - 0.35, ty = clamp(aimed, PH2 - lim, PH2 + lim);
        if (ty !== aimed) { ang = Math.atan2(ty - p.y, dx) - (curlComp && !chip ? curlComp : 0); }
        if (!curlComp) spin *= 0.3;                                                    // no wild swerve taking it back off target
        const T = Math.abs(dx) / Math.max(1, Math.abs(Math.cos(ang)) * speed), zT = vz * T - 4.905 * T * T;
        if (zT > GOAL_H - 0.3) vz = (GOAL_H * 0.65 + 4.905 * T * T) / T; } }
    // v182 (JODIO: "very long full-power shots: 0% chance of a goal"): from 30 m or more at full power it always flies over the bar
    if (!isPen && !chip && !head && d >= 30 && power >= 0.95) { const T = d / Math.max(8, speed); vz = Math.max(vz, (6 + 4.905 * T * T) / T); }
    if (bar != null) { p.cool.plant = 0.5; p.vx *= 0.3; p.vy *= 0.3; }                               // plants the feet: no running on through the strike
    this.kick(p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz, spin, powerPS ? 'power' : (finesse ? 'finesse' : 'shot'), tspin);
    p.kickType = 'shot';
    const q = clamp(1 - err / 0.32, 0, 1);
    this.ball.shot = { team: p.team, by: p, saveChecked: false, pen: isPen, fk: fkDirect && !isPen, bk, fe, type, q, scuff, green: !!(tm && tm.kind === 'green'), curl: curlAimY != null ? Math.abs(curlComp) : 0, aimY: curlAimY, pw: power, fx: p.x };
    this.stats.shots[p.team]++;
    if (!isPen) this.ev('shot', p, { head: !!head, volley: !!volley, chip: !!chip });
    if (this.learn && !isPen) { const sc = this.scout[p.team]; sc.shots++; if (Math.abs(p.x - (this.teams[p.team].dir > 0 ? PITCH_W : 0)) > 0.19 * PITCH_W) sc.longS++; }
    this.psIconAny(p, [powerPS && 'Power Shot', finesse && 'Finesse Shot', chip && 'Chip Shot', low && 'Low Driven Shot', volley && 'Acrobatic', head && 'Power Header', head && 'Precision Header', this.pressure(p) >= 1 && 'Gamechanger'], 'ball');   // v166: stays until the shot is over
    if (scuff && !this.headless) this.fx({ type: 'text', x: p.x, y: p.y - 3.2, text: 'SCUFFED', color: '#c0c0c0', life: 0.7 });
  };

  /** First-time strike at a ball that is not under control: a volley, half-volley or header decided by its height at contact. */
  P.firstTime = function (p, aim, power, human) {
    const b = this.ball;
    b.gotT = this.t; b.gotSp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    p.cool.plant = 0.2;
    this.shoot(p, aim, power, null, { human: !!human, assist: this.assist });
  };
  /** SHOOT pressed without the ball: strike a loose ball in the attacking third at once, or arm a first-time strike for when it arrives. */
  P.loosePress = function (p, c, dx, dy) {
    const b = this.ball; if (b.owner || b.noPick === p) return false;
    const gx = this.teams[p.team].dir > 0 ? PITCH_W : 0;
    const air = b.z > 0.6 || (b.passTo && b.passTo.p === p && b.vz !== 0);                  // a lob or cross still in the air can be armed from further out
    if (len(gx - b.x, PH2 - b.y) > (air ? 50 : 38)) return false;
    const aim = dy < -0.3 ? -1 : dy > 0.3 ? 1 : 0, d = dist(p, b), maxZ = 1.5 + 0.6 * nrm(p.card.sub.jumping);
    if (d < 2.2 && b.z <= maxZ) { this.firstTime(p, aim, 0.8, true); return true; }
    if (d < 9 && (b.z > 0.2 || len(b.vx, b.vy) > 2)) { c.arm = { until: this.t + 0.7, aim }; return true; }
    if (air && d < 26) { c.arm = { until: this.t + 1.9, aim }; return true; }                       // lobbed pass on its way: press SHOOT early and he volleys it first time as it arrives
    return false;
  };
  /** The AI meets a ball in the box: some finishers go first time instead of taking a touch. */
  P.aiFirstTime = function (p, sp) {
    const b = this.ball, tr = p.tr;
    if (p.cool.kick > 0 || p.cool.stun > 0 || !this.inBox(p, 1 - p.team) || !(b.z > 0.45 || sp > 9)) return false;
    if (b.last && b.last.team !== p.team && !(b.last.isGK)) return false;
    const fin = nrm(Math.max(p.card.sub.finishing || 55, p.card.sub.volleys || 55));
    if (this.rng() > 0.3 * fin * fin * (tr.has('box') ? 1.4 : 1) * (tr.has('sel') ? 0.6 : 1)) return false;
    const gk = this.players.find(o => o.team !== p.team && o.isGK), side = gk ? (gk.y < PH2 ? 1 : -1) : (this.rng() < 0.5 ? -1 : 1);
    this.tallyShot(p);
    this.firstTime(p, clamp(side * (0.3 + 0.5 * this.rng()), -1, 1), 0.7 + this.rng() * 0.3, false);
    return true;
  };

  /** An 85+ shooter (Shooting or Finishing) inside the box: sharper, harder to save, and keen to pull the trigger. */
  P.boxKiller = function (p) {
    if (p._bk === undefined) p._bk = Math.max(p.card.face && p.card.face.sho || 0, p.card.sub.finishing || 0) >= 85;
    return p._bk && this.inBox(p, p.team === 0 ? 1 : 0);
  };

  /** AI 85+ shooters (Shooting, Finishing or Long Shots) are sharper everywhere and keener to shoot. */
  P.elite85 = function (p) {
    if (p._el === undefined) p._el = !p.isGK && Math.max(p.card.face && p.card.face.sho || 0, p.card.sub.finishing || 0, p.card.sub.longShots || 0) >= 85;
    return p._el;
  };

  /** True when no outfield opponent is ahead of this carrier (level with him or nearer to goal) in a wide corridor: only the keeper is left. */
  P.isClear = function (p) {
    const dir = this.teams[p.team].dir;
    return !this.players.some(o => o.team !== p.team && !o.isGK && (o.x - p.x) * dir > -1.5 && Math.abs(o.y - p.y) < 26);
  };

  P.pressure = function (p) { let d = 1e9; this.players.forEach(o => { if (o.team !== p.team) d = Math.min(d, dist(o, p)); }); return d; };

  P.laneBlocked = function (from, to, noGK) {
    let n = 0;
    const dx = to.x - from.x, dy = to.y - from.y, L = len(dx, dy) || 1;
    this.players.forEach(o => {
      if (o.team === from.team || (noGK && o.isGK)) return;
      const t = clamp(((o.x - from.x) * dx + (o.y - from.y) * dy) / (L * L), 0, 1);
      const px = from.x + dx * t, py = from.y + dy * t;
      const r = 0.7 + 1.4 * clamp(((o.card.sub.interceptions || 60) + 20 * (o.pf['Intercept'] || 0) - 60) / 30, 0, 1);
      if (t > 0.05 && t < 0.95 && len(o.x - px, o.y - py) < r) n++;
    });
    return n;
  };

  P.gauss = function () { let u = 0, v = 0; while (!u) u = this.rng(); while (!v) v = this.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* ------------------------------ tackling ------------------------------- */
  /** League dribblers (AI sides at B3 and up) get an edge when the man in front of them is a real player. */

  /* ------------------ the Top 5 AI that learns how you play ------------------ */
  /** What the scouted side has done so far (blended with what earlier matches of the season showed): 0..1 shares and rates per minute. */
  P.scoutProfile = function (st, prior) {
    const s = this.scout[st], mins = Math.max(0.2, s.hold / 60), D = { wing: 0.4, long: 0.2, longShot: 0.25, skills: 1, line: 0.45, press: 1.3 };
    const mix = (obs, n, k, key) => { const pw = prior && prior[key] != null ? 6 : 0; return (obs * n + (prior && prior[key] != null ? prior[key] : D[key]) * pw + D[key] * k) / (n + pw + k); };
    const wing = mix(s.wing / Math.max(1, s.wing + s.centre), s.wing + s.centre > 0 ? Math.min(40, (s.wing + s.centre) / 10) : 0, 4, 'wing');
    return {
      wing, long: mix(s.longP / Math.max(1, s.passes), s.passes, 8, 'long'), longShot: mix(s.longS / Math.max(1, s.shots), s.shots, 3, 'longShot'),
      skills: mix(s.skills / mins, Math.min(20, mins * 2), 3, 'skills'), line: mix(s.lineS / Math.max(1, s.lineN), Math.min(30, s.lineN / 5), 3, 'line'), press: mix(s.preS / Math.max(1, s.preN), Math.min(30, s.preN / 5), 3, 'press'),
    };
  };
  /** Every tick: watch the scouted side (where it attacks, how high its line stands, how hard it closes the ball down); every few seconds re-plan. */
  P.learnStep = function (dt) {
    const b = this.ball;
    [0, 1].forEach(ti => {
      const L = this.learn[ti]; if (!L) return;
      const st = 1 - ti, s = this.scout[st], dir = this.teams[st].dir;
      if (b.owner && b.owner.team === st) { s.hold += dt; if (Math.abs(b.y - PH2) / PH2 > 0.5) s.wing += dt; else s.centre += dt; }
      else if (b.owner && b.owner.team === ti && Math.round(this.t * 60) % 6 === 0) {
        const own = dir > 0 ? 0 : PITCH_W; let sum = 0, n = 0, near = 0;
        this.players.forEach(p => { if (p.team !== st || p.isGK) return; if (p.slot >= 1 && p.slot <= 4) { sum += Math.abs(p.x - own) / PITCH_W; n++; } if (dist(p, b.owner) < 12) near++; });
        if (n) { s.lineS += sum / n; s.lineN++; } s.preS += near; s.preN++;
      }
      if (this.t >= L.next && this.phase === 'play') { L.next = this.t + L.every; this.adaptTactic(ti, L); }
    });
  };
  /** Rebuild the tactic from the club's own one plus the answers to what the scouted side does. Pure arithmetic on match state: nothing random. */
  P.adaptTactic = function (ti, L) {
    const pf = this.scoutProfile(1 - ti, L.prior), T = Object.assign({}, L.base), notes = [], hs = this.halfSeconds, left = (hs * 2 - (this.t + (this.half === 2 ? 0 : hs))) / (hs * 2);
    const sc = this.score[ti] - this.score[1 - ti], P1 = k => clamp(k, 0, 1);
    if (pf.wing > 0.48) { const k = P1((pf.wing - 0.48) / 0.2); T.fbHigh = 0; T.width += 0.1 * k; T.manMark = Math.max(T.manMark, 0.7); T.press = clamp(T.press + (k > 0.5 ? 1 : 0), 1, 5); notes.push('shuts the wings'); }
    else if (pf.wing < 0.3) { const k = P1((0.3 - pf.wing) / 0.15); T.width -= 0.1 * k; T.trap = true; T.squeeze = 0.6; T.aggro *= 1 + 0.1 * k; notes.push('packs the middle'); }
    if (pf.long > 0.3) { const k = P1((pf.long - 0.3) / 0.2); T.line -= 7 * k; T.trap = false; T.backFwd += 5 * k; notes.push('drops deeper against long balls'); }
    else if (pf.long < 0.14) { const k = P1((0.14 - pf.long) / 0.1); T.line += 5 * k; T.press = clamp(T.press + 1, 1, 5); T.counterPress += 2 * k; T.pressZone = 1; notes.push('presses their short passing'); }
    if (pf.skills > 1.6) { const k = P1((pf.skills - 1.6) / 2); T.aggro *= 1 - 0.14 * k; T.manMark = Math.max(T.manMark, 0.6); T.restGap += 2 * k; notes.push('stays on its feet against dribblers'); }
    if (pf.longShot > 0.35) { T.press = clamp(T.press + 1, 1, 5); T.squeeze = Math.min(T.squeeze, 0.6); notes.push('closes down shooters'); }
    if (pf.line > 0.52) { const k = P1((pf.line - 0.52) / 0.12); T.vert += 0.6 * k; T.counter += 0.6 * k; T.range += 0.4 * k; T.runs = 3; T.runsFwd = true; notes.push('plays in behind their high line'); }
    else if (pf.line < 0.38) { const k = P1((0.38 - pf.line) / 0.1); T.shortW += 0.25 * k; T.eager += k; T.longShot += 0.5 * k; T.shoot *= 1 + 0.15 * k; T.fbHigh += 4 * k; notes.push('works the ball against their low block'); }
    if (pf.press > 2.1) { const k = P1((pf.press - 2.1) / 1.2); T.vert += 0.4 * k; T.range += 0.3 * k; T.shortW -= 0.15 * k; notes.push('plays out of their press'); }
    else if (pf.press < 1.0) { T.shortW += 0.25; T.eager += 1; notes.push('takes its time on the ball'); }
    if (left < 0.3 && sc < 0) { T.runs = 3; T.shoot *= 1.25; T.vert += 0.4; T.counterPress += 2; notes.push('goes all out'); }
    else if (left < 0.3 && sc > 0) { T.line -= 5; T.shortW += 0.4; T.press = clamp(T.press - 1, 1, 5); notes.push('protects the lead'); }
    T.press = clamp(Math.round(T.press), 1, 5); T.shortW = clamp(T.shortW, 0.7, 2); T.pressZone = clamp(T.pressZone, 0.3, 1); T.width = clamp(T.width, 0.8, 1.2); T.aggro = clamp(T.aggro, 0.7, 1.4); T.manMark = clamp(T.manMark, 0, 1);
    this.tac[ti] = T; L.count++;
    if (notes.length && L.count > 1) { const msg = this.teams[ti].name + ' ' + notes.slice(0, 2).join(' and '); L.log.push(Math.round(this.t) + 's: ' + notes.join(', ')); if (!this.headless && L.count % 2 === 0) this.say(msg.toUpperCase().slice(0, 56)); }
    else if (notes.length) L.log.push(Math.round(this.t) + 's: ' + notes.join(', '));
  };
  P.aiEdge = function (car, def) { return !!car && !!def && !this.ctlOf(car) && !!this.ctlOf(def) && (this.tac[car.team].level || 0) >= 0.28; };
  P.tackle = function (def, slide) {
    const b = this.ball, car = b.owner;
    def.cool.tackle = 0.6;
    if (!slide) def.tackleT = 0.4;                   // standing tackle animation
    if (slide) {
      def.cool.slide = 0.8;
      const sp = 8.5;
      def.vx = def.fx * sp; def.vy = def.fy * sp;
    }
    if (def.cool.fooled > 0 && car && car.team !== def.team) { def.cool.stun = Math.max(def.cool.stun, 0.3); return; }   // wrong-footed: he can't get a foot in
    if (!car || car.team === def.team) return;
    const dsx = def.card.sub, acc = clamp(0.5 * nrm(slide ? dsx.slidingTackle : dsx.standingTackle) + 0.22 * nrm(dsx.defAwareness) + 0.15 * nrm(dsx.interceptions) + 0.13 * clamp(def.iq, 0, 1), 0, 1);   // timing and aim of the challenge
    const reach = (slide ? 1.5 + 1.0 * nrm(def.card.sub.slidingTackle) + 0.6 * (def.pf['Slide Tackle'] || 0) : 1.05 + 0.6 * nrm(def.card.sub.standingTackle))   /* v184: about 25% shorter (JODIO) */ * (this.ctlOf(def) ? 1.15 : 1);   // v167: control advantage, the man you defend with reaches further
    if (dist(def, car) > reach) { if (!slide) def.cool.stun = 0.25; return; }
    this.stats.tackles[def.team]++;
    this.ev('tk', def, { car });
    // from behind: a tackle coming up the carrier's back can never win the ball (a slide from behind can still be a foul)
    const behindCar = (def.fx * car.fx + def.fy * car.fy) > 0.35 && ((car.x - def.x) * car.fx + (car.y - def.y) * car.fy) > 0;
    if (behindCar && !slide) { def.cool.stun = Math.max(def.cool.stun, 0.35); if (this.rng() < 0.3) this.say(def.name + ' CANNOT GET IN FROM BEHIND'); return; }
    if (this.rng() > 0.56 + 0.44 * acc - (this.aiEdge(car, def) ? 0.1 : 0)) { def.cool.stun = slide ? 0.55 : 0.35; if (this.rng() < 0.3) this.say(def.name + ' MISTIMES IT'); return; }   // mistimed: the better the defender, the rarer
    const ds = def.card.sub, cs = car.card.sub;
    let p = 0.55 + (nrm(slide ? ds.slidingTackle : ds.standingTackle) - nrm(((cs.dribbling || 60) + (cs.ballControl || 60)) / 2)) * 0.95 + (nrm(ds.strength) - nrm(cs.strength)) * 0.25 + (nrm(ds.defAwareness) - 0.5) * 0.12;
    
    p += 0.1 * (def.pf['Bruiser'] || 0);
    if (!slide) p += 0.05 * (def.pf['Jockey'] || 0);
    if (slide) p += 0.15 * (def.pf['Slide Tackle'] || 0);
    p -= 0.05 * (car.pf['Trickster'] || 0);
    if (this.tac[def.team].hot > 1) p += HOT_TKL * (this.tac[def.team].hot - 1);              // Top 5 Leagues defenders win the ball far more often
    if (this.aiEdge(car, def)) p -= 0.14;                                  // a League dribbler rides a human's challenge much more often
    p -= 0.08 * (car.pf['Press Proven'] || 0);
    p -= 0.04 * (car.pf['Technical'] || 0);
    p -= 0.07 * (car.pf['Enforcer'] || 0); p += 0.03 * (def.pf['Enforcer'] || 0);                // v148 Enforcer: a carrier shields the ball better, a defender wins the shoulder challenge more
    p *= 1 + 0.35 * (def.pf['Anticipate'] || 0); // Anticipate+: +35% tackle success
    p += (this.defQ(def) - 0.5) * 0.3;                                   // all-round defending: the better the defender, the more often he wins the ball
    p = clamp(p, 0.1, this.tac[def.team].hot > 1 ? 0.95 : 0.86);
    const fromBehind = slide && (def.fx * car.fx + def.fy * car.fy) > 0.5;
    let foulP = slide ? (fromBehind ? 0.8 : 0.3) : 0.2;
    foulP *= (0.55 + 0.8 * nrm(ds.aggression)) * this.tac[def.team].aggro;
    foulP *= 1 - 0.5 * (def.pf['Anticipate'] || 0);
    if (def.tr.has('hot')) foulP *= 1.5; if (def.tr.has('stp')) foulP *= 1.15; if (def.tr.has('clm')) foulP *= 0.6; if (car.tr.has('div')) foulP *= 1.5;
    const won = !behindCar && this.rng() < p;
    if ((!won || fromBehind) && this.rng() < foulP) { this.foul(def, car, fromBehind ? 'slide from behind' : slide ? 'reckless slide' : 'careless tackle'); return; }
    if (won) {
      this.stats.tkWon[def.team]++;
      this.ev('tkw', def, { car });
      if ((def.pf['Bruiser'] || 0)) car.cool.stun = 0.8;
      this.psIconAny(def, ['Bruiser', slide && 'Slide Tackle', 'Anticipate', !slide && 'Jockey', !slide && 'Enforcer'], 1.2);   // v166
      if (!slide && this.rng() < 0.55 + 0.45 * (def.pf['Anticipate'] || 0)) { this.giveBall(def); }
      else {
        const a = Math.atan2(def.fy, def.fx) + (this.rng() - 0.5);
        this.kick(def, Math.cos(a) * 7, Math.sin(a) * 7, 0, 0, null);
        b.noPick = car; b.noPickT = 0.4;
      }
      car.cool.stun = Math.max(car.cool.stun, 0.35);
      if (this.rng() < 0.3) this.say(def.name + ' WINS IT!');
    } else {
      def.cool.stun = slide ? 0.7 : 0.45;
      this.psIconAny(car, ['Trickster', 'Press Proven', 'Enforcer', 'Technical'], () => this.ball.owner === car && this.t - car.psOn.t0 < 1.5);
    }
  };

  /* ------------------------------- update -------------------------------- */
  P.update = function (dt) {
    if (this.over) return;
    this.tk++;
    this.runUpTick(dt);
    this.trWallTick();
    if (this.rec) { if (this.rec.mode === 'rec') this.recSample(); else { this.recApply(); this.tclApply(); } }
    if (this.plan) this.planStep();
    if (this.cfg.autoCoach && this.tk % 180 === 0 && this.phase === 'play' && !this.over) this.autoStep();      // v113: the coach changes the tactic during the match
    if (this.tickerT > 0) this.tickerT -= dt;
    this.effects.forEach(e => { e.t += dt; }); this.effects = this.effects.filter(e => e.t < e.life);

    if (!this.headless) this.stepNets(dt);
    if (this.phase === 'play' || (this.phase === 'goal' && this._gT != null && this.phaseT > this._gT - 0.8)) this.recordReplay();
    else if (this.phase === 'kickoff' || this.phase === 'restart') this._rpBuf = [];
    if (this.phase === 'replay') {
      this._rpT += dt * 0.75;
      if (!this._rp || this._rpT * 30 >= this._rp.length - 1) this.endReplay();
      return;
    }
    if (this.phase === 'goal') {
      this.phaseT -= dt;
      this.celebrate(dt);
      this.integratePlayers(dt, true);
      if (!this.ball.owner) this.integrateBall3D(dt);
      if (this.netHit) this.netHit.t += dt;
      if (this.phaseT <= 0) { if (this.training) this.trainReset(); else if (!this.startReplay()) this.setupKickoff(this.kickTeam); }
      return;
    }
    if (this.phase === 'halftime') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.half = 2; this.setupKickoff(1); }
      return;
    }
    if (this.phase === 'kickoff' || this.phase === 'restart') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      this.updateControl(); this.integratePlayers(dt, true); this.enforceSet(dt);
      this.stickBall(dt, true);
      return;
    }

    // clock
    this.t += dt;
    // advantage window resolution
    if (this.advantage) {
      const a = this.advantage; a.t -= dt;
      const ours = this.ball.owner ? this.ball.owner.team === a.team : (this.ball.last && this.ball.last.team === a.team);
      if (!ours) { this.advantage = null; this.event('Advantage gone - free kick back', 'foul'); this.freeKick(a.team, a.x, a.y, false); return; }
      if (a.t <= 0) { this.advantage = null; this.say('ADVANTAGE PLAYED'); }
    }
    // GK may hold the ball for max 6 seconds → indirect free kick
    const bo = this.ball.owner;
    if (bo && bo.isGK && bo.holdT > 6 && !this.training) { bo.holdT = 0; this.event('GK held the ball > 6s', 'foul'); this.freeKick(1 - bo.team, bo.x + this.teams[bo.team].dir * 6, bo.y, true); return; }
    // stoppage time: announced at 45/90, +1..+6 from fouls, cards, goals, VAR
    const regEnd = this.halfSeconds * this.half;
    if (this.t >= regEnd && this.added == null) { this.added = clamp(Math.round(this.stoppage + this.rng()), 1, 6); this.stoppage = 0; this.event('+' + this.added + ' minutes added', 'board'); }
    const endT = regEnd + (this.added || 0) * this.halfSeconds / 45;
    if (this.half === 1 && this.added != null && this.t >= endT) { this.added = null; this.t = this.halfSeconds; this.phase = 'halftime'; this.phaseT = this.headless ? 0 : 2; this.say('HALF TIME'); this.event('Half time ' + this.score.join('-'), 'whistle'); return; }
    if (this.half === 2 && this.added != null && this.t >= endT) { this.finish(); return; }

    const b = this.ball;
    const posTeam = b.owner ? b.owner.team : (b.last ? b.last.team : 0);
    this.stats.possession[posTeam] += dt;
    this.rsStep();
    if (this.learn) this.learnStep(dt);

    this.updateControl();
    for (let tm = 0; tm < 2; tm++) { const R = this.tac[tm].rotate; if (R && !this.training && this.t > this.nextRot[tm]) { this.rotateRoles(tm); this.nextRot[tm] = this.t + R * (0.7 + 0.6 * this.rng()); } }
    if (this.training) this.heroTop = Math.max(this.heroTop || 0, len(this.hero.vx, this.hero.vy));
    this.players.forEach(p => {
      for (const k in p.cool) if (p.cool[k] > 0) p.cool[k] -= dt;
      const c = this.ctlOf(p);
      if (c) this.humanThink(p, dt, c);
      else if (p.dummy) this.dummyThink(p, dt);
      else if (p.isGK) this.gkThink(p, dt);
      else this.aiThink(p, dt);
      if (p.skill) this.skillStep(p, dt);
      if (p.cool.fooled > 0 && p.foolDir) { p.tx = p.foolDir.x * p.jogMax * 0.9; p.ty = p.foolDir.y * p.jogMax * 0.9; p.sprinting = false; }   // wrong-footed: carried the wrong way
    });
    this.integratePlayers(dt, false);
    this.psTick();
    this.collidePlayers(dt);
    this.enforceSet(dt);
    this.updateBall(dt);
    this.aerialStep(dt);
    if (this.fkWall) this.wallCheck();
    if (this.netHit) this.netHit.t += dt;
    this.checkPickup();
    this.checkBounds();
  };

  /* ---------------------------- testing ground --------------------------- */
  // One player (you) on a big pitch with whatever you want to test against: still cones or pressing defenders, attackers to
  // defend against, a keeper, team-mates who play the ball back, and balls fed in from the side. No clock, no fouls, no offside.
  // cfg.training = { hero: card, mates: [cards], foes: [cards], foeMode: 'cone' | 'press' | 'attack', keeper: card | null }
  const TRAIN_FOES = [[0.55, 0.5], [0.5, 0.3], [0.5, 0.7], [0.62, 0.5]], TRAIN_MATES = [[0.5, 0.12], [0.5, 0.88], [0.72, 0.35]];
  P.trainSetup = function () {
    const T = this.training, rng = this.rng;
    this.players = [];
    const mk = (card, team, slot, dummy, fx, fy) => {
      const p = makePlayer(card, team, slot, rng, this.tac[team].roles); p.dummy = dummy; p.home = { x: PITCH_W * fx, y: PITCH_H * fy };
      this.players.push(p); return p;
    };
    this.hero = mk(T.hero, 0, 9, null, 0.3, 0.5);
    const full = T.foeMode === 'ai';
    if (full) {
      // full match AI: real formation, real defending and attacking. The opponents defend the right-hand goal and counter-attack; your AI team-mates play with you.
      const place = (c, team, slot) => {
        const p = makePlayer(c, team, slot, rng, this.tac[team].roles); this.players.push(p);
        const h = this.homeSpot(p, false); p.start = { x: h.x, y: h.y }; return p;
      };
      (T.mates || []).slice(0, 9).forEach((c, i) => place(c, 0, (T.mateSlots || [10, 8, 7, 6, 5, 2, 3, 1, 4])[i]));
      (T.foes || []).slice(0, 10).forEach((c, i) => place(c, 1, (T.foeSlots || [2, 3, 6, 1, 4, 5, 7, 8, 9, 10])[i]));
      if (T.keeper) place(T.keeper, 1, 0);
      if (T.mateKeeper) place(T.mateKeeper, 0, 0);
    } else {
    (T.mates || []).slice(0, 3).forEach((c, i) => mk(c, 0, [10, 8, 7][i], 'still', TRAIN_MATES[i][0], TRAIN_MATES[i][1]));
    const attack = T.foeMode === 'attack';
    (T.foes || []).slice(0, 4).forEach((c, i) => {
      const f = attack ? [[0.72, 0.5], [0.66, 0.3], [0.66, 0.7], [0.6, 0.5]][i] : TRAIN_FOES[i];
      mk(c, 1, attack ? 9 - Math.min(i, 2) : [2, 3, 1, 4][i], T.foeMode === 'cone' ? 'cone' : null, f[0], f[1]);
    });
    if (T.keeper) mk(T.keeper, 1, 0, null, 0.995, 0.5);
    }
    this.teams[0].short = 'YOU'; this.teams[1].short = 'CPU';
    this.stats = { shots: [0, 0], onTarget: [0, 0], passes: [0, 0], tackles: [0, 0], tkWon: [0, 0], possession: [0, 0], fouls: [0, 0], corners: [0, 0], cards: [] }; this.pstat = {}; this._lp = [null, null]; this._kp = [null, null];
    this.score = [0, 0]; this.heroTop = 0; this.lastKick = null;
    this.ctls[0] && (this.ctls[0].controlled = this.hero);
    this.trainReset();
  };
  /** Change the testing ground live: any of { hero, mates, foes, foeMode, keeper, pitch }. */
  P.trainConfig = function (c) {
    const T = this.training;
    ['hero', 'mates', 'foes', 'foeMode', 'keeper', 'mateSlots', 'foeSlots', 'mateKeeper', 'styles'].forEach(k => { if (c[k] !== undefined) T[k] = c[k]; });
    if (T.styles) this.tac = [0, 1].map(i => buildTactic(T.styles[i]));
    if (c.pitch && PITCH_SIZES[c.pitch]) { setPitch(PITCH_SIZES[c.pitch][0], PITCH_SIZES[c.pitch][1]); T.pitch = c.pitch; this.nets = null; }
    this.trainSetup();
  };
  /** Everyone back to their marks, ball at the hero's feet (or at the first attacker's in attack mode). */
  P.trainReset = function () {
    this.players.forEach(p => {
      const hm = p.start || p.home; p.x = hm.x; p.y = hm.y; p.vx = p.vy = p.tx = p.ty = 0; p.dive = null; p.skill = null; p.stamina = 100;
      for (const k in p.cool) p.cool[k] = 0;
      p.cool.decide = 0.3;
    });
    this.hero.fx = 1; this.hero.fy = 0;
    this.players.filter(p => p.team === 1).forEach(p => { p.fx = -1; p.fy = 0; });
    this.offsideList = []; this.advantage = null; this.goalFlash = 0; this.celebration = null; this.netHit = null;
    this.phase = 'play'; this.phaseT = 0;
    const carrier = this.training.foeMode === 'attack' ? this.players.find(p => p.team === 1 && !p.isGK) : null;
    if (this.training.foeMode === 'ai') { this.players.forEach(p => { p.plan = null; p.space = null; }); }
    Object.assign(this.ball, { x: this.hero.x, y: this.hero.y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, owner: null, shot: null, trail: [], inNet: null, last: null, indirect: null });
    if (carrier) { this.ball.x = carrier.x; this.ball.y = carrier.y; this.giveBall(carrier); carrier.cool.decide = 0.2; }
    else this.giveBall(this.hero);
    this.cam.x = this.ball.x; this.cam.y = this.ball.y;
  };
  /** Ball back to the hero's feet, wherever he is (attack mode restarts everything instead). */
  P.trainBall = function () {
    this.trWall = null; this._trSet = false; this.penaltyKick = false;
    if (this.training.foeMode === 'attack') { this.trainReset(); return; }
    const h = this.hero; h.x = clamp(h.x, 2, PITCH_W - 2); h.y = clamp(h.y, 2, PITCH_H - 2);
    Object.assign(this.ball, { x: h.x, y: h.y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, shot: null, trail: [], inNet: null, last: null, indirect: null });
    this.phase = 'play'; this.goalFlash = 0; this.celebration = null;
    this.giveBall(h); h.cool.decide = 0;
  };
  /** v182 (JODIO: "test free kicks and penalties in Testing Ground"): put the hero on a direct free kick (20-30 m, random angle) or the penalty spot. */
  P.trainSet = function (kind) {
    const h = this.hero, b = this.ball, dir = this.teams[h.team].dir, gx = dir > 0 ? PITCH_W : 0;
    const pen = kind === 'pen', d = pen ? 11 : 20 + this.rng() * 10, y = pen ? PH2 : PH2 + (this.rng() - 0.5) * 26;
    this.players.forEach(p => { if (p !== h && !p.isGK && Math.hypot(p.x - (gx - dir * d), p.y - y) < 9.5) { p.x -= dir * 10; } });
    h.x = gx - dir * (d + 1.6); h.y = y + (pen ? 0.9 : 1.4); h.vx = h.vy = 0; this.face(h, dir, 0);
    Object.assign(b, { x: gx - dir * d, y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, shot: null, trail: [], inNet: null, last: null, indirect: null, passTo: null });
    this.phase = 'play'; this.goalFlash = 0; this.celebration = null;
    this.giveBall(h); h.cool.decide = 0; this.armSet('FREE KICK', h.team, h); this.penaltyKick = pen; this._trSet = true;
    // v188: a four-man wall 9.15 m from the ball on the line to the middle of the goal (free kicks only); it jumps when the ball is struck
    if (!pen) { const L = Math.hypot(gx - b.x, PH2 - b.y) || 1, ux = (gx - b.x) / L, uy = (PH2 - b.y) / L; this.trWall = { x: b.x + ux * 9.15, y: b.y + uy * 9.15, ux, uy, n: 4, w: 0.62, jumpT: null, look: null }; }
    else this.trWall = null;
    if (this.sp) this.sp.r = pen ? 0 : this.sp.r;
    const gk = this.players.some(p => p.isGK && p.team !== h.team);
    this.say(pen ? (gk ? 'PENALTY - AIM WITH THE ARROWS, HOLD X TO SHOOT' : 'PENALTY - TURN ON "KEEPER IN GOAL" FOR A KEEPER') : 'FREE KICK ' + Math.round(d) + ' M - AIM, HOLD X TO SHOOT');
    this.cam.x = b.x; this.cam.y = b.y;
  };
  /** v183: the FC-style set-piece camera (behind the ball, facing goal) while a penalty or a direct free kick within 40 m waits to be taken. */
  P.spCamera = function () {
    const b = this.ball, o = b.owner; if (!o || this.phase === 'goal') return null;
    const s = this.sp, pen = !!this.penaltyKick, fk = s && s.kind === 'FREE KICK' && s.taker === o, cn = s && s.kind === 'CORNER' && s.taker === o;
    if (!pen && !fk && !cn && !o._runUp) return null;
    const dir = this.teams[o.team].dir, gx = dir > 0 ? PITCH_W : 0; if (fk && !pen && Math.abs(gx - b.x) > 40) return null;
    if (cn) return { bx: b.x, by: b.y, gx: gx - dir * 11, gy: PH2, pen: false, corner: true };
    if (o._runUp && !pen && !fk) return o._runUp.cam || null;
    return { bx: b.x, by: b.y, gx, gy: PH2, pen };
  };
  /** v184 (JODIO: "a run-up like FC27; I should see the players far from the ball"): at a penalty, direct free kick or corner the taker is drawn
   *  a few steps back and to the side of the ball; his kick waits while he runs in (drawing only, the simulation keeps him on the ball). */
  P.runOff = function (p) {
    const c = this.ball.owner === p && this.spCamera(); if (!c) return null;
    const L = Math.hypot(c.gx - c.bx, c.gy - c.by) || 1, dx = (c.gx - c.bx) / L, dy = (c.gy - c.by) / L, back = c.pen ? 2.8 : c.corner ? 3.0 : 3.4, side = c.pen ? 2.3 : 2.6;
    const f = p._runUp ? clamp(p._runUp.left / p._runUp.T, 0, 1) : 1;
    return { x: (-dx * back - dy * side) * f, y: (-dy * back + dx * side) * f };
  };
  /** v187 (JODIO): at your direct free kick or corner A / D move the aim, X strikes (a corner: the cross), Z switches knuckleball, C curls it in or out. */
  P.spMode = function (p, c) {
    const s = this.sp, b = this.ball;
    if (!c || !p || b.owner !== p || p._runUp || this.penaltyKick || !s || s.taker !== p) return null;
    const dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0;
    if (s.kind === 'CORNER') return { corner: true, dir, gx, cx: gx - dir * 10, cy: PH2 };
    if (s.kind === 'FREE KICK' && Math.abs(gx - b.x) < 40) return { corner: false, dir, gx, cx: gx, cy: PH2 };
    return null;
  };
  P.spTarget = function (m, c) { return m.corner ? { x: m.cx, y: m.cy + (c.spAim || 0) * 12 } : { x: m.gx, y: PH2 + (c.spAim || 0) * (GOAL_HALF - 0.55) }; };
  /** Holds a set-piece kick until the run-up is done. Returns true when the call was deferred. */
  P.deferKick = function (p, fn) {
    if (p._runUp) return !p._runUp.go;
    const c = this.ball.owner === p && this.spCamera(); if (!c) return false;
    const T = c.pen ? 0.75 : 0.65; p._runUp = { left: T, T, fn, go: false, cam: c }; return true;
  };
  /** v188 Testing Ground wall: blocks a ball that reaches the wall line below the men's jump, then clears away after the kick. */
  P.trWallTick = function () {
    const w = this.trWall, b = this.ball; if (!w) return;
    if (b.owner) { w.prev = null; return; }
    if (w.jumpT == null) w.jumpT = this.t;
    const side = (b.x - w.x) * w.ux + (b.y - w.y) * w.uy, lat = (b.x - w.x) * -w.uy + (b.y - w.y) * w.ux;
    if (w.prev != null && w.prev < 0 && side >= 0 && Math.abs(lat) < w.n * w.w / 2 + 0.15 && b.z < 1.95 + 0.45 * Math.min(1, Math.sin(Math.min(1, (this.t - w.jumpT) / 0.5) * Math.PI))) {
      const sp = Math.hypot(b.vx, b.vy); b.vx = -w.ux * sp * 0.25 + (this.rng() - 0.5) * 4; b.vy = -w.uy * sp * 0.25 + (this.rng() - 0.5) * 4; b.vz = 2 + this.rng() * 2; b.shot = null;
      this.say('BLOCKED BY THE WALL');
    }
    w.prev = side;
    if (this.t - w.jumpT > 3) { this.trWall = null; this._trSet = false; }
  };
  P.runUpTick = function (dt) {
    for (const p of this.players) { const r = p._runUp; if (!r) continue;
      if (this.ball.owner !== p) { p._runUp = null; continue; }
      p.vx = 0; p.vy = 0;
      r.left -= dt; if (r.left <= 0) { r.go = true; try { r.fn(); } finally { p._runUp = null; } } }
  };
  /** Feed a ball in towards the hero: 'cross' arrives at head height, 'ground' is a rolling pass to the feet. */
  P.trainFeed = function (kind) {
    const h = this.hero, b = this.ball, side = this.rng() < 0.5 ? -1 : 1;
    const sx = clamp(h.x + 12, 2, PITCH_W - 2), sy = clamp(h.y + (kind === 'cross' ? side * 15 : (this.rng() - 0.5) * 8), 2, PITCH_H - 2);
    const dx = h.x + h.vx * 0.6 - sx, dy = h.y + h.vy * 0.6 - sy;
    Object.assign(b, { x: sx, y: sy, z: kind === 'cross' ? 0.5 : 0, owner: null, shot: null, trail: [], spin: 0, last: null, noPick: null, noPickT: 0, passTo: null, inNet: null, trailType: null });
    if (kind === 'cross') { const T = 1.5; b.vx = dx / T; b.vy = dy / T; b.vz = (1.9 - 0.5 + 0.5 * 9.81 * T * T) / T; }
    else { const L = len(dx, dy) || 1; b.vx = dx / L * 10; b.vy = dy / L * 10; b.vz = 0; }
    this.phase = 'play'; this.say(kind === 'cross' ? 'CROSS IN - HEADER, CHEST OR VOLLEY' : 'GROUND BALL - FIRST TOUCH');
  };
  /** Still dummies: cones just stand; team-mates play the ball straight back to you after a moment. */
  P.dummyThink = function (p, dt) {
    const b = this.ball, h = this.hero;
    p.tx = p.ty = 0; p.sprinting = false;
    this.face(p, b.x - p.x, b.y - p.y);
    if (p.dummy === 'still' && b.owner === p) {
      p.trainT = (p.trainT || 0) + dt;
      if (p.trainT > 0.8) { p.trainT = 0; const d = dist(p, h); this.pass(p, h, false, { power: clamp(d / 40, 0.2, 1) }); }
    } else p.trainT = 0;
  };

  /* --------------------------- human control ----------------------------- */
  P.updateControl = function () {
    const b = this.ball;
    this.ctls.forEach(c => {
      if (!c) return;
      if (this.training && this.hero) { c.controlled = this.hero; return; }      // testing ground: you are always the one player
      if (c.manualSwitchT > 0) c.manualSwitchT -= 1 / 60;
      if (c.controlled && !this.players.includes(c.controlled)) c.controlled = null;     // sent off
      if (b.owner && b.owner.team === c.team && !(this.cfg.duel && b.owner.isGK)) { c.controlled = b.owner; return; }   // 1v1 duel: the keeper distributes by himself, you keep your player
      if (c.pendingReceiver && !b.owner) { c.controlled = c.pendingReceiver; return; }
      c.pendingReceiver = null;
      const near = this.nearestTo(c.team, b, true);
      // auto-switch: when the opponent has it and our man is far off the ball, or a loose ball is clearly closer to a teammate
      if (!c.controlled || c.controlled.isGK || (!(c.manualSwitchT > 0) && ((b.owner && dist(c.controlled, b) > 12) || (!b.owner && near && dist(near, b) + 6 < dist(c.controlled, b))))) c.controlled = near;
    });
  };

  P.nearestTo = function (team, pt, outfieldOnly, exclude) {
    let best = null, bd = 1e9;
    this.players.forEach(p => { if (p.team !== team || (outfieldOnly && p.isGK) || p === exclude) return; const d = dist(p, pt); if (d < bd) { bd = d; best = p; } });
    return best;
  };

  /** The scorer sprints to the corner flag at the end he scored in, his team-mates run to join him, then he celebrates there. */
  P.celebrate = function (dt) {
    this.players.forEach(p => { p.celRun = false; });
    const c = this.celebration; if (!c || this.headless || this.training) return;
    const p = c.p, team = this.goalTeam, dir = this.teams[team].dir;
    if (!c.flag) c.flag = { x: dir > 0 ? PITCH_W - 1.0 : 1.0, y: p.y < PH2 ? 1.0 : PITCH_H - 1.0 };
    const f = c.flag, d = len(f.x - p.x, f.y - p.y);
    if (c.run && d < 1.8) c.run = false;
    if (c.run) { const k = clamp(d / 5, 0.3, 1); p.celRun = true; p.sprinting = true; p.tx = (f.x - p.x) / d * p.sprintMax * 1.3 * k; p.ty = (f.y - p.y) / d * p.sprintMax * 1.3 * k; c.ct = 0; }
    else c.ct += dt;
    this.players.forEach(q => {
      if (q === p || q.team !== team || q.isGK) return;
      const dq = len(p.x - q.x, p.y - q.y);
      if (dq > 4 + (q.slot % 3) * 1.2) { q.celRun = true; q.sprinting = false; const m = q.jogMax * 1.15; q.tx = (p.x - q.x) / dq * m; q.ty = (p.y - q.y) / dq * m; }
    });
  };

  /** Goal replay: the last few seconds of play are kept as snapshots (30 per second) and shown again, slightly slowed, after the celebration. */
  P.recordReplay = function () {
    if (this.headless || this.training) return;
    this._rpN = (this._rpN || 0) + 1; if (this._rpN & 1) return;
    const ps = this.players.map(p => { const q = Object.assign({}, p); q.cool = Object.assign({}, p.cool); if (p.skill) q.skill = Object.assign({}, p.skill); return q; });
    const b = this.ball, bq = Object.assign({}, b); bq.trail = []; bq.owner = b.owner ? ps[this.players.indexOf(b.owner)] : null;
    const buf = this._rpBuf || (this._rpBuf = []); buf.push({ ps, b: bq }); if (buf.length > 135) buf.shift();
  };
  P.startReplay = function () {
    const buf = this._rpBuf; if (this.headless || this.training || !buf || buf.length < 40) return false;
    this._rp = buf.slice(); this._rpT = 0; this.phase = 'replay'; this.goalFlash = 0; return true;
  };
  P.endReplay = function () { this._rp = null; this._rpBuf = []; this.setupKickoff(this.kickTeam); };

  /** Mouse aim: the axis (-1..1) that turns the arrow toward the pointer. Picks the goal-line point whose screen direction from the player best matches the pointer. */
  P.mouseAxis = function (p, c, gain) {
    if (!c.mouseP || !this.proj) return 0;
    const dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, s0 = this.proj(p.x, p.y, 0);
    const mx = c.mouseP.x - s0.x, my = c.mouseP.y - s0.y;
    if (mx * mx + my * my < 4) return 0;
    const ma = Math.atan2(my, mx); let best = 0, bd = 9;
    for (let a = -1.3; a <= 1.301; a += 0.05) {
      const q = this.proj(gx, PH2 + a * (GOAL_HALF - 0.55), 0), d = Math.abs(Math.atan2(Math.sin(Math.atan2(q.y - s0.y, q.x - s0.x) - ma), Math.cos(Math.atan2(q.y - s0.y, q.x - s0.x) - ma)));
      if (d < bd) { bd = d; best = a; }
    }
    return clamp((best - c.aim) * dir * (gain || 1.6) * 2, -1, 1) * dir * dir;
  };
  /** Holding SHOOT: the player stops, walks slowly toward the aim point and A / D (or the mouse) swings the arrow; the bar sets the power. */
  P.aimStep = function (p, c, dt, dx) {
    const dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0;
    let ax = dx;
    if (this.rec && this.rec.mode === 'play') ax = this.rec.axAt(this.tk, c.team, ax);
    else if (c.mouseAim && !this.net) { ax = Math.round(this.mouseAxis(p, c, 1.6) * 1000) / 1000; if (this.rec && this.rec.mode === 'rec') this.rec.ax.push([this.tk, c.team, ax]); }
    c.aim = clamp(c.aim + ax * dir * 6 * dt, -1.3, 1.3);
    p.sprinting = false;
    const ty = PH2 + c.aim * (GOAL_HALF - 0.55), fx = gx - p.x, fy = ty - p.y, L = len(fx, fy) || 1;
    p.fx = fx / L; p.fy = fy / L;
    if (c.wd < 2.4) { p.tx = p.fx * 1.2; p.ty = p.fy * 1.2; c.wd += 1.2 * dt; } else { p.tx = 0; p.ty = 0; }
  };
  /** Semi / full assist, holding SHOOT: no arrow. The body is locked to the way he faced at the press, and A / D only pick front-left / front-right of that. */
  P.faceStep = function (p, c, dt, dx) {
    if (c.hfx == null) { c.hfx = p.fx; c.hfy = p.fy; }
    if (Math.abs(dx) > 0.3) { c.side = dx < 0 ? -1 : 1; c.sideT = 0.35; } else if (c.sideT > 0) { c.sideT -= dt; if (c.sideT <= 0) c.side = 0; }
    p.fx = c.hfx; p.fy = c.hfy;
    if (this.assist !== 'full') {
      p.sprinting = false;
      if (c.wd < 2.4) { p.tx = p.fx * 1.2; p.ty = p.fy * 1.2; c.wd += 1.2 * dt; } else { p.tx = 0; p.ty = 0; }
    }
  };
  /** Where a facing-based shot lands on the goal line (y): straight along (hfx, hfy), turned 24 degrees to his left (A) or right (D). */
  P.faceTarget = function (p, c, side) {
    const dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0;
    let fx = c.hfx != null ? c.hfx : p.fx, fy = c.hfy != null ? c.hfy : p.fy;
    const l = len(fx, fy) || 1; fx /= l; fy /= l;
    const th = side * 0.42, cs = Math.cos(th), sn = Math.sin(th);
    const rx = fx * cs - fy * sn, ry = fx * sn + fy * cs;
    const fw = Math.max(0.25, rx * dir);
    return clamp(p.y + ry / fw * Math.abs(gx - p.x), PH2 - 40, PH2 + 40);
  };
  /** Pointer position (client px) to the drawing space. */
  P.screenToPitch = function (cx, cy) {
    const cv = this._cv; if (!cv) return null;
    const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const fit = Math.min(r.width / cv.width, r.height / cv.height), ox = (r.width - cv.width * fit) / 2, oy = (r.height - cv.height * fit) / 2;
    return { x: (cx - r.left - ox) / fit * (VIEW_W / cv.width), y: (cy - r.top - oy) / fit * (VIEW_H / cv.height) };
  };
  /** Left mouse button = hold SHOOT (when on the ball); moving the pointer aims. */
  P.mouse = function (type, cx, cy, who) {
    const pt = this.screenToPitch(cx, cy); if (!pt) return;
    const idx = this.net ? this.net.me : (who == null ? this.ctls.findIndex(c => c && c.keys && c.keys !== 'none') : who);
    const c = this.ctls[idx < 0 ? 0 : idx]; if (!c) return;
    c.mouseP = pt;
    if (type === 'down') {
      if (!(c.controlled && this.ball.owner === c.controlled)) return;
      c.mouseAim = true;
      if (this.net) this.netIn('shoot', true); else this.action(c, 'shoot', true);
    } else if (type === 'up') {
      if (!c.mouseAim) return;
      if (this.net) this.netIn('shoot', false); else this.action(c, 'shoot', false);
      c.mouseAim = false;
    }
  };

  P.humanThink = function (p, dt, c) {
    const inp = c.input, pad = c.pad || c.touch, b = this.ball;
    if (p.autoUntil > this.t || (!b.owner && !b.shot && b.passTo && b.passTo.p === p && this.phase === 'play')) {   // after a pass / heavy touch the AI runs the player to the ball before you get him back (v166: for as long as the pass is still his)
      if (b.owner || p.cool.stun > 0 || p.cool.slide > 0) p.autoUntil = 0;
      else { this.aiThink(p, dt); c.queued = null; return; }
    }
    let dx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), dy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    if (pad && (pad.x || pad.y)) { dx = pad.x; dy = pad.y; }
    const spm = this.spMode(p, c);
    if (spm) {                                                                     // v187: A / D slide the aim along the goal (free kick) or the box (corner), seen from behind the ball
      const fx0 = spm.cx - b.x, L0 = len(fx0, spm.cy - b.y) || 1;
      c.spAim = clamp((c.spAim || 0) + dx * Math.sign(fx0 / L0 || spm.dir) * 1.4 * dt, -1.3, 1.3);
      const T = this.spTarget(spm, c), fx = T.x - p.x, fy = T.y - p.y, LL = len(fx, fy) || 1; p.fx = fx / LL; p.fy = fy / LL; c.aim = c.spAim;
      dx = 0; dy = 0;
    }
    const L = len(dx, dy);
    p.sprinting = (inp.sprint || (pad && pad.sprint)) && L > 0;
    const max = p.sprinting ? p.sprintMax : p.jogMax;
    if (p.cool.plant > 0) { p.sprinting = false; p.tx = 0; p.ty = 0; }
    else if (L > 0 && p.cool.rush > 0) { p.sprinting = true; p.tx = dx / Math.max(1, L) * p.sprintMax; p.ty = dy / Math.max(1, L) * p.sprintMax; }
    else if (L > 0) { p.tx = dx / Math.max(1, L) * max; p.ty = dy / Math.max(1, L) * max; } else { p.tx = 0; p.ty = 0; }
    if (b.owner === p && (this.penaltyKick || (this.sp && this.sp.taker === p) || p._runUp)) { p.tx = 0; p.ty = 0; p.sprinting = false; p.vx = 0; p.vy = 0; }   // v188: the taker of a penalty, free kick or corner stays put (A / D only aim)

    // power bars fill while the button is held on the ball (shots fill a little slower than passes)
    if (c.hold) {
      if (b.owner !== p) c.hold = null;
      else {
        let T = c.hold === 'shoot' ? 0.9 : 0.8;
        if (c.hold === 'shoot' && this.assist !== 'manual') T = 0.62 - 0.2 * nrm(p.card.sub.finishing || 55) * (this.assist === 'full' ? 1 : 0.8);   // assisted: a bar that fills fast, faster for good finishers
        c.charge = Math.min(1, c.charge + dt / T);
        if (spm) { /* v187: the aim is set with A / D before the strike */ }
        else if (c.hold === 'shoot' && this.assist === 'manual') this.aimStep(p, c, dt, dx);   // manual keeps the arrow; semi and full have none: the shot goes where he faces (A / D bend it)
        else if (c.hold === 'shoot') this.faceStep(p, c, dt, dx);
      }
    }
    // timed finishing: the wind-up runs to contact; a second shoot press before contact is the timing input
    if (c.strike) {
      const k = c.strike; k.t += dt;
      if (b.owner !== p || p.cool.stun > 0) c.strike = null;
      else {
        p.cool.plant = Math.max(p.cool.plant, 0.1); p.sprinting = false; p.tx = 0; p.ty = 0;
        if (k.t >= k.T) {
          c.strike = null; c.grace = 0.18;
          const AS = ASSIST[this.assist], dd = k.press == null ? null : k.T - k.press;
          const timing = dd == null ? { kind: 'none' } : dd <= AS.win ? { kind: 'green' } : { kind: 'early', d: dd };
          this.shoot(p, k.aim, k.pw, k.bar, { type: k.type, timing, ty: k.ty });
        }
        return;
      }
    }
    if (c.grace > 0) c.grace -= dt;
    // one-shot actions are queued by the keyboard / pad handlers
    const act = c.queued; c.queued = null;
    if (!act || p.cool.slide > 0) return;
    const hasBall = b.owner === p, power = c.power;
    if (SKILL_KEYS[act]) { if (hasBall) this.skill(p, act, L > 0 ? dx / L : p.fx, L > 0 ? dy / L : p.fy); return; }
    if (hasBall) {
      if (act === 'pass' || act === 'through' || act === 'lob') {
        const t = this.pickTarget(p, L > 0 ? dx / L : p.fx, L > 0 ? dy / L : p.fy, act === 'through', power, act === 'lob');
        if (t) this.pass(p, t, act === 'through', { power, lob: act === 'lob' });
      } else if (act === 'shoot') {
        const fb = this.assist !== 'manual';
        const side = fb ? (Math.abs(dx) > 0.3 ? (dx < 0 ? -1 : 1) : c.sideT > 0 ? c.side : 0) : 0;
        const fty = fb ? this.faceTarget(p, c, side) : null;
        const aim = fb ? 0 : c.aimSet != null ? c.aimSet : dy < -0.3 ? -1 : dy > 0.3 ? 1 : 0; c.aimSet = null; c.hfx = null; c.hfy = null; c.side = 0; c.sideT = 0;   // the arrow's aim (A / D or mouse); without one, ↑ far post, ↓ near post
        // shot type: hold SHOOT, tap LOB for a chip, THRU for a finesse curler, both for a low driven shot; a full bar is a power shot
        const m = c.mod || {}; c.mod = null;
        const type = m.lob && m.through ? 'low' : m.lob ? 'chip' : m.through ? 'finesse' : (power > 0.93 && !(p.pf['Finesse Shot'] || 0) ? 'power' : null);
        const pw = clamp(power, 0.2, 1);
        if (this.assist === 'full') this.shoot(p, aim, pw, power, { type, ty: fty });
        else {
          const tt = type === 'power' ? 0.3 : type === 'chip' || type === 'finesse' ? 0.24 : type === 'low' ? 0.18 : 0.2;
          c.strike = { aim, pw, bar: power, type, ty: fty, t: 0, T: this.t - (b.gotT == null ? -9 : b.gotT) < 0.35 ? tt * 0.6 : tt, press: null };   // a first-time strike has no wind-up
          p.cool.plant = 0.3; p.vx *= 0.3; p.vy *= 0.3;
        }
      }
    } else {
      if (act === 'pass') { if (p.cool.tackle <= 0) this.tackle(p, false); }
      else if (act === 'shoot') {
        if (!this.loosePress(p, c, dx, dy) && p.cool.slide <= 0 && p.cool.tackle <= 0) this.tackle(p, true);
      }
      else if (act === 'through') { c.controlled = this.nearestTo(p.team, b, true, p); c.manualSwitchT = 1.5; }
    }
  };

  /**
   * Best teammate in a direction (dot product × closeness). With a power bar fill, the pass goes to the teammate
   * whose distance best matches it (a short tap finds the nearest man, a full bar the far one).
   */
  P.pickTarget = function (p, dx, dy, through, power, lob) {
    // the pass goes to a team-mate in the direction the player faces (held direction, else his body): a short tap finds the nearest man in
    // that cone and a fuller bar reaches past him to the next ones, so power picks the distance
    let best = null, bs = -1e9;
    const want = power == null ? null : lob ? 14 + 80 * power : 6 + 42 * power;
    const cands = [];
    this.players.forEach(o => {
      if (o.team !== p.team || o === p || o.isGK) return;
      const vx = o.x - p.x, vy = o.y - p.y, d = len(vx, vy);
      if (d < 2.5 || d > (lob ? 110 : 52)) return;
      const dot = (vx * dx + vy * dy) / d;
      if (dot < -0.17) return;                                       // facing forward he can pass ahead or straight to either side, never behind him
      cands.push({ o, d, dot });
    });
    const cone = cands.filter(c => c.dot > 0.64);                  // within about 50 degrees of where he faces
    const pool = cone.length ? cone : cands.filter(c => c.dot > 0.1);
    pool.forEach(c => {
      let s = c.dot * 3 - c.d * 0.03 - (lob ? 0 : this.laneBlocked(p, c.o) * 0.8);
      if (want != null) s -= Math.abs(c.d - want) * 0.3;                // the bar is the range: tap = nearest man in front, full = the furthest
      if (through) s += (c.o.x - p.x) * this.teams[p.team].dir * 0.05;
      if (s > bs) { bs = s; best = c.o; }
    });
    return best || (cands.sort((a, c) => a.d - c.d)[0] || {}).o || null;
  };

  /* ------------------------------ outfield AI ---------------------------- */
  /** How good a player is at defending, 0..1, from his own defending stats (Tackle, Awareness, Interceptions, Sliding, Strength, Aggression). Cached per card. */
  P.defQ = function (p) {
    if (p._dq == null) {
      const s = p.card.sub;
      p._dq = clamp(0.32 * nrm(s.standingTackle) + 0.26 * nrm(s.defAwareness) + 0.14 * nrm(s.interceptions) + 0.1 * nrm(s.slidingTackle) + 0.1 * nrm(s.strength) + 0.08 * nrm(s.aggression)
        + 0.06 * (p.pf['Anticipate'] || 0) + 0.04 * (p.pf['Bruiser'] || 0) + 0.04 * (p.pf['Jockey'] || 0) + (p.tr.has('stp') ? 0.04 : 0), 0, 1);
    }
    return p._dq;
  };

  /** Game management from score and clock: -1 protect a lead late, +1 chase a deficit late, 0 normal. */
  P.gameMode = function (team) {
    const m = parseInt(this.minute(), 10) || 0, d = this.score[team] - this.score[1 - team];
    if (d > 0 && m >= 75) return -1;
    if (d < 0 && m >= 70) return 1;
    return 0;
  };
  P.aiThink = function (p, dt) {
    const b = this.ball, dir = this.teams[p.team].dir, iq = clamp(p.iq, 0, 1);
    p.sprinting = false;
    if (p.cool.stun > 0 || p.cool.slide > 0 || p.cool.plant > 0) { p.tx = 0; p.ty = 0; return; }
    if (p.tr.has('iso')) { let nm = 1e9; this.players.forEach(o => { if (o.team === p.team && o !== p) nm = Math.min(nm, dist(o, p)); }); p.isoT = nm > 22 ? p.isoT + dt : Math.max(0, p.isoT - dt * 2); }

    if (this.rcvChase(p)) return;          // v166: the man a pass is played to goes for it before anything else (orders, drawn plays, set-piece runs)
    { const spx = this.sp && this.sp.plan ? this.sp : (this.spAfter && this.t < this.spAfter.until ? this.spAfter : null);          // v95: set-piece assignments (corner / free kick)
      if (spx && p !== spx.taker && !p.isGK && b.owner !== p) { const Rp = spx.plan.get(p); if (Rp && this.setPlayMove(p, Rp, spx, spx === this.spAfter)) return; } }
    if (p._go && p._go.until > this.t && !b.owner) { this.seek(p, p._go.x, p._go.y, true); return; }       // v105: the closest man runs to where the high ball will come down
    // knocked the ball ahead: sprint onto it
    if (p.cool.rush > 0 && !b.owner && b.last === p) { this.seek(p, b.x + b.vx * 0.25, b.y + b.vy * 0.25, true); return; }
    // --- ball carrier ---
    if (b.owner === p) { this.carrierThink(p, dt); return; }
    if (p.order && this.phase === 'play' && this.orderMove(p)) return;                    // v117: his standing order
    if (this.plan && this.plan.team === p.team && this.planHold(p)) return;       // v114: a player in the drawn play walks to his point and waits for the ball

    // a ball in flight: the receiver runs onto its path (a through ball too, he goes to meet it where he can first reach it),
    // and if our pass is going to be cut out the team-mate best placed stops what he was doing and goes for the ball
    // the man a pass was played to never gives up on it: he chases it however far it runs, until somebody has the ball
    if (this.rcvChase(p)) return;
    if (!b.owner && !b.shot && len(b.vx, b.vy) > 3 && !p.isGK && p.cool.fooled <= 0) {
      if (b.last && b.last.team === p.team) {
        const race = this.passRace(), mine = race[p.team], theirs = race[1 - p.team];
        if (mine && mine.p === p && theirs && theirs.t < mine.t + 0.15) { this.shout(p, 'MINE!', '#ffe14a'); this.seek(p, mine.q.x, mine.q.y, true); return; }   // we'll lose it: contest it
      }
    }
    const weHave = b.owner && b.owner.team === p.team;
    const theyHave = b.owner && b.owner.team !== p.team;
    // communication: a team-mate close to the carrier warns him when a man is on him (one voice at a time)
    if (weHave && b.owner !== p && !b.owner.isGK && dist(p, b.owner) < 14 && this.t - (b.owner._manOn || -9) > 2.5) {
      let n = 1e9; this.players.forEach(o => { if (o.team !== p.team) n = Math.min(n, dist(o, b.owner)); });
      if (n < 3) { b.owner._manOn = this.t; this.shout(p, 'MAN ON!', '#ffb070'); b.owner.warnT = this.t; }
    }
    const chaser = this.chaserFor(p.team);
    const TC = this.tac[p.team], F = FORMATIONS[TC.formation], own = dir > 0 ? 0 : PITCH_W;
    // pressing: after a turnover the whole team presses everywhere (counter-press); otherwise only in the styles' own press zone, below it they drop and contain
    const cpress = this.t - this.lostAt[p.team] < TC.counterPress + 2.5 * this.eliteT[p.team];   // v219: elite sides counter-press longer
    const zoneOK = cpress || Math.abs(b.x - own) / PITCH_W <= TC.pressZone;
    if (cpress && chaser === p && theyHave && this.t - this.lostAt[p.team] < 0.6) this.shout(p, 'PRESS!', '#ffb070');
    const kclaim = this.t - this.gkClaim[p.team] < 0.7;                                            // the keeper shouted: leave it to him

    // beaten one-on-one: the carrier is past him heading for goal, so he calls for cover, a team-mate steps up and he picks up another man
    if (theyHave && chaser === p && !p.isGK && TC.defSmart && p.cool.stun <= 0) {
      const car = b.owner, dC = dist(p, car), sCar = len(car.vx, car.vy);
      if (dC < 7 && sCar > 2 && Math.abs(car.x - own) < Math.abs(p.x - own) - 1.5 && (own - car.x) * car.vx > 0) {
        this._beat = { team: p.team, p, t: this.t }; this._chT = -1; this['_mk' + p.team] = null;
        this.shout(p, 'BEATEN!', '#ff8080');
        const nc = this.chaserFor(p.team); if (nc && nc !== p) this.shout(nc, 'I GOT HIM!', '#9fd0ff');
        this.seek(p, car.x + (own - car.x) * 0.3, car.y, true); return;
      }
    }
    if (!weHave && chaser === p && theyHave && !zoneOK) {
      const car = b.owner, ux = own - car.x, uy = PH2 - car.y, ul = len(ux, uy) || 1;
      this.seek(p, car.x + ux / ul * 6.5, car.y + uy / ul * 6.5, dist(p, car) > 12);               // contain: stay goal-side, never lunge
      return;
    }
    if (theyHave && p !== chaser && zoneOK && !p.isGK) {
      const nP = Math.min(5, TC.press + (cpress ? 1 : 0));
      const rank = nP >= 2 ? this.pressRank(p.team, chaser).indexOf(p) : -1;
      if (rank >= 0 && rank < (cpress ? nP - 1 : Math.min(nP - 1, 1)) && !p.tr.has('lzy')) {   // one helper at most outside the counter-press: the rest stay on their men (no bunching round the ball)                                                              // swarm: cut the carrier's angles at about 4.5 m
        const car = b.owner, ux = own - car.x, uy = PH2 - car.y, ul = len(ux, uy) || 1, ang = [0.9, -0.9, 1.9, -1.9][rank] || 0;
        const cx = ux / ul, cy = uy / ul, rx = cx * Math.cos(ang) - cy * Math.sin(ang), ry = cx * Math.sin(ang) + cy * Math.cos(ang);
        this.seek(p, car.x + rx * 4.5, car.y + ry * 4.5, true);
        if (p.cool.tackle <= 0 && p.cool.decide <= 0) {
          p.cool.decide = 0.2 + this.rng() * 0.1;
          if (dist(p, car) < 1.4 + 0.8 * nrm(p.card.sub.standingTackle) && this.rng() < 0.45 * TC.aggro * (0.35 + 0.9 * this.defQ(p)) * (p.tr.has('stp') ? 1.25 : 1)) this.tackle(p, false);
        }
        return;
      }
    }

    if (!weHave && chaser === p && !(kclaim && !theyHave)) {
      if (!theyHave) {                                   // loose ball: smart players read where it is going
        if (dist(p, b) < 6 && len(b.vx, b.vy) < 8) this.shout(p, 'MINE!', '#ffe14a');
        const lead = clamp(dist(p, b) / 12, 0.1, 0.6) * (0.45 + 0.55 * iq);
        this.seek(p, b.x + b.vx * lead, b.y + b.vy * lead, true);
        return;
      }
      // close the carrier down. Smart defenders come in on the goal side and wait for the touch; weak ones charge at the ball
      const car = b.owner, gx = dir > 0 ? 0 : PITCH_W, dC = dist(p, car);
      let tx = car.x + car.vx * 0.3, ty = car.y + car.vy * 0.3;
      const dq = this.defQ(p);
      if (dC > 3.2) { const ux = gx - car.x, uy = PH2 - car.y, ul = len(ux, uy) || 1; tx += ux / ul * 1.3 * dq; ty += uy / ul * 1.3 * dq; }
      else { tx += (car.x - p.x) / (dC || 1) * 1.2; ty += (car.y - p.y) / (dC || 1) * 1.2; }   // engage: step through the ball
      { const cs2 = len(car.vx, car.vy);                                                  // stronger than the carrier: come alongside and lean on him instead of running into his chest
        if (dC < 5 && cs2 > 2 && this.bullyPower(p) > this.bullyPower(car) + 0.08) {
          const nx = -car.vy / cs2, ny = car.vx / cs2, sg = ((p.x - car.x) * nx + (p.y - car.y) * ny) >= 0 ? 1 : -1;
          tx = car.x + car.vx * 0.25 + nx * sg * 0.85; ty = car.y + car.vy * 0.25 + ny * sg * 0.85;
        } }
      // jockey: a defender (not a pressing side) backs off goal-side of the carrier at his pace and waits for a heavy touch instead of diving in
      let jock = TC.defSmart && p.slot >= 1 && p.slot <= F.nDef && !cpress && dC < 9 && dC > 1.7 && !this.ctlOf(p) && Math.abs(car.x - own) > 14;
      if (jock && (p.fpos || RUT.State.BASE_FORMATION[p.slot]) === 'CB') {                                 // centre-backs jockey for 2 seconds at most, then go for the tackle
        if (p.jockCar !== car || this.t - (p.jockLast || -9) > 0.6) { p.jockCar = car; p.jockT0 = this.t; }
        p.jockLast = this.t;
        if (this.t - p.jockT0 > 2) jock = false;
      }
      if (jock) {
        const ux = own - car.x, uy = PH2 - car.y, ul = len(ux, uy) || 1;
        this.seek(p, car.x + car.vx * 0.2 + ux / ul * 2.6, car.y + car.vy * 0.2 + uy / ul * 2.6, dC > 6);
      } else this.seek(p, tx, ty, true);
      if (p.cool.tackle <= 0 && p.cool.decide <= 0) {
        p.cool.decide = 0.13 - 0.06 * dq + this.rng() * 0.06;
        const reach = 1.05 + 0.6 * nrm(p.card.sub.standingTackle), dB = dist(p, b), loose = dist(b, car) > 1.25;
        if (dB < reach && this.rng() < (0.5 + 0.45 * dq + (dB < reach * 0.7 ? 0.15 : 0)) * (p.tr.has('stp') ? 1.2 : 1) * (jock && !loose ? 0.5 : 1)) this.tackle(p, false);
        else if (dC > 1.2 && dC < 3.2 && !(jock && !loose)) {
          // slide: smart players only from the front or side with the ball exposed; weak players dive in from anywhere
          const behind = (p.fx * car.fx + p.fy * car.fy) > 0.5 && ((car.x - p.x) * car.fx + (car.y - p.y) * car.fy) > 0;
          const want = dq > 0.5 ? !behind && this.rng() < 0.09 * dq : this.rng() < 0.05 * (1.2 - dq);
          if (want) { this.face(p, b.x - p.x, b.y - p.y); this.tackle(p, true); }
        }
      }
      return;
    }
    if (theyHave && this.secondFor(p.team) === p) {
      if (dist(p, b) < 14) this.shout(p, 'COVER!', '#9fd0ff');
      const gx = dir > 0 ? 0 : PITCH_W, hc = this.ctls[p.team];
      if (hc && hc.pressHeld) { this.seek(p, b.x + b.vx * 0.3, b.y + b.vy * 0.3, true); return; }   // human calls a team-mate to press
      if (this.smartT[p.team] > 2 && b.owner && dist(p, b) < 10 && ((b.x - (dir > 0 ? 0 : PITCH_W)) * dir) > PITCH_W * 0.5) {   // v192 FC27 Legendary pressing triggers: a fresh first touch, a carrier facing his own goal or a back pass brings the second man in to trap him
        const od = this.teams[b.owner.team].dir, facingBack = b.owner.fx * od < -0.2, fresh = this.t - (b.gotT || -9) < 0.7;
        if (facingBack && fresh) { this.seek(p, b.x + b.vx * 0.35, b.y + b.vy * 0.35, true); return; } }
      // smart: cut the pass to their most dangerous runner; weak: just back off towards goal
      // cover: sit goal-side of the presser (about 7 m off the carrier) so there is a second line, but never double up on the ball
      const danger = iq > 0.35 ? this.players.filter(o => o.team !== p.team && !o.isGK && o !== b.owner).sort((a, c) => Math.abs(a.x - gx) - Math.abs(c.x - gx))[0] : null;
      const ux = gx - b.x, uy = PH2 - b.y, ul = len(ux, uy) || 1;
      let cx = b.x + ux / ul * 7, cy = b.y + uy / ul * 7;
      if (danger) { cx += (danger.x - cx) * 0.3 * iq; cy += (danger.y - cy) * 0.3 * iq; }
      this.seek(p, cx, cy, dist(p, { x: cx, y: cy }) > 8);
      return;
    }

    // recovery run: caught upfield when the ball is lost, sprint back goal-side of the ball through the middle (do not watch it)
    if (theyHave && !p.isGK && p.slot >= 1 && p.slot < F.fwdFrom && p !== chaser && this.t - this.lostAt[p.team] < 6 && (p.x - own) * dir > (b.x - own) * dir + 4) {
      this.seek(p, clamp(b.x - dir * 7, 2, PITCH_W - 2), b.y + (PH2 - b.y) * 0.45, true);
      return;
    }
    // rush zone: any other attacker inside the area in front of goal is rushed by the one defender sent at him
    if (!weHave && !p.isGK && TC.defSmart && p.slot >= 1 && p.slot < F.fwdFrom && p !== chaser && !(kclaim && !theyHave)) {
      const rt = this.rushMap(p.team).m.get(p);
      if (rt && rt !== b.owner) {
        if (b.passTo && b.passTo.p === rt && !b.owner) { this.seek(p, rt.x + (b.x - rt.x) * 0.4, rt.y + (b.y - rt.y) * 0.4, true); return; }   // a pass is coming: get in front of him
        const ux = own - rt.x, uy = PH2 - rt.y, ul = len(ux, uy) || 1;
        this.seek(p, rt.x + ux / ul * 1.6, rt.y + uy / ul * 1.6, true);
        return;
      }
    }
    // League B3 and up: each defender / holding midfielder sticks to one man, stays goal-side and cuts out the pass to him
    if (!weHave && !p.isGK && TC.defSmart && p.slot < F.fwdFrom && !(kclaim && !theyHave)) {
      const mk = this.marks(p.team).get(p);
      // centre-backs step out: a carrier advancing on their patch is closed down while a team-mate covers behind
      if (b.owner && p.card.position === 'CB' && p.slot <= F.nDef) {
        const car = b.owner, dC2 = dist(p, car), depth = (p.x - own) * dir;
        if (dC2 < 26 && (car.x - own) * dir > depth - 1 && (car.x - own) * dir < PITCH_W * 0.75 && this.players.some(o => o.team === p.team && o !== p && !o.isGK && o.slot >= 1 && o.slot <= F.nDef && (o.x - own) * dir < depth - 1.5 && dist(o, p) < 24) && Math.abs(car.y - p.y) < 22) {
          const ux = own - car.x, uy = PH2 - car.y, ul = len(ux, uy) || 1;
          this.seek(p, car.x + ux / ul * 3.2, car.y + uy / ul * 3.2, true);
          return;
        }
      }
      // the holding midfielder drops into the gap when a centre-back steps out to press
      if (b.owner && p.slot > F.nDef && (p.card.position === 'CDM' || p.tr.has('anc'))) {
        const cbs = this.players.filter(o => o.team === p.team && !o.isGK && o.slot >= 1 && o.slot <= F.nDef && o.card.position === 'CB');
        if (cbs.length >= 2) {
          cbs.sort((a, c) => (a.x - own) * dir - (c.x - own) * dir);
          const dp = cbs[0], sh = cbs[cbs.length - 1];
          if ((sh.x - dp.x) * dir > 6 && dist(sh, b.owner) < 22) { this.seek(p, dp.x + dir * 1, dp.y + (sh.y >= dp.y ? 8 : -8), true); return; }
        }
      }
      if (mk) {
        const ux = own - mk.x, uy = PH2 - mk.y, ul = len(ux, uy) || 1, dBM = dist(b, mk), tight = clamp(1 - dBM / 45, 0, 1);
        if (b.passTo && b.passTo.p === mk && !b.owner) {                                                    // a pass is on its way to my man: step into the lane and take it
          const dB = dist(p, b);
          if (dB < 3 && b.z < 2) this.seek(p, b.x + b.vx * 0.15, b.y + b.vy * 0.15, true);
          else this.seek(p, mk.x + (b.x - mk.x) * 0.5, mk.y + (b.y - mk.y) * 0.5, true);
          return;
        }
        const off = 3.8 - 1.8 * tight - (p.slot <= F.nDef ? DEF_UP * (1 - tight) : 0);                      // v91: defenders mark from higher up, level with a far-off attacker instead of two or three metres behind him
        const mx = mk.x + ux / ul * off + (b.x - mk.x) * 0.1, my = mk.y + uy / ul * off + (b.y - mk.y) * 0.1;
        this.seek(p, mx, my, dist(p, { x: mx, y: my }) > 3);
        return;
      }
    }
    // --- shape --- weaker players re-read the game less often, so they react late
    if (p.cool.think > 0 && p.plan) { this.seek(p, p.plan.x, p.plan.y, p.plan.sprint); return; }
    p.cool.think = (0.08 + 0.55 * (1 - (weHave ? iq : 0.4 * iq + 0.6 * this.defQ(p))) * (0.6 + 0.8 * this.rng())) * this.brainR * this.thinkK[p.team] * (p.slot > F.nDef && p.slot < F.fwdFrom ? 0.6 : 1) + (p.slot % 5) * 0.06;   // reactions are staggered: nobody re-reads the game on the same frame
    const h = this.homeSpot(p, false);
    const roleFac = p.slot <= F.nDef ? 1 : p.slot < F.fwdFrom ? 0.7 : 0.4, isDef = p.slot >= 1 && p.slot <= F.nDef, isFwd = p.slot >= F.fwdFrom;
    const farK = dist(p, b) > 28 && !weHave ? 0.8 : 1;                                                // far from the ball: stay at the post, do not drift after it
    let tx = h.x + (b.x - PW2) * (isDef && !weHave && (b.x - PW2) * dir < 0 ? 0.55 - DEF_HOLD : 0.55) * farK + (weHave ? 7 : -3) * dir + dir * (TC.line + (isDef && !weHave ? DEF_LINE : 0)) * roleFac;
    let ty = h.y + (b.y - PH2) * 0.28;
    if (!weHave && !isDef && TC.backFwd) tx -= dir * TC.backFwd * (isFwd ? 1 : 0.5);              // low block: the attackers drop back to defend as well when the ball is lost
    // the team moves with the ball: when it is in the opponent's half, midfield and attack push up and slide ball-side
    { const k = clamp(((b.x - PW2) * dir) / PW2, 0, 1);
      if (k > 0) {
        if (!isDef) { tx += dir * k * (isFwd ? 12 : 20) + (weHave ? 0 : dir * k * 5); ty += (b.y - PH2) * 0.22 * k; }
        else tx += dir * k * DEF_FOLLOW;                                                                  // v91: defenders push up with the team too
        if (weHave && !isDef && !isFwd && !p.tr.has('anc') && !p.tr.has('hld')) tx += dir * k * 11;
        // wingers and strikers link up: they stay within passing range of the ball-carrying midfield instead of stranding themselves up front
        if (weHave && isFwd && b.owner && !b.owner.isGK && b.owner.team === p.team && !p.tr.has('lzy')) {
          const dB = dist(p, b.owner);
          const dl = 20 - 8 * TC.link;
          if (dB > dl) { const pull = Math.min(0.35 + 0.15 * TC.link, (dB - dl) / 60); tx += (b.owner.x - tx) * pull * 0.6; ty += (b.owner.y - ty) * pull * 0.5; }
        }      // midfield joins the attack: close enough to play one-twos with the forwards
        else if (weHave) tx += dir * k * 8;
      }
    }
    if (!weHave && TC.trap && p.slot < F.fwdFrom) {                                                  // zona mista: the whole line steps up as one
      const lineX = clamp(b.x - dir * 18, 0, PITCH_W), hl = own + dir * (FORMATIONS[TC.formation].pts[1][0] * PITCH_W / 105);
      tx = lineX + (h.x - hl) * TC.squeeze;
    }
    if (weHave) {                                                                                    // style roles in possession
      if (TC.fbSlots.includes(p.slot)) { tx += dir * TC.fbHigh; ty += (PH2 - ty) * TC.fbIn; }
      if (TC.pivot && p.slot === F.nDef + 1 && (b.x - own) * dir < PW2) { tx = own + dir * 21 * PITCH_W / 105; ty = PH2 + (ty - PH2) * 0.3; }
      const cf = isFwd && Math.abs(h.y - PH2) < 0.1 * PITCH_H, wing = isFwd && Math.abs(h.y - PH2) > 0.22 * PITCH_H;
      if (TC.drop9 && cf && (b.x - own) * dir > 20) { tx -= dir * TC.drop9; ty = PH2 + (ty - PH2) * 0.4; }
      if (TC.inside && wing && (b.x - own) * dir > 45) { ty = PH2 + (ty - PH2) * (1 - TC.inside); tx += dir * 6; }
      if (TC.lanes && p.slot > F.nDef) {                                                             // five lanes, at most two players per lane
        const lanes = this.laneMap(p.team); if (lanes.has(p)) ty = ty * 0.45 + lanes.get(p) * 0.55;
      }
    }
    // traits: where each kind of player stands
    { const tr = p.tr, gA = dir > 0 ? PITCH_W : 0, tx0 = tx, ty0 = ty;
      if (!weHave && tr.has('lzy') && !isDef) tx += dir * 9;                                          // stays up for the counter
      if ((!weHave && tr.has('iso') && p.isoT > 5) && !isDef) tx += dir * 6;                          // drifts out of the game
      if (!weHave && tr.has('wrk') && !isDef) tx -= dir * 5;                                          // tracks back
      if (tr.has('anc')) { tx -= dir * 4; ty = PH2 + (ty - PH2) * 0.55; }                             // anchor: deep and central
      if (tr.has('wid')) ty = PH2 + (ty - PH2) * 1.3;
      if (weHave && isFwd && tr.has('drp') && !TC.drop9 && (b.x - own) * dir > 20) { tx -= dir * 12; ty = PH2 + (ty - PH2) * 0.4; }
      // role play: where each role stands
      const adv = (b.x - own) * dir, side = h.y >= PH2 ? 1 : -1;
      if (tr.has('hld') && weHave) tx -= dir * 5;                                                     // holds his position in possession
      if (tr.has('lib')) tx -= dir * (weHave ? 5 : 7);                                                // sweeper: deep behind the line
      if (tr.has('hyb') && weHave && adv > PITCH_W * 0.3) { tx += dir * 14; ty = PH2 + (ty - PH2) * 0.7; }   // defender-midfielder steps into midfield
      if (tr.has('wb')) tx += dir * (weHave ? 6 : 3);                                                 // wing-back: high and wide
      if (tr.has('ifb') && weHave && adv > PITCH_W * 0.3) { tx += dir * 9; ty = PH2 + (ty - PH2) * 0.3; }   // inverted full-back tucks inside
      if (tr.has('hsp') && !isDef) ty = ty * 0.6 + (PH2 + side * 14) * 0.4;                           // half-space
      if (tr.has('tck') && !weHave && !isDef) { ty = PH2 + (ty - PH2) * 0.5; tx -= dir * 6; }         // tucks in to help the midfield
      if (tr.has('prs') && !weHave && isFwd && adv > PITCH_W * 0.4) tx += (b.x - tx) * 0.3;                                // leads the press
      if (tr.has('chn') && !isDef) ty = ty * 0.5 + (PH2 + side * 16) * 0.5;                           // the channel between full-back and centre-back
      if (tr.has('free') && !isDef) { tx = b.x + dir * (weHave ? 8 : -4); ty = b.y + (p.y >= b.y ? 1 : -1) * 12; }   // free role: wherever the ball is
      if (tr.has('sub')) tx += dir * ((parseInt(this.minute(), 10) >= 70) ? 4 : -4);                                  // impact sub: patient, then up the pitch
      if (TRX !== 1 && (tx !== tx0 || ty !== ty0)) { tx = tx0 + (tx - tx0) * TRX; ty = ty0 + (ty - ty0) * TRX; }      // v128: 2x trait/role positioning
    }
    if (tx !== tx) tx = h.x;
    { const gm = this.gameMode(p.team);                                                               // late in the game: protect a lead (drop) or chase a deficit (push up)
      if (gm < 0) tx -= dir * (isDef ? 3 : isFwd ? 4 : 5); else if (gm > 0) tx += dir * (isDef ? 6 : isFwd ? 3 : 5); }
    // depth cap: nobody drifts too far up the pitch (out of possession the line stays near halfway, in possession the back line holds)
    { const cap = weHave ? (isDef ? 0.6 + DEF_PUSH * 0.4 : isFwd ? 1.2 : 0.85) : (isDef ? 0.42 + DEF_PUSH : isFwd ? 0.78 : 0.56 + DEF_PUSH * 0.5), dep = (tx - own) * dir;
      if (dep > cap * PITCH_W) tx = own + dir * cap * PITCH_W; }
    // spacing: team-mates spread out instead of sticking together, pushed apart from anyone within 9 m of where he wants to stand
    { let px = 0, py = 0;
      for (const o of this.players) {
        if (o === p || o.team !== p.team || o.isGK) continue;
        const dx = tx - o.x, dy = ty - o.y, d = len(dx, dy);
        const SP = 13 * (this.tac[p.team].hot > 1 ? HOT_SPREAD : 1) * (1 + 3 * (p.tf || 0));
        if (d < SP) { const k = (SP - d) * 0.55 / (d || 1); px += (d ? dx : (p.slot > o.slot ? 1 : -1)) * k; py += (d ? dy : 0.3) * k; }
      }
      const pl = len(px, py); if (pl > 0) { const f = Math.min(this.tac[p.team].hot > 1 ? 11 : 7, pl) / pl; tx += px * f; ty += py * f; }
      if (!p.isGK && p.slot > 0) ty = PH2 + (ty - PH2) * 1.1; }        // and a little wider across the pitch
    // team shape for every AI side: out of possession the back line holds one line, and the midfield stays within reach of it (compact, no gaps to play through)
    if (!weHave && !p.isGK && F.nDef > 0) {
      const ln = this.backLine(p.team);
      if (ln != null) {
        if (isDef && p.tf) tx += (ln - tx) * Math.min(0.8, 4 * p.tf);                                  // trained defenders hold the line together
        if (!isDef && !isFwd) { const maxD = 0.42 * PITCH_W, dx = (tx - ln) * dir; if (dx > maxD) tx -= dir * (dx - maxD) * (0.4 + 0.3 * iq); }
      }
    }
    // v219 elite block: shift to the ball side, close the gaps, and the back line drops off a carrier with time to pick a pass
    { const EL = this.eliteT[p.team];
      if (EL && !weHave && !p.isGK) {
        if (!isFwd) ty += (b.y - ty) * 0.16 * EL;
        if (theyHave && isDef && b.owner && !b.owner.isGK) { const car = b.owner, fwdFace = car.fx * this.teams[car.team].dir > 0.3, free = this.pressure(car) > 5, nearUs = Math.abs(car.x - own) < PITCH_W * 0.62;
          if (fwdFace && free && nearUs) tx -= dir * 4.5 * EL; }
        if (!isDef && !isFwd) { const ln = this.backLine(p.team); if (ln != null) { const maxD = (0.42 - 0.1 * EL) * PITCH_W, dx = (tx - ln) * dir; if (dx > maxD) tx -= dir * (dx - maxD) * 0.6; } }
      } }
    if (weHave) {
      // runs in behind: a chosen runner times a diagonal run along the offside line into the gap between their centre-backs
      const run = this.runFor(p);
      if (run) {
        p.cool.think = 0.12;
        const ln = this.offsideLine(p.team), allow = ln != null ? ln + dir * (3.2 * (1 - iq) - 0.5 * iq) : run.x;
        const rx = (run.x - allow) * dir > 0 ? allow : run.x;
        p.plan = { x: rx, y: run.y, sprint: true };
        this.seek(p, rx, run.y, true);
        return;
      }
      if (isFwd && (b.x - PW2) * dir > -10) tx += dir * 6 + Math.sin(this.t * 0.7 + p.slot) * 3;
      else if (isFwd && b.owner && b.owner.team === p.team && !b.owner.isGK && !p.tr.has('lzy')) tx -= dir * 7;                  // ball still deep: drop a step to link up with the midfield
      const sp = this.comms(p.team).spots.get(p);                                                     // support triangle around the carrier
      if (sp) { const w = 0.35 + 0.25 * iq + Math.min(0.3, 2.5 * (p.tf || 0)); tx += (sp.x - tx) * w; ty += (sp.y - ty) * w; }
      else if (!isDef && b.owner && !b.owner.isGK) { const q = this.findSpace(p, tx, ty, b.owner); tx = q.x; ty = q.y; }   // everyone else looks for a pocket of space
      if (!isDef && !isFwd && b.owner && b.owner !== p) { const nz = 1 - Math.min(0.8, 4 * (p.tf || 0)); tx += Math.sin(this.t * 0.9 + p.slot * 1.7) * 4 * dir * nz; ty += Math.cos(this.t * 0.7 + p.slot * 2.3) * 5 * nz; }   // midfielders keep moving: they drift into new pockets, never stand still
      // final third: midfielders, wide men and forwards all arrive around the box for the cut-back, the rebound and the cross
      { const k = ((b.x - own) * dir) / PITCH_W;
        if (k > 0.68 && !isDef && b.owner && b.owner.team === p.team && b.owner !== p && !b.owner.isGK) {
          const gA = dir > 0 ? PITCH_W : 0, sn = p.slot % 5, w = (isFwd ? 0.65 : 0.5) * (p.tr.has('lzy') ? 0.6 : 1);
          tx += (gA - dir * (11 + (sn % 3) * 4) - tx) * w; ty += (PH2 + (sn - 2) * 5.5 - ty) * w * (p.tr.has('wid') ? 0.4 : 1);
        } }
      // v192 FC27-style runs for Top 5 sides: the full-back overlaps a wide carrier, the nearest midfielder underlaps into the half-space, the striker bends his run across the centre-back
      if (this.smartT[p.team] > 2 && b.owner && b.owner.team === p.team && b.owner !== p && !b.owner.isGK && ((b.owner.x - own) * dir) > PITCH_W * 0.42) {
        const car = b.owner, side = Math.sign(car.y - PH2) || 1, wideC = Math.abs(car.y - PH2) > PITCH_H * 0.2;
        const mates = this.players.filter(o => o.team === p.team && o !== car && !o.isGK && Math.sign(o.y - PH2) === side);
        const fb = wideC ? mates.filter(o => o.slot <= F.nDef).sort((a, c) => dist(a, car) - dist(c, car))[0] : null;
        const um = mates.filter(o => o.slot > F.nDef && o.slot < F.fwdFrom).sort((a, c) => dist(a, car) - dist(c, car))[0];
        const k3 = ((car.x - own) * dir) / PITCH_W;
        if (p === fb && k3 < 0.75 && ((p.x - car.x) * dir) < 2) { tx += (car.x + dir * 8 - tx) * 0.6; ty += (clamp(car.y + side * 5, 2, PITCH_H - 2) - ty) * 0.6; }
        else if (p === um && wideC && k3 < 0.68) { tx += (car.x + dir * 6 - tx) * 0.45; ty += (PH2 + side * PITCH_H * 0.12 - ty) * 0.45; }
      }
      // v201 Top 5 / UCL structure: the passer runs on for the return, the midfield and attack push up, the nearest midfielder comes short to offer the one-two
      if (this.smartT[p.team] >= 4.5 && !p.isGK && b.owner && b.owner.team === p.team && b.owner !== p && !b.owner.isGK) {
        const car = b.owner, k4 = ((car.x - own) * dir) / PITCH_W;
        if (p._g2 && p._g2.until > this.t) { tx += (p._g2.x - tx) * 0.75; ty += (p._g2.y - ty) * 0.75; }
        else {
          if (k4 > 0.3 && p.slot > F.nDef) tx += dir * (p.slot < F.fwdFrom ? 6 : 3);
          if (p.slot > F.nDef && p.slot < F.fwdFrom && dist(p, car) < 22 && dist(p, car) > 9) {
            const sup = this.players.filter(o => o.team === p.team && o !== car && !o.isGK && o.slot > F.nDef && o.slot < F.fwdFrom).sort((a, c) => dist(a, car) - dist(c, car))[0];
            if (sup === p) { const side = Math.sign(p.y - car.y) || 1, w = 0.5; tx += (car.x - dir * 2 - tx) * w; ty += (clamp(car.y + side * 8, 3, PITCH_H - 3) - ty) * w; }
          }
        }
      }
      // smart forwards hold the offside line until the pass; weak ones drift offside
      const line = this.offsideLine(p.team);
      if (line != null && (line - b.x) * dir > 0) {
        const allow = line + dir * (3.5 * (1 - iq) - 0.6 * iq);
        if ((tx - allow) * dir > 0) tx = allow;
      }
    } else if (p.slot < F.fwdFrom) {
      // defending: smart players pick up a runner and stay goal-side of him; weak ones watch the ball
      const mark = this.marks(p.team).get(p);
      if (mark) {
        const gx = dir > 0 ? 0 : PITCH_W, w = Math.max(clamp(0.15 + 0.7 * iq * (0.6 + 0.4 * nrm(p.card.sub.defAwareness)), 0, 0.85), 0.9 * TC.manMark);
        tx += (mark.x + (gx - mark.x) * 0.12 - tx) * w; ty += (mark.y + (PH2 - mark.y) * 0.12 - ty) * w;
      }
      const bw = 0.32 * (1 - iq);
      tx += (b.x - tx) * bw; ty += (b.y - ty) * bw;
    }
    // traits that act on the final position (after support triangles and the offside line): overlaps, box arrivals, inverted drifts
    if (weHave) {
      const tr = p.tr, gA = dir > 0 ? PITCH_W : 0;
      { const car = b.owner, pos = p.card.position, fbk = pos === 'LB' || pos === 'RB' || pos === 'LWB' || pos === 'RWB', kA = car ? ((car.x - own) * dir) / PITCH_W : 0;
        if (car && car.team === p.team && car !== p && !car.isGK && !this.ctlOf(p)) {
          const cpos = car.card.position, cWing = cpos === 'LW' || cpos === 'RW' || cpos === 'LM' || cpos === 'RM', out = p.y >= PH2 ? 1 : -1;
          if (fbk && cWing && kA > 0.45 && Math.abs(car.y - p.y) < 24 && (car.x - p.x) * dir > 5) {                       // fullback behind his winger: overlap outside or underlap inside, varied
            const key = Math.floor(this.t / 5);
            if (p._ovT !== key) { p._ovT = key; p._ovM = this.rng() < 0.55 ? 1 : -1; }
            if (p._ovM > 0) { tx = car.x + dir * 9; ty = clamp(car.y + out * 7, 3, PITCH_H - 3); } else { tx = car.x + dir * 6; ty = car.y - out * 9; }
          } else if (!isDef && !isFwd && kA > 0.7 && Math.abs(gA - car.x) < 14 && Math.abs(car.y - PH2) > 13) {              // byline cutback: midfielders arrive at the penalty spot and the edge of the box
            tx = gA - dir * (12 + (p.slot % 3) * 4); ty = PH2 + ((p.slot % 2) ? 5 : -5);
          } else if (isFwd && kA > 0.62 && Math.abs(car.y - PH2) > 14 && Math.abs(h.y - PH2) > 0.2 * PITCH_H && (car.y - PH2) * (h.y - PH2) < 0) {   // ball on the other flank: the far winger attacks the back post
            tx = gA - dir * 7; ty = PH2 + (h.y >= PH2 ? 1 : -1) * 6;
          }
        } }
      if (tr.has('ovl')) tx += dir * 10;                                                              // overlaps
      if (tr.has('inv') && (b.x - own) * dir > PITCH_W * 0.45) ty = PH2 + (ty - PH2) * 0.75;           // drifts in off the touchline
      if (tr.has('late') && !isFwd && !isDef && (b.x - own) * dir > PITCH_W * 0.55) { tx = gA - dir * 16; ty = PH2 + clamp(ty - PH2, -12, 12) * 0.6; }   // arrives at the edge of the box
      if (tr.has('box') && isFwd && (b.x - PW2) * dir > 5) { tx = gA - dir * 10; ty = PH2 + (ty - PH2) * 0.35; }   // lives in the box
      const ln2 = this.offsideLine(p.team);                                                           // ...but never past the offside line
      if (ln2 != null && (ln2 - b.x) * dir > 0 && !isDef) { const allow = ln2 + dir * (3.5 * (1 - iq) - 0.6 * iq); if ((tx - allow) * dir > 0) tx = allow; }
    }
    // defenders hold a line
    if (isDef) { const gap = weHave ? (p.tr.has('ovl') || p.tr.has('wb') || p.tr.has('hyb') ? Math.max(2, TC.restGap - 10) : p.tr.has('hld') ? TC.restGap + 4 : TC.restGap) : 4; tx = dir > 0 ? Math.min(tx, b.x - gap) : Math.max(tx, b.x + gap); }
    if ((tx - own) * dir < 7) tx = own + dir * 7;                                                    // never inside the keeper's six-yard box
    tx = clamp(tx, 2, PITCH_W - 2); ty = clamp(ty, 2, PITCH_H - 2);
    p.plan = { x: tx, y: ty, sprint: len(tx - p.x, ty - p.y) > (!weHave && p.tr.has('rec') ? 5 : 9) };
    this.seek(p, tx, ty, p.plan.sprint);
  };

  /**
   * Off-the-ball runs. While `team` has the ball in the middle or attacking third and the carrier has a moment on it, up to two onside
   * runners (forwards and attacking mids, best brain and pace first) get a target in the channel between their defenders, beyond the line.
   * Smart runners hold the line until the pass is played (see aiThink); weak ones mistime and drift offside.
   */
  P.runFor = function (p) {
    const team = p.team, key = '_rn' + team, b = this.ball;
    if (!this[key] || this.t - this[key].t > 0.35 || this.t < this[key].t) {
      const dir = this.teams[team].dir, gx = dir > 0 ? PITCH_W : 0, car = b.owner;
      const out = { t: this.t, m: new Map() };
      const TR = this.tac[team], FR = FORMATIONS[TR.formation], quick = TR.counter && this.t - this.wonAt[team] < 4;
      if (car && car.team === team && !car.isGK && (((car.x - 40) * dir > -8) || quick) && (car.x - gx) * dir < -14) {
        let near = 1e9; this.players.forEach(o => { if (o.team !== team) near = Math.min(near, dist(o, car)); });
        if (near > 2.6 || Math.abs(car.y - PH2) > 18) {
          const defs = this.players.filter(o => o.team !== team && !o.isGK);
          const cands = this.players.filter(o => o.team === team && !o.isGK && o !== car && o.slot > FR.nDef && (!TR.runsFwd || o.slot >= FR.fwdFrom || o.tr.has('run')) && o.stamina > 30 && !(o.run && this.t < o.run.until - 1.2))
            .map(o => ({ o, sc: o.iq * 0.8 + nrm(o.card.sub.sprintSpeed) * 0.6 + nrm(o.card.sub.positioning || 60) * 0.5 + (o.slot >= FR.fwdFrom ? 0.5 : 0) + (o.tr.has('run') ? 0.8 : 0) + (o.tr.has('late') ? 0.5 : 0) + (o.slot < FR.fwdFrom ? 0.7 : 0) - (o.tr.has('drp') || o.tr.has('lzy') ? 0.3 : 0) + ((o.card.position === 'ST' || o.card.position === 'CF') ? 1.6 : 0) + this.rng() * 0.4 }))
            .sort((a, c) => c.sc - a.sc).slice(0, TR.runs + 1);
          const line = this.offsideLine(team);
          cands.forEach(({ o }) => {
            if (line != null && (o.x - line) * dir > 2.5) return;                 // already offside: hold
            let by = o.y, bd = -1;
            [o.y - 14, o.y - 7, o.y, o.y + 7, o.y + 14, PH2 - 10, PH2 + 10].forEach(y => {
              y = clamp(y, 6, PITCH_H - 6); let md = 1e9; defs.forEach(d => { md = Math.min(md, Math.abs(d.y - y) * 1.0 + Math.max(0, (d.x - (line != null ? line : o.x)) * dir) * 0.3); });
              if (md > bd) { bd = md; by = y; }
            });
            const depth = 7 + 8 * nrm(o.card.sub.sprintSpeed);
            out.m.set(o, { x: (line != null ? line : o.x) + dir * depth, y: by, until: this.t + 2.4 });
          });
        }
      }
      this[key] = out;
    }
    const r = this[key].m.get(p);
    if (r) p.run = r;
    return r && r.until > this.t ? r : null;
  };

  /** Where the ball will be over the next three seconds (0.1 s steps): the same drag, gravity, bounce and turf friction as the real thing. */
  P.ballPath = function () {
    if (this._bp && this._bp.t === this.t) return this._bp.pts;
    const b = this.ball, pts = [], h = 0.1;
    let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
    for (let i = 1; i <= 30; i++) {
      if (z > 0 || vz > 0) {
        const v = Math.sqrt(vx * vx + vy * vy + vz * vz), k = 0.0125 * v;
        vx -= k * vx * h; vy -= k * vy * h; vz -= (9.81 + k * vz) * h; z += vz * h;
        if (z <= 0) { z = 0; if (vz < -0.9) { vz = -vz * 0.7; vx *= 0.93; vy *= 0.93; } else vz = 0; }
      } else { const sp = len(vx, vy), ns = Math.max(0, sp * (1 - 0.6 * h) - 0.8 * h); if (sp > 1e-6) { vx *= ns / sp; vy *= ns / sp; } }
      x += vx * h; y += vy * h; pts.push({ t: i * h, x, y, z });
      if (x < -2 || x > PITCH_W + 2 || y < -2 || y > PITCH_H + 2) break;
    }
    this._bp = { t: this.t, pts }; return pts;
  };
  /** The first point on the ball's path this player can get to in time (sprinting, after a short reaction), or null. */
  /** v166 (JODIO): the man a pass was played to runs for it and never stops until he has it or somebody else does.
   *  He meets the ball at the first point of its path he can reach; if he cannot reach it in time he chases it to where it will stop. */
  P.rcvChase = function (p) {
    const b = this.ball;
    if (b.owner || b.shot || !b.passTo || b.passTo.p !== p || p.isGK || p.cool.fooled > 0 || this.phase !== 'play') return false;
    const sp = len(b.vx, b.vy), dB = dist(p, b);
    if (sp <= 3) { this.seek(p, b.x + b.vx * 0.2, b.y + b.vy * 0.2, true); return true; }
    const q = this.reachPoint(p);
    if (dB < 10 && dB > 3) this.shout(p, 'MINE!', '#ffe14a');
    if (dB < 6 && b.z < 2) this.seek(p, b.x + b.vx * 0.15, b.y + b.vy * 0.15, true);
    else if (q) this.seek(p, q.x, q.y, true);
    else { const path = this.ballPath(), end = path[path.length - 1] || b; this.seek(p, end.x, end.y, true); }
    return true;
  };
  P.reachPoint = function (p) {
    const vmax = Math.max(4, p.sprintMax * 0.92);
    for (const q of this.ballPath()) { if (q.z > 2.1) continue; if (Math.max(0, dist(p, q) - 0.9) / vmax + 0.12 <= q.t) return q; }
    return null;
  };
  /** Per team, who gets to the ball in flight first (and when): {p, t, q} or null. Cached for the tick. */
  P.passRace = function () {
    if (this._pr2 && this._pr2.t === this.t) return this._pr2.r;
    const r = [null, null];
    this.players.forEach(o => {
      if (o.cool.stun > 0) return;
      const q = this.reachPoint(o);
      if (q && (!r[o.team] || q.t < r[o.team].t)) r[o.team] = { p: o, t: q.t, q };
    });
    this._pr2 = { t: this.t, r }; return r;
  };
  /** Defenders and midfielders nearest the ball, closest first, without the main chaser: who swarms in a press. */
  P.pressRank = function (team, chaser) {
    const key = '_pr' + team;
    if (this[key] && this[key].t === this.t && this[key].c === chaser) return this[key].list;
    const b = this.ball;
    const list = this.players.filter(o => o.team === team && !o.isGK && o !== chaser && o.cool.stun <= 0 && !o.tr.has('lzy')).sort((a, c) => (dist(a, b) - (a.tr.has('wrk') ? 4 : 0) - (a.tr.has('prs') ? 6 : 0) - (a.slot > 0 && a.slot < FORMATIONS[this.tac[a.team].formation].fwdFrom && a.slot > FORMATIONS[this.tac[a.team].formation].nDef ? 4 : 0)) - (dist(c, b) - (c.tr.has('wrk') ? 4 : 0) - (c.tr.has('prs') ? 6 : 0) - (c.slot > 0 && c.slot < FORMATIONS[this.tac[c.team].formation].fwdFrom && c.slot > FORMATIONS[this.tac[c.team].formation].nDef ? 4 : 0)));
    this[key] = { t: this.t, c: chaser, list }; return list;
  };
  /** Positional play: the outfield spread over five vertical lanes, so no lane holds more than two players. */
  P.laneMap = function (team) {
    const key = '_ln' + team;
    if (this[key] && this.t - this[key].t < 0.5 && this.t >= this[key].t) return this[key].m;
    const F = FORMATIONS[this.tac[team].formation], m = new Map();
    const ps = this.players.filter(o => o.team === team && !o.isGK && o.slot > F.nDef).sort((a, c) => a.y - c.y);
    ps.forEach((o, i) => m.set(o, PITCH_H * (0.1 + 0.2 * Math.min(4, Math.floor(i * 5 / ps.length)))));
    this[key] = { t: this.t, m }; return m;
  };
  P.tacLS = function (p) { return this.tac[p.team].longShot; };
  /** Total football: now and then two outfield team-mates swap roles. */
  P.rotateRoles = function (team) {
    const ps = this.players.filter(o => o.team === team && !o.isGK && o.slot > 0 && !this.ctlOf(o) && o.cool.stun <= 0 && this.ball.owner !== o);
    if (ps.length < 2) return;
    const a = ps[Math.floor(this.rng() * ps.length)], b2 = ps[Math.floor(this.rng() * ps.length)];
    if (a === b2) return;
    const t = a.slot; a.slot = b2.slot; b2.slot = t; a.plan = b2.plan = null; a.run = b2.run = null;
  };

  /** x of the offside line that `team`'s attackers face: the second-last opponent, never inside their own half. */
  P.offsideLine = function (team) {
    const key = '_ol' + team;
    if (this[key] && this[key].t === this.t) return this[key].x;
    const dir = this.teams[team].dir, gx = dir > 0 ? PITCH_W : 0;
    const ds = this.players.filter(p => p.team !== team).map(p => Math.abs(gx - p.x)).sort((a, c) => a - c);
    const x = ds.length > 1 ? gx - dir * Math.min(ds[1], PW2) : null;
    this[key] = { t: this.t, x }; return x;
  };
  /** Big-game players (clu) are at their best late on or when the team is not winning. */
  P.bigMoment = function (p) { return p.tr.has('clu') && (this.minute() >= 75 || (this.half === 2 && this.score[p.team] <= this.score[1 - p.team])); };
  /** Inconsistent players (inc) swing between an off spell and a hot one every 30-60 s. */
  P.moodTick = function (p, dt) {
    if (p.tr.has('sub')) {                                                                           // impact sub: 6% slower before 70', 6% quicker after
      const late = (parseInt(this.minute(), 10) >= 70);
      if (late !== p._sl) { p._sl = late; if (!p._sm0) p._sm0 = [p.sprintMax, p.jogMax]; const f = late ? 1.06 : 0.95; p.sprintMax = p._sm0[0] * f; p.jogMax = p._sm0[1] * f; }
    }
    if (!p.tr.has('inc')) return; p.moodT -= dt; if (p.moodT <= 0) { p.moodT = 30 + this.rng() * 30; p.mood = this.rng() < 0.5 ? 0.8 : 1.18; } };

  /* ------------------------------ team talk ------------------------------ */
  /**
   * Team-mates talk: the open man CALLS for the ball (the carrier favours a call and reads it more reliably), a team-mate warns the carrier
   * about a man closing from his blind side (MAN ON!, he plays quicker), the keeper CLAIMS crosses and loose balls (defenders peel off),
   * the nearest man announces the press / cover, and markers hand an attacker over (SWITCH!). Support runs make triangles around the carrier.
   */
  const SHOUT_GAP = { 'MINE!': 6, 'COVER!': 6, 'HERE!': 4 };
  P.shout = function (p, text, color) {
    const k = this.shoutK[p.team];
    if (this.t - this.shoutT[p.team] < 0.8 || this.t - p.sayT < 2.5 || this.t - (k[text] || -9) < (SHOUT_GAP[text] || 2.5)) return;
    this.shoutT[p.team] = this.t; p.sayT = this.t; k[text] = this.t;
    this.fx({ type: 'text', x: p.x, y: p.y - 2.4, text, color: color || '#bfe9ff', life: 0.75 });
  };
  P.claim = function (p, text) { if (p.isGK) this.gkClaim[p.team] = this.t; this.shout(p, text, '#ffe14a'); };
  /** Average x of the team's centre-backs and full-backs (the back line), refreshed a few times a second. */
  P.backLine = function (team) {
    const c = this._bl || (this._bl = [null, null]);
    if (c[team] && this.t - c[team].t < 0.25 && this.t >= c[team].t) return c[team].x;
    let sx = 0, n = 0;
    this.players.forEach(o => { if (o.team === team && !o.isGK && o.slot >= 1 && o.slot <= FORMATIONS[this.tac[team].formation].nDef) { sx += o.x; n++; } });
    c[team] = { t: this.t, x: n ? sx / n : null };
    return c[team].x;
  };
  P.comms = function (team) {
    const c = this.cm[team];
    if (c && this.t - c.t < 0.2 && this.t >= c.t) return c;
    const b = this.ball, car = b.owner, dir = this.teams[team].dir, out = { t: this.t, spots: new Map() };
    this.cm[team] = out;
    if (!car || car.team !== team || car.isGK) return out;
    const mates = this.players.filter(o => o.team === team && o !== car && !o.isGK && o.cool.stun <= 0);
    const opps = this.players.filter(o => o.team !== team);
    let nearOpp = 1e9, near = null;
    opps.forEach(o => { const d = dist(o, car); if (d < nearOpp) { nearOpp = d; near = o; } });
    // calls: an open team-mate with a clear lane shouts for it (the quality of the call is how open he really is)
    let loud = null;
    mates.forEach(o => {
      const d = dist(car, o); if (d < 5 || d > 32) return;
      let open = 1e9; opps.forEach(q => { open = Math.min(open, dist(q, o)); });
      const q = clamp((open - 2) / 7, 0, 1) * (1 - Math.min(1, this.laneBlocked(car, o))) * (0.6 + 0.4 * clamp(o.iq, 0, 1));
      if (q > 0.45) { o.callT = this.t; o.callQ = q; if (!loud || q > loud.callQ) loud = o; }
    });
    if (loud && loud.callQ > 0.8 && (loud.x - car.x) * dir > 0) this.shout(loud, 'HERE!');
    // a man closing from behind / the blind side: the nearest team-mate warns the carrier
    if (near && !near.isGK && nearOpp < 4.5 && ((near.x - car.x) * car.fx + (near.y - car.y) * car.fy) < 0) {
      car.warnT = this.t;
      let w = null, wd = 28; mates.forEach(o => { const d = dist(o, car); if (d < wd) { wd = d; w = o; } });
      if (w) this.shout(w, 'MAN ON!', '#ff9a7a');
    }
    // support triangles: the two nearest team-mates (not the chosen runners) take diagonal spots about 9 m off the carrier; pressed, one is a safe outlet
    const rn = this['_rn' + team], runners = rn && rn.m;
    const sup = mates.filter(o => o.slot > 0 && dist(car, o) < 28 && !(runners && runners.has(o))).sort((a, d) => dist(car, a) - dist(car, d)).slice(0, 2).sort((a, d) => a.y - d.y);
    const pressed = nearOpp < 3.2;
    sup.forEach((o, k) => {
      const side = sup.length > 1 ? (k === 0 ? -1 : 1) : (near && near.y > car.y ? -1 : 1);
      const back = pressed && ((sup.length > 1 && dist(car, o) <= dist(car, sup[1 - k])) || sup.length === 1);
      const sx = back ? car.x - dir * 4 : car.x + dir * 9 * Math.cos(0.8), sy = car.y + side * (back ? 7 : 9 * Math.sin(0.8));
      out.spots.set(o, { x: clamp(sx, 2, PITCH_W - 2), y: clamp(sy, 2, PITCH_H - 2) });
    });
    return out;
  };

  /**
   * Off-the-ball movement into space: around his shape position (tx, ty) the player scores a grid of nearby spots by how far the nearest opponent is,
   * how open the lane from the carrier is, how supportive the distance to the carrier is (about 16 m) and how much further up the pitch it is,
   * and walks to the best one. Smarter players read the space better (a wider, less noisy search); the choice is kept for about half a second.
   */
  P.findSpace = function (p, tx, ty, car) {
    const sp = p.space;
    if (sp && this.t - sp.t < 0.45 && this.t >= sp.t && Math.abs(sp.bx - tx) < 12 && Math.abs(sp.by - ty) < 12) return sp;
    const dir = this.teams[p.team].dir, iq = clamp(p.iq, 0, 1), opps = this.players.filter(o => o.team !== p.team);
    const ln = this.offsideLine(p.team), allow = ln != null && (ln - this.ball.x) * dir > 0 ? ln + dir * (3.5 * (1 - iq) - 0.6 * iq) : null;   // spots past the offside line are no use
    let best = { x: tx, y: ty }, bs = -1e9;
    for (const dx of [-5, 0, 6, 12, 18]) for (const dy of [-22, -14, -7, 0, 7, 14, 22]) {
      let x = clamp(tx + dir * dx, 3, PITCH_W - 3); if (allow != null && (x - allow) * dir > 0) x = allow; const y = clamp(ty + dy, 3, PITCH_H - 3), pt = { x, y };
      let open = 16; opps.forEach(o => { const d = dist(o, pt); if (d < open) open = d; });
      let sc = Math.min(open, 14) * (2.2 + 1.0 * iq) + dx * 0.25 - Math.abs(dist(car, pt) - 18) * 0.08 - Math.hypot(dx, dy) * 0.05 - dist(p, pt) * 0.02 - this.laneBlocked(car, pt) * 3 + this.gauss() * (1 - iq) * 0.9;
      if (sc > bs) { bs = sc; best = pt; }
    }
    return (p.space = { x: best.x, y: best.y, t: this.t, bx: tx, by: ty });
  };

  /** Man-marking for `team` when defending: each defender / midfielder picks up the nearest free attacker, most dangerous first. Markers are sticky and hand over with a call. */
  /**
   * The rush zone: the whole area in front of a side's goal (about a quarter of the pitch deep, most of its width). Every attacker inside it is
   * rushed by one AI defender or midfielder each, nearest pairs first, one man per attacker, the carrier first. Cached a few times a second.
   */
  P.rushMap = function (team) {
    const key = '_rz' + team, c = this[key];
    if (c && this.t - c.t < 0.15 && this.t >= c.t) return c;
    const dir = this.teams[team].dir, own = dir > 0 ? 0 : PITCH_W, TM = this.tac[team], FM = FORMATIONS[TM.formation], b = this.ball;
    const m = new Map(), inv = new Map(), out = { t: this.t, m, inv };
    this[key] = out;
    const R = PITCH_W * 0.24, HW = PITCH_H * 0.4;
    const att = this.players.filter(o => o.team !== team && !o.isGK && Math.abs(o.x - own) < R && Math.abs(o.y - PH2) < HW)
      .sort((a, c2) => (a === b.owner ? -1e9 : Math.abs(a.x - own)) - (c2 === b.owner ? -1e9 : Math.abs(c2.x - own)));
    if (!att.length) return out;
    const defs = this.players.filter(p => p.team === team && !p.isGK && p.slot >= 1 && p.slot < FM.fwdFrom && p.cool.stun <= 0 && !(this._beat && this._beat.p === p && this.t - this._beat.t < 1.8));
    const used = new Set();
    att.forEach(o => {
      let best = null, bd = 45;
      defs.forEach(p => { if (used.has(p)) return; const d = dist(p, o) - (this._rzp && this._rzp[team] && this._rzp[team].get(o) === p ? 3 : 0); if (d < bd) { bd = d; best = p; } });   // keep the man you had
      if (best) { used.add(best); m.set(best, o); inv.set(o, best); }
    });
    this._rzp = this._rzp || [null, null]; this._rzp[team] = inv;
    return out;
  };
  P.marks = function (team) {
    const key = '_mk' + team;
    if (this[key] && this.t - this[key].t < 0.25 && this.t >= this[key].t) return this[key].m;
    const dir = this.teams[team].dir, gx = dir > 0 ? 0 : PITCH_W, b = this.ball;
    const TM = this.tac[team], FM = FORMATIONS[TM.formation];
    const ours = this.players.filter(p => p.team === team && !p.isGK && p.slot < FM.fwdFrom && p.slot !== TM.libero);
    const theirs = this.players.filter(p => p.team !== team && !p.isGK && p !== b.owner).sort((a, c) => Math.abs(a.x - gx) - Math.abs(c.x - gx));
    const m = new Map(), used = new Set(), prev = this['_mkp' + team] || new Map(), inv = new Map();
    const dFor = (p, o) => { const h = TM.manMark ? p : this.homeSpot(p, false); return TM.manMark ? len(o.x - p.x, o.y - p.y) : len(o.x - (h.x + (b.x - PW2) * 0.45), o.y - h.y); };
    theirs.forEach(o => {
      let best = null, bd = TM.manMark ? 70 : 15;
      ours.forEach(p => { if (used.has(p)) return; const d = dFor(p, o); if (d < bd) { bd = d; best = p; } });
      const pm = prev.get(o);
      if (pm && pm !== best && !used.has(pm) && ours.includes(pm)) {       // keep the man you had unless a team-mate is clearly better placed
        const dp = dFor(pm, o);
        if (dp < (best ? bd + 3 : (TM.manMark ? 70 : 15))) best = pm;
      }
      if (best) {
        used.add(best); m.set(best, o); inv.set(o, best);
        if (pm && pm !== best && ours.includes(pm) && dist(best, o) < 14) this.shout(best, 'SWITCH!', '#9fd0ff');
      }
    });
    this['_mkp' + team] = inv;
    this[key] = { t: this.t, m }; return m;
  };

  P.chaserFor = function (team) {
    const key = 'ch' + team;
    if (this._chT === this.t && this[key] !== undefined) return this[key];
    const b = this.ball;
    let best = null, bd = 1e9;
    const bp = { x: b.x + b.vx * 0.3, y: b.y + b.vy * 0.3 };
    const bt = this._beat;
    this.players.forEach(p => { if (p.team !== team || p.isGK || p.cool.stun > 0) return; if (bt && bt.p === p && this.t - bt.t < 1.8) return; const d = dist(p, bp) + (b.owner && b.owner.team !== team ? (p.tr.has('lzy') ? 14 : 0) + (p.tr.has('iso') && p.isoT > 5 ? 8 : 0) - (p.tr.has('wrk') ? 3 : 0) - (p.tr.has('stp') ? 1.5 : 0) : 0); if (d < bd) { bd = d; best = p; } });
    if (b.owner && b.owner.team !== team && this.tac[team].defSmart) { const rz = this.rushMap(team).inv.get(b.owner); if (rz) best = rz; }   // a carrier inside the rush zone: his rusher is the one pressing
    // defend one at a time: the man already pressing the carrier keeps the job unless a team-mate is clearly closer
    this.presser = this.presser || [null, null];
    const cur = this.presser[team];
    if (!b.owner && cur && cur !== best && cur.cool.stun <= 0 && !cur.isGK && dist(cur, bp) < bd + 3.5) best = cur;   // loose ball: the man already going for it keeps going until someone gets it
    if (b.owner && b.owner.team !== team && cur && cur !== best && cur.cool.stun <= 0 && !cur.isGK && !(bt && bt.p === cur && this.t - bt.t < 1.8) && dist(cur, bp) < bd + 2.2) best = cur;
    this.presser[team] = best;
    if (this._chT !== this.t) { this._chT = this.t; this.ch0 = undefined; this.ch1 = undefined; this.sc0 = undefined; this.sc1 = undefined; }
    this[key] = best; return best;
  };
  P.secondFor = function (team) {
    const key = 'sc' + team;
    if (this[key] !== undefined && this._chT === this.t) return this[key];
    const first = this.chaserFor(team), b = this.ball;
    let best = null, bd = 1e9;
    this.players.forEach(p => { if (p.team !== team || p.isGK || p === first) return; const d = dist(p, b); if (d < bd) { bd = d; best = p; } });
    this[key] = best; return best;
  };

  const DRIVE = 0, OUT_BASE = 0.1;
  // how willing a player is to try his luck from outside the box: 'Long Shots'/'Finesse' types and strikers of the ball do, selfless and box players don't
  P.outsideK = function (p) {
    if (p.outK == null) {
      const tr = p.tr, ls = nrm(p.card.sub.longShots);
      p.outK = clamp(OUT_BASE + 0.45 * (ls - 0.6) + TRX * ((tr.has('lng') ? 0.3 : 0) + (tr.has('gun') ? 0.12 : 0) + (tr.has('fin') ? 0.08 : 0) - (tr.has('sel') ? 0.12 : 0) - (tr.has('box') ? 0.15 : 0)), 0.08, 1);
    }
    return p.outK;
  };

  // a team's outside-the-box attempts stay near 30% of its shots (0.43 outside per inside); traits decide WHO takes them (outsideK)
  P.outsideAllowed = function (p) {
    const q = this.shotQ || (this.shotQ = [[0, 0], [0, 0]]), t = q[p.team];
    return t[1] < 0.2 * t[0] + 0.2;                                           // v94: from outside the box at most about one shot in five
  };
  /** The danger zone: the box and the edge of it (19 m deep, 23 m either side of the goal's centre). Shots from here count as close-range shots. */
  P.inZone = function (p) { const gx = this.teams[p.team].dir > 0 ? PITCH_W : 0; return this.inBox(p, 1 - p.team) || (Math.abs(p.x - gx) < 17.5 && Math.abs(p.y - PH2) < 21); };
  P.tallyShot = function (p) { const q = this.shotQ || (this.shotQ = [[0, 0], [0, 0]]); q[p.team][this.inZone(p) ? 0 : 1]++; };

  P.carrierThink = function (p, dt) {
    if (this.sp && this.sp.taker === p && !this.ctlOf(p)) { this.setTake(p); return; }
    if (this.plan && this.plan.actor === p && !this.plan.waiting && !this.plan.fin) { p.tx = 0; p.ty = 0; return; }       // v114: the carrier of a drawn play waits a beat for the receiver
    if (!this.plan && this.cfg.plays && this.cfg.plays[p.team] && this.phase === 'play' && !this.sp && !this.ctlOf(p) && this.t >= ((this.planCool || [0, 0])[p.team] || 0)) {      // v114: start a play the team was taught
      let no = 1e9; this.players.forEach(o => { if (o.team !== p.team) { const d = dist(o, p); if (d < no) no = d; } });
      if (this.planPick(p, no)) { p.tx = 0; p.ty = 0; return; }
    }
    if ((p.order === 'goal' || p.order === 'shoot') && this.phase === 'play' && !(this.sp && this.sp.noShoot)) {      // v117: orders "run to goal and shoot" / "shoot on sight"
      const od = this.teams[p.team].dir, ogx = od > 0 ? PITCH_W : 0, odg = len(ogx - p.x, PH2 - p.y);
      if (odg < (p.order === 'goal' ? 34 : 27) * PSC) { this.shoot(p, clamp((this.rng() - 0.5) * 1.2, -1, 1), 0.9, null, { auto: true, assist: 'full' }); return; }
      if (p.order === 'goal') { this.seek(p, ogx - od * 10, PH2, true); return; }
    }
    const s = p.card.sub, iq = clamp(p.iq, 0, 1);
    const dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, ownG = dir > 0 ? 0 : PITCH_W, gm = this.gameMode(p.team);
    const dGoal = len(gx - p.x, PH2 - p.y);
    const TK = this.tac[p.team], FC = FORMATIONS[TK.formation], quickWin = this.t - this.wonAt[p.team] < 4, tr = p.tr;
    const LA = (TK.level || 0) >= 0.6 && !this.ctlOf(p), pos = p.card.position, isWinger = pos === 'LW' || pos === 'RW' || pos === 'LM' || pos === 'RM', isST = pos === 'ST' || pos === 'CF';   // League A sides: wingers run and cross, the ST hunts goals and links up
    const wingAI = !this.ctlOf(p) && isWinger, fwdAI = !this.ctlOf(p) && isST;   // v110: in every league the computer's wingers cross, take defenders on and run the byline; its strikers feed the midfield
    if (tr.has('iso')) { let nm = 1e9; this.players.forEach(o => { if (o.team === p.team && o !== p) nm = Math.min(nm, dist(o, p)); }); p.isoT = nm > 22 ? p.isoT + dt : Math.max(0, p.isoT - dt * 2); }
    let nearOpp = 1e9, opp = null;
    this.players.forEach(o => { if (o.team !== p.team) { const d = dist(o, p); if (d < nearOpp) { nearOpp = d; opp = o; } } });

    // shoot? In range the carrier keeps reading the chance (distance, angle, a clear lane): smart players take good
    // chances quickly and pass up bad ones, weak ones shoot from anywhere and hesitate on good chances.
    const reachD = 20 + 12 * nrm(s.longShots);
    const clear = dGoal < 62 && this.isClear(p);                                  // nobody in front of him but the keeper: run at goal and shoot
    if (p.cool.look <= 0 && p.cool.kick <= 0 && dGoal < (clear ? Math.max(reachD + 6, 36) : reachD + 6)) {
      p.cool.look = (0.09 + 0.12 * (1 - iq) + this.rng() * 0.05) * this.brainR * this.thinkK[p.team] * (this.inBox(p, 1 - p.team) ? 0.5 : 1);
      const angleOk = Math.abs(PH2 - p.y) < dGoal * 0.9, angle = Math.abs(PH2 - p.y) / Math.max(1, dGoal);
      const q = clamp(1 - (dGoal - 6) / (reachD - 6), 0, 1) * clamp(1 - angle * 0.8, 0.2, 1) / (1 + (0.4 + 0.8 * iq) * this.laneBlocked(p, { x: gx, y: PH2 }, true));
      const smartP = clamp(2.5 * q + 0.04, 0, 0.92), weakP = dGoal < 32 ? 0.13 + 0.45 * q : 0;
      let shootP = weakP + (smartP - weakP) * iq;
      if (nearOpp < 2.5) shootP *= q > 0.2 ? 1.5 : 1.15;                     // get it off before the tackle comes in
      if (!this.inZone(p) && !clear) shootP *= this.outsideAllowed(p) ? this.outsideK(p) : 0;                       // from outside the box only shooters try it (about 30% of a team's shots)
      shootP = Math.min(0.97, shootP * (TK.gb > 1 ? 1 + 0.3 * (TK.gb - 1) : 1) * (LA && isST ? 1.35 : 1) * AI_SHOOT * (1 + SH_PSC * (PSC - 1) * (this.inBox(p, 1 - p.team) ? 3 : 1)) * TK.shoot * (tr.has('gun') ? tx2(1.35) : 1) * (tr.has('sel') ? tx2(0.8) : 1) * (tr.has('box') && dGoal < 22 ? tx2(1.2) : 1) * (this.boxKiller(p) ? 1.25 : 1) * (tr.has('inv') && dGoal > 14 && dGoal < 28 && Math.abs(p.y - PH2) < 18 ? tx2(1.5) : 1) * (this.elite85(p) ? 1.3 : 1) * (gm > 0 ? 1.25 : gm < 0 ? 0.8 : 1));
      if (clear) shootP = dGoal < 16 ? Math.max(shootP, 0.7) : Math.min(shootP, 0.04 + 0.1 * nrm(s.longShots));   // v94: a free run on goal: he keeps running into the box and shoots from close (only the long-shot specialists try it from 20 m+)
      const stThrough = clear && isST && !p.isGK && !this.ctlOf(p);                 // a striker through on goal runs into the box first, then finishes
      if (stThrough) shootP = dGoal > 15 ? 0 : 0.95;
      const inB = (this.inZone(p) || (stThrough && dGoal <= 15)) && !p.isGK;
      if (inB) shootP = Math.max(shootP, 0.55 + 0.35 * q);                          // in the box he shoots: no more passing it around or dribbling in circles
      if ((angleOk || (inB && dGoal < 14) || stThrough) && this.rng() < shootP) {
        const gk = this.players.find(o => o.team !== p.team && o.isGK);
        const side = gk ? (gk.y < PH2 ? 1 : -1) : (this.rng() < 0.5 ? -1 : 1);
        // smart: the far corner away from the keeper; weak: closer to the middle (easy saves)
        const aim = side * (0.3 + 0.65 * iq * (0.85 + 0.15 * this.rng())) + (this.rng() - 0.5) * 0.6 * (1 - iq);
        this.tallyShot(p);
        if (inB) this.shoot(p, 0, 0.8 + this.rng() * 0.2, null, { auto: true, assist: 'full' });      // box finishers use auto aim: a corner away from the keeper, kept on frame
        else this.shoot(p, clamp(aim, -1, 1), 0.75 + this.rng() * 0.25);
        return;
      }
    }
    // long shots: good strikers of the ball let fly from 21-38 m when the lane is clear, with all the power they have, so it rises
    const lsN = tr.has('lng') ? Math.max(nrm(s.longShots), 0.65) : nrm(s.longShots);
    if (p.cool.ls <= 0 && p.cool.kick <= 0 && dGoal > 21 && dGoal < 38) {
      p.cool.ls = 0.4;
      if (lsN > 0.5 && this.outsideAllowed(p) && this.rng() < 0.1 * this.outsideK(p) / OUT_BASE && nearOpp > 2.2 && Math.abs(PH2 - p.y) < dGoal * 0.8 && this.laneBlocked(p, { x: gx, y: PH2 }, true) < 1 && this.rng() < (0.03 + 0.2 * lsN * lsN) * (this.tacLS ? this.tacLS(p) : 1) * (tr.has('lng') ? 1.8 : 1)) {
        const gk = this.players.find(o => o.team !== p.team && o.isGK);
        const side = gk ? (gk.y < PH2 ? 1 : -1) : (this.rng() < 0.5 ? -1 : 1);
        this.tallyShot(p);
        this.shoot(p, clamp(side * (0.3 + 0.5 * this.rng()), -1, 1), 1, null, { long: true });
        return;
      }
    }
    if (p.cool.decide <= 0 && p.cool.kick <= 0) {
      p.cool.decide = ((0.24 - 0.15 * iq) + this.rng() * (0.15 - 0.07 * iq)) * (this.t - p.warnT < 0.7 ? 0.65 : 1) * (p.isoT > 5 ? 1.5 : 1) * this.brainR * this.thinkK[p.team] * (LA ? 0.75 : 1);   // League A moves it quicker   // smart players make decisions faster; a warning speeds him up
      // wing-play: a wide carrier in the final third whips it into the box for the target man and the poacher
      // byline: pull it back low to a team-mate arriving at the penalty spot (the best chance in the game)
      if (!p.isGK && Math.abs(gx - p.x) < 13 && Math.abs(p.y - PH2) > 13 && this.rng() < 0.7) {
        const tgt = this.players.filter(o => o.team === p.team && o !== p && !o.isGK && Math.abs(o.y - PH2) < 13 && Math.abs(gx - o.x) > 7 && Math.abs(gx - o.x) < 26 && Math.abs(gx - o.x) > Math.abs(gx - p.x) + 2 && dist(o, p) > 5)
          .map(o => { let open = 1e9; this.players.forEach(q => { if (q.team !== p.team) open = Math.min(open, dist(q, o)); }); return { o, sc: Math.min(open, 9) - this.laneBlocked(p, o) * 4 }; }).sort((a, c) => c.sc - a.sc)[0];
        if (tgt && tgt.sc > 1.5) { this.pass(p, tgt.o, false, { power: 0.6 }); return; }
      }
      const crossK = Math.max(TK.cross, tr.has('crs') ? 0.45 : 0, wingAI ? 0.4 : 0);
      const lw = LA && isWinger;   // League A wingers cross from further out and wider
      if (crossK && Math.abs(p.y - PH2) > (wingAI ? 0.14 : lw ? 0.17 : crossK >= 0.4 ? 0.2 : 0.28) * PITCH_H && dGoal > 14 && dGoal < (wingAI ? 66 : lw ? 62 : tr.has('crs') || crossK >= 0.4 ? 60 : 38) && this.rng() < crossK * (crossK >= 0.4 ? 0.75 : 0.4) * (tr.has('crs') ? tx2(1.5) : 1) * (lw ? 1.4 : 1)) {
        const tgt = this.players.filter(o => o.team === p.team && o !== p && !o.isGK && (o.slot >= FC.fwdFrom - (wingAI ? 1 : 0) || tr.has('crs')) && Math.abs(o.y - PH2) < (lw || wingAI ? 24 : tr.has('crs') ? 20 : 16) && Math.abs(gx - o.x) < (wingAI ? Math.max(lw ? 36 : 0, 30 * PSC) : lw ? 36 : tr.has('crs') ? 28 : 22)).sort((a, c) => Math.abs(gx - a.x) - Math.abs(gx - c.x))[0];
        const tgt2 = tgt || (wingAI && dGoal < 48 * PSC ? this.players.filter(o => o.team === p.team && o !== p && !o.isGK && o.slot > FC.nDef && Math.abs(gx - o.x) < 40 * PSC && Math.abs(gx - o.x) < dGoal - 4).sort((a, c) => Math.abs(gx - a.x) - Math.abs(gx - c.x))[0] : null);   // v110: a winger with no striker in the box still swings it to the nearest attacker arriving
        if (tgt2) { this.pass(p, tgt2, false, { power: 0.8, lob: true }); return; }
      }
      // pass? weak players misjudge options (noise) and ignore defenders in the lane; smart ones spot runners in behind
      let best = null, bs = -1e9, braw = -1e9, through = false;
      const EL = this.eliteT[p.team]; let sideLoad = 0;                     // v219: how crowded the carrier's flank is (share of their outfield men within 22 m across)
      if (EL) { let n = 0, m = 0; this.players.forEach(q => { if (q.team !== p.team && !q.isGK) { m++; if (Math.abs(q.y - p.y) < 22) n++; } }); sideLoad = m ? n / m : 0; }
      const laneW = 9 * (0.5 + 0.5 * iq), noise = (1 + 7 * (1 - iq)) * (TK.atk ? 0.5 : 1), range = (32 + 12 * nrm(s.vision)) * TK.range * (tr.has('vis') ? 1.15 : 1) * (tr.has('swi') ? 1.3 : 1) * (tr.has('bpl') && p.slot <= FC.nDef ? 1.2 : 1);
      this.players.forEach(o => {
        if (o.team !== p.team || o === p) return;
        const d = dist(p, o); if (d < 4 || d > range) return;
        let open = 1e9; this.players.forEach(q2 => { if (q2.team !== p.team) open = Math.min(open, dist(q2, o)); });
        const prog = (o.x - p.x) * dir, called = this.t - o.callT < 0.9;
        const runs = ((o.vx * dir) > 3 && o.slot >= FC.fwdFrom - 1) || (o.run && o.run.until > this.t && (o.run.x - o.x) * dir > 4);
        const raw = prog * 0.45 * TK.vert + Math.min(open, 9) * (tr.has('sfe') ? 1.5 : 1.1) - this.laneBlocked(p, o) * laneW * (TK.vert > 1.5 ? 0.6 : 1) * (tr.has('sfe') ? 1.3 : 1) - d * 0.2 * TK.shortW - (o.isGK ? 14 : 0) + (runs ? 4 * iq + (o.run && o.run.until > this.t ? 5 * iq : 0) : 0) + (o.slot >= FC.fwdFrom ? TK.targetMan : 0) + (TK.counter && quickWin ? prog * 0.3 * TK.counter : 0) + (called ? 2.5 + 3.5 * o.callQ : 0)
          + (tr.has('vis') && runs ? 3 : 0) + (tr.has('swi') && d > 24 && Math.abs(o.y - p.y) > 14 ? 4 : 0) + (tr.has('vrt') ? prog * 0.15 : 0) + (tr.has('bpl') && p.slot <= FC.nDef ? prog * 0.1 : 0)
          + (o.tr.has('tgt') && Math.abs(gx - o.x) < 40 ? 3 : 0) + (o.tr.has('run') && prog > 5 ? 1.5 : 0)
          + (this.smartT[p.team] > 2 ? (d > 24 && Math.abs(o.y - p.y) > 20 && open > 8 && prog > -3 ? 2 : 0) + (open > 7 && prog > 6 ? 3 : 0) : 0)
          + (this.smartT[p.team] >= 4.5 ? (p._g1 && p._g1.from === o && this.t - p._g1.t < 3 && prog > 1 && open > 3 ? 6 : 0) + (d < 18 && open > 4 ? 2.5 : 0) - (d > 30 && !(open > 12 && prog > 10) ? 5 : 0) : 0)   // v201 tiki-taka: the one-two back to the runner, short passes to a free man, no hopeful long balls   // v192 FC27 Legendary: switch play to the free side, play into space, never into a marked man
          + (EL ? EL * ((sideLoad > 0.55 && Math.abs(o.y - p.y) > 24 && open > 6 ? 4 : 0) + (Math.abs(o.y - PH2) < 0.16 * PITCH_H && (o.x - ownG) * dir > PITCH_W * 0.6 && open > 4 ? 2.5 : 0)) : 0)   // v219: switch play off a crowded flank; find the man free in the central attacking zone
          + (TK.cross >= 0.3 && Math.abs(o.y - PH2) > 0.22 * PITCH_H && (o.x - ownG) * dir > PITCH_W * 0.45 ? 7 * TK.cross : 0)                                   // v94: a crossing side finds its wide men in the attacking half
          + (LA && (o.card.position === 'ST' || o.card.position === 'CF') && prog > 0 && !p.isGK ? (p.slot <= FC.nDef + 3 ? 5 : 2) : 0)                      // League A: get it to the striker quickly
          - (TK.shortW < 1.5 && !p.isGK ? (d < 12 ? 2.5 : 0) + (prog < -2 ? 3 : 0) : 0)                                 // only short-passing tactics (tiki-taka, positional) keep recycling it
          - (!p.isGK && (p.x - ownG) * dir < PITCH_W * 0.22 && (o.x - ownG) * dir < PITCH_W * 0.25 && Math.abs(o.y - p.y) > 14 ? 7 : 0)               // never pass across your own box
          + gm * prog * 0.12
          + (TK.vert < 1.4 && (p.x - ownG) * dir < PW2 * 1.15 ? ((o.slot > FC.nDef && o.slot < FC.fwdFrom ? 3 : 0) - (p.slot >= 1 && p.slot <= FC.nDef && o.slot >= FC.fwdFrom && d > 25 ? 3 : 0)) : 0)               // build through the midfield: defenders look for the midfielders, not the long ball
          + (fwdAI && dGoal >= 24 && o.slot > FC.nDef && o.slot < FC.fwdFrom ? 5 : 0)                                                               // v110: a striker with his back to goal plays it to the midfield, they build the attack
          + (LA && isST && (o.card.position === 'LW' || o.card.position === 'RW' || o.card.position === 'CAM' || o.card.position === 'LM' || o.card.position === 'RM') ? 4 : 0);   // and the striker lays it off to the wingers / CAM for help
        const sc = raw + this.gauss() * noise * (called ? 0.55 : 1);                    // the noise changes WHICH option he sees, not how keen he is to pass
        if (sc > bs) { bs = sc; best = o; braw = raw; through = runs && open > 4 && prog > 0; }
      });
      const warned = this.t - p.warnT < 0.7, pressured = nearOpp < 2.4 || (warned && nearOpp < 4.5);
      // traits colour the choice: dribblers and fearless players hold on, selfless / playmaking ones release it, poor link-up players keep it
      const drive = dGoal < 42 && nearOpp > 3.5 && !this.inBox(p, 1 - p.team) ? DRIVE : 0;     // a free man near the box carries it in rather than recycling it or trying his luck from range
      const bias = drive + (wingAI && nearOpp > 3 && dGoal > 16 ? 5 : 0) + (wingAI && nearOpp > 2 && nearOpp < 8 && (p.x - ownG) * dir > PITCH_W * 0.45 && dGoal > 20 ? 5 : 0) + (LA && isST && dGoal < 30 ? 6 : 0) + (fwdAI && dGoal >= 28 ? -3 : 0) + (tr.has('dri') ? 3 : 0) + (tr.has('nlk') ? 4 : 0) + (tr.has('gun') ? 2 : 0) - (tr.has('sel') ? 3 : 0) - (tr.has('vis') ? 1.5 : 0), pbias = (tr.has('fea') ? 3 : 0) + (tr.has('dri') ? 1.5 : 0) - (tr.has('sel') ? 1.5 : 0);
      const boxNoPass = this.inBox(p, 1 - p.team) && !p.isGK && dGoal < 20 && !(nearOpp < 1.4 && this.laneBlocked(p, { x: gx, y: PH2 }, true) > 1.2);   // in the box he is there to score
      const stClear = clear && isST && !p.isGK && !this.ctlOf(p);                                // a striker with nobody ahead of him: no pass, he runs at goal
      const wantPass = best && !boxNoPass && !stClear && !(clear && dGoal < 55 && nearOpp > 3) && (pressured ? braw > 2 - 4 * iq - TK.eager * 0.5 + pbias : braw > 8 + this.rng() * 6 - TK.eager + bias);
      if (wantPass) { this.pass(p, best, through); return; }
      // in doubt, kick it out: a defender hemmed in near his own goal clears it long and wide
      if (!p.isGK && p.slot >= 1 && p.slot <= FC.nDef && (p.x - ownG) * dir < PITCH_W * 0.28 && (nearOpp < 2.8 || (warned && nearOpp < 4.5))) {
        const tgt = this.players.filter(o => o.team === p.team && o !== p && !o.isGK && (o.x - p.x) * dir > 22 && Math.abs(o.y - PH2) > 16).sort((a, c) => (c.x - a.x) * dir - Math.abs(c.y - p.y) * 0.1 + Math.abs(a.y - p.y) * 0.1)[0];
        if (tgt) { this.pass(p, tgt, false, { power: 1, lob: true }); return; }
       
      }
    }
    // skill moves: face up a defender and beat him in his planted step (roll head-on, stepover wide, feint close in, knock-and-run into space)
    const sm = (p.card.details && p.card.details.skillMoves) || 2;
    if (opp && sm >= 2 && !p.skill && !this.inBox(p, 1 - p.team) && p.cool.skillcd <= 0 && p.cool.kick <= 0 && p.cool.look <= 0.05 && nearOpp > 1.7 && nearOpp < (wingAI ? 8 : 5.6)) {
      const ovx = opp.x - p.x, ovy = opp.y - p.y, od = len(ovx, ovy) || 1, front = (ovx * dir) / od;       // is he between me and goal?
      const sf = this.skillFactor(p);
      if (front > (wingAI ? 0.05 : 0.35) && this.rng() < (0.05 + 0.2 * sf) * (this.aiEdge(p, opp) ? 1.6 : 1) / (1 + 1.5 * Math.max(0, (p.skChain || 0) - (this.t - (p.skLast || -99)) / 2.5)) * (0.5 + 0.5 * iq) * (sm - 1) / 2.2 * (tr.has('dri') ? 2.2 : 1) * (tr.has('fea') ? 1.3 : 1) * (wingAI ? ((p.x - ownG) * dir > PITCH_W * 0.4 ? 3.5 : 1.8) : 1)) {
        const space = Math.abs(gx - opp.x) > 12 && this.laneBlocked(p, { x: p.x + dir * 12, y: p.y }, true) < 0.5;
        const fast = nrm(s.sprintSpeed) - nrm(opp.card.sub.sprintSpeed) > 0.08;
        const wide = Math.abs(p.y - PH2) > 17;
        const kind = space && fast && this.rng() < 0.55 ? 'knock' : nearOpp < 2.9 ? (this.rng() < 0.5 ? 'roll' : 'feint') : (wide || sm >= 4) && this.rng() < 0.7 ? 'step' : 'feint';
        if (this.skill(p, kind, dir, (PH2 - p.y) * 0.02)) return;
      }
    }
    // dribble toward goal; smart players swerve away from pressure, weak ones run into it
    let wmIn = false;
    if (isWinger && !tr.has('wid') && !tr.has('inv') && (p.x - ownG) * dir > PITCH_W * 0.5 && dGoal < 55) { const key = Math.floor(this.t / 4); if (p._wmT !== key) { p._wmT = key; p._wmI = this.rng() < 0.45; } wmIn = p._wmI; }   // read the fullback: cut inside or go for the byline
    const invK = wmIn && !(TK.cross >= 0.3) ? 1.6 : tr.has('inv') && (p.x - PW2) * dir > -8 ? 1.6 : (tr.has('wid') || (wingAI && dGoal > 30) || (TK.cross >= 0.3 && (isWinger || (TK.fbSlots && TK.fbSlots.indexOf(p.slot) >= 0)) && (p.x - ownG) * dir > PITCH_W * 0.4 && dGoal > 16)) ? 0.15 : 1;      // v94: a crossing side's wide men run the touchline to the byline      // inverted wingers cut inside, wide men stay out
    let tx = gx - p.x, ty = (PH2 - p.y) * 0.6 * invK;
    const L = len(tx, ty) || 1; tx /= L; ty /= L;
    if (opp && nearOpp < 5) {
      const ax = p.x - opp.x, ay = p.y - opp.y, al = len(ax, ay) || 1;
      const w = (5 - nearOpp) / 5 * (0.35 + 0.75 * iq);
      tx += ax / al * w; ty += ay / al * w * 1.3;
    }
    if (p.y < 4) ty += 0.5; if (p.y > PITCH_H - 4) ty -= 0.5;
    const L2 = len(tx, ty) || 1;
    p.sprinting = (nearOpp > 4 || (clear && isST && !p.isGK)) && (p.stamina > 25 || !this.ctlOf(p));
    const max = p.sprinting ? p.sprintMax : p.jogMax;
    p.tx = tx / L2 * max; p.ty = ty / L2 * max;
  };

  /* ------------------------------ skill moves ----------------------------- */
  const SKILL_DUR = { roll: 0.44, step: 0.52, feint: 0.4, knock: 0.32 };
  /** How well this player sells a move: Dribbling first, then Agility, Ball Control and the card's skill-move stars. */
  P.skillFactor = function (p) {
    const s = p.card.sub, sm = (p.card.details && p.card.details.skillMoves) || 2;
    return clamp(0.5 * nrm(s.dribbling) + 0.2 * nrm(s.agility) + 0.1 * nrm(s.ballControl) + 0.2 * (sm - 1) / 4, 0, 1);
  };
  /**
   * The four dribbling techniques, all on the ball:
   *   roll    sole on top of the ball, dragged sideways to a new lane while the hips follow
   *   step    a stepover: the foot loops round the ball, the shoulder drops, then out the other side
   *   feint   body feint: no touch, a sharp dip of shoulder and hips to one side, then explode the other way
   *   knock   knock-and-run: a big touch into space, then sprint after it
   * roll / step / feint wrong-foot nearby defenders in front of the carrier: the chance rises with the carrier's skill and drops with
   * the defender's awareness, agility and brain; a fooled defender is dragged the wrong way and cannot tackle for a moment.
   */
  P.skill = function (p, kind, dx, dy) {
    const b = this.ball;
    if (this.sp && this.sp.taker === p) return false;
    if (p.skill || b.owner !== p || p.cool.kick > 0 || p.cool.stun > 0 || p.cool.slide > 0 || p.cool.skillcd > 0) return false;
    const sig = kind === 'sig';
    if (sig) { if (p.cool.sigcd > 0) return false; kind = this.sigOf(p).kind; }          // Q / Space: the player's own dribble, once every 3 s
    const L = len(dx, dy), fx = L > 0.2 ? dx / L : p.fx, fy = L > 0.2 ? dy / L : p.fy;
    p._sk = -(p._sk || 1);
    p.skill = { kind, t: 0, dur: SKILL_DUR[kind], side: p._sk, fx, fy, fired: false, sig };
    if (this.learn) this.scout[p.team].skills++;
    this.ev('skill', p, { kind, sig });
    p.fx = fx; p.fy = fy;
    // no hard limit, but moves in quick succession lose their sting: every extra move inside a few seconds lengthens the recovery and wrong-foots less
    const chain = sig ? 1 : Math.max(0, (p.skChain || 0) - (this.t - (p.skLast || -99)) / 2.5) + 1;
    if (!sig) { p.skChain = chain; p.skLast = this.t; }
    p.skill.chain = chain;
    p.cool.skillcd = sig ? SKILL_DUR[kind] + 0.15 : SKILL_DUR[kind] + 0.4 + 0.55 * (chain - 1) * (chain - 1);
    if (sig) { p.cool.sigcd = 3 + SKILL_DUR[kind]; const si = this.sigOf(p); this.fx({ type: 'text', x: p.x, y: p.y - 3, text: si.name, color: '#ff9a2e', life: 0.9 }); }
    if (kind === 'knock') {
      const s = p.card.sub, ctrl = nrm(((s.ballControl || 60) + (s.dribbling || 60)) / 2);
      const D = 4 + 3.5 * nrm(s.sprintSpeed) + 1.0 * this.rng();                       // touch length: pace sets how far you can afford to push it
      let sp = (0.5 + 0.8 * D) * (1 + this.gauss() * 0.16 * (1 - ctrl));              // a poor touch is too short (stolen) or too long (keeper's)
      const ang = Math.atan2(fy, fx) + this.gauss() * 0.2 * (1 - ctrl);
      this.kick(p, Math.cos(ang) * sp, Math.sin(ang) * sp, 0, 0, null);
      p.cool.kick = 0; b.noPickT = 0.12; p.cool.rush = 1.5; p.sprinting = true;
    }
    return true;
  };
  /** Signature dribbles (Q / Space) from the list JODIO supplied: move type, a flavour name and a mastery bonus from the player's dribble total. Everyone else gets a default by build. */
  const SIGS = {};
  [['lamine yamal', 'feint', 'LA CUARENTA', 97], ['vinicius jr.', 'step', 'ELASTICO', 53], ['vinicius junior', 'step', 'ELASTICO', 53], ['rafael leao', 'feint', 'PELOPINCHO', 38],
    ['michael olise', 'roll', 'CROQUETA', 68], ['jeremy doku', 'step', 'STEP-OVER CUT', 41], ['bradley barcola', 'step', 'STEPOVER BURST', 48], ['morgan rogers', 'knock', 'POWER CARRY', 31],
    ['khvicha kvaratskhelia', 'feint', 'KVARADONA', 30], ['nuno mendes', 'feint', 'DROP SHOULDER', 54], ['jamie gittens', 'feint', 'WINGER FEINT', 27], ['ousmane dembele', 'step', 'DOUBLE STEPOVER', 24],
    ['kylian mbappe', 'knock', 'SPRINT DRIBBLE', 41], ['jude bellingham', 'roll', 'BALL ROLL', 26], ['jamal musiala', 'feint', 'MADCHEN', 19], ['kenan yildiz', 'step', 'STEPOVER', 43],
    ['desire doue', 'roll', 'CROQUETA', 45], ['francisco conceicao', 'step', 'NUTMEG STEP', 23], ['vitinha', 'roll', 'BALL ROLL', 22], ['jens petter hauge', 'feint', 'BYLINE FEINT', 30],
    ['luis diaz', 'feint', 'DIAZ SPIN', 27], ['achraf hakimi', 'knock', 'OVERLAP DRIVE', 19], ['alejandro balde', 'knock', 'PACE DRIBBLE', 21], ['lazar samardzic', 'roll', 'BALL ROLL', 20],
    ['leroy sane', 'knock', 'SPRINT DRIBBLE', 24], ['oscar gloukh', 'roll', 'CROQUETA', 24], ['johan bakayoko', 'step', 'STEPOVER', 19], ['gabriel martinelli', 'knock', 'PACE DRIBBLE', 18],
    ['joel monteiro', 'feint', 'BODY FEINT', 20], ['martin baturina', 'feint', 'TIGHT FEINT', 19], ['noni madueke', 'step', 'STEPOVER', 25], ['hugo ekitike', 'feint', 'BODY FEINT', 22],
    ['julian alvarez', 'feint', 'QUICK TURN', 21], ['harry kane', 'roll', 'BALL ROLL', 19], ['trincao', 'step', 'ELASTICO', 19], ['giuliano simeone', 'feint', 'BODY FEINT', 19],
    ['florian wirtz', 'roll', 'CROQUETA', 19], ['maghnes akliouche', 'step', 'ELASTICO', 19], ['mauro junior', 'feint', 'BODY FEINT', 18], ['savinho', 'step', 'ELASTICO', 17], ['savio', 'step', 'ELASTICO', 17],
    ['gelson martins', 'knock', 'PACE DRIBBLE', 17], ['daniel podence', 'step', 'ELASTICO', 16], ['wilson odobert', 'step', 'STEPOVER', 18], ['emmanuel addai', 'feint', 'BODY FEINT', 15],
    ['amar dedic', 'feint', 'CROSS FEINT', 15], ['kevin', 'step', 'STEPOVER', 26]
  ].forEach(r => { SIGS[r[0]] = { kind: r[1], name: r[2], m: 0.04 + 0.12 * Math.min(r[3], 60) / 60 }; });
  P.sigOf = function (p) {
    const c = p.card; if (c._sig) return c._sig;
    const key = String(c.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    let r = SIGS[key];
    if (!r) {                                                                                    // not on the list: a default by build
      const sm = (c.details && c.details.skillMoves) || 2, pos = c.position;
      const kind = sm >= 4 ? 'step' : (c.sub.sprintSpeed || 60) >= 86 ? 'knock' : ['CM', 'CAM', 'CDM', 'CB', 'LM', 'RM'].indexOf(pos) >= 0 ? 'roll' : 'feint';
      r = { kind, name: { step: 'STEPOVER', knock: 'PACE DRIBBLE', roll: 'BALL ROLL', feint: 'BODY FEINT' }[kind], m: 0 };
    }
    return (c._sig = r);
  };
  /** How well a skill move comes off: the card's skill factor, plus the signature bonus and a lift for the player's own move. */
  P.sigSf = function (p, k) { const f = this.skillFactor(p); return k && k.sig ? clamp(f * 1.15 + this.sigOf(p).m, 0, 1) : f; };
  P.skillStep = function (p, dt) {
    const k = p.skill; k.t += dt;
    const u = clamp(k.t / k.dur, 0, 1), perp = { x: -k.fy * k.side, y: k.fx * k.side };
    if (k.kind !== 'knock') {
      p.tx *= 0.45; p.ty *= 0.45; p.sprinting = false;
      p.skOx = 0; p.skOy = 0;
      if (k.kind === 'roll') { const e = Math.sin(Math.PI * u) * 1.0; p.skOx = perp.x * e; p.skOy = perp.y * e; }
      if (!k.fired && u >= 0.5) {
        k.fired = true;
        const sf = this.sigSf(p, k) / (1 + 0.8 * ((k.chain || 1) - 1)), R = (k.kind === 'step' ? 4.3 : k.kind === 'feint' ? 3.7 : 3.4) * (k.sig ? 0.85 + 0.45 * sf : 1);
        // a signature dribble is only as good as the dribbler: a weak one can botch the touch (nobody fooled, ball nudged away)
        const sloppy = k.sig && this.rng() < 0.4 * (1 - sf) * (1 - sf);
        if (sloppy) {
          const ang = Math.atan2(k.fy, k.fx) + this.gauss() * 0.6; this.kick(p, Math.cos(ang) * 4.5, Math.sin(ang) * 4.5, 0, 0, null); p.cool.kick = 0; this.ball.noPickT = 0.12;
          this.fx({ type: 'text', x: p.x, y: p.y - 2, text: 'SLOPPY!', color: '#ff6060', life: 0.8 });
        }
        if (!sloppy) this.players.forEach(o => {
          if (o.team === p.team || o.isGK || o.cool.stun > 0) return;
          const vx = o.x - p.x, vy = o.y - p.y, d = len(vx, vy);
          if (d > R || (vx * k.fx + vy * k.fy) / (d || 1) < 0.1) return;
          const os = o.card.sub, ch = clamp(0.3 + 0.6 * sf - 0.35 * nrm(((os.defAwareness || 60) + (os.agility || 60)) / 2) - 0.25 * clamp(o.iq, 0, 1) + (k.kind === 'feint' ? 0.08 : 0) + (this.aiEdge(p, o) ? 0.2 : 0), 0.05, 0.95);
          if (this.rng() < ch) {
            o.cool.fooled = k.sig ? 0.6 + 0.6 * sf : 0.85; o.foolDir = { x: perp.x, y: perp.y };
            this.fx({ type: 'text', x: o.x, y: o.y - 2, text: k.kind === 'step' ? 'STEPOVER!' : k.kind === 'roll' ? 'ROLLED!' : 'FEINT!', color: '#ffe14a', life: 0.8 });
          }
        });
      }
    }
    if (u >= 1) {                                                                     // exit: burst away from the side that was sold
      p.skill = null; p.skOx = 0; p.skOy = 0;
      if (k.kind !== 'knock') {
        let ex = k.fx - perp.x * 0.7, ey = k.fy - perp.y * 0.7; const el = len(ex, ey) || 1; ex /= el; ey /= el;
        const sf = this.sigSf(p, k), imp = (1.8 + 2.2 * sf) * (k.sig ? 1.2 : 1);
        p.vx += ex * imp; p.vy += ey * imp; p.fx = ex; p.fy = ey; p.cool.rush = 0.6;
      }
    }
  };

  P.seek = function (p, x, y, sprint) {
    const dx = x - p.x, dy = y - p.y, d = len(dx, dy);
    if (d < 0.4) { p.tx = 0; p.ty = 0; return; }
    // computer-controlled players (everyone the human isn't driving) run at their real top speed and never tire: any real distance is a sprint
    const ai = !this.ctlOf(p);
    p.sprinting = ai ? (sprint || (d > 2.5 && !p.isGK)) : sprint && p.stamina > 20;
    const max = (p.sprinting ? p.sprintMax : p.jogMax) * clamp(d / 3, 0.25, 1);
    p.tx = dx / d * max; p.ty = dy / d * max;
  };
  P.face = function (p, dx, dy) { const L = len(dx, dy); if (L > 0.01) { p.fx = dx / L; p.fy = dy / L; } };

  /* ------------------------------ goalkeeper ----------------------------- */
  P.gkThink = function (p, dt) {
    const b = this.ball, dir = this.teams[p.team].dir, gx = dir > 0 ? 0 : PITCH_W;
    if ((this.training && this._trSet || this.penaltyKick) && b.owner && b.owner.team !== p.team) { p.tx = 0; p.ty = 0; p.vx = 0; p.vy = 0; p.x = gx + dir * 0.4; p.y = PH2;
      const hc = this.penaltyKick && this.ctls[p.team];                                   // v207 (JODIO): your keeper at a penalty: A / D picks the dive (seen from behind the taker), W / S stays in the middle; the last press counts
      if (hc && hc.input) { const ix = (hc.input.right ? 1 : 0) - (hc.input.left ? 1 : 0), iy = (hc.input.up || hc.input.down) ? 1 : 0; if (ix) p._penPick = ix * this.teams[b.owner.team].dir; else if (iy) p._penPick = 0; }
      return; }
    { const spk = this.sp;                                                                // v207 (JODIO): a direct free kick against him: he waits on his line (a step to the ball's side), then dives at the strike
      if (spk && spk.kind === 'FREE KICK' && spk.team !== p.team && b.owner && b.owner === spk.taker && Math.abs(b.x - gx) < 40) {
        this.seek(p, gx + dir * 0.5, PH2 + clamp((b.y - PH2) * 0.04, -0.7, 0.7)); this.face(p, b.x - p.x, b.y - p.y); return; } }   // v188: Testing Ground set piece: on his line, still, until the strike
    const s = p.card.sub;
    if (b.owner === p) {
      // hold briefly, then distribute
      p.holdT += dt; p.tx = 0; p.ty = 0;
      const keiq = clamp(p.iq, 0, 1);
      if (p.holdT > 0.45 + 0.6 * (1 - keiq)) {                                   // a sharp keeper gets it away quickly
        p.holdT = 0;
        let best = null, bs = -1e9;
        this.players.forEach(o => {
          if (o.team !== p.team || o === p) return;
          let open = 1e9; this.players.forEach(q => { if (q.team !== p.team) open = Math.min(open, dist(q, o)); });
          const press = this.players.some(q => q.team !== p.team && dist(q, o) < 7);
          const s2 = Math.min(open, 10) - dist(p, o) * 0.12 * (1.1 - nrm(s.gkKicking)) + (this.rng() * 3) + (this.t - o.callT < 1 ? 2 + 3 * o.callQ : 0) - (press ? 3 * keiq : 0) + (open > 9 ? (o.x - p.x) * dir * -0.05 * keiq : 0);   // good kickers find players further away; a smart one avoids the marked man and plays to the free one upfield
          if (s2 > bs) { bs = s2; best = o; }
        });
        if (best) this.pass(p, best, false);
      }
      return;
    }
    p.holdT = 0;
    // an attacker dribbling inside the small box: the keeper comes and picks the ball up
    { const car = b.owner && b.owner.team !== p.team && !b.owner.isGK ? b.owner : null;
      if (car && Math.abs(car.x - gx) < 5.5 && Math.abs(car.y - PH2) < 9.16 && dist(p, car) < 3.4 && p.dvT == null) {
        p.pickT = (p.pickT || 0) + dt; this.seek(p, car.x, car.y, true);
        if (p.pickT > 0.3 - 0.15 * nrm(s.gkHandling)) { p.pickT = 0; this.claim(p, 'KEEPER!'); this.giveBall(p); return; }
      } else p.pickT = 0; }
    if (p.feet && this.t >= p.feet.t) {                                                 // diving at the attacker's feet: the outcome lands a moment after the launch
      const f = p.feet, car = b.owner; p.feet = null;
      if (f.win && car === f.car && dist(p, car) < 6) { this.claim(p, 'KEEPER WINS IT!'); this.giveBall(p); }
      else if (car === f.car && !f.win && f.foul && dist(p, car) < 3.5) this.foul(p, car, 'keeper dived in');
    }
    p.diveMove = false;
    // the dive animation clock: launch, fly, land, lie there a moment, get up (1.7 s in all)
    if (p.dvT != null) { p.dvT += dt; if (p.dvT > 1.7) p.dvT = null; }
    if (p.dvT != null && p.dvT > 0.8 && p.dvT < 1.35) { p.tx = 0; p.ty = 0; p.dive = null; return; }   // down on the turf
    // diving: an explosive sideways launch to where the ball will be (the keeper's dive stat sets how fast and how far)
    if (p.dive) {
      p.dive.t += dt;
      if (p.dive.t > p.dive.react) {
        const dy = p.dive.y - p.y, sp = 7 + 7 * nrm(s.gkDiving);
        p.diveMove = true; p.tx = 0; p.ty = Math.abs(dy) < 0.15 ? 0 : clamp(dy * 9, -sp, sp);
      } else { p.tx = 0; p.ty = 0; }
      if (p.dive.t > 1.0) p.dive = null;
      return;
    }
    // a shot or a ball into the area: read where it will cross the keeper's position and how high, then go for it
    if (!b.owner && b.shot && b.shot.team !== p.team && b.vx * dir < -2.5 && p.dvT == null) {      // a real shot only: passes and clearances are not dived at
      const tk = (p.x - b.x) / b.vx, tl = (gx + dir * 0.4 - b.x) / b.vx;
      if (tl > 0 && tl < 3.4) {                                                                        // even a ball that has already got past him: he turns and throws himself at it
        const sh = b.shot, curly = sh.curl > 0.12 && sh.aimY != null;
        if (curly && sh.fool == null) sh.fool = this.rng() < 0.95 - 0.4 * nrm(((s.gkReflexes || 60) + (s.gkPositioning || 60)) / 2) - 0.1 * (p.pf['Far Reach'] || 0) - (sh.fk ? 0.35 : 0);   // v207: from his line at a free kick he reads the bend better   // v149: a finesse shot starts wide; the keeper goes with where it looks headed and is sometimes wrong-footed when it bends
        const tk2 = Math.max(tk, Math.min(0.12, tl)), cy = b.y + b.vy * tk2, zt = Math.max(0, b.z + b.vz * tk2 - 4.9 * tk2 * tk2), zl = b.z + b.vz * tl - 4.9 * tl * tl;
        const endY = curly ? sh.aimY : b.y + b.vy * tl, onTarget = Math.abs(endY - PH2) < GOAL_HALF + 0.15 && zl < GOAL_H + 0.1 && zl > -0.5;        // inside the posts and under the bar, or he stays on his feet
        if (onTarget) {
          // anticipation: the sharper the reflexes and positioning, the sooner he moves; a keeper who guesses the corner early gets there
          let react = Math.max(0.02, (0.08 * this.gkWeak(p) - (p.tr.has('stk') ? 0.03 : 0) + 0.3 - 0.24 * nrm(s.gkReflexes) - 0.06 * nrm(s.gkPositioning) - 0.05 * clamp(p.iq, 0, 1) - 0.04 * (p.pf['Footwork'] || 0)) * 0.5);   // dives go early: half the old reaction time
          if (sh.fk) react *= 0.4;                                                       // v207: set on his line for a free kick, he is ready for it
          const hard = (sh.pw || 0) >= 0.92;   // v188 (JODIO): a 92%+ power strike is read, not guessed: no dive, he steps straight into its path
          const gs = (sh.pen || sh.fk) && p._guess != null && (!hard || (sh.pen && this.ctls[p.team])) ? p._guess : null; p._guess = null;   // v207: your own keeper's penalty pick holds even against a power strike
          if (hard && gs == null) { const ty = clamp(cy, PH2 - GOAL_HALF - 0.5, PH2 + GOAL_HALF + 0.5); p.dive = { y: ty, t: 0, react: react * 0.5, hi: zt > 1.1, far: false }; if (zt > 1.1 || Math.abs(ty - p.y) > 0.3) { p.dvT = 0; p.dvHi = zt > 1.1; p.dvZ = zt; p.dvSide = ty >= p.y ? 1 : -1; } return; }   // v221 (JODIO): he still reads it, but throws himself at it instead of stepping across
          const hi = zt > 1.1, dy0 = gs != null ? PH2 + gs * (GOAL_HALF - 0.9) : curly && !sh.fool ? endY : cy, far = gs != null ? gs !== 0 : Math.abs(dy0 - p.y) > 0.3;   // v221 (JODIO): dives for anything not straight at him (was 0.8 m)   // v187: a guessed side
          p.dive = { y: clamp(dy0, PH2 - GOAL_HALF - 0.5, PH2 + GOAL_HALF + 0.5), t: 0, react, hi, far };
          if (far || hi) { p.dvT = 0; p.dvHi = hi; p.dvZ = zt; p.dvSide = dy0 >= p.y ? 1 : -1; }   // v220: dvZ = how high the ball crosses him, the 3D dive rises to meet it          // the visible dive (a shuffle for shots at the body)
          return;
        }
      }
    }
    // crosses and high balls: come off the line and claim it when he can get there first
    const swp = p.tr.has('swp'), stk = p.tr.has('stk'), cmd = p.tr.has('cmd');
    const inBox = Math.abs(b.x - gx) < (swp ? 22 : 16.5) && Math.abs(b.y - PH2) < 20;
    const rush = 0.75 + 0.45 * nrm(s.gkPositioning) + (swp ? 0.25 : 0) + 0.25 * (p.pf['Cross Claimer'] || 0);   // good keepers come for loose balls they can win
    const chaser = this.chaserFor(1 - p.team);
    if (!b.owner && inBox && b.z > 0.9 && (b.vx * dir) < 4) {
      const tl = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 19.62 * b.z))) / 9.81;      // when it comes down
      const lx = b.x + b.vx * tl, ly = b.y + b.vy * tl;
      if (Math.abs(lx - gx) < (cmd ? 18 : 15) + 3 * (p.pf['Cross Claimer'] || 0) && Math.abs(ly - PH2) < (cmd ? 22 : 18) && (!chaser || dist(p, { x: lx, y: ly }) < dist(chaser, { x: lx, y: ly }) * rush + 1)) { this.claim(p, 'KEEPER!'); this.seek(p, lx - dir * 0.5, ly, true); return; }
    }
    if (!b.owner && (inBox || (Math.abs(b.x - gx) < 24 && Math.abs(b.y - PH2) < 20 && nrm(s.gkPositioning) > 0.55)) && chaser && dist(p, b) < dist(chaser, b) * rush && b.z < 2.2) {
      this.claim(p, 'KEEPER!'); this.seek(p, b.x, b.y, true); return;
    }
    // sweeping: a ball played in behind the line that he can reach before the attacker, he comes out and gets it
    { const ki = clamp(p.iq, 0, 1);
      if (!b.owner && !b.shot && ki > 0.55 && Math.abs(b.x - gx) < 14 + 18 * ki && !p.tr.has('stk')) {
        const px2 = b.x + b.vx * 0.7, py2 = b.y + b.vy * 0.7, tK = dist(p, { x: px2, y: py2 }) / Math.max(4, p.sprintMax);
        let tO = 1e9; this.players.forEach(o => { if (o.team !== p.team && !o.isGK) tO = Math.min(tO, dist(o, { x: px2, y: py2 }) / Math.max(4, o.sprintMax)); });
        if (b.z < 2 && tK < tO * (0.72 + 0.25 * ki)) { this.claim(p, 'KEEPER!'); this.seek(p, px2, py2, true); return; }
      } }
    // positioning: on the line between ball and goal centre; the closer the danger the further he comes out to shrink the angle
    const car = b.owner && b.owner.team !== p.team ? b.owner : null, dBall = len(b.x - gx, b.y - PH2);
    let adv = clamp(dBall * 0.08, 1, 5) * (0.55 + 0.6 * nrm(s.gkPositioning));
    if (car && dBall < 28) adv = clamp(dBall * (0.18 + 0.14 * nrm(s.gkPositioning)), 2, 9);    // narrowing the angle on a runner
    adv *= swp ? 1.3 : stk ? 0.85 : 1;                                              // sweepers stand high, shot-stoppers on the line
    // diving at the feet: a dribbler at close range inside the box, the keeper may throw himself at the ball
    if (car && b.owner === car && Math.abs(car.x - gx) < 20 && Math.abs(car.y - PH2) < 22 && !this.ctlOf(p)) {
      const dc = dist(p, car);
      if (dc < 6.5 && dc > 1.4 && Math.abs(car.x - gx) < 20 && p.dvT == null && !p.feet && this.t > (p.feetCD || 0)) {   // a dribbler at close range: the keeper may dive at his feet for the ball
        p.feetCD = this.t + 2.5;
        if (this.rng() < 0.85) {
          const cs = car.card.sub, win = clamp(0.5 + 0.3 * nrm(s.gkHandling) + 0.15 * nrm(s.gkDiving) - 0.35 * nrm(((cs.dribbling || 60) + (cs.ballControl || 60)) / 2) - (car.skill ? 0.2 : 0), 0.15, 0.85);
          const w = this.rng() < win, fl = this.rng() < 0.12;
          p.dive = { y: clamp(car.y, PH2 - GOAL_HALF - 0.5, PH2 + GOAL_HALF + 0.5), t: 0, react: 0.04, hi: false, far: true };
          p.dvT = 0; p.dvHi = false; p.dvSide = car.y >= p.y ? 1 : -1;
          p.vx += (car.x - p.x) / dc * 4;
          p.feet = { t: this.t + 0.22, win: w, foul: fl, car };
        }
      }
    }
    // one on one: the attacker is clean through with no defender near him, so he closes him down fast and spreads himself
    let oneOne = false;
    if (car && dBall < 20 && Math.abs(car.y - PH2) < 14 && nrm(s.gkPositioning) > 0.4 && !this.players.some(o => o.team === p.team && !o.isGK && dist(o, car) < 8)) { adv = clamp(dBall * 0.55, 3, 11); oneOne = true; }
    // keeper rush: an attacker running at goal in the box area, the keeper charges out at him and smothers the ball at his feet
    if (car && !oneOne && Math.abs(car.x - gx) < 24 + 4 * (p.pf['1v1 Close Down'] || 0) && Math.abs(car.y - PH2) < 18 && (car.x - gx) * dir > 0 && !this.players.some(o => o.team === p.team && !o.isGK && dist(o, car) < 5)) {
      const dc = dist(p, car);
      this.seek(p, car.x - dir * 1.2, car.y, true);
      if (dc < 2.6 && Math.abs(car.x - gx) < 16.5) {
        p.rushT = (p.rushT || 0) + dt;
        if (p.rushT > 0.55 - 0.3 * nrm(s.gkHandling) + 0.2 * (1 - nrm(s.gkPositioning)) - 0.15 * (p.pf['1v1 Close Down'] || 0)) { p.rushT = 0; this.claim(p, 'KEEPER!'); this.giveBall(p); }
      } else p.rushT = 0;
      return;
    }
    p.rushT = 0;
    const ang = Math.atan2(b.y - PH2, b.x - gx);
    const nearPost = clamp((b.y - PH2) * 0.14 * (0.5 + nrm(s.gkPositioning)), -1.6, 1.6);   // from a wide angle he covers the near post first
    this.seek(p, gx + Math.cos(ang) * adv, PH2 + clamp(Math.sin(ang) * adv + nearPost, -GOAL_HALF * 0.85, GOAL_HALF * 0.85), oneOne);
  };

  /* --------------------------- integration ------------------------------- */
  /**
   * Movement model. Desired velocity (tx,ty) is split into components parallel
   * and perpendicular to the current velocity: the parallel change is capped by
   * ACCELERATION, the perpendicular (turning) change by AGILITY+BALANCE. That's
   * what makes a 97-pace / 98-agility winger feel snappy and a 63-pace CB feel
   * like a lorry.
   */
  P.integratePlayers = function (dt, frozen) {
    const b = this.ball;
    this.players.forEach(p => {
      let tx = p.tx || 0, ty = p.ty || 0;
      if (frozen && !p.celRun) { tx = 0; ty = 0; }
      if (p.cool.stun > 0) { tx = 0; ty = 0; }
      // fluid running: the intended velocity is eased in rather than snapped, so changes of direction are arcs. Agile, balanced players
      // re-aim in about 0.06 s, heavy ones in a quarter of a second. Stops and stuns cut it straight away.
      if (p.sx == null || frozen || p.cool.stun > 0 || p.cool.slide > 0 || p.diveMove) { p.sx = tx; p.sy = ty; }
      else { const k = 1 - Math.exp(-dt / (0.06 + 0.2 * (1 - (p.agil != null ? p.agil : 0.5)))); p.sx += (tx - p.sx) * k; p.sy += (ty - p.sy) * k; tx = p.sx; ty = p.sy; }
      if (p.diveMove && !frozen) { p.vx *= (1 - 4 * dt); p.vy = ty; p.sx = p.sy = 0; }              // a keeper's dive is a launch, not a run
      else if (p.cool.slide > 0) { p.vx *= (1 - 2.2 * dt); p.vy *= (1 - 2.2 * dt); }
      else {
        const hasBall = b.owner === p;
        if (!hasBall && !p.isGK && b.owner && b.owner.team !== p.team && p.defK > 1 && dist(p, b.owner) < 22) { tx *= p.defK; ty *= p.defK; }   // defending: catch-up pace
        if (hasBall) { const m = 0.74 + 0.24 * nrm(p.card.sub.dribbling); tx *= m; ty *= m; }
        // Rapid+: a 2 s burst of pace, only while sprinting with the ball, then a 5 s cooldown. Quick Step+: 3 s of sharper acceleration, only while sprinting without the ball, then 5 s cooldown
        if ((p.pf['Rapid'] || 0)) {
          if (p.rbT > 0) { if (hasBall && p.sprinting) { p.rbT -= dt; tx *= 1 + 0.042 * p.pf['Rapid']; ty *= 1 + 0.042 * p.pf['Rapid']; if (p.rbT <= 0) { p.rbT = 0; p.rbCD = 5; } } else { p.rbT = 0; p.rbCD = 5; } }
          else if (p.rbCD > 0) p.rbCD -= dt;
          else if (hasBall && p.sprinting && !frozen) { p.rbT = 2; this.psIcon(p, 'Rapid', () => p.rbT > 0); }
        }
        if ((p.pf['Quick Step'] || 0)) {
          if (p.qbT > 0) { if (!hasBall && p.sprinting) p.qbT -= dt; else p.qbT = 0; if (p.qbT <= 0) { p.qbT = 0; p.qbCD = 5; } }
          else if (p.qbCD > 0) p.qbCD -= dt;
          else if (!hasBall && p.sprinting && !frozen) { p.qbT = 3; this.psIcon(p, 'Quick Step', () => p.qbT > 0); }
        }
        // below 30% stamina, Acceleration / Sprint Speed / Agility degrade proportionally
        const stamMul = p.stamina < 30 && this.ctlOf(p) ? 0.7 + 0.3 * (p.stamina / 30) : 1; tx *= stamMul; ty *= stamMul;
        { const L2 = len(tx, ty); if (L2 > VCAP) { tx *= VCAP / L2; ty *= VCAP / L2; } }   // nobody ever runs faster than 29 km/h (bursts, catch-up and celebrations included)
        const sp = len(p.vx, p.vy);
        let acc = p.accel * stamMul, turn = p.turnAcc * stamMul;
        if (p.qbT > 0) acc *= 1 + 0.5 * (p.pf['Quick Step'] || 0);
        if (hasBall && (p.pf['Technical'] || 0)) turn *= 1 + 0.25 * p.pf['Technical'];
        if (hasBall && (p.pf['Trickster'] || 0)) turn *= 1 + 0.04 * p.pf['Trickster'];
        let dvx = tx - p.vx, dvy = ty - p.vy;
        if (sp > 0.5) {
          const ux = p.vx / sp, uy = p.vy / sp;
          let par = dvx * ux + dvy * uy;
          let perpX = dvx - par * ux, perpY = dvy - par * uy;
          // explosive first steps that taper towards top speed (an exponential-looking build), and braking quicker than accelerating
          const maxPar = (par > 0 ? acc * clamp(1.3 - 0.7 * sp / Math.max(4, p.sprintMax), 0.6, 1.3) : acc * 1.6) * dt;
          par = clamp(par, -maxPar, maxPar);
          const pl = len(perpX, perpY), maxPerp = turn * dt;
          if (pl > maxPerp) { perpX *= maxPerp / pl; perpY *= maxPerp / pl; }
          p.vx += par * ux + perpX; p.vy += par * uy + perpY;
        } else {
          const l = len(dvx, dvy), m = acc * dt;
          if (l > m) { dvx *= m / l; dvy *= m / l; }
          p.vx += dvx; p.vy += dvy;
        }
      }
      if (p.tackleT > 0) { p.tackleT -= dt; p.vx *= (1 - 4 * dt); p.vy *= (1 - 4 * dt); }
      if (!p.diveMove && !(p.cool.slide > 0) && !p.isGK) { const v2 = len(p.vx, p.vy); if (v2 > VCAP) { p.vx *= VCAP / v2; p.vy *= VCAP / v2; } }   // 29 km/h is the fastest anyone runs (slides and dives are not running)
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.x = clamp(p.x, -2, PITCH_W + 2); p.y = clamp(p.y, -2, PITCH_H + 2);
      const sp2 = len(p.vx, p.vy);
      if (sp2 > 0.3 && p.cool.slide <= 0) {
        // the body turns toward the direction of travel at a rate set by agility and balance (smooth, weighty turns, not snaps)
        const nx = p.vx / sp2, ny = p.vy / sp2, f = 1 - Math.exp(-(9 + 16 * p.agil) * dt);
        let qx = p.fx + (nx - p.fx) * f, qy = p.fy + (ny - p.fy) * f;
        if (qx * qx + qy * qy < 0.04) { qx = -p.fy * 0.3 + nx * 0.1; qy = p.fx * 0.3 + ny * 0.1; }      // a full about-turn swings round instead of collapsing
        const ql = len(qx, qy) || 1; p.fx = qx / ql; p.fy = qy / ql;
      }
      p.moveT = sp2 > 1 ? p.moveT + dt : 0;
      p.anim += sp2 * dt;
      const g0 = p.gait || 0;
      p.gait = (g0 + sp2 * dt / (1.15 + 0.3 * sp2)) % 1;   // gait phase: one cycle = two steps, longer strides when faster
      if (!frozen && b.owner === p && g0 < 0.47 && p.gait >= 0.47) this.touch(p, sp2);
      // stamina
      this.moodTick(p, dt);
      const st = p.card.sub.stamina || 70;
      if (p.sprinting && sp2 > p.jogMax * 0.9) p.stamina -= dt * (1.75 - 1.2 * nrm(st)) * (1 - 0.6 * (p.pf['Relentless'] || 0)) * (p.tr.has('dur') ? 0.8 : p.tr.has('frg') ? 1.25 : 1) * (p.tr.has('sub') && (parseInt(this.minute(), 10) < 70) ? 0.6 : 1) * 3.6 * (b.owner === p ? 1.4 : 1);   // sprinting (and sprinting with the ball) is expensive
      else if (b.owner === p && sp2 > 2) p.stamina -= dt * (1.0 - 0.55 * nrm(st)) * (1 - 0.5 * (p.pf['Relentless'] || 0));   // dribbling at a jog still wears him down
      else p.stamina += dt * (sp2 > 3 ? 0.7 : 1.2);
      if (!this.ctlOf(p)) p.stamina = 100;                                                           // the AI never tires
      p.stamina = clamp(p.stamina, 0, 100);
      // Rapid+ trail + Quick Step+ dust (visual only)
      if (!this.headless) {
        p.trailT -= dt;
        if (p.rbT > 0 && p.sprinting && sp2 > p.jogMax && p.trailT <= 0) { p.trail.push({ x: p.x, y: p.y, life: 0.3, t: 0 }); p.trailT = 0.04; }
        p.trail.forEach(q => { q.t += dt; }); p.trail = p.trail.filter(q => q.t < q.life);
        if (p.qbT > 0 && p.moveT > 0 && p.moveT < 0.25 && this.rng() < 0.5) this.fx({ type: 'dust', x: p.x - p.fx, y: p.y + 0.5, life: 0.4 });
      }
    });
  };

  /**
   * 3D bodies: every player is a solid cylinder (0.42 m radius). Overlapping players are pushed apart, the
   * heavier (stronger) one moves less, and their velocities along the contact exchange momentum. A hard run
   * into the ball carrier can knock him off the ball, depending on speed, Strength and Balance.
   */
  const BODY_R = 0.42;
  /** Physical presence, 0..1: Strength first, then Balance, Aggression, Stamina and Jumping. Decides who wins a shoulder-to-shoulder battle. */
  P.bullyPower = function (p) {
    if (p._bp == null) {
      const s = p.card.sub;
      p._bp = clamp(0.5 * nrm(s.strength) + 0.2 * nrm(s.balance) + 0.15 * nrm(s.aggression) + 0.1 * nrm(s.stamina) + 0.05 * nrm(s.jumping) + 0.08 * (p.pf['Bruiser'] || 0) + 0.06 * (p.pf['Enforcer'] || 0) + (p.tr.has('stp') ? 0.03 : 0), 0, 1);
    }
    return p._bp;
  };
  /**
   * Running shoulder to shoulder (side by side, bodies touching, opposing teams): the physically stronger player leans on the other and
   * drives him sideways and off his line, slowing him; the bigger the gap in Strength / Balance / Aggression the harder it is. A carrier who is
   * the weaker one gets shouldered off the ball; the stronger one holds his man off. A big gap can send the weaker man stumbling.
   */
  P.shoulder = function (a, c, d, dx, dy, dt) {
    const sa = len(a.vx, a.vy), sc = len(c.vx, c.vy);
    if (Math.max(sa, sc) < 1.5) return;
    const mx = a.vx + c.vx, my = a.vy + c.vy, ml = len(mx, my) || 1;
    if (Math.abs((dx * mx + dy * my) / (d * ml)) > 0.65) return;           // one is in front of the other: that is a collision or a tackle, not a shoulder battle
    const diff = this.bullyPower(a) - this.bullyPower(c), k = Math.abs(diff) - 0.04;
    if (k <= 0) return;
    const strong = diff > 0 ? a : c, weak = diff > 0 ? c : a, sx = (weak.x - strong.x) / d, sy = (weak.y - strong.y) / d;
    weak.vx += sx * 22 * k * dt; weak.vy += sy * 22 * k * dt;                  // the stronger man is never moved by the weaker one
    weak.vx *= 1 - 1.4 * k * dt; weak.vy *= 1 - 1.4 * k * dt;
    const b = this.ball;
    if (b.owner === weak && !(weak.bumpT && this.t - weak.bumpT < 0.9) && this.rng() < clamp(2.2 * (k - 0.02), 0, 1.4) * dt) {
      weak.bumpT = this.t; weak.cool.stun = Math.max(weak.cool.stun, 0.3);
      const ang = Math.atan2(sy, sx) + (this.rng() - 0.5) * 1.2;
      this.kick(strong, Math.cos(ang) * 4, Math.sin(ang) * 4, 0.5, 0, null); strong.cool.kick = 0; b.noPick = weak; b.noPickT = 0.35;
      this.fx({ type: 'text', x: weak.x, y: weak.y - 2, text: 'SHOULDERED OFF!', color: '#ffb040', life: 0.8 });
    } else if (k > 0.3 && !(weak.bumpT && this.t - weak.bumpT < 1.2) && this.rng() < 0.5 * k * dt) {
      weak.bumpT = this.t; weak.cool.stun = Math.max(weak.cool.stun, 0.35);
    }
  };
  P.collidePlayers = function (dt) {
    const ps = this.players, b = this.ball, R = BODY_R * 2;
    for (let i = 0; i < ps.length; i++) for (let k = i + 1; k < ps.length; k++) {
      const a = ps[i], c = ps[k];
      if (a.cool.stun > 0.5 || c.cool.stun > 0.5) continue;                 // bodies on the grass don't block
      let dx = c.x - a.x, dy = c.y - a.y; const d2 = dx * dx + dy * dy;
      if (dt && a.team !== c.team && d2 < (R + 0.9) * (R + 0.9) && d2 > 1e-6 && !a.isGK && !c.isGK) this.shoulder(a, c, Math.sqrt(d2), dx, dy, dt);
      if (d2 >= R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), ov = R - d;
      let ma = a.mass || 75, mc = c.mass || 75;
      if (a.team !== c.team && !a.isGK && !c.isGK) { const gap = this.bullyPower(a) - this.bullyPower(c); if (gap > 0.05) ma *= 1 + Math.min(6, gap * 25); else if (gap < -0.05) mc *= 1 + Math.min(6, -gap * 25); }   // a stronger player cannot be bodied off by a weaker one
      const mt = ma + mc;
      dx /= d; dy /= d;
      a.x -= dx * ov * mc / mt; a.y -= dy * ov * mc / mt; c.x += dx * ov * ma / mt; c.y += dy * ov * ma / mt;
      const vn = (c.vx - a.vx) * dx + (c.vy - a.vy) * dy;
      if (vn >= 0) continue;
      const imp = -1.15 * vn / (1 / ma + 1 / mc);
      a.vx -= imp / ma * dx; a.vy -= imp / ma * dy; c.vx += imp / mc * dx; c.vy += imp / mc * dy;
      // shoulder to shoulder with the ball carrier
      const car = b.owner === a ? a : b.owner === c ? c : null, hit = car === a ? c : a;
      if (!car || hit.team === car.team || -vn < 3.4 || (car.bumpT && this.t - car.bumpT < 0.8)) continue;
      car.bumpT = this.t;
      const cs = car.card.sub, hs = hit.card.sub;
      if ((hit.fx * car.fx + hit.fy * car.fy) > 0.35 && ((car.x - hit.x) * car.fx + (car.y - hit.y) * car.fy) > 0) continue;   // nobody bodies the ball off a carrier from behind
      if (this.bullyPower(car) >= this.bullyPower(hit) - 0.02) continue;                     // a carrier at least as strong cannot be bumped off the ball
      const pLose = clamp(0.12 + (-vn - 3.4) * 0.1 + ((hs.strength || 60) - (cs.strength || 60)) / 90 - ((cs.balance || 60) - 60) / 160, 0.03, 0.75);
      if (this.rng() < pLose) {
        car.cool.stun = 0.4;
        const ang = Math.atan2(car.vy, car.vx) + (this.rng() - 0.5) * 1.6;
        this.kick(hit, Math.cos(ang) * 4.5, Math.sin(ang) * 4.5, 0.6, 0, null); hit.cool.kick = 0; b.noPick = car; b.noPickT = 0.35;
        this.fx({ type: 'text', x: car.x, y: car.y - 2, text: 'BUMP!', color: '#ffb040', life: 0.7 });
      }
    }
  };

  /** Each dribbling touch at full sprint: poor Ball Control / Dribbling knocks the ball too far ahead (anyone can steal it). */
  P.touch = function (p, sp) {
    if (!p.sprinting || sp < p.jogMax * 0.95) return;
    const c = nrm(((p.card.sub.ballControl || 60) + (p.card.sub.dribbling || 60)) / 2);
    if (this.rng() > 0.22 * Math.pow(1 - c, 2)) return;
    const b = this.ball, k = sp + 2.5 + this.rng() * 2;
    b.owner = null; b.last = p; b.vx = p.fx * k; b.vy = p.fy * k; b.vz = 0; b.noPick = p; b.noPickT = 0.28; b.passTo = null;
    if (this.ctlOf(p)) { p.cool.rush = 1.5; p.autoUntil = this.t + 1.6; }                  // the AI sprints him onto the ball before you get him back
    p.cool.trap = 0.4;
    this.fx({ type: 'text', x: p.x, y: p.y - 2, text: 'HEAVY TOUCH', color: '#ffd0a0', life: 0.6 });
  };

  /**
   * Dribbling: the ball is carried a touch ahead of the feet and eased onto that spot, so it swings round smoothly through turns
   * instead of snapping. Faster running pushes it further out; the feet alternate it a little to either side. `snap` = set pieces.
   */
  P.stickBall = function (dt, snap) {
    const b = this.ball, o = b.owner;
    if (!o) return;
    const sp = len(o.vx, o.vy), k = clamp(sp / Math.max(1, o.sprintMax), 0, 1);
    const off = 0.62 + 0.3 * k, sw = Math.sin((o.anim || 0) * 1.1) * 0.1 * k;
    const tx = o.x + o.fx * off - o.fy * sw + (o.skOx || 0), ty = o.y + o.fy * off + o.fx * sw + (o.skOy || 0);
    if (snap || !dt || o.skill) { b.x = tx; b.y = ty; }
    else { const f = 1 - Math.exp(-(22 + 20 * nrm(o.card.sub.ballControl)) * dt); b.x += (tx - b.x) * f; b.y += (ty - b.y) * f; }
    b.z = 0;
    b.vx = o.vx; b.vy = o.vy; b.vz = 0;
  };

  P.updateBall = function (dt) {
    const b = this.ball;
    if (b.noPickT > 0) { b.noPickT -= dt; if (b.noPickT <= 0) b.noPick = null; }
    if (b.owner) { this.stickBall(dt); return; }
    // sidespin bends the flight path (Magnus force perpendicular to the velocity: it rotates the heading at a rate set by the spin,
    // so a curler swerves more late in its flight as drag slows it); a rolling ball is barely deflected. It bleeds off with time and a heavier air.
    if (b.spin) {
      const air = b.z > 0.05 || b.vz > 0 ? 1 : 0.3;
      const a = b.spin * this.ballM.magnus * air * dt, c = Math.cos(a), s = Math.sin(a);
      const vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx;
      b.spin *= (1 - 0.5 * dt);
    }
    if (b.tspin) b.tspin *= (1 - 0.35 * dt);
    // a pass in flight bends a little towards its receiver, so it stays on target when he changes direction
    if (b.passTo && !b.shot && b.passTo.p && b.z < 1.2 && b.passTo.p !== b.last && b.last && this.ctlOf(b.last)) {   // human passes only
      const tg = b.passTo.p, sp = len(b.vx, b.vy);
      if (sp > 4) {
        const tt = Math.min(1.2, dist(tg, b) / sp), px = tg.x + tg.vx * tt * 0.9, py = tg.y + tg.vy * tt * 0.9;
        let da = Math.atan2(py - b.y, px - b.x) - Math.atan2(b.vy, b.vx); da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < 0.7) {
          const st = clamp(da, -2.6 * dt, 2.6 * dt), c = Math.cos(st), s2 = Math.sin(st), vx = b.vx * c - b.vy * s2; b.vy = b.vx * s2 + b.vy * c; b.vx = vx;
          b.passTo.x = px; b.passTo.y = py;
        }
      }
    }
    this.integrateBall3D(dt);
    if (!this.headless && b.trailType && len(b.vx, b.vy) > 5) { b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 16) b.trail.shift(); }
    else if (b.trail.length) b.trail.shift();
    if (len(b.vx, b.vy) < 5 && b.shot) b.shot = null;
    this.checkSave();
  };

  /* ------------------------- 3D ball physics ---------------------------
   * The ball is a real 3D body (x, y on the pitch, z = height):
   *   - gravity, quadratic air drag and spin (Magnus curve) while airborne;
   *   - bounces with restitution and turf friction, then rolling resistance;
   *   - collisions with the round posts and crossbar of both goals;
   *   - once over the line it is held by the net (back, sides and sloped roof),
   *     and every hit makes the net bulge (drawn by drawGoal3D).
   * Fast balls are integrated in sub-steps so a 30 m/s shot cannot tunnel
   * through a 12 cm post.
   * --------------------------------------------------------------------- */
  const BALL_R = 0.11, POST_R = 0.06, NET_DEPTH = 3.2, NET_TOP_BACK = 2.9;
  P.integrateBall3D = function (dt) {
    const b = this.ball;
    const sp3 = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    const steps = clamp(Math.ceil(sp3 * dt / 0.08), 1, 8), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (b.z > 0 || b.vz > 0) {
        // airborne: gravity + quadratic drag (k = rho*Cd*A / 2m for a size-5 ball)
        const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz), k = 0.0125 * this.ballM.drag * v;
        b.vx -= k * b.vx * h; b.vy -= k * b.vy * h; b.vz -= (9.81 + k * b.vz) * h;
        // Magnus lift / dip from top- and backspin: topspin drags the ball down (a dipping volley), backspin holds it up (a chip that floats and stops)
        if (b.tspin) b.vz -= 0.12 * this.ballM.magnus * b.tspin * Math.sqrt(b.vx * b.vx + b.vy * b.vy) * h;
        b.z += b.vz * h;
        if (b.z <= 0) {
          b.z = 0;
          if (b.vz < -0.9) {
            // the bounce: restitution from the ball and the turf, grip from the surface. Wet turf skids the ball on (it keeps and even gains
            // pace), spin kicks it forward (topspin) or checks it (backspin) and sideways (sidespin); a worn pitch throws it off line.
            const S = this.surf, g = S.grip, tsp = b.tspin || 0;
            b.vz = -b.vz * 0.7 * S.bounce * this.ballM.bounce;
            const hk = 1 - 0.07 * g + (S.slick ? 0.035 : 0) + 0.06 * tsp * g;
            const hs = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (hs > 0.01) { const nx = -b.vy / hs, ny = b.vx / hs, side = b.spin * 0.7 * g; b.vx = b.vx * hk + nx * side; b.vy = b.vy * hk + ny * side; }
            if (S.irr && -b.vz > -1) { b.vx += this.gauss() * S.irr * Math.min(8, hs) * 0.5; b.vy += this.gauss() * S.irr * Math.min(8, hs) * 0.5; b.vz *= 1 + this.gauss() * S.irr * 0.6; }
            b.spin *= 0.7; if (b.tspin) b.tspin *= 0.4;
          } else b.vz = 0;
        }
      } else {
        // rolling resistance: proportional drag + a constant decel (feels like real turf)
        const rf = this.surf.roll, sp = len(b.vx, b.vy), ns = Math.max(0, sp * (1 - 0.6 * rf * h) - 0.8 * rf * h);
        if (ns < 0.15) { b.vx = 0; b.vy = 0; } else { b.vx *= ns / sp; b.vy *= ns / sp; }
      }
      b.x += b.vx * h; b.y += b.vy * h;
      this.frameCollide();
      if (b.inNet != null) this.netCollide(b.inNet, h);
    }
  };

  /** Bounce off posts (vertical cylinders) and crossbars (horizontal cylinders). */
  P.frameCollide = function () {
    const b = this.ball, R = BALL_R + POST_R;
    if (b.x > 3 && b.x < PITCH_W - 3) return;
    [0, PITCH_W].forEach(gx => {
      // posts
      [PH2 - GOAL_HALF, PH2 + GOAL_HALF].forEach(py => {
        const dx = b.x - gx, dy = b.y - py, d = Math.sqrt(dx * dx + dy * dy);
        if (d < R && d > 1e-4 && b.z < GOAL_H) {
          const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; this.woodwork('POST', -vn); }
          b.x = gx + nx * R; b.y = py + ny * R;
        }
      });
      // crossbar
      if (Math.abs(b.y - PH2) < GOAL_HALF) {
        const dx = b.x - gx, dz = b.z - GOAL_H, d = Math.sqrt(dx * dx + dz * dz);
        if (d < R && d > 1e-4) {
          const nx = dx / d, nz = dz / d, vn = b.vx * nx + b.vz * nz;
          if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; this.woodwork('BAR', -vn); }
          b.x = gx + nx * R; b.z = GOAL_H + nz * R;
        }
      }
    });
  };
  P.woodwork = function (what, speed) {
    const b = this.ball;
    if (b.shot) b.shot.saveChecked = true;
    if (speed < 3 || (this._woodT && this.t - this._woodT < 0.3)) return;
    this._woodT = this.t;
    this.say(what === 'POST' ? 'OFF THE POST!' : 'OFF THE BAR!');
    if (b.last) this.ev('post', b.last, {});
    this.event((what === 'POST' ? 'Hit the post' : 'Hit the bar') + (b.last ? ' - ' + b.last.card.name : ''), 'woodwork');
    this.fx({ type: 'text', x: b.x, y: b.y - 2, text: 'CLANG!', color: '#ffffff', life: 0.8 });
    this.fx({ type: 'shake', life: 0.2 });
  };

  /**
   * Keep the ball inside the net after it crosses the line. The net is soft: the ball sinks into the back, the side
   * netting and the roof against a heavily damped spring (it stretches up to ~0.5 m and soaks up almost all of the
   * ball's speed, so the ball drops into the goal). The cloth mesh (stepNets) is pushed by the ball and drawn by drawGoal3D.
   */
  const NET_K = 1500, NET_C = 66, NET_MAX = 0.55;
  P.netCollide = function (side, h) {
    const b = this.ball, dir = side ? 1 : -1, gx = side ? PITCH_W : 0;
    h = h || 1 / 60;
    const depth = (b.x - gx) * dir;                       // metres behind the goal line
    if (depth < 0) return;
    const hit = (y, z, s) => { if (s > 1.5 && !(this.netHit && this.netHit.t < 0.25)) this.netHit = { side, y, z, t: 0, s: Math.min(1, s / 18) }; };
    const soft = (pen, v, max) => {                       // returns the velocity change along the outward normal
      if (pen > max) return { clamp: true };
      return { dv: -(NET_K * pen + NET_C * v) * h };
    };
    // back of the net
    const pb = depth - (NET_DEPTH - BALL_R);
    if (pb > 0) {
      const vo = b.vx * dir; hit(b.y, b.z, vo);
      const r = soft(pb, vo, NET_MAX);
      if (r.clamp) { b.x = gx + dir * (NET_DEPTH - BALL_R + NET_MAX); if (vo > 0) b.vx = -vo * 0.15 * dir; }
      else b.vx += dir * r.dv;
      b.vy *= 1 - 4 * h; b.vz *= 1 - 2 * h; b.spin = 0;   // the mesh grips the ball
    }
    // side netting
    const lim = GOAL_HALF - BALL_R, ps = Math.abs(b.y - PH2) - lim;
    if (ps > 0) {
      const sg = Math.sign(b.y - PH2), vo = b.vy * sg; hit(b.y, b.z, vo);
      const r = soft(ps, vo, 0.4);
      if (r.clamp) { b.y = PH2 + sg * (lim + 0.4); if (vo > 0) b.vy = -vo * 0.15 * sg; }
      else b.vy += sg * r.dv;
      b.vx *= 1 - 3 * h;
    }
    // sloped roof
    const roof = GOAL_H + (NET_TOP_BACK - GOAL_H) * clamp(depth / NET_DEPTH, 0, 1) - BALL_R, pr = b.z - roof;
    if (pr > 0) {
      hit(b.y, b.z, b.vz);
      const r = soft(pr, b.vz, 0.4);
      if (r.clamp) { b.z = roof + 0.4; if (b.vz > 0) b.vz = -b.vz * 0.15; }
      else b.vz += r.dv;
    }
  };

  /* --------------------------- cloth nets ---------------------------------
   * Each goal has a Verlet cloth: back, roof and two side panels, every panel edge tied to the frame, interior knots
   * free. Links only resist stretching (a little slack, so the net hangs), gravity pulls the knots down, and the ball
   * pushes knots outward along each panel's normal, so the net bulges around it and ripples back. It is purely visual:
   * it only runs when the match is rendered.
   * ------------------------------------------------------------------------ */
  function makeNet(side) {
    const dir = side ? 1 : -1, gx = side ? PITCH_W : 0, y1 = PH2 - GOAL_HALF, y2 = PH2 + GOAL_HALF;
    const P0 = [], pin = [], links = [], panels = [];
    const add = (x, y, z, pinned) => { P0.push(x, y, z); pin.push(pinned ? 1 : 0); return pin.length - 1; };
    const panel = (name, nu, nv, f, normal) => {
      const idx = [];
      for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) { const q = f(u / nu, v / nv); idx.push(add(q[0], q[1], q[2], u === 0 || v === 0 || u === nu || v === nv)); }
      const at = (u, v) => idx[v * (nu + 1) + u];
      for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
        if (u < nu) links.push(at(u, v), at(u + 1, v)); if (v < nv) links.push(at(u, v), at(u, v + 1));
      }
      panels.push({ name, nu, nv, at, normal });
    };
    const roofZ = t => GOAL_H + (NET_TOP_BACK - GOAL_H) * t;
    panel('back', 16, 6, (u, v) => [gx + dir * NET_DEPTH, y1 + (y2 - y1) * u, NET_TOP_BACK * v], [dir, 0, 0]);
    panel('roof', 16, 5, (u, v) => [gx + dir * NET_DEPTH * v, y1 + (y2 - y1) * u, roofZ(v)], [dir * 0.174, 0, 0.985]);
    panel('far', 6, 6, (u, v) => [gx + dir * NET_DEPTH * u, y1, roofZ(u) * v], [0, -1, 0]);
    panel('near', 6, 6, (u, v) => [gx + dir * NET_DEPTH * u, y2, roofZ(u) * v], [0, 1, 0]);
    const pos = Float32Array.from(P0), prev = Float32Array.from(P0), rest = [];
    for (let i = 0; i < links.length; i += 2) {
      const a = links[i] * 3, c = links[i + 1] * 3;
      rest.push(1.03 * Math.hypot(P0[a] - P0[c], P0[a + 1] - P0[c + 1], P0[a + 2] - P0[c + 2]));   // 3% slack
    }
    return { side, pos, prev, pin, links, rest, panels, awake: 120 };
  }

  P.stepNets = function (dt) {
    if (!this.nets) this.nets = [makeNet(0), makeNet(1)];
    const b = this.ball;
    this.nets.forEach(net => {
      const gx = net.side ? PITCH_W : 0, near = Math.abs(b.x - gx) < NET_DEPTH + 1.5 && Math.abs(b.y - PH2) < GOAL_HALF + 1.5;
      if (near && b.inNet === net.side) net.awake = 120;
      if (net.awake <= 0) return;
      net.awake--;
      const { pos, prev, pin, links, rest } = net, n = pin.length, g = -9.81 * 0.35 * dt * dt;
      for (let i = 0; i < n; i++) {
        if (pin[i]) continue;
        const k = i * 3;
        for (let a = 0; a < 3; a++) { const v = (pos[k + a] - prev[k + a]) * 0.965; prev[k + a] = pos[k + a]; pos[k + a] += v; }
        pos[k + 2] += g;
      }
      // the ball pushes knots outward (only once it is inside this goal)
      const RC = 0.32, ballIn = b.inNet === net.side;   // knots are ~0.5 m apart, so the ball pushes a 0.32 m patch
      for (let it = 0; it < 4; it++) {
        if (ballIn) net.panels.forEach(pl => {
          const nx = pl.normal[0], ny = pl.normal[1], nz = pl.normal[2];
          for (let v = 1; v < pl.nv; v++) for (let u = 1; u < pl.nu; u++) {
            const k = pl.at(u, v) * 3, rx = pos[k] - b.x, ry = pos[k + 1] - b.y, rz = pos[k + 2] - b.z;
            const along = rx * nx + ry * ny + rz * nz, px = rx - along * nx, py = ry - along * ny, pz = rz - along * nz;
            const perp2 = px * px + py * py + pz * pz;
            if (perp2 < RC * RC) { const need = Math.sqrt(RC * RC - perp2); if (along < need) { const d = need - along; pos[k] += nx * d; pos[k + 1] += ny * d; pos[k + 2] += nz * d; } }
          }
        });
        for (let l = 0, r = 0; l < links.length; l += 2, r++) {
          const i = links[l], j = links[l + 1], a = i * 3, c = j * 3;
          const dx = pos[c] - pos[a], dy = pos[c + 1] - pos[a + 1], dz = pos[c + 2] - pos[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d <= rest[r] || d < 1e-6) continue;                 // a net only resists stretching
          const f = (d - rest[r]) / d, wi = pin[i] ? 0 : 1, wj = pin[j] ? 0 : 1, w = wi + wj; if (!w) continue;
          pos[a] += dx * f * wi / w; pos[a + 1] += dy * f * wi / w; pos[a + 2] += dz * f * wi / w;
          pos[c] -= dx * f * wj / w; pos[c + 1] -= dy * f * wj / w; pos[c + 2] -= dz * f * wj / w;
        }
      }
      for (let i = 0; i < n; i++) if (!pin[i] && pos[i * 3 + 2] < 0.02) pos[i * 3 + 2] = 0.02;   // rests on the grass
    });
  };

  /** Keeper save check — once per shot, when the ball enters the keeper's reach. */
  /** 0 for a keeper whose core stats average 90+, rising to 1 at 60: below 90 a keeper is beatable (shorter reach, slower reactions, fewer saves). */
  P.gkWeak = function (gk) {
    if (gk._weak == null) { const s = gk.card.sub; gk._weak = clamp((90 - ((s.gkDiving || 60) + (s.gkReflexes || 60) + (s.gkPositioning || 60) + (s.gkHandling || 60)) / 4) / 30, 0, 1); }
    return gk._weak;
  };
  P.checkSave = function () {
    const b = this.ball;
    if (!b.shot || b.shot.saveChecked) return;
    const gk = this.players.find(p => p.isGK && p.team !== b.shot.team);
    if (!gk) return;                                                       // testing ground without a keeper
    const s = gk.card.sub;
    const diving = gk.dive && gk.dive.t > gk.dive.react, weak = this.gkWeak(gk);
    const reach = -0.4 * weak + (gk.tr.has('stk') ? 0.25 : 0) + 1.5 + 1.5 * nrm(s.gkDiving) + 0.55 * (gk.pf['Far Reach'] || 0) + (diving ? 1.0 + 0.8 * nrm(s.gkDiving) : 0) + (b.shot && b.shot.fk ? 1.8 : 0) + (diving && b.z > 1.6 ? 0.6 : 0);   // v220 (JODIO): a high dive stretches further up into the top corners. v207: a free kick, set on his line: a fuller stretch. a full-stretch dive adds a body length
    if (dist(gk, b) > reach || b.z > GOAL_H + 0.4) return;
    b.shot.saveChecked = true;
    const sp = len(b.vx, b.vy);
    const shooterDist = dist(b.shot.by, gk);
    let p = 0.42 + (nrm(s.gkReflexes) - 0.62) * 1.4 - (sp - 22) / 32 + (gk.dive ? 0.1 - 0.12 * clamp(Math.abs(gk.dive.y - b.y) - 1, 0, 2) : -0.18);   // read the shot early and he gets a hand to it
    p -= 0.16 * weak;                                                         // below 90 a keeper is beatable
    if (this.tac[b.shot.team].hot > 1 && !this.ctlOf(b.shot.by)) p -= HOT_SAVE * (this.tac[b.shot.team].hot - 1);                   // Top 5 Leagues finishers beat keepers more often
    if (this.tac[b.shot.team].elite && !this.ctlOf(b.shot.by)) p -= 0.14;                  // League A1 finishers beat keepers far more often
    if (b.shot.bk) p -= 0.3;                                                  // an 85+ finisher in the box places it
    if (b.shot.fe) p -= 0.22 * b.shot.fe;                                     // v128 finisher edge
    if (b.shot.pen && gk.tr.has('pks')) p += 0.12;                           // penalty specialists
    if (shooterDist < 14) p += 0.1 * (gk.pf['Footwork'] || 0) + 0.06 * (gk.pf['1v1 Close Down'] || 0);
    if (b.trailType === 'power') p -= 0.08;
    if (b.trailType === 'finesse') p -= 0.05;
    // the physics-aware read: where the ball is against his reach, how fast it is, how it is spinning and how well it was struck
    const sh = b.shot, lat = Math.abs(b.y - gk.y), rr = lat / Math.max(0.5, reach);          // 0 = at his body, 1 = at the end of his fingertips
    const wide = Math.abs(b.y - PH2) > GOAL_HALF * 0.55, lowBall = b.z < 0.45;
    p -= 0.2 * clamp(rr - 0.45, 0, 1) * (0.6 + 0.4 * sp / 26);                           // a placed shot away from him
    if (wide && lowBall && gk.dive && Math.abs(gk.dive.y - b.y) > 1.2) p -= 0.1;         // low driven to the far post with him leaning the wrong way: nearly unsaveable
    p -= 0.07 * clamp(Math.abs(b.spin) / 0.8, 0, 1.5) * (1.1 - nrm(s.gkReflexes));          // swerve and dip are hard to read
    p -= 0.05 * clamp(Math.abs(b.tspin || 0), 0, 1) * (1.1 - nrm(s.gkReflexes));
    p -= 0.12 * ((sh.q == null ? 0.5 : sh.q) - 0.5);                                         // a cleanly struck ball is harder to stop
    if (sh.green) p -= 0.05;
    p += 0.05;
    if (sh.fk) p += 0.3;                                                                     // a free kick is seen coming: the keeper sets himself behind the wall
    if (sh.scuff) p += 0.1;                                                                  // a scuffed effort is slow and easy
    if (rr < 0.25 && sp < 16 && b.z < 1.6) p += 0.16 * (0.5 + nrm(s.gkHandling));            // a lazy central shot is swallowed
    if (this.tac[b.shot.team].gb > 1 && !this.ctlOf(b.shot.by)) p /= Math.pow(this.tac[b.shot.team].gb, 0.6);     // v120: Top 5 goal boost
    p *= 1.4;                                                                                // v188 (JODIO): keepers save 40% more
    const shoS = Math.max(b.shot.by.card.face && b.shot.by.card.face.sho || 0, b.shot.by.card.sub.finishing || 0);   // v197 (JODIO): 90+ shooters beat keepers far more often, more again with Finesse / Power Shot
    if (shoS >= 90) { const pfs = Math.max(b.shot.by.pf['Finesse Shot'] || 0, b.shot.by.pf['Power Shot'] || 0); p -= 0.32 + 0.05 * (shoS - 90) + 0.12 * pfs; }
    { const fx = b.shot.fx != null ? b.shot.fx : b.shot.by.x, gxl = this.teams[b.shot.team].dir > 0 ? PITCH_W : 0;      // v188 (JODIO): a low drive from far outside the box is saved
      if (lowBall && Math.abs(fx - gxl) > 22 && shoS < 90) p = Math.max(p, 0.97); }
    p = clamp(p, this.tac[b.shot.team].gb > 1 ? 0.01 : 0.1, 0.98);
    this.stats.onTarget[b.shot.team]++;
    this.ev('sot', b.shot.by, { team: b.shot.team });
    const saved = this.rng() < p; if (!saved) b.shot.beat = true;   // v197: a beaten keeper can't then just gather it with his body
    if (saved) {
      this.ev('save', gk, { by: b.shot.by });
      this.psIconAny(gk, [shooterDist < 14 && 'Footwork', shooterDist < 14 && '1v1 Close Down', b.z > 1.8 && 'Cross Claimer', 'Far Reach', 'Deflector'], 1.4);   // v166
      const catchP = (0.15 + 0.75 * nrm(s.gkHandling)) * clamp((30 - sp) / 12, 0, 1) * (rr < 0.55 ? 1 : 0.35) * (b.z > 2 ? 0.5 : 1);
      if (this.rng() < catchP) { this.giveBall(gk); this.say('SAFE HANDS!'); }
      else if (rr > 0.8 && this.rng() < 0.65) {
        // fingertip save: a nudge over the bar or round the post, for a corner
        const dir2 = this.teams[gk.team].dir, sd = Math.sign(b.y - gk.y) || 1;
        b.vx = -dir2 * (2 + this.rng() * 3); b.vy = sd * (3 + this.rng() * 3); b.vz = b.z > 1.4 || this.rng() < 0.5 ? 3 + this.rng() * 2.5 : 1; b.spin = 0; b.tspin = 0;
        b.last = gk; b.noPick = gk; b.noPickT = 0.3; b.trailType = null;
        this.say('FINGERTIP SAVE ' + gk.name + '!');
        this.fx({ type: 'text', x: gk.x, y: gk.y - 2, text: 'FINGERTIPS!', color: '#80ff80', life: 0.8 });
      }
      else if (b.z > 1.8) {
        // punch: the high ball is fisted clear, forward and out to the side
        const dir2 = this.teams[gk.team].dir, sd = Math.sign(b.y - PH2) || (this.rng() < 0.5 ? -1 : 1);
        b.vx = dir2 * (6 + this.rng() * 5) * (1 + 0.35 * (gk.pf['Cross Claimer'] || 0)); b.vy = sd * (4 + this.rng() * 5); b.vz = 4 + this.rng() * 3; b.spin = 0; b.tspin = 0;
        b.last = gk; b.noPick = gk; b.noPickT = 0.3; b.trailType = null;
        this.say('PUNCHED CLEAR!');
        this.fx({ type: 'text', x: gk.x, y: gk.y - 2, text: 'PUNCH!', color: '#80ff80', life: 0.8 });
      }
      else {
        // parry: good hands push it wide, away from the danger zone; poor ones spill it back into the box
        const dir = this.teams[gk.team].dir, h = nrm(s.gkHandling), side = Math.sign(b.y - gk.y) || (this.rng() < 0.5 ? -1 : 1);
        const wide = this.rng() < 0.35 + 0.55 * h + 0.3 * (gk.pf['Deflector'] || 0);
        b.vx = dir * (wide ? 1.5 + this.rng() * 3 : 4 + this.rng() * 5); b.vy = wide ? side * (7 + this.rng() * 6) * (1 + 0.3 * (gk.pf['Deflector'] || 0)) : (this.rng() - 0.5) * 12; b.vz = 2 + this.rng() * 2; b.spin = 0; b.tspin = 0;
        b.last = gk; b.noPick = gk; b.noPickT = 0.3; b.trailType = null;
        this.say('GREAT SAVE ' + gk.name + '!');
        this.fx({ type: 'text', x: gk.x, y: gk.y - 2, text: 'SAVE!', color: '#80ff80', life: 0.8 });
      }
      b.shot = null;
      gk.dive = null;
    }
  };

  /** How well a player wins a header, 0..1: height, jumping, strength and heading skill (cached per player). */
  P.aerial = function (p) {
    if (p._ae == null) { const s = p.card.sub, h = (p.card.details && p.card.details.height) || 180; p._ae = clamp(0.3 * clamp((h - 165) / 35, 0, 1) + 0.3 * nrm(s.jumping) + 0.25 * nrm(s.strength) + 0.15 * nrm(s.headingAccuracy), 0, 1); }
    return p._ae;
  };
  /**
   * v105 heading: while a ball is in the air, work out where it will come down to head height (2.4 m), and send the CLOSEST man of each team to that spot
   * (computer-controlled men run there). Only those men jump for it, timed so the jump peaks as the ball arrives; the duel is then settled by who is closest and
   * who is the better header. The keeper claims his own crosses as before.
   */
  P.aerialStep = function (dt) {
    const b = this.ball;
    if (this.training || b.owner || b.shot || (b.z < 0.9 && b.vz < 3)) { this._air = null; return; }
    let A = this._air;
    if (!A || this.t - A.t0 >= 0.05) {
      const dg = this.ballM.drag, mg = this.ballM.magnus, h = 0.05;
      let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, sp = b.spin, hit = null;
      if (z >= 0.9 && z <= 2.4) hit = { x, y, t: 0 };
      for (let t = 0; t < 3.2 && !hit; t += h) {
        const v = Math.sqrt(vx * vx + vy * vy + vz * vz), k = 0.0125 * dg * v;
        vx -= k * vx * h; vy -= k * vy * h; vz -= (9.81 + k * vz) * h;
        if (sp) { const a = sp * mg * h, c = Math.cos(a), sn = Math.sin(a), nx = vx * c - vy * sn; vy = vx * sn + vy * c; vx = nx; sp *= 1 - 0.5 * h; }
        x += vx * h; y += vy * h; z += vz * h;
        if (z <= 2.4 && vz < 0) hit = { x, y, t: t + h };
        if (z <= 0) break;
      }
      if (hit && (hit.x < -3 || hit.x > PITCH_W + 3 || hit.y < -3 || hit.y > PITCH_H + 3)) hit = null;
      A = this._air = { t0: this.t, hit, sel: new Set() };
      if (hit) {
        [0, 1].forEach(tm => {
          let best = null, bd = 1e9;
          this.players.forEach(p => {
            if (p.team !== tm || p.isGK || p.cool.stun > 0 || p.cool.slide > 0 || p.dummy) return;
            const d = Math.hypot(p.x - hit.x, p.y - hit.y);
            if (d < bd && d / ((p.sprintMax || 7) * 0.92) <= hit.t + 0.8) { bd = d; best = p; }
          });
          const gk = this.players.find(p => p.team === tm && p.isGK), og = this.teams[tm].dir > 0 ? 0 : PITCH_W;
          if (best && gk && Math.abs(hit.x - og) < 20 && Math.hypot(gk.x - hit.x, gk.y - hit.y) < bd) best = null;     // his keeper is nearer: he comes for it
          if (best) { A.sel.add(best); if (!this.ctlOf(best)) best._go = { x: hit.x, y: hit.y, until: this.t + 0.22 }; }
        });
      }
    }
    if (!A.hit) return;
    const left = A.hit.t - (this.t - A.t0);
    A.sel.forEach(p => {                                                                 // jump so that the peak of the leap meets the ball
      if (left <= 0.3 && left > -0.2 && p.cool.head <= 0 && Math.hypot(p.x - A.hit.x, p.y - A.hit.y) < 3.2 && b.z < 3.6) p.cool.head = 0.5;
    });
  };
  const fastAt2 = (b, p) => (b.passTo && b.passTo.p === p ? 24 + 12 * nrm(p.card.sub.ballControl || 60) : 15);
  P.checkPickup = function () {
    const b = this.ball;
    if (b.owner) return;
    let best = null, bd = 1e9;
    const sp = len(b.vx, b.vy), duel = [], air = this._air && this._air.hit ? this._air : null;
    this.players.forEach(p => {
      if (p === b.noPick || p.cool.stun > 0 || p.dummy === 'cone') return;
      if (b.shot && !p.isGK) {                                           // a struck shot flies through outfield players: no blocks, no bounces ... except a defender with the Block PlayStyle (v148)
        const bl = p.pf['Block'] || 0;
        if (bl && p.team !== b.shot.team && b.z < 1.6 && dist(p, b) < 0.8 + 1.0 * bl && !(b.shot.bl && b.shot.bl.has(p))) {
          (b.shot.bl || (b.shot.bl = new Set())).add(p);
          if (this.rng() < 0.2 + 0.3 * bl) { this.deflect(p, 0.35); this.fx({ type: 'text', x: p.x, y: p.y - 2, text: 'BLOCK!', color: '#7fb8ff', life: 0.7 }); this.psIcon(p, 'Block', 1.2); }
        }
        return;
      }
      const s = p.card.sub;
      let maxZ = p.isGK ? 2.7 : 1.5 + 0.6 * nrm(s.jumping) + 0.3 * (p.pf['Aerial Fortress'] || 0);
      const jumper = !p.isGK && (air ? air.sel.has(p) || (b.cross && dist(p, b) < 1.4) : !!b.cross);     // v105: the closest man of each side goes up for a high ball, the taller and stronger jump higher
      if (jumper && dist(p, b) < 4) {
        if (b.z < 3.4 && b.vz <= 0.6 && p.cool.head <= 0) p.cool.head = 0.45;
        maxZ += 0.5 + 0.6 * this.aerial(p);
      }
      if (b.z > maxZ) return;
      let r = 0.62 + 0.42 * nrm(((s.ballControl || 60) + (s.reactions || 60)) / 2) + 0.2 * (p.pf['First Touch'] || 0);
      { const reach = 0.38 * nrm(s.ballControl || 60); r += (b.shot ? 0 : (b.last && b.last.team !== p.team ? 0.25 : 1)) * reach; }   // full reach: good ball control gets a foot to a loose ball from further out (less against opponents' passes, none against shots)
      const fastAt = b.passTo && b.passTo.p === p ? 24 + 12 * nrm(s.ballControl || 60) : 15;   // a pass meant for him is played to be received; good touch tames a hard one
      if (sp > fastAt && !p.isGK) r *= clamp(1.3 - sp / 40, 0.6, 1);          // a fast ball is harder to reach out for
      const opp = b.last && b.last.team !== p.team;
      if (opp) {
        // cutting out a pass is hard: only a 90+ Interceptions player reads and reaches it like a specialist (Intercept+ counts as +20)
        const ic = clamp(((s.interceptions || 60) + 20 * (p.pf['Intercept'] || 0) - 60) / 30, 0, 1);
        if (b.passTo && b.passTo.p !== p && !b.shot) r *= (0.14 + 0.86 * ic * ic) * 0.9 * (1 + IC_PSC * (PSC - 1));
        r += 0.2 * ic; r *= 0.78;                                          // v184 (JODIO): shorter interception reach
        if (!p.isGK && sp > 3 && ((b.x - p.x) * b.vx + (b.y - p.y) * b.vy) > 0) return;   // v184: a ball already past him (moving away) can't be cut out from behind
        if (b.passTo && b.passTo.p !== p && !b.shot && b.passTo.hv && b.z > 0.5) r *= 0.6;   // v149: a lofted long ball from a human's power bar is much harder to cut out
      }
      if (p.isGK && Math.abs(b.x - (this.teams[p.team].dir > 0 ? 0 : PITCH_W)) < 17) r += 0.6;
      if (p.isGK && b.shot && b.shot.team !== p.team) r *= 1 - 0.45 * this.gkWeak(p);       // below 90 a keeper's body is not enough to stop it
      if (p.isGK && b.shot && b.shot.beat && b.shot.team !== p.team) return;                   // v197: the save roll already beat him
      if (p.cool.slide > 0) r += 0.5;
      if (b.shot && opp && !p.isGK) r *= 0.75;                            // a struck shot is hard to block
      const d = dist(p, b);
      if (jumper) r += 0.45;
      if (d < r) { duel.push(p); if (d < bd) { bd = d; best = p; } }
    });
    if (best && (b.cross || air) && b.z > 1.1 && duel.length > 1) {                 // aerial duel: the closest man to the ball with the better header (height, jumping, strength) wins it
      let bs = -1; duel.forEach(q => { const sc = this.aerial(q) + this.rng() * 0.18 - 0.06 * dist(q, b) + (air && air.sel.has(q) ? 0.08 : 0); if (sc > bs) { bs = sc; best = q; } });
      duel.forEach(q => { if (q !== best) { q.cool.stun = Math.max(q.cool.stun, 0.25); q.cool.head = Math.max(q.cool.head, 0.45); } });
    }
    if (!best) { this.bodyHits(); return; }
    const p = best;
    // a shot on goal can't be "picked up" by the goalkeeper here; checkSave handles keepers
    if (b.shot && p.isGK && p.team !== b.shot.team && !b.shot.saveChecked) return;
    const opp = b.last && b.last.team !== p.team;
    // fast balls may squirm loose depending on control
    if (sp > fastAt2(this.ball, p) && !p.isGK) {      // a fast ball: control it, or it bounces off the body
      const ctrl = nrm(((p.card.sub.ballControl || 60) + (p.card.sub.reactions || 60)) / 2);
      if (this.rng() > clamp(0.2 + 0.78 * ctrl + 0.12 * (p.pf['First Touch'] || 0) - (sp - fastAt2(this.ball, p)) / 45, 0.12, 0.96)) { this.deflect(p, 0.35); return; }
    }
    if (p.cool.slide > 0 && opp) { // a slide that meets a loose ball pokes it on
      this.kick(p, p.fx * 8, p.fy * 8, 0, 0, null); return;
    }
    if (this.offsideList && this.offsideList.includes(p) && !opp) { // active involvement → offside
      this.offsideList = []; this.event('OFFSIDE ' + p.card.name, 'offside');
      this.fx({ type: 'offside', x: p.x, life: 1.2 });
      this.freeKick(1 - p.team, p.x, p.y, true); return;
    }
    if (opp && !(b.last && b.last.isGK)) this.offsideList = [];
    if ((b.cross || air) && b.z > 1.1 && !p.isGK && opp && !this.training) {         // a defender wins the header: he heads it clear
      b.cross = null; const dp = this.teams[p.team].dir, ang = Math.atan2((p.y < PH2 ? -1 : 1) * 0.55, dp), v = 15 + 8 * this.aerial(p);
      this.kick(p, Math.cos(ang) * v, Math.sin(ang) * v, 5, 0, null); p.cool.head = 0.5; this.say(p.name + ' HEADS IT CLEAR'); this.psIcon(p, 'Aerial Fortress', 'ball'); this.ctls.forEach(c => { if (c) c.pendingReceiver = null; }); return;
    }
    if (!p.isGK && !b.shot && !this.training) {                        // a finisher meets the ball in the box: strike it first time
      const ctl = this.ctlOf(p);
      if (ctl && ctl.arm && ctl.arm.until > this.t) { const a = ctl.arm; ctl.arm = null; this.firstTime(p, a.aim, 0.8, true); return; }
      if (!ctl && !opp && this.aiFirstTime(p, sp)) return;
    }
    if (opp && (p.pf['Intercept'] || 0) && b.last && !b.last.isGK) this.psIcon(p, 'Intercept', 1.2);
    else if (!opp && sp > 12) this.psIcon(p, 'First Touch', 1.0);   // v166: a hard ball tamed
    if (opp && b.shot && p.isGK === false) this.say('BLOCKED!');
    if (!p.isGK) { if (b.z > 1.35) p.cool.head = 0.5; else if (sp > 3 && !opp) { p.cool.trap = 0.4; p.trapZ = b.z; } }   // v181: trapZ picks chest / thigh / foot control
    this.giveBall(p);
    // settle the ball first: good control (and smart players) get their head up sooner
    const settle = Math.max(0.06, (0.16 - 0.08 * nrm(p.card.sub.ballControl)) * (1 - 0.6 * (p.pf['First Touch'] || 0))) + this.rng() * 0.12;
    p.cool.look = Math.max(p.cool.look, settle);
    p.cool.decide = Math.max(p.cool.decide, (0.35 - 0.15 * (p.pf['First Touch'] || 0)) + this.rng() * 0.4);
    this.ctls.forEach(c => { if (c) c.pendingReceiver = null; });
  };

  /** A ball that nobody controls still can't pass through bodies: it hits legs, chest or head and bounces off. */
  P.bodyHits = function () {
    const b = this.ball;
    if (len(b.vx, b.vy) < 4 || b.shot) return;
    for (const p of this.players) {
      if (p === b.noPick || p.cool.stun > 0.5) continue;
      if (b.z > (p.cool.slide > 0 ? 0.6 : 1.85)) continue;
      if (dist(p, b) < BODY_R + BALL_R) { this.deflect(p, 0.3); return; }
    }
  };
  /** Bounce the ball off a player's body (a vertical cylinder): where it hits decides the new flight. */
  P.deflect = function (p, e) {
    const b = this.ball, d = dist(p, b) || 1, nx = (b.x - p.x) / d, ny = (b.y - p.y) / d;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
    b.vx *= 0.72; b.vy *= 0.72;                                                   // the body soaks up energy
    if (b.z > 1.45) b.vz = Math.abs(b.vz) * 0.4 + 2.5 + this.rng() * 2;          // off the head: loops up
    else if (b.z > 0.8) b.vz = 0.6 + this.rng();                                  // off the chest: drops
    else b.vz = Math.abs(b.vz) * 0.3;                                             // off the legs: stays low
    b.x = p.x + nx * (BODY_R + BALL_R + 0.02); b.y = p.y + ny * (BODY_R + BALL_R + 0.02);
    if (b.shot && b.shot.team !== p.team && !p.isGK) { this.say('BLOCKED!'); b.shot = null; }
    b.last = p; b.noPick = p; b.noPickT = 0.18; b.trailType = null; b.passTo = null;
  };

  P.checkBounds = function () {
    const b = this.ball;
    if (b.owner) return;
    const lastTeam = b.last ? b.last.team : 0;
    if (b.x < 0 || b.x > PITCH_W) {
      const leftSide = b.x < 0;
      if (Math.abs(b.y - PH2) < GOAL_HALF && b.z < GOAL_H && b.indirect && b.last === b.indirect) {
        this.say('INDIRECT - NO GOAL'); b.indirect = null; this.restart(leftSide ? 0 : 1, leftSide ? 5.5 : PITCH_W - 5.5, PH2, 'GOAL KICK'); return;
      }
      if (Math.abs(b.y - PH2) < GOAL_HALF && b.z < GOAL_H) {
        const scorer = leftSide ? 1 : 0; // home attacks the right goal (x = 105)
        this.goal(scorer);
        return;
      }
      if (b.shot && Math.abs(b.y - PH2) < GOAL_HALF + 4) this.say('JUST WIDE!');
      const defTeam = leftSide ? 0 : 1;
      if (lastTeam === defTeam) this.restart(1 - defTeam, leftSide ? 0.5 : PITCH_W - 0.5, b.y < PH2 ? 0.5 : PITCH_H - 0.5, 'CORNER');
      else this.restart(defTeam, leftSide ? 5.5 : PITCH_W - 5.5, PH2 + (b.y < PH2 ? -6 : 6), 'GOAL KICK');
      return;
    }
    if (b.y < 0 || b.y > PITCH_H) this.restart(1 - lastTeam, b.x, b.y < 0 ? 0.5 : PITCH_H - 0.5, 'THROW IN');
  };

  /* ----------------------- referee: fouls, cards ------------------------ */
  P.inBox = function (pt, defTeam) { const gx = defTeam === 0 ? 0 : PITCH_W; return Math.abs(pt.x - gx) < 16.5 && Math.abs(pt.y - PH2) < 20.16; };
  P.isLastMan = function (def, car) {
    const gx = def.team === 0 ? 0 : PITCH_W;
    return !this.players.some(o => o.team === def.team && o !== def && !o.isGK && Math.abs(o.x - gx) < Math.abs(car.x - gx));
  };
  P.card = function (p, color, why) {
    if (color === 'yellow') { p.yellows = (p.yellows || 0) + 1; if (p.yellows >= 2) { color = 'red'; why = 'second yellow'; } }
    this.event((color === 'red' ? 'RED CARD ' : 'YELLOW CARD ') + p.card.name + ' (' + why + ')', color);
    this.fx({ type: 'card', x: p.x, y: p.y, color: color === 'red' ? '#ff2a2a' : '#ffe600', life: 1.6 });
    this.stoppage += 0.4;
    if (color === 'red') { // ejection: player leaves the pitch
      p.sentOff = true; this.players = this.players.filter(q => q !== p);
      if (p.isGK) { const ng = this.players.filter(q => q.team === p.team).sort((a, b) => a.slot - b.slot)[0]; if (ng) { ng.isGK = true; ng.slot = 0; } }
      this.ctls.forEach(c => { if (c && c.controlled === p) c.controlled = null; });
    }
  };
  /** Foul → advantage / free kick / penalty, with card logic (incl. DOGSO). */
  P.foul = function (def, car, kind) {
    if (this.training) { car.cool.stun = Math.max(car.cool.stun, 0.6); this.say('FOUL - PLAY ON (no free kicks here)'); return; }
    this.stoppage += 0.25; def.fouls = (def.fouls || 0) + 1;
    this.stats.fouls = this.stats.fouls || [0, 0]; this.stats.fouls[def.team]++;
    this.ev('foul', def, { car });
    car.cool.stun = Math.max(car.cool.stun, 0.6);
    const box = this.inBox(car, def.team);
    const gx = def.team === 0 ? 0 : PITCH_W;
    const dogso = this.isLastMan(def, car) && Math.abs(car.x - gx) < 32 && (car.vx * (gx - car.x)) > 0;
    const violent = (def.card.sub.aggression || 60) > 82 && this.rng() < 0.03;
    if (violent) this.card(def, 'red', 'violent conduct');
    else if (dogso && !box) this.card(def, 'red', 'DOGSO, last man');
    else if (dogso && box) this.card(def, this.rng() < 0.15 ? 'red' : 'yellow', 'DOGSO in the box'); // double jeopardy: yellow when playing the ball
    else if (kind === 'slide from behind' || kind === 'reckless slide') this.card(def, 'yellow', kind);
    else if (def.tr.has('hot') && this.rng() < 0.18) this.card(def, 'yellow', 'temper');
    else if (def.fouls >= 3) this.card(def, 'yellow', 'persistent fouling');
    else if (len(car.vx, car.vy) > 6 && (car.vx * (gx - car.x)) > 0 && Math.abs(car.x - PW2) < 30) this.card(def, 'yellow', 'stopping a fast break');
    if (box) { this.event('PENALTY! ' + def.name + ' fouls ' + car.name, 'penalty'); this.penalty(car.team); return; }
    // advantage: fouled team keeps clean possession and momentum → play on for 2.5s
    if (this.ball.owner && this.ball.owner.team === car.team && this.ball.owner !== car) {
      this.advantage = { team: car.team, x: car.x, y: car.y, t: 2.5, startX: this.ball.x };
      this.say('ADVANTAGE!'); return;
    }
    this.event('FOUL by ' + def.name + ' (' + kind + ')', 'foul');
    this.freeKick(car.team, car.x, car.y, false);
  };
  P.freeKick = function (team, x, y, indirect) {
    this.restart(team, x, y, indirect ? 'INDIRECT FREE KICK' : 'FREE KICK');
    this.ball.indirect = indirect ? this.ball.owner : null;
    // wall: opponents at least 9.15m from the ball
    this.players.forEach(o => { if (o.team !== team) { const d = dist(o, this.ball); if (d < 9.15) { const a = Math.atan2(o.y - this.ball.y, o.x - this.ball.x); o.x = this.ball.x + Math.cos(a) * 9.2; o.y = this.ball.y + Math.sin(a) * 9.2; } } });
  };
  P.penalty = function (team) {
    const dir = this.teams[team].dir, sx = dir > 0 ? PITCH_W - 11 : 11, gx = dir > 0 ? PITCH_W : 0;
    const penScore = p => p.card.sub.penalties + (p.tr.has('pen') ? 25 : 0) + (p.tr.has('clu') ? 4 : 0);
    const taker = this.players.filter(p => p.team === team && !p.isGK).sort((a, b) => penScore(b) - penScore(a))[0];
    this.players.forEach(p => { if (p === taker || p.isGK) return; if (Math.abs(p.x - gx) < 20) p.x = gx - dir * 21; });
    const gk = this.players.find(p => p.isGK && p.team !== team);
    if (gk) { gk.x = gx - dir * 0.3; gk.y = PH2; gk.dive = null; } // GK on the line until the ball is struck
    Object.assign(this.ball, { x: sx, y: PH2, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, shot: null, trail: [], inNet: null });
    taker.x = sx - dir * 1; taker.y = PH2; this.giveBall(taker); taker.cool.decide = 0;
    this.penaltyKick = true; this.phase = 'restart'; this.phaseT = 1.2; this.noOffside = true; this.sp = null;
  };
  /** Offside snapshot at the instant of a pass: attackers past the ball AND the second-last defender. */
  P.offsideSnapshot = function (passer) {
    if (this.cfg.duel) { this.offsideList = []; return; }                                // 1v1 duel: no offside
    if (this.noOffside) { this.noOffside = false; this.offsideList = []; return; } // none from goal kick / corner / throw-in
    const dir = this.teams[passer.team].dir, gx = dir > 0 ? PITCH_W : 0;
    const defs = this.players.filter(p => p.team !== passer.team).map(p => Math.abs(gx - p.x)).sort((a, b) => a - b);
    const secondLast = defs.length > 1 ? defs[1] : 0;
    const bodyMargin = 0.25; // any playable part of the body
    this.offsideList = this.players.filter(p => p.team === passer.team && p !== passer &&
      (p.x - PW2) * dir > 0 &&                          // opponent half
      Math.abs(gx - p.x) + bodyMargin < secondLast &&    // past second-last defender
      Math.abs(gx - p.x) < Math.abs(gx - this.ball.x));  // past the ball
  };

  P.goal = function (team) {
    this.score[team]++;
    if (this.cfg.onGoal && !this.headless) this.cfg.onGoal(team, this.score.slice());   // screen side effects only (fees, tickers); never touches the sim
    const sh = this.ball.last && this.ball.last.team === team ? this.ball.last : null;
    this.ev('goal', sh, { team });
    this.event('GOAL! ' + (sh ? sh.card.name : this.teams[team].name) + ' ' + this.score.join('-'), 'goal');
    this.stoppage += 0.6;
    this.goalFlash = 2.2; this.goalTeam = team;
    const sig = sh && RUT.DB.signatureFor(sh.card);
    this.celebration = sh ? { p: sh, sig, t: 0, ct: 0, run: true, flag: null } : null;
    if (sig) { this.say(sig.celebration + '!'); this.goalFlash = 3.2; }
    this.fx({ type: 'shake', life: 0.5 });
    this.phase = 'goal'; this.phaseT = this.headless ? 0 : this.training ? 2.6 : 3.6 + (sig ? 1.4 : 0) + (sh ? Math.min(7, Math.hypot((this.teams[team].dir > 0 ? PITCH_W : 0) - sh.x, (sh.y < PH2 ? 0 : PITCH_H) - sh.y) / 7.5) : 0); this._gT = this.phaseT; this.kickTeam = 1 - team;   // run to the corner flag, celebrate, then the replay
    this.ball.owner = null; this.ball.inNet = this.ball.x > PITCH_W / 2 ? 1 : 0; this.ball.shot = null;
  };

  /** ABAB penalty shootout: 5 rounds, then sudden death. */
  P.shootout = function () {
    const takers = [0, 1].map(t => this.players.filter(p => p.team === t && !p.isGK).sort((a, b) => (b.card.sub.penalties + (b.tr.has('pen') ? 25 : 0)) - (a.card.sub.penalties + (a.tr.has('pen') ? 25 : 0))));
    const gks = [0, 1].map(t => this.players.find(p => p.team === t && p.isGK));
    const sc = [0, 0], kicks = [[], []];
    for (let r = 0; r < 30; r++) {
      for (const t of [0, 1]) {
        const k = takers[t][r % takers[t].length], g = gks[1 - t];
        const pScore = clamp(0.76 + (k.card.sub.penalties - 80) / 100 - ((g ? g.card.sub.gkReflexes : 60) - 80) / 160, 0.5, 0.93);
        const ok = this.rng() < pScore; kicks[t].push(ok); if (ok) sc[t]++;
        const left = n => Math.max(0, 5 - n);
        if (r < 5 && (sc[0] + left(kicks[0].length) < sc[1] || sc[1] + left(kicks[1].length) < sc[0])) return { sc, kicks };
      }
      if (r >= 4 && sc[0] !== sc[1]) return { sc, kicks };
    }
    return { sc, kicks };
  };

  P.finish = function () {
    if (this.cfg.knockout && this.score[0] === this.score[1] && !this.pens) {
      const penEv = () => this.event('PENALTIES ' + this.pens.sc.join('-') + ' ' + this.pens.kicks.map(k => k.map(x => (x ? 'O' : 'X')).join('')).join(' / '), 'pens');
      if (this.cfg.penAsk && !this._penAsked) {          // v136: the human takes the shootout kicks (or picks the keeper's dive); main.js shows the kick screen, then hands the result back
        this._penAsked = true; this.over = true; this.phase = 'pens';
        this.cfg.penAsk(this, pens => { this.pens = pens; penEv(); this.finish(); });
        return;
      }
      this.pens = this.shootout(); penEv();
    }
    this.over = true; this.phase = 'end';
    this.say('FULL TIME');
    this.event('Full time ' + this.score.join('-'), 'whistle');
    const tot = this.stats.possession[0] + this.stats.possession[1] || 1;
    if (this.rec && this.rec.mode === 'rec') this.rec.ticks = this.tk;
    this.result = {
      rs: this.rs, tk: this.tk, players: (this.players.forEach(q => { const id = q.team + '|' + q.card.name; if (!this.pstat[id]) this.pstat[id] = { n: q.card.name, t: q.team, pos: q.fpos || q.card.position, ovr: q.card.rating, id: q.card.id }; }), Object.values(this.pstat)),
      score: this.score.slice(), events: this.events, teams: this.teams.map(t => t.name),
      stats: Object.assign({}, this.stats, { possession: [Math.round(this.stats.possession[0] / tot * 100), Math.round(this.stats.possession[1] / tot * 100)] }),
      pens: this.pens ? this.pens.sc : null, scout: this.learn ? this.scoutProfile(this.learn[1] ? 0 : 1) : null, learnLog: this.learn ? (this.learn[0] || this.learn[1]).log : null,
      won: this.score[0] > this.score[1] || (this.pens && this.pens.sc[0] > this.pens.sc[1]), draw: this.score[0] === this.score[1] && !this.pens,
    };
    if (this.cfg.onEnd) this.cfg.onEnd(this.result);
  };

  /* =============================== RENDER ================================ */
  /*
   * "2.5D" pixel renderer. Everything is still flat 2D pixel art, but it is
   * drawn through a broadcast-style perspective camera (Mode-7 technique):
   *   - the pitch is a flat texture, resampled one screen row at a time so it
   *     shrinks into the distance;
   *   - the stands are flat pixel billboards stood up around the pitch, drawn
   *     column by column at their real depth;
   *   - players are small pixel sprites, scaled by depth and depth-sorted;
   *   - the ball and the goal frames use a real height (z) axis, with ground
   *     shadows that separate from the ball as it rises.
   * The match simulation is unchanged: it still works on the 2D top-down pitch.
   */
  // Three cameras. TV is the broadcast view from JODIO's reference shot: a high gantry camera ~34 m up and ~95 m
  // back, about 47 m of pitch across the middle of the screen and players near true scale. WIDE is the closer
  // high view, CLOSE the zoomed-in arcade view. Actor sizes divide by ZOOM; FY = how much the camera follows the ball up/down.
  const CAMS = {
    tv: { F: 850, H: 36, BACK: 97, ROW: 128, Z: 2.4, FY: 0.5 },
    wide: { F: 400, H: 26, BACK: 40, ROW: 150, Z: 1.55, FY: 0.7 },
    close: { F: 380 * 1.8, H: 16, BACK: 45, ROW: 165, Z: 1.8, FY: 0.7 },
  };
  const CAM_ORDER = ['tv', 'wide', 'close'];
  // Graphics: canvas resolution (share of 1080 lines) per preset. Auto starts high and steps down by itself when frames run long.
  const GFX_Q = { ultra: 1440 / 1080, '3d': 1, high: 1, med: 0.67, low: 0.5, potato: 0.34 }, Q_STEPS = [1, 0.83, 0.67, 0.5, 0.34];
  const GFX_ORDER = ['3d'];   // v167 (JODIO): full 3D only (the 2D looks stay only as the fallback when the browser has no WebGL)
  let ZOOM, CAM_F, CAM_H, CAM_HOR, CAM_BACK, CAM_FY;
  function useCam(mode) { const c = CAMS[mode] || CAMS.tv; ZOOM = c.Z; CAM_F = c.F; CAM_H = c.H; CAM_BACK = c.BACK; CAM_FY = c.FY; CAM_HOR = c.ROW + VOFF - c.H * c.F / c.BACK; }
  useCam('tv');
  const GPPM = 24;         // ground texture pixels per metre
  const GMX = 12, GMY_FAR = 6, GMY_NEAR = 12; // ground margins around the pitch (m)
  const STAND_H = 16, SPPM = 12; // stand height (m) and stand texture pixels per metre
  const BOARD_COLS = ['#ffd800', '#00a0ff', '#ff3060', '#ffffff', '#30e070', '#ff8a00'];

  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = s => clamp(Math.round(f >= 0 ? s + (255 - s) * f : s * (1 + f)), 0, 255);
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch).map(v => v.toString(16).padStart(2, '0')).join('');
  };

  const GFX = { ground: null, standsFar: null, standsEnd: null, sprite: null, faces: {} };

  function buildGround() {
    const W = (PITCH_W + GMX * 2) * GPPM, H = (PITCH_H + GMY_FAR + GMY_NEAR) * GPPM;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = RUT.DB.rng(99), K = GPPM / 8;
    const X = m => Math.round((m + GMX) * GPPM), Y = m => Math.round((m + GMY_FAR) * GPPM);
    // surround: concrete + seats beyond the run-off
    g.fillStyle = '#2a2a3a'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3 * K) for (let x = 0; x < W; x += 3 * K) if (r() < 0.5) { g.fillStyle = ['#3a3050', '#4a2a3a', '#2a3a5a'][Math.floor(r() * 3)]; g.fillRect(x, y, 2 * K, 2 * K); }
    // run-off turf
    g.fillStyle = '#4a7a38'; g.fillRect(X(-5), Y(-4), (PITCH_W + 10) * GPPM, (PITCH_H + 8) * GPPM);
    // mowing pattern: broad stripes across the length, soft natural greens like a TV pitch
    for (let i = 0; i < 15; i++) {
      g.fillStyle = i % 2 ? '#6f9c4c' : '#628e43';
      g.fillRect(X(i * PITCH_W / 15), Y(0), Math.ceil(PITCH_W / 15 * GPPM), PITCH_H * GPPM);
    }
    for (let j = 0; j < 8; j++) if (j % 2) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(X(0), Y(j * PITCH_H / 8), PITCH_W * GPPM, Math.ceil(PITCH_H / 8 * GPPM)); }
    // grass grain (dithered pixels)
    for (let k = 0; k < 16000 * K * K; k++) { g.fillStyle = r() < 0.5 ? 'rgba(20,50,10,0.10)' : 'rgba(255,255,220,0.07)'; g.fillRect(X(-5) + Math.floor(r() * (PITCH_W + 10) * GPPM), Y(-4) + Math.floor(r() * (PITCH_H + 8) * GPPM), K, K); }
    // pitch markings (2 texels thick so they survive perspective resampling)
    g.fillStyle = '#f4f4f4';
    const T = Math.round(1.5 * K), T2 = T >> 1;
    const hline = (x1, x2, y) => g.fillRect(X(x1), Y(y) - T2, X(x2) - X(x1) + T, T);
    const vline = (x, y1, y2) => g.fillRect(X(x) - T2, Y(y1), T, Y(y2) - Y(y1) + T);
    const rect = (x, y, w, h) => { hline(x, x + w, y); hline(x, x + w, y + h); vline(x, y, y + h); vline(x + w, y, y + h); };
    const arc = (cx, cy, rad, a0, a1) => { const n = Math.ceil(rad * GPPM * 7); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; g.fillRect(X(cx + Math.cos(a) * rad) - T2, Y(cy + Math.sin(a) * rad) - T2, T, T); } };
    rect(0, 0, PITCH_W, PITCH_H);
    vline(PITCH_W / 2, 0, PITCH_H);
    arc(PW2, PH2, 9.15, 0, Math.PI * 2);
    g.fillRect(X(PW2) - 2 * K, Y(PH2) - 2 * K, 4 * K, 4 * K);
    [0, 1].forEach(side => {
      rect(side ? PITCH_W - 16.5 : 0, PH2 - 20.16, 16.5, 40.32);
      rect(side ? PITCH_W - 5.5 : 0, PH2 - 9.16, 5.5, 18.32);
      const spot = side ? PITCH_W - 11 : 11;
      g.fillRect(X(spot) - 2 * K, Y(PH2) - 2 * K, 4 * K, 4 * K);
      const a = Math.acos(5.5 / 9.15);
      if (side) arc(spot, PH2, 9.15, Math.PI - a, Math.PI + a); else arc(spot, PH2, 9.15, -a, a);
    });
    [[0, 0, 0], [PITCH_W, 0, Math.PI / 2], [PITCH_W, PITCH_H, Math.PI], [0, PITCH_H, -Math.PI / 2]].forEach(([x, y, a]) => arc(x, y, 1, a, a + Math.PI / 2));
    // worn goalmouths
    [0, PITCH_W - 6].forEach(x0 => { for (let k = 0; k < 500 * K * K; k++) { g.fillStyle = 'rgba(120,90,50,0.18)'; g.fillRect(X(x0 + r() * 6), Y(PH2 - 4 + r() * 8), 2 * K, 2 * K); } });
    return c;
  }

  /** A stand billboard: tiers of pixel fans, aisles, a front wall and a roof. Two frames so the crowd can bounce. */
  function buildStands(widthM, seed) {
    const W = Math.round(widthM * 4), H = STAND_H * 4, UP = 3;
    const frames = [0, 1].map(frame => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const r = RUT.DB.rng(seed);
      // structure
      g.fillStyle = '#141428'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#2b2b46'; g.fillRect(0, 0, W, 8);                  // roof
      g.fillStyle = '#4a4a6a'; g.fillRect(0, 8, W, 1);
      for (let x = 0; x < W; x += 24) { g.fillStyle = '#0a0a18'; g.fillRect(x, 0, 2, 8); }
      g.fillStyle = '#20203a'; g.fillRect(0, 34, W, 4);                 // tier balcony with LED ribbon
      for (let x = 0; x < W; x += 6) { g.fillStyle = BOARD_COLS[(x / 6) % BOARD_COLS.length | 0]; g.fillRect(x, 35, 5, 2); }
      g.fillStyle = '#1a1a2e'; g.fillRect(0, H - 5, W, 5);              // front wall
      // fans: 2x3 pixel people with a coloured shirt and a head (muted under the floodlights)
      const shirts = ['#b04048', '#4058b0', '#c8c8d0', '#c8a840', '#3c9058', '#c06890', '#7a48b0', '#c87830'];
      const skins = ['#d8ac70', '#b07840', '#7a4a22', '#e8c49a', '#c89860'];
      [[10, 33, 0.72], [39, H - 6, 1]].forEach(([y0, y1, lit]) => {
        for (let y = y0; y < y1; y += 4) for (let x = 0; x < W; x += 3) {
          if ((x % 48) < 3) continue;                                       // aisle
          if (r() < 0.14) continue;                                         // empty seat
          const jump = frame && r() < 0.5 ? -1 : 0;
          g.globalAlpha = lit;
          g.fillStyle = shirts[Math.floor(r() * shirts.length)]; g.fillRect(x, y + 1 + jump, 2, 2);
          g.fillStyle = skins[Math.floor(r() * skins.length)]; g.fillRect(x, y + jump, 2, 1);
          if (frame && r() < 0.2) { g.fillStyle = '#ffffff'; g.fillRect(x + 1, y - 1 + jump, 1, 1); } // waving
          g.globalAlpha = 1;
        }
      });
      // shading: darker under the roof
      const grd = g.createLinearGradient(0, 9, 0, 26); grd.addColorStop(0, 'rgba(0,0,0,0.6)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 9, W, 17);
      const up = document.createElement('canvas'); up.width = W * UP; up.height = H * UP;   // soft, not blocky
      const ug = up.getContext('2d'); ug.imageSmoothingEnabled = true; ug.imageSmoothingQuality = 'high'; ug.drawImage(c, 0, 0, W * UP, H * UP);
      return up;
    });
    return frames;
  }

  P.setGfx = function (mode) { this.gfx = GFX_Q[mode] ? mode : 'auto'; if (this.gfx !== '3d' && this._u3) { try { this._u3.dispose(); } catch (err) { /* gone */ } this._u3 = null; } if (this.gfx !== 'auto') this._q = GFX_Q[this.gfx]; try { localStorage.setItem('rut_gfx', this.gfx); } catch (e) {} if (this.gfx === '3d') RUT.load3D(); return this.gfx; };
  /** v151: the three.js renderer is only downloaded when Full 3D is chosen. */
  RUT.load3D = function () {
    if (RUT.Render3D || RUT._l3) return RUT._l3;
    const add = src => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
    return (RUT._l3 = add('js/three.min.js').then(() => add('js/render3d.js')).catch(e => { RUT._l3 = null; if (window.console) console.warn('3D renderer failed to load', e); }));
  };
  P.nextGfx = function () { return this.setGfx(GFX_ORDER[(GFX_ORDER.indexOf(this.gfx) + 1) % GFX_ORDER.length]); };
  P.nextCamera = function () { this.camMode = CAM_ORDER[(CAM_ORDER.indexOf(this.camMode) + 1) % CAM_ORDER.length]; return this.camMode; };

  /** Ultra graphics: draw the match with the WebGL renderer, then the pixel HUD on top. Returns false when 3D is unavailable (the pixel view at 1440 lines is used). */
  const ULTRA_WEBGL = false;                 // the WebGL character view is parked: Ultra keeps the same look as High, just at 1440 lines with finer detail
  P.ultraDraw = function (ctx, camX, shake, crowdFrame, CW, CH) {
    const R3 = RUT.Render3D;
    if (!R3 || this._u3Fail || !R3.supported()) return false;
    try {
      if (!this._u3 || this._u3.ground !== GFX.ground) {
        if (this._u3) this._u3.dispose();
        this._u3 = R3.create({ W: PITCH_W, H: PITCH_H, ground: GFX.ground, standsFar: GFX.standsFar, standsEnd: GFX.standsEnd, GMX, GMY_FAR, GMY_NEAR, STAND_H, GOAL_HALF, GOAL_H, NET_DEPTH, NET_TOP_BACK, BOARD_COLS });
      }
      const U = this._u3, now = performance.now(), dt = clamp((now - (this._u3t || now)) / 1000, 0, 0.1); this._u3t = now;
      // too heavy for this machine? after a couple of seconds of slow frames drop to High so the game stays playable
      this._u3n = (this._u3n || 0) + 1; this._u3sum = (this._u3sum || 0) + dt;
      if (this._u3n >= 150) { const av = this._u3sum / this._u3n, u = this._u3scale || 0.9; if (av > 0.024 && !window.RUT_KEEP3D && u > 0.5) this._u3scale = Math.max(0.5, u * 0.85); else if (av < 0.0175 && u < 0.9) this._u3scale = Math.min(0.9, u / 0.9); this._u3n = this._u3sum = 0; }   // v167: slow machine: fewer pixels, still full 3D
      U.frame(this, { w: CW, h: CH, mode: this.camMode, camX, camY: this.cam.y, fy: CAM_FY, shake, crowd: crowdFrame, dt, sprites: true, spCam: this.spCamera() });   // v171: the 3D world, players drawn below as the normal-mode pixel sprites
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(U.canvas, 0, 0, CW, CH); ctx.restore();
      const proj = (x, y, z) => U.proj(x, y, z, VIEW_W, VIEW_H);
      this.proj = proj; this._cv = ctx.canvas;
      this.drawGroundFx(ctx, proj); this.drawFcGround(ctx, proj);
      // v171 (JODIO: "the players look the same as normal mode, with the better 3D physics"): soft shadows, then the pixel players and the ball, far to near
      this.players.forEach(p => { const ro = this.runOff(p), s = proj(p.x + (ro ? ro.x : 0) + 0.25 / ZOOM, p.y + (ro ? ro.y : 0), 0), a = s.k / ZOOM * PLAYER_BIG * this._sizeOf(p); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s.x + 0.4 * a, s.y, 0.62 * a, 0.2 * a, 0, 0, Math.PI * 2); ctx.fill(); });
      { const kOf = (x, y) => proj(x, y, 0).k;   // v185: sorted by distance to the camera (the set-piece camera looks down the pitch, not across it)
        const items = this.players.map(p => { const ro = this.runOff(p); return { y: kOf(p.x + (ro ? ro.x : 0), p.y + (ro ? ro.y : 0)), draw: () => this.drawPlayer3D(ctx, p, proj) }; });   // v177: the ball joins the depth sort so a player never hides it
        { const bp = this.ballDrawPos(); items.push({ y: kOf(bp.x, bp.y) * 1.002, draw: () => this.drawBall3D(ctx, this.ball, proj) }); }
        this.trWallItems(ctx, proj, kOf).forEach(it => items.push(it)); items.sort((a, c) => a.y - c.y).forEach(it => it.draw()); }
      const b = this.ball, tc = { shot: '#ffffff' }[b.trailType];
      if (tc) b.trail.forEach((q, i) => { const s = proj(q.x, q.y, q.z + 0.11); ctx.globalAlpha = i / b.trail.length * 0.8; ctx.fillStyle = tc; const w = Math.max(2, Math.round(0.25 * s.k / ZOOM)); ctx.fillRect(Math.round(s.x - w / 2), Math.round(s.y - w / 2), w, w); });
      ctx.globalAlpha = 1;
      this.drawOverlay(ctx, proj, false);
      return true;
    } catch (e) {
      if (window.console) console.warn('Ultra 3D failed, using the pixel view', e);
      this._u3Fail = true; try { this._u3 && this._u3.dispose(); } catch (e2) { /* gone */ } this._u3 = null;
      return false;
    }
  };

  /* The Mode-7 ground drawn on the GPU: one WebGL pass instead of ~700 drawImage strips per frame. Same projection maths as the strip loop
   * (which stays as the fallback); the ground texture is uploaded once per pitch and mip-mapped so the far rows filter cleanly. */
  P.groundGL = function (ctx, G, a) {
    let S = this._gg;
    if (S === false) return false;
    try {
      if (!S) {
        const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
        const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
        if (!gl || Math.max(G.width, G.height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) { this._gg = false; return false; }
        const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
        const pr = gl.createProgram();
        gl.attachShader(pr, sh(gl.VERTEX_SHADER, '#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'));
        gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSize, uTexSize;
uniform float uSC, uOx, uOy, uHor, uK, uF, uVW, uCamX, uCamY, uGMX, uGMYF, uGPPM, uStart;
out vec4 o;
void main(){
  float row = uSize.y - gl_FragCoord.y;
  float t = row / uSC - uOy - uHor;
  float d = uK / max(t, 0.0001);
  float wy = uCamY - d;
  float halfW = (uVW * 0.5) * d / uF;
  float left = uCamX - halfW - uOx * d / uF;
  float wx = left + (gl_FragCoord.x / uSize.x) * 2.0 * halfW;
  vec2 sp = vec2((wx + uGMX) * uGPPM, (wy + uGMYF) * uGPPM);
  vec4 c = texture(uTex, sp / uTexSize);
  if (row < uStart || t <= 0.0 || sp.x < 0.0 || sp.y < 0.0 || sp.x >= uTexSize.x || sp.y >= uTexSize.y) discard;
  o = vec4(c.rgb, 1.0);
}`));
        gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, G);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        const U = {}; ['uTex', 'uSize', 'uTexSize', 'uSC', 'uOx', 'uOy', 'uHor', 'uK', 'uF', 'uVW', 'uCamX', 'uCamY', 'uGMX', 'uGMYF', 'uGPPM', 'uStart'].forEach(n => { U[n] = gl.getUniformLocation(pr, n); });
        S = this._gg = { cv, gl, pr, tex, U, G, vao: gl.createVertexArray() };
        cv.addEventListener('webglcontextlost', e => { e.preventDefault(); this._gg = null; });
      }
      if (S.G !== G) { this._gg = null; return this.groundGL(ctx, G, a); }
      const { cv, gl, U } = S;
      if (cv.width !== a.CW || cv.height !== a.CH) { cv.width = a.CW; cv.height = a.CH; }
      // v105: only the rows below the horizon hold ground: scissor the pass to them and copy just that block (the sky rows were transparent anyway)
      const gy0 = Math.min(a.CH - 1, Math.max(0, Math.ceil((a.hor + 1) * a.SC))), gh = a.CH - gy0;
      gl.viewport(0, 0, a.CW, a.CH); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, a.CW, gh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(S.pr); gl.bindVertexArray(S.vao); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex);
      gl.uniform1i(U.uTex, 0); gl.uniform2f(U.uSize, a.CW, a.CH); gl.uniform2f(U.uTexSize, G.width, G.height);
      gl.uniform1f(U.uSC, a.SC); gl.uniform1f(U.uOx, a.ox); gl.uniform1f(U.uOy, a.oy); gl.uniform1f(U.uHor, a.hor); gl.uniform1f(U.uK, a.K); gl.uniform1f(U.uF, a.F);
      gl.uniform1f(U.uVW, a.VW); gl.uniform1f(U.uCamX, a.camX); gl.uniform1f(U.uCamY, a.camY); gl.uniform1f(U.uGMX, GMX); gl.uniform1f(U.uGMYF, GMY_FAR); gl.uniform1f(U.uGPPM, GPPM);
      gl.uniform1f(U.uStart, Math.max(0, Math.ceil((a.hor + 1) * a.SC)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, 0, gy0, a.CW, gh, 0, gy0, a.CW, gh); ctx.restore();
      return true;
    } catch (err) { this._gg = false; return false; }
  };
  P.render = function (ctx) {
    if (!GFX.ground) {
      GFX.ground = buildGround();
      GFX.standsFar = buildStands(PITCH_W + GMX * 2, 7);
      GFX.standsEnd = buildStands(PITCH_H + GMY_FAR + GMY_NEAR, 11);
      GFX.sprite = document.createElement('canvas'); GFX.sprite.width = 32; GFX.sprite.height = 40;
    }
    useCam(this.camMode);
    const b = this.ball;
    // ---- camera: follows the ball, leads it a little
    const ft = this.phase === 'goal' && this.celebration ? this.celebration.p : b;   // after a goal the camera follows the scorer to the corner
    this.cam.x += (ft.x + (ft.vx || 0) * 0.35 - this.cam.x) * 0.08;
    this.cam.y += (ft.y - this.cam.y) * 0.06;
    const camX = clamp(this.cam.x, 12, PITCH_W - 12);
    const camY = this.cam.y * CAM_FY + PH2 * (1 - CAM_FY) + CAM_BACK;
    let shake = 0; this.effects.forEach(e => { if (e.type === 'shake') shake = 2; });
    const ox = shake ? Math.round((Math.random() - 0.5) * shake * 2) : 0, oy = shake ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
    const proj = (wx, wy, wz) => {
      const d = Math.max(4, camY - wy), k = CAM_F / d;
      return { x: VIEW_W / 2 + (wx - camX) * k + ox, y: CAM_HOR + CAM_H * k - (wz || 0) * k + oy, k };
    };
    this.proj = proj; this._cv = ctx.canvas;
    // full screen: the drawing space follows the window's aspect (4:3 up to ultra-wide) at 1080 lines (times the adaptive quality)
    if (this.gfx !== 'auto') this._q = GFX_Q[this.gfx] * (this.gfx === '3d' ? (this._u3scale || 0.9) : 1);   // v200: 3D starts at 90% resolution (972 lines), smoothing hides it
    const LQ = this._q || 1, lite = LQ <= 0.85, lite2 = LQ <= 0.5, lite3 = LQ <= 0.35;      // cheaper drawing on weak machines
    { const PX = RUT.PixelArt; if (PX && PX.setHD && PX.isHD() === lite) PX.setHD(!lite); }                                       // HD sprites (more parts, 1.4x supersampled) unless the machine is struggling
    { const cv = ctx.canvas, asp = cv.clientWidth > 50 && cv.clientHeight > 50 ? cv.clientWidth / cv.clientHeight : 4 / 3, q = this._q || 1;
      VIEW_W = clamp(Math.round(VIEW_H * asp), 360, 840);     // portrait phones get a square view, letterboxed by the canvas (object-fit)
      { const c = CAMS[this.camMode] || CAMS.tv, f = Math.min(1, VIEW_W / 480); CAM_F = c.F * f; CAM_HOR = c.ROW + VOFF - c.H * CAM_F / c.BACK; }   // a narrow view pulls the camera back so the same width of pitch stays visible
      const wantW = Math.round(VIEW_W * 3 * q), wantH = Math.round(OUT_H * q);
      if (cv.width !== wantW || cv.height !== wantH) { cv.width = wantW; cv.height = wantH; } }
    const CW = ctx.canvas.width, CH = ctx.canvas.height; SC = CH / VIEW_H;
    ctx.setTransform(SC, 0, 0, SC, 0, 0);
    ctx.imageSmoothingEnabled = !lite3; ctx.imageSmoothingQuality = lite ? 'low' : 'high';
    const crowdFrame = (this.phase === 'goal' || this.goalFlash > 0) ? (Math.floor(this.t * 8) % 2) : (Math.floor(this.t * 1.5) % 7 === 0 ? 1 : 0);
    if (this.gfx === '3d' && this.ultraDraw(ctx, camX, !!shake, crowdFrame, CW, CH)) return;       // Ultra: the real 3D renderer (js/render3d.js) at 1440 lines

    // ---- sky
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H * 0.6);
    sky.addColorStop(0, '#070a22'); sky.addColorStop(1, '#3a2458');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // ---- far stand (a wall at the far edge of the ground)
    const far = proj(-GMX, -GMY_FAR, 0), farR = proj(PITCH_W + GMX, -GMY_FAR, 0);
    ctx.drawImage(GFX.standsFar[crowdFrame], Math.round(far.x), Math.round(far.y - STAND_H * far.k), Math.round(farR.x - far.x), Math.round(STAND_H * far.k));
    // floodlight towers on the far roof
    [-6, 30, 75, 111].forEach(lx => {
      const q = proj(lx, -GMY_FAR, STAND_H + 6), base = proj(lx, -GMY_FAR, STAND_H);
      ctx.fillStyle = '#30304a'; ctx.fillRect(Math.round(q.x), Math.round(q.y), Math.max(1, Math.round(q.k * 0.4)), Math.round(base.y - q.y));
      ctx.fillStyle = '#fffbe0'; ctx.fillRect(Math.round(q.x - q.k * 1.2), Math.round(q.y - q.k), Math.round(q.k * 2.8), Math.round(q.k * 1.2));
      if (!lite) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, q.k * 9);
      glow.addColorStop(0, 'rgba(255,250,210,0.55)'); glow.addColorStop(1, 'rgba(255,250,210,0)');
      ctx.fillStyle = glow; ctx.fillRect(q.x - q.k * 9, q.y - q.k * 9, q.k * 18, q.k * 18);
      ctx.restore(); }
    });

    // ---- end stands (walls along the goal lines), drawn far → near column by column
    const endTex = GFX.standsEnd[crowdFrame], endW = endTex.width;
    [-GMX, PITCH_W + GMX].forEach(wx => {
      const step = lite ? 0.5 : LQ > 1.2 ? 0.1 : 0.2;
      for (let wy = -GMY_FAR; wy < PITCH_H + GMY_NEAR; wy += step) {
        const a = proj(wx, wy, 0), c2 = proj(wx, wy + step, 0);
        const x0 = Math.min(a.x, c2.x), w = Math.abs(c2.x - a.x) + 1;
        if (x0 > VIEW_W || x0 + w < 0) continue;
        const sx0 = Math.floor((wy + GMY_FAR) * SPPM);
        const flip = wx > 0 ? sx0 : endW - 1 - sx0;
        ctx.drawImage(endTex, clamp(flip, 0, endW - 1), 0, 1, endTex.height, Math.floor(x0), Math.round(a.y - STAND_H * a.k), Math.ceil(w), Math.round(STAND_H * a.k));
      }
    });

    // ---- ground: Mode-7 style, one screen row at a time
    const G = GFX.ground;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);          // one device row at a time, exact 720p
    const RS = lite2 ? 2 : 1;                                  // lite: two device rows per strip
    const onGPU = this.groundGL(ctx, G, { CW, CH, SC, ox, oy, hor: CAM_HOR, K: CAM_H * CAM_F, F: CAM_F, VW: VIEW_W, camX, camY });
    for (let dyp = onGPU ? CH : Math.max(0, Math.ceil((CAM_HOR + 1) * SC)); dyp < CH; dyp += RS) {
      const rowD = (y) => CAM_H * CAM_F / (y / SC - oy + 0.5 / SC - CAM_HOR);
      const d = rowD(dyp), wy = camY - d;
      if (wy < -GMY_FAR) continue;
      const srcY = (wy + GMY_FAR) * GPPM;
      if (srcY >= G.height) break;
      const srcH = clamp((rowD(dyp + RS) - d) * GPPM, 1, 8);
      const halfW = (VIEW_W / 2) * d / CAM_F;
      const left = camX - halfW - ox * d / CAM_F;
      let srcX = (left + GMX) * GPPM, srcW = halfW * 2 * GPPM, dx = 0, dw = CW;
      if (srcX < 0) { const cut = -srcX; dx = cut / srcW * CW; dw -= dx; srcW -= cut; srcX = 0; }
      if (srcX + srcW > G.width) { const cut = srcX + srcW - G.width; dw -= cut / (halfW * 2 * GPPM) * CW; srcW -= cut; }
      if (srcW <= 0 || dw <= 0) continue;
      ctx.drawImage(G, srcX, Math.min(srcY, G.height - srcH), srcW, srcH, dx, dyp, dw, RS);
    }
    ctx.restore();
    // distance haze + floodlight warmth
    if (!lite) {
      const haze = ctx.createLinearGradient(0, Math.max(0, far.y - 10), 0, VIEW_H);
      haze.addColorStop(0, 'rgba(120,110,170,0.28)'); haze.addColorStop(0.5, 'rgba(120,110,170,0.06)'); haze.addColorStop(1, 'rgba(255,240,200,0.05)');
      ctx.fillStyle = haze; ctx.fillRect(0, Math.max(0, far.y - 10), VIEW_W, VIEW_H);
    }

    // ---- advertising boards (vertical billboards standing on the ground)
    const boardSeg = (x1, y1, x2, y2, col) => {
      const a = proj(x1, y1, 0), c2 = proj(x2, y2, 0), a1 = proj(x1, y1, 0.9), c1 = proj(x2, y2, 0.9);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(a1.x, a1.y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.min(a.x, c2.x), Math.min(a.y, c2.y) - 1, Math.abs(c2.x - a.x), 1);
    };
    for (let i = 0, x = -5; x < PITCH_W + 5; x += 6, i++) boardSeg(x, -3.5, x + 5.8, -3.5, BOARD_COLS[i % BOARD_COLS.length]);
    for (let i = 0, y = -3.5; y < PITCH_H + 3.5; y += 6, i++) { boardSeg(-4, y, -4, y + 5.8, BOARD_COLS[(i + 2) % BOARD_COLS.length]); boardSeg(PITCH_W + 4, y, PITCH_W + 4, y + 5.8, BOARD_COLS[(i + 4) % BOARD_COLS.length]); }

    // ---- ground-level effects: Pinged+ lasers, rings, offside line, Rapid+ trails, shadows
    this.drawGroundFx(ctx, proj);
    this.drawFcGround(ctx, proj);
    this.players.forEach(p => p.trail.forEach(q => {
      const s = proj(q.x, q.y, 0);
      ctx.globalAlpha = (1 - q.t / q.life) * 0.55; ctx.fillStyle = '#ffe600';
      const ak = s.k / ZOOM; ctx.fillRect(Math.round(s.x - 0.3 * ak), Math.round(s.y - 1.7 * ak), Math.max(2, Math.round(0.6 * ak)), Math.round(1.7 * ak));
    }));
    ctx.globalAlpha = 1;
    // soft elliptical shadows (floodlights, so they fall slightly right)
    this.players.forEach(p => { const ro = this.runOff(p), s = proj(p.x + (ro ? ro.x : 0) + 0.25 / ZOOM, p.y + (ro ? ro.y : 0), 0), a = s.k / ZOOM * PLAYER_BIG * this._sizeOf(p); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s.x + 0.4 * a, s.y, 0.62 * a, 0.2 * a, 0, 0, Math.PI * 2); ctx.fill(); });
    { const bp = this.ballDrawPos(), s = proj(bp.x, bp.y, 0), w = Math.max(1.5, 0.3 * s.k / ZOOM * ACTOR_BIG * BALL_BIG / (1 + b.z * 0.25)); ctx.fillStyle = 'rgba(0,0,0,' + (0.4 / (1 + b.z * 0.3)) + ')'; ctx.beginPath(); ctx.ellipse(s.x, s.y, w, w * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }

    // ---- depth-sorted 3D objects: players, ball, goal frames (far → near)
    const items = this.players.map(p => ({ y: p.y, draw: () => this.drawPlayer3D(ctx, p, proj) }));
    items.push({ y: b.y + 0.01, draw: () => this.drawBall3D(ctx, b, proj) });
    [0, 1].forEach(side => {
      items.push({ y: PH2 - GOAL_HALF - 0.05, draw: () => this.drawGoal3D(ctx, side, proj, 'back') });
      items.push({ y: PH2 + GOAL_HALF + 0.05, draw: () => this.drawGoal3D(ctx, side, proj, 'front') });
    });
    items.sort((a, c) => a.y - c.y).forEach(it => it.draw());

    // ball trail (Finesse cyan curve / Power red streak / Pinged laser / Trivela purple)
    const tc = { shot: '#ffffff' }[b.trailType];
    if (tc) b.trail.forEach((q, i) => { const s = proj(q.x, q.y, q.z + 0.11); ctx.globalAlpha = i / b.trail.length * 0.8; ctx.fillStyle = tc; const w = Math.max(2, Math.round(0.25 * s.k / ZOOM)); ctx.fillRect(Math.round(s.x - w / 2), Math.round(s.y - w / 2), w, w); });
    ctx.globalAlpha = 1;

    this.drawOverlay(ctx, proj, lite);
  };

  { const render0 = P.render;
    P.render = function (ctx) {                                                         // during a replay, draw the recorded frame (blended between snapshots) instead of the live players
      if (this.phase !== 'replay' || !this._rp) return render0.call(this, ctx);
      const n = this._rp.length, i = Math.min(n - 1, Math.floor(this._rpT * 30)), k = Math.min(1, this._rpT * 30 - i), f = this._rp[i], g = this._rp[Math.min(n - 1, i + 1)];
      const ps = f.ps.map((p, j) => { const q = Object.assign({}, p), r = g.ps[j]; q.x = p.x + (r.x - p.x) * k; q.y = p.y + (r.y - p.y) * k; return q; });
      const bq = Object.assign({}, f.b); bq.x += (g.b.x - f.b.x) * k; bq.y += (g.b.y - f.b.y) * k; bq.z += (g.b.z - f.b.z) * k; bq.owner = f.b.owner ? ps[f.ps.indexOf(f.b.owner)] : null;
      const rp = this.players, rb = this.ball; this.players = ps; this.ball = bq;
      try { return render0.call(this, ctx); } finally { this.players = rp; this.ball = rb; }
    };
  }

  /** Everything drawn over the scene in screen space: floating effects, celebration, vignette, radar and the HUD. */
  P.drawOverlay = function (ctx, proj, lite) {
    const b = this.ball;
    // ---- v166: PlayStyle+ logos ride over the heads of the players using them, smaller than before, in the colours of their card
    if (RUT.PSIcon && this.phase !== 'replay') for (const p of this.players) {
      const o = p.psOn; if (!o) continue;
      const age = this.t - o.t0, fade = o.off != null ? Math.max(0, 1 - (this.t - o.off) / 0.3) : 1, pop = Math.min(1, age * 8);
      const s = proj(p.x, p.y, 3.0 + Math.sin(age * 5) * 0.06), sz = Math.max(12, Math.round(s.k * 1.7 / ZOOM * (0.7 + 0.3 * pop)));
      if (!p._psTint) { const c = p.card || {}; p._psTint = c.rarity === 'evo' ? 'evo' : c.promo || (c.cl ? 'clpromo' : c.rarity) || 'gold'; }
      ctx.globalAlpha = fade; ctx.drawImage(RUT.PSIcon.canvas(o.name, true, p._psTint), Math.round(s.x - sz / 2), Math.round(s.y - sz), sz, sz); ctx.globalAlpha = 1;
    }
    // ---- floating effects: dust, text, cards
    this.effects.forEach(e => {
      const a = 1 - e.t / e.life;
      if (e.type === 'dust') { const s = proj(e.x, e.y, e.t * 1.5); ctx.fillStyle = 'rgba(220,220,200,' + a * 0.7 + ')'; ctx.fillRect(Math.round(s.x + e.t * 6), Math.round(s.y), Math.max(2, Math.round(s.k * 0.3 / ZOOM)), Math.max(2, Math.round(s.k * 0.3 / ZOOM))); }
      if (e.type === 'text') { const s = proj(e.x, e.y + 2, 2.4 + e.t * 1.5); this.pixelText(ctx, e.text, Math.round(s.x), Math.round(s.y), e.color, 'center', a); }
      if (e.type === 'card') { const s = proj(e.x, e.y, 2.6); const h = Math.min(1, e.t * 6); const w = Math.max(5, Math.round(s.k * 0.9 / ZOOM)), hh = Math.round(w * 1.4 * h); ctx.fillStyle = '#000'; ctx.fillRect(Math.round(s.x + s.k * 0.4 / ZOOM) - 1, Math.round(s.y - hh) - 1, w + 2, hh + 2); ctx.fillStyle = e.color; ctx.fillRect(Math.round(s.x + s.k * 0.4 / ZOOM), Math.round(s.y - hh), w, hh); }
    });

    this.ctls.forEach(c => {                                                   // the aim arrow while SHOOT is held
      if (!c || c.hold !== 'shoot' || !c.controlled || b.owner !== c.controlled || this.assist !== 'manual') return;
      const p = c.controlled, dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, gy = PH2 + c.aim * (GOAL_HALF - 0.55);
      const L = 1.5, ux = (gx - p.x) / (len(gx - p.x, gy - p.y) || 1), uy = (gy - p.y) / (len(gx - p.x, gy - p.y) || 1);
      const tipZ = 0.4 + 2.4 * c.charge, col = Math.abs(c.aim) > 1 ? '#ff9020' : 'hsl(' + Math.round(50 - 50 * c.charge) + ',100%,55%)', N = 12;
      const px = [], gp = [];
      for (let i = 0; i <= N; i++) { const f = i / N, wx = p.x + ux * L * f, wy = p.y + uy * L * f; px.push(proj(wx, wy, 0.3)); gp.push(proj(wx, wy, 0)); }
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); gp.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); px.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
      const e = px[N], q = px[N - 1], an = Math.atan2(e.y - q.y, e.x - q.x), hs = 3.5;
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(e.x + Math.cos(an) * hs, e.y + Math.sin(an) * hs); ctx.lineTo(e.x + Math.cos(an + 2.5) * hs, e.y + Math.sin(an + 2.5) * hs); ctx.lineTo(e.x + Math.cos(an - 2.5) * hs, e.y + Math.sin(an - 2.5) * hs); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    this.drawCelebration(ctx, proj);
    if (this.phase === 'replay') {                                                      // cinema bars + label
      ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, VIEW_W, 16); ctx.fillRect(0, VIEW_H - 16, VIEW_W, 16);
      this.pixelText(ctx, 'REPLAY', 40, 28, Math.floor(this.t * 2) % 2 ? '#ff4040' : '#ffffff', 'center', 1, 9);
      if (!this.net) this.pixelText(ctx, 'PRESS ANY BUTTON TO SKIP', VIEW_W / 2, VIEW_H - 8, '#aaaaaa', 'center', 1, 5);
    }
    // vignette
    if (!GFX.vignette) {                                  // painted once at output size
      const vc = document.createElement('canvas'); vc.width = OUT_W; vc.height = OUT_H; const vx = vc.getContext('2d');
      const vg = vx.createRadialGradient(OUT_W / 2, OUT_H / 2, OUT_H * 0.45, OUT_W / 2, OUT_H / 2, OUT_W * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
      vx.fillStyle = vg; vx.fillRect(0, 0, OUT_W, OUT_H); GFX.vignette = vc;
    }
    if (!lite) ctx.drawImage(GFX.vignette, 0, 0, VIEW_W, VIEW_H);
    this.drawRadar(ctx);
    this.drawHUD(ctx);
  };

  /** Lasers, rings and the offside line drawn on the pitch (screen space, through `proj`). */
  P.drawGroundFx = function (ctx, proj) {
    this.effects.forEach(e => {
      const a = 1 - e.t / e.life;
      if (e.type === 'laser') {
        const p1 = proj(e.x1, e.y1, 0.2), p2 = proj(e.x2, e.y2, 0.2);
        ctx.strokeStyle = 'rgba(120,255,255,' + a + ')'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      if (e.type === 'ring') { const q = proj(e.x, e.y, 0); ctx.strokeStyle = e.color; ctx.globalAlpha = a; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(q.x, q.y, (0.5 + e.t * 4) * q.k, (0.5 + e.t * 4) * q.k * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.type === 'offside') { const p1 = proj(e.x, 0, 0), p2 = proj(e.x, PITCH_H, 0); ctx.strokeStyle = 'rgba(255,60,60,' + a + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); this.pixelText(ctx, 'OFFSIDE', Math.round(p1.x) + 3, Math.max(24, Math.round(p1.y) - 12), '#ff6060', 'left', a); }
    });
  };


  /** The power bar under the controlled player: fill colour by action, green sweet zone for shots, white tick = ideal pass weight. */
  P.drawPowerBar = function (ctx, p, c, cx, y) {
    const big = c.hold === 'shoot', W = big ? 40 : 26, H = big ? 6 : 4, x = Math.round(cx - W / 2);
    const col = { shoot: '#ff4040', pass: '#40c8ff', through: '#c070ff', lob: '#ffd040' }[c.hold];
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, W + 2, H + 2);
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(x, y, W, H);
    if (c.hold === 'shoot') { const z = this.shotZone(p); ctx.fillStyle = 'rgba(80,255,80,0.55)'; ctx.fillRect(x + Math.round(z.lo * W), y, Math.max(1, Math.round((z.hi - z.lo) * W)), H); }
    ctx.fillStyle = col; ctx.fillRect(x, y + 1, Math.round(W * c.charge), H - 2);
    const ideal = this.barIdeal(p, c);
    if (ideal != null) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.round(ideal * W), y - 1, 1, H + 2); }
    this.pixelText(ctx, { shoot: 'SHOT', pass: 'PASS', through: 'THRU', lob: 'LOB' }[c.hold], cx, y + H + 2, col, 'center', 1, 5);
  };

  /** Timed finishing: a marker runs to the contact line at the right end; a second SHOOT press inside the green window green-hits the strike. */
  P.drawStrikeBar = function (ctx, p, c, cx, y) {
    const k = c.strike, W = 26, H = 4, x = Math.round(cx - W / 2), AS = ASSIST[this.assist];
    const u = clamp(k.t / k.T, 0, 1), gw = Math.max(2, Math.round(W * AS.win / k.T));
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, W + 2, H + 2);
    ctx.fillStyle = '#2a2a3a'; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = 'rgba(80,255,80,0.7)'; ctx.fillRect(x + W - gw, y, gw, H);
    ctx.fillStyle = k.press != null ? '#ffe14a' : '#ffffff'; ctx.fillRect(x + Math.round((k.press != null ? clamp(k.press / k.T, 0, 1) : u) * (W - 1)), y - 1, 1, H + 2);
    this.pixelText(ctx, 'TIME IT', cx, y + H + 2, '#40ff90', 'center', 1, 5);
  };

  /** Player = the shared pixel figure (js/pixelart.js, same art as the cards), scaled by depth so the pixels stay chunky. */
  /** On-screen size from the body: height (cm) with a little for strength, so a 195 cm target man towers over a 168 cm winger. */
  P._sizeOf = function (p) {
    if (p._size) return p._size;
    const h = (p.card.details && p.card.details.height) || 180, st = (p.card.sub && p.card.sub.strength) || 60;
    return (p._size = clamp(0.9 + 0.2 * clamp((h - 165) / 35, 0, 1) + 0.04 * (nrm(st) - 0.5), 0.88, 1.12));
  };
  /** The animation a player is in right now ({ anim, t }): shared by the pixel sprites and the Ultra 3D models. */
  P.animOf = function (p) {
    const PA = RUT.PixelArt;
    const cel = this.phase === 'goal' && this.celebration && this.celebration.p === p ? this.celebration : null;
    const team = this.phase === 'goal' && this.goalTeam === p.team && !cel;
    const sp = len(p.vx, p.vy), cc = this.ctlOf(p);
    // pick the animation: real gait cycles by speed, dribble on the ball, pass / shot kicks, celebrations
    let anim = 'idle', t = (this.t * 0.45 + (p.slot + p.team * 11) * 0.17) % 1;
    if (p._runUp) { anim = 'jog'; t = (this.t * 2.6) % 1; }
    else if (p.cool.slide > 0) { anim = 'slide'; t = 1 - p.cool.slide / 0.8; }
    else if (p.cool.stun > 0.5) anim = 'down';
    else if (p.skill) { anim = p.skill.kind + (p.skill.side < 0 && p.skill.kind !== 'knock' ? '_m' : ''); t = clamp(p.skill.t / p.skill.dur, 0, 1); }
    else if (p.cool.stun > 0.05) { anim = 'stumble'; t = (this.t * 2.2) % 1; }
    else if (p.tackleT > 0) { anim = 'tackle'; t = 1 - p.tackleT / 0.4; }
    else if (cel && !cel.run && cel.sig && cel.sig.aura === 'lightning') anim = 'cross';
    else if (cel ? !cel.run : (team && sp < 1.2)) {
      anim = 'up'; t = (this.t * 1.7 + (p.slot + p.team * 11) * 0.23) % 1;
      if (cel) {                                              // the scorer: a star's own celebration, otherwise one picked from his name
        const star = p._look.star, pick = star ? star.celeb : ['wide', 'slide', 'sky', 'kneel', 'dance', 'bow', 'siu', 'med'][((RUT.DB.hashStr(p.card.name) >>> 0) + this.score[0] * 3 + this.score[1] * 5) % 8];
        const ct = cel.ct || 0;
        if (pick === 'cross') anim = 'cross';
        else if (pick !== 'up') {
          anim = 'celeb_' + pick;
          t = pick === 'siu' ? clamp(ct / 1.7, 0, 1) : pick === 'slide' || pick === 'bow' ? clamp(ct / 1.6, 0, 1) : (ct * (pick === 'dance' ? 0.9 : 0.5)) % 1;
        }
      }
    }
    else if (p.dvT != null) { anim = p.dvHi ? 'dive_hi' : 'dive_lo'; t = clamp(p.dvT / 1.7, 0, 1); }
    else if (p.cool.head > 0) { anim = 'header'; t = 1 - p.cool.head / 0.5; }
    else if (p.cool.volley > 0) { anim = 'volley'; t = 1 - p.cool.volley / 0.45; }
    else if (p.cool.kick > 0) { anim = p.kickType === 'shot' || p.kickType === 'drive' ? 'shot' : p.kickType === 'chip' ? 'chip' : 'pass'; t = 0.42 + 0.58 * (1 - p.cool.kick / 0.35); }   // the ball leaves at contact, then the follow-through
    else if (cc && cc.strike && this.ball.owner === p) { anim = 'shot'; t = 0.05 + 0.3 * clamp(cc.strike.t / cc.strike.T, 0, 1); }
    else if (cc && cc.hold === 'shoot' && this.ball.owner === p && cc.wd < 2.3) { anim = 'walk'; t = p.gait || 0; }   // walking up to the shot while aiming
    else if (cc && cc.hold && this.ball.owner === p) { anim = cc.hold === 'shoot' ? 'shot' : 'pass'; t = 0.05 + 0.3 * cc.charge; }  // wind-up while charging
    else if (p.cool.trap > 0 && (p.trapZ || 0) > 0.85) { anim = 'chest'; t = 1 - p.cool.trap / 0.4; }
    else if (p.cool.trap > 0 && (p.trapZ || 0) > 0.35) { anim = 'thigh'; t = 1 - p.cool.trap / 0.4; }
    else if (p.cool.trap > 0 && sp < 5) { anim = 'trap'; t = 1 - p.cool.trap / 0.4; }
    else if (p.cool.trap > 0) { anim = 'touch'; t = 1 - p.cool.trap / 0.4; }          // a first touch on the move
    else if (this.bodyAnim(p, sp)) { anim = p._body; t = (this.t * 1.6 + p.slot * 0.13) % 1; }   // v181: shielding and bodying when two players are shoulder to shoulder
    else if (sp > 0.6) {
      t = p.gait || 0;
      anim = this.ball.owner === p ? 'dribble' : sp < 2.4 ? 'walk' : (p.sprinting && sp > p.jogMax * 0.92) ? 'sprint' : 'jog';
    } else anim = PA.idleFor(p.isGK ? 'GK' : p.card.position);   // a stance for the position (keeper crouch, CB arms crossed, ...)
    return { anim, t };
  };

  /** v181: the carrier shields when a defender is tight on him, and that defender leans in with his shoulder (FC-style physical duels). */
  P.bodyAnim = function (p, sp) {
    const o = this.ball.owner; p._body = null;
    if (!o || p.isGK || this.phase !== 'play' || sp > 6.5) return false;
    if (o === p) { for (const q of this.players) if (q.team !== p.team && !q.isGK && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 2.6) { p._body = 'shield'; return true; } return false; }
    if (o.team !== p.team && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 2.0) { p._body = 'jostle'; return true; }
    return false;
  };
  /** v188: the Testing Ground wall drawn as four pixel defenders in the opponents' kit (they jump as the ball is struck). */
  P.trWallItems = function (ctx, proj, kOf) {
    const w = this.trWall; if (!w) return [];
    const PA = RUT.PixelArt; if (!w.look) w.look = PA.lookFor('Wall Man', this.teams[1].kit, false, 1, { club: this.teams[1].club });
    const out = [], jt = w.jumpT == null ? 0 : clamp((this.t - w.jumpT) / 0.6, 0, 1), hop = Math.sin(jt * Math.PI) * 0.5;
    const yaw = Math.atan2(-w.uy, -w.ux);
    for (let i = 0; i < w.n; i++) {
      const o = (i - (w.n - 1) / 2) * w.w, x = w.x - w.uy * o, y = w.y + w.ux * o;
      out.push({ y: kOf(x, y), draw: () => { const s = proj(x, y, hop), sc = Math.min(s.k / ZOOM / 12.5 * PLAYER_BIG * SC, 4); const c = PA.sprite(w.look, jt > 0 && jt < 1 ? 'header' : 'idle_cb', jt, Math.PI / 2 - yaw, sc);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, Math.round(s.x * SC - c.ox), Math.round(s.y * SC - c.oy)); ctx.restore(); } });
    }
    return out;
  };
  P.drawPlayer3D = function (ctx, p, proj) {
    const PA = RUT.PixelArt;
    const kit = this.teams[p.team].kit;
    if (!p._look || p._lookKit !== kit) {
      const T = this.teams[p.team];
      p._look = PA.lookFor(p.card.name, kit, p.isGK, p.team, { club: T.club, number: p.card.details && p.card.details.number, strength: p.card.sub.strength });
      p._lookKit = kit;
    }
    const cel = this.phase === 'goal' && this.celebration && this.celebration.p === p ? this.celebration : null;
    const team = this.phase === 'goal' && this.goalTeam === p.team && !cel;
    const sp = len(p.vx, p.vy), cc = this.ctlOf(p);
    // pick the animation: real gait cycles by speed, dribble on the ball, pass / shot kicks, celebrations
    let anim = 'idle', t = (this.t * 0.45 + (p.slot + p.team * 11) * 0.17) % 1;
    if (p._runUp) { anim = 'jog'; t = (this.t * 2.6) % 1; }
    else if (p.cool.slide > 0) { anim = 'slide'; t = 1 - p.cool.slide / 0.8; }
    else if (p.cool.stun > 0.5) anim = 'down';
    else if (p.skill) { anim = p.skill.kind + (p.skill.side < 0 && p.skill.kind !== 'knock' ? '_m' : ''); t = clamp(p.skill.t / p.skill.dur, 0, 1); }
    else if (p.cool.stun > 0.05) { anim = 'stumble'; t = (this.t * 2.2) % 1; }
    else if (p.tackleT > 0) { anim = 'tackle'; t = 1 - p.tackleT / 0.4; }
    else if (cel && !cel.run && cel.sig && cel.sig.aura === 'lightning') anim = 'cross';
    else if (cel ? !cel.run : (team && sp < 1.2)) {
      anim = 'up'; t = (this.t * 1.7 + (p.slot + p.team * 11) * 0.23) % 1;
      if (cel) {                                              // the scorer: a star's own celebration, otherwise one picked from his name
        const star = p._look.star, pick = star ? star.celeb : ['wide', 'slide', 'sky', 'kneel', 'dance', 'bow', 'siu', 'med'][((RUT.DB.hashStr(p.card.name) >>> 0) + this.score[0] * 3 + this.score[1] * 5) % 8];
        const ct = cel.ct || 0;
        if (pick === 'cross') anim = 'cross';
        else if (pick !== 'up') {
          anim = 'celeb_' + pick;
          t = pick === 'siu' ? clamp(ct / 1.7, 0, 1) : pick === 'slide' || pick === 'bow' ? clamp(ct / 1.6, 0, 1) : (ct * (pick === 'dance' ? 0.9 : 0.5)) % 1;
        }
      }
    }
    else if (p.dvT != null) { anim = p.dvHi ? 'dive_hi' : 'dive_lo'; t = clamp(p.dvT / 1.7, 0, 1); }
    else if (p.cool.head > 0) { anim = 'header'; t = 1 - p.cool.head / 0.5; }
    else if (p.cool.volley > 0) { anim = 'volley'; t = 1 - p.cool.volley / 0.45; }
    else if (p.cool.kick > 0) { anim = p.kickType === 'shot' || p.kickType === 'drive' ? 'shot' : p.kickType === 'chip' ? 'chip' : 'pass'; t = 0.42 + 0.58 * (1 - p.cool.kick / 0.35); }   // the ball leaves at contact, then the follow-through
    else if (cc && cc.strike && this.ball.owner === p) { anim = 'shot'; t = 0.05 + 0.3 * clamp(cc.strike.t / cc.strike.T, 0, 1); }
    else if (cc && cc.hold === 'shoot' && this.ball.owner === p && cc.wd < 2.3) { anim = 'walk'; t = p.gait || 0; }   // walking up to the shot while aiming
    else if (cc && cc.hold && this.ball.owner === p) { anim = cc.hold === 'shoot' ? 'shot' : 'pass'; t = 0.05 + 0.3 * cc.charge; }  // wind-up while charging
    else if (p.cool.trap > 0 && (p.trapZ || 0) > 0.85) { anim = 'chest'; t = 1 - p.cool.trap / 0.4; }
    else if (p.cool.trap > 0 && (p.trapZ || 0) > 0.35) { anim = 'thigh'; t = 1 - p.cool.trap / 0.4; }
    else if (p.cool.trap > 0 && sp < 5) { anim = 'trap'; t = 1 - p.cool.trap / 0.4; }
    else if (p.cool.trap > 0) { anim = 'touch'; t = 1 - p.cool.trap / 0.4; }          // a first touch on the move
    else if (this.bodyAnim(p, sp)) { anim = p._body; t = (this.t * 1.6 + p.slot * 0.13) % 1; }   // v181: shielding and bodying when two players are shoulder to shoulder
    else if (sp > 0.6) {
      t = p.gait || 0;
      anim = this.ball.owner === p ? 'dribble' : sp < 2.4 ? 'walk' : (p.sprinting && sp > p.jogMax * 0.92) ? 'sprint' : 'jog';
    } else anim = PA.idleFor(p.isGK ? 'GK' : p.card.position);   // a stance for the position (keeper crouch, CB arms crossed, ...)
    // which way the player faces (camera looks toward -y): 0 = toward the camera, +PI/2 = screen right; 8 directions
    // the drawn facing eases towards the real one (agile players swing round faster), so the sprite turns through its angles instead of flipping
    { const tf = Math.atan2(p.fx, p.fy); if (p._vf == null) p._vf = tf; let dd = tf - p._vf; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); p._vf += dd * (1 - Math.exp(-(1 / 60) / (0.04 + 0.1 * (1 - (p.agil != null ? p.agil : 0.5)))));  }
    const yaw = anim.startsWith('dive_') ? (p.dvSide >= 0 ? 1 : -1) * Math.PI / 2 : Math.round(p._vf / (Math.PI / 4)) * (Math.PI / 4);   // dives are drawn side-on so they read from the broadcast camera
    const ro = this.runOff(p), s = proj(p.x + (ro ? ro.x : 0), p.y + (ro ? ro.y : 0), 0), big0 = PLAYER_BIG * this._sizeOf(p), sc = Math.min(s.k / ZOOM / 9 * big0, 50 / (9 * SC));   // v183: capped like the sprite itself so tags stay on the head up close
    // rendered at exactly its on-screen size (about 4.2 px per unit of k), so the pixels stay crisp near and far
    const big = PLAYER_BIG * this._sizeOf(p);
    const spr = PA.sprite(p._look, anim, t, anim === 'up' || anim === 'cross' || anim.startsWith('celeb_') ? 0 : yaw, s.k / ZOOM / 12.5 * big * SC);   // rendered at its true device size
    const flip = anim === 'down' && p.fx < 0;
    const dxd = Math.round(s.x * SC - spr.ox), dyd = Math.round(s.y * SC - spr.oy);   // device pixels
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(Math.round(s.x * SC) * 2, 0); ctx.scale(-1, 1); }
    if (p.hlUntil > this.t && this.ball.owner !== p) {                      // the man being passed to: a white outline that fades
      const hc = this._hlc || (this._hlc = document.createElement('canvas')), hx = hc.getContext('2d');
      hc.width = spr.width; hc.height = spr.height; hx.drawImage(spr, 0, 0);
      hx.globalCompositeOperation = 'source-in'; hx.fillStyle = '#fff'; hx.fillRect(0, 0, hc.width, hc.height);
      const o = Math.max(1, Math.round(1.6 * SC)); ctx.globalAlpha = Math.min(1, (p.hlUntil - this.t) / 0.5);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.drawImage(hc, dxd + Math.round(Math.cos(a) * o), dyd + Math.round(Math.sin(a) * o)); }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(spr, dxd, dyd);
    ctx.restore();
    this.drawPlayerHud(ctx, p, s, sc, cc);
  };

  /** Screen-space extras for one player: cards, tag, control arrow, power bar. `s` = his feet on screen, `sc` = on-screen size. */
  P.drawPlayerHud = function (ctx, p, s, sc, cc) {
    const top = s.y - 38 * sc;
    if (p.yellows) { ctx.fillStyle = '#ffe600'; ctx.fillRect(Math.round(s.x + 7 * sc), Math.round(top), Math.max(2, Math.round(2 * sc)), Math.max(3, Math.round(3 * sc))); }
    if (p.rbT > 0 && p.sprinting) { ctx.fillStyle = '#ffe600'; ctx.fillRect(Math.round(s.x - 9 * sc), Math.round(s.y - 22 * sc), 2, 2); ctx.fillRect(Math.round(s.x - 11 * sc), Math.round(s.y - 18 * sc), 2, 2); }
    if (this.tagMode === 1 || (this.tagMode === 2 && (cc || this.ball.owner === p))) this.drawTag(ctx, p, s, sc, !!cc);
    if (cc) {
      const blink = Math.floor(this.t * 6) % 2 === 0, mc = blink ? (cc.idx ? '#40e8ff' : '#ffff40') : '#ffffff', ax = Math.round(s.x), ay = Math.round(top - 6);
      ctx.fillStyle = '#000'; ctx.fillRect(ax - 4, ay - 1, 9, 6);
      ctx.fillStyle = mc; ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 1, 5, 1); ctx.fillRect(ax - 1, ay + 2, 3, 1); ctx.fillRect(ax, ay + 3, 1, 1);
      if (this.ctls[0] && this.ctls[1]) this.pixelText(ctx, this.net ? (cc.idx === this.net.me ? 'YOU' : 'OPP') : cc.idx ? 'P2' : 'P1', ax, ay - 9, mc, 'center', 1, 6);
      if (p.cool.sigcd > 0 && this.ball.owner === p) { const w = 14, f = Math.max(0, Math.min(1, 1 - p.cool.sigcd / 3)); ctx.fillStyle = '#000'; ctx.fillRect(ax - 8, Math.round(s.y + 17), w + 2, 3); ctx.fillStyle = '#ff9a2e'; ctx.fillRect(ax - 7, Math.round(s.y + 18), Math.round(w * f), 1); }
      if (cc.hold) this.drawPowerBar(ctx, p, cc, ax, Math.round(s.y + (cc.hold === 'shoot' ? 12 : 4)));
      else if (cc.strike && cc.strike.p !== 0) this.drawStrikeBar(ctx, p, cc, ax, Math.round(s.y + 4));
    }
  };

  /** A name tag under the feet: a rating chip (gold 90+, green 80+, yellow 70+, grey below) and the surname, on the team's kit colour. */
  P.drawTag = function (ctx, p, s, sc, mine) {
    { const parts0 = p.card.name.split(' '); let n0 = parts0[parts0.length - 1]; if (/^(JR\.?|SR\.?|II|III)$/i.test(n0) && parts0.length > 1) n0 = parts0[parts0.length - 2];   // v167: FC-style tag, a clean name over his head
      ctx.globalAlpha = p.cool.stun > 0.5 ? 0.6 : 1; this.fcText(ctx, n0.toUpperCase().slice(0, 12), s.x, s.y - 38 * sc - 14, mine ? '#ffffff' : '#e8f0ff', 'center', 6, 800); ctx.globalAlpha = 1; return; }
    const r = p.card.rating, size = 4.2, parts = p.card.name.split(' ');
    let nm = parts[parts.length - 1]; if (/^(JR\.?|SR\.?|II|III)$/i.test(nm) && parts.length > 1) nm = parts[parts.length - 2];
    nm = nm.toUpperCase(); if (nm.length > 10) nm = nm.slice(0, 10);
    ctx.save(); ctx.font = size + 'px "Press Start 2P", monospace'; ctx.textBaseline = 'top';
    const rw = Math.ceil(ctx.measureText(String(r)).width) + 2.5, nw = Math.ceil(ctx.measureText(nm).width) + 2.5, w = rw + nw, h = size + 2.4;
    const x = Math.round(s.x - w / 2), y = Math.round(s.y + 2.5 * sc + 1);
    ctx.globalAlpha = p.cool.stun > 0.5 ? 0.6 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x + rw, y, nw, h);
    ctx.fillStyle = r >= 90 ? '#ffd23a' : r >= 80 ? '#5fe07a' : r >= 70 ? '#e8e060' : '#b8b8b8'; ctx.fillRect(x, y, rw, h);
    if (mine) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.5; ctx.strokeRect(x - 0.25, y - 0.25, w + 0.5, h + 0.5); }
    ctx.fillStyle = '#101010'; ctx.fillText(String(r), x + 1.25, y + 1.3);
    ctx.fillStyle = '#000000'; ctx.fillText(nm, x + rw + 1.7, y + 1.8); ctx.fillText(nm, x + rw + 0.8, y + 1.8); ctx.fillText(nm, x + rw + 1.25, y + 2.3); ctx.fillText(nm, x + rw + 1.25, y + 1.3);   // dark outline so it reads on any grass
    ctx.fillStyle = '#ffffff'; ctx.fillText(nm, x + rw + 1.25, y + 1.8);
    ctx.restore();
  };

  /** 3D pixel ball: a lit sphere with black panels, rotated by a real 3x3 matrix so it rolls along its direction of travel. */
  const PANELS = (() => {
    const out = [[0, 0, 1], [0, 0, -1]];
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; out.push([Math.cos(a) * 0.894, Math.sin(a) * 0.894, 0.447]); out.push([Math.cos(a + Math.PI / 5) * 0.894, Math.sin(a + Math.PI / 5) * 0.894, -0.447]); }
    return out;
  })();
  const ballCanvas = { c: null, g: null, n: 0 };
  function rotM(M, ax, ay, az, ang) {           // M := R(axis, ang) * M
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    const R = [t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
               t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
               t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c];
    const o = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = R[i * 3] * M[j] + R[i * 3 + 1] * M[3 + j] + R[i * 3 + 2] * M[6 + j];
    return o;
  }
  P.ballDrawPos = function () {
    const b = this.ball, o = b.owner;
    if (!o || o.skill || len(o.vx, o.vy) <= 0.6) return { x: b.x, y: b.y };
    const u = ((o.gait || 0) - 0.47 + 1) % 1, f = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88, d = -0.25 + 0.5 * f;
    return { x: b.x + o.fx * d, y: b.y + o.fy * d };
  };
  P.drawBall3D = function (ctx, b, proj) {
    // dribbling (drawn only, physics keep the ball at the feet): each stride the right foot pushes it ahead and the player runs onto it
    const { x: bx, y: by } = this.ballDrawPos();
    const s = proj(bx, by, b.z + BALL_R);
    { // a locator under the ball (a bright ring on the turf, plus a thin drop line when it is in the air) so it never gets lost
      const g0 = proj(bx, by, 0), rr = Math.max(4, 0.85 * g0.k / ZOOM * ACTOR_BIG), pulse = 0.75 + 0.2 * Math.sin(this.t * 7);
      void rr; void pulse;   // v167 (JODIO): no yellow ring round the ball any more
    }
    const n = Math.max(Math.round(11 * SC / 3), Math.round(1.05 * Math.min(s.k, 3 * 12.5 * ZOOM / (PLAYER_BIG * SC)) / ZOOM * ACTOR_BIG * BALL_BIG * 0.36 * SC)   /* v183: capped like the player sprites (close set-piece camera) */);      // about 14% of a player's height: never above the knee    // device pixels: the ball is rendered at true 720p size
    // roll: rotate about the horizontal axis perpendicular to the velocity (screen: x right, y down = toward camera, z up)
    let M = this._ballM || [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const sp = len(b.vx, b.vy);
    if (sp > 0.05) {
      const ang = Math.min(0.55, sp / 60 / BALL_R * 0.35);           // capped so the pattern stays readable
      M = rotM(M, -b.vy / sp, b.vx / sp, 0, ang);
    }
    if (b.spin) M = rotM(M, 0, 0, 1, b.spin * 0.05);
    this._ballM = M;
    const N = n + 2;                                                  // 1 px margin for the soft edge
    if (ballCanvas.n !== N) { ballCanvas.c = document.createElement('canvas'); ballCanvas.c.width = ballCanvas.c.height = N; ballCanvas.g = ballCanvas.c.getContext('2d'); ballCanvas.n = N; }
    const g = ballCanvas.g, r = n / 2, c0 = N / 2 - 0.5;
    const img = g.createImageData(N, N), d = img.data;
    const sm = (a, c, x) => { const t = clamp((x - a) / (c - a), 0, 1); return t * t * (3 - 2 * t); };
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const sx = (px - c0) / r, sy = (py - c0) / r, d2 = sx * sx + sy * sy, rr = Math.sqrt(d2);
      const edge = clamp((1 - rr) * r + 0.5, 0, 1);                  // anti-aliased silhouette
      if (edge <= 0) continue;
      const sz = Math.sqrt(Math.max(0, 1 - Math.min(1, d2)));
      const X = M[0] * sx + M[3] * sz + M[6] * -sy, Y = M[1] * sx + M[4] * sz + M[7] * -sy, Z = M[2] * sx + M[5] * sz + M[8] * -sy;
      let dark = 0, rim = 0; for (const q of PANELS) { const dt = q[0] * X + q[1] * Y + q[2] * Z; dark = Math.max(dark, sm(0.875, 0.915, dt)); rim = Math.max(rim, sm(0.845, 0.87, dt)); }   // soft panel edges
      rim = Math.max(0, rim - dark); const band = (1 - sm(0.07, 0.1, Math.abs(Z))) * (1 - Math.max(dark, rim));   // v177 (JODIO: "give the ball some design"): navy panels, gold trim, a red FCR band
      // light from the upper left, a soft terminator and a little bounce from the grass underneath
      const nl = -sx * 0.42 - sy * 0.62 + sz * 0.66;
      const lit = clamp(0.42 + 0.58 * nl, 0, 1) * (1 - 0.18 * sm(0.6, 1, rr)) + 0.10 * clamp(sy, 0, 1) * sz;
      const spec = Math.pow(clamp(nl * 1.15 - 0.15, 0, 1), 14) * 0.55;
      const mix = (w, nv, gd, rd, k) => w + (nv - w) * dark + (gd - w) * rim + (rd - w) * band;
      const ring = sm(0.86, 0.97, rr), sh = (0.64 + 0.36 * lit), dk = 1 - 0.7 * ring, ch = base => clamp(base * sh + spec * 255, 0, 255) * dk;   // dark rim so it reads on the pale turf
      const i = (py * N + px) * 4; d[i] = ch(mix(252, 28, 236, 214)); d[i + 1] = ch(mix(252, 48, 182, 38)); d[i + 2] = ch(mix(258, 128, 52, 52)); d[i + 3] = Math.round(255 * edge);
    }
    g.putImageData(img, 0, 0);
    ctx.drawImage(ballCanvas.c, (s.x * SC - N / 2) / SC, (s.y * SC - N / 2) / SC, N / SC, N / SC);
  };

  /** 3D goal: round posts with light and shadow sides, a deep net mesh with shaded panels and a slight sag. */
  P.drawGoal3D = function (ctx, side, proj, part) {
    const gx = side ? PITCH_W : 0, bx = side ? PITCH_W + NET_DEPTH : -NET_DEPTH;
    const y1 = PH2 - GOAL_HALF, y2 = PH2 + GOAL_HALF, TOPB = NET_TOP_BACK;
    const line = (a, c, col, w) => { const p1 = proj(a[0], a[1], a[2]), p2 = proj(c[0], c[1], c[2]); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); };
    const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((q, i) => { const s = proj(q[0], q[1], q[2]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); ctx.closePath(); ctx.fill(); };
    // a "round" post: three parallel strokes (shadow, body, highlight)
    const post = (a, c) => {
      const k = proj(a[0], a[1], a[2]).k, w = Math.max(2, k * 0.16);
      line(a, c, '#8a8a9a', w + 1.5); line(a, c, '#f4f4f8', w); line(a, c, '#ffffff', Math.max(1, w * 0.35));
    };
    // the cloth mesh (stepNets): shaded cells and knot lines straight from the particle positions
    if (!this.nets) this.nets = [makeNet(0), makeNet(1)];
    const net = this.nets[side], pos = net.pos;
    const sp = i => proj(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const drawPanel = (pl, fill, lineCol) => {
      const S = [];
      for (let v = 0; v <= pl.nv; v++) for (let u = 0; u <= pl.nu; u++) S.push(sp(pl.at(u, v)));
      const at = (u, v) => S[v * (pl.nu + 1) + u];
      if (fill) {
        ctx.fillStyle = fill; ctx.beginPath();
        for (let v = 0; v < pl.nv; v++) for (let u = 0; u < pl.nu; u++) { const a = at(u, v), c = at(u + 1, v), d = at(u + 1, v + 1), e = at(u, v + 1); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath(); }
        ctx.fill();
      }
      ctx.strokeStyle = lineCol; ctx.lineWidth = 0.42; ctx.lineJoin = 'round'; ctx.beginPath();
      for (let v = 0; v <= pl.nv; v++) for (let u = 0; u <= pl.nu; u++) { const a = at(u, v); if (u < pl.nu) { const c = at(u + 1, v); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); } if (v < pl.nv) { const c = at(u, v + 1); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); } }
      ctx.stroke();
    };
    const PL = {}; net.panels.forEach(pl => { PL[pl.name] = pl; });
    const mesh = 'rgba(240,240,255,0.5)', meshD = 'rgba(210,210,235,0.32)';
    if (part === 'back') {
      // ground shadow of the goal
      poly([[gx, y1, 0], [bx, y1, 0], [bx, y2, 0], [gx, y2, 0]], 'rgba(0,0,0,0.18)');
      drawPanel(PL.back, 'rgba(20,20,40,0.2)', mesh);
      drawPanel(PL.far, 'rgba(255,255,255,0.07)', meshD);
      drawPanel(PL.roof, 'rgba(255,255,255,0.09)', meshD);
      // back frame + far post
      line([bx, y1, 0], [bx, y1, TOPB], '#c8c8d8', 1.1); line([gx, y1, GOAL_H], [bx, y1, TOPB], '#c8c8d8', 1.1); line([bx, y1, TOPB], [bx, y2, TOPB], '#b8b8c8', 1);
      post([gx, y1, 0], [gx, y1, GOAL_H]);
    } else {
      // near side net + frame, crossbar, near post
      drawPanel(PL.near, 'rgba(255,255,255,0.08)', mesh);
      line([bx, y2, 0], [bx, y2, TOPB], '#c8c8d8', 1.1); line([gx, y2, GOAL_H], [bx, y2, TOPB], '#c8c8d8', 1.1);
      post([gx, y1, GOAL_H], [gx, y2, GOAL_H]);
      post([gx, y2, 0], [gx, y2, GOAL_H]);
    }
  };

  /** Signature-star celebration particles drawn around the scorer. */
  P.drawCelebration = function (ctx, proj) {
    const c = this.celebration; if (!c || this.phase !== 'goal') return;
    c.t += 1 / 60;
    const s = proj(c.p.x, c.p.y, 1.2 / ZOOM), x = s.x, y = s.y, t = c.t, sig = c.sig, R = s.k / ZOOM / 7;
    if (!sig) { ctx.strokeStyle = 'rgba(255,255,255,' + Math.max(0, 1 - t / 2) + ')'; ctx.beginPath(); ctx.ellipse(x, y + 1.2 * s.k / ZOOM, (1 + t * 3) * s.k / ZOOM, (1 + t * 3) * s.k / ZOOM * 0.45, 0, 0, 6.28); ctx.stroke(); return; }
    const col = sig.color;
    ctx.fillStyle = col;
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * 6.28 + t * (sig.fx === 'spiral' ? 3 : 1);
      let px, py;
      if (sig.fx === 'bolts') { if ((i + Math.floor(t * 10)) % 3) continue; px = x + Math.cos(a) * 14 * R; py = y + Math.sin(a) * 10 * R; ctx.fillRect(px, py - 3, 2, 3); ctx.fillRect(px + 1, py, 2, 3); continue; }
      if (sig.fx === 'aura') { const r = (10 + Math.sin(t * 4) * 2) * R; px = x + Math.cos(a) * r; py = y + Math.sin(a) * r * 0.6; }
      else if (sig.fx === 'frost' || sig.fx === 'feathers' || sig.fx === 'sand') { px = x + Math.cos(a * 3.7) * 18 * R; py = y - 14 * R + ((t * 20 + i * 7) % 30) * R; }
      else if (sig.fx === 'confetti') { ctx.fillStyle = ['#4cff7a', '#ffe600', '#3c8bff', '#ff4040'][i % 4]; px = x + Math.cos(a) * (6 + t * 20) * R; py = y + Math.sin(a) * (6 + t * 20) * R + t * t * 8; }
      else { px = x + Math.cos(a) * (4 + t * 16) * R; py = y + Math.sin(a) * (4 + t * 16) * R; }
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
    this.pixelText(ctx, sig.celebration, VIEW_W / 2, 130 + VOFF, col, 'center', Math.min(1, t * 2), 8);
  };

  /** Mini radar (top right): the 3D camera never shows the whole pitch, so this does. */
  P.drawRadar = function (ctx) {
    const W = 78, H = 46, X = Math.round(VIEW_W / 2 - W / 2), Y = VIEW_H - H - 4;   // v167: bottom centre, see-through, like the FC broadcast radar
    ctx.fillStyle = 'rgba(10,20,14,0.45)'; ctx.fillRect(X - 1, Y - 1, W + 2, H + 2);
    ctx.fillStyle = 'rgba(40,110,60,0.35)'; ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(X + W / 2, Y, 1, H);
    ctx.fillRect(X, Y + H / 2 - 9, 1, 18); ctx.fillRect(X + W - 1, Y + H / 2 - 9, 1, 18);
    const m = (wx, wy) => [Math.round(X + wx / PITCH_W * (W - 1)), Math.round(Y + wy / PITCH_H * (H - 1))];
    this.players.forEach(p => { const [a, c] = m(p.x, p.y); const rc = this.ctlOf(p); ctx.fillStyle = rc ? (rc.idx ? '#40e8ff' : '#ffff40') : this.teams[p.team].kit[0]; ctx.fillRect(a - 1, c - 1, 3, 3); ctx.fillStyle = '#000'; ctx.fillRect(a - 1, c + 2, 3, 1); });
    const [bx, by] = m(this.ball.x, this.ball.y); ctx.fillStyle = '#ffffff'; ctx.fillRect(bx - 1, by - 1, 2, 2);
  };

  /** Card portrait for the HUD, when we have one (js/faces.js). */
  function hudFace(name) {
    if (!RUT.FACES || !RUT.FACES[name] || typeof Image === 'undefined') return null;
    if (!GFX.faces[name]) { const img = new Image(); img.src = RUT.FACES[name]; GFX.faces[name] = img; }
    return GFX.faces[name].complete ? GFX.faces[name] : null;
  }

  /** Chunky pixel text with a hard drop shadow. */
  /** v167: broadcast-style text (FC look): Barlow Condensed, bold, with a soft shadow. */
  P.fcText = function (ctx, text, x, y, color, align, size, weight) {
    ctx.save(); ctx.font = (weight || 700) + ' ' + (size || 8) + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(tl(text), x + 0.4, y + 0.5);
    ctx.fillStyle = color || '#fff'; ctx.fillText(tl(text), x, y); ctx.restore();
  };
  P.pixelText = function (ctx, text, x, y, color, align, alpha, size) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    text = tl(text);
    ctx.font = (size || 8) + 'px "Press Start 2P", monospace';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#000'; ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y);
    ctx.restore();
  };

  /** Testing-ground read-out: your speed, the last strike, and a tally of what you have tried. */
  P.drawTrainHUD = function (ctx) {
    const h = this.hero, sp = len(h.vx, h.vy);
    const st = this.stats, k = this.lastKick, line = (y, txt, col) => this.pixelText(ctx, txt, 8, y, col || '#ffffff', 'left', 1, 6);
    ctx.fillStyle = 'rgba(0,0,40,0.72)'; ctx.fillRect(4, 24, 190, 58);
    line(27, 'TESTING GROUND ' + PITCH_W + 'x' + PITCH_H + 'm', '#ffe14a');
    line(37, 'SPEED ' + sp.toFixed(1) + ' m/s  ' + (sp * 3.6).toFixed(0) + ' km/h');
    line(46, 'TOP ' + this.heroTop.toFixed(1) + ' / MAX ' + h.sprintMax.toFixed(1) + ' m/s', '#7fdcff');
    line(55, k ? 'LAST STRIKE ' + k.speed.toFixed(1) + ' m/s  LIFT ' + k.lift.toFixed(1) : 'LAST STRIKE -', '#ff9a6a');
    line(64, 'GOALS ' + this.score[0] + '  SHOTS ' + st.shots[0] + ' (' + st.onTarget[0] + ' ON)  PASSES ' + st.passes[0], '#4cff7a');
    line(73, 'TACKLES ' + st.tackles[0] + '  CONCEDED ' + this.score[1], '#4cff7a');
  };

  P.drawHUD = function (ctx) {
    const T = this.teams;
    if (this.training) this.drawTrainHUD(ctx);
    else {
    // v167 (JODIO's FC 27 pictures): a broadcast score bug, top left: kit stripe, club short names, the score in a dark box, the clock under it
    const ab = t => (t.short || t.label || '').slice(0, 3).toUpperCase() || 'CLB', X = 6, Y = 6, W = 84, H = 12;
    const min = this.phase === 'end' || this.phase === 'pens' ? (this.pens || this.phase === 'pens' ? 'PEN' : 'FT') : (() => { const m = parseInt(this.minute(), 10) || 0, sec = Math.floor((this.t / this.halfSeconds * 45 * 60) % 60); return String(Math.min(m - 1, 120)).padStart(2, '0') + ':' + String(sec).padStart(2, '0'); })();
    ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = T[0].kit[0]; ctx.fillRect(X, Y, 2, H); ctx.fillStyle = T[1].kit[0]; ctx.fillRect(X + W - 2, Y, 2, H);
    ctx.fillStyle = '#1b1530'; ctx.fillRect(X + 29, Y, 26, H);
    this.fcText(ctx, ab(T[0]), X + 15.5, Y + H / 2, '#14102a', 'center', 9, 800); this.fcText(ctx, ab(T[1]), X + W - 15.5, Y + H / 2, '#14102a', 'center', 9, 800);
    this.fcText(ctx, this.score[0] + ' - ' + this.score[1], X + 42, Y + H / 2, '#ffffff', 'center', 9, 800);
    ctx.fillStyle = 'rgba(10,10,20,.85)'; ctx.fillRect(X, Y + H, 32, 9); this.fcText(ctx, min, X + 16, Y + H + 4.6, '#ffffff', 'center', 7.5, 700);
    if (this.added != null && this.phase === 'play') { ctx.fillStyle = '#1d8f3e'; ctx.fillRect(X + 32, Y + H, 14, 9); this.fcText(ctx, '+' + this.added, X + 39, Y + H + 4.6, '#ffffff', 'center', 7.5, 700); }
    }
    if (this.speed > 1) this.pixelText(ctx, 'x' + this.speed, VIEW_W - 6, 8, '#ff80ff', 'right');
    // ticker
    if (this.tickerT > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, VIEW_H - 14, VIEW_W, 14);
      this.pixelText(ctx, this.ticker, VIEW_W / 2, VIEW_H - 11, '#ffffff', 'center');
    } else if (this.ctls[0] && this.ctls[1]) {                     // two players: P1 on the left, P2 on the right
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, VIEW_H - 14, VIEW_W, 14);
      const bar = (c, x, right) => { if (!c.controlled) return; const p = c.controlled, col = c.idx ? '#40e8ff' : '#ffe14a';
        this.pixelText(ctx, (this.net ? (c.idx === this.net.me ? 'YOU ' : 'OPP ') : c.idx ? 'P2 ' : 'P1 ') + p.name + ' ' + p.card.rating, x, VIEW_H - 11, col, right ? 'right' : 'left');
        const bx = right ? VIEW_W - 6 - 160 - 44 : 6 + 160; ctx.fillStyle = '#333'; ctx.fillRect(bx, VIEW_H - 9, 40, 4); ctx.fillStyle = p.stamina > 40 ? '#4cff4c' : '#ff9a2a'; ctx.fillRect(bx, VIEW_H - 9, Math.round(40 * p.stamina / 100), 4); };
      [0, 1].forEach(t => { const c = this.ctls[t]; bar(c, c.idx ? VIEW_W - 6 : 6, !!c.idx); });
    } else if (this.controlled && this.human != null) {
      const c = this.controlled;
      // v167: FC-style player panel, bottom left: number/rating, name, a thin stamina bar
      const PX0 = 5, PY0 = VIEW_H - 15, PW0 = 78;
      const gr = ctx.createLinearGradient(PX0, 0, PX0 + PW0, 0); gr.addColorStop(0, 'rgba(12,30,40,.85)'); gr.addColorStop(1, 'rgba(12,30,40,.35)');
      ctx.fillStyle = gr; ctx.fillRect(PX0, PY0, PW0, 8);
      this.fcText(ctx, c.card.rating + '  ' + c.name, PX0 + 3, PY0 + 4.2, '#ffffff', 'left', 7, 800);
      { const lr = this.liveRating(c); ctx.fillStyle = lr >= 8 ? '#1f9d55' : lr >= 6.5 ? '#2f7d4a' : lr >= 6 ? '#55606a' : '#a0402e'; ctx.fillRect(PX0 + PW0 + 2, PY0, 12, 8); this.fcText(ctx, lr.toFixed(1), PX0 + PW0 + 8, PY0 + 4.2, '#ffffff', 'center', 6.5, 800); }   // v167: live match rating
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(PX0, PY0 + 9, PW0 * 0.8, 2); ctx.fillStyle = c.stamina > 40 ? '#3fe08a' : '#ff9a2a'; ctx.fillRect(PX0, PY0 + 9, Math.round(PW0 * 0.8 * c.stamina / 100), 2);
      // v169: FC-style PlayStyle+ gem beside the stamina bar: the PS+ in use, else the player's first PS+ dimmed
      if (RUT.PSIcon) { const on = c.psOn && c.psOn.off == null ? c.psOn.name : null, own = (c.card.playStyles || []).find(n => /\+$/.test(n));
        if (on || own) { if (!c._psTint) { const cd = c.card || {}; c._psTint = cd.rarity === 'evo' ? 'evo' : cd.promo || (cd.cl ? 'clpromo' : cd.rarity) || 'gold'; }
          ctx.globalAlpha = on ? 1 : 0.45; ctx.drawImage(RUT.PSIcon.canvas(on || own, true, c._psTint), PX0 + PW0 * 0.8 + 1, PY0 + 6.5, 9, 9); ctx.globalAlpha = 1; } }
    }
    if (this.goalFlash > 0) {
      this.goalFlash -= 1 / 60;
      const cols = ['#ff3030', '#ffe600', '#30ff60', '#30c0ff', '#ff40ff'];
      this.fcText(ctx, 'GOAL!', VIEW_W / 2, 108 + VOFF, cols[Math.floor(this.goalFlash * 12) % cols.length], 'center', 40, 900);
    }
    if (this.phase === 'halftime') this.fcText(ctx, 'HALF TIME', VIEW_W / 2, 118 + VOFF, '#ffffff', 'center', 26, 900);
    if (this.phase === 'end') this.fcText(ctx, 'FULL TIME', VIEW_W / 2, 118 + VOFF, '#ffe14a', 'center', 26, 900);
    if (this.paused) this.fcText(ctx, 'PAUSED', VIEW_W / 2, 118 + VOFF, '#ffffff', 'center', 26, 900);
    if (this.net) {
      if (this.net.desync) this.pixelText(ctx, 'OUT OF SYNC - QUIT AND REMATCH', VIEW_W / 2, 126 + VOFF, '#ff6060', 'center', 1, 10);
      else if (this.net.stall > 0.6) this.pixelText(ctx, 'WAITING FOR OPPONENT...', VIEW_W / 2, 126 + VOFF, '#ffe14a', 'center', 1, 10);
    }
  };


  /* ================= v117: PLAYER ORDERS =================
   * A standing order from the club's Orders page ("stay back", "run to goal and shoot"...). It steers the computer-controlled player (everyone you are not controlling, in every local match). */
  const ORDERS = { stay: 'Stay back', mark: 'Mark their striker', goal: 'Run to goal and shoot', shoot: 'Shoot on sight', wide: 'Stay wide', support: 'Stay close to the ball', press: 'Press the ball' };
  P.orderMove = function (p) {
    const o = p.order, b = this.ball, dir = this.teams[p.team].dir, own = dir > 0 ? 0 : PITCH_W, gx = dir > 0 ? PITCH_W : 0;
    if (!o || o === 'shoot' || b.owner === p || p.isGK) return false;
    if (!b.owner && b.passTo && b.passTo.p === p) return false;
    const weHave = b.owner && b.owner.team === p.team, theyHave = b.owner && b.owner.team !== p.team, hs = this.homeSpot(p, false), dB = dist(p, b);
    if (!b.owner && dB < 7) return false;                                                  // a loose ball close by: normal play
    let tx, ty, sp = false;
    if (o === 'stay') {
      if (theyHave && dB < 8) return false;                                                // may still tackle what comes to him
      tx = hs.x; ty = hs.y + (b.y - PH2) * 0.2; if ((tx - PW2) * dir > -2) tx = PW2 - dir * 2;
      sp = dist(p, { x: tx, y: ty }) > 14;
    } else if (o === 'goal') {
      if (weHave && (b.x - PW2) * dir > -PITCH_W * 0.12) { tx = gx - dir * (13 + 3 * PSC); ty = PH2 + (PH2 - b.y) * 0.25; sp = true; }
      else { tx = PW2 + dir * 4; ty = hs.y; sp = theyHave && false; }
    } else if (o === 'wide') {
      ty = hs.y < PH2 ? 4 : PITCH_H - 4; tx = clamp(b.x + dir * (weHave ? 14 : -8), own + dir * 8, gx - dir * 6); sp = weHave && dist(p, { x: tx, y: ty }) > 14;
    } else if (o === 'support') {
      if (theyHave && dB < 12) return false;
      tx = b.x - dir * 7; ty = b.y + (p.y < b.y ? -6 : 6); sp = dB > 20;
    } else if (o === 'press') {
      if (!theyHave) return false;
      tx = b.owner.x; ty = b.owner.y; sp = true;
    } else if (o === 'mark') {
      const FCo = FORMATIONS[this.tac[1 - p.team].formation]; let tg = p._mk && this.t < p._mk.until ? p._mk.o : null;
      if (!tg) { let bd = 1e9; this.players.forEach(q => { if (q.team !== p.team && !q.isGK && q.slot >= FCo.fwdFrom) { const d = dist(q, p) - (q.card.position === 'ST' || q.card.position === 'CF' ? 12 : 0); if (d < bd) { bd = d; tg = q; } } }); if (tg) p._mk = { o: tg, until: this.t + 4 }; }
      if (!tg) return false;
      if (b.owner === tg && dist(p, tg) < 4) return false;                                  // he has it and I am on him: tackle through normal play
      tx = tg.x - dir * 1.6; ty = tg.y; sp = dist(p, tg) > 5;
    } else return false;
    this.seek(p, tx, ty, sp); return true;
  };
  /* ================= v114: PLAY BOARD =================
   * A play is drawn on the 2D board: where your 11 stand, and up to 4 steps ("Mulder: long ball to Fenwick", "Fenwick: shoot"). Board points are 0..1 across the pitch (x from your own goal to theirs).
   * The same engine that plays the match runs the play: boardSim() puts everybody on their points, gives the ball to the first player and lets the real AI (defenders included) play it out,
   * so the numbers are what the match engine does, not an estimate. Plays the sims like are taught to the team: a computer-controlled carrier who stands where the board says starts the play. */
  P.bpt = function (team, pt) { return team === 0 ? { x: pt[0] * PITCH_W, y: pt[1] * PITCH_H } : { x: (1 - pt[0]) * PITCH_W, y: (1 - pt[1]) * PITCH_H }; };
  P.planMake = function (play, team, actor) { return { play, team, i: 0, actor, waiting: false, gotAt: this.t, t0: this.t, sentAt: 0, tgt: null, fin: 0 }; };
  P.planPick = function (p, nearOpp) {
    const plays = this.cfg.plays && this.cfg.plays[p.team]; if (!plays) return false;
    for (const play of plays) {
      const s0 = play.steps[0]; if (!play.on || !s0 || s0.from !== p.slot) continue;
      const rate = nearOpp < 5 * PSC ? play.rT : play.rL; if (rate != null && rate < 0.3) continue;
      const sp = this.bpt(p.team, play.mine[p.slot]); if (dist(p, sp) > 14 * PSC) continue;
      let ok = true;
      if (s0.act !== 'shoot') { const tg = this.players.find(o => o.team === p.team && o.slot === s0.to); if (!tg || this.ctlOf(tg)) ok = false; else { const tp = this.bpt(p.team, play.mine[tg.slot]); if (dist(tg, tp) > 26 * PSC) ok = false; } }
      if (!ok) continue;
      this.plan = this.planMake(play, p.team, p); return true;
    }
    return false;
  };
  P.planHold = function (p) {
    const pl = this.plan; if (!pl || pl.team !== p.team || pl.fin || p.isGK) return false;
    const b = this.ball; if (b.owner === p || (b.passTo && b.passTo.p === p && !b.owner)) return false;
    const st = pl.play.steps; let hold = false;
    for (let k = pl.i; k < st.length; k++) if (st[k].to === p.slot || (k > pl.i && st[k].from === p.slot)) hold = true;
    if (!hold) return false;
    const pt = this.bpt(pl.team, pl.play.mine[p.slot]); this.seek(p, pt.x, pt.y, false); return true;
  };
  P.planEnd = function (res) {
    const pl = this.plan; if (!pl) return; this.plan = null;
    const ok = res === 'ok' || res === 'goal' || res === 'sot';
    (this.planLog = this.planLog || []).push({ id: pl.play.id, i: pl.i, res, ok, min: this.minute() });
    (this.planCool = this.planCool || [0, 0])[pl.team] = this.t + 10;
    if (this.scn) { this.scn.done = true; this.scn.res = res; this.scn.at = pl.i; this.scn.ok = ok; }
  };
  P.planStep = function () {
    const pl = this.plan; if (!pl) return;
    const b = this.ball, st = pl.play.steps, s = st[pl.i], now = this.t;
    if (pl.fin) {
      if (this.score[pl.team] > pl.sc0) return this.planEnd('goal');
      if (now - pl.fin > 4.5) return this.planEnd(this.stats.onTarget[pl.team] > pl.sot0 ? 'sot' : 'shot');
      return;
    }
    if (this.phase !== 'play' || this.sp) return this.planEnd('out');
    if (pl.waiting) {
      if (b.owner) {
        if (b.owner !== pl.tgt) return this.planEnd('lost');
        pl.i++; pl.waiting = false; pl.gotAt = now; pl.actor = b.owner;
        if (pl.i >= st.length || this.ctlOf(b.owner)) return this.planEnd('ok');
      } else if (now - pl.sentAt > 5) return this.planEnd('timeout');
      return;
    }
    if (b.owner !== pl.actor) return this.planEnd(b.owner ? 'lost' : 'timeout');
    const p = pl.actor, a = s.act, tg = a === 'shoot' ? null : this.players.find(o => o.team === pl.team && o.slot === s.to);
    if (a !== 'shoot' && !tg) return this.planEnd('timeout');
    if (now - pl.gotAt < 0.3) return;                                                                // a beat on the ball before he plays it
    if (!this.scn && now - pl.gotAt < 2.2) {                                                            // in a match the receiver first walks to his point (up to 2 s)
      const need = a === 'shoot' ? [] : st.slice(pl.i).map(z => z.to).filter(x => x != null).slice(0, 1);
      if (need.some(sl => { const q = this.players.find(o => o.team === pl.team && o.slot === sl); if (!q) return false; const pt = this.bpt(pl.team, pl.play.mine[sl]); return dist(q, pt) > 5 * PSC; })) return;
    }
    if (a === 'shoot') {
      pl.fin = now; pl.sc0 = this.score[pl.team]; pl.sot0 = this.stats.onTarget[pl.team];
      const dGoal = len((p.team === 0 ? PITCH_W : 0) - p.x, PH2 - p.y);
      if (dGoal < 34 * PSC) this.shoot(p, 0, 0.9, null, { auto: true, assist: 'full' }); else this.shoot(p, 0, 1, null, { long: true });
      return;
    }
    this.pass(p, tg, a === 'through', { lob: a === 'long' || a === 'cross' });
    pl.waiting = true; pl.sentAt = now; pl.tgt = tg;
  };
  /** Board defaults and the what-if opponents the board offers (each returns the 11 opponent points for one run). */
  const BOARD_OPP = [[0.97, 0.5], [0.8, 0.12], [0.8, 0.36], [0.8, 0.64], [0.8, 0.88], [0.66, 0.28], [0.66, 0.5], [0.66, 0.72], [0.52, 0.2], [0.52, 0.5], [0.52, 0.8]];
  const BOARD_SCN = [
    { key: 'drawn', name: 'As drawn', desc: 'The opponents stand exactly where you put them.', fn: (o) => o },
    { key: 'press', name: 'High press', desc: 'They step up 12% of the pitch and squeeze towards the ball.', fn: (o, c) => o.map((q, i) => { if (i === 0) return q; const d = Math.hypot(q[0] - c.ball[0], q[1] - c.ball[1]), k = d < 0.4 ? 0.4 : 0.1; return [q[0] - 0.12 + (c.ball[0] - q[0]) * k, q[1] + (c.ball[1] - q[1]) * k]; }) },
    { key: 'deep', name: 'Deep block', desc: 'They drop 10% of the pitch back and squeeze together.', fn: (o) => o.map((q, i) => i === 0 ? q : [q[0] + 0.1, q[1] + (0.5 - q[1]) * 0.18]) },
    { key: 'mark', name: 'Man-marking', desc: 'Every opponent stands goal-side of one of your players.', fn: (o, c) => { const out = o.map(q => q.slice()), free = c.mine.map((q, i) => i).filter(i => i > 0); o.forEach((q, i) => { if (i === 0 || !free.length) return; let bi = 0, bd = 9; free.forEach((f, k) => { const d = Math.hypot(c.mine[f][0] - q[0], c.mine[f][1] - q[1]); if (d < bd) { bd = d; bi = k; } }); const f = free.splice(bi, 1)[0]; out[i] = [Math.min(0.99, c.mine[f][0] + 0.022), c.mine[f][1] + (c.mine[f][1] > 0.5 ? -0.01 : 0.01)]; }); return out; } },
    { key: 'side', name: 'Ball-side shift', desc: 'The block slides towards the side the ball is on.', fn: (o, c) => o.map((q, i) => i === 0 ? q : [q[0], Math.min(0.97, Math.max(0.03, q[1] + (c.ball[1] - 0.5) * 0.4))]) },
    { key: 'recv', name: 'Receiver closed down', desc: 'Two opponents stand next to the player who gets the first pass.', fn: (o, c) => { if (!c.tgt) return o; const out = o.map(q => q.slice()), idx = o.map((q, i) => i).filter(i => i > 0).sort((a, b) => Math.hypot(o[a][0] - c.tgt[0], o[a][1] - c.tgt[1]) - Math.hypot(o[b][0] - c.tgt[0], o[b][1] - c.tgt[1])).slice(0, 2); idx.forEach((i, k) => { out[i] = [Math.min(0.99, c.tgt[0] + 0.03), c.tgt[1] + (k ? 0.03 : -0.03)]; }); return out; } },
  ];
  P.scnInit = function (play, oppPos) {
    this.phase = 'play'; this.phaseT = 0; this.sp = null; this.spAfter = null; this.scn = { done: false }; this.planLog = [];
    this.players.forEach(p => {
      const pt = p.team === 0 ? this.bpt(0, play.mine[p.slot]) : { x: oppPos[p.slot][0] * PITCH_W, y: oppPos[p.slot][1] * PITCH_H };
      p.x = pt.x; p.y = pt.y; p.vx = p.vy = 0; p.dive = null; p.cool.stun = 0; p.cool.slide = 0;
    });
    const a = this.players.find(p => p.team === 0 && p.slot === play.steps[0].from), b = this.ball;
    Object.assign(b, { x: a.x, y: a.y, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, tspin: 0, owner: null, shot: null, trail: [], inNet: null });
    this.giveBall(a); this.kickTeam = 0;
    this.plan = this.planMake(play, 0, a);
  };
  /** One board run: o = { home, away, play, opp, seed, styles, tacGain, pitch }. Returns { ok, res, at } (res: ok / goal / sot / shot / lost / out / timeout). */
  function boardSim(o) {
    const m = new Match({ home: o.home, away: o.away, humanTeam: null, halfSeconds: 60, seed: o.seed, styles: o.styles, tacGain: o.tacGain, pitch: o.pitch });
    m.headless = true;
    let sd = (o.seed * 2654435761) >>> 0; const jr = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5) * 2, J = o.jit == null ? 0.012 : o.jit;      // every run nudges everybody by up to ~1.2% of the pitch so runs differ
    const jp = q => [Math.min(1, Math.max(0, q[0] + jr() * J)), Math.min(1, Math.max(0, q[1] + jr() * J))];
    m.scnInit(Object.assign({}, o.play, { mine: o.play.mine.map(jp) }), o.opp.map(jp));
    let g = 0; while (!m.scn.done && g++ < 900) m.update(1 / 30);
    return { ok: !!m.scn.ok, res: m.scn.res || 'timeout', at: m.scn.at == null ? 0 : m.scn.at };
  }
  /** Home spots of a formation as board points (own goal at x = 0), slot by slot. */
  function formSpots(key) { const F = FORMATIONS[key] || FORMATIONS['433']; return F.pts.map(f => [f[0] / 105, f[1] / 68]); }

  /* ================= v108: MATCH RECORDER, PLAY COUNTERS, HIGHLIGHT REEL ================= */
  // The simulation is deterministic (seed + 60 Hz ticks), so a match is stored as its set-up plus the human's inputs (a few KB), and any moment can be played back exactly
  // by building the same match, feeding it the same inputs and simulating up to it. Nothing is a video; nothing is approximated.
  const EVKEEP = { goal: 1, shot: 1, sot: 1, save: 1, post: 1, skill: 1, tkw: 1, foul: 0 };
  /** Called at every play event: updates the counters of the team and, while recording, keeps the moments that can become highlights. */
  /** v113: per-player counters while recording (they feed the player highlights and improvement requests; they never touch the simulation). */
  P.psAdd = function (p, key) {
    if (!p || !this.rec || this.rec.mode !== 'rec') return;
    const PS = this.rec.ps || (this.rec.ps = {}), id = p.team + '|' + p.card.name, s = PS[id] || (PS[id] = { n: p.card.name, t: p.team, pos: p.fpos, ovr: p.card.rating, id: p.card.id, c: {} });
    s.c[key] = (s.c[key] || 0) + 1;
  };
  /** v124: per-player match counters (always on, never touch the simulation): shot sot goal ast key pass pc tk tkw int foul save post skill. They go to result.players and the Player Stats page. */
  /** v167 (JODIO's FC 27 pictures): the green defending range ring round the man you control when they have the ball,
   *  and at your direct free kick an aim box on the ball, a curving line toward goal and the strike name under him. */
  P.drawFcGround = function (ctx, proj) {
    const b = this.ball, ring = (x, y, r, col, w) => { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, s = proj(x + Math.cos(a) * r, y + Math.sin(a) * r, 0); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); } ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    this.ctls.forEach(c => {
      const p = c && c.controlled; if (!p || this.phase !== 'play') return;
      if (b.owner && b.owner.team !== p.team && !p.isGK) {
        const r = 2.4 * (1 + 0.15 * clamp(((p.card.sub.defAwareness || 60) - 60) / 30, 0, 1)), a = 0.75 + 0.2 * Math.sin(this.t * 6);
        ring(p.x, p.y, r, 'rgba(60,255,140,' + a.toFixed(2) + ')', 1.3);
      }
    });
    const sp = this.sp;
    if (!this.penaltyKick && sp && sp.kind === 'FREE KICK' && sp.taker && this.ctlOf(sp.taker) && b.owner === sp.taker && Math.abs((this.teams[sp.taker.team].dir > 0 ? PITCH_W : 0) - b.x) < 36) {
      const p = sp.taker, dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, c = this.ctlOf(p), aim = (c && c.aim) || 0;
      const kn = !!(c && c.spKnuckle), out = c && (c.spCurve || 1) < 0;
      const tx = gx, ty = PH2 + aim * (GOAL_HALF - 0.55), curl = kn ? 0 : (p.pf['Finesse Shot'] || p.pf['Dead Ball'] || 0) ? 1 : 0.7, side = (Math.sign(ty - PH2) || (p.y < PH2 ? -1 : 1)) * (out ? -1 : 1);   // v187: inward curl bows out wide, outward curl bows inside
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24, x = b.x + (tx - b.x) * u, y = b.y + (ty - b.y) * u + Math.sin(u * Math.PI) * side * curl * 3.5 + (kn ? Math.sin(u * Math.PI * 5) * 0.35 * u : 0), z = Math.sin(u * Math.PI) * 2.6 * (curl ? 1 : 0.55) - (kn ? Math.max(0, u - 0.7) * 1.2 : 0), s = proj(x, y, z); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }
      const g = ctx.createLinearGradient(0, 0, 0, 1); ctx.strokeStyle = 'rgba(120,230,255,.85)'; ctx.lineWidth = 0.9; ctx.stroke();
      const s0 = proj(b.x, b.y, 0), w = Math.max(5, s0.k * 0.9 / ZOOM);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.7; ctx.strokeRect(s0.x - w / 2, s0.y - w * 0.75, w, w * 0.75);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(s0.x - 0.8, s0.y - w * 0.4, 1.6, 1.6);
      this.fcText(ctx, kn ? 'KNUCKLEBALL' : out ? 'OUTSIDE FOOT CURLED' : 'INSIDE FOOT CURLED', s0.x, s0.y + 9, '#ffffff', 'center', 6, 800);
      this.fcText(ctx, 'A / D AIM · X SHOOT · Z KNUCKLEBALL · C CURL IN / OUT', s0.x, s0.y + 17, '#ffe15a', 'center', 5, 700);
    }
    // v186 (JODIO: "for penalties choose a side, accuracy from the stat"): your aim point on the goal with a spread circle sized by his Penalties stat
    if (this.penaltyKick && b.owner && this.ctlOf(b.owner)) {
      const p = b.owner, c = this.ctlOf(p), dir = this.teams[p.team].dir, gx = dir > 0 ? PITCH_W : 0, gy = PH2 + ((c && c.aim) || 0) * (GOAL_HALF - 0.55), pen = p.card.sub.penalties || 50;
      const r = 0.25 + Math.pow(1 - clamp(pen / 99, 0, 1), 1.3) * 3.2 * (p.tr.has('pen') ? 0.6 : 1), zc = 1.0;
      ctx.beginPath(); for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2, s2 = proj(gx, gy + Math.cos(a) * r, Math.max(0.05, zc + Math.sin(a) * r * 0.7)); if (i) ctx.lineTo(s2.x, s2.y); else ctx.moveTo(s2.x, s2.y); }
      ctx.fillStyle = 'rgba(255,225,90,.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,225,90,.95)'; ctx.lineWidth = 1; ctx.stroke();
      const sc = proj(gx, gy, zc); ctx.fillStyle = '#fff'; ctx.fillRect(sc.x - 1, sc.y - 1, 2, 2);
      const s0 = proj(b.x, b.y, 0); this.fcText(ctx, 'HOLD SHOOT, A / D TO PICK A SIDE · PENALTIES ' + pen, s0.x, s0.y + 9, '#ffe15a', 'center', 6, 800);
    }
    if (this.penaltyKick && b.owner && !this.ctlOf(b.owner) && this.ctls[1 - b.owner.team]) {   // v207: you are in goal: pick a dive
      const g = this.players.find(q => q.isGK && q.team !== b.owner.team), pk = g && g._penPick, s0 = g ? proj(g.x, g.y, 0) : null;
      if (s0) this.fcText(ctx, 'YOUR KEEPER: A / D DIVE LEFT / RIGHT · W / S STAY MIDDLE · ' + (pk == null || pk === 0 ? 'MIDDLE' : (pk * this.teams[b.owner.team].dir > 0 ? 'RIGHT' : 'LEFT')), s0.x, s0.y + 12, '#7fe0ff', 'center', 6, 800);
    }
    // v181 (JODIO: "copy FC27 corners"): at your corner, the delivery arc to the man it will find and a pulsing landing zone, with the delivery type
    if (sp && sp.kind === 'CORNER' && sp.taker && this.ctlOf(sp.taker) && b.owner === sp.taker) {
      const p = sp.taker, c = this.ctlOf(p), pow = c && c.hold ? 0.3 + 0.7 * (c.charge || 0) : 0.8, dir = this.teams[p.team].dir;
      let q = null; try { q = this.pickTarget(p, p.fx, p.fy, false, pow, true); } catch (e) { q = null; }
      if (q && q.x != null) {
        const kn = !!(c && c.spKnuckle), cv = c && (c.spCurve || 1) < 0 ? -1 : 1;
        const whip = kn ? 0 : ((p.pf['Whipped Pass'] || p.pf['Dead Ball'] || 0) ? 1 : 0.6) * -cv, d = Math.hypot(q.x - b.x, q.y - b.y);   // v187: an inswinger bows away from goal, an outswinger toward it
        ctx.setLineDash([2, 2]); ctx.beginPath();
        for (let i = 0; i <= 28; i++) { const u = i / 28, X = b.x + (q.x - b.x) * u + dir * Math.sin(u * Math.PI) * whip * 2.6, Y = b.y + (q.y - b.y) * u, Z = Math.sin(u * Math.PI) * (3 + d * 0.09), s = proj(X, Y, Z); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }
        ctx.strokeStyle = 'rgba(255,225,90,.9)'; ctx.lineWidth = 0.9; ctx.stroke(); ctx.setLineDash([]);
        const pr = 1.5 + 0.25 * Math.sin(this.t * 6);
        ring(q.x, q.y, pr, 'rgba(255,225,90,.95)', 1.3); ring(q.x, q.y, pr * 0.45, 'rgba(255,255,255,.8)', 0.8);
        const s0 = proj(b.x, b.y, 0);
        this.fcText(ctx, (kn ? 'KNUCKLEBALL' : cv > 0 ? 'INSWINGER' : 'OUTSWINGER') + ' · ' + (q.card ? q.card.name.split(' ').pop().toUpperCase() : ''), s0.x, s0.y + 9, '#ffe15a', 'center', 6, 800);
        this.fcText(ctx, 'A / D AIM · X CROSS · Z KNUCKLEBALL · C IN / OUT', s0.x, s0.y + 17, '#ffffff', 'center', 5, 700);
      }
    }
  };
  /** v167: a live FC-style match rating (6.0 start) from what he has done so far. */
  P.liveRating = function (p) {
    const S = this.pstat && this.pstat[p.team + '|' + p.card.name]; if (!S) return 6.0;
    const r = 6.0 + 0.03 * (S.pc || 0) + 0.3 * (S.key || 0) + 0.1 * (S.sot || 0) + 1.1 * (S.goal || 0) + 0.7 * (S.ast || 0) + 0.15 * (S.tkw || 0) + 0.12 * (S.int || 0) + 0.25 * (S.save || 0) + 0.04 * (S.skill || 0) - 0.15 * (S.foul || 0);
    return Math.max(3, Math.min(10, r));
  };
  P.pst = function (p, key) {
    if (!p || !p.card) return;
    const id = p.team + '|' + p.card.name, S = this.pstat[id] || (this.pstat[id] = { n: p.card.name, t: p.team, pos: p.fpos || p.card.position, ovr: p.card.rating, id: p.card.id });
    S[key] = (S[key] || 0) + 1;
  };
  P.pstEv = function (k, p, t) {
    if (!p || !this.pstat) return;
    if (k === 'pass') { this.pst(p, 'pass'); const pt = this.ball.passTo; this._lp[t] = { from: p, to: pt && pt.p, t: this.t }; }
    else if (k === 'shot') {
      this.pst(p, 'shot'); const lp = this._lp[t];
      if (lp && lp.to === p && lp.from !== p && this.t - lp.t < 7) { this.pst(lp.from, 'key'); this._kp[t] = { from: lp.from, t: this.t }; this._lp[t] = null; } else this._kp[t] = null;
    }
    else if (k === 'goal') { this.pst(p, 'goal'); const kp = this._kp[t]; if (kp && kp.from !== p && this.t - kp.t < 8) { this.pst(kp.from, 'ast'); this._kp[t] = null; } }
    else if (k === 'sot' || k === 'tk' || k === 'tkw' || k === 'foul' || k === 'save' || k === 'post' || k === 'skill') this.pst(p, k);
  };
  P.ev = function (k, p, o) {
    o = o || {}; const t = p ? p.team : o.team, R = this.rs && this.rs[t]; if (!R) return;
    this.pstEv(k, p, t);
    const dir = this.teams[t].dir; let z = null;
    if (k === 'pass') {
      R.pass++; if (o.lob) R.lob++; if (o.thru) R.thru++; if (o.cross) R.cross++;
      if (o.d > 26 || o.lob || o.thru) R.long++; else if (o.d < 14) R.short++;
      const fw = (o.tx - p.x) * dir; if (fw > 3) R.fwd++; else if (fw < -3) R.back++;
      if ((p.x - PW2) * dir > PITCH_W / 6) R.lane[p.y < PH2 - PITCH_H / 6 ? 0 : p.y > PH2 + PITCH_H / 6 ? 2 : 1]++;
      this.psAdd(p, 'pass'); if (o.thru) this.psAdd(p, 'thru'); if (o.cross) this.psAdd(p, 'cross'); if (o.lob) this.psAdd(p, 'lob');
      if (o.thru && this.rec && this.rec.mode === 'rec') this._lastThru = { team: t, tk: this.tk, by: p.card.name };
      return;
    }
    if (k === 'shot') { const dd = Math.abs((dir > 0 ? PITCH_W : 0) - p.x); z = dd < 18 ? 'box' : dd < 0.19 * PITCH_W ? 'edge' : 'far'; R.shot++; R[z]++; this._ls[t] = { tk: this.tk, z, dd }; o.z = z; o.dd = dd; }
    else if (k === 'sot') R.sot++;
    else if (k === 'goal') { const l = this._ls[t]; R['g' + (l && this.tk - l.tk < 400 ? l.z[0].toUpperCase() + l.z.slice(1) : 'Box')]++; if (l && this.tk - l.tk < 400) { o.z = l.z; o.dd = l.dd; } }
    else if (k === 'save') R.save++;
    else if (k === 'post') R.post++;
    else if (k === 'skill') R.skill++;
    else if (k === 'tk') R.tk++;
    else if (k === 'tkw') { R.tkw++; o.own = this.inBox(p, t); o.high = (p.x - PW2) * dir > 0; }
    else if (k === 'foul') R.foul++;
    if (p && k !== 'pass') { this.psAdd(p, k); if (k === 'shot' && z === 'far') this.psAdd(p, 'far'); if (k === 'goal' && o.z === 'far') this.psAdd(p, 'farGoal'); }
    if (this.rec && this.rec.mode === 'rec' && EVKEEP[k]) {
      const E = this.rec.events; if (E.length > 600) return;
      const e = { k, tk: this.tk, min: this.minute(), team: t, p: p ? p.card.name : null, sc: this.score.join('-') };
      if (o.z) { e.z = o.z; e.dd = Math.round(o.dd); }
      if (o.head) e.head = 1; if (o.volley) e.volley = 1; if (o.chip) e.chip = 1;
      if (o.by) e.by = o.by.card.name;
      if (k === 'tkw') { e.own = o.own ? 1 : 0; e.high = o.high ? 1 : 0; if (o.car) e.car = o.car.card.name; }
      if (k === 'skill') { e.kind = o.kind; if (o.sig) e.sig = 1; }
      if (k === 'goal') { const th = this._lastThru; if (th && th.team === t && this.tk - th.tk < 420) e.thru = th.by; const sk = this.rec.lastSkill; if (sk && sk.team === t && this.tk - sk.tk < 360) e.skill = sk.by; }
      if (k === 'skill') this.rec.lastSkill = { team: t, tk: this.tk, by: e.p };
      E.push(e);
    }
  };
  /** Possession changes (recoveries high up the pitch, losses in your own half) and, twice a second, the shape of each team: how high the back line sits when the other team has it, how wide the team plays with it. */
  P.rsStep = function () {
    const b = this.ball, ot = b.owner ? b.owner.team : -1;
    if (ot >= 0) {
      if (this._po >= 0 && this._po !== ot && !this.sp) {
        const adv = (b.x - PW2) * this.teams[ot].dir, W = this.rs[ot], L = this.rs[1 - ot];
        W.won++; if (adv > 0) W.wonHigh++; L.lost++; if (adv > 0) L.lostOwn++;
      }
      this._po = ot;
    }
    if (this.phase === 'play' && this.tk % 30 === 0 && ot >= 0) {
      for (let t = 0; t < 2; t++) {
        const out = this.players.filter(p => p.team === t && !p.isGK && !p.dummy); if (out.length < 5) continue;
        if (ot !== t) { const gx = this.teams[t].dir > 0 ? 0 : PITCH_W, d = out.map(p => Math.abs(p.x - gx)).sort((a, c) => a - c).slice(0, 4); this.rs[t].lineS += d.reduce((a, c) => a + c, 0) / d.length; this.rs[t].lineN++; }
        else { let lo = 1e9, hi = -1e9; out.forEach(p => { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }); this.rs[t].widS += hi - lo; this.rs[t].widN++; }
      }
    }
  };
  /** Start recording this (local, one-human) match. `snap` is the JSON of the match set-up, taken before the match was built. */
  P.recStart = function (snap) {
    this.rec = { mode: 'rec', snap, seed: this.seed0, inputs: [], ax: [], tcl: [], q: [], last: {}, events: [], brk: null, ticks: 0, lastSkill: null };
  };
  /** Each tick, before it runs: note what the human controllers hold (pad values are rounded to 1/1000 in the live game too, so playback is exact). */
  P.recSample = function () {
    const R = this.rec;
    this.ctls.forEach(c => {
      if (!c) return; const t = c.team, I = c.input, pd = c.pad || c.touch;
      let px = 0, py = 0, ps = 0;
      if (pd) { pd.x = Math.round(pd.x * 1000) / 1000; pd.y = Math.round(pd.y * 1000) / 1000; px = pd.x; py = pd.y; ps = pd.sprint ? 1 : 0; }
      const m = (I.up ? 1 : 0) | (I.down ? 2 : 0) | (I.left ? 4 : 0) | (I.right ? 8 : 0) | (I.sprint ? 16 : 0) | (ps ? 32 : 0);
      const L = R.last[t] || (R.last[t] = [0, 0, 0]), acts = R.q.filter(e => e[0] === t).map(e => e[1]);
      if (m !== L[0] || px !== L[1] || py !== L[2] || acts.length) { L[0] = m; L[1] = px; L[2] = py; R.inputs.push(acts.length ? [this.tk, t, m, px, py, acts] : [this.tk, t, m, px, py]); }
    });
    R.q.length = 0;
  };
  /** Playback: apply the recorded inputs that fall on this tick. */
  P.recApply = function () {
    const R = this.rec, A = R.inputs;
    while (R.i < A.length && A[R.i][0] <= this.tk) {
      const e = A[R.i++], c = this.ctls[e[1]]; if (!c) continue;
      const m = e[2], I = c.input;
      I.up = !!(m & 1); I.down = !!(m & 2); I.left = !!(m & 4); I.right = !!(m & 8); I.sprint = !!(m & 16);
      c.touch = null; c.pad = (e[3] || e[4] || (m & 32)) ? { x: e[3], y: e[4], sprint: !!(m & 32) } : null;
      if (e[5]) e[5].forEach(code => { const a = NET_ACTS[code >> 1]; if (a) this.action(c, a, !!(code & 1)); });
    }
  };
  /** Set up playback of a stored recording on a freshly built identical match. */
  P.recPlay = function (inputs, ax, tcl) {
    const amap = {}; (ax || []).forEach(e => { amap[e[0] + ':' + e[1]] = e[2]; });
    this.rec = { mode: 'play', inputs, i: 0, tcl: tcl || [], ti: 0, axAt: (tk, t, d) => { const v = amap[tk + ':' + t]; return v === undefined ? d : v; } };
    this.ctls.forEach(c => { if (c) { c.keys = 'none'; c.pad = null; c.touch = null; } });
  };
  /* ---- v113: tactic changes during a match (yours, by button, and the coach's own) ---- */
  // Each change is a set of knob deltas laid over the tactic the match started with; an axis (attack, pressing, line...) can be pushed two steps either way.
  const QUICK = {
    attack:    { ax: 'att', s: 1,  cap: 2, name: 'Attack more',        add: { runs: 1, line: 2.5, fbHigh: 4, shoot: 0.08, backFwd: -1.5 } },
    defend:    { ax: 'att', s: -1, cap: 2, name: 'Defend more',        add: { runs: -1, line: -4, backFwd: 4, restGap: 2, pressZone: -0.15, fbHigh: -4 } },
    pressUp:   { ax: 'prs', s: 1,  cap: 2, name: 'Press higher',       add: { press: 1.5, pressZone: 0.25, counterPress: 4, aggro: 0.1, line: 2 } },
    pressDown: { ax: 'prs', s: -1, cap: 2, name: 'Press lower',        add: { press: -1.5, pressZone: -0.25, counterPress: -4, line: -2 } },
    lineUp:    { ax: 'ln',  s: 1,  cap: 2, name: 'Defensive line up',  add: { line: 7, restGap: -1.5, backFwd: -1 } },
    lineDown:  { ax: 'ln',  s: -1, cap: 2, name: 'Defensive line down', add: { line: -6, backFwd: 3, restGap: 1.5 } },
    wide:      { ax: 'wd',  s: 1,  cap: 2, name: 'Play wider',         add: { width: 0.15, fbHigh: 5, inside: -0.15, cross: 0.25 } },
    narrow:    { ax: 'wd',  s: -1, cap: 2, name: 'Play narrower',      add: { width: -0.12, inside: 0.4, cross: -0.15 } },
    direct:    { ax: 'dr',  s: 1,  cap: 2, name: 'More direct',        add: { vert: 0.3, range: 0.25, shortW: -0.25, targetMan: 1.5 } },
    short:     { ax: 'dr',  s: -1, cap: 2, name: 'Short passing',      add: { shortW: 0.3, vert: -0.25, range: -0.2, eager: 1.5, link: 0.3 } },
    counter:   { ax: 'cn',  s: 1,  cap: 1, name: 'Counter-attack',     add: { counter: 0.5, vert: 0.25, runs: 0.7, line: -2 } },
  };
  P.tacShift = function (team, key, auto) {
    if (!this.tac0) { this.tac0 = this.tac.slice(); this.qn = [{}, {}]; this.qsum = [{}, {}]; }
    let label;
    if (key === 'reset') { this.qn[team] = {}; this.qsum[team] = {}; this.tac[team] = this.tac0[team]; label = 'Back to the starting tactic'; }
    else {
      const Q = QUICK[key]; if (!Q) return false;
      const n = this.qn[team][Q.ax] || 0, nn = n + Q.s; if (Math.abs(nn) > Q.cap) return false;
      this.qn[team][Q.ax] = nn; const sum = this.qsum[team];
      Object.keys(Q.add).forEach(k => { sum[k] = (sum[k] || 0) + Q.add[k]; });
      this.tac[team] = applyCoach(this.tac0[team], { add: sum }); label = Q.name;
    }
    if (!auto && this.rec && this.rec.mode === 'rec') this.rec.tcl.push([this.tk, team, key]);
    if (!this.headless) { this.ticker = (auto ? 'COACH: ' : 'TACTIC: ') + label.toUpperCase(); this.tickerT = 3; }
    return label;
  };
  /** Playback: the recorded manual changes, applied just before the tick they were made in. */
  P.tclApply = function () { const R = this.rec, A = R.tcl || []; while (R.ti < A.length && A[R.ti][0] < this.tk) { const e = A[R.ti++]; this.tacShift(e[1], e[2], true); } };
  /** The coach reads the match every 3 seconds (never twice within 20 s) from the score, the clock, the shots and the ball, and moves the tactic one step: chase a goal late, protect a lead, drop deeper when outshot, go wide when it has the ball but no chances. */
  P.autoStep = function () {
    const A = this.cfg.autoCoach; if (!this.autoLog) this.autoLog = [];
    for (let t = 0; t < 2; t++) {
      if (!A[t]) continue;
      const last = this.autoLog.filter(x => x.team === t).slice(-1)[0]; if (last && this.tk - last.tk < 1200) continue;
      if (!this.tac0) this.tacShift(t, '__init', true);
      const n = (this.qn && this.qn[t]) || {}, my = this.score[t], op = this.score[1 - t], d = my - op, frac = this.t / (2 * this.halfSeconds), R = this.rs[t], O = this.rs[1 - t];
      const tot = this.stats.possession[0] + this.stats.possession[1] || 1, poss = this.stats.possession[t] / tot;
      let key = null, why = '';
      if (d < 0 && frac >= 0.55 && (n.att || 0) < (d <= -2 ? 2 : 1)) { key = 'attack'; why = 'we are behind, we need a goal'; }
      else if (d < 0 && frac >= 0.8 && (n.dr || 0) < 1) { key = 'direct'; why = 'running out of time, go direct'; }
      else if (d > 0 && frac >= 0.7 && (n.att || 0) > (d >= 2 ? -2 : -1)) { key = 'defend'; why = 'protect the lead'; }
      else if (d >= 0 && frac > 0.2 && O.shot - R.shot >= 4 && (n.ln || 0) > -1) { key = 'lineDown'; why = 'we are being outshot, sit deeper'; }
      else if (d <= 0 && frac > 0.3 && poss > 0.58 && R.shot < 3 && (n.wd || 0) < 1) { key = 'wide'; why = 'plenty of the ball but no chances, stretch them'; }
      else if (d === 0 && frac > 0.85 && (n.att || 0) < 1) { key = 'attack'; why = 'level late on, go for the win'; }
      else if (d === 0 && frac < 0.55 && last && (last.key === 'attack' || last.key === 'direct' || last.key === 'defend') && ((n.att || 0) !== 0 || (n.dr || 0) > 0)) { key = 'reset'; why = 'back to the plan'; }
      if (key && key !== '__init') { const lab = this.tacShift(t, key, true); if (lab) this.autoLog.push({ tk: this.tk, team: t, key, label: lab, why, min: this.minute(), sc: this.score.join('-') }); }
    }
  };

  /** Highlight reel: `clips` = [{a, b, k}] ticks in order. Between clips the match is simulated without drawing; inside a clip it plays at normal speed, slowed around the key moment k. */
  P.reelStart = function (clips, cb) { this.reel = { clips, i: 0, mode: 'ff', acc: 0, cb: cb || {} }; this._reelNew = true; };
  P.reelFrame = function (dt) {
    const R = this.reel; if (!R || R.done) return;
    if (R.i < R.clips.length && R.clips[R.i].b <= this.tk) R.i++;                                                       // overtaken (overlap): skip it
    const cl = R.clips[R.i];
    if (!cl || this.over) { R.done = true; if (R.cb.done) R.cb.done(); return; }
    if (R.mode === 'ff') {
      if (this._reelNew) { this._reelNew = false; if (R.cb.cue) R.cb.cue(R.i, cl); }
      const t0 = performance.now(); while (this.tk < cl.a && !this.over && performance.now() - t0 < 14) this.update(1 / 60);
      if (this.tk >= cl.a || this.over) { R.mode = 'play'; R.acc = 0; if (R.cb.start) R.cb.start(R.i, cl); }
      return;
    }
    const near = Math.abs(this.tk - cl.k) < 30;
    R.acc = Math.min(R.acc + dt * (near ? 0.5 : 1), 4 / 60);
    while (R.acc >= 1 / 60 && this.tk < cl.b && !this.over) { this.update(1 / 60); R.acc -= 1 / 60; }
    if (this.tk >= cl.b || this.over) { R.i++; R.mode = 'ff'; this._reelNew = true; if (R.cb.end) R.cb.end(R.i - 1); }
  };
  P.reelSkip = function () { const R = this.reel; if (!R || R.done) return; R.i++; R.mode = 'ff'; this._reelNew = true; };

  /* ============================ RUNTIME LOOP ============================= */
  // keyboard layouts: one human uses every key; two humans share the keyboard (P1 left side, P2 right side)
  const KEYS = {
    all: { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyZ: 'pass', KeyJ: 'pass', KeyX: 'shoot', KeyK: 'shoot', KeyC: 'through', KeyL: 'through', KeyV: 'lob', KeyI: 'lob', KeyQ: 'sig', KeyE: 'step', KeyR: 'feint', Space: 'sig' },
    p1: { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ShiftLeft: 'sprint', KeyF: 'pass', KeyG: 'shoot', KeyH: 'through', KeyT: 'lob', KeyQ: 'sig', KeyE: 'step', KeyR: 'feint', KeyY: 'sig' },
    p2: { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ShiftRight: 'sprint', KeyJ: 'pass', KeyK: 'shoot', KeyL: 'through', KeyI: 'lob',
      Comma: 'pass', Period: 'shoot', Slash: 'through', Semicolon: 'lob', Numpad0: 'sprint', Numpad1: 'pass', Numpad2: 'shoot', Numpad3: 'through', Numpad4: 'lob', Digit7: 'sig', Digit8: 'step', Digit9: 'feint', Digit0: 'sig' },
  };
  KEYS.none = {};                                                  // an online opponent's controller: its input arrives over the network, never the keyboard
  const SKILL_KEYS = { roll: 1, step: 1, feint: 1, knock: 1, sig: 1 };
  const MOVE = { up: 1, down: 1, left: 1, right: 1, sprint: 1 };

  /**
   * A pass / shoot / through / lob button going down or up for one controller. On the ball every button charges a
   * power bar while held and fires on release; off the ball they act at once (tackle, slide, switch, team-mate press).
   */
  P.action = function (c, a, down) {
    if (this.rec && this.rec.mode === 'rec' && NET_ACT_ID[a] != null) this.rec.q.push([c.team, NET_ACT_ID[a] * 2 + (down ? 1 : 0)]);      // v108: every button goes in the match recording
    if (this.phase === 'replay') { if (down && !this.net) this._rpT = 1e9; return; }                 // any button skips the replay (not online)
    if (SKILL_KEYS[a]) { if (down) c.queued = a; return; }   // skill moves are single taps
    if (a === 'lob') c.pressHeld = down;
    const onBall = this.ball.owner && this.ball.owner === c.controlled;
    if (c.strike) { if (down && a === 'shoot' && c.strike.press == null) c.strike.press = c.strike.t; return; }   // the timing press
    if (down && a === 'shoot' && c.grace > 0) return;
    const spm = onBall && this.spMode(c.controlled, c);
    if (spm && (a === 'pass' || a === 'through')) {                                 // v187: Z = knuckleball on / off, C = curl inward / outward
      if (down) { if (a === 'pass') c.spKnuckle = !c.spKnuckle; else { c.spCurve = (c.spCurve || 1) > 0 ? -1 : 1; c.spKnuckle = false; } }
      return;
    }
    if (spm && spm.corner && a === 'shoot') {                                        // X delivers the corner: a lofted ball to the man nearest the aim
      if (down) { c.hold = 'lob'; c.charge = 0; } else if (c.hold === 'lob') { c.hold = null; c.power = Math.max(0.55, c.charge); c.queued = 'lob'; }
      return;
    }
    if (down && onBall && c.hold === 'shoot' && (a === 'lob' || a === 'through')) { c.mod = c.mod || {}; c.mod[a] = true; return; }
    if (!down && (a === 'lob' || a === 'through') && c.hold === 'shoot') return;
    if (down && onBall) { c.hold = a; c.charge = 0; if (a === 'shoot' && !spm) { c.aim = 0; c.wd = 0; c.aimSet = null; c.hfx = null; c.hfy = null; c.side = 0; c.sideT = 0; } return; }
    if (!down) { if (c.hold === a) { if (a === 'shoot') c.aimSet = c.aim; c.hold = null; c.power = c.charge; c.queued = a; } return; }
    if (a !== 'lob') c.queued = a;
  };

  /** Gamepads (standard mapping): pad 1 → first human, pad 2 → second. Stick / d-pad move, A pass, B shoot, X through, Y lob, bumpers / triggers sprint. */
  P.pollPads = function () {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let pads; try { pads = Array.from(navigator.getGamepads()).filter(Boolean); } catch (e) { return; }
    if (this.net) {                                                                                  // online: the first pad drives my own player
      const g = pads[0], n = this.net; if (!g) { n.pad = null; return; }
      const B = k => !!(g.buttons[k] && g.buttons[k].pressed);
      let x = Math.abs(g.axes[0] || 0) > 0.3 ? g.axes[0] : 0, y = Math.abs(g.axes[1] || 0) > 0.3 ? g.axes[1] : 0;
      if (B(14)) x = -1; if (B(15)) x = 1; if (B(12)) y = -1; if (B(13)) y = 1;
      const now = { pass: B(0), shoot: B(1), through: B(2), lob: B(3) }, prev = n.padPrev || {};
      for (const a in now) if (now[a] !== !!prev[a]) this.netIn(a, now[a]);
      n.padPrev = now; n.pad = { x, y, sprint: B(4) || B(5) || B(6) || B(7) };
      return;
    }
    this.ctls.filter(Boolean).sort((a, b) => a.idx - b.idx).forEach((c, i) => {
      const g = pads[i]; if (!g) { c.pad = null; return; }
      const B = k => !!(g.buttons[k] && g.buttons[k].pressed);
      let x = Math.abs(g.axes[0] || 0) > 0.3 ? g.axes[0] : 0, y = Math.abs(g.axes[1] || 0) > 0.3 ? g.axes[1] : 0;
      if (B(14)) x = -1; if (B(15)) x = 1; if (B(12)) y = -1; if (B(13)) y = 1;
      const now = { pass: B(0), shoot: B(1), through: B(2), lob: B(3) }, prev = c.padPrev || {};
      for (const a in now) if (now[a] !== !!prev[a]) this.action(c, a, now[a]);
      c.padPrev = now; c.pad = { x, y, sprint: B(4) || B(5) || B(6) || B(7) };
    });
  };

  /* ============================ ONLINE (lockstep) ============================ */
  // Both machines build the same match (same seed, same two squads) and run the same fixed 60 Hz simulation. Only controller inputs travel:
  // what I press at tick n is played at tick n + D on both machines, so the two simulations never differ. The sim waits (and says so) when
  // the other side's inputs for the tick haven't arrived yet. Every second both sides compare a hash of the state to spot a desync.
  const NET_ACTS = ['pass', 'shoot', 'through', 'lob', 'roll', 'step', 'feint', 'knock', 'sig'], NET_ACT_ID = {}; NET_ACTS.forEach((a, i) => { NET_ACT_ID[a] = i; });
  /** net = { me: 0|1, send(msg) }. D = input delay in ticks (8 = 133 ms). */
  P.netSetup = function (net) {
    const n = this.net = Object.assign({ D: 8, tick: 0, frames: [{}, {}], acts: [], cur: { up: 0, down: 0, left: 0, right: 0, sprint: 0 }, pad: null, rx: [-1, -1], peerAck: -1,
      hashes: {}, theirHash: {}, desync: false, stall: 0, lastRx: performance.now(), sentAt: 0 }, net);
    this.ctls.forEach((c, i) => { if (c) c.keys = i === n.me ? 'all' : 'none'; });
    for (let k = 0; k < n.D; k++) { n.frames[0][k] = 0; n.frames[1][k] = 0; }
    n.rx = [n.D - 1, n.D - 1]; this.speed = 1; this.paused = false;
  };
  P.netIn = function (a, down) {
    const n = this.net; if (!n) return;
    if (MOVE[a]) n.cur[a] = down ? 1 : 0; else if (NET_ACT_ID[a] != null && n.acts.length < 24) n.acts.push(NET_ACT_ID[a] * 2 + (down ? 1 : 0));
  };
  P.netCapture = function () {
    const n = this.net, c = n.cur, pd = n.pad || n.touch;
    let m = (c.up ? 1 : 0) | (c.down ? 2 : 0) | (c.left ? 4 : 0) | (c.right ? 8 : 0) | (c.sprint ? 16 : 0), px = 0, py = 0;
    if (pd && (pd.x || pd.y)) { px = Math.round(clamp(pd.x, -1, 1) * 100); py = Math.round(clamp(pd.y, -1, 1) * 100); }
    { const mc = this.ctls[n.me]; if (mc && mc.mouseAim && mc.hold === 'shoot' && mc.controlled && this.ball.owner === mc.controlled) { px = Math.round(100 * this.mouseAxis(mc.controlled, mc, 1.6)); py = 0; m &= ~(1 | 2 | 4 | 8); } }
    if (pd && pd.sprint) m |= 32;
    const a = n.acts; n.acts = [];
    return (m === 0 && !px && !py && !a.length) ? 0 : [m, px, py, a];
  };
  P.netApply = function (c, f) {
    if (!c) return;
    const I = c.input, m = f ? f[0] | 0 : 0, px = f ? f[1] | 0 : 0, py = f ? f[2] | 0 : 0;
    I.up = !!(m & 1); I.down = !!(m & 2); I.left = !!(m & 4); I.right = !!(m & 8); I.sprint = !!(m & 16);
    c.pad = (px || py || (m & 32)) ? { x: px / 100, y: py / 100, sprint: !!(m & 32) } : null;
    if (f && f[3]) f[3].forEach(e => { const a = NET_ACTS[(e | 0) >> 1]; if (a) this.action(c, a, !!(e & 1)); });
  };
  P.netHash = function () {
    let h = 2166136261 >>> 0; const mix = v => { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619) >>> 0; };
    this.players.forEach(p => { mix(p.x); mix(p.y); }); const b = this.ball; mix(b.x); mix(b.y); mix(b.z); mix(this.score[0] * 7 + this.score[1]); mix(this.t);
    return h;
  };
  /** One simulation tick, or false when the opponent's input for it hasn't arrived. */
  P.netStep = function (step) {
    const n = this.net;
    if (n.frames[0][n.tick] === undefined || n.frames[1][n.tick] === undefined) { n.stall += step; return false; }
    n.stall = 0;
    n.frames[n.me][n.tick + n.D] = this.netCapture();
    this.ctls.forEach((c, i) => this.netApply(c, n.frames[i][n.tick]));
    this.update(step);
    n.tick++;
    if (n.tick % 60 === 0) {
      const h = this.netHash(); n.hashes[n.tick] = h;
      if (n.theirHash[n.tick] != null && n.theirHash[n.tick] !== h) n.desync = true;
      delete n.hashes[n.tick - 600]; delete n.theirHash[n.tick - 600];
    }
    for (let i = 0; i < 2; i++) { const old = n.tick - 2; if (i !== n.me && n.frames[i][old] !== undefined) delete n.frames[i][old]; }
    return true;
  };
  /** Send my inputs the other side hasn't acknowledged, about 22 times a second. */
  P.netPump = function (now) {
    const n = this.net; if (now - n.sentAt < (n.pumpMs || 40)) return; n.sentAt = now;   // v209: through the website relay, about 14 a second (each message carries every unacknowledged frame)
    const peer = 1 - n.me, from = n.peerAck + 1, latest = n.tick + n.D - 1, f = [];
    for (let k = from; k <= latest && f.length < 60; k++) { const x = n.frames[n.me][k]; f.push(x === undefined ? 0 : x); }
    for (const k in n.frames[n.me]) if (+k < Math.min(n.peerAck, n.tick) - 2) delete n.frames[n.me][k];
    const hk = n.tick - (n.tick % 60), msg = { s: from, f, a: n.rx[peer], t: n.tick };
    if (hk > 0 && n.hashes[hk] != null) msg.h = [hk, n.hashes[hk]];
    n.send(msg);
  };
  /** Input from the other player (a message from netPump on their side). */
  P.netRecv = function (msg) {
    const n = this.net; if (!n || !msg || typeof msg !== 'object') return;
    const peer = 1 - n.me; n.lastRx = performance.now();
    if (Array.isArray(msg.f) && Number.isInteger(msg.s) && msg.s >= 0 && msg.s < 1e7 && msg.f.length <= 200) {
      msg.f.forEach((f, i) => {
        const k = msg.s + i; if (n.frames[peer][k] !== undefined || k < n.tick - 1) return;
        n.frames[peer][k] = Array.isArray(f) ? [f[0] | 0, f[1] | 0, f[2] | 0, Array.isArray(f[3]) ? f[3].slice(0, 24).map(e => e | 0) : []] : 0;
      });
      while (n.frames[peer][n.rx[peer] + 1] !== undefined) n.rx[peer]++;
    }
    if (Number.isInteger(msg.a)) n.peerAck = Math.max(n.peerAck, msg.a);
    if (Array.isArray(msg.h) && msg.h.length === 2) { n.theirHash[msg.h[0]] = msg.h[1]; if (n.hashes[msg.h[0]] != null && n.hashes[msg.h[0]] !== msg.h[1]) n.desync = true; }
  };

  /** Attach to a canvas and run with requestAnimationFrame (fixed 60 Hz steps). */
  P.start = function (canvas) {
    this.canvas = canvas; this._q = 1;
    { let g = '3d'; try { g = localStorage.getItem('rut_gfx') || '3d'; } catch (e) {} if (window.RUT_LITE && /^(3d|ultra|high|auto)$/.test(g)) { this.gfx = 'low'; this._q = GFX_Q.low; } else this.setGfx(GFX_Q[g] ? g : '3d'); }   // v200 Lite mode: 2D Low, no WebGL, no 600 KB three.js download   // v151: Full 3D unless the player chose another look canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });   // GPU-composited canvas, low-latency presentation
    const step = 1 / 60;
    let acc = 0, last = performance.now();
    this.onKeyDown = e => {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;   // typing in the testing-ground panel is not play
      let used = false;
      this.ctls.forEach(c => {
        const a = c && KEYS[c.keys][e.code]; if (!a) return;
        used = true;
        if (this.net) { if (MOVE[a] || !e.repeat) this.netIn(a, true); return; }
        if (MOVE[a]) c.input[a] = true; else if (!e.repeat) this.action(c, a, true);
      });
      if (used) e.preventDefault();
      if (this.training && !e.repeat) {
        if (e.code === 'KeyB') this.trainBall(); else if (e.code === 'KeyN') this.trainReset();
        else if (e.code === 'KeyF') this.trainFeed('cross'); else if (e.code === 'KeyG') this.trainFeed('ground');
        else if (e.code === 'Digit7') this.trainSet('fk'); else if (e.code === 'Digit8') this.trainSet('pen');
      }
      if ((e.code === 'KeyP' || e.code === 'Escape') && !this.net) this.paused = !this.paused;   // an online match can't be paused
      if (e.code === 'KeyL' && !e.repeat) this.tagMode = (this.tagMode + 1) % 3;
      if (e.code === 'KeyM') { this.nextCamera(); if (this.onCamera) this.onCamera(this.camMode); }
    };
    this.onKeyUp = e => {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      this.ctls.forEach(c => {
        const a = c && KEYS[c.keys][e.code]; if (!a) return;
        if (this.net) { this.netIn(a, false); return; }
        if (MOVE[a]) c.input[a] = false; else this.action(c, a, false);
      });
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const frame = now => {
      if (this.stopped) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!this.rec || this.rec.mode !== 'play') this.pollPads();
      if (this.net) {
        acc = Math.min(acc + dt, step * 12);
        for (let k = 0; k < 4 && acc >= step && !this.over && this.netStep(step); k++) acc -= step;       // catching up after a stall takes a few ticks a frame, not one big jump
        this.netPump(now, dt);
      } else if (this.reel) { if (!this.paused) this.reelFrame(dt);
      } else if (!this.paused) {
        acc += dt * this.speed;
        acc = Math.min(acc, step * (this.speed > 1 ? 8 : 4));              // a slow frame never snowballs into a burst of catch-up steps: the game just runs a touch slower
        while (acc >= step) { this.update(step); acc -= step; }
      }
      // v105: the simulation runs at 60 Hz, so drawing more often than 60 times a second on a 90 / 120 / 144 Hz screen only repeats the same picture:
      // draw at most ~60 fps (a 120 Hz screen draws every 2nd frame, 144 Hz about every 2.4th). Half the drawing work there, same look.
      if (this.reel && this.reel.mode === 'ff') { this.raf = requestAnimationFrame(frame); return; }                   // v108: cueing the next highlight: simulate without drawing
      const FT = window.RUT_LITE ? 33.333 : 16.667;                                                     // v200 Lite mode draws at 30 fps (the simulation stays 60 Hz)
      this._ra = Math.min((this._ra || 0) + dt * 1000, FT * 3.6);
      if (this._ra < FT - 5.7) { this.raf = requestAnimationFrame(frame); return; }
      this._ra = Math.max(-6, this._ra - FT);
      const dtR = Math.min(0.1, (now - (this._lastR || now - 16.7)) / 1000); this._lastR = now;
      this.render(ctx);
      // adaptive resolution: if frames keep taking too long, step the canvas down (1440 -> 1080 -> 720 wide), never below 3/4 of that
      this._ft = (this._ft || 16.7) * 0.9 + dtR * 1000 * 0.1; this._fn = (this._fn || 0) + 1;
      if (this.gfx === 'auto' && this._fn > 40 && this._ft > 22 && this._q > 0.34) { const i0 = Q_STEPS.findIndex(v => v < this._q - 0.001); this._q = Q_STEPS[Math.min(Q_STEPS.length - 1, i0 + (this._ft > 36 ? 1 : 0))]; this._fn = 0; this._ft = 16.7; }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    // v96: the match keeps playing when the tab is hidden or another window is in front (browsers freeze requestAnimationFrame there).
    // A worker's clock is not throttled, so it drives the simulation (no drawing) and the frame loop picks up again when the tab is back. Local matches only.
    let bg = null;
    const bgStop = () => { if (bg) { try { bg.terminate(); } catch (e) { /* gone */ } bg = null; } };
    const bgTick = () => {
      if (this.stopped || this.net || this.reel || !document.hidden) return;
      const now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
      if (this.paused) return;
      acc = Math.min(acc + dt * this.speed, step * 40);
      if (this.rec && this.rec.mode === 'rec' && this.rec.brk == null) this.rec.brk = this.tk;                           // v108: the hidden-tab shortcut changes the sim path, so the recording is only exact up to here
      const hl = this.headless; this.headless = true;                                    // no effects or cloth to pile up while nobody watches
      try { for (let n = 0; acc >= step && n < 40; n++) { this.update(step); acc -= step; } } finally { this.headless = hl; }
    };
    this.onVis = () => {
      if (this.net || this.stopped || this.reel) return;
      if (document.hidden) {
        last = performance.now();
        if (!bg) { try { bg = new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},40)'], { type: 'text/javascript' }))); bg.onmessage = bgTick; } catch (e) { bg = null; this._bgFallback = setInterval(bgTick, 250); } }
      } else { bgStop(); if (this._bgFallback) { clearInterval(this._bgFallback); this._bgFallback = null; } last = performance.now(); }
    };
    document.addEventListener('visibilitychange', this.onVis);
    this._bgStop = bgStop;
  };

  P.stop = function () {
    this.stopped = true; cancelAnimationFrame(this.raf);
    if (this.onVis) document.removeEventListener('visibilitychange', this.onVis);
    if (this._bgStop) this._bgStop(); if (this._bgFallback) clearInterval(this._bgFallback);
    if (this._u3) { try { this._u3.dispose(); } catch (e) { /* gone */ } this._u3 = null; }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  };

  /** On-screen analog stick (touch): x, y in -1..1, sprint. Kept apart from gamepads so the two never overwrite each other. */
  P.setStick = function (x, y, sprint, who) {
    const t = (x || y || sprint) ? { x, y, sprint: !!sprint } : null;
    if (this.net) { this.net.touch = t; return; }
    const c = this.ctls[who != null ? who : this.human]; if (c) c.touch = t;
  };

  /** Virtual-button API for touch/on-screen controls (who: team index of the human, default the first). */
  P.press = function (action, down, who) {
    if (this.net) { this.netIn(action, down); return; }
    const c = this.ctls[who != null ? who : this.human]; if (!c) return;
    if (MOVE[action]) { c.input[action] = down; return; }
    this.action(c, action, down);
  };

  /* ============================== HELPERS ================================ */
  /** Headless full match: AI vs AI, fixed 30 Hz steps, returns the result. */
  function simulate(home, away, opts) {
    opts = opts || {};
    const m = new Match({ home, away, humanTeam: null, halfSeconds: opts.halfSeconds || 90, seed: opts.seed, styles: opts.styles, tacGain: opts.tacGain, pitch: opts.pitch, coach: opts.coach, plays: opts.plays, train: opts.train });
    m.headless = true;
    const step = 1 / 30;
    let guard = 0;
    while (!m.over && guard++ < 100000) m.update(step);
    if (m.planLog && m.result) m.result.plan = m.planLog;
    return m.result;
  }

  /** Build an AI opponent XI for a difficulty level. */
  const DIFFICULTY = {
    amateur: { name: 'Sunday League XI', lo: 60, hi: 70, pool: 'reserves' },
    semi: { name: 'Semi-Pro United', lo: 68, hi: 76, pool: 'reserves' },
    pro: { name: 'Pro Athletic', lo: 75, hi: 82, pool: 'all' },
    world: { name: 'World Class FC', lo: 83, hi: 87, pool: 'players' },
    legendary: { name: 'Legendary Galácticos', lo: 87, hi: 99, pool: 'players' },
  };
  function buildOpponent(level, seed) {
    const d = typeof level === 'object' && level ? level : DIFFICULTY[level] || DIFFICULTY.pro;
    const r = RUT.DB.rng(seed != null ? seed : (Math.random() * 1e9) | 0);
    const pool = RUT.DB[d.pool].filter(c => !c.promo && c.rating >= d.lo && c.rating <= d.hi);
    const used = new Set();
    const cards = RUT.State.BASE_FORMATION.map(pos => {
      let opts = pool.filter(c => c.altPositions.includes(pos) && !used.has(c.id) && (!d.gkLo || pos !== 'GK' || c.rating >= d.gkLo));
      if (!opts.length) opts = RUT.DB.all.filter(c => !c.promo && c.altPositions.includes(pos) && c.rating >= (d.floor || d.lo - 6) && c.rating <= d.hi && !used.has(c.id));
      if (!opts.length) opts = pool.filter(c => !used.has(c.id));
      const c = opts[Math.floor(r() * opts.length)];
      used.add(c.id); return c;
    });
    return { name: d.name, short: d.name.split(' ')[0], cards };
  }

  RUT.Engine = { Match, simulate, boardSim, ORDERS, formSpots, BOARD_SCN, BOARD_OPP, applyCoach, QUICK, buildOpponent, DIFFICULTY, TACTIC_TRAITS, FC_BUILD, FC_DEF, FC_PRESETS, buildTactic, parseTactic, tacFix, tacSpec, TAC_MAXPTS, FORMATIONS, FORM_KEYS, VIEW_W, VIEW_H, OUT_W, OUT_H, PITCH_W, PITCH_H, PITCH_SIZES };
})();
