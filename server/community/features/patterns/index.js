// Pattern rules (owner, 2026-10-20; docs/community.md, "Automatic moderation"): "if a post matches, then hold it or
// refuse it", built from a form, no code (like Reddit's AutoModerator). A rule looks at the title, the body or either
// and tests: contains some text, starts with some text, has a link, is mostly capitals, or is shorter than a number of
// characters. Matching uses plain text comparison only, never an author- or team-written expression, so no rule can
// be made to run slowly. Team members' posts skip the rules. Its own switch (community.patterns).
import { json, readJson, fail, str } from "../../../lib/http.js";
import { all, first, run, newId, now } from "../../../lib/db.js";
import { teamSpace } from "../../core/team-space.js";
import { hasLink } from "../../core/format.js";
import { fold } from "../../core/wording.js";

const FIELDS = ["title", "body", "any"];
const TESTS = ["contains", "starts", "link", "caps", "short"];
const ACTIONS = ["hold", "refuse"];
const MAX_RULES = 30;

export function matches(rule, { title = "", body = "" }) {
  const texts = rule.field === "title" ? [title] : rule.field === "body" ? [body] : [title, body];
  return texts.some((t) => {
    if (rule.test === "contains") return fold(t).includes(fold(rule.value));
    if (rule.test === "starts") return fold(t).trimStart().startsWith(fold(rule.value));
    if (rule.test === "link") return hasLink(t);
    if (rule.test === "caps") {
      const letters = [...t].filter((c) => c.toLowerCase() !== c.toUpperCase());
      return letters.length >= 12 && letters.filter((c) => c === c.toUpperCase()).length / letters.length > 0.7;
    }
    return t.trim().length < Number(rule.value);
  });
}

async function postCheck(app, { space, title, body, team }) {
  if (team) return null;
  const rules = await all(app.db, "SELECT name, field, test, value, action FROM community_pattern_rules WHERE space_id = ? AND enabled = 1 ORDER BY created_at LIMIT ?", space.id, MAX_RULES);
  const hit = rules.find((r) => matches(r, { title, body }));
  if (!hit) return null;
  if (hit.action === "refuse") fail(403, "rule_refused", `This space doesn't allow that kind of post (${hit.name}).`);
  return { hold: { rule: "pattern", reason: `It matched the space's rule "${hit.name}", so the team looks at it first.` } };
}

const list = async (app, { spaceId }) => {
  const { space } = await teamSpace(app, spaceId);
  return json({ rules: await all(app.db, "SELECT id, name, field, test, value, action, enabled FROM community_pattern_rules WHERE space_id = ? ORDER BY created_at", space.id) }, 200, { "Cache-Control": "no-store" });
};

async function add(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-patterns" });
  const b = await readJson(app.request);
  const name = str(b.name, "name", { max: 60 }).trim();
  if (name.length < 2) fail(400, "invalid_field", "Give the rule a short name.", { field: "name" });
  const pick = (v, list, field) => (list.includes(v) ? v : fail(400, "invalid_field", "Pick one of the choices.", { field }));
  const test = pick(b.test, TESTS, "test");
  let value = "";
  if (test === "contains" || test === "starts") {
    value = str(b.value, "value", { max: 100 }).trim();
    if (value.length < 2) fail(400, "invalid_field", "Some text to look for, at least two characters.", { field: "value" });
  } else if (test === "short") {
    const n = Number(b.value);
    if (!Number.isInteger(n) || n < 2 || n > 500) fail(400, "invalid_field", "A number of characters from 2 to 500.", { field: "value" });
    value = String(n);
  }
  if ((await first(app.db, "SELECT COUNT(*) AS n FROM community_pattern_rules WHERE space_id = ?", space.id)).n >= MAX_RULES) fail(409, "too_many", `A space can have up to ${MAX_RULES} rules.`);
  await run(app.db, `INSERT INTO community_pattern_rules (id, space_id, name, field, test, value, action, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId("cpr"), space.id, name, pick(b.field, FIELDS, "field"), test, value, pick(b.action, ACTIONS, "action"), now());
  return json({ ok: true }, 201);
}

async function toggle(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-patterns" });
  const b = await readJson(app.request);
  const r = await run(app.db, "UPDATE community_pattern_rules SET enabled = ? WHERE id = ? AND space_id = ?", b.enabled ? 1 : 0, str(b.id, "id", { max: 80 }), space.id);
  if (!r.meta.changes) fail(404, "not_found", "That rule isn't there.");
  return json({ ok: true });
}

async function remove(app, { spaceId }) {
  const { space } = await teamSpace(app, spaceId, { write: true, name: "community-patterns" });
  const r = await run(app.db, "DELETE FROM community_pattern_rules WHERE id = ? AND space_id = ?", str((await readJson(app.request)).id, "id", { max: 80 }), space.id);
  if (!r.meta.changes) fail(404, "not_found", "That rule isn't there.");
  return json({ ok: true });
}

export default {
  name: "patterns",
  switch: "community.patterns",
  checks: { post: postCheck },
  routes: [
    ["GET", "/api/community/spaces/:spaceId/pattern-rules", list],
    ["POST", "/api/community/spaces/:spaceId/pattern-rules", add],
    ["PATCH", "/api/community/spaces/:spaceId/pattern-rules", toggle],
    ["DELETE", "/api/community/spaces/:spaceId/pattern-rules", remove]
  ]
};
