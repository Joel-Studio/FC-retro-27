/* =============================================================================
 * net.js  -  Online play lobby (game code) over the artifact's live "room"
 * -----------------------------------------------------------------------------
 * Two players open the same artifact. The host makes a game code, the guest types it in; both join the room
 * named after the code (`claude.use("room").join("rut-<code>")`), swap their club squads and start. During the match only
 * controller inputs travel (see "ONLINE (lockstep)" in engine.js), on the topic `rut_in`; everything else goes on `rut_ctl`.
 *
 * Everything that arrives from the other player is untrusted: squads are rebuilt from a whitelist and clamped.
 * Both sides build the match from the SAME cleaned data (their own squad goes through the same clean-up), so the two
 * simulations start identical.
 *
 * Declared at publish time: capabilities { room: { topics: { rut_ctl: "interact", rut_in: "interact" } } }.
 * ========================================================================== */
(function () {
  'use strict';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];
  const FACE = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
  const str = (v, n, d) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : d);
  const num = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);

  /** Rebuild a squad card from untrusted JSON. Known players are limited to a sane distance above the local copy. */
  function cleanCard(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const id = str(raw.id, 40, 'x'), base = RUT.DB.get(id);
    const cap = (v, b, room) => num(v, 1, base ? Math.min(99, (b || 0) + (room == null ? 12 : room)) : 99, base ? b : 60);   // a card may be a little above its database stats (boosts, chemistry) but not made up
    const c = {
      id, name: str(raw.name, 40, base ? base.name : 'Player'), club: str(raw.club, 40, base ? base.club : ''), league: str(raw.league, 30, base ? base.league : ''),
      nation: str(raw.nation, 4, base ? base.nation : ''), position: POSITIONS.includes(raw.position) ? raw.position : (base ? base.position : 'CM'),
      altPositions: (Array.isArray(raw.altPositions) ? raw.altPositions : []).filter(p => POSITIONS.includes(p)).slice(0, 6),
      rating: cap(raw.rating, base ? base.rating : 60, 6), rarity: str(raw.rarity, 12, base ? base.rarity : 'gold'), rare: !!raw.rare,
      face: {}, sub: {}, playStyles: (Array.isArray(raw.playStyles) ? raw.playStyles : []).filter(p => typeof p === 'string' && /^[A-Za-z0-9 +'-]{2,24}$/.test(p)).slice(0, 12),
      value: 0, generated: !!raw.generated, details: {}, chemApplied: 0,
    };
    if (!c.altPositions.length) c.altPositions = [c.position];
    FACE.forEach(k => { c.face[k] = cap(raw.face && raw.face[k], base ? base.face[k] : 60); });
    const rs = raw.sub && typeof raw.sub === 'object' ? raw.sub : {};
    Object.keys(rs).filter(k => /^[A-Za-z]{2,20}$/.test(k)).sort().slice(0, 48).forEach(k => { c.sub[k] = cap(rs[k], base && base.sub ? base.sub[k] : 60); });
    const d = raw.details && typeof raw.details === 'object' ? raw.details : {};
    c.details = { skillMoves: num(d.skillMoves, 1, 5, 2), weakFoot: num(d.weakFoot, 1, 5, 2), workRates: str(d.workRates, 12, 'Med/Med'), height: num(d.height, 150, 210, 180), foot: d.foot === 'Left' ? 'Left' : 'Right', number: num(d.number, 1, 99, 10), age: num(d.age, 15, 50, 25) };
    if (raw.role && RUT.ROLE_BY && RUT.ROLE_BY[raw.role]) c.role = raw.role;
    return c;
  }
  const cleanSquad = cards => cards.map(c => cleanCard(JSON.parse(JSON.stringify(c))));
  const avgRating = cards => Math.round(cards.reduce((a, c) => a + c.rating, 0) / Math.max(1, cards.length));
  const newCode = () => { let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; };
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  /** Is the live room available in this view? (null = opened outside the shared artifact, signed out, or the page wasn't granted it.) */
  async function supported() {
    try { return !!(window.claude && window.claude.use && await window.claude.use('room')); } catch (e) { return false; }
  }

  /**
   * One online game. opts = { role: 'host' | 'guest', code, club, cards (my squad), onEvent(ev) }
   * events: {type:'status', text} {type:'paired', club, rating} {type:'team'} {type:'start', cfg} {type:'bye'} {type:'error', text}
   */
  /* v172: a viewer who may not send room events (the topics are not open to their access level) still plays. The wrapper tries
   * emit; on "not_permitted" it switches to presence, which every admitted viewer may set: the latest input packet (it already
   * carries every frame the other side hasn't acknowledged) and the last 12 control messages, each numbered so readers skip
   * what they have seen. Messages sent either way are heard either way. */
  function boxRoom(R) {
    const hs = {}, seen = new Map();
    let box = false, n = 0, ctl = [], inp = null, pend = false;
    const deliver = (topic, msg) => (hs[topic] || []).forEach(f => { try { f(msg); } catch (e) { /* handler error */ } });
    const flush = () => {
      pend = false; let c = ctl.slice(-12), body = { bx: 1, c, i: inp };
      while (JSON.stringify(body).length > 3800 && c.length > 1) { c = c.slice(1); body = { bx: 1, c, i: inp }; }
      R.presence(body).catch(() => {});
    };
    const queue = (topic, data) => {
      const e = [++n, data];
      if (topic === 'rut_in') inp = e; else { ctl.push(e); if (ctl.length > 24) ctl = ctl.slice(-24); }
      if (!pend) { pend = true; setTimeout(flush, 35); }
    };
    const offP = R.onPeers(ch => {
      ch.peers.forEach(p => {
        const pr = p.presence; if (p.sameTab || !pr || !pr.bx) return;
        const last = seen.get(p.peer) || 0; let mx = last;
        const take = (e, topic) => { if (Array.isArray(e) && e[0] > last) { mx = Math.max(mx, e[0]); deliver(topic, { isMe: false, sameTab: false, peer: p.peer, guest: p.guest, data: e[1] }); } };
        if (Array.isArray(pr.c)) pr.c.slice().sort((x, y) => x[0] - y[0]).forEach(e => take(e, 'rut_ctl'));
        take(pr.i, 'rut_in');
        seen.set(p.peer, mx);
      });
    }, () => {});
    return {
      emit(topic, data) {
        if (box) { queue(topic, data); return Promise.resolve(); }
        return R.emit(topic, data).catch(e => { const c = String((e && (e.code || e.message)) || ''); if (/not_permitted|not_granted|permission|forbidden/i.test(c)) { box = true; queue(topic, data); } });
      },
      on(topic, fn, onErr) { (hs[topic] = hs[topic] || []).push(fn); const off = R.on(topic, fn, onErr); return () => { off(); hs[topic] = (hs[topic] || []).filter(f => f !== fn); }; },
      peers: () => R.peers(), onPeers: (fn, e) => R.onPeers(fn, e), presence: x => R.presence(x),
      leave() { try { offP(); } catch (e) { /* gone */ } return R.leave(); },
      get viaPresence() { return box; },
    };
  }

  function Session(opts) {
    this.o = opts; this.role = opts.role; this.code = normCode(opts.code); this.club = str(opts.club, 20, 'Club');
    this.mine = cleanSquad(opts.cards); this.theirs = []; this.theirClub = ''; this.partner = null; this.me = null;
    this.state = 'idle'; this.seq = 0; this.pending = new Map(); this.seen = new Set(); this.theirParts = []; this.startCfg = null; this.closed = false;
    this.inHandler = null;
  }
  const S = Session.prototype;
  S.say = function (text) { this.o.onEvent({ type: 'status', text }); };
  S.fail = function (text) { if (this.closed) return; this.o.onEvent({ type: 'error', text }); this.close(true); };

  S.connect = async function () {
    this.state = 'connecting'; this.say('Connecting...');
    let room = null;
    if (this.o.transport) { this.room = this.o.transport; room = true; }          // direct link (WebRTC): no room, no account
    else {
    try { room = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch (e) { room = null; }
    if (!room && dbRooms.ok()) { try { this.room = await dbRooms.join('rut-' + this.code.toLowerCase()); this.room.fast(true); this.viaRelay = true; room = true; } catch (e) { this.room = null; } }   // v234: the database relay first
    if (!room && !this.room && relayClient()) { try { this.room = await relayRooms.join('rut-' + this.code.toLowerCase()); this.viaRelay = true; room = true; } catch (e) { this.room = null; } }   // v209: the website relay first
    if (!room) {
      if (!havePeer()) { this.fail('Online play could not start: the connection library did not load. Reload the page, or use a Direct connection, which needs no account.'); return false; }
      this.viaPeer = true;       // v126: no Claude room (no account): meet through the free PeerJS broker, still a direct browser-to-browser link
    }
    }
    if (this.closed) { if (this.room && this.room.leave) this.room.leave(); return false; }
    if (this.viaPeer) { try { this.room = await peerRoom('rut-' + this.code.toLowerCase(), this.role); } catch (e) { this.fail(e && e.code === 'unavailable-id' ? 'That game code is already in use. Pick a new code and try again.' : 'Could not reach the matchmaking service (' + ((e && e.code) || 'error') + '). Check your internet connection, or use a Direct connection below.'); return false; } }
    else if (!this.o.transport && !this.viaRelay) try { this.room = boxRoom(await room.join('rut-' + this.code.toLowerCase())); } catch (e) { this.fail('Could not join the room (' + ((e && e.code) || 'error') + '). Make sure the artifact is shared with you at Contributor level or higher.'); return false; }
    const onErr = e => this.fail('Lost the connection (' + ((e && e.code) || 'error') + ').');
    this.offCtl = this.room.on('rut_ctl', m => this.onCtl(m), onErr);
    this.offIn = this.room.on('rut_in', m => { if (!m.sameTab && this.partner && m.peer === this.partner && this.inHandler) this.inHandler(m.data); }, onErr);
    this.me = (this.room.peers().find(p => p.sameTab) || {}).peer || null;
    this.timer = setInterval(() => this.tick(), 700); this.tries = 0;
    this.pingC = 0;   // ping fast until the round trip is well measured (the input delay is sized from it), then once a second
    this.pinger = setInterval(() => { if (this.partner && !this.closed && ((this.rttN || 0) < 8 || ++this.pingC % 3 === 0)) this.emit({ k: 'ping', t: Date.now() }); }, 350);
    if (this.role === 'host') { this.state = 'waiting'; this.say('Waiting for your friend. Game code: ' + this.code); }
    else { this.state = 'joining'; this.say('Looking for game ' + this.code + '...'); this.hello(); }
    return true;
  };
  S.emit = function (data) { if (this.closed || !this.room) return; this.room.emit('rut_ctl', data).catch(() => {}); };
  S.hello = function () { this.emit({ k: 'hello', club: this.club, v: 1, duel: !!this.o.duel, tac: str(this.o.tac, 20, '') }); };
  /** A message that is resent until the other side acknowledges it. */
  S.rel = function (k, payload) { const n = ++this.seq, data = Object.assign({ k, n }, payload); this.pending.set(n, { data, tries: 0 }); this.emit(data); return n; };
  S.tick = function () {
    if (this.closed) return;
    if (this.state === 'joining') { if (++this.tries > 20) { this.fail('No game found with the code ' + this.code + '. Check the code and that the host has opened their game.'); return; } this.hello(); }
    this.pending.forEach((p, n) => { if (++p.tries > 20) { this.pending.delete(n); this.fail('The other player stopped answering.'); return; } this.emit(p.data); });
  };
  S.onCtl = function (m) {
    if (this.closed || m.sameTab || !m.data || typeof m.data !== 'object') return;
    if (!this.me && this.room && this.room.peers) this.me = (this.room.peers().find(p => p.sameTab) || {}).peer || null;   // the room can still be empty when we join
    const d = m.data, k = d.k;
    if (this.partner && m.peer !== this.partner) { if (k === 'hello') this.emit({ k: 'busy', to: m.peer }); return; }   // a third person with the same code
    if (k === 'hello' && this.role === 'host') {
      if (!!d.duel !== !!this.o.duel) { this.emit({ k: 'mode', to: m.peer, duel: !!this.o.duel }); return; }     // 1v1 duel vs club match: both must pick the same mode
      if (this.partner !== m.peer) { this.partner = m.peer; this.theirClub = str(d.club, 20, 'Guest'); this.theirTac = str(d.tac, 20, ''); this.state = 'paired'; this.say('Friend found: ' + this.theirClub); this.o.onEvent({ type: 'paired', club: this.theirClub }); this.sendTeam(); }
      this.emit({ k: 'welcome', to: m.peer, club: this.club, v: 1 });
    } else if (k === 'welcome' && this.role === 'guest' && d.to === this.me && this.state === 'joining') {
      this.partner = m.peer; this.theirClub = str(d.club, 20, 'Host'); this.state = 'paired'; this.say('Connected to ' + this.theirClub);
      this.o.onEvent({ type: 'paired', club: this.theirClub }); this.sendTeam();
    } else if (k === 'mode' && d.to === this.me && !this.partner) { this.fail(d.duel ? 'The host is playing a 1v1 Duel. Switch to 1v1 Duel mode and join again.' : 'The host is playing a Club XI match. Switch to Club XI mode and join again.'); }
    else if (k === 'busy' && d.to === this.me && !this.partner) { this.fail('That game already has two players.'); }
    else if (k === 'ack' && this.partner === m.peer) { this.pending.delete(d.a); }
    else if (k === 'ping' && this.partner === m.peer) { this.emit({ k: 'pong', t: d.t, to: m.peer }); }
    else if (k === 'pong' && this.partner === m.peer && d.to === this.me) {
      const r = Date.now() - num(d.t, 0, 9e15, Date.now());
      if (r >= 0 && r < 5000) { this.rttVar = this.rtt ? this.rttVar * 0.75 + Math.abs(r - this.rtt) * 0.25 : r / 2; this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; this.rttN = (this.rttN || 0) + 1; this.o.onEvent({ type: 'ping', rtt: this.rtt }); }
    }
    else if (this.partner === m.peer && k === 'rematch') this.onReliable(d, k);
    else if (this.partner === m.peer && (k === 'team' || k === 'start')) this.onReliable(d, k);
    else if (k === 'bye' && this.partner === m.peer) { this.o.onEvent({ type: 'bye' }); this.close(true); }
  };
  S.sendTeam = function () { this.mine.forEach((c, i) => this.rel('team', { i, card: c })); };
  /** Pitch condition, ball and assist level travel with the start message so both machines simulate the same match. */
  function cleanPhys(p) {
    p = p || {};
    return { surface: ['dry', 'wet', 'worn'].includes(p.surface) ? p.surface : 'dry', ballModel: ['match', 'classic', 'light'].includes(p.ballModel) ? p.ballModel : 'match', assist: ['full', 'semi', 'manual'].includes(p.assist) ? p.assist : 'semi' };
  }
  S.onReliable = function (d, k) {
    const n = d.n | 0, key = k + n;
    if (k === 'rematch') {
      this.emit({ k: 'ack', a: n });
      if (this.seen.has(key)) return; this.seen.add(key);
      this.rm = this.rm || {}; this.rm.them = true; this.o.onEvent({ type: 'rematch-ask' }); this.maybeRematch();
      return;
    }
    if (k === 'start') {
      if (this.theirs.length < 11) return;                      // not ready: no ack, the host keeps asking
      this.emit({ k: 'ack', a: n });
      if (this.seen.has(key)) return; this.seen.add(key);
      this.begin({ delay: num(d.delay, 4, 30, 8), seed: num(d.seed, 1, 2e9, 1), half: num(d.half, 20, 600, 90), pitch: d.pitch === 'colossal' ? 'colossal' : 'huge', brain: d.brain === 'ultra' ? 'ultra' : 'std', phys: cleanPhys(d.phys), duel: !!this.o.duel && !!d.duel, styles: [str(d.styles && d.styles[0], 20, 'balanced'), str(d.styles && d.styles[1], 20, 'balanced')] });
      return;
    }
    this.emit({ k: 'ack', a: n });
    if (this.seen.has(key)) return; this.seen.add(key);
    const i = d.i | 0; if (i < 0 || i > 10) return;
    this.theirParts[i] = cleanCard(d.card);
    if (this.theirParts.filter(Boolean).length === 11 && !this.theirs.length) {
      this.theirs = this.theirParts.slice(); this.o.onEvent({ type: 'team', club: this.theirClub, rating: avgRating(this.theirs) });
      if (this.startWanted) this.sendStart();
    }
  };
  /** Host: start the match with these options once both squads are in. */
  S.start = function (cfg) { if (this.role !== 'host') return; this.lastCfg = Object.assign({}, cfg); this.startWanted = cfg; if (this.theirs.length === 11) this.sendStart(); else this.say('Waiting for the squad...'); };
  S.sendStart = function () {
    if (this.startSent) return; this.startSent = true; const c = this.startWanted;
    c.delay = this.inputDelay();                                  // fewer stalls on slow links: sized from the measured round trip
    this.startN = this.rel('start', { delay: c.delay, seed: c.seed, half: c.half, pitch: c.pitch === 'colossal' ? 'colossal' : 'huge', brain: c.brain, phys: cleanPhys(c.phys), duel: !!c.duel, styles: c.styles });
    const wait = setInterval(() => { if (this.closed) { clearInterval(wait); return; } if (!this.pending.has(this.startN)) { clearInterval(wait); this.begin(c); } }, 100);   // the guest acknowledged: both go
  };
  S.begin = function (c) {
    this.state = 'playing'; this.rm = null;
    const host = this.role === 'host', mine = this.mine, theirs = this.theirs;
    this.o.onEvent({ type: 'start', cfg: { delay: num(c.delay, 4, 30, 8), seed: c.seed, half: c.half, pitch: c.pitch === 'colossal' ? 'colossal' : 'huge', brain: c.brain, phys: cleanPhys(c.phys), duel: !!c.duel, styles: c.styles, me: host ? 0 : 1,
      home: { name: host ? this.club : this.theirClub, cards: host ? mine : theirs }, away: { name: host ? this.theirClub : this.club, cards: host ? theirs : mine } } });
  };
  /** Input delay in 60 Hz ticks, from the measured round trip: half of it plus twice the jitter and a small margin (6 ticks = 100 ms is the floor). */
  S.inputDelay = function () {
    const r = this.rtt || 100, j = Math.min(this.rttVar || 0, r * 0.35), d = Math.ceil((r / 2 + 1.5 * j) / 16.7) + 3;   // v219: jitter counts 1.5x and is capped, so slow links get a smaller, snappier buffer
    let q = 'auto'; try { q = (JSON.parse(localStorage.getItem('rut_settings') || '{}') || {}).netq || 'auto'; } catch (e) { /* default */ }
    // v203 Settings > Online: Smooth = a bigger buffer so slow or far links never stutter; Fast = the smallest buffer for players on the same Wi-Fi
    return q === 'smooth' ? Math.max(9, Math.min(30, d + 4)) : q === 'fast' ? Math.max(4, Math.min(20, d - 2)) : Math.max(6, Math.min(this.room && this.room.db ? 36 : 20, d));   // v234: the database relay is slower, so it may use a bigger buffer
  };
  /** After a match: ask for a rematch. When both want one the host starts it with a fresh seed. */
  S.wantRematch = function () {
    if (this.closed || !this.partner) return false;
    this.rm = this.rm || {}; if (this.rm.me) return true; this.rm.me = true; this.rel('rematch', {}); this.maybeRematch(); return true;
  };
  S.maybeRematch = function () {
    if (this.role !== 'host' || !this.rm || !this.rm.me || !this.rm.them || !this.lastCfg) return;
    this.rm = null; this.startSent = false;
    this.startWanted = Object.assign({}, this.lastCfg, { seed: 1 + Math.floor(Math.random() * 2e9) }); this.lastCfg = Object.assign({}, this.startWanted);
    this.sendStart();
  };
  /** In a match: send an input message to the other player / receive theirs. */
  S.sendInput = function (msg) { if (!this.closed && this.room) this.room.emit('rut_in', msg).catch(() => {}); };
  S.close = function (quiet) {
    if (this.closed) return; if (!quiet && this.partner) this.emit({ k: 'bye' });
    this.closed = true; this.state = 'closed'; clearInterval(this.timer); clearInterval(this.pinger);
    try { this.offCtl && this.offCtl(); this.offIn && this.offIn(); this.room && this.room.leave(); } catch (e) { /* already gone */ }
  };

  /* ---------------------------------------------------------------------------------------------------------------
   * Direct link: a WebRTC data channel between two browsers, no server and no account. The two players swap one code
   * each by any chat app (the host's invite, then the guest's reply). Presents the same small API as the artifact room
   * (emit / on / peers / leave) so Session runs unchanged on top of it.
   * ------------------------------------------------------------------------------------------------------------- */
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }];
  const b64 = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = t => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  async function pack(desc) {
    const raw = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
    let out = raw, tag = 'R';
    try { if (typeof CompressionStream === 'function') { const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')); out = new Uint8Array(await new Response(cs).arrayBuffer()); tag = 'Z'; } } catch (e) { out = raw; tag = 'R'; }
    return 'RUT' + tag + '-' + b64(out);
  }
  async function unpack(code, want) {
    code = String(code || '').replace(/\s+/g, '');
    const m = /^RUT([RZ])-([A-Za-z0-9_-]{40,})$/.exec(code);
    if (!m) throw new Error('That is not a RUT connection code. Copy the whole code, it starts with RUTZ- or RUTR-.');
    let bytes = unb64(m[2]);
    if (m[1] === 'Z') { if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read that code (no DecompressionStream). Try a current Chrome, Edge, Safari or Firefox.'); bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
    let o; try { o = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('The code is damaged (a character was lost when copying). Copy it again.'); }
    if (!o || o.t !== want || typeof o.s !== 'string' || o.s.length > 20000 || !/^v=0/.test(o.s)) throw new Error(want === 'offer' ? 'That is a reply code, not an invite. The host\'s invite is the first code.' : 'That is an invite, not a reply. Paste the reply code your friend sends back.');
    return { type: o.t, sdp: o.s };
  }
  function Direct() {
    this.id = 'p' + Math.random().toString(36).slice(2, 10); this.handlers = {}; this.dc = null; this.open = false; this.closed = false; this.remote = null;
    this.ready = new Promise((res, rej) => { this._res = res; this._rej = rej; });
  }
  const DP = Direct.prototype;
  DP.available = () => typeof RTCPeerConnection === 'function';
  /** What the gathered candidates say about reach: 'srflx' = a public address was found (works across networks), 'host' only = same wifi only. */
  DP.report = function () {
    const sdp = (this.pc && this.pc.localDescription && this.pc.localDescription.sdp) || '';
    return { host: (sdp.match(/ typ host/g) || []).length, srflx: (sdp.match(/ typ srflx/g) || []).length, relay: (sdp.match(/ typ relay/g) || []).length, state: this.pc ? this.pc.iceGatheringState : 'none' };
  };
  DP.mk = function () {
    const pc = this.pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onconnectionstatechange = () => { const st = pc.connectionState; if (st === 'failed') this.fail('The direct connection failed. Both of you may be behind strict networks: try the game code, or a different network.'); else if (st === 'disconnected' || st === 'closed') this.dropped(); };
    return pc;
  };
  DP.fail = function (msg) { if (this.open) { this.dropped(); return; } this._rej(new Error(msg)); };
  DP.dropped = function () { if (this.closed) return; this.closed = true; (this.handlers.__err || []).forEach(f => f({ code: 'closed' })); };
  DP.wire = function (dc) {
    this.dc = dc;
    dc.onopen = () => { this.open = true; this._res(); };
    dc.onclose = () => { this.dropped(); };
    dc.onmessage = ev => {
      let e; try { e = JSON.parse(ev.data); } catch (x) { return; }
      if (!e || typeof e.t !== 'string' || typeof e.f !== 'string' || e.f === this.id) return;
      (this.handlers[e.t] || []).forEach(f => f({ isMe: false, peer: e.f, data: e.d }));
    };
  };
  const gathered = (pc, ms) => new Promise(res => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(done, ms); function done() { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res(); }
    function ch() { if (pc.iceGatheringState === 'complete') done(); }
    pc.addEventListener('icegatheringstatechange', ch);
  });
  /** Host step 1: the invite code to send to the friend. */
  DP.createInvite = async function () {
    const pc = this.mk(); this.wire(pc.createDataChannel('rut', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer()); await gathered(pc, 5000);
    return pack(pc.localDescription);
  };
  /** Host step 2: the friend's reply code. Resolves when the channel is open. */
  DP.acceptReply = async function (code) { await this.pc.setRemoteDescription(await unpack(code, 'answer')); return this.ready; };
  /** Guest: take the host's invite, return the reply code to send back. The channel opens by itself afterwards. */
  DP.joinInvite = async function (code) {
    const offer = await unpack(code, 'offer'), pc = this.mk();
    pc.ondatachannel = ev => this.wire(ev.channel);
    await pc.setRemoteDescription(offer); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc, 5000);
    return pack(pc.localDescription);
  };
  // the artifact-room surface Session expects
  DP.on = function (topic, fn, onErr) { (this.handlers[topic] = this.handlers[topic] || []).push(fn); if (onErr) (this.handlers.__err = this.handlers.__err || []).push(onErr); return () => { this.handlers[topic] = (this.handlers[topic] || []).filter(f => f !== fn); }; };
  DP.peers = function () { return [{ peer: this.id, sameTab: true }]; };
  DP.emit = function (topic, data) {
    try { if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify({ f: this.id, t: topic, d: data })); } catch (e) { /* closed */ }
    return Promise.resolve();
  };
  DP.leave = function () { this.closed = true; try { this.dc && this.dc.close(); this.pc && this.pc.close(); } catch (e) { /* gone */ } };


  /* ---------------------------------------------------------------------------------------------------------------
   * v126: online play with NO Claude account. The pages find each other through the free public PeerJS broker (it only
   * passes the WebRTC handshake), then talk browser to browser. peerRoom() gives Session the same small room API
   * (on / emit / peers / leave) as the artifact room: the host registers the id 'rutg1-<code>', the guest connects to it.
   * Quick match: a waiting player claims the first free id 'rutq1-<mode>-<slot>'; a newcomer that finds the id taken
   * connects to that player and the two agree on a game code, then play through peerRoom with it.
   * RUT.Net.peerCfg can point at another broker ({host, port, path, secure}); empty = the public cloud broker.
   * ------------------------------------------------------------------------------------------------------------- */
  // Websites without the vendored js/peerjs.min.js (the lite bundle) fetch the same library from a CDN at start.
  if (typeof window !== 'undefined' && typeof window.Peer !== 'function' && typeof document !== 'undefined') {
    const urls = ['https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'];
    const tryLoad = i => { if (i >= urls.length || typeof window.Peer === 'function') return; const s = document.createElement('script'); s.src = urls[i]; s.onerror = () => tryLoad(i + 1); document.head.appendChild(s); };
    tryLoad(0);
  }
  const havePeer = () => typeof window.Peer === 'function' && typeof RTCPeerConnection === 'function';
  // v203: more ways through home routers and mobile networks: several STUN servers, PeerJS's TURN relays and TURN over TCP 443 (works behind strict firewalls); different Wi-Fi networks connect via these
  const PEER_ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }];
  const newPeer = id => new window.Peer(id || undefined, Object.assign({ debug: 0, config: { iceServers: PEER_ICE, iceCandidatePoolSize: 4 } }, (RUT.Net && RUT.Net.peerCfg) || {}));
  function peerRoom(name, role) {
    return new Promise((resolve, reject) => {
      const hid = 'rutg1-' + String(name).replace(/[^a-z0-9]/gi, '').toLowerCase();
      const R = { id: null, handlers: {}, conns: new Map(), closed: false, opened: false };
      const err = e => { (R.handlers.__err || []).forEach(f => f(e)); };
      R.on = (topic, fn, onErr) => { (R.handlers[topic] = R.handlers[topic] || []).push(fn); if (onErr) (R.handlers.__err = R.handlers.__err || []).push(onErr); return () => { R.handlers[topic] = (R.handlers[topic] || []).filter(f => f !== fn); }; };
      R.peers = () => [{ peer: R.id, sameTab: true }];
      R.emit = (t, d) => { R.conns.forEach(c => { try { if (c.open) c.send({ f: R.id, t, d }); } catch (e) { /* closed */ } }); return Promise.resolve(); };
      R.leave = () => { R.closed = true; clearTimeout(R.rt); try { R.peer && R.peer.destroy(); } catch (e) { /* gone */ } };
      const wire = c => {
        c.on('open', () => { R.conns.set(c.peer, c); R.opened = true; });
        c.on('data', m => { if (m && typeof m.t === 'string' && typeof m.f === 'string') (R.handlers[m.t] || []).forEach(f => f({ isMe: false, peer: m.f, data: m.d })); });
        c.on('close', () => { if (R.conns.get(c.peer) === c) R.conns.delete(c.peer); if (R.opened && !R.closed && !R.conns.size) err({ code: 'closed' }); });
        c.on('error', () => {});
      };
      let settled = false; const to = setTimeout(() => { if (!settled) { settled = true; R.leave(); reject({ code: 'timeout' }); } }, 15000);
      const ok = () => { if (!settled) { settled = true; clearTimeout(to); resolve(R); } };
      let p; try { p = R.peer = newPeer(role === 'host' ? hid : null); } catch (e) { clearTimeout(to); reject({ code: 'blocked' }); return; }
      p.on('error', e => {
        if (!settled) { settled = true; clearTimeout(to); R.leave(); reject({ code: (e && e.type) || 'error' }); }
        else if (e && e.type === 'network' || e && e.type === 'server-error') { /* the broker is only needed for the first handshake */ }
      });
      p.on('disconnected', () => { if (!R.closed) try { p.reconnect(); } catch (e) { /* gone */ } });
      p.on('open', id => {
        R.id = id; ok();
        if (role === 'host') p.on('connection', wire);
        else {
          const go = () => { if (R.closed || R.conns.size) return; try { wire(p.connect(hid, { reliable: true, serialization: 'json' })); } catch (e) { /* retry */ } R.rt = setTimeout(go, 2500); };
          go();
        }
      });
    });
  }
  /* ---------------------------------------------------------------------------------------------------------------
   * v209: websites meet and play through a RELAY: the site's own Lovable Cloud (Supabase Realtime). Both browsers keep one
   * ordinary secure websocket to it, so it works on any Wi-Fi or mobile network, no matter how strict the router is (direct
   * browser-to-browser links failed for some players). relayRooms has the same small room API as the artifact room
   * (join -> on / emit / peers / onPeers / presence / leave), so matchmaking and the match code run unchanged on it.
   * PeerJS stays as the fallback when the relay can't be reached. RUT.Net.relayCfg {url, key} overrides the address (tests).
   * ------------------------------------------------------------------------------------------------------------- */
  const RELAY = { url: 'https://c--f528583f-d6fa-4af9-8dce-6e5ecb466150-prod.lovable.cloud', key: 'sb_publishable_blG5qm30dLoYrwpNNCrl3g_rBElzxo1' };
  let relayCli = null, relayDown = 0;
  function relayClient() {
    if (relayCli) return relayCli;
    if (Date.now() < relayDown) return null;
    const lib = typeof window !== 'undefined' && window.supabase, cfg = Object.assign({}, RELAY, (RUT.Net && RUT.Net.relayCfg) || {});
    if (!lib || typeof lib.createClient !== 'function' || !cfg.url || typeof WebSocket !== 'function') return null;
    try { relayCli = lib.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { vsn: '1.0.0', timeout: 8000 } }); } catch (e) { relayCli = null; }
    return relayCli;
  }
  const relayRooms = {
    join(name) {
      return new Promise((resolve, reject) => {
        const cli = relayClient(); if (!cli) { reject({ code: 'no_relay' }); return; }
        const me = 'r' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
        const ch = cli.channel(String(name).replace(/[^a-z0-9_-]/gi, '').toLowerCase(), { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });
        const hs = {}, ph = [], er = []; let mine = {}, closed = false, settled = false;
        const list = () => {
          const st = ch.presenceState() || {}, out = [{ peer: me, presence: mine, sameTab: true, isMe: true, kind: 'viewer' }];
          Object.keys(st).forEach(k => { if (k === me) return; const m = st[k] && st[k][st[k].length - 1]; if (!m) return; const pr = Object.assign({}, m); delete pr.presence_ref; out.push({ peer: k, presence: pr, sameTab: false, isMe: false, kind: 'viewer' }); });
          return out;
        };
        const firePeers = () => { if (closed) return; const peers = list(); ph.slice().forEach(f => { try { f({ peers }); } catch (e) { /* handler */ } }); };
        ch.on('presence', { event: 'sync' }, firePeers);
        ch.on('broadcast', { event: 'm' }, msg => {
          const d = msg && msg.payload; if (closed || !d || typeof d.t !== 'string' || typeof d.f !== 'string' || d.f === me) return;
          (hs[d.t] || []).slice().forEach(f => { try { f({ isMe: false, sameTab: false, peer: d.f, data: d.d }); } catch (e) { /* handler */ } });
        });
        const R = {
          relay: true,
          emit: (t, d) => closed ? Promise.resolve() : Promise.resolve(ch.send({ type: 'broadcast', event: 'm', payload: { t, f: me, d } })).catch(() => {}),
          on: (t, fn, onErr) => { (hs[t] = hs[t] || []).push(fn); if (onErr) er.push(onErr); return () => { hs[t] = (hs[t] || []).filter(f => f !== fn); }; },
          peers: list,
          onPeers: (fn, onErr) => { ph.push(fn); if (onErr) er.push(onErr); return () => { const i = ph.indexOf(fn); if (i >= 0) ph.splice(i, 1); }; },
          presence: patch => { mine = Object.assign({}, mine, patch || {}); return closed ? Promise.resolve() : Promise.resolve(ch.track(mine)).catch(() => {}); },
          leave: () => { if (closed) return Promise.resolve(); closed = true; try { return Promise.resolve(cli.removeChannel(ch)).catch(() => {}); } catch (e) { return Promise.resolve(); } },
        };
        const to = setTimeout(() => { if (settled) return; settled = true; closed = true; relayDown = Date.now() + 60000; try { cli.removeChannel(ch); } catch (e) { /* gone */ } reject({ code: 'timeout' }); }, 9000);
        ch.subscribe(status => {
          if (status === 'SUBSCRIBED') { if (!settled) { settled = true; clearTimeout(to); resolve(R); } return; }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (!settled) { settled = true; clearTimeout(to); closed = true; relayDown = Date.now() + 60000; try { cli.removeChannel(ch); } catch (e) { /* gone */ } reject({ code: status }); }
            else if (!closed) er.slice().forEach(f => { try { f({ code: status === 'CLOSED' ? 'closed' : 'relay' }); } catch (e) { /* handler */ } });
          }
        });
      });
    },
  };

  /* ---------------------------------------------------------------------------------------------------------------
   * v234 (JODIO: "online doesn't work on Netlify"): dbRooms, the same room API over plain HTTPS requests to the site's database
   * (one RPC, rut_sync, that stores presence + messages; see retro-ut-tools/relay_db.sql). No websocket and no browser-to-browser
   * link, so nothing a router, firewall or Realtime setting does can block it. Each browser polls about 20 times a second in a
   * match (one request in flight at a time, messages batched), 3 times a second while queueing. Tried first on websites.
   * RUT.Net.dbCfg {url, key} overrides the address (tests).
   * ------------------------------------------------------------------------------------------------------------- */
  let dbDown = 0;
  const dbRooms = {
    ok() { return typeof fetch === 'function' && Date.now() >= dbDown && !(RUT.Net && RUT.Net.dbOff); },
    join(name) {
      const cfg = Object.assign({}, RELAY, (RUT.Net && RUT.Net.dbCfg) || {}), url = cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/rut_sync';
      const room = String(name).replace(/[^a-z0-9_-]/gi, '').toLowerCase().slice(0, 80);
      const me = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5);
      const hs = {}, ph = [], er = []; let mine = {}, presDirty = true, out = [], after = -1, peers = [], peerKey = '', closed = false, busy = false, fails = 0, fastUntil = 0, tm = 0, kick = null;
      const list = () => [{ peer: me, presence: mine, sameTab: true, isMe: true, kind: 'viewer' }].concat(peers.filter(p => p.p !== me).map(p => ({ peer: p.p, presence: p.pr || {}, sameTab: false, isMe: false, kind: 'viewer' })));
      const call = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key }, body: JSON.stringify(body), cache: 'no-store' })
        .then(r => { if (!r.ok) throw { code: 'http_' + r.status }; return r.json(); });
      const take = res => {
        if (closed || !res) return;
        if (typeof res.last === 'number' && after < 0) after = res.last;
        (res.msgs || []).forEach(m => { if (m.i <= after) return; after = m.i; const d = m.d; if (!d || typeof d.t !== 'string') return;
          (hs[d.t] || []).slice().forEach(f => { try { f({ isMe: false, sameTab: false, peer: m.f, data: d.d }); } catch (e) { /* handler */ } }); });
        if (res.peers) { peers = res.peers; const k = JSON.stringify(peers);
          if (k !== peerKey) { peerKey = k; const pl = list(); ph.slice().forEach(f => { try { f({ peers: pl }); } catch (e) { /* handler */ } }); } }
      };
      const poll = () => {
        if (closed || busy) return Promise.resolve(); busy = true; clearTimeout(tm);
        const batch = out.splice(0, 64), pres = presDirty ? mine : null; presDirty = false;
        return call({ p_room: room, p_me: me, p_pres: pres, p_after: after, p_out: batch.length ? batch : null, p_leave: false }).then(res => {
          busy = false; fails = 0; if (closed || !res) return; take(res); sched();
        }, e => {
          busy = false; out = batch.concat(out); if (pres) presDirty = true; if (closed) return;
          if (++fails >= 25) er.slice().forEach(f => { try { f({ code: 'relay' }); } catch (x) { /* handler */ } });
          sched(Math.min(1500, 150 * fails)); throw e;
        });
      };
      // a second request may go out while a read is in flight, so inputs never wait behind a slow read (messages are de-duplicated by id)
      let sending = false;
      const send = () => { if (sending || closed || !out.length) return; sending = true; const batch = out.splice(0, 64);
        call({ p_room: room, p_me: me, p_pres: null, p_after: after < 0 ? -1 : after, p_out: batch, p_leave: false }).then(res => { sending = false; take(res); if (out.length) send(); }, () => { sending = false; out = batch.concat(out); setTimeout(send, 100); }); };
      const sched = d => { if (closed) return; clearTimeout(tm); tm = setTimeout(() => poll().catch(() => {}), d != null ? d : out.length ? 0 : Date.now() < fastUntil ? 45 : 300); };
      const R = {
        relay: true, db: true,
        emit: (t, d) => { if (closed) return Promise.resolve(); out.push({ t, d }); fastUntil = Date.now() + 4000; if (!busy) sched(0); else send(); return Promise.resolve(); },
        on: (t, fn, onErr) => { (hs[t] = hs[t] || []).push(fn); if (onErr) er.push(onErr); return () => { hs[t] = (hs[t] || []).filter(f => f !== fn); }; },
        peers: list,
        onPeers: (fn, onErr) => { ph.push(fn); if (onErr) er.push(onErr); return () => { const i = ph.indexOf(fn); if (i >= 0) ph.splice(i, 1); }; },
        presence: patch => { mine = Object.assign({}, mine, patch || {}); presDirty = true; if (!busy && !closed) sched(0); return Promise.resolve(); },
        fast: on => { fastUntil = on ? Date.now() + 1e9 : 0; },
        leave: () => { if (closed) return Promise.resolve(); closed = true; clearTimeout(tm); return call({ p_room: room, p_me: me, p_pres: null, p_after: 0, p_out: null, p_leave: true }).catch(() => {}); },
      };
      return poll().then(() => R, e => { closed = true; clearTimeout(tm); dbDown = Date.now() + 30000; throw { code: (e && e.code) || 'no_db' }; });
    },
  };

  const QSLOTS = 6;
  Quick.prototype.startPeer = async function () {
    this.o.onStatus('Searching for an opponent...', 1);
    this.peers = new Set(); this.slot = 0; this.dead = new Map();
    this.loop();
    return true;
  };
  Quick.prototype.loop = async function () {
    const base = 'rutq1-' + (['duel', 'rivals', 'champs'].includes(this.o.mode) ? this.o.mode : 'club') + (this.o.region ? '-' + this.o.region : '') + '-';   // v207: Rivals and Champions have their own queues on the website too
    while (!this.closed && !this.done) {
      // v209 fix: a slot held by a player who froze or left without closing (a phone put to sleep, a killed tab) stays taken on the broker for a while.
      // Everyone used to keep retrying that dead slot, so two real players who did not start at the same moment never met. Dead slots are now skipped for 30 s.
      const id = base + this.slot, dt = this.dead.get(id);
      if (dt && dt > Date.now()) { this.slot = (this.slot + 1) % QSLOTS; if (this.slot === 0) await new Promise(res => setTimeout(res, 400)); continue; }
      const r = await this.trySlot(id);
      if (r === 'matched') return;
      this.slot = r === 'rescan' ? 0 : (this.slot + 1) % QSLOTS;
      if (r !== 'again' && r !== 'rescan') await new Promise(res => setTimeout(res, 400));
    }
  };
  /** One attempt: claim the id and wait (resolves 'again' after a few seconds on a slot above 0 so the waiting player rescans from slot 0), or connect to the waiting player there. */
  Quick.prototype.trySlot = function (id) {
    return new Promise(resolve => {
      let finished = false; const timers = [];
      const done = v => { if (finished) return; finished = true; timers.forEach(clearTimeout); resolve(v); };
      const mine = str(this.o.club, 20, 'Club'), rating = num(this.o.rating, 1, 99, 70);
      let p; try { p = newPeer(id); } catch (e) { this.o.onFail('Quick match is blocked in this browser.'); this.close(); done('matched'); return; }
      this.peers.add(p);
      const drop = q => { try { q.destroy(); } catch (e) { /* gone */ } this.peers.delete(q); };
      p.on('error', e => {
        if (e && e.type === 'unavailable-id') {                                  // somebody is waiting here: be their guest
          drop(p); let g; try { g = newPeer(null); } catch (x) { done('next'); return; }
          this.peers.add(g);
          const fail = dead => { if (dead) this.dead.set(id, Date.now() + 30000); drop(g); done('again'); };
          timers.push(setTimeout(() => fail(true), 12000));                       // v207: slow networks (mobile data, TURN relays) get longer to connect before trying again
          g.on('error', () => fail(true));
          g.on('open', () => {
            const c = g.connect(id, { reliable: true, serialization: 'json' });
            c.on('open', () => c.send({ k: 'hello', club: mine, rating }));
            c.on('data', m => {
              if (this.done || !m) return;
              if (m.k === 'busy') { fail(false); return; }
              if (m.k === 'code' && typeof m.code === 'string') { this.done = true; this.o.onMatch({ role: 'guest', code: normCode(m.code), peer: 'q' + m.code, club: str(m.club, 20, 'Opponent'), rating: num(m.rating, 1, 99, 70) }); setTimeout(() => { drop(g); }, 1500); done('matched'); }
            });
            c.on('close', () => { if (!this.done) fail(!c._ok); });
            c.on('data', () => { c._ok = true; });
          });
        } else if (e && (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed')) {
          if (!this.done && !this.closed) { this.o.onFail('Could not reach the matchmaking service. Check your internet connection, or use a Direct connection below.'); this.close(); } done('matched');
        } else { drop(p); done('next'); }
      });
      p.on('open', () => {                                                        // the slot is free: wait for a guest
        p.on('connection', c => {
          if (this.done || this.hosted) { c.on('open', () => { try { c.send({ k: 'busy' }); } catch (e) { /* gone */ } setTimeout(() => c.close(), 300); }); return; }
          this.hosted = c;
          c.on('data', m => {
            if (this.done || !m || m.k !== 'hello') return;
            this.done = true; const code = newCode();
            try { c.send({ k: 'code', code, club: mine, rating }); } catch (e) { /* gone */ }
            this.o.onMatch({ role: 'host', code, peer: 'q' + code, club: str(m.club, 20, 'Opponent'), rating: num(m.rating, 1, 99, 70) });
            setTimeout(() => { drop(p); }, 2500); done('matched');
          });
          c.on('close', () => { if (!this.done) this.hosted = null; });
        });
        if (id.slice(-2) !== '-0') timers.push(setTimeout(() => { drop(p); this.hosted = null; done('rescan'); }, 6000));      // above slot 0: rescan from the start so two waiting players cannot miss each other
      });
    });
  };
  /* ---------------------------------------------------------------------------------------------------------------
   * Quick match: automatic matchmaking. Everyone searching joins one shared queue room and publishes {st:'wait', s: since}
   * in their presence. All searching players are sorted by (since, peer) and paired 1-2, 3-4, ...: every page computes
   * the same pairs from the same list. A pair is only acted on once BOTH sides have published `to` = the other, so a
   * view that is a moment behind never starts a game alone. The earlier one hosts; the game code is derived from the two
   * peer labels, so nobody types anything.
   * ------------------------------------------------------------------------------------------------------------- */
  function quickCode(a, b) {
    const s = a + '|' + b; let h = 2166136261 >>> 0, out = '';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    for (let i = 0; i < 6; i++) { out += CODE_CHARS[h >>> 27]; h = (Math.imul(h, 1664525) + 1013904223) >>> 0; }
    return out;
  }
  /** opts = { mode:'club'|'duel', club, rating, skip:[peer], onStatus(text, online), onMatch({role, code, peer, club, rating}), onFail(text) } */
  function Quick(opts) { this.o = opts; this.closed = false; this.done = false; this.since = Date.now(); this.to = null; this.skip = new Set(opts.skip || []); }
  const Q = Quick.prototype;
  Q.start = async function () {
    let room = null;
    try { room = window.claude && window.claude.use ? await window.claude.use('room') : null; } catch (e) { room = null; }
    if (!room && dbRooms.ok()) {                                                   // v234: the database relay first (plain HTTPS, can't be blocked)
      try { this.q = await dbRooms.join('rut-q1-' + (['duel', 'rivals', 'champs'].includes(this.o.mode) ? this.o.mode : 'club') + (this.o.region ? '-' + this.o.region : '')); this.relay = true; } catch (e) { this.q = null; }
      if (this.q) return this.queueOn();
    }
    if (!room && relayClient()) {                                                  // v209: websites queue on the relay (works on every network); PeerJS only if it can't be reached
      try { this.q = await relayRooms.join('rut-q1-' + (['duel', 'rivals', 'champs'].includes(this.o.mode) ? this.o.mode : 'club') + (this.o.region ? '-' + this.o.region : '')); this.relay = true; } catch (e) { this.q = null; }
      if (this.q) return this.queueOn();
    }
    if (!room) { if (havePeer()) return this.startPeer(); this.o.onFail('Quick match could not start: the connection library did not load. Reload the page, or use a Direct connection below, which needs no account.'); return false; }
    try { this.q = await room.join('rut-q1-' + (['duel', 'rivals', 'champs'].includes(this.o.mode) ? this.o.mode : 'club') + (this.o.region ? '-' + this.o.region : '')); } catch (e) { this.o.onFail('Could not join the matchmaking room (' + ((e && e.code) || 'error') + '). Make sure the artifact is shared with you at Contributor level or higher.'); return false; }
    return this.queueOn();
  };
  Q.queueOn = function () {
    if (this.closed) { try { this.q.leave(); } catch (e) { /* gone */ } return false; }
    const onErr = e => { if (!this.closed && !this.done) { this.o.onFail('Lost the connection to matchmaking (' + ((e && e.code) || 'error') + ').'); this.close(); } };
    this.q.presence({ st: 'wait', s: this.since, c: str(this.o.club, 20, 'Club'), r: num(this.o.rating, 1, 99, 70), to: null }).catch(() => {});
    this.offP = this.q.onPeers(() => this.look(), onErr);
    this.timer = setInterval(() => this.look(), 800);
    this.o.onStatus('Searching for an opponent...', 1);
    return true;
  };
  Q.look = function () {
    if (this.closed || this.done || !this.q) return;
    const all = this.q.peers(), me = all.find(p => p.sameTab);
    if (!me) return;
    const ok = p => p.kind === 'viewer' && p.presence && p.presence.st === 'wait' && Number.isFinite(p.presence.s);
    const waiting = all.filter(p => ok(p) && (p.sameTab || !this.skip.has(p.peer))).sort((a, b) => a.presence.s - b.presence.s || (a.peer < b.peer ? -1 : 1));
    this.o.onStatus(waiting.length > 1 ? 'Opponent found...' : 'Searching for an opponent...', all.filter(p => p.kind === 'viewer').length);
    const i = waiting.findIndex(p => p.sameTab); if (i < 0) return;
    const partner = i % 2 === 0 ? waiting[i + 1] : waiting[i - 1], pid = partner ? partner.peer : null;
    if (pid !== this.to) { this.to = pid; this.q.presence({ to: pid }).catch(() => {}); }
    if (partner && partner.presence.to === me.peer && this.to === partner.peer) {
      this.done = true;
      const host = i % 2 === 0, hp = host ? me : partner, gp = host ? partner : me;
      this.q.presence({ st: 'busy', to: null }).catch(() => {});
      this.o.onMatch({ role: host ? 'host' : 'guest', code: quickCode(hp.peer, gp.peer), peer: partner.peer, club: str(partner.presence.c, 20, 'Opponent'), rating: num(partner.presence.r, 1, 99, 70) });
      setTimeout(() => this.close(), 4000);     // stay "busy" a moment so a partner whose view lags still finds the pair
    }
  };
  Q.close = function () {
    if (this.closed) return; this.closed = true; clearInterval(this.timer);
    try { this.offP && this.offP(); this.q && this.q.leave(); } catch (e) { /* already gone */ }
    if (this.peers) this.peers.forEach(pp => { try { pp.destroy(); } catch (e) { /* gone */ } });
  };

  window.RUT = window.RUT || {};
  RUT.Net = { Direct, Session, Quick, supported, newCode, normCode, cleanCard, cleanSquad, avgRating, relayClient };
})();
