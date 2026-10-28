/* v251 (JODIO): GAMETRAITS. Like PlayStyles, but the player does them by himself in the right moment, with no button: 15 traits in 5 categories,
   each with a red round logo and a normal and a plus (+) version. A card has as many Gametraits as PlayStyles+ it has (special cards) or 2/3 of that (plain gold cards), max 3.
   The engine runs them (engine.js gtStep); the card shows them on its right side (main.js cardHTML). */
(function () {
  const CATS = [
    { k: 'fin', name: 'Finishing' }, { k: 'pla', name: 'Playmaking' }, { k: 'mov', name: 'Movement' }, { k: 'def', name: 'Defending' }, { k: 'gk', name: 'Goalkeeping' },
  ];
  // stat: the card stats that earn it (average), pos: positions that can have it
  const A = ['ST', 'CF', 'LW', 'RW', 'LM', 'RM', 'CAM'], M = ['CAM', 'CM', 'CDM', 'LM', 'RM', 'LW', 'RW'], D = ['CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM'];
  const LIST = [
    { k: 'timef', cat: 'fin', name: 'Time Finisher', sym: 'goal', pos: A, stat: ['finishing', 'positioning', 'composure'], d: 'Shoots by himself when the ball comes to him in the box, with the right power and good accuracy.', d2: 'Quicker, harder and more accurate.' },
    { k: 'range', cat: 'fin', name: 'Range Finder', sym: 'bolt', pos: A.concat(['CM']), stat: ['longShots', 'shotPower'], d: 'Hits a long shot by himself from 18 to 28 m when he has a clear sight of goal.', d2: 'Wider range, more power and curl.' },
    { k: 'crash', cat: 'fin', name: 'Box Crasher', sym: 'arrow', pos: A, stat: ['positioning', 'ballControl', 'headingAccuracy'], d: 'Runs into the box by himself when a team-mate attacks down the wing.', d2: 'Starts earlier and runs further.' },
    { k: 'perfp', cat: 'pla', name: 'Perfect Pass', sym: 'target', pos: M, stat: ['vision', 'shortPassing', 'longPassing'], d: 'Under pressure he plays the right through ball to the right man, and it reaches him about 6 times in 10.', d2: 'The ball always reaches him, and he plays it further.' },
    { k: 'pincr', cat: 'pla', name: 'Pinpoint Cross', sym: 'cross', pos: ['LB', 'RB', 'LM', 'RM', 'LW', 'RW', 'LWB', 'RWB', 'CAM'], stat: ['crossing', 'curve'], d: 'Whips in a cross by himself from wide in the final third when a team-mate is in the box.', d2: 'More accurate, lands on the head.' },
    { k: 'switch', cat: 'pla', name: 'Switch Master', sym: 'swap', pos: M.concat(['CB']), stat: ['longPassing', 'vision'], d: 'Spots a free man on the far side and switches play with a long ball.', d2: 'A long ball that always reaches him, driven harder.' },
    { k: 'burst', cat: 'mov', name: 'Burst Runner', sym: 'flash', pos: A.concat(['LB', 'RB', 'CM']), stat: ['acceleration', 'sprintSpeed'], d: 'Kicks into a sprint by himself when there is open grass in front of him.', d2: 'Bigger and longer burst.' },
    { k: 'escape', cat: 'mov', name: 'Escape Artist', sym: 'spin', pos: A.concat(['CM']), stat: ['dribbling', 'agility', 'balance'], d: 'Rolls away from a defender by himself when he is closed down.', d2: 'Works against two and keeps more speed.' },
    { k: 'ghost', cat: 'mov', name: 'Ghost Runner', sym: 'ghost', pos: A, stat: ['positioning', 'acceleration', 'ballControl'], d: 'Slips in behind the defence when his team wins the ball in midfield.', d2: 'Reads it earlier and goes deeper.' },
    { k: 'charge', cat: 'def', name: 'Charge Defender', sym: 'shield', pos: D, stat: ['standingTackle', 'slidingTackle', 'aggression'], d: 'Charges at the ball and slides in by himself when the opponent gives him a chance (a heavy touch).', d2: 'Reads the touch sooner and wins it more.' },
    { k: 'shadow', cat: 'def', name: 'Shadow Marker', sym: 'eye', pos: D, stat: ['defAwareness', 'interceptions', 'standingTackle'], d: 'Locks onto the nearest runner and stays goal-side of him.', d2: 'Tighter and faster.' },
    { k: 'lane', cat: 'def', name: 'Lane Cutter', sym: 'lane', pos: D.concat(['CAM']), stat: ['interceptions', 'defAwareness'], d: 'Reaches much further to cut out passes.', d2: 'Reaches even further.' },
    { k: 'ditch', cat: 'def', name: 'Last Ditch', sym: 'cross2', pos: ['CB', 'LB', 'RB', 'CDM'], stat: ['slidingTackle', 'defAwareness'], d: 'As last man he slides in by himself the moment the attacker is through.', d2: 'Wins the ball far more often.' },
    { k: 'sweep', cat: 'gk', name: 'Sweeper Keeper', sym: 'glove', pos: ['GK'], stat: ['gkPositioning', 'gkKicking'], d: 'Rushes out by himself to clear a through ball behind his line.', d2: 'Reads it sooner and clears further.' },
    { k: 'wall', cat: 'gk', name: 'Reflex Wall', sym: 'wall', pos: ['GK'], stat: ['gkReflexes', 'gkDiving'], d: 'Saves shots he had no right to save.', d2: 'Saves even more.' },
  ];
  const BY = {}; LIST.forEach(t => { BY[t.k] = t; });
  const avg = (s, arr) => arr.reduce((a, k) => a + (s[k] || 55), 0) / arr.length;
  const special = c => !!(c.promo || c.cl || c.rarity === 'evo' || c.rarity === 'bdor' || c.rarity === 'icon' || c.potLg || c.award);

  /** The Gametraits of a card: [{k, lv}] lv 1 normal, 2 plus. Cached on the card. */
  function of(c) {
    if (!c || !c.sub) return [];
    if (c._gt && c._gt.r === c.rating && c._gt.n === (c.playStyles || []).length) return c._gt.l;
    const n = (c.playStyles || []).filter(x => /\+$/.test(x)).length;
    let cnt = n ? (special(c) ? n : Math.ceil(n * 2 / 3)) : 0;
    if (c.rating >= 90) cnt++;
    cnt = Math.min(3, cnt);
    const pos = c.position;
    const BIAS = { crash: 7, pincr: 5, shadow: 5, ghost: 4, lane: 3, switch: 2 };
    const cand = LIST.filter(t => t.pos.indexOf(pos) >= 0).map(t => ({ t, sc: avg(c.sub, t.stat) + (BIAS[t.k] || 0) + (c.id ? ((c.id.length * 7 + t.k.length * 3) % 5) * 0.3 : 0) })).sort((a, b) => b.sc - a.sc);
    const out = [];
    for (const x of cand) { if (out.length >= cnt) break; if (x.sc < 60) continue; if (out.some(o => BY[o.k].cat === x.t.cat && out.length < 2 && BY[o.k].cat !== 'gk')) { /* spread over categories first */ continue; } out.push({ k: x.t.k, lv: x.sc >= 86 || c.rating >= 91 ? 2 : 1 }); }
    for (const x of cand) { if (out.length >= cnt) break; if (x.sc >= 60 && !out.some(o => o.k === x.t.k)) out.push({ k: x.t.k, lv: x.sc >= 86 || c.rating >= 91 ? 2 : 1 }); }
    c._gt = { r: c.rating, n: (c.playStyles || []).length, l: out };
    return out;
  }

  /* ---- the red round logo (drawn once per symbol, cached) ---- */
  const cache = {};
  function canvas(k, plus) {
    const key = k + (plus ? '+' : ''); if (cache[key]) return cache[key];
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), m = S / 2;
    const rg = g.createRadialGradient(m - 10, m - 12, 4, m, m, m); rg.addColorStop(0, plus ? '#ff6b5e' : '#ee4438'); rg.addColorStop(1, plus ? '#a50f10' : '#8c1511');
    g.beginPath(); g.arc(m, m, m - 3, 0, 7); g.fillStyle = rg; g.fill();
    g.lineWidth = plus ? 5 : 3; g.strokeStyle = plus ? '#ffd45a' : '#ffb3a8'; g.stroke();
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 4.5; g.lineCap = 'round'; g.lineJoin = 'round';
    const sym = (BY[k] || {}).sym, P = (...a) => { g.beginPath(); a.forEach((v, i) => { if (i % 2 === 0) g[i === 0 ? 'moveTo' : 'lineTo'](v, a[i + 1]); }); };
    const cx = m, cy = m;
    switch (sym) {
      case 'goal': g.strokeRect(18, 22, 28, 20); g.lineWidth = 2; for (let i = 1; i < 4; i++) { P(18 + i * 7, 22, 18 + i * 7, 42); g.stroke(); } g.beginPath(); g.arc(46, 44, 4, 0, 7); g.fill(); break;
      case 'bolt': P(36, 14, 22, 36, 31, 36, 27, 52, 43, 28, 33, 28); g.closePath(); g.fill(); break;
      case 'arrow': P(18, 44, 40, 22); g.stroke(); P(28, 20, 42, 20, 42, 34); g.stroke(); break;
      case 'target': g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 2.5, 0, 7); g.fill(); break;
      case 'cross': g.beginPath(); g.moveTo(16, 46); g.quadraticCurveTo(26, 10, 46, 20); g.stroke(); P(38, 12, 48, 20, 38, 28); g.stroke(); break;
      case 'swap': P(16, 26, 46, 26); g.stroke(); P(38, 18, 46, 26, 38, 34); g.stroke(); P(48, 40, 18, 40); g.stroke(); P(26, 32, 18, 40, 26, 48); g.stroke(); break;
      case 'flash': P(34, 12, 20, 34, 30, 34, 26, 52, 44, 28, 34, 28, 40, 12); g.closePath(); g.fill(); break;
      case 'spin': g.beginPath(); g.arc(cx, cy, 14, 0.6, 5.4); g.stroke(); P(40, 14, 44, 24, 34, 24); g.stroke(); break;
      case 'ghost': g.beginPath(); g.moveTo(20, 48); g.lineTo(20, 28); g.arc(cx, 28, 12, Math.PI, 0); g.lineTo(44, 48); g.lineTo(38, 43); g.lineTo(32, 48); g.lineTo(26, 43); g.closePath(); g.fill(); g.fillStyle = '#b21812'; g.beginPath(); g.arc(27, 29, 2.6, 0, 7); g.arc(37, 29, 2.6, 0, 7); g.fill(); break;
      case 'shield': g.beginPath(); g.moveTo(cx, 14); g.lineTo(46, 22); g.lineTo(44, 38); g.quadraticCurveTo(cx, 54, cx, 54); g.quadraticCurveTo(cx, 54, 20, 38); g.lineTo(18, 22); g.closePath(); g.stroke(); P(cx, 22, cx, 42); g.stroke(); P(24, 30, 40, 30); g.stroke(); break;
      case 'eye': g.beginPath(); g.moveTo(12, cy); g.quadraticCurveTo(cx, 12, 52, cy); g.quadraticCurveTo(cx, 52, 12, cy); g.stroke(); g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill(); break;
      case 'lane': P(18, 18, 18, 46); g.stroke(); P(46, 18, 46, 46); g.stroke(); g.lineWidth = 3; P(24, 32, 40, 32); g.stroke(); P(34, 26, 40, 32, 34, 38); g.stroke(); break;
      case 'cross2': P(20, 20, 44, 44); g.stroke(); P(44, 20, 20, 44); g.stroke(); break;
      case 'glove': g.beginPath(); g.moveTo(22, 48); g.lineTo(22, 30); g.lineTo(26, 18); g.lineTo(30, 28); g.lineTo(32, 14); g.lineTo(36, 28); g.lineTo(40, 18); g.lineTo(42, 32); g.lineTo(46, 28); g.lineTo(44, 48); g.closePath(); g.fill(); break;
      case 'wall': g.fillRect(16, 20, 14, 10); g.fillRect(34, 20, 14, 10); g.fillRect(16, 34, 6, 10); g.fillRect(26, 34, 14, 10); g.fillRect(44, 34, 4, 10); break;
      default: g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fill();
    }
    if (plus) { g.fillStyle = '#ffd45a'; g.strokeStyle = '#7a1008'; g.lineWidth = 3; g.beginPath(); g.arc(50, 14, 11, 0, 7); g.fill(); g.stroke(); g.strokeStyle = '#7a1008'; g.lineWidth = 3.5; P(44.5, 14, 55.5, 14); g.stroke(); P(50, 8.5, 50, 19.5); g.stroke(); }
    return (cache[key] = c);
  }
  const urls = {};
  const url = (k, plus) => { const key = k + (plus ? '+' : ''); return urls[key] || (urls[key] = canvas(k, plus).toDataURL()); };

  window.RUT = window.RUT || {};
  RUT.GT = { LIST, BY, CATS, of, canvas, url };
})();
