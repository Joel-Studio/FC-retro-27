/* v344 (JODIO): FC 27 style progression: login streak, club XP and level, achievements with a trophy room.
   Data lives in State.data.prog = { streak, lastDay, xp, claimed:{id:true}, lvPaid, goalsSeq } and is saved with the club. */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const day = (t) => { const d = new Date(t == null ? Date.now() : t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const P = () => { const d = RUT.State.data; return d.prog || (d.prog = { streak: 0, best: 0, lastDay: '', xp: 0, claimed: {}, lvPaid: 1 }); };
  const xpFor = lv => 100 * (lv - 1) * (lv - 1);                 // XP needed to reach a level
  const levelOf = xp => Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
  /** Streak rewards: coins every day, a pack on day 7 (then the streak keeps counting, day 14 and 21 pay a pack too). */
  const dayReward = n => ({ coins: 4000 + 1500 * Math.min(n, 7), pack: n % 7 === 0 ? (n % 21 === 0 ? 'prime' : 'gold') : null });
  const ACH = [
    { id: 'm10', name: 'Rookie', desc: 'Play 10 matches', goal: 10, get: s => s.matches, coins: 5000 },
    { id: 'm50', name: 'Regular', desc: 'Play 50 matches', goal: 50, get: s => s.matches, coins: 15000 },
    { id: 'm200', name: 'Veteran', desc: 'Play 200 matches', goal: 200, get: s => s.matches, coins: 50000 },
    { id: 'w10', name: 'Winner', desc: 'Win 10 matches', goal: 10, get: s => s.wins, coins: 8000 },
    { id: 'w50', name: 'Serial winner', desc: 'Win 50 matches', goal: 50, get: s => s.wins, coins: 30000 },
    { id: 'w150', name: 'Dynasty', desc: 'Win 150 matches', goal: 150, get: s => s.wins, coins: 100000 },
    { id: 'g25', name: 'Goal getter', desc: 'Score 25 goals', goal: 25, get: s => s.goalsFor, coins: 8000 },
    { id: 'g100', name: 'Sharpshooter', desc: 'Score 100 goals', goal: 100, get: s => s.goalsFor, coins: 30000 },
    { id: 'g500', name: 'Goal machine', desc: 'Score 500 goals', goal: 500, get: s => s.goalsFor, coins: 120000 },
    { id: 'cs', name: 'Clean sheets', desc: 'Win 5 matches without conceding', goal: 5, get: (s, p) => p.cleanSheets || 0, coins: 12000 },
    { id: 'hat', name: 'Hat-trick hero', desc: 'Score 3 or more in one match', goal: 1, get: (s, p) => p.hatTricks || 0, coins: 10000 },
    { id: 'big', name: 'Thrashing', desc: 'Win a match by 4 goals or more', goal: 1, get: (s, p) => p.bigWins || 0, coins: 10000 },
    { id: 'hd', name: 'Header king', desc: 'Score 10 headers', goal: 10, get: (s, p) => p.headers || 0, coins: 12000 },
    { id: 'lv5', name: 'Level 5', desc: 'Reach club level 5', goal: 5, get: (s, p) => levelOf(p.xp), coins: 10000 },
    { id: 'lv15', name: 'Level 15', desc: 'Reach club level 15', goal: 15, get: (s, p) => levelOf(p.xp), coins: 60000 },
    { id: 'st7', name: 'Week streak', desc: 'Log in 7 days in a row', goal: 7, get: (s, p) => p.best || 0, coins: 20000 },
    { id: 'st30', name: 'Month streak', desc: 'Log in 30 days in a row', goal: 30, get: (s, p) => p.best || 0, coins: 150000 },
  ];
  const Progress = {
    ACH, xpFor, levelOf, dayReward, day,
    info() { const p = P(), lv = levelOf(p.xp), lo = xpFor(lv), hi = xpFor(lv + 1); return { lv, xp: p.xp, lo, hi, pct: Math.round((p.xp - lo) / (hi - lo) * 100), streak: p.streak, best: p.best || 0, claimedToday: p.lastDay === day() }; },
    /** Once a day: advance the streak and pay it. Returns {n, coins, pack} for the pop-up, or null when already claimed today. */
    daily() {
      const p = P(), today = day();
      if (p.lastDay === today) return null;
      const y = day(Date.now() - 864e5);
      p.streak = p.lastDay === y ? p.streak + 1 : 1; p.best = Math.max(p.best || 0, p.streak); p.lastDay = today;
      const r = dayReward(p.streak);
      RUT.State.addCoins(r.coins, 'Login streak day ' + p.streak);
      if (r.pack) { const po = RUT.State.data.packsOwned; po[r.pack] = (po[r.pack] || 0) + 1; }
      RUT.State.save(); return { n: p.streak, coins: r.coins, pack: r.pack };
    },
    /** After every match you play: XP, achievement counters, level-up rewards. res = engine result. */
    onMatch(res) {
      const p = P(), g = res.score[0], c = res.score[1];
      const gain = 40 + 25 * g + (res.won ? 80 : res.draw ? 30 : 10) + (c === 0 ? 20 : 0);
      const lv0 = levelOf(p.xp); p.xp += gain; const lv1 = levelOf(p.xp);
      if (res.won && c === 0) p.cleanSheets = (p.cleanSheets || 0) + 1;
      if (g >= 3) p.hatTricks = (p.hatTricks || 0) + 1;
      if (res.won && g - c >= 4) p.bigWins = (p.bigWins || 0) + 1;
      let pay = 0; for (let l = Math.max(lv0 + 1, p.lvPaid + 1); l <= lv1; l++) { pay += 2000 * l; p.lvPaid = l; }
      if (pay) RUT.State.addCoins(pay, 'Club level ' + lv1);
      RUT.State.save(); return { gain, lv0, lv1, pay };
    },
    onHeader() { const p = P(); p.headers = (p.headers || 0) + 1; },
    list() { const s = RUT.State.data.stats, p = P(); return ACH.map(a => { const v = Math.min(a.goal, a.get(s, p)); return Object.assign({}, a, { v, done: v >= a.goal, claimed: !!p.claimed[a.id] }); }); },
    ready() { return this.list().filter(a => a.done && !a.claimed).length; },
    claim(id) { const a = this.list().find(x => x.id === id), p = P(); if (!a || !a.done || a.claimed) return null; p.claimed[id] = true; RUT.State.addCoins(a.coins, 'Achievement: ' + a.name); RUT.State.save(); return a; },
  };
  RUT.Progress = Progress;
})();
