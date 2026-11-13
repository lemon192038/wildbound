// HTTP JSON API: accounts, sessions and the authoritative economy.
//   POST /api/register {name, password}      → {token, state}
//   POST /api/login    {name, password}      → {token, state}
//   POST /api/logout                          (Bearer token)
//   GET  /api/state                           → {state}
//   POST /api/action   {type, ...payload}     → {ok, result, state} | {ok:false, error, message}
// Auth: `Authorization: Bearer <token>`. Tokens are 256-bit random; only their SHA-256 is stored.
// Passwords: scrypt (N=16384, r=8, p=1, 16-byte salt), compared in constant time; never stored in plain text.
// Players can only ever touch their own save: the user id comes from the session, never from the request.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ACTIONS, GameError, newSave, publicState, expireStale } from './economy.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const MAX_BODY = 16 * 1024;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rand = () => crypto.randomInt(0, 2 ** 30) / 2 ** 30;

export async function hashPassword(pw) { const salt = crypto.randomBytes(16); const h = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); return `scrypt$16384$${salt.toString('base64')}$${h.toString('base64')}`; }
export async function verifyPassword(pw, stored) {
  const [alg, N, salt, hash] = String(stored).split('$'); if (alg !== 'scrypt') return false;
  const h = await scrypt(pw, Buffer.from(salt, 'base64'), 64, { N: +N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); const ref = Buffer.from(hash, 'base64');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}
const NAME_RE = /^[\p{L}\p{N}_\- ]{3,16}$/u;
const nameKey = (n) => n.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function createApi(store, { allowedOrigins = [], log = console.log, now = () => Date.now() } = {}) {
  // token buckets: auth attempts per IP, actions per user
  const buckets = new Map();
  const allow = (key, rate, burst) => {
    const t = now(); let b = buckets.get(key); if (!b) { b = { tok: burst, t }; buckets.set(key, b); }
    b.tok = Math.min(burst, b.tok + ((t - b.t) / 1000) * rate); b.t = t; if (b.tok < 1) return false; b.tok -= 1; return true;
  };
  setInterval(() => { const t = now(); for (const [k, b] of buckets) if (t - b.t > 600000) buckets.delete(k); store.purgeSessions(t).catch(() => {}); }, 300000).unref?.();

  const send = (res, code, obj, extra = {}) => { const body = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(body); };
  const err = (res, code, error, message, extra) => send(res, code, { ok: false, error, message: message || error }, extra);

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too_big'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { if (!chunks.length) return resolve({}); try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {}); } catch { reject(Object.assign(new Error('bad_json'), { status: 400 })); } });
      req.on('error', reject);
    });
  }
  async function auth(req) {
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || ''); if (!m) return null;
    const th = sha(m[1]); const t = now(); const s = await store.getSession(th, t); if (!s) return null;
    if (Number(s.expires_at) - t < SESSION_TTL - 24 * 3600 * 1000) await store.touchSession(th, t + SESSION_TTL); // sliding expiry (≤1 write/day)
    const user = await store.getUser(s.user_id); return user ? { user, tokenHash: th } : null;
  }
  async function issue(userId) { const token = crypto.randomBytes(32).toString('base64url'); await store.createSession(sha(token), userId, now(), SESSION_TTL); return token; }
  async function stateFor(user) {
    let s = await store.getSave(user.id);
    if (s && s.data.quests?.expedition && expireStale(structuredClone(s.data), now())) s = { data: (await store.mutateSave(user.id, (d) => { expireStale(d, now()); })).doc };
    return publicState(s.data, user, now());
  }

  function cors(req, res) {
    const o = req.headers.origin; if (!o) return true;
    let same = false; try { same = new URL(o).host === req.headers.host; } catch { /* */ }
    if (same || allowedOrigins.includes(o)) {
      res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
      return true;
    }
    return false;
  }

  async function handle(req, res, pathname) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (!cors(req, res)) return err(res, 403, 'origin', 'Origin not allowed');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      if (pathname === '/api/register' || pathname === '/api/login') {
        if (req.method !== 'POST') return err(res, 405, 'method');
        if (!allow('auth:' + ip, 0.2, 8)) return err(res, 429, 'rate', 'Too many attempts — wait a minute');
        const { name, password } = await readBody(req);
        if (typeof name !== 'string' || typeof password !== 'string') return err(res, 400, 'bad_input', 'Name and password required');
        const nm = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
        if (pathname === '/api/register') {
          if (!NAME_RE.test(nm)) return err(res, 400, 'bad_name', 'Name: 3–16 letters, numbers, spaces, _ or -');
          if (password.length < 8 || password.length > 72) return err(res, 400, 'bad_password', 'Password: 8–72 characters');
          const id = 'u_' + crypto.randomBytes(12).toString('base64url'); const t = now();
          const u = await store.createUser({ id, name: nm, nameKey: nameKey(nm), pass: await hashPassword(password), now: t, save: newSave(nm, t) });
          if (!u) return err(res, 409, 'taken', 'That name is already taken');
          log(`[wildbound] account created ${id} (${nm})`);
          return send(res, 200, { ok: true, token: await issue(id), state: await stateFor({ id, name: nm }) });
        }
        const row = await store.getUserByNameKey(nameKey(nm));
        const okPw = row ? await verifyPassword(password, row.pass) : (await hashPassword(password), false); // equalise timing for unknown names
        if (!okPw) return err(res, 401, 'auth', 'Wrong name or password');
        return send(res, 200, { ok: true, token: await issue(row.id), state: await stateFor(row) });
      }
      const a = await auth(req); if (!a) return err(res, 401, 'session', 'Please log in');
      if (!allow('act:' + a.user.id, 20, 40)) return err(res, 429, 'rate', 'Slow down');
      if (pathname === '/api/logout' && req.method === 'POST') { await store.deleteSession(a.tokenHash); return send(res, 200, { ok: true }); }
      if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, { ok: true, state: await stateFor(a.user) });
      if (pathname === '/api/action' && req.method === 'POST') {
        const body = await readBody(req); const type = body.type;
        if (type === 'ackNotices') { await store.mutateSave(a.user.id, (d) => { d.notices = []; }); return send(res, 200, { ok: true, state: await stateFor(a.user) }); }
        if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, type)) return err(res, 400, 'bad_action', 'Unknown action');
        const t = now();
        try {
          const { doc, result } = await store.mutateSave(a.user.id, (d) => { expireStale(d, t); return ACTIONS[type](d, body, { now: t, rand }); });
          return send(res, 200, { ok: true, result, state: publicState(doc, a.user, t) });
        } catch (e) {
          if (e instanceof GameError) return send(res, 200, { ok: false, error: e.code, message: e.message, state: await stateFor(a.user) });
          throw e;
        }
      }
      return err(res, 404, 'not_found');
    } catch (e) {
      if (e.status) return err(res, e.status, e.message);
      if (e.code === 'conflict') return err(res, 409, 'conflict', 'Please retry');
      log('[wildbound] api error', e); return err(res, 500, 'server', 'Server error');
    }
  }
  return { handle, auth, store };
}
