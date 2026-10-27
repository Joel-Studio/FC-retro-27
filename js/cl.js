/* UEFA Champions League performance cards (v96).
 * Real results and match ratings from the 2026/27 league phase. A player rated 8.0+ in a Champions League game gets a CL promo card (+4%).
 * v137 (JODIO): every normal card also carries a live form: per game +1% if the player was rated 8.0+ or his club won, -1% if his club lost, nothing for a draw (summed, capped at +/-10%).
 * The data lives in js/cl_data.js (window.RUT_CL_DATA, one object per matchday: r = ratings by player name as in the game's database, res = club result W/D/L, m = finished games). Updated by the auto-update routine (retro-ut-tools/CL_AUTOUPDATE.md). */
(function () {
  'use strict';
  const DAYS = window.RUT_CL_DATA || [];
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\bjunior\b/g, 'jr.').replace(/[^a-z. -]/g, '').trim();
  RUT.CL_FORM = true;   // v137 (JODIO, 2026-10-20): the live form is back with a new rule: +1% per game for a player rated 8.0+ or whose club won, -1% when his club lost (and he was under 8.0), nothing for a draw
  const CAP = 10;
  const by = {};      // normalised name -> {pct (unused), games:[{md, r}]}: the real match ratings (the CL promo cards use their average)
  DAYS.forEach(d => Object.keys(d.r).forEach(n => { const k = norm(n), e = by[k] || (by[k] = { pct: 0, games: [] }); e.games.push({ md: d.md, r: d.r[n] }); }));
  const cache = {};
  function info(card) { return card && by[norm(card.name)] || null; }
  /** v137 form of a card: one step per matchday where his club played (cl_data.js `res`) or he was rated; summed, capped at +/-10%. Returns { pct, games:[{md, r, res, step}] } or null. */
  function formOf(card) {
    if (!card) return null;
    const k = norm(card.name), games = []; let pct = 0;
    DAYS.slice(-1).forEach(d => {   // v141 (JODIO): only the latest matchday counts, a club that did not play it gets no boost
      const rr = d.r && Object.keys(d.r).length ? (d.r[card.name] != null ? d.r[card.name] : (d._n || (d._n = Object.keys(d.r).reduce((o, n) => (o[norm(n)] = d.r[n], o), {})))[k]) : null;
      const res = d.res && d.res[card.club] || null;
      if (rr == null && !res) return;
      const st = rr != null && rr >= 8 ? 1 : res === 'W' ? 1 : res === 'L' ? -1 : 0;
      pct += st; games.push({ md: d.md, r: rr, res, step: st });
    });
    pct = Math.max(-CAP, Math.min(CAP, pct));
    return games.length ? { pct, games } : null;
  }
  /** The card with its Champions League form applied (a new object), or the card itself if the form is 0. */
  function apply(c) {
    if (!RUT.CL_FORM) return c;               // v107: no live +2% / -2% form on normal cards (kept only as an off switch: set RUT.CL_FORM = true to bring it back)
    if (c.promo !== 'clpromo') return c;      // v140 (JODIO): the live win / loss / 8.0 form applies to Champions League cards only; normal cards keep their plain rating
    const e = formOf(c); if (!e || !e.pct) return c;
    const key = c.id + '|' + c.rating + '|' + (c.evoLevel || 0) + '|' + JSON.stringify(c.sub).length + '|' + e.pct;
    if (cache[key]) return cache[key];
    const k = 1 + e.pct / 100, up = v => Math.max(1, Math.min(95, Math.round(v * k))), face = {}, sub = {};
    Object.keys(c.face).forEach(x => { face[x] = up(c.face[x]); }); Object.keys(c.sub).forEach(x => { sub[x] = up(c.sub[x]); });
    const out = Object.assign({}, c, { rating: Math.min(93, up(c.rating)), face, sub, cl: { pct: e.pct, games: e.games, base: c.rating } });   // v209 (JODIO): good form keeps a CL card at most at 93, bad form takes it down
    if (RUT.DB && RUT.DB.psGate) out.playStyles = RUT.DB.psGate(out.rating, sub, c.playStyles, c.playStyles, c.promo === 'nlpofm' ? 3 : 2);
    return (cache[key] = out);
  }
  /** Players with at least one 8.0+ game in the Champions League get a CL promo card (+4%), from the headline players of the database. */
  const promoBase = [];
  const PERF = ['Yan Diomandé'];   // v121 (JODIO): his CL card follows his real CL ratings (4% + 3% per rating point above 6.8, like the v110 batch) instead of the flat +4%
  if (RUT.DB) RUT.DB.players.forEach(c => { if (c.promo || c.rating < 74) return; const e = by[norm(c.name)]; if (e && e.games.some(g => g.r >= 8)) {
    promoBase.push(c.id);
    if (PERF.includes(c.name)) { const avg = e.games.reduce((a, g) => a + g.r, 0) / e.games.length, pct = Math.round((4 + Math.max(-1.5, Math.min(4, (avg - 6.8) * 3))) * 10) / 10; RUT.DB.clBoost[c.id] = pct; const card = RUT.DB.registerPromo(c.id, 'clpromo', 4); if (card) card.clInfo = { pct, avg: Math.round(avg * 100) / 100, games: e.games.length }; }
    else RUT.DB.registerPromo(c.id, 'clpromo', 4); } });
  const formBase = promoBase.slice();   // the 8.0+ performers (the Champions League SBCs use this group)
  /* v110: 100 more CL promo cards for the best players of the top 20 teams of the league phase table (after matchday 2, 2026/27); club names as in the game's database */
  const TOP20 = ['PSG', 'Barcelona', 'Aston Villa', 'Stuttgart', 'Liverpool', 'Sporting', 'Arsenal', 'Real Madrid', 'Real Betis', 'Bayern', 'Shakhtar', 'Como', 'Man Utd', 'Villarreal', 'Atlético Madrid', 'Club Brugge', 'Man City', 'Dortmund', 'Lens', 'AEK'];
  const standing = [];
  if (RUT.DB) RUT.DB.players.filter(c => !c.promo && c.rating >= 74 && TOP20.includes(c.club) && promoBase.indexOf(c.id) < 0)
    .sort((a, b) => b.rating - a.rating || (a.name < b.name ? -1 : 1)).slice(0, 100).forEach(c => {
      standing.push(c.id); promoBase.push(c.id);
      // v110 performance buff: average CL match rating from matchday 1 to now; 6.8 = the standard +4%, each rating point is worth 3%, from +2.5% (a poor run) to +8% (an 8.1+ average); no games recorded = +4%
      const e = info(c), avg = e && e.games.length ? e.games.reduce((a, g) => a + g.r, 0) / e.games.length : null;
      const pct = avg == null ? 4 : Math.round((4 + Math.max(-1.5, Math.min(4, (avg - 6.8) * 3))) * 10) / 10;
      RUT.DB.clBoost[c.id] = pct;
      const card = RUT.DB.registerPromo(c.id, 'clpromo', 4); if (card) card.clInfo = { pct, avg: avg == null ? null : Math.round(avg * 100) / 100, games: e ? e.games.length : 0 };
    });
  /* v121: 60 more CL promo cards (JODIO, 2026-10-19): the best remaining players, rating 72+, of the other league-phase clubs plus the leftovers of the top 20; same performance buff as the v110 batch */
  const MORE = TOP20.concat(['Chelsea', 'Tottenham', 'Newcastle', 'Inter', 'AC Milan', 'Juventus', 'Napoli', 'Atalanta', 'Leverkusen', 'RB Leipzig', 'Frankfurt', 'Marseille', 'Monaco', 'Lille', 'PSV', 'Porto', 'Ajax', 'Feyenoord', 'Braga', 'Bologna', 'Real Sociedad', 'Athletic Club', 'Brighton', 'Roma']);
  const more = [];
  if (RUT.DB) RUT.DB.players.filter(c => !c.promo && c.rating >= 72 && MORE.includes(c.club) && promoBase.indexOf(c.id) < 0)
    .sort((a, b) => b.rating - a.rating || (a.name < b.name ? -1 : 1)).slice(0, 60).forEach(c => {
      more.push(c.id); promoBase.push(c.id);
      const e = info(c), avg = e && e.games.length ? e.games.reduce((a, g) => a + g.r, 0) / e.games.length : null;
      const pct = avg == null ? 4 : Math.round((4 + Math.max(-1.5, Math.min(4, (avg - 6.8) * 3))) * 10) / 10;
      RUT.DB.clBoost[c.id] = pct;
      const card = RUT.DB.registerPromo(c.id, 'clpromo', 4); if (card) card.clInfo = { pct, avg: avg == null ? null : Math.round(avg * 100) / 100, games: e ? e.games.length : 0 };
    });
  /* v132: 50 more CL promo cards (JODIO, 2026-10-20): next best players (rating 70+) of the league-phase clubs not yet covered; skips a name that already has a CL card; same performance buff as the v110 batch */
  const more2 = [];
  if (RUT.DB) { const have = new Set(promoBase.map(i => RUT.DB.byId[i] && RUT.DB.byId[i].name));
    RUT.DB.players.filter(c => !c.promo && c.rating >= 70 && MORE.includes(c.club) && promoBase.indexOf(c.id) < 0 && !have.has(c.name))
      .sort((a, b) => b.rating - a.rating || (a.name < b.name ? -1 : 1)).filter(c => !have.has(c.name) && have.add(c.name)).slice(0, 50).forEach(c => {
        more2.push(c.id); promoBase.push(c.id);
        const e = info(c), avg = e && e.games.length ? e.games.reduce((a, g) => a + g.r, 0) / e.games.length : null;
        const pct = avg == null ? 4 : Math.round((4 + Math.max(-1.5, Math.min(4, (avg - 6.8) * 3))) * 10) / 10;
        RUT.DB.clBoost[c.id] = pct;
        const card = RUT.DB.registerPromo(c.id, 'clpromo', 4); if (card) card.clInfo = { pct, avg: avg == null ? null : Math.round(avg * 100) / 100, games: e ? e.games.length : 0 };
      }); }
  /* v146: more Premier League CL promo cards (JODIO, 2026-10-22): every remaining player, rating 70+, of the Premier League clubs in the league phase that has no CL card yet; same performance buff as the v110 batch */
  const more3 = [];
  if (RUT.DB) { const PLCL = ['Arsenal', 'Liverpool', 'Man City', 'Man Utd', 'Chelsea', 'Tottenham', 'Newcastle', 'Aston Villa'], have = new Set(promoBase.map(i => RUT.DB.byId[i] && RUT.DB.byId[i].name));
    RUT.DB.players.filter(c => !c.promo && c.rating >= 70 && PLCL.includes(c.club) && promoBase.indexOf(c.id) < 0 && !have.has(c.name))
      .sort((a, b) => b.rating - a.rating || (a.name < b.name ? -1 : 1)).filter(c => !have.has(c.name) && have.add(c.name)).forEach(c => {
        more3.push(c.id); promoBase.push(c.id);
        const e = info(c), avg = e && e.games.length ? e.games.reduce((a, g) => a + g.r, 0) / e.games.length : null;
        const pct = avg == null ? 4 : Math.round((4 + Math.max(-1.5, Math.min(4, (avg - 6.8) * 3))) * 10) / 10;
        RUT.DB.clBoost[c.id] = pct;
        const card = RUT.DB.registerPromo(c.id, 'clpromo', 4); if (card) card.clInfo = { pct, avg: avg == null ? null : Math.round(avg * 100) / 100, games: e ? e.games.length : 0 };
      }); }
  const promoId = baseId => baseId + '_clpromo_4';
  RUT.CL = { DAYS, promoBase, formBase, standing, more, more2, more3, TOP20, promoId, info, formOf, apply, norm, form: () => RUT.DB ? RUT.DB.players.filter(c => !c.promo).map(c => ({ name: c.name, form: formOf(c) })).filter(x => x.form) : [] };
})();
