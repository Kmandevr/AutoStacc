// Per-account exceptions to the communities cap and what waits on a space's team (test/api/community.test.js; the
// spaces feature's caps.js, GET /api/community/my-spaces "waiting"): only an admin sets or removes an exception, by
// username, audited; it lets that account start more (or fewer) than the site-wide number, also when reopening; it
// goes with the account; and my-spaces counts open reports (one per take or post) and held posts for each space.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Client, verifiedUser, sqlAll, unique } from "../support/client.js";
import { freshAdmin } from "../support/flows.js";

export default (ctx) => describe("community: per-account caps and what waits on a team", () => {
  const db = (s) => sqlAll(ctx.mock.stateDir, s);
  const one = (s) => db(s)[0][0];
  let n = 0;
  const tag = () => `${++n}${Date.now().toString(36).slice(-5)}`;
  const person = async () => {
    const c = new Client(ctx.mock.url);
    const user = await verifiedUser(c, unique("ccap"));
    const name = `Capper ${tag()}`;
    assert.equal((await c.req("PUT", "/api/community/me", { body: { displayName: name, ageConfirmed: true } })).status, 201);
    return { c, user, name };
  };
  const start = (c, name = `Cap Space ${tag()}`) => {
    db("DELETE FROM rateLimit WHERE key LIKE 'gs:community-start:%'");
    return c.post("/api/community/spaces", { name });
  };
  const CAPS = "/api/admin/community/space-caps";

  test("only an admin sets an exception, by username; it raises or lowers that account's number; removing it puts them back", async () => {
    const a = await person();
    assert.equal((await a.c.get(CAPS)).status, 404, "customers don't see the admin API");
    assert.equal((await a.c.req("PUT", CAPS, { body: { name: a.name, cap: 9 } })).status, 404);
    const admin = await freshAdmin(ctx.mock.url);
    assert.equal((await admin.req("PUT", CAPS, { body: { name: "Nobody Called This", cap: 5 } })).data.error.code, "no_such_member");
    for (const cap of [-1, 100, 2.5, "5"]) assert.equal((await admin.req("PUT", CAPS, { body: { name: a.name, cap } })).status, 400, String(cap));
    const set = await admin.req("PUT", CAPS, { body: { name: a.name.toUpperCase(), cap: 5, note: "Runs a label's  spaces" } });
    assert.equal(set.status, 200, JSON.stringify(set.data));
    assert.deepEqual([set.data.exception.cap, set.data.exception.note], [5, "Runs a label's spaces"]);
    assert.equal((await a.c.get("/api/community/start")).data.left, 5);
    for (let i = 0; i < 5; i++) assert.equal((await start(a.c)).status, 201, `community ${i + 1} of 5`);
    assert.equal((await start(a.c)).data.error.code, "space_cap");
    const listed = (await admin.get(CAPS)).data;
    assert.equal(listed.cap, 3);
    const row = listed.exceptions.find((x) => x.userId === a.user.id);
    assert.deepEqual([row.name, row.cap, row.owned], [a.name, 5, 5]);
    assert.equal(one(`SELECT COUNT(*) AS n FROM admin_audit WHERE action = 'community.space_cap_set' AND target_id = '${a.user.id}'`).n, 1);
    // Lowering it stops new ones but leaves the five running; reopening an archived one needs a place too.
    await admin.req("PUT", CAPS, { body: { name: a.name, cap: 0 } });
    assert.equal((await a.c.get("/api/community/start")).data.left, 0);
    assert.equal((await admin.req("DELETE", `${CAPS}/${a.user.id}`)).status, 200);
    assert.equal((await admin.req("DELETE", `${CAPS}/${a.user.id}`)).status, 404, "gone already");
    assert.equal((await a.c.get("/api/community/start")).data.cap, 3, "back on the site-wide number");
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_spaces WHERE founder_user_id = '${a.user.id}' AND state = 'open'`).n, 5, "running ones stay");
  });

  test("an exception goes with the account and is in its data download", async () => {
    const a = await person();
    const admin = await freshAdmin(ctx.mock.url);
    await admin.req("PUT", CAPS, { body: { name: a.name, cap: 7 } });
    const mine = await a.c.post("/api/account/export", {});
    assert.equal(mine.status, 200);
    assert.equal(JSON.stringify(mine.data).includes('"spaceCap":{"cap":7'), true, "the exception is in the download");
    const del = await a.c.req("POST", "/api/account/delete", { body: { password: "correct-horse-battery", confirm: a.user.email } });
    assert.ok([200, 204].includes(del.status), JSON.stringify(del.data));
    assert.equal(one(`SELECT COUNT(*) AS n FROM community_space_caps WHERE user_id = '${a.user.id}'`).n, 0);
  });

  test("my-spaces says how much waits on each team: open reports once per post, and held posts", async () => {
    const a = await person();
    const space = (await start(a.c)).data.space;
    const other = (await start(a.c)).data.space;
    const at = new Date().toISOString();
    const rep = (id, target, status = "open", route = "space") => db(`INSERT INTO community_reports (id, target_type, target_id, space_id, reason, route, status, created_at)
      VALUES ('${id}', 'post', '${target}', '${space.id}', 'rules', '${route}', '${status}', '${at}')`);
    rep(`rep_a${tag()}`, "pst_one");
    rep(`rep_b${tag()}`, "pst_one");
    rep(`rep_c${tag()}`, "pst_two");
    rep(`rep_d${tag()}`, "pst_three", "dismissed");
    rep(`rep_e${tag()}`, "pst_four", "open", "autostacc");
    db(`INSERT INTO community_holds (target_type, target_id, space_id, rule, reason, created_at) VALUES ('post', 'pst_held${tag()}', '${space.id}', 'links', 'A link', '${at}')`);
    const spaces = (await a.c.get("/api/community/my-spaces")).data.spaces;
    assert.equal(spaces.find((s) => s.id === space.id).waiting, 3, "two reported posts and one held post");
    assert.equal(spaces.find((s) => s.id === other.id).waiting, 0);
  });
});
