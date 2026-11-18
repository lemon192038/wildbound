// Throttled, de-duplicated diagnostics. The same key is printed once, then only counted; a summary line is printed
// at most every 10 s while it keeps happening. Never logs secrets/personal data (callers pass ids, not tokens).
//   log.warn('chunk-fail', 'chunk 3,4 failed', err)   log.error(...)   log.entries() → [{key, level, count, last, msg}]
const seen = new Map();
function emit(level, key, msg, data) {
  const now = Date.now(); let e = seen.get(key);
  if (!e) { e = { key, level, count: 0, first: now, last: 0, printed: 0, msg }; seen.set(key, e); }
  e.count++; e.last = now; e.msg = msg;
  if (e.count === 1 || now - e.printed > 10000) {
    e.printed = now;
    const line = `[wildbound:${key}] ${msg}${e.count > 1 ? ` (×${e.count})` : ''}`;
    (level === 'error' ? console.error : console.warn)(line, data ?? '');
  }
}
export const log = {
  warn: (key, msg, data) => emit('warn', key, msg, data),
  error: (key, msg, data) => emit('error', key, msg, data),
  entries: () => [...seen.values()].map(({ key, level, count, last, msg }) => ({ key, level, count, last, msg })),
};
if (typeof window !== 'undefined') window.__wbLog = log;
