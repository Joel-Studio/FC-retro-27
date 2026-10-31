/* =============================================================================
 * quests.js  —  Quests: goals across the League, Top 5 Leagues, SBCs, packs, the market and evolutions
 * -----------------------------------------------------------------------------
 * Easy quests pay a little, hard ones pay a lot, and every league quest pays more the higher the league.
 * Progress comes from counters the rest of the game feeds through RUT.Quests.event(type, data):
 *   match { mode: 'league'|'top5'|'friendly', code|lg, won, draw, gf, ga }   promo { code }   t5end { lg, rank }
 *   sbc, pack { best }, buy, sell, list, evo
 * The counters start from your old stats the first time the Quests page opens. Daily quests reset at midnight (local time).
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';
  const D = () => RUT.State.data;
  const ORDER = ['C3', 'C2', 'C1', 'B3', 'B2', 'B1', 'A3', 'A2', 'A1'];
  const TIER_M = [1, 1.3, 1.8, 2.6, 3.6, 5, 7.5, 11, 16];          // reward multiplier by league, C3 .. A1
  const T5_M = 24;                                                  // the Top 5 Leagues pay the most
  const DIFF = { easy: { name: 'Easy', color: '#4cff7a' }, medium: { name: 'Medium', color: '#ffd84a' }, hard: { name: 'Hard', color: '#ff8a3a' }, elite: { name: 'Elite', color: '#ff4060' } };
  const BASE = { easy: 1500, medium: 5000, hard: 15000, elite: 40000 };
  const CATS = [['all', 'All'], ['daily', 'Daily'], ['league', 'League'], ['top5', 'Top 5'], ['matches', 'Matches'], ['sbc', 'SBC'], ['packs', 'Packs'], ['market', 'Market'], ['evo', 'Evolutions']];

  const QS = [];
  const add = q => { QS.push(q); return q; };
  const LG_NAME = { EPL: 'Premier League', LAL: 'LaLiga', SEA: 'Serie A', L1: 'Ligue 1', BUN: 'Bundesliga' };

  // ---- league quests: four per sub-league, rewards grow with the league
  ORDER.forEach((code, i) => {
    const m = TIER_M[i], hardPack = i >= 7 ? { premium: 1 } : i >= 6 ? { gold: 1 } : i >= 3 ? { silver: 1 } : null;
    add({ id: 'lg-w1-' + code, cat: 'league', diff: 'easy', title: 'Win a match in League ' + code, goal: 1, m: 'win:' + code, tier: i, coins: Math.round(BASE.easy * m) });
    add({ id: 'lg-w5-' + code, cat: 'league', diff: 'medium', title: 'Win 5 matches in League ' + code, goal: 5, m: 'win:' + code, tier: i, coins: Math.round(BASE.medium * m) });
    add({ id: 'lg-up-' + code, cat: 'league', diff: 'hard', title: code === 'A1' ? 'Finish top 2 in League A1' : 'Get promoted from League ' + code, goal: 1, m: 'promo:' + code, tier: i, coins: Math.round(BASE.hard * m), packs: hardPack });
  });
  add({ id: 'lg-a1-3', cat: 'league', diff: 'elite', title: 'Finish top 2 in League A1 three times', goal: 3, m: 'promo:A1', tier: 8, coins: 400000, packs: { elite: 1 } });

  // ---- Top 5 Leagues quests (one set per league)
  ['EPL', 'LAL', 'SEA', 'L1', 'BUN'].forEach(lg => {
    const n = LG_NAME[lg];
    add({ id: 't5-w1-' + lg, cat: 'top5', diff: 'easy', title: 'Win a match in the ' + n, goal: 1, m: 't5win:' + lg, t5: true, coins: Math.round(BASE.easy * T5_M) });
    add({ id: 't5-w10-' + lg, cat: 'top5', diff: 'medium', title: 'Win 10 matches in the ' + n, goal: 10, m: 't5win:' + lg, t5: true, coins: Math.round(BASE.medium * T5_M) });
    add({ id: 't5-top4-' + lg, cat: 'top5', diff: 'hard', title: 'Finish top 4 in the ' + n, goal: 1, m: 't5top4:' + lg, t5: true, coins: Math.round(BASE.hard * T5_M), packs: { premium: 1 } });
    add({ id: 't5-win-' + lg, cat: 'top5', diff: 'elite', title: 'Win the ' + n + ' title', goal: 1, m: 't5title:' + lg, t5: true, coins: Math.round(BASE.elite * T5_M), packs: { elite: 1 } });
  });
  add({ id: 't5-all', cat: 'top5', diff: 'elite', title: 'Win all five Top 5 league titles', goal: 5, m: 't5titles', t5: true, coins: 3000000, packs: { promo: 2 } });

  // ---- general quests
  const G = (id, cat, diff, title, goal, m, coins, packs) => add({ id, cat, diff, title, goal, m, coins, packs: packs || null });
  G('m-w1', 'matches', 'easy', 'Win a match', 1, 'win', 2000);
  G('m-w50', 'matches', 'medium', 'Win 50 matches', 50, 'win', 50000);
  G('m-w200', 'matches', 'hard', 'Win 200 matches', 200, 'win', 200000, { gold: 1 });
  G('m-g10', 'matches', 'easy', 'Score 10 goals', 10, 'goals', 4000);
  G('m-g1000', 'matches', 'hard', 'Score 1,000 goals', 1000, 'goals', 300000, { premium: 1 });
  G('m-cs1', 'matches', 'easy', 'Keep a clean sheet', 1, 'cs', 3000);
  G('m-b3', 'matches', 'medium', 'Win a match by 3 or more goals', 1, 'big3', 10000);
  G('s-1', 'sbc', 'easy', 'Complete an SBC', 1, 'sbc', 5000);
  G('s-5', 'sbc', 'medium', 'Complete 5 SBCs', 5, 'sbc', 40000, { gold: 1 });
  G('s-15', 'sbc', 'hard', 'Complete 15 SBCs', 15, 'sbc', 150000, { premium: 1 });
  G('p-1', 'packs', 'easy', 'Open a pack', 1, 'pack', 2000);
  G('p-88', 'packs', 'medium', 'Pull an 88+ rated player from a pack', 1, 'pack88', 30000);
  G('p-90', 'packs', 'hard', 'Pull a 90+ rated player from a pack', 1, 'pack90', 120000);
  G('k-buy', 'market', 'easy', 'Buy a player on the Transfer Market', 1, 'buy', 2000);
  G('k-sell10', 'market', 'medium', 'Sell 10 players on the Transfer Market', 10, 'sell', 30000);
  G('e-1', 'evo', 'medium', 'Complete an Evolution', 1, 'evo', 30000);
  G('e-3', 'evo', 'hard', 'Complete 3 Evolutions', 3, 'evo', 120000, { gold: 1 });

  // ---- daily quests (reset at midnight; the pay grows with your league)
  const DQ = (id, diff, title, goal, m) => add({ id, cat: 'daily', diff, title, goal, m, daily: true, coins: Math.round({ easy: 3000, medium: 6000, hard: 15000 }[diff]) });
  DQ('d-w1', 'easy', 'Win a match today', 1, 'win');
  DQ('d-g3', 'easy', 'Score 3 goals today', 3, 'goals');
  DQ('d-w3', 'hard', 'Win 3 matches today', 3, 'win');

  // v84c: pay is cut 70% (on top of v84b), goals are harder, and packs are kept only for Elite quests.
  // Easy: 2x goals, 0.5 pay. Medium: 1.5x goals, 0.7 pay. Hard / Elite: pay unchanged before the 70% cut. Every count goal above 1 is then raised another 1.5x.
  const GOAL_K = { easy: 2, medium: 1.5 }, PAY_K = { easy: 0.5, medium: 0.7 }, CUT = 0.3;
  QS.forEach(q => {
    const k = (GOAL_K[q.diff] || 1) * (q.goal > 1 || GOAL_K[q.diff] ? 1.5 : 1);
    const g0 = q.goal, g1 = Math.ceil(g0 * k);
    if (g1 !== g0 && q.diff !== 'elite') {
      const num = new RegExp('\\b' + g0.toLocaleString('en-US').replace(',', '\\,') + '\\b');
      q.title = g0 > 1 && num.test(q.title) ? q.title.replace(num, g1.toLocaleString('en-US')) : q.title + ' (' + g1 + ' times)';
      q.goal = g1;
    }
    q.coins = Math.round(q.coins * (PAY_K[q.diff] || 1) * CUT);
    if (q.diff !== 'elite') q.packs = null;
  });

  const BY = {}; QS.forEach(q => { BY[q.id] = q; });

  /* ------------------------------ state ------------------------------ */
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function S() {
    const d = D();
    if (!d.quests) {                                                      // first time: the counters start from your old stats
      const st = d.stats || {}, sbc = Object.values(d.sbcDone || {}).reduce((a, b) => a + b, 0);
      d.quests = { c: { win: st.wins || 0, goals: st.goalsFor || 0, match: st.matches || 0, sbc }, claimed: {}, seen: {}, day: today(), dc: {}, dClaimed: {}, dSeen: {} };
    }
    const q = d.quests;
    if (q.day !== today()) { q.day = today(); q.dc = {}; q.dClaimed = {}; q.dSeen = {}; }
    return q;
  }
  const tierIdx = () => { const g = D().league; return g ? Math.max(0, ORDER.indexOf(g.code)) : 0; };
  const top5 = () => !!(RUT.Top5 && RUT.Top5.unlocked());
  const dailyMult = () => (top5() ? T5_M : TIER_M[tierIdx()]) * 0.5;

  function reward(q) {
    const m = q.daily ? dailyMult() : 1;
    return { coins: Math.round(q.coins * m), packs: q.packs || null };
  }
  function progress(q) {
    const s = S();
    if (q.tier != null && q.tier < tierIdx()) return q.goal;                                       // a league you have already climbed out of: counted as done
    return Math.min(q.goal, (q.daily ? s.dc[q.m] : s.c[q.m]) || 0);
  }
  function lockMsg(q) {
    if (q.t5 && !top5()) return 'Finish a League A1 season to unlock the Top 5 Leagues';
    if (q.tier != null && q.tier > tierIdx() && q.id !== 'lg-a1-3') return 'Reach League ' + ORDER[q.tier] + ' first';
    return '';
  }
  const claimedOf = q => (q.daily ? S().dClaimed : S().claimed)[q.id];

  function list() {
    return QS.map(q => { const p = progress(q), r = reward(q), claimed = !!claimedOf(q), lock = lockMsg(q); return Object.assign({}, q, { p, reward: r, claimed, locked: !!lock && p < q.goal, lock, ready: p >= q.goal && !claimed }); });
  }
  const readyCount = () => list().filter(q => q.ready).length;

  function packText(packs) { return packs ? Object.keys(packs).map(k => packs[k] + '× ' + ((RUT.Packs && RUT.Packs.PACKS[k]) ? RUT.Packs.PACKS[k].name : k)).join(', ') : ''; }

  function claim(id) {
    const q = BY[id]; if (!q) return { ok: false, msg: 'Unknown quest' };
    const lq = list().find(x => x.id === id);
    if (!lq.ready) return { ok: false, msg: lq.claimed ? 'Already claimed' : 'Not finished yet' };
    const r = lq.reward, st = D();
    r.coins = Math.round(r.coins * RUT.State.weekendK());   // v311 weekend boost
    RUT.State.addCoins(r.coins, 'Quest: ' + q.title);
    if (r.packs) Object.keys(r.packs).forEach(k => { st.packsOwned[k] = (st.packsOwned[k] || 0) + r.packs[k]; });
    (q.daily ? S().dClaimed : S().claimed)[id] = 1;
    RUT.State.save();
    return { ok: true, msg: '+' + r.coins.toLocaleString() + ' coins' + (r.packs ? ' and ' + packText(r.packs) : ''), reward: r };
  }
  function claimAll() {
    let coins = 0, n = 0; const packs = {};
    list().filter(q => q.ready).forEach(q => { const r = claim(q.id); if (r.ok) { n++; coins += r.reward.coins; if (r.reward.packs) Object.keys(r.reward.packs).forEach(k => { packs[k] = (packs[k] || 0) + r.reward.packs[k]; }); } });
    return { n, coins, packs };
  }

  /* ------------------------------ events ----------------------------- */
  function event(type, d) {
    d = d || {};
    const s = S(), before = {}; QS.forEach(q => { before[q.id] = progress(q) >= q.goal; });
    const inc = (k, n) => { n = n == null ? 1 : n; if (!n) return; s.c[k] = (s.c[k] || 0) + n; s.dc[k] = (s.dc[k] || 0) + n; };
    if (type === 'match') {
      const won = !!d.won, gd = (d.gf || 0) - (d.ga || 0);
      if (d.mode === 'friendly' && d.level === 'amateur') { /* Sunday League friendlies do not count */ } else {
        inc('match'); if (won) inc('win'); inc('goals', d.gf); if (!d.ga) inc('cs');
        if (won && gd >= 3) inc('big3'); if (won && gd >= 5) inc('big5');
      }
      if (d.mode === 'league' && d.code) { if (won) inc('win:' + d.code); inc('goals:' + d.code, d.gf); inc('match:' + d.code); }
      if (d.mode === 'top5' && d.lg) { if (won) inc('t5win:' + d.lg); inc('t5goals:' + d.lg, d.gf); inc('t5match:' + d.lg); if (!d.ga) inc('t5cs:' + d.lg); }
    } else if (type === 'promo') inc('promo:' + d.code);
    else if (type === 't5end') {
      if (d.rank <= 4) inc('t5top4:' + d.lg);
      if (d.rank === 1) { inc('t5title:' + d.lg); s.c.t5titles = Object.keys(LG_NAME).filter(k => (s.c['t5title:' + k] || 0) > 0).length; }
    } else if (type === 'pack') { inc('pack'); if (d.best >= 88) inc('pack88'); if (d.best >= 90) inc('pack90'); }
    else if (['sbc', 'buy', 'sell', 'list', 'evo'].includes(type)) inc(type);
    const done = [];
    QS.forEach(q => { if (!before[q.id] && progress(q) >= q.goal && !lockMsg(q)) done.push(q); });
    if (done.length && api.notify) done.forEach(q => api.notify('Quest complete: ' + q.title + ' (claim it on the Quests page)'));
    RUT.State.save();
    return done.map(q => q.title);
  }

  const api = { QS, CATS, DIFF, ORDER, list, readyCount, claim, claimAll, event, packText, dailyMult, notify: null };
  RUT.Quests = api;
})();
