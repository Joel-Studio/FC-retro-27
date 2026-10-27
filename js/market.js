/* =============================================================================
 * market.js  —  Phase 2: FUTBIN-style Transfer Market & Economy
 * -----------------------------------------------------------------------------
 * A self-contained market simulation that runs in "market ticks" (one tick =
 * one in-game market hour, every TICK_MS of real time, with offline catch-up).
 *
 *   • Price engine   — every tradeable card has a live price that random-walks
 *                      around its valuation (mean-reverting log walk + market
 *                      events like a "promo crash"). A rolling history array per
 *                      card powers FUTBIN-style trend graphs.
 *   • Listings       — AI sellers keep the market stocked; the user can list
 *                      owned items with Start Price + Buy Now + duration.
 *   • Bidding        — auctions with FUT bid increments, AI counter-bids,
 *                      escrowed coins and a watchlist.
 *   • Tax engine     — 5% EA tax on every completed sale.
 *   • Search         — League / Club / Position / Rating / Buy Now filters.
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';

  const TICK_MS = 10000;         // 1 market hour every 10s of real time while the hub is open
  const HISTORY_LEN = 96;        // ~4 in-game days of hourly points
  const TAX_RATE = 0.05;         // EA tax
  const TARGET_AI_LISTINGS = 240;
  const DURATIONS = { '1h': 1, '3h': 3, '6h': 6, '12h': 12, '24h': 24 }; // FC listing durations, in market hours (ticks)
  const MAX_ACTIVE_LISTINGS = 100; // FC listing limit

  const S = () => RUT.State.data;
  const M = () => RUT.State.data.market;
  const DB = () => RUT.DB;
  let rand = Math.random;        // swappable for deterministic tests

  /* ------------------------------ helpers -------------------------------- */
  /** FUT bid increments. */
  function increment(price) {
    if (price < 1000) return 50;
    if (price < 10000) return 100;
    if (price < 50000) return 250;
    if (price < 100000) return 500;
    if (price < 1000000) return 1000;
    return 10000;
  }
  function roundPrice(v) { return DB().roundToIncrement(v); }
  function nextBid(current, start) { return current ? roundPrice(current + increment(current)) : start; }
  function gauss() { // Box–Muller
    let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Tax calculator: what the seller actually receives. */
  const MAX_PRICE = 15000000;                                       // v152 (JODIO): no card can cost more than 15 million
  /** v152: the market price a card tends towards. Up to 200,000 it is value x PRICE_K; above that the price climbs steeply so the dearest card (Mbappe, value about 800,000) sits at 15,000,000 and the other 92s at 4-10 million. */
  function mval(card) { const x = card.value * PRICE_K; return x <= 200000 ? x : Math.min(MAX_PRICE, 200000 * Math.pow(x / 200000, 2.735)); }
  const PRICE_K = 1.2;                                              // v85: every player costs 20% more on the market
  function tax(price) {
    const fee = Math.floor(price * TAX_RATE);
    return { gross: price, fee, net: price - fee };
  }

  /** EA-style price range bounds per card. */
  function priceRange(card) {
    return { min: roundPrice(Math.max(150, mval(card) * 0.4)), max: Math.min(MAX_PRICE, roundPrice(Math.max(mval(card) * 4, mval(card) * 1.05))) };
  }

  function tradeableCards() { return DB().all; }                    // the Nations League promo cards trade too (the old promos are gone)

  /* ---------------------------- price engine ----------------------------- */
  /**
   * One step of the price walk:
   *   p' = p * exp( σ·N(0,1) + κ·ln(value/p) + event )
   * κ pulls price back toward the card's valuation, σ is volatility (higher for
   * expensive cards, like the real market), and `event` is a market-wide shock.
   */
  function stepPrice(card, p, event) {
    const sigma = card.rating >= 86 ? 0.035 : card.rating >= 80 ? 0.028 : 0.02;
    const kappa = 0.06;
    const drift = kappa * Math.log(mval(card) / p);
    const r = range(card);
    return Math.max(r.min, Math.min(r.max, p * Math.exp(sigma * gauss() + drift + event)));
  }
  const rangeCache = {};
  function range(card) { return rangeCache[card.id] || (rangeCache[card.id] = priceRange(card)); }

  /** Seed a fresh history for a card (back-filled random walk). */
  function seedHistory(card) {
    const hist = [];
    let p = mval(card) * (0.85 + rand() * 0.3);
    for (let i = 0; i < HISTORY_LEN; i++) { p = stepPrice(card, p, 0); hist.push(Math.round(p)); }
    return hist;
  }

  /* ------------------------------ listings ------------------------------- */
  function makeAiListing(card) {
    const m = M();
    const price = m.history[card.id][m.history[card.id].length - 1];
    const buyNow = roundPrice(price * (0.96 + rand() * 0.3));
    const startPrice = roundPrice(buyNow * (0.55 + rand() * 0.3));
    return {
      id: 'L' + (m.nextListingId++), cardId: card.id, itemId: null, seller: 'AI',
      startPrice, buyNow, currentBid: 0, bidder: null,
      expiresTick: m.tick + 1 + Math.floor(rand() * 24), status: 'active',
    };
  }

  /** Weighted pick that favours the cheap end of the market (as in FUT). */
  function pickCardForListing(pool) {
    pool = pool || tradeableCards().filter(c => c.promo !== 'bdor' && c.promo !== 'award');   // v188: Ballon d'Or cards only come from the BdO pack
    // about 45% of AI listings come from the 80-91 band so good players are always on sale
    if (rand() < 0.45) {
      const band = pool.filter(c => c.rating >= 80 && c.rating <= 91);
      for (let k = 0; band.length && k < 6; k++) { const c = band[Math.floor(rand() * band.length)]; if (!c.promo || rand() < 0.15) return c; }   // promo cards are rarer on the market
    }
    for (let tries = 0; tries < 6; tries++) {
      const c = pool[Math.floor(rand() * pool.length)];
      const keep = (c.rating >= 88 ? 0.25 : c.rating >= 84 ? 0.45 : 1) * (c.promo ? 0.15 : 1);
      if (rand() < keep) return c;
    }
    return pool[Math.floor(rand() * pool.length)];
  }

  function restockAi(count) {
    const m = M();
    const aiActive = m.listings.filter(l => l.seller === 'AI' && l.status === 'active').length;
    const n = count != null ? count : Math.max(0, TARGET_AI_LISTINGS - aiActive);
    for (let i = 0; i < n; i++) m.listings.push(makeAiListing(pickCardForListing()));
  }

  /* -------------------------------- init --------------------------------- */
  function init(force) {
    const st = S();
    if (!st.market || force) {
      st.market = { tick: 0, lastTs: Date.now(), history: {}, listings: [], nextListingId: 1, events: [], k120: true, clx13: true };
      tradeableCards().forEach(c => { st.market.history[c.id] = seedHistory(c); });
      restockAi();
    } else {
      if (!st.market.clx13) {                                         // v134 one-off: Champions League cards cost 30% more (existing prices and AI listings too)
        st.market.clx13 = true;
        const isCl = id => { const c = DB().get(id); return c && c.promo === 'clpromo'; };
        Object.keys(st.market.history).forEach(id => { if (isCl(id)) st.market.history[id] = st.market.history[id].map(v => Math.round(v * 1.3)); });
        st.market.listings.forEach(l => { if (l.seller === 'AI' && l.status === 'active' && isCl(l.cardId)) { l.startPrice = roundPrice(l.startPrice * 1.3); l.buyNow = roundPrice(l.buyNow * 1.3); if (l.bidder !== 'you') l.currentBid = l.currentBid ? roundPrice(l.currentBid * 1.3) : 0; } });
      }
      // make sure newly added cards have a history
      // and reseed cards whose rating changed in a database update (old price far from the new value)
      tradeableCards().forEach(c => {
        const h = st.market.history[c.id], last = h && h[h.length - 1];
        if (!h || last > mval(c) * 2.5 || last < mval(c) * 0.4) st.market.history[c.id] = seedHistory(c);
      });
      if (!st.market.k152) {                                          // one-off (v152): AI listings of cards that now cost far more than listed are repriced to the new market price
        st.market.k152 = true;
        st.market.listings.forEach(l => { if (l.seller !== 'AI' || l.status !== 'active' || l.bidder === 'you') return; const c = DB().get(l.cardId); if (!c) return; const cur = currentPrice(l.cardId); if (l.buyNow < cur * 0.6) { l.buyNow = roundPrice(cur * (1 + rand() * 0.15)); l.startPrice = roundPrice(l.buyNow * (0.55 + rand() * 0.3)); l.currentBid = 0; l.bidder = null; } });
      }
      if (!st.market.k157) {                                          // one-off (v157): normal cards under 89 are worth 30% less (prices and AI listings drop 30%), special cards 30% more
        st.market.k157 = true;
        const cut = id => { const c = DB().get(id); return c && !c.promo && c.rating < 89; };
        const up = id => { const c = DB().get(id); return c && c.promo; };
        Object.keys(st.market.history).forEach(id => { if (cut(id)) st.market.history[id] = st.market.history[id].map(v => Math.round(v * 0.7)); });
        st.market.listings.forEach(l => { if (l.seller === 'AI' && l.status === 'active' && cut(l.cardId)) { l.startPrice = roundPrice(l.startPrice * 0.7); l.buyNow = roundPrice(l.buyNow * 0.7); if (l.bidder !== 'you') l.currentBid = l.currentBid ? roundPrice(l.currentBid * 0.7) : 0; } });
        Object.keys(st.market.history).forEach(id => { if (up(id)) st.market.history[id] = st.market.history[id].map(v => Math.round(v * 1.3)); });
        st.market.listings.forEach(l => { if (l.seller === 'AI' && l.status === 'active' && up(l.cardId)) { l.startPrice = roundPrice(l.startPrice * 1.3); l.buyNow = roundPrice(l.buyNow * 1.3); if (l.bidder !== 'you') l.currentBid = l.currentBid ? roundPrice(l.currentBid * 1.3) : 0; } });
      }
      if (!st.market.k120) {                                          // one-off: existing prices and AI listings go up 20% too
        st.market.k120 = true;
        Object.keys(st.market.history).forEach(id => { st.market.history[id] = st.market.history[id].map(v => Math.round(v * PRICE_K)); });
        st.market.listings.forEach(l => { if (l.seller === 'AI' && l.status === 'active') { l.startPrice = roundPrice(l.startPrice * PRICE_K); l.buyNow = roundPrice(l.buyNow * PRICE_K); if (l.bidder !== 'you') l.currentBid = l.currentBid ? roundPrice(l.currentBid * PRICE_K) : 0; } });
      }
      // offline catch-up (capped so a week away doesn't freeze the browser)
      const missed = Math.min(120, Math.floor((Date.now() - st.market.lastTs) / TICK_MS));
      for (let i = 0; i < missed; i++) tick(true);
    }
  }

  /* -------------------------------- tick --------------------------------- */
  /**
   * Advance the market one hour:
   *   1. move every price (with an occasional market-wide event)
   *   2. AI behaviour on the user's listings (bids / Buy Now snipes)
   *   3. AI counter-bids on auctions the user is winning
   *   4. resolve expired auctions, pay out with tax
   *   5. restock AI listings
   * Returns an array of human-readable notifications.
   */
  function tick(silent) {
    const st = S(), m = M();
    const notes = [];
    m.tick++; m.lastTs = Date.now();

    // 1. market-wide events (promo crash / weekend-league demand spike)
    let event = 0;
    const roll = rand();
    if (roll < 0.015) { event = -0.06; m.events.unshift({ tick: m.tick, label: 'PROMO CRASH -6%' }); notes.push('Market event: promo crash! Prices dipping.'); }
    else if (roll < 0.03) { event = 0.04; m.events.unshift({ tick: m.tick, label: 'WEEKEND LEAGUE DEMAND +4%' }); notes.push('Market event: Weekend League demand spike.'); }
    m.events.length = Math.min(m.events.length, 10);
    tradeableCards().forEach(c => {
      const h = m.history[c.id];
      h.push(Math.round(stepPrice(c, h[h.length - 1], event)));
      if (h.length > HISTORY_LEN) h.shift();
    });

    m.listings.forEach(l => {
      if (l.status !== 'active') return;
      const price = currentPrice(l.cardId);

      // 2. user's listings: AI buyers
      if (l.seller === 'you') {
        const ratio = l.buyNow / price;
        const pBuy = ratio <= 1.0 ? 0.55 : ratio <= 1.08 ? 0.25 : ratio <= 1.2 ? 0.07 : 0.01;
        if (rand() < pBuy) { settleSale(l, l.buyNow, notes); return; }
        const nb = nextBid(l.currentBid, l.startPrice);
        if (nb <= price * 0.92 && rand() < 0.35) { l.currentBid = nb; l.bidder = 'AI'; }
      }

      // 3. AI counter-bids against the user
      if (l.seller === 'AI' && l.bidder === 'you') {
        const nb = nextBid(l.currentBid, l.startPrice);
        if (nb <= price * 0.97 && rand() < 0.3) {
          st.coins += l.currentBid; // refund escrow
          notes.push('Outbid on ' + DB().get(l.cardId).name + ' (' + l.currentBid.toLocaleString() + 'c refunded)');
          l.currentBid = nb; l.bidder = 'AI';
        }
      }
      // AI-on-AI churn so the listings feel alive
      if (l.seller === 'AI' && l.bidder !== 'you' && rand() < 0.05) {
        const nb = nextBid(l.currentBid, l.startPrice);
        if (nb < l.buyNow && nb <= price * 0.9) { l.currentBid = nb; l.bidder = 'AI'; }
      }

      // 4. expiry
      if (m.tick >= l.expiresTick) {
        if (l.seller === 'you') {
          if (l.currentBid > 0) settleSale(l, l.currentBid, notes);
          else { l.status = 'expired'; notes.push(DB().get(l.cardId).name + ' did not sell (expired)'); }
        } else if (l.bidder === 'you') {
          l.status = 'won';
          const it = RUT.State.newItem(l.cardId, {});
          st.unassigned.push(it.id);
          st.watchlist = st.watchlist.filter(x => x !== l.id);
          notes.push('Won ' + DB().get(l.cardId).name + ' for ' + l.currentBid.toLocaleString() + 'c');
          RUT.State.log('Auction won: ' + DB().get(l.cardId).name);
        } else {
          l.status = 'closed';
        }
      }
    });

    // tidy: drop closed AI listings, keep the user's history for the transfer list
    m.listings = m.listings.filter(l => l.status === 'active' || l.seller === 'you' || (l.status === 'won' && st.watchlist.includes(l.id)));
    restockAi();
    if (!silent) RUT.State.save(true);   // true = background tick: saved, but not a reason to upload to the cloud
    return notes;
  }

  function settleSale(l, price, notes) {
    const st = S();
    const t = tax(price);
    st.coins += t.net;
    l.status = 'sold'; l.soldFor = price;
    const name = DB().get(l.cardId).name;
    delete st.items[l.itemId];
    st.transferList = st.transferList.filter(x => x !== l.itemId);
    notes.push('SOLD ' + name + ' for ' + price.toLocaleString() + 'c (−' + t.fee.toLocaleString() + ' tax)');
    RUT.State.log('Sold ' + name + ' for ' + price.toLocaleString() + 'c, net ' + t.net.toLocaleString());
    try { RUT.Quests && RUT.Quests.event('sell'); } catch (e) { /* quests are optional */ }
  }

  /* ----------------------------- user actions ---------------------------- */
  function currentPrice(cardId) { const h = M().history[cardId]; return h ? h[h.length - 1] : mval(DB().get(cardId) || { value: 0 }); }

  /**
   * Search active listings (excluding the user's own). If the market is thin
   * for a filter, fresh AI listings are spawned so a valid search always
   * returns something — FUT's market is effectively bottomless.
   */
  function search(f) {
    f = f || {};
    const match = c => c &&
      (!f.league || c.league === f.league) &&
      (!f.club || c.club === f.club) &&
      (!f.position || c.position === f.position) &&
      (!f.rarity || c.rarity === f.rarity) &&
      (!f.name || c.name.toLowerCase().includes(f.name.toLowerCase())) &&
      (!f.minRating || c.rating >= +f.minRating) &&
      (!f.maxRating || c.rating <= +f.maxRating);
    const priceOk = l => (!f.minBuyNow || l.buyNow >= +f.minBuyNow) && (!f.maxBuyNow || l.buyNow <= +f.maxBuyNow);

    const m = M();
    let res = m.listings.filter(l => l.status === 'active' && l.seller === 'AI' && match(DB().get(l.cardId)) && priceOk(l));
    if (res.length < 12) {
      const pool = tradeableCards().filter(c => c.promo !== 'bdor' && c.promo !== 'award').filter(match);
      for (let i = 0; i < 16 && pool.length; i++) {
        const l = makeAiListing(pickCardForListing(pool));
        if (priceOk(l)) { m.listings.push(l); res.push(l); }
      }
    }
    return res.sort((a, b) => a.buyNow - b.buyNow).slice(0, 40);
  }

  function getListing(id) { return M().listings.find(l => l.id === id); }

  /** Instant purchase. Item lands in the unassigned pile. */
  function buyNow(listingId) {
    const st = S(), l = getListing(listingId);
    if (!l || l.status !== 'active') return { ok: false, msg: 'Listing no longer available' };
    if (l.seller === 'you') return { ok: false, msg: 'That is your own listing' };
    const escrow = l.bidder === 'you' ? l.currentBid : 0;
    if (st.coins + escrow < l.buyNow) return { ok: false, msg: 'Not enough coins' };
    st.coins += escrow; st.coins -= l.buyNow;
    l.status = 'bought';
    st.watchlist = st.watchlist.filter(x => x !== l.id);
    const it = RUT.State.newItem(l.cardId, {});
    st.unassigned.push(it.id);
    RUT.State.log('Bought ' + DB().get(l.cardId).name + ' for ' + l.buyNow.toLocaleString() + 'c');
    try { RUT.Quests && RUT.Quests.event('buy'); } catch (e) { /* quests are optional */ }
    RUT.State.save();
    return { ok: true, itemId: it.id, msg: 'Purchased for ' + l.buyNow.toLocaleString() + 'c' };
  }

  /** Place a bid (coins are escrowed until outbid / auction ends). */
  function bid(listingId, amount) {
    const st = S(), l = getListing(listingId);
    if (!l || l.status !== 'active') return { ok: false, msg: 'Listing no longer available' };
    if (l.seller === 'you') return { ok: false, msg: 'That is your own listing' };
    const min = nextBid(l.currentBid, l.startPrice);
    amount = amount ? roundPrice(amount) : min;
    if (amount < min) return { ok: false, msg: 'Minimum bid is ' + min.toLocaleString() };
    if (amount >= l.buyNow) return buyNow(listingId);
    const refund = l.bidder === 'you' ? l.currentBid : 0;
    if (st.coins + refund < amount) return { ok: false, msg: 'Not enough coins' };
    st.coins += refund; st.coins -= amount;
    l.currentBid = amount; l.bidder = 'you';
    if (!st.watchlist.includes(l.id)) st.watchlist.push(l.id);
    RUT.State.save();
    return { ok: true, msg: 'Bid placed: ' + amount.toLocaleString() + 'c' };
  }

  function watch(listingId) { const st = S(); if (!st.watchlist.includes(listingId)) st.watchlist.push(listingId); RUT.State.save(); }
  function unwatch(listingId) {
    const st = S(), l = getListing(listingId);
    if (l && l.bidder === 'you' && l.status === 'active') return { ok: false, msg: 'You are the highest bidder' };
    st.watchlist = st.watchlist.filter(x => x !== listingId); RUT.State.save(); return { ok: true };
  }

  /** Claim a won auction from the watchlist (item already in unassigned). */
  function clearWon() {
    const st = S();
    st.watchlist = st.watchlist.filter(id => { const l = getListing(id); return l && l.status === 'active'; });
  }

  /* v109: at most 20 players sold (quick sold or listed) per day; resetting the limit costs 200,000 coins */
  const SELL_LIMIT = 20, SELL_RESET = 200000;
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function sellInfo() {
    const st = S(); if (!st.sellDay || st.sellDay.d !== dayKey()) st.sellDay = { d: dayKey(), n: 0 };
    return { n: st.sellDay.n, limit: SELL_LIMIT, left: Math.max(0, SELL_LIMIT - st.sellDay.n), resetCost: SELL_RESET };
  }
  function sellTake(k) {
    const i = sellInfo(); if (i.left < (k || 1)) return false;
    S().sellDay.n += (k || 1); return true;
  }
  function sellMsg() { return 'Daily sell limit reached (' + SELL_LIMIT + '). Reset it in the Transfer Market for ' + SELL_RESET.toLocaleString() + ' coins, or wait for midnight.'; }
  function sellReset() {
    const st = S(), i = sellInfo();
    if (!i.n) return { ok: false, msg: 'Nothing to reset: you have not sold any players today.' };
    if (st.coins < SELL_RESET) return { ok: false, msg: 'A reset costs ' + SELL_RESET.toLocaleString() + ' coins.' };
    RUT.State.addCoins(-SELL_RESET, 'Sell limit reset'); st.sellDay.n = 0; RUT.State.save();
    return { ok: true, msg: 'Sell limit reset: ' + SELL_LIMIT + ' more sales today (-' + SELL_RESET.toLocaleString() + ' coins).' };
  }

  /** List an owned item. */
  function list(itemId, startPrice, buyNowPrice, duration) {
    const st = S(), it = st.items[itemId];
    const fail = msg => ({ ok: false, isValid: false, msg, error: msg });
    if (!it) return fail('Listing Failed: item not found.');
    if (it.untradeable) return fail('Listing Failed: untradeable items cannot be listed.');
    if (RUT.State.isInSquad(itemId)) return fail('Listing Failed: remove the player from your squad first.');
    const card = DB().get(it.cardId);
    const r = range(card);
    if (!DURATIONS[duration]) return fail('Listing Failed: duration must be 1, 3, 6, 12 or 24 hours.');
    const m = M();
    const active = m.listings.filter(l => l.seller === 'you' && l.status === 'active' && l.itemId !== itemId).length;
    if (active >= MAX_ACTIVE_LISTINGS) return fail('Listing Failed: maximum of ' + MAX_ACTIVE_LISTINGS + ' active listings reached.');
    startPrice = roundPrice(+startPrice); buyNowPrice = roundPrice(+buyNowPrice);
    if (!(startPrice > 0) || !(buyNowPrice > 0)) return fail('Listing Failed: enter a Start Price and a Buy Now price.');
    if (buyNowPrice <= startPrice) return fail('Listing Failed: Buy Now must be higher than Start Price.');
    if (startPrice < r.min) return fail('Listing Failed: Start Price is below the Min Price of ' + r.min.toLocaleString() + '.');
    if (buyNowPrice > r.max) return fail('Listing Failed: Buy Now is above the Max Price of ' + r.max.toLocaleString() + '.');
    if (!sellTake(1)) return fail('Listing Failed: ' + sellMsg());
    RUT.State.detach(itemId);
    st.transferList.push(itemId);
    // remove any stale listing for this item
    m.listings = m.listings.filter(l => l.itemId !== itemId);
    m.listings.push({
      id: 'L' + (m.nextListingId++), cardId: it.cardId, itemId, seller: 'you',
      startPrice, buyNow: buyNowPrice, currentBid: 0, bidder: null,
      expiresTick: m.tick + DURATIONS[duration], status: 'active',
    });
    RUT.State.save();
    try { RUT.Quests && RUT.Quests.event('list'); } catch (e) { /* quests are optional */ }
    return { ok: true, isValid: true, msg: 'Listed ' + card.name + ' — BIN ' + buyNowPrice.toLocaleString() + ' (you receive ' + tax(buyNowPrice).net.toLocaleString() + ' after tax)' };
  }

  /** Pull an unsold/expired item back to the club. */
  function unlist(itemId) {
    const m = M(), l = m.listings.find(x => x.itemId === itemId && x.seller === 'you');
    if (l && l.status === 'active' && l.currentBid > 0) return { ok: false, msg: 'Item has bids — cannot remove' };
    m.listings = m.listings.filter(x => x.itemId !== itemId);
    const r = RUT.State.moveToClub(itemId);
    if (!r.isValid) { RUT.State.detach(itemId); S().unassigned.push(itemId); } // duplicates go back to Unassigned
    RUT.State.save();
    return { ok: true, isValid: true, msg: r.isValid ? 'Moved to club' : 'Duplicate moved to Unassigned' };
  }

  function clearSold() {
    const m = M(); m.listings = m.listings.filter(l => !(l.seller === 'you' && l.status === 'sold'));
    RUT.State.save();
  }

  function myListings() {
    const st = S(), m = M();
    return st.transferList.map(itemId => ({ itemId, listing: m.listings.find(l => l.itemId === itemId && l.seller === 'you') || null }))
      .concat(m.listings.filter(l => l.seller === 'you' && l.status === 'sold').map(l => ({ itemId: l.itemId, listing: l, sold: true })));
  }

  /** FUTBIN-style stats block for a card. */
  function priceStats(cardId) {
    const h = M().history[cardId] || [];
    if (!h.length) return null;
    const last24 = h.slice(-24);
    const now = h[h.length - 1], dayAgo = last24[0];
    return {
      current: roundPrice(now), min: Math.min(...h), max: Math.max(...h),
      avg: Math.round(h.reduce((a, b) => a + b, 0) / h.length),
      change24: ((now - dayAgo) / dayAgo) * 100, range: range(DB().get(cardId)), history: h.slice(),
    };
  }

  function ticksLeft(l) { return Math.max(0, l.expiresTick - M().tick); }
  /** Time left in market hours (one hour passes every TICK_MS of real time). */
  function timeLeftLabel(l) { const t = ticksLeft(l); return t >= 1 ? t + 'h' : '<1h'; }

  RUT.Market = {
    TICK_MS, TAX_RATE, DURATIONS, MAX_ACTIVE_LISTINGS,
    init, tick, search, buyNow, bid, watch, unwatch, clearWon, list, unlist, sellInfo, sellTake, sellReset, sellMsg, clearSold, myListings,
    getListing, currentPrice, priceStats, tax, increment, nextBid, priceRange: c => range(c), ticksLeft, timeLeftLabel,
    _setRandom(fn) { rand = fn; },
  };
})();
