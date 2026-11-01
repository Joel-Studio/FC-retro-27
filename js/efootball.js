/* v347 (JODIO): eFootball-style extras, batch 1: Daily Scout (pick 1 of 3 players a day), Knockout Cup (entry fee, 3 rounds, prize ladder).
   State.data.scout = { day, offers:[cardId], taken }, State.data.cup = { round, alive, fee } */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const S = () => RUT.State.data;
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const Scout = {
    state() {
      const d = S(), k = dayKey(); if (d.scout && d.scout.day === k) return d.scout;
      const lv = RUT.Progress ? RUT.Progress.info().lv : 1, lo = 72 + Math.min(12, lv), pool = RUT.DB.all.filter(c => !c.promo && c.rating >= lo && c.rating <= lo + 6 && c.position !== 'GK');
      const offers = []; for (let i = 0; i < 3 && pool.length; i++) { const c = pool[Math.floor(Math.random() * pool.length)]; if (!offers.includes(c.id)) offers.push(c.id); else i--; if (pool.length < 4 && offers.length >= pool.length) break; }
      return (d.scout = { day: k, offers, taken: false });
    },
    take(idx) { const s = this.state(); if (s.taken || !s.offers[idx]) return null; s.taken = true; const it = RUT.State.newItem(s.offers[idx], {}); S().unassigned.push(it.id); RUT.State.save(); return RUT.DB.get(s.offers[idx]); },
    skip() { const s = this.state(); if (s.taken) return false; s.taken = true; RUT.State.addCoins(2000, 'Scout offer declined'); RUT.State.save(); return true; },
  };
  const ROUNDS = [{ name: 'Quarter-final', lo: 78, hi: 85, coins: 15000 }, { name: 'Semi-final', lo: 84, hi: 91, coins: 40000 }, { name: 'Final', lo: 90, hi: 96, coins: 120000, pack: 'gold' }];
  const FEE = 10000;
  const Cup = {
    ROUNDS, FEE,
    state() { return S().cup || (S().cup = { round: 0, alive: false }); },
    enter() { const c = this.state(); if (c.alive) return 'You are already in the cup.'; if (S().coins < FEE) return 'You need ' + FEE.toLocaleString() + ' coins to enter.'; RUT.State.addCoins(-FEE, 'Knockout Cup entry'); S().cup = { round: 0, alive: true }; RUT.State.save(); return ''; },
    /** After a cup match. Returns { won, prize, over, champion }. */
    result(res) { const c = this.state(), r = ROUNDS[c.round]; if (!c.alive || !r) return null; if (res.won || res.score[0] > res.score[1]) { RUT.State.addCoins(r.coins, 'Cup ' + r.name); if (r.pack) { const po = S().packsOwned; po[r.pack] = (po[r.pack] || 0) + 1; } c.round++; const champion = c.round >= ROUNDS.length; if (champion) { c.alive = false; c.round = 0; } RUT.State.save(); return { won: true, prize: r.coins, pack: r.pack, champion, over: champion }; } c.alive = false; c.round = 0; RUT.State.save(); return { won: false, prize: 0, over: true }; },
  };
  RUT.Scout = Scout; RUT.Cup = Cup;
})();
