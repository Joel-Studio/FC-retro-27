/* v370 (JODIO): full 3D pre-match show. A night stadium with a tunnel, both teams walking out in their kits, the line-ups, then both XIs taking their places.
   Each competition has its own colours, centre-piece and effects (Champions League starball + falling stars, Premier League crown, LaLiga sun, Serie A flags,
   Ligue 1 diamond, Bundesliga halo, Rivals flames, cup trophy and confetti). Needs three.js (RUT.load3D). main.js (preMatch) draws the HTML boards on top.
   RUT.Intro3D.themeFor(o) -> theme, RUT.Intro3D.start({canvas, w, h, theme, home, away, onShot, onTick, onEnd}) -> { stop() } */
(function () {
  'use strict';
  const SHOTS = [['ident', 2.8], ['walk', 4.6], ['away', 3.4], ['home', 3.4], ['ko', 3.0]];
  const TOTAL = SHOTS.reduce((a, s) => a + s[1], 0);
  const THEMES = {
    ucl: { key: 'ucl', name: 'UEFA CHAMPIONS LEAGUE', sub: 'THE NIGHT OF EUROPE', c: ['#9fb8ff', '#ffffff', '#1b2a6b'], sky: 0x060a2c, fx: 'stars', piece: 'starball' },
    champs: { key: 'champs', name: 'CHAMPIONS', sub: 'THE BIG FINAL', c: ['#ffd04a', '#fff3c0', '#8a5f06'], sky: 0x120a02, fx: 'confetti', piece: 'cup' },
    rivals: { key: 'rivals', name: 'DIVISION RIVALS', sub: 'CLIMB THE DIVISIONS', c: ['#ff7a1a', '#ffffff', '#3a1000'], sky: 0x1a0600, fx: 'flares', piece: 'flame' },
    EPL: { key: 'EPL', name: 'PREMIER LEAGUE', sub: 'ENGLISH FOOTBALL', c: ['#e8b6ff', '#ffffff', '#3d195b'], sky: 0x1a0630, fx: 'bursts', piece: 'crown' },
    LAL: { key: 'LAL', name: 'LALIGA', sub: 'SPANISH FOOTBALL', c: ['#ff4b4b', '#ffb84a', '#5a0a10'], sky: 0x240808, fx: 'bursts', piece: 'sun' },
    SEA: { key: 'SEA', name: 'SERIE A', sub: 'ITALIAN FOOTBALL', c: ['#37b6ff', '#ffffff', '#06324d'], sky: 0x04122a, fx: 'ribbons', piece: 'flags' },
    L1: { key: 'L1', name: 'LIGUE 1', sub: 'FRENCH FOOTBALL', c: ['#d7ff3a', '#ffffff', '#0a1d4a'], sky: 0x050b24, fx: 'bursts', piece: 'diamond' },
    BUN: { key: 'BUN', name: 'BUNDESLIGA', sub: 'GERMAN FOOTBALL', c: ['#ff2b2b', '#ffffff', '#222222'], sky: 0x120404, fx: 'flares', piece: 'halo' },
    cup: { key: 'cup', name: 'KNOCKOUT CUP', sub: 'WIN OR GO HOME', c: ['#ffd04a', '#ffffff', '#7a1f1f'], sky: 0x120a14, fx: 'confetti', piece: 'cup' },
    rush: { key: 'rush', name: 'RUSH 5v5', sub: 'FAST AND LOUD', c: ['#3cf2ff', '#ff5ad8', '#101030'], sky: 0x060616, fx: 'bursts', piece: 'diamond' },
    def: { key: 'def', name: 'MATCH DAY', sub: 'FC RETRO 27', c: ['#6ea8ff', '#ffffff', '#101a44'], sky: 0x0a0d26, fx: 'bursts', piece: 'sun' },
  };
  function themeFor(o) {
    const t = String(o.tag || ''), c = o.comp || '';
    if (/champions league/i.test(t)) return THEMES.ucl;
    if (t === 'Champions') return THEMES.champs;
    if (t === 'Rivals') return THEMES.rivals;
    if (/top 5/i.test(t) && THEMES[c]) return THEMES[c];
    if (/rush/i.test(t)) return THEMES.rush;
    if (/cup|knockout|playoff/i.test(t) || o.knockout) return THEMES.cup;
    return THEMES.def;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, ease = t => t * t * (3 - 2 * t);
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  function canvasTex(T, c, repX, repY) { const t = new T.CanvasTexture(c); if (T.sRGBEncoding) t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; if (repX) t.repeat.set(repX, repY || 1); return t; }
  function pitchTex(T) {
    const c = document.createElement('canvas'); c.width = 1050; c.height = 680; const g = c.getContext('2d');
    for (let i = 0; i < 21; i++) { g.fillStyle = i % 2 ? '#1f7a34' : '#27903f'; g.fillRect(i * 50, 0, 50, 680); }
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 4; g.strokeRect(20, 20, 1010, 640); g.beginPath(); g.moveTo(525, 20); g.lineTo(525, 660); g.stroke();
    g.beginPath(); g.arc(525, 340, 92, 0, 7); g.stroke(); g.strokeRect(20, 150, 165, 380); g.strokeRect(865, 150, 165, 380); g.strokeRect(20, 250, 55, 180); g.strokeRect(975, 250, 55, 180);
    return canvasTex(T, c);
  }
  function crowdTex(T, cols) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#10142c'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 1500; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = 0.55 + rnd() * 0.45; g.fillRect((rnd() * 256) | 0, (rnd() * 64) | 0, 2, 2); }
    return canvasTex(T, c, 6, 1);
  }
  function textTex(T, text, w, h, fg, bg, size) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'italic 800 ' + size + 'px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
    return canvasTex(T, c);
  }
  function glowTex(T) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); }

  function rowOf(c) { const p = (c && c.position) || ''; return p === 'GK' ? 0 : /^(CB|LB|RB|LWB|RWB)$/.test(p) ? 1 : /^(CDM|CM|LM|RM|CAM)$/.test(p) ? 2 : 3; }
  function sideOf(c) { const p = (c && c.position) || ''; return /^L/.test(p) ? -1 : /^R/.test(p) ? 1 : 0; }
  /** Formation spots on the pitch (x along the length) for one side: dir -1 = left half, +1 = right half. */
  function formation(cards, dir) {
    const rows = [[], [], [], []]; cards.forEach((c, i) => rows[rowOf(c)].push(i)); rows.forEach(r => r.sort((a, b) => sideOf(cards[a]) - sideOf(cards[b])));
    const out = []; const X = [48, 33, 19, 7], sg = dir < 0 ? -1 : 1;
    rows.forEach((r, ri) => r.forEach((i, k) => { const n = r.length; out[i] = { x: sg * X[ri], z: ri === 0 ? 0 : (k - (n - 1) / 2) * Math.min(14, 46 / Math.max(1, n)) }; }));
    return out;
  }

  function start(o) {
    const T = window.THREE; if (!T) return null;
    const th = o.theme || THEMES.def, W = o.w, H = o.h, C = th.c;
    const renderer = new T.WebGLRenderer({ canvas: o.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); if (T.sRGBEncoding) renderer.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene(); scene.background = new T.Color(th.sky); scene.fog = new T.Fog(th.sky, 90, 260);
    const cam = new T.PerspectiveCamera(52, W / H, 0.5, 600);
    scene.add(new T.HemisphereLight(0xb8c8ff, 0x203020, 0.95)); const sun = new T.DirectionalLight(0xffffff, 0.8); sun.position.set(-30, 60, 40); scene.add(sun);
    const accent = new T.PointLight(new T.Color(C[0]), 1.2, 140); accent.position.set(0, 24, 0); scene.add(accent);
    const glow = glowTex(T);

    // ground, pitch
    const pitch = new T.Mesh(new T.PlaneGeometry(105, 68), new T.MeshLambertMaterial({ map: pitchTex(T) })); pitch.rotation.x = -Math.PI / 2; scene.add(pitch);
    const apron = new T.Mesh(new T.PlaneGeometry(260, 200), new T.MeshLambertMaterial({ color: 0x0e1a12 })); apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05; scene.add(apron);

    // stands: stepped boxes with a crowd texture, tinted by the home kit and the competition colours
    const fanCols = [o.home.kit[0], o.home.kit[1], o.away.kit[0], C[0], '#ffffff', '#c8102e', '#1d428a', '#f4c542', '#2e7d32'];
    const crowd = crowdTex(T, fanCols), crowdMat = new T.MeshBasicMaterial({ map: crowd, color: 0xbbbbbb });
    const stand = (len, x, z, ry) => { const g = new T.Group(); for (let r = 0; r < 12; r++) { const b = new T.Mesh(new T.BoxGeometry(len, 1.1, 1.3), crowdMat); b.position.set(0, 0.55 + r * 1.1, -r * 1.3); g.add(b); }
      const roof = new T.Mesh(new T.BoxGeometry(len, 0.4, 9), new T.MeshBasicMaterial({ color: 0x0b0e20 })); roof.position.set(0, 16.5, -8); g.add(roof);
      const led = new T.Mesh(new T.PlaneGeometry(len, 1.4), new T.MeshBasicMaterial({ map: textTex(T, (o.stadiumLed || th.name) + '   ' + th.name + '   ' + (o.stadiumLed || th.name), 1024, 64, C[0], '#07090f', 40) })); led.position.set(0, 1.1, 0.9); g.add(led);
      g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); return g; };
    stand(150, 0, -38, 0); stand(150, 0, 38, Math.PI); stand(90, -60, 0, Math.PI / 2); stand(90, 60, 0, -Math.PI / 2);

    // floodlight towers
    [[-62, -42], [62, -42], [-62, 42], [62, 42]].forEach(([x, z]) => { const m = new T.Mesh(new T.CylinderGeometry(0.5, 0.8, 34, 6), new T.MeshLambertMaterial({ color: 0x2a2f4a })); m.position.set(x, 17, z); scene.add(m);
      const head = new T.Mesh(new T.BoxGeometry(7, 3, 1), new T.MeshBasicMaterial({ color: 0xffffff })); head.position.set(x, 35, z); head.lookAt(0, 8, 0); scene.add(head);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xfff4d0, blending: T.AdditiveBlending, depthWrite: false })); sp.scale.set(30, 30, 1); sp.position.set(x, 35, z); scene.add(sp); });

    // tunnel (far side, centre) with the competition arch
    const tun = new T.Group(); tun.position.set(0, 0, -34.4);
    const hole = new T.Mesh(new T.BoxGeometry(9, 4.2, 5), new T.MeshBasicMaterial({ color: 0x000000 })); hole.position.set(0, 2.1, -1); tun.add(hole);
    const arch = new T.Mesh(new T.BoxGeometry(10.4, 0.5, 0.8), new T.MeshBasicMaterial({ color: new T.Color(C[0]) })); arch.position.set(0, 4.5, 1.2); tun.add(arch);
    [-5, 5].forEach(x => { const p = new T.Mesh(new T.BoxGeometry(0.5, 4.5, 0.8), new T.MeshBasicMaterial({ color: new T.Color(C[0]) })); p.position.set(x, 2.25, 1.2); tun.add(p); });
    const sign = new T.Mesh(new T.PlaneGeometry(10, 1.6), new T.MeshBasicMaterial({ map: textTex(T, th.name, 512, 80, '#ffffff', C[2], 48) })); sign.position.set(0, 5.6, 1.7); tun.add(sign); scene.add(tun);

    // players
    const geo = { torso: new T.BoxGeometry(0.58, 0.66, 0.34), shorts: new T.BoxGeometry(0.52, 0.3, 0.32), leg: new T.BoxGeometry(0.19, 0.5, 0.2), sock: new T.BoxGeometry(0.2, 0.42, 0.22), arm: new T.BoxGeometry(0.15, 0.6, 0.15), head: new T.SphereGeometry(0.18, 10, 8), hair: new T.SphereGeometry(0.19, 10, 6, 0, 6.3, 0, 1.3) };
    const mats = {}; const mat = c => mats[c] || (mats[c] = new T.MeshLambertMaterial({ color: new T.Color(c) }));
    const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#5c3a1e'], HAIR = ['#1a1209', '#3a2512', '#c9a23a', '#111111', '#6b3b1d'];
    function makePlayer(kit, gk, i) {
      const g = new T.Group(), skin = SKIN[(i * 5 + 1) % SKIN.length], shirt = gk ? '#16a34a' : kit[0], trim = gk ? '#111111' : kit[1];
      const mk = (geom, c, x, y, z) => { const m = new T.Mesh(geom, mat(c)); m.position.set(x, y, z); return m; };
      g.add(mk(geo.torso, shirt, 0, 1.28, 0)); g.add(mk(geo.shorts, trim, 0, 0.88, 0)); g.add(mk(geo.head, skin, 0, 1.78, 0)); const hr = mk(geo.hair, HAIR[(i * 3) % HAIR.length], 0, 1.8, 0); g.add(hr);
      const mkLeg = x => { const p = new T.Group(); p.position.set(x, 0.74, 0); const up = mk(geo.leg, skin, 0, -0.25, 0); const lo = mk(geo.sock, gk ? '#111111' : kit[0], 0, -0.52, 0); p.add(up); p.add(lo); g.add(p); return p; };
      const mkArm = x => { const p = new T.Group(); p.position.set(x, 1.52, 0); p.add(mk(geo.arm, shirt, 0, -0.3, 0)); g.add(p); return p; };
      g.userData = { legL: mkLeg(-0.14), legR: mkLeg(0.14), armL: mkArm(-0.38), armR: mkArm(0.38) }; g.scale.setScalar(1.18); scene.add(g); return g;
    }
    const mkTeam = (t, dir) => {
      const cards = (t.cards || []).slice(0, 11), forms = formation(cards, dir);
      return cards.map((c, i) => { const gk = rowOf(c) === 0, g = makePlayer(t.kit, gk, i + (dir > 0 ? 11 : 0));
        const lx = dir < 0 ? -42 + i * 3 : 42 - i * 3, lz = -2, delay = i * 0.22 + (dir > 0 ? 0.11 : 0);
        return { g, from: { x: (dir < 0 ? -1 : 1) * (1 + (i % 2) * 1.6), z: -37 }, line: { x: lx, z: lz }, form: forms[i], delay, ph: rnd() * 6 };
      });
    };
    const A = mkTeam(o.away, -1), Hm = mkTeam(o.home, 1);

    // centre-piece by competition, shown during the ident
    const piece = new T.Group(); piece.position.set(0, 0, 4); scene.add(piece);
    const gold = new T.MeshPhongMaterial({ color: new T.Color(C[0]), shininess: 90, specular: 0xffffff, emissive: new T.Color(C[0]), emissiveIntensity: 0.25 });
    const white = new T.MeshPhongMaterial({ color: new T.Color(C[1]), shininess: 70, emissive: new T.Color(C[1]), emissiveIntensity: 0.15 }), dark = new T.MeshPhongMaterial({ color: new T.Color(C[2]), shininess: 30 });
    const add = (m, x, y, z) => { m.position.set(x || 0, y || 0, z || 0); piece.add(m); return m; };
    switch (th.piece) {
      case 'starball': { const gm = new T.IcosahedronGeometry(4.2, 1).toNonIndexed(); const col = []; for (let f = 0; f < gm.attributes.position.count / 3; f++) { const d = (f % 5 === 0); for (let k = 0; k < 3; k++) col.push(d ? 0.05 : 1, d ? 0.07 : 1, d ? 0.12 : 1); } gm.setAttribute('color', new T.Float32BufferAttribute(col, 3)); add(new T.Mesh(gm, new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 80 })), 0, 6, 0); break; }
      case 'cup': { const pts = [[0, 0], [2.6, 0], [2.6, 0.6], [1.0, 1.6], [0.8, 4], [1.8, 5.2], [3.2, 7], [3.2, 9.6], [2.2, 10.2], [0, 10.4]].map(p => new T.Vector2(p[0], p[1])); add(new T.Mesh(new T.LatheGeometry(pts, 20), gold), 0, 0, 0); add(new T.Mesh(new T.TorusGeometry(3, 0.28, 6, 18), gold), -3.3, 8.2, 0).rotation.y = 1.57; add(new T.Mesh(new T.TorusGeometry(3, 0.28, 6, 18), gold), 3.3, 8.2, 0).rotation.y = 1.57; break; }
      case 'flame': for (let k = 0; k < 5; k++) add(new T.Mesh(new T.ConeGeometry(1.6 - k * 0.18, 7 + k % 2 * 3, 8), new T.MeshBasicMaterial({ color: new T.Color(k % 2 ? C[1] : C[0]), transparent: true, opacity: 0.85 })), (k - 2) * 1.5, 4, (k % 2 - 0.5) * 2); add(new T.Mesh(new T.TorusGeometry(5, 0.4, 6, 24), gold), 0, 0.6, 0).rotation.x = 1.57; break;
      case 'crown': add(new T.Mesh(new T.CylinderGeometry(3.4, 3.8, 2.2, 5), gold), 0, 1.1, 0); for (let k = 0; k < 5; k++) { const a = k * 1.2566; add(new T.Mesh(new T.ConeGeometry(0.9, 4.4, 5), k % 2 ? white : gold), Math.cos(a) * 3, 4.4, Math.sin(a) * 3); add(new T.Mesh(new T.SphereGeometry(0.5, 8, 6), white), Math.cos(a) * 3, 6.9, Math.sin(a) * 3); } break;
      case 'sun': add(new T.Mesh(new T.SphereGeometry(2.6, 16, 12), gold), 0, 6, 0); for (let k = 0; k < 14; k++) { const a = k * 0.4488, cn = new T.Mesh(new T.ConeGeometry(0.7, 4.4, 5), k % 2 ? white : gold); cn.position.set(Math.cos(a) * 4.8, 6 + Math.sin(a) * 4.8, 0); cn.rotation.z = a - Math.PI / 2; piece.add(cn); } break;
      case 'flags': [['#0a8a3a', -3.4], ['#ffffff', 0], ['#d4002a', 3.4]].forEach(([c, x]) => { add(new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 11, 6), white), x, 5.5, 0); const f = new T.Mesh(new T.PlaneGeometry(3, 2.2), new T.MeshBasicMaterial({ color: new T.Color(c), side: T.DoubleSide })); f.position.set(x + 1.5, 9.6, 0); piece.add(f); f.userData.wave = x; }); break;
      case 'diamond': add(new T.Mesh(new T.OctahedronGeometry(4, 0), gold), 0, 6.5, 0); add(new T.Mesh(new T.TorusGeometry(5.6, 0.25, 6, 28), white), 0, 6.5, 0).rotation.x = 1.2; break;
      case 'halo': add(new T.Mesh(new T.TorusGeometry(4.6, 0.6, 8, 30), gold), 0, 6.5, 0); add(new T.Mesh(new T.BoxGeometry(2.8, 2.8, 2.8), white), 0, 6.5, 0); break;
      default: add(new T.Mesh(new T.SphereGeometry(3, 16, 12), gold), 0, 6, 0);
    }

    // particles for the competition effect
    const N = 700, pp = new Float32Array(N * 3), pc = new Float32Array(N * 3), pv = new Float32Array(N * 3), plife = new Float32Array(N), cc = C.map(h => new T.Color(h));
    const pgeo = new T.BufferGeometry(); pgeo.setAttribute('position', new T.BufferAttribute(pp, 3)); pgeo.setAttribute('color', new T.BufferAttribute(pc, 3));
    const pts = new T.Points(pgeo, new T.PointsMaterial({ size: th.fx === 'confetti' ? 0.55 : 0.8, map: glow, vertexColors: true, blending: T.AdditiveBlending, transparent: true, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
    let burstT = 0, pi = 0;
    const spawn = (x, y, z, vx, vy, vz, col, life) => { const i = pi++ % N; pp[i * 3] = x; pp[i * 3 + 1] = y; pp[i * 3 + 2] = z; pv[i * 3] = vx; pv[i * 3 + 1] = vy; pv[i * 3 + 2] = vz; pc[i * 3] = col.r; pc[i * 3 + 1] = col.g; pc[i * 3 + 2] = col.b; plife[i] = life; };
    function fxStep(dt, T0) {
      burstT -= dt;
      if (th.fx === 'bursts' && burstT <= 0) { burstT = 0.45; const bx = (rnd() - 0.5) * 100, by = 26 + rnd() * 16, bz = -30 - rnd() * 20, col = cc[(rnd() * 3) | 0]; for (let k = 0; k < 46; k++) { const a = rnd() * 6.283, b = (rnd() - 0.5) * 3.14, s = 8 + rnd() * 6; spawn(bx, by, bz, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s, col, 1.6); } }
      if (th.fx === 'stars' && burstT <= 0) { burstT = 0.03; spawn((rnd() - 0.5) * 120, 55, (rnd() - 0.5) * 80, 0, -14 - rnd() * 8, 0, cc[(rnd() * 2) | 0], 4); }
      if (th.fx === 'confetti' && burstT <= 0) { burstT = 0.02; spawn((rnd() - 0.5) * 100, 50, (rnd() - 0.5) * 70, (rnd() - 0.5) * 3, -6 - rnd() * 4, (rnd() - 0.5) * 3, cc[(rnd() * 3) | 0], 6); }
      if (th.fx === 'flares' && burstT <= 0) { burstT = 0.025; const side = rnd() < 0.5 ? -1 : 1; spawn(side * (36 + rnd() * 10), 0.5, (rnd() - 0.5) * 64, side * -3, 12 + rnd() * 10, (rnd() - 0.5) * 3, cc[(rnd() * 2) | 0], 2.6); }
      if (th.fx === 'ribbons' && burstT <= 0) { burstT = 0.02; const k = (rnd() * 3) | 0, col = new T.Color(['#0a8a3a', '#ffffff', '#d4002a'][k]); spawn(-60 + rnd() * 120, 30, -44, 0, -3, 12, col, 5); }
      for (let i = 0; i < N; i++) { if (plife[i] <= 0) { pp[i * 3 + 1] = -50; continue; } plife[i] -= dt; pv[i * 3 + 1] -= (th.fx === 'flares' ? 3 : 9) * dt * (th.fx === 'bursts' ? 1 : 0.2); pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt; }
      pgeo.attributes.position.needsUpdate = true; pgeo.attributes.color.needsUpdate = true;
    }

    // camera path per shot
    const tt = (T0, a, b) => clamp((T0 - a) / (b - a), 0, 1);
    function camAt(t) {
      const S = [0, 2.8, 7.4, 10.8, 14.2, 17.2];
      if (t < S[1]) { const u = ease(tt(t, S[0], S[1])); cam.position.set(lerp(-46, -12, u), lerp(52, 34, u), lerp(74, 62, u)); cam.lookAt(0, 4, -8); }
      else if (t < S[2]) { const u = tt(t, S[1], S[2]); cam.position.set(lerp(-3, 2, u), lerp(2.4, 2.0, u), lerp(24, 12, u)); cam.lookAt(0, 1.6, -22); }
      else if (t < S[3]) { const u = ease(tt(t, S[2], S[3])); cam.position.set(lerp(-45, -18, u), lerp(2.0, 2.6, u), lerp(10, 11, u)); cam.lookAt(lerp(-28, -24, u), 1.5, -2); }
      else if (t < S[4]) { const u = ease(tt(t, S[3], S[4])); cam.position.set(lerp(45, 18, u), lerp(2.0, 2.6, u), lerp(10, 11, u)); cam.lookAt(lerp(28, 24, u), 1.5, -2); }
      else { const u = ease(tt(t, S[4], S[5])); cam.position.set(lerp(0, 0, u), lerp(30, 58, u), lerp(44, 18, u)); cam.lookAt(0, 0, 0); }
    }
    function pose(p, moving, tm) { const u = p.g.userData, s = Math.sin(tm * 7 + p.ph) * 0.75 * moving; u.legL.rotation.x = s; u.legR.rotation.x = -s; u.armL.rotation.x = -s * 0.7; u.armR.rotation.x = s * 0.7; p.g.position.y = Math.abs(Math.sin(tm * 7 + p.ph)) * 0.05 * moving; }
    function place(list, t, dir) {
      list.forEach(p => {
        const wu = clamp((t - p.delay) / 5.8, 0, 1), ku = clamp((t - 14.2 - p.delay * 0.15) / 2.2, 0, 1);
        const g = p.g; g.visible = t >= p.delay;
        if (ku > 0) { const x = lerp(p.line.x, p.form.x, ease(ku)), z = lerp(p.line.z, p.form.z, ease(ku)); const mv = ku < 1 ? 1 : 0; g.rotation.y = ku < 1 ? Math.atan2(p.form.x - p.line.x, p.form.z - p.line.z) : (dir < 0 ? Math.PI / 2 : -Math.PI / 2); g.position.x = x; g.position.z = z; pose(p, mv, t); }
        else { const x = lerp(p.from.x, p.line.x, wu), z = lerp(p.from.z, p.line.z, wu); g.position.x = x; g.position.z = z; g.rotation.y = wu < 1 ? Math.atan2(p.line.x - p.from.x, p.line.z - p.from.z) : 0; pose(p, wu < 1 ? 1 : 0.0, t); }
      });
    }

    RUT._i3dbg = { A, Hm };
    let t0 = performance.now(), last = t0, shot = -1, alive = true, raf = 0;
    const edges = []; let acc = 0; SHOTS.forEach(s => { edges.push(acc); acc += s[1]; });
    function frame(now) {
      if (!alive) return; raf = requestAnimationFrame(frame);
      const t = Math.min((now - t0) / 1000, TOTAL), dt = Math.min(0.05, (now - last) / 1000); last = now;
      let s = 0; while (s < SHOTS.length - 1 && t >= edges[s + 1]) s++;
      if (s !== shot) { shot = s; if (o.onShot) o.onShot(s, SHOTS[s][0]); }
      camAt(t); place(A, t, -1); place(Hm, t, 1);
      const pu = clamp(1 - (t - 2.6) / 1.2, 0, 1); piece.visible = pu > 0; piece.scale.setScalar(Math.max(0.01, pu)); piece.rotation.y = t * 1.1; piece.position.y = (1 - pu) * -6;
      piece.children.forEach(ch => { if (ch.userData.wave !== undefined) ch.rotation.y = Math.sin(t * 3 + ch.userData.wave) * 0.4; });
      accent.intensity = 1.1 + Math.sin(t * 4) * 0.3; crowd.offset.x = (t * 0.02) % 1;
      fxStep(dt, t);
      renderer.render(scene, cam);
      if (o.onTick) o.onTick(t, TOTAL);
      if (t >= TOTAL) { alive = false; if (o.onEnd) o.onEnd(); }
    }
    raf = requestAnimationFrame(frame);
    return { stop() { alive = false; cancelAnimationFrame(raf); try { renderer.dispose(); } catch (e) { /* gone */ } } };
  }
  window.RUT = window.RUT || {};
  RUT.Intro3D = { themeFor, THEMES, SHOTS, TOTAL, start };
})();
