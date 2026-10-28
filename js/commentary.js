/* v235 (JODIO): match commentary. Real recorded clips play when there is one for the moment (audio/<lang>/<key>.mp3, JODIO's own
   recordings); every other moment is spoken by the most natural voice on the device, faster and higher on the big moments.
   Settings > Commentary turns it off. English first. */
(function () {
  const RUT = window.RUT = window.RUT || {};
  const CLIPS = { en: { kickoff: ['audio/en/kickoff.mp3'] } };
  const LINES = { en: {
    kickoff: ["And we're underway!", 'Here we go!'],
    goal: ['GOAL! What a finish!', "He's done it! Unbelievable!", 'Into the top corner, the keeper had no chance!', 'GOAL! The stadium erupts!'],
    save: ['What a save! Brilliant from the keeper!', 'Denied! Superb goalkeeping!', 'Great hands from the keeper!'],
    wide: ['Oh, so close! Just wide!', 'Inches away!', "That's flashed past the post!"],
    post: ['Off the post!', 'Off the woodwork! So unlucky!'],
    bar: ['Off the bar!', 'Crashes off the crossbar!'],
    penalty: ['Penalty! The referee points to the spot!'],
    foul: ['Free kick given.', "That's a foul."],
    corner: ['Corner kick.', 'They win a corner.'],
    offside: ['The flag is up, offside.'],
    blocked: ['Blocked!', 'Great block!'],
    half: ['Half time here, all to play for.'],
    full: ['The referee blows for full time!'],
    et: ["We're going to extra time!"],
    pens: ['It all comes down to penalties!'],
  } };
  const HYPE = { goal: 1, save: 0.7, post: 0.8, bar: 0.8, penalty: 0.8, wide: 0.5, kickoff: 0.5, et: 0.6, pens: 0.7, full: 0.5 };
  const PRI = { goal: 3, penalty: 3, pens: 3, et: 2, full: 2, half: 2, kickoff: 2, save: 2, post: 2, bar: 2, wide: 1, blocked: 1, offside: 1, corner: 0, foul: 0 };
  const on = () => { try { return (JSON.parse(localStorage.getItem('rut_settings') || '{}') || {}).comm !== 'off'; } catch (e) { return true; } };
  const lang = () => (RUT.i18n && RUT.i18n.lang === 'fr' && LINES.fr) ? 'fr' : 'en';
  let voice = null, busyUntil = 0, curPri = -1, audio = null, n = 0;
  function pickVoice() {
    if (!window.speechSynthesis) return null; const L = lang(), vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith(L));
    const score = v => (/natural|neural|online/i.test(v.name) ? 10 : 0) + (/google/i.test(v.name) ? 5 : 0) + (/en-gb/i.test(v.lang) ? 3 : 0) + (/male|daniel|ryan|guy|thomas|george/i.test(v.name) ? 2 : 0) - (/compact|espeak/i.test(v.name) ? 8 : 0);
    return vs.sort((a, b) => score(b) - score(a))[0] || null;
  }
  if (window.speechSynthesis) { try { speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); }; voice = pickVoice(); } catch (e) { /* no voices */ } }
  function say(key) {
    if (!on() || typeof document === 'undefined') return;
    const L = lang(), p = PRI[key] || 0, now = performance.now();
    if (now < busyUntil && p <= curPri) return;                 // never talk over a bigger moment; a bigger one cuts in
    const clips = (CLIPS[L] || {})[key];
    try { if (audio) { audio.pause(); audio = null; } if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    curPri = p; n++;
    if (clips && clips.length) {
      audio = new Audio(clips[n % clips.length]); audio.volume = 1; busyUntil = now + 4000;
      audio.onended = () => { busyUntil = 0; }; audio.play().catch(() => { audio = null; busyUntil = 0; speak(key); });
      return;
    }
    speak(key);
  }
  function speak(key) {
    if (!window.speechSynthesis) return; const list = (LINES[lang()] || LINES.en)[key]; if (!list) return;
    const text = list[Math.floor(Math.random() * list.length)], h = HYPE[key] || 0, u = new SpeechSynthesisUtterance(text);
    if (!voice) voice = pickVoice(); if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = 1 + 0.18 * h; u.pitch = 1 + 0.25 * h; u.volume = 1;
    busyUntil = performance.now() + 1200 + text.length * 70; u.onend = () => { busyUntil = 0; };
    try { speechSynthesis.speak(u); } catch (e) { /* blocked */ }
  }
  /** Ticker text from the engine -> commentary moment. */
  function classify(t) {
    t = String(t || '').toUpperCase();
    if (/^GOAL|^BUT/.test(t)) return 'goal';
    if (/^PENALTIES|TIRS AU BUT/.test(t)) return 'pens';
    if (/^PENALTY/.test(t)) return 'penalty';
    if (/SAVE|SAFE HANDS|PUNCHED|ARR[EÊ]T|PARADE/.test(t)) return 'save';
    if (/OFF THE POST|POTEAU/.test(t)) return 'post';
    if (/OFF THE BAR|BARRE/.test(t)) return 'bar';
    if (/JUST WIDE|C[ÔO]T[ÉE]/.test(t)) return 'wide';
    if (/^BLOCKED|^WALL|CONTR[ÉE]/.test(t)) return 'blocked';
    if (/^EXTRA TIME HALF|^PROLONGATIONS? MI/.test(t)) return null;
    if (/^EXTRA TIME|PROLONGATION/.test(t)) return 'et';
    if (/^HALF TIME|MI-TEMPS/.test(t)) return 'half';
    if (/^FULL TIME|FIN DU MATCH|COUP DE SIFFLET FINAL/.test(t)) return 'full';
    if (/^OFFSIDE|HORS-JEU/.test(t)) return 'offside';
    if (/^CORNER/.test(t) && !/AIM WITH/.test(t)) return 'corner';
    if (/^FOUL BY|^FAUTE/.test(t)) return 'foul';
    return null;
  }
  function hook() {
    const M = RUT.Engine && RUT.Engine.Match; if (!M || M.prototype._commHook) return; const P = M.prototype; P._commHook = true;
    const s0 = P.say; P.say = function (text) { s0.call(this, text); if (!this.headless && !this.training && !this.reel && !this._commMute) { const k = classify(text); if (k) say(k); } };
    const st0 = P.start; P.start = function (cv) { const r = st0.apply(this, arguments); if (!this.headless && !this.training) { const m = this; setTimeout(() => { if (!m.over && !m._commMute) say('kickoff'); }, 600); } return r; };
  }
  hook(); if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', hook);
  RUT.Comm = { say, classify, LINES, CLIPS, hook };
})();
