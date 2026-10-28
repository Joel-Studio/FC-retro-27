/* =============================================================================
 * sbc.js  —  Phase 3: Squad Building Challenge engine
 * -----------------------------------------------------------------------------
 * Contains the two core squad maths routines (shared with the Squad screen):
 *
 *   squadRating(ratings[11])  — FC's weighted formula: every player rated above
 *                               the squad average adds their excess on top of the
 *                               raw sum, which is why one 90 lifts a squad more
 *                               than two 85s.
 *   chemistry(cards[11])      — FC 24+ chemistry: 0–3 per player, max 33. Points
 *                               come from club / nation / league counts of
 *                               players who are IN POSITION.
 *
 * and the SBC validator:
 *   validate(sbc, itemIds[11]) -> { ok, rating, chem, results:[{label, pass, detail}] }
 *   submit(sbcId, itemIds[11]) -> consumes the cards and grants the reward.
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';

  /* ------------------------------ Ratings -------------------------------- */
  /**
   * Weighted squad rating (the community-documented FUT formula):
   *   sum   = Σ rating
   *   avg   = sum / 11
   *   extra = Σ max(0, rating − avg)
   *   team  = floor((sum + extra) / 11), but a remainder ≥ .96 rounds up (FUT quirk)
   * Empty slots count as 0, so incomplete squads rate low.
   */
  function squadRating(ratings) {
    const r = ratings.slice(0, 11); while (r.length < 11) r.push(0);
    const sum = r.reduce((a, b) => a + b, 0);
    const avg = sum / 11;
    const extra = r.reduce((a, b) => a + Math.max(0, b - avg), 0);
    const raw = (sum + extra) / 11;
    const frac = raw - Math.floor(raw);
    return frac >= 0.96 ? Math.ceil(raw) : Math.floor(raw);
  }
  /** Unrounded version, handy for the UI ("80.7 → need +0.3"). */
  function squadRatingExact(ratings) {
    const r = ratings.slice(0, 11); while (r.length < 11) r.push(0);
    const sum = r.reduce((a, b) => a + b, 0), avg = sum / 11;
    return (sum + r.reduce((a, b) => a + Math.max(0, b - avg), 0)) / 11;
  }

  /* ----------------------------- Chemistry ------------------------------- */
  // thresholds: [players needed for 1 pt, 2 pts, 3 pts]
  const CHEM_THRESHOLDS = { club: [2, 4, 7], nation: [2, 5, 8], league: [3, 5, 8] }; // FC 27 thresholds
  function pts(count, th) { return count >= th[2] ? 3 : count >= th[1] ? 2 : count >= th[0] ? 1 : 0; }

  /**
   * @param cards     array of 11 card objects (or null) in FORMATION order
   * @param formation array of 11 slot positions
   * @returns { perPlayer:number[11], onPos:boolean[11], total:number }
   */
  function chemistry(cards, formation) {
    formation = formation || RUT.State.FORMATION;
    const onPos = cards.map((c, i) => !!c && c.altPositions.includes(formation[i]));
    const count = { club: {}, nation: {}, league: {} };
    cards.forEach((c, i) => {
      if (!c || !onPos[i]) return;
      count.club[c.club] = (count.club[c.club] || 0) + 1;
      count.nation[c.nation] = (count.nation[c.nation] || 0) + 1;
      count.league[c.league] = (count.league[c.league] || 0) + 1;
    });
    const perPlayer = cards.map((c, i) => {
      if (!c || !onPos[i]) return 0;
      return Math.min(3,
        pts(count.club[c.club], CHEM_THRESHOLDS.club) +
        pts(count.nation[c.nation], CHEM_THRESHOLDS.nation) +
        pts(count.league[c.league], CHEM_THRESHOLDS.league));
    });
    return { perPlayer, onPos, total: perPlayer.reduce((a, b) => a + b, 0) };
  }

  /* --------------------------- Requirements ------------------------------ */
  /**
   * Each requirement type is a pure function (cards[], ctx) -> {pass, detail}.
   * ctx = { rating, chem } is pre-computed once per validation.
   */
  const countBy = (cards, key) => cards.reduce((m, c) => { if (c) m[c[key]] = (m[c[key]] || 0) + 1; return m; }, {});
  const maxOf = obj => Math.max(0, ...Object.values(obj));
  const LNAME = code => (RUT.DB.LEAGUES[code] || { name: code }).name;

  const RULES = {
    minRating: (cards, ctx, r) => ({ pass: ctx.rating >= r.value, detail: ctx.rating + ' / ' + r.value, label: 'Squad Rating: Min ' + r.value }),
    minChem: (cards, ctx, r) => ({ pass: ctx.chem >= r.value, detail: ctx.chem + ' / ' + r.value, label: 'Total Chemistry: Min ' + r.value }),
    minLeague: (cards, ctx, r) => { const n = cards.filter(c => c && c.league === r.league).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: LNAME(r.league) + ': Min ' + r.count + ' Players' }; },
    minNation: (cards, ctx, r) => { const n = cards.filter(c => c && c.nation === r.nation).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Nation ' + r.nation + ': Min ' + r.count + ' Players' }; },
    maxSameClub: (cards, ctx, r) => { const n = maxOf(countBy(cards, 'club')); return { pass: n <= r.count, detail: 'max ' + n, label: 'Same Club: Max ' + r.count + ' Players' }; },
    minSameLeague: (cards, ctx, r) => { const n = maxOf(countBy(cards, 'league')); return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Same League: Min ' + r.count + ' Players' }; },
    minSameNation: (cards, ctx, r) => { const n = maxOf(countBy(cards, 'nation')); return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Same Nation: Min ' + r.count + ' Players' }; },
    maxSameNation: (cards, ctx, r) => { const n = maxOf(countBy(cards, 'nation')); return { pass: n <= r.count, detail: 'max ' + n, label: 'Same Nation: Max ' + r.count + ' Players' }; },
    minUniqueLeagues: (cards, ctx, r) => { const n = Object.keys(countBy(cards, 'league')).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Leagues: Min ' + r.count }; },
    minUniqueNations: (cards, ctx, r) => { const n = Object.keys(countBy(cards, 'nation')).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Nations: Min ' + r.count }; },
    minRarity: (cards, ctx, r) => {
      const ok = c => c && (r.rarity === 'gold' ? c.rating >= 75 : r.rarity === 'silver' ? c.rating >= 65 && c.rating < 75 : c.rating < 65);
      const n = cards.filter(ok).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: r.rarity.toUpperCase() + ' Players: Min ' + r.count };
    },
    minRare: (cards, ctx, r) => { const n = cards.filter(c => c && c.rare).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Rare Players: Min ' + r.count }; },
    minRareGold: (cards, ctx, r) => { const n = cards.filter(c => c && c.rare && c.rating >= 75).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Rare Gold Items: Min ' + r.count }; },
    minPlayerRating: (cards, ctx, r) => { const n = cards.filter(c => c && c.rating >= r.value).length; return { pass: n >= r.count, detail: n + ' / ' + r.count, label: 'Min ' + r.count + ' Players rated ' + r.value + '+' }; },
  };

  /* ------------------------------ SBC list ------------------------------- */
  const SBCS = [
    { id: 'bronze_up', name: 'Bronze Upgrade', group: 'Upgrades', repeatable: true, desc: 'Turn 11 bronze bodies into a Silver Pack.',
      reqs: [{ type: 'minRarity', rarity: 'bronze', count: 11 }], reward: { type: 'pack', packId: 'silver' } },
    { id: 'silver_swap', name: 'Silver Swap', group: 'Upgrades', repeatable: true, desc: '11 silvers in, one Gold Pack out.',
      reqs: [{ type: 'minRarity', rarity: 'silver', count: 11 }], reward: { type: 'pack', packId: 'gold' } },
    { id: 'premier_puzzle', name: 'Premier Puzzle', group: 'Foundations', repeatable: false, desc: 'An English-flavoured warm-up.',
      reqs: [{ type: 'minLeague', league: 'EPL', count: 3 }, { type: 'minRating', value: 72 }, { type: 'minChem', value: 12 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'hybrid_nations', name: 'Hybrid Nations', group: 'Foundations', repeatable: false, desc: 'Mix your passports.',
      reqs: [{ type: 'minUniqueNations', count: 5 }, { type: 'maxSameNation', count: 3 }, { type: 'minRating', value: 74 }, { type: 'minChem', value: 10 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'league_loyalty', name: 'League Loyalty', group: 'Advanced', repeatable: false, desc: 'Eight from one league, full chemistry focus.',
      reqs: [{ type: 'minSameLeague', count: 8 }, { type: 'minRating', value: 77 }, { type: 'minChem', value: 22 }, { type: 'maxSameClub', count: 4 }], reward: { type: 'pack', packId: 'promo' } },
    { id: 'marquee', name: 'Marquee Matchups', group: 'Advanced', repeatable: true, desc: 'Le Clásico de France vs España.',
      reqs: [{ type: 'minNation', nation: 'FRA', count: 1 }, { type: 'minNation', nation: 'ESP', count: 1 }, { type: 'minRating', value: 79 }, { type: 'minRareGold', count: 4 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'elite_eight', name: 'Elite Eight', group: 'Advanced', repeatable: false, desc: 'Prove you can afford the big boys.',
      reqs: [{ type: 'minRating', value: 82 }, { type: 'minPlayerRating', value: 84, count: 3 }, { type: 'minUniqueLeagues', count: 2 }], reward: { type: 'pack', packId: 'promo' } },
    { id: 'potm_wirtz', name: 'POTM: Florian Wirtz', group: 'Players', repeatable: false, desc: 'Player of the Month — a boosted pixel-frame Wirtz (+3).',
      reqs: [{ type: 'minRating', value: 84 }, { type: 'minLeague', league: 'EPL', count: 2 }, { type: 'minChem', value: 16 }], reward: { type: 'card', baseId: 'p006', promo: 'potm', boost: 3 } },
    { id: 'flashback_kane', name: 'Flashback: Harry Kane', group: 'Players', repeatable: false, desc: 'Retro-frame Kane (+2) for a German-heavy squad.',
      reqs: [{ type: 'minRating', value: 83 }, { type: 'minLeague', league: 'BUN', count: 3 }, { type: 'minChem', value: 18 }], reward: { type: 'card', baseId: 'p105', promo: 'flashback', boost: 2 } },
    // --- more upgrades and foundations ---
    { id: 'gold_rush', name: 'Gold Rush', group: 'Upgrades', repeatable: true, desc: 'Eleven golds in, a Premium Gold Pack out.',
      reqs: [{ type: 'minRarity', rarity: 'gold', count: 11 }, { type: 'minRating', value: 78 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'rare_revival', name: 'Rare Revival', group: 'Upgrades', repeatable: true, desc: 'Hand in rare players for a Gold Pack.',
      reqs: [{ type: 'minRare', count: 4 }, { type: 'minRating', value: 76 }], reward: { type: 'pack', packId: 'gold' } },
    { id: 'silver_stars', name: 'Silver Stars', group: 'Upgrades', repeatable: true, desc: 'A strong silver squad earns a Gold Pack.',
      reqs: [{ type: 'minRarity', rarity: 'silver', count: 11 }, { type: 'minRating', value: 72 }], reward: { type: 'pack', packId: 'gold' } },
    { id: 'la_liga_special', name: 'La Liga Special', group: 'Foundations', repeatable: false, desc: 'Spanish flair: four from La Liga.',
      reqs: [{ type: 'minLeague', league: 'LAL', count: 4 }, { type: 'minRating', value: 76 }, { type: 'minChem', value: 14 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'bundesliga_blitz', name: 'Bundesliga Blitz', group: 'Foundations', repeatable: false, desc: 'Four Bundesliga players and a solid rating.',
      reqs: [{ type: 'minLeague', league: 'BUN', count: 4 }, { type: 'minRating', value: 76 }, { type: 'minChem', value: 14 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'serie_a_standard', name: 'Serie A Standard', group: 'Foundations', repeatable: false, desc: 'Catenaccio and class: four from Serie A.',
      reqs: [{ type: 'minLeague', league: 'SEA', count: 4 }, { type: 'minRating', value: 76 }, { type: 'minChem', value: 14 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'ligue_un', name: 'Ligue 1 Lights', group: 'Foundations', repeatable: false, desc: 'Three from Ligue 1 lights up a Gold Pack.',
      reqs: [{ type: 'minLeague', league: 'L1', count: 3 }, { type: 'minRating', value: 75 }, { type: 'minChem', value: 12 }], reward: { type: 'pack', packId: 'gold' } },
    { id: 'samba_squad', name: 'Samba Squad', group: 'Foundations', repeatable: false, desc: 'Four Brazilians and a bit of rhythm.',
      reqs: [{ type: 'minNation', nation: 'BRA', count: 4 }, { type: 'minRating', value: 77 }, { type: 'minChem', value: 14 }], reward: { type: 'pack', packId: 'gold' } },
    // --- advanced ---
    { id: 'world_xi', name: 'World XI', group: 'Advanced', repeatable: true, desc: 'A different flag on almost every shirt.',
      reqs: [{ type: 'minUniqueNations', count: 8 }, { type: 'maxSameNation', count: 2 }, { type: 'minRating', value: 78 }, { type: 'minChem', value: 12 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'three_lions', name: 'Three Lions', group: 'Advanced', repeatable: false, desc: 'Six Englishmen, full of chemistry.',
      reqs: [{ type: 'minNation', nation: 'ENG', count: 6 }, { type: 'minRating', value: 79 }, { type: 'minChem', value: 18 }], reward: { type: 'pack', packId: 'elite' } },
    { id: 'albiceleste', name: 'La Albiceleste', group: 'Advanced', repeatable: false, desc: 'Three Argentinians and a high bar.',
      reqs: [{ type: 'minNation', nation: 'ARG', count: 3 }, { type: 'minRating', value: 80 }, { type: 'minChem', value: 16 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'iberian_duel', name: 'Iberian Duel', group: 'Advanced', repeatable: true, desc: 'Spain against Portugal in one XI.',
      reqs: [{ type: 'minNation', nation: 'ESP', count: 3 }, { type: 'minNation', nation: 'POR', count: 3 }, { type: 'minRating', value: 80 }], reward: { type: 'pack', packId: 'premium' } },
    { id: 'squad_of_stars', name: 'Squad of Stars', group: 'Advanced', repeatable: true, desc: 'Three 85+ stars lead the way to a Promo Pack.',
      reqs: [{ type: 'minRating', value: 84 }, { type: 'minPlayerRating', value: 85, count: 3 }, { type: 'minChem', value: 14 }], reward: { type: 'pack', packId: 'promo' } },
    { id: 'perfect_chem', name: 'League Masters', group: 'Advanced', repeatable: false, desc: 'Near-perfect chemistry from one league.',
      reqs: [{ type: 'minSameLeague', count: 6 }, { type: 'minChem', value: 28 }, { type: 'minRating', value: 80 }], reward: { type: 'pack', packId: 'elite' } },
    // --- player SBCs ---
    { id: 'potm_salah', name: 'POTM: Mohamed Salah', group: 'Players', repeatable: false, desc: 'A Player of the Month Salah (+3) for a Premier League side.',
      reqs: [{ type: 'minLeague', league: 'EPL', count: 4 }, { type: 'minRating', value: 85 }, { type: 'minChem', value: 18 }], reward: { type: 'card', baseId: 'p002', promo: 'potm', boost: 3 } },
    { id: 'potm_mbappe', name: 'POTM: Kylian Mbappé', group: 'Players', repeatable: false, desc: 'Player of the Month Mbappé (+3) for a La Liga core.',
      reqs: [{ type: 'minLeague', league: 'LAL', count: 3 }, { type: 'minRating', value: 85 }, { type: 'minChem', value: 18 }], reward: { type: 'card', baseId: 'p043', promo: 'potm', boost: 3 } },
    { id: 'flashback_bellingham', name: 'Flashback: Jude Bellingham', group: 'Players', repeatable: false, desc: 'Retro-frame Bellingham (+2) for an English-flavoured XI.',
      reqs: [{ type: 'minNation', nation: 'ENG', count: 3 }, { type: 'minRating', value: 84 }, { type: 'minChem', value: 16 }], reward: { type: 'card', baseId: 'p046', promo: 'flashback', boost: 2 } },
    { id: 'potm_yamal', name: 'POTM: Lamine Yamal', group: 'Players', repeatable: false, desc: 'Player of the Month Yamal (+3): a deep, high-rated squad.',
      reqs: [{ type: 'minRating', value: 86 }, { type: 'minPlayerRating', value: 85, count: 2 }, { type: 'minChem', value: 20 }], reward: { type: 'card', baseId: 'p045', promo: 'potm', boost: 3 } },
    // --- Nations League Player of the Month (NLPOFM): +5% on everything, two new PlayStyles + one kept = 3 ---
    { id: 'nl_kane', name: 'NLPOFM: Harry Kane', group: 'Nations League', repeatable: false, desc: 'Six goals lead the Nations League: Kane gets Dead Ball+ and Finesse Shot+.',
      reqs: [{ type: 'minRating', value: 86 }], reward: { type: 'card', baseId: 'p105', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_yamal', name: 'NLPOFM: Lamine Yamal', group: 'Nations League', repeatable: false, desc: 'Four goals for Spain: Yamal gets Trickster+ and Whipped Pass+.',
      reqs: [{ type: 'minRating', value: 86 }], reward: { type: 'card', baseId: 'p045', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_gyokeres', name: 'NLPOFM: Viktor Gyökeres', group: 'Nations League', repeatable: false, desc: 'Tied on four goals: Gyökeres gets Rapid+ and Low Driven Shot+.',
      reqs: [{ type: 'minRating', value: 84 }], reward: { type: 'card', baseId: 'p023', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_olise', name: 'NLPOFM: Michael Olise', group: 'Nations League', repeatable: false, desc: 'A perfect 10.0 against Belgium: Olise gets Technical+ and Trickster+.',
      reqs: [{ type: 'minRating', value: 85 }], reward: { type: 'card', baseId: 'p108', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_bellingham', name: 'NLPOFM: Jude Bellingham', group: 'Nations League', repeatable: false, desc: 'Four assists lead the competition: Bellingham gets Incisive Pass+ and Press Proven+.',
      reqs: [{ type: 'minRating', value: 86 }], reward: { type: 'card', baseId: 'p046', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_olmo', name: 'NLPOFM: Dani Olmo', group: 'Nations League', repeatable: false, desc: 'Three assists for Spain: Olmo gets Incisive Pass+ and First Touch+.',
      reqs: [{ type: 'minRating', value: 83 }], reward: { type: 'card', baseId: 'p063', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_gordon', name: 'NLPOFM: Anthony Gordon', group: 'Nations League', repeatable: false, desc: 'Best average rating in the competition: Gordon gets Relentless+ and Press Proven+.',
      reqs: [{ type: 'minRating', value: 82 }], reward: { type: 'card', baseId: 'p035', promo: 'nlpofm', boost: 5 } },
    { id: 'nl_doue', name: 'NLPOFM: Désiré Doué', group: 'Nations League', repeatable: false, desc: 'An 8.9 against Belgium: Doué gets Quick Step+ and Finesse Shot+.',
      reqs: [{ type: 'minRating', value: 84 }], reward: { type: 'card', baseId: 'p136', promo: 'nlpofm', boost: 5 } },
    { id: 'hero_haaland', name: 'Hero: Erling Haaland', group: 'Players', repeatable: false, desc: 'The biggest SBC yet: a Hero Haaland (+3).',
      reqs: [{ type: 'minRating', value: 87 }, { type: 'minPlayerRating', value: 86, count: 2 }, { type: 'minChem', value: 22 }, { type: 'minUniqueLeagues', count: 2 }], reward: { type: 'card', baseId: 'p001', promo: 'potm', boost: 3 } },
  ];

  // v62 rules for every SBC: no chemistry requirement, nations only capped (max 3 from one country), players may play out of position,
  // and a big card reward needs a squad rated close to the card (a 90 Kane asks for an 88 squad)
  SBCS.forEach(sbc => {
    sbc.reqs = sbc.reqs.filter(r => !['minChem', 'minNation', 'minSameNation', 'minUniqueNations', 'maxSameNation'].includes(r.type));
    sbc.reqs.push({ type: 'maxSameNation', count: 3 });
    if (sbc.reward.type === 'card') {
      let base = null; try { base = RUT.DB.get(sbc.reward.baseId); } catch (e) { /* db not ready */ }
      if (base) {
        const want = Math.min(88, base.rating + (sbc.reward.boost || 0) - 2), cur = sbc.reqs.find(r => r.type === 'minRating');
        if (cur) cur.value = Math.max(cur.value, want); else sbc.reqs.push({ type: 'minRating', value: want });
        if (want >= 85 && !sbc.reqs.some(r => r.type === 'minPlayerRating')) sbc.reqs.push({ type: 'minPlayerRating', value: want - 3, count: 2 });
      }
    }
  });

  // v88/v92: the Nations League cards are hard to get: squad rating one higher (cap 89) and five high-rated players, each one point higher than before
  SBCS.forEach(sbc => {
    if (!sbc.reward || sbc.reward.promo !== 'nlpofm') return;
    const rr = sbc.reqs.find(r => r.type === 'minRating'), pr = sbc.reqs.find(r => r.type === 'minPlayerRating');
    if (rr) rr.value = Math.min(89, rr.value + 1);
    if (pr) { pr.count = 5; pr.value += 1; } else sbc.reqs.push({ type: 'minPlayerRating', value: Math.max(83, (rr ? rr.value : 86) - 3), count: 5 });
  });

  // v98: Champions League promo cards as SBC rewards: every CL performer with a promo card; squad rating = card rating - 5 (78 to 88), two players a bit below that
  try {
    const cl = RUT.CL, picks = ((cl && (cl.formBase || cl.promoBase)) || []).map(id => RUT.DB.get(cl.promoId(id))).filter(Boolean).sort((a, b) => b.rating - a.rating).slice(0, 20);
    picks.forEach(c => {
      const need = Math.max(78, Math.min(88, c.rating - 5));
      SBCS.push({ id: 'cl_' + c.baseId, name: 'Champions League: ' + c.name, group: 'Champions League', repeatable: false,
        desc: 'Rated 8.0+ in the Champions League: ' + c.name + ' gets a +4% promo card' + (c.playStyles.length > RUT.DB.get(c.baseId).playStyles.length ? ' and a new PlayStyle+.' : '.'),
        reqs: [{ type: 'minRating', value: need }, { type: 'minPlayerRating', value: need - 2, count: 2 }, { type: 'maxSameNation', count: 3 }], reward: { type: 'card', baseId: c.baseId, promo: 'clpromo', boost: 4 } });
    });
  } catch (e) { /* the Champions League data is optional */ }

  // v145 (JODIO): reward cards rated 91+ are harder: the squad rating is one higher (cap 90) and four players need to be rated 2 below that
  try {
    SBCS.forEach(sbc => {
      const c = rewardCard(sbc); if (!c || c.rating < 91) return;
      const rr = sbc.reqs.find(r => r.type === 'minRating'), pr = sbc.reqs.find(r => r.type === 'minPlayerRating');
      if (rr) rr.value = Math.min(90, rr.value + 1); else sbc.reqs.push({ type: 'minRating', value: 88 });
      const sq = (sbc.reqs.find(r => r.type === 'minRating') || {}).value || 88;
      if (pr) { pr.count = Math.max(pr.count || 2, 4); pr.value = Math.max(pr.value + 1, sq - 2); } else sbc.reqs.push({ type: 'minPlayerRating', value: sq - 2, count: 4 });
      sbc.hard91 = true;
    });
  } catch (e) { /* db not ready: no extra requirements */ }

  /* ----------------------------- Validation ------------------------------ */
  function cardsFor(itemIds) { return itemIds.map(id => (id ? RUT.State.card(id) : null)); }

  function validate(sbc, itemIds) {
    if (typeof sbc === 'string') sbc = SBCS.find(s => s.id === sbc);
    const cards = cardsFor(itemIds);
    const filled = cards.filter(Boolean).length;
    const rating = squadRating(cards.map(c => (c ? c.rating : 0)));
    const chem = chemistry(cards).total;
    const ctx = { rating, chem };
    const results = [{ label: 'Players in Squad: 11', pass: filled === 11, detail: filled + ' / 11' }];
    // duplicates of the same card id are not allowed in one submission
    const dup = new Set(), seen = new Set();
    cards.forEach(c => { if (!c) return; const k = c.baseId || c.id; if (seen.has(k)) dup.add(k); seen.add(k); });
    results.push({ label: 'No duplicate players', pass: dup.size === 0, detail: dup.size ? dup.size + ' dup' : 'ok' });
    sbc.reqs.forEach(r => { const out = RULES[r.type](cards, ctx, r); results.push({ label: out.label, pass: out.pass, detail: out.detail }); });
    const errors = results.filter(r => !r.pass).map(r => 'SBC Failed: ' + failText(r, sbc));
    const isValid = errors.length === 0;
    return { ok: isValid, isValid, errors, error: errors[0] || null, rating, chem, exact: squadRatingExact(cards.map(c => (c ? c.rating : 0))), results };
  }

  /** Human-readable failure reason, e.g. "Minimum Team Chemistry of 24 required." */
  function failText(r, sbc) {
    const l = r.label;
    let m;
    if ((m = l.match(/^Squad Rating: Min (\d+)/))) return 'Minimum Squad Rating of ' + m[1] + ' required (current ' + r.detail.split(' ')[0] + ').';
    if ((m = l.match(/^Total Chemistry: Min (\d+)/))) return 'Minimum Team Chemistry of ' + m[1] + ' required.';
    if (/^Players in Squad/.test(l)) return 'All 11 slots must be filled (' + r.detail + ').';
    if (/duplicate/.test(l)) return 'The same player cannot be submitted twice.';
    return l + ' not met (' + r.detail + ').';
  }

  /* v100: at most 7 SBCs a day (a reset costs 150,000 coins) and a validation fee for challenges that reward a 91+ card (200,000, +50,000 per point above 91) */
  const DAILY_LIMIT = 8, RESET_COST = 150000;   // v192 (JODIO): 8 a day
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function daily() {
    const st = RUT.State.data; if (!st.sbcDay || st.sbcDay.d !== dayKey()) st.sbcDay = { d: dayKey(), n: 0 };
    return { n: st.sbcDay.n, limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - st.sbcDay.n), resetCost: RESET_COST };
  }
  function resetDaily() {
    const st = RUT.State.data, dl = daily();
    if (!dl.n) return { ok: false, msg: 'Nothing to reset: you have not completed an SBC today.' };
    if (st.coins < RESET_COST) return { ok: false, msg: 'A reset costs ' + RESET_COST.toLocaleString() + ' coins.' };
    RUT.State.addCoins(-RESET_COST, 'SBC daily limit reset'); st.sbcDay.n = 0; st.sbcDay.r = (st.sbcDay.r || 0) + 1; RUT.State.save();
    return { ok: true, msg: 'SBC limit reset: ' + DAILY_LIMIT + ' more SBCs today (-' + RESET_COST.toLocaleString() + ' coins).' };
  }
  /** The reward card of an SBC (promo versions where they exist). */
  function rewardCard(sbc) {
    const r = sbc.reward; if (!r || r.type !== 'card') return null;
    try { return (r.promo === 'nlpofm' || r.promo === 'clpromo') ? RUT.DB.registerPromo(r.baseId, r.promo, r.boost) : RUT.DB.get(r.baseId); } catch (e) { return null; }
  }
  function feeOf(sbc) { const c = rewardCard(sbc); return c && c.rating >= 91 ? 400000 + 55000 * (c.rating - 91) : 0; }   // v192 (JODIO): fee 400,000 (+55,000 per point above 91)

  /* v241 (JODIO): pack SBCs can be done again after each daily refresh or paid reset (once per period) */
  const period = () => { daily(); const d = RUT.State.data.sbcDay; return d.d + '#' + (d.r || 0); };
  const packOnce = sbc => !sbc.repeatable && sbc.reward && sbc.reward.type === 'pack';
  function isAvailable(sbc) { const st = RUT.State.data, done = st.sbcDone[sbc.id] || 0; if (packOnce(sbc)) return !done || ((st.sbcPer || {})[sbc.id] || '') !== period(); return sbc.repeatable || done === 0; }

  /**
   * Submit: re-validates, checks ownership, consumes cards, grants reward.
   * Returns { ok, msg, reward:{ type, packId?|itemId? } }.
   */
  function submit(sbcId, itemIds) {
    const st = RUT.State.data, sbc = SBCS.find(s => s.id === sbcId);
    const fail = msg => ({ ok: false, isValid: false, msg, error: msg });
    if (!sbc) return fail('SBC Failed: unknown challenge.');
    if (!isAvailable(sbc)) return fail('SBC Failed: challenge already completed.');
    const owned = itemIds.every(id => id && st.items[id] && (st.club.includes(id) || st.unassigned.includes(id) || st.sbcStorage.includes(id)));
    if (!owned) return fail('SBC Failed: all 11 players must be owned and not listed on the Transfer Market.');
    const v = validate(sbc, itemIds);
    if (!v.isValid) return Object.assign(fail(v.errors[0]), { errors: v.errors, validation: v });
    const dl = daily(), fee = feeOf(sbc);
    if (dl.left <= 0) return fail('SBC limit reached: ' + DAILY_LIMIT + ' a day. Reset it for ' + RESET_COST.toLocaleString() + ' coins on the SBC page.');
    if (fee && st.coins < fee) return fail('This SBC costs ' + fee.toLocaleString() + ' coins to validate (you have ' + st.coins.toLocaleString() + ').');
    if (fee) RUT.State.addCoins(-fee, 'SBC fee: ' + sbc.name);
    st.sbcDay.n++;

    itemIds.forEach(id => RUT.State.destroy(id));   // card burning: permanently removed
    st.sbcDone[sbc.id] = (st.sbcDone[sbc.id] || 0) + 1; if (packOnce(sbc)) { st.sbcPer = st.sbcPer || {}; st.sbcPer[sbc.id] = period(); }
    try { RUT.Quests && RUT.Quests.event('sbc', { id: sbc.id }); } catch (e) { /* quests are optional */ }

    let reward = Object.assign({}, sbc.reward);
    if (reward.type === 'pack') {
      st.packsOwned[reward.packId] = (st.packsOwned[reward.packId] || 0) + 1;
      st.sbcPacks = st.sbcPacks || {}; st.sbcPacks[reward.packId] = (st.sbcPacks[reward.packId] || 0) + 1;      // opened first, with weaker odds for high-rated players
    } else if (reward.type === 'card') {
      let it;
      if (reward.promo === 'nlpofm' || reward.promo === 'clpromo') { const card = RUT.DB.registerPromo(reward.baseId, reward.promo, reward.boost); it = RUT.State.newItem(card.id, { promo: { baseId: reward.baseId, type: reward.promo, boost: reward.boost } }); }
      else it = RUT.State.newItem(reward.baseId, {});      // the old promos (TOTW, POTM...) are gone: the reward is the player's basic gold card
      st.unassigned.push(it.id);
      reward.itemId = it.id;
    }
    RUT.State.log('SBC complete: ' + sbc.name);
    RUT.State.save();
    return { ok: true, isValid: true, msg: sbc.name + ' complete! 11 cards burned.' + (fee ? ' (-' + fee.toLocaleString() + ' coins)' : ''), reward, validation: v };
  }

  /**
   * Helper for the builder (v88): finds the cheapest squad from your unused cards that meets EVERY requirement, and among equally cheap
   * squads the best rated one. Step 1 fills with the cheapest cards, step 2 repairs what fails (best fix per coin), step 3 swaps every
   * slot for a cheaper card while the SBC stays valid, step 4 raises ratings wherever it costs no more.
   * Cards you already placed stay put when a squad with them is possible.
   */
  function autoFillCore(sbc, current, useXI) {
    if (typeof sbc === 'string') sbc = SBCS.find(s => s.id === sbc);
    const st = RUT.State.data, n = 11;
    const eff = x => (x.xi ? x.c.value * 1.6 + 2000 : x.c.value);                      // a starter costs extra in the search: he is only used when the squad cannot be built without him
    const rarityReq = sbc.reqs.find(r => r.type === 'minRarity');
    const inSlots = new Set((current || []).filter(Boolean));
    const pool = st.club.concat(st.unassigned, st.sbcStorage || []).filter((id, k, a) => a.indexOf(id) === k && (useXI || !RUT.State.isInSquad(id)))
      .map(id => ({ id, c: RUT.State.card(id), xi: RUT.State.isInSquad(id) })).filter(x => x.c)
      .filter(x => !rarityReq || RULES.minRarity([x.c], {}, { rarity: rarityReq.rarity, count: 1 }).pass)
      .sort((a, b) => eff(a) - eff(b) || b.c.rating - a.c.rating);
    const byId = {}; pool.forEach(x => { byId[x.id] = x; });
    const reqs = sbc.reqs.filter(r => r.type !== 'minChem');
    const ratingReq = reqs.find(r => r.type === 'minRating');

    /** 0 = every requirement met; bigger = further away (failed requirements count most, then how far short). */
    function pen(slots) {
      const cards = slots.map(id => (id ? byId[id].c : null)), r = cards.map(c => (c ? c.rating : 0));
      const ctx = { rating: squadRating(r), chem: 0 };
      let p = (n - slots.filter(Boolean).length) * 1000;
      const seen = new Set(); cards.forEach(c => { if (c) { const k = c.baseId || c.id; if (seen.has(k)) p += 500; seen.add(k); } });
      reqs.forEach(q => {
        const o = RULES[q.type](cards, ctx, q); if (o.pass) return;
        p += 100; let m;
        if ((m = o.detail.match(/^(\d+) \/ (\d+)$/))) p += (+m[2] - +m[1]) * 10; else if ((m = o.detail.match(/^max (\d+)/))) p += (+m[1] - q.count) * 10;
        if (q.type === 'minRating') p += (q.value - squadRatingExact(r)) * 50;
      });
      return p;
    }
    const cost = slots => slots.reduce((a, id) => a + (id ? eff(byId[id]) : 0), 0);
    const rate = slots => slots.reduce((a, id) => a + (id ? byId[id].c.rating : 0), 0);

    function build(lockStart) {
      const slots = new Array(n).fill(null), locked = new Array(n).fill(false);
      const usedCard = new Set();
      if (lockStart) (current || []).forEach((id, i) => { if (id && byId[id] && i < n && !usedCard.has(byId[id].c.id)) { slots[i] = id; locked[i] = true; usedCard.add(byId[id].c.id); } });
      for (let i = 0; i < n; i++) if (!slots[i]) { const x = pool.find(u => !usedCard.has(u.c.id) && !slots.includes(u.id)); if (x) { slots[i] = x.id; usedCard.add(x.c.id); } }
      const free = i => !locked[i];
      const canUse = (slots, i, u) => !slots.includes(u.id) && !slots.some((id, k) => k !== i && id && byId[id].c.id === u.c.id);
      // repair: take the swap that removes the most penalty per coin spent
      for (let guard = 0; guard < 90 && pen(slots) > 0; guard++) {
        const p0 = pen(slots), c0 = cost(slots); let best = null, bs = 0;
        for (let i = 0; i < n; i++) {
          if (!free(i)) continue;
          const old = slots[i];
          for (const u of pool) {
            if (!canUse(slots, i, u)) continue;
            slots[i] = u.id; const dp = p0 - pen(slots), dc = cost(slots) - c0; slots[i] = old;
            if (dp <= 0) continue;
            const sc = dp / Math.max(dc, 50);
            if (sc > bs) { bs = sc; best = [i, u.id]; }
          }
        }
        if (!best) break;
        slots[best[0]] = best[1];
      }
      if (pen(slots) > 0) return { slots, ok: false };
      // trim: cheaper card in any slot while the SBC stays valid; then lift ratings at no extra cost
      for (const mode of ['cheaper', 'better']) {
        for (let guard = 0; guard < 60; guard++) {
          let best = null, bv = 0;
          for (let i = 0; i < n; i++) {
            if (!free(i)) continue;
            const old = slots[i], oc = byId[old].c;
            for (const u of pool) {
              if (!canUse(slots, i, u)) continue;
              const dv = eff(byId[old]) - eff(u), dr = u.c.rating - oc.rating;
              if (mode === 'cheaper' ? dv <= 0 : !(dv >= 0 && dr > 0)) continue;
              slots[i] = u.id; const ok = pen(slots) === 0; slots[i] = old;
              if (!ok) continue;
              const gain = mode === 'cheaper' ? dv : dr;
              if (gain > bv) { bv = gain; best = [i, u.id]; }
            }
          }
          if (!best) break;
          slots[best[0]] = best[1];
        }
      }
      return { slots, ok: true };
    }

    /**
     * v97, a stronger search: several randomised starts (cheapest cards, best cards, a mix), each in two phases. Phase 1 chases the requirements
     * (sample cards for a slot and keep the one that lowers the penalty most, sideways moves allowed so it can leave a dead end); phase 2 lowers the
     * price while the SBC stays valid (single swaps, plus paired swaps that trade rating between two slots). Deterministic. The cheapest valid squad
     * found wins, ties go to the better rated one.
     */
    function search(lock) {
      let seed = 2166136261; String(sbc.id).split('').forEach(ch => { seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619); }); seed ^= pool.length * 2654435761;
      const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const key = u => u.c.baseId || u.c.id, N = pool.length;
      const locked = new Array(n).fill(false), base = new Array(n).fill(null);
      if (lock) (current || []).forEach((id, i) => { if (id && byId[id] && i < n && !base.some(b => b && key(byId[b]) === key(byId[id]))) { base[i] = id; locked[i] = true; } });
      const fits = (slots, i, u) => { for (let k = 0; k < n; k++) if (k !== i && slots[k] && key(byId[slots[k]]) === key(u)) return false; return true; };
      const byRating = pool.slice().sort((a, b) => b.c.rating - a.c.rating || eff(a) - eff(b));
      const starts = [pool, byRating, null];
      let best = null, bestCost = Infinity, bestRate = -1;
      for (let st = 0; st < 6; st++) {
        const order = starts[st % 3] || pool.slice().sort(() => rnd() - 0.5), slots = base.slice();
        let oi = st >= 3 ? Math.floor(rnd() * Math.min(N, 40)) : 0;
        for (let i = 0; i < n; i++) if (!slots[i]) { for (let k = 0; k < N; k++) { const u = order[(oi + k) % N]; if (fits(slots, i, u)) { slots[i] = u.id; oi = (oi + k + 1) % N; break; } } }
        if (slots.some(x => !x)) continue;
        // phase 1: reach a valid squad
        let p0 = pen(slots);
        for (let it = 0; it < 900 && p0 > 0; it++) {
          const i = Math.floor(rnd() * n); if (locked[i]) continue;
          let bu = null, bp = Infinity, old = slots[i];
          for (let k = 0; k < 14; k++) { const u = pool[Math.floor(rnd() * N)]; if (u.id === old || !fits(slots, i, u)) continue; slots[i] = u.id; const q = pen(slots); slots[i] = old; if (q < bp) { bp = q; bu = u; } }
          if (bu && bp <= p0) { slots[i] = bu.id; p0 = bp; }
        }
        if (p0 > 0) continue;
        // phase 2: cheaper while valid
        let c0 = cost(slots);
        for (let it = 0; it < 1800; it++) {
          const i = Math.floor(rnd() * n); if (locked[i]) continue;
          const old = slots[i], oc = eff(byId[old]);
          if (rnd() < 0.7) {
            for (let k = 0; k < 10; k++) { const u = pool[Math.floor(rnd() * N)]; if (eff(u) >= oc || !fits(slots, i, u)) continue; slots[i] = u.id; if (pen(slots) === 0) { c0 += eff(u) - oc; break; } slots[i] = old; }
          } else {                                                                         // a paired swap: one slot gets cheaper, the other better, if the total goes down
            const j = Math.floor(rnd() * n); if (j === i || locked[j]) continue; const oldJ = slots[j], ocj = eff(byId[oldJ]);
            const u = pool[Math.floor(rnd() * N)], w = pool[Math.floor(rnd() * N)];
            if (eff(u) + eff(w) >= oc + ocj || u.id === w.id || !fits(slots, i, u)) continue;
            slots[i] = u.id; if (!fits(slots, j, w)) { slots[i] = old; continue; } slots[j] = w.id;
            if (pen(slots) === 0) c0 += eff(u) + eff(w) - oc - ocj; else { slots[i] = old; slots[j] = oldJ; }
          }
        }
        // finish with a rating lift that costs nothing extra
        for (let it = 0; it < 300; it++) {
          const i = Math.floor(rnd() * n); if (locked[i]) continue; const old = slots[i], oc = byId[old].c, ov = eff(byId[old]);
          const u = pool[Math.floor(rnd() * N)]; if (eff(u) > ov || u.c.rating <= oc.rating || !fits(slots, i, u)) continue;
          slots[i] = u.id; if (pen(slots) === 0) c0 += eff(u) - ov; else slots[i] = old;
        }
        const rt = rate(slots), cc = cost(slots);
        if (cc < bestCost || (cc === bestCost && rt > bestRate)) { best = slots.slice(); bestCost = cc; bestRate = rt; }
      }
      return best;
    }

    // the older greedy repair is kept as a second opinion; the cheaper valid squad of the two wins
    const cands = [];
    const consider = (lock) => { const a = build(lock); if (a.ok) cands.push(a.slots); const b = search(lock); if (b) cands.push(b); };
    consider(true);
    if (!cands.length && inSlots.size) consider(false);
    if (cands.length) { cands.sort((a, b) => cost(a) - cost(b) || rate(b) - rate(a)); return cands[0]; }
    const r = build(true);
    return r.slots;
  }

  /** The builder's auto-fill: first from cards outside your starting XI (club, unassigned and SBC storage); only if that cannot work, your starters join the search. RUT.SBC.autoInfo says what happened. */
  function autoFill(sbc, current) {
    if (typeof sbc === 'string') sbc = SBCS.find(s => s.id === sbc);
    const ok = slots => slots.every(Boolean) && validate(sbc, slots).isValid;
    let slots = autoFillCore(sbc, current, false), xi = 0, valid = ok(slots);
    if (!valid) {
      const s2 = autoFillCore(sbc, current, true);
      if (ok(s2)) { slots = s2; valid = true; xi = s2.filter(id => RUT.State.isInSquad(id)).length; }
    }
    autoFill.info = { valid, xi };
    return slots;
  }
  RUT.SBC = { SBCS, RULES, CHEM_THRESHOLDS, squadRating, squadRatingExact, chemistry, validate, submit, autoFill, autoInfo: () => autoFill.info, isAvailable, daily, resetDaily, feeOf, rewardCard, DAILY_LIMIT, RESET_COST };
})();
