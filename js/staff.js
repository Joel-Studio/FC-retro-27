/* =============================================================================
 * staff.js  -  Coaches and training (v118)
 * Up to 5 coaches. Each has stars (1-5), a way of playing from the Soccer Tactics Playbook (formation + tactic points + trait), a favourite area (attackers,
 * midfielders, defenders, goalkeeper) and a training site. A session takes 5 real minutes on the clock (it keeps running while you play matches and finishes
 * while the game is closed); a coach runs 5 (1 star) up to 15 (5 stars) sessions a day. Every session adds training points to an area; the points turn into
 * "better AI": the football brain of that area's players is lifted (up to 2% at 1 star, 10% at 5 stars) whenever your club plays or is watched.
 * ========================================================================== */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const SESSION_MS = 5 * 60 * 1000;
  const COST = [0, 15000, 45000, 100000, 180000, 300000];            // by stars
  const PERDAY = [0, 5, 7, 10, 12, 15];
  const CAP = [0, 0.04, 0.08, 0.12, 0.16, 0.20];                      // the best coach's stars set the most the AI can gain
  const AREAS = { att: 'Attackers', mid: 'Midfielders', def: 'Defenders', gk: 'Goalkeeper' };
  const MAXC = 5, FULL = 30, FEE = 0.30;          // FEE: a coach's whole day of sessions costs 30% of his hire price, split over the day's sessions
  const feeOf = id => { const p = POOL.find(c => c.id === id); return Math.round(COST[p.stars] * FEE / PERDAY[p.stars]); };                                           // points of an area at which the cap is reached
  /** The ten playbook systems: shape, tactic points (attack-midfield-defence), trait, and the coaching lines that matter. */
  const STYLES = [
    { n: '4-3-3 Classic', form: '433', a: 2, m: 2, d: 2, t: 'wings', info: 'Total Football heritage: pivot drops between the centre-backs, wingers high and wide, the 8 on the ball side underlaps for a 3v2.' },
    { n: '4-4-2 Flat', form: '442', a: 2, m: 2, d: 2, t: 'wings', info: 'Two compact banks of four, big man and little man up front, early crosses and second balls.' },
    { n: '4-2-3-1', form: '4231', a: 2, m: 2, d: 2, t: 'counter', info: 'Double pivot (one sits, one pushes), a creative 10, wingers cut in. Built for fast transitions.' },
    { n: '3-5-2 Wing-backs', form: '352', a: 3, m: 1, d: 2, t: 'wings', info: 'Three centre-backs, lung-busting wing-backs for width, a midfield three in the middle, two strikers combining.' },
    { n: '4-1-2-1-2 Diamond', form: '4121', a: 1, m: 3, d: 2, t: 'tikitaka', info: 'Narrow diamond with a number 10 at the tip, full-backs give the width, strike partnership.' },
    { n: '3-4-3 Aggressive', form: '343', a: 3, m: 1, d: 2, t: 'gegen', info: 'Back three, ultra-high wing-backs, front three. Drops to 5-3-2 without the ball.' },
    { n: '4-3-3 Positional Play', form: '433', a: 2, m: 3, d: 1, t: 'positional', info: 'Juego de posicion: five lanes, overloads in the half-spaces, aggressive press after a loss.' },
    { n: '3-2-4-1 Build-up', form: '3241', a: 1, m: 3, d: 2, t: 'total', info: 'Back three plus two deep mids build out, four creators between the lines, lone striker.' },
    { n: '4-2-2-2 Box', form: '4222', a: 3, m: 2, d: 1, t: 'highline', info: 'Double pivot, two narrow 10s behind two strikers, a hard high press.' },
    { n: '4-3-2-1 Christmas Tree', form: '4321', a: 1, m: 2, d: 3, t: 'counter', info: 'Flat four, three central midfielders, two tucked-in 10s, lone striker kept high for the counter.' },
    // v119: ten more systems (not from the PDF)
    { n: '4-5-1 Compact', form: '451', a: 1, m: 2, d: 3, t: 'counter', info: 'Five in midfield close the middle, lone striker, quick breaks down the flanks.' },
    { n: '5-3-2 Low Block', form: '532', a: 1, m: 2, d: 3, t: 'lowblock', info: 'Five at the back, sit deep, man-mark and hit on the counter.' },
    { n: '5-4-1 Fortress', form: '541', a: 0, m: 2, d: 3, t: 'lowblock', info: 'Two banks of five and four, nobody gets in behind, a lone runner up front.' },
    { n: '3-3-3-1 Possession', form: '3331', a: 1, m: 3, d: 2, t: 'positional', info: 'Back three, a midfield triangle and a creative line of three behind the striker.' },
    { n: '4-3-3 Gegenpress', form: '433', a: 3, m: 2, d: 1, t: 'gegen', info: 'Win it back within seconds, then straight vertical passes to the front three.' },
    { n: '4-2-3-1 Possession', form: '4231', a: 1, m: 3, d: 2, t: 'tikitaka', info: 'Double pivot keeps the ball, the 10 and wingers swap places in the half-spaces.' },
    { n: '4-4-2 Direct', form: '442', a: 3, m: 1, d: 2, t: 'longball', info: 'Early long balls for a big target man and a runner, second balls for the wide men.' },
    { n: '3-4-3 Wing Play', form: '343', a: 2, m: 2, d: 2, t: 'wings', info: 'Back three, wing-backs and wide forwards stretch the pitch, crosses for the striker.' },
    { n: '4-3-3 False Nine', form: '433', a: 2, m: 3, d: 1, t: 'falsenine', info: 'The striker drops into midfield, wingers cut in and attack the empty box.' },
    { n: '4-4-2 High Line', form: '442', a: 2, m: 2, d: 2, t: 'highline', info: 'A high line that steps up together, offside trap and a hard press by the two strikers.' },
  ];
  /** The coaches you can hire (never more than 5 at once). */
  const POOL = [
    { id: 'c1', name: 'Marco Valdes', stars: 5, style: 6, area: 'mid', site: 'Casa Verde Academy', drill: 'Rondos in tight boxes' },
    { id: 'c2', name: 'Anton Keller', stars: 5, style: 5, area: 'att', site: 'Iron Lake Press Hall', drill: 'Counter-press waves and finishing' },
    { id: 'c3', name: 'Stefano Rinaldi', stars: 5, style: 3, area: 'def', site: 'Terra Rossa Wall', drill: 'Back-three shape and wing-back runs' },
    { id: 'c4', name: 'Pieter de Wit', stars: 4, style: 0, area: 'att', site: 'Windmill Park', drill: '3v2 overloads on the wing' },
    { id: 'c5', name: 'Carlo Benedetti', stars: 4, style: 4, area: 'mid', site: 'Rossonero Rondo Yard', drill: 'Diamond passing circuits' },
    { id: 'c6', name: 'Joachim Brandt', stars: 4, style: 2, area: 'mid', site: 'Rhine Transition Arena', drill: 'Win it, break in six seconds' },
    { id: 'c7', name: 'Bruno Matos', stars: 3, style: 8, area: 'att', site: 'Copa Sandlot', drill: 'Two 10s behind two nines' },
    { id: 'c8', name: 'Ian Fletcher', stars: 3, style: 1, area: 'def', site: 'Old Boots Ground', drill: 'Two banks of four, hold the line' },
    { id: 'c9', name: 'Tomas Hruby', stars: 3, style: 7, area: 'mid', site: 'Build-up Hall', drill: 'Playing out against a high press' },
    { id: 'c10', name: 'Luca Ferri', stars: 2, style: 9, area: 'mid', site: 'Pine Tree Pitch', drill: 'Compact shape and quick breaks' },
    { id: 'c11', name: 'Gary Holt', stars: 2, style: 1, area: 'att', site: 'Cross & Volley Field', drill: 'Crossing and second balls' },
    { id: 'c12', name: 'Samir Haddad', stars: 2, style: 2, area: 'def', site: 'Desert Shield Yard', drill: 'Double-pivot cover' },
    { id: 'c13', name: 'Oleg Petrov', stars: 1, style: 1, area: 'gk', site: 'Back Garden Net', drill: 'Shot stopping and distribution' },
    { id: 'c14', name: 'Nils Aaberg', stars: 1, style: 0, area: 'att', site: 'Fjord Training Strip', drill: 'Winger one-v-ones' },
    { id: 'c15', name: 'Joao Freitas', stars: 1, style: 0, area: 'mid', site: 'Beach Rondo Court', drill: 'One-touch passing' },
    { id: 'c16', name: 'Heinz Vogel', stars: 5, style: 14, area: 'att', site: 'Black Forest Press Camp', drill: 'Win it back, shoot within 8 seconds' },
    { id: 'c17', name: 'Diego Salvatierra', stars: 5, style: 18, area: 'mid', site: 'Pampa Nine-Drop Pitch', drill: 'Dropping nines and cutting wingers' },
    { id: 'c18', name: 'Eero Laine', stars: 4, style: 15, area: 'mid', site: 'Nordic Possession Dome', drill: 'Keep-ball in two thirds' },
    { id: 'c19', name: 'Rafael Quintero', stars: 4, style: 17, area: 'att', site: 'Sierra Wing Lane', drill: 'Wing-back overlaps and crosses' },
    { id: 'c20', name: 'Mikael Dahl', stars: 4, style: 13, area: 'mid', site: 'Fjell Triangle Hall', drill: 'Passing triangles' },
    { id: 'c21', name: 'Yusuf Demir', stars: 3, style: 16, area: 'att', site: 'Bosphorus Direct Ground', drill: 'Long ball and second ball' },
    { id: 'c22', name: 'Andre Lacroix', stars: 3, style: 19, area: 'def', site: 'Riviera High Line Yard', drill: 'Offside trap timing' },
    { id: 'c23', name: 'Pavel Novak', stars: 3, style: 10, area: 'def', site: 'Carpathian Block', drill: 'Compact lines, no gaps' },
    { id: 'c24', name: 'Kofi Mensah', stars: 2, style: 11, area: 'def', site: 'Gold Coast Wall', drill: 'Back five marking' },
    { id: 'c25', name: 'Rui Almeida', stars: 2, style: 12, area: 'def', site: 'Fortress Quinta', drill: 'Blocking crosses' },
    { id: 'c26', name: 'Tariq Aziz', stars: 2, style: 17, area: 'att', site: 'Dune Winger Strip', drill: 'Overlap and cut-back' },
    { id: 'c27', name: 'Sven Lund', stars: 1, style: 10, area: 'mid', site: 'Pond Pitch', drill: 'Short passing' },
    { id: 'c28', name: 'Harry Boone', stars: 1, style: 16, area: 'att', site: 'Muddy Common', drill: 'Hit the target man' },
    { id: 'c29', name: 'Ali Reza', stars: 1, style: 19, area: 'gk', site: 'Backyard Cage', drill: 'Reflex saves' },
    { id: 'c30', name: 'Pedro Gil', stars: 1, style: 18, area: 'mid', site: 'Corner Lot', drill: 'Dribbling in tight spaces' },
  ];
  const D = () => RUT.State.data;
  const dayKey = () => new Date().toISOString().slice(0, 10);
  function S() {
    const d = D(); if (!d) return null;
    if (!d.staff) d.staff = { coaches: [], pts: { att: 0, mid: 0, def: 0, gk: 0 }, head: null, manage: false, log: [] };
    return d.staff;
  }
  const poolOf = id => POOL.find(c => c.id === id);
  const bestStars = () => Math.max(0, ...S().coaches.map(c => poolOf(c.id).stars));
  const perDay = c => PERDAY[poolOf(c.id).stars];
  function rollDay(c) { const k = dayKey(); if (c.day !== k) { c.day = k; c.used = 0; } }
  const gainOf = (c, area) => { const p = poolOf(c.id); return (1.2 + 0.45 * p.stars) * (p.area === area ? 1 : 0.5); };
  function note(msg) { const s = S(); s.log.unshift({ t: Date.now(), msg }); s.log.length = Math.min(s.log.length, 30); }
  /** Fractions of better AI per area for the match engine (null when nothing is trained yet). */
  function boost() {
    const s = S(); if (!s || !s.coaches.length) return null;
    const cap = CAP[bestStars()], o = {}; let any = false;
    Object.keys(AREAS).forEach(k => { o[k] = Math.round(cap * Math.min(1, s.pts[k] / FULL) * 10000) / 10000; if (o[k] > 0) any = true; });
    return any ? o : null;
  }
  const capNow = () => CAP[bestStars()];
  function hire(id) {
    const s = S(), p = poolOf(id);
    if (!p || s.coaches.some(c => c.id === id)) return 'Already hired.';
    if (s.coaches.length >= MAXC) return 'You can only have ' + MAXC + ' coaches. Release one first.';
    if (D().coins < COST[p.stars]) return 'Not enough coins.';
    RUT.State.addCoins(-COST[p.stars], 'Hired coach ' + p.name);
    s.coaches.push({ id, day: dayKey(), used: 0, act: null, auto: false });
    if (!s.head) s.head = id;
    RUT.State.save(); return '';
  }
  function fire(id) { const s = S(); s.coaches = s.coaches.filter(c => c.id !== id); if (s.head === id) s.head = s.coaches[0] ? s.coaches[0].id : null; RUT.State.save(); }
  function start(id, area, at) {
    const s = S(), c = s.coaches.find(x => x.id === id); if (!c || !AREAS[area]) return 'No such coach.';
    rollDay(c);
    if (c.act) return 'A session is already running.';
    if (c.used >= perDay(c)) return 'No sessions left today (' + perDay(c) + ' a day).';
    if (D().coins < feeOf(id)) return 'Not enough coins: a session costs ' + feeOf(id).toLocaleString() + '.';
    RUT.State.addCoins(-feeOf(id), 'Training fee: ' + poolOf(id).name);
    const t0 = at || Date.now(); c.act = { area, start: t0, end: t0 + SESSION_MS }; c.last = area;
    RUT.State.save(); return '';
  }
  /** Finish every session whose 5 minutes are over (also the ones that ended while the game was closed); auto coaches start the next one. Returns the number finished. */
  function tick() {
    const s = S(); if (!s) return 0; let n = 0, now = Date.now();
    s.coaches.forEach(c => {
      rollDay(c);
      let guard = 20;
      while (c.act && c.act.end <= now && guard-- > 0) {
        const a = c.act, g = gainOf(c, a.area);
        const b0 = s.pts[a.area], pc0 = capNow() * Math.min(1, b0 / FULL);
        s.pts[a.area] = Math.min(100, s.pts[a.area] + g); c.used++; c.act = null; n++;
        const pc1 = capNow() * Math.min(1, s.pts[a.area] / FULL); a.ba = [b0, s.pts[a.area], pc0, pc1];
        if (c.auto && c.used < perDay(c)) {
          if (D().coins >= feeOf(c.id)) { RUT.State.addCoins(-feeOf(c.id), 'Training fee: ' + poolOf(c.id).name); c.act = { area: c.last || poolOf(c.id).area, start: a.end, end: a.end + SESSION_MS }; }
          else { c.auto = false; note(poolOf(c.id).name + ': out of coins, "run all day" switched off'); }
        }
        if (guard === 19 || !c.act) note(poolOf(c.id).name + ': ' + AREAS[a.area].toLowerCase() + ' session done. Before ' + a.ba[0].toFixed(1) + ' pts (AI +' + (a.ba[2] * 100).toFixed(1) + '%), after ' + a.ba[1].toFixed(1) + ' pts (AI +' + (a.ba[3] * 100).toFixed(1) + '%)');
      }
    });
    if (n) { if (s.manage && s.head && Staff.onManage) Staff.onManage(s.head); RUT.State.save(); }
    return n;
  }
  function applyStyle(idx) {
    const st = STYLES[idx]; if (!st) return false;
    if (RUT.State.FORMS[st.form] && RUT.State.formationKey() !== st.form) RUT.State.setFormation(st.form);
    D().tactics = { a: st.a, m: st.m, d: st.d, trait: st.t }; RUT.State.save(); return true;
  }
  const Staff = { STYLES, POOL, COST, PERDAY, CAP, FEE, feeOf, AREAS, MAXC, FULL, SESSION_MS, S, poolOf, perDay, gainOf, boost, hire, fire, start, tick, applyStyle, bestStars, note, onManage: null };
  RUT.Staff = Staff;
})();
