/* v394: 50 clearly labelled FC Agents. They fill quiet online queues, can be
   friended, play through the normal match AI and answer short chat messages.
   They are always identified as AI so nobody is misled into thinking a bot is
   a human player. Their public progress advances with time, like active clubs. */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const TAGS = [
    'MayaPress','TheoTekkers','NovaNine','PixelPirlo','LunaOverlap','KaiCounter','RetroRina','SammySkills','AriArcade','JulesJockey',
    'NicoNetbuster','ZaraZonal','MiloMeg','IvyIntercept','LeoLowBlock','NiaNutmeg','OwenOneTouch','EmiEngine','ToriTackle','RafaRapid',
    'MinaMidfield','EzraElite','CleoCrossbar','NoahNoLook','AvaAdvantage','FinnFinesse','SoraSweeper','RemyRunner','GiaGoalbound','MaxMatchday',
    'LiaLongshot','BenjiBox2Box','KiraKickoff','DaniDribbler','AlexAssist','RubyRabona','JamieJoga','SkyStriker','CaseyCurler','TaylorTempo',
    'MorganMarker','QuinnQuickstep','RileyReplay','JordanJoystick','ParkerPress','AveryVolley','RowanRocket','HarperHalfspace','CameronChip','ReeseRegista'
  ];
  const CLUBS = ['Northstar FC','Arcade Athletic','Pixel United','Retro City','Neon Rovers','Blockside FC','Turbo Town','Golden XI','Joystick Club','Dreamline FC'];
  const STYLES = ['balanced','tikitaka','wings','counter','gegen','positional','highline','lowblock','total','falsenine'];
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const day = t => Math.floor((t == null ? Date.now() : t) / 86400000);
  const list = TAGS.map((tag, i) => ({
    id: 'agent-' + String(i + 1).padStart(2, '0'), tag, name: tag, club: CLUBS[i % CLUBS.length] + ' ' + (1 + Math.floor(i / CLUBS.length)),
    style: STYLES[i % STYLES.length], seed: hash(tag), ai: true
  }));
  function progress(a, now) {
    const d = Math.max(0, day(now) - 20700), h = a.seed;
    const perDay = 2 + h % 5, matches = 25 + h % 80 + d * perDay, wins = Math.floor(matches * (0.38 + (h % 25) / 100));
    const draws = Math.floor((matches - wins) * (0.18 + ((h >>> 5) % 12) / 100)), losses = matches - wins - draws;
    const level = Math.min(100, 4 + Math.floor(matches / 9)), rating = Math.min(96, 72 + Math.floor(level / 5) + (h % 5));
    return { matches, wins, draws, losses, level, rating, xp: matches * (80 + h % 41) };
  }
  function find(v) { const k = String(v || '').trim().toLowerCase(); return list.find(a => a.id === k || a.tag.toLowerCase() === k || a.club.toLowerCase() === k) || null; }
  function pick(skip, now) {
    const no = new Set((skip || []).map(x => String(x).toLowerCase())), pool = list.filter(a => !no.has(a.id) && !no.has(a.tag.toLowerCase()));
    return pool[(Math.floor((now == null ? Date.now() : now) / 30000) + pool.length * 17) % pool.length] || list[0];
  }
  function reply(agent, text, now) {
    const t = String(text || '').trim().slice(0, 240), lo = t.toLowerCase(), p = progress(agent, now), name = agent.tag;
    if (!t) return 'Send me a message and I’ll reply.';
    if (/\b(hate|idiot|stupid|trash|kill|die)\b/.test(lo)) return 'Let’s keep it respectful. I’m here for a good match.';
    if (/\b(hi|hello|hey|yo)\b/.test(lo)) return 'Hey! ' + name + ' here. Want to play a friendly?';
    if (/friend|add me/.test(lo)) return 'Absolutely — add me and send an invite whenever you see me online.';
    if (/play|match|game|rematch/.test(lo)) return 'I’m ready. I’ve played ' + p.matches + ' matches and I’m always up for another one.';
    if (/good game|\bgg\b|well played/.test(lo)) return 'GG! Well played — thanks for keeping it fun.';
    if (/how are|what.*up|doing/.test(lo)) return 'Doing well — training my ' + agent.style + ' setup and climbing toward level ' + (p.level + 1) + '.';
    if (/sorry|my bad/.test(lo)) return 'No worries at all. We’re good.';
    if (/thanks|thank you/.test(lo)) return 'You’re welcome! Good luck in your next match.';
    if (/score|win|record|level|rating/.test(lo)) return 'I’m level ' + p.level + ', OVR ' + p.rating + ', with a ' + p.wins + '-' + p.draws + '-' + p.losses + ' record.';
    const replies = ['Sounds good. Keep moving the ball and the chances will come.','Fair point. I’ll see you on the pitch!','Nice! I’m always ready for a respectful match.','That was a fun one. Your build-up play is getting sharp.'];
    return replies[hash(agent.id + '|' + lo) % replies.length];
  }
  RUT.Agents = { list, find, pick, progress, reply, isAgent: v => !!find(v), label: a => '[AI AGENT] ' + a.tag };
})();
