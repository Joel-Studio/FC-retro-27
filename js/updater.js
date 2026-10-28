/* =============================================================================
 * updater.js  —  v153 auto update
 * Every few minutes (and when the tab comes back into view) the page reads the
 * published js/version.js. When that build number is newer than the one this
 * copy started with, the page saves and reloads itself, but never in the middle
 * of a match or while a pop-up is open: it waits and shows a small banner.
 * ========================================================================== */
(function () {
  'use strict';
  const START = window.RUT_VERSION || 0, EVERY = 3 * 60 * 1000;
  if (!START || !window.fetch || /^file:/.test(location.protocol)) return;     // opened from a file: nothing to compare with
  let pending = 0, banner = null, wait = null;

  const busy = () => !!(window.App && App.match) || !!document.querySelector('#modal-root .modal');
  const showBanner = n => {
    if (banner) return;
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99998;background:#14305a;color:#fff;border:2px solid #ffd800;padding:8px 14px;font:12px/1.3 system-ui,sans-serif;border-radius:6px;box-shadow:0 4px 18px #0008';
    banner.textContent = 'New version ' + n + ' is ready. It will load when the match ends.';
    document.body.appendChild(banner);
  };
  const reload = n => {
    try { if (sessionStorage.getItem('rut_upd') === String(n)) return; sessionStorage.setItem('rut_upd', String(n)); } catch (e) { /* storage blocked */ }   // one reload per version, so a stale cache can never loop
    try { if (window.RUT && RUT.State && RUT.State.data) RUT.State.save(); } catch (e) { /* ignore */ }
    if (banner) banner.textContent = 'Updating to version ' + n + '...';
    setTimeout(() => location.reload(), 600);
  };
  const apply = () => {
    if (!pending) return;
    if (!busy()) { clearInterval(wait); wait = null; reload(pending); return; }
    showBanner(pending);
    if (!wait) wait = setInterval(apply, 4000);
  };
  const check = () => {
    fetch((window.RUT_VERSION_URL || 'js/version.js') + '?t=' + Date.now(), { cache: 'no-store' })   // v242: the Wix page asks GitHub directly
      .then(r => (r.ok ? r.text() : ''))
      .then(t => { const m = /RUT_VERSION\s*=\s*(\d+)/.exec(t || ''), n = m ? +m[1] : 0; if (n > START && n > pending) { pending = n; apply(); } })
      .catch(() => { /* offline: try again later */ });
  };
  setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setTimeout(check, 20000);
  window.RUT_checkUpdate = check;
})();
