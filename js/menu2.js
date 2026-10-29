/* v284 (JODIO): new FC 26 + FC 27 style menu, five skins to pick from. Off unless <html data-menu="1..5"> is set (js/menu2.js reads ?menu=N or localStorage rut_menu).
   Layout A = text left + big tiles right (skins 1, 3), B = squad board + player panel (skin 2), C = featured event + reward panel + tile row (skins 4, 5). */
(function () {
  window.RUT = window.RUT || {};
  const LAYOUT = { 1: 'A', 2: 'B', 3: 'A', 4: 'C', 5: 'C' }, NAMES = { 1: 'Foundations', 2: 'Team Management', 3: 'Season Objectives', 4: 'Play Hub', 5: 'Squad Battles' };
  let n = 5; try { const q = new URLSearchParams(location.search).get('menu'), ls = localStorage.getItem('rut_menu'); n = +(q != null ? q : ls != null ? ls : 5); } catch (e) { /* ignore */ }   // v285 (JODIO): option 5 is the menu; ?menu=0 turns it off
  if (LAYOUT[n]) document.documentElement.setAttribute('data-menu', String(n));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const art = (k) => {   // simple card-shaped art for the tiles
    const g = { play: '#2fe0a0,#0a6a52', squad: '#4aa8ff,#12408a', store: '#ffd35a,#9a6a08', market: '#c07bff,#4a1a8a', sbc: '#ff7a5a,#8a2a12', club: '#5affd8,#0a5a6a', evo: '#7aff8a,#0a6a2a', quest: '#ff5ad8,#6a0a5a' }[k] || '#4aa8ff,#12408a', [a, b] = g.split(',');
    return `<svg viewBox="0 0 120 150" class="m2-art"><defs><linearGradient id="g${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><path d="M14 8h92l8 10v104l-14 22H20L8 122V18z" fill="url(#g${k})" stroke="rgba(255,255,255,.55)" stroke-width="2"/><path d="M14 8h92l8 10v104" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="6"/><circle cx="60" cy="62" r="24" fill="rgba(255,255,255,.18)"/><path d="M36 124q24-30 48 0" fill="rgba(255,255,255,.2)"/></svg>`;
  };
  const tile = (v, title, sub, k, extra) => `<button class="m2-tile" data-act="nav" data-v="${v}"><b>${title}</b><small>${sub}</small>${art(k)}${extra || ''}</button>`;
  const nav = (tabs) => `<div class="m2-sub">${tabs.map(([t, v, on]) => `<button data-act="nav" data-v="${v}"${on ? ' class="on"' : ''}>${t}</button>`).join('')}</div>`;
  const hints = `<div class="m2-hints"><span><i>A</i> Select</span><span><i>B</i> Back</span><span class="r">FC HUB</span></div>`;
  function home(c) {
    const lay = LAYOUT[n], fig = c.figure || '';
    if (lay === 'A') return `<section class="m2 m2-a">
      <h1 class="m2-h">${n === 3 ? 'Season 1: Retro Legends' : 'Foundations'}</h1>
      <div class="m2-row">
        <div class="m2-text"><p>${n === 3 ? 'Dive into themed content with SBCs, live events, promo cards and evolutions. Earn rewards as you climb the season ladder and build the ultimate squad.' : 'Complete Foundation objectives to earn rewards and improve your squad.'}</p>
          <p>Play matches to sharpen your skills and rise through the divisions.</p><p>Submit SBCs, open packs and complete evolutions to earn rewards and keep your squad in top shape.</p>
          <button class="m2-go" data-act="nav" data-v="play">Kick Off</button></div>
        <div class="m2-tiles">${tile('sbc', 'Foundations SBCs', 'New SBCs available', 'sbc', '<span class="m2-cnt">Challenges <b>' + c.sbc + '</b></span>')}${tile('store', 'Foundations Events', 'Open packs and win promo cards', 'store', '<span class="m2-cnt">Packs <b>' + c.packs + '</b></span>')}${tile('evo', 'Foundations Evolutions', 'Upgrade your items', 'evo', '<span class="m2-cnt">Evolutions <b>3</b></span>')}</div>
      </div>${hints}</section>`;
    if (lay === 'B') return `<section class="m2 m2-b">
      <div class="m2-bar"><b>Team Management</b>${nav([['Squad', 'squad', 1], ['Tactics', 'tactics'], ['Assignments', 'quests']])}</div>
      <div class="m2-row">
        <div class="m2-board"><div class="m2-pitch">${c.xi}</div><div class="m2-subs"><b>Substitutes</b><div>${c.bench}</div></div></div>
        <aside class="m2-card"><div class="m2-head">${fig ? `<img src="${fig}" alt="">` : ''}<div><small>${esc(c.pos)}</small><h2>${esc(c.club)}</h2></div><span class="m2-ovr">${c.rating}</span></div>
          <div class="m2-stats"><div><i>Form</i><b>+0 OVR</b></div><div><i>Morale</i><b>Happy</b></div><div><i>Fitness</i><b>Decent</b></div></div>
          <div class="m2-grid"><div>Squad Rating <b>${c.rating}</b></div><div>Chemistry <b>${c.chem}/33</b></div><div>Record <b>${c.rec}</b></div><div>Goals <b>${c.goals}</b></div><div>Wins <b>${c.wins}</b></div><div>Coins <b>${c.coins}</b></div></div>
          <div class="m2-ps">${'<span></span>'.repeat(8)}</div></aside>
      </div>
      <div class="m2-foot"><button data-act="nav" data-v="squad">Edit Squad</button><button data-act="nav" data-v="tactics">Edit Active Tactic</button><button data-act="nav" data-v="unassigned">Suggested Subs</button><button data-act="nav" data-v="club">Full Profile</button></div></section>`;
    return `<section class="m2 m2-c">
      <div class="m2-bar">${nav([['For You', 'home', 1], ['Competitive', 'league'], ['Live Events', 'top5'], ['Event Series', 'rivals'], ['Play vs AI', 'play']])}</div>
      <div class="m2-row">
        <div class="m2-feat">${n === 5 && c.feat ? `<div class="m2-showcard">${c.feat}</div>` : ''}
          <h1 class="m2-h">${n === 5 ? 'MOMENTS' : 'SINGLE NATION TOURNAMENT'}</h1><div class="m2-tag">${n === 5 ? 'DAILY CHALLENGES · QUESTS · EARN PACKS' : '4 ROUNDS · GOLDEN GOAL · MYSTERY BALL'}</div>
          <p>${n === 5 ? 'Complete Moments to earn coins and packs every day. Build your club while the Ballon d\'Or 2026 stars are on show.' : 'Compete in the live event to complete objectives and earn rewards!'}</p>
          <div class="m2-info"><span><i>Your Club</i><b>${esc(c.club)}</b></span><span><i>Rating</i><b>${c.rating}</b></span><span><i>Record</i><b>${c.rec}</b></span></div>
          <button class="m2-go" data-act="nav" data-v="${n === 5 ? 'quests' : 'play'}">${n === 5 ? 'Enter Moments' : 'View Tournament'}</button></div>
        ${n === 5 && c.top10 ? `<aside class="m2-rew m2-bd"><b>Ballon d'Or 2026</b><small>Top 10 showcase</small><div class="m2-top10">${c.top10}</div><button class="m2-go sm" data-act="nav" data-v="bdorgal">See all nominees</button></aside>` : `<aside class="m2-rew"><b>Reward</b><small>Single Nation Tournament</small>${art('store')}<span>1x Rare Mega Pack (Untradeable)</span><small>Completed Objectives 0 / 4</small></aside>`}
      </div>
      <div class="m2-tiles m2-tiles3">${tile('play', 'Kick Off', 'Play a match', 'play')}${tile('quests', 'Moments', 'Daily challenges', 'quest')}${tile('store', 'Store', 'Open packs', 'store')}${tile('market', 'Transfer Market', 'Buy and sell', 'market')}</div>${hints}</section>`;
  }
  RUT.Menu2 = { home, on: () => !!LAYOUT[n], n, NAMES };
})();
