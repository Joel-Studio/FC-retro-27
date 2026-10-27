/*
 * render3d.js  -  Ultra graphics: a real 3D renderer (three.js / WebGL) for the match.
 *
 * The match simulation is unchanged and still lives on the 2D pitch (x along the length, y across, z up for the ball).
 * This file only DRAWS it: the pitch, stands, goals with nets, floodlights, shadows, articulated 3D footballers and the ball, through a
 * perspective camera, at 1440 lines. The engine then paints its pixel HUD (tags, radar, scoreboard, effects) on top using `proj`.
 *
 *   RUT.Render3D.supported()          WebGL + three.js are available
 *   RUT.Render3D.create(env)          env = sizes and textures handed over by the engine -> stage
 *   stage.frame(match, view)          draws one frame into stage.canvas
 *   stage.proj(x, y, z, viewW, viewH) world -> the engine's screen units ({x, y, k = pixels per metre})
 *
 * World mapping: three X = pitch x - W/2, three Z = pitch y - H/2, three Y = height.
 */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  let _sup = null;
  function supported() {
    if (_sup != null) return _sup;
    try {
      if (!window.THREE) return (_sup = false);
      const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
      _sup = !!gl;
      if (gl) { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    } catch (e) { _sup = false; }
    return _sup;
  }

  /* ----------------------------- small texture helpers ----------------------------- */
  function canvasTex(c, opts) {
    const T = THREE, t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding; t.anisotropy = (opts && opts.aniso) || 8;
    if (opts && opts.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    t.needsUpdate = true; return t;
  }
  function ballTexture() {
    const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, W, H);
    // the 12 pentagons sit on the vertices of an icosahedron
    const phi = (1 + Math.sqrt(5)) / 2, v = [];
    [[0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi], [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0], [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1]].forEach(p => {
      const l = Math.hypot(p[0], p[1], p[2]); v.push([p[0] / l, p[1] / l, p[2] / l]);
    });
    g.fillStyle = '#16161c';
    v.forEach(p => {
      const lat = Math.asin(p[1]), lon = Math.atan2(p[0], p[2]), x = (lon / (2 * Math.PI) + 0.5) * W, y = (0.5 - lat / Math.PI) * H, rad = 34;
      for (const dx of [-W, 0, W]) { g.save(); g.translate(x + dx, y); g.scale(1 / Math.max(0.35, Math.cos(lat)), 1); g.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * rad * 0.62, Math.sin(a) * rad * 0.62); } g.closePath(); g.fill(); g.restore(); }
    });
    g.strokeStyle = 'rgba(40,40,50,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(i * W / 18, 0); g.lineTo(i * W / 18, H); g.stroke(); }
    return canvasTex(c);
  }
  function netTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke();
    const t = canvasTex(c, { aniso: 4 }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,248,215,1)'); gr.addColorStop(0.25, 'rgba(255,240,190,0.55)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTex(c, { aniso: 1 });
  }
  function shirtTexture(look) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = look.shirt; g.fillRect(0, 0, 128, 64);
    g.fillStyle = look.trim || look.shirt;
    const pat = look.pattern || 'plain';
    if (pat === 'stripes') for (let i = 0; i < 128; i += 16) g.fillRect(i, 0, 8, 64);
    else if (pat === 'band') g.fillRect(0, 22, 128, 12);
    else if (pat === 'wideband') g.fillRect(0, 16, 128, 28);
    else if (pat === 'halves') g.fillRect(0, 0, 64, 64);
    else if (pat === 'hoops') for (let j = 0; j < 64; j += 16) g.fillRect(0, j, 128, 8);
    const t = canvasTex(c, { aniso: 4 }); t.wrapS = THREE.RepeatWrapping; return t;
  }
  function numberTexture(look) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.font = 'bold 44px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = look.numCol || '#ffffff';
    g.fillText(look.number || '', 32, 34); return canvasTex(c, { aniso: 4 });
  }

  /* ----------------------------------- the stage ----------------------------------- */
  function create(env) {
    const T = THREE, W = env.W, H = env.H, PW2 = W / 2, PH2 = H / 2;
    if (T.ColorManagement) T.ColorManagement.legacyMode = false;       // v154: hex colours are sRGB, so kits and grass keep their real colour instead of washing out
    const canvas = document.createElement('canvas');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(1);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;   // v200: plain PCF (soft PCF samples the shadow map many more times per pixel)
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());   // v200: 4x is enough at match camera angles
    const scene = new T.Scene();
    scene.background = new T.Color(0x0a0d26);
    scene.fog = new T.Fog(0x1a1a3c, 140, 330);
    const camera = new T.PerspectiveCamera(30, 16 / 9, 1, 700);

    /* ---- light: soft sky fill + one hard floodlight sun that casts the shadows ---- */
    scene.add(new T.HemisphereLight(0xa8b4ff, 0x2f4a26, 0.55));
    const sun = new T.DirectionalLight(0xfff0d0, 1.25);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);   // v200: 4x fewer shadow-map pixels
    const sc = sun.shadow.camera; sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 10; sc.far = 220;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5;
    scene.add(sun); scene.add(sun.target);
    const SUN_OFF = new T.Vector3(34, 90, 38);

    /* ---- pitch ---- */
    const pitchW = W + env.GMX * 2, pitchH = H + env.GMY_FAR + env.GMY_NEAR;
    let gc = env.ground; const maxT = renderer.capabilities.maxTextureSize;
    if (gc.width > maxT || gc.height > maxT) { const k = Math.min(maxT / gc.width, maxT / gc.height), c2 = document.createElement('canvas'); c2.width = Math.floor(gc.width * k); c2.height = Math.floor(gc.height * k); const g2 = c2.getContext('2d'); g2.imageSmoothingQuality = 'high'; g2.drawImage(gc, 0, 0, c2.width, c2.height); gc = c2; }
    const groundTex = canvasTex(gc, { aniso: maxAniso });
    groundTex.minFilter = T.LinearMipmapLinearFilter; groundTex.generateMipmaps = true;
    const pitch = new T.Mesh(new T.PlaneGeometry(pitchW, pitchH), new T.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0, (env.GMY_NEAR - env.GMY_FAR) / 2); pitch.receiveShadow = true; scene.add(pitch);
    const apron = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshStandardMaterial({ color: 0x1b1b2c, roughness: 1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.05; apron.receiveShadow = true; scene.add(apron);

    /* ---- v170 (JODIO: "no 2D, full 3D for the pitch, the nets, the arena"): a real 3D stadium. Each side is a two-tier stepped
       stand of concrete rows with instanced 3D fans (they sway, and jump when the crowd cheers), an LED ribbon on the upper-tier
       front, a cantilever roof with a light strip, corner blocks with floodlight masts, and two dugouts on the near side. ---- */
    const concrete = new T.MeshStandardMaterial({ color: 0x55586a, roughness: 0.92, side: T.DoubleSide });
    const darkMat = new T.MeshStandardMaterial({ color: 0x1b1c2c, roughness: 0.8, metalness: 0.25, side: T.DoubleSide });
    const roofMat = new T.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.55, metalness: 0.45, side: T.DoubleSide });
    const crowdU = { uTime: { value: 0 }, uCheer: { value: 0 } };
    const crowdMat = col => {
      const mt = new T.MeshLambertMaterial({ color: col });
      mt.onBeforeCompile = sh => {
        sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uCheer = crowdU.uCheer;
        sh.vertexShader = 'uniform float uTime;\nuniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>', '#ifdef USE_INSTANCING',
          'float ph = instanceMatrix[3].x * 1.37 + instanceMatrix[3].z * 0.71 + instanceMatrix[3].y * 2.3;',
          'transformed.y += 0.035 * sin(uTime * 1.7 + ph) + uCheer * max(0.0, sin(uTime * (7.0 + fract(ph) * 3.0) + ph * 3.1)) * 0.38;',
          '#endif'].join('\n'));
      };
      return mt;
    };
    const fanBody = new T.BoxGeometry(0.44, 0.62, 0.28); fanBody.translate(0, 0.31, 0);
    const fanHead = new T.IcosahedronGeometry(0.12, 0); fanHead.translate(0, 0.76, 0);
    const bodyMat = crowdMat(0xffffff), headMat = crowdMat(0xffffff);
    const SHIRTS = ['#c8102e', '#c8102e', '#ffffff', '#ffffff', '#1d428a', '#1d428a', '#f4c542', '#111318', '#2e7d32', '#6cace4', '#e35205', '#7a263a', '#ececec', '#d4002a'];
    const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#5c3a1e'];
    const ledTex = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#120c02'); gr.addColorStop(1, '#2a1c04'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 64);
      g.font = 'italic 800 40px "Barlow Condensed", Arial, sans-serif'; g.textBaseline = 'middle';
      ['FCR27', 'DREAM CLUB', 'FCR27', 'ULTIMATE TEAM'].forEach((w, i) => { g.fillStyle = i % 2 ? '#ffffff' : '#f4c542'; g.fillText(w, 30 + i * 256, 34); });
      const t = canvasTex(c, { aniso: maxAniso }); t.wrapS = T.RepeatWrapping; return t; })();
    const glow = glowTexture(), glows = [];
    function quadsGeo(list) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(list, 3)); g.computeVertexNormals(); return g; }
    function stand(len, cx, cz, rotY) {
      const g = new T.Group(), hl = len / 2, steps = [], sides = [], fans = [];
      const q = (a, b, c, d, out) => out.push(...a, ...b, ...c, ...a, ...c, ...d);
      // one tier: rows of riser + tread, side walls, and the fans standing on the treads
      const tier = (z0, y0, rows, tread, riser, occ) => {
        for (let r = 0; r < rows; r++) {
          const y = y0 + r * riser, z = z0 - r * tread;
          q([-hl, y, z], [hl, y, z], [hl, y + riser, z], [-hl, y + riser, z], steps);
          q([-hl, y + riser, z], [hl, y + riser, z], [hl, y + riser, z - tread], [-hl, y + riser, z - tread], steps);
          for (let x = -hl + 0.45; x < hl - 0.3; x += 0.62) if (Math.random() < occ) fans.push([x + (Math.random() - 0.5) * 0.12, y + riser, z - tread * 0.55 + (Math.random() - 0.5) * 0.08]);
        }
        const zE = z0 - rows * tread, yT = y0 + rows * riser;
        [-hl, hl].forEach(x => q([x, 0, z0], [x, y0, z0], [x, yT, zE], [x, 0, zE], sides));
        return { zE, yT };
      };
      const front = new T.Mesh(new T.BoxGeometry(len, 1.25, 0.4), darkMat); front.position.set(0, 0.62, 0.2); g.add(front);
      const lo = tier(0, 1.25, 12, 0.8, 0.42, 0.8);
      const z0u = lo.zE + 2.2, y0u = lo.yT + 2.8;
      const backLo = new T.Mesh(new T.BoxGeometry(len, y0u - lo.yT, 0.4), darkMat); backLo.position.set(0, lo.yT + (y0u - lo.yT) / 2, lo.zE - 0.2); g.add(backLo);
      const up = tier(z0u, y0u, 14, 0.85, 0.6, 0.84);
      // upper-tier front: LED ribbon and the soffit under the overhang
      const led = new T.Mesh(new T.PlaneGeometry(len, 1.3), new T.MeshBasicMaterial({ map: ledTex.clone(), toneMapped: false })); led.material.map.repeat.set(len / 26, 1); led.material.map.needsUpdate = true;
      led.position.set(0, y0u - 0.65, z0u + 0.01); g.add(led);
      const soffit = new T.Mesh(new T.PlaneGeometry(len, z0u - lo.zE), darkMat); soffit.rotation.x = Math.PI / 2; soffit.position.set(0, y0u - 1.3, (z0u + lo.zE) / 2); g.add(soffit);
      // back wall and the cantilever roof with a light strip on its front edge
      const topY = up.yT + 3.2, back = new T.Mesh(new T.BoxGeometry(len, topY, 0.6), darkMat); back.position.set(0, topY / 2, up.zE - 0.3); g.add(back);
      const roofD = (up.zE - 0.3) - (z0u + 3), roof = new T.Mesh(new T.BoxGeometry(len + 2, 0.45, Math.abs(roofD) + 1), roofMat);
      roof.position.set(0, topY + 1.2, (up.zE + z0u + 3) / 2); roof.rotation.x = -0.06; g.add(roof);
      const fas = new T.Mesh(new T.BoxGeometry(len + 2, 1.1, 0.35), darkMat); fas.position.set(0, topY + 1.8, z0u + 3.1); g.add(fas);
      const strip = new T.Mesh(new T.BoxGeometry(len, 0.16, 0.16), new T.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false })); strip.position.set(0, topY + 1.05, z0u + 3.3); g.add(strip);
      for (let x = -hl + 8; x < hl - 4; x += 16) { const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xfff1c0, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.scale.set(12, 12, 1); sp.position.set(x, topY + 1.0, z0u + 3.6); g.add(sp); glows.push(sp); }
      g.add(new T.Mesh(quadsGeo(steps), concrete)); g.add(new T.Mesh(quadsGeo(sides), darkMat));
      // the fans: two instanced meshes (shirts, heads) sharing positions, each with its own colour
      const mB = new T.InstancedMesh(fanBody, bodyMat, fans.length), mH = new T.InstancedMesh(fanHead, headMat, fans.length), mt = new T.Matrix4(), col = new T.Color();
      fans.forEach((f, i) => { mt.makeRotationY((Math.random() - 0.5) * 0.5); mt.setPosition(f[0], f[1], f[2]); mB.setMatrixAt(i, mt); mH.setMatrixAt(i, mt);
        mB.setColorAt(i, col.set(SHIRTS[(Math.random() * SHIRTS.length) | 0])); mH.setColorAt(i, col.set(SKINS[(Math.random() * SKINS.length) | 0])); });
      [mB, mH].forEach(mm => { mm.instanceMatrix.needsUpdate = true; if (mm.instanceColor) mm.instanceColor.needsUpdate = true; mm.frustumCulled = false; g.add(mm); });
      g.position.set(cx, 0, cz); g.rotation.y = rotY; scene.add(g);
      return { depth: -up.zE, height: topY + 2 };
    }
    const S1 = stand(pitchW, 0, -(PH2 + env.GMY_FAR), 0);
    stand(pitchH, -(PW2 + env.GMX), (env.GMY_NEAR - env.GMY_FAR) / 2, Math.PI / 2);
    stand(pitchH, PW2 + env.GMX, (env.GMY_NEAR - env.GMY_FAR) / 2, -Math.PI / 2);
    // corner blocks between the stands, each with a floodlight mast
    [-1, 1].forEach(sx => {
      const cxk = sx * (PW2 + env.GMX + S1.depth / 2), czk = -(PH2 + env.GMY_FAR + S1.depth / 2);
      const blk = new T.Mesh(new T.BoxGeometry(S1.depth, S1.height - 2, S1.depth), darkMat); blk.position.set(cxk, (S1.height - 2) / 2, czk); scene.add(blk);
      const mast = new T.Mesh(new T.CylinderGeometry(0.5, 0.9, 16, 8), roofMat); mast.position.set(cxk, S1.height + 6, czk); scene.add(mast);
      const head = new T.Mesh(new T.BoxGeometry(8, 3.4, 1), new T.MeshBasicMaterial({ color: 0xfff6d6, toneMapped: false })); head.position.set(cxk, S1.height + 14, czk + 1); head.lookAt(0, 0, 0); scene.add(head);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xfff1c0, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.scale.set(38, 38, 1); sp.position.set(cxk, S1.height + 14, czk + 2); scene.add(sp); glows.push(sp);
    });
    // dugouts on the near side
    [-1, 1].forEach(sx => {
      const d = new T.Group(), shell = new T.MeshStandardMaterial({ color: 0x20222e, roughness: 0.5, metalness: 0.3 });
      const bk = new T.Mesh(new T.BoxGeometry(6, 1.8, 0.15), shell); bk.position.set(0, 0.9, 0.7); d.add(bk);
      [-3, 3].forEach(x => { const sd = new T.Mesh(new T.BoxGeometry(0.12, 1.8, 1.5), shell); sd.position.set(x, 0.9, 0); d.add(sd); });
      const top = new T.Mesh(new T.BoxGeometry(6.2, 0.08, 1.7), new T.MeshStandardMaterial({ color: 0x9fb6d0, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 })); top.position.set(0, 1.84, -0.05); d.add(top);
      const bench = new T.Mesh(new T.BoxGeometry(5.6, 0.45, 0.5), new T.MeshStandardMaterial({ color: sx < 0 ? 0xc8102e : 0x1d428a, roughness: 0.6 })); bench.position.set(0, 0.25, 0.35); d.add(bench);
      d.position.set(sx * 11, 0, PH2 + 4.2); scene.add(d);
    });

    /* ---- advertising boards, corner flags ---- */
    const boardGeo = new T.BoxGeometry(5.8, 0.95, 0.16);
    env.BOARD_COLS.forEach(() => { });
    const boards = new T.Group(); scene.add(boards);
    // v170: LED boards with words on them instead of plain colour blocks
    const BOARD_WORDS = ['FCR27', 'DREAM CLUB', 'ULTIMATE', 'FCR27', 'RETRO', 'CHAMPS'];
    const bMat = env.BOARD_COLS.map((c, i) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 42; const g = cv.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 42); gr.addColorStop(0, '#05060c'); gr.addColorStop(1, '#141826'); g.fillStyle = gr; g.fillRect(0, 0, 256, 42);
      g.fillStyle = c; g.fillRect(0, 0, 256, 3); g.fillRect(0, 39, 256, 3);
      g.font = 'italic 800 30px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = c; g.fillText(BOARD_WORDS[i % BOARD_WORDS.length], 128, 22);
      const t = canvasTex(cv, { aniso: maxAniso }); return new T.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.5 }); });
    const addBoard = (x, z, ry, i) => { const m = new T.Mesh(boardGeo, bMat[i % bMat.length]); m.position.set(x, 0.48, z); m.rotation.y = ry; m.castShadow = true; boards.add(m); };
    for (let i = 0, x = -PW2 - 5 + 3; x < PW2 + 5; x += 6, i++) { addBoard(x, -PH2 - 3.5, 0, i); }
    for (let i = 0, z = -PH2 - 3.5 + 3; z < PH2 + 3.5; z += 6, i++) { addBoard(-PW2 - 4, z, Math.PI / 2, i + 2); addBoard(PW2 + 4, z, Math.PI / 2, i + 4); }
    const flagPole = new T.CylinderGeometry(0.04, 0.04, 1.6, 6), flagMat = new T.MeshStandardMaterial({ color: 0xffdd33, side: T.DoubleSide });
    [[-PW2, -PH2], [PW2, -PH2], [PW2, PH2], [-PW2, PH2]].forEach(([x, z]) => {
      const p = new T.Mesh(flagPole, new T.MeshStandardMaterial({ color: 0xffffff })); p.position.set(x, 0.8, z); p.castShadow = true; scene.add(p);
      const f = new T.Mesh(new T.PlaneGeometry(0.5, 0.35), flagMat); f.position.set(x + (x > 0 ? -0.25 : 0.25), 1.42, z); scene.add(f);
    });

    /* ---- goals with nets ---- */
    const GH = env.GOAL_HALF, GT = env.GOAL_H, ND = env.NET_DEPTH, NB = env.NET_TOP_BACK;
    const postMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.3 });
    const netTex = netTexture();
    function tube(a, b, r) { const d = new T.Vector3().subVectors(b, a), m = new T.Mesh(new T.CylinderGeometry(r, r, d.length(), 10), postMat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.clone().normalize()); m.castShadow = true; return m; }
    function quad(p0, p1, p2, p3, ru, rv) {
      const g = new T.BufferGeometry(), v = [...p0, ...p1, ...p2, ...p0, ...p2, ...p3];
      g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, ru, 0, ru, rv, 0, 0, ru, rv, 0, rv], 2)); g.computeVertexNormals(); return g;
    }
    const netMat = new T.MeshBasicMaterial({ map: netTex, transparent: true, side: T.DoubleSide, depthWrite: false, opacity: 0.9 });
    [0, 1].forEach(side => {
      const dir = side ? 1 : -1, x0 = side ? PW2 : -PW2, x1 = x0 + dir * ND, g = new T.Group();
      const V = (x, y, z) => new T.Vector3(x, y, z);
      g.add(tube(V(x0, 0, -GH), V(x0, GT, -GH), 0.09)); g.add(tube(V(x0, 0, GH), V(x0, GT, GH), 0.09)); g.add(tube(V(x0, GT, -GH), V(x0, GT, GH), 0.09));
      g.add(tube(V(x0, GT, -GH), V(x1, NB, -GH), 0.035)); g.add(tube(V(x0, GT, GH), V(x1, NB, GH), 0.035)); g.add(tube(V(x1, NB, -GH), V(x1, NB, GH), 0.035));
      g.add(tube(V(x1, 0, -GH), V(x1, NB, -GH), 0.035)); g.add(tube(V(x1, 0, GH), V(x1, NB, GH), 0.035));
      g.add(tube(V(x0, 0.02, -GH), V(x1, 0.02, -GH), 0.03)); g.add(tube(V(x0, 0.02, GH), V(x1, 0.02, GH), 0.03)); g.add(tube(V(x1, 0.02, -GH), V(x1, 0.02, GH), 0.03));
      const mk = (geo, ru, rv) => { const m = new T.Mesh(geo, netMat.clone()); m.material.map = netTex.clone(); m.material.map.repeat.set(ru, rv); m.material.map.needsUpdate = true; m.renderOrder = 2; g.add(m); };
      scene.add(g);
    });

    /* ---- v154: the nets are the engine's own cloth (m.nets, Verlet knots pushed by the ball): one mesh per panel, rewritten every frame ---- */
    const cloth = [];
    function buildCloth(m) {
      if (!m.nets) return false;
      m.nets.forEach(net => {
        net.panels.forEach(pl => {
          const n = (pl.nu + 1) * (pl.nv + 1), idx = [];
          for (let v = 0; v <= pl.nv; v++) for (let u = 0; u <= pl.nu; u++) idx.push(pl.at(u, v));
          const geoP = new T.BufferGeometry(), pos = new Float32Array(n * 3), tri = [], ln = [];
          for (let v = 0; v < pl.nv; v++) for (let u = 0; u < pl.nu; u++) { const a0 = v * (pl.nu + 1) + u, a1 = a0 + 1, a2 = a0 + pl.nu + 1, a3 = a2 + 1; tri.push(a0, a1, a3, a0, a3, a2); }
          for (let v = 0; v <= pl.nv; v++) for (let u = 0; u <= pl.nu; u++) { const a0 = v * (pl.nu + 1) + u; if (u < pl.nu) ln.push(a0, a0 + 1); if (v < pl.nv) ln.push(a0, a0 + pl.nu + 1); }
          geoP.setAttribute('position', new T.BufferAttribute(pos, 3)); geoP.setIndex(tri);
          const sheet = new T.Mesh(geoP, new T.MeshBasicMaterial({ color: 0xdfe3ff, transparent: true, opacity: pl.name === 'back' ? 0.2 : 0.1, side: T.DoubleSide, depthWrite: false })); sheet.renderOrder = 1; sheet.frustumCulled = false;
          const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(pos, 3)); lg.setIndex(ln);
          const mesh = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xf2f4ff, transparent: true, opacity: 0.8, depthWrite: false })); mesh.renderOrder = 2; mesh.frustumCulled = false;
          scene.add(sheet); scene.add(mesh);
          cloth.push({ net, idx, pos, geoP, lg });
        });
      });
      return true;
    }
    function updateCloth(m) {
      if (!cloth.length && !buildCloth(m)) return;
      cloth.forEach(c => {
        const q = c.net.pos, o = c.pos;
        for (let i = 0; i < c.idx.length; i++) { const k = c.idx[i] * 3; o[i * 3] = q[k] - PW2; o[i * 3 + 1] = q[k + 2]; o[i * 3 + 2] = q[k + 1] - PH2; }
        c.geoP.attributes.position.needsUpdate = true; c.lg.attributes.position.needsUpdate = true;
      });
    }

    /* ---- ball ---- */
    const BR = 0.456;   // v176: ball 2x
    const ball = new T.Mesh(new T.SphereGeometry(BR, 28, 20), new T.MeshStandardMaterial({ map: ballTexture(), roughness: 0.42, metalness: 0.02 }));
    // v219 (JODIO: smoother without lowering settings): the ball's shadow is a soft blob that follows it, so the shadow map only holds the
    // stadium's still objects (boards, posts, flags) and is drawn once instead of every frame. Same picture, far less GPU work per frame.
    ball.castShadow = false; scene.add(ball);
    const blob = new T.Mesh(new T.CircleGeometry(BR * 1.15, 24), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.025; blob.renderOrder = 1; scene.add(blob);
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    const ring = new T.Mesh(new T.RingGeometry(0.42, 0.52, 32), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; scene.add(ring);   // v167 (JODIO): no ring round the ball
    const ballQ = new T.Quaternion(), tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), tmpAxis = new T.Vector3();

    /* ---- footballers ---- */
    const geo = {
      thigh: new T.CapsuleGeometry(0.078, 0.27, 3, 10), shin: new T.CapsuleGeometry(0.06, 0.28, 3, 10), boot: new T.BoxGeometry(0.11, 0.09, 0.27),
      upArm: new T.CapsuleGeometry(0.054, 0.2, 3, 8), foArm: new T.CapsuleGeometry(0.044, 0.2, 3, 8), hand: new T.SphereGeometry(0.052, 8, 6),
      chest: new T.CylinderGeometry(0.2, 0.165, 0.6, 18), shorts: new T.CylinderGeometry(0.188, 0.2, 0.26, 16), neck: new T.CylinderGeometry(0.045, 0.05, 0.1, 8),
      head: new T.SphereGeometry(0.112, 18, 14), hair: new T.SphereGeometry(0.119, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), numPlane: new T.PlaneGeometry(0.23, 0.23), curl: new T.SphereGeometry(0.05, 7, 5), tail: new T.CapsuleGeometry(0.035, 0.2, 2, 6), bun: new T.SphereGeometry(0.055, 8, 6), dread: new T.CapsuleGeometry(0.018, 0.2, 2, 5),
    };
    const matCache = {};
    const std = (col, rough) => { const k = col + '|' + rough; return matCache[k] || (matCache[k] = new T.MeshStandardMaterial({ color: new T.Color(col), roughness: rough == null ? 0.8 : rough, metalness: 0.02 })); };
    function ink(m, castShadow) { m.castShadow = castShadow !== false; m.receiveShadow = false; return m; }
    /** Hair by style: a cap plus whatever the style adds (a puff for curls, a bun, a ponytail, dreads, a faded side). */
    function addHair(head, style, hairM) {
      if (style === 'bald') return;
      if (style === 'curlfade') style = 'curly';   // v195: curly top on faded sides draws like curls in 3D
      const cap = ink(new T.Mesh(geo.hair, hairM)); cap.position.y = 0.012; cap.rotation.x = -0.18; head.add(cap);
      const add = (g, x, y, z, sx, sy, sz) => { const m = ink(new T.Mesh(g, hairM)); m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1); head.add(m); return m; };
      if (style === 'buzz') cap.scale.set(0.92, 0.98, 0.98);
      else if (style === 'fade') { cap.scale.set(0.93, 1.0, 0.97); cap.position.y = 0.02; }
      else if (style === 'slick') { cap.scale.set(0.97, 1.04, 1.05); cap.rotation.x = -0.45; }
      else if (style === 'curly') { cap.scale.set(1.12, 1.18, 1.14); cap.position.y = 0.03; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add(geo.curl, Math.cos(a) * 0.085, 0.13 + (i % 2) * 0.02, Math.sin(a) * 0.075); } }
      else if (style === 'long') { cap.scale.set(1.03, 1.04, 1.06); add(geo.tail, 0, -0.07, -0.085, 1.5, 1, 0.7); }
      else if (style === 'bun') { cap.scale.set(0.96, 1.0, 1.0); add(geo.bun, 0, 0.1, -0.11); }
      else if (style === 'dreads') { cap.scale.set(1.04, 1.06, 1.06); for (let i = 0; i < 8; i++) { const a = (i / 8 - 0.5) * Math.PI * 1.5; add(geo.dread, Math.sin(a) * 0.1, -0.03, -0.06 - Math.cos(a) * 0.04, 0.9, 1, 0.9); } }
    }
    function makeRig(p, look, kit) {
      const bw = look.bw || 1, root = new T.Group(), skin = std(look.skin, 0.75), hairM = std(look.hair, 0.6);
      const shirtMat = new T.MeshStandardMaterial({ map: shirtTexture(look), roughness: 0.7 }), sleeve = std(look.shirt, 0.7);
      const pelvis = new T.Group(); pelvis.position.y = 0.92; root.add(pelvis);
      const sh = ink(new T.Mesh(geo.shorts, std(look.shorts, 0.8))); sh.scale.set(bw, 1, 0.74); sh.position.y = -0.03; pelvis.add(sh);
      const torso = new T.Group(); torso.position.y = 0.04; pelvis.add(torso);
      const chest = ink(new T.Mesh(geo.chest, shirtMat)); chest.scale.set(bw, 1, 0.62); chest.position.y = 0.3; torso.add(chest);
      if (look.number) { const num = new T.Mesh(geo.numPlane, new T.MeshBasicMaterial({ map: numberTexture(look), transparent: true, depthWrite: false })); num.position.set(0, 0.33, -0.113 * 0.62 * 2 * 0.5 - 0.0); num.position.z = -0.126 * 0.99; num.rotation.y = Math.PI; torso.add(num); }
      const neck = new T.Mesh(geo.neck, skin); neck.position.y = 0.64; torso.add(neck);
      const head = new T.Group(); head.position.y = 0.76; torso.add(head);
      const hd = ink(new T.Mesh(geo.head, skin)); hd.scale.set(0.92, 1.08, 1); head.add(hd);
      addHair(head, look.style, hairM);
      if (look.beard) { const br = new T.Mesh(new T.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5), hairM); br.scale.set(0.93, 0.8, 1.02); br.position.set(0, -0.02, 0.02); head.add(br); }
      const eyeM = new T.MeshBasicMaterial({ color: 0x151515 });
      const whiteM = new T.MeshBasicMaterial({ color: 0xf2efe8 }), browM = new T.MeshBasicMaterial({ color: new T.Color(look.hairD || look.hair) }), lipM = new T.MeshStandardMaterial({ color: new T.Color(look.skin).multiplyScalar(0.62).lerp(new T.Color(0x9a3a32), 0.35), roughness: 0.6 });
      [-1, 1].forEach(sg => {   // v194: eye whites with a dark iris, brows, a nose and a mouth
        const w = new T.Mesh(new T.SphereGeometry(0.017, 8, 6), whiteM); w.scale.set(1.3, 0.75, 0.5); w.position.set(sg * 0.04, 0.02, 0.094); head.add(w);
        const e = new T.Mesh(new T.SphereGeometry(0.0105, 6, 4), eyeM); e.position.set(sg * 0.04, 0.02, 0.101); head.add(e);
        const br = new T.Mesh(new T.BoxGeometry(0.036, 0.007, 0.01), browM); br.position.set(sg * 0.042, 0.047, 0.094); br.rotation.z = -sg * 0.12; head.add(br);
      });
      const nose = new T.Mesh(new T.ConeGeometry(0.012, 0.03, 6), skin); nose.rotation.x = Math.PI / 2 + 0.5; nose.position.set(0, -0.008, 0.104); head.add(nose);
      const mouth = new T.Mesh(new T.BoxGeometry(0.04, 0.008, 0.01), lipM); mouth.position.set(0, -0.05, 0.092); head.add(mouth);
      const lipLo = new T.Mesh(new T.SphereGeometry(0.014, 8, 4), lipM); lipLo.scale.set(1.3, 0.4, 0.4); lipLo.position.set(0, -0.058, 0.089); head.add(lipLo);
      const arm = sgn => {
        const shd = new T.Group(); shd.position.set(sgn * 0.235 * bw, 0.54, 0); torso.add(shd);
        const up = ink(new T.Mesh(geo.upArm, sleeve)); up.position.y = -0.15; shd.add(up);
        const el = new T.Group(); el.position.y = -0.3; shd.add(el);
        const fo = ink(new T.Mesh(geo.foArm, skin)); fo.position.y = -0.14; el.add(fo);
        const hand = ink(new T.Mesh(geo.hand, look.gloves ? std(look.gloves, 0.6) : skin)); hand.position.y = -0.29; el.add(hand);
        return { sh: shd, el };
      };
      const leg = sgn => {
        const hip = new T.Group(); hip.position.set(sgn * 0.1 * bw, -0.1, 0); pelvis.add(hip);
        const th = ink(new T.Mesh(geo.thigh, skin)); th.position.y = -0.2; hip.add(th);
        const kn = new T.Group(); kn.position.y = -0.41; hip.add(kn);
        const sn = ink(new T.Mesh(geo.shin, std(look.socks, 0.85))); sn.position.y = -0.19; kn.add(sn);
        const bt = ink(new T.Mesh(geo.boot, std(look.boots, 0.5))); bt.position.set(0, -0.4, 0.05); kn.add(bt);
        return { hip, kn };
      };
      const aL = arm(-1), aR = arm(1), lL = leg(-1), lR = leg(1);
      const hgt = ((p.card.details && p.card.details.height) || 180) / 180, big = 1.55 * clamp(hgt, 0.9, 1.12);
      root.scale.setScalar(big);
      scene.add(root);
      return { root, pelvis, torso, head, aL, aR, lL, lR, big, yaw: 0, ph: Math.random() * 6, lastY: 0, lean: 0 };
    }

    /* ---- pose: the shared animation names (engine.animOf) drive joint angles ---- */
    function pose(r, anim, t, p, m, dt) {
      const { pelvis, torso, head, aL, aR, lL, lR } = r;
      let lh = 0, rh = 0, lk = 0, rk = 0, lsw = 0, rsw = 0, lel = 0.15, rel = 0.15, lean = 0, twist = 0, py = 0.92, roll = 0, pitch = 0, tilt = 0, aSpread = 0.12, head_ = 0, kneel = 0;
      const sp = Math.hypot(p.vx, p.vy), ph = 2 * Math.PI * (p.gait || 0);
      const gait = (A, K, ar, lean0) => { lh = A * Math.sin(ph); rh = -lh; lk = K * clamp(-Math.cos(ph + 0.5) * 0.9 + 0.1, 0, 1); rk = K * clamp(Math.cos(ph + 0.5) * 0.9 + 0.1, 0, 1); lsw = -ar * Math.sin(ph); rsw = ar * Math.sin(ph); lean = lean0; twist = 0.12 * A * Math.sin(ph); py += 0.035 * A * Math.abs(Math.cos(ph)) - 0.02 * A; };
      anim = String(anim).replace(/_m$/, '');                                   // v154: a mirrored skill move (roll_m ...) is the same pose, the side comes from p.skill.side
      switch (anim) {
        case 'walk': gait(0.38, 0.55, 0.3, 0.03); lel = 0.2; rel = 0.2; break;
        case 'jog': gait(0.62, 1.05, 0.7, 0.1); lel = 1.05; rel = 1.05; break;
        case 'sprint': gait(0.9, 1.5, 1.0, 0.22); lel = 1.4; rel = 1.4; aSpread = 0.08; break;
        case 'dribble': gait(0.66, 1.0, 0.6, 0.12); lel = 0.9; rel = 0.9; break;
        case 'slide': pitch = -1.15; py = 0.34; rh = -0.5; lh = -0.2; lk = 0.5; rsw = 0.5; lsw = -0.6; aSpread = 0.9; lel = 0.2; rel = 0.2; break;
        case 'down': pitch = -1.45; py = 0.16; lh = -0.2; rh = -0.55; lk = 0.9; rk = 0.5; lsw = -0.4; rsw = -0.2; aSpread = 0.5; break;
        case 'stumble': { const w = Math.sin(m.t * 15); lean = 0.25; tilt = 0.3 * w; lsw = -1.2 + w; rsw = -1.0 - w; aSpread = 0.7; lh = 0.2 * w; rh = -0.3; rk = 0.4; break; }
        case 'tackle': rh = -1.25 * Math.sin(Math.PI * clamp(t * 1.4, 0, 1)); rk = 0.2; lk = 0.55; lean = 0.38; lh = 0.2; lsw = -0.6; rsw = 0.4; py = 0.85; break;
        case 'shot': case 'pass': case 'volley': {
          const strong = anim === 'shot';
          if (t < 0.42) { const u = t / 0.42; rh = 1.0 * u; rk = 1.35 * u; lh = -0.1 * u; lk = 0.35 * u; lean = -0.12 * u; rsw = -0.5 * u; lsw = 0.6 * u; }
          else { const u = clamp((t - 0.42) / 0.58, 0, 1), f = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75 * 0.85; rh = lerp(1.0, strong ? -1.45 : -1.0, clamp(u / 0.2, 0, 1)) * (u < 0.25 ? 1 : f); rk = (1 - clamp(u / 0.2, 0, 1)) * 1.35 + 0.15; lh = -0.1; lk = 0.35; lean = strong ? 0.2 : 0.1; rsw = 0.5; lsw = -0.5; }
          aSpread = 0.45; if (anim === 'volley') { py = 0.95 + 0.2 * Math.sin(Math.PI * t); rh = -1.3; rk = 0.5; lean = -0.42; }
          break; }
        case 'header': py += 0.55 * Math.sin(Math.PI * clamp(t, 0, 1)); lean = lerp(-0.3, 0.45, clamp(t * 1.6, 0, 1)); lh = 0.3; rh = -0.2; rk = 0.8; lk = 0.5; lsw = -0.8; rsw = -0.8; aSpread = 0.6; break;
        case 'touch': gait(0.55, 0.9, 0.5, 0.1); rh += -0.35 * Math.sin(Math.PI * clamp(t, 0, 1)); lel = 0.9; rel = 0.9; break;
        case 'trap': rh = -0.75; rk = 0.8; lk = 0.3; lean = -0.12; lsw = -0.5; rsw = 0.3; aSpread = 0.5; break;
        case 'dive_hi': case 'dive_lo': {
          const air = clamp(t / 0.35, 0, 1), hi = anim === 'dive_hi', toRight = -Math.sin(r.yaw) * (p.dvSide >= 0 ? 1 : -1) >= 0 ? 1 : -1;   // which of his own sides the dive goes to
          roll = -toRight * 1.3 * air; py = 0.5 + (hi ? 0.65 : 0.25) * Math.sin(Math.PI * clamp(t / 0.55, 0, 1)) + 0.15 * (1 - air); if (t > 0.5) py = 0.22;
          lsw = rsw = -2.9; aSpread = 0.1; lh = 0.4; rh = 0.2; lk = 0.5; rk = 0.3; break; }
        case 'up': case 'cross': case 'celeb_up': case 'celeb_wide': case 'celeb_sky': {
          const b = Math.abs(Math.sin(m.t * 6 + r.ph)); py += 0.22 * b; lsw = rsw = -2.7; aSpread = 0.6 + 0.2 * Math.sin(m.t * 9); lel = rel = 0.4; lk = rk = 0.4 * b; lean = -0.08; break; }
        case 'celeb_slide': pitch = -1.15; py = 0.34; lsw = rsw = -2.7; aSpread = 0.8; rh = -0.4; lh = -0.3; break;
        case 'celeb_kneel': { kneel = 1; py = 0.5; lh = -0.9; rh = -0.9; lk = 1.6; rk = 1.6; lsw = rsw = -2.8; aSpread = 0.4; lean = -0.15; break; }
        case 'celeb_siu': { const u = clamp(t, 0, 1); py += 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.3)); twist = u * Math.PI * 1.9; lsw = rsw = -2.7; aSpread = 0.7; lk = rk = 0.5; break; }
        case 'celeb_bow': lean = 0.9 * Math.sin(Math.PI * clamp(t, 0, 1)); lsw = rsw = 0.4; aSpread = 0.3; break;
        case 'celeb_dance': { const w = Math.sin(m.t * 10); py += 0.05 * Math.abs(w); lsw = -2.2 * (w > 0 ? 1 : 0.4); rsw = -2.2 * (w > 0 ? 0.4 : 1); aSpread = 0.35; lh = 0.4 * w; rh = -0.4 * w; twist = 0.4 * w; break; }
        case 'roll': case 'step': case 'feint': case 'knock': {
          const sd = p.skill && p.skill.side || 1, u = clamp(t, 0, 1), w = Math.sin(u * Math.PI * (anim === 'step' ? 4 : 2));
          if (anim === 'knock') { gait(0.9, 1.3, 0.9, 0.2); break; }
          tilt = sd * 0.32 * Math.sin(Math.PI * u); lean = 0.15; rh = -0.6 * w; lh = 0.5 * w; rk = 0.7 * Math.abs(w); lk = 0.4; lsw = -0.5 * w; rsw = 0.5 * w; twist = sd * 0.35 * Math.sin(Math.PI * u); aSpread = 0.4; break; }
        default: {
          const gk = p.isGK, br = Math.sin(m.t * 1.7 + r.ph);
          if (gk) { lh = rh = -0.35; lk = rk = 0.75; lean = 0.22; py = 0.8; lsw = rsw = -0.7; aSpread = 0.55; lel = rel = 0.7; }
          else { lean = 0.02 + 0.012 * br; lsw = 0.04 * br; rsw = -0.04 * br; lh = 0.04; rh = -0.04; }
          if (!gk) {                                                              // v154: the position stances of the pixel game
            if (anim === 'idle_cb') { lsw = rsw = -0.55; aSpread = -0.25; lel = rel = 1.7; }
            else if (anim === 'idle_fb' || anim === 'idle_dm') { lsw = rsw = 0.15; aSpread = 0.45; lel = rel = 1.15; lean = 0.06; }
            else if (anim === 'idle_w' || anim === 'idle_st') { lsw = rsw = 0.25; aSpread = 0.5; lel = rel = 1.3; lean = 0.03; lh = 0.1; rh = -0.1; }
          }
        }
      }
      lean += r.accF * 0.55; tilt -= r.accL * 0.6; if (anim === 'sprint' || anim === 'jog' || anim === 'dribble') py -= 0.02 * Math.abs(r.accF) * 4;   // v154: body inertia: leans into acceleration, braking and turns
      pelvis.position.y = py;
      pelvis.rotation.set(pitch, 0, roll);
      torso.rotation.set(lean, twist, tilt);
      head.rotation.set(-lean * 0.7, -twist * 0.5, 0);
      aL.sh.rotation.set(lsw, 0, -aSpread); aR.sh.rotation.set(rsw, 0, aSpread);
      aL.el.rotation.x = -lel; aR.el.rotation.x = -rel;
      lL.hip.rotation.x = -lh; lR.hip.rotation.x = -rh;
      lL.kn.rotation.x = lk; lR.kn.rotation.x = rk;
    }

    const rigs = new Map();
    function rigFor(p, m) {
      let r = rigs.get(p);
      const kit = m.teams[p.team].kit;
      if (!p._look || p._lookKit !== kit) { const Tm = m.teams[p.team]; p._look = RUT.PixelArt.lookFor(p.card.name, kit, p.isGK, p.team, { club: Tm.club, number: p.card.details && p.card.details.number, strength: p.card.sub.strength }); p._lookKit = kit; }
      if (!r || r.key !== p._look.key) { if (r) { scene.remove(r.root); } r = makeRig(p, p._look, kit); r.key = p._look.key; rigs.set(p, r); }
      return r;
    }

    /* ---- camera ---- */
    const CAM = { tv: { fov: 30, h: 36, back: 68 }, wide: { fov: 34, h: 24, back: 36 }, close: { fov: 40, h: 13, back: 22 } };   // v172: about 40% higher (JODIO: "make the view higher")
    const camTarget = new T.Vector3(), camPos = new T.Vector3();
    let curW = 0, curH = 0;
    const mProj = new T.Vector3();

    let spBlend = 0, spLast = null;
    function frame(m, view) {
      if (view.w !== curW || view.h !== curH) { curW = view.w; curH = view.h; renderer.setSize(curW, curH, false); camera.aspect = curW / curH; camera.updateProjectionMatrix(); }
      const c = CAM[view.mode] || CAM.tv;
      if (camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
      const tx = view.camX - PW2, tz = (view.camY - PH2) * view.fy;
      camTarget.set(tx, 0, tz); camPos.set(tx, c.h, tz + c.back);
      // v183 (JODIO's FC27 pictures): direct free kicks and penalties use a low camera behind the ball looking at the goal; it glides in and out
      spBlend += ((view.spCam ? 1 : 0) - spBlend) * Math.min(1, (view.dt || 0.016) * 4);
      if (view.spCam) spLast = view.spCam;
      if (spBlend > 0.01 && spLast) {
        const s = spLast, bx = s.bx - PW2, bz = s.by - PH2, gx = s.gx - PW2, gz = s.gy - PH2, L = Math.hypot(gx - bx, gz - bz) || 1, dx = (gx - bx) / L, dz = (gz - bz) / L;
        const back = s.pen ? 11 : s.corner ? 12 : 13, side = s.pen ? 3.2 : s.corner ? 2.5 : 1.6, hgt = s.pen ? 3.6 : s.corner ? 5.5 : 4.6, ahead = Math.min(L, 16);
        const px = bx - dx * back - dz * side, pz = bz - dz * back + dx * side, k = spBlend * spBlend * (3 - 2 * spBlend);
        camPos.lerp(new T.Vector3(px, hgt, pz), k); camTarget.lerp(new T.Vector3(bx + dx * ahead, s.pen ? 1.0 : 1.4, bz + dz * ahead), k);
        const fv = c.fov + (48 - c.fov) * k; if (Math.abs(camera.fov - fv) > 0.05) { camera.fov = fv; camera.updateProjectionMatrix(); }
      }
      if (view.shake) camPos.add(new T.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6));
      camera.position.copy(camPos); camera.lookAt(camTarget); camera.updateMatrixWorld(true);
      { const sx = Math.round(tx / 8) * 8, sz = Math.round(tz / 8) * 8;   // v219: the sun (and its shadow box) moves in 8 m steps, and the static shadow map is redrawn only when it steps
        if (sx !== sun.position.x - SUN_OFF.x || sz !== sun.position.z - SUN_OFF.z) { sun.position.set(sx + SUN_OFF.x, SUN_OFF.y, sz + SUN_OFF.z); sun.target.position.set(sx, 0, sz); sun.target.updateMatrixWorld(); renderer.shadowMap.needsUpdate = true; } }
      crowdU.uTime.value += view.dt || 1 / 60; crowdU.uCheer.value += ((view.crowd ? 1 : 0) - crowdU.uCheer.value) * Math.min(1, (view.dt || 1 / 60) * 4);   // v170: 3D fans sway, and jump on a cheer
      updateCloth(m);
      // ball
      ball.visible = !view.sprites;   // v177: in sprite mode the pixel ball is drawn depth-sorted with the players
      const b = m.ball, bd = m.ballDrawPos(), bx = bd.x - PW2, bz = bd.y - PH2, by = BR + Math.max(0, b.z);
      const rv = b.owner ? b.owner : b; let vx = rv.vx || 0, vz = rv.vy || 0; const sp = Math.hypot(vx, vz);
      if (sp > 0.05) { tmpAxis.set(vz, 0, -vx).normalize(); tmpQ.setFromAxisAngle(tmpAxis, sp * view.dt / BR); ballQ.premultiply(tmpQ); }
      ball.quaternion.copy(ballQ); ball.position.set(bx, by, bz);
      { const hk = Math.max(0, Math.min(1, (by - BR) / 6)); blob.position.x = bx + hk * 0.8; blob.position.z = bz + hk * 0.5; blob.scale.setScalar(1 + hk * 0.6); blob.material.opacity = 0.38 * (1 - 0.7 * hk); }
      ring.position.set(bx, 0.03, bz); ring.scale.setScalar(1 + Math.max(0, b.z) * 0.15); ring.material.opacity = b.owner ? 0.25 : 0.6;
      // players
      m.players.forEach(p => {
        const r0 = rigFor(p, m); r0.root.visible = !view.sprites; if (view.sprites) return;   // v171 (JODIO): players can be drawn as the normal-mode pixel sprites instead
        const r = r0, { anim, t } = m.animOf(p);
        const root = r.root; root.position.set(p.x - PW2, 0, p.y - PH2);
        let tf = Math.atan2(p.fx, p.fy);
        let dd = tf - r.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        r.yaw += dd * (1 - Math.exp(-view.dt / (0.05 + 0.09 * (1 - (p.agil != null ? p.agil : 0.5)))));
        root.rotation.y = r.yaw;
        { const dt = Math.max(view.dt, 1 / 120), k = 1 - Math.exp(-dt / 0.12), ax = (p.vx - (r.pvx == null ? p.vx : r.pvx)) / dt, ay = (p.vy - (r.pvy == null ? p.vy : r.pvy)) / dt;
          r.pvx = p.vx; r.pvy = p.vy; r.accF = (r.accF || 0) + (clamp((ax * p.fx + ay * p.fy) / 28, -0.6, 0.6) - (r.accF || 0)) * k; r.accL = (r.accL || 0) + (clamp((ax * p.fy - ay * p.fx) / 28, -0.6, 0.6) - (r.accL || 0)) * k; }
        pose(r, anim, t, p, m, view.dt);
      });
      renderer.render(scene, camera);
    }

    /** World point -> the engine's screen space (VIEW units); k = screen pixels per metre at that depth. */
    function proj(wx, wy, wz, vw, vh) {
      mProj.set(wx - PW2, wz || 0, wy - PH2).project(camera);
      const x = (mProj.x * 0.5 + 0.5) * vw, y = (1 - (mProj.y * 0.5 + 0.5)) * vh;
      // metres to pixels at this depth: project a point one metre to the side of it
      const e = mProj.set(wx - PW2, wz || 0, wy - PH2); const d = e.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const k = (vh / (2 * Math.tan(camera.fov * Math.PI / 360))) / Math.max(1, -d);
      return { x, y, k: k * 1.5 };
    }

    function dispose() {
      try { scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); }); } }); renderer.dispose(); const x = renderer.getContext().getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* already gone */ }
    }
    return { canvas, frame, proj, dispose, renderer, scene, camera, ground: env.ground };
  }

  RUT.Render3D = { supported, create };
})();
