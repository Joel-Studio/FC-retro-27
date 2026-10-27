/* =============================================================================
 * psicons.js  -  a logo for each of the 36 PlayStyles (v158)
 * -----------------------------------------------------------------------------
 * RUT.PSIcon.canvas(name, gold)  a cached 64px canvas (name with or without the +)
 * RUT.PSIcon.url(name, gold)     the same as a data: URL for <img> tags (cards, guide)
 * Square (rounded) badge in the colour of the PlayStyle's family (shooting red, passing blue, ball control purple,
 * defending orange, physical brown, goalkeeping teal), a white glyph on it, a gold rim for Gold and a silver rim for Silver.
 * ========================================================================== */
window.RUT = window.RUT || {};
(function () {
  'use strict';
  const FAM = {
    shoot: ['#ff6a4d', '#9e1d12'], pass: ['#4da6ff', '#12489e'], ball: ['#b574ff', '#52199e'],
    def: ['#ffae3d', '#9e5a0b'], phys: ['#c99563', '#5e3a17'], gk: ['#2fd8c0', '#0a6b5d'],
  };
  const FAMILY = {
    'Finesse Shot': 'shoot', 'Power Shot': 'shoot', 'Low Driven Shot': 'shoot', 'Chip Shot': 'shoot', 'Dead Ball': 'shoot', 'Precision Header': 'shoot', 'Acrobatic': 'shoot', 'Gamechanger': 'shoot',
    'Incisive Pass': 'pass', 'Pinged Pass': 'pass', 'Long Ball Pass': 'pass', 'Whipped Pass': 'pass', 'Tiki Taka': 'pass', 'Inventive': 'pass',
    'Technical': 'ball', 'Trickster': 'ball', 'First Touch': 'ball', 'Press Proven': 'ball', 'Rapid': 'ball', 'Quick Step': 'ball',
    'Intercept': 'def', 'Anticipate': 'def', 'Jockey': 'def', 'Slide Tackle': 'def', 'Block': 'def',
    'Bruiser': 'phys', 'Enforcer': 'phys', 'Relentless': 'phys', 'Aerial Fortress': 'phys', 'Long Throw': 'phys',
    'Far Reach': 'gk', 'Footwork': 'gk', '1v1 Close Down': 'gk', 'Cross Claimer': 'gk', 'Deflector': 'gk', 'Far Throw': 'gk',
  };

  /* glyphs: drawn in a 0..64 box, white, round caps */
  const G = {};
  const arrowHead = (c, x, y, a, s) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(a - 0.5) * s, y - Math.sin(a - 0.5) * s); c.lineTo(x - Math.cos(a + 0.5) * s, y - Math.sin(a + 0.5) * s); c.closePath(); c.fill(); };
  const line = (c, pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); };
  const ball = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke(); };
  const dot = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };
  G['Finesse Shot'] = c => { c.beginPath(); c.moveTo(14, 48); c.bezierCurveTo(16, 18, 40, 14, 48, 26); c.stroke(); arrowHead(c, 49, 28, 1.1, 10); dot(c, 14, 48, 4); };
  G['Power Shot'] = c => { c.beginPath(); c.moveTo(36, 8); c.lineTo(18, 36); c.lineTo(30, 36); c.lineTo(26, 56); c.lineTo(46, 26); c.lineTo(33, 26); c.closePath(); c.fill(); };
  G['Low Driven Shot'] = c => { line(c, [[8, 46], [56, 46]]); c.lineWidth = 4; line(c, [[12, 34], [44, 34]]); arrowHead(c, 54, 34, 0, 12); line(c, [[8, 26], [26, 26]]); };
  G['Chip Shot'] = c => { c.beginPath(); c.moveTo(10, 46); c.quadraticCurveTo(32, -6, 54, 46); c.stroke(); arrowHead(c, 54, 46, 1.9, 10); c.fillRect(28, 38, 8, 12); };
  G['Dead Ball'] = c => { ball(c, 32, 34, 14); dot(c, 32, 34, 5); line(c, [[14, 56], [50, 56]]); c.beginPath(); c.moveTo(46, 8); c.lineTo(46, 22); c.stroke(); c.beginPath(); c.moveTo(46, 8); c.lineTo(56, 12); c.lineTo(46, 16); c.fill(); };
  G['Precision Header'] = c => { ball(c, 32, 18, 9); line(c, [[32, 56], [32, 36]]); arrowHead(c, 32, 32, -Math.PI / 2, 10); c.lineWidth = 3; ball(c, 32, 18, 15); };
  G['Acrobatic'] = c => { c.beginPath(); c.arc(32, 32, 18, 0.5, 5.0); c.stroke(); arrowHead(c, 20, 47, 2.4, 11); dot(c, 32, 32, 5); };
  G['Gamechanger'] = c => { c.beginPath(); c.moveTo(32, 6); c.lineTo(38, 26); c.lineTo(58, 32); c.lineTo(38, 38); c.lineTo(32, 58); c.lineTo(26, 38); c.lineTo(6, 32); c.lineTo(26, 26); c.closePath(); c.fill(); };
  G['Incisive Pass'] = c => { dot(c, 12, 32, 5); dot(c, 52, 32, 5); c.lineWidth = 5; line(c, [[20, 52], [20, 12]]); line(c, [[44, 52], [44, 12]]); c.lineWidth = 4; line(c, [[14, 46], [42, 24]]); arrowHead(c, 48, 20, -0.6, 11); };
  G['Pinged Pass'] = c => { c.lineWidth = 4; line(c, [[6, 22], [30, 22]]); line(c, [[6, 42], [30, 42]]); line(c, [[6, 32], [46, 32]]); arrowHead(c, 58, 32, 0, 14); };
  G['Long Ball Pass'] = c => { c.beginPath(); c.moveTo(6, 50); c.bezierCurveTo(14, 4, 46, 4, 56, 44); c.stroke(); arrowHead(c, 57, 46, 1.6, 11); dot(c, 8, 50, 4); };
  G['Whipped Pass'] = c => { c.beginPath(); c.moveTo(8, 50); c.bezierCurveTo(8, 20, 30, 40, 36, 20); c.bezierCurveTo(38, 14, 44, 12, 52, 12); c.stroke(); arrowHead(c, 56, 12, 0, 10); dot(c, 8, 50, 4); };
  G['Tiki Taka'] = c => { c.lineWidth = 3; line(c, [[32, 10], [10, 50], [54, 50], [32, 10]]); dot(c, 32, 10, 6); dot(c, 10, 50, 6); dot(c, 54, 50, 6); };
  G['Inventive'] = c => { ball(c, 32, 26, 15); line(c, [[24, 46], [40, 46]]); line(c, [[26, 53], [38, 53]]); line(c, [[28, 36], [28, 44]]); line(c, [[36, 36], [36, 44]]); };
  G['Technical'] = c => { ball(c, 32, 32, 12); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; line(c, [[32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15], [32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24]]); } dot(c, 32, 32, 4); };
  G['Trickster'] = c => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 11 : 26; c.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); } c.closePath(); c.fill(); };
  G['First Touch'] = c => { ball(c, 32, 44, 11); line(c, [[32, 6], [32, 24]]); arrowHead(c, 32, 28, Math.PI / 2, 11); c.lineWidth = 3; line(c, [[18, 56], [46, 56]]); };
  G['Press Proven'] = c => { c.beginPath(); c.moveTo(32, 6); c.lineTo(54, 14); c.lineTo(52, 38); c.quadraticCurveTo(48, 52, 32, 58); c.quadraticCurveTo(16, 52, 12, 38); c.lineTo(10, 14); c.closePath(); c.stroke(); line(c, [[24, 24], [32, 34], [40, 24]]); line(c, [[24, 36], [32, 46], [40, 36]]); };
  G['Relentless'] = c => { c.lineWidth = 4; c.strokeRect(8, 20, 42, 24); c.fillRect(50, 28, 6, 8); [14, 24, 34].forEach(x => c.fillRect(x, 25, 7, 14)); };
  G['Rapid'] = c => { [8, 26, 44].forEach(x => { c.beginPath(); c.moveTo(x, 12); c.lineTo(x + 14, 32); c.lineTo(x, 52); c.lineTo(x + 8, 52); c.lineTo(x + 22, 32); c.lineTo(x + 8, 12); c.closePath(); c.fill(); }); };
  G['Quick Step'] = c => { c.beginPath(); c.moveTo(20, 30); c.lineTo(32, 10); c.lineTo(44, 30); c.stroke(); c.beginPath(); c.moveTo(20, 50); c.lineTo(32, 30); c.lineTo(44, 50); c.stroke(); line(c, [[10, 18], [10, 54]]); line(c, [[54, 18], [54, 54]]); };
  G['Intercept'] = c => { c.lineWidth = 5; line(c, [[10, 14], [54, 50]]); line(c, [[54, 14], [10, 50]]); ball(c, 32, 32, 8); };
  G['Anticipate'] = c => { c.beginPath(); c.moveTo(4, 32); c.quadraticCurveTo(32, 2, 60, 32); c.quadraticCurveTo(32, 62, 4, 32); c.stroke(); dot(c, 32, 32, 8); };
  G['Jockey'] = c => { line(c, [[10, 24], [54, 24]]); arrowHead(c, 58, 24, 0, 10); line(c, [[54, 42], [10, 42]]); arrowHead(c, 6, 42, Math.PI, 10); };
  G['Slide Tackle'] = c => { line(c, [[6, 52], [58, 52]]); c.lineWidth = 6; line(c, [[12, 22], [42, 42]]); arrowHead(c, 52, 46, 0.55, 12); };
  G['Block'] = c => { c.beginPath(); c.moveTo(32, 6); c.lineTo(54, 14); c.lineTo(52, 38); c.quadraticCurveTo(48, 52, 32, 58); c.quadraticCurveTo(16, 52, 12, 38); c.lineTo(10, 14); c.closePath(); c.fill(); };
  G['Bruiser'] = c => { c.lineJoin = 'round'; c.lineWidth = 5; c.strokeRect(16, 24, 32, 26); [22, 30, 38, 46].forEach(x => line(c, [[x - 4, 24], [x - 4, 14]])); line(c, [[18, 14], [44, 14]]); line(c, [[48, 38], [56, 38]]); };
  G['Enforcer'] = c => { c.fillRect(38, 10, 8, 44); c.lineWidth = 6; line(c, [[8, 32], [32, 32]]); arrowHead(c, 38, 32, 0, 13); };
  G['Aerial Fortress'] = c => { c.fillRect(12, 28, 40, 28); [12, 24, 36, 44].forEach(x => c.fillRect(x, 18, 8, 10)); c.lineWidth = 5; line(c, [[32, 8], [32, 2]]); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(27, 40, 10, 16); };
  G['Long Throw'] = c => { c.beginPath(); c.moveTo(10, 52); c.bezierCurveTo(14, 10, 44, 6, 54, 30); c.stroke(); arrowHead(c, 55, 33, 1.3, 11); dot(c, 10, 52, 5); line(c, [[6, 58], [22, 58]]); };
  G['Far Reach'] = c => { line(c, [[8, 32], [56, 32]]); arrowHead(c, 60, 32, 0, 11); arrowHead(c, 4, 32, Math.PI, 11); c.lineWidth = 4; ball(c, 32, 32, 11); };
  G['Footwork'] = c => { c.beginPath(); c.moveTo(30, 8); c.lineTo(16, 34); c.lineTo(27, 34); c.lineTo(22, 56); c.lineTo(42, 26); c.lineTo(31, 26); c.closePath(); c.fill(); c.lineWidth = 3; line(c, [[46, 14], [54, 22]]); line(c, [[48, 38], [56, 38]]); };
  G['1v1 Close Down'] = c => { c.lineWidth = 3; ball(c, 32, 32, 22); ball(c, 32, 32, 12); dot(c, 32, 32, 3); line(c, [[4, 6], [24, 26]]); arrowHead(c, 26, 28, 0.8, 10); };
  G['Cross Claimer'] = c => { c.beginPath(); c.moveTo(14, 56); c.lineTo(14, 32); c.quadraticCurveTo(14, 22, 22, 24); c.lineTo(22, 40); c.moveTo(22, 24); c.lineTo(22, 16); c.quadraticCurveTo(22, 12, 27, 14); c.lineTo(27, 30); c.moveTo(27, 14); c.quadraticCurveTo(32, 10, 36, 14); c.lineTo(36, 30); c.moveTo(36, 16); c.quadraticCurveTo(42, 14, 44, 20); c.lineTo(44, 40); c.quadraticCurveTo(44, 54, 30, 56); c.stroke(); dot(c, 52, 12, 5); };
  G['Deflector'] = c => { c.lineWidth = 6; line(c, [[30, 8], [30, 56]]); c.lineWidth = 4; line(c, [[6, 20], [28, 32]]); line(c, [[34, 32], [54, 12]]); arrowHead(c, 56, 10, -0.8, 10); };
  G['Far Throw'] = c => { c.beginPath(); c.moveTo(8, 46); c.bezierCurveTo(16, 12, 44, 12, 54, 30); c.stroke(); arrowHead(c, 56, 32, 1.1, 10); line(c, [[8, 54], [22, 54]]); dot(c, 8, 46, 5); line(c, [[40, 44], [56, 44]]); arrowHead(c, 60, 44, 0, 8); };

  /* v225 (JODIO: "redesign the PlayStyle logos using Figma to look more like FC27"): new pictogram glyphs, drawn in Figma
     (file "FC Retro 27 PlayStyle logos") from this same path data and used here through Path2D. The old canvas glyphs above stay as a fallback. */
  // v225 FC 27-style PlayStyle glyphs: SVG path data in a 64 box. 's' = stroke 5, 's3' = stroke 3, 'f' = fill. Shared by the game (Path2D) and the Figma sheet.
  const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const PS_SPEC = {
    'Finesse Shot': [['s', 'M14 50C14 28 28 16 48 16'], ['f', 'M46 6L60 16L46 26Z'], ['f', C(14, 50, 6)]],
    'Power Shot': [['f', 'M37 4L15 36H29L24 60L49 26H35L41 4Z']],
    'Low Driven Shot': [['s', 'M8 38H44'], ['f', 'M42 28L58 38L42 48Z'], ['s3', 'M8 26H24'], ['s3', 'M6 54H58']],
    'Chip Shot': [['s', 'M10 52Q30 0 50 44'], ['f', 'M42 42L54 56L58 38Z'], ['f', C(10, 52, 5)], ['s3', 'M24 58H40']],
    'Dead Ball': [['s', C(32, 38, 13)], ['f', 'M32 31L38 35.5L35.7 42.5H28.3L26 35.5Z'], ['s3', 'M16 18Q32 2 48 18'], ['f', 'M44 10L52 20L41 22Z']],
    'Precision Header': [['s', C(26, 42, 12)], ['f', C(46, 14, 7)], ['s3', 'M34 32L40 22']],
    'Acrobatic': [['s', 'M16 46A17 17 0 1 1 46 48'], ['f', 'M38 44L52 52L50 36Z'], ['f', C(32, 34, 5)]],
    'Gamechanger': [['f', 'M32 4L38 26L60 32L38 38L32 60L26 38L4 32L26 26Z']],
    'Incisive Pass': [['s', 'M22 10V54'], ['s', 'M42 10V54'], ['s', 'M6 32H46'], ['f', 'M44 22L60 32L44 42Z']],
    'Pinged Pass': [['s', 'M6 32H42'], ['f', 'M40 20L60 32L40 44Z'], ['s3', 'M6 18H28'], ['s3', 'M6 46H28']],
    'Long Ball Pass': [['s', 'M8 52C14 8 44 6 52 40'], ['f', 'M44 38L54 54L60 36Z'], ['f', C(8, 52, 5)]],
    'Whipped Pass': [['s', 'M8 52C8 26 30 40 34 24C36 16 42 12 48 12'], ['f', 'M46 2L60 12L46 22Z'], ['f', C(8, 52, 5)]],
    'Tiki Taka': [['s3', 'M32 12L12 50H52Z'], ['f', C(32, 12, 7)], ['f', C(12, 50, 7)], ['f', C(52, 50, 7)]],
    'Inventive': [['s', 'M32 8A15 15 0 0 1 41 35V42H23V35A15 15 0 0 1 32 8Z'], ['s3', 'M25 50H39'], ['s3', 'M28 57H36']],
    'Technical': [['s', C(32, 32, 11)], ['s3', 'M8 38C14 54 50 54 56 38'], ['s3', 'M56 26C50 10 14 10 8 26'], ['f', 'M52 20L60 28L50 30Z']],
    'Trickster': [['f', 'M32 6L39 24L58 25L43 37L48 56L32 45L16 56L21 37L6 25L25 24Z']],
    'First Touch': [['s', 'M32 4V22'], ['f', 'M22 20L32 32L42 20Z'], ['s', C(32, 46, 10)], ['s3', 'M14 60H50']],
    'Press Proven': [['s', 'M32 6L54 14L52 36Q48 52 32 58Q16 52 12 36L10 14Z'], ['f', C(32, 32, 9)]],
    'Rapid': [['f', 'M6 12L20 32L6 52H14L28 32L14 12Z'], ['f', 'M24 12L38 32L24 52H32L46 32L32 12Z'], ['f', 'M42 12L56 32L42 52H50L64 32L50 12Z']],
    'Quick Step': [['s', 'M18 30L32 12L46 30'], ['s', 'M18 52L32 34L46 52']],
    'Intercept': [['s', 'M6 44L36 26'], ['f', 'M30 18L46 22L38 36Z'], ['s', 'M48 8V56']],
    'Anticipate': [['s', 'M4 32Q32 2 60 32Q32 62 4 32Z'], ['f', C(32, 32, 9)]],
    'Jockey': [['s', 'M10 22H50'], ['f', 'M48 12L60 22L48 32Z'], ['s', 'M54 44H14'], ['f', 'M16 34L4 44L16 54Z']],
    'Slide Tackle': [['s3', 'M4 56H60'], ['s', 'M10 20L42 42'], ['f', 'M38 32L56 48L34 50Z']],
    'Block': [['f', 'M32 4L56 13L54 36Q50 54 32 60Q14 54 10 36L8 13Z']],
    'Bruiser': [['s', 'M4 32H22'], ['f', 'M20 22L32 32L20 42Z'], ['s', 'M60 32H42'], ['f', 'M44 22L32 32L44 42Z'], ['s3', 'M32 6V16'], ['s3', 'M32 48V58']],
    'Enforcer': [['f', 'M40 8H48V56H40Z'], ['s', 'M6 32H30'], ['f', 'M28 20L40 32L28 44Z']],
    'Relentless': [['s3', 'M6 20H50V44H6Z'], ['f', 'M50 27H58V37H50Z'], ['f', 'M11 25H19V39H11Z'], ['f', 'M23 25H31V39H23Z'], ['f', 'M35 25H43V39H35Z']],
    'Aerial Fortress': [['f', 'M12 28H52V58H12Z'], ['f', 'M12 18H20V28H12Z'], ['f', 'M28 18H36V28H28Z'], ['f', 'M44 18H52V28H44Z'], ['s3', 'M32 4V14']],
    'Long Throw': [['s', 'M10 54C14 10 44 6 54 30'], ['f', 'M46 30L56 44L60 26Z'], ['f', C(10, 54, 6)]],
    'Far Reach': [['s', 'M8 32H56'], ['f', 'M50 22L62 32L50 42Z'], ['f', 'M14 22L2 32L14 42Z'], ['s3', C(32, 32, 12)]],
    'Footwork': [['f', 'M31 6L15 34H27L22 58L44 26H32L37 6Z'], ['s3', 'M4 58H18'], ['s3', 'M46 58H60']],
    '1v1 Close Down': [['s3', C(36, 36, 22)], ['s3', C(36, 36, 11)], ['f', C(36, 36, 4)], ['s', 'M4 4L22 22'], ['f', 'M14 26L28 28L26 14Z']],
    'Cross Claimer': [['f', C(32, 12, 8)], ['s', 'M14 58V34Q14 26 20 28V40'], ['s', 'M20 30V22Q20 18 25 20V38'], ['s', 'M25 22V20Q25 16 31 18V38'], ['s', 'M31 20Q31 16 37 18V40Q44 30 48 36Q42 50 36 58']],
    'Deflector': [['s', 'M30 6V58'], ['s', 'M6 18L26 32'], ['s', 'M34 32L52 16'], ['f', 'M46 8L60 10L54 22Z']],
    'Far Throw': [['s', 'M8 48C16 14 42 10 54 28'], ['f', 'M46 28L56 42L60 24Z'], ['f', C(8, 48, 6)], ['s3', 'M4 58H22']],
  };
  const cache = {}, shortOf = n => String(n).replace(/\+$/, '');
  // v166 (JODIO): a PlayStyle+ badge in the colours of the card it belongs to: [inner, outer, rim, glyph]
  const TINT = {
    gold: ['#fff0b0', '#c8930f', '#fff6cf', '#3a2600'], silver: ['#ffffff', '#8a95a3', '#ffffff', '#1b2128'], bronze: ['#f0c08c', '#7a4519', '#f8dcbc', '#2b1405'],
    bdor: ['#4a3608', '#0b0803', '#f4c542', '#ffd34a'], clpromo: ['#3a64d8', '#05123f', '#d6e4ff', '#ffffff'], cl: ['#3a64d8', '#05123f', '#d6e4ff', '#ffffff'],
    nlstar: ['#e2f5ff', '#3f7fd8', '#ffffff', '#08204a'], nlpofm: ['#5ae0ff', '#0a1f7a', '#c8f6ff', '#ffffff'], evo: ['#b4ff96', '#0d6b3a', '#e2ffd6', '#062010'],
    promo: ['#ff8ae6', '#6a1060', '#ffd6f6', '#ffffff'], totw: ['#4a4a4a', '#050505', '#f5d76e', '#f5d76e'], potm: ['#7ab4ff', '#0f2c7a', '#e0eeff', '#ffffff'], flashback: ['#6ff5da', '#0b5f6e', '#d6fff6', '#ffffff'],
  };
  // v169 (JODIO: "make the PS+ logo look a lot like the one in FC27"): FC-style gem badge. PlayStyle+ = a filled pale-gold gem
  // (flat top, cut shoulders, point at the bottom) with a dark glyph; a plain PlayStyle = the same gem as a dark outline with a
  // light glyph. Special cards recolour the gem with their own palette (TINT).
  const GEM = [[17, 7], [47, 7], [60, 21], [32, 59], [4, 21]];
  const gemPath = (c, inset) => {
    const cx = 32, cy = 27; c.beginPath();
    GEM.forEach(([x, y], i) => { const px = cx + (x - cx) * (1 - inset), py = cy + (y - cy) * (1 - inset); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.closePath();
  };
  function draw(name, gold, S, tint) {
    const T = tint && TINT[tint] && TINT[tint];
    const base = shortOf(name), cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), k = S / 64; c.scale(k, k); c.lineJoin = 'round';
    let glyph;
    if (gold) {
      const top = T ? T[0] : '#fbefb8', bot = T ? T[1] : '#c99a2e', rim = T ? T[2] : '#fff7d6';
      glyph = T ? T[3] : '#2b1d02';
      // soft drop shadow, then the dark outline, the metal fill and a light inner rim
      c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 4; c.shadowOffsetY = 2; gemPath(c, 0); c.fillStyle = '#3a2808'; c.fill(); c.restore();
      gemPath(c, 0.08); const g = c.createLinearGradient(0, 7, 0, 59); g.addColorStop(0, top); g.addColorStop(0.55, bot); g.addColorStop(1, top); c.fillStyle = g; c.fill();
      c.lineWidth = 1.6; c.strokeStyle = rim; gemPath(c, 0.16); c.stroke();
      // facet sheen across the upper half
      c.save(); gemPath(c, 0.08); c.clip(); c.globalAlpha = 0.35; c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(4, 7); c.lineTo(40, 7); c.lineTo(22, 33); c.lineTo(4, 33); c.closePath(); c.fill(); c.restore();
    } else {
      // plain PlayStyle: dark gem, silver outline, white glyph
      c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 3; c.shadowOffsetY = 1.5; gemPath(c, 0.04); c.fillStyle = T ? T[1] : '#0d0d0d'; c.fill(); c.restore();
      c.lineWidth = 3; c.strokeStyle = T ? T[2] : '#c9a227'; gemPath(c, 0.1); c.stroke();   // v225: black gem, gold edge (the game's Ballon d'Or colours)
      glyph = T ? T[2] : '#ffffff';
    }
    // glyph, scaled into the wide upper part of the gem
    c.save(); c.translate(32, 27.5); c.scale(0.56, 0.56); c.translate(-32, -32);
    c.fillStyle = glyph; c.strokeStyle = glyph; c.lineWidth = 5.5; c.lineCap = 'round'; c.lineJoin = 'round';
    const sp = typeof Path2D !== 'undefined' && PS_SPEC[base];
    try { if (sp) sp.forEach(([t, d]) => { const pa = new Path2D(d); if (t === 'f') c.fill(pa); else { c.lineWidth = t === 's3' ? 3.4 : 5.5; c.stroke(pa); } }); else (G[base] || G['Trickster'])(c); } catch (e) { /* glyph failed: the plain gem stays */ }
    c.restore();
    return cv;
  }
  const PSIcon = {
    FAMILY, short: shortOf,
    canvas(name, gold, tint) { const g = gold == null ? /\+$/.test(name) : gold, t = tint && TINT[tint] ? tint : '', k = shortOf(name) + (g ? '+' : '') + t; return cache[k] || (cache[k] = draw(name, g, 64, t)); },
    url(name, gold, tint) { const g = gold == null ? /\+$/.test(name) : gold, t = tint && TINT[tint] ? tint : '', k = 'u' + shortOf(name) + (g ? '+' : '') + t; return cache[k] || (cache[k] = this.canvas(name, g, t).toDataURL('image/png')); },
    TINT,
    names: Object.keys(FAMILY),
  };
  RUT.PSIcon = PSIcon;
})();
