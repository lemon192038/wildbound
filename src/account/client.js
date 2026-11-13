// Client side of the account/economy API (server/api.js). The server is authoritative: this module only
// sends requests and mirrors the state the server returns. Only the session token lives in localStorage.
//   const acct = createAccount(game)
//   await acct.restore()                 → state | null (valid stored session?)
//   await acct.register(name, pw) / acct.login(name, pw) / acct.logout()
//   await acct.act(type, payload)        → { ok, result, message }  (state auto-updated)
//   acct.state                           → last server state (see publicState in server/economy.js)
// Events on game.events: 'account:state' {state}, 'account:login' {state}, 'account:logout', 'account:error' {message}
const TOKEN_KEY = 'wildbound.token';

export function apiBase() {
  const env = import.meta.env || {};
  if (env.VITE_API_URL) return String(env.VITE_API_URL).replace(/\/+$/, '');
  if (env.VITE_SERVER_URL) return String(env.VITE_SERVER_URL).replace(/^ws/, 'http').replace(/\/+$/, '');
  return ''; // same origin (served by server/server.js)
}

export function createAccount(game) {
  const base = apiBase();
  const ls = { get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }, set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } } };
  let token = ls.get(); let busy = Promise.resolve();
  const emit = (t, p) => { try { game.events.emit(t, p); } catch (e) { console.warn(e); } };

  async function request(path, body, { retries = 2 } = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(base + path, {
          method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
          body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
        });
        let j = null; try { j = await r.json(); } catch { j = { ok: false, error: 'bad_response', message: `Server error (${r.status})` }; }
        if ((r.status === 409 || r.status === 503) && attempt < retries) { await sleep(300 * (attempt + 1)); continue; }
        if (r.status === 401 && path !== '/api/login' && path !== '/api/register') { token = null; ls.set(null); acct.state = null; emit('account:logout', { expired: true }); }
        return j;
      } catch (e) {
        if (attempt < retries) { await sleep(600 * (attempt + 1)); continue; }
        return { ok: false, error: 'network', message: 'Cannot reach the server. Check your connection and try again.' };
      }
    }
  }
  const setState = (s) => { if (s) { acct.state = s; emit('account:state', { state: s }); } };

  const acct = {
    state: null,
    get loggedIn() { return !!token && !!acct.state; },
    base,
    async restore() { if (!token) return null; const r = await request('/api/state'); if (r?.ok) { setState(r.state); emit('account:login', { state: r.state }); return r.state; } return null; },
    async register(name, password) { return auth('/api/register', name, password); },
    async login(name, password) { return auth('/api/login', name, password); },
    async logout() { if (token) await request('/api/logout', {}).catch(() => {}); token = null; ls.set(null); acct.state = null; emit('account:logout', {}); },
    async refresh() { const r = await request('/api/state'); if (r?.ok) setState(r.state); return r; },
    // Serialised: one action in flight at a time, so double-taps cannot double-spend client-side either.
    act(type, payload = {}) {
      const run = async () => {
        const r = await request('/api/action', { type, ...payload });
        if (r?.state) setState(r.state);
        if (!r?.ok) emit('account:error', { message: r?.message || 'Request failed', error: r?.error });
        return { ok: !!r?.ok, result: r?.result, message: r?.message || r?.result?.msg, error: r?.error };
      };
      busy = busy.then(run, run); return busy;
    },
    async probe() { try { const r = await fetch(base + '/healthz', { cache: 'no-store' }); return r.ok; } catch { return false; } },
  };
  async function auth(path, name, password) {
    const r = await request(path, { name, password }, { retries: 1 });
    if (r?.ok) { token = r.token; ls.set(token); setState(r.state); emit('account:login', { state: r.state }); }
    return r;
  }
  // play-time accounting while the page is open
  setInterval(() => { if (acct.loggedIn && document.visibilityState === 'visible') acct.act('ping'); }, 60000);
  return acct;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
