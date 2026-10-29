/* v282 (JODIO): FUTURE STAR promo, for players under 21. Released Monday 2 Nov 2026 (edit `release` to move it).
   picks[] is append-only and in ranking order (a card's id uses its place): the ranking is how far the player's club and country went in
   the cups this season. Rank 1 gets +3%, rank 10 +1%, everyone after rank 10 +1%. `name` must be exactly the game's player name.
   Rating = base rating +boost%, never lower than base +1, cap 93. Cards live in the Promo Shop (90% off with a plain gold card). */
(function () {
  window.RUT = window.RUT || {};
  RUT.FSTAR = {
    label: 'Future Stars 2026', release: '2026-11-02T00:00:00Z',
    picks: [
      { name: 'Lamine Yamal' }, { name: 'Pau Cubarsí' }, { name: 'João Neves' }, { name: 'Désiré Doué' }, { name: 'Estêvão' },
      { name: 'Warren Zaïre-Emery' }, { name: 'Kobbie Mainoo' }, { name: 'Dean Huijsen' }, { name: 'Endrick' }, { name: 'Arda Güler' },
      { name: 'Kenan Yıldız' }, { name: 'Leny Yoro' }, { name: 'Rico Lewis' }, { name: 'Jorrel Hato' }, { name: 'Ethan Nwaneri' },
      { name: 'Myles Lewis-Skelly' }, { name: 'Archie Gray' }, { name: 'Claudio Echeverri' }, { name: 'Jamie Gittens' }, { name: 'Nico Paz' },
    ],
  };
  RUT.FSTAR.pct = rank => rank <= 1 ? 3 : rank >= 10 ? 1 : 3 - (rank - 1) * (2 / 9);
})();
