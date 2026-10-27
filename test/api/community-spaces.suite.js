// Communities anyone can start (test/api/community.test.js; the spaces feature, core/access.js isManager): an account
// with no creator starts one and is its founder; the cap, name checks and the username step hold, also when racing;
// the founder appoints moderators by username, who moderate but can't change settings or the team; project spaces get
// moderators who only moderate, appointed by the creator's owner; hand-over, step-down, archive and reopen; and a
// founder deleting their account passes the community to its longest-serving moderator.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";

export default (ctx) => describe("community: communities anyone can start (switched on)", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const tag = () => `${++n}${Date.now().toString(36).slice(-5)}`;
  const person = async ({ join = true } = {}) => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("csp"));
    const name = `Founder ${tag()}`;
    if (join) assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    return { c, user, name };
  };
  const clearLimits = () => db("DELETE FROM rateLimit WHERE key LIKE 'gs:community-start:%' OR key LIKE 'gs:community-pace:%'");
  const start = (c, body) => { clearLimits(); return c.post("/api/community/spaces", body); };

  test("an account with no creator starts a community with only a name; defaults fill the rest", async () => {
    const a = await person();
    const info = await a.c.get("/api/community/start");
    assert.equal(info.data.left, 3);
    const name = `Lofi Corner ${tag()}`;
    const made = await start(a.c, { name });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    const s = one(`SELECT * FROM community_spaces WHERE id = '${made.data.space.id}'`);
    assert.equal(s.kind, "community");
    assert.equal(s.official, 0);
    assert.equal(s.founder_user_id, a.user.id);
    assert.equal(one(`SELECT role FROM community_space_roles WHERE space_id = '${s.id}' AND user_id = '${a.user.id}'`).role, "founder");
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_channels WHERE space_id = '${s.id}'`).n, 3);
    assert.equal(one(`SELECT COUNT(*) AS n FROM creator_members WHERE user_id = '${a.user.id}'`).n, 0, "no creator was needed");
    assert.equal(made.data.space.manage, `${made.data.space.path}/manage`);
    assert.equal((await new Client(ctx.mock.url).get(made.data.space.path)).status, 200, "its page is public");
    const mine = await a.c.get(`/api/community/spaces/${s.id}/mine`);
    assert.equal(mine.data.role, "manager");
    assert.equal(one(`SELECT action FROM community_mod_log WHERE space_id = '${s.id}'`).action, "space.start");
  });

  test("starting one needs a signed-in member; names, channels and fields are checked", async () => {
    assert.equal((await new Client(ctx.mock.url).post("/api/community/spaces", { name: "Nobody Home" })).status, 401);
    const nomember = await person({ join: false });
    assert.equal((await start(nomember.c, { name: `No Name ${tag()}` })).data.error.code, "not_a_member");
    const a = await person();
    for (const [name, code] of [["AutoStacc Fans", "name_reserved"], ["Official Helpers", "name_reserved"], ["ab", "name_shape"], ["Аutostacc", "name_shape"], ["Manage", "name_reserved"]]) {
      assert.equal((await start(a.c, { name })).data.error.code, code, name);
    }
    const gs = await start(a.c, { name: "Glitches and Stitches" });
    assert.equal(gs.data.error.code, "name_taken", "a creator's project name, not theirs");
    const taken = `Drum Club ${tag()}`;
    assert.equal((await start(a.c, { name: taken })).status, 201);
    assert.equal((await start(a.c, { name: taken.toUpperCase() })).status, 409, "the same name");
    assert.equal((await start(a.c, { name: `Chan ${tag()}`, channels: ["Beats", "beats"] })).status, 400, "two channels alike");
    assert.equal((await start(a.c, { name: `Chan ${tag()}`, channels: ["manage"] })).status, 400, "a reserved channel");
    assert.equal((await start(a.c, { name: `Chan ${tag()}`, description: "x".repeat(501) })).status, 400);
    assert.equal((await start(a.c, { name: `Chan ${tag()}`, channels: "General" })).status, 400);
    const custom = await start(a.c, { name: `Synth Talk ${tag()}`, description: "  Modular and more  ", rules: "Be kind.", channels: ["Patches", "Gear"] });
    assert.equal(custom.status, 201);
    const s = one(`SELECT description, rules FROM community_spaces WHERE id = '${custom.data.space.id}'`);
    assert.deepEqual([s.description, s.rules], ["Modular and more", "Be kind."]);
  });

  test("the cap: 3 open communities per account, also when racing; archiving frees a place; reopening needs one", async () => {
    const a = await person();
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) => a.c.post("/api/community/spaces", { name: `Race Space ${tag()} ${i}` })));
    assert.equal(results.filter((r) => r.status === 201).length, 3, results.map((r) => r.status).join());
    assert.equal(results.filter((r) => r.status === 409).every((r) => r.data.error.code === "space_cap"), true);
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_spaces WHERE founder_user_id = '${a.user.id}'`).n, 3);
    const first = results.find((r) => r.status === 201).data.space.id;
    assert.equal((await a.c.req("PUT", `/api/community/spaces/${first}/archived`, { body: { archived: true } })).status, 200);
    assert.equal((await start(a.c, { name: `After Archive ${tag()}` })).status, 201, "a place was freed");
    const re = await a.c.req("PUT", `/api/community/spaces/${first}/archived`, { body: { archived: false } });
    assert.equal(re.data.error.code, "space_cap");
    const other = await person();
    assert.equal((await other.c.req("PUT", `/api/community/spaces/${first}/archived`, { body: { archived: false } })).status, 404, "not theirs");
  });

  test("the founder appoints a moderator who moderates but can't change settings or the team; members get nothing", async () => {
    const founder = await person();
    const mod = await person();
    const member = await person();
    const space = (await start(founder.c, { name: `Mod Space ${tag()}` })).data.space;
    const t = (p) => `/api/community/spaces/${space.id}${p}`;
    assert.equal((await member.c.post(t("/moderators"), { name: mod.name })).status, 404, "a member can't appoint");
    assert.equal((await founder.c.post(t("/moderators"), { name: "No Such Person Here" })).data.error.code, "no_such_member");
    assert.equal((await founder.c.post(t("/moderators"), { name: mod.name.toLowerCase() })).status, 201);
    assert.equal((await founder.c.post(t("/moderators"), { name: mod.name })).data.error.code, "already_team");
    const team = (await mod.c.get(t("/team"))).data;
    assert.deepEqual(team.team.map((r) => r.role), ["founder", "moderator"]);
    assert.equal(team.you.role, "moderator");
    assert.equal((await member.c.get(t("/team"))).status, 404);
    // Moderation: the moderator sees the team's queue; settings and the team are the founder's.
    assert.equal((await mod.c.get(t("/mine"))).data.role, "moderator");
    assert.equal((await mod.c.get(t("/self-promotion"))).status === 404, false, "can read the space's settings");
    assert.equal((await mod.c.req("PUT", t("/self-promotion"), { body: {} })).data.error.code, "managers_only");
    assert.equal((await mod.c.req("PUT", t("/slow-mode"), { body: { seconds: 30 } })).data.error.code, "managers_only");
    assert.equal((await mod.c.post(t("/moderators"), { name: member.name })).data.error.code, "managers_only");
    assert.equal((await founder.c.req("PUT", t("/slow-mode"), { body: { seconds: 30 } })).status, 200);
    // A moderator can't remove the founder or hand the space over.
    assert.equal((await mod.c.req("DELETE", t(`/moderators/${founder.user.id}`))).status, 404);
    assert.equal((await mod.c.post(t("/hand-over"), { userId: mod.user.id })).status, 404);
    assert.equal((await mod.c.req("PUT", t("/archived"), { body: { archived: true } })).status, 404);
    // Stepping down.
    assert.equal((await mod.c.req("DELETE", t(`/moderators/${mod.user.id}`))).status, 200);
    assert.equal((await mod.c.get(t("/team"))).status, 404);
    assert.deepEqual(db(`SELECT action FROM community_mod_log WHERE space_id = '${space.id}' ORDER BY at`)[0].map((r) => r.action).filter((a) => a.startsWith("team.")), ["team.add_moderator", "team.step_down"]);
  });

  test("hand-over goes only to a moderator, once; the old founder stays a moderator", async () => {
    const founder = await person();
    const mod = await person();
    const outsider = await person();
    const space = (await start(founder.c, { name: `Hand Space ${tag()}` })).data.space;
    const t = (p) => `/api/community/spaces/${space.id}${p}`;
    assert.equal((await founder.c.post(t("/hand-over"), { userId: outsider.user.id })).status, 400, "not a moderator");
    await founder.c.post(t("/moderators"), { name: mod.name });
    const both = await Promise.all([founder.c.post(t("/hand-over"), { userId: mod.user.id }), founder.c.post(t("/hand-over"), { userId: mod.user.id })]);
    assert.equal(both.filter((r) => r.status === 200).length >= 1, true);
    assert.equal(one(`SELECT founder_user_id AS f FROM community_spaces WHERE id = '${space.id}'`).f, mod.user.id);
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_space_roles WHERE space_id = '${space.id}' AND role = 'founder'`).n, 1);
    assert.equal(one(`SELECT role FROM community_space_roles WHERE space_id = '${space.id}' AND user_id = '${founder.user.id}'`).role, "moderator");
    assert.equal((await founder.c.req("PUT", t("/slow-mode"), { body: { seconds: 0 } })).data.error.code, "managers_only", "no longer manages it");
  });

  test("a project space gets moderators who only moderate, appointed by the creator's owner; nothing in the Studio", async () => {
    const owner = await person();
    const mod = await person();
    const slug = `cs${Date.now().toString(36)}${++n}`;
    const creator = (await owner.c.post("/api/studio/creators", { name: `Creator ${slug}`, slug })).data.creator;
    const proj = (await owner.c.post(`/api/studio/creators/${creator.id}/projects`, { name: `Project ${slug}`, slug: `proj${n}` })).data.project;
    db(`UPDATE projects SET published = 1 WHERE id = '${proj.id}'`);
    assert.equal((await owner.c.req("PUT", `/api/community/projects/${proj.id}/space`, { body: { on: true } })).status, 200);
    const space = one(`SELECT id FROM community_spaces WHERE project_id = '${proj.id}'`).id;
    assert.equal((await mod.c.post(`/api/community/spaces/${space}/moderators`, { name: mod.name })).status, 404);
    assert.equal((await owner.c.post(`/api/community/spaces/${space}/moderators`, { name: mod.name })).status, 201);
    assert.equal((await mod.c.get(`/api/community/spaces/${space}/mine`)).data.role, "moderator");
    assert.equal((await mod.c.get(`/api/community/spaces/${space}/team`)).data.managedBy, "creator");
    assert.equal((await mod.c.req("PUT", `/api/community/projects/${proj.id}/space`, { body: { on: false } })).status, 404, "not the project's switch");
    assert.equal((await mod.c.get(`/api/studio/creators/${creator.id}/team`)).status, 404, "nothing in the Studio");
    assert.equal((await mod.c.post(`/api/community/spaces/${space}/hand-over`, { userId: mod.user.id })).status, 404, "no founder to hand over");
  });

  test("a founder deleting their account hands the community to the longest-serving moderator, or archives it", async () => {
    const founder = await person();
    const first = await person();
    const second = await person();
    const kept = (await start(founder.c, { name: `Kept Space ${tag()}` })).data.space;
    const alone = (await start(founder.c, { name: `Alone Space ${tag()}` })).data.space;
    await founder.c.post(`/api/community/spaces/${kept.id}/moderators`, { name: first.name });
    await founder.c.post(`/api/community/spaces/${kept.id}/moderators`, { name: second.name });
    db(`UPDATE community_space_roles SET created_at = '2000-01-01T00:00:00.000Z' WHERE space_id = '${kept.id}' AND user_id = '${first.user.id}'`);
    const del = await founder.c.req("POST", "/api/account/delete", { body: { password: "correct-horse-battery", confirm: founder.user.email } });
    assert.ok([200, 204].includes(del.status), JSON.stringify(del.data));
    assert.equal(one(`SELECT founder_user_id AS f FROM community_spaces WHERE id = '${kept.id}'`).f, first.user.id);
    assert.equal(one(`SELECT role FROM community_space_roles WHERE space_id = '${kept.id}' AND user_id = '${first.user.id}'`).role, "founder");
    assert.equal(one(`SELECT role FROM community_space_roles WHERE space_id = '${kept.id}' AND user_id = '${second.user.id}'`).role, "moderator");
    const s = one(`SELECT state, state_reason AS r, founder_user_id AS f FROM community_spaces WHERE id = '${alone.id}'`);
    assert.deepEqual([s.state, s.r, s.f], ["archived", "founder_left", null]);
  });
});
