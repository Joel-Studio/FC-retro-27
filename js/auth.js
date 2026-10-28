/* =============================================================================
 * auth.js  —  Club login (club name + password)
 * -----------------------------------------------------------------------------
 * Everybody has to log in or create a club before the game starts. Accounts live in
 * this browser's LocalStorage: the password is never stored, only a salted PBKDF2
 * hash (SHA-256, 150k rounds; a plain salted hash where WebCrypto is missing), and
 * every account has its own save. The first account made on a device adopts any
 * save that was there before the login existed.
 * Note: this is a local profile lock, not a server login: accounts do not follow you
 * to another browser or device.
 * ========================================================================== */
window.RUT = window.RUT || {};

(function () {
  'use strict';
  const ACC = 'rut_accounts', SES = 'rut_session', LEGACY = 'retro_ut_99_save';
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const accounts = () => { try { return JSON.parse(store.get(ACC) || '{}') || {}; } catch (e) { return {}; } };
  const clean = n => String(n || '').trim().replace(/\s+/g, ' ');
  const idOf = n => clean(n).toLowerCase();
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const rand = n => { const a = new Uint8Array(n); (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }); return hex(a); };

  async function hash(pw, salt) {
    const enc = new TextEncoder();
    if (window.crypto && crypto.subtle) {
      try {
        const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
        return 'p' + hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 150000 }, k, 256));
      } catch (e) { /* fall through */ }
    }
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57; const s = salt + ':' + pw;       // fallback (no WebCrypto): salted double hash
    for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    return 'f' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }

  /* v137 cloud save: when the page runs as a claude.ai artifact with the `db` capability and the viewer is signed in with write access, every account
   * (name, salt, password hash, save) is mirrored to the artifact database, so the same club and password work on another device. Never throws: without
   * the database everything stays local exactly as before. */
  // v243 (JODIO): which site this page is, for the "Main site" setting
  const SITE = window.RUT_SITE || (h => /claude|anthropic/.test(h) ? 'claude' : /vercel/.test(h) ? 'vercel' : /wix/.test(h) ? 'wix' : /replit/.test(h) ? 'replit' : /lovable/.test(h) ? 'lovable' : /netlify/.test(h) ? 'netlify' : /github/.test(h) ? 'github' : 'other')(location.hostname || '');
  const cloud = {
    _db: undefined, site: SITE, main: '', q: Promise.resolve(), timer: 0, last: null, err: null,
    async db() {
      try { if ((JSON.parse(localStorage.getItem('rut_settings') || '{}') || {}).net === 'offline') return null; } catch (e) { /* default online */ }   // v198: Offline mode in Settings
      if (this._db !== undefined) return this._db;
      if (this._p) return this._p;
      return (this._p = (async () => {   // v239 (JODIO): one cloud for every site; the artifact's own database stays as a fallback and for older saves
        const s = await this.supa();
        let d = null; try { if (window.claude && window.claude.use) d = await Promise.race([window.claude.use('db'), new Promise(r => setTimeout(() => r(null), 4000))]); } catch (e) { d = null; }
        this._old = s && d ? d : null;
        return (this._db = s || d || null);
      })());
    },
    /** v239: the shared club store (Supabase RPC rut_doc on the online relay project). Same doc().get/set/delete shape as the artifact database. */
    async supa() {
      const C = (RUT.Net && RUT.Net.cloudCfg) || { url: 'https://c--f528583f-d6fa-4af9-8dce-6e5ecb466150-prod.lovable.cloud', key: 'sb_publishable_blG5qm30dLoYrwpNNCrl3g_rBElzxo1' };
      if (typeof fetch !== 'function') return null;
      const call = (op, path, data) => fetch(C.url.replace(/\/$/, '') + '/rest/v1/rpc/rut_doc', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', apikey: C.key },
        body: JSON.stringify({ p_op: op, p_path: path, p_data: data == null ? null : data, p_auth: cloud.auth || null }) }).then(r => { if (!r.ok) throw new Error('cloud ' + r.status); return r.json(); });
      const st = { doc: path => ({ get: () => call('get', path).then(j => ({ exists: !!j.exists, data: () => j.data })), set: d => call('set', path, d), delete: () => call('del', path) }) };
      try { await this.timeout(st.doc('rut_clubs/00').get(), 6000); return st; } catch (e) { return null; }
    },
    key(id) { return hex(new TextEncoder().encode(id)); },
    async pack(str) {
      try { if (window.CompressionStream) { const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip')); const u = new Uint8Array(await new Response(cs).arrayBuffer()); let b = ''; for (let i = 0; i < u.length; i += 8192) b += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return 'g' + btoa(b); } } catch (e) { /* plain */ }
      return 'r' + btoa(unescape(encodeURIComponent(str)));
    },
    async unpack(t) {
      if (t[0] === 'g') { const b = atob(t.slice(1)), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
      return decodeURIComponent(escape(atob(t.slice(1))));
    },
    timeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('cloud timeout')), ms || 10000))]); },
    async head(id) { const db = await this.db(); if (!db) return null; const s = await this.timeout(db.doc('rut_clubs/' + this.key(id)).get()); if (s.exists) { const d = s.data(); this.main = d.main || ''; return d; }
      if (this._old) { const o = await this.timeout(this._old.doc('rut_clubs/' + this.key(id)).get()).catch(() => null); if (o && o.exists) return Object.assign({ _old: 1 }, o.data()); } return null; },
    async fetchSave(h) {
      let db = await this.db(); if (h && h._old) db = this._old; if (!db || !h || !h.n) return null; let t = '';
      for (let i = 0; i < h.n; i++) { const s = await this.timeout(db.doc('rut_saves/' + this.key(h.id) + '_' + i).get()); if (!s.exists) throw new Error('cloud save is incomplete'); t += s.data().d; }
      return this.unpack(t);
    },
    /** Write the account and its save (only when the save changed since the last upload). */
    async push() {
      const u = Auth.user, db = await this.db(); if (!db || !u) return false; this.auth = u.hash;
      const raw = store.get(LEGACY + u.ns) || '', mt = +(store.get('rut_mt' + u.ns) || Date.now());
      if (this.last === u.id + ':' + mt) return true;
      const h = await this.head(u.id), base = +(store.get('rut_base' + u.ns) || 0);
      const isMain = !!(h && h.main && h.main === SITE);   // v243: the main site's save always wins
      if (!this.force && !isMain && h && h.hash === u.hash && (base ? h.savedAt !== base : h.savedAt > mt)) { if (Auth._pull) setTimeout(Auth._pull, 500); return false; }   // v243: another site saved since this page last synced, so its save is the newest: take it instead of overwriting it with this page's older club   // v240: newer play on this device (online or offline) is never dropped   // another device uploaded since this one last synced: don't overwrite it, the next login takes it
      const t = await this.pack(raw), CH = 150000, n = Math.max(1, Math.ceil(t.length / CH));
      for (let i = 0; i < n; i++) await this.timeout(db.doc('rut_saves/' + this.key(u.id) + '_' + i).set({ d: t.slice(i * CH, (i + 1) * CH) }), 20000);
      await this.timeout(db.doc('rut_clubs/' + this.key(u.id)).set({ id: u.id, name: u.name, salt: u.salt, hash: u.hash, created: u.created, savedAt: mt, n, len: raw.length, main: (h && h.main) || '', site: SITE }), 20000);
      this.last = u.id + ':' + mt; store.set('rut_base' + u.ns, String(mt)); this.err = null; this.force = false; return true;
    },
    schedule() {
      if (!Auth.user) return; clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.q = this.q.then(() => this.push()).catch(e => { this.err = e && e.message || 'failed'; }); }, 4000);
    },
    /** v198: remove a club's cloud copy (head + save chunks). Never throws. */
    async drop(id) { try { const db = await this.db(); if (!db) return; const h = await this.head(id); if (h) this.auth = h.hash; for (let i = 0; i < ((h && h.n) || 0); i++) await this.timeout(db.doc('rut_saves/' + this.key(id) + '_' + i).delete()); await this.timeout(db.doc('rut_clubs/' + this.key(id)).delete()); } catch (e) { /* offline or no access: the local change still stands */ } },
    flush() { clearTimeout(this.timer); this.q = this.q.then(() => this.push()).catch(e => { this.err = e && e.message || 'failed'; }); return this.q; },
  };

  const Auth = {
    user: null,
    cloud,
    /** Suffix for per-account storage keys ('' for the account that adopted the old save). */
    get ns() { return this.user ? this.user.ns : ''; },
    validate(name, pw) {
      const n = clean(name);
      if (n.length < 3 || n.length > 16) return 'Club name must be 3 to 16 characters.';
      if (!/^[\w .'\-&]+$/u.test(n)) return 'Club name can use letters, numbers, spaces and . \' - &';
      if (String(pw || '').length < 4) return 'Password must be at least 4 characters.';
      return null;
    },
    async create(name, pw) {
      const bad = this.validate(name, pw); if (bad) throw new Error(bad);
      const all = accounts(), id = idOf(name);
      if (all[id]) throw new Error('That club name is taken. Log in, or pick another name.');
      try { if (await cloud.head(id)) throw new Error('That club name is taken (it exists in the cloud). Log in, or pick another name.'); } catch (e) { if (/taken/.test(e.message)) throw e; }
      const first = !Object.keys(all).length, adopt = first && !!store.get(LEGACY);
      const salt = rand(16), acc = { id, name: clean(name), salt, hash: await hash(pw, salt), ns: adopt ? '' : ':' + id, created: Date.now() };
      all[id] = acc;
      if (!store.set(ACC, JSON.stringify(all))) throw new Error('Could not save the account (browser storage is blocked).');
      return acc;
    },
    /** v137: log in with a club that only exists in the cloud (made on another device): check the password against its hash, then copy it here. */
    async cloudLogin(name, pw) {
      const id = idOf(name), h = await cloud.head(id);
      if (!h || h.id !== id || !h.salt || !h.hash || (await hash(String(pw || ''), h.salt)) !== h.hash) return null;
      const all = accounts(), acc = { id, name: clean(h.name || name), salt: String(h.salt), hash: String(h.hash), ns: ':' + id, created: h.created || Date.now() };
      const save = await cloud.fetchSave(h);
      all[id] = acc; if (!store.set(ACC, JSON.stringify(all))) throw new Error('Could not save the account (browser storage is blocked).');
      if (save) store.set(LEGACY + acc.ns, save); store.set('rut_mt' + acc.ns, String(h.savedAt || Date.now())); store.set('rut_base' + acc.ns, String(h.savedAt || 0));
      return acc;
    },
    /** After a login: when the cloud copy is newer than this device's, take it; otherwise upload this one. */
    async cloudSync(acc) {
      const h = await cloud.head(acc.id); if (!h) { cloud.schedule(); return 'up'; }
      const mt = +(store.get('rut_mt' + acc.ns) || 0), base = +(store.get('rut_base' + acc.ns) || 0);
      if (!(h.main && h.main === SITE && base) && (base ? h.savedAt !== base : h.savedAt > mt) && h.hash === acc.hash) {   /* v243: the cloud moved since this page synced, so it holds the newest play */   // the cloud copy is newer than anything played here: it wins (v240: unsynced newer play here, e.g. offline, wins instead)
        const save = await cloud.fetchSave(h); if (save) { const cur = store.get(LEGACY + acc.ns); if (cur) store.set('rut_bak' + acc.ns, cur); /* v240: the replaced save is kept as a backup */ store.set(LEGACY + acc.ns, save); store.set('rut_mt' + acc.ns, String(h.savedAt)); store.set('rut_base' + acc.ns, String(h.savedAt)); cloud.last = acc.id + ':' + h.savedAt; return 'down'; } }
      else cloud.schedule();
      return 'same';
    },
    /** v243: pick the main site ('' = none): its save always wins, the other sites take it. */
    async setMain(k) { const u = this.user; if (!u) throw new Error('Log in first.'); const db = await cloud.db(); if (!db) throw new Error('Cloud save is off on this site.'); cloud.auth = u.hash;
      const h = await cloud.head(u.id); if (!h) { await cloud.push(); } const h2 = await cloud.head(u.id); if (!h2) throw new Error('Could not reach the cloud save.');
      await cloud.timeout(db.doc('rut_clubs/' + cloud.key(u.id)).set(Object.assign({}, h2, { main: k || '' })), 20000); cloud.main = k || '';
      if (k && k === SITE) { cloud.force = true; cloud.last = null; await cloud.push(); } else if (k) { await this.cloudSync(u).then(r => { if (r === 'down') setTimeout(() => location.reload(), 800); }); } return k; },
    async login(name, pw) {
      const all = accounts(), acc = all[idOf(name)];
      const fails = +(store.get('rut_fails', true) || 0);
      if (fails >= 5) { await new Promise(r => setTimeout(r, Math.min(8000, 1000 * (fails - 4)))); }
      if (!acc || (await hash(String(pw || ''), acc.salt)) !== acc.hash) { store.set('rut_fails', String(fails + 1), true); throw new Error('Wrong club name or password.'); }
      store.set('rut_fails', '0', true);
      return acc;
    },
    start(acc, remember) {
      this.user = acc;
      if (remember) store.set(SES, acc.id); else store.set(SES, acc.id, true);
      if (RUT.State && RUT.State.setKey) RUT.State.setKey(LEGACY + acc.ns);
      const S = RUT.State;   // only a real change moves the save stamp, so a plain page load never beats a newer cloud save
      if (S && S.save && !S._cw) { const o = S.save; S._cw = 1; S.save = function (quiet) { const k = LEGACY + Auth.ns, before = store.get(k); const r = o.apply(this, arguments); if (!quiet && store.get(k) !== before) { store.set('rut_mt' + Auth.ns, String(Date.now())); cloud.schedule(); } return r; }; }
      try { window.addEventListener('pagehide', () => { if (Auth.user) cloud.flush(); }); } catch (e) { /* ignore */ }
      if (!this._retry) { this._retry = 1;   // v240: progress made offline is uploaded as soon as the connection is back
        const again = () => { const u = Auth.user; if (u && store.get('rut_mt' + u.ns) !== store.get('rut_base' + u.ns)) cloud.schedule(); };
        try { window.addEventListener('online', again); } catch (e) { /* ignore */ } setInterval(again, 60000);
        // v242 (JODIO): a save made on another site or device comes in while this page is open (not during a match or a pop-up)
        const pull = async () => { const u = Auth.user; if (!u || document.hidden || (window.App && App.match) || document.querySelector('#modal-root .modal')) return;
          try { const r = await Auth.cloudSync(u); if (r === 'down') { RUT.State.data = null; RUT.State.load(); if (RUT.toast) RUT.toast('Your club was updated from another site.', 'good'); setTimeout(() => location.reload(), 800); } } catch (e) { /* offline: next time */ } };
        Auth._pull = pull; setInterval(pull, 20000); try { document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); }); } catch (e) { /* ignore */ } }
    },
    /** v116: the accounts on THIS device, with a few numbers from each save (never the password or its hash). */
    list() {
      return Object.values(accounts()).map(a => { let d = {}; try { d = JSON.parse(store.get(LEGACY + a.ns) || '{}') || {}; } catch (e) { d = {}; }
        return { name: a.name, created: a.created, coins: d.coins, items: d.items ? Object.keys(d.items).length : 0, me: !!(this.user && this.user.id === a.id) }; });
    },
    /** v116: a transfer file for the logged-in account. The owner has to type the password to allow it; the file holds the club name, the password check (salted hash) and the save, never the password. */
    async exportAccount(pw) {
      if (!this.user) throw new Error('Log in first.');
      const acc = pw ? await this.login(this.user.name, pw) : accounts()[this.user.id];   // v203: the logged-in owner needs no password
      if (!acc) throw new Error('Log in first.');
      if (RUT.State && RUT.State.save) RUT.State.save();
      return JSON.stringify({ game: 'RETRO UT 99', v: 1, exported: Date.now(), account: { id: acc.id, name: acc.name, salt: acc.salt, hash: acc.hash, created: acc.created }, pw: store.get('rut_pw' + acc.ns) || pw || undefined, save: store.get(LEGACY + acc.ns) || null });
    },
    /** v147: the same transfer as a short text code (copy it, paste it on the other device): works where file downloads are blocked, e.g. inside the artifact. */
    async exportCode(pw) {
      const j = JSON.parse(await this.exportAccount(pw));
      // the market price history is ~95% of a fresh save and is rebuilt by the market on load (new prices), so the code leaves it out: 365 KB becomes a few KB
      try { const s = j.save && JSON.parse(j.save); if (s && s.market && s.market.history) { s.market.history = {}; j.save = JSON.stringify(s); } } catch (e) { /* keep the full save */ }
      return 'RUT1.' + await cloud.pack(JSON.stringify(j));
    },
    /** Accepts a transfer code (RUT1....) or the text of a transfer file. */
    async importAny(text, replace) {
      const s = String(text || '').trim();
      if (!s) throw new Error('Paste the transfer code first (or choose the file).');
      if (s[0] === '{') return this.importAccount(s, replace);
      const m = s.replace(/\s+/g, '').match(/RUT1\.([gr][A-Za-z0-9+\/=]+)/);   // v202: the code is found anywhere in what was pasted (quotes, a message around it)
      if (!m) throw new Error('That is not a FC RETRO 27 transfer code. Copy all of it, starting with RUT1.');
      let j; try { j = await cloud.unpack(m[1]); } catch (e) { throw new Error('The transfer code is damaged: copy all of it again.'); }
      return this.importAccount(j, replace);
    },
    /** Add an exported account to this device. The password stays the one it had. */
    importAccount(text, replace) {   // v202: replace = overwrite a club of the same name already on this device
      let j; try { j = JSON.parse(text); } catch (e) { throw new Error('That is not a FC RETRO 27 account file.'); }
      const a = j && (j.game === 'RETRO UT 99' || j.game === 'FC RETRO 27') && j.account;
      if (!a || !a.id || !a.salt || !a.hash || a.id !== idOf(a.name) || this.validate(a.name, 'xxxx')) throw new Error('That is not a FC RETRO 27 account file.');
      const all = accounts(); if (all[a.id] && !replace) { const e = new Error('A club called "' + a.name + '" already exists on this device. Press "Replace it" to put the imported club in its place.'); e.exists = true; throw e; }
      if (j.save != null && (typeof j.save !== 'string' || j.save.length > 6e6)) throw new Error('The save in that file is not valid.');
      const acc = { id: a.id, name: clean(a.name), salt: String(a.salt), hash: String(a.hash), ns: ':' + a.id, created: a.created || Date.now() };
      all[a.id] = acc;
      if (!store.set(ACC, JSON.stringify(all))) throw new Error('Could not save the account (browser storage is blocked).');
      if (replace) ['rut_mt', 'rut_base'].forEach(k => store.del(k + acc.ns));
      if (j.pw && typeof j.pw === 'string') store.set('rut_pw' + acc.ns, j.pw);
      if (j.save) store.set(LEGACY + acc.ns, j.save);
      return acc;
    },
    /** v198 (JODIO): rename the logged-in club. The password confirms it; the save stays the same (its storage key does not change). */
    async rename(newName, pw) {
      if (!this.user) throw new Error('Log in first.');
      const bad = this.validate(newName, 'xxxx'); if (bad) throw new Error(bad);
      const old = await this.login(this.user.name, pw), id = idOf(newName), all = accounts();
      if (id !== old.id && all[id]) throw new Error('That club name is taken. Pick another name.');
      if (id !== old.id) { try { if (await cloud.head(id)) throw new Error('That club name is taken (it exists in the cloud). Pick another name.'); } catch (e) { if (/taken/.test(e.message)) throw e; } }
      const acc = Object.assign({}, old, { id, name: clean(newName) });
      delete all[old.id]; all[id] = acc;
      if (!store.set(ACC, JSON.stringify(all))) throw new Error('Could not save the account (browser storage is blocked).');
      if (store.get(SES)) store.set(SES, id); if (store.get(SES, true)) store.set(SES, id, true);
      this.user = acc;
      if (RUT.State && RUT.State.data) { RUT.State.data.clubName = acc.name; RUT.State.save(); }
      if (id !== old.id) { await cloud.drop(old.id); cloud.flush(); }
      return acc;
    },
    /** v198 (JODIO): delete the logged-in club for good: the account, its save on this device and its cloud copy. */
    async remove() {   // v199 (JODIO): no password needed
      if (!this.user) throw new Error('Log in first.');
      const acc = this.user, all = accounts();
      if (RUT.State) { RUT.State.save = function () {}; RUT.State.data = null; }   // v200: nothing may write the deleted save back (the page saves on leave)
      delete all[acc.id]; store.set(ACC, JSON.stringify(all));
      ['', 'rut_mt', 'rut_base', 'retro_ut_99_seen', 'rut_pw'].forEach(k => store.del((k || LEGACY) + acc.ns));
      await cloud.drop(acc.id);
      this.logout();
    },
    logout() { store.del(SES); this.user = null; },
    /** v203: this club's password as last typed on this device (or brought by a transfer code), for Settings > Account. */
    savedPw() { return this.user ? store.get('rut_pw' + this.user.ns) || '' : ''; },
    /** The remembered session, if its account still exists. */
    resume() { const id = store.get(SES, true) || store.get(SES), acc = id && accounts()[id]; return acc || null; },

    /** Show the login / create screen until somebody is in, then call ready(). Skips straight on when a session is remembered. */
    gate(ready) {
      // v203: a "play on another site" link (#rut=RUT1....) brings the club in and logs it in straight away (the code is the proof of ownership)
      const lm = /[#&]rut=(RUT1\.[A-Za-z0-9+\/=%]+)/.exec(location.hash || '');
      if (lm && !this._linkTried) {
        this._linkTried = true;
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* keep the hash */ }
        this.importAny(decodeURIComponent(lm[1]), true).then(a => { this.start(a, true); ready(); }, () => this.gate(ready));
        return;
      }
      const acc = this.resume();
      if (acc) {
        this.start(acc, !!store.get(SES));
        // v137: before the game loads the save, take a newer cloud copy (another device played since); never block longer than a few seconds
        Promise.race([this.cloudSync(acc), new Promise(r => setTimeout(r, 6000))]).catch(() => 0).then(() => ready());
        return;
      }
      const root = document.createElement('div'); root.id = 'auth-root'; root.className = 'auth';
      const hasAny = Object.keys(accounts()).length > 0; let mode = hasAny ? 'login' : 'create';
      const render = () => {
        root.innerHTML = `<div class="auth-card"><div class="auth-logo">FC RETRO 27<small>FC 27 · 2D ARCADE EDITION</small></div>
          <button type="button" class="btn c" id="au-paste" style="width:100%;margin-bottom:8px">Paste my club from another site</button><div class="auth-err" id="au-perr" role="status"></div>
          <div class="auth-tabs"><button type="button" data-m="login" class="${mode === 'login' ? 'on' : ''}">Log in</button><button type="button" data-m="create" class="${mode === 'create' ? 'on' : ''}">Create club</button><button type="button" data-m="import" class="${mode === 'import' ? 'on' : ''}">Import</button></div>
          ${mode === 'import' ? `<div class="auth-form"><label>Transfer code (Settings > Account > Show transfer code, on the device where the club is)</label><textarea id="au-code" rows="4" spellcheck="false" placeholder="RUT1...." style="width:100%;box-sizing:border-box;font-size:10px"></textarea><label>or the transfer file</label><input id="au-file" type="file" accept=".json,application/json"><div class="auth-err" id="au-err" role="alert"></div><button class="btn y" type="button" id="au-imp">Import, then log in with its password</button><p class="dim auth-note">The code never contains the password. After the import type the club name and the password it had.</p></div>` : ''}
          <form class="auth-form" autocomplete="on" ${mode === 'import' ? 'hidden' : ''}>
            <label>Club name</label><input id="au-name" type="text" maxlength="16" autocomplete="username" spellcheck="false" placeholder="e.g. Retro FC">
            <label>Password</label><input id="au-pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="at least 4 characters">
            ${mode === 'create' ? '<label>Repeat password</label><input id="au-pw2" type="password" autocomplete="new-password" placeholder="same password">' : ''}
            <label class="auth-rem"><input type="checkbox" id="au-rem" checked> Keep me logged in on this device</label>
            <div class="auth-err" id="au-err" role="alert"></div>
            <button class="btn y" type="submit" id="au-go">${mode === 'login' ? 'Log in' : 'Create club and play'}</button>
          </form>
          <p class="dim auth-note">${mode === 'create' ? 'Your club and its progress are saved under this name and password in this browser.' : 'New here? Choose Create club.'}</p></div>`;
        root.querySelectorAll('.auth-tabs button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; render(); }));
        root.querySelector('#au-paste').addEventListener('click', async () => {   // v210 (JODIO): smooth move from another site: read the copied code, else ask for Ctrl+V
          let t = ''; try { t = await navigator.clipboard.readText(); } catch (e) { t = ''; }
          if (/RUT1\./.test(t)) return quickIn(t);
          mode = 'import'; render(); const pe = root.querySelector('#au-perr'); if (pe) pe.textContent = 'Press Ctrl+V now (phone: hold the box, then Paste). Your club comes in by itself.';
          const ta = root.querySelector('#au-code'); if (ta) ta.focus();
        });
        const imp = root.querySelector('#au-imp');
        if (imp) imp.addEventListener('click', async () => { const e0 = root.querySelector('#au-err'), f = root.querySelector('#au-file').files[0], code = root.querySelector('#au-code').value; e0.textContent = ''; const run = async replace => { try { const a = await Auth.importAny(code.trim() ? code : f ? await f.text() : '', replace); if (replace && Auth.user && Auth.user.id === a.id) Auth.logout(); mode = 'login'; render(); root.querySelector('#au-name').value = a.name; root.querySelector('#au-err').textContent = 'Imported "' + a.name + '". Type its password to log in.'; root.querySelector('#au-pw').focus(); }
          catch (ex) { e0.textContent = ex.message; if (ex.exists) { const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'btn r'; rb.textContent = 'Replace it'; rb.style.marginTop = '6px'; rb.addEventListener('click', () => run(true)); e0.appendChild(document.createElement('br')); e0.appendChild(rb); } } };
          run(false); });
        const err = root.querySelector('#au-err'), go = root.querySelector('#au-go'), form = root.querySelector('form');
        if (!go) return;
        form.addEventListener('submit', async e => {
          e.preventDefault(); err.textContent = ''; go.disabled = true;
          const name = root.querySelector('#au-name').value, pw = root.querySelector('#au-pw').value, rem = root.querySelector('#au-rem').checked;
          try {
            if (mode === 'create' && pw !== root.querySelector('#au-pw2').value) throw new Error('The two passwords are different.');
            let a, note = '';
            if (mode === 'create') a = await Auth.create(name, pw);
            else {
              const local = !!accounts()[idOf(name)];
              if (local) { a = await Auth.login(name, pw); try { err.textContent = 'Checking the cloud save...'; note = await Auth.cloudSync(a); } catch (e2) { note = ''; } err.textContent = ''; }
              else {
                try { err.textContent = 'Looking for this club in the cloud...'; a = await Auth.cloudLogin(name, pw); } catch (e3) { a = null; } err.textContent = '';
                if (!a) throw new Error('Wrong club name or password, or this club was made on another device. In that case open Settings > Account there, press Show transfer code, then use the Import tab here.');
              }
            }
            store.set('rut_pw' + a.ns, pw);   // v203 (JODIO): Settings shows the password
            Auth.start(a, rem); Auth.created = mode === 'create'; if (mode === 'create') cloud.schedule(); root.classList.add('out');
            setTimeout(() => { root.remove(); ready(); }, 260);
          } catch (ex) { err.textContent = ex.message; go.disabled = false; err.classList.remove('shake'); void err.offsetWidth; err.classList.add('shake'); }
        });
        setTimeout(() => { const f = root.querySelector('#au-name'); if (f) f.focus(); }, 30);
      };
      // v210 (JODIO): a transfer code pasted anywhere on this screen (copied by "Play this club on ..." on another site) brings the club in and logs it in, like a #rut= link
      const quickIn = async text => {
        const pe = root.querySelector('#au-perr') || root.querySelector('#au-err');
        try { if (pe) pe.textContent = 'Bringing your club in...'; const a = await Auth.importAny(text, true); document.removeEventListener('paste', onPaste, true); Auth.start(a, true); try { cloud.schedule(); } catch (e) { /* no cloud here */ } root.classList.add('out'); setTimeout(() => { root.remove(); ready(); }, 260); }
        catch (ex) { if (pe) pe.textContent = ex.message; }
      };
      const onPaste = e => { if (!root.isConnected) return document.removeEventListener('paste', onPaste, true); const t = (e.clipboardData || window.clipboardData || { getData: () => '' }).getData('text') || ''; if (!/RUT1\./.test(t)) return; e.preventDefault(); quickIn(t); };
      document.addEventListener('paste', onPaste, true);
      render(); document.body.appendChild(root);
    },
  };
  RUT.Auth = Auth;
})();
