/* =============================================================================
 * state.js  —  LocalStorage-backed game state
 * -----------------------------------------------------------------------------
 * One JSON blob under `retro_ut_99_save`. Holds coins, every owned item, the
 * club / unassigned / transfer-list piles, the active squad, the market
 * simulation, SBC + Evolution progress and match stats.
 *
 * An *item* is one owned copy of a card:
 *   { id:'i42', cardId:'p006', untradeable:false, evo:null|{...}, obtained:ts }
 * Duplicates are allowed (each copy is its own item).
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';
  let KEY = 'retro_ut_99_save';                       // per account once logged in (RUT.Auth)
  const VERSION = 1;
  const BASE_FORMATION = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'ST', 'RW']; // 4-3-3 (attack): the formation every AI side's cards are picked for
  const FORMATION = BASE_FORMATION.slice();            // the club's own XI layout: the same array object always, rewritten in place when the player changes formation
  // v97: formations the player can pick. Slot order follows the engine's FORMATIONS table (keeper, back line left to right, midfield, forwards).
  const FORMS = {
    '433': { name: '4-3-3', pos: BASE_FORMATION },
    '442': { name: '4-4-2', pos: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'] },
    '4231': { name: '4-2-3-1', pos: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'LW', 'CAM', 'RW', 'ST'] },
    '451': { name: '4-5-1', pos: ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CDM', 'CM', 'RM', 'ST'] },
    '352': { name: '3-5-2', pos: ['GK', 'CB', 'CB', 'CB', 'LM', 'CDM', 'CM', 'CM', 'RM', 'ST', 'ST'] },
    '343': { name: '3-4-3', pos: ['GK', 'CB', 'CB', 'CB', 'LM', 'CM', 'CM', 'RM', 'LW', 'ST', 'RW'] },
    '3331': { name: '3-3-3-1', pos: ['GK', 'CB', 'CB', 'CB', 'CM', 'CDM', 'CM', 'CAM', 'LW', 'ST', 'RW'] },
    '532': { name: '5-3-2', pos: ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CM', 'ST', 'ST'] },
    '541': { name: '5-4-1', pos: ['GK', 'LB', 'CB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST'] },
    '4121': { name: '4-1-2-1-2', pos: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'ST', 'ST'] },
    '3241': { name: '3-2-4-1', pos: ['GK', 'CB', 'CB', 'CB', 'CDM', 'CDM', 'LM', 'CAM', 'CAM', 'RM', 'ST'] },
    '4222': { name: '4-2-2-2', pos: ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CDM', 'CAM', 'CAM', 'ST', 'ST'] },
    '4321': { name: '4-3-2-1', pos: ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CDM', 'CM', 'CAM', 'CAM', 'ST'] },
  };

  function freshState() {
    return {
      version: VERSION, clubName: 'Retro FC', coins: 150000,
      items: {}, club: [], unassigned: [], transferList: [],
      tactics: { a: 2, m: 2, d: 2, trait: '' },
      squad: { formation: '4-3-3', slots: new Array(11).fill(null), bench: new Array(10).fill(null) },
      sbcStorage: [],          // SBC Duplicate Storage (max 100)
      dnf: 0,                  // matches quit early (reduce coin earnings)
      market: null,            // filled by RUT.Market.init()
      watchlist: [],           // listing ids the user has bid on
      sbcDone: {},             // sbcId -> times completed
      evos: { active: {} },    // itemId -> { evoId, progress:{...} }
      packsOwned: { starter: 1 },
      league: null,            // League mode: { code, season, titles, cur }
      stats: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
      nextItemId: 1, log: [],
    };
  }

  const State = {
    FORMATION, BASE_FORMATION, FORMS,
    setKey(k) { KEY = k; },
    data: null,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
      if (raw) {
        try { this.data = JSON.parse(raw); } catch (e) { this.data = null; }
      }
      if (!this.data || this.data.version !== VERSION) {
        this.data = freshState(); this.applyFormation();
        this.grantStarterSquad();
      }
      // forward-compatible defaults for saves made before v2 rules
      const d = this.data;
      if (!d.squad.bench) d.squad.bench = new Array(10).fill(null);
      while (d.squad.bench.length < 10) d.squad.bench.push(null);   // v229 (JODIO): 10 sub spots
      if (!d.sbcStorage) d.sbcStorage = [];
      if (d.dnf == null) d.dnf = 0;
      // one-off: PlayStyles are capped at 2 on gold cards and evolutions; every owned item that had more is trimmed and pays 15,000 coins
      if (!d.psCap) {
        let n = 0;
        Object.values(d.items).forEach(it => { const bc = RUT.DB.get(it.cardId); if (!bc) return; const c = this.card(it); const gp = a => a.filter(x => /\+$/.test(x)); const had = Math.max(bc.psRaw || 0, it.evo ? Array.from(new Set(gp(bc.playStyles).concat(gp(it.evo.boosts.ps)))).length : 0); if (c && bc.rating + (it.evo ? it.evo.boosts.rating : 0) >= 75 && had > 2) n++; });
        d.psCap = true;
        if (n) { d.coins += 15000 * n; this.log('PlayStyle cap: ' + n + ' card(s) trimmed to 2 PlayStyles, +' + (15000 * n).toLocaleString() + 'c'); d.psCapPaid = 15000 * n; }
      }
      // one-off (v149): cards under 86 carry one gold PlayStyle at most; every owned copy that lost one pays 15,000 coins
      if (!d.psCap86) {
        let n = 0;
        Object.values(d.items).forEach(it => { const bc = RUT.DB.get(it.cardId); if (bc && !it.evo && !bc.promo && bc.rating < 86 && (bc.psRaw || 0) >= 2) n++; });
        d.psCap86 = true;
        if (n) { d.coins += 15000 * n; this.log('PlayStyle limit (under 86 = one gold PlayStyle): ' + n + ' card(s) trimmed, +' + (15000 * n).toLocaleString() + 'c'); }
      }
      // one-off: cards that broke the pace rule (Rapid+ under 88 sprint speed / Quick Step+ under 88 acceleration) lose it, get no replacement and pay 10,000 coins each
      if (!d.paceFix) {
        let n = 0;
        Object.values(d.items).forEach(it => { const bc = RUT.DB.get(it.cardId); if (!bc) return; let bad = !!bc.psBroke;
          if (it.evo && !bad) { const c = this.card(it); bad = (it.evo.boosts.ps || []).some(x => (x === 'Rapid+' && c.sub.sprintSpeed < 88) || (x === 'Quick Step+' && c.sub.acceleration < 88)); }
          if (bad) n++; });
        d.paceFix = true;
        if (n) { d.coins += 10000 * n; this.log('Pace rule: ' + n + ' card(s) lost Rapid+/Quick Step+, +' + (10000 * n).toLocaleString() + 'c'); }
      }
      // one-off (v84c): the quests paid too much, so every account over 1,000,000 coins is set back to 350,000
      if (!d.coinCap350) { d.coinCap350 = true; if (d.coins > 1000000) { this.log('Coins over 1,000,000 set back to 350,000 (the quests paid too much): was ' + d.coins.toLocaleString()); d.coins = 350000; } }
      // (v162: the old line that made every owned card tradeable on each load is gone: packs now decide, see Packs.PACKS[id].untradeable)
      if (!d.tradeFix162) { d.tradeFix162 = true; Object.values(d.items).forEach(it => { it.untradeable = false; }); }   // one-off: every card owned before v162 stays tradeable
      Object.values(d.items).forEach(it => { if (it.promo && (it.promo.type === 'bdor' || it.promo.type === 'award' || it.promo.type === 'toty' || it.promo.type === 'tots')) it.untradeable = true; });   // v188 (JODIO): Ballon d'Or cards are untradeable
      // promo cards (TOTW, TOTS, POTM, flashback...) no longer exist: every owned one becomes that player's basic gold card
      { let n = 0; Object.values(d.items).forEach(it => { if (it.promo && (it.promo.type === 'nlpofm' || it.promo.type === 'nlstar' || it.promo.type === 'clpromo' || it.promo.type === 'lpotw' || it.promo.type === 'lpotm' || it.promo.type === 'bdor' || it.promo.type === 'award')) { if (!RUT.DB.get(it.cardId)) RUT.DB.registerPromo(it.promo.baseId, it.promo.type, it.promo.boost, it.cardId); } else if (it.promo) { if (RUT.DB.get(it.promo.baseId)) { it.cardId = it.promo.baseId; n++; } delete it.promo; } });
        if (n) this.log('Promo cards removed: ' + n + ' card(s) swapped for their basic gold versions'); }
      // (nothing left to re-register)
      Object.values(this.data.items).forEach(it => {
        if (it.promo && !RUT.DB.get(it.cardId)) RUT.DB.registerPromo(it.promo.baseId, it.promo.type, it.promo.boost, it.cardId);
      });
      this.applyFormation();
      return this.data;
    },

    /** v156 (JODIO): Unassigned holds 100 players at most; extras are deleted, lowest rating first (oldest first among equals), no coins paid. */
    UNASSIGNED_MAX: 100, lastTrim: 0,
    trimUnassigned() {
      const d = this.data; if (!d || !d.unassigned || d.unassigned.length <= this.UNASSIGNED_MAX) return 0;
      const rate = id => { const c = this.cardRaw(id); return c ? c.rating : 0; };
      const order = d.unassigned.map((id, i) => ({ id, i, r: rate(id) })).sort((a, b) => a.r - b.r || a.i - b.i);
      const drop = order.slice(0, d.unassigned.length - this.UNASSIGNED_MAX).map(x => x.id);
      drop.forEach(id => this.destroy(id));
      this.lastTrim += drop.length; this.log('Unassigned is full (100): ' + drop.length + ' lowest-rated player(s) deleted');
      return drop.length;
    },

    save() {
      this.trimUnassigned();
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); this._saveErr = 0; } catch (e) { console.warn('Save failed', e);   // v240: never lose progress silently
        if (!this._saveErr && RUT.toast) RUT.toast('Could not save on this device (storage full or blocked). Your cloud save is still kept.', 'bad'); this._saveErr = 1; }
    },

    reset() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      this.data = null; this.load(); RUT.Market.init(true); this.save();
    },

    /** A starter XI + bench of generated players so the user can play from minute one. */
    grantStarterSquad() {
      const pool = RUT.DB.reserves.filter(c => c.rating >= 64 && c.rating <= 74);
      const used = new Set();
      FORMATION.forEach((pos, i) => {
        const c = pool.find(p => p.position === pos && !used.has(p.id)) || pool.find(p => p.altPositions.includes(pos) && !used.has(p.id));
        if (!c) return;
        used.add(c.id);
        const it = this.newItem(c.id, { untradeable: true });
        this.data.club.push(it.id); this.data.squad.slots[i] = it.id;
      });
      // a few extra bronze/silver bodies for early SBCs
      RUT.DB.reserves.filter(c => c.rating < 70 && !used.has(c.id)).slice(0, 10).forEach(c => {
        const it = this.newItem(c.id, {}); this.data.club.push(it.id);
      });
    },

    newItem(cardId, opts) {
      opts = opts || {};
      const id = 'i' + (this.data.nextItemId++);
      const c0 = RUT.DB.get(cardId);
      const it = { id, cardId, untradeable: false, evo: null, obtained: Date.now(), chemStyle: c0 && c0.position === 'GK' ? 'wall' : 'basic' };
      if (opts.promo) it.promo = opts.promo;
      if (opts.untradeable) it.untradeable = true;
      this.data.items[id] = it;
      return it;
    },

    item(id) { return this.data.items[id]; },

    /** Resolve an item to its effective card (base card + any Evolution boosts). */
    card(itemOrId) { const c = this.cardRaw(itemOrId); return c && RUT.CL ? RUT.CL.apply(c) : c; },   // v96: Champions League form on top
    cardRaw(itemOrId) {
      const it = typeof itemOrId === 'string' ? this.data.items[itemOrId] : itemOrId;
      if (!it) return null;
      const base = RUT.DB.get(it.cardId);
      if (!base || !it.evo) return base;
      const b = it.evo.boosts, clamp = RUT.DB.clamp;
      const face = {}; Object.keys(base.face).forEach(k => { face[k] = clamp(base.face[k] + (b.face[k] || 0), 1, RUT.DB.faceCap ? RUT.DB.faceCap(Math.min(base.rating + (b.rating || 0), Math.max(94, base.rating))) : 99); });
      const sub = {}; Object.keys(base.sub).forEach(k => { sub[k] = clamp(base.sub[k] + (b.sub[k] || 0), 1, 99); });
      return Object.assign({}, base, {
        rating: clamp(base.rating + b.rating, 1, Math.max(94, base.rating)), face, sub, rarity: 'evo', evoLevel: it.evo.applied.length,
        playStyles: (() => { const e = RUT.DB.evoPs(base.playStyles, b.ps); return RUT.DB.psGate(clamp(base.rating + b.rating, 1, Math.max(94, base.rating)), sub, base.playStyles.concat(e.ps), e.ps, e.cap); })(),
      });
    },

    /** The club's formation key ('433', '442'...), or null for the default 4-3-3 (then the tactic trait picks the shape on the pitch). */
    formationKey() { const k = this.data && this.data.formation; return k && FORMS[k] ? k : null; },
    /** Rewrite the shared FORMATION array in place to the saved formation (the squad slots were saved in that layout already). */
    applyFormation() { const f = FORMS[this.formationKey() || '433'].pos; for (let i = 0; i < 11; i++) FORMATION[i] = f[i]; },
    /** Change the club's formation: the XI is re-seated, each player to a slot of his own position where he can, the rest out of position. */
    setFormation(key) {
      if (!FORMS[key]) return false;
      const d = this.data, old = d.squad.slots.filter(Boolean), pos = FORMS[key].pos, out = new Array(11).fill(null), left = old.slice();
      const take = (i, test) => { const k = left.findIndex(id => test(this.card(id))); if (k >= 0) { out[i] = left.splice(k, 1)[0]; return true; } return false; };
      for (let i = 0; i < 11; i++) take(i, c => c && c.position === pos[i]);
      for (let i = 0; i < 11; i++) if (!out[i]) take(i, c => c && c.altPositions.includes(pos[i]));
      for (let i = 0; i < 11 && left.length; i++) if (!out[i]) out[i] = left.shift();
      d.formation = key; d.squad.slots = out; this.applyFormation(); this.save(); return true;
    },

    /** Remove an item from every pile (club, unassigned, transfer list, squad). */
    detach(itemId) {
      const d = this.data;
      ['club', 'unassigned', 'transferList', 'sbcStorage'].forEach(k => { d[k] = (d[k] || []).filter(x => x !== itemId); });
      d.squad.slots = d.squad.slots.map(x => (x === itemId ? null : x));
      d.squad.bench = (d.squad.bench || []).map(x => (x === itemId ? null : x));
      delete d.evos.active[itemId];
    },

    destroy(itemId) { this.detach(itemId); delete this.data.items[itemId]; },

    /** Is another copy of this card (same base player) already in the main club? */
    isDuplicate(itemId) {
      const it = this.data.items[itemId]; if (!it) return false;
      const key = (RUT.DB.get(it.cardId) || {}).baseId || it.cardId;
      return this.data.club.some(id => { if (id === itemId) return false; const o = this.data.items[id]; const c = o && RUT.DB.get(o.cardId); return c && (c.baseId || c.id) === key && c.id === it.cardId; });
    },

    /**
     * Duplicate Item Protocol: a duplicate can't coexist in the main club.
     * Returns { isValid, error? }.
     */
    moveToClub(itemId) {
      const it = this.data.items[itemId];
      if (!it) return { isValid: false, error: 'Item not found.' };
      if (this.isDuplicate(itemId)) {
        return { isValid: false, error: it.untradeable
          ? 'Duplicate (untradeable): store it in SBC Storage, use it in an SBC, or quick sell it for 0 coins.'
          : 'Duplicate (tradeable): list it on the Transfer Market or quick sell it.' };
      }
      this.detach(itemId); this.data.club.push(itemId);
      return { isValid: true };
    },

    toSbcStorage(itemId) {
      const d = this.data;
      if (d.sbcStorage.length >= 100) return { isValid: false, error: 'SBC Storage is full (100 items).' };
      if (!this.isDuplicate(itemId)) return { isValid: false, error: 'Only duplicates can go to SBC Storage.' };
      this.detach(itemId); d.sbcStorage.push(itemId);
      return { isValid: true };
    },

    setChemStyle(itemId, style) {
      const it = this.data.items[itemId];
      if (!it || !RUT.DB.CHEM_STYLES[style]) return { isValid: false, error: 'Unknown chemistry style.' };
      const gk = RUT.DB.get(it.cardId).position === 'GK', gkStyle = ['wall', 'cat'].includes(style);
      if (gk !== gkStyle) return { isValid: false, error: gk ? 'Goalkeepers can only use GK styles (Wall, Cat).' : 'GK styles are for goalkeepers only.' };
      it.chemStyle = style; this.save();
      return { isValid: true };
    },

    /** Starting XI as the match engine sees it: chemistry styles applied by each player's chem. */
    matchCards() {
      const cards = this.squadCards();
      const chem = RUT.SBC.chemistry(cards);
      return cards.map((c, i) => { if (!c) return c; const m = RUT.DB.applyChemStyle(c, this.data.items[this.data.squad.slots[i]].chemStyle, chem.perPlayer[i]), r = this.slotRole(i), od = this.data.items[this.data.squad.slots[i]].order; return (r || od) ? Object.assign({}, m, r ? { role: r } : {}, od ? { order: od } : {}) : m; });
    },
    /** The role chosen for the player in XI slot i (null = Auto, the best fit). A role that doesn't belong to the slot's position group is ignored. */
    slotRole(i) {
      const g = RUT.roleGroup(FORMATION[i]), d = this.data;
      if (d.tacMode !== 'classic' && d.fctac && RUT.Engine) {   // v210: FC 27 tactics: the role + focus set for this position, else the preset's role for the position group
        const fr = (d.fctac.roles || {})[i], P = RUT.Engine.FC_PRESETS[d.fctac.base || d.fctac.preset] || {}, pr = (P.roles || RUT.Engine.FC_PRESETS.s.roles)[g];
        if (fr && RUT.roleFits(RUT.ROLE_BY[fr], g)) return fr;
        if (pr && RUT.roleFits(RUT.ROLE_BY[pr], g)) return pr;
      }
      const it = d.items[d.squad.slots[i]], r = it && it.role, role = r && RUT.ROLE_BY ? RUT.ROLE_BY[r] : null;
      return role && RUT.roleFits(role, g) ? r : null;
    },
    /** Give a club item a role (null = Auto). The role goes with the player, wherever he plays. */
    setItemRole(itemId, key) { const it = this.data.items[itemId]; if (!it) return; if (key) it.role = key; else delete it.role; this.save(); },
    /** v117: a standing order for a player (stay back, run to goal...; null = none). Goes with the player. */
    setItemOrder(itemId, key) { const it = this.data.items[itemId]; if (!it) return; if (key) it.order = key; else delete it.order; this.save(); },
    benchCards() { return (this.data.squad.bench || []).map(id => (id ? this.card(id) : null)).filter(Boolean); },

    addCoins(n, why) { this.data.coins += n; if (why) this.log(why + (n >= 0 ? ' +' : ' ') + n.toLocaleString() + 'c'); },

    canAfford(n) { return this.data.coins >= n; },

    log(msg) { this.data.log.unshift({ t: Date.now(), msg }); this.data.log.length = Math.min(this.data.log.length, 40); },

    /** Quick-sell price (instant coins, like FUT's discard value). */
    quickSellValue(card, item) {
      if (item && item.untradeable) return 0; // FC rule: untradeables quick sell for 0
      if (card.rating < 65) return 50 + (card.rating - 50) * 5;
      if (card.rating < 75) return 150 + (card.rating - 65) * 15;
      return Math.min(5000, 400 + Math.pow(card.rating - 74, 2) * 25);
    },

    squadCards() { return this.data.squad.slots.map(id => (id ? this.card(id) : null)); },

    isInSquad(itemId) { return this.data.squad.slots.includes(itemId) || (this.data.squad.bench || []).includes(itemId); },
  };

  RUT.State = State;
})();
