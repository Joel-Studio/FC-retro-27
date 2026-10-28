/* =============================================================================
 * potw_data.js  —  v249 (JODIO): Player of the Week (+1%, max 92) and Player of the Month (+2%, max 93)
 * One pick per league (Premier League, LaLiga, Serie A, Bundesliga, Ligue 1): the best real performer that
 * week / month who is in the game. A player gets each card only once. Updated by the weekly routine.
 * ========================================================================== */
window.RUT = window.RUT || {};
RUT.POTW_DATA = {
  weeks: [
    { label: '24-26 Oct 2026', picks: [
      { lg: 'EPL', name: 'Gabriel Magalhães', why: 'Headline Premier League player in EA FC 27 TOTW 7' },
      { lg: 'LAL', name: 'Kylian Mbappé', why: 'Headline LaLiga player in TOTW 7 (Barcelona 1-2 Real Madrid)' },
      { lg: 'SEA', name: 'Matías Soulé', why: 'Top Sofascore rating of Serie A round 8 (9.7)' },
      { lg: 'BUN', name: 'Michael Olise', why: 'Bundesliga round 7 team of the week standout (top-rated Rômulo is not in the game)' },
      { lg: 'L1', name: 'Leonardo Balerdi', why: 'Ligue 1 pick in TOTW 7' },
    ] },
  ],
  months: [
    { label: 'September 2026', picks: [
      { lg: 'EPL', name: 'Alexander Isak', why: 'Premier League POTM nominee (winner Pascal Groß is not in the game)' },
      { lg: 'LAL', name: 'Raphinha', why: 'LaLiga Player of the Month: 7 goals, 2 assists' },
      { lg: 'SEA', name: 'Donyell Malen', why: 'Serie A Player of the Month' },
      { lg: 'BUN', name: 'Michael Olise', why: 'Bundesliga Player of the Month' },
      { lg: 'L1', name: 'Ferran Torres', why: 'UNFP Ligue 1 Player of the Month' },
    ] },
  ],
};
