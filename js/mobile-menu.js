(function () {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.className = 'fc-explore';
  dialog.setAttribute('aria-labelledby', 'fc-explore-title');
  const groups = [
    ['Compete', [['leaguehub', 'Leagues'], ['quests', 'Objectives'], ['moments', 'Moments']]],
    ['Build your club', [['markethub', 'Transfers'], ['sbchub', 'Squad challenges'], ['store', 'Packs']]],
    ['Learn & manage', [['rules', 'Match rules'], ['playstyles', 'PlayStyles guide'], ['settings', 'Settings & saves']]]
  ];
  dialog.innerHTML = '<div class="fc-explore-head"><div><small>FC RETRO 27</small><h2 id="fc-explore-title">Explore</h2></div><button class="btn" data-close-explore aria-label="Close menu">✕</button></div>' +
    groups.map(([title, links]) => '<details><summary>' + title + '</summary><div class="fc-explore-links">' + links.map(([v, label]) => '<button data-act="nav" data-v="' + v + '">' + label + '<span aria-hidden="true"> →</span></button>').join('') + '</div></details>').join('') +
    '<details><summary>Tips & tricks</summary><p>Start in Club → Squad to check positions and chemistry before playing.</p><p>Use Objectives to find rewards, and compare a challenge’s requirements before submitting players.</p><p>Your save lives in this browser. Use Settings to export a transfer code before changing devices.</p></details><button class="btn" data-fullscreen>Enter fullscreen</button><p class="fc-screen-note" role="status">On iPhone, Add to Home Screen opens the game with less browser chrome.</p>';
  document.body.appendChild(dialog);
  const more = document.getElementById('mnav-more');
  more.setAttribute('aria-haspopup', 'dialog');
  more.setAttribute('aria-expanded', 'false');
  function close() { dialog.close(); more.setAttribute('aria-expanded', 'false'); }
  function fullscreen() {
    if (document.fullscreenElement || !document.fullscreenEnabled) return;
    document.documentElement.requestFullscreen().catch(() => { dialog.querySelector('.fc-screen-note').textContent = 'Fullscreen is unavailable here. The game still fits your screen.'; });
  }
  more.addEventListener('click', e => { e.stopPropagation(); dialog.showModal(); more.setAttribute('aria-expanded', 'true'); });
  dialog.addEventListener('close', () => more.setAttribute('aria-expanded', 'false'));
  dialog.addEventListener('click', e => {
    if (e.target.closest('[data-close-explore]') || e.target === dialog) close();
    if (e.target.closest('[data-act="nav"]')) close();
    if (e.target.closest('[data-fullscreen]')) fullscreen();
  });
  // Fullscreen requires a deliberate gesture. Try once on the first mobile navigation tap.
  let attempted = false;
  document.getElementById('mnav').addEventListener('click', e => {
    if (!attempted && e.target.closest('[data-act="nav"]') && matchMedia('(max-width: 800px), (max-height: 500px) and (pointer: coarse)').matches) { attempted = true; fullscreen(); }
  });
})();
