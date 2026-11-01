/* v328 (JODIO, FC27 menu video): menu animations. See css/menufx.css. Off with ?nofx=1. */
(function () {
  'use strict';
  window.RUT = window.RUT || {};
  try { if (/[?&]nofx=1/.test(location.search)) return; } catch (e) { /* ignore */ }
  const de = document.documentElement;
  de.classList.add('fx-on');
  const el = (cls, html) => { const d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; return d; };
  // a light sweeps across the screen on each page change
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act="nav"]'); if (!b) return;
    const s = el('fx-sweep'); document.body.appendChild(s); setTimeout(() => s.remove(), 750);
  }, true);
  // "Entering the grounds" before a match
  RUT.MenuFX = {
    enter() { try { const d = el('fx-enter', 'ENTERING THE GROUNDS<i></i><i></i><i></i>'); document.body.appendChild(d); setTimeout(() => d.remove(), 1600); } catch (e) { /* ignore */ } },
    welcome(name) {
      try { if (sessionStorage.getItem('rut_fx_welcome')) return; sessionStorage.setItem('rut_fx_welcome', '1'); } catch (e) { /* ignore */ }
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const w = el('fx-welcome', '<small>WELCOME TO THE CLUB</small><h1>THE CLUB IS YOURS</h1><h2>' + esc(name || '') + '</h2><button class="btn y">Let’s play!</button>');
      const close = () => { w.classList.add('out'); setTimeout(() => w.remove(), 500); window.removeEventListener('keydown', key, true); };
      const key = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); } };
      w.addEventListener('click', close); window.addEventListener('keydown', key, true);
      document.body.appendChild(w); setTimeout(close, 6000);
    },
  };
  // after the login and the opening ident, greet the club once per visit
  let tries = 0;
  const wait = setInterval(() => {
    if (++tries > 240) { clearInterval(wait); return; }
    if (document.getElementById('auth-root') || document.getElementById('fcr-intro')) return;
    const st = RUT.State && RUT.State.data; const nm = st && st.clubName; if (!nm) return;
    clearInterval(wait); RUT.MenuFX.welcome(nm);
  }, 500);
})();
