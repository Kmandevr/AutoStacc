// Thin D1 helpers: one-line queries, ids, timestamps and money conversion. No ORM; SQL stays visible in each module.

export const all = async (db, sql, ...params) => (await db.prepare(sql).bind(...params).all()).results || [];
export const first = (db, sql, ...params) => db.prepare(sql).bind(...params).first();
export const run = (db, sql, ...params) => db.prepare(sql).bind(...params).run();
export const stmt = (db, sql, ...params) => db.prepare(sql).bind(...params);

// ISO-8601 UTC timestamps, comparable as text.
export const now = () => new Date().toISOString();

// Unguessable ids: prefix + 20 random bytes in base32 (never sequential, so ids can't be enumerated).
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
export function randomToken(bytes = 20) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export const newId = (prefix) => `${prefix}_${randomToken(16)}`;

export const toCents = (amount) => Math.round(Number(amount) * 100);

export const parseJson = (text, fallback) => {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
};

// Makes a D1 batch conditional: as its first statement, this breaks a CHECK (rolling the whole batch back) unless
// `condition` (trusted SQL with ? params) holds. isGuardFailure tells that failure from any other.
export const guardStmt = (db, condition, ...params) => stmt(db, `INSERT INTO batch_guard (ok) SELECT 0 WHERE NOT (${condition})`, ...params);
export const isGuardFailure = (e) => /CHECK constraint failed/i.test(String((e && e.message) || e));
