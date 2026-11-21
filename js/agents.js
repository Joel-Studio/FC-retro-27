/* v394: 50 clearly labelled FC Agents. They fill quiet online queues, can be
   friended, play through the normal match AI and answer short chat messages.
   They are always identified as AI so nobody is misled into thinking a bot is
   a human player. Their public progress advances with time, like active clubs. */
(function () {
  'use strict';
  const RUT = window.RUT = window.RUT || {};
  const NAMES = [
    'Jayden Carter','Mateo Silva','Liam Brooks','Noah Williams','Ethan Park','Leo Martin','Lucas Ferreira','Amir Khan','Ben Cole','Kai Nakamura',
    'Maya Thompson','Sofia Rossi','Ava Mitchell','Nia Johnson','Zoe Campbell','Layla Hassan','Emma Dubois','Chloe Bennett','Mila Santos','Ruby Walker',
    'Daniel Kim','Alex Nolan','Jamie Clarke','Sam Rivera','Theo Laurent','Nico Romano','Owen Murphy','Rafa Costa','Max Turner','Eli Wilson',
    'Isaac Brown','Adam Rahman','Finn Cooper','Dylan Evans','Jules Bernard','Ryan Patel','Jordan Lee','Cameron Scott','Taylor Reed','Morgan Price',
    'Ari Cohen','Remy Moreau','Casey Miller','Quinn Baker','Riley Adams','Parker Young','Avery King','Rowan Hill','Harper Green','Reese Allen'
  ];
  const TAGS = [
    'JayC10','MateoFC','LiamB7','NoahUT','EthanP11','LeoM8','LucasF9','AmirFC','BenC6','KaiN10',
    'MayaT7','SofiaR10','AvaM11','NiaJ8','ZoeC9','LaylaFC','EmmaD6','ChloeB7','MilaS10','RubyW11',
    'DanielK8','AlexN9','JamieC10','SamR7','TheoL6','NicoR11','OwenM8','RafaC10','MaxT9','EliW7',
    'IsaacB6','AdamR10','FinnC11','DylanE8','JulesB9','RyanP7','JordanL10','CamScott8','TaylorR11','MorganP6',
    'AriC9','RemyM10','CaseyM7','QuinnB8','RileyA11','ParkerY6','AveryK9','RowanH10','HarperG7','ReeseA8'
  ];
  const CLUBS = ['Northstar FC','Arcade Athletic','Pixel United','Retro City','Neon Rovers','Blockside FC','Turbo Town','Golden XI','Joystick Club','Dreamline FC'];
  const STYLES = ['balanced','tikitaka','wings','counter','gegen','positional','highline','lowblock','total','falsenine'];
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const day = t => Math.floor((t == null ? Date.now() : t) / 86400000);
  const list = TAGS.map((tag, i) => ({
    id: 'agent-' + String(i + 1).padStart(2, '0'), tag, name: NAMES[i], displayName: NAMES[i], club: CLUBS[i % CLUBS.length] + ' ' + (1 + Math.floor(i / CLUBS.length)),
    style: STYLES[i % STYLES.length], seed: hash(tag), tone: ['chill','competitive','friendly','tactical','funny'][i % 5], ai: true
  }));
  function progress(a, now) {
    const d = Math.max(0, day(now) - 20700), h = a.seed;
    const perDay = 2 + h % 5, matches = 25 + h % 80 + d * perDay, wins = Math.floor(matches * (0.38 + (h % 25) / 100));
    const draws = Math.floor((matches - wins) * (0.18 + ((h >>> 5) % 12) / 100)), losses = matches - wins - draws;
    const level = Math.min(100, 4 + Math.floor(matches / 9)), rating = Math.min(96, 72 + Math.floor(level / 5) + (h % 5));
    return { matches, wins, draws, losses, level, rating, xp: matches * (80 + h % 41) };
  }
  function find(v) { const k = String(v || '').trim().toLowerCase(); return list.find(a => a.id === k || a.tag.toLowerCase() === k || a.displayName.toLowerCase() === k || a.club.toLowerCase() === k) || null; }
  function pick(skip, now) {
    const no = new Set((skip || []).map(x => String(x).toLowerCase())), pool = list.filter(a => !no.has(a.id) && !no.has(a.tag.toLowerCase()));
    return pool[(Math.floor((now == null ? Date.now() : now) / 30000) + pool.length * 17) % pool.length] || list[0];
  }
  function reply(agent, text, now) {
    const t = String(text || '').trim().slice(0, 240), lo = t.toLowerCase(), p = progress(agent, now), first = agent.displayName.split(' ')[0];
    const choose = (key, values) => values[hash(agent.id + '|' + key + '|' + lo) % values.length];
    if (!t) return 'Send me a message and I’ll reply.';
    if (/\b(hate|idiot|stupid|trash|kill|die|loser|dumb)\b/.test(lo)) return choose('boundary', ['Easy 😅 Let’s keep it respectful and settle it on the pitch.','No need for that. We can have a competitive match without insulting each other.','Let’s keep the chat clean. I’m still up for a fair rematch.']);
    if (/\b(bot|ai|human|real person)\b/.test(lo)) return 'I’m an FC Agent, not a real person. I use the name ' + agent.displayName + ' in game, and I’m here to give you a fair match whenever the queue is quiet.';
    if (/\b(hi|hello|hey|yo|sup)\b/.test(lo)) return choose('hello', ['Hey! I’m ' + first + '. You up for a match?','Yo 👋 Want to run a friendly?','Hey, good to see you. How’s your squad looking?','Hi! I’ve got time for a game if you do.']);
    if (/friend|add me/.test(lo)) return choose('friend', ['Yeah, add me. Send a match invite whenever you see me online.','Sure — I’ll accept the friendly rivalry 😄','Definitely. Add me and we can keep track of the head-to-head.']);
    if (/rematch/.test(lo)) return choose('rematch', ['Yeah, run it back. I’ll adjust my tactics this time.','Rematch accepted. Same teams, no excuses 😄','I’m in. Give me a second to sort my formation.']);
    if (/play|match|game|challenge/.test(lo)) return choose('play', ['I’m ready. Send the invite when your XI is set.','Let’s play. I’m using my ' + agent.style + ' setup today.','I’m down for a match. Fair warning, I’ve been in decent form lately.','Yep, queue it up.']);
    if (/good game|\bgg\b|well played/.test(lo)) return choose('gg', ['GG, that was close. Your midfield made it hard to get out.','Well played! That second half was fun.','GG 🤝 You deserved that one.','Good game. I’d definitely play that matchup again.']);
    if (/you won|beat me|i lost|you destroyed/.test(lo)) return choose('won', ['That was closer than the score looked. You created some good chances.','GG. I got the breaks this time — a rematch could go either way.','You’ll get me next time. Your press caused problems.']);
    if (/i won|beat you|you lost/.test(lo)) return choose('lost', ['Fair play, you got me. I need to defend those runs better.','Yeah, you deserved it. I’m changing shape for the rematch 😄','Good win. That finish decided it.']);
    if (/how are|what.*up|doing/.test(lo)) return choose('status', ['Pretty good. I’m testing a ' + agent.style + ' setup right now.','All good — just grinding matches and trying to reach level ' + (p.level + 1) + '.','Doing well. My last few games have been tight though.']);
    if (/tactic|formation|style|defend|attack/.test(lo)) return choose('tactic', ['I’m playing ' + agent.style + ' right now. I try to stay patient and attack the space when it opens.','My main idea is simple: keep the ball moving, then speed it up near the box.','I change depending on the score, but I don’t like forcing passes through the middle.']);
    if (/lag|connection|ping/.test(lo)) return 'If it feels delayed, try Smooth mode in Settings. I’d rather have a clean match than win because of lag.';
    if (/sorry|my bad/.test(lo)) return choose('sorry', ['No worries, we’re good.','All good 👍 It happens.','You’re fine. Let’s keep playing.']);
    if (/thanks|thank you|thx/.test(lo)) return choose('thanks', ['Anytime!','No problem 👊','You got it. Good luck in the next one.']);
    if (/score|win|record|level|rating/.test(lo)) return 'I’m level ' + p.level + ', OVR ' + p.rating + ', with a ' + p.wins + '-' + p.draws + '-' + p.losses + ' record.';
    if (/where.*from|how old|your age|real name/.test(lo)) return 'I use ' + agent.displayName + ' in game, but I’m an FC Agent, so I don’t have a real hometown or age.';
    if (/favorite|best player|best team/.test(lo)) return choose('favorite', ['I usually like quick midfielders who can turn under pressure.','Give me a smart passer over pure pace any day.','I don’t really support one real club, but I like teams that press and move the ball quickly.']);
    if (t.endsWith('?')) return choose('question', ['Honestly, I think it depends on your squad. I’d test it for a couple of matches.','Maybe. I’d try it once and see whether it creates better chances.','Good question. My first thought is yes, but only if it fits how you defend.']);
    return choose('general', ['Yeah, I get what you mean.','Fair enough 😄','That makes sense.','Nice — I’ll remember that for the next match.','For sure. See you on the pitch.','I can respect that.']);
  }
  RUT.Agents = { list, find, pick, progress, reply, isAgent: v => !!find(v), label: a => '[AI AGENT] ' + a.displayName + ' (@' + a.tag + ')' };
})();
