/* FC Retro 27: opening ident played every time the app opens (v168, JODIO: "an animation like EA Sports but it says FCR27 Dream Club").
 * Black screen, a light streak, a 3D gold coin spins in, impact flash and shockwave, the chrome "FCR27" word slams in, "DREAM CLUB"
 * spreads out under it, a tagline slides in, then it fades into the game. v190 (JODIO): no voice; stadium spotlights, a moving pitch floor, gold confetti and an orbiting spark were added.
 * Tap, click or any key skips it. Add ?nointro=1 to the address to turn it off. Styles live in css/style.css (.fi-*). */
(function () {
  'use strict';
  try { if (/[?&]nointro=1/.test(location.search) || window.RUT_NOINTRO) return; } catch (e) { /* ignore */ }

  const DUR = 6.2;   // seconds until the game shows
  const root = document.createElement('div');
  root.id = 'fcr-intro'; root.className = 'fi'; root.setAttribute('aria-label', 'FCR27 Dream Club');
  const layers = '<i class="fi-l"></i>'.repeat(10);
  root.innerHTML = `<canvas class="fi-fx"></canvas><div class="fi-rays"></div><div class="fi-streak"></div>
    <div class="fi-stage">
      <div class="fi-emblem"><div class="fi-coin">${layers}<div class="fi-back"><b>27</b></div>
        <div class="fi-face"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="fi-ring" cx="50" cy="50" r="45"/><circle class="fi-ring2" cx="50" cy="50" r="39"/></svg>
          <span class="fi-star">&#9733;</span><span class="fi-mono">FCR</span><span class="fi-glint"></span></div></div></div>
      <div class="fi-word">FCR27</div>
      <div class="fi-sub">DREAM CLUB</div>
      <div class="fi-tag"><span>ULTIMATE TEAM</span><i></i><span>SEASON 26/27</span></div>
    </div>
    <div class="fi-shock"></div><div class="fi-flash"></div><div class="fi-skip">Tap to skip</div>`;
  (document.body || document.documentElement).appendChild(root);

  /* ---- particles: impact burst, then drifting embers ---- */
  const cv = root.querySelector('.fi-fx'), ctx = cv.getContext('2d');
  const fit = () => { const d = window.RUT_LITE ? 1 : Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  fit(); addEventListener('resize', fit);
  const parts = [], conf = [];
  const t0 = performance.now(); let burst = false, raf = 0, done = false;
  const frame = now => {
    if (done) return;
    const t = (now - t0) / 1000, W = innerWidth, H = innerHeight, cx = W / 2, cy = H * 0.36;
    if (!burst && t > 2.1) {
      burst = true;
      for (let i = 0; i < 150; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 9; parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, life: 1, d: 0.008 + Math.random() * 0.012, r: 1 + Math.random() * 2.2, g: Math.random() < 0.7 }); }
    }
    if (t > 2.1 && Math.random() < 0.55) parts.push({ x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 1.4, life: 1, d: 0.004 + Math.random() * 0.004, r: 0.8 + Math.random() * 1.8, g: true });
    ctx.clearRect(0, 0, W, H);
    // v190: a pitch floor rushing toward the camera, two stadium spotlights sweeping, gold confetti after the impact, a spark orbiting the coin
    { const fa = Math.min(1, Math.max(0, (t - 0.3) / 1.2)) * (t > 4.6 ? Math.max(0, 1 - (t - 4.6) / 0.8) : 1), hz = H * 0.62;
      if (fa > 0) { ctx.strokeStyle = `rgba(244,197,66,${0.22 * fa})`; ctx.lineWidth = 1;
        for (let k = -12; k <= 12; k++) { ctx.beginPath(); ctx.moveTo(cx + k * 18, hz); ctx.lineTo(cx + k * W * 0.16, H + 20); ctx.stroke(); }
        for (let k = 0; k < 9; k++) { const z = ((k + (t * 1.6) % 1) / 9), y = hz + (H - hz) * z * z; ctx.globalAlpha = fa * z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.globalAlpha = 1; } }
    ctx.globalCompositeOperation = 'lighter';
    { const la = Math.min(1, Math.max(0, (t - 0.6) / 0.8)) * (t > 4.8 ? Math.max(0, 1 - (t - 4.8) / 0.6) : 1);
      if (la > 0) [[0, 1], [W, -1]].forEach(([x0, sd], k) => { const a = -Math.PI / 2 + sd * (0.35 + 0.3 * Math.sin(t * 1.3 + k * 1.7)), L = H * 1.3, sp = 0.09;
        const g = ctx.createLinearGradient(x0, H, x0 + Math.cos(a) * L, H + Math.sin(a) * L); g.addColorStop(0, `rgba(255,236,170,${0.32 * la})`); g.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, H); ctx.lineTo(x0 + Math.cos(a - sp) * L, H + Math.sin(a - sp) * L); ctx.lineTo(x0 + Math.cos(a + sp) * L, H + Math.sin(a + sp) * L); ctx.closePath(); ctx.fill(); }); }
    if (t > 0.9 && t < 2.15) { const cs = Math.min(W, H) * 0.2, a = t * 9, rx = cs * 0.75, ry = cs * 0.28;
      for (let k = 0; k < 6; k++) { const b = a - k * 0.12; ctx.fillStyle = `rgba(255,230,140,${0.9 - k * 0.14})`; ctx.beginPath(); ctx.arc(cx + Math.cos(b) * rx, cy + Math.sin(b) * ry, 3.2 - k * 0.4, 0, Math.PI * 2); ctx.fill(); } }
    ctx.globalCompositeOperation = 'source-over';
    if (t > 2.15 && t < 2.3 && !conf.length) for (let i = 0; i < 90; i++) conf.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vy: 1.2 + Math.random() * 2, vx: (Math.random() - 0.5) * 1.2, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, w: 4 + Math.random() * 5, c: ['#f4c542', '#fff1c0', '#c8901c', '#ffffff'][i % 4] });
    for (const c of conf) { c.x += c.vx + Math.sin(t * 3 + c.r) * 0.6; c.y += c.vy; c.r += c.vr; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.scale(1, Math.cos(t * 6 + c.r)); ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -2, c.w, 4); ctx.restore(); }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= 0.975; p.vy *= 0.975; p.life -= p.d;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const a = Math.min(1, p.life * 1.4);
      ctx.fillStyle = p.g ? `rgba(255,${190 + (p.r * 20 | 0)},90,${a})` : `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  /* ---- sound: whoosh, riser, impact boom and a bright chord, made with Web Audio (v190: the voice is gone) ---- */
  let ac = null;
  function sound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = new AC(); if (ac.state === 'suspended') ac.resume().catch(() => 0);
      const out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
      const now = ac.currentTime + 0.05;
      const noise = len => { const b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = ac.createBufferSource(); s.buffer = b; return s; };
      const env = (g, t, a, peak, rel) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel); };
      // whoosh, panned left to right with the light streak
      { const n = noise(1.2), f = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner ? ac.createStereoPanner() : null;
        f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, now + 0.1); f.frequency.exponentialRampToValueAtTime(3200, now + 0.8);
        env(g, now + 0.1, 0.35, 0.5, 0.6); n.connect(f); f.connect(g);
        if (p) { p.pan.setValueAtTime(-0.9, now + 0.1); p.pan.linearRampToValueAtTime(0.9, now + 0.9); g.connect(p); p.connect(out); } else g.connect(out);
        n.start(now + 0.1); n.stop(now + 1.3); }
      // riser while the coin spins
      { const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, now + 0.9); o.frequency.exponentialRampToValueAtTime(520, now + 2.05); f.type = 'lowpass'; f.frequency.setValueAtTime(400, now + 0.9); f.frequency.exponentialRampToValueAtTime(2600, now + 2.05);
        g.gain.setValueAtTime(0.0001, now + 0.9); g.gain.exponentialRampToValueAtTime(0.12, now + 2.0); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.12);
        o.connect(f); f.connect(g); g.connect(out); o.start(now + 0.9); o.stop(now + 2.2); }
      // impact: sub drop + noise crack
      { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(130, now + 2.1); o.frequency.exponentialRampToValueAtTime(38, now + 2.8);
        env(g, now + 2.1, 0.01, 1.0, 1.4); o.connect(g); g.connect(out); o.start(now + 2.1); o.stop(now + 3.6);
        const n = noise(0.5), f = ac.createBiquadFilter(), g2 = ac.createGain(); f.type = 'lowpass'; f.frequency.value = 1800; env(g2, now + 2.1, 0.005, 0.6, 0.35); n.connect(f); f.connect(g2); g2.connect(out); n.start(now + 2.1); n.stop(now + 2.6); }
      // bright chord with a short echo tail
      { const dl = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain(); dl.delayTime.value = 0.23; fb.gain.value = 0.35; wet.gain.value = 0.5; dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
        [523.25, 659.25, 783.99, 1046.5].forEach((fq, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = i === 3 ? 'sine' : 'triangle'; o.frequency.value = fq;
          env(g, now + 2.12, 0.02, i === 3 ? 0.08 : 0.13, 2.4); o.connect(g); g.connect(out); g.connect(dl); o.start(now + 2.12); o.stop(now + 4.8); }); }
    } catch (e) { /* no sound here */ }
  }
  sound();

  /* ---- end / skip ---- */
  function finish(fast) {
    if (done) return; done = true;
    clearTimeout(endTimer);
    root.classList.add('fi-out');
    setTimeout(() => { cancelAnimationFrame(raf); root.remove(); removeEventListener('resize', fit); if (ac) setTimeout(() => ac.close().catch(() => 0), 2500); }, fast ? 380 : 750);
    removeEventListener('keydown', skip, true);
  }
  const skip = e => { if (e && e.type === 'keydown' && /^(Shift|Control|Alt|Meta)$/.test(e.key)) return; if (e) { e.preventDefault(); e.stopPropagation(); } finish(true); };
  const endTimer = setTimeout(() => finish(false), (DUR - 0.75) * 1000);
  root.addEventListener('pointerdown', skip);
  addEventListener('keydown', skip, true);
  window.RUT_INTRO = { skip: () => finish(true) };
})();
