/* v345 (JODIO): friends. A friend is a club name saved with your club (State.data.friends). Add by club name (checked against the cloud
   when it is reachable), invite to a game, and a head-to-head record that updates after every online match against that club. */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const norm = n => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  const key = n => norm(n).toLowerCase();
  const L = () => { const d = RUT.State.data; return d.friends || (d.friends = []); };
  const Friends = {
    norm,
    list() { return L().slice(); },
    find(name) { const k = key(name); return L().find(f => key(f.name) === k) || null; },
    /** Add a friend. Resolves {ok, msg}. Checks the cloud when it is on; a club the cloud has never seen is still accepted when offline. */
    async add(name) {
      name = norm(name); if (name.length < 3) return { ok: false, msg: 'Type the full club name (3 or more letters).' };
      const me = RUT.State.data.clubName; if (key(name) === key(me)) return { ok: false, msg: 'That is your own club.' };
      if (this.find(name)) return { ok: false, msg: name + ' is already a friend.' };
      if (L().length >= 50) return { ok: false, msg: 'Friends list is full (50).' };
      let shown = name, verified = false;
      try { const A = RUT.Auth, c = A && A.cloud; if (c && (await c.db())) { const h = await c.head(A.idOf(name)); if (h) { verified = true; shown = h.name || name; } else return { ok: false, msg: 'No club called ' + name + ' was found. Check the spelling (club names are exact).' }; } } catch (e) { /* offline: accept */ }
      L().push({ name: shown, added: Date.now(), w: 0, d: 0, l: 0, gf: 0, ga: 0, last: 0, verified });
      RUT.State.save(); return { ok: true, msg: shown + ' is now a friend.' };
    },
    /** Add straight from an online match (the opponent's name is already known). */
    addKnown(name) { name = norm(name); if (name.length < 1 || this.find(name) || key(name) === key(RUT.State.data.clubName)) return false; L().push({ name, added: Date.now(), w: 0, d: 0, l: 0, gf: 0, ga: 0, last: 0 }); RUT.State.save(); return true; },
    remove(name) { const k = key(name), a = L(), i = a.findIndex(f => key(f.name) === k); if (i < 0) return false; a.splice(i, 1); RUT.State.save(); return true; },
    /** After an online match: update the head-to-head with that club when it is a friend. */
    record(name, mine, theirs) { const f = this.find(name); if (!f) return null; if (mine > theirs) f.w++; else if (mine < theirs) f.l++; else f.d++; f.gf += mine; f.ga += theirs; f.last = Date.now(); RUT.State.save(); return f; },
  };
  RUT.Friends = Friends;
})();
