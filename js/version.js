/* The game's build number. Bump it on every publish: open copies compare it with the published one and reload themselves when it is newer (js/updater.js). */
window.RUT_VERSION = 286;
/* v200 Lite mode: phones, tablets and weak computers (4 cores or 4 GB or less) get a lighter game: 2D Low graphics instead of WebGL 3D, drawing at 30 fps,
   no 3D pack scenes, fewer blur effects. Settings > Performance can force it on ('lite') or off ('full'). */
window.RUT_LITE = (function () {
  let s = {}; try { s = JSON.parse(localStorage.getItem('rut_settings') || '{}') || {}; } catch (e) { /* ignore */ }
  if (s.perf === 'lite') return true; if (s.perf === 'full') return false;
  const n = navigator, mob = /Android|iPhone|iPad|iPod|Mobile/i.test(n.userAgent || '') || (n.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
  return mob || (n.hardwareConcurrency || 8) <= 4 || (n.deviceMemory || 8) <= 4;
})();
if (window.RUT_LITE) document.documentElement.classList.add('lite');
