/* =============================================================================
 * pixelart.js  —  shared pixel-figure renderer
 * -----------------------------------------------------------------------------
 * One full-body pixel footballer, drawn in the style of JODIO's reference art
 * (the "150 player full body pixel" index): big head, real club kit pattern,
 * long socks, coloured boots and a soft dark outline.
 *
 * "3D" comes from three things:
 *   - every body part is lit like a cylinder (light from the upper left), done
 *     as semi-transparent overlays so stripes and sleeves stay correctly shaded;
 *   - the figure has three views: front, side (mirrored for the other side) and
 *     back, and the match picks one from the way the player is facing;
 *   - the back view shows the player's real shirt number.
 *
 * Used twice so the card and the pitch always match:
 *   - main.js renders it big on every card (cardFigure, club kit, front view);
 *   - engine.js renders it small, scaled by depth, for players in a match (sprite).
 *
 * A player's skin, hair colour and beard come from their real portrait when we
 * have one (RUT.LOOKS, sampled from js/faces.js); otherwise they are seeded from
 * the name, so the same player always looks the same.
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';

  const SS = 1.4;                    // v127 'HD' sprites: drawn at 1.4x the device size with extra parts, then filtered down
  let HD = true;
  const BASE = 64, FEET = 61 / 64;   // sprite canvas at scale 1 (cards) and where the feet sit in it; matches render at their own scale

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = s => clamp(Math.round(f >= 0 ? s + (255 - s) * f : s * (1 + f)), 0, 255);
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch).map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function lum(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

  const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a86b3c', '#6e4020'];
  const HAIRS = ['#1a1210', '#2a1a10', '#3b2414', '#5a3a1e', '#8a5a2a', '#c8a050', '#e0c070', '#101010'];
  const STYLES = ['short', 'short', 'fade', 'fade', 'curly', 'buzz', 'long', 'bald'];
  const BOOTS = ['#1e6fe0', '#111111', '#f4f4f4', '#ff7a1a', '#e01e5a', '#20c070', '#f0d020'];

  /**
   * Real home-kit designs: [pattern, pattern colour, shorts, socks].
   * Patterns: plain, stripes (vertical), sleeves (contrast sleeves), band (central
   * vertical band with white edges, PSG style), wideband (Ajax), hband (chest band),
   * halves, diag (diagonal split), hoops. Clubs not listed wear a plain shirt.
   */
  const CLUB_KITS = {
    'Arsenal': ['sleeves', '#ffffff', '#ffffff', '#ef0107'],
    'Man City': ['plain', null, '#ffffff', '#6cabdd'],
    'Liverpool': ['plain', null, '#c8102e', '#c8102e'],
    'Chelsea': ['plain', null, '#034694', '#ffffff'],
    'Man Utd': ['plain', null, '#ffffff', '#111111'],
    'Newcastle': ['stripes', '#ffffff', '#111111', '#111111'],
    'Aston Villa': ['sleeves', '#95bfe5', '#ffffff', '#670e36'],
    'West Ham': ['sleeves', '#1bb1e7', '#ffffff', '#ffffff'],
    'Brentford': ['stripes', '#ffffff', '#111111', '#e30613'],
    'Tottenham': ['plain', null, '#132257', '#ffffff'],
    'Nottm Forest': ['plain', null, '#ffffff', '#dd0000'],
    'Sunderland': ['stripes', '#ffffff', '#111111', '#eb172b'],
    'Brighton': ['stripes', '#ffffff', '#0057b8', '#0057b8'],
    'Crystal Palace': ['stripes', '#c4122e', '#1b458f', '#1b458f'],
    'Fulham': ['plain', null, '#111111', '#ffffff'],
    'Everton': ['plain', null, '#ffffff', '#ffffff'],
    'Ipswich': ['plain', null, '#ffffff', '#3a64a3'],
    'Real Madrid': ['plain', null, '#ffffff', '#ffffff'],
    'Barcelona': ['stripes', '#004d98', '#004d98', '#a50044'],
    'Atlético Madrid': ['stripes', '#ffffff', '#1c2c5b', '#cb3524'],
    'Athletic Club': ['stripes', '#ffffff', '#111111', '#111111'],
    'Real Betis': ['stripes', '#ffffff', '#00954c', '#00954c'],
    'Real Sociedad': ['stripes', '#ffffff', '#ffffff', '#0067b1'],
    'Villarreal': ['plain', null, '#ffe667', '#ffe667'],
    'Inter': ['stripes', '#111111', '#111111', '#111111'],
    'AC Milan': ['stripes', '#111111', '#ffffff', '#111111'],
    'Juventus': ['stripes', '#111111', '#ffffff', '#ffffff'],
    'Atalanta': ['stripes', '#111111', '#111111', '#111111'],
    'Napoli': ['plain', null, '#ffffff', '#12a0d7'],
    'Roma': ['plain', null, '#8e1f2f', '#111111'],
    'Lazio': ['plain', null, '#ffffff', '#87d8f7'],
    'Bologna': ['stripes', '#1a2f48', '#ffffff', '#1a2f48'],
    'Lecce': ['stripes', '#d40000', '#111111', '#111111'],
    'Como': ['plain', null, '#003da5', '#003da5'],
    'Bayern': ['plain', null, '#dc052d', '#dc052d'],
    'Dortmund': ['plain', null, '#111111', '#fde100'],
    'Leverkusen': ['plain', null, '#111111', '#e32221'],
    'Stuttgart': ['hband', '#e32219', '#ffffff', '#ffffff'],
    'RB Leipzig': ['plain', null, '#ffffff', '#ffffff'],
    'Frankfurt': ['plain', null, '#111111', '#111111'],
    'Werder Bremen': ['plain', null, '#1d9053', '#1d9053'],
    'Freiburg': ['plain', null, '#111111', '#e2001a'],
    'Hoffenheim': ['plain', null, '#1961b5', '#1961b5'],
    'PSG': ['band', '#da291c', '#004170', '#004170'],
    'Marseille': ['plain', null, '#ffffff', '#ffffff'],
    'Lyon': ['plain', null, '#ffffff', '#ffffff'],
    'Monaco': ['diag', '#ffffff', '#ffffff', '#e7192b'],
    'Lille': ['plain', null, '#20325f', '#e01e13'],
    'Rennes': ['plain', null, '#111111', '#111111'],
    'Ajax': ['wideband', '#d2122e', '#ffffff', '#ffffff'],
    'Feyenoord': ['halves', '#e3001b', '#111111', '#111111'],
    'PSV': ['stripes', '#ffffff', '#111111', '#ed1c24'],
    'Porto': ['stripes', '#ffffff', '#003893', '#003893'],
    'Braga': ['plain', null, '#ffffff', '#d6001c'],
    'Club Brugge': ['stripes', '#111111', '#111111', '#0067b1'],
    'Inter Miami': ['plain', null, '#231f20', '#f7b5cd'],
    'Al Hilal': ['plain', null, '#ffffff', '#005ba6'],
    'Al Ahli': ['plain', null, '#ffffff', '#00843d'],
    'Al Qadsiah': ['plain', null, '#f7d117', '#e30613'],
    'San Diego FC': ['plain', null, '#041e42', '#041e42'],
  };

  /** 3x5 digits for the shirt number on the back view. */
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

  /** Colour of one shirt pixel. px: column from the chest centre, py: row from the collar, part: body | sleeve. */
  function makePattern(pattern, c1, c2) {
    switch (pattern) {
      case 'stripes': return (px, py) => (((px + 20) >> 1) & 1) ? c2 : c1;
      case 'sleeves': return (px, py, part) => part === 'sleeve' ? c2 : c1;
      case 'band': return px => (px >= -1 && px <= 0) ? c2 : (px === -2 || px === 1) ? '#ffffff' : c1;
      case 'wideband': return px => (px >= -2 && px <= 1) ? c2 : c1;
      case 'hband': return (px, py, part) => (py >= 2 && py <= 4 && part === 'body') ? c2 : c1;
      case 'halves': return px => px < 0 ? c1 : c2;
      case 'diag': return (px, py) => (px + py) < 3 ? c1 : c2;
      case 'hoops': return (px, py) => ((py >> 1) & 1) ? c2 : c1;
      default: return () => c1;
    }
  }

  /**
   * Signature movement for the biggest names: gait multipliers (stride, lean, arm drive), a kick style and a goal celebration.
   * celeb: med (sits cross-legged), siu (jump, spin, land), cross (arms crossed), sky (points up), kneel (arms wide on the knees),
   * dance, wide (arms out), slide (knee slide), bow.
   */
  const STARS = {
    'Kylian Mbappé': { id: 'mb', stride: 1.1, lean: 0.07, arm: 1.1, kick: 'skim', celeb: 'cross' },
    'Erling Haaland': { id: 'ha', stride: 1.14, lean: 0.03, arm: 1.2, kick: 'power', celeb: 'med' },
    'Vinícius Jr.': { id: 'vi', stride: 1.0, lean: 0.1, arm: 0.9, kick: 'skim', celeb: 'dance', fancy: 1 },
    'Lamine Yamal': { id: 'ya', stride: 0.96, lean: 0.08, arm: 0.9, kick: 'curl', celeb: 'bow', fancy: 1 },
    'Mohamed Salah': { id: 'sa', stride: 1.04, lean: 0.06, arm: 1.0, kick: 'curl', celeb: 'kneel' },
    'Jude Bellingham': { id: 'be', stride: 1.0, lean: 0.04, arm: 1.0, kick: 'power', celeb: 'wide' },
    'Harry Kane': { id: 'ka', stride: 0.98, lean: 0.03, arm: 0.9, kick: 'power', celeb: 'wide' },
    'Bukayo Saka': { id: 'sk', stride: 1.0, lean: 0.07, arm: 1.0, kick: 'curl', celeb: 'slide' },
    'Rafael Leão': { id: 'le', stride: 1.12, lean: 0.06, arm: 1.1, kick: 'skim', celeb: 'dance' },
    'Ousmane Dembélé': { id: 'de', stride: 1.06, lean: 0.07, arm: 1.0, kick: 'skim', celeb: 'siu' },
    'Kevin De Bruyne': { id: 'kd', stride: 1.0, lean: 0.03, arm: 0.9, kick: 'curl', celeb: 'wide' },
    'Neymar': { id: 'ne', stride: 0.98, lean: 0.06, arm: 0.9, kick: 'curl', celeb: 'dance', fancy: 1 },
    'Phil Foden': { id: 'fo', stride: 0.98, lean: 0.05, arm: 0.9, kick: 'curl', celeb: 'slide' },
    'Pedri': { id: 'pe', stride: 0.94, lean: 0.03, arm: 0.8, kick: 'skim', celeb: 'sky' },
    'Rodri': { id: 'ro', stride: 1.0, lean: 0.0, arm: 0.9, kick: 'power', celeb: 'sky' },
    'Antoine Griezmann': { id: 'gr', stride: 0.98, lean: 0.04, arm: 0.9, kick: 'curl', celeb: 'dance' },
    'Cristiano Ronaldo': { id: 'cr', stride: 1.08, lean: 0.04, arm: 1.0, kick: 'power', celeb: 'siu' },
    'Lionel Messi': { id: 'me', stride: 0.92, lean: 0.06, arm: 0.8, kick: 'curl', celeb: 'sky', fancy: 1 },
    'Virgil van Dijk': { id: 'vd', stride: 1.08, lean: 0.0, arm: 0.9, kick: 'power', celeb: 'wide' },
    'Robert Lewandowski': { id: 'lw', stride: 1.0, lean: 0.04, arm: 1.0, kick: 'power', celeb: 'cross' },
    'Marcus Rashford': { id: 'ra', stride: 1.06, lean: 0.06, arm: 1.0, kick: 'skim', celeb: 'wide' },
    'Florian Wirtz': { id: 'wi', stride: 0.96, lean: 0.05, arm: 0.9, kick: 'curl', celeb: 'bow' },
    'Jamal Musiala': { id: 'mu', stride: 0.96, lean: 0.06, arm: 0.9, kick: 'skim', celeb: 'bow', fancy: 1 },
    'Khvicha Kvaratskhelia': { id: 'kv', stride: 1.0, lean: 0.07, arm: 0.95, kick: 'curl', celeb: 'dance', fancy: 1 },
    'Achraf Hakimi': { id: 'hk', stride: 1.1, lean: 0.07, arm: 1.1, kick: 'skim', celeb: 'wide' },
  };
  /**
   * Appearance for one player. kit = [primary, secondary] (the team colours on the pitch).
   * opts.club adds that club's real kit pattern when the team is actually wearing its colours;
   * opts.number is printed on the back.
   */
  function lookFor(name, kit, isGK, teamSide, opts) {
    opts = opts || {};
    const r = rng(hashStr(name + '#look'));
    const real = RUT.LOOKS && RUT.LOOKS[name];
    const skin = (RUT.REAL && RUT.REAL[name] && RUT.REAL[name].skin) || (real ? real.skin : SKINS[Math.floor(r() * SKINS.length)]);
    let style = STYLES[Math.floor(r() * STYLES.length)];
    if (real && real.style) style = real.style;
    else if (real && real.bald) style = 'bald';
    else if (real && style === 'bald') style = 'short';
    const x = RUT.REAL && RUT.REAL[name];                                 // hand-made real-life look (hair style, accessories, full beards)
    if (x && x.style) style = x.style;
    const hair = x && x.hair ? x.hair : real ? real.hair : HAIRS[Math.floor(r() * HAIRS.length)];
    const beard = x && x.beard != null ? x.beard : real ? real.beard : r() < 0.3;
    const eye = x && x.eye || null;   // v195: real eye colour where known
    const full = !!(x && x.full), band = x && x.band || null, bw = (0.94 + 0.14 * clamp(((opts.strength || 60) - 35) / 64, 0, 1)) * (x && x.bw || 1);
    const star = STARS[name] || null;
    let shirt = kit[0], second = kit[1];
    let shorts = second, socks = lum(shirt) > 0.85 ? shirt : second, pattern = 'plain', pc = second;
    const ck = !isGK && opts.club && CLUB_KITS[opts.club];
    const wearing = ck && RUT.DB && RUT.DB.kitFor(opts.club)[0].toLowerCase() === shirt.toLowerCase();
    if (wearing) { pattern = ck[0]; pc = ck[1] || second; shorts = ck[2]; socks = ck[3]; }
    if (isGK) { shirt = teamSide === 1 ? '#e8e030' : '#34c84a'; second = '#1a1a1a'; shorts = '#1a1a1a'; socks = shirt; pattern = 'plain'; pc = second; }
    const boots = BOOTS[Math.floor(r() * BOOTS.length)];
    const sponsor = lum(shirt) > 0.6 ? shade(shirt, -0.5) : shade(shirt, 0.55);
    const trim = pattern !== 'plain' && pc ? pc : second;
    const number = opts.number != null ? String(opts.number).slice(0, 2) : '';
    const numCol = pattern === 'stripes' || pattern === 'band' || pattern === 'wideband' || pattern === 'halves'
      ? (lum(shirt) > 0.55 && lum(pc) > 0.55 ? '#151515' : '#ffffff')
      : (lum(shirt) > 0.55 ? (lum(second) < 0.45 ? second : '#151515') : (lum(second) > 0.6 ? second : '#ffffff'));
    return {
      key: [skin, hair, style, eye || '', beard ? 1 : 0, full ? 1 : 0, band || '', bw.toFixed(2), star ? star.id : '', shirt, pattern, pc, shorts, socks, boots, isGK ? 1 : 0, number].join('|'),
      eye, full, band, bw, star, skin, skinL: shade(skin, 0.2), skinD: shade(skin, -0.24),
      hair, hairL: shade(hair, 0.32), hairD: shade(hair, -0.35), style, beard,
      shirt, pat: makePattern(pattern, shirt, pc), pattern,
      trim, sponsor, number, numCol,
      shorts, socks, boots, bootsD: shade(boots, -0.35), bootsL: shade(boots, 0.35),
      gloves: isGK ? '#f4f4f4' : null,
    };
  }

  // ===========================================================================
  // 3D skeleton renderer
  // ---------------------------------------------------------------------------
  // The footballer is a small 3D rig (pelvis, spine, legs solved with IK, arms,
  // head). Every body part is a lit 3D volume (tapered capsules, an elliptic
  // torso, an ellipsoid head) rasterised straight into pixels with a depth
  // buffer, toon-lit in four bands from the upper left, then outlined.
  // Because nothing is a bitmap, a player can be drawn from any direction, in
  // any pose and at any size: the match renders each player at exactly the
  // size it appears on screen, so the pixels stay crisp near and far.
  //
  // Body frame: x = the player's left, y = up, z = forward. Units: one unit =
  // one pixel on a card (scale 1); a player is about 53 units tall.
  // View frame: x = screen right, y = up, z = toward the camera.
  // ===========================================================================
  const V = (x, y, z) => ({ x, y, z });
  const vadd = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
  const vsub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const vmul = (a, k) => V(a.x * k, a.y * k, a.z * k);
  const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const vcross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const vlen = a => Math.hypot(a.x, a.y, a.z);
  const vnorm = a => { const l = vlen(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  const TAU = Math.PI * 2;
  /** Rotate about the vertical axis (positive turns forward (+z) toward +x). */
  const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return V(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); };

  // body proportions, from JODIO's action sheet (v11): a big chunky head (~2/7 of the height), short torso, sturdy legs
  const R6B = { torso: 16.0, shW: 9.6, upper: 6.6, fore: 6.4, headR: 5.9, neck: 1.2 };   // v265: Roblox R6 proportions (box torso, flush box arms, small square head)
  const B = { hipW: 3.3, thigh: 10.0, shin: 9.6, ankle: 1.7, hipH: 20.6, torso: 13.6, shW: 7.0, upper: 6.9, fore: 6.3, neck: 1.8, headR: 7.2 };

  /** Interpolate between keyframes [[u, {field: value}], ...] with ease-in-out. */
  function keyed(keys, u) {
    let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
    const [u0, a] = keys[i], [u1, b] = keys[i + 1];
    const k = ease(clamp((u - u0) / (u1 - u0), 0, 1));
    const out = {}; for (const n in a) out[n] = mix(a[n], b[n], k);
    return out;
  }

  // ---------------------------------------------------------------------------
  // animations: each returns a pose (pelvis, foot targets, arm angles, lean, roll, twist)
  // ---------------------------------------------------------------------------
  /**
   * Running cycles from real gait: per foot a stance phase (planted, sliding back) and a swing phase
   * (knee drive, toe down, heel strike), counter-swinging arms, forward lean, vertical bounce, and a
   * side-to-side sway of the torso over the planted foot.
   *  walk    calm: soft arm swing, torso and head rock gently with each step
   *  jog     elastic: elbows at 90 degrees, clear bounce with a flight phase
   *  sprint  power: strong forward lean, big arm drive, long stride, high knees and heel kick
   *  dribble control: low centre of gravity, knees bent, arms out, a touch on the ball every stride
   */
  const GAITS = {
    walk: { stride: 17, lift: 4.0, stance: 0.6, lean: 0.06, arm: 0.8, elbow: 0.3, bob: -0.8, crouch: 1.3, roll: 0.12, twist: 0.14, sway: 0.05, nod: 0.06, curve: 0.75 },
    jog: { stride: 24, lift: 9.5, stance: 0.4, lean: 0.22, arm: 1.3, elbow: 1.75, bob: 1.9, crouch: 2.6, roll: 0.16, twist: 0.2, sway: 0.03, nod: 0.04, curve: 0.7 },
    sprint: { stride: 30, lift: 14.5, stance: 0.33, lean: 0.48, arm: 1.5, elbow: 1.35, bob: 1.6, crouch: 3.0, roll: 0.1, twist: 0.26, sway: 0.02, nod: 0.02, curve: 0.6 },
    dribble: { stride: 19, lift: 5.5, stance: 0.46, lean: 0.34, arm: 0.6, elbow: 1.1, bob: 1.0, crouch: 4.0, roll: 1.05, twist: 0.12, sway: 0.035, nod: 0.03, curve: 0.75 },
  };
  function gaitPose(name, t, star) {
    let g = GAITS[name]; const dribble = name === 'dribble';
    if (star) g = Object.assign({}, g, { stride: g.stride * star.stride, lean: g.lean + (name === 'sprint' ? star.lean * 1.5 : star.lean * 0.5), arm: g.arm * star.arm, lift: g.lift * (0.94 + 0.06 * star.stride / 1.0) });
    const mid = 0.5 + 0.5 * Math.cos(2 * TAU * (t - g.stance / 2));      // 1 at each mid-stance
    const side = Math.cos(TAU * (t - g.stance / 2));                      // +1 over the left foot, -1 over the right
    const foot = (sd, off) => {
      const ph = (t + off) % 1;
      let z, y, pitch = 0, yaw = 0;
      if (ph < g.stance) {                                               // planted, sliding back under the body, heel lifts before toe-off
        const u = ph / g.stance;
        z = g.stride * (0.5 - u); y = u > 0.7 ? (u - 0.7) * 3.2 : 0; pitch = u > 0.7 ? (u - 0.7) * 2.2 : 0;
      } else {                                                           // swing
        const u = (ph - g.stance) / (1 - g.stance);
        z = -g.stride / 2 + g.stride * ease(u);
        y = g.lift * Math.sin(Math.PI * Math.pow(u, g.curve));
        pitch = 0.6 * Math.sin(Math.PI * u) - (u > 0.85 ? (u - 0.85) * 2.4 : 0);
        if (dribble && sd < 0 && u > 0.5) {                              // the right foot pushes the ball on with the inside of the foot
          const k = Math.sin(Math.PI * clamp((u - 0.5) / 0.5, 0, 1)); z += 2.2 * k; yaw = -0.7 * k; y *= 1 - 0.55 * k;
        }
        if (dribble && sd > 0 && u > 0.6) { const k = Math.sin(Math.PI * clamp((u - 0.6) / 0.4, 0, 1)); yaw = 0.35 * k; }   // left foot shapes to shield
      }
      return { x: sd * (B.hipW + 0.25), y: B.ankle + y, z, pitch, yaw };
    };
    const c = Math.cos(TAU * t), s = Math.sin(TAU * t);
    const lag = TAU * 0.04;                                              // arms trail the legs slightly: smoother swing
    const elbowFor = (p, e) => clamp(p + e, -0.3, 2.3) - p;
    const pl = -g.arm * Math.cos(TAU * t - lag) + g.lean * 0.5, pr = g.arm * Math.cos(TAU * t - lag) + g.lean * 0.5;
    return {
      pelvis: V(g.sway * 10 * side, B.hipH - g.crouch - g.bob * mid, 0), lean: g.lean, roll: g.sway * side,
      yaw: -g.twist * 0.6 * c, twist: g.twist * c,
      head: { down: (dribble ? 0.9 : 0.12) + g.nod * Math.cos(2 * TAU * t) },
      footL: foot(1, 0), footR: foot(-1, 0.5),
      armL: { pitch: pl, roll: g.roll, elbow: elbowFor(pl, g.elbow + 0.18 * s) },
      armR: { pitch: pr, roll: g.roll, elbow: elbowFor(pr, g.elbow - 0.18 * s) },
    };
  }

  /** Standing: weight on one leg, breathing. Keepers crouch in the ready position. */
  function idlePose(t, gk) {
    const br = Math.sin(TAU * t);
    if (gk === true) return {
      pelvis: V(0, B.hipH - 3 + 0.3 * br, 0), lean: 0.25, roll: 0, yaw: 0, twist: 0, head: { down: 0.1 },
      footL: { x: 5.2, y: B.ankle, z: 0.5, pitch: 0, yaw: 0.3 }, footR: { x: -5.2, y: B.ankle, z: 0.5, pitch: 0, yaw: -0.3 },
      armL: { pitch: 0.8, roll: 0.55, elbow: 0.7 }, armR: { pitch: 0.8, roll: 0.55, elbow: 0.7 },
    };
    if (gk === 'cb') return {                                                                  // arms crossed, chest out, planted
      pelvis: V(0, B.hipH - 1.6 + 0.2 * br, 0), lean: -0.04, roll: 0, yaw: 0.05, twist: 0, head: { down: 0.02 },
      footL: { x: 5.0, y: B.ankle, z: 0.6, pitch: 0, yaw: 0.3 }, footR: { x: -5.0, y: B.ankle, z: 0.2, pitch: 0, yaw: -0.3 },
      armL: { pitch: 1.0, roll: -0.35, elbow: 2.2 }, armR: { pitch: 1.0, roll: -0.35, elbow: 2.2 },
    };
    if (gk === 'fb') return {                                                                  // lean, ready to burst forward
      pelvis: V(0, B.hipH - 2.0 + 0.3 * br, 0), lean: 0.3, roll: 0, yaw: 0.1, twist: -0.15, head: { down: -0.05 },
      footL: { x: 3.4, y: B.ankle, z: 5.0, pitch: 0, yaw: 0.2 }, footR: { x: -3.4, y: B.ankle, z: -4.5, pitch: 0.15, yaw: -0.2 },
      armL: { pitch: -0.9, roll: 0.3, elbow: 1.5 }, armR: { pitch: 0.9, roll: 0.3, elbow: 1.5 },
    };
    if (gk === 'dm') return {                                                                  // a foot on the ball, arms out
      pelvis: V(0.4, B.hipH - 0.8 + 0.25 * br, 0), lean: 0.05, roll: 0.02, yaw: 0.1, twist: 0, head: { down: 0.25 },
      footL: { x: 4.0, y: B.ankle, z: -1.0, pitch: 0, yaw: 0.25 }, footR: { x: -3.0, y: B.ankle + 3.2, z: 6.5, pitch: 0.35, yaw: -0.2 },
      armL: { pitch: 0.2, roll: 1.1, elbow: 0.35 }, armR: { pitch: 0.2, roll: 1.1, elbow: 0.35 },
    };
    if (gk === 'cm') return {                                                                  // chest up, scanning, springy knees
      pelvis: V(0, B.hipH - 1.3 + 0.7 * br, 0), lean: -0.03, roll: 0, yaw: 0.35 * Math.sin(TAU * t), twist: -0.3 * Math.sin(TAU * t), head: { down: -0.08 },
      footL: { x: 3.6, y: B.ankle, z: 2.0, pitch: 0, yaw: 0.2 }, footR: { x: -3.6, y: B.ankle, z: -2.0, pitch: 0.1, yaw: -0.2 },
      armL: { pitch: 0.3, roll: 0.55, elbow: 0.7 }, armR: { pitch: 0.3, roll: 0.55, elbow: 0.7 },
    };
    if (gk === 'w') return {                                                                   // on the toes, body fakes inside
      pelvis: V(0.8 * Math.sin(TAU * t), B.hipH - 1.2 + 0.4 * br, 0), lean: 0.14, roll: 0.14 * Math.sin(TAU * t), yaw: 0.2, twist: 0.3, head: { down: 0.1 },
      footL: { x: 4.2, y: B.ankle + 0.6, z: 2.6, pitch: 0.35, yaw: 0.3 }, footR: { x: -3.2, y: B.ankle + 0.4, z: -2.4, pitch: 0.4, yaw: -0.1 },
      armL: { pitch: -0.5, roll: 0.9, elbow: 1.0 }, armR: { pitch: 0.6, roll: 0.7, elbow: 1.0 },
    };
    if (gk === 'st') return {                                                                  // one arm pointing to the sky
      pelvis: V(0.3, B.hipH - 0.2 + 0.2 * br, 0), lean: -0.06, roll: 0, yaw: 0.0, twist: 0.1, head: { down: -0.3 },
      footL: { x: 3.8, y: B.ankle, z: 1.0, pitch: 0, yaw: 0.2 }, footR: { x: -3.6, y: B.ankle, z: -1.0, pitch: 0, yaw: -0.2 },
      armL: { pitch: 0.1, roll: 0.25, elbow: 0.3 }, armR: { pitch: 0.4, roll: 2.7, elbow: 0.1 },
    };
    return {
      pelvis: V(0.4, B.hipH - 0.4 + 0.25 * br, 0), lean: 0.03, roll: 0.02, yaw: 0.08, twist: -0.04, head: { down: 0.08 + 0.03 * br },
      footL: { x: 3.9, y: B.ankle, z: 1.4, pitch: 0, yaw: 0.25 }, footR: { x: -3.6, y: B.ankle, z: -1.1, pitch: 0, yaw: -0.2 },
      armL: { pitch: 0.08, roll: 0.2 + 0.03 * br, elbow: 0.3 }, armR: { pitch: -0.05, roll: 0.2 + 0.03 * br, elbow: 0.35 },
    };
  }

  /**
   * Pass (right foot, side-foot): wind the leg back as the hips open, plant and bend the standing leg,
   * lean the upper body over the ball at impact with the foot turned out, arms wide for balance.
   */
  const PASS_FOOT = [
    [0, { z: -1, y: 0.4, p: 0.2, w: 0 }],
    [0.3, { z: -8.5, y: 6.5, p: 0.6, w: -0.5 }],
    [0.48, { z: 6.0, y: 1.4, p: 0.05, w: -1.3 }],
    [0.7, { z: 12.5, y: 6.5, p: 0.1, w: -1.0 }],
    [1, { z: 2.0, y: 0.4, p: 0.1, w: -0.2 }],
  ];
  const PASS_BODY = [
    [0, { py: 0, tw: 0, ln: 0.06, rl: 0, lp: 0.3, lr: 0.5, rp: 0.1, rr: 0.4, sz: 1.8, sy: 0 }],
    [0.3, { py: -0.8, tw: -0.6, ln: 0.08, rl: 0.08, lp: 1.2, lr: 1.6, rp: -1.0, rr: 1.3, sz: 1.8, sy: 0 }],
    [0.48, { py: -1.6, tw: 0.25, ln: 0.26, rl: 0.15, lp: 1.35, lr: 1.55, rp: -0.9, rr: 1.2, sz: 1.6, sy: 0 }],
    [0.66, { py: -0.4, tw: 0.45, ln: 0.22, rl: 0.06, lp: 1.2, lr: 1.45, rp: -0.6, rr: 1.1, sz: -4.5, sy: 4.5 }],
    [1, { py: 0, tw: 0.1, ln: 0.06, rl: 0, lp: 0.1, lr: 0.4, rp: 0.1, rr: 0.4, sz: 1.8, sy: 0 }],
  ];
  /**
   * Shot (right foot, laces): a whip. The heel kicks up high behind with the back arched, the thigh
   * drives through first while the foot lags, then the knee snaps straight through the ball; the
   * standing leg stays planted, the body leans back on a high follow-through with a little hop.
   */
  const SHOT_FOOT = [
    [0, { z: -1, y: 0.4, p: 0.3, w: 0 }],
    [0.12, { z: -5.0, y: 6.0, p: 0.8, w: 0 }],
    [0.3, { z: -12.0, y: 14.0, p: 1.3, w: 0 }],              // the wind-up: heel cocked high behind
    [0.4, { z: -9.0, y: 13.0, p: 1.35, w: 0 }],
    [0.46, { z: -1.0, y: 6.0, p: 1.3, w: 0 }],                // thigh drives through, foot lags
    [0.52, { z: 9.0, y: 2.0, p: 1.0, w: 0 }],
    [0.62, { z: 19.0, y: 8.5, p: 0.5, w: 0 }],                // snaps through the ball
    [0.78, { z: 17.0, y: 13.0, p: 0.4, w: 0 }],               // high follow-through
    [1, { z: 2.5, y: 0.4, p: 0.2, w: 0 }],
  ];
  const SHOT_BODY = [
    [0, { py: 0, tw: 0, ln: 0.06, rl: 0, lp: 0.3, lr: 0.5, rp: 0.1, rr: 0.4 }],
    [0.12, { py: -0.4, tw: -0.4, ln: 0.0, rl: 0.1, lp: 0.9, lr: 1.4, rp: -0.7, rr: 1.1 }],
    [0.3, { py: -0.9, tw: -0.9, ln: -0.3, rl: 0.16, lp: 1.4, lr: 2.0, rp: -1.4, rr: 1.7 }],     // chest open, arms thrown wide
    [0.4, { py: -1.5, tw: -0.5, ln: -0.1, rl: 0.18, lp: 1.3, lr: 1.9, rp: -1.2, rr: 1.6 }],
    [0.46, { py: -2.0, tw: 0.2, ln: 0.15, rl: 0.18, lp: 1.2, lr: 1.8, rp: -1.0, rr: 1.5 }],     // lean over the ball
    [0.52, { py: -1.6, tw: 0.5, ln: 0.2, rl: 0.14, lp: 1.1, lr: 1.7, rp: -0.9, rr: 1.4 }],
    [0.62, { py: -0.1, tw: 0.75, ln: -0.28, rl: 0.1, lp: 1.5, lr: 2.0, rp: -1.1, rr: 1.8 }],
    [0.78, { py: 0.6, tw: 0.65, ln: -0.2, rl: 0.08, lp: 1.2, lr: 1.7, rp: -0.7, rr: 1.4 }],
    [1, { py: 0, tw: 0.1, ln: 0.06, rl: 0, lp: 0.1, lr: 0.4, rp: 0.1, rr: 0.4 }],
  ];
  function kickPose(u, shot) {
    const R = keyed(shot ? SHOT_FOOT : PASS_FOOT, u), Bd = keyed(shot ? SHOT_BODY : PASS_BODY, u);
    const hop = shot && u > 0.55 && u < 0.92 ? 2.4 * Math.sin((u - 0.55) / 0.37 * Math.PI) : 0;
    return {
      pelvis: V(0.8 * Bd.rl / 0.15, B.hipH - 0.6 + Bd.py, 0), lean: Bd.ln, roll: Bd.rl, yaw: Bd.tw, twist: -Bd.tw * 0.55, head: { down: 0.6 },
      footL: { x: 3.6, y: B.ankle + hop + (Bd.sy || 0), z: shot ? 2.2 : Bd.sz, pitch: hop * 0.25 + (Bd.sy || 0) * 0.15, yaw: 0.25 },
      footR: { x: -3.2, y: B.ankle + R.y, z: R.z, pitch: R.p, yaw: R.w },
      armL: { pitch: Bd.lp, roll: Bd.lr, elbow: 0.45 }, armR: { pitch: Bd.rp, roll: Bd.rr, elbow: 0.55 },
    };
  }

  /** Goal celebration: both arms up, jumping. */
  function upPose(t) {
    const j = Math.max(0, Math.sin(TAU * t)) * 3.8;
    return {
      pelvis: V(0, B.hipH - 0.5 + j, 0), lean: -0.06, roll: 0, yaw: 0, twist: 0, head: { down: -0.5 },
      footL: { x: 3.6, y: B.ankle + j * 0.9, z: 0.3, pitch: j * 0.16, yaw: 0.2 }, footR: { x: -3.6, y: B.ankle + j * 0.9, z: -0.3, pitch: j * 0.16, yaw: -0.2 },
      armL: { pitch: 0.25, roll: 2.6, elbow: 0.2 }, armR: { pitch: 0.25, roll: 2.6, elbow: 0.2 },
    };
  }
  /** Arms-crossed signature pose. */
  function crossPose() {
    return {
      pelvis: V(0, B.hipH - 0.3, 0), lean: -0.03, roll: 0, yaw: 0, twist: 0, head: { down: -0.1 },
      footL: { x: 4.4, y: B.ankle, z: 0.5, pitch: 0, yaw: 0.3 }, footR: { x: -4.4, y: B.ankle, z: 0.2, pitch: 0, yaw: -0.3 },
      armL: { pitch: 0.55, roll: 0.25, elbow: 1.5, cross: 0.85 }, armR: { pitch: 0.7, roll: 0.25, elbow: 1.5, cross: 0.85 },
    };
  }
  /** Keeper stretching for a save. */
  function savePose() {
    return {
      pelvis: V(0, B.hipH + 2.4, 0), lean: 0.05, roll: 0, yaw: 0, twist: 0, head: { down: -0.3 },
      footL: { x: 5, y: B.ankle + 3.2, z: 0, pitch: 0.6, yaw: 0.3 }, footR: { x: -5, y: B.ankle + 2, z: 0.6, pitch: 0.6, yaw: -0.3 },
      armL: { pitch: 0.6, roll: 2.2, elbow: 0.1 }, armR: { pitch: 0.6, roll: 2.2, elbow: 0.1 },
    };
  }

  /** Mix two poses field by field (numbers, joint targets, arm angles). */
  function blendPose(a, b, k) {
    if (typeof a === 'number') return mix(a, b, k);
    const o = {}; for (const n in a) o[n] = b[n] === undefined ? a[n] : blendPose(a[n], b[n], k);
    return o;
  }
  /** Standing tackle: drop the hips, lunge and hook the ball away with the inside of the right foot, arms out. */
  const TACKLE = [
    [0, { py: -1.4, ln: 0.24, fz: -2.5, fx: -3.4, fy: 1.2, fw: -0.2, lz: -3.5, lp: 0.5, lr: 0.7, rp: -0.3, rr: 0.8 }],                // closing down: a short stride in, weight forward
    [0.18, { py: -3.4, ln: 0.32, fz: 3.0, fx: -4.4, fy: 2.4, fw: -0.6, lz: -1.5, lp: 0.9, lr: 1.2, rp: -0.9, rr: 1.0 }],             // plant the left foot, sink the hips, the right leg starts to swing
    [0.38, { py: -5.2, ln: 0.44, fz: 14.5, fx: -6.8, fy: 0.9, fw: -1.2, lz: 2.0, lp: 1.0, lr: 1.6, rp: -1.1, rr: 1.2 }],              // the lunge: leg fully stretched to the ball, chest over the knee
    [0.52, { py: -5.0, ln: 0.4, fz: 12.0, fx: -6.2, fy: 0.5, fw: -1.05, lz: 2.4, lp: 0.9, lr: 1.5, rp: -0.9, rr: 1.1 }],             // the hook: the ball is won with the inside of the foot
    [0.78, { py: -2.2, ln: 0.2, fz: 2.0, fx: -3.8, fy: 1.0, fw: -0.3, lz: 0.5, lp: 0.4, lr: 0.8, rp: 0.0, rr: 0.7 }],                // recovering
    [1, { py: -0.6, ln: 0.12, fz: -1.0, fx: -3.4, fy: 0.4, fw: -0.2, lz: -2.4, lp: 0.2, lr: 0.5, rp: 0.1, rr: 0.5 }],
  ];
  function tacklePose(u) {
    const k = keyed(TACKLE, u), lunge = Math.sin(Math.PI * clamp((u - 0.1) / 0.7, 0, 1));
    return {
      pelvis: V(0.6, B.hipH + k.py, -0.8 + 2.2 * lunge), lean: k.ln, roll: 0.08 + 0.1 * lunge, yaw: -0.25, twist: 0.2 + 0.25 * lunge, head: { down: 0.7 },
      footL: { x: 3.8, y: B.ankle + (u < 0.18 ? 1.0 * (1 - u / 0.18) : 0), z: k.lz, pitch: 0.2, yaw: 0.3 }, footR: { x: k.fx, y: B.ankle + k.fy, z: k.fz, pitch: -0.15 * lunge, yaw: k.fw },
      armL: { pitch: k.lp, roll: k.lr, elbow: 0.5 }, armR: { pitch: k.rp, roll: k.rr, elbow: 0.4 },
    };
  }
  /** Slide tackle: drop onto the hip, lead leg straight along the grass at the ball, trailing knee tucked, a hand back on the turf; then spring back up. */
  const SLIDE_ON = {
    pelvis: V(0, 5.2, -2), lean: -0.9, roll: 0.12, yaw: 0, twist: 0.1, head: { down: -0.3 },
    footL: { x: 4.6, y: B.ankle, z: 3.5, pitch: 0.4, yaw: 0.4 }, footR: { x: -2.8, y: B.ankle + 0.6, z: 19, pitch: -0.4, yaw: 0 },
    armL: { pitch: -1.3, roll: 0.55, elbow: 0.1 }, armR: { pitch: 1.3, roll: 0.9, elbow: 0.4 },
  };
  const SLIDE_RUN = {
    pelvis: V(0, B.hipH - 2.5, 0), lean: 0.35, roll: 0, yaw: 0, twist: 0, head: { down: 0.4 },
    footL: { x: 3.6, y: B.ankle, z: -4, pitch: 0.3, yaw: 0.1 }, footR: { x: -3.4, y: B.ankle + 3, z: 7, pitch: 0, yaw: 0 },
    armL: { pitch: 0.9, roll: 0.5, elbow: 1.2 }, armR: { pitch: -0.9, roll: 0.5, elbow: 1.2 },
  };
  const SLIDE_UP = {
    pelvis: V(0, B.hipH - 4, 0), lean: 0.42, roll: 0, yaw: 0, twist: 0, head: { down: 0.3 },
    footL: { x: 4.2, y: B.ankle, z: 3, pitch: 0, yaw: 0.2 }, footR: { x: -3.8, y: B.ankle, z: -3.5, pitch: 0.4, yaw: -0.1 },
    armL: { pitch: 0.4, roll: 1.1, elbow: 0.6 }, armR: { pitch: 0.2, roll: 1.1, elbow: 0.6 },
  };
  function slidePose(u) {
    if (u < 0.18) return blendPose(SLIDE_RUN, SLIDE_ON, ease(u / 0.18));
    if (u < 0.72) return SLIDE_ON;
    return blendPose(SLIDE_ON, SLIDE_UP, ease((u - 0.72) / 0.28));
  }
  /** Knocked off balance: arms flung out, leaning, one leg kicked back, wobbling. */
  function stumblePose(t) {
    const w = Math.sin(TAU * t);
    return {
      pelvis: V(1.2 * w, B.hipH - 1.6, 0), lean: 0.38, roll: 0.22 * w, yaw: 0.2 * w, twist: -0.3 * w, head: { down: 0.35 },
      footL: { x: 4.4, y: B.ankle, z: 2.5, pitch: 0, yaw: 0.4 }, footR: { x: -3.6, y: B.ankle + 4.5, z: -6, pitch: 0.9, yaw: -0.2 },
      armL: { pitch: 0.5, roll: 1.9 + 0.3 * w, elbow: 0.3 }, armR: { pitch: -0.2, roll: 1.7 - 0.3 * w, elbow: 0.4 },
    };
  }


  // ---------------------------------------------------------------------------
  // v14 animations: attacking and celebration moves
  // ---------------------------------------------------------------------------
  const FL = (x, y, z, p, w) => ({ x, y, z, pitch: p || 0, yaw: w || 0 });
  /** Header: coil back, the legs tuck as the hips rise, then the neck whips the head through the ball and the arms balance. */
  function headerPose(u) {
    const jump = Math.sin(Math.PI * clamp(u * 1.05, 0, 1)) * 6.0;
    const k = keyed([[0, { ln: 0.1, hd: 0.2 }], [0.3, { ln: -0.42, hd: -0.45 }], [0.52, { ln: 0.38, hd: 0.7 }], [0.75, { ln: 0.12, hd: 0.2 }], [1, { ln: 0.04, hd: 0.1 }]], u);
    const air = clamp(jump / 6, 0, 1);
    return {
      pelvis: V(0, B.hipH - 1.2 + jump, 0), lean: k.ln, roll: 0, yaw: 0.1, twist: -k.ln * 0.2, head: { down: k.hd },
      footL: FL(3.6, B.ankle + 5.5 * air, -3.5 * air, 0.5 * air, 0.2), footR: FL(-3.6, B.ankle + 8 * air, -6.5 * air, 0.9 * air, -0.2),
      armL: { pitch: 0.2 + 0.5 * air, roll: 1.2 + 0.5 * air, elbow: 0.5 }, armR: { pitch: 0.1 + 0.4 * air, roll: 1.1 + 0.5 * air, elbow: 0.5 },
    };
  }
  /** Volley: leans back, standing leg hops, the kicking leg swings through high with the arms wide for balance. */
  function volleyPose(u) {
    const k = keyed([[0, { ln: 0.05, py: 0, fz: -3, fy: 3, fp: 0.4 }], [0.3, { ln: -0.55, py: 2.5, fz: -6, fy: 9, fp: 0.9 }], [0.5, { ln: -0.8, py: 4.2, fz: 8, fy: 14, fp: 0.2 }], [0.72, { ln: -0.6, py: 3.2, fz: 14, fy: 15, fp: -0.2 }], [1, { ln: 0.04, py: 0, fz: 1, fy: 0.5, fp: 0.1 }]], u);
    return {
      pelvis: V(0, B.hipH - 0.6 + k.py, -k.py * 0.3), lean: k.ln, roll: -k.ln * 0.2, yaw: -0.3, twist: 0.3, head: { down: 0.25 },
      footL: FL(3.8, B.ankle + k.py * 0.4, -1.5, 0.3, 0.3), footR: FL(-3.4, B.ankle + k.fy, k.fz, k.fp, -0.4),
      armL: { pitch: 0.2, roll: 1.7, elbow: 0.2 }, armR: { pitch: -0.4, roll: 1.5, elbow: 0.3 },
    };
  }
  /** Control: chest out and arms wide, one foot lifted to cushion the ball, then settle. */
  function trapPose(u) {
    const k = keyed([[0, { ln: 0, fy: 0, fz: 0 }], [0.25, { ln: -0.28, fy: 4, fz: 5 }], [0.6, { ln: -0.2, fy: 2.5, fz: 4 }], [1, { ln: 0.02, fy: 0, fz: 1 }]], u);
    return {
      pelvis: V(0, B.hipH - 0.9, 0), lean: k.ln, roll: 0.04, yaw: 0.1, twist: 0, head: { down: 0.35 },
      footL: FL(3.8, B.ankle, -1.0, 0, 0.25), footR: FL(-3.4, B.ankle + k.fy, k.fz, 0.45, -0.25),
      armL: { pitch: 0.3, roll: 1.1, elbow: 0.4 }, armR: { pitch: 0.3, roll: 1.1, elbow: 0.4 },
    };
  }
  /** A touch on the move: the standing leg takes the weight, the other foot dabs the ball out in front (inside of the boot) and pulls back, the body folds over it. */
  function touchPose(u) {
    const k = keyed([[0, { ln: 0.02, fy: 0, fz: -1, ar: 0.25 }], [0.2, { ln: 0.2, fy: 2.5, fz: -3.5, ar: 0.6 }], [0.45, { ln: 0.36, fy: 2.4, fz: 12, ar: 1.0 }], [0.7, { ln: 0.2, fy: 3.0, fz: 6.5, ar: 0.7 }], [1, { ln: 0.04, fy: 0, fz: 0, ar: 0.3 }]], u);
    return {
      pelvis: V(0, B.hipH - 0.7, 0), lean: k.ln, roll: 0.05, yaw: -0.1, twist: 0.1, head: { down: 0.55 },
      footL: FL(3.7, B.ankle, 0.8, 0, 0.2), footR: FL(-3.3, B.ankle + k.fy, k.fz, 0.3, -0.45),
      armL: { pitch: 0.2 + k.ar * 0.5, roll: 0.9 + k.ar * 0.5, elbow: 0.35 }, armR: { pitch: -0.2, roll: 1.0 + k.ar * 0.4, elbow: 0.4 },
    };
  }

  // v181 (JODIO: "more animations like FC27: first touch, pass, bodying"): FC-style contextual moves -----------------
  /** Chest control: the ball drops onto the chest, he leans back with arms wide to cushion it, then folds forward as it falls to his feet. */
  function chestPose(u) {
    const k = keyed([[0, { ln: 0, py: 0, ar: 0.9 }], [0.3, { ln: -0.5, py: 0.6, ar: 1.6 }], [0.55, { ln: -0.35, py: 0.3, ar: 1.5 }], [1, { ln: 0.12, py: 0, ar: 0.6 }]], u);
    return {
      pelvis: V(0, B.hipH - 0.8 + k.py, 1.2 * -k.ln), lean: k.ln, roll: 0, yaw: 0, twist: 0, head: { down: 0.55 },
      footL: FL(3.8, B.ankle, -1.2, 0, 0.3), footR: FL(-3.6, B.ankle, 1.0, 0, -0.3),
      armL: { pitch: 0.4, roll: k.ar, elbow: 0.5 }, armR: { pitch: 0.4, roll: k.ar, elbow: 0.5 },
    };
  }
  /** Thigh control: the knee comes up to meet a bouncing ball, then drops it down in front. */
  function thighPose(u) {
    const k = keyed([[0, { ky: 0, kz: 0, ln: 0 }], [0.3, { ky: 6.5, kz: 4.5, ln: -0.2 }], [0.6, { ky: 4, kz: 3, ln: -0.1 }], [1, { ky: 0, kz: 1, ln: 0.05 }]], u);
    return {
      pelvis: V(0, B.hipH - 0.6, 0), lean: k.ln, roll: 0.06, yaw: 0.05, twist: 0, head: { down: 0.5 },
      footL: FL(3.7, B.ankle, -0.8, 0, 0.25), footR: FL(-3.2, B.ankle + k.ky, k.kz, -0.6 * k.ky / 6.5, -0.2),
      armL: { pitch: 0.3, roll: 1.2, elbow: 0.45 }, armR: { pitch: 0.1, roll: 1.0, elbow: 0.5 },
    };
  }
  /** Chipped / lofted pass: the foot slides under the ball, the body leans back and the leg follows through high. */
  function chipPose(u) {
    const k = keyed([[0, { ln: 0.1, fy: 3, fz: -7, fp: 0.6 }], [0.42, { ln: -0.3, fy: 0.6, fz: 2, fp: -0.5 }], [0.7, { ln: -0.4, fy: 9, fz: 10, fp: -0.9 }], [1, { ln: -0.05, fy: 1, fz: 2, fp: 0 }]], u);
    return {
      pelvis: V(0, B.hipH - 0.8, 0), lean: k.ln, roll: -0.08, yaw: -0.2, twist: 0.25, head: { down: 0.3 },
      footL: FL(3.8, B.ankle, -0.6, 0, 0.35), footR: FL(-3.4, B.ankle + k.fy, k.fz, k.fp, -0.2),
      armL: { pitch: 0.3, roll: 1.4, elbow: 0.3 }, armR: { pitch: -0.3, roll: 1.2, elbow: 0.35 },
    };
  }
  /** Shielding: side-on, knees bent, wide base, the near arm out to keep the defender off while the far foot keeps the ball. Loops. */
  function shieldPose(t) {
    const w = Math.sin(TAU * t), d = Math.max(0, Math.sin(TAU * t * 2));
    return {
      pelvis: V(0.3 * w, B.hipH - 1.6, 0), lean: -0.12, roll: 0.18 + 0.05 * w, yaw: 0.55, twist: -0.2, head: { down: 0.45 },
      footL: FL(5.2, B.ankle, -1.5, 0, 0.5), footR: FL(-4.6, B.ankle + 1.2 * d, 2 + 1.5 * d, 0.2, -0.4),
      armL: { pitch: -0.15, roll: 1.75, elbow: 0.25 }, armR: { pitch: 0.25, roll: 0.9, elbow: 0.6 },
    };
  }
  /** Bodying / jockeying into a carrier: shoulder dropped in, arm across, short shuffling steps. Loops. */
  function jostlePose(t) {
    const w = Math.sin(TAU * t), st = Math.max(0, Math.sin(TAU * t));
    return {
      pelvis: V(0, B.hipH - 1.2, 0.4), lean: 0.3, roll: -0.28 + 0.06 * w, yaw: -0.35, twist: 0.25, head: { down: 0.15 },
      footL: FL(4.6, B.ankle + 1.4 * st, 1 + w, 0, 0.3), footR: FL(-4.4, B.ankle + 1.4 * Math.max(0, -w), -1 - w, 0, -0.3),
      armL: { pitch: 0.7, roll: 0.8, elbow: 1.0 }, armR: { pitch: 0.9, roll: 1.35, elbow: 0.5 },
    };
  }
  // goal celebrations ---------------------------------------------------------
  /** Cross-legged meditation (the calm after the goal). */
  function celebMed(t) {
    const br = Math.sin(TAU * t);
    return {
      pelvis: V(0, 3.6 + 0.12 * br, 0), lean: 0.08, roll: 0, yaw: 0, twist: 0, head: { down: 0.15 },
      footL: FL(-2.2, 1.9, 6.0, 0, -0.5), footR: FL(2.2, 2.6, 6.8, 0, 0.5),
      armL: { pitch: 0.5, roll: 0.55, elbow: 1.2 }, armR: { pitch: 0.5, roll: 0.55, elbow: 1.2 },
    };
  }
  /** SIUUU: crouch, leap with a half turn, land with legs wide, chest out and arms low. */
  function celebSiu(u) {
    const crouch = u < 0.18 ? ease(u / 0.18) : 0, air = u > 0.18 && u < 0.62 ? Math.sin(Math.PI * (u - 0.18) / 0.44) : 0, land = u >= 0.62 ? 1 : 0;
    const spin = u < 0.18 ? 0 : u < 0.62 ? Math.PI * ease((u - 0.18) / 0.44) : Math.PI;
    const j = air * 6.5;
    return {
      pelvis: V(0, B.hipH - 3.2 * crouch + j - (land ? 2.4 : 0), 0), lean: land ? -0.12 : 0.2 * crouch - 0.1 * air, roll: 0, yaw: 0, twist: 0, head: { down: land ? -0.45 : 0.1 },
      spin,
      footL: FL(land ? 7.4 : 3.6, B.ankle + j * 0.6, 0, j * 0.12, 0.3), footR: FL(land ? -7.4 : -3.6, B.ankle + j * 0.9, -0.5, j * 0.14, -0.3),
      armL: land ? { pitch: 0.1, roll: 0.5, elbow: 0.15 } : { pitch: 0.3, roll: 0.8 + 1.2 * air, elbow: 0.3 },
      armR: land ? { pitch: 0.1, roll: 0.5, elbow: 0.15 } : { pitch: 0.3, roll: 0.8 + 1.2 * air, elbow: 0.3 },
    };
  }
  /** Pointing to the sky with one arm, head up. */
  function celebSky(t) {
    const br = Math.sin(TAU * t);
    return {
      pelvis: V(0, B.hipH - 0.3 + 0.2 * br, 0), lean: -0.08, roll: 0, yaw: 0, twist: 0.1, head: { down: -0.7 },
      footL: FL(3.8, B.ankle, 0.6, 0, 0.25), footR: FL(-3.8, B.ankle, -0.4, 0, -0.25),
      armL: { pitch: 0.1, roll: 0.3, elbow: 0.2 }, armR: { pitch: 0.3, roll: 2.85 + 0.05 * br, elbow: 0.05 },
    };
  }
  /** On the knees, arms wide, face to the sky. */
  function celebKneel(t) {
    const br = Math.sin(TAU * t);
    return {
      pelvis: V(0, 11.2 + 0.2 * br, -1), lean: -0.18, roll: 0, yaw: 0, twist: 0, head: { down: -0.55 },
      footL: FL(3.4, B.ankle, 8.8, 0, 0.1), footR: FL(-3.6, B.ankle + 2.6, -8.5, 1.2, -0.1),
      armL: { pitch: 0.05, roll: 1.65, elbow: 0.1 }, armR: { pitch: 0.05, roll: 1.65, elbow: 0.1 },
    };
  }
  /** Knee slide: sliding on one knee, chest back, arms spread. */
  function celebSlide(u) {
    const down = ease(clamp(u / 0.25, 0, 1)), up = ease(clamp((u - 0.8) / 0.2, 0, 1)), d = down * (1 - up);
    return {
      pelvis: V(0, B.hipH - 9 * d, -2 * d), lean: 0.3 - 0.6 * d, roll: 0, yaw: 0, twist: 0, head: { down: -0.4 * d },
      footL: FL(3.6, B.ankle, 4 + 5 * d, 0, 0.2), footR: FL(-3.4, B.ankle + 2.4 * d, -4 - 4.5 * d, 1.1 * d, -0.1),
      armL: { pitch: 0.1, roll: 0.4 + 1.3 * d, elbow: 0.2 }, armR: { pitch: 0.1, roll: 0.4 + 1.3 * d, elbow: 0.2 },
    };
  }
  /** Dance: hips swinging side to side, arms alternating up and out, feet stepping. */
  function celebDance(t) {
    const s = Math.sin(TAU * 2 * t), c = Math.cos(TAU * 2 * t), b = Math.abs(Math.sin(TAU * 2 * t));
    return {
      pelvis: V(1.8 * s, B.hipH - 1.6 + 0.8 * b, 0), lean: 0.05, roll: 0.14 * s, yaw: 0.5 * s, twist: -0.35 * s, head: { down: 0.1 },
      footL: FL(3.8 + (s > 0 ? 1.5 : 0), B.ankle + (s > 0.6 ? 1.2 : 0), 0.4, 0, 0.3), footR: FL(-3.8 - (s < 0 ? 1.5 : 0), B.ankle + (s < -0.6 ? 1.2 : 0), -0.4, 0, -0.3),
      armL: { pitch: 0.4 + 0.3 * c, roll: 1.2 + 1.0 * Math.max(0, s), elbow: 0.8 }, armR: { pitch: 0.4 - 0.3 * c, roll: 1.2 + 1.0 * Math.max(0, -s), elbow: 0.8 },
    };
  }
  /** Arms spread wide, chest out, bouncing (the Bellingham). */
  function celebWide(t) {
    const j = Math.max(0, Math.sin(TAU * t)) * 1.6;
    return {
      pelvis: V(0, B.hipH - 0.8 + j, 0), lean: -0.1, roll: 0, yaw: 0, twist: 0, head: { down: -0.3 },
      footL: FL(4.6, B.ankle + j * 0.6, 0.3, 0, 0.3), footR: FL(-4.6, B.ankle + j * 0.6, -0.3, 0, -0.3),
      armL: { pitch: 0.05, roll: 1.55, elbow: 0.05 }, armR: { pitch: 0.05, roll: 1.55, elbow: 0.05 },
    };
  }
  /** Bow: a deep bow from the waist, arms trailing, then back up. */
  function celebBow(u) {
    const b = Math.sin(Math.PI * clamp(u, 0, 1));
    return {
      pelvis: V(0, B.hipH - 0.6 - 1.2 * b, -1.5 * b), lean: 0.9 * b, roll: 0, yaw: 0, twist: 0, head: { down: 0.4 * b },
      footL: FL(3.6, B.ankle, 0.5, 0, 0.2), footR: FL(-3.6, B.ankle, -0.5, 0, -0.2),
      armL: { pitch: -0.3 - 0.7 * b, roll: 0.5 + 0.5 * b, elbow: 0.2 }, armR: { pitch: 0.5 + 0.5 * b, roll: 0.5, elbow: 1.0 },
    };
  }


  // ---------------------------------------------------------------------------
  // dribbling skill moves (the ball sits about 6-7 units in front of the player). *_m variants are the mirror image.
  // ---------------------------------------------------------------------------
  /** Ball roll: the sole sits on top of the ball and drags it across the body while the hips and shoulders follow. */
  function rollPose(u) {
    const k = keyed([[0, { x: -3.4, y: 0.6, z: 3 }], [0.22, { x: -3.0, y: 4.4, z: 6.8 }], [0.6, { x: 4.4, y: 4.0, z: 6.4 }], [0.82, { x: 3.0, y: 1.2, z: 4 }], [1, { x: -3.4, y: 0.4, z: 1 }]], u);
    const drag = clamp((u - 0.22) / 0.38, 0, 1);
    return {
      pelvis: V(1.8 * ease(drag), B.hipH - 1.6, 0), lean: 0.2, roll: 0.1 * ease(drag), yaw: 0.45 * ease(drag), twist: -0.3 * ease(drag), head: { down: 0.85 },
      footL: FL(3.8 + 1.2 * ease(drag), B.ankle, -0.5, 0, 0.25), footR: FL(k.x, B.ankle + k.y, k.z, 0.6, -0.3 * ease(drag)),
      armL: { pitch: 0.3, roll: 0.9, elbow: 0.7 }, armR: { pitch: -0.2, roll: 1.1 + 0.3 * drag, elbow: 0.6 },
    };
  }
  /** Stepover: the foot loops around the front of the ball without touching it, the shoulder dips and the hips lean that way. */
  function stepPose(u) {
    const th = clamp((u - 0.08) / 0.5, 0, 1) * Math.PI;                      // 0 = inside of the ball, PI = outside
    const loop = th > 0 && th < Math.PI ? 1 : 0, dip = Math.sin(Math.PI * clamp(u / 0.7, 0, 1));
    const back = ease(clamp((u - 0.62) / 0.3, 0, 1));
    return {
      pelvis: V(2.4 * dip - 4.0 * back * 0.5, B.hipH - 2.0 - 0.8 * dip, 0), lean: 0.22 + 0.15 * back, roll: 0.2 * dip - 0.22 * back, yaw: -0.2 * dip + 0.3 * back, twist: 0.3 * dip - 0.3 * back, head: { down: 0.55 },
      footL: FL(4.4 - 2.2 * back, B.ankle, -0.6 + 4 * back, 0, 0.3), footR: FL(-3.4 + 7.8 * Math.sin(th / 2) * loop + 0 * back, B.ankle + 4.8 * Math.sin(th) * loop, 5.6 + 3.2 * Math.cos(th) * loop, 0.5 * Math.sin(th), -0.5 * Math.sin(th)),
      armL: { pitch: 0.4, roll: 1.0 + 0.5 * dip, elbow: 0.6 }, armR: { pitch: -0.3, roll: 1.2 - 0.6 * dip, elbow: 0.6 },
    };
  }
  /** Body feint: the whole body dips to one side with the planted foot loaded, then flips to the other side and bursts off. */
  function feintPose(u) {
    const a = ease(clamp(u / 0.45, 0, 1)), b = ease(clamp((u - 0.45) / 0.4, 0, 1)), c = ease(clamp((u - 0.8) / 0.2, 0, 1));
    const side = a * (1 - b) - 0.8 * b * (1 - c);
    return {
      pelvis: V(3.0 * side, B.hipH - 2.6 * a * (1 - b) - 1.4 * b, 0), lean: 0.12 + 0.3 * b, roll: 0.3 * side, yaw: 0.3 * side, twist: -0.45 * side, head: { down: 0.35 - 0.25 * side },
      footL: FL(4.2 + 2.6 * a * (1 - b), B.ankle, 0.8 * a - 3 * b, 0, 0.35), footR: FL(-3.4 - 1.8 * b, B.ankle + 1.2 * b, 1.0 + 6 * b * (1 - c), 0.2, -0.2),
      armL: { pitch: 0.3 + 0.6 * a * (1 - b), roll: 0.9 + 0.8 * a * (1 - b), elbow: 0.8 }, armR: { pitch: 0.3, roll: 0.9 + 0.9 * b * (1 - c), elbow: 0.8 },
    };
  }
  /** Knock-and-run: a big touch with the laces, arms already driving into the sprint. */
  function knockPose(u) {
    const k = keyed([[0, { z: -5, y: 3.5 }], [0.3, { z: 12.5, y: 3.0 }], [0.55, { z: 5, y: 2.5 }], [1, { z: -3, y: 4.5 }]], u);
    return {
      pelvis: V(0, B.hipH - 2.4, 0), lean: 0.42, roll: 0, yaw: -0.15, twist: 0.2, head: { down: 0.55 },
      footL: FL(3.6, B.ankle, -3.0 + 3 * u, 0.3, 0.1), footR: FL(-3.2, B.ankle + k.y, k.z, 0.55, -0.1),
      armL: { pitch: 1.0, roll: 0.5, elbow: 1.3 }, armR: { pitch: -0.9, roll: 0.5, elbow: 1.3 },
    };
  }
  /** Mirror a pose left to right (for the move done off the other foot). */
  function mirrorPose(P) {
    const m = Object.assign({}, P), mf = f => ({ x: -f.x, y: f.y, z: f.z, pitch: f.pitch, yaw: -f.yaw });
    m.pelvis = V(-P.pelvis.x, P.pelvis.y, P.pelvis.z); m.roll = -(P.roll || 0); m.yaw = -(P.yaw || 0); m.twist = -(P.twist || 0);
    m.footL = mf(P.footR); m.footR = mf(P.footL); m.armL = Object.assign({}, P.armR); m.armR = Object.assign({}, P.armL);
    return m;
  }


  // ---------------------------------------------------------------------------
  // v16: the keeper's dive. Drawn in profile (the sprite is turned side-on by the engine): set, launch, fly with the arms
  // reaching ahead of the body and the legs trailing, land on the chest and hip, lie, get up. `hi` is the high-ball version
  // (steeper body, hands stretched up over the head).
  // ---------------------------------------------------------------------------
  const DV_SET = { pelvis: V(0, B.hipH - 3.6, 0), lean: 0.3, roll: 0, yaw: 0, twist: 0, head: { down: -0.3 },
    footL: FL(4.4, B.ankle, 1.6, 0, 0.2), footR: FL(-4.4, B.ankle, -1.2, 0, -0.2), armL: { pitch: 0.95, roll: 0.35, elbow: 0.5 }, armR: { pitch: 0.95, roll: 0.35, elbow: 0.5 } };
  const DV_PUSH = { pelvis: V(0, B.hipH - 1.2, 0), lean: 0.7, roll: 0, yaw: 0, twist: 0, head: { down: -0.4 },
    footL: FL(3.2, B.ankle, -4.5, 0.3, 0.1), footR: FL(-3.2, B.ankle + 1.5, -7, 0.5, -0.1), armL: { pitch: 1.5, roll: 0.25, elbow: 0.2 }, armR: { pitch: 1.5, roll: 0.25, elbow: 0.2 } };
  const DV_AIR_LO = { pelvis: V(0, 10.8, 0), lean: 1.38, roll: 0, yaw: 0, twist: 0, head: { down: -0.35 },
    footL: FL(2.6, 10.2, -13, -0.25, 0.1), footR: FL(-2.6, 11.2, -15, -0.25, -0.1), armL: { pitch: 1.5, roll: 0.16, elbow: 0.04 }, armR: { pitch: 1.5, roll: 0.16, elbow: 0.04 } };
  const DV_AIR_HI = { pelvis: V(0, 12.6, 0), lean: 0.78, roll: 0, yaw: 0, twist: 0, head: { down: -0.55 },
    footL: FL(2.8, 6.8, -9.5, -0.5, 0.1), footR: FL(-2.8, 8.4, -11, -0.4, -0.1), armL: { pitch: 2.65, roll: 0.22, elbow: 0.05 }, armR: { pitch: 2.65, roll: 0.22, elbow: 0.05 } };
  const DV_LAND = { pelvis: V(0, 5.2, 0), lean: 1.52, roll: 0.1, yaw: 0, twist: 0.1, head: { down: -0.3 },
    footL: FL(3, 4.4, -14, -0.2, 0.1), footR: FL(-2.6, 4.2, -15, -0.2, -0.1), armL: { pitch: 1.35, roll: 0.2, elbow: 0.3 }, armR: { pitch: 1.2, roll: 0.3, elbow: 0.5 } };
  const DV_LIE = { pelvis: V(0, 4.4, 0), lean: 1.56, roll: 0.14, yaw: 0, twist: 0.14, head: { down: -0.2 },
    footL: FL(3.4, 4.0, -14, -0.1, 0.2), footR: FL(-3, 4.0, -15, -0.1, -0.2), armL: { pitch: 1.0, roll: 0.45, elbow: 0.7 }, armR: { pitch: 1.1, roll: 0.3, elbow: 0.8 } };
  function divePose(u, hi) {
    const AIR = hi ? DV_AIR_HI : DV_AIR_LO;
    if (u < 0.1) return blendPose(DV_SET, DV_PUSH, ease(u / 0.1) * 0.6);
    if (u < 0.26) return blendPose(blendPose(DV_SET, DV_PUSH, 0.6), AIR, ease((u - 0.1) / 0.16));
    if (u < 0.45) return AIR;
    if (u < 0.55) return blendPose(AIR, DV_LAND, ease((u - 0.45) / 0.1));
    if (u < 0.78) return blendPose(DV_LAND, DV_LIE, ease((u - 0.55) / 0.23));
    return blendPose(DV_LIE, DV_SET, ease((u - 0.78) / 0.22));
  }

  /** Frames per animation (cache granularity). Kicks don't loop. */
  const FRAMES = { roll: 10, roll_m: 10, step: 12, step_m: 12, feint: 10, feint_m: 10, knock: 8, header: 10, volley: 10, trap: 8, touch: 8, chest: 8, thigh: 8, chip: 10, shield: 8, jostle: 8, celeb_med: 6, celeb_siu: 14, celeb_sky: 6, celeb_kneel: 6, celeb_slide: 10, celeb_dance: 10, celeb_wide: 8, celeb_bow: 10, idle: 4, idle_cb: 4, idle_fb: 4, idle_dm: 4, idle_cm: 4, idle_w: 4, idle_st: 4, gkready: 4, walk: 10, jog: 10, sprint: 10, dribble: 10, pass: 12, shot: 12, tackle: 8, slide: 10, stumble: 6, up: 6, cross: 1, save: 1, down: 1, dive_lo: 16, dive_hi: 16 };
  function poseFor(anim, t, gk, star) {
    switch (anim) {
      case 'walk': case 'jog': case 'sprint': case 'dribble': return gaitPose(anim, t, star);
      case 'roll': return rollPose(t); case 'roll_m': return mirrorPose(rollPose(t));
      case 'step': return stepPose(t); case 'step_m': return mirrorPose(stepPose(t));
      case 'feint': return feintPose(t); case 'feint_m': return mirrorPose(feintPose(t));
      case 'knock': return knockPose(t);
      case 'header': return headerPose(t);
      case 'volley': return volleyPose(t);
      case 'trap': return trapPose(t);
      case 'touch': return touchPose(t);
      case 'chest': return chestPose(t); case 'thigh': return thighPose(t); case 'chip': return chipPose(t);
      case 'shield': return shieldPose(t); case 'jostle': return jostlePose(t);
      case 'celeb_med': return celebMed(t);
      case 'celeb_siu': return celebSiu(t);
      case 'celeb_sky': return celebSky(t);
      case 'celeb_kneel': return celebKneel(t);
      case 'celeb_slide': return celebSlide(t);
      case 'celeb_dance': return celebDance(t);
      case 'celeb_wide': return celebWide(t);
      case 'celeb_bow': return celebBow(t);
      case 'pass': return kickPose(t, false);
      case 'shot': return kickPose(t, true);
      case 'tackle': return tacklePose(t);
      case 'slide': return slidePose(t);
      case 'stumble': return stumblePose(t);
      case 'up': return upPose(t);
      case 'cross': return crossPose();
      case 'save': return savePose();
      case 'dive_lo': return divePose(t, false);
      case 'dive_hi': return divePose(t, true);
      case 'gkready': return idlePose(t, true);
      case 'idle_cb': case 'idle_fb': case 'idle_dm': case 'idle_cm': case 'idle_w': case 'idle_st': return idlePose(t, anim.slice(5));
      default: return idlePose(t, gk);
    }
  }

  // ---------------------------------------------------------------------------
  // skeleton: joint positions from a pose (legs by two-bone IK)
  // ---------------------------------------------------------------------------
  function ik(hip, ankle, l1, l2) {
    let d = vsub(ankle, hip), L = vlen(d);
    const max = l1 + l2 - 0.05;
    if (L > max) { ankle = vadd(hip, vmul(d, max / L)); d = vsub(ankle, hip); L = max; }
    const dir = vmul(d, 1 / L);
    const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const bend = vnorm(vcross(dir, V(1, 0, 0)));       // knees always bend forward / up
    return { knee: vadd(vadd(hip, vmul(dir, a)), vmul(bend, h)), ankle };
  }
  function skeleton(P) {
    const S = {}, pel = P.pelvis, roll = P.roll || 0;
    S.pelvis = pel; S.pelvisYaw = P.yaw;
    S.hipL = vadd(pel, rotY(V(B.hipW, -roll * B.hipW * 0.6, 0), P.yaw)); S.hipR = vadd(pel, rotY(V(-B.hipW, roll * B.hipW * 0.6, 0), P.yaw));
    [['L', P.footL, S.hipL], ['R', P.footR, S.hipR]].forEach(([sd, f, hip]) => {
      const r = ik(hip, V(f.x, f.y, f.z), B.thigh, B.shin);
      S['knee' + sd] = r.knee; S['ankle' + sd] = r.ankle;
      const fd = V(Math.sin(f.yaw) * Math.cos(f.pitch), -Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch));
      S['heel' + sd] = vadd(r.ankle, vmul(fd, -1.0)); S['toe' + sd] = vadd(r.ankle, vmul(fd, 4.4));
    });
    const up = vnorm(V(Math.sin(roll), Math.cos(P.lean), Math.sin(P.lean)));
    S.up = up; S.torsoYaw = P.twist;
    S.neck = vadd(pel, vmul(up, B.torso));
    const shc = vadd(S.neck, vmul(up, -2.2));
    const across = rotY(V(1, 0, 0), S.torsoYaw);
    const shOff = sg => vadd(vmul(across, sg * B.shW), V(0, sg * roll * B.shW * 0.4, 0));
    S.shL = vadd(shc, shOff(1)); S.shR = vadd(shc, shOff(-1));
    const armYaw = S.torsoYaw - (P.cheat || 0) * 0.8;                     // arms swing in the running direction, not the cheated chest
    [['L', P.armL, S.shL, 1], ['R', P.armR, S.shR, -1]].forEach(([sd, a, sh, sg]) => {
      const du = rotY(V(sg * Math.sin(a.roll), -Math.cos(a.roll) * Math.cos(a.pitch), Math.cos(a.roll) * Math.sin(a.pitch)), armYaw);
      const p2 = a.pitch + a.elbow;
      let df = V(sg * Math.sin(a.roll), -Math.cos(a.roll) * Math.cos(p2), Math.cos(a.roll) * Math.sin(p2));
      if (a.cross) df = vnorm(vadd(df, V(-sg * a.cross * 1.4, 0, 0)));
      df = rotY(df, armYaw);
      S['elbow' + sd] = vadd(sh, vmul(du, B.upper)); S['hand' + sd] = vadd(S['elbow' + sd], vmul(df, B.fore));
    });
    const hd = P.head.down || 0, hu = vnorm(vadd(up, V(0, 1, 0)));     // the head stays more upright than the spine
    S.headC = vadd(vadd(S.neck, vmul(hu, B.neck + B.headR * 0.95 - Math.abs(hd) * 0.4)), V(0, 0, Math.sin(P.lean) * 1.2 + hd * 1.1));
    S.headPitch = hd * 0.5; S.headYaw = S.torsoYaw * 0.5;
    return S;
  }

  // ---------------------------------------------------------------------------
  // rasteriser: depth-buffered, toon-lit 3D volumes straight into pixels, at any scale
  // ---------------------------------------------------------------------------
  const LIGHT = vnorm(V(-0.6, 0.62, 0.5));
  const RGB = {};
  const rgb = hex => RGB[hex] || (RGB[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  /** Four light bands: core shadow, shade, lit, highlight. */
  function band(n) { const d = vdot(n, LIGHT); return d > 0.62 ? 1.16 : d > 0.22 ? 1.0 : d > -0.2 ? 0.8 : 0.63; }
  const ID = { body: 1, shorts: 2, legL: 3, legR: 4, armL: 5, armR: 6, head: 7, hair: 8 };

  function newRaster(s) {
    const W = Math.max(10, Math.round(BASE * s)), H = W, N = W * H;
    return { W, H, s, ox: W / 2, oy: Math.round(H * FEET), col: new Uint8ClampedArray(N * 4), z: new Float32Array(N).fill(-1e9), id: new Uint8Array(N) };
  }
  function plot(R, i, z, hex, light, id) {
    if (z <= R.z[i]) return;
    R.z[i] = z; R.id[i] = id;
    const c = rgb(hex), o = i * 4;
    for (let k = 0; k < 3; k++) R.col[o + k] = light >= 1 ? c[k] + (255 - c[k]) * (light - 1) * 0.9 : c[k] * light;
    R.col[o + 3] = 255;
  }
  /** Tapered capsule from a to b (view space, units). colorAt(t along the bone, normal) → hex. */
  function capsule(R, a, b, ra, rb, colorAt, id) {
    const { W, H, s } = R;
    const ax = R.ox + a.x * s, ay = R.oy - a.y * s, bx = R.ox + b.x * s, by = R.oy - b.y * s, r = Math.max(ra, rb) * s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax, dy = by - ay, dd = dx * dx + dy * dy || 1e-6;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      const t = clamp(((cx - ax) * dx + (cy - ay) * dy) / dd, 0, 1);
      const ru = mix(ra, rb, t), rr = ru * s, ex = cx - (ax + dx * t), ey = cy - (ay + dy * t), d2 = ex * ex + ey * ey;
      if (d2 > rr * rr) continue;
      const nz = Math.sqrt(1 - d2 / (rr * rr)), n = V(ex / rr, -ey / rr, nz);
      plot(R, py * W + px, mix(a.z, b.z, t) + nz * ru, colorAt(t, n), band(n), id);
    }
  }
  /** Ellipsoid (vertical radius ry, horizontal rx, units). colorAt(view normal) → hex or null to leave the pixel. */
  function ellipsoid(R, c, rx, ry, colorAt, id) {
    const { W, H, s } = R, cx = R.ox + c.x * s, cy = R.oy - c.y * s, Rx = rx * s, Ry = ry * s;
    for (let py = Math.max(0, Math.floor(cy - Ry)); py <= Math.min(H - 1, Math.ceil(cy + Ry)); py++)
      for (let px = Math.max(0, Math.floor(cx - Rx)); px <= Math.min(W - 1, Math.ceil(cx + Rx)); px++) {
        const ex = (px + 0.5 - cx) / Rx, ey = -(py + 0.5 - cy) / Ry, d2 = ex * ex + ey * ey;
        if (d2 > 1) continue;
        const n = V(ex, ey, Math.sqrt(1 - d2)), hex = colorAt(n);
        if (hex) plot(R, py * W + px, c.z + n.z * rx, hex, band(n), id);
      }
  }
  /**
   * Elliptic cylinder (torso, shorts) between base and top, cross-section a (sideways) x b (front-back),
   * turned by yaw. colorAt(bx, bz, t) gets the body-space point on the surface so kit patterns wrap around.
   */
  function cylinder(R, base, top, yaw, aB, aT, b, colorAt, id, round) {
    const { W, H, s } = R;
    const ax = R.ox + base.x * s, ay = R.oy - base.y * s, tx = R.ox + top.x * s, ty = R.oy - top.y * s;
    const dx = tx - ax, dy = ty - ay, dd = dx * dx + dy * dy || 1e-6, dl = Math.sqrt(dd);
    const px_ = -dy / dl, py_ = dx / dl;                        // screen-space perpendicular (points screen-right for an upright axis)
    const c = Math.cos(yaw), sn = Math.sin(yaw), r = (Math.max(aB, aT) + 1) * s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, tx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, tx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ty) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, ty) + r));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const qx = px + 0.5 - ax, qy = py + 0.5 - ay;
      const t = (qx * dx + qy * dy) / dd;
      if (t < 0 || t > 1) continue;
      let a = mix(aB, aT, ease(Math.min(1, t * 1.6)));
      if (round && t > 0.84) a *= Math.sqrt(1 - Math.pow((t - 0.84) / 0.16, 2) * 0.55);   // rounded shoulders
      const sx = (qx * px_ + qy * py_) / s;
      const Rp = Math.sqrt(a * a * c * c + b * b * sn * sn);
      if (Math.abs(sx) > Rp) continue;
      const al = Math.atan2(b * sn, a * c), ac = Math.acos(clamp(sx / Rp, -1, 1));
      const Zof = ph => -a * Math.cos(ph) * sn + b * Math.sin(ph) * c;
      const ph = Zof(al + ac) > Zof(al - ac) ? al + ac : al - ac;
      const bx = a * Math.cos(ph), bz = b * Math.sin(ph);
      const nb = vnorm(V(Math.cos(ph) / a, 0, Math.sin(ph) / b));
      const n = vnorm(V(nb.x * c + nb.z * sn, round && t > 0.8 ? (t - 0.8) * 3 : (t < 0.06 ? -0.3 : 0), -nb.x * sn + nb.z * c));
      plot(R, py * W + px, mix(base.z, top.z, t) + Zof(ph), colorAt(bx, bz, t), band(n), id);
    }
  }

  /**
   * v265 (JODIO: Roblox R6 body): a straight box between base and top, half width a, half depth b, turned by yaw.
   * colorAt(bx, bz, t) gets the body-space point on the visible face (front or a side). bev rounds the ends a little.
   */
  function boxy(R, base, top, yaw, a, b, colorAt, id, bev) {
    const { W, H, s } = R;
    const ax = R.ox + base.x * s, ay = R.oy - base.y * s, tx = R.ox + top.x * s, ty = R.oy - top.y * s;
    const dx = tx - ax, dy = ty - ay, dd = dx * dx + dy * dy || 1e-6, dl = Math.sqrt(dd), len = dl / s;
    const px_ = -dy / dl, py_ = dx / dl, c = Math.cos(yaw), sn = Math.sin(yaw), r = (a + b + 1) * s;
    const x0 = Math.max(0, Math.floor(Math.min(ax, tx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, tx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ty) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, ty) + r));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const qx = px + 0.5 - ax, qy = py + 0.5 - ay, t = (qx * dx + qy * dy) / dd;
      if (t < 0 || t > 1) continue;
      let ea = a, eb = b;
      if (bev) { const e = Math.min(t, 1 - t) * len, k = 1 - clamp((bev - e) / bev, 0, 1) * 0.2; ea *= k; eb *= k; }
      const sx = (qx * px_ + qy * py_) / s;
      let best = -1e9, bx = 0, bz = 0, nx = 0, nz = 1;
      if (c > 0.02) { const x = (sx - eb * sn) / c; if (Math.abs(x) <= ea) { const d = -x * sn + eb * c; if (d > best) { best = d; bx = x; bz = eb; nx = 0; nz = 1; } } }
      if (Math.abs(sn) > 0.02) for (const sg of [1, -1]) {
        if (-sg * sn <= 0) continue;
        const z = (sx - sg * ea * c) / sn;
        if (Math.abs(z) <= eb) { const d = -sg * ea * sn + z * c; if (d > best) { best = d; bx = sg * ea; bz = z; nx = sg; nz = 0; } }
      }
      if (best < -1e8) continue;
      const n = vnorm(V(nx * c + nz * sn, t > 0.94 ? 0.6 : (t < 0.04 ? -0.3 : 0), -nx * sn + nz * c));
      plot(R, py * W + px, mix(base.z, top.z, t) + best, colorAt(bx, bz, t), band(n), id);
    }
  }

  /** Hair coverage: the scalp is hair above this height (local unit sphere), by how far round the head we are. */
  const HAIRLINE = { afro: [-0.55, -0.1, 0.34], bun: [-0.45, 0.05, 0.5], slick: [-0.5, 0.15, 0.5], mohawk: [-0.5, 0.2, 0.47], dreads: [-0.55, -0.05, 0.4], short: [-0.45, 0.05, 0.5], fade: [0.15, 0.35, 0.52], buzz: [-0.5, 0.0, 0.47], curly: [-0.55, -0.05, 0.34], curlfade: [0.12, 0.3, 0.42], long: [-1.1, -0.3, 0.44] };
  function hairline(style, lz) { const h = HAIRLINE[style]; return lz > 0 ? mix(h[1], h[2], lz) : mix(h[1], h[0], -lz); }
  /** Pixel digit lookup for numbers printed on the kit. u, v in units from the number box's top-left. */
  function digitAt(ds, u, v, cs) {
    const row = Math.floor(v / cs); if (row < 0 || row > 4) return false;
    for (let k = 0; k < ds.length; k++) {
      const lc = Math.floor((u - k * 4 * cs) / cs);
      if (lc >= 0 && lc < 3 && (DIGITS[ds[k]] || DIGITS[0])[row * 3 + lc] === '1') return true;
    }
    return false;
  }

  /** Render the whole figure for one pose, view yaw and scale. Returns the raster. */
  function renderFigure(L, anim, t, yaw, gk, scale) {
    const r6 = L.r6 !== false, Bsave = r6 ? Object.assign({}, B) : null;
    if (r6) Object.assign(B, R6B);
    try { return renderFigure0(L, anim, t, yaw, gk, scale, r6); } finally { if (Bsave) Object.assign(B, Bsave); }
  }
  function renderFigure0(L, anim, t, yaw, gk, scale, r6) {
    // sprite-artist cheat: in profile the chest and face turn ~30 degrees toward the camera, so both arms and the face read
    const P = Object.assign({}, poseFor(anim, t, gk, L.star)); P.cheat = -0.5 * Math.sin(yaw); P.twist = (P.twist || 0) + P.cheat;
    if (P.spin) yaw += P.spin;                                                 // whole-body turns (the SIUU leap)
    const S = skeleton(P), R = newRaster(scale);
    const view = v => rotY(v, yaw);
    const J = {}; for (const k in S) if (S[k] && S[k].x !== undefined) J[k] = view(S[k]);
    const sk = L.skin, hand = L.gloves || L.skin, isGK = !!L.gloves;
    const tube = r6 ? (R_, base, top, yw, aB, aT, b, colorAt, id, round) => boxy(R_, base, top, yw, Math.max(aB, aT) * (aB === aT ? 1.08 : 0.88), b * 0.86, colorAt, id, 0) : cylinder;
    const sole = lum(L.boots) > 0.55 ? '#3a3a3a' : '#e8e8e8';
    const ds = L.number ? L.number.split('').map(Number) : [];
    const seed = hashStr(L.shirt + L.pattern + L.trim);

    // ---- legs: shorts over the thigh, knee, sock (fold, two trim stripes), boot with sole and laces
    ['L', 'R'].forEach(sd => {
      const id = sd === 'L' ? ID.legL : ID.legR;
      const hip = J['hip' + sd], knee = J['knee' + sd], ank = J['ankle' + sd];
      if (r6) {
        const lyaw = yaw + S.pelvisYaw, kd = vnorm(vsub(knee, hip)), ad = vnorm(vsub(ank, knee)), fold6 = shade(L.socks, -0.2);
        boxy(R, hip, vadd(knee, vmul(kd, 0.9)), lyaw, 3.2, 3.1, (bx, bz, tt) => tt < 0.5 ? (tt > 0.36 && Math.abs(bx) > 2.6 ? L.trim : L.shorts) : sk, id, 1.2);
        boxy(R, vsub(knee, vmul(ad, 0.5)), vadd(ank, vmul(ad, 0.6)), lyaw, 2.95, 2.9, (bx, bz, tt) => tt < 0.1 ? sk : tt < 0.19 ? fold6 : (tt < 0.24 || (tt > 0.28 && tt < 0.32)) ? L.trim : L.socks, id, 1.0);
        capsule(R, J['heel' + sd], J['toe' + sd], 2.2, 1.8, (tt, n) => n.y < -0.35 ? sole : (tt > 0.45 && tt < 0.75 && n.y > 0.55 ? '#f0f0f0' : (tt > 0.3 && tt < 0.5 && Math.abs(n.x) > 0.5 ? L.bootsL : L.boots)), id);
        return;
      }
      capsule(R, hip, knee, 3.2, 2.6, tt => tt < 0.42 ? L.shorts : sk, id);
      capsule(R, hip, vadd(hip, vmul(vsub(knee, hip), 0.42)), 3.6, 3.4, (tt, n) => tt > 0.8 && Math.abs(n.x) > 0.75 ? L.trim : L.shorts, ID.shorts);
      const fold = shade(L.socks, -0.2);
      capsule(R, knee, ank, 2.5, 1.75, tt => tt < 0.1 ? sk : tt < 0.19 ? fold : (tt < 0.24 || (tt > 0.28 && tt < 0.32)) ? L.trim : L.socks, id);
      capsule(R, J['heel' + sd], J['toe' + sd], 2.0, 1.6, (tt, n) => n.y < -0.35 ? sole : (tt > 0.45 && tt < 0.75 && n.y > 0.55 ? '#f0f0f0' : (tt > 0.3 && tt < 0.5 && Math.abs(n.x) > 0.5 ? L.bootsL : L.boots)), id);
      if (HD) {                                                                  // v127 detail: quad and calf muscle, boot studs and heel tab, sock rib
        ellipsoid(R, vadd(hip, vmul(vsub(knee, hip), 0.72)), 2.9, 3.6, () => sk, id);
        ellipsoid(R, vadd(knee, vmul(vsub(ank, knee), 0.27)), 2.75, 3.4, () => L.socks, id);
        capsule(R, vadd(knee, vmul(vsub(ank, knee), 0.55)), vadd(knee, vmul(vsub(ank, knee), 0.82)), 1.35, 1.2, () => shade(L.socks, lum(L.socks) > 0.5 ? -0.12 : 0.14), id);   // shin guard under the sock
        [0.25, 0.8].forEach(u => ellipsoid(R, vadd(vadd(J['heel' + sd], vmul(vsub(J['toe' + sd], J['heel' + sd]), u)), V(0, -1.55, 0)), 0.85, 0.6, () => L.bootsD, id));
        ellipsoid(R, vadd(J['heel' + sd], V(0, 0.9, 0)), 1.2, 1.4, () => L.bootsD, id);
        ellipsoid(R, vadd(ank, V(0, 0.4, 0)), 2.1, 1.0, () => shade(L.socks, -0.18), id);
      }
    });

    // ---- shorts (pelvis): side stripe, small number on the front of the right leg
    const pyaw = yaw + S.pelvisYaw, tyaw = yaw + S.torsoYaw;
    tube(R, view(vadd(S.pelvis, vmul(S.up, -1.4))), view(vadd(S.pelvis, vmul(S.up, 2.6))), pyaw, 5.9 * L.bw, 5.9 * L.bw, 3.7, (bx, bz, tt) => {
      if (Math.abs(bz) < 0.9) return L.trim;
      if (HD && tt > 0.86) return bz > 1.5 && Math.abs(bx) < 0.6 ? '#ece8e0' : shade(L.shorts, lum(L.shorts) > 0.5 ? -0.1 : 0.1);   // v264: waistband and drawstring knot
      if (bz > 1.5 && ds.length && digitAt(ds, (-2.0 - bx) * 1.0 + (ds.length === 1 ? 0.5 : 2.2), (0.75 - tt) * 4 * 1.0, 0.75)) return L.numCol;
      return L.shorts;
    }, ID.shorts, false);

    // ---- shirt: kit pattern wrapped round the torso, collar, crest, maker logo, sponsor, number on the back
    const tBase = view(vadd(S.pelvis, vmul(S.up, 1.0))), tLen = B.torso - 1.0;
    const nW = ds.length === 1 ? 3 * 1.45 : 7 * 1.45;
    tube(R, tBase, J.neck, tyaw, 5.8 * L.bw, 7.4 * L.bw, 3.9, (bx, bz, tt) => {
      const v = (1 - tt) * tLen;                                                 // units down from the collar
      const front = bz > 1.4, rear = bz < -1.4;
      if (v < 1.0 && Math.abs(bx) < 3.8) return L.trim;                          // collar
      if (front && v < 2.8 && Math.abs(Math.abs(bx) - (2.8 - v) * 0.9) < 0.55) return L.trim;   // V-neck
      if (rear && ds.length && v > 3.0 && digitAt(ds, -bx + nW / 2, v - 3.2, 1.45)) return L.numCol;
      if (front && v > 5.4 && v < 8.2 && Math.abs(bx) < 4.6) {                   // sponsor wordmark
        const r = Math.floor((v - 5.4) / 1.4), j = Math.floor(bx + 4.6);
        if (j % 3 !== 2 && ((seed >>> ((r * 9 + j) % 31)) & 1)) return L.sponsor;
      }
      if (front && v > 2.6 && v < 4.4 && bx > 2.4 && bx < 4.4) return (v > 3.0 && v < 4.0 && bx > 2.8 && bx < 4.0) ? '#f2d65a' : L.trim;   // crest
      if (front && v > 2.8 && v < 3.8 && bx < -2.6 && bx > -4.2) return L.trim;  // maker logo
      if (L.pattern === 'plain' && Math.abs(bz) < 0.8 && v > 2) return L.trim;   // side panel
      const base = L.pat(Math.floor(bx * 0.72), Math.floor(v * 0.62), 'body');
      if (HD && v > tLen - 0.8) return shade(base, lum(base) > 0.5 ? -0.1 : 0.1);                // v264: the shirt hem
      if (HD && v > 4 && bz > -0.8 && ((Math.floor(bx * 1.4 + v * 0.8) % 9) === 0)) return shade(base, lum(base) > 0.5 ? -0.07 : 0.07);   // soft fabric folds
      return base;
    }, ID.body, true);

    // ---- arms: sleeve with a cuff, then skin (keepers: long sleeves and big gloves)
    const sleeve = L.pattern === 'halves' ? [L.pat(1, 3, 'sleeve'), L.pat(-2, 3, 'sleeve')] : [L.pat(0, 3, 'sleeve'), L.pat(0, 3, 'sleeve')];
    [['L', 0], ['R', 1]].forEach(([sd, k]) => {
      const id = sd === 'L' ? ID.armL : ID.armR;
      if (r6) {
        const eb = J['elbow' + sd], ha = J['hand' + sd], fd6 = vnorm(vsub(ha, eb)), ud6 = vnorm(vsub(eb, J['sh' + sd]));
        boxy(R, vadd(J['sh' + sd], V(0, 2.0, 0)), vadd(eb, vmul(ud6, 0.8)), tyaw, 3.2, 3.1, (bx, bz, tt) => isGK ? sleeve[k] : tt < 0.58 ? sleeve[k] : tt < 0.68 ? L.trim : sk, id, 1.5);
        boxy(R, vsub(eb, vmul(fd6, 0.3)), vadd(ha, vmul(fd6, 3.0)), tyaw, 3.0, 2.9, (bx, bz, tt) => isGK ? (tt > 0.74 ? hand : tt > 0.66 ? L.trim : sleeve[k]) : (tt > 0.86 ? hand : sk), id, 1.2);
        return;
      }
      capsule(R, J['sh' + sd], J['elbow' + sd], 2.25, 1.95, tt => isGK ? sleeve[k] : tt < 0.46 ? sleeve[k] : tt < 0.56 ? L.trim : sk, id);
      capsule(R, J['elbow' + sd], J['hand' + sd], 1.9, 1.6, tt => isGK ? (tt > 0.8 ? L.trim : sleeve[k]) : sk, id);
      ellipsoid(R, J['hand' + sd], isGK ? 2.4 : 1.9, isGK ? 2.4 : 2.0, () => hand, id);
      if (HD) {                                                                  // v127 detail: shoulder, biceps, fingers and thumb (keepers: gloves with cuff strap)
        ellipsoid(R, J['sh' + sd], 3.0, 3.0, () => sleeve[k], id);
        ellipsoid(R, vadd(J['sh' + sd], vmul(vsub(J['elbow' + sd], J['sh' + sd]), 0.38)), 2.6, 2.9, () => sleeve[k], id);
        const hd0 = J['hand' + sd], fd = vnorm(vsub(hd0, J['elbow' + sd])), pp = V(-fd.y, fd.x, 0), fl = isGK ? 3.0 : 2.5, fr = isGK ? 0.85 : 0.6;
        [-1.5, -0.5, 0.5, 1.5].forEach(o => capsule(R, vadd(hd0, vmul(pp, o * 0.55)), vadd(vadd(hd0, vmul(fd, fl - Math.abs(o) * 0.25)), vmul(pp, o * 0.7)), fr, fr * 0.9, () => hand, id));
        capsule(R, hd0, vadd(vadd(hd0, vmul(fd, 1.3)), vmul(pp, (sd === 'L' ? 1 : -1) * 1.9)), fr * 1.1, fr, () => hand, id);
        if (isGK) capsule(R, vadd(hd0, vmul(fd, -1.1)), vadd(hd0, vmul(fd, 0.2)), 2.1, 2.1, () => L.trim, id);
      }
    });

    // ---- neck, head, hair shell, ears, nose, face
    capsule(R, J.neck, view(vadd(S.neck, V(0, B.neck + 0.9, 0))), 2.05, 2.05, () => sk, ID.head);
    const hc = J.headC, hr = r6 ? 6.3 : B.headR, hry = r6 ? B.headR : hr * 1.06;
    const hyaw = yaw + S.headYaw, hp = S.headPitch, ch = Math.cos(hyaw), sh = Math.sin(hyaw), cp = Math.cos(hp), sp = Math.sin(hp);
    const toLocal = n => { const lx = n.x * ch - n.z * sh, lz0 = n.x * sh + n.z * ch; return V(lx, n.y * cp + lz0 * sp, -n.y * sp + lz0 * cp); };
    const toView = l => { const y = l.y * cp - l.z * sp, z0 = l.y * sp + l.z * cp; return V(l.x * ch + z0 * sh, y, -l.x * sh + z0 * ch); };
    const style = L.style;
    const headCol = l => {
      if (style !== 'bald') {
        const hl = hairline(style, l.z);
        if (l.y > hl) return style === 'buzz' ? L.hairD : L.hair;
        if ((style === 'fade' || style === 'curlfade') && l.y > hl - 0.4 && l.z < 0.35) return l.y > hl - 0.2 ? L.hairD : L.skinD;   // v195: the fade goes from hair to skin
      }
      if (L.beard && l.z > 0.05 && l.y < -0.34 && !(l.y > -0.62 && Math.abs(l.x) < 0.28 && l.z > 0.6)) return L.hairD;
      return sk;
    };
    if (r6) boxy(R, vadd(hc, V(0, -hry, 0)), vadd(hc, V(0, hry, 0)), hyaw, hr, hr, (bx, bz, tt) => headCol({ x: bx / hr, y: tt * 2 - 1, z: bz / hr }), ID.head, 2.4);
    else ellipsoid(R, hc, hr, hry, n => headCol(toLocal(n)), ID.head);
    const hairVol = !r6 || /afro|curly|curlfade|mohawk/.test(style);
    if (style !== 'bald') {                                                                  // hair volume above the scalp
      const grow = style === 'afro' ? 3.6 : style === 'curly' ? 1.8 : style === 'curlfade' ? 1.5 : style === 'dreads' ? 1.4 : style === 'buzz' ? 0.3 : style === 'fade' ? 0.5 : style === 'slick' ? 0.7 : 0.9;
      const c2 = style === 'afro' ? vadd(hc, V(0, 1.4, -0.3)) : style === 'curly' ? vadd(hc, V(0, 0.8, 0)) : hc;
      if (hairVol) ellipsoid(R, c2, hr + grow, hry + grow, n => {
        const l = toLocal(n);
        if (l.y <= hairline(style, l.z) + 0.08) return null;
        if (style === 'mohawk' && Math.abs(l.x) > 0.34) return null;
        // v195: organic hair: curls are small round clumps (light top, dark underside), straight hair has strands that follow the comb direction, everything is darker low down and shinier on top
        const low = l.y < hairline(style, l.z) + 0.3;
        if (style === 'curly' || style === 'afro' || style === 'curlfade') { const k = style === 'afro' ? 9 : 13, cx = n.x * k, cy = n.y * k, cz = n.z * k;
          const v = Math.sin(cx + Math.sin(cy * 1.3)) * Math.sin(cy + Math.sin(cz * 1.7)) * Math.sin(cz + Math.sin(cx * 1.1));
          return v > 0.32 ? L.hairL : v < -0.3 || low ? L.hairD : L.hair; }
        if (style === 'dreads') { const a = Math.atan2(l.x, l.z), q = Math.sin(a * 11 + l.y * 2); return q > 0.55 ? L.hairL : q < -0.5 || low ? L.hairD : L.hair; }   // locs run down from the crown
        if (style === 'short' || style === 'long' || style === 'bun' || style === 'slick') { const q = Math.sin((style === 'slick' || style === 'bun' ? l.x * 3 + l.z * 18 : l.x * 22 + l.z * 4)); return l.y > 0.55 && q > 0.6 ? L.hairL : low || q < -0.75 ? L.hairD : L.hair; }   // strands
        return style === 'buzz' ? L.hairD : low ? L.hairD : L.hair;
      }, ID.hair);
      if (style === 'bun') { ellipsoid(R, vadd(hc, vmul(toView(V(0, 0.95, -0.45)), hr)), 3.4, 3.1, () => L.hair, ID.hair); ellipsoid(R, vadd(hc, vmul(toView(V(0, 1.05, -0.4)), hr)), 2.0, 1.6, () => L.hairL, ID.hair); }   // top knot, seen from the front too
      if (style === 'mohawk') capsule(R, vadd(hc, vmul(toView(V(0, 0.95, 0.5)), hr)), vadd(hc, vmul(toView(V(0, 0.8, -0.7)), hr)), 1.7, 1.5, () => L.hairL, ID.hair);
      if (style === 'dreads') [-0.7, -0.35, 0, 0.35, 0.7].forEach(x => capsule(R, vadd(hc, vmul(toView(V(x, 0.2, -0.78)), hr)), vadd(hc, vmul(toView(V(x * 1.15, -1.1, -0.72)), hr)), 1.5, 1.2, () => L.hair, ID.hair));
      if (style === 'long') capsule(R, vadd(hc, vmul(toView(V(0, -0.1, -0.8)), hr)), vadd(hc, vmul(toView(V(0, -1.25, -0.6)), hr)), 4.0, 3.4, () => L.hair, ID.hair);
    }
    if (L.band) [-0.78, -0.4, 0, 0.4, 0.78].forEach(x => ellipsoid(R, vadd(hc, vmul(toView(V(x, 0.5 - Math.abs(x) * 0.12, (r6 ? 1 : Math.sqrt(Math.max(0.05, 1 - x * x - 0.25))))), hr * 1.01)), 1.5, 1.3, () => L.band, ID.hair));   // headband
    if (L.full) ellipsoid(R, vadd(hc, vmul(toView(V(0, -0.72, 0.5)), hr)), 4.4, 3.4, () => L.hairD, ID.hair);   // full beard
    [1, -1].forEach(sg => ellipsoid(R, vadd(hc, vmul(toView(V(sg * 0.98, -0.05, -0.08)), hr)), 1.25, 1.55, () => sk, ID.head));
    ellipsoid(R, vadd(hc, vmul(toView(V(0, -0.14, 1)), hr)), 1.0, 1.15, () => sk, ID.head);
    if (HD && !(L.beard || L.full)) ellipsoid(R, vadd(J.neck, V(0, B.neck * 0.55, 0.35)), 2.0, 1.1, () => shade(sk, -0.2), ID.head);   // v264: the jaw's shadow on the neck
    if (HD) {                                                                                // v127 detail: jaw, shirt collar rib
      if (!r6) ellipsoid(R, vadd(hc, vmul(toView(V(0, -0.74, 0.5)), hr)), 2.9, 1.5, () => (L.beard ? L.hairD : sk), ID.head);
      ellipsoid(R, vadd(J.neck, V(0, 0.2, 0.3)), 3.5, 1.3, () => L.trim, ID.body);
    }

    // face details, stamped as pixels where the head surface is visible
    const fc = toView(V(0, 0, 1));
    const put = (i, hex) => { const c = rgb(hex), o = i * 4; R.col[o] = c[0]; R.col[o + 1] = c[1]; R.col[o + 2] = c[2]; };
    const stamp = (l, hex, out) => {
      const n = toView(r6 ? V(l.x, l.y, 1) : vnorm(l));
      if (n.z < 0.2) return;
      const px = Math.floor(R.ox + (hc.x + n.x * hr) * scale), py = Math.floor(R.oy - (hc.y + n.y * hry) * scale);
      if (px < 1 || px >= R.W - 1 || py < 0 || py >= R.H) return;
      const i = py * R.W + px;
      if (R.id[i] !== ID.head) return;
      put(i, hex);
      if (HD && out === 'white' && R.id[i + R.W] === ID.head) put(i + R.W, hex);   // HD: eyes two pixels tall so they survive the filter
      if (out) {                                                             // second pixel: outward (eye white, brow) or sideways (mouth)
        const dir = out === 'side' ? 1 : (Math.sign(n.x - fc.x) || 1);
        if ((out !== 'side' || Math.abs(fc.x) < 0.5) && R.id[i + dir] === ID.head) put(i + dir, out === 'white' ? '#f5f5f0' : hex);
      }
    };
    const fpx = hr * scale;                                                   // head radius in pixels: big heads (cards, close-ups) get a full face
    if (fpx >= 7) {
      // v194 (JODIO: "more realistic faces with a mouth and details"): every feature is painted pixel by pixel on the visible face surface
      const dot = (lx, ly, hex) => { const lz2 = r6 ? 1 : 1 - lx * lx - ly * ly; if (lz2 <= 0.05) return; const n = toView(V(lx, ly, r6 ? 1 : Math.sqrt(lz2)));
        if (n.z < 0.12) return; const px = Math.floor(R.ox + (hc.x + n.x * hr) * scale), py = Math.floor(R.oy - (hc.y + n.y * hry) * scale);
        if (px < 0 || px >= R.W || py < 0 || py >= R.H) return; const i = py * R.W + px; if (R.id[i] === ID.head) put(i, hex); };
      const st = 0.6 / fpx, area = (x0, x1, y0, y1, fn) => { for (let y = y0; y <= y1; y += st) for (let x = x0; x <= x1; x += st) { const c = fn(x, y); if (c) dot(x, y, c); } };
      const dark = lum(sk) < 0.35, skD = shade(sk, -0.16), skC = shade(sk, -0.07), skDD = shade(sk, -0.3), skL = shade(sk, dark ? 0.12 : 0.1);
      const browC = lum(L.hair) > 0.4 ? shade(L.hair, -0.25) : L.hairD;
      const lip = dark ? shade(sk, -0.22) : '#b5655a', lipL = dark ? shade(sk, -0.08) : '#c97a6c', iris = L.eye || '#3a2618';
      const beardOn = L.beard || L.full;
      // cheekbone and jaw shading, a lighter forehead and nose bridge
      area(-0.75, 0.75, -0.62, 0.2, (x, y) => { const cx = Math.abs(x); if (cx > 0.52 && cx < 0.7 && y > -0.4 && y < -0.12) return skC; if (!beardOn && cx < 0.55 && y < -0.58) return skD; return null; });
      area(-0.32, 0.32, 0.3, 0.55, (x, y) => (y > 0.42 && Math.abs(x) < 0.25 ? skL : null));
      [1, -1].forEach(sg => {
        const ex = sg * 0.36, ey = 0.04;
        area(ex - 0.2, ex + 0.2, ey + 0.06, ey + 0.16, (x, y) => (Math.abs(x - ex) < 0.19 ? skD : null));                                 // eye socket shadow
        area(ex - 0.17, ex + 0.17, ey - 0.07, ey + 0.07, (x, y) => { const u = (x - ex) / 0.17, v = (y - ey) / 0.07; if (u * u + v * v > 1) return null;
          const r = Math.hypot((x - ex) / 0.075, (y - ey) / 0.075); return r < 0.45 ? '#0c0808' : r < 0.82 ? iris : r < 1 ? shade(iris, -0.4) : '#f2efe8'; });                // white, iris with a darker limbal ring, pupil
        area(ex - 0.18, ex + 0.18, ey + 0.06, ey + 0.1, (x, y) => (Math.abs(x - ex) < 0.18 ? '#20140f' : null));                          // upper lid line and lashes
        dot(ex - sg * 0.03, ey + 0.03, '#ffffff');                                                                                          // catch light
        area(ex - 0.24, ex + 0.24, 0.22, 0.36, (x, y) => { const u = (x - ex) / 0.24; const yc = 0.27 + 0.05 * (1 - u * u) + sg * (x - ex) * 0.08; return Math.abs(u) <= 1 && Math.abs(y - yc) < 0.045 + 0.02 * (1 - Math.abs(u)) ? browC : null; });   // eyebrow, thicker in the middle
      });
      area(-0.06, 0.14, -0.28, 0.0, (x, y) => (x > 0.06 && x < 0.13 && y > -0.24 ? skD : null));                                         // nose side shadow
      area(-0.14, 0.14, -0.33, -0.2, (x, y) => { const ax = Math.abs(x); if (ax > 0.05 && ax < 0.12 && y < -0.28) return skDD; if (ax < 0.05 && y > -0.26 && y < -0.2) return skL; return null; });   // nostrils, tip highlight
      area(-0.2, 0.2, -0.43, -0.37, (x, y) => (Math.abs(x) < 0.04 ? skD : null));                                                         // philtrum
      if (anim === 'up' || anim === 'cross' || /^celeb/.test(anim)) {                                                                     // celebrating: mouth open, teeth showing
        area(-0.22, 0.22, -0.66, -0.44, (x, y) => { const u = x / 0.21, v = (y + 0.55) / 0.1; const e = u * u + v * v; if (e > 1.15) return null; if (e > 0.8) return lip; return y > -0.5 ? '#f4f1ea' : '#3a1210'; });
      } else {
        area(-0.24, 0.24, -0.58, -0.44, (x, y) => { const u = x / 0.22; if (Math.abs(u) > 1) return null; const mid = -0.5 - 0.015 * u * u;
          if (Math.abs(y - mid) < 0.022) return '#4a1c18';                                                                                // the line between the lips
          if (y > mid && y < mid + 0.05 && Math.abs(u) < 0.85) return lip;                                                                // upper lip
          if (y < mid && y > mid - 0.07 && Math.abs(u) < 0.8) return y > mid - 0.035 ? lipL : lip;                                        // fuller lower lip
          return null; });
        area(-0.12, 0.12, -0.68, -0.6, (x, y) => (!beardOn && Math.abs(x) < 0.1 && y > -0.64 ? skD : null));                             // shadow under the lower lip
      }
      [1, -1].forEach(sg => area(-1, 1, -0.3, 0.2, (x, y) => (Math.abs(x - sg * 0.93) < 0.05 && y > -0.2 && y < 0.1 ? skDD : null)));  // ear inner shadow
      // v264 (JODIO: "more like a 1:1 copy, same look, just add the details"): tear ducts, lower lash line, smile lines, temples, forehead and chin light, under-chin shadow, ear rim
      [1, -1].forEach(sg => {
        const ex = sg * 0.36, ey = 0.04;
        dot(ex - sg * 0.185, ey - 0.005, dark ? shade(sk, 0.12) : '#d98a80');                                                              // tear duct
        area(ex - 0.15, ex + 0.15, ey - 0.095, ey - 0.075, (x, y) => (Math.abs(x - ex) < 0.15 ? skC : null));                              // lower lid line
        area(0.14, 0.3, -0.52, -0.26, (x, y) => (Math.abs((x - 0.14) - (-0.26 - y) * 0.55) < 0.018 ? skC : null));                         // smile line from nose to mouth corner (mirrored below)
        area(0.62, 0.78, 0.05, 0.42, (x, y) => (x > 0.66 + (y - 0.05) * 0.08 ? skC : null));                                                // temple shading
      });
      [-1].forEach(sg => area(-0.3, -0.14, -0.52, -0.26, (x, y) => (Math.abs((-x - 0.14) - (-0.26 - y) * 0.55) < 0.018 ? skC : null)));
      area(-0.45, 0.45, 0.5, 0.66, (x, y) => (y > 0.54 && Math.abs(x) < 0.4 * (1 - (y - 0.54) * 2) ? skL : null));                          // forehead light
      area(-0.14, 0.14, -0.8, -0.72, (x, y) => (Math.abs(x) < 0.12 * (1 - (-0.72 - y) * 3) ? (beardOn ? null : skL) : null));               // chin light
      [1, -1].forEach(sg => area(sg * 0.9, sg * 1.0, -0.22, 0.08, (x, y) => ((Math.abs(x) - 0.9) > 0.07 ? skL : null)));                    // ear rim light
    } else if (scale >= 0.45) {
      [1, -1].forEach(sg => { stamp(V(sg * 0.4, 0.04, 0.92), '#1a1010', 'white'); stamp(V(sg * 0.4, 0.3, 0.87), L.hairD, scale >= 0.9 ? 'brow' : null); });
      stamp(V(0, -0.47, 0.88), anim === 'up' ? '#5a1a18' : '#8a3a30', 'side');
    }
    return R;
  }

  /** Raster → canvas, with depth-edge lines between overlapping parts and the soft dark outline. */
  function toCanvas(R) {
    const { W, H } = R;
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.ox = R.ox; c.oy = R.oy;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, col = R.col, z = R.z, id = R.id;
    d.set(col);
    const edge = 3.2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      if (col[o + 3]) {
        // a part sitting clearly behind its neighbour gets a darker edge (arms over the shirt, far leg behind near leg)
        let behind = false;
        for (const j of [i - 1, i + 1, i - W, i + W]) {
          if (j < 0 || j >= W * H || !col[j * 4 + 3]) continue;
          if (id[j] !== id[i] && z[j] > z[i] + edge) { behind = true; break; }
        }
        if (behind) { d[o] *= 0.62; d[o + 1] *= 0.62; d[o + 2] *= 0.66; }
      } else {
        const near = (x > 0 && col[o - 1]) || (x < W - 1 && col[o + 7]) || (y > 0 && col[o - W * 4 + 3]) || (y < H - 1 && col[o + W * 4 + 3]);
        if (near) { d[o] = 24; d[o + 1] = 20; d[o + 2] = 34; d[o + 3] = 205; }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** HD sprites: filter the 1.4x canvas down to device size (smooth edges, fine detail survives). ox/oy follow. */
  function downsample(src) {
    const w = Math.max(1, Math.round(src.width / SS)), h = Math.max(1, Math.round(src.height / SS));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    try { g.filter = 'contrast(1.14) saturate(1.08)'; } catch (e) { /* no canvas filters: stays as filtered */ }
    g.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
    c.ox = Math.round(src.ox / SS); c.oy = Math.round(src.oy / SS);
    return c;
  }

  // ---------------------------------------------------------------------------
  // public API
  // ---------------------------------------------------------------------------
  const cache = new Map(), CACHE_MAX = 6000;
  /** Frame index for an animation time t (0..1). */
  function frameOf(anim, t) {
    const n = FRAMES[anim] || 1;
    if (anim === 'pass' || anim === 'shot' || anim === 'tackle' || anim === 'slide' || anim === 'touch') return Math.min(n - 1, Math.floor(clamp(t, 0, 1) * n));
    return ((Math.floor(t * n) % n) + n) % n;
  }
  /** Scales snap to 6% steps so nearby sizes share a cached sprite. */
  const snapScale = s => Math.pow(1.06, Math.round(Math.log(clamp(s, 0.15, 4)) / Math.log(1.06)));
  /**
   * Cached sprite canvas; canvas.ox / canvas.oy are where the feet are.
   * anim: idle | gkready | walk | jog | sprint | dribble | pass | shot | tackle | slide | stumble | up | cross | save | down
   * t: 0..1 through the animation; yaw: radians the player faces (0 = toward the camera, +PI/2 = screen right);
   * scale: pixels per unit (1 = card size, ~53 px tall).
   */
  function sprite(L, anim, t, yaw, scale) {
    anim = FRAMES[anim] ? anim : 'idle';
    yaw = yaw || 0;
    const s = snapScale(scale || 1);
    const f = frameOf(anim, t || 0), n = FRAMES[anim];
    const key = L.key + '#' + anim + '#' + f + '#' + Math.round(yaw * 100) + '#' + s.toFixed(3) + (HD ? 'h' : '');
    let c = cache.get(key);
    if (c) { cache.delete(key); cache.set(key, c); return c; }
    const tq = (anim === 'pass' || anim === 'chip' || anim === 'shot' || anim === 'tackle' || anim === 'slide' || anim === 'roll' || anim === 'roll_m' || anim === 'step' || anim === 'step_m' || anim === 'feint' || anim === 'feint_m' || anim === 'knock' || anim === 'header' || anim === 'volley' || anim === 'trap' || anim === 'touch' || anim === 'celeb_siu' || anim === 'celeb_slide' || anim === 'celeb_bow') ? f / Math.max(1, n - 1) : (f + 0.5) / n;
    if (anim === 'down') {                                                                   // lying on the grass: side view turned flat
      const src = toCanvas(renderFigure(L, 'idle', 0.25, Math.PI / 2, !!L.gloves, s));
      c = document.createElement('canvas'); c.width = src.height; c.height = src.width;              // a quarter turn: swap the sides
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.translate(0, src.width); g.rotate(-Math.PI / 2); g.drawImage(src, 0, 0);                     // pixel-exact, head to the left
      c.ox = Math.round(src.oy - 24 * s); c.oy = src.width - 1;                                      // anchor under the hips
    } else if (HD) c = downsample(toCanvas(renderFigure(L, anim, tq, yaw, !!L.gloves, s * SS)));
    else c = toCanvas(renderFigure(L, anim, tq, yaw, !!L.gloves, s));
    cache.set(key, c);
    if (cache.size > CACHE_MAX) { let k = 0; for (const old of cache.keys()) { cache.delete(old); if (++k >= 600) break; } }
    return c;
  }

  /** idle stance for a position: CB, fullbacks, CDM, CM/CAM, wide midfielders and wingers, strikers (keepers use gkready). */
  const IDLE_BY_POS = { CB: 'idle_cb', LB: 'idle_fb', RB: 'idle_fb', LWB: 'idle_fb', RWB: 'idle_fb', CDM: 'idle_dm', CM: 'idle_cm', CAM: 'idle_cm',
    LW: 'idle_w', RW: 'idle_w', LM: 'idle_w', RM: 'idle_w', ST: 'idle_st', CF: 'idle_st', LF: 'idle_st', RF: 'idle_st', GK: 'gkready' };
  const idleFor = pos => IDLE_BY_POS[pos] || 'idle';

  /** v259: a card pose picked from the player's name: [animation, time 0..1, view angle]. Keepers get keeper poses. */
  const CARD_POSES_OUT = [['idle_st', 0.1, -0.45], ['idle_cm', 0.1, -0.45], ['idle_w', 0.1, -0.45], ['idle_fb', 0.1, -0.45], ['idle_dm', 0.1, -0.45], ['feint', 0.5, -0.45], ['step', 0.55, -0.45],
    ['shield', 0.5, -0.5], ['up', 0.25, -0.45], ['cross', 0.5, -0.45], ['celeb_med', 0.5, -0.4], ['jog', 0.3, -0.5], ['dribble', 0.3, -0.5], ['idle_cb', 0.1, -0.5]];   // v259: no straight-arms (T-pose) ones: not wide, shot, header, chest, trap, pass, volley, dance
  const CARD_POSES_GK = [['gkready', 0.1, -0.45], ['save', 0.5, -0.45], ['cross', 0.5, -0.45], ['gkready', 0.6, -0.55]];
  function cardPose(card) {
    let h = 7; for (let i = 0; i < card.name.length; i++) h = (h * 31 + card.name.charCodeAt(i)) >>> 0;
    const pool = card.position === 'GK' ? CARD_POSES_GK : CARD_POSES_OUT;
    return pool[h % pool.length];
  }
  const figCache = {};
  /** PNG data URL of a card's figure (used by main.js on cards): a three-quarter view, idle or a signature pose. 77 px, shown at 2x. */
  function cardFigure(card, pose) {
    const kit = RUT.DB.kitFor(card.club);
    const key = card.name + '|' + card.club + '|' + card.position + '|' + (pose || 'idle');
    if (figCache[key]) return figCache[key];
    const L0 = lookFor(card.name, kit, card.position === 'GK', 0, { club: card.club, number: card.details && card.details.number, strength: card.sub && card.sub.strength });
    const L = Object.assign({}, L0, { r6: true, key: L0.key + '|r6' });   // v265 (JODIO): card figures use the Roblox R6 body
    let anim = pose === 'up' ? 'up' : pose === 'cross' ? 'cross' : idleFor(card.position), t = anim === 'up' ? 0.25 : 0.1, yaw = -0.45;
    if (!pose || pose === 'idle') { const pz = cardPose(card); anim = pz[0]; t = pz[1]; yaw = pz[2]; }   // v259 (JODIO): every player strikes his own pose on his card
    return (figCache[key] = sprite(L, anim, t, yaw, 77 * 2.5 / BASE).toDataURL());   // v164: drawn at 2.5x so the card shows a smooth figure, not big pixels
  }

  RUT.PixelArt = { setHD: v => { HD = !!v; }, isHD: () => HD, idleFor, BASE, CLUB_KITS, FRAMES, lookFor, sprite, cardFigure, shade, lum };
})();
