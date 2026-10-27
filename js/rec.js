/* =============================================================================
 * rec.js  -  Match recorder: storage, highlight picking and the play-style numbers (v108)
 * -----------------------------------------------------------------------------
 * A local match with one human is recorded as its set-up (JSON) plus the human's inputs. The simulation is deterministic, so any moment can be played
 * back exactly: build the same match, feed it the same inputs, simulate up to the moment (engine.js: recStart / recPlay / reelStart).
 * Stored in IndexedDB (per account, newest 12 matches); if the browser blocks it the recordings live in memory until the page is closed.
 * ========================================================================== */
window.RUT = window.RUT || {};
(function () {
  'use strict';
  const NAME = 'rut_rec_v1', KEEP = 12, MAXCLIPS = 12;
  const mem = { meta: [], data: {} };
  let dbp = null;
  const acct = () => (RUT.Auth ? RUT.Auth.ns : '') || '';
  const open = () => dbp || (dbp = new Promise(res => {
    try {
      const q = indexedDB.open(NAME, 1);
      q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('meta', { keyPath: 'id' }); d.createObjectStore('data', { keyPath: 'id' }); };
      q.onsuccess = () => res(q.result); q.onerror = () => res(null); q.onblocked = () => res(null);
    } catch (e) { res(null); }
  }));
  const req = r => new Promise(res => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  const done = t => new Promise(res => { t.oncomplete = () => res(true); t.onerror = t.onabort = () => res(false); });
  const Rec = { mem, ok: null };

  /** The JSON of a match set-up (functions left out). Taken before the match is built. */
  Rec.snapshot = cfg => JSON.stringify(cfg, (k, v) => typeof v === 'function' ? undefined : v);

  /* ------------------------------- storage -------------------------------- */
  Rec.list = async function () {
    const db = await open(); let all = mem.meta;
    if (db) { try { const r = await req(db.transaction('meta').objectStore('meta').getAll()); if (r) { Rec.ok = true; all = r.concat(mem.meta.filter(m => !r.some(x => x.id === m.id))); } } catch (e) { Rec.ok = false; } } else Rec.ok = false;
    const a = acct();
    return all.filter(m => (m.acct || '') === a).sort((x, y) => y.ts - x.ts);
  };
  Rec.get = async function (id) {
    if (mem.data[id]) return mem.data[id];
    const db = await open(); if (!db) return null;
    try { return await req(db.transaction('data').objectStore('data').get(id)); } catch (e) { return null; }
  };
  Rec.del = async function (id) {
    mem.meta = mem.meta.filter(m => m.id !== id); delete mem.data[id];
    const db = await open(); if (!db) return;
    try { const t = db.transaction(['meta', 'data'], 'readwrite'); t.objectStore('meta').delete(id); t.objectStore('data').delete(id); await done(t); } catch (e) { /* gone */ }
  };
  async function put(meta, data) {
    const db = await open(); let saved = false;
    if (db) { try { const t = db.transaction(['meta', 'data'], 'readwrite'); t.objectStore('meta').put(meta); t.objectStore('data').put(data); saved = await done(t); } catch (e) { saved = false; } }
    if (!saved) { mem.meta.push(meta); mem.data[meta.id] = data; }
    const all = await Rec.list();
    for (const m of all.slice(KEEP)) await Rec.del(m.id);
    return saved;
  }

  /* ----------------------------- highlight picking ------------------------- */
  const minTxt = e => (typeof e.min === 'number' ? e.min : String(e.min)) + "'";
  /** Choose up to 8 moments from a match's recorded events: goals first, then big saves, skill moves that led to a shot, woodwork, shots on target, tackles in the box or high up. */
  Rec.pickClips = function (events, ticks, brk, team) {
    const lim = brk != null ? brk : ticks, cand = [], mine = e => e.team === team, E = events.slice().sort((a, b) => a.tk - b.tk);
    const shotsAfter = (e, win) => E.some(x => mine(x) && x.k === 'shot' && x.tk > e.tk && x.tk <= e.tk + win);
    E.forEach(e => {
      if (!mine(e)) return;
      let sc = 0, lab = '', typ = e.k;
      if (e.k === 'goal') {
        const [a, b] = e.sc.split('-').map(Number), my = team === 0 ? a : b, op = team === 0 ? b : a;
        sc = 100 + (e.z === 'far' ? 25 : e.z === 'edge' ? 10 : 0) + (e.head ? 10 : 0) + (e.volley ? 15 : 0) + (e.chip ? 15 : 0) + (e.thru ? 15 : 0) + (e.skill ? 20 : 0) + (my - 1 <= op && my > op ? 15 : my === op ? 10 : 0);
        lab = 'GOAL · ' + (e.p || 'Own goal');
        const t = []; if (e.z === 'far') t.push('long shot ' + e.dd + ' m'); else if (e.z === 'edge') t.push('from the edge, ' + e.dd + ' m'); if (e.head) t.push('header'); if (e.volley) t.push('volley'); if (e.chip) t.push('chip');
        if (e.thru) t.push('through ball from ' + e.thru); if (e.skill) t.push('after a skill move'); if (my === op) t.push('equaliser'); else if (my === op + 1) t.push('takes the lead');
        if (t.length) lab += ' (' + t.join(', ') + ')';
      } else if (e.k === 'save') { sc = 58 + (e.z === 'box' ? 6 : 0); lab = 'SAVE · ' + e.p + (e.by ? ' denies ' + e.by : ''); }
      else if (e.k === 'post') { sc = 42; lab = 'OFF THE WOODWORK · ' + e.p; }
      else if (e.k === 'skill') { if (!shotsAfter(e, 240)) return; sc = 52 + (e.sig ? 6 : 0); lab = 'SKILL · ' + e.p + (e.kind ? ' (' + e.kind + ')' : '') + ', then a shot'; }
      else if (e.k === 'sot') { if (E.some(x => x.k === 'goal' && x.team === e.team && x.tk >= e.tk && x.tk < e.tk + 120)) return; sc = 36 + (e.z === 'box' ? 8 : 0); lab = 'SHOT ON TARGET · ' + e.p; }
      else if (e.k === 'tkw') { if (!e.own && !(e.high && shotsAfter(e, 240))) return; sc = e.own ? 44 : 40; lab = 'TACKLE · ' + e.p + (e.own ? ' wins it in his own box' : ' wins it high and the team shoots'); }
      else return;
      cand.push({ k: e.tk, score: sc, type: typ, label: minTxt(e) + ' ' + lab, min: e.min, p: e.p || null });
    });
    cand.sort((x, y) => y.score - x.score || x.k - y.k);
    const out = [];
    for (const c of cand) {
      if (out.length >= MAXCLIPS) break;
      const a = Math.max(1, c.k - (c.type === 'goal' ? 330 : 270)), b = c.k + (c.type === 'goal' ? 210 : 150);
      if (b > lim) continue;
      if (out.some(o => a < o.b + 60 && b > o.a - 60)) continue;
      out.push({ a, b, k: c.k, score: c.score, type: c.type, label: c.label, p: c.p });
    }
    return out.sort((x, y) => x.a - y.a);
  };

  /** After a recorded match: store it, with the clips picked. Resolves with the meta (or null when the match was too short to keep). */
  Rec.finish = async function (m, extra) {
    const R = m.rec; if (!R || R.mode !== 'rec') return null;
    const ticks = m.tk; if (ticks < 1200) return null;                      // under 20 s: nothing worth keeping
    const team = m.human == null ? 0 : m.human, ended = !!m.over;
    const tot = m.stats.possession[0] + m.stats.possession[1] || 1;
    const clips = Rec.pickClips(R.events, ticks, R.brk, team);
    const id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const meta = Object.assign({ id, acct: acct(), ts: Date.now(), home: m.teams[0].name, away: m.teams[1].name, team, score: m.score.slice(), half: m.halfSeconds, ticks, ended, brk: R.brk, clips,
      s: { rs: m.rs, poss: [m.stats.possession[0] / tot * 100, m.stats.possession[1] / tot * 100], score: m.score.slice(), sh: m.stats.shots.slice(), sot: m.stats.onTarget.slice(), half: m.halfSeconds, team }, nEv: R.events.length, auto: (m.autoLog || []).map(x => ({ min: x.min, label: x.label, why: x.why, sc: x.sc })), manualTac: (R.tcl || []).length, pl: Object.values(R.ps || {}).filter(x => x.t === team).map(x => ({ n: x.n, pos: x.pos, ovr: x.ovr, id: x.id, c: x.c })) }, extra || {});
    const data = { id, snap: R.snap, seed: R.seed, inputs: R.inputs, ax: R.ax, tcl: R.tcl || [], events: R.events };
    meta.saved = await put(meta, data);
    return meta;
  };

  /* --------------------------- play-style numbers -------------------------- */
  const div = (a, b) => (b > 0 ? a / b : null);
  /** The numbers the page, the coach and the proof all share. f(sample) -> value per match (null when it can't be worked out). sample = { rs (one team's counters), poss, score, sh, half, team }. */
  const MET = {
    pass: { name: 'Passes per match', f: s => s.rs.pass, scale: 1, d: 0 },
    short: { name: 'Short passes (under 14 m)', f: s => div(s.rs.short, s.rs.pass), pct: 1 },
    long: { name: 'Long balls, lobs and through balls', f: s => div(s.rs.long, s.rs.pass), pct: 1 },
    fwd: { name: 'Forward passes', f: s => div(s.rs.fwd, s.rs.pass), pct: 1 },
    back: { name: 'Backward passes', f: s => div(s.rs.back, s.rs.pass), pct: 1 },
    wing: { name: 'Final-third passes from the wings', f: s => div(s.rs.lane[0] + s.rs.lane[2], s.rs.lane[0] + s.rs.lane[1] + s.rs.lane[2]), pct: 1 },
    cross: { name: 'Crosses per match', f: s => s.rs.cross, scale: 1, d: 1 },
    thru: { name: 'Through balls per match', f: s => s.rs.thru, scale: 1, d: 1 },
    shot: { name: 'Shots per match', f: s => s.rs.shot, scale: 1, d: 1 },
    far: { name: 'Shots from long range', f: s => div(s.rs.far, s.rs.shot), pct: 1 },
    box: { name: 'Shots from inside the box', f: s => div(s.rs.box, s.rs.shot), pct: 1 },
    conv: { name: 'Shots that score', f: s => div(s.rs.gBox + s.rs.gEdge + s.rs.gFar, s.rs.shot), pct: 1 },
    skill: { name: 'Skill moves per match', f: s => s.rs.skill, scale: 1, d: 1 },
    tk: { name: 'Tackles tried per match', f: s => s.rs.tk, scale: 1, d: 1 },
    tkw: { name: 'Tackles won per match', f: s => s.rs.tkw, scale: 1, d: 1 },
    foul: { name: 'Fouls per match', f: s => s.rs.foul, scale: 1, d: 1 },
    wonHigh: { name: 'Ball won in their half per match', f: s => s.rs.wonHigh, scale: 1, d: 1 },
    lostOwn: { name: 'Ball lost in your own half per match', f: s => s.rs.lostOwn, scale: 1, d: 1 },
    line: { name: 'Back line height without the ball (m from own goal)', f: s => div(s.rs.lineS, s.rs.lineN), d: 1 },
    width: { name: 'Team width with the ball (m)', f: s => div(s.rs.widS, s.rs.widN), d: 1 },
    poss: { name: 'Possession', f: s => s.poss, d: 0, unit: '%' },
    gf: { name: 'Goals for', f: s => s.score[s.team], scale: 1, d: 2 },
    ga: { name: 'Goals against', f: s => s.score[1 - s.team], scale: 1, d: 2 },
    sh: { name: 'Shots for', f: s => s.sh[s.team], scale: 1, d: 1 },
    shA: { name: 'Shots against', f: s => s.sh[1 - s.team], scale: 1, d: 1 },
  };
  Rec.MET = MET;
  /** One match value of a metric (count metrics are scaled to 90 s halves so matches of any length compare). */
  Rec.val = (id, s) => { const M = MET[id]; let v = M.f(s); if (v == null || isNaN(v)) return null; if (M.scale) v *= 90 / (s.half || 90); return v; };
  Rec.mean = (id, samples) => { const a = samples.map(s => Rec.val(id, s)).filter(v => v != null); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  Rec.fmt = (id, v) => { const M = MET[id]; if (v == null) return '–'; return M.pct ? Math.round(v * 100) + '%' : M.unit === '%' ? Math.round(v) + '%' : v.toFixed(M.d == null ? 1 : M.d); };
  /** Per-team samples out of stored metas (the human's side), for the style page and the coach. */
  Rec.samples = metas => metas.filter(m => m.s && m.s.rs).map(m => ({ rs: m.s.rs[m.team], poss: m.s.poss[m.team], score: m.score, sh: m.s.sh, half: m.half, team: m.team }));
  /** Plain-English tendencies with the numbers behind them. */
  Rec.tendencies = function (samples) {
    const n = samples.length, out = [], M = id => Rec.mean(id, samples), P = id => { const v = M(id); return v == null ? null : Math.round(v * 100); };
    if (!n) return out;
    const sum = f => samples.reduce((a, s) => a + f(s.rs), 0), shots = sum(r => r.shot);
    const gz = { box: div(sum(r => r.gBox), sum(r => r.box)), edge: div(sum(r => r.gEdge), sum(r => r.edge)), far: div(sum(r => r.gFar), sum(r => r.far)) };
    const pc = v => v == null ? '–' : Math.round(v * 100) + '%';
    if (shots >= 6 && P('far') != null && P('far') >= 30) out.push({ id: 'far', text: 'Shoots from long range a lot', ev: P('far') + '% of your ' + shots + ' shots come from 30 m or more and ' + pc(gz.far) + ' of them score (inside the box: ' + pc(gz.box) + ').', ask: 'shoot less from long range and work it into the box' });
    if (P('long') != null && P('long') >= 40) out.push({ id: 'long', text: 'Plays long a lot', ev: P('long') + '% of your passes are long balls, lobs or through balls (' + (M('pass') || 0).toFixed(0) + ' passes per match).', ask: 'keep the ball with short passes' });
    if (P('short') != null && P('short') >= 55) out.push({ id: 'short', text: 'Passes short and patient', ev: P('short') + '% of your passes are under 14 m.', ask: 'play more direct and use long balls' });
    if (P('wing') != null && P('wing') <= 28) out.push({ id: 'wing', text: 'Attacks through the middle', ev: 'Only ' + P('wing') + '% of your passes in the final third start on the wings.', ask: 'use the wings and cross more' });
    if (P('wing') != null && P('wing') >= 50) out.push({ id: 'wide', text: 'Attacks down the wings', ev: P('wing') + '% of your final-third passes start on the wings (' + (M('cross') || 0).toFixed(1) + ' crosses per match).', ask: 'play through the middle more' });
    if (M('lostOwn') != null && M('lostOwn') >= 4) out.push({ id: 'lost', text: 'Loses the ball in his own half', ev: 'You give the ball away ' + M('lostOwn').toFixed(1) + ' times per match in your own half.', ask: 'play safe and short out of defence' });
    if (M('wonHigh') != null && M('wonHigh') <= 2) out.push({ id: 'lowpress', text: 'Rarely wins it back high up', ev: 'The team wins the ball in the other half ' + M('wonHigh').toFixed(1) + ' times per match.', ask: 'press higher and harder' });
    if (M('foul') != null && M('foul') >= 3) out.push({ id: 'foul', text: 'Commits a lot of fouls', ev: M('foul').toFixed(1) + ' fouls per match (' + (M('tk') || 0).toFixed(1) + ' tackles tried).', ask: 'tackle less aggressively and stay on your feet' });
    if (M('skill') != null && M('skill') >= 8) out.push({ id: 'skill', text: 'Loves skill moves', ev: M('skill').toFixed(1) + ' skill moves per match.', ask: '' });
    if (M('line') != null) out.push({ id: 'line', text: 'Back line height', ev: 'Without the ball your back four sits ' + M('line').toFixed(1) + ' m from your own goal on average.', ask: '' });
    return out.filter(t => t.ask !== '' || t.id === 'skill' || t.id === 'line');
  };
  RUT.Rec = Rec;
})();
