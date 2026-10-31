/* =============================================================================
 * top5.js  —  Top 5 Leagues (unlocked once you have finished a League A1 season)
 * -----------------------------------------------------------------------------
 * LaLiga, Premier League, Serie A, Ligue 1 and Bundesliga. Each has 20 clubs based on the real
 * ones (real names, kit colours, tactics that fit their style, and the real players the game
 * already has for them). The rest of every squad is made up, so a club's XI is always 80-90 OVR.
 * You are the 21st club: you play each of the 20 clubs twice (40 matches). The other clubs play
 * each other twice too (simulated from their ratings) so the table is complete.
 * Real football points: win 3, draw 1, loss 0 (goal difference breaks ties).
 * Every Top 5 club plays with a 50% smarter brain (see `smart` in engine.js).
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';
  const D = () => RUT.State.data;
  const T5 = { win: 25000, draw: 8000, goal: 10000, smart: 4.8, hot: 2.4, gb: 8, learnEvery: 6 };   // v120: smart 4 (twice as smart as v119: full reading stats, faster decisions, passes that find their man), gb = goal boost   // hot: Top 5 clubs shoot and tackle about twice as well against you (sharper attacking and defending skills, finishing, tackling)

  // [club, strength (XI average, 80-90), kit 1, kit 2, tactic trait, key of the club in the player database if it differs]
  const LGS = {
    LAL: { name: 'LaLiga', nat: ['ESP', 'ESP', 'ESP', 'ESP', 'ESP', 'ARG', 'BRA', 'FRA', 'POR', 'NED'], teams: [
      ['Real Madrid', 89, '#ffffff', '#febe10', 'counter'], ['Barcelona', 89, '#a50044', '#004d98', 'tikitaka'],
      ['Atlético Madrid', 87, '#cb3524', '#ffffff', 'lowblock'], ['Athletic Club', 84, '#ee2523', '#ffffff', 'gegen'],
      ['Real Sociedad', 83, '#0067b1', '#ffffff', 'positional'], ['Villarreal', 83, '#ffe667', '#005187', 'positional'],
      ['Real Betis', 83, '#00954c', '#ffffff', 'tikitaka'], ['Sevilla', 82, '#ffffff', '#d2001f', 'wings'],
      ['Girona', 81, '#d52b1e', '#ffffff', 'positional'], ['Valencia', 81, '#ffffff', '#f58220', 'counter'],
      ['Celta Vigo', 81, '#8ac3ee', '#ffffff', 'wings'], ['Osasuna', 81, '#d91a21', '#0a346f', 'gegen'],
      ['Getafe', 80, '#005999', '#ffffff', 'lowblock'], ['Rayo Vallecano', 80, '#ffffff', '#e53026', 'gegen'],
      ['Mallorca', 80, '#e20613', '#000000', 'lowblock'], ['Alavés', 80, '#0761af', '#ffffff', 'lowblock'],
      ['Espanyol', 80, '#0b6cb6', '#ffffff', 'counter'], ['Levante', 80, '#b4053f', '#004d98', 'counter'],
      ['Elche', 80, '#ffffff', '#00a652', 'longball'], ['Real Oviedo', 80, '#1b3c7d', '#ffffff', 'lowblock'] ] },
    EPL: { name: 'Premier League', nat: ['ENG', 'ENG', 'ENG', 'ENG', 'ENG', 'BRA', 'POR', 'NED', 'FRA', 'ESP'], teams: [
      ['Man City', 88, '#6cabdd', '#ffffff', 'positional'], ['Arsenal', 88, '#ef0107', '#ffffff', 'highline'],
      ['Liverpool', 88, '#c8102e', '#f6eb61', 'gegen'], ['Chelsea', 86, '#034694', '#ffffff', 'wings'],
      ['Newcastle', 85, '#241f20', '#ffffff', 'gegen'], ['Man Utd', 84, '#da291c', '#000000', 'counter'],
      ['Tottenham', 84, '#ffffff', '#132257', 'highline'], ['Aston Villa', 84, '#670e36', '#95bfe5', 'counter'],
      ['Brighton', 83, '#0057b8', '#ffffff', 'tikitaka'], ['Crystal Palace', 82, '#1b458f', '#c4122e', 'counter'],
      ['Nottm Forest', 82, '#dd0000', '#ffffff', 'counter'], ['West Ham', 82, '#7a263a', '#1bb1e7', 'wings'],
      ['Brentford', 82, '#e30613', '#ffffff', 'longball'], ['Bournemouth', 82, '#da291c', '#000000', 'gegen'],
      ['Fulham', 81, '#ffffff', '#000000', 'positional'], ['Everton', 81, '#003399', '#ffffff', 'lowblock'],
      ['Leeds', 81, '#ffffff', '#1d428a', 'gegen'], ['Sunderland', 80, '#eb172b', '#ffffff', 'counter'],
      ['Burnley', 80, '#6c1d45', '#99d6ea', 'lowblock'], ['Wolves', 80, '#fdb913', '#231f20', 'counter'] ] },
    SEA: { name: 'Serie A', nat: ['ITA', 'ITA', 'ITA', 'ITA', 'ITA', 'ARG', 'BRA', 'FRA', 'NED', 'POR'], teams: [
      ['Inter', 88, '#0068a8', '#000000', 'counter'], ['Napoli', 87, '#12a0d7', '#ffffff', 'positional'],
      ['AC Milan', 86, '#fb090b', '#000000', 'wings'], ['Juventus', 85, '#ffffff', '#000000', 'lowblock'],
      ['Atalanta', 84, '#1e71b8', '#000000', 'gegen'], ['Roma', 84, '#8e1f2f', '#f0bc42', 'counter'],
      ['Lazio', 83, '#87d8f7', '#ffffff', 'positional'], ['Fiorentina', 82, '#5a2d82', '#ffffff', 'wings'],
      ['Bologna', 82, '#a21c26', '#1a2f48', 'gegen'], ['Como', 82, '#003da5', '#ffffff', 'tikitaka'],
      ['Torino', 81, '#8b1c1c', '#ffffff', 'lowblock'], ['Udinese', 80, '#ffffff', '#000000', 'longball'],
      ['Genoa', 80, '#a3202f', '#0b2c5f', 'lowblock'], ['Sassuolo', 80, '#00a651', '#000000', 'wings'],
      ['Parma', 80, '#ffffff', '#fdd835', 'positional'], ['Cagliari', 80, '#a50d2b', '#0a2b5c', 'counter'],
      ['Hellas Verona', 80, '#ffd600', '#0a3a86', 'gegen'], ['Lecce', 80, '#ffd700', '#d40000', 'lowblock'],
      ['Pisa', 80, '#0a3a86', '#000000', 'counter'], ['Cremonese', 80, '#b3b3b3', '#c8102e', 'longball'] ] },
    L1: { name: 'Ligue 1', nat: ['FRA', 'FRA', 'FRA', 'FRA', 'FRA', 'POR', 'BRA', 'ESP', 'ARG', 'NED'], teams: [
      ['PSG', 88, '#004170', '#da291c', 'positional'], ['Marseille', 84, '#ffffff', '#2faee0', 'gegen'],
      ['Monaco', 83, '#e7192b', '#ffffff', 'counter'], ['Lyon', 83, '#ffffff', '#da0812', 'wings'],
      ['Lille', 83, '#e01e13', '#20325f', 'highline'], ['Lens', 82, '#e0001b', '#ffd400', 'gegen'],
      ['Nice', 82, '#000000', '#d9262f', 'lowblock'], ['Rennes', 82, '#e13327', '#000000', 'wings'],
      ['Strasbourg', 81, '#0089cf', '#ffffff', 'gegen'], ['Brest', 80, '#e2231a', '#ffffff', 'counter'],
      ['Toulouse', 80, '#6c3d99', '#ffffff', 'counter'], ['Nantes', 80, '#ffd500', '#009a44', 'lowblock'],
      ['Auxerre', 80, '#ffffff', '#0057b8', 'longball'], ['Angers', 80, '#000000', '#ffffff', 'lowblock'],
      ['Le Havre', 80, '#5ea5df', '#0b2f5c', 'lowblock'], ['Lorient', 80, '#f58220', '#000000', 'counter'],
      ['Metz', 80, '#7b0c2d', '#ffffff', 'longball'], ['Paris FC', 80, '#0a3a86', '#ffffff', 'positional'],
      ['Saint-Étienne', 80, '#00a650', '#ffffff', 'gegen'], ['Montpellier', 80, '#f58220', '#0a2b5c', 'counter'] ] },
    BUN: { name: 'Bundesliga', nat: ['GER', 'GER', 'GER', 'GER', 'GER', 'NED', 'FRA', 'POR', 'BRA', 'ESP'], teams: [
      ['Bayern', 89, '#dc052d', '#ffffff', 'highline'], ['Leverkusen', 85, '#e32221', '#000000', 'positional'],
      ['Dortmund', 85, '#fde100', '#000000', 'gegen'], ['RB Leipzig', 84, '#ffffff', '#dd0741', 'gegen'],
      ['Stuttgart', 83, '#ffffff', '#e32219', 'wings'], ['Frankfurt', 83, '#000000', '#e1000f', 'counter'],
      ['Freiburg', 81, '#e2001a', '#ffffff', 'positional'], ['Hoffenheim', 81, '#1961b5', '#ffffff', 'wings'],
      ['Werder Bremen', 81, '#1d9053', '#ffffff', 'counter'], ['Wolfsburg', 81, '#65b32e', '#ffffff', 'counter'],
      ['Gladbach', 81, '#ffffff', '#00a651', 'wings'], ['Mainz', 80, '#c3141e', '#ffffff', 'gegen'],
      ['Union Berlin', 80, '#eb1923', '#fdd835', 'lowblock'], ['Augsburg', 80, '#ba3733', '#ffffff', 'longball'],
      ['Hamburg', 80, '#ffffff', '#00539f', 'wings'], ['St. Pauli', 80, '#5c3317', '#ffffff', 'gegen'],
      ['Köln', 80, '#ffffff', '#ed1c24', 'counter'], ['Heidenheim', 80, '#e2001a', '#003a70', 'longball'],
      ['Schalke 04', 80, '#004d9d', '#ffffff', 'wings'], ['Hertha BSC', 80, '#005ca9', '#ffffff', 'counter'] ] },
  };
  const ORDER = ['EPL', 'LAL', 'SEA', 'L1', 'BUN'];
  const PATTERNS = [[2, 2, 2], [3, 2, 1], [2, 3, 1], [1, 2, 3], [2, 1, 3], [3, 1, 2], [2, 2, 1], [1, 2, 2], [3, 2, 2], [2, 3, 2]];

  // the clubs the player database does not have yet are registered (hidden from the market's club list) so generated players can wear their name and colours
  ORDER.forEach(lg => LGS[lg].teams.forEach(t => {
    if (!RUT.DB.CLUBS[t[0]]) Object.defineProperty(RUT.DB.CLUBS, t[0], { value: [lg, t[2], t[3]], enumerable: false, configurable: true, writable: true });
  }));

  const clamp = RUT.DB.clamp;
  function poisson(rng, lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L && k < 12); return k - 1; }

  function root() {
    const d = D(); if (!d.top5) d.top5 = { lg: null, season: 1, titles: {}, cur: null };
    return d.top5;
  }
  /** Unlocked by finishing a League A1 season (or by the A1 top-2 finishes of older saves). */
  const unlocked = () => { const g = D().league; return !!(g && (g.a1done || g.titles > 0)); };

  /* ------------------------------------------------------------------------------------------
   * The football world (v94). Every one of the 100 clubs has a squad that lasts from season to season. The clubs trade
   * players with each other in a summer window (start of a season) and a winter window (halfway): a club only buys a
   * player who makes its XI better, only if it can pay (budget, in millions of euros), only if the player and his club
   * would agree (stars do not go to a smaller club, a club does not sell its best men to an equal), and the fee follows
   * the player's rating and age. Clubs top their squad back up with young replacements.
   * ---------------------------------------------------------------------------------------- */
  const MAXSQ = 18, FORM = () => RUT.State.BASE_FORMATION;
  const baseBud = ovr => 60 * Math.pow(1.2, ovr - 80);
  const infoCache = {};
  function info(ref) {
    if (ref.indexOf('|') < 0) {
      if (!infoCache[ref]) { const c = RUT.DB.get(ref); infoCache[ref] = c ? { ref, pos: c.position, alt: c.altPositions, ovr: c.rating, age: (c.details && c.details.age) || 27, name: c.name, real: true } : { ref, pos: 'CM', alt: ['CM'], ovr: 60, age: 27, name: '?', real: true }; }
      return infoCache[ref];
    }
    const p = ref.split('|'), seed = +p[4];
    return { ref, pos: p[1], alt: [p[1]], ovr: +p[2], age: 19 + (seed % 12), name: null, real: false };
  }
  const fits = (inf, pos) => inf.pos === pos || inf.alt.indexOf(pos) >= 0;
  function synthRef(pos, ovr, lg, rng) { const nat = LGS[lg].nat; return 'S|' + pos + '|' + ovr + '|' + nat[Math.floor(rng() * nat.length)] + '|' + ((rng() * 1e9) | 0); }
  function refCard(ref, club) {
    if (ref.indexOf('|') < 0) { const c = RUT.DB.get(ref); return !c ? null : c.club === club ? c : Object.assign({}, c, { club }); }
    const p = ref.split('|');
    return RUT.DB.synthCard('w' + p[4], club, p[3], p[1], +p[2], RUT.DB.rng(+p[4]));
  }
  /** The best XI a squad can field in the 4-3-3: a player of the right position for each slot, strongest first. */
  function pickXI(sq) {
    const used = new Set(), xi = [], inf = sq.map(info).sort((a, b) => b.ovr - a.ovr);
    FORM().forEach(pos => { const s = inf.find(i => !used.has(i.ref) && i.pos === pos) || inf.find(i => !used.has(i.ref) && fits(i, pos)); if (s) { used.add(s.ref); xi.push(s.ref); } else xi.push(null); });
    return xi.map(x => x || (inf.find(i => !used.has(i.ref) && (used.add(i.ref) || true)) || { ref: sq[0] }).ref);
  }
  const xiOvr = xi => Math.round(xi.reduce((n, r) => n + info(r).ovr, 0) / Math.max(1, xi.length) * 10) / 10;
  function initClub(lg, r, rng) {
    const name = r[0], ovr = r[1], stars = RUT.DB.players.filter(c => c.club === name && c.rating >= 80 && c.rating <= 90).sort((a, b) => b.rating - a.rating), used = new Set(), sq = [];
    FORM().forEach(pos => {
      const s = stars.find(c => !used.has(c.id) && c.position === pos) || stars.find(c => !used.has(c.id) && c.altPositions.includes(pos));
      if (s) { used.add(s.id); sq.push(s.id); } else sq.push(synthRef(pos, Math.round(clamp(ovr + (rng() - 0.5) * 4, 80, 90)), lg, rng));
    });
    stars.filter(c => !used.has(c.id)).slice(0, 5).forEach(c => sq.push(c.id));
    const bench = ['GK', 'CB', 'LB', 'RB', 'CM', 'CAM', 'LW', 'ST', 'CDM'];
    while (sq.length < 16) sq.push(synthRef(bench[(sq.length - 11) % bench.length], Math.round(clamp(ovr - 3 + (rng() - 0.5) * 4, 76, 88)), lg, rng));
    const c = { lg, bud: Math.round(baseBud(ovr) * (0.7 + 0.6 * rng())), sq }; c.xi = pickXI(sq); c.ovr = xiOvr(c.xi); return c;
  }
  function world() {
    const R = root(); if (R.world && R.world.v === 1) return R.world;
    const rng = RUT.DB.rng((Math.random() * 1e9) | 0), W = R.world = { v: 1, clubs: {}, free: [], news: [] };
    ORDER.forEach(lg => LGS[lg].teams.forEach(r => { W.clubs[r[0]] = initClub(lg, r, rng); }));
    return W;
  }
  const strength = name => { const c = world().clubs[name]; return c ? c.ovr : 80; };
  const value = inf => Math.round(5 * Math.pow(1.19, inf.ovr - 70) * (inf.age <= 22 ? 1.25 : inf.age >= 32 ? 0.55 : inf.age >= 30 ? 0.8 : 1) * 10) / 10;

  /** One transfer window across all 100 clubs. Returns the deals made. */
  function runWindow(kind, rng) {
    const W = world(), R = root(), names = Object.keys(W.clubs), summer = kind === 'Summer', cap = summer ? 2 : 1, deals = [], moved = new Set();
    names.forEach(n => { const c = W.clubs[n]; c.tin = 0; c.tout = 0; if (summer) c.bud = Math.round(Math.min(baseBud(c.ovr) * 3, c.bud * 0.5 + baseBud(c.ovr) * (0.7 + 0.5 * rng()))); });
    const order = names.slice().sort(() => rng() - 0.5);
    for (const bn of order) {
      const B = W.clubs[bn]; if (deals.length >= (summer ? 28 : 10) || B.tin >= cap || rng() > (summer ? 0.5 : 0.3)) continue;
      const bInf = B.xi.map(info); let best = null, bsc = 0;
      const consider = (ref, seller, sInf) => {
        if (moved.has(ref)) return; const inf = info(ref); let slot = -1, gain = 0;
        for (let k = 0; k < 11; k++) if (fits(inf, FORM()[k]) && inf.ovr >= bInf[k].ovr + 2 && inf.ovr - bInf[k].ovr > gain) { gain = inf.ovr - bInf[k].ovr; slot = k; }
        if (slot < 0) return;
        const inXI = seller ? seller.xi.indexOf(ref) >= 0 : false, v = value(inf);
        let fee = seller ? v * (inXI ? 1.25 : 1.05) : v * 0.25;
        if (seller) {
          const rank = sInf.filter(i => i.ovr > inf.ovr).length;
          if (inXI && rank < 3 && B.ovr - seller.ovr < 2) return;                   // a club keeps its three best men unless a clearly bigger club asks
          if (inXI && rank < 3) fee *= 1.4;
          if (seller.ovr > B.ovr + 2 && inf.ovr >= seller.ovr - 2 && fee < v * 2.2) return;   // a star does not step down to a smaller club, benched or not, unless the bid is huge
        }
        fee = Math.round(fee * 10) / 10;
        if (fee > B.bud) return;
        const sc = gain * 10 - 8 * fee / (B.bud + 1) + (inXI ? 0 : 2) + rng() * 5;
        if (sc > bsc) { bsc = sc; best = { ref, seller, fee, gain, inf }; }
      };
      names.forEach(sn => {
        if (sn === bn) return; const S = W.clubs[sn]; if (S.tout >= cap) return;
        const sInf = S.sq.map(info);
        S.sq.forEach(ref => consider(ref, S, sInf));
      });
      W.free.forEach(ref => consider(ref, null, null));
      if (!best) continue;
      const inf = best.inf, S = best.seller, sName = S ? names.find(n => W.clubs[n] === S) : null;
      if (S) { S.sq.splice(S.sq.indexOf(best.ref), 1); S.bud += best.fee; S.tout++; S.sq.push(synthRef(inf.pos, Math.round(clamp(inf.ovr - 1 - rng() * 3, 77, 90)), S.lg, rng)); }
      else W.free.splice(W.free.indexOf(best.ref), 1);
      B.sq.push(best.ref); B.bud -= best.fee; B.tin++; moved.add(best.ref);
      B.xi = pickXI(B.sq); B.ovr = xiOvr(B.xi);
      if (B.sq.length > MAXSQ) {                                                   // squad full: the weakest man outside the XI leaves (a real player becomes a free agent)
        const spare = B.sq.filter(r => B.xi.indexOf(r) < 0).sort((a, b) => info(a).ovr - info(b).ovr)[0];
        if (spare) { B.sq.splice(B.sq.indexOf(spare), 1); if (info(spare).real) { W.free.push(spare); if (W.free.length > 14) W.free.shift(); } }
      }
      if (S) { S.xi = pickXI(S.sq); S.ovr = xiOvr(S.xi); }
      const deal = { s: R.season, w: kind, n: inf.real ? inf.name : refCard(best.ref, bn).name, pos: inf.pos, ovr: inf.ovr, f: sName || 'Free agent', t: bn, fee: best.fee, real: inf.real };
      deals.push(deal);
    }
    W.news = deals.concat(W.news).slice(0, 80);
    return deals;
  }

  /* ----------------------------------- the season ------------------------------------------- */
  /** 21 clubs (20 + you, index 20), double round-robin by the circle method: 42 matchdays, everybody has one bye in each half. */
  function schedule(rng) {
    const arr = []; for (let i = 0; i < 22; i++) arr.push(i);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    let leg = [];
    for (let r = 0; r < 21; r++) {
      const pairs = []; for (let k = 0; k < 11; k++) { const a = arr[k], b = arr[21 - k]; if (a !== 21 && b !== 21) pairs.push(r % 2 ? [a, b] : [b, a]); }
      leg.push(pairs); arr.splice(1, 0, arr.pop());
    }
    const shuf = a => { const o = a.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    const l1 = shuf(leg), l2 = shuf(leg).map(rd => rd.map(p => [p[1], p[0]]));
    return l1.concat(l2);
  }

  /** A fresh 40-match season in a league: the 20 clubs as they are now, their tactics, the 42-matchday calendar. Other clubs' results are played out matchday by matchday. */
  function generate(lg) {
    const def = LGS[lg], seed = (Math.random() * 1e9) | 0, rng = RUT.DB.rng(seed), ks = Object.keys(RUT.Engine.TACTIC_TRAITS), W = world();
    const teams = def.teams.map(r => {
      const pt = PATTERNS[Math.floor(rng() * PATTERNS.length)];
      return { name: r[0], ovr: W.clubs[r[0]].ovr, c1: r[2], c2: r[3], seed: (rng() * 1e9) | 0, tac: pt.join('-') + '|' + (r[4] || ks[Math.floor(rng() * ks.length)]) };
    });
    const ai = {};
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) ai[i + '-' + j] = [null, null];
    const me = {}; teams.forEach((t, i) => { me[i] = [null, null]; });
    return { lg, seed, teams, ai, me, done: false, rounds: schedule(rng), round: 0, live: null };
  }

  function pick(lg) {
    const R = root(); if (!LGS[lg] || !unlocked()) return false;
    if (R.cur && !R.cur.done && played() > 0) return false;                 // a started season is finished first
    const rng = RUT.DB.rng((Math.random() * 1e9) | 0); runWindow('Summer', rng);
    R.lg = lg; R.cur = generate(lg); RUT.State.save(); return true;
  }
  const cur = () => root().cur;
  const total = () => (cur() ? cur().teams.length * 2 : 40);
  function played() { const L = cur(); if (!L) return 0; return Object.keys(L.me).reduce((n, i) => n + L.me[i].filter(Boolean).length, 0); }
  const nameOf = (L, k) => (k === 20 ? D().clubName : L.teams[k].name);

  /** Your next match: [club index, leg, matchday]. Old seasons (no calendar) draw it at random from the ones still open. */
  function next() {
    const L = cur(); if (!L || L.done) return null;
    if (L.rounds) {
      for (let r = L.round; r < L.rounds.length; r++) {
        const pr = L.rounds[r].find(p => p[0] === 20 || p[1] === 20); if (!pr) continue;
        const i = pr[0] === 20 ? pr[1] : pr[0], leg = r < 21 ? 0 : 1; if (!L.me[i][leg]) return [i, leg, r];
      }
      return null;
    }
    const open = []; Object.keys(L.me).forEach(i => L.me[i].forEach((r, leg) => { if (!r) open.push([+i, leg]); }));
    if (!open.length) return null;
    if (!L.next || !open.some(o => o[0] === L.next[0] && o[1] === L.next[1])) { L.next = open[Math.floor(Math.random() * open.length)]; RUT.State.save(); }
    return L.next;
  }

  /** The other 9-10 matches of a matchday, with the minute of every goal (as a fraction of the match), played while you play yours. */
  function buildLive(L, r) {
    const rng = RUT.DB.rng((L.seed + r * 7919) | 0), fx = [];
    L.rounds[r].forEach(p => {
      if (p[0] === 20 || p[1] === 20) return;
      const h = p[0], a = p[1], d = strength(L.teams[h].name) - strength(L.teams[a].name), leg = r < 21 ? 0 : 1;
      const gh = poisson(rng, 1.3 * Math.exp(0.08 * d)), ga = poisson(rng, 1.15 * Math.exp(-0.08 * d)), g = [];
      for (let k = 0; k < gh; k++) g.push([Math.round(rng() * 1000) / 1000, 0]);
      for (let k = 0; k < ga; k++) g.push([Math.round(rng() * 1000) / 1000, 1]);
      g.sort((x, y) => x[0] - y[0]);
      fx.push({ h, a, leg, g });
    });
    return { r, fx };
  }
  function commitLive(L, live) {
    live.fx.forEach(f => {
      const sh = f.g.filter(x => x[1] === 0).length, sa = f.g.length - sh, i = Math.min(f.h, f.a), j = Math.max(f.h, f.a);
      L.ai[i + '-' + j][f.leg] = f.h < f.a ? [sh, sa] : [sa, sh];
    });
    L.round = live.r + 1; L.live = null;
    if (L.round === 21 && !L.winter) { L.winter = 1; runWindow('Winter', RUT.DB.rng((L.seed + 31) | 0)); }
  }
  const resolveRound = (L, r) => commitLive(L, L.live && L.live.r === r ? L.live : buildLive(L, r));
  /** Called as your match kicks off: the matchdays before yours (your byes) are played out, and the live fixtures of yours are drawn (kept if the page reloads). */
  function begin() {
    const L = cur(); if (!L || !L.rounds || L.done) return null;
    const nx = next(); if (!nx) return null;
    while (L.round < nx[2]) resolveRound(L, L.round);
    if (!L.live || L.live.r !== nx[2]) L.live = buildLive(L, nx[2]);
    RUT.State.save();
    return { r: nx[2], fx: L.live.fx.map(f => ({ h: L.teams[f.h].name, a: L.teams[f.a].name, g: f.g })) };
  }
  /** Score of a pair on a matchday, oriented [first, second] as listed in the calendar. */
  function pairScore(L, p, leg) {
    if (p[0] === 20 || p[1] === 20) { const i = p[0] === 20 ? p[1] : p[0], m = L.me[i][leg]; return m ? (p[0] === 20 ? [m[0], m[1]] : [m[1], m[0]]) : null; }
    const i = Math.min(p[0], p[1]), j = Math.max(p[0], p[1]), s = L.ai[i + '-' + j][leg]; return s ? (p[0] < p[1] ? s : [s[1], s[0]]) : null;
  }
  /** The results of the matchday just played (yours included). */
  function lastRound() {
    const L = cur(); if (!L || !L.rounds || L.round < 1) return null;
    const r = L.round - 1;
    return { r, res: L.rounds[r].map(p => ({ h: nameOf(L, p[0]), a: nameOf(L, p[1]), s: pairScore(L, p, r < 21 ? 0 : 1), me: p[0] === 20 || p[1] === 20 })).filter(x => x.s) };
  }
  const news = () => (root().world ? root().world.news : []);

  /** Table rows (you included), best first. Real football points: 3 for a win, 1 for a draw. */
  function table() {
    const L = cur(), live = !!L.rounds, rows = [{ me: true, name: D().clubName, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }].concat(L.teams.map((t, i) => ({ i, name: t.name, ovr: live ? strength(t.name) : t.ovr, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 })));
    const add = (r, gf, ga) => { r.p++; r.gf += gf; r.ga += ga; if (gf > ga) r.w++; else if (gf < ga) r.l++; else r.d++; };
    Object.keys(L.ai).forEach(k => { const [i, j] = k.split('-').map(Number); L.ai[k].forEach(res => { if (res) { add(rows[i + 1], res[0], res[1]); add(rows[j + 1], res[1], res[0]); } }); });
    Object.keys(L.me).forEach(i => L.me[i].forEach(r => { if (r) { add(rows[0], r[0], r[1]); add(rows[+i + 1], r[1], r[0]); } }));
    rows.forEach(r => { r.gd = r.gf - r.ga; r.pts = r.w * 3 + r.d; });
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (b.me ? 1 : 0) - (a.me ? 1 : 0));
    rows.forEach((r, k) => { r.rank = k + 1; });
    return rows;
  }

  /** Record one of your results; returns { finished, rank } when it was the last match of the season. The other matches of that matchday are final with it. */
  function record(i, leg, gf, ga) {
    const L = cur(); if (!L || !L.me[i] || L.me[i][leg]) return null;
    const nx = L.rounds ? next() : null;
    L.me[i][leg] = [gf, ga];
    if (L.rounds && nx && nx[0] === i && nx[1] === leg) { while (L.round <= nx[2]) resolveRound(L, L.round); }
    if (played() < total()) { RUT.State.save(); return { finished: false }; }
    if (L.rounds) while (L.round < L.rounds.length) resolveRound(L, L.round);   // the calendar's last byes
    L.done = true; L.rank = table().find(r => r.me).rank; RUT.State.save();
    return { finished: true, rank: L.rank };
  }
  /** Quitting a Top 5 match is a forfeit: a 3-0 defeat on the table (more if you had already conceded more). */
  function forfeit(i, leg, conceded) { return record(i, leg, 0, Math.max(3, (conceded || 0) + 1)); }

  /** What a final place pays (rank 1 = champions). */
  function seasonReward(rank) {
    if (rank === 1) return { coins: 1200000, packs: { elite: 2 }, label: 'Champions' };
    if (rank === 2) return { coins: 700000, packs: { elite: 1 }, label: 'Runners-up' };
    if (rank <= 4) return { coins: 400000, packs: { premium: 1 }, label: 'Champions League places' };
    if (rank <= 6) return { coins: 200000, packs: { gold: 1 }, label: 'Europa places' };
    if (rank <= 10) return { coins: 100000, packs: {}, label: 'Top half' };
    if (rank <= 17) return { coins: 50000, packs: {}, label: 'Mid-table' };
    return { coins: 20000, packs: {}, label: 'Relegation zone (you stay up)' };
  }

  /** After a finished season: pay the final-place reward, count a title, pick a league again. */
  function advance() {
    const R = root(), L = R.cur; if (!L || !L.done) return null;
    const rw = seasonReward(L.rank), st = D();
    rw.coins = Math.round(rw.coins * 1.3 * RUT.State.weekendK());                                           // v103: +30% on earnings
    RUT.State.addCoins(rw.coins, LGS[L.lg].name + ' finish #' + L.rank);
    Object.keys(rw.packs).forEach(k => { st.packsOwned[k] = (st.packsOwned[k] || 0) + rw.packs[k]; });
    if (L.rank === 1) R.titles[L.lg] = (R.titles[L.lg] || 0) + 1;
    const out = { lg: L.lg, rank: L.rank, reward: rw };
    R.season++; R.cur = null; RUT.State.save();
    return out;
  }

  /** The XI of one club: its current best eleven from its squad (the transfers show), real players from the game where it has them and made-up players for the rest. */
  function opponent(i) {
    const L = cur(), t = L.teams[i], def = LGS[L.lg];
    if (L.rounds) {
      const c = world().clubs[t.name], cards = c.xi.map(ref => refCard(ref, t.name));
      return { name: t.name, short: t.name, cards, kit: [t.c1, t.c2], learn: { prior: root().scout || null, every: T5.learnEvery }, smart: T5.smart, hot: T5.hot, gb: T5.gb };
    }
    const r = RUT.DB.rng(t.seed);
    const stars = RUT.DB.players.filter(c => c.club === t.name && c.rating >= 80 && c.rating <= 90).sort((a, b) => b.rating - a.rating);
    const used = new Set();
    const cards = RUT.State.BASE_FORMATION.map((pos, k) => {
      const s = stars.find(c => !used.has(c.id) && c.position === pos) || stars.find(c => !used.has(c.id) && c.altPositions.includes(pos));
      if (s) { used.add(s.id); return s; }
      const ovr = Math.round(clamp(t.ovr + (r() - 0.5) * 4, 80, 90));
      return RUT.DB.synthCard('t5' + L.lg + k + '_' + i, t.name, def.nat[Math.floor(r() * def.nat.length)], pos, ovr, r);
    });
    return { name: t.name, short: t.name, cards, kit: [t.c1, t.c2], learn: { prior: root().scout || null, every: T5.learnEvery }, smart: T5.smart, hot: T5.hot, gb: T5.gb };
  }
  /** A club's squad for the squad viewer: XI first, then the rest. */
  function squad(name) {
    const c = world().clubs[name]; if (!c) return null;
    const mk = r => { const i = info(r); return { name: i.real ? i.name : 'Young ' + i.pos, pos: i.pos, ovr: i.ovr, age: i.age, real: i.real }; };
    return { name, ovr: c.ovr, bud: c.bud, xi: c.xi.map(mk), bench: c.sq.filter(r => c.xi.indexOf(r) < 0).map(mk).sort((a, b) => b.ovr - a.ovr) };
  }

  /** After a match: the clubs remember how you played (a running average over the season, newest match counting most), so the next opponent already knows. */
  function learnFrom(prof) {
    if (!prof) return;
    const R = root(), o = R.scout || {}, k = o.n ? 0.4 : 1, out = { n: Math.min(8, (o.n || 0) + 1) };
    ['wing', 'long', 'longShot', 'skills', 'line', 'press'].forEach(key => { out[key] = o[key] != null ? o[key] * (1 - k) + prof[key] * k : prof[key]; });
    R.scout = out; RUT.State.save();
  }

  /** Coins for one match: a fixed amount per win, per draw and per goal scored. */
  const payout = (gf, ga) => (gf > ga ? T5.win : gf === ga ? T5.draw : 0) + gf * T5.goal;


  /* ------------------------------------------------------------------------------------------
   * v201 (JODIO): Top 5 Champions League. The 35 strongest clubs of the five leagues plus you, in the new Champions League
   * format: one 36-club league phase (8 matches, 2 opponents from each of 4 pots, 4 home and 4 away), top 8 straight into the
   * round of 16, 9th-24th play a knockout play-off, 25th-36th are out. Then round of 16, quarter-finals, semi-finals, final
   * (single matches, a draw goes to penalties). 300 s halves on the biggest pitch, at most 4 of your matches a day, and the
   * clubs play with a brain 50% smarter than in the Top 5 leagues.
   * ---------------------------------------------------------------------------------------- */
  const UCL = { half: 300, perDay: 4, smart: T5.smart, teamIQ: 1.5, win: 40000, draw: 12000, goal: 14000,
    stage: { po: 84000, r16: 168000, qf: 308000, sf: 532000, f: 840000, win: 1680000 } };   // v298 (JODIO): 40% more than Top 5: goals 1.4x, stage bonuses +40%
  const STAGES = ['po', 'r16', 'qf', 'sf', 'f'], STAGE_NAME = { lp: 'League phase', po: 'Knockout play-off', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final', f: 'Final' };
  const today = () => new Date().toISOString().slice(0, 10);
  function uclClubs() {
    const all = []; ORDER.forEach(lg => LGS[lg].teams.forEach(t => all.push({ name: t[0], lg, c1: t[2], c2: t[3], tac: t[4], ovr: strength(t[0]) })));
    return all.sort((a, b) => b.ovr - a.ovr).slice(0, 35);
  }
  function uclSim(rng, a, b, ko) {
    const d = (a === -1 ? 86 : a.ovr) - (b === -1 ? 86 : b.ovr), g = [poisson(rng, clamp(1.35 + d * 0.1, 0.3, 3.2)), poisson(rng, clamp(1.35 - d * 0.1, 0.3, 3.2))];
    if (ko && g[0] === g[1]) g.push(rng() < 0.5 + d * 0.02 ? 0 : 1);   // penalties: index of the winner
    return g;
  }
  function ucl() { return root().ucl || null; }
  function uclStart() {
    const R = root(), clubs = uclClubs(), rng = RUT.DB.rng((Math.random() * 1e9) | 0);
    const pots = [0, 9, 18, 27].map((s0, k) => clubs.slice(s0, k === 3 ? 35 : s0 + 9).map(c => clubs.indexOf(c)));
    const opp = []; pots.forEach(pt => { const sh = pt.slice().sort(() => rng() - 0.5); opp.push(sh[0], sh[1]); });
    opp.sort(() => rng() - 0.5);
    const tab = clubs.map(() => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }));
    R.ucl = { season: (R.uclSeason || 0) + 1, clubs, opp, home: opp.map((_, k) => k % 2 === 0), md: 0, res: [], tab, me: { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }, stage: 'lp', ko: null, out: false, won: false, day: { d: today(), n: 0 }, earned: 0 };
    R.uclSeason = R.ucl.season; return R.ucl;
  }
  const addRes = (t, gf, ga) => { t.p++; t.gf += gf; t.ga += ga; if (gf > ga) t.w++; else if (gf < ga) t.l++; else t.d++; };
  function uclTable() {
    const U = ucl(); if (!U) return [];
    const rows = U.clubs.map((c, i) => Object.assign({ i, name: c.name, ovr: c.ovr }, U.tab[i])).concat([Object.assign({ me: true, i: -1, name: D().clubName, ovr: 0 }, U.me)]);
    rows.forEach(r => { r.gd = r.gf - r.ga; r.pts = r.w * 3 + r.d; });
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (a.me ? -1 : b.me ? 1 : b.ovr - a.ovr)); rows.forEach((r, k) => { r.rank = k + 1; });
    return rows;
  }
  /** Simulates the other 34 clubs of a league-phase matchday (random pairings, your opponent rests). */
  function uclSimDay(U, rng) {
    const free = U.clubs.map((_, i) => i).filter(i => i !== U.opp[U.md]).sort(() => rng() - 0.5);
    for (let k = 0; k + 1 < free.length; k += 2) { const a = free[k], b = free[k + 1], g = uclSim(rng, U.clubs[a], U.clubs[b]); addRes(U.tab[a], g[0], g[1]); addRes(U.tab[b], g[1], g[0]); }
  }
  /** Builds the knockout bracket once the league phase is over. Ids: index of a club, -1 = you. */
  function uclDraw(U, rng) {
    const t = uclTable(), id = r => (r.me ? -1 : r.i), rank = t.map(id), mine = rank.indexOf(-1) + 1;
    const po = []; for (let k = 0; k < 8; k++) po.push([rank[8 + k], rank[23 - k]]);
    U.ko = { top8: rank.slice(0, 8), rounds: { po }, rank: mine };
    if (mine > 24) { U.out = true; U.stage = 'out'; return; }
    U.stage = mine <= 8 ? 'r16' : 'po';
    if (U.stage === 'r16') uclAdvance(U, rng, 'po');   // you skip the play-off: it is simulated
  }
  const strOf = (U, id) => (id === -1 ? -1 : U.clubs[id]);
  /** Plays every tie of a round that does not involve you, and sets up the next round. */
  function uclAdvance(U, rng, rd, myWin) {
    const ties = U.ko.rounds[rd], win = ties.map(([a, b]) => { if (a === -1 || b === -1) return myWin != null ? (myWin ? -1 : (a === -1 ? b : a)) : -1; const g = uclSim(rng, strOf(U, a), strOf(U, b), true); return g[0] > g[1] || (g[0] === g[1] && g[2] === 0) ? a : b; });
    U.ko.win = U.ko.win || {}; U.ko.win[rd] = win;
    const nx = STAGES[STAGES.indexOf(rd) + 1]; if (!nx) return;
    let pairs = [];
    if (rd === 'po') { const t8 = U.ko.top8.slice(); for (let k = 0; k < 8; k++) pairs.push([t8[k], win[7 - k]]); }
    else for (let k = 0; k < win.length; k += 2) pairs.push([win[k], win[k + 1]]);
    U.ko.rounds[nx] = pairs;
  }
  function uclNext() {
    const U = ucl(); if (!U || U.out || U.won) return null;
    if (U.stage === 'lp') { const i = U.opp[U.md]; return { stage: 'lp', club: U.clubs[i], i, home: U.home[U.md], md: U.md }; }
    const tie = (U.ko.rounds[U.stage] || []).find(p => p[0] === -1 || p[1] === -1); if (!tie) return null;
    const i = tie[0] === -1 ? tie[1] : tie[0]; return { stage: U.stage, club: U.clubs[i], i, home: tie[0] === -1, ko: true };
  }
  function uclCanPlay() { const U = ucl(); if (!U) return false; if (U.day.d !== today()) U.day = { d: today(), n: 0 }; return U.day.n < UCL.perDay; }
  function uclBegin() { const U = ucl(); if (!uclCanPlay()) return false; U.day.n++; RUT.State.save(); return true; }
  function uclOpponent(i) {
    const U = ucl(), c = U.clubs[i], wc = world().clubs[c.name], cards = wc ? wc.xi.map(ref => refCard(ref, c.name)) : opponentFallback(c);
    return { name: c.name, short: c.name, cards: uclElite(cards, c.name), kit: [c.c1, c.c2], learn: { prior: root().scout || null, every: T5.learnEvery }, switchTac: true, smart: UCL.smart, teamIQ: UCL.teamIQ, hot: T5.hot, gb: T5.gb };
  }
  /* v226 (JODIO): Champions League opponents field 88-96 players and can use special cards. Each player takes his best version rated 88-96
     (a promo card when he has one); a player with none is replaced by an 88-96 card for that position, from his own club first. */
  /* v233 (JODIO): a Champions League club fields its REAL current squad (the players whose card is at that club, 2026-27 moves included),
     best XI for the 4-3-3. A player uses his best special card only when he has one; nobody is borrowed from another club. A slot the
     club has no card for keeps the club's own generated player. */
  function uclElite(cards, club) {
    const base = RUT.DB.all.filter(x => !x.promo && x.club === club), used = new Set(), r = RUT.DB.rng(club.length * 104729 + 17);
    const spec = n => RUT.DB.all.filter(x => x.promo && x.name === n && x.rating <= 96 && !x.bdorUntradeable).sort((a, b) => b.rating - a.rating)[0];
    const xi = RUT.State.BASE_FORMATION.map(() => null), F = RUT.State.BASE_FORMATION;
    const pick = (k, ok) => { const c = base.filter(x => !used.has(x.name) && ok(x)).sort((a, b) => b.rating - a.rating)[0]; if (c) { used.add(c.name); xi[k] = c; } };
    F.forEach((pos, k) => pick(k, x => x.position === pos));
    F.forEach((pos, k) => { if (!xi[k]) pick(k, x => x.altPositions.includes(pos)); });
    F.forEach((pos, k) => { if (!xi[k] && pos !== 'GK') pick(k, x => x.position !== 'GK'); });
    return xi.map((c, k) => { if (!c) { const o = cards[k]; return o && !o.promo && !RUT.DB.all.some(x => x.name === o.name && x.club !== club && !x.promo) ? o : opponentFallback({ name: club, ovr: 84 })[k]; }
      const sp = (c.rating >= 87 || r() < 0.3) && spec(c.name); return sp ?   // specials for the stars, and now and then for the others
       (sp.club === club ? sp : Object.assign({}, sp, { club })) : c; });
  }
  function opponentFallback(c) { const r = RUT.DB.rng(c.name.length * 7919); return RUT.State.BASE_FORMATION.map((pos, k) => RUT.DB.synthCard('ucl' + k + c.name, c.name, 'England', pos, Math.round(c.ovr), r)); }
  /** Your result (gf, ga, pens winner for a knockout draw: 0 = you). Returns what happened. */
  function uclRecord(gf, ga, penWin) {
    const U = ucl(), nx = uclNext(); if (!nx) return null;
    const rng = RUT.DB.rng((Math.random() * 1e9) | 0), out = { stage: nx.stage };
    if (nx.stage === 'lp') {
      addRes(U.me, gf, ga); addRes(U.tab[nx.i], ga, gf); U.res.push([gf, ga]); uclSimDay(U, rng); U.md++;
      if (U.md >= 8) { uclDraw(U, rng); out.drawn = true; out.rank = U.ko.rank; out.outNow = U.out; if (!U.out) { out.bonus = U.stage === 'r16' ? UCL.stage.r16 : UCL.stage.po; } }
    } else {
      const won = gf > ga || (gf === ga && penWin === 0); U.res.push([gf, ga, nx.stage]); uclAdvance(U, rng, nx.stage, won);
      if (!won) { U.out = true; out.out = true; }
      else if (nx.stage === 'f') { U.won = true; out.champion = true; out.bonus = UCL.stage.win; const R = root(); R.uclTitles = (R.uclTitles || 0) + 1; }
      else { U.stage = STAGES[STAGES.indexOf(nx.stage) + 1]; out.bonus = UCL.stage[U.stage]; }
    }
    if (out.bonus) { out.bonus = Math.round(out.bonus * RUT.State.weekendK()); RUT.State.data.coins += out.bonus; U.earned += out.bonus; }
    RUT.State.save(); return out;
  }
  const uclPayout = (gf, ga) => (gf > ga ? UCL.win : gf === ga ? UCL.draw : 0) + gf * UCL.goal;
  const uclApi = { UCL, STAGE_NAME, get: ucl, start: uclStart, table: uclTable, next: uclNext, canPlay: uclCanPlay, begin: uclBegin, opponent: uclOpponent, record: uclRecord, payout: uclPayout, quit: () => { const r = root(); r.ucl = null; RUT.State.save(); } };

  RUT.Top5 = { ucl: uclApi, begin, forfeit, lastRound, news, squad, strength, learnFrom, LGS, ORDER, T5, unlocked, root, cur, pick, next, table, record, advance, opponent, payout, seasonReward, played, total };
})();
