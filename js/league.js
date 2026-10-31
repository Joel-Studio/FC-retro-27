/* =============================================================================
 * league.js  —  League mode (the FC 27 Division Rivals of this game)
 * -----------------------------------------------------------------------------
 * Leagues C (60-70 OVR), B (70-80) and A (80-90), each split into sub-leagues 3, 2, 1
 * (C3 → C2 → C1 → B3 → … → A1). You play every other club once, Premier League style:
 * C has 5 opponents, B has 10, A has 20. The other clubs also play each other (simulated
 * from their ratings) so the table is a full one.
 * Points: win +3, draw +1, loss -3, plus 1 point per goal of goal difference.
 * Finish in the top 2 to move up a sub-league.
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';
  const TIERS = {
    C: { name: 'League C', lo: 60, hi: 70, opps: 5, win: 1000, goal: 750 },
    B: { name: 'League B', lo: 70, hi: 80, opps: 10, win: 3000, goal: 2000 },
    A: { name: 'League A', lo: 80, hi: 90, opps: 20, win: 10000, goal: 7000 },
  };
  const ORDER = ['C3', 'C2', 'C1', 'B3', 'B2', 'B1', 'A3', 'A2', 'A1'];
  const CITIES = ['Ashford', 'Bramley', 'Carrow', 'Dunmore', 'Eastvale', 'Fenwick', 'Garston', 'Hollin', 'Ironbridge', 'Kestrel', 'Lowmoor', 'Marsden', 'Northgate', 'Oakham', 'Pennard', 'Quarry', 'Redcliffe', 'Stanmore', 'Thornby', 'Upton', 'Valeport', 'Westham', 'Yarrow', 'Zennor', 'Alderley', 'Brightwell', 'Calder', 'Draycott', 'Elmstead', 'Farleigh', 'Glenrow', 'Harbury', 'Inverholm', 'Jesmond', 'Kingsley', 'Lakeside', 'Mortlake', 'Newhaven', 'Overton', 'Penrose'];
  const SUFFIX = ['United', 'Rovers', 'Athletic', 'Wanderers', 'Town', 'City', 'Albion', 'Rangers', 'Dynamos', 'Olympic'];
  const PATTERNS = [[2, 2, 2], [3, 2, 1], [2, 3, 1], [1, 2, 3], [2, 1, 3], [1, 3, 2], [3, 1, 2], [2, 2, 1], [1, 2, 2]];

  const D = () => RUT.State.data;
  const range = code => { const t = TIERS[code[0]], w = (t.hi - t.lo) / 3, lo = t.lo + w * (3 - +code[1]); return { lo, hi: lo + w }; };

  function poisson(rng, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 12); return k - 1; }

  /** A new season in a sub-league: the opponents (each with their own players, rating and tactic) and every AI vs AI result. */
  function generate(code) {
    const t = TIERS[code[0]], R = range(code), seed = (Math.random() * 1e9) | 0, rng = RUT.DB.rng(seed);
    const ks = Object.keys(RUT.Engine.TACTIC_TRAITS), names = new Set(), teams = [];
    for (let i = 0; i < t.opps; i++) {
      let nm; do { nm = CITIES[Math.floor(rng() * CITIES.length)] + ' ' + SUFFIX[Math.floor(rng() * SUFFIX.length)]; } while (names.has(nm)); names.add(nm);
      const ovr = Math.round((R.lo + (R.hi - R.lo) * (t.opps === 1 ? 0.5 : (i + 0.5) / t.opps) + (rng() - 0.5) * 1.2) * 10) / 10;
      const pt = PATTERNS[Math.floor(rng() * PATTERNS.length)];
      teams.push({ name: nm, short: nm.split(' ')[0].slice(0, 3).toUpperCase(), seed: (rng() * 1e9) | 0, ovr, tac: pt.join('-') + '|' + ks[Math.floor(rng() * ks.length)] });
    }
    const ai = {};
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
      const d = teams[i].ovr - teams[j].ovr;
      ai[i + '-' + j] = [poisson(rng, 1.35 * Math.exp(0.07 * d)), poisson(rng, 1.35 * Math.exp(-0.07 * d))];
    }
    return { code, seed, teams, ai, me: {}, done: false };
  }

  function cur() {
    const d = D(); if (!d.league) d.league = { code: 'C3', season: 1, titles: 0, cur: null };
    if (!d.league.cur) d.league.cur = generate(d.league.code);
    return d.league.cur;
  }

  /** The game draws your next opponent at random from the clubs you have not played yet (kept until the match is finished). */
  function next() {
    const L = cur(); if (L.done) return -1;
    if (L.next == null || L.me[L.next]) {
      const left = L.teams.map((t, i) => i).filter(i => !L.me[i]);
      L.next = left[Math.floor(Math.random() * left.length)]; RUT.State.save();
    }
    return L.next;
  }

  /** Table rows (you included), best first. Points = 3 / 1 / -3 for W / D / L plus 1 per goal of goal difference. */
  function table() {
    const L = cur(), rows = [{ me: true, name: RUT.State.data.clubName, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }].concat(L.teams.map((t, i) => ({ i, name: t.name, ovr: t.ovr, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 })));
    const add = (r, gf, ga) => { r.p++; r.gf += gf; r.ga += ga; if (gf > ga) r.w++; else if (gf < ga) r.l++; else r.d++; };
    Object.keys(L.ai).forEach(k => { const [i, j] = k.split('-').map(Number), [a, b] = L.ai[k]; add(rows[i + 1], a, b); add(rows[j + 1], b, a); });
    Object.keys(L.me).forEach(i => { const [a, b] = L.me[i]; add(rows[0], a, b); add(rows[+i + 1], b, a); });
    rows.forEach(r => { r.gd = r.gf - r.ga; r.pts = r.w * 3 + r.d - r.l * 3 + r.gd; });
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (b.me ? 1 : 0) - (a.me ? 1 : 0));
    rows.forEach((r, k) => { r.rank = k + 1; });
    return rows;
  }

  /** Record one of your results; returns { finished, rank, up } when it was the last game of the season. */
  function record(idx, gf, ga) {
    const L = cur(); if (L.me[idx]) return null;
    L.me[idx] = [gf, ga];
    if (Object.keys(L.me).length < L.teams.length) { RUT.State.save(); return { finished: false }; }
    L.done = true; const rank = table().find(r => r.me).rank; L.rank = rank; if (D().league.code === 'A1') D().league.a1done = true;   // finishing a League A1 season unlocks the Top 5 Leagues
    RUT.State.save();
    return { finished: true, rank, up: rank <= 2 };
  }

  /** After a finished season: top 2 move up (coins as a reward), everyone else replays the sub-league with new opponents. */
  function advance() {
    const d = D(), g = d.league, L = g.cur; if (!L || !L.done) return null;
    const i = ORDER.indexOf(g.code), up = L.rank <= 2; let msg;
    if (up) {
      const reward = Math.round(3000 * (i + 1) * 1.3 * RUT.State.weekendK());
      RUT.State.addCoins(reward, 'League ' + g.code + ' top 2');
      if (i < ORDER.length - 1) { g.code = ORDER[i + 1]; msg = 'PROMOTED to ' + g.code + '! +' + reward.toLocaleString() + ' coins'; }
      else { g.titles = (g.titles || 0) + 1; msg = 'LEAGUE A1 top 2! +' + reward.toLocaleString() + ' coins. Keep defending your place at the top.'; }
    } else msg = 'You finished ' + L.rank + (L.rank === 3 ? 'rd' : 'th') + ' in ' + g.code + '. Top 2 move up: new season, new opponents.';
    g.season++; g.cur = null; RUT.State.save();
    return msg;
  }

  function build(L, i) {
    const t = L.teams[i], top = ['A3', 'A2', 'A1'].includes(L.code), a1 = L.code === 'A1';   // League A3 to A1: every player, keeper included, is 85+
    const o = RUT.Engine.buildOpponent({ name: t.name, lo: a1 ? 87 : top ? 85 : Math.round(t.ovr - 2), hi: a1 ? 99 : top ? Math.max(90, Math.round(t.ovr + 2.5)) : Math.round(t.ovr + 2.5), pool: 'all', floor: top ? 85 : 0, gkLo: a1 ? 89 : 0 }, t.seed);
    o.name = t.name; o.short = t.short; if (a1) o.elite = true; return o;
  }
  function opponent(i) { return build(cur(), i); }

  /** Promotion playoff (v92): pay to skip the table and play one knockout match against a club of the next sub-league up; a win moves you up. */
  const PO_COST = { C: 20000, B: 40000, A: 40000 };
  function playoff() {
    const g = D().league, L = g.code[0];
    if (L === 'A') {                                                                  // v96: from League A, 40K and one match against the best League A1 side opens the Top 5 Leagues
      if (g.a1done || g.titles > 0) return null;                                      // already unlocked
      return { next: 'Top 5 Leagues', cost: PO_COST.A, top5: true };
    }
    const target = { C: 'B3', B: 'A3' }[L]; if (!target) return null;                 // beat a club of the next league up (its lowest sub-league) to jump straight into it
    return { next: target, cost: PO_COST[L] };
  }
  /** Pay and draw the opponent: a random club of the next league up (for the Top 5 playoff: the strongest League A1 club). Returns { away, tac, code } or null when you cannot afford it. */
  function startPlayoff() {
    const po = playoff(); if (!po || !RUT.State.canAfford(po.cost)) return null;
    RUT.State.addCoins(-po.cost, 'Promotion playoff to ' + po.next);
    if (po.top5) {
      const L = generate('A1'); let bi = 0; L.teams.forEach((t, i) => { if (t.ovr > L.teams[bi].ovr) bi = i; });
      RUT.State.save();
      return { away: build(L, bi), tac: L.teams[bi].tac, code: 'TOP5' };
    }
    const L = generate(po.next), i = Math.floor(Math.random() * L.teams.length);
    RUT.State.save();
    return { away: build(L, i), tac: L.teams[i].tac, code: po.next };
  }
  /** Won the playoff: move up at once; the current season is dropped and a new one starts in the higher league. */
  function promote(code) {
    const g = D().league, po = playoff(); if (!po || (po.top5 ? code !== 'TOP5' : po.next !== code)) return null;
    if (po.top5) { g.a1done = true; RUT.State.save(); return 'TOP 5 LEAGUES UNLOCKED through the playoff!'; }
    g.code = code; g.season++; g.cur = null; RUT.State.save();
    return 'PROMOTED to ' + code + ' through the playoff!';
  }

  /** Coins for one match: a fixed amount per win and per goal scored, set by the league you are in. */
  function payout(gf, ga) { const t = TIERS[D().league.code[0]]; return (gf > ga ? t.win : 0) + gf * t.goal; }

  RUT.League = { playoff, startPlayoff, promote, next, payout, TIERS, ORDER, range, cur, table, record, advance, opponent };
})();
