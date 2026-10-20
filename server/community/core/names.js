// Community display names (docs/community.md, "Display names"): what people are called in posts, chosen once, never
// their email or account name. 3 to 30 characters that, once accents are taken off, are plain a-z letters, digits,
// spaces, dots, hyphens and underscores, starting with a letter or digit. So letters that only look Latin can't stand in
// for others: another alphabet's ("Аutostacc", Cyrillic А), a dotless ı, small capitals, Latin alpha (security review,
// 2026-10-20). Refused: AutoStacc's reserved words, and names containing any creator's or project's name or address (or
// a held old name) unless the person is on that creator's team, also with digits read as letters ("Adm1n", "Supp0rt").
// Uniqueness is by the folded key.
import { all, first } from "../../lib/db.js";
import { RESERVED } from "../../lib/slugs.js";

// Checked on the name with its accents taken off, so "Zoë" passes and "Glıtches" (dotless ı) doesn't.
const SHAPE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{2,29}$/;
const unaccent = (s) => String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const EXTRA_RESERVED = ["admin", "administrator", "moderator", "mod", "staff", "support", "official", "deleteduser", "autostaccteam", "system"];

// Lowercase, accents and spacing dropped, "&" as "and": "Glitches & Stitches" and "glitches-and-stitches" are one key.
export const nameKey = (s) => unaccent(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
// Digits read as the letters they stand for, and "and" dropped, for comparing against protected names.
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b" };
const loose = (key) => key.replace(/[0-9]/g, (d) => LEET[d] || d).replace(/and/g, "");
const looseL = (key) => key.replace(/1/g, "l").replace(/[0-9]/g, (d) => LEET[d] || d).replace(/and/g, "");
const variants = (key) => [...new Set([key, loose(key), looseL(key)])];
// A protected name counts when it is the whole name, or (if long enough) any part of it.
const hits = (key, protectedKey) => variants(key).some((v) => v === protectedKey || v === loose(protectedKey) || (protectedKey.length >= 5 && (v.includes(protectedKey) || v.includes(loose(protectedKey)))));

const RESERVED_KEYS = new Set([...RESERVED, ...EXTRA_RESERVED].map(nameKey).filter(Boolean));

// null when the name may be used by this person, else a { code, message } to show.
export async function nameProblem(db, rawName, userId) {
  const name = String(rawName || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!SHAPE.test(unaccent(name))) return { code: "name_shape", message: "Use 3 to 30 letters, numbers, spaces, dots, hyphens or underscores, starting with a letter or number." };
  const key = nameKey(name);
  if (key.length < 3) return { code: "name_shape", message: "Use at least 3 letters or numbers." };
  if ([...RESERVED_KEYS].some((r) => variants(key).some((v) => v === r || (r.length >= 6 && v.includes(r))))) {
    return { code: "name_reserved", message: "That name is kept for AutoStacc. Pick another." };
  }
  // Any creator or project (and old names still held after a rename), unless it's the person's own team.
  const owners = await all(db, `SELECT c.id AS creatorId, c.name, c.slug FROM creators c
      UNION ALL SELECT p.creator_id, p.name, p.slug FROM projects p
      UNION ALL SELECT h.target_id, h.slug, h.slug FROM slug_holds h WHERE h.kind = 'creator'`);
  const clash = owners.filter((o) => [nameKey(o.name), nameKey(o.slug)].some((k) => k.length >= 3 && hits(key, k)));
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
