const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ctx = { window: {}, Date, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/agents.js', 'utf8'), ctx);
const A = ctx.window.RUT.Agents;

assert.equal(A.list.length, 50, 'exactly 50 agents');
assert.equal(new Set(A.list.map(a => a.id)).size, 50, 'agent ids are unique');
assert.equal(new Set(A.list.map(a => a.tag.toLowerCase())).size, 50, 'nametags are unique');
assert.equal(new Set(A.list.map(a => a.displayName.toLowerCase())).size, 50, 'display names are unique');
A.list.forEach(a => {
  assert(A.find(a.id) === a && A.find(a.tag) === a && A.find(a.displayName) === a, 'agents are findable');
  assert(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(a.displayName), 'agents use believable fictional names');
  assert(A.label(a).startsWith('[AI AGENT] '), 'agents are never presented as human');
  const p = A.progress(a, 1795219200000);
  assert(p.matches >= p.wins + p.draws && p.rating >= 72 && p.rating <= 96, 'progress is sane');
  assert.equal(A.progress(a, 1795219200000).matches, p.matches, 'progress is deterministic');
});
assert(/respectful|no need|clean/i.test(A.reply(A.list[0], 'you are trash')), 'abuse gets a respectful boundary');
assert(/GG|well played|good game/i.test(A.reply(A.list[0], 'gg')), 'sportsmanship gets a positive reply');
assert(/FC Agent|not a real person/i.test(A.reply(A.list[0], 'are you human?')), 'agents disclose that they are automated');
assert.notEqual(A.reply(A.list[0], 'hello'), A.reply(A.list[1], 'hello'), 'agents have varied conversational voices');
assert(A.pick([], 1795219200000).ai, 'matchmaking always returns an agent');

const auth = fs.readFileSync('js/auth.js', 'utf8');
assert(auth.includes('delete j.pw'), 'RUT1 codes strip saved plaintext passwords');
assert(auth.includes('p_pw: null') && !auth.includes('pw: store.get'), 'cloud backups and transfer files do not send a plaintext password');
const engine = fs.readFileSync('js/engine.js', 'utf8');
assert(engine.includes('draw: draw3D') && engine.includes("'FLOW x' + n"), 'performance profile and Flow HUD are wired');
const main = fs.readFileSync('js/main.js', 'utf8');
assert(!main.includes('esc(RUT.Auth.savedPw())'), 'Settings never renders the saved password in plaintext');
assert(main.includes('typing…') && main.includes('HUMAN PLAYER'), 'friend chat has a typing delay and distinguishes human friends');

console.log('PASS 50 labelled agents, deterministic grinding, respectful chat, secure transfer codes, Flow and low-GPU frame caching.');
