// Persistence layer. Tables: users, sessions, saves (one JSON save document per user + version).
//  • Default: SQLite via Node's built-in `node:sqlite` (file at $DB_PATH, default ./data/wildbound.db).
//  • DATABASE_URL set (postgres://…): PostgreSQL via the optional `pg` package (needed on hosts whose disk
//    is ephemeral, e.g. Render's free tier — attach a Postgres instance and set DATABASE_URL).
// All mutation of a player's save goes through `mutateSave(userId, fn)`: a per-user async mutex in this
// process + an optimistic version check in SQL, so concurrent requests can never interleave or lose writes.
import fs from 'node:fs';
import path from 'node:path';

export async function openStore({ url = process.env.DATABASE_URL, file = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'wildbound.db'), log = console.log, pgModule = null } = {}) {
  const db = pgModule || (url && /^postgres(ql)?:/.test(url)) ? await openPg(url, pgModule) : await openSqlite(file);
  log(`[wildbound] store: ${db.kind}${db.kind === 'sqlite' ? ' ' + (file === ':memory:' ? ':memory:' : file) : ''}`);
  await db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, created_at BIGINT NOT NULL)`);
  await db.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)`);
  await db.exec(`CREATE TABLE IF NOT EXISTS saves (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at BIGINT NOT NULL)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`);

  const locks = new Map(); // userId → tail promise
  const withLock = (key, fn) => {
    const prev = locks.get(key) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {}); locks.set(key, tail);
    tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    return run;
  };

  const api = {
    kind: db.kind,
    async createUser({ id, name, nameKey, pass, now, save }) {
      return withLock('user:' + nameKey, async () => {
        const exists = await db.get('SELECT id FROM users WHERE name_key = ?', [nameKey]);
        if (exists) return null;
        await db.tx(async (t) => {
          await t.run('INSERT INTO users (id, name, name_key, pass, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, nameKey, pass, now]);
          await t.run('INSERT INTO saves (user_id, version, data, updated_at) VALUES (?, ?, ?, ?)', [id, 1, JSON.stringify(save), now]);
        });
        return { id, name };
      });
    },
    getUserByNameKey: (k) => db.get('SELECT id, name, pass, created_at FROM users WHERE name_key = ?', [k]),
    getUser: (id) => db.get('SELECT id, name, created_at FROM users WHERE id = ?', [id]),
    async createSession(tokenHash, userId, now, ttlMs) { await db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [tokenHash, userId, now, now + ttlMs]); },
    async getSession(tokenHash, now) { const s = await db.get('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?', [tokenHash]); if (!s || Number(s.expires_at) < now) return null; return s; },
    touchSession: (tokenHash, expiresAt) => db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [expiresAt, tokenHash]),
    deleteSession: (tokenHash) => db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]),
    purgeSessions: (now) => db.run('DELETE FROM sessions WHERE expires_at < ?', [now]),
    async getSave(userId) { const r = await db.get('SELECT version, data FROM saves WHERE user_id = ?', [userId]); return r ? { version: Number(r.version), data: JSON.parse(r.data) } : null; },
    // fn(doc) mutates the doc in place and returns a result; throwing aborts without writing.
    mutateSave(userId, fn) {
      return withLock('save:' + userId, async () => {
        const cur = await api.getSave(userId); if (!cur) throw Object.assign(new Error('no_save'), { code: 'no_save' });
        const doc = structuredClone(cur.data);
        const result = await fn(doc);
        const changed = await db.run('UPDATE saves SET version = ?, data = ?, updated_at = ? WHERE user_id = ? AND version = ?', [cur.version + 1, JSON.stringify(doc), Date.now(), userId, cur.version]);
        if (!changed) throw Object.assign(new Error('conflict'), { code: 'conflict' });
        return { doc, result, version: cur.version + 1 };
      });
    },
    close: () => db.close(),
  };
  return api;
}

async function openSqlite(file) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  const stmts = new Map(); const st = (sql) => stmts.get(sql) || stmts.set(sql, d.prepare(sql)).get(sql);
  const self = {
    kind: 'sqlite',
    exec: async (sql) => d.exec(sql),
    get: async (sql, p = []) => st(sql).get(...p) || null,
    run: async (sql, p = []) => st(sql).run(...p).changes,
    async tx(fn) { d.exec('BEGIN IMMEDIATE'); try { const r = await fn(self); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
    close: async () => d.close(),
  };
  return self;
}

async function openPg(url, pgModule) {
  let pg = pgModule; if (!pg) try { pg = (await import('pg')).default; } catch { throw new Error('DATABASE_URL is set but the "pg" package is not installed (npm i pg)'); }
  const pool = new pg.Pool(pgModule ? {} : { connectionString: url, max: 8, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  const conv = (sql) => { let i = 0; return sql.replace(/\?/g, () => '$' + ++i); };
  const wrap = (q) => ({
    kind: 'postgres',
    exec: async (sql) => { await q.query(sql); },
    get: async (sql, p = []) => (await q.query(conv(sql), p)).rows[0] || null,
    run: async (sql, p = []) => (await q.query(conv(sql), p)).rowCount,
  });
  const self = {
    ...wrap(pool),
    async tx(fn) { const c = await pool.connect(); try { await c.query('BEGIN'); const r = await fn(wrap(c)); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); } },
    close: () => pool.end(),
  };
  return self;
}
