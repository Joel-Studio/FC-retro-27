/* v345 (JODIO): FC 27 batch 2 data: Moments (scripted match challenges), Squad Battles (weekly rank vs AI squads) and the penalty shootout rules.
   Saved in State.data.mom = { done:{id:true} }, State.data.sb = { wk, pts, played, claimed:{} }, State.data.pen = { day, plays, best }. */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const S = () => RUT.State.data;
  const dayKey = t => { const d = new Date(t == null ? Date.now() : t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const weekKey = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d.getTime()); };   // Monday of this week
  const hd = res => { try { return (window.App && window.App.match && window.App.match.hdrGoals && window.App.match.hdrGoals[0]) || 0; } catch (e) { return 0; } };

  /** Moments: a short match (60 s halves) against an AI squad with one thing to achieve. */
  const MOMENTS = [
    { id: 'm1', name: 'Win it', desc: 'Beat a 78-88 rated squad.', lo: 78, hi: 88, stars: 1, coins: 6000, ok: r => r.score[0] > r.score[1] },
    { id: 'm2', name: 'Clean sheet', desc: 'Win without conceding.', lo: 78, hi: 88, stars: 1, coins: 7000, ok: r => r.score[0] > r.score[1] && r.score[1] === 0 },
    { id: 'm3', name: 'Goal rush', desc: 'Score 3 or more goals.', lo: 76, hi: 86, stars: 1, coins: 7000, ok: r => r.score[0] >= 3 },
    { id: 'm4', name: 'Two goal cushion', desc: 'Win by 2 goals or more.', lo: 80, hi: 90, stars: 2, coins: 10000, ok: r => r.score[0] - r.score[1] >= 2 },
    { id: 'm5', name: 'Head it in', desc: 'Win and score at least one header.', lo: 78, hi: 88, stars: 2, coins: 11000, ok: r => r.score[0] > r.score[1] && hd(r) >= 1 },
    { id: 'm6', name: 'Counter attack', desc: 'Win with less than 45% possession.', lo: 80, hi: 90, stars: 2, coins: 12000, ok: r => r.score[0] > r.score[1] && r.stats.possession[0] < 45 },
    { id: 'm7', name: 'Efficient', desc: 'Win scoring 2+ goals from 5 shots or fewer.', lo: 80, hi: 90, stars: 2, coins: 12000, ok: r => r.score[0] >= 2 && r.score[0] > r.score[1] && r.stats.shots[0] <= 5 },
    { id: 'm8', name: 'Giant killers', desc: 'Do not lose against a 90+ rated squad.', lo: 90, hi: 96, stars: 3, coins: 20000, ok: r => r.score[0] >= r.score[1] },
    { id: 'm9', name: 'Dominate', desc: 'Win a 90+ squad match with a clean sheet.', lo: 90, hi: 96, stars: 3, coins: 30000, ok: r => r.score[0] > r.score[1] && r.score[1] === 0 },
    { id: 'm10', name: 'Header hat-trick', desc: 'Score 3 headers and win.', lo: 82, hi: 92, stars: 3, coins: 30000, ok: r => r.score[0] > r.score[1] && hd(r) >= 3 },
  ];
  const Moments = {
    list: MOMENTS,
    get(id) { return MOMENTS.find(m => m.id === id); },
    done(id) { const m = S().mom; return !!(m && m.done && m.done[id]); },
    stars() { return MOMENTS.filter(m => this.done(m.id)).reduce((a, m) => a + m.stars, 0); },
    total() { return MOMENTS.reduce((a, m) => a + m.stars, 0); },
    /** After the match: returns { ok, first, coins }. The first success pays; later ones do not. */
    finish(id, res) { const m = this.get(id); if (!m) return null; const ok = !!m.ok(res), d = S(); d.mom = d.mom || { done: {} }; const first = ok && !d.mom.done[id]; if (first) { d.mom.done[id] = true; RUT.State.addCoins(m.coins, 'Moment: ' + m.name); } RUT.State.save(); return { ok, first, coins: first ? m.coins : 0 }; },
  };

  /** Squad Battles: four AI squads, rank points per win, weekly reward steps. */
  const TIERS = [
    { id: 'beg', name: 'Beginner', lo: 70, hi: 80, win: 1, draw: 0, coins: 3000 },
    { id: 'ama', name: 'Amateur', lo: 78, hi: 86, win: 2, draw: 1, coins: 6000 },
    { id: 'pro', name: 'Professional', lo: 84, hi: 92, win: 3, draw: 1, coins: 10000 },
    { id: 'leg', name: 'Legendary', lo: 90, hi: 96, win: 5, draw: 2, coins: 18000 },
  ];
  const STEPS = [{ pts: 10, coins: 15000 }, { pts: 25, coins: 40000 }, { pts: 50, coins: 90000, pack: 'gold' }, { pts: 90, coins: 180000, pack: 'prime' }];
  const SB = () => { const d = S(), w = weekKey(); if (!d.sb || d.sb.wk !== w) d.sb = { wk: w, pts: 0, played: 0, claimed: {} }; return d.sb; };
  const Battles = {
    TIERS, STEPS, state: SB,
    result(tier, res) { const s = SB(), win = res.score[0] > res.score[1], draw = res.score[0] === res.score[1], p = win ? tier.win : draw ? tier.draw : 0; s.pts += p; s.played++; RUT.State.save(); return { pts: p, win }; },
    claimable() { const s = SB(); return STEPS.map((st, i) => ({ i, st, ok: s.pts >= st.pts, got: !!s.claimed[i] })); },
    claim(i) { const s = SB(), st = STEPS[i]; if (!st || s.pts < st.pts || s.claimed[i]) return null; s.claimed[i] = true; RUT.State.addCoins(st.coins, 'Squad Battles reward'); if (st.pack) { const po = S().packsOwned; po[st.pack] = (po[st.pack] || 0) + 1; } RUT.State.save(); return st; },
  };

  /** Penalty shootout. Aim 0 left, 1 centre, 2 right; power 0-100 (the best zone is 55-88). Pure rules, the page drives it. */
  const PEN_PAY = { goal: 1500, win: 6000, perfect: 8000 }, PEN_DAILY = 3;
  const Pen = {
    PAY: PEN_PAY, DAILY: PEN_DAILY,
    state() { const d = S(), k = dayKey(); if (!d.pen || d.pen.day !== k) d.pen = { day: k, plays: 0, best: (d.pen && d.pen.best) || 0 }; return d.pen; },
    left() { return Math.max(0, PEN_DAILY - this.state().plays); },
    /** My kick: returns 'goal' | 'saved' | 'miss'. rnd is a 0-1 number. */
    kick(aim, power, keeperSide, rnd) {
      if (power > 96) return 'miss';
      if (power < 25) return 'saved';
      if (keeperSide !== aim) return rnd < 0.97 ? 'goal' : 'saved';
      const stopP = power > 88 ? 0.35 : power >= 55 ? 0.6 : 0.85;   // a keeper who guesses the side still has to reach a hard, placed shot
      return rnd < stopP ? 'saved' : 'goal';
    },
    /** The AI kick against me: my dive side decides. */
    defend(dive, shotSide, rnd) { if (dive !== shotSide) return rnd < 0.93 ? 'goal' : 'saved'; return rnd < 0.7 ? 'saved' : 'goal'; },
    finish(goals, won) { const s = this.state(), first = s.plays < PEN_DAILY; s.plays++; s.best = Math.max(s.best || 0, goals); let c = 0; if (first) c = goals * PEN_PAY.goal + (won ? PEN_PAY.win : 0) + (goals >= 5 ? PEN_PAY.perfect : 0); if (c) RUT.State.addCoins(c, 'Penalty shootout'); RUT.State.save(); return c; },
  };
  RUT.Moments = Moments; RUT.Battles = Battles; RUT.Pen = Pen;
})();
