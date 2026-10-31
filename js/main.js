/* =============================================================================
 * main.js  —  Hub UI & main loop
 * -----------------------------------------------------------------------------
 * A tiny view router (no framework): each tab is a render function that writes
 * HTML into #view. Global click delegation dispatches `data-act` attributes to
 * the ACTIONS table, so every button is a one-liner in markup.
 *
 * Main loop:
 *   • every Market.TICK_MS → market tick (prices, AI bids, sales), toasts, save
 *   • match overlay runs its own requestAnimationFrame loop (engine.js)
 * ========================================================================== */
(function () {
  'use strict';
  if (window.RUT) RUT.PORTRAITS = {};   // v165 (JODIO): no photo faces anywhere in the game: cards, HUD and menus use the drawn figures
  const { DB, State, Market, SBC, Packs, Evo, Engine } = window.RUT;
  const Net = window.RUT.Net;

  /* =============================== helpers =============================== */
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const D = () => State.data;
  const shortName = n => { const p = n.split(' '); return (p.length > 1 && n.length > 13 ? p.slice(-1)[0] : n).toUpperCase(); };
  const frameOf = c => (c.rarity === 'evo' ? 'evo' : c.promo ? c.promo + (c.potLg ? ' pot-' + c.potLg : '') : c.cl ? 'cl' : c.rarity);

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || ''); el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
  }

  function flagCSS(nation) {
    const f = DB.flagFor(nation), c = f.c, dir = f.dir === 'h' ? 'to bottom' : 'to right';
    return `background:linear-gradient(${dir},${c[0]} 0 33.3%,${c[1]} 33.3% 66.6%,${c[2]} 66.6%)`;
  }
  function clubCSS(club) { const k = DB.kitFor(club); return `background:linear-gradient(135deg,${k[0]} 0 55%,${k[1]} 55%)`; }

  /** 16×16 seeded pixel portrait (2x detail): hair styles, brows, eye whites, nose, mouth, ears, beard, collar. */
  const faceCache = {};
  function faceSVG(card) {
    // Real portrait from JODIO's card sheet when we have one (js/faces.js), else the pixel face.
    const photo = RUT.FACES && RUT.FACES[card.name];
    if (photo) return `<img class="c-photo" src="${photo}" alt="" draggable="false">`;
    const key = card.baseId || card.id;
    if (faceCache[key]) return faceCache[key];
    const r = DB.rng(DB.hashStr(card.name));
    const skins = [['#f1c27d', '#d9a35f'], ['#e0ac69', '#c08a4c'], ['#c68642', '#a06a30'], ['#8d5524', '#6e3f18'], ['#ffdbac', '#e8bc8a'], ['#a86b3c', '#87532b']];
    const hairs = ['#1a1a1a', '#3b2414', '#6a4423', '#d9b45a', '#a33a1a', '#cccccc', '#f0e0a0'];
    const [sk, sh] = skins[Math.floor(r() * skins.length)], hair = hairs[Math.floor(r() * hairs.length)];
    const kit = DB.kitFor(card.club), style = Math.floor(r() * 6), beard = r() < 0.3, stubble = !beard && r() < 0.3;
    const g = Array.from({ length: 16 }, () => Array(16).fill(''));
    const fill = (x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (g[y] && x >= 0 && x < 16) g[y][x] = c; };
    fill(4, 3, 8, 9, sk); fill(3, 6, 1, 3, sh); fill(12, 6, 1, 3, sh); // face + ears
    fill(5, 11, 6, 1, sh); fill(6, 12, 4, 2, sk); fill(10, 4, 2, 7, sh); // jaw shading, neck, cheek shade
    // hair styles: short, buzz, afro, long, mohawk, quiff
    if (style === 0) { fill(4, 2, 8, 2, hair); fill(4, 4, 1, 2, hair); fill(11, 4, 1, 2, hair); }
    if (style === 1) { fill(4, 3, 8, 1, hair); }
    if (style === 2) { fill(3, 0, 10, 4, hair); fill(2, 2, 2, 5, hair); fill(12, 2, 2, 5, hair); }
    if (style === 3) { fill(4, 1, 8, 3, hair); fill(3, 3, 2, 7, hair); fill(11, 3, 2, 7, hair); }
    if (style === 4) { fill(7, 0, 2, 4, hair); }
    if (style === 5) { fill(4, 2, 8, 2, hair); fill(6, 0, 6, 2, hair); }
    fill(5, 6, 2, 1, '#2a1a10'); fill(9, 6, 2, 1, '#2a1a10');            // brows
    fill(5, 7, 2, 1, '#ffffff'); fill(9, 7, 2, 1, '#ffffff'); fill(6, 7, 1, 1, '#111'); fill(10, 7, 1, 1, '#111'); // eyes
    fill(8, 8, 1, 2, sh);                                                  // nose
    fill(7, 10, 3, 1, '#7a3030');                                          // mouth
    if (beard) { fill(4, 9, 8, 3, hair); fill(6, 12, 4, 1, hair); fill(7, 10, 3, 1, '#7a3030'); }
    if (stubble) { for (let x = 5; x < 11; x += 2) fill(x, 11, 1, 1, sh); }
    fill(1, 14, 14, 2, kit[0]); fill(6, 14, 4, 1, kit[1]); fill(7, 15, 2, 1, kit[1]); // shirt + collar
    let rects = '';
    g.forEach((row, y) => row.forEach((c, x) => { if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }));
    return (faceCache[key] = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`);
  }

  const PS_ICON = {}; Object.values(DB.PLAYSTYLES).forEach(p => { PS_ICON[p.name] = p.icon; });
  const PS_DESC = {}; Object.values(DB.PLAYSTYLES).forEach(p => { PS_DESC[p.name] = p.engine; });

  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  /** Pixel-art player card (2x detail on full size: sub-info, stat bars, badges, chem style, signature aura). */
  function cardHTML(c, o) {
    o = o || {};
    if (!c) return `<div class="card ${o.mini ? 'mini' : ''} empty" ${o.attrs || ''}>${esc(o.emptyLabel || '+')}</div>`;
    const gk = c.position === 'GK';
    const L = gk ? ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] : ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
    const v = [c.face.pac, c.face.sho, c.face.pas, c.face.dri, c.face.def, c.face.phy];
    const sig = DB.signatureFor(c);
    const det = c.details || {};
    // Pixel-poster card: club-coloured backdrop, full-body pixel figure (js/pixelart.js), pixel-font name,
    // rating + position top-left, one row of six stats, then flag / league / club.
    const stats = v.map((x, i) => `<span><i>${L[i]}</i><b>${x}</b></span>`).join('');
    const chem = o.chem != null ? `<div class="chem">${[0, 1, 2].map(i => `<i class="${i < o.chem ? 'on' : ''}"></i>`).join('')}</div>` : '';
    const style = o.chemStyle && DB.CHEM_STYLES[o.chemStyle];
    const kit = DB.kitFor(c.club), PA = RUT.PixelArt;
    const bg = posterBg(kit);
    const pose = sig ? (sig.aura === 'lightning' ? 'cross' : ['zen', 'wings', 'samba', 'stars', 'ballon'].includes(sig.aura) ? 'up' : 'idle') : 'idle';
    // v168: the card is a real 3D slab: the face, eight edge layers behind it and a back plate (css .c3d)
    return `<div class="c3d ${o.mini ? 'mini' : ''} r-${frameOf(c)} ${c.bdorRank ? 'bd' + (c.bdorRank <= 3 ? '3' : c.bdorRank <= 10 || c.bdorRank > 30 ? '10' : '30') : c.award ? 'bd10' : ''}"><div class="card pxc ${o.mini ? 'mini' : ''} r-${frameOf(c)} ${c.bdorRank ? 'bd' + (c.bdorRank <= 3 ? '3' : c.bdorRank <= 10 || c.bdorRank > 30 ? '10' : '30') : c.award ? 'bd10' : ''} ${c.rare ? 'rare' : ''} ${sig ? 'sig sig-' + sig.aura : ''} ${o.sel ? 'sel' : ''}" ${o.attrs || ''} title="${esc(c.name)}" style="--bg:${bg};${sig ? '--sig:' + sig.color : ''}">
      <div class="c-shine"></div>${c.bdorRank ? `<div class="c-bdr"><i>&#9733;</i><b>${c.bdorRank > 30 ? 'HM' : '#' + c.bdorRank}</b><u>${c.bdorRank <= 3 ? 'TOP 3' : c.bdorRank <= 10 ? 'TOP 10' : c.bdorRank > 30 ? 'HONOR' : '2026'}</u></div><div class="c-bdlaurel"></div>` : ''}${c.award ? `<div class="c-bdr" title="${esc(c.award)}"><i>&#9733;</i><b style="font-size:.8em">${esc(c.awardShort)}</b><u>AWARD</u></div><div class="c-bdlaurel"></div>` : ''}${c.cl ? `<div class="c-cl ${c.cl.pct < 0 ? 'neg' : ''}" title="Champions League form: ${c.cl.pct > 0 ? '+' : ''}${c.cl.pct}% (base ${c.cl.base})"><i>&#9733;</i><b>${c.cl.pct > 0 ? '+' : ''}${c.cl.pct}%</b></div>` : ''}${sig ? '<div class="c-aura"></div>' : ''}
      <div class="c-ovr">${c.rating}</div><div class="c-pos">${c.position}</div>
      ${RUT.PORTRAITS && RUT.PORTRAITS[c.name] ? `<div class="c-port"><img src="${RUT.PORTRAITS[c.name]}" alt="" draggable="false"></div>` : ''}<div class="c-fig"><img src="${PA.cardFigure(c, pose)}" alt="" draggable="false"></div>
      <div class="c-name">${esc(shortName(c.name).toUpperCase())}</div>
      <div class="c-stats">${stats}</div>
      <div class="c-icons"><span class="c-flag" style="${flagCSS(c.nation)}"></span><span class="c-lg">${DB.LEAGUES[c.league].short}</span><span class="c-club" style="${clubCSS(c.club)}"></span></div>
      ${style ? `<div class="c-style" title="${esc(style.name)}">${esc(style.icon)}</div>` : ''}
      ${!o.mini && RUT.GT && RUT.GT.of(c).length ? `<div class="c-gt">${RUT.GT.of(c).map(g => `<span class="gt" title="${esc(RUT.GT.BY[g.k].name + (g.lv > 1 ? '+' : ''))}"><img src="${RUT.GT.url(g.k, g.lv > 1)}" alt="" draggable="false"></span>`).join('')}</div>` : ''}${!o.mini && RUT.PSIcon && c.playStyles && c.playStyles.some(n => /\+$/.test(n)) ? `<div class="c-ps">${c.playStyles.filter(n => /\+$/.test(n)).slice(0, 4).map(n => `<span class="ps gold" title="${esc(n)}"><img src="${RUT.PSIcon.url(n, true, frameOf(c) === 'cl' ? 'clpromo' : frameOf(c))}" alt="" draggable="false"></span>`).join('')}</div>` : ''}
      ${o.tag ? `<div class="c-tag">${esc(o.tag)}</div>` : ''}${o.offpos ? '<div class="offpos">OUT OF POS</div>' : ''}${chem}
    </div>${C3D_LAYERS}${c.promo === 'toty' || c.promo === 'tots' ? C3D_GHOST : ''}</div>`;
  }
  const C3D_LAYERS = '<i class="c3l"></i>'.repeat(8) + '<b class="c3d-back"></b>', C3D_GHOST = '<b class="c3d-ghost"></b>';   // v258: Team of the Year / Season cards also carry a faint second slab behind the front one

  /** Poster backdrop: a strong colour opposite the shirt on the colour wheel, so the pixel figure pops (like the reference art). */
  const bgCache = {};
  function posterBg(kit) {
    const k = kit.join();
    if (bgCache[k]) return bgCache[k];
    const hsl = hex => { const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
      if (!d) return [0, 0, l];
      const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [(h * 60 + 360) % 360, s, l]; };
    const [h0, s0] = hsl(kit[0]), [h1, s1] = hsl(kit[1]);
    let hue;
    if (s0 > 0.25) hue = (h0 + 180) % 360;          // coloured shirt: complementary colour
    else if (s1 > 0.25) hue = h1;                    // white/black shirt: the club's second colour
    else hue = 355;                                  // plain kit: classic red poster
    return (bgCache[k] = `hsl(${Math.round(hue)},58%,34%)`);
  }

  function itemTag(itemId) {
    const it = D().items[itemId];
    if (State.isInSquad(itemId)) return 'XI';
    if (D().evos.active[itemId]) return 'EVO';
    if (it && it.untradeable) return 'UT';
    return '';
  }

  function miniOvr(c) { return `<span class="mini-ovr ${frameOf(c) === 'promo' || c.promo ? 'promo' : frameOf(c)}">${c.rating}</span>`; }

  /* =============================== modal ================================= */
  function modal(html, cls) {
    $('#modal-root').innerHTML = `<div class="overlay" data-act="overlay-bg"><div class="modal px ${cls || ''}">
      <button class="btn sm r close" data-act="close">X</button>${bigTxt(html)}</div></div>`;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }
  /** v202: an in-game yes/no box. The browser's confirm() is silently blocked inside the Claude artifact (it always answered "no"). */
  function askYes(text, yes, danger) {
    return new Promise(res => {
      modal(`<h3>Are you sure?</h3><p style="font-size:9px;line-height:1.9">${esc(text)}</p><div class="row mt"><button class="btn ${danger ? 'r' : 'y'}" id="ask-yes">${esc(yes || 'Yes')}</button><button class="btn" id="ask-no">Cancel</button></div>`);
      const done = v => { closeModal(); res(v); };
      $('#ask-yes').addEventListener('click', e => { e.stopPropagation(); done(true); });
      $('#ask-no').addEventListener('click', e => { e.stopPropagation(); done(false); });
    });
  }

  /* =============================== app ================================== */
  const App = {
    view: 'home',
    marketTab: 'search', filters: {}, results: [],
    sbc: null,           // { id, slots[11] }
    clubFilter: { pos: '', rarity: '', sort: 'rating', q: '' },
    difficulty: 'pro', halfSeconds: 90, style: 'balanced', oppStyle: 'auto',
    match: null, pitch: 'huge', online: null,
  };
  window.App = App; RUT.toast = toast; // handy for debugging / tests

  /* ------------------------------ settings ------------------------------ */
  // every game option in one place; saved in this browser and applied at start-up
  const SETKEY = 'rut_settings';
  const SET = Object.assign({ net: 'online', lang: 'en', assist: 'semi', surface: 'dry', ballModel: 'match', gfx: null, camera: null, touch: 'auto' }, (function () { try { return JSON.parse(localStorage.getItem(SETKEY) || '{}') || {}; } catch (e) { return {}; } })());
  const saveSet = () => { try { localStorage.setItem(SETKEY, JSON.stringify(Object.assign({}, SET, { difficulty: App.difficulty, halfSeconds: App.halfSeconds, style: App.style, oppStyle: App.oppStyle, knockout: !!App.knockout, pitch: App.pitch }))); } catch (e) { /* storage blocked */ } };
  (function loadApp() { let o = {}; try { o = JSON.parse(localStorage.getItem(SETKEY) || '{}') || {}; } catch (e) { /* ignore */ }
    ['difficulty', 'halfSeconds', 'style', 'oppStyle', 'knockout', 'pitch'].forEach(k => { if (o[k] != null) App[k] = o[k]; }); if (SET.camera) App.camMode = SET.camera; })();
  /** On-screen touch controls: always, never, or (auto) when the main pointer is a finger. */
  const touchOn = () => SET.touch === 'on' || (SET.touch !== 'off' && !!(window.matchMedia && matchMedia('(pointer: coarse)').matches));
  const physCfg = () => ({ surface: SET.surface, ballModel: SET.ballModel, assist: SET.assist });

  function setView(v) { App.view = v; render(); window.scrollTo(0, 0); }

  let shownCoins = null;
  function animateCoins() {
    const target = D().coins, el = $('#hdr-coins');
    if (shownCoins == null) { shownCoins = target; el.textContent = fmt(target); return; }
    const from = shownCoins, t0 = performance.now();
    if (from === target) return;
    el.classList.add(target > from ? 'up' : 'down');
    const step = now => { const k = Math.min(1, (now - t0) / 600); el.textContent = fmt(from + (target - from) * k); if (k < 1) requestAnimationFrame(step); else { shownCoins = target; el.classList.remove('up', 'down'); } };
    requestAnimationFrame(step);
  }
  function updateHeader() {
    animateCoins();
    $('#hdr-club').textContent = D().clubName;
    const names = { home: 'Home', club: 'Club', squad: 'Squad & Chemistry', play: 'Kick Off', casual: 'Casual Match', online: 'Online Match', rules: 'Match Rules', playstyles: 'PlayStyles Guide', gametraits: 'Gametraits Guide', market: 'Transfer Market', bdorgal: 'Ballon d\'Or', sbc: 'Squad Building Challenges', 'sbc-build': 'SBC Builder', evo: 'Evolutions', store: 'Store', promoshop: 'Promo Shop', pstats: 'Player Stats', unassigned: 'Unassigned', settings: 'Settings', tactics: 'Tactics', staff: 'Staff & Training', league: 'League', top5: 'Top 5 Leagues', quests: 'Quests' };
    const parent = { top5: 'League', squad: 'Club', staff: 'Club', evo: 'Club', unassigned: 'Club', rules: 'Play', playstyles: 'Club', gametraits: 'Club', casual: 'Play', online: 'Play', 'sbc-build': 'SBCs', promoshop: 'Market', bdorgal: 'Market', pstats: 'Club' }[App.view];
    $('#crumbs').innerHTML = `<a href="#" data-act="nav" data-v="home">Home</a>${parent ? ' › ' + parent : ''} › <b>${esc(names[App.view] || '')}</b>`;
    const mv = { club: 'squad', tactics: 'squad', evo: 'squad', staff: 'squad', casual: 'play', online: 'play', rivals: 'play', league: 'play', top5: 'play', promoshop: 'market', sbc: 'store', 'sbc-build': 'store' }[App.view] || App.view;
    document.querySelectorAll('#mnav [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === mv));   // v214: phone tab bar
    document.querySelectorAll('#tabs .dd > button').forEach(b => {
      b.classList.toggle('on', b.dataset.view === App.view || (App.view === 'top5' && b.dataset.view === 'league') || (App.view === 'unassigned' && b.dataset.view === 'home') || (App.view === 'sbc-build' && b.dataset.view === 'sbc') || ((App.view === 'casual' || App.view === 'online') && b.dataset.view === 'play'));
      if (b.dataset.view === 'quests') { const n = RUT.Quests ? RUT.Quests.readyCount() : 0; b.innerHTML = 'Quests' + (n ? `<span class="badge">${n}</span>` : ''); }
      if (b.dataset.view === 'home' && b.parentElement.classList.contains('dd')) b.innerHTML = 'Home' + (D().unassigned.length ? `<span class="badge">${D().unassigned.length}</span>` : '');
    });
  }

  /* v214 (JODIO: FC 27 UT menu look, same colours): the menus use a clean sans font, so the tiny pixel-font sizes (7-9px) are scaled up,
     both in the stylesheet (once) and in the inline styles of each page. Cards keep their own fonts and sizes. */
  const bigPx = n => +n < 12 ? Math.round(n * 1.45 * 10) / 10 : +n;
  const bigTxt = h => h.replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (m, n) => 'font-size:' + bigPx(n) + 'px');
  let typeDone = false;
  function fc27Type() {
    if (typeDone) return; typeDone = true;
    const skip = /card|c3d|\.c-|pk|mb-|hud|fcr-|pxc|\.ps\b|match|canvas|intro|fc27|mnav|logo/i;
    for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; }
      const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; } if (!r.style || !r.selectorText || skip.test(r.selectorText)) continue;
        const f = r.style.fontSize, m = /^(\d+(?:\.\d+)?)px$/.exec(f || ''); if (m) r.style.fontSize = bigPx(m[1]) + 'px'; } };
      walk(rs); }
  }
  function render() {
    fc27Type();
    updateHeader();
    const fn = VIEWS[App.view] || VIEWS.home;
    const v = $('#view'); v.innerHTML = bigTxt(fn());
    v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); // page transition
    animateCoins(); fitPitches();
    if (App.view === 'market' && App.marketTab === 'search') bindMarketForm();
    if (App.view === 'club') bindClubFilters();
    if (App.view === 'play') bindPlay();
    if (App.view === 'coach') bindCoach();
    if (App.view === 'promoshop') shopBind();
    if (App.view === 'settings') bindSettings();
    if (App.view === 'casual') bindCasual();
    if (App.view === 'squad') { const f = $('#sq-form'); if (f) f.addEventListener('change', () => { State.setFormation(f.value); toast('Formation: ' + State.FORMS[f.value].name, 'good'); render(); }); }
    if (App.view === 'tactics') {
      [['#lab-opp', 'opp'], ['#lab-sty', 'style'], ['#lab-n', 'n'], ['#lab-half', 'half']].forEach(([id, k]) => { const e = $(id); if (e) e.addEventListener('change', () => { LAB[k] = (k === 'n' || k === 'half') ? +e.value : e.value; }); });
      drawTBoard(); pbBind(); ordersBind(); fcBind();
      const upd = () => { const g = id => { const v = ($(id) || {}).value; return v === '' || v == null ? null : +v; }; D().setPieces = { ck: g('#sp-ck'), fk: g('#sp-fk'), cstyle: ($('#sp-cs') || {}).value || '' }; State.save(); toast('Set pieces saved.'); };
      ['#sp-ck', '#sp-fk', '#sp-cs'].forEach(id => { const e = $(id); if (e) e.addEventListener('change', upd); });
    }
    State.save();
    siteLinks(true);
  }

  /* ================================ VIEWS ================================ */
  const VIEWS = {};

  /* ------------------------------ HOME ---------------------------------- */
  /* v210 (JODIO): "play this club on another site" with the club carried over. A website opens already logged in (#rut= link); the Claude page
     cannot read a link, so the code is copied as well and one paste on its login screen ("Paste my club") brings the club in. */
  const SITES = [
    { k: 'vercel', name: 'Vercel', url: 'https://fc-retro-27.vercel.app/', here: () => /vercel\.app$/.test(location.hostname) },     // v237 (JODIO): Vercel replaces Netlify as the transfer site
    { k: 'wix', name: 'Wix', url: 'https://headless-eeuplubgmqh-yimtchijoel-140b.wix-site-host.com/', here: () => /wix-site-host\.com$/.test(location.hostname) },     // v238 (JODIO): Wix site (loads the game from jsDelivr)
    { k: 'claude', name: 'Claude artifact', url: 'https://claude.ai/artifact/LK8vknaqmxJ72nuxVibgsN', clip: 1, here: () => /claude|anthropic/.test(location.hostname) },   // v248 (JODIO): the club is copied, then Paste my club on the artifact's login screen
  ];
  /* v222 (JODIO): the transfer button is a plain link that already carries the club (#rut=...), so the browser opens it like any link:
     no pop-up blocker, no "allow pop-ups" message. The code is refreshed after each render, every 10 s and when the pointer reaches the button. */
  let siteCodeAt = 0;
  async function siteLinks(force) {
    const as = document.querySelectorAll('a.site-go'); if (!as.length || !RUT.Auth.user) return;
    if (!force && Date.now() - siteCodeAt < 3000 && as[0].dataset.ready) return;
    try { State.save(); const code = encodeURIComponent(await RUT.Auth.exportCode('')); siteCodeAt = Date.now();
      document.querySelectorAll('a.site-go').forEach(a => { const x = SITES.find(q => q.k === a.dataset.k); if (x && x.url) { a.href = x.clip ? x.url : x.url + '#rut=' + code; if (x.clip) a.dataset.code = decodeURIComponent(code); a.dataset.ready = '1'; } });
    } catch (e) { /* the link still opens the site, the club can be moved with the transfer code */ }
  }
  setInterval(() => siteLinks(true), 10000);
  /* v254 (JODIO: the data from Wix / Vercel did not reach the artifact): the code is built INSIDE the click and handed to the clipboard as a promise, so it is always fresh and the browser keeps the click's permission; the message says "copied" only when it really was. */
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.site-go[data-k="claude"]'); if (!a || !RUT.Auth.user) return;
    const build = async () => { State.save(true); return RUT.Auth.exportCode(''); };
    const done = ok => toast(ok ? 'Club copied. On the Claude page just press Ctrl+V (or Paste my club): your club comes in by itself.' : 'Could not copy automatically: open Settings > Account > Show transfer code, copy it and paste it on the Claude page.', ok ? 'good' : 'bad');
    try {
      if (navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'text/plain': build().then(c => new Blob([c], { type: 'text/plain' })) })]).then(() => done(true), () => { build().then(c => navigator.clipboard.writeText(c)).then(() => done(true), () => done(false)); });
      else build().then(c => navigator.clipboard.writeText(c)).then(() => done(true), () => done(false));
    } catch (er) { done(false); } }, true);
  /* v254: pasting a club code ANYWHERE in the game (not in a text box) brings that club in, even when you are already logged in: the pasted club replaces the same-named club here and the game reloads into it. */
  document.addEventListener('paste', e => { const t0 = e.target; if (t0 && /^(INPUT|TEXTAREA|SELECT)$/.test(t0.tagName)) return; if (!RUT.Auth.user || App.match) return;
    const t = (e.clipboardData || { getData: () => '' }).getData('text') || ''; if (!/RUT1\./.test(t)) return; e.preventDefault();
    toast('Bringing your club in...', 'good'); RUT.Auth.importAny(t, true).then(a => { RUT.State.save = () => {}; RUT.Auth.start(a, true); RUT.State.save = () => {}; setTimeout(() => location.reload(), 600); }, ex => toast(ex.message, 'bad')); }, true);
  document.addEventListener('pointerover', e => { if (e.target.closest && e.target.closest('a.site-go')) siteLinks(); }, true);
  const sitesHTML = () => !SITES.some(x => !x.here()) ? '' : `<div class="px mt"><b>Play this club on another site</b><p class="dim" style="font-size:7px;line-height:1.9">Your players, coins and progress go with you. Websites open already logged in; on Claude press <b>Paste my club</b> on the login screen.</p><div class="row">${SITES.filter(x => !x.here()).map(x => x.url ? `<a class="btn y site-go" data-k="${x.k}" href="${x.url}" target="_blank" rel="noopener">Go to ${esc(x.name)}</a>` : `<button class="btn" disabled>${esc(x.name)}: coming soon</button>`).join('')}</div></div>`;
  VIEWS.home = function () {
    const st = D(), cards = State.squadCards();
    const rating = SBC.squadRating(cards.map(c => (c ? c.rating : 0))), chem = SBC.chemistry(cards).total;
    const packs = Object.entries(st.packsOwned).filter(([, n]) => n > 0);
    const s = st.stats;
    const stars = DB.players.filter(c => DB.signatureFor(c));
    const feat = stars[Math.floor(Date.now() / 8000) % stars.length];
    if (RUT.Menu2 && RUT.Menu2.on()) {   // v284: the new FC 26/27 style menu (set by js/menu2.js)
      const xiC = cards, spot = (c, i) => c ? `<div class="m2-pl" style="left:${[50,12,30,70,88,22,50,78,15,50,85][i] || 50}%;top:${[8,28,28,28,28,50,50,50,74,78,74][i] || 50}%"><b>${c.rating}</b><small>${esc((c.name || '').split(' ').slice(-1)[0])}</small></div>` : '';
      let fig = ''; try { fig = RUT.PixelArt.cardFigure(feat, 'up'); } catch (e) { /* optional */ }
      let bdFeat = '', bdTop = ''; try { const bd = (DB.BDOR_IDS || []).slice(0, 10).map((id, i) => DB.all.find(c => c.promo === 'bdor' && c.baseId === id)).filter(Boolean); if (bd.length) { const f = bd[Math.floor(Date.now() / 9000) % bd.length]; bdFeat = cardHTML(f, { attrs: `data-act="price" data-card="${f.id}"` }); bdTop = bd.map(c => cardHTML(c, { mini: true, attrs: `data-act="price" data-card="${c.id}"` })).join(''); } } catch (e) { /* optional */ }
      return RUT.Menu2.home({ st, rating, chem, figure: fig, feat: bdFeat, top10: bdTop, sbc: 5, packs: packs.reduce((a, [, k]) => a + k, 0), club: st.clubName, pos: 'Starting XI', rec: s.wins + 'W ' + s.draws + 'D ' + s.losses + 'L', goals: s.goalsFor + ':' + s.goalsAgainst, wins: s.wins, coins: (st.coins || 0).toLocaleString(), xi: xiC.map(spot).join(''), bench: st.unassigned.slice(0, 7).map(id => { const c = State.card(id); return c ? `<span class="m2-bn"><b>${c.rating}</b>${esc(c.name.split(' ').slice(-1)[0])}</span>` : ''; }).join('') });
    }
    return `<section class="hero">
      <div class="hero-txt"><div class="eyebrow">FC 27 · ULTIMATE TEAM</div><h1 class="hero-h">Build your club.<br>Play it in 1999.</h1>
        <p class="dim">Open packs, trade on a live market, complete SBCs and take your XI onto a pixel pitch where every rule counts.</p>
        <div class="row"><button class="btn y" data-act="nav" data-v="play">▶ Kick Off</button><button class="btn c" data-act="nav" data-v="store">Open Packs</button><button class="btn" data-act="nav" data-v="rules">Match Rules</button></div></div>
      <div class="hero-card">${cardHTML(feat, { attrs: `data-act="price" data-card="${feat.id}"` })}<div class="dim" style="font-size:7px;text-align:center">Signature star: ${esc(DB.signatureFor(feat).celebration)}</div></div>
    </section>
    ${mbBanner()}${digestBanner()}${SITES.some(x => !x.here()) ? `<div class="row mb" style="font-size:8px"><span class="dim">Play this club on another site:</span>${SITES.filter(x => !x.here()).map(x => x.url ? `<a class="btn sm site-go" data-k="${x.k}" href="${x.url}" target="_blank" rel="noopener">${esc(x.name)}</a>` : `<button class="btn sm" disabled>${esc(x.name)} (soon)</button>`).join('')}</div>` : ''}
    <div class="grid cols-3">
      <div class="px"><h2>${esc(st.clubName)}</h2>
        <div class="row between"><span class="dim">Squad Rating</span><span class="gold" style="font-size:18px">${rating}</span></div>
        <div class="row between"><span class="dim">Chemistry</span><span class="good" style="font-size:18px">${chem}/33</span></div>
        <div class="row between"><span class="dim">Record</span><span>${s.wins}W ${s.draws}D ${s.losses}L</span></div>
        <div class="row between"><span class="dim">Goals</span><span>${s.goalsFor} : ${s.goalsAgainst}</span></div>
        <div class="row mt"><button class="btn y" data-act="nav" data-v="play">▶ Play Match</button><button class="btn" data-act="nav" data-v="squad">Squad</button></div>
      </div>
      <div class="px"><h2>Unassigned</h2>
        <p class="dim">${st.unassigned.length ? st.unassigned.length + ' new item(s) waiting to be stored.' : 'Nothing waiting. Open a pack!'}</p>
        <div class="row">${st.unassigned.slice(0, 4).map(id => cardHTML(State.card(id), { mini: true, attrs: `data-act="player" data-item="${id}"` })).join('')}</div>
        <div class="row mt"><button class="btn c" data-act="nav" data-v="unassigned" ${st.unassigned.length ? '' : 'disabled'}>View Unassigned</button></div>
      </div>
      <div class="px"><h2>My Packs</h2>
        ${packs.length ? packs.map(([id, n]) => `<div class="row between"><span>${esc(Packs.PACKS[id].name)} ×${n}</span><button class="btn sm y" data-act="open-pack" data-pack="${id}">Open</button></div>`).join('') : '<p class="dim">No packs. Visit the Store or complete SBCs.</p>'}
        <div class="row mt"><button class="btn" data-act="nav" data-v="store">Store</button></div>
      </div>
      <div class="px"><h2>Activity</h2>
        ${st.log.slice(0, 8).map(l => `<div class="dim" style="font-size:8px;margin:4px 0">› ${esc(l.msg)}</div>`).join('') || '<p class="dim">Welcome to FC RETRO 27. Your starter XI is ready.</p>'}
      </div>
      <div class="px"><h2>Market Pulse</h2>
        ${(st.market.events || []).slice(0, 5).map(e => `<div style="font-size:8px;margin:4px 0">H${e.tick}: <span class="${e.label.includes('-') ? 'bad' : 'good'}">${esc(e.label)}</span></div>`).join('') || '<p class="dim">Quiet market. Prices drift every ' + Market.TICK_MS / 1000 + 's.</p>'}
        ${trendingHTML()}
      </div>
      <div class="px"><h2>How to play</h2>
        <p class="dim" style="font-size:8px">Open packs → store or sell items → trade on the Market (5% tax) → complete SBCs for promo packs and cards → push cheap cards through Evolutions → win matches for coins.</p>
        <button class="btn sm r" data-act="reset">Reset save</button>
      </div>
    </div>`;
  };

  /* Mbappé exchange (v85): a Kylian Mbappé card can be traded once per account for a full XI of 87-rated players (the old 94 promo card became a basic gold card) */
  const mbItem = () => { if (D().mbTrade) return null; return Object.keys(D().items).find(id => { const c = DB.get(D().items[id].cardId); return c && c.name === 'Kylian Mbappé' && !c.promo; }) || null; };
  function mbPick() {
    const used = new Set(), out = [];
    State.BASE_FORMATION.forEach(pos => {
      let best = null;
      DB.players.filter(c => !c.promo && c.altPositions.includes(pos) && !used.has(c.id)).forEach(c => { const d = Math.abs(c.rating - 87) + (c.position === pos ? 0 : 0.3) + (c.rating < 87 ? 0.1 : 0); if (!best || d < best.d) best = { c, d }; });
      used.add(best.c.id); out.push(best.c);
    });
    return out;
  }
  function mbBanner() {
    if (!mbItem()) return '';
    return `<div class="px mb"><h2>Mbappé exchange</h2><p class="dim" style="font-size:8px;line-height:1.9">Trade your Kylian Mbappé card for 11 players rated 87, one for every position of your XI. You can do this once.</p>
      <button class="btn y" data-act="mb-ask">Trade Mbappé for 11 × 87</button></div>`;
  }
  function trendingHTML() {
    const rows = DB.players.map(c => ({ c, s: Market.priceStats(c.id) })).filter(x => x.s).sort((a, b) => b.s.change24 - a.s.change24);
    const pick = rows.slice(0, 3).concat(rows.slice(-2));
    return `<h3 class="mt">Movers (24h)</h3>` + pick.map(x => `<div class="row between" style="font-size:8px;cursor:pointer" data-act="price" data-card="${x.c.id}">
      <span>${miniOvr(x.c)}${esc(x.c.name)}</span><span class="${x.s.change24 >= 0 ? 'good' : 'bad'}">${x.s.change24 >= 0 ? '▲' : '▼'}${Math.abs(x.s.change24).toFixed(1)}%</span></div>`).join('');
  }

  VIEWS.settings = function () {
    const opt = (key, cur, list) => `<div class="row">${list.map(([v, label, sub]) => `<button class="btn ${String(cur) === String(v) ? 'y' : ''}" data-act="set" data-k="${key}" data-v="${esc(v)}">${esc(label)}${sub ? `<br><span style="font-size:7px">${esc(sub)}</span>` : ''}</button>`).join('')}</div>`;
    const gfx = gfxPref();
    return `<h1>Settings</h1><p class="dim">Every option in the game. Changes are saved in this browser and apply to the next match.</p>
      <div class="grid cols-2">
      <div class="px"><h3>Account</h3>
        <p class="dim" style="font-size:8px;line-height:1.9">${RUT.Auth.cloud && RUT.Auth.cloud._db ? '<b class="good">Cloud save is on:</b> this club is copied to the cloud a few seconds after every change. On another device, log in with the same club name and password.' + (RUT.Auth.cloud.err ? ' (last upload failed: ' + esc(RUT.Auth.cloud.err) + ')' : '') + ' ' : '<b class="good">Your club is saved in this browser</b> (autosave every 3 seconds). Each site keeps its own save. '}To move <b>${esc((RUT.Auth.user || {}).name || '')}</b> to another device or browser, press <b>Show transfer code</b> here (a short text, or Export for a file), then use Import on that device's login screen and paste it. You must type the password to allow it. The file holds the club name, the password check and the save, never the password itself: keep it private, whoever has the file and guesses the password gets the club.</p>
        <div class="px mt" style="font-size:9px;line-height:2"><div>Club name: <b class="gold" style="user-select:all">${esc(RUT.Auth.user ? RUT.Auth.user.name : '')}</b></div><div>Password: ${RUT.Auth.savedPw() ? `<b class="gold" style="user-select:all">${esc(RUT.Auth.savedPw())}</b>` : '<span class="dim">log out and in once on this device to show it here</span>'}</div></div>
        ${sitesHTML()}
        <h3 class="mt">Lost progress?</h3><p class="dim" style="font-size:8px;line-height:1.9">If a cloud save replaced your club on this site, this brings back the club you had here before it (and keeps the other one as the backup).</p><div class="row"><button class="btn y" data-act="acc-restore">Restore my previous save</button></div>
        
        <div class="row mt"><button class="btn" data-act="acc-export">Export my account</button><button class="btn" data-act="acc-code">Show transfer code</button></div><div id="acc-code-box" class="mt" hidden><p class="dim" style="font-size:8px">Copy all of this text. On the other device choose Import on the login screen and paste it. Keep it private.</p><textarea id="acc-code" rows="4" readonly style="width:100%;box-sizing:border-box;font-size:10px"></textarea><div class="row mt"><button class="btn" data-act="acc-copy">Copy</button></div></div>
        <h3 class="mt">Change club name</h3><div class="row"><input id="acc-new" maxlength="16" placeholder="new club name" style="width:140px"><input id="acc-pw2" type="password" placeholder="password" autocomplete="current-password" style="width:120px"><button class="btn y" data-act="acc-rename">Rename club</button></div>
        <h3 class="mt">Delete account</h3><p class="dim" style="font-size:8px;line-height:1.9">Deletes this club, its players, coins and save on this device and in the cloud. This cannot be undone.</p><div class="row"><button class="btn r" data-act="acc-delete">Delete my account</button></div>
        <h3 class="mt">Accounts on this device</h3><table class="list"><tr><th>Club</th><th>Created</th><th>Coins</th><th>Cards</th></tr>${RUT.Auth.list().map(a => `<tr><td>${esc(a.name)}${a.me ? ' <span class="gold">(you)</span>' : ''}</td><td>${a.created ? new Date(a.created).toLocaleDateString() : ''}</td><td>${a.coins != null ? a.coins.toLocaleString() : '-'}</td><td>${a.items}</td></tr>`).join('')}</table>
        <p class="dim" style="font-size:7px;line-height:1.9">Only this browser's accounts are listed: other people's clubs live in their own browsers and cannot be seen from here.</p></div>
      <div class="px"><h3>Connection</h3>
        ${opt('net', SET.net, [['online', 'Online mode', 'cloud save + online matches'], ['offline', 'Offline mode', 'everything stays on this device']])}
        <p class="dim" style="font-size:8px;line-height:1.9">Offline mode: no cloud save and no online matches; Rivals games are played against AI rivals.</p>
        <label class="mt">Online match feel</label>
        ${opt('netq', SET.netq || 'auto', [['auto', 'Auto', 'set from your ping'], ['smooth', 'Smooth', 'no stutter, far / slow links'], ['fast', 'Fast', 'least delay, same Wi-Fi']])}
        <p class="dim" style="font-size:8px;line-height:1.9">Online matches connect directly between the two players, on the same Wi-Fi or different networks (relay servers are used when routers block a direct link). The host's choice is used. For the best results: Lite mode on phones (Performance), Smooth on mobile data.</p></div>
      <div class="px"><h3>Performance</h3>
        ${opt('perf', SET.perf || 'auto', [['auto', 'Auto', 'Lite on phones / weak PCs'], ['lite', 'Lite mode', '2D, 30 fps, fast'], ['full', 'Full', '3D, 60 fps']])}
        <p class="dim" style="font-size:8px;line-height:1.9">Lite mode is ${window.RUT_LITE ? '<b class="good">on</b>' : 'off'} on this device. Lite uses 2D Low graphics instead of 3D, and draws at 30 fps (pack openings keep their 3D scenes), for phones and older computers. Changing it reloads the game.</p></div>
      <div class="px"><h3>Language</h3>
        ${opt('lang', SET.lang, [['en', 'English'], ['fr', 'Français']])}
        <p class="dim" style="font-size:8px">Mode français: menus, commentaires et événements du match.</p></div>
      <div class="px"><h3>Commentary</h3>
        ${opt('comm', SET.comm || 'on', [['on', 'On', 'voice during matches'], ['off', 'Off']])}
        <p class="dim" style="font-size:8px">Recorded clips play where there is one (kick off for now); the other moments use the most natural voice on your device.</p></div>
      <div class="px"><h3>Match</h3>
        <label>Difficulty</label>
        ${opt('difficulty', App.difficulty, Object.entries(Engine.DIFFICULTY).map(([k, d]) => [k, d.name]))}
        <label>Half length</label>
        ${opt('halfSeconds', App.halfSeconds, [45, 90, 150, 240].map(n => [n, n + 's per half']))}
        <label>Opponent's tactic</label><select id="set-opp">${styleOptions(App.oppStyle, true)}</select>
        <label><input type="checkbox" id="set-ko" ${App.knockout ? 'checked' : ''}> Knockout tie (draw → penalty shootout, ABAB + sudden death)</label>
        <label>Pitch size</label>
        ${opt('pitch', App.pitch, [['standard', 'Standard 105x80'], ['large', 'Large 130x96'], ['huge', 'Huge 160x116']])}</div>
      <div class="px"><h3>Shooting & assists</h3>
        <label>Shot assist</label>
        ${opt('assist', SET.assist, [['full', 'Fully assisted', 'one press, aim and power corrected'], ['semi', 'Semi-assisted', 'time it for a green hit'], ['manual', 'Fully manual', 'precise timing, no safety net']])}
        <p class="dim" style="font-size:8px;line-height:2">Hold SHOOT to charge the power bar, release to wind up, then press SHOOT again as the marker reaches the green zone: a green hit is the cleanest strike, a mistimed one drags it wide or weakens it. Hold SHOOT and tap LOB for a chip, THRU for a finesse curler, both for a low driven shot; a full bar is a power shot. SHOOT without the ball near a loose ball in the box strikes it first time: a volley, half-volley or header by its height. Fully assisted skips the timing press and corrects aim and power for you. Online matches use the host's choice.</p></div>
      <div class="px"><h3>Physics</h3>
        <label>Pitch condition</label>
        ${opt('surface', SET.surface, [['dry', 'Firm & dry', 'grips, true bounce'], ['wet', 'Rain', 'skids, runs faster'], ['worn', 'Worn', 'slow, uneven bounce']])}
        <label>Match ball</label>
        ${opt('ballModel', SET.ballModel, [['match', 'Match ball', 'balanced'], ['classic', 'Classic', 'heavy, holds its line'], ['light', 'Light', 'swerves and dips']])}
        <p class="dim" style="font-size:8px;line-height:2">The ball is a real body: spin curves it (Magnus), air drag slows it, grass friction and bounce depend on the surface, and rebounds off posts, keepers and legs come from the simulation.</p></div>
      <div class="px"><h3>Graphics & camera</h3>
        <label>Graphics</label>
        ${opt('gfx', '3d', [['3d', 'Full 3D (WebGL)'], ['ultra', 'Ultra 1440p'], ['high', 'High'], ['med', 'Medium'], ['low', 'Low'], ['potato', 'Potato'], ['auto', 'Auto']])}
        <label>Camera</label>
        ${opt('camera', App.camMode || 'tv', [['tv', 'TV'], ['wide', 'Wide'], ['close', 'Close']])}
        <label>Mobile mode (touch controls)</label>
        ${opt('touch', SET.touch || 'auto', [['auto', 'Auto', 'phones and tablets'], ['on', 'Mobile mode ON', 'stick + buttons, any device'], ['off', 'Off', 'keyboard or gamepad']])}</div>
      <div class="px"><h3>Save</h3>
        <p class="dim" style="font-size:8px">Everything saves to your browser's LocalStorage.</p>
        <div class="row"><button class="btn r" data-act="reset">Reset save</button></div></div>
      </div>`;
  };
  function bindSettings() {
    const b = $('#set-opp'); if (b) b.addEventListener('change', () => { App.oppStyle = b.value; saveSet(); });
    const c = $('#set-ko'); if (c) c.addEventListener('change', () => { App.knockout = c.checked; saveSet(); });
  }

  VIEWS.rules = function () {
    const sec = (t, items) => `<div class="px"><h3>${t}</h3>${items.map(i => `<div class="rule">› ${i}</div>`).join('')}</div>`;
    return `<h1>Match & UT Rules</h1><p class="dim">How the engine enforces FC 27 rules in this game.</p><div class="grid cols-2">
      ${sec('Clock', ['2 halves of 45 game-minutes, scaled to your chosen half length', 'Stoppage time +1 to +6 per half, built from fouls, cards and goal celebrations', 'Knockout ties: a draw goes to an ABAB penalty shootout, then sudden death'])}
      ${sec('Offside', ['Checked at the exact frame a teammate passes', 'Offside position: past the ball and the second-last defender (0.25m body margin), in the opponent half', 'Penalised only when the player touches the ball, including rebounds off a save', 'No offside directly from a goal kick, corner or throw-in'])}
      ${sec('Fouls & cards', ['Slides from behind, reckless slides and careless tackles can be fouls', 'Advantage: play on for 2.5s while the fouled team keeps the ball, otherwise it comes back for a free kick', 'Yellow: reckless or from-behind tackles, persistent fouling (3 fouls), stopping a fast break', 'Red: second yellow, DOGSO outside the box, violent conduct', 'DOGSO in the box: penalty plus yellow when playing the ball'])}
      ${sec('Restarts', ['Direct free kick for physical fouls, with the wall 9.15m back', 'Indirect free kick (goalkeeper holding over 6s, offside): a goal straight from it does not count', 'Penalty: keeper stays on the line until the kick', 'Goal kicks, corners, throw-ins'])}
      ${sec('Stamina & PlayStyles+', ['Below 30% stamina, Acceleration, Sprint Speed and Agility drop proportionally', 'Rapid+: 2 s speed burst when sprinting with the ball (5 s cooldown)', 'Quick Step+: 3 s sharper acceleration when sprinting without the ball (5 s cooldown)', 'Finesse Shot+: +40% curve, faster finesse shots', 'Anticipate+: +35% tackle success, half the foul chance', 'Trivela+: outside-of-the-boot curve under pressure (purple arc)'])}
      ${sec('Ultimate Team', ['Chemistry: club 2/4/7, league 3/5/8, nation 2/5/8 → 1/2/3 pts, max 33', 'Out-of-position players get 0 chem and give 0', 'Chemistry Styles: full boost at 3 chem, up to +8 to +15', '5% EA tax on every sale, fixed price ranges, max 100 active listings, 1/3/6/12/24h durations', 'SBCs must pass every rule at once, then burn all 11 cards', 'Untradeables quick sell for 0. Duplicates cannot sit in the club: list them, store them for SBCs or quick sell them', 'Coins = Skill × (Completion + Goals − Conceded + Clean Sheet + Corners/Possession) − DNFs'])}
    </div>`;
  };

  /* v150: the PlayStyles guide: every style, what Silver and Gold do, and how to use it in a match */
  const PS_HOW = [
    ['Shooting', [
      ['Finesse Shot', 'On the ball, hold SHOOT (X / K), tap THROUGH (C / L) while charging, release. The ball leaves wide on a diagonal and curls back in to the far post. Aim with A / D. Cannot be combined with Power Shot.'],
      ['Power Shot', 'Hold SHOOT until the bar is almost full (over 93%) and release. Fast and dead straight, it never curves. Cannot be combined with Finesse Shot.'],
      ['Low Driven Shot', 'Hold SHOOT, tap LOB and THROUGH together, release. A low, hard shot that skids along the grass.'],
      ['Chip Shot', 'Hold SHOOT, tap LOB (V / I), release when the keeper has come off his line. The ball floats over him.'],
      ['Dead Ball', 'Works by itself on free kicks, corners and penalties: take the kick as normal.'],
      ['Precision Header', 'Works by itself: be under a cross or lob and press SHOOT or PASS as it arrives, and the header goes where you aim.'],
      ['Acrobatic', 'Press SHOOT early while a lofted ball is still coming down, and he volleys it first time.'],
      ['Gamechanger', 'Works by itself: strikes taken under pressure, off balance or awkwardly stay more accurate.'],
    ]],
    ['Passing', [
      ['Incisive Pass', 'Hold THROUGH (C / L) and release to play a through ball into space behind the line. Gold leads the runner better.'],
      ['Pinged Pass', 'Hold PASS (Z / J) and release for a hard, flat pass. Works best over medium distance.'],
      ['Tiki Taka', 'Works by itself on quick, short PASS taps between close team-mates.'],
      ['Long Ball Pass', 'Hold LOB (V / I) and release to switch play or find a striker 30 m or more away.'],
      ['Whipped Pass', 'Hold LOB from a wide area in the final third. The cross curls and arrives with extra pace.'],
      ['Inventive', 'Works by itself under pressure: he may play an outside-of-the-boot pass or flick to find a team-mate.'],
    ]],
    ['Ball control', [
      ['First Touch', 'Works by itself when receiving: harder passes are killed dead and a loose ball is reached sooner.'],
      ['Press Proven', 'Works by itself while an opponent is closing him down: fewer lost balls and cleaner passes under pressure.'],
      ['Rapid', 'Sprint (SHIFT) with the ball for a short burst of extra speed, then a cooldown. Needs 88 sprint speed for Gold.'],
      ['Technical', 'Works by itself when dribbling: the ball sticks closer to the feet in tight turns.'],
      ['Trickster', 'Chain skill moves: Q / SPACE signature move, E stepover, R feint. Gold lets him link them with less recovery.'],
    ]],
    ['Defending', [
      ['Aerial Fortress', 'Works by itself in the air: he wins more headers and challenges for crosses and long balls.'],
      ['Anticipate', 'Works by itself: a better read of when to tackle, so the standing tackle (Z / J) wins the ball more often.'],
      ['Block', 'Works by itself: stand in the way of a shot and he can throw himself in front and block it.'],
      ['Intercept', 'Works by itself: he cuts out more passes that go through his area.'],
      ['Jockey', 'Hold back and stay goal-side of the dribbler; he keeps his feet and shadows the carrier more tightly.'],
      ['Slide Tackle', 'Press SHOOT (X / K) when defending to slide in from the side or front; Gold reaches further and recovers faster.'],
      ['Quick Step', 'Sprint without the ball for a short burst of sharper acceleration, then a cooldown. Needs 88 acceleration for Gold.'],
      ['Relentless', 'Works by itself: stamina drains slower, so he keeps pressing and running late in the game.'],
      ['Bruiser', 'Works by itself: he wins more shoulder-to-shoulder contests and shrugs off challenges.'],
      ['Enforcer', 'Works by itself: a carrier shields the ball better and a defender wins more strength duels.'],
    ]],
    ['Set pieces & goalkeepers', [
      ['Long Throw', 'Works by itself on throw-ins: the thrower reaches further into the box.'],
      ['1v1 Close Down', 'Goalkeeper: works by itself, he rushes out faster against a runner through on goal and saves more close shots.'],
      ['Cross Claimer', 'Goalkeeper: works by itself, he comes for crosses from further and punches harder.'],
      ['Deflector', 'Goalkeeper: works by itself, parried shots go wide, away from danger.'],
      ['Far Reach', 'Goalkeeper: works by itself, his dives stretch further across the goal.'],
      ['Far Throw', 'Goalkeeper: works by itself, his throws and distribution travel further.'],
      ['Footwork', 'Goalkeeper: works by itself, he is better against low shots and close saves.'],
    ]],
  ];
  /* v252 (JODIO): the Gametraits guide */
  const GT_WHEN = { timef: 'The ball reaches him inside the box, facing goal.', range: '18 to 28 m out, centre of the pitch, clear sight of goal, nobody within 3 m.', crash: 'A team-mate has the ball on the wing in the final third.', perfp: 'He is pressed (a defender within 5 m) and a team-mate is free ahead.', pincr: 'He is wide in the final third and a team-mate is in the box.', switch: 'A team-mate is free on the far side, 26 m or more away.', burst: 'Open grass ahead of him, nobody close.', escape: 'A defender gets within 2.8 m of him on the ball.', ghost: 'His team has the ball in midfield and he is level with or ahead of it.', charge: 'The man on the ball takes a heavy touch (the ball runs more than 1 m from his feet) or has just received it.', shadow: 'His team does not have the ball: he tracks the nearest runner.', lane: 'A pass is in the air or rolling past him.', ditch: 'He is the last man and the attacker is within 3.4 m, outside the box.', sweep: 'A loose ball behind his defence, no team-mate nearer.', wall: 'Any shot he can reach.' };
  VIEWS.gametraits = function () {
    const G = RUT.GT; if (!G) return '<h1>Gametraits</h1>';
    const card = t => `<div class="px"><h3><img src="${G.url(t.k, false)}" alt="" style="width:24px;height:24px;vertical-align:middle"> <img src="${G.url(t.k, true)}" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px"> ${esc(t.name)}</h3>
      <div class="rule"><span class="pill ps silver">Normal</span> ${esc(t.d)}</div>
      <div class="rule"><span class="pill ps">Plus +</span> ${esc(t.d2)}</div>
      <div class="rule"><b>When:</b> ${esc(GT_WHEN[t.k] || '')}</div>
      <div class="rule"><b>Best for:</b> ${esc(t.pos.join(', '))}</div></div>`;
    return `<h1>Gametraits Guide</h1><p class="dim">15 Gametraits in 5 categories. Unlike a PlayStyle you press nothing: the player does it by himself in the right moment, and a red logo pops up to the right of him. Each has a normal and a plus (+) version; the plus is stronger. The logos sit on the right of the card.</p>
      <div class="px"><h3>Who gets them</h3><div class="rule">Special cards (promo, evolved, Ballon d'Or, award, Player of the Week and Month) get as many Gametraits as PlayStyles+ they have. Plain gold cards get two thirds of that, rounded up. A 90+ card gets one extra. The most any card has is 3. Cards without a PlayStyle+ have none. The traits come from the player's position and his best stats, and every card rated 92 or more has the plus version, every card below 92 has the normal version.</div></div>
      ${G.CATS.map(c => `<h2 class="mt">${esc(c.name)}</h2><div class="grid cols-2">${G.LIST.filter(t => t.cat === c.k).map(card).join('')}</div>`).join('')}`;
  };
  VIEWS.playstyles = function () {
    const G = DB.PS_GUIDE;
    const card = ([n, how]) => { const t = G[n] || ['', ''], ic = PS_ICON[n + '+'] || PS_ICON[n] || '';
      return `<div class="px"><h3>${RUT.PSIcon ? `<img src="${RUT.PSIcon.url(n, true)}" alt="" style="width:22px;height:22px;vertical-align:middle"> <img src="${RUT.PSIcon.url(n, false)}" alt="" style="width:22px;height:22px;vertical-align:middle;margin-right:4px">` : esc(ic)} ${esc(n)}</h3>
        <div class="rule"><span class="pill ps silver">Silver</span> ${esc(t[0])}</div>
        <div class="rule"><span class="pill ps">Gold +</span> ${esc(t[1])}</div>
        <div class="rule"><b>How to use:</b> ${esc(how)}</div></div>`; };
    return `<h1>PlayStyles Guide</h1><p class="dim">36 PlayStyles. Silver is the weaker version (about half the effect) and a player can hold any number of them. Gold (+) is the full version: a normal card carries one, special cards (promo, evolved) two or more, and an evolution never takes a card past three. Each PlayStyle has its own logo: it sits on the left of the card and pops up over the player's head in a match when it is used. Power Shot and Finesse Shot can never be on the same player. Keys are the one-player defaults; gamepad: A pass, B shoot, X through, Y lob.</p>
      ${PS_HOW.map(([cat, list]) => `<h2 class="mt">${esc(cat)}</h2><div class="grid cols-2">${list.map(card).join('')}</div>`).join('')}`;
  };

  /* v128: sell up to 30 unassigned players at 50% of their market price for a 200,000 fee (does not use the daily sell limit) */
  const MQ_MAX = 30, MQ_FEE = 120000, MQ_PCT = 0.4875;   // v143 (JODIO): the market quick sell pays 65% with a 120,000 fee (was 50% / 200,000)
  function mqValue(id) {
    const c = State.card(id), ps = Market.priceStats(c.baseId && c.promo ? c.baseId : c.id);
    return Math.round((ps ? ps.current : c.value) * MQ_PCT);
  }
  function mqOpen() {
    const st = D(), ids = st.unassigned.filter(id => { const it = st.items[id]; return it && !it.untradeable; });
    modal(`<h2>Market quick sell</h2><p class="dim" style="font-size:8px;line-height:1.8">Tick up to ${MQ_MAX} players. You get ${MQ_PCT * 100}% of their market price, minus a ${fmt(MQ_FEE)} coin fee for the whole sale.</p>
      <div class="cards mt" style="max-height:50vh;overflow:auto">${ids.map(id => `<label style="display:block;text-align:center;cursor:pointer"><input type="checkbox" class="mq-ck" data-item="${id}">${cardHTML(State.card(id), { mini: true })}<div class="gold" style="font-size:9px">${fmt(mqValue(id))}</div></label>`).join('') || '<p class="dim">No tradeable players in Unassigned.</p>'}</div>
      <p id="mq-sum" class="mt">Selected 0/${MQ_MAX}</p><div class="row mt"><button class="btn y" data-act="mq-go">Sell selected</button></div>`);
    const upd = () => {
      const on = [...document.querySelectorAll('.mq-ck:checked')];
      if (on.length > MQ_MAX) { on[on.length - 1].checked = false; on.pop(); toast('Max ' + MQ_MAX + ' players per sale', 'bad'); }
      const t = on.reduce((a, e) => a + mqValue(e.dataset.item), 0);
      $('#mq-sum').innerHTML = 'Selected ' + on.length + '/' + MQ_MAX + ' · you get <b class="gold">' + fmt(t) + '</b> − fee ' + fmt(MQ_FEE) + ' = <b class="' + (t >= MQ_FEE ? 'gold' : 'bad') + '">' + fmt(t - MQ_FEE) + '</b>';
    };
    document.querySelectorAll('.mq-ck').forEach(e => e.addEventListener('change', upd));
  }
  /* v143 (JODIO): bulk sell. Type how many players and the highest rating: that many of the lowest-rated players up to it are sold at 25% of market value, from the club (squad and bench too) or Unassigned. No fee, outside the daily sell limit. */
  const BS_PCT = 0.1875;
  const bsValue = id => { const c = State.card(id), ps = Market.priceStats(c.baseId && c.promo ? c.baseId : c.id); return Math.round((ps ? ps.current : c.value) * BS_PCT); };
  const bsScope = () => (($('#bs-s') || {}).value) || 'un';
  function bsPick(n, maxOvr, scope) {
    const st = D(), listed = new Set(st.transferList || []), un = new Set(st.unassigned || []);
    return Object.keys(st.items).filter(id => { const it = st.items[id], c = it && State.card(id); return c && !it.untradeable && !listed.has(id) && c.rating <= maxOvr && (scope === 'all' || (scope === 'un') === un.has(id)) && (scope === 'all' || !(st.sbcStorage || []).includes(id)); })
      .sort((a, b) => State.card(a).rating - State.card(b).rating || bsValue(a) - bsValue(b)).slice(0, n);
  }
  function bsOpen() {
    modal(`<h2>Bulk sell (19%)</h2><p class="dim" style="font-size:8px;line-height:1.8">Pick where to sell from (Unassigned, Assigned or both), then type how many and the highest rating: the lowest-rated players up to that rating go first, each for 19% of its market value. No fee.</p>
      <div class="row mt"><label>How many <input id="bs-n" type="number" min="1" max="500" value="10" style="width:70px"></label>
      <label>Max rating <input id="bs-r" type="number" min="1" max="99" value="75" style="width:70px"></label>
      <label>Sell from <select id="bs-s"><option value="un">Unassigned only</option><option value="club">Assigned only (club, squad, bench)</option><option value="all">Both</option></select></label></div>
      <p id="bs-sum" class="mt"></p><div class="row mt"><button class="btn r" data-act="bs-go">Sell them</button></div>`);
    const upd = () => {
      const n = Math.max(0, Math.min(500, +$('#bs-n').value || 0)), r = +$('#bs-r').value || 0, ids = bsPick(n, r, bsScope()), tot = ids.reduce((a, id) => a + bsValue(id), 0), sq = ids.filter(id => State.isInSquad(id)).length;
      $('#bs-sum').innerHTML = ids.length ? `${ids.length} players (rating ${State.card(ids[0]).rating} to ${State.card(ids[ids.length - 1]).rating}) for <b class="gold">${fmt(tot)}</b> coins${sq ? ` · <b class="bad">${sq} of them are in your squad or bench</b>` : ''}` : 'No players match.';
    };
    ['#bs-n', '#bs-r', '#bs-s'].forEach(q => $(q).addEventListener('input', upd)); upd();
  }
  /* --------------------------- UNASSIGNED ------------------------------- */
  VIEWS.unassigned = function () {
    const st = D();
    return `<div class="px"><div class="row between"><h2>Unassigned (${st.unassigned.length})</h2>
      <div class="row"><button class="btn g" data-act="unassigned-all-club">Send all to Club</button>
      <button class="btn r" data-act="unassigned-qs-bronze">Quick sell all < 65</button>
      <button class="btn y" data-act="mq-open">Market quick sell (49%)</button>
      <button class="btn p" data-act="stor-open">To SBC Storage</button>
      <button class="btn r" data-act="bs-open">Bulk sell (19%)</button></div></div>
      <p class="dim" style="font-size:8px">Click a card to store it, quick sell it, or list it on the Transfer Market.</p>
      <div class="cards mt">${st.unassigned.map(id => cardHTML(State.card(id), { attrs: `data-act="player" data-item="${id}"`, tag: itemTag(id) })).join('') || '<p class="dim">Empty.</p>'}</div></div>`;
  };

  /* ------------------------------ CLUB ---------------------------------- */
  VIEWS.club = function () {
    const f = App.clubFilter;
    let ids = D().club.slice();
    const list = ids.map(id => ({ id, c: State.card(id) })).filter(x => x.c &&
      (!f.pos || x.c.position === f.pos) && (!f.rarity || frameOf(x.c) === f.rarity || (f.rarity === 'special' && (x.c.promo || x.c.rarity === 'evo'))) &&
      (!f.q || x.c.name.toLowerCase().includes(f.q.toLowerCase())));
    list.sort((a, b) => f.sort === 'value' ? b.c.value - a.c.value : f.sort === 'name' ? a.c.name.localeCompare(b.c.name) : b.c.rating - a.c.rating);
    const pos = ['', 'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    return `<div class="px"><div class="row between"><h2>Club (${D().club.length} players)</h2>
      <div class="row">
        <input id="cf-q" placeholder="Search name" value="${esc(f.q)}" style="width:150px">
        <select id="cf-pos">${pos.map(p => `<option value="${p}" ${f.pos === p ? 'selected' : ''}>${p || 'Any pos'}</option>`).join('')}</select>
        <select id="cf-rarity">${['', 'bronze', 'silver', 'gold', 'special'].map(p => `<option value="${p}" ${f.rarity === p ? 'selected' : ''}>${p || 'Any rarity'}</option>`).join('')}</select>
        <select id="cf-sort">${['rating', 'value', 'name'].map(p => `<option value="${p}" ${f.sort === p ? 'selected' : ''}>Sort: ${p}</option>`).join('')}</select>
        <button class="btn r" data-act="bs-open">Bulk sell (19%)</button>
      </div></div>
      <div class="cards mt">${list.map(x => cardHTML(x.c, { attrs: `data-act="player" data-item="${x.id}"`, tag: itemTag(x.id) })).join('') || '<p class="dim">No players match.</p>'}</div></div>`;
  };
  function bindClubFilters() {
    const upd = () => { App.clubFilter = { q: $('#cf-q').value, pos: $('#cf-pos').value, rarity: $('#cf-rarity').value, sort: $('#cf-sort').value }; const pos = $('#cf-q').selectionStart; render(); const q = $('#cf-q'); q.focus(); q.setSelectionRange(pos, pos); };
    ['#cf-pos', '#cf-rarity', '#cf-sort'].forEach(s => $(s).addEventListener('change', upd));
    $('#cf-q').addEventListener('input', upd);
  }

  /* ------------------------------ SQUAD --------------------------------- */
  // slot coordinates (% of pitch) for the vertical 4-3-3 layout, same order as State.FORMATION
  const SLOT_XY0 = [[50, 90], [13, 68], [36, 73], [64, 73], [87, 68], [50, 55], [27, 43], [73, 43], [15, 20], [50, 13], [85, 20]];
  /** Slot spots on the vertical pitch for the club's formation (from the engine's own coordinates: x metres from the own goal, y across). */
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function slotXYNow() {
    const k = State.formationKey(); if (!k || k === '433') return SLOT_XY0;
    const f = Engine.FORMATIONS[k]; if (!f) return SLOT_XY0;
    return f.pts.map(([x, y], i) => i === 0 ? [50, 90] : [Math.round(clamp01(y / 68) * 78 + 11), Math.round(90 - (x - 4) * 1.18)]);
  }

  /* v99: the cards on the squad pitches are laid out in rows (slot numbers per row, GK first) and fitted so that none overlap: fitPitch() sizes the cards and spaces the rows evenly. */
  const FORM_ROWS = {
    '433': [[0], [1, 2, 3, 4], [5], [6, 7], [8, 9, 10]], '442': [[0], [1, 2, 3, 4], [5, 6, 7, 8], [9, 10]], '4231': [[0], [1, 2, 3, 4], [5, 6], [7, 8, 9], [10]],
    '451': [[0], [1, 2, 3, 4], [5, 6, 7, 8, 9], [10]], '352': [[0], [1, 2, 3], [4, 5, 6, 7, 8], [9, 10]], '343': [[0], [1, 2, 3], [4, 5, 6, 7], [8, 9, 10]],
    '3331': [[0], [1, 2, 3], [4, 5, 6], [7], [8, 9, 10]], '532': [[0], [1, 2, 3, 4, 5], [6, 7, 8], [9, 10]], '541': [[0], [1, 2, 3, 4, 5], [6, 7, 8, 9], [10]],
    '4121': [[0], [1, 2, 3, 4], [5], [6, 7], [8], [9, 10]], '3241': [[0], [1, 2, 3], [4, 5], [6, 7, 8, 9], [10]], '4222': [[0], [1, 2, 3, 4], [5, 6], [7, 8], [9, 10]], '4321': [[0], [1, 2, 3, 4], [5, 6, 7], [8, 9], [10]],
  };
  function rowAttrs(key) {
    const rows = FORM_ROWS[key || '433'] || FORM_ROWS['433'], pts = (Engine.FORMATIONS[key || '433'] || Engine.FORMATIONS['433']).pts, out = [];
    rows.forEach((r, ri) => { const s = r.slice().sort((a, b) => pts[a][1] - pts[b][1]); s.forEach((slot, ci) => { out[slot] = `data-fr="${ri}" data-fc="${ci}" data-fn="${s.length}"`; }); });
    return out;
  }
  function fitPitch(pit) {
    const slots = [...pit.querySelectorAll('.slot[data-fr]')]; if (!slots.length) return;
    pit.style.setProperty('--cz', 1);
    const P = pit.getBoundingClientRect(); if (!P.width) return;
    const r0 = slots[1] ? slots[1].getBoundingClientRect() : slots[0].getBoundingClientRect(), w0 = r0.width, h0 = r0.height;
    const R = Math.max(...slots.map(s => +s.dataset.fr)) + 1, nmax = Math.max(...slots.map(s => +s.dataset.fn));
    const s = Math.max(0.3, Math.min(1, P.width * 0.97 / (nmax * w0 * 1.03), P.height * 0.97 / (R * h0 * 1.04)));
    pit.style.setProperty('--cz', s.toFixed(3));
    const w = w0 * s, h = h0 * s, m = P.height * 0.015, step = R > 1 ? (P.height - 2 * m - h) / (R - 1) : 0;
    slots.forEach(sl => {
      const r = +sl.dataset.fr, c = +sl.dataset.fc, n = +sl.dataset.fn;
      sl.style.left = ((c + 0.5) * 100 / n) + '%'; sl.style.top = ((P.height - m - h / 2 - r * step) * 100 / P.height) + '%';
    });
  }
  const fitPitches = () => document.querySelectorAll('.pitch').forEach(fitPitch);
  window.addEventListener('resize', () => { clearTimeout(fitPitches.t); fitPitches.t = setTimeout(fitPitches, 120); });

  function pitchHTML(slots, act) {
    const cards = slots.map(id => (id ? State.card(id) : null)), SXY = slotXYNow(), RA = rowAttrs(State.formationKey());
    const chem = SBC.chemistry(cards);
    return `<div class="pitch"><div class="box t"></div><div class="box b"></div>
      ${State.FORMATION.map((pos, i) => `<div class="slot" ${RA[i]} style="left:${SXY[i][0]}%;top:${SXY[i][1]}%">
        ${cardHTML(cards[i], { mini: true, attrs: `data-act="${act}" data-slot="${i}"`, chemStyle: slots[i] && D().items[slots[i]].chemStyle, chem: cards[i] ? chem.perPlayer[i] : null, offpos: cards[i] && !chem.onPos[i], emptyLabel: '+ ' + pos })}
        <div class="lbl">${pos}</div></div>`).join('')}
    </div>`;
  }

  /* ------------------------------- roles -------------------------------- */
  /** The role a club item plays: {pos, group, role, auto}. In the XI the slot's position decides the group; elsewhere his own position. */
  function roleInfo(c, itemId) {
    const st = D(), slot = itemId ? st.squad.slots.indexOf(itemId) : -1, pos = slot >= 0 ? State.FORMATION[slot] : c.position;
    const chosen = itemId && st.items[itemId] ? st.items[itemId].role : null, group = RUT.roleGroup(pos);
    const valid = chosen && RUT.roleFits(RUT.ROLE_BY[chosen], group);
    return { pos, group, slot, role: RUT.roleOf(c, pos, valid ? chosen : null), auto: !valid };
  }
  const roleTags = r => r.add.map(t => `<span class="pill ps" style="font-size:7px">${esc((RUT.TRAIT_INFO || {})[t] || t)}</span>`).join(' ');
  function roleModal(itemId) {
    const c = State.card(itemId), ri = roleInfo(c, itemId), best = RUT.bestRole(c, ri.pos);
    modal(`<h2>Role · ${esc(c.name)} <span class="dim">(${esc(ri.pos)} · ${esc(RUT.ROLE_GROUP_NAME[ri.group])})</span></h2>
      <p class="dim" style="font-size:8px">The AI plays him from his traits plus his role: where he stands, what he tries on the ball and how he defends. Auto = the role that fits his traits and stats best (${esc(best.name)}).</p>
      <div class="row mb"><button class="btn sm ${ri.auto ? 'y' : ''}" data-act="role-set" data-item="${itemId}" data-role="">Auto · ${esc(best.name)}</button></div>
      ${RUT.rolesIn(ri.pos).map(r => `<div class="req ${!ri.auto && ri.role.key === r.key ? 'ok' : ''}" style="display:block;margin-bottom:8px">
        <div class="row between"><b>${esc(r.name)}${best.key === r.key ? ' <span class="dim">· best fit</span>' : ''}</b><button class="btn sm ${!ri.auto && ri.role.key === r.key ? 'y' : 'g'}" data-act="role-set" data-item="${itemId}" data-role="${r.key}">${!ri.auto && ri.role.key === r.key ? 'Current' : 'Use'}</button></div>
        <div class="dim" style="font-size:8px;line-height:1.7">${esc(r.desc)}</div><div>${roleTags(r)}</div></div>`).join('')}`);
  }
  const rolesPanel = () => {
    const st = D(), slots = st.squad.slots;
    return `<h3 class="mt">Roles <span class="dim" style="font-size:7px">(tap a role to change it · tap a name for stats and traits)</span></h3>
      <table class="list">${State.FORMATION.map((pos, i) => {
        const id = slots[i], c = id ? State.card(id) : null; if (!c) return `<tr><td>${pos}</td><td class="dim" colspan="2">empty</td></tr>`;
        const ri = roleInfo(c, id);
        return `<tr><td>${pos}</td><td><a href="#" data-act="player" data-item="${id}">${esc(c.name)}</a></td><td><button class="btn sm ${ri.auto ? '' : 'y'}" data-act="role-pick" data-item="${id}" title="${esc(ri.role.desc)}">${esc(ri.role.name)}${ri.auto ? ' · auto' : ''}</button></td></tr>`;
      }).join('')}</table>`;
  };

  VIEWS.squad = function () {
    const slots = D().squad.slots, cards = State.squadCards();
    const rating = SBC.squadRating(cards.map(c => (c ? c.rating : 0))), chem = SBC.chemistry(cards);
    const avg = k => Math.round(cards.filter(c => c && c.position !== 'GK').reduce((a, c) => a + c.face[k], 0) / Math.max(1, cards.filter(c => c && c.position !== 'GK').length));
    const pss = {}; cards.forEach(c => c && c.playStyles.forEach(p => { pss[p] = (pss[p] || 0) + 1; }));
    return `<div class="grid cols-2"><div class="px">${pitchHTML(slots, 'squad-slot')}${benchHTML()}</div>
      <div class="px"><h2>Squad · ${esc(State.FORMS[State.formationKey() || '433'].name)}</h2>
        <div class="row mb"><label class="dim" for="sq-form" style="font-size:8px">Formation</label> <select id="sq-form">${Engine.FORM_KEYS.map(k => `<option value="${k}" ${(State.formationKey() || '433') === k ? 'selected' : ''}>${esc(State.FORMS[k].name)}</option>`).join('')}</select></div>
        <div class="row between"><span class="dim">Rating</span><span class="gold" style="font-size:20px">${rating}</span></div>
        <div class="row between"><span class="dim">Chemistry</span><span class="good" style="font-size:20px">${chem.total}/33</span></div>
        <div class="mt">${['pac', 'sho', 'pas', 'dri', 'def', 'phy'].map(k => statBar(k.toUpperCase(), avg(k))).join('')}</div>
        <h3 class="mt">PlayStyles+ in XI</h3><div>${Object.keys(pss).map(p => `<span class="pill ps${/\+$/.test(p) ? '' : ' silver'}" title="${esc(PS_DESC[p] || PS_DESC[p.replace(/\+$/, '') + '+'] || '')}">${esc(PS_ICON[p] || PS_ICON[p.replace(/\+$/, '') + '+'] || '')} ${esc(p)} ×${pss[p]}</span>`).join('') || '<span class="dim">None yet</span>'}</div>
        <div class="row mt"><button class="btn y" data-act="squad-auto">Auto-build best XI</button><button class="btn" data-act="squad-clear">Clear</button></div>
        <p class="dim" style="font-size:8px">Chem: club 2/5/8 · nation 2/5/8 · league 3/5/8 in-position players = 1/2/3 pts (max 3 each). Out-of-position players get 0.</p>
      </div></div>`;
  };

  /** v229 (JODIO): 10 sub spots under the pitch; they can come on during a match (Subs button). */
  function benchHTML() {
    const b = D().squad.bench || [];
    return `<h3 class="mt">Subs <span class="dim" style="font-size:9px">${b.filter(Boolean).length}/10 · bring them on in a match with the Subs button</span></h3><div class="bench-row">${b.map((id, i) => `<div class="bench-slot">${cardHTML(id ? State.card(id) : null, { mini: true, attrs: `data-act="bench-slot" data-slot="${i}"`, emptyLabel: '+ SUB' })}</div>`).join('')}</div>`;
  }
  function benchPicker(i) {
    const st = D(), b = st.squad.bench, taken = new Set(st.squad.slots.concat(b).filter(Boolean));
    const rows = st.club.filter(id => !taken.has(id)).map(id => ({ id, c: State.card(id) })).filter(x => x.c).sort((x, y) => y.c.rating - x.c.rating);
    modal(`<h2>Pick sub ${i + 1}</h2><div class="row mb"><button class="btn sm r" data-act="bench-remove" data-slot="${i}">Empty spot</button></div>
      <table class="list"><tr><th>OVR</th><th>Name</th><th>Pos</th><th>Club</th><th></th></tr>${rows.slice(0, 200).map(x => `<tr><td>${miniOvr(x.c)}</td><td>${esc(x.c.name)}</td><td>${x.c.position}</td><td>${esc(x.c.club)}</td><td><button class="btn sm g" data-act="bench-pick" data-slot="${i}" data-item="${x.id}">Select</button></td></tr>`).join('')}</table>${rows.length ? '' : '<p class="dim">No free players in your club.</p>'}`);
  }
  function autoBench() {
    const st = D(), used = new Set(st.squad.slots.filter(Boolean)), names = new Set(st.squad.slots.filter(Boolean).map(id => (State.card(id) || {}).name));
    const pool = st.club.filter(id => !used.has(id)).map(id => ({ id, c: State.card(id) })).filter(x => x.c && !names.has(x.c.name)).sort((a, b) => b.c.rating - a.c.rating);
    const out = [], gk = pool.find(x => x.c.position === 'GK'); if (gk) { out.push(gk.id); names.add(gk.c.name); }
    pool.forEach(x => { if (out.length < 10 && !out.includes(x.id) && !names.has(x.c.name)) { out.push(x.id); names.add(x.c.name); } });
    while (out.length < 10) out.push(null); st.squad.bench = out;
  }

  function statBar(label, v) {
    const col = v >= 80 ? '#4cff7a' : v >= 70 ? '#ffe14a' : v >= 50 ? '#ff9a2a' : '#ff4d6d';
    return `<div class="stat-line"><span>${esc(label)}</span><span>${v}</span></div><div class="bar"><i style="width:${v}%;background:${col}"></i></div>`;
  }

  /** Picker for a squad / SBC slot. */
  function pickerModal(slotIdx, mode) {
    const pos = State.FORMATION[slotIdx];
    const st = D();
    const current = mode === 'sbc' ? App.sbc.slots : st.squad.slots;
    let pool = mode === 'sbc'
      ? st.club.concat(st.unassigned, st.sbcStorage || []).filter((id, k, a) => a.indexOf(id) === k && (App.sbcXI || !State.isInSquad(id)) && !current.includes(id))
      : st.club.filter(id => id !== current[slotIdx]);
    const rows = pool.map(id => ({ id, c: State.card(id) })).filter(x => x.c)
      .sort((a, b) => (b.c.altPositions.includes(pos) - a.c.altPositions.includes(pos)) || (mode === 'sbc' ? a.c.value - b.c.value : b.c.rating - a.c.rating));
    modal(`<h2>Pick ${pos}${mode === 'sbc' ? ' (cheapest first)' : ''}</h2>
      <p class="dim" style="font-size:8px">${mode === 'sbc' ? (App.sbcXI ? 'Your starting XI is shown too (marked XI): a starter you pick is burned on submit.' : 'Club, unassigned and SBC storage cards. Your starting XI is hidden to protect your squad.') + ` <a href="#" data-act="sbc-xi" data-slot="${slotIdx}">${App.sbcXI ? 'Hide my XI' : 'Show my XI'}</a>` : 'Players already in the XI will swap places.'}</p>
      <div class="row mb"><button class="btn sm r" data-act="${mode}-remove" data-slot="${slotIdx}">Empty slot</button>${mode === 'squad' && current[slotIdx] ? `<button class="btn sm c" data-act="player" data-item="${current[slotIdx]}">View card · stats · traits · role</button>` : ''}</div>
      <table class="list"><tr><th>OVR</th><th>Name</th><th>Pos</th><th>Club</th><th>Nation</th><th>Value</th><th></th></tr>
      ${rows.slice(0, 200).map(x => `<tr><td>${miniOvr(x.c)}</td><td>${esc(x.c.name)} ${State.isInSquad(x.id) ? '<span class="dim">(XI)</span>' : ''}</td>
        <td class="${x.c.altPositions.includes(pos) ? 'good' : 'bad'}">${x.c.position}</td><td>${esc(x.c.club)}</td><td>${x.c.nation}</td><td>${fmt(x.c.value)}</td>
        <td><button class="btn sm g" data-act="${mode}-pick" data-slot="${slotIdx}" data-item="${x.id}">Select</button></td></tr>`).join('')}
      </table>${rows.length ? '' : '<p class="dim">No available players. Buy some on the market or open packs.</p>'}`);
  }

  function autoBuildSquad() {
    const st = D(), used = new Set(), usedCards = new Set(), slots = new Array(11).fill(null);
    const pool = st.club.map(id => ({ id, c: State.card(id) })).filter(x => x.c).sort((a, b) => b.c.rating - a.c.rating);
    // fill exact positions first, best rating
    State.FORMATION.forEach((pos, i) => {
      const x = pool.find(p => !used.has(p.id) && !usedCards.has(p.c.baseId || p.c.id) && p.c.altPositions.includes(pos));
      if (x) { slots[i] = x.id; used.add(x.id); usedCards.add(x.c.baseId || x.c.id); }
    });
    State.FORMATION.forEach((pos, i) => {
      if (slots[i] || pos === 'GK') return;
      const x = pool.find(p => !used.has(p.id) && !usedCards.has(p.c.baseId || p.c.id) && p.c.position !== 'GK');
      if (x) { slots[i] = x.id; used.add(x.id); usedCards.add(x.c.baseId || x.c.id); }
    });
    st.squad.slots = slots;
  }


  /* ------------------------------- TACTICS ------------------------------- */
  /* ----------------------- tactic board (2D, 11 v 11) ---------------------- */
  // The board is not a drawing: the real match engine plays two minutes with your tactic against a normal side, and the average position of every
  // player is read off, with the ball (your team has it) and without it. Change a point or a trait and the board is played again.
  const TB = { cache: {}, phase: 'with' };
  function tbProfile(spec) {
    const ready = State.squadCards().every(Boolean), cards = ready ? State.matchCards() : Engine.buildOpponent('pro', 3).cards;
    const key = spec + '#' + cards.map(c => c && c.id).join(',');
    if (TB.cache[key]) return TB.cache[key];
    const opp = Engine.buildOpponent('pro', 101), SZ = Engine.PITCH_SIZES.huge;
    const m = new Engine.Match({ home: { name: 'You', short: 'YOU', cards }, away: opp, humans: [], halfSeconds: 120, seed: 21, pitch: 'huge', styles: [spec, '2-2-2|'] });
    m.headless = true;
    const dir = m.teams[0].dir, W = SZ[0], H = SZ[1], mkA = () => ({ n: 0, x: new Array(22).fill(0), y: new Array(22).fill(0) }), acc = { with: mkA(), without: mkA() };
    let next = 0;
    while (!m.over && m.t < 200) {
      m.update(1 / 30);
      if (m.t >= next && m.phase === 'play' && m.ball.owner) {
        next = m.t + 0.5; const a = m.ball.owner.team === 0 ? acc.with : acc.without; a.n++;
        m.players.forEach((p, i) => { a.x[i] += dir > 0 ? p.x / W : 1 - p.x / W; a.y[i] += dir > 0 ? p.y / H : 1 - p.y / H; });
      }
    }
    const out = { cards, names: m.players.map(p => p.card.position), possession: m.result ? m.result.stats.possession[0] : Math.round(100 * acc.with.n / Math.max(1, acc.with.n + acc.without.n)) };
    ['with', 'without'].forEach(ph => { const a = acc[ph], n = Math.max(1, a.n); out[ph] = a.x.map((x, i) => ({ x: x / n, y: a.y[i] / n })); });
    const lineOf = ph => { const d = out[ph].slice(1, 11).filter((_, i) => ['LB', 'CB', 'RB'].indexOf(out.names[i + 1]) >= 0); return d.length ? d.reduce((s, p) => s + p.x, 0) / d.length : 0.3; };
    const wide = ph => { const ys = out[ph].slice(1, 11).map(p => p.y); return Math.max(...ys) - Math.min(...ys); };
    const deep = ph => { const xs = out[ph].slice(1, 11).map(p => p.x); return Math.max(...xs) - Math.min(...xs); };
    out.stats = { line: lineOf('without'), lineWith: lineOf('with'), wide: wide('with'), deep: deep('without') };
    TB.cache[key] = out;
    return out;
  }
  function tboardHTML() {
    const t = clubTac(), ph = TB.phase;
    return `<div class="px tboard"><div class="row between"><h2>How your team plays <span class="dim" style="font-size:8px">${esc(styleName(myTac()))}</span></h2>
      <span><button class="btn sm ${ph === 'with' ? 'y' : ''}" data-act="tb-phase" data-p="with">With the ball</button> <button class="btn sm ${ph === 'without' ? 'y' : ''}" data-act="tb-phase" data-p="without">Without the ball</button></span></div>
      <canvas id="tboard" width="720" height="460" style="width:100%;max-width:720px;display:block;margin:8px auto;border:1px solid #334;image-rendering:auto"></canvas>
      <div id="tb-stats" class="dim" style="font-size:8px;line-height:1.9;text-align:center">Playing two minutes of football with this tactic...</div>
      <p class="dim" style="font-size:7px;line-height:1.8;text-align:center">Blue = you, attacking to the right. Red = the other team. Each dot is where that player really stands on average in two simulated minutes. The faint dot and line show where he stands in the other phase.</p></div>`;
  }
  function drawTBoard() {
    const cv = document.getElementById('tboard'); if (!cv) return;
    setTimeout(() => {
      const cv2 = document.getElementById('tboard'); if (!cv2) return;
      let P; try { P = tbProfile(myTac()); } catch (e) { const s = document.getElementById('tb-stats'); if (s) s.textContent = 'Board unavailable: ' + e.message; return; }
      const c = cv2.getContext('2d'), W = cv2.width, H = cv2.height, ph = TB.phase, oth = ph === 'with' ? 'without' : 'with';
      c.fillStyle = '#0f5a25'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; c.fillRect(i * W / 10, 0, W / 10, H); }
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.strokeRect(10, 10, W - 20, H - 20);
      c.beginPath(); c.moveTo(W / 2, 10); c.lineTo(W / 2, H - 10); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 46, 0, 7); c.stroke();
      [[10, 1], [W - 10, -1]].forEach(([x, s]) => { c.strokeRect(s > 0 ? x : x - 96, H / 2 - 110, 96, 220); c.strokeRect(s > 0 ? x : x - 36, H / 2 - 50, 36, 100); });
      const px = p => 10 + p.x * (W - 20), py = p => 10 + p.y * (H - 20);
      // the other team (mirrored so it faces left)
      for (let i = 11; i < 22; i++) { const p = P[ph][i]; c.fillStyle = 'rgba(224,60,60,.85)'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(px(p), py(p), 8, 0, 7); c.fill(); c.stroke(); }
      for (let i = 0; i < 11; i++) {
        const a = P[oth][i], b = P[ph][i];
        c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.5; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(px(a), py(a)); c.lineTo(px(b), py(b)); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(80,140,255,.25)'; c.beginPath(); c.arc(px(a), py(a), 7, 0, 7); c.fill();
      }
      for (let i = 0; i < 11; i++) { const p = P[ph][i]; c.fillStyle = '#2f7bff'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(px(p), py(p), 11, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(P.names[i], px(p), py(p)); }
      const s = P.stats, st = document.getElementById('tb-stats');
      if (st) st.innerHTML = `Possession <b class="gold">${P.possession}%</b> · back line <b class="gold">${Math.round(100 * (ph === 'with' ? s.lineWith : s.line))}%</b> up the pitch · team width <b class="gold">${Math.round(100 * s.wide)}%</b> of the pitch · team length <b class="gold">${Math.round(100 * s.deep)}%</b>`;
    }, 20);
  }

  /* Set pieces: corner and free-kick takers + the corner routine, saved with the club (D().setPieces) and handed to the engine (cfg.setPieces) in local matches */
  const spCfg = () => { const d = D(), o = d.setPieces || {}; return { ck: o.ck == null ? null : o.ck, fk: o.fk == null ? null : o.fk, cstyle: o.cstyle || '' }; };
  const spHTML = () => {
    const o = spCfg(), slots = D().squad.slots;
    const opts = k => '<option value="">Auto</option>' + slots.map((id, i) => { if (!i || !id) return ''; const c = State.card(id); return c ? `<option value="${i}" ${o[k] === i ? 'selected' : ''}>${esc(c.name)} (${c.position})</option>` : ''; }).join('');
    const sel = (id, label, body) => `<label>${label}</label><select id="${id}">${body}</select>`;
    const styles = [['', 'Auto (mixed)'], ['near', 'Near post'], ['back', 'Back post'], ['target', 'Target man'], ['top', 'Top of the box'], ['short', 'Short corner']];
    return sel('sp-ck', 'Corner taker', opts('ck')) + sel('sp-fk', 'Free-kick taker', opts('fk')) +
      sel('sp-cs', 'Corner routine', styles.map(([k, n]) => `<option value="${k}" ${o.cstyle === k ? 'selected' : ''}>${n}</option>`).join(''));
  };
  /* ---- Tactic lab (v103): simulates a batch of matches with your tactic against a plain balanced 2-2-2 version of your own club, same opponents and seeds, and shows the numbers ---- */
  const LAB = { opp: 'pro', style: 'auto', n: 8, half: 90, running: false, res: null, prog: '' };
  function labHTML() {
    const diffs = Object.entries(Engine.DIFFICULTY), r = LAB.res;
    const agg = a => { const n = a.length, s = f => a.reduce((x, m) => x + f(m), 0) / n; return { n, w: a.filter(m => m.won).length, d: a.filter(m => m.draw).length, l: a.filter(m => !m.won && !m.draw).length, gf: s(m => m.score[0]), ga: s(m => m.score[1]), sh: s(m => m.stats.shots[0]), sot: s(m => m.stats.onTarget[0]), poss: s(m => m.stats.possession[0]), tk: s(m => m.stats.tkWon[0]), shA: s(m => m.stats.shots[1]) }; };
    const row = (name, x) => `<tr><td><b>${name}</b></td><td>${x.w}-${x.d}-${x.l}</td><td>${(x.w * 3 + x.d) / x.n > 0 ? ((x.w * 3 + x.d) / x.n).toFixed(2) : '0.00'}</td><td>${x.gf.toFixed(2)}</td><td>${x.ga.toFixed(2)}</td><td>${x.sh.toFixed(1)} / ${x.sot.toFixed(1)}</td><td>${x.shA.toFixed(1)}</td><td>${x.poss.toFixed(0)}%</td><td>${x.tk.toFixed(1)}</td></tr>`;
    let out = LAB.running ? `<p class="gold">Simulating... ${esc(LAB.prog)}</p>` : '';
    if (r && !LAB.running) {
      const a = agg(r.you), b = agg(r.base), pts = x => (x.w * 3 + x.d) / x.n, gd = x => x.gf - x.ga;
      const dp = pts(a) - pts(b), dg = gd(a) - gd(b);
      const verdict = dp > 0.25 || dg > 0.4 ? '<span class="good">Better than a plain balanced setup.</span>' : dp < -0.25 || dg < -0.4 ? '<span class="bad">Worse than a plain balanced setup against this opponent. Try other points or another trait.</span>' : '<span class="gold">About the same as a plain balanced setup.</span>';
      out += `<table class="list"><tr><th></th><th>W-D-L</th><th>Pts/game</th><th>Goals for</th><th>Goals against</th><th>Shots / on target</th><th>Shots against</th><th>Possession</th><th>Tackles won</th></tr>
        ${row('Your tactic (' + esc(styleName(r.spec)) + ')', a)}${row('Plain balanced 2-2-2', b)}</table>
        <p style="font-size:9px;margin-top:6px">${verdict} Goal difference per match ${gd(a).toFixed(2)} vs ${gd(b).toFixed(2)} (${r.n} matches each, ${r.half}s halves, same opponents and seeds).</p>`;
    }
    return `<div class="px mt"><h2>Tactic lab</h2><p class="dim" style="font-size:8px;line-height:1.8">Test your tactic without playing: your club (with your formation, roles and tactic) plays a batch of computer matches against the opponent you choose, next to a plain balanced 2-2-2 version of the same club. Nothing is saved, no coins or results change.</p>
      <div class="row" style="flex-wrap:wrap;gap:8px"><span><label>Opponent</label><select id="lab-opp">${diffs.map(([k, d]) => `<option value="${k}" ${LAB.opp === k ? 'selected' : ''}>${esc(d.name)} (${d.lo}-${Math.min(d.hi, 91)})</option>`).join('')}</select></span>
        <span><label>Their tactic</label><select id="lab-sty">${styleOptions(LAB.style, true)}</select></span>
        <span><label>Matches</label><select id="lab-n">${[4, 8, 12, 20].map(n => `<option ${LAB.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
        <span><label>Half length</label><select id="lab-half">${[45, 90, 150].map(n => `<option value="${n}" ${LAB.half === n ? 'selected' : ''}>${n}s</option>`).join('')}</select></span></div>
      <div class="row mt"><button class="btn y" data-act="lab-run" ${LAB.running ? 'disabled' : ''}>Run test</button><button class="btn c" data-act="lab-watch">Watch one test match live</button></div>
      <div id="lab-out" class="mt">${out}</div></div>`;
  }
  function labDraw() { const e = document.getElementById('lab-out'); if (e && App.view === 'tactics') { const d = document.createElement('div'); d.innerHTML = labHTML(); const n = d.querySelector('#lab-out'); if (n) e.innerHTML = n.innerHTML; const b = document.querySelector('[data-act="lab-run"]'); if (b) b.disabled = LAB.running; } }
  function labRun() {
    if (LAB.running) return;
    const st = D(), home = { name: st.clubName, short: 'RFC', cards: State.matchCards() };
    if (!st.squad.slots.every(Boolean)) { toast('Fill your whole XI first.', 'bad'); return; }
    const spec = myTac(), base = Engine.tacSpec({ a: 2, m: 2, d: 2, trait: '', form: State.formationKey() || '' });
    LAB.running = true; LAB.res = null; LAB.prog = '0/' + LAB.n * 2;
    const opps = [], sty = []; for (let k = 0; k < LAB.n; k++) { opps.push(Engine.buildOpponent(LAB.opp)); sty.push(pickStyle(LAB.style)); }
    const res = { you: [], base: [], spec, n: LAB.n, half: LAB.half }; let i = 0;
    labDraw();
    const step = () => {
      if (i >= LAB.n * 2) { LAB.running = false; LAB.res = res; labDraw(); return; }
      const k = i % LAB.n, who = i < LAB.n ? 'you' : 'base';
      try { res[who].push(Engine.simulate(home, opps[k], { halfSeconds: LAB.half, styles: [who === 'you' ? spec : base, sty[k]], seed: 7000 + k, tacGain: [CLUB_GAIN, 0], coach: who === 'you' ? [coachK(), null] : undefined })); } catch (e) { LAB.running = false; toast('Test failed: ' + e.message, 'bad'); labDraw(); return; }
      i++; LAB.prog = i + '/' + LAB.n * 2; labDraw(); setTimeout(step, 20);
    };
    setTimeout(step, 30);
  }
  VIEWS.tactics = function () {
    return `<h1>Tactics</h1>${fcHTML()}
      <div class="px mt"><h2>Set pieces</h2><p class="dim" style="font-size:8px;line-height:1.8">Who takes your corners and free kicks, and how corners are played. Auto picks the best dead-ball specialists (Free Kick Accuracy, Curve, Dead Ball+). Local matches only: online uses Auto.</p>${spHTML()}</div>`;
  };

  /* v117: PLAYER ORDERS (Club > Tactics). Each starting player can get one standing order, picked from the list or typed ("stay back", "run to goal and shoot"). */
  const ORDER_HINT = { stay: 'holds his position in his own half and never goes forward', mark: 'sticks goal-side of their striker', goal: 'when you attack he runs to the penalty spot, shoots when he gets the ball', shoot: 'shoots as soon as he has a shot in range', wide: 'hugs the touchline and moves up and down it with the ball', support: 'stays close to the ball as a passing option', press: 'chases the opponent who has the ball' };
  /** Words to an order: the first rule that matches. */
  function orderFromText(t) {
    t = String(t || '').toLowerCase(); if (!t.trim()) return null;
    if (/\b(none|clear|free|nothing|reset|no order)\b/.test(t)) return '';
    if (/(run|go|get).{0,12}(to )?(the )?goal|run in behind|attack the box|goal.?shot|go.?shoot|finish/.test(t)) return 'goal';
    if (/shoot|shot|fire away|have a go|long shot/.test(t)) return 'shoot';
    if (/stay (at )?(back|home|deep)|hold (the )?(line|position)|stay cb|stay in defen|don'?t go (forward|up)|defend|sit deep|cover/.test(t)) return 'stay';
    if (/\bmark\b|man.?mark|track|shadow|follow their/.test(t)) return 'mark';
    if (/wide|wing|touchline|width|stay out/.test(t)) return 'wide';
    if (/press|chase|harass|close (him )?down|hunt/.test(t)) return 'press';
    if (/support|close|near the ball|help|link|stay with the ball|offer/.test(t)) return 'support';
    if (/\bstay\b|\bback\b|\bhold\b/.test(t)) return 'stay';
    return null;
  }
  function ordersHTML() {
    const st = D(), rows = st.squad.slots.map((id, i) => { if (!id) return ''; const c = State.card(id), it = st.items[id] || {}, cur = it.order || '';
      return `<tr><td>${State.FORMATION[i]}</td><td><b>${esc(c.name)}</b></td><td><select data-ordsel="${id}"><option value="">No order</option>${Object.entries(Engine.ORDERS).map(([k, n]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td><td><input data-ordtxt="${id}" placeholder="or type: stay cb, run to goal" style="width:180px"></td><td class="dim" style="font-size:7px;line-height:1.7">${cur ? esc(ORDER_HINT[cur]) : ''}</td></tr>`; }).join('');
    return `<div class="px"><h2>Player orders <span class="dim" style="font-size:8px">tell a player how to play</span></h2><p class="dim" style="font-size:8px;line-height:1.9">Give a starter one standing order and the computer plays him that way in every local match: <b>stay back</b> (holds his own half), <b>mark their striker</b>, <b>run to goal and shoot</b>, <b>shoot on sight</b>, <b>stay wide</b>, <b>stay close to the ball</b>, <b>press the ball</b>. Pick from the list or type it in your own words and press Enter. The order goes with the player; it doesn't apply while you control him yourself.</p>
      <div style="overflow-x:auto"><table class="list"><tr><th>Pos</th><th>Player</th><th>Order</th><th>Type an order</th><th></th></tr>${rows}</table></div>
      <div class="row mt"><button class="btn sm r" data-act="ord-clear">Clear all orders</button></div></div>`;
  }
  function ordersBind() {
    document.querySelectorAll('[data-ordsel]').forEach(e => e.addEventListener('change', () => { State.setItemOrder(e.dataset.ordsel, e.value); toast(e.value ? 'Order: ' + Engine.ORDERS[e.value] : 'Order removed', 'good'); render(); }));
    document.querySelectorAll('[data-ordtxt]').forEach(e => e.addEventListener('keydown', ev => { if (ev.key !== 'Enter') return; const k = orderFromText(e.value); if (k == null) { toast('I did not understand that order. Try: stay back, mark their striker, run to goal and shoot, stay wide, press the ball.', 'bad'); return; } State.setItemOrder(e.dataset.ordtxt, k); toast(k ? 'Order: ' + Engine.ORDERS[k] : 'Order removed', 'good'); render(); }));
  }
  /* ======================= v114: PLAY BOARD (Tactics) =======================
   * Drag your 11 points and the opponents', pick a player, pick an action (short pass, long ball, through ball, cross, shoot), click the receiver. "Run simulations" plays the play in the
   * real match engine (defenders and all) in six what-if set-ups the board offers. Plays you save and switch on are used by the computer-controlled players in your own matches, and the
   * team keeps score of how they go in the matches the computer plays for you. */
  const PB_ACTS = { short: ['Short pass', '#4aa0ff'], long: ['Long ball', '#ffd400'], through: ['Through ball', '#7dffa8'], cross: ['Cross', '#ff9f4a'], shoot: ['Shoot', '#ff4a4a'] };
  const PB = { mine: null, opp: null, steps: [], sel: null, pend: null, name: '', level: 'pro', n: 8, running: false, prog: '', res: null, vars: null, drag: null, editId: null };
  function pbReset(full) {
    const key = Engine.buildTactic(myTac()).formation;
    PB.mine = Engine.formSpots(key).map(q => q.slice()); PB.opp = Engine.BOARD_OPP.map(q => q.slice());
    if (full !== false) { PB.steps = []; PB.sel = null; PB.pend = null; PB.res = null; PB.vars = null; PB.editId = null; }
  }
  const pbCards = () => { try { return State.squadCards(); } catch (e) { return []; } };
  const pbName = slot => { const c = pbCards()[slot]; return (c ? c.name.split(' ').slice(-1)[0] : 'Player') + ' #' + (slot + 1); };
  const pbLast = () => PB.steps.length ? PB.steps[PB.steps.length - 1] : null;
  const pbDesc = (st, i) => (i + 1) + '. ' + pbName(st.from) + (st.act === 'shoot' ? ' shoots' : ' → ' + PB_ACTS[st.act][0].toLowerCase() + ' → ' + pbName(st.to));
  function pbHTML() {
    if (!PB.mine) pbReset();
    const plays = D().plays || [], last = pbLast(), done = last && last.act === 'shoot';
    const hint = PB.pend ? `Now click the player who gets the ${PB_ACTS[PB.pend][0].toLowerCase()}.` : !PB.steps.length ? (PB.sel != null ? pbName(PB.sel) + ' starts with the ball. Pick an action.' : 'Click the player who starts the play (he gets the ball), then pick an action. Drag any dot to move it.') : done ? 'The play ends with a shot. Run the simulations or save it.' : pbName(last.to) + ' has the ball next. Pick the next action.';
    const stepsHTML = PB.steps.length ? PB.steps.map((st, i) => `<span class="pill ps" style="font-size:8px;margin:2px">${esc(pbDesc(st, i))}${i === PB.steps.length - 1 ? ` <a href="#" data-act="pb-undo">✕</a>` : ''}</span>`).join('') : '<span class="dim" style="font-size:8px">No steps yet.</span>';
    return `<div class="px"><h2>Play board <span class="dim" style="font-size:8px">draw a play, test it, teach it to the team</span></h2>
      <p class="dim" style="font-size:8px;line-height:1.9">Blue = your XI, attacking to the right. Red = the other team. Drag the dots, click a player, pick an action and click who gets the ball (up to 4 steps). The board then plays it for real in six set-ups (opponents as drawn, high press, deep block, man-marking, ball-side shift, receiver closed down) and shows what worked. Plays you save and switch on are used when the computer plays your team (Watch AI vs AI, Quick Sim, and League or Top 5 matches you let it play). When you control the ball yourself the carrier is you, so a drawn play cannot start by itself.</p>
      <canvas id="pb" width="720" height="460" style="width:100%;max-width:720px;display:block;margin:8px auto;border:1px solid #334;touch-action:none;cursor:grab"></canvas>
      <div class="row" style="flex-wrap:wrap;gap:6px;justify-content:center">${Object.entries(PB_ACTS).map(([k, [n]]) => `<button class="btn sm ${PB.pend === k ? 'y' : ''}" data-act="pb-act" data-k="${k}" ${done ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      <p class="gold" style="font-size:8px;text-align:center;line-height:1.9;margin:6px 0">${esc(hint)}</p>
      <div style="text-align:center">${stepsHTML}</div>
      <div class="row mt" style="flex-wrap:wrap;gap:8px;align-items:flex-end"><span><label>Opponent level</label><select id="pb-lvl">${Object.entries(Engine.DIFFICULTY).map(([k, d]) => `<option value="${k}" ${PB.level === k ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></span>
        <span><label>Runs per set-up</label><select id="pb-n">${[6, 10, 16].map(n => `<option ${PB.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
        <span><label>Name</label><input id="pb-name" value="${esc(PB.name)}" maxlength="24" placeholder="e.g. Long ball to the wing" style="width:190px"></span></div>
      <div class="row mt" style="flex-wrap:wrap;gap:6px"><button class="btn y" data-act="pb-run" ${PB.running || !PB.steps.length ? 'disabled' : ''}>▶ Run simulations</button><button class="btn c" data-act="pb-vars" ${PB.running || !PB.steps.length ? 'disabled' : ''}>Find the best actions</button><button class="btn" data-act="pb-prove" ${PB.running || !plays.some(x => x.on) ? 'disabled' : ''}>Test saved plays in matches</button><button class="btn g" data-act="pb-save" ${PB.steps.length ? '' : 'disabled'}>${PB.editId ? 'Update saved play' : 'Save play'}</button><button class="btn sm" data-act="pb-reset">Reset points</button><button class="btn sm r" data-act="pb-clear">Clear steps</button></div>
      <div id="pb-out" class="mt">${pbOutHTML()}</div>
      <h3 class="mt">Saved plays</h3>${plays.length ? plays.map(pl => pbSavedHTML(pl)).join('') : '<p class="dim" style="font-size:8px;line-height:1.9">None yet. Draw a play, run the simulations, save it, and switch “Team uses it” on.</p>'}</div>`;
  }
  const pbEff = pl => { const r = pl.res || {}, live = pl.live || { n: 0, ok: 0 }, sim = r.overall == null ? 0.5 : r.overall; return (sim * 10 + live.ok) / (10 + live.n); };
  function pbSavedHTML(pl) {
    const live = pl.live || { n: 0, ok: 0 }, r = pl.res, off = live.n >= 4 && live.ok / live.n < 0.25;
    return `<div class="mt" style="padding:6px;border:1px solid ${pl.on ? '#ffd400' : '#334'}"><div class="row between" style="flex-wrap:wrap;gap:6px"><b>${esc(pl.name)}</b><span><button class="btn sm ${pl.on ? 'g' : ''}" data-act="pb-use" data-id="${pl.id}">Team uses it: ${pl.on ? 'ON' : 'OFF'}</button> <button class="btn sm" data-act="pb-load" data-id="${pl.id}">Edit</button> <button class="btn sm r" data-act="pb-del" data-id="${pl.id}">Delete</button></span></div>
      <p class="dim" style="font-size:8px;line-height:1.8;margin:3px 0">${pl.steps.map((st, i) => esc(pbDesc(st, i))).join(' · ')}</p>
      <p style="font-size:8px;line-height:1.8;margin:0">${r ? `Board runs: <b class="${r.overall >= 0.5 ? 'good' : r.overall >= 0.3 ? 'gold' : 'bad'}">${Math.round(r.overall * 100)}%</b> worked (loose ${Math.round(r.rL * 100)}%, pressed ${Math.round(r.rT * 100)}%)` : 'Not simulated yet'} · In matches the computer played: ${live.n ? live.ok + ' of ' + live.n + ' worked' : 'not used yet'}${off ? ' · <span class="bad">the team stopped using it (it failed too often)</span>' : pl.on && r ? ' · the team picks it when a carrier stands near his point' + (pbEff(pl) < 0.3 ? ' <span class="bad">(rate under 30%, rarely used)</span>' : '') : ''}</p></div>`;
  }
  const RES_NAME = { ok: 'worked', goal: 'goal', sot: 'on target', shot: 'shot missed', lost: 'ball lost', out: 'ball out', timeout: 'pass not received' };
  function pbOutHTML() {
    if (PB.running) return `<p class="gold" style="font-size:9px">Simulating... ${esc(PB.prog)}</p>`;
    let h = '';
    if (PB.res) {
      const R = PB.res;
      h += `<h3>Simulation · ${R.n} runs per set-up vs ${esc(Engine.DIFFICULTY[R.level].name)}${R.stale ? ' <span class="bad" style="font-size:8px">· you moved points since this run: run again</span>' : ''}</h3><div style="overflow-x:auto"><table class="list"><tr><th>Set-up</th><th>Worked</th><th>Goal</th><th>On target</th><th>Ball lost</th><th>Not received / out</th><th></th></tr>
        ${R.rows.map(r => `<tr><td><b>${esc(r.name)}</b><br><span class="dim" style="font-size:7px">${esc(r.desc)}</span></td><td><b class="${r.ok / R.n >= 0.5 ? 'good' : r.ok / R.n >= 0.3 ? 'gold' : 'bad'}">${Math.round(r.ok / R.n * 100)}%</b></td><td>${r.t.goal || 0}</td><td>${r.t.sot || 0}</td><td>${r.t.lost || 0}</td><td>${(r.t.timeout || 0) + (r.t.out || 0)}</td><td><span style="display:inline-block;height:6px;width:${Math.round(r.ok / R.n * 80)}px;background:#ffd400"></span></td></tr>`).join('')}</table></div>
        <p style="font-size:9px;margin-top:6px">Overall <b class="${R.overall >= 0.5 ? 'good' : R.overall >= 0.3 ? 'gold' : 'bad'}">${Math.round(R.overall * 100)}%</b> of the runs worked (loose set-ups ${Math.round(R.rL * 100)}%, pressed ${Math.round(R.rT * 100)}%). ${R.worst ? 'It breaks most at: ' + esc(R.worst) + '.' : ''}</p>
        <p class="dim" style="font-size:7px;line-height:1.9">“Worked” = every pass reached its receiver; if the play ends with a shot, the shot must also be on target or a goal. Each run nudges every player by about a metre, so the numbers are percentages over ${R.n} runs, not one fixed outcome. The computer plays the other 10 on both sides after the start.</p>`;
    }
    if (PB.vars) {
      h += `<h3 class="mt">Best action at each step</h3><div style="overflow-x:auto"><table class="list"><tr><th>Step</th>${Object.entries(PB_ACTS).filter(([k]) => k !== 'shoot').map(([k, v]) => `<th>${v[0]}</th>`).join('')}<th></th></tr>
        ${PB.vars.map(v => `<tr><td>${esc(pbDesc(PB.steps[v.i], v.i))}</td>${['short', 'long', 'through', 'cross'].map(k => `<td class="${k === v.best ? 'good' : ''}"><b>${v.r[k] == null ? '-' : Math.round(v.r[k] * 100) + '%'}</b>${k === PB.steps[v.i].act ? ' <span class="dim">(now)</span>' : ''}</td>`).join('')}<td>${v.best !== PB.steps[v.i].act ? `<button class="btn sm g" data-act="pb-apply" data-i="${v.i}" data-k="${v.best}">Use ${PB_ACTS[v.best][0]}</button>` : '<span class="good">best</span>'}</td></tr>`).join('')}</table></div>
        <p class="dim" style="font-size:7px;line-height:1.9">Each cell: how often the whole play worked when only this step's action was changed (same points, three set-ups: as drawn, high press, receiver closed down).</p>`;
    }
    if (PB.prove) { const P = PB.prove, d = (a, b) => (b - a >= 0 ? '+' : '') + (b - a).toFixed(2);
      h += `<h3 class="mt">Test in matches · ${P.n} simulated matches each vs ${esc(Engine.DIFFICULTY[P.level].name)}</h3><p style="font-size:9px;line-height:1.9">Same club, opponents and seeds, once without and once with your drawn plays. The computer ran a drawn play <b>${P.uses}</b> time${P.uses === 1 ? '' : 's'} in the ${P.n} matches and <b class="${P.uses && P.oks / P.uses >= 0.5 ? 'good' : 'gold'}">${P.oks}</b> worked.</p>
        <table class="list"><tr><th></th><th>Goals for</th><th>Goals against</th><th>Shots for</th></tr><tr><td>Without plays</td><td>${P.gfA.toFixed(2)}</td><td>${P.gaA.toFixed(2)}</td><td>${P.shA.toFixed(1)}</td></tr><tr><td>With plays</td><td>${P.gfB.toFixed(2)}</td><td>${P.gaB.toFixed(2)}</td><td>${P.shB.toFixed(1)}</td></tr><tr><td>Change</td><td>${d(P.gfA, P.gfB)}</td><td>${d(P.gaA, P.gaB)}</td><td>${d(P.shA, P.shB)}</td></tr></table>
        <p class="dim" style="font-size:7px;line-height:1.9">${P.uses < 3 ? 'Few uses: a play only starts when the computer carrier stands near his drawn point and the receiver is near his, so draw it where your team really plays. ' : ''}${P.n} matches is a small sample: a difference under about 0.3 goals is within the match-to-match swing.</p>`; }
    return h;
  }
  const pbOut = () => { const e = $('#pb-out'); if (e && App.view === 'tactics') e.innerHTML = pbOutHTML(); };
  const pbHome = () => ({ name: D().clubName, short: 'RFC', cards: State.matchCards() });
  const pbPlay = () => ({ id: 'pb', mine: PB.mine, steps: PB.steps, on: true });
  function pbCtx(play, opp) { const s0 = play.steps[0]; return { mine: play.mine, ball: play.mine[s0.from], tgt: s0.to != null ? play.mine[s0.to] : null }; }
  /** Runs the scenarios one run at a time (the page stays alive). job(): { play, keys, n, onDone(rows) } */
  function pbRunJobs(play, keys, n, level, done) {
    const home = pbHome(), away = Engine.buildOpponent(level, 5), scn = Engine.BOARD_SCN.filter(x => keys.includes(x.key));
    const jobs = []; scn.forEach(sc => { const opp = sc.fn(PB.opp, pbCtx(play)); for (let k = 0; k < n; k++) jobs.push({ sc, opp, k }); });
    const rows = scn.map(sc => ({ key: sc.key, name: sc.name, desc: sc.desc, ok: 0, t: {}, at: {} }));
    let i = 0;
    const step = () => {
      if (!PB.running) return;
      const t0 = performance.now();
      while (i < jobs.length && performance.now() - t0 < 40) {
        const j = jobs[i++], row = rows.find(r => r.key === j.sc.key);
        let r; try { r = Engine.boardSim({ home, away, play, opp: j.opp, seed: 300 + j.k, styles: [myTac(), 'balanced'], tacGain: [CLUB_GAIN, 0], pitch: App.pitch || 'huge' }); } catch (e) { PB.running = false; toast('Simulation failed: ' + e.message, 'bad'); pbOut(); return; }
        row.t[r.res] = (row.t[r.res] || 0) + 1; if (r.ok) row.ok++; if (!r.ok) row.at[r.at] = (row.at[r.at] || 0) + 1;
      }
      PB.prog = i + ' / ' + jobs.length; pbOut();
      if (i < jobs.length) setTimeout(step, 10); else done(rows);
    };
    PB.running = true; PB.prog = '0 / ' + jobs.length; pbOut(); setTimeout(step, 20);
  }
  function pbRun() {
    if (PB.running || !PB.steps.length) return;
    const play = pbPlay(), keys = Engine.BOARD_SCN.map(x => x.key), n = PB.n, level = PB.level; PB.vars = null;
    pbRunJobs(play, keys, n, level, rows => {
      PB.running = false; const avg = ks => { const rr = rows.filter(r => ks.includes(r.key)); return rr.reduce((a, r) => a + r.ok, 0) / (rr.length * n); };
      const fails = {}; rows.forEach(r => Object.entries(r.at).forEach(([k, v]) => { fails[k] = (fails[k] || 0) + v; }));
      const wk = Object.entries(fails).sort((a, b) => b[1] - a[1])[0];
      PB.res = { n, level, rows, overall: avg(keys), rL: avg(['drawn', 'deep', 'side']), rT: avg(['press', 'mark', 'recv']), worst: wk ? 'step ' + (+wk[0] + 1) + ' (' + pbDesc(PB.steps[+wk[0]], +wk[0]).replace(/^\d+\.\s*/, '') + ')' : '' };
      pbOut(); const h = $('#pb-out'); if (h) h.scrollIntoView({ block: 'nearest' });
    });
  }
  function pbVars() {
    if (PB.running || !PB.steps.length) return;
    const acts = ['short', 'long', 'through', 'cross'], idxs = PB.steps.map((s, i) => i).filter(i => PB.steps[i].act !== 'shoot'), out = [], n = Math.max(6, PB.n - 2), level = PB.level;
    if (!idxs.length) { toast('Only a shot in this play: nothing to compare.', 'bad'); return; }
    PB.res = PB.res; PB.vars = null; const queue = []; idxs.forEach(i => acts.forEach(a => queue.push({ i, a })));
    const next = () => {
      if (!queue.length) { PB.running = false; PB.vars = idxs.map(i => { const r = {}; out.filter(o => o.i === i).forEach(o => { r[o.a] = o.rate; }); const best = acts.slice().sort((a, b) => (r[b] || 0) - (r[a] || 0) || (a === PB.steps[i].act ? -1 : 1))[0]; return { i, r, best }; }); pbOut(); return; }
      const q = queue.shift(), play = pbPlay(); play.steps = PB.steps.map((s, k) => k === q.i ? Object.assign({}, s, { act: q.a }) : s);
      PB.running = false; const tot = idxs.length * acts.length, doneN = tot - queue.length;
      pbRunJobs(play, ['drawn', 'press', 'recv'], n, level, rows => { out.push({ i: q.i, a: q.a, rate: rows.reduce((a, r) => a + r.ok, 0) / (rows.length * n) }); PB.prog = 'comparing actions ' + (tot - queue.length) + ' / ' + tot; next(); });
      PB.prog = 'comparing actions ' + doneN + ' / ' + tot;
    };
    next();
  }
  function pbProve() {
    if (PB.running) return; const on = (D().plays || []).filter(pl => pl.on);
    if (!on.length) { toast('Save and switch on at least one play first.', 'bad'); return; }
    const st = D(); if (!st.squad.slots.every(Boolean)) { toast('Fill your whole XI first.', 'bad'); return; }
    const home = pbHome(), spec = myTac(), n = 10, opps = [], sty = [], A = [], B = [];
    for (let k = 0; k < n; k++) { opps.push(Engine.buildOpponent(PB.level)); sty.push(pickStyle('auto')); }
    let i = 0; PB.running = true; PB.prove = null; PB.prog = 'matches 0 / ' + n * 2; pbOut();
    const step = () => {
      if (!PB.running) return;
      if (i >= n * 2) {
        PB.running = false; const sum = (L, f) => L.reduce((a, r) => a + f(r), 0) / L.length, uses = B.reduce((a, r) => a + (r.plan || []).length, 0), oks = B.reduce((a, r) => a + (r.plan || []).filter(e => e.ok).length, 0);
        PB.prove = { n, level: PB.level, uses, oks, gfA: sum(A, r => r.score[0]), gfB: sum(B, r => r.score[0]), gaA: sum(A, r => r.score[1]), gaB: sum(B, r => r.score[1]), shA: sum(A, r => r.stats.shots[0]), shB: sum(B, r => r.stats.shots[0]) }; pbOut(); return;
      }
      const k = i % n, isB = i >= n;
      try { (isB ? B : A).push(Engine.simulate(home, opps[k], { halfSeconds: 90, styles: [spec, sty[k]], seed: 8000 + k, tacGain: [CLUB_GAIN, 0], plays: isB ? [playsCfg(), null] : undefined })); }
      catch (e) { PB.running = false; toast('Test failed: ' + e.message, 'bad'); pbOut(); return; }
      i++; PB.prog = 'matches ' + i + ' / ' + n * 2; pbOut(); setTimeout(step, 20);
    };
    setTimeout(step, 20);
  }
  function pbDraw() {
    const cv = document.getElementById('pb'); if (!cv || !PB.mine) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, X = f => 14 + f * (W - 28), Y = f => 12 + f * (H - 24);
    c.fillStyle = '#0f5a25'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; c.fillRect(X(i / 10), 12, (W - 28) / 10, H - 24); }
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.strokeRect(X(0), Y(0), X(1) - X(0), Y(1) - Y(0));
    c.beginPath(); c.moveTo(X(0.5), Y(0)); c.lineTo(X(0.5), Y(1)); c.stroke(); c.beginPath(); c.arc(X(0.5), Y(0.5), 40, 0, 7); c.stroke();
    [0, 1].forEach(sd => { const bx = sd ? X(1) - (X(1) - X(0)) * 0.157 : X(0), bw = (X(1) - X(0)) * 0.157; c.strokeRect(bx, Y(0.2), bw, Y(0.8) - Y(0.2)); });
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(X(1) - 6, Y(0.43), 6, Y(0.57) - Y(0.43)); c.fillRect(X(0), Y(0.43), 6, Y(0.57) - Y(0.43));
    const dot = (q, col, lab, sel, small) => { const x = X(q[0]), y = Y(q[1]); c.beginPath(); c.arc(x, y, small ? 10 : 12, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = sel ? 4 : 2; c.strokeStyle = sel ? '#ffd400' : '#fff'; c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(lab, x, y + 4); };
    PB.opp.forEach((q, i) => dot(q, '#c0392b', String(i + 1), false, true));
    // arrows
    const involved = new Set(); PB.steps.forEach(st => { involved.add(st.from); if (st.to != null) involved.add(st.to); });
    PB.steps.forEach((st, i) => {
      const a = PB.mine[st.from], col = PB_ACTS[st.act][1];
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 3; c.setLineDash(st.act === 'long' || st.act === 'cross' ? [9, 6] : st.act === 'through' ? [2, 5] : []);
      let tx, ty; if (st.act === 'shoot') { tx = X(1); ty = Y(0.5); } else { const b = PB.mine[st.to]; tx = X(b[0]); ty = Y(b[1]); }
      const x0 = X(a[0]), y0 = Y(a[1]), ang = Math.atan2(ty - y0, tx - x0), sx = x0 + Math.cos(ang) * 14, sy = y0 + Math.sin(ang) * 14, ex = tx - Math.cos(ang) * (st.act === 'shoot' ? 4 : 15), ey = ty - Math.sin(ang) * (st.act === 'shoot' ? 4 : 15);
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - Math.cos(ang - 0.4) * 11, ey - Math.sin(ang - 0.4) * 11); c.lineTo(ex - Math.cos(ang + 0.4) * 11, ey - Math.sin(ang + 0.4) * 11); c.fill();
      c.fillStyle = '#000'; c.font = 'bold 11px monospace'; c.fillText(String(i + 1), (sx + ex) / 2 + 1, (sy + ey) / 2 - 5); c.fillStyle = '#fff'; c.fillText(String(i + 1), (sx + ex) / 2, (sy + ey) / 2 - 6);
    });
    PB.mine.forEach((q, i) => { dot(q, involved.has(i) ? '#2a7be4' : '#1b4f9a', String(i + 1), PB.sel === i, false); c.fillStyle = '#fff'; c.font = '9px monospace'; c.textAlign = 'center'; c.fillText(pbName(i).replace(/ #\d+$/, ''), X(q[0]), Y(q[1]) + 24); });
    if (PB.steps.length) { const q = PB.mine[PB.steps[0].from]; c.beginPath(); c.arc(X(q[0]) + 13, Y(q[1]) - 13, 5, 0, 7); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); }
  }
  function pbBind() {
    const cv = document.getElementById('pb'); if (!cv) return;
    pbDraw();
    const pos = e => { const r = cv.getBoundingClientRect(), kx = cv.width / r.width, ky = cv.height / r.height; return [(e.clientX - r.left) * kx, (e.clientY - r.top) * ky]; };
    const hit = (x, y) => { let best = null, bd = 18; ['mine', 'opp'].forEach(k => PB[k].forEach((q, i) => { const d = Math.hypot(14 + q[0] * (cv.width - 28) - x, 12 + q[1] * (cv.height - 24) - y); if (d < bd) { bd = d; best = { k, i }; } })); return best; };
    cv.addEventListener('pointerdown', e => {
      const [x, y] = pos(e), h = hit(x, y); if (!h) return;
      if (PB.pend && h.k === 'mine') {
        const from = PB.steps.length ? pbLast().to : PB.sel;
        if (h.i === from) { toast('Pick a different player to receive it.', 'bad'); return; }
        PB.steps.push({ from, to: h.i, act: PB.pend }); PB.pend = null; PB.sel = h.i; PB.res = null; PB.vars = null; rerender(); return;
      }
      if (h.k === 'mine' && !PB.steps.length) PB.sel = h.i;
      PB.drag = h; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; pbDraw();
    });
    cv.addEventListener('pointermove', e => { if (!PB.drag) return; const [x, y] = pos(e); PB[PB.drag.k][PB.drag.i] = [Math.min(1, Math.max(0, (x - 14) / (cv.width - 28))), Math.min(1, Math.max(0, (y - 12) / (cv.height - 24)))]; PB.res = PB.res; pbDraw(); });
    const up = () => { if (PB.drag) { PB.drag = null; cv.style.cursor = 'grab'; if (PB.res) PB.res.stale = true; rerender(); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    [['#pb-lvl', 'level'], ['#pb-n', 'n'], ['#pb-name', 'name']].forEach(([id, k]) => { const e = $(id); if (e) e.addEventListener(k === 'name' ? 'input' : 'change', () => { PB[k] = k === 'n' ? +e.value : e.value; }); });
  }
  const rerender = () => { if (App.view === 'tactics') render(); };
  const playsCfg = () => (D().plays || []).filter(pl => pl.on && pl.res && !((pl.live || {}).n >= 4 && pl.live.ok / pl.live.n < 0.25)).map(pl => { const eff = pbEff(pl), r = pl.res; return { id: pl.id, name: pl.name, on: true, mine: pl.mine, steps: pl.steps, rL: Math.min(1, eff * (r.rL / Math.max(0.01, r.overall))), rT: Math.min(1, eff * (r.rT / Math.max(0.01, r.overall))) }; });
  function playsLive(m) {
    const log = m && m.planLog; if (!log || !log.length) return;
    const pls = D().plays || []; let n = 0, ok = 0;
    log.forEach(e => { const pl = pls.find(x => x.id === e.id); if (!pl) return; pl.live = pl.live || { n: 0, ok: 0 }; pl.live.n++; if (e.ok) pl.live.ok++; n++; if (e.ok) ok++; });
    State.save(); toast('The computer ran ' + n + ' of your drawn play' + (n > 1 ? 's' : '') + ': ' + ok + ' worked. The board keeps score in Tactics → Play board.', ok ? 'good' : '');
  }
  App.pbDraw = pbDraw; App.PB = PB;

  /* ======================= v108: COACH, RECORDINGS AND HIGHLIGHTS ======================= */
  const Rec = RUT.Rec, Coach = RUT.Coach;
  const coachK = () => { const c = D().coach; return c && c.on && c.knobs && !Coach.empty(c.knobs) ? c.knobs : null; };
  const COACH = { text: '', read: null, running: false, prog: '', proof: null, n: 12, opp: 'pro', recs: null, loading: false };
  function loadRecs() {
    if (COACH.loading) return; COACH.loading = true;
    Rec.list().then(l => { COACH.recs = l; COACH.loading = false; if (App.view === 'coach' && !COACH.running) render(); }).catch(() => { COACH.recs = []; COACH.loading = false; });
  }
  /* v111: every 3 recorded matches the game cuts a highlight reel from them (the 2 best moments of each match, 6 at most). The digests hold match ids and clip numbers, the clips themselves stay in the recordings. */
  const DIGEST_N = 3;
  function digestAdd(meta) {
    const d = D(); d.recStream = (d.recStream || []).filter(x => x !== meta.id); d.recStream.push({ id: meta.id, clips: meta.clips.map((c, i) => ({ i, score: c.score })) });
    if (d.recStream.length < DIGEST_N) { State.save(); return null; }
    const take = d.recStream.splice(0, DIGEST_N), picks = [];
    take.forEach(t => t.clips.slice().sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.i - b.i).forEach(c => picks.push({ id: t.id, i: c.i })));
    const dg = { id: 'd' + Date.now().toString(36), ts: Date.now(), ids: take.map(t => t.id), picks, seen: false };
    d.digests = [dg].concat(d.digests || []).slice(0, 6); State.save(); return dg;
  }
  const latestDigest = () => { const l = (D().digests || []).find(x => x.picks.length); return l || null; };
  function digestBanner() {
    const g = latestDigest(); if (!g) return '';
    const left = DIGEST_N - (D().recStream || []).length;
    return `<div class="px mb"><div class="row between" style="flex-wrap:wrap;gap:8px"><div><h2 style="margin:0">${g.seen ? 'Your 3-game highlights' : '★ New: your 3-game highlights'}</h2>
      <p class="dim" style="font-size:8px;line-height:1.9;margin:4px 0 0">${g.picks.length} moments from your last 3 matches, played back from the recordings. ${left === DIGEST_N ? 'The next reel comes after your next 3 matches.' : 'The next reel comes after ' + left + ' more match' + (left > 1 ? 'es' : '') + '.'}</p></div>
      <button class="btn y" data-act="digest-play" data-id="${g.id}">▶ Watch the highlights</button></div></div>`;
  }
  function saveRec(m, o) {
    Rec.finish(m, { tag: o.tag || 'Match', coach: !!(m.cfg.coach && m.cfg.coach[0]) }).then(meta => {
      if (!meta) return; COACH.recs = null;
      const dg = digestAdd(meta);
      if (dg) { toast(dg.picks.length ? 'Your 3-game highlights are ready: ' + dg.picks.length + ' moments from your last 3 matches. Watch them on the Home page or in Club → Coach & Highlights.' : 'Three matches recorded, but no highlight moments in them.', dg.picks.length ? 'good' : ''); return; }
      toast(meta.clips.length ? meta.clips.length + ' highlight' + (meta.clips.length > 1 ? 's' : '') + ' saved. Open Club → Coach & Highlights to watch them.' : 'Match recorded (no highlight moments this time).', 'good');
    }).catch(() => { /* recording is optional */ });
  }
  App.saveRec = saveRec;
  const pctTxt = (id, d) => Rec.MET[id].pct ? (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + ' pts' : (d >= 0 ? '+' : '') + d.toFixed(Rec.MET[id].d == null ? 1 : Rec.MET[id].d + (Math.abs(d) < 1 ? 1 : 0));
  function coachOutHTML() {
    if (COACH.running) return `<p class="gold">Simulating... ${esc(COACH.prog)}</p>`;
    const P = COACH.proof; if (!P) return '';
    const c = P.cmp, o = c.overall;
    const rows = c.checks.map(({ it, p }) => {
      if (!p) return `<tr><td><b>${esc(it.name)}</b><br><span class="dim">“${esc(it.clause)}”</span></td><td colspan="5" class="dim">${it.form ? 'Changes your formation when you click Apply (a formation change moves players in Squad, so it was not simulated).' : it.note ? esc(it.note) : 'No direct meter for this one: judged by the results below.'}</td></tr>`;
      const mine = Rec.mean(p.id, P.samples), cls = p.ok ? 'good' : p.verdict === 'moved the other way' ? 'bad' : 'dim';
      return `<tr><td><b>${esc(it.name)}</b><br><span class="dim">“${esc(it.clause)}”</span></td><td>${esc(Rec.MET[p.id].name)}</td><td>${Rec.fmt(p.id, p.a)}</td><td>${Rec.fmt(p.id, p.b)}</td><td>${pctTxt(p.id, p.d)}</td><td class="${cls}">${p.verdict} (${p.level === 'clear' ? 'clear' : p.level === 'likely' ? 'likely' : 'within the noise'})<br><span class="dim">your recorded matches: ${Rec.fmt(p.id, mine)}${P.samples.length ? ' (' + P.samples.length + ')' : ''}</span></td></tr>`;
    }).join('');
    const dgd = o.gdB - o.gdA, verdict = o.level === 'noise' ? '<span class="gold">No clear difference in results: the numbers moved less than the match-to-match swing.</span>' : dgd > 0 ? `<span class="good">Better results (${o.level === 'clear' ? 'clear' : 'likely'}).</span>` : `<span class="bad">Worse results (${o.level === 'clear' ? 'clear' : 'likely'}). Consider softening the instruction.</span>`;
    return `<h3 class="mt">Proof · ${c.overall.n} matches each vs ${esc(Engine.DIFFICULTY[P.opp].name)}</h3>
      <p class="dim" style="font-size:8px;line-height:1.9">Same club, same opponents, same seeds, once with your plain tactic and once with the coach's changes. The meter shows whether the team really changed the way you asked.</p>
      <div style="overflow-x:auto"><table class="list"><tr><th>You said</th><th>Meter</th><th>Before</th><th>After</th><th>Change</th><th>Result</th></tr>${rows}</table></div>
      <div style="overflow-x:auto"><table class="list mt"><tr><th></th><th>Points / match</th><th>Goals for</th><th>Goals against</th><th>Goal difference</th></tr>
        <tr><td><b>Before (no coach)</b></td><td>${o.ptsA.toFixed(2)}</td><td>${o.gfA.toFixed(2)}</td><td>${o.gaA.toFixed(2)}</td><td>${o.gdA.toFixed(2)}</td></tr>
        <tr><td><b>After (coach)</b></td><td>${o.ptsB.toFixed(2)}</td><td>${o.gfB.toFixed(2)}</td><td>${o.gaB.toFixed(2)}</td><td>${o.gdB.toFixed(2)}</td></tr></table></div>
      <p style="font-size:9px;margin-top:6px">${verdict}</p>
      <p class="dim" style="font-size:7px;line-height:1.9">“Clear” means the change is more than twice the random swing between matches, “likely” more than 1.2 times. The test matches are played by the computer on both sides, so they show how your team plays the instruction when the computer controls it; your own control is not simulated.</p>`;
  }
  const coachDraw = () => { const e = $('#co-out'); if (e && App.view === 'coach') e.innerHTML = coachOutHTML(); };
  function coachTest() {
    if (COACH.running || !COACH.read) return;
    const st = D(); if (!st.squad.slots.every(Boolean)) { toast('Fill your whole XI first.', 'bad'); return; }
    const items = COACH.read.items.filter(i => !i.form), K = Coach.merge(items);
    if (Coach.empty(K)) { toast('Nothing to simulate in that instruction.', 'bad'); return; }
    const home = { name: st.clubName, short: 'RFC', cards: State.matchCards() }, spec = myTac(), n = COACH.n, half = 90, opps = [], sty = [];
    for (let k = 0; k < n; k++) { opps.push(Engine.buildOpponent(COACH.opp)); sty.push(pickStyle('auto')); }
    const base = [], co = []; let i = 0;
    COACH.running = true; COACH.proof = null; COACH.prog = '0/' + n * 2; coachDraw();
    const step = () => {
      if (!COACH.running) return;
      if (i >= n * 2) { COACH.running = false; COACH.proof = { cmp: Coach.compare(COACH.read.items, base, co, half), opp: COACH.opp, samples: Rec.samples(COACH.recs || []) }; coachDraw(); return; }
      const k = i % n, isCo = i >= n;
      try { (isCo ? co : base).push(Engine.simulate(home, opps[k], { halfSeconds: half, styles: [spec, sty[k]], seed: 7000 + k, tacGain: [CLUB_GAIN, 0], coach: isCo ? [K, null] : undefined })); }
      catch (e) { COACH.running = false; toast('Test failed: ' + e.message, 'bad'); coachDraw(); return; }
      i++; COACH.prog = i + '/' + n * 2; coachDraw(); setTimeout(step, 20);
    };
    setTimeout(step, 30);
  }
  function bindCoach() {
    const t = $('#co-text'); if (t) t.addEventListener('input', () => { COACH.text = t.value; });
    [['#co-opp', 'opp'], ['#co-n', 'n']].forEach(([id, k]) => { const e = $(id); if (e) e.addEventListener('change', () => { COACH[k] = k === 'n' ? +e.value : e.value; }); });
    if (COACH.running || COACH.proof) coachDraw();
  }
  const COACH_EG = ['press higher and play wider', 'fullbacks overlap, wingers cut inside, fewer long shots', 'sit deep and counter attack, keeper plays out from the back', 'keep possession with short passes, striker drops deep', 'tackle less aggressively and stay compact', 'play 4-4-2 and push the defensive line up'];
  VIEWS.coach = function () {
    if (COACH.recs == null) loadRecs();
    const recs = COACH.recs || [], samples = Rec.samples(recs), cur = D().coach, R = COACH.read;
    const tend = Rec.tendencies(samples);
    const autoPanel = `<div class="px"><h2>Auto coach in matches</h2><p class="dim" style="font-size:8px;line-height:1.9">When it is on, the coach watches the score, the shots and the clock in your own Kick Off, League and Top 5 matches and changes your tactic by itself (for example more attack when you are losing late, deeper when you lead). You can still change it yourself with the Tactics button or keys 1-9. Every change is shown on the match and saved in the recording.</p><div class="row mt"><button class="btn ${D().autoCoach ? 'g' : ''}" data-act="coach-auto">${D().autoCoach ? 'Auto coach: ON' : 'Auto coach: OFF'}</button></div>${(() => { const ch = recs.filter(r => r.auto && r.auto.length).slice(0, 3); return ch.length ? '<div class="mt"><h3>Recent changes by the coach</h3>' + ch.map(r => '<div class="dim" style="font-size:8px;line-height:1.9;margin-top:4px">' + esc(r.home + ' ' + (r.score ? r.score[0] + '-' + r.score[1] : '') + ' ' + r.away) + ': ' + r.auto.map(a => esc((a.min != null ? a.min + "' " : '') + a.label)).join(' · ') + '</div>').join('') + '</div>' : ''; })()}</div>`;
    const active = cur && cur.on ? `<div class="px"><h2>The coach is on</h2><p class="gold" style="font-size:9px;line-height:1.9">“${esc(cur.text)}”</p><p class="dim" style="font-size:8px;line-height:1.9">${Coach.describe(cur.knobs).map(esc).join(' · ') || 'Formation only'}</p>
        <p class="dim" style="font-size:7px;line-height:1.9">Used in Kick Off, League, Top 5, Quick Sim and the Tactic Lab. Not in online or casual matches.</p>
        <div class="row mt"><button class="btn r" data-act="coach-off">Turn the coach off</button></div></div>` : '';
    const readHTML = !R ? '' : `<div class="mt"><h3>What I understood</h3>${R.items.length ? R.items.map(it => `<div class="mt" style="padding:6px;border:1px solid #334"><b class="gold">${esc(it.name)}</b> <span class="dim" style="font-size:8px">“${esc(it.clause)}”</span>
        <p style="font-size:8px;line-height:1.8;margin:4px 0 0">${it.form ? 'Switches your formation to ' + esc(it.form.split('').join('-')) + '.' : it.note ? esc(it.note) : Coach.describe(it.eff).map(esc).join(' · ')}</p></div>`).join('') : '<p class="bad" style="font-size:9px">I did not recognise any instruction.</p>'}
        ${R.unknown.length ? `<p class="dim" style="font-size:8px;line-height:1.9">I did not understand: ${R.unknown.map(u => '“' + esc(u) + '”').join(', ')}. Try words like press, line, wide, cross, short passes, long balls, counter, shoot, tackle, man-mark, or a position with a job (“striker drops deep”).</p>` : ''}</div>
      ${R.items.length ? `<div class="row mt" style="flex-wrap:wrap;gap:8px"><span><label>Test against</label><select id="co-opp">${Object.entries(Engine.DIFFICULTY).map(([k, d]) => `<option value="${k}" ${COACH.opp === k ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></span>
        <span><label>Matches</label><select id="co-n">${[8, 12, 20, 30].map(n => `<option ${COACH.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>
        <div class="row mt"><button class="btn c" data-act="coach-test" ${COACH.running ? 'disabled' : ''}>Prove it with a simulation</button><button class="btn g" data-act="coach-apply">Apply to my team</button></div>` : ''}`;
    const coachPanel = `<div class="px"><h2>AI Coach</h2><p class="dim" style="font-size:8px;line-height:1.9">Tell your team how to play, in your own words. The coach reads it, changes the tactic and the positions' roles, and can prove with simulated matches (and your own recorded matches) that the team really plays that way. It is a rule-based reader built into the game, not a chat bot: it shows you exactly what it understood and what it did not.</p>
      <textarea id="co-text" rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:8px;background:#0b1020;color:#fff;border:2px solid #334" placeholder="e.g. press higher, fullbacks overlap, fewer long shots, keeper plays out from the back">${esc(COACH.text)}</textarea>
      <div class="row mt" style="flex-wrap:wrap;gap:6px">${COACH_EG.map(t => `<button class="btn sm" data-act="coach-ask" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="row mt"><button class="btn y" data-act="coach-read">Read it</button></div>
      ${readHTML}<div id="co-out" class="mt">${coachOutHTML()}</div></div>`;
    const sugPanel = `<div class="px"><h2>The coach's notes on how you play</h2>${tend.length ? tend.map(t => `<div class="mt" style="padding:6px;border:1px solid #334"><b>${esc(t.text)}</b><p class="dim" style="font-size:8px;line-height:1.8;margin:3px 0">${esc(t.ev)}</p>${t.ask ? `<button class="btn sm" data-act="coach-ask" data-t="${esc(t.ask)}">Coach this: “${esc(t.ask)}”</button>` : ''}</div>`).join('') : `<p class="dim" style="font-size:8px;line-height:1.9">${recs.length ? 'Nothing stands out yet. Play a few more matches.' : 'Play a match with your own team (Kick Off, League or Top 5) and the game records it. The notes and numbers appear here, based on what you really did.'}</p>`}</div>`;
    const metIds = ['pass', 'short', 'long', 'fwd', 'wing', 'cross', 'thru', 'shot', 'far', 'box', 'conv', 'skill', 'tk', 'tkw', 'foul', 'wonHigh', 'lostOwn', 'line', 'width', 'poss', 'gf', 'ga', 'sh', 'shA'];
    const styleTbl = samples.length ? `<div class="px"><h2>How you play · last ${samples.length} recorded match${samples.length > 1 ? 'es' : ''}</h2><table class="list">${metIds.map(id => { const v = Rec.mean(id, samples); if (v == null) return ''; const bar = Rec.MET[id].pct ? `<span style="display:inline-block;height:6px;width:${Math.round(v * 100)}px;background:#ffd400"></span>` : ''; return `<tr><td>${esc(Rec.MET[id].name)}</td><td><b>${Rec.fmt(id, v)}</b> ${bar}</td></tr>`; }).join('')}</table>
      <p class="dim" style="font-size:7px;line-height:1.9">Counts are scaled to 90 s halves so matches of any length compare.</p></div>` : '';
    const when = t => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const recHTML = recs.length ? recs.map(r => `<div class="px mt"><div class="row between" style="flex-wrap:wrap;gap:6px"><b>${esc(r.tag)} · ${esc(r.home)} ${r.score[0]}-${r.score[1]} ${esc(r.away)}</b><span class="dim" style="font-size:8px">${when(r.ts)}${r.coach ? ' · coach on' : ''}${r.ended ? '' : ' · quit early'}</span></div>
        ${r.clips.length ? `<div class="row mt" style="flex-wrap:wrap;gap:6px">${r.clips.map((c, i) => `<button class="btn sm" data-act="rec-clip" data-id="${r.id}" data-i="${i}">▶ ${esc(c.label)}</button>`).join('')}</div>` : '<p class="dim" style="font-size:8px">No highlight moments in this one.</p>'}
        <div class="row mt">${r.clips.length ? `<button class="btn y" data-act="rec-reel" data-id="${r.id}">▶ Play the highlight reel</button>` : ''}<button class="btn sm r" data-act="rec-del" data-id="${r.id}">Delete</button></div>
        ${r.saved === false ? '<p class="dim" style="font-size:7px">Browser storage is blocked: this recording lasts until you close the page.</p>' : ''}</div>`).join('')
      : `<div class="px mt"><p class="dim" style="font-size:8px;line-height:1.9">No recordings yet. Every Kick Off, League, Playoff and Top 5 match you play with your own team is recorded automatically (a few KB: the match set-up and your button presses), and the best moments are picked: goals, saves, skill moves that led to a shot, woodwork, shots on target and big tackles. Online, casual and Testing Ground matches are not recorded.</p></div>`;
    return `<h1>Coach &amp; Highlights</h1>
      <div class="grid cols-2"><div>${active}${autoPanel}${coachPanel}</div><div>${sugPanel}${styleTbl}</div></div>
      ${playersPanel(recs)}<div class="mt">${digestBanner()}<h2>Highlights</h2><p class="dim" style="font-size:8px;line-height:1.9">Every ${DIGEST_N} matches the game also cuts a 3-game highlight reel. Highlights are not videos: the game plays the match again from its recording, exactly as it happened, and cuts to the best moments (slow motion around the key moment). The newest 12 matches are kept in this browser.</p>${COACH.recs == null ? '<p class="dim">Loading...</p>' : recHTML}</div>`;
  };
  /* v113: highlights and improvement requests for each player. The match recorder counts what every player did (passes, shots, tackles, fouls...); the clips carry the player's name. */
  const clipPlayer = c => c.p || ((/ · (.+?)(?: denies | wins |\s\(|,|$)/.exec(c.label || '') || [])[1] || null);
  function playerAgg(recs) {
    const M = {};
    recs.forEach(r => {
      (r.pl || []).forEach(x => { const a = M[x.n] || (M[x.n] = { n: x.n, games: 0, c: {}, clips: [], pos: x.pos, ovr: x.ovr, id: x.id, ts: 0 }); a.games++; Object.keys(x.c).forEach(k => { a.c[k] = (a.c[k] || 0) + x.c[k]; }); if (r.ts >= a.ts) { a.ts = r.ts; a.pos = x.pos; a.ovr = x.ovr; a.id = x.id; } });
      (r.clips || []).forEach((c, i) => { const nm = clipPlayer(c); if (!nm) return; const a = M[nm] || (M[nm] = { n: nm, games: 0, c: {}, clips: [], pos: null, ovr: null, id: null, ts: 0 }); a.clips.push({ id: r.id, i, label: c.label }); });
    });
    return Object.values(M).sort((x, y) => (y.c.goal || 0) - (x.c.goal || 0) || y.clips.length - x.clips.length || (y.c.shot || 0) - (x.c.shot || 0) || x.n.localeCompare(y.n));
  }
  const KEYSTATS = { GK: ['gkDiving', 'gkHandling', 'gkReflexes', 'gkPositioning', 'gkKicking'], CB: ['standingTackle', 'interceptions', 'defAwareness', 'strength', 'headingAccuracy', 'slidingTackle'], FB: ['standingTackle', 'interceptions', 'crossing', 'sprintSpeed', 'stamina', 'defAwareness'], DM: ['standingTackle', 'interceptions', 'defAwareness', 'shortPassing', 'strength'], CM: ['shortPassing', 'vision', 'ballControl', 'longPassing', 'stamina'], AM: ['vision', 'shortPassing', 'dribbling', 'ballControl', 'longShots'], W: ['dribbling', 'crossing', 'acceleration', 'sprintSpeed', 'finishing'], ST: ['finishing', 'positioning', 'shotPower', 'ballControl', 'headingAccuracy'] };
  const STAT_NAME = k => k.replace(/^gk/, 'GK ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, ch => ch.toUpperCase());
  function squadItemByName(name) { const st = D(); for (let i = 0; i < st.squad.slots.length; i++) { const id = st.squad.slots[i]; if (!id) continue; const c = State.card(id); if (c && c.name === name) return { id, slot: i, card: c }; } return null; }
  /** Plain-English change requests for one player, from what he did in the recorded matches and his card. Each can carry a role to set or a sentence for the coach. */
  function playerAdvice(a) {
    const out = [], it = squadItemByName(a.n), c = it && it.card, sub = (c && c.sub) || {}, g = RUT.roleGroup(a.pos || (c && c.position) || 'CM'), n = Math.max(1, a.games), x = k => a.c[k] || 0;
    const role = key => { const r = RUT.ROLE_BY[key]; return r && it && RUT.roleFits(r, RUT.roleGroup(State.FORMATION[it.slot])) ? key : null; };
    const add = (title, why, o) => out.push(Object.assign({ title, why }, o || {}));
    if (x('shot') >= 4 && x('far') / x('shot') >= 0.5) add('Takes too many long shots', x('far') + ' of his ' + x('shot') + ' shots were from far out' + (sub.longShots != null ? ' (Long Shots ' + sub.longShots + ', Finishing ' + sub.finishing + ')' : '') + '. Closer shots score far more often.', { ask: 'fewer long shots', role: g === 'ST' ? role('st-poach') : g === 'AM' ? role('am-sh') : g === 'W' ? role('w-inv') : null });
    if (g === 'ST' && a.games >= 2 && x('shot') / n < 1.5) add('Rarely gets a shot away', 'Only ' + x('shot') + ' shot' + (x('shot') === 1 ? '' : 's') + ' in ' + a.games + ' matches. A runner behind the line or a poacher sees more of the ball in the box.', { ask: 'keep possession with short passes, striker drops deep', role: role('st-chn') || role('st-poach') });
    if (x('foul') >= 3 && x('foul') > x('tkw')) add('Gives away too many fouls', x('foul') + ' fouls against ' + x('tkw') + ' tackles won. Tell the team to tackle less and hold its shape.', { ask: 'tackle less aggressively and stay compact', role: g === 'CB' ? role('cb-lib') : g === 'DM' ? role('dm-hold') : null });
    if ((g === 'CB' || g === 'DM' || g === 'FB') && a.games >= 2 && x('tkw') / n < 0.5) add('Wins very few tackles', x('tkw') + ' clean tackle' + (x('tkw') === 1 ? '' : 's') + ' in ' + a.games + ' matches. A ball-winning role makes him step in and challenge.', { role: g === 'CB' ? role('cb-stop') : g === 'DM' ? role('dm-des') : role('fb-def'), ask: 'press higher and tackle more' });
    if ((g === 'W' || g === 'FB') && a.games >= 2 && x('cross') === 0) add('Never crosses', 'No crosses in ' + a.games + ' matches. A touchline role keeps him wide so he can deliver.', { role: g === 'W' ? role('w-trad') : role('fb-att'), ask: 'fullbacks overlap, wingers cut inside, fewer long shots' });
    if (x('skill') >= 4 && x('goal') + x('sot') === 0) add('Many skill moves, no end product', x('skill') + ' skill moves and no shot on target. Have the team pass more and keep the ball moving.', { ask: 'keep possession with short passes, striker drops deep' });
    if (g === 'GK' && x('save') >= 1) add('Saves', x('save') + ' save' + (x('save') === 1 ? '' : 's') + ' in ' + a.games + ' match' + (a.games === 1 ? '' : 'es') + '. A sweeper-keeper starts attacks, a shot-stopper stays on his line.', { role: role('gk-sweep') });
    const keys = KEYSTATS[g] || [], vals = keys.map(k => [k, sub[k]]).filter(v => v[1] != null).sort((p, q) => p[1] - q[1]);
    if (vals.length) add('Weakest key stat: ' + STAT_NAME(vals[0][0]) + ' ' + vals[0][1], 'His key stats for this position: ' + vals.map(v => STAT_NAME(v[0]) + ' ' + v[1]).join(', ') + '. An evolution or a chemistry style lifts it.', { nav: 'evo' });
    return { it, c, out };
  }
  const statLine = a => { const x = k => a.c[k] || 0, bits = []; if (x('goal')) bits.push(x('goal') + ' goal' + (x('goal') > 1 ? 's' : '')); if (x('shot')) bits.push(x('shot') + ' shots (' + x('sot') + ' on target, ' + x('far') + ' from far)'); if (x('pass')) bits.push(x('pass') + ' passes (' + x('thru') + ' through, ' + x('cross') + ' crosses)'); if (x('skill')) bits.push(x('skill') + ' skill moves'); if (x('tkw')) bits.push(x('tkw') + ' tackles won'); if (x('foul')) bits.push(x('foul') + ' fouls'); if (x('save')) bits.push(x('save') + ' saves'); if (x('post')) bits.push(x('post') + ' off the woodwork'); return bits.join(' · ') || 'Nothing counted yet'; };
  function playersPanel(recs) {
    const agg = playerAgg(recs).filter(a => a.games || a.clips.length);
    if (!agg.length) return '';
    return `<div class="px mt"><h2>Your players · highlights and change requests</h2><p class="dim" style="font-size:8px;line-height:1.9">What each player really did in your recorded matches. “Highlights” plays only his moments from the recordings. “Improve” gives change requests from his numbers: a role to try, a sentence for the coach, or the stat to work on. Matches recorded before this update have highlights but no counters.</p>
      <div style="overflow-x:auto"><table class="list"><tr><th>Player</th><th>Pos</th><th>Apps</th><th>G</th><th>Shots</th><th>On target</th><th>Passes</th><th>Skills</th><th>Tackles won</th><th>Fouls</th><th>Saves</th><th></th></tr>
      ${agg.slice(0, 16).map(a => `<tr><td><b>${esc(a.n)}</b>${a.ovr ? ' <span class="dim">' + a.ovr + '</span>' : ''}</td><td>${esc(a.pos || '')}</td><td>${a.games || '-'}</td><td>${a.c.goal || 0}</td><td>${a.c.shot || 0}${a.c.far ? ' <span class="dim">(' + a.c.far + ' far)</span>' : ''}</td><td>${a.c.sot || 0}</td><td>${a.c.pass || 0}</td><td>${a.c.skill || 0}</td><td>${a.c.tkw || 0}</td><td>${a.c.foul || 0}</td><td>${a.c.save || 0}</td>
        <td style="white-space:nowrap">${a.clips.length ? `<button class="btn sm y" data-act="pl-clips" data-n="${esc(a.n)}">▶ ${a.clips.length}</button> ` : ''}<button class="btn sm c" data-act="pl-improve" data-n="${esc(a.n)}">Improve</button></td></tr>`).join('')}</table></div></div>`;
  }
  function playerModal(name) {
    const a = playerAgg(COACH.recs || []).find(z => z.n === name); if (!a) return;
    const { it, c, out } = playerAdvice(a), nb = (a.games ? a.games + ' recorded match' + (a.games > 1 ? 'es' : '') : 'no counted matches yet');
    modal(`<h2>${esc(a.n)} <span class="dim">${esc(a.pos || (c && c.position) || '')}${a.ovr ? ' · ' + a.ovr : ''}</span></h2><p class="dim" style="font-size:8px;line-height:1.9">${esc(statLine(a))} · ${nb}</p>
      ${a.clips.length ? `<div class="row mt"><button class="btn y" data-act="pl-clips" data-n="${esc(a.n)}">▶ Watch his ${a.clips.length} highlight${a.clips.length > 1 ? 's' : ''}</button></div>` : '<p class="dim" style="font-size:8px">No highlight moments for him yet.</p>'}
      <h3 class="mt">Change requests</h3>${out.length ? out.map((o, i) => `<div class="mt" style="padding:6px;border:1px solid #334"><b class="gold">${esc(o.title)}</b><p class="dim" style="font-size:8px;line-height:1.8;margin:3px 0">${esc(o.why)}</p><div class="row" style="flex-wrap:wrap;gap:6px">
        ${o.role && it ? `<button class="btn sm g" data-act="pl-role" data-item="${it.id}" data-role="${o.role}" data-n="${esc(a.n)}">Set role: ${esc(RUT.ROLE_BY[o.role].name)}</button>` : ''}${o.ask ? `<button class="btn sm" data-act="pl-ask" data-t="${esc(o.ask)}">Ask the coach: “${esc(o.ask)}”</button>` : ''}${o.nav ? `<button class="btn sm" data-act="nav-close" data-v="${o.nav}">Open Evolutions</button>` : ''}</div></div>`).join('') : '<p class="dim" style="font-size:8px">Nothing to change: play a few more matches for firmer numbers.</p>'}
      ${it ? '' : '<p class="dim" style="font-size:7px;line-height:1.9">He is not in your current XI, so a role cannot be set here.</p>'}
      <div class="row mt"><button class="btn" data-act="close">Close</button></div>`);
  }
  function playerClips(name) {
    const list = []; (COACH.recs || []).forEach(r => { const idx = []; (r.clips || []).forEach((c, i) => { if (clipPlayer(c) === name) idx.push(i); }); if (idx.length) list.push({ id: r.id, idx }); });
    if (!list.length) { toast('No highlights for him yet.', 'bad'); return; }
    closeModal(); playList(list.slice(0, 6));
  }
  /** Highlight reel: build the same match, feed it the recorded inputs, simulate to each clip (not drawn) and play the clip. */
  async function playReel(id, only) {
    const meta = (COACH.recs || []).find(r => r.id === id); if (!meta) return;
    const idx = meta.clips.map((c, i) => i); playList([{ id, idx: only != null ? [only] : idx }]);
  }
  /** Play a list of [{id, idx:[clip numbers]}] one match after another (one match for a normal reel, three for the 3-game highlights). */
  async function playList(list) {
    if (App.match) return;
    if (COACH.recs == null) { try { COACH.recs = await Rec.list(); } catch (e) { COACH.recs = []; } }
    const items = [];
    for (const it of list) {
      const meta = (COACH.recs || []).find(r => r.id === it.id); if (!meta) continue;
      const clips = it.idx.map(i => meta.clips[i]).filter(Boolean); if (!clips.length) continue;
      items.push({ meta, clips });
    }
    if (!items.length) { toast('Those recordings are gone.', 'bad'); return; }
    const wrap = document.createElement('div'); wrap.className = 'match-wrap reel';
    wrap.innerHTML = `<div class="match-bar"><span></span><span></span><span><button class="btn sm" data-ract="cam">Camera: ${camLabel(App.camMode)}</button><button class="btn sm" data-ract="skip">Skip clip</button><button class="btn sm r" data-ract="close">Close</button></span></div><canvas class="game"></canvas><div class="reel-ov" id="reel-ov"></div>`;
    document.body.appendChild(wrap);
    const ov = wrap.querySelector('#reel-ov'), say = (h, cls) => { ov.className = 'reel-ov' + (cls ? ' ' + cls : ''); ov.innerHTML = h; };
    let m = null, k = 0, closed = false, gone = 0;
    const close = () => { closed = true; if (m) m.stop(); wrap.remove(); App.match = null; };
    const total = items.reduce((a, x) => a + x.clips.length, 0), before = n => items.slice(0, n).reduce((a, x) => a + x.clips.length, 0);
    async function runOne() {
      if (closed) return;
      const { meta, clips } = items[k], data = await Rec.get(meta.id);
      if (closed) return;
      if (!data) { gone++; if (++k < items.length) return runOne(); say(`<b>End of the highlights</b><div class="row" style="justify-content:center;margin-top:8px"><button class="btn r" data-ract="close">Close</button></div>`, 'end'); return; }
      const cfg = JSON.parse(data.snap); cfg.camera = App.camMode || 'tv';
      const old = wrap.querySelector('canvas'), cv = old.cloneNode(false); old.replaceWith(cv);
      m = new Engine.Match(cfg); m.recPlay(data.inputs, data.ax, data.tcl); App.match = m;
      const head = items.length > 1 ? esc(meta.tag) + ' · ' + esc(meta.home) + ' ' + meta.score[0] + '-' + meta.score[1] + ' ' + esc(meta.away) + '<br>' : '';
      m.reelStart(clips.map(c => ({ a: c.a, b: c.b, k: c.k })), {
        cue: i => say(head + 'Cueing highlight ' + (before(k) + i + 1) + ' of ' + total + '...', 'cue'),
        start: i => say(head + '<b>' + (before(k) + i + 1) + '/' + total + '</b> ' + esc(clips[i].label), 'lab'),
        done: () => {
          if (k + 1 < items.length) { m.stop(); k++; runOne(); return; }
          say(`<b>End of the highlights</b><div class="row" style="justify-content:center;margin-top:8px"><button class="btn y" data-ract="again">Watch again</button><button class="btn r" data-ract="close">Close</button></div>`, 'end');
        },
      });
      m.start(cv);
    }
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-ract]'); if (!b) return; const a = b.dataset.ract;
      if (a === 'close') close();
      if (a === 'skip' && m) m.reelSkip();
      if (a === 'cam' && m) { App.camMode = m.nextCamera(); b.textContent = 'Camera: ' + camLabel(m.camMode); }
      if (a === 'again') { close(); playList(list); }
    });
    runOne();
  }
  function playDigest(id) {
    const g = (D().digests || []).find(x => x.id === id); if (!g) return;
    g.seen = true; State.save();
    const by = {}; g.picks.forEach(p => { (by[p.id] = by[p.id] || []).push(p.i); });
    playList(g.ids.filter(x => by[x]).map(x => ({ id: x, idx: by[x] })));
  }

  /* ------------------------------- PLAY --------------------------------- */
  VIEWS.play = function () {
    const ready = D().squad.slots.every(Boolean);
    const diffs = Object.entries(Engine.DIFFICULTY);
    return `<div class="grid cols-2"><div class="px"><h2>Kick Off</h2>
      <label>Opponent</label>
      <div class="row">${diffs.map(([k, d]) => `<button class="btn ${App.difficulty === k ? 'y' : ''}" data-act="diff" data-d="${k}">${esc(d.name)}<br><span style="font-size:7px">${d.lo}-${Math.min(d.hi, 91)} OVR</span></button>`).join('')}</div>
      <label>Half length (real seconds)</label>
      <select id="half-len">${[45, 90, 150, 240].map(s => `<option value="${s}" ${App.halfSeconds === s ? 'selected' : ''}>${s}s per half</option>`).join('')}</select>
      <label>Your tactic</label>
      <p class="dim" style="font-size:8px;line-height:1.9"><b>${esc(styleName(myTac()))}</b> · ${esc(styleBlurb(myTac()))} <a href="#" data-act="nav" data-v="tactics">Change it in Club → Tactics</a></p>
      <label>Opponent's tactic</label>
      <select id="sty-opp">${styleOptions(App.oppStyle, true)}</select>
      <p class="dim" style="font-size:8px;line-height:1.9">${App.oppStyle !== 'auto' ? esc(styleBlurb(App.oppStyle)) : esc(styleBlurb('auto'))}</p>
      <label><input type="checkbox" id="ko" ${App.knockout ? 'checked' : ''}> Knockout tie (draw → penalty shootout, ABAB + sudden death)</label>
      <div class="row mt">
        <button class="btn y" data-act="match" data-mode="play" ${ready ? '' : 'disabled'}>▶ Play (you control)</button>
        <button class="btn c" data-act="match" data-mode="watch" ${ready ? '' : 'disabled'}>Watch AI vs AI</button>
        <button class="btn" data-act="match" data-mode="sim" ${ready ? '' : 'disabled'}>Quick Sim</button>
      </div>
      <div class="mt cas-promo"><h3>Online Match · 2 players, 2 computers</h3><p class="dim" style="font-size:8px">Host a game and share the game code, or enter your friend's code, and play each other with your own club XI on the huge pitch.</p>
        <button class="btn y" data-act="nav" data-v="online">Play online</button></div>
            <div class="mt cas-promo"><h3>Casual Match · 2 players</h3><p class="dim" style="font-size:8px">Build two teams from any players in the game and play a friend on one keyboard or two gamepads. No coins, no DNF.</p>
        <button class="btn g" data-act="nav" data-v="casual">Set up a casual match</button></div>
      <div class="mt cas-promo"><h3>Testing Ground · 1 player</h3><p class="dim" style="font-size:8px">A huge empty pitch for you alone, or a full CPU team to play against (Opponent AI). Pick any player, then add cones, pressing defenders, attackers, a keeper or team-mates, and feed crosses to test everything. Live speed and strike read-out. No clock, fouls or rewards.</p>
        <button class="btn c" data-act="train">Open the testing ground</button></div>
      ${ready ? '' : '<p class="bad">Your XI needs 11 players. Go to Squad → Auto-build.</p>'}
      <p class="dim" style="font-size:8px">Rewards: coins scale with opponent difficulty, result and goals. Evolving players progress only if they start.</p>
      </div>
      <div class="px"><h2>Controls</h2>
        <p style="font-size:8px;line-height:2.2">
        <span class="kbd">←↑↓→</span>/<span class="kbd">WASD</span> move · <span class="kbd">SHIFT</span> sprint<br>
        <span class="kbd">Z</span> pass · defending: standing tackle<br>
        <span class="kbd">X</span> shoot (↑/↓ aim) · defending: slide<br>
        <span class="kbd">C</span> through ball · defending: switch player<br>
        <span class="kbd">V</span> lob / long ball / cross · defending: hold for a team-mate to press<br>
        Skill moves on the ball (hold a direction): <span class="kbd">Q</span> or <span class="kbd">SPACE</span> the player's own signature dribble (3 s cooldown, better with higher Dribbling) · <span class="kbd">E</span> stepover · <span class="kbd">R</span> body feint. Pass goes to the team-mate you face; more power reaches further. Shots plant your feet and rise with power.<br>
        Hold any of them on the ball to fill the power bar: green = sweet spot for shots, white tick = ideal pass weight.<br>
        Hold SHOOT (X or left click) and aim the arrow with A / D or the mouse: you stop and walk up to the shot, the longer you hold the harder it goes<br>
        Hold SHOOT, then press SHOOT again at contact for a green hit · tap LOB = chip, THRU = finesse, both = low driven<br>
        <span class="kbd">M</span> camera TV / wide / close · <span class="kbd">P</span> pause</p>
        <h3>PlayStyles+ on the pitch</h3>
        <p class="dim" style="font-size:8px;line-height:2">Rapid+ leaves a yellow trail · Finesse Shot+ curls with a cyan trail · Power Shot+ red streak · Pinged Pass+ laser line · Intercept+ blue ring · Bruiser+ CRUNCH! · Quick Step+ dust burst</p>
      </div></div>`;
  };
  /* Tactics: 3 bars (Attack / Midfield / Defence, 6 points) + 1 tactical trait, saved with the club (D().tactics). Other teams use a trait on its own. */
  const TT = () => Engine.TACTIC_TRAITS;
  const CLUB_GAIN = 3, EARN = 1.3;
  const clubTac = () => { const d = D(), t = d.tactics || {}; const v = Engine.tacFix(t.a == null ? 2 : t.a, t.m == null ? 2 : t.m, t.d == null ? 2 : t.d); d.tactics = { a: v[0], m: v[1], d: v[2], trait: TT()[t.trait] ? t.trait : '' }; return d.tactics; };
  /* v210 (JODIO): FC 27 TACTICS (Club > Tactics). A tactical preset, the formation, a build-up style, a defensive approach with a line height, and a role
     + focus for every position on a pitch view, with a Team Tactical Analysis radar. Saved as D().fctac; D().tacMode picks FC 27 ('fc') or the classic points.
     fctac = { preset (shown; 'x' = Custom), base (the preset whose touches and default roles it keeps), bu, da, ln 0..99, man (line set by hand), roles {slot: 'fc-..:f'} } */
  const FCP = () => Engine.FC_PRESETS;
  const tacMode = () => 'fc';   // v214 (JODIO): FC 27 tactics are the only tactics
  const fcFromPreset = k => { const P = FCP()[k]; return { preset: k, base: k === 'x' ? 's' : k, bu: P.bu, da: P.da, ln: P.ln, man: false, roles: {} }; };
  const fcTac = () => { const d = D(); if (!d.fctac || !FCP()[d.fctac.preset]) d.fctac = fcFromPreset('s'); const t = d.fctac; t.roles = t.roles || {}; if (!FCP()[t.base]) t.base = t.preset === 'x' ? 's' : t.preset; return t; };
  const fcSpec = () => { const t = fcTac(); return Engine.tacSpec({ fc: { bu: t.bu, da: t.da, ln: t.ln, pr: t.base }, form: State.formationKey() || '' }); };
  const famTag = f => f === 2 ? '<em class="fam f2">++</em>' : f === 1 ? '<em class="fam f1">+</em>' : '';
  /* v215 (JODIO: tiles overlapped): every depth line of the formation gets its own evenly spaced row, and players in a row keep a minimum gap */
  function fcSpots(pts) {
    const ix = pts.map((p, i) => i).sort((a, b) => pts[a][0] - pts[b][0]), rows = [];
    ix.forEach(i => { const r = rows[rows.length - 1]; if (r && Math.abs(pts[i][0] - pts[r[0]][0]) < 5) r.push(i); else rows.push([i]); });
    const out = [], n = rows.length;
    rows.forEach((r, k) => {
      const y = n > 1 ? 91 - k * 82 / (n - 1) : 50;
      r.sort((a, b) => pts[a][1] - pts[b][1]);
      let xs = r.map(i => Math.max(10, Math.min(90, 4 + pts[i][1] / 68 * 92)));
      const gap = 21; if (xs.some((x, j) => j && x - xs[j - 1] < gap)) { const w = Math.min(82, (r.length - 1) * 26), mid = xs.reduce((a, b) => a + b, 0) / xs.length, c = Math.max(10 + w / 2, Math.min(90 - w / 2, mid)); xs = r.map((_, j) => r.length > 1 ? c - w / 2 + j * w / (r.length - 1) : c); }
      r.forEach((i, j) => { out[i] = [y, xs[j]]; });
    });
    return out;
  }
  /* v216 (JODIO, FC 27 role zones): the pitch is cut into a 6 x 8 grid of squares and each square is shaded by how often the player, in his
     role and focus, goes there: dark = a lot, light = rarely, empty = never. It reads the same tags the match AI uses (RUT.effectiveTags),
     so the picture matches how he really moves. In possession and out of possession are separate maps. */
  const ZC = 6, ZR = 8;
  function fcZones(i, key) {
    const pts = (Engine.FORMATIONS[State.formationKey() || '433'] || Engine.FORMATIONS['433']).pts, p = pts[i], c = State.squadCards()[i], pos = State.FORMATION[i];
    if (!p) return null;
    const tg = c ? RUT.effectiveTags(c, pos, key || State.slotRole(i)) : new Set(), h = t => tg.has(t), foc = String(key || State.slotRole(i) || '').split(':')[1] || 'b';
    const X = p[1] / 68 * 100, Y = Math.min(100, p[0] / 64 * 100), side = X < 40 ? -1 : X > 60 ? 1 : 0, gk = pos === 'GK';
    const map = att => {
      let cy = Y + (att ? 10 : -12), cx = X, sx = 13, sy = 12; const blobs = [];
      if (gk) { cy = att ? 6 : 4; sx = att ? 14 : 10; sy = att ? (h('swp') ? 9 : 5) : 4; }
      else {
        if (att) { if (foc === 'a') cy += 9; if (foc === 'd') cy -= 8; if (foc === 'u') cy -= 5; if (foc === 'r') { sx *= 1.5; sy *= 1.4; }
          if (h('run') || h('late') || h('box')) blobs.push([cx + (h('box') ? -side * 12 : 0), Math.min(96, cy + 20), 0.75]);
          if (h('wb') || h('ovl')) { blobs.push([side ? (side < 0 ? 6 : 94) : cx, Math.min(92, cy + 22), 0.85]); sy += 6; }
          if (h('wid') || h('crs')) cx = side < 0 ? Math.min(cx, 10) : side > 0 ? Math.max(cx, 90) : cx;
          if (h('inv') || h('ifb') || h('hyb')) blobs.push([50 + side * 14, cy + (h('ifb') || h('hyb') ? 4 : 10), 0.8]);
          if (h('drp') || h('vis')) blobs.push([cx * 0.6 + 20, cy - 16, 0.65]);
          if (h('hld') || h('anc') || h('lib')) { cy -= 5; sy *= 0.75; }
          if (h('dri')) sx += 3; if (h('wrk')) sy += 4; if (h('tgt')) sx *= 0.8;
        } else { if (foc === 'd') cy -= 6; if (foc === 'a') cy += 6;
          if (h('lzy')) cy += 14; if (h('wrk') || h('stp')) { sy += 5; sx += 3; } if (h('anc') || h('hld')) sx *= 0.85; if (h('lib')) cy -= 6;
          if (h('wb') || h('ovl')) sy += 5; }
      }
      cy = Math.max(3, Math.min(97, cy)); cx = Math.max(4, Math.min(96, cx)); blobs.unshift([cx, cy, 1]);
      const g = []; let mx = 0;
      for (let r = 0; r < ZR; r++) for (let q = 0; q < ZC; q++) { const zx = (q + 0.5) / ZC * 100, zy = (ZR - r - 0.5) / ZR * 100; let v = 0;
        blobs.forEach(([bx, by, w]) => { v = Math.max(v, w * Math.exp(-((zx - bx) ** 2) / (2 * sx * sx) - ((zy - by) ** 2) / (2 * sy * sy))); }); g.push(v); mx = Math.max(mx, v); }
      return g.map(v => mx ? v / mx : 0);
    };
    return { att: map(true), def: map(false) };
  }
  const zoneCells = (g, mini) => g.map(v => { const l = v < 0.14 ? 0 : v < 0.35 ? 1 : v < 0.6 ? 2 : v < 0.82 ? 3 : 4; return `<i class="z${l}"></i>`; }).join('');
  const zoneGrid = (g, label, mini) => `<div class="fcz ${mini ? 'mini' : ''}"><div class="fcz-grid">${zoneCells(g)}</div>${label ? `<small>${label}</small>` : ''}</div>`;
  function fcPitchHTML() {
    const key = State.formationKey() || '433', pts = (Engine.FORMATIONS[key] || Engine.FORMATIONS['433']).pts, cards = State.squadCards(), sp = fcSpots(pts);
    // v214 (JODIO's FC 27 screenshot): dark player tiles on the pitch: surname, role with ++/+, focus, position, and a rating dot
    return `<div class="fc-pitch fc27-pitch"><div class="fc27-lines"><i class="m"></i><i class="c"></i><i class="b"></i><i class="b t"></i><i class="g"></i><i class="g t"></i></div><div class="fc27-zones" id="fc-zones">${'<i></i>'.repeat(ZC * ZR)}</div><div class="fc27-zl" id="fc-zl">Hover or tap a player to see his zones</div>${pts.map((p, i) => {
      const c = cards[i], pos = State.FORMATION[i], r = RUT.ROLE_BY[State.slotRole(i)] || (c ? RUT.roleOf(c, pos) : null), fam = c && r && r.fc ? RUT.roleFam(c, r.key, pos) : 0;
      return `<button class="fc-mk fc27-mk" data-act="fc-role" data-i="${i}" data-z="${(fcZones(i) || { att: [] }).att.map(v => v.toFixed(2)).join(',')}" title="${esc((c ? c.name : 'Empty') + (r ? ' · ' + r.name : ''))}" style="top:${sp[i][0].toFixed(1)}%;left:${sp[i][1].toFixed(1)}%">${c ? `<u>${c.rating}</u>` : ''}<b>${esc(c ? c.name.split(' ').slice(-1)[0] : 'Empty')}</b><span>${esc(r ? r.name : 'Auto')}${famTag(fam)}</span><i>${esc(r && r.focusName ? r.focusName : '')}</i><small>${esc(pos)}</small></button>`;
    }).join('')}</div>`;
  }
  /** Team Tactical Analysis: six 0..100 scores from the built tactic and the roles on the pitch, with strengths and warnings. */
  function fcAnalysis() {
    const T = Engine.buildTactic(fcSpec()), cards = State.squadCards(), tags = [], fams = [];
    for (let i = 1; i < 11; i++) { const c = cards[i]; if (!c) continue; const pos = State.FORMATION[i], r = RUT.ROLE_BY[State.slotRole(i)] || RUT.roleOf(c, pos); tags.push(RUT.effectiveTags(c, pos, r && r.key)); fams.push(r && r.fc ? RUT.roleFam(c, r.key, pos) : 1); }
    const cnt = (...ks) => tags.reduce((a, q) => a + (ks.some(k => q.has(k)) ? 1 : 0), 0), cl = v => Math.round(Math.max(5, Math.min(99, v)));
    const v = {
      ATK: cl(28 + cnt('run', 'late', 'box', 'gun', 'chn') * 6 + T.counter * 10 + (T.runs - 2) * 6 + T.fbHigh * 1.2),
      DEF: cl(38 + cnt('hld', 'anc', 'stp', 'lib', 'rec', 'tck') * 6 - T.line * 1.2 + T.backFwd * 1.5 + (T.restGap - 4) * 2),
      WID: cl(15 + cnt('wid', 'wb', 'ovl', 'crs') * 9 - cnt('inv', 'ifb') * 6 + (T.width - 1) * 120 + T.cross * 15),
      END: cl(18 + (T.press - 1) * 12 + T.counterPress * 3 + cnt('wrk', 'dur', 'prs') * 6 - cnt('lzy') * 6),
      LEN: cl(55 - T.line * 1.4 + (T.runsFwd ? 12 : 0) - T.drop9 * 0.8 + T.backFwd * 1.2 - (T.squeeze || 0.75) * 10),
      BLD: cl(35 + (T.shortW - 1) * 40 + T.eager * 4 - (T.vert - 1) * 25 - (T.range - 1) * 25 + cnt('sfe', 'vis', 'bpl') * 4 + (T.pivot ? 8 : 0)),
    };
    const good = [], warn = [], none = fams.filter(f => f === 0).length, fit = fams.filter(f => f === 2).length;
    if (v.ATK >= 70) good.push(['Plenty Of Runners In Behind', 'Lots of players attack the space and the box.']); if (v.ATK < 32) warn.push(['Few Players Attack The Box', 'Chances will be rare: give a role an Attack focus.']);
    if (v.DEF >= 70) good.push(['Solid Defensive Block', 'Hard to play through, with cover behind the ball.']); if (v.DEF < 32) warn.push(['Exposed At The Back', 'A high line and few holders leave space behind.']);
    if (v.WID >= 65) good.push(['Stretches The Pitch', 'Width on both flanks pulls the defence apart.']); if (v.WID < 32) warn.push(['Lacking Wide Options', 'Nobody holds the width: add a Winger or Wingback.']);
    if (v.END >= 75) warn.push(['Energy Hungry', 'Players will tire late on: rotate or press less.']); if (v.END < 30) warn.push(['Team Hardly Breaks A Sweat', 'Little pressing: the other team can play freely.']); if (v.END >= 45 && v.END < 75) good.push(['Good Work Rate', 'They press and cover without running out of legs.']);
    if (v.LEN >= 72) warn.push(['Big Gaps Between The Lines', 'Forwards and defenders are far apart.']); if (v.LEN < 35) good.push(['Compact Shape', 'Short distances between the lines.']);
    if (v.BLD >= 68) good.push(['Patient Build-Up', 'Keeps the ball and moves it through the lines.']); if (v.BLD < 30) good.push(['Direct Play', 'Skips midfield to get forward fast.']);
    if (fit >= 6) good.push(['Players Suit Their Roles', fit + ' players are in their best role (++).']); if (none >= 3) warn.push(['Players Out Of Their Roles', none + ' players have no + in their role: tap them on the pitch.']);
    if (!good.length && !warn.length) good.push(['Well Balanced', 'No big strengths or weaknesses: a side that can do a bit of everything.']);
    return { v, good, warn };
  }
  function radarSVG(v) {
    const ks = Object.keys(v), cx = 120, cy = 104, R = 70, pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / ks.length; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const poly = f => ks.map((k, i) => pt(i, f(k)).map(x => x.toFixed(1)).join(',')).join(' ');
    return `<svg viewBox="0 0 240 210" class="fc-radar" role="img" aria-label="Team tactical analysis">${[0.25, 0.5, 0.75, 1].map(f => `<polygon points="${poly(() => R * f)}" fill="none" stroke="#3a4560"/>`).join('')}${ks.map((k, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#3a4560"/>`; }).join('')}<polygon points="${poly(k => R * v[k] / 100)}" fill="rgba(255,212,0,.32)" stroke="#ffd400" stroke-width="2"/>${ks.map((k, i) => { const [x, y] = pt(i, R + 18); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="#e8ecf4" font-size="10" font-family="monospace" text-anchor="middle" dominant-baseline="middle">${k} ${v[k]}</text>`; }).join('')}</svg>`;
  }
  const FC_ICON = { x: '&#9881;', s: '&#9878;', w: '&#8644;', p: '&#9673;', c: '&#9889;', l: '&#10150;', h: '&#9650;', t: '&#10022;', b: '&#9638;' };
  function fcHTML() {
    const t = fcTac(), P = FCP(), B = Engine.FC_BUILD, Df = Engine.FC_DEF, fk = State.formationKey() || '433', A = fcAnalysis(), ks = ['x'].concat(Object.keys(P).filter(k => k !== 'x'));
    const opt = (o, cur) => Object.entries(o).map(([k, x]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    return `<div class="fc27"><div class="fc27-head"><h2>Tactical Presets</h2><span>${ks.length - 1} Presets available.</span></div>
      <div class="fc27-body"><div class="fc27-side"><div class="fc27-list">${ks.map(k => `<button class="fc27-pre ${t.preset === k ? 'on' : ''}" data-act="fc-preset" data-k="${k}"><div><b>${esc(k === 'x' ? 'Custom' : P[k].name)}</b><p>${esc(k === 'x' ? 'Tactics that you have customised.' : P[k].blurb)}</p></div><em>${FC_ICON[k] || '&#9679;'}</em>${t.preset === k ? '<s>&#10003;</s>' : ''}</button>`).join('')}</div>
        <div class="fc27-edit"><label>Formation</label><select id="fc-form">${Object.entries(State.FORMS).map(([k, f]) => `<option value="${k}" ${k === fk ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
          <label>Build-Up Style</label><select id="fc-bu">${opt(B, t.bu)}</select><p>${esc(B[t.bu].blurb)}</p>
          <label>Defensive Approach</label><select id="fc-da">${opt(Df, t.da)}</select><p>${esc(Df[t.da].blurb)}</p>
          <label>Line Height <b id="fc-lnv">${t.ln}</b></label><input type="range" id="fc-ln" min="0" max="99" value="${t.ln}" ${t.man ? '' : 'disabled'}>
          <label class="fc-chk"><input type="checkbox" id="fc-man" ${t.man ? 'checked' : ''}> Manually Adjust Line</label></div></div>
        <div class="fc27-main"><h3>${esc(P[t.preset].name)}${t.preset === 'x' && t.base !== 's' ? ' <span>from ' + esc(P[t.base].name) + '</span>' : ''} <span>· ${esc((State.FORMS[fk] || {}).name || '')}</span></h3>${fcPitchHTML()}<p class="fc27-tip">Tap a player to change his role and focus. ++ = his best role there, + = a good fit.</p></div></div>
      <div class="fc27-an"><div><h3>Team Tactical Analysis</h3>${radarSVG(A.v)}</div><div>${A.good.map(([h, d]) => `<div class="fc-an good"><b>&#10003; ${esc(h)}</b><span>${esc(d)}</span></div>`).join('')}${A.warn.map(([h, d]) => `<div class="fc-an bad"><b>! ${esc(h)}</b><span>${esc(d)}</span></div>`).join('')}</div></div></div>`;
  }
  function fcRoleModal(i) {
    const c = State.squadCards()[i], pos = State.FORMATION[i], cur = State.slotRole(i), cb = cur && RUT.ROLE_BY[cur] ? RUT.ROLE_BY[cur].base : '';
    if (!c) { toast('Put a player in this position first.', 'bad'); return; }
    const cr = RUT.ROLE_BY[cur] || RUT.roleOf(c, pos), z = fcZones(i);
    modal(`<h1>${esc(pos)} · ${esc(c.name)}</h1>
      <div class="fcz-head"><div><b class="gold">${esc(cr ? cr.name : 'Auto')}${cr && cr.focusName ? ' · ' + esc(cr.focusName) : ''}</b><p class="dim">Where he goes in this role. Dark squares = he goes there a lot, light = rarely, empty = never.</p></div>
        ${z ? zoneGrid(z.att, 'In possession') + zoneGrid(z.def, 'Out of possession') : ''}</div>
      <p class="dim" style="font-size:8px;line-height:1.8">Pick a role, then its focus. ++ = his best role here, + = a good fit. The small map shows that role's zones.</p>${RUT.fcRolesIn(pos).map(r => { const fk = cb === r.key ? cur : r.key + ':' + (r.foc.includes('b') ? 'b' : r.foc[0]), mz = fcZones(i, fk); return `<div class="req fcz-role ${cb === r.key ? 'ok' : ''}">${mz ? zoneGrid(mz.att, '', true) : ''}<div><b>${esc(r.name)} ${famTag(RUT.roleFam(c, r.key, pos))}</b><p class="dim" style="font-size:8px;line-height:1.7">${esc(r.desc)}</p><div class="row">${r.foc.map(f => `<button class="btn sm ${cur === r.key + ':' + f ? 'y' : ''}" data-act="fc-set" data-i="${i}" data-k="${r.key}:${f}">${esc(RUT.FOCUS[f].name)}</button>`).join('')}</div></div></div>`; }).join('')}
      <div class="row mt"><button class="btn" data-act="fc-set" data-i="${i}" data-k="">Use the preset's role</button><button class="btn" data-act="close">Close</button></div>`, 'wide');
  }
  function fcBind() {
    const zg = $('#fc-zones'), zl = $('#fc-zl');
    if (zg) { const cells = zg.children, show = el => { const v = el ? el.dataset.z.split(',').map(Number) : []; for (let k = 0; k < cells.length; k++) { const x = v[k] || 0; cells[k].className = el ? 'z' + (x < 0.14 ? 0 : x < 0.35 ? 1 : x < 0.6 ? 2 : x < 0.82 ? 3 : 4) : ''; } if (zl) zl.textContent = el ? el.title + ' · in possession' : 'Hover or tap a player to see his zones'; document.querySelectorAll('.fc27-mk.zon').forEach(e => e.classList.remove('zon')); if (el) el.classList.add('zon'); };
      document.querySelectorAll('.fc27-mk').forEach(el => { el.addEventListener('mouseenter', () => show(el)); el.addEventListener('focus', () => show(el)); });
      zg.parentElement.addEventListener('mouseleave', () => show(null)); }
    const t = fcTac(), save = msg => { D().tacMode = 'fc'; State.save(); if (msg) toast(msg, 'good'); render(); };
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('change', () => fn(e)); };
    on('#fc-pre', e => { const k = e.value, P = FCP()[k]; if (k === 'x') { t.preset = 'x'; return save(); } Object.assign(t, fcFromPreset(k)); if (P.form && State.FORMS[P.form] && P.form !== State.formationKey()) State.setFormation(P.form); save('Preset: ' + P.name); });
    on('#fc-form', e => { State.setFormation(e.value); t.preset = 'x'; save('Formation: ' + State.FORMS[e.value].name); });
    on('#fc-bu', e => { t.bu = e.value; t.preset = 'x'; save(); });
    on('#fc-da', e => { t.da = e.value; if (!t.man) t.ln = Engine.FC_DEF[e.value].ln; t.preset = 'x'; save(); });
    on('#fc-man', e => { t.man = e.checked; if (!t.man) t.ln = Engine.FC_DEF[t.da].ln; save(); });
    const ln = $('#fc-ln'); if (ln) { ln.addEventListener('input', () => { $('#fc-lnv').textContent = ln.value; }); ln.addEventListener('change', () => { t.ln = +ln.value; t.preset = 'x'; save(); }); }
  }
  const myTac = () => fcSpec();
  const styleOptions = (cur, auto) => (auto ? `<option value="auto" ${cur === 'auto' ? 'selected' : ''}>Auto (a random tactic)</option>` : '') + `<option value="balanced" ${cur === 'balanced' ? 'selected' : ''}>Balanced (no trait)</option>` + Object.entries(TT()).map(([k, t]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const styleBlurb = k => k === 'auto' ? 'A random tactic every match.' : Engine.buildTactic(k).blurb;
  const styleName = k => Engine.buildTactic(k).name;
  const validStyle = k => k === 'balanced' || !!TT()[k] || /^[0-3]-[0-3]-[0-3]\|/.test(String(k)) || /^F[bscl][bdha]\d\d[a-z]/.test(String(k));
  const pickStyle = k => {
    if (k !== 'auto' && validStyle(k)) return k;
    const P = [[2, 2, 2], [3, 2, 1], [2, 3, 1], [1, 2, 3], [2, 1, 3], [1, 3, 2], [3, 1, 2], [2, 2, 1], [1, 2, 2]], ks = Object.keys(TT()), pt = P[Math.floor(Math.random() * P.length)];
    return pt.join('-') + '|' + ks[Math.floor(Math.random() * ks.length)];
  };
  function bindPlay() { const so = $('#sty-opp'); if (so) so.addEventListener('change', () => { App.oppStyle = so.value; saveSet(); render(); });
    const s = $('#half-len'); if (s) s.addEventListener('change', () => { App.halfSeconds = +s.value; saveSet(); }); const k = $('#ko'); if (k) k.addEventListener('change', () => { App.knockout = k.checked; saveSet(); }); }

  const SKILL_MULT = { amateur: 0.6, semi: 0.8, pro: 1, world: 1.3, legendary: 1.6 };

  const gfxPref = () => { try { return localStorage.getItem('rut_gfx') || '3d'; } catch (e) { return '3d'; } };
  const gfxLabel = g => ({ auto: 'Auto', ultra: 'Ultra 1440p', '3d': 'Full 3D (WebGL)', high: 'High', med: 'Medium', low: 'Low', potato: 'Potato' }[g || (function () { try { return localStorage.getItem('rut_gfx'); } catch (e) { return null; } })() || '3d'] || 'Auto');
  const camLabel = mode => ({ tv: 'TV', wide: 'Wide', close: 'Close' }[mode] || 'TV');
  function startMatch(mode) {
    const st = D();
    const home = { name: st.clubName, short: 'RFC', cards: State.matchCards() };
    const away = Engine.buildOpponent(App.difficulty), styles = [myTac(), pickStyle(App.oppStyle)];
    if (mode === 'sim') {
      const res = Engine.simulate(home, away, { halfSeconds: App.halfSeconds, knockout: App.knockout, styles, tacGain: [CLUB_GAIN, 0], coach: [coachK(), null], train: [trainBoost(), null], plays: (D().plays || []).some(pl => pl.on) ? [playsCfg(), null] : undefined });
      playsLive({ planLog: res.plan });
      recordPlayerStats(res, away);
      finishMatch(res, away);
      return;
    }
    runMatch({
      tag: 'Kick Off', home, away, humans: mode === 'play' ? [0] : [], knockout: App.knockout, styles,
      onEnd: res => finishMatch(res, away),
      onQuit: quitMatch,
    });
  }


  /* ----------------------- STAFF & TRAINING (v118) ----------------------- */
  const SF = () => RUT.Staff, trainBoost = () => (RUT.Staff ? RUT.Staff.boost() : null);
  const AUTO = { running: false, prog: '', res: null, prev: null, n: 4, half: 60 };
  const sfStars = n => '<span class="gold">' + '★'.repeat(n) + '</span><span class="dim">' + '★'.repeat(5 - n) + '</span>';
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function sfCoachHTML(c) {
    const s = SF(), p = s.poolOf(c.id), st = s.STYLES[p.style], S0 = s.S(), now = Date.now(), max = s.perDay(c), head = S0.head === c.id;
    const left = max - c.used - (c.act ? 1 : 0), run = c.act;
    const btns = Object.entries(s.AREAS).map(([k, nm]) => `<button class="btn sm ${k === p.area ? 'y' : ''}" data-act="sf-train" data-id="${c.id}" data-area="${k}" ${run || left <= 0 ? 'disabled' : ''}>${nm}${k === p.area ? ' ★' : ''}</button>`).join(' ');
    return `<div class="px mt"><div class="row between"><b>${esc(p.name)}</b><span>${sfStars(p.stars)}${head ? ' <span class="good" style="font-size:8px">HEAD COACH</span>' : ''}</span></div>
      <p class="dim" style="font-size:8px;line-height:1.8">Plays <b>${esc(st.n)}</b> · prefers <b>${s.AREAS[p.area]}</b> (full gain; other areas half) · site: <b>${esc(p.site)}</b>, ${esc(p.drill)}</p>
      <p style="font-size:8px;margin:4px 0">Sessions today: <b>${c.used}</b> done${run ? ' + 1 running' : ''} of <b>${max}</b> · each +${s.gainOf(c, p.area).toFixed(1)} points in his area · fee <b>${fmt(s.feeOf(c.id))}c</b> per session</p>
      ${run ? `<div style="background:#1c2434;border:1px solid #556;height:10px"><div data-sfbar="${run.start}:${run.end}" style="height:100%;background:#ffd400;width:${Math.min(100, (now - run.start) / (run.end - run.start) * 100)}%"></div></div><p style="font-size:8px;margin:3px 0">Training ${esc(s.AREAS[run.area].toLowerCase())}: <b data-sfend="${run.end}">${mmss(run.end - now)}</b> left. It keeps running while you play.</p>` : ''}
      <div class="row mt" style="flex-wrap:wrap;gap:4px">${btns}</div>
      <div class="row mt" style="flex-wrap:wrap;gap:4px">${run ? `<button class="btn sm y" data-act="sf-watch" data-id="${c.id}">Watch the drill</button>` : ''}<button class="btn sm ${c.auto ? 'g' : ''}" data-act="sf-auto" data-id="${c.id}">Run all day: ${c.auto ? 'ON' : 'OFF'}</button>
        <button class="btn sm c" data-act="sf-style" data-id="${c.id}">Use ${esc(st.n)} setup now</button><button class="btn sm ${head ? 'g' : ''}" data-act="sf-head" data-id="${c.id}">${head ? 'Head coach' : 'Make head coach'}</button><button class="btn sm r" data-act="sf-fire" data-id="${c.id}">Release</button></div></div>`;
  }

  /* ---- v119: live drill simulation of your XI while a coach trains them (a picture of the session, stars set the quality) ---- */
  let drillRAF = 0;
  function drillView(coachId) {
    const s = SF(), S0 = s.S(), c = S0.coaches.find(x => x.id === coachId); if (!c || !c.act) { toast('That coach is not training right now.', 'bad'); return; }
    const p = s.poolOf(coachId), st = p.stars, area = c.act.area, W = 640, H = 380;
    const xi = State.squadCards().map((cd, i) => cd ? { cd, i, pos: State.FORMATION[i], nm: cd.name.split(' ').slice(-1)[0].toUpperCase().slice(0, 9), r: cd.rating } : null).filter(Boolean);
    const isA = q => /^(ST|CF|LW|RW|CAM|LM|RM)$/.test(q.pos), isD = q => /^(CB|LB|RB|LWB|RWB)$/.test(q.pos), isG = q => q.pos === 'GK';
    let grp = area === 'att' ? xi.filter(isA) : area === 'def' ? xi.filter(isD) : area === 'gk' ? xi.filter(q => isG(q) || isA(q)) : xi.filter(q => !isA(q) && !isD(q) && !isG(q));
    if (grp.length < 3) grp = xi.filter(q => !isG(q));
    const gk = xi.find(isG) || xi[0], tempo = 0.8 + 0.12 * st, skill = 0.05 * st;       // stars: faster drills, cleaner execution
    const extra = st >= 4 ? 2 : st >= 2 ? 1 : 0, rng = Math.random;
    const wrap = document.createElement('div'); wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(5,8,20,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:10px';
    wrap.innerHTML = `<div style="font-size:11px"><b>${esc(p.name)}</b> ${sfStars(st)} · ${esc(p.site)} · <span class="gold">${esc(s.AREAS[area])} drill: ${esc(p.drill)}</span></div>
      <canvas width="${W}" height="${H}" style="max-width:96vw;max-height:60vh;border:2px solid #556;background:#1e7a34"></canvas>
      <div id="dr-stat" style="font-size:9px;line-height:1.8;text-align:center"></div>
      <div style="font-size:8px" class="dim">Tempo x${tempo.toFixed(2)}, execution +${Math.round(skill * 100)}% and ${extra ? extra + ' extra defender(s) / ball(s)' : 'a basic set-up'} come from the coach's ${st} star${st > 1 ? 's' : ''}. This is a picture of the session; the real gain is the points the session pays when its 5 minutes are up.</div>
      <div class="row"><span style="font-size:9px">Session: <b id="dr-left"></b> left</span><button class="btn r" id="dr-close">Close</button></div>`;
    document.body.appendChild(wrap);
    const cv = wrap.querySelector('canvas'), g = cv.getContext('2d'), stat = wrap.querySelector('#dr-stat'), left = wrap.querySelector('#dr-left');
    const mk = (q, x, y, col) => ({ q, x, y, tx: x, ty: y, col: col || '#2a6bd6' });
    const T = { ok: 0, bad: 0, goals: 0, saves: 0, shots: 0 };
    let ents = [], ball = { x: W / 2, y: H / 2, fx: 0, fy: 0, tx: W / 2, ty: H / 2, t: 1, arc: 0 }, beat = 0, holder = 0, label = '';
    const kick = (tx, ty, dur, arc) => { ball.fx = ball.x; ball.fy = ball.y; ball.tx = tx; ball.ty = ty; ball.t = 0; ball.dur = dur / tempo; ball.arc = arc || 0; };
    const ok = (q, base) => rng() < Math.min(0.97, base + skill + (q.r - 70) * 0.004);
    if (area === 'mid' || area === 'def' && false) {
      const n = Math.min(8, Math.max(4, grp.length)), cx = W / 2, cy = H / 2, R = 120;
      ents = grp.slice(0, n).map((q, i) => { const a = i / n * Math.PI * 2; return mk(q, cx + R * Math.cos(a), cy + R * Math.sin(a) * 0.75); });
      for (let i = 0; i < 1 + extra; i++) ents.push(Object.assign(mk({ nm: 'PRESS', r: 70 }, cx, cy, '#d63a3a'), { def: 1 }));
      holder = 0; ball.x = ents[0].x; ball.y = ents[0].y; label = 'Rondo: keep the ball against ' + (1 + extra) + ' presser(s)';
    } else if (area === 'def') {
      const n = Math.min(5, grp.length); ents = grp.slice(0, n).map((q, i) => mk(q, 140, 70 + i * (H - 140) / Math.max(1, n - 1)));
      ents.push(Object.assign(mk({ nm: 'BALL', r: 70 }, 480, H / 2, '#d63a3a'), { att: 1 })); for (let i = 0; i < extra; i++) ents.push(Object.assign(mk({ nm: 'RUN', r: 70 }, 520, 100 + i * 180, '#d63a3a'), { att: 1 }));
      label = 'Defensive shape: hold the line as the ball moves';
    } else {
      ents = grp.slice(0, 5).map((q, i) => mk(q, 330 + (i % 3) * 50, 100 + (i % 2) * 180)); ents.push(Object.assign(mk(gk.q || gk, 40, H / 2, '#e0b400'), { gk: 1 }));
      for (let i = 0; i < extra; i++) ents.push(Object.assign(mk({ nm: 'DEF', r: 70 }, 150, 120 + i * 140, '#d63a3a'), { def: 1 }));
      label = area === 'gk' ? 'Shot stopping: ' + (st >= 4 ? 'two balls at once' : 'one shot at a time') : 'Finishing: cross, shoot, rebound';
    }
    let last = performance.now(), acc = 0, shooter = 0;
    function doBeat() {
      if (area === 'mid') {
        const f = ents[holder], cands = ents.filter(e => !e.def && e !== f), to = cands[Math.floor(rng() * cands.length)], pr = ents.filter(e => e.def);
        const pass = ok(f.q, 0.72 - 0.06 * pr.length);
        if (pass) { T.ok++; holder = ents.indexOf(to); kick(to.x, to.y, 0.55); } else { T.bad++; const d = pr[0]; kick(d.x, d.y, 0.5); setTimeout(() => { if (ents.indexOf(to) >= 0) { ball.x = to.x; ball.y = to.y; holder = ents.indexOf(to); } }, 700 / tempo); }
        pr.forEach(d => { d.tx = (pass ? to.x : d.x) + (rng() - 0.5) * 60; d.ty = (pass ? to.y : d.y) + (rng() - 0.5) * 60; });
      } else if (area === 'def') {
        const b = ents.filter(e => e.att), tgt = b[Math.floor(rng() * b.length)], by = 40 + rng() * (H - 80);
        tgt.tx = 380 + rng() * 220; tgt.ty = by; const d = ents.filter(e => !e.att);
        d.forEach((e, i) => { const hold = ok(e.q, 0.78); e.tx = 140 + (tgt.tx > 480 ? 40 : 0) + (hold ? 0 : 30); e.ty = 70 + (by - 40) * 0.5 + i * (H - 200) / Math.max(1, d.length - 1) + (hold ? 0 : (rng() - 0.5) * 70); });
        const held = d.filter(e => Math.abs(e.tx - d[0].tx) < 20).length >= d.length - 1; if (held) T.ok++; else T.bad++;
        kick(tgt.tx, tgt.ty, 0.7);
      } else {
        const sh = ents.filter(e => !e.gk && !e.def)[shooter++ % Math.max(1, ents.filter(e => !e.gk && !e.def).length)], G = ents.find(e => e.gk) || ents[0];
        sh.tx = 330 + rng() * 60; sh.ty = 90 + rng() * 200; T.shots++;
        const on = ok(sh.q, 0.62), save = ok(G.q, 0.46 + 0.02 * (st - 3));
        const gy = H / 2 + (rng() - 0.5) * 120; kick(25, on ? gy : (rng() < 0.5 ? 60 : H - 60), 0.55, 18);
        setTimeout(() => { if (!on) { T.bad++; return; } if (save) { T.saves++; G.ty = Math.max(70, Math.min(H - 70, gy)); } else { T.goals++; G.ty = gy > H / 2 ? H / 2 - 60 : H / 2 + 60; } T.ok++; }, 520 / tempo);
        setTimeout(() => { G.ty = H / 2; }, 1500 / tempo);
      }
    }
    function frame(now) {
      if (!document.body.contains(wrap)) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt * tempo;
      if (acc > (area === 'gk' ? 1.0 : area === 'att' ? 1.5 : 0.95)) { acc = 0; doBeat(); }
      ents.forEach(e => { const k = Math.min(1, dt * 4.5 * tempo); e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; });
      if (ball.t < 1) { ball.t = Math.min(1, ball.t + dt / ball.dur); ball.x = ball.fx + (ball.tx - ball.fx) * ball.t; ball.y = ball.fy + (ball.ty - ball.fy) * ball.t; }
      g.clearRect(0, 0, W, H); g.fillStyle = '#1e7a34'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'; g.fillRect(i * W / 8, 0, W / 8, H); }
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.strokeRect(6, 6, W - 12, H - 12);
      if (area === 'att' || area === 'gk') { g.strokeRect(6, H / 2 - 110, 110, 220); g.strokeRect(6, H / 2 - 36, 40, 72); g.fillStyle = '#fff'; g.fillRect(2, H / 2 - 26, 6, 52); }
      if (area === 'mid') { g.beginPath(); g.arc(W / 2, H / 2, 125, 0, 7); g.stroke(); }
      ents.forEach(e => { g.fillStyle = e.col; g.beginPath(); g.arc(e.x, e.y, 13, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.font = '9px monospace'; g.textAlign = 'center'; g.fillText(e.q.nm || '', e.x, e.y - 18); if (e.q.r && !e.def && !e.att) { g.fillStyle = '#ffd400'; g.fillText(e.q.r, e.x, e.y + 4); } });
      const bz = Math.sin(ball.t * Math.PI) * ball.arc; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(ball.x, ball.y + 3, 6, 3, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ball.x, ball.y - bz, 6, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
      const tot = T.ok + T.bad;
      stat.innerHTML = `<b>${esc(label)}</b><br>` + (area === 'att' || area === 'gk' ? `Shots ${T.shots} · goals <b class="good">${T.goals}</b> · saved ${T.saves} · off target ${T.shots - T.goals - T.saves < 0 ? 0 : T.shots - T.goals - T.saves}` : `Clean: <b class="good">${T.ok}</b> · errors <b class="bad">${T.bad}</b>${tot ? ' · ' + Math.round(T.ok / tot * 100) + '%' : ''}`);
      const run = c.act; left.textContent = run ? mmss(run.end - Date.now()) : 'done';
      if (!run || run.end <= Date.now() && !S0.coaches.find(x => x.id === coachId).act) { left.textContent = 'done'; }
      drillRAF = requestAnimationFrame(frame);
    }
    wrap.querySelector('#dr-close').addEventListener('click', () => { cancelAnimationFrame(drillRAF); wrap.remove(); });
    drillRAF = requestAnimationFrame(frame);
  }


  /* v120: before / after test: your club against the same computer sides with the training boost off (before) and on (after) */
  const TT0 = { running: false, prog: '', res: null, n: 8, half: 90 };
  function trainTestHTML() {
    const r = TT0.res, s = SF(), b = s.boost();
    const row = (nm, o) => `<tr><td>${esc(nm)}</td><td>${o.w}-${o.d}-${o.l}</td><td>${(o.pts / o.n).toFixed(2)}</td><td>${(o.gf / o.n).toFixed(2)}</td><td>${(o.ga / o.n).toFixed(2)}</td><td>${(o.sh / o.n).toFixed(1)}</td></tr>`;
    const out = r ? `<table class="list"><tr><th></th><th>W-D-L</th><th>Pts/game</th><th>Goals for</th><th>Goals against</th><th>Shots</th></tr>${row('Before training (no boost)', r.a)}${row('After training (' + Object.entries(r.boost || {}).map(([k, v]) => s.AREAS[k][0] + ' +' + (v * 100).toFixed(1) + '%').join(' ') + ')', r.b)}</table>
      <p style="font-size:9px;margin-top:6px">${r.b.gf - r.b.ga > r.a.gf - r.a.ga ? '<span class="good">Training helps: goal difference per match ' + ((r.a.gf - r.a.ga) / r.a.n).toFixed(2) + ' before, ' + ((r.b.gf - r.b.ga) / r.b.n).toFixed(2) + ' after.</span>' : '<span class="gold">No clear gain in this sample (goal difference ' + ((r.a.gf - r.a.ga) / r.a.n).toFixed(2) + ' before, ' + ((r.b.gf - r.b.ga) / r.b.n).toFixed(2) + ' after). More sessions raise the boost; try more matches.</span>'} ${r.n} matches each, ${r.half}s halves, same opponents and seeds.</p>` : '';
    return `<div class="px mt"><h2>Training results: before and after</h2><p class="dim" style="font-size:8px;line-height:1.9">Plays your club against the same computer opponents twice, once with the training boost switched off (how you were before the coaches) and once with it on, and shows both side by side. ${b ? '' : 'Train first: there is no boost yet.'}</p>
      <div class="row mt" style="flex-wrap:wrap;gap:8px"><span><label>Matches</label><select id="tt-n">${[6, 8, 12, 20].map(n => `<option ${TT0.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>
      <div class="row mt"><button class="btn y" data-act="tt-run" ${TT0.running || !b ? 'disabled' : ''}>${TT0.running ? 'Testing ' + esc(TT0.prog) : 'Run before / after test'}</button></div><div id="tt-out" class="mt">${out}</div></div>`;
  }
  function ttDraw() { if (App.view !== 'staff') return; const e = document.getElementById('tt-out'), d = document.createElement('div'); d.innerHTML = trainTestHTML(); const n = d.querySelector('#tt-out'), btn = document.querySelector('[data-act="tt-run"]'), nb = d.querySelector('[data-act="tt-run"]'); if (e && n) e.innerHTML = n.innerHTML; if (btn && nb) { btn.textContent = nb.textContent; btn.disabled = nb.disabled; } }
  function ttRun() {
    if (TT0.running) return;
    const d = D(); if (!d.squad.slots.every(Boolean)) { toast('Fill your whole XI first.', 'bad'); return; }
    const bo = trainBoost(); if (!bo) { toast('Train first: no boost yet.', 'bad'); return; }
    const n = $('#tt-n'); if (n) TT0.n = +n.value;
    const home = { name: d.clubName, short: 'RFC', cards: State.matchCards() }, opps = [], sty = [];
    for (let k = 0; k < TT0.n; k++) { opps.push(Engine.buildOpponent(App.difficulty)); sty.push(pickStyle('auto')); }
    const mk = () => ({ w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, sh: 0, n: 0 }), A = mk(), B = mk(), jobs = []; for (let k = 0; k < TT0.n; k++) { jobs.push([k, 0]); jobs.push([k, 1]); }
    TT0.running = true; TT0.res = null; TT0.prog = '0/' + jobs.length; let q = 0; ttDraw();
    const step = () => {
      if (q >= jobs.length) { TT0.running = false; TT0.res = { a: A, b: B, n: TT0.n, half: TT0.half, boost: bo }; RUT.Staff.note('Before/after test: goal difference ' + ((A.gf - A.ga) / A.n).toFixed(2) + ' before, ' + ((B.gf - B.ga) / B.n).toFixed(2) + ' after'); ttDraw(); return; }
      const [k, on] = jobs[q], T = on ? B : A;
      try { const r = Engine.simulate(home, opps[k], { halfSeconds: TT0.half, styles: [myTac(), sty[k]], seed: 9100 + k, tacGain: [CLUB_GAIN, 0], coach: [coachK(), null], train: [on ? bo : null, null] });
        const g = r.score[0] - r.score[1]; T.n++; T.gf += r.score[0]; T.ga += r.score[1]; T.sh += r.stats.shots[0]; if (g > 0) { T.w++; T.pts += 3; } else if (g < 0) T.l++; else { T.d++; T.pts++; } } catch (e) { TT0.running = false; toast('Test failed: ' + e.message, 'bad'); ttDraw(); return; }
      q++; TT0.prog = q + '/' + jobs.length; ttDraw(); setTimeout(step, 15);
    };
    setTimeout(step, 30);
  }

  function autoHTML() {
    const r = AUTO.res, pts = x => x.pts.toFixed(2);
    const tbl = r ? `<table class="list"><tr><th>Setup</th><th>W-D-L</th><th>Pts/game</th><th>Goal diff/game</th></tr>${r.rows.map(x => `<tr class="${x.best ? 'me' : ''}"><td>${esc(x.name)}${x.best ? ' ✔' : ''}</td><td>${x.w}-${x.d}-${x.l}</td><td>${pts(x)}</td><td>${x.gd.toFixed(2)}</td></tr>`).join('')}</table>
      <p style="font-size:9px;margin-top:6px"><span class="good">Applied: ${esc(r.title)}.</span> ${AUTO.n} matches of ${AUTO.half}s halves per setup, same opponents and seeds. ${AUTO.prev ? '<button class="btn sm" data-act="auto-undo">Undo, go back to my old setup</button>' : ''}</p>` : '';
    return `<div class="px mt"><h2>Auto setup: find everything for me</h2>
      <p class="dim" style="font-size:8px;line-height:1.9">One press tests all ${SF().STYLES.length} playbook systems (shape, tactic points and trait) with your real players in computer matches, then tries other point splits on the best one, and sets up your formation, tactic and the auto coach for you. Your coach's training boost is included. It needs a full XI and takes a moment; your old setup can be restored.</p>
      <div class="row mt" style="flex-wrap:wrap;gap:8px"><span><label>Matches per setup</label><select id="auto-n">${[3, 4, 6, 8].map(n => `<option ${AUTO.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></span>
        <span><label>Half length</label><select id="auto-half">${[45, 60, 90].map(n => `<option value="${n}" ${AUTO.half === n ? 'selected' : ''}>${n}s</option>`).join('')}</select></span></div>
      <div class="row mt"><button class="btn y" data-act="auto-run" ${AUTO.running ? 'disabled' : ''}>${AUTO.running ? 'Testing ' + esc(AUTO.prog) : 'Find and set up my best tactics'}</button></div>
      <div id="auto-out" class="mt">${tbl}</div></div>`;
  }
  VIEWS.staff = function () {
    const s = SF(), S0 = s.S(), b = s.boost() || {}, cap = s.CAP[s.bestStars()] * 100, hired = S0.coaches, now = Date.now();
    const area = Object.entries(s.AREAS).map(([k, nm]) => `<div style="margin:4px 0"><div class="row between" style="font-size:9px"><span>${nm}</span><span><b>${S0.pts[k].toFixed(1)}</b> pts · AI <b class="${b[k] ? 'good' : 'dim'}">+${((b[k] || 0) * 100).toFixed(1)}%</b></span></div>
      <div style="background:#1c2434;border:1px solid #556;height:8px"><div style="height:100%;background:#26c281;width:${Math.min(100, S0.pts[k] / s.FULL * 100)}%"></div></div></div>`).join('');
    const pool = s.POOL.filter(c => !hired.some(h => h.id === c.id)).sort((a, c) => c.stars - a.stars);
    const cards = pool.map(c => `<div class="row between" style="padding:5px 0;border-bottom:1px solid #223"><span style="font-size:8px;line-height:1.7"><b>${esc(c.name)}</b> ${sfStars(c.stars)}<br><span class="dim">${esc(s.STYLES[c.style].n)} · ${s.AREAS[c.area]} · ${esc(c.site)} · ${s.PERDAY[c.stars]} sessions a day · ${fmt(s.feeOf(c.id))}c per session</span></span>
      <button class="btn sm y" data-act="sf-hire" data-id="${c.id}" ${hired.length >= s.MAXC || D().coins < s.COST[c.stars] ? 'disabled' : ''}>${fmt(s.COST[c.stars])}c</button></div>`).join('');
    return `<h1>Staff &amp; Training</h1>
      <p class="dim" style="font-size:8px;line-height:1.9">Hire up to ${s.MAXC} coaches from ${s.POOL.length}. Each session costs a fee (30% of the coach's price spread over his day's sessions) and each coach has stars, his own way of playing from the Soccer Tactics Playbook, a favourite area and his own training site. A session takes <b>5 minutes of real time</b> and keeps running while you play your matches. Sessions a day: 1★ ${s.PERDAY[1]}, 2★ ${s.PERDAY[2]}, 3★ ${s.PERDAY[3]}, 4★ ${s.PERDAY[4]}, 5★ ${s.PERDAY[5]}. Sessions turn into <b>better AI</b> for that area's players whenever your club plays or you watch: up to +${cap.toFixed(0)}% with your best coach (1★ ${s.CAP[1] * 100}%, 3★ ${s.CAP[3] * 100}%, 5★ ${s.CAP[5] * 100}%; full effect at ${s.FULL} points). The AI gain also sharpens that area's skills (finishing, passing, tackling, saves). It applies to your Kick Off, Casual, League and Top 5 matches, not online.</p>
      <div class="grid cols-2"><div class="px"><h2>Team training</h2>${area}<p class="dim" style="font-size:8px;margin-top:6px">${hired.length ? 'Best coach: ' + s.bestStars() + '★.' : 'Hire a coach to start training.'}</p>
        <div class="row mt"><button class="btn ${S0.manage ? 'g' : ''}" data-act="sf-manage">Head coach manages my tactics: ${S0.manage ? 'ON' : 'OFF'}</button></div>
        <p class="dim" style="font-size:8px;line-height:1.8">When on, the head coach sets his formation, points and trait after every finished session.</p>
        ${S0.log.length ? '<h3 class="mt">Training log</h3>' + S0.log.slice(0, 6).map(l => `<div class="dim" style="font-size:8px;line-height:1.8">${new Date(l.t).toLocaleTimeString()} ${esc(l.msg)}</div>`).join('') : ''}</div>
      <div class="px"><h2>Hire a coach (${hired.length}/${s.MAXC})</h2><div style="max-height:520px;overflow:auto">${cards || '<p class="dim">You have hired everyone.</p>'}</div><p class="dim" style="font-size:8px">Releasing a coach gives no refund; his points stay with the team.</p></div></div>
      <div id="sf-coaches">${hired.map(sfCoachHTML).join('')}</div>
      ${trainTestHTML()}
`;
  };
  function sfLive() {
    if (App.view !== 'staff') return;
    const now = Date.now();
    document.querySelectorAll('[data-sfend]').forEach(e => { e.textContent = mmss(+e.dataset.sfend - now); });
    document.querySelectorAll('[data-sfbar]').forEach(e => { const [a, b] = e.dataset.sfbar.split(':').map(Number); e.style.width = Math.min(100, (now - a) / (b - a) * 100) + '%'; });
  }
  function sfTick() {
    if (!RUT.Staff || !D()) return;
    const n = RUT.Staff.tick();
    if (n) { toast(n === 1 ? 'A training session finished.' : n + ' training sessions finished.', 'good'); if (App.view === 'staff' && !App.match) render(); updateHeader(); }
    sfLive();
  }
  function autoDraw() { if (App.view !== 'staff') return; const e = document.getElementById('auto-out'); const d = document.createElement('div'); d.innerHTML = autoHTML(); const n = d.querySelector('#auto-out'), btn = document.querySelector('[data-act="auto-run"]'), nb = d.querySelector('[data-act="auto-run"]'); if (e && n) e.innerHTML = n.innerHTML; if (btn && nb) { btn.textContent = nb.textContent; btn.disabled = nb.disabled; } }
  function autoRun() {
    if (AUTO.running) return;
    const d = D(); if (!d.squad.slots.every(Boolean)) { toast('Fill your whole XI first.', 'bad'); return; }
    const sfn = SF(), snap = { form: d.formation, slots: d.squad.slots.slice(), tac: JSON.parse(JSON.stringify(d.tactics || { a: 2, m: 2, d: 2, trait: '' })), auto: !!d.autoCoach, mode: d.tacMode };
    const restore = () => { d.formation = snap.form; d.squad.slots = snap.slots.slice(); State.applyFormation(); };
    const sets = sfn.STYLES.map(st => { State.setFormation(st.form); return { st, cards: State.matchCards() }; });
    restore();
    const opps = [], osty = []; for (let k = 0; k < AUTO.n; k++) { opps.push(Engine.buildOpponent(App.difficulty)); osty.push(pickStyle('auto')); }
    const tb = trainBoost(), res = new Map(), name = (st, v) => st.n + (v ? ' ' + v.join('-') : '');
    const jobs = []; sets.forEach((x, i) => { for (let k = 0; k < AUTO.n; k++) jobs.push({ i, k, v: null }); });
    AUTO.running = true; AUTO.res = null; AUTO.prog = '0/' + jobs.length; let q = 0, stage = 1, best = null, extra = 0;
    const key = j => j.i + (j.v ? ':' + j.v.join('') : '');
    const rec = (j, r) => { const o = res.get(key(j)) || { i: j.i, v: j.v, w: 0, d: 0, l: 0, gd: 0, n: 0 }; const g = r.score[0] - r.score[1]; if (g > 0) o.w++; else if (g < 0) o.l++; else o.d++; o.gd += g; o.n++; res.set(key(j), o); };
    const fin = () => {
      const rows = [...res.values()].map(o => ({ o, name: name(sets[o.i].st, o.v && o.v), w: o.w, d: o.d, l: o.l, pts: (o.w * 3 + o.d) / o.n, gd: o.gd / o.n })).map(x => Object.assign(x, { sc: x.pts + 0.35 * x.gd })).sort((a, c) => c.sc - a.sc);
      const top = rows[0], st = sets[top.o.i].st, v = top.o.v || [st.a, st.m, st.d];
      State.setFormation(st.form); d.tactics = { a: v[0], m: v[1], d: v[2], trait: st.t }; d.autoCoach = true; d.tacMode = 'classic'; State.save();
      top.best = true; AUTO.prev = snap; AUTO.res = { rows: rows.slice(0, 14), title: name(st, v) + ' (' + State.FORMS[st.form].name + ')' }; AUTO.running = false;
      RUT.Staff.note('Auto setup chose ' + AUTO.res.title); render(); toast('Auto setup done: ' + AUTO.res.title, 'good');
    };
    const step = () => {
      if (q >= jobs.length) {
        if (stage === 1) {
          stage = 2; const rows = [...res.values()].map(o => ({ o, sc: (o.w * 3 + o.d) / o.n + 0.35 * o.gd / o.n })).sort((a, c) => c.sc - a.sc), bi = rows[0].o.i, st = sets[bi].st;
          const V = [[2, 2, 2], [3, 2, 1], [2, 3, 1], [1, 3, 2], [3, 1, 2], [2, 1, 3], [1, 2, 3], [2, 2, 1]].filter(v => v.join('') !== [st.a, st.m, st.d].join(''));
          V.forEach(v => { for (let k = 0; k < AUTO.n; k++) jobs.push({ i: bi, k, v }); }); AUTO.prog = q + '/' + jobs.length;
          return setTimeout(step, 10);
        }
        return fin();
      }
      const j = jobs[q], x = sets[j.i], v = j.v || [x.st.a, x.st.m, x.st.d];
      const home = { name: d.clubName, short: 'RFC', cards: x.cards }, spec = Engine.tacSpec({ a: v[0], m: v[1], d: v[2], trait: x.st.t, form: x.st.form });
      try { rec(j, Engine.simulate(home, opps[j.k], { halfSeconds: AUTO.half, styles: [spec, osty[j.k]], seed: 8100 + j.k, tacGain: [CLUB_GAIN, 0], train: [tb, null] })); } catch (e) { AUTO.running = false; toast('Auto setup failed: ' + e.message, 'bad'); autoDraw(); return; }
      q++; AUTO.prog = q + '/' + jobs.length; autoDraw(); setTimeout(step, 15);
    };
    autoDraw(); setTimeout(step, 30);
  }

  /* ------------------------------ LEAGUE -------------------------------- */
  const LG = () => RUT.League;
  VIEWS.league = function () {
    const L = LG().cur(), g = D().league, rows = LG().table(), t = LG().TIERS[g.code[0]], R = LG().range(g.code), ready = D().squad.slots.every(Boolean);
    const played = Object.keys(L.me).length, my = rows.find(r => r.me);
    const next = LG().ORDER[LG().ORDER.indexOf(g.code) + 1];
    const tbl = `<table class="lg"><tr><th>#</th><th style="text-align:left">Club</th><th>OVR</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>${rows.map(r => `<tr class="${r.me ? 'me' : ''} ${r.rank <= 2 ? 'up' : ''}"><td>${r.rank}</td><td style="text-align:left">${esc(r.name)}${r.me ? ' (you)' : ''}</td><td>${r.me ? '' : Math.round(r.ovr)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table>`;
    const nx = LG().next();
    const fx = L.teams.map((tm, i) => { const res = L.me[i], isNx = i === nx;
      return `<div class="row between lg-fx"><span><b>${esc(tm.name)}</b> <span class="dim" style="font-size:7px">${Math.round(tm.ovr)} OVR · ${esc(styleName(tm.tac))}</span></span>
        ${res ? `<span class="${res[0] > res[1] ? 'good' : res[0] < res[1] ? 'bad' : 'gold'}">${res[0]} - ${res[1]}</span>`
          : isNx ? `<span><span class="gold" style="font-size:7px">NEXT</span> <button class="btn sm y" data-act="lg-play" data-i="${i}" data-mode="play" ${ready ? '' : 'disabled'}>Play</button> <button class="btn sm c" data-act="lg-play" data-i="${i}" data-mode="watch" ${ready ? '' : 'disabled'}>Watch</button></span>`
          : '<span class="dim">-</span>'}</div>`; }).join('');
    return `<h2>League ${esc(g.code)} <span class="dim" style="font-size:9px">season ${g.season}${g.titles ? ' · A1 top-2 finishes: ' + g.titles : ''}</span></h2>
      <div class="row mb">${LG().ORDER.map(c => `<span class="btn sm ${c === g.code ? 'y' : ''}" style="pointer-events:none;opacity:${LG().ORDER.indexOf(c) <= LG().ORDER.indexOf(g.code) ? 1 : 0.45}">${c}</span>`).join('')}</div>
      <div class="grid cols-2"><div class="px"><h3>Table</h3>${tbl}
        <p class="dim" style="font-size:7px;line-height:1.9">${esc(t.name)} · clubs rated ${Math.round(R.lo)}-${Math.round(R.hi)} OVR · win +3, draw +1, loss -3, plus 1 point per goal of goal difference · top 2 ${next ? 'move up to ' + next : 'stay at the top'}</p></div>
      <div class="px"><h3>Fixtures (${played}/${L.teams.length})</h3>${fx}
        ${L.done ? `<div class="mt"><p class="${L.rank <= 2 ? 'good' : 'bad'}">Season over: you finished ${L.rank}${L.rank === 1 ? 'st' : L.rank === 2 ? 'nd' : L.rank === 3 ? 'rd' : 'th'}${L.rank <= 2 ? ' - promoted!' : ' - not enough for promotion.'}</p><button class="btn y" data-act="lg-next">${L.rank <= 2 ? (next ? 'Move up to ' + next : 'Claim reward') : 'Start a new season'}</button></div>` : ''}
        ${ready ? '' : '<p class="bad">Your XI needs 11 players. Go to Squad → Auto-build.</p>'}
        ${LG().playoff() ? (po => `<div class="mt px"><h3>Promotion playoff</h3><p class="dim" style="font-size:7px;line-height:1.9">${po.top5 ? `Skip a full A1 season: play one knockout match against the strongest League A1 team. Win and the Top 5 Leagues are unlocked. It costs ${fmt(po.cost)} coins win or lose, and your League season carries on.` : `Skip the table: play one knockout match against a League ${po.next} club. Win and you jump straight to ${po.next}. It costs ${fmt(po.cost)} coins win or lose (League B's costs more), and your current ${esc(g.code)} season is dropped.`}</p><button class="btn y" data-act="lg-po-ask" ${ready ? '' : 'disabled'}>Play for ${po.top5 ? 'the Top 5' : po.next} (${fmt(po.cost)})</button></div>`)(LG().playoff()) : ''}
        <p class="dim" style="font-size:7px;line-height:1.9">Every club has its own players and tactic, and the game draws your next opponent at random. League matches use your Club tactic and the half length from Kick Off. This league pays ${fmt(t.win)} per win and ${fmt(t.goal)} per goal you score. Quitting a match counts as a DNF and the fixture stays open.</p></div></div>`;
  };
  function playoffMatch() {
    const r = LG().startPlayoff(); if (!r) { toast('Not enough coins for the playoff', 'bad'); return; }
    updateHeader();
    const st = D(), from = st.league.code, home = { name: st.clubName, short: 'RFC', cards: State.matchCards() }, styles = [myTac(), r.tac];
    const done = res => finishMatch(res, r.away, { mult: 1, q: { mode: 'playoff', code: r.code }, coins: () => 0, after: x => {
      if (!x.won) return '<p class="bad">Playoff lost: you stay where you are. The fee is gone.</p>';
      const msg = LG().promote(r.code); if (msg) { if (r.code !== 'TOP5') RUT.Quests.event('promo', { code: from }); return r.code === 'TOP5' ? `<p class="good">${esc(msg)} Open League → Top 5 Leagues.</p>` : `<p class="good">${esc(msg)} Open League to start your new season.</p>`; }
      return ''; } });
    runMatch({ tag: 'Playoff', home, away: r.away, humans: [0], knockout: true, styles, onEnd: done, onQuit: quitMatch });
  }
  function leagueMatch(i, mode) {
    const st = D(), L = LG().cur(), tm = L.teams[i]; if (!tm || L.me[i] || L.done || i !== LG().next()) return;
    const home = { name: st.clubName, short: 'RFC', cards: State.matchCards() }, away = LG().opponent(i), styles = [myTac(), tm.tac];
    const code = D().league.code;
    const done = res => finishMatch(res, away, { mult: 1, q: { mode: 'league', code }, coins: r => LG().payout(r.score[0], r.score[1]), after: r => {
      const o = LG().record(i, r.score[0], r.score[1]); if (!o || !o.finished) return '';
      if (o.up) RUT.Quests.event('promo', { code });
      const unlock = code === 'A1' && !D().league.a1note ? (D().league.a1note = 1, '<p class="gold">League A1 finished: the Top 5 Leagues are unlocked! Open League → Top 5 Leagues.</p>') : '';
      return `<p class="${o.up ? 'good' : 'bad'}">Season over: ${o.rank}${o.rank === 1 ? 'st' : o.rank === 2 ? 'nd' : o.rank === 3 ? 'rd' : 'th'} place${o.up ? ' - you go up!' : '.'} Open League to continue.</p>${unlock}`; } });
    runMatch({ tag: 'League ' + code, home, away, humans: mode === 'play' ? [0] : [], knockout: false, styles, onEnd: done,
      onQuit: quitMatch });
  }


  /* --------------------------- TOP 5 LEAGUES ---------------------------- */
  const T5 = () => RUT.Top5;
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  /* v201 (JODIO): Top 5 Champions League tab and the Ballon d'Or gallery */
  function uclHTML() {
    const C = T5().ucl, U = C.get(), K = C.UCL, ready = D().squad.slots.every(Boolean), fmtS = st => C.STAGE_NAME[st] || st;
    const head = `<p class="dim" style="font-size:8px;line-height:1.9">The 35 strongest clubs of the Top 5 leagues and you, in the new Champions League format: one 36-club league phase (8 matches against 2 clubs from each of 4 pots), top 8 straight into the round of 16, 9th-24th a knockout play-off, 25th-36th out. Then round of 16, quarter-finals, semi-finals and the final (one match, a draw goes to penalties). ${K.half} s halves on the biggest pitch, at most ${K.perDay} of your matches a day, and the clubs play 50% smarter than in the leagues. Wins pay ${fmt(K.win)}, draws ${fmt(K.draw)}, goals ${fmt(K.goal)}; reaching each round pays more, up to ${fmt(K.stage.win)} for the trophy.</p>`;
    if (!U) return `<div class="px"><h3>Champions League</h3>${head}<p class="gold" style="font-size:8px">Titles: ${T5().root().uclTitles || 0}</p><button class="btn y" data-act="ucl-start">Enter the Champions League</button></div>`;
    const nx = C.next(), left = U.day.d === new Date().toISOString().slice(0, 10) ? K.perDay - U.day.n : K.perDay, rows = C.table();
    const tbl = `<table class="lg"><tr><th>#</th><th style="text-align:left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>${rows.map(r => `<tr class="${r.me ? 'me' : ''} ${r.rank <= 8 ? 'up' : r.rank > 24 ? 'dn' : ''}"><td>${r.rank}</td><td style="text-align:left">${esc(r.name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table>`;
    const fx = U.opp.map((ci, k) => `<div class="row between lg-fx"><span>MD ${k + 1} · <b>${esc(U.clubs[ci].name)}</b> <span class="dim" style="font-size:7px">${Math.round(U.clubs[ci].ovr * 10) / 10} OVR</span></span><span>${U.res[k] ? `<span class="${U.res[k][0] > U.res[k][1] ? 'good' : U.res[k][0] < U.res[k][1] ? 'bad' : 'gold'}">${U.res[k][0]}-${U.res[k][1]}</span>` : k === U.md && U.stage === 'lp' ? '<span class="gold">NEXT</span>' : '-'}</span></div>`).join('');
    const ko = U.ko ? ['po', 'r16', 'qf', 'sf', 'f'].filter(r => U.ko.rounds[r]).map(r => `<div class="mt"><b class="gold" style="font-size:8px">${fmtS(r)}</b>${U.ko.rounds[r].map(([a, b], k) => { const nm = id => (id === -1 ? D().clubName : id == null ? '?' : U.clubs[id].name), w = U.ko.win && U.ko.win[r] ? U.ko.win[r][k] : undefined;
        return `<div class="row between" style="font-size:8px;margin:2px 0;${a === -1 || b === -1 ? 'color:var(--gold,#ffd24a)' : ''}"><span class="${w === a ? 'good' : ''}">${esc(nm(a))}</span><span class="dim">v</span><span class="${w === b ? 'good' : ''}" style="text-align:right">${esc(nm(b))}</span></div>`; }).join('')}</div>`).join('') : '';
    const status = U.won ? `<p class="good">Champions of Europe! +${fmt(K.stage.win)} coins.</p>` : U.out ? `<p class="bad">Knocked out${U.ko && U.ko.rank > 24 ? ` (${ord(U.ko.rank)} in the league phase)` : ''}.</p>` : '';
    const play = nx ? `<div class="mt"><p style="font-size:9px"><b>Next: ${fmtS(nx.stage)}${nx.stage === 'lp' ? ' matchday ' + (nx.md + 1) + '/8' : ''}</b> v <b>${esc(nx.club.name)}</b> <span class="dim">${Math.round(nx.club.ovr * 10) / 10} OVR</span></p>
      <p class="dim" style="font-size:8px">Matches left today: <b class="${left > 0 ? 'good' : 'bad'}">${Math.max(0, left)}/${K.perDay}</b></p>
      <button class="btn y" data-act="ucl-play" data-mode="play" ${ready && left > 0 ? '' : 'disabled'}>Play</button> <button class="btn c" data-act="ucl-play" data-mode="watch" ${ready && left > 0 ? '' : 'disabled'}>Watch (AI plays)</button>${ready ? '' : '<p class="bad">Your XI needs 11 players.</p>'}</div>` : '';
    return `<div class="grid cols-2"><div class="px"><h3>Champions League <span class="dim" style="font-size:8px">season ${U.season} · ${fmtS(U.stage === 'out' ? 'lp' : U.stage)} · earned ${fmt(U.earned)}</span></h3>${status}${play}
        <h3 class="mt">League phase</h3>${fx}${ko}
        ${U.won || U.out ? '<button class="btn y mt" data-act="ucl-start">New Champions League season</button>' : '<button class="btn sm mt" data-act="ucl-quit">Leave this season</button>'}</div>
      <div class="px"><h3>League phase table</h3>${tbl}<p class="dim" style="font-size:7px">1-8 (green) round of 16 · 9-24 play-off · 25-36 (red) out</p></div></div>`;
  }
  VIEWS.top5 = function () {
    const base = top5View();
    if (!T5().unlocked()) return base;
    const tab = App.t5tab || 'lg';
    return `<div class="row mb"><button class="btn sm ${tab === 'lg' ? 'y' : ''}" data-act="t5-tab" data-t="lg">Leagues</button><button class="btn sm ${tab === 'ucl' ? 'y' : ''}" data-act="t5-tab" data-t="ucl">Champions League</button></div>` + (tab === 'ucl' ? uclHTML() : base);
  };
  VIEWS.bdorgal = function () {
    const all = RUT.DB.all.filter(c => c.promo === 'bdor' || c.promo === 'award').sort((a, b) => (a.promo === 'award') - (b.promo === 'award') || (a.bdorRank || 99) - (b.bdorRank || 99) || b.rating - a.rating);
    const sec = (title, list) => `<div class="px mb"><h3>${title} <span class="dim" style="font-size:8px">${list.length} cards</span></h3><div class="grid cols-4">${list.map(c => `<div style="text-align:center">${cardHTML(c, { mini: true })}<div style="font-size:8px;line-height:1.7;margin-top:4px"><b>${esc(c.name)}</b><br><span class="dim">${c.promo === 'award' ? esc(c.award || '') : c.bdorRank ? ord(c.bdorRank) + ' in the Ballon d\'Or' : ''}</span></div></div>`).join('')}</div></div>`;
    return `<h2>Ballon d'Or 2026</h2><p class="dim" style="font-size:8px;line-height:1.9">Every Ballon d'Or card in the game, to look at. They can't be bought here or on the market: they only come from the Ballon d'Or packs in the Store, and they are untradeable.</p>
      ${sec('Special awards', all.filter(c => c.promo === 'award'))}${sec('Ballon d\'Or nominees', all.filter(c => c.promo === 'bdor'))}`;
  };
  function top5View() {
    const T = T5(), lgNow = D().league ? D().league.code : 'C3';
    if (!T.unlocked()) return `<h2>Top 5 Leagues</h2><div class="px"><h3>Locked</h3>
      <p>Finish a League A1 season to unlock LaLiga, the Premier League, Serie A, Ligue 1 and the Bundesliga. Each has 20 real-life based clubs with 80-90 rated players and a four times smarter AI.</p>
      <p class="dim">You are in League ${esc(lgNow)}.</p><p class="dim" style="font-size:8px">The Top 5 Champions League opens here at the same time.</p><button class="btn y" data-act="nav" data-v="league">Go to League</button></div>`;
    const R = T.root(), L = R.cur, ready = D().squad.slots.every(Boolean);
    if (!L) {
      return `<h2>Top 5 Leagues <span class="dim" style="font-size:9px">season ${R.season}</span></h2>
        <p class="dim" style="font-size:8px;line-height:1.9">Pick a league. You join as the 21st club: 40 matches (home and away against each of the 20 clubs), real football points (win 3, draw 1), every club plays with a 50% smarter brain. Wins pay ${fmt(T.T5.win)}, draws ${fmt(T.T5.draw)}, every goal ${fmt(T.T5.goal)}, and the final place pays up to ${fmt(T.seasonReward(1).coins)} plus packs.</p>
        <div class="grid cols-3">${T.ORDER.map(lg => { const def = T.LGS[lg], top = def.teams.slice(0, 3).map(t => t[0]).join(', '), ovr = def.teams.map(t => t[1]);
          return `<div class="px"><h3>${esc(def.name)}</h3><p class="dim" style="font-size:8px;line-height:1.9">20 clubs · ${Math.min(...ovr)}-${Math.max(...ovr)} OVR<br>${esc(top)} ...</p>
            <p class="gold" style="font-size:8px">Titles: ${(R.titles && R.titles[lg]) || 0}</p><button class="btn y" data-act="top5-pick" data-lg="${lg}">Play ${esc(def.name)}</button></div>`; }).join('')}</div>`;
    }
    const def = T.LGS[L.lg], rows = T.table(), nx = T.next(), played = T.played(), total = T.total();
    const tbl = `<table class="lg"><tr><th>#</th><th style="text-align:left">Club</th><th>OVR</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>${rows.map(r => `<tr class="${r.me ? 'me' : ''} ${r.rank <= 4 ? 'up' : r.rank >= 19 ? 'dn' : ''}"><td>${r.rank}</td><td style="text-align:left">${r.me ? esc(r.name) + ' (you)' : `<a href="#" data-act="t5-squad" data-n="${esc(r.name)}">${esc(r.name)}</a>`}</td><td>${r.me ? '' : Math.round(r.ovr * 10) / 10}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</table>`;
    const resCell = res => `<span class="${res[0] > res[1] ? 'good' : res[0] < res[1] ? 'bad' : 'gold'}">${res[0]}-${res[1]}</span>`;
    const fx = L.teams.map((tm, i) => { const cells = L.me[i].map((res, leg) => res ? resCell(res)
        : nx && nx[0] === i && nx[1] === leg ? `<span><span class="gold" style="font-size:7px">NEXT · MD ${nx[2] != null ? nx[2] + 1 : ''}</span> <button class="btn sm y" data-act="t5-play" data-i="${i}" data-leg="${leg}" data-mode="play" ${ready ? '' : 'disabled'}>Play</button> <button class="btn sm c" data-act="t5-play" data-i="${i}" data-leg="${leg}" data-mode="watch" ${ready ? '' : 'disabled'}>Watch</button></span>`
        : '<span class="dim">-</span>');
      return `<div class="row between lg-fx"><span><b>${esc(tm.name)}</b> <span class="dim" style="font-size:7px">${Math.round((L.rounds ? T.strength(tm.name) : tm.ovr) * 10) / 10} OVR · ${esc(styleName(tm.tac))}</span></span><span class="row" style="gap:10px">${cells.join('')}</span></div>`; }).join('');
    const lr = T.lastRound(), news = T.news().slice(0, 14);
    const lastHTML = lr ? `<div class="px"><h3>Matchday ${lr.r + 1} results</h3>${lr.res.map(x => `<div class="row between" style="font-size:8px;margin:3px 0;${x.me ? 'color:var(--gold,#ffd24a)' : ''}"><span>${esc(x.h)}</span><b>${x.s[0]} - ${x.s[1]}</b><span style="text-align:right">${esc(x.a)}</span></div>`).join('')}</div>` : '';
    const newsHTML = `<div class="px"><h3>Transfer news</h3>${news.length ? news.map(n => `<div style="font-size:8px;margin:4px 0;line-height:1.6"><span class="dim">${n.w}</span> <b>${esc(n.n)}</b> <span class="dim">${n.pos} ${n.ovr}</span><br>${esc(n.f)} → <b>${esc(n.t)}</b> <span class="gold">€${n.fee}M</span></div>`).join('') : '<p class="dim" style="font-size:8px">No deals yet. The summer window opens when a season starts, the winter window halfway through.</p>'}</div>`;
    const rw = L.done ? T.seasonReward(L.rank) : null;
    return `<h2>${esc(def.name)} <span class="dim" style="font-size:9px">season ${R.season} · titles: ${(R.titles && R.titles[L.lg]) || 0}${L.rounds ? ' · matchday ' + Math.min(L.rounds.length, L.round + 1) + '/' + L.rounds.length : ''}</span></h2>
      <div class="grid cols-2"><div class="px"><h3>Table</h3>${tbl}
        <p class="dim" style="font-size:7px;line-height:1.9">Top 4 (green) Champions League · bottom 3 (red) relegation zone, you stay up · win 3, draw 1, loss 0, goal difference breaks ties. Click a club to see its squad.</p></div>
      <div class="px"><h3>Fixtures (${played}/${total})</h3>${fx}
        ${L.done ? `<div class="mt"><p class="${L.rank <= 4 ? 'good' : 'gold'}">Season over: you finished ${ord(L.rank)} (${esc(rw.label)}). Reward: ${fmt(rw.coins)} coins${Object.keys(rw.packs).length ? ' + ' + RUT.Quests.packText(rw.packs) : ''}.</p><button class="btn y" data-act="t5-next">Claim and pick a league</button></div>` : ''}
        ${played === 0 && !L.done ? '<button class="btn sm" data-act="t5-change">Change league</button>' : ''}
        ${ready ? '' : '<p class="bad">Your XI needs 11 players. Go to Squad → Auto-build.</p>'}
        <p class="dim" style="font-size:7px;line-height:1.9">Each matchday the other clubs play at the same time as you: their scores tick up on the match screen and the table updates when your match ends. Clubs trade players in a summer and a winter window, so their squads change. Wins pay ${fmt(T.T5.win)}, draws ${fmt(T.T5.draw)}, every goal ${fmt(T.T5.goal)}; every goal you concede costs ${fmt(T5_GOAL_FEE)}. Quitting is a 3-0 defeat on the table and costs ${fmt(QUIT_FEE)}.</p></div></div>
      <div class="grid cols-2 mt">${lastHTML}${newsHTML}</div>`;
  }
  function uclMatch(mode) {
    const C = T5().ucl, nx = C.next(); if (!nx) return;
    if (!C.begin()) { toast('Champions League: ' + C.UCL.perDay + ' matches a day. Come back tomorrow.', 'bad'); return; }
    const st = D(), home = { name: st.clubName, short: 'RFC', cards: State.matchCards() }, away = C.opponent(nx.i), styles = [myTac(), withShape(nx.club.tac)];
    const done = res => finishMatch(res, away, { mult: 1, q: { mode: 'ucl' }, coins: r => C.payout(r.score[0], r.score[1]), after: r => {
      rivLearn(r);
      const o = C.record(r.score[0], r.score[1], r.pens ? (r.pens[0] > r.pens[1] ? 0 : 1) : null); if (!o) return ''; updateHeader();
      if (o.champion) return `<p class="good">CHAMPIONS OF EUROPE! +${fmt(o.bonus)} coins.</p>`;
      if (o.out || o.outNow) return `<p class="bad">${o.outNow ? 'League phase over: ' + ord(o.rank) + '. You are out of the Champions League.' : 'Knocked out of the Champions League.'}</p>`;
      if (o.drawn) return `<p class="good">League phase over: ${ord(o.rank)}. ${o.rank <= 8 ? 'Straight into the round of 16' : 'Into the knockout play-off'} (+${fmt(o.bonus)} coins).</p>`;
      return o.bonus ? `<p class="good">Through to the ${C.STAGE_NAME[C.get().stage]} (+${fmt(o.bonus)} coins).</p>` : ''; } });
    runMatch({ tag: 'Champions League · ' + C.STAGE_NAME[nx.stage], home, away, humans: mode === 'play' ? [0] : [], knockout: !!nx.ko, styles, onEnd: done, pitch: 'colossal', halfSeconds: C.UCL.half,
      onQuit: () => { C.record(0, 3, 1); quitMatch(); toast('You quit: recorded as a 3-0 defeat.', 'bad'); } });
  }
  const T5_GOAL_FEE = 15000;
  function top5Match(i, leg, mode) {
    const st = D(), T = T5(), L = T.cur(), tm = L && L.teams[i], nx = T.next(); if (!tm || L.done || !nx || nx[0] !== i || nx[1] !== leg) return;
    const live = T.begin();                                              // the other clubs' matches of this matchday, played out while yours runs
    const home = { name: st.clubName, short: 'RFC', cards: State.matchCards() }, away = T.opponent(i), styles = [myTac(), withShape(tm.tac)], lg = L.lg;
    let goalFees = 0, conceded = 0;
    const done = res => finishMatch(res, away, { mult: 1, q: { mode: 'top5', lg }, coins: r => T.payout(r.score[0], r.score[1]), fees: () => goalFees, after: r => {
      try { T.learnFrom(r.scout); } catch (e) { /* the clubs just do not remember this one */ }
      const o = T.record(i, leg, r.score[0], r.score[1]); if (!o || !o.finished) return '';
      RUT.Quests.event('t5end', { lg, rank: o.rank });
      return `<p class="${o.rank <= 4 ? 'good' : 'gold'}">Season over: ${ord(o.rank)} place. Open Top 5 Leagues to claim your reward.</p>`; } });
    runMatch({ tag: 'Top 5 Leagues', home, away, humans: mode === 'play' ? [0] : [], knockout: false, styles, onEnd: done, pitch: 'colossal', halfSeconds: 150, live,
      onGoal: team => { if (team !== 1) return; conceded++; const t = chargeCoins(T5_GOAL_FEE, 'Goal conceded'); goalFees += t; updateHeader(); if (t) toast('Goal conceded: -' + fmt(t) + ' coins', 'bad'); },
      onQuit: () => { T.forfeit(i, leg, conceded); quitMatch(); toast('You quit: recorded as a 3-0 defeat.', 'bad'); } });
  }

  /* ------------------------------ QUESTS -------------------------------- */
  VIEWS.quests = function () {
    const Q = RUT.Quests, tab = App.questTab || 'all', all = Q.list(), ready = all.filter(q => q.ready).length;
    const shown = all.filter(q => tab === 'all' || q.cat === tab);
    const rank = q => (q.ready ? 0 : q.claimed ? 3 : q.locked ? 2 : 1);
    shown.sort((a, b) => rank(a) - rank(b) || (a.cat === 'league' && b.cat === 'league' ? (a.tier || 0) - (b.tier || 0) : 0) || Object.keys(Q.DIFF).indexOf(a.diff) - Object.keys(Q.DIFF).indexOf(b.diff));
    const done = all.filter(q => q.claimed || q.p >= q.goal).length;
    const card = q => { const d = Q.DIFF[q.diff], pc = Math.round(100 * q.p / q.goal), pk = q.reward.packs ? ' + ' + Q.packText(q.reward.packs) : '';
      return `<div class="qcard ${q.ready ? 'ready' : ''} ${q.claimed ? 'claimed' : ''} ${q.locked ? 'locked' : ''}">
        <div class="row between"><b>${esc(q.title)}</b><span class="qdiff" style="background:${d.color}">${d.name}</span></div>
        <div class="qbar"><i style="width:${pc}%"></i></div>
        <div class="row between"><span class="dim" style="font-size:8px">${q.locked ? esc(q.lock) : fmt(q.p) + ' / ' + fmt(q.goal)}</span><span class="gold" style="font-size:8px">+${fmt(q.reward.coins)}${esc(pk)}</span></div>
        <div style="margin-top:6px">${q.claimed ? '<span class="good" style="font-size:8px">Claimed' + (q.daily ? ' (back tomorrow)' : '') + '</span>' : q.ready ? `<button class="btn sm y" data-act="q-claim" data-id="${q.id}">Claim</button>` : ''}</div></div>`; };
    return `<h2>Quests <span class="dim" style="font-size:9px">${done}/${all.length} done</span></h2>
      <div class="row mb" style="flex-wrap:wrap;gap:6px">${Q.CATS.map(([k, l]) => `<button class="btn sm ${tab === k ? 'y' : ''}" data-act="q-tab" data-t="${k}">${l}</button>`).join('')}
        <span style="margin-left:auto">${ready ? `<button class="btn y" data-act="q-claimall">Claim all (${ready})</button>` : '<span class="dim" style="font-size:8px">Nothing to claim</span>'}</span></div>
      <p class="dim" style="font-size:7px;line-height:1.9">Easy quests pay a little, hard ones pay a lot, and league quests pay more the higher the league. Daily quests reset at midnight and pay more the higher your league (x${Q.dailyMult()} now). Leagues you have already climbed out of count as done.</p>
      <div class="grid cols-3">${shown.map(card).join('')}</div>`;
  };

  /** Full-screen match overlay shared by Kick Off and Casual: canvas, camera / speed / pause / quit, touch pad for player 1. */
  /* v113: the in-match tactics panel */
  const TAC_BTNS = [['attack', 'Attack more', '1'], ['defend', 'Defend more', '2'], ['pressUp', 'Press higher', '3'], ['pressDown', 'Press lower', '4'], ['lineUp', 'Line up', '5'], ['lineDown', 'Line down', '6'], ['wide', 'Play wider', '7'], ['narrow', 'Play narrower', '8'], ['direct', 'More direct', '9'], ['short', 'Short passing', ''], ['counter', 'Counter', ''], ['reset', 'Reset', '']];
  const tacPopHTML = () => `<div class="tac-pop" hidden><div class="tp-h">TACTICS <small></small></div><div class="tp-g">${TAC_BTNS.map(([k, l, h]) => `<button class="btn sm" data-mact="tq" data-k="${k}">${h ? '<span class="kbd">' + h + '</span>' : ''}${l}</button>`).join('')}</div><div class="tp-s dim"></div></div>`;
  function tacPopFill(tp, m, team, msg) {
    const n = (m.qn && m.qn[team]) || {}, names = { att: 'Attack', prs: 'Press', ln: 'Line', wd: 'Width', dr: 'Directness', cn: 'Counter' };
    const st = Object.keys(n).filter(k => n[k]).map(k => names[k] + ' ' + (n[k] > 0 ? '+' : '') + n[k]).join(' · ');
    tp.querySelector('.tp-s').textContent = msg || (st ? 'Now: ' + st : 'Your starting tactic. Each press moves it one step (two at most).');
    const log = (m.autoLog || []).filter(x => x.team === team).slice(-1)[0];
    tp.querySelector('small').textContent = false ? (log ? '· coach: ' + log.label.toLowerCase() : '· auto coach on') : '';
  }

  /* v136 (JODIO): in a knockout match the human takes the penalty shootout kicks: pick a corner, stop the timing bar; as the keeper pick the dive. The AI side's kicks use the old odds. */
  function askPens(m, wrap, hu, done) {
    const pstat = p => Math.min(99, p.card.sub.penalties + (p.tr.has('pen') ? 25 : 0));
    const sorted = t => m.players.filter(p => p.team === t && !p.isGK).sort((a, b) => pstat(b) - pstat(a));
    const takers = [sorted(0), sorted(1)], gks = [0, 1].map(t => m.players.find(p => p.team === t && p.isGK));
    const sc = [0, 0], kicks = [[], []], box = document.createElement('div'); box.className = 'pk'; wrap.appendChild(box);
    const sleep = ms => new Promise(r => setTimeout(r, ms)), alive = () => wrap.isConnected, rnd = Math.random;
    const tally = () => [0, 1].map(t => `<div class="pk-row ${t === hu ? 'me' : ''}"><b>${esc(m.teams[t].name)}</b><span class="pk-dots">${Array.from({ length: Math.max(5, kicks[t].length) }, (_, i) => `<i class="${kicks[t][i] == null ? '' : kicks[t][i] ? 'g' : 'x'}"></i>`).join('')}</span><em>${sc[t]}</em></div>`).join('');
    const show = (title, body) => { box.innerHTML = `<div class="pk-in"><div class="pk-h">PENALTY SHOOTOUT</div>${tally()}<div class="pk-t">${title}</div>${body}</div>`; };
    const goal = (inner) => `<div class="pk-goal">${inner}</div>`;
    const pickZone = () => new Promise(res => { show('Pick your corner', goal([0, 1].map(r => [0, 1, 2].map(c => `<button class="pk-z" data-z="${c}${r}">${r ? 'LOW' : 'HIGH'}</button>`).join('')).join(''))); box.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => res(b.dataset.z))); });
    const pickDive = () => new Promise(res => { show('Pick the keeper dive', goal(['LEFT', 'MIDDLE', 'RIGHT'].map((l, c) => `<button class="pk-z dive" data-d="${c}">${l}</button>`).join(''))); box.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => res(+b.dataset.d))); });
    const timing = (zone) => new Promise(res => {
      show('Stop the bar in the green', goal(`<div class="pk-aim c${zone[0]} r${zone[1]}"></div>`) + '<div class="pk-bar"><i class="pk-g"></i><u></u></div><button class="btn y pk-go">SHOOT</button>');
      const mk = box.querySelector('.pk-bar u'), t0 = performance.now(); let x = 0, done0 = false;
      const tick = () => { if (done0 || !alive()) return; const ph = ((performance.now() - t0) / 1150) % 2; x = ph < 1 ? ph : 2 - ph; mk.style.left = x * 100 + '%'; requestAnimationFrame(tick); };
      const stop = () => { if (done0) return; done0 = true; document.removeEventListener('keydown', key, true); res(x); };
      const key = e => { if (['z', 'x', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); stop(); } };
      document.addEventListener('keydown', key, true); box.querySelector('.pk-go').addEventListener('click', stop); requestAnimationFrame(tick);
    });
    /* v181 (JODIO: "make penalty animation"): each kick plays out as a short FC-style scene from behind the taker: run-up, strike, the keeper's dive, the net */
    const PA = RUT.PixelArt, lookOf = p => p._look || PA.lookFor(p.card.name, m.teams[p.team].kit, p.isGK, p.team, { club: m.teams[p.team].club });
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const scene = (k, g, txt, zone, dive) => new Promise(res => {
      show(`<span id="pk-cap">${esc(k.card.name)}</span>`, '<canvas class="pk-cv" width="480" height="270" style="width:min(90vw,480px);image-rendering:pixelated;border:3px solid #000"></canvas>');
      const cv = box.querySelector('.pk-cv'), x = cv.getContext('2d'), W = 480, H = 270, gl = 130, gr = 350, gt = 52, gb = 150, t0 = performance.now();
      const col = +zone[0], row = +zone[1], miss = txt === 'MISSED', saved = txt === 'SAVED';
      const tx = gl + 30 + col * 80 + (miss ? (col - 1 || 1) * 70 : 0), ty = (row ? gb - 18 : gt + 18) - (miss && col === 1 ? 45 : 0);
      const kx = W / 2, kL = lookOf(k), gL = g ? lookOf(g) : null;
      const spr = (L, a, t, yaw, sc, px, py, flip) => { const c = PA.sprite(L, a, t, yaw, sc); x.save(); if (flip) { x.translate(px * 2, 0); x.scale(-1, 1); } x.drawImage(c, Math.round(px - c.ox), Math.round(py - c.oy)); x.restore(); };
      const frame = now => {
        if (!alive()) return res();
        const T = (now - t0) / 1000;
        x.fillStyle = '#2f7d32'; x.fillRect(0, 0, W, H); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#358a38' : '#2f7d32'; x.fillRect(0, 150 + i * 15, W, 15); }
        x.fillStyle = '#1c2a1c'; x.fillRect(0, 0, W, 40); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(gl, gt, gr - gl, gb - gt);
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1; for (let i = gl; i <= gr; i += 10) { x.beginPath(); x.moveTo(i, gt); x.lineTo(i, gb); x.stroke(); } for (let j = gt; j <= gb; j += 10) { x.beginPath(); x.moveTo(gl, j); x.lineTo(gr, j); x.stroke(); }
        x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(40, gb); x.lineTo(W - 40, gb); x.stroke(); x.lineWidth = 5; x.beginPath(); x.moveTo(gl, gb); x.lineTo(gl, gt); x.lineTo(gr, gt); x.lineTo(gr, gb); x.stroke();
        const kick = 0.75, bt = clamp((T - kick) / 0.32, 0, 1);
        // keeper: set, then dives as the ball is struck
        if (gL) { const dv = T < kick - 0.05 ? 0 : clamp((T - kick + 0.05) / 0.45, 0, 1), side = dive - 1, gx = W / 2 + side * 95 * Math.min(1, dv * 1.4);
          if (side === 0 || dv === 0) spr(gL, 'gkready', T % 1, 0, 1.25, gx, gb + 4, false); else spr(gL, row ? 'dive_lo' : 'dive_hi', dv, Math.PI / 2, 1.25, gx, gb + 4, side < 0); }
        // ball: on the spot, then flies (into the net, off the keeper, or wide / over)
        let bx = kx, by = 212, br = 6;
        if (bt > 0) { const u = saved ? Math.min(bt, 0.8) / 0.8 : bt; bx = kx + (tx - kx) * u; by = 212 + (ty - 212) * u - Math.sin(u * Math.PI) * 18; br = 6 - 3 * u;
          if (saved && bt >= 0.8) { const v = (T - kick - 0.256) * 3; bx = tx - (tx - W / 2) * 0.1 + (col - 1) * 40 * v; by = ty + 60 * v; } }
        x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(bx, Math.max(by + br, bt > 0 ? 212 - 60 * bt : 212) + 2, br, br * 0.4, 0, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill(); x.fillStyle = '#1c2f80'; x.beginPath(); x.arc(bx - br * 0.3, by - br * 0.2, br * 0.4, 0, 7); x.fill();
        // taker from behind: run-up, strike, follow-through
        const run = clamp(T / kick, 0, 1), px = kx - 28 + 18 * run, py = 262 - 44 * run;
        if (T < kick - 0.12) spr(kL, 'jog', (T * 1.8) % 1, Math.PI + 0.35, 1.9, px, py, false); else spr(kL, 'shot', clamp(0.3 + (T - kick + 0.12) / 0.5, 0, 1), Math.PI + 0.35, 1.9, px, py, false);
        if (T > kick + 0.45) { x.font = '900 34px Barlow Condensed, sans-serif'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = '#000'; x.fillStyle = txt === 'GOAL!' ? '#7dff7a' : '#ff6a6a'; x.strokeText(txt, W / 2, 30 + 6 * Math.max(0, 1 - (T - kick - 0.45) * 5)); x.fillText(txt, W / 2, 30 + 6 * Math.max(0, 1 - (T - kick - 0.45) * 5)); }
        if (T < 2.3) requestAnimationFrame(frame); else res();
      };
      requestAnimationFrame(frame);
    });
    let curK = null, curG = null;
    const reveal = async (txt, cls, zone, dive) => { if (curK && PA) { try { await scene(curK, curG, txt, zone, dive); return; } catch (e) { /* fall back to the plain picture */ } } show(`<span class="${cls}">${txt}</span>`, goal(`<div class="pk-keeper c${dive}"></div><div class="pk-ball c${zone[0]} r${zone[1]}"></div>`)); await sleep(1500); };
    return (async () => {
      for (let r = 0; r < 30 && alive(); r++) {
        for (const t of [0, 1]) {
          if (!alive()) return;
          const k = takers[t][r % takers[t].length], g = gks[1 - t], pen = pstat(k), save = Math.min(0.8, Math.max(0.4, 0.6 + ((g ? g.card.sub.gkReflexes : 70) - 80) / 160));
          let ok = false, txt = '', zone = '11', dive = 1;
          if (t === hu) {
            show(`${esc(k.card.name)} steps up`, ''); await sleep(700); zone = await pickZone(); if (!alive()) return;
            const x = await timing(zone), acc = Math.max(0, Math.min(1, 1 - (Math.abs(x - 0.5) - 0.1) / 0.4));
            dive = Math.floor(rnd() * 3);
            const miss = Math.min(0.9, (1 - pen / 99) * 0.2 + (1 - acc) * 0.32 + (zone[1] === '0' ? 0.04 : 0));
            if (rnd() < miss) txt = 'MISSED'; else if (dive === +zone[0] && rnd() < save) txt = 'SAVED'; else { ok = true; txt = 'GOAL!'; }
          } else if (1 - t === hu) {
            show(`${esc(k.card.name)} will take it`, ''); await sleep(700); dive = await pickDive(); if (!alive()) return;
            const c = rnd() < 0.2 ? 1 : (rnd() < 0.5 ? 0 : 2); zone = c + '' + (rnd() < 0.5 ? 0 : 1);
            if (rnd() < Math.min(0.9, (1 - pen / 99) * 0.2 + 0.06)) txt = 'MISSED'; else if (dive === c && rnd() < save) txt = 'SAVED'; else { ok = true; txt = 'GOAL!'; }
          } else { ok = rnd() < Math.min(0.93, Math.max(0.5, 0.76 + (pen - 80) / 100 - ((g ? g.card.sub.gkReflexes : 60) - 80) / 160)); txt = ok ? 'GOAL!' : 'SAVED'; zone = Math.floor(rnd() * 3) + '' + (rnd() < 0.5 ? 0 : 1); dive = Math.floor(rnd() * 3); }
          kicks[t].push(ok); if (ok) sc[t]++; curK = k; curG = g;
          await reveal(txt, ok ? 'g' : 'x', zone, dive);
          const left = n => Math.max(0, 5 - n);
          if (r < 5 && (sc[0] + left(kicks[0].length) < sc[1] || sc[1] + left(kicks[1].length) < sc[0])) r = 99;
          if (r === 99) break;
        }
        if (r === 99) break;
        if (r >= 4 && sc[0] !== sc[1]) break;
      }
      if (!alive()) return;
      show(`${esc(m.teams[0].name)} ${sc[0]} - ${sc[1]} ${esc(m.teams[1].name)}`, ''); await sleep(1600);
      box.remove(); done({ sc, kicks });
    })();
  }

  /* v226 (JODIO: "make the pregame animation like the XI reveal and everything FC27 does"): FC-style pre-match show before kick-off.
     Match-up card with both crests, then each Starting XI revealed card by card on a pitch (team rating, formation), the players to watch,
     and a KICK OFF flash. About 11 s; any key, tap or the Skip button jumps straight to the match. Not used online or in training. */
  function preMatch(o, wrap, go) {
    const xi = t => (t && t.cards || []).filter(Boolean).slice(0, 11), H = xi(o.home), A = xi(o.away);
    if (H.length < 11 || A.length < 11) { go(); return; }
    const ovr = cs => Math.round(cs.reduce((a, c) => a + (c.rating || 0), 0) / cs.length);
    const crest = (t, side) => { const nm = String(t.name || '?'), ini = nm.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase(); return `<div class="pm-crest ${side}"><b>${esc(ini)}</b></div>`; };
    const row = c => { const p = c.position || ''; return p === 'GK' ? 0 : /^(CB|LB|RB|LWB|RWB)$/.test(p) ? 1 : /^(CDM|CM|LM|RM|CAM)$/.test(p) ? 2 : 3; };
    const lr = c => { const p = c.position || ''; return /^L/.test(p) ? -1 : /^R/.test(p) ? 1 : 0; };
    const pitch = (cs, team, tag) => {
      const rows = [[], [], [], []]; cs.forEach(c => rows[row(c)].push(c)); rows.forEach(r => r.sort((a, b) => lr(a) - lr(b)));
      const used = rows.filter(r => r.length), shape = used.slice(1).map(r => r.length).join('-');
      let k = 0;
      const lines = used.slice().reverse().map(r => `<div class="pm-line">${r.map(c => `<div class="pm-slot" style="animation-delay:${0.25 + 0.13 * (k++)}s">${cardHTML(c, { mini: true })}</div>`).join('')}</div>`).join('');
      return `<div class="pm-xi"><div class="pm-xi-head"><span class="pm-tag">${tag}</span><h2>${esc(team.name)}</h2><div class="pm-meta"><span>OVR <b>${ovr(cs)}</b></span><span>${esc(shape)}</span></div></div><div class="pm-pitch">${lines}</div></div>`;
    };
    const best = cs => cs.slice().sort((a, b) => b.rating - a.rating)[0];
    const tag = esc(o.tag || (o.knockout ? 'Cup tie' : 'Match day'));
    const scenes = [
      [1900, `<div class="pm-vs"><p class="pm-comp">${tag}</p><div class="pm-teams">${crest(o.home, 'h')}<div class="pm-name">${esc(o.home.name)}<small>OVR ${ovr(H)}</small></div><span class="pm-v">VS</span><div class="pm-name">${esc(o.away.name)}<small>OVR ${ovr(A)}</small></div>${crest(o.away, 'a')}</div></div>`],
      [3300, pitch(A, o.away, 'Starting XI · Away')],
      [3300, pitch(H, o.home, 'Starting XI · Home')],
      [2100, `<div class="pm-watch"><p class="pm-comp">Players to watch</p><div class="pm-pair"><div>${cardHTML(best(H))}<span>${esc(o.home.name)}</span></div><div>${cardHTML(best(A))}<span>${esc(o.away.name)}</span></div></div></div>`],
      [1000, `<div class="pm-ko">KICK OFF</div>`],
    ];
    const ov = document.createElement('div'); ov.className = 'pm-ov'; ov.innerHTML = `<div class="pm-stage"></div><button class="btn sm pm-skip">Skip ▸</button><div class="pm-bar"><i></i></div>`;
    wrap.appendChild(ov);
    const stage = ov.querySelector('.pm-stage'), barI = ov.querySelector('.pm-bar i'), total = scenes.reduce((a, s) => a + s[0], 0);
    let i = -1, done = false, tm = 0;
    const end = () => { if (done) return; done = true; clearTimeout(tm); window.removeEventListener('keydown', key, true); ov.classList.add('out'); setTimeout(() => ov.remove(), 350); go(); };
    const key = e => { e.preventDefault(); e.stopPropagation(); end(); };
    const next = () => { if (done) return; i++; if (i >= scenes.length) { end(); return; } stage.innerHTML = `<div class="pm-scene">${bigTxt(scenes[i][1])}</div>`;
      const sofar = scenes.slice(0, i + 1).reduce((a, s) => a + s[0], 0); barI.style.transition = `width ${scenes[i][0]}ms linear`; barI.style.width = (sofar / total * 100) + '%'; tm = setTimeout(next, scenes[i][0]); };
    ov.addEventListener('click', end); window.addEventListener('keydown', key, true);
    next();
  }

  /** v229 (JODIO): substitution panel. Pick the player going off, then the sub coming on. The match pauses while it is open. */
  function subPop(wrap, m, S) {
    let pop = wrap.querySelector('.sub-pop'); if (pop) { pop.remove(); m.paused = S.wasPaused; return; }
    S.wasPaused = !!m.paused; m.paused = true; let outSlot = null;
    pop = document.createElement('div'); pop.className = 'sub-pop'; wrap.appendChild(pop);
    const draw = () => {
      const xi = m.players.filter(p => p.team === 0 && !p.dummy).sort((a, b) => a.slot - b.slot), left = S.max - S.used;
      pop.innerHTML = `<div class="sp-h">SUBSTITUTIONS <small>${left} of ${S.max} left</small><button class="btn sm" data-sp="close">Done ▸</button></div>
        <div class="sp-cols"><div><h4>On the pitch</h4>${xi.map(p => `<button class="sp-row${outSlot === p.slot ? ' on' : ''}" data-sp="out" data-k="${p.slot}" ${left ? '' : 'disabled'}><b>${p.card.rating}</b><span>${esc(p.card.name)}</span><i>${p.fpos || p.card.position}</i><em style="--s:${Math.round(p.stamina)}%"></em></button>`).join('')}</div>
        <div><h4>Subs</h4>${S.pool.map((c, i) => `<button class="sp-row" data-sp="in" data-k="${i}" ${outSlot == null || !left ? 'disabled' : ''}><b>${c.rating}</b><span>${esc(c.name)}</span><i>${c.position}</i></button>`).join('') || '<p class="dim">No subs left.</p>'}</div></div>
        <p class="dim sp-n">${outSlot == null ? 'Pick the player going off.' : 'Now pick who comes on.'}</p>`;
    };
    pop.addEventListener('click', e => {
      e.stopPropagation(); const b = e.target.closest('[data-sp]'); if (!b) return; const k = +b.dataset.k;
      if (b.dataset.sp === 'close') { pop.remove(); m.paused = S.wasPaused; return; }
      if (b.dataset.sp === 'out') outSlot = outSlot === k ? null : k;
      if (b.dataset.sp === 'in' && outSlot != null) { const c = S.pool[k]; if (m.substitute(0, outSlot, c)) { S.pool.splice(k, 1); S.used++; toast(c.name + ' comes on', 'good'); } outSlot = null; }
      draw();
    });
    draw();
  }

  function runMatch(o) {
    const humans = o.humans || [], two = humans.length > 1 && !o.online;
    const canTac = humans.length === 1 && !o.online && !o.training && !o.duel;      // v113: tactic changes during the match (by button / keys 1-9) and the auto coach
    const btnTac = canTac ? '<button class="btn sm y" data-mact="tac">Tactics</button>' : '';
    // v229 (JODIO): substitutions from the 10 sub spots, when this is the user's own club (max 5 changes, like FC)
    const myXI = (State.squadCards() || []).filter(Boolean).map(c => c.name), homeNames = ((o.home && o.home.cards) || []).map(c => c && c.name);
    const benchPool = canTac && humans[0] === 0 && myXI.length === 11 && homeNames.filter(n => myXI.includes(n)).length >= 9 ? State.benchCards().filter(c => !homeNames.includes(c.name)) : [];
    const subSt = { pool: benchPool.slice(), used: 0, max: 5, off: new Set() };
    const btnSub = benchPool.length ? '<button class="btn sm y" data-mact="subs">Subs</button>' : '';
    const hint = o.training ? '<span class="kbd">Z</span>pass <span class="kbd">X</span>shoot <span class="kbd">C</span>thru <span class="kbd">V</span>lob · <span class="kbd">Q</span><span class="kbd">E</span><span class="kbd">R</span><span class="kbd">SPACE</span>skills · <span class="kbd">B</span>ball <span class="kbd">N</span>reset <span class="kbd">F</span>cross <span class="kbd">G</span>ground ball'
      : !humans.length ? 'AI vs AI' : two
      ? '<span class="kbd">P1</span>WASD F G H T <span class="kbd">P2</span>arrows J K L I · hold = power'
      : '<span class="kbd">Z</span>pass <span class="kbd">X</span>shoot <span class="kbd">C</span>thru <span class="kbd">V</span>lob · hold = power · <span class="kbd">Q</span>/<span class="kbd">SPACE</span>signature dribble <span class="kbd">E</span>stepover <span class="kbd">R</span>feint';
    const wrap = document.createElement('div');
    wrap.className = 'match-wrap';
    const touch = touchOn() && (humans.length > 0);
    const btnCam = `<button class="btn sm" data-mact="cam">Camera: ${camLabel(App.camMode)}</button>`, btnGfx = `<button class="btn sm" data-mact="gfx" title="Graphics quality. Auto lowers it by itself if the game runs slowly">Gfx: ${gfxLabel()}</button>`;
    const btnSpeed = o.online || o.noSpeed ? '' : '<button class="btn sm" data-mact="speed">Speed x1</button>', btnPause = o.online ? '' : '<button class="btn sm" data-mact="pause">Pause</button>';
    const SPV = { behind: 'Behind', high: 'High', side: 'Side', tv: 'Match cam' }, btnSp = `<button class="btn sm" data-mact="spv" title="Camera for penalties, corners and free kicks">Set pieces: ${SPV[SET.spView || 'behind']}</button>`;
    const btnFull = '<button class="btn sm" data-mact="full">Fullscreen</button>', btnQuit = '<button class="btn sm r" data-mact="quit">Quit</button>';
    const ping = o.online ? '<span class="ping" id="m-ping">...</span>' : '';
    const top = touch
      ? `<div class="match-bar mb-top"><span></span><span></span><span class="mb-right">${ping}${o.online ? '' : '<button class="btn sm ic" data-mact="pause" aria-label="Pause">❚❚</button>'}<button class="btn sm ic" data-mact="menu" aria-label="Menu">☰</button></span><div class="mb-menu" hidden>${btnTac}${btnSub}${btnCam}${btnSp}${btnGfx}${btnSpeed}${btnFull}${btnQuit}</div></div>`
      : `<div class="match-bar mb-top"><span>${esc(o.home.name)} vs ${esc(o.away.name)}</span>
        <span>${o.live ? "" : hint}</span>
        <span>${ping}${btnTac}${btnSub}${btnCam}${btnSp}${btnGfx}${btnSpeed}${btnPause}${btnFull}${btnQuit}</span></div>`;
    const tcHTML = `<div class="tc"><div class="tc-zone"></div><div class="tc-stick"><i></i></div>
        <div class="tc-act">
          <button class="tb tb-thru p" data-pad="through"><b>THRU</b><small>switch</small></button><button class="tb tb-lob y" data-pad="lob"><b>LOB</b><small>call</small></button>
          <button class="tb tb-pass c" data-pad="pass"><b>PASS</b><small>tackle</small></button><button class="tb tb-shoot r" data-pad="shoot"><b>SHOOT</b><small>slide</small></button>
          <div class="tc-skill"><button class="tb sk" data-pad="sig">SKILL</button><button class="tb sk" data-pad="step">STEP</button><button class="tb sk" data-pad="feint">FEINT</button><button class="tb sk" data-pad="knock">RUN</button></div>
        </div><div class="tc-rot">↻ Rotate your phone for a wider pitch</div></div>`;
    const bottom = !humans.length ? '<div class="match-bar mb-bot"><span class="dim">Sit back and enjoy the pixels.</span></div>'
      : touch ? tcHTML
      : `<div class="match-bar mb-bot"><div class="pad">${['left', 'up', 'down', 'right'].map(d => `<button class="btn sm" data-pad="${d}">${{ left: '◀', up: '▲', down: '▼', right: '▶' }[d]}</button>`).join('')}<button class="btn sm" data-pad="sprint">SPR</button></div>
        <div class="pad"><button class="btn sm c" data-pad="pass">PASS</button><button class="btn sm r" data-pad="shoot">SHOOT</button><button class="btn sm p" data-pad="through">THRU</button><button class="btn sm y" data-pad="lob">LOB</button><button class="btn sm" data-pad="sig">SKILL</button><button class="btn sm" data-pad="step">STEP</button><button class="btn sm" data-pad="feint">FEINT</button><button class="btn sm" data-pad="knock">RUN</button></div></div>`;
    if (touch) wrap.classList.add('touch');
    wrap.innerHTML = `${top}<canvas class="game"></canvas>${o.training ? trainPanelHTML() : ''}${canTac ? tacPopHTML() : ''}${bottom}`;
    document.body.appendChild(wrap);
    // v103: with a human in a local match every AI player reads the game better (smart 1.5: the reading attributes go half way to 99), and the club's own tactics run twice as strong (stretch 3 instead of 1.5)
    const hu = humans.length > 0 && !o.online && !o.training && !o.duel, sm = t => (hu && t && !(t.smart >= 1.5) ? Object.assign({}, t, { smart: 1.5 }) : t);
    const own = !o.online && !o.training && !o.duel && o.home && o.home.name === D().clubName;
    const recOn = !!(RUT.Rec && hu && humans.length === 1 && !o.online && !o.training && !o.duel);       // v108: your local matches are recorded (set-up + your inputs), so highlights can be replayed exactly
    const mcfg = {
      balance: (hu && humans.length === 1 && !o.online) ? (lv => [humans[0] === 0 ? 0 : lv, humans[0] === 1 ? 0 : lv])(Engine.AIBal ? Engine.AIBal.level(D().aiBal) : (RUT.AIBal ? RUT.AIBal.level(D().aiBal) : 0)) : undefined,   // v306 (JODIO): AI balancer
      home: sm(o.home), away: sm(o.away), tacGain: own ? [CLUB_GAIN, 0] : undefined, coach: own ? [coachK(), null] : undefined, train: own ? [trainBoost(), null] : undefined, autoCoach: false ? [humans[0] === 0, humans[0] === 1] : undefined, plays: (own && !humans.length && !o.online && !o.training && !o.duel && (D().plays || []).some(pl => pl.on)) ? [playsCfg(), null] : undefined, humans, halfSeconds: o.halfSeconds || App.halfSeconds, setPieces: (!o.online && !o.training && !o.duel && humans.length === 1 && humans[0] === 0) ? [spCfg(), null] : undefined, knockout: o.knockout, extraTime: !!o.extraTime, camera: App.camMode || 'tv', seed: o.seed,
      penAsk: (humans.length === 1 && !o.online && !o.training) ? (mm, cb) => askPens(mm, wrap, humans[0], cb) : undefined,
      training: o.training || null, duel: !!o.duel, pitch: o.pitch || App.pitch || 'huge', surface: (o.phys || physCfg()).surface, ballModel: (o.phys || physCfg()).ballModel, assist: (o.phys || physCfg()).assist, styles: o.styles, brain: o.brain || (gfxPref() === 'ultra' ? 'ultra' : 'std'),
      press: (hu && humans.length === 1 && !o.online && RUT.AIBal) ? (pr => [humans[0] === 0 ? 0 : pr, humans[0] === 1 ? 0 : pr])(RUT.AIBal.pressure(D().aiBal)) : undefined,   // v309 (JODIO): smarter AI when you win 2+ of the last 3
      onEnd: res => { if (hu && humans.length === 1 && !o.online && RUT.AIBal) { const hw = humans[0] === 0 ? res.won : (!res.won && !res.draw); D().aiBal = RUT.AIBal.push(D().aiBal, hw ? 1 : res.draw ? 0.5 : 0); State.save(); }   // v306: the balancer remembers how you did
        if (own) recordPlayerStats(res, o.away); if (recOn) saveRec(m, o); playsLive(m); setTimeout(() => { m.stop(); wrap.remove(); App.match = null; o.onEnd(res); }, 1800); },
    };
    const snap = recOn ? RUT.Rec.snapshot(mcfg) : null;
    const m = new Engine.Match(mcfg); m.spView = SET.spView || "behind";
    if (recOn) m.recStart(snap);

    App.match = m;
    if (o.onGoal) m.cfg.onGoal = o.onGoal;
    if (o.live) {                                                         // the rest of the matchday, live: scores follow this match's clock
      const box = document.createElement('div'); box.className = 't5-live'; wrap.appendChild(box);
      const tick = () => {
        if (!wrap.isConnected) { clearInterval(iv); return; }
        const p = Math.max(0, Math.min(1, m.t / (2 * m.halfSeconds)));
        box.innerHTML = `<b>MATCHDAY ${o.live.r + 1}</b>` + o.live.fx.map(f => { let h = 0, a = 0; f.g.forEach(g => { if (g[0] <= p) { if (g[1]) a++; else h++; } }); return `<div><span>${esc(f.h)}</span><b>${h}-${a}</b><span>${esc(f.a)}</span></div>`; }).join('');
      };
      const iv = setInterval(tick, 500); tick();
    }
    if (o.styles && !o.training) { m.ticker = styleName(o.styles[0]) + ' vs ' + styleName(o.styles[1]); m.tickerT = 4; }
    m.onCamera = mode => { App.camMode = mode; const cb = wrap.querySelector('[data-mact="cam"]'); if (cb) cb.textContent = 'Camera: ' + camLabel(mode); };
    if (o.online) {                                                      // lockstep: inputs travel, both machines run the same match
      const on = o.online, sess = on.session;
      m.ticker = 'ONLINE MATCH'; m.tickerT = 3;
      m.netSetup({ me: on.me, D: on.delay || 8, pumpMs: sess.viaRelay ? 70 : 40, send: msg => sess.sendInput(msg) });
      sess.inHandler = d => m.netRecv(d);
      const gone = msg => { clearInterval(watch); sess.close(true); m.stop(); wrap.remove(); App.match = null; App.online = null; toast(msg, 'bad'); render(); };
      on.abort = gone;
      const watch = setInterval(() => { if (!App.match || App.match !== m) { clearInterval(watch); return; } if (performance.now() - m.net.lastRx > 15000) gone('The other player stopped responding. Match ended.'); }, 1000);
      m.cfg.onEnd0 = m.cfg.onEnd; m.cfg.onEnd = res => { clearInterval(watch); m.cfg.onEnd0(res); };   // the session stays open for a rematch
    }
    const kick = () => { if (wrap.isConnected) m.start(wrap.querySelector('canvas')); };
    if (!o.online && !o.training && !o.duel && !o.noIntro && !(SET.intro === false)) preMatch(o, wrap, kick); else kick();   // v226: FC-style pre-match show first
    { const cv = wrap.querySelector('canvas');   // left mouse button = hold SHOOT and aim with the pointer
      const mp = (t, e) => { if (e.pointerType !== 'mouse' || (t !== 'move' && e.button !== 0)) return; m.mouse(t, e.clientX, e.clientY); };
      cv.addEventListener('pointerdown', e => mp('down', e)); cv.addEventListener('pointermove', e => mp('move', e));
      window.addEventListener('pointerup', e => { if (wrap.isConnected) mp('up', e); }); }
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-mact]'); if (!b) return;
      const a = b.dataset.mact;
      if (a === 'cam') { App.camMode = m.nextCamera(); b.textContent = 'Camera: ' + camLabel(m.camMode); }
      if (a === 'gfx') { b.textContent = 'Gfx: ' + gfxLabel(m.nextGfx()); }
      if (a === 'speed') { m.speed = m.speed === 1 ? 4.5 : 1; b.textContent = 'Speed x' + m.speed; }
      if (a === 'pause') { m.paused = !m.paused; b.textContent = b.classList.contains('ic') ? (m.paused ? '▶' : '❚❚') : (m.paused ? 'Resume' : 'Pause'); }
      if (a === 'menu') { const mm = wrap.querySelector('.mb-menu'); if (mm) mm.hidden = !mm.hidden; }
      if (a === 'subs') subPop(wrap, m, subSt);
      if (a === 'spv') { const ks = Object.keys(SPV), nx = ks[(ks.indexOf(SET.spView || 'behind') + 1) % ks.length]; SET.spView = nx; saveSet(); m.spView = nx; b.textContent = 'Set pieces: ' + SPV[nx]; }
      if (a === 'tac') { const tp = wrap.querySelector('.tac-pop'); if (tp) { tp.hidden = !tp.hidden; tacPopFill(tp, m, humans[0]); } }
      if (a === 'tq') { const lab = m.tacShift(humans[0], b.dataset.k, false); const tp = wrap.querySelector('.tac-pop'); if (tp) tacPopFill(tp, m, humans[0], lab === false ? 'That is already as far as it goes.' : lab); }
      if (a === 'full') { try { if (document.fullscreenElement) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {}); } catch (e) { /* not supported */ } }
      if (a === 'quit') { if (o.online && o.online.session) o.online.session.close(); if (recOn && !m.over) saveRec(m, o); playsLive(m); m.stop(); wrap.remove(); App.match = null; if (o.onQuit) o.onQuit(); }
    });
    if (canTac) {
      const KQ = { Digit1: 'attack', Digit2: 'defend', Digit3: 'pressUp', Digit4: 'pressDown', Digit5: 'lineUp', Digit6: 'lineDown', Digit7: 'wide', Digit8: 'narrow', Digit9: 'direct' };
      const kh = e => { if (!wrap.isConnected) { window.removeEventListener('keydown', kh); return; } const k = KQ[e.code]; if (!k || e.repeat || m.over) return; m.tacShift(humans[0], k, false); const tp = wrap.querySelector('.tac-pop'); if (tp && !tp.hidden) tacPopFill(tp, m, humans[0]); };
      window.addEventListener('keydown', kh);
    }
    if (o.training) bindTrainPanel(wrap, m);
    if (wrap.classList.contains('touch')) bindTouch(wrap, m);
    if (o.online) { // connection read-out (round trip to the other player)
      const sess = o.online.session, pg = wrap.querySelector('#m-ping');
      const iv = setInterval(() => {
        if (!wrap.isConnected) { clearInterval(iv); return; }
        const r = sess && sess.rtt; if (!pg) return;
        const stall = m.net && m.net.stall > 0.4;
        pg.textContent = stall ? 'waiting...' : r ? Math.round(r) + ' ms' : '...';
        pg.className = 'ping ' + (stall ? 'bad' : !r ? '' : r < 80 ? 'good' : r < 160 ? 'mid' : 'bad');
      }, 500);
    }
    const pad = (e, down) => { const b = e.target.closest('[data-pad]'); if (!b) return; e.preventDefault(); m.press(b.dataset.pad, down); };
    wrap.addEventListener('pointerdown', e => pad(e, true));
    wrap.addEventListener('pointerup', e => pad(e, false));
    wrap.addEventListener('pointerleave', e => pad(e, false));
    return m;
  }

  /**
   * Touch controls: a floating analog stick anywhere on the left half (push to the rim to sprint), big round action buttons on the
   * right, labels that change between attack and defence, and fullscreen on the first touch.
   */
  function bindTouch(wrap, m) {
    const zone = wrap.querySelector('.tc-zone'), base = wrap.querySelector('.tc-stick'), knob = base.firstElementChild;
    let id = null, ox = 0, oy = 0;
    const R = () => Math.max(38, Math.min(innerWidth, innerHeight) * 0.12);
    const drive = (x, y) => {
      const r = R(); let dx = x - ox, dy = y - oy; const L = Math.hypot(dx, dy);
      if (L > r) { dx *= r / L; dy *= r / L; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      let nx = dx / r, ny = dy / r; const mag = Math.hypot(nx, ny);
      if (mag < 0.16) { nx = 0; ny = 0; } else { const k = (mag - 0.16) / (0.84 * mag); nx *= k; ny *= k; }
      m.setStick(nx, ny, mag > 0.96);
      base.classList.toggle('rim', mag > 0.96);
    };
    const end = e => { if (e.pointerId !== id) return; id = null; base.classList.remove('on', 'rim'); knob.style.transform = ''; m.setStick(0, 0, false); };
    zone.addEventListener('pointerdown', e => {
      if (id !== null) return; id = e.pointerId; try { zone.setPointerCapture(id); } catch (err) { /* ignore */ }
      const rc = wrap.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
      base.style.left = (ox - rc.left) + 'px'; base.style.top = (oy - rc.top) + 'px'; base.classList.add('on'); drive(ox, oy);
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === id) drive(e.clientX, e.clientY); });
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    // the first touch asks for fullscreen (a gesture is required); a gentle rotate hint in portrait
    let fs = false;
    wrap.addEventListener('pointerdown', () => { if (fs) return; fs = true; try { if (!document.fullscreenElement && wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {}); } catch (e) { /* ignore */ } }, { once: false });
    const rot = wrap.querySelector('.tc-rot'); if (rot) { rot.addEventListener('pointerdown', () => rot.remove()); setTimeout(() => rot.remove(), 7000); }
    // labels: on the ball PASS/SHOOT/THRU/LOB; without it tackle/slide/switch/call
    const lab = { pass: ['PASS', 'TACKLE'], shoot: ['SHOOT', 'SLIDE'], through: ['THRU', 'SWITCH'], lob: ['LOB', 'PRESS'] };
    let last = null;
    const iv = setInterval(() => {
      if (!wrap.isConnected) { clearInterval(iv); m.setStick(0, 0, false); return; }
      const c = m.ctls && m.ctls[m.human], on = !!(c && c.controlled && m.ball.owner === c.controlled);
      if (on === last) return; last = on;
      wrap.querySelectorAll('.tb[data-pad]').forEach(b => { const l = lab[b.dataset.pad]; if (!l) return; const t = b.querySelector('b'), sm = b.querySelector('small'); if (t) t.textContent = l[on ? 0 : 1]; if (sm) sm.textContent = l[on ? 1 : 0].toLowerCase(); });
    }, 200);
  }

  /* --------------------------- TESTING GROUND --------------------------- */
  // One player on a big pitch. Everything is changed live from the panel: player, pitch, dummies, keeper, team-mates.
  const TRAIN_LVL = { amateur: 62, pro: 78, world: 88, legendary: 93 };
  const AI_FOE_SLOTS = [2, 3, 6, 1, 4, 5, 7, 8, 9, 10], AI_MATE_SLOTS = [10, 8, 7, 6, 5, 2, 3, 1, 4];   // which positions the first n opponents / AI team-mates take
  const TR = { pitch: 'huge', foes: 0, foeMode: 'cone', lvl: 'pro', mates: 0, keeper: false, hero: null, ai: false, aiFoes: 5, aiMates: 4, aiFoeGK: true, aiMyGK: false, aiStyle: 'balanced', fkSpot: 'rand', cnSide: 'left' };
  // v231 (JODIO): more free-kick spots: [distance m, sideways m from the middle]
  const FK_SPOTS = [['rand', 'Random 20-30 m', null], ['c18', 'Central 18 m', [18, 0]], ['c22', 'Central 22 m', [22, 0]], ['c25', 'Central 25 m', [25, 0]], ['c30', 'Central 30 m', [30, 0]], ['c35', 'Long range 35 m', [35, 0]], ['l20', 'Left 20 m', [20, -9]], ['r20', 'Right 20 m', [20, 9]], ['l25', 'Left 25 m', [25, -13]], ['r25', 'Right 25 m', [25, 13]], ['lw', 'Wide left (cross or shoot)', [22, -24]], ['rw', 'Wide right (cross or shoot)', [22, 24]], ['la', 'Edge of box, left angle', [17, -14]], ['ra', 'Edge of box, right angle', [17, 14]]];
  const fkSpot = () => (FK_SPOTS.find(f => f[0] === TR.fkSpot) || FK_SPOTS[0])[2];
  const cornerCards = () => { const r = TRAIN_LVL[TR.lvl]; return { side: TR.cnSide, mates: [0, 1, 2, 3, 4].map(i => trainPick(i % 2 ? ['CB'] : ['ST', 'CM'], 82, i)).filter(Boolean), foes: [0, 1, 2, 3, 4, 5, 6].map(i => trainPick(i < 5 ? ['CB', 'CDM'] : ['CM', 'ST'], r, i)).filter(Boolean), keeper: trainPick(['GK'], r, 0) || null }; };
  function trainPick(positions, rating, n) {
    const pool = DB.all.filter(c => !c.promo && positions.includes(c.position)).sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));
    return pool[n % Math.max(1, Math.min(6, pool.length))];
  }
  function trainCards() {
    const r = TRAIN_LVL[TR.lvl], atk = TR.foeMode === 'attack';
    if (TR.ai) {                                                       // Opponent AI: a real CPU team (and AI team-mates) playing full match AI around you
      const F = State.FORMATION, foeSlots = AI_FOE_SLOTS.slice(0, TR.aiFoes), mateSlots = AI_MATE_SLOTS.slice(0, TR.aiMates);
      return { hero: TR.hero, foeMode: 'ai', pitch: TR.pitch, foeSlots, mateSlots, styles: [myTac(), TR.aiStyle],
        foes: foeSlots.map((sl, i) => trainPick([F[sl]], r, i)), mates: mateSlots.map((sl, i) => trainPick([F[sl]], 80, i)),
        keeper: TR.aiFoeGK ? trainPick(['GK'], r, 0) : null, mateKeeper: TR.aiMyGK ? trainPick(['GK'], 80, 1) : null };
    }
    return {
      hero: TR.hero, foeMode: TR.foeMode, pitch: TR.pitch,
      foes: Array.from({ length: TR.foes }, (_, i) => trainPick(atk ? ['ST', 'LW', 'RW'] : ['CB', 'LB', 'RB'], r, i)),
      mates: Array.from({ length: TR.mates }, (_, i) => trainPick(['CM', 'CAM', 'RM'], 80, i)),
      keeper: TR.keeper ? trainPick(['GK'], r, 0) : null,
    };
  }
  function trainPanelHTML() {
    const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, t]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    return `<div class="tr-panel"><button class="btn sm y" data-tr="toggle">Setup ▾</button><div class="tr-body">
      <label>Player</label><input id="tr-hero" list="tr-dl" value="${esc(TR.hero.name)}" autocomplete="off"><datalist id="tr-dl">${DB.all.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
      <label>Pitch</label>${sel('tr-pitch', [['huge', 'Huge 160x116'], ['large', 'Large 130x96'], ['standard', 'Standard 105x80']], TR.pitch)}
      <label>Opponents</label><div class="row">${sel('tr-foes', [0, 1, 2, 3, 4].map(n => [n, n]), TR.foes)}${sel('tr-mode', [['cone', 'Cones (still)'], ['press', 'Defenders (press)'], ['attack', 'Attackers (you defend)']], TR.foeMode)}${sel('tr-lvl', [['amateur', 'Weak'], ['pro', 'Good'], ['world', 'World class']], TR.lvl)}</div>
      <div class="tr-ai"><label>Opponent AI · a full CPU team that attacks and defends (turns the cones and defenders above off)</label>
        <div class="row"><label style="margin:0"><input type="checkbox" id="tr-ai" ${TR.ai ? 'checked' : ''}> Play against the CPU</label>${sel('tr-ailvl', [['amateur', 'Weak'], ['pro', 'Good'], ['world', 'World class'], ['legendary', 'Legendary']], TR.lvl)}<select id="tr-aistyle">${styleOptions(TR.aiStyle, false)}</select></div>
        <div class="row">${sel('tr-aifoes', Array.from({ length: 11 }, (_, n) => [n, n + ' opponents']), TR.aiFoes)}${sel('tr-aimates', Array.from({ length: 10 }, (_, n) => [n, n + ' AI team-mates']), TR.aiMates)}${sel('tr-aigk', [[1, 'Their keeper'], [0, 'No keeper (their goal is open)']], TR.aiFoeGK ? 1 : 0)}${sel('tr-aimygk', [[0, 'No keeper for me'], [1, 'My keeper in goal']], TR.aiMyGK ? 1 : 0)}</div></div>
      <label>Free-kick spot · corner side</label><div class="row">${sel('tr-fkspot', FK_SPOTS.map(f => [f[0], f[1]]), TR.fkSpot)}${sel('tr-cnside', [['left', 'Corner from the left'], ['right', 'Corner from the right']], TR.cnSide)}</div>
      <label>Goalkeeper (cones / defenders modes)</label>${sel('tr-gk', [[0, 'No keeper'], [1, 'Keeper in goal']], TR.keeper ? 1 : 0)}
      <label>Team-mates (play it back)</label>${sel('tr-mates', [0, 1, 2, 3].map(n => [n, n]), TR.mates)}
      <div class="row mt"><button class="btn sm g" data-tr="ball">Ball to feet · B</button><button class="btn sm" data-tr="reset">Reset all · N</button><button class="btn sm c" data-tr="cross">Cross · F</button><button class="btn sm c" data-tr="ground">Ground ball · G</button><button class="btn sm y" data-tr="fk">Free kick · 7</button><button class="btn sm y" data-tr="corner">Corner test · 9</button><button class="btn sm y" data-tr="pen">Penalty · 8</button></div>
    </div></div>`;
  }
  function bindTrainPanel(wrap, m) {
    const panel = wrap.querySelector('.tr-panel'); m.fkSpot = fkSpot(); m.cornerCfg = cornerCards;
    const apply = e => {
      const hn = panel.querySelector('#tr-hero').value.trim().toLowerCase();
      const hc = DB.all.filter(c => c.name.toLowerCase() === hn).sort((a, b) => b.rating - a.rating)[0] || (hn.length > 2 ? DB.all.filter(c => c.name.toLowerCase().includes(hn)).sort((a, b) => b.rating - a.rating)[0] : null);
      if (hc) { TR.hero = hc; panel.querySelector('#tr-hero').value = hc.name; }
      TR.pitch = panel.querySelector('#tr-pitch').value; TR.foes = +panel.querySelector('#tr-foes').value; TR.foeMode = panel.querySelector('#tr-mode').value;
      TR.lvl = panel.querySelector(TR.ai || (e && e.target && e.target.id === 'tr-ailvl') ? '#tr-ailvl' : '#tr-lvl').value; TR.keeper = panel.querySelector('#tr-gk').value === '1'; TR.mates = +panel.querySelector('#tr-mates').value;
      TR.ai = panel.querySelector('#tr-ai').checked; TR.aiFoes = +panel.querySelector('#tr-aifoes').value; TR.aiMates = +panel.querySelector('#tr-aimates').value;
      TR.aiFoeGK = panel.querySelector('#tr-aigk').value === '1'; TR.aiMyGK = panel.querySelector('#tr-aimygk').value === '1'; TR.aiStyle = panel.querySelector('#tr-aistyle').value;
      if (TR.ai) panel.querySelector('#tr-ailvl').value = TR.lvl; else panel.querySelector('#tr-lvl').value = TR.lvl;
      const only = e && e.target && (e.target.id === 'tr-fkspot' || e.target.id === 'tr-cnside');
      TR.fkSpot = panel.querySelector('#tr-fkspot').value; TR.cnSide = panel.querySelector('#tr-cnside').value; m.fkSpot = fkSpot();
      if (only) { if (e.target.id === 'tr-fkspot') m.trainSet('fk', fkSpot()); else m.trainCorner(cornerCards()); return; }
      m.trainConfig(trainCards());
    };
    panel.addEventListener('change', e => { apply(e); if (e.target.tagName === 'SELECT' || e.target.id === 'tr-hero' || e.target.type === 'checkbox') e.target.blur(); });
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-tr]'); if (!b) return;
      const a = b.dataset.tr;
      if (a === 'toggle') { panel.classList.toggle('shut'); b.textContent = panel.classList.contains('shut') ? 'Setup ▸' : 'Setup ▾'; }
      if (a === 'ball') m.trainBall(); if (a === 'reset') m.trainReset();
      if (a === 'cross') m.trainFeed('cross'); if (a === 'ground') m.trainFeed('ground'); if (a === 'fk') m.trainSet('fk', fkSpot()); if (a === 'pen') m.trainSet('pen'); if (a === 'corner') m.trainCorner(cornerCards());
    });
  }
  function startTraining() {
    if (!TR.hero) TR.hero = State.matchCards()[9] || DB.all.slice().sort((a, b) => b.rating - a.rating)[0];
    const cfg = trainCards();
    runMatch({
      home: { name: 'Testing Ground', short: 'YOU', cards: [TR.hero] }, away: { name: 'Dummies', short: 'CPU', cards: [trainPick(['CB'], 78, 0)] },
      humans: [0], training: cfg, pitch: TR.pitch, styles: cfg.styles, onQuit: () => render(),
    });
  }

  /* ------------------------------- ONLINE ------------------------------- */
  // Two players, two computers: one hosts and shares a game code, the other types it in. Both play with their own club XI on the huge pitch.
  // Needs the artifact's live room (see js/net.js); the match itself is lockstep (see "ONLINE (lockstep)" in engine.js).
  function onlineSquadReady() { return D().squad.slots.every(Boolean); }
  const duelMode = () => SET.onlineMode === 'duel';
  const DUEL_PITCH = [80, 56];                                          // smaller than the standard 105x80
  const duelPlayer = () => (SET.duelPick && DB.get(SET.duelPick)) || State.matchCards()[9] || DB.all.slice().sort((a, b) => b.rating - a.rating)[0];
  /** A 1v1 squad: the picked player plus the keeper whose rating is closest to his. Padded to 11 cards so the squad swap is unchanged. */
  function duelSquad() {
    const pl = duelPlayer(), gks = DB.players.concat(DB.reserves).filter(c => c.position === 'GK');
    const gk = gks.sort((a, b) => Math.abs(a.rating - pl.rating) - Math.abs(b.rating - pl.rating))[0] || DB.reserves[0];
    return [gk, pl].concat(new Array(9).fill(pl));
  }
  function duelPicker() {
    const clubs = Object.keys(DB.CLUBS).sort();
    modal(`<h2>1v1 Duel · pick your player</h2>
      <div class="row mb"><input id="dp-q" placeholder="Search name" style="flex:1;min-width:120px">
        <select id="dp-club"><option value="">Any club</option>${clubs.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
      <div id="dp-list"></div>`, 'wide');
    const draw = () => {
      const q = $('#dp-q').value.trim().toLowerCase(), cl = $('#dp-club').value;
      const rows = casualPool().filter(c => c.position !== 'GK' && (!q || c.name.toLowerCase().includes(q)) && (!cl || c.club === cl)).slice(0, 80);
      $('#dp-list').innerHTML = `<table class="list"><tr><th>OVR</th><th>Name</th><th>Pos</th><th>Club</th><th>PAC</th><th>SHO</th><th>DRI</th><th></th></tr>
        ${rows.map(c => `<tr><td>${miniOvr(c)}</td><td>${esc(c.name)}</td><td>${c.position}</td><td>${esc(c.club)}</td><td>${c.face.pac}</td><td>${c.face.sho}</td><td>${c.face.dri}</td>
        <td><button class="btn sm g" data-act="duel-pick" data-card="${c.id}">Pick</button></td></tr>`).join('')}</table>${rows.length ? '' : '<p class="dim">No players match.</p>'}`;
    };
    $('#dp-q').addEventListener('input', draw); $('#dp-club').addEventListener('change', draw);
    draw(); $('#dp-q').focus();
  }
  /** Direct connection (WebRTC, no Claude account): the two players swap one code each. */
  function directHTML() {
    const R = App.direct, can = Net && Net.Direct && typeof RTCPeerConnection === 'function';
    const intro = `<h3 class="mt">No Claude account? Direct connection</h3><p class="dim" style="font-size:8px;line-height:1.9">Play without any account or server: the host makes an invite code, sends it to a friend in any chat app, the friend sends a reply code back, and you are connected. Pick the match type above first.</p>`;
    if (!can) return `${intro}<p class="bad" style="font-size:9px">This page cannot make direct connections (WebRTC is blocked inside the Claude page). Use the <b>game code</b> above instead: it works here and needs no codes to swap. Direct connection works on the website and in a normal browser tab.</p>`;
    if (!R) return `${intro}<div class="row"><button class="btn y" data-act="dr-host">Host direct</button><button class="btn g" data-act="dr-join">Join direct</button><button class="btn sm" data-act="dr-test">Test connection</button></div><p id="dr-test-out" style="font-size:9px">${esc(App.directTest || '')}</p>`;
    const box = (id, val, ro, ph) => `<textarea id="${id}" rows="4" ${ro ? 'readonly' : ''} placeholder="${ph}" spellcheck="false" autocomplete="off" autocapitalize="off" style="width:100%;font-size:9px;word-break:break-all">${esc(val || '')}</textarea>`;
    const err = (R.error ? `<p class="bad" style="font-size:9px">${esc(R.error)}</p>` : '') + (R.warn ? `<p class="gold" style="font-size:9px">${esc(R.warn)}</p>` : '');
    const cancel = '<div class="row mt"><button class="btn r" data-act="dr-cancel">Cancel</button></div>';
    if (R.role === 'host') return `${intro}<div class="px"><b>Host</b><label>1. Send this invite code to your friend</label>${R.mine ? box('dr-mine', R.mine, true, '') + '<div class="row"><button class="btn sm c" data-act="dr-copy">Copy invite</button><button class="btn sm" data-act="dr-share">Share</button></div>' : '<p class="dim">Creating the invite...</p>'}
      <label>2. Paste the reply code your friend sends back</label>${box('dr-paste', R.paste, false, 'RUTZ-...')}
      <div class="row"><button class="btn y" data-act="dr-connect" ${R.mine && !R.busy ? '' : 'disabled'}>${R.busy ? 'Connecting...' : 'Connect'}</button></div>${err}${cancel}</div>`;
    return `${intro}<div class="px"><b>Guest</b><label>1. Paste the host's invite code</label>${box('dr-paste', R.paste, false, 'RUTZ-...')}
      <div class="row"><button class="btn y" data-act="dr-make-reply" ${R.busy || R.mine ? 'disabled' : ''}>${R.busy ? 'Working...' : 'Create reply'}</button></div>
      ${R.mine ? `<label>2. Send this reply code back to the host</label>${box('dr-mine', R.mine, true, '')}<div class="row"><button class="btn sm c" data-act="dr-copy">Copy reply</button><button class="btn sm" data-act="dr-share">Share</button></div><p class="gold" style="font-size:9px">Waiting for the host to connect...</p>` : ''}${err}${cancel}</div>`;
  }
  VIEWS.online = function () {
    const O = App.online, ready = duelMode() || onlineSquadReady();
    const head = (SET.net === 'offline' ? `<div class="px mb"><b class="gold">Offline mode is on.</b> <span class="dim">Switch to Online mode in Settings to play other people.</span></div>` : '') + `<h2>Online Match</h2><p class="dim" style="font-size:8px;line-height:1.9">Tap <b>Quick match</b> to be paired with another player automatically, or play a friend over the internet: a Club XI match (11v11, huge pitch) or a 1v1 Duel (any player you like, small pitch). One of you hosts and shares the game code, the other types it in. No account is needed: just open the website. Matches are for fun: no coins or rewards.</p>`;
    let body;
    const steps = O => { const st = O.theirRating ? 3 : O.theirClub ? 2 : 1; const L = ['Connect', 'Friend found', 'Squads swapped', 'Play'];
      return `<div class="lobby-steps">${L.map((l, i) => `<span class="${i < st ? 'done' : i === st ? 'now' : ''}">${i < st ? '✓ ' : ''}${l}</span>`).join('')}</div>`; };
    let lastCode = ''; try { lastCode = localStorage.getItem('rut_last_code') || ''; } catch (e) { /* ignore */ }
    if (!O && App.quick) {
      const Q = App.quick;
      body = `<div class="qm-search">${Q.kind ? `<p class="gold">${Q.kind === 'champs' ? 'CHAMPIONS' : 'DIVISION RIVALS · ' + rivDivName(RV().div).toUpperCase()}</p><p class="dim" style="font-size:8px">No free player after ${RIV_WAIT} s? You play an AI rival instead.</p>` : ''}${mmSearchHTML(Q)}<h3 id="qm-status">${esc(Q.status)}</h3><p class="dim" id="qm-count" style="font-size:8px">${Q.online} ${Q.online === 1 ? 'player' : 'players'} in the queue</p>
        <p class="dim" style="font-size:8px;line-height:1.9">Keep this page open. You will be matched with the next player who taps Quick match, and the game starts by itself. Tell a friend to tap it too.</p>
        <div class="row" style="justify-content:center"><button class="btn r" data-act="qm-cancel">Cancel</button></div></div>`;
    } else if (!O) {
      const dp = duelMode() ? duelPlayer() : null;
      body = `<div class="qm-hero"><button class="btn y qm-btn" data-act="qm-start">⚡ QUICK MATCH</button><p class="dim" style="font-size:8px">Finds an opponent automatically. No codes, no setup. 11v11 on the immense pitch, 150 s halves, real time.${ready ? '' : ' Your XI is built for you.'}</p><button class="btn g" data-act="nav" data-v="rivals">🏆 Division Rivals &amp; Champions</button></div>
        <div class="row mt"><button class="btn ${duelMode() ? '' : 'y'}" data-act="on-mode" data-m="club">Club XI (11v11)</button><button class="btn ${duelMode() ? 'y' : ''}" data-act="on-mode" data-m="duel">1v1 Duel</button></div>
        ${dp ? `<div class="req ok" style="display:block">Your player: <b>${esc(dp.name)}</b> ${miniOvr(dp)} ${dp.position} · ${esc(dp.club)} <button class="btn sm c" data-act="on-pick">Pick player</button></div>` : ''}
        ${ready ? '' : '<p class="bad">Your XI needs 11 players. Go to Squad → Auto-build.</p>'}
        <div class="row mt"><button class="btn y" data-act="on-host" ${ready ? '' : 'disabled'}>Host a game</button></div>
        <h3 class="mt">Join a game</h3>
        <div class="row"><input id="on-code" placeholder="GAME CODE" maxlength="8" value="${esc(lastCode)}" style="width:150px;text-transform:uppercase" autocomplete="off" autocapitalize="characters" inputmode="text" enterkeyhint="go"><button class="btn g" data-act="on-join" ${ready ? '' : 'disabled'}>Join</button></div>`;
      body += directHTML();
    } else {
      const host = O.role === 'host';
      body = `${O.quick && !O.error ? mmLinkHTML(O) : steps(O)}
        ${O.quick ? '' : host ? `<label>Game code</label><div class="gold code-box" data-act="on-copy" title="Tap to copy">${esc(O.code)}</div>
          <div class="row"><button class="btn sm c" data-act="on-copy">Copy code</button><button class="btn sm" data-act="on-share">Share invite</button></div>
          <p class="dim" style="font-size:8px">Tell your friend this code. It works while this screen is open.</p>` : `<label>Game code</label><div class="gold" style="font-size:20px;letter-spacing:4px">${esc(O.code)}</div>`}
        <p style="font-size:9px">${esc(O.error || O.status || '')}</p>
        ${O.theirClub ? `<div class="req ok" style="display:block"><b>${esc(O.theirClub)}</b>${O.theirRating ? ' · squad rating ' + O.theirRating : ' · loading the squad...'}<br><span id="on-ping" class="ping">${O.rtt ? Math.round(O.rtt) + ' ms' : 'measuring the connection...'}</span></div>` : ''}
        ${host && O.theirRating && !O.error && !O.quick ? `<label>Half length (real seconds)</label><select id="on-half">${[45, 90, 150, 240].map(n => `<option value="${n}" ${App.halfSeconds === n ? 'selected' : ''}>${n}s per half</option>`).join('')}</select>
          <label>Your tactic</label><p class="dim" style="font-size:8px">${esc(styleName(myTac()))} (Club → Tactics)</p>
          <label>Their style</label><select id="on-sty-opp">${styleOptions('balanced', false)}</select>
          <p class="dim" style="font-size:8px">Pitch condition, ball and shot assist come from your Settings (${esc(SET.surface)} · ${esc(SET.ballModel)} · ${esc(SET.assist)}); both players use them.</p>
          <div class="row mt"><button class="btn y" data-act="on-start">▶ Start match</button></div>` : ''}
        ${!host && O.theirRating && !O.error && !O.quick ? '<p class="gold">Squads swapped. Waiting for the host to start the match...</p>' : ''}
        ${O.quick && O.theirRating && !O.error ? '<p class="gold">Starting the match...</p>' : ''}
        <div class="row mt"><button class="btn r" data-act="on-leave">${O.error ? 'Back' : 'Leave'}</button></div>`;
    }
    return `<div class="grid cols-2"><div class="px">${head}${body}</div>
      <div class="px"><h2>How it plays</h2><p style="font-size:8px;line-height:2.2">Both machines run the same match; only button presses travel, delayed by about 0.13 s so they stay in step. Controls are the same as Kick Off: you control your own team, the host plays from the left, the guest from the right.<br>
        If the other side's connection stalls you will see <b>WAITING FOR OPPONENT</b> and the match carries on when it returns. For the smoothest game both players should use the same browser, ideally Chrome. The match can't be paused.</p></div></div>`;
  };
  function onlineSet(patch) { if (!App.online) return; Object.assign(App.online, patch); if (App.view === 'online' && !App.match) render(); }
  function onlineEvent(ev) {
    const O = App.online; if (!O) return;
    if (ev.type === 'status') onlineSet({ status: ev.text });
    else if (ev.type === 'ping') {                                      // update the read-out in place: a full re-render would reset the lobby's selects
      O.rtt = ev.rtt; const pg = $('#on-ping'); if (pg) { pg.textContent = Math.round(ev.rtt) + ' ms · ' + (ev.rtt < 80 ? 'great' : ev.rtt < 160 ? 'good' : ev.rtt < 300 ? 'playable' : 'laggy'); pg.className = 'ping ' + (ev.rtt < 80 ? 'good' : ev.rtt < 160 ? 'mid' : 'bad'); }
    }
    else if (ev.type === 'rematch-ask') { O.rematchAsked = true; const b = $('#rm-note'); if (b) b.textContent = 'Your opponent wants a rematch!'; }
    else if (ev.type === 'paired') onlineSet({ theirClub: ev.club, status: 'Connected. Swapping squads...' });
    else if (ev.type === 'team') { if (ev.club && !O.namedOpp) { O.namedOpp = 1; mmFound(O.quick ? D().clubName : (O.club || D().clubName), ev.club, ev.rating); } onlineSet({ theirClub: ev.club, theirRating: ev.rating, status: O.quick ? 'Opponent found. Starting...' : O.role === 'host' ? 'Ready. Pick the options and start.' : 'Squads swapped.' }); quickAutoStart(O); }
    else if (ev.type === 'error') { if (App.match && O.abort) O.abort(ev.text); else if (!quickRetry(O, 'Could not connect to that opponent. Searching again...')) onlineSet({ error: ev.text }); }
    else if (ev.type === 'bye') { if (App.match && O.abort) O.abort('The other player left the match.'); else if (!quickRetry(O, 'Your opponent left. Searching again...')) { toast('The other player left.', 'bad'); App.online = null; if (App.view === 'online') render(); } }
    else if (ev.type === 'start') {
      const cfg = ev.cfg; if (O.quick) { O.quick.played = true; clearTimeout(O.quick.timer); } O.me = cfg.me; O.delay = cfg.delay; closeModal(); O.rematchAsked = false;
      runMatch({ tag: 'Online · vs ' + (cfg.me === 0 ? cfg.away.name : cfg.home.name), home: cfg.home, away: cfg.away, humans: [0, 1], knockout: true, extraTime: true, noSpeed: true, styles: cfg.styles, seed: cfg.seed, halfSeconds: cfg.half, pitch: cfg.duel ? DUEL_PITCH : (cfg.pitch || 'huge'), duel: !!cfg.duel, brain: cfg.brain, phys: cfg.phys,
        online: O, onEnd: res => onlineResult(res, cfg.home, cfg.away, cfg.me), onQuit: () => { App.online = null; render(); } });
    }
  }
  function onlineStartSession(role, code, transport, quick) {
    if (!Net) { toast('Online play is not available in this build.', 'bad'); return; }
    if (transport) code = 'DIRECT';
    else { code = Net.normCode(code); if (code.length < 4) { toast('Enter the game code.', 'bad'); return; }
      try { localStorage.setItem('rut_last_code', role === 'guest' ? code : ''); } catch (e) { /* ignore */ } }
    if (!duelMode() && !onlineSquadReady()) { toast('Your XI needs 11 players. Go to Squad → Auto-build.', 'bad'); if (transport) transport.leave(); App.direct = null; render(); return; }
    const duel = duelMode(), sess = new Net.Session({ role, code, transport: transport || null, club: duel ? duelPlayer().name.slice(0, 20) : D().clubName, cards: duel ? duelSquad() : State.matchCards(), duel, tac: myTac(), onEvent: onlineEvent });
    App.online = { role, code, status: 'Connecting...', session: sess, error: null, theirClub: '', theirRating: 0, quick: quick || null };
    if (quick) quickWatch(App.online);
    render();
    sess.connect();
  }

  /* ---- Quick match: one tap, automatic pairing (Net.Quick), then the host starts the game by itself ---- */
  /* v234 (JODIO: new matchmaking animation): your crest and squad rating on the left, a spinning wheel of rival crests on the right,
     radar sweep and pulse rings behind, live search clock. When the opponent is found a full-screen VS slam shows both clubs. */
  const MM_NAMES = ['Real Rivals', 'United FC', 'Atletico Pixel', 'Inter 99', 'Dynamo Retro', 'Sporting Arcade', 'Olympique 8-Bit', 'Borussia Block', 'Celtic Cart', 'Ajax Bitmap'];
  const mmIni = n => String(n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
  function mmSearchHTML(Q) {
    const me = D().clubName || 'You', r = quickRating(), t = Math.max(0, Math.floor((Date.now() - Q.t0) / 1000));
    return `<div class="mm"><div class="mm-bg"><i></i><i></i><i></i><b class="mm-sweep"></b></div>
      <div class="mm-side mm-me"><div class="mm-crest"><span>${esc(mmIni(me))}</span></div><div class="mm-name">${esc(me)}</div><div class="mm-ovr">OVR <b>${r}</b></div></div>
      <div class="mm-vs">VS<small id="mm-clock">${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</small></div>
      <div class="mm-side mm-opp"><div class="mm-crest q"><div class="mm-roll">${MM_NAMES.concat(MM_NAMES.slice(0, 1)).map(n => `<span>${esc(mmIni(n))}</span>`).join('')}</div></div><div class="mm-name">Searching<span class="mm-dots"><i>.</i><i>.</i><i>.</i></span></div><div class="mm-ovr">OVR <b>??</b></div></div></div>`;
  }
  setInterval(() => { const c = document.getElementById('mm-clock'), Q = App.quick; if (c && Q) { const t = Math.floor((Date.now() - Q.t0) / 1000); c.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); } }, 500);
  function mmLinkHTML(O) {   // quick match: opponent picked, connecting and swapping squads
    const me = D().clubName || 'You', th = O.theirClub || '';
    return `<div class="mm"><div class="mm-bg"><i></i><i></i><i></i><b class="mm-sweep"></b></div>
      <div class="mm-side mm-me"><div class="mm-crest"><span>${esc(mmIni(me))}</span></div><div class="mm-name">${esc(me)}</div><div class="mm-ovr">OVR <b>${quickRating()}</b></div></div>
      <div class="mm-vs">VS<small>${th ? 'READY' : 'LINKING'}</small></div>
      <div class="mm-side mm-opp"><div class="mm-crest${th ? '' : ' q'}">${th ? `<span>${esc(mmIni(th))}</span>` : `<div class="mm-roll">${MM_NAMES.concat(MM_NAMES.slice(0, 1)).map(n => `<span>${esc(mmIni(n))}</span>`).join('')}</div>`}</div><div class="mm-name">${th ? esc(th) : 'Opponent found'}</div><div class="mm-ovr">OVR <b>${O.theirRating || '??'}</b></div></div></div>`;
  }
  function mmFound(mine, theirs, rating) {
    const ov = document.createElement('div'); ov.className = 'mm-found';
    ov.innerHTML = `<div class="mm-flash"></div><p>OPPONENT FOUND</p><div class="mm-pair"><div class="mm-side l"><div class="mm-crest"><span>${esc(mmIni(mine))}</span></div><div class="mm-name">${esc(mine)}</div></div><div class="mm-vs big">VS</div><div class="mm-side r"><div class="mm-crest"><span>${esc(mmIni(theirs))}</span></div><div class="mm-name">${esc(theirs)}</div>${rating ? `<div class="mm-ovr">OVR <b>${rating}</b></div>` : ''}</div></div>`;
    document.body.appendChild(ov); setTimeout(() => ov.classList.add('out'), 2300); setTimeout(() => ov.remove(), 2800);
  }
  function quickRating() { try { return duelMode() ? (duelPlayer().rating || 70) : Net.avgRating(State.matchCards()); } catch (e) { return 70; } }
  function quickSearch(skip, kind) {
    if (!Net || !Net.Quick) { toast('Online play is not available in this build.', 'bad'); return; }
    if (SET.net === 'offline') { if (kind) { toast('Offline mode: you face an AI rival.', 'good'); rivalsAI(kind); } else toast('Offline mode is on. Switch to Online mode in Settings to play online.', 'bad'); return; }   // v198
    if (kind && duelMode()) { SET.onlineMode = 'club'; saveSet(); }               // Rivals and Champions are always Club XI
    if (!duelMode() && !onlineSquadReady()) { autoBuildSquad(); if (!onlineSquadReady()) { toast('Your XI needs 11 players. Go to Squad → Auto-build.', 'bad'); return; } }
    if (App.quick && App.quick.q) App.quick.q.close();
    const duel = duelMode(), Q = App.quick = { status: 'Searching for an opponent...', online: 1, skip: skip || [], q: null, t0: Date.now(), kind: kind || null };
    if (kind) Q.ai = setTimeout(() => { if (App.quick !== Q) return; clearTimeout(Q.wide); Q.q.close(); App.quick = null; toast('No player free right now: you face an AI rival.', 'good'); rivalsAI(kind); }, RIV_WAIT * 1000);
    // v229 (JODIO): look for someone close by first (same time-zone band, so likely the same country or wifi area: lower ping), then anyone after 12 s
    const near = 'z' + Math.round(-new Date().getTimezoneOffset() / 180);
    const mk = region => new Net.Quick({ mode: kind || (duel ? 'duel' : 'club'), region, club: duel ? duelPlayer().name : D().clubName, rating: quickRating(), skip: Q.skip,
      onStatus: (text, n) => { if (App.quick !== Q) return; Q.status = text; Q.online = n; const el = $('#qm-status'); if (el) { el.textContent = text; const c = $('#qm-count'); if (c) c.textContent = n + (n === 1 ? ' player' : ' players') + ' in the queue'; } else if (App.view === 'online' && !App.match) render(); },
      onMatch: m => { if (App.quick !== Q) return; clearTimeout(Q.ai); clearTimeout(Q.wide); App.quick = null; onlineStartSession(m.role, m.code, null, { peer: m.peer, skip: Q.skip, t0: Date.now(), kind: Q.kind }); },
      onFail: text => { if (App.quick !== Q) return; App.quick = null; toast(text, 'bad'); if (App.view === 'online' && !App.match) render(); } });
    Q.q = mk(near); Q.status = 'Searching for a player near you...';
    Q.wide = setTimeout(() => { if (App.quick !== Q) return; try { Q.q.close(); } catch (e) { /* gone */ } Q.q = mk(''); Q.status = 'Searching everywhere...'; Q.q.start(); }, 12000);
    render();
    Q.q.start();
  }
  function quickCancel() { if (App.quick) { clearTimeout(App.quick.ai); clearTimeout(App.quick.wide); if (App.quick.q) App.quick.q.close(); } App.quick = null; render(); }
  /** If a quick match never comes together (the other player went away), go back to searching without them. */
  function quickRetry(O, why) {
    if (!O.quick || O.quick.played || App.online !== O || App.match) return false;
    const skip = (O.quick.skip || []).concat(O.quick.peer || []).slice(-8);
    if (O.session) O.session.close(true);
    App.online = null; toast(why || 'Opponent did not answer. Searching again...', 'bad'); quickSearch(skip, O.quick.kind); return true;
  }
  function quickWatch(O) {
    O.quick.timer = setTimeout(() => { if (App.online === O && !O.theirClub && !O.rematching) quickRetry(O); }, 20000);
  }
  /** Host, quick match: start as soon as both squads are in and the connection is measured. The guest's tactic travels in its hello. */
  const QUICK_HALF = 150;
  function quickAutoStart(O) {
    if (!O.quick || O.role !== 'host' || O.quick.starting) return; O.quick.starting = true;
    const t0 = performance.now(), go = () => {
      if (App.online !== O || !O.session || O.session.closed) return;
      if ((O.session.rttN || 0) < 4 && performance.now() - t0 < 2500) { setTimeout(go, 150); return; }       // a few pings first: the input delay is sized from them
      const gt = O.session.theirTac, opp = gt && validStyle(gt) ? gt : 'balanced';
      O.session.start({ duel: duelMode(), seed: 1 + Math.floor(Math.random() * 2e9), half: O.quick.kind ? 90 : QUICK_HALF, pitch: duelMode() ? 'huge' : 'colossal', brain: gfxPref() === 'ultra' ? 'ultra' : 'std', phys: physCfg(), styles: [myTac(), opp] });   // Quick match: 11v11 on the immense (colossal) pitch, 150 s halves, real time
      onlineSet({ status: 'Starting the match...' });
    };
    setTimeout(go, 400);
  }
  function onlineResult(res, home, away, me) {
    const st2 = res.stats, mine = res.score[me], theirs = res.score[1 - me], O = App.online;
    let rv = ''; if (O && O.quick && O.quick.kind) { const ch = O.quick.kind === 'champs', c = ch ? Math.round(champPay(mine, theirs) * EARN) : rivCoins(mine, theirs); State.addCoins(c, (ch ? 'Champions' : 'Rivals') + ' match'); rv = `<p class="gold">+${fmt(c)} coins</p>` + (ch ? champFees(mine, theirs) : '') + rivRecord(O.quick.kind, mine, theirs); State.save(); }
    modal(`<h1>${mine > theirs ? 'YOU WIN!' : mine < theirs ? 'YOU LOSE' : 'DRAW'}</h1>
      <h2>${esc(home.name)} ${res.score[0]} - ${res.score[1]} ${esc(away.name)}</h2>
      ${[['Possession', st2.possession[0] + '%', st2.possession[1] + '%'], ['Shots', st2.shots[0], st2.shots[1]], ['On target', st2.onTarget[0], st2.onTarget[1]], ['Passes', st2.passes[0], st2.passes[1]], ['Tackles', st2.tackles[0], st2.tackles[1]]]
        .map(r => `<div class="row between"><span>${r[1]}</span><span class="dim">${r[0]}</span><span>${r[2]}</span></div>`).join('')}
      ${rv}<p class="gold" id="rm-note" style="font-size:9px">${O && O.rematchAsked ? 'Your opponent wants a rematch!' : ''}</p>
      <div class="row mt">${O && O.session && !O.session.closed ? '<button class="btn y" data-act="on-rematch" id="rm-btn">Rematch</button>' : ''}${O && O.quick ? '<button class="btn g" data-act="qm-again">New opponent</button>' : ''}<button class="btn" data-act="on-back">Back to Online</button></div>`);
  }

  /* ---- v172: Division Rivals and Champions (JODIO: "online, Rivals/Champs"). Online matches against real players found by Quick match;
     if nobody is free within RIV_WAIT seconds an AI rival of your division's level steps in. State lives in D().rivals, weeks start Monday (UTC). ---- */
  const RIV_WAIT = 40, RIV_NEED = 12, CH_GAMES = 15, CH_QUAL = 4;
  const rivDivName = i => (i >= 10 ? 'Elite' : 'Division ' + (10 - i));
  const rivWeekCoins = (div, w) => (w < 3 ? 0 : 10000 + div * 6000 + Math.min(w, 20) * 1500);
  const champCoins = w => w * 8000 + (w >= 13 ? 100000 : w >= 11 ? 60000 : w >= 7 ? 25000 : 0);
  // v262 (JODIO): a Rivals win pays 120K in Division 10 up to 230K in Division 5, then 240K in Division 4 up to 310K in Division 1 (Elite 310K); 45% less against an AI rival. Draws and defeats pay as before.
  const rivWin = div => (div >= 10 ? 310000 : div <= 5 ? 120000 + div * 22000 : 240000 + (div - 6) * 70000 / 3);
  const rivCoins = (gf, ga, ai) => (gf > ga ? Math.round(rivWin(RV().div) * (ai ? 0.55 : 1)) : Math.round((gf === ga ? 600 : 300) * EARN));
  /** v263: an AI style string gets the shape of its system ('2-2-2|tikitaka' -> '2-2-2|tikitaka@0'); */
  const withShape = st => { st = String(st || ''); if (st.indexOf('@') >= 0) return st; const k = (st.split('|')[1] || ''), f = Engine.SYS_FORM[k]; return f == null ? st : st + '@' + f; };
  const rivLearn = r => { try { T5().learnFrom(r.scout); } catch (e) { /* the rivals just do not remember this one */ } };   // v262: Rivals / Champions / Champions League sides remember how you play
  // v207 (JODIO): each Champions match pays and costs 40% more than any other mode: win 56K and goal 14K (Champions League 40K / 10K, both before the +30%), goal conceded 21K (Top 5 15K), defeat 14K (10K), quitting 28K (20K). A draw counts as a defeat.
  const CH_PAY = { win: 56000, goal: 14000, conceded: 21000, loss: 14000, quit: 28000 };
  const champPay = (gf, ga) => (gf > ga ? CH_PAY.win : 0) + gf * CH_PAY.goal;
  function champFees(gf, ga) {
    const t = chargeCoins(ga * CH_PAY.conceded, 'Champions: goals conceded') + (gf > ga ? 0 : chargeCoins(CH_PAY.loss, 'Champions: defeat'));
    updateHeader(); return t ? `<p class="bad">Champions: -${fmt(t)} coins (${ga} conceded${gf > ga ? '' : ', defeat'})</p>` : '';
  }
  function rivWeek() { const n = new Date(), t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()), dow = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dow * 864e5).toISOString().slice(0, 10); }
  function RV() {
    const st = D(); let r = st.rivals;
    if (!r || typeof r !== 'object') r = st.rivals = { div: 0, pts: 0, week: rivWeek(), w: 0, d: 0, l: 0, champQ: false, champs: null, pending: null };
    if (r.week !== rivWeek()) {                                    // a new week: bank last week's rewards for the Claim button, then reset
      const c = rivWeekCoins(r.div, r.w) + (r.champs && !r.champs.paid ? champCoins(r.champs.w) : 0);
      if (c) r.pending = { coins: c + (r.pending ? r.pending.coins : 0) };
      r.week = rivWeek(); r.w = r.d = r.l = 0; r.champQ = false; r.champs = null; State.save();
    }
    return r;
  }
  const rivChampsOpen = () => { const r = RV(); return r.champQ && r.champs && r.champs.g < CH_GAMES; };
  /** Records one Rivals or Champions result and returns the note for the full-time pop-up. */
  function rivRecord(kind, gf, ga) {
    const r = RV(), win = gf > ga, draw = gf === ga; let out = '';
    if (kind === 'champs') {
      const c = r.champs; if (!c || c.g >= CH_GAMES) return '';
      c.g++; if (win) c.w++; else c.l++;                           // Champions: a draw counts as a loss
      out = `<p class="${win ? 'good' : 'bad'}">Champions: ${c.w} W - ${c.l} L (${c.g}/${CH_GAMES} played)</p>`;
      if (c.g >= CH_GAMES && !c.paid) { c.paid = true; const p = champCoins(c.w); State.addCoins(p, 'Champions finals: ' + c.w + ' wins'); out += `<p class="gold">Finals over with ${c.w} wins: +${fmt(p)} coins</p>`; }
    } else {
      const was = r.div;
      if (win) { r.w++; r.pts += 3; } else if (draw) { r.d++; r.pts += 1; } else { r.l++; r.pts = Math.max(0, r.pts - 1); }
      if (r.div < 10 && r.pts >= RIV_NEED) { r.div++; r.pts = 0; }
      out = `<p class="${win ? 'good' : draw ? 'gold' : 'bad'}">Rivals: ${win ? '+3' : draw ? '+1' : '-1'} rank points · ${rivDivName(r.div)} ${r.div >= 10 ? r.pts + ' pts' : r.pts + '/' + RIV_NEED}</p>`;
      if (r.div > was) out += `<p class="gold">PROMOTED to ${rivDivName(r.div)}!</p>`;
      if (r.w >= CH_QUAL && !r.champQ) { r.champQ = true; r.champs = { g: 0, w: 0, l: 0, paid: false }; out += '<p class="gold">You qualified for this week\'s Champions finals!</p>'; }
    }
    State.save(); return out;
  }
  function rivalsAI(kind) {
    if (!onlineSquadReady()) { autoBuildSquad(); if (!onlineSquadReady()) { toast('Your XI needs 11 players. Go to Squad → Auto-build.', 'bad'); return; } }
    // v261 (JODIO): Division 10 to 6 rivals field 81-96 players, Division 5 to 1, Elite and the Champions finals 90-96. Every rival has its own way of playing, and switches it mid-match to beat you.
    const r = RV(), top = kind === 'champs' || r.div >= 5, lo = top ? 90 : 81, seed = (Math.random() * 1e9) | 0;
    const RIVALS = [['Real Rivals', '2-2-2|tikitaka'], ['United FC', '1-3-2|wings'], ['Atletico Pixel', '3-1-2|lowblock'], ['Inter 99', '3-2-1|counter'], ['Dynamo Retro', '1-2-3|gegen'],
      ['Sporting Arcade', '2-3-1|positional'], ['Olympique 8-Bit', '2-1-3|highline'], ['Borussia Block', '2-2-2|total'], ['Lazio Lite', '1-3-2|falsenine'], ['Benfica Bytes', '3-1-2|gegen@11']].map(x => [x[0], withShape(x[1])]);
    const RV0 = RIVALS[seed % RIVALS.length];
    const away = Engine.buildOpponent({ name: RV0[0], lo, hi: 96, pool: 'all', specials: kind === 'champs', floor: lo - 4 }, seed); away.name = RV0[0];
    let prior = null; try { prior = T5().root().scout || null; } catch (e) { /* no memory yet */ }
    away.learn = { prior, every: 6 }; away.switchTac = true;
    const home = { name: D().clubName, short: 'RFC', cards: State.matchCards() };
    runMatch({ tag: kind === 'champs' ? 'Champions' : 'Rivals', home, away, humans: [0], knockout: true, extraTime: true, noSpeed: true, pitch: 'colossal', halfSeconds: 90, styles: [myTac(), RV0[1]],
      onEnd: res => finishMatch(res, away, { mult: 1, q: { mode: kind }, lossFee: kind === 'champs' ? 0 : null, coins: x => kind === 'champs' ? champPay(x.score[0], x.won ? -1 : 99) : rivCoins(x.score[0], x.score[1], true) / EARN,
        after: x => (rivLearn(x), '') + (kind === 'champs' ? champFees(x.won ? 1 : 0, x.score[1]) : '') + rivRecord(kind, x.won ? 1 : 0, x.won ? 0 : x.draw ? 0 : 1) }),
      onQuit: () => quitMatch(kind === 'champs' ? CH_PAY.quit : null) });
  }
  VIEWS.rivals = function () {
    const r = RV(), c = r.champs, elite = r.div >= 10, pct = elite ? 100 : Math.round(r.pts / RIV_NEED * 100);
    const bar = (p, col) => `<div style="height:10px;background:#222;border:2px solid #000;margin:6px 0"><div style="height:100%;width:${p}%;background:${col}"></div></div>`;
    const claim = r.pending ? `<div class="px" style="border-color:#f5c542"><h3 class="gold">Weekly rewards ready</h3><p>+${fmt(r.pending.coins)} coins from last week.</p><button class="btn y" data-act="riv-claim">Claim</button></div>` : '';
    const ch = !r.champQ ? `<p>Win <b>${CH_QUAL}</b> Rivals matches this week to qualify.</p>${bar(Math.min(100, r.w / CH_QUAL * 100), '#7aa7ff')}<p class="dim" style="font-size:8px">${Math.min(r.w, CH_QUAL)}/${CH_QUAL} wins</p>`
      : c.g < CH_GAMES ? `<p class="good">Qualified! ${c.w} W - ${c.l} L · ${c.g}/${CH_GAMES} played</p>${bar(c.g / CH_GAMES * 100, '#f5c542')}<p class="dim" style="font-size:8px">Draws count as losses (AI matches go to penalties). Reward now: ${fmt(champCoins(c.w))} coins.</p><button class="btn y" data-act="riv-play" data-k="champs">🏆 Play Champions</button>`
      : `<p class="gold">Finals done: ${c.w} wins, ${fmt(champCoins(c.w))} coins paid. Qualify again next week.</p>`;
    return `<h2>Division Rivals &amp; Champions</h2>${claim}<div class="grid cols-2">
      <div class="px"><h2>Division Rivals</h2><h3 class="gold">${rivDivName(r.div)}</h3>${bar(pct, '#4caf50')}
        <p class="dim" style="font-size:8px">${elite ? 'Top division: ' + r.pts + ' rank points' : r.pts + '/' + RIV_NEED + ' rank points to ' + rivDivName(r.div + 1)} · win +3, draw +1, loss -1</p>
        <p>This week: <b>${r.w}</b> W · ${r.d} D · ${r.l} L</p>
        <p class="dim" style="font-size:8px">Weekly reward (3+ wins): ${fmt(rivWeekCoins(r.div, Math.max(3, r.w)))} coins, paid when the week ends (Monday). Each match also pays coins.</p>
        <button class="btn y qm-btn" data-act="riv-play" data-k="rivals">⚡ PLAY RIVALS</button>
        <p class="dim" style="font-size:8px">You are paired with a real player through Quick match (11v11). If nobody is free after ${RIV_WAIT} s, an AI rival of your division's level plays you.</p></div>
      <div class="px"><h2>Champions</h2>${ch}
        <p class="dim" style="font-size:8px;line-height:1.9">The richest and riskiest games: every win pays ${fmt(CH_PAY.win * EARN)}, every goal ${fmt(CH_PAY.goal * EARN)}; every goal conceded costs ${fmt(CH_PAY.conceded)}, a defeat or draw ${fmt(CH_PAY.loss)}, quitting ${fmt(CH_PAY.quit)}. Finals rewards by wins: 7+ = +25K bonus, 11+ = +60K, 13+ = +100K, plus 8K per win.</p></div></div>`;
  };

  /* ------------------------------ CASUAL -------------------------------- */
  // Two people build any XI from every player in the game and play each other (or the CPU). No coins, no DNF.
  const casualKey = () => 'retro_ut_99_casual' + (RUT.Auth ? RUT.Auth.ns : '');
  const CTL_NAME = { p1: 'Player 1', p2: 'Player 2', cpu: 'CPU' };
  function casualState() {
    if (App.casual) return App.casual;
    let c = null;
    try { c = JSON.parse(localStorage.getItem(casualKey()) || 'null'); } catch (e) { c = null; }
    if (!c || !Array.isArray(c.teams) || c.teams.length !== 2) c = { teams: [{ name: 'Home XI', ctl: 'p1', ids: [] }, { name: 'Away XI', ctl: 'p2', ids: [] }] };
    c.teams.forEach((t, i) => {
      t.name = String(t.name || (i ? 'Away XI' : 'Home XI')).slice(0, 18);
      t.ctl = CTL_NAME[t.ctl] ? t.ctl : 'cpu';
      t.style = validStyle(t.style) ? t.style : 'balanced';
      t.ids = (Array.isArray(t.ids) ? t.ids : []).slice(0, 11).map(id => (id && DB.get(id) ? id : null));
      while (t.ids.length < 11) t.ids.push(null);
    });
    return (App.casual = c);
  }
  function saveCasual() { try { localStorage.setItem(casualKey(), JSON.stringify(App.casual)); } catch (e) { /* storage blocked: keep it for this visit */ } }
  const casualPool = () => DB.players.concat(DB.reserves).slice().sort((a, b) => b.rating - a.rating);
  const castCards = t => t.ids.map(id => (id ? DB.get(id) : null));

  /** Best XI by position from a pool of cards (no duplicate names), optionally shuffled for a random team. */
  function casualAuto(pool, random) {
    const ids = new Array(11).fill(null), used = new Set();
    const list = random ? pool.slice().sort(() => Math.random() - 0.5) : pool;
    State.BASE_FORMATION.forEach((pos, i) => { const c = list.find(x => !used.has(x.name) && x.altPositions.includes(pos)); if (c) { ids[i] = c.id; used.add(c.name); } });
    State.BASE_FORMATION.forEach((pos, i) => { if (ids[i] || pos === 'GK') return; const c = list.find(x => !used.has(x.name) && x.position !== 'GK'); if (c) { ids[i] = c.id; used.add(c.name); } });
    return ids;
  }

  function casualPitchHTML(ti) {
    const t = casualState().teams[ti], cards = castCards(t), chem = SBC.chemistry(cards, State.BASE_FORMATION);
    const RA = rowAttrs('433');
    return `<div class="pitch"><div class="box t"></div><div class="box b"></div>
      ${State.BASE_FORMATION.map((pos, i) => `<div class="slot" ${RA[i]} style="left:${SLOT_XY0[i][0]}%;top:${SLOT_XY0[i][1]}%">
        ${cardHTML(cards[i], { mini: true, attrs: `data-act="cas-slot" data-team="${ti}" data-slot="${i}"`, chem: cards[i] ? chem.perPlayer[i] : null, offpos: cards[i] && !chem.onPos[i], emptyLabel: '+ ' + pos })}
        <div class="lbl">${pos}</div></div>`).join('')}
    </div>`;
  }

  VIEWS.casual = function () {
    const C = casualState();
    const panel = ti => {
      const t = C.teams[ti], cards = castCards(t), n = cards.filter(Boolean).length;
      const rating = n ? SBC.squadRating(cards.map(c => (c ? c.rating : 0))) : 0;
      return `<div class="px cas-team"><div class="row between"><input class="cas-name" data-team="${ti}" value="${esc(t.name)}" maxlength="18" aria-label="Team name">
          <span class="gold" style="font-size:16px">${rating || '--'}</span></div>
        <div class="row"><select class="cas-style" data-team="${ti}" aria-label="Style">${styleOptions(t.style || 'balanced', false)}</select></div>
        <div class="row">${['p1', 'p2', 'cpu'].map(k => `<button class="btn sm ${t.ctl === k ? (k === 'cpu' ? 'c' : 'y') : ''}" data-act="cas-ctl" data-team="${ti}" data-ctl="${k}">${CTL_NAME[k]}</button>`).join('')}</div>
        ${casualPitchHTML(ti)}
        <div class="row mt"><button class="btn sm g" data-act="cas-auto" data-team="${ti}">Best XI</button><button class="btn sm" data-act="cas-random" data-team="${ti}">Random</button><button class="btn sm" data-act="cas-club" data-team="${ti}">My club XI</button><button class="btn sm r" data-act="cas-clear" data-team="${ti}">Clear</button></div>
        <p class="dim" style="font-size:7px">${n}/11 picked · tap a slot to choose any player</p></div>`;
    };
    const hs = C.teams.map(t => t.ctl).filter(k => k !== 'cpu');
    const keys = hs.length === 2
      ? `<b>Player 1</b>: <span class="kbd">WASD</span> move · <span class="kbd">L-SHIFT</span> sprint · <span class="kbd">F</span> pass · <span class="kbd">G</span> shoot · <span class="kbd">H</span> through · <span class="kbd">T</span> lob (or gamepad 1)<br>
         <b>Player 2</b>: <span class="kbd">←↑↓→</span> move · <span class="kbd">R-SHIFT</span> sprint · <span class="kbd">J</span> pass · <span class="kbd">K</span> shoot · <span class="kbd">L</span> through · <span class="kbd">I</span> lob (or <span class="kbd">, . / ;</span>, numpad 0-4, gamepad 2)`
      : hs.length === 1 ? `<span class="kbd">←↑↓→</span>/<span class="kbd">WASD</span> move · <span class="kbd">SHIFT</span> sprint · <span class="kbd">Z</span> pass · <span class="kbd">X</span> shoot · <span class="kbd">C</span> through · <span class="kbd">V</span> lob (or a gamepad)` : 'CPU vs CPU: sit back and watch.';
    return `<div class="px mb"><h2>Casual Match</h2>
        <p class="dim" style="font-size:8px">Pick any players in the game for both teams. No coins, no DNF. Hold pass / shoot / through / lob to fill the power bar; the result depends on that player's stats.</p>
        <p style="font-size:8px;line-height:2.1">${keys}</p>
        <div class="row"><select id="cas-half">${[45, 90, 150, 240].map(v => `<option value="${v}" ${App.halfSeconds === v ? 'selected' : ''}>${v}s per half</option>`).join('')}</select>
          <button class="btn y" data-act="cas-start">▶ Kick off</button><button class="btn" data-act="cas-swap">Swap sides</button></div></div>
      <div class="grid cols-2">${panel(0)}${panel(1)}</div>`;
  };
  function bindCasual() {
    document.querySelectorAll('.cas-name').forEach(el => el.addEventListener('input', () => { casualState().teams[+el.dataset.team].name = el.value.slice(0, 18); saveCasual(); }));
    document.querySelectorAll('.cas-style').forEach(el => el.addEventListener('change', () => { casualState().teams[+el.dataset.team].style = el.value; saveCasual(); }));
    const h = $('#cas-half'); if (h) h.addEventListener('change', () => { App.halfSeconds = +h.value; });
  }

  /** Player picker for a casual slot: search by name, filter by position and club, best first. */
  function casualPicker(ti, slot) {
    const pos = State.BASE_FORMATION[slot];
    const clubs = Object.keys(DB.CLUBS).sort();
    modal(`<h2>${esc(casualState().teams[ti].name)} · pick ${pos}</h2>
      <div class="row mb"><input id="cp-q" placeholder="Search name" style="flex:1;min-width:120px">
        <select id="cp-pos"><option value="${pos}">${pos} (can play)</option><option value="">Any position</option>${State.BASE_FORMATION.filter((x, i, a) => a.indexOf(x) === i && x !== pos).map(x => `<option value="${x}">${x}</option>`).join('')}</select>
        <select id="cp-club"><option value="">Any club</option>${clubs.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <button class="btn sm r" data-act="cas-empty" data-team="${ti}" data-slot="${slot}">Empty slot</button></div>
      <div id="cp-list"></div>`, 'wide');
    const draw = () => {
      const q = $('#cp-q').value.trim().toLowerCase(), ps = $('#cp-pos').value, cl = $('#cp-club').value;
      const taken = new Set(castCards(casualState().teams[ti]).filter(Boolean).map(c => c.name));
      const rows = casualPool().filter(c => (!q || c.name.toLowerCase().includes(q)) && (!ps || c.altPositions.includes(ps)) && (!cl || c.club === cl)).slice(0, 80);
      $('#cp-list').innerHTML = `<table class="list"><tr><th>OVR</th><th>Name</th><th>Pos</th><th>Club</th><th>PAC</th><th>SHO</th><th>PAS</th><th></th></tr>
        ${rows.map(c => `<tr><td>${miniOvr(c)}</td><td>${esc(c.name)}</td><td class="${c.altPositions.includes(pos) ? 'good' : 'bad'}">${c.position}</td><td>${esc(c.club)}</td><td>${c.face.pac}</td><td>${c.face.sho}</td><td>${c.face.pas}</td>
        <td>${taken.has(c.name) ? '<span class="dim">in XI</span>' : `<button class="btn sm g" data-act="cas-pick" data-team="${ti}" data-slot="${slot}" data-card="${c.id}">Pick</button>`}</td></tr>`).join('')}</table>
        ${rows.length ? '' : '<p class="dim">No players match.</p>'}`;
    };
    $('#cp-q').addEventListener('input', draw); $('#cp-pos').addEventListener('change', draw); $('#cp-club').addEventListener('change', draw);
    draw(); $('#cp-q').focus();
  }

  function startCasual() {
    const C = casualState();
    let filled = 0;
    C.teams.forEach(t => {
      if (t.ids.every(Boolean)) return;
      const used = new Set(castCards(t).filter(Boolean).map(c => c.name)), pool = casualPool();
      t.ids = t.ids.map((id, i) => { if (id) return id; const c = pool.find(x => !used.has(x.name) && x.altPositions.includes(State.BASE_FORMATION[i])) || pool.find(x => !used.has(x.name)); used.add(c.name); filled++; return c.id; });
    });
    if (filled) toast('Filled ' + filled + ' empty slot(s) with the best available players');
    saveCasual();
    const team = t => ({ name: t.name || 'XI', short: (t.name || 'XI').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'XI', cards: castCards(t) });
    const home = team(C.teams[0]), away = team(C.teams[1]);
    // human order: Player 1 first (left keyboard / pad 1), then Player 2
    const humans = ['p1', 'p2'].map(k => C.teams.findIndex(t => t.ctl === k)).filter(i => i >= 0);
    runMatch({ home, away, humans, knockout: false, styles: C.teams.map(t => t.style || 'balanced'), onEnd: res => casualResult(res, home, away), onQuit: () => render() });
  }
  function casualResult(res, home, away) {
    const st2 = res.stats, w = res.score[0] > res.score[1] ? home.name : res.score[1] > res.score[0] ? away.name : null;
    modal(`<h1>${w ? esc(w).toUpperCase() + ' WIN!' : 'DRAW'}</h1>
      <h2>${esc(home.name)} ${res.score[0]} - ${res.score[1]} ${esc(away.name)}</h2>
      ${[['Possession', st2.possession[0] + '%', st2.possession[1] + '%'], ['Shots', st2.shots[0], st2.shots[1]], ['On target', st2.onTarget[0], st2.onTarget[1]], ['Passes', st2.passes[0], st2.passes[1]], ['Tackles', st2.tackles[0], st2.tackles[1]], ['Fouls', st2.fouls[0], st2.fouls[1]]]
        .map(r => `<div class="row between"><span>${r[1]}</span><span class="dim">${r[0]}</span><span>${r[2]}</span></div>`).join('')}
      <div class="mt">${res.events.slice(-12).map(e => `<div style="font-size:8px;margin:3px 0">${e.min}' ${esc(e.text)}</div>`).join('')}</div>
      <div class="row mt"><button class="btn y" data-act="cas-rematch">Rematch</button><button class="btn" data-act="nav-close" data-v="casual">Back to teams</button></div>`);
  }

  /** Coin fees (v90): abandoning a match costs 20,000, losing one costs 10,000 (never more than you have). */
  const QUIT_FEE = 20000, LOSS_FEE = 10000;
  function chargeCoins(n, why) { const d = D(), t = Math.max(0, Math.min(n, d.coins)); if (t) State.addCoins(-t, why); return t; }
  function quitMatch(fee) {
    D().dnf++; const t = chargeCoins(typeof fee === 'number' ? fee : QUIT_FEE, 'Match abandoned'); State.save(); updateHeader(); render();
    toast('DNF: match abandoned. No rewards, -' + fmt(t) + ' coins, and -100 coins on future matches.', 'bad');
  }

  function finishMatch(res, away, xo) {
    const st = D(), s = st.stats;
    // Coins = Skill Multiplier × (Completion + Goals − Conceded + Clean Sheet + Corner/Possession bonuses) − DNFs
    const mult = xo && xo.mult != null ? xo.mult : SKILL_MULT[App.difficulty] || 1, st2s = res.stats;
    const parts = { completion: 400, goals: res.score[0] * 60, conceded: -res.score[1] * 30, cleanSheet: res.score[1] === 0 ? 150 : 0,
      corners: (st2s.corners ? st2s.corners[0] : 0) * 15, possession: st2s.possession[0] > 50 ? 100 : 0, win: res.won ? 300 : res.draw ? 100 : 0 };
    const dnfPenalty = Math.min(st.dnf, 5) * 100;
    let coins = Math.max(0, Math.round(mult * Object.values(parts).reduce((x, y) => x + y, 0) - dnfPenalty));
    if (xo && xo.coins) coins = xo.coins(res);                                                  // League: a fixed payout per win and per goal
    coins = Math.round(coins * EARN);                                                          // v103: +30% on everything earned by playing
    if (st.dnf > 0) st.dnf--; // each completed match clears one DNF
    s.matches++; s.goalsFor += res.score[0]; s.goalsAgainst += res.score[1];
    if (res.won) s.wins++; else if (res.draw) s.draws++; else s.losses++;
    State.addCoins(coins, 'Match ' + res.score.join('-') + ' vs ' + away.name);
    const lossFee = !res.won && !res.draw ? chargeCoins(xo && xo.lossFee != null ? xo.lossFee : LOSS_FEE, 'Match lost') : 0;
    const evoNotes = Evo.onMatch({ won: res.won, goalsFor: res.score[0], goalsAgainst: res.score[1] });
    try { const qd = Object.assign({ mode: 'friendly', level: App.difficulty }, xo && xo.q); RUT.Quests.event('match', Object.assign(qd, { won: res.won, draw: res.draw, gf: res.score[0], ga: res.score[1] })); } catch (e) { /* quests are optional */ }
    evoNotes.forEach(n => toast(n, 'good'));
    const lgNote = xo && xo.after ? xo.after(res) : '';
    State.save(); render();
    const st2 = res.stats;
    modal(`<h1>${res.won ? 'VICTORY!' : res.draw ? 'DRAW' : 'DEFEAT'}</h1>
      <h2>${esc(st.clubName)} ${res.score[0]} - ${res.score[1]} ${esc(away.name)}</h2>
      <div class="grid cols-2"><div>
        ${[['Possession', st2.possession[0] + '%', st2.possession[1] + '%'], ['Fouls', st2.fouls[0], st2.fouls[1]], ['Corners', st2.corners[0], st2.corners[1]], ['Shots', st2.shots[0], st2.shots[1]], ['On target', st2.onTarget[0], st2.onTarget[1]], ['Passes', st2.passes[0], st2.passes[1]], ['Tackles', st2.tackles[0], st2.tackles[1]]]
          .map(r => `<div class="row between"><span>${r[1]}</span><span class="dim">${r[0]}</span><span>${r[2]}</span></div>`).join('')}
        ${res.pens ? `<p class="gold">Penalties: ${res.pens.join(' - ')}</p>` : ''}
        <div class="dim" style="font-size:7px">×${mult} skill · completion 400 · goals ${parts.goals} · conceded ${parts.conceded} · clean sheet ${parts.cleanSheet} · corners ${parts.corners} · possession ${parts.possession} · result ${parts.win}${dnfPenalty ? ' · DNF −' + dnfPenalty : ''}</div>
        <p class="gold mt">+${fmt(coins)} coins</p>${lossFee ? `<p class="bad">Defeat: -${fmt(lossFee)} coins</p>` : ''}${xo && xo.fees && xo.fees() ? `<p class="bad">Goals conceded: -${fmt(xo.fees())} coins</p>` : ''}${lgNote}${evoNotes.map(n => `<p class="good">${esc(n)}</p>`).join('')}
      </div><div><h3>Match events</h3>${res.events.map(e => `<div style="font-size:8px;margin:3px 0">${e.min}' ${esc(e.text)}</div>`).join('')}</div></div>
      ${res.players ? '<h3 class="mt">Your XI: player stats</h3>' + psTable(res.players.filter(x => x.t === 0), false) : ''}
      <div class="row mt"><button class="btn y" data-act="close">Continue</button> <button class="btn" data-act="nav" data-v="pstats">All player stats</button></div>`);
  }

  /* ============ v124: PLAYER STATS (per player, XI) ============ */
  const PSK = ['shot', 'sot', 'goal', 'ast', 'key', 'pass', 'pc', 'tk', 'tkw', 'int', 'foul', 'save', 'post', 'skill'];
  function recordPlayerStats(res, away) {
    if (!res || !res.players) return;
    const st = D(); st.pstats = st.pstats || {};
    const mine = res.players.filter(x => x.t === 0);
    mine.forEach(x => { const a = st.pstats[x.n] || (st.pstats[x.n] = { n: x.n, gp: 0 }); a.pos = x.pos; a.ovr = x.ovr; a.gp++; PSK.forEach(k => { a[k] = (a[k] || 0) + (x[k] || 0); }); });
    st.lastPS = { score: res.score.slice(), opp: away && away.name || '', at: Date.now(), p: mine };
    State.save();
  }
  function psTable(rows, total) {
    const order = State.squadCards().map(c => c && c.name), at = r => { const i = order.indexOf(r.n); return i < 0 ? 99 : i; };
    rows = rows.slice().sort((a, b) => at(a) - at(b));
    const v = (r, k) => r[k] || 0, pct = r => v(r, 'pass') ? Math.round(100 * v(r, 'pc') / v(r, 'pass')) + '%' : '–';
    const cols = [['G', r => v(r, 'goal')], ['A', r => v(r, 'ast')], ['Shots', r => v(r, 'shot')], ['On tgt', r => v(r, 'sot')], ['Key pass', r => v(r, 'key')], ['Passes', r => v(r, 'pass')], ['Pass %', pct], ['Tackles', r => v(r, 'tk')], ['Won', r => v(r, 'tkw')], ['Intercept', r => v(r, 'int')], ['Fouls', r => v(r, 'foul')], ['Saves', r => v(r, 'save')], ['Dribbles', r => v(r, 'skill')]];
    return `<table class="list"><tr><th>Pos</th><th>Player</th><th>OVR</th>${total ? '<th>GP</th>' : ''}${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr>${rows.map(r => `<tr><td>${esc(r.pos || '')}</td><td>${esc(r.n)}</td><td>${r.ovr || ''}</td>${total ? '<td>' + v(r, 'gp') + '</td>' : ''}${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="16" class="dim">No matches yet.</td></tr>'}</table>`;
  }
  VIEWS.pstats = function () {
    const st = D(), tab = App.pstTab || 'last', all = Object.values(st.pstats || {}), cur = State.squadCards().filter(Boolean).map(c => c.name);
    const rows = tab === 'last' ? (st.lastPS ? st.lastPS.p : []) : all.filter(r => cur.includes(r.n));
    const sub = tab === 'last' ? (st.lastPS ? 'Last match: ' + esc(st.clubName) + ' ' + st.lastPS.score.join(' - ') + ' ' + esc(st.lastPS.opp) : 'Play a match with your XI to fill this page.') : 'Totals over every match your current XI played with the club (' + (st.stats.matches || 0) + ' matches in total).';
    return `<h2>Player Stats</h2><div class="row mb"><button class="btn ${tab === 'last' ? 'y' : ''}" data-act="pst-tab" data-t="last">Last match</button><button class="btn ${tab === 'all' ? 'y' : ''}" data-act="pst-tab" data-t="all">All matches</button>
      <button class="btn sm r" style="margin-left:auto" data-act="pst-reset">${App.pstArm ? 'Tap again to reset' : 'Reset stats'}</button></div><div class="px"><p class="dim" style="font-size:8px;margin:0 0 8px">${sub}</p>${psTable(rows, tab === 'all')}
      <p class="dim" style="font-size:7px;margin:8px 0 0">Counted in matches you play or watch with your own club (online and casual matches are not counted). Key pass = a pass your team-mate shoots from within 7 seconds. Assist = a key pass before a goal. Pass % = passes that reached a team-mate. Dribbles = skill moves.</p></div>`;
  };

  /* ------------------------------ MARKET -------------------------------- */
  VIEWS.market = function () {
    const tabs = [['search', 'Search'], ['tl', 'Transfer List'], ['wl', 'Watchlist']];
    const body = App.marketTab === 'tl' ? transferListHTML() : App.marketTab === 'wl' ? watchlistHTML() : searchHTML();
    return `<div class="row mb">${tabs.map(([k, l]) => `<button class="btn ${App.marketTab === k ? 'y' : ''}" data-act="mtab" data-t="${k}">${l}${k === 'tl' ? ' (' + D().transferList.length + ')' : k === 'wl' ? ' (' + D().watchlist.length + ')' : ''}</button>`).join('')}
      <span class="dim" style="margin-left:auto;font-size:8px">Market hour H${D().market.tick} · tax 5%</span></div>${(() => { const si = Market.sellInfo(); return `<div class="px mb"><div class="row between"><span>Players sold today: <b class="${si.left ? 'gold' : 'bad'}">${si.n}/${si.limit}</b> <span class="dim" style="font-size:8px">${si.left ? si.left + ' left' : 'limit reached'} · quick sells and listings count · resets at midnight</span></span>
      <button class="btn sm ${si.n ? 'y' : ''}" data-act="sell-reset" ${si.n && D().coins >= si.resetCost ? '' : 'disabled'}>Reset limit · ${fmt(si.resetCost)} coins</button></div></div>`; })()}${body}`;
  };

  function searchHTML() {
    const f = App.filters;
    const leagues = Object.values(DB.LEAGUES);
    const clubs = Object.keys(DB.CLUBS).filter(c => !f.league || DB.CLUBS[c][0] === f.league).sort();
    const pos = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
    const sel = (id, opts, val, any) => `<select id="${id}"><option value="">${any}</option>${opts.map(o => `<option value="${esc(o[0])}" ${val === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    return `<div class="grid mk-grid"><div class="px"><h2>Search</h2>
      <label>Name</label><input id="f-name" value="${esc(f.name || '')}" placeholder="e.g. Mbappé">
      <label>League</label>${sel('f-league', leagues.map(l => [l.code, l.name]), f.league, 'Any league')}
      <label>Club</label>${sel('f-club', clubs.map(c => [c, c]), f.club, 'Any club')}
      <label>Position</label>${sel('f-pos', pos.map(p => [p, p]), f.position, 'Any position')}
      <label>Rarity</label>${sel('f-rarity', [['bronze', 'Bronze'], ['silver', 'Silver'], ['gold', 'Gold']], f.rarity, 'Any rarity')}
      <label>Rating min / max</label><div class="row"><input id="f-minr" type="number" min="40" max="99" value="${esc(f.minRating || '')}" style="width:70px"><input id="f-maxr" type="number" min="40" max="99" value="${esc(f.maxRating || '')}" style="width:70px"></div>
      <label>Buy Now min / max</label><div class="row"><input id="f-minb" type="number" value="${esc(f.minBuyNow || '')}" style="width:100px"><input id="f-maxb" type="number" value="${esc(f.maxBuyNow || '')}" style="width:100px"></div>
      <div class="row mt"><button class="btn y" data-act="msearch">Search</button><button class="btn" data-act="mreset">Reset</button></div>
      <h3 class="mt">Tax calculator</h3>
      <input id="tax-in" type="number" placeholder="Sale price" style="width:140px"><div id="tax-out" class="dim" style="font-size:8px">EA takes 5% of every sale.</div>
      </div>
      <div class="px"><h2>Results</h2><div id="mresults">${resultsHTML()}</div></div></div>`;
  }

  function resultsHTML() {
    if (!App.results.length) return '<p class="dim">Set filters and hit Search.</p>';
    const rows = App.results.map(id => Market.getListing(id)).filter(Boolean);
    return `<table class="list"><tr><th>OVR</th><th>Player</th><th>Club / League</th><th>Bid</th><th>Buy Now</th><th>Price*</th><th>Time</th><th></th></tr>
      ${rows.map(l => {
        const c = DB.get(l.cardId), active = l.status === 'active';
        const mine = l.bidder === 'you';
        return `<tr><td>${miniOvr(c)}</td><td><a href="#" data-act="price" data-card="${c.id}">${esc(c.name)}</a><br><span class="dim">${c.position} · ${c.nation}</span></td>
          <td>${esc(c.club)}<br><span class="dim">${DB.LEAGUES[c.league].short}</span></td>
          <td>${l.currentBid ? fmt(l.currentBid) + (mine ? ' <span class="good">(you)</span>' : '') : '<span class="dim">' + fmt(l.startPrice) + '</span>'}</td>
          <td class="gold">${fmt(l.buyNow)}</td><td class="dim">${fmt(Market.currentPrice(c.id))}</td>
          <td>${active ? Market.timeLeftLabel(l) : '<span class="dim">' + l.status + '</span>'}</td>
          <td>${active ? `<button class="btn sm" data-act="mbid" data-l="${l.id}">Bid ${fmt(Market.nextBid(l.currentBid, l.startPrice))}</button><button class="btn sm y" data-act="mbuy" data-l="${l.id}">Buy</button>` : ''}</td></tr>`;
      }).join('')}</table><p class="dim" style="font-size:7px">*Price = live FUTBIN-style tracked price. Click a name for the price graph.</p>`;
  }

  function readFilters() {
    const v = id => ($(id) ? $(id).value.trim() : '');
    App.filters = { name: v('#f-name'), league: v('#f-league'), club: v('#f-club'), position: v('#f-pos'), rarity: v('#f-rarity'), minRating: v('#f-minr'), maxRating: v('#f-maxr'), minBuyNow: v('#f-minb'), maxBuyNow: v('#f-maxb') };
  }
  function bindMarketForm() {
    $('#f-league').addEventListener('change', () => { readFilters(); App.filters.club = ''; render(); });
    $('#tax-in').addEventListener('input', e => {
      const t = Market.tax(+e.target.value || 0);
      $('#tax-out').innerHTML = `Fee <span class="bad">−${fmt(t.fee)}</span> · You get <span class="good">${fmt(t.net)}</span>`;
    });
    ['#f-name', '#f-minr', '#f-maxr', '#f-minb', '#f-maxb'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') ACTIONS.msearch(); }));
  }

  function transferListHTML() {
    const rows = Market.myListings();
    return `<div class="px"><div class="row between"><h2>Transfer List</h2><button class="btn" data-act="mclear-sold">Clear sold</button></div>
      <p class="dim" style="font-size:8px">List items from your Club or Unassigned pile (click a card → List). AI buyers snipe fair Buy Now prices; overpriced cards expire.</p>
      ${rows.length ? `<table class="list"><tr><th>OVR</th><th>Player</th><th>Status</th><th>Start</th><th>Buy Now</th><th>Bid</th><th>Price*</th><th>Time</th><th></th></tr>
      ${rows.map(r => {
        const l = r.listing, c = l ? DB.get(l.cardId) : State.card(r.itemId);
        const status = r.sold ? `<span class="good">SOLD ${fmt(l.soldFor)}</span>` : !l ? '<span class="dim">Not listed</span>' : l.status === 'active' ? '<span class="gold">Active</span>' : '<span class="bad">Expired</span>';
        return `<tr><td>${miniOvr(c)}</td><td>${esc(c.name)}</td><td>${status}</td><td>${l ? fmt(l.startPrice) : '-'}</td><td>${l ? fmt(l.buyNow) : '-'}</td>
          <td>${l && l.currentBid ? fmt(l.currentBid) : '-'}</td><td class="dim">${fmt(Market.currentPrice(c.id))}</td><td>${l && l.status === 'active' ? Market.timeLeftLabel(l) : '-'}</td>
          <td>${r.sold ? '' : `${!l || l.status !== 'active' ? `<button class="btn sm y" data-act="player" data-item="${r.itemId}">Relist</button>` : ''}<button class="btn sm" data-act="munlist" data-item="${r.itemId}">To Club</button>`}</td></tr>`;
      }).join('')}</table>` : '<p class="dim">Nothing listed.</p>'}</div>`;
  }

  function watchlistHTML() {
    const rows = D().watchlist.map(id => Market.getListing(id)).filter(Boolean);
    return `<div class="px"><h2>Watchlist</h2>${rows.length ? `<table class="list"><tr><th>OVR</th><th>Player</th><th>Status</th><th>Bid</th><th>Buy Now</th><th>Time</th><th></th></tr>
      ${rows.map(l => { const c = DB.get(l.cardId), win = l.bidder === 'you';
        return `<tr><td>${miniOvr(c)}</td><td>${esc(c.name)}</td><td>${l.status !== 'active' ? l.status : win ? '<span class="good">Winning</span>' : l.bidder ? '<span class="bad">Outbid</span>' : 'Watching'}</td>
        <td>${l.currentBid ? fmt(l.currentBid) : fmt(l.startPrice)}</td><td>${fmt(l.buyNow)}</td><td>${l.status === 'active' ? Market.timeLeftLabel(l) : '-'}</td>
        <td>${l.status === 'active' ? `${win ? '' : `<button class="btn sm" data-act="mbid" data-l="${l.id}">Bid ${fmt(Market.nextBid(l.currentBid, l.startPrice))}</button>`}<button class="btn sm y" data-act="mbuy" data-l="${l.id}">Buy</button><button class="btn sm r" data-act="munwatch" data-l="${l.id}">✕</button>` : ''}</td></tr>`; }).join('')}
      </table>` : '<p class="dim">Bid on players to track them here. Won auctions go to Unassigned.</p>'}</div>`;
  }

  /** FUTBIN-style price graph, drawn chunky at low resolution. */
  function drawGraph(canvas, hist) {
    const W = 320, H = 120; canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#070a1f'; g.fillRect(0, 0, W, H);
    const min = Math.min(...hist), max = Math.max(...hist), pad = (max - min) * 0.1 || 1;
    const lo = min - pad, hi = max + pad;
    const X = i => Math.round(30 + i * (W - 36) / (hist.length - 1)), Y = v => Math.round(8 + (1 - (v - lo) / (hi - lo)) * (H - 22));
    g.fillStyle = '#1b2260';
    for (let i = 0; i <= 4; i++) g.fillRect(30, Math.round(8 + i * (H - 22) / 4), W - 36, 1);
    for (let d = 0; d < hist.length; d += 24) g.fillRect(X(d), 8, 1, H - 22);
    // area + stepped line
    g.fillStyle = 'rgba(255,225,74,0.12)';
    hist.forEach((v, i) => { if (i) g.fillRect(X(i - 1), Y(v), X(i) - X(i - 1), H - 14 - Y(v)); });
    g.fillStyle = '#ffe14a';
    hist.forEach((v, i) => { if (!i) return; const x0 = X(i - 1), x1 = X(i), y0 = Y(hist[i - 1]), y1 = Y(v); g.fillRect(x0, y0, x1 - x0 + 1, 2); g.fillRect(x1, Math.min(y0, y1), 2, Math.abs(y1 - y0) + 2); });
    g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#9aa3d9';
    const k = v => v >= 1000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : String(v);
    g.fillText(k(max), 2, Y(max) + 3); g.fillText(k(min), 2, Y(min) + 3);
    g.fillText('-4d', 30, H - 3); g.fillText('now', W - 26, H - 3);
    const last = hist[hist.length - 1];
    g.fillStyle = '#3cf2ff'; g.fillRect(X(hist.length - 1) - 2, Y(last) - 2, 5, 5);
  }

  /* ------------------------- player / price modal ----------------------- */
  function openPlayer(itemId, cardId) {
    const st = D();
    const it = itemId ? st.items[itemId] : null;
    const c = it ? State.card(it) : DB.get(cardId);
    if (!c) return;
    const where = !it ? 'market' : st.unassigned.includes(itemId) ? 'unassigned' : st.transferList.includes(itemId) ? 'tl' : 'club';
    const ps = Market.priceStats(c.baseId && c.promo ? c.baseId : c.id);
    const groups = c.position === 'GK'
      ? { Goalkeeping: ['gkDiving', 'gkHandling', 'gkKicking', 'gkReflexes', 'gkPositioning'], Physical: ['acceleration', 'sprintSpeed', 'agility', 'reactions', 'strength'] }
      : { Pace: ['acceleration', 'sprintSpeed'], Shooting: ['positioning', 'finishing', 'shotPower', 'longShots', 'volleys', 'penalties'], Passing: ['vision', 'crossing', 'fkAccuracy', 'shortPassing', 'longPassing', 'curve'], Dribbling: ['agility', 'balance', 'reactions', 'ballControl', 'dribbling', 'composure'], Defending: ['interceptions', 'headingAccuracy', 'defAwareness', 'standingTackle', 'slidingTackle'], Physical: ['jumping', 'stamina', 'strength', 'aggression'] };
    const pretty = k => k.replace(/^gk/, '').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    const tradeable = it && !it.untradeable && !State.isInSquad(itemId);
    const qs = State.quickSellValue(c, it);
    const dup = it && State.isDuplicate(itemId);
    const curr = ps ? ps.current : c.value;
    const activeListing = it && st.market.listings.find(l => l.itemId === itemId && l.seller === 'you' && l.status === 'active');
    const listForm = tradeable && !activeListing ? `<h3 class="mt">List on Transfer Market</h3>
      <div class="row"><div><label>Start price</label><input id="l-start" type="number" value="${DB.roundToIncrement(curr * 0.8)}" style="width:110px"></div>
      <div><label>Buy Now</label><input id="l-bin" type="number" value="${DB.roundToIncrement(curr)}" style="width:110px"></div>
      <div><label>Duration</label><select id="l-dur">${Object.keys(Market.DURATIONS).map(d => `<option value="${d}" ${d === '1h' ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
      <div class="dim" style="font-size:7px">Price range ${fmt(Market.priceRange(DB.get(it.cardId)).min)} – ${fmt(Market.priceRange(DB.get(it.cardId)).max)} · max ${Market.MAX_ACTIVE_LISTINGS} active listings · 1 market hour = ${Market.TICK_MS / 1000}s</div>
      <div id="l-tax" class="dim" style="font-size:8px"></div>
      <button class="btn y" data-act="list-item" data-item="${itemId}">List item</button>` : '';
    modal(`<div class="grid" style="grid-template-columns: 150px 1fr; gap:20px">
      <div>${cardHTML(c, { chemStyle: it && it.chemStyle })}<div class="mt" style="font-size:8px">${DB.signatureFor(c) ? `<div class="pill ps">★ SIGNATURE: ${esc(DB.signatureFor(c).celebration)}</div>` : ''}
        <div>${esc(c.name)}</div><div class="dim">${esc(c.club)} · ${esc(DB.LEAGUES[c.league].name)}</div>
        <div class="dim">${c.nation} · ${c.altPositions.join('/')}</div>
        ${c.generated ? '<div class="dim">Reserve pool</div>' : ''}${c.promo ? `<div class="gold">${c.promo.toUpperCase()} promo</div>` : ''}${c.clInfo ? `<div class="dim" style="font-size:7px">CL form +${c.clInfo.pct}%${c.clInfo.avg ? ' · avg ' + c.clInfo.avg + ' in ' + c.clInfo.games + ' game' + (c.clInfo.games > 1 ? 's' : '') : ' · no games yet'}</div>` : ''}${c.evoLevel ? `<div class="good">Evolved ×${c.evoLevel}</div>` : ''}</div></div>
      <div>
        ${RUT.GT && RUT.GT.of(c).length ? `<h3>Gametraits</h3><div>${RUT.GT.of(c).map(g => { const t = RUT.GT.BY[g.k]; return `<div class="pill ps" style="background:#a3201a"><img src="${RUT.GT.url(g.k, g.lv > 1)}" alt="" style="width:14px;height:14px;vertical-align:middle"> ${esc(t.name + (g.lv > 1 ? '+' : ''))} <span style="color:#fff;opacity:.7">— ${esc(g.lv > 1 ? t.d2 : t.d)}</span></div>`; }).join('')}</div>` : ''}
        <h3>PlayStyles+</h3><div>${c.playStyles.map(p => { const g = /\+$/.test(p); const k = p.replace(/\+$/, '') + '+'; return `<div class="pill ps${g ? '' : ' silver'}">${esc(PS_ICON[p] || PS_ICON[k] || '')} ${esc(p)} <span style="color:#fff;opacity:.6">— ${esc(PS_DESC[k] || PS_DESC[p] || '')}</span></div>`; }).join('') || '<span class="dim">None</span>'}</div>
        ${(() => { if (!RUT.roleOf) return ''; const ri = roleInfo(c, itemId); return `<h3 class="mt">Role <span class="dim" style="font-size:7px">(${esc(ri.pos)} · ${esc(RUT.ROLE_GROUP_NAME[ri.group])}${ri.auto ? ' · auto, best fit' : ''})</span></h3><div class="pill ps">${esc(ri.role.name)} <span style="color:#fff;opacity:.6">— ${esc(ri.role.desc)}</span></div>${it && where === 'club' ? `<button class="btn sm mt" data-act="role-pick" data-item="${itemId}">Change role</button>` : ''}`; })()}
        
        <div class="stat-grid mt">${Object.entries(groups).map(([g, keys]) => `<div class="grp"><h3>${g}</h3>${keys.map(k => statBar(pretty(k), c.sub[k] || 0)).join('')}</div>`).join('')}</div>
        ${ps ? `<h3 class="mt">Price history (FUTBIN-style)</h3>
          <div class="row between" style="font-size:8px"><span>Now <span class="gold">${fmt(ps.current)}</span></span><span>24h <span class="${ps.change24 >= 0 ? 'good' : 'bad'}">${ps.change24 >= 0 ? '+' : ''}${ps.change24.toFixed(1)}%</span></span>
          <span>Min ${fmt(ps.min)}</span><span>Max ${fmt(ps.max)}</span><span>Avg ${fmt(ps.avg)}</span><span class="dim">Range ${fmt(ps.range.min)}–${fmt(ps.range.max)}</span></div>
          <canvas class="graph" id="pgraph"></canvas>${c.promo ? '<p class="dim" style="font-size:7px">Promo cards can be sold; graph shows the base card.</p>' : ''}` : ''}
        <div class="row mt">
          ${where === 'unassigned' && !dup ? `<button class="btn g" data-act="to-club" data-item="${itemId}">Send to Club</button>` : ''}
          ${dup && where === 'unassigned' ? `<span class="pill" style="background:#5a1020">DUPLICATE</span><button class="btn p" data-act="to-storage" data-item="${itemId}">SBC Storage</button>` : ''}
          ${it && where !== 'tl' && !State.isInSquad(itemId) ? `<button class="btn r" data-act="quick-sell" data-item="${itemId}">Quick sell +${fmt(qs)}</button><span class="dim" style="font-size:7px">Sold today ${Market.sellInfo().n}/${Market.sellInfo().limit}</span>` : ''}
          ${where === 'market' ? `<button class="btn y" data-act="search-card" data-card="${c.id}">Search market</button>` : ''}
          ${it && it.untradeable ? '<span class="dim" style="font-size:8px">Untradeable</span>' : ''}
          ${it && State.isInSquad(itemId) ? '<span class="dim" style="font-size:8px">In your starting XI</span>' : ''}
        </div>
        ${it && where !== 'market' ? `<h3 class="mt">Chemistry Style</h3><div class="row">${Object.entries(DB.CHEM_STYLES).filter(([k]) => (c.position === 'GK') === ['wall', 'cat'].includes(k)).map(([k, cs]) => `<button class="btn sm ${it.chemStyle === k ? 'y' : ''}" data-act="chem-style" data-item="${itemId}" data-style="${k}" title="${esc(Object.entries(cs.sub).map(([a, b]) => '+' + b + ' ' + a).join(', '))}">${esc(cs.icon + ' ' + cs.name)}</button>`).join('')}</div><p class="dim" style="font-size:7px">Full boost at 3 chem, partial at 1–2, none at 0.</p>` : ''}
        ${listForm}
      </div></div>`);
    if (ps) drawGraph($('#pgraph'), ps.history);
    const upd = () => { const b = +($('#l-bin') || {}).value || 0; if ($('#l-tax')) { const t = Market.tax(b); $('#l-tax').innerHTML = `If sold at Buy Now: fee <span class="bad">−${fmt(t.fee)}</span>, you receive <span class="good">${fmt(t.net)}</span>`; } };
    if ($('#l-bin')) { $('#l-bin').addEventListener('input', upd); upd(); }
  }

  /* ------------------------------- SBCs --------------------------------- */
  VIEWS.sbc = function () {
    const groups = {};
    SBC.SBCS.forEach(s => { (groups[s.group] = groups[s.group] || []).push(s); });
    const rewardText = r => r.type === 'pack' ? Packs.PACKS[r.packId].name : r.type === 'card' ? DB.get(r.baseId).name + (r.promo === 'nlpofm' ? ' NLPOFM' : r.promo === 'clpromo' ? ' CL promo' : '') : fmt(r.amount) + ' coins';
    const dl = SBC.daily();
    const head = `<div class="px mb"><div class="row between"><span>SBCs today: <b class="${dl.left ? 'gold' : 'bad'}">${dl.n}/${dl.limit}</b> <span class="dim" style="font-size:8px">${dl.left ? dl.left + ' left' : 'limit reached'} · resets at midnight</span></span>
      <button class="btn sm ${dl.n ? 'y' : ''}" data-act="sbc-reset" ${dl.n && D().coins >= dl.resetCost ? '' : 'disabled'}>Reset limit · ${fmt(dl.resetCost)} coins</button></div>
      <p class="dim" style="font-size:8px;margin:6px 0 0">Packs won from SBCs have weaker odds for high-rated players and are opened first. SBCs that reward a 91+ card cost coins to validate.</p></div>`;
    return head + Object.entries(groups).map(([g, list]) => `<h2>${esc(g)}</h2><div class="grid cols-3 mb">${list.map(s => {
      const done = D().sbcDone[s.id] || 0, avail = SBC.isAvailable(s);
      const rc = s.reward.type === 'card' ? (s.reward.promo === 'nlpofm' || s.reward.promo === 'clpromo' || s.reward.promo === 'lpotm' || s.reward.promo === 'lpotw' ? DB.registerPromo(s.reward.baseId, s.reward.promo, s.reward.boost) : DB.get(s.reward.baseId)) : null;
      return `<div class="px"><div class="row between"><h3>${esc(s.name)}</h3>${done ? `<span class="good" style="font-size:8px">✓ ${s.repeatable || (avail && s.reward.type === 'pack') ? '×' + done : s.reward.type === 'pack' ? 'DONE · again after the daily refresh or a reset' : 'DONE'}</span>` : ''}</div>
        <p class="dim" style="font-size:8px">${esc(s.desc)}</p>
        <div class="row">${rc ? cardHTML(rc, { mini: true }) : `<div class="pack ${Packs.PACKS[s.reward.packId].tier}" style="width:70px;height:96px;margin:0;font-size:7px"><div class="stripe"></div>${esc(Packs.PACKS[s.reward.packId].name)}</div>`}
          <div style="flex:1;font-size:7px">${s.reqs.map(r => `<div>• ${esc(SBC.RULES[r.type]([], { rating: 0, chem: 0 }, r).label)}</div>`).join('')}</div></div>
        ${SBC.feeOf(s) ? `<div class="bad" style="font-size:8px;margin-top:4px">Validation fee: ${fmt(SBC.feeOf(s))} coins</div>` : ''}
        <div class="row between mt"><span class="gold" style="font-size:8px">Reward: ${esc(rewardText(s.reward))}</span>
        <button class="btn sm y" data-act="sbc-open" data-id="${s.id}" ${avail ? '' : 'disabled'}>${avail ? 'Build' : 'Done'}</button></div></div>`;
    }).join('')}</div>`).join('');
  };

  VIEWS['sbc-build'] = function () {
    const s = SBC.SBCS.find(x => x.id === App.sbc.id);
    const v = SBC.validate(s, App.sbc.slots);
    return `<div class="grid cols-2"><div class="px">${pitchHTML(App.sbc.slots, 'sbc-slot')}</div>
      <div class="px"><div class="row between"><h2>${esc(s.name)}</h2><button class="btn sm" data-act="nav" data-v="sbc">Back</button></div>
        <p class="dim" style="font-size:8px">${esc(s.desc)}</p>
        <div class="row between"><span class="dim">Rating</span><span class="gold" style="font-size:18px">${v.rating} <span class="dim" style="font-size:8px">(${v.exact.toFixed(2)})</span></span></div>
        <div class="row between"><span class="dim">Chemistry</span><span class="good" style="font-size:18px">${v.chem}/33</span></div>
        <h3 class="mt">Requirements</h3>
        <div class="req ${v.isValid ? 'ok' : 'no'}"><span>isValid: ${v.isValid}</span><span class="dim">${esc(v.error || 'ready to submit')}</span></div>
        ${v.results.map(r => `<div class="req ${r.pass ? 'ok' : 'no'}"><span>${r.pass ? '✓' : '✗'} ${esc(r.label)}</span><span class="dim">${esc(r.detail)}</span></div>`).join('')}
        <div class="row mt"><button class="btn c" data-act="sbc-auto">Auto-fill (best + cheapest)</button><button class="btn" data-act="sbc-clear">Clear</button>
          <button class="btn y" data-act="sbc-submit" ${v.ok ? '' : 'disabled'}>Submit${SBC.feeOf(s) ? ' (−' + fmt(SBC.feeOf(s)) + ')' : ''}</button></div>
        <p class="dim" style="font-size:8px">SBCs today: ${SBC.daily().n}/${SBC.DAILY_LIMIT}${SBC.feeOf(s) ? ' · this one costs ' + fmt(SBC.feeOf(s)) + ' coins to validate' : ''}.</p>
        <p class="dim" style="font-size:8px">Submitted players are consumed. Players in your starting XI are protected and can't be used.</p>
        <p class="dim" style="font-size:8px">Squad rating uses FC's weighted formula: players above the average add their excess again before dividing by 11.</p>
      </div></div>`;
  };

  /* ---------------------------- EVOLUTIONS ------------------------------ */
  /** The card as it will be once the evolution is complete (same rules as State.card: boosts, clamps, PlayStyle gates). */
  function evoProject(c, evo) {
    const b = evo.boosts, cl = RUT.DB.clamp, face = {}, subS = {};
    Object.keys(c.face).forEach(k => { face[k] = cl(c.face[k] + (b.face[k] || 0), 1, 99); });
    Object.keys(c.sub).forEach(k => { subS[k] = cl(c.sub[k] + (b.sub[k] || 0), 1, 99); });
    const rating = cl(c.rating + b.rating, 1, Math.max(94, c.rating));
    return Object.assign({}, c, { rating, face, sub: subS, rarity: 'evo', playStyles: (() => { const e = RUT.DB.evoPs(c.playStyles, b.ps); return RUT.DB.psGate(rating, subS, c.playStyles.concat(e.ps), e.ps, e.cap); })() });
  }
  /** Before / after picture of what an evolution does to a player: both cards, every FACE stat as a bar with its gain, PlayStyles gained or refused. */
  function evoPreviewHTML(c, evo) {
    const a = evoProject(c, evo), keys = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
    const rows = keys.map(k => { const d = a.face[k] - c.face[k];
      return `<div class="evo-st"><span class="k">${k.toUpperCase()}</span><div class="evo-bar"><i class="b" style="width:${c.face[k]}%"></i>${d > 0 ? `<i class="g" style="left:${c.face[k]}%;width:${d}%"></i>` : ''}</div><span class="n">${c.face[k]}<em> → </em><b class="${d > 0 ? 'good' : ''}">${a.face[k]}</b>${d > 0 ? ` <small class="good">+${d}</small>` : ''}</span></div>`; }).join('');
    const gained = a.playStyles.filter(x => !c.playStyles.includes(x)), kept = a.playStyles.filter(x => c.playStyles.includes(x));
    const refused = evo.boosts.ps.filter(x => !a.playStyles.includes(x));
    const chips = kept.map(x => `<span class="ps-chip">${esc(x)}</span>`).concat(gained.map(x => `<span class="ps-chip new">+ ${esc(x)}</span>`), refused.map(x => `<span class="ps-chip no" title="Needs 88+ speed / acceleration, and gold cards hold 2 PlayStyles at most">✕ ${esc(x)}</span>`)).join('') || '<span class="dim" style="font-size:7px">No PlayStyles</span>';
    return `<div class="evo-prev"><div class="evo-cards">${cardHTML(c, { mini: true })}<div class="evo-arrow">➜<br><small class="good">+${a.rating - c.rating} OVR</small></div>${cardHTML(a, { mini: true })}</div>
      <div class="evo-stats">${rows}</div><div class="evo-ps">${chips}</div></div>`;
  }

  VIEWS.evo = function () {
    const st = D();
    const active = Object.entries(st.evos.active);
    return `<div class="px"><h2>Active Evolutions (${active.length}/${Evo.MAX_ACTIVE_EVOS})</h2>
      ${active.length ? `<div class="grid cols-3">${active.map(([itemId, a]) => {
        const evo = Evo.EVOS.find(e => e.id === a.evoId);
        return `<div class="row">${cardHTML(State.card(itemId), { mini: true, attrs: `data-act="player" data-item="${itemId}"` })}<div style="flex:1">
          <h3>${esc(evo.name)}</h3>${evo.objectives.map(o => { const p = Math.min(o.target, a.progress[o.key] || 0); return `<div class="stat-line"><span>${esc(o.label)}</span><span>${p}/${o.target}</span></div><div class="bar"><i style="width:${p / o.target * 100}%;background:#4cff7a"></i></div>`; }).join('')}
          ${State.isInSquad(itemId) ? '<p class="good" style="font-size:7px">In XI — progressing</p>' : '<p class="bad" style="font-size:7px">Not in XI — add to squad to progress</p>'}${evoPreviewHTML(State.card(itemId), evo)}</div></div>`;
      }).join('')}</div>` : '<p class="dim">No active Evolutions.</p>'}</div>
      <h2 class="mt">Available</h2><div class="grid cols-3">${Evo.EVOS.map(e => {
        const b = e.boosts;
        return `<div class="px"><h3>${esc(e.name)}</h3><p class="dim" style="font-size:8px">${esc(e.desc)}</p>
          <div style="font-size:8px">Cost: <span class="${e.cost ? 'gold' : 'good'}">${e.cost ? fmt(e.cost) + ' coins' : 'Free'}</span></div>
          <div style="font-size:8px">Eligibility: <span class="gold">${esc(e.eligText)}</span></div>
          <div style="font-size:8px" class="mt">${e.objectives.map(o => '• ' + esc(o.label)).join('<br>')}</div>
          <div style="font-size:8px" class="mt good">Upgrades: +${b.rating} OVR · ${Object.entries(b.face).map(([k, v]) => '+' + v + ' ' + k.toUpperCase()).join(' · ')}${b.ps.length ? ' · ' + b.ps.join(', ') : ''}</div>
          <button class="btn sm y mt" data-act="evo-pick" data-id="${e.id}">Choose player</button></div>`;
      }).join('')}</div>`;
  };

  function evoPicker(evoId) {
    const evo = Evo.EVOS.find(e => e.id === evoId), st = D();
    const rows = st.club.map(id => ({ id, c: State.card(id) })).filter(x => x.c && evo.eligible(x.c) && !st.evos.active[x.id] && !(st.items[x.id].evo && st.items[x.id].evo.applied.includes(evoId)));
    modal(`<h2>${esc(evo.name)} — eligible players</h2><p class="dim" style="font-size:8px">Evolved cards can still be sold.${evo.cost ? ' Cost: <span class="gold">' + fmt(evo.cost) + ' coins</span>' + (st.coins < evo.cost ? ' <span class="bad">(not enough coins)</span>' : '') : ''}</p>
      <div class="evo-list">${rows.map(x => `<div class="evo-opt" data-act="evo-start" data-id="${evoId}" data-item="${x.id}">${evoPreviewHTML(x.c, evo)}<button class="btn sm y" data-act="evo-start" data-id="${evoId}" data-item="${x.id}">Evolve ${esc(x.c.name)}</button></div>`).join('') || '<p class="dim">No eligible players in your club.</p>'}</div>`);
  }

  /* ======================= v109: PROMO SHOP ======================= */
  /* Buy any Nations League / Champions League promo player straight from the shop at his current market value; handing in his plain gold card as an add-on takes 90% of that card's market value off the price. Not a sale, so it does not use the daily sell limit. */
  const PSHOP = { type: 'all', name: '', sort: 'rating', open: false };
  const PSHOP_TYPES = { nlpofm: ['NL Player of the Month', 5], nlstar: ['NL Star', 3], clpromo: ['Champions League', 4], lpotw: ['Player of the Week', 1], lpotm: ['Player of the Month', 2], toty: ['Team of the Year', 0], tots: ['Team of the Season', 0], fstar: ['Future Star', 1] };
  const PSHOP_TRADE = 0.9;
  const shopPrice = c => DB.roundToIncrement(Market.currentPrice(c.id));
  function shopTradeItem(c) {   // an owned, free, plain copy of the promo player's gold card
    const d = D();
    for (const k of ['unassigned', 'sbcStorage', 'club']) {
      const id = (d[k] || []).find(x => { const it = d.items[x]; return it && it.cardId === c.baseId && !it.evo && !State.isInSquad(x); });
      if (id) return id;
    }
    return null;
  }
  const shopCredit = c => { const b = DB.get(c.baseId); return b ? Math.floor(shopPrice(b) * PSHOP_TRADE) : 0; };
  function shopCards() {
    let l = DB.all.filter(c => PSHOP_TYPES[c.promo] && c.baseId);
    if (PSHOP.type !== 'all') l = l.filter(c => c.promo === PSHOP.type);
    const q = PSHOP.name.trim().toLowerCase(); if (q) l = l.filter(c => c.name.toLowerCase().includes(q) || c.club.toLowerCase().includes(q));
    const price = new Map(l.map(c => [c.id, shopPrice(c)]));
    l.sort(PSHOP.sort === 'price' ? (a, b) => price.get(b.id) - price.get(a.id) : PSHOP.sort === 'cheap' ? (a, b) => price.get(a.id) - price.get(b.id) : (a, b) => b.rating - a.rating || price.get(b.id) - price.get(a.id));
    return l;
  }
  VIEWS.promoshop = function () {
    const all = shopCards(), shown = all;   // v121: every promo player is listed (was the first 48)
    const tabs = [['all', 'All promos']].concat(Object.entries(PSHOP_TYPES).map(([k, v]) => [k, v[0]]));
    return `<h2>Promo Shop</h2><div class="px mb"><p class="dim" style="font-size:8px;line-height:1.9;margin:0">Buy a promo player at his live market value. Own his plain gold card? Hand it in as an add-on and <b class="gold">${Math.round(PSHOP_TRADE * 100)}%</b> of that gold card's market value comes off the price. Bought players arrive in Unassigned. Buying here does not use your daily sell limit.</p></div>
      <div class="row mb">${tabs.map(([k, l]) => `<button class="btn sm ${PSHOP.type === k ? 'y' : ''}" data-act="ps-type" data-t="${k}">${esc(l)}</button>`).join('')}
        <input id="ps-name" value="${esc(PSHOP.name)}" placeholder="Search name or club" style="width:150px">
        <select id="ps-sort"><option value="rating" ${PSHOP.sort === 'rating' ? 'selected' : ''}>Highest rated</option><option value="price" ${PSHOP.sort === 'price' ? 'selected' : ''}>Price high to low</option><option value="cheap" ${PSHOP.sort === 'cheap' ? 'selected' : ''}>Price low to high</option></select>
        <span class="dim" style="font-size:8px;margin-left:auto">${all.length} promo player${all.length === 1 ? '' : 's'}</span></div>
      <div class="grid cols-3">${shown.map(c => {
        const pr = shopPrice(c), ti = shopTradeItem(c), cr = ti ? shopCredit(c) : 0, net = Math.max(0, pr - cr), tag = PSHOP_TYPES[c.promo][0] + (c.occ > 1 ? ' #' + c.occ : '');
        return `<div class="px"><div class="row">${cardHTML(c, { mini: true, attrs: `data-act="price" data-card="${c.id}"` })}<div style="flex:1;font-size:8px;line-height:1.8">
          <b>${esc(c.name)}</b><div class="dim">${esc(tag)} · ${esc(c.position)} · ${c.rating}</div><div>Market value <span class="gold">${fmt(pr)}</span></div></div></div>
          <div class="row mt" style="flex-wrap:wrap"><button class="btn sm y" data-act="ps-buy" data-card="${c.id}" ${D().coins >= pr ? '' : 'disabled'}>Buy · ${fmt(pr)}</button>
          ${ti ? `<button class="btn sm g" data-act="ps-buy" data-card="${c.id}" data-trade="1" ${D().coins >= net ? '' : 'disabled'} title="Hands in your ${esc(c.name)} gold card">+ Gold card · ${fmt(net)}</button>` : `<span class="dim" style="font-size:7px">No spare ${esc(c.name.split(' ').slice(-1)[0])} gold card</span>`}</div></div>`;
      }).join('') || '<div class="dim">No promo players match.</div>'}</div>`;
  };
  function shopBind() {
    const n = $('#ps-name'), s = $('#ps-sort');
    if (n) n.addEventListener('change', () => { PSHOP.name = n.value; render(); });
    if (s) s.addEventListener('change', () => { PSHOP.sort = s.value; render(); });
  }
  function shopBuy(cardId, trade) {
    const c = DB.get(cardId); if (!c || !PSHOP_TYPES[c.promo]) return { ok: false, msg: 'That card is not in the shop.' };
    const pr = shopPrice(c); let ti = null, cr = 0;
    if (trade) { ti = shopTradeItem(c); if (!ti) return { ok: false, msg: 'You have no spare gold card of ' + c.name + ' to hand in.' }; cr = shopCredit(c); }
    const net = Math.max(0, pr - cr);
    if (D().coins < net) return { ok: false, msg: 'You need ' + fmt(net) + ' coins.' };
    if (ti) State.destroy(ti);
    State.addCoins(-net, 'Promo Shop: ' + c.name);
    const it = State.newItem(c.id, { promo: { baseId: c.baseId, type: c.promo, boost: c.pickIdx || PSHOP_TYPES[c.promo][1] } }); D().unassigned.push(it.id);
    State.log('Bought ' + c.name + ' (' + PSHOP_TYPES[c.promo][0] + ')' + (ti ? ' with his gold card' : '')); State.save();
    return { ok: true, msg: 'Bought ' + c.name + ' for ' + fmt(net) + (ti ? ' (gold card handed in, -' + fmt(cr) + ')' : '') + '. Check Unassigned.' };
  }

  /* ------------------------------- STORE -------------------------------- */
  VIEWS.store = function () {
    const st = D();
    return `<h2>Store</h2><div class="grid cols-3">${Object.values(Packs.PACKS).filter(p => (!p.storeHidden || st.packsOwned[p.id]) && (p.tier !== "bdor" || !RUT.bdorPackable || RUT.bdorPackable())).map(p => {
      const owned = st.packsOwned[p.id] || 0;
      const odds = p.odds ? p.odds.join(' · ') : p.bands.map(b => `${b[0]}${b[1] >= 99 ? '+' : '-' + b[1]}: ${Math.round(b[2] / p.bands.reduce((a, x) => a + x[2], 0) * 1000) / 10}%`).join(' · ');
      return `<div class="px${p.tier === 'bdor' ? ' st-bdor' : ''}" style="text-align:center">${p.tier === 'bdor' ? `<div class="st-bdtitle">&#9733; ${p.id === 'bdorg' ? 'GUARANTEED' : "BALLON D'OR 2026"} &#9733;</div><div class="st-ball"></div>` : ''}<div class="pack ${p.tier}"><div class="stripe"></div><div style="position:relative">${esc(p.name.toUpperCase())}<br><br>${p.count} ITEMS</div></div>
        <div class="gold">${p.price ? fmt(p.price) + ' coins' : 'Free'}</div><div class="${p.untradeable ? 'dim' : 'gold'}" style="font-size:8px">${p.untradeable ? '&#128274; UNTRADEABLE players' : 'TRADEABLE players'}</div><div class="dim" style="font-size:7px;margin:6px 0">${esc(odds)}${p.guaranteeMin ? ' · 1× ' + p.guaranteeMin + '+ guaranteed' : ''}${p.promoChance ? ' · TOTW upgrades' : ''}</div>
        <div class="row" style="justify-content:center">${owned ? `<button class="btn g" data-act="open-pack" data-pack="${p.id}">Open (${owned})</button>` : ''}
        ${p.price ? `<button class="btn y" data-act="buy-pack" data-pack="${p.id}" ${st.coins >= p.price ? '' : 'disabled'}>Buy & Open</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  };

  /** Pack opening → optional 16-bit walkout → reveal grid. */
  function openPack(packId, buy) {
    const res = Packs.open(packId, { buy });
    if (res.ok && res.dupes && res.dupes.length) setTimeout(() => toast(res.dupes.length + ' duplicate(s) in this pack: list, store in SBC Storage or quick sell.'), 2500);
    if (!res.ok) { toast(res.msg, 'bad'); return; }
    updateHeader();
    if (State.lastTrim) { const n = State.lastTrim; State.lastTrim = 0; setTimeout(() => toast('Unassigned is full (100): ' + n + ' lowest-rated player(s) deleted', 'bad'), 3000); }
    res.items = res.items.filter(id => State.item(id));
    const pk = res.items.map(id => State.card(id)), goat = pk.find(c => c && c.name === 'Lionel Messi') || pk.find(c => c && c.name === 'Cristiano Ronaldo');   // v142 (JODIO): any Ronaldo in a pack gets the GOAT walkout; v200: any Messi too, with his own scene
    if (goat) { res.walkout = true; res.best = goat; }
    const def = Packs.PACKS[packId]; res.packId = packId;   // v162: every walkout from the Ballon d'Or pack gets the golden 3D plaques
    packFX(def, () => (res.walkout ? walkout(res) : revealPack(res, def)));
  }

  /** v155: 3D pack opening (CSS 3D). The pack spins in, shakes, its front tears open in a flash and the cards follow. The Ballon d'Or pack is golden with a flying golden ball. Click to speed up or skip. */
  function packFX(def, done) {
    const gold = def.tier === 'bdor', el = document.createElement('div');
    el.className = 'pfx' + (gold ? ' gold' : '');
    const sp = Array.from({ length: gold ? 70 : 44 }, () => { const a = Math.random() * 6.283, d = 160 + Math.random() * 420; return `<i class="spark" style="--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d * .7)}px;--z:${Math.round(Math.random() * 500)}px;--d:${(0.55 + Math.random() * .4).toFixed(2)}s;${gold ? 'background:#ffd04a;' : ''}"></i>`; }).join('');
    const face = `<div class="stripe"></div><div style="position:relative">${esc(def.name.toUpperCase())}<br><br>${def.count} ITEMS</div>`;
    el.innerHTML = `<canvas class="pfx-gl"></canvas><div class="floor"></div><div class="rays"></div><div class="pfx-pillar"></div>${gold ? `<div class="ptitle">BALLON D'OR</div>` : ''}
      <div class="scene"><div class="pfx-ring r1"></div><div class="pfx-ring r2"></div><div class="pfx-ring r3"></div><div class="face front pack ${def.tier}" style="margin:0;width:auto;height:auto">${face}</div><div class="face back pack ${def.tier}" style="margin:0;width:auto;height:auto"></div><div class="side l pack ${def.tier}"></div><div class="side r pack ${def.tier}"></div></div>
      ${sp}<div class="light"></div><div class="skip">click to skip</div>`;
    document.body.appendChild(el);
    let went = false, ended = false, t1, t2, stopGL = null;
    if (def.id === 'cl') el.classList.add('cl');
    const end = () => { if (ended) return; ended = true; clearTimeout(t1); clearTimeout(t2); if (stopGL) stopGL(); el.remove(); done(); };
    const go = () => { if (went) return; went = true; clearTimeout(t1); el.classList.add('go'); t2 = setTimeout(end, gold ? 3600 : 2400); };
    if (!window.RUT_PFX_HOLD) t1 = setTimeout(go, gold ? 3200 : 2400);   // (the hold flag is for screenshots in tests)
    el.addEventListener('click', () => (went ? end() : go()));
    // WebGL backdrop (three.js): the golden Ballon d'Or trophy for its pack, drifting light for the others. Without WebGL the CSS scene stands on its own.
    if (RUT.load3D) Promise.resolve(RUT.load3D()).then(() => { if (!ended && window.THREE) { try { stopGL = packGL(el, gold ? 'bdor' : def.id === 'cl' ? 'cl' : 'std').stop; } catch (e) { if (window.console) console.warn('Pack 3D backdrop failed', e); } } });
  }

  /** The 3D scene of a pack opening and of the Ballon d'Or / Champions League reveal. kind: 'bdor' golden ball on a pedestal, 'cl' silver-blue starball, 'std' rings and sparks.
   *  Returns { stop, plaque(what, card), hidePlaque(), boost(v) }. The plaque is a 3D gold slab in front of the ball that flips to show the country, then the position, then the club. */
  function packGL(el, kind, opts) {
    opts = opts || {};
    const T = window.THREE, cv = el.querySelector('canvas.pfx-gl'), W = innerWidth, H = innerHeight, gold = kind === 'bdor', cl = kind === 'cl';
    const renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: !window.RUT_LITE }); renderer.setPixelRatio(window.RUT_LITE ? 1 : Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(W, H, false);   // v204: Lite mode keeps the 3D pack scenes, at lighter settings
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(42, W / H, 0.1, 100); cam.position.set(0, 1.2, 8.5); cam.lookAt(0, 0.6, 0);
    const P = gold ? { amb: 0xffe6a8, key: 0xffd27a, rim: 0xff9a2a, metal: 0xf4c542, emis: 0x6b4300, ring: 0xffd34a, spark: 0xffdf8a } : cl ? { amb: 0xbfd2ff, key: 0xdbe7ff, rim: 0x3a64ff, metal: 0xe3ebff, emis: 0x0a1c5a, ring: 0x9fc0ff, spark: 0xcfe0ff } : { amb: 0xbfc8ff, key: 0xffffff, rim: 0x7a8cff, metal: 0x9fb4ff, emis: 0x1a2a6a, ring: 0xaab8ff, spark: 0xdfe6ff };
    scene.add(new T.AmbientLight(P.amb, 0.5));
    const key = new T.PointLight(P.key, 34, 40), rim = new T.PointLight(P.rim, 40, 40); key.position.set(4, 5, 6); rim.position.set(-5, 2, -3); scene.add(key, rim);
    const gmat = new T.MeshStandardMaterial({ color: P.metal, metalness: 0.95, roughness: 0.22, emissive: P.emis, emissiveIntensity: 0.6 });
    const trophy = new T.Group(); scene.add(trophy);
    if (gold || cl) {
      const tex = document.createElement('canvas'); tex.width = 512; tex.height = 256; const g = tex.getContext('2d'); g.fillStyle = gold ? '#f2c14a' : '#eef3ff'; g.fillRect(0, 0, 512, 256);
      if (gold) { g.strokeStyle = '#8a5f06'; g.lineWidth = 5; for (let x = 0; x < 512; x += 64) for (let y = 0; y < 256; y += 64) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.5; g.lineTo(x + 32 + Math.cos(a) * 26, y + 32 + Math.sin(a) * 26); } g.closePath(); g.stroke(); } }
      else { g.fillStyle = '#0a1c5a'; for (let x = 0; x < 512; x += 64) for (let y = 0; y < 256; y += 64) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 24; g.lineTo(x + 32 + Math.cos(a) * r, y + 32 + Math.sin(a) * r); } g.closePath(); g.fill(); } }
      const ball = new T.Mesh(new T.SphereGeometry(1.35, 48, 32), new T.MeshStandardMaterial({ map: new T.CanvasTexture(tex), color: 0xffffff, metalness: 0.9, roughness: 0.25, emissive: gold ? 0x4a2f00 : 0x0a1c5a, emissiveIntensity: 0.3 })); ball.position.y = 2.1; trophy.add(ball);
      const stem = new T.Mesh(new T.CylinderGeometry(0.28, 0.5, 1.1, 24), gmat); stem.position.y = 0.55; trophy.add(stem);
      const base = new T.Mesh(new T.CylinderGeometry(1.3, 1.5, 0.35, 40), gmat); base.position.y = 0.05; trophy.add(base);
      const base2 = new T.Mesh(new T.CylinderGeometry(1.0, 1.15, 0.3, 40), gmat); base2.position.y = 0.38; trophy.add(base2);
      for (let k = 0; k < 2; k++) { const ring = new T.Mesh(new T.TorusGeometry(2.0 + k * 0.45, 0.025, 8, 80), new T.MeshBasicMaterial({ color: P.ring, transparent: true, opacity: 0.55 })); ring.position.y = 2.1; ring.rotation.x = 1.2 + k; trophy.add(ring); trophy.userData['r' + k] = ring; }
      trophy.position.set(0, -1.6, -4); trophy.scale.setScalar(1.6);
    } else {
      for (let k = 0; k < 3; k++) { const ring = new T.Mesh(new T.TorusGeometry(2.4 + k * 0.5, 0.03, 8, 80), new T.MeshBasicMaterial({ color: P.ring, transparent: true, opacity: 0.4 })); ring.position.set(0, 1.0, -3); ring.rotation.set(k, k * 0.7, 0); trophy.add(ring); trophy.userData['r' + k] = ring; }
    }
    // the plaque: a 3D slab in front of the ball whose face shows the country, the position or the club
    let plq = null, plqTex = null, plqMat = null;
    if (opts.plaque && (gold || cl)) {
      plq = new T.Group(); plqMat = new T.MeshBasicMaterial({ color: 0xffffff }); const edge = gmat;
      const slab = new T.Mesh(new T.BoxGeometry(3.3, 2.15, 0.24), [edge, edge, edge, edge, plqMat, edge]); plq.add(slab);
      const frame = new T.Mesh(new T.BoxGeometry(3.6, 2.45, 0.16), edge); frame.position.z = -0.12; plq.add(frame);
      plq.position.set(0, 0.9, 2.4); plq.visible = false; scene.add(plq);
    }
    const N = 520, pos = new Float32Array(N * 3), vel = []; for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 22; pos[i * 3 + 1] = Math.random() * 12 - 4; pos[i * 3 + 2] = Math.random() * -14 + 3; vel.push(0.4 + Math.random() * 1.2); }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(pg, new T.PointsMaterial({ color: P.spark, size: 0.09, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })); scene.add(pts);
    let raf = 0, t0 = performance.now(), live = true, boost = 0, boostTo = null, flipT = -1;
    const loop = () => {
      if (!live) return; raf = requestAnimationFrame(loop);
      const t = (performance.now() - t0) / 1000, go = boostTo != null ? boostTo : (el.classList.contains('go') ? 1 : 0); boost += (go - boost) * 0.06;
      const baseY = (gold || cl) ? -1.6 : 0;
      trophy.rotation.y = t * (0.7 + boost * 3.2) + (flipT >= 0 ? Math.max(0, 1 - (t - flipT) / 0.9) * 4 : 0); trophy.position.y = baseY + Math.sin(t * 1.6) * 0.18 + boost * 0.8; trophy.scale.setScalar(((gold || cl) ? 1.6 : 1) * (1 + boost * 0.55));
      if (trophy.userData.r0) { trophy.userData.r0.rotation.z = t * 0.9; trophy.userData.r0.scale.setScalar(1 + Math.sin(t * 3) * 0.04 + boost * 0.3); }
      if (trophy.userData.r1) trophy.userData.r1.rotation.z = -t * 1.3;
      if (trophy.userData.r2) trophy.userData.r2.rotation.x = t * 0.8;
      if (plq && plq.visible) { const f = flipT >= 0 ? Math.min(1, (t - flipT) / 0.8) : 1, e = 1 - Math.pow(1 - f, 3); plq.rotation.y = (1 - e) * -6.283 + Math.sin(t * 1.3) * 0.12; plq.rotation.x = Math.sin(t * 1.1) * 0.05; plq.position.y = 0.9 + Math.sin(t * 1.8) * 0.08; plq.scale.setScalar(0.35 + 0.65 * Math.min(1, e * 1.4)); }
      key.position.x = Math.cos(t * 1.4) * 6; key.position.z = Math.sin(t * 1.4) * 6 + 2; key.intensity = 34 + boost * 28;
      const a = pg.attributes.position.array; for (let i = 0; i < N; i++) { a[i * 3 + 1] += vel[i] * 0.016 * (1 + boost * 3); if (a[i * 3 + 1] > 9) a[i * 3 + 1] = -4; }
      pg.attributes.position.needsUpdate = true; cam.position.x = Math.sin(t * 0.5) * 1.4; cam.position.z = 8.5 - boost * 1.4; cam.lookAt(0, 0.8, 0);
      renderer.render(scene, cam);
    };
    loop();
    const face = (what, c) => {   // the picture on the plaque
      const cvs = document.createElement('canvas'); cvs.width = 660; cvs.height = 430; const g = cvs.getContext('2d'), Wd = 660, Ht = 430;
      const txt = (str, size, y, col) => { g.font = 'bold ' + size + 'px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = size / 6; g.strokeStyle = '#000'; g.strokeText(str, Wd / 2, y); g.fillStyle = col || '#fff'; g.fillText(str, Wd / 2, y); };
      if (what === 'nation') { const f = DB.flagFor(c.nation), col = f.c; for (let k = 0; k < 3; k++) { g.fillStyle = col[k]; if (f.dir === 'h') g.fillRect(0, k * Ht / 3, Wd, Ht / 3 + 1); else g.fillRect(k * Wd / 3, 0, Wd / 3 + 1, Ht); } txt(c.nation, 70, Ht - 60); }
      else if (what === 'pos') { const gr = g.createRadialGradient(Wd / 2, Ht / 2 - 30, 20, Wd / 2, Ht / 2, 340); gr.addColorStop(0, '#fff3b8'); gr.addColorStop(1, '#a8760a'); g.fillStyle = gr; g.fillRect(0, 0, Wd, Ht); g.fillStyle = '#3a2600'; g.font = 'bold 150px "Press Start 2P", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(c.position, Wd / 2, Ht / 2 - 20); g.font = 'bold 30px "Press Start 2P", monospace'; g.fillText((c.altPositions || []).filter(x => x !== c.position).slice(0, 3).join('  '), Wd / 2, Ht - 55); }
      else { const k = DB.kitFor(c.club), gr = g.createLinearGradient(0, 0, Wd, Ht); gr.addColorStop(0, k[0]); gr.addColorStop(0.55, k[0]); gr.addColorStop(0.551, k[1]); gr.addColorStop(1, k[1]); g.fillStyle = gr; g.fillRect(0, 0, Wd, Ht); txt(c.club.toUpperCase(), c.club.length > 12 ? 40 : 56, Ht - 60); }
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 10; g.strokeRect(5, 5, Wd - 10, Ht - 10);
      return cvs;
    };
    return {
      stop() { live = false; cancelAnimationFrame(raf); try { renderer.dispose(); } catch (e) { /* gone */ } },
      plaque(what, c) { if (!plq) return false; if (plqTex) plqTex.dispose(); plqTex = new T.CanvasTexture(face(what, c)); plqTex.anisotropy = 4; plqMat.map = plqTex; plqMat.needsUpdate = true; plq.visible = true; flipT = (performance.now() - t0) / 1000; return true; },
      hidePlaque() { if (plq) plq.visible = false; },
      boost(v) { boostTo = v; },
    };
  }

  function walkout(res) {
    closeModal();
    const c = res.best;
    const el = document.createElement('div');
    el.className = 'walkout';
    const glKind = (c.promo === 'bdor' || c.promo === 'award' || (res.packId === 'bdor' || res.packId === 'bdorg')) ? 'bdor' : (c.promo === 'clpromo' || c.cl) ? 'cl' : null;   // v160: the Ballon d'Or and Champions League cards are revealed on a 3D trophy
    el.innerHTML = `${glKind ? '<canvas class="pfx-gl"></canvas>' : ''}<canvas class="fw"></canvas><div class="stage"></div><p class="dim" style="position:absolute;bottom:20px;z-index:2">click to skip</p>`;
    if (glKind) el.classList.add('gl', 'wo-' + glKind);
    document.body.appendChild(el);
    const stage = el.querySelector('.stage');
    let gl = null;
    // pixel fireworks
    const cv = el.querySelector('canvas.fw'); cv.width = 200; cv.height = 112;
    const g = cv.getContext('2d'); const parts = [];
    const cols = c.promo === 'bdor' || c.promo === 'award' ? ['#ffd04a', '#fff3c0', '#b8861b'] : c.rarity === 'promo' ? ['#ff5ad8', '#3cf2ff', '#ffffff'] : ['#ffe14a', '#ffffff', '#ff9a2a'];
    let alive = true;
    const burst = () => { const x = 20 + Math.random() * 160, y = 15 + Math.random() * 50; for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, s = 0.5 + Math.random() * 1.5; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 40 + Math.random() * 20, c: cols[i % cols.length] }); } };
    const loop = () => {
      if (!alive) return;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 200, 112);
      if (Math.random() < 0.08) burst();
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life--; g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); });
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      requestAnimationFrame(loop);
    };
    loop();
    // v157: FC-style 3D reveal: a slab with real thickness flies out of the dark, spins into place under a light sweep; nation, then position coin, then club crest, then the card flips in
    const slab = (front, w, h, rad, inner) => `<div class="w3-slab" style="width:${w}px;height:${h}px">${Array.from({ length: 9 }, (_, n) => `<i class="w3-l" style="${front};border-radius:${rad};transform:translateZ(${-(n + 1) * 3}px);filter:brightness(${0.62 - n * 0.04})"></i>`).join('')}<i class="w3-f" style="${front};border-radius:${rad}">${inner || ''}</i></div>`;
    const flash = () => { el.classList.remove('w3-flash'); void el.offsetWidth; el.classList.add('w3-flash'); };
    el.querySelector('canvas.fw').insertAdjacentHTML('afterend', '<div class="w3-floor"></div><div class="w3-rays"></div><div class="w3-streak"></div>');
    const steps = [
      () => { flash(); if (gl && gl.plaque('nation', c)) { stage.innerHTML = `<div class="w3-capgl">${esc(c.nation)}</div>`; return; } stage.innerHTML = `<div class="w3 w3-in">${slab(flagCSS(c.nation), 300, 190, '6px')}<div class="w3-cap">${esc(c.nation)}</div></div>`; },
      () => { flash(); if (gl && gl.plaque('pos', c)) { stage.innerHTML = `<div class="w3-capgl">${esc(c.position)}</div>`; return; } stage.innerHTML = `<div class="w3 w3-in w3-spin">${slab('background:radial-gradient(circle at 35% 30%,#fff6c8,#f4c542 45%,#8a5f06)', 190, 190, '50%', `<b class="w3-pos">${esc(c.position)}</b>`)}<div class="w3-cap">${esc((c.altPositions || []).slice(0, 3).join(' · '))}</div></div>`; },
      () => { flash(); if (gl && gl.plaque('club', c)) { stage.innerHTML = `<div class="w3-capgl">${esc(c.club.toUpperCase())}</div>`; burst(); burst(); return; } stage.innerHTML = `<div class="w3 w3-in">${slab(clubCSS(c.club), 210, 210, '22%')}<div class="w3-cap">${esc(c.club.toUpperCase())}</div></div>`; burst(); burst(); },
      ...(DB.signatureFor(c) ? [() => { const sg = DB.signatureFor(c); el.classList.add('wo-' + sg.aura); stage.innerHTML = `<div class="big sigtxt" style="color:${sg.color}">${esc(sg.walkout)}</div>`; for (let k = 0; k < 6; k++) burst(); }] : []),
      ...(c.promo === 'bdor' ? [Object.assign(() => { el.classList.add('wo-bdor'); stage.innerHTML = `<div class="bdor-t"><div class="b1">THE WINNERS OF FOOTBALL</div><div class="b2">BALLON D'OR</div><div class="b3">${c.bdorRank <= 3 ? 'TOP 3 \u00b7 NOMINEE #' + c.bdorRank : c.bdorRank <= 10 ? 'TOP 10 \u00b7 NOMINEE #' + c.bdorRank : 'NOMINEE #' + c.bdorRank}</div></div>`; el.querySelector('canvas.fw').style.opacity = 1; for (let k = 0; k < 10; k++) setTimeout(burst, k * 200); }, { long: true })] : []),
      ...(c.name === 'Lionel Messi' ? [Object.assign(() => {   // v200 (JODIO): after THE GOAT, the commentary lines roll in over Argentina's stripes
        el.classList.add('wo-messi'); stage.innerHTML = '<div class="messi"><div class="m-stripes"></div><div class="m-l m1">ANKARA MESSI!</div><div class="m-l m2">ANKARA MESSI!! ANKARA MESSI!!!</div><div class="m-l m3">HERE COMES MESSI...</div><div class="m-10">10</div><div class="m-n">\u2605 LIONEL MESSI \u2605</div></div>';
        for (let k = 0; k < 20; k++) setTimeout(burst, 400 + k * 230); }, { long: true, dur: 5600 })] : []),
      ...(c.name === 'Cristiano Ronaldo' ? [Object.assign(() => { el.classList.add('wo-goat'); stage.innerHTML = '<div class="goat"><div class="goat-crown">\u265B</div><div class="goat-l1">THE</div><div class="goat-l2">GREATEST</div><div class="goat-l3">OF ALL TIME</div><div class="goat-n">CRISTIANO RONALDO \u00b7 CR7</div></div>'; for (let k = 0; k < 12; k++) setTimeout(burst, k * 180); }, { long: true })] : []),
      () => { flash(); if (gl) { gl.hidePlaque(); gl.boost(1); } stage.innerHTML = `<div class="w3 w3-cardflip">${cardHTML(c)}</div><div class="big w3-name" style="font-size:14px">${esc(c.name.toUpperCase())}</div>`; burst(); burst(); burst(); for (let k = 0; k < 8; k++) setTimeout(burst, k * 160); },
    ];
    let i = 0, timer;
    const next = () => { if (i < steps.length) { const st = steps[i++]; st(); timer = setTimeout(next, i === steps.length ? 2200 : st.long ? (st.dur || 3600) : 1300); } else finish(); };
    const finish = () => { if (!alive) return; alive = false; clearTimeout(timer); if (gl) gl.stop(); el.remove(); revealPack(res); };
    el.addEventListener('click', finish);
    if (glKind && RUT.load3D) {
      let begun = false; const begin = () => { if (!begun && alive) { begun = true; next(); } };
      Promise.resolve(RUT.load3D()).then(() => { if (alive && window.THREE) { try { gl = packGL(el, glKind, { plaque: true }); } catch (e) { gl = null; if (window.console) console.warn('Reveal 3D failed', e); } } }).then(begin, begin);
      setTimeout(begin, 3500);
    } else next();
  }

  function revealPack(res, def) {
    render();
    const bd = def && def.tier === 'bdor';
    modal(`<h2>${bd ? '&#9733; BALLON D\'OR PACK &#9733;' : 'Pack contents'}</h2><div class="cards reveal-grid">${res.items.map((id, i) => `<div style="animation-delay:${i * 0.06}s">${cardHTML(State.card(id), { attrs: `data-act="player" data-item="${id}" style="animation-delay:${i * 0.07}s"` })}</div>`).join('')}</div>
      <div class="row mt"><button class="btn g" data-act="unassigned-all-club">Send all to Club</button><button class="btn c" data-act="nav-close" data-v="unassigned">Go to Unassigned</button></div>`, bd ? 'bdm' : '');
  }

  /* =============================== ACTIONS =============================== */
  const ACTIONS = {
    'sf-hire': el => { const m = SF().hire(el.dataset.id); if (m) toast(m, 'bad'); else toast('Coach hired.', 'good'); updateHeader(); render(); },
    'sf-watch': el => drillView(el.dataset.id),
    'sf-fire': el => { SF().fire(el.dataset.id); toast('Coach released.'); render(); },
    'sf-train': el => { const m = SF().start(el.dataset.id, el.dataset.area); if (m) toast(m, 'bad'); else toast('Session started: 5 minutes.', 'good'); render(); },
    'sf-auto': el => { const c = SF().S().coaches.find(x => x.id === el.dataset.id); if (!c) return; c.auto = !c.auto; if (c.auto && !c.act) SF().start(c.id, c.last || SF().poolOf(c.id).area); State.save(); render(); },
    'sf-head': el => { SF().S().head = el.dataset.id; State.save(); render(); },
    'sf-style': el => { const p = SF().poolOf(el.dataset.id); SF().applyStyle(p.style); toast('Setup: ' + SF().STYLES[p.style].n, 'good'); render(); },
    'sf-manage': () => { const s = SF().S(); s.manage = !s.manage; if (s.manage && s.head) SF().applyStyle(SF().poolOf(s.head).style); State.save(); render(); },
    'tt-run': () => ttRun(),
    'auto-run': () => { const n = $('#auto-n'), h = $('#auto-half'); if (n) AUTO.n = +n.value; if (h) AUTO.half = +h.value; autoRun(); },
    'auto-undo': () => { const p = AUTO.prev; if (!p) return; D().formation = p.form; D().squad.slots = p.slots.slice(); State.applyFormation(); D().tactics = p.tac; D().autoCoach = p.auto; D().tacMode = p.mode; State.save(); AUTO.prev = null; AUTO.res = null; toast('Old setup restored.', 'good'); render(); },
    nav: el => setView(el.dataset.v),
    'nav-close': el => { closeModal(); setView(el.dataset.v); },
    close: () => closeModal(),
    'overlay-bg': (el, e) => { if (e.target === el) closeModal(); },
    reset: () => modal(`<h2>Reset your save?</h2><p class="dim">Coins, club and progress will be wiped.</p>
      <div class="row"><button class="btn r" data-act="reset-confirm">Reset save</button><button class="btn" data-act="close">Keep playing</button></div>`),
    'reset-confirm': () => { closeModal(); State.reset(); App.results = []; setView('home'); toast('Fresh save created.'); },
    player: el => openPlayer(el.dataset.item),
    price: el => openPlayer(null, el.dataset.card),

    // unassigned / club item actions
    'to-club': el => { const r = State.moveToClub(el.dataset.item); toast(r.isValid ? 'Sent to club' : r.error, r.isValid ? 'good' : 'bad'); if (r.isValid) { closeModal(); render(); } },
    'to-storage': el => { const r = State.toSbcStorage(el.dataset.item); toast(r.isValid ? 'Stored in SBC Storage' : r.error, r.isValid ? 'good' : 'bad'); if (r.isValid) { closeModal(); render(); } },
    'role-pick': el => roleModal(el.dataset.item),
    'role-set': el => { State.setItemRole(el.dataset.item, el.dataset.role); toast(el.dataset.role ? 'Role: ' + RUT.ROLE_BY[el.dataset.role].name : 'Role: Auto', 'good'); closeModal(); if (App.view === 'squad') render(); openPlayer(el.dataset.item); },
    'tac-pt': el => { const t = clubTac(), k = el.dataset.k, d = +el.dataset.d, o = { a: t.a, m: t.m, d: t.d }; o[k] += d; const v = Engine.tacFix(o.a, o.m, o.d); if (v[0] !== o.a || v[1] !== o.m || v[2] !== o.d) { toast('A bar on 3 keeps the others at 2 or less, 6 points in all.', 'bad'); return; } D().tactics = { a: o.a, m: o.m, d: o.d, trait: t.trait }; D().tacMode = 'classic'; State.save(); render(); },
    'tac-trait': el => { const t = clubTac(); t.trait = t.trait === el.dataset.t ? '' : el.dataset.t; D().tacMode = 'classic'; State.save(); render(); },
    'tac-classic': () => { D().tacMode = 'classic'; State.save(); toast('Classic tactics active.', 'good'); render(); },
    'fc-preset': el => { const t = fcTac(), k = el.dataset.k, P = FCP()[k]; if (!P) return; if (k === 'x') { t.preset = 'x'; State.save(); render(); return; } Object.assign(t, fcFromPreset(k)); if (P.form && State.FORMS[P.form] && P.form !== State.formationKey()) State.setFormation(P.form); State.save(); toast('Preset: ' + P.name, 'good'); render(); },
    'fc-activate': () => { D().tacMode = 'fc'; State.save(); toast('FC 27 tactics active.', 'good'); render(); },
    'fc-role': el => fcRoleModal(+el.dataset.i),
    'fc-set': el => { const t = fcTac(), i = el.dataset.i; if (el.dataset.k) t.roles[i] = el.dataset.k; else delete t.roles[i]; D().tacMode = 'fc'; State.save(); closeModal(); const r = RUT.ROLE_BY[State.slotRole(+i)]; toast(r ? r.name + (r.focusName ? ' · ' + r.focusName : '') : 'Role reset', 'good'); render(); },
    'lab-run': () => labRun(),
    'lab-watch': () => { App.difficulty = LAB.opp; App.oppStyle = LAB.style; startMatch('watch'); },
    'tb-phase': el => { TB.phase = el.dataset.p; render(); },
    'tac-reset': () => { D().tactics = { a: 2, m: 2, d: 2, trait: clubTac().trait }; D().tacMode = 'classic'; State.save(); render(); },
    'chem-style': el => { const r = State.setChemStyle(el.dataset.item, el.dataset.style); if (!r.isValid) toast(r.error, 'bad'); else openPlayer(el.dataset.item); },
    'quick-sell': el => {
      if (!Market.sellTake(1)) { toast(Market.sellMsg(), 'bad'); return; }
      const c = State.card(el.dataset.item), v = State.quickSellValue(c, D().items[el.dataset.item]);
      State.destroy(el.dataset.item); State.addCoins(v, 'Quick sold ' + c.name); closeModal(); toast('Quick sold ' + c.name + ' +' + fmt(v), 'good'); render();
    },
    'list-item': el => {
      const r = Market.list(el.dataset.item, $('#l-start').value, $('#l-bin').value, $('#l-dur').value);
      toast(r.msg, r.isValid ? 'good' : 'bad'); if (r.ok) { closeModal(); render(); }
    },
    'unassigned-all-club': () => { let dup = 0; D().unassigned.slice().forEach(id => { if (!State.moveToClub(id).isValid) dup++; }); closeModal(); toast(dup ? dup + ' duplicate(s) stayed in Unassigned (list, store or quick sell them)' : 'All items sent to club', dup ? '' : 'good'); render(); },
    'stor-open': () => {   // v290 (JODIO): send all (or a chosen number of) Unassigned players to SBC Storage
      const n = D().unassigned.length, room = Math.max(0, 100 - (D().sbcStorage || []).length);
      if (!n) { toast('Unassigned is empty', 'bad'); return; }
      modal(`<h2>To SBC Storage</h2><p class="dim" style="font-size:8px;line-height:1.8">Moves Unassigned players (lowest rated first) into SBC Storage, where SBCs can use them. Storage holds 100 and has ${room} free.</p>
        <div class="row mt"><label>How many <input id="st-n" type="number" min="1" max="100" value="${Math.min(n, room)}" style="width:70px"></label><button class="btn p" data-act="stor-go">Move them</button><button class="btn" data-act="stor-all">All</button></div>`);
    },
    'stor-all': () => { const el = $('#st-n'); if (el) el.value = Math.min(D().unassigned.length, 100); ACTIONS['stor-go'](); },
    'stor-go': () => {
      const st = D(), room = 100 - (st.sbcStorage || []).length, want = Math.max(0, +($('#st-n') || {}).value || 0), k = Math.min(want, room, st.unassigned.length);
      if (!k) { toast(room <= 0 ? 'SBC Storage is full (100)' : 'Nothing to move', 'bad'); return; }
      const ids = st.unassigned.slice().sort((a, b) => State.card(a).rating - State.card(b).rating).slice(0, k);
      ids.forEach(id => { State.detach(id); st.sbcStorage.push(id); }); State.save(); closeModal();
      toast('Moved ' + k + ' to SBC Storage' + (want > k ? ' (storage full or fewer players)' : ''), 'good'); render();
    },
    'mq-open': () => mqOpen(),
    'bs-open': () => bsOpen(),
    'bs-go': () => {
      const ids = bsPick(Math.max(0, Math.min(500, +$('#bs-n').value || 0)), +$('#bs-r').value || 0, bsScope());
      if (!ids.length) { toast('No players match', 'bad'); return; }
      const total = ids.reduce((a, id) => a + bsValue(id), 0), sq = ids.filter(id => State.isInSquad(id)).length;
      const sell = () => { ids.forEach(id => State.destroy(id)); State.addCoins(total, 'Bulk sell'); State.save(); closeModal(); toast('Sold ' + ids.length + ' players for ' + fmt(total), 'good'); render(); };
      if (sq) { askYes(sq + ' of these players are in your squad or bench and will leave it. Sell anyway?', 'Sell anyway', true).then(ok => { if (ok) sell(); }); return; }
      sell();
    },
    'mq-go': () => {
      const ids = [...document.querySelectorAll('.mq-ck:checked')].map(e => e.dataset.item).filter(id => D().unassigned.includes(id));
      if (!ids.length) { toast('Tick up to ' + MQ_MAX + ' players first', 'bad'); return; }
      if (ids.length > MQ_MAX) { toast('Max ' + MQ_MAX + ' players per sale', 'bad'); return; }
      if (!State.canAfford(MQ_FEE)) { toast('The fee is ' + fmt(MQ_FEE) + ' coins', 'bad'); return; }
      let total = 0; ids.forEach(id => { total += mqValue(id); });
      State.addCoins(-MQ_FEE, 'Market quick sell fee'); ids.forEach(id => State.destroy(id));
      State.addCoins(total, 'Market quick sell'); State.save(); closeModal();
      toast('Sold ' + ids.length + ' for ' + fmt(total) + ' (fee ' + fmt(MQ_FEE) + ', net ' + fmt(total - MQ_FEE) + ')', total >= MQ_FEE ? 'good' : ''); render();
    },
    'unassigned-qs-bronze': () => {
      let total = 0, cut = 0; D().unassigned.slice().forEach(id => { const c = State.card(id); if (c.rating < 65) { if (!Market.sellTake(1)) { cut++; return; } total += State.quickSellValue(c, D().items[id]); State.destroy(id); } });
      if (total) State.addCoins(total, 'Bulk quick sell');
      toast(cut ? (total ? 'Quick sold for ' + fmt(total) + ', but ' : '') + 'daily sell limit reached, ' + cut + ' card(s) kept. Reset it in the Transfer Market.' : 'Quick sold for ' + fmt(total), cut && !total ? 'bad' : 'good'); render();
    },

    // squad
    'squad-slot': el => pickerModal(+el.dataset.slot, 'squad'),
    'squad-pick': el => {
      const sl = D().squad.slots, i = +el.dataset.slot, id = el.dataset.item, j = sl.indexOf(id);
      if (j >= 0) sl[j] = sl[i];
      sl[i] = id; closeModal(); render();
    },
    'squad-remove': el => { D().squad.slots[+el.dataset.slot] = null; closeModal(); render(); },
    'squad-auto': () => { autoBuildSquad(); autoBench(); render(); toast('Best XI and subs selected', 'good'); },
    'bench-slot': el => benchPicker(+el.dataset.slot),
    'bench-pick': el => { const b = D().squad.bench, i = +el.dataset.slot, j = b.indexOf(el.dataset.item); if (j >= 0) b[j] = b[i]; b[i] = el.dataset.item; closeModal(); render(); },
    'bench-remove': el => { D().squad.bench[+el.dataset.slot] = null; closeModal(); render(); },
    'squad-clear': () => { D().squad.slots = new Array(11).fill(null); render(); },

    // settings
    set: el => {
      const k = el.dataset.k, v = el.dataset.v;
      if (k === 'lang') { SET.lang = v; RUT.i18n.set(v); }
      else if (k === 'difficulty') App.difficulty = v;
      else if (k === 'halfSeconds') App.halfSeconds = +v;
      else if (k === 'pitch') App.pitch = v;
      else if (k === 'camera') { SET.camera = v; App.camMode = v; }
      else if (k === 'netq') { SET.netq = v; }
      else if (k === 'perf') { SET.perf = v; try { localStorage.setItem(SETKEY, JSON.stringify(SET)); } catch (e) { /* ignore */ } location.reload(); return; }
      else if (k === 'net') { SET.net = v; try { RUT.Auth.cloud._db = undefined; } catch (e) { /* ignore */ } toast(v === 'offline' ? 'Offline mode: no cloud save or online matches.' : 'Online mode is on.', 'good'); }
      else if (k === 'gfx') { try { localStorage.setItem('rut_gfx', v); } catch (e) { /* ignore */ } SET.gfx = v; }
      else SET[k] = v;
      saveSet(); render();
    },

    // play
    diff: el => { App.difficulty = el.dataset.d; saveSet(); render(); },
    match: el => startMatch(el.dataset.mode),
    'lg-play': el => leagueMatch(+el.dataset.i, el.dataset.mode),
    'lg-po-ask': () => { const po = LG().playoff(); if (!po) return;
      modal(`<h1>PROMOTION PLAYOFF</h1><p>Pay <b>${fmt(po.cost)}</b> coins and play one knockout match against ${po.top5 ? 'the strongest League A1 team' : 'a League ' + po.next + ' club'} (extra time and penalties if needed). Win and you ${po.top5 ? 'unlock the Top 5 Leagues' : 'jump straight to ' + po.next}. Lose and the fee is gone.${po.top5 ? '' : ' If you win, your current ' + esc(D().league.code) + ' season is dropped.'}</p>
        <div class="row mt"><button class="btn y" data-act="lg-po-go" ${State.canAfford(po.cost) ? '' : 'disabled'}>Pay ${fmt(po.cost)} and play</button><button class="btn" data-act="close">Cancel</button></div>${State.canAfford(po.cost) ? '' : '<p class="bad">Not enough coins.</p>'}`); },
    'lg-po-go': () => { closeModal(); playoffMatch(); },
    'top5-pick': el => { if (!T5().pick(el.dataset.lg)) toast('Finish your current season first', 'bad'); render(); },
    't5-squad': el => { const q = T5().squad(el.dataset.n); if (!q) return; const row = x => `<div class="row between" style="font-size:8px;margin:2px 0"><span>${esc(x.name)}</span><span class="dim">${x.pos} · ${x.age}y</span><b>${x.ovr}</b></div>`; modal(`<h2>${esc(q.name)} <span class="dim" style="font-size:9px">${q.ovr} OVR · budget €${q.bud}M</span></h2><div class="grid cols-2"><div><h3>Starting XI</h3>${q.xi.map(row).join('')}</div><div><h3>Squad</h3>${q.bench.map(row).join('')}</div></div><div class="row mt"><button class="btn y" data-act="close">Close</button></div>`); },
    't5-play': el => top5Match(+el.dataset.i, +el.dataset.leg, el.dataset.mode),
    't5-next': () => { const o = T5().advance(); if (o) toast(`${T5().LGS[o.lg].name}: ${ord(o.rank)} place, +${fmt(o.reward.coins)} coins${Object.keys(o.reward.packs).length ? ' + ' + RUT.Quests.packText(o.reward.packs) : ''}`, 'good'); updateHeader(); render(); },
    't5-tab': el => { App.t5tab = el.dataset.t; render(); },
    'ucl-start': () => { T5().ucl.start(); State.save(); render(); },
    'ucl-quit': async () => { if (!(await askYes('Leave this Champions League season? Your progress in it is lost.', 'Leave', true))) return; T5().ucl.quit(); render(); },
    'ucl-play': el => uclMatch(el.dataset.mode),
    't5-change': () => { const R = T5().root(); R.cur = null; R.lg = null; State.save(); render(); },
    'q-tab': el => { App.questTab = el.dataset.t; render(); },
    'q-claim': el => { const r = RUT.Quests.claim(el.dataset.id); toast(r.msg, r.ok ? 'good' : 'bad'); updateHeader(); render(); },
    'q-claimall': () => { const r = RUT.Quests.claimAll(); toast(r.n ? `Claimed ${r.n} quests: +${fmt(r.coins)} coins${Object.keys(r.packs).length ? ' + ' + RUT.Quests.packText(r.packs) : ''}` : 'Nothing to claim', r.n ? 'good' : 'bad'); updateHeader(); render(); },
    'lg-next': () => { const m = LG().advance(); if (m) { toast(m, 'good'); updateHeader(); } render(); },
    train: () => startTraining(),

    // online
    'qm-start': () => quickSearch(),
    'qm-cancel': () => quickCancel(),
    'qm-again': () => { const k = App.online && App.online.quick ? App.online.quick.kind : null; if (App.online && App.online.session) App.online.session.close(); App.online = null; closeModal(); setView('online'); quickSearch(null, k); },
    'riv-play': el => { const k = el.dataset.k === 'champs' ? 'champs' : 'rivals'; if (k === 'champs' && !rivChampsOpen()) return; setView('online'); quickSearch(null, k); },
    'riv-claim': () => { const r = RV(), p = r.pending; if (!p) return; r.pending = null; State.addCoins(p.coins, 'Weekly Rivals and Champions rewards'); State.save(); toast('+' + fmt(p.coins) + ' coins claimed', 'good'); render(); },
    'on-host': () => onlineStartSession('host', Net ? Net.newCode() : ''),
    'dr-test': () => {
      let link; try { link = new Net.Direct(); } catch (e) { App.directTest = 'WebRTC is blocked here: ' + e.message; render(); return; }
      App.directTest = 'Testing...'; render();
      link.createInvite().then(() => { const r = link.report(); link.leave(); App.directTest = r.srflx ? 'OK: WebRTC works and a public address was found (' + r.srflx + '). Direct play should work across networks.' : r.host ? 'WebRTC works but no public address was found: direct play will only work between devices on the same wifi.' : 'WebRTC started but found no network address. Direct play will not work in this browser.'; render(); })
        .catch(e => { App.directTest = 'Direct connection is blocked here: ' + (e && e.message); render(); });
    },
    'dr-host': () => {
      let link; try { link = new Net.Direct(); } catch (e) { toast('Direct connection is blocked here: ' + e.message, 'bad'); return; }
      const R = App.direct = { role: 'host', link, mine: '', paste: '', busy: false, error: '', warn: '' }; render();
      link.createInvite().then(code => { if (App.direct === R) { R.mine = code; const r = link.report(); if (!r.srflx) R.warn = 'No public address found: this invite works between devices on the same wifi only.'; render(); } }).catch(e => { if (App.direct === R) { R.error = (e && e.message) || 'Could not create the invite'; render(); } });
    },
    'dr-join': () => { let link; try { link = new Net.Direct(); } catch (e) { toast('Direct connection is blocked here: ' + e.message, 'bad'); return; } App.direct = { role: 'guest', link, mine: '', paste: '', busy: false, error: '', warn: '' }; render(); },
    'dr-make-reply': () => {
      const R = App.direct; if (!R || R.busy) return; R.busy = true; R.error = ''; render();
      R.link.joinInvite(R.paste).then(code => { if (App.direct !== R) return; R.busy = false; R.mine = code; if (!R.link.report().srflx) R.warn = 'No public address found: this works between devices on the same wifi only.'; render(); return R.link.ready.then(() => { if (App.direct === R) { App.direct = null; onlineStartSession('guest', 'DIRECT', R.link); } }); })
        .catch(e => { if (App.direct === R) { R.busy = false; R.error = e.message; render(); } });
    },
    'dr-connect': () => {
      const R = App.direct; if (!R || R.busy || !R.mine) return; R.busy = true; R.error = ''; render();
      const timer = setTimeout(() => { if (App.direct === R && R.busy) { R.busy = false; R.error = 'Still not connected. Check the reply code is the newest one, and that your friend keeps their page open. Strict networks may block a direct link: try the game code instead.'; render(); } }, 25000);
      R.link.acceptReply(R.paste).then(() => { clearTimeout(timer); if (App.direct === R) { App.direct = null; onlineStartSession('host', 'DIRECT', R.link); } })
        .catch(e => { clearTimeout(timer); if (App.direct === R) { R.busy = false; R.error = e.message; render(); } });
    },
    'dr-copy': () => { const R = App.direct; if (!R || !R.mine) return; const ok = () => toast('Code copied', 'good'); try { navigator.clipboard.writeText(R.mine).then(ok, () => { const t = $('#dr-mine'); if (t) { t.select(); document.execCommand('copy'); ok(); } }); } catch (e) { const t = $('#dr-mine'); if (t) { t.select(); try { document.execCommand('copy'); ok(); } catch (x) { /* manual copy */ } } } },
    'dr-share': () => { const R = App.direct; if (!R || !R.mine) return; if (navigator.share) navigator.share({ title: 'FC RETRO 27', text: R.mine }).catch(() => {}); else ACTIONS['dr-copy'](); },
    'dr-cancel': () => { if (App.direct && App.direct.link) App.direct.link.leave(); App.direct = null; render(); },
    'on-mode': el => { SET.onlineMode = el.dataset.m === 'duel' ? 'duel' : 'club'; saveSet(); render(); },
    'on-pick': () => duelPicker(),
    'duel-pick': el => { SET.duelPick = el.dataset.card; saveSet(); closeModal(); render(); },
    'on-join': () => onlineStartSession('guest', ($('#on-code') || {}).value),
    'on-copy': () => {
      const O = App.online; if (!O) return; const t = O.code;
      const done = () => toast('Game code ' + t + ' copied', 'good');
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, () => toast('Code: ' + t)); return; } } catch (e) { /* fall through */ }
      toast('Code: ' + t);
    },
    'on-share': () => {
      const O = App.online; if (!O) return;
      const text = 'Play FC RETRO 27 with me: open the game, go to Play > Online Match > Join a game and enter the code ' + O.code;
      if (navigator.share) navigator.share({ title: 'FC RETRO 27', text }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('Invite copied', 'good'), () => toast(text));
    },
    'on-rematch': el => {
      const O = App.online; if (!O || !O.session || !O.session.wantRematch()) { toast('The other player has left.', 'bad'); return; }
      el.disabled = true; el.textContent = 'Waiting for your opponent...';
    },
    'on-back': () => { if (App.online && App.online.session) App.online.session.close(); App.online = null; closeModal(); setView('online'); },
    'on-leave': () => { if (App.online && App.online.session) App.online.session.close(); App.online = null; render(); },
    'on-start': () => {
      const O = App.online; if (!O || !O.session) return;
      App.halfSeconds = +($('#on-half') || {}).value || App.halfSeconds; 
      O.session.start({ duel: duelMode(), seed: 1 + Math.floor(Math.random() * 2e9), half: App.halfSeconds, brain: gfxPref() === 'ultra' ? 'ultra' : 'std', phys: physCfg(), styles: [myTac(), ($('#on-sty-opp') || {}).value || 'balanced'] });
      onlineSet({ status: 'Starting...' });
    },
    // casual
    'cas-slot': el => casualPicker(+el.dataset.team, +el.dataset.slot),
    'cas-pick': el => { casualState().teams[+el.dataset.team].ids[+el.dataset.slot] = el.dataset.card; saveCasual(); closeModal(); render(); },
    'cas-empty': el => { casualState().teams[+el.dataset.team].ids[+el.dataset.slot] = null; saveCasual(); closeModal(); render(); },
    'cas-ctl': el => {
      const T = casualState().teams, i = +el.dataset.team, k = el.dataset.ctl, o = T[1 - i];
      if (k !== 'cpu' && o.ctl === k) o.ctl = T[i].ctl !== 'cpu' ? T[i].ctl : (k === 'p1' ? 'p2' : 'p1');   // one person per side
      T[i].ctl = k; saveCasual(); render();
    },
    'cas-auto': el => { casualState().teams[+el.dataset.team].ids = casualAuto(casualPool(), false); saveCasual(); render(); },
    'cas-random': el => { casualState().teams[+el.dataset.team].ids = casualAuto(casualPool().filter(c => c.rating >= 70), true); saveCasual(); render(); },
    'cas-club': el => {
      const ids = State.matchCards().map(c => (c ? c.id : null));
      casualState().teams[+el.dataset.team].ids = ids.map(id => (id && DB.get(id) ? id : null)); saveCasual(); render();
    },
    'cas-clear': el => { casualState().teams[+el.dataset.team].ids = new Array(11).fill(null); saveCasual(); render(); },
    'cas-swap': () => { const C = casualState(); C.teams.reverse(); saveCasual(); render(); },
    'cas-start': () => startCasual(),
    'cas-rematch': () => { closeModal(); startCasual(); },

    // market
    mtab: el => { App.marketTab = el.dataset.t; Market.clearWon(); render(); },
    msearch: () => { readFilters(); App.results = Market.search(App.filters).map(l => l.id); render(); },
    mreset: () => { App.filters = {}; App.results = []; render(); },
    mbuy: el => { const r = Market.buyNow(el.dataset.l); toast(r.msg, r.ok ? 'good' : 'bad'); render(); },
    mbid: el => { const r = Market.bid(el.dataset.l); toast(r.msg, r.ok ? 'good' : 'bad'); render(); },
    munwatch: el => { const r = Market.unwatch(el.dataset.l); if (!r.ok) toast(r.msg, 'bad'); render(); },
    munlist: el => { const r = Market.unlist(el.dataset.item); if (!r.ok) toast(r.msg, 'bad'); render(); },
    'mclear-sold': () => { Market.clearSold(); render(); },
    'search-card': el => { const c = DB.get(el.dataset.card); closeModal(); App.marketTab = 'search'; App.filters = { name: c.name }; App.results = Market.search(App.filters).map(l => l.id); setView('market'); },

    // SBC
    'sbc-open': el => { App.sbc = { id: el.dataset.id, slots: new Array(11).fill(null) }; setView('sbc-build'); },
    'sbc-slot': el => pickerModal(+el.dataset.slot, 'sbc'),
    'sbc-pick': el => { App.sbc.slots[+el.dataset.slot] = el.dataset.item; closeModal(); render(); },
    'sbc-remove': el => { App.sbc.slots[+el.dataset.slot] = null; closeModal(); render(); },
    'sbc-auto': () => {
      App.sbc.slots = SBC.autoFill(App.sbc.id, App.sbc.slots); const i = SBC.autoInfo() || {};
      if (!i.valid) toast('No squad from your club and SBC storage (starting XI included) meets every requirement. The closest try is placed.', 'bad');
      else if (i.xi) toast('Built a valid squad. ' + i.xi + ' of the players come from your starting XI: they are marked (XI) and burn if you submit. Press Clear to undo.', 'good');
      else toast('Built a valid squad from your club, unassigned items and SBC storage.', 'good');
      render(); },
    'sbc-xi': el => { App.sbcXI = !App.sbcXI; pickerModal(+el.dataset.slot, 'sbc'); },
    'sbc-clear': () => { App.sbc.slots = new Array(11).fill(null); render(); },
    'ps-type': el => { PSHOP.type = el.dataset.t; render(); },
    'pst-tab': el => { App.pstTab = el.dataset.t; render(); },
    'pst-reset': () => { if (App.pstArm) { App.pstArm = false; D().pstats = {}; D().lastPS = null; State.save(); } else App.pstArm = true; render(); },
    'ps-buy': el => { const r = shopBuy(el.dataset.card, !!el.dataset.trade); toast(r.msg, r.ok ? 'good' : 'bad'); updateHeader(); render(); },
    'sell-reset': () => { const r = Market.sellReset(); toast(r.msg, r.ok ? 'good' : 'bad'); updateHeader(); render(); },
    'sbc-reset': () => { const r = SBC.resetDaily(); toast(r.msg, r.ok ? 'good' : 'bad'); updateHeader(); render(); },
    'sbc-submit': () => {
      const r = SBC.submit(App.sbc.id, App.sbc.slots);
      if (!r.isValid) { (r.errors || [r.msg]).slice(0, 3).forEach(e => toast(e, 'bad')); return; }
      toast(r.msg, 'good');
      App.sbc = null; setView('sbc');
      if (r.reward.type === 'pack') {
        modal(`<h1>SBC COMPLETE!</h1><p>Reward: <span class="gold">${esc(Packs.PACKS[r.reward.packId].name)}</span></p>
          <div class="row"><button class="btn y" data-act="open-pack" data-pack="${r.reward.packId}">Open now</button><button class="btn" data-act="close">Later</button></div>`);
      } else if (r.reward.itemId) {
        modal(`<h1>SBC COMPLETE!</h1><div class="row" style="justify-content:center">${cardHTML(State.card(r.reward.itemId))}</div>
          <p style="text-align:center">Your reward is waiting in Unassigned.</p><div class="row" style="justify-content:center"><button class="btn y" data-act="nav-close" data-v="unassigned">View</button></div>`);
      }
    },

    // evo
    'evo-pick': el => evoPicker(el.dataset.id),
    'evo-start': el => { const r = Evo.startEvo(el.dataset.id, el.dataset.item); toast(r.msg, r.ok ? 'good' : 'bad'); closeModal(); render(); },

    // store
    'mb-ask': () => { const id = mbItem(); if (!id) return; const pick = mbPick();
      modal(`<h1>MBAPPÉ EXCHANGE</h1><p>Your Kylian Mbappé card is removed for good and you get these 11 players (rating in brackets). One exchange per account.</p>
        <div class="row" style="flex-wrap:wrap;gap:6px">${pick.map(c => `<span class="dim" style="font-size:8px">${esc(c.name)} (${c.rating}, ${c.position})</span>`).join(' · ')}</div>
        <div class="row mt"><button class="btn y" data-act="mb-go">Trade</button><button class="btn" data-act="close">Cancel</button></div>`); },
    'mb-go': () => { const id = mbItem(); if (!id) { closeModal(); return; }
      const pick = mbPick(); State.destroy(id); pick.forEach(c => { const it = State.newItem(c.id, {}); D().unassigned.push(it.id); });
      D().mbTrade = true; State.log('Mbappé exchange: 11 players rated 87 received'); State.save(); closeModal(); toast('Traded Mbappé for 11 players rated 87. Check Unassigned.', 'good'); render(); },
    // v108 coach + recordings
    'coach-read': () => { const t = $('#co-text'); if (t) COACH.text = t.value; COACH.read = Coach.interpret(COACH.text); COACH.proof = null; render(); },
    'coach-ask': el => { COACH.text = el.dataset.t; COACH.read = Coach.interpret(COACH.text); COACH.proof = null; render(); },
    'coach-test': () => coachTest(),
    'coach-apply': () => {
      const R = COACH.read; if (!R || !R.items.length) return; const K = Coach.merge(R.items);
      D().coach = { text: COACH.text, on: true, knobs: K, items: R.items.map(i => ({ id: i.id, name: i.name })), at: Date.now() };
      if (R.form && State.formationKey() !== R.form && (State.FORMS[R.form])) { State.setFormation(R.form); toast('Formation: ' + State.FORMS[R.form].name, 'good'); }
      State.save(); toast('The coach is on. Your matches now follow the instruction.', 'good'); render();
    },
    'pl-clips': el => playerClips(el.dataset.n),
    'pl-improve': el => playerModal(el.dataset.n),
    'pl-role': el => { State.setItemRole(el.dataset.item, el.dataset.role); toast('Role set: ' + RUT.ROLE_BY[el.dataset.role].name, 'good'); playerModal(el.dataset.n); },
    'pl-ask': el => { closeModal(); COACH.text = el.dataset.t; COACH.read = Coach.interpret(COACH.text); COACH.proof = null; setView('coach'); },
    'pb-act': el => { const k = el.dataset.k, last = pbLast(); if (last && last.act === 'shoot') return; const from = last ? last.to : PB.sel; if (from == null) { toast('Click the player who starts the play first.', 'bad'); return; } if (PB.steps.length >= 4) { toast('Four steps at most.', 'bad'); return; } if (k === 'shoot') { PB.steps.push({ from, act: 'shoot' }); PB.pend = null; PB.res = null; PB.vars = null; } else PB.pend = PB.pend === k ? null : k; rerender(); },
    'pb-undo': () => { PB.steps.pop(); PB.pend = null; PB.res = null; PB.vars = null; if (!PB.steps.length) PB.sel = PB.sel; rerender(); },
    'pb-clear': () => { PB.steps = []; PB.pend = null; PB.res = null; PB.vars = null; PB.editId = null; rerender(); },
    'pb-reset': () => { pbReset(true); rerender(); },
    'pb-run': () => pbRun(),
    'pb-vars': () => pbVars(),
    'pb-prove': () => pbProve(),
    'pb-apply': el => { const i = +el.dataset.i; PB.steps[i] = Object.assign({}, PB.steps[i], { act: el.dataset.k }); PB.res = null; PB.vars = null; rerender(); toast('Step ' + (i + 1) + ' is now ' + PB_ACTS[el.dataset.k][0].toLowerCase() + '. Run the simulations to confirm.', 'good'); },
    'pb-save': () => {
      if (!PB.steps.length) return; const d = D(); d.plays = d.plays || [];
      const nm = (PB.name || '').trim() || 'Play ' + (d.plays.length + 1), r = PB.res && !PB.res.stale ? { overall: PB.res.overall, rL: PB.res.rL, rT: PB.res.rT, n: PB.res.n, level: PB.res.level } : null;
      const ex = PB.editId && d.plays.find(x => x.id === PB.editId);
      if (ex) { Object.assign(ex, { name: nm, mine: PB.mine.map(q => q.slice()), opp: PB.opp.map(q => q.slice()), steps: PB.steps.map(x => Object.assign({}, x)), res: r || ex.res, live: r ? { n: 0, ok: 0 } : ex.live }); }
      else { if (d.plays.length >= 8) { toast('Eight saved plays at most: delete one first.', 'bad'); return; } d.plays.push({ id: 'p' + Date.now().toString(36), name: nm, mine: PB.mine.map(q => q.slice()), opp: PB.opp.map(q => q.slice()), steps: PB.steps.map(x => Object.assign({}, x)), res: r, live: { n: 0, ok: 0 }, on: !!r }); PB.editId = d.plays[d.plays.length - 1].id; }
      State.save(); toast(r ? 'Saved. The computer will use it when it plays your team.' : 'Saved, but not simulated yet: run the simulations, then save again so the team can use it.', r ? 'good' : ''); rerender();
    },
    'pb-use': el => { const pl = (D().plays || []).find(x => x.id === el.dataset.id); if (!pl) return; if (!pl.on && !pl.res) { toast('Run the simulations on this play and save it first.', 'bad'); return; } pl.on = !pl.on; State.save(); rerender(); },
    'pb-del': el => { D().plays = (D().plays || []).filter(x => x.id !== el.dataset.id); if (PB.editId === el.dataset.id) PB.editId = null; State.save(); rerender(); },
    'pb-load': el => { const pl = (D().plays || []).find(x => x.id === el.dataset.id); if (!pl) return; PB.mine = pl.mine.map(q => q.slice()); PB.opp = (pl.opp || Engine.BOARD_OPP).map(q => q.slice()); PB.steps = pl.steps.map(x => Object.assign({}, x)); PB.name = pl.name; PB.editId = pl.id; PB.sel = pl.steps[0].from; PB.pend = null; PB.res = null; PB.vars = null; rerender(); window.scrollTo(0, 0); },
    'acc-site': async el => { const x = SITES.find(q => q.k === el.dataset.k); if (!x || !x.url) return;
      try { const code = await RUT.Auth.exportCode(''), url = x.url + '#rut=' + encodeURIComponent(code); let ok = false;
        if (x.k === 'claude') { try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); } }
        const w = window.open(url, '_blank', 'noopener');
        toast(x.k === 'claude' ? (ok ? 'Club copied. On the Claude page press Paste my club (or Ctrl+V) on the login screen.' : 'Open Settings > Account > Show transfer code, copy it, then press Paste my club on the Claude page.') : w ? 'Opening your club on ' + x.name + '...' : 'Pop-up blocked: allow pop-ups and press it again.', ok || x.k !== 'claude' ? 'good' : 'bad');
      } catch (e) { toast(e.message, 'bad'); } },
    'acc-lovable': async () => { try { const url = 'https://retro-charm-site.lovable.app/#rut=' + encodeURIComponent(await RUT.Auth.exportCode('')), w = window.open(url, '_blank', 'noopener');
      const ta = $('#acc-code'), box = $('#acc-code-box'); ta.value = url; box.hidden = false; ta.focus(); ta.select();
      toast(w ? 'Opening your club on Lovable...' : 'Copy this link and open it in your browser: it logs you in on Lovable.', 'good'); } catch (e) { toast(e.message, 'bad'); } },
    'acc-restore': async () => { try { await RUT.Auth.restoreBackup(); toast('Previous save restored.', 'good'); setTimeout(() => location.reload(), 800); } catch (e) { toast(e.message, 'bad'); } },
    'acc-main': async el => { try { await RUT.Auth.setMain(el.dataset.v); toast(el.dataset.v ? 'Main site set: its save always wins now.' : 'No main site: the newest save wins.', 'good'); render(); } catch (e) { toast(e.message, 'bad'); } },
    'acc-code': async () => { const pw = ''; try { const code = await RUT.Auth.exportCode(pw), ta = $('#acc-code'), box = $('#acc-code-box'); ta.value = code; box.hidden = false; ta.focus(); ta.select(); toast('Transfer code ready: copy it and paste it on the other device.', 'good'); } catch (e) { toast(e.message, 'bad'); } },
    'acc-copy': async () => { const ta = $('#acc-code'); if (!ta || !ta.value) return; ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand && document.execCommand('copy'); } catch (e) { ok = false; } if (!ok) { try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (e) { ok = false; } } toast(ok ? 'Copied.' : 'Select the text and copy it by hand (Ctrl+C).', ok ? 'good' : 'bad'); },
    'acc-rename': async () => { const nn = ($('#acc-new') || {}).value || '', pw = ($('#acc-pw2') || {}).value || ''; try { const a = await RUT.Auth.rename(nn, pw); toast('Club renamed to ' + a.name, 'good'); render(); } catch (e) { toast(e.message, 'bad'); } },
    'acc-delete': async () => {
      if (!(await askYes('Delete ' + (RUT.Auth.user ? RUT.Auth.user.name : 'this club') + ' for good? Its players, coins and save are removed on this device and in the cloud. This cannot be undone.', 'Delete my account', true))) return;
      try { await RUT.Auth.remove(); toast('Account deleted.', 'good'); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message, 'bad'); } },
    'acc-export': async () => { const pw = ''; try { const txt = await RUT.Auth.exportAccount(pw); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'retro-ut-99-' + RUT.Auth.user.id.replace(/[^\w-]+/g, '_') + '.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); toast('Transfer file saved. Import it on the other device.', 'good'); } catch (e) { toast(e.message, 'bad'); } },
    'ord-clear': () => { D().squad.slots.forEach(id => { if (id && D().items[id]) delete D().items[id].order; }); State.save(); toast('All orders cleared.', 'good'); rerender(); },
    'coach-auto': () => { D().autoCoach = !D().autoCoach; State.save(); toast(D().autoCoach ? 'Auto coach on: it will change your tactic during your matches.' : 'Auto coach off.'); render(); },
    'coach-off': () => { if (D().coach) D().coach.on = false; State.save(); toast('Coach off: back to your plain tactic (a formation change stays; change it in Squad).'); render(); },
    'digest-play': el => playDigest(el.dataset.id),
    'rec-reel': el => playReel(el.dataset.id),
    'rec-clip': el => playReel(el.dataset.id, +el.dataset.i),
    'rec-del': el => { Rec.del(el.dataset.id).then(() => { COACH.recs = null; if (App.view === 'coach') render(); }); },
    'open-pack': el => { closeModal(); openPack(el.dataset.pack, false); },
    'buy-pack': el => openPack(el.dataset.pack, true),
  };
  App.actions = ACTIONS;

  document.addEventListener('input', e => { if (e.target && e.target.id === 'dr-paste' && App.direct) App.direct.paste = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'on-code') ACTIONS['on-join'](e.target, e); });
  document.addEventListener('click', e => {
    if (e.target.closest('#mnav-more')) { $('#tabs').classList.toggle('open'); window.scrollTo(0, 0); return; }
    if (e.target.closest('#burger')) { $('#tabs').classList.toggle('open'); return; }
    const tab = e.target.closest('#tabs button');
    if (tab && tab.dataset.train) { $('#tabs').classList.remove('open'); startTraining(); return; }
    if (tab) { if (tab.dataset.mt) App.marketTab = tab.dataset.mt; if (tab.dataset.view === 'top5') App.t5tab = tab.dataset.t5 || 'lg'; $('#tabs').classList.remove('open'); setView(tab.dataset.view); return; }
    const sg = e.target.closest('a.site-go');
    if (sg) { toast(sg.dataset.ready ? 'Opening your club on Vercel in a new tab...' : 'Opening Vercel. If your club is not there, use Settings > Account > Show transfer code.', 'good'); return; }   // v222: the browser follows the link itself
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    // an inner action (e.g. a card in the modal) must not also trigger the overlay close
    if (el.dataset.act !== 'overlay-bg') e.stopPropagation();
    try { fn(el, e); } catch (err) { toast('Something went wrong: ' + ((err && err.message) || err), 'bad'); if (window.console) console.error(err); }   // never fail silently
  });

  /* ============================== MAIN LOOP ============================== */
  let marketOwed = 0;                                                  // v105: ticks skipped during a match (the tick costs a few ms: a hitch mid-play), caught up after it
  function marketTick() {
    if (App.match) { marketOwed = Math.min(marketOwed + 1, 12); return; }
    let notes = [];
    for (let i = 0; i < marketOwed; i++) notes = notes.concat(Market.tick(true));
    marketOwed = 0;
    notes = notes.concat(Market.tick());
    notes.slice(0, 4).forEach(n => toast(n, /SOLD|Won/.test(n) ? 'good' : /Outbid|did not/.test(n) ? 'bad' : ''));
    updateHeader();
    // live-refresh only the parts that don't hold user input
    if (App.view === 'market' && !App.match && !$('#modal-root').children.length) {
      if (App.marketTab === 'search') { const r = $('#mresults'); if (r) r.innerHTML = resultsHTML(); }
      else render();
    }
  }

  function boot() {
    if (SET.lang === 'fr') RUT.i18n.set('fr');
    State.load();
    if (RUT.Auth && RUT.Auth.user && D().clubName !== RUT.Auth.user.name) D().clubName = RUT.Auth.user.name;   // the club is named after the account
    if (!D().aw198) { D().aw198 = 1; const ids = Object.keys(D().items).filter(id => (D().items[id].promo || {}).type === 'award'); ids.forEach(id => State.destroy(id)); if (ids.length) State.save(); }   // v198 (JODIO): the first award cards (wrong winners) are removed
    Market.init();
    // v140 (JODIO): every club named like "FC Barcelone" gets one CL Doué card, once (checked on every login so accounts made later are covered too)
    try {
      const nm = String(D().clubName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
      const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0))); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
      const barca = nm.length >= 5 && (/barcelon|barcelo|barsa|barca/.test(nm) || lev(nm, 'fcbarcelone') <= 3 || lev(nm, 'fcbarcelona') <= 3);
      const g = D().gifts || (D().gifts = {});
      if (barca && !g.doueFCB) {
        const base = RUT.DB.players.find(c => !c.promo && c.name === 'Désiré Doué'), card = base && RUT.DB.registerPromo(base.id, 'clpromo', 4);
        if (card) { const it = State.newItem(card.id, { promo: { baseId: base.id, type: 'clpromo', boost: 4 } }); D().club.push(it.id); g.doueFCB = 1; setTimeout(() => toast('Gift for FC Barcelone: a Champions League Doué card is in your club', 'good'), 800); }
      }
    } catch (e) { console.warn('gift failed', e); }
    if (RUT.Quests) RUT.Quests.notify = msg => toast(msg, 'good');
    State.save();
    render();
    setInterval(marketTick, Market.TICK_MS);
    if (RUT.Staff) RUT.Staff.onManage = id => RUT.Staff.applyStyle(RUT.Staff.poolOf(id).style);
    sfTick(); setInterval(sfTick, 1000);
    window.addEventListener('beforeunload', () => State.save());
    let seen = true; try { seen = !!localStorage.getItem('retro_ut_99_seen' + (RUT.Auth ? RUT.Auth.ns : '')); } catch (e) { /* storage blocked */ }
    if (!seen) {
      try { localStorage.setItem('retro_ut_99_seen' + (RUT.Auth ? RUT.Auth.ns : ''), '1'); } catch (e) { /* ignore */ }
      modal(`<h1>WELCOME TO FC RETRO 27</h1>
        <p>You start with <span class="gold">${fmt(D().coins)} coins</span>, a starter XI and a Starter Pack. Open it, build your XI, then climb the League from C3 to A1.</p>
        <p class="dim" style="font-size:8px">Ratings for the 150 headline players are estimates (FC 27 ratings aren't public). Everything saves to your browser's LocalStorage.</p>
        <div class="row"><button class="btn y" data-act="open-pack" data-pack="starter">Open your Starter Pack</button><button class="btn" data-act="close">Later</button></div>`);
    }
  }
  const lo = document.getElementById('btn-logout');
  if (lo) lo.addEventListener('click', () => { State.save(); RUT.Auth.logout(); location.reload(); });
  RUT.Auth.gate(boot);
})();

/* v164: cards tilt toward the mouse in 3D and their gloss follows it */
(function () {
  let last = null;
  document.addEventListener('pointermove', e => {
    const c = e.target && e.target.closest && (e.target.closest('.c3d') || e.target.closest('.card.pxc'));
    if (last && last !== c) { last.style.removeProperty('--rx'); last.style.removeProperty('--ry'); last = null; }
    if (!c || e.pointerType === 'touch') return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--ry', ((x - 0.5) * 40).toFixed(1) + 'deg'); c.style.setProperty('--rx', ((0.5 - y) * 28).toFixed(1) + 'deg');
    c.style.setProperty('--mx', (x * 100).toFixed(0) + '%'); c.style.setProperty('--my', (y * 100).toFixed(0) + '%');
    last = c;
  }, { passive: true });
})();
