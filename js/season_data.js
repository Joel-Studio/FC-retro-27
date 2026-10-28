/* v257 (JODIO): Team of the Year (released in January) and Team of the Season (released at the last game of the season).
   Each is 30 cards built from what FUTBIN and EA FC 27 publish. A card has the pick's own rating (as published), 3 gold PlayStyles and 3 Gametraits.
   The cards only exist in the game from `release` on. picks[] is append-only (a card's id uses its place in the list): { name (exactly the game's player name), rating, why }.
   Filled in by the routine in /mnt/project-files/retro-ut-tools/SEASON_AUTOUPDATE.md. Ronaldo is guaranteed in both (96 / 95), per JODIO. */
(function () {
  window.RUT = window.RUT || {};
  RUT.SEASON_DATA = {
    toty: { label: 'Team of the Year 2026', release: '2027-01-16T17:00:00Z', picks: [
      { name: 'Cristiano Ronaldo', rating: 96, why: 'Guaranteed pick (JODIO)' },
    ] },
    tots: { label: 'Team of the Season 2026/27', release: '2027-05-24T00:00:00Z', picks: [
      { name: 'Cristiano Ronaldo', rating: 95, why: 'Guaranteed pick (JODIO)' },
    ] },
  };
})();
