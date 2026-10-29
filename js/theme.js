/* v282 (JODIO): dated event themes for the whole site. The first event whose window is open wins; no open window = the normal look.
   Edit the dates here (UTC). The colours live in css/themes.css under html[data-ev="<id>"]. */
(function () {
  window.RUT = window.RUT || {};
  const D = 864e5, T = s => Date.parse(s);
  const EVENTS = [
    { id: 'bdor', from: '2000-01-01T00:00:00Z', to: '2026-11-02T00:00:00Z' },                       // Ballon d'Or: black and gold, ends Monday 2 Nov 2026
    { id: 'toty', from: '2027-01-16T17:00:00Z', to: new Date(T('2027-01-16T17:00:00Z') + 14 * D).toISOString() },   // Team of the Year: 2 weeks from its release
    { id: 'tots', from: '2027-05-24T00:00:00Z', to: new Date(T('2027-05-24T00:00:00Z') + 14 * D).toISOString() },   // Team of the Season: 2 weeks from its release
    // Nations League weeks (match windows; edit when UEFA's dates change)
    { id: 'nl', from: '2026-11-12T00:00:00Z', to: '2026-11-19T00:00:00Z' },
    { id: 'nl', from: '2027-03-24T00:00:00Z', to: '2027-03-31T00:00:00Z' },
    { id: 'nl', from: '2027-06-08T00:00:00Z', to: '2027-06-16T00:00:00Z' },
  ];
  const now = Date.now(), live = EVENTS.filter(e => T(e.from) <= now && now < T(e.to))[0];
  RUT.EVENT = live ? live.id : '';
  RUT.BDOR_END = T('2026-11-02T00:00:00Z');
  RUT.bdorPackable = () => Date.now() < RUT.BDOR_END;   // after Monday the Ballon d'Or cards can't be packed any more (owned ones still play)
  if (live) document.documentElement.setAttribute('data-ev', live.id);
})();
