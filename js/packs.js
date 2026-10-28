/* =============================================================================
 * packs.js  —  Store, pack odds & Evolutions
 * -----------------------------------------------------------------------------
 * Packs draw from the live database with weighted rating bands. Results land in
 * the unassigned pile; the UI plays a 16-bit walkout when the best item is 86+.
 *
 * Evolutions take an eligible low-rated card through objectives that are
 * progressed by matches (RUT.Evo.onMatch) and permanently boost the item.
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';

  /* -------------------------------- Packs -------------------------------- */
  // bands: [minRating, maxRating, weight]
  const PACKS = {
    starter: { id: 'starter', name: 'Starter Pack', price: 0, count: 11, tier: 'silver', bands: [[60, 64, 30], [65, 74, 60], [75, 79, 10]], storeHidden: true },
    bronze:  { id: 'bronze', name: 'Bronze Pack', price: 750, count: 8, tier: 'bronze', bands: [[50, 64, 100]] },
    silver:  { id: 'silver', name: 'Silver Pack', price: 20000, count: 8, tier: 'silver', bands: [[65, 74, 100]] },
    gold:    { id: 'gold', name: 'Gold Pack', price: 60000, count: 6, tier: 'gold', nlpofmChance: 0.0025, clChance: 0.015, nlstarChance: 0.02, bands: [[75, 79, 62], [80, 82, 26], [83, 85, 9], [86, 87, 2.3], [88, 99, 0.12]] },
    premium: { id: 'premium', name: 'Premium Gold Pack', price: 80000, count: 12, tier: 'gold', guaranteeMin: 82, nlpofmChance: 0.006, clChance: 0.04, nlstarChance: 0.05, bands: [[75, 79, 52], [80, 82, 30], [83, 85, 13], [86, 87, 4.2], [88, 99, 0.25]] },
    // Published odds: 84+ player 100% · 88+ player 18.5% (promo cards were removed from the game)
    elite:   { id: 'elite', name: 'Elite Gold Pack', price: 100000, count: 12, tier: 'gold', guaranteeMin: 86, nlpofmChance: 0.018, clChance: 0.09, nlstarChance: 0.1, bands: [[83, 85, 52], [86, 87, 45], [88, 99, 3]] },   // the best Gold pack
    promo:   { id: 'promo', name: 'Promo Pack', price: 300000, count: 5, tier: 'promo', guaranteeMin: 85, topChance: 0.08, nlpofmChance: 0.07, clChance: 0.25, nlstarChance: 0.3, bands: [[84, 85, 42], [86, 87, 52], [88, 99, 6]],   // v193 (JODIO): 88+ nerfed (was topChance 0.185, band 15)
               odds: ['85+ player: 100%', '88+ player: 8%', 'NLPOFM card: 7%', 'Nations League Star card: 30%', 'CL promo card: 25%'] },
    // v99: more packs. `pos` limits the pack to those positions.
    jumbo:   { id: 'jumbo', name: 'Jumbo Gold Pack', price: 190000, count: 20, tier: 'gold', guaranteeMin: 87, nlpofmChance: 0.03, clChance: 0.14, nlstarChance: 0.15, bands: [[83, 85, 26], [86, 87, 65], [88, 99, 9]],
               odds: ['20 players', '87+ player: 100%', '88+ player: about 9% a slot', 'CL promo card: 14%', 'Nations League Star: 15%'] },
    attack:  { id: 'attack', name: 'Attacker Pack', price: 90000, count: 8, tier: 'gold', pos: ['ST', 'CF', 'LW', 'RW'], guaranteeMin: 82, clChance: 0.04, bands: [[75, 79, 48], [80, 82, 32], [83, 85, 15], [86, 87, 4.7], [88, 99, 0.3]],
               odds: ['Strikers and wingers only', '82+ player: 100%'] },
    mid:     { id: 'mid', name: 'Midfielder Pack', price: 90000, count: 8, tier: 'gold', pos: ['CAM', 'CM', 'CDM', 'LM', 'RM'], guaranteeMin: 82, clChance: 0.04, bands: [[75, 79, 48], [80, 82, 32], [83, 85, 15], [86, 87, 4.7], [88, 99, 0.3]],
               odds: ['Midfielders only', '82+ player: 100%'] },
    defend:  { id: 'defend', name: 'Defender Pack', price: 80000, count: 8, tier: 'gold', pos: ['CB', 'LB', 'RB', 'LWB', 'RWB'], guaranteeMin: 82, clChance: 0.04, bands: [[75, 79, 48], [80, 82, 32], [83, 85, 15], [86, 87, 4.7], [88, 99, 0.3]],
               odds: ['Defenders only', '82+ player: 100%'] },
    keeper:  { id: 'keeper', name: 'Goalkeeper Pack', price: 45000, count: 5, tier: 'silver', pos: ['GK'], guaranteeMin: 80, bands: [[70, 79, 35], [80, 82, 40], [83, 85, 18], [86, 87, 6], [88, 99, 1]],
               odds: ['Goalkeepers only', '80+ keeper: 100%'] },
    // v120: more packs in the 100k-200k range (odds in the lines below; 88+ stays rare)
    prime:   { id: 'prime', name: 'Prime Gold Pack', price: 120000, count: 14, tier: 'gold', guaranteeMin: 86, nlpofmChance: 0.02, clChance: 0.1, nlstarChance: 0.12, bands: [[83, 85, 38], [86, 87, 57], [88, 99, 5]],   // v144: every pricier pack has better odds per card than the one below it
               odds: ['14 players', '86+ player: 100%', '88+ player: about 5% a slot', 'CL promo card: 10%', 'Nations League Star: 12%'] },
    strikerx: { id: 'strikerx', name: 'Elite Attacker Pack', price: 130000, count: 8, tier: 'gold', pos: ['ST', 'CF', 'LW', 'RW'], guaranteeMin: 86, clChance: 0.08, bands: [[83, 85, 50], [86, 87, 43], [88, 99, 7]],
               odds: ['Strikers and wingers only', '86+ player: 100%'] },
    midx:    { id: 'midx', name: 'Elite Midfielder Pack', price: 130000, count: 8, tier: 'gold', pos: ['CAM', 'CM', 'CDM', 'LM', 'RM'], guaranteeMin: 86, clChance: 0.08, bands: [[83, 85, 50], [86, 87, 43], [88, 99, 7]],
               odds: ['Midfielders only', '86+ player: 100%'] },
    defx:    { id: 'defx', name: 'Elite Defender Pack', price: 120000, count: 8, tier: 'gold', pos: ['CB', 'LB', 'RB', 'LWB', 'RWB'], guaranteeMin: 86, clChance: 0.08, bands: [[83, 85, 50], [86, 87, 43], [88, 99, 7]],
               odds: ['Defenders only', '86+ player: 100%'] },
    gkx:     { id: 'gkx', name: 'Elite Goalkeeper Pack', price: 100000, count: 5, tier: 'gold', pos: ['GK'], guaranteeMin: 85, bands: [[83, 85, 55], [86, 87, 35], [88, 99, 10]],
               odds: ['Goalkeepers only', '85+ keeper: 100%'] },
    mega:    { id: 'mega', name: 'Mega Gold Pack', price: 160000, count: 16, tier: 'gold', guaranteeMin: 86, nlpofmChance: 0.025, clChance: 0.12, nlstarChance: 0.14, bands: [[83, 85, 32], [86, 87, 61], [88, 99, 7]],
               odds: ['16 players', '86+ player: 100%', '88+ player: about 7% a slot', 'CL promo card: 12%', 'Nations League Star: 14%'] },
    titan:   { id: 'titan', name: 'Titan Pack', price: 200000, count: 24, tier: 'gold', guaranteeMin: 87, nlpofmChance: 0.04, clChance: 0.16, nlstarChance: 0.18, bands: [[83, 85, 20], [86, 87, 69], [88, 99, 11]],
               odds: ['24 players', '87+ player: 100%', '88+ player: about 11% a slot', 'CL promo card: 16%', 'Nations League Star: 18%'] },
    cl:      { id: 'cl', name: 'Champions League Pack', price: 600000, count: 5, tier: 'cl', guaranteeMin: 84, clChance: 1, bands: [[80, 82, 45], [83, 85, 40], [86, 87, 15]],
               odds: ['1 Champions League promo card: 100%', '89+ Champions League card: about 65% (was 23%)', '84+ player: 100%'] },
    nl:      { id: 'nl', name: 'Nations League Pack', price: 450000, count: 5, tier: 'nl', guaranteeMin: 84, nlstarChance: 1, nlpofmChance: 0.1, bands: [[80, 82, 45], [83, 85, 40], [86, 87, 15]],
               odds: ['1 Nations League Star card: 100%', '84+ player: 100%', 'NLPOFM card: 10%'] },
    // v155 (700k since v158): Ballon d'Or pack. Any Ballon d'Or card 16.5% since v163 (ranks 11-30 14%, top 10 2%, top 3 0.5%), 5 cards, 86+ guaranteed
    bdor:    { id: 'bdor', name: "Ballon d'Or Pack", price: 300000, count: 5, tier: 'bdor', guaranteeMin: 86, bdorChance: [0.002, 0.008, 0.02, 0.15], awardChance: 0.02, bands: [[84, 85, 45], [86, 87, 51], [88, 99, 4]], bdorUntradeable: true,   // v189 (JODIO): fewer 88+ golds, BdO cards untradeable; v191 nerfed (any BdO card 30.5% -> 18%)
               odds: ['5 players', '86+ player: 100%', '88+ gold: 4%', "Any Ballon d'Or card: 18%", "Ballon d'Or rank 15-30 or Ronaldo HM: 15%", "Ballon d'Or rank 11-14: 2%", "Ballon d'Or top 10 (rank 4-10): 0.8%", "Ballon d'Or top 3 (95 OVR): 0.2%", "Award winner card (94): 2%", "Ballon d'Or cards are untradeable and only come from this pack"] },
    // v191 (JODIO): 7M Guaranteed Ballon d'Or pack: one Ballon d'Or card every time, top 10 very rare
    bdorg:   { id: 'bdorg', name: "Guaranteed Ballon d'Or Pack", price: 3000000, count: 5, tier: 'bdor', guaranteeMin: 86, bdorChance: [0.01, 0.05, 0.185, 0.755], awardChance: 0.05, bands: [[84, 85, 45], [86, 87, 51], [88, 99, 4]], bdorUntradeable: true,
               odds: ['5 players', "Ballon d'Or card: 100%", "Ballon d'Or rank 15-30 or Ronaldo HM: 75.5%", "Ballon d'Or rank 11-14: 18.5%", "Ballon d'Or top 10 (rank 4-10): 5%", "Ballon d'Or top 3 (95-96 OVR): 1%", "Award winner card (94): 5%", "Ballon d'Or cards are untradeable"] },
  };

  // v155: every pack under 200,000 coins pays out less: 88+ weight x0.5, 86-87 x0.8, 83-85 x0.9 and promo chances x0.7 (the shown odds are recomputed)
  // v162 (JODIO): some packs give tradeable players, some untradeable (untradeables cannot be listed or sold, only used in squads, SBCs and evolutions)
  ['starter', 'bronze', 'silver', 'gold', 'premium', 'attack', 'mid', 'defend', 'keeper', 'cl', 'nl'].forEach(id => { if (PACKS[id]) PACKS[id].untradeable = true; });

  Object.values(PACKS).forEach(p => {
    if (!p.price || p.price >= 200000 || p.nerfed155) return;
    const tot0 = p.bands.reduce((a, b) => a + b[2], 0);
    p.bands = p.bands.map(b => [b[0], b[1], b[2] * (b[0] >= 88 ? 0.5 : b[0] >= 86 ? 0.8 : b[0] >= 83 ? 0.9 : 1)]);
    ['nlpofmChance', 'nlstarChance', 'clChance'].forEach(k => { if (p[k]) p[k] = Math.round(p[k] * 0.7 * 10000) / 10000; });
    const tot = p.bands.reduce((a, b) => a + b[2], 0), top = p.bands.filter(b => b[0] >= 88).reduce((a, b) => a + b[2], 0) / tot * 100;
    if (p.odds) p.odds = p.odds.map(t => t.replace(/about [\d.]+% a slot/, 'about ' + (Math.round(top * 10) / 10) + '% a slot').replace(/(CL promo card|Nations League Star): \d+%/, (m, n) => { const k = n === 'CL promo card' ? p.clChance : p.nlstarChance; return n + ': ' + Math.round(k * 1000) / 10 + '%'; }));
    p.nerfed155 = true;
  });

  function pickBand(bands, r) {
    const total = bands.reduce((a, b) => a + b[2], 0);
    let x = r() * total;
    for (const b of bands) { if ((x -= b[2]) <= 0) return b; }
    return bands[bands.length - 1];
  }

  function drawCard(bands, r, pos) {
    for (let tries = 0; tries < 10; tries++) {
      const b = pickBand(bands, r);
      const pool = RUT.DB.all.filter(c => !c.promo && c.rating >= b[0] && c.rating <= b[1] && (!pos || pos.includes(c.position)));
      if (pool.length) return pool[Math.floor(r() * pool.length)];
    }
    const any = RUT.DB.all.filter(c => !c.promo && (!pos || pos.includes(c.position)));
    return any.length ? any[Math.floor(r() * any.length)] : RUT.DB.reserves[0];
  }

  /** The weaker version of a pack for SBC rewards: the 83+ bands lose weight (86+ lose most), the guaranteed rating is 2 lower, promo cards are rarer. */
  function nerfed(def) {
    const o = Object.assign({}, def);
    o.bands = def.bands.map(b => [b[0], b[1], b[2] * (b[0] >= 88 ? 0.06 : b[0] >= 86 ? 0.15 : b[0] >= 83 ? 0.4 : 1)]);   // v192 (JODIO): SBC packs nerfed again (was 0.15 / 0.3 / 0.6)
    if (def.guaranteeMin) o.guaranteeMin = Math.max(75, def.guaranteeMin - 3);
    if (def.topChance) o.topChance = def.topChance * 0.2;
    ['nlpofmChance', 'nlstarChance', 'clChance', 'bdorChance'].forEach(k => { if (Array.isArray(def[k])) o[k] = def[k].map(v => v * 0.15); else if (def[k] && def[k] < 1) o[k] = def[k] * 0.15; });
    o.nerfTop = true;
    return o;
  }

  /** v160 (JODIO): Champions League cards rated 89+ are likelier: their weight is x6 in the Champions League pack and x2.5 in every other pack that can hold one (88+ was 28% of the CL cards). */
  function clPick(r, mult) {
    const L = RUT.CL.promoBase, w = L.map(id => { const c = RUT.DB.registerPromo(id, 'clpromo', 4); return c && c.rating >= 89 ? mult : 1; });
    let x = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < L.length; i++) { if ((x -= w[i]) <= 0) return L[i]; }
    return L[L.length - 1];
  }

  /**
   * Open a pack the user owns (or buys on the spot).
   * Returns { ok, items:[itemId...] sorted best-first, walkout:boolean }.
   */
  const PACK_FREE = 7, PACK_FEE = 200000;
  function open(packId, opts) {
    opts = opts || {};
    const st = RUT.State.data; let def = PACKS[packId];
    if (!def) return { ok: false, isValid: false, msg: 'Pack Failed: unknown pack.' };
    // v193 (JODIO): after 7 packs opened in a day (any pack, bought or owned) each further one costs a 200,000 fee
    const dk = (d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate())(new Date());
    if (!st.packDay || st.packDay.d !== dk) st.packDay = { d: dk, n: 0 };
    const pFee = 0;                                                               // v207 (JODIO): the extra-pack fee is gone; packs opened are still counted
    if (pFee && st.coins < pFee + (opts.buy ? def.price : 0)) return { ok: false, isValid: false, msg: 'Pack Failed: ' + PACK_FREE + ' packs opened today, each extra pack costs a ' + PACK_FEE.toLocaleString() + ' coin fee' + (opts.buy ? ' on top of its price' : '') + '.' };
    if (opts.buy) {
      if (st.coins < def.price) return { ok: false, isValid: false, msg: 'Pack Failed: not enough coins (' + def.price.toLocaleString() + ' needed).' };
      st.coins -= def.price;
    } else {
      if (!st.packsOwned[packId]) return { ok: false, msg: 'You do not own this pack' };
      st.packsOwned[packId]--;
    }
    st.packDay.n++; if (pFee) st.coins -= pFee;
    const r = opts.random || Math.random;
    // v100: a pack won from an SBC has weaker odds for high-rated players (opened before bought or quest packs of the same kind)
    let nerf = false;
    if (!opts.buy && st.sbcPacks && st.sbcPacks[packId] > 0) { st.sbcPacks[packId]--; nerf = true; }
    if (nerf) def = nerfed(def);
    const cards = [];
    for (let i = 0; i < def.count; i++) cards.push(drawCard(def.bands, r, def.pos));
    if (def.guaranteeMin && !cards.some(c => c.rating >= def.guaranteeMin)) {
      cards[0] = drawCard(def.bands.filter(b => b[1] >= def.guaranteeMin).map(b => [Math.max(b[0], def.guaranteeMin), b[1], b[2]]), r, def.pos);
    }
    // published-odds slot: 88+ at topChance, otherwise 84-87 (guaranteed 84+)
    if (def.topChance) cards[0] = r() < def.topChance ? drawCard([[88, 99, 1]], r, def.pos) : drawCard(def.nerfTop ? [[def.guaranteeMin || 82, 85, 1]] : [[def.guaranteeMin >= 85 ? 85 : 84, 87, 1]], r, def.pos);
    // one roll per pack for an FC Promo (TOTW pixel-frame, +2) upgrade of the best pull
    let promoIdx = -1;
    if (def.promoChance && r() < def.promoChance) { promoIdx = 0; cards.forEach((c, i) => { if (c.rating > cards[promoIdx].rating) promoIdx = i; }); }
    let nlIdx = -1, nlBase = null;
    if (def.nlpofmChance && r() < def.nlpofmChance) { const ids = Object.keys(RUT.DB.NLPOFM); nlBase = ids[Math.floor(r() * ids.length)]; nlIdx = 0; cards.forEach((c, i) => { if (c.rating < cards[nlIdx].rating) nlIdx = i; }); }   // an NLPOFM card takes the place of the weakest pull
    let nsIdx = -1, nsBase = null;
    if (def.nlstarChance && r() < def.nlstarChance) { const ids = RUT.DB.NLSTAR_IDS; nsBase = ids[Math.floor(r() * ids.length)]; cards.forEach((c, i) => { if (i !== nlIdx && (nsIdx < 0 || c.rating < cards[nsIdx].rating)) nsIdx = i; }); }
    let clIdx = -1, clBase = null;     // a Champions League promo card takes the place of the weakest pull that is not already a promo
    if (def.clChance && RUT.CL && RUT.CL.promoBase.length && r() < def.clChance) { clBase = clPick(r, def.id === 'cl' ? 6 : 2.5); cards.forEach((c, i) => { if (i !== nlIdx && i !== nsIdx && (clIdx < 0 || c.rating < cards[clIdx].rating)) clIdx = i; }); }
    let bdIdx = -1, bdRank = 0;   // a Ballon d'Or card takes the place of the weakest pull
    if (def.bdorChance && RUT.DB.BDOR_IDS) {
      const x = r(), bc = def.bdorChance, c3 = bc[0], c10 = c3 + bc[1], c14 = bc.length > 3 ? c10 + bc[2] : c10, call = c14 + (bc.length > 3 ? bc[3] : bc[2]);
      if (x < call) { bdRank = x < c3 ? 1 + Math.floor(r() * 3) : x < c10 ? 4 + Math.floor(r() * 7) : x < c14 ? 11 + Math.floor(r() * 4) : (bc.length > 3 ? 15 : 11) + Math.floor(r() * (RUT.DB.BDOR_IDS.length - (bc.length > 3 ? 14 : 10))); bdIdx = 0; cards.forEach((c, i) => { if (c.rating < cards[bdIdx].rating) bdIdx = i; }); }
    }
    let awIdx = -1, awN = 0;   // v197: an award winner card (Gerd Müller, Kopa, Yashin) takes the place of the weakest other pull
    if (def.awardChance && RUT.DB.AWARD_IDS && r() < def.awardChance) { const ids = RUT.DB.AWARD_IDS; awN = 1 + Math.floor(r() * ids.length); if (ids[awN - 1]) cards.forEach((c, i) => { if (i !== bdIdx && (awIdx < 0 || c.rating < cards[awIdx].rating)) awIdx = i; }); }
    const ut = !!def.untradeable;
    const items = cards.map((c, i) => {
      if (i === awIdx) { const baseId = RUT.DB.AWARD_IDS[awN - 1], card = RUT.DB.registerPromo(baseId, 'award', awN); return RUT.State.newItem(card.id, { promo: { baseId, type: 'award', boost: awN }, untradeable: true }); }
      if (i === bdIdx) { const baseId = RUT.DB.BDOR_IDS[bdRank - 1], card = RUT.DB.registerPromo(baseId, 'bdor', bdRank); return RUT.State.newItem(card.id, { promo: { baseId, type: 'bdor', boost: bdRank  }, untradeable: ut || !!def.bdorUntradeable }); }
      if (i === clIdx) { const card = RUT.DB.registerPromo(clBase, 'clpromo', 4); return RUT.State.newItem(card.id, { promo: { baseId: clBase, type: 'clpromo', boost: 4  }, untradeable: ut }); }
      if (i === nsIdx) { const card = RUT.DB.registerPromo(nsBase, 'nlstar', 3); return RUT.State.newItem(card.id, { promo: { baseId: nsBase, type: 'nlstar', boost: 3  }, untradeable: ut }); }
      if (i === nlIdx) { const card = RUT.DB.registerPromo(nlBase, 'nlpofm', 5); return RUT.State.newItem(card.id, { promo: { baseId: nlBase, type: 'nlpofm', boost: 5  }, untradeable: ut }); }
      if (i === promoIdx) {
        const promo = RUT.DB.registerPromo(c.id, 'totw', 2);
        return RUT.State.newItem(promo.id, { promo: { baseId: c.id, type: 'totw', boost: 2 }, untradeable: true });
      }
      return RUT.State.newItem(c.id, { untradeable: ut });
    });
    items.sort((a, b) => RUT.State.card(b).rating - RUT.State.card(a).rating);
    items.forEach(it => st.unassigned.push(it.id));
    const best = RUT.State.card(items[0]);
    try { RUT.Quests && RUT.Quests.event('pack', { packId, best: best.rating }); } catch (e) { /* quests are optional */ }
    RUT.State.log('Opened ' + def.name + ' — best: ' + best.name + ' ' + best.rating);
    RUT.State.save();
    const dupes = items.filter(i => RUT.State.isDuplicate(i.id)).map(i => i.id);
    return { ok: true, isValid: true, items: items.map(i => i.id), dupes, walkout: best.rating >= 86 || best.rarity === 'promo' || !!RUT.DB.signatureFor(best), best };
  }

  /* ------------------------------ Evolutions ----------------------------- */
  const EVOS = [
    { id: 'pace_merchant', name: 'Pace Merchant', desc: 'Turn a forward into a Rapid+ burner.',
      eligible: c => c.position !== 'GK' && c.rating <= 82 && c.face.pac <= 88 && c.sub.sprintSpeed >= 84 && ['ST', 'LW', 'RW', 'LM', 'RM', 'CAM'].includes(c.position),
      eligText: 'Attacker · OVR ≤ 82 · PAC ≤ 88 · Sprint Speed ≥ 84',
      objectives: [{ key: 'played', label: 'Play 2 matches', target: 2 }, { key: 'goals', label: 'Score 3 team goals', target: 3 }],
      boosts: { rating: 2, face: { pac: 4, dri: 2, sho: 1 }, sub: { acceleration: 4, sprintSpeed: 4, agility: 2, finishing: 1 }, ps: ['Rapid+'] } },
    { id: 'maestro', name: 'Midfield Maestro', desc: 'Pinged Pass+ for your engine room.',
      eligible: c => ['CM', 'CDM', 'CAM'].includes(c.position) && c.rating <= 80,
      eligText: 'CM / CDM / CAM · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'won', label: 'Win 1 match', target: 1 }],
      boosts: { rating: 2, face: { pas: 4, dri: 2 }, sub: { shortPassing: 4, vision: 4, longPassing: 3, ballControl: 2 }, ps: ['Pinged Pass+'] } },
    { id: 'wall', name: 'The Wall', desc: 'Bruiser+ defender upgrade.',
      eligible: c => ['CB', 'LB', 'RB'].includes(c.position) && c.rating <= 80,
      eligText: 'CB / LB / RB · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 2 matches', target: 2 }, { key: 'cleanSheets', label: 'Keep 1 clean sheet', target: 1 }],
      boosts: { rating: 2, face: { def: 4, phy: 3 }, sub: { standingTackle: 4, slidingTackle: 4, strength: 3, defAwareness: 3 }, ps: ['Bruiser+'] } },

    // --- 15 more Evolutions: from free to very expensive (the price is paid in coins when you start one) ---
    { id: 'poacher', name: 'Box Poacher', desc: 'A free finishing touch for a goalscorer.', cost: 0,
      eligible: c => ['ST', 'CF'].includes(c.position) && c.rating <= 78,
      eligText: 'ST / CF · OVR ≤ 78',
      objectives: [{ key: 'played', label: 'Play 2 matches', target: 2 }, { key: 'goals', label: 'Score 2 team goals', target: 2 }],
      boosts: { rating: 1, face: { sho: 3 }, sub: { finishing: 4, positioning: 4, composure: 2 }, ps: [] } },
    { id: 'clinical', name: 'Clinical Finisher', desc: 'Finesse Shot+ and sharper finishing for a forward.', cost: 5000,
      eligible: c => ['ST', 'CF', 'LW', 'RW'].includes(c.position) && c.rating <= 84,
      eligText: 'ST / CF / LW / RW · OVR ≤ 84',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'goals', label: 'Score 4 team goals', target: 4 }],
      boosts: { rating: 2, face: { sho: 4, dri: 1 }, sub: { finishing: 5, shotPower: 3, composure: 3, volleys: 3 }, ps: ['Finesse Shot+'] } },
    { id: 'sniper', name: 'Long Range Sniper', desc: 'Power Shot+ from outside the box.', cost: 8000,
      eligible: c => ['CAM', 'CM', 'LM', 'RM', 'LW', 'RW', 'CDM'].includes(c.position) && c.rating <= 82,
      eligText: 'Midfielder / winger · OVR ≤ 82',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'goals', label: 'Score 3 team goals', target: 3 }],
      boosts: { rating: 2, face: { sho: 4, phy: 1 }, sub: { longShots: 6, shotPower: 4, curve: 3 }, ps: ['Power Shot+'] } },
    { id: 'engine', name: 'Box-to-Box Engine', desc: 'Relentless+ stamina for a midfield workhorse.', cost: 10000,
      eligible: c => ['CM', 'CDM', 'CAM'].includes(c.position) && c.rating <= 82,
      eligText: 'CM / CDM / CAM · OVR ≤ 82',
      objectives: [{ key: 'played', label: 'Play 4 matches', target: 4 }, { key: 'won', label: 'Win 2 matches', target: 2 }],
      boosts: { rating: 2, face: { phy: 4, pac: 2 }, sub: { stamina: 6, strength: 3, aggression: 3, sprintSpeed: 2 }, ps: ['Relentless+'] } },
    { id: 'architect', name: 'Deep Lying Architect', desc: 'Long Ball Pass+ from the base of midfield.', cost: 12000,
      eligible: c => ['CDM', 'CM'].includes(c.position) && c.rating <= 80,
      eligText: 'CDM / CM · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'won', label: 'Win 2 matches', target: 2 }],
      boosts: { rating: 2, face: { pas: 5, def: 1 }, sub: { longPassing: 6, vision: 4, shortPassing: 3, reactions: 2 }, ps: ['Long Ball Pass+'] } },
    { id: 'fullback', name: 'Marauding Fullback', desc: 'Whipped Pass+ and legs for a wide defender.', cost: 14000,
      eligible: c => ['LB', 'RB', 'LWB', 'RWB'].includes(c.position) && c.rating <= 80,
      eligText: 'LB / RB / LWB / RWB · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'won', label: 'Win 2 matches', target: 2 }],
      boosts: { rating: 2, face: { pac: 4, pas: 2 }, sub: { crossing: 6, stamina: 4, sprintSpeed: 4, acceleration: 3 }, ps: ['Whipped Pass+'] } },
    { id: 'magician', name: 'Street Magician', desc: 'Trickster+ dribbling for a creative attacker.', cost: 15000,
      eligible: c => ['LW', 'RW', 'CAM', 'LM', 'RM'].includes(c.position) && c.rating <= 80,
      eligText: 'Winger / CAM · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'goals', label: 'Score 3 team goals', target: 3 }],
      boosts: { rating: 2, face: { dri: 5, pac: 1 }, sub: { dribbling: 5, agility: 5, balance: 4, ballControl: 4 }, ps: ['Trickster+'] } },
    { id: 'sweeper', name: 'Ball-Playing Defender', desc: 'Incisive Pass+ from the back line.', cost: 18000,
      eligible: c => ['CB', 'CDM'].includes(c.position) && c.rating <= 80,
      eligText: 'CB / CDM · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'cleanSheets', label: 'Keep 1 clean sheet', target: 1 }],
      boosts: { rating: 2, face: { pas: 4, def: 2 }, sub: { shortPassing: 4, longPassing: 5, interceptions: 4, composure: 3 }, ps: ['Incisive Pass+'] } },
    { id: 'colossus', name: 'Aerial Colossus', desc: 'Precision Header+ for a towering centre-back.', cost: 20000,
      eligible: c => c.position === 'CB' && c.rating <= 82,
      eligText: 'CB · OVR ≤ 82',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'cleanSheets', label: 'Keep 2 clean sheets', target: 2 }],
      boosts: { rating: 2, face: { phy: 5, def: 3 }, sub: { headingAccuracy: 6, jumping: 6, strength: 5, defAwareness: 2 }, ps: ['Precision Header+'] } },
    { id: 'shotstopper', name: 'Shot Stopper', desc: 'Far Reach+ and sharper reflexes for a goalkeeper.', cost: 25000,
      eligible: c => c.position === 'GK' && c.rating <= 84,
      eligText: 'GK · OVR ≤ 84',
      objectives: [{ key: 'played', label: 'Play 3 matches', target: 3 }, { key: 'cleanSheets', label: 'Keep 2 clean sheets', target: 2 }],
      boosts: { rating: 2, face: { phy: 2 }, sub: { gkDiving: 5, gkReflexes: 5, gkHandling: 4, gkPositioning: 4, reactions: 3 }, ps: ['Far Reach+'] } },
    { id: 'target_man', name: 'Target Man', desc: 'Bruiser+ strength and heading for a big striker.', cost: 30000,
      eligible: c => ['ST', 'CF'].includes(c.position) && c.rating <= 85,
      eligText: 'ST / CF · OVR ≤ 85',
      objectives: [{ key: 'played', label: 'Play 4 matches', target: 4 }, { key: 'goals', label: 'Score 5 team goals', target: 5 }],
      boosts: { rating: 2, face: { phy: 5, sho: 2 }, sub: { strength: 6, headingAccuracy: 5, jumping: 4, finishing: 2 }, ps: ['Bruiser+'] } },
    { id: 'ice_cold', name: 'Ice Cold', desc: 'Dead Ball+ composure from the spot and on free kicks.', cost: 40000,
      eligible: c => c.position !== 'GK' && c.rating <= 82,
      eligText: 'Outfield · OVR ≤ 82',
      objectives: [{ key: 'played', label: 'Play 4 matches', target: 4 }, { key: 'goals', label: 'Score 4 team goals', target: 4 }],
      boosts: { rating: 1, face: { sho: 3, pas: 2 }, sub: { penalties: 8, composure: 6, fkAccuracy: 6, curve: 4 }, ps: ['Dead Ball+'] } },
    { id: 'lockdown', name: 'Lockdown Defender', desc: 'Anticipate+ and Jockey+: nothing gets past.', cost: 60000,
      eligible: c => ['CB', 'LB', 'RB', 'CDM'].includes(c.position) && c.rating <= 84,
      eligText: 'CB / LB / RB / CDM · OVR ≤ 84',
      objectives: [{ key: 'played', label: 'Play 5 matches', target: 5 }, { key: 'cleanSheets', label: 'Keep 3 clean sheets', target: 3 }],
      boosts: { rating: 3, face: { def: 5, pac: 3, phy: 2 }, sub: { standingTackle: 5, interceptions: 5, defAwareness: 5, reactions: 3 }, ps: ['Anticipate+', 'Jockey+'] } },
    { id: 'rising_star', name: 'Rising Star', desc: 'A young talent grows into a star.', cost: 100000,
      eligible: c => c.position !== 'GK' && c.rating <= 80 && (c.details && c.details.age != null ? c.details.age <= 21 : false),
      eligText: 'Outfield · age ≤ 21 · OVR ≤ 80',
      objectives: [{ key: 'played', label: 'Play 5 matches', target: 5 }, { key: 'won', label: 'Win 3 matches', target: 3 }, { key: 'goals', label: 'Score 5 team goals', target: 5 }],
      boosts: { rating: 4, face: { pac: 3, sho: 3, pas: 3, dri: 3, def: 3, phy: 3 }, sub: { acceleration: 3, sprintSpeed: 3, finishing: 3, shortPassing: 3, dribbling: 3, ballControl: 3, strength: 3 }, ps: ['Technical+'] } },
    { id: 'legend', name: 'Legendary Upgrade', desc: 'The ultimate step for a world-class player.', cost: 250000,
      eligible: c => c.position !== 'GK' && c.rating >= 84 && c.rating <= 90,
      eligText: 'Outfield · OVR 84-90',
      objectives: [{ key: 'played', label: 'Play 8 matches', target: 8 }, { key: 'won', label: 'Win 5 matches', target: 5 }, { key: 'goals', label: 'Score 10 team goals', target: 10 }],
      boosts: { rating: 3, face: { pac: 2, sho: 3, pas: 3, dri: 3, def: 2, phy: 2 }, sub: { finishing: 3, vision: 3, ballControl: 3, dribbling: 3, composure: 4, reactions: 3 }, ps: ['First Touch+'] } },
    // --- v120: 10 expensive Evolutions (150,000 to 600,000 coins), for strong cards ---
    { id: 'elite_finisher', name: 'Elite Finisher', desc: 'Finesse Shot+ and Power Shot+ for a top forward.', cost: 150000,
      eligible: c => ['ST', 'CF', 'LW', 'RW'].includes(c.position) && c.rating >= 80 && c.rating <= 86,
      eligText: 'ST / CF / LW / RW · OVR 80-86',
      objectives: [{ key: 'played', label: 'Play 6 matches', target: 6 }, { key: 'goals', label: 'Score 8 team goals', target: 8 }],
      boosts: { rating: 3, face: { sho: 4, pac: 2, dri: 2 }, sub: { finishing: 5, shotPower: 4, longShots: 4, composure: 4 }, ps: ['Finesse Shot+', 'Power Shot+'] } },
    { id: 'midfield_general', name: 'Midfield General', desc: 'Pinged Pass+ and Tiki Taka+ for a top midfielder.', cost: 180000,
      eligible: c => ['CM', 'CDM', 'CAM'].includes(c.position) && c.rating >= 80 && c.rating <= 86,
      eligText: 'CM / CDM / CAM · OVR 80-86',
      objectives: [{ key: 'played', label: 'Play 6 matches', target: 6 }, { key: 'won', label: 'Win 4 matches', target: 4 }],
      boosts: { rating: 3, face: { pas: 5, dri: 3, def: 2 }, sub: { shortPassing: 5, longPassing: 5, vision: 5, ballControl: 4 }, ps: ['Pinged Pass+', 'Tiki Taka+'] } },
    { id: 'iron_wall', name: 'Iron Wall', desc: 'Bruiser+ and Anticipate+ for a top centre-back.', cost: 200000,
      eligible: c => ['CB'].includes(c.position) && c.rating >= 80 && c.rating <= 86,
      eligText: 'CB · OVR 80-86',
      objectives: [{ key: 'played', label: 'Play 6 matches', target: 6 }, { key: 'cleanSheets', label: 'Keep 4 clean sheets', target: 4 }],
      boosts: { rating: 3, face: { def: 5, phy: 4, pac: 2 }, sub: { standingTackle: 5, slidingTackle: 4, interceptions: 5, defAwareness: 5, strength: 4 }, ps: ['Bruiser+', 'Anticipate+'] } },
    { id: 'wing_wizard', name: 'Wing Wizard', desc: 'Trickster+ and Whipped Pass+ for a top winger.', cost: 220000,
      eligible: c => ['LW', 'RW', 'LM', 'RM'].includes(c.position) && c.rating >= 78 && c.rating <= 86,
      eligText: 'LW / RW / LM / RM · OVR 78-86',
      objectives: [{ key: 'played', label: 'Play 7 matches', target: 7 }, { key: 'goals', label: 'Score 9 team goals', target: 9 }],
      boosts: { rating: 3, face: { dri: 5, pac: 3, pas: 3 }, sub: { dribbling: 5, agility: 5, crossing: 5, curve: 4, sprintSpeed: 2 }, ps: ['Trickster+', 'Whipped Pass+'] } },
    { id: 'sweeper_keeper', name: 'Sweeper Keeper', desc: 'Far Reach+ and a huge step up for a top goalkeeper.', cost: 250000,
      eligible: c => c.position === 'GK' && c.rating >= 78 && c.rating <= 88,
      eligText: 'GK · OVR 78-88',
      objectives: [{ key: 'played', label: 'Play 7 matches', target: 7 }, { key: 'cleanSheets', label: 'Keep 5 clean sheets', target: 5 }],
      boosts: { rating: 4, face: { pac: 4, sho: 4, pas: 4, dri: 4, phy: 3 }, sub: { gkDiving: 6, gkReflexes: 6, gkHandling: 5, gkPositioning: 5, gkKicking: 5 }, ps: ['Far Reach+'] } },
    { id: 'dead_ball_king', name: 'Dead Ball King', desc: 'Dead Ball+ and Power Shot+ from set pieces and distance.', cost: 280000,
      eligible: c => c.position !== 'GK' && c.rating >= 80 && c.rating <= 88,
      eligText: 'Outfield · OVR 80-88',
      objectives: [{ key: 'played', label: 'Play 8 matches', target: 8 }, { key: 'goals', label: 'Score 10 team goals', target: 10 }],
      boosts: { rating: 2, face: { sho: 4, pas: 3 }, sub: { fkAccuracy: 10, penalties: 10, longShots: 6, curve: 6, shotPower: 4, composure: 4 }, ps: ['Dead Ball+', 'Power Shot+'] } },
    { id: 'complete_forward', name: 'Complete Forward', desc: 'First Touch+ and Technical+ for an 84-90 striker.', cost: 320000,
      eligible: c => ['ST', 'CF'].includes(c.position) && c.rating >= 84 && c.rating <= 90,
      eligText: 'ST / CF · OVR 84-90',
      objectives: [{ key: 'played', label: 'Play 8 matches', target: 8 }, { key: 'won', label: 'Win 5 matches', target: 5 }, { key: 'goals', label: 'Score 12 team goals', target: 12 }],
      boosts: { rating: 3, face: { sho: 3, pac: 2, dri: 3, pas: 3, phy: 2 }, sub: { finishing: 4, positioning: 4, ballControl: 4, dribbling: 3, heading: 3, composure: 4 }, ps: ['First Touch+', 'Technical+'] } },
    { id: 'metronome', name: 'The Metronome', desc: 'Incisive Pass+ and Pinged Pass+ for an 84-90 playmaker.', cost: 380000,
      eligible: c => ['CM', 'CDM', 'CAM'].includes(c.position) && c.rating >= 84 && c.rating <= 90,
      eligText: 'CM / CDM / CAM · OVR 84-90',
      objectives: [{ key: 'played', label: 'Play 9 matches', target: 9 }, { key: 'won', label: 'Win 6 matches', target: 6 }],
      boosts: { rating: 3, face: { pas: 4, dri: 3, def: 2, phy: 2 }, sub: { shortPassing: 4, longPassing: 5, vision: 5, ballControl: 4, composure: 4, stamina: 3 }, ps: ['Incisive Pass+', 'Pinged Pass+'] } },
    { id: 'fullback_legend', name: 'Fullback Legend', desc: 'Whipped Pass+ and Relentless+ for an 82-90 full-back.', cost: 450000,
      eligible: c => ['LB', 'RB', 'LWB', 'RWB'].includes(c.position) && c.rating >= 82 && c.rating <= 90,
      eligText: 'LB / RB / LWB / RWB · OVR 82-90',
      objectives: [{ key: 'played', label: 'Play 9 matches', target: 9 }, { key: 'cleanSheets', label: 'Keep 4 clean sheets', target: 4 }],
      boosts: { rating: 3, face: { pac: 3, def: 4, pas: 3, phy: 3 }, sub: { crossing: 5, stamina: 5, standingTackle: 4, interceptions: 4, sprintSpeed: 2, shortPassing: 3 }, ps: ['Whipped Pass+', 'Relentless+'] } },
    { id: 'ballon_dor', name: 'Golden Ball', desc: 'The most expensive upgrade: a world-class outfielder becomes a monster.', cost: 600000,
      eligible: c => c.position !== 'GK' && c.rating >= 86 && c.rating <= 91,
      eligText: 'Outfield · OVR 86-91',
      objectives: [{ key: 'played', label: 'Play 12 matches', target: 12 }, { key: 'won', label: 'Win 8 matches', target: 8 }, { key: 'goals', label: 'Score 15 team goals', target: 15 }],
      boosts: { rating: 4, face: { pac: 3, sho: 4, pas: 4, dri: 4, def: 3, phy: 3 }, sub: { finishing: 4, vision: 4, ballControl: 4, dribbling: 4, composure: 5, reactions: 4, shortPassing: 4 }, ps: ['First Touch+', 'Technical+'] } },
  ];
  const MAX_ACTIVE_EVOS = 3;

  function startEvo(evoId, itemId) {
    const st = RUT.State.data, evo = EVOS.find(e => e.id === evoId);
    const it = st.items[itemId];
    if (!evo || !it) return { ok: false, msg: 'Invalid evolution' };
    if (st.evos.active[itemId]) return { ok: false, msg: 'Item is already evolving' };
    if (Object.keys(st.evos.active).length >= MAX_ACTIVE_EVOS) return { ok: false, msg: 'Max ' + MAX_ACTIVE_EVOS + ' active Evolutions' };
    if (it.evo && it.evo.applied.includes(evoId)) return { ok: false, msg: 'Already completed this Evolution' };
    if (!evo.eligible(RUT.State.card(it))) return { ok: false, msg: 'Card is not eligible' };
    const cost = evo.cost || 0;
    if (cost > st.coins) return { ok: false, msg: 'Not enough coins: ' + evo.name + ' costs ' + cost.toLocaleString() + '.' };
    if (cost) RUT.State.addCoins(-cost, 'Evolution: ' + evo.name);
    st.evos.active[itemId] = { evoId, progress: {} };
    RUT.State.save();
    return { ok: true, msg: RUT.State.card(it).name + ' started ' + evo.name + (cost ? ' (−' + cost.toLocaleString() + ' coins)' : '') };
  }

  /**
   * Called after each match with { won, goalsFor, goalsAgainst }. Only evolving
   * players who were in the starting XI progress. Completed evos apply boosts.
   */
  function onMatch(result) {
    const st = RUT.State.data, done = [];
    Object.keys(st.evos.active).forEach(itemId => {
      if (!RUT.State.isInSquad(itemId)) return;
      const a = st.evos.active[itemId], evo = EVOS.find(e => e.id === a.evoId);
      const p = a.progress;
      p.played = (p.played || 0) + 1;
      p.goals = (p.goals || 0) + result.goalsFor;
      p.won = (p.won || 0) + (result.won ? 1 : 0);
      p.cleanSheets = (p.cleanSheets || 0) + (result.goalsAgainst === 0 ? 1 : 0);
      if (evo.objectives.every(o => (p[o.key] || 0) >= o.target)) {
        const it = st.items[itemId];
        it.evo = it.evo || { applied: [], boosts: { rating: 0, face: {}, sub: {}, ps: [] } };
        const b = it.evo.boosts;
        b.rating += evo.boosts.rating;
        Object.entries(evo.boosts.face).forEach(([k, v]) => { b.face[k] = (b.face[k] || 0) + v; });
        Object.entries(evo.boosts.sub).forEach(([k, v]) => { b.sub[k] = (b.sub[k] || 0) + v; });
        b.ps = Array.from(new Set(b.ps.concat(evo.boosts.ps)));
        it.evo.applied.push(evo.id);
        delete st.evos.active[itemId];
        done.push(RUT.State.card(it).name + ' completed ' + evo.name + '!');
        RUT.State.log('Evolution complete: ' + RUT.State.card(it).name + ' (' + evo.name + ')');
        try { RUT.Quests && RUT.Quests.event('evo'); } catch (e) { /* quests are optional */ }
      }
    });
    return done;
  }

  RUT.Packs = { PACKS, open };
  RUT.Evo = { EVOS, MAX_ACTIVE_EVOS, startEvo, onMatch };
})();
