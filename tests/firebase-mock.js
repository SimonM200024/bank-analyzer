// In-memory stand-in for the Firebase compat SDK (app/auth/database) used in tests.
(function () {
  const clone = v => v === undefined ? null : JSON.parse(JSON.stringify(v));
  const state = window.__fbState = { tree: {}, listeners: [], writes: 0 };
  const seed = window.__FB_SEED__ || {};
  state.tree = clone(seed);
  function prune(v) {
    if (v === null || typeof v !== 'object') return v;
    const out = Array.isArray(v) ? [] : {};
    for (const k of Object.keys(v)) { const p = prune(v[k]); if (p !== null && p !== undefined && !(typeof p === 'object' && !Array.isArray(p) && !Object.keys(p).length)) out[k] = p; }
    return out;
  }
  const parts = p => String(p).split('/').filter(Boolean);
  function getAt(path) { let n = state.tree; for (const k of parts(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : clone(n); }
  function setAt(path, val) {
    const ks = parts(path);
    if (!ks.length) { state.tree = prune(clone(val)) || {}; return; }
    let n = state.tree;
    for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
    const last = ks[ks.length - 1];
    const v = prune(clone(val));
    if (v === null || v === undefined || (typeof v === 'object' && !Object.keys(v).length)) delete n[last]; else n[last] = v;
    state.tree = prune(state.tree) || {};
  }
  function fire() {
    state.writes++;
    state.listeners.forEach(l => { const v = getAt(l.path); const s = JSON.stringify(v); if (s !== l.last) { l.last = s; l.cb(snap(v)); } });
  }
  const snap = v => ({ val: () => clone(v), exists: () => v !== null && v !== undefined });
  function ref(path = '') {
    return {
      once: async () => snap(getAt(path)),
      set: async v => { if (window.__FB_FAIL__) throw new Error('permission_denied'); setAt(path, v); fire(); },
      update: async obj => { if (window.__FB_FAIL__) throw new Error('permission_denied'); for (const [k, v] of Object.entries(obj)) setAt(path + '/' + k, v); fire(); },
      remove: async () => { setAt(path, null); fire(); },
      on: (ev, cb) => { const l = { path, cb, last: JSON.stringify(getAt(path)) }; state.listeners.push(l); setTimeout(() => cb(snap(getAt(path))), 0); return cb; },
      off: () => { state.listeners = state.listeners.filter(l => l.path !== path); }
    };
  }
  const user = { uid: 'u1', email: 'tester@example.com', displayName: 'Test User', updateProfile: async () => {} };
  let authCbs = [], current = user;
  window.firebase = {
    initializeApp: () => ({}),
    auth: () => ({
      get currentUser() { return current; },
      onAuthStateChanged: cb => { authCbs.push(cb); setTimeout(() => cb(current), 10); },
      signInWithEmailAndPassword: async () => { current = user; authCbs.forEach(cb => cb(current)); },
      createUserWithEmailAndPassword: async () => ({ user }),
      signOut: async () => { current = null; authCbs.forEach(cb => cb(null)); }
    }),
    database: () => ({ ref })
  };
})();
