/* v255 (JODIO): Nations League cards follow how far their country got. rank = the country's finish (1 winner, 2 runner-up, 3 third, 4 fourth, 5-8 quarter-finalists, 9-12 third in the league phase, 13-16 bottom).
   While the tournament is running (stage not 'final') the rank is a projection from the league tables and a projected winner is treated as runner-up: only the real winner gets the 97 cap.
   Updated by the Nations League routine (see /mnt/project-files/retro-ut-tools/NL_AUTOUPDATE.md): edit `stage`, `updated`, `rank`. Keys are the game's nation codes. */
(function () {
  window.RUT = window.RUT || {};
  RUT.NL_DATA = {
    updated: '2026-10-28', stage: 'league phase (matchday 2 of 6)',
    rank: { GRE: 1, POR: 2, BEL: 3, FRA: 4, ESP: 5, CRO: 6, NED: 7, DEN: 8, NOR: 9, GER: 10, ENG: 11, CZE: 12, TUR: 13, ITA: 14, SRB: 15, WAL: 16 },
    why: 'Standings after matchday 2 (points, then goal difference); Wikipedia 2026-27 UEFA Nations League A, updated 27 Sept 2026.',
  };
})();
