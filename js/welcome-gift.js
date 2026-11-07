/* One-time account gift, stored with the club so exported saves retain the claim. */
(function () {
  'use strict';
  const key = 'jnoe2-special-xi-v1';
  RUT.WelcomeGift = {
    grant() {
      const user = RUT.Auth && RUT.Auth.user, state = RUT.State, d = state.data;
      if (!user || String(user.name).trim().toLowerCase() !== 'jnoe2' || !d || (d.gifts && d.gifts[key])) return false;
      const allowed = new Set(['nlpofm', 'nlstar', 'clpromo', 'lpotw', 'lpotm', 'bdor', 'award', 'fstar', 'toty', 'tots']);
      const pool = RUT.DB.all.filter(c => allowed.has(c.promo) && c.rating >= 89 && c.rating <= 92 && c.baseId && /_\d+$/.test(c.id));
      // Shuffle before selecting distinct footballers, including across promo editions.
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const seen = new Set(), picks = pool.filter(c => { if (seen.has(c.baseId)) return false; seen.add(c.baseId); return true; }).slice(0, 11);
      if (picks.length !== 11) return false;
      const before = JSON.parse(JSON.stringify(d));
      try {
        const items = picks.map(c => {
          const item = state.newItem(c.id, { untradeable: true, promo: { baseId: c.baseId, type: c.promo, boost: Number(c.id.match(/_(\d+)$/)[1]) } });
          d.club.push(item.id); return item.id;
        });
        (d.gifts || (d.gifts = {}))[key] = { items, claimedAt: Date.now() };
        state.save();
        if (state._saveErr) { state.data = before; return false; }
        return true;
      } catch (error) { state.data = before; console.warn('Special XI gift deferred', error); return false; }
    }
  };
})();
