/* =============================================================================
 * roles.js  -  Player roles (role play) per position group
 * -----------------------------------------------------------------------------
 * A role is a bundle of trait tags (see traits.js) that is layered on top of the player's own traits:
 *   add = tags the role gives him, rem = tags it takes away. The match engine plays every player from his
 * (traits + role) tags, so changing a role changes where he stands, what he tries on the ball and how he defends.
 *
 * Groups follow the pitch slot: GK, CB, FB (LB/RB/LWB/RWB), DM (CDM), CM, AM (CAM), W (LW/RW/LM/RM), ST (ST/CF).
 * New tags used only by roles:
 *   hld holds his position when the team has the ball   lib sweeper, sits deep behind the line   hyb steps into midfield in possession
 *   wb  wing-back, high and wide in possession          ifb inverted full-back, tucks into midfield
 *   hsp lives in the half-spaces (arrives late)         free roams to where the ball is, no fixed shape
 *   tck tucks in to help the midfield when defending    prs presses the first pass of the other team
 *   chn runs the channel between full-back and centre-back   sub impact player, saves his legs and bursts after 70'
 * Everyone without a chosen role plays the role that fits his traits and stats best ("Auto").
 * ========================================================================== */
(function () {
  const GROUPS = { GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'DM', CM: 'CM', CAM: 'AM', LW: 'W', RW: 'W', LM: 'W', RM: 'W', ST: 'ST', CF: 'ST' };
  const GROUP_NAME = { GK: 'Goalkeeper', CB: 'Centre-back', FB: 'Full-back / wing-back', DM: 'Defensive midfield', CM: 'Central midfield', AM: 'Attacking midfield', W: 'Winger', ST: 'Striker' };
  const R = (g, key, name, desc, add, rem) => ({ g, key, name, desc, add: add ? add.split(' ') : [], rem: rem ? rem.split(' ') : [] });
  const LIST = [
    R('GK', 'gk-stop', 'Shot-stopper', 'Stays on his line, owns the six-yard box with hands and authority.', 'stk cmd', 'swp shk'),
    R('GK', 'gk-sweep', 'Sweeper-keeper', 'Plays high as an eleventh outfielder, sweeps behind the line and starts attacks with long distribution.', 'swp vrt', 'stk'),
    R('GK', 'gk-pen', 'Penalty hero', 'Wins shootouts and big moments: reads penalties, never rattled.', 'pks clu stk', 'swp'),
    R('CB', 'cb-stop', 'Stopper', 'Duel-winning destroyer: steps out to the striker, wins the air, throws himself at blocks.', 'stp air', 'bpl lzy'),
    R('CB', 'cb-ball', 'Ball-playing defender', 'Steps out and breaks lines with passes from the back.', 'bpl vis clm', 'stp hot'),
    R('CB', 'cb-lib', 'Sweeper (libero)', 'Sits deep and reads danger behind the line, recovers and cleans up.', 'lib clm rec', 'stp hot'),
    R('CB', 'cb-hyb', 'Defender-midfielder', 'Steps into midfield in possession, drops back into the line when it breaks down.', 'hyb bpl sfe', 'stp hot'),
    R('FB', 'fb-def', 'Defensive full-back', 'Never overlaps: protects the back line and the shape.', 'hld clm', 'ovl crs wb ifb run'),
    R('FB', 'fb-att', 'Attacking full-back', 'A playmaker from wide: overlaps, crosses and switches play with long diagonals.', 'ovl crs swi', 'hld ifb'),
    R('FB', 'fb-wb', 'Wing-back', 'Covers the whole flank: arrives at the byline and the far post.', 'wb ovl wid dur crs', 'hld ifb'),
    R('FB', 'fb-inv', 'Inverted full-back', 'Tucks into midfield in possession to create overloads.', 'ifb sfe vis', 'ovl wid crs wb'),
    R('DM', 'dm-des', 'Destroyer', 'Pure ball-winning: interceptions, tackles, shields the back four.', 'stp wrk anc', 'vis swi vrt'),
    R('DM', 'dm-reg', 'Deep-lying playmaker', 'Dictates the tempo from the base with line-breaking passes.', 'vis sfe swi anc', 'stp hot'),
    R('DM', 'dm-piv', 'Pivot', 'Does both: wins it, then plays it. Sits in front of the defence.', 'anc wrk vis', 'run'),
    R('DM', 'dm-hold', 'Holding midfielder', 'The half of a double pivot who stays: never leaves the base.', 'hld anc sfe', 'run late dri'),
    R('DM', 'dm-car', 'Carrying midfielder', 'The half of a double pivot who carries the ball forward.', 'dri wrk fea brs', 'anc hld'),
    R('CM', 'cm-b2b', 'Box-to-box', 'Relentless: covers both penalty areas, arrives late in the box.', 'wrk dur late', 'anc hld'),
    R('CM', 'cm-met', 'Deep-lying metronome', 'Recycles possession sideways, keeps the team ticking.', 'sfe anc vis', 'late run gun'),
    R('CM', 'cm-car', 'Ball-carrier', 'Dribbles through presses and drives the team up the pitch.', 'dri fea brs', 'anc hld'),
    R('CM', 'cm-miz', 'Mezzala', 'Lives in the half-space and arrives late in the box.', 'hsp late dri', 'anc hld'),
    R('AM', 'am-10', 'Classic No. 10', 'Works the hole between the lines: through balls and long shots.', 'vis vrt lng', 'wrk'),
    R('AM', 'am-sh', 'Shadow striker', 'A second forward who arrives late in the box.', 'late box run gun', 'sfe sel'),
    R('AM', 'am-fw', 'False winger', 'Starts wide, drifts inside to create overloads.', 'wid inv dri', 'hld'),
    R('AM', 'am-free', 'Free role', 'Total license: roams to wherever the ball is.', 'free fea vis dri', 'anc hld'),
    R('W', 'w-trad', 'Touchline winger', 'Hugs the byline and whips crosses.', 'wid crs dri', 'inv'),
    R('W', 'w-inv', 'Inverted winger', 'Cuts inside on his strong foot and becomes a secondary striker.', 'inv dri gun', 'wid crs'),
    R('W', 'w-run', 'Wide target', 'Stays high and wide, sprints in behind on the counter.', 'wid run brs lzy', 'drp sfe crs'),
    R('W', 'w-def', 'Defensive winger', 'Tucks in to overload the midfield and protects his full-back.', 'tck wrk', 'lzy gun'),
    R('ST', 'st-poach', 'Poacher', 'Lives on the shoulder of the last defender and scores from six yards.', 'box fin lzy', 'drp wrk'),
    R('ST', 'st-tar', 'Target man', 'Holds the ball up, wins headers and brings others in.', 'tgt air sel', 'run lzy brs'),
    R('ST', 'st-comp', 'Complete forward', 'Does everything: finishes, links, runs in behind.', 'fin vis run', 'lzy'),
    R('ST', 'st-f9', 'False 9', 'Drops into midfield and drags centre-backs with him to open the space.', 'drp vis sfe dri', 'box lzy'),
    R('ST', 'st-2nd', 'Second striker', 'Floats between the lines in the half-spaces.', 'hsp dri late vis', 'tgt lzy'),
    R('ST', 'st-prs', 'Pressing forward', 'First job is to lead the press and win it high.', 'prs wrk rec', 'lzy drp'),
    R('ST', 'st-chn', 'Channel runner', 'Hunts space in behind, in the channels.', 'chn run brs', 'tgt drp'),
    R('ST', 'st-sub', 'Impact sub', 'Saves his legs for 70 minutes, then brings chaos in the last twenty.', 'sub brs fin', 'wrk'),
  ];
  /* v210 (JODIO): the FC 27 role set. A role can belong to several groups (gs) and has focuses: Defend, Balanced, Attack, Build-Up, Roaming.
     A role + focus is one key ('fc-pm:r' = Playmaker, Roaming) whose tags are the role's tags with the focus laid on top, so it travels like any role key.
     like = the classic role whose stat leaning decides how well a player fits it (familiarity ++ / +). */
  const FOCUS = { d: { name: 'Defend', add: 'hld rec', rem: 'run late ovl gun' }, b: { name: 'Balanced', add: '', rem: '' }, a: { name: 'Attack', add: 'run late', rem: 'hld anc' }, u: { name: 'Build-Up', add: 'sfe vis', rem: 'run gun lzy' }, r: { name: 'Roaming', add: 'free dri', rem: 'hld anc' } };
  const F = (gs, key, name, desc, add, rem, foc, like) => ({ gs: gs.split(' '), g: gs.split(' ')[0], key, name, desc, add: add ? add.split(' ') : [], rem: rem ? rem.split(' ') : [], foc: foc.split(''), like, fc: true });
  const FC = [
    F('GK', 'fc-gk', 'Goalkeeper', 'Stays on his line and keeps it simple.', 'stk cmd', 'swp', 'db', 'gk-stop'),
    F('GK', 'fc-swk', 'Sweeper Keeper', 'Comes off his line to sweep up behind a high defence.', 'swp', 'stk', 'dba', 'gk-sweep'),
    F('GK', 'fc-bpk', 'Ball-Playing Keeper', 'Starts attacks with short passes from the back.', 'swp sfe vis', 'stk', 'bu', 'gk-sweep'),
    F('CB', 'fc-def', 'Defender', 'Holds the line, wins his duels and keeps it simple.', 'clm hld', 'bpl hot', 'db', 'cb-lib'),
    F('CB', 'fc-stp', 'Stopper', 'Steps out hard to win the ball before the striker can turn.', 'stp air', 'lzy bpl', 'dba', 'cb-stop'),
    F('CB', 'fc-bpd', 'Ball-Playing Defender', 'Breaks lines with passes and carries the ball out from the back.', 'bpl vis clm', 'stp hot', 'dbu', 'cb-ball'),
    F('CB', 'fc-wdb', 'Wide Back', 'A centre-back who covers the channel and steps wide to defend and overlap.', 'wid rec ovl', 'lib', 'dba', 'cb-hyb'),
    F('FB', 'fc-fb', 'Fullback', 'Defends first and supports the winger when the chance is there.', 'clm', '', 'dba', 'fb-def'),
    F('FB', 'fc-fsb', 'Falseback', 'Tucks into midfield in possession to make a back three.', 'ifb sfe anc', 'ovl wid crs wb', 'db', 'fb-inv'),
    F('FB', 'fc-wb', 'Wingback', 'Covers the whole flank, up and down.', 'wb ovl crs dur', 'hld ifb', 'dba', 'fb-wb'),
    F('FB', 'fc-awb', 'Attacking Wingback', 'Plays like a winger: high, wide and always overlapping.', 'wb ovl wid crs run', 'hld ifb', 'bar', 'fb-att'),
    F('FB', 'fc-iwb', 'Inverted Wingback', 'Moves inside into midfield and attacks through the half-space.', 'ifb vis dri hsp', 'wid crs', 'dba', 'fb-inv'),
    F('DM CM', 'fc-hold', 'Holding', 'Shields the back line and never leaves his post.', 'hld anc stp', 'run late dri', 'db', 'dm-hold'),
    F('DM', 'fc-chf', 'Centre-Half', 'Drops between the centre-backs to make a back three.', 'lib anc clm', 'run late', 'db', 'dm-des'),
    F('DM CM', 'fc-dlp', 'Deep-Lying Playmaker', 'Runs the game from deep with long and short passing.', 'vis sfe swi anc', 'stp hot', 'dbu', 'dm-reg'),
    F('DM CM', 'fc-b2b', 'Box-to-Box', 'Covers every blade of grass: defends, then arrives in the box.', 'wrk dur late', 'anc hld', 'dba', 'cm-b2b'),
    F('CM AM', 'fc-pm', 'Playmaker', 'Finds the pockets between the lines and plays the killer pass.', 'vis vrt sfe', 'stp', 'bar', 'am-10'),
    F('CM AM', 'fc-hw', 'Half-Winger', 'Drifts wide from the middle to overload the flank and half-space.', 'hsp wid dri', 'anc hld', 'bar', 'cm-miz'),
    F('CM', 'fc-bc', 'Box Crasher', 'Bursts from midfield into the box to finish moves.', 'late box run', 'anc hld', 'bar', 'am-sh'),
    F('AM', 'fc-ss', 'Shadow Striker', 'A second striker who runs beyond the forward.', 'late box run gun', 'sfe', 'ba', 'am-sh'),
    F('AM', 'fc-c10', 'Classic 10', 'Stays in the hole and saves his energy for the moments that matter.', 'vis vrt lng lzy', 'wrk', 'bar', 'am-10'),
    F('W', 'fc-wng', 'Winger', 'Hugs the touchline, beats his man and crosses.', 'wid crs dri', 'inv', 'ba', 'w-trad'),
    F('W', 'fc-wm', 'Wide Midfielder', 'Works the whole flank and tracks back.', 'wid wrk tck', 'lzy', 'dba', 'w-def'),
    F('W', 'fc-wpm', 'Wide Playmaker', 'Starts wide, then drifts inside to create.', 'inv vis sfe', 'crs', 'bar', 'am-fw'),
    F('W', 'fc-if', 'Inside Forward', 'Cuts inside onto his strong foot to shoot.', 'inv dri gun', 'wid crs', 'bar', 'w-inv'),
    F('ST', 'fc-af', 'Advanced Forward', 'Plays on the last defender and runs in behind.', 'run brs fin chn', 'drp', 'ba', 'st-chn'),
    F('ST', 'fc-poa', 'Poacher', 'Lives in the box and scores from close range.', 'box fin lzy', 'drp wrk', 'ba', 'st-poach'),
    F('ST', 'fc-f9', 'False 9', 'Drops deep to link play and drag defenders out.', 'drp vis sfe dri', 'box lzy', 'bur', 'st-f9'),
    F('ST', 'fc-tf', 'Target Forward', 'Holds the ball up and wins headers.', 'tgt air sel', 'run brs lzy', 'ba', 'st-tar'),
  ];
  const BY = {}; LIST.forEach(r => { BY[r.key] = r; });
  FC.forEach(r => r.foc.forEach(f => {
    const fo = FOCUS[f], fr = fo.rem ? fo.rem.split(' ') : [];
    // Roaming: a midfielder roams to the ball (free); anybody else roams between the lines in the half-spaces, so the front line never empties
    const fa = f === 'r' && !r.gs.some(g => g === 'CM' || g === 'AM' || g === 'DM') ? ['hsp', 'dri'] : fo.add ? fo.add.split(' ') : [];
    const add = r.add.filter(t => !fr.includes(t)).concat(fa.filter(t => !r.add.includes(t)));
    const v = Object.assign({}, r, { key: r.key + ':' + f, base: r.key, focus: f, focusName: fo.name, add, rem: r.rem.filter(t => !fa.includes(t)).concat(fr.filter(t => !add.includes(t))) });
    BY[v.key] = v;
    if (!BY[r.key] || f === 'b') BY[r.key] = v;      // the bare key means the role on Balanced (or its first focus)
  }));
  const fits = (r, g) => !!r && (r.gs ? r.gs.includes(g) : r.g === g);
  const groupOf = pos => GROUPS[pos] || 'CM';
  const rolesIn = pos => LIST.filter(r => r.g === groupOf(pos));
  const baseTags = card => (RUT.traitsFor ? RUT.traitsFor(card) : new Set());
  const cache = {};
  /** The role that fits this card (traits + stats) best within the group of `pos` (default: his own position). */
  function bestRole(card, pos) {
    const g = groupOf(pos || card.position), ck = card.id + '|' + g + '|' + (RUT.cardFingerprint ? RUT.cardFingerprint(card) : 0);
    if (cache[ck]) return cache[ck];
    const tr = baseTags(card), stat = statMap(card);
    let best = null, bs = -1e9;
    LIST.forEach(r => {
      if (r.g !== g) return;
      const sc = fitScore(r, tr, stat);
      if (sc > bs) { bs = sc; best = r; }
    });
    return (cache[ck] = best);
  }
  const fitScore = (r, tr, stat) => { let sc = (stat[r.like || r.key] || 0) * 0.55, hit = 0; r.add.forEach(t => { if (tr.has(t)) hit++; }); r.rem.forEach(t => { if (tr.has(t)) sc -= 1.2; }); return sc + 2.2 * hit / Math.max(1, r.add.length); };
  /** Stat leanings per role so players with no hand-written tags still land somewhere sensible. */
  function statMap(card) {
    const s = card.sub || {}, n = k => ((s[k] == null ? 55 : s[k]) - 35) / 64;
    return {
      'gk-stop': n('gkReflexes') + n('gkHandling') - n('gkKicking') * 0.3, 'gk-sweep': n('gkKicking') + n('sprintSpeed') * 0.2, 'gk-pen': n('gkDiving') * 0.5,
      'cb-stop': n('strength') + n('aggression') + n('jumping') * 0.5, 'cb-ball': n('longPassing') + n('shortPassing') + n('ballControl') * 0.5, 'cb-lib': n('interceptions') + n('sprintSpeed') * 0.6 + n('defAwareness') * 0.4, 'cb-hyb': n('shortPassing') * 0.8 + n('ballControl') * 0.6 + n('stamina') * 0.4,
      'fb-def': n('defAwareness') + n('standingTackle') * 0.5, 'fb-att': n('crossing') + n('stamina') * 0.4, 'fb-wb': n('stamina') + n('sprintSpeed') * 0.6 + n('crossing') * 0.4, 'fb-inv': n('shortPassing') + n('vision') * 0.5,
      'dm-des': n('standingTackle') + n('aggression') + n('interceptions') * 0.5, 'dm-reg': n('vision') + n('longPassing') + n('shortPassing') * 0.5, 'dm-piv': n('interceptions') * 0.8 + n('shortPassing') * 0.8, 'dm-hold': n('defAwareness') + n('positioning') * 0.3, 'dm-car': n('dribbling') + n('ballControl') * 0.5,
      'cm-b2b': n('stamina') + n('sprintSpeed') * 0.5 + n('aggression') * 0.3, 'cm-met': n('shortPassing') + n('ballControl') * 0.3, 'cm-car': n('dribbling') + n('agility') * 0.6, 'cm-miz': n('positioning') + n('finishing') * 0.4 + n('dribbling') * 0.4,
      'am-10': n('vision') + n('longShots') * 0.5 + n('shortPassing') * 0.6, 'am-sh': n('finishing') + n('positioning') * 0.8, 'am-fw': n('dribbling') + n('sprintSpeed') * 0.5, 'am-free': n('dribbling') * 0.8 + n('vision') * 0.8 + n('agility') * 0.4,
      'w-trad': n('crossing') + n('sprintSpeed') * 0.5, 'w-inv': n('dribbling') + n('finishing') * 0.6, 'w-run': n('sprintSpeed') + n('acceleration') * 0.6, 'w-def': n('stamina') + n('defAwareness') * 0.4 + n('aggression') * 0.3,
      'st-poach': n('finishing') + n('positioning'), 'st-tar': n('strength') + n('headingAccuracy') + n('jumping') * 0.5, 'st-comp': n('finishing') * 0.8 + n('shortPassing') * 0.6 + n('dribbling') * 0.5, 'st-f9': n('shortPassing') + n('vision') + n('dribbling') * 0.5,
      'st-2nd': n('dribbling') + n('vision') * 0.5 + n('finishing') * 0.4, 'st-prs': n('stamina') + n('aggression') * 0.6 + n('workRate') * 0.2, 'st-chn': n('sprintSpeed') + n('acceleration') * 0.6, 'st-sub': 0.3,
    };
  }
  const fcIn = pos => FC.filter(r => fits(r, groupOf(pos)));
  const famCache = {};
  /** v210: FC 27 familiarity of a card in a role at a position: 2 = ++ (his best role there), 1 = + (one of his next two), 0 = none. Out of his own position group it drops a step. */
  function roleFam(card, key, pos) {
    const r = BY[key]; if (!r || !r.fc || !card) return 0;
    const g = groupOf(pos || card.position), ck = card.id + '|' + g + '|' + (RUT.cardFingerprint ? RUT.cardFingerprint(card) : 0);
    let rank = famCache[ck];
    if (!rank) { const tr = baseTags(card), st = statMap(card); rank = famCache[ck] = fcIn(pos || card.position).map(x => [x.key, fitScore(x, tr, st)]).sort((a, b) => b[1] - a[1]).map(x => x[0]); }
    const i = rank.indexOf(r.base || r.key), f = i === 0 ? 2 : i > 0 && i <= 2 ? 1 : 0;
    return groupOf(card.position) === g ? f : Math.max(0, f - 1);
  }
  /** The role a card plays: the chosen one when it belongs to the position group, otherwise the best fit. */
  function roleOf(card, pos, chosen) {
    const g = groupOf(pos || card.position);
    const c = chosen || card.role;
    if (c && fits(BY[c], g)) return BY[c];
    return bestRole(card, pos);
  }
  /** His own traits with the role layered on top (a new Set). */
  function effectiveTags(card, pos, chosen) {
    const out = new Set(baseTags(card)), r = roleOf(card, pos, chosen);
    if (r) { r.rem.forEach(t => out.delete(t)); r.add.forEach(t => out.add(t)); }
    return out;
  }
  window.RUT = window.RUT || {};
  RUT.ROLES = LIST; RUT.ROLE_BY = BY; RUT.ROLE_GROUPS = GROUPS; RUT.ROLE_GROUP_NAME = GROUP_NAME;
  RUT.FC_ROLES = FC; RUT.FOCUS = FOCUS; RUT.fcRolesIn = fcIn; RUT.roleFits = fits; RUT.roleFam = roleFam;
  RUT.roleGroup = groupOf; RUT.rolesIn = rolesIn; RUT.bestRole = bestRole; RUT.roleOf = roleOf; RUT.effectiveTags = effectiveTags;
})();
