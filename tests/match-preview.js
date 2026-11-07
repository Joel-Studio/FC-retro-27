'use strict';
const playerSelect = document.querySelector('#player');
const namedPlayers = ['Kylian Mbappé', 'Michael Olise', 'Yan Diomandé', 'Lamine Yamal', 'Jude Bellingham', 'Pau Cubarsí', 'Raphinha'];
for (const name of namedPlayers) { const option = document.createElement('option'); option.textContent = name; playerSelect.append(option); }
const positions = ['GK','LB','CB','CB','RB','CDM','CM','CAM','LW','ST','RW'];
const squad = club => {
  const used = new Set();
  return positions.map(position => {
    const card = RUT.DB.players.find(c => c.position === position && !used.has(c.id) && c.club === club)
      || RUT.DB.players.find(c => c.position === position && !used.has(c.id));
    used.add(card.id); return card;
  });
};
let match = null, paused = false, frames = 0, startedAt = performance.now();
const canvas = document.querySelector('#pitch');
const status = document.querySelector('#performance');
function begin() {
  if (match) match.stop();
  const homeCards = squad('Barcelona'), awayCards = squad('Bayern');
  const card = RUT.DB.players.find(c => c.name === playerSelect.value);
  match = new RUT.Engine.Match({ home: { name: 'Preview', cards: homeCards },
    away: { name: 'Practice CPU', cards: awayCards }, humans: [0], seed: 38214, pitch: 'standard',
    training: { hero: card, mates: homeCards.slice(1,10), foes: awayCards.slice(1), foeMode: 'ai',
      keeper: awayCards[0], mateKeeper: homeCards[0] } });
  match.start(canvas);
  match.camMode = document.querySelector('#view').value;
  paused = false; document.querySelector('#pause').textContent = 'Pause';
}
document.querySelector('#start').onclick = begin;
playerSelect.onchange = begin;
document.querySelector('#pause').onclick = () => { if (match) { paused = !paused; match.paused = paused; document.querySelector('#pause').textContent = paused ? 'Resume' : 'Pause'; } };
document.querySelector('#reset').onclick = () => { if (match) { match.giveBall(match.hero); match.ball.shot = null; } };
document.querySelector('#view').onchange = event => { if (match) match.camMode = event.target.value; };
document.querySelectorAll('[data-pad]').forEach(button => {
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); if (match) match.press(button.dataset.pad, true); };
  const release = () => { if (match) match.press(button.dataset.pad, false); };
  button.onpointerup = release; button.onpointercancel = release; button.onlostpointercapture = release;
});
const zone = document.querySelector('.tc-zone'), stick = document.querySelector('.tc-stick');
let origin = null, activePointer = null;
zone.onpointerdown = event => {
  origin = { x: event.clientX, y: event.clientY }; activePointer = event.pointerId;
  zone.setPointerCapture(event.pointerId); stick.style.left = origin.x + 'px'; stick.style.top = origin.y + 'px'; stick.classList.add('on');
};
zone.onpointermove = event => {
  if (!origin || event.pointerId !== activePointer || !match) return;
  const dx = (event.clientX - origin.x) / 55, dy = (event.clientY - origin.y) / 55, length = Math.max(1, Math.hypot(dx,dy));
  match.setStick(dx / length, dy / length, length > 1.2);
};
const releaseStick = () => { origin = null; activePointer = null; stick.classList.remove('on'); if (match) match.setStick(0,0,false); };
zone.onpointerup = releaseStick; zone.onpointercancel = releaseStick; zone.onlostpointercapture = releaseStick;
function monitor(time) {
  frames++;
  if (time - startedAt > 2000) {
    const fps = Math.round(frames * 1000 / (time - startedAt));
    const stage = match && match._u3;
    status.textContent = match ? (stage ? 'WebGL 3D' : '3D unavailable') + ' · ' + fps + ' display FPS · ' + (stage ? stage.renderer.info.render.calls + ' draws · ' : '') + (match._u3Fail ? 'renderer error' : 'running') : 'Ready · no club progress saved';
    frames = 0; startedAt = time;
  }
  requestAnimationFrame(monitor);
}
requestAnimationFrame(monitor);
