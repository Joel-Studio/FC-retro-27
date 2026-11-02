/* v282 + v351 (JODIO): FUTURE STAR promo, 30 young players (about 21 and under: the game holds no real list of birth dates, so a few are 21-22).
   Released Monday 2 Nov 2026 (edit `release` to move it). picks[] is append-only (a card's id uses its place). `name` must be exactly the game's player name.
   Card = base rating +1% (never lower than base +1), NO PlayStyles and NO Gametraits, tradeable. `pot` is the player's potential: the most the card can ever reach with
   Future Star evolutions (so a 91 Yamal can grow to 95). Cards come from packs, SBCs, the market and the Promo Shop. */
(function () {
  window.RUT = window.RUT || {};
  RUT.FSTAR = {
    label: 'Future Stars 2026', release: '2026-11-02T00:00:00Z',
    picks: [
      { name: 'Lamine Yamal', pot: 95 }, { name: 'Pau Cubarsí', pot: 93 }, { name: 'João Neves', pot: 93 }, { name: 'Désiré Doué', pot: 93 }, { name: 'Estêvão', pot: 92 },
      { name: 'Warren Zaïre-Emery', pot: 90 }, { name: 'Kobbie Mainoo', pot: 90 }, { name: 'Dean Huijsen', pot: 92 }, { name: 'Endrick', pot: 90 }, { name: 'Arda Güler', pot: 92 },
      { name: 'Kenan Yıldız', pot: 91 }, { name: 'Leny Yoro', pot: 90 }, { name: 'Rico Lewis', pot: 86 }, { name: 'Jorrel Hato', pot: 88 }, { name: 'Ethan Nwaneri', pot: 88 },
      { name: 'Myles Lewis-Skelly', pot: 87 }, { name: 'Archie Gray', pot: 87 }, { name: 'Claudio Echeverri', pot: 86 }, { name: 'Jamie Gittens', pot: 87 }, { name: 'Nico Paz', pot: 90 },
      { name: 'Yan Diomandé', pot: 90 }, { name: 'Lucas Bergvall', pot: 88 }, { name: 'Max Dowman', pot: 88 }, { name: 'Rio Ngumoha', pot: 86 }, { name: 'Ayden Heaven', pot: 85 },
      { name: 'Mathys Tel', pot: 86 }, { name: 'Malick Fofana', pot: 86 }, { name: 'Francesco Pio Esposito', pot: 85 }, { name: 'Wilson Odobert', pot: 85 }, { name: 'Samu Omorodion', pot: 85 },
    ],
  };
  RUT.FSTAR.pct = () => 1;   // flat +1%
})();
