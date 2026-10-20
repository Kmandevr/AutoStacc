// Community display names (docs/community.md, "Display names"): what people are called in posts, chosen once, never
// their email or account name. 3 to 30 characters of Latin letters (accents allowed), digits, spaces, dots, hyphens and
// underscores, starting with a letter or digit. Latin only, so letters from other alphabets can't stand in for look-alikes
// ("Аutostacc" with a Cyrillic А). Refused: AutoStacc's reserved words, and the name or address of any creator or project
// (or a held old name) unless the person is on that creator's team. Uniqueness is by the folded key.
import { all, first } from "../../lib/db.js";
import { RESERVED } from "../../lib/slugs.js";

const SHAPE = /^[\p{Script=Latin}0-9][\p{Script=Latin}0-9 ._-]{2,29}$/u;
const EXTRA_RESERVED = ["admin", "administrator", "moderator", "mod", "staff", "support", "official", "deleteduser", "autostaccteam", "system"];

// Lowercase, accents and spacing dropped, "&" as "and": "Glitches & Stitches" and "glitches-and-stitches" are one key.
export const nameKey = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

const RESERVED_KEYS = new Set([...RESERVED, ...EXTRA_RESERVED].map(nameKey).filter(Boolean));

// null when the name may be used by this person, else a { code, message } to show.
export async function nameProblem(db, rawName, userId) {
  const name = String(rawName || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!SHAPE.test(name)) return { code: "name_shape", message: "Use 3 to 30 letters, numbers, spaces, dots, hyphens or underscores, starting with a letter or number." };
  const key = nameKey(name);
  if (key.length < 3) return { code: "name_shape", message: "Use at least 3 letters or numbers." };
  if ([...RESERVED_KEYS].some((r) => key === r || (r.length >= 6 && key.includes(r)))) {
    return { code: "name_reserved", message: "That name is kept for AutoStacc. Pick another." };
  }
  // Any creator or project (and old names still held after a rename), unless it's the person's own team.
  const owners = await all(db, `SELECT c.id AS creatorId, c.name, c.slug FROM creators c
      UNION ALL SELECT p.creator_id, p.name, p.slug FROM projects p
      UNION ALL SELECT h.target_id, h.slug, h.slug FROM slug_holds h WHERE h.kind = 'creator'`);
  const clash = owners.filter((o) => nameKey(o.name) === key || nameKey(o.slug) === key);
  if (clash.length) {
    const mine = await all(db, `SELECT creator_id FROM creator_members WHERE user_id = ?`, userId);
    const own = new Set(mine.map((m) => m.creator_id));
    if (clash.some((o) => !own.has(o.creatorId))) return { code: "name_taken", message: "That's the name of a creator or project on AutoStacc. Pick another." };
  }
  const taken = await first(db, "SELECT user_id FROM community_members WHERE name_key = ? AND user_id <> ?", key, userId);
  if (taken) return { code: "name_taken", message: "Someone already uses that name. Pick another." };
  return null;
}

export const cleanName = (raw) => String(raw || "").normalize("NFC").replace(/\s+/g, " ").trim();
