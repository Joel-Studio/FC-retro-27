/* =============================================================================
 * coach.js  -  The typed AI coach (v108)
 * -----------------------------------------------------------------------------
 * You type how the team should play ("press higher, fullbacks overlap, fewer long shots"). interpret() reads the sentence (English and some French) clause by clause
 * and turns it into tactic knob changes and position roles. It is a rule-based reader built into the game, not a language model: it tells you exactly what it
 * understood and what it did not. compare() then checks the claim against numbers: it works out, from batches of simulated matches (before and after, same opponents
 * and seeds) and from your own recorded matches, whether the team really changed the way you asked and whether results moved.
 * ========================================================================== */
window.RUT = window.RUT || {};
(function () {
  'use strict';
  const NEG = /\b(don'?t|do not|never|stop|avoid|no more|not|without|n'?arrete|ne pas|evite|jamais)\b/;
  const LESS = /\b(less|fewer|lower|reduce[ds]?|reducing|stop|don'?t|do not|never|avoid|without|no more|too much|too many|tone down|ease off|moins|arrete|evite|jamais|ne pas|not)\b/;
  const STRONG = /\b(much|a lot|way|really|very|far|heavily|always|constantly|all the time|maximum|max|extreme(ly)?|totally|completely|beaucoup|tres|toujours)\b/;
  const SLIGHT = /\b(slightly|a bit|a little|little|bit|somewhat|abit|un peu|legerement)\b/;
  const strip = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.,;!?'&+\-\s]/g, ' ');

  /* ---- axes: something with two directions (more / less), each a set of knob changes at unit strength ---- */
  // eff = { add: {knob: delta}, set: {}, roles: {GROUP: roleKey} }   chk = [metric, expected change when the sign is +]   (minus: the opposite unless chkM is given)
  const AXES = [
    { id: 'press', name: 'Pressing', topic: /\b(press(ing)?|pressure|gegen ?press|harry|hassle|close(s|d)? (them )?down|hunt(ing)? the ball|presse)\b/,
      up: { add: { press: 1.5, pressZone: 0.25, counterPress: 4, aggro: 0.1, line: 2 } }, down: { add: { press: -1.5, pressZone: -0.25, counterPress: -4, line: -2 } }, chk: ['wonHigh', 1] },
    { id: 'line', lab: ['higher', 'deeper'], name: 'Defensive line', plus: /\b(high(er)? (defen[cs]iv?e )?line|push(ing)? (the )?(line|defen[cs]e) up|step(s|ping)? up|offside trap|play(ing)? (a )?high line|defen[cs]e (high|higher)|(higher|further) up the pitch|ligne haute|defense haute)\b/,
      minus: /\b(deep(er)? (defen[cs]e|line|block)|low(er)? (block|line)|sit(ting)? (back|deep)|park the bus|back off|drop(ping)? (the )?(line|defen[cs]e)|defen[cs]e (low|deep|deeper)|bloc bas|ligne basse|defense basse)\b/,
      up: { add: { line: 7, restGap: -1.5, backFwd: -1 } }, down: { add: { line: -6, backFwd: 3, restGap: 1.5 } }, chk: ['line', 1] },
    { id: 'width', lab: ['wider', 'narrower'], name: 'Width', plus: /\b(wide(r)?|wing(s|ers)?|flanks?|touchline|stretch(ing)? (the )?(pitch|defen[cs]e)|ailes)\b/,
      minus: /\b(narrow(er)?|central(ly)?|through the (middle|centre|center)|down the (middle|centre|center)|inside|the middle|axe)\b/,
      up: { add: { width: 0.15, fbHigh: 5, inside: -0.15 } }, down: { add: { width: -0.12, inside: 0.4, cross: -0.15 } }, chk: ['wing', 1] },
    { id: 'cross', name: 'Crossing', topic: /\b(cross(es|ing)?|centres?)\b/, up: { add: { cross: 0.4, targetMan: 2, fbHigh: 3 } }, down: { add: { cross: -0.35, targetMan: -1 } }, chk: ['cross', 1] },
    { id: 'tempo', lab: ['more direct', 'short and patient'], name: 'Passing style', plus: /\b(direct(ly)?|long (balls?|passes|passing)|route one|hit (it )?long|go long|launch(es|ing)?|vertical|speed up|fast(er)? (tempo|play|attack)|quick(er)? (tempo|play|attack)|jeu direct|balles longues)\b/,
      minus: /\b(short (passes|passing|game)|keep (the ball|possession)|possession|tiki|patient(ly)?|build(ing)? (up )?(slow(ly)?|from the back)|play(ing)? out (from|of) (the )?(back|defen[cs]e)|slow(er)? (tempo|play|build)|control the game|passes courtes|garde la balle)\b/,
      up: { add: { vert: 0.3, range: 0.25, shortW: -0.25, targetMan: 1.5 } }, down: { add: { shortW: 0.3, vert: -0.25, range: -0.2, eager: 1.5, link: 0.3 } }, chk: ['long', 1], chkM: ['short', 1] },
    { id: 'counter', name: 'Counter-attacks', topic: /\b(counter(-| )?attack(s|ing)?|counter|on the break|break(s|ing)? (quick(ly)?|fast)|contre(-| )?attaque|contre)\b/,
      up: { add: { counter: 0.5, vert: 0.25, runs: 0.7, line: -2 } }, down: { add: { counter: -0.3, vert: -0.1 } }, chk: ['fwd', 1] },
    { id: 'longshot', name: 'Long shots', topic: /\b(long (range )?(shots?|shooting|efforts?|strikes?)|shoot(ing|s)? from (distance|range|outside|far)|from distance|from outside( the box)?|tirs? de loin|speculative)\b/,
      up: { add: { longShot: 1, shoot: 0.1 } }, down: { add: { longShot: -1, shoot: -0.1 } }, chk: ['far', 1] },
    { id: 'intobox', lab: ['yes', 'no'], name: 'Work it into the box', plus: /\b(into the (box|area)|get(ting)? (it |the ball )?(closer|into the (box|area))|closer to goal|patient(ly)? in the final third|work(ing)? it (in|into)|surface de reparation)\b/,
      up: { add: { longShot: -0.5, shoot: -0.05, inside: 0.2 } }, down: { add: { longShot: 0.5 } }, chk: ['box', 1] },
    { id: 'shoot', name: 'Shooting', topic: /\b(shoot(ing|s)?|shots?|tirs?|tirer|efforts?)\b/, up: { add: { shoot: 0.35, longShot: 0.5, runs: 0.5 } }, down: { add: { shoot: -0.3, longShot: -0.5 } }, chk: ['shot', 1] },
    { id: 'attack', lab: ['more attacking', 'more defensive'], name: 'Mentality', plus: /\b(attack(ing)? (more|harder|often)|more attack(ing)?|be (more )?(attacking|aggressive|ambitious|brave|bold)|go (forward|for it|all out)|push (forward|on)|more (players|men) forward|all[- ]out attack|offensive|attaque|attaquer|plus offensif)\b/,
      minus: /\b(defend(ing)? (more|deeper|better)|more defen[cs]e|more defensive|be (more )?(defensive|careful|cautious|safe|solid|compact)|play (it )?safe|protect (the|our) lead|cautious|defensif|defendre|prudent)\b/,
      up: { add: { runs: 1, line: 2.5, fbHigh: 4, shoot: 0.08, backFwd: -1.5 } }, down: { add: { runs: -1, line: -4, backFwd: 4, restGap: 2, pressZone: -0.15, fbHigh: -4 } }, chk: ['sh', 1], chkM: ['shA', -1] },
    { id: 'aggro', name: 'Aggression in the tackle', topic: /\b(aggress(ion|ive|ively)|tackl(e|es|ing)|physical|rough|hard (tackles|challenges)|tacles?|agressi\w+)\b/,
      up: { add: { aggro: 0.35, manMark: 0.1 } }, down: { add: { aggro: -0.3 } }, chk: ['tk', 1], chkM: ['foul', -1] },
    { id: 'mark', lab: ['man-marking', 'zonal'], name: 'Man-marking', plus: /\b(man[- ]?mark(ing)?|mark(ing)? (tight(ly)?|closely|up|man)|tight marking|marquage)\b/, minus: /\b(zonal|zone marking|marquage en zone)\b/,
      up: { add: { manMark: 0.35 } }, down: { add: { manMark: -0.35 } }, chk: null },
    { id: 'runs', name: 'Runs in behind', plus: /\b(runs? in behind|in behind|behind the (defen[cs]e|line)|off[- ]the[- ]ball|stretch the (defen[cs]e|line)|through balls?|split the defen[cs]e)\b/,
      up: { add: { runs: 1, vert: 0.2, counter: 0.2 } }, down: { add: { runs: -1 } }, chk: ['thru', 1] },
    { id: 'rotate', name: 'Rotation', topic: /\b(rotat(e|es|ing|ion)|swap positions?|total football|interchang\w+|free (role|movement))\b/, up: { add: { rotate: 7 } }, down: { add: { rotate: -7 } }, chk: null },
  ];
  /* ---- role rules: a subject (position) with a job. neg = what a "don't" turns it into ---- */
  const ROLES = [
    { id: 'fb-wb', name: 'Full-backs overlap', re: /\b(full[- ]?backs?|wing[- ]?backs?|laterals?)\b.*\b(overlap\w*|attack\w*|forward|push\w*|bomb\w*|high|wide|join\w*|support\w*)\b|\boverlap\w*\b/, eff: { roles: { FB: 'fb-wb' }, add: { fbHigh: 5 } }, neg: { roles: { FB: 'fb-def' }, add: { fbHigh: -4 } } },
    { id: 'fb-inv', name: 'Inverted full-backs', re: /\binvert(ed)? (full|wing)[- ]?backs?|(full|wing)[- ]?backs?.*\b(inside|tuck\w*|midfield|invert\w*)\b/, eff: { roles: { FB: 'fb-inv' }, add: { fbIn: 0.4 } }, neg: { roles: { FB: 'fb-att' } } },
    { id: 'fb-def', name: 'Full-backs stay back', re: /\b(full[- ]?backs?|wing[- ]?backs?)\b.*\b(stay\w*|back|defen\w+|deep|hold\w*|sit\w*|protect\w*)\b/, eff: { roles: { FB: 'fb-def' }, add: { fbHigh: -4 } }, neg: { roles: { FB: 'fb-att' }, add: { fbHigh: 4 } } },
    { id: 'w-inv', name: 'Wingers cut inside', re: /\b(wing(er|ers)|wide (men|players|forwards?))\b.*\b(cut\w* inside|inside|come\w* (in|inside)|invert\w*|drift\w*)\b|\bcut(s|ting)? inside\b|\binverted wing(er|ers)\b/, eff: { roles: { W: 'w-inv' }, add: { inside: 0.3 } }, neg: { roles: { W: 'w-trad' } } },
    { id: 'w-trad', name: 'Wingers stay wide', re: /\b(wing(er|ers)|wide (men|players))\b.*\b(wide|touchline|byline|stay\w* wide|hug\w*|cross\w*|stretch\w*)\b/, eff: { roles: { W: 'w-trad' }, add: { width: 0.08, cross: 0.1 } }, neg: { roles: { W: 'w-inv' } } },
    { id: 'st-f9', name: 'Striker drops into midfield', re: /\bfalse (9|nine)\b|\b(strikers?|centre[- ]forwards?|number (9|nine)|the 9|lone forward)\b.*\b(drop\w*|deep|link\w*|come\w* (short|deep|back)|between the lines|midfield)\b/, eff: { roles: { ST: 'st-f9' }, add: { drop9: 10 } }, neg: { roles: { ST: 'st-poach' } } },
    { id: 'st-prs', name: 'Striker leads the press', re: /\b(strikers?|centre[- ]forwards?|number (9|nine)|the 9|lone forward)\b.*\b(press\w*|chase\w*|hunt\w*|harry\w*|work\w* hard|defend\w* from the front)\b/, eff: { roles: { ST: 'st-prs' }, add: { counterPress: 1 } }, neg: { roles: { ST: 'st-poach' } } },
    { id: 'st-tar', name: 'Striker holds the ball up', re: /\btarget (man|striker|forward)\b|\b(strikers?|centre[- ]forwards?|number (9|nine)|the 9|lone forward)\b.*\b(hold\w*|back to goal|link up|bring\w* others?|physical|head\w*|aerial)\b|\bhold[- ]?up (play|man)\b/, eff: { roles: { ST: 'st-tar' }, add: { targetMan: 2 } }, neg: { roles: { ST: 'st-comp' } } },
    { id: 'st-chn', name: 'Striker runs in behind', re: /\b(strikers?|centre[- ]forwards?|number (9|nine)|the 9|lone forward)\b.*\b(run\w*|behind|channel\w*|space|stretch\w*|sprint\w*)\b|\bchannel runner\b/, eff: { roles: { ST: 'st-chn' }, add: { runs: 0.5 } }, neg: { roles: { ST: 'st-tar' } } },
    { id: 'st-poach', name: 'Striker lives in the box', re: /\b(strikers?|centre[- ]forwards?|number (9|nine)|the 9|lone forward)\b.*\b(stay\w*|box|poach\w*|shoulder|wait\w*|goal ?hang\w*|finish\w*|score)\b|\bpoacher\b/, eff: { roles: { ST: 'st-poach' } }, neg: { roles: { ST: 'st-comp' } } },
    { id: 'dm-hold', name: 'Holding midfielder stays', re: /\b(holding|defensive) mid(field(er)?s?)?\b.*\b(stay\w*|hold\w*|sit\w*|protect\w*|screen\w*|in front of (the )?(defen[cs]e|back))\b|\b(cdm|dm|pivot)\b.*\b(stay\w*|hold\w*|sit\w*|protect\w*|screen\w*)\b|\banchor(man)?\b/, eff: { roles: { DM: 'dm-hold' } }, neg: { roles: { DM: 'dm-car' } } },
    { id: 'dm-des', name: 'Defensive midfielder destroys', re: /\bdestroyer\b|\b(holding|defensive) mid(field(er)?s?)?\b.*\b(tackl\w*|break\w*|win\w*|destroy\w*|hard|aggress\w*)\b/, eff: { roles: { DM: 'dm-des' } }, neg: { roles: { DM: 'dm-reg' } } },
    { id: 'dm-reg', name: 'Deep-lying playmaker', re: /\bdeep[- ]lying playmaker\b|\bregista\b|\b(holding|defensive) mid(field(er)?s?)?\b.*\b(pass\w*|dictate\w*|play\w*|distribut\w*|tempo|control)\b|\b(cdm|dm|pivot)\b.*\b(pass\w*|dictate\w*|distribut\w*|tempo)\b/, eff: { roles: { DM: 'dm-reg' } }, neg: { roles: { DM: 'dm-des' } } },
    { id: 'cm-b2b', name: 'Box-to-box midfield', re: /\bbox[- ]to[- ]box\b|\bmid(field(er)?s?)\b.*\b(run\w*|arrive\w*|join\w*|get\w* forward|late|support\w*|both boxes|cover\w*)\b/, eff: { roles: { CM: 'cm-b2b' } }, neg: { roles: { CM: 'cm-met' } } },
    { id: 'cm-miz', name: 'Midfielders use the half-spaces', re: /\bmezzala\b|\bmid(field(er)?s?)\b.*\bhalf[- ]?spaces?\b/, eff: { roles: { CM: 'cm-miz' } }, neg: { roles: { CM: 'cm-met' } } },
    { id: 'cm-met', name: 'Midfielders keep it simple', re: /\bmetronome\b|\bmid(field(er)?s?)\b.*\b(recycl\w*|keep it simple|simple|sideways|safe)\b/, eff: { roles: { CM: 'cm-met' } }, neg: { roles: { CM: 'cm-b2b' } } },
    { id: 'am-free', name: 'Number 10 roams free', re: /\b(number 10|no\.? ?10|the 10|playmaker|cam|attacking mid(field(er)?)?)\b.*\b(free|roam\w*)\b/, eff: { roles: { AM: 'am-free' } }, neg: { roles: { AM: 'am-10' } } },
    { id: 'am-10', name: 'Number 10 between the lines', re: /\b(number 10|no\.? ?10|the 10|playmaker|cam|attacking mid(field(er)?)?)\b.*\b(between (the )?lines|create\w*|through balls?|long shots?|pull\w* strings)\b/, eff: { roles: { AM: 'am-10' } }, neg: { roles: { AM: 'am-sh' } } },
    { id: 'gk-sweep', name: 'Sweeper-keeper', re: /\bsweeper[- ]keeper\b|\b(keeper|goalkeeper|goalie|gk)\b.*\b(high|sweep\w*|come\w* out|play\w* out|distribut\w*|feet|rush\w* out|off (his|the) line)\b/, eff: { roles: { GK: 'gk-sweep' } }, neg: { roles: { GK: 'gk-stop' } } },
    { id: 'gk-stop', name: 'Keeper stays on his line', re: /\b(keeper|goalkeeper|goalie|gk)\b.*\b(stay\w*|on (his|the) line|shot[- ]stopper|stop\w* shots?|stand\w*)\b/, eff: { roles: { GK: 'gk-stop' } }, neg: { roles: { GK: 'gk-sweep' } } },
    { id: 'cb-ball', name: 'Ball-playing centre-backs', re: /\bball[- ]playing (defender|cb|centre)|\b(centre[- ]?backs?|cbs?|centre[- ]halves|defenders?)\b.*\b(pass\w*|play\w* out|ball[- ]playing|build\w*|step\w* (out|into)|start\w* (attacks?|moves?)|bring the ball)\b/, eff: { roles: { CB: 'cb-ball' } }, neg: { roles: { CB: 'cb-lib' } } },
    { id: 'cb-lib', name: 'Centre-backs stay deep', re: /\b(centre[- ]?backs?|cbs?|centre[- ]halves|defenders?)\b.*\b(stay\w* (deep|back)|sit\w* (deep|back)|sweep\w*|cover\w*|hold\w*)\b|\bliber(o|os)\b|\bsweeper\b/, eff: { roles: { CB: 'cb-lib' } }, neg: { roles: { CB: 'cb-stop' } } },
    { id: 'cb-stop', name: 'Aggressive centre-backs', re: /\b(centre[- ]?backs?|cbs?|centre[- ]halves|defenders?)\b.*\b(aggress\w*|step\w* out|tackle\w*|win\w* (the )?(ball|aerial|headers?)|physical|stopper|duel\w*)\b|\bstopper\b/, eff: { roles: { CB: 'cb-stop' } }, neg: { roles: { CB: 'cb-lib' } } },
  ];
  const FORM_RE = /\b([3-5])-?([2-5])-?([1-5])(?:-?([1-3]))?\b/;
  const FORM_KEYS = ['433', '442', '4231', '451', '352', '343', '3331', '532', '541'];

  const FRIENDLY = { line: 'defensive line', restGap: 'distance the attackers drop back', backFwd: 'defenders stepping up', press: 'press level', pressZone: 'how far up the press starts', counterPress: 'counter-press', aggro: 'aggression', width: 'width',
    fbHigh: 'full-backs pushing up', inside: 'cutting inside', cross: 'crosses', targetMan: 'target man', vert: 'forward passing', range: 'passing range', shortW: 'short-passing weight', eager: 'support runs for short passes', link: 'link-up play',
    counter: 'counter-attacks', runs: 'runs in behind', shoot: 'shooting', longShot: 'long shots', manMark: 'man-marking', drop9: 'striker dropping deep', fbIn: 'inverted full-backs', rotate: 'position rotation' };
  const ROLE_NAME = (k) => (RUT.ROLE_BY && RUT.ROLE_BY[k] && RUT.ROLE_BY[k].name) || k;
  const GROUP = { GK: 'Keeper', CB: 'Centre-backs', FB: 'Full-backs', DM: 'Defensive mid', CM: 'Midfielders', AM: 'Number 10', W: 'Wingers', ST: 'Striker' };

  function clauses(text) {
    const raw = strip(text).split(/[,.;!?\n]+/).map(s => s.trim()).filter(Boolean), out = [];
    raw.forEach(r => {
      const parts = r.split(/\b(?:and|but|then|also|while|plus|et|mais)\b|&|\+/).map(s => s.trim()).filter(Boolean); let carry = '';
      parts.forEach((p, i) => {
        const cur = (carry + ' ' + p).trim();
        if ((cur.split(/\s+/).length <= 1 || /\b(backs?|wingers?|midfielders?|strikers?|forwards?|defenders?|keeper|players|attackers)$/.test(cur)) && i < parts.length - 1) carry = cur; else { out.push(cur); carry = ''; }
      });
      if (carry) out.push(carry);
    });
    return out;
  }
  const scale = (eff, k) => { const o = { add: {}, set: Object.assign({}, eff.set || {}), roles: Object.assign({}, eff.roles || {}) }; Object.keys(eff.add || {}).forEach(a => { o.add[a] = +(eff.add[a] * k).toFixed(3); }); return o; };

  /** Read an instruction. Returns { items:[{id, name, clause, sign, k, eff, chk}], unknown:[clause], form }. */
  function interpret(text) {
    const items = [], unknown = []; let form = null;
    clauses(text).forEach(c => {
      const strength = STRONG.test(c) ? 1.6 : SLIGHT.test(c) ? 0.5 : 1;
      const fm = FORM_RE.exec(c);
      if (fm) { const key = fm.slice(1, 5).filter(Boolean).join(''); if (FORM_KEYS.indexOf(key) >= 0) { form = key; items.push({ id: 'form', name: 'Formation ' + key.split('').join('-'), clause: c, sign: 1, k: 1, eff: { add: {}, set: {}, roles: {} }, chk: null, form: key }); return; } }
      const neg = NEG.test(c);
      for (const r of ROLES) {
        if (!r.re.test(c)) continue;
        const e = neg ? r.neg : r.eff;
        if (!e) { items.push({ id: r.id, name: r.name, clause: c, sign: -1, k: 1, eff: { add: {}, set: {}, roles: {} }, chk: null, note: 'understood, but there is no opposite setting for this one' }); return; }
        items.push({ id: r.id, name: neg ? 'Not: ' + r.name.toLowerCase() : r.name, clause: c, sign: neg ? -1 : 1, k: 1, eff: scale(e, 1), chk: null, role: true }); return;
      }
      let hit = false;
      for (const a of AXES) {
        let sign = 0;
        if (a.plus && a.plus.test(c)) sign = neg ? -1 : 1;
        else if (a.minus && a.minus.test(c)) sign = neg ? 1 : -1;
        else if (a.topic && a.topic.test(c)) sign = LESS.test(c) ? -1 : 1;
        if (!sign) continue;
        const e = scale(sign > 0 ? a.up : a.down, strength);
        if (a.id === 'line' && sign > 0 && strength >= 1.4) e.set.trap = true;
        const chk = a.chk ? (sign > 0 ? a.chk : (a.chkM || [a.chk[0], -a.chk[1]])) : null;
        items.push({ id: a.id, name: a.name + ': ' + ((a.lab || ['more', 'less'])[sign > 0 ? 0 : 1]), clause: c, sign, k: strength, eff: e, chk }); hit = true; break;
      }
      if (!hit && c.replace(/\b(please|ok|okay|hey|coach|team|i|we|you|want|would|like|to|them|should|let|us|make|get|play|the|a|my|our|more|less|so)\b/g, '').trim().length > 2) unknown.push(c);
    });
    // later instructions on the same thing win
    const last = {}; items.forEach((it, i) => { last[it.id] = i; });
    return { items: items.filter((it, i) => last[it.id] === i), unknown, form };
  }
  /** One set of changes out of the understood items. */
  function merge(items) {
    const K = { add: {}, set: {}, roles: {} };
    items.forEach(it => { Object.keys(it.eff.add).forEach(k => { K.add[k] = +((K.add[k] || 0) + it.eff.add[k]).toFixed(3); }); Object.assign(K.set, it.eff.set); Object.assign(K.roles, it.eff.roles); });
    return K;
  }
  /** What the changes do, in words (for the page). */
  function describe(K) {
    const out = [];
    Object.keys(K.add).forEach(k => { const v = K.add[k]; if (!v) return; let t; if (k === 'line') t = (v > 0 ? '+' : '') + v.toFixed(1) + ' m'; else if (k === 'width') t = (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; else t = v > 0 ? 'more' : 'less'; out.push(FRIENDLY[k] ? FRIENDLY[k] + ' ' + t : k + ' ' + v); });
    if (K.set.trap) out.push('offside trap on');
    Object.keys(K.roles).forEach(g => out.push((GROUP[g] || g) + ': ' + ROLE_NAME(K.roles[g])));
    return out;
  }
  const empty = K => !K || (!Object.keys(K.add).some(k => K.add[k]) && !Object.keys(K.set).length && !Object.keys(K.roles).length);

  /* ---- the proof: paired comparison of simulated matches (same opponents, same seeds) ---- */
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, a.length - 1)); };
  const sample = (res, half) => ({ rs: res.rs[0], poss: res.stats.possession[0], score: res.score, sh: res.stats.shots, half, team: 0 });
  function paired(id, A, B, half) {
    const Rec = RUT.Rec, a = [], b = [], d = [];
    for (let i = 0; i < A.length; i++) { const x = Rec.val(id, sample(A[i], half)), y = Rec.val(id, sample(B[i], half)); if (x == null || y == null) continue; a.push(x); b.push(y); d.push(y - x); }
    if (d.length < 2) return null;
    const n = d.length, md = mean(d), se = sd(d) / Math.sqrt(n), t = se > 0 ? md / se : (md === 0 ? 0 : 9);
    return { id, n, a: mean(a), b: mean(b), d: md, t, level: Math.abs(t) >= 2 ? 'clear' : Math.abs(t) >= 1.2 ? 'likely' : 'noise' };
  }
  const pts = r => (r.won ? 3 : r.draw ? 1 : 0);
  /** base / coached: arrays of simulation results (Engine.simulate) of the same length and order. Returns the per-instruction checks and the overall result. */
  function compare(items, base, coached, half) {
    const checks = items.map(it => {
      if (!it.chk) return { it, p: null };
      const p = paired(it.chk[0], base, coached, half); if (!p) return { it, p: null };
      const want = it.chk[1], moved = p.d * want;
      p.verdict = p.level === 'noise' ? 'no clear change' : moved > 0 ? 'moved the way you asked' : 'moved the other way';
      p.ok = p.level !== 'noise' && moved > 0;
      return { it, p };
    });
    const n = base.length, gd = r => r.score[0] - r.score[1];
    const o = { n, ptsA: mean(base.map(pts)), ptsB: mean(coached.map(pts)), gdA: mean(base.map(gd)), gdB: mean(coached.map(gd)), gfA: mean(base.map(r => r.score[0])), gfB: mean(coached.map(r => r.score[0])), gaA: mean(base.map(r => r.score[1])), gaB: mean(coached.map(r => r.score[1])) };
    const dd = coached.map((r, i) => gd(r) - gd(base[i])), se = sd(dd) / Math.sqrt(Math.max(1, dd.length));
    o.t = se > 0 ? mean(dd) / se : 0; o.level = Math.abs(o.t) >= 2 ? 'clear' : Math.abs(o.t) >= 1.2 ? 'likely' : 'noise';
    o.gdP = paired('poss', base, coached, half);
    return { checks, overall: o };
  }
  RUT.Coach = { AXES, ROLES, interpret, merge, describe, empty, compare, paired, FORM_KEYS, FRIENDLY };
})();
