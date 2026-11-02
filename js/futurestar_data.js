/* v282 + v351 (JODIO): FUTURE STAR promo, 30 young players (about 21 and under: the game holds no real list of birth dates, so a few are 21-22).
   Released Monday 2 Nov 2026 (edit `release` to move it). picks[] is append-only (a card's id uses its place). `name` must be exactly the game's player name.
   Card = base rating +1% (never lower than base +1), NO PlayStyles and NO Gametraits, tradeable. `pot` is the player's potential (v354: +3 on every one, never above 95): the most the card can ever reach with
   Future Star evolutions (so a 91 Yamal can grow to 95). Cards come from packs, SBCs, the market and the Promo Shop. */
(function () {
  window.RUT = window.RUT || {};
  RUT.FSTAR = {
    label: 'Future Stars 2026', release: '2026-11-02T00:00:00Z',
    picks: [
      { name: 'Lamine Yamal', pot: 95 }, { name: 'Pau Cubarsí', pot: 95 }, { name: 'João Neves', pot: 95 }, { name: 'Désiré Doué', pot: 95 }, { name: 'Estêvão', pot: 95 },
      { name: 'Warren Zaïre-Emery', pot: 93 }, { name: 'Kobbie Mainoo', pot: 93 }, { name: 'Dean Huijsen', pot: 95 }, { name: 'Endrick', pot: 93 }, { name: 'Arda Güler', pot: 95 },
      { name: 'Kenan Yıldız', pot: 94 }, { name: 'Leny Yoro', pot: 93 }, { name: 'Rico Lewis', pot: 89 }, { name: 'Jorrel Hato', pot: 91 }, { name: 'Ethan Nwaneri', pot: 91 },
      { name: 'Myles Lewis-Skelly', pot: 90 }, { name: 'Archie Gray', pot: 90 }, { name: 'Claudio Echeverri', pot: 89 }, { name: 'Jamie Gittens', pot: 90 }, { name: 'Nico Paz', pot: 93 },
      { name: 'Yan Diomandé', pot: 93 }, { name: 'Lucas Bergvall', pot: 91 }, { name: 'Max Dowman', pot: 91 }, { name: 'Rio Ngumoha', pot: 89 }, { name: 'Ayden Heaven', pot: 88 },
      { name: 'Mathys Tel', pot: 89 }, { name: 'Malick Fofana', pot: 89 }, { name: 'Francesco Pio Esposito', pot: 88 }, { name: 'Wilson Odobert', pot: 88 }, { name: 'Samu Omorodion', pot: 88 },
    ],
  };
  RUT.FSTAR.pct = () => 1;   // flat +1%
})();
