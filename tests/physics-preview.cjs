'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { console, Math, Date, Set, Map, performance: { now: () => 0 }, navigator: {}, Peer: function () {},
  localStorage: { getItem: () => null }, document: {}, setTimeout, clearTimeout, setInterval, clearInterval };
context.window = context;
vm.createContext(context);
for (const name of ['potw_data', 'nl_data', 'season_data', 'futurestar_data', 'database', 'traits', 'roles', 'engine', 'net']) {
  vm.runInContext(fs.readFileSync('js/' + name + '.js', 'utf8'), context, { filename: name });
}
const { RUT } = context;
const cards = RUT.DB.players.slice(0, 11);
function match(seed = 33) {
  const m = new RUT.Engine.Match({ home: { name: 'Test', cards }, away: { name: 'CPU', cards },
    humans: [], seed, halfSeconds: 30 });
  m.headless = true;
  return m;
}
function finite(m) {
  for (const p of m.players) for (const key of ['x', 'y', 'vx', 'vy', 'fx', 'fy']) assert(Number.isFinite(p[key]), key);
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) assert(Number.isFinite(m.ball[key]), key);
}
// Coincident players separate deterministically, including zero relative velocity.
const overlap = match();
const pair = overlap.players.filter(p => !p.isGK).slice(0, 2);
overlap.players = pair;
pair.forEach(p => { p.x = 50; p.y = 40; p.vx = p.vy = 0; });
overlap.collidePlayers(1 / 60);
assert(Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) > 0.5);
finite(overlap);
// Touches are simulated at every step size without losing ownership or escaping the carrier.
for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
  const m = match(), p = m.players.find(p => !p.isGK);
  p.x = 50; p.y = 40; p.fx = 1; p.fy = 0; p.vx = 6; p.vy = 0;
  m.giveBall(p);
  let touches = 0, last = -1;
  for (let i = 0; i < 2 / dt; i++) {
    m.t += dt; m.tk++; p.x += p.vx * dt; p.gait = (p.gait + dt * 3) % 1;
    m.stickBall(dt);
    if (p.contact.time !== last) { touches++; last = p.contact.time; }
    assert(Math.hypot(m.ball.x - p.x, m.ball.y - p.y) < 2.2);
    finite(m);
  }
  assert(touches >= 4 && touches <= 18);
  m.kick(p, 20, 3, 2, 0, 'shot');
  assert.equal(p.contact.kind, 'kick');
  assert.equal(m.ball.owner, null);
}
// Identical seeded CPU inputs must reproduce the same match state.
function replay() {
  const m = match(41);
  for (let i = 0; i < 60 * 35; i++) { m.update(1 / 60); finite(m); }
  return JSON.stringify({ score: m.score, ball: [m.ball.x, m.ball.y, m.ball.z],
    players: m.players.map(p => [p.x, p.y, p.vx, p.vy]) });
}
assert.equal(replay(), replay());
// New clients reject an older peer before pairing or starting.
const session = new RUT.Net.Session({ role: 'host', code: 'TEST', club: 'Test', cards, onEvent() {} });
session.room = { emit: async () => {}, leave() {} };
session.onCtl({ data: { k: 'hello', v: 1 }, peer: 'old-peer' });
assert.equal(session.closed, true);
console.log('PASS coincident collisions, fixed-step dribbling, kick contacts, finite CPU simulation, deterministic replay, online version rejection.');
// A sprint needs more stopping distance than a jog; stationary facing remains stable.
function stopDistance(initialSpeed, dt) {
  const m = match(), p = m.players.find(p => !p.isGK);
  m.players = [p]; m.ball.owner = null;
  p.x = 50; p.y = 40; p.fx = 1; p.fy = 0; p.vx = initialSpeed; p.vy = 0;
  p.tx = p.ty = p.sx = p.sy = 0;
  const origin = p.x;
  for (let step = 0; step < 4 / dt; step++) { m.integratePlayers(dt); finite(m); }
  assert(Math.hypot(p.vx, p.vy) < 0.01);
  assert(p.fx > 0.99);
  return p.x - origin;
}
for (const dt of [1 / 30, 1 / 60, 1 / 120]) assert(stopDistance(8,dt) > stopDistance(4,dt));
// The keeper cannot save a shot several metres away or before his dive reaction time.
const saveMatch = match();
const keeper = saveMatch.players.find(p => p.isGK && p.team === 1);
const shooter = saveMatch.players.find(p => p.team === 0 && !p.isGK);
keeper.x = 90; keeper.y = 40;
saveMatch.ball.owner = null;
Object.assign(saveMatch.ball, { x: 94, y: 40, z: 0.3, vx: 20, vy: 0, vz: 0,
  shot: { team: 0, by: shooter, saveChecked: false } });
saveMatch.checkSave();
assert.equal(saveMatch.ball.shot.saveChecked,false);
keeper.dive = { t: 0.02, react: 0.2, y: 40 };
saveMatch.ball.x = 90.5;
saveMatch.checkSave();
assert.equal(saveMatch.ball.shot.saveChecked,false);
console.log('PASS braking distance across step sizes, stationary facing, unreachable keeper contact, and reaction timing.');
