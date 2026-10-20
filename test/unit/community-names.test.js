// Community display names (server/community/core/names.js) and thread addresses (posting.js slugify): the allowed shape,
// Latin letters only so other alphabets' look-alikes can't impersonate, reserved words, creator and project names
// unless they're the person's own, and addresses made only of what /community/t/<id>-<slug> accepts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nameProblem, nameKey } from "../../server/community/core/names.js";
import { slugify } from "../../server/community/core/posting.js";

// A stand-in D1 with one creator ("Night Owl" / night-owl) and its project, and an optional membership.
const db = ({ member = false, taken = false } = {}) => ({
  prepare: (sql) => ({
    bind: () => ({
      all: async () => ({ results: /FROM creators/.test(sql) ? [{ creatorId: "cr_owl", name: "Night Owl", slug: "night-owl" }, { creatorId: "cr_owl", name: "Owl Tapes", slug: "owl-tapes" }]
        : /creator_members/.test(sql) && member ? [{ creator_id: "cr_owl" }] : [] }),
      first: async () => (taken && /community_members/.test(sql) ? { user_id: "someone" } : null)
    })
  })
});

test("the shape: 3 to 30 Latin letters, digits and a few separators", async () => {
  assert.equal(await nameProblem(db(), "Beat Maker_92", "u1"), null);
  assert.equal(await nameProblem(db(), "Zoë", "u1"), null);
  for (const bad of ["ab", "x".repeat(31), " -lead", "<b>bold</b>", "emoji 🎧", "name‮evil"]) {
    assert.equal((await nameProblem(db(), bad, "u1")).code, "name_shape", bad);
  }
});

test("other alphabets are refused, so look-alikes can't pass for a name", async () => {
  assert.equal((await nameProblem(db(), "Аutostacc", "u1")).code, "name_shape", "Cyrillic А");
  assert.equal((await nameProblem(db(), "Аdmin", "u1")).code, "name_shape");
});

test("AutoStacc's words, and names containing them, are kept", async () => {
  for (const n of ["AutoStacc", "auto stacc", "Official", "Moderator", "Real AutoStacc Team", "deleted user"]) {
    assert.equal((await nameProblem(db(), n, "u1")).code, "name_reserved", n);
  }
});

test("a creator's or project's name is refused unless it's your own team", async () => {
  assert.equal((await nameProblem(db(), "Night Owl", "u1")).code, "name_taken");
  assert.equal((await nameProblem(db(), "owl-tapes", "u1")).code, "name_taken");
  assert.equal(await nameProblem(db({ member: true }), "Night Owl", "u1"), null);
  assert.equal((await nameProblem(db({ taken: true }), "Someone Else", "u1")).code, "name_taken");
});

test("the folded key ignores case, accents, spacing and & vs and", () => {
  assert.equal(nameKey("Glitches & Stitches"), nameKey("glitches-and-stitches"));
  assert.equal(nameKey("Zoë"), "zoe");
});

test("thread addresses use only lowercase letters, digits and hyphens", () => {
  assert.equal(slugify("How do I export stems?"), "how-do-i-export-stems");
  assert.equal(slugify("Déjà vu & Ableton 12!"), "deja-vu-and-ableton-12");
  assert.equal(slugify("🎧🎧🎧"), "thread");
  assert.match(slugify("x".repeat(200)), /^x{1,60}$/);
  assert.match(slugify("a ".repeat(100)), /^[a-z0-9]+(-[a-z0-9]+)*$/);
});
